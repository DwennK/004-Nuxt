import { describe, expect, it } from 'vitest'
import { catalogCategoriesByType } from '../../shared/constants/pos'
import { catalogItemInputSchema } from '../../shared/validation/pos'
import { normalizeCatalogCategory } from '../../shared/utils/catalog'
import type { CatalogItemType } from '../../shared/types/pos'

const input = { name: 'Article test', type: 'product', category: 'Accessoires', defaultPrice: 1000, vatRate: 8.1, serviceKind: 'Prestation' }

describe('fixed catalog categories', () => {
  it('accepts only the categories belonging to the selected type', () => {
    for (const type of Object.keys(catalogCategoriesByType) as CatalogItemType[]) {
      for (const category of catalogCategoriesByType[type]) {
        expect(catalogItemInputSchema.safeParse({ ...input, type, category }).success).toBe(true)
      }
      for (const category of ['', 'Libre', 'Audio', 'Charge', 'Protection']) {
        const result = catalogItemInputSchema.safeParse({ ...input, type, category })
        expect(result.success).toBe(false)
        if (!result.success) expect(result.error.issues.some(issue => issue.path[0] === 'category')).toBe(true)
      }
    }
    expect(catalogItemInputSchema.safeParse({ ...input, type: 'repair' }).success).toBe(false)
    expect(catalogItemInputSchema.safeParse({ ...input, category: 'Diagnostic' }).success).toBe(false)
    expect(catalogItemInputSchema.safeParse({ ...input, type: 'service', category: 'iPhone' }).success).toBe(false)
  })

  it('merges only the three former product categories into Accessories', () => {
    for (const category of ['Audio', 'Charge', 'Protection']) {
      expect(normalizeCatalogCategory('product', ` ${category} `)).toBe('Accessoires')
      expect(normalizeCatalogCategory('repair', category)).toBe(category)
    }
    expect(normalizeCatalogCategory('product', 'Smartphones')).toBe('Smartphones')
    expect(normalizeCatalogCategory('product', 'Personnalisé')).toBe('Personnalisé')
  })
})
