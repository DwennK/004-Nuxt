export const savStatuses = ['received', 'diagnosis', 'in_progress', 'ready', 'delivered', 'cancelled'] as const
export const savCoverages = ['pending', 'warranty', 'goodwill', 'billable'] as const
export type SavStatus = typeof savStatuses[number]
export type SavCoverage = typeof savCoverages[number]
export const savStatusLabels: Record<SavStatus, string> = {
  received: 'Reçu', diagnosis: 'En diagnostic', in_progress: 'En intervention',
  ready: 'Prêt', delivered: 'Remis au client', cancelled: 'Annulé'
}
export const savCoverageLabels: Record<SavCoverage, string> = {
  pending: 'À déterminer', warranty: 'Sous garantie', goodwill: 'Geste commercial', billable: 'Payant'
}
export interface SavDetails {
  sourceDocumentId: number | null
  repair: string
  reason: string
  coverage: SavCoverage
  status: SavStatus
  diagnosis: string
  work: string
  receivedAt: string
  deliveredAt: string | null
}
