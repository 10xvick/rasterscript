/**
 * Spritesheet plugin entry point.
 *
 * This file is intentionally tiny — it exists only to:
 *   1. Export the `EditorPlugin` definition used by `PluginRegistry`.
 *   2. Re-export `SpritesheetPreviewWidget` for the layout widget registry.
 *
 * All logic lives in focused co-located files:
 *   - `SpritesheetPanel.tsx`       — sidebar UI
 *   - `SpritesheetPreviewWidget.tsx` — large viewport widget
 *   - `operations.ts`              — pure async processing (no React)
 *   - `useSpriteStore.ts`          — plugin-local Zustand state
 */

import { Grid } from 'lucide-react'
import type { EditorPlugin } from '../../core/types'
import { SpritesheetPanel } from './SpritesheetPanel'

export { SpritesheetPreviewWidget } from './SpritesheetPreviewWidget'

export const spritesheetPlugin: EditorPlugin = {
  id:       'spritesheet',
  name:     'Sprite Gen',
  icon:     <Grid size={18} />,
  category: 'export',
  Panel:    SpritesheetPanel,
}
