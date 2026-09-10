/**
 * Where a Next.js application meets the outside world.
 *
 * The first four are how untrusted input reaches the server. The last one is
 * the other direction, and it is why it belongs here: a Client Component is a
 * file whose whole content ships to the browser, so what it holds has already
 * left. The catalogue names rules for that, and without this kind they were
 * rules nothing could ever carry.
 */
export type SurfaceKind = 'route-handler' | 'server-action' | 'middleware' | 'page' | 'client-component'

export interface SurfaceEntry {
  readonly kind: SurfaceKind
  /** Path relative to the project root, so reports are copy-pasteable. */
  readonly file: string
  /** The URL an attacker would hit. Absent for Server Actions, which have none. */
  readonly reachableAs?: string
  /** HTTP verbs a route handler exports. */
  readonly methods?: readonly string[]
  /** Exported Server Actions. Non-exported functions are not endpoints. */
  readonly exports?: readonly string[]
  /** The matcher a middleware declares, which is also what it fails to cover. */
  readonly matcher?: readonly string[]
}
