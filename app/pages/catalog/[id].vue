<script setup lang="ts">
import { catalogItemTypeColors, catalogItemTypeLabels } from '~~/shared/constants/pos'
import type { CatalogItemRecord } from '~~/shared/types/pos'
import { formatCurrency, formatDateTime } from '~~/shared/utils/pos'

const route = useRoute()
const toast = useToast()
const id = computed(() => Number(route.params.id))

const { data: item, refresh } = await useFetch<CatalogItemRecord>(() => `/api/catalog-items/${id.value}`)

async function saveItem(payload: {
  name: string
  sku: string
  type: 'product' | 'service' | 'repair_part' | 'labor'
  defaultPrice: number
  vatRate: number
  isActive: boolean
}) {
  await $fetch(`/api/catalog-items/${id.value}`, {
    method: 'PATCH',
    body: payload
  })

  toast.add({
    title: 'Catalog item updated',
    color: 'success'
  })

  await refresh()
}
</script>

<template>
  <UDashboardPanel id="catalog-detail">
    <template #header>
      <UDashboardNavbar :title="item?.name || 'Catalog item'">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton
            to="/catalog"
            label="Back to catalog"
            variant="ghost"
            color="neutral"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <UCard>
          <template #header>
            <div>
              <h2 class="text-lg font-semibold text-highlighted">
                Edit catalog item
              </h2>
              <p class="text-sm text-toned">
                Keep the shared commercial defaults consistent across direct sales and repair documents.
              </p>
            </div>
          </template>

          <PosCatalogItemForm
            v-if="item"
            :initial-value="item"
            submit-label="Save item"
            @save="saveItem"
          />
        </UCard>

        <div class="space-y-6">
          <UCard>
            <template #header>
              <div>
                <h2 class="text-lg font-semibold text-highlighted">
                  Item snapshot
                </h2>
              </div>
            </template>

            <div class="space-y-3">
              <div class="flex items-center justify-between rounded-2xl border border-default px-4 py-3">
                <span class="text-sm text-toned">Type</span>
                <UBadge :color="catalogItemTypeColors[item?.type || 'product']" variant="subtle">
                  {{ item ? catalogItemTypeLabels[item.type] : 'Product' }}
                </UBadge>
              </div>
              <div class="flex items-center justify-between rounded-2xl border border-default px-4 py-3">
                <span class="text-sm text-toned">Status</span>
                <UBadge :color="item?.isActive ? 'success' : 'neutral'" variant="subtle">
                  {{ item?.isActive ? 'Active' : 'Inactive' }}
                </UBadge>
              </div>
              <div class="flex items-center justify-between rounded-2xl border border-default px-4 py-3">
                <span class="text-sm text-toned">Last update</span>
                <span class="text-sm font-medium text-highlighted">{{ item ? formatDateTime(item.updatedAt) : '-' }}</span>
              </div>
            </div>
          </UCard>

          <div class="grid gap-4 md:grid-cols-3 xl:grid-cols-1">
            <PosSummaryCard
              title="Prix TTC"
              :value="formatCurrency(item?.defaultPrice || 0)"
              description="Stored in integer cents for predictable totals."
              icon="i-lucide-wallet"
            />
            <PosSummaryCard
              title="TVA"
              :value="`${item?.vatRate || 0}%`"
              description="Applied to new document lines by default."
              icon="i-lucide-percent"
            />
            <PosSummaryCard
              title="SKU"
              :value="item?.sku || 'Not set'"
              description="Optional internal or shelf reference."
              icon="i-lucide-scan-line"
            />
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
