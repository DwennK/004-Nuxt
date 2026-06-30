import { users } from '~~/server/db/schema'
import { requireAdminSessionUser } from '~~/server/utils/auth/session'
import { findUserByEmail, getUserById } from '~~/server/utils/users'
import { useDb } from '~~/server/utils/turso'
import { createUserSchema } from '~~/shared/validation/users'

export default eventHandler(async (event) => {
  await requireAdminSessionUser(event)
  const body = await readValidatedBody(event, createUserSchema.parse)

  const existing = await findUserByEmail(body.email)
  if (existing) {
    throw createError({
      statusCode: 409,
      message: 'Un compte existe déjà avec cet email'
    })
  }

  const passwordHash = await hashPassword(body.password)
  const db = useDb()

  const [inserted] = await db
    .insert(users)
    .values({
      email: body.email,
      name: body.name,
      passwordHash,
      isAdmin: body.isAdmin
    })
    .returning({ id: users.id })

  if (!inserted) {
    throw createError({ statusCode: 500, message: 'Création impossible' })
  }

  const created = await getUserById(inserted.id)
  if (!created) {
    throw createError({ statusCode: 500, message: 'Compte introuvable après création' })
  }
  return created
})
