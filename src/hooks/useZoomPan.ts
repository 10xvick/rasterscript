import { useEffect, useLayoutEffect, RefObject, useRef } from 'react'

/**
 * Shared zoom + pan + scroll-centering hook.
 *
 * Previously this logic was duplicated in:
 *   1. `components/canvas/CanvasStage.tsx`
 *   2. `plugins/spritesheet/index.tsx` (SpritesheetPreviewWidget)
 *
 * Now both consumers call this hook. Any bug fix or improvement applies
 * to every zoomable viewport automatically.
 *
 * @param stageRef        - Ref to the scrollable container element.
 * @param pad             - Dead-space padding (px) added around the content.
 * @param zoom            - Current zoom level (controlled from outside).
 * @param setZoom         - Zoom updater from the parent component's state.
 * @param contentWidth    - Logical width of the content (canvas or frame).
 * @param contentHeight   - Logical height of the content.
 * @param maxZoom         - Upper zoom clamp (default 8192).
 * @param dragEnabled     - Whether drag-to-pan is on (default true). Pass
 *                          false to disable (e.g. when a tool overlay is active).
 * @param dragGuard       - Optional predicate called on `pointerdown`; return
 *                          false to prevent panning for that particular event
 *                          (e.g. when panMode is off in CanvasStage).
 */
export function useZoomPan({
  stageRef,
  pad,
  zoom,
  setZoom,
  contentWidth,
  contentHeight,
  maxZoom = 8192,
  dragEnabled = true,
  dragGuard,
}: {
  stageRef: RefObject<HTMLDivElement | null>
  pad: number
  zoom: number
  setZoom: (z: number | ((prev: number) => number)) => void
  contentWidth: number
  contentHeight: number
  maxZoom?: number
  dragEnabled?: boolean
  dragGuard?: () => boolean
}): void {
  // Keep a ref so wheel handler always reads the latest zoom without closure staleness
  const zoomRef = useRef(zoom)
  useEffect(() => { zoomRef.current = zoom }, [zoom])

  // ─── Scroll centering ─────────────────────────────────────────────────────
  // Re-center whenever zoom or content size changes (skipped when a pending
  // scroll from wheel-zoom has already computed the target position).

  const preventRecenter = useRef(false)
  const pendingScroll   = useRef<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    const el = stageRef.current
    if (!el || !contentWidth || !contentHeight) return
    if (preventRecenter.current) {
      preventRecenter.current = false
      if (pendingScroll.current) {
        el.scrollLeft = pendingScroll.current.left
        el.scrollTop  = pendingScroll.current.top
        pendingScroll.current = null
      }
      return
    }
    el.scrollLeft = (el.scrollWidth  - el.clientWidth)  / 2
    el.scrollTop  = (el.scrollHeight - el.clientHeight) / 2
  }, [zoom, contentWidth, contentHeight, stageRef])

  // ─── Ctrl / Cmd + wheel → zoom ────────────────────────────────────────────
  // Native listener (passive: false) so we can preventDefault.
  // RAF-throttled to batch rapid ticks into one React state update per frame.

  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    let rafId = 0
    let targetZoom: number | null = null

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()

      const currentZoom = targetZoom ?? zoomRef.current
      const dynamicMax  = Math.max(1, Math.floor(maxZoom / Math.max(contentWidth, contentHeight, 1)))
      const clampedMax  = Math.min(maxZoom, dynamicMax)
      const factor      = e.deltaY > 0 ? 0.9 : 1.1
      const next        = Math.max(0.05, Math.min(currentZoom * factor, clampedMax))
      if (next === currentZoom) return

      targetZoom = next

      // Compute scroll offset so the pixel under the cursor stays stationary
      const rect    = el.getBoundingClientRect()
      const cursorX = e.clientX - rect.left
      const cursorY = e.clientY - rect.top
      const ratio   = next / zoomRef.current
      pendingScroll.current = {
        left: (el.scrollLeft + cursorX - pad) * ratio + pad - cursorX,
        top:  (el.scrollTop  + cursorY - pad) * ratio + pad - cursorY,
      }

      if (rafId) return // already scheduled
      rafId = requestAnimationFrame(() => {
        rafId = 0
        const z = targetZoom!
        targetZoom = null
        preventRecenter.current = true
        setZoom(z)
      })
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      el.removeEventListener('wheel', onWheel)
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [stageRef, pad, contentWidth, contentHeight, maxZoom, setZoom])

  // ─── Drag-to-pan ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!dragEnabled) return
    const el = stageRef.current
    if (!el) return
    let origin: { x: number; y: number; sl: number; st: number } | null = null

    const onDown = (e: PointerEvent) => {
      if (dragGuard && !dragGuard()) return
      el.setPointerCapture(e.pointerId)
      origin = { x: e.clientX, y: e.clientY, sl: el.scrollLeft, st: el.scrollTop }
      e.preventDefault()
    }
    const onMove = (e: PointerEvent) => {
      if (!origin) return
      el.scrollLeft = origin.sl - (e.clientX - origin.x)
      el.scrollTop  = origin.st - (e.clientY - origin.y)
    }
    const onUp = () => { origin = null }

    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup',   onUp)
    el.addEventListener('pointercancel', onUp)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup',   onUp)
      el.removeEventListener('pointercancel', onUp)
    }
  }, [stageRef, dragEnabled, dragGuard])
}
