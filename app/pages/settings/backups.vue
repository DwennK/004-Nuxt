<script setup lang="ts">
import type { BackupRun, BackupStatus } from '~~/shared/types/backups'

const { can } = useCapabilities()
const toast = useToast()
const route = useRoute()
const router = useRouter()
const allowed = computed(() => can('administration:manage'))
const { data, error, refresh, pending } = await useFetch<BackupStatus>('/api/settings/backups', { immediate: allowed.value })
const busy = ref<'backup' | 'connect' | 'disconnect' | 'schedule' | null>(null)
const disconnectOpen = ref(false)
const ready = computed(() => data.value?.configured && data.value?.schemaReady)
const running = computed(() => busy.value === 'backup' || data.value?.running)
const errors: Record<string, string> = {
  dropbox_auth: 'Connexion Dropbox expirée ou refusée. Reconnectez le compte.',
  dropbox_upload: 'Dropbox a refusé le transfert. Vérifiez l’espace disponible et réessayez.',
  encryption_key: 'La clé de connexion a changé. Reconnectez Dropbox.',
  integrity_mismatch: 'Le contrôle d’intégrité du transfert a échoué.',
  timeout: 'Le délai de sauvegarde a été dépassé.',
  interrupted: 'La sauvegarde a été interrompue. Relancez-la.',
  backup_too_large: 'La base ou son journal dépasse la capacité de cet export.',
  turso_export: 'Turso n’a pas fourni un export SQLite complet. Réessayez.',
  sqlite_integrity: 'Le contrôle d’intégrité de la base SQLite a échoué.',
  export_stale: 'L’export Turso ne contient pas encore les dernières modifications. Réessayez.',
  export_failed: 'L’export de la base a échoué. Réessayez.',
  empty_dump: 'L’export est vide.'
}

