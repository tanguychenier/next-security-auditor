/**
 * SOME FLAWS ARE SEEN BY READING, NOT BY ASKING.
 *
 * A key written in the source is not demonstrated by any request: it is
 * demonstrated by the line it sits on. That is still something watched rather
 * than believed, on one condition — the quote is looked for in the file. A
 * model that paraphrases is a model that invents, and accepting a quote we
 * cannot find would put this tool's name on a line nobody wrote.
 */

import { describe, expect, it } from 'vitest'
import { quotedEvidence } from '../../src/domain/policies/quoted-evidence.js'
import { Finding } from '../../src/domain/value-objects/finding.js'
import { ProofOutcome } from '../../src/domain/value-objects/proof.js'
import { Severity } from '../../src/domain/value-objects/severity.js'

const SOURCE = `export const config = {
  stripeKey: 'sk_live_51H9xQz2eZvKYlo2C',
}
`

const finding = (quote?: string): Finding =>
  Finding.create({
    title: 'Stripe key in the source',
    kind: 'hardcoded-secret',
    file: 'app/config.ts',
    line: 2,
    severity: Severity.Critical,
    rationale: 'A live key is committed.',
    ...(quote === undefined ? {} : { quote }),
  })

describe('proving a flaw by the line it sits on', () => {
  it('reproduces when the quoted line is in the file', () => {
    const proof = quotedEvidence(finding("stripeKey: 'sk_live_51H9xQz2eZvKYlo2C',"), SOURCE)

    expect(proof.outcome).toBe(ProofOutcome.Reproduced)
    expect(proof.observed).toContain('sk_live_')
  })

  it('forgives whitespace, because a model reflows what it quotes', () => {
    const proof = quotedEvidence(finding("stripeKey:   'sk_live_51H9xQz2eZvKYlo2C',"), SOURCE)

    expect(proof.outcome).toBe(ProofOutcome.Reproduced)
  })

  it('refuses a quote the file does not contain', () => {
    const proof = quotedEvidence(finding("stripeKey: 'sk_live_INVENTED_BY_THE_MODEL'"), SOURCE)

    expect(proof.outcome).toBe(ProofOutcome.NotReproduced)
    expect(proof.observed).toContain('does not contain')
  })

  it('cannot run without a quote at all', () => {
    expect(quotedEvidence(finding(), SOURCE).outcome).toBe(ProofOutcome.NotRunnable)
  })

  it('refuses a quote so short it matches half the codebase', () => {
    // "key" is in every file. A quote that matches everywhere confirms nothing
    // and would turn the check into a rubber stamp.
    expect(quotedEvidence(finding('key'), SOURCE).outcome).toBe(ProofOutcome.NotRunnable)
  })
})
