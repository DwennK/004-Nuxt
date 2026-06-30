import 'dotenv/config'
import { createClient } from '@libsql/client'
import { Hash } from '@adonisjs/hash'
import { Scrypt } from '@adonisjs/hash/drivers/scrypt'

const email = 'test@live.fr'
const password = 'test'
const name = 'Compte test POS'

const url = process.env.TURSO_URL || process.env.NUXT_TURSO_URL
const authToken = process.env.TURSO_TOKEN || process.env.NUXT_TURSO_TOKEN

if (!url || !authToken) {
  console.error('Missing TURSO_URL/TURSO_TOKEN. Check .env before seeding the test POS user.')
  process.exit(1)
}

const hash = new Hash(new Scrypt())
const passwordHash = await hash.make(password)
const now = new Date().toISOString()
const client = createClient({ url, authToken })

try {
  await client.execute({
    sql: `
      INSERT INTO users (email, name, password_hash, is_active, is_admin, created_at, updated_at)
      VALUES (?, ?, ?, 1, 1, ?, ?)
      ON CONFLICT(email) DO UPDATE SET
        name = excluded.name,
        password_hash = excluded.password_hash,
        is_active = 1,
        is_admin = 1,
        updated_at = excluded.updated_at
    `,
    args: [email, name, passwordHash, now, now]
  })

  console.log(`Seeded test POS user: ${email}`)
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`Unable to seed test POS user: ${message}`)
  console.error('Make sure the users table exists by running npm run db:push first.')
  process.exit(1)
}
