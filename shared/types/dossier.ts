export type DossierTarget = { kind: 'ticket' | 'document' | 'payment', id: number }
export type DossierSnapshot = { key: string, revision: number }
export type DossierProof = DossierSnapshot & { token: string }
export type DossierPresence = { tabId: string, userId: number, name: string, station: string, dirty: boolean }
export type DossierStatus = DossierSnapshot & {
  owner: DossierPresence | null
  peers: DossierPresence[]
  token: string | null
  generation: number
  expiresAt: number
}
export const DOSSIER_HEARTBEAT_MS = 15_000
export const DOSSIER_LEASE_MS = 90_000
export const UNSAVED_REMINDER_MS = 300_000
