import type { BackupStatus } from '~~/shared/types/backups'
import { unresolvedBackupFailure } from '~~/shared/utils/backup-status'

/** One shared status for the sidebar, settings tabs and backup page. */
export function useBackupStatus() {
  const { can } = useCapabilities()
  const { user } = useUserSession()
  const data = useState<BackupStatus | null>('backup-status', () => null)
  const error = useState('backup-status-error', () => false)
  const request = useState<string | null>('backup-status-request', () => null)
  const pending = computed(() => request.value !== null)
  const failure = computed(() => can('administration:manage') ? unresolvedBackupFailure(data.value) : null)
  const hasAlert = computed(() => can('administration:manage') && (error.value || !!failure.value))

  function reset() {
    data.value = null
    error.value = false
    request.value = null
  }

  async function refresh() {
    if (!can('administration:manage')) {
      reset()
      return
    }
    if (pending.value) return
    const id = crypto.randomUUID()
    const owner = user.value?.id
    request.value = id
    try {
      const status = await $fetch<BackupStatus>('/api/settings/backups', { timeout: 15_000, retry: 0 })
      if (request.value !== id || user.value?.id !== owner || !can('administration:manage')) return
      data.value = status
      error.value = false
    } catch {
      // Retain a known failure during outages; an unreadable status also needs attention.
      if (request.value === id && user.value?.id === owner && can('administration:manage')) error.value = true
    } finally {
      if (request.value === id) request.value = null
    }
  }

  return { data, error, pending, failure, hasAlert, refresh, reset }
}
