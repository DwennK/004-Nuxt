import type { TicketEventKind } from '../types/pos'

// Only old automatic titles are adapted; employee notes and custom titles stay intact.
export function dossierEventLabel(kind: TicketEventKind, label: string) {
  if (kind === 'ticket_created' && label === 'Ticket ouvert') return 'Dossier ouvert'
  if (kind === 'ticket_closed' && label === 'Ticket clôturé') return 'Dossier clôturé'
  if (kind === 'ticket_status_changed' && label === 'Ticket annulé') return 'Dossier annulé'
  return label
}
