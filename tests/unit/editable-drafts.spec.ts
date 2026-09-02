import { effectScope, nextTick, ref } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import { usePaymentDrafts } from '../../app/composables/usePaymentDrafts'
import { useDocumentDraft, type DocumentInitialValue } from '../../app/composables/useDocumentDraft'
import type { DocumentDetail, DocumentType, PaymentRecord } from '../../shared/types/pos'

const scopes: ReturnType<typeof effectScope>[] = []
function scoped<T>(run: () => T): T {
  const scope = effectScope()
  scopes.push(scope)
  return scope.run(run)!
}
afterEach(() => scopes.splice(0).forEach(scope => scope.stop()))

function payment(id: number): PaymentRecord {
  return {
    id, customerId: 1, documentId: 7, method: 'cash', status: 'paid', amount: 1000,
    paidAt: '2026-09-02T12:00:00.000Z', notes: null,
    createdAt: '2026-09-02', updatedAt: '2026-09-02'
  }
}

describe('payment draft ownership', () => {
  it('keeps another row dirty after saving and refreshing one payment', async () => {
    const rows = ref([payment(1), payment(2)])
    const drafts = scoped(() => usePaymentDrafts(ref(7), rows))
    drafts.drafts.value[1]!.notes = 'Première modification'
    drafts.drafts.value[2]!.notes = 'À garder'
    const submitted = { ...drafts.drafts.value[1]! }
    const saved = { ...payment(1), notes: submitted.notes }
    drafts.acceptSaved(saved, submitted)
    rows.value = [saved, payment(2), payment(3)]
    await nextTick()
    expect(drafts.isDirty(1)).toBe(false)
    expect(drafts.isDirty(2)).toBe(true)
    expect(drafts.drafts.value[2]?.notes).toBe('À garder')
    expect(drafts.drafts.value[3]).toBeDefined()
    drafts.reset(rows.value[1]!)
    expect(drafts.isDirty(2)).toBe(false)
    expect(drafts.drafts.value[2]?.notes).toBe('')
  })

  it('preserves edits made during saving and ignores responses from an old document', async () => {
    const owner = ref(7)
    const rows = ref([payment(1)])
    const drafts = scoped(() => usePaymentDrafts(owner, rows))
    drafts.drafts.value[1]!.notes = 'Envoyé'
    const submitted = { ...drafts.drafts.value[1]! }
    drafts.drafts.value[1]!.notes = 'Modifié pendant l’envoi'
    drafts.acceptSaved({ ...payment(1), notes: 'Envoyé' }, submitted)
    rows.value = [{ ...payment(1), notes: 'Envoyé' }]
    await nextTick()
    expect(drafts.drafts.value[1]?.notes).toBe('Modifié pendant l’envoi')
    expect(drafts.isDirty(1)).toBe(true)
    owner.value = 8
    rows.value = [{ ...payment(2), documentId: 8 }]
    await nextTick()
    drafts.acceptSaved({ ...payment(1), notes: 'Réponse tardive' }, submitted)
    expect(drafts.drafts.value[1]).toBeUndefined()
    expect(drafts.isDirty(2)).toBe(false)
  })
})

function initialDocument(id = 7): DocumentInitialValue {
  return {
    id, type: 'invoice', status: 'issued', customerId: 1, ticketId: null,
    issuedAt: '2026-09-02T12:00:00.000Z', notes: 'Initial',
    lines: [{ catalogItemId: null, label: 'Article', quantity: 1, unitPrice: 1000, vatRate: 8.1, categoryHint: null }]
  }
}

function documentDraft() {
  const initial = ref<DocumentInitialValue | undefined>(initialDocument())
  const editor = scoped(() => useDocumentDraft({
    initialValue: initial, allowedTypes: ref<DocumentType[]>(['invoice']),
    fixedCustomerId: ref(null), fixedTicketId: ref(null), catalogItems: ref([])
  }))
  return { initial, editor }
}

describe('commercial document draft ownership', () => {
  it('preserves local header and lines across a same-record refresh and supports explicit reset', async () => {
    const { initial, editor } = documentDraft()
    expect(editor.isDirty.value).toBe(false)
    editor.state.notes = 'Note locale'
    editor.updateLineUnitPrice(0, -1.05)
    initial.value = { ...initialDocument(), notes: 'Note serveur' }
    await nextTick()
    expect(editor.state.notes).toBe('Note locale')
    expect(editor.state.lines[0]?.unitPriceCents).toBe(-105)
    expect(editor.schema.value.safeParse(editor.state).success).toBe(false)
    expect(editor.isDirty.value).toBe(true)
    editor.resetDraft()
    expect(editor.state.notes).toBe('Note serveur')
    expect(editor.state.lines[0]?.unitPriceCents).toBe(1000)
    expect(editor.isDirty.value).toBe(false)
  })

  it('acknowledges only submitted values, preserving later edits and derived server status', async () => {
    const { initial, editor } = documentDraft()
    editor.state.notes = 'Envoyé'
    editor.updateLineUnitPrice(0, 12.35)
    const submitted = editor.serialize()
    editor.state.notes = 'Encore modifié'
    const saved = { ...initialDocument(), ...submitted, id: 7, status: 'paid' } as DocumentDetail
    editor.acceptSaved(saved, submitted)
    initial.value = saved
    await nextTick()
    expect(editor.state.notes).toBe('Encore modifié')
    expect(editor.state.status).toBe('paid')
    expect(editor.state.lines[0]?.unitPriceCents).toBe(1235)
    expect(editor.isDirty.value).toBe(true)

    const resubmitted = editor.serialize()
    const resaved = { ...saved, ...resubmitted, status: 'paid' } as DocumentDetail
    editor.acceptSaved(resaved, resubmitted)
    initial.value = resaved
    await nextTick()
    expect(editor.state.status).toBe('paid')
    expect(editor.isDirty.value).toBe(false)
  })

  it('replaces a dirty draft when changing document identity', async () => {
    const { initial, editor } = documentDraft()
    editor.state.notes = 'Ancien document'
    editor.updateLineLabel(0, 'Ligne locale')
    initial.value = initialDocument(8)
    await nextTick()
    expect(editor.state.notes).toBe('Initial')
    expect(editor.state.lines[0]?.label).toBe('Article')
    expect(editor.isDirty.value).toBe(false)
  })
})
