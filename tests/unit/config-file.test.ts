/**
 * THE FILE A TEAM PUTS AT THE ROOT OF ITS PROJECT.
 *
 * It is read before the first model call, so what a team removes it never pays
 * for. It is also the only place a rule nobody shipped can be added, which is
 * what keeps the catalogue from ageing between releases.
 */

import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { readConfigFile } from '../../src/infrastructure/config/config-file.js'
import { selectedRules } from '../../src/domain/rules/rule.js'

const fixture = (name: string): string => fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url))

describe('reading the project config', () => {
  it('hunts everything when there is no file at the root', async () => {
    expect(selectedRules(await readConfigFile(fixture('shop'))).length).toBeGreaterThan(30)
  })

  it('keeps only what the file asks for', async () => {
    const selected = selectedRules(await readConfigFile(fixture('config/only')))

    expect(selected.map((entry) => entry.id).sort()).toEqual(['missing-authorization', 'ssrf'])
  })

  it('mutes a rule and adds one nobody shipped', async () => {
    const selected = selectedRules(await readConfigFile(fixture('config/tailored')))
    const ids = selected.map((entry) => entry.id)

    expect(ids).not.toContain('missing-rate-limiting')
    expect(ids).toContain('prompt-injection')
    expect(ids).toContain('missing-authorization')
  })

  it('says so when the file exports something else, instead of hunting everything in silence', async () => {
    // A CONFIG SILENTLY IGNORED IS THE WORST OUTCOME: the team believes it
    // narrowed the hunt and pays for the whole catalogue every night.
    await expect(readConfigFile(fixture('config/broken'))).rejects.toThrow('must export')
  })
})
