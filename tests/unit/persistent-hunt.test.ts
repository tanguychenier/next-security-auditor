/**
 * THE SAME CODE DOES NOT ALWAYS GIVE THE SAME ANSWER.
 *
 * Measured on a live run of the sibling tool: one pass over a handler with no
 * authorization check reported a clean file, and the next reported two flaws. A
 * single pass is a coin toss on recall, and a tool that misses the flaw it
 * exists to find is worse than no tool.
 *
 * Passing again is the only honest fix, and it is affordable precisely because
 * the hunt runs on a subscription rather than on a metered key.
 */

import { describe, expect, it } from 'vitest'
import { PersistentHunt } from '../../src/application/use-cases/persistent-hunt.js'
import type { VulnerabilityFinder } from '../../src/application/ports/vulnerability-finder.js'
import { Finding } from '../../src/domain/value-objects/finding.js'
import { Severity } from '../../src/domain/value-objects/severity.js'
import type { SurfaceEntry } from '../../src/domain/value-objects/surface-entry.js'

const entry: SurfaceEntry = { kind: 'route-handler', file: 'app/api/invoices/[id]/route.ts', reachableAs: '/api/invoices/1' }

const finding = (kind: string, line: number): Finding =>
  Finding.create({
    title: 'Something reachable without a check',
    kind,
    file: 'app/api/invoices/[id]/route.ts',
    line,
    severity: Severity.High,
    rationale: 'The handler never checks who is calling.',
  })

/** Answers a written script, one entry per pass, so a run is reproducible. */
class ScriptedFinder implements VulnerabilityFinder {
  passes = 0

  constructor(private readonly script: readonly Finding[][]) {}

  async suspect(): Promise<Finding[]> {
    const answer = this.script[this.passes] ?? []
    this.passes += 1
    return [...answer]
  }

  async suspectAll(entriesWithSource: readonly unknown[]): Promise<Finding[][]> {
    const perEntry: Finding[][] = []
    for (let index = 0; index < entriesWithSource.length; index += 1) perEntry.push(await this.suspect())
    return perEntry
  }

  async planProof(): Promise<undefined> {
    return undefined
  }
}

describe('passing again until nothing new comes back', () => {
  it('passes again when the first pass found nothing', async () => {
    const scripted = new ScriptedFinder([[], [finding('missing-authorization', 14)]])

    const found = await new PersistentHunt(scripted, 4, 2).suspect(entry, 'source')

    // A SINGLE PASS WOULD HAVE REPORTED A CLEAN FILE.
    expect(found).toHaveLength(1)
    expect(scripted.passes).toBeGreaterThanOrEqual(2)
  })

  it('stops once two passes in a row bring nothing new', async () => {
    const scripted = new ScriptedFinder([[], [], []])

    await new PersistentHunt(scripted, 8, 2).suspect(entry, 'source')

    expect(scripted.passes).toBe(2)
  })

  it('keeps passing while each pass still brings something new', async () => {
    const scripted = new ScriptedFinder([[finding('missing-authorization', 14)], [finding('ssrf', 40)], [], []])

    const found = await new PersistentHunt(scripted, 8, 2).suspect(entry, 'source')

    expect(found).toHaveLength(2)
    expect(scripted.passes).toBe(4)
  })

  it('reads the same flaw one line apart as one finding', async () => {
    // MEASURED ON A LIVE RUN: two passes named the same missing ownership check
    // at lines 16 and 17. A strict line key turned one flaw into two entries.
    const scripted = new ScriptedFinder([
      [finding('broken-object-level-authorization', 16)],
      [finding('broken-object-level-authorization', 17)],
      [],
      [],
    ])

    const found = await new PersistentHunt(scripted, 8, 2).suspect(entry, 'source')

    expect(found).toHaveLength(1)
    expect(found[0]?.line).toBe(16)
  })

  it('keeps two distinct flaws of the same kind far apart', async () => {
    // TWO HANDLERS IN ONE FILE CAN BOTH LACK A CHECK, and merging them would
    // hide one of the two holes.
    const scripted = new ScriptedFinder([
      [finding('missing-authorization', 14), finding('missing-authorization', 120)],
      [],
      [],
    ])

    expect(await new PersistentHunt(scripted, 8, 2).suspect(entry, 'source')).toHaveLength(2)
  })

  it('never exceeds the passes it was allowed', async () => {
    const scripted = new ScriptedFinder(Array.from({ length: 20 }, () => [finding('ssrf', 1)]))

    await new PersistentHunt(scripted, 3, 2).suspect(entry, 'source')

    expect(scripted.passes).toBe(3)
  })

  it('passes once when somebody is paying per token', async () => {
    const scripted = new ScriptedFinder([[], [finding('ssrf', 1)]])

    expect(await new PersistentHunt(scripted, 1, 2).suspect(entry, 'source')).toEqual([])
    expect(scripted.passes).toBe(1)
  })
})
