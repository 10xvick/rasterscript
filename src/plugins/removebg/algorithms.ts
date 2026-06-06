// ─── Utilities ────────────────────────────────────────────────────────────────

function dist2(a: number[], b: number[]): number {
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2]
  return dr * dr + dg * dg + db * db
}

/**
 * K-means clustering. Returns `k` cluster centers.
 * Seeds are spread evenly through the sample array to avoid degenerate starts.
 */
function kmeans(samples: number[][], k: number, iters = 12): number[][] {
  const n = samples.length
  if (n === 0) return []
  k = Math.min(k, n)
  const step = Math.max(1, Math.floor(n / k))
  const centers: number[][] = Array.from({ length: k }, (_, i) => [...samples[i * step]])

  for (let it = 0; it < iters; it++) {
    const sums: number[][] = Array.from({ length: k }, () => [0, 0, 0])
    const counts = new Int32Array(k)
    for (const s of samples) {
      let best = 0, bd = Infinity
      for (let i = 0; i < k; i++) {
        const d = dist2(s, centers[i])
        if (d < bd) { bd = d; best = i }
      }
      sums[best][0] += s[0]; sums[best][1] += s[1]; sums[best][2] += s[2]
      counts[best]++
    }
    for (let i = 0; i < k; i++) {
      if (counts[i] > 0) centers[i] = sums[i].map(v => v / counts[i])
    }
  }
  return centers
}

/** Collect RGB values from the image border (within `bw` pixels). */
function sampleEdgePx(data: ImageData, bw = 4): number[][] {
  const { data: d, width: w, height: h } = data
  const out: number[][] = []
  const add = (x: number, y: number) => {
    const i = (y * w + x) * 4
    if (d[i + 3] > 10) out.push([d[i], d[i + 1], d[i + 2]])
  }
  for (let x = 0; x < w; x++) for (let b = 0; b < bw; b++) { add(x, b); add(x, h - 1 - b) }
  for (let y = bw; y < h - bw; y++) for (let b = 0; b < bw; b++) { add(b, y); add(w - 1 - b, y) }
  return out
}

/**
 * BFS flood-fill from all edge pixels.
 * Marks pixels as background if they are within `tolSq` (squared color distance)
 * of any cluster center AND are reachable from the image boundary.
 */
function floodFillBg(data: ImageData, centers: number[][], tolSq: number): Uint8Array {
  const { data: d, width: w, height: h } = data
  const visited = new Uint8Array(w * h)
  const queue: number[] = []

  const tryAdd = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return
    const idx = y * w + x
    if (visited[idx]) return
    const i = idx * 4
    if (d[i + 3] < 10) { visited[idx] = 1; return }       // fully-transparent → background
    const px = [d[i], d[i + 1], d[i + 2]]
    let minD = Infinity
    for (const c of centers) minD = Math.min(minD, dist2(px, c))
    if (minD <= tolSq) { visited[idx] = 1; queue.push(idx) }
  }

  for (let x = 0; x < w; x++) { tryAdd(x, 0); tryAdd(x, h - 1) }
  for (let y = 1; y < h - 1; y++) { tryAdd(0, y); tryAdd(w - 1, y) }

  while (queue.length) {
    const idx = queue.pop()!
    const x = idx % w, y = (idx / w) | 0
    tryAdd(x - 1, y); tryAdd(x + 1, y); tryAdd(x, y - 1); tryAdd(x, y + 1)
  }
  return visited
}

/**
 * Separable box blur on a Float32 alpha mask.
 * Two passes (horizontal + vertical). Equivalent to a tent blur; 3 applications
 * approximate a Gaussian. Used with r ≤ 20 so the O(n·r) cost is acceptable.
 */
function blurAlpha(src: Float32Array, w: number, h: number, r: number): Float32Array {
  if (r <= 0) return src
  const d = 2 * r + 1
  const tmp = new Float32Array(src.length)
  const out = new Float32Array(src.length)

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0
      for (let k = -r; k <= r; k++) s += src[y * w + Math.max(0, Math.min(w - 1, x + k))]
      tmp[y * w + x] = s / d
    }
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let s = 0
      for (let k = -r; k <= r; k++) s += tmp[Math.max(0, Math.min(h - 1, y + k)) * w + x]
      out[y * w + x] = s / d
    }
  }
  return out
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Auto background removal.
 *
 * Algorithm:
 *  1. Sample border pixels; cluster with K-means (k=3) to model the background.
 *  2. BFS flood-fill from edges — only pixels reachable from the border AND
 *     within `tolerance` colour distance of a BG cluster are marked background.
 *  3. Compute a soft alpha for flood-filled pixels based on their distance to
 *     the nearest cluster centre (pixels at the tolerance boundary get α≈0;
 *     interior-similar pixels that survived the flood fill keep a gradient edge).
 *  4. Box-blur the alpha mask by `feather` pixels for smooth edges.
 *
 * @param tolerance  0–1 fraction of full colour range (slider ÷ 100)
 * @param feather    blur radius in image pixels
 */
