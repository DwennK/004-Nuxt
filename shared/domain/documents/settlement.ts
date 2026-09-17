import type { DocumentRecord } from '../../types/pos'

// Callers pass a single operation (initial dossier or one SAV): invoice > order > quote.
// Standalone documents remain independent operations.
export function getActivePayableDocument<T extends Pick<DocumentRecord, 'id' | 'type' | 'status'>>(documents: readonly T[]): T | null {
  const active = documents.filter(document => document.status !== 'cancelled')
  return active.find(document => document.type === 'invoice')
    || active.find(document => document.type === 'customer_order')
    || active.find(document => document.type === 'quote')
    || null
}
