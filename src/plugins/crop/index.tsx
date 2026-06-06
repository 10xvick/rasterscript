import { useRef, useState, useCallback, useEffect } from 'react'
import { Crop } from 'lucide-react'
import type { EditorPlugin, PluginOverlayProps, PluginPanelProps } from '../../core/types'

interface Rect { x: number; y: number; w: number; h: number }

// ─── Overlay ──────────────────────────────────────────────────────────────────

interface CropOverlayProps extends PluginOverlayProps {
  onRectChange?: (rect: Rect | null) => void
}

function CropOverlay({ context, containerRef, onRectChange }: CropOverlayProps) {
  const divRef = useRef<HTMLDivElement>(null)
  const [rect, setRect] = useState<Rect | null>(null)
  const [dragging, setDragging] = useState(false)
  const start = useRef({ x: 0, y: 0 })

  const getCanvasPoint = useCallback((e: React.PointerEvent) => {
    const div = divRef.current!
    const r = div.getBoundingClientRect()
    const container = containerRef.current!
    const cr = container.getBoundingClientRect()
    
    // Screen coordinates relative to div
    const screenX = e.clientX - r.left
    const screenY = e.clientY - r.top
    
    // Scale factor from screen to canvas
    const scaleX = context.getWidth() / cr.width
    const scaleY = context.getHeight() / cr.height
    
    // Canvas coordinates
    return {
      x: screenX * scaleX,
      y: screenY * scaleY,
    }
  }, [context, containerRef])

  const onPointerDown = (e: React.PointerEvent) => {
    const p = getCanvasPoint(e)
    start.current = p
    const newRect = { x: p.x, y: p.y, w: 0, h: 0 }
    setRect(newRect)
    setDragging(true);
    (e.target as Element).setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return
    const p = getCanvasPoint(e)
    const newRect = {
      x: Math.min(p.x, start.current.x),
      y: Math.min(p.y, start.current.y),
      w: Math.abs(p.x - start.current.x),
      h: Math.abs(p.y - start.current.y),
    }
    setRect(newRect)
    onRectChange?.(newRect)
  }

  const onPointerUp = () => {
    setDragging(false)
    onRectChange?.(rect)
  }

  if (!containerRef.current) return null
  const container = containerRef.current
  const cw = container.clientWidth
  const ch = container.clientHeight
  const scaleX = context.getWidth() / cw
  const scaleY = context.getHeight() / ch

  // Convert canvas coordinates back to screen for rendering
  const screenRect = rect ? {
    x: rect.x / scaleX,
    y: rect.y / scaleY,
    w: rect.w / scaleX,
    h: rect.h / scaleY,
  } : null

  return (
    <div
      ref={divRef}
      className="absolute inset-0 w-full h-full cursor-crosshair"
      style={{ zIndex: 10 }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {screenRect && screenRect.w > 2 && screenRect.h > 2 && (
        <>
          <div
            className="absolute"
            style={{
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.45)',
              pointerEvents: 'none',
            }}
          />
          <div
            className="absolute border-2 border-dashed border-white"
            style={{
              left: screenRect.x,
              top: screenRect.y,
              width: screenRect.w,
              height: screenRect.h,
              pointerEvents: 'none',
            }}
          />
        </>
      )}
    </div>
  )
}

// ─── Panel ────────────────────────────────────────────────────────────────────

interface CropPanelProps extends PluginPanelProps {
  overlayRect?: Rect | null
  onApply?: () => void
}

function CropPanel({ context, overlayRect, onApply }: CropPanelProps) {
  const [x, setX] = useState(0)
  const [y, setY] = useState(0)
  const [w, setW] = useState(() => context.getWidth())
  const [h, setH] = useState(() => context.getHeight())

  // Auto-update from overlay drag
  useEffect(() => {
    if (overlayRect && overlayRect.w > 0 && overlayRect.h > 0) {
      setX(Math.round(overlayRect.x))
      setY(Math.round(overlayRect.y))
      setW(Math.round(overlayRect.w))
      setH(Math.round(overlayRect.h))
    }
  }, [overlayRect])

  const apply = () => {
    const cw = context.getWidth(), ch = context.getHeight()
    const cx = Math.max(0, Math.min(x, cw - 1))
    const cy = Math.max(0, Math.min(y, ch - 1))
    const cW = Math.max(1, Math.min(w, cw - cx))
    const cH = Math.max(1, Math.min(h, ch - cy))
    context.cropDocument(cx, cy, cW, cH)
    onApply?.()
  }

  const inputCls = 'w-full bg-neutral-800 border border-neutral-600 rounded px-2 py-1 text-sm focus:outline-none focus:border-violet-500'
  const labelCls = 'text-xs text-neutral-400'

  return (
    <div className="p-3 space-y-2">
      <p className="text-xs text-neutral-400">Crop region (pixels)</p>
      {([['X', x, setX], ['Y', y, setY], ['Width', w, setW], ['Height', h, setH]] as const).map(
        ([label, val, setter]) => (
          <div key={label as string}>
            <label className={labelCls}>{label as string}</label>
            <input
              type="number" min={0} value={val as number}
              onChange={e => (setter as (v: number) => void)(Number(e.target.value))}
              className={inputCls}
            />
          </div>
        )
      )}
      <button
        onClick={apply}
        className="w-full py-2 rounded bg-violet-600 hover:bg-violet-500 text-sm font-medium transition-colors mt-1"
      >
        Apply Crop
      </button>
    </div>
  )
}

// ─── Wrapper to manage shared rect state ──────────────────────────────────────

const cropState = new Map<HTMLCanvasElement, Rect | null>()

function CropPanelWrapper(props: PluginPanelProps) {
  const [rect, setRect] = useState<Rect | null>(null)
  
  useEffect(() => {
    const id = `crop-${Math.random()}`
    ;(window as unknown as Record<string, unknown>)[id] = { setRect }
    return () => { delete (window as unknown as Record<string, unknown>)[id] }
  }, [])
  
  // Wrap the original apply to deactivate crop tool after crop
  const OriginalPanel = CropPanel
  return (
    <OriginalPanel 
      {...props} 
      overlayRect={rect}
      onApply={() => {
        setRect(null)
        // Deactivate crop tool
        const store = (window as unknown as Record<string, unknown>).__editorStore
        if (store && typeof store === 'object' && 'setActivePlugin' in store) {
          (store as { setActivePlugin: (id: string | null) => void }).setActivePlugin(null)
        }
      }}
    />
  )
}

function CropOverlayWrapper(props: PluginOverlayProps) {
  const handleRectChange = (rect: Rect | null) => {
    cropState.set(props.context.canvas, rect)
    // Notify panel via window
    const entries = Object.entries(window as unknown as Record<string, unknown>)
    for (const [, val] of entries) {
      if (val && typeof val === 'object' && 'setRect' in val) {
        (val as { setRect: (r: Rect | null) => void }).setRect(rect)
      }
    }
  }
  
  return <CropOverlay {...props} onRectChange={handleRectChange} />
}

export const cropPlugin: EditorPlugin = {
  id: 'crop',
  name: 'Crop',
  icon: <Crop size={18} />,
  category: 'transform',
  Panel: CropPanelWrapper,
  CanvasOverlay: CropOverlayWrapper,
}
