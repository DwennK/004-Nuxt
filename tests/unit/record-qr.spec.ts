import { describe, expect, it } from 'vitest'
import { buildRecordQrUrl, parseRecordScan } from '../../shared/utils/record-qr'

const origin = 'https://pos.example.test'

describe('printed record QR links', () => {
  it.each(['tickets', 'documents'] as const)('round trips a %s identifier', (type) => {
    const url = buildRecordQrUrl(type, 30034, origin)
    expect(url).toBe(`${origin}/${type}/30034`)
    expect(parseRecordScan(url, origin)).toEqual({ kind: 'record', path: `/${type}/30034` })
  })

  it('reads existing workshop ticket URLs and trims scanned whitespace', () => {
    expect(parseRecordScan(` ${origin}/tickets/42\n`, origin)).toEqual({ kind: 'record', path: '/tickets/42' })
  })

  it.each([
    'https://foreign.test/documents/1', 'https://pos.example.test.evil.test/documents/1',
    'https://user@pos.example.test/documents/1', 'http://pos.example.test/documents/1',
    `${origin}/documents/0`, `${origin}/documents/-1`, `${origin}/documents/1.5`,
    `${origin}/documents/9007199254740992`, `${origin}/documents/1/print`,
    `${origin}/documents/1?redirect=https://foreign.test`, `${origin}/documents/1#other`,
    `${origin}/customers/1`, '//pos.example.test/documents/1', '/documents/1',
    'javascript:alert(1)', 'data:text/html,test', 'https://', 'SPC\n0200\n1\nCH123'
  ])('rejects unsupported payload %s', (value) => {
    expect(parseRecordScan(value, origin)).toEqual({ kind: 'unsupported' })
  })

  it.each(['7612345678900', 'TIC-123', 'facture 30034', 'ABC-123'])('preserves ordinary search %s', (query) => {
    expect(parseRecordScan(query, origin)).toEqual({ kind: 'search', query })
  })

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])('refuses invalid identifiers %s', (id) => {
    expect(() => buildRecordQrUrl('documents', id, origin)).toThrow()
  })
})
