import type { AuditReport } from '../../application/use-cases/run-audit.js'
import { Severity } from '../../domain/value-objects/severity.js'

const COLOURS: Readonly<Record<Severity, string>> = Object.freeze({
  [Severity.Critical]: '\u001b[41m\u001b[97m',
  [Severity.High]: '\u001b[31m',
  [Severity.Medium]: '\u001b[33m',
  [Severity.Low]: '\u001b[90m',
})
const RESET = '\u001b[0m'

/**
 * Renders the report for a human.
 *
 * COLOUR IS DROPPED WHENEVER STDOUT IS NOT A TERMINAL. Escape codes in a CI log
 * or a piped file are noise that makes the output harder to read, not richer.
 *
 * The discarded count is printed even when it is large, and especially then: a
 * run that suspected twelve things and proved one is the tool doing its job,
 * and hiding that number would remove the only honest quality signal a reader
 * has about the model behind it.
 */
export const renderConsole = (report: AuditReport, colour = process.stdout.isTTY === true): string => {
  const paint = (severity: Severity, text: string): string =>
    colour ? `${COLOURS[severity]}${text}${RESET}` : text

  const lines: string[] = []
  lines.push(`Scanned ${report.surfaceScanned} attack-surface entries.`)

  if (report.proven.length === 0) {
    lines.push('')
    lines.push('Nothing was proven exploitable.')
    if (report.suspected > 0) {
      lines.push(
        `${report.suspected} suspicion${report.suspected > 1 ? 's were' : ' was'} raised and none survived its proof.`,
      )
    }
    return lines.join('\n')
  }

  lines.push('')
  for (const { finding, proof } of report.proven) {
    lines.push(`${paint(finding.severity, finding.severity.toUpperCase())}  ${finding.title}`)
    lines.push(`  ${finding.location}`)
    lines.push(`  ${finding.rationale}`)
    lines.push(`  proof     ${proof.request}`)
    lines.push(`  expected  ${proof.expectation}`)
    lines.push(`  observed  ${proof.observed}`)
    lines.push('')
  }
  lines.push(
    `${report.proven.length} proven, ${report.discarded} discarded after their proof did not reproduce.`,
  )
  return lines.join('\n')
}
