import type { TicketRecord } from '../types/pos'
import type { TicketIntakePrintModel, TicketPrintCode } from '../types/print'

export function parseAccessPattern(value: string) {
  if (!value.toLowerCase().startsWith('pattern')) return []

  return value.replace(/pattern/i, '').split(/[^0-9]+/)
    .map(Number)
    .filter(point => Number.isInteger(point) && point >= 1 && point <= 9)
    .filter((point, index, points) => points.indexOf(point) === index)
}

export function buildTicketIntakePrintModel(ticket: Pick<TicketRecord, 'type' | 'brand' | 'model' | 'issueDescription' | 'accessCode' | 'simCode'>): TicketIntakePrintModel {
  const codes: TicketPrintCode[] = []
  if (ticket.accessCode) {
    codes.push({ label: 'Déverrouillage', value: ticket.accessCode, patternPoints: parseAccessPattern(ticket.accessCode) })
  }
  if (ticket.simCode) {
    codes.push({ label: 'SIM (PIN/PUK)', value: ticket.simCode, patternPoints: [] })
  }

  return {
    title: ticket.type === 'sale' ? 'Vente' : 'Appareil',
    deviceLabel: ticket.type === 'sale' ? null : [ticket.brand, ticket.model].filter(Boolean).join(' ').trim() || 'Appareil non renseigné',
    description: ticket.issueDescription || null,
    codes
  }
}
