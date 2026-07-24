import { create } from 'zustand'

/**
 * Selection plugin — local state.
 *
 * Previously the `selection` slice of the global editor store.
 * Only the selection plugin reads/writes this — it belongs here.
 */

export interface SelectionRect { x: number; y: number; w: number; h: number }
export interface FloatingSelection {
  data: ImageData
  x: number
  y: number
  w: number
  h: number
}
export interface ClipboardEntry {
  data: ImageData
  x: number
  y: number
  w: number
  h: number
}

export interface SelectionState {
  rect: SelectionRect | null
  floating: FloatingSelection | null
  clipboard: ClipboardEntry | null
}

type Update<T> = Partial<T> | ((prev: T) => Partial<T>)

interface SelectionStore extends SelectionState {
  setSelection: (update: Update<SelectionState>) => void
  resetSelection: () => void
}

const INITIAL: SelectionState = {
  rect: null,
  floating: null,
  clipboard: null,
}

export const useSelectionStore = create<SelectionStore>((set) => ({
  ...INITIAL,
  setSelection: (update) =>
    set((state) => ({
      ...state,
      ...(typeof update === 'function' ? update(state) : update),
    })),
  resetSelection: () => set(INITIAL),
}))
