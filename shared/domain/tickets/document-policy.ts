import type { DocumentType, TicketStatus } from '../../types/pos'

export type TicketDocumentEligibility = {
  ticketStatus: TicketStatus
  existingDocumentTypes: readonly DocumentType[]
  activeDocumentTypes?: readonly DocumentType[]
}

const commercialStage: Record<DocumentType, number> = { quote: 0, customer_order: 1, invoice: 2, sav: -1 }

export function canCreateTicketDocument(
  input: TicketDocumentEligibility,
  documentType: DocumentType
) {
  if (documentType === 'sav') return input.ticketStatus !== 'cancelled'
  return input.ticketStatus !== 'closed'
    && input.ticketStatus !== 'cancelled'
    && !input.existingDocumentTypes.includes(documentType)
    && !(input.activeDocumentTypes ?? input.existingDocumentTypes).some(type => commercialStage[type] > commercialStage[documentType])
}
