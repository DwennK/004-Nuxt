import { sql } from 'drizzle-orm'
import { ensurePosSchema } from '~~/server/utils/pos/core'
import { useDb } from '~~/server/utils/turso'
import type { AssistantTableCell } from '~~/shared/types/assistant'
import {
  assistantAllowedColumnsByTable,
  assistantAllowedTables,
  assistantBlockedColumns,
  assistantBlockedTables
} from './allowlist'

export const ASSISTANT_MAX_RETURNED_ROWS = 50
const ASSISTANT_ROW_PROBE_LIMIT = ASSISTANT_MAX_RETURNED_ROWS + 1
const ASSISTANT_QUERY_TIMEOUT_MS = 3000

const forbiddenSqlTokenPattern = /\b(insert|update|delete|alter|drop|truncate|create|grant|revoke|copy|call|do|execute|pragma|attach|detach|begin|commit|rollback|savepoint|release|vacuum|reindex|analyze)\b/i
const commentPattern = /--|\/\*|\*\//
const limitPattern = /\blimit\s+(\d+)\b/i
const withCtePattern = /\bwith\s+([a-z_][a-z0-9_]*)\s+as\s*\(/ig
const qualifiedColumnPattern = /\b([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\b/ig
const blockedColumnPattern = new RegExp(`\\b(${[...assistantBlockedColumns].sort().join('|')})\\b`, 'i')
const quotedIdentifierPattern = /["`[\]]/
const qualifiedWildcardPattern = /\b[a-z_][a-z0-9_]*\s*\.\s*\*/i

const sqlKeywordTokens = new Set([
  'as',
  'asc',
  'and',
  'between',
  'by',
  'case',
  'desc',
  'distinct',
  'else',
  'end',
  'false',
  'from',
  'group',
  'having',
  'in',
  'is',
  'join',
  'left',
  'like',
  'limit',
  'not',
  'null',
  'on',
  'or',
  'order',
  'select',
  'then',
  'true',
  'using',
  'when',
  'where',
  'with'
])
const sqlFunctionTokens = new Set([
  'avg',
  'cast',
  'coalesce',
  'count',
  'date',
  'datetime',
  'ifnull',
  'lower',
  'max',
  'min',
  'nullif',
  'round',
  'strftime',
  'substr',
  'substring',
  'sum',
  'trim',
  'upper'
])
const tableReferenceBoundaryTokens = new Set([
  'cross',
  'except',
  'full',
  'group',
  'having',
  'inner',
  'intersect',
  'join',
  'left',
  'limit',
  'on',
  'order',
  'right',
  'union',
  'using',
  'where'
])
const tableAliasStopTokens = new Set([
  ...tableReferenceBoundaryTokens,
  'as'
])

type SqlToken = {
  kind: 'identifier' | 'symbol'
  value: string
  lower: string
}

type TableReference = {
  tableName: string
  alias: string | null
}

export type AssistantValidatedQuery = {
  normalizedSql: string
  displaySql: string
  executionSql: string
  limitApplied: boolean
}

export class AssistantSqlValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AssistantSqlValidationError'
  }
}

function normalizeCandidateSql(candidate: string) {
  return candidate.trim().replace(/;$/, '').trim()
}

function buildCteNameSet(sqlText: string) {
  const cteNames = new Set<string>()

  for (const match of sqlText.matchAll(withCtePattern)) {
    cteNames.add(match[1]!.toLowerCase())
  }

  return cteNames
}

function stripStringLiterals(sqlText: string) {
  return sqlText.replace(/'(?:''|[^'])*'/g, '\'\'')
}

function tokenizeSql(sqlText: string) {
  const tokens: SqlToken[] = []
  const tokenPattern = /[a-z_][a-z0-9_]*|[(),.]/ig

  for (const match of stripStringLiterals(sqlText).matchAll(tokenPattern)) {
    const value = match[0]
    const isIdentifier = /^[a-z_]/i.test(value)
    tokens.push({
      kind: isIdentifier ? 'identifier' : 'symbol',
      value,
      lower: value.toLowerCase()
    })
  }

  return tokens
}

function isIdentifierToken(token: SqlToken | undefined): token is SqlToken & { kind: 'identifier' } {
  return token?.kind === 'identifier'
}

