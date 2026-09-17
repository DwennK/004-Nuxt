declare module 'qrcode/lib/core/qrcode.js' {
  export type QrCodeCreateOptions = import('qrcode').QRCodeOptions

  export type QrCode = {
    modules: {
      size: number
      data: ArrayLike<boolean>
    }
  }

  const QRCodeCore: {
    create(payload: string, options?: QrCodeCreateOptions): QrCode
  }

  export default QRCodeCore
}

declare module 'qrcode/lib/renderer/svg-tag.js' {
  export function render(
    qr: import('qrcode/lib/core/qrcode.js').QrCode,
    options?: import('qrcode').QRCodeToStringOptions
  ): string
}
