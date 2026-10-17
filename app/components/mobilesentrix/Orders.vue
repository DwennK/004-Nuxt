<script setup lang="ts">
import type { MobileSentrixOrder, MobileSentrixOrdersResponse } from '~~/shared/types/mobilesentrix-orders'
import { mergeMobileSentrixOrders, mobileSentrixLinesSubtotal, mobileSentrixOrderDate, mobileSentrixOrderMoney, mobileSentrixOrderStatus, mobileSentrixVisibleOrderLines } from '~~/shared/utils/mobilesentrix-orders'

const props = defineProps<{ canUseApi: boolean, active: boolean }>()
const orders = ref<MobileSentrixOrder[]>([])
const smartphonesOnly = ref(false)
const loaded = ref(false)
const pending = ref(false)
const error = ref('')
const page = ref(0)
const hasMore = ref(false)
const failedPage = ref(1)
const updatedAt = ref('')
const scrollArea = useTemplateRef('scrollArea')
const shownOrders = computed(() => orders.value.filter(order => !smartphonesOnly.value || visibleLines(order).length))
const unknownCount = computed(() => orders.value.reduce((count, order) => count + order.lines.filter(line => line.kind === 'unknown').length, 0))
const selected = ref<MobileSentrixOrder | null>(null)
const detailsOpen = ref(false)
const detailPending = ref(false)
const detailError = ref('')
const detailLines = computed(() => selected.value ? visibleLines(selected.value) : [])
const focusReturn = usePosFocusReturn(detailsOpen)
let listRequest = 0
let detailRequest = 0
let listController: AbortController | undefined
let detailController: AbortController | undefined

function visibleLines(order: MobileSentrixOrder) {
  return mobileSentrixVisibleOrderLines(order, smartphonesOnly.value)
}

async function load(targetPage = 1) {
  if (!props.canUseApi || pending.value) return
  const request = ++listRequest
  listController?.abort()
  listController = new AbortController()
  pending.value = true
  error.value = ''
  failedPage.value = targetPage
  try {
    const response = await $fetch<MobileSentrixOrdersResponse>('/api/tools/mobilesentrix/orders', {
      query: { page: targetPage, limit: 50 }, signal: listController.signal
    })
    if (request !== listRequest) return
    orders.value = mergeMobileSentrixOrders(targetPage === 1 ? [] : orders.value, response.items)
    page.value = response.page
    hasMore.value = response.hasMore
    loaded.value = true
    updatedAt.value = new Date().toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' })
    if (targetPage === 1) scrollArea.value?.scrollTo({ top: 0 })
  } catch {
    if (request === listRequest) error.value = loaded.value
      ? 'Les commandes n’ont pas été actualisées. Les dernières informations restent affichées.'
      : 'Impossible de charger les commandes MobileSentrix.'
  } finally {
    if (request === listRequest) pending.value = false
  }
}

function openOrder(order: MobileSentrixOrder) {
  selected.value = order
  detailsOpen.value = true
  refreshDetail()
}

async function refreshDetail() {
  if (!selected.value || !props.canUseApi) return
  const id = selected.value.id
  const request = ++detailRequest
  detailController?.abort()
  detailController = new AbortController()
  detailPending.value = true
  detailError.value = ''
  try {
    const order = await $fetch<MobileSentrixOrder>(`/api/tools/mobilesentrix/orders/${id}`, { signal: detailController.signal })
    if (request !== detailRequest || !detailsOpen.value || selected.value?.id !== id) return
    selected.value = order
    orders.value = orders.value.map(item => item.id === id ? order : item)
  } catch {
    if (request === detailRequest) detailError.value = 'La commande n’a pas été actualisée. Les dernières informations restent affichées.'
  } finally {
    if (request === detailRequest) detailPending.value = false
  }
}

