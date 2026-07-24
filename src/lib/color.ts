/**
 * Shared color utilities.
 *
 * Single source of truth for any colour math used across the whole app.
 * No React, no store imports — pure functions only.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RGB { r: number; g: number; b: number }

// ─── Hex / RGB conversion ─────────────────────────────────────────────────────

/**
 * Parse a 6-digit CSS hex string (e.g. `"#00ff00"`) into an RGB triple.
 * Returns `{ r: 0, g: 0, b: 0 }` for malformed input.
 */
export function hexToRgb(hex: string): RGB {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return {
    r: isNaN(r) ? 0 : r,
    g: isNaN(g) ? 0 : g,
    b: isNaN(b) ? 0 : b,
  }
}

// ─── Chroma Key ───────────────────────────────────────────────────────────────

/**
 * In-place chroma-key pass on a raw RGBA `Uint8ClampedArray`.
 *
 * Pixels whose Euclidean RGB distance from `keyRgb` is less than `threshold`
 * are made fully transparent (alpha = 0). All other channels are untouched.
 *
 * @param data      - The raw pixel buffer (modified in place).
 * @param keyRgb    - The colour to key out.
 * @param threshold - Distance threshold in RGB space (0–441, typical: 30–100).
 */
export function chromaKey(
  data: Uint8ClampedArray,
  keyRgb: RGB,
  threshold: number,
): void {
  const { r: kr, g: kg, b: kb } = keyRgb
  for (let i = 0; i < data.length; i += 4) {
    const dr = data[i]     - kr
    const dg = data[i + 1] - kg
    const db = data[i + 2] - kb
    if (Math.sqrt(dr * dr + dg * dg + db * db) < threshold) {
      data[i + 3] = 0
    }
  }
}
