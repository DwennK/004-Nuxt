import { sql } from 'drizzle-orm'
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const customers = sqliteTable('customers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  companyName: text('company_name'),
  phone: text('phone').notNull(),
  email: text('email').notNull(),
  addressLine1: text('address_line_1'),
  addressLine2: text('address_line_2'),
  postalCode: text('postal_code'),
  city: text('city'),
  notes: text('notes'),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`)
}, table => ({
  emailIdx: index('customers_email_idx').on(table.email),
  lastNameIdx: index('customers_last_name_idx').on(table.lastName),
  phoneIdx: index('customers_phone_idx').on(table.phone)
}))

export const companySettings = sqliteTable('company_settings', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  address: text('address'),
  postalCode: text('postal_code'),
  city: text('city'),
  countryCode: text('country_code'),
  phone: text('phone'),
  email: text('email'),
  website: text('website'),
  vatNumber: text('vat_number'),
  bankName: text('bank_name'),
  iban: text('iban'),
  paymentTerms: text('payment_terms'),
  footerNotes: text('footer_notes'),
  customerSmsTemplatesJson: text('customer_sms_templates_json'),
  logoDataUrl: text('logo_data_url'),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`)
})

export const catalogItems = sqliteTable('catalog_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  sku: text('sku'),
  type: text('type', { enum: ['product', 'repair', 'service'] }).notNull(),
  category: text('category').notNull().default('Autre'),
  brand: text('brand'),
  model: text('model'),
  serviceKind: text('service_kind'),
  keywordsJson: text('keywords_json'),
  defaultPrice: integer('default_price').notNull(),
  vatRate: real('vat_rate').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`)
}, table => ({
  nameIdx: index('catalog_items_name_idx').on(table.name),
  skuIdx: uniqueIndex('catalog_items_sku_idx').on(table.sku),
  typeIdx: index('catalog_items_type_idx').on(table.type),
  categoryIdx: index('catalog_items_category_idx').on(table.category),
  brandIdx: index('catalog_items_brand_idx').on(table.brand),
  modelIdx: index('catalog_items_model_idx').on(table.model),
  serviceKindIdx: index('catalog_items_service_kind_idx').on(table.serviceKind),
  activeIdx: index('catalog_items_is_active_idx').on(table.isActive)
}))

export const tickets = sqliteTable('tickets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ticketNumber: text('ticket_number').notNull(),
  customerId: integer('customer_id').notNull().references(() => customers.id, { onDelete: 'restrict' }),
  type: text('type', { enum: ['repair', 'support'] }).notNull(),
  status: text('status', {
    enum: [
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
    ]
  }).notNull().default('new'),
  brand: text('brand'),
  model: text('model'),
  serialNumber: text('serial_number'),
  imei: text('imei'),
  accessCode: text('access_code'),
  simCode: text('sim_code'),
  issueDescription: text('issue_description').notNull(),
  internalNotes: text('internal_notes'),
  openedAt: text('opened_at').notNull(),
  closedAt: text('closed_at'),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`)
}, table => ({
  numberIdx: uniqueIndex('tickets_ticket_number_idx').on(table.ticketNumber),
  customerIdx: index('tickets_customer_id_idx').on(table.customerId),
  statusIdx: index('tickets_status_idx').on(table.status),
  openedAtIdx: index('tickets_opened_at_idx').on(table.openedAt),
  statusOpenedAtIdIdx: index('tickets_status_opened_at_id_idx').on(table.status, table.openedAt, table.id)
}))

