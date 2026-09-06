/**
 * THE REPORT SOMEBODY PASTES INTO A PULL REQUEST.
 *
 * SARIF is for machines and the console is for whoever ran it. Markdown is what
 * ends up in a review, a ticket or a message, which is where a finding actually
 * gets acted on.
 */

import { describe, expect, it } from 'vitest'
import { renderMarkdown } from '../../src/infrastructure/report/markdown.js'
import { Finding } from '../../src/domain/value-objects/finding.js'
import { Proof, ProofOutcome } from '../../src/domain/value-objects/proof.js'
import { Severity } from '../../src/domain/value-objects/severity.js'
import type { AuditedFinding } from '../../src/domain/policies/reportable-findings.js'

const proven = (title = 'Invoice readable without a session'): AuditedFinding => ({
  finding: Finding.create({
    title,
    kind: 'broken-object-level-authorization',
    file: 'app/api/invoices/[id]/route.ts',
    line: 4,
    severity: Severity.High,
    rationale: 'params.id reaches the database with no ownership check.',
  }),
  proof: Proof.create({
    outcome: ProofOutcome.Reproduced,
    request: 'GET http://localhost:3000/api/invoices/1',
    expectation: 'responds 401 or 403 without a session',
    observed: '200 OK, 214 bytes',
  }),
})

describe('the report pasted into a review', () => {
  it('leads with the counts a reviewer judges the tool on', () => {
    const written = renderMarkdown({ surfaceScanned: 4, suspected: 3, discarded: 2, proven: [proven()] })

    expect(written).toContain('**1 proven**')
    expect(written).toContain('2 discarded')
  })

  it('carries the request so a reviewer can replay it', () => {
    const written = renderMarkdown({ surfaceScanned: 4, suspected: 3, discarded: 2, proven: [proven()] })

    expect(written).toContain('GET http://localhost:3000/api/invoices/1')
    expect(written).toContain('200 OK, 214 bytes')
  })

  it('says plainly when nothing survived', () => {
    const written = renderMarkdown({ surfaceScanned: 4, suspected: 5, discarded: 5, proven: [] })

    expect(written).toContain('Nothing was proven exploitable')
    expect(written).toContain('5 suspicions were raised')
  })

  it('escapes what would split the table', () => {
    expect(renderMarkdown({ surfaceScanned: 1, suspected: 1, discarded: 0, proven: [proven('Leak in a|b handler')] }))
      .toContain('a\\|b')
  })
})
