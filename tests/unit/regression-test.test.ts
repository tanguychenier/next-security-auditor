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

describe('what the model wrote is input, not source', () => {
  // THIS FILE IS COMMITTED AND RUN BY SOMEBODY'S CI ON EVERY PUSH. A quote in a
  // path, a `*/` in a title, a newline in an expectation: each one closed the
  // literal or the comment it sat in and left executable code behind it.

  it('keeps a quoted path inside its literal', () => {
    const path = "/x', { method: 'GET' }); process.exit(1); ('"

    const written = regressionTestFor({ ...accepted, plan: { ...accepted.plan!, path } }) ?? ''

    // The payload survives as text and is inert, which is the whole point: it
    // sits inside one string argument instead of closing it.
    expect(written).toContain(`await fetch(${JSON.stringify(`http://localhost:3000${path}`)}, {`)
    expect(written.match(/await fetch\(/g)).toHaveLength(1)
  })

  it('keeps a quoted method inside its literal', () => {
    const method = "GET', redirect: 'manual' }); process.exit(1); ('"

    const written = regressionTestFor({ ...accepted, plan: { ...accepted.plan!, method } }) ?? ''

    expect(written).toContain(`method: ${JSON.stringify(method)}, redirect: 'manual' })`)
  })

  it('keeps a title from closing the comment it sits in', () => {
    const written = regressionTestFor({ ...accepted, title: 'oops */ process.exit(1); /*' }) ?? ''

    expect(written).not.toContain('*/ process.exit(1);')
  })

  it('keeps an expectation on the one line it was given', () => {
    const written =
      regressionTestFor({
        ...accepted,
        plan: { ...accepted.plan!, expectation: 'refuses\n    process.exit(1)' },
      }) ?? ''

    expect(written).toContain('A sound application refuses instead: refuses process.exit(1)')
  })

  it('asserts on the body when the body is what proved the flaw', () => {
    // A SOUND APPLICATION ANSWERS 200 HERE TOO. Asserting on the status alone
    // wrote a test that fails after the key is removed, and a team deletes a
    // test that lies to them.
    const written =
      regressionTestFor({
        ...accepted,
        plan: { ...accepted.plan!, reproducesOnStatus: [], reproducesOnBodyContaining: 'sk_live_' },
      }) ?? ''

    expect(written).toContain('expect(await response.text()).not.toContain("sk_live_")')
    expect(written).not.toContain('response.status')
  })

  it('asserts on both when both proved it', () => {
    const written =
      regressionTestFor({
        ...accepted,
        plan: { ...accepted.plan!, reproducesOnStatus: [200], reproducesOnBodyContaining: 'sk_live_' },
      }) ?? ''

    expect(written).toContain('expect([200]).not.toContain(response.status)')
    expect(written).toContain('expect(await response.text()).not.toContain("sk_live_")')
  })

  it('refuses to write outside the directory it was given', () => {
    expect(testFileNameFor({ ...accepted, rule: '../../../../tmp/pwned' })).not.toContain('/')
    expect(testFileNameFor({ ...accepted, id: '../escape' })).not.toContain('/')
  })
})
