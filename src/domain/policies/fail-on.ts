import { Severity, worstFirst } from '../value-objects/severity.js'

/**
 * How bad a proven finding has to be before it stops a build.
 *
 * A TEAM THAT CANNOT TUNE THIS TURNS THE CHECK OFF the first time a low
 * severity finding blocks a release, and then nothing is checked at all.
 *
 * It decides what stops a build, never what is reported: hiding a finding and
 * failing to mention it are different things, and only one of them is honest.
 */
export interface Threshold {
  reached(severity: Severity): boolean
}

const atLeast = (threshold: Severity): Threshold => ({
  reached: (severity) => worstFirst(severity, threshold) <= 0,
})

/** Anything proven stops the build. */
export const anySeverity = (): Threshold => atLeast(Severity.Low)

export const failOn = (name: string): Threshold => {
  const chosen = Object.values(Severity).find((severity) => severity === name.trim().toLowerCase())
  if (chosen === undefined) {
    // SILENTLY FALLING BACK would gate a pipeline on something nobody chose,
    // and the team would find out during an incident.
    throw new Error(`unknown severity "${name}": expected critical, high, medium or low`)
  }
  return atLeast(chosen)
}
