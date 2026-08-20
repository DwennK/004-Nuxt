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

export const ASSISTANT_SQL_COMPLEXITY_BUDGET = Object.freeze({
  maxCharacters: 4_000,
  maxTokens: 512,
  maxTableReferences: 8,
  maxJoins: 6,
  maxCtes: 4,
  maxSelects: 6,
  maxFunctionCalls: 24,
  maxParenthesisDepth: 10
})

export const ASSISTANT_ALLOWED_SQL_FUNCTIONS = [
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
] as const

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
const parenthesizedSqlSyntaxTokens = new Set([
  'and',
  'as',
  'between',
  'by',
  'case',
  'distinct',
  'else',
  'from',
  'having',
  'in',
  'is',
  'join',
  'limit',
  'not',
  'on',
  'or',
  'select',
  'then',
  'using',
  'when',
  'where'
])
const sqlFunctionTokens = new Set<string>(ASSISTANT_ALLOWED_SQL_FUNCTIONS)
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

type AssistantSqlAnalysis = {
  tokens: SqlToken[]
  tableReferences: TableReference[]
  functionCalls: string[]
  joinCount: number
  cteCount: number
  selectCount: number
  maxParenthesisDepth: number
}

export type AssistantSqlAuditMetadata = {
  characterCount: number
  tokenCount: number
  tableCount: number
  tables: string[]
  functionCallCount: number
  functions: string[]
  joinCount: number
  cteCount: number
  selectCount: number
  maxParenthesisDepth: number
  limitApplied: boolean
}

export type AssistantSqlValidationCode = 'invalid_query'
  | 'read_only_violation'
  | 'sensitive_column'
  | 'disallowed_table'
  | 'disallowed_column'
  | 'disallowed_function'
  | 'complexity_budget'
  | 'query_timeout'
  | 'query_execution_failed'

export type AssistantValidatedQuery = {
  normalizedSql: string
  displaySql: string
  executionSql: string
  limitApplied: boolean
  audit: AssistantSqlAuditMetadata
}

export class AssistantSqlValidationError extends Error {
  code: AssistantSqlValidationCode

  constructor(message: string, code: AssistantSqlValidationCode = 'invalid_query') {
    super(message)
    this.name = 'AssistantSqlValidationError'
    this.code = code
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

function containsUnsupportedSqlSyntax(sqlText: string) {
  return [...stripStringLiterals(sqlText)].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0
    const allowedWhitespace = character === '\t' || character === '\n' || character === '\r'
    return codePoint > 0x7e || (codePoint < 0x20 && !allowedWhitespace)
  })
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

function extractFunctionCalls(tokens: SqlToken[]) {
  const functionCalls: string[] = []

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    const next = tokens[index + 1]

    if (!isIdentifierToken(token) || next?.value !== '(') {
      continue
    }

    // Fixed SQL grammar tokens can introduce an expression in parentheses,
    // for example IN (...) or a CTE declared with AS (...).
    if (parenthesizedSqlSyntaxTokens.has(token.lower)) {
      continue
    }

    functionCalls.push(token.lower)
  }

  return functionCalls
}

function measureParenthesisDepth(sqlText: string) {
  let currentDepth = 0
  let maxDepth = 0

  for (const character of stripStringLiterals(sqlText)) {
    if (character === '(') {
      currentDepth += 1
      maxDepth = Math.max(maxDepth, currentDepth)
    } else if (character === ')') {
      currentDepth -= 1

      if (currentDepth < 0) {
        throw new AssistantSqlValidationError('Les parenthèses SQL sont déséquilibrées.')
      }
    }
  }

  if (currentDepth !== 0) {
    throw new AssistantSqlValidationError('Les parenthèses SQL sont déséquilibrées.')
  }

  return maxDepth
}

function analyzeAssistantSql(sqlText: string): AssistantSqlAnalysis {
  const tokens = tokenizeSql(sqlText)
  const startsWithCte = /^with\b/i.test(sqlText)

  return {
    tokens,
    tableReferences: extractTableReferences(sqlText),
    functionCalls: extractFunctionCalls(tokens),
    joinCount: tokens.filter(token => token.lower === 'join').length,
    cteCount: startsWithCte
      ? tokens.filter((token, index) => token.lower === 'as' && tokens[index + 1]?.value === '(').length
      : 0,
    selectCount: tokens.filter(token => token.lower === 'select').length,
    maxParenthesisDepth: measureParenthesisDepth(sqlText)
  }
}

function assertAllowedFunctions(analysis: AssistantSqlAnalysis) {
  for (const functionName of analysis.functionCalls) {
    if (!sqlFunctionTokens.has(functionName)) {
      throw new AssistantSqlValidationError(
        `La fonction SQL "${functionName}" n’est pas autorisée.`,
        'disallowed_function'
      )
    }
  }
}

