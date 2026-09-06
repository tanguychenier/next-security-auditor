import { Severity } from './severity.js'

/**
 * The classes of flaw this auditor looks for in a Next.js application.
 *
 * They are named after what the reader has to fix, not after an OWASP code:
 * "missing-authorization" tells a developer where to go, "A01:2021" does not.
 */
export type FindingKind =
  | 'missing-authorization'
  | 'broken-object-level-authorization'
  | 'server-secret-reaching-the-client'
  | 'unvalidated-server-action-input'
  | 'bypassable-middleware'
  | 'ssrf'
  | 'information-disclosure'

export interface FindingShape {
  readonly title: string
  readonly kind: FindingKind
  readonly file: string
  readonly line: number
  readonly severity: Severity
  readonly rationale: string
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
    readonly kind: FindingKind,
    readonly file: string,
    readonly line: number,
    readonly severity: Severity,
    readonly rationale: string,
  ) {}

  static create(shape: FindingShape): Finding {
    if (!Number.isInteger(shape.line) || shape.line < 1) {
      throw new RangeError('a finding points at a real line, numbered from one')
    }
    return new Finding(
      nonEmpty(shape.title, 'title'),
      shape.kind,
      nonEmpty(shape.file, 'file'),
      shape.line,
      shape.severity,
      nonEmpty(shape.rationale, 'rationale'),
    )
  }

  get location(): string {
    return `${this.file}:${this.line}`
  }
}
