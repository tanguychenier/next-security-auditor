import type { Finding } from '../value-objects/finding.js'

/** Short enough to read in a report, long enough not to collide. */
const LENGTH = 16

/**
 * The symbol the flaw sits in, or the line itself when there is none.
 *
 * THE NEAREST FUNCTION IN EITHER DIRECTION. A line inside a handler is nearer
 * to its own signature above; a line on a decorator or an export statement is
 * nearer to the one below. Taking the nearer one says what a human would say in
 * both cases, and measured on a live run of the sibling tool, looking only
 * backwards made the same flaw change identity between hunts.
 */
const anchorIn = (source: string, line: number): string => {
  const lines = source.split(/\r?\n/)
  const from = Math.min(line, lines.length) - 1
  // ANCHORED AT COLUMN ZERO on purpose: a route handler is declared at module
  // level, while `const invoice = ...` inside a body is a local variable that
  // would otherwise shadow the function the flaw actually sits in.
  const declaration = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)/

  const nearest = (step: number): { name: string; distance: number } | undefined => {
    for (let at = from; at >= 0 && at < lines.length; at += step) {
      const found = declaration.exec(lines[at] ?? '')
      if (found?.[1] !== undefined) return { name: found[1], distance: Math.abs(at - from) }
    }
    return undefined
  }

  const above = nearest(-1)
  const below = nearest(1)
  const chosen = above === undefined ? below : below === undefined ? above : below.distance < above.distance ? below : above

  if (chosen !== undefined) return `symbol:${chosen.name}`
  return `line:${(lines[line - 1] ?? '').replace(/\s+/g, '')}`
}

/**
 * What makes a finding the same finding as last week.
 *
 * A TEAM CANNOT ACCEPT A FINDING ONCE UNLESS IT STAYS RECOGNISABLE. Keyed on
 * the line number an identity expires the first time somebody adds an import;
 * keyed on the title it expires whenever the model rephrases itself. Either way
 * the accepted list becomes noise, gets deleted, and with it the only way to
 * gate a pull request on a non-deterministic tool.
 */
export const identityOf = async (finding: Finding, source: string): Promise<string> => {
  const { createHash } = await import('node:crypto')
  return createHash('sha256')
    .update([finding.kind.id, finding.file, anchorIn(source, finding.line)].join('|'))
    .digest('hex')
    .slice(0, LENGTH)
}
