import type { ProofPlan } from '../value-objects/proof-plan.js'
import { proofPlan } from '../value-objects/proof-plan.js'

export interface AcceptedProof {
  readonly id: string
  readonly rule: string
  readonly file: string
  readonly title: string
  readonly plan?: ProofPlan
}

export interface Comparison {
  readonly appeared: readonly string[]
  readonly known: readonly string[]
  readonly gone: readonly string[]
}

/**
 * Only something new stops a build.
 *
 * A FIXED FLAW IS GOOD NEWS and must never fail anything. A known one was
 * accepted on purpose. What nobody has seen before is the only thing worth
 * interrupting somebody for.
 */
export const stopsTheBuild = (compared: Comparison): boolean => compared.appeared.length > 0

export const compare = (accepted: readonly string[], proved: readonly string[]): Comparison => ({
  appeared: proved.filter((id) => !accepted.includes(id)),
  known: proved.filter((id) => accepted.includes(id)),
  gone: accepted.filter((id) => !proved.includes(id)),
})

/**
 * Reads the committed file.
 *
 * AN UNREADABLE FILE IS REFUSED, never treated as empty. An empty list accepts
 * nothing and fails everything, which reads exactly like a real regression and
 * would send a team hunting a flaw that is not there.
 */
export const readAccepted = (json: string): AcceptedProof[] => {
  let decoded: { accepted?: unknown }
  try {
    decoded = JSON.parse(json) as { accepted?: unknown }
  } catch (failure) {
    throw new Error(`the accepted findings file could not be read: ${(failure as Error).message}`)
  }

  if (!Array.isArray(decoded.accepted)) return []

  return decoded.accepted.flatMap((entry): AcceptedProof[] => {
    if (typeof entry !== 'object' || entry === null) return []
    const shape = entry as Record<string, unknown>
    if (typeof shape['id'] !== 'string') return []
    const plan = planIn(shape['proof'])
    return [
      {
        id: shape['id'],
        rule: typeof shape['rule'] === 'string' ? shape['rule'] : '',
        file: typeof shape['file'] === 'string' ? shape['file'] : '',
        title: typeof shape['title'] === 'string' ? shape['title'] : '',
        ...(plan === undefined ? {} : { plan }),
      },
    ]
  })
}

/**
 * A plan the domain would refuse today is dropped rather than replayed: a
 * baseline written by an older version, or edited by hand, must not put an
 * inverted plan back into circulation.
 */
const planIn = (raw: unknown): ProofPlan | undefined => {
  if (typeof raw !== 'object' || raw === null) return undefined
  const shape = raw as Record<string, unknown>
  if (typeof shape['method'] !== 'string' || typeof shape['path'] !== 'string') return undefined

  const statuses = Array.isArray(shape['reproducesOnStatus'])
    ? shape['reproducesOnStatus'].filter((value): value is number => Number.isInteger(value))
    : []

  try {
    return proofPlan({
      method: shape['method'],
      path: shape['path'],
      expectation: typeof shape['expectation'] === 'string' ? shape['expectation'] : 'the application refuses',
      reproducesOnStatus: statuses,
      ...(typeof shape['reproducesOnBodyContaining'] === 'string'
        ? { reproducesOnBodyContaining: shape['reproducesOnBodyContaining'] }
        : {}),
    })
  } catch {
    return undefined
  }
}

/**
 * Writes the file a team commits.
 *
 * SORTED BY IDENTITY, so writing it twice gives the same bytes and the diff a
 * reviewer reads shows only what actually changed.
 */
export const writeAccepted = (entries: readonly AcceptedProof[]): string =>
  `${JSON.stringify(
    { accepted: [...entries].sort((left, right) => left.id.localeCompare(right.id)) },
    null,
    2,
  )}\n`
