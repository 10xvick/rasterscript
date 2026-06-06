import type { FC, ReactNode } from 'react'

// ─── Plugin Categories ────────────────────────────────────────────────────────

export type PluginCategory = 'transform' | 'draw' | 'filter' | 'cutout' | 'script' | 'export' | 'experimental'

// ─── Editor Context ───────────────────────────────────────────────────────────
// Passed to plugin lifecycle methods; keeps plugins decoupled from the store.

export interface EditorContext {
  canvas: HTMLCanvasElement
  getImageData: () => ImageData
  setImageData: (data: ImageData, pushHistory?: boolean) => void
  pushHistory: (label: string) => void
  getWidth: () => number
  getHeight: () => number
  /** Returns the 2D context of the currently active layer canvas */
  getActiveLayerCtx: () => CanvasRenderingContext2D | null
  /** Re-composites all layers to the display canvas */
  compositeToCanvas: () => void
  /** Crop all layers to the given rect without flattening */
  cropDocument: (x: number, y: number, w: number, h: number) => void
  /** Paste ImageData as a new layer at exact canvas coordinates */
  pasteAsLayer: (data: ImageData, x: number, y: number, name?: string) => void
}

// ─── Plugin Panel & Overlay props ────────────────────────────────────────────

export interface PluginPanelProps {
  context: EditorContext
  isActive: boolean
}

export interface PluginOverlayProps {
  context: EditorContext
  containerRef: React.RefObject<HTMLDivElement | null>
}

// ─── Plugin Definition ────────────────────────────────────────────────────────
// Every feature — built-in or user-created — implements this interface.

export interface EditorPlugin {
  /** Unique stable identifier */
  id: string
  /** Human-readable name */
  name: string
  /** Lucide icon element */
  icon: ReactNode
  category: PluginCategory
  /** Optional keyboard shortcut key (single char) */
  shortcutKey?: string
  /** Right-side options panel rendered when this plugin is active */
  Panel?: FC<PluginPanelProps>
  /** SVG/div overlay rendered on top of the canvas for interactive tools */
  CanvasOverlay?: FC<PluginOverlayProps>
  /** Called when the tool becomes active */
  activate?: (ctx: EditorContext) => void
  /** Called when the tool is deactivated */
  deactivate?: (ctx: EditorContext) => void
}

// ─── Layer types ─────────────────────────────────────────────────────────────

export interface LayerInfo {
  id: string
  name: string
  visible: boolean
  opacity: number
  blendMode: GlobalCompositeOperation
}

export interface LayerSnapshot {
  meta: LayerInfo
  imageData: ImageData
}

export interface HistorySnapshot {
  layers: LayerSnapshot[]
  activeId: string
  width: number
  height: number
}

// ─── History ──────────────────────────────────────────────────────────────────

export interface HistoryEntry {
  label: string
  snapshot: HistorySnapshot
}

// ─── Script API ───────────────────────────────────────────────────────────────
// The object exposed to user scripts via `api`.

export type PixelTransformFn = (
  r: number, g: number, b: number, a: number,
  x: number, y: number,
) => [number, number, number, number]

export interface ScriptAPI {
  /** The live canvas element */
  canvas: HTMLCanvasElement
  /** The 2D rendering context */
  ctx: CanvasRenderingContext2D
  /** Returns a copy of the current pixel data */
  getImageData(): ImageData
  /** Replaces the canvas content and pushes to history */
  setImageData(data: ImageData, label?: string): void
  /** Per-pixel transform convenience */
  forEach(fn: PixelTransformFn): void
  /** Resize the canvas */
  resize(width: number, height: number, smooth?: boolean): void
  /** Crop to rect */
  crop(x: number, y: number, width: number, height: number): void
  /** Rotate by degrees (90, 180, 270) */
  rotate(degrees: number): void
  /** Flip horizontally or vertically */
  flip(axis: 'h' | 'v'): void
  /**
   * Slice a spritesheet into individual cells.
   * Returns an array of Blobs (PNG) + triggers download if download=true.
   */
  sliceSprite(
    cols: number, rows: number,
    options?: { download?: boolean; prefix?: string; trimAlpha?: boolean },
  ): Promise<Blob[]>
  /** Download a single blob */
  download(blob: Blob, filename: string): void
  /** Download multiple blobs as separate files */
  downloadAll(blobs: Blob[], prefix?: string, ext?: string): void
  /** Log output to the script console */
  log(...args: unknown[]): void
}

// ─── Saved user script ────────────────────────────────────────────────────────

export interface UserScript {
  id: string
  name: string
  code: string
  createdAt: number
}
