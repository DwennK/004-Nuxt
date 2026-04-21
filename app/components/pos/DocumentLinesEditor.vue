<script setup lang="ts">
import type { CatalogItemRecord } from '~~/shared/types/pos'
import type { CommercialLinesDraftController } from '~~/app/composables/useCommercialLinesDraft'
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
const {
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

function createNewLine() {
  resetSearch()
  props.editor.addEmptyLine()
}

function addCatalogItem(item: CatalogItemRecord) {
  props.editor.addCatalogItem(item)
  resetSearch()
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
  <div class="space-y-4">
    <UCard
      variant="subtle"
      :ui="{
        root: 'overflow-visible rounded-[2rem] shadow-sm',
        body: 'space-y-0 p-0',
        header: 'p-4 sm:p-4',
        footer: 'border-t border-default/70 px-4 py-3 sm:px-4'
      }"
    >
      <template #header>
        <div
          v-if="showSearchCard !== false"
          class="relative"
          @focusin="cancelSearchClose"
          @focusout="scheduleSearchClose"
          @pointerdown="openSearchPanel"
        >
          <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
            <UInput
              v-model="search"
              icon="i-lucide-search"
              size="lg"
              class="flex-1"
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

            <div v-if="search.trim().length < minSearchLength" class="rounded-xl border border-dashed border-default px-4 py-5 text-sm text-toned">
              Tapez au moins {{ minSearchLength }} caractères.
            </div>

            <div v-else-if="searchPanelItems.length" class="max-h-[18rem] space-y-1 overflow-y-auto pr-1">
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

            <div v-else-if="remoteSearchPending" class="rounded-xl border border-dashed border-default px-4 py-5 text-sm text-toned">
              Recherche dans le catalogue...
            </div>

            <div v-else class="rounded-xl border border-dashed border-default px-4 py-5 text-sm text-toned">
              Aucun article trouvé pour cette recherche.
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
            <div class="grid grid-cols-[minmax(0,1.9fr)_6rem_5rem_10rem_5rem_8.5rem_6rem] gap-2 px-4 pb-2 text-[11px] uppercase tracking-[0.14em] text-toned">
              <span>Libellé</span>
              <span class="text-right">PU TTC</span>
              <span class="text-center">Qté</span>
              <span>Catégorie</span>
              <span class="text-center">TVA</span>
              <span class="text-right">Total</span>
              <span class="text-center">Actions</span>
            </div>

            <div class="max-h-[calc(100vh-23rem)] overflow-y-auto border-y border-default/70">
              <div
                v-for="(line, index) in state.lines"
                :key="line.id"
                class="grid grid-cols-[minmax(0,1.9fr)_6rem_5rem_10rem_5rem_8.5rem_6rem] items-center gap-2 border-t border-default/70 bg-default px-4 py-3 first:border-t-0"
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
                  <p
                    v-if="line.catalogItemId && (catalogItemById.get(line.catalogItemId)?.sku || catalogItemById.get(line.catalogItemId)?.name)"
                    class="mt-1 truncate text-xs text-toned"
                  >
                    {{ catalogItemById.get(line.catalogItemId)?.sku || catalogItemById.get(line.catalogItemId)?.name }}
                  </p>
                </div>

                <UFormField :name="`lines.${index}.unitPrice`" class="justify-self-end">
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
                    class="w-full max-w-[6rem]"
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

                <div class="text-center text-sm font-medium text-highlighted tabular-nums">
                  {{ line.vatRate }}%
                </div>

                <div class="text-right tabular-nums">
                  <p class="text-base font-semibold text-highlighted">
                    {{ formatCurrency(Math.round(line.quantity * line.unitPrice * 100)) }}
                  </p>
                </div>

                <div class="flex items-center justify-center gap-1 border-l border-default/60 pl-2">
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
