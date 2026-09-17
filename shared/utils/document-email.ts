import { documentTypeLabels } from '../constants/pos'
import type { DocumentDetail } from '../types/pos'
import type { CompanySettingsRecord } from '../types/settings'

export function getDocumentEmailSubject(document: Pick<DocumentDetail, 'type' | 'documentNumber'>) {
  return `Votre ${(document.type === 'sav' ? 'SAV' : documentTypeLabels[document.type].toLowerCase())} ${document.documentNumber}`
}

export function getDocumentEmailMessage(
  document: Pick<DocumentDetail, 'type' | 'documentNumber'>,
  company: Pick<CompanySettingsRecord, 'name'>
) {
  return [
    `Bonjour,`,
    '',
    `Veuillez trouver en pièce jointe votre ${(document.type === 'sav' ? 'SAV' : documentTypeLabels[document.type].toLowerCase())} ${document.documentNumber}.`,
    '',
    `Cordialement,`,
    company.name
  ].join('\n')
}

export function getDocumentPdfFilename(document: Pick<DocumentDetail, 'documentNumber'>) {
  return `${document.documentNumber}.pdf`
}
