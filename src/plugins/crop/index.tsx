/* eslint-disable react-refresh/only-export-components */
import { useRef, useState, useCallback } from 'react'
import { Crop } from 'lucide-react'
import type { EditorPlugin, PluginOverlayProps, PluginPanelProps } from '../../core/types'
import { useEditorStore } from '../../store/useEditorStore'
import { useCropStore } from './useCropStore'

// ─── Panel ────────────────────────────────────────────────────────────────────

interface CropPanelProps extends PluginPanelProps {
  onApply?: () => void
}

function CropPanel({ context, onApply }: CropPanelProps) {
  const cropRect    = useCropStore(s => s.cropRect)
  const setCropRect = useCropStore(s => s.setCropRect)

  const x = cropRect ? cropRect.x : 0
  const y = cropRect ? cropRect.y : 0
  const w = cropRect ? cropRect.w : context.getWidth()
  const h = cropRect ? cropRect.h : context.getHeight()

  const updateVal = (key: 'x' | 'y' | 'w' | 'h', val: number) => {
    const cw      = context.getWidth()
    const ch      = context.getHeight()
    const current = cropRect || { x: 0, y: 0, w: cw, h: ch }
    let clamped   = val

    if (key === 'x') clamped = Math.max(0, Math.min(val, cw - 1))
    if (key === 'y') clamped = Math.max(0, Math.min(val, ch - 1))
    if (key === 'w') clamped = Math.max(1, Math.min(val, cw - current.x))
    if (key === 'h') clamped = Math.max(1, Math.min(val, ch - current.y))

    setCropRect({ ...current, [key]: clamped })
  }

  const apply = () => {
    const cw = context.getWidth(), ch = context.getHeight()
    const cx = Math.max(0, Math.min(x, cw - 1))
    const cy = Math.max(0, Math.min(y, ch - 1))
    const cW = Math.max(1, Math.min(w, cw - cx))
    const cH = Math.max(1, Math.min(h, ch - cy))
    context.cropDocument(cx, cy, cW, cH)
    onApply?.()
  }

  const inputCls = 'w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-xs text-neutral-200 focus:outline-none focus:border-violet-500'
  const labelCls = 'text-[10px] text-neutral-400 uppercase font-medium mb-0.5 block'

  return (
    <div className="p-3 space-y-3">
      <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-medium">Crop Settings</p>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls}>Offset X</label>
          <input type="number" min={0} max={context.getWidth() - 1} value={x} onChange={e => updateVal('x', Number(e.target.value))} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Offset Y</label>
          <input type="number" min={0} max={context.getHeight() - 1} value={y} onChange={e => updateVal('y', Number(e.target.value))} className={inputCls} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls}>Width</label>
          <input type="number" min={1} max={context.getWidth() - x} value={w} onChange={e => updateVal('w', Number(e.target.value))} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Height</label>
          <input type="number" min={1} max={context.getHeight() - y} value={h} onChange={e => updateVal('h', Number(e.target.value))} className={inputCls} />
        </div>
      </div>

      <button
        onClick={apply}
        className="w-full py-2 rounded bg-violet-600 hover:bg-violet-500 text-xs font-semibold text-white transition-colors mt-1"
      >
        Apply Crop
      </button>
    </div>
  )
}

// ─── Overlay ──────────────────────────────────────────────────────────────────

function CropOverlay({ context, containerRef }: PluginOverlayProps) {
  const zoom        = useEditorStore(s => s.zoom)
  const cropRect    = useCropStore(s => s.cropRect)
  const setCropRect = useCropStore(s => s.setCropRect)

  const divRef    = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  const start     = useRef({ x: 0, y: 0 })

  const getCanvasPoint = useCallback((e: React.PointerEvent) => {
    if (!containerRef.current) return { x: 0, y: 0 }
    const r    = containerRef.current.getBoundingClientRect()
    const rawX = (e.clientX - r.left) * context.getWidth()  / r.width
    const rawY = (e.clientY - r.top)  * context.getHeight() / r.height
    return {
      x: Math.max(0, Math.min(context.getWidth(),  rawX)),
      y: Math.max(0, Math.min(context.getHeight(), rawY)),
    }
  }, [context, containerRef])

  const onPointerDown = (e: React.PointerEvent) => {
    const p = getCanvasPoint(e)
    start.current = p
    setCropRect({ x: Math.round(p.x), y: Math.round(p.y), w: 0, h: 0 })
    setDragging(true)
    divRef.current?.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return
    const p = getCanvasPoint(e)
    setCropRect({
      x: Math.round(Math.min(p.x, start.current.x)),
      y: Math.round(Math.min(p.y, start.current.y)),
      w: Math.round(Math.abs(p.x - start.current.x)),
      h: Math.round(Math.abs(p.y - start.current.y)),
    })
  }

  const onPointerUp = () => setDragging(false)

  const screenRect = cropRect && cropRect.w > 2 && cropRect.h > 2 ? {
    x: cropRect.x * zoom, y: cropRect.y * zoom,
    w: cropRect.w * zoom, h: cropRect.h * zoom,
  } : null

  return (
    <>
      <div
        ref={divRef}
        className="absolute cursor-crosshair"
        style={{ left: -2000, top: -2000, right: -2000, bottom: -2000, zIndex: 10 }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      />
      <div className="absolute inset-0 w-full h-full pointer-events-none">
        {screenRect && (
          <>
            <div className="absolute" style={{ inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', pointerEvents: 'none' }} />
            <div
              className="absolute border-2 border-dashed border-white"
              style={{ left: screenRect.x, top: screenRect.y, width: screenRect.w, height: screenRect.h, pointerEvents: 'none' }}
            />
          </>
        )}
      </div>
    </>
  )
}

// ─── Wrapper (deactivate on apply) ───────────────────────────────────────────

function CropPanelWrapper(props: PluginPanelProps) {
  const setCropRect    = useCropStore(s => s.setCropRect)
  const setActivePlugin = useEditorStore(s => s.setActivePlugin)

  return (
    <CropPanel
      {...props}
      onApply={() => {
        setCropRect(null)
        // Cleanly deactivate via the store — no window hacks
        setActivePlugin(null)
      }}
    />
  )
}

// ─── Plugin definition ────────────────────────────────────────────────────────

export const cropPlugin: EditorPlugin = {
  id:       'crop',
  name:     'Crop',
  icon:     <Crop size={18} />,
  category: 'transform',
  Panel:    CropPanelWrapper,
  CanvasOverlay: CropOverlay,
  activate:   () => useCropStore.getState().resetCrop(),
  deactivate: () => useCropStore.getState().resetCrop(),
}
