/* eslint-disable react-refresh/only-export-components */
import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import {
  Grid,
  Loader2,
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Sparkles
} from 'lucide-react'
import type { EditorPlugin, PluginPanelProps } from '../../core/types'
import { useEditorStore } from '../../store/useEditorStore'
import { useLayout, findWidgetTab } from '../../components/layout/LayoutEngine'
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'

// ─── Global FFmpeg Singleton Loading ──────────────────────────────────────────

let ffmpegInstance: FFmpeg | null = null
let loadPromise: Promise<FFmpeg> | null = null

async function getFFmpeg(onLog?: (msg: string) => void): Promise<FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance
  if (loadPromise) return loadPromise

  loadPromise = (async () => {
    const ffmpeg = new FFmpeg()
    if (onLog) {
      ffmpeg.on('log', ({ message }) => onLog(message))
    }
    const base = window.location.origin + '/tools/image/rasterscript/ffmpeg'
    await ffmpeg.load({
      coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
    })
    ffmpegInstance = ffmpeg
    return ffmpeg
  })()

  return loadPromise
}

// Helper to convert hex to RGB
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return { r, g, b }
}

// ─── Spritesheet Panel (Sidebar properties) ───────────────────────────────────

function SpritesheetPanel({ context }: PluginPanelProps) {
  const { layout, dispatch } = useLayout()
  const spritesheet = useEditorStore(state => state.spritesheet)
  const setSpritesheet = useEditorStore(state => state.setSpritesheet)

  const {
    file, loadingFile, processing, statusText, ffmpegLogs,
    originalWidth, originalHeight, duration,
    frameWidth, frameHeight, fps, startTime, endTime, maxFrames, columns, padding,
    removeBg, bgKeyColor, bgThreshold, compiledCanvas, numCompiledFrames, previewing
  } = spritesheet

  // Setter mapping
  const setFile = (val: File | null) => setSpritesheet({ file: val })
  const setLoadingFile = (val: boolean) => setSpritesheet({ loadingFile: val })
  const setProcessing = (val: boolean) => setProcessingInternal(val)
  const setStatusText = (val: string) => setSpritesheet({ statusText: val })
  const setOriginalWidth = (val: number) => setSpritesheet({ originalWidth: val })
  const setOriginalHeight = (val: number) => setSpritesheet({ originalHeight: val })
  const setDuration = (val: number) => setSpritesheet({ duration: val })
  
  const setFrameWidth = (val: number) => setSpritesheet({ frameWidth: val })
  const setFrameHeight = (val: number) => setSpritesheet({ frameHeight: val })
  const setFps = (val: number) => setSpritesheet({ fps: val })
  const setStartTime = (val: number) => setSpritesheet({ startTime: val })
  const setEndTime = (val: number) => setSpritesheet({ endTime: val })
  const setMaxFrames = (val: number) => setSpritesheet({ maxFrames: val })
  const setColumns = (val: number) => setSpritesheet({ columns: val })
  const setPadding = (val: number) => setSpritesheet({ padding: val })
  
  const setRemoveBg = (val: boolean) => setSpritesheet({ removeBg: val })
  const setBgKeyColor = (val: string) => setSpritesheet({ bgKeyColor: val })
  const setBgThreshold = (val: number) => setSpritesheet({ bgThreshold: val })
  
  const setCompiledCanvas = (val: HTMLCanvasElement | null) => setSpritesheet({ compiledCanvas: val })
  const setNumCompiledFrames = (val: number) => setSpritesheet({ numCompiledFrames: val })
  const setPreviewing = (val: boolean) => setSpritesheet({ previewing: val })

  const setProcessingInternal = (val: boolean) => {
    setSpritesheet({ processing: val })
  }

  const setFfmpegLogs = (val: string[] | ((prev: string[]) => string[])) => {
    setSpritesheet(prev => ({
      ffmpegLogs: typeof val === 'function' ? val(prev.ffmpegLogs) : val
    }))
  }

  // Local drag state & format state
  const [over, setOver] = useState(false)
  const [exportFormat, setExportFormat] = useState<'gif' | 'mp4'>('gif')

  const isStaticImage = file && !file.type.startsWith('video/') && file.type !== 'image/gif' && !file.name.endsWith('.gif')

  // Track file metadata on load
  const loadFile = (selected: File) => {
    setFile(selected)
    setLoadingFile(true)
    setCompiledCanvas(null)
    setNumCompiledFrames(0)
    setStartTime(0)

    const url = URL.createObjectURL(selected)
    if (selected.type.startsWith('video/')) {
      const video = document.createElement('video')
      video.src = url
      video.onloadedmetadata = () => {
        setOriginalWidth(video.videoWidth)
        setOriginalHeight(video.videoHeight)
        setFrameWidth(video.videoWidth)
        setFrameHeight(video.videoHeight)
        setDuration(video.duration)
        setEndTime(video.duration)
        setLoadingFile(false)
        URL.revokeObjectURL(url)
      }
    } else {
      // GIF or static image
      const img = new Image()
      img.onload = () => {
        setOriginalWidth(img.naturalWidth)
        setOriginalHeight(img.naturalHeight)
        setFrameWidth(img.naturalWidth)
        setFrameHeight(img.naturalHeight)
        setDuration(0)
        setEndTime(0)
        setLoadingFile(false)
        URL.revokeObjectURL(url)
      }
      img.src = url
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0]
    if (selected) loadFile(selected)
  }

  // Drag and drop handlers
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!processing && !loadingFile) setOver(true)
  }

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setOver(false)
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setOver(false)
    if (processing || loadingFile) return

    const droppedFile = e.dataTransfer.files?.[0]
    if (droppedFile) {
      loadFile(droppedFile)
    }
  }

  // Copy paste handlers
  const handlePasteFromClipboard = async () => {
    if (processing || loadingFile) return
    try {
      const items = await navigator.clipboard.read()
      for (const item of items) {
        for (const type of item.types) {
          if (type.startsWith('video/') || type.startsWith('image/')) {
            const blob = await item.getType(type)
            const ext = type.split('/')[1] || 'png'
            const fileObj = new File([blob], `pasted_media.${ext}`, { type })
            loadFile(fileObj)
            return
          }
        }
      }
      alert('Clipboard does not contain a copied Video or Image.')
    } catch {
      alert('Failed to read from clipboard. Try focusing the page and pressing Ctrl+V!')
    }
  }

  // Load from workspace active layer
  const loadActiveLayer = () => {
    if (processing || loadingFile) return
    const ctx = context.getActiveLayerCtx()
    if (!ctx) {
      alert('No active layer found in the workspace.')
      return
    }
    const canvas = ctx.canvas
    if (canvas.width === 0 || canvas.height === 0) {
      alert('Active layer canvas is empty.')
      return
    }

    canvas.toBlob((blob) => {
      if (!blob) return
      const activeLayerId = useEditorStore.getState().activeLayerId
      const layerInfos = useEditorStore.getState().layerInfos
      const layer = layerInfos.find(l => l.id === activeLayerId)
      const name = layer ? layer.name : 'workspace_layer'
      const loadedFile = new File([blob], `${name}.png`, { type: 'image/png' })
      loadFile(loadedFile)
    }, 'image/png')
  }

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (processing || loadingFile) return
      const items = e.clipboardData?.items
      if (!items) return
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        if (item.kind === 'file') {
          const fileObj = item.getAsFile()
          if (fileObj) {
            loadFile(fileObj)
            break
          }
        }
      }
    }
    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processing, loadingFile])

  const logMessage = (msg: string) => {
    setFfmpegLogs(prev => [...prev.slice(-30), msg])
  }

  // Slices & Previews static spritesheet images directly
  const previewStaticSpritesheet = async () => {
    if (!file) return

    setProcessing(true)
    setStatusText('Loading spritesheet image...')
    setCompiledCanvas(null)
    setNumCompiledFrames(0)

    try {
      const url = URL.createObjectURL(file)
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image()
        i.onload = () => resolve(i)
        i.onerror = reject
        i.src = url
      })
      URL.revokeObjectURL(url)

      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0)

      // Apply Chroma Keying if enabled
      if (removeBg) {
        const rgbKey = hexToRgb(bgKeyColor)
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const dataArr = imgData.data
        for (let i = 0; i < dataArr.length; i += 4) {
          const r = dataArr[i]
          const g = dataArr[i + 1]
          const b = dataArr[i + 2]
          
          const diff = Math.sqrt(
            Math.pow(r - rgbKey.r, 2) +
            Math.pow(g - rgbKey.g, 2) +
            Math.pow(b - rgbKey.b, 2)
          )
          
          if (diff < bgThreshold) {
            dataArr[i + 3] = 0
          }
        }
        ctx.putImageData(imgData, 0, 0)
      }

      const cols = Math.floor((img.naturalWidth + padding) / (frameWidth + padding))
      const rows = Math.floor((img.naturalHeight + padding) / (frameHeight + padding))
      const totalFrames = Math.min(maxFrames, cols * rows)

      if (totalFrames <= 0) {
        throw new Error('Frame Width/Height exceeds image dimensions or is zero.')
      }

      setCompiledCanvas(canvas)
      setNumCompiledFrames(totalFrames)
      setSpritesheet({ currentFrame: 0, previewing: true })
      setStatusText('Loaded static spritesheet animation!')
      handleOpenLargePreview()
    } catch (err: unknown) {
      console.error(err)
      const errorMsg = err instanceof Error ? err.message : String(err)
      alert(`Error loading spritesheet: ${errorMsg}`)
      setStatusText('Failed to load.')
    } finally {
      setProcessing(false)
    }
  }

  // Slice spritesheet frames & compile back to GIF or MP4
  const exportToAnimation = async (format: 'gif' | 'mp4') => {
    if (!file) return

    setProcessing(true)
    setFfmpegLogs([])
    setStatusText('Loading WebAssembly compiler...')

    try {
      const url = URL.createObjectURL(file)
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image()
        i.onload = () => resolve(i)
        i.onerror = reject
        i.src = url
      })
      URL.revokeObjectURL(url)

      const sourceCanvas = document.createElement('canvas')
      sourceCanvas.width = img.naturalWidth
      sourceCanvas.height = img.naturalHeight
      const sCtx = sourceCanvas.getContext('2d')!
      sCtx.drawImage(img, 0, 0)

      if (removeBg) {
        const rgbKey = hexToRgb(bgKeyColor)
        const imgData = sCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height)
        const dataArr = imgData.data
        for (let i = 0; i < dataArr.length; i += 4) {
          const r = dataArr[i]
          const g = dataArr[i + 1]
          const b = dataArr[i + 2]
          const diff = Math.sqrt(
            Math.pow(r - rgbKey.r, 2) +
            Math.pow(g - rgbKey.g, 2) +
            Math.pow(b - rgbKey.b, 2)
          )
          if (diff < bgThreshold) dataArr[i + 3] = 0
        }
        sCtx.putImageData(imgData, 0, 0)
      }

      const cols = Math.floor((img.naturalWidth + padding) / (frameWidth + padding))
      const rows = Math.floor((img.naturalHeight + padding) / (frameHeight + padding))
      const totalFrames = Math.min(maxFrames, cols * rows)

      if (totalFrames <= 0) {
        throw new Error('Frame Width/Height exceeds image dimensions or is zero.')
      }

      const ffmpeg = await getFFmpeg(logMessage)

      setStatusText(`Slicing & writing ${totalFrames} frames...`)
      for (let idx = 0; idx < totalFrames; idx++) {
        const col = idx % columns
        const row = Math.floor(idx / columns)
        const sx = col * (frameWidth + padding)
        const sy = row * (frameHeight + padding)

        const frameCanvas = document.createElement('canvas')
        frameCanvas.width = frameWidth
        frameCanvas.height = frameHeight
        const fCtx = frameCanvas.getContext('2d')!
        fCtx.drawImage(
          sourceCanvas,
          sx, sy, frameWidth, frameHeight,
          0, 0, frameWidth, frameHeight
        )

        const frameBlob = await new Promise<Blob>((resolve, reject) => {
          frameCanvas.toBlob(b => b ? resolve(b) : reject(new Error('Canvas to blob failed')), 'image/png')
        })
        const frameData = new Uint8Array(await frameBlob.arrayBuffer())
        const filename = `frame_${String(idx + 1).padStart(4, '0')}.png`
        await ffmpeg.writeFile(filename, frameData)
      }

      setStatusText(`Compiling back to ${format.toUpperCase()}...`)
      const outputName = `output.${format}`
      const args = []

      if (format === 'gif') {
        args.push('-f', 'image2', '-framerate', fps.toString(), '-i', 'frame_%04d.png', outputName)
      } else {
        args.push(
          '-f', 'image2',
          '-framerate', fps.toString(),
          '-i', 'frame_%04d.png',
          '-c:v', 'libx264',
          '-pix_fmt', 'yuv420p',
          outputName
        )
      }

      await ffmpeg.exec(args)

      setStatusText('Saving animation file...')
      const data = (await ffmpeg.readFile(outputName)) as Uint8Array
      const mimeType = format === 'gif' ? 'image/gif' : 'video/mp4'
      const blob = new Blob([data as unknown as BlobPart], { type: mimeType })
      
      const downloadUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = downloadUrl
      a.download = `${file.name.replace(/\.[^.]+$/, '')}_animation.${format}`
      a.click()
      URL.revokeObjectURL(downloadUrl)

      // Clean up FS
      await ffmpeg.deleteFile(outputName)
      for (let idx = 0; idx < totalFrames; idx++) {
        const filename = `frame_${String(idx + 1).padStart(4, '0')}.png`
        await ffmpeg.deleteFile(filename)
      }

      setStatusText('Re-export complete!')
    } catch (err: unknown) {
      console.error(err)
      const errorMsg = err instanceof Error ? err.message : String(err)
      alert(`Error converting spritesheet: ${errorMsg}`)
      setStatusText('Failed to compile.')
    } finally {
      setProcessing(false)
    }
  }

  // Compile Video/GIF to Spritesheet
  const compileSpritesheet = async () => {
    if (!file) return

    setProcessing(true)
    setFfmpegLogs([])
    setCompiledCanvas(null)
    setNumCompiledFrames(0)
    setStatusText('Loading WebAssembly compiler...')

    try {
      const ffmpeg = await getFFmpeg(logMessage)
      
      setStatusText('Importing file...')
      const extension = file.name.split('.').pop() || 'mp4'
      const inputName = `input.${extension}`
      
      const fileData = await fetchFile(file)
      await ffmpeg.writeFile(inputName, fileData)

      setStatusText('Processing media frames (FFmpeg)...')
      const vfFilters: string[] = [`fps=${fps}`]
      if (frameWidth !== originalWidth || frameHeight !== originalHeight) {
        vfFilters.push(`scale=${frameWidth}:${frameHeight}`)
      }
      
      const args = []
      // Add seek params if it's a video
      if (duration > 0) {
        args.push('-ss', startTime.toString())
        args.push('-to', endTime.toString())
      }
      args.push('-i', inputName)
      args.push('-vf', vfFilters.join(','))
      args.push('frame_%04d.png')

      await ffmpeg.exec(args)

      setStatusText('Reading generated frames...')
      const dirContents = await ffmpeg.listDir('.')
      const frameFiles = dirContents
        .filter((f: { name: string; isDir: boolean }) => f.name.startsWith('frame_') && f.name.endsWith('.png'))
        .map((f: { name: string; isDir: boolean }) => f.name)
        .sort()

      if (frameFiles.length === 0) {
        throw new Error('No frames were generated. Check your start/end range or sampling FPS.')
      }

      const filesToProcess = frameFiles.slice(0, maxFrames)
      const numFrames = filesToProcess.length

      setStatusText(`Assembling grid of ${numFrames} frames...`)
      const frames: HTMLCanvasElement[] = []
      const rgbKey = hexToRgb(bgKeyColor)

      for (const filename of filesToProcess) {
        const data = (await ffmpeg.readFile(filename)) as Uint8Array
        const blob = new Blob([data as BlobPart], { type: 'image/png' })
        const url = URL.createObjectURL(blob)

        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const i = new Image()
          i.onload = () => resolve(i)
          i.onerror = reject
          i.src = url
        })

        const frameCanvas = document.createElement('canvas')
        frameCanvas.width = frameWidth
        frameCanvas.height = frameHeight
        const fCtx = frameCanvas.getContext('2d')!
        fCtx.drawImage(img, 0, 0)

        // Apply Chroma Keying if enabled
        if (removeBg) {
          const imgData = fCtx.getImageData(0, 0, frameWidth, frameHeight)
          const dataArr = imgData.data
          for (let i = 0; i < dataArr.length; i += 4) {
            const r = dataArr[i]
            const g = dataArr[i + 1]
            const b = dataArr[i + 2]
            
            const diff = Math.sqrt(
              Math.pow(r - rgbKey.r, 2) +
              Math.pow(g - rgbKey.g, 2) +
              Math.pow(b - rgbKey.b, 2)
            )
            
            if (diff < bgThreshold) {
              dataArr[i + 3] = 0 // transparency key
            }
          }
          fCtx.putImageData(imgData, 0, 0)
        }

        frames.push(frameCanvas)
        URL.revokeObjectURL(url)
        await ffmpeg.deleteFile(filename)
      }

      await ffmpeg.deleteFile(inputName)

      // Calculate Grid Layout
      const cols = Math.min(columns, numFrames)
      const rows = Math.ceil(numFrames / cols)

      const totalWidth = cols * frameWidth + (cols - 1) * padding
      const totalHeight = rows * frameHeight + (rows - 1) * padding

      const outputCanvas = document.createElement('canvas')
      outputCanvas.width = totalWidth
      outputCanvas.height = totalHeight
      const oCtx = outputCanvas.getContext('2d')!

      frames.forEach((frame, idx) => {
        const col = idx % cols
        const row = Math.floor(idx / cols)
        const x = col * (frameWidth + padding)
        const y = row * (frameHeight + padding)
        oCtx.drawImage(frame, x, y)
      })

      setCompiledCanvas(outputCanvas)
      setNumCompiledFrames(numFrames)
      setSpritesheet({ currentFrame: 0, previewing: true })
      setStatusText('Completed successfully!')
    } catch (err: unknown) {
      console.error(err)
      const errorMsg = err instanceof Error ? err.message : String(err)
      alert(`Error generating sprite sheet: ${errorMsg}`)
      setStatusText('Failed to compile.')
    } finally {
      setProcessing(false)
    }
  }

  // Outputs
  const addAsLayer = () => {
    if (!compiledCanvas) return
    const ctx = compiledCanvas.getContext('2d')!
    const data = ctx.getImageData(0, 0, compiledCanvas.width, compiledCanvas.height)
    context.pasteAsLayer(data, 0, 0, `Spritesheet (${file?.name})`)
    useEditorStore.getState().setHasImage(true)
    alert('Added sprite sheet as a new layer!')
  }

  const createNewDoc = () => {
    if (!compiledCanvas) return
    const ctx = compiledCanvas.getContext('2d')!
    const data = ctx.getImageData(0, 0, compiledCanvas.width, compiledCanvas.height)
    context.setImageData(data, true)
    useEditorStore.getState().setHasImage(true)
    alert('Replaced canvas with the generated sprite sheet!')
  }

  const downloadPng = () => {
    if (!compiledCanvas) return
    compiledCanvas.toBlob(blob => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${file?.name.replace(/\.[^.]+$/, '')}_spritesheet.png`
      a.click()
      URL.revokeObjectURL(url)
    })
  }

  // Sidebar Preview click to open layout tab
  const handleOpenLargePreview = () => {
    const existing = findWidgetTab(layout, 'spritesheet_preview')
    if (existing) {
      dispatch({
        type: 'SET_ACTIVE_TAB',
        areaId: existing.areaId,
        tabIndex: existing.tabIndex,
      })
    } else {
      dispatch({
        type: 'ADD_TAB',
        areaId: 'canvas-panel',
        widgetId: 'spritesheet_preview',
      })
    }
  }

  // Local sidebar loops drawing the current frame from Zustand store
  useEffect(() => {
    if (!compiledCanvas || numCompiledFrames <= 0) return

    const canvas = document.getElementById('spritesheet-preview-canvas') as HTMLCanvasElement | null
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = frameWidth
    canvas.height = frameHeight

    const frameIdx = spritesheet.currentFrame
    const col = frameIdx % columns
    const row = Math.floor(frameIdx / columns)
    const sx = col * (frameWidth + padding)
    const sy = row * (frameHeight + padding)

    ctx.clearRect(0, 0, frameWidth, frameHeight)
    ctx.drawImage(
      compiledCanvas,
      sx, sy, frameWidth, frameHeight,
      0, 0, frameWidth, frameHeight
    )
  }, [compiledCanvas, numCompiledFrames, spritesheet.currentFrame, frameWidth, frameHeight, columns, padding])

  // Shared timer ticking inside sidebar panel (when active)
  useEffect(() => {
    if (!compiledCanvas || numCompiledFrames <= 0 || !previewing) return

    let active = true
    let timer: ReturnType<typeof setTimeout> | null = null

    const step = () => {
      if (!active) return
      setSpritesheet(prev => ({
        currentFrame: (prev.currentFrame + 1) % numCompiledFrames
      }))
      timer = setTimeout(step, 1000 / fps)
    }

    timer = setTimeout(step, 1000 / fps)

    return () => {
      active = false
      if (timer) clearTimeout(timer)
    }
  }, [compiledCanvas, numCompiledFrames, previewing, fps, setSpritesheet])

  const sl = 'w-full accent-violet-500 h-1.5'
  const lbl = 'text-xs text-neutral-400 flex justify-between mb-1'
  const inp = 'w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-xs text-neutral-200 focus:outline-none focus:border-violet-500'

  return (
    <div className="p-3 space-y-4 text-xs h-full flex flex-col justify-between overflow-y-auto">
      <div className="space-y-4">
        <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-medium">Sprite Sheet Generator</p>

        {/* File Loader */}
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={`border border-dashed rounded p-4 text-center transition-colors ${
            over ? 'border-violet-400 bg-violet-950/20' : 'border-neutral-700 bg-neutral-900/50'
          }`}
        >
          <input
            type="file"
            accept="video/*,image/*"
            onChange={handleFileChange}
            className="hidden"
            id="spritesheet-file-input"
            disabled={processing || loadingFile}
          />
          <label
            htmlFor="spritesheet-file-input"
            className="cursor-pointer text-violet-400 hover:text-violet-300 font-medium block"
          >
            {file ? `File: ${file.name}` : 'Click to upload Video or Image'}
          </label>
          <div className="text-[10px] text-neutral-500 mt-0.5">or drop files here</div>
          
          <div className="flex flex-col gap-2 mt-3.5">
            <div className="flex justify-center gap-1.5">
              <button
                onClick={handlePasteFromClipboard}
                disabled={processing || loadingFile}
                className="px-2.5 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-[10px] text-neutral-300 border border-neutral-700 transition-colors flex-1"
              >
                Paste Clipboard
              </button>
              <button
                onClick={loadActiveLayer}
                disabled={processing || loadingFile}
                className="px-2.5 py-1 rounded bg-violet-900/35 hover:bg-violet-900/50 text-[10px] text-violet-300 border border-violet-850 transition-colors flex-1"
              >
                Load Active Layer
              </button>
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
                <input
                  type="number"
                  value={frameWidth}
                  min={8}
                  onChange={e => setFrameWidth(Math.max(8, +e.target.value))}
                  className={inp}
                />
              </div>
              <div>
                <label className="text-[10px] text-neutral-500 uppercase">Frame Height</label>
                <input
                  type="number"
                  value={frameHeight}
                  min={8}
                  onChange={e => setFrameHeight(Math.max(8, +e.target.value))}
                  className={inp}
                />
              </div>
            </div>

            {/* Video specifics (duration-based trimming) */}
            {duration > 0 && !isStaticImage && (
              <div className="space-y-2 border-t border-neutral-800 pt-3">
                <div className="flex justify-between text-[10px] text-neutral-500 uppercase">
                  <span>Range Settings</span>
                  <span>Duration: {duration.toFixed(1)}s</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[9px] text-neutral-500">Start Time (s)</label>
                    <input
                      type="number"
                      step="0.1"
                      min={0}
                      max={endTime}
                      value={startTime}
                      onChange={e => setStartTime(Math.max(0, +e.target.value))}
                      className={inp}
                    />
                  </div>
                  <div>
                    <label className="text-[9px] text-neutral-500">End Time (s)</label>
                    <input
                      type="number"
                      step="0.1"
                      min={startTime}
                      max={duration}
                      value={endTime}
                      onChange={e => setEndTime(Math.min(duration, +e.target.value))}
                      className={inp}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Sampling Frame Rate */}
            <div>
              <div className={lbl}>
                <span>Sample Rate (FPS)</span>
                <span>{fps} fps</span>
              </div>
              <input
                type="range"
                min={1}
                max={30}
                value={fps}
                onChange={e => setFps(+e.target.value)}
                className={sl}
              />
            </div>

            {/* Safety limits / Grid */}
            <div className="grid grid-cols-2 gap-2 border-t border-neutral-800 pt-3">
              <div>
                <label className="text-[10px] text-neutral-500 uppercase">Max Frames</label>
                <input
                  type="number"
                  min={2}
                  max={256}
                  value={maxFrames}
                  onChange={e => setMaxFrames(Math.max(2, Math.min(256, +e.target.value)))}
                  className={inp}
                />
              </div>
              <div>
                <label className="text-[10px] text-neutral-500 uppercase">Columns</label>
                <input
                  type="number"
                  min={1}
                  max={32}
                  value={columns}
                  onChange={e => setColumns(Math.max(1, Math.min(32, +e.target.value)))}
                  className={inp}
                />
              </div>
            </div>

            <div>
              <div className={lbl}>
                <span>Spacing / Padding</span>
                <span>{padding}px</span>
              </div>
              <input
                type="range"
                min={0}
                max={20}
                value={padding}
                onChange={e => setPadding(+e.target.value)}
                className={sl}
              />
            </div>

            {/* Background Keying */}
            <div className="border-t border-neutral-800 pt-3 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer select-none text-neutral-300">
                <input
                  type="checkbox"
                  checked={removeBg}
                  onChange={e => setRemoveBg(e.target.checked)}
                  className="rounded border-neutral-700 bg-neutral-800 text-violet-600 focus:ring-violet-500"
                />
                <span>Remove Background Color</span>
              </label>

              {removeBg && (
                <div className="space-y-2 pl-5">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={bgKeyColor}
                      onChange={e => setBgKeyColor(e.target.value)}
                      className="w-6 h-6 rounded cursor-pointer border border-neutral-600 bg-transparent flex-none p-0.5"
                    />
                    <input
                      value={bgKeyColor}
                      onChange={e => setBgKeyColor(e.target.value)}
                      className="flex-1 bg-neutral-800 border border-neutral-700 rounded px-1.5 py-0.5 font-mono text-neutral-300 focus:outline-none"
                    />
                  </div>
                  <div>
                    <div className={lbl}>
                      <span>Color Similarity Tolerance</span>
                      <span>{bgThreshold}</span>
                    </div>
                    <input
                      type="range"
                      min={5}
                      max={150}
                      value={bgThreshold}
                      onChange={e => setBgThreshold(+e.target.value)}
                      className={sl}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Actions for compile */}
            {isStaticImage ? (
              <div className="border-t border-neutral-800 pt-3 space-y-2">
                <p className="text-[10px] text-neutral-500 uppercase tracking-wider font-semibold">Spritesheet Actions</p>
                <button
                  onClick={previewStaticSpritesheet}
                  disabled={processing}
                  className="w-full py-2 rounded bg-violet-600 hover:bg-violet-500 text-white font-medium transition-colors flex items-center justify-center gap-2"
                >
                  Preview Spritesheet Animation
                </button>
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center gap-2">
                    <span className="text-neutral-500 uppercase text-[10px] shrink-0">Export Format</span>
                    <select
                      value={exportFormat}
                      onChange={e => setExportFormat(e.target.value as 'gif' | 'mp4')}
                      className="flex-1 bg-neutral-850 border border-neutral-700 rounded px-2 py-1 text-xs text-neutral-200 focus:outline-none"
                    >
                      <option value="gif">GIF (.gif)</option>
                      <option value="mp4">Video (.mp4)</option>
                    </select>
                  </div>
                  <button
                    onClick={() => exportToAnimation(exportFormat)}
                    disabled={processing}
                    className="w-full py-2 rounded bg-neutral-800 hover:bg-neutral-750 text-neutral-200 border border-neutral-750 font-medium transition-colors flex items-center justify-center gap-2 disabled:text-neutral-500"
                  >
                    {processing && <Loader2 className="animate-spin" size={14} />}
                    Compile to Video/GIF
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={compileSpritesheet}
                disabled={processing}
                className="w-full mt-2 py-2 rounded bg-violet-600 hover:bg-violet-500 text-white font-medium transition-colors flex items-center justify-center gap-2 disabled:bg-neutral-800 disabled:text-neutral-500"
              >
                {processing && <Loader2 className="animate-spin" size={14} />}
                Compile Sprite Sheet
              </button>
            )}
          </div>
        )}

        {/* FFmpeg processing feedback */}
        {processing && (
          <div className="bg-neutral-950 p-2.5 rounded border border-neutral-800 space-y-2">
            <div className="text-violet-400 font-medium flex items-center gap-1.5">
              <Loader2 className="animate-spin" size={12} />
              {statusText}
            </div>
            {ffmpegLogs.length > 0 && (
              <div className="max-h-24 overflow-y-auto font-mono text-[9px] text-neutral-500 leading-tight space-y-0.5 select-text">
                {ffmpegLogs.map((log, i) => (
                  <div key={i} className="truncate">{log}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Animation Preview */}
        {compiledCanvas && !processing && (
          <div className="border border-neutral-800 rounded p-2.5 bg-neutral-950/40 space-y-2">
            <div className="flex justify-between items-center text-[10px] text-neutral-400 uppercase tracking-wider font-semibold">
              <span>Animation Preview</span>
              <button
                onClick={(e) => { e.stopPropagation(); setPreviewing(!previewing); }}
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
              <canvas
                id="spritesheet-preview-canvas"
                className="max-h-32 object-contain"
                style={{ imageRendering: 'pixelated' }}
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                <span className="text-[10px] text-violet-300 bg-neutral-950/80 px-2.5 py-1.5 rounded border border-neutral-800 font-medium">
                  Click to Expand Preview
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Compilation results options */}
        {compiledCanvas && !processing && (
          <div className="border-t border-neutral-800 pt-3 space-y-2">
            <p className="text-[10px] text-neutral-400 uppercase tracking-wider font-semibold">Output Options</p>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={addAsLayer}
                className="py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-750 transition-colors"
              >
                Add as Layer
              </button>
              <button
                onClick={createNewDoc}
                className="py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-750 transition-colors"
              >
                New Document
              </button>
            </div>
            <button
              onClick={downloadPng}
              className="w-full py-1.5 rounded bg-violet-600 hover:bg-violet-500 text-white transition-colors"
            >
              Download PNG
            </button>
          </div>
        )}
      </div>

      <p className="text-[10px] text-neutral-600 leading-tight border-t border-neutral-850 pt-2.5">
        Powered by WebAssembly FFmpeg. Extract high-fidelity frames locally in-browser without uploading content to a server.
      </p>
    </div>
  )
}

// ─── Spritesheet Large Preview Widget (Tabbed next to canvas) ───────────────────

const PREVIEW_PAD = 1000

export function SpritesheetPreviewWidget() {
  const spritesheet = useEditorStore(state => state.spritesheet)
  const setSpritesheet = useEditorStore(state => state.setSpritesheet)

  const {
    compiledCanvas, numCompiledFrames, fps, frameWidth, frameHeight, columns, padding, previewing, currentFrame, file
  } = spritesheet

  const [zoom, setZoom] = useState<number>(1)
  const zoomRef = useRef(zoom)
  useEffect(() => {
    zoomRef.current = zoom
  }, [zoom])

  const stageRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const preventRecenter = useRef(false)
  const pendingScroll = useRef<{ left: number; top: number } | null>(null)

  const fitZoom = () => {
    const el = stageRef.current
    if (!el) return
    const maxW = el.clientWidth - 48
    const maxH = el.clientHeight - 48
    const z = Math.min(maxW / frameWidth, maxH / frameHeight)
    setZoom(Math.max(0.05, Math.min(z, 64)))
  }

  // Auto-fit on mount or file load
  useEffect(() => {
    if (compiledCanvas) {
      const t = setTimeout(fitZoom, 50)
      return () => clearTimeout(t)
    }
  }, [compiledCanvas, frameWidth, frameHeight]) // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll centering logic like CanvasStage.tsx
  useLayoutEffect(() => {
    const el = stageRef.current
    if (!el || !frameWidth || !frameHeight) return
    if (preventRecenter.current) {
      preventRecenter.current = false
      if (pendingScroll.current) {
        el.scrollLeft = pendingScroll.current.left
        el.scrollTop  = pendingScroll.current.top
        pendingScroll.current = null
      }
      return
    }
    el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2
    el.scrollTop  = (el.scrollHeight - el.clientHeight) / 2
  }, [zoom, frameWidth, frameHeight])

  // Mouse wheel zoom centering on cursor
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    let rafId = 0
    let targetZoom: number | null = null

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()

      const currentZoomVal = zoomRef.current
      const baseZoom = targetZoom ?? currentZoomVal
      const factor = e.deltaY > 0 ? 0.9 : 1.1
      const clamped = Math.max(0.05, Math.min(baseZoom * factor, 64))
      if (clamped === currentZoomVal) return

      targetZoom = clamped

      const rect = el.getBoundingClientRect()
      const cursorX = e.clientX - rect.left
      const cursorY = e.clientY - rect.top
      const ratio = clamped / currentZoomVal
      pendingScroll.current = {
        left: (el.scrollLeft + cursorX - PREVIEW_PAD) * ratio + PREVIEW_PAD - cursorX,
        top:  (el.scrollTop  + cursorY - PREVIEW_PAD) * ratio + PREVIEW_PAD - cursorY,
      }

      if (rafId) return

      rafId = requestAnimationFrame(() => {
        rafId = 0
        const z = targetZoom!
        targetZoom = null
        preventRecenter.current = true
        setZoom(z)
      })
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      el.removeEventListener('wheel', onWheel)
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [frameWidth, frameHeight])

  // Drag-to-pan logic
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    let origin: { x: number; y: number; sl: number; st: number } | null = null

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return // Left click only
      el.setPointerCapture(e.pointerId)
      origin = { x: e.clientX, y: e.clientY, sl: el.scrollLeft, st: el.scrollTop }
      e.preventDefault()
    }
    const onMove = (e: PointerEvent) => {
      if (!origin) return
      el.scrollLeft = origin.sl - (e.clientX - origin.x)
      el.scrollTop = origin.st - (e.clientY - origin.y)
    }
    const onUp = () => { origin = null }

    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
    }
  }, [])

  // Redraw hook for the canvas frame
  useEffect(() => {
    if (!compiledCanvas || numCompiledFrames <= 0) return

    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = frameWidth
    canvas.height = frameHeight

    const col = currentFrame % columns
    const row = Math.floor(currentFrame / columns)
    const sx = col * (frameWidth + padding)
    const sy = row * (frameHeight + padding)

    ctx.clearRect(0, 0, frameWidth, frameHeight)
    ctx.drawImage(
      compiledCanvas,
      sx, sy, frameWidth, frameHeight,
      0, 0, frameWidth, frameHeight
    )
  }, [compiledCanvas, numCompiledFrames, currentFrame, frameWidth, frameHeight, columns, padding])

  if (!compiledCanvas || numCompiledFrames <= 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 p-8 bg-neutral-950 text-center select-none text-neutral-500">
        <Sparkles size={48} className="opacity-15 text-violet-400" />
        <p className="text-sm font-medium text-neutral-400">No active spritesheet animation to preview</p>
        <p className="text-xs text-neutral-600 max-w-xs">Compile a video or GIF file in the Sprite Gen panel to view the result here.</p>
      </div>
    )
  }

  const prevFrame = () => {
    setSpritesheet({
      previewing: false,
      currentFrame: (currentFrame - 1 + numCompiledFrames) % numCompiledFrames
    })
  }

  const nextFrame = () => {
    setSpritesheet({
      previewing: false,
      currentFrame: (currentFrame + 1) % numCompiledFrames
    })
  }

  return (
    <div className="h-full w-full flex flex-col bg-neutral-950 text-neutral-200">
      {/* Viewport Workspace */}
      <div
        ref={stageRef}
        className="flex-1 overflow-auto bg-neutral-900/60 checker-bg cursor-grab active:cursor-grabbing select-none relative"
      >
        <div className="flex items-center justify-center" style={{ padding: PREVIEW_PAD }}>
          <div
            ref={containerRef}
            className="relative shrink-0 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)] border border-neutral-800"
            style={{ width: frameWidth * zoom, height: frameHeight * zoom }}
          >
            <canvas
              id="large-spritesheet-preview-canvas"
              ref={canvasRef}
              style={{
                width: frameWidth * zoom,
                height: frameHeight * zoom,
                display: 'block',
                imageRendering: zoom >= 4 ? 'pixelated' : 'auto',
              }}
            />
          </div>
        </div>
      </div>

      {/* Control Bar */}
      <div className="flex-none p-3 bg-neutral-900 border-t border-neutral-800 flex flex-col gap-3">
        {/* Scrubber slider */}
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={numCompiledFrames - 1}
            value={currentFrame}
            onChange={e => setSpritesheet({ currentFrame: +e.target.value, previewing: false })}
            className="flex-1 h-1 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-violet-500 focus:outline-none"
          />
        </div>

        {/* Playback Controls & Settings */}
        <div className="flex items-center justify-between text-xs gap-4">
          {/* Play/Pause & Steps */}
          <div className="flex items-center gap-2">
            <button
              onClick={prevFrame}
              className="p-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors border border-neutral-750"
              title="Previous Frame"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              onClick={() => setSpritesheet({ previewing: !previewing })}
              className="px-4 py-1.5 rounded bg-violet-600 hover:bg-violet-500 text-white font-medium transition-all shadow-md flex items-center gap-1.5"
            >
              {previewing ? <Pause size={12} /> : <Play size={12} />}
              {previewing ? 'Pause' : 'Play'}
            </button>
            <button
              onClick={nextFrame}
              className="p-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors border border-neutral-750"
              title="Next Frame"
            >
              <ChevronRight size={14} />
            </button>
          </div>

          {/* Stats Readout */}
          <div className="text-neutral-400 font-medium font-mono text-[10px] bg-neutral-950/40 px-3 py-1.5 rounded border border-neutral-800 max-w-sm truncate">
            <span>{file?.name}</span>
            <span className="text-neutral-600 mx-2">|</span>
            <span>{frameWidth}x{frameHeight}px</span>
            <span className="text-neutral-600 mx-2">|</span>
            <span className="text-violet-400">Frame {currentFrame + 1}/{numCompiledFrames}</span>
          </div>

          {/* Speed & Zoom */}
          <div className="flex items-center gap-4 shrink-0">
            {/* FPS Speed Control */}
            <div className="flex items-center gap-2">
              <span className="text-neutral-500 font-mono text-[10px]">{fps} FPS</span>
              <input
                type="range"
                min={1}
                max={30}
                value={fps}
                onChange={e => setSpritesheet({ fps: +e.target.value })}
                className="w-16 h-1 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-violet-500"
              />
            </div>

            {/* Zoom Controls */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setZoom(z => Math.max(0.05, z / 1.2))}
                className="p-1 text-neutral-400 hover:text-white transition-colors"
                title="Zoom Out"
              >
                <ZoomOut size={14} />
              </button>
              <span className="text-neutral-300 font-mono text-[10px] min-w-[36px] text-center">
                {(zoom * 100).toFixed(0)}%
              </span>
              <button
                onClick={() => setZoom(z => Math.min(64, z * 1.2))}
                className="p-1 text-neutral-400 hover:text-white transition-colors"
                title="Zoom In"
              >
                <ZoomIn size={14} />
              </button>
            </div>

            {/* Fit View Button */}
            <button
              onClick={fitZoom}
              className="px-2.5 py-1.5 rounded bg-neutral-800 hover:bg-neutral-750 text-neutral-300 hover:text-white transition-colors border border-neutral-750 text-[10px] font-medium"
              title="Reset Zoom to Fit Viewport"
            >
              Fit View
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Plugin Definition ────────────────────────────────────────────────────────

export const spritesheetPlugin: EditorPlugin = {
  id: 'spritesheet',
  name: 'Sprite Gen',
  icon: <Grid size={18} />,
  category: 'export',
  Panel: SpritesheetPanel,
}
