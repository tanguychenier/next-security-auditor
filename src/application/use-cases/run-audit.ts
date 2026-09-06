import type { ProjectReader } from '../ports/project-reader.js'
import type { ProofRunner } from '../ports/proof-runner.js'
import type { VulnerabilityFinder } from '../ports/vulnerability-finder.js'
import { Proof, ProofOutcome } from '../../domain/value-objects/proof.js'
import { reportableFindings, type AuditedFinding } from '../../domain/policies/reportable-findings.js'

export interface AuditReport {
  readonly surfaceScanned: number
  readonly suspected: number
  readonly proven: AuditedFinding[]
  readonly discarded: number
}

/**
 * Maps the surface, suspects, proves, and keeps only what reproduced.
 *
 * THE DISCARDED COUNT IS PART OF THE REPORT, not swallowed. It is the number a
 * reader needs to judge the tool itself: an audit that suspects forty things
 * and proves none is telling you something about the model, and hiding that
 * would be the same dishonesty as reporting the forty.
 */
export class RunAudit {
  constructor(
    private readonly reader: ProjectReader,
    private readonly auditor: VulnerabilityFinder,
    private readonly prover: ProofRunner,
  ) {}

  async execute(): Promise<AuditReport> {
    const surface = await this.reader.attackSurface()
    const audited: AuditedFinding[] = []
    let suspected = 0

    for (const entry of surface) {
      const source = await this.reader.read(entry.file)
      for (const finding of await this.auditor.suspect(entry, source)) {
        suspected += 1
        const plan = await this.auditor.planProof(finding, entry, source)
        audited.push({ finding, proof: plan ? await this.prover.run(plan) : unprovable(finding.title) })
      }
    }

    const proven = reportableFindings(audited)
    return { surfaceScanned: surface.length, suspected, proven, discarded: suspected - proven.length }
  }
}

/**
 * A suspicion the auditor could not even describe as a request.
 *
 * It is recorded as a real proof with a NotRunnable outcome rather than skipped,
 * so it still counts as discarded instead of vanishing from the arithmetic.
 */
const unprovable = (title: string): Proof =>
  Proof.create({
    outcome: ProofOutcome.NotRunnable,
    request: `none: no request could be derived for "${title}"`,
    expectation: 'a reproducible request',
    observed: 'the auditor produced no plan',
  })
