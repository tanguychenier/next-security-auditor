import type { ProofRunner } from '../ports/proof-runner.js'
import type { AcceptedProof } from '../../domain/policies/accepted-findings.js'
import { ProofOutcome } from '../../domain/value-objects/proof.js'

export interface RecheckResult {
  readonly stillOpen: readonly AcceptedProof[]
  readonly closed: readonly AcceptedProof[]
  readonly unknown: readonly AcceptedProof[]
}

/**
 * Replays what was already proved, to answer one question: did the fix work?
 *
 * Every other way of answering runs the whole hunt again, at the same price and
 * the same wait, and then asks a model whether it still thinks so. The requests
 * that proved each flaw are already written down, so the honest answer is a
 * replay: no model, no bill, no waiting, and the same verdict twice.
 */
export const replay = async (
  prover: ProofRunner,
  accepted: readonly AcceptedProof[],
): Promise<RecheckResult> => {
  const stillOpen: AcceptedProof[] = []
  const closed: AcceptedProof[] = []
  const unknown: AcceptedProof[] = []

  for (const entry of accepted) {
    if (entry.plan === undefined) {
      // Accepted before the baseline carried requests, or written by hand.
      // Nothing to replay, and claiming it fixed would be a lie.
      unknown.push(entry)
      continue
    }

    const proof = await prover.run(entry.plan)

    // THE SERVER WAS DOWN IS NOT THE FLAW IS GONE. Counting a proof that could
    // not run as closed would let somebody ship by turning their app off.
    if (proof.outcome === ProofOutcome.Reproduced) stillOpen.push(entry)
    else if (proof.outcome === ProofOutcome.NotReproduced) closed.push(entry)
    else unknown.push(entry)
  }

  return { stillOpen, closed, unknown }
}

/** While anything is still open, the answer to "did my fix work" is no. */
export const stillFailing = (result: RecheckResult): boolean => result.stillOpen.length > 0
