#!/usr/bin/env node
import { writeFile } from 'node:fs/promises'
import { NextProjectReader } from '../infrastructure/project/next-project-reader.js'
import { AnthropicSecurityAuditor } from '../infrastructure/llm/anthropic-auditor.js'
import { HttpProofRunner } from '../infrastructure/proof/http-proof-runner.js'
import { RunAudit } from '../application/use-cases/run-audit.js'
import { renderConsole } from '../infrastructure/report/console.js'
import { toSarif } from '../infrastructure/report/sarif.js'
import { estimateAudit } from '../domain/policies/cost-estimate.js'

const VERSION = '0.1.0'

/** Published prices, per million tokens, for the default model. */
const PRICING = { inputPerMillion: 3, outputPerMillion: 15 }

interface Options {
  readonly path: string
  readonly target: string
  readonly format: 'console' | 'sarif' | 'json'
  readonly out?: string
  readonly dryRun: boolean
  readonly model?: string
}

const USAGE = `next-security-auditor ${VERSION}

  next-security-auditor [path] [options]

  --target <url>    running application to prove findings against (default http://localhost:3000)
  --format <fmt>    console | sarif | json                        (default console)
  --out <file>      write the report to a file instead of stdout
  --model <name>    model to audit with
  --dry-run         map the surface and estimate the cost, call nothing
  --help            this

  ANTHROPIC_API_KEY must be set unless --dry-run is used.

Exit codes: 0 nothing proven, 1 at least one proven finding, 2 the audit could not run.`

export const parse = (argv: readonly string[]): Options | 'help' => {
  if (argv.includes('--help') || argv.includes('-h')) return 'help'
  const value = (flag: string): string | undefined => {
    const index = argv.indexOf(flag)
    return index === -1 ? undefined : argv[index + 1]
  }
  const format = value('--format') ?? 'console'
  if (format !== 'console' && format !== 'sarif' && format !== 'json') {
    throw new Error(`unknown format "${format}": expected console, sarif or json`)
  }
  const positional = argv.find((argument, index) => !argument.startsWith('-') && !argv[index - 1]?.startsWith('--'))
  const out = value('--out')
  const model = value('--model')
  return {
    path: positional ?? process.cwd(),
    target: value('--target') ?? 'http://localhost:3000',
    format,
    dryRun: argv.includes('--dry-run'),
    ...(out === undefined ? {} : { out }),
    ...(model === undefined ? {} : { model }),
  }
}

const main = async (): Promise<number> => {
  const options = parse(process.argv.slice(2))
  if (options === 'help') {
    process.stdout.write(`${USAGE}\n`)
    return 0
  }

  const reader = new NextProjectReader(options.path)
  const surface = await reader.attackSurface()

  if (surface.length === 0) {
    process.stderr.write(
      `No Next.js attack surface found in ${options.path}.\n` +
        'Expected an app/ directory with route handlers, Server Actions, or a middleware file.\n',
    )
    return 2
  }

  if (options.dryRun) {
    const sources = await Promise.all(
      surface.map(async (entry) => ({ entry, characters: (await reader.read(entry.file)).length })),
    )
    const estimate = estimateAudit(sources, PRICING)
    process.stdout.write(
      [
        `${surface.length} attack-surface entries found.`,
        `${estimate.passes} model calls, about ${estimate.inputTokens.toLocaleString('en')} input tokens.`,
        `Estimated cost: ${estimate.euros.toFixed(2)} EUR. Nothing was sent.`,
        '',
        ...surface.map((entry) => `  ${entry.kind.padEnd(14)} ${entry.file}`),
        '',
      ].join('\n'),
    )
    return 0
  }

  const apiKey = process.env['ANTHROPIC_API_KEY']
  if (!apiKey) {
    process.stderr.write('ANTHROPIC_API_KEY is not set. Use --dry-run to map the surface without it.\n')
    return 2
  }

  const report = await new RunAudit(
    reader,
    new AnthropicSecurityAuditor({ apiKey, ...(options.model === undefined ? {} : { model: options.model }) }),
    new HttpProofRunner(options.target),
  ).execute()

  const rendered =
    options.format === 'console'
      ? `${renderConsole(report)}\n`
      : `${JSON.stringify(
          options.format === 'sarif'
            ? toSarif(report.proven, VERSION)
            : {
                surfaceScanned: report.surfaceScanned,
                suspected: report.suspected,
                discarded: report.discarded,
                proven: report.proven.map(({ finding, proof }) => ({
                  title: finding.title,
                  kind: finding.kind,
                  severity: finding.severity,
                  location: finding.location,
                  rationale: finding.rationale,
                  proof: {
                    request: proof.request,
                    expectation: proof.expectation,
                    observed: proof.observed,
                  },
                })),
              },
          null,
          2,
        )}\n`

  if (options.out) await writeFile(options.out, rendered, 'utf8')
  else process.stdout.write(rendered)

  // A PROVEN FINDING FAILS THE BUILD. A suspicion never does — that is the
  // difference this tool exists to make, and the exit code has to carry it.
  return report.proven.length > 0 ? 1 : 0
}

main()
  .then((code) => {
    process.exitCode = code
  })
  .catch((error: unknown) => {
    process.stderr.write(`${(error as Error).message}\n`)
    process.exitCode = 2
  })
