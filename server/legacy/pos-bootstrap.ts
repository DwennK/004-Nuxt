// Local break-glass compatibility only. Production uses reviewed migrations.
import { eq, sql } from 'drizzle-orm'
import { catalogItems, companySettings, customers, documentLines, documents, payments, tickets } from '~~/server/db/schema'
import { calculateCommercialTotals } from '~~/shared/domain/commercial/money'
import { splitLegacyName } from '~~/shared/lib/text'
import { toIsoDateTime } from '~~/shared/utils/pos'
import { useDb, useTursoClient } from '../utils/turso'
import { buildRepairCatalogSeedItems } from '../utils/pos/repair-service-seed'

async function ensureCompanySettingsRow() {
  const db = useDb()
  const rows = await db.select({ id: companySettings.id })
    .from(companySettings)
    .where(eq(companySettings.id, 1))
    .limit(1)

  if (rows[0]) {
    return
  }

  const now = toIsoDateTime()

  await db.insert(companySettings).values({
    id: 1,
    name: 'Microwest',
    address: null,
    postalCode: null,
    city: null,
    countryCode: 'CH',
    phone: null,
    email: null,
    website: null,
    vatNumber: null,
    bankName: null,
    iban: null,
    paymentTerms: null,
    footerNotes: null,
    logoDataUrl: null,
    createdAt: now,
    updatedAt: now
  })
}

async function createPosTables() {
  const client = useTursoClient()

  await client.batch([
    `
      CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        company_name TEXT,
        phone TEXT NOT NULL,
        email TEXT NOT NULL,
        address_line_1 TEXT,
        address_line_2 TEXT,
        postal_code TEXT,
        city TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS catalog_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        sku TEXT,
        type TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'Autre',
        brand TEXT,
        model TEXT,
        service_kind TEXT,
        keywords_json TEXT,
        default_price INTEGER NOT NULL,
        vat_rate REAL NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS company_settings (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        address TEXT,
        postal_code TEXT,
        city TEXT,
        country_code TEXT,
        phone TEXT,
        email TEXT,
        website TEXT,
        vat_number TEXT,
        bank_name TEXT,
        iban TEXT,
        payment_terms TEXT,
        footer_notes TEXT,
        customer_sms_templates_json TEXT,
        logo_data_url TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_number TEXT NOT NULL,
        customer_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'new',
        brand TEXT,
        model TEXT,
        serial_number TEXT,
        imei TEXT,
        access_code TEXT,
        sim_code TEXT,
        issue_description TEXT NOT NULL,
        internal_notes TEXT,
        opened_at TEXT NOT NULL,
        closed_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_number TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        customer_id INTEGER NOT NULL,
        ticket_id INTEGER,
        issued_at TEXT NOT NULL,
        subtotal INTEGER NOT NULL,
        tax_amount INTEGER NOT NULL,
        total INTEGER NOT NULL,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
        FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE SET NULL
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS number_sequences (
        scope TEXT PRIMARY KEY,
        last_value INTEGER NOT NULL
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS ticket_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_id INTEGER NOT NULL,
        kind TEXT NOT NULL,
        label TEXT NOT NULL,
        note TEXT,
        metadata_json TEXT,
        occurred_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS document_lines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id INTEGER NOT NULL,
        catalog_item_id INTEGER,
        label TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        unit_price INTEGER NOT NULL,
        vat_rate REAL NOT NULL,
        line_total INTEGER NOT NULL,
        category_hint TEXT,
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
        FOREIGN KEY (catalog_item_id) REFERENCES catalog_items(id) ON DELETE SET NULL
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS document_imports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id INTEGER NOT NULL,
        source TEXT NOT NULL,
        external_id TEXT NOT NULL,
        external_number TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS ticket_lines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_id INTEGER NOT NULL,
        catalog_item_id INTEGER,
        label TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        unit_price INTEGER NOT NULL,
        vat_rate REAL NOT NULL,
        line_total INTEGER NOT NULL,
        category_hint TEXT,
        FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
        FOREIGN KEY (catalog_item_id) REFERENCES catalog_items(id) ON DELETE SET NULL
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER,
        document_id INTEGER NOT NULL,
        method TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        amount INTEGER NOT NULL,
        paid_at TEXT NOT NULL,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
      )
    `,
    'CREATE INDEX IF NOT EXISTS customers_last_name_idx ON customers(last_name)',
    'CREATE INDEX IF NOT EXISTS customers_phone_idx ON customers(phone)',
    'CREATE INDEX IF NOT EXISTS customers_email_idx ON customers(email)',
    'CREATE INDEX IF NOT EXISTS catalog_items_name_idx ON catalog_items(name)',
    'CREATE UNIQUE INDEX IF NOT EXISTS catalog_items_sku_idx ON catalog_items(sku)',
    'CREATE INDEX IF NOT EXISTS catalog_items_type_idx ON catalog_items(type)',
    'CREATE INDEX IF NOT EXISTS catalog_items_is_active_idx ON catalog_items(is_active)',
    'CREATE UNIQUE INDEX IF NOT EXISTS tickets_ticket_number_idx ON tickets(ticket_number)',
    'CREATE INDEX IF NOT EXISTS tickets_customer_id_idx ON tickets(customer_id)',
    'CREATE INDEX IF NOT EXISTS tickets_status_idx ON tickets(status)',
    'CREATE INDEX IF NOT EXISTS tickets_opened_at_idx ON tickets(opened_at)',
    'CREATE INDEX IF NOT EXISTS tickets_status_opened_at_id_idx ON tickets(status, opened_at, id)',
    'CREATE INDEX IF NOT EXISTS ticket_events_ticket_id_idx ON ticket_events(ticket_id)',
    'CREATE INDEX IF NOT EXISTS ticket_events_occurred_at_idx ON ticket_events(occurred_at)',
    'CREATE INDEX IF NOT EXISTS ticket_events_kind_idx ON ticket_events(kind)',
    'CREATE UNIQUE INDEX IF NOT EXISTS documents_document_number_idx ON documents(document_number)',
    'CREATE INDEX IF NOT EXISTS documents_customer_id_idx ON documents(customer_id)',
    'CREATE INDEX IF NOT EXISTS documents_ticket_id_idx ON documents(ticket_id)',
    'CREATE INDEX IF NOT EXISTS documents_type_idx ON documents(type)',
    'CREATE INDEX IF NOT EXISTS documents_status_idx ON documents(status)',
    'CREATE INDEX IF NOT EXISTS documents_issued_at_idx ON documents(issued_at)',
    'CREATE INDEX IF NOT EXISTS documents_issued_at_id_idx ON documents(issued_at, id)',
    'CREATE INDEX IF NOT EXISTS payments_document_id_idx ON payments(document_id)',
    'CREATE INDEX IF NOT EXISTS payments_paid_at_idx ON payments(paid_at)',
    'CREATE INDEX IF NOT EXISTS payments_method_idx ON payments(method)',
    'CREATE INDEX IF NOT EXISTS payments_status_idx ON payments(status)',
    'CREATE INDEX IF NOT EXISTS payments_document_id_paid_at_id_idx ON payments(document_id, paid_at, id)',
    'CREATE INDEX IF NOT EXISTS document_lines_document_id_idx ON document_lines(document_id)',
    'CREATE INDEX IF NOT EXISTS document_lines_catalog_item_id_idx ON document_lines(catalog_item_id)',
    'CREATE INDEX IF NOT EXISTS document_lines_category_hint_idx ON document_lines(category_hint)',
    'CREATE INDEX IF NOT EXISTS document_imports_document_id_idx ON document_imports(document_id)',
    'CREATE UNIQUE INDEX IF NOT EXISTS document_imports_source_external_id_idx ON document_imports(source, external_id)',
    'CREATE INDEX IF NOT EXISTS document_imports_source_external_number_idx ON document_imports(source, external_number)',
    'CREATE INDEX IF NOT EXISTS ticket_lines_ticket_id_idx ON ticket_lines(ticket_id)',
    'CREATE INDEX IF NOT EXISTS ticket_lines_catalog_item_id_idx ON ticket_lines(catalog_item_id)',
    'CREATE INDEX IF NOT EXISTS ticket_lines_category_hint_idx ON ticket_lines(category_hint)'
  ], 'write')
}

