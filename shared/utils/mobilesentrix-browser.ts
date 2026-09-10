import type { MobileSentrixProductSummary } from '../types/pos'

export const partOptions = [
  { label: 'Toutes les pièces', value: 'all' },
  { label: 'Écran', value: 'screen' },
  { label: 'Batterie', value: 'battery' },
  { label: 'Dos / châssis', value: 'housing' },
  { label: 'Connecteur de charge', value: 'charging port' },
  { label: 'Caméra', value: 'camera' },
  { label: 'Haut-parleur', value: 'speaker' }
]
export const qualityOptions = ['Toutes les qualités', 'XO7 Soft', 'AmpSentrix Plus', 'AmpSentrix Pro', 'Service Pack', 'Premium', 'Aftermarket Plus', 'Refurbished', 'Used OEM Pull Grade A']
export const colorOptions = [
  { label: 'Toutes les couleurs', value: 'all' },
  { label: 'Noir', value: 'black' }, { label: 'Blanc', value: 'white' },
  { label: 'Bleu', value: 'blue' }, { label: 'Vert', value: 'green' },
  { label: 'Rose', value: 'pink' }, { label: 'Violet', value: 'purple' },
  { label: 'Or', value: 'gold' }, { label: 'Argent', value: 'silver' },
  { label: 'Gris', value: 'gray' }
]
export interface SupplierSearch {
  text: string
  model: string
  part: string
  quality: string
  color: string
}
export function supplierQuery(search: SupplierSearch) {
  return [search.text.trim(), search.model.trim(), search.part === 'all' ? '' : search.part,
    search.quality === qualityOptions[0] ? '' : search.quality, search.color === 'all' ? '' : search.color]
    .filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
}
export function supplierProductKey(product: MobileSentrixProductSummary) {
  return `${product.url ? new URL(product.url).hostname : ''}:${product.sku || product.newSku || product.id || product.name}`
}
export function supplierStock(product: MobileSentrixProductSummary) {
  return product.inStock === null ? 'Non communiqué' : product.inStock ? 'En stock' : 'Rupture'
}
export function supplierPrice(product: MobileSentrixProductSummary) {
  if (product.price === null) return 'Non communiqué'
  const currency = String(product.raw?.currency_code || product.raw?.currency || '')
  // The existing integration is US-based. Do not label an EU price as USD.
  const code = /^[A-Z]{3}$/.test(currency) ? currency : product.url?.includes('mobilesentrix.com/') ? 'USD' : null
  return code ? new Intl.NumberFormat('fr-CH', { style: 'currency', currency: code }).format(product.price) : `${product.price.toLocaleString('fr-CH')} (devise non fournie)`
}
export function supplierFacts(product: MobileSentrixProductSummary) {
  const rawText = (...keys: string[]) => {
    for (const key of keys) {
      const value = product.raw?.[key]
      if (typeof value === 'string' && value.trim()) return value.trim()
    }
    return null
  }
  const title = product.name
  const model = product.model || rawText('device_model_text') || title.match(/iPhone\s+(?:SE\s*\(\d{4}\)|\d+(?:\s*\/\s*\d+)?)(?:\s+(?:Pro Max|Pro|Plus|Mini|Ultra))?/i)?.[0]
    || title.match(/(?:Galaxy\s+)?[SANZ]\d+[\w +]*(?=\s*\()/i)?.[0]?.trim() || null
  const quality = rawText('quality_text', 'quality') || title.match(/XO7[^)]*|AmpSentrix[^)]*|Service Pack|Used OEM Pull[^)]*|Aftermarket[^)]*|Premium|Refurbished|Grade [ABC][+]?/i)?.[0] || null
  const color = rawText('color_text', 'color') || title.match(/Space Gray|Midnight|Starlight|Black|White|Blue|Green|Pink|Purple|Silver|Gold|Gray|Natural Titanium/i)?.[0] || null
  const part = /battery/i.test(title) ? 'battery' : /screen|display|lcd|oled/i.test(title) ? 'screen' : /housing|back cover/i.test(title) ? 'housing' : /charging port|charge port/i.test(title) ? 'charging port' : /camera/i.test(title) ? 'camera' : null
  return { model, quality, color, part, frame: /without frame|no frame/i.test(title) ? 'Sans cadre' : /with frame/i.test(title) ? 'Avec cadre' : null }
}
export function supplierPageRange(page: number, size: number, count: number, total: number | null) {
  if (!count) return 'Aucun résultat sur cette page'
  const start = (page - 1) * size + 1
  return `${start}–${start + count - 1}${total === null ? ' · total non communiqué' : ` sur ${total}`}`
}
