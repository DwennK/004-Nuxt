<script setup lang="ts">
import type { CatalogItemRecord } from '~~/shared/types/pos'
import type { CommercialLinesDraftController } from '~~/app/composables/useCommercialLinesDraft'
import { formatCurrency, getCatalogItemTypeLabel, normalizeSearchText } from '~~/shared/utils/pos'

const props = withDefaults(defineProps<{
  editor: CommercialLinesDraftController
  catalogItems: CatalogItemRecord[]
  mode?: 'document' | 'ticket'
  showSearchCard?: boolean
}>(), {
  showSearchCard: true
})

const state = props.editor.state
const totals = props.editor.totals
const categoryItems = props.editor.categoryItems
const search = ref('')
const searchOpen = ref(false)
const highlightedItemIndex = ref(0)
let searchCloseTimeout: ReturnType<typeof setTimeout> | null = null

const activeItems = computed(() => props.catalogItems.filter(item => item.isActive))
const resolvedMode = computed(() => props.mode || 'document')

const quickPickItems = computed(() => {
  return activeItems.value.slice(0, 8)
})

const filteredItems = computed(() => {
  const term = normalizeSearchText(search.value)

  if (!term) {
    return quickPickItems.value
  }

  return activeItems.value.filter((item) => {
    return [
      item.name,
      item.sku,
      item.type,
      item.category,
      item.brand,
      item.model,
      item.serviceKind,
      item.keywords.join(' ')
    ].some(value => normalizeSearchText(value).includes(term))
  }).slice(0, 10)
})

const searchPanelItems = computed(() => {
  return search.value.trim() ? filteredItems.value : quickPickItems.value
})

const searchPanelTitle = computed(() => {
  return search.value.trim() ? 'Résultats' : 'Suggestions'
})

const searchHintLabel = computed(() => {
  return resolvedMode.value === 'ticket' ? 'Entrée ajoute la première correspondance' : 'Entrée ajoute le premier résultat'
})

const searchPlaceholder = computed(() => {
  return resolvedMode.value === 'ticket'
    ? 'batterie iphone 13, diagnostic, coque...'
    : 'cable, coque, chargeur, verre...'
})

const searchScannerTitle = computed(() => {
  return resolvedMode.value === 'ticket' ? 'Scanner un article ou une prestation' : 'Scanner un article'
})

const searchScannerDescription = computed(() => {
  return resolvedMode.value === 'ticket'
    ? 'Scannez un code-barres ou QR code pour ajouter rapidement une ligne prévue au ticket.'
    : 'Scannez le code-barres ou QR code d\'un article pour l\'ajouter au document.'
})

const cardTitle = computed(() => {
  return resolvedMode.value === 'ticket' ? 'Lignes prévues' : 'Lignes du document'
})

const cardDescription = computed(() => {
  return resolvedMode.value === 'ticket'
    ? 'Préparez ce qui devra être facturé plus tard sans ressaisir lors du document.'
    : 'Gardez les lignes au centre et ajustez le contexte seulement si nécessaire.'
})

const emptyTitle = computed(() => {
  return resolvedMode.value === 'ticket' ? 'Aucune ligne prévue' : 'Aucune ligne'
})

const emptyDescription = computed(() => {
  return resolvedMode.value === 'ticket'
    ? 'Ajoutez une réparation, un service, un article ou créez une ligne libre.'
    : 'Ajoutez un article ou créez une ligne libre.'
})

const catalogItemById = computed(() => new Map(props.catalogItems.map(item => [item.id, item])))

watch(searchPanelItems, (items) => {
  if (!items.length) {
    highlightedItemIndex.value = 0
    return
  }

  if (highlightedItemIndex.value >= items.length) {
    highlightedItemIndex.value = 0
  }
})

watch(search, (value) => {
  highlightedItemIndex.value = 0

  if (value.trim()) {
    openSearchPanel()
    return
  }

  cancelSearchClose()
})

