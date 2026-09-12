/**
 * THE COMMAND, DRIVEN WITHOUT A PROCESS.
 *
 * Its neighbour spawns the built binary, which is the truth about how people
 * run it and the reason it is kept. It is also slow, so it covers the paths
 * that matter most and leaves the rest — every refusal, every format, every
 * message printed once — untested, because each case costs a process.
 *
 * Here the command is a function: the argv, the environment and the two streams
 * are arguments, so a branch costs a few lines instead of a spawn.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createServer, type Server, type IncomingMessage } from 'node:http'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { gatewayFor, run, type Output } from '../../src/cli/main.js'

const shop = fileURLToPath(new URL('../fixtures/shop', import.meta.url))

const listen = (server: Server): Promise<number> =>
  new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve((server.address() as { port: number }).port)))

const read = (request: IncomingMessage): Promise<string> =>
  new Promise((resolve) => {
    let body = ''
    request.on('data', (chunk) => (body += chunk))
    request.on('end', () => resolve(body))
  })

const FOUND = JSON.stringify([
  {
    title: 'Invoice readable without a session',
    kind: 'broken-object-level-authorization',
    file: 'app/api/invoices/[id]/route.ts',
    line: 4,
    severity: 'high',
    rationale: 'params.id reaches the database with no ownership check.',
  },
])

const PLAN = JSON.stringify({
  method: 'GET',
  path: '/api/invoices/1',
  expectation: 'a sound application answers 401 without a session',
  reproducesOnStatus: [200],
  reproducesOnBodyContaining: 'iban_of_someone_else',
})

let model: Server
let application: Server
let modelPort = 0
let applicationPort = 0
let workspace = ''

const recorder = (): { output: Output; stdout: () => string; stderr: () => string } => {
  const out: string[] = []
  const err: string[] = []

  return {
    output: { out: (text) => void out.push(text), err: (text) => void err.push(text) },
    stdout: () => out.join(''),
    stderr: () => err.join(''),
  }
}

beforeAll(async () => {
  model = createServer(async (request, response) => {
    const sent = JSON.parse(await read(request)) as { messages: { role: string; content: string }[] }
    const question = sent.messages.find((message) => message.role === 'user')?.content ?? ''
    const answered = question.includes('Finding:')
      ? PLAN
      : question.includes('app/api/invoices/[id]/route.ts')
        ? FOUND
        : '[]'
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ message: { content: answered }, done: true }))
  })

  application = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ id: 1, iban_of_someone_else: 'FR76' }))
  })

  modelPort = await listen(model)
  applicationPort = await listen(application)
  workspace = mkdtempSync(join(tmpdir(), 'vulnhunt-inprocess-'))
})

afterAll(() => {
  model.close()
  application.close()
  rmSync(workspace, { recursive: true, force: true })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

/** A hunt against the stub application, asking the stub model. */
const hunt = async (extra: readonly string[] = [], path = shop) => {
  vi.stubEnv('OLLAMA_HOST', `http://127.0.0.1:${modelPort}`)
  const recording = recorder()
  const code = await run(
    [path, '--local', '--target', `http://127.0.0.1:${applicationPort}`, '--no-cache', ...extra],
    { ANTHROPIC_API_KEY: '' },
    recording.output,
  )

  return { code, stdout: recording.stdout(), stderr: recording.stderr() }
}

