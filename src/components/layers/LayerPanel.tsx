import { useState } from 'react'
import { Plus, Trash2, Eye, EyeOff, ChevronUp, ChevronDown, Upload, Layers, ChevronsDown, Film } from 'lucide-react'
import { useEditorStore } from '../../store/useEditorStore'
import { DropZone } from '../layout/DropZone'
import type { LayerInfo } from '../../core/types'
import { probeMediaMetadata, extractFrameToCanvas } from '../../lib/media'
import { importMediaFile } from '../../lib/mediaImport'
import { useLayout } from '../layout/LayoutEngine'

const BLEND_MODES: GlobalCompositeOperation[] = [
  'source-over', 'multiply', 'screen', 'overlay',
  'darken', 'lighten', 'color-dodge', 'color-burn',
  'hard-light', 'soft-light', 'difference', 'exclusion',
]

export function LayerPanel() {
  const { engine, layerInfos, activeLayerId, syncFromEngine } = useEditorStore()
  const { dispatch: layoutDispatch } = useLayout()
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameVal, setRenameVal]   = useState('')
  const [importOpen, setImportOpen] = useState(false)

  if (!engine || !layerInfos.length) {
    return (
      <div className="flex items-center justify-center h-32 text-xs text-neutral-500 p-4 text-center">
        Load an image to start using layers
      </div>
    )
  }

  const e = engine
  const sync = syncFromEngine

  const activeLayer = layerInfos.find((l: LayerInfo) => l.id === activeLayerId)

  const startRename = (layer: LayerInfo) => {
    setRenamingId(layer.id)
    setRenameVal(layer.name)
  }

  const commitRename = () => {
    if (renamingId && renameVal.trim()) e.renameLayer(renamingId, renameVal.trim())
    setRenamingId(null)
  }

  const handleVideoImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    await importMediaFile(file, { layoutDispatch })
  }

  const sl = 'w-full accent-violet-500'

  return (
    <div className="p-3 space-y-3 text-xs select-none">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center gap-1">
        <button onClick={() => { e.addLayer(); sync() }} title="Add empty layer"
          className="flex items-center gap-1 px-2 py-1 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded text-neutral-300">
          <Plus size={10} /> Add
        </button>
        <button onClick={() => setImportOpen(true)} title="Import image as new layer"
          className="flex items-center gap-1 px-2 py-1 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded text-neutral-300">
          <Upload size={10} /> Import Image
        </button>
        <button onClick={() => { document.getElementById('layer-panel-video-input')?.click() }} title="Import video as new layer"
          className="flex items-center gap-1 px-2 py-1 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded text-neutral-300">
          <Film size={10} /> Import Video
        </button>
        <input
          type="file"
          id="layer-panel-video-input"
          accept="video/*"
          className="hidden"
          onChange={handleVideoImport}
        />
        <button
          onClick={() => { e.mergeDown(); sync() }}
          disabled={layerInfos.findIndex((l: LayerInfo) => l.id === activeLayerId) <= 0}
          title="Merge Down — merge active layer into the one below"
          className="flex items-center gap-1 px-2 py-1 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded text-neutral-300 disabled:opacity-30 disabled:cursor-not-allowed">
          <ChevronsDown size={10} /> Merge Down
        </button>
        <button onClick={() => { if (confirm('Flatten all layers into one?')) { e.flattenAll(); sync() } }}
          title="Flatten all layers into one"
          className="flex items-center gap-1 px-2 py-1 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded text-neutral-300">
          <Layers size={10} /> Flatten
        </button>
      </div>

      {/* ── Layer list (top = visually top) ── */}
      <div className="space-y-0.5">
        {[...layerInfos].reverse().map((layer: LayerInfo) => {
          const realIdx  = layerInfos.indexOf(layer as LayerInfo)
          const isActive = layer.id === activeLayerId
          return (
            <div key={layer.id}
              draggable
              onDragStart={(ev) => {
                ev.dataTransfer.setData('text/plain', layer.id)
                ev.dataTransfer.effectAllowed = 'move'
              }}
              onDragOver={(ev) => {
                ev.preventDefault()
                ev.dataTransfer.dropEffect = 'move'
              }}
              onDrop={(ev) => {
                ev.preventDefault()
                const sourceId = ev.dataTransfer.getData('text/plain')
                if (sourceId && sourceId !== layer.id) {
                  e.reorderLayer(sourceId, layer.id)
                  sync()
                }
              }}
              onClick={() => {
                e.setActiveLayer(layer.id)
                if (layer.isVideo) {
                  layoutDispatch({ type: 'ENSURE_WIDGET', widgetId: 'timeline' })
                }
                sync()
              }}
              className={`flex items-center gap-1.5 px-2 py-1.5 rounded cursor-grab active:cursor-grabbing ${isActive ? 'bg-violet-900/40 border border-violet-700/40' : 'bg-neutral-800/40 border border-transparent hover:bg-neutral-800'}`}>

              {/* Visibility */}
              <button onClick={ev => { ev.stopPropagation(); e.setLayerVisible(layer.id, !layer.visible); sync() }}
                className="flex-none text-neutral-400 hover:text-white">
                {layer.visible ? <Eye size={11} /> : <EyeOff size={11} className="text-neutral-600" />}
              </button>

              {/* Type Indicator */}
              <span className="text-neutral-500 flex-none">
                {layer.isVideo ? <Film size={10} className="text-violet-400" /> : <Layers size={10} />}
              </span>

              {/* Name */}
              {renamingId === layer.id ? (
                <input autoFocus value={renameVal}
                  onChange={ev => setRenameVal(ev.target.value)}
                  onBlur={commitRename}
                  onKeyDown={ev => { if (ev.key === 'Enter') commitRename(); if (ev.key === 'Escape') setRenamingId(null) }}
                  onClick={ev => ev.stopPropagation()}
                  className="flex-1 bg-neutral-700 border border-violet-500 rounded px-1 text-xs text-white focus:outline-none"
                />
              ) : (
                <span onDoubleClick={ev => { ev.stopPropagation(); startRename(layer) }}
                  className={`flex-1 truncate ${isActive ? 'text-violet-300' : 'text-neutral-300'}`} title="Double-click to rename">
                  {layer.name}
                </span>
              )}

              {/* Opacity badge */}
              <span className="text-neutral-600 text-[9px] w-7 text-right flex-none">
                {Math.round(layer.opacity * 100)}%
              </span>

              {/* Reorder + delete */}
              <div className="flex items-center gap-0.5 flex-none">
                <button onClick={ev => { ev.stopPropagation(); e.moveLayer(layer.id, 1); sync() }}
                  disabled={realIdx >= layerInfos.length - 1}
                  className="p-0.5 rounded hover:bg-neutral-700 disabled:opacity-20 text-neutral-400"><ChevronUp size={10} /></button>
                <button onClick={ev => { ev.stopPropagation(); e.moveLayer(layer.id, -1); sync() }}
                  disabled={realIdx <= 0}
                  className="p-0.5 rounded hover:bg-neutral-700 disabled:opacity-20 text-neutral-400"><ChevronDown size={10} /></button>
                <button onClick={ev => { ev.stopPropagation(); e.deleteLayer(layer.id); sync() }}
                  disabled={layerInfos.length <= 1}
                  className="p-0.5 rounded hover:bg-red-900/40 hover:text-red-400 disabled:opacity-20 text-neutral-400"><Trash2 size={10} /></button>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Active layer options ── */}
      {activeLayer && (
        <div className="space-y-2 pt-2 border-t border-neutral-800">
          <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-medium">{activeLayer.name}</p>

          <div>
            <div className="flex justify-between text-neutral-400 mb-1"><span>Opacity</span><span>{Math.round(activeLayer.opacity * 100)}%</span></div>
            <input type="range" min={0} max={100} value={Math.round(activeLayer.opacity * 100)}
              onChange={ev => { e.setLayerOpacity(activeLayer.id, +ev.target.value / 100); sync() }}
              onPointerUp={() => e.pushLayerHistory('Layer Opacity')}
              className={sl} />
          </div>

          <div>
            <label className="text-neutral-400 mb-1 block">Blend mode</label>
            <select value={activeLayer.blendMode}
              onChange={ev => { e.setLayerBlendMode(activeLayer.id, ev.target.value as GlobalCompositeOperation); sync() }}
              className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-neutral-300 focus:outline-none focus:border-violet-500 capitalize">
              {BLEND_MODES.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          <div className="pt-2">
            <button
              onClick={() => useEditorStore.getState().setActivePlugin('removebg')}
              className="w-full py-1.5 px-2.5 rounded bg-violet-600/20 hover:bg-violet-600/30 text-violet-300 text-xs font-semibold border border-violet-500/40 transition-colors flex items-center justify-between"
            >
              <span>Remove Background</span>
              <span className="text-[10px] text-violet-400 font-mono">Smart AI / Key</span>
            </button>
          </div>

          {activeLayer.isVideo && (
            <div className="space-y-1 bg-neutral-900/30 p-2.5 rounded border border-neutral-800/80 mt-2 text-[9px] text-neutral-500 font-mono">
              <p className="text-violet-400 font-bold uppercase tracking-wider mb-1">Video Details</p>
              <div>File Duration: {activeLayer.videoDuration?.toFixed(1)}s</div>
              <div>Trim Range: {activeLayer.trimStart?.toFixed(1)}s – {activeLayer.trimEnd?.toFixed(1)}s</div>
              <div>Timeline Pos: {activeLayer.startTime?.toFixed(1)}s – {activeLayer.endTime?.toFixed(1)}s</div>
            </div>
          )}
        </div>
      )}

      <DropZone open={importOpen} onClose={() => setImportOpen(false)} importOnly={true} />
    </div>
  )
}
