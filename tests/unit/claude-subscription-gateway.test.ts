/**
 * THE HUNT RUNS ON THE SUBSCRIPTION THE DEVELOPER ALREADY PAYS FOR.
 *
 * An API key bills per token, and a tool that charges a few euros every time
 * somebody tries it is a tool most people never try twice. The local CLI is
 * already signed in, so a hunt costs nothing beyond the plan.
 *
 * Nothing below spawns anything: the command is data until it runs.
 */

import { describe, expect, it } from 'vitest'
import { ClaudeSubscriptionGateway } from '../../src/infrastructure/model/claude-subscription-gateway.js'

const answering = (stdout: string, exitCode = 0) => {
  const seen: { command: string[]; input: string } = { command: [], input: '' }
  const gateway = new ClaudeSubscriptionGateway({
    model: 'haiku',
    run: async (command, input) => {
      seen.command = [...command]
      seen.input = input
      return { exitCode, stdout, stderr: exitCode === 0 ? '' : 'claude: command not found' }
    },
  })
  return { gateway, seen }
}

describe('asking the model through the subscription', () => {
  it('returns what the model answered', async () => {
    const { gateway } = answering('{"result":"[]","is_error":false}')

    await expect(gateway.ask('system', 'user', 2000)).resolves.toBe('[]')
  })

  it('sends no API key, because there is none to send', async () => {
    // THIS IS THE WHOLE POINT. A key on the command line would mean a bill,
    // and the reason to use this gateway would be gone.
    const { gateway, seen } = answering('{"result":"[]","is_error":false}')

    await gateway.ask('system', 'user', 2000)

    expect(seen.command.join(' ')).not.toContain('sk-ant')
    expect(seen.command).not.toContain('ANTHROPIC_API_KEY')
  })

  it('asks for JSON and for no tools at all', async () => {
    // A HUNT NEEDS AN ANSWER, NOT AN AGENT. Leaving tools enabled lets the
    // model wander through the audited project on its own, which is exactly
    // what this tool promises never to do.
    const { gateway, seen } = answering('{"result":"[]","is_error":false}')

    await gateway.ask('the system prompt', 'the user message', 2000)

    expect(seen.command).toContain('--print')
    expect(seen.command).toContain('--output-format')
    expect(seen.command).toContain('json')
    expect(seen.command).toContain('--allowed-tools')
    expect(seen.command).toContain('the system prompt')
    expect(seen.input).toBe('the user message')
  })

  it('does not let the operator settings choose the language of the report', async () => {
    // MEASURED: on a machine holding "language": "fr", the CLI applied it over
    // the system prompt and a whole hunt came back in French. That text lands
    // in SARIF and in pull request annotations, so the same repository read
    // differently depending on who scanned it.
    const { gateway, seen } = answering('{"result":"[]","is_error":false}')

    await gateway.ask('the system prompt', 'the user message', 2000)

    expect(seen.command).toContain('--settings')
    expect(seen.command).toContain('{"language":"en"}')
  })

  it('carries the chosen model', async () => {
    const { gateway, seen } = answering('{"result":"[]","is_error":false}')

    await gateway.ask('s', 'u', 2000)

    expect(seen.command).toContain('haiku')
  })

  it('says so when the command is not installed', async () => {
    // TELLING SOMEBODY THEIR PROJECT IS CLEAN BECAUSE A BINARY IS MISSING is
    // the most expensive lie this tool could tell.
    const { gateway } = answering('', 127)

    await expect(gateway.ask('s', 'u', 2000)).rejects.toThrow('claude')
  })

  it('says so when the subscription refuses', async () => {
    const { gateway } = answering('{"result":"usage limit reached","is_error":true}')

    await expect(gateway.ask('s', 'u', 2000)).rejects.toThrow('usage limit reached')
  })

  it('says so when the answer is not JSON at all', async () => {
    const { gateway } = answering('Welcome to Claude Code!')

    await expect(gateway.ask('s', 'u', 2000)).rejects.toThrow('could not be read')
  })
})
