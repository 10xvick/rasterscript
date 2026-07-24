/**
 * Video editor — pure processing operations.
 *
 * No React, no Zustand.  All results returned via callbacks or return values.
 * Callers (VideoPanel, VideoTimeline) update their stores after calling these.
 *
 * Shared infrastructure used — zero code duplicated:
 *   - getFFmpeg()         from src/lib/ffmpeg.ts    (shared WASM singleton)
 *   - chromaKey()         from src/lib/color.ts     (one chroma-key impl)
 *   - hexToRgb()          from src/lib/color.ts
 *   - downloadBlob()      from src/lib/download.ts  (one download impl)
 *   - loadImageFromFile() from src/lib/media.ts     (one image loader)
 *   - extractFrameToCanvas() from src/lib/media.ts
 */

import { fetchFile } from '@ffmpeg/util'
import { getFFmpeg }        from '../../lib/ffmpeg'
import { chromaKey, hexToRgb } from '../../lib/color'
import { downloadBlob }     from '../../lib/download'
import { loadImageFromFile, extractFrameToCanvas } from '../../lib/media'
import type { Clip }        from '../../store/useMediaLibrary'

export type OnStatus = (msg: string) => void
export type OnLog    = (msg: string) => void
export type OnProgress = (pct: number) => void

// ─── Trim + Export ────────────────────────────────────────────────────────────

export interface ExportParams {
  clip:        Clip
  format:      'mp4' | 'gif' | 'webm'
  removeBg:    boolean
  bgKeyColor:  string   // hex
  bgThreshold: number
}

/**
 * Trim a clip to its in/out points and download it.
 * Applies chroma key frame-by-frame if `removeBg` is true.
 *
 * For chroma-key exports: extracts frames via FFmpeg → applies chromaKey()
 * on each frame's ImageData → re-encodes to the chosen format.
 *
 * For plain trim (no key): single FFmpeg pass — fast.
 */
export async function exportClip(
  { clip, format, removeBg, bgKeyColor, bgThreshold }: ExportParams,
  onStatus:  OnStatus,
  onLog:     OnLog,
  onProgress: OnProgress,
): Promise<void> {
  const ffmpeg = await getFFmpeg()

  const inName   = `input.${clip.sourceFile.name.split('.').pop() ?? 'mp4'}`
  const outName  = `out.${format === 'gif' ? 'gif' : format === 'webm' ? 'webm' : 'mp4'}`
  const duration = clip.trimEnd - clip.trimStart

  onStatus(`Loading ${clip.name} into FFmpeg…`)
  await ffmpeg.writeFile(inName, await fetchFile(clip.sourceFile))

  if (!removeBg) {
    // ── Fast path: plain trim, no chroma key ────────────────────────────────
    onStatus(`Trimming (${format.toUpperCase()})…`)

    const args: string[] = [
      '-ss', String(clip.trimStart),
      '-i',  inName,
      '-t',  String(duration),
      '-an',               // strip audio (video-only per design decision)
    ]

    if (format === 'gif') {
      args.push('-vf', 'fps=15,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse')
    } else if (format === 'webm') {
      args.push('-c:v', 'libvpx-vp9', '-b:v', '1M')
    } else {
      args.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-pix_fmt', 'yuv420p')
    }

    args.push(outName)

    ffmpeg.on('log',      ({ message }) => onLog(message))
    ffmpeg.on('progress', ({ progress }) => onProgress(Math.round(progress * 100)))

    await ffmpeg.exec(args)
  } else {
    // ── Chroma-key path: frame-by-frame processing ──────────────────────────
    onStatus('Extracting frames for chroma key…')

    const fps         = 15
    const totalFrames = Math.ceil(duration * fps)
    const rgb         = hexToRgb(bgKeyColor)

    // 1. Extract raw PNG frames from the trimmed range
    await ffmpeg.exec([
      '-ss', String(clip.trimStart),
      '-i',  inName,
      '-t',  String(duration),
      '-vf', `fps=${fps}`,
      '-an',
      'frame_%04d.png',
    ])

    // 2. Apply chromaKey() to each frame (reuses shared lib/color.ts function)
    for (let i = 1; i <= totalFrames; i++) {
      const frameName = `frame_${String(i).padStart(4, '0')}.png`
      let frameData: Uint8Array
      try {
        frameData = await ffmpeg.readFile(frameName) as Uint8Array
      } catch {
        break // fewer frames than expected (last partial second)
      }

      // Decode PNG → ImageData → chromaKey → re-encode
      const blob   = new Blob([frameData], { type: 'image/png' })
      const img    = await loadImageFromFile(blob)
      const canvas = document.createElement('canvas')
      canvas.width  = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx    = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)

      // shared chromaKey() — one implementation, used here and in spritesheet
      chromaKey(imgData.data, rgb, bgThreshold)

      ctx.putImageData(imgData, 0, 0)

      // Write keyed frame back
      const keyedBlob  = await new Promise<Blob>(r => canvas.toBlob(b => r(b!), 'image/png'))
      const keyedBytes = new Uint8Array(await keyedBlob.arrayBuffer())
      await ffmpeg.writeFile(frameName, keyedBytes)

      onProgress(Math.round((i / totalFrames) * 70)) // 0–70% for keying pass
    }

    // 3. Re-encode keyed frames into output format
    onStatus(`Encoding ${format.toUpperCase()}…`)
    const encArgs: string[] = ['-framerate', String(fps), '-i', 'frame_%04d.png']

    if (format === 'gif') {
      encArgs.push('-vf', 'split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse')
    } else if (format === 'webm') {
      encArgs.push('-c:v', 'libvpx-vp9', '-b:v', '1M', '-pix_fmt', 'yuva420p')
    } else {
      // MP4 with alpha requires MOV; fall back to white matte for MP4
      encArgs.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-pix_fmt', 'yuv420p')
    }

    encArgs.push(outName)
    await ffmpeg.exec(encArgs)
    onProgress(100)
  }

  onStatus('Downloading…')
  const data = await ffmpeg.readFile(outName) as Uint8Array
  downloadBlob(new Blob([data], { type: format === 'gif' ? 'image/gif' : `video/${format}` }), outName)

  onStatus('Export complete.')

  // Cleanup WASM virtual FS to free memory
  await ffmpeg.deleteFile(inName).catch(() => {})
  await ffmpeg.deleteFile(outName).catch(() => {})
}

// ─── Extract frame as canvas layer ───────────────────────────────────────────

/**
 * Extract the current video frame at `timeSeconds` as an ImageData.
 * Passed to `context.pasteAsLayer()` in VideoPanel to bring a frame
 * into the image editor.
 *
 * Uses extractFrameToCanvas() from src/lib/media.ts — no duplicate logic.
 */
export async function extractFrameAsImageData(
  clip:        Clip,
  timeSeconds: number,
  onStatus:    OnStatus,
): Promise<ImageData> {
  onStatus(`Extracting frame at ${timeSeconds.toFixed(2)}s…`)
  const canvas = await extractFrameToCanvas(clip.sourceFile, timeSeconds)
  const ctx    = canvas.getContext('2d', { willReadFrequently: true })!
  onStatus('Frame ready.')
  return ctx.getImageData(0, 0, canvas.width, canvas.height)
}
