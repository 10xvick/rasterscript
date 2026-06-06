# ScriptAPI Documentation

The **ScriptAPI** is a powerful JavaScript/TypeScript interface that lets you write custom image processing scripts. Every script runs in a sandboxed async function with full access to the canvas and image data.

---

## Quick Start

1. Open the **Script** tool in the editor
2. Select **"📚 API Showcase (Start Here!)"** to see all features
3. Uncomment sections to experiment
4. Click **"Run Script"** to execute
5. View output in the console below

---

## API Reference

### Canvas Access

#### `api.canvas`
- **Type:** `HTMLCanvasElement`
- **Description:** Direct access to the canvas element
- **Example:**
  ```js
  const width = api.canvas.width
  const height = api.canvas.height
  api.log(`Canvas: ${width}×${height}`)
  ```

#### `api.ctx`
- **Type:** `CanvasRenderingContext2D`
- **Description:** 2D rendering context for direct canvas manipulation
- **Example:**
  ```js
  api.ctx.fillStyle = 'red'
  api.ctx.fillRect(10, 10, 50, 50)
  ```

---

## Image Data Operations

### `api.getImageData()`
- **Returns:** `ImageData` — pixel data as `{ width, height, data: Uint8ClampedArray }`
- **Description:** Get the current image as raw pixel data
- **Example:**
  ```js
  const data = api.getImageData()
  api.log(`Pixels: ${data.width}×${data.height}`)
  ```

### `api.setImageData(data, label?)`
- **Parameters:**
  - `data: ImageData` — modified pixel data
  - `label?: string` — optional history label (default: "Script")
- **Description:** Replace canvas with new image data and push to history
- **Example:**
  ```js
  const data = api.getImageData()
  // ... modify data.data ...
  api.setImageData(data, 'My Custom Effect')
  ```

---

## Pixel Transforms

### `api.forEach(callback)`
- **Parameters:**
  - `callback: (r, g, b, a, x, y) => [r, g, b, a]`
- **Description:** Modify every pixel with a callback function
- **Returns:** `[r, g, b, a]` — new RGBA values (0–255)
- **Performance:** Optimized for large images

#### Examples

**Grayscale:**
```js
api.forEach((r, g, b, a) => {
  const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return [gray, gray, gray, a]
})
```

**Invert Colors:**
```js
api.forEach((r, g, b, a) => [255 - r, 255 - g, 255 - b, a])
```

**Swap Red & Blue Channels:**
```js
api.forEach((r, g, b, a) => [b, g, r, a])
```

**Increase Brightness:**
```js
api.forEach((r, g, b, a) => [
  Math.min(255, r * 1.2),
  Math.min(255, g * 1.2),
  Math.min(255, b * 1.2),
  a
])
```

**Sepia Tone:**
```js
api.forEach((r, g, b, a) => {
  const out_r = Math.min(255, r * 0.393 + g * 0.769 + b * 0.189)
  const out_g = Math.min(255, r * 0.349 + g * 0.686 + b * 0.168)
  const out_b = Math.min(255, r * 0.272 + g * 0.534 + b * 0.131)
  return [out_r, out_g, out_b, a]
})
```

**Threshold (B&W):**
```js
api.forEach((r, g, b, a) => {
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
  const v = lum >= 128 ? 255 : 0
  return [v, v, v, a]
})
```

---

## Image Transformations

### `api.resize(width, height, smooth?)`
- **Parameters:**
  - `width: number` — target width in pixels
  - `height: number` — target height in pixels
  - `smooth?: boolean` — use smooth interpolation (default: true)
- **Description:** Resize the image
- **Example:**
  ```js
  api.resize(512, 512, true)
  api.log('Resized to 512×512')
  ```

### `api.crop(x, y, width, height)`
- **Parameters:**
  - `x: number` — left offset
  - `y: number` — top offset
  - `width: number` — crop width
  - `height: number` — crop height
- **Description:** Crop to a rectangular region
- **Example:**
  ```js
  api.crop(50, 50, 200, 200)
  api.log('Cropped to (50,50) 200×200')
  ```

### `api.rotate(degrees)`
- **Parameters:**
  - `degrees: number` — rotation angle (90, 180, 270, -90, etc.)
- **Description:** Rotate the image by 90° increments
- **Example:**
  ```js
  api.rotate(90)  // Rotate 90° clockwise
  api.rotate(-90) // Rotate 90° counter-clockwise
  ```

### `api.flip(direction)`
- **Parameters:**
  - `direction: 'h' | 'v'` — 'h' for horizontal, 'v' for vertical
- **Description:** Flip the image
- **Example:**
  ```js
  api.flip('h')  // Flip horizontally (mirror)
  api.flip('v')  // Flip vertically
  ```

---

## Spritesheet Operations

### `api.sliceSprite(cols, rows, options?)`
- **Parameters:**
  - `cols: number` — number of columns in the grid
  - `rows: number` — number of rows in the grid
  - `options?: object`:
    - `download?: boolean` — auto-download as PNGs (default: false)
    - `prefix?: string` — filename prefix (default: 'sprite')
    - `trimAlpha?: boolean` — trim transparent pixels per cell (default: false)
