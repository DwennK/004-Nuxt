import type {
  catalogItemTypes,
  documentStatuses,
  documentTypes,
  lineCategoryHints,
  paymentMethods,
  paymentStatuses,
  ticketStatuses,
  ticketTypes,
  ticketWorkflowSteps
} from '../constants/pos'

export type CatalogItemType = (typeof catalogItemTypes)[number]
export type TicketType = (typeof ticketTypes)[number]
export type TicketStatus = (typeof ticketStatuses)[number]
export type TicketWorkflowStep = (typeof ticketWorkflowSteps)[number]
export type DocumentType = (typeof documentTypes)[number]
export type DocumentStatus = (typeof documentStatuses)[number]
export type PaymentMethod = (typeof paymentMethods)[number]
export type PaymentStatus = (typeof paymentStatuses)[number]
export type LineCategoryHint = (typeof lineCategoryHints)[number]
export type RepairSuggestionIssueKey
  = | 'screen'
    | 'battery'
    | 'chassis'
    | 'back_glass'
    | 'rear_camera'
    | 'front_camera'
    | 'camera_lens'
    | 'charge_port'
    | 'earpiece'

export interface CustomerUpsertInput {
  displayName?: string | null
  firstName?: string | null
  lastName?: string | null
  companyName?: string | null
  phone?: string | null
  email?: string | null
  addressLine1?: string | null
  addressLine2?: string | null
  postalCode?: string | null
  city?: string | null
  notes?: string | null
}

export interface CustomerFormValue {
  displayName: string
  firstName: string
  lastName: string
  companyName: string
  phone: string
  email: string
  addressLine1: string
  addressLine2: string
  postalCode: string
  city: string
  notes: string
}

export interface CustomerRecord {
  id: number
  firstName: string
  lastName: string
  companyName: string | null
  phone: string
  email: string
  addressLine1: string | null
  addressLine2: string | null
  postalCode: string | null
  city: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
  displayName: string
}

export interface CatalogItemRecord {
  id: number
  name: string
  sku: string | null
  type: CatalogItemType
  defaultPrice: number
  vatRate: number
  isActive: boolean
  isQuickPick: boolean
  createdAt: string
  updatedAt: string
}

export interface RepairSuggestion {
  brand: string
  family: string
  model: string
  issueKey: RepairSuggestionIssueKey
  issueLabel: string
  priceCents: number
  keywords: string[]
}

export interface TicketRecord {
  id: number
  ticketNumber: string
  customerId: number
  type: TicketType
  status: TicketStatus
  brand: string | null
  model: string | null
  serialNumber: string | null
  imei: string | null
  accessCode: string | null
  simCode: string | null
  issueDescription: string
  internalNotes: string | null
  openedAt: string
  closedAt: string | null
  createdAt: string
  updatedAt: string
}

export type TicketEventKind
  = | 'ticket_created'
    | 'ticket_status_changed'
    | 'ticket_closed'
    | 'document_created'
    | 'payment_recorded'

export interface TicketEvent {
  id: number | string
  ticketId: number
  kind: TicketEventKind
  label: string
  note: string | null
  metadata: Record<string, unknown> | null
  occurredAt: string
  createdAt: string
  isSynthetic?: boolean
}

export interface TicketWorkflowAction {
  id: string
  kind: 'status' | 'close'
  label: string
  description: string
  icon: string
  color: 'neutral' | 'warning' | 'success' | 'info' | 'error'
  targetStatus: TicketStatus | null
}

export interface TicketWorkflowSummary {
  step: TicketWorkflowStep
  stepLabel: string
  currentStatusLabel: string
  nextActionLabel: string
  blockerLabel: string | null
  actions: TicketWorkflowAction[]
}

export interface TicketCommercialSummary {
  quote: DocumentRecord | null
  invoice: DocumentRecord | null
  latestDocument: DocumentRecord | null
  payableDocument: DocumentRecord | null
  totalPaid: number
  balanceDue: number
  paymentStateLabel: string
}

export interface DocumentLineRecord {
  id: number
  documentId: number
  catalogItemId: number | null
  label: string
  quantity: number
  unitPrice: number
  vatRate: number
  lineTotal: number
  categoryHint: LineCategoryHint | null
}

export interface PaymentRecord {
  id: number
  customerId: number | null
  documentId: number
  method: PaymentMethod
  status: PaymentStatus
  amount: number
  paidAt: string
  reference: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface DocumentRecord {
  id: number
  documentNumber: string
  type: DocumentType
  status: DocumentStatus
  customerId: number
  ticketId: number | null
  issuedAt: string
  subtotal: number
  taxAmount: number
  total: number
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface DocumentDetail extends DocumentRecord {
  customer: CustomerRecord
  ticket: TicketRecord | null
  lines: DocumentLineRecord[]
  payments: PaymentRecord[]
}

export interface TicketDetail extends TicketRecord {
  customer: CustomerRecord
  documents: DocumentRecord[]
  payments: PaymentRecord[]
  events: TicketEvent[]
  workflow: TicketWorkflowSummary
  commercialSummary: TicketCommercialSummary
}

export interface TicketListItem extends TicketRecord {
  customerName: string
  documentCount: number
}

export interface DocumentListItem extends DocumentRecord {
  customerName: string
  ticketNumber: string | null
  paidAmount: number
  balanceDue: number
}

export interface PaymentListItem extends PaymentRecord {
  customerName: string | null
  documentNumber: string
  documentType: DocumentType
}

export interface DailySummary {
  date: string
  totalPaid: number
  paidDocuments: Array<{
    id: number
    documentNumber: string
    type: DocumentType
    status: DocumentStatus
    customerName: string
    total: number
    paidAmountToday: number
    paidAt: string
  }>
  totalsByMethod: Array<{
    method: PaymentMethod
    total: number
  }>
  ticketStats: {
    openCount: number
    openedToday: number
    closedToday: number
  }
  turnoverByCategory: Array<{
    category: LineCategoryHint
    total: number
  }>
}
