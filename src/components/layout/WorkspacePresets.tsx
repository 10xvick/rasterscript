import { useState, useContext } from 'react'
import { LayoutDashboard, Image as ImageIcon, Grid, Film } from 'lucide-react'
import { LayoutContext } from './LayoutEngine'
import { useEditorStore } from '../../store/useEditorStore'

export type WorkspacePreset = 'default' | 'image' | 'spritesheet' | 'video'

interface PresetConfig {
  id: WorkspacePreset
  label: string
  icon: React.ReactNode
  widgets: string[]
  activePlugin?: string | null
}

const PRESETS: PresetConfig[] = [
  {
    id: 'default',
    label: 'Default Workspace',
    icon: <LayoutDashboard size={14} />,
    widgets: ['canvas', 'layers', 'tools'],
    activePlugin: null,
  },
  {
    id: 'image',
    label: 'Image Editor',
    icon: <ImageIcon size={14} />,
    widgets: ['canvas', 'layers', 'tools'],
    activePlugin: 'doodle',
  },
  {
    id: 'spritesheet',
    label: 'Spritesheet Studio',
    icon: <Grid size={14} />,
    widgets: ['canvas', 'spritesheet_preview', 'tools'],
    activePlugin: 'spritesheet',
  },
  {
    id: 'video',
    label: 'Video Slicer',
    icon: <Film size={14} />,
    widgets: ['canvas', 'timeline', 'tools'],
    activePlugin: 'video',
  },
]

export function WorkspacePresets() {
  const layoutCtx = useContext(LayoutContext)
  const setActivePlugin = useEditorStore((s) => s.setActivePlugin)
  const [activePreset, setActivePreset] = useState<WorkspacePreset>('default')

  if (!layoutCtx) return null
  const { dispatch } = layoutCtx

  const applyPreset = (preset: PresetConfig) => {
    setActivePreset(preset.id)
    preset.widgets.forEach((wId) => {
      dispatch({ type: 'ENSURE_WIDGET', widgetId: wId })
    })
    if (preset.activePlugin !== undefined) {
      setActivePlugin(preset.activePlugin)
    }
  }

  return (
    <div className="flex items-center gap-1 bg-neutral-950/60 p-1 rounded-lg border border-neutral-800 ml-4">
      {PRESETS.map((p) => {
        const isActive = activePreset === p.id
        return (
          <button
            key={p.id}
            onClick={() => applyPreset(p)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-all ${
              isActive
                ? 'bg-violet-600/90 text-white shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/60'
            }`}
            title={`Switch to ${p.label}`}
          >
            {p.icon}
            <span>{p.label}</span>
          </button>
        )
      })}
    </div>
  )
}
