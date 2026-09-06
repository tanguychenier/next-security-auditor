/**
 * The adapter is where a model's sloppiness meets a typed domain.
 *
 * Everything here is about refusing input rather than repairing it. A repaired
 * finding is one nobody wrote and nobody can defend, and it would reach a
 * reader wearing the same confidence as a real one.
 */

import { describe, expect, it } from 'vitest'
import { AnthropicVulnerabilityFinder } from '../../src/infrastructure/llm/anthropic-vulnerability-finder.js'
import { Finding } from '../../src/domain/value-objects/finding.js'
import { Severity } from '../../src/domain/value-objects/severity.js'
import type { SurfaceEntry } from '../../src/domain/value-objects/surface-entry.js'

const entry: SurfaceEntry = {
  kind: 'route-handler',
  file: 'app/api/invoices/[id]/route.ts',
  reachableAs: '/api/invoices/[id]',
  methods: ['GET'],
}

const answering = (text: string): typeof fetch =>
  (async () =>
    new Response(JSON.stringify({ content: [{ type: 'text', text }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch

const auditor = (text: string) =>
  new AnthropicVulnerabilityFinder({ apiKey: 'test', fetchImpl: answering(text) })

const finding = Finding.create({
  title: 'Invoice readable without a session',
  kind: 'broken-object-level-authorization',
  file: entry.file,
  line: 4,
  severity: Severity.High,
  rationale: 'params.id reaches the database with no ownership check.',
})

describe('reading what the model answered', () => {
  it('parses a finding wrapped in prose and a code fence', async () => {
    const found = await auditor(
      'Here is what I found:\n```json\n[{"title":"Invoice readable without a session",' +
        '"kind":"broken-object-level-authorization","line":4,"severity":"high",' +
        '"rationale":"params.id reaches the database with no ownership check."}]\n```\nHope that helps.',
    ).suspect(entry, 'source')

    expect(found).toHaveLength(1)
    expect(found[0]?.severity).toBe(Severity.High)
    expect(found[0]?.file).toBe('app/api/invoices/[id]/route.ts')
  })

  it('drops a finding whose severity is not one the domain knows', async () => {
    const found = await auditor('[{"title":"x","kind":"ssrf","line":2,"severity":"spicy","rationale":"y"}]')
      .suspect(entry, 'source')

    expect(found).toEqual([])
  })

  it('drops a finding whose kind was invented', async () => {
    const found = await auditor('[{"title":"x","kind":"vibes","line":2,"severity":"high","rationale":"y"}]')
      .suspect(entry, 'source')

    expect(found).toEqual([])
  })

  it('reports nothing when the model answers with prose only', async () => {
    const found = await auditor('This handler looks fine to me.').suspect(entry, 'source')

    expect(found).toEqual([])
  })

  it('refuses a proof plan that recognises nothing', async () => {
    // WITHOUT A STATUS OR A MARKER the plan can never fail, so every route
    // would come back "vulnerable". That is worse than no tool at all.
    const plan = await auditor('{"method":"GET","path":"/api/invoices/1","expectation":"401"}')
      .planProof(finding, entry, 'source')

    expect(plan).toBeUndefined()
  })

  it('accepts a plan that recognises the flaw by a body marker alone', async () => {
    const plan = await auditor(
      '{"method":"GET","path":"/","expectation":"no secret in the page",' +
        '"reproducesOnStatus":[],"reproducesOnBodyContaining":"sk_live_"}',
    ).planProof(finding, entry, 'source')

    expect(plan?.reproducesOnBodyContaining).toBe('sk_live_')
    expect(plan?.method).toBe('GET')
  })

  it('surfaces an API error instead of pretending the code is clean', async () => {
    const failing = new AnthropicVulnerabilityFinder({
      apiKey: 'test',
      fetchImpl: (async () => new Response('over quota', { status: 429 })) as unknown as typeof fetch,
    })

    await expect(failing.suspect(entry, 'source')).rejects.toThrow('429')
  })
})
