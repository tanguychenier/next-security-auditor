/**
 * THE README COUNTS THE RULES, SO THE COUNT HAS TO BE TRUE.
 *
 * A number in a README is a number nobody updates. This fails the build when
 * the catalogue and the sentence disagree, which is the only way that sentence
 * stays honest.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { ALL_RULES, NEXT_RULES } from '../../src/domain/rules/rule.js'

const readme = readFileSync(fileURLToPath(new URL('../../README.md', import.meta.url)), 'utf8')

describe('what the README promises', () => {
  it('says how many rules actually ship', () => {
    expect(readme).toContain(`${NEXT_RULES.length} ship for Next.js`)
  })

  it('keeps out of the default set what nothing can demonstrate', () => {
    expect(ALL_RULES.length).toBeGreaterThan(NEXT_RULES.length)
  })
})
