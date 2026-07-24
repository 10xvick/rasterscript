/* eslint-disable react-refresh/only-export-components */
import { useEffect, useRef } from 'react'
import { Grid } from 'lucide-react'
import type { EditorPlugin, PluginOverlayProps, PluginPanelProps } from '../../core/types'
import { useEditorStore } from '../../store/useEditorStore'
import { usePixelationStore } from './usePixelationStore'

// ─── Constants & Color Math ──────────────────────────────────────────────────

const BAYER_4X4 = [
  [ 0,  8,  2, 10],
  [12,  4, 14,  6],
  [ 3, 11,  1,  9],
  [15,  7, 13,  5]
]

const PALETTES: Record<string, number[][]> = {
  'monochrome': [
    [0, 0, 0],
    [255, 255, 255]
  ],
  'gameboy': [
    [15, 56, 15],
    [48, 98, 48],
    [139, 172, 139],
    [155, 188, 15]
  ],
  'pico-8': [
    [0, 0, 0], [29, 43, 83], [126, 37, 83], [0, 135, 81],
    [171, 82, 54], [95, 87, 79], [194, 195, 199], [255, 241, 232],
    [255, 0, 77], [255, 163, 0], [255, 236, 39], [0, 228, 54],
    [41, 173, 255], [131, 118, 156], [255, 119, 168], [255, 204, 170]
  ],
  'cga': [
    [0, 0, 0],
    [85, 255, 255],
    [255, 85, 255],
    [255, 255, 255]
  ]
}

function findClosestColor(r: number, g: number, b: number, palette: number[][]): number[] {
  let minDistance = Infinity
  let closest = palette[0]
  for (const color of palette) {
    const dist = Math.pow(r - color[0], 2) + Math.pow(g - color[1], 2) + Math.pow(b - color[2], 2)
    if (dist < minDistance) {
      minDistance = dist
      closest = color
    }
  }
  return closest
}

// ─── Pixelation Processing Logic ─────────────────────────────────────────────

function applyPixelationEffect(
  src: HTMLCanvasElement,
  dst: HTMLCanvasElement,
  blockSize: number,
  paletteStyle: string,
  posterizeLevels: number,
  ditherStrength: number
) {
  const w = src.width
  const h = src.height
  if (w === 0 || h === 0) return

  dst.width = w
  dst.height = h
  const dCtx = dst.getContext('2d')!

  if (blockSize === 1 && paletteStyle === 'true-color') {
    dCtx.drawImage(src, 0, 0)
    return
  }

  // 1. Create a downscaled temporary canvas
  const downW = Math.max(1, Math.floor(w / blockSize))
  const downH = Math.max(1, Math.floor(h / blockSize))

  const tempCanvas = document.createElement('canvas')
  tempCanvas.width = downW
  tempCanvas.height = downH
  const tempCtx = tempCanvas.getContext('2d')!
  
  // Downsample
  tempCtx.drawImage(src, 0, 0, downW, downH)

  // 2. Perform Javascript Color Mapping and Dithering
  const imgData = tempCtx.getImageData(0, 0, downW, downH)
  const data = imgData.data

  const activePalette = PALETTES[paletteStyle]
  const ditherFactor = (ditherStrength / 100) * 55 // scale dither intensity

  for (let y = 0; y < downH; y++) {
    for (let x = 0; x < downW; x++) {
      const idx = (y * downW + x) * 4
      let r = data[idx]
      let g = data[idx + 1]
      let b = data[idx + 2]
      const a = data[idx + 3]

      if (a === 0) continue

      // Apply ordered dithering offset
      if (ditherFactor > 0 && paletteStyle !== 'true-color') {
        const threshold = (BAYER_4X4[y % 4][x % 4] + 0.5) / 16 - 0.5
        r = Math.max(0, Math.min(255, r + threshold * ditherFactor))
        g = Math.max(0, Math.min(255, g + threshold * ditherFactor))
        b = Math.max(0, Math.min(255, b + threshold * ditherFactor))
      }

      if (activePalette) {
        // Palette Mapping
        const closest = findClosestColor(r, g, b, activePalette)
        data[idx]     = closest[0]
        data[idx + 1] = closest[1]
        data[idx + 2] = closest[2]
      } else if (paletteStyle === 'posterized') {
        // Quantized Posterization
        const bins = posterizeLevels
        data[idx]     = Math.round(r / 255 * (bins - 1)) / (bins - 1) * 255
        data[idx + 1] = Math.round(g / 255 * (bins - 1)) / (bins - 1) * 255
        data[idx + 2] = Math.round(b / 255 * (bins - 1)) / (bins - 1) * 255
      }
    }
  }

  tempCtx.putImageData(imgData, 0, 0)

  // 3. Draw tiny canvas back, scaled up using nearest-neighbor (pixelated) scaling
  dCtx.imageSmoothingEnabled = false
  dCtx.drawImage(tempCanvas, 0, 0, w, h)
}

// ─── Panel Component ─────────────────────────────────────────────────────────

