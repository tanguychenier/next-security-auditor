import type { AcceptedProof } from '../../domain/policies/accepted-findings.js'

const camel = (name: string): string =>
  name
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('')

export const testFileNameFor = (accepted: AcceptedProof): string =>
  `${camel(accepted.rule)}.${accepted.id}.test.ts`

/**
 * The one thing that outlives the tool.
 *
 * A REPORT IS READ ONCE AND FORGOTTEN. A test committed to the repository runs
 * on every push forever, holds the flaw closed even if this tool is
 * uninstalled, and needs no key, no model and no network.
 *
 * It fails while the flaw is open and passes once it is closed, so a developer
 * works against it the way they work against any other failing test.
 */
export const regressionTestFor = (accepted: AcceptedProof, target = 'http://localhost:3000'): string | undefined => {
  if (accepted.plan === undefined) return undefined

  const plan = accepted.plan
  const refused = plan.reproducesOnStatus.join(', ') || '200'
  const expectation = plan.expectation.replace(/\.$/, '')

  return `import { describe, expect, it } from 'vitest'

/**
 * ${accepted.title}
 *
 * Found in ${accepted.file} and demonstrated by the request below. It fails
 * while the flaw is open and passes once it is closed, and it keeps passing
 * afterwards, which is the point of committing it.
 *
 * Baseline entry: ${accepted.id}
 */
describe('${accepted.rule}', () => {
  it('refuses the request that proved the flaw', async () => {
    const response = await fetch('${target}${plan.path}', { method: '${plan.method}', redirect: 'manual' })

    // The hunt reported this because the application answered ${refused}.
    // A sound one refuses instead: ${expectation}.
    expect([${refused}]).not.toContain(response.status)
  })
})
`
}
