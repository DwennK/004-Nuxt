import type { ShopifyOrder } from '../../server/utils/shopify/model'

export const money = (amount: string) => ({ shopMoney: { amount, currencyCode: 'CHF' } })
export const date = '2026-08-20T10:00:00Z'
export function orderFixture(): ShopifyOrder {
  return {
    id: 'gid://shopify/Order/123456', name: '#1001', createdAt: date, updatedAt: date,
    cancelledAt: null, test: false, taxesIncluded: true, currencyCode: 'CHF', presentmentCurrencyCode: 'CHF',
    note: null, email: 'ada@example.test', phone: null,
    billingAddress: { firstName: 'Ada', lastName: 'Lovelace', company: null, address1: 'Rue du Test 1', address2: null, zip: '1200', city: 'Genève', phone: null }, shippingAddress: null,
    displayFinancialStatus: 'PAID', displayFulfillmentStatus: 'UNFULFILLED',
    currentTotalPriceSet: money('108.10'), currentTotalTaxSet: money('8.10'), totalReceivedSet: money('108.10'), totalOutstandingSet: money('0.00'), totalRefundedSet: money('0.00'),
    currentTotalDutiesSet: null, currentTotalAdditionalFeesSet: null, totalTipReceivedSet: money('0.00'),
    lineItems: [{ id: 'gid://shopify/LineItem/1', name: 'Écran iPhone', sku: 'SCREEN-1', quantity: 1, currentQuantity: 1, isGiftCard: false, customAttributes: [], originalTotalSet: money('108.10'), discountAllocations: [], taxLines: [{ rate: 0.081, priceSet: money('8.10') }] }], shippingLines: [],
    transactionsCount: { count: 1, precision: 'EXACT' },
    transactions: [{ id: 'gid://shopify/OrderTransaction/1', kind: 'SALE', status: 'SUCCESS', test: false, gateway: 'shopify_payments', formattedGateway: 'Shopify Payments', createdAt: date, processedAt: date, amountSet: money('108.10') }]
  }
}

export function unpaidOrder() {
  const order = orderFixture()
  order.transactions = []
  order.transactionsCount.count = 0
  order.totalReceivedSet = money('0.00')
  order.totalOutstandingSet = money('108.10')
  order.displayFinancialStatus = 'PENDING'
  return order
}

export const importTables = [
  `CREATE TABLE customers (id INTEGER PRIMARY KEY AUTOINCREMENT, first_name TEXT NOT NULL, last_name TEXT NOT NULL, company_name TEXT, phone TEXT NOT NULL, email TEXT NOT NULL, address_line_1 TEXT, address_line_2 TEXT, postal_code TEXT, city TEXT, notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE documents (id INTEGER PRIMARY KEY AUTOINCREMENT, document_number TEXT NOT NULL UNIQUE, type TEXT NOT NULL, status TEXT NOT NULL, customer_id INTEGER NOT NULL REFERENCES customers(id), ticket_id INTEGER, issued_at TEXT NOT NULL, subtotal INTEGER NOT NULL, tax_amount INTEGER NOT NULL, total INTEGER NOT NULL, notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE document_lines (id INTEGER PRIMARY KEY AUTOINCREMENT, document_id INTEGER NOT NULL REFERENCES documents(id), catalog_item_id INTEGER, label TEXT NOT NULL, quantity INTEGER NOT NULL, unit_price INTEGER NOT NULL, vat_rate REAL NOT NULL, line_total INTEGER NOT NULL, category_hint TEXT)`,
  `CREATE TABLE payments (id INTEGER PRIMARY KEY AUTOINCREMENT, customer_id INTEGER, document_id INTEGER NOT NULL REFERENCES documents(id), method TEXT NOT NULL, status TEXT NOT NULL, amount INTEGER NOT NULL, paid_at TEXT NOT NULL, notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE document_imports (id INTEGER PRIMARY KEY AUTOINCREMENT, document_id INTEGER NOT NULL REFERENCES documents(id), source TEXT NOT NULL, external_id TEXT NOT NULL, external_number TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE UNIQUE INDEX document_imports_source_external_id_idx ON document_imports(source, external_id)`,
  `CREATE TABLE number_sequences (scope TEXT PRIMARY KEY, last_value INTEGER NOT NULL)`
]
