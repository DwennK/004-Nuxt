import type { DocumentEmailInput, DocumentDetail } from '~~/shared/types/pos'
import type { CompanySettingsRecord } from '~~/shared/types/settings'
import { getDocumentPdfFilename } from '~~/shared/utils/document-email'

type SendDocumentEmailOptions = {
  input: DocumentEmailInput
  document: DocumentDetail
  company: CompanySettingsRecord
  pdfBytes: Uint8Array
}

function encodeBase64(bytes: Uint8Array) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64')
  }

  let binary = ''
  const chunkSize = 0x8000

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize)
    binary += String.fromCharCode(...chunk)
  }

  return btoa(binary)
}

export async function sendDocumentEmail({ input, document, company, pdfBytes }: SendDocumentEmailOptions) {
  const config = useRuntimeConfig()

  if (!config.resendApiKey || !config.mailFrom) {
    throw createError({
      statusCode: 500,
      statusMessage: 'La configuration e-mail est incomplète'
    })
  }

  const replyTo = config.mailReplyTo || company.email || undefined
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.resendApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: config.mailFrom,
      to: [input.to],
      reply_to: replyTo ? [replyTo] : undefined,
      subject: input.subject,
      text: input.message,
      attachments: [{
        filename: getDocumentPdfFilename(document),
        content: encodeBase64(pdfBytes)
      }]
    })
  })

  const payload = await response.json().catch(() => null) as { id?: string, message?: string, error?: string } | null

  if (!response.ok) {
    throw createError({
      statusCode: 502,
      statusMessage: payload?.message || payload?.error || 'L’envoi e-mail a échoué'
    })
  }

  return {
    id: payload?.id || null
  }
}
