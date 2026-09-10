/**
 * WHAT A TEAM HAS ALREADY SEEN, SO A RUN CAN REPORT ONLY WHAT IS NEW.
 *
 * A model does not answer the same thing twice, so a hunt cannot be a required
 * check on its own: it would fail a pull request that changed nothing. Compared
 * against a committed list it can, because what matters becomes the difference.
 */

import { describe, expect, it } from 'vitest'
import { compare, readAccepted, stopsTheBuild, writeAccepted } from '../../src/domain/policies/accepted-findings.js'

describe('comparing a run with what was accepted', () => {
  it('calls everything new when nothing was accepted', () => {
    expect(compare([], ['aaaa', 'bbbb'])).toEqual({ appeared: ['aaaa', 'bbbb'], known: [], gone: [] })
  })

  it('does not call a known flaw news', () => {
    expect(compare(['aaaa'], ['aaaa'])).toEqual({ appeared: [], known: ['aaaa'], gone: [] })
  })

  it('shows a flaw that stopped reproducing as gone', () => {
    // OTHERWISE NOBODY PRUNES THE FILE, and a stale entry eventually swallows a
    // real flaw in silence.
    expect(compare(['aaaa', 'bbbb'], ['aaaa']).gone).toEqual(['bbbb'])
  })

  it('stops the build only on something new', () => {
    expect(stopsTheBuild(compare([], ['aaaa']))).toBe(true)
    expect(stopsTheBuild(compare(['aaaa'], ['aaaa']))).toBe(false)
    // A FIXED FLAW IS GOOD NEWS and must never fail a build.
    expect(stopsTheBuild(compare(['aaaa'], []))).toBe(false)
  })
})

describe('the file a team commits', () => {
  it('reads back the request that proved each flaw', () => {
    const accepted = readAccepted(
      JSON.stringify({
        accepted: [
          {
            id: 'aaaa',
            rule: 'ssrf',
            file: 'app/api/x/route.ts',
            title: 'A flaw',
            proof: { method: 'GET', path: '/api/x', expectation: 'refuses', reproducesOnStatus: [200] },
          },
        ],
      }),
    )

    expect(accepted[0]?.plan?.path).toBe('/api/x')
  })

  it('drops a recorded plan the domain would refuse today', () => {
    // A BASELINE WRITTEN BY AN OLDER VERSION must not put an inverted plan back
    // into circulation.
    const accepted = readAccepted(
      JSON.stringify({
        accepted: [{ id: 'aaaa', proof: { method: 'GET', path: '/api/x', reproducesOnStatus: [403] } }],
      }),
    )

    expect(accepted[0]?.plan).toBeUndefined()
  })

  it('refuses an unreadable file rather than treating it as empty', () => {
    expect(() => readAccepted('{ this is not json')).toThrow('could not be read')
  })

  it('refuses a file whose shape is wrong rather than reading it as empty', () => {
    // AN EMPTY LIST ACCEPTS NOTHING AND FAILS EVERYTHING, which reads like a
    // regression that is not there. Refusing says which file to go and look at.
    expect(() => readAccepted('{"accepted":{"id":"aaaa"}}')).toThrow('not a list of findings')
    expect(() => readAccepted('{}')).toThrow('not a list of findings')
  })

  it('refuses an entry that carries no identity', () => {
    expect(() => readAccepted('{"accepted":[{"rule":"ssrf","file":"app/x.ts"}]}')).toThrow('entry 0 has no id')
    expect(() => readAccepted('{"accepted":["aaaa"]}')).toThrow('entry 0 is not a finding')
  })

  it('writes it sorted, so committing twice gives the same bytes', () => {
    const written = writeAccepted([
      { id: 'bbbb', rule: 'ssrf', file: 'b.ts', title: 'B' },
      { id: 'aaaa', rule: 'idor', file: 'a.ts', title: 'A' },
    ])

    expect(written.indexOf('aaaa')).toBeLessThan(written.indexOf('bbbb'))
    expect(written.endsWith('\n')).toBe(true)
  })
})
