import { create } from 'zustand'
import { hexToRgb, chromaKey } from '../../lib/color'

/**
 * Spritesheet plugin — local state.
 *
 * Previously the `SpritesheetState` slice of the global editor store plus
 * the chroma-key logic embedded in `syncFromEngine`.
 *
 * `syncFromActiveLayer()` is the one place where the plugin reacts to a canvas
 * change and updates its compiled preview when "Load Active Layer" mode is on.
 * Call it from any engine subscription — **not** from the global store.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

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
  isFromActiveLayer: boolean
}

type Update<T> = Partial<T> | ((prev: T) => Partial<T>)

interface SpritesheetStore extends SpritesheetState {
  setSpritesheet: (update: Update<SpritesheetState>) => void
  resetSpritesheet: () => void
  /** Re-derive compiledCanvas from the active layer canvas when in "active layer" mode. */
  syncFromActiveLayer: (layerCtx: CanvasRenderingContext2D | null) => void
}

// ─── Initial state ────────────────────────────────────────────────────────────

const INITIAL: SpritesheetState = {
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
  isFromActiveLayer: false,
}

// ─── Debounce helpers ─────────────────────────────────────────────────────────

let lastSyncTime = 0
let syncTimeout: ReturnType<typeof setTimeout> | null = null

// ─── Store ────────────────────────────────────────────────────────────────────

export const useSpriteStore = create<SpritesheetStore>((set, get) => ({
  ...INITIAL,

  setSpritesheet: (update) =>
    set((state) => ({
      ...state,
      ...(typeof update === 'function' ? update(state) : update),
    })),

  resetSpritesheet: () => set(INITIAL),

  syncFromActiveLayer: (layerCtx) => {
    const state = get()
    if (!state.isFromActiveLayer || !state.file) return
    if (!layerCtx) return
    const layerCanvas = layerCtx.canvas
    if (layerCanvas.width === 0 || layerCanvas.height === 0) return

    // Debounce rapid calls (e.g. during doodle strokes)
    const now = Date.now()
    if (now - lastSyncTime < 200) {
      if (syncTimeout) clearTimeout(syncTimeout)
      syncTimeout = setTimeout(() => {
        get().syncFromActiveLayer(layerCtx)
      }, 200)
      return
    }
    lastSyncTime = now
    if (syncTimeout) { clearTimeout(syncTimeout); syncTimeout = null }

    // Copy layer canvas
    const copy = document.createElement('canvas')
    copy.width  = layerCanvas.width
    copy.height = layerCanvas.height
    const copyCtx = copy.getContext('2d')!
    copyCtx.drawImage(layerCanvas, 0, 0)

    // Apply chroma key if enabled — uses shared lib, not a local copy
    if (state.removeBg) {
      const imgData = copyCtx.getImageData(0, 0, copy.width, copy.height)
      chromaKey(imgData.data, hexToRgb(state.bgKeyColor), state.bgThreshold)
      copyCtx.putImageData(imgData, 0, 0)
    }

    const cols = Math.floor(
      (layerCanvas.width  + state.padding) / (state.frameWidth  + state.padding)
    )
    const rows = Math.floor(
      (layerCanvas.height + state.padding) / (state.frameHeight + state.padding)
    )
    const totalFrames = Math.max(1, Math.min(state.maxFrames, cols * rows))

    set({ compiledCanvas: copy, numCompiledFrames: totalFrames })
  },
}))
