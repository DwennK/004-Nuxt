import type { ComputedRef, Ref } from 'vue'
import { z } from 'zod'
import {
  documentStatusLabels,
  documentStatuses,
  documentTypes,
  documentTypeLabels,
  lineCategoryHints,
  lineCategoryLabels
} from '~~/shared/constants/pos'
import type {
  CatalogItemRecord,
  DocumentDetail,
  DocumentStatus,
  DocumentType,
  LineCategoryHint
} from '~~/shared/types/pos'
import { isPayableDocumentType, parseCurrencyInput } from '~~/shared/utils/pos'

type EditableLinePayload = {
  catalogItemId: number | null
  label: string
  quantity: number
  unitPrice: number
  vatRate: number
  categoryHint: LineCategoryHint | null
}

export type DocumentInitialValue = Partial<Pick<DocumentDetail, 'type' | 'status' | 'customerId' | 'ticketId' | 'issuedAt' | 'notes'>> & {
  lines?: EditableLinePayload[]
}

export type DocumentDraftLine = {
  id: string
  catalogItemId: number | null
  label: string
  quantity: number
  unitPrice: number
  vatRate: number
  categoryHint: LineCategoryHint | null
}

export type DocumentDraftState = {
  type: DocumentType
  status: DocumentStatus
  customerId: number
  ticketId: number | null
  issuedAt: string
  notes: string
  lines: DocumentDraftLine[]
}

export type DocumentSavePayload = {
  type: DocumentType
  status: DocumentStatus
  customerId: number
  ticketId: number | null
  issuedAt: string
  notes: string
  lines: EditableLinePayload[]
}

type SelectItem<TValue> = {
  label: string
  value: TValue
}

type UseDocumentDraftOptions = {
  initialValue: Ref<DocumentInitialValue | undefined>
  allowedTypes: Ref<DocumentType[]>
  fixedCustomerId: Ref<number | null>
  fixedTicketId: Ref<number | null>
  catalogItems: Ref<CatalogItemRecord[]>
}

export type DocumentDraftController = {
  state: DocumentDraftState
  schema: ComputedRef<z.ZodTypeAny>
  documentTypeItems: ComputedRef<Array<SelectItem<DocumentType>>>
  documentStatusItems: ComputedRef<Array<SelectItem<DocumentStatus>>>
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
  serialize: () => DocumentSavePayload
}

function toDateTimeLocal(value?: string | null) {
  const date = value ? new Date(value) : new Date()

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const pad = (part: number) => String(part).padStart(2, '0')

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join('-') + `T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function getLineCategoryFromItem(item: CatalogItemRecord): LineCategoryHint {
  if (item.type === 'product') {
    return 'accessory'
  }

  return item.type === 'repair' ? 'repair' : 'service'
}

export function useDocumentDraft(options: UseDocumentDraftOptions): DocumentDraftController {
  let nextLineId = 0

  function createLine(input?: Partial<Omit<DocumentDraftLine, 'id'>>): DocumentDraftLine {
    return {
      id: `document-line-${nextLineId++}`,
      catalogItemId: input?.catalogItemId ?? null,
      label: input?.label ?? '',
      quantity: input?.quantity ?? 1,
      unitPrice: input?.unitPrice ?? 0,
      vatRate: input?.vatRate ?? 8.1,
      categoryHint: input?.categoryHint ?? null
    }
  }

  const lineSchema = z.object({
    id: z.string(),
    catalogItemId: z.coerce.number().int().positive().optional().nullable(),
    label: z.string().trim().min(1, 'Le libellé est obligatoire'),
    quantity: z.coerce.number().int('La quantité doit être un nombre entier').positive('La quantité doit être supérieure à 0'),
    unitPrice: z.coerce.number().min(0, 'Le prix unitaire doit être positif'),
    vatRate: z.coerce.number().min(0).max(100),
    categoryHint: z.enum(lineCategoryHints).optional().nullable()
  })

  const schema = computed(() => z.object({
    type: z.enum(documentTypes).refine(value => options.allowedTypes.value.includes(value), 'Ce type de document n’est pas autorisé'),
    status: z.enum(documentStatuses),
    customerId: z.coerce.number().int().positive('Le client est obligatoire'),
    ticketId: z.coerce.number().int().positive().optional().nullable(),
    issuedAt: z.string().min(1, 'La date d’émission est obligatoire'),
    notes: z.string().optional().default(''),
    lines: z.array(lineSchema).min(1, 'Au moins une ligne est obligatoire')
  }))

  const state = reactive<DocumentDraftState>({
    type: 'invoice',
    status: 'issued',
    customerId: 0,
    ticketId: null,
    issuedAt: toDateTimeLocal(),
    notes: '',
    lines: [createLine()]
  })

  const documentTypeItems = computed(() => options.allowedTypes.value.map(type => ({
    label: documentTypeLabels[type],
    value: type
  })))

  const documentStatusItems = computed(() => documentStatuses
    .filter(status => isPayableDocumentType(state.type) || status !== 'paid')
    .map(status => ({
      label: documentStatusLabels[status],
      value: status
    })))

  const categoryItems = lineCategoryHints.map(category => ({
    label: lineCategoryLabels[category],
    value: category
  }))

  watchEffect(() => {
    const initialValue = options.initialValue.value

    state.type = initialValue?.type || options.allowedTypes.value[0] || 'invoice'
    state.status = initialValue?.status || 'issued'
    state.customerId = options.fixedCustomerId.value ?? initialValue?.customerId ?? 0
    state.ticketId = options.fixedTicketId.value ?? initialValue?.ticketId ?? null
    state.issuedAt = toDateTimeLocal(initialValue?.issuedAt)
    state.notes = initialValue?.notes || ''
    state.lines = initialValue?.lines?.length
      ? initialValue.lines.map(line => createLine({
          catalogItemId: line.catalogItemId ?? null,
          label: line.label,
          quantity: line.quantity,
          unitPrice: line.unitPrice / 100,
          vatRate: line.vatRate,
          categoryHint: line.categoryHint ?? null
        }))
      : [createLine()]
  })

  watch(() => state.type, (type) => {
    if (!isPayableDocumentType(type) && state.status === 'paid') {
      state.status = 'issued'
    }
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

  function serialize(): DocumentSavePayload {
    return {
      type: state.type,
      status: state.status,
      customerId: state.customerId,
      ticketId: state.ticketId ?? null,
      issuedAt: new Date(state.issuedAt).toISOString(),
      notes: state.notes,
      lines: state.lines.map(line => ({
        catalogItemId: line.catalogItemId || null,
        label: line.label,
        quantity: Number(line.quantity || 0),
        unitPrice: Math.round((line.unitPrice || 0) * 100),
        vatRate: Number(line.vatRate || 0),
        categoryHint: line.categoryHint || null
      }))
    }
  }

  return {
    state,
    schema,
    documentTypeItems,
    documentStatusItems,
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
    serialize
  }
}
