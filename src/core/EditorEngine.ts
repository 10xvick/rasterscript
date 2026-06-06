import { HistoryManager } from './HistoryManager'
import { LayerManager } from './LayerManager'
import type { EditorContext, HistoryEntry, LayerInfo } from './types'

export type EngineListener = () => void

/**
 * Pure canvas state machine.
 * Knows nothing about React — the Zustand store subscribes to it.
 * The display canvas (_canvas) is always the composited output of all layers.
 */
export class EditorEngine {
  private _canvas: HTMLCanvasElement
  private _ctx: CanvasRenderingContext2D
  private _layers = new LayerManager()
  private history  = new HistoryManager()
  private listeners = new Set<EngineListener>()

  constructor(canvas: HTMLCanvasElement) {
    this._canvas = canvas
    this._ctx    = canvas.getContext('2d', { willReadFrequently: true })!
  }

  // ─── Public accessors ──────────────────────────────────────────────────────

  get canvas()   { return this._canvas }
  get width()    { return this._canvas.width }
  get height()   { return this._canvas.height }
  get canUndo()  { return this.history.canUndo() }
  get canRedo()  { return this.history.canRedo() }
  get layerInfos(): readonly LayerInfo[] { return this._layers.layers }
  get activeLayerId()                    { return this._layers.activeId }

  // ─── Image I/O ────────────────────────────────────────────────────────────

  loadImage(img: HTMLImageElement | ImageBitmap) {
    const w = img instanceof HTMLImageElement ? img.naturalWidth  : img.width
    const h = img instanceof HTMLImageElement ? img.naturalHeight : img.height
    this._canvas.width  = w
    this._canvas.height = h
    this._ctx.clearRect(0, 0, w, h)
    this._ctx.drawImage(img, 0, 0)
    const data = this._ctx.getImageData(0, 0, w, h)
    this._layers.init(w, h, data, 'Background')
    this._layers.composite(this._canvas)
    this.history.clear()
    this.history.push(this._snapshot('Open'))
    this.emit()
  }

  /** Load raw ImageData as a fresh single-layer document */
  loadImageFromData(data: ImageData, label = 'Load') {
    this._layers.init(data.width, data.height, data, 'Background')
    this._canvas.width  = data.width
    this._canvas.height = data.height
    this._layers.composite(this._canvas)
    this.history.clear()
    this.history.push(this._snapshot(label))
    this.emit()
  }

  loadBlank(width: number, height: number, fill = '#ffffff') {
    const tmp = document.createElement('canvas')
    tmp.width = width; tmp.height = height
    const tc = tmp.getContext('2d')!
    tc.fillStyle = fill
    tc.fillRect(0, 0, width, height)
    this.loadImageFromData(tc.getImageData(0, 0, width, height), 'New')
  }

  // ─── ImageData helpers ────────────────────────────────────────────────────

  /** Returns the current composite as ImageData */
  getImageData(): ImageData {
    return this._ctx.getImageData(0, 0, this._canvas.width, this._canvas.height)
  }

  /**
   * Replaces the entire document with new data (flattens all layers).
   * Used by crop/resize/filter/script plugins.
   */
  setImageData(data: ImageData, pushHistory = true, label = 'Edit') {
    this._layers.flatten(data)
    this._canvas.width  = data.width
    this._canvas.height = data.height
    this._layers.composite(this._canvas)
    if (pushHistory) this.history.push(this._snapshot(label))
    this.emit()
  }

  /** Composite layers to display canvas and push a history snapshot */
  pushHistory(label: string) {
    this._layers.composite(this._canvas)
    this.history.push(this._snapshot(label))
    this.emit()
  }

  /** Composite layers to display canvas without pushing history */
  composite() {
    this._layers.composite(this._canvas)
    this.emit()
  }

  // ─── History ──────────────────────────────────────────────────────────────

  undo() {
    const entry = this.history.undo()
    if (entry) this._restore(entry)
  }

  redo() {
    const entry = this.history.redo()
    if (entry) this._restore(entry)
  }

  // ─── Layer management API ─────────────────────────────────────────────────