watch(() => [props.active, props.canUseApi], () => {
  if (props.active && props.canUseApi && !loaded.value) load()
}, { immediate: true })
watch(smartphonesOnly, () => scrollArea.value?.scrollTo({ top: 0 }))
watch(detailsOpen, (open) => {
  if (!open) {
    detailRequest++
    detailController?.abort()
    detailPending.value = false
  }
})
onBeforeUnmount(() => {
  listRequest++
  detailRequest++
  listController?.abort()
  detailController?.abort()
})
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col" aria-label="Commandes MobileSentrix">
    <div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-default p-3">
      <UCheckbox v-model="smartphonesOnly" label="Smartphones uniquement" />
      <UButton
        label="Actualiser"
        icon="i-lucide-refresh-cw"
        variant="outline"
        color="neutral"
        size="sm"
        :loading="pending"
        :disabled="!canUseApi"
        @click="load()"
      />
    </div>
    <p v-if="smartphonesOnly && unknownCount" role="status" class="shrink-0 border-b border-default px-3 py-2 text-xs text-warning">
      {{ unknownCount }} ligne(s) de type indéterminé exclue(s) du filtre smartphones.
    </p>
    <div v-if="error" role="alert" class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-default p-3 text-sm text-error">
      <span>{{ error }}</span>
      <UButton
        label="Réessayer"
        variant="outline"
        color="neutral"
        size="sm"
        :loading="pending"
        :disabled="!canUseApi"
        @click="load(failedPage)"
      />
    </div>
    <div ref="scrollArea" :aria-busy="pending" class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <div class="sticky top-0 z-10 hidden grid-cols-[1fr_7rem_2fr_1.5fr_1fr] gap-4 border-b border-default bg-elevated px-3 py-2 text-xs font-medium text-muted lg:grid" aria-hidden="true">
        <span>Commande</span><span>Date de commande</span><span>{{ smartphonesOnly ? 'Smartphones' : 'Pièces / appareils' }}</span><span>Livraison prévue — fournisseur</span><span class="text-right">Montant TTC</span>
      </div>
      <p v-if="!canUseApi" class="p-4 text-sm text-muted">
        Connectez MobileSentrix pour consulter les commandes.
      </p>
      <p v-else-if="!loaded && pending" role="status" class="p-4 text-sm text-muted">
        Chargement des commandes…
      </p>
      <p v-else-if="loaded && !shownOrders.length" role="status" class="p-4 text-sm text-muted">
        {{ smartphonesOnly ? 'Aucun smartphone dans les commandes chargées.' : 'Aucune commande disponible.' }}
      </p>
      <article
        v-for="order in shownOrders"
        :key="order.id"
        :aria-label="`Commande ${order.number}`"
        class="grid grid-cols-1 gap-3 border-b border-default p-3 sm:grid-cols-2 lg:grid-cols-[1fr_7rem_2fr_1.5fr_1fr] lg:gap-4"
      >
        <div class="flex min-w-0 flex-col items-start gap-1">
          <UButton
            :label="`#${order.number}`"
            :aria-label="`Ouvrir la commande ${order.number}`"
            variant="link"
            class="px-0 py-0 font-semibold"
            @click="openOrder(order)"
          />
          <UBadge color="neutral" variant="subtle" size="sm">
            {{ mobileSentrixOrderStatus(order.status) }}
          </UBadge>
        </div>
        <div class="text-sm tabular-nums">
          <p class="text-xs text-muted lg:hidden">
            Date de commande
          </p>
          {{ mobileSentrixOrderDate(order.createdAt) }}
        </div>
        <div class="min-w-0">
          <p class="line-clamp-2 text-sm" :title="visibleLines(order).map(line => line.name).join('\n')">
            {{ visibleLines(order).map(line => `${line.quantity ?? '—'} × ${line.name}`).join(' · ') || 'Aucun article communiqué' }}
          </p>
          <p class="mt-1 text-xs text-muted">
            {{ visibleLines(order).length }} ligne(s)<span v-if="smartphonesOnly && order.lines.length > visibleLines(order).length"> · {{ order.lines.length - visibleLines(order).length }} masquée(s)</span>
          </p>
        </div>
        <div class="min-w-0">
          <p class="mb-1 text-sm font-medium">
            <span class="text-xs font-normal text-muted lg:hidden">Livraison prévue — fournisseur : </span>{{ mobileSentrixOrderDate(order.deliveryDate) }}
          </p>
          <MobilesentrixOrderTracking :order="order" />
        </div>
        <div class="text-sm tabular-nums lg:text-right">
          <template v-if="smartphonesOnly">
            <p class="text-xs text-muted">
              Sous-total smartphones
            </p>
            <p class="font-semibold">
              {{ mobileSentrixOrderMoney(mobileSentrixLinesSubtotal(visibleLines(order)), order.currency) }}
            </p>
          </template>
          <p class="text-xs text-muted" :class="{ 'mt-2': smartphonesOnly }">
            Total commande
          </p>
          <p :class="smartphonesOnly ? 'text-xs text-muted' : 'font-semibold'">
            {{ mobileSentrixOrderMoney(order.totalCents, order.currency) }}
          </p>
        </div>
      </article>
    </div>
    <div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-default px-3 py-2">
      <p role="status" class="text-xs text-muted">
        {{ shownOrders.length }} / {{ orders.length }} commandes chargées<span v-if="smartphonesOnly"> · filtre smartphones</span><span v-if="updatedAt"> · lecture à {{ updatedAt }}</span>
      </p>
      <UButton
        v-if="hasMore"
        label="Charger les précédentes"
        icon="i-lucide-chevron-down"
        variant="outline"
        color="neutral"
        size="sm"
        :loading="pending"
        :disabled="!canUseApi"
        @click="load(page + 1)"
      />
    </div>
    <USlideover
      v-model:open="detailsOpen"
      :title="selected ? `Commande #${selected.number}` : 'Commande fournisseur'"
      description="Articles et livraison selon MobileSentrix."
      :content="focusReturn"
      :ui="{ content: 'w-full sm:max-w-2xl', body: 'space-y-4 p-3 sm:p-4' }"
    >
      <template #body>
        <template v-if="selected">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex flex-wrap items-center gap-2 text-sm">
              <UBadge color="neutral" variant="subtle">
                {{ mobileSentrixOrderStatus(selected.status) }}
              </UBadge>
              <span class="text-muted">{{ mobileSentrixOrderDate(selected.createdAt) }}</span>
            </div>
            <UButton
              label="Actualiser la commande"
              icon="i-lucide-refresh-cw"
              variant="outline"
              color="neutral"
              size="sm"
              :loading="detailPending"
              :disabled="!canUseApi"
              @click="refreshDetail"
            />
          </div>
          <UAlert
            v-if="detailError"
            :description="detailError"
            color="warning"
            variant="subtle"
          />
          <div class="rounded-lg border border-default p-3">
            <p class="text-xs text-muted">
              Livraison prévue — fournisseur
            </p>
            <p class="mb-2 font-semibold">
              {{ mobileSentrixOrderDate(selected.deliveryDate) }}
            </p>
            <MobilesentrixOrderTracking :order="selected" />
          </div>
          <UCheckbox v-model="smartphonesOnly" label="Smartphones uniquement" />
          <p v-if="smartphonesOnly && selected.lines.length > detailLines.length" class="text-xs text-muted">
            {{ selected.lines.length - detailLines.length }} ligne(s) masquée(s), dont {{ selected.lines.filter(line => line.kind === 'unknown').length }} de type indéterminé. Le total commande reste inchangé.
          </p>
          <div :aria-busy="detailPending">
            <p v-if="!detailLines.length" class="py-3 text-sm text-muted">
              {{ smartphonesOnly ? 'Aucun smartphone identifié dans cette commande.' : 'Aucun article communiqué.' }}
            </p>
            <div v-for="line in detailLines" :key="line.id" class="border-b border-default py-3 first:pt-0">
              <p class="text-sm font-medium">
                {{ line.name }}
              </p>
              <p class="mt-1 select-all break-all text-xs text-muted">
                {{ line.sku || 'SKU non communiqué' }}<span v-if="line.kind === 'unknown'"> · Type indéterminé</span>
              </p>
              <dl class="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-xs sm:grid-cols-4">
                <div>
                  <dt class="text-muted">
                    Commandé
                  </dt><dd class="tabular-nums">
                    {{ line.quantity ?? '—' }}
                  </dd>
                </div>
                <div>
                  <dt class="text-muted">
                    Expédié
                  </dt><dd class="tabular-nums">
                    {{ line.shippedQuantity ?? '—' }}
                  </dd>
                </div>
                <div>
                  <dt class="text-muted">
                    Prix unitaire TTC
                  </dt><dd class="tabular-nums">
                    {{ mobileSentrixOrderMoney(line.unitPriceCents, selected.currency) }}
                  </dd>
                </div>
                <div>
                  <dt class="text-muted">
                    Total ligne TTC
                  </dt><dd class="font-medium tabular-nums">
                    {{ mobileSentrixOrderMoney(line.totalCents, selected.currency) }}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </template>
      </template>
      <template #footer>
        <dl v-if="selected" class="w-full space-y-2 text-sm tabular-nums">
          <div v-if="smartphonesOnly" class="flex items-center justify-between gap-3">
            <dt>Sous-total smartphones</dt><dd class="font-semibold">
              {{ mobileSentrixOrderMoney(mobileSentrixLinesSubtotal(detailLines), selected.currency) }}
            </dd>
          </div>
          <div class="flex items-center justify-between gap-3">
            <dt>Total commande TTC</dt><dd class="font-semibold">
              {{ mobileSentrixOrderMoney(selected.totalCents, selected.currency) }}
            </dd>
          </div>
          <p class="text-xs text-muted">
            Total fournisseur, frais et ajustements compris.
          </p>
        </dl>
      </template>
    </USlideover>
  </div>
</template>
