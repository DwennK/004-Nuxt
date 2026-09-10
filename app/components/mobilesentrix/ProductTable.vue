<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { MobileSentrixProductSummary } from '~~/shared/types/pos'
import { supplierPrice, supplierProductKey, supplierStock, supplierFacts } from '~~/shared/utils/mobilesentrix-browser'

const props = defineProps<{
  items: MobileSentrixProductSummary[]
  loading?: boolean
  favorites: string[]
  compared: string[]
  empty?: string
}>()
const emit = defineEmits<{
  open: [product: MobileSentrixProductSummary]
  favorite: [product: MobileSentrixProductSummary]
  compare: [product: MobileSentrixProductSummary]
}>()
const columns: TableColumn<MobileSentrixProductSummary>[] = [
  { accessorKey: 'name', header: 'Pièce / appareil', meta: { style: { th: { width: '52%' } } } },
  { accessorKey: 'price', header: 'Prix fournisseur', meta: { style: { th: { width: '18%' } } } },
  { accessorKey: 'inStock', header: 'Disponibilité', meta: { style: { th: { width: '18%' } } } },
  { id: 'actions', header: 'Actions', meta: { style: { th: { width: '12%' } } } }
]
function onTableKeydown(event: KeyboardEvent) {
  if (!(event.target instanceof HTMLElement) || !event.target.matches('tr[role="button"]')) return
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  event.target.click()
}
const table = useTemplateRef('table')
defineExpose({ scrollToTop: () => table.value?.$el?.scrollTo({ top: 0 }) })
</script>

<template>
  <UTable
    ref="table"
    :data="items"
    :columns="columns"
    :loading="loading"
    :empty="empty || 'Aucun résultat.'"
    sticky="header"
    class="min-h-0 min-w-0 flex-1"
    :ui="{ td: 'py-2', th: 'py-2', tr: 'cursor-pointer', base: 'table-fixed min-w-[680px] w-full' }"
    @select="(_event, row) => emit('open', row.original)"
    @keydown="onTableKeydown"
  >
    <template #name-cell="{ row }">
      <div class="flex min-w-0 items-center gap-3">
        <img
          v-if="row.original.imageUrl"
          :src="row.original.imageUrl"
          alt=""
          loading="lazy"
          class="size-10 shrink-0 rounded border border-default object-contain"
        >
        <UIcon v-else name="i-lucide-package" class="size-8 shrink-0 text-muted" />
        <div class="min-w-0">
          <p class="line-clamp-2 whitespace-normal text-sm font-medium text-highlighted" :title="row.original.name">
            {{ row.original.name }}
          </p>
          <p class="truncate text-xs text-muted">
            {{ row.original.sku || row.original.newSku || 'SKU non communiqué' }}<span v-if="supplierFacts(row.original).quality"> · {{ supplierFacts(row.original).quality }}</span>
          </p>
        </div>
      </div>
    </template>
    <template #price-cell="{ row }">
      <span class="whitespace-normal text-sm font-medium tabular-nums">{{ supplierPrice(row.original) }}</span>
    </template>
    <template #inStock-cell="{ row }">
      <UBadge :color="row.original.inStock === null ? 'neutral' : row.original.inStock ? 'success' : 'error'" variant="subtle" size="sm">
        {{ supplierStock(row.original) }}
      </UBadge>
    </template>
    <template #actions-cell="{ row }">
      <div class="flex items-center gap-1" @click.stop @keydown.stop>
        <UButton
          :icon="favorites.includes(supplierProductKey(row.original)) ? 'i-lucide-star-off' : 'i-lucide-star'"
          :aria-label="`${favorites.includes(supplierProductKey(row.original)) ? 'Retirer des favoris' : 'Ajouter aux favoris'} : ${row.original.name}`"
          :color="favorites.includes(supplierProductKey(row.original)) ? 'primary' : 'neutral'"
          variant="ghost"
          size="sm"
          @click="emit('favorite', row.original)"
        />
        <UButton
          icon="i-lucide-columns-3"
          :aria-label="`${compared.includes(supplierProductKey(row.original)) ? 'Retirer du comparateur' : 'Comparer'} : ${row.original.name}`"
          :color="compared.includes(supplierProductKey(row.original)) ? 'primary' : 'neutral'"
          :disabled="!compared.includes(supplierProductKey(row.original)) && props.compared.length >= 3"
          variant="ghost"
          size="sm"
          @click="emit('compare', row.original)"
        />
      </div>
    </template>
  </UTable>
</template>

<style scoped>
:deep(th), :deep(td) { vertical-align: middle; }
</style>
