export function getRequestErrorMessage(error: unknown) {
  if (!error || typeof error !== 'object') {
    return null
  }

  const maybeError = error as {
    data?: { message?: unknown, statusMessage?: unknown }
    message?: unknown
  }

  // Prefer the server's user-facing explanation over fetch wrappers and SQL details.
  const candidates = [maybeError.data?.statusMessage, maybeError.data?.message, maybeError.message]
  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || !candidate.trim()) continue
    if (/failed query|SQLITE_|SQL_|libsql|\bparams:|\bat .+\(.+:\d+:\d+\)/i.test(candidate)) continue
    if (/^(internal server error|server error)$/i.test(candidate.trim())) continue
    if (/failed to fetch|fetch failed|networkerror|network request failed|<no response>/i.test(candidate)) {
      return 'Connexion interrompue. Vérifiez le réseau puis réessayez.'
    }
    if (/^\[(GET|POST|PUT|PATCH|DELETE)\]/.test(candidate)) continue
    return candidate
  }

  return null
}
