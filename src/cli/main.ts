#!/usr/bin/env node
import { writeFile } from 'node:fs/promises'
import { readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { NextProjectReader } from '../infrastructure/project/next-project-reader.js'
import { ModelVulnerabilityFinder } from '../infrastructure/llm/model-vulnerability-finder.js'
import { AnthropicApiGateway } from '../infrastructure/model/anthropic-api-gateway.js'
import { ClaudeSubscriptionGateway } from '../infrastructure/model/claude-subscription-gateway.js'
import { OllamaGateway } from '../infrastructure/model/ollama-gateway.js'
import { PersistentHunt } from '../application/use-cases/persistent-hunt.js'
import { readConfigFile } from '../infrastructure/config/config-file.js'
import { renderMarkdown } from '../infrastructure/report/markdown.js'
import { readBaseline, writeBaseline, ensureDirectory } from '../infrastructure/config/baseline-file.js'
import { replay, stillFailing } from '../application/use-cases/recheck.js'
import {
  compare,
  stopsTheBuild,
  type AcceptedProof,
  type Comparison,
} from '../domain/policies/accepted-findings.js'
import { identityOf } from '../domain/policies/identity.js'
import { regressionTestFor, testFileNameFor } from '../infrastructure/report/regression-test.js'
import { disposableTarget } from '../domain/policies/safety.js'
import { selectedRules } from '../domain/rules/rule.js'
import { HttpProofRunner } from '../infrastructure/proof/http-proof-runner.js'
import { RunAudit } from '../application/use-cases/run-audit.js'
import { renderConsole } from '../infrastructure/report/console.js'
import { toSarif } from '../infrastructure/report/sarif.js'
import { estimateAudit } from '../domain/policies/cost-estimate.js'
import { changedSurface } from '../domain/policies/changed-surface.js'
import { anySeverity, failOn as thresholdNamed } from '../domain/policies/fail-on.js'
import { changedSince } from '../infrastructure/project/git-changes.js'
import { OpenAiGateway } from '../infrastructure/model/openai-gateway.js'
import { CachedGateway } from '../infrastructure/model/cached-gateway.js'

/** Whether the audited path is a directory at all. */
const statSafely = (path: string): boolean => {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

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
  readonly format: 'console' | 'sarif' | 'json' | 'markdown'
  readonly out?: string
  readonly dryRun: boolean
  /** Send proofs whose method or path would change state. */
  readonly allowDestructive: boolean
  /** Point the hunt at something that is not a local, throwaway server. */
  readonly allowRemoteTarget: boolean
  /** Ask a model running on this machine, so nothing leaves it. */
  readonly local: boolean
  /** Write what this run proved into the baseline, instead of comparing. */
  readonly accept: boolean
  /** Replay the accepted proofs instead of hunting. */
  readonly recheck: boolean
  /** Where the team keeps what it has already seen. */
  readonly baseline?: string
  /** Where to write the regression tests a team commits. */
  readonly emitTests?: string
  /** Hunt only what changed since this git reference. */
  readonly since?: string
  /** How bad a proven finding has to be before it stops the build. */
  readonly failOn?: string
  /** Ask again about code that has not changed. */
  readonly noCache: boolean
  readonly model?: string
}

const USAGE = `vulnerability-hunter-next ${VERSION}

  vulnerability-hunter-next [path] [options]

  --target <url>    running application to prove findings against (default http://localhost:3000)
  --format <fmt>    console | sarif | json | markdown             (default console)
  --out <file>      write the report to a file instead of stdout
  --model <name>    model to audit with
  --dry-run         map the surface and estimate the cost, call nothing
  --allow-destructive     send proofs that would change state. Only on a
                          server whose data you can afford to lose.
  --allow-remote-target   hunt a target that is not local. Same warning.
  --local           ask a model running on this machine through Ollama.
                    No account, no key, and the source never leaves.
  --accept          write what this run proved into the baseline, so later runs
                    report only what is new
  --baseline <file> where the baseline lives
                    (default vulnerability-hunter-baseline.json)
  --recheck         replay the accepted proofs and say which are closed.
                    No model is called, so it is free and instant
  --emit-tests <dir> write a failing test per proven finding, to commit
  --since <ref>     hunt only what changed since a git reference, so a pull
                    request is guarded in seconds rather than minutes
  --fail-on <level> only critical, high, medium or low and above stop the
                    build. Everything proven is still reported
  --no-cache        ask again about code that has not changed
  --version         print the installed version
  --help            this

  Runs on the Claude subscription you are already signed in to.
  Set ANTHROPIC_API_KEY to use the paid API instead, which is what a CI
  runner needs since nobody is signed in there.

Exit codes: 0 nothing proven, 1 at least one proven finding, 2 the audit could not run.`

export const parse = (argv: readonly string[]): Options | 'help' | 'version' => {
  if (argv.includes('--help') || argv.includes('-h')) return 'help'
  if (argv.includes('--version')) return 'version'
  /**
   * A FLAG THAT TAKES A VALUE AND IS GIVEN NONE IS A MISTAKE, NOT A DEFAULT.
   *
   * Taking whatever follows meant `--target` at the end of a line silently
   * hunted localhost:3000, and `--out --format sarif` wrote the report to a
   * file called "--format" while the reader waited for it on their screen.
   */
  const value = (flag: string): string | undefined => {
    const index = argv.indexOf(flag)
    if (index === -1) return undefined
    const next = argv[index + 1]
    if (next === undefined || next.startsWith('-')) {
      throw new Error(`${flag} needs a value, and was given ${next === undefined ? 'nothing' : `"${next}"`}`)
    }
    return next
  }
  const format = value('--format') ?? 'console'
  if (format !== 'console' && format !== 'sarif' && format !== 'json' && format !== 'markdown') {
    throw new Error(`unknown format "${format}": expected console, sarif, json or markdown`)
  }
  // Flags that take no value, so the word after them is still the path.
  const FLAGS = [
    '--dry-run',
    '--allow-destructive',
    '--allow-remote-target',
    '--local',
    '--accept',
    '--recheck',
    '--no-cache',
  ]
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
    accept: argv.includes('--accept'),
    recheck: argv.includes('--recheck'),
    noCache: argv.includes('--no-cache'),
    ...(value('--baseline') === undefined ? {} : { baseline: value('--baseline') as string }),
    ...(value('--emit-tests') === undefined ? {} : { emitTests: value('--emit-tests') as string }),
    ...(value('--since') === undefined ? {} : { since: value('--since') as string }),
    ...(value('--fail-on') === undefined ? {} : { failOn: value('--fail-on') as string }),
    ...(out === undefined ? {} : { out }),
    ...(model === undefined ? {} : { model }),
  }
}

