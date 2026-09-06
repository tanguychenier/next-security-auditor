/**
 * THE RULE DECIDES WHAT WOULD PROVE IT.
 *
 * A hardcoded secret is proven by the line it sits on, a missing rate limit by
 * a run of requests, and everything else by one request. Hunting a rule whose
 * evidence the audit cannot produce is paying for a finding that can never be
 * reported: the Next side hunted `hardcoded-secret` for a while and discarded
 * every one of them, because it only ever sent a single HTTP request.
 */

import { describe, expect, it } from 'vitest'
import { RunAudit } from '../../src/application/use-cases/run-audit.js'
import { Finding } from '../../src/domain/value-objects/finding.js'
import { Proof, ProofOutcome } from '../../src/domain/value-objects/proof.js'
import { Severity } from '../../src/domain/value-objects/severity.js'
import type { ProjectReader } from '../../src/application/ports/project-reader.js'
import type { ProofRunner } from '../../src/application/ports/proof-runner.js'
import type { VulnerabilityFinder } from '../../src/application/ports/vulnerability-finder.js'
import type { SurfaceEntry } from '../../src/domain/value-objects/surface-entry.js'
import type { ProofPlan } from '../../src/domain/value-objects/proof-plan.js'

const ENTRY: SurfaceEntry = { kind: 'route-handler', file: 'app/api/x/route.ts', reachableAs: '/api/x' }

const SOURCE = "const stripeKey = 'sk_live_51H9xQz2eZvKYlo2C'\n"

const reader: ProjectReader = {
  attackSurface: async () => [ENTRY],
  read: async () => SOURCE,
}

const accepting: ProofRunner = {
  run: async (plan: ProofPlan) =>
    Proof.create({
      outcome: ProofOutcome.Reproduced,
      request: `${plan.method} ${plan.path}`,
      expectation: plan.expectation,
      observed: '200 OK',
    }),
}

const finderFor = (finding: Finding, plan?: ProofPlan): VulnerabilityFinder => ({
  suspectAll: async () => [[finding]],
  suspect: async () => [finding],
  planProof: async () => plan,
})

describe('choosing the evidence a rule needs', () => {
  it('proves a secret by the quoted line, without sending anything', async () => {
    let sent = 0
    const counting: ProofRunner = {
      run: async (plan) => {
        sent += 1
        return accepting.run(plan)
      },
    }

    const report = await new RunAudit(
      reader,
      finderFor(
        Finding.create({
          title: 'Live Stripe key committed',
          kind: 'hardcoded-secret',
          file: ENTRY.file,
          line: 1,
          severity: Severity.Critical,
          rationale: 'The key is written in the source.',
          quote: "const stripeKey = 'sk_live_51H9xQz2eZvKYlo2C'",
        }),
      ),
      counting,
    ).execute()

    expect(report.proven).toHaveLength(1)
    expect(report.proven[0]?.proof.request).toContain('read ')
    // NO REQUEST CAN SHOW THIS ONE, so none is sent.
    expect(sent).toBe(0)
  })

  it('discards a secret the model quoted but the file does not contain', async () => {
    const report = await new RunAudit(
      reader,
      finderFor(
        Finding.create({
          title: 'Invented key',
          kind: 'hardcoded-secret',
          file: ENTRY.file,
          line: 1,
          severity: Severity.Critical,
          rationale: 'A key the model made up.',
          quote: "const stripeKey = 'sk_live_NOT_IN_THE_FILE'",
        }),
      ),
      accepting,
    ).execute()

    expect(report.proven).toHaveLength(0)
    expect(report.discarded).toBe(1)
  })

  it('sends the run of requests a missing limit needs, not one', async () => {
    let sent = 0
    const counting: ProofRunner = {
      run: async (plan) => {
        sent += 1
        return accepting.run(plan)
      },
    }

    const report = await new RunAudit(
      reader,
      finderFor(
        Finding.create({
          title: 'Nothing limits how often this is called',
          kind: 'missing-rate-limiting',
          file: ENTRY.file,
          line: 1,
          severity: Severity.Medium,
          rationale: 'No limiter anywhere on the handler.',
        }),
        {
          method: 'GET',
          path: '/api/x',
          expectation: 'starts refusing after a few attempts',
          reproducesOnStatus: [200],
          repeat: 20,
        },
      ),
      counting,
    ).execute()

    expect(sent).toBe(20)
    expect(report.proven).toHaveLength(1)
    expect(report.proven[0]?.proof.request).toContain('20 times')
  })

  it('stops the run at the first refusal, because the application defended itself', async () => {
    let sent = 0
    const refusingAfterThree: ProofRunner = {
      run: async (plan) => {
        sent += 1
        return Proof.create({
          outcome: sent > 3 ? ProofOutcome.NotReproduced : ProofOutcome.Reproduced,
          request: `${plan.method} ${plan.path}`,
          expectation: plan.expectation,
          observed: sent > 3 ? '429 Too Many Requests' : '200 OK',
        })
      },
    }

    const report = await new RunAudit(
      reader,
      finderFor(
        Finding.create({
          title: 'Nothing limits how often this is called',
          kind: 'missing-rate-limiting',
          file: ENTRY.file,
          line: 1,
          severity: Severity.Medium,
          rationale: 'No limiter anywhere on the handler.',
        }),
        {
          method: 'GET',
          path: '/api/x',
          expectation: 'starts refusing after a few attempts',
          reproducesOnStatus: [200],
          repeat: 20,
        },
      ),
      refusingAfterThree,
    ).execute()

    expect(sent).toBe(4)
    expect(report.proven).toHaveLength(0)
  })
})
