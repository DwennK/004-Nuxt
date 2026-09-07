import { ref } from 'vue'
import type { ApiActionOptions, ApiActionResult } from './useApiAction'

/** Track one form submission without allowing overlapping writes. */
export function useFormAction() {
  const isSaving = ref(false)
  const saveError = ref<string | null>(null)
  const runApiAction = useApiAction()

  function clearSaveError() {
    saveError.value = null
  }

  async function save<T>(action: () => Promise<T>, options: ApiActionOptions = {}): Promise<ApiActionResult<T> | undefined> {
    if (isSaving.value) return
    isSaving.value = true
    clearSaveError()
    try {
      const errorDescription = options.errorDescription || 'Vérifiez les informations saisies et la connexion puis réessayez.'
      const result = await runApiAction(action, { errorTitle: 'Enregistrement impossible', ...options, errorDescription })
      if (!result.ok) {
        saveError.value = getRequestErrorMessage(result.error) || errorDescription
      }
      return result
    } finally {
      isSaving.value = false
    }
  }

  return { isSaving, saveError, save, clearSaveError }
}
