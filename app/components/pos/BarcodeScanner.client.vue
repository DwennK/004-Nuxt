<script setup lang="ts">
const props = withDefaults(defineProps<{
  title?: string
  description?: string
  triggerLabel?: string
  triggerIcon?: string
  triggerSize?: string
  triggerAriaLabel?: string
}>(), {
  title: 'Scanner un code-barres',
  description: 'Placez le code-barres ou QR code dans le cadre de la caméra.',
  triggerLabel: '',
  triggerIcon: 'i-lucide-scan-barcode',
  triggerSize: 'md',
  triggerAriaLabel: 'Scanner un code-barres'
})

const open = ref(false)

const emit = defineEmits<{
  scanned: [value: string]
}>()

const videoEl = ref<HTMLVideoElement | null>(null)

const { isScanning, error, start, stop } = useBarcodeScanner({
  onDetected(value) {
    emit('scanned', value)
    close()
  }
})

function close() {
  stop()
  open.value = false
}

watch(open, async (value) => {
  if (value) {
    await nextTick()
    if (videoEl.value) {
      await start(videoEl.value)
    }
  } else {
    stop()
  }
})
</script>

<template>
  <UModal
    v-model:open="open"
    :title="props.title"
    :description="props.description"
  >
    <UButton
      type="button"
      :icon="props.triggerIcon"
      :label="props.triggerLabel || undefined"
      color="neutral"
      variant="soft"
      :size="props.triggerSize as any"
      :aria-label="props.triggerAriaLabel"
    />

    <template #body>
      <div class="space-y-4">
        <div class="relative overflow-hidden rounded-2xl bg-black">
          <video
            ref="videoEl"
            autoplay
            playsinline
            muted
            class="aspect-video w-full object-cover"
          />

          <div
            v-if="isScanning"
            class="pointer-events-none absolute inset-0 flex items-center justify-center"
          >
            <div class="h-36 w-4/5 max-w-96 rounded-2xl border-2 border-white/50" />
          </div>

          <div
            v-if="!isScanning && !error"
            class="absolute inset-0 flex items-center justify-center bg-black/60"
          >
            <div class="text-center text-white">
              <UIcon name="i-lucide-camera" class="mx-auto size-8 text-white/60" />
              <p class="mt-2 text-sm">
                Initialisation de la caméra...
              </p>
            </div>
          </div>
        </div>

        <UAlert
          v-if="error"
          color="error"
          variant="soft"
          icon="i-lucide-camera-off"
          :title="error"
        />

        <div class="flex justify-end">
          <UButton
            label="Fermer"
            color="neutral"
            variant="soft"
            @click="close"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
