/**
 * useMediaLibrary — app-level Zustand store.
 *
 * The in-memory "file system" for the video editor workflow:
 *
 *   Load source video
 *     → define clips (trim points on the source)
 *       → send a clip to the Spritesheet generator
 *
 * ── Why app-level (not plugin-local)? ────────────────────────────────────────
 * Source files and clips are shared state that both the video editor plugin
 * and the spritesheet plugin need to read.  Plugin-local stores are the right
 * pattern for state owned by exactly one plugin.  MediaLibrary is owned by
 * the whole session.
 *
 * ── RAM considerations ────────────────────────────────────────────────────────
 * `File` objects are thin OS file-handle wrappers — NOT the file content in RAM.
 * Content only enters RAM when explicitly read (FFmpeg processing, canvas draw).
 * Thumbnails are small blob URLs (~50KB each), revoked on clip/source deletion.
 * The `totalSizeBytes` field lets the UI show a memory-budget warning.
 */

import { create } from 'zustand'
import {
  generateVideoThumbnail,
  generateImageThumbnail,
  probeMediaMetadata,
  type MediaMetadata,
} from '../lib/media'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SourceFile {
  id:           string
  name:         string
  file:         File              // disk reference — cheap in RAM
  thumbnail:    string            // blob URL of first frame (small canvas snapshot)
  width:        number
  height:       number
  duration:     number            // 0 for static images
  isVideo:      boolean
  isGif:        boolean
  sizeBytes:    number
}

export interface Clip {
  id:           string
  name:         string
  sourceFileId: string
  sourceFile:   File              // direct reference to the same File object
  trimStart:    number            // seconds
  trimEnd:      number            // seconds
  thumbnail:    string            // blob URL of frame at trimStart
  width:        number
  height:       number
}

// ─── Store ────────────────────────────────────────────────────────────────────

interface MediaLibraryStore {
  sourceFiles:    SourceFile[]
  clips:          Clip[]
  totalSizeBytes: number

  /**
   * Load a File into the library.
   * Probes metadata, generates a thumbnail, returns the new SourceFile id.
   */
  addSourceFile:  (file: File) => Promise<string>

  /** Remove a source file and all clips derived from it. */
  removeSourceFile: (id: string) => void

  /**
   * Create a new clip from a source file's trim range.
   * Generates a thumbnail at trimStart.
   */
  addClip: (params: {
    sourceFileId: string
    name:         string
    trimStart:    number
    trimEnd:      number
  }) => Promise<string>

  updateClip: (id: string, patch: Partial<Pick<Clip, 'name' | 'trimStart' | 'trimEnd'>>) => void

  /** Remove a clip and revoke its thumbnail blob URL. */
  removeClip: (id: string) => void

  /** Slice an existing clip at the specified timestamp, producing two contigous clips. */
  sliceClip: (clipId: string, time: number) => Promise<string | undefined>

  /** Duplicate a clip by copying its metadata and trim boundaries. */
  duplicateClip: (clipId: string) => Promise<string | undefined>

