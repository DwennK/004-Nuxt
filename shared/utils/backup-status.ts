import type { BackupStatus } from '../types/backups'

export const backupErrors: Record<string, string> = {
  dropbox_auth: 'Connexion Dropbox expirée ou refusée. Reconnectez le compte.',
  dropbox_upload: 'Dropbox a refusé le transfert. Vérifiez l’espace disponible et réessayez.',
  encryption_key: 'La clé de connexion a changé. Reconnectez Dropbox.',
  integrity_mismatch: 'Le contrôle d’intégrité du transfert a échoué.',
  timeout: 'Le délai de sauvegarde a été dépassé.',
  interrupted: 'La sauvegarde a été interrompue. Relancez-la.',
  backup_too_large: 'La base dépasse 16 Mo ou son journal dépasse la limite de transfert. Le système de sauvegarde doit être adapté.',
  turso_export: 'Turso n’a pas fourni un export SQLite complet. Réessayez.',
  sqlite_integrity: 'Le contrôle d’intégrité de la base SQLite a échoué.',
  export_stale: 'L’export Turso ne contient pas encore les dernières modifications. Réessayez.',
  export_failed: 'L’export de la base a échoué. Réessayez.',
  empty_dump: 'L’export est vide.'
}

/** Reading an error never acknowledges it: only a newer successful run resolves it. */
export function unresolvedBackupFailure(status: BackupStatus | null) {
  return status?.runs.find(run => run.status === 'failed' && (!status.lastSuccess || run.startedAt > status.lastSuccess.startedAt)) ?? null
}
