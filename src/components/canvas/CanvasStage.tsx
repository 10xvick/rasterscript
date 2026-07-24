import { useRef, useEffect, useCallback, useState } from 'react'
import { useEditorStore } from '../../store/useEditorStore'
import { useSettingsStore } from '../../store/useSettingsStore'
import { EditorEngine } from '../../core/EditorEngine'
import { registry } from '../../core/PluginRegistry'
import { useZoomPan } from '../../hooks/useZoomPan'
import { DropZone } from '../layout/DropZone'

const CANVAS_PAD = 2000 // px of dead-space around canvas so there's always room to scroll/pan

/**
 * The main canvas viewport.
 *
 * Scroll/zoom/pan behaviour is provided by the shared `useZoomPan` hook —
 * the same hook used by `SpritesheetPreviewWidget`.  Any fix or improvement
 * to viewport interaction applies everywhere.
 */
export function CanvasStage() {
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef     = useRef<HTMLDivElement>(null)

  const { engine, zoom, setZoom, activePluginId, width, height, panMode } = useEditorStore()
  const checkerboard = useSettingsStore(s => s.checkerboard)

  // ─── Shared zoom + pan hook ──────────────────────────────────────────────
  // dragGuard: only activate panning when panMode is enabled
  useZoomPan({
    stageRef,
    pad:          CANVAS_PAD,
    zoom,
    setZoom,
    contentWidth:  width,
    contentHeight: height,
    maxZoom:       8192,
    dragEnabled:   true,
    dragGuard:     () => useEditorStore.getState().panMode,
  })

  // ─── Engine mount / remount ──────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const store = useEditorStore.getState()

    if (store.engine) {
      // Panel was closed and reopened — reattach engine to new canvas DOM node
      store.engine.reattach(canvas)
      store.syncFromEngine()
      return
    }

    // First ever mount: create engine, wait for user to load an image
    store.setEngine(new EditorEngine(canvas))
  }, [])

  // ─── Repaint on engine / size change ────────────────────────────────────
  useEffect(() => {
    if (engine) engine.composite()
  }, [engine, width, height])

  // ─── File drop → import as layers ────────────────────────────────────────
  const [dragOver, setDragOver] = useState(false)

  const importFilesAsLayers = useCallback(async (files: FileList) => {
    const eng  = useEditorStore.getState().engine
    const sync = useEditorStore.getState().syncFromEngine
    if (!eng) return
    for (const file of Array.from(files).filter(f => f.type.startsWith('image/'))) {
      const bmp  = await createImageBitmap(file)
      const tmp  = document.createElement('canvas')
      tmp.width  = bmp.width; tmp.height = bmp.height
      tmp.getContext('2d')!.drawImage(bmp, 0, 0)
      const data = tmp.getContext('2d')!.getImageData(0, 0, bmp.width, bmp.height)
      eng.importImageAsLayer(data, file.name.replace(/\.[^.]+$/, ''))
      sync()
    }
  }, [])

  const activePlugin = activePluginId ? registry.get(activePluginId) : null
  const Overlay      = activePlugin?.CanvasOverlay
  const ctx          = engine?.getContext()

  return (
    <div className="relative h-full w-full flex flex-col overflow-hidden">
      <div
        ref={stageRef}
        className={`relative flex-1 overflow-auto ${checkerboard ? 'checker-bg' : 'bg-neutral-950'} ${panMode ? 'cursor-grab active:cursor-grabbing select-none' : ''}`}
        onDragOver={e  => { e.preventDefault(); if (!dragOver) setDragOver(true) }}
        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false) }}
        onDrop={e      => { e.preventDefault(); setDragOver(false); importFilesAsLayers(e.dataTransfer.files) }}
      >
        <div className="flex items-center justify-center" style={{ padding: CANVAS_PAD }}>
          <div
            ref={containerRef}
            className="relative shrink-0"
            style={{ width: width * zoom, height: height * zoom }}
          >
            <canvas
              ref={canvasRef}
              width={width}
              height={height}
              style={{
                width:           width * zoom,
                height:          height * zoom,
                display:         'block',
                imageRendering:  zoom >= 4 ? 'pixelated' : 'auto',
                opacity:         activePluginId === 'pixelation' ? 0 : 1,
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
      </div>
      <DropZone />
    </div>
  )
}
