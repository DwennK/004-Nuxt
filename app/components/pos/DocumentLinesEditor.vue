<script setup lang="ts">
import type { CatalogItemRecord } from '~~/shared/types/pos'
import type { DocumentDraftController } from '~~/app/composables/useDocumentDraft'
import { formatCurrency, getCatalogItemTypeLabel, normalizeSearchText } from '~~/shared/utils/pos'

const props = defineProps<{
  editor: DocumentDraftController
  catalogItems: CatalogItemRecord[]
}>()

const state = props.editor.state
const totals = props.editor.totals
const categoryItems = props.editor.categoryItems
const search = ref('')
const searchOpen = ref(false)
const highlightedItemIndex = ref(0)
let searchCloseTimeout: ReturnType<typeof setTimeout> | null = null

const activeItems = computed(() => props.catalogItems.filter(item => item.isActive))

const quickPickItems = computed(() => {
  const explicitQuickPicks = activeItems.value.filter(item => item.isQuickPick)

  if (explicitQuickPicks.length) {
    return explicitQuickPicks.slice(0, 8)
  }

  return activeItems.value.filter(item => item.type === 'product').slice(0, 8)
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
      item.type
    ].some(value => normalizeSearchText(value).includes(term))
  }).slice(0, 10)
})

const searchPanelItems = computed(() => {
  return search.value.trim() ? filteredItems.value : quickPickItems.value
})

const searchPanelTitle = computed(() => {
  return search.value.trim() ? 'Résultats' : 'Raccourcis comptoir'
})

const catalogItemsList = computed(() => props.catalogItems.map(item => ({
  label: `${item.name} (${getCatalogItemTypeLabel(item.type)})`,
  value: item.id
})))

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
        body: 'space-y-4 p-4 sm:p-4',
        header: 'p-4 pb-0 sm:p-4 sm:pb-0'
      }"
    >
      <template #header>
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="space-y-1">
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="text-base font-semibold text-highlighted">
                Recherche article
              </h2>
              <UBadge color="neutral" variant="soft" size="sm">
                Entrée ajoute le premier résultat
              </UBadge>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-2 text-xs text-toned">
            <span>{{ state.lines.length ? `${state.lines.length} ligne(s)` : 'Document vide' }}</span>
            <span>{{ formatCurrency(totals.total) }}</span>
          </div>
        </div>
      </template>

      <div
        class="relative"
        @focusin="cancelSearchClose"
        @focusout="scheduleSearchClose"
        @pointerdown="openSearchPanel"
      >
        <div class="flex gap-2">
          <UInput
            v-model="search"
            icon="i-lucide-search"
            size="xl"
            class="flex-1"
            placeholder="cable, coque, chargeur, verre..."
            autofocus
            @keydown="handleSearchKeydown"
          />
          <PosBarcodeScanner
            title="Scanner un article"
            description="Scannez le code-barres ou QR code d'un article pour l'ajouter au document."
            trigger-size="lg"
            trigger-aria-label="Scanner un code-barres"
            @scanned="handleBarcodeScan"
          />
          <UButton
            icon="i-lucide-plus"
            label="Ligne libre"
            color="neutral"
            variant="soft"
            @click="editor.addEmptyLine()"
          />
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
    </UCard>

    <UCard
      variant="subtle"
      :ui="{
        root: 'rounded-[2rem] shadow-sm',
        body: 'space-y-4 p-4 sm:p-4',
        header: 'p-4 pb-0 sm:p-4 sm:pb-0'
      }"
    >
      <template #header>
        <div class="flex items-center justify-between gap-3">
          <div>
            <h2 class="text-base font-semibold text-highlighted">
              Lignes du document
            </h2>
            <p class="text-sm text-toned">
              Modifiez directement les lignes et le contexte sans changer d’écran.
            </p>
          </div>
          <div class="text-right">
            <p class="text-[11px] uppercase tracking-[0.14em] text-toned">
              Total
            </p>
            <p class="text-2xl font-semibold text-highlighted">
              {{ formatCurrency(totals.total) }}
            </p>
          </div>
        </div>
      </template>

      <UEmpty
        v-if="!state.lines.length"
        icon="i-lucide-list"
        title="Aucune ligne"
        description="Ajoutez un article ou créez une ligne libre."
        class="py-8"
      />

      <div v-else class="max-h-[calc(100vh-22rem)] space-y-2 overflow-y-auto pr-1">
        <div
          v-for="(line, index) in state.lines"
          :key="line.id"
          class="space-y-3 rounded-2xl border border-default bg-default px-3 py-3"
        >
          <div class="grid gap-2 xl:grid-cols-[minmax(0,1fr)_12rem]">
            <UFormField :name="`lines.${index}.catalogItemId`">
              <USelectMenu
                :model-value="line.catalogItemId ?? undefined"
                :items="catalogItemsList"
                value-key="value"
                placeholder="Rechercher dans le catalogue"
                :search-input="{ placeholder: 'Produit ou service', size: 'sm' }"
                clear
                size="sm"
                class="w-full"
                @update:model-value="editor.updateLineCatalogItem(index, $event ?? null)"
              />
            </UFormField>

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
          </div>

          <div class="grid gap-2 md:grid-cols-[minmax(0,1fr)_5rem_auto_9rem_auto] md:items-center">
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

            <UFormField :name="`lines.${index}.unitPrice`" class="md:min-w-0 md:justify-self-start">
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
                class="w-[5rem]"
                @update:model-value="editor.updateLineUnitPrice(index, $event)"
                @focus="editor.selectAllOnFocus"
              />
            </UFormField>

            <div class="flex items-center gap-1 justify-self-start md:justify-self-center">
              <UButton
                type="button"
                icon="i-lucide-minus"
                color="neutral"
                variant="soft"
                size="xs"
                :disabled="line.quantity <= 1"
                @click="editor.decrementLine(index)"
              />
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
              <UButton
                type="button"
                icon="i-lucide-plus"
                color="neutral"
                variant="soft"
                size="xs"
                @click="editor.incrementLine(index)"
              />
            </div>

            <div class="text-left md:text-right">
              <p class="text-lg font-semibold text-highlighted">
                {{ formatCurrency(Math.round(line.quantity * line.unitPrice * 100)) }}
              </p>
              <p class="text-xs text-toned">
                TVA incl. {{ line.vatRate }}%
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
    </UCard>
  </div>
</template>
