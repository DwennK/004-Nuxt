import { describe, expect, it } from 'vitest'
import { smartphoneImeiLookupSchema } from '../../shared/validation/smartphones'
import { encodeTacBlock, decodeTacBlock } from '../../server/utils/tac-block'
import { parseTacDataset } from '../../server/utils/tac-dataset'

function models(csv: string) {
  return Object.assign({}, ...parseTacDataset(`Brand,TAC,SPECS\n${csv}`).chunks.map(chunk => JSON.parse(chunk.payload)))
}

describe('TAC reference data', () => {
  it('accepts formatted IMEIs and rejects incomplete or invalid checksums', () => {
    expect(smartphoneImeiLookupSchema.parse({ imei: '490 154 203 237 518' }).imei).toBe('490154203237518')
    for (const imei of ['', '49015420', '490154203237519', 'x490154203237518']) {
      expect(smartphoneImeiLookupSchema.safeParse({ imei }).success).toBe(false)
    }
  })

  it('extracts the four actual stock models without capacity, year or modem details', () => {
    expect(models([
      'APPLE,35219560,"APPLE IPHONE 13 MINI, Apple iPhone 13 Mini, A2481, 2021"',
      'APPLE,35284311,"APPLE IPHONE 11 PRO MAX, Apple iPhone 11 Pro Max, A2161 - (US Model), 2019, Intel XMM 7660 Modem"',
      'APPLE,35682582,"APPLE IPHONE 13, Apple iPhone 13, A2482, 2021"',
      'APPLE,35875048,"APPLE IPHONE 13 PRO, Apple iPhone 13 Pro, A2483, 2021, QC SD X60 Modem"'
    ].join('\n'))).toEqual({ 35219560: 'iPhone 13 Mini', 35284311: 'iPhone 11 Pro Max', 35682582: 'iPhone 13', 35875048: 'iPhone 13 Pro' })
  })

  it('handles quoted commas, BOM, brand-only prefixes and leading-zero TACs', () => {
    const result = parseTacDataset('\uFEFFBrand,TAC,SPECS\r\nSAMSUNG,01234567,"SAMSUNG, SAMSUNG GALAXY S25"\r\nGOOGLE,35220565,"GOOGLE PIXEL 9A, Google G3Y122025"\r\n')
    expect(result.entries).toBe(2)
    expect(JSON.parse(result.chunks[0]!.payload)['01234567']).toBe('SAMSUNG GALAXY S25')
  })

  it('discards unusable rows and permanently excludes conflicting models or brands', () => {
    const result = parseTacDataset(`Brand,TAC,SPECS
APPLE,35219560,APPLE IPHONE 13 MINI
APPLE,35219560,APPLE IPHONE 13 MINI
Sagem,33205600,Sagem DMC 830
Sagem,33205600,Sagem M314-B0
Sagem,33205600,Sagem DMC 830
VIVO,86967805,VIVO V13 5G
REALME,86967805,VIVO V13 5G
NOKIA,440236,"NOKIA, N/A, NOKIA THIS IS A TEST IMEI TO BE USED"
APPLE,0123456,APPLE IPHONE 5
APPLE,12345678,"APPLE, N/A"
APPLE,12345679,APPLE
APPLE,12345680,<script>alert(1)</script>
,,`)
    expect(result).toMatchObject({ entries: 1, conflicts: 2, ignored: 5 })
    expect(result.chunks.map(c => JSON.parse(c.payload))).toEqual([{ 35219560: 'iPhone 13 Mini' }])
  })

  it('rejects changed columns, malformed CSV and empty datasets', () => {
    for (const csv of ['Brand,Code,SPECS\nAPPLE,35219560,APPLE IPHONE 13', 'Brand,TAC,SPECS\nAPPLE,35219560,"unterminated', 'Brand,TAC,SPECS\n']) {
      expect(() => parseTacDataset(csv)).toThrow()
    }
  })
})

describe('compressed TAC blocks', () => {
  it('round-trips models, supports legacy JSON and reduces repeated model data', async () => {
    const models = Object.fromEntries(Array.from({ length: 1000 }, (_, i) => [String(35000000 + i), 'iPhone 13 Pro']))
    const json = JSON.stringify(models)
    const compressed = await encodeTacBlock(json)
    expect(compressed.length).toBeLessThan(json.length / 4)
    expect(await decodeTacBlock(compressed)).toEqual(models)
    expect(await decodeTacBlock(json)).toEqual(models)
  })
  it('rejects malformed and oversized compressed blocks', async () => {
    await expect(decodeTacBlock('gz:invalid')).rejects.toThrow()
    await expect(decodeTacBlock(await encodeTacBlock('x'.repeat(1024 * 1024 + 1)))).rejects.toThrow('size limit')
  })
})
