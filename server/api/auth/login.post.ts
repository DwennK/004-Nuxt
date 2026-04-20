import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { users } from '~~/server/db/schema'
import { useDb } from '~~/server/utils/turso'

const bodySchema = z.object({
  email: z.string().email().transform(v => v.trim().toLowerCase()),
  password: z.string().min(1)
})

export default eventHandler(async (event) => {
  const { email, password } = await readValidatedBody(event, bodySchema.parse)
  const db = useDb()

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1)

  const valid = user && user.isActive
    ? await verifyPassword(user.passwordHash, password)
    : false

  if (!valid || !user) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Identifiants invalides'
    })
  }

  await setUserSession(event, {
    user: {
      id: user.id,
      email: user.email,
      name: user.name
    }
  })

  return { ok: true }
})
