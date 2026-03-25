<script setup lang="ts">
import type { DocumentDetail } from '~~/shared/types/pos'
import { formatCurrency } from '~~/shared/utils/pos'

definePageMeta({
  layout: false
})

const route = useRoute()
const id = computed(() => Number(route.params.id))
const { data: document } = await useFetch<DocumentDetail>(() => `/api/documents/${id.value}`)

onMounted(() => {
  setTimeout(() => window.print(), 300)
})
</script>

<template>
  <div v-if="document" class="mx-auto min-h-screen max-w-4xl bg-white px-6 py-10 text-slate-900 print:px-0">
    <div class="mb-10 flex items-start justify-between gap-6 border-b border-slate-200 pb-6">
      <div>
        <p class="text-sm uppercase tracking-[0.3em] text-slate-500">
          Store Document
        </p>
        <h1 class="mt-2 text-3xl font-semibold">
          {{ document.documentNumber }}
        </h1>
        <p class="mt-2 text-sm text-slate-500">
          {{ document.issuedAt }}
        </p>
      </div>

      <div class="text-right text-sm text-slate-600">
        <p class="font-semibold text-slate-900">
          Shop Management / POS
        </p>
        <p>Physical store workflow</p>
        <p>{{ document.customer.displayName }}</p>
        <p>{{ document.customer.phone }}</p>
      </div>
    </div>

    <div class="mb-8 grid gap-6 md:grid-cols-2">
      <div class="rounded-3xl border border-slate-200 p-5">
        <p class="text-xs uppercase tracking-[0.2em] text-slate-500">
          Bill to
        </p>
        <p class="mt-2 font-semibold">
          {{ document.customer.displayName }}
        </p>
        <p>{{ document.customer.email }}</p>
        <p>{{ [document.customer.addressLine1, document.customer.addressLine2, document.customer.postalCode, document.customer.city].filter(Boolean).join(', ') }}</p>
      </div>

      <div class="rounded-3xl border border-slate-200 p-5">
        <p class="text-xs uppercase tracking-[0.2em] text-slate-500">
          References
        </p>
        <p class="mt-2">
          Type: {{ document.type }}
        </p>
        <p>Status: {{ document.status }}</p>
        <p v-if="document.ticket">
          Ticket: {{ document.ticket.ticketNumber }}
        </p>
      </div>
    </div>

    <table class="w-full border-collapse text-left">
      <thead>
        <tr class="border-b border-slate-200 text-sm text-slate-500">
          <th class="py-3">
            Label
          </th>
          <th class="py-3">
            Qty
          </th>
          <th class="py-3">
            Unit (TTC)
          </th>
          <th class="py-3 text-right">
            Total TTC
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="line in document.lines" :key="line.id" class="border-b border-slate-100">
          <td class="py-4">
            {{ line.label }}
          </td>
          <td class="py-4">
            {{ line.quantity }}
          </td>
          <td class="py-4">
            {{ formatCurrency(line.unitPrice) }}
          </td>
          <td class="py-4 text-right">
            {{ formatCurrency(line.lineTotal) }}
          </td>
        </tr>
      </tbody>
    </table>

    <div class="ml-auto mt-8 max-w-sm space-y-3 rounded-3xl border border-slate-200 p-5">
      <div class="flex items-center justify-between">
        <span class="text-slate-500">Total HT</span>
        <span>{{ formatCurrency(document.subtotal) }}</span>
      </div>
      <div class="flex items-center justify-between">
        <span class="text-slate-500">TVA incluse</span>
        <span>{{ formatCurrency(document.taxAmount) }}</span>
      </div>
      <div class="flex items-center justify-between text-lg font-semibold">
        <span>Total TTC</span>
        <span>{{ formatCurrency(document.total) }}</span>
      </div>
    </div>
  </div>
</template>
