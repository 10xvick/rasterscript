import type { LayerInfo, HistorySnapshot } from './types'

const genId = () => Math.random().toString(36).substr(2, 9)

function mkCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  c.getContext('2d', { willReadFrequently: true })
  return c
}

interface InternalLayer extends LayerInfo {
  canvas: HTMLCanvasElement
}

/**
 * Manages an ordered stack of off-screen canvases.
 * The engine composites them to the display canvas.
 */
export class LayerManager {
  private _layers: InternalLayer[] = []
  private _activeId = ''
  private _width = 0
  private _height = 0

  // ─── Accessors ──────────────────────────────────────────────────────────────

  get layers(): readonly LayerInfo[] {
    return this._layers.map(({ id, name, visible, opacity, blendMode }) =>
      ({ id, name, visible, opacity, blendMode }),
    )
  }

  get activeId() { return this._activeId }
  get width()    { return this._width }
  get height()   { return this._height }

  // ─── Init ───────────────────────────────────────────────────────────────────

  init(width: number, height: number, data?: ImageData, name = 'Layer 1') {
    this._width  = width
    this._height = height
    const layer  = this._make(name, width, height)
    if (data) layer.canvas.getContext('2d', { willReadFrequently: true })!.putImageData(data, 0, 0)
    this._layers   = [layer]
    this._activeId = layer.id
  }

  // ─── Composite ──────────────────────────────────────────────────────────────

  composite(target: HTMLCanvasElement) {
    const ctx = target.getContext('2d')!
    ctx.clearRect(0, 0, target.width, target.height)
    for (const layer of this._layers) {
      if (!layer.visible) continue
      ctx.save()
      ctx.globalAlpha             = layer.opacity
      ctx.globalCompositeOperation = layer.blendMode
      ctx.drawImage(layer.canvas, 0, 0)
      ctx.restore()
    }
  }

  // ─── Active layer ───────────────────────────────────────────────────────────

  getActiveCanvas(): HTMLCanvasElement | null {
    return this._find(this._activeId)?.canvas ?? null
  }

  // ─── Mutations ──────────────────────────────────────────────────────────────

  addLayer(name?: string): LayerInfo {
    const layer = this._make(name ?? `Layer ${this._layers.length + 1}`, this._width, this._height)
    const idx   = this._layers.findIndex(l => l.id === this._activeId)
    this._layers.splice(idx < 0 ? this._layers.length : idx + 1, 0, layer)
    this._activeId = layer.id
    return { id: layer.id, name: layer.name, visible: layer.visible, opacity: layer.opacity, blendMode: layer.blendMode }
  }

  /** Import external image data as a new layer at native resolution.
   *  Expands the document canvas if the image is larger than current bounds. */
  addImageLayer(data: ImageData, name?: string): LayerInfo {
    const newW = Math.max(this._width, data.width)
    const newH = Math.max(this._height, data.height)

    if (newW !== this._width || newH !== this._height) {
      const ox = Math.round((newW - this._width)  / 2)
      const oy = Math.round((newH - this._height) / 2)
      for (const layer of this._layers) {
        const c = mkCanvas(newW, newH)
        c.getContext('2d', { willReadFrequently: true })!.drawImage(layer.canvas, ox, oy)
        layer.canvas = c
      }
      this._width  = newW
      this._height = newH
    }

    const layer = this._make(name ?? `Layer ${this._layers.length + 1}`, this._width, this._height)
    const tmp = mkCanvas(data.width, data.height)
    tmp.getContext('2d', { willReadFrequently: true })!.putImageData(data, 0, 0)
    const x = Math.round((this._width  - data.width)  / 2)
    const y = Math.round((this._height - data.height) / 2)
    layer.canvas.getContext('2d', { willReadFrequently: true })!.drawImage(tmp, x, y)
    this._layers.push(layer)
    this._activeId = layer.id
    return layer
  }

  deleteLayer(id: string) {
    if (this._layers.length <= 1) return
    const idx = this._layers.findIndex(l => l.id === id)
    if (idx < 0) return
    this._layers.splice(idx, 1)
    if (this._activeId === id) {
      this._activeId = this._layers[Math.max(0, idx - 1)].id
    }
  }

