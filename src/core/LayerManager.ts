import type { LayerInfo, HistorySnapshot } from './types'
import { extractFrameToCanvas } from '../lib/media'
import { chromaKey, hexToRgb } from '../lib/color'
import { useEditorStore } from '../store/useEditorStore'

const genId = () => Math.random().toString(36).substr(2, 9)

function mkCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  c.getContext('2d', { willReadFrequently: true })
  return c
}

interface InternalLayer extends LayerInfo {
  canvas: HTMLCanvasElement
  lastDecodedTime?: number
  decodingTime?: number
  isDecoding?: boolean
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
  private _videoElements = new Map<string, HTMLVideoElement>()

  onCompositeNeeded?: () => void

  // ─── Accessors ──────────────────────────────────────────────────────────────

  get layers(): readonly LayerInfo[] {
    return this._layers.map(({
      id, name, visible, opacity, blendMode,
      isVideo, videoFile, videoDuration, startTime, endTime, trimStart, trimEnd,
      removeBg, bgKeyColor, bgThreshold,
      brightness, contrast, saturation, hueRotate, blur, scale, posX, posY, rotation,
      cropX, cropY, cropW, cropH,
      useAiBgRemoval, aiModelType, invertAiMask, edgeShift, feathering
    }) => ({
      id, name, visible, opacity, blendMode,
      isVideo, videoFile, videoDuration, startTime, endTime, trimStart, trimEnd,
      removeBg, bgKeyColor, bgThreshold,
      brightness, contrast, saturation, hueRotate, blur, scale, posX, posY, rotation,
      cropX, cropY, cropW, cropH,
      useAiBgRemoval, aiModelType, invertAiMask, edgeShift, feathering
    }))
  }

