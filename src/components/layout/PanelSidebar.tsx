import { useEditorStore } from '../../store/useEditorStore'
import { registry } from '../../core/PluginRegistry'

export function PanelSidebar() {
  const { activePluginId, engine } = useEditorStore()

  if (!activePluginId || !engine) return null

  const plugin = registry.get(activePluginId)
  if (!plugin?.Panel) return null

  const Panel = plugin.Panel
  const ctx = engine.getContext()

  return (
    <aside className="w-full h-full bg-neutral-900 flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-neutral-700 flex-none">
        <span className="text-neutral-400">{plugin.icon}</span>
        <span className="text-sm font-medium text-neutral-200">{plugin.name}</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        <Panel context={ctx} isActive={true} />
      </div>
    </aside>
  )
}
