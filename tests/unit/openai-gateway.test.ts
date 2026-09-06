/**
 * A TOOL THAT SPEAKS TO ONE VENDOR IS A TOOL HALF THE TEAMS CANNOT TRY.
 *
 * The port already hides which vendor it is, so a second one is one adapter and
 * changes nothing above it.
 */

import { describe, expect, it } from 'vitest'
import { OpenAiGateway } from '../../src/infrastructure/model/openai-gateway.js'

const answering = (body: unknown, ok = true, status = 200) => {
  const seen: { url?: string; init?: RequestInit } = {}
  const fetchImpl = (async (url: string, init: RequestInit) => {
    seen.url = url
    seen.init = init
    return { ok, status, json: async () => body, text: async () => JSON.stringify(body) }
  }) as unknown as typeof fetch
  return { gateway: new OpenAiGateway({ apiKey: 'sk-test', fetchImpl }), seen }
}

describe('asking a model over the OpenAI API', () => {
  it('returns what the model answered', async () => {
    const { gateway } = answering({ choices: [{ message: { content: '[]' } }] })

    await expect(gateway.ask('system', 'user', 2000)).resolves.toBe('[]')
  })

  it('sends the key and both halves of the question', async () => {
    const { gateway, seen } = answering({ choices: [{ message: { content: '[]' } }] })

    await gateway.ask('the system prompt', 'the question', 2000)

    expect(seen.url).toBe('https://api.openai.com/v1/chat/completions')
    expect((seen.init?.headers as Record<string, string>)['authorization']).toBe('Bearer sk-test')
    const sent = String(seen.init?.body)
    expect(sent).toContain('the system prompt')
    expect(sent).toContain('the question')
  })

  it('raises a refusal rather than reporting a clean project', async () => {
    // An expired key that returned an empty answer would print "nothing found"
    // over a hunt that never happened.
    const { gateway } = answering({ error: { message: 'invalid api key' } }, false, 401)

    await expect(gateway.ask('s', 'u', 100)).rejects.toThrow('401')
  })

  it('says so when the API could not be reached at all', async () => {
    const fetchImpl = (async () => {
      throw new Error('fetch failed')
    }) as unknown as typeof fetch

    await expect(new OpenAiGateway({ apiKey: 'sk-test', fetchImpl }).ask('s', 'u', 100)).rejects.toThrow(
      'could not be reached',
    )
  })

  it('answers a batch in the order it was asked', async () => {
    let at = 0
    const fetchImpl = (async () => {
      at += 1
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: `answer ${at}` } }] }),
        text: async () => '',
      }
    }) as unknown as typeof fetch

    const answers = await new OpenAiGateway({ apiKey: 'sk-test', fetchImpl }).askBatch([
      { system: 's', user: 'one', maxTokens: 10 },
      { system: 's', user: 'two', maxTokens: 10 },
    ])

    expect(answers).toEqual(['answer 1', 'answer 2'])
  })
})

describe('reaching an OpenAI-compatible server that is not OpenAI', () => {
  it('honours OPENAI_BASE_URL, so vLLM or a company gateway works unchanged', async () => {
    const seen: string[] = []
    const fetchImpl = (async (url: string) => {
      seen.push(url)
      return { ok: true, status: 200, json: async () => ({ choices: [] }), text: async () => '' }
    }) as unknown as typeof fetch
    process.env['OPENAI_BASE_URL'] = 'http://gpu-box:8000'
    try {
      await new OpenAiGateway({ apiKey: 'sk-test', fetchImpl }).ask('s', 'u', 10)
    } finally {
      delete process.env['OPENAI_BASE_URL']
    }

    expect(seen[0]).toBe('http://gpu-box:8000/v1/chat/completions')
  })
})
