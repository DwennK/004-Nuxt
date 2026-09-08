<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import {
  catalogArticleCategories,
  catalogItemTypeLabels,
  catalogItemTypes,
  catalogRepairCategories,
  catalogServiceCategories,
  catalogServiceKindSuggestions
} from '~~/shared/constants/pos'
import type { CatalogItemInput, CatalogMobileSentrix } from '~~/shared/types/pos'
import { catalogMobileSentrixSchema } from '~~/shared/validation/pos'
import { formatCurrency } from '~~/shared/utils/pos'

type FormState = {
  name: string
  sku: string
  mobileSentrix: CatalogMobileSentrix
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
  saving?: boolean
  saveError?: string | null
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
  mobileSentrix: catalogMobileSentrixSchema,
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
  if ((value.type === 'repair' || value.type === 'service') && !value.serviceKind.trim()) {
    ctx.addIssue({
      code: 'custom',
      path: ['serviceKind'],
      message: value.type === 'repair'
        ? 'Le type d’intervention est obligatoire pour une réparation'
        : 'La nature du service est obligatoire'
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
  mobileSentrix: emptyMobileSentrix(),
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
  state.mobileSentrix = { ...(props.initialValue.mobileSentrix || emptyMobileSentrix()) }
  state.type = props.initialValue.type || 'product'
  state.category = props.initialValue.category
    || (state.type === 'repair' ? 'iPhone' : state.type === 'service' ? 'Diagnostic' : 'Autre')
  state.brand = props.initialValue.brand || ''
  state.model = props.initialValue.model || ''
  state.serviceKind = props.initialValue.serviceKind || ''
  state.keywordsText = props.initialValue.keywords?.join(', ') || ''
  state.defaultPrice = (props.initialValue.defaultPrice ?? 0) / 100
  state.vatRate = props.initialValue.vatRate ?? 8.1
  state.isActive = props.initialValue.isActive ?? true
})

const isRepair = computed(() => state.type === 'repair')
const mobileSentrixStatuses = [
  { label: 'Non associée', value: 'unlinked' },
  { label: 'Référence sélectionnée', value: 'matched' },
  { label: 'Variante à choisir', value: 'variant_required' },
  { label: 'Aucune correspondance', value: 'not_found' }
]

function emptyMobileSentrix(): CatalogMobileSentrix {
  return { status: 'unlinked', sku: null, productId: null, url: null, note: null }
}

watch(() => state.mobileSentrix.status, (status) => {
  if (status !== 'matched') {
    state.mobileSentrix.sku = null
    state.mobileSentrix.productId = null
    state.mobileSentrix.url = null
  }
})
const isService = computed(() => state.type === 'service')
const isCatalogService = computed(() => state.type === 'service' || state.type === 'repair')
const preview = computed(() => formatCurrency(Math.round((state.defaultPrice || 0) * 100)))
const currentTypeLabel = computed(() => catalogItemTypeLabels[state.type])
const currentItemNameLabel = computed(() => {
  if (state.type === 'product') {
    return 'Nom de l’article'
  }

  return state.type === 'repair' ? 'Nom de la réparation' : 'Nom du service'
})
const categorySuggestions = computed(() => {
  if (isRepair.value) {
    return catalogRepairCategories
  }

  if (isService.value) {
    return catalogServiceCategories
  }

  return catalogArticleCategories
})
const categoryDescription = computed(() => {
  if (isRepair.value) {
    return 'Univers appareil utilisé pour structurer les réparations atelier.'
  }

  if (isService.value) {
    return 'Famille de service utilisée pour structurer les prestations génériques.'
  }

  return 'Famille de produit utilisée pour structurer les articles vendus.'
})

watch(() => state.type, (type) => {
  if (type === 'repair' && (!state.category || state.category === 'Autre')) {
    state.category = 'iPhone'
  }

  if (type === 'service' && (!state.category || state.category === 'Autre' || state.category === 'iPhone')) {
    state.category = 'Diagnostic'
  }
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
  if (props.saving) return
  const isRepairType = event.data.type === 'repair'
  const isServiceType = event.data.type === 'service'
  const isCatalogServiceType = isRepairType || isServiceType

  emit('save', {
    name: event.data.name.trim(),
    sku: event.data.sku.trim() || null,
    ...(isRepairType && (props.initialValue.mobileSentrix || event.data.mobileSentrix.status !== 'unlinked' || event.data.mobileSentrix.note)
      ? { mobileSentrix: event.data.mobileSentrix }
      : {}),
    type: event.data.type,
    category: event.data.category.trim(),
    brand: isRepairType ? (event.data.brand.trim() || null) : null,
    model: isRepairType ? (event.data.model.trim() || null) : null,
    serviceKind: isCatalogServiceType ? (event.data.serviceKind.trim() || null) : null,
    keywords: isCatalogServiceType ? parseKeywords(event.data.keywordsText) : [],
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
    :disabled="props.saving"
    :aria-busy="props.saving"
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
            <UFormField :label="currentItemNameLabel" name="name" required>
              <UInput v-model="state.name" autofocus class="w-full" />
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
        v-if="isCatalogService"
        :title="isRepair ? 'Contexte réparation' : 'Contexte service'"
        :description="isRepair
          ? 'Structurez la réparation pour alimenter la recherche atelier et préremplir les dossiers.'
          : 'Décrivez le service pour le retrouver vite dans le catalogue et les documents.'"
        variant="subtle"
      >
        <div class="space-y-4">
          <div v-if="isRepair" class="grid gap-4 md:grid-cols-2">
            <UFormField label="Marque" name="brand" hint="Recommandé">
              <UInput v-model="state.brand" class="w-full" placeholder="Apple, Samsung..." />
            </UFormField>

            <UFormField label="Modèle" name="model" hint="Optionnel">
              <UInput v-model="state.model" class="w-full" placeholder="iPhone 14, Galaxy S23..." />
            </UFormField>
          </div>

          <UFormField :label="isRepair ? 'Type d’intervention' : 'Nature du service'" name="serviceKind" required>
            <UInput
              v-model="state.serviceKind"
              class="w-full"
              :placeholder="isRepair ? 'Remplacement écran' : 'Diagnostic, configuration, support...'"
            />
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
              :model-value="state.defaultPrice"
              :min="0"
              :step="0.05"
              :format-options="{ minimumFractionDigits: 2, maximumFractionDigits: 2 }"
              class="w-full"
              @update:model-value="state.defaultPrice = Number($event || 0)"
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
      <UFormField :label="currentItemNameLabel" name="name" required>
        <UInput v-model="state.name" autofocus class="w-full" />
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

      <template v-if="isCatalogService">
        <div v-if="isRepair" class="grid gap-4 md:grid-cols-2">
          <UFormField label="Marque" name="brand" hint="Recommandé">
            <UInput v-model="state.brand" class="w-full" placeholder="Apple, Samsung..." />
          </UFormField>

          <UFormField label="Modèle" name="model" hint="Optionnel">
            <UInput v-model="state.model" class="w-full" placeholder="iPhone 14, Galaxy S23..." />
          </UFormField>
        </div>

        <UFormField :label="isRepair ? 'Type d’intervention' : 'Nature du service'" name="serviceKind" required>
          <UInput
            v-model="state.serviceKind"
            class="w-full"
            :placeholder="isRepair ? 'Remplacement écran' : 'Diagnostic, configuration, support...'"
          />
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
          required
        >
          <UInputNumber
            :model-value="state.defaultPrice"
            :min="0"
            :step="0.05"
            :format-options="{ minimumFractionDigits: 2, maximumFractionDigits: 2 }"
            class="w-full"
            @update:model-value="state.defaultPrice = Number($event || 0)"
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

    <section v-if="isRepair" class="space-y-3 rounded-lg border border-default p-3" aria-label="Pièce MobileSentrix">
      <div class="flex items-center justify-between gap-2">
        <h3 class="text-sm font-semibold text-highlighted">
          Pièce MobileSentrix
        </h3>
        <UButton
          type="button"
          label="Effacer"
          color="neutral"
          variant="ghost"
          size="xs"
          @click="state.mobileSentrix = emptyMobileSentrix()"
        />
      </div>
      <UFormField label="Correspondance" name="mobileSentrix.status">
        <USelect v-model="state.mobileSentrix.status" :items="mobileSentrixStatuses" class="w-full" />
      </UFormField>
      <template v-if="state.mobileSentrix.status === 'matched'">
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <UFormField label="SKU fournisseur" name="mobileSentrix.sku" required>
            <UInput :model-value="state.mobileSentrix.sku || undefined" class="w-full" @update:model-value="state.mobileSentrix.sku = $event || null" />
          </UFormField>
          <UFormField label="Identifiant produit" name="mobileSentrix.productId">
            <UInput :model-value="state.mobileSentrix.productId || undefined" class="w-full" @update:model-value="state.mobileSentrix.productId = $event || null" />
          </UFormField>
        </div>
        <UFormField label="Fiche produit" name="mobileSentrix.url">
          <UInput
            :model-value="state.mobileSentrix.url || undefined"
            placeholder="https://www.mobilesentrix.com/…"
            class="w-full"
            @update:model-value="state.mobileSentrix.url = $event || null"
          />
        </UFormField>
        <UButton
          v-if="catalogMobileSentrixSchema.safeParse(state.mobileSentrix).success && state.mobileSentrix.url"
          :to="state.mobileSentrix.url"
          target="_blank"
          rel="noopener noreferrer"
          label="Ouvrir la pièce"
          icon="i-lucide-external-link"
          color="neutral"
          variant="link"
          size="xs"
        />
      </template>
      <UFormField label="Note / variante à choisir" name="mobileSentrix.note">
        <UInput
          :model-value="state.mobileSentrix.note || undefined"
          :maxlength="500"
          placeholder="Couleur, cadre, compatibilité Europe…"
          class="w-full"
          @update:model-value="state.mobileSentrix.note = $event || null"
        />
      </UFormField>
    </section>

    <PosFormFeedback :saving="props.saving" :error="props.saveError" />

    <div v-if="props.showSubmit" class="flex justify-end">
      <UButton
        type="submit"
        :label="props.saving ? 'Enregistrement…' : submitLabel"
        :loading="props.saving"
        icon="i-lucide-save"
      />
    </div>
  </UForm>
</template>
