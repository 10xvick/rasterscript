/**
 * Core Document Data Model
 * 
 * Unifies individual frame pixels (ImageData), high-performance rendering caches (ImageBitmap),
 * Spritesheet tile mappings, and timeline playback pointers into a single coherent model.
 */

export interface FrameBlock {
  id: string
  name: string
  width: number
  height: number
  imageData: ImageData
  imageBitmap: ImageBitmap | null
  duration: number // milliseconds
  dirty: boolean
}

export interface SpritesheetLayout {
  cols: number
  rows: number
  tileWidth: number
  tileHeight: number
  padding: number
  margin: number
  frameMap: number[] // Map tile slot index -> frame index in DocumentModel.frames
}

export interface PlaybackState {
  currentTime: number
  playing: boolean
  fps: number
  selectedIndices: number[] // Tile/frame selection for range loop playback
}

export class DocumentModel {
  public frames: FrameBlock[] = []
  public activeFrameIndex: number = 0
  public spritesheet: SpritesheetLayout = {
    cols: 1,
    rows: 1,
    tileWidth: 0,
    tileHeight: 0,
    padding: 0,
    margin: 0,
    frameMap: [],
  }
  public playback: PlaybackState = {
    currentTime: 0,
    playing: false,
    fps: 10,
    selectedIndices: [],
  }

  private subscribers: Set<() => void> = new Set()

  public subscribe(fn: () => void): () => void {
    this.subscribers.add(fn)
    return () => this.subscribers.delete(fn)
  }

  private notify() {
    this.subscribers.forEach((fn) => fn())
  }

  // ─── Frame Operations ────────────────────────────────────────────────────────

  public async setFrames(framesData: ImageData[], names?: string[]): Promise<void> {
    // Release existing ImageBitmaps
    this.frames.forEach((f) => f.imageBitmap?.close())

    const newFrames: FrameBlock[] = await Promise.all(
      framesData.map(async (imgData, idx) => {
        let bitmap: ImageBitmap | null = null
        try {
          bitmap = await createImageBitmap(imgData)
        } catch (e) {
          console.warn('Failed to create ImageBitmap for frame', idx, e)
        }
        return {
          id: `frame_${Math.random().toString(36).substring(2, 9)}_${Date.now()}_${idx}`,
          name: names?.[idx] || `Frame ${idx + 1}`,
          width: imgData.width,
          height: imgData.height,
          imageData: imgData,
          imageBitmap: bitmap,
          duration: 100,
          dirty: false,
        }
      })
    )

    this.frames = newFrames
    this.activeFrameIndex = 0

    // Auto layout spritesheet
    this.rebuildSpritesheetLayout()
    this.notify()
  }

  public async updateActiveFrameImageData(imageData: ImageData): Promise<void> {
    if (this.activeFrameIndex < 0 || this.activeFrameIndex >= this.frames.length) return

    const currentFrame = this.frames[this.activeFrameIndex]
    currentFrame.imageBitmap?.close()

    let bitmap: ImageBitmap | null = null
    try {
      bitmap = await createImageBitmap(imageData)
    } catch (e) {
      console.warn('Failed to update ImageBitmap', e)
    }

    this.frames[this.activeFrameIndex] = {
      ...currentFrame,
      width: imageData.width,
      height: imageData.height,
      imageData,
      imageBitmap: bitmap,
      dirty: true,
    }

    this.notify()
  }

  public setActiveFrameIndex(index: number) {
    if (index >= 0 && index < this.frames.length) {
      this.activeFrameIndex = index
      this.notify()
    }
  }

  public async addFrame(imageData: ImageData, insertAtIndex?: number): Promise<void> {
    let bitmap: ImageBitmap | null = null
    try {
      bitmap = await createImageBitmap(imageData)
    } catch (e) {
      console.warn('Failed to create ImageBitmap', e)
    }

    const newFrame: FrameBlock = {
      id: `frame_${Math.random().toString(36).substring(2, 9)}_${Date.now()}`,
      name: `Frame ${this.frames.length + 1}`,
      width: imageData.width,
      height: imageData.height,
      imageData,
      imageBitmap: bitmap,
      duration: 100,
      dirty: false,
    }

    const idx = insertAtIndex !== undefined ? insertAtIndex : this.frames.length
    this.frames.splice(idx, 0, newFrame)

    this.rebuildSpritesheetLayout()
    this.setActiveFrameIndex(idx)
  }

  public deleteFrame(index: number) {
    if (this.frames.length <= 1) return // Keep at least one frame
    if (index < 0 || index >= this.frames.length) return

    const [deleted] = this.frames.splice(index, 1)
    deleted.imageBitmap?.close()

    // Adjust active index
    if (this.activeFrameIndex >= this.frames.length) {
      this.activeFrameIndex = Math.max(0, this.frames.length - 1)
    }

    this.rebuildSpritesheetLayout()
    this.notify()
  }

