import type { SmartphoneReservationRequest, SmartphoneReservationStatus } from '~/types'

type ParsedReservationInput = Omit<SmartphoneReservationRequest, 'id'>

const statusLabels: Record<SmartphoneReservationStatus, string> = {
  pending: 'En attente',
  contacted: 'Contacte',
  sold: 'Vendu'
}

const headerAliases = {
  name: ['nom', 'name'],
  phone: ['telephone', 'tel', 'phone'],
  model: ['modele', 'model'],
  storage: ['stockage', 'storage'],
  requestedAt: ['datedemande', 'date', 'requestedat', 'requesteddate'],
  status: ['etat', 'status'],
  notes: ['remarques', 'remarque', 'notes', 'note']
} as const

function normalizeToken(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function detectDelimiter(content: string) {
  const firstLine = content.split('\n', 1)[0] || ''
  const commas = firstLine.split(',').length - 1
  const semicolons = firstLine.split(';').length - 1

  return semicolons > commas ? ';' : ','
}

function parseRows(content: string, delimiter: string) {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index]

    if (inQuotes) {
      if (char === '"') {
        if (content[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }

      continue
    }

    if (char === '"') {
      inQuotes = true
      continue
    }

    if (char === delimiter) {
      row.push(field)
      field = ''
      continue
    }

    if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      continue
    }

    field += char
  }

  row.push(field)
  rows.push(row)

  return rows.filter(currentRow => currentRow.some(cell => cell.trim() !== ''))
}

function getHeaderMap(headerRow: string[]) {
  const normalizedHeaders = headerRow.map(value => normalizeToken(value))

  const map = {
    name: -1,
    phone: -1,
    model: -1,
    storage: -1,
    requestedAt: -1,
    status: -1,
    notes: -1
  }

  for (const [key, aliases] of Object.entries(headerAliases)) {
    map[key as keyof typeof map] = normalizedHeaders.findIndex(header => aliases.includes(header as never))
  }

  const requiredHeaders = ['name', 'phone', 'model', 'storage'] as const
  const missing = requiredHeaders.filter(key => map[key] === -1)

  if (missing.length) {
    throw createError({
      statusCode: 400,
      statusMessage: `Colonnes CSV manquantes: ${missing.join(', ')}`
    })
  }

  return map
}

function normalizeStatus(value: string) {
  const normalized = normalizeToken(value)

  if (!normalized) {
    return 'pending'
  }

  if (['pending', 'enattente', 'attente'].includes(normalized)) {
    return 'pending'
  }

  if (['contacted', 'contacte', 'contactedclient'].includes(normalized)) {
    return 'contacted'
  }

  if (['sold', 'vendu', 'vendue'].includes(normalized)) {
    return 'sold'
  }

  throw new Error(`etat invalide "${value}"`)
}

function escapeCsvField(value: string) {
  const safeValue = /^[\s]*[=+\-@]/.test(value) || /^[\t\r]/.test(value)
    ? `'${value}`
    : value

  if (/[;"\n]/.test(safeValue)) {
    return `"${safeValue.replace(/"/g, '""')}"`
  }

  return safeValue
}

function getCell(row: string[], index: number) {
  if (index < 0) {
    return ''
  }

  return (row[index] || '').trim()
}

export function parseSmartphoneReservationsCsv(content: string): ParsedReservationInput[] {
  const normalizedContent = content
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')

  const delimiter = detectDelimiter(normalizedContent)
  const rows = parseRows(normalizedContent, delimiter)

  if (!rows.length) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Fichier CSV vide'
    })
  }

  const [headerRow, ...dataRows] = rows

  if (!headerRow) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Entete CSV introuvable'
    })
  }

  const headerMap = getHeaderMap(headerRow)
  const today = new Date().toISOString().slice(0, 10)

  return dataRows.map((row, rowIndex) => {
    const lineNumber = rowIndex + 2
    const requestedAt = getCell(row, headerMap.requestedAt) || today

    if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedAt)) {
      throw createError({
        statusCode: 400,
        statusMessage: `Ligne ${lineNumber}: date invalide "${requestedAt}" (format attendu YYYY-MM-DD)`
      })
    }

    try {
      const name = getCell(row, headerMap.name)
      const phone = getCell(row, headerMap.phone)
      const model = getCell(row, headerMap.model)
      const storage = getCell(row, headerMap.storage)

      if (!name || !phone || !model || !storage) {
        throw new Error('colonnes obligatoires vides')
      }

      return {
        name,
        phone,
        model,
        storage,
        requestedAt,
        status: normalizeStatus(getCell(row, headerMap.status)),
        notes: getCell(row, headerMap.notes)
      }
    } catch (error) {
      throw createError({
        statusCode: 400,
        statusMessage: `Ligne ${lineNumber}: ${error instanceof Error ? error.message : 'contenu invalide'}`
      })
    }
  })
}

export function buildSmartphoneReservationsCsv(rows: SmartphoneReservationRequest[]) {
  const header = ['Nom', 'Telephone', 'Modele', 'Stockage', 'DateDemande', 'Etat', 'Remarques']
  const lines = rows.map(row => [
    row.name,
    row.phone,
    row.model,
    row.storage,
    row.requestedAt,
    statusLabels[row.status],
    row.notes
  ].map(value => escapeCsvField(value || '')).join(';'))

  return [header.join(';'), ...lines].join('\n')
}
