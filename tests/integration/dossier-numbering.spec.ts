import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient } from '@libsql/client'
import { defineRelations, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { renameTicketNumbers } from '../../scripts/db/rename-ticket-numbers.mjs'
import { checks, runCountChecks } from '../../scripts/db/verify.mjs'
import * as schema from '../../server/db/schema'
import { generateTicketNumber } from '../../server/utils/pos/numbers'
import { dossierReferenceSearch, dossierReferenceTerm } from '../../server/utils/pos/dossier-search'

describe('dossier references', () => {
  let client: ReturnType<typeof createClient>
  const relations = defineRelations(schema)
  let directory: string

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'dossier-numbering-'))
    client = createClient({ url: `file:${join(directory, 'test.sqlite')}` })
    await client.executeMultiple(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE tickets(id INTEGER PRIMARY KEY, ticket_number TEXT NOT NULL UNIQUE);
      CREATE TABLE number_sequences(scope TEXT PRIMARY KEY, last_value INTEGER NOT NULL);
      CREATE TABLE documents(id INTEGER PRIMARY KEY, ticket_id INTEGER REFERENCES tickets(id));
      INSERT INTO tickets VALUES(1, 'TIC-34'), (2, 'DOS-40');
      INSERT INTO documents VALUES(1, 1);
    `)
  })
  afterEach(async () => {
    client.close()
    await rm(directory, { recursive: true, force: true })
  })

  it('previews without writing, preserves links and a higher sequence, and is idempotent', async () => {
    await client.execute('INSERT INTO number_sequences VALUES(\'ticket\', 90)')
    const plan = await renameTicketNumbers(client)
    expect(plan).toMatchObject({ ready: true, applied: false, updated: 0, nextSequence: 90, changes: [{ id: 1, from: 'TIC-34', to: 'DOS-34' }] })
    expect((await client.execute('SELECT ticket_number FROM tickets WHERE id=1')).rows[0]?.ticket_number).toBe('TIC-34')
    expect(await renameTicketNumbers(client, { apply: true })).toMatchObject({ updated: 1, nextSequence: 90 })
    expect((await client.execute('SELECT t.ticket_number FROM documents d JOIN tickets t ON t.id=d.ticket_id')).rows[0]?.ticket_number).toBe('DOS-34')
    expect(await renameTicketNumbers(client, { apply: true })).toMatchObject({ updated: 0, changes: [], nextSequence: 90 })
    expect(await generateTicketNumber(drizzle({ client, relations }))).toBe('DOS-91')
  })

  it.each(['missing', 'behind'])('catches up a %s sequence and allocates distinct concurrent numbers', async (state) => {
    if (state === 'behind') await client.execute('INSERT INTO number_sequences VALUES(\'ticket\', 2)')
    await renameTicketNumbers(client, { apply: true })
    const db = drizzle({ client, relations })
    const numbers = await Promise.all(Array.from({ length: 12 }, () => generateTicketNumber(db)))
    expect(new Set(numbers).size).toBe(12)
    expect(numbers).toContain('DOS-41')
    expect(numbers).toContain('DOS-52')
  })

  it('allocates above both prefixes even before conversion, with an absent or stale sequence', async () => {
    await client.execute('INSERT INTO tickets VALUES(3, \'TIC-80\')')
    const db = drizzle({ client, relations })
    expect(await generateTicketNumber(db)).toBe('DOS-81')
    await client.execute('UPDATE number_sequences SET last_value=1 WHERE scope=\'ticket\'')
    expect(await generateTicketNumber(db)).toBe('DOS-81')
  })

  it.each(['DOS-34', 'TIC-broken', 'TIC-0', 'TIC-9007199254740992'])('rejects collision or invalid reference %s atomically', async (number) => {
    await client.execute({ sql: 'INSERT INTO tickets VALUES(3, ?)', args: [number] })
    expect(await renameTicketNumbers(client)).toMatchObject({ ready: false, updated: 0 })
    await expect(renameTicketNumbers(client, { apply: true })).rejects.toThrow('Conversion refused')
    expect((await client.execute('SELECT ticket_number FROM tickets WHERE id=1')).rows[0]?.ticket_number).toBe('TIC-34')
    expect((await client.execute('SELECT * FROM number_sequences')).rows).toEqual([])
  })

  it('accepts old and new search references before and after conversion', async () => {
    const db = drizzle({ client, relations })
    for (const apply of [false, true]) {
      await renameTicketNumbers(client, { apply })
      for (const query of ['tic-34', 'dos-34', '34']) {
        const term = dossierReferenceTerm(query)
        const found = await db.select({ id: schema.tickets.id }).from(schema.tickets)
          .where(sql`${dossierReferenceSearch(sql`${schema.tickets.ticketNumber}`)} like ${`%${term}%`}`)
        expect(found).toEqual([{ id: 1 }])
      }
    }
  })

  it('verifies the sequence against DOS references', async () => {
    await client.execute('INSERT INTO number_sequences VALUES(\'ticket\', 35)')
    const check = checks.filter(check => check.name === 'ticket_number_sequence_behind')
    const tables = new Set(['tickets', 'number_sequences'])
    expect(await runCountChecks(client, tables, check, 'violations')).toMatchObject([{ violations: 1 }])
    await renameTicketNumbers(client, { apply: true })
    expect(await runCountChecks(client, tables, check, 'violations')).toMatchObject([{ violations: 0 }])
  })
})
