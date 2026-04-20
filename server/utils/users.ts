import { desc, eq } from 'drizzle-orm'
import { users } from '~~/server/db/schema'
import type { UserRecord } from '~~/shared/types/users'
import { useDb } from './turso'

const userColumns = {
  id: users.id,
  email: users.email,
  name: users.name,
  isActive: users.isActive,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt
}

export async function listUsers(): Promise<UserRecord[]> {
  const db = useDb()
  return db.select(userColumns).from(users).orderBy(desc(users.createdAt))
}

export async function getUserById(id: number): Promise<UserRecord | null> {
  const db = useDb()
  const [row] = await db.select(userColumns).from(users).where(eq(users.id, id)).limit(1)
  return row || null
}

export async function findUserByEmail(email: string): Promise<{ id: number } | null> {
  const db = useDb()
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
  return row || null
}
