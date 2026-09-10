/** An HTTP request written so a human could send it by hand with curl. */
export interface ProofPlan {
  readonly method: string
  readonly path: string
  readonly headers?: Readonly<Record<string, string>>
  readonly body?: string
  /** What a correctly behaving application must answer. */
  readonly expectation: string
  /** Status codes that mean the flaw happened. */
  readonly reproducesOnStatus: readonly number[]
  /** A string whose presence in the body also means the flaw happened. */
  readonly reproducesOnBodyContaining?: string
  /**
   * How many identical requests it takes to show the flaw.
   *
   * ONE POST ANSWERING 200 SAYS NOTHING ABOUT THE FIFTY-FIRST. Absent for
   * everything a single request settles, which is almost everything.
   */
  readonly repeat?: number
}

/**
 * Statuses that mean the application did not hand over what was asked for.
 *
 * A plan recognising only these has been written backwards: it declares the
 * flaw demonstrated at the exact moment the application defends itself.
 */
const DEFENDED = [401, 403, 404, 405, 407]

/** Wording an application uses when it refuses, never when it leaks. */
const REFUSALS = [
  'unauthorized', 'unauthorised', 'forbidden', 'access denied',
  'permission denied', 'not allowed', 'please log in', 'please login',
  'authentication required', 'login required', 'must be logged in',
]

/**
 * Builds a plan, or refuses one that could never demonstrate anything.
 *
 * SEEN FROM A REAL MODEL: `reproducesOnBodyContaining: "Unauthorized access"`.
 * That says the flaw is demonstrated when the application answers that access
 * was denied — which is the application working. Measured on a local model,
 * half the plans came out this way.
 *
 * Such a plan runs, fails, and reports a real flaw as not reproduced. Refusing
 * it costs one finding; running it costs the reader their trust in every empty
 * report this tool will ever print.
 */
export const proofPlan = (shape: ProofPlan): ProofPlan => {
  const asked = [...shape.reproducesOnStatus]
  const marker = shape.reproducesOnBodyContaining

  // A PLAN THAT RECOGNISES NOTHING CANNOT FAIL, so it would report every route
  // as vulnerable.
  if (asked.length === 0 && (marker === undefined || marker.length === 0)) {
    throw new TypeError('a proof plan says what makes it reproduce: without that it can never fail')
  }

  // ONE DEFENDED STATUS IN THE LIST IS ENOUGH TO RUIN THE PLAN. Measured on a
  // real run: a model answered [200, 404] for an uncovered middleware path, the
  // route did not exist, the server said 404, and the hunt reported a proven
  // vulnerability whose evidence was the application not having that page.
  // Refusing only when every status is a refusal let that through.
  const statuses = asked.filter((status) => !DEFENDED.includes(status))
  const markerIsRefusal =
    marker !== undefined && REFUSALS.some((refusal) => marker.toLowerCase().includes(refusal))
  const hasMarker = marker !== undefined && marker.length > 0

  if ((statuses.length === 0 && !hasMarker) || markerIsRefusal) {
    throw new TypeError(
      'this proof plan recognises the application defending itself, not the flaw: ' +
        'it would run, fail, and report a real flaw as not reproduced',
    )
  }

  return { ...shape, method: shape.method.toUpperCase(), reproducesOnStatus: statuses }
}
