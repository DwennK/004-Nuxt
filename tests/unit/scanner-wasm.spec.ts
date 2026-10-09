import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import QRCode from 'qrcode'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const detectorRequire = createRequire(require.resolve('barcode-detector/ponyfill'))
const { prepareZXingModule, readBarcodes } = detectorRequire('zxing-wasm/reader') as typeof import('zxing-wasm/reader')

describe('scanner WASM compatibility', () => {
  it('decodes a QR code with the detector engine and the locally served WASM', async () => {
    const wasmBinary = await readFile(new URL('../../public/vendor/zxing/zxing_reader.wasm', import.meta.url))
    await prepareZXingModule({ overrides: { wasmBinary }, fireImmediately: true })

    const image = await QRCode.toBuffer('POS-SCANNER-12345', { width: 256 })
    const results = await readBarcodes(image, { formats: ['QRCode'] })

    expect(results.map(result => result.text)).toEqual(['POS-SCANNER-12345'])
  })
})
