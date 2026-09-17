import { describe, expect, it } from 'vitest'
import QRCode from 'qrcode'
import { createQrCodeDataUrl } from '../../shared/utils/qr-code'
import { buildSwissQrBill } from '../../shared/utils/qr-bill'
import { printCompany, printDocument } from '../fixtures/document-print'

describe('Worker-compatible QR images', () => {
  const bill = buildSwissQrBill(printDocument(), printCompany())!

  it.each([
    { payload: 'https://pos.example.test/dossiers/50', margin: 4, width: 300 },
    { payload: bill.payload, margin: 0, width: 220 },
    { payload: 'sms:+41791234567?body=Réparation%20terminée%20%26%20test', margin: 1, width: 320 }
  ])('preserves the QR encoding and print options for $payload', async ({ payload, margin, width }) => {
    const options = { errorCorrectionLevel: 'M' as const, margin, width }
    const image = createQrCodeDataUrl(payload, options)
    const prefix = 'data:image/svg+xml;charset=utf-8,'

    expect(image.startsWith(prefix)).toBe(true)
    expect(decodeURIComponent(image.slice(prefix.length))).toBe(
      await QRCode.toString(payload, { ...options, type: 'svg' })
    )
  })

  it('rejects an empty payload instead of producing an unusable code', () => {
    expect(() => createQrCodeDataUrl('')).toThrow('No input text')
  })
})
