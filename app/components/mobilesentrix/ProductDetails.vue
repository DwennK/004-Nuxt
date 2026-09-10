<script setup lang="ts">
import type { MobileSentrixProductSummary, MobileSentrixProductsResponse, MobileSentrixSearchResponse } from '~~/shared/types/pos'
import { supplierFacts, supplierPrice, supplierProductKey, supplierStock } from '~~/shared/utils/mobilesentrix-browser'

const props = defineProps<{ product: MobileSentrixProductSummary | null, canUseApi: boolean }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ compare: [product: MobileSentrixProductSummary], favorite: [product: MobileSentrixProductSummary] }>()
const focusReturn = usePosFocusReturn(open)
const current = ref<MobileSentrixProductSummary | null>(null)
const pending = ref(false)
const error = ref('')
const verifiedAt = ref('')
const variants = ref<MobileSentrixProductSummary[]>([])
const variantsPending = ref(false)
const variantsError = ref('')
const variantsTotal = ref<number | null>(null)
const variantsPage = ref(1)
const variantQuery = ref('')
const toast = useToast()
let request = 0
let variantRequest = 0
const facts = computed(() => current.value ? supplierFacts(current.value) : null)

watch(() => props.product, (product) => {
  request++
  variantRequest++
  current.value = product
  pending.value = false
  error.value = ''
  verifiedAt.value = ''
  variants.value = []
  variantsTotal.value = null
  variantsPending.value = false
  variantsError.value = ''
  const info = product ? supplierFacts(product) : null
  variantQuery.value = [info?.model, info?.part].filter(Boolean).join(' ')
})
watch(open, (value) => {
  if (!value) {
    request++
    variantRequest++
    pending.value = false
    variantsPending.value = false
  }
})

async function refreshProduct() {
  if (!current.value || !props.canUseApi) return
  const key = supplierProductKey(current.value)
  const token = ++request
  pending.value = true
  error.value = ''
  try {
    const result = await $fetch<MobileSentrixProductsResponse>('/api/tools/mobilesentrix/products', { query: {
      productId: current.value.id || undefined,
      sku: current.value.id ? undefined : current.value.sku || current.value.newSku || undefined
    } })
    if (token !== request) return
    const match = result.items.find(item => supplierProductKey(item) === key || (item.id && item.id === current.value?.id))
    if (!match) throw new Error('La référence exacte n’a pas été retrouvée.')
    current.value = match
    verifiedAt.value = new Date().toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' })
  } catch {
    if (token === request) error.value = 'Actualisation impossible. Les informations précédentes restent affichées.'
  } finally {
    if (token === request) pending.value = false
  }
}
async function loadVariants(page = 1) {
  if (variantQuery.value.trim().length < 2) return
  const token = ++variantRequest
  variantsPending.value = true
  variantsError.value = ''
  try {
    const result = await $fetch<MobileSentrixSearchResponse>('/api/tools/mobilesentrix/search', { query: { q: variantQuery.value.trim(), startIndex: (page - 1) * 20, maxResults: 20 } })
    if (token !== variantRequest) return
    variants.value = result.items.filter(item => !current.value || supplierProductKey(item) !== supplierProductKey(current.value))
    variantsTotal.value = result.totalItems
    variantsPage.value = page
  } catch {
    if (token === variantRequest) variantsError.value = 'Recherche des variantes impossible. Réessayez.'
  } finally {
    if (token === variantRequest) variantsPending.value = false
  }
}
async function copySku() {
  const sku = current.value?.sku || current.value?.newSku
  if (!sku) return
  try {
    await navigator.clipboard.writeText(sku)
    toast.add({ title: 'SKU copié', color: 'success' })
  } catch {
    toast.add({ title: 'Copie impossible', description: 'Sélectionnez le SKU pour le copier.', color: 'warning' })
  }
}
</script>

