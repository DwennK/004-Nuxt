import { describe, expect, it } from 'vitest'
import {
  canTransitionTicketStatus,
  ticketStatusTransitions
} from '../../shared/domain/tickets/workflow'
import { ticketCreateInputSchema } from '../../shared/validation/pos'

describe('ticket workflow policy', () => {
  it('allows the operational happy path', () => {
    const path = [
      'new',
      'diagnosis',
      'awaiting_customer_approval',
      'approved',
      'in_progress',
      'ready_for_pickup',
      'delivered',
      'closed'
    ] as const

    for (let index = 1; index < path.length; index += 1) {
      expect(canTransitionTicketStatus(path[index - 1]!, path[index]!)).toBe(true)
    }
  })

  it('allows idempotent status writes and rejects workflow jumps', () => {
    expect(canTransitionTicketStatus('diagnosis', 'diagnosis')).toBe(true)
    expect(canTransitionTicketStatus('new', 'closed')).toBe(false)
    expect(canTransitionTicketStatus('cancelled', 'in_progress')).toBe(false)
    expect(canTransitionTicketStatus('closed', 'new')).toBe(false)
  })

  it('keeps terminal statuses terminal', () => {
    expect(ticketStatusTransitions.closed).toEqual([])
    expect(ticketStatusTransitions.cancelled).toEqual([])
  })

  it('only accepts new as the initial status', () => {
    const input = {
      customerId: 1,
      type: 'repair',
      issueDescription: 'Écran cassé',
      openedAt: '2026-08-20T10:00:00.000Z'
    }

    expect(ticketCreateInputSchema.parse(input)).toMatchObject({
      status: 'new',
      closedAt: null
    })
    expect(ticketCreateInputSchema.safeParse({ ...input, status: 'closed' }).success).toBe(false)
    expect(ticketCreateInputSchema.safeParse({ ...input, closedAt: input.openedAt }).success).toBe(false)
  })
})
