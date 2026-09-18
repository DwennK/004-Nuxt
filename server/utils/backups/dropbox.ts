import { binaryChunks } from './binary'

export class BackupError extends Error {
  constructor(public code: string) {
    super(code)
  }
}

export type DropboxConfig = {
  appKey: string
  appSecret: string
  redirectUri: string
  encryptionKey: string
}

export async function dropboxToken(config: DropboxConfig, fields: Record<string, string>) {
  const response = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    body: new URLSearchParams({ client_id: config.appKey, client_secret: config.appSecret, ...fields }),
    signal: AbortSignal.timeout(30_000)
  })
  if (!response.ok) throw new BackupError('dropbox_auth')
  const result = await response.json() as { access_token?: string, refresh_token?: string }
  if (!result.access_token) throw new BackupError('dropbox_auth')
  return result as { access_token: string, refresh_token?: string }
}

export async function dropboxAccount(accessToken: string) {
  const response = await fetch('https://api.dropboxapi.com/2/users/get_current_account', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(30_000)
  })
  if (!response.ok) throw new BackupError('dropbox_auth')
  const result = await response.json() as { email?: string }
  if (!result.email) throw new BackupError('dropbox_auth')
  return result.email
}

function hex(bytes: Uint8Array) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

async function uploadCall(endpoint: string, token: string, args: object, body: Uint8Array<ArrayBuffer>, signal: AbortSignal) {
  const response = await fetch(`https://content.dropboxapi.com/2/files/upload_session/${endpoint}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/octet-stream',
      'Dropbox-API-Arg': JSON.stringify(args)
    },
    body,
    signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)])
  })
  if (!response.ok) throw new BackupError(response.status === 401 ? 'dropbox_auth' : 'dropbox_upload')
  return response
}

export async function uploadBackup(source: AsyncIterable<Uint8Array>, token: string, path: string, signal: AbortSignal) {
  let sessionId: string | undefined
  let bytes = 0
  const hashes: Uint8Array[] = []
  for await (const chunk of binaryChunks(source)) {
    signal.throwIfAborted()
    bytes += chunk.length
    if (bytes > 256 * 1024 * 1024) throw new BackupError('backup_too_large')
    hashes.push(new Uint8Array(await crypto.subtle.digest('SHA-256', chunk)))
    if (!sessionId) {
      const response = await uploadCall('start', token, { close: false }, chunk, signal)
      sessionId = ((await response.json()) as { session_id: string }).session_id
      if (!sessionId) throw new BackupError('dropbox_upload')
    } else {
      await uploadCall('append_v2', token, { cursor: { session_id: sessionId, offset: bytes - chunk.length }, close: false }, chunk, signal)
    }
  }
  if (!sessionId) throw new BackupError('empty_dump')
  const combined = new Uint8Array(hashes.length * 32)
  hashes.forEach((hash, index) => combined.set(hash, index * 32))
  const contentHash = hex(new Uint8Array(await crypto.subtle.digest('SHA-256', combined)))
  // Only publish after the complete, validated SQLite file has been transferred.
  const response = await uploadCall('finish', token, {
    cursor: { session_id: sessionId, offset: bytes },
    commit: { path, mode: 'add', autorename: false, mute: true, strict_conflict: true }
  }, new Uint8Array(0), signal)
  const metadata = await response.json() as { size?: number, content_hash?: string, path_display?: string }
  if (metadata.size !== bytes || metadata.content_hash !== contentHash) throw new BackupError('integrity_mismatch')
  return { bytes, contentHash, path: metadata.path_display || path }
}