export const ticketEvents = sqliteTable('ticket_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ticketId: integer('ticket_id').notNull().references(() => tickets.id, { onDelete: 'cascade' }),
  kind: text('kind', {
    enum: ['ticket_created', 'ticket_status_changed', 'ticket_closed', 'document_created', 'payment_recorded', 'ticket_sms_qr_opened']
  }).notNull(),
  label: text('label').notNull(),
  note: text('note'),
  metadataJson: text('metadata_json'),
  occurredAt: text('occurred_at').notNull(),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`)
}, table => ({
  ticketIdx: index('ticket_events_ticket_id_idx').on(table.ticketId),
  occurredAtIdx: index('ticket_events_occurred_at_idx').on(table.occurredAt),
  kindIdx: index('ticket_events_kind_idx').on(table.kind)
}))

export const documents = sqliteTable('documents', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  documentNumber: text('document_number').notNull(),
  type: text('type', { enum: ['quote', 'customer_order', 'invoice'] }).notNull(),
  status: text('status', { enum: ['draft', 'issued', 'paid', 'cancelled'] }).notNull().default('draft'),
  customerId: integer('customer_id').notNull().references(() => customers.id, { onDelete: 'restrict' }),
  ticketId: integer('ticket_id').references(() => tickets.id, { onDelete: 'set null' }),
  issuedAt: text('issued_at').notNull(),
  subtotal: integer('subtotal').notNull(),
  taxAmount: integer('tax_amount').notNull(),
  total: integer('total').notNull(),
  notes: text('notes'),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`)
}, table => ({
  numberIdx: uniqueIndex('documents_document_number_idx').on(table.documentNumber),
  customerIdx: index('documents_customer_id_idx').on(table.customerId),
  ticketIdx: index('documents_ticket_id_idx').on(table.ticketId),
  typeIdx: index('documents_type_idx').on(table.type),
  statusIdx: index('documents_status_idx').on(table.status),
  issuedAtIdx: index('documents_issued_at_idx').on(table.issuedAt),
  issuedAtIdIdx: index('documents_issued_at_id_idx').on(table.issuedAt, table.id)
}))

export const numberSequences = sqliteTable('number_sequences', {
  scope: text('scope').primaryKey(),
  lastValue: integer('last_value').notNull()
})

export const documentLines = sqliteTable('document_lines', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  documentId: integer('document_id').notNull().references(() => documents.id, { onDelete: 'cascade' }),
  catalogItemId: integer('catalog_item_id').references(() => catalogItems.id, { onDelete: 'set null' }),
  label: text('label').notNull(),
  quantity: integer('quantity').notNull(),
  unitPrice: integer('unit_price').notNull(),
  vatRate: real('vat_rate').notNull(),
  lineTotal: integer('line_total').notNull(),
  categoryHint: text('category_hint', { enum: ['accessory', 'repair', 'service'] })
}, table => ({
  documentIdx: index('document_lines_document_id_idx').on(table.documentId),
  catalogItemIdx: index('document_lines_catalog_item_id_idx').on(table.catalogItemId),
  categoryIdx: index('document_lines_category_hint_idx').on(table.categoryHint)
}))

