/**
 * WHAT EACH PIECE REFUSES, AND WHAT IT FALLS BACK TO.
 *
 * A value object that refuses nothing lets a model's mistake travel all the way
 * into the report, and a fallback nobody exercises is a fallback nobody knows
 * is broken. Both are one line each, and both are why the tool can be trusted
 * to print an empty report.
 */

import { describe, expect, it } from 'vitest'

import { Finding } from '../../src/domain/value-objects/finding.js'
import { Proof, ProofOutcome } from '../../src/domain/value-objects/proof.js'
import { Severity } from '../../src/domain/value-objects/severity.js'
import { identityOf } from '../../src/domain/policies/identity.js'
import { disposableTarget } from '../../src/domain/policies/safety.js'
import { readAccepted } from '../../src/domain/policies/accepted-findings.js'
import { testFileNameFor } from '../../src/infrastructure/report/regression-test.js'

const shape = {
  title: 'Invoice readable without a session',
  kind: 'broken-object-level-authorization',
  file: 'app/api/invoices/[id]/route.ts',
  line: 4,
  severity: Severity.High,
  rationale: 'The id reaches the database with no ownership check.',
}

describe('a finding that names nothing', () => {
  it('refuses an empty field rather than reporting a blank line', () => {
    for (const field of ['title', 'file', 'rationale'] as const) {
      expect(() => Finding.create({ ...shape, [field]: '   ' })).toThrow(new RegExp(`needs its ${field}`))
    }
  })

  it('refuses a line number no editor could open', () => {
    expect(() => Finding.create({ ...shape, line: 0 })).toThrow(RangeError)
    expect(() => Finding.create({ ...shape, line: 4.5 })).toThrow('numbered from one')
  })
})

describe('a proof nobody could replay', () => {
  it('refuses to record one without the request, the expectation or what happened', () => {
    const sound = {
      outcome: ProofOutcome.Reproduced,
      request: 'GET /admin/invoices/1',
      expectation: 'answers 401 without a session',
      observed: '200 OK, 214 bytes',
    }

    for (const field of ['request', 'expectation', 'observed'] as const) {
      expect(() => Proof.create({ ...sound, [field]: ' ' })).toThrow(new RegExp(`records its ${field}`))
    }
  })
})

describe('what makes a finding the same finding as last week', () => {
  const identity = (line: number, source: string) => identityOf(Finding.create({ ...shape, line }), source)

  it('takes the nearest declaration, whichever side it sits on', async () => {
    const below = await identity(1, ['', 'export function show() {}'].join('\n'))
    const above = await identity(2, ['export function show() {}', ''].join('\n'))
    const nearer = await identity(3, ['function far() {}', '', '', 'const near = 1'].join('\n'))

    for (const id of [below, above, nearer]) expect(id).toMatch(/^[0-9a-f]{16}$/)
    // THE SAME SYMBOL NAMES THE SAME FLAW wherever the lines moved to.
    expect(below).toBe(above)
    expect(nearer).not.toBe(below)
  })

  it('falls back to the line itself when nothing around it declares anything', async () => {
    const bare = await identity(1, '  return db.find(id)')
    const spaced = await identity(1, 'return    db.find(id)')

    // WHITESPACE IS NOT THE FLAW: the same statement reformatted is the same finding.
    expect(bare).toBe(spaced)
    expect(bare).toMatch(/^[0-9a-f]{16}$/)
  })
})

describe('a target with no host at all', () => {
  it('is not disposable, because an unreadable target is not a safe one', () => {
    // A PATH IS NOT A SERVER, and a target nobody can parse must not be taken
    // for a local one: that would turn a parsing gap into a way to attack production.
    expect(disposableTarget('file:///etc/passwd')).toBe(false)
    expect(disposableTarget('not a url')).toBe(false)
  })
})

describe('a baseline written by hand', () => {
  it('drops a proof whose method or path is not a string', () => {
    const [entry] = readAccepted(
      JSON.stringify({ accepted: [{ id: 'a', rule: 'r', file: 'f', title: 't', proof: { method: 7, path: '/x' } }] }),
    )

    expect(entry?.plan).toBeUndefined()
  })

  it('reads a proof that recognises the flaw by its body alone', () => {
    const [entry] = readAccepted(
      JSON.stringify({
        accepted: [
          {
            id: 'a',
            rule: 'r',
            file: 'f',
            title: 't',
            proof: {
              method: 'GET',
              path: '/admin/invoices/1',
              expectation: 'answers 401',
              reproducesOnBodyContaining: 'iban_of_someone_else',
            },
          },
        ],
      }),
    )

    expect(entry?.plan?.reproducesOnStatus).toEqual([])
    expect(entry?.plan?.reproducesOnBodyContaining).toBe('iban_of_someone_else')
  })
})

describe('the name of the test written for the team', () => {
  it('falls back to something readable when the rule and the id carry nothing usable', () => {
    const name = testFileNameFor({ id: '///', rule: '***', file: 'app/route.ts', title: 'A flaw' })

    expect(name).toMatch(/\.test\.ts$/)
    expect(name).not.toContain('/')
    expect(name).not.toContain('*')
  })
})
