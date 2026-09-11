import { eq } from 'drizzle-orm'
import type { MessageBatch } from '@cloudflare/workers-types'
import { z } from 'zod'
import { sentEmails, sentEmailEvents } from '~~/server/db/schema'
import type { PosDatabase } from '../turso'
import { applyEmailEvents } from './journal'

const eventStatuses = { delivered: 'delivered', deferred: 'delivery_delayed', bounced: 'bounced', failed: 'failed', rejected: 'rejected' } as const
const eventKinds = ['delivered', 'deferred', 'bounced', 'failed', 'rejected'] as const
const emailEventSchema = z.object({
  type: z.string().max(100),
  source: z.object({ type: z.literal('email.sending'), domain: z.string().max(253) }),
  payload: z.object({
    eventId: z.string().min(1).max(200), messageId: z.string().min(1).max(500),
    sender: z.email(), recipient: z.email(), delivery: z.object({ status: z.enum(eventKinds) })
  }),
  metadata: z.object({ eventSchemaVersion: z.literal(1), eventTimestamp: z.iso.datetime({ offset: true }) })
}).refine(e => e.type === `cf.email.sending.message.${e.payload.delivery.status}`, 'Event type/status mismatch')

export async function persistEmailEvent(database: PosDatabase, body: unknown, sender: string) {
  const event = emailEventSchema.parse(body)
  if (event.payload.sender !== sender || event.source.domain !== sender.split('@')[1]) {
    throw new Error('Unexpected email sending domain or sender')
  }
  await database.transaction(async (tx) => {
    const [stored] = await tx.insert(sentEmailEvents).values({
      id: event.payload.eventId, providerMessageId: event.payload.messageId,
      recipient: event.payload.recipient, sender: event.payload.sender,
      status: eventStatuses[event.payload.delivery.status],
      occurredAt: new Date(event.metadata.eventTimestamp).toISOString(), createdAt: new Date().toISOString()
    }).onConflictDoNothing({ target: sentEmailEvents.id }).returning({
      providerMessageId: sentEmailEvents.providerMessageId, sender: sentEmailEvents.sender,
      recipient: sentEmailEvents.recipient, status: sentEmailEvents.status, occurredAt: sentEmailEvents.occurredAt
    })
    // Insertion and status application commit together. Early events are reconciled
    // when send() records the provider ID, so a duplicate needs no history replay.
    if (!stored) return
    const [record] = await tx.select({
      id: sentEmails.id, providerMessageId: sentEmails.providerMessageId,
      from: sentEmails.from, to: sentEmails.to, status: sentEmails.status,
      lastEventAt: sentEmails.lastEventAt, errorCode: sentEmails.errorCode, errorMessage: sentEmails.errorMessage
    }).from(sentEmails).where(eq(sentEmails.providerMessageId, stored.providerMessageId)).limit(1)
    if (record) await applyEmailEvents(tx, record, [stored])
  })
}

export async function consumeEmailEvents(batch: MessageBatch<unknown>, database: PosDatabase, sender: string) {
  for (const message of batch.messages) {
    try {
      await persistEmailEvent(database, message.body, sender)
      message.ack()
    } catch {
      console.error(JSON.stringify({ scope: 'email-events', code: 'EVENT_PROCESSING_FAILED', id: message.id }))
      message.retry({ delaySeconds: 60 })
    }
  }
}
