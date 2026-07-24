import { create } from 'zustand'

/**
 * Crop plugin — local state.
 *
 * Owns the current crop rectangle and nothing else.
 * Previously this lived as `cropRect / setCropRect` in the global editor store,
 * which caused unrelated components to re-render whenever the crop rect changed.
 */

export interface CropRect { x: number; y: number; w: number; h: number }

interface CropState {
  cropRect: CropRect | null
  setCropRect: (r: CropRect | null) => void
  resetCrop: () => void
}

export const useCropStore = create<CropState>((set) => ({
  cropRect: null,
  setCropRect: (cropRect) => set({ cropRect }),
  resetCrop: () => set({ cropRect: null }),
}))
