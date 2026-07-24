import { useRef, useState, useCallback } from 'react'
import { Film, Image as ImageIcon, Plus, Trash2, Send, FolderOpen, AlertTriangle, X, ChevronRight } from 'lucide-react'
import { useMediaLibrary, type SourceFile, type Clip } from '../../store/useMediaLibrary'
import { useVideoStore } from './useVideoStore'
import { useMediaDropzone } from '../../hooks/useMediaDropzone'
import { useLayout } from '../../components/layout/LayoutEngine'
import { useEditorStore } from '../../store/useEditorStore'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 ** 3)   return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

function fmtDuration(s: number): string {
  if (!s) return '—'
  const m = Math.floor(s / 60)
  const sec = (s % 60).toFixed(1)
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`
}

const RAM_WARN_BYTES = 1024 ** 3 // 1 GB

// ─── Memory budget bar ────────────────────────────────────────────────────────

function MemoryBudget({ totalBytes }: { totalBytes: number }) {
  const pct  = Math.min(100, (totalBytes / RAM_WARN_BYTES) * 100)
  const warn = totalBytes > RAM_WARN_BYTES * 0.8
  return (
    <div className="px-3 py-2 border-b border-neutral-800">
      <div className="flex justify-between text-[10px] mb-1">
        <span className={`uppercase tracking-wider font-medium ${warn ? 'text-amber-400' : 'text-neutral-500'}`}>
          {warn && <AlertTriangle size={9} className="inline mr-1 -mt-0.5" />}
          Session Memory
        </span>
        <span className={warn ? 'text-amber-400' : 'text-neutral-500'}>{fmtSize(totalBytes)}</span>
      </div>
      <div className="h-1 bg-neutral-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${warn ? 'bg-amber-500' : 'bg-violet-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {warn && (
        <p className="text-[9px] text-amber-500/80 mt-1">
          Large sources loaded — unload unused files to free RAM.
        </p>
      )}
    </div>
  )
}

// ─── Drop zone ────────────────────────────────────────────────────────────────

function DropZone({ onFile }: { onFile: (f: File) => void }) {
  const { over, dropProps } = useMediaDropzone({ onFile })
  const inputRef = useRef<HTMLInputElement>(null)

  const handleClick = () => {
    inputRef.current?.click()
  }

  return (
    <div
      {...dropProps}
      onClick={handleClick}
      className={`mx-3 my-2 border-2 border-dashed rounded-lg p-4 flex flex-col items-center gap-2 text-center cursor-pointer transition-all ${
        over
          ? 'border-violet-500 bg-violet-500/10 text-violet-300'
          : 'border-neutral-700 text-neutral-600 hover:border-neutral-600 hover:text-neutral-500'
      }`}
    >
      <input
        type="file"
        ref={inputRef}
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) onFile(file)
        }}
        accept="video/*,image/*"
        className="hidden"
        id="media-library-file-input"
      />
      <FolderOpen size={20} className={over ? 'text-violet-400' : 'text-neutral-700'} />
      <span className="text-[10px] leading-tight">
        Click to browse or drop files here<br />
        <span className="text-neutral-700">or paste with Ctrl+V</span>
      </span>
    </div>
  )
}

// ─── Clip card ────────────────────────────────────────────────────────────────

function ClipCard({ clip, isActive, onActivate, onDelete, onSendToSpritesheet }: {
  clip: Clip
  isActive: boolean
  onActivate: () => void
  onDelete: () => void
  onSendToSpritesheet: () => void
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onClick={onActivate}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`group flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors border-l-2 ${
        isActive
          ? 'bg-violet-900/20 border-violet-500'
          : 'border-transparent hover:bg-neutral-800/50 hover:border-neutral-700'
      }`}
    >
      {/* Thumbnail */}
      <div className="flex-none w-14 h-9 rounded overflow-hidden bg-neutral-900 border border-neutral-800 relative">
        <img src={clip.thumbnail} alt={clip.name} className="w-full h-full object-cover" />
        {isActive && (
          <div className="absolute inset-0 border-2 border-violet-500 rounded" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className={`text-xs truncate font-medium ${isActive ? 'text-violet-200' : 'text-neutral-300'}`}>
          {clip.name}
        </p>
        <p className="text-[10px] text-neutral-600 font-mono">
          {fmtDuration(clip.trimStart)} → {fmtDuration(clip.trimEnd)}
          <span className="ml-1 text-neutral-700">({fmtDuration(clip.trimEnd - clip.trimStart)})</span>
        </p>
      </div>

      {/* Actions (visible on hover) */}
      {(hovered || isActive) && (
        <div className="flex-none flex items-center gap-1" onClick={e => e.stopPropagation()}>
          <button
            onClick={onSendToSpritesheet}
            title="Send to Spritesheet Generator"
            className="p-1 rounded hover:bg-violet-600/30 text-violet-400 hover:text-violet-200 transition-colors"
          >
            <Send size={11} />
          </button>
          <button
            onClick={onDelete}
            title="Delete clip"
            className="p-1 rounded hover:bg-red-900/40 text-neutral-600 hover:text-red-400 transition-colors"
          >
            <Trash2 size={11} />
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Source file row ──────────────────────────────────────────────────────────

function SourceFileRow({ src, clips, activeClipId }: {
  src: SourceFile
  clips: Clip[]
  activeClipId: string | null
}) {
  const [expanded, setExpanded] = useState(true)
  const [creatingClip, setCreatingClip] = useState(false)
  const [newClipName, setNewClipName] = useState('')
  const { addClip, removeSourceFile, removeClip, sendClipToSpritesheet } = useMediaLibrary()
  const { setVideo } = useVideoStore()
  const { dispatch: layoutDispatch } = useLayout()
  const setActivePlugin = useEditorStore(s => s.setActivePlugin)

  const activateClip = useCallback((clipId: string) => {
    setVideo({ activeClipId: clipId })
    setActivePlugin('video')
    layoutDispatch({ type: 'ENSURE_WIDGET', widgetId: 'video_preview' })
    layoutDispatch({ type: 'ENSURE_WIDGET', widgetId: 'video_timeline' })
  }, [setVideo, setActivePlugin, layoutDispatch])

  const handleAddClip = async () => {
    if (!newClipName.trim()) return
    const id = await addClip({
      sourceFileId: src.id,
      name:         newClipName.trim(),
      trimStart:    0,
      trimEnd:      src.duration || 0,
    })
    activateClip(id)
    setCreatingClip(false)
    setNewClipName('')
  }

  const myClips = clips.filter(c => c.sourceFileId === src.id)

  return (
    <div className="border-b border-neutral-900">
      {/* Source file header */}
      <div
        className="flex items-center gap-2 px-3 py-2 hover:bg-neutral-800/40 cursor-pointer select-none"
        onClick={() => setExpanded(e => !e)}
      >
        <ChevronRight size={12} className={`text-neutral-500 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        <div className="w-8 h-5 rounded overflow-hidden bg-neutral-900 flex-none border border-neutral-800">
          <img src={src.thumbnail} alt={src.name} className="w-full h-full object-cover" />
        </div>
        {src.isVideo
          ? <Film size={11} className="text-violet-400 flex-none" />
          : <ImageIcon size={11} className="text-blue-400 flex-none" />
        }
        <span className="text-xs text-neutral-300 truncate flex-1">{src.name}</span>
        <span className="text-[10px] text-neutral-600 flex-none">{fmtSize(src.sizeBytes)}</span>
        <button
          onClick={e => { e.stopPropagation(); removeSourceFile(src.id) }}
          title="Unload source (frees RAM)"
          className="flex-none p-0.5 rounded hover:bg-red-900/30 text-neutral-700 hover:text-red-400 transition-colors"
        >
          <X size={10} />
        </button>
      </div>

      {/* Clips list */}
      {expanded && (
        <div className="pl-5">
          {myClips.map(clip => (
            <ClipCard
              key={clip.id}
              clip={clip}
              isActive={activeClipId === clip.id}
              onActivate={() => activateClip(clip.id)}
              onDelete={() => removeClip(clip.id)}
              onSendToSpritesheet={() => sendClipToSpritesheet(clip.id)}
            />
          ))}

          {/* New clip row */}
          {creatingClip ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5">
              <input
                autoFocus
                value={newClipName}
                onChange={e => setNewClipName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddClip(); if (e.key === 'Escape') setCreatingClip(false) }}
                placeholder="Clip name…"
                className="flex-1 text-xs bg-neutral-900 border border-violet-600 rounded px-2 py-1 text-neutral-200 focus:outline-none"
              />
              <button onClick={handleAddClip} className="text-[10px] px-2 py-1 rounded bg-violet-600 hover:bg-violet-500 text-white">Add</button>
              <button onClick={() => setCreatingClip(false)} className="text-[10px] px-1.5 py-1 rounded bg-neutral-700 hover:bg-neutral-600 text-neutral-300">✕</button>
            </div>
          ) : (
            src.isVideo && (
              <button
                onClick={() => setCreatingClip(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] text-neutral-600 hover:text-violet-400 transition-colors w-full"
              >
                <Plus size={10} /> New clip
              </button>
            )
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function MediaLibraryPanel() {
  const { sourceFiles, clips, totalSizeBytes, addSourceFile } = useMediaLibrary()
  const { activeClipId } = useVideoStore()
  const [loading, setLoading] = useState(false)

  const handleFile = useCallback(async (file: File) => {
    setLoading(true)
    try {
      await addSourceFile(file)
    } finally {
      setLoading(false)
    }
  }, [addSourceFile])

  return (
    <div className="flex flex-col h-full overflow-hidden text-xs">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-800 flex-none">
        <span className="text-[10px] uppercase tracking-wider text-neutral-500 font-medium">Media Library</span>
        {loading && <span className="text-[10px] text-violet-400 animate-pulse">Loading…</span>}
      </div>

      {/* Memory budget */}
      {totalSizeBytes > 0 && <MemoryBudget totalBytes={totalSizeBytes} />}

      {/* Drop zone */}
      <DropZone onFile={handleFile} />

      {/* Source files + clips */}
      <div className="flex-1 overflow-y-auto">
        {sourceFiles.length === 0 ? (
          <p className="text-[10px] text-neutral-700 text-center mt-6 px-4">
            No media loaded yet.<br />Drop a video or image above.
          </p>
        ) : (
          sourceFiles.map(src => (
            <SourceFileRow
              key={src.id}
              src={src}
              clips={clips}
              activeClipId={activeClipId}
            />
          ))
        )}
      </div>

      {/* Hint */}
      <div className="border-t border-neutral-900 px-3 py-2 flex-none space-y-0.5">
        <p className="text-[9px] text-neutral-700"><Send size={8} className="inline mr-1" />Send clip to Spritesheet Generator</p>
        <p className="text-[9px] text-neutral-700"><X size={8} className="inline mr-1" />Unload source to free session memory</p>
      </div>
    </div>
  )
}
