export const catalogItemTypes = ['product', 'repair', 'service'] as const
export const catalogArticleCategories = [
  'Accessoires',
  'Smartphones',
  'Tablettes',
  'Ordinateurs',
  'Audio',
  'Charge',
  'Protection',
  'Autre'
] as const
export const catalogRepairCategories = [
  'iPhone',
  'Samsung',
  'iPad',
  'MacBook',
  'PC',
  'Console',
  'Autre'
] as const
export const catalogServiceCategories = [
  'Diagnostic',
  'Support',
  'Transfert',
  'Configuration',
  'Nettoyage',
  'Autre'
] as const
export const catalogServiceKindSuggestions = [
  'Remplacement écran',
  'Remplacement batterie',
  'Port de charge',
  'Caméra arrière',
  'Caméra avant',
  'Face arrière',
  'Châssis / cadre',
  'Haut-parleur oreille',
  'Diagnostic',
  'Transfert de données',
  'Configuration',
  'Nettoyage'
] as const
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
export const documentTypes = ['quote', 'customer_order', 'invoice'] as const
export const documentStatuses = ['draft', 'issued', 'paid', 'cancelled'] as const
export const paymentMethods = ['cash', 'card_twint', 'bank_transfer'] as const
export const paymentStatuses = ['pending', 'paid', 'refunded', 'cancelled'] as const
export const lineCategoryHints = ['accessory', 'repair', 'service'] as const
export const payableDocumentTypes = ['invoice'] as const
export const woocommerceOpenOrderStatuses = ['pending', 'processing', 'on-hold'] as const

export const catalogItemTypeLabels: Record<(typeof catalogItemTypes)[number], string> = {
  product: 'Article',
  repair: 'Réparation',
  service: 'Service'
}

export const catalogItemTypeColors: Record<(typeof catalogItemTypes)[number], 'info' | 'warning' | 'success'> = {
  product: 'info',
  repair: 'warning',
  service: 'success'
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
  invoice: 'Facture'
}

export const documentTypeColors: Record<(typeof documentTypes)[number], 'neutral' | 'info' | 'warning'> = {
  quote: 'neutral',
  customer_order: 'warning',
  invoice: 'info'
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
  card_twint: 'Carte Bancaire / TWINT',
  bank_transfer: 'Virement bancaire'
}

export const paymentMethodColors: Record<(typeof paymentMethods)[number], 'success' | 'info' | 'neutral'> = {
  cash: 'success',
  card_twint: 'info',
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

export const woocommerceOrderStatusLabels: Record<(typeof woocommerceOpenOrderStatuses)[number], string> = {
  'pending': 'Attente paiement',
  'processing': 'En cours',
  'on-hold': 'En attente'
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
  invoice: 'FA'
}

export const vacationEntryTypes = ['full_day', 'half_day_am', 'half_day_pm'] as const
export const vacationEntryStatuses = ['pending', 'approved', 'rejected'] as const

export const vacationEntryTypeLabels: Record<(typeof vacationEntryTypes)[number], string> = {
  full_day: 'Journée complète',
  half_day_am: 'Demi-journée (matin)',
  half_day_pm: 'Demi-journée (après-midi)'
}

export const vacationEntryStatusLabels: Record<(typeof vacationEntryStatuses)[number], string> = {
  pending: 'En attente',
  approved: 'Approuvé',
  rejected: 'Refusé'
}

export const vacationEntryStatusColors: Record<(typeof vacationEntryStatuses)[number], 'warning' | 'success' | 'error'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'error'
}

export const employeeColorPalette = [
  '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#6366f1', '#14b8a6',
  '#e11d48', '#84cc16'
] as const
