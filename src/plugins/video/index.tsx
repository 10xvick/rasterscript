/**
 * Video Editor plugin — entry point.
 *
 * Self-registers three widgets with widgetRegistry so they appear in the
 * layout picker without any changes to LayoutEngine.tsx:
 *
 *   video_preview    → VideoPreviewWidget  (full-panel player)
 *   video_timeline   → VideoTimeline       (timeline + transport)
 *   media_library    → MediaLibraryPanel   (clip browser)
 *
 * Plugin panel (sidebar): VideoPanel → trim, chroma key, export, frame-to-layer.
 *
 * All shared infrastructure used — zero duplicated code:
 *   src/lib/ffmpeg.ts          → getFFmpeg()  (shared WASM singleton)
 *   src/lib/color.ts           → chromaKey()  (shared chroma key math)
 *   src/lib/download.ts        → downloadBlob()
 *   src/lib/media.ts           → loadImageFromFile, extractFrameToCanvas, probeMediaMetadata
 *   src/hooks/useZoomPan.ts    → VideoPreviewWidget viewport
 *   src/hooks/useChromaKeyCanvas.ts → real-time BG removal preview
 *   src/hooks/useMediaDropzone.ts   → MediaLibraryPanel drag-drop
 *   src/store/useMediaLibrary.ts    → clips, source files, sendClipToSpritesheet
 */

import { Film, Clock } from 'lucide-react'
import type { EditorPlugin } from '../../core/types'
import { widgetRegistry }    from '../../core/WidgetRegistry'
import { VideoPanel }           from './VideoPanel'
import { VideoTimeline }        from './VideoTimeline'

// ─── Self-register widgets ────────────────────────────────────────────────────
// Importing this module causes the timeline widget to appear in the layout picker.
// LayoutEngine.tsx has no knowledge of these — it reads from widgetRegistry.

widgetRegistry.register({
  id:        'timeline',
  name:      'Timeline',
  icon:      Clock,
  Component: VideoTimeline,
})

// ─── Plugin definition ────────────────────────────────────────────────────────

export const videoPlugin: EditorPlugin = {
  id:       'video',
  name:     'Video Editor',
  icon:     <Film size={18} />,
  category: 'export',
  Panel:    VideoPanel,
}
