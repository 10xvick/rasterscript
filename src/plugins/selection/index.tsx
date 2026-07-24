/* eslint-disable */
import { useState, useRef, useCallback, useEffect } from 'react'
import { RectangleHorizontal } from 'lucide-react'
import type { EditorPlugin, PluginPanelProps, PluginOverlayProps } from '../../core/types'
import { useEditorStore } from '../../store/useEditorStore'
import { useSelectionStore } from './useSelectionStore'

interface Rect      { x: number; y: number; w: number; h: number }
interface Floating  { data: ImageData; x: number; y: number; w: number; h: number }

type Handle = 'tl'|'tc'|'tr'|'ml'|'mr'|'bl'|'bc'|'br'
const HANDLES: [Handle, number, number][] = [
  ['tl',0,0], ['tc',0.5,0], ['tr',1,0],
  ['ml',0,0.5],              ['mr',1,0.5],
  ['bl',0,1], ['bc',0.5,1], ['br',1,1],
]
const HANDLE_CURSOR: Record<Handle,string> = {
  tl:'nwse-resize', tc:'ns-resize', tr:'nesw-resize',
  ml:'ew-resize',                   mr:'ew-resize',
  bl:'nesw-resize', bc:'ns-resize', br:'nwse-resize',
}

// ─── Floating canvas preview ──────────────────────────────────────────────────

function FloatingPreview({ data }: { data: ImageData }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current; if (!cv) return
    cv.width = data.width; cv.height = data.height
    cv.getContext('2d')!.putImageData(data, 0, 0)
  }, [data])
  return <canvas ref={ref} style={{ display: 'block', width: '100%', height: '100%', imageRendering: 'pixelated' }} />
}

// ─── Overlay ─────────────────────────────────────────────────────────────────

