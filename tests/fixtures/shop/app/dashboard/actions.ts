'use server'

import { db } from '@/lib/db'

export async function updateEmail(userId: string, email: string) {
  await db.user.update({ where: { id: userId }, data: { email } })
}

async function notUsedOutside() {
  return 1
}
