import { create } from 'zustand'

/**
 * Pixelation plugin — local state.
 *
 * Previously the `pixelation` slice of the global editor store.
 * Self-contained here so the plugin can be removed without touching the global store.
 */

export type PaletteStyle =
  | 'true-color'
  | 'monochrome'
  | 'pico-8'
  | 'gameboy'
  | 'cga'
  | 'posterized'

export interface PixelationState {
  blockSize: number
  paletteStyle: PaletteStyle
  posterizeLevels: number
  ditherStrength: number
  previewTarget: 'active' | 'composite'
}

type Update<T> = Partial<T> | ((prev: T) => Partial<T>)

interface PixelationStore extends PixelationState {
  setPixelation: (update: Update<PixelationState>) => void
  resetPixelation: () => void
}

const INITIAL: PixelationState = {
  blockSize: 8,
  paletteStyle: 'true-color',
  posterizeLevels: 4,
  ditherStrength: 50,
  previewTarget: 'composite',
}

export const usePixelationStore = create<PixelationStore>((set) => ({
  ...INITIAL,
  setPixelation: (update) =>
    set((state) => ({
      ...state,
      ...(typeof update === 'function' ? update(state) : update),
    })),
  resetPixelation: () => set(INITIAL),
}))
