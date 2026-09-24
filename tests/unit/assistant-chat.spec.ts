import type { H3Event } from 'h3'
import { createError } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildAssistantDateContext, runAssistantChat } from '../../server/utils/assistant/chat'
import { requestStructuredResponse, requestTextResponse } from '../../server/utils/assistant/provider'
import { runReadOnlyQuery } from '../../server/utils/assistant/sql'

vi.mock('../../server/utils/assistant/provider', () => ({ requestStructuredResponse: vi.fn(), requestTextResponse: vi.fn() }))
vi.mock('../../server/utils/assistant/sql', async importOriginal => ({
  ...await importOriginal<typeof import('../../server/utils/assistant/sql')>(),
  runReadOnlyQuery: vi.fn()
}))
const event = { context: {} } as H3Event
const messages = [{ id: 'question', role: 'user' as const, content: 'Combien de tickets ?' }]
const finish = { action: 'answer', sql: '', querySummary: '', answerPlan: '', response: 'Les recherches suffisent.' }
const plan = { action: 'query', sql: 'SELECT COUNT(t.id) AS total FROM tickets t', querySummary: 'Nombre de tickets', answerPlan: 'Donner le total.', response: '' }

describe('assistant planning and failure boundaries', () => {
  beforeEach(() => {
    vi.mocked(requestStructuredResponse).mockReset().mockResolvedValue(finish)
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
    vi.mocked(requestStructuredResponse).mockResolvedValueOnce(plan)
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
    ['test', 'answer', 'Quelle information souhaitez-vous consulter ?'],
    ['Bonjour', 'answer', 'Bonjour ! Comment puis-je vous aider avec les données du magasin ?'],
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
    vi.mocked(requestStructuredResponse).mockResolvedValueOnce(plan)
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
    expect(result.query).toMatchObject({ rowCount: 1, table: { rows: [{ total: 2 }] }, sql: plan.sql })
  })

  it('checks total cardinality separately from the largest invoice and preserves both sources', async () => {
    const largest = { ...plan, sql: 'SELECT d.id, d.total FROM documents d ORDER BY d.total DESC LIMIT 1', querySummary: 'Plus grosse facture' }
    const count = { ...plan, sql: 'SELECT COUNT(d.id) AS total FROM documents d', querySummary: 'Nombre de factures' }
    vi.mocked(requestStructuredResponse).mockResolvedValueOnce(largest).mockResolvedValueOnce(count)
    vi.mocked(runReadOnlyQuery)
      .mockResolvedValueOnce({ columns: ['id', 'total'], rows: [{ id: 5909, total: 14900 }], rowCount: 1, truncated: false })
      .mockResolvedValueOnce({ columns: ['total'], rows: [{ total: 2 }], rowCount: 1, truncated: false })
    vi.mocked(requestTextResponse).mockResolvedValue('La plus grosse facture est de 149 CHF, sur 2 factures.')
    const result = await runAssistantChat(event, messages, false)
    expect(runReadOnlyQuery).toHaveBeenCalledTimes(2)
    expect(result.queries).toHaveLength(2)
    expect(result.queries?.every(query => query.sql === undefined)).toBe(true)
    const answerPrompt = vi.mocked(requestTextResponse).mock.calls[0]![1]
    expect(answerPrompt.userPrompt).toContain(largest.sql)
    expect(answerPrompt.userPrompt).toContain('"total":2')
    expect(answerPrompt.systemPrompt).toContain('Seul un COUNT explicite')
    expect(result.message.content).not.toContain('Vérification partielle')
  })

  it('corrects a rejected query without ever executing the invalid statement', async () => {
    vi.mocked(requestStructuredResponse).mockResolvedValueOnce({ ...plan, sql: 'SELECT t.missing_column FROM tickets t' }).mockResolvedValueOnce(plan)
    vi.mocked(runReadOnlyQuery).mockResolvedValue({ columns: ['total'], rows: [{ total: 2 }], rowCount: 1, truncated: false })
    vi.mocked(requestTextResponse).mockResolvedValue('2 tickets.')
    const result = await runAssistantChat(event, messages, false)
    expect(result.error).toBeUndefined()
    expect(runReadOnlyQuery).toHaveBeenCalledOnce()
    expect(vi.mocked(requestStructuredResponse).mock.calls[1]![1].userPrompt).toContain('missing_column')
  })

  it('can recover from a database execution failure with a different query', async () => {
    vi.mocked(requestStructuredResponse).mockResolvedValueOnce(plan).mockResolvedValueOnce({ ...plan, sql: 'SELECT t.id FROM tickets t LIMIT 10' })
    vi.mocked(runReadOnlyQuery).mockRejectedValueOnce(new Error('private database details')).mockResolvedValueOnce({ columns: ['id'], rows: [{ id: 1 }], rowCount: 1, truncated: false })
    vi.mocked(requestTextResponse).mockResolvedValue('Un dossier affiché.')
    const result = await runAssistantChat(event, messages, false)
    expect(result.error).toBeUndefined()
    expect(JSON.stringify(vi.mocked(requestStructuredResponse).mock.calls)).not.toContain('private database details')
  })

  it('bounds repeated attempts and visibly marks incomplete evidence', async () => {
    vi.mocked(requestStructuredResponse).mockResolvedValue(plan)
    vi.mocked(runReadOnlyQuery).mockResolvedValue({ columns: ['total'], rows: [{ total: 2 }], rowCount: 1, truncated: false })
    vi.mocked(requestTextResponse).mockResolvedValue('2 tickets.')
    const result = await runAssistantChat(event, messages, false)
    expect(requestStructuredResponse).toHaveBeenCalledTimes(4)
    expect(runReadOnlyQuery).toHaveBeenCalledOnce()
    expect(result.message.content).toContain('Vérification partielle')
  })

  it('does not turn a failed lookup into an unverified model answer', async () => {
    vi.mocked(requestStructuredResponse).mockResolvedValueOnce({ ...plan, sql: 'SELECT t.access_code FROM tickets t' })
    const result = await runAssistantChat(event, messages, false)
    expect(result.error?.code).toBe('sql_rejected')
    expect(result.message.content).not.toContain(finish.response)
    expect(runReadOnlyQuery).not.toHaveBeenCalled()
  })

  it('includes historical result context for follow-up questions as unverified input', async () => {
    const context = [{ summary: 'Plus grosse facture', rowCount: 1, truncated: false, rows: [{ id: 5909 }] }]
    await runAssistantChat(event, [{ id: 'previous', role: 'assistant', content: '149 CHF', context }, ...messages], false)
    expect(vi.mocked(requestStructuredResponse).mock.calls[0]![1].userPrompt).toContain('5909')
    expect(vi.mocked(requestStructuredResponse).mock.calls[0]![1].userPrompt).toContain('non vérifiés')
  })
})

