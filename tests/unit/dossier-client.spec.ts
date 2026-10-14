import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDossierClient } from '../../app/utils/dossier-client'
import type { DossierStatus } from '../../shared/types/dossier'

afterEach(() => vi.useRealTimers())

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

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
  it.each(['ticket', 'document'] as const)('drops departed %s state after handing its lease to an invoice', async (kind) => {
    vi.useFakeTimers()
    const { manager, set } = fixture()
    const source = manager.state({ kind, id: 1 })
    source.active = 1
    await manager.session(source, 'acquire')
    const invoice = manager.state({ kind: 'document', id: 10 })
    manager.snapshot(invoice.target, { dossier: source.baseline })
    invoice.active = 1
    await manager.session(invoice, 'acquire')
    const leaving = manager.leave(source)
    await vi.advanceTimersByTimeAsync(300)
    await leaving
    expect(source.token).toBeNull()
    expect(invoice.token).toBe('lease-a')

    // Leaving the invoice releases the shared reservation. A later visit gets
    // a new lease, not a false takeover caused by the old page's cached token.
    set({ token: null, owner: null })
    const closing = manager.leave(invoice)
    await vi.advanceTimersByTimeAsync(300)
    await closing
    set({ token: 'lease-b', generation: 2 })
    manager.snapshot(source.target, { dossier: { key: 'ticket:1', revision: 4 } })
    source.active = 1
    await expect(manager.prepare([source.target])).resolves.toBeDefined()
    expect(source.lost).toBe(false)
  })

  it('waits for a shared release before reacquiring from a different page', async () => {
    vi.useFakeTimers()
    const { manager, fetcher, set } = fixture()
    const ticket = manager.state({ kind: 'ticket', id: 1 })
    ticket.active = 1
    const status = await manager.session(ticket, 'acquire')
    const released = deferred<DossierStatus>()
    fetcher.mockImplementationOnce(() => released.promise)
    const leaving = manager.leave(ticket)
    await vi.advanceTimersByTimeAsync(300)
    const invoice = manager.state({ kind: 'document', id: 10 })
    manager.snapshot(invoice.target, { dossier: { key: status.key, revision: status.revision } })
    invoice.active = 1
    set({ token: 'lease-b', generation: 2 })
    const entering = manager.session(invoice, 'acquire')
    expect(fetcher).toHaveBeenCalledTimes(2)
    released.resolve({ ...status, token: null, owner: null })
    await Promise.all([leaving, entering])
    expect(invoice.token).toBe('lease-b')
    expect(invoice.lost).toBe(false)
    expect(ticket.token).toBeNull()
  })

  it('does not turn a delayed heartbeat into a conflict after its own document creation', async () => {
    const { manager, fetcher, set } = fixture()
    const ticket = manager.state({ kind: 'ticket', id: 1 })
    const status = await manager.session(ticket, 'acquire')
    const heartbeat = deferred<DossierStatus>()
    fetcher.mockImplementationOnce(() => heartbeat.promise)
    const observing = manager.session(ticket)
    manager.acceptRevisions([{ key: status.key, revision: 5 }])
    heartbeat.resolve({ ...status, revision: 4 })
    await observing
    expect(ticket.baseline?.revision).toBe(5)
    expect(ticket.status?.revision).toBe(5)
    expect(ticket.lost).toBe(false)
    set({ revision: 5 })
    await expect(manager.prepare([ticket.target])).resolves.toBeDefined()
    set({ revision: 6 })
    await expect(manager.prepare([ticket.target])).rejects.toThrow('Rechargez')
  })

  it('reacquires a page reopened while its own release is in flight', async () => {
    vi.useFakeTimers()
    const { manager, fetcher, set } = fixture()
    const current = manager.state({ kind: 'document', id: 10 })
    current.active = 1
    const status = await manager.session(current, 'acquire')
    const released = deferred<DossierStatus>()
    fetcher.mockImplementationOnce(() => released.promise)
    const leaving = manager.leave(current)
    await vi.advanceTimersByTimeAsync(300)
    current.active = 1
    manager.snapshot(current.target, { dossier: { key: status.key, revision: 4 } })
    const entering = manager.session(current, 'acquire')
    set({ token: 'lease-b', generation: 2 })
    released.resolve({ ...status, token: null, owner: null })
    await Promise.all([leaving, entering])
    expect(current.baseline).toEqual({ key: status.key, revision: 4 })
    expect(current.token).toBe('lease-b')
    expect(current.lost).toBe(false)
  })

  it('does not release a reservation transferred to another page during a slow heartbeat', async () => {
    vi.useFakeTimers()
    const { manager, fetcher } = fixture()
    const ticket = manager.state({ kind: 'ticket', id: 1 })
    ticket.active = 1
    const status = await manager.session(ticket, 'acquire')
    const heartbeat = deferred<DossierStatus>()
    fetcher.mockImplementationOnce(() => heartbeat.promise)
    const observing = manager.session(ticket)
    const leaving = manager.leave(ticket)
    await vi.advanceTimersByTimeAsync(300)
    const invoice = manager.state({ kind: 'document', id: 10 })
    manager.snapshot(invoice.target, { dossier: { key: status.key, revision: 4 } })
    invoice.active = 1
    const entering = manager.session(invoice, 'acquire')
    heartbeat.resolve(status)
    await Promise.all([observing, leaving, entering])
    expect(invoice.lost).toBe(false)
    expect(invoice.token).toBe('lease-a')
    expect(fetcher.mock.calls).toHaveLength(3)
    const options = (fetcher.mock.calls[2] as unknown as [string, { body: { action: string, token: string } }])[1]
    expect(options.body).toMatchObject({ action: 'acquire', token: 'lease-a' })
  })

  it('still rejects a taken-over lease after an acknowledged local write', async () => {
    const { manager, set } = fixture()
    const current = manager.state({ kind: 'ticket', id: 1 })
    await manager.session(current, 'acquire')
    manager.acceptRevisions([{ key: 'ticket:1', revision: 5 }])
    set({ token: null, generation: 2, revision: 5 })
    await expect(manager.prepare([current.target])).rejects.toThrow('réservé')
    expect(current.lost).toBe(true)
  })

  it('acknowledges a local write on a destination page whose first session is still loading', async () => {
    const { manager, fetcher } = fixture()
    const ticket = manager.state({ kind: 'ticket', id: 1 })
    const status = await manager.session(ticket, 'acquire')
    const invoice = manager.state({ kind: 'document', id: 10 })
    manager.snapshot(invoice.target, { dossier: { key: status.key, revision: 4 } })
    const response = deferred<DossierStatus>()
    fetcher.mockImplementationOnce(() => response.promise)
    const entering = manager.session(invoice, 'acquire')
    manager.acceptRevisions([{ key: status.key, revision: 5 }])
    response.resolve({ ...status, revision: 4 })
    await entering
    expect(invoice.baseline?.revision).toBe(5)
    expect(invoice.lost).toBe(false)
  })

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
