import { create } from 'zustand'

/**
 * Video editor plugin — local state.
 *
 * Deliberately thin: source files and clips live in `useMediaLibrary`
 * (app-level shared store).  This store only tracks per-session editor UI
 * state: which clip is active, playback position, chroma key settings,
 * and FFmpeg processing progress.
 *
 * State survives panel close/reopen because Zustand stores live outside
 * React's component tree.
 */

export interface VideoState {
  /** ID of the clip currently loaded in the video editor (null = none). */
  activeClipId: string | null

  /** Current playback position in seconds. */
  currentTime:  number

  /** Whether the video is playing. */
  playing:      boolean

  // ── Chroma key (real-time preview + export) ────────────────────────────────
  removeBg:    boolean
  bgKeyColor:  string   // hex, e.g. "#00ff00"
  bgThreshold: number   // 0–441, typical 30–100

  // ── Export settings ────────────────────────────────────────────────────────
  exportFormat: 'mp4' | 'gif' | 'webm'

  // ── FFmpeg processing ──────────────────────────────────────────────────────
  processing:  boolean
  statusText:  string
  ffmpegLogs:  string[]
  progress:    number   // 0–100
}

type Patch<T> = Partial<T> | ((prev: T) => Partial<T>)

interface VideoStore extends VideoState {
  setVideo:   (patch: Patch<VideoState>) => void
  resetVideo: () => void
}

const INITIAL: VideoState = {
  activeClipId: null,
  currentTime:  0,
  playing:      false,
  removeBg:     false,
  bgKeyColor:   '#00ff00',
  bgThreshold:  60,
  exportFormat: 'mp4',
  processing:   false,
  statusText:   '',
  ffmpegLogs:   [],
  progress:     0,
}

export const useVideoStore = create<VideoStore>((set) => ({
  ...INITIAL,

  setVideo: (patch) =>
    set((state) => ({
      ...state,
      ...(typeof patch === 'function' ? patch(state) : patch),
    })),

  resetVideo: () => set(INITIAL),
}))
