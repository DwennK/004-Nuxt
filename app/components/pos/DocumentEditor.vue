<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent, TableColumn } from '@nuxt/ui'
import {
  documentStatusLabels,
  documentStatuses,
  documentTypes,
  documentTypeLabels,
  lineCategoryHints,
  lineCategoryLabels
} from '~~/shared/constants/pos'
import type { CatalogItemRecord, CustomerRecord, DocumentDetail, DocumentStatus, DocumentType } from '~~/shared/types/pos'
import { formatCurrency, getCatalogItemTypeLabel } from '~~/shared/utils/pos'

type EditableLinePayload = {
  catalogItemId: number | null
  label: string
  quantity: number
  unitPrice: number
  vatRate: number
  categoryHint: (typeof lineCategoryHints)[number] | null
}

const props = withDefaults(defineProps<{
  customers: CustomerRecord[]
  catalogItems: CatalogItemRecord[]
  initialValue?: Partial<Pick<DocumentDetail, 'type' | 'status' | 'customerId' | 'ticketId' | 'issuedAt' | 'notes'>> & {
    lines?: EditableLinePayload[]
  }
  submitLabel?: string
  allowedTypes?: DocumentType[]
  fixedCustomerId?: number | null
  fixedTicketId?: number | null
}>(), {
  initialValue: () => ({}),
  submitLabel: 'Enregistrer le document',
  allowedTypes: () => ['quote', 'invoice', 'receipt', 'credit_note'],
  fixedCustomerId: null,
  fixedTicketId: null
})

const emit = defineEmits<{
  save: [payload: {
    type: DocumentType
    status: DocumentStatus
    customerId: number
    ticketId: number | null
    issuedAt: string
    notes: string
    lines: EditableLinePayload[]
  }]
}>()

const lineSchema = z.object({
  catalogItemId: z.coerce.number().int().positive().optional().nullable(),
  label: z.string().trim().min(1, 'Le libellé est obligatoire'),
  quantity: z.coerce.number().int('La quantité doit être un nombre entier').positive('La quantité doit être supérieure à 0'),
  unitPrice: z.coerce.number().min(0, 'Le prix unitaire doit être positif'),
  vatRate: z.coerce.number().min(0).max(100),
  categoryHint: z.enum(lineCategoryHints).optional().nullable()
})

const schema = z.object({
  type: z.enum(documentTypes).refine(value => props.allowedTypes.includes(value), 'Ce type de document n’est pas autorisé'),
  status: z.enum(documentStatuses),
  customerId: z.coerce.number().int().positive('Le client est obligatoire'),
  ticketId: z.coerce.number().int().positive().optional().nullable(),
  issuedAt: z.string().min(1, 'La date d’émission est obligatoire'),
  notes: z.string().optional().default(''),
  lines: z.array(lineSchema).min(1, 'Au moins une ligne est obligatoire')
})

type Schema = z.output<typeof schema>

function toDateTimeLocal(value?: string | null) {
  if (!value) {
    return new Date().toISOString().slice(0, 16)
  }

  return new Date(value).toISOString().slice(0, 16)
}

function createLine() {
  return {
    catalogItemId: null as number | null,
    label: '',
    quantity: 1,
    unitPrice: 0,
    vatRate: 8.1,
    categoryHint: null as (typeof lineCategoryHints)[number] | null
  }
}

const documentTypeItems = computed(() => props.allowedTypes.map(type => ({
  label: documentTypeLabels[type],
  value: type
})))

const documentStatusItems = documentStatuses.map(status => ({
  label: documentStatusLabels[status],
  value: status
}))

const categoryItems = lineCategoryHints.map(category => ({
  label: lineCategoryLabels[category],
  value: category
}))

const catalogItemsList = computed(() => props.catalogItems.map(item => ({
  label: `${item.name} (${getCatalogItemTypeLabel(item.type)})`,
  value: item.id
})))

