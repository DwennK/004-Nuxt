import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createError } from 'h3'
import { buildSmartphoneReservationsCsv, parseSmartphoneReservationsCsv } from '../../server/utils/smartphone-reservations-csv'
import type { SmartphoneReservationRequest } from '../../shared/types/smartphones'

const header = 'Nom;Telephone;Modele;Stockage;DateDemande;Etat;Remarques'
const reservation: SmartphoneReservationRequest = {
  id: 1,
  name: 'Alice',
  phone: '0791234567',
  model: 'iPhone 15',
  storage: '128',
  requestedAt: '2026-09-08',
  status: 'contacted',
  notes: 'Rappeler demain'
}

beforeEach(() => {
  vi.stubGlobal('createError', createError)
})

describe('smartphone reservation CSV imports', () => {
  it('preserves the existing export format and business values', () => {
    const csv = buildSmartphoneReservationsCsv([reservation])
    expect(csv).toBe(`${header}\nAlice;0791234567;iPhone 15;128;2026-09-08;Contacte;Rappeler demain`)
    const { id: _id, ...expected } = reservation
    expect(parseSmartphoneReservationsCsv(csv)).toEqual([expected])
  })

  it('accepts BOM, French aliases, CRLF, empty rows and optional columns', () => {
    const csv = '\uFEFFNom,Téléphone,Modèle,Stockage\r\n\r\nAlice,0041791234567,iPhone,00128\r\n,,,\r\n'
    expect(parseSmartphoneReservationsCsv(csv)).toEqual([
      expect.objectContaining({ name: 'Alice', phone: '0041791234567', storage: '00128', status: 'pending', notes: '' })
    ])
  })

  it('handles quoted delimiters, escaped quotes and multiline notes', () => {
    const csv = `${header}\nAlice;0791234567;iPhone;128;2026-09-08;Vendu;"Écran; couleur ""bleue""\nÀ rappeler"`
    expect(parseSmartphoneReservationsCsv(csv)[0]).toMatchObject({
      status: 'sold', notes: 'Écran; couleur "bleue"\nÀ rappeler'
    })
  })

  it('detects commas without counting semicolons inside quoted headers', () => {
    const csv = 'Nom,Telephone,Modele,Stockage,"Extra;;;;;;"\nAlice,0791234567,iPhone,128,texte'
    expect(parseSmartphoneReservationsCsv(csv)[0]?.phone).toBe('0791234567')
  })

  it.each([
    `${header}\nAlice;0791234567;iPhone;128;2026-09-08;Vendu;"note non fermée`,
    `${header}\nAlice;0791234567;iPhone;128;2026-09-08;Vendu;"note"invalide`
  ])('rejects malformed quotes instead of silently importing data', (csv) => {
    expect(() => parseSmartphoneReservationsCsv(csv)).toThrow(/CSV invalide/)
  })

  it.each([
    'Alice;0791234567;iPhone;128;2026-09-08;Vendu',
    'Alice;0791234567;iPhone;128;2026-09-08;Vendu;note;extra'
  ])('rejects inconsistent column counts', (row) => {
    expect(() => parseSmartphoneReservationsCsv(`${header}\n${row}`)).toThrow()
  })

  it.each(['', ' \n\n', ';;;\n;;;'])('rejects empty files', (csv) => {
    expect(() => parseSmartphoneReservationsCsv(csv)).toThrow('Fichier CSV vide')
  })

  it('preserves required header, field, date and status validation', () => {
    expect(() => parseSmartphoneReservationsCsv('Nom;Telephone;Modele\nAlice;0791234567;iPhone')).toThrow('Colonnes CSV manquantes')
    expect(() => parseSmartphoneReservationsCsv(`${header}\n;0791234567;iPhone;128;2026-09-08;Vendu;`)).toThrow('colonnes obligatoires vides')
    expect(() => parseSmartphoneReservationsCsv(`${header}\nAlice;0791234567;iPhone;128;08.09.2026;Vendu;`)).toThrow('date invalide')
    expect(() => parseSmartphoneReservationsCsv(`${header}\nAlice;0791234567;iPhone;128;2026-09-08;inconnu;`)).toThrow('etat invalide')
  })

  it('accepts a header-only template without creating reservations', () => {
    expect(parseSmartphoneReservationsCsv(header)).toEqual([])
  })
})

describe('smartphone reservation CSV exports', () => {
  it.each(['=1+1', '+41791234567', '-1', '@SUM(A1)', '  =1+1', '\ttexte', '\rtexte'])('keeps formula protection for %j', (value) => {
    const csv = buildSmartphoneReservationsCsv([{ ...reservation, name: value }])
    expect(csv.split('\n')[1]?.startsWith(`'${value};`)).toBe(true)
  })

  it('round-trips quoted names and multiline notes', () => {
    const row = { ...reservation, name: 'Alice; "Atelier"', notes: 'Première ligne\nDeuxième; ligne' }
    expect(parseSmartphoneReservationsCsv(buildSmartphoneReservationsCsv([row]))[0]).toMatchObject({ name: row.name, notes: row.notes })
  })
})
