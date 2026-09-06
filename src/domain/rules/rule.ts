/**
 * One class of flaw the hunt looks for.
 *
 * A RULE IS DATA, NOT A UNION OF STRING LITERALS. New classes of flaw appear
 * constantly and the model already knows most of them by name, so a closed
 * union would silently drop everything it does not enumerate. The catalogue
 * steers the hunt and filters the report; it never decides what may exist.
 *
 * Instructions are optional on purpose: demanding a paragraph before a team can
 * add a rule is what keeps catalogues a year behind the attacks.
 */
/** What would count as having seen a flaw happen. */
export type Evidence =
  /** One HTTP request against the running application shows it. */
  | 'request'
  /** A bounded run of requests shows it, where one shows nothing. */
  | 'sequence'
  /** Nothing this tool sends could demonstrate it. */
  | 'unprovable'
  /** The evidence is in the file: a literal quoted at its line. */
  | 'source'

export interface Rule {
  readonly id: string
  readonly instructions?: string
  readonly evidence: Evidence
}

/** Two spellings of the same rule are one rule. */
const normalise = (name: string): string =>
  name.trim().toLowerCase().replace(/[\s_]+/g, '-').replace(/^-+|-+$/g, '')

export const rule = (name: string, instructions?: string, evidence: Evidence = 'request'): Rule => {
  const id = normalise(name)
  if (id.length === 0) throw new TypeError('a rule needs a name: an empty one steers nothing')
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
    throw new TypeError(`a rule name is made of words, letters and digits only: "${name}" is not one`)
  }
  const said = instructions?.trim()
  return said === undefined || said.length === 0 ? { id, evidence } : { id, instructions: said, evidence }
}

/**
 * What a Next.js application is worth hunting for, out of the box.
 *
 * Wide on purpose: a hunt that only looks for what its author thought of finds
 * what everybody already knows. It is not a ceiling either — a project adds a
 * rule with one line in its config file.
 *
 * The shapes here are the ones only this framework has. A Server Action is a
 * POST endpoint that looks like a function call, a Client Component is a file
 * whose whole content ships to the browser, and a middleware matcher is a
 * guard that is easy to write and easy to leave a hole in.
 */
const DEFINITIONS: Readonly<Record<string, string>> = {
  // --- Who is allowed in ------------------------------------------------
  'missing-authorization': 'A route handler reachable by HTTP that never checks who is calling. Evidence: the request answers 200 with no session where it should answer 401 or 403.',
  'broken-object-level-authorization': 'An identifier taken from the request reaches the database with no ownership check. Evidence: a request for a row belonging to someone else answers 200.',
  'server-action-without-authorization': 'A Server Action that never checks the session. It is a POST endpoint anyone can call, not a function only your button can reach.',
  'bypassable-middleware': 'A middleware matcher whose pattern leaves uncovered a path it was written to guard. Evidence: the uncovered path answers 200 unauthenticated.',
  'middleware-only-authorization': 'Authorization enforced in middleware alone, so any path the matcher misses is wide open and the handler itself trusts everything.',
  'role-escalation': 'A handler or action that lets a caller obtain a role it was not granted, through a body field or a parameter.',
  'missing-csrf-protection': 'A state-changing handler that accepts a cross-origin request with no token and no origin check.',

  // --- What the request is allowed to say --------------------------------
  'sql-injection': 'Request data interpolated into SQL instead of being passed as a parameter.',
  'nosql-injection': 'Request data passed as an object into a query filter, letting the caller inject operators.',
  'command-injection': 'Request data reaching exec, spawn or a shell without escaping.',
  'unvalidated-server-action-input': 'A Server Action argument trusted without a schema, then used to write.',
  'unvalidated-request-input': 'A request body trusted without a schema, then used to write.',
  'mass-assignment': 'A body spread straight into a database write, so the caller sets fields it should not.',
  'prototype-pollution': 'Request data merged into an object without guarding __proto__ or constructor.',
  'insecure-deserialization': 'Untrusted input revived into objects the payload chooses.',

  // --- Where the server is made to go ------------------------------------
  ssrf: 'A server-side fetch whose URL the caller controls. Evidence: the response carries content the server was made to retrieve.',
  'open-redirect': 'A redirect target read from the request with no allowlist. Evidence: the response redirects to a host the caller chose.',
  'host-header-injection': 'A URL, a mail link or a cache key built from the Host or X-Forwarded-Host header.',
  'permissive-cors-origin': 'A CORS policy reflecting the caller Origin, or allowing credentials on a wildcard.',
  'path-traversal': 'A file path built from request data, letting a caller step outside the intended directory.',

  // --- What leaks back to the browser -------------------------------------
  'server-secret-reaching-the-client': 'An environment value read in a Client Component, or passed as a prop from a Server Component, so it ships in the JavaScript bundle.',
  'secret-in-public-env': 'A secret held in a NEXT_PUBLIC_ variable, which is inlined into the browser bundle by design.',
  'sensitive-data-exposure': 'A response or a serialised prop carrying fields the caller should not see: hashes, tokens, internal identifiers, other people data.',
  'information-disclosure': 'Stack traces, internal paths or debug output reaching the browser.',
  'over-fetching-in-server-component': 'A Server Component selecting whole records and passing them to the client, so unused private fields travel with the page.',
  'unguarded-route-handler-error': 'An error handler returning the raw exception, naming the database, the query or the file system.',

  // --- How the business rules can be walked around -------------------------
  'business-logic-flaw': 'A sequence of legitimate calls that reaches a state the rules forbid.',
  'price-manipulation': 'A total, a discount or a quantity taken from the payload instead of being recomputed on the server.',
  'state-machine-bypass': 'A step reachable out of order, skipping a stage the flow requires.',
  'race-condition': 'A check and its write separated, so two concurrent calls both pass the check.',
  'insecure-workflow': 'A multi-step flow whose later steps never verify that the earlier ones happened.',

  // --- What protects the edges ---------------------------------------------
  'missing-rate-limiting': 'An expensive or sensitive handler that accepts unlimited attempts: login, password reset, search, export, mail.',
  'missing-signature-verification': 'A webhook accepted without verifying its signature.',
  'webhook-replay': 'A webhook whose payload can be replayed because no timestamp or nonce is checked.',
  'cache-poisoning': 'A cached response whose key misses something it varies on, so one caller poisons another response.',
  'unsafe-revalidation': 'A revalidate or purge endpoint reachable without a secret, letting anyone flush the cache.',
  'image-optimizer-abuse': 'An image domain allowlist wide enough to turn the optimizer into an open proxy.',

  // --- What the secrets are worth -------------------------------------------
  'hardcoded-secret': 'A key, password or token written in the source or committed configuration. Evidence: the literal, quoted at its line.',
  'weak-cryptography': 'md5, sha1, ECB, a static IV or a home-made cipher used where a real one is needed.',
  'insecure-random': 'Math.random used for a token, an identifier or a password reset.',
  'weak-password-hashing': 'A password hashed with anything other than a modern, salted, slow algorithm.',
  'insecure-cookie': 'A session cookie without httpOnly, secure or a sane sameSite.',
  'weak-content-security-policy': 'A CSP absent, or so permissive that it stops nothing.',
}

