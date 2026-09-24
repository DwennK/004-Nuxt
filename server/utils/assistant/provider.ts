import type { H3Event } from 'h3'
import { createError } from 'h3'
import { readEventStream } from '~~/shared/utils/event-stream'
import { createReasoningFilter } from './stream-text'
import { externalFetch, isExternalFetchError } from '../external-fetch'

type StructuredResponseOptions = {
  requestId: string
  signal?: AbortSignal
  schemaName: string
  schema: Record<string, unknown>
  systemPrompt: string
  userPrompt: string
}

type TextResponseOptions = {
  onText?: (text: string) => Promise<void>
  requestId: string
  signal?: AbortSignal
  systemPrompt: string
  userPrompt: string
}

type ChatMessageContentPart = {
  text?: string | null
}

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | ChatMessageContentPart[] | null
    }
  }>
}

const DEFAULT_MINIMAX_MODEL = 'MiniMax-M3'
const DEFAULT_MINIMAX_BASE_URL = 'https://api.minimax.io/v1'
const STRUCTURED_FALLBACK_STATUS_CODES = new Set([400, 422, 502])

function getProviderConfig(event: H3Event) {
  const config = useRuntimeConfig(event)
  const bindings = event.context.cloudflare?.env || event.context._platform?.cloudflare?.env
  const env = (bindings || {}) as Record<string, unknown>
  const value = (...candidates: unknown[]) => candidates
    .find(candidate => typeof candidate === 'string' && candidate.trim()) as string | undefined
  const apiKey = value(env.NUXT_MINIMAX_API_KEY, env.MINIMAX_API_KEY, config.minimaxApiKey, process.env.NUXT_MINIMAX_API_KEY, process.env.MINIMAX_API_KEY)?.trim()
  const model = value(env.NUXT_MINIMAX_MODEL, env.MINIMAX_MODEL, config.minimaxModel, process.env.NUXT_MINIMAX_MODEL, process.env.MINIMAX_MODEL)?.trim() || DEFAULT_MINIMAX_MODEL
  const baseUrl = (value(env.NUXT_MINIMAX_BASE_URL, env.MINIMAX_BASE_URL, config.minimaxBaseUrl, process.env.NUXT_MINIMAX_BASE_URL, process.env.MINIMAX_BASE_URL)?.trim() || DEFAULT_MINIMAX_BASE_URL).replace(/\/$/, '')

  if (!apiKey) {
    throw createError({
      statusCode: 503,
      statusMessage: 'MiniMax configuration is missing',
      data: { code: 'assistant_not_configured' }
    })
  }

  return {
    apiKey,
    model,
    baseUrl
  }
}

function getAlternativeBaseUrl(baseUrl: string) {
  if (baseUrl === 'https://api.minimaxi.com/v1') {
    return 'https://api.minimax.io/v1'
  }

  if (baseUrl === 'https://api.minimax.io/v1') {
    return 'https://api.minimaxi.com/v1'
  }

  return null
}

function buildHeaders(apiKey: string, requestId: string) {
  return {
    'Authorization': `Bearer ${apiKey.trim()}`,
    'Content-Type': 'application/json',
    'X-Client-Request-Id': requestId
  }
}

function normalizeMessageContent(content: string | ChatMessageContentPart[] | null | undefined) {
  if (typeof content === 'string') {
    return content
  }

  if (Array.isArray(content)) {
    return content
      .map(part => typeof part?.text === 'string' ? part.text : '')
      .join('')
  }

  return ''
}

function stripCodeFence(content: string) {
  const fencedMatch = content.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return fencedMatch?.[1]?.trim() || content
}

function stripReasoning(content: string) {
  return content
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .trim()
}

function extractJsonCandidate(content: string) {
  const cleaned = stripCodeFence(stripReasoning(content).trim())
  if (!cleaned) {
    return cleaned
  }

  const firstBrace = cleaned.indexOf('{')
  const lastBrace = cleaned.lastIndexOf('}')

  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return cleaned.slice(firstBrace, lastBrace + 1)
  }

  return cleaned
}

