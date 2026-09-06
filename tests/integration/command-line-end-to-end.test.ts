/**
 * THE FLAGS ARE WIRED, NOT MERELY IMPLEMENTED.
 *
 * Every policy in this repository has a unit test, and every one of them passed
 * while the baseline gate was dead code: the comparison was computed and then
 * ignored, so `--accept` wrote a file that changed nothing. No unit test could
 * have caught that, because the defect was the wiring.
 *
 * So this runs the real binary, as a user runs it, against a stub model and a
 * stub application. It is the only test here that would have failed.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { execFile } from 'node:child_process'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const shop = fileURLToPath(new URL('../fixtures/shop', import.meta.url))
const binary = fileURLToPath(new URL('../../dist/cli/main.js', import.meta.url))

const listen = (server: Server): Promise<number> =>
  new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve((server.address() as { port: number }).port)))

const read = (request: import('node:http').IncomingMessage): Promise<string> =>
  new Promise((resolve) => {
    let body = ''
    request.on('data', (chunk) => (body += chunk))
    request.on('end', () => resolve(body))
  })

/** One suspicion on the invoice route, and the request that would settle it. */
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
let asked = 0
let workspace = ''

beforeAll(async () => {
  // A MISSING BUILD IS NOT A PASSING TEST. Without this the run silently drives
  // a binary that is not there, and every assertion fails for the wrong reason.
  if (!existsSync(binary)) {
    throw new Error(`${binary} is not built: run npm run build before npm test`)
  }

  model = createServer(async (request, response) => {
    asked += 1
    const sent = JSON.parse(await read(request)) as { messages: { role: string; content: string }[] }
    const question = sent.messages.find((message) => message.role === 'user')?.content ?? ''
    // The prove call is the one that carries a finding; everything else is a hunt.
    const answered = question.includes('Finding:')
      ? PLAN
      : question.includes('app/api/invoices/[id]/route.ts')
        ? FOUND
        : '[]'
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ message: { content: answered }, done: true }))
  })

  // A BROKEN APPLICATION: it hands the invoice to anybody who asks.
  application = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ id: 1, iban_of_someone_else: 'FR76' }))
  })

  modelPort = await listen(model)
  applicationPort = await listen(application)
  workspace = mkdtempSync(join(tmpdir(), 'vulnhunt-e2e-'))
})

afterAll(() => {
  model.close()
  application.close()
  rmSync(workspace, { recursive: true, force: true })
})

interface Run {
  readonly code: number
  readonly stdout: string
  readonly stderr: string
}

const run = (argv: readonly string[]): Promise<Run> =>
  new Promise((resolve) => {
    execFile(
      process.execPath,
      [binary, shop, ...argv],
      {
        env: {
          ...process.env,
          OLLAMA_HOST: `http://127.0.0.1:${modelPort}`,
          // An inherited key would send the fixture to a real vendor.
          ANTHROPIC_API_KEY: '',
        },
        timeout: 120_000,
      },
      (error, stdout, stderr) =>
        resolve({ code: error === null ? 0 : ((error as { code?: number }).code ?? 1), stdout, stderr }),
    )
  })

const hunt = (extra: readonly string[] = []): Promise<Run> =>
  run(['--local', '--target', `http://127.0.0.1:${applicationPort}`, '--no-cache', ...extra])

describe('the baseline gate, run as a user runs it', () => {
  it('fails the build on a proven finding, accepts it, then passes on the same one', async () => {
    const baseline = join(workspace, 'baseline.json')

    const first = await hunt(['--baseline', baseline])
    expect(first.stdout).toContain('Invoice readable without a session')
    expect(first.code).toBe(1)

    const accepted = await hunt(['--baseline', baseline, '--accept'])
    expect(accepted.code).toBe(0)
    expect(existsSync(baseline)).toBe(true)

    // THE ONE THAT USED TO FAIL. A baseline nobody reads is a file, not a gate.
    const second = await hunt(['--baseline', baseline])
    expect(second.stdout).toContain('already accepted')
    expect(second.code).toBe(0)
  }, 180_000)
})

describe('the threshold, run as a user runs it', () => {
  it('reports the finding but does not stop the build below the chosen level', async () => {
    const result = await hunt(['--baseline', join(workspace, 'unused.json'), '--fail-on', 'critical'])

    // REPORTED, NOT HIDDEN: only what stops the build changed.
    expect(result.stdout).toContain('Invoice readable without a session')
    expect(result.code).toBe(0)
  }, 180_000)

  it('refuses a level it does not know rather than gating on something nobody chose', async () => {
    const result = await hunt(['--fail-on', 'blocker'])

    expect(result.stderr).toContain('unknown severity')
    expect(result.code).toBe(2)
  }, 180_000)
})

describe('the cache, run as a user runs it', () => {
  it('asks again for every question when the cache is off, and not when it is on', async () => {
    const cached = join(workspace, 'cached-project')
    rmSync(cached, { recursive: true, force: true })

    const withCache = (extra: readonly string[]) =>
      run(['--local', '--target', `http://127.0.0.1:${applicationPort}`, '--baseline', join(workspace, 'c.json'), ...extra])

    await withCache([])
    const afterWarmUp = asked
    await withCache([])
    const secondRun = asked - afterWarmUp

    await withCache(['--no-cache'])
    const uncached = asked - afterWarmUp - secondRun

    expect(secondRun).toBeLessThan(uncached)
  }, 240_000)
})
