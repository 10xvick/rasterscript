import { useState } from 'react'
import { ImagePlus } from 'lucide-react'
import { useEditorStore } from '../../store/useEditorStore'

/**
 * Full-canvas drop zone that appears when no image is loaded.
 * Supports dropping multiple images — first becomes the background, rest become layers.
 */
export function DropZone() {
  const { engine, hasImage, setHasImage, syncFromEngine } = useEditorStore()
  const [over, setOver] = useState(false)

  if (hasImage) return null

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

  return (
    <div
      className={`absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 transition-colors ${over ? 'bg-violet-950/80' : 'bg-neutral-950/80'}`}
      onDragOver={e => { e.preventDefault(); e.stopPropagation(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); e.stopPropagation(); setOver(false); loadFiles(e.dataTransfer.files) }}
    >
      <div className={`border-2 border-dashed rounded-2xl p-12 text-center transition-colors ${over ? 'border-violet-400' : 'border-neutral-600'}`}>
        <ImagePlus size={48} className="mx-auto mb-4 text-neutral-500" />
        <p className="text-neutral-300 text-lg font-medium">Drop images to start</p>
        <p className="text-neutral-500 text-sm mt-1">Multiple files — each becomes a layer</p>
        <p className="text-neutral-500 text-sm mt-1">or</p>
        <button
          className="mt-3 px-5 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-sm font-medium transition-colors"
          onClick={() => {
            const input = document.createElement('input')
            input.type = 'file'; input.accept = 'image/*'; input.multiple = true
            input.onchange = () => { if (input.files?.length) loadFiles(input.files) }
            input.click()
          }}
        >
          Browse files
        </button>
      </div>
    </div>
  )
}
