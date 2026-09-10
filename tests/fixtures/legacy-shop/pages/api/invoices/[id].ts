import type { NextApiRequest, NextApiResponse } from 'next'
import { findInvoice } from '../../../lib/db'

export default async function handler(request: NextApiRequest, response: NextApiResponse) {
  if (request.method === 'DELETE') {
    return response.status(204).end()
  }
  if (request.method !== 'GET') {
    return response.status(405).end()
  }
  response.status(200).json(findInvoice(String(request.query['id'])))
}
