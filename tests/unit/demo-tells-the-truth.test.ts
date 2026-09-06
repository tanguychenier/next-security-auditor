/**
 * THE ANIMATION IN THE README SHOWS WHAT THE TOOL ACTUALLY PRINTS.
 *
 * A demo is the first thing a stranger reads and the last thing anybody
 * maintains. Left alone it drifts into showing output the code cannot produce,
 * and the people most likely to notice are the people this project depends on.
 *
 * So the same report is rendered through the real reporter and asserted against
 * the picture, line by line. Change the report and this test fails until the
 * picture agrees with it again.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { renderConsole } from '../../src/infrastructure/report/console.js'
import { Finding } from '../../src/domain/value-objects/finding.js'
import { Proof, ProofOutcome } from '../../src/domain/value-objects/proof.js'
import { Severity } from '../../src/domain/value-objects/severity.js'

const demo = readFileSync(fileURLToPath(new URL('../../assets/demo.svg', import.meta.url)), 'utf8')

/** Columns in the picture are drawn, not spaced, so whitespace goes from both sides. */
const squashed = (text: string): string => text.replace(/\s+/g, '')

const drawn = [...demo.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)]
  .map((match) => squashed((match[1] ?? '').replace(/<[^>]+>/g, '')))
  .join('\n')

const report = {
  surfaceScanned: 4,
  suspected: 3,
  discarded: 2,
  proven: [
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
  ],
}

describe('the demo in the README', () => {
  it('shows every line the reporter produces for it', () => {
    for (const line of renderConsole(report, false).split('\n')) {
      if (line.trim() === '') continue
      expect(drawn, `the reporter prints "${line.trim()}" and the demo does not show it`).toContain(squashed(line))
    }
  })

  it('shows no finding the reporting rule would have discarded', () => {
    // A DISCARDED SUSPICION NEVER REACHES THE OUTPUT, only the count does. An
    // earlier version of this picture showed one, quietly promising a behaviour
    // the domain forbids.
    expect(demo).not.toContain('did not reproduce:')
    expect(demo).not.toContain('MEDIUM')
    expect(demo.split('observed').length - 1).toBe(1)
  })

  it('runs the command this package installs', () => {
    expect(demo).toContain('npx vulnerability-hunter-next')
  })

  it('is described for a reader who cannot see it', () => {
    expect(/aria-label="[^"]{40,}"/.test(demo)).toBe(true)
    expect(demo).toContain('<desc>')
  })
})