function extractTableReferences(sqlText: string) {
  const tokens = tokenizeSql(sqlText)
  const references: TableReference[] = []

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]

    if (!isIdentifierToken(token) || (token.lower !== 'from' && token.lower !== 'join')) {
      continue
    }

    for (index += 1; index < tokens.length; index += 1) {
      const current = tokens[index]

      if (isIdentifierToken(current) && tableReferenceBoundaryTokens.has(current.lower)) {
        index -= 1
        break
      }

      if (current?.kind === 'symbol' && current.value === ',') {
        continue
      }

      if (current?.kind === 'symbol' && current.value === '(') {
        break
      }

      if (!isIdentifierToken(current)) {
        continue
      }

      let alias: string | null = null
      const next = tokens[index + 1]
      const afterNext = tokens[index + 2]

      if (isIdentifierToken(next) && next.lower === 'as' && isIdentifierToken(afterNext)) {
        alias = afterNext.lower
        index += 2
      } else if (isIdentifierToken(next) && !tableAliasStopTokens.has(next.lower)) {
        alias = next.lower
        index += 1
      }

      references.push({
        tableName: current.lower,
        alias
      })
    }
  }

  return references
}

function buildOutputAliasSet(sqlText: string) {
  const aliases = new Set<string>()
  const aliasPattern = /\bas\s+([a-z_][a-z0-9_]*)\b/ig

  for (const match of stripStringLiterals(sqlText).matchAll(aliasPattern)) {
    aliases.add(match[1]!.toLowerCase())
  }

  return aliases
}

function assertSingleReadOnlyStatement(sqlText: string) {
  if (!sqlText) {
    throw new AssistantSqlValidationError('La requête générée est vide.')
  }

  if (commentPattern.test(sqlText)) {
    throw new AssistantSqlValidationError('Les commentaires SQL ne sont pas autorisés.')
  }

  if (sqlText.includes(';')) {
    throw new AssistantSqlValidationError('Une seule instruction SQL est autorisée.')
  }

  if (!/^(select|with)\b/i.test(sqlText)) {
    throw new AssistantSqlValidationError('Seules les requêtes SELECT en lecture seule sont autorisées.')
  }

  if (forbiddenSqlTokenPattern.test(sqlText)) {
    throw new AssistantSqlValidationError('La requête contient un mot-clé SQL interdit pour un accès en lecture seule.')
  }

  if (quotedIdentifierPattern.test(sqlText)) {
    throw new AssistantSqlValidationError('Les identifiants SQL cités ne sont pas autorisés.')
  }

  if (/\bselect\s+\*/i.test(sqlText) || /,\s*\*/.test(sqlText) || qualifiedWildcardPattern.test(sqlText)) {
    throw new AssistantSqlValidationError('SELECT * est interdit. La requête doit lister explicitement les colonnes.')
  }

  if (blockedColumnPattern.test(sqlText)) {
    throw new AssistantSqlValidationError('La requête tente d’accéder à une colonne sensible bloquée.')
  }
}

function assertAllowedTables(sqlText: string) {
  const cteNames = buildCteNameSet(sqlText)

  for (const reference of extractTableReferences(sqlText)) {
    if (cteNames.has(reference.tableName)) {
      continue
    }

    if (assistantBlockedTables.has(reference.tableName)) {
      throw new AssistantSqlValidationError(`La table "${reference.tableName}" est explicitement bloquée.`)
    }

    if (!assistantAllowedTables.has(reference.tableName)) {
      throw new AssistantSqlValidationError(`La table "${reference.tableName}" n’est pas exposée à l’assistant.`)
    }
  }
}

function buildQualifierMap(sqlText: string) {
  const qualifierToTable = new Map<string, string>()
  const cteNames = buildCteNameSet(sqlText)

  for (const reference of extractTableReferences(sqlText)) {
    if (cteNames.has(reference.tableName)) {
      continue
    }

    if (!assistantAllowedTables.has(reference.tableName)) {
      continue
    }

    qualifierToTable.set(reference.tableName, reference.tableName)

    if (reference.alias) {
      qualifierToTable.set(reference.alias, reference.tableName)
    }
  }

  return qualifierToTable
}

