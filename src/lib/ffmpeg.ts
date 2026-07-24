import { FFmpeg } from '@ffmpeg/ffmpeg'
import { toBlobURL } from '@ffmpeg/util'

/**
 * App-wide FFmpeg singleton.
 *
 * Previously embedded inside `plugins/spritesheet/index.tsx`, this module
 * is the single place responsible for loading the WASM binary. Any plugin
 * (spritesheet, video editor, etc.) that needs FFmpeg calls `getFFmpeg()` and
 * receives the same shared instance — the binary is only fetched once.
 */

let ffmpegInstance: FFmpeg | null = null
let loadPromise: Promise<FFmpeg> | null = null

/**
 * Returns the shared, loaded FFmpeg instance.
 *
 * The first caller triggers the one-time WASM load. Subsequent callers
 * await the same promise and receive the already-loaded instance.
 *
 * @param onLog - Optional callback for FFmpeg log messages.
 */
export async function getFFmpeg(onLog?: (msg: string) => void): Promise<FFmpeg> {
  if (ffmpegInstance) {
    if (onLog) ffmpegInstance.on('log', ({ message }) => onLog(message))
    return ffmpegInstance
  }

  if (loadPromise) return loadPromise

  loadPromise = (async () => {
    const ffmpeg = new FFmpeg()
    if (onLog) {
      ffmpeg.on('log', ({ message }) => onLog(message))
    }
    const base = window.location.origin + '/tools/image/rasterscript/ffmpeg'
    await ffmpeg.load({
      coreURL: await toBlobURL(`${base}/ffmpeg-core.js`,   'text/javascript'),
      wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
    })
    ffmpegInstance = ffmpeg
    return ffmpeg
  })()

  return loadPromise
}

/** True if the FFmpeg WASM binary has been loaded already. */
export function isFFmpegReady(): boolean {
  return ffmpegInstance !== null
}
