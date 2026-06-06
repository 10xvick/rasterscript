import { useState, useRef, useEffect } from 'react'
import { Scissors } from 'lucide-react'
import type { EditorPlugin, PluginPanelProps, PluginOverlayProps } from '../../core/types'
import { removeBgAuto, removeBgGuided } from './algorithms'

// ─── Module-level shared state (panel writes, overlay reads) ──────────────────

type BrushMode = 'fg' | 'bg'
interface BgToolState { tab: 'auto' | 'guided'; brushMode: BrushMode; brushSize: number }

const toolState    = new Map<HTMLCanvasElement, BgToolState>()
const scribbleCvs  = new Map<HTMLCanvasElement, HTMLCanvasElement>()

const DEFAULT_STATE: BgToolState = { tab: 'auto', brushMode: 'fg', brushSize: 20 }

// ─── Scribble Overlay ─────────────────────────────────────────────────────────
// Always mounted when the plugin is active. Interactive only in 'guided' tab.

function RemoveBgOverlay({ context, containerRef }: PluginOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing   = useRef(false)
  const last      = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const el = canvasRef.current; if (!el) return
    scribbleCvs.set(context.canvas, el)
    return () => { scribbleCvs.delete(context.canvas) }
  }, [context.canvas])

  useEffect(() => {
    const resize = () => {
      const el = canvasRef.current, container = containerRef.current
      if (!el || !container) return
      // Preserve existing scribbles when the container resizes
      const bak = document.createElement('canvas')
      bak.width  = el.width;  bak.height = el.height
      bak.getContext('2d')!.drawImage(el, 0, 0)
      el.width  = container.clientWidth
      el.height = container.clientHeight
      if (bak.width && bak.height)
        el.getContext('2d')!.drawImage(bak, 0, 0, bak.width, bak.height, 0, 0, el.width, el.height)
    }
    resize()
    const ro = new ResizeObserver(resize)
    if (containerRef.current) ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [containerRef])

  const getState = () => toolState.get(context.canvas) ?? DEFAULT_STATE

  const toDisplay = (e: React.PointerEvent): { x: number; y: number } => {
    const r = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const paint = (from: { x: number; y: number } | null, to: { x: number; y: number }) => {
    const el = canvasRef.current; if (!el) return
    const g = el.getContext('2d')!
    const { brushMode, brushSize } = getState()
    const color = brushMode === 'fg' ? 'rgba(0,210,60,0.72)' : 'rgba(225,50,40,0.72)'
    g.lineCap = 'round'; g.lineJoin = 'round'
    g.lineWidth = brushSize; g.strokeStyle = color; g.fillStyle = color
    if (from) {
      g.beginPath(); g.moveTo(from.x, from.y); g.lineTo(to.x, to.y); g.stroke()
    } else {
      g.beginPath(); g.arc(to.x, to.y, brushSize / 2, 0, Math.PI * 2); g.fill()
    }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (getState().tab !== 'guided') return
    drawing.current = true
    ;(e.target as Element).setPointerCapture(e.pointerId)
    const p = toDisplay(e); last.current = p; paint(null, p)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drawing.current || !last.current) return
    const p = toDisplay(e); paint(last.current, p); last.current = p
  }

  const onPointerUp = () => { drawing.current = false; last.current = null }

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ zIndex: 10, cursor: 'crosshair' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
    />
  )
}

// ─── Panel ────────────────────────────────────────────────────────────────────

