/**
 * DID THE FIX WORK?
 *
 * The requests that proved each flaw are already written down, so the honest
 * answer is a replay: no model, no bill, no waiting, and the same verdict every
 * time.
 */

import { describe, expect, it } from 'vitest'
import { replay, stillFailing } from '../../src/application/use-cases/recheck.js'
import type { AcceptedProof } from '../../src/domain/policies/accepted-findings.js'
import { Proof, ProofOutcome } from '../../src/domain/value-objects/proof.js'
import type { ProofPlan } from '../../src/domain/value-objects/proof-plan.js'
import type { ProofRunner } from '../../src/application/ports/proof-runner.js'

const prover = (outcome: ProofOutcome): ProofRunner & { calls: number } => {
  const staged = {
    calls: 0,
    async run(plan: ProofPlan) {
      staged.calls += 1
      return Proof.create({
        outcome,
        request: `${plan.method} ${plan.path}`,
        expectation: plan.expectation,
        observed: outcome === ProofOutcome.Reproduced ? '200 OK' : '403 Forbidden',
      })
    },
  }
  return staged
}

const accepted = (plan?: ProofPlan): AcceptedProof => ({
  id: 'aaaaaaaaaaaaaaaa',
  rule: 'missing-authorization',
  file: 'app/api/invoices/[id]/route.ts',
  title: 'The handler answers anyone',
  ...(plan === undefined ? {} : { plan }),
})

const plan: ProofPlan = {
  method: 'GET',
  path: '/api/invoices/1',
  expectation: 'responds 401 or 403',
  reproducesOnStatus: [200],
}

describe('replaying what was already proved', () => {
  it('calls a flaw still answering still open', async () => {
    const result = await replay(prover(ProofOutcome.Reproduced), [accepted(plan)])

    expect(result.stillOpen).toHaveLength(1)
    expect(stillFailing(result)).toBe(true)
  })

  it('calls a flaw that stopped answering closed', async () => {
    const result = await replay(prover(ProofOutcome.NotReproduced), [accepted(plan)])

    expect(result.closed).toHaveLength(1)
    expect(stillFailing(result)).toBe(false)
  })

  it('does not call a proof that could not run a fix', async () => {
    // THE SERVER WAS DOWN IS NOT THE FLAW IS GONE, and counting it as closed
    // would let somebody ship by turning their application off.
    const result = await replay(prover(ProofOutcome.NotRunnable), [accepted(plan)])

    expect(result.closed).toHaveLength(0)
    expect(result.unknown).toHaveLength(1)
  })

  it('cannot replay an entry that carries no request', async () => {
    const result = await replay(prover(ProofOutcome.NotReproduced), [accepted()])

    expect(result.unknown).toHaveLength(1)
  })

  it('asks no model at all', async () => {
    const staged = prover(ProofOutcome.NotReproduced)

    await replay(staged, [accepted(plan)])

    expect(staged.calls).toBe(1)
  })
})
