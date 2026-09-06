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

  it('keeps a refusal status when something else also counts', () => {
    // A REDIRECT TO A LOGIN PAGE CAN ACCOMPANY A LEAK: the plan stays sound as
    // long as it also recognises an answer that means the flaw.
    expect(
      proofPlan({
        method: 'GET',
        path: '/api/invoices/1',
        expectation: 'responds 401 or 403',
        reproducesOnStatus: [200, 403],
      }).reproducesOnStatus,
    ).toEqual([200, 403])
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
