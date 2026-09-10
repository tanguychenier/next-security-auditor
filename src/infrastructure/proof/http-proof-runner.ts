import type { ProofRunner } from '../../application/ports/proof-runner.js'
import type { ProofPlan } from '../../domain/value-objects/proof-plan.js'
import { Proof, ProofOutcome } from '../../domain/value-objects/proof.js'

/**
 * Sends the proof request to a running application and reports what came back.
 *
 * IT NEVER FOLLOWS REDIRECTS. A 302 to a login page is the application
 * defending itself; following it would land on a 200 and turn a correct
 * behaviour into a reported vulnerability.
 *
 * A network error is NotRunnable, never NotReproduced. "The server was down"
 * and "the server refused the attack" are different facts, and collapsing them
 * would let a broken setup look like a clean bill of health.
 *
 * IT ONLY EVER REACHES THE TARGET. The path comes from a model reading a
 * repository, so it is input, not instruction: a plan that resolves to another
 * host is refused rather than sent.
 */
export class HttpProofRunner implements ProofRunner {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs = 10_000,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async run(plan: ProofPlan): Promise<Proof> {
    const base = new URL(this.baseUrl)
    const resolved = new URL(plan.path, base)
    const target = resolved.toString()
    const request = `${plan.method} ${target}`

    // THE PLAN SAYS WHAT TO SEND, NEVER WHERE. `new URL(path, base)` drops the
    // base the moment the path is absolute, so a model answering
    // "http://169.254.169.254/latest/meta-data/" would move the attack off the
    // server the operator named and onto one they did not. The target is chosen
    // once, on the command line, where it is checked.
    if (resolved.protocol !== base.protocol || resolved.host !== base.host) {
      return Proof.create({
        outcome: ProofOutcome.NotRunnable,
        request: `none: ${plan.method} ${target} was refused`,
        expectation: plan.expectation,
        observed:
          `the plan points at ${resolved.protocol}//${resolved.host}, which is not the target ` +
          `${base.protocol}//${base.host}: a proof is sent at the application under test and nowhere else`,
      })
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await this.fetchImpl(target, {
        method: plan.method,
        headers: plan.headers ?? {},
        ...(plan.body === undefined ? {} : { body: plan.body }),
        redirect: 'manual',
        signal: controller.signal,
      })
      const body = await response.text()
      const reproduced =
        plan.reproducesOnStatus.includes(response.status) ||
        (plan.reproducesOnBodyContaining !== undefined &&
          plan.reproducesOnBodyContaining.length > 0 &&
          body.includes(plan.reproducesOnBodyContaining))
      return Proof.create({
        outcome: reproduced ? ProofOutcome.Reproduced : ProofOutcome.NotReproduced,
        request,
        expectation: plan.expectation,
        observed: `${response.status} ${response.statusText}, ${body.length} bytes`,
      })
    } catch (error) {
      return Proof.create({
        outcome: ProofOutcome.NotRunnable,
        request,
        expectation: plan.expectation,
        observed: `the request never completed: ${(error as Error).message}`,
      })
    } finally {
      clearTimeout(timer)
    }
  }
}