  setActive(id: string) {
    if (this._layers.some(l => l.id === id)) this._activeId = id
  }

  setVisible(id: string, v: boolean)                   { const l = this._find(id); if (l) l.visible   = v }
  setOpacity(id: string, v: number)                    { const l = this._find(id); if (l) l.opacity   = v }
  setBlendMode(id: string, m: GlobalCompositeOperation){ const l = this._find(id); if (l) l.blendMode = m }
  rename(id: string, name: string)                     { const l = this._find(id); if (l) l.name      = name }

  move(id: string, dir: 1 | -1) {
    const i = this._layers.findIndex(l => l.id === id)
    const j = i + dir
    if (j < 0 || j >= this._layers.length) return
    ;[this._layers[i], this._layers[j]] = [this._layers[j], this._layers[i]]
  }

  /** Add a new layer with image data placed at exact pixel position (no scaling/centering) */
  addLayerAt(data: ImageData, x: number, y: number, name?: string): LayerInfo {
    const layer = this._make(name ?? `Layer ${this._layers.length + 1}`, this._width, this._height)
    const tmp = mkCanvas(data.width, data.height)
    tmp.getContext('2d', { willReadFrequently: true })!.putImageData(data, 0, 0)
    layer.canvas.getContext('2d', { willReadFrequently: true })!.drawImage(tmp, x, y)
    this._layers.push(layer)
    this._activeId = layer.id
    return layer
  }

  /** Crop every layer to the given rect without flattening */
  crop(x: number, y: number, w: number, h: number) {
    this._width  = w
    this._height = h
    for (const layer of this._layers) {
      const c = mkCanvas(w, h)
      c.getContext('2d', { willReadFrequently: true })!.drawImage(layer.canvas, -x, -y)
      layer.canvas = c
    }
  }

  /** Merge active layer down into the layer below it */
  mergeDown(): boolean {
    const idx = this._layers.findIndex(l => l.id === this._activeId)
    if (idx <= 0) return false
    const above = this._layers[idx]
    const below = this._layers[idx - 1]
    const c = mkCanvas(this._width, this._height)
    const ctx = c.getContext('2d', { willReadFrequently: true })!
    ctx.save(); ctx.globalAlpha = below.opacity; ctx.globalCompositeOperation = below.blendMode
    ctx.drawImage(below.canvas, 0, 0); ctx.restore()
    ctx.save(); ctx.globalAlpha = above.opacity; ctx.globalCompositeOperation = above.blendMode
    ctx.drawImage(above.canvas, 0, 0); ctx.restore()
    below.canvas    = c
    below.opacity   = 1
    below.blendMode = 'source-over'
    this._layers.splice(idx, 1)
    this._activeId = below.id
    return true
  }

  /** Collapse all layers into one using the already-composited data */
  flatten(compositeData: ImageData) {
    this._width  = compositeData.width
    this._height = compositeData.height
    const layer  = this._make('Layer 1', compositeData.width, compositeData.height)
    layer.canvas.getContext('2d', { willReadFrequently: true })!.putImageData(compositeData, 0, 0)
    this._layers   = [layer]
    this._activeId = layer.id
  }

  // ─── History ────────────────────────────────────────────────────────────────

  snapshot(): HistorySnapshot {
    return {
      width:    this._width,
      height:   this._height,
      activeId: this._activeId,
      layers:   this._layers.map(l => ({
        meta:      { id: l.id, name: l.name, visible: l.visible, opacity: l.opacity, blendMode: l.blendMode },
        imageData: l.canvas.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, l.canvas.width, l.canvas.height),
      })),
    }
  }

  restore(snap: HistorySnapshot) {
    this._width    = snap.width
    this._height   = snap.height
    this._activeId = snap.activeId
    this._layers   = snap.layers.map(({ meta, imageData }) => {
      const c = mkCanvas(imageData.width, imageData.height)
      c.getContext('2d', { willReadFrequently: true })!.putImageData(imageData, 0, 0)
      return { ...meta, canvas: c }
    })
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  private _make(name: string, w: number, h: number): InternalLayer {
    return { id: genId(), name, visible: true, opacity: 1, blendMode: 'source-over', canvas: mkCanvas(w, h) }
  }

  private _find(id: string) { return this._layers.find(l => l.id === id) }
}
