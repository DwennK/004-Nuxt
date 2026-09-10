import { describe, expect, it } from 'vitest'
import { supplierFacts, supplierPageRange, supplierPrice, supplierProductKey, supplierQuery } from '../../shared/utils/mobilesentrix-browser'
import type { MobileSentrixProductSummary } from '../../shared/types/pos'

const product: MobileSentrixProductSummary = {
  id: '1', sku: '000123', newSku: null, name: 'Screen For iPhone 15 Pro Max (XO7 Soft) (Black) Without Frame',
  price: 45, listPrice: null, inStock: null, quantity: null, categoryIds: [], manufacturer: null, model: null, frontPosition: null,
  imageUrl: null, url: 'https://www.mobilesentrix.com/screen', tags: [], raw: {}
}
describe('supplier browser display', () => {
  it('builds a supplier query from French filter choices without sending all placeholders', () => {
    expect(supplierQuery({ text: '  ', model: 'iPhone 15', part: 'screen', quality: 'XO7 Soft', color: 'black' })).toBe('iPhone 15 screen XO7 Soft black')
    expect(supplierQuery({ text: '000123', model: '', part: 'all', quality: 'Toutes les qualités', color: 'all' })).toBe('000123')
  })
  it('preserves supplier identity, leading zeroes and separate stores', () => {
    expect(supplierProductKey(product)).toBe('www.mobilesentrix.com:000123')
    expect(supplierProductKey({ ...product, url: 'https://www.mobilesentrix.eu/screen' })).not.toBe(supplierProductKey(product))
  })
  it('does not invent missing European prices or currency', () => {
    expect(supplierPrice({ ...product, price: null })).toBe('Non communiqué')
    expect(supplierPrice({ ...product, url: 'https://www.mobilesentrix.eu/screen' })).toContain('devise non fournie')
    expect(supplierPrice({ ...product, raw: { currency_code: 'EUR' } })).toContain('€')
  })
  it('distinguishes model variants and with/without frame from the supplier title', () => {
    expect(supplierFacts(product)).toMatchObject({ model: 'iPhone 15 Pro Max', quality: 'XO7 Soft', color: 'Black', frame: 'Sans cadre', part: 'screen' })
    expect(supplierFacts({ ...product, name: 'Battery For iPhone 15 Pro (AmpSentrix Plus)' })).toMatchObject({ model: 'iPhone 15 Pro', part: 'battery', color: null, frame: null })
  })
  it('reports partial last pages and unknown totals honestly', () => {
    expect(supplierPageRange(3, 20, 3, 43)).toBe('41–43 sur 43')
    expect(supplierPageRange(2, 20, 20, null)).toContain('total non communiqué')
    expect(supplierPageRange(2, 20, 0, 20)).toBe('Aucun résultat sur cette page')
  })
})
