import type { AuditReport } from '../../application/use-cases/run-audit.js'
import type { AuditedFinding } from '../../domain/policies/reportable-findings.js'

/**
 * A TITLE WITH A PIPE IN IT WOULD SPLIT THE ROW, and the reader would see a
 * mangled table rather than a finding.
 */
const escaped = (text: string): string => text.replaceAll('|', '\\|')

const detail = (entry: AuditedFinding): string[] => [
  `### ${escaped(entry.finding.title)}`,
  '',
  escaped(entry.finding.rationale),
  '',
  '```',
  `proof     ${entry.proof.request}`,
  `expected  ${entry.proof.expectation}`,
  `observed  ${entry.proof.observed}`,
  '```',
]

/**
 * The report somebody pastes into a pull request.
 *
 * SARIF is read by machines and the console by whoever ran the hunt. Markdown
 * is what ends up in a review, a ticket or a message, which is where a finding
 * actually gets acted on.
 */
export const renderMarkdown = (report: AuditReport): string => {
  const lines = ['## Vulnerability hunt', '']

  if (report.proven.length === 0) {
    lines.push(`Scanned ${report.surfaceScanned} attack-surface entries. Nothing was proven exploitable.`)
    if (report.suspected > 0) {
      lines.push('')
      lines.push(
        `${report.suspected} suspicion${report.suspected > 1 ? 's were' : ' was'} raised and none survived its proof.`,
      )
    }
    return `${lines.join('\n')}\n`
  }

  lines.push(
    `**${report.proven.length} proven**, ${report.discarded} discarded after their proof did not reproduce, ` +
      `across ${report.surfaceScanned} attack-surface entries.`,
    '',
    '| Severity | Rule | Where |',
    '| --- | --- | --- |',
  )

  for (const entry of report.proven) {
    lines.push(
      `| ${entry.finding.severity.toUpperCase()} | \`${escaped(entry.finding.kind.id)}\` | ` +
        `\`${escaped(entry.finding.location)}\` |`,
    )
  }

  for (const entry of report.proven) lines.push('', ...detail(entry))

  return `${lines.join('\n')}\n`
}
