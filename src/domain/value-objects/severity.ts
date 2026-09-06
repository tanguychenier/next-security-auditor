/**
 * Severity ordered by how much a reader should care, worst first.
 *
 * The numeric rank exists so reports can sort without a lookup table living in
 * three adapters at once. It is deliberately not exported as a bare number:
 * callers compare severities, they never do arithmetic on them.
 */
export enum Severity {
  Critical = 'critical',
  High = 'high',
  Medium = 'medium',
  Low = 'low',
}

const RANK: Readonly<Record<Severity, number>> = Object.freeze({
  [Severity.Critical]: 0,
  [Severity.High]: 1,
  [Severity.Medium]: 2,
  [Severity.Low]: 3,
})

export const worstFirst = (left: Severity, right: Severity): number => RANK[left] - RANK[right]
