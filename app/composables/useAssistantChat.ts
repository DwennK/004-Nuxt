import type { AssistantChatError, AssistantChatMessageInput, AssistantQueryResult, AssistantStreamEvent } from '~~/shared/types/assistant'
import { buildAssistantHistory } from '~~/shared/utils/assistant'
import { readEventStream } from '~~/shared/utils/event-stream'

type AssistantTool = {
  id: string
  summary: string
  state: 'running' | 'done' | 'error' | 'stopped'
  query?: AssistantQueryResult
}

export type AssistantUiMessage = AssistantChatMessageInput & {
  queries?: AssistantQueryResult[]
  tools?: AssistantTool[]
  error?: AssistantChatError
  includeInRequest?: boolean
  stopped?: boolean
}

export function useAssistantChat() {
  const messages = ref<AssistantUiMessage[]>([])
  const status = ref<'submitted' | 'streaming' | 'ready' | 'error'>('ready')
  const activity = ref('')
  const activeId = ref<string | null>(null)
  const pending = computed(() => status.value === 'submitted' || status.value === 'streaming')
  const retryable = computed(() => {
    const last = messages.value.at(-1)
    return Boolean(last?.role === 'assistant' && (last.error?.retryable || last.stopped))
  })
  let controller: AbortController | undefined

  async function run(debug: boolean) {
    const requestMessages = buildAssistantHistory(messages.value)
    const id = crypto.randomUUID()
    messages.value.push({ id, role: 'assistant', content: '', tools: [], queries: [], includeInRequest: false })
    const message = messages.value.at(-1)!
    const request = new AbortController()
    controller = request
    activeId.value = id
    status.value = 'submitted'
    activity.value = 'Analyse de votre question…'
    let finished = false
    try {
      const response = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
        body: JSON.stringify({ messages: requestMessages, debug }),
        signal: request.signal
      })
      if (!response.ok || !response.body || !response.headers.get('content-type')?.includes('text/event-stream')) {
        throw new Error('Assistant unavailable')
      }
      for await (const data of readEventStream(response.body, request.signal)) {
        const event = JSON.parse(data) as AssistantStreamEvent
        switch (event.type) {
          case 'status':
            activity.value = event.text
            break
          case 'query-start':
            message.tools!.push({ id: event.id, summary: event.summary, state: 'running' })
            break
          case 'query-result': {
            const tool = message.tools!.find(tool => tool.id === event.id)
            if (tool) Object.assign(tool, { query: event.query, state: 'done' })
            message.queries!.push(event.query)
            break
          }
          case 'query-error': {
            const tool = message.tools!.find(tool => tool.id === event.id)
            if (tool) tool.state = 'error'
            break
          }
          case 'text':
            status.value = 'streaming'
            message.content += event.text
            break
          case 'finish':
            finished = true
            if (!event.response.error) {
              message.content = event.response.message.content
              message.queries = event.response.queries || message.queries
              message.includeInRequest = true
            }
            message.error = event.response.error
            status.value = message.error ? 'error' : 'ready'
            break
        }
        if (finished) break
      }
      if (!finished) throw new Error('Assistant stream interrupted')
    } catch {
      if (request.signal.aborted) {
        message.stopped = true
        status.value = 'ready'
      } else {
        message.error = {
          code: 'service_unavailable',
          message: 'La réponse a été interrompue. Réessayez dans quelques instants.',
          retryable: true
        }
        status.value = 'error'
      }
    } finally {
      for (const tool of message.tools || []) {
        if (tool.state === 'running') tool.state = message.stopped ? 'stopped' : 'error'
      }
      activeId.value = null
      activity.value = ''
      controller = undefined
    }
  }

  async function send(text: string, debug: boolean) {
    if (pending.value || !text.trim()) return
    messages.value.push({ id: crypto.randomUUID(), role: 'user', content: text.trim() })
    await run(debug)
  }

  async function retry(debug: boolean) {
    if (pending.value || !retryable.value) return
    messages.value.pop()
    await run(debug)
  }

  function stop() {
    controller?.abort()
  }

  function reset() {
    if (pending.value) return
    messages.value = []
    status.value = 'ready'
  }

  onScopeDispose(stop)
  return { messages, status, activity, activeId, pending, retryable, send, retry, stop, reset }
}
