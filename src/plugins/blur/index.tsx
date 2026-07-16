/* eslint-disable react-refresh/only-export-components */
import { useRef, useEffect, useState } from 'react'
import { Droplet } from 'lucide-react'
import type { EditorPlugin, PluginOverlayProps, PluginPanelProps } from '../../core/types'

// ─── Module-level blur settings (overlay reads live values) ─────────────────

export const blurSettings = new Map<HTMLCanvasElement, {
  size: number; strength: number; hardness: number; opacity: number
}>()

const DEFAULT_SETTINGS = { size: 30, strength: 5, hardness: 50, opacity: 50 }

// ─── Local Blur Brush Helper ──────────────────────────────────────────────────

function applyBlurAtPoint(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  strength: number,
  hardness: number,
  opacity: number
) {
  const r = size / 2
  const sx = Math.floor(x - r)
  const sy = Math.floor(y - r)
  const sw = Math.ceil(size)
  const sh = Math.ceil(size)

  if (sw <= 0 || sh <= 0) return

  const cw = g.canvas.width
  const ch = g.canvas.height

  // Padded region to avoid border artifacts from the CSS blur filter
  const padding = Math.ceil(strength * 2)
  const psx = sx - padding
  const psy = sy - padding
  const psw = sw + padding * 2
  const psh = sh + padding * 2

  // Determine intersection of padded source rect and active layer canvas bounds
  const ix0 = Math.max(0, psx)
  const iy0 = Math.max(0, psy)
  const ix1 = Math.min(cw, psx + psw)
  const iy1 = Math.min(ch, psy + psh)

  const intersectW = ix1 - ix0
  const intersectH = iy1 - iy0

  if (intersectW <= 0 || intersectH <= 0) return // completely offscreen

  // Copy padded original source pixels
  const sourceCanvas = document.createElement('canvas')
  sourceCanvas.width = psw
  sourceCanvas.height = psh
  const sourceCtx = sourceCanvas.getContext('2d', { willReadFrequently: true })!

  const destX = ix0 - psx
  const destY = iy0 - psy

  sourceCtx.drawImage(g.canvas, ix0, iy0, intersectW, intersectH, destX, destY, intersectW, intersectH)

  // Draw sourceCanvas to blurredCanvas with filter
  const blurCanvas = document.createElement('canvas')
  blurCanvas.width = sw
  blurCanvas.height = sh
  const blurCtx = blurCanvas.getContext('2d')!

  blurCtx.filter = `blur(${strength}px)`
  blurCtx.drawImage(sourceCanvas, -padding, -padding)

  // Create radial gradient mask matching the brush properties
  const maskCanvas = document.createElement('canvas')
  maskCanvas.width = sw
  maskCanvas.height = sh
  const maskCtx = maskCanvas.getContext('2d')!

  const grad = maskCtx.createRadialGradient(r, r, 0, r, r, r)
  const midPoint = hardness / 100
  const alpha = opacity / 100
  grad.addColorStop(0, `rgba(0, 0, 0, ${alpha})`)
  grad.addColorStop(midPoint, `rgba(0, 0, 0, ${alpha})`)
  grad.addColorStop(1, 'rgba(0, 0, 0, 0.0)')

  maskCtx.fillStyle = grad
  maskCtx.beginPath()
  maskCtx.arc(r, r, r, 0, Math.PI * 2)
  maskCtx.fill()

  // Mask the blurred pixels
  blurCtx.globalCompositeOperation = 'destination-in'
  blurCtx.drawImage(maskCanvas, 0, 0)
  blurCtx.globalCompositeOperation = 'source-over'

  // Create blendCanvas and copy the unpadded original region
  const blendCanvas = document.createElement('canvas')
  blendCanvas.width = sw
  blendCanvas.height = sh
  const blendCtx = blendCanvas.getContext('2d', { willReadFrequently: true })!

  const oix0 = Math.max(0, sx)
  const oiy0 = Math.max(0, sy)
  const oix1 = Math.min(cw, sx + sw)
  const oiy1 = Math.min(ch, sy + sh)
  const oW = oix1 - oix0
  const oH = oiy1 - oiy0

  if (oW > 0 && oH > 0) {
    blendCtx.drawImage(g.canvas, oix0, oiy0, oW, oH, oix0 - sx, oiy0 - sy, oW, oH)
  }

  // Draw blurCanvas on top of the original region using source-atop.
  // source-atop draws new content on top of existing content only where it overlaps,
  // preserving the destination alpha channel exactly.
  blendCtx.globalCompositeOperation = 'source-atop'
  blendCtx.drawImage(blurCanvas, 0, 0)

  // Replace the region on the active layer
  g.clearRect(sx, sy, sw, sh)
  g.drawImage(blendCanvas, sx, sy)
}

// ─── Overlay ──────────────────────────────────────────────────────────────────

