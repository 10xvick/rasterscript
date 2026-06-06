import { RotateCcw } from 'lucide-react'
import type { EditorPlugin, PluginPanelProps } from '../../core/types'

function applyRotate(ctx: import('../../core/types').EditorContext, deg: number) {
  const c = ctx.canvas
  const rad = (deg * Math.PI) / 180
  const sin = Math.abs(Math.sin(rad))
  const cos = Math.abs(Math.cos(rad))
  const nw = Math.round(c.width * cos + c.height * sin)
  const nh = Math.round(c.width * sin + c.height * cos)

  const tmp = document.createElement('canvas')
  tmp.width = nw; tmp.height = nh
  const t = tmp.getContext('2d')!
  t.translate(nw / 2, nh / 2)
  t.rotate(rad)
  t.drawImage(c, -c.width / 2, -c.height / 2)

  ctx.setImageData(t.getImageData(0, 0, nw, nh), true)
}

function RotatePanel({ context }: PluginPanelProps) {
  const btn = (label: string, deg: number) => (
    <button
      onClick={() => applyRotate(context, deg)}
      className="w-full px-3 py-2 rounded bg-neutral-700 hover:bg-neutral-600 text-sm text-left transition-colors"
    >
      {label}
    </button>
  )

  return (
    <div className="p-3 space-y-2">
      <p className="text-xs text-neutral-400 mb-3">Rotate image</p>
      {btn('Rotate 90° CW', 90)}
      {btn('Rotate 90° CCW', -90)}
      {btn('Rotate 180°', 180)}
    </div>
  )
}

export const rotatePlugin: EditorPlugin = {
  id: 'rotate',
  name: 'Rotate',
  icon: <RotateCcw size={18} />,
  category: 'transform',
  Panel: RotatePanel,
}
