import { catalogAccessoryLegacyCategories, catalogCategoriesByType } from '../constants/pos'
import type { CatalogItemType } from '../types/pos'

export function isCatalogCategory(type: CatalogItemType, category: string) {
  return (catalogCategoriesByType[type] as readonly string[]).includes(category)
}

export function normalizeCatalogCategory(type: CatalogItemType, category: string) {
  const value = category.trim()
  return type === 'product' && (catalogAccessoryLegacyCategories as readonly string[]).includes(value)
    ? 'Accessoires'
    : value
}
