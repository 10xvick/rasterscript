import { useState, useRef, useEffect, useCallback } from 'react'
import { Sparkles, Sliders, Brush, RotateCcw } from 'lucide-react'
import type { EditorPlugin, PluginPanelProps, PluginOverlayProps } from '../../core/types'
import { removeBgAuto, removeBgGuided } from './algorithms'
import { useEditorStore } from '../../store/useEditorStore'

// ─── Module-level shared state ───────────────────────────────────────────────

type BrushMode = 'fg' | 'bg'
interface BgToolState { tab: 'smartAi' | 'auto' | 'guided'; brushMode: BrushMode; brushSize: number }

const toolState    = new Map<HTMLCanvasElement, BgToolState>()
const scribbleCvs  = new Map<HTMLCanvasElement, HTMLCanvasElement>()

const DEFAULT_STATE: BgToolState = { tab: 'smartAi', brushMode: 'fg', brushSize: 20 }

// ─── Scribble Overlay ─────────────────────────────────────────────────────────

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
      style={{ zIndex: 10, cursor: getState().tab === 'guided' ? 'crosshair' : 'default', pointerEvents: getState().tab === 'guided' ? 'auto' : 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
    />
  )
}

// ─── Panel ────────────────────────────────────────────────────────────────────

function RemoveBgPanel({ context }: PluginPanelProps) {
  const [tab, setTab] = useState<'smartAi' | 'auto' | 'guided'>('smartAi')
  const [modelType, setModelType] = useState<'human' | 'object'>('human')
  const [tolerance, setTolerance] = useState(25)
  const [feather, setFeather] = useState(2)
  const [brushMode, setBrushMode] = useState<BrushMode>('fg')
  const [brushSize, setBrushSize] = useState(20)
  const [status, setStatus] = useState('')

  const [invertMask, setInvertMask] = useState(false)
  const [edgeShift, setEdgeShift] = useState(-10)
  const [feathering, setFeathering] = useState(20)
  const [isProcessing, setIsProcessing] = useState(false)

  useEffect(() => {
    toolState.set(context.canvas, { tab, brushMode, brushSize })
  }, [tab, brushMode, brushSize, context.canvas])

  const activeLayerId = useEditorStore(s => s.activeLayerId)
  const prevLayerIdRef = useRef<string>(activeLayerId)
  const originalImageDataRef = useRef<ImageData | null>(null)

  // Reset layer image backup whenever active layer changes
  useEffect(() => {
    if (prevLayerIdRef.current !== activeLayerId) {
      prevLayerIdRef.current = activeLayerId
      originalImageDataRef.current = null
    }
  }, [activeLayerId])

  // Save original un-edited image data for current active layer
  useEffect(() => {
    if (!originalImageDataRef.current && context) {
      originalImageDataRef.current = context.getImageData()
    }
  }, [context, activeLayerId])

  const clearScribbles = () => {
    const ov = scribbleCvs.get(context.canvas); if (!ov) return
    ov.getContext('2d')!.clearRect(0, 0, ov.width, ov.height)
  }

  const applySmartAi = useCallback(async () => {
    if (!context || isProcessing) return
    setIsProcessing(true)
    setStatus('Processing…')

    try {
      const srcImageData = originalImageDataRef.current || context.getImageData()
      if (!originalImageDataRef.current) {
        originalImageDataRef.current = srcImageData
      }

      const w = Math.max(1, Math.floor(srcImageData.width || context.width))
      const h = Math.max(1, Math.floor(srcImageData.height || context.height))
      if (w <= 0 || h <= 0) return

      const srcCanvas = document.createElement('canvas')
      srcCanvas.width = w
      srcCanvas.height = h
      const srcCtx = srcCanvas.getContext('2d', { willReadFrequently: true })!
      srcCtx.putImageData(srcImageData, 0, 0)

      const outCanvas = document.createElement('canvas')
      outCanvas.width = w
      outCanvas.height = h

      const { applySelfieSegmentation } = await import('../../lib/selfieSegmentation')
      await applySelfieSegmentation(srcCanvas, outCanvas, edgeShift, feathering, invertMask)

      const outCtx = outCanvas.getContext('2d', { willReadFrequently: true })!
      const finalImgData = outCtx.getImageData(0, 0, w, h)

      if (context.setActiveLayerImageData) {
        context.setActiveLayerImageData(finalImgData, true, 'Remove BG')
      } else {
        context.setImageData(finalImgData, true)
      }
      setStatus('Done ✓')
    } catch (err) {
      console.error('Smart AI error:', err)
      setStatus('Error processing image')
    } finally {
      setIsProcessing(false)
    }
  }, [context, edgeShift, feathering, invertMask, isProcessing])

  const resetBg = () => {
    if (originalImageDataRef.current && context) {
      if (context.setActiveLayerImageData) {
        context.setActiveLayerImageData(originalImageDataRef.current, true, 'Restore BG')
      } else {
        context.setImageData(originalImageDataRef.current, true)
      }
      setStatus('Original Restored ✓')
    }
  }

  const applyAuto = () => {
    setStatus('Processing…')
    const src = originalImageDataRef.current || context.getImageData()
    setTimeout(() => {
      try {
        const result = removeBgAuto(src, tolerance / 100, feather)
        if (context.setActiveLayerImageData) {
          context.setActiveLayerImageData(result, true, 'Auto Remove BG')
        } else {
          context.setImageData(result, true)
        }
        setStatus('Done ✓')
      } catch (e) {
        setStatus('Error processing image')
      }
    }, 16)
  }

  const applyGuided = () => {
    const ov = scribbleCvs.get(context.canvas)
    if (!ov) { setStatus('Draw on the canvas first'); return }

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
      setStatus(!hasGreen ? 'Paint green over the subject' : 'Paint red over the background')
      return
    }

    setStatus('Processing…')
    const src = originalImageDataRef.current || context.getImageData()
    setTimeout(() => {
      try {
        const result = removeBgGuided(src, ovData, ov.width, ov.height, feather)
        if (context.setActiveLayerImageData) {
          context.setActiveLayerImageData(result, true, 'Guided Remove BG')
        } else {
          context.setImageData(result, true)
        }
        clearScribbles()
        setStatus('Done ✓')
      } catch (e) {
        setStatus('Error processing image')
      }
    }, 16)
  }

  const sl = 'w-full accent-violet-500'
  const tabCls = (t: string) =>
    `flex-1 py-1.5 text-[11px] font-medium flex items-center justify-center gap-1 transition-colors ${
      tab === t
        ? 'text-violet-400 border-b-2 border-violet-500 bg-neutral-800/40 font-semibold'
        : 'text-neutral-500 hover:text-neutral-300'
    }`

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-neutral-900 text-neutral-200">
      {/* Tabs */}
      <div className="flex border-b border-neutral-800 shrink-0">
        <button className={tabCls('smartAi')} onClick={() => setTab('smartAi')}>
          <Sparkles size={13} />
          Auto AI
        </button>
        <button className={tabCls('auto')} onClick={() => setTab('auto')}>
          <Sliders size={13} />
          Color Key
        </button>
        <button className={tabCls('guided')} onClick={() => setTab('guided')}>
          <Brush size={13} />
          Guided
        </button>
      </div>

      <div className="p-3 space-y-3 text-xs flex-1">
        {/* ── Smart AI tab ──────────────────────────────────────────────── */}
        {tab === 'smartAi' && (
          <div className="space-y-3">
            <div>
              <label className="text-[10px] text-neutral-400 uppercase font-medium block mb-1">
                Target Subject
              </label>
              <select
                value={modelType}
                onChange={e => setModelType(e.target.value as 'human' | 'object')}
                className="w-full bg-neutral-950 border border-neutral-800 rounded px-2 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-violet-500"
              >
                <option value="human">Person / Portrait</option>
                <option value="object">General Objects</option>
              </select>
            </div>

            {/* Edge Shift Slider */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <label className="text-neutral-400 font-medium">Edge Shift</label>
                <span className="text-violet-400 font-mono">{edgeShift}%</span>
              </div>
              <input
                type="range"
                min="-50"
                max="50"
                value={edgeShift}
                onChange={e => setEdgeShift(parseInt(e.target.value))}
                className="w-full accent-violet-500"
              />
            </div>

            {/* Feathering Slider */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <label className="text-neutral-400 font-medium">Feathering</label>
                <span className="text-violet-400 font-mono">{feathering}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={feathering}
                onChange={e => setFeathering(parseInt(e.target.value))}
                className="w-full accent-violet-500"
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer text-xs text-neutral-300">
              <input
                type="checkbox"
                checked={invertMask}
                onChange={e => setInvertMask(e.target.checked)}
                className="accent-violet-500 rounded"
              />
              <span>Invert Cutout</span>
            </label>

            <div className="flex flex-col gap-2 pt-1">
              <button
                onClick={applySmartAi}
                disabled={isProcessing}
                className="w-full py-2 rounded bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-xs font-semibold text-white transition-colors flex items-center justify-center gap-1.5 shadow"
              >
                <Sparkles size={14} />
                {isProcessing ? 'Processing...' : 'Remove Background'}
              </button>

              <button
                onClick={resetBg}
                className="w-full py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-xs text-neutral-300 transition-colors flex items-center justify-center gap-1.5 border border-neutral-700"
              >
                <RotateCcw size={13} />
                Restore Original
              </button>
            </div>
          </div>
        )}

        {/* ── Auto tab ────────────────────────────────────────────────────── */}
        {tab === 'auto' && (
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-neutral-400 mb-1">
                <span>Color Tolerance</span><span>{tolerance}%</span>
              </div>
              <input type="range" min={1} max={80} value={tolerance}
                onChange={e => setTolerance(+e.target.value)} className={sl} />
            </div>

            <div>
              <div className="flex justify-between text-neutral-400 mb-1">
                <span>Feather</span><span>{feather}px</span>
              </div>
              <input type="range" min={0} max={20} value={feather}
                onChange={e => setFeather(+e.target.value)} className={sl} />
            </div>

            <button onClick={applyAuto}
              className="w-full py-2 rounded bg-violet-600 hover:bg-violet-500 text-xs font-medium transition-colors shadow">
              Remove Background
            </button>
          </div>
        )}

        {/* ── Guided tab ──────────────────────────────────────────────────── */}
        {tab === 'guided' && (
          <div className="space-y-3">
            <div className="flex rounded overflow-hidden border border-neutral-700">
              <button
                onClick={() => setBrushMode('fg')}
                className={`flex-1 py-1.5 flex items-center justify-center gap-1.5 text-[10px] font-medium transition-colors ${
                  brushMode === 'fg'
                    ? 'bg-green-800/70 text-green-300 font-semibold'
                    : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
                }`}>
                <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
                Keep Area
              </button>
              <button
                onClick={() => setBrushMode('bg')}
                className={`flex-1 py-1.5 flex items-center justify-center gap-1.5 text-[10px] font-medium transition-colors ${
                  brushMode === 'bg'
                    ? 'bg-red-900/70 text-red-300 font-semibold'
                    : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
                }`}>
                <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
                Remove Area
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
                <span>Feather</span><span>{feather}px</span>
              </div>
              <input type="range" min={0} max={20} value={feather}
                onChange={e => setFeather(+e.target.value)} className={sl} />
            </div>

            <div className="flex gap-2">
              <button onClick={applyGuided}
                className="flex-1 py-2 rounded bg-violet-600 hover:bg-violet-500 text-xs font-medium transition-colors shadow">
                Apply Selection
              </button>
              <button onClick={clearScribbles}
                className="px-3 py-2 rounded bg-neutral-800 hover:bg-neutral-700 text-xs transition-colors border border-neutral-700">
                Clear
              </button>
            </div>
          </div>
        )}

        {/* Status */}
        {status && (
          <p className={`text-[10px] ${
            status.startsWith('Error') ? 'text-red-400'
            : status.includes('✓')     ? 'text-green-400 font-medium'
            : 'text-neutral-400 animate-pulse'
          }`}>
            {status}
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Plugin Definition ────────────────────────────────────────────────────────

export const removeBgPlugin: EditorPlugin = {
  id: 'removebg',
  name: 'Remove BG',
  icon: <Sparkles size={18} />,
  category: 'cutout',
  Panel: RemoveBgPanel,
  CanvasOverlay: RemoveBgOverlay,
  deactivate: (_ctx) => {
    // Leave scribbles intact so user can return
  },
}
