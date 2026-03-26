<script setup lang="ts">
const toast = useToast()
const formId = 'catalog-create-form'

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
    title: 'Article créé',
    color: 'success'
  })

  await navigateTo(`/catalog/${item.id}`)
}
</script>

<template>
  <UDashboardPanel id="catalog-create">
    <template #header>
      <UDashboardNavbar title="Nouvel article">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton
            to="/catalog"
            label="Retour au catalogue"
            variant="ghost"
            color="neutral"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <UPageCard
          title="Nouvel article"
          description="Créez une fiche catalogue propre pour les ventes directes, réparations et documents commerciaux."
          variant="naked"
          orientation="horizontal"
        >
          <template #footer>
            <UButton
              :form="formId"
              type="submit"
              label="Créer l’article"
              icon="i-lucide-save"
              class="w-fit lg:ms-auto"
            />
          </template>
        </UPageCard>

        <PosCatalogItemForm
          :form-id="formId"
          layout="page"
          :show-submit="false"
          submit-label="Créer l’article"
          @save="saveItem"
        />
      </div>
    </template>
  </UDashboardPanel>
</template>
