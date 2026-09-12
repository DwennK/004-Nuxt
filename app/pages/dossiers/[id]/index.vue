<script setup lang="ts">
import QRCode from 'qrcode'
import type { DropdownMenuItem, TableColumn } from '@nuxt/ui'
import {
  documentStatusColors,
  documentStatusLabels,
  documentTypeLabels,
  paymentMethodColors,
  paymentMethodLabels,
  ticketStatusColors,
  ticketStatusLabels,
  ticketTypeColors,
  ticketTypeLabels,
  ticketWorkflowStepLabels,
  ticketWorkflowSteps
} from '~~/shared/constants/pos'
import type {
  DocumentDetail,
  PaymentMethod,
  TicketDetail,
  TicketEvent,
  TicketStatus,
  TicketWorkflowAction
} from '~~/shared/types/pos'
import type { CustomerSmsSettingsRecord, SmsTemplateRecord } from '~~/shared/types/settings'
import {
  buildSmsHref,
  freeSmsTemplateId,
  normalizeSmsPhoneNumber,
  resolveSmsTemplateBody
} from '~~/shared/utils/customer-sms'
import { ticketStatusTransitions } from '~~/shared/domain/tickets/workflow'
import { canCreateTicketDocument } from '~~/shared/domain/tickets/document-policy'
import { supportsDocumentPrintProfile, supportsTicketPrintProfile } from '~~/shared/utils/print'
import { formatCurrency, formatDateTime } from '~~/shared/utils/pos'

const $fetch = useDossierFetch()

type TimelineItem = TicketEvent & {
  date: string
  title: string
  description: string
  icon: string
}

const UBadge = resolveComponent('UBadge')
const UDropdownMenu = resolveComponent('UDropdownMenu')

const route = useRoute()
const toast = useToast()
const paymentMutation = useIdempotentMutation()
const documentMutation = useIdempotentMutation()
const id = computed(() => Number(route.params.id))

const workflowOpen = ref(false)
const { isSaving: actionSaving, saveError: actionError, save: saveAction, clearSaveError: clearActionError } = useFormAction()
watch(workflowOpen, clearActionError)
const paymentOpen = ref(false)
const smsModalOpen = ref(false)
const noteModalOpen = ref(false)
const noteDraft = ref('')
const noteSaving = ref(false)
const noteError = ref<string | null>(null)
const noteFocusReturn = usePosFocusReturn(noteModalOpen)
const createdDocumentActionsOpen = ref(false)
const selectedWorkflowAction = ref<TicketWorkflowAction | null>(null)
const createdCommercialDocument = ref<DocumentDetail | null>(null)
const selectedSmsTemplateId = ref<string>(freeSmsTemplateId)
const smsQrDataUrl = ref<string | null>(null)
const smsQrLoading = ref(false)
const smsLogKey = ref<string | null>(null)

const [{ data: ticket, refresh: refreshTicket }, { data: customerSmsSettings }] = await Promise.all([
  useFetch<TicketDetail>(() => `/api/tickets/${id.value}`),
  useFetch<CustomerSmsSettingsRecord>('/api/settings/customer-sms')
])

const dossier = useDossier(() => ({ kind: 'ticket', id: id.value }), { record: ticket })
provide('pos-dossier-state', dossier.current)
watch([workflowOpen, noteModalOpen], async (values) => {
  if (values.some(Boolean) && dossier.current.value) {
    try {
      await dossier.manager.session(dossier.current.value, 'acquire')
    } catch { /* Banner reports failures. */ }
  }
})

watch(() => dossier.current.value?.epoch, () => {
  noteDraft.value = ''
  workflowOpen.value = false
  paymentOpen.value = false
  noteModalOpen.value = false
})

const activeTab = ref('overview')
const showAllHistory = ref(false)

watch(id, () => {
  activeTab.value = 'overview'
  showAllHistory.value = false
})

const tabItems = computed(() => [
  { label: ticket.value?.type === 'repair' ? 'Réparation' : 'Vue d’ensemble', icon: 'i-lucide-wrench', value: 'overview' },
  { label: 'Paiements', icon: 'i-lucide-wallet', value: 'payments', badge: ticket.value?.payments.length || 0 },
  { label: 'SMS', icon: 'i-lucide-message-square-share', value: 'sms', badge: smsTimelineItems.value.length || 0 },
  { label: 'Client & Appareil', icon: 'i-lucide-user', value: 'client' }
])

const workflowStepIndex = computed(() => {
  if (!ticket.value) {
    return 0
  }

  return ticketWorkflowSteps.indexOf(ticket.value.workflow.step)
})

// Use the existing permitted workflow actions; only their visual priority changes.
const primaryWorkflowAction = computed(() => {
  const actions = ticket.value?.workflow.actions || []
  return (ticket.value?.status === 'in_progress'
    ? actions.find(action => action.targetStatus === 'ready_for_pickup')
    : actions.find(action => action.targetStatus !== 'cancelled')) || null
})

const statusChangedAt = computed(() => {
  const event = ticket.value?.events
    .filter(event => !event.isSynthetic
      && ['ticket_status_changed', 'ticket_closed'].includes(event.kind)
      && event.metadata?.nextStatus === ticket.value?.status)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0]
  return event?.occurredAt || null
})

const workshopBlocker = computed(() =>
  ticket.value?.status === 'ready_for_pickup' ? null : ticket.value?.workflow.blockerLabel
)

