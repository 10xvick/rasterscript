import { useEditorStore } from '../../store/useEditorStore'

export function StatusBar() {
  const { width, height, zoom, activePluginId, plugins } = useEditorStore()
  const plugin = plugins.find(p => p.id === activePluginId)

  return (
    <footer className="flex items-center gap-4 px-3 py-1 bg-neutral-900 border-t border-neutral-700 text-xs text-neutral-500 select-none flex-none">
      <span>{width} × {height} px</span>
      <span>Zoom: {Math.round(zoom * 100)}%</span>
      {plugin && <span>Tool: {plugin.name}</span>}
      <span className="ml-auto">RasterScript Editor · Ctrl+Scroll to zoom</span>
    </footer>
  )
}
