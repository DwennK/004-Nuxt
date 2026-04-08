<script setup lang="ts">
import type { CatalogItemInput } from '~~/shared/types/pos'

defineProps<{
  title: string
  description: string
  submitLabel: string
  initialValue?: Partial<CatalogItemInput>
}>()

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  save: [payload: CatalogItemInput]
}>()
</script>

<template>
  <USlideover
    v-model:open="open"
    :title="title"
    :description="description"
    side="right"
    :ui="{ content: 'max-w-2xl' }"
  >
    <template #body>
      <PosCatalogItemForm
        :initial-value="initialValue"
        :submit-label="submitLabel"
        @save="emit('save', $event)"
      />
    </template>
  </USlideover>
</template>
