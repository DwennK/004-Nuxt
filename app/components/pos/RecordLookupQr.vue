<script setup lang="ts">
import QRCode from 'qrcode'
import { buildRecordQrUrl, type RecordQrType } from '~~/shared/utils/record-qr'

const props = defineProps<{ type: RecordQrType, id: number, compact?: boolean }>()
const appOrigin = useRequestURL().origin
const url = computed(() => buildRecordQrUrl(props.type, props.id, appOrigin))
const label = computed(() => props.type === 'tickets' ? 'Ouvrir le ticket' : 'Ouvrir le document')
const { data: qr } = await useAsyncData(
  () => `record-qr-${url.value}`,
  () => QRCode.toDataURL(url.value, { errorCorrectionLevel: 'M', margin: 4, width: 300 }),
  { watch: [url] }
)
</script>

<template>
  <div v-if="qr" class="record-lookup" :class="{ 'record-lookup--compact': compact }">
    <img :src="qr" :alt="label" class="record-lookup-qr">
  </div>
</template>

<style scoped>
.record-lookup {
  break-inside: avoid;
  margin-top: 2mm;
  color: #000;
  font-size: 7pt;
  line-height: 1.3;
}
.record-lookup-qr {
  display: block;
  width: 25mm;
  height: 25mm;
}
.record-lookup--compact {
  display: flex;
  align-items: center;
  gap: 2mm;
  padding-block: 2mm;
  border-bottom: 0.35mm solid #000;
  font-weight: 700;
}
.record-lookup--compact .record-lookup-qr {
  width: 24mm;
  height: 24mm;
  flex-shrink: 0;
}
</style>
