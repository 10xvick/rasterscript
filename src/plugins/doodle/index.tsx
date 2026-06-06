import { useRef, useEffect, useState } from 'react'
import { Pencil, Eraser } from 'lucide-react'
import type { EditorPlugin, PluginOverlayProps, PluginPanelProps } from '../../core/types'

// ─── Module-level brush settings (overlay reads live values) ─────────────────

export const doodleSettings = new Map<HTMLCanvasElement, {
  color: string; size: number; opacity: number; eraser: boolean
}>()

const DEFAULT_SETTINGS = { color: '#ff0000', size: 8, opacity: 1, eraser: false }

// ─── Overlay ──────────────────────────────────────────────────────────────────

function DoodleOverlay({ context, containerRef }: PluginOverlayProps) {
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const drawing    = useRef(false)
  const last       = useRef<{ x: number; y: number } | null>(null)
  const activeCtx  = useRef<CanvasRenderingContext2D | null>(null)  // captured at stroke start

  const settings = () => doodleSettings.get(context.canvas) ?? DEFAULT_SETTINGS

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
    const s  = settings()
    const op: GlobalCompositeOperation = s.eraser ? 'destination-out' : 'source-over'
    g.globalAlpha            = s.eraser ? 1 : s.opacity
    g.globalCompositeOperation = op
    if (from) {
      g.beginPath(); g.moveTo(from.x, from.y); g.lineTo(to.x, to.y)
      g.strokeStyle = s.color; g.lineWidth = s.size
      g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke()
    } else {
      g.beginPath(); g.arc(to.x, to.y, s.size / 2, 0, Math.PI * 2)
      g.fillStyle = s.color; g.fill()
    }
    g.globalAlpha            = 1
    g.globalCompositeOperation = 'source-over'
    context.compositeToCanvas()
  }

  const onPointerDown = (e: React.PointerEvent) => {
    drawing.current   = true
    activeCtx.current = context.getActiveLayerCtx()  // lock to active layer for this stroke
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
    context.pushHistory('Draw')
  }

  return (
    <canvas ref={overlayRef} className="absolute inset-0 w-full h-full"
      style={{ zIndex: 10, cursor: 'crosshair', opacity: 0 }}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}    onPointerLeave={onPointerUp}
    />
  )
}

// ─── Panel (brush settings only — layers are in the Layers panel) ─────────────

function DoodlePanel({ context }: PluginPanelProps) {
  const [color,   setColor]   = useState(DEFAULT_SETTINGS.color)
  const [size,    setSize]    = useState(DEFAULT_SETTINGS.size)
  const [opacity, setOpacity] = useState(100)
  const [eraser,  setEraser]  = useState(false)

  useEffect(() => {
    doodleSettings.set(context.canvas, { color, size, opacity: opacity / 100, eraser })
  }, [color, size, opacity, eraser, context.canvas])

  const sl = 'w-full accent-violet-500'

  return (
    <div className="p-3 space-y-3 text-xs">
      <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-medium">Brush</p>

      <div className="flex items-center gap-2">
        <input type="color" value={color} onChange={e => setColor(e.target.value)}
          className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent flex-none" />
        <input value={color} onChange={e => setColor(e.target.value)} maxLength={7}
          className="w-24 bg-neutral-800 border border-neutral-700 rounded px-1.5 py-0.5 font-mono text-neutral-300 focus:outline-none focus:border-violet-500" />
        <div className="flex flex-1 rounded overflow-hidden border border-neutral-700">
          <button onClick={() => setEraser(false)}
            className={`flex-1 py-1 flex items-center justify-center gap-1 text-[10px] ${!eraser ? 'bg-violet-600 text-white' : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'}`}>
            <Pencil size={9} />Pen
          </button>
          <button onClick={() => setEraser(true)}
            className={`flex-1 py-1 flex items-center justify-center gap-1 text-[10px] ${eraser ? 'bg-violet-600 text-white' : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'}`}>
            <Eraser size={9} />Erase
          </button>
        </div>
      </div>

      <div>
        <div className="flex justify-between text-neutral-400 mb-1"><span>Size</span><span>{size}px</span></div>
        <input type="range" min={1} max={120} value={size} onChange={e => setSize(+e.target.value)} className={sl} />
      </div>

      <div>
        <div className="flex justify-between text-neutral-400 mb-1"><span>Opacity</span><span>{opacity}%</span></div>
        <input type="range" min={1} max={100} value={opacity} onChange={e => setOpacity(+e.target.value)} className={sl} />
      </div>

      <p className="text-[10px] text-neutral-600 leading-tight pt-1">
        Draws on the active layer. Open the <strong className="text-neutral-500">Layers</strong> panel to add, delete, or reorder layers.
      </p>
    </div>
  )
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

export const doodlePlugin: EditorPlugin = {
  id: 'doodle',
  name: 'Draw',
  icon: <Pencil size={18} />,
  category: 'draw',
  Panel: DoodlePanel,
  CanvasOverlay: DoodleOverlay,
}
