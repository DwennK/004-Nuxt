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

  it.each([
    'SELECT COUNT(c.id) AS total FROM customers c JOIN documents d ON 1 = 1 JOIN payments p ON 1 = 1',
    'SELECT COUNT(c.id) AS total FROM customers c JOIN documents d',
    'SELECT COUNT(c.id) AS total FROM customers c, documents d',
    'SELECT COUNT(c.id) AS total FROM customers c JOIN documents d ON c.id = c.id',
    'SELECT COUNT(c.id) AS total FROM customers c JOIN documents d ON c.id = d.customer_id OR 1 = 1',
    'SELECT COUNT(c.id) AS total FROM customers c JOIN documents d ON (c.id = d.customer_id AND d.id > 0) OR d.id > 0',
    'SELECT COUNT(c.id) AS total FROM customers c JOIN documents d ON NOT (c.id = d.customer_id)',
    'SELECT COUNT(c.id) AS total FROM customers c JOIN documents d ON CASE WHEN 1 = 1 THEN 1 ELSE 1 AND c.id = d.customer_id AND 1 END',
    'SELECT COUNT(c.id) AS total FROM customers c JOIN documents d ON 0 BETWEEN -1 AND c.id = d.customer_id',
    'SELECT COUNT(c.id) AS total FROM customers c JOIN documents d ON \'c.id = d.customer_id\' = \'c.id = d.customer_id\'',
    'SELECT COUNT(c.id) AS total FROM customers c JOIN documents d ON c.id = d.customer_id JOIN payments p ON 1 = 1',
    'SELECT COUNT(c.id) AS total FROM customers c LEFT JOIN documents d ON 1 = 1 LEFT JOIN payments p ON c.id = p.customer_id AND d.id = p.document_id',
    'SELECT COUNT(c.id) AS total FROM customers c JOIN documents d ON 1 = 1 LEFT JOIN payments p ON c.id = p.customer_id AND d.id = p.document_id',
    'SELECT COUNT(c.id) AS total FROM customers c LEFT JOIN documents d JOIN payments p ON c.id = p.customer_id AND d.id = p.document_id',
    'SELECT COUNT(1) AS total FROM customers c JOIN documents c ON 1 = 1',
    'SELECT COUNT(1) AS total FROM (documents JOIN documents d ON 1 = 1)',
    'SELECT COUNT(1) AS total FROM documents d JOIN (documents JOIN documents other ON 1 = 1) ON d.id = other.id',
    'SELECT COUNT(c.id) AS total FROM customers c JOIN (SELECT d.id FROM documents d) ON 1 = 1',
    'SELECT COUNT(c.id) AS total FROM customers c, (SELECT d.id FROM documents d)',
    'SELECT COUNT(1) AS total FROM (SELECT c.id FROM customers c), (SELECT d.id FROM documents d)',
    'SELECT (SELECT COUNT(d.id) FROM documents d JOIN payments p ON 1 = 1) AS total FROM customers c',
    'WITH totals AS (SELECT COUNT(d.id) AS total FROM documents d JOIN payments p ON 1 = 1) SELECT totals.total FROM totals'
  ])('rejects disconnected or optional join predicates before execution: %s', (candidate) => {
    expectRejected(candidate, 'complexity_budget')
  })

  it.each([
    'SELECT c.id, SUM(p.amount) AS total FROM customers c JOIN documents d ON c.id = d.customer_id JOIN payments p ON d.id = p.document_id GROUP BY c.id',
    'SELECT c.id, d.id FROM customers c LEFT JOIN documents d ON c.id = d.customer_id AND (d.status = \'paid\' OR d.status = \'issued\')',
    'SELECT c.id, d.id FROM customers c JOIN documents d ON ((c.id) = (d.customer_id))',
    'SELECT c.id, d.id FROM customers c JOIN documents d ON c.id = d.customer_id AND d.total BETWEEN 0 AND 10000',
    'SELECT c.id, d.id, p.id FROM customers c LEFT JOIN documents d ON c.id = d.customer_id LEFT JOIN payments p ON c.id = p.customer_id AND d.id = p.document_id',
    'SELECT c.id, d.id FROM customers c JOIN documents d ON (c.id = d.customer_id AND d.id > 0) OR (d.customer_id = c.id AND d.id < 10)',
    'SELECT c.id, d.id FROM customers c, documents d WHERE c.id = d.customer_id',
    'SELECT c.id, d.id FROM customers c JOIN documents d ON 1 = 1 WHERE c.id = d.customer_id',
    'SELECT d.id, p.amount FROM documents d JOIN payments p USING (id)',
    'SELECT c.id, (SELECT SUM(p.amount) FROM payments p WHERE p.customer_id = c.id) AS total FROM customers c',
    'SELECT COUNT(1) AS total FROM (SELECT d.id FROM documents d)',
    'WITH totals AS (SELECT p.document_id, SUM(p.amount) AS total FROM payments p GROUP BY p.document_id) SELECT d.id, totals.total FROM documents d JOIN totals ON d.id = totals.document_id'
  ])('preserves connected joins and independent single-source queries: %s', (candidate) => {
    expect(validateAssistantSql(candidate).executionSql).toContain(candidate)
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
