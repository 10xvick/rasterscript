/**
 * Spritesheet pure operations.
 *
 * All processing logic — no React, no Zustand, no UI concerns.
 * Called by `SpritesheetPanel.tsx`.  Results are passed back via
 * `onStatus` callbacks and return values so the panel can update state.
 *
 * Using shared utilities:
 *   - `hexToRgb` / `chromaKey` from `src/lib/color.ts`   (one source of truth)
 *   - `getFFmpeg`              from `src/lib/ffmpeg.ts`   (shared singleton)
 *   - `downloadBlob`           from `src/lib/download.ts` (one impl)
 */

import { fetchFile } from '@ffmpeg/util'
import { hexToRgb, chromaKey } from '../../lib/color'
import { getFFmpeg } from '../../lib/ffmpeg'
import { downloadBlob } from '../../lib/download'
import { loadImageFromFile } from '../../lib/media'

// ─── Shared params type ───────────────────────────────────────────────────────

export interface SpritesheetParams {
  file: File
  frameWidth: number
  frameHeight: number
  fps: number
  startTime: number
  endTime: number
  maxFrames: number
  columns: number
  padding: number
  removeBg: boolean
  bgKeyColor: string
  bgThreshold: number
  duration: number
  originalWidth: number
  originalHeight: number
}


/** Apply chroma key to a canvas context using the shared utility. */
function applyChromaKeyToCtx(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  bgKeyColor: string,
  bgThreshold: number,
): void {
  const imgData = ctx.getImageData(0, 0, w, h)
  chromaKey(imgData.data, hexToRgb(bgKeyColor), bgThreshold)
  ctx.putImageData(imgData, 0, 0)
}

// ─── Preview static spritesheet ───────────────────────────────────────────────

/**
 * Load a static image file as a spritesheet canvas.
 * Returns the canvas and frame count without writing history.
 */
export async function previewStaticSpritesheet(
  params: SpritesheetParams,
  onStatus: (msg: string) => void,
): Promise<{ canvas: HTMLCanvasElement; numFrames: number }> {
  const { file, frameWidth, frameHeight, padding, maxFrames, removeBg, bgKeyColor, bgThreshold } = params

  onStatus('Loading spritesheet image...')

  const img    = await loadImageFromFile(file)
  const canvas = document.createElement('canvas')
  canvas.width  = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0)

  if (removeBg) {
    applyChromaKeyToCtx(ctx, canvas.width, canvas.height, bgKeyColor, bgThreshold)
  }

  const cols       = Math.floor((img.naturalWidth  + padding) / (frameWidth  + padding))
  const rows       = Math.floor((img.naturalHeight + padding) / (frameHeight + padding))
  const totalFrames = Math.min(maxFrames, cols * rows)

  if (totalFrames <= 0) {
    throw new Error('Frame Width/Height exceeds image dimensions or is zero.')
  }

  // Slice static canvas into frames for DocumentModel
  const frameImages: ImageData[] = []
  for (let i = 0; i < totalFrames; i++) {
    const col = i % cols
    const row = Math.floor(i / cols)
    const sx = col * (frameWidth + padding)
    const sy = row * (frameHeight + padding)
    const frameCtx = document.createElement('canvas').getContext('2d')!
    frameCtx.canvas.width = frameWidth
    frameCtx.canvas.height = frameHeight
    frameCtx.drawImage(canvas, sx, sy, frameWidth, frameHeight, 0, 0, frameWidth, frameHeight)
    frameImages.push(frameCtx.getImageData(0, 0, frameWidth, frameHeight))
  }
  useDocumentStore.getState().setFrames(frameImages)
  useDocumentStore.getState().configureSpritesheetLayout({
    cols,
    rows,
    tileWidth: frameWidth,
    tileHeight: frameHeight,
    padding,
  })

  onStatus('Loaded static spritesheet animation!')
  return { canvas, numFrames: totalFrames }
}

// ─── Compile video/GIF → spritesheet ─────────────────────────────────────────

