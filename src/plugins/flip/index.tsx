import { FlipHorizontal2 } from 'lucide-react'
import type { EditorPlugin, PluginPanelProps } from '../../core/types'

function applyFlip(ctx: import('../../core/types').EditorContext, axis: 'h' | 'v') {
  const c = ctx.canvas
  const tmp = document.createElement('canvas')
  tmp.width = c.width; tmp.height = c.height
  const t = tmp.getContext('2d')!
  if (axis === 'h') {
    t.translate(c.width, 0); t.scale(-1, 1)
  } else {
    t.translate(0, c.height); t.scale(1, -1)
  }
  t.drawImage(c, 0, 0)
  ctx.setImageData(t.getImageData(0, 0, c.width, c.height), true)
}

function FlipPanel({ context }: PluginPanelProps) {
  return (
    <div className="p-3 space-y-2">
      <p className="text-xs text-neutral-400 mb-3">Mirror the image</p>
      <button
        onClick={() => applyFlip(context, 'h')}
        className="w-full px-3 py-2 rounded bg-neutral-700 hover:bg-neutral-600 text-sm text-left transition-colors"
      >
        Flip Horizontal
      </button>
      <button
        onClick={() => applyFlip(context, 'v')}
        className="w-full px-3 py-2 rounded bg-neutral-700 hover:bg-neutral-600 text-sm text-left transition-colors"
      >
        Flip Vertical
      </button>
    </div>
  )
}

export const flipPlugin: EditorPlugin = {
  id: 'flip',
  name: 'Flip',
  icon: <FlipHorizontal2 size={18} />,
  category: 'transform',
  Panel: FlipPanel,
}
