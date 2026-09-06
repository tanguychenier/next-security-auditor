import type { ModelGateway } from '../../application/ports/model-gateway.js'

export interface ApiOptions {
  readonly apiKey: string
  readonly model?: string
  readonly baseUrl?: string
  readonly fetchImpl?: typeof fetch
}

/**
 * Asks the model over the paid API.
 *
 * Kept for the one place the subscription cannot reach: a CI runner, where
 * nobody is signed in. A REFUSAL IS RAISED, NEVER SWALLOWED — an expired key
 * that returned an empty answer would print "nothing found" over a hunt that
 * never happened.
 */
export class AnthropicApiGateway implements ModelGateway {
  private readonly model: string
  private readonly baseUrl: string
  private readonly fetchImpl: typeof fetch

  constructor(private readonly options: ApiOptions) {
    this.model = options.model ?? 'claude-sonnet-4-5-20250929'
    this.baseUrl = options.baseUrl ?? 'https://api.anthropic.com'
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  async ask(system: string, user: string, maxTokens: number): Promise<string> {
    const response = await this.fetchImpl(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.options.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    })
    if (!response.ok) {
      throw new Error(`the model refused the request: ${response.status} ${await response.text()}`)
    }
    const payload = (await response.json()) as { content?: { type: string; text?: string }[] }
    return (payload.content ?? [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text ?? '')
      .join('')
  }
}
