import { useState, useCallback } from 'react'
import {
  Scissors,
  Download,
  Loader2,
  Layers,
  Clock,
  SlidersHorizontal,
  Sun,
  Move,
  Sparkles,
  Eye,
  ChevronUp,
  ChevronDown,
  RotateCcw,
} from 'lucide-react'
import type { PluginPanelProps, LayerInfo } from '../../core/types'
import { useVideoStore } from './useVideoStore'
import { useMediaLibrary } from '../../store/useMediaLibrary'
import { useEditorStore } from '../../store/useEditorStore'
import { exportClip, extractFrameAsImageData } from './operations'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(s: number): string {
  const m = Math.floor(s / 60)
  const sec = (s % 60).toFixed(2)
  return `${m}:${sec.padStart(5, '0')}`
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 bg-neutral-900/40 p-2.5 rounded-lg border border-neutral-800/80">
      <p className="text-[10px] uppercase tracking-wider text-violet-400 font-semibold flex items-center gap-1.5">
        {title}
      </p>
      {children}
    </div>
  )
}

function SliderRow({
  label,
  value,
  min,
  max,
  step = 1,
  format,
  onChange,
  onReset,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  format: (v: number) => string
  onChange: (v: number) => void
  onReset?: () => void
}) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center text-[10px] text-neutral-300">
        <span className="font-medium">{label}</span>
        <div className="flex items-center gap-1.5 font-mono">
          <span className="text-violet-300">{format(value)}</span>
          {onReset && (
            <button
              onClick={onReset}
              className="p-0.5 text-neutral-500 hover:text-neutral-200 transition-colors"
              title="Reset parameter"
            >
              <RotateCcw size={10} />
            </button>
          )}
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(+e.target.value)}
        className="w-full accent-violet-500 h-1.5 bg-neutral-800 rounded appearance-none cursor-pointer"
      />
    </div>
  )
}

