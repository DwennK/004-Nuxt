import type {
  catalogItemTypes,
  documentStatuses,
  documentTypes,
  lineCategoryHints,
  paymentMethods,
  paymentStatuses,
  ticketStatuses,
  ticketTypes
} from '../constants/pos'

export type CatalogItemType = (typeof catalogItemTypes)[number]
export type TicketType = (typeof ticketTypes)[number]
export type TicketStatus = (typeof ticketStatuses)[number]
export type DocumentType = (typeof documentTypes)[number]
export type DocumentStatus = (typeof documentStatuses)[number]
export type PaymentMethod = (typeof paymentMethods)[number]
export type PaymentStatus = (typeof paymentStatuses)[number]
export type LineCategoryHint = (typeof lineCategoryHints)[number]

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
  createdAt: string
  updatedAt: string
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
