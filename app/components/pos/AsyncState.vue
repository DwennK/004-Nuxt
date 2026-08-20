<script setup lang="ts">
const props = withDefaults(defineProps<{
  loading?: boolean
  error?: unknown
  empty?: boolean
  loadingLabel?: string
  loadingRows?: number
  errorTitle?: string
  errorDescription?: string
  retryLabel?: string
  emptyIcon?: string
  emptyTitle?: string
  emptyDescription?: string
}>(), {
  loading: false,
  empty: false,
  loadingLabel: 'Chargement en cours',
  loadingRows: 5,
  errorTitle: 'Chargement impossible',
  errorDescription: 'Les données n’ont pas pu être chargées. Réessayez dans un instant.',
  retryLabel: 'Réessayer',
  emptyIcon: 'i-lucide-inbox',
  emptyTitle: 'Aucun résultat',
  emptyDescription: 'Aucune donnée ne correspond aux critères actuels.'
})

const emit = defineEmits<{
  retry: []
}>()

function getStringProperty(value: object, key: string) {
  if (!(key in value)) {
    return null
  }

  const property = Reflect.get(value, key)

  return typeof property === 'string' && property.trim()
    ? property
    : null
}

function getErrorMessage(value: unknown) {
  if (typeof value === 'string' && value.trim()) {
    return value
  }

  if (!value || typeof value !== 'object') {
    return null
  }

  if ('data' in value && value.data && typeof value.data === 'object') {
    const responseMessage = getStringProperty(value.data, 'statusMessage')

    if (responseMessage) {
      return responseMessage
    }
  }

  return getStringProperty(value, 'statusMessage')
}

const hasError = computed(() => props.error !== null && props.error !== undefined && props.error !== false)
const resolvedErrorDescription = computed(() => getErrorMessage(props.error) || props.errorDescription)
</script>

<template>
  <div
    v-if="props.loading"
    role="status"
    aria-live="polite"
    :aria-label="props.loadingLabel"
    class="space-y-3 px-4 py-6"
  >
    <span class="sr-only">{{ props.loadingLabel }}</span>
    <slot name="loading">
      <USkeleton
        v-for="index in props.loadingRows"
        :key="index"
        aria-hidden="true"
        class="h-10 w-full"
      />
    </slot>
  </div>

  <UAlert
    v-else-if="hasError"
    icon="i-lucide-triangle-alert"
    color="error"
    variant="soft"
    :title="props.errorTitle"
    :description="resolvedErrorDescription"
    aria-live="assertive"
  >
    <template #actions>
      <UButton
        type="button"
        :label="props.retryLabel"
        :aria-label="props.retryLabel"
        icon="i-lucide-refresh-cw"
        color="error"
        variant="soft"
        size="xs"
        @click="emit('retry')"
      />
    </template>
  </UAlert>

  <UEmpty
    v-else-if="props.empty"
    :icon="props.emptyIcon"
    :title="props.emptyTitle"
    :description="props.emptyDescription"
  >
    <template v-if="$slots['empty-actions']" #actions>
      <slot name="empty-actions" />
    </template>
  </UEmpty>

  <slot v-else />
</template>
