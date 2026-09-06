import type { ProofPlan } from '../value-objects/proof-plan.js'

/** Methods a specification says change nothing on the server. */
const READS = ['GET', 'HEAD', 'OPTIONS']

/**
 * Words that mean "this endpoint destroys something".
 *
 * A heuristic, and the right kind: it errs towards not sending. A refusal costs
 * a finding; a wrong send costs somebody's data.
 */
const DESTROYS = [
  'purge', 'delete', 'destroy', 'truncate', 'drop', 'wipe', 'flush',
  'reset', 'clear', 'erase', 'remove-all', 'prune', 'revoke',
]

export interface Verdict {
  readonly allowed: boolean
  readonly why: string
}

/**
 * What this hunt is willing to send at somebody's application.
 *
 * A PROOF IS A REAL ATTACK, AND IT LANDS ON A REAL APPLICATION. A model asked to
 * demonstrate a missing guard on a purge route writes a request to that purge
 * route, and on a running application that request is rows gone.
 *
 * So the default is narrow: methods that are supposed to change nothing, and no
 * path that announces it destroys something. It costs coverage, and that is the
 * right trade for a tool pointed at an application somebody depends on.
 */
export const safeToSend = (plan: ProofPlan, allow: { destructive?: boolean } = {}): Verdict => {
  if (allow.destructive === true) return { allowed: true, why: '' }

  const advice = 'Point the hunt at a disposable server and pass --allow-destructive to send it.'

  if (!READS.includes(plan.method.toUpperCase())) {
    return { allowed: false, why: `the proof was not sent: ${plan.method} changes state by definition. ${advice}` }
  }

  const path = plan.path.toLowerCase()
  if (DESTROYS.some((word) => path.includes(word))) {
    return {
      allowed: false,
      why: `the proof was not sent: its path looks like it would destroy something ("${plan.path}"). ${advice}`,
    }
  }

  return { allowed: true, why: '' }
}

/**
 * Whether a target looks like a server somebody can afford to lose.
 *
 * THE HUNT SENDS REQUESTS DESIGNED TO SUCCEED. Pointed at a public hostname by
 * accident — a copied command, a leftover variable, a CI secret — it attacks
 * something somebody depends on. Loopback and private ranges are where a
 * throwaway server actually lives, so everything else has to be asked for.
 */
export const disposableTarget = (url: string): boolean => {
  let host: string
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^\[|\]$/g, '')
  } catch {
    // AN UNREADABLE TARGET IS NOT A SAFE ONE: defaulting to yes would turn
    // every parsing gap into a way to attack production.
    return false
  }
  if (host.length === 0) return false

  if (['localhost', '::1', '0.0.0.0'].includes(host) || host.endsWith('.localhost')) return true
  // A BARE NAME IS A CONTAINER ON A COMPOSE NETWORK, not a website.
  if (!host.includes('.') && !host.includes(':')) return true

  const asIpv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  if (asIpv4 === null) return false

  const [first, second] = asIpv4.slice(1).map(Number) as [number, number, number, number]
  if (first === 127 || first === 10) return true
  if (first === 192 && second === 168) return true
  return first === 172 && second >= 16 && second <= 31
}
