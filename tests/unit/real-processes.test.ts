/**
 * THE SEAMS, AND WHAT SITS BEHIND THEM.
 *
 * Every gateway here takes a runner so a test can assert the exact command
 * without spawning anything, which is what almost every test does. The runner
 * that actually spawns is then the one piece nobody exercises — and it is the
 * one that has to survive a binary that is not installed, a command that fails,
 * and a process that writes to both streams.
 */

import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { spawnRunner } from '../../src/infrastructure/model/claude-subscription-gateway.js'
import { runGit } from '../../src/infrastructure/project/git-changes.js'

describe('running a command for real', () => {
  it('hands back what the process wrote, and what it was given', async () => {
    const result = await spawnRunner(10_000)(
      [process.execPath, '-e', 'process.stdin.on("data", (d) => process.stdout.write(`heard ${d}`))'],
      'the question',
    )

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe('heard the question')
  })

  it('carries what a failing process said on the error stream', async () => {
    const result = await spawnRunner(10_000)(
      [process.execPath, '-e', 'process.stderr.write("not signed in"); process.exit(3)'],
      '',
    )

    expect(result.exitCode).toBe(3)
    expect(result.stderr).toBe('not signed in')
  })

  it('says the binary is missing instead of throwing at the caller', async () => {
    // A TOOL THAT IS NOT INSTALLED IS THE COMMON CASE, not an exceptional one:
    // the subscription gateway is the default, and most machines have no
    // `claude` on the path.
    const result = await spawnRunner(10_000)(['definitely-not-a-binary-8f2a1c', '--print'], '')

    expect(result.exitCode).toBe(127)
    expect(result.stderr).not.toBe('')
  })

  it('refuses an empty command rather than spawning the shell', async () => {
    await expect(spawnRunner(10_000)([], '')).rejects.toThrow('no command to run')
  })
})

describe('asking git for real', () => {
  it('answers from a repository it was pointed at', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'vulnhunt-git-'))
    try {
      await runGit(['-C', workspace, 'init', '--quiet'])
      writeFileSync(join(workspace, 'route.ts'), 'export const GET = () => new Response()')
      await runGit(['-C', workspace, 'add', '.'])

      const staged = await runGit(['-C', workspace, 'diff', '--cached', '--name-only'])

      expect(staged.code).toBe(0)
      expect(staged.stdout).toContain('route.ts')
    } finally {
      rmSync(workspace, { recursive: true, force: true })
    }
  })

  it('reports a refusal instead of pretending nothing changed', async () => {
    // "NO FILES CHANGED" AND "THIS IS NOT A REPOSITORY" ARE DIFFERENT FACTS, and
    // reading the second as the first would hunt nothing and call it a clean run.
    const outside = mkdtempSync(join(tmpdir(), 'vulnhunt-nogit-'))
    try {
      const result = await runGit(['-C', outside, 'rev-parse', 'HEAD'])

      expect(result.code).not.toBe(0)
      expect(result.stderr).not.toBe('')
    } finally {
      rmSync(outside, { recursive: true, force: true })
    }
  })
})
