import { defineConfig } from 'vitest/config'

/**
 * The project now lives inside a much larger repository, and Vite walks UPWARD
 * looking for a PostCSS config until it finds one. It found an unparseable JSON
 * file in a parent directory and the whole suite died before a single test ran.
 *
 * Pinning an empty PostCSS config stops that search at the root of this package.
 * This tool has no stylesheets, so there is nothing to lose and a whole class of
 * "works on my machine" to avoid.
 */
export default defineConfig({
  root: import.meta.dirname,
  css: { postcss: { plugins: [] } },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    reporters: ['default'],
  },
})
