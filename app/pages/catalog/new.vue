<script setup lang="ts">
const toast = useToast()

async function saveItem(payload: {
  name: string
  sku: string
  type: 'product' | 'service' | 'repair_part' | 'labor'
  defaultPrice: number
  vatRate: number
  isActive: boolean
}) {
  const item = await $fetch('/api/catalog-items', {
    method: 'POST',
    body: payload
  })

  toast.add({
    title: 'Catalog item created',
    color: 'success'
  })

  await navigateTo(`/catalog/${item.id}`)
}
</script>

<template>
  <UDashboardPanel id="catalog-create">
    <template #header>
      <UDashboardNavbar title="New Catalog Item">
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
      <UCard class="mx-auto w-full max-w-4xl">
        <PosCatalogItemForm submit-label="Create item" @save="saveItem" />
      </UCard>
    </template>
  </UDashboardPanel>
</template>
