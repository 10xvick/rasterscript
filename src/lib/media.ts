/**
 * Shared media utilities — pure functions, no React, no Zustand.
 *
 * Single source of truth for:
 *   - Loading files as HTMLImageElement
 *   - Probing video/image metadata (dimensions, duration)
 *   - Extracting a video frame at a specific time as a canvas
 *
 * Previously `loadImageFromFile` was duplicated inside
 * `plugins/spritesheet/operations.ts`. It now lives here so both the
 * spritesheet plugin and the video plugin can import it without copying.
 */

// ─── Image loading ────────────────────────────────────────────────────────────

/**
 * Load a File (or Blob) as a fully decoded HTMLImageElement.
 * The object URL is automatically revoked after load.
 */
export function loadImageFromFile(file: File | Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file)
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload  = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`Failed to decode image: ${(file as File).name ?? 'blob'}`)) }
    img.src = url
  })
}

// ─── Metadata probing ─────────────────────────────────────────────────────────

export interface ImageMetadata {
  width: number
  height: number
}

export interface VideoMetadata extends ImageMetadata {
  duration: number
}

export interface MediaMetadata extends VideoMetadata {
  isVideo: boolean
  isGif:   boolean
}

/** Probe a video File and return its intrinsic dimensions + duration. */
export function probeVideoMetadata(file: File): Promise<VideoMetadata> {
  const url = URL.createObjectURL(file)
  return new Promise((resolve, reject) => {
    const video     = document.createElement('video')
    video.preload   = 'metadata'
    video.muted     = true
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url)
      resolve({ width: video.videoWidth, height: video.videoHeight, duration: video.duration })
    }
    video.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`Failed to probe video: ${file.name}`)) }
    video.src = url
  })
}

/** Probe an image File and return its natural dimensions. */
export async function probeImageMetadata(file: File): Promise<ImageMetadata> {
  const img = await loadImageFromFile(file)
  return { width: img.naturalWidth, height: img.naturalHeight }
}

/**
 * Auto-detect whether the file is a video or static image and probe accordingly.
 * Returns a unified `MediaMetadata` object so callers don't need to branch.
 */
export async function probeMediaMetadata(file: File): Promise<MediaMetadata> {
  const isVideo = file.type.startsWith('video/')
  const isGif   = file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif')

  if (isVideo || isGif) {
    const meta = await probeVideoMetadata(file)
    return { ...meta, isVideo, isGif }
  }

  const meta = await probeImageMetadata(file)
  return { ...meta, duration: 0, isVideo: false, isGif: false }
}

// ─── Frame extraction ─────────────────────────────────────────────────────────

/**
 * Seek a video File to `timeSeconds` and capture that frame as a canvas.
 *
 * @param file        - Source video file.
 * @param timeSeconds - Seek target (clamped to [0, duration]).
 * @param width       - Optional output width (preserves AR if height omitted).
 * @param height      - Optional output height.
 */
export function extractFrameToCanvas(
  file: File,
  timeSeconds: number,
  width?: number,
  height?: number,
): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(file)
  return new Promise<HTMLCanvasElement>((resolve, reject) => {
    const video   = document.createElement('video')
    video.preload = 'metadata'
    video.muted   = true
    video.src     = url

    video.onloadedmetadata = () => {
      video.currentTime = Math.max(0, Math.min(timeSeconds, video.duration))
    }

    video.onseeked = () => {
      URL.revokeObjectURL(url)
      const w = width  ?? video.videoWidth
      const h = height ?? (width ? Math.round(video.videoHeight * (width / video.videoWidth)) : video.videoHeight)
      const canvas = document.createElement('canvas')
      canvas.width  = w
      canvas.height = h
      canvas.getContext('2d')!.drawImage(video, 0, 0, w, h)
      video.src = '' // release
      resolve(canvas)
    }

    video.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`Frame extraction failed: ${file.name}`)) }
  })
}

/**
 * Generate a small thumbnail from a video file at a given time.
 * Returns a persistent blob URL — caller is responsible for revoking it.
 *
 * @param file        - Source video file.
 * @param timeSeconds - Frame time (default: 0).
 * @param thumbWidth  - Thumbnail width in px (default: 160).
 */
export async function generateVideoThumbnail(
  file: File,
  timeSeconds = 0,
  thumbWidth   = 160,
): Promise<string> {
  const canvas = await extractFrameToCanvas(file, timeSeconds, thumbWidth)
  return new Promise<string>((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) { reject(new Error('Thumbnail blob generation failed')); return }
      resolve(URL.createObjectURL(blob))
    }, 'image/jpeg', 0.75)
  })
}

/**
 * Generate a thumbnail from a static image file.
 * Returns a persistent blob URL — caller is responsible for revoking it.
 */
export async function generateImageThumbnail(file: File, thumbWidth = 160): Promise<string> {
  const img    = await loadImageFromFile(file)
  const aspect = img.naturalHeight / img.naturalWidth
  const canvas = document.createElement('canvas')
  canvas.width  = thumbWidth
  canvas.height = Math.round(thumbWidth * aspect)
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)

  return new Promise<string>((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) { reject(new Error('Thumbnail blob generation failed')); return }
      resolve(URL.createObjectURL(blob))
    }, 'image/jpeg', 0.75)
  })
}