const isTicketMutable = computed(() => ticket.value ? !['closed', 'cancelled'].includes(ticket.value.status) : false)
const ticketDocumentEligibility = computed(() => ({
  ticketStatus: ticket.value?.status || 'closed',
  existingDocumentTypes: ticket.value?.documents.map(document => document.type) || [],
  activeDocumentTypes: ticket.value?.documents.filter(document => document.status !== 'cancelled').map(document => document.type) || []
}))
const canCreateQuote = computed(() => canCreateTicketDocument(ticketDocumentEligibility.value, 'quote'))
const canCreateCustomerOrder = computed(() => canCreateTicketDocument(ticketDocumentEligibility.value, 'customer_order'))
const canCreateInvoice = computed(() => canCreateTicketDocument(ticketDocumentEligibility.value, 'invoice'))
const payableDocument = computed(() => ticket.value?.commercialSummary.payableDocument || null)
const canRecordPayment = computed(() =>
  isTicketMutable.value
  && Boolean(payableDocument.value)
  && Boolean(ticket.value?.commercialSummary.balanceDue)
)
const supportsThermalPrint = supportsTicketPrintProfile('thermal')
const createdDocumentSupportsA4Print = computed(() =>
  createdCommercialDocument.value
    ? supportsDocumentPrintProfile(createdCommercialDocument.value.type, 'a4')
    : false
)
const createdDocumentSupportsThermalPrint = computed(() =>
  createdCommercialDocument.value
    ? supportsDocumentPrintProfile(createdCommercialDocument.value.type, 'thermal')
    : false
)
const canChargeCreatedDocument = computed(() =>
  createdCommercialDocument.value?.type === 'invoice'
  && Boolean(ticket.value?.commercialSummary.balanceDue)
)
const normalizedCustomerPhone = computed(() => normalizeSmsPhoneNumber(ticket.value?.customer.phone || ''))
const canSendSms = computed(() => Boolean(normalizedCustomerPhone.value))
const smsTemplates = computed(() => customerSmsSettings.value?.templates || [])
const smsTemplateItems = computed(() => [
  ...smsTemplates.value,
  {
    id: freeSmsTemplateId,
    label: 'Message libre',
    body: ''
  }
])
const selectedSmsTemplate = computed(() => smsTemplateItems.value.find(template => template.id === selectedSmsTemplateId.value) || smsTemplateItems.value[smsTemplateItems.value.length - 1] || null)
const resolvedSmsMessage = computed(() => {
  if (!ticket.value || !selectedSmsTemplate.value || selectedSmsTemplate.value.id === freeSmsTemplateId) {
    return ''
  }

  return resolveSmsTemplateBody(selectedSmsTemplate.value, {
    clientName: ticket.value.customer.displayName,
    ticketNumber: ticket.value.ticketNumber,
    brand: ticket.value.brand || '',
    model: ticket.value.model || ''
  })
})
const smsHref = computed(() => buildSmsHref(normalizedCustomerPhone.value, resolvedSmsMessage.value || null))
const smsButtonHelp = computed(() => canSendSms.value ? '' : 'Ajoutez un numero de telephone client pour generer un QR SMS.')

const statusMenuItems = computed(() => {
  if (!ticket.value || !isTicketMutable.value) {
    return []
  }

  const allowedStatuses = ticketStatusTransitions[ticket.value.status] as readonly TicketStatus[]
  const statusItems = allowedStatuses
    .filter(status => status !== 'cancelled' && status !== 'closed')
    .map(status => ({
      label: ticketStatusLabels[status],
      color: ticketStatusColors[status],
      onSelect() {
        changeTicketStatus(status)
      }
    }))

  const finalItems: Array<{
    label: string
    icon: string
    color: 'success' | 'error'
    onSelect: () => void
  }> = []

  if (allowedStatuses.includes('cancelled')) {
    finalItems.push({
      label: 'Annuler le dossier',
      icon: 'i-lucide-circle-x',
      color: 'error',
      onSelect() {
        openWorkflowAction({
          id: 'cancel-ticket-inline',
          kind: 'status',
          label: 'Annuler le dossier',
          description: 'Le dossier est abandonné. Une confirmation explicite est requise.',
          icon: 'i-lucide-circle-x',
          color: 'error',
          targetStatus: 'cancelled'
        })
      }
    })
  }

  if (allowedStatuses.includes('closed')) {
    finalItems.push({
      label: 'Clôturer le dossier',
      icon: 'i-lucide-check-check',
      color: 'success',
      onSelect() {
        openWorkflowAction({
          id: 'close-ticket-inline',
          kind: 'close',
          label: 'Clôturer le dossier',
          description: 'Le dossier est terminé et archivé.',
          icon: 'i-lucide-check-check',
          color: 'success',
          targetStatus: null
        })
      }
    })
  }

  return [statusItems, finalItems].filter(group => group.length > 0)
})

const createDocumentItems = computed<DropdownMenuItem[]>(() => [
  ...(canCreateQuote.value ? [{ label: 'Créer un devis', icon: 'i-lucide-scroll-text', onSelect: createQuote }] : []),
  ...(canCreateCustomerOrder.value ? [{ label: 'Créer une commande', icon: 'i-lucide-clipboard-plus', onSelect: createOrder }] : []),
  ...(canCreateInvoice.value ? [{ label: 'Créer une facture', icon: 'i-lucide-file-text', onSelect: createInvoice }] : [])
])

const paymentColumns: TableColumn<TicketDetail['payments'][number]>[] = [
  {
    accessorKey: 'method',
    header: 'Mode',
    cell: ({ row }) => h(UBadge, {
      color: paymentMethodColors[row.original.method],
      variant: 'subtle'
    }, () => paymentMethodLabels[row.original.method])
  },
  {
    accessorKey: 'amount',
    header: 'Montant',
    cell: ({ row }) => formatCurrency(row.original.amount)
  },
  {
    accessorKey: 'paidAt',
    header: 'Encaissé à',
    cell: ({ row }) => formatDateTime(row.original.paidAt)
  }
]

const timelineItems = computed<TimelineItem[]>(() => {
  return (ticket.value?.events || []).map(event => ({
    ...event,
    date: formatDateTime(event.occurredAt),
    title: event.label,
    description: getEventDescription(event),
    icon: getEventIcon(event.kind)
  }))
})

const visibleTimelineItems = computed(() => showAllHistory.value ? timelineItems.value : timelineItems.value.slice(0, 4))

const smsTimelineItems = computed(() =>
  timelineItems.value.filter(event => event.kind === 'ticket_sms_qr_opened')
)

function getEventIcon(kind: TicketEvent['kind']) {
  switch (kind) {
    case 'ticket_created':
      return 'i-lucide-folder-plus'
    case 'ticket_status_changed':
      return 'i-lucide-workflow'
    case 'ticket_closed':
      return 'i-lucide-check-check'
    case 'ticket_note_added':
      return 'i-lucide-message-square-plus'
    case 'document_created':
      return 'i-lucide-file-text'
    case 'payment_recorded':
      return 'i-lucide-wallet'
    case 'ticket_sms_qr_opened':
      return 'i-lucide-message-square-share'
  }
}

