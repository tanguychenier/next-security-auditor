import { defineConfig } from 'vitest/config'

/**
 * THE SUITE, MINUS THE ONE TEST THAT SPAWNS THE BUILT BINARY.
 *
 * Mutation testing runs the tests against a copy of the source, thousands of
 * times. The end-to-end test drives `dist/`, which no mutant ever reaches, so it
 * would answer the same thing every time — slowly, and from code that was never
 * mutated.
 *
 * Everything else stays, the in-process command tests included: they are the
 * ones that catch a mutant in the wiring, which is where this repository has had
 * its real regressions.
 *
 * The root and the empty PostCSS config are here for the same reason they are in
 * vitest.config.ts: Vite walks upward looking for one until it finds a file it
 * cannot parse.
 */
export default defineConfig({
  root: import.meta.dirname,
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['**/node_modules/**', 'tests/integration/command-line-end-to-end.test.ts'],
    environment: 'node',
    // ONE PROCESS, ONE MUTANT. Stryker activates a mutant through an environment
    // variable in the process it started; with a pool of workers the variable
    // never reaches the code under test, every mutant survives, and the score
    // measures the plumbing rather than the tests.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false,
  },
})
