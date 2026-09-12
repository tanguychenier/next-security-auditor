import { execFile } from 'node:child_process'

/** What running a command produced, so a test can answer without a git repository. */
export interface CommandResult {
  readonly code: number
  readonly stdout: string
  readonly stderr: string
}

export type GitRunner = (argv: readonly string[]) => Promise<CommandResult>

export const runGit: GitRunner = async (argv) =>
  new Promise((resolve) => {
    execFile('git', [...argv], { timeout: 30_000 }, (error, stdout, stderr) =>
      resolve({
        code: error === null ? 0 : ((error as NodeJS.ErrnoException & { code?: number }).code ?? 1),
        stdout,
        stderr,
      }),
    )
  })

/**
 * Which files a branch changed, according to git.
 *
 * IT ASKS GIT RATHER THAN GUESSING. A tool that worked out what changed from
 * timestamps or from its own cache would eventually be wrong, and being wrong
 * here means silently skipping the file that carries the flaw.
 *
 * A failure is raised, never returned as an empty list: upstream an empty list
 * means "hunt everything", so a broken reference would become a silent
 * full-price run instead of an error somebody can fix.
 */
export const changedSince = async (
  projectRoot: string,
  reference: string,
  run: GitRunner = runGit,
): Promise<string[]> => {
  const result = await run(['-C', projectRoot, 'diff', '--name-only', `${reference}...HEAD`])

  if (result.code !== 0) {
    throw new Error(
      `git could not list what changed since ${reference}: ${result.stderr.trim() || 'no output'}`,
    )
  }

  return result.stdout
    .split(/\r?\n/)
    .map((path) => path.trim())
    .filter((path) => path !== '')
}