/**
 * What a reader needs from the comparison, and nothing else.
 *
 * A FIXED FLAW IS THE ONLY GOOD NEWS THIS TOOL EVER DELIVERS, so it is said out
 * loud rather than left to be noticed as an absence.
 */
const whatChanged = (compared: Comparison): string[] => [
  ...(compared.appeared.length > 0 ? [`${compared.appeared.length} new since the baseline was accepted.`] : []),
  ...(compared.known.length > 0 ? [`${compared.known.length} already accepted.`] : []),
  ...(compared.gone.length > 0 ? [`${compared.gone.length} accepted findings no longer reproduce. Re-run with --accept.`] : []),
]

/** Replays what was accepted, without asking any model. */
const replayBaseline = async (options: Options): Promise<number> => {
  const accepted = readBaseline(options.path, options.baseline)
  if (accepted.length === 0) {
    process.stderr.write(
      'Nothing has been accepted yet, so there is nothing to replay.\n' +
        'Run a hunt first, then --accept what you decide to keep.\n',
    )
    return 2
  }

  const result = await replay(new HttpProofRunner(options.target), accepted)

  for (const entry of result.closed) process.stdout.write(`  closed       ${entry.id}  ${entry.title}\n`)
  for (const entry of result.stillOpen) process.stdout.write(`  still open   ${entry.id}  ${entry.title}\n`)
  for (const entry of result.unknown) process.stdout.write(`  no answer    ${entry.id}  ${entry.title}\n`)

  process.stdout.write(
    `\n${result.closed.length} closed, ${result.stillOpen.length} still open, ` +
      `${result.unknown.length} could not be replayed.\n`,
  )

  return stillFailing(result) ? 1 : 0
}

