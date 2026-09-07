import { createDossierClient } from '~/utils/dossier-client'
import type { DossierTarget } from '~~/shared/types/dossier'

export default defineNuxtPlugin(() => {
  const original = globalThis.$fetch
  const dossiers = createDossierClient(original)
  const attempts = new Map<string, Record<string, string>>()
  let dossierFetch = original
  if (import.meta.client) {
    dossierFetch = original.create({
      async onRequest({ request, options }) {
        const path = String(request).split('?')[0] || ''
        const method = String(options.method || 'GET').toUpperCase()
        if (method === 'GET' || method === 'HEAD' || !path.startsWith('/api/'))
          return
        const match = path.match(
          /^\/api\/(tickets|documents|payments)\/(\d+)(?:\/(status|close|notes|quote|order|invoice|mark-paid))?$/
        )
        const body
          = options.body && typeof options.body === 'object'
            ? (options.body as Record<string, unknown>)
            : {}
        const targets: Array<DossierTarget & { standalone?: boolean }> = []
        if (match)
          targets.push({
            kind: match[1]!.slice(0, -1) as DossierTarget['kind'],
            id: Number(match[2])
          })
        if (match?.[1] === 'tickets' && method === 'DELETE') {
          const target = { kind: 'ticket' as const, id: Number(match[2]) }
          const record = await original<{ documents: Array<{ id: number }>, dossier: { key: string, revision: number } }>(path)
          dossiers.snapshot(target, record)
          targets.push(...record.documents.map(document => ({ kind: 'document' as const, id: document.id, standalone: true })))
        }
        if (
          (path === '/api/payments'
            || path === '/api/tools/shopify/payments')
          && body.documentId
        )
          targets.push({ kind: 'document', id: Number(body.documentId) })
        if (
          (path === '/api/documents' || match?.[1] === 'documents')
          && body.ticketId
        )
          targets.push({ kind: 'ticket', id: Number(body.ticketId) })
        if (match?.[1] === 'documents' && method === 'PATCH' && !body.ticketId)
          targets.push({
            kind: 'document',
            id: Number(match[2]),
            standalone: true
          })
        if (path === '/api/sales/create-and-pay') {
          const document = body.document as { ticketId?: number } | undefined
          if (document?.ticketId)
            targets.push({ kind: 'ticket', id: document.ticketId })
        }
        if (!targets.length) return
        options.retry = 0
        const attemptKey = options.headers.get('idempotency-key')
        const headers
          = (attemptKey && attempts.get(`${path}:${attemptKey}`))
            || (await dossiers.prepare(targets))
        if (attemptKey) {
          const id = `${path}:${attemptKey}`
          attempts.set(id, headers)
          const requestBody = structuredClone(options.body)
          dossiers.retries[id] = {
            failed: false,
            scopeKeys: JSON.parse(headers['X-Dossier-Proofs'] || '[]').map((proof: { key: string }) => proof.key),
            run: () => dossierFetch(path, { method: method as 'POST' | 'PATCH' | 'DELETE', body: requestBody, headers: { ...headers, 'Idempotency-Key': attemptKey }, retry: 0 })
          }
        }
        for (const [key, value] of Object.entries(headers))
          options.headers.set(key, value)
      },
      onRequestError({ request, options }) {
        const id = `${String(request).split('?')[0]}:${options.headers.get('idempotency-key')}`
        const retry = dossiers.retries[id]
        if (retry) retry.failed = true
      },
      onResponse({ request, options, response }) {
        if (!response.ok) {
          const id = `${String(request).split('?')[0]}:${options.headers.get('idempotency-key')}`
          const retry = dossiers.retries[id]
          if (retry && response.status >= 500) retry.failed = true
          else Reflect.deleteProperty(dossiers.retries, id)
          const code = response._data?.data?.code
          if (typeof code === 'string' && code.startsWith('DOSSIER_'))
            dossiers.invalidate(options.headers.get('x-dossier-proofs'))
          return
        }
        const attemptKey = options.headers.get('idempotency-key')
        if (attemptKey) {
          const id = `${String(request).split('?')[0]}:${attemptKey}`
          attempts.delete(id)
          Reflect.deleteProperty(dossiers.retries, id)
        }
        const revisions = response.headers.get('x-dossier-revisions')
        if (revisions) dossiers.acceptRevisions(JSON.parse(revisions))
        dossiers.capture(response._data)
        if (options.headers.has('x-dossier-proofs')) dossiers.releaseInactive()
      }
    })
    dossiers.start()
  }
  return { provide: { dossiers, dossierFetch } }
})
