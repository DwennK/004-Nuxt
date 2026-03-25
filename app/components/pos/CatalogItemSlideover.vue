<script setup lang="ts">
import type { CatalogItemType } from '~~/shared/types/pos'

type CatalogItemPayload = {
  name: string
  sku: string
  type: CatalogItemType
  defaultPrice: number
  vatRate: number
  isActive: boolean
}

defineProps<{
  title: string
  description: string
  submitLabel: string
  initialValue?: Partial<CatalogItemPayload>
}>()

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  save: [payload: CatalogItemPayload]
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
