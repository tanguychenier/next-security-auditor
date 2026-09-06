import { db } from '@/lib/db'

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const invoice = await db.invoice.findUnique({ where: { id: params.id } })
  return Response.json(invoice)
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  await db.invoice.delete({ where: { id: params.id } })
  return new Response(null, { status: 204 })
}
