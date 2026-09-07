<script setup lang="ts">
import type { CatalogItemInput } from '~~/shared/types/pos'

defineProps<{
  title: string
  description: string
  saving?: boolean
  saveError?: string | null
  submitLabel: string
  initialValue?: Partial<CatalogItemInput>
}>()

const open = defineModel<boolean>('open', { default: false })
const focusReturn = usePosFocusReturn(open)

const emit = defineEmits<{
  save: [payload: CatalogItemInput]
}>()
</script>

<template>
  <USlideover
    v-model:open="open"
    :content="focusReturn"
    :title="title"
    :dismissible="!saving"
    :close="!saving"
    :description="description"
    side="right"
    :ui="{ content: 'max-w-2xl' }"
  >
    <template #body>
      <PosCatalogItemForm
        :initial-value="initialValue"
        :saving="saving"
        :save-error="saveError"
        :submit-label="submitLabel"
        @save="emit('save', $event)"
      />
    </template>
  </USlideover>
</template>
