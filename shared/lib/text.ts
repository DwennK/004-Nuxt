export function normalizeOptionalText(value: string | null | undefined) {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim()
  return normalized ? normalized : null
}

export function normalizeRequiredText(value: string) {
  return value.trim()
}

export function splitLegacyName(name: string | null | undefined) {
  const normalized = normalizeOptionalText(name) || 'Customer'
  const parts = normalized.split(/\s+/)

  if (parts.length === 1) {
    return {
      firstName: '',
      lastName: parts[0] || 'Customer'
    }
  }

  return {
    firstName: parts.slice(0, -1).join(' ') || parts[0] || 'Customer',
    lastName: parts[parts.length - 1] || 'Customer'
  }
}
