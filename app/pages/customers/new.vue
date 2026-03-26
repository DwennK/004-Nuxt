<script setup lang="ts">
import type { CustomerFormValue } from '~~/shared/types/pos'

const toast = useToast()
const formId = 'customer-create-form'

async function saveCustomer(payload: CustomerFormValue) {
  const customer = await $fetch('/api/customers', {
    method: 'POST',
    body: payload
  })

  toast.add({
    title: 'Client créé',
    color: 'success'
  })

  await navigateTo(`/customers/${customer.id}`)
}
</script>

<template>
  <UDashboardPanel id="customer-create">
    <template #header>
      <UDashboardNavbar title="Nouveau client">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton
            to="/customers"
            label="Retour aux clients"
            variant="ghost"
            color="neutral"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <UPageCard
          title="Nouveau client"
          description="Créez une fiche exploitable immédiatement dans les tickets, documents et encaissements."
          variant="naked"
          orientation="horizontal"
        >
          <template #footer>
            <UButton
              :form="formId"
              type="submit"
              label="Créer le client"
              icon="i-lucide-save"
              class="w-fit lg:ms-auto"
            />
          </template>
        </UPageCard>

        <PosCustomerForm
          :form-id="formId"
          layout="page"
          :show-submit="false"
          submit-label="Créer le client"
          @save="saveCustomer"
        />
      </div>
    </template>
  </UDashboardPanel>
</template>
