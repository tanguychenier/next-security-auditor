<div align="center">

# Vulnerability Hunter for Next.js

**Every finding ships with a proof that runs. Nothing else is reported.**

[![CI](https://github.com/tanguychenier/vulnerability-hunter-next/actions/workflows/ci.yml/badge.svg)](https://github.com/tanguychenier/vulnerability-hunter-next/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/vulnerability-hunter-next?color=cb3837&logo=npm&logoColor=white)](https://www.npmjs.com/package/vulnerability-hunter-next)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-5fa04e?logo=node.js&logoColor=white)](package.json)
[![SARIF](https://img.shields.io/badge/output-SARIF%202.1.0-4c1)](https://sarifweb.azurewebsites.net/)

</div>

<div align="center">
  <img src="assets/demo.svg" alt="The auditor maps four entry points, proves one flaw and discards two suspicions that did not reproduce." width="760">
</div>

## The idea

A finding is only useful when the person reading it can check it.

This auditor turns every suspicion into a single HTTP request against your
running application. If the request reproduces the flaw, you get the finding
and the request, so you can replay it in a terminal. If it does not reproduce,
the finding is dropped before you ever see it.

What it looks at is business logic: a route that hands any invoice to anyone who
asks, a Server Action that trusts its arguments, a matcher that leaves the route
it was meant to guard uncovered. It answers a different question from your type
checker, your linter and your dependency scanner, and it runs happily beside all
three.

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
npx vulnerability-hunter-next --dry-run

# Audit against your running dev server.
export ANTHROPIC_API_KEY=sk-ant-...
npx vulnerability-hunter-next --target http://localhost:3000
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
- uses: tanguychenier/vulnerability-hunter-next@v0
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
never fails a build : that is the whole point.

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
keeps an audit cheap : the model reads the eight files that can be attacked,
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
  lockfile, this reads your code. They pair well.
- **It does not find every flaw.** It finds what one HTTP request against a
  running application can demonstrate. A race condition spread over three
  requests is out of reach, and the tool says so rather than guessing.
- **It does not audit a production deployment.** Point it at a development
  server with disposable data. It sends requests designed to succeed.

## Contributing

```bash
npm install
npm run typecheck
npm test          # 51 tests, no network, no API key
npm run build
```

The architecture is hexagonal on purpose. `src/domain` knows nothing about HTTP,
Next.js or any model vendor; `src/application/ports` names the questions;
`src/infrastructure` answers them. Adding a framework means writing one
`ProjectReader`. Adding a model vendor means writing one `VulnerabilityFinder`.

Issues and pull requests are welcome, especially real Next.js applications where
the surface mapper gets it wrong.

## Licence

MIT © [Tanguy Chénier](https://github.com/tanguychenier)
