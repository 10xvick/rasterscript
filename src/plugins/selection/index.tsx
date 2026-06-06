import { useState, useRef, useCallback, useEffect } from 'react'
import { RectangleHorizontal } from 'lucide-react'
import type { EditorPlugin, PluginPanelProps, PluginOverlayProps } from '../../core/types'
import { useEditorStore } from '../../store/useEditorStore'

interface Rect      { x: number; y: number; w: number; h: number }
interface Clipboard { data: ImageData; x: number; y: number; w: number; h: number }
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

// ─── Module-level shared state (overlay ↔ panel) ─────────────────────────────

type Listener = () => void
const listeners = new Set<Listener>()
let _rect: Rect | null = null
let _clipboard: Clipboard | null = null
let _floating: Floating | null = null

function notify() { listeners.forEach(fn => fn()) }
function setRect(r: Rect | null)       { _rect     = r; notify() }
function setFloating(f: Floating|null) { _floating = f; notify() }

function useSelectionState() {
  const [, tick] = useState(0)
  useEffect(() => {
    const fn = () => tick(n => n + 1)
    listeners.add(fn)
    return () => { listeners.delete(fn) }
  }, [])
  return { rect: _rect, floating: _floating }
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
  const zoom    = useEditorStore(s => s.zoom)   // subscribe so overlay re-renders on zoom change
  const [localRect,  setLocalRect]  = useState<Rect | null>(_rect)
  const [localFloat, setLocalFloat] = useState<Floating | null>(_floating)
  const [mode, setMode] = useState<'idle'|'drawing'|'moving'|'dragging-float'>('idle')
  const [hoverInRect, setHoverInRect] = useState(false)
  const startPt    = useRef({ x: 0, y: 0 })
  const startRect  = useRef<Rect | null>(null)
  const startFloat = useRef<Floating | null>(null)
  // float resize: { handle, start display xy, start float }
  const fResizeRef = useRef<{ h: Handle; sx0: number; sy0: number; f0: Floating } | null>(null)

  useEffect(() => {
    const fn = () => { setLocalRect(_rect); setLocalFloat(_floating) }
    listeners.add(fn)
    return () => { listeners.delete(fn) }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setFloating(null)
        setRect(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const toCanvas = useCallback((e: React.PointerEvent) => {
    const r = divRef.current!.getBoundingClientRect()
    return {
      x: (e.clientX - r.left) * context.getWidth()  / r.width,
      y: (e.clientY - r.top)  * context.getHeight() / r.height,
    }
  }, [context])

  const scales = () => {
    if (!containerRef.current) return { sx: 1, sy: 1 }
    return { sx: containerRef.current.clientWidth / context.getWidth(), sy: containerRef.current.clientHeight / context.getHeight() }
  }

  const inRect = (pt: {x:number;y:number}, r: Rect) =>
    pt.x >= r.x && pt.x <= r.x+r.w && pt.y >= r.y && pt.y <= r.y+r.h

  // ── background (selection draw/move) ──────────────────────────────────────
  const onBgDown = (e: React.PointerEvent) => {
    if (localFloat) return
    ;(e.target as Element).setPointerCapture(e.pointerId)
    const pt = toCanvas(e)
    if (localRect && inRect(pt, localRect)) {
      setMode('moving'); startPt.current = pt; startRect.current = { ...localRect }
    } else {
      setMode('drawing'); startPt.current = pt
      const r = { x: pt.x, y: pt.y, w: 0, h: 0 }
      setLocalRect(r); setRect(r)
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
      setLocalRect(r); setRect(r)
    } else if (mode === 'moving' && startRect.current) {
      const cw = context.getWidth(), ch = context.getHeight()
      const dx = pt.x - startPt.current.x, dy = pt.y - startPt.current.y
      const r: Rect = {
        x: Math.round(Math.max(0, Math.min(startRect.current.x+dx, cw-startRect.current.w))),
        y: Math.round(Math.max(0, Math.min(startRect.current.y+dy, ch-startRect.current.h))),
        w: startRect.current.w, h: startRect.current.h,
      }
      setLocalRect(r); setRect(r)
    }
  }

  const onBgUp = () => { setMode('idle') }

  // ── float drag (body) ─────────────────────────────────────────────────────
  const onFloatDown = (e: React.PointerEvent) => {
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture(e.pointerId)
    setMode('dragging-float')
    startPt.current = toCanvas(e)
    startFloat.current = _floating ? { ..._floating } : null
  }

  const onFloatMove = (e: React.PointerEvent) => {
    if (mode !== 'dragging-float' || !startFloat.current) return
    const pt = toCanvas(e)
    const f: Floating = {
      ...startFloat.current,
      x: Math.round(startFloat.current.x + (pt.x - startPt.current.x)),
      y: Math.round(startFloat.current.y + (pt.y - startPt.current.y)),
    }
    setLocalFloat(f); setFloating(f)
  }

  const onFloatUp = () => setMode('idle')

  // ── float resize (handles) ────────────────────────────────────────────────
  const onHandleDown = (e: React.PointerEvent, h: Handle) => {
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture(e.pointerId)
    if (!_floating) return
    fResizeRef.current = { h, sx0: e.clientX, sy0: e.clientY, f0: { ..._floating } }
  }

  const onHandleMove = (e: React.PointerEvent) => {
    const state = fResizeRef.current
    if (!state || !(e.buttons & 1)) return
    const { sx, sy } = scales()
    const ddx = (e.clientX - state.sx0) / sx  // delta in canvas px
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
    setLocalFloat(f); setFloating(f)
  }

  const onHandleUp = () => { fResizeRef.current = null }

  if (!containerRef.current) return null
  // zoom is subscribed at top of component — always current, triggers re-render on change.

  const sr = localRect && localRect.w > 1 && localRect.h > 1 && !localFloat ? {
    x: localRect.x * zoom, y: localRect.y * zoom,
    w: localRect.w * zoom, h: localRect.h * zoom,
  } : null

  const sf = localFloat ? {
    x: localFloat.x * zoom, y: localFloat.y * zoom,
    w: localFloat.w  * zoom, h: localFloat.h  * zoom,
  } : null

  return (
    <div
      ref={divRef}
      className="absolute inset-0 w-full h-full"
      style={{ cursor: localFloat ? 'default' : (hoverInRect && mode === 'idle' ? 'move' : 'crosshair'), zIndex: 10 }}
      onPointerDown={onBgDown}
      onPointerMove={onBgMove}
      onPointerUp={onBgUp}
    >
      {sr && (
        <>
          <div className="absolute inset-0 pointer-events-none" style={{ background: 'rgba(0,0,0,0.3)' }} />
          <div className="absolute pointer-events-none"
            style={{ left:sr.x, top:sr.y, width:sr.w, height:sr.h,
              outline:'1.5px dashed white', outlineOffset:'-0.5px', background:'transparent' }} />
          <div className="absolute pointer-events-none"
            style={{ left:sr.x, top:sr.y, width:sr.w, height:sr.h,
              outline:'1.5px dashed rgba(0,0,0,0.5)', outlineOffset:'1px', background:'transparent' }} />
        </>
      )}

      {sf && localFloat && (
        <div className="absolute" style={{ left:sf.x, top:sf.y, width:sf.w, height:sf.h }}>
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
  )
}

// ─── Panel ────────────────────────────────────────────────────────────────────

function SelectionPanel({ context }: PluginPanelProps) {
  const { rect, floating } = useSelectionState()
  const [localRect, setLocalRect] = useState<Rect>({ x: 0, y: 0, w: 0, h: 0 })
  const [floatPos, setFloatPos] = useState({ x: 0, y: 0 })

  useEffect(() => { if (rect) setLocalRect(rect) }, [rect])
  useEffect(() => { if (floating) setFloatPos({ x: floating.x, y: floating.y }) }, [floating])

  const applyInputRect = () => { if (localRect.w > 0 && localRect.h > 0) setRect(localRect) }

  const doCopy = useCallback(() => {
    if (!_rect || _rect.w < 1 || _rect.h < 1) return
    const data = context.canvas.getContext('2d', { willReadFrequently: true })!.getImageData(
      Math.round(_rect.x), Math.round(_rect.y), Math.round(_rect.w), Math.round(_rect.h)
    )
    _clipboard = { data, x: Math.round(_rect.x), y: Math.round(_rect.y), w: Math.round(_rect.w), h: Math.round(_rect.h) }
  }, [context])

  const doCut = useCallback(() => {
    if (!_rect || _rect.w < 1 || _rect.h < 1) return
    const lc = context.getActiveLayerCtx()
    if (!lc) return
    const { x, y, w, h } = _rect
    const ix = Math.round(x), iy = Math.round(y), iw = Math.round(w), ih = Math.round(h)
    _clipboard = { data: lc.getImageData(ix, iy, iw, ih), x: ix, y: iy, w: iw, h: ih }
    lc.clearRect(ix, iy, iw, ih)
    context.compositeToCanvas(); context.pushHistory('Cut')
  }, [context])

  const doPaste = useCallback(() => {
    if (!_clipboard) return
    setFloating({
      data: _clipboard.data,
      x: _clipboard.x,
      y: _clipboard.y,
      w: _clipboard.w,
      h: _clipboard.h,
    })
  }, [context])

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
    if (!_floating) return
    const { data, x, y, w, h } = _floating
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
    setFloating(null)
    setRect(null)
  }, [context])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.activeElement && document.activeElement.tagName === 'INPUT') return
      if (e.key === 'Enter') doPlace()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [doPlace])

  const cancelFloat = () => { setFloating(null); setRect(null) }

  const applyFloatPos = () => {
    if (_floating) setFloating({ ..._floating, x: floatPos.x, y: floatPos.y })
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
  const hasClip = !!_clipboard

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
      {btn('Clear selection', () => setRect(null), hasSel, 'secondary')}
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
    if (_floating) { _floating = null; notify() }
  },
}
