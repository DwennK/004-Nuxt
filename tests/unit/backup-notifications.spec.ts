import { computed, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BackupRun, BackupStatus } from '../../shared/types/backups'
import { unresolvedBackupFailure } from '../../shared/utils/backup-status'
import { useBackupStatus } from '../../app/composables/useBackupStatus'

const run = (status: BackupRun['status'], startedAt: number): BackupRun => ({
  id: String(startedAt), status, startedAt, trigger: 'scheduled', completedAt: null, bytes: null, path: null, errorCode: status === 'failed' ? 'backup_too_large' : null
})
const status = (runs: BackupRun[], lastSuccess: BackupRun | null = null): BackupStatus => ({
  configured: true, schemaReady: true, connected: true, accountEmail: null, dailyEnabled: true, running: runs.some(run => run.status === 'running'), runs, lastSuccess
})
const user = ref({ id: 1 })
let admin = true

beforeEach(() => {
  const state = new Map()
  admin = true
  user.value = { id: 1 }
  vi.stubGlobal('computed', computed)
  vi.stubGlobal('useState', (key: string, init: () => unknown) => {
    if (!state.has(key)) state.set(key, ref(init()))
    return state.get(key)
  })
  vi.stubGlobal('useCapabilities', () => ({ can: () => admin }))
  vi.stubGlobal('useUserSession', () => ({ user }))
})

describe('persistent backup notification', () => {
  it('retains failure during a retry and resolves only after a later success', () => {
    const failed = run('failed', 20)
    expect(unresolvedBackupFailure(status([run('running', 30), failed], run('success', 10)))).toEqual(failed)
    expect(unresolvedBackupFailure(status([run('success', 40), failed], run('success', 40)))).toBeNull()
    expect(unresolvedBackupFailure(status([run('running', 30)]))).toBeNull()
  })

  it('shares an error between navigation and page without acknowledging it on access', async () => {
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue(status([run('failed', 20)])))
    const navigation = useBackupStatus()
    await navigation.refresh()
    const page = useBackupStatus()
    expect(page.hasAlert.value).toBe(true)
    expect(navigation.failure.value?.startedAt).toBe(20)
    await page.refresh()
    expect(navigation.hasAlert.value).toBe(true)
  })

  it('shows an unreadable status and retains the last failure until recovery', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(status([run('failed', 20)]))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(status([run('success', 30)], run('success', 30)))
    vi.stubGlobal('$fetch', fetch)
    const notification = useBackupStatus()
    await notification.refresh()
    await notification.refresh()
    expect(notification.error.value).toBe(true)
    expect(notification.failure.value?.startedAt).toBe(20)
    await notification.refresh()
    expect(notification.hasAlert.value).toBe(false)
  })

  it('alerts on a first failed status request, even without cached history', async () => {
    vi.stubGlobal('$fetch', vi.fn().mockRejectedValue(new Error('unavailable')))
    const notification = useBackupStatus()
    await notification.refresh()
    expect(notification.hasAlert.value).toBe(true)
    expect(notification.data.value).toBeNull()
  })

  it('deduplicates concurrent refreshes and ignores responses after account changes', async () => {
    let resolve!: (value: BackupStatus) => void
    const fetch = vi.fn(() => new Promise<BackupStatus>((done) => {
      resolve = done
    }))
    vi.stubGlobal('$fetch', fetch)
    const notification = useBackupStatus()
    const first = notification.refresh()
    await useBackupStatus().refresh()
    expect(fetch).toHaveBeenCalledTimes(1)
    user.value = { id: 2 }
    notification.reset()
    resolve(status([run('failed', 20)]))
    await first
    expect(notification.data.value).toBeNull()
  })

  it('does not fetch or expose backup status to a non-administrator', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('$fetch', fetch)
    const notification = useBackupStatus()
    notification.data.value = status([run('failed', 20)])
    admin = false
    await notification.refresh()
    expect(fetch).not.toHaveBeenCalled()
    expect(notification.hasAlert.value).toBe(false)
    expect(notification.data.value).toBeNull()
  })
})
