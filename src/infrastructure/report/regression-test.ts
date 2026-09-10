import type { AcceptedProof } from '../../domain/policies/accepted-findings.js'

const camel = (name: string): string =>
  name
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('')

/**
 * EVERYTHING BELOW COMES FROM A MODEL, or from a baseline somebody edited by
 * hand in a pull request. It is written into a file the team commits and their
 * CI runs on every push, so it is input, and it is escaped like input.
 */

/** A JavaScript literal, escaped by the one thing that gets it right every time. */
const literal = (value: string): string => JSON.stringify(value)

/** Text with no way out of the comment it sits in. */
const asComment = (text: string): string => text.replace(/\s+/g, ' ').replace(/\*\//g, '* /').trim()

/** A file name that cannot leave the directory it was meant for. */
const asFileNamePart = (value: string, fallback: string): string => {
  const kept = value.replace(/[^A-Za-z0-9-]/g, '')
  return kept.length === 0 ? fallback : kept
}

export const testFileNameFor = (accepted: AcceptedProof): string =>
  `${camel(asFileNamePart(accepted.rule, 'finding'))}.${asFileNamePart(accepted.id, 'unidentified')}.test.ts`

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
  const expectation = plan.expectation.replace(/\.$/, '')

  // THE TEST IS THE MIRROR OF THE PROOF, so it asserts on whatever made the
  // proof reproduce. A leak found by reading the body was answered 200 by a
  // sound application too: asserting on the status alone wrote a test that
  // fails forever, and a team deletes a test that lies to them.
  const marker = plan.reproducesOnBodyContaining
  const onBody = marker !== undefined && marker.length > 0
  const onStatus = plan.reproducesOnStatus.length > 0
  const refused = plan.reproducesOnStatus.join(', ')

  const assertions = [
    ...(onStatus
      ? [
          `    // The hunt reported this because the application answered ${refused}.`,
          `    expect([${refused}]).not.toContain(response.status)`,
        ]
      : []),
    ...(onBody
      ? [
          `    // The hunt reported this because the body carried ${asComment(literal(marker))}.`,
          `    expect(await response.text()).not.toContain(${literal(marker)})`,
        ]
      : []),
  ].join('\n')

  return `import { describe, expect, it } from 'vitest'

/**
 * ${asComment(accepted.title)}
 *
 * Found in ${asComment(accepted.file)} and demonstrated by the request below. It
 * fails while the flaw is open and passes once it is closed, and it keeps
 * passing afterwards, which is the point of committing it.
 *
 * Baseline entry: ${asComment(accepted.id)}
 */
describe(${literal(accepted.rule)}, () => {
  it('refuses the request that proved the flaw', async () => {
    const response = await fetch(${literal(`${target}${plan.path}`)}, { method: ${literal(plan.method)}, redirect: 'manual' })

    // A sound application refuses instead: ${asComment(expectation)}.
${assertions}
  })
})
`
}
