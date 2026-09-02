import { ref, watch, type Ref } from 'vue'
import type { PaymentMethod, PaymentRecord, PaymentStatus } from '~~/shared/types/pos'

export type PaymentDraft = {
  method: PaymentMethod
  status: PaymentStatus
  amount: number
  paidAt: string
  notes: string
}

function createPaymentDraft(payment: PaymentRecord): PaymentDraft {
  const date = new Date(payment.paidAt)
  const pad = (part: number) => String(part).padStart(2, '0')
  const paidAt = Number.isNaN(date.getTime())
    ? ''
    : [
        date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())
      ].join('-') + `T${pad(date.getHours())}:${pad(date.getMinutes())}`

  return {
    method: payment.method, status: payment.status,
    amount: payment.amount / 100, paidAt, notes: payment.notes || ''
  }
}

export function usePaymentDrafts(documentId: Ref<number>, payments: Ref<PaymentRecord[]>) {
  const drafts = ref<Record<number, PaymentDraft>>({})
  const baselines = new Map<number, string>()
  let ownerId: number | undefined

  function isDirty(id: number) {
    return Boolean(drafts.value[id]) && JSON.stringify(drafts.value[id]) !== baselines.get(id)
  }

  function reset(payment: PaymentRecord) {
    drafts.value[payment.id] = createPaymentDraft(payment)
    baselines.set(payment.id, JSON.stringify(drafts.value[payment.id]))
  }

  watch([documentId, payments], ([nextOwner, rows]) => {
    if (ownerId !== nextOwner) {
      drafts.value = {}
      baselines.clear()
      ownerId = nextOwner
    }

    const ids = new Set(rows.map(payment => payment.id))
    for (const id of baselines.keys()) {
      if (!ids.has(id)) {
        Reflect.deleteProperty(drafts.value, id)
        baselines.delete(id)
      }
    }
    for (const payment of rows) {
      if (!isDirty(payment.id)) reset(payment)
    }
  }, { immediate: true, deep: true })

  function acceptSaved(payment: PaymentRecord, submitted: PaymentDraft) {
    // A response from a previous document must never affect the current editor.
    if (payment.documentId !== documentId.value || !drafts.value[payment.id]) return

    if (JSON.stringify(drafts.value[payment.id]) === JSON.stringify(submitted)) {
      reset(payment)
    } else {
      // Keep edits made while the request was in flight.
      baselines.set(payment.id, JSON.stringify(createPaymentDraft(payment)))
    }
  }

  return { drafts, isDirty, reset, acceptSaved }
}
