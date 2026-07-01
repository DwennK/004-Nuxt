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

function assertBefore(source, firstNeedle, secondNeedle, label) {
  const firstIndex = source.indexOf(firstNeedle)
  const secondIndex = source.indexOf(secondNeedle)

  assert.ok(firstIndex >= 0, `${label}: missing ${firstNeedle}`)
  assert.ok(secondIndex >= 0, `${label}: missing ${secondNeedle}`)
  assert.ok(firstIndex < secondIndex, label)
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
  const allowlist = read('server/utils/assistant/allowlist.ts')

  assertIncludes(source, 'quotedIdentifierPattern', 'assistant SQL validator keeps quoted identifier guard')
  assertIncludes(source, 'qualifiedWildcardPattern', 'assistant SQL validator keeps qualified wildcard guard')
  assertIncludes(source, 'extractTableReferences', 'assistant SQL validator enumerates table references')
  assertIncludes(source, 'tableReferenceBoundaryTokens', 'assistant SQL validator has explicit table-reference boundaries')
  assertIncludes(source, 'Le qualifiant "${qualifier}" n’est pas une table ou un alias exposé', 'assistant SQL validator rejects unknown table qualifiers')
  assertIncludes(source, 'La colonne "${token.lower}" n’est pas exposée à l’assistant', 'assistant SQL validator rejects unqualified non-allowlisted columns')
  assertIncludes(allowlist, '\'password_hash\'', 'assistant SQL denylist blocks password hashes by token')
  assertIncludes(allowlist, '\'address_line_1\'', 'assistant SQL denylist blocks hidden customer address line 1 by token')
  assertIncludes(allowlist, '\'address_line_2\'', 'assistant SQL denylist blocks hidden customer address line 2 by token')
  assertNotIncludes(source, 'const fromJoinPattern', 'assistant SQL table allowlist must not rely on the old single-table FROM/JOIN regex')
}

{
  const authMiddleware = read('server/middleware/auth.ts')
  const userRoute = read('server/api/settings/users/[id]/password.post.ts')

  assertIncludes(authMiddleware, 'resolveActiveSessionUser(event)', 'API middleware revalidates active DB user')
  assertIncludes(userRoute, 'requireAdminSessionUser(event)', 'user admin routes require admin session')
}

{
  const protectedRoutes = [
    ['server/api/settings/company.patch.ts', 'readValidatedBody'],
    ['server/api/settings/customer-sms.patch.ts', 'readValidatedBody'],
    ['server/api/tools/woocommerce/orders.get.ts', 'getValidatedQuery'],
    ['server/api/tools/woocommerce/import.post.ts', 'readValidatedBody'],
    ['server/api/sent-emails/index.get.ts', 'getQuery'],
    ['server/api/sent-emails/[id].get.ts', 'paramsSchema.parse']
  ]

  for (const [path, requestRead] of protectedRoutes) {
    const source = read(path)
    assertIncludes(source, 'import { requireAdminSessionUser } from \'~~/server/utils/auth/session\'', `${path} imports the admin guard`)
    assertBefore(source, 'await requireAdminSessionUser(event)', requestRead, `${path} checks admin before reading attacker-controlled request data`)
  }
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
