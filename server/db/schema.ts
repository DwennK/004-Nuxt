import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const customers = sqliteTable('customers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  phone: text('phone'),
  email: text('email').notNull(),
  address: text('address'),
  postalCode: text('postal_code'),
  city: text('city'),
  comment: text('comment')
}, table => ({
  emailIdx: uniqueIndex('customers_email_idx').on(table.email),
  nameIdx: index('customers_name_idx').on(table.name)
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
