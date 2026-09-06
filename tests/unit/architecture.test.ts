/**
 * The dependency rule, enforced rather than documented.
 *
 * Every project claims to be hexagonal in its README. The claim survives about
 * three months, until someone imports a fetch client into a value object
 * because it was the shortest path that afternoon. This test is what makes the
 * claim true a year from now.
 *
 * It reads the source rather than trusting a linter config, so it keeps working
 * when the tooling is replaced.
 */

import { describe, expect, it } from 'vitest'
import { readdir, readFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const src = fileURLToPath(new URL('../../src', import.meta.url))

const sourceFiles = async (directory: string): Promise<string[]> => {
  const found: string[] = []
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const full = join(directory, item.name)
    if (item.isDirectory()) found.push(...(await sourceFiles(full)))
    else if (item.name.endsWith('.ts')) found.push(full)
  }
  return found
}

const importsOf = async (file: string): Promise<string[]> => {
  const source = await readFile(file, 'utf8')
  return [...source.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1] ?? '')
}

const under = (file: string, layer: string): boolean =>
  relative(src, file).split(sep)[0] === layer

describe('the dependency rule', () => {
  it('keeps the domain free of any framework, transport or vendor', async () => {
    const offences: string[] = []
    for (const file of await sourceFiles(join(src, 'domain'))) {
      for (const specifier of await importsOf(file)) {
        const outward =
          specifier.includes('application/') ||
          specifier.includes('infrastructure/') ||
          specifier.includes('cli/') ||
          !specifier.startsWith('.')
        if (outward) offences.push(`${relative(src, file)} imports ${specifier}`)
      }
    }

    expect(offences).toEqual([])
  })

  it('keeps the application layer away from every concrete adapter', async () => {
    const offences: string[] = []
    for (const file of await sourceFiles(join(src, 'application'))) {
      for (const specifier of await importsOf(file)) {
        if (specifier.includes('infrastructure/') || specifier.includes('cli/')) {
          offences.push(`${relative(src, file)} imports ${specifier}`)
        }
      }
    }

    expect(offences).toEqual([])
  })

  it('lets no adapter import another adapter', async () => {
    // ADAPTERS ARE SIBLINGS, NOT A CHAIN. The day the SARIF writer imports the
    // Anthropic client, swapping either one stops being a local change.
    const offences: string[] = []
    for (const file of await sourceFiles(join(src, 'infrastructure'))) {
      const family = relative(src, file).split(sep)[1]
      for (const specifier of await importsOf(file)) {
        if (!specifier.startsWith('.')) continue
        const resolved = join(file, '..', specifier)
        if (under(resolved, 'infrastructure') && relative(src, resolved).split(sep)[1] !== family) {
          offences.push(`${relative(src, file)} imports ${specifier}`)
        }
      }
    }

    expect(offences).toEqual([])
  })

  it('is the only place that wires the concrete pieces together', async () => {
    // Exactly one composition root. Two would mean two different applications.
    const wiring: string[] = []
    for (const file of await sourceFiles(src)) {
      const specifiers = await importsOf(file)
      if (specifiers.some((specifier) => specifier.includes('infrastructure/'))) {
        wiring.push(relative(src, file))
      }
    }

    expect(wiring).toEqual(['cli/main.ts'])
  })
})
