/** The only four ways untrusted input reaches the server in the App Router. */
export type SurfaceKind = 'route-handler' | 'server-action' | 'middleware' | 'page'

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
