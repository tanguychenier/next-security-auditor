/**
 * THE FIRST COMMAND ANYBODY TYPES IS THE WRONG ONE.
 *
 * So the message they get is the first thing they read about this tool. It has
 * to say what was looked for and what to try next, not only that something
 * failed.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const source = readFileSync(fileURLToPath(new URL('../../src/cli/main.ts', import.meta.url)), 'utf8')

describe('the message somebody gets when they point it at the wrong place', () => {
  it('says what it looked for', () => {
    expect(source).toContain('It looked for route handlers and Server Actions')
  })

  it('says what to type instead', () => {
    expect(source).toContain('If your application lives elsewhere')
    expect(source).toContain('npx vulnhunt path/to/app --dry-run')
  })

  it('never calls an empty surface a clean project', () => {
    // RETURNING 0 HERE would put a green tick on a run that read nothing.
    expect(source).toMatch(/No Next\.js attack surface found[\s\S]{0,600}return 2/)
  })
})
