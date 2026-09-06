import type { ModelGateway, Question } from '../../application/ports/model-gateway.js'

export interface OllamaOptions {
  readonly model?: string
  readonly baseUrl?: string
  readonly fetchImpl?: typeof fetch
}

const DEFAULT_MODEL = 'qwen2.5-coder:7b'

/**
 * Asks a model running on this machine.
 *
 * A HUNT THAT NEEDS NO ACCOUNT AT ALL. The subscription is free for whoever
 * already pays for one, which is not everybody. A local model asks nothing: no
 * key, no signup, no bill.
 *
 * And the source never leaves the machine, which is the first question anybody
 * asks before pointing a tool at their employer's code. Here the answer is not
 * a policy to read, it is a socket on localhost.
 */
export class OllamaGateway implements ModelGateway {
  private readonly model: string
  private readonly baseUrl: string
  private readonly fetchImpl: typeof fetch

  constructor(options: OllamaOptions = {}) {
    this.model = options.model ?? DEFAULT_MODEL
    // OLLAMA_HOST IS THE VARIABLE OLLAMA ITSELF READS. A team running the model
    // on the one machine with a GPU should not have to fork the tool to reach it.
    this.baseUrl = options.baseUrl ?? process.env['OLLAMA_HOST'] ?? 'http://localhost:11434'
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  async ask(system: string, user: string, maxTokens: number): Promise<string> {
    let response: Response
    try {
      response = await this.fetchImpl(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          // A HUNT WANTS ONE ANSWER, not a stream to reassemble.
          stream: false,
          options: { num_predict: maxTokens },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      })
    } catch (failure) {
      // TELLING SOMEBODY THEIR PROJECT IS CLEAN BECAUSE OLLAMA IS NOT RUNNING
      // is the most expensive lie this tool could tell.
      throw new Error(`no model answered at ${this.baseUrl}: ${(failure as Error).message}`)
    }

    if (!response.ok) {
      throw new Error(`the local model refused: ${response.status} ${await response.text()}`)
    }

    const payload = (await response.json()) as { message?: { content?: string } }
    return payload.message?.content ?? ''
  }


  /**
   * One at a time, on purpose.
   *
   * A local model is one process on one machine, usually holding a single copy
   * of the weights. Asking it four things at once does not make it four times
   * faster; it makes it swap.
   */
  async askBatch(questions: readonly Question[]): Promise<string[]> {
    const answers: string[] = []
    for (const question of questions) {
      answers.push(await this.ask(question.system, question.user, question.maxTokens))
    }
    return answers
  }
}
