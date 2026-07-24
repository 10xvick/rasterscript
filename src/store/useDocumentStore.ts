import { create } from 'zustand'
import { activeDocument, DocumentModel } from '../core/document/DocumentModel'
import type { FrameBlock, SpritesheetLayout, PlaybackState } from '../core/document/DocumentModel'

interface DocumentState {
  doc: DocumentModel
  frames: FrameBlock[]
  activeFrameIndex: number
  spritesheet: SpritesheetLayout
  playback: PlaybackState
  version: number // Increment to force re-render on mutation

  // Actions
  setFrames: (framesData: ImageData[], names?: string[]) => Promise<void>
  updateActiveFrameImageData: (imageData: ImageData) => Promise<void>
  setActiveFrameIndex: (idx: number) => void
  addFrame: (imageData: ImageData, insertAtIndex?: number) => Promise<void>
  deleteFrame: (index: number) => void
  duplicateFrame: (index: number) => Promise<void>
  reorderFrames: (fromIdx: number, toIdx: number) => void
  reorderTiles: (fromSlot: number, toSlot: number) => void
  configureSpritesheetLayout: (config: Partial<Omit<SpritesheetLayout, 'frameMap'>>) => void
  setSelection: (indices: number[]) => void
  toggleSelection: (index: number, multiSelect?: boolean) => void
  setPlayback: (patch: Partial<PlaybackState>) => void
  generateFullSpritesheet: () => ImageData
}

export const useDocumentStore = create<DocumentState>((set, get) => {
  // Sync state on document updates
  activeDocument.subscribe(() => {
    set({
      frames: [...activeDocument.frames],
      activeFrameIndex: activeDocument.activeFrameIndex,
      spritesheet: { ...activeDocument.spritesheet },
      playback: { ...activeDocument.playback },
      version: get().version + 1,
    })
  })

  return {
    doc: activeDocument,
    frames: activeDocument.frames,
    activeFrameIndex: activeDocument.activeFrameIndex,
    spritesheet: activeDocument.spritesheet,
    playback: activeDocument.playback,
    version: 0,

    setFrames: async (framesData, names) => {
      await activeDocument.setFrames(framesData, names)
    },

    updateActiveFrameImageData: async (imageData) => {
      await activeDocument.updateActiveFrameImageData(imageData)
    },

    setActiveFrameIndex: (idx) => {
      activeDocument.setActiveFrameIndex(idx)
    },

    addFrame: async (imageData, insertAtIndex) => {
      await activeDocument.addFrame(imageData, insertAtIndex)
    },

    deleteFrame: (index) => {
      activeDocument.deleteFrame(index)
    },

    duplicateFrame: async (index) => {
      await activeDocument.duplicateFrame(index)
    },

    reorderFrames: (fromIdx, toIdx) => {
      activeDocument.reorderFrames(fromIdx, toIdx)
    },

    reorderTiles: (fromSlot, toSlot) => {
      activeDocument.reorderTiles(fromSlot, toSlot)
    },

    configureSpritesheetLayout: (config) => {
      activeDocument.configureSpritesheetLayout(config)
    },

    setSelection: (indices) => {
      activeDocument.setSelection(indices)
    },

    toggleSelection: (index, multiSelect) => {
      activeDocument.toggleSelection(index, multiSelect)
    },

    setPlayback: (patch) => {
      activeDocument.setPlayback(patch)
    },

    generateFullSpritesheet: () => {
      return activeDocument.generateFullSpritesheetImageData()
    },
  }
})
