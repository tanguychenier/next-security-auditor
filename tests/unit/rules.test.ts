/**
 * A RULE IS DATA, NOT A UNION OF STRING LITERALS.
 *
 * New classes of flaw appear constantly, and the model already knows most of
 * them by name. A closed union drops silently everything it does not
 * enumerate, so the catalogue steers the hunt and filters the report — it never
 * decides what may exist.
 */

import { describe, expect, it } from 'vitest'
import { rule, NEXT_RULES, selectedRules } from '../../src/domain/rules/rule.js'

describe('naming a rule', () => {
  it('needs nothing but a name, because the model knows what it is', () => {
    expect(rule('cache-poisoning').id).toBe('cache-poisoning')
    expect(rule('cache-poisoning').instructions).toBeUndefined()
  })

  it('carries instructions when the team has something specific to say', () => {
    expect(rule('price-manipulation', 'The total is recomputed on the server.').instructions)
      .toBe('The total is recomputed on the server.')
  })

  it('reads two spellings as one rule', () => {
    // A REPORT LISTING "SSRF" AND "ssrf" as two findings is a bug the reader
    // blames on the tool, never on their own config file.
    expect(rule('  SSRF ').id).toBe('ssrf')
    expect(rule('Missing Authorization').id).toBe('missing-authorization')
    expect(rule('missing_authorization').id).toBe('missing-authorization')
  })

  it('refuses a name that could not be written in a report', () => {
    expect(() => rule('')).toThrow()
    expect(() => rule('drop table users; --')).toThrow('rule name')
  })
})

describe('what ships for Next.js', () => {
  it('covers more than the handful a single author thinks of', () => {
    expect(NEXT_RULES.length).toBeGreaterThan(30)
  })

  it('names each rule only once', () => {
    const ids = NEXT_RULES.map((entry) => entry.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('says what would count as evidence for every rule', () => {
    // A RULE THAT CANNOT BE DEMONSTRATED is always discarded, so shipping it
    // would only ever waste a model call.
    for (const entry of NEXT_RULES) expect(entry.instructions, entry.id).toBeTruthy()
  })

  it('hunts the shapes only Next.js has', () => {
    const ids = NEXT_RULES.map((entry) => entry.id)
    expect(ids).toContain('server-action-without-authorization')
    expect(ids).toContain('server-secret-reaching-the-client')
    expect(ids).toContain('bypassable-middleware')
  })
})

describe('selecting the rules a hunt runs', () => {
  it('hunts everything when nothing was configured', () => {
    expect(selectedRules().length).toBe(NEXT_RULES.length)
  })

  it('keeps only what a project asked for', () => {
    const selected = selectedRules({ only: ['ssrf', 'missing-authorization'] })
    expect(selected.map((entry) => entry.id).sort()).toEqual(['missing-authorization', 'ssrf'])
  })

  it('mutes one rule without listing all the others', () => {
    expect(selectedRules({ without: ['ssrf'] }).some((entry) => entry.id === 'ssrf')).toBe(false)
  })

  it('adds a rule nobody shipped yet', () => {
    const selected = selectedRules({ with: { 'prompt-injection': 'User text must never reach the system prompt raw.' } })
    expect(selected.find((entry) => entry.id === 'prompt-injection')?.instructions)
      .toBe('User text must never reach the system prompt raw.')
  })

  it('replaces a shipped rule rather than hunting it twice', () => {
    const selected = selectedRules({ with: { ssrf: 'Only the image proxy matters here.' } })
    const matching = selected.filter((entry) => entry.id === 'ssrf')
    expect(matching).toHaveLength(1)
    expect(matching[0]?.instructions).toBe('Only the image proxy matters here.')
  })

  it('lets removing win over keeping', () => {
    const selected = selectedRules({ only: ['ssrf', 'missing-authorization'], without: ['ssrf'] })
    expect(selected.map((entry) => entry.id)).toEqual(['missing-authorization'])
  })
})
