/**
 * WHAT MAKES THIS A NEXT.JS TOOL RATHER THAN A GENERIC ONE.
 *
 * Generic LLM auditors hand the model a pile of files and hope. The App Router
 * has a small, knowable set of places where untrusted input enters the server:
 * route handlers, Server Actions, middleware, and the searchParams a page
 * receives. Everything else is unreachable from the outside.
 *
 * Mapping that surface first is what keeps the audit cheap and focused: the
 * model reads the eight files that can be attacked, not the eight hundred that
 * cannot.
 */

import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { NextProjectReader } from '../../src/infrastructure/project/next-project-reader.js'

const shop = fileURLToPath(new URL('../fixtures/shop', import.meta.url))

describe('mapping the attack surface of a Next.js application', () => {
  it('finds route handlers and the HTTP methods they expose', async () => {
    const surface = await new NextProjectReader(shop).attackSurface()
    const handler = surface.find((entry) => entry.kind === 'route-handler')

    expect(handler?.file).toBe('app/api/invoices/[id]/route.ts')
    expect(handler?.methods).toEqual(['DELETE', 'GET'])
    // THE URL IS WHAT A READER ATTACKS, not the file path.
    expect(handler?.reachableAs).toBe('/api/invoices/[id]')
  })

  it('finds Server Actions and lists only the exported ones', async () => {
    const surface = await new NextProjectReader(shop).attackSurface()
    const action = surface.find((entry) => entry.kind === 'server-action')

    expect(action?.file).toBe('app/dashboard/actions.ts')
    // A NON-EXPORTED FUNCTION IS NOT AN ENDPOINT: Next.js only exposes exports.
    expect(action?.exports).toEqual(['updateEmail'])
  })

  it('finds the middleware and the paths it claims to guard', async () => {
    const surface = await new NextProjectReader(shop).attackSurface()
    const middleware = surface.find((entry) => entry.kind === 'middleware')

    expect(middleware?.file).toBe('middleware.ts')
    expect(middleware?.matcher).toEqual(['/dashboard/:path*'])
  })

  it('finds pages that read searchParams, and ignores those that do not', async () => {
    const surface = await new NextProjectReader(shop).attackSurface()
    const pages = surface.filter((entry) => entry.kind === 'page')

    expect(pages.map((page) => page.file)).toEqual(['app/dashboard/page.tsx'])
    expect(pages[0]?.reachableAs).toBe('/dashboard')
  })

  it('reports nothing for a directory that is not a Next.js application', async () => {
    const surface = await new NextProjectReader(fileURLToPath(new URL('.', import.meta.url))).attackSurface()

    expect(surface).toEqual([])
  })
})
