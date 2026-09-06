/**
 * A HUNT THAT NEEDS NO ACCOUNT AT ALL.
 *
 * The subscription is free for whoever already pays for one, which is not
 * everybody. A local model asks nothing: no key, no signup, no bill, and the
 * source never leaves the machine — the first question anybody asks before
 * pointing a tool at their employer's code.
 */

import { describe, expect, it } from 'vitest'
import { OllamaGateway } from '../../src/infrastructure/model/ollama-gateway.js'

const answering = (body: unknown, ok = true, status = 200) => {
  const seen: { url?: string; init?: RequestInit } = {}
  const fetchImpl = (async (url: string, init: RequestInit) => {
    seen.url = url
    seen.init = init
    return {
      ok,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    }
  }) as unknown as typeof fetch
  return { gateway: new OllamaGateway({ model: 'qwen2.5-coder:7b', fetchImpl }), seen }
}

describe('asking a model on this machine', () => {
  it('returns what the local model answered', async () => {
    const { gateway } = answering({ message: { content: '[]' }, done: true })

    await expect(gateway.ask('system', 'user', 2000)).resolves.toBe('[]')
  })

  it('speaks to the machine it is running on', async () => {
    const { gateway, seen } = answering({ message: { content: '[]' } })

    await gateway.ask('the system prompt', 'the question', 2000)

    expect(seen.url).toBe('http://localhost:11434/api/chat')
    const sent = String(seen.init?.body)
    expect(sent).toContain('qwen2.5-coder:7b')
    expect(sent).toContain('the system prompt')
    // A HUNT WANTS ONE ANSWER, not a stream to reassemble.
    expect(sent).toContain('"stream":false')
  })

  it('says so when nothing is listening locally', async () => {
    // TELLING SOMEBODY THEIR PROJECT IS CLEAN BECAUSE OLLAMA IS NOT RUNNING is
    // the most expensive lie this tool could tell.
    const fetchImpl = (async () => {
      throw new Error('fetch failed')
    }) as unknown as typeof fetch

    await expect(new OllamaGateway({ fetchImpl }).ask('s', 'u', 100)).rejects.toThrow('no model answered')
  })

  it('says so when the model was never pulled', async () => {
    const { gateway } = answering({ error: "model 'nope' not found" }, false, 404)

    await expect(gateway.ask('s', 'u', 100)).rejects.toThrow('404')
  })

  it('asks one thing at a time, because one process holds one copy of the weights', async () => {
    let inFlight = 0
    let highest = 0
    const fetchImpl = (async () => {
      inFlight += 1
      highest = Math.max(highest, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 5))
      inFlight -= 1
      return { ok: true, status: 200, json: async () => ({ message: { content: '[]' } }), text: async () => '' }
    }) as unknown as typeof fetch

    const answers = await new OllamaGateway({ fetchImpl }).askMany('s', 'u', 100, 4)

    expect(answers).toHaveLength(4)
    expect(highest).toBe(1)
  })
})