function date(value: number) {
  return new Intl.DateTimeFormat('fr-CH', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Zurich' }).format(value)
}

function size(bytes: number | null) {
  return bytes === null ? '—' : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} Ko` : `${(bytes / 1024 / 1024).toFixed(1)} Mo`
}

function status(run: BackupRun) {
  return { running: 'En cours', success: 'Réussie', failed: 'Échouée' }[run.status]
}

async function act(action: NonNullable<typeof busy.value>, callback: () => Promise<void>) {
  busy.value = action
  try {
    await callback()
  } catch {
    toast.add({ title: 'Action impossible', description: 'Vérifiez la connexion et l’état des sauvegardes, puis réessayez.', color: 'error' })
  } finally {
    busy.value = null
    await refresh()
  }
}

function connect() {
  return act('connect', async () => {
    const result = await $fetch('/api/settings/backups/dropbox/connect', { method: 'POST' })
    await navigateTo(result.url, { external: true })
  })
}

function backup() {
  return act('backup', async () => {
    await $fetch('/api/settings/backups/run', { method: 'POST', timeout: 11 * 60 * 1000, retry: 0 })
    toast.add({ title: 'Sauvegarde enregistrée dans Dropbox', color: 'success', icon: 'i-lucide-circle-check' })
  })
}

function schedule(enabled: boolean) {
  return act('schedule', async () => {
    await $fetch('/api/settings/backups', { method: 'PATCH', body: { dailyEnabled: enabled } })
    toast.add({ title: enabled ? 'Sauvegarde quotidienne activée' : 'Sauvegarde quotidienne désactivée', color: 'success' })
  })
}

function disconnect() {
  return act('disconnect', async () => {
    await $fetch('/api/settings/backups/dropbox/disconnect', { method: 'POST' })
    disconnectOpen.value = false
    toast.add({ title: 'Dropbox déconnecté', color: 'success' })
  })
}

onMounted(async () => {
  if (route.query.dropbox) {
    const connected = route.query.dropbox === 'connected'
    toast.add({ title: connected ? 'Dropbox connecté' : 'Connexion Dropbox non terminée', description: connected ? 'Vous pouvez lancer une sauvegarde ou activer la sauvegarde quotidienne.' : 'Relancez la connexion depuis cette page.', color: connected ? 'success' : 'warning' })
    await router.replace({ path: route.path, query: {} })
  }
})

useIntervalFn(() => {
  if (allowed.value && (running.value || data.value?.dailyEnabled)) void refresh()
}, 10_000)
</script>

<template>
  <div class="space-y-5">
    <UAlert
      v-if="!allowed"
      title="Accès administrateur requis"
      icon="i-lucide-lock-keyhole"
      color="warning"
      variant="subtle"
    />
    <template v-else>
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 class="text-xl font-semibold text-highlighted">
            Sauvegardes
          </h1>
          <p class="mt-1 text-sm text-muted">
            Une copie complète de la base de données dans votre Dropbox.
          </p>
        </div>
        <UButton
          label="Sauvegarder maintenant"
          icon="i-lucide-database-backup"
          :loading="busy === 'backup'"
          :disabled="!ready || !data?.connected || !!busy || running"
          @click="backup"
        />
      </div>

      <UAlert
        v-if="error"
        title="Impossible de charger les sauvegardes"
        description="Réessayez dans quelques instants."
        color="error"
        variant="subtle"
        :actions="[{ label: 'Réessayer', onClick: () => refresh() }]"
      />
      <UAlert
        v-else-if="data && (!data.schemaReady || !data.configured)"
        title="Configuration initiale à terminer"
        description="La sauvegarde sera disponible dès que la connexion Dropbox sera configurée sur le serveur."
        icon="i-lucide-settings-2"
        color="warning"
        variant="subtle"
      />
      <UAlert
        v-if="running"
        title="Sauvegarde en cours"
        :description="busy === 'backup' ? 'Gardez cette page ouverte jusqu’à la confirmation du transfert.' : 'Le transfert vers Dropbox est en cours.'"
        icon="i-lucide-loader-circle"
        color="info"
        variant="subtle"
      />

      <div class="grid gap-4 md:grid-cols-2">
        <UCard :ui="{ body: 'space-y-4' }">
          <div class="flex items-center justify-between gap-3">
            <h2 class="font-semibold text-highlighted">
              Dropbox
            </h2>
            <UBadge :label="data?.connected ? 'Connecté' : 'Non connecté'" :color="data?.connected ? 'success' : 'neutral'" variant="subtle" />
          </div>
          <p class="min-h-5 break-all text-sm text-muted">
            {{ data?.accountEmail || 'Connectez le compte qui recevra les sauvegardes.' }}
          </p>
          <div class="flex flex-wrap gap-2">
            <UButton
              :label="data?.connected ? 'Reconnecter Dropbox' : 'Connecter Dropbox'"
              icon="i-lucide-cloud"
              color="neutral"
              variant="outline"
              :loading="busy === 'connect'"
              :disabled="!ready || !!busy || running"
              @click="connect"
            />
            <UButton
              v-if="data?.connected"
              label="Déconnecter"
              color="neutral"
              variant="ghost"
              :disabled="!!busy || running"
              @click="disconnectOpen = true"
            />
          </div>
          <p class="text-xs text-muted">
            Fichiers SQLite (.db) datés, conservés dans le dossier Dropbox de l’application.
          </p>
        </UCard>

        <UCard :ui="{ body: 'space-y-4' }">
          <div class="flex items-center justify-between gap-3">
            <h2 class="font-semibold text-highlighted">
              Sauvegarde quotidienne
            </h2>
            <USwitch
              :model-value="data?.dailyEnabled ?? false"
              aria-label="Activer la sauvegarde quotidienne"
              :disabled="!ready || !data?.connected || !!busy"
              :loading="busy === 'schedule'"
              @update:model-value="schedule"
            />
          </div>
          <p class="text-sm text-muted">
            Chaque nuit, même lorsque le POS est fermé.
          </p>
          <p class="text-sm">
            03:00 en hiver · 04:00 en été <span class="text-muted">(heure suisse)</span>
          </p>
          <p class="text-xs text-muted">
            Les copies précédentes sont conservées. Aucune suppression automatique.
          </p>
        </UCard>
      </div>

      <div class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-default px-4 py-3 text-sm">
        <span class="text-muted">Dernière sauvegarde réussie</span>
        <span class="font-medium">{{ data?.lastSuccess ? `${date(data.lastSuccess.startedAt)} · ${size(data.lastSuccess.bytes)}` : 'Aucune sauvegarde pour le moment' }}</span>
      </div>

      <UCard :ui="{ body: 'p-0 sm:p-0', header: 'px-4 py-3 sm:px-4' }">
        <template #header>
          <div class="flex items-center justify-between">
            <h2 class="font-semibold text-highlighted">
              Historique
            </h2>
            <UButton
              label="Actualiser"
              icon="i-lucide-refresh-cw"
              color="neutral"
              variant="ghost"
              size="sm"
              :loading="pending"
              @click="refresh()"
            />
          </div>
        </template>
        <p v-if="!data?.runs.length" class="px-4 py-8 text-center text-sm text-muted">
          Vos 20 dernières sauvegardes apparaîtront ici.
        </p>
        <ul v-else class="max-h-96 divide-y divide-default overflow-y-auto">
          <li v-for="run in data.runs" :key="run.id" class="space-y-1 px-4 py-3">
            <div class="flex flex-wrap items-center justify-between gap-2 text-sm">
              <div class="flex flex-wrap items-center gap-2">
                <span class="font-medium">{{ date(run.startedAt) }}</span>
                <span class="text-muted">{{ run.trigger === 'manual' ? 'Manuelle' : 'Automatique' }}</span>
              </div>
              <div class="flex items-center gap-3">
                <span class="text-muted">{{ size(run.bytes) }}</span>
                <UBadge :label="status(run)" :color="run.status === 'success' ? 'success' : run.status === 'failed' ? 'error' : 'info'" variant="subtle" />
              </div>
            </div>
            <p v-if="run.path" class="break-all text-xs text-muted">
              {{ run.path.slice(1) }}
            </p>
            <p v-if="run.errorCode" class="text-xs text-error">
              {{ errors[run.errorCode] || 'La sauvegarde n’a pas abouti.' }}
            </p>
          </li>
        </ul>
      </UCard>

      <UModal v-model:open="disconnectOpen" title="Déconnecter Dropbox ?" description="Les sauvegardes automatiques seront arrêtées. Les fichiers déjà enregistrés dans Dropbox seront conservés.">
        <template #footer>
          <UButton
            label="Annuler"
            color="neutral"
            variant="outline"
            @click="disconnectOpen = false"
          />
          <UButton
            label="Déconnecter"
            color="error"
            :loading="busy === 'disconnect'"
            @click="disconnect"
          />
        </template>
      </UModal>
    </template>
  </div>
</template>
