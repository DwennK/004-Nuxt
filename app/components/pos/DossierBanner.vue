<script setup lang="ts">
import type { DossierClientState } from '~/utils/dossier-client'

const props = defineProps<{ state: DossierClientState | null }>()
const { $dossiers } = useNuxtApp()
const toast = useToast()
const modalOpen = ref(false)
const busy = ref(false)
const error = ref('')
const needsReload = computed(() => props.state?.lost)
const owner = computed(() => props.state?.status?.owner)
const peers = computed(() => props.state?.status?.peers || [])
const retry = computed(() => Object.values($dossiers.retries).find(attempt => attempt.failed && attempt.scopeKeys.includes(props.state?.status?.key || '')))
async function retryPending() {
  if (!retry.value) return
  busy.value = true
  try {
    await retry.value.run()
    toast.add({ title: 'Opération confirmée', description: 'Rechargez la fiche pour consulter le résultat.', color: 'success' })
  } catch (cause) {
    toast.add({ title: 'Vérification impossible', description: getRequestErrorMessage(cause) || 'Réessayez après avoir vérifié la connexion.', color: 'error' })
  } finally {
    busy.value = false
  }
}
const visible = computed(
  () =>
    props.state
    && (props.state.lost
      || retry.value
      || props.state.offline
      || !props.state.status
      || peers.value.length
      || (owner.value && !props.state.token))
)
const title = computed(() =>
  retry.value
    ? 'Résultat de l’opération à vérifier'
    : props.state?.offline
      ? 'Connexion à vérifier · écriture suspendue'
      : needsReload.value
        ? 'Modification suspendue · réservation perdue ou dossier modifié'
        : !props.state?.status
            ? 'Vérification du dossier…'
            : 'Dossier ouvert sur un autre poste'
)
const description = computed(() => {
  const person
    = owner.value && !props.state?.token ? owner.value : peers.value[0]
  return person
    ? `${person.name} · ${person.station}${person.dirty ? ' · saisies non enregistrées' : ''}`
    : 'Vos saisies restent visibles. Copiez-les avant de recharger.'
})

async function confirm() {
  if (!props.state) return
  busy.value = true
  error.value = ''
  try {
    await $dossiers.reload(
      props.state,
      () => refreshNuxtData(),
      !!owner.value && !props.state.token
    )
    modalOpen.value = false
    toast.add({ title: 'Dernière version chargée', color: 'success' })
  } catch (cause) {
    error.value
      = getRequestErrorMessage(cause) || 'Reprise impossible. Réessayez.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <UAlert
    v-if="visible"
    data-testid="dossier-banner"
    :title="title"
    :description="description"
    :color="needsReload || state?.offline ? 'error' : 'warning'"
    icon="i-lucide-monitor-dot"
    class="shrink-0"
  >
    <template #actions>
      <UButton
        v-if="retry"
        size="sm"
        color="neutral"
        label="Vérifier la tentative"
        :loading="busy"
        @click="retryPending"
      />
      <UButton
        v-if="needsReload || state?.offline || (owner && !state?.token)"
        size="sm"
        color="neutral"
        :label="
          owner && !state?.token ? 'Reprendre la main' : 'Recharger la fiche'
        "
        @click="modalOpen = true"
      />
      <UButton
        size="sm"
        color="neutral"
        variant="outline"
        :label="
          $dossiers.audio.enabled ? 'Tester le son' : 'Activer / tester le son'
        "
        @click="$dossiers.enableSound(true)"
      />
    </template>
  </UAlert>
  <UModal
    v-model:open="modalOpen"
    title="Recharger le dossier sur ce poste ?"
    description="La dernière version enregistrée sera chargée. Les saisies non enregistrées restent sur leur poste et ne sont pas transférées. Copiez aussi vos saisies sur ce poste avant de continuer."
  >
    <template #body>
      <UAlert v-if="error" color="error" :title="error" />
      <p v-else class="text-sm text-muted">
        L’autre poste perdra son autorisation d’écriture si vous reprenez la
        main.
      </p>
    </template>
    <template #footer>
      <UButton
        label="Annuler"
        color="neutral"
        variant="ghost"
        @click="modalOpen = false"
      />
      <UButton label="Charger et continuer" :loading="busy" @click="confirm" />
    </template>
  </UModal>
</template>