export function VideoPanel({ context }: PluginPanelProps) {
  const {
    activeClipId,
    currentTime,
    removeBg,
    bgKeyColor,
    bgThreshold,
    exportFormat,
    processing,
    statusText,
    ffmpegLogs,
    progress,
    setVideo,
  } = useVideoStore()

  const { engine, layerInfos, activeLayerId, syncFromEngine } = useEditorStore()
  const activeLayer = layerInfos.find((l) => l.id === activeLayerId) ?? null

  const { clips, updateClip } = useMediaLibrary()
  const clip = clips.find((c) => c.id === activeClipId) ?? null

  const sourceDuration = useMediaLibrary((s) =>
    clip ? s.sourceFiles.find((f) => f.id === clip.sourceFileId)?.duration ?? clip.trimEnd : clip?.trimEnd ?? 0
  )

  const [showLogs, setShowLogs] = useState(false)

  const log = useCallback(
    (msg: string) => setVideo((s) => ({ ffmpegLogs: [...s.ffmpegLogs.slice(-40), msg] })),
    [setVideo]
  )
  const status = useCallback((msg: string) => setVideo({ statusText: msg }), [setVideo])
  const prog = useCallback((pct: number) => setVideo({ progress: pct }), [setVideo])

  const updateActiveLayerProp = (props: Partial<LayerInfo>) => {
    if (!engine || !activeLayerId) return
    engine.setLayerVideoProperties(activeLayerId, props)
    syncFromEngine()
  }

  // ── Export ──────────────────────────────────────────────────────────────────
  const handleExport = async () => {
    if (!clip || processing) return
    setVideo({ processing: true, statusText: 'Starting…', progress: 0, ffmpegLogs: [] })
    try {
      await exportClip({ clip, format: exportFormat, removeBg, bgKeyColor, bgThreshold }, status, log, prog)
    } catch (e) {
      status(`Error: ${(e as Error).message}`)
    } finally {
      setVideo({ processing: false })
    }
  }

  // ── Frame → Layer ───────────────────────────────────────────────────────────
  const handleFrameToLayer = async () => {
    if (!clip || processing) return
    setVideo({ processing: true, statusText: 'Extracting frame…' })
    try {
      const imgData = await extractFrameAsImageData(clip, currentTime, status)
      context.pasteAsLayer(imgData, 0, 0, `Frame ${fmtTime(currentTime)}`)
    } catch (e) {
      status(`Error: ${(e as Error).message}`)
    } finally {
      setVideo({ processing: false })
    }
  }

  const sel =
    'w-full bg-neutral-950 border border-neutral-800 rounded px-2 py-1 text-xs text-neutral-200 focus:outline-none focus:border-violet-500'

  return (
    <div className="p-3 space-y-3 text-xs overflow-y-auto h-full flex flex-col select-none bg-neutral-950">
      <div className="space-y-3 flex-1">
        {/* Layer Selection Header & Track Ordering */}
        {activeLayer && (
          <div className="bg-neutral-900/90 rounded-lg p-2.5 border border-neutral-800 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-neutral-200 text-xs truncate max-w-[120px]">
                  {activeLayer.name}
                </span>
                <span className="text-[9px] bg-violet-900/60 text-violet-300 px-1.5 py-0.5 rounded border border-violet-700/50">
                  {activeLayer.isVideo ? 'Video Track' : 'Image Layer'}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => engine?.moveLayerUp(activeLayer.id)}
                  className="p-1 bg-neutral-800 hover:bg-neutral-700 rounded text-neutral-300"
                  title="Move Track Up"
                >
                  <ChevronUp size={12} />
                </button>
                <button
                  onClick={() => engine?.moveLayerDown(activeLayer.id)}
                  className="p-1 bg-neutral-800 hover:bg-neutral-700 rounded text-neutral-300"
                  title="Move Track Down"
                >
                  <ChevronDown size={12} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 1. Visual Adjustments (Color & Light) */}
        {activeLayer && (
          <Section title="Color & Light">
            <SliderRow
              label="Brightness"
              value={activeLayer.brightness ?? 100}
              min={50}
              max={200}
              format={(v) => `${v}%`}
              onChange={(v) => updateActiveLayerProp({ brightness: v })}
              onReset={() => updateActiveLayerProp({ brightness: 100 })}
            />
            <SliderRow
              label="Contrast"
              value={activeLayer.contrast ?? 100}
              min={50}
              max={200}
              format={(v) => `${v}%`}
              onChange={(v) => updateActiveLayerProp({ contrast: v })}
              onReset={() => updateActiveLayerProp({ contrast: 100 })}
            />
            <SliderRow
              label="Saturation"
              value={activeLayer.saturation ?? 100}
              min={0}
              max={300}
              format={(v) => `${v}%`}
              onChange={(v) => updateActiveLayerProp({ saturation: v })}
              onReset={() => updateActiveLayerProp({ saturation: 100 })}
            />
            <SliderRow
              label="Hue Shift"
              value={activeLayer.hueRotate ?? 0}
              min={0}
              max={360}
              format={(v) => `${v}°`}
              onChange={(v) => updateActiveLayerProp({ hueRotate: v })}
              onReset={() => updateActiveLayerProp({ hueRotate: 0 })}
            />
          </Section>
        )}

        {/* 2. Transform & Layout */}
        {activeLayer && (
          <Section title="Transform & Layout">
            <SliderRow
              label="Scale"
              value={activeLayer.scale ?? 1}
              min={0.1}
              max={5.0}
              step={0.05}
              format={(v) => `${v.toFixed(2)}x`}
              onChange={(v) => updateActiveLayerProp({ scale: v })}
              onReset={() => updateActiveLayerProp({ scale: 1 })}
            />
            <SliderRow
              label="Rotation"
              value={activeLayer.rotation ?? 0}
              min={0}
              max={360}
              step={1}
              format={(v) => `${v}°`}
              onChange={(v) => updateActiveLayerProp({ rotation: v })}
              onReset={() => updateActiveLayerProp({ rotation: 0 })}
            />
            <SliderRow
              label="Position X"
              value={activeLayer.posX ?? 0}
              min={-500}
              max={500}
              step={1}
              format={(v) => `${v}px`}
              onChange={(v) => updateActiveLayerProp({ posX: v })}
              onReset={() => updateActiveLayerProp({ posX: 0 })}
            />
            <SliderRow
              label="Position Y"
              value={activeLayer.posY ?? 0}
              min={-500}
              max={500}
              step={1}
              format={(v) => `${v}px`}
              onChange={(v) => updateActiveLayerProp({ posY: v })}
              onReset={() => updateActiveLayerProp({ posY: 0 })}
            />
          </Section>
        )}

        {/* 3. Effects & Blending */}
        {activeLayer && (
          <Section title="Effects & Blending">
            <SliderRow
              label="Blur"
              value={activeLayer.blur ?? 0}
              min={0}
              max={20}
              step={0.5}
              format={(v) => `${v}px`}
              onChange={(v) => updateActiveLayerProp({ blur: v })}
              onReset={() => updateActiveLayerProp({ blur: 0 })}
            />
            <SliderRow
              label="Opacity"
              value={Math.round((activeLayer.opacity ?? 1) * 100)}
              min={0}
              max={100}
              format={(v) => `${v}%`}
              onChange={(v) => engine?.setLayerOpacity(activeLayer.id, v / 100)}
            />
          </Section>
        )}

        {/* 4. Background Removal */}
        <Section title="Background Removal">
          <button
            onClick={() => useEditorStore.getState().setActivePlugin('removebg')}
            className="w-full py-2 px-3 rounded bg-violet-600/20 hover:bg-violet-600/30 text-violet-300 text-xs font-semibold border border-violet-500/40 transition-colors flex items-center justify-between shadow-sm"
          >
            <span>Open Remove BG Tool</span>
            <span className="text-[10px] text-violet-400 font-mono">Smart AI / Key</span>
          </button>
        </Section>

        {/* 5. Export format */}
        <Section title="Export">
          <select
            value={exportFormat}
            onChange={(e) => setVideo({ exportFormat: e.target.value as 'mp4' | 'gif' | 'webm' })}
            className={sel}
          >
            <option value="mp4">MP4 (H.264)</option>
            <option value="gif">Animated GIF</option>
            <option value="webm">WebM (VP9)</option>
          </select>

          {processing && (
            <div className="space-y-1 pt-1">
              <div className="flex justify-between text-[10px] text-neutral-400">
                <span className="truncate">{statusText}</span>
                <span className="text-violet-400 font-mono">{progress}%</span>
              </div>
              <div className="h-1 bg-neutral-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-violet-500 rounded-full transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
        </Section>
      </div>

      {/* Footer Actions */}
      <div className="space-y-2 border-t border-neutral-800 pt-3">
        <button
          onClick={handleExport}
          disabled={processing || !clip}
          className="w-full py-1.5 rounded text-xs font-medium bg-violet-600 hover:bg-violet-500 text-white flex items-center justify-center gap-1.5 disabled:opacity-40"
        >
          {processing ? (
            <>
              <Loader2 size={11} className="animate-spin" /> Processing…
            </>
          ) : (
            <>
              <Download size={11} /> Export Video
            </>
          )}
        </button>

        <button
          onClick={handleFrameToLayer}
          disabled={processing || !clip}
          className="w-full py-1.5 rounded text-xs font-medium bg-neutral-800 hover:bg-neutral-700 text-neutral-200 flex items-center justify-center gap-1.5 disabled:opacity-40 border border-neutral-750"
        >
          <Layers size={11} /> Extract Current Frame to Layer
        </button>
      </div>
    </div>
  )
}
