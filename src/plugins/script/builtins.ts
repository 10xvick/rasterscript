/** Built-in script templates shipped with the editor */

export interface BuiltinScript {
  id: string
  name: string
  description: string
  code: string
}

export const BUILTIN_SCRIPTS: BuiltinScript[] = [
  {
    id: 'builtin:showcase',
    name: '📚 API Showcase (Start Here!)',
    description: 'Comprehensive example demonstrating all major ScriptAPI features.',
    code: `// ═══════════════════════════════════════════════════════════════════════════════
// PixelCraft Script API Showcase
// ═══════════════════════════════════════════════════════════════════════════════
// This script demonstrates all major features of the ScriptAPI.
// Uncomment sections below to try different operations.

api.log('=== PixelCraft Script API Showcase ===');
api.log(\`Canvas size: \${api.canvas.width}×\${api.canvas.height}\`);

// ─────────────────────────────────────────────────────────────────────────────
// 1. PIXEL TRANSFORMS (forEach)
// ─────────────────────────────────────────────────────────────────────────────
// Modify every pixel with a callback: (r, g, b, a, x, y) => [r, g, b, a]

// Example: Grayscale
// api.forEach((r, g, b, a) => {
//   const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
//   return [gray, gray, gray, a];
// });
// api.log('✓ Grayscale applied');

// Example: Invert colors
// api.forEach((r, g, b, a) => [255 - r, 255 - g, 255 - b, a]);
// api.log('✓ Colors inverted');

// Example: Increase brightness by 20%
// api.forEach((r, g, b, a) => [
//   Math.min(255, r * 1.2),
//   Math.min(255, g * 1.2),
//   Math.min(255, b * 1.2),
//   a
// ]);
// api.log('✓ Brightness increased');

// ─────────────────────────────────────────────────────────────────────────────
// 2. IMAGE OPERATIONS
// ─────────────────────────────────────────────────────────────────────────────

// Resize the image
// api.resize(512, 512, true); // width, height, smooth
// api.log('✓ Resized to 512×512');

// Crop to a region
// api.crop(50, 50, 200, 200); // x, y, width, height
// api.log('✓ Cropped to (50,50) 200×200');

// Rotate 90 degrees clockwise
// api.rotate(90);
// api.log('✓ Rotated 90°');

// Flip horizontally
// api.flip('h');
// api.log('✓ Flipped horizontally');

// ─────────────────────────────────────────────────────────────────────────────
// 3. GET/SET IMAGE DATA
// ─────────────────────────────────────────────────────────────────────────────

// Get current image data
// const data = api.getImageData();
// api.log(\`Image data: \${data.width}×\${data.height}, \${data.data.length} bytes\`);

// Modify and set back
// const data = api.getImageData();
// // ... modify data.data (Uint8ClampedArray) ...
// api.setImageData(data); // pushes to history

// ─────────────────────────────────────────────────────────────────────────────
// 4. SPRITESHEET SLICING
// ─────────────────────────────────────────────────────────────────────────────

// Extract a 4×4 grid of sprites, trim alpha, download as PNGs
// const blobs = await api.sliceSprite(4, 4, {
//   download: true,
//   prefix: 'sprite',
//   trimAlpha: true,
// });
// api.log(\`✓ Extracted \${blobs.length} sprites\`);

// ─────────────────────────────────────────────────────────────────────────────
// 5. DOWNLOADS
// ─────────────────────────────────────────────────────────────────────────────

// Download current canvas as PNG
// const blob = await new Promise(res => api.canvas.toBlob(res, 'image/png'));
// api.download(blob, 'my-image.png');
// api.log('✓ Downloaded as PNG');

// Download multiple files at once
// const blobs = [blob1, blob2, blob3];
// api.downloadAll(blobs, 'export'); // creates export_0.png, export_1.png, etc.

// ─────────────────────────────────────────────────────────────────────────────
// 6. LOGGING
// ─────────────────────────────────────────────────────────────────────────────

api.log('✓ Script completed successfully!');
api.log('Try uncommenting sections above to experiment with different operations.');
api.log('');
api.log('📖 Full API Reference:');
api.log('  • api.canvas: HTMLCanvasElement');
api.log('  • api.ctx: CanvasRenderingContext2D');
api.log('  • api.getImageData(): ImageData');
api.log('  • api.setImageData(data, label?): void');
api.log('  • api.forEach(fn): void');
api.log('  • api.resize(w, h, smooth?): void');
api.log('  • api.crop(x, y, w, h): void');
api.log('  • api.rotate(degrees): void');
api.log('  • api.flip(direction): void');
api.log('  • api.sliceSprite(cols, rows, options): Promise<Blob[]>');
api.log('  • api.download(blob, filename): void');
api.log('  • api.downloadAll(blobs, prefix): void');
api.log('  • api.log(...args): void');
`,
  },
  {
    id: 'builtin:spritesheet',
    name: 'Slice Spritesheet',
    description: 'Extract cells from a sprite sheet, trim alpha per cell, and download as PNGs.',
    code: `// Slice Spritesheet
// Splits the current image into a grid of cells and downloads each as a PNG.
// Pixels that are fully transparent are trimmed from each cell.

const COLS = 4;   // ← number of columns
const ROWS = 4;   // ← number of rows
const PREFIX = 'sprite'; // ← filename prefix

api.log(\`Slicing \${COLS}×\${ROWS} grid from \${api.canvas.width}×\${api.canvas.height}...\`);

const blobs = await api.sliceSprite(COLS, ROWS, {
  download: true,
  prefix: PREFIX,
  trimAlpha: true,
});

api.log(\`Done! Exported \${blobs.length} sprites.\`);
`,
  },
  {
    id: 'builtin:remove-alpha',
    name: 'Remove Alpha Channel',
    description: 'Flatten transparency to a solid background colour.',
    code: `// Remove Alpha Channel
// Composites the image onto a solid background, removing transparency.

const BG_COLOR = '#ffffff'; // ← background colour

const w = api.canvas.width;
const h = api.canvas.height;

const tmp = document.createElement('canvas');
tmp.width = w; tmp.height = h;
const t = tmp.getContext('2d');
t.fillStyle = BG_COLOR;
t.fillRect(0, 0, w, h);
t.drawImage(api.canvas, 0, 0);

api.setImageData(t.getImageData(0, 0, w, h), 'Remove Alpha');
api.log('Alpha removed — background is now ' + BG_COLOR);
`,
  },
  {
    id: 'builtin:pixel-sort',
    name: 'Per-pixel Remap (Example)',
    description: 'Demonstrates forEach — swaps red and blue channels.',
    code: `// Swap R and B channels
api.forEach((r, g, b, a) => [b, g, r, a]);
api.log('Channels swapped!');
`,
  },
  {
    id: 'builtin:export-all-sizes',
    name: 'Export Multi-size',
    description: 'Export the current image at multiple resolutions (e.g. for app icons).',
    code: `// Export current image at multiple sizes
const SIZES = [16, 32, 64, 128, 256, 512];
const w = api.canvas.width;
const h = api.canvas.height;

for (const size of SIZES) {
  const tmp = document.createElement('canvas');
  tmp.width = size; tmp.height = size;
  const t = tmp.getContext('2d');
  t.imageSmoothingEnabled = true;
  t.imageSmoothingQuality = 'high';
  t.drawImage(api.canvas, 0, 0, size, size);
  const blob = await new Promise(res => tmp.toBlob(res, 'image/png'));
  api.download(blob, \`icon_\${size}x\${size}.png\`);
  api.log(\`Exported \${size}×\${size}\`);
}
`,
  },
  {
    id: 'builtin:threshold',
    name: 'Threshold',
    description: 'Convert to black & white by a luminance threshold.',
    code: `// Threshold filter
const THRESHOLD = 128; // 0–255

api.forEach((r, g, b, a) => {
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const v = lum >= THRESHOLD ? 255 : 0;
  return [v, v, v, a];
});
api.log('Threshold applied at ' + THRESHOLD);
`,
  },
]
