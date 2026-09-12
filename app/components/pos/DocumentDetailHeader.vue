<script setup lang="ts">
import { documentStatusColors, documentStatusLabels, documentTypeLabels } from '~~/shared/constants/pos'
import type { DocumentDetail } from '~~/shared/types/pos'
import { formatCurrency, formatDate, formatDateTime } from '~~/shared/utils/pos'

const props = withDefaults(defineProps<{
  document: DocumentDetail
  paidAmount: number
  balanceDue: number
  isPayableDocument: boolean
  editable?: boolean
}>(), {
  editable: true
})

const emit = defineEmits<{
  editContext: []
}>()

const customer = computed(() => props.document.customer)
const address = computed(() => [
  customer.value.addressLine1,
  customer.value.addressLine2,
  [customer.value.postalCode, customer.value.city].filter(Boolean).join(' ')
].filter(Boolean).join(', '))
const documentOrder = { quote: 0, customer_order: 1, invoice: 2 }
const relatedDocuments = computed(() => [...(props.document.relatedDocuments || [])]
  .sort((a, b) => documentOrder[a.type] - documentOrder[b.type] || a.id - b.id))
const deadlineLabel = computed(() => props.document.type === 'quote' ? 'Valable jusqu’au' : 'Échéance')
const contextLabel = computed(() => props.document.type === 'customer_order' ? 'Message client' : 'Dates et message client')
const isSettled = computed(() => props.isPayableDocument && props.balanceDue === 0)
</script>

<template>
  <section aria-label="Résumé du document" class="overflow-hidden rounded-lg border border-default bg-default text-sm">
    <div class="grid md:grid-cols-2">
      <div class="min-w-0 px-3 py-2.5 md:border-r md:border-default">
        <div class="mb-2 flex h-8 items-center gap-2 border-b border-default pb-1.5">
          <h2 class="min-w-0 text-xs font-semibold uppercase tracking-wide text-toned">
            Informations {{ documentTypeLabels[props.document.type].toLocaleLowerCase('fr-CH') }}
          </h2>
          <UBadge :color="documentStatusColors[props.document.status]" variant="subtle" size="sm">
            {{ documentStatusLabels[props.document.status] }}
          </UBadge>
          <UTooltip v-if="props.editable" :text="contextLabel">
            <UButton
              type="button"
              :icon="props.document.notes ? 'i-lucide-message-square-text' : 'i-lucide-pencil'"
              :aria-label="contextLabel"
              color="neutral"
              variant="ghost"
              size="xs"
              class="ml-auto shrink-0"
              @click="emit('editContext')"
            />
          </UTooltip>
        </div>
        <dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-0.5 text-xs leading-5">
          <dt class="text-muted">
            Numéro
          </dt>
          <dd class="font-semibold text-highlighted">
            {{ props.document.documentNumber }}
          </dd>
          <dt class="text-muted">
            Date
          </dt>
          <dd>
            <time :datetime="props.document.issuedAt" :title="formatDateTime(props.document.issuedAt)">
              {{ formatDate(props.document.issuedAt) }}
            </time>
          </dd>
          <template v-if="props.document.type !== 'customer_order'">
            <dt class="text-muted">
              {{ deadlineLabel }}
            </dt>
            <dd>
              <time v-if="props.document.dueDate" :datetime="props.document.dueDate">{{ formatDate(props.document.dueDate) }}</time>
              <span v-else class="text-muted">Non définie</span>
            </dd>
          </template>
          <dt class="text-muted">
            Lié à
          </dt>
          <dd class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
            <NuxtLink
              v-for="related in relatedDocuments"
              :key="related.id"
              :to="`/documents/${related.id}`"
              :title="`${documentTypeLabels[related.type]} · ${documentStatusLabels[related.status]}`"
              class="inline-flex items-center gap-0.5 font-medium text-primary hover:underline"
            >
              {{ related.documentNumber }}<UIcon name="i-lucide-arrow-up-right" class="size-3" />
            </NuxtLink>
            <NuxtLink
              v-if="props.document.ticket"
              :to="`/dossiers/${props.document.ticket.id}`"
              class="inline-flex items-center gap-0.5 text-primary hover:underline"
            >
              {{ props.document.ticket.ticketNumber }}<UIcon name="i-lucide-arrow-up-right" class="size-3" />
            </NuxtLink>
            <span v-if="!relatedDocuments.length && !props.document.ticket" class="text-muted">Document autonome</span>
          </dd>
        </dl>
      </div>

      <div class="min-w-0 border-t border-default px-3 py-2.5 md:border-t-0">
        <h2 class="mb-2 flex h-8 items-center border-b border-default pb-1.5 text-xs font-semibold uppercase tracking-wide text-toned">
          Informations du client
        </h2>
        <div class="space-y-0.5 text-xs leading-5">
          <NuxtLink :to="`/customers/${customer.id}`" class="block w-fit max-w-full break-words font-semibold text-highlighted hover:text-primary hover:underline">
            {{ customer.displayName }}
          </NuxtLink>
          <div class="flex min-w-0 items-center gap-2">
            <UIcon name="i-lucide-phone" class="size-3.5 shrink-0 text-muted" />
            <a v-if="customer.phone" :href="`tel:${customer.phone.replace(/[^+\d]/g, '')}`" class="break-all hover:text-primary hover:underline">{{ customer.phone }}</a>
            <span v-else class="text-muted">Téléphone non renseigné</span>
          </div>
          <div class="flex min-w-0 items-center gap-2">
            <UIcon name="i-lucide-mail" class="size-3.5 shrink-0 text-muted" />
            <a v-if="customer.email" :href="`mailto:${customer.email}`" class="break-all hover:text-primary hover:underline">{{ customer.email }}</a>
            <span v-else class="text-muted">Email non renseigné</span>
          </div>
          <div class="flex min-w-0 items-start gap-2">
            <UIcon name="i-lucide-map-pin" class="mt-0.5 size-3.5 shrink-0 text-muted" />
            <address class="min-w-0 break-words not-italic" :class="address ? '' : 'text-muted'">
              {{ address || 'Adresse non renseignée' }}
            </address>
          </div>
        </div>
      </div>
    </div>

    <div class="flex flex-wrap items-center justify-end gap-x-5 gap-y-1 border-t border-default bg-muted/30 px-3 py-1.5 text-xs tabular-nums">
      <span class="text-toned">Total <strong class="ml-1 font-semibold text-highlighted">{{ formatCurrency(props.document.total) }}</strong></span>
      <template v-if="props.isPayableDocument">
        <span class="text-toned">Encaissé <strong class="ml-1 font-medium text-highlighted">{{ formatCurrency(props.paidAmount) }}</strong></span>
        <span :class="isSettled ? 'font-semibold text-success' : 'text-toned'">
          {{ isSettled ? 'Soldé' : 'À encaisser' }}
          <strong v-if="!isSettled" class="ml-1 font-semibold text-highlighted">{{ formatCurrency(props.balanceDue) }}</strong>
          <UIcon v-else name="i-lucide-circle-check" class="ml-1 size-3.5 align-middle" />
        </span>
      </template>
    </div>
  </section>
</template>
