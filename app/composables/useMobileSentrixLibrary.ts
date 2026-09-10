import { z } from 'zod'
import type { MobileSentrixProductSummary } from '~~/shared/types/pos'
import { supplierProductKey } from '~~/shared/utils/mobilesentrix-browser'

const supplierUrl = z.string().url().regex(/^https:\/\/(?:www\.|static\.)?mobilesentrix\.(?:com|eu)\//).nullable()
const productSchema = z.object({
  id: z.string(), sku: z.string().nullable(), newSku: z.string().nullable(), name: z.string().max(1000),
  price: z.number().nullable(), listPrice: z.number().nullable(), inStock: z.boolean().nullable(), quantity: z.number().nullable(),
  categoryIds: z.array(z.string()), manufacturer: z.string().nullable(), model: z.string().nullable(), frontPosition: z.string().nullable(),
  imageUrl: supplierUrl, url: supplierUrl, tags: z.array(z.string()), raw: z.object({ currency_code: z.string().optional(), currency: z.string().optional() })
})
const librarySchema = z.object({ favorites: z.array(productSchema).max(100), recent: z.array(z.string().max(500)).max(8) })

export function useMobileSentrixLibrary() {
  const { user } = useUserSession()
  const favorites = ref<MobileSentrixProductSummary[]>([])
  const recent = ref<string[]>([])
  const storageWarning = ref('')
  const storageKey = computed(() => `microwest:mobilesentrix:v1:${user.value?.id || 'local'}`)
  const favoriteKeys = computed(() => favorites.value.map(supplierProductKey))
  function restore() {
    try {
      const text = localStorage.getItem(storageKey.value)
      if (!text) return
      const saved = librarySchema.parse(JSON.parse(text))
      favorites.value = saved.favorites
      recent.value = saved.recent
    } catch { storageWarning.value = 'La bibliothèque locale est indisponible ou illisible. Vous pouvez continuer sans sauvegarde.' }
  }
  function persist() {
    try {
      // Store small display snapshots, never the complete supplier payload.
      const saved = librarySchema.parse({ favorites: favorites.value, recent: recent.value })
      localStorage.setItem(storageKey.value, JSON.stringify(saved))
    } catch { storageWarning.value = 'Sauvegarde locale impossible. Les favoris restent disponibles pendant cette visite.' }
  }
  function toggleFavorite(product: MobileSentrixProductSummary) {
    const key = supplierProductKey(product)
    if (favoriteKeys.value.includes(key)) favorites.value = favorites.value.filter(item => supplierProductKey(item) !== key)
    else if (favorites.value.length < 100) favorites.value = [...favorites.value, product]
    else {
      storageWarning.value = 'La limite de 100 favoris est atteinte.'
      return
    }
    persist()
  }
  function remember(query: string) {
    recent.value = [query, ...recent.value.filter(item => item !== query)].slice(0, 8)
    persist()
  }
  function clearRecent() {
    recent.value = []
    persist()
  }
  onMounted(restore)
  watch(storageKey, () => {
    favorites.value = []
    recent.value = []
    storageWarning.value = ''
    restore()
  })
  return { favorites, favoriteKeys, recent, storageWarning, toggleFavorite, remember, clearRecent }
}
