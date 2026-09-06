/**
 * The proof runner decides whether a flaw is real, so its mistakes are the
 * expensive kind. These tests pin the two that matter.
 */

import { describe, expect, it } from 'vitest'
import { HttpProofRunner } from '../../src/infrastructure/proof/http-proof-runner.js'
import { ProofOutcome } from '../../src/domain/value-objects/proof.js'
import type { ProofPlan } from '../../src/domain/value-objects/proof-plan.js'

const plan: ProofPlan = {
  method: 'GET',
  path: '/api/invoices/1',
  expectation: 'responds 401 or 403 without a session',
  reproducesOnStatus: [200],
}

const answering = (status: number, body = ''): typeof fetch =>
  (async () => new Response(body, { status })) as unknown as typeof fetch

describe('running a proof against a live application', () => {
  it('reproduces when the forbidden request succeeds', async () => {
    const proof = await new HttpProofRunner('http://localhost:3000', 5_000, answering(200, '{"total":42}')).run(plan)

    expect(proof.outcome).toBe(ProofOutcome.Reproduced)
    expect(proof.request).toBe('GET http://localhost:3000/api/invoices/1')
  })

  it('does not reproduce when the application refuses', async () => {
    const proof = await new HttpProofRunner('http://localhost:3000', 5_000, answering(401)).run(plan)

    expect(proof.outcome).toBe(ProofOutcome.NotReproduced)
  })

  it('treats a redirect to a login page as a refusal, not as a flaw', async () => {
    // FOLLOWING IT WOULD LAND ON A 200 and report the login page as the leak.
    const proof = await new HttpProofRunner('http://localhost:3000', 5_000, answering(302)).run(plan)

    expect(proof.outcome).toBe(ProofOutcome.NotReproduced)
  })

  it('separates an unreachable server from a defended one', async () => {
    const broken = (async () => { throw new Error('ECONNREFUSED') }) as unknown as typeof fetch

    const proof = await new HttpProofRunner('http://localhost:3000', 5_000, broken).run(plan)

    expect(proof.outcome).toBe(ProofOutcome.NotRunnable)
    expect(proof.observed).toContain('ECONNREFUSED')
  })

  it('reproduces when a leaked secret appears in the body, whatever the status', async () => {
    const leaking: ProofPlan = { ...plan, reproducesOnStatus: [], reproducesOnBodyContaining: 'sk_live_' }

    const proof = await new HttpProofRunner('http://localhost:3000', 5_000,
      answering(200, 'window.__ENV={"stripe":"sk_live_abc"}')).run(leaking)

    expect(proof.outcome).toBe(ProofOutcome.Reproduced)
  })
})
