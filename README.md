<div align="center">

# Vulnerability Hunter for Next.js

**Runs on the Claude subscription you already pay for. Reports only what it watched happen.**

[![CI](https://github.com/tanguychenier/vulnerability-hunter-next/actions/workflows/ci.yml/badge.svg)](https://github.com/tanguychenier/vulnerability-hunter-next/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/vulnerability-hunter-next)](https://www.npmjs.com/package/vulnerability-hunter-next)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-5fa04e?logo=node.js&logoColor=white)](package.json)
[![SARIF](https://img.shields.io/badge/output-SARIF%202.1.0-4c1)](https://sarifweb.azurewebsites.net/)

</div>

<div align="center">
  <img src="assets/demo.svg" alt="The hunter scans four entry points, reports the one flaw it proved, and says how many suspicions it discarded." width="760">
</div>

## What it does

It reads a Next.js application, finds the places a request can reach — route
handlers, Server Actions, pages, middleware — and asks a model what looks wrong
there. Then it turns each suspicion into a single HTTP request against your
running application and sends it. What reproduced is reported with the request
that proved it. What did not is dropped before you see it.

There is no confidence score to tune. A finding is in the report because a
request went out and the application answered the way a vulnerable one answers.

It runs on the Claude subscription you are already signed in to, so a hunt costs
nothing beyond your plan. `--local` asks a model running on your own machine
through Ollama instead — no account, no key, and the source never leaves. Set
`ANTHROPIC_API_KEY` to use the paid API, which is what CI needs since nobody is
signed in there; an `sk-` key that is not `sk-ant-` is read as OpenAI, so a team
already on that vendor changes nothing but the variable. `OPENAI_BASE_URL` and
`OLLAMA_HOST` point either one somewhere else, which is what a self-hosted
vLLM or a GPU box on the network needs.

## Quick start

```bash
npm install --save-dev vulnerability-hunter-next

# See what would be hunted, and what it would cost. Nothing is sent.
npx vulnhunt . --dry-run

# Hunt against your running dev server. No key needed.
npx vulnhunt . --target http://localhost:3000
```

The map comes out first, and it is meant to be checked against the app you know
you have:

```
4 attack-surface entries found.
39 rules selected.
8 model calls, about 12,110 input tokens.
Estimated cost: 0.15 EUR. Nothing was sent.

  route-handler  app/api/invoices/[id]/route.ts
                 DELETE|GET /api/invoices/[id]
  server-action  app/dashboard/actions.ts
                 actions updateEmail
  page           app/dashboard/page.tsx
                 ANY /dashboard
  middleware     middleware.ts
                 guards /dashboard/:path*
```

## Choosing the rules

```js
// vulnerability-hunter.config.mjs, at the root of your project

export default {
  // Hunt these and nothing else.
  only: ['missing-authorization', 'server-action-without-authorization', 'ssrf'],
  // Mute one without listing all the others.
  without: ['missing-rate-limiting'],
  // Add a class of flaw nobody shipped. Instructions are optional: the model
  // already knows most of them by name.
  with: { 'prompt-injection': 'User text must never reach the system prompt raw.' },
}
```

The selection reaches the prompt, not the report: a rule you removed costs
nothing. And a rule you add works the same day — the model already knows most
classes of flaw by name, so instructions are optional.

## What it hunts that only Next.js has

A Server Action is a POST endpoint that looks like a function call, so anyone can
call it and the button in your page is not a guard. A Client Component ships its
whole content to the browser, so an environment value read there travels with
it. A middleware matcher is a guard that is easy to write and easy to leave a
hole in, and authorization enforced there alone leaves every missed path open.

Those three shapes are why a generic scanner misses the flaws that matter here:

| Rule | What it means |
| --- | --- |
| `server-action-without-authorization` | An action that never checks the session. It is a POST endpoint, not a private function. |
| `server-secret-reaching-the-client` | An environment value read in a Client Component, or passed down as a prop. |
| `secret-in-public-env` | A secret in a `NEXT_PUBLIC_` variable, which is inlined into the bundle by design. |
| `bypassable-middleware` | A matcher whose pattern leaves uncovered a path it was written to guard. |
| `middleware-only-authorization` | Authorization in middleware alone, so the handler itself trusts everything. |
| `over-fetching-in-server-component` | Whole records selected and passed to the client, so unused private fields travel with the page. |
| `unsafe-revalidation` | A revalidate or purge endpoint reachable without a secret. |
| `image-optimizer-abuse` | An image domain allowlist wide enough to turn the optimizer into an open proxy. |

**39 ship for Next.js** by default, and the full catalogue with their
instructions is in [`src/domain/rules/rule.ts`](src/domain/rules/rule.ts) — one
line each, readable in a minute.

Four more sit in the catalogue and stay out of the default set, because nothing
this tool sends could demonstrate them: a race condition needs two requests in
the same instant, and a workflow bypass needs a stateful path it does not walk.
They are not wrong, they are unprovable here — and adding one is your decision.

Each rule carries what would count as having seen it. Most are settled by one
request. A missing limit or a replayable webhook gets a bounded run instead —
fewer than five requests would demonstrate nothing, more than a hundred would be
an outage rather than a proof, and the first refusal ends the run because the
application just defended itself.

A secret written in the source is settled by neither: no request can show it, so
the evidence is the line, and the quoted line is looked for in the file before
the finding is reported. A model that paraphrases is a model that invents.

## What a report looks like

```
Scanned 4 attack-surface entries.

HIGH  Invoice readable without a session
  app/api/invoices/[id]/route.ts:4
  params.id reaches the database with no ownership check.
  proof     GET http://localhost:3000/api/invoices/1
  expected  responds 401 or 403 without a session
  observed  200 OK, 214 bytes

1 proven, 2 discarded after their proof did not reproduce.
```

The discarded count is printed even when it is large, and especially then: it is
the only honest signal you have about the model behind the tool.

## Making it a required check

A model does not answer the same thing twice, so a hunt on its own cannot guard
a merge: it would fail a pull request that changed nothing. A committed baseline
turns that around — what matters stops being what the model found and becomes
the difference.

```bash
npx vulnhunt . --target http://localhost:3000            # 2 proven, exit 1
npx vulnhunt . --target http://localhost:3000 --accept   # decided: these two are known
npx vulnhunt . --target http://localhost:3000            # 2 already in the baseline, exit 0
```

`vulnerability-hunter-baseline.json` is committed next to your code. A finding
keeps its identity across runs because it is keyed on the rule, the file and the
symbol it sits in — not on the line number, which moves the first time somebody
adds an import.

Only a finding nobody accepted stops a build. A flaw that has been fixed is
announced rather than forgotten, because otherwise nobody prunes the file and a
stale entry eventually swallows a real flaw in silence.

## Did the fix work?

```bash
npx vulnhunt . --recheck
  closed       1772966f7718f56c  Invoice readable without a session
  still open   3ad902610ff8ca08  Server Action callable by anyone

1 closed, 1 still open, 0 could not be replayed.
```

The requests that proved each flaw are already in the baseline, so this replays
them: **no model is called**, it is instant and free, and it answers the same
way twice. A proof that could not run counts as neither closed nor open — the
server was down is not the flaw is gone.

## The test you keep

```bash
npx vulnhunt . --emit-tests tests/security
```

One failing test per proven finding, for you to commit. It fails while the flaw
is open, passes once it is closed, and keeps passing afterwards — in your own
suite, with no key, no model and no network. It outlives this tool.

## Passing again

A model does not always give the same answer to the same question, so the hunt
asks each one several times and keeps whatever any pass found. It stops when two
passes in a row bring nothing new.

This costs seconds rather than money, which is why it is the default on a
subscription. With `ANTHROPIC_API_KEY` set it asks once, because there a second
pass is a second line on the bill.

## In CI

```yaml
- uses: tanguychenier/vulnerability-hunter-next@main
  with:
    api-key: ${{ secrets.ANTHROPIC_API_KEY }}
    target: http://localhost:3000
    sarif-file: hunt.sarif

- uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: hunt.sarif
```

Findings land in the **Security** tab and annotate the pull request diff, each
one carrying the request that proved it. The build fails on `exit 1` only when
something was proven; a suspicion never fails a build.

## Options

| Flag | Default | |
| --- | --- | --- |
| `--target <url>` | `http://localhost:3000` | Running application used to prove findings. |
| `--format <fmt>` | `console` | `console`, `sarif`, `json` or `markdown`. |
| `--out <file>` | stdout | Write the report to a file. |
| `--model <name>` | `sonnet` | Model to hunt with. |
| `--dry-run` | off | Map the surface, price the hunt, call nothing. |
| `--local` | off | Ask Ollama on this machine. Nothing leaves it. |
| `--accept` | off | Write what this run proved into the baseline. |
| `--baseline <file>` | `vulnerability-hunter-baseline.json` | Where the baseline lives. |
| `--recheck` | off | Replay the accepted proofs. No model, instant, free. |
| `--emit-tests <dir>` | | Write a failing test per proven finding. |
| `--since <ref>` | | Hunt only what a branch changed. Guards a PR in seconds. |
| `--fail-on <level>` | `low` | Level that stops the build. Everything is still reported. |
| `--no-cache` | off | Ask again about code that has not changed. |
| `--allow-destructive` | off | Send proofs that change state. Disposable servers only. |
| `--allow-remote-target` | off | Hunt a target that is not local. Same warning. |
| `--version` | | Print the installed version. |
| `--help` | | Print the options and the exit codes. |

Exit codes: `0` nothing proven · `1` at least one proven finding · `2` the hunt
could not run. An empty surface is `2`, not `0`: a run that read nothing is not a
clean bill of health. Once a baseline exists, only a finding nobody accepted
returns `1` — a flaw you already decided to live with does not stop the build,
and a flaw that got fixed is announced rather than left to be noticed.

Answers are cached under `node_modules/.cache/vulnerability-hunter`, keyed by the
question itself, so a file edited by one character is asked again and an
untouched one is free. `--no-cache` turns that off.

## Two things it refuses to do on its own

**It will not hunt something that looks like a live site.** The hunt sends
requests designed to succeed, so a target that is not loopback, a private range
or a bare container name is refused before anything is sent and before anything
is paid. `--allow-remote-target` insists.

**It will not send a proof that would change state.** A model asked to
demonstrate a missing guard on a purge route writes a request to that purge
route, and on a real application that request is rows gone. So by default only
reads go out, and nothing whose path announces destruction: purge, delete,
truncate, drop, wipe, flush, reset. `--allow-destructive` sends them, on a
server whose data you can afford to lose.

A refused proof is reported as unproven **with its reason**, never as a flaw
that failed to reproduce. "We did not dare" and "the application held" are
different facts, and reading the first as the second would hide a real flaw
behind a reassuring report.

## What it does not do

- **It does not replace dependency scanning.** Dependabot and Snyk read your
  lockfile, this reads your code. They pair well.
- **It does not find every flaw.** It finds what one HTTP request against a
  running application can demonstrate. A race condition spread over three
  requests is out of reach, and the tool says so rather than guessing.
- **It does not hunt a production deployment.** Point it at a development server
  with disposable data. It sends requests designed to succeed.

## Contributing

```bash
npm install
npm run typecheck
npm test          # no network, no API key
npm run build
```

The architecture is hexagonal on purpose. `src/domain` knows nothing about HTTP,
Next.js or any model vendor; `src/application/ports` names the questions;
`src/infrastructure` answers them. Adding a framework means writing one
`ProjectReader`; adding a model vendor means writing one `ModelGateway`.
`tests/unit/architecture.test.ts` fails the build the moment a layer reaches
outwards, so the rule is enforced rather than described.

Issues and pull requests are welcome, especially real applications where the
surface mapper gets it wrong.

## Licence

MIT © [Tanguy Chénier](https://github.com/tanguychenier)