async function ensureDocumentImportsTable() {
  const client = useTursoClient()
  const tableInfo = await client.execute('PRAGMA table_info(document_imports)')

  if (!tableInfo.rows.length) {
    await client.batch([
      `
        CREATE TABLE IF NOT EXISTS document_imports (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          document_id INTEGER NOT NULL,
          source TEXT NOT NULL,
          external_id TEXT NOT NULL,
          external_number TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
        )
      `,
      'CREATE INDEX IF NOT EXISTS document_imports_document_id_idx ON document_imports(document_id)',
      'CREATE UNIQUE INDEX IF NOT EXISTS document_imports_source_external_id_idx ON document_imports(source, external_id)',
      'CREATE INDEX IF NOT EXISTS document_imports_source_external_number_idx ON document_imports(source, external_number)'
    ], 'write')
    return
  }

  const columns = new Set(tableInfo.rows.map(row => String(row.name)))
  const statements: string[] = []

  if (!columns.has('external_number')) {
    statements.push('ALTER TABLE document_imports ADD COLUMN external_number TEXT')
    statements.push('UPDATE document_imports SET external_number = external_id WHERE trim(coalesce(external_number, \'\')) = \'\'')
  }

  statements.push('CREATE INDEX IF NOT EXISTS document_imports_document_id_idx ON document_imports(document_id)')
  statements.push('CREATE UNIQUE INDEX IF NOT EXISTS document_imports_source_external_id_idx ON document_imports(source, external_id)')
  statements.push('CREATE INDEX IF NOT EXISTS document_imports_source_external_number_idx ON document_imports(source, external_number)')

  await client.batch(statements, 'write')
}

