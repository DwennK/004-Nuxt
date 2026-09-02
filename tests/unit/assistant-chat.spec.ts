import type { H3Event } from 'h3'
import { createError } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runAssistantChat } from '../../server/utils/assistant/chat'
import { requestStructuredResponse, requestTextResponse } from '../../server/utils/assistant/provider'
import { runReadOnlyQuery } from '../../server/utils/assistant/sql'

vi.mock('../../server/utils/assistant/provider', () => ({ requestStructuredResponse: vi.fn(), requestTextResponse: vi.fn() }))
vi.mock('../../server/utils/assistant/sql', async importOriginal => ({
  ...await importOriginal<typeof import('../../server/utils/assistant/sql')>(),
  runReadOnlyQuery: vi.fn()
}))
const event = { context: {} } as H3Event
const messages = [{ id: 'question', role: 'user' as const, content: 'Combien de tickets ?' }]
const plan = { sql: 'SELECT COUNT(t.id) AS total FROM tickets t', querySummary: 'Nombre de tickets', answerPlan: 'Donner le total.' }

describe('assistant provider failure boundaries', () => {
  beforeEach(() => {
    vi.mocked(requestStructuredResponse).mockReset()
    vi.mocked(requestTextResponse).mockReset()
    vi.mocked(runReadOnlyQuery).mockReset()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('reports missing configuration without querying the database', async () => {
    vi.mocked(requestStructuredResponse).mockRejectedValue(createError({ statusCode: 503, data: { code: 'assistant_not_configured' } }))
    const result = await runAssistantChat(event, messages, false, 'test')
    expect(result.error).toMatchObject({ code: 'service_unavailable', retryable: false })
    expect(result.message.content).toContain('n’est pas configuré')
    expect(runReadOnlyQuery).not.toHaveBeenCalled()
  })

  it('does not expose raw provider errors or classify them as SQL failures', async () => {
    vi.mocked(requestStructuredResponse).mockRejectedValue(createError({ statusCode: 401, message: 'secret-provider-detail', data: { token: 'private' } }))
    const result = await runAssistantChat(event, messages, false, 'test')
    expect(result.error).toMatchObject({ code: 'service_unavailable', retryable: true })
    expect(JSON.stringify(result)).not.toMatch(/secret-provider-detail|private/)
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toMatch(/secret-provider-detail|private/)
    expect(runReadOnlyQuery).not.toHaveBeenCalled()
  })

  it('identifies an answer-generation outage after a successful SQL query', async () => {
    vi.mocked(requestStructuredResponse).mockResolvedValue(plan)
    vi.mocked(runReadOnlyQuery).mockResolvedValue({ columns: ['total'], rows: [{ total: 2 }], rowCount: 1, truncated: false })
    vi.mocked(requestTextResponse).mockRejectedValue(createError({ statusCode: 504 }))
    const result = await runAssistantChat(event, messages, false, 'test')
    expect(result.error?.code).toBe('service_unavailable')
    expect(runReadOnlyQuery).toHaveBeenCalledOnce()
    expect(requestTextResponse).toHaveBeenCalledWith(event, expect.any(Object))
  })

  it('still rejects forbidden SQL before execution', async () => {
    vi.mocked(requestStructuredResponse).mockResolvedValue({ ...plan, sql: 'DELETE FROM tickets' })
    const result = await runAssistantChat(event, messages, false, 'test')
    expect(result.error?.code).toBe('sql_rejected')
    expect(runReadOnlyQuery).not.toHaveBeenCalled()
    expect(requestTextResponse).not.toHaveBeenCalled()
  })
})
