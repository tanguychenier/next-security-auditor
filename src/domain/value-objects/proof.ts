/**
 * What happened when the proof was actually executed against the application.
 *
 * There is no "probably" and no confidence score on purpose. A confidence score
 * is the model's opinion about its own opinion; it moves the burden back onto
 * the reader, which is the thing this tool refuses to do.
 */
export enum ProofOutcome {
  /** The flaw happened. The reader can replay the request and see it too. */
  Reproduced = 'reproduced',
  /** The application behaved correctly. The finding was a false positive. */
  NotReproduced = 'not-reproduced',
  /** The proof never executed : no target, a crash, a timeout. Proves nothing. */
  NotRunnable = 'not-runnable',
}

export interface ProofShape {
  readonly outcome: ProofOutcome
  /** The exact thing that was sent, written so a human can repeat it by hand. */
  readonly request: string
  /** What a correctly behaving application should have answered. */
  readonly expectation: string
  /** What it answered instead. */
  readonly observed: string
}

export class Proof {
  private constructor(
    readonly outcome: ProofOutcome,
    readonly request: string,
    readonly expectation: string,
    readonly observed: string,
  ) {}

  static create(shape: ProofShape): Proof {
    for (const [field, value] of Object.entries({
      request: shape.request,
      expectation: shape.expectation,
      observed: shape.observed,
    })) {
      if (value.trim().length === 0) {
        throw new TypeError(`a proof records its ${field}: without it nobody can replay it`)
      }
    }
    return new Proof(shape.outcome, shape.request.trim(), shape.expectation.trim(), shape.observed.trim())
  }

  get reproduced(): boolean {
    return this.outcome === ProofOutcome.Reproduced
  }
}
