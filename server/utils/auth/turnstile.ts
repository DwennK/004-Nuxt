import type { H3Event } from 'h3'

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
const TEST_SECRET_KEY = '1x0000000000000000000000000000000AA'

interface TurnstileValidation {
  'success': boolean
  'hostname'?: string
  'action'?: string
  'error-codes'?: string[]
}

function getClientIp(event: H3Event) {
  return getRequestHeader(event, 'cf-connecting-ip')
    || getRequestIP(event, { xForwardedFor: true })
    || undefined
}

function verificationError(statusCode: number, statusMessage: string) {
  return createError({ statusCode, statusMessage })
}

export async function verifyLoginTurnstile(event: H3Event, token: string) {
  const config = useRuntimeConfig(event)
  const secretKey = config.turnstileSecretKey.trim()

  if (!secretKey) {
    console.error('NUXT_TURNSTILE_SECRET_KEY is missing')
    throw verificationError(503, 'La vérification anti-robot est indisponible.')
  }

  let response: Response

  try {
    response = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        secret: secretKey,
        response: token,
        remoteip: getClientIp(event)
      }),
      signal: AbortSignal.timeout(5000)
    })
  } catch (error) {
    console.error('Turnstile Siteverify request failed', error)
    throw verificationError(503, 'La vérification anti-robot est indisponible.')
  }

  if (!response.ok) {
    console.error('Turnstile Siteverify returned an unexpected status', response.status)
    throw verificationError(503, 'La vérification anti-robot est indisponible.')
  }

  const validation = await response.json() as TurnstileValidation
  const usesTestKey = secretKey === TEST_SECRET_KEY
  const expectedHostname = getRequestURL(event).hostname
  const metadataMatches = usesTestKey
    || (validation.action === 'login' && validation.hostname === expectedHostname)

  if (!validation.success || !metadataMatches) {
    console.warn('Turnstile login validation failed', {
      action: validation.action,
      hostname: validation.hostname,
      errorCodes: validation['error-codes']
    })
    throw verificationError(403, 'La vérification anti-robot a échoué.')
  }
}
