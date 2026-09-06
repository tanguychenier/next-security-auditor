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
  onePerHole(audited.filter((entry) => entry.proof.reproduced))
    .toSorted(
      (left, right) =>
        worstFirst(left.finding.severity, right.finding.severity) ||
        left.finding.file.localeCompare(right.finding.file) ||
        left.finding.line - right.finding.line ||
        left.finding.kind.id.localeCompare(right.finding.kind.id),
    )

/**
 * One line per hole, not one per sentence the model wrote.
 *
 * MEASURED ON A REAL RUN: six proven findings, four of which described the same
 * unguarded route — "no ownership check", "ids can be enumerated", "the IBAN
 * leaks". A reader sees four holes, fixes the first, and finds three still
 * there tomorrow.
 *
 * SAME RULE, SAME FILE, SAME REQUEST IS ONE HOLE. What separates those four is
 * the line the model chose to point at, and that line is not a fact about the
 * application: the request is. Two different rules stay apart, because each one
 * needs its own fix.
 *
 * THE WORST ONE SURVIVES, so collapsing never understates what was found. A
 * finding with no plan is never collapsed: without a request there is nothing
 * saying two of them are the same.
 */
const onePerHole = (reproduced: readonly AuditedFinding[]): AuditedFinding[] => {
  const best = new Map<string, AuditedFinding>()
  const loose: AuditedFinding[] = []

  for (const entry of reproduced) {
    if (entry.plan === undefined) {
      loose.push(entry)
      continue
    }
    const hole = [entry.finding.kind.id, entry.finding.file, entry.plan.method, entry.plan.path].join('\u0000')
    const seen = best.get(hole)
    if (seen === undefined || worstFirst(entry.finding.severity, seen.finding.severity) < 0) {
      best.set(hole, entry)
    }
  }

  return [...best.values(), ...loose]
}
