/**
 * THE RULE THAT DEFINES THIS TOOL: A FINDING WITHOUT A PROOF IS NOISE.
 *
 * A model reading code produces opinions. An opinion is a fine place to start
 * and a poor place to stop, because the reader cannot check it and ends up
 * arbitrating between the model and their own memory of the codebase.
 *
 * Here a finding is reported only once an executable proof has been run
 * against the running application and reproduced the flaw. If the proof does
 * not reproduce, the finding is discarded: silently, automatically, with no
 * human deciding who to believe.
 *
 * This is enforced in the domain, not in the reporter, so no adapter and no
 * future contributor can bypass it.
 */

import { describe, expect, it } from 'vitest'
import { Finding } from '../../src/domain/value-objects/finding.js'
import { Proof, ProofOutcome } from '../../src/domain/value-objects/proof.js'
import { Severity } from '../../src/domain/value-objects/severity.js'
import type { AuditedFinding } from '../../src/domain/policies/reportable-findings.js'
import { reportableFindings } from '../../src/domain/policies/reportable-findings.js'

const finding = (title: string): Finding =>
  Finding.create({
    title,
    kind: 'missing-authorization',
    file: 'app/api/invoices/[id]/route.ts',
    line: 12,
    severity: Severity.High,
    rationale: 'The handler reads params.id and returns the row without checking the session.',
  })

const proof = (outcome: ProofOutcome): Proof =>
  Proof.create({
    outcome,
    request: 'GET /api/invoices/1 without a session cookie',
    expectation: 'responds 401 or 403',
    observed: outcome === ProofOutcome.Reproduced ? '200 with the invoice body' : '401',
  })

describe('a finding is reportable only once a proof reproduced it', () => {
  it('keeps a finding whose proof reproduced the flaw', () => {
    const kept = reportableFindings([
      { finding: finding('IDOR on invoice detail'), proof: proof(ProofOutcome.Reproduced) },
    ])

    expect(kept).toHaveLength(1)
    expect(kept[0]?.finding.title).toBe('IDOR on invoice detail')
  })

  it('drops a finding the proof could not reproduce', () => {
    const kept = reportableFindings([
      { finding: finding('IDOR on invoice detail'), proof: proof(ProofOutcome.NotReproduced) },
    ])

    expect(kept).toEqual([])
  })

  it('drops a finding whose proof could not even run', () => {
    // A PROOF THAT CANNOT RUN PROVES NOTHING. Reporting it would smuggle back
    // exactly the unverifiable claim this tool exists to remove.
    const kept = reportableFindings([
      { finding: finding('SSRF in image proxy'), proof: proof(ProofOutcome.NotRunnable) },
    ])

    expect(kept).toEqual([])
  })

  it('orders what survives by severity, worst first', () => {
    const low = Finding.create({
      title: 'Verbose error page',
      kind: 'information-disclosure',
      file: 'app/error.tsx',
      line: 3,
      severity: Severity.Low,
      rationale: 'Stack traces reach the browser in production builds.',
    })

    const kept = reportableFindings([
      { finding: low, proof: proof(ProofOutcome.Reproduced) },
      { finding: finding('IDOR on invoice detail'), proof: proof(ProofOutcome.Reproduced) },
    ])

    expect(kept.map((entry) => entry.finding.severity)).toEqual([Severity.High, Severity.Low])
  })
})

describe('the order a reader diffs against yesterday', () => {
  it('is the same whatever order the findings arrived in', () => {
    const at = (file: string, line: number, severity: Severity): AuditedFinding => ({
      finding: Finding.create({
        title: 'A flaw',
        kind: 'ssrf',
        file,
        line,
        severity,
        rationale: 'because',
      }),
      proof: Proof.create({
        outcome: ProofOutcome.Reproduced,
        request: 'GET /x',
        expectation: 'refuses',
        observed: '200',
      }),
    })

    const entries = [
      at('app/b.ts', 10, Severity.High),
      at('app/a.ts', 20, Severity.High),
      at('app/a.ts', 5, Severity.High),
      at('app/a.ts', 5, Severity.Critical),
    ]
    const order = (given: AuditedFinding[]): string[] =>
      reportableFindings(given).map((entry) => `${entry.finding.file}:${entry.finding.line}`)

    const expected = ['app/a.ts:5', 'app/a.ts:5', 'app/a.ts:20', 'app/b.ts:10']

    expect(order(entries)).toEqual(expected)
    expect(order([...entries].reverse())).toEqual(expected)
  })
})
