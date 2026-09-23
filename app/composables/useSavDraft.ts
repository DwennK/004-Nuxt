import { computed, reactive, ref, watch, type Ref } from 'vue'
import type { SavDetails } from '~~/shared/types/sav'
import type { DocumentDetail } from '~~/shared/types/pos'

type SavDocument = Pick<DocumentDetail, 'id' | 'sav'>

export function useSavDraft(document: Ref<SavDocument | undefined>) {
  const defaults: SavDetails = {
    sourceDocumentId: null, repair: '', reason: '', coverage: 'pending', status: 'received',
    diagnosis: '', work: '', receivedAt: new Date().toISOString(), deliveredAt: null
  }
  const state = reactive<SavDetails>({ ...defaults })
  const baseline = ref(JSON.stringify(state))
  const isDirty = computed(() => JSON.stringify(state) !== baseline.value)

  function reset() {
    Object.assign(state, defaults, document.value?.sav)
    baseline.value = JSON.stringify(state)
  }

  watch(document, (next, previous) => {
    if (next?.id === previous?.id && isDirty.value) return
    reset()
  }, { immediate: true })

  function acceptSaved(saved: SavDocument, submitted: SavDetails) {
    if (saved.id !== document.value?.id || !saved.sav) return
    const persisted = { ...defaults, ...saved.sav }
    // A response acknowledges only submitted fields; keep any later local edits.
    for (const key of Object.keys(persisted) as Array<keyof SavDetails>) {
      if (state[key] === submitted[key]) Object.assign(state, { [key]: persisted[key] })
    }
    baseline.value = JSON.stringify(persisted)
  }

  return { state, isDirty, acceptSaved, reset }
}
