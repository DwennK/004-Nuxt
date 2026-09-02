import { computed, reactive, ref, watch, type ComputedRef, type Ref } from 'vue'
import { z } from 'zod'
import {
  documentStatusLabels,
  documentStatuses,
  documentTypes,
  documentTypeLabels,
  lineCategoryHints
} from '~~/shared/constants/pos'
import type {
  CatalogItemRecord,
  DocumentDetail,
  DocumentStatus,
  DocumentType
} from '~~/shared/types/pos'
import {
  useCommercialLinesDraft,
  type CommercialLinesDraftController,
  type EditableCommercialLinePayload
} from './useCommercialLinesDraft'

type EditableLinePayload = EditableCommercialLinePayload

export type DocumentInitialValue = Partial<Pick<DocumentDetail, 'id' | 'type' | 'status' | 'customerId' | 'ticketId' | 'issuedAt' | 'notes'>> & {
  lines?: EditableLinePayload[]
}

export type DocumentDraftLine = CommercialLinesDraftController['state']['lines'][number]

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
} & Omit<CommercialLinesDraftController, 'state'> & {
  serialize: () => DocumentSavePayload
  resetDraft: () => void
  acceptSaved: (saved: DocumentDetail, submitted: DocumentSavePayload) => void
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

export function useDocumentDraft(options: UseDocumentDraftOptions): DocumentDraftController {
  const isExistingPaidDocument = computed(() => options.initialValue.value?.status === 'paid')
  const lineEditor = useCommercialLinesDraft({
    initialLines: computed(() => options.initialValue.value?.lines),
    catalogItems: options.catalogItems,
    draftKey: computed(() => options.initialValue.value?.id),
    lineIdPrefix: 'document-line'
  })

  const lineSchema = z.object({
    id: z.string(),
    catalogItemId: z.coerce.number().int().positive().optional().nullable(),
    label: z.string().trim().min(1, 'Le libellé est obligatoire'),
    quantity: z.coerce.number().int('La quantité doit être un nombre entier').positive('La quantité doit être supérieure à 0'),
    unitPriceCents: z.coerce.number().int(),
    vatRate: z.coerce.number().min(0).max(100),
    categoryHint: z.enum(lineCategoryHints).optional().nullable()
  })

  const schema = computed(() => z.object({
    type: z.enum(documentTypes).refine(value => options.allowedTypes.value.includes(value), 'Ce type de document n’est pas autorisé'),
    status: z.enum(documentStatuses).refine(
      status => status !== 'paid' || isExistingPaidDocument.value,
      'Le statut payé est dérivé des encaissements'
    ),
    customerId: z.coerce.number().int().positive('Le client est obligatoire'),
    ticketId: z.coerce.number().int().positive().optional().nullable(),
    issuedAt: z.string().min(1, 'La date d’émission est obligatoire'),
    notes: z.string().optional().default(''),
    lines: z.array(lineSchema).min(1, 'Au moins une ligne est obligatoire')
  }).superRefine((value, ctx) => {
    const total = value.lines.reduce((sum, line) => {
      return sum + line.quantity * line.unitPriceCents
    }, 0)

    if (total < 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['lines'],
        message: 'Le total du document ne peut pas être négatif'
      })
    }
  }))

  const state = reactive<DocumentDraftState>({
    type: 'invoice',
    status: 'issued',
    customerId: 0,
    ticketId: null,
    issuedAt: toDateTimeLocal(),
    notes: '',
    get lines() { return lineEditor.state.lines },
    set lines(value) { lineEditor.state.lines = value }
  })

  const documentTypeItems = computed(() => options.allowedTypes.value.map(type => ({
    label: documentTypeLabels[type],
    value: type
  })))

  const documentStatusItems = computed(() => documentStatuses
    .filter(status => isExistingPaidDocument.value ? status === 'paid' : status !== 'paid')
    .map(status => ({
      label: documentStatusLabels[status],
      value: status
    })))

  const headerBaseline = ref('')
  function headerSnapshot() {
    const { lines: _lines, ...header } = state
    return JSON.stringify(header)
  }
  const headerDirty = computed(() => headerSnapshot() !== headerBaseline.value)

  function headerFrom(initialValue = options.initialValue.value) {
    return {
      type: initialValue?.type || options.allowedTypes.value[0] || 'invoice',
      status: initialValue?.status || 'issued',
      customerId: options.fixedCustomerId.value ?? initialValue?.customerId ?? 0,
      ticketId: options.fixedTicketId.value ?? initialValue?.ticketId ?? null,
      issuedAt: toDateTimeLocal(initialValue?.issuedAt),
      notes: initialValue?.notes || ''
    }
  }

  function resetHeader() {
    Object.assign(state, headerFrom())
    headerBaseline.value = headerSnapshot()
  }

  function acceptSaved(saved: DocumentDetail, submitted: DocumentSavePayload) {
    if (saved.id !== options.initialValue.value?.id) return
    const nextHeader = headerFrom(saved)
    const submittedHeader = headerFrom(submitted)
    Object.assign(state, Object.fromEntries(Object.entries(nextHeader).filter(([key]) => {
      const field = key as keyof typeof nextHeader
      return state[field] === submittedHeader[field]
    })))
    headerBaseline.value = JSON.stringify(nextHeader)
    lineEditor.acceptSavedLines(saved.lines, submitted.lines)
  }

  function resetDraft() {
    resetHeader()
    lineEditor.resetLines()
  }

  let initialized = false
  let ownerId: number | undefined
  watch([options.initialValue, options.allowedTypes, options.fixedCustomerId, options.fixedTicketId], () => {
    const nextId = options.initialValue.value?.id
    if (!initialized || nextId !== ownerId || !headerDirty.value) resetHeader()
    initialized = true
    ownerId = nextId
  }, { immediate: true, deep: true })

  function serialize(): DocumentSavePayload {
    return {
      type: state.type,
      status: state.status,
      customerId: state.customerId,
      ticketId: state.ticketId ?? null,
      issuedAt: new Date(state.issuedAt).toISOString(),
      notes: state.notes,
      lines: lineEditor.serializeLines()
    }
  }

  return {
    state,
    isDirty: computed(() => headerDirty.value || lineEditor.isDirty.value),
    resetDraft,
    acceptSaved,
    schema,
    documentTypeItems,
    documentStatusItems,
    categoryItems: lineEditor.categoryItems,
    totals: lineEditor.totals,
    addEmptyLine: lineEditor.addEmptyLine,
    resetLines: lineEditor.resetLines,
    acceptSavedLines: lineEditor.acceptSavedLines,
    addCatalogItem: lineEditor.addCatalogItem,
    incrementLine: lineEditor.incrementLine,
    decrementLine: lineEditor.decrementLine,
    removeLine: lineEditor.removeLine,
    cloneLine: lineEditor.cloneLine,
    moveLine: lineEditor.moveLine,
    updateLineCatalogItem: lineEditor.updateLineCatalogItem,
    updateLineLabel: lineEditor.updateLineLabel,
    updateLineUnitPrice: lineEditor.updateLineUnitPrice,
    selectAllOnFocus: lineEditor.selectAllOnFocus,
    serializeLines: lineEditor.serializeLines,
    serialize
  }
}