const lineColumns: TableColumn<Schema['lines'][number]>[] = [
  {
    id: 'item',
    header: 'Article / Libellé',
    meta: {
      class: {
        th: 'w-[38%] min-w-[20rem]',
        td: 'align-top'
      }
    }
  },
  {
    id: 'category',
    header: 'Catégorie',
    meta: {
      class: {
        th: 'w-[16%] min-w-[10rem]',
        td: 'align-top'
      }
    }
  },
  {
    accessorKey: 'quantity',
    header: 'Quantité',
    meta: {
      class: {
        th: 'w-[12%] min-w-[8rem]',
        td: 'align-top'
      }
    }
  },
  {
    accessorKey: 'unitPrice',
    header: 'Prix unitaire TTC',
    meta: {
      class: {
        th: 'w-[16%] min-w-[10rem]',
        td: 'align-top'
      }
    }
  },
  {
    id: 'total',
    header: 'Total TTC',
    meta: {
      class: {
        th: 'w-[12%] min-w-[9rem] text-right',
        td: 'align-top text-right'
      }
    }
  },
  {
    id: 'actions',
    header: '',
    meta: {
      class: {
        th: 'w-12',
        td: 'align-top text-right'
      }
    }
  }
]

const state = reactive<Schema>({
  type: 'invoice',
  status: 'issued',
  customerId: 0,
  ticketId: null,
  issuedAt: toDateTimeLocal(),
  notes: '',
  lines: [createLine()]
})

watchEffect(() => {
  state.type = props.initialValue.type || props.allowedTypes[0] || 'invoice'
  state.status = props.initialValue.status || 'issued'
  state.customerId = props.fixedCustomerId ?? props.initialValue.customerId ?? 0
  state.ticketId = props.fixedTicketId ?? props.initialValue.ticketId ?? null
  state.issuedAt = toDateTimeLocal(props.initialValue.issuedAt)
  state.notes = props.initialValue.notes || ''
  state.lines = props.initialValue.lines?.length
    ? props.initialValue.lines.map(line => ({
        catalogItemId: line.catalogItemId ?? null,
        label: line.label,
        quantity: line.quantity,
        unitPrice: line.unitPrice / 100,
        vatRate: line.vatRate,
        categoryHint: line.categoryHint ?? null
      }))
    : [createLine()]
})

const totals = computed(() => {
  const total = state.lines.reduce((sum, line) => {
    return sum + Math.round((line.quantity || 0) * (line.unitPrice || 0) * 100)
  }, 0)
  const taxAmount = state.lines.reduce((sum, line) => {
    const lineTotal = Math.round((line.quantity || 0) * (line.unitPrice || 0) * 100)
    const netTotal = line.vatRate
      ? Math.round(lineTotal / (1 + ((line.vatRate || 0) / 100)))
      : lineTotal

    return sum + Math.max(lineTotal - netTotal, 0)
  }, 0)

  return {
    subtotal: Math.max(total - taxAmount, 0),
    taxAmount,
    total
  }
})

function getLineSubtotal(line: Schema['lines'][number]) {
  return Math.round((line.quantity || 0) * (line.unitPrice || 0) * 100)
}

function getLineTotal(line: Schema['lines'][number]) {
  return getLineSubtotal(line)
}

function addLine() {
  state.lines.push(createLine())
}

function removeLine(index: number) {
  if (state.lines.length === 1) {
    return
  }

  state.lines.splice(index, 1)
}

function updateLineFromCatalog(index: number) {
  const line = state.lines[index]

  if (!line?.catalogItemId) {
    return
  }

  const item = props.catalogItems.find(candidate => candidate.id === line.catalogItemId)

  if (!item) {
    return
  }

  line.label = item.name
  line.unitPrice = item.defaultPrice / 100
  line.vatRate = item.vatRate
  line.categoryHint = item.type === 'product' ? 'accessory' : item.type === 'service' ? 'service' : 'repair'
}

