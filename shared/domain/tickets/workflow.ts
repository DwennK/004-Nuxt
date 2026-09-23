import type { TicketStatus, TicketType } from '../../types/pos'

export const ticketStatusTransitions = {
  new: ['diagnosis', 'awaiting_customer_approval', 'cancelled'],
  diagnosis: ['awaiting_customer_approval', 'approved', 'cancelled'],
  awaiting_customer_approval: ['approved', 'diagnosis', 'cancelled'],
  approved: ['in_progress', 'waiting_parts', 'cancelled'],
  in_progress: ['waiting_parts', 'ready_for_pickup', 'cancelled'],
  waiting_parts: ['in_progress', 'ready_for_pickup', 'cancelled'],
  ready_for_pickup: ['delivered', 'in_progress'],
  delivered: ['closed', 'ready_for_pickup'],
  closed: [],
  cancelled: []
} as const satisfies Record<TicketStatus, readonly TicketStatus[]>

const saleStatusTransitions = {
  new: ['approved', 'in_progress', 'cancelled'],
  diagnosis: ['approved', 'in_progress', 'cancelled'],
  awaiting_customer_approval: ['approved', 'cancelled'],
  approved: ['in_progress', 'ready_for_pickup', 'delivered', 'cancelled'],
  in_progress: ['ready_for_pickup', 'delivered', 'cancelled'],
  waiting_parts: ['in_progress', 'ready_for_pickup', 'cancelled'],
  ready_for_pickup: ['delivered', 'in_progress'],
  delivered: ['closed', 'ready_for_pickup'],
  closed: [],
  cancelled: []
} as const satisfies Record<TicketStatus, readonly TicketStatus[]>

export function getTicketStatusTransitions(from: TicketStatus, type: TicketType = 'repair'): readonly TicketStatus[] {
  return (type === 'sale' ? saleStatusTransitions : ticketStatusTransitions)[from]
}

export function canTransitionTicketStatus(from: TicketStatus, to: TicketStatus, type: TicketType = 'repair') {
  return from === to || getTicketStatusTransitions(from, type).includes(to)
}