/**
 * Extract frames from a video or GIF file and assemble them into a grid canvas.
 * Progress is reported via `onStatus` and `onLog`.
 */
export async function compileSpritesheet(
  params: SpritesheetParams,
  onStatus: (msg: string) => void,
  onLog:    (msg: string) => void,
): Promise<{ canvas: HTMLCanvasElement; numFrames: number }> {
  const {
    file, frameWidth, frameHeight, fps, startTime, endTime, maxFrames,
    columns, padding, removeBg, bgKeyColor, bgThreshold,
    duration, originalWidth, originalHeight,
  } = params

  onStatus('Loading WebAssembly compiler...')
  const ffmpeg = await getFFmpeg(onLog)

  onStatus('Importing file...')
  const extension = file.name.split('.').pop() || 'mp4'
  const inputName = `input.${extension}`
  await ffmpeg.writeFile(inputName, await fetchFile(file))

  onStatus('Processing media frames (FFmpeg)...')
  const vfFilters: string[] = [`fps=${fps}`]
  if (frameWidth !== originalWidth || frameHeight !== originalHeight) {
    vfFilters.push(`scale=${frameWidth}:${frameHeight}`)
  }

  const args: string[] = []
  if (duration > 0) { args.push('-ss', String(startTime), '-to', String(endTime)) }
  args.push('-i', inputName, '-vf', vfFilters.join(','), 'frame_%04d.png')
  await ffmpeg.exec(args)

  onStatus('Reading generated frames...')
  const dirContents = await ffmpeg.listDir('.')
  const frameFiles = (dirContents as { name: string; isDir: boolean }[])
    .filter(f => f.name.startsWith('frame_') && f.name.endsWith('.png'))
    .map(f => f.name)
    .sort()

  if (frameFiles.length === 0) {
    throw new Error('No frames were generated. Check your start/end range or sampling FPS.')
  }

  const filesToProcess = frameFiles.slice(0, maxFrames)
  const numFrames      = filesToProcess.length

  onStatus(`Assembling grid of ${numFrames} frames...`)
  const rgbKey  = hexToRgb(bgKeyColor)
  const frames: HTMLCanvasElement[] = []

  for (const filename of filesToProcess) {
    const data = (await ffmpeg.readFile(filename)) as Uint8Array
    const blob = new Blob([data as BlobPart], { type: 'image/png' })
    const img  = await loadImageFromFile(new File([blob], filename))

    const fCanvas = document.createElement('canvas')
    fCanvas.width  = frameWidth
    fCanvas.height = frameHeight
    const fCtx    = fCanvas.getContext('2d')!
    fCtx.drawImage(img, 0, 0)

    if (removeBg) {
      const imgData = fCtx.getImageData(0, 0, frameWidth, frameHeight)
      chromaKey(imgData.data, rgbKey, bgThreshold)
      fCtx.putImageData(imgData, 0, 0)
    }

    frames.push(fCanvas)
    URL.revokeObjectURL('')
    await ffmpeg.deleteFile(filename)
  }

  await ffmpeg.deleteFile(inputName)

  // Assemble grid
  const cols        = Math.min(columns, numFrames)
  const rows        = Math.ceil(numFrames / cols)
  const totalWidth  = cols * frameWidth  + (cols - 1) * padding
  const totalHeight = rows * frameHeight + (rows - 1) * padding

  const output = document.createElement('canvas')
  output.width  = totalWidth
  output.height = totalHeight
  const oCtx    = output.getContext('2d')!

  const frameDataList: ImageData[] = []
  frames.forEach((frame, idx) => {
    const col = idx % cols
    const row = Math.floor(idx / cols)
    oCtx.drawImage(frame, col * (frameWidth + padding), row * (frameHeight + padding))
    const fCtx = frame.getContext('2d')!
    frameDataList.push(fCtx.getImageData(0, 0, frameWidth, frameHeight))
  })

  useDocumentStore.getState().setFrames(frameDataList)
  useDocumentStore.getState().configureSpritesheetLayout({
    cols,
    rows,
    tileWidth: frameWidth,
    tileHeight: frameHeight,
    padding,
  })

  onStatus('Completed successfully!')
  return { canvas: output, numFrames }
}

