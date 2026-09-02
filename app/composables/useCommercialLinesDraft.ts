import { computed, reactive, ref, watch, type ComputedRef, type Ref } from 'vue'
import { lineCategoryHints, lineCategoryLabels } from '~~/shared/constants/pos'
import { calculateCommercialTotals } from '~~/shared/domain/commercial/money'
import type {
  CatalogItemRecord,
  CommercialLineRecord,
  LineCategoryHint
} from '~~/shared/types/pos'
import { parseCurrencyInput } from '~~/shared/utils/pos'

export type EditableCommercialLinePayload = Omit<CommercialLineRecord, 'lineTotal'>

export type CommercialDraftLine = {
  id: string
  catalogItemId: number | null
  label: string
  quantity: number
  /** Integer cents; currency input fields convert at the view boundary. */
  unitPriceCents: number
  vatRate: number
  categoryHint: LineCategoryHint | null
}

export const commercialLineUnitPriceMin = -999_999
export const commercialLineUnitPriceInputClass = 'w-[4.25rem]'

type SelectItem<TValue> = {
  label: string
  value: TValue
}

type UseCommercialLinesDraftOptions = {
  initialLines: Ref<EditableCommercialLinePayload[] | undefined>
  catalogItems: Ref<CatalogItemRecord[]>
  lineIdPrefix?: string
  allowEmpty?: boolean
  reuseEmptyLine?: boolean
  draftKey?: Ref<number | string | undefined>
}

export type CommercialLinesDraftController = {
  state: { lines: CommercialDraftLine[] }
  isDirty: ComputedRef<boolean>
  categoryItems: Array<SelectItem<LineCategoryHint>>
  totals: ComputedRef<{ subtotal: number, taxAmount: number, total: number }>
  addEmptyLine: () => CommercialDraftLine
  resetLines: (lines?: EditableCommercialLinePayload[]) => void
  acceptSavedLines: (saved: EditableCommercialLinePayload[], submitted: EditableCommercialLinePayload[]) => void
  addCatalogItem: (item: CatalogItemRecord) => void
  incrementLine: (index: number) => void
  decrementLine: (index: number) => void
  removeLine: (index: number) => void
  cloneLine: (index: number) => void
  moveLine: (index: number, direction: 'up' | 'down') => void
  updateLineCatalogItem: (index: number, catalogItemId: number | null) => void
  updateLineLabel: (index: number, value: string) => void
  updateLineUnitPrice: (index: number, value: number | null) => void
  selectAllOnFocus: (event: FocusEvent) => void
  serializeLines: (lines?: readonly CommercialDraftLine[]) => EditableCommercialLinePayload[]
}

function getLineCategoryFromItem(item: CatalogItemRecord): LineCategoryHint {
  if (item.type === 'product') {
    return 'accessory'
  }

  return item.type === 'repair' ? 'repair' : 'service'
}

