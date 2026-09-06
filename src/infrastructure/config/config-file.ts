import { pathToFileURL } from 'node:url'
import { access } from 'node:fs/promises'
import { join } from 'node:path'
import type { RuleSelection } from '../../domain/rules/rule.js'

const NAMES = ['vulnerability-hunter.config.mjs', 'vulnerability-hunter.config.js', 'vulnhunt.config.mjs', 'vulnhunt.config.js']

const exists = async (path: string): Promise<boolean> => {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/**
 * Reads the selection a project declares at its root.
 *
 * IT IMPORTS THE TEAM CONFIG FILE, NEVER THE AUDITED APPLICATION. The
 * distinction matters: the application is the thing suspected of being
 * vulnerable and is only ever read, while this file is one the team wrote for
 * this tool, the way their linter and their bundler read theirs.
 *
 * A CONFIG SILENTLY IGNORED IS THE WORST OUTCOME: the team believes it narrowed
 * the hunt and pays for the whole catalogue every night without being told.
 */
export const readConfigFile = async (projectRoot: string): Promise<RuleSelection> => {
  for (const name of NAMES) {
    const path = join(projectRoot, name)
    if (!(await exists(path))) continue

    const imported = (await import(pathToFileURL(path).href)) as { default?: unknown }
    const selection = imported.default
    if (typeof selection !== 'object' || selection === null || Array.isArray(selection)) {
      throw new TypeError(`${name} must export a rule selection by default, got ${typeof selection}`)
    }
    return selection as RuleSelection
  }

  return {}
}