function BlurOverlay({ context, containerRef }: PluginOverlayProps) {
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const drawing    = useRef(false)
  const last       = useRef<{ x: number; y: number } | null>(null)
  const activeCtx  = useRef<CanvasRenderingContext2D | null>(null)

  const settings = () => blurSettings.get(context.canvas) ?? DEFAULT_SETTINGS

  useEffect(() => {
    const resize = () => {
      const el = overlayRef.current
      const container = containerRef.current
      if (!el || !container) return
      el.width  = container.clientWidth
      el.height = container.clientHeight
    }
    resize()
    const ro = new ResizeObserver(resize)
    if (containerRef.current) ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [containerRef])

  const toCanvasPoint = (e: React.PointerEvent) => {
    const el = overlayRef.current!
    const r  = el.getBoundingClientRect()
    return {
      x: (e.clientX - r.left) * (context.getWidth()  / r.width),
      y: (e.clientY - r.top)  * (context.getHeight() / r.height),
    }
  }

  const paint = (from: { x: number; y: number } | null, to: { x: number; y: number }) => {
    const g = activeCtx.current
    if (!g) return
    const s = settings()

    if (from) {
      const dx = to.x - from.x
      const dy = to.y - from.y
      const distance = Math.hypot(dx, dy)
      const spacing = Math.max(1, s.size * 0.1) // 10% spacing
      const steps = Math.ceil(distance / spacing)

      for (let i = 1; i <= steps; i++) {
        const t = i / steps
        const cx = from.x + dx * t
        const cy = from.y + dy * t
        applyBlurAtPoint(g, cx, cy, s.size, s.strength, s.hardness, s.opacity)
      }
    } else {
      applyBlurAtPoint(g, to.x, to.y, s.size, s.strength, s.hardness, s.opacity)
    }

    context.compositeToCanvas()
  }

  const onPointerDown = (e: React.PointerEvent) => {
    drawing.current   = true
    activeCtx.current = context.getActiveLayerCtx()
    if (!activeCtx.current) return
    ;(e.target as Element).setPointerCapture(e.pointerId)
    const p = toCanvasPoint(e)
    last.current = p
    paint(null, p)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drawing.current || !last.current) return
    const p = toCanvasPoint(e)
    paint(last.current, p)
    last.current = p
  }

  const onPointerUp = () => {
    if (!drawing.current) return
    drawing.current = false; last.current = null; activeCtx.current = null
    context.pushHistory('Blur Brush')
  }

  return (
    <canvas ref={overlayRef} className="absolute inset-0 w-full h-full"
      style={{ zIndex: 10, cursor: 'crosshair', opacity: 0 }}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}    onPointerLeave={onPointerUp}
    />
  )
}

// ─── Panel ────────────────────────────────────────────────────────────────────

function BlurPanel({ context }: PluginPanelProps) {
  const [size,     setSize]     = useState(DEFAULT_SETTINGS.size)
  const [strength, setStrength] = useState(DEFAULT_SETTINGS.strength)
  const [hardness, setHardness] = useState(DEFAULT_SETTINGS.hardness)
  const [opacity,  setOpacity]  = useState(DEFAULT_SETTINGS.opacity)

  useEffect(() => {
    blurSettings.set(context.canvas, { size, strength, hardness, opacity })
  }, [size, strength, hardness, opacity, context.canvas])

  const applyBlurEntireLayer = () => {
    const activeCtx = context.getActiveLayerCtx()
    if (!activeCtx) return
    const w = context.getWidth()
    const h = context.getHeight()

    const tempCanvas = document.createElement('canvas')
    tempCanvas.width = w
    tempCanvas.height = h
    const tempCtx = tempCanvas.getContext('2d')!
    tempCtx.drawImage(activeCtx.canvas, 0, 0)

    activeCtx.clearRect(0, 0, w, h)
    activeCtx.filter = `blur(${strength}px)`
    activeCtx.drawImage(tempCanvas, 0, 0)
    activeCtx.filter = 'none'

    context.compositeToCanvas()
    context.pushHistory('Blur Layer')
  }

  const sl = 'w-full accent-violet-500 h-1.5'
  const lbl = 'text-xs text-neutral-400 flex justify-between mb-1'

  return (
    <div className="p-3 space-y-4 text-xs">
      <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-medium">Blur Brush Settings</p>

      <div>
        <div className={lbl}><span>Brush Size</span><span>{size}px</span></div>
        <input type="range" min={1} max={120} value={size} onChange={e => setSize(+e.target.value)} className={sl} />
      </div>

      <div>
        <div className={lbl}><span>Blur Strength</span><span>{strength}px</span></div>
        <input type="range" min={1} max={20} value={strength} onChange={e => setStrength(+e.target.value)} className={sl} />
      </div>

      <div>
        <div className={lbl}><span>Hardness</span><span>{hardness}%</span></div>
        <input type="range" min={0} max={100} value={hardness} onChange={e => setHardness(+e.target.value)} className={sl} />
      </div>

      <div>
        <div className={lbl}><span>Brush Opacity</span><span>{opacity}%</span></div>
        <input type="range" min={1} max={100} value={opacity} onChange={e => setOpacity(+e.target.value)} className={sl} />
      </div>

      <div className="border-t border-neutral-800 pt-3">
        <p className="text-[10px] text-neutral-500 uppercase tracking-wider mb-2">Quick Actions</p>
        <button
          onClick={applyBlurEntireLayer}
          className="w-full py-1.5 rounded bg-violet-600 hover:bg-violet-500 text-xs font-medium transition-colors text-white text-center"
        >
          Blur Active Layer
        </button>
      </div>

      <p className="text-[10px] text-neutral-600 leading-tight pt-1">
        Brush directly on the canvas to blur locally, or click the button above to blur the entire active layer using the current Blur Strength.
      </p>
    </div>
  )
}

// ─── Plugin Definition ────────────────────────────────────────────────────────

export const blurPlugin: EditorPlugin = {
  id: 'blur',
  name: 'Blur',
  icon: <Droplet size={18} />,
  category: 'draw',
  Panel: BlurPanel,
  CanvasOverlay: BlurOverlay,
}
