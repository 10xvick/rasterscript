import { useState, useEffect, useCallback } from 'react'
import { X, Download, Loader2 } from 'lucide-react'
import { useSettingsStore, type ExportFormat } from '../../store/useSettingsStore'
import { useEditorStore } from '../../store/useEditorStore'

interface Props {
  open: boolean
  onClose: () => void
}

const FORMATS: { value: ExportFormat; label: string; ext: string }[] = [
  { value: 'png',  label: 'PNG',  ext: 'png'  },
  { value: 'jpeg', label: 'JPEG', ext: 'jpg'  },
  { value: 'webp', label: 'WebP', ext: 'webp' },
]

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button role="switch" aria-checked={checked} onClick={onChange}
      className={`relative inline-flex h-5 w-9 flex-none cursor-pointer rounded-full transition-colors ${checked ? 'bg-violet-600' : 'bg-neutral-600'}`}
    >
      <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform mt-0.5 ${checked ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
    </button>
  )
}

function formatBytes(bytes: number) {
  if (bytes < 1024)        return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function buildCanvas(
  src: HTMLCanvasElement,
  scale: number,
  trim: boolean,
  format: ExportFormat,
): HTMLCanvasElement {
  let c = src

  // Scale
  if (scale < 100) {
    const w = Math.max(1, Math.round(c.width  * scale / 100))
    const h = Math.max(1, Math.round(c.height * scale / 100))
    const s = document.createElement('canvas')
    s.width = w; s.height = h
    s.getContext('2d')!.drawImage(c, 0, 0, w, h)
    c = s
  }

  // Trim
  if (trim) {
    const ctx = c.getContext('2d', { willReadFrequently: true })!
    const px  = ctx.getImageData(0, 0, c.width, c.height).data
    let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0
    for (let y = 0; y < c.height; y++)
      for (let x = 0; x < c.width; x++)
        if (px[(y * c.width + x) * 4 + 3] > 0) {
          if (x < x0) x0 = x; if (y < y0) y0 = y
          if (x > x1) x1 = x; if (y > y1) y1 = y
        }
    if (x1 >= x0 && y1 >= y0) {
      const t = document.createElement('canvas')
      t.width = x1 - x0 + 1; t.height = y1 - y0 + 1
      t.getContext('2d')!.drawImage(c, -x0, -y0)
      c = t
    }
  }

  // JPEG: white bg
  if (format === 'jpeg') {
    const t = document.createElement('canvas')
    t.width = c.width; t.height = c.height
    const tc = t.getContext('2d')!
    tc.fillStyle = '#ffffff'; tc.fillRect(0, 0, t.width, t.height)
    tc.drawImage(c, 0, 0)
    c = t
  }

  return c
}

export function ExportDialog({ open, onClose }: Props) {
  const settings = useSettingsStore()
  const engine   = useEditorStore(s => s.engine)

  const [filename, setFilename] = useState(settings.exportFilename)
  const [format,   setFormat]   = useState<ExportFormat>(settings.exportFormat)
  const [quality,  setQuality]  = useState(settings.exportQuality)
  const [scale,    setScale]    = useState(settings.exportScale)
  const [trim,     setTrim]     = useState(settings.exportTrim)

  const [estSize,       setEstSize]       = useState<number | null>(null)
  const [calculating,   setCalculating]   = useState(false)

  // Reset local state when dialog opens
  useEffect(() => {
    if (!open) return
    setFilename(settings.exportFilename)
    setFormat(settings.exportFormat)
    setQuality(settings.exportQuality)
    setScale(settings.exportScale)
    setTrim(settings.exportTrim)
    setEstSize(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Debounced file-size estimation
  const recalculate = useCallback(() => {
    if (!engine) return
    setCalculating(true)
    const mime = format === 'jpeg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png'
    const c = buildCanvas(engine.canvas, scale, trim, format)
    const dataUrl = c.toDataURL(mime, quality)
    const base64  = dataUrl.split(',')[1] ?? ''
    const bytes   = Math.ceil(base64.length * 3 / 4)
    setEstSize(bytes)
    setCalculating(false)
  }, [engine, format, quality, scale, trim])

  useEffect(() => {
    if (!open) return
    const id = setTimeout(recalculate, 250)
    return () => clearTimeout(id)
  }, [open, recalculate])

  if (!open) return null

  const outW = engine ? Math.max(1, Math.round(engine.width  * scale / 100)) : 0
  const outH = engine ? Math.max(1, Math.round(engine.height * scale / 100)) : 0
  const mime  = format === 'jpeg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png'
  const ext   = format === 'jpeg' ? 'jpg' : format

  const doExport = () => {
    if (!engine) return
    settings.setExportFilename(filename)
    settings.setExportFormat(format)
    settings.setExportQuality(quality)
    settings.setExportScale(scale)
    settings.setExportTrim(trim)

    const c = buildCanvas(engine.canvas, scale, trim, format)
    const a = document.createElement('a')
    a.href = c.toDataURL(mime, quality)
    a.download = `${filename || 'image'}.${ext}`
    a.click()
    onClose()
  }

  const sliderRow = (
    label: string,
    value: number,
    min: number, max: number, step: number,
    display: string,
    onChange: (v: number) => void,
    hint?: string,
  ) => (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs text-neutral-400">{label}</label>
        <span className="text-xs text-neutral-300 tabular-nums">{display}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-violet-500"
      />
      {hint && <p className="text-[10px] text-neutral-600 mt-1">{hint}</p>}
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onPointerDown={onClose}
    >
      <div className="bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl flex flex-col overflow-hidden"
        style={{ width: 380 }}
        onPointerDown={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-neutral-800">
          <h2 className="text-sm font-semibold text-white">Export Image</h2>
          <button onClick={onClose}
            className="text-neutral-400 hover:text-white transition-colors rounded p-0.5 hover:bg-neutral-700">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5 overflow-y-auto">

          {/* Filename */}
          <div>
            <label className="text-xs text-neutral-400 block mb-1.5">Filename</label>
            <div className="flex items-center gap-2">
              <input type="text" value={filename} autoFocus
                onChange={e => setFilename(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && doExport()}
                className="flex-1 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-1.5 text-sm text-neutral-200 focus:outline-none focus:border-violet-500"
                placeholder="image"
              />
              <span className="text-sm text-neutral-500 font-mono flex-none">.{ext}</span>
            </div>
          </div>

          {/* Format */}
          <div>
            <label className="text-xs text-neutral-400 block mb-1.5">Format</label>
            <div className="grid grid-cols-3 gap-2">
              {FORMATS.map(f => (
                <button key={f.value} onClick={() => setFormat(f.value)}
                  className={`py-2 rounded-lg text-xs border transition-colors ${
                    format === f.value
                      ? 'border-violet-500 bg-violet-600/20 text-violet-300'
                      : 'border-neutral-700 bg-neutral-800 text-neutral-400 hover:border-neutral-600 hover:text-neutral-200'
                  }`}
                >
                  <span className="font-semibold">{f.label}</span>
                  <span className="block text-[10px] mt-0.5 opacity-60">.{f.ext}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Resolution */}
          {sliderRow(
            'Resolution',
            scale, 10, 100, 5,
            `${scale}%  —  ${outW} × ${outH} px`,
            setScale,
          )}

          {/* Quality */}
          {format !== 'png' && sliderRow(
            'Quality',
            Math.round(quality * 100), 10, 100, 1,
            `${Math.round(quality * 100)}%`,
            v => setQuality(v / 100),
            format === 'jpeg' ? 'White background added automatically (JPEG has no transparency).' : undefined,
          )}

          {/* Trim */}
          <label className="flex items-center justify-between cursor-pointer select-none">
            <div>
              <p className="text-sm text-neutral-200">Trim transparent edges</p>
              <p className="text-[11px] text-neutral-500 mt-0.5">Crop empty transparent borders before saving</p>
            </div>
            <Toggle checked={trim} onChange={() => setTrim(t => !t)} />
          </label>

          {/* Size preview */}
          <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-neutral-800/60 border border-neutral-800">
            <span className="text-xs text-neutral-400">Estimated file size</span>
            <span className="text-xs font-mono font-semibold text-neutral-200 flex items-center gap-1.5">
              {calculating
                ? <Loader2 size={12} className="animate-spin text-neutral-500" />
                : estSize !== null ? formatBytes(estSize) : '—'}
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-5 py-4 border-t border-neutral-800">
          <button onClick={onClose}
            className="flex-1 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-sm transition-colors">
            Cancel
          </button>
          <button onClick={doExport}
            className="flex-1 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2">
            <Download size={14} />
            Export
          </button>
        </div>
      </div>
    </div>
  )
}
