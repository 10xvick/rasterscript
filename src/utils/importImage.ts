import { useEditorStore } from '../store/useEditorStore'

export async function importFileAsLayer(file: File) {
  const { engine, syncFromEngine } = useEditorStore.getState()
  if (!engine) return
  const bmp = await createImageBitmap(file)
  const tmp = document.createElement('canvas')
  tmp.width = bmp.width; tmp.height = bmp.height
  tmp.getContext('2d')!.drawImage(bmp, 0, 0)
  const data = tmp.getContext('2d')!.getImageData(0, 0, bmp.width, bmp.height)
  engine.importImageAsLayer(data, file.name.replace(/\.[^.]+$/, ''))
  syncFromEngine()
}

export async function importFilesAsLayers(files: FileList | File[]) {
  const images = Array.from(files).filter(f => f.type.startsWith('image/'))
  for (const file of images) await importFileAsLayer(file)
}

export async function importFilesAsDocument(files: FileList | File[]) {
  const { engine, setHasImage, syncFromEngine } = useEditorStore.getState()
  if (!engine) return
  const images = Array.from(files).filter(f => f.type.startsWith('image/'))
  if (!images.length) return
  const bmp = await createImageBitmap(images[0])
  engine.loadImage(bmp)
  setHasImage(true)
  syncFromEngine()
  for (const file of images.slice(1)) await importFileAsLayer(file)
}

export async function importBlobAsDocument(blob: Blob) {
  const { engine, setHasImage, syncFromEngine } = useEditorStore.getState()
  if (!engine) return
  const bmp = await createImageBitmap(blob)
  engine.loadImage(bmp)
  setHasImage(true)
  syncFromEngine()
}

export async function importBlobAsLayer(blob: Blob, name = 'Pasted') {
  const { engine, syncFromEngine } = useEditorStore.getState()
  if (!engine) return
  const bmp = await createImageBitmap(blob)
  const tmp = document.createElement('canvas')
  tmp.width = bmp.width; tmp.height = bmp.height
  tmp.getContext('2d')!.drawImage(bmp, 0, 0)
  const data = tmp.getContext('2d')!.getImageData(0, 0, bmp.width, bmp.height)
  engine.importImageAsLayer(data, name)
  syncFromEngine()
}

export function handlePasteEvent(e: Event) {
  const event = e as ClipboardEvent
  const items = event.clipboardData?.items
  if (!items) return
  const { hasImage } = useEditorStore.getState()
  for (const item of Array.from(items)) {
    if (item.type.startsWith('image/')) {
      event.preventDefault()
      const blob = item.getAsFile()
      if (!blob) return
      if (hasImage) importBlobAsLayer(blob)
      else importBlobAsDocument(blob)
      break
    }
  }
}

export async function pasteFromClipboard() {
  try {
    const items = await navigator.clipboard.read()
    const { hasImage } = useEditorStore.getState()
    for (const item of items) {
      for (const type of item.types) {
        if (type.startsWith('image/')) {
          const blob = await item.getType(type)
          if (hasImage) await importBlobAsLayer(blob)
          else await importBlobAsDocument(blob)
          return
        }
      }
    }
  } catch {
    // Clipboard API may not be available or permission denied
  }
}

export function openBrowseForImport(multiple = true) {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.multiple = multiple
  input.onchange = async () => {
    if (!input.files?.length) return
    const { hasImage } = useEditorStore.getState()
    if (hasImage) await importFilesAsLayers(input.files)
    else await importFilesAsDocument(input.files)
  }
  input.click()
}
