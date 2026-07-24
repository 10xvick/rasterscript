import { useRef, useEffect, useState, useCallback } from 'react'
import { Play, Pause, Film } from 'lucide-react'
import { useVideoStore } from './useVideoStore'
import { useMediaLibrary } from '../../store/useMediaLibrary'
import { useZoomPan } from '../../hooks/useZoomPan'
import { useChromaKeyCanvas } from '../../hooks/useChromaKeyCanvas'

const PAD = 80 // scroll padding around the video content

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(s: number): string {
  const m   = Math.floor(s / 60)
  const sec = (s % 60).toFixed(2)
  return `${m}:${sec.padStart(5, '0')}`
}

// ─── Mini timeline scrubber ───────────────────────────────────────────────────

function MiniTimeline({
  currentTime, duration, trimStart, trimEnd, onSeek,
}: {
  currentTime: number
  duration:    number
  trimStart:   number
  trimEnd:     number
  onSeek:      (t: number) => void
}) {
  const barRef = useRef<HTMLDivElement>(null)

  const seek = useCallback((e: React.MouseEvent) => {
    if (!barRef.current || duration <= 0) return
    const r   = barRef.current.getBoundingClientRect()
    const t   = Math.max(0, Math.min(duration, ((e.clientX - r.left) / r.width) * duration))
    onSeek(t)
  }, [duration, onSeek])

  const trimStartPct = (trimStart / duration) * 100
  const trimEndPct   = (trimEnd   / duration) * 100
  const headPct      = (currentTime / duration) * 100

  return (
    <div ref={barRef} className="relative h-5 bg-neutral-900 rounded cursor-pointer select-none" onMouseDown={seek}>
      <div className="absolute inset-0 rounded bg-neutral-800" />
      {/* Active trim region */}
      <div
        className="absolute top-0 bottom-0 bg-violet-900/50 border-x border-violet-500"
        style={{ left: `${trimStartPct}%`, width: `${trimEndPct - trimStartPct}%` }}
      />
      {/* Trim handles */}
      <div className="absolute top-0 bottom-0 w-1 bg-violet-500 rounded" style={{ left: `${trimStartPct}%` }} />
      <div className="absolute top-0 bottom-0 w-1 bg-violet-500 rounded" style={{ left: `${trimEndPct}%` }} />
      {/* Playhead */}
      <div className="absolute top-0 bottom-0 w-0.5 bg-white shadow" style={{ left: `${headPct}%` }}>
        <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-white" />
      </div>
    </div>
  )
}

// ─── VideoPreviewWidget ───────────────────────────────────────────────────────

