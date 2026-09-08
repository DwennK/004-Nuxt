import { describe, expect, it } from 'vitest'
import { dossierEventLabel } from '../../shared/utils/dossier-labels'

describe('historical dossier labels', () => {
  it('adapts only known automatic titles without replacing arbitrary text', () => {
    expect(dossierEventLabel('ticket_created', 'Ticket ouvert')).toBe('Dossier ouvert')
    expect(dossierEventLabel('ticket_closed', 'Ticket clôturé')).toBe('Dossier clôturé')
    expect(dossierEventLabel('ticket_status_changed', 'Ticket annulé')).toBe('Dossier annulé')
    expect(dossierEventLabel('ticket_note_added', 'Ticket ouvert')).toBe('Ticket ouvert')
    expect(dossierEventLabel('ticket_created', 'Ticket spécial du client')).toBe('Ticket spécial du client')
  })
})
