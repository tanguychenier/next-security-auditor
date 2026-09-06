import type { Finding } from '../value-objects/finding.js'
import { Proof, ProofOutcome } from '../value-objects/proof.js'

/**
 * Shorter than this, a quote matches half the codebase.
 *
 * "key" is in every file. A quote that matches everywhere confirms nothing and
 * would turn the check into a rubber stamp.
 */
const SHORTEST_MEANINGFUL_QUOTE = 8

/** WHITESPACE IS NOT EVIDENCE: a model reflows what it quotes. */
const flattened = (text: string): string => text.trim().replace(/\s+/g, ' ')

/**
 * Checks a flaw that is seen by reading rather than by asking.
 *
 * A key written in the source is not demonstrated by any request: it is
 * demonstrated by the line it sits on. That is still something watched rather
 * than believed, on one condition — the quote is looked for in the file. A
 * model that paraphrases is a model that invents, and accepting a quote we
 * cannot find would put this tool's name on a line nobody wrote.
 */
export const quotedEvidence = (finding: Finding, source: string): Proof => {
  const request = `read ${finding.location}`
  const expectation = 'the quoted line exists in the file'

  if (finding.quote === undefined) {
    return Proof.create({
      outcome: ProofOutcome.NotRunnable,
      request,
      expectation,
      observed: 'no quote was given, so nothing could be checked',
    })
  }

  const quote = finding.quote.trim()
  if (quote.length < SHORTEST_MEANINGFUL_QUOTE) {
    return Proof.create({
      outcome: ProofOutcome.NotRunnable,
      request,
      expectation,
      observed: `the quote "${quote}" is too short to identify anything`,
    })
  }

  if (!flattened(source).includes(flattened(quote))) {
    return Proof.create({
      outcome: ProofOutcome.NotReproduced,
      request,
      expectation,
      observed: `not found in ${finding.file}: the model quoted something the file does not contain`,
    })
  }

  return Proof.create({ outcome: ProofOutcome.Reproduced, request, expectation, observed: quote })
}
