import { useEffect } from 'react'
import { StatusBar } from './StatusBar'
import { LayoutRoot } from './LayoutEngine'
import { SettingsPanel } from './SettingsPanel'
import { useEditorStore } from '../../store/useEditorStore'
import { useSettingsStore } from '../../store/useSettingsStore'
import { registry } from '../../core/PluginRegistry'

// ─── Plugin imports ───────────────────────────────────────────────────────────
import { cropPlugin } from '../../plugins/crop'
import { resizePlugin } from '../../plugins/resize'
import { doodlePlugin } from '../../plugins/doodle'
import { rotatePlugin } from '../../plugins/rotate'
import { flipPlugin } from '../../plugins/flip'
import { filtersPlugin } from '../../plugins/filters'
import { scriptPlugin } from '../../plugins/script'
import { selectionPlugin } from '../../plugins/selection'
import { removeBgPlugin } from '../../plugins/removebg'

const PLUGINS = [selectionPlugin, cropPlugin, resizePlugin, doodlePlugin, rotatePlugin, flipPlugin, filtersPlugin, removeBgPlugin, scriptPlugin]

function accentCSS(hue: number) {
  const shades: [number, number, number][] = [
    [50,  0.969, 0.016], [100, 0.943, 0.031], [200, 0.894, 0.057],
    [300, 0.811, 0.111], [400, 0.702, 0.183], [500, 0.606, 0.233],
    [600, 0.541, 0.241], [700, 0.491, 0.212], [800, 0.432, 0.181],
    [900, 0.380, 0.147], [950, 0.272, 0.106],
  ]
  return `:root{${shades.map(([s, l, c]) => `--color-violet-${s}:oklch(${l} ${c} ${hue})`).join(';')}}`
}

function useApplyUiSettings() {
  const { uiScale, compactMode, accentHue } = useSettingsStore()
  useEffect(() => {
    document.documentElement.style.fontSize = uiScale + '%'
  }, [uiScale])
  useEffect(() => {
    document.body.classList.toggle('compact', compactMode)
  }, [compactMode])
  useEffect(() => {
    let el = document.getElementById('accent-theme') as HTMLStyleElement | null
    if (!el) { el = document.createElement('style'); el.id = 'accent-theme'; document.head.appendChild(el) }
    el.textContent = accentCSS(accentHue)
  }, [accentHue])
}

export function Editor() {
  useApplyUiSettings()
  const { refreshPlugins, setActivePlugin } = useEditorStore()

  // Expose store on window for plugins
  useEffect(() => {
    ;(window as unknown as Record<string, unknown>).__editorStore = { setActivePlugin }
  }, [setActivePlugin])

  // Register all plugins once on mount
  useEffect(() => {
    PLUGINS.forEach(p => {
      if (!registry.has(p.id)) registry.register(p)
    })
    refreshPlugins()
  }, [refreshPlugins])

  // Keyboard shortcuts (modifier-key only — no bare single-key shortcuts)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return
      if (target.closest?.('.monaco-editor')) return
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault()
        useEditorStore.getState().engine?.undo()
        useEditorStore.getState().syncFromEngine()
        return
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
        e.preventDefault()
        useEditorStore.getState().engine?.redo()
        useEditorStore.getState().syncFromEngine()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <div className="flex flex-col w-full h-full bg-neutral-950 overflow-hidden">
      <header className="flex items-center px-4 py-2 bg-neutral-900 border-b border-neutral-700 flex-none gap-3 select-none">
        <span className="text-sm font-semibold text-violet-400 tracking-wide">RasterScript</span>
        <small className="text-neutral-600 text-xs">by 10xvick</small>
      </header>

      <LayoutRoot />

      <StatusBar />
      <SettingsPanel />
    </div>
  )
}
