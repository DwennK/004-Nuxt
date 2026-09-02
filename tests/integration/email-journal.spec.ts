import { createClient } from '@libsql/client'
import { defineRelations, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MessageBatch } from '@cloudflare/workers-types'
import * as schema from '../../server/db/schema'
import { consumeEmailEvents, persistEmailEvent } from '../../server/utils/email/events'
import { getEmailAttempt, sendJournaledEmail } from '../../server/utils/email/journal'
import { getSentEmail, listSentEmails } from '../../server/utils/sent-emails'
import type { PosDatabase } from '../../server/utils/turso'
import { deliveryEvent, mailFixture } from '../fixtures/email'
import { parseSchemaContract, verifyDatabaseSchemaContract } from '../../scripts/db/_schema-contract.mjs'

describe('Cloudflare email journal', () => {
  let directory: string
  let client: ReturnType<typeof createClient>
  let database: PosDatabase
  const send = vi.fn(async () => ({ messageId: 'cf-message-1' }))

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'pos-email-'))
    client = createClient({ url: `file:${join(directory, 'mail.db')}` })
    database = drizzle({ client, relations: defineRelations(schema) })
    await client.batch([
      'CREATE TABLE documents (id INTEGER PRIMARY KEY)', 'CREATE TABLE users (id INTEGER PRIMARY KEY)',
      'INSERT INTO documents VALUES (1)', 'INSERT INTO users VALUES (1)', 'INSERT INTO users VALUES (2)'
    ], 'write')
    await client.executeMultiple(await readFile(new URL('../../docs/sql/cloudflare-email-additive.sql', import.meta.url), 'utf8'))
    send.mockReset().mockResolvedValue({ messageId: 'cf-message-1' })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(async () => {
    client.close()
    await rm(directory, { recursive: true, force: true })
  })

  function deliver(key = 'email-attempt-1', mail = mailFixture(), actorId = 1) {
    return sendJournaledEmail({ database, binding: { send }, mail, actorId, documentId: 1, idempotencyKey: key })
  }

  it('keeps the additive SQL fixture aligned with the Drizzle mail schema', async () => {
    const source = await readFile(new URL('../../server/db/schema.ts', import.meta.url), 'utf8')
    const contract = parseSchemaContract(source)
    const mailContract = Object.fromEntries(Object.entries(contract).filter(([table]) => ['sent_emails', 'sent_email_events'].includes(table)))
    expect(Object.keys(mailContract)).toHaveLength(2)
    expect(await verifyDatabaseSchemaContract(client, mailContract, new Set(Object.keys(mailContract)))).toEqual([])
  })

  it('persists before sending, preserves PDF/reply-to, and does not assume delivery', async () => {
    send.mockImplementationOnce(async () => {
      const records = await database.select().from(schema.sentEmails)
      expect(records).toHaveLength(1)
      expect(records[0]?.status).toBe('sending')
      return { messageId: 'cf-message-1' }
    })
    const result = await deliver()
    expect(result).toMatchObject({ ok: true, status: 'sent', replayed: false })
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      from: { name: 'Microwest', email: 'info@microwest.ch' }, replyTo: 'info@microwest.ch',
      attachments: [expect.objectContaining({ filename: 'FA-123.pdf', type: 'application/pdf', content: btoa('%PDF-1.7\nTest') })]
    }))
    expect(await getSentEmail(result.id, database)).toMatchObject({ bodyText: mailFixture().text, lastEvent: 'sent' })
  })

  it('never sends when database reservation fails', async () => {
    await client.execute('DROP TABLE sent_emails')
    await expect(deliver()).rejects.toThrow()
    expect(send).not.toHaveBeenCalled()
  })

  it('replays concurrent attempts without a second send', async () => {
    const results = await Promise.all([deliver(), deliver()])
    expect(send).toHaveBeenCalledTimes(1)
    expect(new Set(results.map(r => r.id)).size).toBe(1)
    expect(await deliver()).toMatchObject({ replayed: true, status: 'sent' })
  })

  it('rejects a reused key with different content or actor', async () => {
    await deliver()
    await expect(deliver('email-attempt-1', { ...mailFixture(), subject: 'Other' })).rejects.toMatchObject({ statusCode: 409 })
    await expect(deliver('email-attempt-1', mailFixture(), 2)).rejects.toMatchObject({ statusCode: 409 })
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('replays an attempt even if the regenerated PDF changes', async () => {
    await deliver()
    const mail = mailFixture()
    mail.attachments[0]!.content = new Uint8Array([1, 2, 3])
    expect(await deliver('email-attempt-1', mail)).toMatchObject({ replayed: true })
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('can verify the original attempt without PDF generation or a provider binding', async () => {
    const result = await deliver()
    const { to, subject, text } = mailFixture()
    expect(await getEmailAttempt(database, 'email-attempt-1', { actorId: 1, documentId: 1, to, subject, text })).toMatchObject({ id: result.id, replayed: true })
    await expect(getEmailAttempt(database, 'email-attempt-1', { actorId: 2, documentId: 1, to, subject, text })).rejects.toMatchObject({ statusCode: 409 })
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('does not send or reserve oversized or misconfigured messages', async () => {
    const mail = mailFixture()
    mail.attachments[0]!.content = new Uint8Array(4 * 1024 * 1024)
    await expect(deliver('large', mail)).rejects.toMatchObject({ statusCode: 413 })
    await expect(deliver('invalid', { ...mailFixture(), from: '' })).rejects.toMatchObject({ statusCode: 503 })
    expect(await database.select().from(schema.sentEmails)).toHaveLength(0)
    expect(send).not.toHaveBeenCalled()
  })

  it.each(['E_RATE_LIMIT_EXCEEDED', 'E_DAILY_LIMIT_EXCEEDED', 'E_CONTENT_TOO_LARGE', 'E_SENDER_NOT_VERIFIED'])('journals definite provider rejection %s', async (code) => {
    send.mockRejectedValueOnce(Object.assign(new Error('private upstream details'), { code }))
    const result = await deliver()
    expect(result).toMatchObject({ ok: false, status: 'failed' })
    expect(result.errorMessage).not.toContain('private')
    expect(await deliver()).toMatchObject({ status: 'failed', replayed: true })
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('keeps uncertain network failures from being retried', async () => {
    send.mockRejectedValueOnce(new Error('connection closed'))
    expect(await deliver()).toMatchObject({ ok: false, status: 'unknown' })
    expect(await deliver()).toMatchObject({ status: 'unknown', replayed: true })
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('returns uncertain when the accepted provider response cannot be committed', async () => {
    await client.execute(`CREATE TRIGGER reject_email_update BEFORE UPDATE ON sent_emails BEGIN SELECT RAISE(FAIL, 'offline'); END`)
    expect(await deliver()).toMatchObject({ ok: false, status: 'unknown' })
    await client.execute('DROP TRIGGER reject_email_update')
    await client.execute(`UPDATE sent_emails SET created_at = '2020-01-01T00:00:00.000Z'`)
    const replay = await deliver()
    expect(replay).toMatchObject({ status: 'unknown', replayed: true })
    expect((await getSentEmail(replay.id, database)).lastEvent).toBe('unknown')
    expect(send).toHaveBeenCalledTimes(1)
  })

  it.each([['delivered', 'delivered'], ['deferred', 'delivery_delayed'], ['bounced', 'bounced'], ['failed', 'failed'], ['rejected', 'rejected']])('applies %s events', async (eventStatus, status) => {
    const result = await deliver()
    await persistEmailEvent(database, deliveryEvent(eventStatus), 'info@microwest.ch')
    expect((await getSentEmail(result.id, database)).lastEvent).toBe(status)
  })

  it('reconciles an event that arrived before send() returned', async () => {
    send.mockImplementationOnce(async () => {
      await persistEmailEvent(database, deliveryEvent(), 'info@microwest.ch')
      return { messageId: 'cf-message-1' }
    })
    expect(await deliver()).toMatchObject({ status: 'delivered' })
  })

  it('deduplicates events and never downgrades terminal delivery', async () => {
    const result = await deliver()
    const event = deliveryEvent('delivered', { at: '2026-09-02T10:00:00.000Z' })
    await persistEmailEvent(database, event, 'info@microwest.ch')
    await persistEmailEvent(database, event, 'info@microwest.ch')
    await persistEmailEvent(database, deliveryEvent('deferred', { at: '2026-09-02T11:00:00.000Z' }), 'info@microwest.ch')
    expect((await getSentEmail(result.id, database)).lastEvent).toBe('delivered')
    expect(await database.select().from(schema.sentEmailEvents)).toHaveLength(2)
  })

  it('handles reversed event arrival, retaining timestamps and all terminal states', async () => {
    const result = await deliver()
    await persistEmailEvent(database, deliveryEvent('deferred', { at: '2026-09-02T12:00:00.000Z' }), 'info@microwest.ch')
    await persistEmailEvent(database, deliveryEvent('deferred', { at: '2026-09-02T10:00:00.000Z' }), 'info@microwest.ch')
    const [record] = await database.select().from(schema.sentEmails).where(eq(schema.sentEmails.id, result.id))
    expect(record?.lastEventAt).toBe('2026-09-02T12:00:00.000Z')
    await persistEmailEvent(database, deliveryEvent('bounced', { at: '2026-09-02T13:00:00.000Z' }), 'info@microwest.ch')
    await persistEmailEvent(database, deliveryEvent('deferred', { at: '2026-09-02T14:00:00.000Z' }), 'info@microwest.ch')
    expect((await getSentEmail(result.id, database)).lastEvent).toBe('bounced')
  })

  it('rejects malformed and wrong-domain events without changing delivery', async () => {
    const result = await deliver()
    await expect(persistEmailEvent(database, {}, 'info@microwest.ch')).rejects.toThrow()
    await expect(persistEmailEvent(database, deliveryEvent(), 'another@example.test')).rejects.toThrow()
    expect((await getSentEmail(result.id, database)).lastEvent).toBe('sent')
  })

  it('acknowledges only committed events, retries failures and recovers', async () => {
    const ack = vi.fn()
    const retry = vi.fn()
    const batch: MessageBatch<unknown> = {
      queue: 'pos-email-events', ackAll: vi.fn(), retryAll: vi.fn(),
      messages: [{ id: 'queue-1', timestamp: new Date(), body: deliveryEvent(), attempts: 1, ack, retry }]
    }
    await client.execute(`CREATE TRIGGER reject_event BEFORE INSERT ON sent_email_events BEGIN SELECT RAISE(FAIL, 'offline'); END`)
    await consumeEmailEvents(batch, database, 'info@microwest.ch')
    expect(ack).not.toHaveBeenCalled()
    expect(retry).toHaveBeenCalledWith({ delaySeconds: 60 })
    await client.execute('DROP TRIGGER reject_event')
    await consumeEmailEvents(batch, database, 'info@microwest.ch')
    expect(ack).toHaveBeenCalledTimes(1)
  })

  it('paginates tied dates in both directions and survives a new connection', async () => {
    for (let i = 0; i < 5; i++) {
      send.mockResolvedValueOnce({ messageId: `cf-${i}` })
      await deliver(`attempt-${i}`)
    }
    await client.execute(`UPDATE sent_emails SET created_at = '2026-09-02T10:00:00.000Z'`)
    const first = await listSentEmails({ limit: 2 }, database)
    const second = await listSentEmails({ limit: 2, after: first.afterCursor! }, database)
    const previous = await listSentEmails({ limit: 2, before: second.beforeCursor! }, database)
    const last = await listSentEmails({ limit: 2, after: second.afterCursor! }, database)
    expect(previous.items.map(m => m.id)).toEqual(first.items.map(m => m.id))
    expect(new Set([...first.items, ...second.items, ...last.items].map(m => m.id)).size).toBe(5)
    expect(last.hasMore).toBe(false)
    client.close()
    client = createClient({ url: `file:${join(directory, 'mail.db')}` })
    database = drizzle({ client, relations: defineRelations(schema) })
    expect((await getSentEmail(first.items[0]!.id, database)).bodyText).toBe(mailFixture().text)
  })

  it('preserves history if the document or author is removed', async () => {
    const result = await deliver()
    await client.execute('PRAGMA foreign_keys = ON')
    await client.execute('DELETE FROM documents WHERE id = 1')
    await client.execute('DELETE FROM users WHERE id = 1')
    const [record] = await database.select().from(schema.sentEmails).where(eq(schema.sentEmails.id, result.id))
    expect(record).toMatchObject({ documentId: null, actorId: null, bodyText: mailFixture().text })
  })

  it('returns an empty initial history and validates cursors and missing IDs', async () => {
    expect(await listSentEmails({ limit: 20 }, database)).toMatchObject({ items: [], hasMore: false })
    await expect(listSentEmails({ limit: 20, after: 'invalid' }, database)).rejects.toMatchObject({ statusCode: 400 })
    await expect(getSentEmail(crypto.randomUUID(), database)).rejects.toMatchObject({ statusCode: 404 })
  })
})
