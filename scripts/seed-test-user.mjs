import 'dotenv/config'
import { Hash } from '@adonisjs/hash'
import { Scrypt } from '@adonisjs/hash/drivers/scrypt'
import { createDatabaseClient } from './db/_shared.mjs'
import { readSeedTarget } from './seed-target.mjs'

const email = 'test@live.fr'
const password = 'test'
const name = 'Compte test POS'

// Preserve the runtime-config aliases supported by this development command.
if (!process.env.TURSO_URL && process.env.NUXT_TURSO_URL) {
  process.env.TURSO_URL = process.env.NUXT_TURSO_URL
}
if (!process.env.TURSO_TOKEN && process.env.NUXT_TURSO_TOKEN) {
  process.env.TURSO_TOKEN = process.env.NUXT_TURSO_TOKEN
}

const target = readSeedTarget({ testOnly: true })
const hash = new Hash(new Scrypt())
const passwordHash = await hash.make(password)
const now = new Date().toISOString()
const client = createDatabaseClient(target)

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
