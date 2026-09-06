/**
 * SOME FLAWS NEED MORE THAN ONE REQUEST TO SHOW THEMSELVES.
 *
 * One POST answering 200 says nothing about the fifty-first, so a missing limit
 * was excluded rather than reported on a proof that could not fail.
 */

import { describe, expect, it } from 'vitest'
import { boundedRepeat, runSequence } from '../../src/application/use-cases/run-sequence.js'
import { Proof, ProofOutcome } from '../../src/domain/value-objects/proof.js'
import type { ProofPlan } from '../../src/domain/value-objects/proof-plan.js'
import type { ProofRunner } from '../../src/application/ports/proof-runner.js'

const plan: ProofPlan = {
  method: 'POST',
  path: '/api/login',
  expectation: 'starts refusing after a few attempts',
  reproducesOnStatus: [200],
}

const prover = (outcome: ProofOutcome, refuseAfter?: number): ProofRunner & { calls: number } => {
  const staged = {
    calls: 0,
    async run(): Promise<Proof> {
      staged.calls += 1
      const answer = refuseAfter !== undefined && staged.calls > refuseAfter ? ProofOutcome.NotReproduced : outcome
      return Proof.create({
        outcome: answer,
        request: 'POST /api/login',
        expectation: 'refuses',
        observed: answer === ProofOutcome.Reproduced ? '200' : '429',
      })
    },
  }
  return staged
}

describe('a run of requests where one shows nothing', () => {
  it('shows the flaw when nothing ever refuses', async () => {
    const staged = prover(ProofOutcome.Reproduced)

    const proof = await runSequence(staged, plan, 10)

    expect(proof.reproduced).toBe(true)
    expect(staged.calls).toBe(10)
    expect(proof.observed).toContain('10 of 10')
  })

  it('stops at the first refusal rather than finishing the run', async () => {
    // THE APPLICATION DEFENDED ITSELF, which is what was being checked. Sending
    // the rest would only be rude.
    const staged = prover(ProofOutcome.Reproduced, 3)

    const proof = await runSequence(staged, plan, 50)

    expect(proof.reproduced).toBe(false)
    expect(staged.calls).toBe(4)
    expect(proof.observed).toContain('refused')
  })

  it('proves nothing when the server stopped answering', async () => {
    const proof = await runSequence(prover(ProofOutcome.NotRunnable), plan, 10)

    expect(proof.outcome).toBe(ProofOutcome.NotRunnable)
  })

  it('says what was sent so a reader can repeat it', async () => {
    const proof = await runSequence(prover(ProofOutcome.Reproduced), plan, 8)

    expect(proof.request).toContain('POST /api/login')
    expect(proof.request).toContain('8 times')
  })

  it('never sends fewer than it takes, nor enough to be an outage', () => {
    // A PROOF IS A REAL ATTACK: two requests demonstrate nothing, a thousand
    // are a denial of service whoever asked for them.
    expect(boundedRepeat(2)).toBe(5)
    expect(boundedRepeat(5_000)).toBe(100)
    expect(boundedRepeat(20)).toBe(20)
  })
})
