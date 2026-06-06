import { useState } from 'react'
import { Maximize2 } from 'lucide-react'
import type { EditorPlugin, PluginPanelProps } from '../../core/types'

function ResizePanel({ context }: PluginPanelProps) {
  const [w, setW] = useState(() => context.getWidth())
  const [h, setH] = useState(() => context.getHeight())
  const [lock, setLock] = useState(true)
  const [smooth, setSmooth] = useState(true)

  const origW = context.getWidth()
  const origH = context.getHeight()

  const handleW = (val: number) => {
    setW(val)
    if (lock && origW > 0) setH(Math.round(val * (origH / origW)))
  }

  const handleH = (val: number) => {
    setH(val)
    if (lock && origH > 0) setW(Math.round(val * (origW / origH)))
  }

  const apply = () => {
    if (w <= 0 || h <= 0) return
    const c = context.canvas
    const tmp = document.createElement('canvas')
    tmp.width = w; tmp.height = h
    const t = tmp.getContext('2d')!
    t.imageSmoothingEnabled = smooth
    t.imageSmoothingQuality = 'high'
    t.drawImage(c, 0, 0, w, h)
    context.setImageData(t.getImageData(0, 0, w, h), true)
  }

  const inputCls = 'w-full bg-neutral-800 border border-neutral-600 rounded px-2 py-1 text-sm focus:outline-none focus:border-violet-500'
  const labelCls = 'text-xs text-neutral-400'

  return (
    <div className="p-3 space-y-3">
      <p className="text-xs text-neutral-400">
        Current: {origW} × {origH}
      </p>

      <div className="space-y-2">
        <div>
          <label className={labelCls}>Width (px)</label>
          <input
            type="number" min={1} value={w}
            onChange={e => handleW(Number(e.target.value))}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Height (px)</label>
          <input
            type="number" min={1} value={h}
            onChange={e => handleH(Number(e.target.value))}
            className={inputCls}
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-xs text-neutral-300 cursor-pointer select-none">
        <input type="checkbox" checked={lock} onChange={e => setLock(e.target.checked)} />
        Lock aspect ratio
      </label>
      <label className="flex items-center gap-2 text-xs text-neutral-300 cursor-pointer select-none">
        <input type="checkbox" checked={smooth} onChange={e => setSmooth(e.target.checked)} />
        Smooth resizing
      </label>

      <button
        onClick={apply}
        className="w-full py-2 rounded bg-violet-600 hover:bg-violet-500 text-sm font-medium transition-colors"
      >
        Apply Resize
      </button>
    </div>
  )
}

export const resizePlugin: EditorPlugin = {
  id: 'resize',
  name: 'Resize',
  icon: <Maximize2 size={18} />,
  category: 'transform',
  Panel: ResizePanel,
}
