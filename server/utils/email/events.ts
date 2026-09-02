import { eq } from 'drizzle-orm'
import type { MessageBatch } from '@cloudflare/workers-types'
import { z } from 'zod'
import { sentEmails, sentEmailEvents } from '~~/server/db/schema'
import type { PosDatabase } from '../turso'
import { applyStoredEmailEvents } from './journal'

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
    await tx.insert(sentEmailEvents).values({
      id: event.payload.eventId, providerMessageId: event.payload.messageId,
      recipient: event.payload.recipient, sender: event.payload.sender,
      status: eventStatuses[event.payload.delivery.status],
      occurredAt: new Date(event.metadata.eventTimestamp).toISOString(), createdAt: new Date().toISOString()
    }).onConflictDoNothing({ target: sentEmailEvents.id })
    const [record] = await tx.select().from(sentEmails).where(eq(sentEmails.providerMessageId, event.payload.messageId)).limit(1)
    if (record) await applyStoredEmailEvents(tx, record)
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
