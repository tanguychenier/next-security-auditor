/**
 * ONE LINE PER HOLE, NOT ONE PER SENTENCE THE MODEL WROTE.
 *
 * Measured on a sabotaged copy of our own starter: six proven findings, four of
 * which described the same unguarded route — "no ownership check", "ids can be
 * enumerated", "the IBAN leaks". A reader sees four holes, fixes the first, and
 * finds three still there tomorrow.
 *
 * Same rule, same file, same request is one hole. What separates those four is
 * the line the model chose to point at, and that line is not a fact about the
 * application: the request is.
 */

import { describe, expect, it } from 'vitest'
import { reportableFindings, type AuditedFinding } from '../../src/domain/policies/reportable-findings.js'
import { Finding } from '../../src/domain/value-objects/finding.js'
import { Proof, ProofOutcome } from '../../src/domain/value-objects/proof.js'
import { Severity } from '../../src/domain/value-objects/severity.js'
import type { ProofPlan } from '../../src/domain/value-objects/proof-plan.js'

const plan = (path: string): ProofPlan => ({
  method: 'GET',
  path,
  expectation: 'answers 401 without a session',
  reproducesOnStatus: [200],
})

const onHole = (
  title: string,
  line: number,
  request: ProofPlan,
  severity = Severity.Critical,
  kind = 'broken-object-level-authorization',
): AuditedFinding => ({
  finding: Finding.create({
    title,
    kind,
    file: 'app/api/devis/[id]/route.ts',
    line,
    severity,
    rationale: 'The id reaches the store with no ownership check.',
  }),
  proof: Proof.create({
    outcome: ProofOutcome.Reproduced,
    request: `GET ${request.path}`,
    expectation: request.expectation,
    observed: '200 OK',
  }),
  plan: request,
})

describe('reporting one line per hole', () => {
  it('collapses findings that share a rule, a file and a request', () => {
    const request = plan('/api/devis/1')

    const reported = reportableFindings([
      onHole('No ownership check', 17, request),
      onHole('Ids can be enumerated', 25, request),
      onHole('The IBAN leaks', 20, request),
    ])

    expect(reported).toHaveLength(1)
  })

  it('keeps two holes proven by two different requests', () => {
    // Collapsing these would be worse than the noise: two routes, two fixes.
    const reported = reportableFindings([
      onHole('Devis leaks', 17, plan('/api/devis/1')),
      onHole('Factures leak', 40, plan('/api/factures/1')),
    ])

    expect(reported).toHaveLength(2)
  })

  it('keeps two rules on the same request, because each needs its own fix', () => {
    const request = plan('/api/devis/1')

    const reported = reportableFindings([
      onHole('No authentication at all', 17, request, Severity.Critical, 'missing-authorization'),
      onHole('No ownership check', 25, request),
    ])

    expect(reported).toHaveLength(2)
  })

  it('keeps the worst of the duplicates, so nothing is understated', () => {
    const request = plan('/api/devis/1')

    const reported = reportableFindings([
      onHole('Seen as a leak', 20, request, Severity.High),
      onHole('Seen as missing authorization', 17, request, Severity.Critical),
    ])

    expect(reported).toHaveLength(1)
    expect(reported[0]?.finding.severity).toBe(Severity.Critical)
  })

  it('never collapses a finding with no plan, since nothing says it is the same', () => {
    const loose = { ...onHole('Proven without a plan', 5, plan('/api/devis/1')) }
    delete (loose as { plan?: ProofPlan }).plan

    expect(reportableFindings([loose, { ...loose }])).toHaveLength(2)
  })
})
