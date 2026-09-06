/** An HTTP request written so a human could send it by hand with curl. */
export interface ProofPlan {
  readonly method: string
  readonly path: string
  readonly headers?: Readonly<Record<string, string>>
  readonly body?: string
  /** What a correctly behaving application must answer. */
  readonly expectation: string
  /** Status codes that mean the flaw happened. */
  readonly reproducesOnStatus: readonly number[]
  /** A string whose presence in the body also means the flaw happened. */
  readonly reproducesOnBodyContaining?: string
}