describe('assistant business dates', () => {
  it('uses the Swiss date after UTC midnight boundaries', () => {
    expect(buildAssistantDateContext(new Date('2026-09-22T22:30:00Z')).today).toEqual({ start: '2026-09-22T22:00:00.000Z', end: '2026-09-23T21:59:59.999Z' })
  })

  it('calculates both ends of a daylight-saving transition independently', () => {
    expect(buildAssistantDateContext(new Date('2026-03-29T12:00:00Z')).today).toEqual({ start: '2026-03-28T23:00:00.000Z', end: '2026-03-29T21:59:59.999Z' })
    expect(buildAssistantDateContext(new Date('2026-10-25T12:00:00Z')).today).toEqual({ start: '2026-10-24T22:00:00.000Z', end: '2026-10-25T22:59:59.999Z' })
  })
})

describe('assistant streamed orchestration', () => {
  beforeEach(() => {
    vi.mocked(requestStructuredResponse).mockReset().mockResolvedValue(finish)
    vi.mocked(requestTextResponse).mockReset().mockResolvedValue('Deux dossiers.')
    vi.mocked(runReadOnlyQuery).mockReset().mockResolvedValue({ columns: ['total'], rows: [{ total: 2 }], rowCount: 1, truncated: false })
  })
  it('emits verified results before answer generation and hides SQL without debug', async () => {
    vi.mocked(requestStructuredResponse).mockResolvedValueOnce(plan)
    const emitted: unknown[] = []
    vi.mocked(requestTextResponse).mockImplementation(async (_event, options) => {
      expect(emitted).toContainEqual(expect.objectContaining({ type: 'query-result' }))
      await options.onText?.('Deux dossiers.')
      return 'Deux dossiers.'
    })
    await runAssistantChat(event, messages, false, 'stream-test', { emit: async (value) => {
      emitted.push(value)
    } })
    expect(emitted).toContainEqual(expect.objectContaining({ type: 'query-start' }))
    expect(emitted).toContainEqual({ type: 'text', text: 'Deux dossiers.' })
    expect(JSON.stringify(emitted)).not.toContain('SELECT')
  })
  it('stops after cancellation during planning, before SQL execution', async () => {
    const abort = new AbortController()
    vi.mocked(requestStructuredResponse).mockImplementation(async () => {
      abort.abort()
      return plan
    })
    await expect(runAssistantChat(event, messages, false, 'cancel', { signal: abort.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(runReadOnlyQuery).not.toHaveBeenCalled()
    expect(requestTextResponse).not.toHaveBeenCalled()
  })
  it('does not start another lookup after cancellation during database work', async () => {
    const abort = new AbortController()
    vi.mocked(requestStructuredResponse).mockResolvedValueOnce(plan)
    vi.mocked(runReadOnlyQuery).mockImplementation(async () => {
      abort.abort()
      return { columns: [], rows: [], rowCount: 0, truncated: false }
    })
    await expect(runAssistantChat(event, messages, false, 'cancel', { signal: abort.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(requestStructuredResponse).toHaveBeenCalledOnce()
    expect(requestTextResponse).not.toHaveBeenCalled()
  })
})
