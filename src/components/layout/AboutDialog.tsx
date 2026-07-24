import { X, ExternalLink } from 'lucide-react'
import readme from '../../../README.md?raw'

interface Props {
  open: boolean
  onClose: () => void
}

function extractSection(text: string, heading: string): string[] {
  const sections = text.split(/(?=^## )/m)
  const section = sections.find(s => s.startsWith(`## ${heading}`))
  if (!section) return []
  return section
    .split('\n')
    .filter(l => l.startsWith('- '))
    .map(l => l.replace(/^- /, '').trim())
}

const ROADMAP = extractSection(readme, '🗺️ Roadmap')
const CHANGELOG = extractSection(readme, '📋 Changelog')

export function AboutDialog({ open, onClose }: Props) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onPointerDown={onClose}
    >
      <div
        className="bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl flex flex-col overflow-hidden"
        style={{ width: 480, maxHeight: '80vh' }}
        onPointerDown={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-neutral-800 flex-none">
          <h2 className="text-sm font-semibold text-white">About RasterScript</h2>
          <button onClick={onClose}
            className="text-neutral-400 hover:text-white transition-colors rounded p-0.5 hover:bg-neutral-700">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">

          {/* Identity */}
          <div>
            <h3 className="text-lg font-semibold text-white tracking-tight">RasterScript</h3>
            <p className="text-xs text-neutral-500 mt-1">Version 0.0.0</p>
            <p className="text-xs text-neutral-500 mt-0.5">
              A scriptable browser-based image editor with plugin support and a modular layout.
            </p>
          </div>

          {/* Links */}
          <div className="flex items-center gap-3">
            <a href="https://github.com/anomalyco/rasterscript" target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 transition-colors">
              <ExternalLink size={12} /> GitHub
            </a>
          </div>

          {/* Roadmap */}
          {ROADMAP.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold mb-2">Up next</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                {ROADMAP.map((item, i) => (
                  <span key={i} className="text-xs text-neutral-400">{item}</span>
                ))}
              </div>
            </div>
          )}

          {/* Changelog */}
          {CHANGELOG.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold mb-2">Recent changes</p>
              <div className="space-y-1">
                {CHANGELOG.map((line, i) => (
                  <p key={i} className="text-[11px] text-neutral-500 leading-relaxed font-mono">{line}</p>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