const main = async (): Promise<number> => {
  const options = parse(process.argv.slice(2))
  if (options !== 'help' && options !== 'version' && options.recheck) {
    // DID THE FIX WORK? The requests are already written down, so answering
    // costs nothing: no model, no bill, and the same verdict twice.
    return replayBaseline(options)
  }

  if (options === 'version') {
    process.stdout.write(`${VERSION}\n`)
    return 0
  }

  if (options === 'help') {
    process.stdout.write(`${USAGE}\n`)
    return 0
  }

  // A PATH THAT IS NOT THERE IS A TYPO, NOT A CLEAN PROJECT. The walk returns
  // nothing for a directory it cannot open, and "no attack surface found" then
  // reads as a verdict on the code instead of a verdict on the path.
  if (!statSafely(options.path)) {
    process.stderr.write(`${options.path} is not a directory this hunt can read.\n`)
    return 2
  }

  const reader = new NextProjectReader(options.path)
  let surface = await reader.attackSurface()

  // HUNTING THE WHOLE PROJECT ON EVERY PUSH IS HOW A CHECK GETS SWITCHED OFF.
  // Scoped to the diff a hunt takes seconds and can guard a pull request — as
  // long as it says out loud that it narrowed itself.
  if (options.since !== undefined) {
    let changed: string[]
    try {
      changed = await changedSince(options.path, options.since)
    } catch (failure) {
      process.stderr.write(`${(failure as Error).message}\n`)
      return 2
    }
    const whole = surface.length
    surface = changedSurface(surface, changed)
    process.stdout.write(
      `Scoped to ${surface.length} of ${whole} entries, from ${changed.length} files ` +
        `changed since ${options.since}.\n`,
    )
  }

  if (surface.length === 0) {
    // AND THIS IS THE FIRST THING MOST PEOPLE SEE, because the first command
    // anybody types is the wrong one. It says what was looked for and what to
    // try next, rather than only what failed.
    process.stderr.write(
      `No Next.js attack surface found in ${options.path}.\n\n` +
        'It looked for route handlers and Server Actions under app/, API handlers\n' +
        'under pages/api/, pages under app/ or pages/, and a middleware file at\n' +
        'the root.\n\n' +
        'If your application lives elsewhere, name it:\n' +
        '  npx vulnhunt path/to/app --dry-run\n',
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
  const model = options.model === undefined ? {} : { model: options.model }
  // THE KEY SAYS WHICH VENDOR IT BELONGS TO, so nobody has to name it twice and
  // get it wrong once.
  const chosen = options.local
    ? new OllamaGateway(model)
    : apiKey === ''
      ? new ClaudeSubscriptionGateway(model)
      : apiKey.startsWith('sk-ant-')
        ? new AnthropicApiGateway({ apiKey, ...model })
        : apiKey.startsWith('sk-')
          ? new OpenAiGateway({ apiKey, ...model })
          : new AnthropicApiGateway({ apiKey, ...model })

  // ASKING AGAIN ABOUT UNCHANGED CODE IS PAYING TWICE, in euros on a key and in
  // seconds on a subscription. Seconds are what decide whether a check runs on
  // every push or once a night.
  const gateway = options.noCache
    ? chosen
    : new CachedGateway(chosen, join(options.path, 'node_modules/.cache/vulnerability-hunter'))

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

  // Identity is computed where the source is at hand, which is here: the report
  // carries findings, and recognising one next week needs the file it sits in.
  const identified: AcceptedProof[] = []
  for (const { finding, plan } of report.proven) {
    const source = await reader.read(finding.file)
    identified.push({
      id: await identityOf(finding, source),
      rule: finding.kind.id,
      file: finding.file,
      title: finding.title,
      ...(plan === undefined ? {} : { plan }),
    })
  }

  if (options.accept) {
    const path = writeBaseline(options.path, options.baseline, identified)
    process.stdout.write(`${identified.length} findings accepted in ${path}.\n`)
  }

  // THE ONE THING THAT OUTLIVES THIS TOOL: a test in their repository runs on
  // every push forever, and holds the flaw closed even if we are uninstalled.
  if (options.emitTests !== undefined) {
    if (ensureDirectory(options.emitTests)) {
      let written = 0
      for (const entry of identified) {
        const source = regressionTestFor(entry, options.target)
        if (source === undefined) continue
        writeFileSync(join(options.emitTests, testFileNameFor(entry)), source, 'utf8')
        written += 1
      }
      process.stdout.write(`\n${written} regression tests written to ${options.emitTests}. Commit them.\n`)
    } else {
      process.stdout.write(`\n${options.emitTests} could not be created, so no test was written.\n`)
    }
  }

  if (options.accept) return 0

  let threshold
  try {
    threshold = options.failOn === undefined ? anySeverity() : thresholdNamed(options.failOn)
  } catch (refused) {
    process.stderr.write(`${(refused as Error).message}\n`)
    return 2
  }

  // THE THRESHOLD DECIDES WHAT STOPS A BUILD, never what is reported: hiding a
  // finding and failing to mention it are different things, and only one of
  // them is honest.
  //
  // Matched by position, because that is the only exact match available: two
  // findings of the same rule in the same file differ by line alone, and
  // `identified` was built by walking `report.proven` in order.
  const gating = identified.filter((_, at) => {
    const severity = report.proven[at]?.finding.severity
    return severity !== undefined && threshold.reached(severity)
  })

  const compared = compare(
    readBaseline(options.path, options.baseline).map((entry) => entry.id),
    gating.map((entry) => entry.id),
  )

  const rendered =
    options.format === 'console'
      ? `${renderConsole(report)}\n`
      : options.format === 'markdown'
      ? renderMarkdown(report)
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

  for (const line of whatChanged(compared)) process.stdout.write(`${line}\n`)

  // A PROVEN FINDING FAILS THE BUILD. A suspicion never does : that is the
  // difference this tool exists to make, and the exit code has to carry it.
  // ONCE A BASELINE EXISTS, only a finding nobody accepted does — otherwise
  // --accept writes a file that changes nothing, and the gate is decorative.
  return stopsTheBuild(compared) ? 1 : 0
}

/**
 * IT RUNS ONLY WHEN SOMEBODY RAN IT.
 *
 * Importing this module used to start a hunt: the tests import `parse` from
 * here, so the suite was quietly auditing whatever vitest happened to pass as
 * arguments, and hung once the command grew a step that waits. A library that
 * does something merely because it was imported is a library nobody can embed.
 */
const wasRunDirectly = (): boolean => {
  const entry = process.argv[1]
  if (entry === undefined) return false
  // THROUGH THE SYMLINK IS HOW EVERYBODY RUNS IT. npm links
  // node_modules/.bin/vulnhunt at this file, so argv[1] is the link while
  // import.meta.url is its target. Comparing them unresolved made an installed
  // tool exit 0 in silence — invoked, and doing nothing at all.
  const resolved = ((): string => {
    try {
      return realpathSync(entry)
    } catch {
      return entry
    }
  })()
  return import.meta.url === pathToFileURL(resolved).href
}

if (wasRunDirectly()) {
  main()
    .then((code) => {
      process.exitCode = code
    })
    .catch((error: unknown) => {
      process.stderr.write(`${(error as Error).message}\n`)
      process.exitCode = 2
    })
}
