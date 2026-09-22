<script setup lang="ts">
import type { AddressSuggestion, AddressSuggestionsResponse } from '~~/shared/types/lookups'

const props = withDefaults(defineProps<{
  field: 'address' | 'postalCode' | 'city'
  postalCode?: string
  city?: string
  disabled?: boolean
}>(), { postalCode: '', city: '', disabled: false })

const value = defineModel<string>({ required: true })
const emit = defineEmits<{ select: [suggestion: AddressSuggestion] }>()
const open = ref(false)
const loading = ref(false)
const failed = ref(false)
const suggestions = ref<AddressSuggestion[]>([])
const minimumLength = computed(() => props.field === 'address' ? 3 : 2)

watch([open, value, () => props.postalCode, () => props.city, () => props.disabled], ([isOpen], _previous, onCleanup) => {
  const controller = new AbortController()
  const search = value.value.trim()
  suggestions.value = []
  failed.value = false
  loading.value = false
  if (!isOpen || props.disabled || search.length < minimumLength.value) return

  loading.value = true
  const timer = setTimeout(async () => {
    try {
      const response = await $fetch<AddressSuggestionsResponse>(props.field === 'address' ? '/api/lookups/addresses' : '/api/lookups/localities', {
        query: props.field === 'address'
          ? { search, postalCode: props.postalCode, city: props.city }
          : { search, field: props.field },
        signal: controller.signal,
        retry: 0
      })
      if (!controller.signal.aborted) suggestions.value = response.items
    } catch {
      if (!controller.signal.aborted) failed.value = true
    } finally {
      if (!controller.signal.aborted) loading.value = false
    }
  }, 250)

  onCleanup(() => {
    clearTimeout(timer)
    controller.abort()
  })
})

const items = computed(() => suggestions.value.map(suggestion => ({
  label: suggestion.label,
  onSelect: (event: Event) => {
    event.preventDefault()
    value.value = props.field === 'address' ? suggestion.addressLine1 || value.value : suggestion[props.field]
    emit('select', suggestion)
    open.value = false
  }
})))
</script>

<template>
  <UInputMenu
    v-bind="posInputAttrs"
    v-model="value"
    v-model:open="open"
    mode="autocomplete"
    value-key="label"
    :items="items"
    :disabled="disabled"
    :loading="loading"
    :reset-search-term-on-blur="false"
    ignore-filter
    class="w-full"
    :ui="{ content: 'min-w-[min(22rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)]', itemLabel: 'whitespace-normal', empty: 'px-3 py-2 text-xs' }"
  >
    <template #empty>
      <span role="status">
        {{ loading ? 'Recherche…' : failed ? 'Suggestions indisponibles. Saisie libre.' : value.trim().length < minimumLength ? `Saisissez au moins ${minimumLength} caractères.` : 'Aucune suggestion. Vous pouvez continuer la saisie.' }}
      </span>
    </template>
    <template v-if="field === 'address'" #content-bottom>
      <div class="border-t border-default px-3 py-1.5 text-xs text-muted">
        © Données : <a
          href="https://www.swisstopo.admin.ch/fr/repertoire-officiel-des-adresses-de-batiments"
          target="_blank"
          rel="noopener noreferrer"
          class="hover:underline"
        >swisstopo</a>
      </div>
    </template>
  </UInputMenu>
</template>
