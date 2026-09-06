import { spawn } from 'node:child_process'
import type { ModelGateway } from '../../application/ports/model-gateway.js'

export interface CommandResult {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
}

/** Behind a seam so a test can assert the exact command without spawning it. */
export type CommandRunner = (command: readonly string[], input: string) => Promise<CommandResult>

export interface SubscriptionOptions {
  readonly model?: string
  readonly binary?: string
  readonly run?: CommandRunner
  readonly timeoutMs?: number
}

const DEFAULT_MODEL = 'sonnet'

/** Arguments are passed as a list, so nothing ever goes through a shell. */
const spawnRunner =
  (timeoutMs: number): CommandRunner =>
  (command, input) =>
    new Promise((resolve, reject) => {
      const [binary, ...args] = command
      if (binary === undefined) {
        reject(new Error('no command to run'))
        return
      }
      const child = spawn(binary, args, { timeout: timeoutMs })
      let stdout = ''
      let stderr = ''
      child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()))
      child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()))
      child.on('error', (failure: Error) => resolve({ exitCode: 127, stdout, stderr: failure.message }))
      child.on('close', (code) => resolve({ exitCode: code ?? 0, stdout, stderr }))
      child.stdin.end(input)
    })

/**
 * Asks the model through the CLI the developer is already signed in to.
 *
 * NO API KEY, SO NO BILL. A tool that charges a few euros every time somebody
 * tries it is a tool most people never try twice, and the cost is the first
 * thing that stops a team running a hunt every night.
 *
 * NO TOOLS, EITHER. A hunt needs an answer, not an agent: leaving the model's
 * tools enabled would let it wander through the audited project on its own,
 * which is exactly what this tool promises never to do.
 */
export class ClaudeSubscriptionGateway implements ModelGateway {
  private readonly model: string
  private readonly binary: string
  private readonly run: CommandRunner

  constructor(options: SubscriptionOptions = {}) {
    this.model = options.model ?? DEFAULT_MODEL
    this.binary = options.binary ?? 'claude'
    this.run = options.run ?? spawnRunner(options.timeoutMs ?? 300_000)
  }

  async ask(system: string, user: string, _maxTokens: number): Promise<string> {
    const result = await this.run(
      [this.binary, '--print', '--output-format', 'json', '--model', this.model, '--system-prompt', system, '--allowed-tools', ''],
      user,
    )

    if (result.exitCode !== 0) {
      // TELLING SOMEBODY THEIR PROJECT IS CLEAN BECAUSE A BINARY IS MISSING is
      // the most expensive lie this tool could tell.
      throw new Error(`${this.binary} exited with ${result.exitCode}: ${result.stderr.trim() || 'no output'}`)
    }

    let answer: { result?: string; is_error?: boolean }
    try {
      answer = JSON.parse(result.stdout) as { result?: string; is_error?: boolean }
    } catch {
      throw new Error(
        `the answer from ${this.binary} could not be read as JSON: ${result.stdout.trim().slice(0, 200) || 'nothing was printed'}`,
      )
    }

    if (answer.is_error === true) throw new Error(`the model refused: ${answer.result ?? 'no reason given'}`)
    return answer.result ?? ''
  }
}