describe('what the command answers without hunting anything', () => {
  it('prints its version', async () => {
    const recording = recorder()

    expect(await run(['--version'], {}, recording.output)).toBe(0)
    expect(recording.stdout()).toMatch(/^\d+\.\d+\.\d+\n$/)
  })

  it('prints the usage, which is the first thing most people see', async () => {
    const recording = recorder()

    expect(await run(['--help'], {}, recording.output)).toBe(0)
    expect(recording.stdout()).toContain('--target')
  })

  it('names a path that is not there instead of calling the project clean', async () => {
    const recording = recorder()

    expect(await run([join(workspace, 'nowhere')], {}, recording.output)).toBe(2)
    expect(recording.stderr()).toContain('is not a directory this hunt can read')
  })

  it('refuses a target that is not disposable, since a proof is a real attack', async () => {
    const recording = recorder()

    const code = await run([shop, '--target', 'https://app.example.com'], {}, recording.output)

    expect(code).toBe(2)
    expect(recording.stderr()).toContain('does not look like a local, disposable server')
  })

  it('refuses a threshold nobody chose rather than gating on a guess', async () => {
    const recording = recorder()

    expect(await run([shop, '--fail-on', 'catastrophic'], {}, recording.output)).toBe(2)
    expect(recording.stderr()).toMatch(/critical|high|medium|low/)
  })

  it('says what it would cost, and sends nothing, on a dry run', async () => {
    const recording = recorder()

    const code = await run([shop, '--dry-run'], { ANTHROPIC_API_KEY: '' }, recording.output)

    expect(code).toBe(0)
    expect(recording.stdout()).toContain('Nothing was sent')
  })

  it('finds nothing to hunt in a directory that serves nothing', async () => {
    const empty = join(workspace, 'empty')
    mkdirSync(empty, { recursive: true })
    const recording = recorder()

    const code = await run([empty], { ANTHROPIC_API_KEY: '' }, recording.output)

    expect(code).toBe(2)
    expect(recording.stderr()).toContain('attack surface')
  })
})

describe('a hunt that proves something', () => {
  it('reports the finding and fails the build', async () => {
    const { code, stdout } = await hunt()

    expect(code).toBe(1)
    expect(stdout).toContain('Invoice readable without a session')
    expect(stdout).toContain('1 proven')
  })

  it('writes SARIF a viewer can read', async () => {
    const { stdout } = await hunt(['--format', 'sarif'])
    // The report is followed by what changed since the baseline, which is not JSON.
    const log = JSON.parse(stdout.slice(0, stdout.lastIndexOf('}') + 1)) as { version: string; runs: { results: unknown[] }[] }

    expect(log.version).toBe('2.1.0')
    expect(log.runs[0]?.results).toHaveLength(1)
  })

  it('writes JSON a script can read', async () => {
    const { stdout } = await hunt(['--format', 'json'])
    const report = JSON.parse(stdout.slice(0, stdout.lastIndexOf('}') + 1)) as { proven: unknown[]; surfaceScanned: number }

    expect(report.proven).toHaveLength(1)
    expect(report.surfaceScanned).toBeGreaterThan(0)
  })

  it('writes Markdown somebody can paste into a review', async () => {
    const { stdout } = await hunt(['--format', 'markdown'])

    expect(stdout).toContain('|')
    expect(stdout).toContain('Invoice readable without a session')
  })

  it('writes the report to a file instead of the screen when asked', async () => {
    const out = join(workspace, 'report.sarif')

    const { stdout } = await hunt(['--format', 'sarif', '--out', out])

    expect(JSON.parse(readFileSync(out, 'utf8'))).toHaveProperty('version', '2.1.0')
    expect(stdout).not.toContain('"version"')
  })

  it('writes a regression test the team commits', async () => {
    const tests = join(workspace, 'emitted')

    const { stdout } = await hunt(['--emit-tests', tests])

    expect(stdout).toContain('regression tests written')
    expect(readdirSync(tests)).toHaveLength(1)
  })

  it('says so rather than failing when the tests cannot be written', async () => {
    const blocked = join(workspace, 'blocked')
    writeFileSync(blocked, 'a file where a directory was asked for')

    const { code, stdout } = await hunt(['--emit-tests', blocked])

    expect(code).toBe(1)
    expect(stdout).toContain('could not be created')
  })

  it('does not stop the build below the chosen level', async () => {
    const { code, stdout } = await hunt(['--fail-on', 'critical'])

    expect(code).toBe(0)
    expect(stdout).toContain('Invoice readable without a session')
  })
})

