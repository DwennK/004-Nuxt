/** Fold accents and case for comparisons without changing the displayed text. */
export function foldSearchText(value: string | null | undefined) {
  return (value ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}
