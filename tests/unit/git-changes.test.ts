/**
 * IT ASKS GIT RATHER THAN GUESSING.
 *
 * A tool that worked out what changed from timestamps or its own cache would
 * eventually be wrong, and being wrong here means silently skipping the file
 * that carries the flaw.
 */

import { describe, expect, it } from 'vitest'
import { changedSince } from '../../src/infrastructure/project/git-changes.js'

describe('asking git what a branch changed', () => {
  it('returns one path per changed file', async () => {
    const run = async () => ({ code: 0, stdout: 'app/api/orders/route.ts\nmiddleware.ts\n', stderr: '' })

    await expect(changedSince('/project', 'main', run)).resolves.toEqual([
      'app/api/orders/route.ts',
      'middleware.ts',
    ])
  })

  it('asks about the range between the reference and here', async () => {
    const seen: string[][] = []
    const run = async (argv: readonly string[]) => {
      seen.push([...argv])
      return { code: 0, stdout: '', stderr: '' }
    }

    await changedSince('/project', 'origin/main', run)

    expect(seen[0]).toEqual(['-C', '/project', 'diff', '--name-only', 'origin/main...HEAD'])
  })

  it('raises when git cannot answer, rather than returning nothing', async () => {
    // AN EMPTY LIST MEANS "HUNT EVERYTHING" upstream. Letting a git failure
    // produce one would turn a broken reference into a silent full-price run.
    const run = async () => ({ code: 128, stdout: '', stderr: "unknown revision 'nope'" })

    await expect(changedSince('/project', 'nope', run)).rejects.toThrow('git could not list what changed')
  })

  it('ignores the blank line git leaves at the end', async () => {
    const run = async () => ({ code: 0, stdout: 'a.ts\n\n\n', stderr: '' })

    await expect(changedSince('/project', 'main', run)).resolves.toEqual(['a.ts'])
  })
})
