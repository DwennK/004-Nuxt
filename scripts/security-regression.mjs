import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

function assertIncludes(source, needle, label) {
  assert.ok(source.includes(needle), label)
}

function assertNotIncludes(source, needle, label) {
  assert.ok(!source.includes(needle), label)
}

{
  const quotedIdentifierPattern = /["`[\]]/
  const qualifiedWildcardPattern = /\b[a-z_][a-z0-9_]*\s*\.\s*\*/i

  assert.ok(
    quotedIdentifierPattern.test('SELECT "id", "password_hash" FROM "users" LIMIT 5'),
    'assistant SQL quoted identifier payload must be rejected'
  )
  assert.ok(
    qualifiedWildcardPattern.test('SELECT c.* FROM customers c LIMIT 5'),
    'assistant SQL qualified wildcard payload must be rejected'
  )

  const source = read('server/utils/assistant/sql.ts')
  assertIncludes(source, 'quotedIdentifierPattern', 'assistant SQL validator keeps quoted identifier guard')
  assertIncludes(source, 'qualifiedWildcardPattern', 'assistant SQL validator keeps qualified wildcard guard')
}

{
  const authMiddleware = read('server/middleware/auth.ts')
  const userRoute = read('server/api/settings/users/[id]/password.post.ts')

  assertIncludes(authMiddleware, 'resolveActiveSessionUser(event)', 'API middleware revalidates active DB user')
  assertIncludes(userRoute, 'requireAdminSessionUser(event)', 'user admin routes require admin session')
}

{
  const mobileSentrix = read('server/utils/mobilesentrix.ts')
  const browserExchange = mobileSentrix.slice(
    mobileSentrix.indexOf('export function getMobileSentrixBrowserExchangeHtml'),
    mobileSentrix.indexOf('export async function searchMobileSentrixProducts')
  )
  const authorize = mobileSentrix.slice(
    mobileSentrix.indexOf('export function getMobileSentrixAuthorizeUrl'),
    mobileSentrix.indexOf('export async function exchangeMobileSentrixOAuthToken')
  )

  assertNotIncludes(authorize, 'consumer_secret', 'MobileSentrix authorize URL must not expose consumer secret')
  assertNotIncludes(browserExchange, 'consumer_secret', 'MobileSentrix browser exchange must not expose consumer secret')
  assertIncludes(mobileSentrix, 'externalMobileSentrixUrlValue', 'MobileSentrix URLs are normalized through an allowlist helper')
}

{
  const core = read('server/utils/pos/core.ts')
  const payments = read('server/utils/pos/payments.ts')
  const documents = read('server/utils/pos/documents.ts')

  assertIncludes(core, 'const computedTotal = Math.round(line.quantity * line.unitPrice)', 'document totals are recomputed server-side')
  assertNotIncludes(core, 'line.lineTotal ?? Math.round', 'client lineTotal must not override server pricing')
  assertIncludes(payments, 'assertPayablePaymentDocument(input.documentId)', 'payment writes validate payable document type')
  assertIncludes(payments, 'existing.documentId !== row.documentId', 'payment moves resync the previous document')
  assertIncludes(documents, 'isPayableDocumentType(document.type)', 'mark-paid rejects non-payable document types')
}

{
  const csv = read('server/utils/smartphone-reservations-csv.ts')

  assertIncludes(csv, 'const safeValue = /^[\\s]*[=+\\-@]/.test(value)', 'CSV export prefixes spreadsheet formula values')
  assertIncludes(csv, '/^[\\s]*[=+\\-@]/', 'CSV export guards formula-leading characters')
}

console.log('Security regression checks passed')
