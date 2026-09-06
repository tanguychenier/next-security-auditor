/**
 * ASKING THE SAME QUESTION ABOUT UNCHANGED CODE IS PAYING TWICE.
 *
 * What it must never do is answer for code that changed. The key is the
 * question itself, so a file edited by one character is a different question.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { CachedGateway } from '../../src/infrastructure/model/cached-gateway.js'
import type { ModelGateway, Question } from '../../src/application/ports/model-gateway.js'

class Counting implements ModelGateway {
  asked: Question[] = []

  constructor(private readonly answer = '[]') {}

  async ask(system: string, user: string, maxTokens: number): Promise<string> {
    return (await this.askBatch([{ system, user, maxTokens }]))[0] ?? ''
  }

  async askBatch(questions: readonly Question[]): Promise<string[]> {
    this.asked.push(...questions)
    return questions.map(() => this.answer)
  }
}

let directory = ''

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'hunt-cache-'))
})

afterEach(() => {
  rmSync(directory, { recursive: true, force: true })
})

describe('remembering what was already asked', () => {
  it('asks once for the same question', async () => {
    const inner = new Counting()
    const cached = new CachedGateway(inner, directory)

    await cached.askBatch([{ system: 's', user: 'u', maxTokens: 10 }])
    await cached.askBatch([{ system: 's', user: 'u', maxTokens: 10 }])

    expect(inner.asked).toHaveLength(1)
  })

  it('gives back the same answer', async () => {
    const cached = new CachedGateway(new Counting('[{"kind":"ssrf"}]'), directory)
    const question = [{ system: 's', user: 'u', maxTokens: 10 }]

    expect(await cached.askBatch(question)).toEqual(await cached.askBatch(question))
  })

  it('treats a character of difference as a different question', async () => {
    // ANSWERING FOR CODE THAT CHANGED would report a file as clean because an
    // older version of it was.
    const inner = new Counting()
    const cached = new CachedGateway(inner, directory)

    await cached.askBatch([{ system: 's', user: 'class A {}', maxTokens: 10 }])
    await cached.askBatch([{ system: 's', user: 'class B {}', maxTokens: 10 }])

    expect(inner.asked).toHaveLength(2)
  })

  it('treats a new set of rules as a new question', async () => {
    const inner = new Counting()
    const cached = new CachedGateway(inner, directory)

    await cached.askBatch([{ system: 'hunt ssrf', user: 'u', maxTokens: 10 }])
    await cached.askBatch([{ system: 'hunt ssrf and idor', user: 'u', maxTokens: 10 }])

    expect(inner.asked).toHaveLength(2)
  })

  it('slows the hunt rather than stopping it when it cannot write', async () => {
    // A CACHE IS AN OPTIMISATION: failing the hunt because a path is not a
    // directory would trade a real answer for a disk problem.
    const blocked = join(directory, 'a-file-not-a-directory')
    writeFileSync(blocked, 'in the way', 'utf8')
    const cached = new CachedGateway(new Counting(), join(blocked, 'cache'))

    expect(await cached.askBatch([{ system: 's', user: 'u', maxTokens: 10 }])).toEqual(['[]'])
  })

  it('keeps only the answer, never the source', async () => {
    // THE CACHE SITS IN THEIR REPOSITORY: writing the audited source into it
    // would copy their code somewhere they did not choose.
    const cached = new CachedGateway(new Counting(), directory)
    await cached.askBatch([{ system: 's', user: 'the secret source', maxTokens: 10 }])

    for (const file of readdirSync(directory)) {
      expect(readFileSync(join(directory, file), 'utf8')).not.toContain('the secret source')
    }
  })
})