async function migrateDocumentLinesQuantityToInteger() {
  const client = useTursoClient()
  const tableInfo = await client.execute('PRAGMA table_info(document_lines)')

  if (!tableInfo.rows.length) {
    return
  }

  const quantityColumn = tableInfo.rows.find(row => String(row.name) === 'quantity')
  const quantityType = String(quantityColumn?.type || '').toUpperCase()

  if (quantityType.includes('INT')) {
    return
  }

  await client.batch([
    'ALTER TABLE document_lines RENAME TO document_lines_legacy_quantity',
    `
      CREATE TABLE document_lines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id INTEGER NOT NULL,
        catalog_item_id INTEGER,
        label TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        unit_price INTEGER NOT NULL,
        vat_rate REAL NOT NULL,
        line_total INTEGER NOT NULL,
        category_hint TEXT,
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
        FOREIGN KEY (catalog_item_id) REFERENCES catalog_items(id) ON DELETE SET NULL
      )
    `,
    `
      INSERT INTO document_lines (
        id,
        document_id,
        catalog_item_id,
        label,
        quantity,
        unit_price,
        vat_rate,
        line_total,
        category_hint
      )
      SELECT
        id,
        document_id,
        catalog_item_id,
        label,
        CAST(ROUND(quantity, 0) AS INTEGER),
        unit_price,
        vat_rate,
        line_total,
        category_hint
      FROM document_lines_legacy_quantity
    `,
    'DROP TABLE document_lines_legacy_quantity',
    'CREATE INDEX IF NOT EXISTS document_lines_document_id_idx ON document_lines(document_id)',
    'CREATE INDEX IF NOT EXISTS document_lines_catalog_item_id_idx ON document_lines(catalog_item_id)',
    'CREATE INDEX IF NOT EXISTS document_lines_category_hint_idx ON document_lines(category_hint)'
  ], 'write')
}

async function migrateTicketLinesQuantityToInteger() {
  const client = useTursoClient()
  const tableInfo = await client.execute('PRAGMA table_info(ticket_lines)')

  if (!tableInfo.rows.length) {
    return
  }

  const quantityColumn = tableInfo.rows.find(row => String(row.name) === 'quantity')
  const quantityType = String(quantityColumn?.type || '').toUpperCase()

  if (quantityType.includes('INT')) {
    return
  }

  await client.batch([
    'ALTER TABLE ticket_lines RENAME TO ticket_lines_legacy_quantity',
    `
      CREATE TABLE ticket_lines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_id INTEGER NOT NULL,
        catalog_item_id INTEGER,
        label TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        unit_price INTEGER NOT NULL,
        vat_rate REAL NOT NULL,
        line_total INTEGER NOT NULL,
        category_hint TEXT,
        FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
        FOREIGN KEY (catalog_item_id) REFERENCES catalog_items(id) ON DELETE SET NULL
      )
    `,
    `
      INSERT INTO ticket_lines (
        id,
        ticket_id,
        catalog_item_id,
        label,
        quantity,
        unit_price,
        vat_rate,
        line_total,
        category_hint
      )
      SELECT
        id,
        ticket_id,
        catalog_item_id,
        label,
        CAST(ROUND(quantity, 0) AS INTEGER),
        unit_price,
        vat_rate,
        line_total,
        category_hint
      FROM ticket_lines_legacy_quantity
    `,
    'DROP TABLE ticket_lines_legacy_quantity',
    'CREATE INDEX IF NOT EXISTS ticket_lines_ticket_id_idx ON ticket_lines(ticket_id)',
    'CREATE INDEX IF NOT EXISTS ticket_lines_catalog_item_id_idx ON ticket_lines(catalog_item_id)',
    'CREATE INDEX IF NOT EXISTS ticket_lines_category_hint_idx ON ticket_lines(category_hint)'
  ], 'write')
}

async function migrateTicketAccessColumns() {
  const client = useTursoClient()
  const tableInfo = await client.execute('PRAGMA table_info(tickets)')
  const columns = new Set(tableInfo.rows.map(row => String(row.name)))

  if (!columns.size) {
    return
  }

  const statements: string[] = []

  if (!columns.has('access_code')) {
    statements.push('ALTER TABLE tickets ADD COLUMN access_code TEXT')
  }

  if (!columns.has('sim_code')) {
    statements.push('ALTER TABLE tickets ADD COLUMN sim_code TEXT')
  }

  if (!statements.length) {
    return
  }

  await client.batch(statements, 'write')
}

