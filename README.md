<div align="center">

# next-security-auditor

**Every finding ships with a proof that runs. Nothing else is reported.**

[![CI](https://github.com/tanguychenier/next-security-auditor/actions/workflows/ci.yml/badge.svg)](https://github.com/tanguychenier/next-security-auditor/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/next-security-auditor?color=cb3837&logo=npm&logoColor=white)](https://www.npmjs.com/package/next-security-auditor)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-5fa04e?logo=node.js&logoColor=white)](package.json)
[![SARIF](https://img.shields.io/badge/output-SARIF%202.1.0-4c1)](https://sarifweb.azurewebsites.net/)

</div>

<div align="center">
  <img src="assets/demo.svg" alt="The auditor maps four entry points, proves one flaw and discards two suspicions that did not reproduce." width="760">
</div>

## Why another security tool

PHPStan, ESLint and TypeScript catch mistakes in the shape of your code. SAST
tools follow tainted values. Dependency scanners flag published CVEs in packages
you did not write.

None of them can tell you that `/api/invoices/[id]` returns any invoice to
anyone who asks. That is not a type error, not a tainted flow and not a CVE —
it is business logic, and it is where applications actually get breached.

LLM auditors go after exactly that gap, and they all share one flaw: **they
report what a model believes.** You are handed a list of maybes, ranked by a
confidence score the model gave itself, and you spend an afternoon deciding
which ones are real.

This one does not ask you to believe anything.

## How it works

```
app/ ──▶ map the surface ──▶ suspect ──▶ prove ──▶ report what reproduced
         route handlers      a model     a real     everything else is
         server actions      reads the   HTTP       dropped, silently
         middleware          code        request
         pages
```

Every suspicion becomes a single HTTP request sent to your running
application. The request either reproduces the flaw or it does not.

- It reproduced → you get the finding **and the request**, so you can replay it.
- It did not → the finding is discarded. You never see it.
- It could not run → discarded too. A proof that cannot execute proves nothing.

The rule lives in the domain layer, not in a reporter, so no output format and
no future contributor can route around it.

## Quick start

```bash
# See what would be audited and what it would cost. No API key, nothing sent.
npx next-security-auditor --dry-run

# Audit against your running dev server.
export ANTHROPIC_API_KEY=sk-ant-...
npx next-security-auditor --target http://localhost:3000
```

```
4 attack-surface entries found.
8 model calls, about 11,742 input tokens.
Estimated cost: 0.15 EUR. Nothing was sent.

  route-handler  app/api/invoices/[id]/route.ts
  server-action  app/dashboard/actions.ts
  page           app/dashboard/page.tsx
  middleware     middleware.ts
```

`--dry-run` is not a courtesy. Sending an unknown codebase to a frontier model
and discovering the bill afterwards is a good reason never to try a tool twice.

## In CI

```yaml
- uses: tanguychenier/next-security-auditor@v0
  with:
    api-key: ${{ secrets.ANTHROPIC_API_KEY }}
    target: http://localhost:3000
    sarif-file: audit.sarif

- uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: audit.sarif
```

Findings land in the **Security** tab of the repository and annotate the pull
request diff, each one carrying the request that proved it. A reviewer can paste
that request into a terminal and see it for himself.

The build fails on `exit 1` only when something was **proven**. A suspicion
never fails a build — that is the whole point.

## What it looks for

| Kind | What it means |
| --- | --- |
| `missing-authorization` | A route handler that never checks who is calling. |
| `broken-object-level-authorization` | It checks that you are logged in, not that the row is yours. |
| `server-secret-reaching-the-client` | A server-only value serialised into the RSC payload or the HTML. |
| `unvalidated-server-action-input` | A Server Action trusting its arguments. They come from the browser. |
| `bypassable-middleware` | A `matcher` that does not cover the routes it is believed to guard. |
| `ssrf` | A server fetch whose URL the caller controls. |
| `information-disclosure` | Stack traces, internal identifiers and paths reaching the browser. |

Next.js specifics are the point: the App Router has a small, knowable set of
places where untrusted input reaches the server. Mapping them first is what
keeps an audit cheap — the model reads the eight files that can be attacked,
not the eight hundred that cannot.

## Options

| Flag | Default | |
| --- | --- | --- |
| `--target <url>` | `http://localhost:3000` | Running application used to prove findings. |
| `--format <fmt>` | `console` | `console`, `sarif` or `json`. |
| `--out <file>` | stdout | Write the report to a file. |
| `--model <name>` | Claude Sonnet 4.5 | Model used for the audit. |
| `--dry-run` | off | Map the surface, estimate the cost, call nothing. |

Exit codes: `0` nothing proven · `1` at least one proven finding · `2` the audit
could not run.

## What it does not do

- **It does not replace dependency scanning.** Dependabot and Snyk read your
  lockfile; this reads your code. Run both.
- **It does not find every flaw.** It finds flaws it can demonstrate with one
  HTTP request against a running application. A race condition across three
  requests is out of reach, and saying otherwise would be the same unverifiable
  claim this tool exists to remove.
- **It does not audit a production deployment.** Point it at a development
  server with disposable data. It sends requests designed to succeed.

## Contributing

```bash
npm install
npm run typecheck
npm test          # 47 tests, no network, no API key
npm run build
```

The architecture is hexagonal on purpose. `src/domain` knows nothing about HTTP,
Next.js or any model vendor; `src/application/ports` names the questions;
`src/infrastructure` answers them. Adding a framework means writing one
`ProjectReader`. Adding a model vendor means writing one `SecurityAuditor`.

Issues and pull requests are welcome, especially real Next.js applications where
the surface mapper gets it wrong.

## Licence

MIT © [Tanguy Chénier](https://github.com/tanguychenier)
