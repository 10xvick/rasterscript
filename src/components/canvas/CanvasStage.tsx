import { useRef, useEffect, useLayoutEffect, useCallback, useState } from 'react'
import { useEditorStore } from '../../store/useEditorStore'
import { useSettingsStore } from '../../store/useSettingsStore'
import { EditorEngine } from '../../core/EditorEngine'
import { registry } from '../../core/PluginRegistry'
import { importFilesAsLayers, pasteFromClipboard, openBrowseForImport } from '../../utils/importImage'
import { Clipboard, FolderOpen } from 'lucide-react'

const CANVAS_PAD = 2000

export function CanvasStage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const { engine, zoom, setZoom, activePluginId, width, height, panMode, hasImage } = useEditorStore()
  const checkerboard = useSettingsStore(s => s.checkerboard)
  const preventRecenter = useRef(false)
  const pendingScroll = useRef<{ left: number; top: number } | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const store = useEditorStore.getState()

    if (store.engine) {
      store.engine.reattach(canvas)
      store.syncFromEngine()
      return
    }

    const eng = new EditorEngine(canvas)
    store.setEngine(eng)
  }, [])

  useLayoutEffect(() => {
    const el = stageRef.current
    if (!el || !width || !height) return
    if (preventRecenter.current) {
      preventRecenter.current = false
      if (pendingScroll.current) {
        el.scrollLeft = pendingScroll.current.left
        el.scrollTop  = pendingScroll.current.top
        pendingScroll.current = null
      }
      return
    }
    el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2
    el.scrollTop  = (el.scrollHeight - el.clientHeight) / 2
  }, [zoom, width, height])

  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    let rafId = 0
    let targetZoom: number | null = null

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()

      const { zoom: storeZoom, width, height } = useEditorStore.getState()
      const baseZoom = targetZoom ?? storeZoom
      const maxZoom = Math.max(1, Math.floor(8192 / Math.max(width, height, 1)))
      const factor = e.deltaY > 0 ? 0.9 : 1.1
      const clamped = Math.max(0.05, Math.min(baseZoom * factor, maxZoom))
      if (clamped === baseZoom) return

      targetZoom = clamped

      const rect = el.getBoundingClientRect()
      const cursorX = e.clientX - rect.left
      const cursorY = e.clientY - rect.top
      const ratio = clamped / storeZoom
      pendingScroll.current = {
        left: (el.scrollLeft + cursorX - CANVAS_PAD) * ratio + CANVAS_PAD - cursorX,
        top:  (el.scrollTop  + cursorY - CANVAS_PAD) * ratio + CANVAS_PAD - cursorY,
      }

      if (rafId) return

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
  }, [setZoom])

  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    let origin: { x: number; y: number; sl: number; st: number } | null = null

    const onDown = (e: PointerEvent) => {
      if (!useEditorStore.getState().panMode) return
      el.setPointerCapture(e.pointerId)
      origin = { x: e.clientX, y: e.clientY, sl: el.scrollLeft, st: el.scrollTop }
      e.preventDefault()
    }
    const onMove = (e: PointerEvent) => {
      if (!origin) return
      el.scrollLeft = origin.sl - (e.clientX - origin.x)
      el.scrollTop = origin.st - (e.clientY - origin.y)
    }
    const onUp = () => { origin = null }

    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
    }
  }, [])


  const [dragOver, setDragOver] = useState(false)

  const dropAsLayers = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    importFilesAsLayers(e.dataTransfer.files)
  }, [])

  const activePlugin = activePluginId ? registry.get(activePluginId) : null
  const Overlay = activePlugin?.CanvasOverlay
  const ctx = engine?.getContext()

  return (
    <div
      ref={stageRef}
      className={`relative flex-1 overflow-auto ${checkerboard ? 'checker-bg' : 'bg-neutral-950'} ${panMode ? 'cursor-grab active:cursor-grabbing select-none' : ''}`}
      onDragOver={e => { e.preventDefault(); if (!dragOver) setDragOver(true) }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false) }}
      onDrop={dropAsLayers}
    >
      <div className="flex items-center justify-center" style={{ padding: CANVAS_PAD }}>
        <div
          ref={containerRef}
          className="relative shrink-0"
          style={{ width: width * zoom, height: height * zoom }}
        >
          <canvas
            ref={canvasRef}
            style={{
              width: width * zoom,
              height: height * zoom,
              display: 'block',
              imageRendering: zoom >= 4 ? 'pixelated' : 'auto',
            }}
          />
          {Overlay && ctx && !panMode && (
            <Overlay context={ctx} containerRef={containerRef} />
          )}
        </div>
      </div>

      {dragOver && (
        <div className="absolute inset-0 z-30 pointer-events-none flex items-center justify-center bg-violet-950/40 ring-2 ring-violet-400 ring-inset">
          <div className="bg-neutral-900/90 border border-violet-500 rounded-xl px-6 py-3 text-sm text-violet-300 font-medium">
            Drop to add as layers
          </div>
        </div>
      )}

      {hasImage && (
        <div className="absolute bottom-4 right-4 z-20 flex items-center gap-2">
          <button
            title="Browse files"
            onClick={() => openBrowseForImport()}
            className="p-2.5 rounded-lg bg-neutral-800/90 hover:bg-violet-600 text-neutral-400 hover:text-white border border-neutral-700 hover:border-violet-500 transition-all backdrop-blur-sm"
          >
            <FolderOpen size={18} />
          </button>
          <button
            title="Paste image"
            onClick={pasteFromClipboard}
            className="p-2.5 rounded-lg bg-neutral-800/90 hover:bg-violet-600 text-neutral-400 hover:text-white border border-neutral-700 hover:border-violet-500 transition-all backdrop-blur-sm"
          >
            <Clipboard size={18} />
          </button>
        </div>
      )}
    </div>
  )
}
