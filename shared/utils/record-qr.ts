export type RecordQrType = 'tickets' | 'documents'

export type RecordScanResult
  = | { kind: 'record', path: string }
    | { kind: 'search', query: string }
    | { kind: 'unsupported' }

export function buildRecordQrUrl(type: RecordQrType, id: number, appOrigin: string) {
  const origin = new URL(appOrigin)
  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password) {
    throw new Error('Adresse de l’application invalide')
  }
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error('Identifiant de document invalide')
  }
  const path = type === 'tickets' ? 'dossiers' : type
  return new URL(`/${path}/${id}`, origin.origin).href
}

export function parseRecordScan(value: string, appOrigin: string): RecordScanResult {
  const query = value.trim()
  // Payment QR payloads and foreign links must never become navigation targets.
  if (/^SPC[\r\n]/.test(query)) return { kind: 'unsupported' }
  if (!/^[a-z][a-z\d+.-]*:/i.test(query) && !query.startsWith('//') && !query.startsWith('/')) {
    return { kind: 'search', query }
  }

  try {
    const url = new URL(query)
    const match = /^\/(tickets|dossiers|documents)\/([1-9]\d*)\/?$/.exec(url.pathname)
    if (!['http:', 'https:'].includes(url.protocol)
      || url.origin !== new URL(appOrigin).origin
      || url.username || url.password || url.search || url.hash
      || !match || !Number.isSafeInteger(Number(match[2]))) {
      return { kind: 'unsupported' }
    }
    const path = match[1] === 'tickets' ? 'dossiers' : match[1]
    return { kind: 'record', path: `/${path}/${match[2]}` }
  } catch {
    return { kind: 'unsupported' }
  }
}
