/**
 * Built-in widget registration.
 *
 * This is the ONLY place where the layout system learns about core panels.
 * Each panel is registered once at app startup (called from the top-level
 * app component alongside plugin registration).
 *
 * To add a new widget:
 *   1. Create your component.
 *   2. Call `widgetRegistry.register(...)` here (or in your plugin's index.tsx).
 *   No changes to LayoutEngine.tsx required.
 */

import { ImageIcon, Wrench, SlidersHorizontal, Layers, LayoutDashboard } from 'lucide-react'
import { widgetRegistry } from '../core/WidgetRegistry'
import { CanvasStage }                from './canvas/CanvasStage'
import { Toolbar }                    from './layout/Toolbar'
import { PanelSidebar }               from './layout/PanelSidebar'
import { LayerPanel }                 from './layers/LayerPanel'
import { SpritesheetPreviewWidget }   from '../plugins/spritesheet/SpritesheetPreviewWidget'

export function registerBuiltinWidgets(): void {
  widgetRegistry.register({
    id:        'canvas',
    name:      'Canvas',
    icon:      ImageIcon,
    Component: CanvasStage,
  })

  widgetRegistry.register({
    id:        'tools',
    name:      'Tools',
    icon:      Wrench,
    Component: Toolbar,
  })

  widgetRegistry.register({
    id:        'properties',
    name:      'Properties',
    icon:      SlidersHorizontal,
    Component: PanelSidebar,
  })

  widgetRegistry.register({
    id:        'layers',
    name:      'Layers',
    icon:      Layers,
    Component: LayerPanel,
  })

  widgetRegistry.register({
    id:        'spritesheet_preview',
    name:      'Sprite Preview',
    icon:      LayoutDashboard,
    Component: SpritesheetPreviewWidget,
  })
}
