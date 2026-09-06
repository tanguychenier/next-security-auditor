import type { ProofRunner } from '../ports/proof-runner.js'
import { Proof, ProofOutcome } from '../../domain/value-objects/proof.js'
import type { ProofPlan } from '../../domain/value-objects/proof-plan.js'

/** Below this, a repetition shows nothing a single request did not. */
const FEWEST_USEFUL = 5

/** Above this, it stops being a proof and becomes an outage. */
const MOST_ALLOWED = 100

/**
 * How many identical requests a flaw needs, bounded at both ends.
 *
 * ONE POST ANSWERING 200 SAYS NOTHING ABOUT THE FIFTY-FIRST, and a proof is
 * still a real attack: a thousand requests is a denial of service whoever asked
 * for it.
 */
export const boundedRepeat = (times: number): number =>
  Math.min(MOST_ALLOWED, Math.max(FEWEST_USEFUL, times))

/**
 * Sends a run of requests and reports whether anything ever stopped it.
 *
 * A MISSING LIMIT IS SHOWN WHEN EVERY REQUEST WAS ACCEPTED. The first refusal
 * ends the run: the application defended itself, which is the whole thing being
 * checked, and sending the rest would only be rude.
 */
export const runSequence = async (prover: ProofRunner, plan: ProofPlan, times: number): Promise<Proof> => {
  const total = boundedRepeat(times)
  const request = `${plan.method} ${plan.path}, ${total} times`
  let sent = 0

  for (let attempt = 0; attempt < total; attempt += 1) {
    const proof = await prover.run(plan)
    sent += 1

    if (proof.outcome === ProofOutcome.NotRunnable) {
      return Proof.create({
        outcome: ProofOutcome.NotRunnable,
        request,
        expectation: plan.expectation,
        observed: `the run stopped after ${sent}: ${proof.observed}`,
      })
    }

    if (proof.outcome === ProofOutcome.NotReproduced) {
      return Proof.create({
        outcome: ProofOutcome.NotReproduced,
        request,
        expectation: plan.expectation,
        observed: `refused at request ${sent} of ${total}: ${proof.observed}`,
      })
    }
  }

  return Proof.create({
    outcome: ProofOutcome.Reproduced,
    request,
    expectation: plan.expectation,
    observed: `${sent} of ${total} accepted, nothing ever refused`,
  })
}
