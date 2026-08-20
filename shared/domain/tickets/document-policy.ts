import type { DocumentType, TicketStatus } from '../../types/pos'

export type TicketDocumentEligibility = {
  ticketStatus: TicketStatus
  existingDocumentTypes: readonly DocumentType[]
}

export function canCreateTicketDocument(
  input: TicketDocumentEligibility,
  documentType: DocumentType
) {
  return input.ticketStatus !== 'closed'
    && input.ticketStatus !== 'cancelled'
    && !input.existingDocumentTypes.includes(documentType)
}
