import type { Finding } from '../value-objects/finding.js'
import type { Proof } from '../value-objects/proof.js'
import type { ProofPlan } from '../value-objects/proof-plan.js'
import { worstFirst } from '../value-objects/severity.js'

export interface AuditedFinding {
  readonly finding: Finding
  readonly proof: Proof
  /** The request that proved it, so a later run can replay it for free. */
  readonly plan?: ProofPlan
}

/**
 * Keeps only what was proven, worst first.
 *
 * WHY THIS LIVES IN THE DOMAIN. Put it in the reporter and the next output
 * format forgets it; put it in the use case and a future entry point skips it.
 * The rule that defines the product belongs where nothing can route around it.
 *
 * A discarded finding is not an error and is not logged as one: a proof that
 * did not reproduce is the tool working, not failing.
 */
/**
 * THE ORDER IS THE SAME EVERY RUN, and that is not cosmetic: a report whose
 * lines move cannot be diffed against yesterday, so nobody can see what a
 * change introduced. Severity alone would let two equal findings swap places.
 */
export const reportableFindings = (audited: readonly AuditedFinding[]): AuditedFinding[] =>
  audited
    .filter((entry) => entry.proof.reproduced)
    .toSorted(
      (left, right) =>
        worstFirst(left.finding.severity, right.finding.severity) ||
        left.finding.file.localeCompare(right.finding.file) ||
        left.finding.line - right.finding.line ||
        left.finding.kind.id.localeCompare(right.finding.kind.id),
    )
