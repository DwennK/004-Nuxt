import type { User, UserStatus } from '~/types'
import { useTursoClient } from './turso'

type CustomerRow = {
  id: number | string
  name: string
  email: string
  status: UserStatus
  location: string | null
  avatar_src: string | null
}

const seedCustomers: User[] = [{
  id: 1,
  name: 'Alex Smith',
  email: 'alex.smith@example.com',
  avatar: {
    src: 'https://i.pravatar.cc/128?u=1'
  },
  status: 'subscribed',
  location: 'New York, USA'
}, {
  id: 2,
  name: 'Jordan Brown',
  email: 'jordan.brown@example.com',
  avatar: {
    src: 'https://i.pravatar.cc/128?u=2'
  },
  status: 'unsubscribed',
  location: 'London, UK'
}, {
  id: 3,
  name: 'Taylor Green',
  email: 'taylor.green@example.com',
  avatar: {
    src: 'https://i.pravatar.cc/128?u=3'
  },
  status: 'bounced',
  location: 'Paris, France'
}, {
  id: 4,
  name: 'Morgan White',
  email: 'morgan.white@example.com',
  avatar: {
    src: 'https://i.pravatar.cc/128?u=4'
  },
  status: 'subscribed',
  location: 'Berlin, Germany'
}, {
  id: 5,
  name: 'Casey Gray',
  email: 'casey.gray@example.com',
  avatar: {
    src: 'https://i.pravatar.cc/128?u=5'
  },
  status: 'subscribed',
  location: 'Tokyo, Japan'
}, {
  id: 6,
  name: 'Jamie Johnson',
  email: 'jamie.johnson@example.com',
  avatar: {
    src: 'https://i.pravatar.cc/128?u=6'
  },
  status: 'subscribed',
  location: 'Sydney, Australia'
}, {
  id: 7,
  name: 'Riley Davis',
  email: 'riley.davis@example.com',
  avatar: {
    src: 'https://i.pravatar.cc/128?u=7'
  },
  status: 'subscribed',
  location: 'New York, USA'
}, {
  id: 8,
  name: 'Kelly Wilson',
  email: 'kelly.wilson@example.com',
  avatar: {
    src: 'https://i.pravatar.cc/128?u=8'
  },
  status: 'subscribed',
  location: 'London, UK'
}, {
  id: 9,
  name: 'Drew Moore',
  email: 'drew.moore@example.com',
  avatar: {
    src: 'https://i.pravatar.cc/128?u=9'
  },
  status: 'bounced',
  location: 'Paris, France'
}, {
  id: 10,
  name: 'Jordan Taylor',
  email: 'jordan.taylor@example.com',
  avatar: {
    src: 'https://i.pravatar.cc/128?u=10'
  },
  status: 'subscribed',
  location: 'Berlin, Germany'
}, {
  id: 11,
  name: 'Morgan Anderson',
  email: 'morgan.anderson@example.com',
  avatar: {
    src: 'https://i.pravatar.cc/128?u=11'
  },
  status: 'subscribed',
  location: 'Tokyo, Japan'
}, {
  id: 12,
  name: 'Casey Thomas',
  email: 'casey.thomas@example.com',
  avatar: {
    src: 'https://i.pravatar.cc/128?u=12'
  },
  status: 'unsubscribed',
  location: 'Sydney, Australia'
}, {
  id: 13,
  name: 'Jamie Jackson',
  email: 'jamie.jackson@example.com',
  avatar: {
    src: 'https://i.pravatar.cc/128?u=13'
  },
  status: 'unsubscribed',
  location: 'New York, USA'
}, {
  id: 14,
  name: 'Riley White',
  email: 'riley.white@example.com',
  avatar: {
    src: 'https://i.pravatar.cc/128?u=14'
  },
  status: 'unsubscribed',
  location: 'London, UK'
}, {
  id: 15,
  name: 'Kelly Harris',
  email: 'kelly.harris@example.com',
  avatar: {
    src: 'https://i.pravatar.cc/128?u=15'
  },
  status: 'subscribed',
  location: 'Paris, France'
}, {
  id: 16,
  name: 'Drew Martin',
  email: 'drew.martin@example.com',
  avatar: {
    src: 'https://i.pravatar.cc/128?u=16'
  },
  status: 'subscribed',
  location: 'Berlin, Germany'
}, {
  id: 17,
  name: 'Alex Thompson',
  email: 'alex.thompson@example.com',
  avatar: {
    src: 'https://i.pravatar.cc/128?u=17'
  },
  status: 'unsubscribed',
  location: 'Tokyo, Japan'
}, {
  id: 18,
  name: 'Jordan Garcia',
  email: 'jordan.garcia@example.com',
  avatar: {
    src: 'https://i.pravatar.cc/128?u=18'
  },
  status: 'subscribed',
  location: 'Sydney, Australia'
}, {
  id: 19,
  name: 'Taylor Rodriguez',
  email: 'taylor.rodriguez@example.com',
  avatar: {
    src: 'https://i.pravatar.cc/128?u=19'
  },
  status: 'bounced',
  location: 'New York, USA'
}, {
  id: 20,
  name: 'Morgan Lopez',
  email: 'morgan.lopez@example.com',
  avatar: {
    src: 'https://i.pravatar.cc/128?u=20'
  },
  status: 'subscribed',
  location: 'London, UK'
}]

