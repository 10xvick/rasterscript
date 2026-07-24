import { useState, useEffect, useCallback } from 'react'

/**
 * Shared media drag-drop + paste + clipboard hook.
 *
 * Replaces the identical ~40-line block that was manually written in
 * `SpritesheetPanel.tsx`. Both the spritesheet panel and the video panel
 * call this hook — zero duplicated drop logic.
 *
 * Returns:
 *   - `over`      — true while a valid file is being dragged over the drop zone
 *   - `dropProps` — spread onto the drop zone element
 *
 * The `onFile` callback is called with the selected/dropped/pasted File.
 * The caller decides what to do with it (call `loadFile`, etc.).
 */

export interface UseMediaDropzoneOptions {
  /** Called when a file is received from any source. */
  onFile: (file: File) => void
  /** Prevent all interactions when true (e.g. while processing). */
  disabled?: boolean
  /**
   * Accepted MIME type prefixes (e.g. `['video/', 'image/']`).
   * Defaults to `['video/', 'image/']`.
   */
  accept?: string[]
}

export interface UseMediaDropzoneReturn {
  /** True while a valid file is being dragged over the zone. */
  over: boolean
  /** Paste from clipboard imperatively (call from a button). */
  pasteFromClipboard: () => Promise<void>
  /** Spread these onto the drop zone `<div>`. */
  dropProps: {
    onDragOver:  React.DragEventHandler
    onDragLeave: React.DragEventHandler
    onDrop:      React.DragEventHandler
  }
}

function accepts(file: File, patterns: string[]): boolean {
  return patterns.some(p =>
    p.endsWith('/') ? file.type.startsWith(p) : file.type === p || file.name.toLowerCase().endsWith(p)
  )
}

export function useMediaDropzone({
  onFile,
  disabled = false,
  accept   = ['video/', 'image/'],
}: UseMediaDropzoneOptions): UseMediaDropzoneReturn {
  const [over, setOver] = useState(false)

  // ─── Drag events ──────────────────────────────────────────────────────────

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!disabled) setOver(true)
  }, [disabled])

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setOver(false)
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setOver(false)
    if (disabled) return
    const file = e.dataTransfer.files?.[0]
    if (file && accepts(file, accept)) onFile(file)
  }, [disabled, accept, onFile])

  // ─── Window paste listener ────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      if (disabled) return
      const items = e.clipboardData?.items
      if (!items) return
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        if (item.kind === 'file') {
          const file = item.getAsFile()
          if (file && accepts(file, accept)) { onFile(file); break }
        }
      }
    }
    window.addEventListener('paste', handler)
    return () => window.removeEventListener('paste', handler)
  }, [disabled, accept, onFile])

  // ─── Imperative clipboard paste ───────────────────────────────────────────

  const pasteFromClipboard = useCallback(async () => {
    if (disabled) return
    try {
      const items = await navigator.clipboard.read()
      for (const item of items) {
        for (const type of item.types) {
          if (accepts({ type, name: '' } as File, accept)) {
            const blob = await item.getType(type)
            const ext  = type.split('/')[1] || 'bin'
            onFile(new File([blob], `pasted.${ext}`, { type }))
            return
          }
        }
      }
      alert('Clipboard does not contain a supported media file.')
    } catch {
      alert('Could not read clipboard. Try focusing the page and pressing Ctrl+V.')
    }
  }, [disabled, accept, onFile])

  return { over, pasteFromClipboard, dropProps: { onDragOver, onDragLeave, onDrop } }
}