export function removeBgAuto(src: ImageData, tolerance: number, feather: number): ImageData {
  const { data, width: w, height: h } = src
  const samples = sampleEdgePx(src, 4)
  if (samples.length === 0) return src

  const centers = kmeans(samples, 3)
  const tolSq   = (tolerance * 255) ** 2
  const bgMask  = floodFillBg(src, centers, tolSq)

  const alpha = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) {
    if (!bgMask[i]) { alpha[i] = 1; continue }
    const pi = i * 4
    const px  = [data[pi], data[pi + 1], data[pi + 2]]
    let minD  = Infinity
    for (const c of centers) minD = Math.min(minD, dist2(px, c))
    alpha[i] = Math.min(1, Math.sqrt(minD) / (tolerance * 255))
  }

  const blurred = feather > 0 ? blurAlpha(alpha, w, h, Math.round(feather)) : alpha
  const out = new ImageData(new Uint8ClampedArray(data), w, h)
  for (let i = 0; i < w * h; i++) {
    out.data[i * 4 + 3] = Math.round(Math.min(1, Math.max(0, blurred[i])) * 255)
  }
  return out
}

/**
 * Guided background removal using user scribbles.
 *
 * Algorithm:
 *  1. Read scribble canvas: green pixels → foreground samples,
 *     red pixels → background samples (in original-image colour space).
 *  2. Cluster each sample set with K-means (k=3) to build colour models.
 *  3. For every image pixel compute the ratio:
 *       ratio = dist_to_nearest_BG_center / (dist_to_nearest_FG + dist_to_nearest_BG)
 *     Pass through a sigmoid (sharpened at 0.5) to get a soft alpha.
 *  4. Box-blur the alpha mask by `feather` pixels.
 *
 * @param scribbleData  ImageData from the scribble overlay canvas (display-space)
 * @param scribbleW/H   dimensions of the scribble canvas
 * @param feather       blur radius in image pixels
 */
export function removeBgGuided(
  src: ImageData,
  scribbleData: ImageData,
  scribbleW: number,
  scribbleH: number,
  feather: number,
): ImageData {
  const { data, width: w, height: h } = src
  const sd = scribbleData.data
  const scaleX = w / scribbleW
  const scaleY = h / scribbleH

  const fgSamples: number[][] = []
  const bgSamples: number[][] = []

  for (let sy = 0; sy < scribbleH; sy++) {
    for (let sx = 0; sx < scribbleW; sx++) {
      const si = (sy * scribbleW + sx) * 4
      const sr = sd[si], sg = sd[si + 1], sb = sd[si + 2], sa = sd[si + 3]
      if (sa < 50) continue
      const ix = Math.min(w - 1, Math.round(sx * scaleX))
      const iy = Math.min(h - 1, Math.round(sy * scaleY))
      const ii = (iy * w + ix) * 4
      const px = [data[ii], data[ii + 1], data[ii + 2]]
      if (sg > 150 && sr < 100 && sb < 100) fgSamples.push(px)       // green → FG
      else if (sr > 150 && sg < 100 && sb < 100) bgSamples.push(px)  // red   → BG
    }
  }

  if (fgSamples.length === 0 || bgSamples.length === 0) return src

  const fgCenters = kmeans(fgSamples, Math.min(3, fgSamples.length))
  const bgCenters = kmeans(bgSamples, Math.min(3, bgSamples.length))

  const alpha = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) {
    const pi = i * 4
    const px = [data[pi], data[pi + 1], data[pi + 2]]
    let minFg = Infinity, minBg = Infinity
    for (const c of fgCenters) minFg = Math.min(minFg, dist2(px, c))
    for (const c of bgCenters) minBg = Math.min(minBg, dist2(px, c))
    const sum = minFg + minBg
    const ratio = sum > 0 ? minBg / sum : 0.5
    // Sigmoid sharpened around the midpoint so edges stay soft but clear regions are hard
    alpha[i] = 1 / (1 + Math.exp(-12 * (ratio - 0.5)))
  }

  const blurred = feather > 0 ? blurAlpha(alpha, w, h, Math.round(feather)) : alpha
  const out = new ImageData(new Uint8ClampedArray(data), w, h)
  for (let i = 0; i < w * h; i++) {
    out.data[i * 4 + 3] = Math.round(Math.min(1, Math.max(0, blurred[i])) * 255)
  }
  return out
}
