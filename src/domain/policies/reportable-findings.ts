import type { Finding } from '../value-objects/finding.js'
import type { Proof } from '../value-objects/proof.js'
import { worstFirst } from '../value-objects/severity.js'

export interface AuditedFinding {
  readonly finding: Finding
  readonly proof: Proof
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
export const reportableFindings = (audited: readonly AuditedFinding[]): AuditedFinding[] =>
  audited
    .filter((entry) => entry.proof.reproduced)
    .toSorted((left, right) => worstFirst(left.finding.severity, right.finding.severity))
