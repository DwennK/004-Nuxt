import type { SentMailDetail, SentMailListResponse, SentMailStatus, SentMailSummary } from '~~/shared/types/pos'

type ResendEmailReference = {
  id?: string
  to?: string[] | null
  from?: string | null
  created_at?: string | null
  subject?: string | null
  bcc?: string[] | null
  cc?: string[] | null
  reply_to?: string[] | null
  last_event?: string | null
}

type ResendEmailListResponse = {
  has_more?: boolean
  data?: ResendEmailReference[] | null
}

type ResendEmailDetailResponse = ResendEmailReference & {
  html?: string | null
  text?: string | null
}

type ListSentEmailsOptions = {
  limit: number
  after?: string
  before?: string
}

const knownSentMailStatuses = new Set<SentMailStatus>([
  'queued',
  'scheduled',
  'sent',
  'delivered',
  'delivery_delayed',
  'bounced',
  'complained',
  'opened',
  'clicked',
  'rendering_failure',
  'canceled',
  'suppressed',
  'unknown'
])

function parseSentMailStatus(value?: string | null): SentMailStatus {
  if (value && knownSentMailStatuses.has(value as SentMailStatus)) {
    return value as SentMailStatus
  }

  return 'unknown'
}

function decodeHtmlEntities(input: string) {
  return input
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, '\'')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
}

function htmlToText(html: string) {
  return decodeHtmlEntities(
    html
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|section|article|header|footer|tr|table|h[1-6])>/gi, '\n')
      .replace(/<li[^>]*>/gi, '- ')
      .replace(/<\/li>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function normalizeBodyText(payload: Pick<ResendEmailDetailResponse, 'text' | 'html'>) {
  return payload.text?.trim()
    || (payload.html ? htmlToText(payload.html) : '')
}

function buildPreview(bodyText: string) {
  return bodyText
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140)
}

function normalizeSummary(mail: ResendEmailReference): SentMailSummary {
  return {
    id: String(mail.id || ''),
    to: Array.isArray(mail.to) ? mail.to.filter(Boolean) : [],
    from: String(mail.from || ''),
    subject: String(mail.subject || '(Sans objet)'),
    createdAt: String(mail.created_at || new Date(0).toISOString()),
    lastEvent: parseSentMailStatus(mail.last_event),
    replyTo: Array.isArray(mail.reply_to) ? mail.reply_to.filter(Boolean) : [],
    preview: ''
  }
}

function getReadableErrorMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === 'object') {
    if ('message' in payload && typeof payload.message === 'string' && payload.message.trim()) {
      return payload.message
    }

    if ('error' in payload && typeof payload.error === 'string' && payload.error.trim()) {
      return payload.error
    }
  }

  return fallback
}

async function resendRequest<T>(path: string, query?: Record<string, string | number | undefined>) {
  const config = useRuntimeConfig()

  if (!config.resendApiKey) {
    throw createError({
      statusCode: 500,
      statusMessage: 'La configuration Resend est incomplète'
    })
  }

  const url = new URL(path, 'https://api.resend.com')

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '') {
        url.searchParams.set(key, String(value))
      }
    }
  }

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${config.resendApiKey}`,
      'Content-Type': 'application/json'
    }
  })

  const payload = await response.json().catch(() => null) as unknown

  if (!response.ok) {
    throw createError({
      statusCode: response.status >= 500 ? 502 : response.status,
      statusMessage: getReadableErrorMessage(payload, 'Impossible de récupérer les e-mails Resend')
    })
  }

  return payload as T
}

export async function listSentEmails({ limit, after, before }: ListSentEmailsOptions): Promise<SentMailListResponse> {
  const payload = await resendRequest<ResendEmailListResponse>('/emails', {
    limit,
    after,
    before
  })

  const items = await Promise.all((payload.data || [])
    .filter(mail => mail?.id)
    .map(async (mail) => {
      const summary = normalizeSummary(mail)

      try {
        const detailPayload = await resendRequest<ResendEmailDetailResponse>(`/emails/${summary.id}`)
        return {
          ...summary,
          preview: buildPreview(normalizeBodyText(detailPayload))
        }
      } catch {
        return summary
      }
    }))

  return {
    items,
    hasMore: Boolean(payload.has_more),
    beforeCursor: items[0]?.id || null,
    afterCursor: items.at(-1)?.id || null,
    limit
  }
}

export async function getSentEmail(id: string): Promise<SentMailDetail> {
  const payload = await resendRequest<ResendEmailDetailResponse>(`/emails/${id}`)
  const summary = normalizeSummary(payload)
  const bodyText = normalizeBodyText(payload)

  return {
    ...summary,
    preview: buildPreview(bodyText),
    cc: Array.isArray(payload.cc) ? payload.cc.filter(Boolean) : [],
    bcc: Array.isArray(payload.bcc) ? payload.bcc.filter(Boolean) : [],
    bodyText
  }
}