function parseStructuredContent<T>(content: string) {
  const candidate = extractJsonCandidate(content)

  if (!candidate) {
    throw createError({
      statusCode: 502,
      statusMessage: 'MiniMax returned an empty structured response'
    })
  }

  try {
    return JSON.parse(candidate) as T
  } catch {
    throw createError({
      statusCode: 502,
      statusMessage: 'MiniMax returned invalid structured JSON'
    })
  }
}

function shouldRetryStructuredWithoutSchema(error: unknown) {
  if (isExternalFetchError(error)) {
    return false
  }

  const statusCode = typeof error === 'object' && error !== null && 'statusCode' in error
    ? Number((error as { statusCode?: unknown }).statusCode)
    : NaN
  const statusMessage = typeof error === 'object' && error !== null && 'statusMessage' in error
    ? String((error as { statusMessage?: unknown }).statusMessage || '')
    : ''

  return STRUCTURED_FALLBACK_STATUS_CODES.has(statusCode)
    || statusMessage.includes('structured response')
    || statusMessage.includes('structured JSON')
}

async function requestChatCompletion(
  url: string,
  requestId: string,
  headers: Record<string, string>,
  body: Record<string, unknown>,
  signal?: AbortSignal
) {
  const { response } = await externalFetch(url, {
    method: 'POST',
    signal,
    headers,
    body: JSON.stringify(body)
  }, {
    provider: 'minimax',
    requestId,
    timeoutMs: 45_000,
    timeoutMessage: 'MiniMax request timed out',
    networkErrorMessage: 'MiniMax is unavailable'
  })
  const payload = await response.json().catch(() => null) as (ChatCompletionResponse & {
    error?: { message?: string }
  }) | null

  if (!response.ok) {
    throw createError({
      statusCode: response.status,
      statusMessage: payload?.error?.message || 'MiniMax request failed',
      data: payload
    })
  }

  return payload || {}
}

async function createChatCompletion(event: H3Event, requestId: string, body: Record<string, unknown>, signal?: AbortSignal) {
  const { apiKey, baseUrl } = getProviderConfig(event)
  const headers = buildHeaders(apiKey, requestId)

  try {
    return await requestChatCompletion(`${baseUrl}/chat/completions`, requestId, headers, body, signal)
  } catch (error) {
    signal?.throwIfAborted()
    const statusCode = typeof error === 'object' && error !== null && 'statusCode' in error
      ? Number((error as { statusCode?: unknown }).statusCode)
      : NaN
    const errorData = typeof error === 'object' && error !== null && 'data' in error
      ? (error as { data?: { error?: { message?: string } } }).data
      : undefined
    const errorMessage = String(errorData?.error?.message || '')
    const alternativeBaseUrl = getAlternativeBaseUrl(baseUrl)

    if (
      statusCode !== 401
      || !alternativeBaseUrl
      || !errorMessage.toLowerCase().includes('invalid api key')
    ) {
      throw error
    }

    return requestChatCompletion(`${alternativeBaseUrl}/chat/completions`, requestId, headers, body, signal)
  }
}

function getCompletionText(response: ChatCompletionResponse) {
  const content = normalizeMessageContent(response.choices?.[0]?.message?.content)
  return stripReasoning(content).trim()
}

