import { useState, useEffect, useRef } from 'react'
import {
  Sparkles,
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Grid,
  Film,
  Copy,
  Trash2,
  CheckSquare,
  Square,
  GripVertical,
} from 'lucide-react'
import { useSpriteStore } from './useSpriteStore'
import { useDocumentStore } from '../../store/useDocumentStore'
import { useZoomPan } from '../../hooks/useZoomPan'

const PREVIEW_PAD = 1000

export function SpritesheetPreviewWidget() {
  const { fps, setSpritesheet } = useSpriteStore()

  // Unified Document Store
  const {
    frames,
    activeFrameIndex,
    spritesheet,
    playback,
    setActiveFrameIndex,
    duplicateFrame,
    deleteFrame,
    reorderTiles,
    toggleSelection,
    setSelection,
    setPlayback,
  } = useDocumentStore()

  const [viewMode, setViewMode] = useState<'anim' | 'grid'>('anim')
  const [zoom, setZoom] = useState<number>(1)
  const [draggedTileSlot, setDraggedTileSlot] = useState<number | null>(null)

  const stageRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const animCanvasRef = useRef<HTMLCanvasElement>(null)

  const currentFrame = activeFrameIndex
  const numFrames = frames.length

  const frameWidth = spritesheet.tileWidth || (frames[0]?.width ?? 64)
  const frameHeight = spritesheet.tileHeight || (frames[0]?.height ?? 64)

  // Zoom / Pan
  useZoomPan({
    stageRef,
    pad: PREVIEW_PAD,
    zoom,
    setZoom,
    contentWidth: frameWidth,
    contentHeight: frameHeight,
    maxZoom: 64,
    dragEnabled: true,
  })

  const fitZoom = () => {
    const el = stageRef.current
    if (!el) return
    const maxW = el.clientWidth - 48
    const maxH = el.clientHeight - 48
    const z = Math.min(maxW / frameWidth, maxH / frameHeight)
    setZoom(Math.max(0.05, Math.min(z, 64)))
  }

  useEffect(() => {
    if (numFrames === 0) return
    const t = setTimeout(fitZoom, 50)
    return () => clearTimeout(t)
  }, [numFrames, frameWidth, frameHeight])

  // ─── Render active animation frame ──────────────────────────────────────────
  useEffect(() => {
    if (numFrames === 0 || viewMode !== 'anim') return
    const canvas = animCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = frameWidth
    canvas.height = frameHeight

    const frame = frames[currentFrame]
    if (!frame) return

    ctx.clearRect(0, 0, frameWidth, frameHeight)
    if (frame.imageBitmap) {
      ctx.drawImage(frame.imageBitmap, 0, 0, frameWidth, frameHeight)
    } else {
      ctx.putImageData(frame.imageData, 0, 0)
    }
  }, [frames, currentFrame, numFrames, frameWidth, frameHeight, viewMode])

  // ─── Animation Loop Timer ───────────────────────────────────────────────────
  useEffect(() => {
    if (numFrames === 0 || !playback.playing || viewMode !== 'anim') return

    let active = true
    let timer: ReturnType<typeof setTimeout> | null = null

    const step = () => {
      if (!active) return

      let nextFrame: number
      const selected = playback.selectedIndices

      if (selected.length > 0) {
        // Loop through selected range
        const currentInSelection = selected.indexOf(activeFrameIndex)
        if (currentInSelection === -1) {
          nextFrame = selected[0]
        } else {
          nextFrame = selected[(currentInSelection + 1) % selected.length]
        }
      } else {
        // Loop through all frames
        nextFrame = (activeFrameIndex + 1) % numFrames
      }

      setActiveFrameIndex(nextFrame)
      timer = setTimeout(step, 1000 / (fps || 10))
    }

    timer = setTimeout(step, 1000 / (fps || 10))
    return () => {
      active = false
      if (timer) clearTimeout(timer)
    }
  }, [numFrames, playback.playing, fps, activeFrameIndex, playback.selectedIndices, viewMode])

  // ─── Actions ────────────────────────────────────────────────────────────────
  const handleSelectAll = () => {
    setSelection(Array.from({ length: numFrames }, (_, i) => i))
  }

  const handleDeselectAll = () => {
    setSelection([])
  }

  const handleDuplicateSelected = () => {
    if (playback.selectedIndices.length > 0) {
      playback.selectedIndices.forEach((idx) => duplicateFrame(idx))
    } else {
      duplicateFrame(activeFrameIndex)
    }
  }

  const handleDeleteSelected = () => {
    if (playback.selectedIndices.length > 0) {
      // Delete in reverse order to avoid shifting indices
      const sorted = [...playback.selectedIndices].sort((a, b) => b - a)
      sorted.forEach((idx) => deleteFrame(idx))
      setSelection([])
    } else {
      deleteFrame(activeFrameIndex)
    }
  }

  // ─── Empty state ────────────────────────────────────────────────────────────
  if (numFrames === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 p-8 bg-neutral-950 text-center select-none text-neutral-500">
        <Sparkles size={48} className="opacity-15 text-violet-400" />
        <p className="text-sm font-medium text-neutral-400">No active spritesheet document</p>
        <p className="text-xs text-neutral-600 max-w-xs">
          Compile a video/GIF or open an image to slice frames and edit tiles.
        </p>
      </div>
    )
  }

  return (
    <div className="h-full w-full flex flex-col bg-neutral-950 text-neutral-200">
      {/* Top Bar Mode Switcher & Tools */}
      <div className="flex items-center justify-between px-3 py-2 bg-neutral-900 border-b border-neutral-800 text-xs">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode('anim')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded font-medium transition-colors ${
              viewMode === 'anim' ? 'bg-violet-600 text-white' : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Film size={13} />
            <span>Animation View</span>
          </button>
          <button
            onClick={() => setViewMode('grid')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded font-medium transition-colors ${
              viewMode === 'grid' ? 'bg-violet-600 text-white' : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Grid size={13} />
            <span>Tile Grid View</span>
          </button>
        </div>

        {/* Selection & Rearrange Toolbar */}
        <div className="flex items-center gap-2">
          {playback.selectedIndices.length > 0 ? (
            <button
              onClick={handleDeselectAll}
              className="flex items-center gap-1 px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300"
              title="Deselect All Tiles"
            >
              <Square size={12} />
              <span>Deselect ({playback.selectedIndices.length})</span>
            </button>
          ) : (
            <button
              onClick={handleSelectAll}
              className="flex items-center gap-1 px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300"
              title="Select All Tiles"
            >
              <CheckSquare size={12} />
              <span>Select All</span>
            </button>
          )}

          <button
            onClick={handleDuplicateSelected}
            className="p-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300"
            title="Duplicate Selected Frame(s)"
          >
            <Copy size={13} />
          </button>
          <button
            onClick={handleDeleteSelected}
            className="p-1.5 rounded bg-neutral-800 hover:bg-red-900/60 hover:text-red-300 text-neutral-300"
            title="Delete Selected Frame(s)"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Main Viewport Content */}
      {viewMode === 'anim' ? (
        <div
          ref={stageRef}
          className="flex-1 overflow-auto bg-neutral-900/60 checker-bg cursor-grab active:cursor-grabbing select-none relative"
        >
          <div className="flex items-center justify-center" style={{ padding: PREVIEW_PAD }}>
            <div
              ref={containerRef}
              className="relative shrink-0 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)] border border-neutral-800"
              style={{ width: frameWidth * zoom, height: frameHeight * zoom }}
            >
              <canvas
                ref={animCanvasRef}
                style={{
                  width: frameWidth * zoom,
                  height: frameHeight * zoom,
                  display: 'block',
                  imageRendering: zoom >= 4 ? 'pixelated' : 'auto',
                }}
              />
            </div>
          </div>
        </div>
      ) : (
        /* Tile Grid Inspector with Drag & Drop Reordering */
        <div className="flex-1 overflow-auto p-4 bg-neutral-950 checker-bg select-none">
          <div
            className="grid gap-3"
            style={{
              gridTemplateColumns: `repeat(${spritesheet.cols || 4}, minmax(0, 1fr))`,
            }}
          >
            {spritesheet.frameMap.map((frameIdx, slotIdx) => {
              const frame = frames[frameIdx]
              if (!frame) return null

              const isActive = frameIdx === activeFrameIndex
              const isSelected = playback.selectedIndices.includes(frameIdx)

              return (
                <div
                  key={`${frame.id}_slot_${slotIdx}`}
                  draggable
                  onDragStart={() => setDraggedTileSlot(slotIdx)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (draggedTileSlot !== null && draggedTileSlot !== slotIdx) {
                      reorderTiles(draggedTileSlot, slotIdx)
                      setDraggedTileSlot(null)
                    }
                  }}
                  onClick={(e) => {
                    toggleSelection(frameIdx, e.ctrlKey || e.metaKey || e.shiftKey)
                    setActiveFrameIndex(frameIdx)
                  }}
                  className={`group relative p-2 rounded-lg border cursor-pointer transition-all flex flex-col items-center gap-1.5 ${
                    isActive
                      ? 'bg-violet-950/40 border-violet-500 shadow-md shadow-violet-950/50'
                      : isSelected
                      ? 'bg-neutral-850 border-neutral-600'
                      : 'bg-neutral-900/90 border-neutral-800 hover:border-neutral-700 hover:bg-neutral-850'
                  }`}
                >
                  {/* Grip Icon for Drag & Drop */}
                  <div className="absolute top-1 left-1 opacity-0 group-hover:opacity-60 text-neutral-400">
                    <GripVertical size={12} />
                  </div>

                  {/* Slot & Active Badges */}
                  <div className="flex items-center justify-between w-full text-[10px] text-neutral-500 px-1 font-mono">
                    <span>#{slotIdx + 1}</span>
                    {isActive && (
                      <span className="text-[9px] bg-violet-600 text-white px-1.5 py-0.5 rounded font-sans font-semibold">
                        Editing on Canvas
                      </span>
                    )}
                  </div>

                  {/* Thumbnail Image */}
                  <div className="w-full h-24 flex items-center justify-center overflow-hidden rounded bg-neutral-950/80 p-1 border border-neutral-850">
                    <TileThumbnail frame={frame} />
                  </div>

                  {/* Name Footer */}
                  <span className="text-[10px] text-neutral-400 font-medium truncate w-full text-center">
                    {frame.name}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Control bar */}
      <div className="flex-none p-3 bg-neutral-900 border-t border-neutral-800 flex flex-col gap-3">
        {/* Scrubber */}
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={numFrames - 1}
            value={activeFrameIndex}
            onChange={(e) => setActiveFrameIndex(+e.target.value)}
            className="flex-1 h-1 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-violet-500 focus:outline-none"
          />
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between text-xs gap-4">
          {/* Playback */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveFrameIndex((activeFrameIndex - 1 + numFrames) % numFrames)}
              className="p-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors border border-neutral-750"
              title="Previous Frame"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              onClick={() => setPlayback({ playing: !playback.playing })}
              className="px-4 py-1.5 rounded bg-violet-600 hover:bg-violet-500 text-white font-medium transition-all shadow-md flex items-center gap-1.5"
            >
              {playback.playing ? <Pause size={12} /> : <Play size={12} />}
              {playback.playing ? 'Pause' : 'Play'}
            </button>
            <button
              onClick={() => setActiveFrameIndex((activeFrameIndex + 1) % numFrames)}
              className="p-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors border border-neutral-750"
              title="Next Frame"
            >
              <ChevronRight size={14} />
            </button>
          </div>

          {/* Frame Stats */}
          <div className="text-neutral-400 font-medium font-mono text-[10px] bg-neutral-950/40 px-3 py-1.5 rounded border border-neutral-800 max-w-sm truncate">
            <span>
              {frameWidth}x{frameHeight}px
            </span>
            <span className="text-neutral-600 mx-2">|</span>
            <span className="text-violet-400">
              Frame {activeFrameIndex + 1}/{numFrames}
            </span>
            {playback.selectedIndices.length > 0 && (
              <span className="text-emerald-400 ml-2">
                (Looping {playback.selectedIndices.length} selected)
              </span>
            )}
          </div>

          {/* Speed & Zoom */}
          <div className="flex items-center gap-4 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-neutral-500 font-mono text-[10px]">{fps} FPS</span>
              <input
                type="range"
                min={1}
                max={30}
                value={fps}
                onChange={(e) => setSpritesheet({ fps: +e.target.value })}
                className="w-16 h-1 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-violet-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setZoom((z) => Math.max(0.05, z / 1.2))}
                className="p-1 text-neutral-400 hover:text-white transition-colors"
                title="Zoom Out"
              >
                <ZoomOut size={14} />
              </button>
              <span className="text-neutral-300 font-mono text-[10px] min-w-[36px] text-center">
                {(zoom * 100).toFixed(0)}%
              </span>
              <button
                onClick={() => setZoom((z) => Math.min(64, z * 1.2))}
                className="p-1 text-neutral-400 hover:text-white transition-colors"
                title="Zoom In"
              >
                <ZoomIn size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Render thumbnail for individual tile item */
function TileThumbnail({ frame }: { frame: any }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = frame.width
    canvas.height = frame.height
    ctx.clearRect(0, 0, frame.width, frame.height)

    if (frame.imageBitmap) {
      ctx.drawImage(frame.imageBitmap, 0, 0)
    } else {
      ctx.putImageData(frame.imageData, 0, 0)
    }
  }, [frame])

  return (
    <canvas
      ref={canvasRef}
      className="max-w-full max-h-full object-contain pointer-events-none"
      style={{ imageRendering: 'pixelated' }}
    />
  )
}