describe('the baseline, and the replay that needs no model', () => {
  it('accepts what was proven, then passes on the same finding', async () => {
    // THE GATE IS THE POINT OF THE BASELINE. Every policy here had a unit test
    // while the comparison was computed and then ignored, so --accept wrote a
    // file that changed nothing.
    const baseline = join(workspace, 'baseline.json')

    const first = await hunt(['--accept', '--baseline', baseline])
    expect(first.code).toBe(0)
    expect(first.stdout).toContain('accepted in')

    const second = await hunt(['--baseline', baseline])
    expect(second.code).toBe(0)
    expect(second.stdout).toContain('already accepted')
  })

  it('has nothing to replay before anything was accepted', async () => {
    const empty = join(workspace, 'no-baseline')
    mkdirSync(empty, { recursive: true })
    const recording = recorder()

    const code = await run([empty, '--recheck'], {}, recording.output)

    expect(code).toBe(2)
    expect(recording.stderr()).toContain('nothing to replay')
  })
})

describe('which model answers, from what the operator already has', () => {
  it('takes the machine over any key left in the environment', () => {
    vi.stubEnv('OLLAMA_HOST', 'http://127.0.0.1:11434')

    expect(gatewayFor('sk-ant-real-key', true).constructor.name).toBe('OllamaGateway')
  })

  it('falls back to the subscription when no key was set', () => {
    expect(gatewayFor('', false).constructor.name).toBe('ClaudeSubscriptionGateway')
  })

  it('reads which vendor a key belongs to, so nobody names it twice', () => {
    expect(gatewayFor('sk-ant-abc', false).constructor.name).toBe('AnthropicApiGateway')
    expect(gatewayFor('sk-abc', false).constructor.name).toBe('OpenAiGateway')
    // A KEY OF NEITHER SHAPE IS STILL A KEY: the vendor this tool was written
    // against is the one that gets it.
    expect(gatewayFor('anything-else', false).constructor.name).toBe('AnthropicApiGateway')
  })

  it('carries the chosen model into whichever gateway answers', () => {
    expect(gatewayFor('sk-ant-abc', false, 'haiku')).toBeDefined()
  })
})

describe('replaying what was accepted, which needs no model at all', () => {
  const baselineFor = (project: string, id: string, path: string): string => {
    mkdirSync(project, { recursive: true })
    const file = join(project, 'baseline.json')
    writeFileSync(
      file,
      JSON.stringify({
        accepted: [
          {
            id,
            rule: 'broken-object-level-authorization',
            file: 'app/api/invoices/[id]/route.ts',
            title: 'Invoice readable without a session',
            proof: {
              method: 'GET',
              path,
              expectation: 'a sound application answers 401 without a session',
              reproducesOnStatus: [200],
              reproducesOnBodyContaining: 'iban_of_someone_else',
            },
          },
        ],
      }),
    )

    return file
  }

  it('says which flaws are still open, and fails the build for them', async () => {
    const project = join(workspace, 'replay-open')
    const baseline = baselineFor(project, 'a'.repeat(16), '/api/invoices/1')
    const recording = recorder()

    const code = await run(
      [project, '--recheck', '--target', `http://127.0.0.1:${applicationPort}`, '--baseline', baseline],
      {},
      recording.output,
    )

    expect(code).toBe(1)
    expect(recording.stdout()).toContain('still open')
    expect(recording.stdout()).toContain('1 closed, 1 still open'.replace('1 closed', '0 closed'))
  })

  it('says a flaw is closed when the application no longer hands it over', async () => {
    const shut = createServer((_request, response) => {
      response.writeHead(401, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ error: 'unauthorized' }))
    })
    const shutPort = await listen(shut)
    const project = join(workspace, 'replay-closed')
    const baseline = baselineFor(project, 'b'.repeat(16), '/api/invoices/1')
    const recording = recorder()

    try {
      const code = await run(
        [project, '--recheck', '--target', `http://127.0.0.1:${shutPort}`, '--baseline', baseline],
        {},
        recording.output,
      )

      expect(code).toBe(0)
      expect(recording.stdout()).toContain('closed')
    } finally {
      shut.close()
    }
  })
})
