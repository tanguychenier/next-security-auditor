/**
 * A PLAN THAT RECOGNISES THE APPLICATION DEFENDING ITSELF IS INVERTED.
 *
 * Seen from a real model: `reproducesOnBodyContaining: "Unauthorized access"`.
 * That says the flaw is demonstrated when the application answers that access
 * was denied — which is the application working. Measured on a local model,
 * half the plans came out this way.
 *
 * Such a plan can only produce a false negative: it runs, it fails, and a real
 * flaw is quietly reported as not reproduced.
 */

import { describe, expect, it } from 'vitest'
import { proofPlan } from '../../src/domain/value-objects/proof-plan.js'

describe('refusing a plan written backwards', () => {
  it('refuses a marker that means the application held', () => {
    for (const marker of ['Unauthorized access', 'Access Denied', '403 Forbidden', 'Please log in', 'Authentication required']) {
      expect(() => proofPlan({
        method: 'GET',
        path: '/api/invoices/1',
        expectation: 'responds 401 or 403',
        reproducesOnStatus: [200],
        reproducesOnBodyContaining: marker,
      }), marker).toThrow('defending itself')
    }
  })

  it('refuses to reproduce on the status of a refusal', () => {
    for (const statuses of [[401], [403], [401, 403], [404]]) {
      expect(() => proofPlan({
        method: 'GET',
        path: '/api/invoices/1',
        expectation: 'responds 401 or 403',
        reproducesOnStatus: statuses,
      }), statuses.join(',')).toThrow('defending itself')
    }
  })

  it('drops a refusal status even when something else also counts', () => {
    // THE RUNNER ASKS `includes`, SO A STATUS IN THE LIST IS A PROOF. Keeping
    // 403 next to 200 did not make the plan tolerant of a redirect, it made a
    // 403 count as the flaw. A redirect still works: 302 is not a refusal here,
    // only the statuses that mean the application handed nothing over are.
    expect(
      proofPlan({
        method: 'GET',
        path: '/api/invoices/1',
        expectation: 'responds 401 or 403',
        reproducesOnStatus: [200, 403],
      }).reproducesOnStatus,
    ).toEqual([200])
  })

  it('keeps a redirect, which can accompany a leak', () => {
    expect(
      proofPlan({
        method: 'GET',
        path: '/api/invoices/1',
        expectation: 'responds 401 or 403',
        reproducesOnStatus: [200, 302],
      }).reproducesOnStatus,
    ).toEqual([200, 302])
  })

  it('accepts a marker taken from the data itself', () => {
    expect(
      proofPlan({
        method: 'GET',
        path: '/api/invoices/1',
        expectation: 'responds 401 or 403',
        reproducesOnStatus: [200],
        reproducesOnBodyContaining: 'total_ht',
      }).reproducesOnBodyContaining,
    ).toBe('total_ht')
  })

  it('still refuses a plan nothing could falsify', () => {
    expect(() => proofPlan({
      method: 'GET',
      path: '/api/invoices/1',
      expectation: 'responds 401 or 403',
      reproducesOnStatus: [],
    })).toThrow('never fail')
  })
})

describe('a plan that would accept the application defending itself', () => {
  // MEASURED ON A REAL RUN, not imagined. For an uncovered middleware path the
  // model answered [200, 404]; the page did not exist, the server said 404, and
  // the hunt reported a proven vulnerability whose whole evidence was the
  // application not having that page. Refusing only when every status was a
  // refusal let one through, and one is enough.

  it('drops a refusal status sitting next to a real one', () => {
    const plan = proofPlan({
      method: 'GET',
      path: '/dashboard/admin',
      expectation: 'the middleware runs and refuses',
      reproducesOnStatus: [200, 404],
    })

    expect(plan.reproducesOnStatus).toEqual([200])
  })

  it('drops every refusal status, whichever they are', () => {
    const plan = proofPlan({
      method: 'GET',
      path: '/api/x',
      expectation: 'refuses',
      reproducesOnStatus: [401, 200, 403, 405, 407],
    })

    expect(plan.reproducesOnStatus).toEqual([200])
  })

  it('still refuses a plan left with nothing to recognise', () => {
    expect(() =>
      proofPlan({
        method: 'GET',
        path: '/api/x',
        expectation: 'refuses',
        reproducesOnStatus: [401, 404],
      }),
    ).toThrow('recognises the application defending itself')
  })

  it('keeps a plan that recognises the flaw by its body alone', () => {
    const plan = proofPlan({
      method: 'GET',
      path: '/',
      expectation: 'the bundle carries no secret',
      reproducesOnStatus: [404],
      reproducesOnBodyContaining: 'sk_live_',
    })

    expect(plan.reproducesOnStatus).toEqual([])
    expect(plan.reproducesOnBodyContaining).toBe('sk_live_')
  })
})