export const documentImports = sqliteTable('document_imports', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  documentId: integer('document_id').notNull().references(() => documents.id, { onDelete: 'cascade' }),
  source: text('source', { enum: ['woocommerce_order'] }).notNull(),
  externalId: text('external_id').notNull(),
  externalNumber: text('external_number').notNull(),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`)
}, table => ({
  documentIdx: index('document_imports_document_id_idx').on(table.documentId),
  sourceExternalIdIdx: uniqueIndex('document_imports_source_external_id_idx').on(table.source, table.externalId),
  sourceExternalNumberIdx: index('document_imports_source_external_number_idx').on(table.source, table.externalNumber)
}))

export const ticketLines = sqliteTable('ticket_lines', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ticketId: integer('ticket_id').notNull().references(() => tickets.id, { onDelete: 'cascade' }),
  catalogItemId: integer('catalog_item_id').references(() => catalogItems.id, { onDelete: 'set null' }),
  label: text('label').notNull(),
  quantity: integer('quantity').notNull(),
  unitPrice: integer('unit_price').notNull(),
  vatRate: real('vat_rate').notNull(),
  lineTotal: integer('line_total').notNull(),
  categoryHint: text('category_hint', { enum: ['accessory', 'repair', 'service'] })
}, table => ({
  ticketIdx: index('ticket_lines_ticket_id_idx').on(table.ticketId),
  catalogItemIdx: index('ticket_lines_catalog_item_id_idx').on(table.catalogItemId),
  categoryIdx: index('ticket_lines_category_hint_idx').on(table.categoryHint)
}))

export const payments = sqliteTable('payments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  customerId: integer('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  documentId: integer('document_id').notNull().references(() => documents.id, { onDelete: 'cascade' }),
  method: text('method', { enum: ['cash', 'card_twint', 'bank_transfer', 'stripe'] }).notNull(),
  status: text('status', { enum: ['pending', 'paid', 'refunded', 'cancelled'] }).notNull().default('pending'),
  amount: integer('amount').notNull(),
  paidAt: text('paid_at').notNull(),
  notes: text('notes'),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`)
}, table => ({
  documentIdx: index('payments_document_id_idx').on(table.documentId),
  paidAtIdx: index('payments_paid_at_idx').on(table.paidAt),
  methodIdx: index('payments_method_idx').on(table.method),
  statusIdx: index('payments_status_idx').on(table.status),
  customerIdx: index('payments_customer_id_idx').on(table.customerId),
  documentPaidAtIdIdx: index('payments_document_id_paid_at_id_idx').on(table.documentId, table.paidAt, table.id)
}))

export const smartphoneStocks = sqliteTable('smartphone_stocks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  model: text('model').notNull(),
  imei: text('imei'),
  sku: text('sku'),
  capacity: text('capacity').notNull(),
  stockedAt: text('stocked_at').notNull(),
  sold: integer('sold', { mode: 'boolean' }).notNull().default(false)
}, table => ({
  modelIdx: index('smartphone_stocks_model_idx').on(table.model),
  imeiIdx: uniqueIndex('smartphone_stocks_imei_idx').on(table.imei),
  skuIdx: uniqueIndex('smartphone_stocks_sku_idx').on(table.sku)
}))

export const employees = sqliteTable('employees', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  email: text('email'),
  color: text('color').notNull(),
  vacationDaysPerYear: integer('vacation_days_per_year').notNull().default(25),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`)
}, table => ({
  lastNameIdx: index('employees_last_name_idx').on(table.lastName),
  activeIdx: index('employees_is_active_idx').on(table.isActive)
}))

export const vacationEntries = sqliteTable('vacation_entries', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  employeeId: integer('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  startDate: text('start_date').notNull(),
  endDate: text('end_date').notNull(),
  type: text('type', { enum: ['full_day', 'half_day_am', 'half_day_pm'] }).notNull().default('full_day'),
  status: text('status', { enum: ['pending', 'approved', 'rejected'] }).notNull().default('pending'),
  businessDays: real('business_days').notNull(),
  notes: text('notes'),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`)
}, table => ({
  employeeIdx: index('vacation_entries_employee_id_idx').on(table.employeeId),
  startDateIdx: index('vacation_entries_start_date_idx').on(table.startDate),
  endDateIdx: index('vacation_entries_end_date_idx').on(table.endDate),
  statusIdx: index('vacation_entries_status_idx').on(table.status)
}))

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`)
}, table => ({
  emailIdx: uniqueIndex('users_email_idx').on(table.email)
}))

export const smartphoneReservationRequests = sqliteTable('smartphone_reservation_requests', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  phone: text('phone').notNull(),
  model: text('model').notNull(),
  storage: text('storage').notNull(),
  requestedAt: text('requested_at').notNull(),
  status: text('status', { enum: ['pending', 'contacted', 'sold'] }).notNull().default('pending'),
  notes: text('notes')
}, table => ({
  nameIdx: index('smartphone_reservation_requests_name_idx').on(table.name),
  statusIdx: index('smartphone_reservation_requests_status_idx').on(table.status)
}))
