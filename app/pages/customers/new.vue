<script setup lang="ts">
import type { CustomerFormValue } from '~~/shared/types/pos'

const { isSaving, saveError, save } = useFormAction()
const formId = 'customer-create-form'

async function saveCustomer(payload: CustomerFormValue) {
  const result = await save(() => $fetch(`/api/customers`, {
    method: 'POST',
    body: payload
  }), { success: 'Client créé' })
  if (!result?.ok) return
  await navigateTo(`/customers/${result.data.id}`)
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
              :label="isSaving ? 'Enregistrement…' : 'Créer le client'"
              :loading="isSaving"
              icon="i-lucide-save"
              class="w-fit lg:ms-auto"
            />
          </template>
        </UPageCard>

        <PosCustomerForm
          :form-id="formId"
          :saving="isSaving"
          :save-error="saveError"
          layout="page"
          :show-submit="false"
          submit-label="Créer le client"
          @save="saveCustomer"
        />
      </div>
    </template>
  </UDashboardPanel>
</template>
