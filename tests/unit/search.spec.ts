import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { sql } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { searchEquals, searchLike } from '../../server/utils/pos/search'
import { foldSearchText } from '../../shared/utils/search'

const client = createClient({ url: 'file::memory:' })
const db = drizzle({ client })
afterAll(() => client.close())

describe('accent-insensitive search comparisons', () => {
  it.each([
    ['Théodore', 'theodore'], ['THEODORE', 'theodore'], ['The\u0301odore', 'theodore'],
    ['àâä ç éèêë îï ñ ôö ùûü ÿ', 'aaa c eeee ii n oo uuu y'],
    ['D’André + test@example.ch', 'd’andre + test@example.ch']
  ])('folds %s without removing punctuation', (input, expected) => {
    expect(foldSearchText(input)).toBe(expected)
  })

  it.each(['Théodore', 'Theodore', 'THÉODORE', 'THEODORE', 'The\u0301odore'])('matches both stored spellings for %s', async (term) => {
    for (const value of ['Théodore', 'Theodore', 'THÉODORE', 'THEODORE']) {
      const [row] = await db.all<{ exact: number, partial: number }>(sql`select
        ${searchEquals(sql`${value}`, term)} as exact,
        ${searchLike(sql`${`Client ${value} Dupont`}`, `%${term}%`)} as partial`)
      expect(row).toEqual({ exact: 1, partial: 1 })
    }
  })

  it.each(['[Écran]', 'A*B', 'A?B', 'D\'André', '100%_off', 'A]B'])('preserves literal characters in exact searches: %s', async (value) => {
    const [row] = await db.all<{ exact: number, unrelated: number }>(sql`select
      ${searchEquals(sql`${value}`, foldSearchText(value))} as exact,
      ${searchEquals(sql`'AXXXB'`, foldSearchText(value))} as unrelated`)
    expect(row).toEqual({ exact: 1, unrelated: 0 })
  })

  it('preserves LIKE wildcards, literal GLOB characters and exact versus prefix matches', async () => {
    const [row] = await db.all<Record<string, number>>(sql`select
      ${searchLike(sql`'Théodore'`, 'th_od%')} as wildcard,
      ${searchLike(sql`'Théodore'`, 'theo%')} as prefix,
      ${searchEquals(sql`'Théodore'`, 'theo')} as exact,
      ${searchLike(sql`'ABC'`, '%A*C%')} as literal,
      ${searchLike(sql`'A*C'`, '%A*C%')} as star,
      ${searchEquals(sql`'Theodore'`, '\' OR 1=1 --')} as injection`)
    expect(row).toEqual({ wildcard: 1, prefix: 1, exact: 0, literal: 0, star: 1, injection: 0 })
  })
})
