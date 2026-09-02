import { ticketEvents } from '~~/server/db/schema'
import { normalizeOptionalText } from '~~/shared/lib/text'
import type { TicketEventKind } from '~~/shared/types/pos'
import { toIsoDateTime } from '~~/shared/utils/pos'
import type { PosDatabaseExecutor } from '../turso'
import { useDb } from '../turso'
import { ensurePosSchema } from './schema'

function serializeEventMetadata(metadata?: Record<string, unknown> | null) {
  if (!metadata) {
    return null
  }

  try {
    return JSON.stringify(metadata)
  } catch {
    return null
  }
}

export async function createTicketEvent(input: {
  ticketId: number
  kind: TicketEventKind
  label: string
  note?: string | null
  metadata?: Record<string, unknown> | null
  occurredAt?: string | null
}, executor?: PosDatabaseExecutor) {
  await ensurePosSchema()

  const db = executor || useDb()
  const now = toIsoDateTime()

  await db.insert(ticketEvents).values({
    ticketId: input.ticketId,
    kind: input.kind,
    label: input.label.trim(),
    note: normalizeOptionalText(input.note),
    metadataJson: serializeEventMetadata(input.metadata),
    occurredAt: input.occurredAt || now,
    createdAt: now
  })
}
