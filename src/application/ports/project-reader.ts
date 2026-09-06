import type { SurfaceEntry } from '../../domain/value-objects/surface-entry.js'

/**
 * Reads a project and says where it can be attacked.
 *
 * The port names the question, never the framework: a second adapter for
 * SvelteKit or Nuxt answers the same question without the use cases learning
 * anything new.
 */
export interface ProjectReader {
  attackSurface(): Promise<SurfaceEntry[]>
  read(file: string): Promise<string>
}
