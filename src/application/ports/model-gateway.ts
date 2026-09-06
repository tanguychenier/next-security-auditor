/**
 * One question to a model, one answer back.
 *
 * The port exists so the same hunt runs on a paid API key or on the
 * subscription a developer already has, without a use case, a prompt or a
 * parser knowing which one it is.
 */
export interface ModelGateway {
  ask(system: string, user: string, maxTokens: number): Promise<string>
}
