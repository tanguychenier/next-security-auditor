import type { AuditedFinding } from '../../domain/policies/reportable-findings.js'
import { Severity } from '../../domain/value-objects/severity.js'

/** The subset of SARIF 2.1.0 that GitHub reads. Nothing more is emitted. */
export interface SarifLog {
  readonly $schema: string
  readonly version: '2.1.0'
  readonly runs: readonly SarifRun[]
}

interface SarifRun {
  readonly tool: { readonly driver: { readonly name: string; readonly version: string; readonly informationUri: string } }
  readonly results: readonly SarifResult[]
}

interface SarifResult {
  readonly ruleId: string
  readonly level: 'error' | 'warning' | 'note'
  readonly message: { readonly text: string }
  readonly locations: readonly {
    readonly physicalLocation: {
      readonly artifactLocation: { readonly uri: string }
      readonly region: { readonly startLine: number }
    }
  }[]
}

/**
 * SARIF has three levels and we have four severities, so the mapping is lossy
 * by design. Critical and High both land on `error` because both must fail a
 * pull request; splitting them would need a level GitHub does not render.
 */
const LEVELS: Readonly<Record<Severity, SarifResult['level']>> = Object.freeze({
  [Severity.Critical]: 'error',
  [Severity.High]: 'error',
  [Severity.Medium]: 'warning',
  [Severity.Low]: 'note',
})

export const toSarif = (audited: readonly AuditedFinding[], version: string): SarifLog => ({
  $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
  version: '2.1.0',
  runs: [
    {
      tool: {
        driver: {
          name: 'vulnerability-hunter-next',
          version,
          informationUri: 'https://github.com/tanguychenier/vulnerability-hunter-next',
        },
      },
      results: audited.map(({ finding, proof }) => ({
        ruleId: finding.kind.id,
        level: LEVELS[finding.severity],
        message: {
          // THE PROOF TRAVELS WITH THE FINDING. A reviewer reading this in a pull
          // request can paste the request into a terminal and see it for himself,
          // which is the whole point of the tool.
          text: [
            finding.title,
            '',
            finding.rationale,
            '',
            `Proof : sent: ${proof.request}`,
            `Expected: ${proof.expectation}`,
            `Observed: ${proof.observed}`,
          ].join('\n'),
        },
        locations: [
          {
            physicalLocation: {
              artifactLocation: { uri: finding.file },
              region: { startLine: finding.line },
            },
          },
        ],
      })),
    },
  ],
})
