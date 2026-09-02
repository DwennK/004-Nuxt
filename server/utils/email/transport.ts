// eslint-disable-next-line @typescript-eslint/triple-slash-reference -- Wrangler emits a global declaration, not an importable module.
/// <reference path="../../types/cloudflare-env.d.ts" />
import type { SendEmail as NativeSendEmail, EmailMessageBuilder } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import { createError } from 'h3'
import { z } from 'zod'
import type { SentMailStatus } from '~~/shared/types/pos'

declare global {
  // Keep Worker globals out of the browser TS context (Response, HTMLRewriter...).
  type SendEmail = NativeSendEmail
}

export type EmailBinding = PosCloudflareEnv['EMAIL']
export type EmailPayload = Parameters<EmailBinding['send']>[0]
export type OutgoingMail = {
  from: string
  to: string
  replyTo?: string
  subject: string
  text: string
  attachments: Array<{ filename: string, type: string, content: Uint8Array }>
}

export const maxEmailBytes = 5 * 1024 * 1024

export function parseMailAddress(value: string): EmailMessageBuilder['from'] {
  const trimmed = value.trim()
  const named = /^([^<>\r\n]+)\s*<([^<>\r\n]+)>$/.exec(trimmed)
  const email = named?.[2]?.trim() || trimmed
  if (!z.email().max(254).safeParse(email).success) {
    throw createError({ statusCode: 503, statusMessage: 'La configuration de l’adresse e-mail est invalide.', data: { code: 'EMAIL_INVALID_ADDRESS' } })
  }
  return named ? { name: named[1]!.trim(), email } : email
}

export function getEmailBinding(event: H3Event): EmailBinding {
  const env: unknown = event.context.cloudflare?.env || event.context._platform?.cloudflare?.env
  if (!env || typeof env !== 'object' || !('EMAIL' in env)
    || !env.EMAIL || typeof env.EMAIL !== 'object' || !('send' in env.EMAIL) || typeof env.EMAIL.send !== 'function') {
    throw createError({ statusCode: 503, statusMessage: 'Le service e-mail Cloudflare n’est pas configuré.', data: { code: 'EMAIL_NOT_CONFIGURED' } })
  }
  // The binding is provisioned by Wrangler; its generated type is the contract.
  return env.EMAIL as EmailBinding
}

export function encodeMailAttachment(bytes: Uint8Array) {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  return btoa(binary)
}

export function prepareEmail(mail: OutgoingMail): EmailPayload {
  const from = parseMailAddress(mail.from)
  const to = parseMailAddress(mail.to)
  const replyTo = mail.replyTo ? parseMailAddress(mail.replyTo) : undefined
  const bytes = (value: string) => new TextEncoder().encode(value).byteLength
  // Conservative MIME upper bound: QP text (3x), folded base64 (76 columns),
  // encoded headers/filenames, boundaries and provider authentication headers.
  let estimatedSize = 64 * 1024 + 3 * bytes(mail.text) + 4 * bytes(mail.subject + mail.from + mail.to + (mail.replyTo || ''))
  for (const attachment of mail.attachments) {
    const base64Size = 4 * Math.ceil(attachment.content.byteLength / 3)
    estimatedSize += base64Size + 2 * Math.ceil(base64Size / 76) + 4 * bytes(attachment.filename) + 4096
  }
  if (estimatedSize > maxEmailBytes) {
    throw createError({ statusCode: 413, statusMessage: 'Le message et son PDF dépassent la limite de 5 Mio après encodage.', data: { code: 'EMAIL_TOO_LARGE' } })
  }
  return {
    from, to, replyTo, subject: mail.subject, text: mail.text,
    attachments: mail.attachments.map(attachment => ({
      filename: attachment.filename, type: attachment.type, disposition: 'attachment',
      // Base64 also works with Wrangler's local email simulator.
      content: encodeMailAttachment(attachment.content)
    }))
  }
}

export function classifyEmailError(error: unknown): { status: SentMailStatus, code: string, message: string } {
  const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : 'UNKNOWN'
  const messages: Record<string, string> = {
    E_SENDER_NOT_VERIFIED: 'Le domaine d’envoi n’est pas vérifié dans Cloudflare.',
    E_SENDER_DOMAIN_NOT_AVAILABLE: 'Le domaine n’est pas activé pour l’envoi Cloudflare.',
    E_RECIPIENT_NOT_ALLOWED: 'Ce destinataire n’est pas autorisé par la configuration Cloudflare.',
    E_RECIPIENT_SUPPRESSED: 'Ce destinataire est bloqué après un rejet ou un signalement.',
    E_RATE_LIMIT_EXCEEDED: 'La limite de fréquence d’envoi Cloudflare est atteinte.',
    E_DAILY_LIMIT_EXCEEDED: 'Le quota journalier d’envoi Cloudflare est atteint.',
    E_CONTENT_TOO_LARGE: 'Le message et son PDF dépassent la limite Cloudflare de 5 Mio.',
    E_VALIDATION_ERROR: 'Cloudflare a refusé le format du message.',
    E_FIELD_MISSING: 'Un champ obligatoire manque dans le message.',
    E_DELIVERY_FAILED: 'Le serveur destinataire a refusé le message.'
  }
  if (messages[code]) {
    return { status: code === 'E_RECIPIENT_SUPPRESSED' ? 'rejected' : 'failed', code, message: messages[code] }
  }
  // A timeout/network/internal failure does not prove that nothing was sent.
  return { status: 'unknown', code: 'EMAIL_SEND_UNCERTAIN', message: 'Résultat d’envoi à vérifier. Ne renvoyez pas le message avant vérification.' }
}
