import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient } from '@libsql/client'
import { defineRelations } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '../../server/db/schema'
import { createCustomer, getCustomerById, updateCustomer, suggestCustomers } from '../../server/utils/pos/customers'
import { customerInputSchema, employeeInputSchema } from '../../shared/validation/pos'
import { auditPersonNames } from '../../scripts/db/audit-person-names.mjs'
import { parseSchemaContract, verifyDatabaseSchemaContract } from '../../scripts/db/_schema-contract.mjs'
import { schemaPath } from '../../scripts/db/_shared.mjs'

const context = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('../../server/utils/turso', () => ({ useDb: () => context.db }))
vi.mock('../../server/utils/pos/schema', () => ({ ensurePosSchema: async () => {} }))

const migrationName = '20261008150655_single_person_name'
const migrationSql = readFileSync(new URL(`../../drizzle/${migrationName}/migration.sql`, import.meta.url), 'utf8')

describe('one complete person name: migration and persistence', () => {
  let client: ReturnType<typeof createClient>
  let directory: string
  let db: ReturnType<typeof drizzle>

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'pos-person-names-'))
    mkdirSync(join(directory, migrationName))
    writeFileSync(join(directory, migrationName, 'migration.sql'), migrationSql)
    client = createClient({ url: 'file::memory:' })
    db = drizzle({ client, relations: defineRelations(schema) })
    context.db = db
    await client.batch([
      'PRAGMA foreign_keys = ON',
      `CREATE TABLE customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT, first_name TEXT NOT NULL, last_name TEXT NOT NULL,
        company_name TEXT, phone TEXT NOT NULL, email TEXT NOT NULL, address_line_1 TEXT,
        address_line_2 TEXT, postal_code TEXT, city TEXT, notes TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      'CREATE INDEX customers_email_idx ON customers(email)',
      'CREATE INDEX customers_normalized_email_idx ON customers(lower(trim(email)))',
      'CREATE INDEX customers_phone_idx ON customers(phone)',
      'CREATE INDEX customers_last_name_idx ON customers(last_name)',
      'CREATE INDEX customers_name_order_idx ON customers(last_name, first_name, id)',
      `CREATE TABLE employees (
        id INTEGER PRIMARY KEY AUTOINCREMENT, first_name TEXT NOT NULL, last_name TEXT NOT NULL,
        email TEXT, color TEXT NOT NULL, vacation_days_per_year INTEGER NOT NULL DEFAULT 25,
        is_active INTEGER NOT NULL DEFAULT true,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      'CREATE INDEX employees_last_name_idx ON employees(last_name)',
      'CREATE INDEX employees_is_active_idx ON employees(is_active)',
      ...['tickets', 'documents', 'payments', 'counter_customer'].map(table => `CREATE TABLE ${table} (id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT)`),
      'CREATE TABLE vacation_entries (id INTEGER PRIMARY KEY, employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE RESTRICT)',
      `INSERT INTO customers (id, first_name, last_name, company_name, phone, email, notes, address_line_2) VALUES
        (1, 'Jean', 'Dupont', NULL, '0791234567', 'jean@example.test', 'Notes intactes', 'Étage 2'),
        (2, '', 'Jean Dupont', NULL, '', '', NULL, NULL),
        (3, 'Jean', 'Jean Dupont', NULL, '', '', NULL, NULL),
        (4, '  Élodie Anne ', ' de La Tour  ', 'Atelier', '', '', NULL, NULL),
        (5, '', '', 'Société seule', '', '', NULL, NULL),
        (6, 'Prince', '', NULL, '', '', NULL, NULL)`,
      `INSERT INTO employees (id, first_name, last_name, color) VALUES (42, 'Ada', 'Lovelace', '#008000')`,
      ...['tickets', 'documents', 'payments', 'counter_customer'].map(table => `INSERT INTO ${table} VALUES (8, 1)`),
      'INSERT INTO vacation_entries VALUES (7, 42)'
    ], 'write')
  })
  afterEach(() => {
    client.close()
    rmSync(directory, { recursive: true, force: true })
  })

  it('audits suspected duplication without changing any name', async () => {
    const report = await auditPersonNames(client)
    expect(report.tables[0]).toMatchObject({ table: 'customers', state: 'legacy', count: 6, candidates: [{ id: 3, firstName: 'Jean', lastName: 'Jean Dupont', migratedName: 'Jean Jean Dupont' }] })
    expect((await client.execute('SELECT first_name, last_name FROM customers WHERE id=3')).rows[0]).toEqual({ first_name: 'Jean', last_name: 'Jean Dupont' })
  })

  it('migrates once, preserves identities and references, and matches the final schema', async () => {
    await migrate(db, { migrationsFolder: directory })
    await migrate(db, { migrationsFolder: directory })
    expect((await client.execute('SELECT id, name FROM customers ORDER BY id')).rows).toEqual([
      { id: 1, name: 'Jean Dupont' }, { id: 2, name: 'Jean Dupont' },
      { id: 3, name: 'Jean Jean Dupont' }, { id: 4, name: 'Élodie Anne de La Tour' },
      { id: 5, name: '' }, { id: 6, name: 'Prince' }
    ])
    expect((await client.execute('SELECT id, name FROM employees')).rows).toEqual([{ id: 42, name: 'Ada Lovelace' }])
    for (const table of ['tickets', 'documents', 'payments', 'counter_customer']) {
      expect((await client.execute(`SELECT * FROM ${table}`)).rows).toEqual([{ id: 8, customer_id: 1 }])
    }
    expect((await client.execute('SELECT * FROM vacation_entries')).rows).toEqual([{ id: 7, employee_id: 42 }])
    expect((await client.execute('PRAGMA foreign_key_check')).rows).toEqual([])
    expect((await client.execute('PRAGMA integrity_check')).rows[0]?.integrity_check).toBe('ok')
    expect((await client.execute('SELECT count(*) AS n FROM __drizzle_migrations')).rows[0]?.n).toBe(1)
    const contract = parseSchemaContract(readFileSync(schemaPath, 'utf8'), schemaPath)
    expect(await verifyDatabaseSchemaContract(client, { customers: contract.customers, employees: contract.employees }, new Set(['customers', 'employees']))).toEqual([])
    expect((await auditPersonNames(client)).tables.every(table => table.state === 'unified')).toBe(true)
  })

  it('rolls back the complete migration if a legacy dependency prevents dropping a column', async () => {
    await client.execute('CREATE INDEX unexpected_legacy_index ON customers(first_name)')
    await expect(migrate(db, { migrationsFolder: directory })).rejects.toThrow()
    const columns = (await client.execute('PRAGMA table_info(customers)')).rows.map(row => row.name)
    expect(columns).toContain('first_name')
    expect(columns).not.toContain('name')
    expect((await client.execute('SELECT first_name, last_name FROM customers WHERE id=1')).rows[0]).toEqual({ first_name: 'Jean', last_name: 'Dupont' })
  })

  it('repeatedly edits one complete name without guessing or duplicating any part', async () => {
    await migrate(db, { migrationsFolder: directory })
    for (const name of ['Jean Dupont', 'Élodie Anne de La Tour', 'Dupont Jean', 'Prince', 'Jean  Dupont']) {
      for (let repeat = 0; repeat < 3; repeat++) {
        const existing = await getCustomerById(1)
        const { id: _id, displayName: _displayName, createdAt: _createdAt, updatedAt: _updatedAt, ...input } = existing
        const saved = await updateCustomer(1, customerInputSchema.parse({ ...input, name }))
        expect(saved).toMatchObject({ name, displayName: name, notes: 'Notes intactes', addressLine2: 'Étage 2' })
        expect(saved).not.toHaveProperty('firstName')
        expect(saved).not.toHaveProperty('lastName')
      }
    }
    expect((await suggestCustomers({ search: 'dupont jean' })).items.map(row => row.id)).toContain(1)
    const created = await createCustomer(customerInputSchema.parse({ name: 'Élodie de La Tour', companyName: 'Atelier' }))
    expect(created).toMatchObject({ name: 'Élodie de La Tour', displayName: 'Atelier' })
    expect((await suggestCustomers({ search: 'tour elodie' })).items.map(row => row.id)).toContain(created.id)
    expect(await createCustomer(customerInputSchema.parse({ name: '', companyName: 'Société seule' }))).toMatchObject({ name: '', displayName: 'Société seule' })
  })

  it('rejects legacy or empty writes instead of silently replacing identity', () => {
    expect(customerInputSchema.safeParse({ firstName: '', lastName: 'Jean Dupont', companyName: 'Atelier' }).success).toBe(false)
    expect(customerInputSchema.safeParse({ name: ' ', companyName: '' }).success).toBe(false)
    expect(employeeInputSchema.safeParse({ firstName: 'Ada', lastName: 'Lovelace', color: '#008000' }).success).toBe(false)
    expect(employeeInputSchema.parse({ name: 'Ada Byron Lovelace', color: '#008000' }).name).toBe('Ada Byron Lovelace')
  })
})