async function migrateCatalogStructure() {
  const client = useTursoClient()
  const tableInfo = await client.execute('PRAGMA table_info(catalog_items)')
  const columns = new Set(tableInfo.rows.map(row => String(row.name)))

  if (!columns.size) {
    return
  }

  const statements: string[] = []

  if (!columns.has('category')) {
    statements.push('ALTER TABLE catalog_items ADD COLUMN category TEXT')
  }

  if (!columns.has('brand')) {
    statements.push('ALTER TABLE catalog_items ADD COLUMN brand TEXT')
  }

  if (!columns.has('model')) {
    statements.push('ALTER TABLE catalog_items ADD COLUMN model TEXT')
  }

  if (!columns.has('service_kind')) {
    statements.push('ALTER TABLE catalog_items ADD COLUMN service_kind TEXT')
  }

  if (!columns.has('keywords_json')) {
    statements.push('ALTER TABLE catalog_items ADD COLUMN keywords_json TEXT')
  }

  statements.push('CREATE INDEX IF NOT EXISTS catalog_items_is_active_idx ON catalog_items(is_active)')
  statements.push('CREATE INDEX IF NOT EXISTS catalog_items_category_idx ON catalog_items(category)')
  statements.push('CREATE INDEX IF NOT EXISTS catalog_items_brand_idx ON catalog_items(brand)')
  statements.push('CREATE INDEX IF NOT EXISTS catalog_items_model_idx ON catalog_items(model)')
  statements.push('CREATE INDEX IF NOT EXISTS catalog_items_service_kind_idx ON catalog_items(service_kind)')

  await client.batch(statements, 'write')

  await client.batch([
    `UPDATE catalog_items SET type = 'repair' WHERE type IN ('repair_part', 'labor')`,
    `UPDATE catalog_items SET category = 'Autre' WHERE trim(coalesce(category, '')) = ''`,
    `UPDATE catalog_items
      SET type = 'repair'
      WHERE type = 'service'
        AND (
          trim(coalesce(brand, '')) != ''
          OR trim(coalesce(model, '')) != ''
          OR category NOT IN ('Service', 'Autre', 'Diagnostic', 'Support', 'Transfert', 'Configuration', 'Nettoyage')
        )`,
    `UPDATE catalog_items
      SET category = 'Diagnostic'
      WHERE type = 'service'
        AND category = 'Service'
        AND lower(coalesce(service_kind, name, '')) like '%diagnostic%'`,
    `UPDATE catalog_items
      SET category = 'Support'
      WHERE type = 'service'
        AND category = 'Service'
        AND (
          lower(coalesce(service_kind, name, '')) like '%support%'
          OR lower(coalesce(service_kind, name, '')) like '%assistance%'
          OR lower(coalesce(service_kind, name, '')) like '%whatsapp%'
        )`,
    `UPDATE catalog_items
      SET category = 'Transfert'
      WHERE type = 'service'
        AND category = 'Service'
        AND (
          lower(coalesce(service_kind, name, '')) like '%transfert%'
          OR lower(coalesce(service_kind, name, '')) like '%transfer%'
          OR lower(coalesce(service_kind, name, '')) like '%migration%'
        )`,
    `UPDATE catalog_items
      SET category = 'Configuration'
      WHERE type = 'service'
        AND category = 'Service'
        AND lower(coalesce(service_kind, name, '')) like '%configuration%'`,
    `UPDATE catalog_items
      SET category = 'Nettoyage'
      WHERE type = 'service'
        AND category = 'Service'
        AND lower(coalesce(service_kind, name, '')) like '%nettoyage%'`,
    `UPDATE catalog_items
      SET category = 'Autre'
      WHERE type = 'service'
        AND category = 'Autre'
        AND trim(coalesce(brand, '')) = ''
        AND trim(coalesce(model, '')) = ''`,
    `UPDATE catalog_items
      SET category = 'Autre'
      WHERE type = 'service'
        AND category = 'Service'`
  ], 'write')
}

async function migrateCompanySettingsColumns() {
  const client = useTursoClient()
  const tableInfo = await client.execute('PRAGMA table_info(company_settings)')
  const columns = new Set(tableInfo.rows.map(row => String(row.name)))

  if (!columns.size) {
    return
  }

  const statements: string[] = []

  if (!columns.has('website')) {
    statements.push('ALTER TABLE company_settings ADD COLUMN website TEXT')
  }

  if (!columns.has('country_code')) {
    statements.push('ALTER TABLE company_settings ADD COLUMN country_code TEXT')
  }

  if (!columns.has('bank_name')) {
    statements.push('ALTER TABLE company_settings ADD COLUMN bank_name TEXT')
  }

  if (!columns.has('iban')) {
    statements.push('ALTER TABLE company_settings ADD COLUMN iban TEXT')
  }

  if (!columns.has('payment_terms')) {
    statements.push('ALTER TABLE company_settings ADD COLUMN payment_terms TEXT')
  }

  if (!columns.has('footer_notes')) {
    statements.push('ALTER TABLE company_settings ADD COLUMN footer_notes TEXT')
  }

  if (!columns.has('customer_sms_templates_json')) {
    statements.push('ALTER TABLE company_settings ADD COLUMN customer_sms_templates_json TEXT')
  }

  if (!statements.length) {
    return
  }

  await client.batch(statements, 'write')
}

