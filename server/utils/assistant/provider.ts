type StructuredResponseOptions = {
  requestId: string
  schemaName: string
  schema: Record<string, unknown>
  systemPrompt: string
  userPrompt: string
}

type TextResponseOptions = {
  requestId: string
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

const DEFAULT_MINIMAX_MODEL = 'MiniMax-M2.7'
const DEFAULT_MINIMAX_BASE_URL = 'https://api.minimax.io/v1'
const STRUCTURED_FALLBACK_STATUS_CODES = new Set([400, 422, 502])

function getProviderConfig() {
  const config = useRuntimeConfig()
  const apiKey = config.minimaxApiKey
  const model = config.minimaxModel || DEFAULT_MINIMAX_MODEL
  const baseUrl = (config.minimaxBaseUrl || DEFAULT_MINIMAX_BASE_URL).replace(/\/$/, '')

  if (!apiKey) {
    throw createError({
      statusCode: 500,
      statusMessage: 'MiniMax configuration is missing'
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

async function createChatCompletion(requestId: string, body: Record<string, unknown>) {
  const { apiKey, baseUrl } = getProviderConfig()
  const headers = buildHeaders(apiKey, requestId)

  try {
    return await $fetch<ChatCompletionResponse>(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body
    })
  } catch (error) {
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

    return $fetch<ChatCompletionResponse>(`${alternativeBaseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body
    })
  }
}

function getCompletionText(response: ChatCompletionResponse) {
  const content = normalizeMessageContent(response.choices?.[0]?.message?.content)
  return stripReasoning(content).trim()
}

export async function requestStructuredResponse<T>(options: StructuredResponseOptions): Promise<T> {
  const { model } = getProviderConfig()
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
    const response = await createChatCompletion(options.requestId, {
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
    })

    return parseStructuredContent<T>(getCompletionText(response))
  } catch (error) {
    if (!shouldRetryStructuredWithoutSchema(error)) {
      throw error
    }

    const fallbackResponse = await createChatCompletion(options.requestId, {
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
    })

    const content = getCompletionText(fallbackResponse)

    if (!content) {
      throw error
    }

    return parseStructuredContent<T>(content)
  }
}

export async function requestTextResponse(options: TextResponseOptions) {
  const { model } = getProviderConfig()
  const response = await createChatCompletion(options.requestId, {
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
  })

  const content = getCompletionText(response)

  if (!content) {
    throw createError({
      statusCode: 502,
      statusMessage: 'MiniMax returned an empty response'
    })
  }

  return content
}
