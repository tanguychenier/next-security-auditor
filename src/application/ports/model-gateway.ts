/**
 * One question to a model, one answer back.
 *
 * The port exists so the same hunt runs on a paid API key or on the
 * subscription a developer already has, without a use case, a prompt or a
 * parser knowing which one it is.
 */
export interface ModelGateway {
  ask(system: string, user: string, maxTokens: number): Promise<string>

  /**
   * Asks a set of unrelated questions at once, answering in the order asked.
   *
   * EVERY QUESTION OF A HUNT IS INDEPENDENT: a different file for each entry,
   * and independent samples within one entry. Walking that set one at a time
   * turned a four-entry hunt into ten minutes on a live run.
   */
  askBatch(questions: readonly Question[]): Promise<string[]>
}

export interface Question {
  readonly system: string
  readonly user: string
  readonly maxTokens: number
}
