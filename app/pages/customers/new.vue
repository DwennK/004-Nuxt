<script setup lang="ts">
const toast = useToast()

async function saveCustomer(payload: {
  firstName: string
  lastName: string
  companyName: string
  phone: string
  email: string
  addressLine1: string
  addressLine2: string
  postalCode: string
  city: string
  notes: string
}) {
  const customer = await $fetch('/api/customers', {
    method: 'POST',
    body: payload
  })

  toast.add({
    title: 'Customer created',
    color: 'success'
  })

  await navigateTo(`/customers/${customer.id}`)
}
</script>

<template>
  <UDashboardPanel id="customer-create">
    <template #header>
      <UDashboardNavbar title="New Customer">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton
            to="/customers"
            label="Back to customers"
            variant="ghost"
            color="neutral"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UCard class="mx-auto w-full max-w-4xl">
        <PosCustomerForm submit-label="Create customer" @save="saveCustomer" />
      </UCard>
    </template>
  </UDashboardPanel>
</template>
