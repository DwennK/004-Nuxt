import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { users } from '~~/server/db/schema'
import { useDb } from '~~/server/utils/turso'
import {
  assertLoginAllowed,
  clearLoginThrottle,
  loginThrottleKey,
  registerLoginFailure
} from '~~/server/utils/auth/login-throttle'
import { verifyLoginTurnstile } from '~~/server/utils/auth/turnstile'

const bodySchema = z.object({
  email: z.string().email().transform(v => v.trim().toLowerCase()),
  password: z.string().min(1),
  companyWebsite: z.string().max(200).default(''),
  turnstileToken: z.string().min(1).max(2048)
})

// Hash scrypt factice vérifié quand l'utilisateur est introuvable/inactif,
// afin que le temps de réponse ne révèle pas l'existence d'un compte.
let dummyHashPromise: Promise<string> | null = null
function getDummyHash() {
  if (!dummyHashPromise) {
    dummyHashPromise = hashPassword('login-timing-equalizer-placeholder')
  }

  return dummyHashPromise
}

export default eventHandler(async (event) => {
  const { email, password, companyWebsite, turnstileToken } = await readValidatedBody(event, bodySchema.parse)
  const throttleKey = loginThrottleKey(event, email)

  await assertLoginAllowed(event, throttleKey)

  if (companyWebsite) {
    await registerLoginFailure(throttleKey)
    throw createError({
      statusCode: 401,
      statusMessage: 'Identifiants invalides'
    })
  }

  await verifyLoginTurnstile(event, turnstileToken)

  const db = useDb()

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1)

  const hashToVerify = user && user.isActive ? user.passwordHash : await getDummyHash()
  const passwordMatches = await verifyPassword(hashToVerify, password)
  const valid = Boolean(user) && Boolean(user?.isActive) && passwordMatches

  if (!valid || !user) {
    await registerLoginFailure(throttleKey)
    throw createError({
      statusCode: 401,
      statusMessage: 'Identifiants invalides'
    })
  }

  await clearLoginThrottle(throttleKey)

  await setUserSession(event, {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      isAdmin: user.isAdmin
    }
  })

  return { ok: true }
})
