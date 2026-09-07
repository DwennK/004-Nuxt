<script setup lang="ts">
import { createUnsavedReminder } from '~~/shared/utils/unsaved-reminder'
import type { DossierClientState } from '~/utils/dossier-client'

const props = defineProps<{
  dirty: boolean
  snapshot: string
  saving?: boolean
}>()
const { $dossiers } = useNuxtApp()
const dossier = inject<ComputedRef<DossierClientState | null> | null>(
  'pos-dossier-state',
  null
)
const sourceId = useId()
const reminder = createUnsavedReminder()
const muted = ref(false)
const toast = useToast()
let timer: ReturnType<typeof setInterval> | undefined
watch(
  () => [props.dirty, props.snapshot] as const,
  ([dirty]) => {
    reminder.change(dirty, Date.now())
    if (!dirty) muted.value = false
    if (dossier?.value) $dossiers.setDirty(dossier.value, sourceId, dirty)
  },
  { immediate: true }
)

function mute() {
  reminder.mute()
  muted.value = true
}
async function copy() {
  try {
    await navigator.clipboard.writeText(props.snapshot)
    toast.add({ title: 'Saisies copiées', color: 'success' })
  } catch {
    toast.add({
      title: 'Copie impossible',
      description: 'Sélectionnez et copiez les champs avant de recharger.',
      color: 'error'
    })
  }
}
function beforeUnload(event: BeforeUnloadEvent) {
  if (!props.dirty) return
  event.preventDefault()
  event.returnValue = ''
}
onBeforeRouteLeave(
  () =>
    !props.dirty
    || window.confirm(
      'Des modifications ne sont pas enregistrées. Quitter sans enregistrer ?'
    )
)
onMounted(() => {
  timer = setInterval(() => {
    if (!props.saving && reminder.tick(Date.now())) $dossiers.beep()
  }, 1000)
  window.addEventListener('beforeunload', beforeUnload)
})
onBeforeUnmount(() => {
  clearInterval(timer)
  window.removeEventListener('beforeunload', beforeUnload)
  if (dossier?.value) $dossiers.setDirty(dossier.value, sourceId, false)
})
</script>

<template>
  <div
    v-if="dirty"
    role="status"
    data-testid="unsaved-changes"
    class="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-warning/40 bg-elevated px-3 py-2 text-sm"
  >
    <UIcon name="i-lucide-save" class="text-warning" />
    <span class="font-semibold text-highlighted">Modifications non enregistrées</span>
    <span class="text-muted">Rappel après 5 min sans saisie</span>
    <div class="ml-auto flex flex-wrap gap-1">
      <UButton
        size="xs"
        color="neutral"
        variant="ghost"
        label="Copier les saisies"
        @click="copy"
      />
      <UButton
        size="xs"
        color="neutral"
        variant="ghost"
        :disabled="muted"
        :label="muted ? 'Rappel coupé' : 'Couper le rappel'"
        @click="mute"
      />
      <UButton
        v-if="!$dossiers.audio.enabled"
        size="xs"
        color="neutral"
        variant="outline"
        label="Activer / tester le son"
        @click="$dossiers.enableSound(true)"
      />
    </div>
  </div>
</template>
