declare module 'qrcode/lib/core/qrcode.js' {
  export type QrCodeCreateOptions = {
    errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H'
  }

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
