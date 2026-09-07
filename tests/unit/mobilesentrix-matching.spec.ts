import { describe, expect, it, vi } from 'vitest'
import { matchRepair, modelsMatch } from '../../scripts/mobilesentrix/match.mjs'
import { createSupplierApi, europeanProductFromHtml } from '../../scripts/mobilesentrix/api.mjs'
import { buildReport } from '../../scripts/mobilesentrix/catalog.mjs'

const repair = { id: 1, type: 'repair', brand: 'Apple', model: 'iPhone 13', service_kind: 'Remplacement batterie' }
const product = (name: string, extra = {}) => ({ entity_id: '10', product_id: '10', sku: '000123', name, title: name, url: 'https://www.mobilesentrix.eu/battery', ...extra })
const env = {
  MOBILESENTRIX_CONSUMER_KEY: 'key', MOBILESENTRIX_CONSUMER_SECRET: 'secret',
  MOBILESENTRIX_ACCESS_TOKEN: 'token', MOBILESENTRIX_ACCESS_TOKEN_SECRET: 'token-secret'
}

describe('MobileSentrix Europe matching rules', () => {
  it('chooses standard Plus even when Extended is available and standard is out of stock', () => {
    const result = matchRepair(repair, [product('Replacement Battery For iPhone 13 (AmpSentrix Plus)', { is_in_stock: 0 }), product('Replacement Battery For iPhone 13 (AmpSentrix Plus Extended)', { sku: '456' })])
    expect(result).toMatchObject({ status: 'matched', reference: { sku: '000123' } })
  })

  it.each(['iPhone 13 Pro', 'iPhone 13 Pro Max', 'iPhone 13 Mini', 'iPhone 14'])('rejects neighboring model %s', (model) => {
    expect(modelsMatch(repair, product(`Replacement Battery For ${model} (AmpSentrix Plus)`))).toBe(false)
  })

  it('does not confuse FE, 5G or combined SE generations', () => {
    expect(modelsMatch({ model: 'Galaxy S20 5G' }, product('Battery For Samsung Galaxy S20 FE 5G'))).toBe(false)
    expect(modelsMatch({ model: 'Galaxy S10' }, product('Battery For Samsung Galaxy S10 5G'))).toBe(false)
    expect(modelsMatch({ model: 'iPhone SE 2020/2022' }, product('Battery For iPhone SE (2020)'))).toBe(false)
    expect(modelsMatch({ model: 'iPhone SE 2020/2022' }, product('Battery', { model_text: 'iPhone SE 2020 / iPhone SE 2022' }))).toBe(true)
  })

  it('accepts XO7 Soft but excludes 3.0 and tag-on accessories', () => {
    const screen = { ...repair, service_kind: 'Remplacement écran' }
    expect(matchRepair(screen, [product('OLED Assembly For iPhone 13 (XO7 Soft)')]).status).toBe('matched')
    expect(matchRepair(screen, [product('OLED Assembly For iPhone 13 (XO7 3.0 Soft)')]).status).toBe('not_found')
    expect(matchRepair(screen, [product('Display Tag-On Flex For iPhone 13 XO7 Soft')]).status).toBe('not_found')
  })

  it('prefers Samsung Pro to Service Pack irrespective of stock', () => {
    const samsung = { ...repair, brand: 'Samsung', model: 'Galaxy S22 5G' }
    expect(matchRepair(samsung, [product('Replacement Battery For Samsung Galaxy S22 5G (AmpSentrix Pro)', { is_in_stock: 0 }), product('Replacement Battery For Samsung Galaxy S22 5G (Service Pack)', { sku: '456' })]).reference?.sku).toBe('000123')
    expect(matchRepair(samsung, [product('Replacement Battery For Samsung Galaxy S22 5G (Service Pack)')]).status).toBe('matched')
  })

  it('does not silently choose a color or frame', () => {
    const samsung = { ...repair, brand: 'Samsung', model: 'Galaxy S22 5G', service_kind: 'Remplacement écran' }
    const result = matchRepair(samsung, [product('OLED Assembly With Frame For Samsung Galaxy S22 5G (Service Pack) (Black)')])
    expect(result.status).toBe('variant_required')
    expect(result.reference).toBeUndefined()
  })

  it('retains complete camera glass with adhesive but leaves bulk packs unresolved', () => {
    const lens = { ...repair, service_kind: 'Lentille caméra' }
    expect(matchRepair(lens, [product('Back Camera Lens (Glass Only) With Adhesive For iPhone 13 (Premium)')]).status).toBe('matched')
    expect(matchRepair(lens, [product('Back Camera Lens (Glass Only) With Adhesive For iPhone 13 (Premium) (10 Pack)')]).status).toBe('variant_required')
    expect(matchRepair(repair, [product('Battery Adhesive Tape For iPhone 13 (AmpSentrix Plus)')]).status).toBe('not_found')
  })

  it('never substitutes one telephoto module for an unspecified rear camera repair', () => {
    const camera = { ...repair, brand: 'Samsung', model: 'Galaxy S24 Ultra 5G', service_kind: 'Caméra arrière' }
    expect(matchRepair(camera, [product('Back Camera (Telephoto) (10MP) For Samsung Galaxy S24 Ultra 5G (Premium)')]).status).toBe('variant_required')
  })

  it('requires European evidence for Pull A and excludes USA', () => {
    const housing = { ...repair, service_kind: 'Châssis / cadre' }
    expect(matchRepair(housing, [product('Housing For iPhone 13 (Used OEM Pull: Grade A) (USA)')]).status).toBe('not_found')
    expect(matchRepair(housing, [product('Housing For iPhone 13 (Used OEM Pull: Grade A)')]).status).toBe('variant_required')
    expect(matchRepair(housing, [product('Housing For iPhone 13 (Used OEM Pull: Grade A) (Europe) (Blue)')]).status).toBe('variant_required')
    const global = matchRepair(housing, [product('Housing For iPhone 13 (EU / Global Version) (Used OEM Pull: Grade A) (Yellow)')])
    expect(global.candidates[0].reasons).not.toContain('Compatibilité Europe à confirmer')
  })

  it('requires an exact Product SKU on the public European page', () => {
    const html = '<script type="application/ld+json">{"@type":"Product","sku":"000123"}</script>'
    expect(europeanProductFromHtml(html, '000123')).toBe(true)
    expect(europeanProductFromHtml(html, '123')).toBe(false)
    expect(europeanProductFromHtml('<p>Other products: 000123</p>', '000123')).toBe(false)
  })

  it('does not reuse a US product ID for a verified European link', async () => {
    const item = product('Replacement Battery For iPhone 13 (AmpSentrix Plus)')
    const report = await buildReport([repair], {
      search: async () => [item], product: async () => item,
      europeProduct: async () => ({ status: 'verified', url: 'https://www.mobilesentrix.eu/verified-battery' })
    }, { id: 'test' })
    expect(report.entries[0].reference).toEqual({ sku: '000123', productId: null, url: 'https://www.mobilesentrix.eu/verified-battery' })
  })

  it('blocks incomplete searches instead of claiming no match', () => {
    expect(matchRepair(repair, [], false).status).toBe('blocked')
  })

  it('reports every repair on authentication failure and preserves manual removals', async () => {
    const search = vi.fn().mockRejectedValue(new Error('API MobileSentrix HTTP 401 : identifiants OAuth refusés'))
    const report = await buildReport([repair, { ...repair, id: 2 }, { ...repair, id: 3, mobilesentrix_json: JSON.stringify({ source: 'manual', status: 'unlinked' }) }], { search }, { id: 'test' })
    expect(search).toHaveBeenCalledOnce()
    expect(report.summary).toMatchObject({ blocked: 2, not_found: 0, preserved: 1 })
  })
})

