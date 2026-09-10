/**
 * THE WHOLE PIPELINE, OFFLINE.
 *
 * The auditor and the proof runner are doubles here. That is not a shortcut:
 * a test that needs an API key and a running Next.js server is a test that
 * contributors skip, and a skipped test guards nothing.
 *
 * What is exercised for real: the surface mapping against a fixture project,
 * the arithmetic of the report, and the rule that decides what a reader sees.
 */

import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { RunAudit } from '../../src/application/use-cases/run-audit.js'
import { NextProjectReader } from '../../src/infrastructure/project/next-project-reader.js'
import { Finding } from '../../src/domain/value-objects/finding.js'
import { Proof, ProofOutcome } from '../../src/domain/value-objects/proof.js'
import { Severity } from '../../src/domain/value-objects/severity.js'
import type { VulnerabilityFinder } from '../../src/application/ports/vulnerability-finder.js'
import type { ProofRunner } from '../../src/application/ports/proof-runner.js'
import type { ProofPlan } from '../../src/domain/value-objects/proof-plan.js'
import type { SurfaceEntry } from '../../src/domain/value-objects/surface-entry.js'

const shop = fileURLToPath(new URL('../fixtures/shop', import.meta.url))

/** Every finder answers the batch by answering each entry; only the model batches for real. */
const oneByOne = (finder: Pick<VulnerabilityFinder, 'suspect'>) =>
  async (entriesWithSource: readonly (readonly [SurfaceEntry, string])[]): Promise<Finding[][]> => {
    const perEntry: Finding[][] = []
    for (const [entry, source] of entriesWithSource) perEntry.push(await finder.suspect(entry, source))
    return perEntry
  }

const suspicious: VulnerabilityFinder = {
  suspectAll: (entries) => oneByOne(suspicious)(entries),
  async suspect(entry) {
    if (entry.kind !== 'route-handler') return []
    return [
      Finding.create({
        title: 'Invoice readable without a session',
        kind: 'broken-object-level-authorization',
        file: entry.file,
        line: 4,
        severity: Severity.High,
        rationale: 'params.id goes straight to the database with no ownership check.',
      }),
      Finding.create({
        title: 'Suspected open redirect',
        kind: 'information-disclosure',
        file: entry.file,
        line: 9,
        severity: Severity.Low,
        rationale: 'A hunch the proof will have to settle.',
      }),
    ]
  },
  async planProof(finding) {
    return {
      method: 'GET',
      path: '/api/invoices/1',
      expectation: 'responds 401 or 403 without a session',
      reproducesOnStatus: finding.severity === Severity.High ? [200] : [999],
    }
  },
}

/** Reproduces only what the plan expects, so one finding survives and one dies. */
const honestProver: ProofRunner = {
  async run(plan: ProofPlan) {
    const reproduced = plan.reproducesOnStatus.includes(200)
    return Proof.create({
      outcome: reproduced ? ProofOutcome.Reproduced : ProofOutcome.NotReproduced,
      request: `${plan.method} ${plan.path}`,
      expectation: plan.expectation,
      observed: reproduced ? '200 with the invoice body' : '401',
    })
  },
}

describe('auditing a Next.js project end to end', () => {
  it('reports only the finding whose proof reproduced, and says how many it dropped', async () => {
    const report = await new RunAudit(new NextProjectReader(shop), suspicious, honestProver).execute()

    expect(report.surfaceScanned).toBe(5)
    expect(report.suspected).toBe(2)
    expect(report.proven).toHaveLength(1)
    expect(report.proven[0]?.finding.title).toBe('Invoice readable without a session')
    expect(report.discarded).toBe(1)
  })

  it('counts a suspicion the auditor cannot turn into a request as discarded', async () => {
    const speechless: VulnerabilityFinder = { ...suspicious, async planProof() { return undefined } }

    const report = await new RunAudit(new NextProjectReader(shop), speechless, honestProver).execute()

    expect(report.proven).toEqual([])
    expect(report.discarded).toBe(2)
  })

  it('reports nothing at all when the auditor suspects nothing', async () => {
    const calm: VulnerabilityFinder = {
      async suspect() { return [] },
      async suspectAll(entries) { return entries.map(() => []) },
      async planProof() { return undefined },
    }

    const report = await new RunAudit(new NextProjectReader(shop), calm, honestProver).execute()

    expect(report).toMatchObject({ suspected: 0, discarded: 0, proven: [] })
    expect(report.surfaceScanned).toBe(5)
  })
})