function openSearchPanel() {
  cancelSearchClose()
  searchOpen.value = true
}

function closeSearchPanel() {
  cancelSearchClose()
  searchOpen.value = false
  highlightedItemIndex.value = 0
}

function createNewLine() {
  closeSearchPanel()
  search.value = ''
  props.editor.addEmptyLine()
}

function scheduleSearchClose() {
  cancelSearchClose()
  searchCloseTimeout = setTimeout(() => {
    searchOpen.value = false
    highlightedItemIndex.value = 0
  }, 120)
}

function cancelSearchClose() {
  if (searchCloseTimeout) {
    clearTimeout(searchCloseTimeout)
    searchCloseTimeout = null
  }
}

function highlightNextResult() {
  if (!searchPanelItems.value.length) {
    return
  }

  highlightedItemIndex.value = (highlightedItemIndex.value + 1) % searchPanelItems.value.length
}

function highlightPreviousResult() {
  if (!searchPanelItems.value.length) {
    return
  }

  highlightedItemIndex.value = highlightedItemIndex.value <= 0
    ? searchPanelItems.value.length - 1
    : highlightedItemIndex.value - 1
}

function addCatalogItem(item: CatalogItemRecord) {
  props.editor.addCatalogItem(item)
  closeSearchPanel()
  search.value = ''
}

function addFirstMatch() {
  const item = searchPanelItems.value[highlightedItemIndex.value] || filteredItems.value[0]

  if (!item || !search.value.trim()) {
    return
  }

  addCatalogItem(item)
}

function handleSearchKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    openSearchPanel()
    highlightNextResult()
    return
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault()
    openSearchPanel()
    highlightPreviousResult()
    return
  }

  if (event.key === 'Escape') {
    event.preventDefault()
    closeSearchPanel()
    return
  }

  if (event.key === 'Enter') {
    event.preventDefault()
    addFirstMatch()
  }
}

function handleBarcodeScan(value: string) {
  const normalizedValue = normalizeSearchText(value)
  const match = activeItems.value.find((item) => {
    return normalizeSearchText(item.sku) === normalizedValue
      || normalizeSearchText(item.name) === normalizedValue
  })

  if (!match) {
    search.value = value
    openSearchPanel()
    return
  }

  addCatalogItem(match)
}
</script>

