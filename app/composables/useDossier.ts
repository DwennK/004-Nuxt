import type { DossierTarget } from '~~/shared/types/dossier'

export function useDossier(
  target: MaybeRefOrGetter<DossierTarget | null>,
  options: {
    edit?: MaybeRefOrGetter<boolean>
    record?: MaybeRefOrGetter<unknown>
  } = {}
) {
  const { $dossiers } = useNuxtApp()
  const current = computed(() => {
    const value = toValue(target)
    return value ? $dossiers.state(value) : null
  })
  const blocked = computed(
    () =>
      !!current.value
      && (current.value.lost
        || current.value.offline
        || !current.value.status
        || (!!current.value.status.owner && !current.value.token))
  )
  watch(
    () => toValue(options.record),
    (value) => {
      const targetValue = toValue(target)
      if (targetValue) $dossiers.snapshot(targetValue, value)
    },
    { immediate: true }
  )
  let mounted = false
  async function enter() {
    const value = current.value
    if (!value) return
    value.active++
    value.intent = toValue(options.edit) ? 'edit' : 'operate'
    try {
      await $dossiers.session(
        value,
        toValue(options.edit) ? 'acquire' : 'observe'
      )
    } catch {
      /* The persistent banner displays the connection failure. */
    }
  }
  onMounted(() => {
    mounted = true
    void enter()
  })
  watch(current, (next, previous) => {
    if (!mounted || next === previous) return
    if (previous) void $dossiers.leave(previous)
    void enter()
  })
  onBeforeUnmount(() => {
    if (current.value) void $dossiers.leave(current.value)
  })
  return { current, blocked, manager: $dossiers }
}
