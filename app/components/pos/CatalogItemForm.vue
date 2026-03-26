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
  formId?: string
  layout?: 'compact' | 'page'
  showSubmit?: boolean
  submitLabel?: string
}>(), {
  initialValue: () => ({}),
  formId: undefined,
  layout: 'compact',
  showSubmit: true,
  submitLabel: 'Enregistrer l’article'
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
  name: z.string().trim().min(1, 'Le nom est obligatoire'),
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
    :id="formId"
    :schema="schema"
    :state="state"
    :class="props.layout === 'page' ? 'space-y-4' : 'space-y-5'"
    @submit="onSubmit"
  >
    <template v-if="props.layout === 'page'">
      <UPageCard
        title="Identification"
        description="Définissez le libellé commercial et la catégorie de l’article pour qu’il soit facile à retrouver au comptoir."
        variant="subtle"
      >
        <UFormField
          label="Nom de l’article"
          name="name"
          description="Nom affiché dans le catalogue, les tickets et les documents."
          orientation="horizontal"
          required
          class="flex max-sm:flex-col justify-between items-start gap-4"
        >
          <UInput v-model="state.name" class="w-full lg:max-w-sm" />
        </UFormField>
        <USeparator />
        <UFormField
          label="SKU"
          name="sku"
          description="Référence interne, code-barres ou rayon. Optionnel mais utile pour retrouver vite un article."
          hint="Optionnel"
          orientation="horizontal"
          class="flex max-sm:flex-col justify-between items-start gap-4"
        >
          <UInput v-model="state.sku" class="w-full lg:max-w-sm" />
        </UFormField>
        <USeparator />
        <UFormField
          label="Type"
          name="type"
          description="Choisit comment l’article sera présenté dans les flux de vente et réparation."
          orientation="horizontal"
          required
          class="flex max-sm:flex-col justify-between items-start gap-4"
        >
          <USelect
            v-model="state.type"
            :items="typeItems"
            value-key="value"
            class="w-full lg:max-w-sm"
          />
        </UFormField>
      </UPageCard>

      <UPageCard
        title="Tarification"
        description="Le prix est saisi en CHF TTC puis stocké en centimes pour garder des calculs fiables."
        variant="subtle"
      >
        <div class="grid gap-4 md:grid-cols-2">
          <UFormField
            label="Prix par défaut"
            name="defaultPrice"
            :description="`Aperçu actuel: ${preview}`"
            required
          >
            <UInputNumber
              v-model="state.defaultPrice"
              :min="0"
              :step="0.05"
              :format-options="{ style: 'currency', currency: 'CHF', currencyDisplay: 'narrowSymbol' }"
              class="w-full"
            />
          </UFormField>

          <UFormField
            label="TVA"
            name="vatRate"
            description="Appliquée par défaut aux nouvelles lignes de document."
            required
          >
            <UInputNumber
              v-model="state.vatRate"
              :min="0"
              :step="0.1"
              class="w-full"
            />
          </UFormField>
        </div>
      </UPageCard>

      <UPageCard
        title="Disponibilité"
        description="Contrôlez si l’article reste visible et vendable dans l’interface opérateur."
        variant="subtle"
      >
        <UFormField
          label="Statut"
          name="isActive"
          description="Désactivez un article pour le conserver en historique sans le proposer aux opérateurs."
          orientation="horizontal"
          class="flex max-sm:flex-col justify-between items-start gap-4"
        >
          <USwitch v-model="state.isActive" label="Actif et vendable" />
        </UFormField>
      </UPageCard>
    </template>

    <template v-else>
      <UFormField label="Nom de l’article" name="name" required>
        <UInput v-model="state.name" class="w-full" />
      </UFormField>

      <div class="grid gap-4 md:grid-cols-2">
        <UFormField label="SKU" name="sku" hint="Optionnel">
          <UInput v-model="state.sku" class="w-full" />
        </UFormField>

        <UFormField label="Type" name="type" required>
          <USelect
            v-model="state.type"
            :items="typeItems"
            value-key="value"
            class="w-full"
          />
        </UFormField>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <UFormField
          label="Prix par défaut (CHF, TTC)"
          name="defaultPrice"
          :description="preview"
          required
        >
          <UInputNumber
            v-model="state.defaultPrice"
            :min="0"
            :step="0.05"
            :format-options="{ style: 'currency', currency: 'CHF', currencyDisplay: 'narrowSymbol' }"
            class="w-full"
          />
        </UFormField>

        <UFormField label="TVA" name="vatRate" required>
          <UInputNumber
            v-model="state.vatRate"
            :min="0"
            :step="0.1"
            class="w-full"
          />
        </UFormField>
      </div>

      <UFormField label="Statut" name="isActive">
        <USwitch v-model="state.isActive" label="Actif et vendable" />
      </UFormField>
    </template>

    <div v-if="props.showSubmit" class="flex justify-end">
      <UButton type="submit" :label="submitLabel" icon="i-lucide-save" />
    </div>
  </UForm>
</template>