function getEventDescription(event: TicketEvent) {
  const metadata = event.metadata || {}

  if (event.kind === 'ticket_status_changed') {
    const previousStatus = typeof metadata.previousStatus === 'string' ? metadata.previousStatus : null
    const nextStatus = typeof metadata.nextStatus === 'string' ? metadata.nextStatus : null

    if (previousStatus && nextStatus) {
      return `${ticketStatusLabels[previousStatus as keyof typeof ticketStatusLabels]} → ${ticketStatusLabels[nextStatus as keyof typeof ticketStatusLabels]}`
    }

    return 'Le statut du dossier a été mis à jour.'
  }

  if (event.kind === 'ticket_created') {
    return 'Le dossier a été ouvert et pris en charge au comptoir.'
  }

  if (event.kind === 'ticket_closed') {
    return 'Le dossier est terminé et ne demande plus d\'action atelier.'
  }

  if (event.kind === 'ticket_note_added') {
    const actorName = typeof metadata.actorName === 'string' ? metadata.actorName : null
    return actorName ? `Ajoutée par ${actorName}` : 'Ajoutée au suivi interne du dossier.'
  }

  if (event.kind === 'document_created') {
    const documentNumber = typeof metadata.documentNumber === 'string' ? metadata.documentNumber : null
    const documentType = typeof metadata.documentType === 'string' ? metadata.documentType : null

    if (documentNumber && documentType && documentType in documentTypeLabels) {
      return `${documentTypeLabels[documentType as keyof typeof documentTypeLabels]} ${documentNumber}`
    }

    return 'Un document commercial a été lié au dossier.'
  }

  if (event.kind === 'payment_recorded') {
    const method = typeof metadata.method === 'string' ? metadata.method : null
    const amount = typeof metadata.amount === 'number' ? metadata.amount : null
    const documentNumber = typeof metadata.documentNumber === 'string' ? metadata.documentNumber : null
    const parts = []

    if (method && method in paymentMethodLabels) {
      parts.push(paymentMethodLabels[method as PaymentMethod])
    }

    if (typeof amount === 'number') {
      parts.push(formatCurrency(amount))
    }

    if (documentNumber) {
      parts.push(documentNumber)
    }

    return parts.join(' · ') || 'Un paiement a été enregistré.'
  }

  if (event.kind === 'ticket_sms_qr_opened') {
    const mode = event.metadata?.mode === 'free' ? 'Message libre' : 'Modèle'
    const templateLabel = typeof event.metadata?.templateLabel === 'string' ? event.metadata.templateLabel : 'SMS client'
    return `${mode} · ${templateLabel}`
  }

  return ''
}

function getEventDocumentId(event: TicketEvent) {
  const documentId = event.metadata?.documentId
  return typeof documentId === 'number' ? documentId : null
}

function openWorkflowAction(action: TicketWorkflowAction) {
  selectedWorkflowAction.value = action
  workflowOpen.value = true
}

function openInternalNote() {
  noteDraft.value = ''
  noteError.value = null
  noteModalOpen.value = true
}

async function addInternalNote() {
  const note = noteDraft.value.trim()

  if (!note || noteSaving.value) {
    return
  }

  noteError.value = null
  noteSaving.value = true

  try {
    await $fetch(`/api/tickets/${id.value}/notes`, {
      method: 'POST',
      body: { note }
    })
    await refreshTicket()
    activeTab.value = 'overview'
    noteModalOpen.value = false
    noteDraft.value = ''
    toast.add({
      title: 'Note interne ajoutée',
      color: 'success'
    })
  } catch (error) {
    noteError.value = getRequestErrorMessage(error) || 'Vérifiez la connexion puis réessayez.'
    toast.add({
      title: 'Enregistrement impossible',
      description: getRequestErrorMessage(error) || 'Vérifiez la connexion puis réessayez.',
      color: 'error'
    })
  } finally {
    noteSaving.value = false
  }
}

function showCreatedDocumentActions(document: DocumentDetail) {
  createdCommercialDocument.value = document
  createdDocumentActionsOpen.value = true
}

function closeCreatedDocumentActions() {
  createdDocumentActionsOpen.value = false
}

function clearCreatedDocumentActions() {
  createdCommercialDocument.value = null
}

async function navigateToCreatedDocument(path: string) {
  closeCreatedDocumentActions()
  await navigateTo(path)
}

function openPaymentForCreatedDocument() {
  closeCreatedDocumentActions()
  paymentOpen.value = true
}

async function changeTicketStatus(status: TicketStatus, internalNotes?: string) {
  if (!ticket.value || ticket.value.status === status) {
    return
  }

  const result = await saveAction(() => $fetch(`/api/tickets/${id.value}/status`, {
    method: 'POST',
    body: {
      status,
      internalNotes: internalNotes ?? ticket.value?.internalNotes
    }
  }))
  if (!result?.ok) return false

  toast.add({
    title: `Statut mis à jour · ${ticketStatusLabels[status]}`,
    color: 'success'
  })

  await refreshTicket()
  return true
}

async function handleWorkflowSubmit(payload: {
  action: TicketWorkflowAction
  internalNotes: string
}) {
  if (!ticket.value) {
    return
  }

  if (payload.action.kind === 'close') {
    const result = await saveAction(() => $fetch(`/api/tickets/${id.value}/close`, {
      method: 'POST',
      body: {
        internalNotes: payload.internalNotes
      }
    }))
    if (!result?.ok) return

    toast.add({
      title: 'Dossier clôturé',
      color: 'success'
    })

    await refreshTicket()
  } else if (payload.action.targetStatus) {
    const changed = await changeTicketStatus(payload.action.targetStatus, payload.internalNotes)
    if (!changed) return
  }

  workflowOpen.value = false
  selectedWorkflowAction.value = null
}

