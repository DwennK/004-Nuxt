<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import { catalogItemTypeLabels, catalogItemTypes } from '~~/shared/constants/pos'
import { formatCurrency } from '~~/shared/utils/pos'

const props = withDefaults(defineProps<{
  initialValue?: Partial<{
    name: string | null
    sku: string | null
    type: (typeof catalogItemTypes)[number]
    defaultPrice: number | null
    vatRate: number | null
    isActive: boolean | null
  }>
  submitLabel?: string
}>(), {
  initialValue: () => ({}),
  submitLabel: 'Save item'
})

const emit = defineEmits<{
  save: [payload: {
    name: string
    sku: string
    type: (typeof catalogItemTypes)[number]
    defaultPrice: number
    vatRate: number
    isActive: boolean
  }]
}>()

const schema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  sku: z.string().optional().default(''),
  type: z.enum(catalogItemTypes),
  defaultPrice: z.coerce.number().min(0),
  vatRate: z.coerce.number().min(0).max(100),
  isActive: z.boolean().default(true)
})

type Schema = z.output<typeof schema>

const typeItems = catalogItemTypes.map(type => ({
  label: catalogItemTypeLabels[type],
  value: type
}))

const state = reactive<Schema>({
  name: '',
  sku: '',
  type: 'product',
  defaultPrice: 0,
  vatRate: 8.1,
  isActive: true
})

watchEffect(() => {
  state.name = props.initialValue.name || ''
  state.sku = props.initialValue.sku || ''
  state.type = props.initialValue.type || 'product'
  state.defaultPrice = (props.initialValue.defaultPrice ?? 0) / 100
  state.vatRate = props.initialValue.vatRate ?? 8.1
  state.isActive = props.initialValue.isActive ?? true
})

const preview = computed(() => formatCurrency(Math.round((state.defaultPrice || 0) * 100)))

function onSubmit(event: FormSubmitEvent<Schema>) {
  emit('save', {
    ...event.data,
    defaultPrice: Math.round((event.data.defaultPrice || 0) * 100)
  })
}
</script>

<template>
  <UForm
    :schema="schema"
    :state="state"
    class="space-y-5"
    @submit="onSubmit"
  >
    <UFormField label="Item name" name="name">
      <UInput v-model="state.name" class="w-full" />
    </UFormField>

    <div class="grid gap-4 md:grid-cols-2">
      <UFormField label="SKU" name="sku">
        <UInput v-model="state.sku" class="w-full" />
      </UFormField>

      <UFormField label="Type" name="type">
        <USelectMenu
          v-model="state.type"
          :items="typeItems"
          value-key="value"
          class="w-full"
        />
      </UFormField>
    </div>

    <div class="grid gap-4 md:grid-cols-2">
      <UFormField label="Prix par defaut (CHF, TTC)" name="defaultPrice" :description="preview">
        <UInputNumber
          v-model="state.defaultPrice"
          :min="0"
          :step="0.05"
          :format-options="{ style: 'currency', currency: 'CHF', currencyDisplay: 'narrowSymbol' }"
          class="w-full"
        />
      </UFormField>

      <UFormField label="TVA" name="vatRate">
        <UInputNumber
          v-model="state.vatRate"
          :min="0"
          :step="0.1"
          class="w-full"
        />
      </UFormField>
    </div>

    <UFormField label="Status" name="isActive">
      <USwitch v-model="state.isActive" label="Active and sellable" />
    </UFormField>

    <div class="flex justify-end">
      <UButton type="submit" :label="submitLabel" icon="i-lucide-save" />
    </div>
  </UForm>
</template>