function assertAllowedColumns(sqlText: string) {
  const qualifierMap = buildQualifierMap(sqlText)
  const cteNames = buildCteNameSet(sqlText)

  for (const match of sqlText.matchAll(qualifiedColumnPattern)) {
    const qualifier = match[1]!.toLowerCase()
    const columnName = match[2]!.toLowerCase()
    const tableName = qualifierMap.get(qualifier)

    if (!tableName && cteNames.has(qualifier)) {
      continue
    }

    if (!tableName) {
      throw new AssistantSqlValidationError(
        `Le qualifiant "${qualifier}" n’est pas une table ou un alias exposé à l’assistant.`
      )
    }

    const allowedColumns = assistantAllowedColumnsByTable[tableName]

    if (!allowedColumns?.has(columnName)) {
      throw new AssistantSqlValidationError(
        `La colonne "${qualifier}.${columnName}" n’est pas exposée à l’assistant.`
      )
    }
  }

  const tokens = tokenizeSql(sqlText)
  const aliases = buildOutputAliasSet(sqlText)
  const referencedTables = [...new Set(qualifierMap.values())]

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]

    if (!isIdentifierToken(token)) {
      continue
    }

    const previous = tokens[index - 1]
    const next = tokens[index + 1]

    if (
      previous?.value === '.'
      || next?.value === '.'
      || previous?.lower === 'as'
      || next?.value === '('
      || sqlKeywordTokens.has(token.lower)
      || sqlFunctionTokens.has(token.lower)
      || aliases.has(token.lower)
      || cteNames.has(token.lower)
      || qualifierMap.has(token.lower)
    ) {
      continue
    }

    const allowedByReferencedTable = referencedTables.some((tableName) => {
      return assistantAllowedColumnsByTable[tableName]?.has(token.lower)
    })

    if (!allowedByReferencedTable) {
      throw new AssistantSqlValidationError(
        `La colonne "${token.lower}" n’est pas exposée à l’assistant.`
      )
    }
  }
}

function buildDisplaySql(normalizedSql: string, limitApplied: boolean) {
  if (limitApplied) {
    return `${normalizedSql}\nLIMIT ${ASSISTANT_MAX_RETURNED_ROWS}`
  }

  const match = normalizedSql.match(limitPattern)

  if (!match) {
    return normalizedSql
  }

  const currentLimit = Number(match[1])

  if (currentLimit <= ASSISTANT_MAX_RETURNED_ROWS) {
    return normalizedSql
  }

  return normalizedSql.replace(limitPattern, `LIMIT ${ASSISTANT_MAX_RETURNED_ROWS}`)
}

export function validateAssistantSql(candidate: string): AssistantValidatedQuery {
  const normalizedSql = normalizeCandidateSql(candidate)

  assertSingleReadOnlyStatement(normalizedSql)
  assertAllowedTables(normalizedSql)
  assertAllowedColumns(normalizedSql)

  const limitMatch = normalizedSql.match(limitPattern)
  const limitApplied = !limitMatch
  const displaySql = buildDisplaySql(normalizedSql, limitApplied)
  const executionSql = `SELECT * FROM (${normalizedSql}) AS assistant_guarded_query LIMIT ${ASSISTANT_ROW_PROBE_LIMIT}`

  return {
    normalizedSql,
    displaySql,
    executionSql,
    limitApplied
  }
}

function shapeCellValue(value: unknown): AssistantTableCell {
  if (value === null || value === undefined) {
    return null
  }

  if (typeof value === 'string') {
    const normalized = value.replace(/\s+/g, ' ').trim()
    return normalized.length > 160 ? `${normalized.slice(0, 157)}...` : normalized
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value
  }

  return String(value)
}

export async function runReadOnlyQuery(validatedQuery: AssistantValidatedQuery, requestId: string) {
  await ensurePosSchema()

  const db = useDb()
  const startedAt = Date.now()

  try {
    const rows = await Promise.race([
      db.all<Record<string, unknown>>(sql.raw(validatedQuery.executionSql)),
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new AssistantSqlValidationError('La requête a dépassé le délai maximal de 3 secondes.'))
        }, ASSISTANT_QUERY_TIMEOUT_MS)
      })
    ])

    const truncated = rows.length > ASSISTANT_MAX_RETURNED_ROWS
    const visibleRows = rows.slice(0, ASSISTANT_MAX_RETURNED_ROWS)
    const columns = visibleRows.length ? Object.keys(visibleRows[0]!) : []
    const shapedRows = visibleRows.map((row) => {
      return Object.fromEntries(
        Object.entries(row).map(([key, value]) => [key, shapeCellValue(value)])
      ) as Record<string, AssistantTableCell>
    })

    console.info(JSON.stringify({
      scope: 'assistant-sql',
      requestId,
      accepted: true,
      sql: validatedQuery.displaySql,
      durationMs: Date.now() - startedAt,
      rowCount: shapedRows.length,
      truncated
    }))

    return {
      columns,
      rows: shapedRows,
      rowCount: shapedRows.length,
      truncated
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Query failed'
    const timeout = message.includes('délai maximal')

    console.warn(JSON.stringify({
      scope: 'assistant-sql',
      requestId,
      accepted: false,
      sql: validatedQuery.displaySql,
      durationMs: Date.now() - startedAt,
      reason: message
    }))

    throw new AssistantSqlValidationError(
      timeout
        ? 'La requête a dépassé le délai maximal de 3 secondes.'
        : 'La requête validée n’a pas pu être exécutée.'
    )
  }
}
