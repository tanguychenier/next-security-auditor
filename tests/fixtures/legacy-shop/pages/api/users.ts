import type { NextApiRequest, NextApiResponse } from 'next'
import { allUsers } from '../../lib/db'

export default function handler(request: NextApiRequest, response: NextApiResponse) {
  response.status(200).json({ users: allUsers() })
}
