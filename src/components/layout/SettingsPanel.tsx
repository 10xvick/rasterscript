import { useState } from 'react'
import { X, Wrench, ImageIcon, Download, Monitor, FlaskConical } from 'lucide-react'
import { useSettingsStore, type ExportFormat } from '../../store/useSettingsStore'
import { useEditorStore } from '../../store/useEditorStore'

type Tab = 'tools' | 'canvas' | 'export' | 'interface'

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'tools',     label: 'Tools',      icon: <Wrench   size={14} /> },
  { id: 'canvas',    label: 'Canvas',     icon: <ImageIcon size={14} /> },
  { id: 'export',    label: 'Export',     icon: <Download  size={14} /> },
  { id: 'interface', label: 'Interface',  icon: <Monitor   size={14} /> },
]

const CATEGORY_LABELS: Record<string, string> = {
  transform:    'Transform',
  draw:         'Draw',
  filter:       'Filter',
  cutout:       'Cutout',
  script:       'Script',
  export:       'Export',
  experimental: 'Experimental',
}

// ─── Toggle switch ────────────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 flex-none cursor-pointer rounded-full transition-colors duration-200 focus:outline-none ${
        checked ? 'bg-violet-600' : 'bg-neutral-700'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 mt-0.5 ${
          checked ? 'translate-x-4.5' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

// ─── Section heading ──────────────────────────────────────────────────────────

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold mb-2 mt-4 first:mt-0">
      {children}
    </p>
  )
}

// ─── Input field ──────────────────────────────────────────────────────────────

const inputCls = 'bg-neutral-800 border border-neutral-700 rounded px-2.5 py-1.5 text-sm text-neutral-200 focus:outline-none focus:border-violet-500 w-full'

// ─── Tabs ─────────────────────────────────────────────────────────────────────

