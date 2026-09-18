export type BackupRun = {
  id: string
  trigger: 'manual' | 'scheduled'
  status: 'running' | 'success' | 'failed'
  startedAt: number
  completedAt: number | null
  bytes: number | null
  path: string | null
  errorCode: string | null
}

export type BackupStatus = {
  configured: boolean
  schemaReady: boolean
  connected: boolean
  accountEmail: string | null
  dailyEnabled: boolean
  running: boolean
  runs: BackupRun[]
  lastSuccess: BackupRun | null
}