async function ensureUniqueNumberIndexes() {
  const client = useTursoClient()
  const [documentIndexes, ticketIndexes, duplicateDocuments, duplicateTickets] = await Promise.all([
    client.execute(`PRAGMA index_list('documents')`),
    client.execute(`PRAGMA index_list('tickets')`),
    client.execute(`
      SELECT 1
      FROM documents
      GROUP BY document_number
      HAVING COUNT(*) > 1
      LIMIT 1
    `),
    client.execute(`
      SELECT 1
      FROM tickets
      GROUP BY ticket_number
      HAVING COUNT(*) > 1
      LIMIT 1
    `)
  ])

  const documentNumberIndex = documentIndexes.rows.find(row => String(row.name) === 'documents_document_number_idx')
  const ticketNumberIndex = ticketIndexes.rows.find(row => String(row.name) === 'tickets_ticket_number_idx')
  const statements: string[] = []

  if (!duplicateDocuments.rows.length && documentNumberIndex && Number(documentNumberIndex.unique) !== 1) {
    statements.push('DROP INDEX IF EXISTS documents_document_number_idx')
    statements.push('CREATE UNIQUE INDEX IF NOT EXISTS documents_document_number_idx ON documents(document_number)')
  }

  if (!duplicateTickets.rows.length && ticketNumberIndex && Number(ticketNumberIndex.unique) !== 1) {
    statements.push('DROP INDEX IF EXISTS tickets_ticket_number_idx')
    statements.push('CREATE UNIQUE INDEX IF NOT EXISTS tickets_ticket_number_idx ON tickets(ticket_number)')
  }

  if (!statements.length) {
    return
  }

  await client.batch(statements, 'write')
}

async function migrateLegacyCustomersTable() {
  const client = useTursoClient()
  const tableInfo = await client.execute('PRAGMA table_info(customers)')
  const columns = new Set(tableInfo.rows.map(row => String(row.name)))

  if (!columns.size || columns.has('first_name')) {
    return
  }

  if (!columns.has('name')) {
    return
  }

  const legacyRows = await client.execute('SELECT * FROM customers')

  await client.execute(`
    CREATE TABLE customers_v2 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      company_name TEXT,
      phone TEXT NOT NULL,
      email TEXT NOT NULL,
      address_line_1 TEXT,
      address_line_2 TEXT,
      postal_code TEXT,
      city TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

  for (const row of legacyRows.rows) {
    const { firstName, lastName } = splitLegacyName(String(row.name || 'Customer'))
    await client.execute(
      `
        INSERT INTO customers_v2 (
          id,
          first_name,
          last_name,
          company_name,
          phone,
          email,
          address_line_1,
          address_line_2,
          postal_code,
          city,
          notes,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        Number(row.id),
        firstName,
        lastName,
        null,
        String(row.phone || ''),
        String(row.email || ''),
        row.address ? String(row.address) : null,
        null,
        row.postal_code ? String(row.postal_code) : null,
        row.city ? String(row.city) : null,
        row.comment ? String(row.comment) : null,
        toIsoDateTime(),
        toIsoDateTime()
      ]
    )
  }

  await client.batch([
    'DROP TABLE customers',
    'ALTER TABLE customers_v2 RENAME TO customers'
  ], 'write')
}

async function seedCustomers() {
  const db = useDb()
  const count = await db.select({ count: sql<number>`count(*)` }).from(customers)

  if (Number(count[0]?.count || 0) > 0) {
    return
  }

  await db.insert(customers).values([
    {
      firstName: 'Alex',
      lastName: 'Martin',
      companyName: null,
      phone: '+41 79 555 10 01',
      email: 'alex.martin@example.com',
      addressLine1: 'Rue du Lac 10',
      addressLine2: null,
      postalCode: '1003',
      city: 'Lausanne',
      notes: 'Usually accepts quote approvals by phone.',
      createdAt: toIsoDateTime(),
      updatedAt: toIsoDateTime()
    },
    {
      firstName: 'Sofia',
      lastName: 'Rossi',
      companyName: null,
      phone: '+41 78 555 10 02',
      email: 'sofia.rossi@example.com',
      addressLine1: 'Avenue Centrale 12',
      addressLine2: null,
      postalCode: '1201',
      city: 'Geneve',
      notes: null,
      createdAt: toIsoDateTime(),
      updatedAt: toIsoDateTime()
    },
    {
      firstName: 'Nora',
      lastName: 'Bianchi',
      companyName: 'Atelier Pixel',
      phone: '+41 76 555 10 03',
      email: 'contact@atelierpixel.example.com',
      addressLine1: 'Rue des Alpes 7',
      addressLine2: '2nd floor',
      postalCode: '1950',
      city: 'Sion',
      notes: 'Business customer for small-office support.',
      createdAt: toIsoDateTime(),
      updatedAt: toIsoDateTime()
    }
  ])
}