function PixelationPanel({ context }: PluginPanelProps) {
  const { blockSize, paletteStyle, posterizeLevels, ditherStrength, previewTarget } = usePixelationStore()
  const setPixelation = usePixelationStore(s => s.setPixelation)

  const bakeToLayer = () => {
    // Bake to active layer
    const actCtx = context.getActiveLayerCtx()
    if (!actCtx) {
      alert('No active layer found to apply pixelation.')
      return
    }

    const layerCanvas = actCtx.canvas
    const tempOut = document.createElement('canvas')
    applyPixelationEffect(layerCanvas, tempOut, blockSize, paletteStyle, posterizeLevels, ditherStrength)

    const finalData = tempOut.getContext('2d')!.getImageData(0, 0, tempOut.width, tempOut.height)
    context.setImageData(finalData, true)
    alert('Baked pixelation effect into the active layer!')
  }

  const sl = 'w-full accent-violet-500 h-1.5'
  const lbl = 'text-[10px] text-neutral-400 uppercase font-medium flex justify-between'
  const sel = 'w-full bg-neutral-855 border border-neutral-700 rounded px-2 py-1 text-xs text-neutral-200 focus:outline-none focus:border-violet-500'

  return (
    <div className="p-3 space-y-4 text-xs h-full flex flex-col justify-between overflow-y-auto">
      <div className="space-y-4">
        <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-medium">Pixelation Filter</p>

        {/* Block Size */}
        <div>
          <div className={lbl}>
            <span>Pixel Size</span>
            <span className="text-violet-400 font-mono font-semibold">{blockSize}px</span>
          </div>
          <input
            type="range"
            min={1}
            max={64}
            value={blockSize}
            onChange={e => setPixelation({ blockSize: +e.target.value })}
            className={sl + ' mt-1.5'}
          />
        </div>

        {/* Palette Style */}
        <div className="space-y-1">
          <label className={lbl}>Color Palette Style</label>
          <select
            value={paletteStyle}
            onChange={e => setPixelation({ paletteStyle: e.target.value as 'true-color' | 'monochrome' | 'pico-8' | 'gameboy' | 'cga' | 'posterized' })}
            className={sel}
          >
            <option value="true-color">True Color (No Limit)</option>
            <option value="monochrome">Monochrome (2 Colors)</option>
            <option value="cga">CGA Retro (4 Colors)</option>
            <option value="gameboy">Game Boy LCD (4 Colors)</option>
            <option value="pico-8">PICO-8 Palette (16 Colors)</option>
            <option value="posterized">Posterized (Custom Levels)</option>
          </select>
        </div>

        {/* Posterize levels config */}
        {paletteStyle === 'posterized' && (
          <div>
            <div className={lbl}>
              <span>Color Quantization Bins</span>
              <span className="text-violet-400 font-mono font-semibold">{posterizeLevels}</span>
            </div>
            <input
              type="range"
              min={2}
              max={16}
              value={posterizeLevels}
              onChange={e => setPixelation({ posterizeLevels: +e.target.value })}
              className={sl + ' mt-1.5'}
            />
          </div>
        )}

        {/* Dither strength */}
        {paletteStyle !== 'true-color' && (
          <div>
            <div className={lbl}>
              <span>Dithering Strength</span>
              <span className="text-violet-400 font-mono font-semibold">{ditherStrength}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={ditherStrength}
              onChange={e => setPixelation({ ditherStrength: +e.target.value })}
              className={sl + ' mt-1.5'}
            />
          </div>
        )}

        {/* Preview Target */}
        <div className="space-y-1 border-t border-neutral-850 pt-3">
          <label className={lbl}>Preview Target</label>
          <select
            value={previewTarget}
            onChange={e => setPixelation({ previewTarget: e.target.value as 'active' | 'composite' })}
            className={sel}
          >
            <option value="composite">Full Document Composite</option>
            <option value="active">Active Layer Only</option>
          </select>
        </div>
      </div>

      <div className="space-y-2 border-t border-neutral-850 pt-3">
        <button
          onClick={bakeToLayer}
          className="w-full py-2 rounded bg-violet-600 hover:bg-violet-500 text-xs font-semibold text-white transition-colors"
        >
          Bake to Active Layer
        </button>
      </div>
    </div>
  )
}

// ─── Overlay Component ───────────────────────────────────────────────────────

function PixelationOverlay({ context }: PluginOverlayProps) {
  const { blockSize, paletteStyle, posterizeLevels, ditherStrength, previewTarget } = usePixelationStore()
  const engine = useEditorStore(s => s.engine)
  const zoom   = useEditorStore(s => s.zoom)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!engine) return

    const overlayCanvas = canvasRef.current
    if (!overlayCanvas) return

    const drawPreview = () => {
      let sourceCanvas: HTMLCanvasElement | null = null

      if (previewTarget === 'active') {
        const actCtx = context.getActiveLayerCtx()
        if (actCtx) {
          sourceCanvas = actCtx.canvas
        }
      } else {
        sourceCanvas = context.canvas
      }

      if (!sourceCanvas) return

      applyPixelationEffect(
        sourceCanvas,
        overlayCanvas,
        blockSize,
        paletteStyle,
        posterizeLevels,
        ditherStrength
      )
    }

    // Draw on settings change
    drawPreview()

    // Subscribe to engine changes (live drawing, plays, canvas modifications)
    const unsubscribe = engine.subscribe(drawPreview)
    return () => { unsubscribe() }
  }, [engine, context, blockSize, paletteStyle, posterizeLevels, ditherStrength, previewTarget])

  const w = context.getWidth()
  const h = context.getHeight()

  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{
        width: w * zoom,
        height: h * zoom,
      }}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        style={{
          imageRendering: 'pixelated',
        }}
      />
    </div>
  )
}

// ─── Plugin Definition ────────────────────────────────────────────────────────

export const pixelationPlugin: EditorPlugin = {
  id: 'pixelation',
  name: 'Pixelate',
  icon: <Grid size={18} />,
  category: 'filter',
  Panel: PixelationPanel,
  CanvasOverlay: PixelationOverlay,
}
