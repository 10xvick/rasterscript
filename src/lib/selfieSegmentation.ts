import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision'

let segmenterInstance: any = null

export async function getSegmenterModel(): Promise<any> {
  if (segmenterInstance) return segmenterInstance

  const baseUrl = (import.meta.env.BASE_URL || '/').replace(/\/$/, '')
  const localWasm = window.location.origin + baseUrl + '/wasm'
  const modelPath = baseUrl + '/models/selfie_segmenter.tflite'

  let vision: any = null
  try {
    vision = await FilesetResolver.forVisionTasks(localWasm)
  } catch (e) {
    console.warn('[LiteRT] Local WASM path failed, trying CDN fallback...', e)
    vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.15/wasm'
    )
  }

  try {
    // Attempt 1: Hardware Accelerated GPU
    segmenterInstance = await ImageSegmenter.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: modelPath,
        delegate: 'GPU'
      },
      runningMode: 'IMAGE',
      outputCategoryMask: false,
      outputConfidenceMasks: true
    })
    console.log('[AI] Segmenter ready (GPU).')
  } catch (gpuError) {
    // Attempt 2: Fallback to CPU
    segmenterInstance = await ImageSegmenter.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: modelPath,
        delegate: 'CPU'
      },
      runningMode: 'IMAGE',
      outputCategoryMask: false,
      outputConfidenceMasks: true
    })
    console.log('[AI] Segmenter ready (CPU).')
  }

  return segmenterInstance
}

export async function applySelfieSegmentation(
  input: HTMLCanvasElement | HTMLVideoElement | HTMLImageElement,
  outputCanvas: HTMLCanvasElement,
  edgeShift: number = -10,   // -50 to 50
  feathering: number = 20,   // 0 to 100
  invertCutout: boolean = false
) {
  const segmenter = await getSegmenterModel()
  if (!segmenter) {
    throw new Error('MediaPipe ImageSegmenter model could not be initialized.')
  }

  const rawW =
    (input as HTMLImageElement).naturalWidth ||
    (input as HTMLImageElement).width ||
    (input as HTMLVideoElement).videoWidth ||
    (input as HTMLCanvasElement).width ||
    outputCanvas.width ||
    0

  const rawH =
    (input as HTMLImageElement).naturalHeight ||
    (input as HTMLImageElement).height ||
    (input as HTMLVideoElement).videoHeight ||
    (input as HTMLCanvasElement).height ||
    outputCanvas.height ||
    0

  const inputW = Math.max(1, Math.floor(rawW))
  const inputH = Math.max(1, Math.floor(rawH))

  outputCanvas.width = inputW
  outputCanvas.height = inputH

  const ctx = outputCanvas.getContext('2d', { willReadFrequently: true })
  const inCanvas = input as HTMLCanvasElement
  if (inCanvas.width <= 0 || inCanvas.height <= 0) {
    throw new Error(`Input element dimension is 0x0 (width: ${inCanvas.width}, height: ${inCanvas.height})`)
  }

  ctx.drawImage(input, 0, 0, inputW, inputH)

  const segmentationResult = await segmenter.segment(input)

  if (segmentationResult && segmentationResult.confidenceMasks && segmentationResult.confidenceMasks.length > 0) {
    const masks = segmentationResult.confidenceMasks
    // Extract person mask index (index 1 if multiple, else index 0)
    const maskIndex = masks.length > 1 ? 1 : 0
    const maskData = masks[maskIndex].getAsFloat32Array()

    const imageData = ctx.getImageData(0, 0, inputW, inputH)
    const pixels = imageData.data

    // Shift midpoint: negative (shrink) raises midpoint, positive (expand) lowers it
    const shiftAmt = edgeShift / 100
    const midpoint = Math.max(0.01, Math.min(0.99, 0.5 - shiftAmt))

    const blurSpread = feathering === 0 ? 0.001 : feathering / 100

    let lower = Math.max(0.0, midpoint - blurSpread * 0.5)
    let upper = Math.min(1.0, midpoint + blurSpread * 0.5)

    if (lower === upper) upper = lower + 0.001

    for (let i = 0; i < maskData.length; i++) {
      let conf = maskData[i]

      if (invertCutout) conf = 1.0 - conf

      let alpha: number
      if (conf <= lower) {
        alpha = 0
      } else if (conf >= upper) {
        alpha = 255
      } else {
        // Smoothstep interpolation between dynamic bounds
        const t = (conf - lower) / (upper - lower)
        const smoothT = t * t * (3 - 2 * t)
        alpha = smoothT * 255
      }

      pixels[i * 4 + 3] = alpha
    }

    ctx.putImageData(imageData, 0, 0)
  }
}
