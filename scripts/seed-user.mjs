import 'dotenv/config'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { createClient } from '@libsql/client'
import { Hash } from '@adonisjs/hash'
import { Scrypt } from '@adonisjs/hash/drivers/scrypt'

const url = process.env.TURSO_URL
const authToken = process.env.TURSO_TOKEN

if (!url || !authToken) {
  console.error('TURSO_URL / TURSO_TOKEN manquants dans .env')
  process.exit(1)
}

const rl = createInterface({ input: stdin, output: stdout })
const email = (await rl.question('Email: ')).trim().toLowerCase()
const name = (await rl.question('Nom affiché: ')).trim()
const password = (await rl.question('Mot de passe (min. 8 caractères): ')).trim()
rl.close()

if (!email || !name || password.length < 8) {
  console.error('Champs invalides.')
  process.exit(1)
}

const hash = new Hash(new Scrypt({}))
const passwordHash = await hash.make(password)

const client = createClient({ url, authToken })

const existing = await client.execute({
  sql: 'SELECT id FROM users WHERE email = ? LIMIT 1',
  args: [email]
})

if (existing.rows.length > 0) {
  await client.execute({
    sql: 'UPDATE users SET name = ?, password_hash = ?, is_active = 1, is_admin = 1, updated_at = CURRENT_TIMESTAMP WHERE email = ?',
    args: [name, passwordHash, email]
  })
  console.log(`Utilisateur ${email} mis à jour.`)
} else {
  await client.execute({
    sql: 'INSERT INTO users (email, name, password_hash, is_admin) VALUES (?, ?, ?, 1)',
    args: [email, name, passwordHash]
  })
  console.log(`Utilisateur ${email} créé.`)
}

process.exit(0)
