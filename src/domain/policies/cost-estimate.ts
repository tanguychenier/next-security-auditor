import type { SurfaceEntry } from '../value-objects/surface-entry.js'

export interface Pricing {
  readonly inputPerMillion: number
  readonly outputPerMillion: number
}

export interface SurfaceSource {
  readonly entry: SurfaceEntry
  readonly characters: number
}

export interface CostEstimate {
  readonly inputTokens: number
  readonly outputTokens: number
  readonly passes: number
  readonly euros: number
}

/**
 * Four characters per token is the usual rule of thumb for English source; code
 * with long identifiers runs denser, so this UNDER-counts characters per token
 * and therefore OVER-counts tokens. That direction is the one we want.
 */
const CHARACTERS_PER_TOKEN = 3.5

/** Instructions and schema sent alongside each chunk, measured on real runs. */
const PROMPT_OVERHEAD_TOKENS = 1_400

/** A finding plus its proof plan. Generous on purpose. */
const OUTPUT_TOKENS_PER_PASS = 900

/**
 * Estimates an audit without calling anything.
 *
 * Two passes per surface entry: one to look for flaws, one to turn a suspected
 * flaw into a proof that runs. Both are billed, so both are counted.
 */
export const estimateAudit = (sources: readonly SurfaceSource[], pricing: Pricing): CostEstimate => {
  if (sources.length === 0) {
    return { inputTokens: 0, outputTokens: 0, passes: 0, euros: 0 }
  }
  const passes = sources.length * 2
  const inputTokens = sources.reduce(
    (total, source) => total + Math.ceil(source.characters / CHARACTERS_PER_TOKEN) + PROMPT_OVERHEAD_TOKENS,
    0,
  ) * 2
  const outputTokens = passes * OUTPUT_TOKENS_PER_PASS
  const raw =
    (inputTokens / 1_000_000) * pricing.inputPerMillion +
    (outputTokens / 1_000_000) * pricing.outputPerMillion
  return { inputTokens, outputTokens, passes, euros: Math.ceil(raw * 100) / 100 }
}