function SelectionOverlay({ context, containerRef }: PluginOverlayProps) {
  const divRef  = useRef<HTMLDivElement>(null)
  const zoom         = useEditorStore(s => s.zoom)
  const rect         = useSelectionStore(s => s.rect)
  const floating     = useSelectionStore(s => s.floating)
  const setSelection = useSelectionStore(s => s.setSelection)

  const [localRect,  setLocalRect]  = useState<Rect | null>(rect)
  const [localFloat, setLocalFloat] = useState<Floating | null>(floating)
  const [mode, setMode] = useState<'idle'|'drawing'|'moving'|'dragging-float'>('idle')
  const [hoverInRect, setHoverInRect] = useState(false)
  const startPt    = useRef({ x: 0, y: 0 })
  const startRect  = useRef<Rect | null>(null)
  const fDragRef = useRef<{ sx: number; sy: number; x0: number; y0: number } | null>(null)
  const fResizeRef = useRef<{ h: string; sx0: number; sy0: number; f0: Floating } | null>(null)

  useEffect(() => {
    setLocalRect(rect)
    setLocalFloat(floating)
  }, [rect, floating])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelection({ rect: null, floating: null })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setSelection])

  const toCanvas = useCallback((e: React.PointerEvent) => {
    if (!containerRef.current) return { x: 0, y: 0 }
    const r = containerRef.current.getBoundingClientRect()
    const rawX = (e.clientX - r.left) * context.getWidth()  / r.width
    const rawY = (e.clientY - r.top)  * context.getHeight() / r.height
    return {
      x: Math.max(0, Math.min(context.getWidth(), rawX)),
      y: Math.max(0, Math.min(context.getHeight(), rawY)),
    }
  }, [context, containerRef])

  const scales = () => {
    if (!containerRef.current) return { sx: 1, sy: 1 }
    return { sx: containerRef.current.clientWidth / context.getWidth(), sy: containerRef.current.clientHeight / context.getHeight() }
  }

  const inRect = (pt: {x:number;y:number}, r: Rect) =>
    pt.x >= r.x && pt.x <= r.x+r.w && pt.y >= r.y && pt.y <= r.y+r.h

  // ── background (selection draw/move) ──────────────────────────────────────
  const onBgDown = (e: React.PointerEvent) => {
    if (localFloat) return
    if (divRef.current) {
      divRef.current.setPointerCapture(e.pointerId)
    }
    const pt = toCanvas(e)
    if (localRect && inRect(pt, localRect)) {
      setMode('moving'); startPt.current = pt; startRect.current = { ...localRect }
    } else {
      setMode('drawing'); startPt.current = pt
      const r = { x: pt.x, y: pt.y, w: 0, h: 0 }
      setLocalRect(r); setSelection({ rect: r })
    }
  }

  const onBgMove = (e: React.PointerEvent) => {
    const pt = toCanvas(e)
    if (mode === 'idle') {
      setHoverInRect(!!(localRect && localRect.w > 1 && localRect.h > 1 && !localFloat && inRect(pt, localRect)))
    }
    if (mode === 'drawing') {
      const r: Rect = {
        x: Math.round(Math.min(pt.x, startPt.current.x)),
        y: Math.round(Math.min(pt.y, startPt.current.y)),
        w: Math.round(Math.abs(pt.x - startPt.current.x)),
        h: Math.round(Math.abs(pt.y - startPt.current.y)),
      }
      setLocalRect(r); setSelection({ rect: r })
    } else if (mode === 'moving' && startRect.current) {
      const cw = context.getWidth(), ch = context.getHeight()
      const dx = pt.x - startPt.current.x, dy = pt.y - startPt.current.y
      const r: Rect = {
        x: Math.round(Math.max(0, Math.min(startRect.current.x+dx, cw-startRect.current.w))),
        y: Math.round(Math.max(0, Math.min(startRect.current.y+dy, ch-startRect.current.h))),
        w: startRect.current.w, h: startRect.current.h,
      }
      setLocalRect(r); setSelection({ rect: r })
    }
  }

  const onBgUp = () => { setMode('idle') }

  // ── float drag (body) ─────────────────────────────────────────────────────
  const onFloatDown = (e: React.PointerEvent) => {
    ;(e.target as Element).setPointerCapture(e.pointerId)
    if (!floating) return
    fDragRef.current = { sx: e.clientX, sy: e.clientY, x0: floating.x, y0: floating.y }
  }

  const onFloatMove = (e: React.PointerEvent) => {
    const state = fDragRef.current
    if (!state || !(e.buttons & 1) || !floating) return
    const { sx, sy } = scales()
    const dx = (e.clientX - state.sx) / sx
    const dy = (e.clientY - state.sy) / sy
    const f = { ...floating, x: Math.round(state.x0 + dx), y: Math.round(state.y0 + dy) }
    setLocalFloat(f); setSelection({ floating: f })
  }

  const onFloatUp = () => { fDragRef.current = null }

  // ── float resize (8 handles) ──────────────────────────────────────────────
  const onHandleDown = (e: React.PointerEvent, h: string) => {
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture(e.pointerId)
    if (!floating) return
    fResizeRef.current = { h, sx0: e.clientX, sy0: e.clientY, f0: { ...floating } }
  }

  const onHandleMove = (e: React.PointerEvent) => {
    const state = fResizeRef.current
    if (!state || !(e.buttons & 1)) return
    const { sx, sy } = scales()
    const ddx = (e.clientX - state.sx0) / sx
    const ddy = (e.clientY - state.sy0) / sy
    const o = state.f0
    let { x, y, w, h } = o
    if (state.h.includes('l')) { x = o.x + ddx; w = o.w - ddx }
    if (state.h.includes('r')) { w = o.w + ddx }
    if (state.h.includes('t')) { y = o.y + ddy; h = o.h - ddy }
    if (state.h.includes('b')) { h = o.h + ddy }
    if (w < 10) { if (state.h.includes('l')) x = o.x + o.w - 10; w = 10 }
    if (h < 10) { if (state.h.includes('t')) y = o.y + o.h - 10; h = 10 }
    const f: Floating = { data: o.data, x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) }
    setLocalFloat(f); setSelection({ floating: f })
  }

  const onHandleUp = () => { fResizeRef.current = null }

  if (!containerRef.current) return null

  const sr = localRect && localRect.w > 1 && localRect.h > 1 && !localFloat ? {
    x: localRect.x * zoom, y: localRect.y * zoom,
    w: localRect.w * zoom, h: localRect.h * zoom,
  } : null

  const sf = localFloat ? {
    x: localFloat.x * zoom, y: localFloat.y * zoom,
    w: localFloat.w  * zoom, h: localFloat.h  * zoom,
  } : null

  return (
    <>
      <div
        ref={divRef}
        className="absolute"
        style={{
          left: -2000,
          top: -2000,
          right: -2000,
          bottom: -2000,
          cursor: localFloat ? 'default' : (hoverInRect && mode === 'idle' ? 'move' : 'crosshair'),
          zIndex: 10
        }}
        onPointerDown={onBgDown}
        onPointerMove={onBgMove}
        onPointerUp={onBgUp}
      />
      <div className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 11 }}>
        {sr && (
          <>
            <div className="absolute inset-0 pointer-events-none" style={{ background: 'rgba(0,0,0,0.3)', pointerEvents: 'none' }} />
            <div className="absolute pointer-events-none"
              style={{ left:sr.x, top:sr.y, width:sr.w, height:sr.h,
                outline:'1.5px dashed white', outlineOffset:'-0.5px', background:'transparent', pointerEvents: 'none' }} />
            <div className="absolute pointer-events-none"
              style={{ left:sr.x, top:sr.y, width:sr.w, height:sr.h,
                outline:'1.5px dashed rgba(0,0,0,0.5)', outlineOffset:'1px', background:'transparent', pointerEvents: 'none' }} />
          </>
        )}

        {sf && localFloat && (
          <div className="absolute" style={{ left:sf.x, top:sf.y, width:sf.w, height:sf.h, pointerEvents: 'auto' }}>
            {/* body — drag to move */}
            <div className="absolute inset-0" style={{ cursor:'move',
              outline:'2px dashed #a78bfa', outlineOffset:'-1px', boxShadow:'0 2px 16px rgba(0,0,0,0.5)' }}
              onPointerDown={onFloatDown} onPointerMove={onFloatMove} onPointerUp={onFloatUp}>
              <FloatingPreview data={localFloat.data} />
            </div>
            {/* 8 scale handles */}
            {HANDLES.map(([h, rx, ry]) => (
              <div key={h}
                style={{
                  position:'absolute',
                  left: rx * sf.w - 5, top: ry * sf.h - 5,
                  width: 10, height: 10,
                  background: 'white', border: '1.5px solid rgba(0,0,0,0.6)',
                  borderRadius: 2, cursor: HANDLE_CURSOR[h],
                  boxShadow: '0 0 4px rgba(0,0,0,0.5)',
                }}
                onPointerDown={e => onHandleDown(e, h)}
                onPointerMove={onHandleMove}
                onPointerUp={onHandleUp}
              />
            ))}
          </div>
        )}
      </div>
    </>
  )
}

