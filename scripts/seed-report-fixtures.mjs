import { config as loadEnv } from 'dotenv'
import { createClient } from '@libsql/client'

loadEnv()

const MARKER = '[codex-report-fixture]'
const FIXTURE_DOMAIN = 'fixture.microwest.local'
const VAT_RATE = 8.1
const DOCS_PER_DAY = 10
const CUSTOMER_COUNT = 180
const BATCH_SIZE = 80

const YEAR_TARGETS = {
  2024: 30_000_000,
  2025: 36_000_000,
  2026: 39_000_000
}

const MONTH_FACTORS = [0.92, 0.9, 0.96, 1.01, 1.04, 1.07, 1.05, 1.03, 0.99, 1.06, 1.12, 1.18]
const WEEKDAY_FACTORS = [0.82, 1.04, 1.05, 1.02, 1.03, 1.08, 0.88]

const firstNames = [
  'Luca', 'Emma', 'Noah', 'Lea', 'Milo', 'Jade', 'Nolan', 'Eva', 'Aaron', 'Nina',
  'Elias', 'Maya', 'Theo', 'Ines', 'Liam', 'Zoé', 'Mael', 'Camille', 'Nathan', 'Lina',
  'Sacha', 'Clara', 'Adam', 'Mila', 'Evan', 'Chloe', 'Leo', 'Sarah', 'Gabriel', 'Anaïs',
  'Mathis', 'Lou', 'Raphael', 'Alice', 'Yanis', 'Elena', 'Timeo', 'Louna', 'Enzo', 'Julia'
]

const lastNames = [
  'Martin', 'Rossi', 'Favre', 'Garcia', 'Morel', 'Nguyen', 'Schmid', 'Aubert', 'Bianchi', 'Pires',
  'Rey', 'Lopez', 'Keller', 'Dubois', 'Costa', 'Muller', 'Vuille', 'Perrin', 'Torres', 'Simon',
  'Bovet', 'Noel', 'Fischer', 'Almeida', 'Mendes', 'Fontana', 'Bernard', 'Petit', 'Wenger', 'Bailly'
]

const cities = [
  { postalCode: '1003', city: 'Lausanne' },
  { postalCode: '1201', city: 'Genève' },
  { postalCode: '1700', city: 'Fribourg' },
  { postalCode: '1950', city: 'Sion' },
  { postalCode: '2000', city: 'Neuchâtel' },
  { postalCode: '2300', city: 'La Chaux-de-Fonds' },
  { postalCode: '1110', city: 'Morges' },
  { postalCode: '1020', city: 'Renens' },
  { postalCode: '1400', city: 'Yverdon-les-Bains' },
  { postalCode: '1630', city: 'Bulle' }
]

const companyPrefixes = ['Atelier', 'Studio', 'Comptoir', 'Clinique', 'Maison', 'Boutique', 'Service', 'Laboratoire']
const companySuffixes = ['Mobile', 'Digital', 'Connect', 'Tech', 'Pixel', 'Cloud', 'Express', 'Data']

const accessoryLabels = [
  'Coque silicone MagSafe',
  'Verre trempé premium',
  'Chargeur USB-C 20W',
  'Câble USB-C tressé',
  'Support voiture aimanté',
  'Adaptateur secteur compact',
  'Power bank slim',
  'Protection caméra'
]

const repairLabels = [
  'Remplacement écran OLED',
  'Remplacement batterie',
  'Réparation connecteur de charge',
  'Remplacement vitre arrière',
  'Réparation module caméra',
  'Remise en état bouton power',
  'Désoxydation carte mère',
  'Remplacement écouteur interne'
]

const serviceLabels = [
  'Diagnostic complet',
  'Transfert de données',
  'Configuration iPhone neuf',
  'Nettoyage et optimisation',
  'Sauvegarde et restauration',
  'Assistance WhatsApp 30 min',
  'Installation protection logicielle',
  'Paramétrage eSIM'
]

const client = createClient({
  url: process.env.TURSO_URL,
  authToken: process.env.TURSO_TOKEN
})

if (!process.env.TURSO_URL || !process.env.TURSO_TOKEN) {
  throw new Error('Missing TURSO_URL or TURSO_TOKEN in environment')
}