async function createQuote() {
  const scope = `ticket-document:${id.value}:quote`
  const attempt = documentMutation.getAttempt(scope, { ticketId: id.value, type: 'quote' }, () => null)
  const result = await saveAction(() => $fetch<DocumentDetail>(`/api/tickets/${id.value}/quote`, {
    method: 'POST',
    headers: { 'Idempotency-Key': attempt.key }
  }))
  if (!result?.ok) return false
  const document = result.data

  toast.add({
    title: 'Devis créé',
    description: `Document #${document.documentNumber}`,
    color: 'success'
  })

  await refreshTicket()
  showCreatedDocumentActions(document)
  documentMutation.complete(scope)
}

async function createOrder() {
  const scope = `ticket-document:${id.value}:customer-order`
  const attempt = documentMutation.getAttempt(scope, { ticketId: id.value, type: 'customer_order' }, () => null)
  const result = await saveAction(() => $fetch<DocumentDetail>(`/api/tickets/${id.value}/order`, {
    method: 'POST',
    headers: { 'Idempotency-Key': attempt.key }
  }))
  if (!result?.ok) return false
  const document = result.data

  toast.add({
    title: 'Commande créée',
    description: `Document #${document.documentNumber}`,
    color: 'success'
  })

  await refreshTicket()
  showCreatedDocumentActions(document)
  documentMutation.complete(scope)
}

async function createInvoice() {
  const scope = `ticket-document:${id.value}:invoice`
  const attempt = documentMutation.getAttempt(scope, { ticketId: id.value, type: 'invoice' }, () => null)
  const result = await saveAction(() => $fetch<DocumentDetail>(`/api/tickets/${id.value}/invoice`, {
    method: 'POST',
    headers: { 'Idempotency-Key': attempt.key }
  }))
  if (!result?.ok) return false
  const document = result.data

  toast.add({
    title: 'Facture créée',
    description: `Document #${document.documentNumber}`,
    color: 'success'
  })

  await refreshTicket()
  showCreatedDocumentActions(document)
  documentMutation.complete(scope)
}

async function markPaid(payload: {
  method: PaymentMethod
  amount: number
  notes: string
}) {
  if (!payableDocument.value) {
    return
  }

  const documentId = payableDocument.value.id
  const attempt = paymentMutation.getAttempt(`ticket-payment:${documentId}`, payload, () => ({
    ...payload,
    paidAt: new Date().toISOString()
  }))

  const result = await saveAction(() => $fetch(`/api/documents/${documentId}/mark-paid`, {
    method: 'POST',
    headers: { 'Idempotency-Key': attempt.key },
    body: attempt.payload
  }))
  if (!result?.ok) return false

  paymentOpen.value = false
  toast.add({
    title: 'Paiement enregistré',
    color: 'success'
  })
  await refreshTicket()
  paymentMutation.complete(`ticket-payment:${documentId}`)
}

function openSmsModal() {
  selectedSmsTemplateId.value = freeSmsTemplateId
  smsLogKey.value = null
  smsModalOpen.value = true
}

async function selectSmsTemplate(template: SmsTemplateRecord) {
  selectedSmsTemplateId.value = template.id
  smsQrLoading.value = true

  try {
    smsQrDataUrl.value = await QRCode.toDataURL(smsHref.value || buildSmsHref(normalizedCustomerPhone.value), {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 320
    })

    const nextLogKey = `${template.id}:${resolvedSmsMessage.value || ''}:${normalizedCustomerPhone.value}`

    if (smsLogKey.value !== nextLogKey && ticket.value) {
      await $fetch(`/api/tickets/${id.value}/sms-qrcode`, {
        method: 'POST',
        body: {
          templateId: template.id === freeSmsTemplateId ? null : template.id,
          templateLabel: template.label,
          mode: template.id === freeSmsTemplateId ? 'free' : 'template'
        }
      })
      smsLogKey.value = nextLogKey
      await refreshTicket()
    }
  } finally {
    smsQrLoading.value = false
  }
}
</script>

