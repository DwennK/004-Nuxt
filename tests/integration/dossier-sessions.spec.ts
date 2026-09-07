import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  dossierSession,
  guardDossierWrite,
  type DossierWriteContext
} from '../../server/utils/pos/dossiers'
import type { PosDatabase } from '../../server/utils/turso'
import { dossierSessionSchema } from '../../shared/validation/dossier'
import {
  DOSSIER_LEASE_MS,
  type DossierStatus,
  type DossierTarget
} from '../../shared/types/dossier'
import { createDossierTables } from '../fixtures/dossiers'

describe('dossier reservations on real local SQLite transactions', () => {
  let client: ReturnType<typeof createClient>
  let directory: string
  let db: PosDatabase
  const a = { userId: 1, name: 'Alice', isAdmin: true }
  const b = { userId: 2, name: 'Bob', isAdmin: true }
  const tabA = crypto.randomUUID()
  const tabB = crypto.randomUUID()
  const ticket: DossierTarget = { kind: 'ticket', id: 1 }
  const document: DossierTarget = { kind: 'document', id: 10 }
  const standalone: DossierTarget = { kind: 'document', id: 20 }

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'pos-dossiers-'))
    client = createClient({ url: `file:${join(directory, 'test.db')}` })
    db = drizzle({ client }) as unknown as PosDatabase
    await client.executeMultiple(`
      CREATE TABLE tickets (id INTEGER PRIMARY KEY, internal_notes TEXT);
      CREATE TABLE documents (id INTEGER PRIMARY KEY, ticket_id INTEGER, notes TEXT);
      CREATE TABLE payments (id INTEGER PRIMARY KEY, document_id INTEGER);
      INSERT INTO tickets VALUES (1, 'Original'), (2, 'Other');
      INSERT INTO documents VALUES (10, 1, 'Invoice'), (11, 1, 'Quote'), (20, NULL, 'Independent');
      INSERT INTO payments VALUES (100, 10);
    `)
    await createDossierTables(client)
  })
  afterEach(async () => {
    client.close()
    await rm(directory, { recursive: true, force: true })
  })
  const input = (
    target: DossierTarget,
    tabId = tabA,
    rest: Record<string, unknown> = {}
  ) =>
    dossierSessionSchema.parse({
      target,
      tabId,
      station: tabId === tabA ? 'PC A' : 'PC B',
      action: 'acquire',
      ...rest
    })
  const proof = (
    owner: DossierStatus,
    tabId = tabA,
    userId = 1
  ): DossierWriteContext => ({
    userId,
    tabId,
    proofs: [{ key: owner.key, revision: owner.revision, token: owner.token! }]
  })
  async function write(
    context?: DossierWriteContext,
    target = ticket,
    fail = false
  ) {
    return db.transaction(async (tx) => {
      await guardDossierWrite(tx, [target], context)
      await tx.run(
        sql`UPDATE tickets SET internal_notes = 'Saved' WHERE id = 1`
      )
      if (fail) throw new Error('Business rule failed')
    })
  }

  it('shares one reservation between ticket, invoice, quote and payment', async () => {
    const owner = await dossierSession(input(ticket), a, db)
    for (const target of [
      document,
      { kind: 'document' as const, id: 11 },
      { kind: 'payment' as const, id: 100 }
    ]) {
      const viewer = await dossierSession(input(target, tabB), b, db)
      expect(viewer).toMatchObject({
        key: 'ticket:1',
        token: null,
        owner: { name: 'Alice', station: 'PC A' }
      })
      await expect(
        write(proof({ ...viewer, token: owner.token }, tabB, 2), target)
      ).rejects.toMatchObject({ statusCode: 409 })
    }
    expect(
      (await dossierSession(input(standalone, tabB), b, db)).token
    ).toBeTruthy()
    await write(proof(owner))
    await expect(write(proof(owner))).rejects.toMatchObject({ statusCode: 409 })
  })

  it('distinguishes tabs of the same account and does not reveal their secret token', async () => {
    const owner = await dossierSession(input(ticket), a, db)
    expect((await dossierSession(input(ticket, tabB), a, db)).token).toBeNull()
    expect(
      (await dossierSession(input(ticket, tabA, { action: 'observe' }), a, db))
        .token
    ).toBeNull()
    const renewed = await dossierSession(
      input(document, tabA, { action: 'observe', token: owner.token }),
      a,
      db
    )
    expect(renewed.token).toBe(owner.token)
    expect(renewed.generation).toBe(owner.generation)
  })

  it('invalidates the old token atomically on takeover, including queued old saves', async () => {
    const owner = await dossierSession(input(ticket), a, db)
    const next = await dossierSession(
      input(document, tabB, {
        action: 'takeover',
        expectedGeneration: owner.generation
      }),
      b,
      db
    )
    await expect(write(proof(owner))).rejects.toMatchObject({ statusCode: 409 })
    await expect(
      dossierSession(
        input(ticket, tabA, {
          action: 'takeover',
          expectedGeneration: owner.generation
        }),
        a,
        db
      )
    ).rejects.toMatchObject({ data: { code: 'DOSSIER_TAKEOVER_CHANGED' } })
    await write(proof(next, tabB, 2))
  })

  it('expires after a crash and rejects a suspended browser when it wakes up', async () => {
    const now = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(now)
    const owner = await dossierSession(input(ticket), a, db)
    vi.spyOn(Date, 'now').mockReturnValue(now + DOSSIER_LEASE_MS + 1)
    await expect(write(proof(owner))).rejects.toMatchObject({ statusCode: 409 })
    const next = await dossierSession(input(document, tabB), b, db)
    expect(next.token).toBeTruthy()
    expect(next.peers).toHaveLength(0)
  })

  it('requires a proof and rolls back both revision and business data on failure', async () => {
    await expect(write()).rejects.toMatchObject({ statusCode: 428 })
    const owner = await dossierSession(input(ticket), a, db)
    await expect(write(proof(owner), ticket, true)).rejects.toThrow(
      'Business rule failed'
    )
    expect(
      (await client.execute('SELECT internal_notes FROM tickets WHERE id = 1'))
        .rows[0]!.internal_notes
    ).toBe('Original')
    await write(proof(owner))
  })

  it('requires source and destination reservations before reparenting, without partial revision bumps', async () => {
    const source = await dossierSession(input(document), a, db)
    const destination = await dossierSession(
      input({ kind: 'ticket', id: 2 }),
      a,
      db
    )
    const targets: DossierTarget[] = [document, { kind: 'ticket', id: 2 }]
    await expect(
      db.transaction(tx => guardDossierWrite(tx, targets, proof(source)))
    ).rejects.toMatchObject({ statusCode: 428 })
    const context = proof(source)
    context.proofs.push(...proof(destination).proofs)
    await db.transaction(async (tx) => {
      await guardDossierWrite(tx, targets, context)
      await tx.run(sql`UPDATE documents SET ticket_id = 2 WHERE id = 10`)
    })
    await expect(write(proof(source), document)).rejects.toMatchObject({
      statusCode: 428
    })
    expect(
      (await client.execute('SELECT revision FROM dossier_scopes')).rows.map(
        row => row.revision
      )
    ).toEqual([1, 1])
  })

  it('allows only admins to reserve document editing or detached destination scopes', async () => {
    await expect(
      dossierSession(
        input(document, tabB, { intent: 'edit' }),
        { ...b, isAdmin: false },
        db
      )
    ).rejects.toMatchObject({ statusCode: 403 })
    await expect(
      dossierSession(
        input(document, tabB, { standalone: true }),
        { ...b, isAdmin: false },
        db
      )
    ).rejects.toMatchObject({ statusCode: 403 })
    const owner = await dossierSession(input(document), a, db)
    const destination = await dossierSession(
      input(document, tabA, { standalone: true }),
      a,
      db
    )
    const context = proof(owner)
    context.proofs.push(...proof(destination).proofs)
    await db.transaction(tx =>
      guardDossierWrite(tx, [document], context, ['document:10'])
    )
  })

  it('does not let an old release clear a new owner and retains the revision after release', async () => {
    const old = await dossierSession(input(ticket), a, db)
    const owner = await dossierSession(
      input(ticket, tabB, {
        action: 'takeover',
        expectedGeneration: old.generation
      }),
      b,
      db
    )
    await write(proof(owner, tabB, 2))
    const stillOwned = await dossierSession(
      input(ticket, tabA, { action: 'release', token: old.token }),
      a,
      db
    )
    expect(stillOwned.owner?.name).toBe('Bob')
    const released = await dossierSession(
      input(ticket, tabB, { action: 'release', token: owner.token }),
      b,
      db
    )
    expect(released).toMatchObject({ owner: null, revision: 1 })
  })
})