function RemoveBgPanel({ context }: PluginPanelProps) {
  const [tab,       setTab]       = useState<'auto' | 'guided'>('auto')
  const [tolerance, setTolerance] = useState(25)
  const [feather,   setFeather]   = useState(2)
  const [brushMode, setBrushMode] = useState<BrushMode>('fg')
  const [brushSize, setBrushSize] = useState(20)
  const [status,    setStatus]    = useState('')

  // Keep module-level state in sync so the overlay reads correct values
  useEffect(() => {
    toolState.set(context.canvas, { tab, brushMode, brushSize })
  }, [tab, brushMode, brushSize, context.canvas])

  const clearScribbles = () => {
    const ov = scribbleCvs.get(context.canvas); if (!ov) return
    ov.getContext('2d')!.clearRect(0, 0, ov.width, ov.height)
  }

  const applyAuto = () => {
    setStatus('Processing…')
    const src = context.getImageData()
    // defer so React can paint "Processing…" before the heavy sync work
    setTimeout(() => {
      try {
        const result = removeBgAuto(src, tolerance / 100, feather)
        context.setImageData(result, true)
        setStatus('Done ✓')
      } catch (e) {
        setStatus('Error: ' + String(e))
      }
    }, 16)
  }

  const applyGuided = () => {
    const ov = scribbleCvs.get(context.canvas)
    if (!ov) { setStatus('Draw scribbles on the canvas first'); return }

    const ovCtx = ov.getContext('2d', { willReadFrequently: true })!
    const ovData = ovCtx.getImageData(0, 0, ov.width, ov.height)
    const od = ovData.data

    let hasGreen = false, hasRed = false
    for (let i = 0; i < od.length && !(hasGreen && hasRed); i += 4) {
      if (od[i + 3] < 50) continue
      if (!hasGreen && od[i + 1] > 150 && od[i] < 100 && od[i + 2] < 100) hasGreen = true
      if (!hasRed   && od[i]     > 150 && od[i + 1] < 100 && od[i + 2] < 100) hasRed = true
    }

    if (!hasGreen || !hasRed) {
      setStatus(!hasGreen ? 'Add green strokes on the subject' : 'Add red strokes on the background')
      return
    }

    setStatus('Processing…')
    const src = context.getImageData()
    setTimeout(() => {
      try {
        const result = removeBgGuided(src, ovData, ov.width, ov.height, feather)
        context.setImageData(result, true)
        clearScribbles()
        setStatus('Done ✓')
      } catch (e) {
        setStatus('Error: ' + String(e))
      }
    }, 16)
  }

  const sl     = 'w-full accent-violet-500'
  const tabCls = (t: string) =>
    `flex-1 py-1.5 text-xs transition-colors ${
      tab === t
        ? 'text-violet-400 border-b-2 border-violet-500 bg-neutral-800/40'
        : 'text-neutral-500 hover:text-neutral-300'
    }`

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Tabs */}
      <div className="flex border-b border-neutral-800 shrink-0">
        <button className={tabCls('auto')}    onClick={() => setTab('auto')}>Auto</button>
        <button className={tabCls('guided')}  onClick={() => setTab('guided')}>Guided</button>
      </div>

      <div className="p-3 space-y-3 text-xs">

        {/* ── Auto tab ────────────────────────────────────────────────────── */}
        {tab === 'auto' && (
          <>
            <p className="text-[10px] text-neutral-500 leading-relaxed">
              Samples border pixels, fits a K-means colour model, then flood-fills connected background regions with soft alpha edges.
            </p>

            <div>
              <div className="flex justify-between text-neutral-400 mb-1">
                <span>Tolerance</span><span>{tolerance}%</span>
              </div>
              <input type="range" min={1} max={80} value={tolerance}
                onChange={e => setTolerance(+e.target.value)} className={sl} />
              <p className="text-[10px] text-neutral-600 mt-0.5">
                Higher = removes more colour variation
              </p>
            </div>

            <div>
              <div className="flex justify-between text-neutral-400 mb-1">
                <span>Edge Feather</span><span>{feather}px</span>
              </div>
              <input type="range" min={0} max={20} value={feather}
                onChange={e => setFeather(+e.target.value)} className={sl} />
            </div>

            <button onClick={applyAuto}
              className="w-full py-2 rounded bg-violet-600 hover:bg-violet-500 text-xs font-medium transition-colors">
              Remove Background
            </button>
          </>
        )}

        {/* ── Guided tab ──────────────────────────────────────────────────── */}
        {tab === 'guided' && (
          <>
            <p className="text-[10px] text-neutral-500 leading-relaxed">
              Paint <span className="text-green-400 font-medium">green</span> over
              the subject and <span className="text-red-400 font-medium">red</span> over
              the background. The algorithm builds separate colour models from your strokes.
            </p>

            {/* Brush mode toggle */}
            <div className="flex rounded overflow-hidden border border-neutral-700">
              <button
                onClick={() => setBrushMode('fg')}
                className={`flex-1 py-1.5 flex items-center justify-center gap-1.5 text-[10px] font-medium transition-colors ${
                  brushMode === 'fg'
                    ? 'bg-green-800/70 text-green-300'
                    : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
                }`}>
                <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
                Subject (keep)
              </button>
              <button
                onClick={() => setBrushMode('bg')}
                className={`flex-1 py-1.5 flex items-center justify-center gap-1.5 text-[10px] font-medium transition-colors ${
                  brushMode === 'bg'
                    ? 'bg-red-900/70 text-red-300'
                    : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
                }`}>
                <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
                Background (remove)
              </button>
            </div>

            <div>
              <div className="flex justify-between text-neutral-400 mb-1">
                <span>Brush Size</span><span>{brushSize}px</span>
              </div>
              <input type="range" min={2} max={80} value={brushSize}
                onChange={e => setBrushSize(+e.target.value)} className={sl} />
            </div>

            <div>
              <div className="flex justify-between text-neutral-400 mb-1">
                <span>Edge Feather</span><span>{feather}px</span>
              </div>
              <input type="range" min={0} max={20} value={feather}
                onChange={e => setFeather(+e.target.value)} className={sl} />
            </div>

            <div className="flex gap-2">
              <button onClick={applyGuided}
                className="flex-1 py-2 rounded bg-violet-600 hover:bg-violet-500 text-xs font-medium transition-colors">
                Apply
              </button>
              <button onClick={clearScribbles}
                className="px-3 py-2 rounded bg-neutral-700 hover:bg-neutral-600 text-xs transition-colors">
                Clear
              </button>
            </div>

            <p className="text-[10px] text-neutral-600 leading-tight">
              A few broad strokes are enough — you don't need to cover every pixel. Cover varied areas for best results.
            </p>
          </>
        )}

        {/* Status */}
        {status && (
          <p className={`text-[10px] ${
            status.startsWith('Error') ? 'text-red-400'
            : status === 'Done ✓'     ? 'text-green-400'
            : 'text-neutral-400 animate-pulse'
          }`}>
            {status}
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

export const removeBgPlugin: EditorPlugin = {
  id: 'removebg',
  name: 'Remove BG',
  icon: <Scissors size={18} />,
  category: 'experimental',
  Panel: RemoveBgPanel,
  CanvasOverlay: RemoveBgOverlay,
  deactivate: (_ctx) => {
    // Leave scribbles intact so the user can return and continue; they can Clear explicitly.
  },
}