<template>
  <UDashboardPanel id="ticket-detail">
    <template #header>
      <UDashboardNavbar :title="ticket?.ticketNumber || 'Détail du dossier'">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            label="Modifier le dossier"
            aria-label="Modifier le dossier"
            icon="i-lucide-pencil"
            color="neutral"
            variant="ghost"
            :to="`/dossiers/${id}/edit`"
            :disabled="dossier.blocked.value || !isTicketMutable"
            :ui="{ label: 'hidden sm:inline' }"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <PosDossierBanner :state="dossier.current.value" :refresh="refreshTicket" />
      <div v-if="ticket" class="space-y-4">
        <PosFormFeedback :saving="actionSaving" :error="actionError" />

        <div class="space-y-1">
          <div class="flex flex-wrap items-center gap-2">
            <h1 class="text-xl font-semibold text-highlighted">
              {{ ticket.brand || 'Appareil' }} {{ ticket.model || '' }}
            </h1>
            <UBadge :color="ticketTypeColors[ticket.type]" variant="subtle" size="sm">
              {{ ticketTypeLabels[ticket.type] }}
            </UBadge>
          </div>
          <p v-if="ticket.issueDescription" class="text-sm text-highlighted whitespace-pre-line wrap-anywhere">
            {{ ticket.issueDescription }}
          </p>
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-toned">
            <UButton
              :label="ticket.customer.displayName"
              icon="i-lucide-user-round"
              color="neutral"
              variant="link"
              class="p-0"
              @click="activeTab = 'client'"
            />
            <span v-if="ticket.customer.phone">{{ ticket.customer.phone }}</span>
            <span class="text-xs">Ouvert le {{ formatDateTime(ticket.openedAt) }}</span>
          </div>
        </div>

        <div class="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
          <section aria-labelledby="ticket-status-heading" class="min-w-0 rounded-xl border border-default bg-default p-4">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="space-y-2">
                <h2 id="ticket-status-heading" class="text-xs font-semibold text-toned">
                  {{ ticket.type === 'repair' ? 'État de la réparation' : 'État du dossier' }}
                </h2>
                <div class="flex flex-wrap items-center gap-2">
                  <UBadge :color="ticketStatusColors[ticket.status]" variant="subtle" size="lg">
                    {{ ticket.workflow.currentStatusLabel }}
                  </UBadge>
                  <span v-if="statusChangedAt" class="text-xs text-toned">
                    Depuis le {{ formatDateTime(statusChangedAt) }}
                  </span>
                </div>
                <p v-if="workshopBlocker" class="flex items-center gap-1.5 text-sm font-medium text-warning">
                  <UIcon name="i-lucide-circle-pause" class="size-4 shrink-0" />
                  {{ workshopBlocker }}
                </p>
              </div>
              <div v-if="isTicketMutable" class="flex flex-wrap gap-2">
                <UButton
                  v-if="primaryWorkflowAction"
                  :label="primaryWorkflowAction.label"
                  :icon="primaryWorkflowAction.icon"
                  :disabled="dossier.blocked.value || actionSaving"
                  @click="openWorkflowAction(primaryWorkflowAction)"
                />
                <UDropdownMenu
                  :items="statusMenuItems"
                  :content="{ align: 'end', side: 'bottom' }"
                  :ui="{ content: 'min-w-64' }"
                >
                  <UButton
                    label="Changer le statut"
                    trailing-icon="i-lucide-chevron-down"
                    color="neutral"
                    variant="outline"
                    :disabled="dossier.blocked.value || actionSaving"
                  />
                </UDropdownMenu>
              </div>
            </div>

            <ol v-if="ticket.status !== 'cancelled'" aria-label="Progression du dossier" class="mt-4 flex border-t border-default pt-3">
              <li
                v-for="(step, index) in ticketWorkflowSteps"
                :key="step"
                :aria-current="index === workflowStepIndex ? 'step' : undefined"
                class="flex min-w-0 flex-1 items-center gap-1 text-xs last:flex-none"
                :class="index <= workflowStepIndex ? 'text-primary' : 'text-toned'"
              >
                <div class="flex flex-col items-center gap-1 sm:flex-row sm:gap-1.5" :class="index === workflowStepIndex ? 'font-semibold' : ''">
                  <UIcon :name="index < workflowStepIndex ? 'i-lucide-circle-check' : index === workflowStepIndex ? 'i-lucide-circle-dot' : 'i-lucide-circle'" class="size-4 shrink-0" />
                  <span>{{ ticketWorkflowStepLabels[step] }}</span>
                </div>
                <span v-if="index < ticketWorkflowSteps.length - 1" aria-hidden="true" class="mx-1 h-px flex-1 bg-current opacity-20 sm:mx-2" />
              </li>
            </ol>
          </section>

          <div class="min-w-0 lg:col-start-1 lg:row-start-2">
            <UTabs
              v-model="activeTab"
              :items="tabItems"
              variant="link"
              :content="false"
              size="sm"
              :ui="{ list: 'w-full overflow-x-auto', trigger: 'shrink-0', leadingIcon: 'hidden sm:block', trailingBadge: 'hidden sm:inline-flex' }"
            />

            <div class="mt-3">
              <div v-if="activeTab === 'overview'" class="space-y-4">
                <section aria-labelledby="ticket-documents-heading" class="overflow-hidden rounded-xl border border-default bg-default">
                  <div class="flex items-center justify-between gap-2 border-b border-default px-4 py-3">
                    <h2 id="ticket-documents-heading" class="text-sm font-semibold text-highlighted">
                      Documents liés <span class="ml-1 font-normal text-toned">{{ ticket.documents.length }}</span>
                    </h2>
                    <UDropdownMenu v-if="createDocumentItems.length" :items="createDocumentItems" :content="{ align: 'end' }">
                      <UButton
                        label="Créer un document"
                        icon="i-lucide-plus"
                        color="neutral"
                        variant="outline"
                        size="sm"
                        :loading="actionSaving"
                        :disabled="dossier.blocked.value"
                        :ui="{ label: 'hidden sm:inline' }"
                        aria-label="Créer un document"
                      />
                    </UDropdownMenu>
                  </div>
                  <div v-if="ticket.documents.length" class="max-h-72 overflow-y-auto">
                    <div class="hidden grid-cols-[minmax(0,1fr)_9rem_7rem_1rem] gap-3 bg-muted/40 px-4 py-2 text-xs text-toned sm:grid" aria-hidden="true">
                      <span>Document</span><span>Statut</span><span class="text-right">Total TTC</span><span />
                    </div>
                    <NuxtLink
                      v-for="document in ticket.documents"
                      :key="document.id"
                      :to="`/documents/${document.id}`"
                      :aria-label="`Ouvrir ${documentTypeLabels[document.type]} ${document.documentNumber} · ${documentStatusLabels[document.status]} · ${formatCurrency(document.total)}`"
                      class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 border-t border-default px-4 py-3 text-sm transition-colors first:border-t-0 hover:bg-elevated/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary sm:grid-cols-[minmax(0,1fr)_9rem_7rem_1rem]"
                    >
                      <div class="min-w-0">
                        <span class="font-medium text-highlighted">{{ documentTypeLabels[document.type] }}</span>
                        <span class="ml-2 text-toned">{{ document.documentNumber }}</span>
                      </div>
                      <UBadge
                        :color="documentStatusColors[document.status]"
                        variant="subtle"
                        size="sm"
                        class="row-start-2 w-fit sm:row-auto"
                      >
                        {{ documentStatusLabels[document.status] }}
                      </UBadge>
                      <span class="col-start-2 row-start-1 text-right font-medium text-highlighted tabular-nums sm:col-auto sm:row-auto">{{ formatCurrency(document.total) }}</span>
                      <UIcon name="i-lucide-chevron-right" class="col-start-2 row-start-2 size-4 justify-self-end text-dimmed sm:col-auto sm:row-auto" />
                    </NuxtLink>
                  </div>
                  <p v-else class="px-4 py-5 text-sm text-toned">
                    {{ createDocumentItems.length ? 'Aucun document lié. Créez un devis, une commande ou une facture.' : 'Aucun document lié à ce dossier.' }}
                  </p>
                </section>
              </div>

              <!-- Payments tab -->
              <div v-else-if="activeTab === 'payments'">
                <UCard :ui="{ body: 'p-4', header: 'p-4 pb-0' }" class="xl:min-h-0">
                  <template #header>
                    <div class="flex items-center justify-between gap-3">
                      <h3 class="text-sm font-medium text-highlighted">
                        Paiements
                      </h3>
                      <span class="text-xs text-toned">
                        {{ ticket.payments.length }} paiement(s)
                      </span>
                    </div>
                  </template>

                  <div class="max-h-96 overflow-auto pr-1">
                    <UTable :data="ticket.payments" :columns="paymentColumns" sticky="header">
                      <template #empty>
                        <UEmpty
                          icon="i-lucide-wallet"
                          title="Aucun paiement"
                          description="Les paiements enregistrés apparaîtront ici."
                        />
                      </template>
                    </UTable>
                  </div>
                </UCard>
              </div>

              <section v-else-if="activeTab === 'sms'" class="rounded-xl border border-default bg-default p-4">
                <h2 class="text-sm font-semibold text-highlighted">
                  Historique QR SMS
                </h2>
                <p class="mt-1 text-xs text-toned">
                  Ouvertures du QR SMS ; elles ne confirment pas l’envoi du message.
                </p>
                <div v-if="smsTimelineItems.length" class="mt-3 max-h-96 divide-y divide-default overflow-y-auto">
                  <div v-for="event in smsTimelineItems" :key="event.id" class="py-3 text-sm">
                    <div class="flex flex-wrap justify-between gap-1">
                      <p class="font-medium text-highlighted">
                        {{ event.title }}
                      </p>
                      <time :datetime="event.occurredAt" class="text-xs text-toned">{{ event.date }}</time>
                    </div>
                    <p class="text-toned">
                      {{ event.description }}
                    </p>
                    <p v-if="event.note" class="mt-1 whitespace-pre-wrap wrap-anywhere">
                      {{ event.note }}
                    </p>
                  </div>
                </div>
                <p v-else class="mt-3 text-sm text-toned">
                  Aucun QR SMS affiché.
                </p>
              </section>

              <!-- Client tab -->
              <div v-else-if="activeTab === 'client'" class="space-y-4 text-sm max-h-[32rem] overflow-y-auto pr-1">
                <div class="grid gap-4 sm:grid-cols-2">
                  <div class="rounded-xl border border-default p-4">
                    <p class="text-xs uppercase tracking-[0.14em] text-toned">
                      Client
                    </p>
                    <p class="mt-2 font-medium text-highlighted">
                      {{ ticket.customer.displayName }}
                    </p>
                    <p class="text-toned">
                      {{ ticket.customer.phone || 'Pas de téléphone' }}
                    </p>
                    <p class="text-toned">
                      {{ ticket.customer.email || 'Pas d\'e-mail' }}
                    </p>
                  </div>

                  <div class="rounded-xl border border-default p-4">
                    <p class="text-xs uppercase tracking-[0.14em] text-toned">
                      Appareil
                    </p>
                    <p class="mt-2 font-medium text-highlighted">
                      {{ ticket.brand || 'Marque ?' }} {{ ticket.model || '' }}
                    </p>
                    <div class="mt-1 space-y-0.5 text-toned">
                      <p>IMEI: {{ ticket.imei || '—' }}</p>
                      <p>S/N: {{ ticket.serialNumber || '—' }}</p>
                      <p>Accès: {{ ticket.accessCode || '—' }}</p>
                      <p>SIM: {{ ticket.simCode || '—' }}</p>
                    </div>
                  </div>
                </div>

                <div class="flex flex-wrap gap-4 text-xs text-toned">
                  <span>Ouvert le {{ formatDateTime(ticket.openedAt) }}</span>
                  <span>MAJ {{ formatDateTime(ticket.updatedAt) }}</span>
                </div>
              </div>
            </div>
          </div>

          <aside aria-label="Actions du comptoir" class="space-y-4 lg:sticky lg:top-0 lg:col-start-2 lg:row-span-3 lg:row-start-1">
            <section aria-labelledby="ticket-payment-heading" class="rounded-xl border border-default bg-default p-4">
              <h2 id="ticket-payment-heading" class="text-sm font-semibold text-highlighted">
                Règlement
              </h2>
              <p class="mt-1 text-xs text-toned">
                {{ ticket.commercialSummary.paymentStateLabel }}
              </p>
              <p v-if="payableDocument" class="mt-1 text-xs text-toned">
                Sur {{ payableDocument.documentNumber }} · acomptes déduits
              </p>
              <dl class="mt-4 space-y-3 text-sm">
                <div class="flex items-baseline justify-between gap-2">
                  <dt class="text-toned">
                    Encaissé
                  </dt>
                  <dd class="font-medium tabular-nums">
                    {{ formatCurrency(ticket.commercialSummary.totalPaid) }}
                  </dd>
                </div>
                <div class="flex flex-wrap items-baseline justify-between gap-2 border-t border-default pt-3">
                  <dt class="font-medium text-highlighted">
                    Reste à payer
                  </dt>
                  <dd class="text-lg font-semibold tabular-nums" :class="ticket.commercialSummary.balanceDue ? 'text-warning' : 'text-highlighted'">
                    {{ formatCurrency(ticket.commercialSummary.balanceDue) }}
                  </dd>
                </div>
              </dl>
              <p v-if="ticket.status === 'ready_for_pickup' && ticket.commercialSummary.balanceDue" class="mt-3 text-xs text-warning">
                À encaisser avant la remise au client.
              </p>
              <UButton
                v-if="canRecordPayment"
                label="Encaisser"
                icon="i-lucide-wallet"
                color="success"
                block
                class="mt-4"
                :disabled="dossier.blocked.value"
                @click="paymentOpen = true"
              />
              <UButton
                v-if="activeTab !== 'payments'"
                label="Voir les paiements"
                color="neutral"
                variant="link"
                block
                size="sm"
                class="mt-2"
                @click="activeTab = 'payments'"
              />
            </section>

            <section aria-labelledby="ticket-counter-heading" class="rounded-xl border border-default bg-default p-4">
              <h2 id="ticket-counter-heading" class="mb-3 text-sm font-semibold text-highlighted">
                Au comptoir
              </h2>
              <div class="space-y-2">
                <UButton
                  label="SMS client"
                  icon="i-lucide-message-square-share"
                  color="neutral"
                  variant="outline"
                  block
                  class="justify-start"
                  :disabled="dossier.blocked.value || !canSendSms"
                  @click="openSmsModal"
                />
                <p v-if="!canSendSms" class="text-xs text-toned">
                  {{ smsButtonHelp }}
                </p>
                <UButton
                  v-if="supportsThermalPrint"
                  :to="`/dossiers/${id}/print`"
                  label="Imprimer le dossier"
                  icon="i-lucide-printer"
                  color="neutral"
                  variant="outline"
                  block
                  class="justify-start"
                  :disabled="dossier.blocked.value"
                />
              </div>
            </section>
          </aside>

          <div v-if="activeTab === 'overview'" class="min-w-0 space-y-4 lg:col-start-1 lg:row-start-3">
            <section v-if="ticket.internalNotes" aria-labelledby="ticket-notes-heading" class="rounded-xl border border-default bg-muted/30 p-4">
              <h2 id="ticket-notes-heading" class="mb-2 flex items-center gap-2 text-sm font-semibold text-highlighted">
                <UIcon name="i-lucide-notebook-pen" class="size-4" /> Notes atelier
              </h2>
              <p class="max-h-36 overflow-y-auto text-sm text-default whitespace-pre-wrap wrap-anywhere">
                {{ ticket.internalNotes }}
              </p>
            </section>

            <section aria-labelledby="ticket-history-heading" class="rounded-xl border border-default bg-default">
              <div class="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <h2 id="ticket-history-heading" class="text-sm font-semibold text-highlighted">
                  Historique récent
                </h2>
                <UButton
                  label="Note interne"
                  aria-label="Ajouter une note interne"
                  icon="i-lucide-message-square-plus"
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  :disabled="dossier.blocked.value"
                  @click="openInternalNote"
                />
              </div>
              <ol v-if="visibleTimelineItems.length" id="ticket-history" class="max-h-72 overflow-y-auto border-t border-default px-4">
                <li v-for="event in visibleTimelineItems" :key="event.id" class="flex gap-3 border-b border-default py-3 last:border-b-0">
                  <UIcon :name="event.icon" class="mt-0.5 size-4 shrink-0 text-toned" />
                  <div class="min-w-0 flex-1 text-sm">
                    <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                      <p class="font-medium text-highlighted">
                        {{ event.title }}
                      </p>
                      <time :datetime="event.occurredAt" class="text-xs text-toned">{{ event.date }}</time>
                    </div>
                    <p class="text-xs text-toned">
                      {{ event.description }}
                    </p>
                    <p v-if="event.note" class="mt-1 whitespace-pre-wrap wrap-anywhere">
                      {{ event.note }}
                    </p>
                    <UBadge
                      v-if="event.isSynthetic"
                      color="neutral"
                      variant="outline"
                      size="xs"
                      class="mt-1"
                    >
                      Reconstruit
                    </UBadge>
                  </div>
                  <UButton
                    v-if="getEventDocumentId(event)"
                    :to="`/documents/${getEventDocumentId(event)}`"
                    :aria-label="`Ouvrir le document · ${event.description}`"
                    icon="i-lucide-arrow-up-right"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    class="self-start"
                  />
                </li>
              </ol>
              <p v-else class="px-4 pb-4 text-sm text-toned">
                Aucun événement enregistré.
              </p>
              <div v-if="timelineItems.length > 4" class="border-t border-default px-4 py-2">
                <UButton
                  :label="showAllHistory ? 'Réduire l’historique' : `Voir tout l’historique (${timelineItems.length})`"
                  :trailing-icon="showAllHistory ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                  :aria-expanded="showAllHistory"
                  aria-controls="ticket-history"
                  color="neutral"
                  variant="link"
                  size="sm"
                  class="px-0"
                  @click="showAllHistory = !showAllHistory"
                />
              </div>
            </section>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>

  <UModal
    v-if="createdCommercialDocument"
    v-model:open="createdDocumentActionsOpen"
    :title="`${documentTypeLabels[createdCommercialDocument.type]} créé`"
    :description="`${createdCommercialDocument.documentNumber} est lié au dossier ${ticket?.ticketNumber || ''}.`"
    :ui="{ content: 'sm:max-w-2xl' }"
    @after:leave="clearCreatedDocumentActions"
  >
    <template #body>
      <div class="space-y-4">
        <div class="rounded-2xl border border-success/20 bg-success/5 px-4 py-4">
          <div class="flex items-start gap-3">
            <div class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-success/10 text-success">
              <UIcon name="i-lucide-file-check-2" class="size-5" />
            </div>
            <div class="min-w-0">
              <p class="text-sm font-medium text-highlighted">
                {{ documentTypeLabels[createdCommercialDocument.type] }} {{ createdCommercialDocument.documentNumber }}
              </p>
              <p class="mt-1 text-sm text-toned">
                {{ createdCommercialDocument.customer.displayName }} · {{ formatCurrency(createdCommercialDocument.total) }}
              </p>
            </div>
          </div>
        </div>

        <div class="grid gap-2 sm:grid-cols-2">
          <UButton
            :disabled="dossier.blocked.value"
            label="Ouvrir le document"
            icon="i-lucide-arrow-up-right"
            color="primary"
            block
            @click="navigateToCreatedDocument(`/documents/${createdCommercialDocument.id}`)"
          />
          <UButton
            v-if="createdDocumentSupportsA4Print"
            :disabled="dossier.blocked.value"
            label="Envoyer par mail"
            icon="i-lucide-mail"
            color="neutral"
            variant="soft"
            block
            @click="navigateToCreatedDocument(`/documents/${createdCommercialDocument.id}?email=1`)"
          />
          <UButton
            v-if="createdDocumentSupportsA4Print"
            :disabled="dossier.blocked.value"
            label="Imprimer A4"
            icon="i-lucide-file-text"
            color="neutral"
            variant="soft"
            block
            @click="navigateToCreatedDocument(`/documents/${createdCommercialDocument.id}/print?profile=a4`)"
          />
          <UButton
            v-if="createdDocumentSupportsThermalPrint"
            :disabled="dossier.blocked.value"
            label="Imprimer thermique"
            icon="i-lucide-printer"
            color="neutral"
            variant="soft"
            block
            @click="navigateToCreatedDocument(`/documents/${createdCommercialDocument.id}/print?profile=thermal`)"
          />
          <UButton
            v-if="createdCommercialDocument.type !== 'invoice' && canCreateInvoice"
            :disabled="dossier.blocked.value"
            label="Créer la facture"
            icon="i-lucide-file-text"
            color="neutral"
            variant="soft"
            block
            :loading="actionSaving"
            @click="createInvoice"
          />
          <UButton
            v-if="canChargeCreatedDocument"
            :disabled="dossier.blocked.value"
            label="Encaisser"
            icon="i-lucide-wallet"
            color="success"
            variant="soft"
            block
            @click="openPaymentForCreatedDocument"
          />
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full justify-end">
        <UButton
          :disabled="dossier.blocked.value"
          label="Rester sur le dossier"
          color="neutral"
          variant="ghost"
          @click="closeCreatedDocumentActions"
        />
      </div>
    </template>
  </UModal>

  <PosTicketWorkflowSlideover
    :key="dossier.current.value?.epoch"
    v-model:open="workflowOpen"
    :action="selectedWorkflowAction"
    :saving="actionSaving || dossier.blocked.value"
    :save-error="actionError"
    :initial-notes="ticket?.internalNotes"
    @submit="handleWorkflowSubmit"
  />

  <UModal
    v-model:open="noteModalOpen"
    :content="noteFocusReturn"
    :dismissible="!noteSaving"
    :close="!noteSaving"
    title="Ajouter une note interne"
    description="Cette note sera horodatée dans le suivi du dossier."
    :ui="{ content: 'sm:max-w-xl' }"
  >
    <template #body>
      <UFormField label="Note" required>
        <UTextarea
          v-model="noteDraft"
          :disabled="dossier.blocked.value || noteSaving"
          :rows="5"
          maxlength="2000"
          autofocus
          class="w-full"
          placeholder="Ex. Client appelé, pièce commandée, test effectué…"
          @keydown.meta.enter="addInternalNote"
          @keydown.ctrl.enter="addInternalNote"
        />
      </UFormField>
      <PosFormFeedback class="mt-3" :saving="noteSaving" :error="noteError" />
    </template>

    <template #footer>
      <div class="flex w-full flex-wrap items-center justify-end gap-2">
        <PosUnsavedChanges :dirty="!!noteDraft" :snapshot="noteDraft" :saving="noteSaving" />
        <UButton
          label="Annuler"
          color="neutral"
          variant="ghost"
          :disabled="dossier.blocked.value || (noteSaving)"
          @click="noteModalOpen = false"
        />
        <UButton
          :label="noteSaving ? 'Enregistrement…' : 'Ajouter la note'"
          icon="i-lucide-message-square-plus"
          :loading="noteSaving"
          :disabled="dossier.blocked.value || (!noteDraft.trim())"
          @click="addInternalNote"
        />
      </div>
    </template>
  </UModal>

  <PosDocumentPaymentSlideover
    v-if="payableDocument"
    :key="dossier.current.value?.epoch"
    v-model:open="paymentOpen"
    :disabled="dossier.blocked.value"
    :balance-due="ticket?.commercialSummary.balanceDue || 0"
    :loading="actionSaving"
    :save-error="actionError"
    @save="markPaid"
  />

  <UModal
    v-model:open="smsModalOpen"
    title="SMS client"
    :description="ticket?.customer.phone ? `Scanner le QR avec l’iPhone pour ouvrir l’app Messages vers ${ticket.customer.displayName}.` : 'Ajoutez un numero de telephone pour utiliser ce flux.'"
    :ui="{ content: 'sm:max-w-5xl' }"
  >
    <template #body>
      <div class="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <div class="space-y-2">
          <p class="text-xs uppercase tracking-[0.18em] text-toned">
            Messages
          </p>

          <UButton
            v-for="template in smsTemplateItems"
            :key="template.id"
            :disabled="dossier.blocked.value"
            :label="template.label"
            :icon="template.id === freeSmsTemplateId ? 'i-lucide-pencil-line' : 'i-lucide-message-circle-more'"
            :color="selectedSmsTemplateId === template.id ? 'primary' : 'neutral'"
            :variant="selectedSmsTemplateId === template.id ? 'solid' : 'soft'"
            block
            class="justify-start"
            @click="selectSmsTemplate(template)"
          />
        </div>

        <div class="space-y-4 rounded-2xl border border-default bg-muted/20 p-4">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p class="text-xs uppercase tracking-[0.18em] text-toned">
                QR code
              </p>
              <p class="text-lg font-semibold text-highlighted">
                {{ selectedSmsTemplate?.label || 'Choisissez un message' }}
              </p>
              <p class="text-sm text-toned">
                {{ normalizedCustomerPhone || 'Numero manquant' }}
              </p>
            </div>

            <UButton
              v-if="smsHref"
              :disabled="dossier.blocked.value"
              :to="smsHref"
              external
              target="_blank"
              color="neutral"
              variant="ghost"
              icon="i-lucide-arrow-up-right"
              label="Ouvrir le lien"
            />
          </div>

          <div class="flex min-h-[22rem] items-center justify-center rounded-2xl border border-dashed border-default bg-white p-6">
            <div v-if="smsQrLoading" class="flex flex-col items-center gap-3 text-sm text-toned">
              <UIcon name="i-lucide-loader-circle" class="size-7 animate-spin" />
              Génération du QR en cours...
            </div>
            <img
              v-else-if="smsQrDataUrl"
              :src="smsQrDataUrl"
              alt="QR code SMS client"
              class="h-auto w-full max-w-[20rem]"
            >
            <div v-else class="text-center text-sm text-toned">
              Choisissez un message pour afficher le QR code.
            </div>
          </div>

          <div class="space-y-2">
            <p class="text-xs uppercase tracking-[0.18em] text-toned">
              Aperçu du message
            </p>
            <div class="rounded-xl border border-default bg-default p-3 text-sm text-highlighted whitespace-pre-line">
              {{ resolvedSmsMessage || 'Aucun texte pré-rempli. L’opérateur saisira le message directement sur l’iPhone.' }}
            </div>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>
