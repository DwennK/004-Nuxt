import type { ComputedRef, Ref } from 'vue'
import { lineCategoryHints, lineCategoryLabels } from '~~/shared/constants/pos'
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
  unitPrice: number
  vatRate: number
  categoryHint: LineCategoryHint | null
}

type SelectItem<TValue> = {
  label: string
  value: TValue
}

type UseCommercialLinesDraftOptions = {
  initialLines: Ref<EditableCommercialLinePayload[] | undefined>
  catalogItems: Ref<CatalogItemRecord[]>
  lineIdPrefix?: string
}

export type CommercialLinesDraftController = {
  state: { lines: CommercialDraftLine[] }
  categoryItems: Array<SelectItem<LineCategoryHint>>
  totals: ComputedRef<{ subtotal: number, taxAmount: number, total: number }>
  addEmptyLine: () => void
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
  serializeLines: () => EditableCommercialLinePayload[]
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
      unitPrice: input?.unitPrice ?? 0,
      vatRate: input?.vatRate ?? 8.1,
      categoryHint: input?.categoryHint ?? null
    }
  }

  const state = reactive<{ lines: CommercialDraftLine[] }>({
    lines: [createLine()]
  })

  const categoryItems = lineCategoryHints.map(category => ({
    label: lineCategoryLabels[category],
    value: category
  }))

  watchEffect(() => {
    state.lines = options.initialLines.value?.length
      ? options.initialLines.value.map(line => createLine({
          catalogItemId: line.catalogItemId ?? null,
          label: line.label,
          quantity: line.quantity,
          unitPrice: line.unitPrice / 100,
          vatRate: line.vatRate,
          categoryHint: line.categoryHint ?? null
        }))
      : [createLine()]
  })

  const totals = computed(() => {
    const total = state.lines.reduce((sum, line) => {
      return sum + Math.round((line.quantity || 0) * (line.unitPrice || 0) * 100)
    }, 0)
    const taxAmount = state.lines.reduce((sum, line) => {
      const lineTotal = Math.round((line.quantity || 0) * (line.unitPrice || 0) * 100)
      const netTotal = line.vatRate
        ? Math.round(lineTotal / (1 + ((line.vatRate || 0) / 100)))
        : lineTotal

      return sum + Math.max(lineTotal - netTotal, 0)
    }, 0)

    return {
      subtotal: Math.max(total - taxAmount, 0),
      taxAmount,
      total
    }
  })

  function addEmptyLine() {
    state.lines.push(createLine())
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
        && line.unitPrice === item.defaultPrice / 100
        && line.vatRate === item.vatRate
    })

    if (existing) {
      existing.quantity += 1
      return
    }

    const emptyLine = state.lines.find(line => !line.label.trim() && !line.catalogItemId)

    if (emptyLine) {
      emptyLine.catalogItemId = item.id
      emptyLine.label = item.name
      emptyLine.quantity = 1
      emptyLine.unitPrice = item.defaultPrice / 100
      emptyLine.vatRate = item.vatRate
      emptyLine.categoryHint = getLineCategoryFromItem(item)
      return
    }

    state.lines.push(createLine({
      catalogItemId: item.id,
      label: item.name,
      quantity: 1,
      unitPrice: item.defaultPrice / 100,
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

    if (state.lines.length === 1) {
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
      unitPrice: line.unitPrice,
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
    line.unitPrice = item.defaultPrice / 100
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
    state.lines[index]!.unitPrice = Math.max(parseCurrencyInput(value || 0), 0) / 100
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

  function serializeLines(): EditableCommercialLinePayload[] {
    return state.lines.map(line => ({
      catalogItemId: line.catalogItemId || null,
      label: line.label,
      quantity: Number(line.quantity || 0),
      unitPrice: Math.round((line.unitPrice || 0) * 100),
      vatRate: Number(line.vatRate || 0),
      categoryHint: line.categoryHint || null
    }))
  }

  return {
    state,
    categoryItems,
    totals,
    addEmptyLine,
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