/**
 * How each rule that is not shown by one request would be seen instead.
 *
 * MEASURED ON A LIVE RUN of the sibling tool: missing-rate-limiting was reported
 * as proven because one POST answered 200, which shows nothing about the
 * fifty-first. A run of requests shows it; a race condition needs two requests
 * in the same instant, which this tool does not do, so it stays out.
 */
const EVIDENCE: Readonly<Record<string, Evidence>> = {
  'hardcoded-secret': 'source',
  'weak-cryptography': 'source',
  'insecure-random': 'source',
  'weak-password-hashing': 'source',
  'secret-in-public-env': 'source',
  'missing-rate-limiting': 'sequence',
  'webhook-replay': 'sequence',
  'race-condition': 'unprovable',
  'state-machine-bypass': 'unprovable',
  'insecure-workflow': 'unprovable',
  'business-logic-flaw': 'unprovable',
} as Readonly<Record<string, Evidence>>

/** Every rule, including the ones this tool cannot demonstrate. */
export const ALL_RULES: readonly Rule[] = Object.entries(DEFINITIONS).map(([name, instructions]) =>
  rule(name, instructions, EVIDENCE[name] ?? 'request'),
)

/**
 * What ships as the default hunt.
 *
 * WHAT NOTHING CAN SHOW IS LEFT OUT, and stays in the catalogue: the flaw is
 * real, we simply cannot demonstrate it, and pretending otherwise is the
 * failure this exists to prevent.
 */
export const NEXT_RULES: readonly Rule[] = ALL_RULES.filter((entry) => entry.evidence !== 'unprovable')

export interface RuleSelection {
  /** Hunt these and nothing else. */
  readonly only?: readonly string[]
  /** Mute these, whatever else says. */
  readonly without?: readonly string[]
  /** Add a rule nobody shipped, or replace a shipped one. */
  readonly with?: Readonly<Record<string, string | undefined>>
}

/**
 * The rules a hunt will actually run.
 *
 * THE SELECTION IS SPENT ON THE PROMPT, not on the report. Filtering afterwards
 * still costs the full search: a team that asked for three rules would pay for
 * forty and be shown three.
 */
export const selectedRules = (selection: RuleSelection = {}): readonly Rule[] => {
  const wanted = selection.only?.map((name) => rule(name).id)
  const kept = wanted === undefined ? [...NEXT_RULES] : NEXT_RULES.filter((entry) => wanted.includes(entry.id))

  const byId = new Map(kept.map((entry) => [entry.id, entry]))
  for (const [name, instructions] of Object.entries(selection.with ?? {})) {
    const added = rule(name, instructions)
    byId.set(added.id, added)
  }

  // REMOVING WINS OVER KEEPING, so a muted rule stays muted even when an
  // override or a set would have brought it back.
  const muted = (selection.without ?? []).map((name) => rule(name).id)

  return [...byId.values()].filter((entry) => !muted.includes(entry.id))
}
