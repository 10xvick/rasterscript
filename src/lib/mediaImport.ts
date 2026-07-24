import { probeVideoMetadata, extractFrameToCanvas } from './media'
import { useEditorStore } from '../store/useEditorStore'

export async function importMediaFile(file: File, options?: { isPrimary?: boolean; layoutDispatch?: (action: any) => void }) {
  const store = useEditorStore.getState()
  const engine = store.engine
  if (!engine) return

  const isVideo = file.type.startsWith('video/') || /\.(mp4|webm|mov|mkv|avi|ogv)$/i.test(file.name)

  if (isVideo) {
    try {
      const meta = await probeVideoMetadata(file)
      const frameCanvas = await extractFrameToCanvas(file, 0)
      const ctx = frameCanvas.getContext('2d')!
      const imgData = ctx.getImageData(0, 0, frameCanvas.width, frameCanvas.height)

      if (options?.isPrimary && !store.hasImage) {
        const bmp = await createImageBitmap(frameCanvas)
        engine.loadImage(bmp)
        store.setHasImage(true)
      }

      engine.importImageAsLayer(imgData, file.name)
      const layerId = engine.activeLayerId

      engine.setLayerVideoProperties?.(layerId, {
        isVideo: true,
        videoFile: file,
        videoDuration: meta.duration,
        startTime: 0,
        endTime: meta.duration,
        trimStart: 0,
        trimEnd: meta.duration,
      })

      // Update timeline duration if video is longer
      if (meta.duration > store.duration) {
        store.setTimeline({ duration: Math.max(meta.duration, store.duration) })
      }

      store.setHasImage(true)
      store.syncFromEngine()

      // Open timeline panel
      options?.layoutDispatch?.({ type: 'ENSURE_WIDGET', widgetId: 'timeline' })
    } catch (err) {
      console.error('Failed to import video:', err)
      alert(`Could not load video file: ${(err as Error).message}`)
    }
  } else {
    // Image file
    try {
      if (options?.isPrimary && !store.hasImage) {
        const bmp = await createImageBitmap(file)
        engine.loadImage(bmp)
        store.setHasImage(true)
      } else {
        const bmp = await createImageBitmap(file)
        const tmp = document.createElement('canvas')
        tmp.width = bmp.width
        tmp.height = bmp.height
        tmp.getContext('2d')!.drawImage(bmp, 0, 0)
        const data = tmp.getContext('2d')!.getImageData(0, 0, bmp.width, bmp.height)
        engine.importImageAsLayer(data, file.name.replace(/\.[^.]+$/, ''))
      }
      store.syncFromEngine()
    } catch (err) {
      console.error('Failed to import image:', err)
    }
  }
}
