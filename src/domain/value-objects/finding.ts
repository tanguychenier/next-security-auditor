import { Severity } from './severity.js'
import { named, type Rule } from '../rules/rule.js'

/**
 * A FINDING NAMES A RULE, NOT A CASE IN A CLOSED UNION.
 *
 * New classes of flaw are named constantly and the model already knows most of
 * them, so a fixed union would silently drop everything outside it and the
 * report would look clean. What may be reported is the team's decision, made in
 * their config file, not ours.
 */
export type { Rule }

export interface FindingShape {
  readonly title: string
  readonly kind: Rule | string
  readonly file: string
  readonly line: number
  readonly severity: Severity
  readonly rationale: string
  /** The exact line from the file, for a rule proven by reading rather than asking. */
  readonly quote?: string
}

const nonEmpty = (value: string, field: string): string => {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    throw new TypeError(`a finding needs its ${field}: an empty one names nothing`)
  }
  return trimmed
}

/** What the auditor believes it found, before anything has been proven. */
export class Finding {
  private constructor(
    readonly title: string,
    readonly kind: Rule,
    readonly file: string,
    readonly line: number,
    readonly severity: Severity,
    readonly rationale: string,
    readonly quote?: string,
  ) {}

  static create(shape: FindingShape): Finding {
    if (!Number.isInteger(shape.line) || shape.line < 1) {
      throw new RangeError('a finding points at a real line, numbered from one')
    }
    return new Finding(
      nonEmpty(shape.title, 'title'),
      typeof shape.kind === 'string' ? named(shape.kind) : shape.kind,
      nonEmpty(shape.file, 'file'),
      shape.line,
      shape.severity,
      nonEmpty(shape.rationale, 'rationale'),
      shape.quote,
    )
  }

  get location(): string {
    return `${this.file}:${this.line}`
  }
}
