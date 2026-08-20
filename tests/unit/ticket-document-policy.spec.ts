import { describe, expect, it } from 'vitest'
import { canCreateTicketDocument } from '../../shared/domain/tickets/document-policy'

describe('ticket document eligibility', () => {
  it('allows one document of each commercial type on a mutable ticket', () => {
    const input = {
      ticketStatus: 'in_progress' as const,
      existingDocumentTypes: ['quote'] as const
    }

    expect(canCreateTicketDocument(input, 'quote')).toBe(false)
    expect(canCreateTicketDocument(input, 'customer_order')).toBe(true)
    expect(canCreateTicketDocument(input, 'invoice')).toBe(true)
  })

  it('rejects all new documents on terminal tickets', () => {
    expect(canCreateTicketDocument({
      ticketStatus: 'closed',
      existingDocumentTypes: []
    }, 'invoice')).toBe(false)
    expect(canCreateTicketDocument({
      ticketStatus: 'cancelled',
      existingDocumentTypes: []
    }, 'quote')).toBe(false)
  })
})