describe('Europe API completeness and provenance', () => {
  it('paginates and retains SKU strings', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({ data: { total_items: 101, items: Array.from({ length: 100 }, (_, i) => ({ product_id: String(i + 1) })) } }))
      .mockResolvedValueOnce(Response.json({ data: { total_items: 101, items: [{ product_id: '101', product_code: '000123' }] } }))
    const result = await createSupplierApi(env, fetcher).search('iphone')
    expect(result).toHaveLength(101)
    expect(result[100].product_code).toBe('000123')
    expect(String(fetcher.mock.calls[1]![0])).toContain('start_index=100')
    expect(fetcher.mock.calls[0]![1]).toMatchObject({ redirect: 'error' })
  })

  it('rejects repeated pages and incomplete results', async () => {
    const fetcher = vi.fn().mockImplementation(async () => Response.json({ data: { total_items: 101, items: [{ product_id: '1' }] } }))
    await expect(createSupplierApi(env, fetcher).search('iphone')).rejects.toThrow('pagination interrompue')
  })

  it('advances by the actual page size when the supplier caps results', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({ data: { total_items: 3, items: [{ product_id: '1' }, { product_id: '2' }] } }))
      .mockResolvedValueOnce(Response.json({ data: { total_items: 3, items: [{ product_id: '3' }] } }))
    expect(await createSupplierApi(env, fetcher).search('iphone')).toHaveLength(3)
    expect(String(fetcher.mock.calls[1]![0])).toContain('start_index=2')
  })

  it('blocks when a detail request fails rather than retaining a partial match', async () => {
    const api = {
      search: async () => [product('Replacement Battery For iPhone 13 (AmpSentrix Plus)')],
      product: async () => { throw new Error('API MobileSentrix HTTP 503') }
    }
    const report = await buildReport([repair], api, { id: 'test' })
    expect(report.summary).toMatchObject({ blocked: 1, matched: 0, not_found: 0 })
  })

  it('rejects a product detail from another store', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(product('Battery', { url: 'https://www.mobilesentrix.eu/battery' })))
    await expect(createSupplierApi(env, fetcher).product('10')).rejects.toThrow('boutique API')
  })

  it('does not log supplier response bodies or secrets on failure', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('private secret', { status: 401 }))
    await expect(createSupplierApi(env, fetcher).search('iphone')).rejects.toThrow('API MobileSentrix HTTP 401 : identifiants OAuth refusés')
  })
})