function mulberry32(seed) {
  return function rand() {
    let t = seed += 0x6D2B79F5
    t = Math.imul(t ^ t >>> 15, t | 1)
    t ^= t + Math.imul(t ^ t >>> 7, t | 61)
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

function hashString(value) {
  let hash = 1779033703
  for (let i = 0; i < value.length; i++) {
    hash = Math.imul(hash ^ value.charCodeAt(i), 3432918353)
    hash = hash << 13 | hash >>> 19
  }
  return hash >>> 0
}

function chunk(items, size) {
  const chunks = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

function buildInsertStatement(table, columns, rows, returning = []) {
  const placeholders = rows
    .map(() => `(${columns.map(() => '?').join(', ')})`)
    .join(', ')

  return {
    sql: `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${placeholders}${returning.length ? ` RETURNING ${returning.join(', ')}` : ''}`,
    args: rows.flatMap(row => columns.map(column => row[column]))
  }
}

function toIsoDateTime(year, month, day, hour, minute) {
  return new Date(Date.UTC(year, month - 1, day, hour, minute, 0)).toISOString()
}

function toDateOnly(date) {
  return date.toISOString().slice(0, 10)
}

function getDatesBetween(start, end) {
  const days = []
  for (const current = new Date(`${start}T12:00:00.000Z`); current <= new Date(`${end}T12:00:00.000Z`); current.setUTCDate(current.getUTCDate() + 1)) {
    days.push(new Date(current))
  }
  return days
}

function distributeTotal(total, count, rng, minValue) {
  const floorTotal = minValue * count
  if (total <= floorTotal) {
    const result = Array.from({ length: count }, () => minValue)
    result[result.length - 1] += total - floorTotal
    return result
  }

  const weights = Array.from({ length: count }, () => 0.8 + rng() * 1.4)
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0)
  const spread = total - floorTotal
  const values = []
  let assigned = 0

  for (let index = 0; index < count; index++) {
    if (index === count - 1) {
      values.push(total - assigned)
      continue
    }

    const raw = minValue + Math.round((spread * weights[index]) / weightSum)
    values.push(raw)
    assigned += raw
  }

  return values
}

function pickWeightedCategory(rng) {
  const draw = rng()
  if (draw < 0.42) return 'repair'
  if (draw < 0.82) return 'service'
  return 'accessory'
}

function pickLabel(category, rng) {
  const source = category === 'accessory'
    ? accessoryLabels
    : category === 'repair'
      ? repairLabels
      : serviceLabels

  return source[Math.floor(rng() * source.length)]
}

function buildCustomerFixtures() {
  const now = new Date().toISOString()

  return Array.from({ length: CUSTOMER_COUNT }, (_, index) => {
    const firstName = firstNames[index % firstNames.length]
    const lastName = lastNames[Math.floor(index / firstNames.length) % lastNames.length]
    const city = cities[index % cities.length]
    const companyName = index % 4 === 0
      ? `${companyPrefixes[index % companyPrefixes.length]} ${companySuffixes[index % companySuffixes.length]} ${Math.floor(index / 4) + 1}`
      : null

    return {
      first_name: firstName,
      last_name: lastName,
      company_name: companyName,
      phone: `+41 79 ${String(100 + (index % 900)).padStart(3, '0')} ${String(10 + (index % 90)).padStart(2, '0')} ${String(10 + ((index * 7) % 90)).padStart(2, '0')}`,
      email: `fixture-customer-${index + 1}@${FIXTURE_DOMAIN}`,
      address_line_1: `${10 + (index % 90)} rue des Techs`,
      address_line_2: index % 5 === 0 ? `Bâtiment ${String.fromCharCode(65 + (index % 5))}` : null,
      postal_code: city.postalCode,
      city: city.city,
      notes: `${MARKER} customer`,
      created_at: now,
      updated_at: now
    }
  })
}

function buildDailyTargets(year, endDate) {
  const startDate = `${year}-01-01`
  const dates = getDatesBetween(startDate, endDate)
  const yearRng = mulberry32(hashString(`targets-${year}`))
  const weightedDays = dates.map((date) => {
    const monthFactor = MONTH_FACTORS[date.getUTCMonth()]
    const weekdayFactor = WEEKDAY_FACTORS[date.getUTCDay()]
    const randomFactor = 0.9 + yearRng() * 0.24

    return {
      date,
      weight: monthFactor * weekdayFactor * randomFactor
    }
  })

  const totalWeight = weightedDays.reduce((sum, item) => sum + item.weight, 0)
  const target = YEAR_TARGETS[year]
  let assigned = 0

  return weightedDays.map((item, index) => {
    const amount = index === weightedDays.length - 1
      ? target - assigned
      : Math.round((target * item.weight) / totalWeight)

    assigned += amount

    return {
      date: toDateOnly(item.date),
      total: amount
    }
  })
}

function buildDayDocuments(dayTarget, customers, sequences) {
  const [year, month, day] = dayTarget.date.split('-').map(Number)
  const rng = mulberry32(hashString(`documents-${dayTarget.date}`))
  const documentWeights = Array.from({ length: DOCS_PER_DAY }, () => 1.18 * (0.82 + rng() * 1.3))

  const weightSum = documentWeights.reduce((sum, weight) => sum + weight, 0)
  const docTotals = []
  let assigned = 0

  for (let index = 0; index < DOCS_PER_DAY; index++) {
    const minValue = 4_500
    if (index === DOCS_PER_DAY - 1) {
      docTotals.push(Math.max(dayTarget.total - assigned, minValue))
      break
    }

    const raw = Math.max(Math.round((dayTarget.total * documentWeights[index]) / weightSum), minValue)
    docTotals.push(raw)
    assigned += raw
  }

  const totalAdjustment = dayTarget.total - docTotals.reduce((sum, total) => sum + total, 0)
  docTotals[docTotals.length - 1] += totalAdjustment

  return docTotals.map((total, index) => {
    const type = 'invoice'
    const customer = customers[Math.floor(rng() * customers.length)]
    const issuedHour = 8 + Math.floor((index * 11 + rng() * 5) % 10)
    const issuedMinute = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55][(index * 3) % 12]
    const paymentMinuteOffset = 4 + Math.floor(rng() * 40)
    const lineCount = total > 70_000 ? 3 : total > 24_000 ? 2 : (rng() > 0.55 ? 2 : 1)
    const lineTotals = distributeTotal(total, lineCount, rng, 1_500)
    const number = `FA-${++sequences.invoice}`
    const note = `${MARKER} ${dayTarget.date} ${type} #${index + 1}`

    const lines = lineTotals.map((lineTotal) => {
      const category = pickWeightedCategory(rng)
      return {
        label: pickLabel(category, rng),
        quantity: 1,
        unitPrice: lineTotal,
        vatRate: VAT_RATE,
        lineTotal,
        categoryHint: category
      }
    })

    const subtotal = lines.reduce((sum, line) => sum + Math.round(line.lineTotal / (1 + line.vatRate / 100)), 0)
    const totalAmount = lines.reduce((sum, line) => sum + line.lineTotal, 0)
    const taxAmount = totalAmount - subtotal
    const methodDraw = rng()
    const paymentMethod = methodDraw < 0.22 ? 'cash' : methodDraw < 0.85 ? 'card_twint' : 'bank_transfer'

    return {
      document: {
        document_number: number,
        type,
        status: 'paid',
        customer_id: customer.id,
        ticket_id: null,
        issued_at: toIsoDateTime(year, month, day, issuedHour, issuedMinute),
        subtotal,
        tax_amount: taxAmount,
        total: totalAmount,
        notes: note,
        created_at: toIsoDateTime(year, month, day, issuedHour, issuedMinute),
        updated_at: toIsoDateTime(year, month, day, issuedHour, issuedMinute)
      },
      lines,
      payment: {
        customer_id: customer.id,
        method: paymentMethod,
        status: 'paid',
        amount: totalAmount,
        paid_at: toIsoDateTime(year, month, day, issuedHour, Math.min(59, issuedMinute + paymentMinuteOffset)),
        notes: `${MARKER} payment`,
        created_at: toIsoDateTime(year, month, day, issuedHour, Math.min(59, issuedMinute + paymentMinuteOffset)),
        updated_at: toIsoDateTime(year, month, day, issuedHour, Math.min(59, issuedMinute + paymentMinuteOffset))
      }
    }
  })
}

async function fetchCurrentSequence(type, prefix) {
  const result = await client.execute({
    sql: `
      SELECT COALESCE(MAX(CAST(SUBSTR(document_number, LENGTH(?) + 2) AS INTEGER)), 0) AS max_value
      FROM documents
      WHERE type = ?
        AND document_number LIKE ?
    `,
    args: [prefix, type, `${prefix}-%`]
  })

  return Number(result.rows[0]?.max_value || 0)
}

async function deleteExistingFixtures() {
  await client.batch([
    { sql: 'DELETE FROM payments WHERE notes LIKE ?', args: [`${MARKER}%`] },
    { sql: 'DELETE FROM document_lines WHERE document_id IN (SELECT id FROM documents WHERE notes LIKE ?)', args: [`${MARKER}%`] },
    { sql: 'DELETE FROM documents WHERE notes LIKE ?', args: [`${MARKER}%`] },
    { sql: 'DELETE FROM customers WHERE notes LIKE ? OR email LIKE ?', args: [`${MARKER}%`, `%@${FIXTURE_DOMAIN}`] }
  ], 'write')
}

async function insertCustomers() {
  const rows = buildCustomerFixtures()
  const inserted = []

  for (const rowsChunk of chunk(rows, 100)) {
    const statement = buildInsertStatement('customers', [
      'first_name',
      'last_name',
      'company_name',
      'phone',
      'email',
      'address_line_1',
      'address_line_2',
      'postal_code',
      'city',
      'notes',
      'created_at',
      'updated_at'
    ], rowsChunk, ['id', 'first_name', 'last_name', 'company_name'])

    const result = await client.execute(statement)
    inserted.push(...result.rows.map(row => ({
      id: Number(row.id),
      firstName: String(row.first_name),
      lastName: String(row.last_name),
      companyName: row.company_name ? String(row.company_name) : null
    })))
  }

  return inserted
}

async function insertDocuments(dataset) {
  let documentCount = 0

  for (const docsChunk of chunk(dataset, BATCH_SIZE)) {
    const documentRows = docsChunk.map(item => item.document)
    const documentInsert = buildInsertStatement('documents', [
      'document_number',
      'type',
      'status',
      'customer_id',
      'ticket_id',
      'issued_at',
      'subtotal',
      'tax_amount',
      'total',
      'notes',
      'created_at',
      'updated_at'
    ], documentRows, ['id', 'document_number', 'customer_id', 'total'])

    const insertedDocuments = await client.execute(documentInsert)
    const documentByNumber = new Map(
      insertedDocuments.rows.map(row => [
        String(row.document_number),
        {
          id: Number(row.id),
          customerId: Number(row.customer_id),
          total: Number(row.total)
        }
      ])
    )

    const lineRows = []
    const paymentRows = []

    for (const item of docsChunk) {
      const insertedDocument = documentByNumber.get(item.document.document_number)
      if (!insertedDocument) {
        throw new Error(`Missing inserted document for ${item.document.document_number}`)
      }

      for (const line of item.lines) {
        lineRows.push({
          document_id: insertedDocument.id,
          catalog_item_id: null,
          label: line.label,
          quantity: line.quantity,
          unit_price: line.unitPrice,
          vat_rate: line.vatRate,
          line_total: line.lineTotal,
          category_hint: line.categoryHint
        })
      }

      paymentRows.push({
        customer_id: insertedDocument.customerId,
        document_id: insertedDocument.id,
        method: item.payment.method,
        status: item.payment.status,
        amount: insertedDocument.total,
        paid_at: item.payment.paid_at,
        notes: item.payment.notes,
        created_at: item.payment.created_at,
        updated_at: item.payment.updated_at
      })
    }

    for (const lineChunk of chunk(lineRows, 400)) {
      const lineInsert = buildInsertStatement('document_lines', [
        'document_id',
        'catalog_item_id',
        'label',
        'quantity',
        'unit_price',
        'vat_rate',
        'line_total',
        'category_hint'
      ], lineChunk)
      await client.execute(lineInsert)
    }

    for (const paymentChunk of chunk(paymentRows, 250)) {
      const paymentInsert = buildInsertStatement('payments', [
        'customer_id',
        'document_id',
        'method',
        'status',
        'amount',
        'paid_at',
        'notes',
        'created_at',
        'updated_at'
      ], paymentChunk)
      await client.execute(paymentInsert)
    }

    documentCount += docsChunk.length
  }

  return documentCount
}

async function updateSequences(sequences) {
  await client.batch([{
    sql: `
      INSERT INTO number_sequences (scope, last_value)
      VALUES (?, ?)
      ON CONFLICT(scope) DO UPDATE SET last_value = excluded.last_value
    `,
    args: ['document:invoice', sequences.invoice]
  }], 'write')
}

async function printSummary() {
  const yearly = await client.execute({
    sql: `
      SELECT SUBSTR(paid_at, 1, 4) AS year, COUNT(*) AS documents, SUM(amount) AS revenue_cents
      FROM payments
      WHERE notes LIKE ?
      GROUP BY SUBSTR(paid_at, 1, 4)
      ORDER BY year
    `,
    args: [`${MARKER}%`]
  })

  console.log('\nFixture revenue summary:')
  for (const row of yearly.rows) {
    console.log(
      `${row.year}: ${row.documents} paiements, CHF ${(Number(row.revenue_cents) / 100).toLocaleString('fr-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    )
  }
}

async function main() {
  const today = new Date().toISOString().slice(0, 10)

  if (today < '2026-01-01') {
    throw new Error(`Current date ${today} is earlier than expected for the 2026 fixtures`)
  }

  console.log('Cleaning previous report fixtures...')
  await deleteExistingFixtures()

  console.log('Inserting fixture customers...')
  const customers = await insertCustomers()

  const sequences = {
    invoice: await fetchCurrentSequence('invoice', 'FA')
  }

  const dayTargets = [
    ...buildDailyTargets(2024, '2024-12-31'),
    ...buildDailyTargets(2025, '2025-12-31'),
    ...buildDailyTargets(2026, today)
  ]

  const dataset = dayTargets.flatMap(dayTarget => buildDayDocuments(dayTarget, customers, sequences))

  console.log(`Generating ${dataset.length} paid fixture documents from 2024-01-01 to ${today}...`)
  await insertDocuments(dataset)
  await updateSequences(sequences)
  await printSummary()
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