<template>
  <USlideover
    v-model:open="open"
    title="Fiche fournisseur"
    description="Informations de la boutique source. Compatibilité à vérifier avant commande."
    :content="focusReturn"
    :ui="{ content: 'w-full sm:max-w-xl', body: 'space-y-5' }"
  >
    <template #body>
      <template v-if="current">
        <img
          v-if="current.imageUrl"
          :src="current.imageUrl"
          :alt="current.name"
          class="mx-auto h-52 max-w-full object-contain"
        >
        <h2 class="text-lg font-semibold text-highlighted">
          {{ current.name }}
        </h2>
        <div class="flex flex-wrap items-center gap-2">
          <code class="select-all text-sm">{{ current.sku || current.newSku || 'SKU non communiqué' }}</code>
          <UButton
            icon="i-lucide-copy"
            aria-label="Copier le SKU"
            variant="ghost"
            color="neutral"
            :disabled="!current.sku && !current.newSku"
            @click="copySku"
          />
          <UButton
            icon="i-lucide-refresh-cw"
            label="Actualiser la fiche"
            size="sm"
            variant="outline"
            :loading="pending"
            :disabled="!canUseApi || (!current.id && !current.sku && !current.newSku)"
            @click="refreshProduct"
          />
        </div>
        <UAlert
          v-if="error"
          :description="error"
          color="warning"
          variant="subtle"
        />
        <p class="text-xs text-muted">
          {{ verifiedAt ? `Fiche relue à ${verifiedAt}` : 'Valeurs de la dernière consultation. Actualisez pour revérifier.' }}
        </p>
        <dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-3 text-sm">
          <dt class="text-muted">
            Prix fournisseur
          </dt><dd class="font-semibold">
            {{ supplierPrice(current) }}
          </dd>
          <dt class="text-muted">
            Disponibilité
          </dt><dd>{{ supplierStock(current) }}</dd>
          <dt class="text-muted">
            Modèle
          </dt><dd>{{ facts?.model || 'Non communiqué' }}</dd>
          <dt class="text-muted">
            Gamme / qualité
          </dt><dd>{{ facts?.quality || 'Non communiquée' }}</dd>
          <dt class="text-muted">
            Couleur
          </dt><dd>{{ facts?.color || 'Non communiquée' }}</dd>
          <dt class="text-muted">
            Cadre
          </dt><dd>{{ facts?.frame || 'Non précisé' }}</dd>
        </dl>
        <p class="text-xs text-muted">
          Les caractéristiques peuvent être extraites du titre fournisseur. Le stock concerne la boutique liée ; aucune disponibilité Europe n’est déduite.
        </p>
        <div class="border-t border-default pt-4">
          <h3 class="mb-2 font-semibold">
            Variantes et pièces proches
          </h3>
          <form class="flex gap-2" @submit.prevent="loadVariants()">
            <UInput
              v-model="variantQuery"
              aria-label="Recherche de variantes"
              placeholder="Modèle et type de pièce"
              class="min-w-0 flex-1"
            />
            <UButton
              type="submit"
              icon="i-lucide-search"
              label="Chercher"
              :disabled="!canUseApi || variantQuery.trim().length < 2"
              :loading="variantsPending"
            />
          </form>
          <p class="my-2 text-xs text-muted">
            Suggestions fournisseur, compatibilité non garantie.
          </p>
          <p v-if="variantsError" role="alert" class="text-sm text-error">
            {{ variantsError }}
          </p>
          <p v-else-if="variantsTotal !== null && !variants.length" class="py-3 text-sm text-muted">
            Aucune autre pièce sur cette page.
          </p>
          <div v-for="variant in variants" :key="supplierProductKey(variant)" class="flex items-center gap-2 border-b border-default py-3">
            <div class="min-w-0 flex-1">
              <p class="text-sm">
                {{ variant.name }}
              </p><p class="text-xs text-muted">
                {{ variant.sku }} · {{ supplierPrice(variant) }} · {{ supplierStock(variant) }}
              </p>
            </div>
            <UButton
              icon="i-lucide-columns-3"
              :aria-label="`Comparer la variante ${variant.sku}`"
              color="neutral"
              variant="outline"
              @click="emit('compare', variant)"
            />
            <UButton
              v-if="variant.url"
              :to="variant.url"
              target="_blank"
              rel="noopener noreferrer"
              icon="i-lucide-external-link"
              :aria-label="`Ouvrir la variante ${variant.sku}`"
              color="neutral"
              variant="ghost"
            />
          </div>
          <div v-if="variantsTotal !== null" class="mt-3 flex items-center justify-between gap-2 text-sm">
            <UButton
              label="Précédentes"
              variant="outline"
              :disabled="variantsPage <= 1 || variantsPending"
              @click="loadVariants(variantsPage - 1)"
            />
            <span>Page {{ variantsPage }}</span>
            <UButton
              label="Suivantes"
              variant="outline"
              :disabled="variantsPage * 20 >= variantsTotal || variantsPending"
              @click="loadVariants(variantsPage + 1)"
            />
          </div>
        </div>
      </template>
    </template>
    <template #footer>
      <div v-if="current" class="flex w-full flex-wrap gap-2">
        <UButton
          v-if="current.url"
          :to="current.url"
          target="_blank"
          rel="noopener noreferrer"
          icon="i-lucide-external-link"
          label="Voir chez le fournisseur"
        />
        <UButton
          icon="i-lucide-columns-3"
          label="Comparer"
          variant="outline"
          @click="emit('compare', current)"
        />
        <UButton
          icon="i-lucide-star"
          label="Favori"
          color="neutral"
          variant="outline"
          @click="emit('favorite', current)"
        />
      </div>
    </template>
  </USlideover>
</template>
