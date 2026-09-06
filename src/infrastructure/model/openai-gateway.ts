import type { ModelGateway, Question } from '../../application/ports/model-gateway.js'

export interface OpenAiOptions {
  readonly apiKey: string
  readonly model?: string
  readonly baseUrl?: string
  readonly fetchImpl?: typeof fetch
}

/**
 * Asks a model over the OpenAI API.
 *
 * A TOOL THAT SPEAKS TO ONE VENDOR IS A TOOL HALF THE TEAMS CANNOT TRY. The
 * port already hides which one it is, so a second vendor is one adapter and
 * changes nothing above it.
 *
 * A REFUSAL IS RAISED, NEVER SWALLOWED: an expired key that returned an empty
 * answer would print "nothing found" over a hunt that never happened.
 */
export class OpenAiGateway implements ModelGateway {
  private readonly model: string
  private readonly baseUrl: string
  private readonly fetchImpl: typeof fetch

  constructor(private readonly options: OpenAiOptions) {
    this.model = options.model ?? 'gpt-5.6'
    // OPENAI_BASE_URL IS WHAT EVERY OPENAI-COMPATIBLE SERVER DOCUMENTS, so
    // vLLM, LM Studio or a company gateway work without a line of code here.
    this.baseUrl = options.baseUrl ?? process.env['OPENAI_BASE_URL'] ?? 'https://api.openai.com'
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  async ask(system: string, user: string, maxTokens: number): Promise<string> {
    let response: Response
    try {
      response = await this.fetchImpl(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.options.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          max_completion_tokens: maxTokens,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      })
    } catch (failure) {
      throw new Error(`the model could not be reached: ${(failure as Error).message}`)
    }

    if (!response.ok) {
      throw new Error(`the model refused the request: ${response.status} ${await response.text()}`)
    }

    const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] }
    return payload.choices?.[0]?.message?.content ?? ''
  }

  async askBatch(questions: readonly Question[]): Promise<string[]> {
    const answers: string[] = []
    for (const question of questions) {
      answers.push(await this.ask(question.system, question.user, question.maxTokens))
    }
    return answers
  }
}
