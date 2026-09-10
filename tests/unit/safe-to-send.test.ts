/**
 * A PROOF IS A REAL ATTACK, AND IT LANDS ON A REAL APPLICATION.
 *
 * A model asked to demonstrate a missing guard on a purge route writes a request
 * to that purge route. On a running application that request is rows gone, and
 * the tool would have been right about the flaw and catastrophic about
 * everything else.
 *
 * So the default is narrow: safe methods, and nothing whose path announces that
 * it destroys something. Whoever wants the rest asks for it out loud.
 */

import { describe, expect, it } from 'vitest'
import { safeToSend, disposableTarget } from '../../src/domain/policies/safety.js'
import type { ProofPlan } from '../../src/domain/value-objects/proof-plan.js'

const plan = (method: string, path: string): ProofPlan => ({
  method,
  path,
  expectation: 'responds 401 or 403',
  reproducesOnStatus: [200],
})

describe('what the hunt is willing to send', () => {
  it('sends a read that changes nothing', () => {
    expect(safeToSend(plan('GET', '/api/invoices/1')).allowed).toBe(true)
  })

  it('refuses to purge somebody database to prove a point', () => {
    const refused = safeToSend(plan('GET', '/api/admin/purge'))

    expect(refused.allowed).toBe(false)
    expect(refused.why).toContain('destroy')
  })

  it('refuses the other words that mean the same thing', () => {
    for (const path of ['/api/delete-all', '/api/cache/flush', '/api/db/truncate', '/api/reset', '/api/wipe', '/api/drop']) {
      expect(safeToSend(plan('GET', path)).allowed, path).toBe(false)
    }
  })

  it('refuses a method that writes by definition', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(safeToSend(plan(method, '/api/contact')).allowed, method).toBe(false)
    }
  })

  it('refuses a read that the server would route as a write', () => {
    // THE VERB ON THE FIRST LINE IS NOT ALWAYS THE ONE THAT RUNS. A framework
    // honouring the override header does a DELETE on what reads as a GET.
    const overridden = { ...plan('GET', '/api/invoices/1'), headers: { 'X-HTTP-Method-Override': 'DELETE' } }

    const refused = safeToSend(overridden)

    expect(refused.allowed).toBe(false)
    expect(refused.why).toContain('route a DELETE')
  })

  it('sees the override however it is spelled, header or parameter', () => {
    expect(safeToSend({ ...plan('GET', '/api/x'), headers: { 'x-method-override': 'PUT' } }).allowed).toBe(false)
    expect(safeToSend({ ...plan('GET', '/api/x'), headers: { 'X-HTTP-Method': 'PATCH' } }).allowed).toBe(false)
    expect(safeToSend(plan('GET', '/api/x?_method=DELETE')).allowed).toBe(false)
  })

  it('leaves an override that asks for a read alone', () => {
    expect(safeToSend({ ...plan('GET', '/api/x'), headers: { 'X-HTTP-Method-Override': 'HEAD' } }).allowed).toBe(true)
  })

  it('allows everything once somebody asks out loud', () => {
    expect(safeToSend(plan('DELETE', '/api/admin/purge'), { destructive: true }).allowed).toBe(true)
  })

  it('says a refusal is not a proof that failed', () => {
    // "WE DID NOT DARE" AND "THE APPLICATION HELD" ARE DIFFERENT FACTS.
    expect(safeToSend(plan('DELETE', '/x')).why).toContain('was not sent')
  })
})

describe('where the attack is allowed to land', () => {
  it('recognises the server a developer runs on their own machine', () => {
    for (const url of [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://[::1]:3000',
      'http://192.168.1.20:3000',
      'http://10.4.0.7',
      'http://172.16.3.9:8080',
      'http://app.localhost:3000',
      'http://web:3000',
      'http://0.0.0.0:3000',
    ]) {
      expect(disposableTarget(url), url).toBe(true)
    }
  })

  it('refuses something that looks like a real site', () => {
    for (const url of ['https://mvsconvert.de', 'http://staging.mvsconvert.de', 'https://8.8.8.8', 'http://203.0.113.10:3000']) {
      expect(disposableTarget(url), url).toBe(false)
    }
  })

  it('reads an address whole and not in passing', () => {
    // "10.0.0.1.attacker.com" is a name an attacker chooses.
    expect(disposableTarget('http://10.0.0.1.attacker.com')).toBe(false)
    expect(disposableTarget('http://prefix192.168.1.1')).toBe(false)
  })

  it('refuses what it cannot read', () => {
    // AN UNREADABLE TARGET IS NOT A SAFE ONE: defaulting to yes would make
    // every parsing gap a way to attack production.
    expect(disposableTarget('not a url')).toBe(false)
    expect(disposableTarget('')).toBe(false)
  })
})
