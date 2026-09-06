/**
 * SARIF IS WHAT TURNS A TOOL FROM ADMIRED INTO ADOPTED.
 *
 * A findings list printed in a terminal dies with the terminal. The same list
 * in SARIF is uploaded by one GitHub Action step and lands in the Security tab
 * of the repository, annotated on the pull request diff, with history.
 *
 * That is the difference between a tool someone tries once and a tool that
 * runs on every pull request, so the format has to be exactly what GitHub
 * accepts rather than approximately.
 */

import { describe, expect, it } from 'vitest'
import { toSarif } from '../../src/infrastructure/report/sarif.js'
import { Finding } from '../../src/domain/value-objects/finding.js'
import { Proof, ProofOutcome } from '../../src/domain/value-objects/proof.js'
import { Severity } from '../../src/domain/value-objects/severity.js'

const audited = [
  {
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
  },
]

describe('emitting SARIF that GitHub actually accepts', () => {
  it('declares the schema version GitHub reads', () => {
    const sarif = toSarif(audited, '0.1.0')

    expect(sarif.version).toBe('2.1.0')
    expect(sarif.$schema).toContain('sarif-schema-2.1.0.json')
  })

  it('places the result on the exact file and line', () => {
    const location = toSarif(audited, '0.1.0').runs[0]?.results[0]?.locations[0]?.physicalLocation

    expect(location?.artifactLocation.uri).toBe('app/api/invoices/[id]/route.ts')
    expect(location?.region.startLine).toBe(4)
  })

  it('maps severity onto the levels SARIF defines, not our own words', () => {
    const level = toSarif(audited, '0.1.0').runs[0]?.results[0]?.level

    expect(level).toBe('error')
  })

  it('carries the proof in the message, so the reviewer can replay it', () => {
    // WITHOUT THIS the Security tab shows another unverifiable machine opinion.
    const message = toSarif(audited, '0.1.0').runs[0]?.results[0]?.message.text ?? ''

    expect(message).toContain('GET http://localhost:3000/api/invoices/1')
    expect(message).toContain('200 OK')
    expect(message).toContain('responds 401 or 403 without a session')
  })

  it('produces a valid, empty run when nothing was proven', () => {
    const sarif = toSarif([], '0.1.0')

    expect(sarif.runs[0]?.results).toEqual([])
    expect(sarif.runs[0]?.tool.driver.name).toBe('vulnerability-hunter-next')
  })
})