async function seedCatalogItems() {
  const db = useDb()
  const count = await db.select({ count: sql<number>`count(*)` }).from(catalogItems)

  if (Number(count[0]?.count || 0) > 0) {
    return
  }

  await db.insert(catalogItems).values([
    {
      name: 'iPhone 15 Case',
      sku: 'CASE-IP15-BLK',
      type: 'product',
      category: 'Accessoires',
      brand: null,
      model: null,
      serviceKind: null,
      keywordsJson: null,
      defaultPrice: 2990,
      vatRate: 8.1,
      isActive: true,
      createdAt: toIsoDateTime(),
      updatedAt: toIsoDateTime()
    },
    {
      name: 'Tempered Glass Samsung A54',
      sku: 'GLASS-A54',
      type: 'product',
      category: 'Protection',
      brand: null,
      model: null,
      serviceKind: null,
      keywordsJson: null,
      defaultPrice: 1990,
      vatRate: 8.1,
      isActive: true,
      createdAt: toIsoDateTime(),
      updatedAt: toIsoDateTime()
    },
    {
      name: 'Chargeur rapide USB-C 20W',
      sku: 'CHG-USBC-20W',
      type: 'product',
      category: 'Charge',
      brand: null,
      model: null,
      serviceKind: null,
      keywordsJson: null,
      defaultPrice: 2490,
      vatRate: 8.1,
      isActive: true,
      createdAt: toIsoDateTime(),
      updatedAt: toIsoDateTime()
    },
    {
      name: 'Cable USB-C vers USB-C',
      sku: 'CBL-USBC-USBC',
      type: 'product',
      category: 'Charge',
      brand: null,
      model: null,
      serviceKind: null,
      keywordsJson: null,
      defaultPrice: 1490,
      vatRate: 8.1,
      isActive: true,
      createdAt: toIsoDateTime(),
      updatedAt: toIsoDateTime()
    },
    {
      name: 'Diagnostic',
      sku: 'SERV-DIAG',
      type: 'service',
      category: 'Diagnostic',
      brand: null,
      model: null,
      serviceKind: 'Diagnostic',
      keywordsJson: JSON.stringify(['diagnostic', 'controle', 'checkup']),
      defaultPrice: 3900,
      vatRate: 8.1,
      isActive: true,
      createdAt: toIsoDateTime(),
      updatedAt: toIsoDateTime()
    },
    {
      name: 'WhatsApp Support 20 min',
      sku: 'SERV-WA-20',
      type: 'service',
      category: 'Support',
      brand: null,
      model: null,
      serviceKind: 'Support WhatsApp',
      keywordsJson: JSON.stringify(['whatsapp', 'support', 'assistance']),
      defaultPrice: 2500,
      vatRate: 8.1,
      isActive: true,
      createdAt: toIsoDateTime(),
      updatedAt: toIsoDateTime()
    },
    {
      name: 'Data Transfer',
      sku: 'SERV-DATA',
      type: 'service',
      category: 'Transfert',
      brand: null,
      model: null,
      serviceKind: 'Transfert de données',
      keywordsJson: JSON.stringify(['data transfer', 'transfert donnees', 'migration']),
      defaultPrice: 4500,
      vatRate: 8.1,
      isActive: true,
      createdAt: toIsoDateTime(),
      updatedAt: toIsoDateTime()
    }
  ])
}

async function seedRepairCatalogServices() {
  const db = useDb()
  const seedItems = buildRepairCatalogSeedItems()

  if (!seedItems.length) {
    return
  }

  const existingRows = await db.select({
    id: catalogItems.id,
    sku: catalogItems.sku,
    brand: catalogItems.brand,
    model: catalogItems.model,
    serviceKind: catalogItems.serviceKind
  }).from(catalogItems)
    .where(eq(catalogItems.type, 'repair'))

  const existingSkus = new Set(existingRows.map(row => row.sku).filter((sku): sku is string => Boolean(sku)))
  const existingServiceKeys = new Set(existingRows.map(row => `${row.brand || ''}::${row.model || ''}::${row.serviceKind || ''}`))
  const now = toIsoDateTime()

  const values = seedItems
    .filter((item) => {
      const serviceKey = `${item.brand || ''}::${item.model || ''}::${item.serviceKind || ''}`
      return !existingSkus.has(item.sku || '') && !existingServiceKeys.has(serviceKey)
    })
    .map(item => ({
      name: item.name,
      sku: item.sku,
      type: item.type,
      category: item.category,
      brand: item.brand,
      model: item.model,
      serviceKind: item.serviceKind,
      keywordsJson: item.keywords.length ? JSON.stringify(item.keywords) : null,
      defaultPrice: item.defaultPrice,
      vatRate: item.vatRate,
      isActive: item.isActive,
      createdAt: now,
      updatedAt: now
    }))

  if (!values.length) {
    return
  }

  await db.insert(catalogItems).values(values)
}

