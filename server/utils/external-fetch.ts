import { createError } from 'h3'

type ExternalFetchOptions = {
  provider: string
  timeoutMs: number
  maxResponseBytes?: number
  requestId?: string
  requestIdHeader?: string | false
  timeoutMessage?: string
  networkErrorMessage?: string
  responseTooLargeMessage?: string
}

type ExternalFetchErrorCode
  = | 'external_request_timeout'
    | 'external_request_failed'
    | 'external_response_too_large'

type ExternalFetchErrorData = {
  code: ExternalFetchErrorCode
  provider: string
  requestId: string
  timeoutMs: number
  maxResponseBytes?: number
}

const DEFAULT_MAX_RESPONSE_BYTES = 8 * 1024 * 1024

class ResponseSizeLimitError extends Error {
  constructor(
    readonly maxResponseBytes: number,
    readonly receivedBytes?: number
  ) {
    super('External response exceeded the configured byte limit')
    this.name = 'ResponseSizeLimitError'
  }
}

async function readBoundedResponseBody(response: Response, maxResponseBytes: number) {
  if (!response.body) {
    return null
  }

  const contentLength = Number(response.headers.get('content-length'))

  if (Number.isSafeInteger(contentLength) && contentLength > maxResponseBytes) {
    await response.body.cancel('response-too-large').catch(() => undefined)
    throw new ResponseSizeLimitError(maxResponseBytes, contentLength)
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let receivedBytes = 0

  try {
    while (true) {
      const { done, value } = await reader.read()

      if (done) {
        break
      }

      receivedBytes += value.byteLength

      if (receivedBytes > maxResponseBytes) {
        await reader.cancel('response-too-large').catch(() => undefined)
        throw new ResponseSizeLimitError(maxResponseBytes, receivedBytes)
      }

      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  if (receivedBytes === 0) {
    return null
  }

  const body = new Uint8Array(receivedBytes)
  let offset = 0

  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }

  return body
}

function getRequestMethod(input: RequestInfo | URL, init?: RequestInit) {
  if (init?.method) {
    return init.method.toUpperCase()
  }

  return input instanceof Request ? input.method.toUpperCase() : 'GET'
}

function getRequestTarget(input: RequestInfo | URL) {
  try {
    const requestUrl = input instanceof Request ? input.url : String(input)
    const url = new URL(requestUrl)

    return `${url.origin}${url.pathname}`
  } catch {
    return 'unknown'
  }
}

function getDurationMs(startedAt: number) {
  return Math.round(performance.now() - startedAt)
}

function writeExternalRequestLog(payload: {
  level: 'info' | 'warn' | 'error'
  provider: string
  requestId: string
  method: string
  target: string
  durationMs: number
  status?: number
  errorCode?: ExternalFetchErrorCode
}) {
  const { level, ...details } = payload
  const message = JSON.stringify({
    scope: 'external-fetch',
    ...details
  })

  if (level === 'error') {
    console.error(message)
    return
  }

  if (level === 'warn') {
    console.warn(message)
    return
  }

  console.info(message)
}

export function isExternalFetchError(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('data' in error)) {
    return false
  }

  const data = error.data

  return Boolean(
    data
    && typeof data === 'object'
    && 'code' in data
    && (
      data.code === 'external_request_timeout'
      || data.code === 'external_request_failed'
      || data.code === 'external_response_too_large'
    )
  )
}

export async function externalFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: ExternalFetchOptions
) {
  const requestId = options.requestId || crypto.randomUUID()
  const method = getRequestMethod(input, init)
  const target = getRequestTarget(input)
  const headers = new Headers(
    init.headers === undefined && input instanceof Request
      ? input.headers
      : init.headers
  )
  const requestIdHeader = options.requestIdHeader === undefined ? 'X-Request-Id' : options.requestIdHeader
  const maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES

  if (!Number.isSafeInteger(maxResponseBytes) || maxResponseBytes <= 0) {
    throw new TypeError('maxResponseBytes must be a positive safe integer')
  }

  if (requestIdHeader && !headers.has(requestIdHeader)) {
    headers.set(requestIdHeader, requestId)
  }

  const timeoutSignal = AbortSignal.timeout(options.timeoutMs)
  const callerSignal = init.signal || (input instanceof Request ? input.signal : undefined)
  const signal = callerSignal
    ? AbortSignal.any([callerSignal, timeoutSignal])
    : timeoutSignal
  const startedAt = performance.now()

  try {
    const response = await fetch(input, {
      ...init,
      headers,
      signal
    })
    const body = await readBoundedResponseBody(response, maxResponseBytes)
    const bufferedResponse = new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    })

    writeExternalRequestLog({
      level: response.ok ? 'info' : 'warn',
      provider: options.provider,
      requestId,
      method,
      target,
      durationMs: getDurationMs(startedAt),
      status: response.status
    })

    return {
      response: bufferedResponse,
      requestId
    }
  } catch (error) {
    const responseTooLarge = error instanceof ResponseSizeLimitError
    const timedOut = timeoutSignal.aborted
    const code: ExternalFetchErrorCode = responseTooLarge
      ? 'external_response_too_large'
      : timedOut
        ? 'external_request_timeout'
        : 'external_request_failed'

    writeExternalRequestLog({
      level: 'error',
      provider: options.provider,
      requestId,
      method,
      target,
      durationMs: getDurationMs(startedAt),
      errorCode: code
    })

    throw createError<ExternalFetchErrorData>({
      statusCode: timedOut && !responseTooLarge ? 504 : 502,
      statusMessage: responseTooLarge
        ? options.responseTooLargeMessage || `${options.provider} response exceeded the allowed size`
        : timedOut
          ? options.timeoutMessage || `${options.provider} request timed out`
          : options.networkErrorMessage || `${options.provider} request failed`,
      data: {
        code,
        provider: options.provider,
        requestId,
        timeoutMs: options.timeoutMs,
        maxResponseBytes: responseTooLarge ? maxResponseBytes : undefined
      },
      cause: error
    })
  }
}