  addLayer(name?: string)                              { this._layers.addLayer(name);                     this._layers.composite(this._canvas); this.history.push(this._snapshot('Add Layer'));    this.emit() }
  deleteLayer(id: string)                              { this._layers.deleteLayer(id);                    this._layers.composite(this._canvas); this.history.push(this._snapshot('Delete Layer')); this.emit() }
  setActiveLayer(id: string)                           { this._layers.setActive(id);                                                                                                               this.emit() }
  moveLayer(id: string, dir: 1 | -1)                  { this._layers.move(id, dir);                      this._layers.composite(this._canvas); this.history.push(this._snapshot('Reorder'));      this.emit() }
  setLayerVisible(id: string, v: boolean)              { this._layers.setVisible(id, v);                  this._layers.composite(this._canvas);                                                    this.emit() }
  setLayerOpacity(id: string, v: number)               { this._layers.setOpacity(id, v);                  this._layers.composite(this._canvas);                                                    this.emit() }
  setLayerBlendMode(id: string, m: GlobalCompositeOperation) { this._layers.setBlendMode(id, m);          this._layers.composite(this._canvas); this.history.push(this._snapshot('Blend Mode'));  this.emit() }
  renameLayer(id: string, name: string)                { this._layers.rename(id, name);                                                                                                           this.emit() }
  pushLayerHistory(label: string)                      {                                                  this._layers.composite(this._canvas); this.history.push(this._snapshot(label));          this.emit() }

  mergeDown() {
    if (this._layers.mergeDown()) {
      this._layers.composite(this._canvas)
      this.history.push(this._snapshot('Merge Down'))
      this.emit()
    }
  }

  flattenAll() {
    const data = this._ctx.getImageData(0, 0, this._canvas.width, this._canvas.height)
    this._layers.flatten(data)
    this._layers.composite(this._canvas)
    this.history.push(this._snapshot('Flatten'))
    this.emit()
  }

  cropDocument(x: number, y: number, w: number, h: number) {
    this._layers.crop(x, y, w, h)
    this._canvas.width  = w
    this._canvas.height = h
    this._layers.composite(this._canvas)
    this.history.push(this._snapshot('Crop'))
    this.emit()
  }

  pasteAsLayer(data: ImageData, x: number, y: number, name = 'Pasted') {
    this._layers.addLayerAt(data, x, y, name)
    this._layers.composite(this._canvas)
    this.history.push(this._snapshot('Paste'))
    this.emit()
  }

  importImageAsLayer(data: ImageData, name?: string) {
    this._layers.addImageLayer(data, name)
    this._canvas.width  = this._layers.width
    this._canvas.height = this._layers.height
    this._layers.composite(this._canvas)
    this.history.push(this._snapshot('Import Layer'))
    this.emit()
  }

  // ─── Context factory ──────────────────────────────────────────────────────

  getContext(): EditorContext {
    return {
      canvas:            this._canvas,
      getImageData:      () => this.getImageData(),
      setImageData:      (data, push = true) => this.setImageData(data, push),
      pushHistory:       (label) => this.pushHistory(label),
      getWidth:          () => this._canvas.width,
      getHeight:         () => this._canvas.height,
      getActiveLayerCtx: () => this._layers.getActiveCanvas()?.getContext('2d', { willReadFrequently: true }) ?? null,
      compositeToCanvas: () => this._layers.composite(this._canvas),
      cropDocument:      (x, y, w, h) => this.cropDocument(x, y, w, h),
      pasteAsLayer:      (data, x, y, name) => this.pasteAsLayer(data, x, y, name),
    }
  }

  // ─── Canvas reattachment ──────────────────────────────────────────────────

  reattach(canvas: HTMLCanvasElement) {
    this._canvas = canvas
    this._ctx    = canvas.getContext('2d', { willReadFrequently: true })!
    this._canvas.width  = this._layers.width  || 1
    this._canvas.height = this._layers.height || 1
    this._layers.composite(this._canvas)
  }

  // ─── Reactivity ───────────────────────────────────────────────────────────

  subscribe(fn: EngineListener) {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private emit() {
    this.listeners.forEach(fn => fn())
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private _snapshot(label: string): HistoryEntry {
    return { label, snapshot: this._layers.snapshot() }
  }

  private _restore(entry: HistoryEntry) {
    this._layers.restore(entry.snapshot)
    this._canvas.width  = this._layers.width
    this._canvas.height = this._layers.height
    this._layers.composite(this._canvas)
    this.emit()
  }
}
