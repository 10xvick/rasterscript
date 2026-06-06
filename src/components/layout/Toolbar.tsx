import { Fragment, useState } from 'react'
import { Undo2, Redo2, ZoomIn, ZoomOut, Download, FolderOpen, FilePlus, Settings } from 'lucide-react'
import { useEditorStore } from '../../store/useEditorStore'
import { useSettingsStore } from '../../store/useSettingsStore'
import { ExportDialog } from './ExportDialog'
import type { EditorPlugin } from '../../core/types'

const CATEGORY_ORDER: EditorPlugin['category'][] = ['transform', 'draw', 'filter', 'cutout', 'script', 'export', 'experimental']

export function Toolbar() {
  const {
    engine, activePluginId, setActivePlugin,
    canUndo, canRedo, zoom, setZoom, plugins, setHasImage, syncFromEngine,
  } = useEditorStore()
  const { openSettings, isPluginVisible, defaultWidth, defaultHeight, defaultFill, showShortcuts, compactMode } = useSettingsStore()
  const [exportOpen, setExportOpen] = useState(false)

  const undo = () => { engine?.undo(); syncFromEngine() }
  const redo = () => { engine?.redo(); syncFromEngine() }

  const openFile = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file || !engine) return
      const bmp = await createImageBitmap(file)
      engine.loadImage(bmp)
      setHasImage(true)
      syncFromEngine()
    }
    input.click()
  }

  const newFile = () => {
    if (!engine) return
    engine.loadBlank(defaultWidth, defaultHeight, defaultFill)
    setHasImage(true)
    syncFromEngine()
  }


  const grouped = CATEGORY_ORDER.map(cat => ({
    cat,
    items: plugins.filter(p => p.category === cat && isPluginVisible(p.id)),
  })).filter(g => g.items.length > 0)

  const btn = (
    label: string,
    icon: React.ReactNode,
    onClick: () => void,
    disabled = false,
    active = false,
    shortcut?: string,
  ) => (
    <button
      title={shortcut ? `${label} (${shortcut})` : label}
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-2.5 w-full px-2.5 ${compactMode ? 'py-1' : 'py-1.5'} rounded text-xs transition-colors ${
        active
          ? 'bg-violet-600 text-white'
          : 'text-neutral-400 hover:text-neutral-100 hover:bg-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed'
      }`}
    >
      <span className="flex-none">{icon}</span>
      {label && <span className="flex-1 text-left truncate">{label}</span>}
      {shortcut && showShortcuts && <kbd className="flex-none text-[9px] opacity-40 font-mono">{shortcut}</kbd>}
    </button>
  )

  const divider = () => <div className="border-t border-neutral-800 my-1 mx-1" />
  const group = (label: string) => (
    <p className="px-2 pt-1 pb-0.5 text-[9px] uppercase tracking-wider text-neutral-600 font-medium">{label}</p>
  )

  return (
    <div className="flex flex-col w-full h-full bg-neutral-900 p-1.5 overflow-y-auto gap-0.5">
      {group('File')}
      {btn('Open Image',  <FolderOpen size={15} />, openFile,  false, false, 'O')}
      {btn('New Canvas',  <FilePlus   size={15} />, newFile)}
      {btn('Export', <Download size={15} />, () => setExportOpen(true), false, false, 'E')}
      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />

      {divider()}
      {group('Edit')}
      {btn('Undo', <Undo2 size={15} />, undo, !canUndo, false, '⌘Z')}
      {btn('Redo', <Redo2 size={15} />, redo, !canRedo, false, '⌘⇧Z')}


      {grouped.map(({ cat, items }) => (
        <Fragment key={cat}>
          {divider()}
          {group(cat)}
          {items.map(plugin => (
            <Fragment key={plugin.id}>
              {btn(
                plugin.name,
                plugin.icon,
                () => setActivePlugin(activePluginId === plugin.id ? null : plugin.id),
                false,
                activePluginId === plugin.id,
                plugin.shortcutKey?.toUpperCase(),
              )}
            </Fragment>
          ))}
        </Fragment>
      ))}

      <div className="flex-1" />

      {divider()}
      {btn('Settings', <Settings size={15} />, openSettings)}

      {divider()}
      {group('Zoom')}
      <div className="flex items-center gap-1">
        {btn('', <ZoomOut size={15} />, () => setZoom(zoom / 1.25))}
        <span className="flex-1 text-center text-xs text-neutral-400 tabular-nums">{Math.round(zoom * 100)}%</span>
        {btn('', <ZoomIn  size={15} />, () => setZoom(zoom * 1.25))}
      </div>
    </div>
  )
}
