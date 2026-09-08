import { parseRecordScan } from '~~/shared/utils/record-qr'

export function useRecordScan(search: Ref<string>, beforeNavigate?: () => void) {
  const appOrigin = useRequestURL().origin
  const toast = useToast()
  let pending = false

  return async function handleRecordScan(value: string) {
    if (pending) return
    const result = parseRecordScan(value, appOrigin)
    if (result.kind === 'search') {
      search.value = result.query
      return
    }
    if (result.kind === 'unsupported') {
      toast.add({ title: 'QR non reconnu', description: 'Scannez le QR « Ouvrir le dossier » ou « Ouvrir le document » de cette application.', color: 'warning' })
      return
    }

    pending = true
    try {
      // Use the existing authenticated endpoint to check existence and access.
      await $fetch(`/api${result.path}`)
      beforeNavigate?.()
      await navigateTo(result.path)
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode
      toast.add({
        title: status === 404 ? 'Fiche introuvable' : status === 401 || status === 403 ? 'Accès à la fiche refusé' : 'Impossible d’ouvrir la fiche',
        description: status === 404 ? 'Ce dossier ou document n’existe plus.' : status === 401 ? 'Reconnectez-vous puis scannez à nouveau.' : status === 403 ? 'Votre compte ne permet pas de consulter cette fiche.' : 'Vérifiez la connexion puis réessayez.',
        color: 'error'
      })
    } finally {
      pending = false
    }
  }
}
