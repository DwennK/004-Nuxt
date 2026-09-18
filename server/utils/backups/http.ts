import type { H3Event } from 'h3'
import { useSession } from 'h3'
import { requireAdminSessionUser } from '../auth/session'
import { backupContext, protectBackupRequest } from './service'

export async function withBackupAdmin<T>(event: H3Event, action: (context: ReturnType<typeof backupContext>, userId: number) => Promise<T>) {
  const user = await requireAdminSessionUser(event)
  protectBackupRequest(event)
  const context = backupContext(event)
  try {
    return await action(context, user.id)
  } finally {
    context.client.close()
  }
}

export function backupOAuthSession(event: H3Event, password: string) {
  return useSession<{ state?: string, userId?: number }>(event, {
    name: 'pos-backup-oauth',
    password,
    maxAge: 600,
    sessionHeader: false,
    cookie: { httpOnly: true, secure: !import.meta.dev, sameSite: 'lax', path: '/api/settings/backups/dropbox' }
  })
}
