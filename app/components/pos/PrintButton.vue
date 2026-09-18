<script setup lang="ts">
import type { ButtonProps, DropdownMenuItem } from '@nuxt/ui'
import { getDocumentPdfFilename } from '~~/shared/utils/document-email'

const props = withDefaults(defineProps<{
  previewUrl: string
  label: string
  ariaLabel?: string
  documentId?: number
  documentNumber?: string
  icon?: string
  color?: ButtonProps['color']
  variant?: ButtonProps['variant']
  size?: ButtonProps['size']
  disabled?: boolean
  compact?: boolean
  block?: boolean
}>(), {
  icon: 'i-lucide-printer',
  color: 'primary',
  variant: 'solid',
  size: 'md'
})

const toast = useToast()
const printing = ref(false)
const downloading = ref(false)
let frame: HTMLIFrameElement | undefined
let cleanupTimer: ReturnType<typeof setTimeout> | undefined
let trigger: HTMLElement | undefined

function cleanup() {
  clearTimeout(cleanupTimer)
  if (document.activeElement === frame) trigger?.focus()
  frame?.remove()
  frame = undefined
  printing.value = false
}

function printError() {
  cleanup()
  toast.add({ title: 'Impossible de préparer l’impression', description: 'Réessayez ou ouvrez « Voir l’aperçu ».', color: 'error' })
}

onBeforeUnmount(cleanup)

async function print() {
  if (printing.value || props.disabled) return
  cleanup()
  printing.value = true
  trigger = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
  const printFrame = document.createElement('iframe')
  frame = printFrame
  printFrame.title = 'Document à imprimer'
  printFrame.tabIndex = -1
  printFrame.setAttribute('aria-hidden', 'true')
  printFrame.style.cssText = 'position:fixed;left:-10000px;top:0;width:1200px;height:900px;border:0;'
  printFrame.src = props.previewUrl
  document.body.append(printFrame)
  cleanupTimer = setTimeout(printError, 30000)

  try {
    // Wait for Nuxt hydration, including the async QR components, before printing.
    while (!printFrame.contentDocument?.querySelector('[data-print-ready="true"]')) {
      if (frame !== printFrame) return
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    const printWindow = printFrame.contentWindow!
    const printDocument = printFrame.contentDocument!
    await printDocument.fonts.ready
    await Promise.all(Array.from(printDocument.images, img => img.decode()))
    if (frame !== printFrame) return
    printWindow.addEventListener('afterprint', () => {
      if (frame === printFrame) {
        clearTimeout(cleanupTimer)
        cleanupTimer = setTimeout(cleanup, 0)
      }
    }, { once: true })
    // Retain the frame for browsers whose print dialog is asynchronous.
    clearTimeout(cleanupTimer)
    cleanupTimer = setTimeout(cleanup, 5 * 60 * 1000)
    printWindow.focus()
    printWindow.print()
    printing.value = false
  } catch {
    if (frame === printFrame) printError()
  }
}

async function download() {
  if (!props.documentId || downloading.value || props.disabled) return
  downloading.value = true
  try {
    const pdf = await $fetch<Blob>(`/api/documents/${props.documentId}/pdf`, { responseType: 'blob' })
    const url = URL.createObjectURL(pdf)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = getDocumentPdfFilename({ documentNumber: props.documentNumber || `document-${props.documentId}` })
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  } catch {
    toast.add({ title: 'Impossible de télécharger le PDF', description: 'Veuillez réessayer.', color: 'error' })
  } finally {
    downloading.value = false
  }
}

const items = computed<DropdownMenuItem[]>(() => [
  { label: 'Voir l’aperçu', icon: 'i-lucide-eye', to: props.previewUrl },
  ...(props.documentId ? [{ label: 'Télécharger le PDF (A4)', icon: 'i-lucide-download', onSelect: download }] : [])
])
</script>

<template>
  <UFieldGroup :size="size" :class="block ? 'flex w-full' : 'inline-flex'">
    <UButton
      :label="label"
      :aria-label="ariaLabel || label"
      :icon="icon"
      :color="color"
      :variant="variant"
      :disabled="disabled || downloading"
      :loading="printing"
      :class="block ? 'min-w-0 flex-1 justify-center' : undefined"
      :ui="{ label: compact ? 'hidden sm:inline' : undefined }"
      @click="print"
    />
    <UDropdownMenu :items="items" :content="{ align: 'end' }">
      <UButton
        icon="i-lucide-chevron-down"
        :aria-label="`Options — ${ariaLabel || label}`"
        :color="color"
        :variant="variant"
        :disabled="disabled || printing || downloading"
        :loading="downloading"
        class="px-2"
      />
    </UDropdownMenu>
  </UFieldGroup>
</template>
