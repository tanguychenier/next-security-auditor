import type { ProofPlan } from '../../domain/value-objects/proof-plan.js'
import type { Proof } from '../../domain/value-objects/proof.js'

/** Executes a proof plan against a running application and reports what happened. */
export interface ProofRunner {
  run(plan: ProofPlan): Promise<Proof>
}
