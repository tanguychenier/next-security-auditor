import type { VulnerabilityFinder } from '../ports/vulnerability-finder.js'
import type { Finding } from '../../domain/value-objects/finding.js'
import type { ProofPlan } from '../../domain/value-objects/proof-plan.js'
import type { SurfaceEntry } from '../../domain/value-objects/surface-entry.js'

/**
 * How far apart two reports of the same flaw may sit and still be one.
 *
 * MEASURED ON A LIVE RUN: two passes named the same missing ownership check at
 * lines 16 and 17, one pointing at the signature and the other at the body. A
 * strict line key turned one flaw into two entries in the report.
 */
const SAME_FLAW_WITHIN_LINES = 5

const alreadyFound = (found: readonly Finding[], candidate: Finding): boolean =>
  found.some(
    (seen) =>
      seen.kind.id === candidate.kind.id &&
      seen.file === candidate.file &&
      Math.abs(seen.line - candidate.line) <= SAME_FLAW_WITHIN_LINES,
  )

/**
 * Passes over the same code until it stops yielding anything new.
 *
 * THE SAME CODE DOES NOT ALWAYS GIVE THE SAME ANSWER. Measured on a live run:
 * one pass over a handler with no authorization check reported a clean file, and
 * the next reported two flaws. A single pass is a coin toss on recall, and a
 * tool that misses the flaw it exists to find is worse than no tool at all.
 *
 * Passing again is the only honest fix, and it is affordable because the hunt
 * runs on a subscription: the missing recall is paid in seconds, not in euros.
 * Whoever pays per token sets the passes to one and keeps today's behaviour.
 */
export class PersistentHunt implements VulnerabilityFinder {
  constructor(
    private readonly finder: VulnerabilityFinder,
    private readonly maximumPasses = 4,
    private readonly quietPassesBeforeStopping = 2,
  ) {}

  async suspect(entry: SurfaceEntry, source: string): Promise<Finding[]> {
    const found: Finding[] = []
    let quiet = 0

    for (let pass = 0; pass < this.maximumPasses; pass += 1) {
      let fresh = 0
      for (const finding of await this.finder.suspect(entry, source)) {
        if (alreadyFound(found, finding)) continue
        found.push(finding)
        fresh += 1
      }
      quiet = fresh === 0 ? quiet + 1 : 0
      if (quiet >= this.quietPassesBeforeStopping) break
    }

    return found
  }

  async planProof(finding: Finding, entry: SurfaceEntry, source: string): Promise<ProofPlan | undefined> {
    return this.finder.planProof(finding, entry, source)
  }
}
