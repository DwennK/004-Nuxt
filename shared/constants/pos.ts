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
export const ticketWorkflowSteps = ['reception', 'diagnostic', 'workshop', 'pickup', 'closure'] as const
export const documentTypes = ['quote', 'customer_order', 'invoice', 'receipt'] as const
export const documentStatuses = ['draft', 'issued', 'paid', 'cancelled'] as const
export const paymentMethods = ['cash', 'card', 'twint', 'bank_transfer'] as const
export const paymentStatuses = ['pending', 'paid', 'refunded', 'cancelled'] as const
export const lineCategoryHints = ['accessory', 'repair', 'service'] as const
export const payableDocumentTypes = ['invoice', 'receipt'] as const

export const catalogItemTypeLabels: Record<(typeof catalogItemTypes)[number], string> = {
  product: 'Produit',
  service: 'Service',
  repair_part: 'Pièce de réparation',
  labor: 'Main-d’oeuvre'
}

export const catalogItemTypeColors: Record<(typeof catalogItemTypes)[number], 'info' | 'success' | 'warning' | 'neutral'> = {
  product: 'info',
  service: 'success',
  repair_part: 'warning',
  labor: 'neutral'
}

export const ticketTypeLabels: Record<(typeof ticketTypes)[number], string> = {
  repair: 'Réparation',
  support: 'Support'
}

export const ticketTypeColors: Record<(typeof ticketTypes)[number], 'warning' | 'info'> = {
  repair: 'warning',
  support: 'info'
}

export const ticketStatusLabels: Record<(typeof ticketStatuses)[number], string> = {
  new: 'Nouveau',
  diagnosis: 'Diagnostic',
  awaiting_customer_approval: 'En attente d’accord client',
  approved: 'Approuvé',
  in_progress: 'En cours',
  waiting_parts: 'En attente de pièces',
  ready_for_pickup: 'Prêt pour retrait',
  delivered: 'Livré',
  closed: 'Clôturé',
  cancelled: 'Annulé'
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

export const ticketWorkflowStepLabels: Record<(typeof ticketWorkflowSteps)[number], string> = {
  reception: 'Réception',
  diagnostic: 'Diagnostic',
  workshop: 'Atelier',
  pickup: 'Retrait',
  closure: 'Clôture'
}

export const documentTypeLabels: Record<(typeof documentTypes)[number], string> = {
  quote: 'Devis',
  customer_order: 'Commande',
  invoice: 'Facture',
  receipt: 'Reçu'
}

export const documentTypeColors: Record<(typeof documentTypes)[number], 'neutral' | 'info' | 'success' | 'warning'> = {
  quote: 'neutral',
  customer_order: 'warning',
  invoice: 'info',
  receipt: 'success'
}

export const documentStatusLabels: Record<(typeof documentStatuses)[number], string> = {
  draft: 'Brouillon',
  issued: 'Émis',
  paid: 'Payé',
  cancelled: 'Annulé'
}

export const documentStatusColors: Record<(typeof documentStatuses)[number], 'neutral' | 'warning' | 'success' | 'error'> = {
  draft: 'neutral',
  issued: 'warning',
  paid: 'success',
  cancelled: 'error'
}

export const paymentMethodLabels: Record<(typeof paymentMethods)[number], string> = {
  cash: 'Espèces',
  card: 'Carte',
  twint: 'TWINT',
  bank_transfer: 'Virement bancaire'
}

export const paymentMethodColors: Record<(typeof paymentMethods)[number], 'success' | 'info' | 'warning' | 'neutral'> = {
  cash: 'success',
  card: 'info',
  twint: 'warning',
  bank_transfer: 'neutral'
}

export const paymentStatusLabels: Record<(typeof paymentStatuses)[number], string> = {
  pending: 'En attente',
  paid: 'Payé',
  refunded: 'Remboursé',
  cancelled: 'Annulé'
}

export const paymentStatusColors: Record<(typeof paymentStatuses)[number], 'warning' | 'success' | 'neutral' | 'error'> = {
  pending: 'warning',
  paid: 'success',
  refunded: 'neutral',
  cancelled: 'error'
}

export const lineCategoryLabels: Record<(typeof lineCategoryHints)[number], string> = {
  accessory: 'Accessoire',
  repair: 'Réparation',
  service: 'Service'
}

export const lineCategoryColors: Record<(typeof lineCategoryHints)[number], 'info' | 'warning' | 'success'> = {
  accessory: 'info',
  repair: 'warning',
  service: 'success'
}

export const documentTypePrefixes: Record<(typeof documentTypes)[number], string> = {
  quote: 'DE',
  customer_order: 'CO',
  invoice: 'FA',
  receipt: 'RE'
}