- **Returns:** `Promise<Blob[]>` — array of PNG blobs
- **Description:** Extract cells from a spritesheet grid
- **Example:**
  ```js
  const blobs = await api.sliceSprite(4, 4, {
    download: true,
    prefix: 'sprite',
    trimAlpha: true,
  })
  api.log(`Extracted ${blobs.length} sprites`)
  ```

---

## File Downloads

### `api.download(blob, filename)`
- **Parameters:**
  - `blob: Blob` — file data
  - `filename: string` — download filename
- **Description:** Trigger a browser download
- **Example:**
  ```js
  const blob = await new Promise(res => api.canvas.toBlob(res, 'image/png'))
  api.download(blob, 'my-image.png')
  ```

### `api.downloadAll(blobs, prefix)`
- **Parameters:**
  - `blobs: Blob[]` — array of files
  - `prefix: string` — filename prefix
- **Description:** Download multiple files with auto-numbered names
- **Example:**
  ```js
  const blobs = [blob1, blob2, blob3]
  api.downloadAll(blobs, 'export')
  // Downloads: export_0.png, export_1.png, export_2.png
  ```

---

## Logging

### `api.log(...args)`
- **Parameters:** Any number of values
- **Description:** Print to the script console
- **Example:**
  ```js
  api.log('Hello, world!')
  api.log('Value:', 42)
  api.log({ x: 10, y: 20 })
  ```

---

## Complete Examples

### Example 1: Grayscale + Brightness

```js
// Convert to grayscale and increase brightness
api.forEach((r, g, b, a) => {
  const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b
  const bright = Math.min(255, gray * 1.3)
  return [bright, bright, bright, a]
})
api.log('✓ Grayscale + 30% brighter')
```

### Example 2: Export Icon Set

```js
// Export current image at multiple sizes for app icons
const SIZES = [16, 32, 64, 128, 256, 512]

for (const size of SIZES) {
  const tmp = document.createElement('canvas')
  tmp.width = size
  tmp.height = size
  const t = tmp.getContext('2d')
  t.imageSmoothingEnabled = true
  t.imageSmoothingQuality = 'high'
  t.drawImage(api.canvas, 0, 0, size, size)
  
  const blob = await new Promise(res => tmp.toBlob(res, 'image/png'))
  api.download(blob, `icon_${size}x${size}.png`)
  api.log(`✓ Exported ${size}×${size}`)
}
```

### Example 3: Extract Spritesheet

```js
// Extract a 4×4 spritesheet, trim alpha, download as PNGs
const blobs = await api.sliceSprite(4, 4, {
  download: true,
  prefix: 'sprite',
  trimAlpha: true,
})
api.log(`✓ Extracted ${blobs.length} sprites`)
```

### Example 4: Custom Pixel Effect

```js
// Create a pixelated/mosaic effect
const BLOCK_SIZE = 8

api.forEach((r, g, b, a, x, y) => {
  // Sample from block center
  const bx = Math.floor(x / BLOCK_SIZE) * BLOCK_SIZE + BLOCK_SIZE / 2
  const by = Math.floor(y / BLOCK_SIZE) * BLOCK_SIZE + BLOCK_SIZE / 2
  
  // Get pixel at block center
  const data = api.getImageData()
  const idx = (Math.floor(by) * data.width + Math.floor(bx)) * 4
  return [data.data[idx], data.data[idx+1], data.data[idx+2], data.data[idx+3]]
})
api.log('✓ Pixelated effect applied')
```

---

## Tips & Best Practices

### Performance
- **forEach is fast** — use it for pixel-level operations
- **Avoid repeated `getImageData()`** — cache the result
- **Use `smooth: false`** for pixel art to preserve sharpness

### Error Handling
```js
try {
  // Your code here
} catch (err) {
  api.log('Error:', err.message)
}
```

### Debugging
```js
api.log('Debug info:', { width: api.canvas.width, height: api.canvas.height })
```

### Async Operations
```js
// Scripts support async/await
const blob = await new Promise(res => api.canvas.toBlob(res))
api.download(blob, 'output.png')
```

---

## Limitations

- Scripts run in a **sandboxed async function** — no access to `window` or DOM (except canvas)
- **No network requests** — can't fetch external files
- **Limited to image operations** — no file system access
- **Execution timeout** — very long-running scripts may be terminated

---

## Keyboard Shortcuts

- **Ctrl+Enter** (or **Cmd+Enter** on Mac) — Run script
- **Ctrl+S** (or **Cmd+S**) — Save script

---

## Troubleshooting

### Script doesn't run
- Check the console for error messages
- Ensure syntax is valid JavaScript
- Make sure you're using `await` for async operations

### Changes don't appear
- Call `api.setImageData()` to apply changes
- Or use `api.forEach()` which auto-applies

### Performance is slow
- Reduce image size with `api.resize()`
- Avoid nested loops in `forEach`
- Use simpler pixel operations

---

## See Also

- **README.md** — Project overview and architecture
- **ARCHITECTURE.md** — Deep dive into design decisions
- **Built-in Scripts** — Select "📚 API Showcase" in the Script tool
