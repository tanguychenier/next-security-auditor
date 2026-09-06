import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ModelGateway, Question } from '../../application/ports/model-gateway.js'

/**
 * Remembers what was already asked about unchanged code.
 *
 * ASKING THE SAME QUESTION TWICE IS PAYING TWICE. On a subscription that is
 * seconds rather than euros, and seconds decide whether a check runs on every
 * push or once a night.
 *
 * THE KEY IS THE QUESTION ITSELF, prompt and source together, so a file edited
 * by one character is a different question. Answering for code that changed is
 * the one thing a cache must never do: it would report a file as clean because
 * an older version of it was.
 *
 * ONLY THE ANSWER IS KEPT. The cache lives in the audited repository, and
 * writing the source into it would copy somebody's code where they did not
 * choose to put it.
 */
export class CachedGateway implements ModelGateway {
  constructor(
    private readonly gateway: ModelGateway,
    private readonly directory: string,
  ) {}

  async ask(system: string, user: string, maxTokens: number): Promise<string> {
    return (await this.askBatch([{ system, user, maxTokens }]))[0] ?? ''
  }

  async askBatch(questions: readonly Question[]): Promise<string[]> {
    const answers = new Array<string>(questions.length)
    const missing: { at: number; question: Question }[] = []

    questions.forEach((question, at) => {
      const remembered = this.remembered(this.keyFor(question))
      if (remembered === undefined) missing.push({ at, question })
      else answers[at] = remembered
    })

    if (missing.length > 0) {
      const fresh = await this.gateway.askBatch(missing.map((entry) => entry.question))
      missing.forEach((entry, position) => {
        const answer = fresh[position] ?? ''
        answers[entry.at] = answer
        this.remember(this.keyFor(entry.question), answer)
      })
    }

    return [...answers]
  }

  private keyFor(question: Question): string {
    return createHash('sha256')
      .update(`${question.system}\0${question.user}\0${question.maxTokens}`)
      .digest('hex')
  }

  private remembered(key: string): string | undefined {
    const path = join(this.directory, `${key}.txt`)
    try {
      return existsSync(path) ? readFileSync(path, 'utf8') : undefined
    } catch {
      return undefined
    }
  }

  /**
   * A CACHE IS AN OPTIMISATION. Failing a hunt because a directory is read-only
   * would trade a real answer for a disk problem.
   */
  private remember(key: string, answer: string): void {
    try {
      if (!existsSync(this.directory)) mkdirSync(this.directory, { recursive: true })
      writeFileSync(join(this.directory, `${key}.txt`), answer, 'utf8')
    } catch {
      // nothing to do: the hunt already has its answer
    }
  }
}
