import { z } from 'zod'
import { documentEmailSchema } from '../validation/pos'

const pendingEmailAttemptSchema = z.object({ key: z.uuid(), payload: documentEmailSchema })
export type PendingEmailAttempt = z.infer<typeof pendingEmailAttemptSchema>

// Only pending attempts live in tab-scoped storage. Clear on success or an
// explicit new attempt after a confirmed failure; never on an ambiguous result.
export function readPendingEmailAttempt(storage: Pick<Storage, 'getItem'>, key: string): PendingEmailAttempt | null {
  const value = storage.getItem(key)
  return value === null ? null : pendingEmailAttemptSchema.parse(JSON.parse(value))
}
