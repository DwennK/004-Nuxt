import { effectScope, nextTick, ref } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import { useSavDraft } from '../../app/composables/useSavDraft'
import type { SavDetails } from '../../shared/types/sav'

const scopes: ReturnType<typeof effectScope>[] = []
afterEach(() => scopes.splice(0).forEach(scope => scope.stop()))

function setup() {
  const sav: SavDetails = {
    sourceDocumentId: null, repair: 'Écran', reason: 'Retour', coverage: 'pending', status: 'received',
    diagnosis: 'Initial', work: '', receivedAt: '2026-09-23T10:00:00.000Z', deliveredAt: null
  }
  const document = ref({ id: 1, sav, customer: { phone: 'old' } })
  const scope = effectScope()
  scopes.push(scope)
  return { document, draft: scope.run(() => useSavDraft(document))! }
}

describe('SAV draft ownership', () => {
  it('preserves unsaved work and the dirty flag when updating the customer or refreshing the document', async () => {
    const { document, draft } = setup()
    draft.state.diagnosis = 'Diagnostic local'
    draft.state.work = 'Travail local'
    document.value = { ...document.value, customer: { phone: 'new' } }
    await nextTick()
    document.value = { ...document.value, sav: { ...document.value.sav, diagnosis: 'Serveur' } }
    await nextTick()
    expect(draft.state).toMatchObject({ diagnosis: 'Diagnostic local', work: 'Travail local' })
    expect(draft.isDirty.value).toBe(true)
    draft.reset()
    expect(draft.state).toMatchObject({ diagnosis: 'Serveur', work: '' })
    expect(draft.isDirty.value).toBe(false)
  })

  it('accepts normalized saved values, keeps later edits, and clears dirty after the final save', async () => {
    const { document, draft } = setup()
    draft.state.diagnosis = ' Diagnostic envoyé '
    const submitted = { ...draft.state }
    draft.state.work = 'Saisi pendant la requête'
    const saved = { ...document.value, sav: { ...submitted, diagnosis: 'Diagnostic envoyé' } }
    draft.acceptSaved(saved, submitted)
    document.value = saved
    await nextTick()
    expect(draft.state.diagnosis).toBe('Diagnostic envoyé')
    expect(draft.state.work).toBe('Saisi pendant la requête')
    expect(draft.isDirty.value).toBe(true)
    const final = { ...draft.state }
    const savedFinal = { ...saved, sav: final }
    draft.acceptSaved(savedFinal, final)
    document.value = savedFinal
    await nextTick()
    expect(draft.isDirty.value).toBe(false)
  })

  it('loads another record and ignores an old response while refreshing pristine drafts', async () => {
    const { document, draft } = setup()
    draft.state.diagnosis = 'Ancienne saisie'
    const old = { ...document.value, sav: { ...draft.state } }
    document.value = { ...document.value, id: 2 }
    await nextTick()
    draft.acceptSaved(old, old.sav)
    expect(draft.state.diagnosis).toBe('Initial')
    expect(draft.isDirty.value).toBe(false)
    document.value = { ...document.value, sav: { ...document.value.sav, diagnosis: 'Actualisé' } }
    await nextTick()
    expect(draft.state.diagnosis).toBe('Actualisé')
  })
})
