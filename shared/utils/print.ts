import type { DocumentType, PrintProfile } from '../types/pos'

const documentPrintProfiles: Record<DocumentType, PrintProfile[]> = {
  quote: ['a4'],
  customer_order: ['a4'],
  invoice: ['a4', 'thermal']
}

const ticketPrintProfiles: PrintProfile[] = ['thermal']

export const printProfileLabels: Record<PrintProfile, string> = {
  a4: 'A4',
  thermal: 'Thermique 80 mm'
}

export function getDocumentPrintProfiles(type: DocumentType | null | undefined) {
  if (!type) {
    return []
  }

  return [...documentPrintProfiles[type]]
}

export function supportsDocumentPrintProfile(
  type: DocumentType | null | undefined,
  profile: PrintProfile
) {
  return getDocumentPrintProfiles(type).includes(profile)
}

export function getTicketPrintProfiles() {
  return [...ticketPrintProfiles]
}

export function supportsTicketPrintProfile(profile: PrintProfile) {
  return ticketPrintProfiles.includes(profile)
}
