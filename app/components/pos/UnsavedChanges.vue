<script setup lang="ts">
import { createUnsavedReminder } from '~~/shared/utils/unsaved-reminder'
import type { DossierClientState } from '~/utils/dossier-client'

const props = defineProps<{
  dirty: boolean
  snapshot: string
  saving?: boolean
  to?: string
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
const toastId = `unsaved-reminder-${sourceId}`
const menuOpen = ref(false)
const menuItems = computed(() => [
  { label: 'Copier les saisies', icon: 'i-lucide-copy', onSelect: copy },
  { label: muted.value ? 'Rappel coupé' : 'Couper le rappel', icon: 'i-lucide-bell-off', disabled: muted.value, onSelect: mute },
  ...(!$dossiers.audio.enabled
    ? [{ label: 'Activer / tester le son', icon: 'i-lucide-volume-2', onSelect: () => $dossiers.enableSound(true) }]
    : [])
])
let timer: ReturnType<typeof setInterval> | undefined
watch(
  () => [props.dirty, props.snapshot] as const,
  ([dirty]) => {
    reminder.change(dirty, Date.now())
    toast.remove(toastId)
    if (!dirty) {
      muted.value = false
      menuOpen.value = false
    }
    if (dossier?.value) $dossiers.setDirty(dossier.value, sourceId, dirty)
  },
  { immediate: true }
)

function mute() {
  reminder.mute()
  muted.value = true
  toast.remove(toastId)
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
    if (!props.saving && reminder.tick(Date.now())) {
      $dossiers.beep()
      toast.add({
        id: toastId,
        title: 'Modifications non enregistrées',
        description: 'Pensez à enregistrer votre saisie.',
        icon: 'i-lucide-save',
        color: 'warning',
        duration: 8000,
        actions: [{ label: 'Couper le rappel', color: 'neutral', variant: 'outline', onClick: mute }]
      })
    }
  }, 1000)
  window.addEventListener('beforeunload', beforeUnload)
})
onBeforeUnmount(() => {
  clearInterval(timer)
  toast.remove(toastId)
  window.removeEventListener('beforeunload', beforeUnload)
  if (dossier?.value) $dossiers.setDirty(dossier.value, sourceId, false)
})
</script>

<template>
  <ClientOnly>
    <Teleport :to="to || 'body'" :disabled="!to" defer>
      <span class="inline-flex h-8 w-8 shrink-0 items-center sm:w-36">
        <span role="status" class="sr-only">{{ dirty ? 'Modifications non enregistrées' : '' }}</span>
        <UDropdownMenu
          v-if="dirty"
          v-model:open="menuOpen"
          :items="menuItems"
          :content="{ align: 'end' }"
        >
          <UButton
            type="button"
            data-testid="unsaved-changes"
            size="sm"
            color="neutral"
            variant="ghost"
            icon="i-lucide-circle-dot"
            :label="saving ? 'Enregistrement…' : 'Non enregistré'"
            aria-label="Modifications non enregistrées : options"
            title="Non enregistré · Options"
            :ui="{ leadingIcon: to ? 'text-current' : 'text-warning', label: 'hidden sm:inline' }"
            class="h-8 w-full justify-center px-1"
          />
        </UDropdownMenu>
      </span>
    </Teleport>
    <template #fallback>
      <span v-if="!to" class="inline-flex h-8 w-8 shrink-0 sm:w-36" />
    </template>
  </ClientOnly>
</template>
