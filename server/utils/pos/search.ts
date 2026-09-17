import { sql, type SQLWrapper } from 'drizzle-orm'
import { foldSearchText } from '~~/shared/utils/search'

// SQLite LOWER/LIKE only fold ASCII case. GLOB character classes let the
// database match accented Latin letters before ordering/pagination, without
// changing stored names, fetching whole tables or requiring an extension.
const letterVariants = new Map<string, string>()
for (const [start, end] of [[0x41, 0x7a], [0xc0, 0x24f], [0x1e00, 0x1eff]] as const) {
  for (let code: number = start; code <= end; code++) {
    const character = String.fromCodePoint(code)
    const folded = foldSearchText(character)
    if (/^[a-z]$/.test(folded)) {
      letterVariants.set(folded, (letterVariants.get(folded) ?? '') + character)
    }
  }
}

function searchPattern(value: string, like: boolean) {
  return Array.from(foldSearchText(value), (character) => {
    const variants = letterVariants.get(character)
    if (variants) return `[${variants}]`
    if (like && character === '%') return '*'
    if (like && character === '_') return '?'
    // Keep GLOB syntax literal; only existing LIKE wildcards retain meaning.
    if (character === '*') return '[*]'
    if (character === '?') return '[?]'
    if (character === '[') return '[[]'
    return character
  }).join('')
}

export function searchLike(column: SQLWrapper, pattern: string) {
  return sql`${column} glob ${searchPattern(pattern, true)}`
}

export function searchEquals(column: SQLWrapper, value: string) {
  return sql`${column} glob ${searchPattern(value, false)}`
}
