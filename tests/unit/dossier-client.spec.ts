import { describe, expect, it, vi } from 'vitest'
import { createDossierClient } from '../../app/utils/dossier-client'
import type { DossierStatus } from '../../shared/types/dossier'

function fixture() {
  let result: DossierStatus = {
    key: 'ticket:1', revision: 4, generation: 1, token: 'lease-a',
    owner: { userId: 1, tabId: 'tab-a', name: 'Alice', station: 'PC A', dirty: false },
    expiresAt: Date.now() + 90_000, peers: []
  }
  const fetcher = vi.fn(async () => structuredClone(result))
  const manager = createDossierClient(fetcher as unknown as typeof globalThis.$fetch)
  return {
    manager,
    fetcher,
    set(next: Partial<DossierStatus>) {
      result = { ...result, ...next }
    }
  }
}

describe('dossier client state across forms and reconnection', () => {
  it.each(['snapshot', 'capture'] as const)('keeps the acknowledged revision when %s receives the old document after a customer edit', async (source) => {
    const { manager, set } = fixture()
    const current = manager.state({ kind: 'document', id: 10 })
    const document = { dossier: { key: 'ticket:1', revision: 4 }, customer: { name: 'Avant' } }
    manager.snapshot(current.target, document)
    await manager.session(current, 'acquire')

    // Handover is saved separately, without replacing the parent document.
    set({ revision: 5 })
    manager.acceptRevisions([{ key: 'ticket:1', revision: 5 }])
    const updated = { ...document, customer: { name: 'Après' } }
    if (source === 'snapshot') manager.snapshot(current.target, updated)
    else manager.capture(updated)

    manager.setDirty(current, 'document', true)
    const headers = await manager.prepare([current.target])
    expect(JSON.parse(headers['X-Dossier-Proofs'])).toEqual([
      { key: 'ticket:1', revision: 5, token: 'lease-a' }
    ])
    expect(current.lost).toBe(false)
    expect(current.dirty).toBe(true)

    // A later write from another operator must still block the stale draft.
    set({ revision: 6 })
    await expect(manager.prepare([current.target])).rejects.toThrow('Rechargez')
    expect(current.baseline?.revision).toBe(5)
    expect(current.lost).toBe(true)
  })

  it('retains the revision at opening even for a new linked document with no saved record', async () => {
    const { manager, set } = fixture()
    const current = manager.state({ kind: 'ticket', id: 1 })
    await manager.session(current, 'acquire')
    expect(current.baseline).toEqual({ key: 'ticket:1', revision: 4 })
    manager.setDirty(current, 'new-document', true)
    set({ revision: 5 })
    await expect(manager.prepare([current.target])).rejects.toThrow('Rechargez')
    expect(current.lost).toBe(true)
    expect(current.dirty).toBe(true)
    expect(current.baseline?.revision).toBe(4)
  })

  it('captures fresh records while preserving dirty or lost baselines', async () => {
    const { manager } = fixture()
    const current = manager.state({ kind: 'document', id: 10 })
    manager.snapshot(current.target, { dossier: { key: 'ticket:1', revision: 4 } })
    await manager.session(current, 'acquire')
    manager.capture({ dossier: { key: 'ticket:1', revision: 5 } })
    expect(current.baseline?.revision).toBe(5)

    manager.setDirty(current, 'document', true)
    manager.snapshot(current.target, { dossier: { key: 'ticket:1', revision: 6 } })
    expect(current.baseline?.revision).toBe(5)
    manager.setDirty(current, 'document', false)
    manager.invalidate(JSON.stringify([{ key: 'ticket:1' }]))
    manager.capture({ dossier: { key: 'ticket:1', revision: 6 } })
    expect(current.baseline?.revision).toBe(5)
    expect(current.lost).toBe(true)
  })

  it('accepts the independent revision of a document moved to another dossier', () => {
    const { manager } = fixture()
    const current = manager.state({ kind: 'document', id: 10 })
    manager.snapshot(current.target, { dossier: { key: 'ticket:1', revision: 4 } })
    manager.snapshot(current.target, { dossier: { key: 'document:10', revision: 1 } })
    expect(current.baseline).toEqual({ key: 'document:10', revision: 1 })
  })

  it('carries the lease from a ticket to its invoice in the same tab', async () => {
    const { manager, fetcher } = fixture()
    const ticket = manager.state({ kind: 'ticket', id: 1 })
    await manager.session(ticket, 'acquire')
    const invoice = manager.state({ kind: 'document', id: 10 })
    manager.snapshot(invoice.target, { dossier: ticket.baseline })
    await manager.session(invoice)
    const options = (fetcher.mock.calls[1] as unknown as [string, { body: { token: string } }])[1]
    expect(options.body.token).toBe('lease-a')
    expect(invoice.token).toBe(ticket.token)
    expect(invoice.lost).toBe(false)
  })

  it('preserves all dirty forms through network loss and rejects a taken-over lease on wake', async () => {
    const { manager, fetcher, set } = fixture()
    const current = manager.state({ kind: 'ticket', id: 1 })
    await manager.session(current, 'acquire')
    manager.setDirty(current, 'note', true)
    manager.setDirty(current, 'payment', true)
    manager.setDirty(current, 'note', false)
    fetcher.mockRejectedValueOnce(new TypeError('Network disconnected'))
    await expect(manager.session(current)).rejects.toThrow('Network disconnected')
    expect(current.offline).toBe(true)
    expect(current.dirty).toBe(true)
    set({ token: null, generation: 2 })
    await manager.session(current)
    expect(current.offline).toBe(false)
    expect(current.lost).toBe(true)
    expect(current.dirtySources).toEqual({ payment: true })
    const requests = fetcher.mock.calls.length
    await expect(manager.prepare([current.target])).rejects.toThrow('Copiez')
    expect(fetcher).toHaveBeenCalledTimes(requests)
  })
})
