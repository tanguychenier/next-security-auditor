/**
 * A FINDING MUST BE RECOGNISABLE ACROSS RUNS, OR IT CANNOT BE ACCEPTED ONCE.
 *
 * Identity is what lets a team say "we know about this one" and have that still
 * mean something next week.
 */

import { describe, expect, it } from 'vitest'
import { identityOf } from '../../src/domain/policies/identity.js'
import { Finding } from '../../src/domain/value-objects/finding.js'
import { Severity } from '../../src/domain/value-objects/severity.js'

const SOURCE = `import { db } from '@/lib/db'

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const invoice = await db.invoice.findUnique({ where: { id: params.id } })
  return Response.json(invoice)
}
`

const finding = (line: number, title = 'Invoice readable without a session'): Finding =>
  Finding.create({
    title,
    kind: 'broken-object-level-authorization',
    file: 'app/api/invoices/[id]/route.ts',
    line,
    severity: Severity.High,
    rationale: 'params.id reaches the database with no ownership check.',
  })

describe('recognising the same finding next week', () => {
  it('survives a file growing above it', async () => {
    const shifted = `import { auth } from '@/lib/auth'\nimport { log } from '@/lib/log'\n${SOURCE}`

    expect(await identityOf(finding(4), SOURCE)).toBe(await identityOf(finding(6), shifted))
  })

  it('does not move with the wording the model chose', async () => {
    expect(await identityOf(finding(4), SOURCE)).toBe(
      await identityOf(finding(4, 'No authorization check on the invoice route'), SOURCE),
    )
  })

  it('attaches a flaw pointed at the export line to the handler below', async () => {
    expect(await identityOf(finding(3), SOURCE)).toBe(await identityOf(finding(5), SOURCE))
  })

  it('still identifies something outside any function', async () => {
    const config = 'module.exports = {\n  images: { domains: ["*"] },\n}\n'

    expect(await identityOf(finding(2), config)).toMatch(/^[0-9a-f]{16}$/)
  })

  it('reads as something a human can compare', async () => {
    expect(await identityOf(finding(4), SOURCE)).toMatch(/^[0-9a-f]{16}$/)
  })
})