export function useCommercialLinesDraft(options: UseCommercialLinesDraftOptions): CommercialLinesDraftController {
  let nextLineId = 0

  function createLine(input?: Partial<Omit<CommercialDraftLine, 'id'>>): CommercialDraftLine {
    return {
      id: `${options.lineIdPrefix || 'line'}-${nextLineId++}`,
      catalogItemId: input?.catalogItemId ?? null,
      label: input?.label ?? '',
      quantity: input?.quantity ?? 1,
      unitPriceCents: input?.unitPriceCents ?? 0,
      vatRate: input?.vatRate ?? 8.1,
      categoryHint: input?.categoryHint ?? null
    }
  }

  const state = reactive<{ lines: CommercialDraftLine[] }>({
    lines: []
  })
  const baseline = ref('')
  const isDirty = computed(() => JSON.stringify(serializeLines()) !== baseline.value)

  const categoryItems = lineCategoryHints.map(category => ({
    label: lineCategoryLabels[category],
    value: category
  }))

  function resetLines(lines = options.initialLines.value) {
    state.lines = lines?.length
      ? lines.map(line => createLine({
          ...line,
          unitPriceCents: line.unitPrice
        }))
      : options.allowEmpty ? [] : [createLine()]
    baseline.value = JSON.stringify(serializeLines())
  }

  function acceptSavedLines(saved: EditableCommercialLinePayload[], submitted: EditableCommercialLinePayload[]) {
    if (JSON.stringify(serializeLines()) === JSON.stringify(submitted)) {
      resetLines(saved)
    } else {
      baseline.value = JSON.stringify(serializeLines(saved.map(line => createLine({ ...line, unitPriceCents: line.unitPrice }))))
    }
  }

  let initialized = false
  let ownerKey: number | string | undefined
  watch([() => options.draftKey?.value, options.initialLines], ([key, lines]) => {
    if (!initialized || key !== ownerKey || !isDirty.value) {
      resetLines(lines)
    }
    initialized = true
    ownerKey = key
  }, { immediate: true, deep: true })

  const totals = computed(() => calculateCommercialTotals(serializeLines()))

  function addEmptyLine() {
    const line = createLine()
    state.lines.push(line)
    return line
  }

  function detachLineFromCatalog(index: number) {
    const line = state.lines[index]

    if (!line) {
      return
    }

    line.catalogItemId = null
  }

  function addCatalogItem(item: CatalogItemRecord) {
    const existing = state.lines.find((line) => {
      return line.catalogItemId === item.id
        && line.label === item.name
        && line.unitPriceCents === item.defaultPrice
        && line.vatRate === item.vatRate
    })

    if (existing) {
      existing.quantity += 1
      return
    }

    const emptyLine = options.reuseEmptyLine === false
      ? undefined
      : state.lines.find(line => !line.label.trim() && !line.catalogItemId)

    if (emptyLine) {
      emptyLine.catalogItemId = item.id
      emptyLine.label = item.name
      emptyLine.quantity = 1
      emptyLine.unitPriceCents = item.defaultPrice
      emptyLine.vatRate = item.vatRate
      emptyLine.categoryHint = getLineCategoryFromItem(item)
      return
    }

    state.lines.push(createLine({
      catalogItemId: item.id,
      label: item.name,
      quantity: 1,
      unitPriceCents: item.defaultPrice,
      vatRate: item.vatRate,
      categoryHint: getLineCategoryFromItem(item)
    }))
  }

  function incrementLine(index: number) {
    const line = state.lines[index]

    if (!line) {
      return
    }

    line.quantity += 1
  }

  function decrementLine(index: number) {
    const line = state.lines[index]

    if (!line || line.quantity <= 1) {
      return
    }

    line.quantity -= 1
  }

  function removeLine(index: number) {
    if (!state.lines[index]) {
      return
    }

    if (state.lines.length === 1 && !options.allowEmpty) {
      state.lines.splice(index, 1, createLine())
      return
    }

    state.lines.splice(index, 1)
  }

  function cloneLine(index: number) {
    const line = state.lines[index]

    if (!line) {
      return
    }

    state.lines.splice(index + 1, 0, createLine({
      catalogItemId: line.catalogItemId,
      label: line.label,
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
      vatRate: line.vatRate,
      categoryHint: line.categoryHint
    }))
  }

  function moveLine(index: number, direction: 'up' | 'down') {
    const targetIndex = direction === 'up' ? index - 1 : index + 1

    if (!state.lines[index] || targetIndex < 0 || targetIndex >= state.lines.length) {
      return
    }

    const [line] = state.lines.splice(index, 1)

    if (!line) {
      return
    }

    state.lines.splice(targetIndex, 0, line)
  }

  function updateLineCatalogItem(index: number, catalogItemId: number | null) {
    const line = state.lines[index]

    if (!line) {
      return
    }

    line.catalogItemId = catalogItemId

    if (!catalogItemId) {
      return
    }

    const item = options.catalogItems.value.find(candidate => candidate.id === catalogItemId)

    if (!item) {
      return
    }

    line.label = item.name
    line.unitPriceCents = item.defaultPrice
    line.vatRate = item.vatRate
    line.categoryHint = getLineCategoryFromItem(item)
  }

  function updateLineLabel(index: number, value: string) {
    if (!state.lines[index]) {
      return
    }

    detachLineFromCatalog(index)
    state.lines[index]!.label = value
  }

  function updateLineUnitPrice(index: number, value: number | null) {
    if (!state.lines[index]) {
      return
    }

    detachLineFromCatalog(index)
    state.lines[index]!.unitPriceCents = parseCurrencyInput(value || 0)
  }

  function selectAllOnFocus(event: FocusEvent) {
    const target = event.target

    if (!(target instanceof HTMLInputElement)) {
      return
    }

    requestAnimationFrame(() => {
      target.select()
    })
  }

  function serializeLines(lines: readonly CommercialDraftLine[] = state.lines): EditableCommercialLinePayload[] {
    return lines.map(line => ({
      catalogItemId: line.catalogItemId || null,
      label: line.label,
      quantity: Number(line.quantity || 0),
      unitPrice: line.unitPriceCents || 0,
      vatRate: Number(line.vatRate || 0),
      categoryHint: line.categoryHint || null
    }))
  }

  return {
    state,
    isDirty,
    categoryItems,
    totals,
    addEmptyLine,
    resetLines,
    acceptSavedLines,
    addCatalogItem,
    incrementLine,
    decrementLine,
    removeLine,
    cloneLine,
    moveLine,
    updateLineCatalogItem,
    updateLineLabel,
    updateLineUnitPrice,
    selectAllOnFocus,
    serializeLines
  }
}
