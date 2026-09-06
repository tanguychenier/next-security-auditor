/**
 * NOBODY SHOULD DISCOVER THE BILL AFTER THE AUDIT.
 *
 * vulnhuntr sends a codebase to a frontier model and tells you the price when
 * your invoice arrives. On a large repository that is a real amount of money
 * spent on a tool you have not evaluated yet, which is a good reason not to
 * try it — and a tool nobody tries collects no stars.
 *
 * The estimate is deliberately pessimistic. Being told 4 euros and paying 3 is
 * a good surprise; the reverse is the last time that person runs the tool.
 */

import { describe, expect, it } from 'vitest'
import { estimateAudit } from '../../src/domain/policies/cost-estimate.js'
import type { SurfaceEntry } from '../../src/domain/value-objects/surface-entry.js'

const entry = (file: string): SurfaceEntry => ({ kind: 'route-handler', file, methods: ['GET'] })

const PRICING = { inputPerMillion: 3, outputPerMillion: 15 }

describe('estimating what an audit will cost before spending anything', () => {
  it('grows with the amount of source actually sent', () => {
    const small = estimateAudit([{ entry: entry('a.ts'), characters: 1_000 }], PRICING)
    const large = estimateAudit([{ entry: entry('a.ts'), characters: 100_000 }], PRICING)

    expect(large.inputTokens).toBeGreaterThan(small.inputTokens)
    expect(large.euros).toBeGreaterThan(small.euros)
  })

  it('counts one audit pass and one proof pass per surface entry', () => {
    // THE PROOF PASS IS NOT FREE and hiding it would make the estimate a lie.
    const one = estimateAudit([{ entry: entry('a.ts'), characters: 4_000 }], PRICING)

    expect(one.passes).toBe(2)
  })

  it('rounds the price up to the cent, never down', () => {
    const estimate = estimateAudit([{ entry: entry('a.ts'), characters: 3 }], PRICING)

    expect(estimate.euros).toBeGreaterThan(0)
    expect(Number.isInteger(Math.round(estimate.euros * 100))).toBe(true)
  })

  it('costs nothing when there is nothing to audit', () => {
    const estimate = estimateAudit([], PRICING)

    expect(estimate).toMatchObject({ euros: 0, inputTokens: 0, passes: 0 })
  })
})
