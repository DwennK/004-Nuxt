import type { SentMailStatus } from '~~/shared/types/pos'

export function getSentMailStatusMeta(status: SentMailStatus) {
  switch (status) {
    case 'delivered':
      return { label: 'Distribué', color: 'success' as const }
    case 'opened':
      return { label: 'Ouvert', color: 'primary' as const }
    case 'clicked':
      return { label: 'Cliqué', color: 'primary' as const }
    case 'sent':
      return { label: 'Envoyé', color: 'info' as const }
    case 'queued':
      return { label: 'En file', color: 'neutral' as const }
    case 'scheduled':
      return { label: 'Planifié', color: 'neutral' as const }
    case 'delivery_delayed':
      return { label: 'Retardé', color: 'warning' as const }
    case 'bounced':
      return { label: 'Rejeté', color: 'error' as const }
    case 'complained':
      return { label: 'Signalé', color: 'error' as const }
    case 'rendering_failure':
      return { label: 'Échec rendu', color: 'error' as const }
    case 'canceled':
      return { label: 'Annulé', color: 'neutral' as const }
    case 'suppressed':
      return { label: 'Supprimé', color: 'warning' as const }
    default:
      return { label: 'Inconnu', color: 'neutral' as const }
  }
}
