import type { EditorContext, PixelTransformFn, ScriptAPI } from './types'

/**
 * Builds the ScriptAPI object exposed to user scripts.
 * All canvas operations route through the EditorContext so history is preserved.
 */
export function buildScriptAPI(
  ctx: EditorContext,
  logFn: (...args: unknown[]) => void,
): ScriptAPI {
  const c = ctx.canvas
  const g = c.getContext('2d', { willReadFrequently: true })!

  const api: ScriptAPI = {
    canvas: c,
    ctx: g,

    getImageData: () => ctx.getImageData(),

    setImageData: (data, _label = 'Script') => {
      ctx.setImageData(data, true)
    },

    forEach: (fn: PixelTransformFn) => {
      const data = ctx.getImageData()
      const d = data.data
      const w = data.width
      for (let i = 0; i < d.length; i += 4) {
        const idx = i / 4
        const x = idx % w
        const y = Math.floor(idx / w)
        const [r, gr, b, a] = fn(d[i], d[i + 1], d[i + 2], d[i + 3], x, y)
        d[i] = r; d[i + 1] = gr; d[i + 2] = b; d[i + 3] = a
      }
      ctx.setImageData(data, true)
    },

    resize: (width, height, smooth = true) => {
      const tmp = document.createElement('canvas')
      tmp.width = width; tmp.height = height
      const t = tmp.getContext('2d')!
      t.imageSmoothingEnabled = smooth
      t.imageSmoothingQuality = 'high'
      t.drawImage(c, 0, 0, width, height)
      ctx.setImageData(t.getImageData(0, 0, width, height), true)
    },

    crop: (x, y, w, h) => {
      const data = g.getImageData(x, y, w, h)
      ctx.setImageData(data, true)
    },

    rotate: (degrees) => {
      const rad = (degrees * Math.PI) / 180
      const sin = Math.abs(Math.sin(rad))
      const cos = Math.abs(Math.cos(rad))
      const nw = Math.round(c.width * cos + c.height * sin)
      const nh = Math.round(c.width * sin + c.height * cos)
      const tmp = document.createElement('canvas')
      tmp.width = nw; tmp.height = nh
      const t = tmp.getContext('2d')!
      t.translate(nw / 2, nh / 2)
      t.rotate(rad)
      t.drawImage(c, -c.width / 2, -c.height / 2)
      ctx.setImageData(t.getImageData(0, 0, nw, nh), true)
    },

    flip: (axis) => {
      const tmp = document.createElement('canvas')
      tmp.width = c.width; tmp.height = c.height
      const t = tmp.getContext('2d')!
      if (axis === 'h') {
        t.translate(c.width, 0); t.scale(-1, 1)
      } else {
        t.translate(0, c.height); t.scale(1, -1)
      }
      t.drawImage(c, 0, 0)
      ctx.setImageData(t.getImageData(0, 0, c.width, c.height), true)
    },

    sliceSprite: async (cols, rows, options = {}) => {
      const { download = true, prefix = 'sprite', trimAlpha = true } = options
      const cellW = Math.floor(c.width / cols)
      const cellH = Math.floor(c.height / rows)
      const blobs: Blob[] = []

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const tmp = document.createElement('canvas')
          let sx = col * cellW, sy = row * cellH, sw = cellW, sh = cellH

          if (trimAlpha) {
            const src = g.getImageData(sx, sy, sw, sh)
            const bounds = _alphaBounds(src)
            if (bounds) { sx += bounds.x; sy += bounds.y; sw = bounds.w; sh = bounds.h }
          }

          tmp.width = sw; tmp.height = sh
          tmp.getContext('2d')!.drawImage(c, sx, sy, sw, sh, 0, 0, sw, sh)

          const blob = await _canvasToBlob(tmp)
          blobs.push(blob)

          if (download) {
            const idx = row * cols + col
            api.download(blob, `${prefix}_${String(idx).padStart(3, '0')}.png`)
          }
        }
      }

      logFn(`[sliceSprite] Exported ${blobs.length} cells (${cols}×${rows})`)
      return blobs
    },

    download: (blob, filename) => {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = filename; a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    },

    downloadAll: (blobs, prefix = 'image', ext = 'png') => {
      blobs.forEach((blob, i) => {
        api.download(blob, `${prefix}_${String(i).padStart(3, '0')}.${ext}`)
      })
    },

    log: logFn,
  }

  return api
}

/**
 * Run user script code in a sandboxed async function.
 * The script receives `api` as its only global.
 */
export async function runScript(
  code: string,
  api: ScriptAPI,
): Promise<void> {
  // eslint-disable-next-line no-new-func
  const fn = new Function('api', `return (async () => { ${code} })()`)
  await fn(api)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((res, rej) =>
    canvas.toBlob(b => b ? res(b) : rej(new Error('toBlob failed')), 'image/png'),
  )
}

function _alphaBounds(data: ImageData): { x: number; y: number; w: number; h: number } | null {
  const { width, height } = data
  const d = data.data
  let minX = width, minY = height, maxX = 0, maxY = 0

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (d[(y * width + x) * 4 + 3] > 0) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }

  if (maxX < minX || maxY < minY) return null
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
}
