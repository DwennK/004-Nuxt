import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { assistantSqlDebugRequiresAdmin } from '../../server/utils/assistant/policy.ts'

const sqlSource = readFileSync(new URL('../../server/utils/assistant/sql.ts', import.meta.url), 'utf8')
const chatSource = readFileSync(new URL('../../server/utils/assistant/chat.ts', import.meta.url), 'utf8')
const routeSource = readFileSync(new URL('../../server/api/assistant/chat.post.ts', import.meta.url), 'utf8')

test('production SQL debug is wired to the administration capability', () => {
  assert.equal(assistantSqlDebugRequiresAdmin(true, false), true)
  assert.equal(assistantSqlDebugRequiresAdmin(true, true), false)
  assert.match(routeSource, /requireCapability\(event, ['"]administration:manage['"]\)/)
  assert.match(routeSource, /assistantSqlDebugRequiresAdmin\(body\.debug\)/)
})

test('assistant logs use structural metadata instead of generated SQL', () => {
  assert.doesNotMatch(sqlSource, /sql:\s*validatedQuery\.(?:displaySql|normalizedSql|executionSql)/)
  assert.doesNotMatch(chatSource, /sql:\s*planning\.sql/)
  assert.doesNotMatch(chatSource, /reason:\s*message/)
  assert.match(sqlSource, /query:\s*validatedQuery\.audit/)
  assert.match(chatSource, /candidateCharacters:\s*planning\.sql\.length/)
})
