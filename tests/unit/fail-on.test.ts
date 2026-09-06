/**
 * A TEAM THAT CANNOT TUNE THE THRESHOLD TURNS THE CHECK OFF.
 *
 * The first time a low-severity finding blocks a release nobody argues with the
 * finding: they delete the CI step. A threshold is what keeps the step there.
 */

import { describe, expect, it } from 'vitest'
import { failOn, anySeverity } from '../../src/domain/policies/fail-on.js'
import { Severity } from '../../src/domain/value-objects/severity.js'

describe('deciding what stops a build', () => {
  it('stops on anything proven when no threshold was chosen', () => {
    const threshold = anySeverity()

    expect(threshold.reached(Severity.Critical)).toBe(true)
    expect(threshold.reached(Severity.Low)).toBe(true)
  })

  it('stops on the chosen level and everything worse', () => {
    const threshold = failOn('high')

    expect(threshold.reached(Severity.Critical)).toBe(true)
    expect(threshold.reached(Severity.High)).toBe(true)
    expect(threshold.reached(Severity.Medium)).toBe(false)
    expect(threshold.reached(Severity.Low)).toBe(false)
  })

  it('reads a level however it was typed', () => {
    expect(failOn('  CRITICAL ').reached(Severity.Critical)).toBe(true)
  })

  it('refuses a level it does not know instead of falling back silently', () => {
    // SILENTLY FALLING BACK would gate a pipeline on something nobody chose,
    // and the team would find out during an incident.
    expect(() => failOn('blocker')).toThrow('unknown severity')
  })
})
