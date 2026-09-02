import type { SentMailStatus } from '~~/shared/types/pos'
import { businessTimeZone } from './pos'

export function formatSentMailListDate(value: string) {
  return new Intl.DateTimeFormat('fr-CH', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    timeZone: businessTimeZone
  }).format(new Date(value))
}

export function getSentMailStatusMeta(status: SentMailStatus) {
  switch (status) {
    case 'sending': return { label: 'En cours', color: 'neutral' as const }
    case 'sent': return { label: 'Envoyé', color: 'info' as const }
    case 'delivered': return { label: 'Distribué', color: 'success' as const }
    case 'delivery_delayed': return { label: 'Retardé', color: 'warning' as const }
    case 'bounced': return { label: 'Rejeté', color: 'error' as const }
    case 'rejected': return { label: 'Refusé', color: 'error' as const }
    case 'failed': return { label: 'Échec', color: 'error' as const }
    default: return { label: 'À vérifier', color: 'warning' as const }
  }
}
