import { create } from 'zustand'
import { EditorEngine } from '../core/EditorEngine'
import { registry } from '../core/PluginRegistry'
import { useSpriteStore } from '../plugins/spritesheet/useSpriteStore'
import { useDocumentStore } from './useDocumentStore'
import type { EditorPlugin, LayerInfo, UserScript } from '../core/types'

/**
 * Global editor store — engine-level and app-wide state only.
 *
 * Plugin-specific state lives in each plugin's own Zustand store:
 *   - Crop       → plugins/crop/useCropStore.ts
 *   - Selection  → plugins/selection/useSelectionStore.ts
 *   - Pixelation → plugins/pixelation/usePixelationStore.ts
 *   - Spritesheet→ plugins/spritesheet/useSpriteStore.ts
 */

// ─── Store interface ──────────────────────────────────────────────────────────

interface EditorState {
  // Engine (set once canvas mounts)
  engine: EditorEngine | null
  setEngine: (e: EditorEngine) => void

  // Active plugin
  activePluginId: string | null
  setActivePlugin: (id: string | null) => void

  // Canvas metadata (mirrored from engine for reactive rendering)
  width: number
  height: number
  canUndo: boolean
  canRedo: boolean
  layerInfos: readonly LayerInfo[]
  activeLayerId: string
  syncFromEngine: () => void

  // Image loaded flag
  hasImage: boolean
  setHasImage: (v: boolean) => void

  // Zoom / pan
  zoom: number
  setZoom: (z: number) => void
  panMode: boolean
  setPanMode: (v: boolean) => void

  // Playback / Timeline state
  currentTime: number
  duration: number
  playing: boolean
  setTimeline: (patch: Partial<{ currentTime: number; duration: number; playing: boolean }>) => void

  // User scripts (persisted to localStorage)
  scripts: UserScript[]
  saveScript: (s: UserScript) => void
  deleteScript: (id: string) => void

  // Registered plugins (mirrors registry for reactive access)
  plugins: EditorPlugin[]
  refreshPlugins: () => void
}

// ─── Persistence helpers ──────────────────────────────────────────────────────

const SCRIPTS_KEY = 'rasterscript:scripts'

function loadScripts(): UserScript[] {
  try {
    return JSON.parse(localStorage.getItem(SCRIPTS_KEY) || '[]')
  } catch {
    return []
  }
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useEditorStore = create<EditorState>((set, get) => ({
  engine: null,
  setEngine: (engine) => {
    set({ engine })
    engine.subscribe(() => get().syncFromEngine())

    // Listen for frame changes in DocumentModel
    let lastFrameIdx = -1
    useDocumentStore.subscribe((docState) => {
      const { frames, activeFrameIndex } = docState
      if (
        frames.length > 0 &&
        activeFrameIndex >= 0 &&
        activeFrameIndex < frames.length &&
        activeFrameIndex !== lastFrameIdx
      ) {
        lastFrameIdx = activeFrameIndex
        const frame = frames[activeFrameIndex]
        if (frame && frame.imageData) {
          engine.loadImageFromData(frame.imageData, frame.name)
          set({ hasImage: true })
        }
      }
    })
  },

  activePluginId: null,
  setActivePlugin: (id) => {
    const { engine, activePluginId } = get()
    const ctx = engine?.getContext()
    if (ctx) {
      if (activePluginId) registry.get(activePluginId)?.deactivate?.(ctx)
      if (id)             registry.get(id)?.activate?.(ctx)
    }
    set({ activePluginId: id })
  },

  width: 0,
  height: 0,
  canUndo: false,
  canRedo: false,
  layerInfos: [],
  activeLayerId: '',
  syncFromEngine: () => {
    const e = get().engine
    if (!e) return
    set({
      width:         e.width,
      height:        e.height,
      canUndo:       e.canUndo,
      canRedo:       e.canRedo,
      layerInfos:    e.layerInfos,
      activeLayerId: e.activeLayerId,
    })

    // Sync canvas changes to DocumentModel active frame
    const imgData = e.getImageData()
    if (imgData && imgData.width > 0 && imgData.height > 0) {
      useDocumentStore.getState().updateActiveFrameImageData(imgData)
    }

    // Notify the spritesheet plugin if it's in "active layer" mode.
    const ctx = e.getContext()
    useSpriteStore.getState().syncFromActiveLayer(ctx.getActiveLayerCtx())
  },

  currentTime: 0,
  duration: 10,
  playing: false,
  setTimeline: (patch) => {
    set(patch)
    const { engine, currentTime } = get()
    if (engine && ('currentTime' in patch)) {
      engine.composite(currentTime)
    }
  },

  hasImage: false,
  setHasImage: (v) => set({ hasImage: v }),

  zoom: 1,
  setZoom: (z) => set({ zoom: Math.max(0.05, Math.min(z, 8192)) }),
  panMode: false,
  setPanMode: (v) => set({ panMode: v }),

  scripts: loadScripts(),
  saveScript: (s) => {
    const scripts = get().scripts.filter(x => x.id !== s.id).concat(s)
    localStorage.setItem(SCRIPTS_KEY, JSON.stringify(scripts))
    set({ scripts })
  },
  deleteScript: (id) => {
    const scripts = get().scripts.filter(x => x.id !== id)
    localStorage.setItem(SCRIPTS_KEY, JSON.stringify(scripts))
    set({ scripts })
  },

  plugins: [],
  refreshPlugins: () => set({ plugins: registry.getAll() }),
}))
