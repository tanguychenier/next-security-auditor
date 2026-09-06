/**
 * What a human reads in the terminal.
 *
 * The discarded count is asserted here on purpose: it is the number that tells
 * a reader how trigger-happy the model was on their codebase, and it is the
 * first thing a tool is tempted to hide once it looks bad.
 */

import { describe, expect, it } from 'vitest'
import { renderConsole } from '../../src/infrastructure/report/console.js'
import { Finding } from '../../src/domain/value-objects/finding.js'
import { Proof, ProofOutcome } from '../../src/domain/value-objects/proof.js'
import { Severity } from '../../src/domain/value-objects/severity.js'

const proven = {
  finding: Finding.create({
    title: 'Invoice readable without a session',
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
}

const ESC = String.fromCharCode(27)

describe('rendering the report in a terminal', () => {
  it('shows the request, the expectation and what actually happened', () => {
    const output = renderConsole(
      { surfaceScanned: 4, suspected: 3, proven: [proven], discarded: 2 },
      false,
    )

    expect(output).toContain('GET http://localhost:3000/api/invoices/1')
    expect(output).toContain('observed  200 OK, 214 bytes')
    expect(output).toContain('1 proven, 2 discarded')
  })

  it('says plainly when nothing survived, without pretending it found nothing', () => {
    const output = renderConsole(
      { surfaceScanned: 4, suspected: 5, proven: [], discarded: 5 },
      false,
    )

    expect(output).toContain('Nothing was proven exploitable.')
    expect(output).toContain('5 suspicions were raised and none survived')
  })

  it('emits no escape codes when the output is not a terminal', () => {
    const output = renderConsole(
      { surfaceScanned: 1, suspected: 1, proven: [proven], discarded: 0 },
      false,
    )

    expect(output).not.toContain(ESC)
  })

  it('colours the severity when it is a terminal', () => {
    const output = renderConsole(
      { surfaceScanned: 1, suspected: 1, proven: [proven], discarded: 0 },
      true,
    )

    expect(output).toContain(`${ESC}[31mHIGH${ESC}[0m`)
  })
})
