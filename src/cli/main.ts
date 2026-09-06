#!/usr/bin/env node
import { writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { NextProjectReader } from '../infrastructure/project/next-project-reader.js'
import { ModelVulnerabilityFinder } from '../infrastructure/llm/model-vulnerability-finder.js'
import { AnthropicApiGateway } from '../infrastructure/model/anthropic-api-gateway.js'
import { ClaudeSubscriptionGateway } from '../infrastructure/model/claude-subscription-gateway.js'
import { OllamaGateway } from '../infrastructure/model/ollama-gateway.js'
import { PersistentHunt } from '../application/use-cases/persistent-hunt.js'
import { readConfigFile } from '../infrastructure/config/config-file.js'
import { disposableTarget } from '../domain/policies/safety.js'
import { selectedRules } from '../domain/rules/rule.js'
import { HttpProofRunner } from '../infrastructure/proof/http-proof-runner.js'
import { RunAudit } from '../application/use-cases/run-audit.js'
import { renderConsole } from '../infrastructure/report/console.js'
import { toSarif } from '../infrastructure/report/sarif.js'
import { estimateAudit } from '../domain/policies/cost-estimate.js'

/**
 * THE VERSION THE TOOL ANNOUNCES IS THE ONE THAT WAS INSTALLED.
 *
 * Written down as a constant it drifts at the first release, and it travels
 * into every SARIF report a reviewer reads.
 */
const VERSION: string = (() => {
  try {
    const manifest = JSON.parse(
      readFileSync(fileURLToPath(new URL('../../package.json', import.meta.url)), 'utf8'),
    ) as { version?: string }
    return manifest.version ?? 'dev'
  } catch {
    return 'dev'
  }
})()

/** Published prices, per million tokens, for the default model. */
const PRICING = { inputPerMillion: 3, outputPerMillion: 15 }

interface Options {
  readonly path: string
  readonly target: string
  readonly format: 'console' | 'sarif' | 'json'
  readonly out?: string
  readonly dryRun: boolean
  /** Send proofs whose method or path would change state. */
  readonly allowDestructive: boolean
  /** Point the hunt at something that is not a local, throwaway server. */
  readonly allowRemoteTarget: boolean
  /** Ask a model running on this machine, so nothing leaves it. */
  readonly local: boolean
  readonly model?: string
}

const USAGE = `vulnerability-hunter-next ${VERSION}

  vulnerability-hunter-next [path] [options]

  --target <url>    running application to prove findings against (default http://localhost:3000)
  --format <fmt>    console | sarif | json                        (default console)
  --out <file>      write the report to a file instead of stdout
  --model <name>    model to audit with
  --dry-run         map the surface and estimate the cost, call nothing
  --allow-destructive     send proofs that would change state. Only on a
                          server whose data you can afford to lose.
  --allow-remote-target   hunt a target that is not local. Same warning.
  --local           ask a model running on this machine through Ollama.
                    No account, no key, and the source never leaves.
  --version         print the installed version
  --help            this

  Runs on the Claude subscription you are already signed in to.
  Set ANTHROPIC_API_KEY to use the paid API instead, which is what a CI
  runner needs since nobody is signed in there.

Exit codes: 0 nothing proven, 1 at least one proven finding, 2 the audit could not run.`

export const parse = (argv: readonly string[]): Options | 'help' | 'version' => {
  if (argv.includes('--help') || argv.includes('-h')) return 'help'
  if (argv.includes('--version')) return 'version'
  const value = (flag: string): string | undefined => {
    const index = argv.indexOf(flag)
    return index === -1 ? undefined : argv[index + 1]
  }
  const format = value('--format') ?? 'console'
  if (format !== 'console' && format !== 'sarif' && format !== 'json') {
    throw new Error(`unknown format "${format}": expected console, sarif or json`)
  }
  // Flags that take no value, so the word after them is still the path.
  const FLAGS = ['--dry-run', '--allow-destructive', '--allow-remote-target', '--local']
  const positional = argv.find(
    (argument, index) =>
      !argument.startsWith('-') &&
      !(argv[index - 1]?.startsWith('--') === true && !FLAGS.includes(argv[index - 1] ?? '')),
  )
  const out = value('--out')
  const model = value('--model')
  return {
    path: positional ?? process.cwd(),
    target: value('--target') ?? 'http://localhost:3000',
    format,
    dryRun: argv.includes('--dry-run'),
    allowDestructive: argv.includes('--allow-destructive'),
    allowRemoteTarget: argv.includes('--allow-remote-target'),
    local: argv.includes('--local'),
    ...(out === undefined ? {} : { out }),
    ...(model === undefined ? {} : { model }),
  }
}

const main = async (): Promise<number> => {
  const options = parse(process.argv.slice(2))
  if (options === 'version') {
    process.stdout.write(`${VERSION}\n`)
    return 0
  }

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
  // THE HUNT SENDS REQUESTS DESIGNED TO SUCCEED. A target that is not a local
  // throwaway server is refused before anything is sent, because a copied
  // command or a leftover variable should not attack a live site.
  if (!options.allowRemoteTarget && !disposableTarget(options.target)) {
    process.stderr.write(
      `${options.target} does not look like a local, disposable server.\n` +
        'The hunt sends requests designed to succeed. Point it at a development\n' +
        'server with data you can lose, or pass --allow-remote-target to insist.\n',
    )
    return 2
  }

  const apiKey = process.env['ANTHROPIC_API_KEY'] ?? ''
  const selection = await readConfigFile(options.path)
  // NOTHING LEAVES THE MACHINE with --local, and that is a promise a socket
  // keeps rather than a policy somebody has to read and trust. It wins over a
  // key left in the environment: a forgotten variable must not quietly send the
  // code away when somebody asked for local.
  const gateway = options.local
    ? new OllamaGateway(options.model === undefined ? {} : { model: options.model })
    : apiKey === ''
      ? new ClaudeSubscriptionGateway(options.model === undefined ? {} : { model: options.model })
      : new AnthropicApiGateway({ apiKey, ...(options.model === undefined ? {} : { model: options.model }) })

  const report = await new RunAudit(
    reader,
    // WHOEVER PAYS DECIDES HOW OFTEN WE PASS. On a subscription the missing
    // recall is paid in seconds; on a metered key a second pass is a second bill.
    // SAMPLES GO OUT TOGETHER on a subscription, so four independent answers
    // cost one round trip instead of four. A metered key asks once, and the
    // repeated hunt then only confirms that nothing new is coming back.
    new PersistentHunt(
      new ModelVulnerabilityFinder(gateway, { rules: selection, samples: apiKey === '' ? 4 : 1 }),
      apiKey === '' ? 2 : 1,
    ),
    new HttpProofRunner(options.target),
    4,
    options.allowDestructive,
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
