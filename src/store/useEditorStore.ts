import { create } from 'zustand'
import { EditorEngine } from '../core/EditorEngine'
import { registry } from '../core/PluginRegistry'
import type { EditorPlugin, LayerInfo, UserScript } from '../core/types'

export interface SpritesheetState {
  file: File | null
  loadingFile: boolean
  processing: boolean
  statusText: string
  ffmpegLogs: string[]
  originalWidth: number
  originalHeight: number
  duration: number
  frameWidth: number
  frameHeight: number
  fps: number
  startTime: number
  endTime: number
  maxFrames: number
  columns: number
  padding: number
  removeBg: boolean
  bgKeyColor: string
  bgThreshold: number
  compiledCanvas: HTMLCanvasElement | null
  numCompiledFrames: number
  previewing: boolean
  currentFrame: number
}

export interface PixelationState {
  blockSize: number
  paletteStyle: 'true-color' | 'monochrome' | 'pico-8' | 'gameboy' | 'cga' | 'posterized'
  posterizeLevels: number
  ditherStrength: number
  previewTarget: 'active' | 'composite'
}

const INITIAL_PIXELATION_STATE: PixelationState = {
  blockSize: 8,
  paletteStyle: 'true-color',
  posterizeLevels: 4,
  ditherStrength: 50,
  previewTarget: 'composite',
}

const INITIAL_SPRITESHEET_STATE: SpritesheetState = {
  file: null,
  loadingFile: false,
  processing: false,
  statusText: '',
  ffmpegLogs: [],
  originalWidth: 0,
  originalHeight: 0,
  duration: 0,
  frameWidth: 64,
  frameHeight: 64,
  fps: 10,
  startTime: 0,
  endTime: 0,
  maxFrames: 64,
  columns: 8,
  padding: 0,
  removeBg: false,
  bgKeyColor: '#00ff00',
  bgThreshold: 50,
  compiledCanvas: null,
  numCompiledFrames: 0,
  previewing: true,
  currentFrame: 0,
}

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

  // User scripts (persisted to localStorage)
  scripts: UserScript[]
  saveScript: (s: UserScript) => void
  deleteScript: (id: string) => void

  // Registered plugins (mirrors registry for reactive access)
  plugins: EditorPlugin[]
  refreshPlugins: () => void

  // Spritesheet Generator state
  spritesheet: SpritesheetState
  setSpritesheet: (update: Partial<SpritesheetState> | ((prev: SpritesheetState) => Partial<SpritesheetState>)) => void
  resetSpritesheet: () => void

  // Crop synchronization
  cropRect: { x: number; y: number; w: number; h: number } | null
  setCropRect: (r: { x: number; y: number; w: number; h: number } | null) => void

  // Pixelation State
  pixelation: PixelationState
  setPixelation: (update: Partial<PixelationState> | ((prev: PixelationState) => Partial<PixelationState>)) => void
  resetPixelation: () => void
}

const SCRIPTS_KEY = 'rasterscript:scripts'

function loadScripts(): UserScript[] {
  try {
    return JSON.parse(localStorage.getItem(SCRIPTS_KEY) || '[]')
  } catch {
    return []
  }
}

export const useEditorStore = create<EditorState>((set, get) => ({
  engine: null,
  setEngine: (engine) => {
    set({ engine })
    engine.subscribe(() => get().syncFromEngine())
  },

  activePluginId: null,
  setActivePlugin: (id) => {
    const { engine, activePluginId } = get()
    const ctx = engine?.getContext()
    if (ctx) {
      if (activePluginId) registry.get(activePluginId)?.deactivate?.(ctx)
      if (id) registry.get(id)?.activate?.(ctx)
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
      width: e.width,
      height: e.height,
      canUndo: e.canUndo,
      canRedo: e.canRedo,
      layerInfos: e.layerInfos,
      activeLayerId: e.activeLayerId,
    })
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

  spritesheet: INITIAL_SPRITESHEET_STATE,
  setSpritesheet: (update) => set((state) => ({
    spritesheet: {
      ...state.spritesheet,
      ...(typeof update === 'function' ? update(state.spritesheet) : update)
    }
  })),
  resetSpritesheet: () => set({ spritesheet: INITIAL_SPRITESHEET_STATE }),
  cropRect: null,
  setCropRect: (cropRect) => set({ cropRect }),

  pixelation: INITIAL_PIXELATION_STATE,
  setPixelation: (update) => set((state) => ({
    pixelation: {
      ...state.pixelation,
      ...(typeof update === 'function' ? update(state.pixelation) : update)
    }
  })),
  resetPixelation: () => set({ pixelation: INITIAL_PIXELATION_STATE }),
}))
