import { sql, type SQL } from 'drizzle-orm'

// Applied to the reference column only: a customer or article containing TIC- stays searchable.
export function dossierReferenceSearch(column: SQL) {
  return sql<string>`case when upper(substr(${column}, 1, 4)) = 'TIC-'
    then 'dos-' || lower(substr(${column}, 5)) else lower(${column}) end`
}

export function dossierReferenceTerm(term: string | undefined) {
  return term?.replace(/^tic-/, 'dos-')
}