export function VideoPreviewWidget() {
  const { activeClipId, currentTime, playing, removeBg, bgKeyColor, bgThreshold, setVideo } = useVideoStore()
  const { clips, sourceFiles } = useMediaLibrary()

  const clip = clips.find(c => c.id === activeClipId) ?? null
  const src  = clip ? sourceFiles.find(s => s.id === clip.sourceFileId) : null

  const stageRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const [zoom, setZoom]         = useState(1)
  const [vidObjUrl, setVidObjUrl] = useState<string | null>(null)
  const [naturalDim, setNaturalDim] = useState<{ width: number; height: number } | null>(null)

  const vidW = naturalDim?.width || clip?.width || src?.width || 640
  const vidH = naturalDim?.height || clip?.height || src?.height || 360

  // ── Shared zoom/pan hook — same one used by CanvasStage ──────────────────
  useZoomPan({
    stageRef,
    pad:          PAD,
    zoom,
    setZoom,
    contentWidth:  vidW,
    contentHeight: vidH,
    maxZoom:       16,
  })

  // ── Real-time chroma key — shared hook ───────────────────────────────────
  useChromaKeyCanvas({ videoRef, canvasRef, enabled: removeBg, keyColor: bgKeyColor, threshold: bgThreshold })

  // ── Create/revoke object URL when source file changes ────────────────────
  useEffect(() => {
    if (!src?.file) { setVidObjUrl(null); return }
    const url = URL.createObjectURL(src.file)
    setVidObjUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [src?.file])

  // ── video-seek events fired by VideoTimeline ──────────────────────────────
  useEffect(() => {
    const handler = (e: CustomEvent<number>) => {
      if (!videoRef.current) return
      videoRef.current.currentTime = e.detail
      setVideo({ currentTime: e.detail })
    }
    window.addEventListener('video-seek', handler as EventListener)
    return () => window.removeEventListener('video-seek', handler as EventListener)
  }, [setVideo])

  // ── Seek to trimStart when clip changes ───────────────────────────────────
  useEffect(() => {
    if (!clip || !videoRef.current) return
    videoRef.current.currentTime = clip.trimStart
    setVideo({ currentTime: clip.trimStart })
  }, [clip?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sync play state ───────────────────────────────────────────────────────
  useEffect(() => {
    const vid = videoRef.current
    if (!vid) return
    if (playing) vid.play().catch(() => {})
    else         vid.pause()
  }, [playing])

  // ── Time update → store + auto-stop at trimEnd ────────────────────────────
  useEffect(() => {
    const vid = videoRef.current
    if (!vid) return
    const onTime = () => {
      setVideo({ currentTime: vid.currentTime })
      if (clip && vid.currentTime >= clip.trimEnd) {
        vid.pause()
        setVideo({ playing: false })
      }
    }
    vid.addEventListener('timeupdate', onTime)
    return () => vid.removeEventListener('timeupdate', onTime)
  }, [clip, setVideo])

  const handleSeek = useCallback((t: number) => {
    if (!videoRef.current) return
    videoRef.current.currentTime = t
    setVideo({ currentTime: t })
  }, [setVideo])

  const togglePlay = useCallback(() => {
    if (!clip || !videoRef.current) return
    const vid = videoRef.current
    if (vid.currentTime >= clip.trimEnd - 0.05) vid.currentTime = clip.trimStart
    setVideo({ playing: !playing })
  }, [playing, clip, setVideo])

  // ── No clip state ─────────────────────────────────────────────────────────
  if (!clip || !src) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 bg-neutral-950 text-neutral-700">
        <Film size={36} className="opacity-20 text-violet-400" />
        <span className="text-xs">No clip selected</span>
        <span className="text-[10px] text-neutral-800">Open the Media Library panel → load a video → create a clip</span>
      </div>
    )
  }

  return (
    <div className="h-full w-full flex flex-col bg-neutral-950 overflow-hidden">

      {/* Scroll viewport — useZoomPan hooks into this ref */}
      <div
        ref={stageRef}
        className="flex-1 overflow-auto relative min-h-0"
        style={{ cursor: 'grab' }}
      >
        {/* Checkerboard — transparency indicator */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ backgroundImage: 'repeating-conic-gradient(#111 0% 25%,#1a1a1a 0% 50%)', backgroundSize: '20px 20px' }}
        />

        {/* Sized content area — scroll target */}
        <div style={{ width: vidW * zoom + PAD * 2, height: vidH * zoom + PAD * 2 }}>
          <div style={{ position: 'absolute', left: PAD, top: PAD, width: vidW * zoom, height: vidH * zoom }}>
            {/* Hidden video — RAF source for chroma key */}
            <video
              ref={videoRef}
              src={vidObjUrl ?? undefined}
              muted
              playsInline
              onLoadedMetadata={(e) => {
                const v = e.currentTarget
                if (v.videoWidth && v.videoHeight) {
                  setNaturalDim({ width: v.videoWidth, height: v.videoHeight })
                }
              }}
              style={{ display: removeBg ? 'none' : 'block', width: '100%', height: '100%', objectFit: 'contain' }}
            />
            {/* Visible canvas — shown when chroma key active */}
            <canvas
              ref={canvasRef}
              style={{ display: removeBg ? 'block' : 'none', width: '100%', height: '100%', imageRendering: 'pixelated' }}
            />
          </div>
        </div>
      </div>

      {/* Controls bar */}
      <div className="flex-none bg-neutral-900 border-t border-neutral-800 px-3 py-2 space-y-2">
        <MiniTimeline
          currentTime={currentTime}
          duration={src.duration || 1}
          trimStart={clip.trimStart}
          trimEnd={clip.trimEnd}
          onSeek={handleSeek}
        />

        <div className="flex items-center gap-3">
          <button
            onClick={togglePlay}
            className="w-7 h-7 rounded-full bg-violet-600 hover:bg-violet-500 flex items-center justify-center transition-colors flex-none"
          >
            {playing ? <Pause size={13} /> : <Play size={13} />}
          </button>

          <span className="text-[10px] font-mono text-neutral-400">
            {fmtTime(currentTime)} / {fmtTime(src.duration || 0)}
          </span>

          <span className="text-[10px] text-neutral-700 ml-auto font-mono">
            [{fmtTime(clip.trimStart)} – {fmtTime(clip.trimEnd)}]
          </span>

          <span className="text-[10px] text-neutral-600 font-mono">
            {(zoom * 100).toFixed(0)}%
          </span>
        </div>
      </div>
    </div>
  )
}
