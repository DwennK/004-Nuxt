import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import test from 'node:test'

const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

test('email history remains admin-only; send and replay require financial capability', () => {
  for (const path of ['server/api/sent-emails/index.get.ts', 'server/api/sent-emails/[id].get.ts']) {
    assert.match(read(path), /requireAdminSessionUser\(event\)/)
  }
  const send = read('server/api/documents/[id]/email.post.ts')
  assert.match(send, /requireCapability\(event, 'financial:record'\)/)
  assert.ok(send.indexOf('await requireCapability(') < send.indexOf('await getEmailAttempt('))
  assert.match(send, /requireIdempotencyKey\(event\)/)
})

test('mail code has no legacy transport, public delivery webhook or tracking', () => {
  const sources = [
    'server/utils/documents/email.ts', 'server/utils/sent-emails.ts', 'server/plugins/email-events.ts',
    ...readdirSync(new URL('../../server/utils/email/', import.meta.url)).map(file => `server/utils/email/${file}`)
  ].map(read).join('\n')
  assert.doesNotMatch(sources, /resend|api\.cloudflare\.com|smtp:\/\/|email\.opened|email\.clicked/i)
  assert.match(read('server/plugins/email-events.ts'), /hooks\.hook\('cloudflare:queue'/)
  const config = JSON.parse(read('wrangler.json'))
  assert.deepEqual(config.send_email[0].allowed_sender_addresses, ['info@microwest.ch'])
  assert.equal(config.send_email[0].remote, false)
  assert.equal(config.queues.consumers[0].dead_letter_queue, 'pos-email-events-dlq')
  assert.ok(config.queues.consumers[0].max_retries > 0)
})
