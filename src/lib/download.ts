/**
 * Browser download helpers.
 *
 * One place for all "trigger a save-as dialog" operations.
 * No React, no store imports — pure DOM.
 */

// ─── Blob download ────────────────────────────────────────────────────────────

/**
 * Trigger a browser "Save As" dialog for the given Blob.
 *
 * @param blob     - The data to download.
 * @param filename - Suggested file name shown in the dialog.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a   = document.createElement('a')
  a.href     = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Canvas download ──────────────────────────────────────────────────────────

/**
 * Export the contents of a canvas as a PNG and trigger a download.
 *
 * @param canvas   - The source canvas element.
 * @param filename - Suggested file name (should end in `.png`).
 */
export function downloadCanvas(
  canvas: HTMLCanvasElement,
  filename: string,
): void {
  canvas.toBlob(blob => {
    if (!blob) return
    downloadBlob(blob, filename)
  }, 'image/png')
}

// ─── Multiple files ───────────────────────────────────────────────────────────

/**
 * Download an array of Blobs as separate numbered files.
 *
 * @param blobs  - Array of blobs.
 * @param prefix - Filename prefix (e.g. `"frame_"`).
 * @param ext    - File extension without dot (default: `"png"`).
 */
export function downloadAll(
  blobs: Blob[],
  prefix = 'file_',
  ext = 'png',
): void {
  blobs.forEach((blob, i) => {
    const name = `${prefix}${String(i + 1).padStart(4, '0')}.${ext}`
    downloadBlob(blob, name)
  })
}
