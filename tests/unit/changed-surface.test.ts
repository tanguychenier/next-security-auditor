/**
 * HUNTING THE WHOLE PROJECT ON EVERY PUSH IS HOW A CHECK GETS SWITCHED OFF.
 *
 * Scoped to the diff, a hunt takes seconds and can guard a pull request rather
 * than run once a night and be ignored.
 */

import { describe, expect, it } from 'vitest'
import { changedSurface } from '../../src/domain/policies/changed-surface.js'
import type { SurfaceEntry } from '../../src/domain/value-objects/surface-entry.js'

const entry = (file: string, kind: SurfaceEntry['kind'] = 'route-handler'): SurfaceEntry => ({ kind, file })

const surface: SurfaceEntry[] = [
  entry('app/api/orders/route.ts'),
  entry('app/api/invoices/route.ts'),
  entry('middleware.ts', 'middleware'),
]

describe('scoping a hunt to what changed', () => {
  it('keeps only the entries whose file the branch touched', () => {
    const scoped = changedSurface(surface, ['app/api/orders/route.ts'])

    expect(scoped.map((found) => found.file)).toContain('app/api/orders/route.ts')
    expect(scoped.map((found) => found.file)).not.toContain('app/api/invoices/route.ts')
  })

  it('hunts everything when it was asked for a diff and given none', () => {
    // Reporting a clean project because git listed no files would be the worst
    // kind of silence this tool could produce.
    expect(changedSurface(surface, [])).toHaveLength(3)
  })

  it('keeps the middleware even when the middleware did not change', () => {
    // MIDDLEWARE IS ABOUT THE ROUTES AROUND IT. Dropping it because its own
    // file did not change would hide exactly the flaw a new route introduces:
    // a path its matcher does not cover.
    const scoped = changedSurface(surface, ['app/api/orders/route.ts'])

    expect(scoped.map((found) => found.file)).toContain('middleware.ts')
  })

  it('finds nothing to hunt when the diff touched no endpoint at all', () => {
    expect(changedSurface(surface, ['README.md'])).toEqual([])
  })
})