function mapCustomer(row: CustomerRow): User {
  return {
    id: Number(row.id),
    name: row.name,
    email: row.email,
    status: row.status,
    location: row.location || 'Unknown',
    avatar: row.avatar_src
      ? {
          src: row.avatar_src
        }
      : undefined
  }
}

export async function ensureCustomersTable() {
  const db = useTursoClient()

  await db.batch([
    `
      CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'subscribed',
        location TEXT,
        avatar_src TEXT
      )
    `,
    `
      CREATE INDEX IF NOT EXISTS customers_email_idx
      ON customers(email)
    `
  ], 'write')

  const result = await db.execute('SELECT COUNT(*) AS count FROM customers')
  const count = Number(result.rows[0]?.count || 0)

  if (count > 0) {
    return
  }

  await db.batch(seedCustomers.map(customer => ({
    sql: `
      INSERT INTO customers (id, name, email, status, location, avatar_src)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    args: [
      customer.id,
      customer.name,
      customer.email,
      customer.status,
      customer.location,
      customer.avatar?.src || null
    ]
  })), 'write')
}

export async function listCustomers() {
  await ensureCustomersTable()

  const db = useTursoClient()
  const result = await db.execute(`
    SELECT id, name, email, status, location, avatar_src
    FROM customers
    ORDER BY id ASC
  `)

  return result.rows.map(row => mapCustomer(row as unknown as CustomerRow))
}

export async function createCustomer(input: Pick<User, 'name' | 'email'> & Partial<Pick<User, 'status' | 'location'>>) {
  await ensureCustomersTable()

  const db = useTursoClient()
  const result = await db.execute({
    sql: `
      INSERT INTO customers (name, email, status, location)
      VALUES (?, ?, ?, ?)
      RETURNING id, name, email, status, location, avatar_src
    `,
    args: [
      input.name,
      input.email,
      input.status || 'subscribed',
      input.location || 'Unknown'
    ]
  })

  return mapCustomer(result.rows[0] as unknown as CustomerRow)
}

export async function deleteCustomers(ids: number[]) {
  if (!ids.length) {
    return 0
  }

  await ensureCustomersTable()

  const db = useTursoClient()
  const placeholders = ids.map(() => '?').join(', ')
  const result = await db.execute({
    sql: `DELETE FROM customers WHERE id IN (${placeholders})`,
    args: ids
  })

  return result.rowsAffected
}