async function seedOperations() {
  const db = useDb()
  const ticketCount = await db.select({ count: sql<number>`count(*)` }).from(tickets)

  if (Number(ticketCount[0]?.count || 0) > 0) {
    return
  }

  const seededCustomers = await db.select().from(customers).orderBy(customers.id)
  const seededItems = await db.select().from(catalogItems).orderBy(catalogItems.id)

  const repairCustomer = seededCustomers[0]
  const accessoryCustomer = seededCustomers[1]
  const supportCustomer = seededCustomers[2]

  if (!repairCustomer || !accessoryCustomer || !supportCustomer) {
    return
  }

  const repairTicket = await db.insert(tickets).values({
    ticketNumber: 'TIC-1',
    customerId: repairCustomer.id,
    type: 'repair',
    status: 'in_progress',
    brand: 'Apple',
    model: 'iPhone 13',
    serialNumber: 'SN-IP13-001',
    imei: '356789123456789',
    issueDescription: 'Display is cracked and touch is inconsistent after a fall.',
    internalNotes: 'Customer approved screen replacement. Awaiting replacement module delivery.',
    openedAt: toIsoDateTime(new Date('2026-03-24T09:15:00.000Z')),
    closedAt: null,
    createdAt: toIsoDateTime(),
    updatedAt: toIsoDateTime()
  }).returning()

  const ticket = repairTicket[0]

  const repairService = seededItems.find(item => item.sku === 'SERV-APPLE-IPHONE-13-SCREEN')
  const diagnostic = seededItems.find(item => item.name === 'Diagnostic')
  const caseItem = seededItems.find(item => item.name === 'iPhone 15 Case')
  const glassItem = seededItems.find(item => item.name === 'Tempered Glass Samsung A54')
  const whatsappSupport = seededItems.find(item => item.name === 'WhatsApp Support 20 min')

  if (!ticket || !repairService || !diagnostic || !caseItem || !glassItem || !whatsappSupport) {
    return
  }

  const quoteTotals = calculateCommercialTotals([
    {
      quantity: 1,
      unitPrice: repairService.defaultPrice,
      vatRate: repairService.vatRate
    },
    {
      quantity: 1,
      unitPrice: diagnostic.defaultPrice,
      vatRate: diagnostic.vatRate
    }
  ])

  const accessoryTotals = calculateCommercialTotals([
    {
      quantity: 1,
      unitPrice: caseItem.defaultPrice,
      vatRate: caseItem.vatRate
    },
    {
      quantity: 1,
      unitPrice: glassItem.defaultPrice,
      vatRate: glassItem.vatRate
    }
  ])

  const supportTotals = calculateCommercialTotals([{
    quantity: 1,
    unitPrice: whatsappSupport.defaultPrice,
    vatRate: whatsappSupport.vatRate
  }])

  const quote = await db.insert(documents).values({
    documentNumber: 'DE-1',
    type: 'quote',
    status: 'issued',
    customerId: repairCustomer.id,
    ticketId: ticket.id,
    issuedAt: toIsoDateTime(new Date('2026-03-24T10:00:00.000Z')),
    subtotal: quoteTotals.subtotal,
    taxAmount: quoteTotals.taxAmount,
    total: quoteTotals.total,
    notes: 'Quote created from tracked repair ticket.',
    createdAt: toIsoDateTime(),
    updatedAt: toIsoDateTime()
  }).returning()

  const accessoryInvoice = await db.insert(documents).values({
    documentNumber: 'FA-1',
    type: 'invoice',
    status: 'paid',
    customerId: accessoryCustomer.id,
    ticketId: null,
    issuedAt: toIsoDateTime(new Date('2026-03-25T08:40:00.000Z')),
    subtotal: accessoryTotals.subtotal,
    taxAmount: accessoryTotals.taxAmount,
    total: accessoryTotals.total,
    notes: 'Direct accessory sale at the counter.',
    createdAt: toIsoDateTime(),
    updatedAt: toIsoDateTime()
  }).returning()

  const supportInvoice = await db.insert(documents).values({
    documentNumber: 'FA-2',
    type: 'invoice',
    status: 'paid',
    customerId: supportCustomer.id,
    ticketId: null,
    issuedAt: toIsoDateTime(new Date('2026-03-25T11:15:00.000Z')),
    subtotal: supportTotals.subtotal,
    taxAmount: supportTotals.taxAmount,
    total: supportTotals.total,
    notes: 'Quick support service completed immediately.',
    createdAt: toIsoDateTime(),
    updatedAt: toIsoDateTime()
  }).returning()

  const quoteDocument = quote[0]
  const accessoryInvoiceDocument = accessoryInvoice[0]
  const supportDocument = supportInvoice[0]

  if (!quoteDocument || !accessoryInvoiceDocument || !supportDocument) {
    return
  }

  await db.insert(documentLines).values([
    {
      documentId: quoteDocument.id,
      catalogItemId: repairService.id,
      label: repairService.name,
      quantity: 1,
      unitPrice: repairService.defaultPrice,
      vatRate: repairService.vatRate,
      lineTotal: quoteTotals.lines[0]!.lineTotal,
      categoryHint: 'repair'
    },
    {
      documentId: quoteDocument.id,
      catalogItemId: diagnostic.id,
      label: diagnostic.name,
      quantity: 1,
      unitPrice: diagnostic.defaultPrice,
      vatRate: diagnostic.vatRate,
      lineTotal: quoteTotals.lines[1]!.lineTotal,
      categoryHint: 'service'
    },
    {
      documentId: accessoryInvoiceDocument.id,
      catalogItemId: caseItem.id,
      label: caseItem.name,
      quantity: 1,
      unitPrice: caseItem.defaultPrice,
      vatRate: caseItem.vatRate,
      lineTotal: accessoryTotals.lines[0]!.lineTotal,
      categoryHint: 'accessory'
    },
    {
      documentId: accessoryInvoiceDocument.id,
      catalogItemId: glassItem.id,
      label: glassItem.name,
      quantity: 1,
      unitPrice: glassItem.defaultPrice,
      vatRate: glassItem.vatRate,
      lineTotal: accessoryTotals.lines[1]!.lineTotal,
      categoryHint: 'accessory'
    },
    {
      documentId: supportDocument.id,
      catalogItemId: whatsappSupport.id,
      label: whatsappSupport.name,
      quantity: 1,
      unitPrice: whatsappSupport.defaultPrice,
      vatRate: whatsappSupport.vatRate,
      lineTotal: supportTotals.lines[0]!.lineTotal,
      categoryHint: 'service'
    }
  ])

  await db.insert(payments).values([
    {
      customerId: accessoryCustomer.id,
      documentId: accessoryInvoiceDocument.id,
      method: 'card_twint',
      status: 'paid',
      amount: accessoryInvoiceDocument.total,
      paidAt: toIsoDateTime(new Date('2026-03-25T08:42:00.000Z')),
      notes: null,
      createdAt: toIsoDateTime(),
      updatedAt: toIsoDateTime()
    },
    {
      customerId: supportCustomer.id,
      documentId: supportDocument.id,
      method: 'cash',
      status: 'paid',
      amount: supportDocument.total,
      paidAt: toIsoDateTime(new Date('2026-03-25T11:17:00.000Z')),
      notes: 'Paid at the counter.',
      createdAt: toIsoDateTime(),
      updatedAt: toIsoDateTime()
    }
  ])
}

