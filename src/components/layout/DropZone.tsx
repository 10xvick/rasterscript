import { useState } from 'react'
import { ImagePlus, Clipboard } from 'lucide-react'
import { useEditorStore } from '../../store/useEditorStore'
import { importFilesAsDocument, pasteFromClipboard, openBrowseForImport } from '../../utils/importImage'

export function DropZone() {
  const { hasImage } = useEditorStore()
  const [over, setOver] = useState(false)

  if (hasImage) return null

  return (
    <div
      className={`absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 transition-colors ${over ? 'bg-violet-950/80' : 'bg-neutral-950/80'}`}
      onDragOver={e => { e.preventDefault(); e.stopPropagation(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); e.stopPropagation(); setOver(false); importFilesAsDocument(e.dataTransfer.files) }}
    >
      <div className={`border-2 border-dashed rounded-2xl p-12 text-center transition-colors ${over ? 'border-violet-400' : 'border-neutral-600'}`}>
        <ImagePlus size={48} className="mx-auto mb-4 text-neutral-500" />
        <p className="text-neutral-300 text-lg font-medium">Drop images to start</p>
        <p className="text-neutral-500 text-sm mt-1">Multiple files — each becomes a layer</p>
        <p className="text-neutral-500 text-sm mt-1">or</p>
        <div className="flex items-center justify-center gap-3 mt-3">
          <button
            className="px-5 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-sm font-medium transition-colors"
            onClick={() => openBrowseForImport()}
          >
            Browse files
          </button>
          <button
            className="px-5 py-2 rounded-lg border border-violet-600 text-violet-400 hover:bg-violet-950/50 text-sm font-medium transition-colors flex items-center gap-2"
            onClick={pasteFromClipboard}
          >
            <Clipboard size={16} />
            Paste image
          </button>
        </div>
      </div>
    </div>
  )
}
