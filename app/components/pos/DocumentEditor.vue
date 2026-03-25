<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
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
  submitLabel: 'Save document',
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
  label: z.string().trim().min(1, 'Label is required'),
  quantity: z.coerce.number().int('Quantity must be a whole number').positive('Quantity must be greater than 0'),
  unitPrice: z.coerce.number().min(0, 'Unit price must be positive'),
  vatRate: z.coerce.number().min(0).max(100),
  categoryHint: z.enum(lineCategoryHints).optional().nullable()
})

const schema = z.object({
  type: z.enum(documentTypes).refine(value => props.allowedTypes.includes(value), 'Document type is not allowed'),
  status: z.enum(documentStatuses),
  customerId: z.coerce.number().int().positive('Customer is required'),
  ticketId: z.coerce.number().int().positive().optional().nullable(),
  issuedAt: z.string().min(1, 'Issue date is required'),
  notes: z.string().optional().default(''),
  lines: z.array(lineSchema).min(1, 'At least one line is required')
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

const customerItems = computed(() => props.customers.map(customer => ({
  label: customer.displayName,
  value: customer.id
})))

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
  state.customerId = props.fixedCustomerId ?? props.initialValue.customerId ?? props.customers[0]?.id ?? 0
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
</script>

<template>
  <UForm
    :schema="schema"
    :state="state"
    class="space-y-6"
    @submit="onSubmit"
  >
    <div class="grid gap-4 xl:grid-cols-4">
      <UFormField label="Document type" name="type">
        <USelectMenu
          v-model="state.type"
          :items="documentTypeItems"
          value-key="value"
          class="w-full"
        />
      </UFormField>

      <UFormField label="Status" name="status">
        <USelectMenu
          v-model="state.status"
          :items="documentStatusItems"
          value-key="value"
          class="w-full"
        />
      </UFormField>

      <UFormField label="Customer" name="customerId" class="xl:col-span-2">
        <USelectMenu
          v-model="state.customerId"
          :items="customerItems"
          value-key="value"
          placeholder="Select customer"
          :search-input="{ placeholder: 'Search customers' }"
          :disabled="fixedCustomerId !== null"
          class="w-full"
        />
      </UFormField>
    </div>

    <div class="grid gap-4 md:grid-cols-2">
      <UFormField label="Issued at" name="issuedAt">
        <UInput v-model="state.issuedAt" type="datetime-local" class="w-full" />
      </UFormField>

      <UFormField label="Linked ticket" name="ticketId">
        <UInput
          :model-value="state.ticketId ? String(state.ticketId) : 'Direct sale / standalone document'"
          :disabled="true"
          class="w-full"
        />
      </UFormField>
    </div>

    <UFormField label="Notes" name="notes">
      <UTextarea
        v-model="state.notes"
        :rows="4"
        placeholder="Internal or printable notes"
        class="w-full"
      />
    </UFormField>

    <UCard :ui="{ body: 'space-y-4 p-4 sm:p-5' }">
      <template #header>
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 class="font-semibold text-highlighted">
              Document lines
            </h3>
            <p class="text-sm text-toned">
              Direct sales stay document-only. Ticket-linked documents can still reuse the same commercial lines.
            </p>
          </div>

          <UButton
            icon="i-lucide-plus"
            label="Add line"
            variant="subtle"
            @click="addLine"
          />
        </div>
      </template>

      <div class="space-y-4">
        <div
          v-for="(line, index) in state.lines"
          :key="index"
          class="rounded-2xl border border-default bg-muted/20 p-4"
        >
          <div class="mb-4 flex items-center justify-between gap-3">
            <div>
              <p class="font-medium text-highlighted">
                Line {{ index + 1 }}
              </p>
              <div class="flex flex-wrap items-center gap-2 text-sm text-toned">
                <span>Total {{ formatCurrency(getLineTotal(line)) }}</span>
                <UBadge color="neutral" variant="subtle">
                  TVA incl. {{ line.vatRate }}%
                </UBadge>
              </div>
            </div>

            <UButton
              icon="i-lucide-trash"
              color="error"
              variant="ghost"
              :disabled="state.lines.length === 1"
              @click="removeLine(index)"
            />
          </div>

          <div class="grid gap-4 xl:grid-cols-6">
            <UFormField :name="`lines.${index}.catalogItemId`" label="Catalog item" class="xl:col-span-2">
              <USelectMenu
                v-model="line.catalogItemId"
                :items="catalogItemsList"
                value-key="value"
                placeholder="Search catalog"
                :search-input="{ placeholder: 'Search products or services' }"
                clear
                class="w-full"
                @update:model-value="updateLineFromCatalog(index)"
              />
            </UFormField>

            <UFormField :name="`lines.${index}.label`" label="Label" class="xl:col-span-2">
              <UInput v-model="line.label" class="w-full" />
            </UFormField>

            <UFormField :name="`lines.${index}.categoryHint`" label="Category">
              <USelectMenu
                v-model="line.categoryHint"
                :items="categoryItems"
                value-key="value"
                clear
                class="w-full"
              />
            </UFormField>

            <div class="rounded-2xl border border-dashed border-default px-4 py-3">
              <p class="text-xs uppercase tracking-wide text-toned">
                Total TTC
              </p>
              <p class="mt-2 font-semibold text-highlighted">
                {{ formatCurrency(getLineSubtotal(line)) }}
              </p>
            </div>
          </div>

          <div class="mt-4 grid gap-4 md:grid-cols-2">
            <UFormField :name="`lines.${index}.quantity`" label="Quantity">
              <UInputNumber
                v-model="line.quantity"
                :min="1"
                :step="1"
                class="w-full"
              />
            </UFormField>

            <UFormField :name="`lines.${index}.unitPrice`" label="Unit price (CHF, TVA incl.)">
              <UInputNumber
                v-model="line.unitPrice"
                :min="0"
                :step="0.05"
                :format-options="{ style: 'currency', currency: 'CHF', currencyDisplay: 'narrowSymbol' }"
                class="w-full"
              />
            </UFormField>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="grid gap-3 md:grid-cols-3">
          <div class="rounded-2xl border border-default px-4 py-3">
            <p class="text-xs uppercase tracking-wide text-toned">
              Total HT
            </p>
            <p class="mt-2 font-semibold text-highlighted">
              {{ formatCurrency(totals.subtotal) }}
            </p>
          </div>
          <div class="rounded-2xl border border-default px-4 py-3">
            <p class="text-xs uppercase tracking-wide text-toned">
              TVA incluse
            </p>
            <p class="mt-2 font-semibold text-highlighted">
              {{ formatCurrency(totals.taxAmount) }}
            </p>
          </div>
          <div class="rounded-2xl border border-default bg-default px-4 py-3">
            <p class="text-xs uppercase tracking-wide text-toned">
              Total TTC
            </p>
            <p class="mt-2 text-lg font-semibold text-highlighted">
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
