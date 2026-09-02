import { eq } from 'drizzle-orm'
import { createError } from 'h3'
import { tickets } from '~~/server/db/schema'
import { ticketStatusLabels } from '~~/shared/constants/pos'
import { canTransitionTicketStatus } from '~~/shared/domain/tickets/workflow'
import { normalizeOptionalText } from '~~/shared/lib/text'
import type { TicketStatus } from '~~/shared/types/pos'
import { toIsoDateTime } from '~~/shared/utils/pos'
import { useDb } from '../turso'
import { ensurePosSchema } from './schema'
import { createTicketEvent } from './ticket-events'

export function closeTicketRecord(ticketId: number, internalNotes?: string | null) {
  return updateTicketStatusRecord(ticketId, 'closed', internalNotes)
}

export async function updateTicketStatusRecord(ticketId: number, status: TicketStatus, internalNotes?: string | null) {
  await ensurePosSchema()

  const db = useDb()
  return db.transaction(async (tx) => {
    const existingRows = await tx.select().from(tickets).where(eq(tickets.id, ticketId)).limit(1)
    const existing = existingRows[0]

    if (!existing) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Ticket not found'
      })
    }

    if (!canTransitionTicketStatus(existing.status, status)) {
      throw createError({
        statusCode: 409,
        statusMessage: `Ticket cannot transition from ${ticketStatusLabels[existing.status]} to ${ticketStatusLabels[status]}`,
        data: {
          code: 'TICKET_TRANSITION_NOT_ALLOWED',
          from: existing.status,
          to: status
        }
      })
    }

    const result = await tx.update(tickets)
      .set({
        status,
        closedAt: status === 'closed' ? toIsoDateTime() : null,
        internalNotes: normalizeOptionalText(internalNotes) ?? undefined,
        updatedAt: toIsoDateTime()
      })
      .where(eq(tickets.id, ticketId))
      .returning()
    const row = result[0]

    if (!row) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Ticket not found'
      })
    }

    if (existing.status !== status) {
      await createTicketEvent({
        ticketId,
        kind: status === 'closed' ? 'ticket_closed' : 'ticket_status_changed',
        label: status === 'closed' ? 'Ticket clôturé' : `Statut mis à jour · ${ticketStatusLabels[status]}`,
        note: internalNotes,
        metadata: {
          previousStatus: existing.status,
          nextStatus: status
        },
        occurredAt: status === 'closed' ? row.closedAt : row.updatedAt
      }, tx)
    }

    return row
  })
}