function onSubmit(event: FormSubmitEvent<Schema>) {
  emit('save', {
    type: event.data.type,
    status: event.data.status,
    customerId: event.data.customerId,
    ticketId: event.data.ticketId ?? null,
    issuedAt: new Date(event.data.issuedAt).toISOString(),
    notes: event.data.notes,
    lines: event.data.lines.map(line => ({
      catalogItemId: line.catalogItemId || null,
      label: line.label,
      quantity: Number(line.quantity || 0),
      unitPrice: Math.round((line.unitPrice || 0) * 100),
      vatRate: Number(line.vatRate || 0),
      categoryHint: line.categoryHint || null
    }))
  })
}

function selectAllOnFocus(event: FocusEvent) {
  const target = event.target

  if (!(target instanceof HTMLInputElement)) {
    return
  }

  requestAnimationFrame(() => {
    target.select()
  })
}
</script>

<template>
  <UForm
    :schema="schema"
    :state="state"
    class="space-y-6"
    @submit="onSubmit"
  >
    <div class="grid gap-4 xl:grid-cols-4">
      <UFormField label="Type de document" name="type">
        <USelectMenu
          v-model="state.type"
          :items="documentTypeItems"
          value-key="value"
          class="w-full"
        />
      </UFormField>

      <UFormField label="Statut" name="status">
        <USelectMenu
          v-model="state.status"
          :items="documentStatusItems"
          value-key="value"
          class="w-full"
        />
      </UFormField>

      <UFormField label="Client" name="customerId" class="xl:col-span-2">
        <PosCustomerSelectField
          :model-value="state.customerId || null"
          :customers="props.customers"
          placeholder="Choisir un client"
          :disabled="fixedCustomerId !== null"
          @update:model-value="state.customerId = $event || 0"
        />
      </UFormField>
    </div>

    <div class="grid gap-4 md:grid-cols-2">
      <UFormField label="Émis le" name="issuedAt">
        <UInput v-model="state.issuedAt" type="datetime-local" class="w-full" />
      </UFormField>

      <UFormField label="Ticket lié" name="ticketId">
        <UInput
          :model-value="state.ticketId ? String(state.ticketId) : 'Vente directe / document autonome'"
          :disabled="true"
          class="w-full"
        />
      </UFormField>
    </div>

    <UFormField label="Notes" name="notes">
      <UTextarea
        v-model="state.notes"
        :rows="4"
        placeholder="Notes internes ou imprimables"
        class="w-full"
      />
    </UFormField>

    <UCard :ui="{ body: 'space-y-4 p-4 sm:p-5' }">
      <template #header>
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 class="font-semibold text-highlighted">
              Lignes du document
            </h3>
            <p class="text-sm text-toned">
              Les ventes directes restent sans ticket. Les documents liés à un ticket peuvent réutiliser les mêmes lignes commerciales.
            </p>
          </div>

          <UButton
            icon="i-lucide-plus"
            label="Ajouter une ligne"
            variant="subtle"
            @click="addLine"
          />
        </div>
      </template>

      <div class="overflow-x-auto">
        <UTable
          :data="state.lines"
          :columns="lineColumns"
          sticky="header"
          :ui="{
            root: 'rounded-2xl border border-default bg-default shadow-sm',
            base: 'min-w-[64rem] table-fixed border-separate border-spacing-0',
            thead: '[&>tr]:bg-elevated/80 [&>tr]:after:content-none',
            tbody: '[&>tr]:last:[&>td]:border-b-0',
            th: 'border-b border-default px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-toned',
            td: 'border-b border-default px-3 py-3 align-top',
            separator: 'h-0'
          }"
        >
          <template #item-cell="{ row }">
            <div class="space-y-2">
              <div class="flex items-center justify-between gap-2">
                <div class="flex items-center gap-2 text-xs">
                  <UBadge
                    color="neutral"
                    variant="subtle"
                    size="sm"
                    :label="`Ligne ${row.index + 1}`"
                  />
                  <span class="text-toned">TVA incl. {{ row.original.vatRate }}%</span>
                </div>

                <p class="text-xs text-toned">
                  {{ row.original.catalogItemId ? 'Catalogue lié' : 'Saisie libre' }}
                </p>
              </div>

              <UFormField :name="`lines.${row.index}.catalogItemId`">
                <USelectMenu
                  v-model="row.original.catalogItemId"
                  :items="catalogItemsList"
                  value-key="value"
                  placeholder="Rechercher dans le catalogue"
                  :search-input="{ placeholder: 'Rechercher un produit ou service', size: 'sm' }"
                  clear
                  size="sm"
                  class="w-full"
                  @update:model-value="updateLineFromCatalog(row.index)"
                />
              </UFormField>

              <UFormField :name="`lines.${row.index}.label`">
                <UInput
                  v-model="row.original.label"
                  size="sm"
                  variant="subtle"
                  class="w-full"
                  placeholder="Libellé de la ligne"
                />
              </UFormField>
            </div>
          </template>

          <template #category-cell="{ row }">
            <UFormField :name="`lines.${row.index}.categoryHint`">
              <USelectMenu
                v-model="row.original.categoryHint"
                :items="categoryItems"
                value-key="value"
                placeholder="Catégorie"
                clear
                size="sm"
                variant="subtle"
                :search-input="false"
                class="w-full"
              />
            </UFormField>
          </template>

          <template #quantity-cell="{ row }">
            <UFormField :name="`lines.${row.index}.quantity`">
              <UInputNumber
                v-model="row.original.quantity"
                :min="1"
                :step="1"
                size="sm"
                variant="subtle"
                :increment="{ variant: 'ghost' }"
                :decrement="{ variant: 'ghost' }"
                class="w-full"
              />
            </UFormField>
          </template>

          <template #unitPrice-cell="{ row }">
            <UFormField :name="`lines.${row.index}.unitPrice`">
              <UInputNumber
                v-model="row.original.unitPrice"
                :min="0"
                :step="0.05"
                :increment="false"
                :decrement="false"
                size="sm"
                variant="subtle"
                :format-options="{ minimumFractionDigits: 2, maximumFractionDigits: 2 }"
                class="w-full"
                @focus="selectAllOnFocus"
              />
            </UFormField>
          </template>

          <template #total-cell="{ row }">
            <div class="space-y-1 text-right">
              <p class="text-[11px] uppercase tracking-[0.14em] text-toned">
                Total
              </p>
              <p class="text-base font-semibold text-highlighted">
                {{ formatCurrency(getLineTotal(row.original)) }}
              </p>
            </div>
          </template>

          <template #actions-cell="{ row }">
            <UButton
              icon="i-lucide-trash"
              color="error"
              variant="ghost"
              size="sm"
              :disabled="state.lines.length === 1"
              :aria-label="`Supprimer la ligne ${row.index + 1}`"
              @click="removeLine(row.index)"
            />
          </template>

          <template #empty>
            <UEmpty
              icon="i-lucide-list"
              title="Aucune ligne"
              description="Ajoutez au moins une ligne pour enregistrer le document."
              size="sm"
              variant="naked"
            />
          </template>
        </UTable>
      </div>

      <template #footer>
        <div class="grid gap-3 lg:grid-cols-3">
          <div class="rounded-xl border border-default px-4 py-3">
            <p class="text-xs uppercase tracking-wide text-toned">
              Total HT
            </p>
            <p class="mt-1 text-base font-semibold text-highlighted sm:text-lg">
              {{ formatCurrency(totals.subtotal) }}
            </p>
          </div>
          <div class="rounded-xl border border-default px-4 py-3">
            <p class="text-xs uppercase tracking-wide text-toned">
              TVA incluse
            </p>
            <p class="mt-1 text-base font-semibold text-highlighted sm:text-lg">
              {{ formatCurrency(totals.taxAmount) }}
            </p>
          </div>
          <div class="rounded-xl border border-default bg-default px-4 py-3">
            <p class="text-xs uppercase tracking-wide text-toned">
              Total TTC
            </p>
            <p class="mt-1 text-base font-semibold text-highlighted sm:text-lg">
              {{ formatCurrency(totals.total) }}
            </p>
          </div>
        </div>
      </template>
    </UCard>

    <div class="flex justify-end">
      <UButton type="submit" :label="submitLabel" icon="i-lucide-save" />
    </div>
  </UForm>
</template>
