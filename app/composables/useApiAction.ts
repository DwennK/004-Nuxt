export type ApiActionOptions = {
  success?: string
  errorTitle?: string
  errorDescription?: string
}

export type ApiActionResult<T> = { ok: true, data: T } | { ok: false, error: unknown }

export function useApiAction() {
  const toast = useToast()

  return async function runApiAction<T>(
    action: () => Promise<T>,
    options: ApiActionOptions = {}
  ): Promise<ApiActionResult<T>> {
    try {
      const data = await action()

      if (options.success) {
        toast.add({ title: options.success, color: 'success' })
      }

      return { ok: true, data }
    } catch (error) {
      toast.add({
        title: options.errorTitle || 'Une erreur est survenue',
        description: getRequestErrorMessage(error) || options.errorDescription || 'Vérifiez la connexion puis réessayez.',
        color: 'error'
      })

      return { ok: false, error }
    }
  }
}
