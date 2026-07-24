import { useEffect, useRef, RefObject } from 'react'
import { hexToRgb, chromaKey } from '../lib/color'

/**
 * Real-time chroma key preview hook.
 *
 * On every animation frame, draws the source video onto an offscreen canvas,
 * applies `chromaKey()` from `src/lib/color.ts` (the shared single source of
 * truth), then copies the result to the visible canvas.
 *
 * Works with:
 *   - `<video>` element for live video preview
 *   - An `HTMLCanvasElement` source for static-image preview
 *
 * Used by `VideoPreviewWidget` — could equally be used by a future
 * spritesheet live-preview feature without any code duplication.
 *
 * @param videoRef   - Ref to the hidden `<video>` element.
 * @param canvasRef  - Ref to the visible output `<canvas>`.
 * @param enabled    - When false, the hook is a no-op (canvas is not touched).
 * @param keyColor   - CSS hex colour to key out (e.g. `"#00ff00"`).
 * @param threshold  - Euclidean RGB distance threshold (0–441, typical 30–100).
 */
export function useChromaKeyCanvas({
  videoRef,
  canvasRef,
  enabled,
  keyColor,
  threshold,
}: {
  videoRef:  RefObject<HTMLVideoElement | null>
  canvasRef: RefObject<HTMLCanvasElement | null>
  enabled:   boolean
  keyColor:  string
  threshold: number
}): void {
  // Keep latest values in refs so the RAF callback doesn't go stale
  const enabledRef   = useRef(enabled)
  const keyColorRef  = useRef(keyColor)
  const thresholdRef = useRef(threshold)

  useEffect(() => { enabledRef.current   = enabled   }, [enabled])
  useEffect(() => { keyColorRef.current  = keyColor  }, [keyColor])
  useEffect(() => { thresholdRef.current = threshold }, [threshold])

  useEffect(() => {
    const video  = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    // Offscreen canvas — we read pixels here, apply the key, then blit to visible canvas
    const offscreen    = document.createElement('canvas')
    const offCtx       = offscreen.getContext('2d', { willReadFrequently: true })!
    const visibleCtx   = canvas.getContext('2d')!

    let rafId = 0
    let lastColor  = ''
    let cachedRgb  = hexToRgb(keyColorRef.current)

    const frame = () => {
      rafId = requestAnimationFrame(frame)

      if (!enabledRef.current) {
        // Pass-through: just draw the video directly to the visible canvas
        if (video.videoWidth > 0) {
          canvas.width  = video.videoWidth
          canvas.height = video.videoHeight
          visibleCtx.drawImage(video, 0, 0)
        }
        return
      }

      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return
      if (video.videoWidth === 0) return

      // Resize offscreen canvas to match video (only when dimensions change)
      if (offscreen.width !== video.videoWidth || offscreen.height !== video.videoHeight) {
        offscreen.width  = video.videoWidth
        offscreen.height = video.videoHeight
        canvas.width     = video.videoWidth
        canvas.height    = video.videoHeight
      }

      // Re-parse hex only when the colour string changes
      if (keyColorRef.current !== lastColor) {
        lastColor  = keyColorRef.current
        cachedRgb  = hexToRgb(lastColor)
      }

      // Draw video frame → apply chroma key → blit to visible canvas
      offCtx.drawImage(video, 0, 0)
      const imgData = offCtx.getImageData(0, 0, offscreen.width, offscreen.height)
      chromaKey(imgData.data, cachedRgb, thresholdRef.current)
      offCtx.putImageData(imgData, 0, 0)

      visibleCtx.clearRect(0, 0, canvas.width, canvas.height)
      visibleCtx.drawImage(offscreen, 0, 0)
    }

    rafId = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(rafId)
  }, [videoRef, canvasRef]) // refs are stable — only run once on mount
}
