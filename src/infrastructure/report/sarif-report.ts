import type { AuditedFinding } from '../../domain/policies/reportable-findings.js'
import { Severity } from '../../domain/value-objects/severity.js'

const LEVEL: Readonly<Record<Severity, string>> = Object.freeze({
  [Severity.Critical]: 'error',
  [Severity.High]: 'error',
  [Severity.Medium]: 'warning',
  [Severity.Low]: 'note',
})

/**
 * Renders the report as SARIF 2.1.0, which is what GitHub reads.
 *
 * WHY THIS MATTERS MORE THAN IT LOOKS. A tool that prints to a terminal is run
 * once. A tool that files findings into the Security tab of a pull request is
 * run on every commit by everyone on the team. SARIF is the whole difference
 * between a demo and something a project adopts.
 *
 * The proof travels inside the message rather than in a side channel: whoever
 * reads the alert on GitHub gets the request that demonstrates it, and can
 * replay it before believing a word.
 */
export const toSarif = (proven: readonly AuditedFinding[], version: string): string =>
  JSON.stringify(
    {
      $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
      version: '2.1.0',
      runs: [
        {
          tool: {
            driver: {
              name: 'next-security-auditor',
              informationUri: 'https://github.com/tanguychenier/next-security-auditor',
              version,
              rules: [...new Set(proven.map((entry) => entry.finding.kind))].map((kind) => ({
                id: kind,
                shortDescription: { text: kind.replaceAll('-', ' ') },
              })),
            },
          },
          results: proven.map((entry) => ({
            ruleId: entry.finding.kind,
            level: LEVEL[entry.finding.severity],
            message: {
              text: [
                entry.finding.title,
                entry.finding.rationale,
                `Proof — sent: ${entry.proof.request}`,
                `Expected: ${entry.proof.expectation}`,
                `Observed: ${entry.proof.observed}`,
              ].join('\n'),
            },
            locations: [
              {
                physicalLocation: {
                  artifactLocation: { uri: entry.finding.file },
                  region: { startLine: entry.finding.line },
                },
              },
            ],
          })),
        },
      ],
    },
    null,
    2,
  )