function ToolsTab() {
  const { hiddenPlugins, togglePlugin } = useSettingsStore()
  const { plugins, activePluginId, setActivePlugin } = useEditorStore()

  const byCategory = plugins.reduce<Record<string, typeof plugins>>((acc, p) => {
    const cat = p.category ?? 'other'
    ;(acc[cat] ??= []).push(p)
    return acc
  }, {})

  return (
    <div>
      <p className="text-xs text-neutral-400 mb-4">
        Hidden tools are removed from the toolbar. They can always be re-enabled here.
      </p>
      {Object.entries(byCategory).map(([cat, items]) => {
        const isExp = cat === 'experimental'
        return (
          <div key={cat} className="mb-5">
            <div className="flex items-center gap-2 mb-2 mt-4 first:mt-0">
              {isExp && <FlaskConical size={11} className="text-amber-400" />}
              <p className={`text-[10px] uppercase tracking-wider font-semibold ${
                isExp ? 'text-amber-500' : 'text-neutral-500'
              }`}>{CATEGORY_LABELS[cat] ?? cat}</p>
            </div>
            {isExp && (
              <p className="text-[11px] text-amber-700/80 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 mb-2">
                Experimental features may be unstable or produce unexpected results.
              </p>
            )}
            <div className="space-y-1">
              {items.map(p => {
                const visible = !hiddenPlugins.includes(p.id)
                return (
                  <div key={p.id}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${
                      isExp
                        ? 'bg-amber-500/5 border-amber-500/20'
                        : 'bg-neutral-800/50 border-neutral-800'
                    }`}>
                    <span className="text-neutral-400 flex-none">{p.icon}</span>
                    <span className="flex-1 text-sm text-neutral-200">{p.name}</span>
                    {isExp && (
                      <span className="text-[9px] uppercase tracking-wider text-amber-600 font-semibold mr-1">Beta</span>
                    )}
                    <Toggle
                      checked={visible}
                      onChange={() => {
                        if (visible && activePluginId === p.id) setActivePlugin(null)
                        togglePlugin(p.id)
                      }}
                    />
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function CanvasTab() {
  const { defaultWidth, defaultHeight, defaultFill, setDefaultWidth, setDefaultHeight, setDefaultFill } = useSettingsStore()

  const FILLS = [
    { value: 'transparent', label: 'Transparent' },
    { value: '#ffffff',     label: 'White' },
    { value: '#000000',     label: 'Black' },
  ]

  return (
    <div>
      <SectionHeading>Default new canvas size</SectionHeading>
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div>
          <label className="text-xs text-neutral-400 block mb-1">Width (px)</label>
          <input
            type="number" min={1} max={8192} value={defaultWidth}
            onChange={e => setDefaultWidth(Number(e.target.value))}
            className={inputCls}
          />
        </div>
        <div>
          <label className="text-xs text-neutral-400 block mb-1">Height (px)</label>
          <input
            type="number" min={1} max={8192} value={defaultHeight}
            onChange={e => setDefaultHeight(Number(e.target.value))}
            className={inputCls}
          />
        </div>
      </div>

      <SectionHeading>Default fill</SectionHeading>
      <div className="grid grid-cols-3 gap-2 mb-3">
        {FILLS.map(f => (
          <button key={f.value}
            onClick={() => setDefaultFill(f.value)}
            className={`px-3 py-2 rounded-lg text-xs border transition-colors ${
              defaultFill === f.value
                ? 'border-violet-500 bg-violet-600/20 text-violet-300'
                : 'border-neutral-700 bg-neutral-800 text-neutral-400 hover:border-neutral-600'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <label className="text-xs text-neutral-400">Custom colour</label>
        <input
          type="color"
          value={defaultFill === 'transparent' ? '#ffffff' : defaultFill}
          onChange={e => setDefaultFill(e.target.value)}
          className="h-7 w-12 rounded cursor-pointer bg-neutral-800 border border-neutral-700"
        />
        {defaultFill !== 'transparent' && (
          <span className="text-xs text-neutral-500 font-mono">{defaultFill}</span>
        )}
      </div>
    </div>
  )
}

function ExportTab() {
  const {
    exportFilename, setExportFilename,
    exportFormat,   setExportFormat,
    exportQuality,  setExportQuality,
    exportTrim,     setExportTrim,
  } = useSettingsStore()

  const FORMATS: { value: ExportFormat; label: string; ext: string }[] = [
    { value: 'png',  label: 'PNG',  ext: '.png'  },
    { value: 'jpeg', label: 'JPEG', ext: '.jpg'  },
    { value: 'webp', label: 'WebP', ext: '.webp' },
  ]

  return (
    <div>
      <SectionHeading>Filename</SectionHeading>
      <div className="flex items-center gap-2 mb-5">
        <input
          type="text" value={exportFilename}
          onChange={e => setExportFilename(e.target.value)}
          className={inputCls}
          placeholder="image"
        />
        <span className="text-sm text-neutral-500 flex-none font-mono">
          .{exportFormat === 'jpeg' ? 'jpg' : exportFormat}
        </span>
      </div>

      <SectionHeading>Format</SectionHeading>
      <div className="grid grid-cols-3 gap-2 mb-5">
        {FORMATS.map(f => (
          <button key={f.value}
            onClick={() => setExportFormat(f.value)}
            className={`px-3 py-2.5 rounded-lg text-xs border transition-colors ${
              exportFormat === f.value
                ? 'border-violet-500 bg-violet-600/20 text-violet-300'
                : 'border-neutral-700 bg-neutral-800 text-neutral-400 hover:border-neutral-600'
            }`}
          >
            <span className="font-semibold">{f.label}</span>
            <span className="block text-[10px] mt-0.5 opacity-60">{f.ext}</span>
          </button>
        ))}
      </div>

      {exportFormat !== 'png' && (
        <>
          <SectionHeading>Quality</SectionHeading>
          <div className="flex items-center gap-3">
            <input
              type="range" min={10} max={100} step={1}
              value={Math.round(exportQuality * 100)}
              onChange={e => setExportQuality(Number(e.target.value) / 100)}
              className="flex-1 accent-violet-500"
            />
            <span className="text-sm text-neutral-300 w-10 text-right tabular-nums">
              {Math.round(exportQuality * 100)}%
            </span>
          </div>
          {exportFormat === 'jpeg' && (
            <p className="text-[10px] text-neutral-600 mt-2">
              JPEG does not support transparency — a white background will be added automatically.
            </p>
          )}
        </>
      )}

      {exportFormat === 'png' && (
        <p className="text-[10px] text-neutral-600">
          PNG is lossless and supports full transparency. Quality setting does not apply.
        </p>
      )}

      <SectionHeading>Options</SectionHeading>
      <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-neutral-800/50 border border-neutral-800">
        <div>
          <p className="text-sm text-neutral-200">Trim transparent edges</p>
          <p className="text-xs text-neutral-500 mt-0.5">Auto-crop empty transparent borders before saving</p>
        </div>
        <Toggle checked={exportTrim} onChange={() => setExportTrim(!exportTrim)} />
      </div>
    </div>
  )
}

const ACCENT_PRESETS = [
  { label: 'Violet', hue: 293 },
  { label: 'Purple', hue: 310 },
  { label: 'Blue',   hue: 240 },
  { label: 'Cyan',   hue: 200 },
  { label: 'Teal',   hue: 175 },
  { label: 'Green',  hue: 145 },
  { label: 'Orange', hue:  50 },
  { label: 'Red',    hue:  25 },
  { label: 'Pink',   hue: 330 },
]

function ToggleRow({ label, sub, checked, onChange }: { label: string; sub: string; checked: boolean; onChange: () => void }) {
  return (
    <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-neutral-800/50 border border-neutral-800">
      <div>
        <p className="text-sm text-neutral-200">{label}</p>
        <p className="text-xs text-neutral-500 mt-0.5">{sub}</p>
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  )
}

function InterfaceTab() {
  const {
    uiScale,        setUiScale,
    accentHue,      setAccentHue,
    compactMode,    setCompactMode,
    showShortcuts,  setShowShortcuts,
    checkerboard,   setCheckerboard,
  } = useSettingsStore()

  const previewColor = (hue: number) => `oklch(0.541 0.241 ${hue})`

  return (
    <div className="space-y-6">

      {/* Interface size */}
      <div>
        <SectionHeading>Interface size</SectionHeading>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-neutral-500">Smaller</span>
          <span className="text-xs text-neutral-300 tabular-nums font-mono">{uiScale}%</span>
          <span className="text-xs text-neutral-500">Larger</span>
        </div>
        <input
          type="range" min={70} max={130} step={5} value={uiScale}
          onChange={e => setUiScale(Number(e.target.value))}
          className="w-full accent-violet-500"
        />
        <p className="text-[10px] text-neutral-600 mt-1">
          Scales all panels, text, and icons uniformly.
        </p>
      </div>

      {/* Accent color */}
      <div>
        <SectionHeading>Accent color</SectionHeading>
        <div className="flex items-center gap-2 mb-3">
          <div className="flex flex-wrap gap-1.5 flex-1">
            {ACCENT_PRESETS.map(p => {
              const isActive = Math.abs(accentHue - p.hue) < 5
              return (
                <button key={p.hue} title={p.label} onClick={() => setAccentHue(p.hue)}
                  className={`w-6 h-6 rounded-full transition-transform hover:scale-110 ${isActive ? 'ring-2 ring-white ring-offset-1 ring-offset-neutral-900' : ''}`}
                  style={{ background: previewColor(p.hue) }}
                />
              )
            })}
          </div>
          <div className="w-8 h-8 rounded-lg flex-none border border-neutral-700 shadow-inner"
            style={{ background: previewColor(accentHue) }} />
        </div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-neutral-500">Hue</span>
          <span className="text-xs text-neutral-300 tabular-nums font-mono">{accentHue}°</span>
        </div>
        <input
          type="range" min={0} max={359} step={1} value={accentHue}
          onChange={e => setAccentHue(Number(e.target.value))}
          style={{
            background: `linear-gradient(to right,
              oklch(0.6 0.24 0),oklch(0.6 0.24 30),oklch(0.6 0.24 60),
              oklch(0.6 0.24 90),oklch(0.6 0.24 120),oklch(0.6 0.24 150),
              oklch(0.6 0.24 180),oklch(0.6 0.24 210),oklch(0.6 0.24 240),
              oklch(0.6 0.24 270),oklch(0.6 0.24 300),oklch(0.6 0.24 330),oklch(0.6 0.24 359))`,
          }}
          className="w-full h-2.5 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-neutral-400"
        />
        <p className="text-[10px] text-neutral-600 mt-1">
          Affects buttons, active states, and highlights throughout the UI.
        </p>
      </div>

      {/* Layout */}
      <div>
        <SectionHeading>Layout</SectionHeading>
        <div className="space-y-2">
          <ToggleRow label="Compact toolbar" sub="Reduce button padding for a denser layout"
            checked={compactMode} onChange={() => setCompactMode(!compactMode)} />
          <ToggleRow label="Show keyboard shortcuts" sub="Display shortcut hints on toolbar buttons"
            checked={showShortcuts} onChange={() => setShowShortcuts(!showShortcuts)} />
        </div>
      </div>

      {/* Canvas background */}
      <div>
        <SectionHeading>Canvas background</SectionHeading>
        <ToggleRow label="Checkerboard pattern" sub="Shows a checkerboard behind transparent areas"
          checked={checkerboard} onChange={() => setCheckerboard(!checkerboard)} />
      </div>

    </div>
  )
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function SettingsPanel() {
  const { settingsOpen, closeSettings } = useSettingsStore()
  const [tab, setTab] = useState<Tab>('tools')

  if (!settingsOpen) return null

  const TAB_CONTENT: Record<Tab, React.ReactNode> = {
    tools:     <ToolsTab />,
    canvas:    <CanvasTab />,
    export:    <ExportTab />,
    interface: <InterfaceTab />,
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onPointerDown={closeSettings}
    >
      <div
        className="bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl flex flex-col overflow-hidden"
        style={{ width: 580, maxHeight: '80vh' }}
        onPointerDown={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-neutral-800 flex-none">
          <h2 className="text-sm font-semibold text-white">Settings</h2>
          <button
            onClick={closeSettings}
            className="text-neutral-400 hover:text-white transition-colors rounded p-0.5 hover:bg-neutral-700"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <nav className="w-36 border-r border-neutral-800 p-2 flex flex-col gap-0.5 flex-none">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs transition-colors w-full text-left ${
                  tab === t.id
                    ? 'bg-violet-600/20 text-violet-300'
                    : 'text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800'
                }`}
              >
                <span className="flex-none">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </nav>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-5">
            {TAB_CONTENT[tab]}
          </div>
        </div>
      </div>
    </div>
  )
}
