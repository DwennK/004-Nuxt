import type { AuthCapability } from '~~/shared/utils/capabilities'

export function useCapabilities() {
  const { user } = useUserSession()
  const capabilities = computed(() => user.value?.capabilities || [])

  function can(capability: AuthCapability) {
    return capabilities.value.includes(capability)
  }

  return {
    capabilities: readonly(capabilities),
    can
  }
}
