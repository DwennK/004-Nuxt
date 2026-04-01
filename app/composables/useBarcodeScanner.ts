import { BarcodeDetector, type BarcodeFormat } from 'barcode-detector/pure'

type BarcodeScannerOptions = {
  formats?: BarcodeFormat[]
  onDetected?: (value: string) => void
}

export function useBarcodeScanner(options: BarcodeScannerOptions = {}) {
  const {
    formats = ['ean_13', 'ean_8', 'code_128', 'code_39', 'qr_code', 'data_matrix'],
    onDetected
  } = options

  const isSupported = ref(true)
  const isScanning = ref(false)
  const lastValue = ref<string | null>(null)
  const error = ref<string | null>(null)
  const videoRef = ref<HTMLVideoElement | null>(null)

  let stream: MediaStream | null = null
  let detector: InstanceType<typeof BarcodeDetector> | null = null
  let animationFrameId: number | null = null
  let lastDetectedAt = 0

  async function start(video: HTMLVideoElement) {
    error.value = null
    videoRef.value = video

    try {
      detector = new BarcodeDetector({ formats })
    }
    catch {
      isSupported.value = false
      error.value = 'BarcodeDetector non supporté sur ce navigateur.'
      return
    }

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      })

      video.srcObject = stream
      await video.play()
      isScanning.value = true
      detect()
    }
    catch {
      error.value = 'Impossible d\'accéder à la caméra. Vérifiez les permissions.'
    }
  }

  async function detect() {
    if (!detector || !videoRef.value || !isScanning.value) {
      return
    }

    try {
      const barcodes = await detector.detect(videoRef.value)

      if (barcodes.length > 0) {
        const now = Date.now()

        if (now - lastDetectedAt > 1000) {
          lastDetectedAt = now
          const value = barcodes[0]!.rawValue
          lastValue.value = value
          onDetected?.(value)
        }
      }
    }
    catch {
      // Frame detection error, continue scanning
    }

    animationFrameId = requestAnimationFrame(detect)
  }

  function stop() {
    isScanning.value = false

    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId)
      animationFrameId = null
    }

    if (stream) {
      stream.getTracks().forEach(track => track.stop())
      stream = null
    }

    if (videoRef.value) {
      videoRef.value.srcObject = null
    }
  }

  onUnmounted(stop)

  return {
    isSupported,
    isScanning,
    lastValue,
    error,
    start,
    stop
  }
}
