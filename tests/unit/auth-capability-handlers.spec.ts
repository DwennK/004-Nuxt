import { beforeEach, describe, expect, it, vi } from 'vitest'
import { requireCapability, type AuthRequestContext } from '../../server/utils/auth/session'
import { listCapabilities } from '../../shared/utils/capabilities'

const documentRecords = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn()
}))
const paymentRecords = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn()
}))
const idempotency = vi.hoisted(() => ({
  requireKey: vi.fn(() => 'test-idempotency-key')
}))

vi.mock('~~/server/utils/pos/documents', () => ({
  createDocumentRecord: documentRecords.create,
  updateDocumentRecord: documentRecords.update
}))
vi.mock('~~/server/utils/pos/payments', () => ({
  createPaymentRecord: paymentRecords.create,
  updatePaymentRecord: paymentRecords.update
}))
vi.mock('~~/server/utils/idempotency', () => ({
  requireIdempotencyKey: idempotency.requireKey
}))

const readValidatedBody = vi.fn()
const getValidatedRouterParams = vi.fn()

vi.stubGlobal('eventHandler', (handler: unknown) => handler)
vi.stubGlobal('readValidatedBody', readValidatedBody)
vi.stubGlobal('getValidatedRouterParams', getValidatedRouterParams)
vi.stubGlobal('createError', (input: { statusCode: number, message: string }) => {
  return Object.assign(new Error(input.message), input)
})

const { default: createDocumentHandler } = await import('../../server/api/documents/index.post')
const { default: updateDocumentHandler } = await import('../../server/api/documents/[id].patch')
const { default: createPaymentHandler } = await import('../../server/api/payments/index.post')
const { default: updatePaymentHandler } = await import('../../server/api/payments/[id].patch')

function createAuthenticatedEvent(isAdmin: boolean) {
  const user = {
    id: isAdmin ? 1 : 2,
    email: isAdmin ? 'admin@example.test' : 'operator@example.test',
    name: isAdmin ? 'Admin' : 'Operator',
    isAdmin,
    capabilities: listCapabilities({ isAdmin })
  }
  const auth = {
    requestId: isAdmin ? 'req-admin' : 'req-operator',
    actor: {
      userId: user.id,
      email: user.email,
      name: user.name,
      isAdmin: user.isAdmin
    },
    user,
    capabilities: user.capabilities
  } satisfies AuthRequestContext

  return { context: { auth } }
}

describe('capability-protected financial handlers', () => {
  beforeEach(() => {
    vi.stubGlobal('readValidatedBody', readValidatedBody)
    vi.stubGlobal('getValidatedRouterParams', getValidatedRouterParams)
    vi.stubGlobal('createError', (input: { statusCode: number, message: string }) => {
      return Object.assign(new Error(input.message), input)
    })
    readValidatedBody.mockResolvedValue({ customerId: undefined })
    getValidatedRouterParams.mockResolvedValue({ id: 42 })
    documentRecords.create.mockResolvedValue({ id: 101 })
    documentRecords.update.mockResolvedValue({ id: 42 })
    paymentRecords.create.mockResolvedValue({ id: 201 })
    paymentRecords.update.mockResolvedValue({ id: 42 })
  })

  it('returns 403 before validating or updating a document for an operator', async () => {
    await expect(updateDocumentHandler(createAuthenticatedEvent(false) as never)).rejects.toMatchObject({
      statusCode: 403
    })
    expect(readValidatedBody).not.toHaveBeenCalled()
    expect(documentRecords.update).not.toHaveBeenCalled()
  })

  it('allows an admin to update a document', async () => {
    await expect(updateDocumentHandler(createAuthenticatedEvent(true) as never)).resolves.toEqual({ id: 42 })
    expect(documentRecords.update).toHaveBeenCalledWith(42, { customerId: undefined })
  })

  it('keeps document creation available to operators', async () => {
    await expect(createDocumentHandler(createAuthenticatedEvent(false) as never)).resolves.toEqual({ id: 101 })
    expect(documentRecords.create).toHaveBeenCalledWith(
      { customerId: undefined },
      { key: 'test-idempotency-key' }
    )
  })

  it('returns 403 for payment adjustment while keeping payment creation available', async () => {
    const operatorEvent = createAuthenticatedEvent(false)

    await expect(updatePaymentHandler(operatorEvent as never)).rejects.toMatchObject({ statusCode: 403 })
    await expect(createPaymentHandler(operatorEvent as never)).resolves.toEqual({ id: 201 })
    expect(paymentRecords.update).not.toHaveBeenCalled()
    expect(paymentRecords.create).toHaveBeenCalledWith(
      { customerId: null },
      'test-idempotency-key'
    )
  })

  it('allows an admin to adjust a payment', async () => {
    await expect(updatePaymentHandler(createAuthenticatedEvent(true) as never)).resolves.toEqual({ id: 42 })
    expect(paymentRecords.update).toHaveBeenCalledWith(42, { customerId: null })
  })

  it('enforces the real capability helper against the authenticated request context', async () => {
    const operatorEvent = createAuthenticatedEvent(false)

    await expect(requireCapability(operatorEvent as never, 'financial:record')).resolves.toMatchObject({
      requestId: 'req-operator'
    })
    await expect(requireCapability(operatorEvent as never, 'financial:adjust')).rejects.toMatchObject({
      statusCode: 403
    })
  })
})
