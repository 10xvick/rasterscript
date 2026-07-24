import { useRef, useCallback, useEffect, useState } from 'react'
import { Play, Pause, SkipBack, SkipForward, Film, Scissors, Copy, Trash2, Layers, ChevronUp, ChevronDown, Eye, EyeOff } from 'lucide-react'
import { useEditorStore } from '../../store/useEditorStore'
import type { LayerInfo } from '../../core/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(s: number, short = false): string {
  if (short && s < 60) return `${s.toFixed(1)}s`
  const m   = Math.floor(s / 60)
  const sec = (s % 60).toFixed(1).padStart(4, '0')
  return `${m}:${sec}`
}

function buildRulerTicks(duration: number, width: number): { time: number; pct: number; major: boolean }[] {
  if (duration <= 0 || width <= 0) return []
  const steps  = [0.1, 0.5, 1, 2, 5, 10, 30, 60]
  const step   = steps.find(s => (s / duration) * width >= 50) ?? 60
  const ticks  = []
  for (let t = 0; t <= duration; t += step / 5) {
    ticks.push({ time: t, pct: (t / duration) * 100, major: t % step < step / 10 })
  }
  return ticks
}

// ─── Layer track block ────────────────────────────────────────────────────────

function LayerTrackBlock({
  layer, duration, isActive, onActivate, updateProperties, trackWidth
}: {
  layer: LayerInfo
  duration: number
  isActive: boolean
  onActivate: () => void
  updateProperties: (props: Partial<LayerInfo>) => void
  trackWidth: number
}) {
  const left = ((layer.startTime ?? 0) / duration) * 100
  const width = (((layer.endTime ?? 0) - (layer.startTime ?? 0)) / duration) * 100

  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation()
    onActivate()

    const rect = e.currentTarget.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const edgeTolerance = 8
    const isLeftEdge = clickX <= edgeTolerance
    const isRightEdge = clickX >= rect.width - edgeTolerance

    const startX = e.clientX
    const startStartTime = layer.startTime ?? 0
    const startEndTime = layer.endTime ?? 0
    const startTrimStart = layer.trimStart ?? 0
    const startTrimEnd = layer.trimEnd ?? 0
    const videoDuration = layer.videoDuration ?? duration

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX
      const deltaTime = (deltaX / trackWidth) * duration

      if (isLeftEdge) {
        // Trim left edge
        const maxStart = startEndTime - 0.1
        const newStartTime = Math.max(0, Math.min(maxStart, startStartTime + deltaTime))
        const actualDelta = newStartTime - startStartTime
        const newTrimStart = Math.max(0, Math.min(startTrimEnd - 0.1, startTrimStart + actualDelta))
        updateProperties({
          startTime: newStartTime,
          trimStart: newTrimStart
        })
      } else if (isRightEdge) {
        // Trim right edge
        const minEnd = startStartTime + 0.1
        const newEndTime = Math.max(minEnd, Math.min(duration, startEndTime + deltaTime))
        const actualDelta = newEndTime - startEndTime
        const newTrimEnd = Math.max(startTrimStart + 0.1, Math.min(videoDuration, startTrimEnd + actualDelta))
        updateProperties({
          endTime: newEndTime,
          trimEnd: newTrimEnd
        })
      } else {
        // Slide entire block
        const clipDuration = startEndTime - startStartTime
        const maxStart = duration - clipDuration
        const newStartTime = Math.max(0, Math.min(maxStart, startStartTime + deltaTime))
        updateProperties({
          startTime: newStartTime,
          endTime: newStartTime + clipDuration
        })
      }
    }

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }

  const getCursorClass = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const edgeTolerance = 8
    if (clickX <= edgeTolerance || clickX >= rect.width - edgeTolerance) {
      e.currentTarget.style.cursor = 'ew-resize'
    } else {
      e.currentTarget.style.cursor = 'grab'
    }
  }

  return (
    <div
      onMouseDown={handleMouseDown}
      onMouseMove={getCursorClass}
      className={`absolute top-1 bottom-1 rounded border overflow-hidden flex items-center select-none ${
        isActive
          ? 'border-violet-500 ring-1 ring-violet-500/50 bg-violet-900/40 text-violet-100 z-10'
          : 'border-neutral-700 hover:border-neutral-600 bg-neutral-800/40 text-neutral-400 z-0'
      }`}
      style={{ left: `${left}%`, width: `${Math.max(width, 0.5)}%` }}
    >
      <div className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize" />
      <div className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize" />
      <span className="relative text-[9px] font-medium truncate px-2.5 pointer-events-none">
        {layer.name}
      </span>
    </div>
  )
}