// ─── Panel ────────────────────────────────────────────────────────────────────

function SelectionPanel({ context }: PluginPanelProps) {
  const rect         = useSelectionStore(s => s.rect)
  const floating     = useSelectionStore(s => s.floating)
  const clipboard    = useSelectionStore(s => s.clipboard)
  const setSelection = useSelectionStore(s => s.setSelection)

  const [localRect, setLocalRect] = useState<Rect>({ x: 0, y: 0, w: 0, h: 0 })
  const [floatPos, setFloatPos] = useState({ x: 0, y: 0 })

  useEffect(() => { if (rect) setLocalRect(rect) }, [rect])
  useEffect(() => { if (floating) setFloatPos({ x: floating.x, y: floating.y }) }, [floating])

  const applyInputRect = () => { if (localRect.w > 0 && localRect.h > 0) setSelection({ rect: localRect }) }

  const copyToSystemClipboard = async (data: ImageData) => {
    const tmp = document.createElement('canvas')
    tmp.width = data.width; tmp.height = data.height
    tmp.getContext('2d')!.putImageData(data, 0, 0)
    tmp.toBlob(async (blob) => {
      if (!blob) return
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      } catch { }
    })
  }

  const doCopy = useCallback(() => {
    if (!rect || rect.w < 1 || rect.h < 1) return
    const data = context.canvas.getContext('2d', { willReadFrequently: true })!.getImageData(
      Math.round(rect.x), Math.round(rect.y), Math.round(rect.w), Math.round(rect.h)
    )
    const clip = { data, x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.w), h: Math.round(rect.h) }
    setSelection({ clipboard: clip })
    copyToSystemClipboard(data)
  }, [context, rect, setSelection])

  const doCut = useCallback(() => {
    if (!rect || rect.w < 1 || rect.h < 1) return
    const lc = context.getActiveLayerCtx()
    if (!lc) return
    const { x, y, w, h } = rect
    const ix = Math.round(x), iy = Math.round(y), iw = Math.round(w), ih = Math.round(h)
    const data = lc.getImageData(ix, iy, iw, ih)
    const clip = { data, x: ix, y: iy, w: iw, h: ih }
    setSelection({ clipboard: clip })
    lc.clearRect(ix, iy, iw, ih)
    context.compositeToCanvas(); context.pushHistory('Cut')
    copyToSystemClipboard(data)
  }, [context, rect, setSelection])

  const doPaste = useCallback(() => {
    if (!clipboard) return
    setSelection({
      floating: {
        data: clipboard.data,
        x: clipboard.x,
        y: clipboard.y,
        w: clipboard.w,
        h: clipboard.h,
      }
    })
  }, [clipboard, setSelection])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.activeElement && document.activeElement.tagName === 'INPUT') return
      const ctrl = e.ctrlKey || e.metaKey
      if (ctrl && e.key === 'c') { doCopy(); e.preventDefault() }
      if (ctrl && e.key === 'x') { doCut();  e.preventDefault() }
      if (ctrl && e.key === 'v') { doPaste(); e.preventDefault() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [doCopy, doCut, doPaste])

  const doPlace = useCallback(() => {
    if (!floating) return
    const { data, x, y, w, h } = floating
    let finalData = data
    if (Math.round(w) !== data.width || Math.round(h) !== data.height) {
      const src = document.createElement('canvas')
      src.width = data.width; src.height = data.height
      src.getContext('2d')!.putImageData(data, 0, 0)
      const dst = document.createElement('canvas')
      dst.width = Math.max(1, Math.round(w)); dst.height = Math.max(1, Math.round(h))
      dst.getContext('2d')!.drawImage(src, 0, 0, dst.width, dst.height)
      finalData = dst.getContext('2d')!.getImageData(0, 0, dst.width, dst.height)
    }
    context.pasteAsLayer(finalData, x, y, 'Pasted')
    setSelection({ floating: null, rect: null })
  }, [context, floating, setSelection])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.activeElement && document.activeElement.tagName === 'INPUT') return
      if (e.key === 'Enter') doPlace()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [doPlace])

  const cancelFloat = () => { setSelection({ floating: null, rect: null }) }

  const applyFloatPos = () => {
    if (floating) setSelection({ floating: { ...floating, x: floatPos.x, y: floatPos.y } })
  }

  const inputCls = 'w-full bg-neutral-800 border border-neutral-600 rounded px-2 py-1 text-sm focus:outline-none focus:border-violet-500'
  const btn = (label: string, onClick: () => void, enabled: boolean, variant: 'primary'|'secondary'|'danger' = 'secondary') =>
    <button onClick={onClick} disabled={!enabled}
      className={`flex-1 py-1.5 rounded text-xs font-medium transition-colors ${
        !enabled ? 'bg-neutral-800 opacity-40 cursor-not-allowed' :
        variant === 'primary'    ? 'bg-violet-600 hover:bg-violet-500' :
        variant === 'danger'     ? 'bg-red-900/60 hover:bg-red-800 text-red-300' :
        'bg-neutral-700 hover:bg-neutral-600'
      }`}>{label}</button>

  if (floating) {
    return (
      <div className="p-3 space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
          <p className="text-xs text-violet-300 font-medium">Floating paste</p>
        </div>
        <p className="text-[10px] text-neutral-500">Drag to reposition · handles to scale · Enter to place</p>
        <div className="grid grid-cols-2 gap-2">
          {(['x','y'] as const).map(k => (
            <div key={k}>
              <label className="text-xs text-neutral-400">{k.toUpperCase()}</label>
              <input type="number" value={floatPos[k]}
                onChange={e => setFloatPos(p => ({ ...p, [k]: Number(e.target.value) }))}
                onBlur={applyFloatPos}
                onKeyDown={e => e.key === 'Enter' && applyFloatPos()}
                className={inputCls} />
            </div>
          ))}
        </div>
        <p className="text-[10px] text-neutral-500">
          {Math.round(floating.w)} × {Math.round(floating.h)} px
          {(Math.round(floating.w) !== floating.data.width || Math.round(floating.h) !== floating.data.height) &&
            <span className="text-neutral-600"> (orig {floating.data.width}×{floating.data.height})</span>}
        </p>
        <div className="flex gap-2">
          {btn('Place', doPlace, true, 'primary')}
          {btn('Cancel', cancelFloat, true, 'danger')}
        </div>
      </div>
    )
  }

  const hasSel = !!(rect && rect.w > 1 && rect.h > 1)
  const hasClip = !!clipboard

  return (
    <div className="p-3 space-y-3">
      <p className="text-[10px] text-neutral-500 uppercase tracking-wider">Selection</p>
      <div className="grid grid-cols-2 gap-2">
        {(['X','Y','W','H'] as const).map(k => {
          const key = k.toLowerCase() as 'x'|'y'|'w'|'h'
          return (
            <div key={k}>
              <label className="text-xs text-neutral-400">{k}</label>
              <input type="number" min={0} value={localRect[key]}
                onChange={e => setLocalRect(r => ({ ...r, [key]: Number(e.target.value) }))}
                onBlur={applyInputRect} onKeyDown={e => e.key === 'Enter' && applyInputRect()}
                className={inputCls} />
            </div>
          )
        })}
      </div>
      {hasSel && <p className="text-[10px] text-neutral-500">{Math.round(rect!.w)} × {Math.round(rect!.h)} px</p>}
      <div className="flex gap-2">
        {btn('Copy', doCopy, hasSel, 'secondary')}
        {btn('Cut',  doCut,  hasSel, 'secondary')}
      </div>
      <div className="flex gap-2">
        {btn('Paste', doPaste, hasClip, 'primary')}
      </div>
      {btn('Clear selection', () => setSelection({ rect: null }), hasSel, 'secondary')}
      <div className="border-t border-neutral-800 pt-2 text-[10px] text-neutral-600 space-y-0.5">
        <p>Drag to select · drag inside to move</p>
        <p>Ctrl+C / X / V · Esc to deselect</p>
        <p>Cut samples the active layer only</p>
        <p>Copy samples the merged composite</p>
      </div>
    </div>
  )
}

// ─── Plugin export ────────────────────────────────────────────────────────────

export const selectionPlugin: EditorPlugin = {
  id: 'selection',
  name: 'Selection',
  icon: <RectangleHorizontal size={18} />,
  category: 'transform',
  Panel: SelectionPanel,
  CanvasOverlay: SelectionOverlay,
  deactivate: () => {
    // Clear active selection borders and floating layers on deactivation to prevent leaking overlays
    useSelectionStore.getState().setSelection({ rect: null, floating: null })
  },
}