export async function requestStructuredResponse<T>(event: H3Event, options: StructuredResponseOptions): Promise<T> {
  const { model } = getProviderConfig(event)
  const messages = [
    {
      role: 'system',
      content: options.systemPrompt
    },
    {
      role: 'user',
      content: options.userPrompt
    }
  ]

  try {
    const response = await createChatCompletion(event, options.requestId, {
      model,
      messages,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: options.schemaName,
          strict: true,
          schema: options.schema
        }
      }
    }, options.signal)

    return parseStructuredContent<T>(getCompletionText(response))
  } catch (error) {
    options.signal?.throwIfAborted()
    if (!shouldRetryStructuredWithoutSchema(error)) {
      throw error
    }

    const fallbackResponse = await createChatCompletion(event, options.requestId, {
      model,
      messages: [
        {
          role: 'system',
          content: [
            options.systemPrompt,
            'Réponds uniquement avec un objet JSON valide.',
            'Ne retourne aucun texte avant ou après le JSON.',
            `Le JSON doit respecter exactement ce schéma: ${JSON.stringify(options.schema)}`
          ].join('\n\n')
        },
        {
          role: 'user',
          content: options.userPrompt
        }
      ]
    }, options.signal)

    const content = getCompletionText(fallbackResponse)

    if (!content) {
      throw error
    }

    return parseStructuredContent<T>(content)
  }
}

export async function requestTextResponse(event: H3Event, options: TextResponseOptions) {
  if (options.onText) return requestStreamingText(event, options)
  const { model } = getProviderConfig(event)
  const response = await createChatCompletion(event, options.requestId, {
    model,
    messages: [
      {
        role: 'system',
        content: options.systemPrompt
      },
      {
        role: 'user',
        content: options.userPrompt
      }
    ]
  }, options.signal)

  const content = getCompletionText(response)

  if (!content) {
    throw createError({
      statusCode: 502,
      statusMessage: 'MiniMax returned an empty response'
    })
  }

  return content
}

async function requestStreamingText(event: H3Event, options: TextResponseOptions) {
  const { apiKey, model, baseUrl } = getProviderConfig(event)
  const timeout = AbortSignal.timeout(45_000)
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout
  const body = JSON.stringify({
    model,
    stream: true,
    reasoning_split: true,
    messages: [
      { role: 'system', content: options.systemPrompt },
      { role: 'user', content: options.userPrompt }
    ]
  })
  const request = (url: string) => fetch(`${url}/chat/completions`, {
    method: 'POST', headers: buildHeaders(apiKey, options.requestId), body, signal
  })
  let response = await request(baseUrl)
  const alternative = getAlternativeBaseUrl(baseUrl)
  if (response.status === 401 && alternative) {
    await response.body?.cancel().catch(() => undefined)
    response = await request(alternative)
  }
  if (!response.ok || !response.body || !response.headers.get('content-type')?.includes('text/event-stream')) {
    await response.body?.cancel().catch(() => undefined)
    throw createError({ statusCode: 502, statusMessage: 'MiniMax streaming request failed' })
  }

  let content = ''
  let finished = false
  const filter = createReasoningFilter()
  for await (const data of readEventStream(response.body, signal)) {
    if (data === '[DONE]') {
      finished = true
      break
    }
    const chunk = JSON.parse(data) as {
      error?: unknown
      choices?: Array<{ delta?: { content?: string }, finish_reason?: string | null }>
    }
    if (chunk.error) throw new Error('MiniMax stream failed')
    const choice = chunk.choices?.[0]
    if (choice?.finish_reason && choice.finish_reason !== 'stop') throw new Error('MiniMax response incomplete')
    // MiniMax ends at EOF after finish_reason=stop, without OpenAI's optional [DONE].
    if (choice?.finish_reason === 'stop') finished = true
    // Only final answer text is forwarded; reasoning_details is never exposed.
    if (typeof choice?.delta?.content === 'string') {
      const text = filter.push(choice.delta.content)
      if (text) {
        content += text
        await options.onText?.(text)
      }
    }
  }
  if (!finished) throw new Error('MiniMax stream interrupted')
  const tail = filter.finish()
  if (tail) {
    content += tail
    await options.onText?.(tail)
  }
  if (!content.trim()) throw new Error('MiniMax returned an empty response')
  return content.trim()
}