// ─── Export spritesheet → animation ──────────────────────────────────────────

/**
 * Slice a spritesheet canvas into individual frames and compile to GIF or MP4.
 * Triggers a download automatically on success.
 */
export async function exportToAnimation(
  params: SpritesheetParams,
  format: 'gif' | 'mp4',
  onStatus: (msg: string) => void,
  onLog:    (msg: string) => void,
): Promise<void> {
  const {
    file, frameWidth, frameHeight, fps, maxFrames,
    columns, padding, removeBg, bgKeyColor, bgThreshold,
  } = params

  onStatus('Loading WebAssembly compiler...')
  const img = await loadImageFromFile(file)

  const sourceCanvas = document.createElement('canvas')
  sourceCanvas.width  = img.naturalWidth
  sourceCanvas.height = img.naturalHeight
  const sCtx = sourceCanvas.getContext('2d')!
  sCtx.drawImage(img, 0, 0)

  if (removeBg) {
    applyChromaKeyToCtx(sCtx, sourceCanvas.width, sourceCanvas.height, bgKeyColor, bgThreshold)
  }

  const cols        = Math.floor((img.naturalWidth  + padding) / (frameWidth  + padding))
  const rows        = Math.floor((img.naturalHeight + padding) / (frameHeight + padding))
  const totalFrames = Math.min(maxFrames, cols * rows)

  if (totalFrames <= 0) throw new Error('Frame Width/Height exceeds image dimensions or is zero.')

  const ffmpeg = await getFFmpeg(onLog)
  onStatus(`Slicing & writing ${totalFrames} frames...`)

  for (let idx = 0; idx < totalFrames; idx++) {
    const col = idx % columns
    const row = Math.floor(idx / columns)
    const sx  = col * (frameWidth  + padding)
    const sy  = row * (frameHeight + padding)

    const fCanvas = document.createElement('canvas')
    fCanvas.width  = frameWidth
    fCanvas.height = frameHeight
    const fCtx    = fCanvas.getContext('2d')!
    fCtx.drawImage(sourceCanvas, sx, sy, frameWidth, frameHeight, 0, 0, frameWidth, frameHeight)

    const frameBlob = await new Promise<Blob>((resolve, reject) => {
      fCanvas.toBlob(b => b ? resolve(b) : reject(new Error('Canvas to blob failed')), 'image/png')
    })
    const frameData = new Uint8Array(await frameBlob.arrayBuffer())
    const filename  = `frame_${String(idx + 1).padStart(4, '0')}.png`
    await ffmpeg.writeFile(filename, frameData)
  }

  onStatus(`Compiling to ${format.toUpperCase()}...`)
  const outputName = `output.${format}`
  const args: string[] = format === 'gif'
    ? ['-f', 'image2', '-framerate', String(fps), '-i', 'frame_%04d.png', outputName]
    : ['-f', 'image2', '-framerate', String(fps), '-i', 'frame_%04d.png',
       '-c:v', 'libx264', '-pix_fmt', 'yuv420p', outputName]

  await ffmpeg.exec(args)

  onStatus('Saving animation file...')
  const data     = (await ffmpeg.readFile(outputName)) as Uint8Array
  const mimeType = format === 'gif' ? 'image/gif' : 'video/mp4'
  const blob     = new Blob([data as unknown as BlobPart], { type: mimeType })
  downloadBlob(blob, `${file.name.replace(/\.[^.]+$/, '')}_animation.${format}`)

  // Clean up FFmpeg virtual FS
  await ffmpeg.deleteFile(outputName)
  for (let idx = 0; idx < totalFrames; idx++) {
    await ffmpeg.deleteFile(`frame_${String(idx + 1).padStart(4, '0')}.png`)
  }

  onStatus('Re-export complete!')
}