function assertComplexityBudget(sqlText: string, analysis: AssistantSqlAnalysis) {
  const budget = ASSISTANT_SQL_COMPLEXITY_BUDGET

  if (/^with\s+recursive\b/i.test(sqlText)) {
    throw new AssistantSqlValidationError(
      'Les CTE récursives ne sont pas autorisées.',
      'complexity_budget'
    )
  }

  const exceeded = [
    sqlText.length > budget.maxCharacters,
    analysis.tokens.length > budget.maxTokens,
    analysis.tableReferences.length > budget.maxTableReferences,
    analysis.joinCount > budget.maxJoins,
    analysis.cteCount > budget.maxCtes,
    analysis.selectCount > budget.maxSelects,
    analysis.functionCalls.length > budget.maxFunctionCalls,
    analysis.maxParenthesisDepth > budget.maxParenthesisDepth
  ].some(Boolean)

  if (exceeded) {
    throw new AssistantSqlValidationError(
      'La requête dépasse le budget de complexité autorisé.',
      'complexity_budget'
    )
  }
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
    throw new AssistantSqlValidationError(
      'Seules les requêtes SELECT en lecture seule sont autorisées.',
      'read_only_violation'
    )
  }

  if (forbiddenSqlTokenPattern.test(sqlText)) {
    throw new AssistantSqlValidationError(
      'La requête contient un mot-clé SQL interdit pour un accès en lecture seule.',
      'read_only_violation'
    )
  }

  if (quotedIdentifierPattern.test(sqlText)) {
    throw new AssistantSqlValidationError('Les identifiants SQL cités ne sont pas autorisés.')
  }

  if (containsUnsupportedSqlSyntax(sqlText)) {
    throw new AssistantSqlValidationError('La requête contient une syntaxe SQL non prise en charge.')
  }

  if (/\bselect\s+\*/i.test(sqlText) || /,\s*\*/.test(sqlText) || qualifiedWildcardPattern.test(sqlText)) {
    throw new AssistantSqlValidationError('SELECT * est interdit. La requête doit lister explicitement les colonnes.')
  }

  if (blockedColumnPattern.test(sqlText)) {
    throw new AssistantSqlValidationError(
      'La requête tente d’accéder à une colonne sensible bloquée.',
      'sensitive_column'
    )
  }
}

function assertAllowedTables(sqlText: string, tableReferences: TableReference[]) {
  const cteNames = buildCteNameSet(sqlText)

  for (const reference of tableReferences) {
    if (cteNames.has(reference.tableName)) {
      continue
    }

    if (assistantBlockedTables.has(reference.tableName)) {
      throw new AssistantSqlValidationError(
        `La table "${reference.tableName}" est explicitement bloquée.`,
        'disallowed_table'
      )
    }

    if (!assistantAllowedTables.has(reference.tableName)) {
      throw new AssistantSqlValidationError(
        `La table "${reference.tableName}" n’est pas exposée à l’assistant.`,
        'disallowed_table'
      )
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
        `Le qualifiant "${qualifier}" n’est pas une table ou un alias exposé à l’assistant.`,
        'disallowed_column'
      )
    }

    const allowedColumns = assistantAllowedColumnsByTable[tableName]

    if (!allowedColumns?.has(columnName)) {
      throw new AssistantSqlValidationError(
        `La colonne "${qualifier}.${columnName}" n’est pas exposée à l’assistant.`,
        'disallowed_column'
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
        `La colonne "${token.lower}" n’est pas exposée à l’assistant.`,
        'disallowed_column'
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
  const analysis = analyzeAssistantSql(normalizedSql)

  assertAllowedFunctions(analysis)
  assertComplexityBudget(normalizedSql, analysis)
  assertAllowedTables(normalizedSql, analysis.tableReferences)
  assertAllowedColumns(normalizedSql)

  const limitMatch = normalizedSql.match(limitPattern)
  const limitApplied = !limitMatch
  const displaySql = buildDisplaySql(normalizedSql, limitApplied)
  const executionSql = `SELECT * FROM (${normalizedSql}) AS assistant_guarded_query LIMIT ${ASSISTANT_ROW_PROBE_LIMIT}`
  const cteNames = buildCteNameSet(normalizedSql)
  const tables = [...new Set(
    analysis.tableReferences
      .map(reference => reference.tableName)
      .filter(tableName => !cteNames.has(tableName))
  )]
  const functions = [...new Set(analysis.functionCalls)]

  return {
    normalizedSql,
    displaySql,
    executionSql,
    limitApplied,
    audit: {
      characterCount: normalizedSql.length,
      tokenCount: analysis.tokens.length,
      tableCount: tables.length,
      tables,
      functionCallCount: analysis.functionCalls.length,
      functions,
      joinCount: analysis.joinCount,
      cteCount: analysis.cteCount,
      selectCount: analysis.selectCount,
      maxParenthesisDepth: analysis.maxParenthesisDepth,
      limitApplied
    }
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
      query: validatedQuery.audit,
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
      query: validatedQuery.audit,
      durationMs: Date.now() - startedAt,
      reason: timeout ? 'query_timeout' : 'query_execution_failed'
    }))

    throw new AssistantSqlValidationError(
      timeout
        ? 'La requête a dépassé le délai maximal de 3 secondes.'
        : 'La requête validée n’a pas pu être exécutée.',
      timeout ? 'query_timeout' : 'query_execution_failed'
    )
  }
}
