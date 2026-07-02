export function getRequestErrorMessage(error: unknown) {
  if (!error || typeof error !== 'object') {
    return null
  }

  const maybeError = error as {
    data?: { message?: unknown, statusMessage?: unknown }
    message?: unknown
  }

  if (typeof maybeError.data?.message === 'string') {
    return maybeError.data.message
  }

  if (typeof maybeError.data?.statusMessage === 'string') {
    return maybeError.data.statusMessage
  }

  if (typeof maybeError.message === 'string') {
    return maybeError.message
  }

  return null
}
