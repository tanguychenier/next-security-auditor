#!/usr/bin/env node
import { writeFile } from 'node:fs/promises'
import { NextProjectReader } from '../infrastructure/project/next-project-reader.js'
import { ModelVulnerabilityFinder } from '../infrastructure/llm/model-vulnerability-finder.js'
import { AnthropicApiGateway } from '../infrastructure/model/anthropic-api-gateway.js'
import { ClaudeSubscriptionGateway } from '../infrastructure/model/claude-subscription-gateway.js'
import { PersistentHunt } from '../application/use-cases/persistent-hunt.js'
import { readConfigFile } from '../infrastructure/config/config-file.js'
import { selectedRules } from '../domain/rules/rule.js'
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

const USAGE = `vulnerability-hunter-next ${VERSION}

  vulnerability-hunter-next [path] [options]

  --target <url>    running application to prove findings against (default http://localhost:3000)
  --format <fmt>    console | sarif | json                        (default console)
  --out <file>      write the report to a file instead of stdout
  --model <name>    model to audit with
  --dry-run         map the surface and estimate the cost, call nothing
  --help            this

  Runs on the Claude subscription you are already signed in to.
  Set ANTHROPIC_API_KEY to use the paid API instead, which is what a CI
  runner needs since nobody is signed in there.

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
    const hunted = selectedRules(await readConfigFile(options.path))
    const estimate = estimateAudit(sources, PRICING, hunted.length)
    process.stdout.write(
      [
        `${surface.length} attack-surface entries found.`,
        `${hunted.length} rules selected.`,
        `${estimate.passes} model calls, about ${estimate.inputTokens.toLocaleString('en')} input tokens.`,
        `Estimated cost: ${estimate.euros.toFixed(2)} EUR. Nothing was sent.`,
        '',
        // THE URLS ARE WHAT A READER CHECKS THE MAP AGAINST. A list of file
        // names cannot be compared with what they know their app exposes, so a
        // missing route would go unnoticed until the hunt was paid for.
        ...surface.flatMap((entry) => [
          `  ${entry.kind.padEnd(14)} ${entry.file}`,
          ...(entry.reachableAs === undefined
            ? []
            : [`                 ${(entry.methods ?? []).join('|') || 'ANY'} ${entry.reachableAs}`]),
          ...(entry.exports === undefined || entry.exports.length === 0
            ? []
            : [`                 actions ${entry.exports.join(', ')}`]),
          ...(entry.matcher === undefined || entry.matcher.length === 0
            ? []
            : [`                 guards ${entry.matcher.join(', ')}`]),
        ]),
        '',
      ].join('\n'),
    )
    return 0
  }

  // AN EMPTY KEY IS NOT A MISSING ONE: it means the hunt runs on the
  // subscription the developer is already signed in to. Charging a few euros
  // the first time somebody tries a tool is how a tool never gets tried twice.
  const apiKey = process.env['ANTHROPIC_API_KEY'] ?? ''
  const selection = await readConfigFile(options.path)
  const gateway =
    apiKey === ''
      ? new ClaudeSubscriptionGateway(options.model === undefined ? {} : { model: options.model })
      : new AnthropicApiGateway({ apiKey, ...(options.model === undefined ? {} : { model: options.model }) })

  const report = await new RunAudit(
    reader,
    // WHOEVER PAYS DECIDES HOW OFTEN WE PASS. On a subscription the missing
    // recall is paid in seconds; on a metered key a second pass is a second bill.
    new PersistentHunt(new ModelVulnerabilityFinder(gateway, { rules: selection }), apiKey === '' ? 4 : 1),
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
                  kind: finding.kind.id,
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

  // A PROVEN FINDING FAILS THE BUILD. A suspicion never does : that is the
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
