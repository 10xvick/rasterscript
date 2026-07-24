import { useState, useEffect, useRef, useLayoutEffect, useCallback } from 'react'
import { Loader2 } from 'lucide-react'
import type { PluginPanelProps } from '../../core/types'
import { useSpriteStore } from './useSpriteStore'
import { useLayout, findWidgetTab } from '../../components/layout/LayoutEngine'
import { downloadCanvas } from '../../lib/download'
import { useEditorStore } from '../../store/useEditorStore'
import {
  previewStaticSpritesheet,
  compileSpritesheet,
  exportToAnimation,
  type SpritesheetParams,
} from './operations'
import { useMediaDropzone } from '../../hooks/useMediaDropzone'

/**
 * Spritesheet Generator — sidebar panel.
 *
 * UI concerns only. All heavy processing delegated to `operations.ts`.
 * State lives in `useSpriteStore` — never touches the global editor store
 * except to read `activeLayerId` / `layerInfos` for "Load Active Layer".
 */
export function SpritesheetPanel({ context }: PluginPanelProps) {
  const { layout, dispatch } = useLayout()
  const {
    file, loadingFile, processing, statusText, ffmpegLogs,
    originalWidth, originalHeight, duration,
    frameWidth, frameHeight, fps, startTime, endTime, maxFrames, columns, padding,
    removeBg, bgKeyColor, bgThreshold, compiledCanvas, numCompiledFrames, previewing,
    setSpritesheet, resetSpritesheet: _reset,
  } = useSpriteStore()

  const activeLayerId = useEditorStore(s => s.activeLayerId)
  const layerInfos    = useEditorStore(s => s.layerInfos)

  const [exportFormat, setExportFormat] = useState<'gif' | 'mp4'>('gif')

  const isStaticImage = file && !file.type.startsWith('video/') && file.type !== 'image/gif' && !file.name.endsWith('.gif')

  // ─── Logging helper ──────────────────────────────────────────────────────
  const logMessage = (msg: string) =>
    setSpritesheet(prev => ({ ffmpegLogs: [...prev.ffmpegLogs.slice(-30), msg] }))

  // ─── Build params object ─────────────────────────────────────────────────
  const buildParams = (): SpritesheetParams | null => {
    if (!file) return null
    return {
      file, frameWidth, frameHeight, fps, startTime, endTime, maxFrames,
      columns, padding, removeBg, bgKeyColor, bgThreshold, duration,
      originalWidth, originalHeight,
    }
  }

  // ─── File loading ────────────────────────────────────────────────────────
  const loadFile = (selected: File, isFromActive = false) => {
    setSpritesheet({
      file: selected,
      isFromActiveLayer: isFromActive,
      loadingFile: true,
      compiledCanvas: null,
      numCompiledFrames: 0,
      startTime: 0,
    })

    const url = URL.createObjectURL(selected)
    if (selected.type.startsWith('video/')) {
      const video = document.createElement('video')
      video.src = url
      video.onloadedmetadata = () => {
        setSpritesheet({
          originalWidth: video.videoWidth, originalHeight: video.videoHeight,
          frameWidth: video.videoWidth, frameHeight: video.videoHeight,
          duration: video.duration, endTime: video.duration,
          loadingFile: false,
        })
        URL.revokeObjectURL(url)
      }
    } else {
      const img = new Image()
      img.onload = () => {
        setSpritesheet({
          originalWidth: img.naturalWidth, originalHeight: img.naturalHeight,
          frameWidth: img.naturalWidth, frameHeight: img.naturalHeight,
          duration: 0, endTime: 0, loadingFile: false,
        })
        URL.revokeObjectURL(url)
      }
      img.src = url
    }
  }

  // ─── Drag-and-drop + paste (shared hook) ───────────────────────────────
  const handleFile = useCallback((f: File) => {
    if (!processing && !loadingFile) loadFile(f)
  }, [processing, loadingFile]) // eslint-disable-line react-hooks/exhaustive-deps

  const { over, pasteFromClipboard, dropProps } = useMediaDropzone({
    onFile:   handleFile,
    disabled: processing || loadingFile,
  })

  // ─── Clipboard paste button ──────────────────────────────────────────────
  const handlePasteFromClipboard = pasteFromClipboard

  // ─── Load active layer ───────────────────────────────────────────────────
  const loadActiveLayer = () => {
    if (processing || loadingFile) return
    const layerCtx = context.getActiveLayerCtx()
    if (!layerCtx) return alert('No active layer found in the workspace.')
    const canvas = layerCtx.canvas
    if (canvas.width === 0 || canvas.height === 0) return alert('Active layer canvas is empty.')
    canvas.toBlob(blob => {
      if (!blob) return
      const layer = layerInfos.find(l => l.id === activeLayerId)
      const name  = layer ? layer.name : 'workspace_layer'
      loadFile(new File([blob], `${name}.png`, { type: 'image/png' }), true)
    }, 'image/png')
  }

  // ─── Actions ─────────────────────────────────────────────────────────────
  const handlePreviewStatic = async () => {
    const params = buildParams()
    if (!params) return
    setSpritesheet({ processing: true, ffmpegLogs: [], compiledCanvas: null, numCompiledFrames: 0 })
    try {
      const { canvas, numFrames } = await previewStaticSpritesheet(
        params,
        msg => setSpritesheet({ statusText: msg }),
      )
      setSpritesheet({ compiledCanvas: canvas, numCompiledFrames: numFrames, currentFrame: 0, previewing: true })
      handleOpenLargePreview()
    } catch (err) {
      alert(`Error loading spritesheet: ${err instanceof Error ? err.message : err}`)
      setSpritesheet({ statusText: 'Failed to load.' })
    } finally {
      setSpritesheet({ processing: false })
    }
  }

  const handleCompile = async () => {
    const params = buildParams()
    if (!params) return
    setSpritesheet({ processing: true, ffmpegLogs: [], compiledCanvas: null, numCompiledFrames: 0, statusText: '' })
    try {
      const { canvas, numFrames } = await compileSpritesheet(
        params,
        msg => setSpritesheet({ statusText: msg }),
        logMessage,
      )
      setSpritesheet({ compiledCanvas: canvas, numCompiledFrames: numFrames, currentFrame: 0, previewing: true })
    } catch (err) {
      alert(`Error generating sprite sheet: ${err instanceof Error ? err.message : err}`)
      setSpritesheet({ statusText: 'Failed to compile.' })
    } finally {
      setSpritesheet({ processing: false })
    }
  }

  const handleExport = async (format: 'gif' | 'mp4') => {
    const params = buildParams()
    if (!params) return
    setSpritesheet({ processing: true, ffmpegLogs: [] })
    try {
      await exportToAnimation(
        params, format,
        msg => setSpritesheet({ statusText: msg }),
        logMessage,
      )
    } catch (err) {
      alert(`Error converting spritesheet: ${err instanceof Error ? err.message : err}`)
      setSpritesheet({ statusText: 'Failed to compile.' })
    } finally {
      setSpritesheet({ processing: false })
    }
  }

  // ─── Output helpers ──────────────────────────────────────────────────────
  const addAsLayer = () => {
    if (!compiledCanvas) return
    const data = compiledCanvas.getContext('2d')!.getImageData(0, 0, compiledCanvas.width, compiledCanvas.height)
    context.pasteAsLayer(data, 0, 0, `Spritesheet (${file?.name})`)
    useEditorStore.getState().setHasImage(true)
    alert('Added sprite sheet as a new layer!')
  }

  const createNewDoc = () => {
    if (!compiledCanvas) return
    const data = compiledCanvas.getContext('2d')!.getImageData(0, 0, compiledCanvas.width, compiledCanvas.height)
    context.setImageData(data, true)
    useEditorStore.getState().setHasImage(true)
    alert('Replaced canvas with the generated sprite sheet!')
  }

  const handleDownloadPng = () => {
    if (!compiledCanvas) return
    downloadCanvas(compiledCanvas, `${file?.name.replace(/\.[^.]+$/, '')}_spritesheet.png`)
  }

  // ─── Layout: open large preview ──────────────────────────────────────────
  const handleOpenLargePreview = () => {
    const existing = findWidgetTab(layout, 'spritesheet_preview')
    if (existing) {
      dispatch({ type: 'SET_ACTIVE_TAB', areaId: existing.areaId, tabIndex: existing.tabIndex })
    } else {
      dispatch({ type: 'ADD_TAB', areaId: 'canvas-panel', widgetId: 'spritesheet_preview' })
    }
  }

  // ─── Local sidebar animation loop ────────────────────────────────────────
  useEffect(() => {
    if (!compiledCanvas || numCompiledFrames <= 0 || !previewing) return
    let active = true
    let timer: ReturnType<typeof setTimeout> | null = null
    const step = () => {
      if (!active) return
      setSpritesheet(prev => ({ currentFrame: (prev.currentFrame + 1) % numCompiledFrames }))
      timer = setTimeout(step, 1000 / fps)
    }
    timer = setTimeout(step, 1000 / fps)
    return () => { active = false; if (timer) clearTimeout(timer) }
  }, [compiledCanvas, numCompiledFrames, previewing, fps, setSpritesheet])

  // ─── Sidebar frame preview draw ──────────────────────────────────────────
  useEffect(() => {
    if (!compiledCanvas || numCompiledFrames <= 0) return
    const canvas = document.getElementById('spritesheet-preview-canvas') as HTMLCanvasElement | null
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width  = frameWidth
    canvas.height = frameHeight
    const { currentFrame: frameIdx } = useSpriteStore.getState()
    const col = frameIdx % columns
    const row = Math.floor(frameIdx / columns)
    ctx.clearRect(0, 0, frameWidth, frameHeight)
    ctx.drawImage(compiledCanvas, col * (frameWidth + padding), row * (frameHeight + padding), frameWidth, frameHeight, 0, 0, frameWidth, frameHeight)
  }, [compiledCanvas, numCompiledFrames, useSpriteStore.getState().currentFrame, frameWidth, frameHeight, columns, padding]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Style helpers ────────────────────────────────────────────────────────
  const sl  = 'w-full accent-violet-500 h-1.5'
  const lbl = 'text-xs text-neutral-400 flex justify-between mb-1'
  const inp = 'w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-xs text-neutral-200 focus:outline-none focus:border-violet-500'

  return (
    <div className="p-3 space-y-4 text-xs h-full flex flex-col justify-between overflow-y-auto">
      <div className="space-y-4">
        <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-medium">Sprite Sheet Generator</p>

        {/* File loader drop zone */}
        <div
          {...dropProps}
          className={`border border-dashed rounded p-4 text-center transition-colors ${over ? 'border-violet-400 bg-violet-950/20' : 'border-neutral-700 bg-neutral-900/50'}`}
        >
          <input
            type="file" accept="video/*,image/*"
            onChange={e => { const f = e.target.files?.[0]; if (f) loadFile(f) }}
            className="hidden" id="spritesheet-file-input"
            disabled={processing || loadingFile}
          />
          <label htmlFor="spritesheet-file-input" className="cursor-pointer text-violet-400 hover:text-violet-300 font-medium block">
            {file ? `File: ${file.name}` : 'Click to upload Video or Image'}
          </label>
          <div className="text-[10px] text-neutral-500 mt-0.5">or drop files here</div>

          <div className="flex flex-col gap-2 mt-3.5">
            <div className="flex justify-center gap-1.5">
              <button
                onClick={handlePasteFromClipboard} disabled={processing || loadingFile}
                className="px-2.5 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-[10px] text-neutral-300 border border-neutral-700 transition-colors flex-1"
              >Paste Clipboard</button>
              <button
                onClick={loadActiveLayer} disabled={processing || loadingFile}
                className="px-2.5 py-1 rounded bg-violet-900/35 hover:bg-violet-900/50 text-[10px] text-violet-300 border border-violet-850 transition-colors flex-1"
              >Load Active Layer</button>
            </div>
          </div>
          <div className="text-[9px] text-neutral-600 mt-2">Supports MP4, GIF, PNG, JPG, WebM</div>
        </div>

        {loadingFile && (
          <div className="flex items-center gap-2 text-violet-400">
            <Loader2 className="animate-spin" size={14} />
            <span>Analyzing file metadata...</span>
          </div>
        )}

        {file && !loadingFile && (
          <div className="space-y-3">
            {/* Dimensions */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-neutral-500 uppercase">Frame Width</label>
                <input type="number" value={frameWidth} min={8} onChange={e => setSpritesheet({ frameWidth: Math.max(8, +e.target.value) })} className={inp} />
              </div>
              <div>
                <label className="text-[10px] text-neutral-500 uppercase">Frame Height</label>
                <input type="number" value={frameHeight} min={8} onChange={e => setSpritesheet({ frameHeight: Math.max(8, +e.target.value) })} className={inp} />
              </div>
            </div>

            {/* Video range (only for video/gif files) */}
            {duration > 0 && !isStaticImage && (
              <div className="space-y-2 border-t border-neutral-800 pt-3">
                <div className="flex justify-between text-[10px] text-neutral-500 uppercase">
                  <span>Range Settings</span>
                  <span>Duration: {duration.toFixed(1)}s</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[9px] text-neutral-500">Start Time (s)</label>
                    <input type="number" step="0.1" min={0} max={endTime} value={startTime} onChange={e => setSpritesheet({ startTime: Math.max(0, +e.target.value) })} className={inp} />
                  </div>
                  <div>
                    <label className="text-[9px] text-neutral-500">End Time (s)</label>
                    <input type="number" step="0.1" min={startTime} max={duration} value={endTime} onChange={e => setSpritesheet({ endTime: Math.min(duration, +e.target.value) })} className={inp} />
                  </div>
                </div>
              </div>
            )}

            {/* Sample FPS */}
            <div>
              <div className={lbl}><span>Sample Rate (FPS)</span><span>{fps} fps</span></div>
              <input type="range" min={1} max={30} value={fps} onChange={e => setSpritesheet({ fps: +e.target.value })} className={sl} />
            </div>

            {/* Grid limits */}
            <div className="grid grid-cols-2 gap-2 border-t border-neutral-800 pt-3">
              <div>
                <label className="text-[10px] text-neutral-500 uppercase">Max Frames</label>
                <input type="number" min={2} max={256} value={maxFrames} onChange={e => setSpritesheet({ maxFrames: Math.max(2, Math.min(256, +e.target.value)) })} className={inp} />
              </div>
              <div>
                <label className="text-[10px] text-neutral-500 uppercase">Columns</label>
                <input type="number" min={1} max={32} value={columns} onChange={e => setSpritesheet({ columns: Math.max(1, Math.min(32, +e.target.value)) })} className={inp} />
              </div>
            </div>

            {/* Padding */}
            <div>
              <div className={lbl}><span>Spacing / Padding</span><span>{padding}px</span></div>
              <input type="range" min={0} max={20} value={padding} onChange={e => setSpritesheet({ padding: +e.target.value })} className={sl} />
            </div>

            {/* Chroma key */}
            <div className="border-t border-neutral-800 pt-3 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer select-none text-neutral-300">
                <input
                  type="checkbox" checked={removeBg}
                  onChange={e => setSpritesheet({ removeBg: e.target.checked })}
                  className="rounded border-neutral-700 bg-neutral-800 text-violet-600 focus:ring-violet-500"
                />
                <span>Remove Background Color</span>
              </label>
              {removeBg && (
                <div className="space-y-2 pl-5">
                  <div className="flex items-center gap-2">
                    <input type="color" value={bgKeyColor} onChange={e => setSpritesheet({ bgKeyColor: e.target.value })} className="w-6 h-6 rounded cursor-pointer border border-neutral-600 bg-transparent flex-none p-0.5" />
                    <input value={bgKeyColor} onChange={e => setSpritesheet({ bgKeyColor: e.target.value })} className="flex-1 bg-neutral-800 border border-neutral-700 rounded px-1.5 py-0.5 font-mono text-neutral-300 focus:outline-none" />
                  </div>
                  <div>
                    <div className={lbl}><span>Color Similarity Tolerance</span><span>{bgThreshold}</span></div>
                    <input type="range" min={5} max={150} value={bgThreshold} onChange={e => setSpritesheet({ bgThreshold: +e.target.value })} className={sl} />
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            {isStaticImage ? (
              <div className="border-t border-neutral-800 pt-3 space-y-2">
                <p className="text-[10px] text-neutral-500 uppercase tracking-wider font-semibold">Spritesheet Actions</p>
                <button onClick={handlePreviewStatic} disabled={processing} className="w-full py-2 rounded bg-violet-600 hover:bg-violet-500 text-white font-medium transition-colors flex items-center justify-center gap-2">
                  Preview Spritesheet Animation
                </button>
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center gap-2">
                    <span className="text-neutral-500 uppercase text-[10px] shrink-0">Export Format</span>
                    <select
                      value={exportFormat} onChange={e => setExportFormat(e.target.value as 'gif' | 'mp4')}
                      className="flex-1 bg-neutral-850 border border-neutral-700 rounded px-2 py-1 text-xs text-neutral-200 focus:outline-none"
                    >
                      <option value="gif">GIF (.gif)</option>
                      <option value="mp4">Video (.mp4)</option>
                    </select>
                  </div>
                  <button
                    onClick={() => handleExport(exportFormat)} disabled={processing}
                    className="w-full py-2 rounded bg-neutral-800 hover:bg-neutral-750 text-neutral-200 border border-neutral-750 font-medium transition-colors flex items-center justify-center gap-2 disabled:text-neutral-500"
                  >
                    {processing && <Loader2 className="animate-spin" size={14} />}
                    Compile to Video/GIF
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={handleCompile} disabled={processing}
                className="w-full mt-2 py-2 rounded bg-violet-600 hover:bg-violet-500 text-white font-medium transition-colors flex items-center justify-center gap-2 disabled:bg-neutral-800 disabled:text-neutral-500"
              >
                {processing && <Loader2 className="animate-spin" size={14} />}
                Compile Sprite Sheet
              </button>
            )}
          </div>
        )}

        {/* FFmpeg log */}
        {processing && (
          <div className="bg-neutral-950 p-2.5 rounded border border-neutral-800 space-y-2">
            <div className="text-violet-400 font-medium flex items-center gap-1.5">
              <Loader2 className="animate-spin" size={12} /> {statusText}
            </div>
            {ffmpegLogs.length > 0 && (
              <div className="max-h-24 overflow-y-auto font-mono text-[9px] text-neutral-500 leading-tight space-y-0.5 select-text">
                {ffmpegLogs.map((log, i) => <div key={i} className="truncate">{log}</div>)}
              </div>
            )}
          </div>
        )}

        {/* Sidebar mini-preview */}
        {compiledCanvas && !processing && (
          <div className="border border-neutral-800 rounded p-2.5 bg-neutral-950/40 space-y-2">
            <div className="flex justify-between items-center text-[10px] text-neutral-400 uppercase tracking-wider font-semibold">
              <span>Animation Preview</span>
              <button
                onClick={e => { e.stopPropagation(); setSpritesheet({ previewing: !previewing }) }}
                className="px-2 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[9px] transition-colors"
              >
                {previewing ? 'Pause' : 'Play'}
              </button>
            </div>
            <div
              onClick={handleOpenLargePreview}
              className="flex justify-center bg-neutral-900 border border-neutral-800 rounded p-4 relative overflow-hidden group cursor-pointer hover:border-violet-500/50 transition-colors"
              title="Click to open large preview panel"
            >
              <canvas id="spritesheet-preview-canvas" className="max-h-32 object-contain" style={{ imageRendering: 'pixelated' }} />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                <span className="text-[10px] text-violet-300 bg-neutral-950/80 px-2.5 py-1.5 rounded border border-neutral-800 font-medium">Click to Expand Preview</span>
              </div>
            </div>
          </div>
        )}

        {/* Output options */}
        {compiledCanvas && !processing && (
          <div className="border-t border-neutral-800 pt-3 space-y-2">
            <p className="text-[10px] text-neutral-400 uppercase tracking-wider font-semibold">Output Options</p>
            <div className="grid grid-cols-2 gap-1.5">
              <button onClick={addAsLayer} className="py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-750 transition-colors">Add as Layer</button>
              <button onClick={createNewDoc} className="py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-750 transition-colors">New Document</button>
            </div>
            <button onClick={handleDownloadPng} className="w-full py-1.5 rounded bg-violet-600 hover:bg-violet-500 text-white transition-colors">Download PNG</button>
          </div>
        )}
      </div>

      <p className="text-[10px] text-neutral-600 leading-tight border-t border-neutral-850 pt-2.5">
        Powered by WebAssembly FFmpeg. Extract high-fidelity frames locally in-browser without uploading content to a server.
      </p>
    </div>
  )
}