async function seedPosData() {
  await seedCustomers()
  await seedCatalogItems()
  await seedRepairCatalogServices()
  await seedOperations()
}

async function createVacationTables() {
  const client = useTursoClient()

  await client.batch([
    `
      CREATE TABLE IF NOT EXISTS employees (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        email TEXT,
        color TEXT NOT NULL,
        vacation_days_per_year INTEGER NOT NULL DEFAULT 25,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS vacation_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id INTEGER NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'full_day',
        status TEXT NOT NULL DEFAULT 'pending',
        business_days REAL NOT NULL,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
      )
    `,
    'CREATE INDEX IF NOT EXISTS employees_last_name_idx ON employees(last_name)',
    'CREATE INDEX IF NOT EXISTS employees_is_active_idx ON employees(is_active)',
    'CREATE INDEX IF NOT EXISTS vacation_entries_employee_id_idx ON vacation_entries(employee_id)',
    'CREATE INDEX IF NOT EXISTS vacation_entries_start_date_idx ON vacation_entries(start_date)',
    'CREATE INDEX IF NOT EXISTS vacation_entries_end_date_idx ON vacation_entries(end_date)',
    'CREATE INDEX IF NOT EXISTS vacation_entries_status_idx ON vacation_entries(status)'
  ], 'write')
}

export async function bootstrapLegacyPosSchema() {
  const config = useRuntimeConfig()
  if (config.posAllowRuntimeSchemaBootstrap !== true) return

  await migrateLegacyCustomersTable()
  await createPosTables()
  await useTursoClient().execute(
    'CREATE TABLE IF NOT EXISTS counter_customer (id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT)'
  )
  await ensureDocumentImportsTable()
  await migrateCatalogStructure()
  await migrateTicketAccessColumns()
  await migrateCompanySettingsColumns()
  await migrateDocumentLinesQuantityToInteger()
  await migrateTicketLinesQuantityToInteger()
  await ensureUniqueNumberIndexes()
  await ensureCompanySettingsRow()
  if (config.posAllowRuntimeDemoSeed === true) await seedPosData()
  await createVacationTables()
}
