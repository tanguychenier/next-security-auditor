/**
 * THE RULE THAT MAKES THIS TOOL DIFFERENT: A FINDING WITHOUT A PROOF IS NOISE.
 *
 * Every LLM security auditor we surveyed reports what the model believes.
 * Vulnhuntr (2.7k stars, last commit Feb 2025) prints a call chain and a
 * confidence score. symfony-security-auditor adds a second "reviewer" model
 * that culls false positives — an opinion filtering an opinion.
 *
 * Neither lets the reader CHECK anything. You are asked to trust a model.
 *
 * Here a finding is only ever reported when an executable proof was run
 * against the running application and reproduced the flaw. If the proof does
 * not reproduce, the finding is discarded — silently, automatically, without a
 * human arbitrating between two model opinions.
 *
 * This is enforced in the domain, not in the reporter, so no adapter and no
 * future contributor can bypass it.
 */

import { describe, expect, it } from 'vitest'
import { Finding } from '../../src/domain/value-objects/finding.js'
import { Proof, ProofOutcome } from '../../src/domain/value-objects/proof.js'
import { Severity } from '../../src/domain/value-objects/severity.js'
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