  /**
   * Push a clip's file + trim times into useSpriteStore so the user can go
   * straight from the video editor to the spritesheet generator without
   * re-selecting the file manually.
   *
   * Import is deferred inside the function to avoid circular deps.
   */
  sendClipToSpritesheet: (clipId: string) => void
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const genId = () => Math.random().toString(36).slice(2, 10)

async function buildSourceFile(file: File): Promise<SourceFile> {
  const meta: MediaMetadata = await probeMediaMetadata(file)
  const thumbnail = meta.isVideo || meta.isGif
    ? await generateVideoThumbnail(file, 0, 160)
    : await generateImageThumbnail(file, 160)

  return {
    id:        genId(),
    name:      file.name,
    file,
    thumbnail,
    width:     meta.width,
    height:    meta.height,
    duration:  meta.duration,
    isVideo:   meta.isVideo,
    isGif:     meta.isGif,
    sizeBytes: file.size,
  }
}

// ─── Store definition ─────────────────────────────────────────────────────────

export const useMediaLibrary = create<MediaLibraryStore>((set, get) => ({
  sourceFiles:    [],
  clips:          [],
  totalSizeBytes: 0,

  // ── addSourceFile ──────────────────────────────────────────────────────────
  addSourceFile: async (file: File) => {
    const src = await buildSourceFile(file)
    set(state => ({
      sourceFiles:    [...state.sourceFiles, src],
      totalSizeBytes: state.totalSizeBytes + src.sizeBytes,
    }))
    return src.id
  },

  // ── removeSourceFile ───────────────────────────────────────────────────────
  removeSourceFile: (id: string) => {
    const state = get()
    const src   = state.sourceFiles.find(s => s.id === id)
    if (!src) return

    // Revoke all thumbnail blob URLs for this source + its clips
    URL.revokeObjectURL(src.thumbnail)
    const orphanClips = state.clips.filter(c => c.sourceFileId === id)
    orphanClips.forEach(c => URL.revokeObjectURL(c.thumbnail))

    set(s => ({
      sourceFiles:    s.sourceFiles.filter(f => f.id !== id),
      clips:          s.clips.filter(c => c.sourceFileId !== id),
      totalSizeBytes: Math.max(0, s.totalSizeBytes - src.sizeBytes),
    }))
  },

  // ── addClip ────────────────────────────────────────────────────────────────
  addClip: async ({ sourceFileId, name, trimStart, trimEnd }) => {
    const src = get().sourceFiles.find(s => s.id === sourceFileId)
    if (!src) throw new Error(`Source file ${sourceFileId} not found in library`)

    const thumbnail = src.isVideo || src.isGif
      ? await generateVideoThumbnail(src.file, trimStart, 160)
      : src.thumbnail  // static images: reuse source thumbnail

    const clip: Clip = {
      id: genId(), name, sourceFileId,
      sourceFile: src.file,
      trimStart,  trimEnd,
      thumbnail,
      width:  src.width,
      height: src.height,
    }

    set(s => ({ clips: [...s.clips, clip] }))
    return clip.id
  },

  // ── updateClip ─────────────────────────────────────────────────────────────
  updateClip: async (id, patch) => {
    const state = get()
    const clip  = state.clips.find(c => c.id === id)
    if (!clip) return

    // If trimStart changed, regenerate the thumbnail
    let thumbnail = clip.thumbnail
    if (patch.trimStart !== undefined && patch.trimStart !== clip.trimStart) {
      URL.revokeObjectURL(clip.thumbnail)
      const src = state.sourceFiles.find(s => s.id === clip.sourceFileId)
      if (src && (src.isVideo || src.isGif)) {
        thumbnail = await generateVideoThumbnail(src.file, patch.trimStart, 160)
      }
    }

    set(s => ({
      clips: s.clips.map(c => c.id === id ? { ...c, ...patch, thumbnail } : c),
    }))
  },

  // ── removeClip ─────────────────────────────────────────────────────────────
  removeClip: (id: string) => {
    const clip = get().clips.find(c => c.id === id)
    if (clip) URL.revokeObjectURL(clip.thumbnail)
    set(s => ({ clips: s.clips.filter(c => c.id !== id) }))
  },

  // ── sliceClip ──────────────────────────────────────────────────────────────
  sliceClip: async (clipId: string, time: number) => {
    const state = get()
    const clip = state.clips.find(c => c.id === clipId)
    if (!clip) return
    if (time <= clip.trimStart || time >= clip.trimEnd) return

    const originalEnd = clip.trimEnd
    await state.updateClip(clipId, { trimEnd: time })

    // Find dynamic suffix name
    const match = clip.name.match(/(.*)\s\(Part\s(\d+)\)$/)
    let newName = `${clip.name} (Part 2)`
    if (match) {
      newName = `${match[1]} (Part ${parseInt(match[2]) + 1})`
    }

    const newClipId = await state.addClip({
      sourceFileId: clip.sourceFileId,
      name: newName,
      trimStart: time,
      trimEnd: originalEnd,
    })
    return newClipId
  },

  // ── duplicateClip ──────────────────────────────────────────────────────────
  duplicateClip: async (clipId: string) => {
    const clip = get().clips.find(c => c.id === clipId)
    if (!clip) return

    // Find copy suffix
    const match = clip.name.match(/(.*)\sCopy(\s\d+)?$/)
    let newName = `${clip.name} Copy`
    if (match) {
      const copyNum = match[2] ? parseInt(match[2].trim()) + 1 : 2
      newName = `${match[1]} Copy ${copyNum}`
    }

    const newClipId = await get().addClip({
      sourceFileId: clip.sourceFileId,
      name: newName,
      trimStart: clip.trimStart,
      trimEnd: clip.trimEnd,
    })
    return newClipId
  },

  // ── sendClipToSpritesheet ──────────────────────────────────────────────────
  sendClipToSpritesheet: (clipId: string) => {
    const clip = get().clips.find(c => c.id === clipId)
    if (!clip) return

    // Deferred import avoids a circular dependency (MediaLibrary ↔ SpriteStore).
    // This is the only cross-plugin action in the whole codebase — it belongs
    // here rather than in either plugin because it is a workflow bridge.
    import('../plugins/spritesheet/useSpriteStore').then(({ useSpriteStore }) => {
      useSpriteStore.getState().setSpritesheet({
        file:          clip.sourceFile,
        startTime:     clip.trimStart,
        endTime:       clip.trimEnd,
        originalWidth: clip.width,
        originalHeight:clip.height,
        frameWidth:    clip.width,
        frameHeight:   clip.height,
        duration:      clip.trimEnd - clip.trimStart,
        // reset derived state so the panel recalculates from the new file
        compiledCanvas:    null,
        numCompiledFrames: 0,
        statusText:        `Loaded clip: ${clip.name}`,
        loadingFile:       false,
      })
    })
  },
}))
