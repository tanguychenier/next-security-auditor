import type { SurfaceEntry } from '../value-objects/surface-entry.js'

/**
 * The part of the surface a branch actually touched.
 *
 * HUNTING THE WHOLE PROJECT ON EVERY PUSH IS HOW A CHECK GETS SWITCHED OFF.
 * Scoped to the diff, a hunt takes seconds and can guard a pull request rather
 * than run once a night and be ignored.
 */
export const changedSurface = (
  surface: readonly SurfaceEntry[],
  changedFiles: readonly string[],
): SurfaceEntry[] => {
  // ASKED FOR A DIFF AND GIVEN NONE, the honest answer is everything. Reporting
  // a clean project because git listed no files would be the worst kind of
  // silence this tool could produce.
  if (changedFiles.length === 0) return [...surface]

  const touched = surface.filter((entry) => changedFiles.includes(entry.file))
  if (touched.length === 0) return []

  // MIDDLEWARE IS ABOUT THE ROUTES AROUND IT. Dropping it because its own file
  // did not change would hide exactly the flaw a new route introduces: a path
  // its matcher does not cover.
  const guards = surface.filter((entry) => entry.kind === 'middleware' && !touched.includes(entry))

  return [...guards, ...touched]
}
