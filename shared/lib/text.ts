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

export function nameInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean)
  return [words[0]?.[0], words.length > 1 ? words.at(-1)?.[0] : ''].join('').toUpperCase() || '?'
}
