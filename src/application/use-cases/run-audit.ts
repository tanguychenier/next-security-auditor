import type { ProjectReader } from '../ports/project-reader.js'
import type { ProofRunner } from '../ports/proof-runner.js'
import { inFlightBounded } from './in-flight-bounded.js'
import { safeToSend } from '../../domain/policies/safety.js'
import type { VulnerabilityFinder } from '../ports/vulnerability-finder.js'
import { Proof, ProofOutcome } from '../../domain/value-objects/proof.js'
import { reportableFindings, type AuditedFinding } from '../../domain/policies/reportable-findings.js'
import { quotedEvidence } from '../../domain/policies/quoted-evidence.js'
import { runSequence } from './run-sequence.js'

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
    /** How many surface entries are hunted at once. Bounded: a plan has rate limits. */
    private readonly concurrency = 4,
    /** Send proofs whose method or path would change state. */
    private readonly allowDestructive = false,
  ) {}

  async execute(): Promise<AuditReport> {
    const surface = await this.reader.attackSurface()

    const entriesWithSource = await Promise.all(
      surface.map(async (entry) => [entry, await this.reader.read(entry.file)] as const),
    )

    // THE WHOLE SURFACE IS ASKED ABOUT AT ONCE. Entries are independent, so
    // queueing them was our own doing and it cost ten minutes on a live run.
    const suspicions = await this.auditor.suspectAll(entriesWithSource)

    // The proofs are still bounded: they hit a development server, and firing
    // fifty requests at once at somebody's laptop is its own kind of rude.
    const perEntry = await inFlightBounded(entriesWithSource, this.concurrency, async ([entry, source], index) => {
      const audited: AuditedFinding[] = []
      for (const finding of suspicions[index] ?? []) {
        // SOME FLAWS ARE SEEN BY READING, NOT BY ASKING. A key written in the
        // source is demonstrated by the line it sits on, and the quote is
        // checked against the file so a model that paraphrases is caught before
        // its finding reaches the report.
        if (finding.kind.evidence === 'source') {
          audited.push({ finding, proof: quotedEvidence(finding, source) })
          continue
        }

        const plan = await this.auditor.planProof(finding, entry, source)
        if (plan === undefined) {
          audited.push({ finding, proof: unprovable(finding.title) })
          continue
        }

        // A PROOF IS A REAL ATTACK ON A REAL APPLICATION. What we did not dare
        // send is recorded as unproven, and says why, because silence would
        // read as "the application held".
        const verdict = safeToSend(plan, { destructive: this.allowDestructive })
        if (!verdict.allowed) {
          audited.push({
            finding,
            proof: Proof.create({
              outcome: ProofOutcome.NotRunnable,
              request: `none: ${plan.method} ${plan.path} was refused`,
              expectation: plan.expectation,
              observed: verdict.why,
            }),
          })
          continue
        }

        // A RUN OF REQUESTS WHERE ONE SHOWS NOTHING. One POST answering 200
        // says nothing about the fifty-first, so a rule that needs repetition
        // gets it — bounded, because a proof is a real attack.
        const proof =
          plan.repeat === undefined
            ? await this.prover.run(plan)
            : await runSequence(this.prover, plan, plan.repeat)

        audited.push({ finding, proof, plan })
      }
      return audited
    })

    const audited = perEntry.flat()
    const suspected = audited.length
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
