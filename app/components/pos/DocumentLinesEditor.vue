<script setup lang="ts">
import type { CatalogItemRecord } from '~~/shared/types/pos'
import {
  commercialLineUnitPriceInputClass,
  commercialLineUnitPriceMin,
  type CommercialLinesDraftController
} from '~~/app/composables/useCommercialLinesDraft'
import { formatCurrency, getCatalogItemTypeLabel } from '~~/shared/utils/pos'

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
const resolvedMode = computed(() => props.mode || 'document')
const hasNegativeTotal = computed(() => totals.value.total < 0)
const {
  searchInput,
  focusSearch,
  search,
  highlightedItemIndex,
  remoteSearchPending,
  searchPanelItems,
  shouldShowSearchPanel,
  minSearchLength,
  searchCatalogItems,
  openSearchPanel,
  closeSearchPanel,
  scheduleSearchClose,
  cancelSearchClose,
  highlightNextResult,
  highlightPreviousResult,
  resetSearch
} = useCatalogItemSearch()

const searchPanelTitle = computed(() => {
  return 'Résultats'
})

const searchPlaceholder = computed(() => {
  return resolvedMode.value === 'ticket'
    ? 'Ajouter un article ou une prestation'
    : 'Ajouter un article'
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

async function createNewLine() {
  resetSearch()
  const line = props.editor.addEmptyLine()
  await nextTick()
  document.getElementById(`document-line-label-${line.id}`)?.focus()
}

function addCatalogItem(item: CatalogItemRecord) {
  props.editor.addCatalogItem(item)
  resetSearch()
  void focusSearch()
}

function addFirstMatch() {
  const item = searchPanelItems.value[highlightedItemIndex.value] || searchPanelItems.value[0]

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

async function handleBarcodeScan(value: string) {
  const remoteMatch = (await searchCatalogItems(value))[0] || null

  if (remoteMatch) {
    addCatalogItem(remoteMatch)
    return
  }

  search.value = value
  openSearchPanel()
}
</script>

<template>
  <div class="min-w-0 space-y-3">
    <div
      v-if="showSearchCard !== false"
      class="relative"
      @focusin="cancelSearchClose"
      @focusout="scheduleSearchClose"
      @pointerdown="openSearchPanel"
    >
      <div class="flex flex-wrap items-center gap-2">
        <UInput
          ref="searchInput"
          v-model="search"
          icon="i-lucide-search"
          size="md"
          class="w-full sm:w-auto sm:min-w-0 sm:flex-1"
          :placeholder="searchPlaceholder"
          :autofocus="resolvedMode === 'document'"
          @keydown="handleSearchKeydown"
        />
        <PosBarcodeScanner
          title="Scanner un code-barres"
          description="Scannez un article ou une prestation pour l'ajouter rapidement."
          trigger-size="md"
          trigger-aria-label="Scanner un code-barres"
          @scanned="handleBarcodeScan"
        />
        <UButton
          icon="i-lucide-plus"
          label="Nouvelle ligne"
          color="neutral"
          variant="soft"
          size="md"
          @pointerdown.stop
          @click.stop="createNewLine"
        />
        <slot name="header-actions" />
      </div>

      <div
        v-if="shouldShowSearchPanel"
        class="absolute inset-x-0 top-full z-20 mt-1 rounded-md border border-default bg-default p-1 shadow-lg"
      >
        <div class="flex items-center justify-between gap-3 px-2 pb-2">
          <p class="text-sm font-medium text-highlighted">
            {{ searchPanelTitle }}
          </p>
          <span class="text-xs text-toned">
            {{ searchPanelItems.length }} article(s)
          </span>
        </div>

        <div v-if="search.trim().length < minSearchLength" class="px-3 py-4 text-sm text-toned">
          Tapez au moins {{ minSearchLength }} caractères.
        </div>

        <div v-else-if="searchPanelItems.length" class="max-h-[18rem] space-y-1 overflow-y-auto pr-1">
          <button
            v-for="(item, index) in searchPanelItems"
            :key="item.id"
            type="button"
            class="flex w-full items-center justify-between gap-3 rounded px-3 py-2 text-left transition"
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

        <div v-else-if="remoteSearchPending" class="px-3 py-4 text-sm text-toned">
          Recherche dans le catalogue...
        </div>

        <div v-else class="px-3 py-4 text-sm text-toned">
          Aucun article trouvé pour cette recherche.
        </div>
      </div>
    </div>

    <UEmpty
      v-if="!state.lines.length"
      icon="i-lucide-list"
      :title="emptyTitle"
      :description="emptyDescription"
      class="rounded-md border border-default bg-default py-8"
    />

    <div v-else class="office-table overflow-hidden shadow-none">
      <div class="max-h-[max(12rem,calc(100dvh-33rem))] overflow-auto">
        <div class="min-w-[58rem]">
          <div class="grid grid-cols-[minmax(14rem,1fr)_4.25rem_3.5rem_10rem_4rem_8.5rem_7rem] sticky top-0 z-10 items-center gap-3 border-b border-default bg-elevated px-3 py-2 text-xs font-medium text-highlighted">
            <span>Libellé</span>
            <span class="text-right">PU TTC</span>
            <span class="text-center">Qté</span>
            <span>Catégorie</span>
            <span class="text-center">TVA</span>
            <span class="text-right">Total</span>
            <span class="text-center">Actions</span>
          </div>

          <div class="divide-y divide-default">
            <div
              v-for="(line, index) in state.lines"
              :key="line.id"
              class="grid grid-cols-[minmax(14rem,1fr)_4.25rem_3.5rem_10rem_4rem_8.5rem_7rem] items-start gap-3 bg-default px-3 py-2"
            >
              <div class="min-w-0">
                <UFormField :name="`lines.${index}.label`" class="min-w-0">
                  <UTextarea
                    :id="`document-line-label-${line.id}`"
                    :model-value="line.label"
                    :rows="1"
                    autoresize
                    size="sm"
                    class="w-full"
                    placeholder="Libellé de la ligne"
                    :ui="{ base: 'min-h-7 resize-none field-sizing-content' }"
                    @update:model-value="editor.updateLineLabel(index, String($event || ''))"
                  />
                </UFormField>
                <p
                  v-if="line.catalogItemId && (catalogItemById.get(line.catalogItemId)?.sku || catalogItemById.get(line.catalogItemId)?.name)"
                  class="mt-1 truncate text-xs text-toned"
                >
                  {{ catalogItemById.get(line.catalogItemId)?.sku || catalogItemById.get(line.catalogItemId)?.name }}
                </p>
              </div>

              <UFormField :name="`lines.${index}.unitPriceCents`" class="justify-self-end">
                <UInputNumber
                  :id="`document-line-price-${line.id}`"
                  :model-value="line.unitPriceCents / 100"
                  :min="commercialLineUnitPriceMin"
                  :step="0.05"
                  :increment="false"
                  :decrement="false"
                  size="sm"
                  variant="subtle"
                  :format-options="{ minimumFractionDigits: 2, maximumFractionDigits: 2 }"
                  :class="commercialLineUnitPriceInputClass"
                  @update:model-value="editor.updateLineUnitPrice(index, $event)"
                  @focus="editor.selectAllOnFocus"
                />
              </UFormField>

              <div class="flex justify-center">
                <UFormField :name="`lines.${index}.quantity`">
                  <UInputNumber
                    v-model="line.quantity"
                    :min="1"
                    :step="1"
                    size="sm"
                    variant="subtle"
                    :increment="false"
                    :decrement="false"
                    class="w-14"
                  />
                </UFormField>
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

              <div class="pt-1 text-center text-sm text-toned tabular-nums">
                {{ line.vatRate }}%
              </div>

              <div class="pt-1 text-right tabular-nums">
                <p class="text-sm font-semibold text-highlighted">
                  {{ formatCurrency(line.quantity * line.unitPriceCents) }}
                </p>
              </div>

              <div class="flex items-center justify-center gap-1 pt-0.5">
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

    <UAlert
      v-if="hasNegativeTotal"
      color="error"
      variant="soft"
      icon="i-lucide-triangle-alert"
      title="Total négatif"
      description="Les lignes négatives sont autorisées, mais le total final du document doit rester positif ou nul."
      class="mt-3"
    />

    <div class="flex flex-col gap-2 border-t border-default pt-3 sm:flex-row sm:items-center sm:justify-between">
      <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-toned tabular-nums">
        <span>{{ state.lines.length }} ligne(s)</span>
        <span>Sous-total HT {{ formatCurrency(totals.subtotal) }}</span>
        <span>TVA {{ formatCurrency(totals.taxAmount) }}</span>
      </div>
      <div class="flex items-baseline justify-end gap-3 tabular-nums">
        <p class="text-sm text-toned">
          Total TTC
        </p>
        <p class="text-xl font-semibold text-highlighted">
          {{ formatCurrency(totals.total) }}
        </p>
      </div>
    </div>
  </div>
</template>
