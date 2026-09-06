import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { readAccepted, writeAccepted, type AcceptedProof } from '../../domain/policies/accepted-findings.js'

/**
 * The file a team commits next to its code.
 *
 * The name is the one they already recognise from their static analyser: a
 * baseline. It says what is known, so a run reports only what is new, which is
 * the only way a non-deterministic tool can guard a merge.
 */
export const DEFAULT_BASELINE = 'vulnerability-hunter-baseline.json'

const pathIn = (projectRoot: string, named?: string): string =>
  named !== undefined && named.length > 0 ? named : join(projectRoot, DEFAULT_BASELINE)

export const readBaseline = (projectRoot: string, named?: string): AcceptedProof[] => {
  const path = pathIn(projectRoot, named)
  return existsSync(path) ? readAccepted(readFileSync(path, 'utf8')) : []
}

export const writeBaseline = (
  projectRoot: string,
  named: string | undefined,
  entries: readonly AcceptedProof[],
): string => {
  const path = pathIn(projectRoot, named)
  writeFileSync(path, writeAccepted(entries), 'utf8')
  return path
}

/**
 * A CACHE IS AN OPTIMISATION, and so is a directory: failing the whole run
 * because one could not be created would trade a real answer for a disk problem.
 */
export const ensureDirectory = (path: string): boolean => {
  try {
    if (!existsSync(path)) mkdirSync(path, { recursive: true })
    return true
  } catch {
    return false
  }
}
