import { useState } from 'react'
import { ImagePlus, X } from 'lucide-react'
import { useEditorStore } from '../../store/useEditorStore'
import { importFilesAsDocument, importFilesAsLayers, openBrowseForImport } from '../../utils/importImage'

interface DropZoneProps {
  open?: boolean
  onClose?: () => void
}

export function DropZone({ open, onClose }: DropZoneProps) {
  const { hasImage } = useEditorStore()
  const [over, setOver] = useState(false)

  if (hasImage && !open) return null

  const isModal = !!(open && onClose)

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setOver(false)
    if (hasImage) importFilesAsLayers(e.dataTransfer.files)
    else importFilesAsDocument(e.dataTransfer.files)
    onClose?.()
  }

  const handleBrowse = () => {
    openBrowseForImport()
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
        <ImagePlus size={48} className="mx-auto mb-4 text-neutral-500" />
        <p className="text-neutral-300 text-lg font-medium">Drop images to start</p>
        <p className="text-neutral-500 text-sm mt-1">Multiple files — each becomes a layer</p>
        <p className="text-neutral-500 text-sm mt-1">or</p>
        <div className="flex items-center justify-center gap-3 mt-3">
          <button
            className="px-5 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-sm font-medium transition-colors"
            onClick={handleBrowse}
          >
            Browse files
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
    <div className="absolute inset-0 z-20">
      {content}
    </div>
  )
}
