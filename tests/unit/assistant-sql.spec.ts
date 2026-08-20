import { describe, expect, it } from 'vitest'
import { assistantSqlDebugRequiresAdmin } from '../../server/utils/assistant/policy'
import {
  ASSISTANT_MAX_RETURNED_ROWS,
  ASSISTANT_SQL_COMPLEXITY_BUDGET,
  AssistantSqlValidationError,
  validateAssistantSql
} from '../../server/utils/assistant/sql'

function expectRejected(sql: string, code: AssistantSqlValidationError['code']) {
  try {
    validateAssistantSql(sql)
  } catch (error) {
    expect(error).toBeInstanceOf(AssistantSqlValidationError)
    expect((error as AssistantSqlValidationError).code).toBe(code)
    return
  }

  throw new Error(`Expected SQL to be rejected with ${code}`)
}

describe('assistant SQL guardrails', () => {
  it('keeps useful allowlisted aggregates and the hard row probe', () => {
    const validated = validateAssistantSql(`
      SELECT
        p.method,
        COUNT(p.id) AS payment_count,
        ROUND(SUM(p.amount), 2) AS total
      FROM payments p
      WHERE (p.status IN ('paid', 'refunded'))
      GROUP BY p.method
      LIMIT 10
    `)

    expect(validated.displaySql).toContain('LIMIT 10')
    expect(validated.executionSql).toMatch(new RegExp(`LIMIT ${ASSISTANT_MAX_RETURNED_ROWS + 1}$`))
    expect(validated.audit).toMatchObject({
      tables: ['payments'],
      functions: ['count', 'round', 'sum'],
      functionCallCount: 3,
      joinCount: 0,
      limitApplied: false
    })
  })

  it('still applies a 50-row display limit when the model omits or exceeds it', () => {
    const withoutLimit = validateAssistantSql('SELECT p.id, p.amount FROM payments p')
    const excessiveLimit = validateAssistantSql('SELECT p.id, p.amount FROM payments p LIMIT 500')

    expect(withoutLimit.displaySql).toMatch(new RegExp(`LIMIT ${ASSISTANT_MAX_RETURNED_ROWS}$`))
    expect(withoutLimit.limitApplied).toBe(true)
    expect(excessiveLimit.displaySql).toMatch(new RegExp(`LIMIT ${ASSISTANT_MAX_RETURNED_ROWS}$`))
    expect(excessiveLimit.limitApplied).toBe(false)
  })

  it.each([
    'randomblob(1000000000)',
    'RaNdOmBlOb \n (1000000000)',
    'load_extension(\'/tmp/extension\')',
    'readfile(\'/etc/passwd\')',
    'hex(p.id)',
    'left(p.status, 1)',
    'printf(\'%s\', p.id)',
    'json_extract(p.status, \'$\')',
    'sqlite_version()',
    'like(\'%paid%\', p.status)',
    'totally_unknown(p.id)'
  ])('rejects non-allowlisted function syntax: %s', (expression) => {
    expectRejected(
      `SELECT ${expression} AS generated_value FROM payments p LIMIT 1`,
      'disallowed_function'
    )
  })

  it('rejects function identifiers outside the supported lexer alphabet', () => {
    expectRejected('SELECT 坏(1) AS generated_value FROM payments p LIMIT 1', 'invalid_query')
  })

  it('rejects recursive and over-budget queries before execution', () => {
    expectRejected(
      'WITH RECURSIVE recent AS (SELECT p.id FROM payments p) SELECT recent.id FROM recent',
      'complexity_budget'
    )

    const deepExpression = `${'('.repeat(ASSISTANT_SQL_COMPLEXITY_BUDGET.maxParenthesisDepth + 1)}p.id${')'.repeat(ASSISTANT_SQL_COMPLEXITY_BUDGET.maxParenthesisDepth + 1)}`
    expectRejected(
      `SELECT p.id FROM payments p WHERE ${deepExpression} = p.id`,
      'complexity_budget'
    )

    const functionExpressions = Array.from(
      { length: ASSISTANT_SQL_COMPLEXITY_BUDGET.maxFunctionCalls + 1 },
      (_, index) => `LOWER(p.status) AS value_${index}`
    )
    expectRejected(
      `SELECT ${functionExpressions.join(', ')} FROM payments p`,
      'complexity_budget'
    )

    const oversizedLiteral = 'x'.repeat(ASSISTANT_SQL_COMPLEXITY_BUDGET.maxCharacters)
    expectRejected(
      `SELECT p.id FROM payments p WHERE p.status = '${oversizedLiteral}'`,
      'complexity_budget'
    )
  })

  it('preserves table, sensitive-column, and wildcard denials', () => {
    expectRejected('SELECT u.id FROM users u', 'disallowed_table')
    expectRejected('SELECT c.email FROM customers c', 'sensitive_column')
    expectRejected('SELECT * FROM payments', 'invalid_query')
  })

  it('keeps SQL literals out of audit metadata', () => {
    const secretLiteral = 'customer-secret-marker'
    const validated = validateAssistantSql(
      `SELECT p.id FROM payments p WHERE p.status = '${secretLiteral}' LIMIT 1`
    )

    expect(JSON.stringify(validated.audit)).not.toContain(secretLiteral)
    expect(validated.audit).toMatchObject({
      tableCount: 1,
      tables: ['payments'],
      functionCallCount: 0
    })
  })
})

describe('assistant SQL debug policy', () => {
  it('requires an admin only for debug outside development', () => {
    expect(assistantSqlDebugRequiresAdmin(true, false)).toBe(true)
    expect(assistantSqlDebugRequiresAdmin(true, true)).toBe(false)
    expect(assistantSqlDebugRequiresAdmin(false, false)).toBe(false)
  })
})
