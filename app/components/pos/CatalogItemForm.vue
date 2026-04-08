<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import {
  catalogArticleCategories,
  catalogItemTypeLabels,
  catalogItemTypes,
  catalogServiceCategories,
  catalogServiceKindSuggestions
} from '~~/shared/constants/pos'
import type { CatalogItemInput } from '~~/shared/types/pos'
import { formatCurrency } from '~~/shared/utils/pos'

type FormState = {
  name: string
  sku: string
  type: (typeof catalogItemTypes)[number]
  category: string
  brand: string
  model: string
  serviceKind: string
  keywordsText: string
  defaultPrice: number
  vatRate: number
  isActive: boolean
}

const props = withDefaults(defineProps<{
  initialValue?: Partial<CatalogItemInput>
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
  save: [payload: CatalogItemInput]
}>()

const schema = z.object({
  name: z.string().trim().min(1, 'Le nom est obligatoire'),
  sku: z.string().optional().default(''),
  type: z.enum(catalogItemTypes),
  category: z.string().trim().min(1, 'La catégorie est obligatoire'),
  brand: z.string().optional().default(''),
  model: z.string().optional().default(''),
  serviceKind: z.string().optional().default(''),
  keywordsText: z.string().optional().default(''),
  defaultPrice: z.coerce.number().min(0),
  vatRate: z.coerce.number().min(0).max(100),
  isActive: z.boolean().default(true)
}).superRefine((value, ctx) => {
  if (value.type === 'service' && !value.serviceKind.trim()) {
    ctx.addIssue({
      code: 'custom',
      path: ['serviceKind'],
      message: 'Le type d’intervention est obligatoire pour une prestation'
    })
  }
})

type Schema = z.output<typeof schema>

const typeItems = catalogItemTypes.map(type => ({
  label: catalogItemTypeLabels[type],
  value: type
}))

const state = reactive<FormState>({
  name: '',
  sku: '',
  type: 'product',
  category: 'Autre',
  brand: '',
  model: '',
  serviceKind: '',
  keywordsText: '',
  defaultPrice: 0,
  vatRate: 8.1,
  isActive: true
})

watchEffect(() => {
  state.name = props.initialValue.name || ''
  state.sku = props.initialValue.sku || ''
  state.type = props.initialValue.type || 'product'
  state.category = props.initialValue.category || 'Autre'
  state.brand = props.initialValue.brand || ''
  state.model = props.initialValue.model || ''
  state.serviceKind = props.initialValue.serviceKind || ''
  state.keywordsText = props.initialValue.keywords?.join(', ') || ''
  state.defaultPrice = (props.initialValue.defaultPrice ?? 0) / 100
  state.vatRate = props.initialValue.vatRate ?? 8.1
  state.isActive = props.initialValue.isActive ?? true
})

const isService = computed(() => state.type === 'service')
const preview = computed(() => formatCurrency(Math.round((state.defaultPrice || 0) * 100)))
const currentTypeLabel = computed(() => catalogItemTypeLabels[state.type])
const categorySuggestions = computed(() => {
  return isService.value ? catalogServiceCategories : catalogArticleCategories
})
const categoryDescription = computed(() => {
  return isService.value
    ? 'Univers atelier visible dans les tickets et la recherche rapide.'
    : 'Famille de produit utilisée pour structurer les articles vendus.'
})
function applyCategorySuggestion(value: string) {
  state.category = value
}

function applyServiceKindSuggestion(value: string) {
  state.serviceKind = value
}

function parseKeywords(value: string) {
  return Array.from(new Set(
    value
      .split(',')
      .map(keyword => keyword.trim())
      .filter(Boolean)
  ))
}

function onSubmit(event: FormSubmitEvent<Schema>) {
  const isServiceType = event.data.type === 'service'

  emit('save', {
    name: event.data.name.trim(),
    sku: event.data.sku.trim() || null,
    type: event.data.type,
    category: event.data.category.trim(),
    brand: isServiceType ? (event.data.brand.trim() || null) : null,
    model: isServiceType ? (event.data.model.trim() || null) : null,
    serviceKind: isServiceType ? (event.data.serviceKind.trim() || null) : null,
    keywords: isServiceType ? parseKeywords(event.data.keywordsText) : [],
    defaultPrice: Math.round((event.data.defaultPrice || 0) * 100),
    vatRate: event.data.vatRate,
    isActive: event.data.isActive
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
        :description="`Définissez le libellé commercial et le type de ${currentTypeLabel.toLowerCase()} à retrouver rapidement.`"
        variant="subtle"
      >
        <div class="space-y-4">
          <div class="grid gap-4 md:grid-cols-2">
            <UFormField :label="`Nom de la ${currentTypeLabel.toLowerCase()}`" name="name" required>
              <UInput v-model="state.name" class="w-full" />
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
            <UFormField label="SKU" name="sku" hint="Optionnel">
              <UInput v-model="state.sku" class="w-full" />
            </UFormField>

            <UFormField
              label="Catégorie"
              name="category"
              :description="categoryDescription"
              required
            >
              <UInput v-model="state.category" class="w-full" />
            </UFormField>
          </div>

          <div class="flex flex-wrap gap-2">
            <UButton
              v-for="suggestion in categorySuggestions"
              :key="suggestion"
              type="button"
              color="neutral"
              variant="soft"
              size="xs"
              :label="suggestion"
              @click="applyCategorySuggestion(suggestion)"
            />
          </div>
        </div>
      </UPageCard>

      <UPageCard
        v-if="isService"
        title="Contexte prestation"
        description="Structurez la prestation pour alimenter la recherche atelier et préremplir les tickets."
        variant="subtle"
      >
        <div class="space-y-4">
          <div class="grid gap-4 md:grid-cols-2">
            <UFormField label="Marque" name="brand" hint="Recommandé">
              <UInput v-model="state.brand" class="w-full" placeholder="Apple, Samsung..." />
            </UFormField>

            <UFormField label="Modèle" name="model" hint="Optionnel">
              <UInput v-model="state.model" class="w-full" placeholder="iPhone 14, Galaxy S23..." />
            </UFormField>
          </div>

          <UFormField label="Type d’intervention" name="serviceKind" required>
            <UInput v-model="state.serviceKind" class="w-full" placeholder="Remplacement écran" />
          </UFormField>

          <div class="flex flex-wrap gap-2">
            <UButton
              v-for="suggestion in catalogServiceKindSuggestions"
              :key="suggestion"
              type="button"
              color="neutral"
              variant="soft"
              size="xs"
              :label="suggestion"
              @click="applyServiceKindSuggestion(suggestion)"
            />
          </div>

          <UFormField
            label="Mots-clés"
            name="keywordsText"
            hint="Optionnel"
            description="Séparez les variantes de recherche par des virgules."
          >
            <UInput
              v-model="state.keywordsText"
              class="w-full"
              placeholder="iphone 14 ecran, apple 14 screen, oled"
            />
          </UFormField>
        </div>
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
        :description="`Contrôlez si la ${currentTypeLabel.toLowerCase()} reste visible pour les opérateurs.`"
        variant="subtle"
      >
        <UFormField
          label="Statut"
          name="isActive"
          description="Désactivez l’élément pour le conserver en historique sans le proposer aux opérateurs."
          orientation="horizontal"
          class="flex max-sm:flex-col justify-between items-start gap-4"
        >
          <USwitch v-model="state.isActive" label="Actif et vendable" />
        </UFormField>
      </UPageCard>
    </template>

    <template v-else>
      <UFormField :label="`Nom de la ${currentTypeLabel.toLowerCase()}`" name="name" required>
        <UInput v-model="state.name" class="w-full" />
      </UFormField>

      <div class="grid gap-4 md:grid-cols-2">
        <UFormField label="Type" name="type" required>
          <USelect
            v-model="state.type"
            :items="typeItems"
            value-key="value"
            class="w-full"
          />
        </UFormField>

        <UFormField label="SKU" name="sku" hint="Optionnel">
          <UInput v-model="state.sku" class="w-full" />
        </UFormField>
      </div>

      <UFormField
        label="Catégorie"
        name="category"
        :description="categoryDescription"
        required
      >
        <UInput v-model="state.category" class="w-full" />
      </UFormField>

      <div class="flex flex-wrap gap-2">
        <UButton
          v-for="suggestion in categorySuggestions"
          :key="suggestion"
          type="button"
          color="neutral"
          variant="soft"
          size="xs"
          :label="suggestion"
          @click="applyCategorySuggestion(suggestion)"
        />
      </div>

      <template v-if="isService">
        <div class="grid gap-4 md:grid-cols-2">
          <UFormField label="Marque" name="brand" hint="Recommandé">
            <UInput v-model="state.brand" class="w-full" placeholder="Apple, Samsung..." />
          </UFormField>

          <UFormField label="Modèle" name="model" hint="Optionnel">
            <UInput v-model="state.model" class="w-full" placeholder="iPhone 14, Galaxy S23..." />
          </UFormField>
        </div>

        <UFormField label="Type d’intervention" name="serviceKind" required>
          <UInput v-model="state.serviceKind" class="w-full" placeholder="Remplacement écran" />
        </UFormField>

        <div class="flex flex-wrap gap-2">
          <UButton
            v-for="suggestion in catalogServiceKindSuggestions"
            :key="suggestion"
            type="button"
            color="neutral"
            variant="soft"
            size="xs"
            :label="suggestion"
            @click="applyServiceKindSuggestion(suggestion)"
          />
        </div>

        <UFormField
          label="Mots-clés"
          name="keywordsText"
          hint="Optionnel"
          description="Séparez les variantes de recherche par des virgules."
        >
          <UInput
            v-model="state.keywordsText"
            class="w-full"
            placeholder="iphone 14 ecran, apple 14 screen, oled"
          />
        </UFormField>
      </template>

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
