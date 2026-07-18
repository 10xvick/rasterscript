import { useState } from 'react'
import { ImagePlus, Clipboard, X } from 'lucide-react'
import { useEditorStore } from '../../store/useEditorStore'

interface DropZoneProps {
  open?: boolean
  onClose?: () => void
}

export function DropZone({ open, onClose }: DropZoneProps) {
  const { engine, hasImage, setHasImage, syncFromEngine } = useEditorStore()
  const [over, setOver] = useState(false)
  const [mode, setMode] = useState<'import' | 'new'>('import')

  if (!open) return null

  const isModal = !!(open && onClose)
  const activeMode = hasImage ? mode : 'new'

  const importAsLayer = async (file: File) => {
    if (!engine) return
    const bmp = await createImageBitmap(file)
    const tmp = document.createElement('canvas')
    tmp.width = bmp.width; tmp.height = bmp.height
    tmp.getContext('2d')!.drawImage(bmp, 0, 0)
    const data = tmp.getContext('2d')!.getImageData(0, 0, bmp.width, bmp.height)
    engine.importImageAsLayer(data, file.name.replace(/\.[^.]+$/, ''))
    syncFromEngine()
  }

  const loadFiles = async (files: FileList | File[]) => {
    if (!engine) return
    const images = Array.from(files).filter(f => f.type.startsWith('image/'))
    if (!images.length) return
    const bmp = await createImageBitmap(images[0])
    engine.loadImage(bmp)
    setHasImage(true)
    syncFromEngine()
    for (const file of images.slice(1)) await importAsLayer(file)
  }

  const loadAsLayers = async (files: FileList | File[]) => {
    const images = Array.from(files).filter(f => f.type.startsWith('image/'))
    for (const file of images) await importAsLayer(file)
  }

  const loadImageFromBlob = async (blob: Blob) => {
    if (!engine) return
    const bmp = await createImageBitmap(blob)
    engine.loadImage(bmp)
    setHasImage(true)
    syncFromEngine()
  }

  const importImageFromBlob = async (blob: Blob) => {
    if (!engine) return
    const bmp = await createImageBitmap(blob)
    const tmp = document.createElement('canvas')
    tmp.width = bmp.width; tmp.height = bmp.height
    tmp.getContext('2d')!.drawImage(bmp, 0, 0)
    const data = tmp.getContext('2d')!.getImageData(0, 0, bmp.width, bmp.height)
    engine.importImageAsLayer(data, 'Pasted Layer')
    syncFromEngine()
  }

  const pasteFromClipboard = async () => {
    try {
      const items = await navigator.clipboard.read()
      for (const item of items) {
        for (const type of item.types) {
          if (type.startsWith('image/')) {
            const blob = await item.getType(type)
            if (activeMode === 'import') {
              await importImageFromBlob(blob)
            } else {
              await loadImageFromBlob(blob)
            }
            return
          }
        }
      }
    } catch (err) {
      console.warn('Clipboard read failed:', err)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setOver(false)
    if (activeMode === 'import') loadAsLayers(e.dataTransfer.files)
    else loadFiles(e.dataTransfer.files)
    onClose?.()
  }

  const handleBrowse = () => {
    const input = document.createElement('input')
    input.type = 'file'; input.accept = 'image/*'; input.multiple = true
    input.onchange = () => {
      if (!input.files?.length) return
      if (activeMode === 'import') loadAsLayers(input.files)
      else loadFiles(input.files)
    }
    input.click()
    onClose?.()
  }

  const handlePaste = async () => {
    await pasteFromClipboard()
    onClose?.()
  }

  const content = (
    <div
      className={`flex flex-col items-center justify-center gap-4 transition-colors ${over ? 'bg-violet-950/80' : 'bg-neutral-950/80'}`}
      onDragOver={e => { e.preventDefault(); e.stopPropagation(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={handleDrop}
    >
      <div className={`border-2 border-dashed rounded-2xl p-12 text-center transition-colors ${over ? 'border-violet-400' : 'border-neutral-600'}`}>
        {hasImage && (
          <div className="flex bg-neutral-900 border border-neutral-800 rounded-lg p-0.5 mb-5 max-w-xs mx-auto">
            <button
              onClick={() => setMode('import')}
              className={`flex-1 py-1 px-3 text-xs font-semibold rounded-md transition-colors ${activeMode === 'import' ? 'bg-violet-600 text-white' : 'text-neutral-400 hover:text-neutral-200'}`}
            >
              Import as Layers
            </button>
            <button
              onClick={() => setMode('new')}
              className={`flex-1 py-1 px-3 text-xs font-semibold rounded-md transition-colors ${activeMode === 'new' ? 'bg-violet-600 text-white' : 'text-neutral-400 hover:text-neutral-200'}`}
            >
              Open New Canvas
            </button>
          </div>
        )}

        <ImagePlus size={48} className="mx-auto mb-4 text-neutral-500" />
        
        <p className="text-neutral-300 text-lg font-medium">
          {activeMode === 'import' ? 'Drop images to import as layers' : 'Drop images to open new canvas'}
        </p>
        
        <p className="text-neutral-500 text-sm mt-1">
          {activeMode === 'import'
            ? 'Each file will be added as a new layer to the current document'
            : 'Multiple files — first becomes background, others become layers'}
        </p>

        <p className="text-neutral-500 text-sm mt-3.5">or</p>
        
        <div className="flex items-center justify-center gap-3 mt-3.5">
          <button
            className="px-5 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-sm font-medium transition-colors text-white"
            onClick={handleBrowse}
          >
            Browse files
          </button>
          <button
            className="px-5 py-2 rounded-lg border border-violet-600 text-violet-400 hover:bg-violet-950/50 text-sm font-medium transition-colors flex items-center gap-2"
            onClick={handlePaste}
          >
            <Clipboard size={16} />
            Paste image
          </button>
        </div>
      </div>
    </div>
  )

  if (isModal) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
        onClick={e => { if (e.target === e.currentTarget) onClose?.() }}
      >
        <div className="relative rounded-2xl overflow-hidden">
          <button
            onClick={onClose}
            className="absolute top-3 right-3 z-10 p-1 rounded-full bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
          {content}
        </div>
      </div>
    )
  }

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center">
      {content}
    </div>
  )
}