function StaticTrackBlock({
  layer, isActive, onActivate
}: {
  layer: LayerInfo
  isActive: boolean
  onActivate: () => void
}) {
  return (
    <div
      onClick={onActivate}
      className={`absolute inset-y-1 left-0 right-0 rounded border border-dashed select-none cursor-pointer flex items-center ${
        isActive
          ? 'border-neutral-600 bg-neutral-900/30 text-neutral-300'
          : 'border-neutral-800 bg-neutral-950/10 text-neutral-600'
      }`}
    >
      <span className="text-[9px] font-medium truncate px-2.5">
        {layer.name} (Static Layer)
      </span>
    </div>
  )
}

// ─── VideoTimeline ────────────────────────────────────────────────────────────

export function VideoTimeline() {
  const {
    layerInfos, activeLayerId,
    currentTime, duration, playing, setTimeline,
    engine
  } = useEditorStore()

  const rulerRef  = useRef<HTMLDivElement>(null)
  const trackRef  = useRef<HTMLDivElement>(null)
  const [trackWidth, setTrackWidth] = useState(1)

  useEffect(() => {
    if (!trackRef.current) return
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setTrackWidth(Math.max(1, entry.contentRect.width - 160))
      }
    })
    ro.observe(trackRef.current)
    return () => ro.disconnect()
  }, [])

  const activeLayer = layerInfos.find(l => l.id === activeLayerId)
  const canSlice = activeLayer?.isVideo && currentTime > (activeLayer.startTime ?? 0) && currentTime < (activeLayer.endTime ?? duration)

  const handleSlice = () => {
    if (!activeLayer || !engine || !canSlice) return
    
    const originalEnd = activeLayer.endTime ?? duration
    const originalTrimEnd = activeLayer.trimEnd ?? activeLayer.videoDuration ?? duration
    const splitPoint = currentTime
    
    const firstSegmentDuration = splitPoint - (activeLayer.startTime ?? 0)
    const newTrimEnd = (activeLayer.trimStart ?? 0) + firstSegmentDuration
    
    engine.setLayerVideoProperties(activeLayer.id, {
      endTime: splitPoint,
      trimEnd: newTrimEnd
    })
    
    const activeCtx = engine.getContext().getActiveLayerCtx()
    if (!activeCtx) return
    const imgData = activeCtx.getImageData(0, 0, activeCtx.canvas.width, activeCtx.canvas.height)
    
    engine.pasteAsLayer(imgData, 0, 0, activeLayer.name + ' (Part 2)')
    const newId = engine.activeLayerId
    
    engine.setLayerVideoProperties(newId, {
      isVideo: true,
      videoFile: activeLayer.videoFile,
      videoDuration: activeLayer.videoDuration,
      startTime: splitPoint,
      endTime: originalEnd,
      trimStart: newTrimEnd,
      trimEnd: originalTrimEnd,
      removeBg: activeLayer.removeBg,
      bgKeyColor: activeLayer.bgKeyColor,
      bgThreshold: activeLayer.bgThreshold
    })
  }

  const handleDuplicate = () => {
    if (!activeLayer || !engine) return
    
    const activeCtx = engine.getContext().getActiveLayerCtx()
    if (!activeCtx) return
    const imgData = activeCtx.getImageData(0, 0, activeCtx.canvas.width, activeCtx.canvas.height)
    
    engine.pasteAsLayer(imgData, 0, 0, activeLayer.name + ' Copy')
    const newId = engine.activeLayerId
    
    if (activeLayer.isVideo) {
      engine.setLayerVideoProperties(newId, {
        isVideo: true,
        videoFile: activeLayer.videoFile,
        videoDuration: activeLayer.videoDuration,
        startTime: activeLayer.startTime,
        endTime: activeLayer.endTime,
        trimStart: activeLayer.trimStart,
        trimEnd: activeLayer.trimEnd,
        removeBg: activeLayer.removeBg,
        bgKeyColor: activeLayer.bgKeyColor,
        bgThreshold: activeLayer.bgThreshold
      })
    }
  }

  const handleDelete = () => {
    if (!activeLayer || !engine) return
    if (confirm(`Delete layer "${activeLayer.name}"?`)) {
      engine.deleteLayer(activeLayer.id)
    }
  }

  const seekToTrimStart = () => {
    if (activeLayer?.isVideo) {
      setTimeline({ currentTime: activeLayer.startTime ?? 0 })
    } else {
      setTimeline({ currentTime: 0 })
    }
  }

  const seekToTrimEnd = () => {
    if (activeLayer?.isVideo) {
      setTimeline({ currentTime: activeLayer.endTime ?? duration })
    } else {
      setTimeline({ currentTime: duration })
    }
  }

  const togglePlay = () => setTimeline({ playing: !playing })

  const playheadPct = duration > 0 ? (currentTime / duration) * 100 : 0
  const ticks = rulerRef.current
    ? buildRulerTicks(duration, rulerRef.current.offsetWidth)
    : []

  const startScrub = useCallback((e: React.MouseEvent) => {
    if (!rulerRef.current || duration <= 0) return
    
    const doScrub = (moveEvent: MouseEvent) => {
      if (!rulerRef.current) return
      const r = rulerRef.current.getBoundingClientRect()
      const clickX = moveEvent.clientX - r.left
      const t = Math.max(0, Math.min(duration, (clickX / r.width) * duration))
      setTimeline({ currentTime: t })
    }
    
    doScrub(e.nativeEvent)
    
    const onMouseUp = () => {
      window.removeEventListener('mousemove', doScrub)
      window.removeEventListener('mouseup', onMouseUp)
    }
    window.addEventListener('mousemove', doScrub)
    window.addEventListener('mouseup', onMouseUp)
  }, [duration, setTimeline])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' ||
          document.activeElement?.tagName === 'TEXTAREA' ||
          document.activeElement?.tagName === 'SELECT') {
        return
      }

      if (e.key === ' ') {
        e.preventDefault()
        togglePlay()
      } else if (e.key.toLowerCase() === 's') {
        if (canSlice) {
          e.preventDefault()
          handleSlice()
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        handleDelete()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeLayer, currentTime, playing, canSlice, setTimeline])

  return (
    <div className="h-full flex flex-col bg-neutral-950 select-none overflow-hidden text-neutral-300">
      {/* Transport bar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-neutral-800 bg-neutral-900 flex-none">
        <button onClick={seekToTrimStart} title="Jump to start" className="p-1 hover:bg-neutral-700 rounded transition-colors text-neutral-400 hover:text-white">
          <SkipBack size={13} />
        </button>
        <button onClick={togglePlay} className="w-6 h-6 rounded-full bg-violet-600 hover:bg-violet-500 flex items-center justify-center transition-colors">
          {playing ? <Pause size={11} className="text-white" /> : <Play size={11} className="text-white" />}
        </button>
        <button onClick={seekToTrimEnd} title="Jump to end" className="p-1 hover:bg-neutral-700 rounded transition-colors text-neutral-400 hover:text-white">
          <SkipForward size={13} />
        </button>

        <span className="text-[11px] font-mono text-violet-300 ml-1">{fmtTime(currentTime)}</span>
        <span className="text-[11px] font-mono text-neutral-600">/ {fmtTime(duration)}</span>

        {activeLayer && activeLayer.isVideo && (
          <span className="ml-auto text-[10px] text-neutral-500 font-mono">
            [{fmtTime(activeLayer.startTime ?? 0, true)} – {fmtTime(activeLayer.endTime ?? duration, true)}]
            &nbsp;·&nbsp;{((activeLayer.endTime ?? duration) - (activeLayer.startTime ?? 0)).toFixed(1)}s
          </span>
        )}
      </div>

      {/* Timeline body */}
      <div className="flex-1 relative overflow-hidden flex flex-col">
        {/* Ruler row */}
        <div className="h-6 bg-neutral-900 border-b border-neutral-800 flex-none relative">
          <div className="absolute left-0 top-0 w-40 h-full border-r border-neutral-800 bg-neutral-900 z-10" />
          <div
            ref={rulerRef}
            onMouseDown={startScrub}
            className="absolute top-0 left-40 right-0 bottom-0 cursor-ew-resize"
          >
            {ticks.map(tick => (
              <div
                key={tick.time}
                className="absolute top-0 flex flex-col items-center"
                style={{ left: `${tick.pct}%` }}
              >
                <div className={`w-px ${tick.major ? 'h-3 bg-neutral-500' : 'h-1.5 bg-neutral-750'}`} />
                {tick.major && (
                  <span className="text-[8px] text-neutral-600 font-mono absolute top-2.5 -translate-x-1/2 select-none">
                    {fmtTime(tick.time, true)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Tracks area */}
        <div
          ref={trackRef}
          className="flex-1 overflow-y-auto relative min-h-0"
        >
          <div className="flex flex-col min-h-full">
            {layerInfos.map(layer => {
              const isActive = layer.id === activeLayerId
              return (
                <div key={layer.id} className="flex border-b border-neutral-900 h-10 items-center relative hover:bg-neutral-900/10">
                  {/* Left Label — Draggable */}
                  <div
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', layer.id)
                      e.dataTransfer.effectAllowed = 'move'
                    }}
                    onDragOver={(e) => {
                      e.preventDefault()
                      e.dataTransfer.dropEffect = 'move'
                    }}
                    onDrop={(e) => {
                      e.preventDefault()
                      const sourceId = e.dataTransfer.getData('text/plain')
                      if (sourceId && sourceId !== layer.id) {
                        engine?.reorderLayer(sourceId, layer.id)
                      }
                    }}
                    onClick={() => engine?.setActiveLayer(layer.id)}
                    className={`w-40 flex-none h-full border-r border-neutral-900 px-2 flex items-center gap-1.5 cursor-grab active:cursor-grabbing transition-colors z-10 ${
                      isActive ? 'bg-neutral-900 text-violet-300 font-medium' : 'text-neutral-500 hover:bg-neutral-900/40'
                    }`}
                    title="Drag track up or down to reorder layer stacking order"
                  >
                    <button
                      onClick={(e) => { e.stopPropagation(); engine?.toggleLayerVisibility(layer.id) }}
                      className="p-0.5 hover:text-white text-neutral-500 rounded"
                      title={layer.visible ? "Hide Track" : "Show Track"}
                    >
                      {layer.visible ? <Eye size={11} className="text-violet-400" /> : <EyeOff size={11} className="text-neutral-600" />}
                    </button>
                    {layer.isVideo ? <Film size={11} className="text-violet-400 shrink-0" /> : <Layers size={11} className="text-neutral-600 shrink-0" />}
                    <span className="text-[10px] truncate flex-1 font-medium">{layer.name}</span>

                    {/* Move Track Up / Down */}
                    <div className="flex items-center gap-0.5 shrink-0 opacity-80 hover:opacity-100">
                      <button
                        onClick={(e) => { e.stopPropagation(); engine?.moveLayerUp(layer.id) }}
                        className="p-0.5 hover:bg-neutral-800 text-neutral-400 hover:text-white rounded"
                        title="Move Track Up"
                      >
                        <ChevronUp size={10} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); engine?.moveLayerDown(layer.id) }}
                        className="p-0.5 hover:bg-neutral-800 text-neutral-400 hover:text-white rounded"
                        title="Move Track Down"
                      >
                        <ChevronDown size={10} />
                      </button>
                    </div>
                  </div>

                  {/* Right Track content */}
                  <div className="flex-1 h-full relative z-0">
                    {layer.isVideo ? (
                      <LayerTrackBlock
                        layer={layer}
                        duration={duration}
                        isActive={isActive}
                        onActivate={() => engine?.setActiveLayer(layer.id)}
                        updateProperties={(props) => engine?.setLayerVideoProperties?.(layer.id, props)}
                        trackWidth={trackWidth}
                      />
                    ) : (
                      <StaticTrackBlock
                        layer={layer}
                        isActive={isActive}
                        onActivate={() => engine?.setActiveLayer(layer.id)}
                      />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Vertical Playhead line + handle */}
        <div
          className="absolute top-0 bottom-0 w-px bg-violet-500 pointer-events-none z-20"
          style={{ left: `calc(10rem + (100% - 10rem) * ${playheadPct / 100})` }}
        >
          {/* Draggable head/handle on the ruler */}
          <div
            onMouseDown={startScrub}
            className="absolute top-0 -translate-x-1/2 w-4 h-4 bg-violet-500 border border-violet-300 rounded-b shadow cursor-ew-resize flex items-center justify-center pointer-events-auto hover:bg-violet-400 transition-colors"
            title="Drag to Scrub Timeline"
          >
            <div className="w-0.5 h-2 bg-white/80" />
          </div>
        </div>
      </div>
    </div>
  )
}
