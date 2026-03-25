export const catalogItemTypes = ['product', 'service', 'repair_part', 'labor'] as const
export const ticketTypes = ['repair', 'support'] as const
export const ticketStatuses = [
  'new',
  'diagnosis',
  'awaiting_customer_approval',
  'approved',
  'in_progress',
  'waiting_parts',
  'ready_for_pickup',
  'delivered',
  'closed',
  'cancelled'
] as const
export const documentTypes = ['quote', 'invoice', 'receipt', 'credit_note'] as const
export const documentStatuses = ['draft', 'issued', 'paid', 'cancelled'] as const
export const paymentMethods = ['cash', 'card', 'twint', 'bank_transfer'] as const
export const paymentStatuses = ['pending', 'paid', 'refunded', 'cancelled'] as const
export const lineCategoryHints = ['accessory', 'repair', 'service'] as const

export const catalogItemTypeLabels: Record<(typeof catalogItemTypes)[number], string> = {
  product: 'Product',
  service: 'Service',
  repair_part: 'Repair part',
  labor: 'Labor'
}

export const catalogItemTypeColors: Record<(typeof catalogItemTypes)[number], 'info' | 'success' | 'warning' | 'neutral'> = {
  product: 'info',
  service: 'success',
  repair_part: 'warning',
  labor: 'neutral'
}

export const ticketTypeLabels: Record<(typeof ticketTypes)[number], string> = {
  repair: 'Repair',
  support: 'Support'
}

export const ticketTypeColors: Record<(typeof ticketTypes)[number], 'warning' | 'info'> = {
  repair: 'warning',
  support: 'info'
}

export const ticketStatusLabels: Record<(typeof ticketStatuses)[number], string> = {
  new: 'New',
  diagnosis: 'Diagnosis',
  awaiting_customer_approval: 'Awaiting approval',
  approved: 'Approved',
  in_progress: 'In progress',
  waiting_parts: 'Waiting parts',
  ready_for_pickup: 'Ready for pickup',
  delivered: 'Delivered',
  closed: 'Closed',
  cancelled: 'Cancelled'
}

export const ticketStatusColors: Record<(typeof ticketStatuses)[number], 'info' | 'warning' | 'success' | 'neutral' | 'error'> = {
  new: 'info',
  diagnosis: 'warning',
  awaiting_customer_approval: 'warning',
  approved: 'info',
  in_progress: 'info',
  waiting_parts: 'warning',
  ready_for_pickup: 'success',
  delivered: 'success',
  closed: 'neutral',
  cancelled: 'error'
}

export const documentTypeLabels: Record<(typeof documentTypes)[number], string> = {
  quote: 'Quote',
  invoice: 'Invoice',
  receipt: 'Receipt',
  credit_note: 'Credit note'
}

export const documentTypeColors: Record<(typeof documentTypes)[number], 'neutral' | 'info' | 'success' | 'warning'> = {
  quote: 'neutral',
  invoice: 'info',
  receipt: 'success',
  credit_note: 'warning'
}

export const documentStatusLabels: Record<(typeof documentStatuses)[number], string> = {
  draft: 'Draft',
  issued: 'Issued',
  paid: 'Paid',
  cancelled: 'Cancelled'
}

export const documentStatusColors: Record<(typeof documentStatuses)[number], 'neutral' | 'warning' | 'success' | 'error'> = {
  draft: 'neutral',
  issued: 'warning',
  paid: 'success',
  cancelled: 'error'
}

export const paymentMethodLabels: Record<(typeof paymentMethods)[number], string> = {
  cash: 'Cash',
  card: 'Card',
  twint: 'TWINT',
  bank_transfer: 'Bank transfer'
}

export const paymentMethodColors: Record<(typeof paymentMethods)[number], 'success' | 'info' | 'warning' | 'neutral'> = {
  cash: 'success',
  card: 'info',
  twint: 'warning',
  bank_transfer: 'neutral'
}

export const paymentStatusLabels: Record<(typeof paymentStatuses)[number], string> = {
  pending: 'Pending',
  paid: 'Paid',
  refunded: 'Refunded',
  cancelled: 'Cancelled'
}

export const paymentStatusColors: Record<(typeof paymentStatuses)[number], 'warning' | 'success' | 'neutral' | 'error'> = {
  pending: 'warning',
  paid: 'success',
  refunded: 'neutral',
  cancelled: 'error'
}

export const lineCategoryLabels: Record<(typeof lineCategoryHints)[number], string> = {
  accessory: 'Accessory',
  repair: 'Repair',
  service: 'Service'
}

export const lineCategoryColors: Record<(typeof lineCategoryHints)[number], 'info' | 'warning' | 'success'> = {
  accessory: 'info',
  repair: 'warning',
  service: 'success'
}

export const documentTypePrefixes: Record<(typeof documentTypes)[number], string> = {
  quote: 'QUO',
  invoice: 'INV',
  receipt: 'REC',
  credit_note: 'CRN'
}
