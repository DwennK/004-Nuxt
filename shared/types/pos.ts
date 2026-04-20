import type {
  catalogItemTypes,
  documentStatuses,
  documentTypes,
  lineCategoryHints,
  paymentMethods,
  paymentStatuses,
  ticketStatuses,
  ticketTypes,
  ticketWorkflowSteps,
  vacationEntryStatuses,
  vacationEntryTypes
} from '../constants/pos'

export type CatalogItemType = (typeof catalogItemTypes)[number]
export type TicketType = (typeof ticketTypes)[number]
export type TicketStatus = (typeof ticketStatuses)[number]
export type TicketWorkflowStep = (typeof ticketWorkflowSteps)[number]
export type DocumentType = (typeof documentTypes)[number]
export type DocumentStatus = (typeof documentStatuses)[number]
export type PrintProfile = 'a4' | 'thermal'
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
  category: string
  brand: string | null
  model: string | null
  serviceKind: string | null
  keywords: string[]
  defaultPrice: number
  vatRate: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface CatalogItemInput {
  name: string
  sku: string | null
  type: CatalogItemType
  category: string
  brand: string | null
  model: string | null
  serviceKind: string | null
  keywords: string[]
  defaultPrice: number
  vatRate: number
  isActive: boolean
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
    | 'ticket_sms_qr_opened'

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
  customerOrder: DocumentRecord | null
  invoice: DocumentRecord | null
  latestDocument: DocumentRecord | null
  payableDocument: DocumentRecord | null
  totalPaid: number
  balanceDue: number
  paymentStateLabel: string
}

export interface CommercialLineRecord {
  catalogItemId: number | null
  label: string
  quantity: number
  unitPrice: number
  vatRate: number
  lineTotal: number
  categoryHint: LineCategoryHint | null
}

export interface TicketLineRecord extends CommercialLineRecord {
  id: number
  ticketId: number
}

export interface DocumentLineRecord extends CommercialLineRecord {
  id: number
  documentId: number
}

export interface PaymentRecord {
  id: number
  customerId: number | null
  documentId: number
  method: PaymentMethod
  status: PaymentStatus
  amount: number
  paidAt: string
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
  lines: TicketLineRecord[]
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

export interface PaginatedResponse<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
}

export interface DocumentListResponse extends PaginatedResponse<DocumentListItem> {
  summary: {
    paidCount: number
    totalBalanceDue: number
  }
}

export interface TicketListResponse extends PaginatedResponse<TicketListItem> {
  summary: {
    openCount: number
    readyCount: number
  }
}

export type CustomerListResponse = PaginatedResponse<CustomerRecord>

export type CatalogItemListResponse = PaginatedResponse<CatalogItemRecord>

export interface PaymentListItem extends PaymentRecord {
  customerName: string | null
  documentNumber: string
  documentType: DocumentType
}

export interface DocumentEmailInput {
  to: string
  subject: string
  message: string
}

export type VacationEntryType = (typeof vacationEntryTypes)[number]
export type VacationEntryStatus = (typeof vacationEntryStatuses)[number]

export interface EmployeeRecord {
  id: number
  firstName: string
  lastName: string
  email: string | null
  color: string
  displayName: string
  initials: string
  vacationDaysPerYear: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface VacationEntryRecord {
  id: number
  employeeId: number
  startDate: string
  endDate: string
  type: VacationEntryType
  status: VacationEntryStatus
  businessDays: number
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface VacationEntryListItem extends VacationEntryRecord {
  employeeName: string
  employeeColor: string
  employeeInitials: string
}

export interface EmployeeVacationSummary {
  employee: EmployeeRecord
  year: number
  totalDays: number
  usedDays: number
  pendingDays: number
  remainingDays: number
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

export interface HomeActivityItem {
  id: string
  kind: 'payment' | 'ticket' | 'document'
  title: string
  subtitle: string
  occurredAt: string
  to: string
  amount?: number
  badgeLabel?: string
  badgeColor?: 'neutral' | 'info' | 'warning' | 'success' | 'error'
}

export interface HomePriorityItem {
  id: 'due-documents' | 'ready-tickets' | 'open-tickets' | 'reports'
  title: string
  value: string
  description: string
  to: string
  badgeLabel: string
  badgeColor: 'neutral' | 'info' | 'warning' | 'success' | 'error'
}

export interface HomeReadyTicketItem {
  id: number
  ticketNumber: string
  customerName: string
  issueDescription: string
  brand: string | null
  model: string | null
  openedAt: string
  status: TicketStatus
}

export interface HomeDueDocumentItem {
  id: number
  documentNumber: string
  customerName: string
  issuedAt: string
  total: number
  balanceDue: number
  type: DocumentType
}

export interface HomeOverview {
  date: string
  summary: {
    totalPaid: number
    totalBalanceDue: number
    dueDocumentCount: number
    openTicketCount: number
    openedToday: number
    readyForPickupCount: number
  }
  cashbox: {
    totalPaid: number
    latestPaymentAt: string | null
    methods: Array<{
      method: PaymentMethod
      total: number
    }>
  }
  priorities: HomePriorityItem[]
  activity: HomeActivityItem[]
  readyTickets: HomeReadyTicketItem[]
  dueDocuments: HomeDueDocumentItem[]
}

export interface ReportsOverview {
  range: {
    startDate: string
    endDate: string
    labels: string[]
  }
  kpis: {
    totalPaid: number
    paidToday: number
    averagePerDay: number
    openTickets: number
  }
  paymentsByDay: Array<{
    date: string
    label: string
    total: number
    cash: number
    cardTwint: number
    bankTransfer: number
  }>
  paymentPeriods: Array<{
    key: 'week' | 'month' | 'years'
    label: string
    description: string
    buckets: Array<{
      date: string
      label: string
      tooltipLabel: string
      total: number
      cash: number
      cardTwint: number
      bankTransfer: number
    }>
  }>
  turnoverByCategory: Array<{
    category: LineCategoryHint
    label: string
    total: number
  }>
  topCustomers: Array<{
    customerId: number
    customerName: string
    total: number
    documentCount: number
  }>
  topItems: Array<{
    key: string
    label: string
    category: LineCategoryHint | null
    total: number
    quantity: number
  }>
  ticketFlowByDay: Array<{
    date: string
    label: string
    opened: number
    closed: number
  }>
}
