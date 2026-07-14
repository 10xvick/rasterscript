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
