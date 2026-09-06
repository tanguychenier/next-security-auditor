/**
 * THE ONE THING THAT OUTLIVES THE TOOL.
 *
 * A report is read once. A test committed to the repository runs on every push
 * forever, and holds the flaw closed even if this tool is uninstalled.
 */

import { describe, expect, it } from 'vitest'
import { regressionTestFor, testFileNameFor } from '../../src/infrastructure/report/regression-test.js'
import type { AcceptedProof } from '../../src/domain/policies/accepted-findings.js'

const accepted: AcceptedProof = {
  id: 'aaaaaaaaaaaaaaaa',
  rule: 'missing-authorization',
  file: 'app/api/invoices/[id]/route.ts',
  title: 'Invoice readable without a session',
  plan: {
    method: 'GET',
    path: '/api/invoices/1',
    expectation: 'responds 401 or 403.',
    reproducesOnStatus: [200],
  },
}

describe('the test a team commits', () => {
  it('runs in their own suite with no tool installed', () => {
    const written = regressionTestFor(accepted) ?? ''

    expect(written).toContain("import { describe, expect, it } from 'vitest'")
    expect(written).toContain('/api/invoices/1')
  })

  it('asserts the application refuses rather than answers', () => {
    // THE TEST IS THE MIRROR OF THE PROOF: the hunt reported the flaw because a
    // 200 came back, and the test passes when it no longer does.
    expect(regressionTestFor(accepted)).toContain('expect([200]).not.toContain(response.status)')
  })

  it('does not follow a redirect, the way the hunt did not', () => {
    // A 302 TO A LOGIN PAGE IS THE APPLICATION DEFENDING ITSELF. Following it
    // would land on a 200 and turn correct behaviour into a failing test.
    expect(regressionTestFor(accepted)).toContain("redirect: 'manual'")
  })

  it('carries the identity so the baseline and the test stay linked', () => {
    expect(regressionTestFor(accepted)).toContain('aaaaaaaaaaaaaaaa')
  })

  it('writes nothing for a flaw it cannot send a request for', () => {
    const { plan, ...without } = accepted
    expect(plan).toBeDefined()
    expect(regressionTestFor(without)).toBeUndefined()
  })

  it('names the file after what it holds', () => {
    expect(testFileNameFor(accepted)).toBe('MissingAuthorization.aaaaaaaaaaaaaaaa.test.ts')
  })
})