  public async duplicateFrame(index: number): Promise<void> {
    if (index < 0 || index >= this.frames.length) return
    const src = this.frames[index]

    // Deep copy ImageData
    const copyImgData = new ImageData(
      new Uint8ClampedArray(src.imageData.data),
      src.width,
      src.height
    )

    await this.addFrame(copyImgData, index + 1)
  }

  public reorderFrames(fromIndex: number, toIndex: number) {
    if (
      fromIndex < 0 ||
      fromIndex >= this.frames.length ||
      toIndex < 0 ||
      toIndex >= this.frames.length
    ) {
      return
    }

    const [moved] = this.frames.splice(fromIndex, 1)
    this.frames.splice(toIndex, 0, moved)

    // Rebuild tile mapping
    this.rebuildSpritesheetLayout()
    this.notify()
  }

  // ─── Spritesheet Operations ──────────────────────────────────────────────────

  public configureSpritesheetLayout(config: Partial<Omit<SpritesheetLayout, 'frameMap'>>) {
    this.spritesheet = {
      ...this.spritesheet,
      ...config,
    }
    this.rebuildSpritesheetLayout()
    this.notify()
  }

  public rebuildSpritesheetLayout() {
    const frameCount = this.frames.length
    if (frameCount === 0) {
      this.spritesheet.frameMap = []
      return
    }

    // Default tile dimensions based on first frame
    const first = this.frames[0]
    const tileW = this.spritesheet.tileWidth || first.width
    const tileH = this.spritesheet.tileHeight || first.height

    const cols = this.spritesheet.cols || Math.ceil(Math.sqrt(frameCount))
    const rows = Math.ceil(frameCount / cols)

    const frameMap = Array.from({ length: frameCount }, (_, i) => i)

    this.spritesheet = {
      ...this.spritesheet,
      cols,
      rows,
      tileWidth: tileW,
      tileHeight: tileH,
      frameMap,
    }
  }

  public reorderTiles(fromTileSlot: number, toTileSlot: number) {
    const map = [...this.spritesheet.frameMap]
    if (
      fromTileSlot < 0 ||
      fromTileSlot >= map.length ||
      toTileSlot < 0 ||
      toTileSlot >= map.length
    ) {
      return
    }

    const [moved] = map.splice(fromTileSlot, 1)
    map.splice(toTileSlot, 0, moved)

    this.spritesheet.frameMap = map
    this.notify()
  }

  // ─── Playback & Selection ───────────────────────────────────────────────────

  public setSelection(indices: number[]) {
    this.playback.selectedIndices = indices
    this.notify()
  }

  public toggleSelection(index: number, multiSelect: boolean = false) {
    if (!multiSelect) {
      this.playback.selectedIndices = [index]
    } else {
      const existing = new Set(this.playback.selectedIndices)
      if (existing.has(index)) {
        existing.delete(index)
      } else {
        existing.add(index)
      }
      this.playback.selectedIndices = Array.from(existing)
    }
    this.notify()
  }

  public setPlayback(patch: Partial<PlaybackState>) {
    this.playback = { ...this.playback, ...patch }
    this.notify()
  }

  // Helper to compile spritesheet into single ImageData
  public generateFullSpritesheetImageData(): ImageData {
    const { cols, rows, tileWidth, tileHeight, padding, margin, frameMap } = this.spritesheet
    if (frameMap.length === 0 || tileWidth === 0 || tileHeight === 0) {
      return new ImageData(1, 1)
    }

    const totalWidth = margin * 2 + cols * tileWidth + (cols - 1) * padding
    const totalHeight = margin * 2 + rows * tileHeight + (rows - 1) * padding

    const canvas = document.createElement('canvas')
    canvas.width = totalWidth
    canvas.height = totalHeight
    const ctx = canvas.getContext('2d')!

    frameMap.forEach((frameIdx, slotIdx) => {
      const frame = this.frames[frameIdx]
      if (!frame) return

      const col = slotIdx % cols
      const row = Math.floor(slotIdx / cols)
      const x = margin + col * (tileWidth + padding)
      const y = margin + row * (tileHeight + padding)

      if (frame.imageBitmap) {
        ctx.drawImage(frame.imageBitmap, x, y, tileWidth, tileHeight)
      } else {
        const tempCanvas = document.createElement('canvas')
        tempCanvas.width = frame.width
        tempCanvas.height = frame.height
        tempCanvas.getContext('2d')?.putImageData(frame.imageData, 0, 0)
        ctx.drawImage(tempCanvas, x, y, tileWidth, tileHeight)
      }
    })

    return ctx.getImageData(0, 0, totalWidth, totalHeight)
  }
}

export const activeDocument = new DocumentModel()
