import { createApp, eventHandler, toWebHandler } from 'h3'
import { describe, expect, it } from 'vitest'
import {
  fingerprintIdempotencyPayload,
  requireIdempotencyKey
} from '../../server/utils/idempotency'

describe('idempotency contract', () => {
  it('fingerprints logically identical payloads deterministically', async () => {
    const left = await fingerprintIdempotencyPayload({
      payment: { amount: 1200, method: 'cash' },
      documentId: 42
    })
    const right = await fingerprintIdempotencyPayload({
      documentId: 42,
      payment: { method: 'cash', amount: 1200 }
    })

    expect(left).toBe(right)
  })

  it('requires a valid Idempotency-Key header', async () => {
    const app = createApp()
    app.use(eventHandler(event => ({ key: requireIdempotencyKey(event) })))
    const handler = toWebHandler(app)

    const missing = await handler(new Request('http://localhost/'))
    const invalid = await handler(new Request('http://localhost/', {
      headers: { 'Idempotency-Key': 'bad key' }
    }))
    const valid = await handler(new Request('http://localhost/', {
      headers: { 'Idempotency-Key': 'sale_01K3ABCDEFGH' }
    }))

    expect(missing.status).toBe(428)
    expect(invalid.status).toBe(400)
    expect(valid.status).toBe(200)
    await expect(valid.json()).resolves.toEqual({ key: 'sale_01K3ABCDEFGH' })
  })
})
