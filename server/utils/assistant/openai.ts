type StructuredResponseOptions = {
  requestId: string
  schemaName: string
  schema: Record<string, unknown>
  systemPrompt: string
  userPrompt: string
}

type OpenAIChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | null
    }
  }>
}

function getOpenAIConfig() {
  const config = useRuntimeConfig()
  const apiKey = config.openaiApiKey
  const model = config.openaiModel
  const baseUrl = (config.openaiBaseUrl || 'https://api.openai.com/v1').replace(/\/$/, '')

  if (!apiKey || !model) {
    throw createError({
      statusCode: 500,
      statusMessage: 'OpenAI configuration is missing'
    })
  }

  return {
    apiKey,
    model,
    baseUrl
  }
}

function buildHeaders(apiKey: string, requestId: string) {
  return {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'X-Client-Request-Id': requestId
  }
}

export async function requestStructuredOpenAIResponse<T>(options: StructuredResponseOptions): Promise<T> {
  const { apiKey, baseUrl, model } = getOpenAIConfig()
  const response = await $fetch<OpenAIChatCompletionResponse>(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: buildHeaders(apiKey, options.requestId),
    body: {
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
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: options.schemaName,
          strict: true,
          schema: options.schema
        }
      }
    }
  })

  const content = response.choices?.[0]?.message?.content?.trim()

  if (!content) {
    throw createError({
      statusCode: 502,
      statusMessage: 'OpenAI returned an empty structured response'
    })
  }

  return JSON.parse(content) as T
}

export async function requestOpenAITextResponse(options: {
  requestId: string
  systemPrompt: string
  userPrompt: string
}) {
  const { apiKey, baseUrl, model } = getOpenAIConfig()
  const response = await $fetch<OpenAIChatCompletionResponse>(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: buildHeaders(apiKey, options.requestId),
    body: {
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
    }
  })

  const content = response.choices?.[0]?.message?.content?.trim()

  if (!content) {
    throw createError({
      statusCode: 502,
      statusMessage: 'OpenAI returned an empty response'
    })
  }

  return content
}
