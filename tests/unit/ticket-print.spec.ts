import { describe, expect, it, vi } from 'vitest'
import { PDFDocument, PDFPage } from 'pdf-lib'
import { generateDocumentPdf } from '../../server/utils/documents/pdf'
import { buildDocumentA4PrintModel } from '../../shared/utils/document-print'
import { buildTicketIntakePrintModel, parseAccessPattern } from '../../shared/utils/ticket-print'
import { printCompany, printDocument, printTicket } from '../fixtures/document-print'

describe('shared printed intake', () => {
  it('preserves codes including leading zeros and omits missing fields', () => {
    expect(buildTicketIntakePrintModel(printTicket({ accessCode: '0012', simCode: null })).codes)
      .toEqual([{ label: 'Déverrouillage', value: '0012', patternPoints: [] }])
    expect(buildTicketIntakePrintModel(printTicket({ accessCode: null, simCode: null })).codes).toEqual([])
  })

  it('parses only unlock patterns, preserving order and ignoring invalid or repeated points', () => {
    expect(parseAccessPattern('Pattern 3-2-1-1-0-10-9')).toEqual([3, 2, 1, 9])
    expect(parseAccessPattern('123456')).toEqual([])
    expect(buildTicketIntakePrintModel(printTicket({ simCode: 'pattern123' })).codes[1]?.patternPoints).toEqual([])
  })

  it.each(['quote', 'customer_order', 'sav'] as const)('prints the shared codes above the content on %s', async (type) => {
    const document = printDocument({ type, ticket: printTicket(), ticketId: 1 })
    const text = vi.spyOn(PDFPage.prototype, 'drawText')
    await generateDocumentPdf(document, printCompany(), 'https://pos.example.test')
    const device = text.mock.calls.find(([value]) => value === 'Apple iPhone 14')?.[1]
    const unlock = text.mock.calls.find(([value]) => value === '123456')?.[1]
    const sim = text.mock.calls.find(([value]) => value === '696969')?.[1]
    expect(device).toBeDefined()
    expect(unlock).toBeDefined()
    expect(sim).toBeDefined()
    expect(unlock!.x).toBeGreaterThan(device!.x!)
    expect(sim!.x).toBeGreaterThan(unlock!.x!)
    expect(sim!.y).toBe(unlock!.y)
    if (type !== 'sav') {
      const line = text.mock.calls.find(([value]) => value === 'Prestation de test')?.[1]
      expect(line!.y).toBeLessThan(unlock!.y!)
    }
  })

  it('does not add codes to invoices or documents without a dossier', () => {
    expect(buildDocumentA4PrintModel(printDocument({ ticket: printTicket() }), printCompany()).intake).toBeNull()
    expect(buildDocumentA4PrintModel(printDocument({ type: 'quote' }), printCompany()).intake).toBeNull()
  })

  it('keeps SAV device identifiers without duplicating the device block', () => {
    const document = printDocument({ type: 'sav', ticket: printTicket({ imei: '123456789012345' }), sav: {
      sourceDocumentId: null, repair: 'Caméra', reason: 'Image floue', coverage: 'warranty', status: 'received',
      receivedAt: '2026-09-25T08:00:00Z', deliveredAt: null, diagnosis: null, work: null
    } })
    const model = buildDocumentA4PrintModel(document, printCompany())
    expect(model.intake?.description).toBe('123456789012345')
    expect(model.noteBlocks.some(block => block.label === 'Appareil')).toBe(false)
    expect(model.noteBlocks.some(block => block.content === 'Image floue')).toBe(true)
  })

  it('draws the nine-point pattern and preserves long paginated document content', async () => {
    const document = printDocument({ type: 'quote', ticket: printTicket({ accessCode: 'pattern 1-2-3-6-5-4-7-8-9' }) })
    document.lines = Array.from({ length: 65 }, (_, index) => ({ ...document.lines[0]!, id: index + 1, label: `Ligne ${index + 1}` }))
    const circles = vi.spyOn(PDFPage.prototype, 'drawCircle')
    const text = vi.spyOn(PDFPage.prototype, 'drawText')
    const pdf = await PDFDocument.load(await generateDocumentPdf(document, printCompany(), 'https://pos.example.test'))
    expect(circles).toHaveBeenCalledTimes(9)
    expect(pdf.getPageCount()).toBeGreaterThan(1)
    for (const line of document.lines) expect(text.mock.calls.some(([value]) => value === line.label)).toBe(true)
    expect(text.mock.calls.some(([value]) => value === 'pattern 1-2-3-6-5-4-7-8-9')).toBe(false)
  })
})