<template>
  <div class="space-y-4">
    <UCard
      variant="subtle"
      :ui="{
        root: 'overflow-visible rounded-[2rem] shadow-sm',
        body: 'space-y-0 p-0',
        header: 'p-4 pb-0 sm:p-4 sm:pb-0',
        footer: 'border-t border-default/70 px-4 py-3 sm:px-4'
      }"
    >
      <template #header>
        <div class="flex flex-col gap-4">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="space-y-1">
              <div class="flex flex-wrap items-center gap-2">
                <h2 class="text-base font-semibold text-highlighted">
                  {{ cardTitle }}
                </h2>
                <UBadge color="neutral" variant="soft" size="sm">
                  {{ state.lines.length ? `${state.lines.length} ligne(s)` : 'Document vide' }}
                </UBadge>
              </div>
              <p class="text-sm text-toned">
                {{ cardDescription }}
              </p>
            </div>
            <div class="flex flex-wrap items-start justify-end gap-2">
              <div class="text-right">
                <p class="text-[11px] uppercase tracking-[0.14em] text-toned">
                  Total document
                </p>
                <p class="text-2xl font-semibold text-highlighted">
                  {{ formatCurrency(totals.total) }}
                </p>
              </div>
              <slot name="header-actions" />
            </div>
          </div>

          <div
            v-if="showSearchCard !== false"
            class="relative"
            @focusin="cancelSearchClose"
            @focusout="scheduleSearchClose"
            @pointerdown="openSearchPanel"
          >
            <div class="flex flex-col gap-2 lg:flex-row">
              <UInput
                v-model="search"
                icon="i-lucide-search"
                size="xl"
                class="flex-1"
                :placeholder="searchPlaceholder"
                :autofocus="resolvedMode === 'document'"
                @keydown="handleSearchKeydown"
              />
              <PosBarcodeScanner
                :title="searchScannerTitle"
                :description="searchScannerDescription"
                trigger-size="lg"
                trigger-aria-label="Scanner un code-barres"
                @scanned="handleBarcodeScan"
              />
              <UButton
                icon="i-lucide-plus"
                label="Nouvelle ligne"
                color="neutral"
                variant="soft"
                size="lg"
                @pointerdown.stop
                @click.stop="createNewLine"
              />
            </div>

            <div class="mt-2 flex flex-wrap items-center gap-2 text-xs text-toned">
              <span>{{ searchHintLabel }}</span>
              <span>·</span>
              <span>{{ formatCurrency(totals.total) }}</span>
            </div>

            <div
              v-if="searchOpen"
              class="absolute inset-x-0 top-full z-20 mt-2 rounded-2xl border border-default bg-default p-2 shadow-lg"
            >
              <div class="flex items-center justify-between gap-3 px-2 pb-2">
                <p class="text-sm font-medium text-highlighted">
                  {{ searchPanelTitle }}
                </p>
                <span class="text-xs text-toned">
                  {{ searchPanelItems.length }} article(s)
                </span>
              </div>

              <div v-if="searchPanelItems.length" class="max-h-[18rem] space-y-1 overflow-y-auto pr-1">
                <button
                  v-for="(item, index) in searchPanelItems"
                  :key="item.id"
                  type="button"
                  class="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left transition"
                  :class="index === highlightedItemIndex
                    ? 'bg-primary/8 ring-1 ring-primary/20'
                    : 'hover:bg-muted/60'"
                  @mouseenter="highlightedItemIndex = index"
                  @click="addCatalogItem(item)"
                >
                  <div class="min-w-0">
                    <p class="truncate text-sm font-medium text-highlighted">
                      {{ item.name }}
                    </p>
                    <p class="truncate text-xs text-toned">
                      {{ item.sku || getCatalogItemTypeLabel(item.type) }}
                    </p>
                  </div>
                  <span class="shrink-0 text-sm font-medium text-highlighted">
                    {{ formatCurrency(item.defaultPrice) }}
                  </span>
                </button>
              </div>

              <div v-else class="rounded-xl border border-dashed border-default px-4 py-5 text-sm text-toned">
                Aucun article trouvé pour cette recherche.
              </div>
            </div>
          </div>
        </div>
      </template>

      <UEmpty
        v-if="!state.lines.length"
        icon="i-lucide-list"
        :title="emptyTitle"
        :description="emptyDescription"
        class="py-8"
      />

      <div v-else class="pb-0 pt-4">
        <div class="overflow-x-auto">
          <div class="min-w-[54rem]">
            <div class="grid grid-cols-[minmax(0,1.9fr)_9rem_5.5rem_6rem_5rem_8rem_auto] gap-2 px-6 pb-2 text-[11px] uppercase tracking-[0.14em] text-toned">
              <span>Libellé</span>
              <span>Catégorie</span>
              <span>PU TTC</span>
              <span>Qté</span>
              <span class="text-center">TVA</span>
              <span class="text-right">Total</span>
              <span class="text-right">Actions</span>
            </div>

            <div class="max-h-[calc(100vh-23rem)] overflow-y-auto border-y border-default/70">
              <div
                v-for="(line, index) in state.lines"
                :key="line.id"
                class="grid grid-cols-[minmax(0,1.9fr)_9rem_5.5rem_6rem_5rem_8rem_auto] items-center gap-2 border-t border-default/70 bg-default px-6 py-3 first:border-t-0"
              >
                <div class="min-w-0">
                  <UFormField :name="`lines.${index}.label`" class="min-w-0">
                    <UInput
                      :id="`document-line-label-${line.id}`"
                      :model-value="line.label"
                      size="sm"
                      class="w-full"
                      placeholder="Libellé de la ligne"
                      @update:model-value="editor.updateLineLabel(index, String($event || ''))"
                    />
                  </UFormField>
                  <p class="mt-1 truncate text-xs text-toned">
                    {{ line.catalogItemId ? (catalogItemById.get(line.catalogItemId)?.sku || catalogItemById.get(line.catalogItemId)?.name || 'Catalogue lié') : 'Ligne libre' }}
                  </p>
                </div>

                <UFormField :name="`lines.${index}.categoryHint`">
                  <USelectMenu
                    v-model="line.categoryHint"
                    :items="categoryItems"
                    value-key="value"
                    placeholder="Catégorie"
                    clear
                    size="sm"
                    variant="subtle"
                    :search-input="false"
                    class="w-full"
                  />
                </UFormField>

                <UFormField :name="`lines.${index}.unitPrice`">
                  <UInputNumber
                    :id="`document-line-price-${line.id}`"
                    :model-value="line.unitPrice"
                    :min="0"
                    :step="0.05"
                    :increment="false"
                    :decrement="false"
                    size="sm"
                    variant="subtle"
                    :format-options="{ minimumFractionDigits: 2, maximumFractionDigits: 2 }"
                    class="w-full"
                    @update:model-value="editor.updateLineUnitPrice(index, $event)"
                    @focus="editor.selectAllOnFocus"
                  />
                </UFormField>

                <div>
                  <UFormField :name="`lines.${index}.quantity`">
                    <UInputNumber
                      v-model="line.quantity"
                      :min="1"
                      :step="1"
                      size="sm"
                      variant="subtle"
                      :increment="false"
                      :decrement="false"
                      class="w-16"
                    />
                  </UFormField>
                </div>

                <div class="text-center text-sm font-medium text-highlighted">
                  {{ line.vatRate }}%
                </div>

                <div class="text-right">
                  <p class="text-base font-semibold text-highlighted">
                    {{ formatCurrency(Math.round(line.quantity * line.unitPrice * 100)) }}
                  </p>
                </div>

                <div class="flex items-center justify-end gap-1">
                  <UButton
                    type="button"
                    icon="i-lucide-arrow-up"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    :disabled="index === 0"
                    :aria-label="`Monter ${line.label || `la ligne ${index + 1}`}`"
                    @click="editor.moveLine(index, 'up')"
                  />
                  <UButton
                    type="button"
                    icon="i-lucide-arrow-down"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    :disabled="index === state.lines.length - 1"
                    :aria-label="`Descendre ${line.label || `la ligne ${index + 1}`}`"
                    @click="editor.moveLine(index, 'down')"
                  />
                  <UButton
                    type="button"
                    icon="i-lucide-copy"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    :aria-label="`Cloner ${line.label || `la ligne ${index + 1}`}`"
                    @click="editor.cloneLine(index)"
                  />
                  <UButton
                    type="button"
                    icon="i-lucide-trash-2"
                    color="error"
                    variant="ghost"
                    size="xs"
                    :aria-label="`Supprimer ${line.label || `la ligne ${index + 1}`}`"
                    @click="editor.removeLine(index)"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-toned">
            <span>{{ state.lines.length }} ligne(s)</span>
            <span>Sous-total HT {{ formatCurrency(totals.subtotal) }}</span>
            <span>TVA {{ formatCurrency(totals.taxAmount) }}</span>
          </div>
          <div class="text-right">
            <p class="text-[11px] uppercase tracking-[0.14em] text-toned">
              Total TTC
            </p>
            <p class="text-xl font-semibold text-highlighted">
              {{ formatCurrency(totals.total) }}
            </p>
          </div>
        </div>
      </template>
    </UCard>
  </div>
</template>