  setLayerVideoProperties(id: string, props: Partial<LayerInfo>) {
    const layer = this._find(id)
    if (layer) {
      Object.assign(layer, props)
      if (props.videoFile !== undefined) {
        layer.isVideo = true
      }
      if (
        props.useAiBgRemoval !== undefined ||
        (layer.useAiBgRemoval && (
          props.aiModelType !== undefined ||
          props.invertAiMask !== undefined ||
          props.edgeShift !== undefined ||
          props.feathering !== undefined
        ))
      ) {
        const useAi = props.useAiBgRemoval !== undefined ? props.useAiBgRemoval : layer.useAiBgRemoval
        const invertMask = props.invertAiMask !== undefined ? props.invertAiMask : (layer.invertAiMask ?? false)
        const eShift = props.edgeShift !== undefined ? props.edgeShift : (layer.edgeShift ?? -10)
        const fValue = props.feathering !== undefined ? props.feathering : (layer.feathering ?? 20)

        if (useAi) {
          if (!layer.isVideo) {
            // Static image AI background removal
            if (!layer.originalBackupCanvas) {
              layer.originalBackupCanvas = mkCanvas(layer.canvas.width, layer.canvas.height)
              layer.originalBackupCanvas.getContext('2d')!.drawImage(layer.canvas, 0, 0)
            }
            import('../lib/selfieSegmentation').then(({ applySelfieSegmentation }) => {
              applySelfieSegmentation(layer.originalBackupCanvas!, layer.canvas, eShift, fValue, invertMask).then(() => {
                this.onCompositeNeeded?.()
              })
            })
          }
        } else {
          // Restore original static image canvas if toggled off
          if (layer.originalBackupCanvas) {
            const ctx = layer.canvas.getContext('2d')!
            ctx.clearRect(0, 0, layer.canvas.width, layer.canvas.height)
            ctx.drawImage(layer.originalBackupCanvas, 0, 0)
            this.onCompositeNeeded?.()
          }
        }
      }
      // Reset cache on property changes
      layer.lastDecodedTime = undefined
      layer.decodingTime = undefined
      layer.isDecoding = false
    }
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

  composite(target: HTMLCanvasElement, currentTime?: number) {
    const ctx = target.getContext('2d')!
    ctx.clearRect(0, 0, target.width, target.height)
    for (const layer of this._layers) {
      if (!layer.visible) continue

      if (layer.isVideo && layer.videoFile && currentTime !== undefined) {
        const start = layer.startTime ?? 0
        const end = layer.endTime ?? (layer.videoDuration ?? 0)
        if (currentTime < start || currentTime > end) {
          continue
        }

        const rawRelative = (currentTime - start) + (layer.trimStart ?? 0)
        const maxTime = layer.trimEnd ?? (layer.videoDuration ?? 0)
        const relativeTime = Math.max(layer.trimStart ?? 0, Math.min(rawRelative, maxTime))

        let video = this._videoElements.get(layer.id)
        if (!video) {
          video = document.createElement('video')
          video.preload = 'auto'
          video.muted = true
          video.playsInline = true
          const url = URL.createObjectURL(layer.videoFile)
          video.src = url
          this._videoElements.set(layer.id, video)
          
          video.onloadeddata = () => {
            if (video) {
              video.currentTime = relativeTime
            }
          }
        }

        // Handle seeked events dynamically
        video.onseeked = () => {
          if (!video) return
          const vW = video.videoWidth || layer.canvas.width
          const vH = video.videoHeight || layer.canvas.height
          const scale = Math.min(layer.canvas.width / vW, layer.canvas.height / vH)
          const drawW = vW * scale
          const drawH = vH * scale
          const drawX = Math.round((layer.canvas.width - drawW) / 2)
          const drawY = Math.round((layer.canvas.height - drawH) / 2)

          this.processVideoFrame(layer, video, drawX, drawY, drawW, drawH)
          this.onCompositeNeeded?.()
        }

        const isPlaying = useEditorStore.getState().playing
        if (isPlaying) {
          if (video.paused) {
            video.play().catch(() => {})
          }
          const drift = Math.abs(video.currentTime - relativeTime)
          if (drift > 0.15) {
            video.currentTime = relativeTime
          }
        } else {
          if (!video.paused) {
            video.pause()
          }
          const drift = Math.abs(video.currentTime - relativeTime)
          if (drift > 0.03) {
            video.currentTime = relativeTime
          }
        }

        const vW = video.videoWidth || layer.canvas.width
        const vH = video.videoHeight || layer.canvas.height
        const scale = Math.min(layer.canvas.width / vW, layer.canvas.height / vH)
        const drawW = vW * scale
        const drawH = vH * scale
        const drawX = Math.round((layer.canvas.width - drawW) / 2)
        const drawY = Math.round((layer.canvas.height - drawH) / 2)

        this.processVideoFrame(layer, video, drawX, drawY, drawW, drawH)
      }

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

  reorderLayer(fromId: string, toId: string) {
    const fromIdx = this._layers.findIndex(l => l.id === fromId)
    const toIdx = this._layers.findIndex(l => l.id === toId)
    if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return
    const [moved] = this._layers.splice(fromIdx, 1)
    this._layers.splice(toIdx, 0, moved)
    this.onCompositeNeeded?.()
  }

  /** Add a new layer with image data placed at exact pixel position (no scaling/centering), expanding canvas bounds if necessary */
  addLayerAt(data: ImageData, x: number, y: number, name?: string): LayerInfo {
    if (this._width === 0 || this._height === 0) {
      this._width  = data.width
      this._height = data.height
    }

    const newMinX = Math.min(0, x)
    const newMinY = Math.min(0, y)
    const newMaxX = Math.max(this._width, x + data.width)
    const newMaxY = Math.max(this._height, y + data.height)

    const newW = newMaxX - newMinX
    const newH = newMaxY - newMinY

    if (newW > this._width || newH > this._height) {
      const dx = -newMinX
      const dy = -newMinY
      for (const layer of this._layers) {
        const c = mkCanvas(newW, newH)
        c.getContext('2d', { willReadFrequently: true })!.drawImage(layer.canvas, dx, dy)
        layer.canvas = c
      }
      this._width  = newW
      this._height = newH
    }

    const layer = this._make(name ?? `Layer ${this._layers.length + 1}`, this._width, this._height)
    const tmp = mkCanvas(data.width, data.height)
    tmp.getContext('2d', { willReadFrequently: true })!.putImageData(data, 0, 0)
    
    const drawX = x - newMinX
    const drawY = y - newMinY
    layer.canvas.getContext('2d', { willReadFrequently: true })!.drawImage(tmp, drawX, drawY)
    
    this._layers.push(layer)
    this._activeId = layer.id
    return { id: layer.id, name: layer.name, visible: layer.visible, opacity: layer.opacity, blendMode: layer.blendMode }
  }

  /** Crop every layer to the given rect without flattening */
  crop(x: number, y: number, w: number, h: number) {
    this._width  = w
    this._height = h
    for (const layer of this._layers) {
      if (layer.isVideo) {
        layer.cropX = (layer.cropX ?? 0) + x
        layer.cropY = (layer.cropY ?? 0) + y
        layer.cropW = w
        layer.cropH = h
      }
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

  /** Update ONLY the active layer canvas without affecting or destroying other layers */
  setActiveLayerImageData(data: ImageData) {
    const layer = this._find(this._activeId)
    if (!layer) return
    layer.canvas.width = data.width
    layer.canvas.height = data.height
    layer.canvas.getContext('2d', { willReadFrequently: true })!.putImageData(data, 0, 0)
    layer.originalBackupCanvas = undefined
  }

  /** Return the active layer ImageData directly */
  getActiveLayerImageData(): ImageData | null {
    const layer = this._find(this._activeId)
    if (!layer) return null
    const w = Math.max(1, Math.floor(layer.canvas.width))
    const h = Math.max(1, Math.floor(layer.canvas.height))
    return layer.canvas.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, w, h)
  }

  // ─── History ────────────────────────────────────────────────────────────────

  snapshot(): HistorySnapshot {
    return {
      width:    this._width,
      height:   this._height,
      activeId: this._activeId,
      layers:   this._layers.map(l => {
        const { canvas, lastDecodedTime, decodingTime, isDecoding, ...meta } = l
        const w = Math.max(1, Math.floor(canvas.width))
        const h = Math.max(1, Math.floor(canvas.height))
        return {
          meta,
          imageData: canvas.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, w, h),
        }
      }),
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

  private renderLayerWithFilters(
    ctx: CanvasRenderingContext2D,
    source: HTMLVideoElement | HTMLCanvasElement,
    drawX: number,
    drawY: number,
    drawW: number,
    drawH: number,
    layer: InternalLayer
  ) {
    const b = layer.brightness ?? 100
    const c = layer.contrast ?? 100
    const s = layer.saturation ?? 100
    const h = layer.hueRotate ?? 0
    const blur = layer.blur ?? 0

    const filterParts: string[] = []
    if (b !== 100) filterParts.push(`brightness(${b}%)`)
    if (c !== 100) filterParts.push(`contrast(${c}%)`)
    if (s !== 100) filterParts.push(`saturate(${s}%)`)
    if (h !== 0) filterParts.push(`hue-rotate(${h}deg)`)
    if (blur > 0) filterParts.push(`blur(${blur}px)`)

    ctx.save()
    ctx.filter = filterParts.length > 0 ? filterParts.join(' ') : 'none'

    const userScale = layer.scale ?? 1
    const posX = layer.posX ?? 0
    const posY = layer.posY ?? 0
    const rot = layer.rotation ?? 0

    const centerX = drawX + drawW / 2 + posX
    const centerY = drawY + drawH / 2 + posY

    ctx.translate(centerX, centerY)
    if (rot !== 0) ctx.rotate((rot * Math.PI) / 180)
    if (userScale !== 1) ctx.scale(userScale, userScale)

    if (source instanceof HTMLVideoElement && layer.cropX !== undefined && layer.cropY !== undefined) {
      const srcX = layer.cropX
      const srcY = layer.cropY
      const srcW = layer.cropW || source.videoWidth || drawW
      const srcH = layer.cropH || source.videoHeight || drawH
      ctx.drawImage(source, srcX, srcY, srcW, srcH, -drawW / 2, -drawH / 2, drawW, drawH)
    } else {
      ctx.drawImage(source, -drawW / 2, -drawH / 2, drawW, drawH)
    }
    ctx.restore()
  }

  private processVideoFrame(
    layer: InternalLayer,
    video: HTMLVideoElement,
    drawX: number,
    drawY: number,
    drawW: number,
    drawH: number
  ) {
    const lCtx = layer.canvas.getContext('2d', { willReadFrequently: true })!

    if (layer.useAiBgRemoval) {
      if (!layer.segmentedCanvas || layer.segmentedCanvas.width !== layer.canvas.width || layer.segmentedCanvas.height !== layer.canvas.height) {
        layer.segmentedCanvas = mkCanvas(layer.canvas.width, layer.canvas.height)
      }

      if (layer.isSegmenting) {
        // While segmentation is in progress, do not clear; keep showing last segmented frame
        return
      }

      const tempCanvas = mkCanvas(layer.canvas.width, layer.canvas.height)
      const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true })!
      this.renderLayerWithFilters(tempCtx, video, drawX, drawY, drawW, drawH, layer)

      layer.isSegmenting = true
      const invertMask = layer.invertAiMask ?? false
      const eShift = layer.edgeShift ?? -10
      const fValue = layer.feathering ?? 20

      import('../lib/selfieSegmentation').then(({ applySelfieSegmentation }) => {
        applySelfieSegmentation(tempCanvas, layer.canvas, eShift, fValue, invertMask).then(() => {
          layer.isSegmenting = false
          this.onCompositeNeeded?.()
        })
      })
    } else {
      lCtx.clearRect(0, 0, layer.canvas.width, layer.canvas.height)
      this.renderLayerWithFilters(lCtx, video, drawX, drawY, drawW, drawH, layer)

      if (layer.removeBg && layer.bgKeyColor) {
        const imgData = lCtx.getImageData(0, 0, layer.canvas.width, layer.canvas.height)
        const rgb = hexToRgb(layer.bgKeyColor)
        if (rgb) {
          chromaKey(imgData.data, rgb, layer.bgThreshold ?? 30)
          lCtx.putImageData(imgData, 0, 0)
        }
      }
    }
  }

  private _make(name: string, w: number, h: number): InternalLayer {
    return { id: genId(), name, visible: true, opacity: 1, blendMode: 'source-over', canvas: mkCanvas(w, h) }
  }

  private _find(id: string) { return this._layers.find(l => l.id === id) }
}
