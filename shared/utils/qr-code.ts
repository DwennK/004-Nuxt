import QRCodeCore from 'qrcode/lib/core/qrcode.js'
import { render } from 'qrcode/lib/renderer/svg-tag.js'
import type { QRCodeToStringOptions } from 'qrcode'

// Import only the pure QR encoder and SVG renderer: the package entry point
// also loads pngjs and Node streams, which cannot run in the Worker bundle.
export function createQrCodeDataUrl(payload: string, options: QRCodeToStringOptions = {}) {
  const qr = QRCodeCore.create(payload, options)
  const svg = render(qr, options)

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}
