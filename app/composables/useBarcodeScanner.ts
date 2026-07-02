import { BarcodeDetector, prepareZXingModule, type BarcodeFormat } from 'barcode-detector/ponyfill'

type BarcodeScannerOptions = {
  formats?: BarcodeFormat[]
  onDetected?: (value: string) => void
}

const SCANNER_WASM_PATH = '/vendor/zxing/zxing_reader.wasm'
const SCAN_INTERVAL_MS = 180
let scannerEnginePromise: Promise<unknown> | null = null

function prepareScannerEngine() {
  scannerEnginePromise ??= prepareZXingModule({
    overrides: {
      locateFile: (path: string, prefix: string) => path.endsWith('.wasm') ? SCANNER_WASM_PATH : `${prefix}${path}`
    },
    fireImmediately: true
  })

  return scannerEnginePromise
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
  let scanTimerId: ReturnType<typeof setTimeout> | null = null
  let scanSessionId = 0
  let lastDetectedAt = 0
  let consecutiveDetectionErrors = 0
  let cropCanvas: HTMLCanvasElement | null = null

  async function start(video: HTMLVideoElement) {
    stop()

    error.value = null
    videoRef.value = video
    lastDetectedAt = 0
    consecutiveDetectionErrors = 0
    const sessionId = ++scanSessionId

    try {
      await prepareScannerEngine()
      detector = new BarcodeDetector({ formats })
    } catch {
      isSupported.value = false
      error.value = 'Lecteur de code-barres indisponible. Rechargez la page et réessayez.'
      return
    }

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      })

      video.srcObject = stream
      await waitForVideo(video)
      await video.play()

      if (sessionId !== scanSessionId) {
        return
      }

      isScanning.value = true
      detect(sessionId)
    } catch {
      error.value = 'Impossible d\'accéder à la caméra. Vérifiez les permissions.'
      stop()
    }
  }

  async function detect(sessionId: number) {
    if (sessionId !== scanSessionId || !detector || !videoRef.value || !isScanning.value) {
      return
    }

    try {
      const barcodes = await detectBarcodes()

      if (sessionId !== scanSessionId || !isScanning.value) {
        return
      }

      consecutiveDetectionErrors = 0

      if (barcodes.length > 0) {
        const now = Date.now()

        if (now - lastDetectedAt > 1000) {
          lastDetectedAt = now
          const value = barcodes[0]!.rawValue
          lastValue.value = value
          onDetected?.(value)
        }
      }
    } catch {
      if (sessionId === scanSessionId && isScanning.value) {
        consecutiveDetectionErrors += 1

        if (consecutiveDetectionErrors >= 3) {
          error.value = 'Le lecteur n’arrive pas à analyser l’image. Fermez le scanner puis réessayez.'
          stop()
          return
        }
      }
    }

    if (sessionId === scanSessionId && isScanning.value) {
      scanTimerId = setTimeout(() => detect(sessionId), SCAN_INTERVAL_MS)
    }
  }

  async function detectBarcodes() {
    const video = videoRef.value

    if (!detector || !video) {
      return []
    }

    const fullFrameBarcodes = await detector.detect(video)

    if (fullFrameBarcodes.length > 0) {
      return fullFrameBarcodes
    }

    const cropImageData = getCenterCropImageData(video)

    if (!cropImageData) {
      return []
    }

    return detector.detect(cropImageData)
  }

  function getCenterCropImageData(video: HTMLVideoElement) {
    const sourceWidth = video.videoWidth
    const sourceHeight = video.videoHeight

    if (sourceWidth === 0 || sourceHeight === 0) {
      return null
    }

    cropCanvas ??= document.createElement('canvas')

    const cropWidth = Math.floor(sourceWidth * 0.86)
    const cropHeight = Math.floor(sourceHeight * 0.52)
    const cropX = Math.floor((sourceWidth - cropWidth) / 2)
    const cropY = Math.floor((sourceHeight - cropHeight) / 2)
    const targetWidth = 960
    const targetHeight = Math.max(240, Math.round(targetWidth * (cropHeight / cropWidth)))

    cropCanvas.width = targetWidth
    cropCanvas.height = targetHeight

    const context = cropCanvas.getContext('2d', { willReadFrequently: true })

    if (!context) {
      return null
    }

    context.drawImage(video, cropX, cropY, cropWidth, cropHeight, 0, 0, targetWidth, targetHeight)
    return context.getImageData(0, 0, targetWidth, targetHeight)
  }

  function waitForVideo(video: HTMLVideoElement) {
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA && video.videoWidth > 0 && video.videoHeight > 0) {
      return Promise.resolve()
    }

    return new Promise<void>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        cleanup()
        reject(new Error('Camera initialization timed out.'))
      }, 4000)

      function cleanup() {
        clearTimeout(timeoutId)
        video.removeEventListener('loadedmetadata', handleReady)
        video.removeEventListener('canplay', handleReady)
      }

      function handleReady() {
        if (video.videoWidth === 0 || video.videoHeight === 0) {
          return
        }

        cleanup()
        resolve()
      }

      video.addEventListener('loadedmetadata', handleReady)
      video.addEventListener('canplay', handleReady)
    })
  }

  function stop() {
    scanSessionId += 1
    isScanning.value = false

    if (scanTimerId !== null) {
      clearTimeout(scanTimerId)
      scanTimerId = null
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
