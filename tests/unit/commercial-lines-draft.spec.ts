import { effectScope, ref } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import { useCommercialLinesDraft } from '../../app/composables/useCommercialLinesDraft'
import type { CatalogItemRecord } from '../../shared/types/pos'

const item: CatalogItemRecord = {
  id: 1, name: 'Réparation', sku: null, type: 'repair', category: 'Atelier',
  brand: null, model: null, serviceKind: 'Réparation', keywords: [],
  defaultPrice: 10810, vatRate: 8.1, isActive: true,
  createdAt: '2026-09-02', updatedAt: '2026-09-02'
}

const scopes: ReturnType<typeof effectScope>[] = []
function editor(allowEmpty = false) {
  const scope = effectScope()
  scopes.push(scope)
  return scope.run(() => useCommercialLinesDraft({
    initialLines: ref(undefined), catalogItems: ref([item]),
    allowEmpty, reuseEmptyLine: !allowEmpty
  }))!
}

afterEach(() => scopes.splice(0).forEach(scope => scope.stop()))

describe('shared commercial line drafts', () => {
  it('keeps integer cents through input, totals and serialization for sales and documents', () => {
    for (const allowEmpty of [false, true]) {
      const draft = editor(allowEmpty)
      draft.addCatalogItem(item)
      expect(draft.state.lines[0]?.unitPriceCents).toBe(10810)
      expect(draft.totals.value).toMatchObject({ subtotal: 10000, taxAmount: 810, total: 10810 })
      draft.addEmptyLine()
      draft.updateLineLabel(1, 'Rabais')
      draft.updateLineUnitPrice(1, -10.81)
      expect(draft.state.lines[1]?.unitPriceCents).toBe(-1081)
      expect(draft.serializeLines()[1]).toMatchObject({ unitPrice: -1081, quantity: 1, vatRate: 8.1 })
      expect(draft.totals.value).toMatchObject({ subtotal: 9000, taxAmount: 729, total: 9729 })
    }
  })

  it('preserves a required blank document line but allows an empty sale cart', () => {
    const document = editor()
    const sale = editor(true)
    expect(document.state.lines).toHaveLength(1)
    expect(sale.state.lines).toHaveLength(0)
    document.removeLine(0)
    expect(document.state.lines).toHaveLength(1)
    sale.addEmptyLine()
    sale.addCatalogItem(item)
    expect(sale.state.lines).toHaveLength(2)
    sale.removeLine(1)
    sale.removeLine(0)
    expect(sale.state.lines).toHaveLength(0)
  })

  it('merges only matching catalog price, label and VAT and detaches manual edits', () => {
    const draft = editor()
    draft.addCatalogItem(item)
    draft.addCatalogItem(item)
    expect(draft.state.lines).toHaveLength(1)
    expect(draft.state.lines[0]?.quantity).toBe(2)
    draft.addCatalogItem({ ...item, defaultPrice: 12000 })
    expect(draft.state.lines).toHaveLength(2)
    draft.updateLineUnitPrice(0, 12.35)
    expect(draft.state.lines[0]).toMatchObject({ catalogItemId: null, unitPriceCents: 1235 })
    draft.updateLineLabel(1, 'Intervention personnalisée')
    expect(draft.state.lines[1]?.catalogItemId).toBeNull()
  })

  it('shares clone, reorder and positive-quantity operations without leaking UI identifiers', () => {
    const draft = editor(true)
    draft.addCatalogItem(item)
    draft.decrementLine(0)
    expect(draft.state.lines[0]?.quantity).toBe(1)
    draft.incrementLine(0)
    draft.cloneLine(0)
    expect(draft.state.lines[0]?.id).not.toBe(draft.state.lines[1]?.id)
    draft.updateLineLabel(1, 'Copie')
    draft.moveLine(1, 'up')
    expect(draft.state.lines[0]?.label).toBe('Copie')
    expect(draft.serializeLines()[0]).toMatchObject({ quantity: 2, unitPrice: 10810 })
    expect(draft.serializeLines()[0]).not.toHaveProperty('unitPriceCents')
    expect(draft.serializeLines()[0]).not.toHaveProperty('id')
    draft.resetLines([])
    expect(draft.state.lines).toHaveLength(0)
    expect(draft.totals.value.total).toBe(0)
  })

  it('hydrates API cents once without multiplying or dividing them again', () => {
    const draft = editor()
    draft.resetLines([{ catalogItemId: null, label: 'Prix précis', quantity: 3, unitPrice: 1235, vatRate: 8.1, categoryHint: null }])
    expect(draft.state.lines[0]?.unitPriceCents).toBe(1235)
    expect(draft.serializeLines()[0]?.unitPrice).toBe(1235)
    expect(draft.totals.value.total).toBe(3705)
    draft.updateLineCatalogItem(0, item.id)
    expect(draft.state.lines[0]?.unitPriceCents).toBe(10810)
  })
})
