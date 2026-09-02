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
const plan = { action: 'query', sql: 'SELECT COUNT(t.id) AS total FROM tickets t', querySummary: 'Nombre de tickets', answerPlan: 'Donner le total.', response: '' }

describe('assistant planning and failure boundaries', () => {
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

  it.each([
    ['test', 'clarify', 'Quelle information souhaitez-vous consulter ?'],
    ['Bonjour', 'clarify', 'Bonjour ! Comment puis-je vous aider avec les données du magasin ?'],
    ['Quel total ?', 'clarify', 'Quel total souhaitez-vous connaître, et sur quelle période ?'],
    ['Quel temps fera-t-il demain ?', 'out_of_scope', 'Je peux vous aider à consulter les données du magasin.'],
    ['Supprime les clients', 'out_of_scope', 'Je peux uniquement consulter les données.']
  ])('answers "%s" without a database query or answer-generation call', async (question, action, response) => {
    vi.mocked(requestStructuredResponse).mockResolvedValue({ action, response, sql: '', querySummary: '', answerPlan: '' })
    const result = await runAssistantChat(event, [{ ...messages[0]!, content: question }], false, 'test')
    expect(result.message.content).toBe(response)
    expect(result.query).toBeUndefined()
    expect(result.error).toBeUndefined()
    expect(runReadOnlyQuery).not.toHaveBeenCalled()
    expect(requestTextResponse).not.toHaveBeenCalled()
  })

  it.each([
    null,
    {},
    { ...plan, action: undefined },
    { ...plan, action: 'clarify', response: 'Précisez la période.' },
    { ...plan, action: 'out_of_scope', response: 'Hors périmètre.' },
    { ...plan, sql: '' },
    { action: 'clarify', response: '', sql: '', querySummary: '', answerPlan: '' }
  ])('rejects an incomplete or contradictory plan before querying: %j', async (invalidPlan) => {
    vi.mocked(requestStructuredResponse).mockResolvedValue(invalidPlan)
    const result = await runAssistantChat(event, messages, false, 'test')
    expect(result.error?.code).toBe('service_unavailable')
    expect(runReadOnlyQuery).not.toHaveBeenCalled()
    expect(requestTextResponse).not.toHaveBeenCalled()
  })

  it('uses the clarification history and preserves the guarded query path', async () => {
    const conversation = [
      { id: '1', role: 'user' as const, content: 'Combien ?' },
      { id: '2', role: 'assistant' as const, content: 'Que souhaitez-vous compter ?' },
      { id: '3', role: 'user' as const, content: 'Les tickets.' }
    ]
    vi.mocked(requestStructuredResponse).mockResolvedValue(plan)
    vi.mocked(runReadOnlyQuery).mockResolvedValue({ columns: ['total'], rows: [{ total: 2 }], rowCount: 1, truncated: false })
    vi.mocked(requestTextResponse).mockResolvedValue('**2 tickets** au total.')

    const result = await runAssistantChat(event, conversation, true, 'follow-up')

    expect(requestStructuredResponse).toHaveBeenCalledWith(event, expect.objectContaining({
      userPrompt: expect.stringContaining('Assistant: Que souhaitez-vous compter ?\nUtilisateur: Les tickets.')
    }))
    expect(runReadOnlyQuery).toHaveBeenCalledOnce()
    expect(requestTextResponse).toHaveBeenCalledOnce()
    expect(result.error).toBeUndefined()
    expect(result.message.content).toBe('**2 tickets** au total.')
    expect(result.query).toMatchObject({ rowCount: 1, table: { rows: [{ total: 2 }] }, sql: `${plan.sql}\nLIMIT 50` })
  })
})
