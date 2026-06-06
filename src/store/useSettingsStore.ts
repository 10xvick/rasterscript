import { create } from 'zustand'

const STORAGE_KEY = 'rasterscript:settings'

export type ExportFormat = 'png' | 'jpeg' | 'webp'

interface Persisted {
  hiddenPlugins:  string[]
  defaultWidth:   number
  defaultHeight:  number
  defaultFill:    string
  exportFilename: string
  exportFormat:   ExportFormat
  exportQuality:  number
  exportTrim:     boolean
  exportScale:    number
  checkerboard:   boolean
  uiScale:        number
  compactMode:    boolean
  showShortcuts:  boolean
  accentHue:      number
}

const DEFAULTS: Persisted = {
  hiddenPlugins:  ['removebg'],
  defaultWidth:   800,
  defaultHeight:  600,
  defaultFill:    'transparent',
  exportFilename: 'image',
  exportFormat:   'png',
  exportQuality:  0.92,
  exportTrim:     false,
  exportScale:    100,
  checkerboard:   true,
  uiScale:        100,
  compactMode:    false,
  showShortcuts:  true,
  accentHue:      293,
}

function load(): Persisted {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') } }
  catch { return { ...DEFAULTS } }
}

function persist(state: SettingsState) {
  const p: Persisted = {
    hiddenPlugins:  state.hiddenPlugins,
    defaultWidth:   state.defaultWidth,
    defaultHeight:  state.defaultHeight,
    defaultFill:    state.defaultFill,
    exportFilename: state.exportFilename,
    exportFormat:   state.exportFormat,
    exportQuality:  state.exportQuality,
    exportTrim:     state.exportTrim,
    exportScale:    state.exportScale,
    checkerboard:   state.checkerboard,
    uiScale:        state.uiScale,
    compactMode:    state.compactMode,
    showShortcuts:  state.showShortcuts,
    accentHue:      state.accentHue,
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(p))
}

interface SettingsState extends Persisted {
  settingsOpen:  boolean
  openSettings:  () => void
  closeSettings: () => void

  togglePlugin:      (id: string) => void
  isPluginVisible:   (id: string) => boolean
  setDefaultWidth:   (v: number) => void
  setDefaultHeight:  (v: number) => void
  setDefaultFill:    (v: string) => void
  setExportFilename: (v: string) => void
  setExportFormat:   (v: ExportFormat) => void
  setExportQuality:  (v: number) => void
  setExportTrim:     (v: boolean) => void
  setExportScale:    (v: number) => void
  setCheckerboard:   (v: boolean) => void
  setUiScale:        (v: number) => void
  setCompactMode:    (v: boolean) => void
  setShowShortcuts:  (v: boolean) => void
  setAccentHue:      (v: number) => void
}

export const useSettingsStore = create<SettingsState>((set, get) => {
  const initial = load()

  const update = (patch: Partial<Persisted>) => {
    set(patch)
    persist({ ...get(), ...patch })
  }

  return {
    ...initial,
    settingsOpen:  false,
    openSettings:  () => set({ settingsOpen: true }),
    closeSettings: () => set({ settingsOpen: false }),

    togglePlugin: (id) => {
      const hp = get().hiddenPlugins
      update({ hiddenPlugins: hp.includes(id) ? hp.filter(x => x !== id) : [...hp, id] })
    },
    isPluginVisible:   (id) => !get().hiddenPlugins.includes(id),
    setDefaultWidth:   (v) => update({ defaultWidth: Math.max(1, v) }),
    setDefaultHeight:  (v) => update({ defaultHeight: Math.max(1, v) }),
    setDefaultFill:    (v) => update({ defaultFill: v }),
    setExportFilename: (v) => update({ exportFilename: v || 'image' }),
    setExportFormat:   (v) => update({ exportFormat: v }),
    setExportQuality:  (v) => update({ exportQuality: Math.max(0.1, Math.min(1, v)) }),
    setExportTrim:     (v) => update({ exportTrim: v }),
    setExportScale:    (v) => update({ exportScale: Math.max(10, Math.min(100, v)) }),
    setCheckerboard:   (v) => update({ checkerboard: v }),
    setUiScale:        (v) => update({ uiScale: v }),
    setCompactMode:    (v) => update({ compactMode: v }),
    setShowShortcuts:  (v) => update({ showShortcuts: v }),
    setAccentHue:      (v) => update({ accentHue: v }),
  }
})
