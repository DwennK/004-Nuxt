import { describe, expect, it, vi } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { classifyEmailError, getEmailBinding, maxEmailBytes, parseMailAddress, prepareEmail } from '../../server/utils/email/transport'
import { effectiveMailStatus } from '../../server/utils/email/journal'
import { formatSentMailListDate, getSentMailStatusMeta } from '../../shared/utils/sent-email'
import { documentEmailSchema } from '../../shared/validation/pos'
import { createEvent } from 'h3'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { mailFixture } from '../fixtures/email'
import { readPendingEmailAttempt } from '../../shared/utils/email-attempt'

describe('Cloudflare email transport', () => {
  it('uses the POS time zone in SSR and browser, including winter time', () => {
    expect(formatSentMailListDate('2026-09-02T01:04:00.000Z')).toContain('03:04')
    expect(formatSentMailListDate('2026-01-02T01:04:00.000Z')).toContain('02:04')
  })
  it('preserves named and plain mail addresses', () => {
    expect(parseMailAddress('Microwest <info@microwest.ch>')).toEqual({ name: 'Microwest', email: 'info@microwest.ch' })
    expect(parseMailAddress('info@microwest.ch')).toBe('info@microwest.ch')
    expect(() => parseMailAddress('')).toThrow()
    expect(() => parseMailAddress('info@microwest.ch\r\nBcc: evil@example.test')).toThrow()
  })
  it('requires the native binding and supports Nitro production context', () => {
    const request = new IncomingMessage(new Socket())
    const event = createEvent(request, new ServerResponse(request))
    expect(() => getEmailBinding(event)).toThrow('Cloudflare')
    const binding = { send: vi.fn() }
    event.context._platform = { cloudflare: { env: { EMAIL: binding } } }
    expect(getEmailBinding(event)).toBe(binding)
  })
  it('rejects messages that exceed the limit after base64 encoding', () => {
    const mail = mailFixture()
    mail.attachments[0]!.content = new Uint8Array(4 * 1024 * 1024)
    expect(mail.attachments[0]!.content.byteLength).toBeLessThan(maxEmailBytes)
    expect(() => prepareEmail(mail)).toThrow('5 Mio')
  })
  it('accepts a normal large PDF as binary content', () => {
    const mail = mailFixture()
    mail.attachments[0]!.content = new Uint8Array(3 * 1024 * 1024)
    expect(prepareEmail(mail).attachments?.[0]?.content).toEqual(mail.attachments[0]!.content)
  })
  it('preserves a readable PDF and only the bytes in its binary view', async () => {
    const pdf = await PDFDocument.create()
    pdf.addPage().drawText('Invoice attachment regression')
    const pdfBytes = await pdf.save()
    const padded = new Uint8Array(pdfBytes.length + 16).fill(255)
    padded.set(pdfBytes, 8)
    const mail = mailFixture()
    mail.attachments[0]!.content = padded.subarray(8, 8 + pdfBytes.length)

    const attachment = prepareEmail(mail).attachments![0]!
    expect(attachment).toMatchObject({ filename: 'FA-123.pdf', type: 'application/pdf', disposition: 'attachment' })
    expect(attachment.content).toBeInstanceOf(Uint8Array)
    const content = attachment.content as Uint8Array
    expect(content).toEqual(pdfBytes)
    expect(new TextDecoder().decode(content.subarray(0, 5))).toBe('%PDF-')
    expect((await PDFDocument.load(content)).getPageCount()).toBe(1)
  })
  it('treats internal/network failures as uncertain, not confirmed failures', () => {
    expect(classifyEmailError({ code: 'E_INTERNAL_SERVER_ERROR' }).status).toBe('unknown')
    expect(classifyEmailError(new Error('network')).status).toBe('unknown')
    expect(classifyEmailError({ code: 'E_RECIPIENT_SUPPRESSED' }).status).toBe('rejected')
  })
  it('displays crashed/stale attempts as needing verification', () => {
    expect(effectiveMailStatus({ status: 'sending', createdAt: '2020-01-01T00:00:00.000Z' })).toBe('unknown')
    expect(getSentMailStatusMeta('unknown').label).toBe('À vérifier')
    expect(effectiveMailStatus({ status: 'sending', createdAt: new Date().toISOString() })).toBe('sending')
  })
  it('rejects newline subjects and oversized text before sending', () => {
    const input = { to: 'client@example.test', subject: 'Facture', message: 'Bonjour' }
    expect(documentEmailSchema.safeParse(input).success).toBe(true)
    expect(documentEmailSchema.safeParse({ ...input, subject: 'Hi\r\nBcc: another' }).success).toBe(false)
    expect(documentEmailSchema.safeParse({ ...input, message: 'x'.repeat(100001) }).success).toBe(false)
  })
  it('restores the same pending form and key after reload; rejects corrupt storage', () => {
    const pending = { key: crypto.randomUUID(), payload: { to: 'client@example.test', subject: 'Facture', message: 'Bonjour' } }
    expect(readPendingEmailAttempt({ getItem: () => JSON.stringify(pending) }, 'test')).toEqual(pending)
    expect(readPendingEmailAttempt({ getItem: () => null }, 'test')).toBeNull()
    expect(() => readPendingEmailAttempt({ getItem: () => '{broken' }, 'test')).toThrow()
    expect(() => readPendingEmailAttempt({ getItem: () => JSON.stringify({ ...pending, key: '' }) }, 'test')).toThrow()
  })
})
