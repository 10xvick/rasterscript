import { useRef, useState } from 'react'
import { Plus, Trash2, Eye, EyeOff, ChevronUp, ChevronDown, Upload, Layers, ChevronsDown } from 'lucide-react'
import { useEditorStore } from '../../store/useEditorStore'
import type { LayerInfo } from '../../core/types'

const BLEND_MODES: GlobalCompositeOperation[] = [
  'source-over', 'multiply', 'screen', 'overlay',
  'darken', 'lighten', 'color-dodge', 'color-burn',
  'hard-light', 'soft-light', 'difference', 'exclusion',
]

export function LayerPanel() {
  const { engine, layerInfos, activeLayerId, syncFromEngine } = useEditorStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameVal, setRenameVal]   = useState('')

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

  const importFile = (file: File) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const tmp = document.createElement('canvas')
      tmp.width  = img.naturalWidth
      tmp.height = img.naturalHeight
      tmp.getContext('2d')!.drawImage(img, 0, 0)
      const data = tmp.getContext('2d')!.getImageData(0, 0, tmp.width, tmp.height)
      e.importImageAsLayer(data, file.name.replace(/\.[^.]+$/, ''))
      URL.revokeObjectURL(url)
      sync()
    }
    img.src = url
  }

  const startRename = (layer: LayerInfo) => {
    setRenamingId(layer.id)
    setRenameVal(layer.name)
  }

  const commitRename = () => {
    if (renamingId && renameVal.trim()) e.renameLayer(renamingId, renameVal.trim())
    setRenamingId(null)
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
        <button onClick={() => fileRef.current?.click()} title="Import image as new layer"
          className="flex items-center gap-1 px-2 py-1 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded text-neutral-300">
          <Upload size={10} /> Import
        </button>
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
        <input ref={fileRef} type="file" accept="image/*" className="hidden"
          onChange={ev => { const f = ev.target.files?.[0]; if (f) importFile(f); ev.target.value = '' }}
        />
      </div>

      {/* ── Layer list (top = visually top) ── */}
      <div className="space-y-0.5">
        {[...layerInfos].reverse().map((layer: LayerInfo) => {
          const realIdx  = layerInfos.indexOf(layer as LayerInfo)
          const isActive = layer.id === activeLayerId
          return (
            <div key={layer.id}
              onClick={() => { e.setActiveLayer(layer.id); sync() }}
              className={`flex items-center gap-1.5 px-2 py-1.5 rounded cursor-pointer ${isActive ? 'bg-violet-900/40 border border-violet-700/40' : 'bg-neutral-800/40 border border-transparent hover:bg-neutral-800'}`}>

              {/* Visibility */}
              <button onClick={ev => { ev.stopPropagation(); e.setLayerVisible(layer.id, !layer.visible); sync() }}
                className="flex-none text-neutral-400 hover:text-white">
                {layer.visible ? <Eye size={11} /> : <EyeOff size={11} className="text-neutral-600" />}
              </button>

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
        </div>
      )}
    </div>
  )
}
