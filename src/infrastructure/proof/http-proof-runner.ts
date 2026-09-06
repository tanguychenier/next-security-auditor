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
 */
export class HttpProofRunner implements ProofRunner {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs = 10_000,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async run(plan: ProofPlan): Promise<Proof> {
    const target = new URL(plan.path, this.baseUrl).toString()
    const request = `${plan.method} ${target}`
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
