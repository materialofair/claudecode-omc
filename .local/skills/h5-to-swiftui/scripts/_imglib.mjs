/**
 * _imglib.mjs — Shared image primitives for h5-to-swiftui scripts
 *
 * Provides:
 *   loadPng(path)           → { width, height, data: Uint8Array (RGBA) }
 *   savePng(path, img)      → void  (writes RGBA raster as PNG)
 *   pHash(img)              → BigInt  (DCT 8x8 64-bit perceptual hash)
 *   hammingDistance(a, b)   → number  (0–64)
 *   ssimWindow(imgA, imgB, roi?, windowSize?) → number  (0–1)
 *   ciede2000Region(imgA, imgB, roi?) → { p50, p95, mean }
 *   resampleLanczos3(img, targetW, targetH) → img
 *   p3ToSrgb(img)           → img  (in-place sRGB conversion, relative colorimetric)
 *   cropRect(img, x, y, w, h) → img
 *   drawRect(img, x, y, w, h, r, g, b, a) → void  (in-place)
 *   drawFilledRect(img, x, y, w, h, r, g, b, alpha) → void  (in-place, alpha blend)
 *   bboxIoU(a, b) → number  (Intersection-over-Union for {x,y,w,h} rects)
 *
 * PNG backend: pngjs if installed; otherwise exits 2 with an actionable hint.
 *
 * All pixel data is RGBA (4 bytes per pixel, row-major).
 * Coordinate system: (0,0) = top-left.
 */

// ── PNG backend ───────────────────────────────────────────────────────────────

let PNG;

/**
 * Load the PNG codec.  Tries pngjs first; if unavailable prints a hint and
 * exits 2 so callers can distinguish "image dep missing" from other errors.
 */
export async function requirePng() {
  if (PNG) return PNG;
  try {
    const mod = await import('pngjs');
    PNG = mod.PNG;
    return PNG;
  } catch {
    console.error(
      '\nError: image dependency "pngjs" is not installed.\n\n' +
      'pixel-diff.mjs, calibrate-render.mjs, and mark-overlay.mjs require it.\n\n' +
      'Install it in the SKILL directory (or your project root) so that Node\n' +
      "ESM `import('pngjs')` can resolve it via normal node_modules lookup\n" +
      '(NODE_PATH is ignored by ESM):\n\n' +
      '  cd <h5-to-swiftui skill dir>   # the dir containing scripts/\n' +
      '  npm install pngjs\n\n' +
      'Then re-run the script.'
    );
    process.exit(2);
  }
}

// ── I/O ───────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync } from 'node:fs';

/**
 * Load a PNG file into { width, height, data: Uint8Array (RGBA) }.
 * Calls requirePng() internally — call it once at startup if you want the
 * dependency error to surface early.
 */
export async function loadPng(filePath) {
  const Png = await requirePng();
  const buf = readFileSync(filePath);
  return new Promise((resolve, reject) => {
    const png = new Png();
    png.parse(buf, (err, img) => {
      if (err) return reject(err);
      resolve({ width: img.width, height: img.height, data: new Uint8Array(img.data.buffer) });
    });
  });
}

/**
 * Write RGBA raster to a PNG file.
 */
export async function savePng(filePath, img) {
  const Png = await requirePng();
  const png = new Png({ width: img.width, height: img.height });
  png.data = Buffer.from(img.data.buffer);
  const buf = Png.sync.write(png);
  writeFileSync(filePath, buf);
}

// ── Perceptual hash (DCT 8x8) ─────────────────────────────────────────────────

/**
 * Compute a 64-bit perceptual hash using the standard DCT-hash approach:
 * resize to 32×32 grayscale → 32×32 DCT → top-left 8×8 AC → median → bitmask.
 * Returns a BigInt (64 bits).
 */
export function pHash(img) {
  const SIZE = 32;
  const small = resampleLanczos3(img, SIZE, SIZE);
  // Grayscale (luma BT.601)
  const gray = new Float64Array(SIZE * SIZE);
  for (let i = 0; i < SIZE * SIZE; i++) {
    const o = i * 4;
    gray[i] = 0.299 * small.data[o] + 0.587 * small.data[o + 1] + 0.114 * small.data[o + 2];
  }
  // 2-D DCT-II (separable)
  const dct = dct2d(gray, SIZE, SIZE);
  // Take top-left 8×8 (skip DC at [0,0])
  const ac = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      if (row === 0 && col === 0) continue;
      ac.push(dct[row * SIZE + col]);
    }
  }
  const median = quantile(ac, 0.5);
  // Build 64-bit hash (include DC slot as 0 for consistent length)
  let hash = 0n;
  let bit = 63n;
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const val = row === 0 && col === 0 ? 0 : dct[row * SIZE + col];
      if (val > median) hash |= (1n << bit);
      bit--;
    }
  }
  return hash;
}

/** Hamming distance between two BigInt hashes (0–64). */
export function hammingDistance(a, b) {
  let xor = a ^ b;
  let count = 0;
  while (xor) { xor &= xor - 1n; count++; }
  return count;
}

// ── SSIM ──────────────────────────────────────────────────────────────────────

/**
 * Compute SSIM over an optional ROI {x, y, w, h} (defaults to full image).
 * Uses an 8-pixel sliding window as per the calibration reference.
 * Returns a value in [0, 1].
 */
export function ssimWindow(imgA, imgB, roi, windowSize = 8) {
  const { x = 0, y = 0, w = imgA.width, h = imgA.height } = roi ?? {};

  const C1 = (0.01 * 255) ** 2;
  const C2 = (0.03 * 255) ** 2;
  let ssimSum = 0;
  let count = 0;

  const stepX = Math.max(1, Math.floor(windowSize / 2));
  const stepY = Math.max(1, Math.floor(windowSize / 2));

  for (let wy = y; wy + windowSize <= y + h; wy += stepY) {
    for (let wx = x; wx + windowSize <= x + w; wx += stepX) {
      let sumA = 0, sumB = 0, sumA2 = 0, sumB2 = 0, sumAB = 0, n = 0;
      for (let py = wy; py < wy + windowSize; py++) {
        for (let px = wx; px < wx + windowSize; px++) {
          const ia = (py * imgA.width + px) * 4;
          const ib = (py * imgB.width + px) * 4;
          const la = imgLuma(imgA.data, ia);
          const lb = imgLuma(imgB.data, ib);
          sumA += la; sumB += lb;
          sumA2 += la * la; sumB2 += lb * lb; sumAB += la * lb;
          n++;
        }
      }
      const muA = sumA / n, muB = sumB / n;
      const sigA2 = sumA2 / n - muA * muA;
      const sigB2 = sumB2 / n - muB * muB;
      const sigAB = sumAB / n - muA * muB;
      const num = (2 * muA * muB + C1) * (2 * sigAB + C2);
      const den = (muA * muA + muB * muB + C1) * (sigA2 + sigB2 + C2);
      ssimSum += den > 0 ? num / den : 1;
      count++;
    }
  }
  return count > 0 ? ssimSum / count : 1;
}

function imgLuma(data, offset) {
  return 0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2];
}

// ── CIEDE2000 ─────────────────────────────────────────────────────────────────

/**
 * Compute CIEDE2000 ΔE statistics over an optional ROI.
 * Returns { p50, p95, mean }.
 */
export function ciede2000Region(imgA, imgB, roi) {
  const { x = 0, y = 0, w = imgA.width, h = imgA.height } = roi ?? {};
  const deltas = [];

  for (let py = y; py < y + h; py++) {
    for (let px = x; px < x + w; px++) {
      const ia = (py * imgA.width + px) * 4;
      const ib = (py * imgB.width + px) * 4;
      const labA = srgbToLab(imgA.data[ia], imgA.data[ia + 1], imgA.data[ia + 2]);
      const labB = srgbToLab(imgB.data[ib], imgB.data[ib + 1], imgB.data[ib + 2]);
      deltas.push(ciede2000(labA, labB));
    }
  }

  deltas.sort((a, b) => a - b);
  const n = deltas.length;
  return {
    p50: n > 0 ? quantile(deltas, 0.5) : 0,
    p95: n > 0 ? quantile(deltas, 0.95) : 0,
    mean: n > 0 ? deltas.reduce((s, v) => s + v, 0) / n : 0,
  };
}

// sRGB → XYZ D65 → Lab
function srgbToLab(r, g, b) {
  const lin = (v) => {
    const n = v / 255;
    return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  };
  const lr = lin(r), lg = lin(g), lb = lin(b);
  // sRGB D65 matrix
  const X = 0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb;
  const Y = 0.2126729 * lr + 0.7151522 * lg + 0.0721750 * lb;
  const Z = 0.0193339 * lr + 0.1191920 * lg + 0.9503041 * lb;
  // D65 white point
  const xn = 0.95047, yn = 1.00000, zn = 1.08883;
  const f = (t) => t > 0.008856 ? t ** (1 / 3) : 7.787 * t + 16 / 116;
  const L = 116 * f(Y / yn) - 16;
  const a = 500 * (f(X / xn) - f(Y / yn));
  const bv = 200 * (f(Y / yn) - f(Z / zn));
  return { L, a, b: bv };
}

// CIEDE2000 formula
function ciede2000(lab1, lab2) {
  const { L: L1, a: a1, b: b1 } = lab1;
  const { L: L2, a: a2, b: b2 } = lab2;
  const avgL = (L1 + L2) / 2;
  const C1 = Math.sqrt(a1 * a1 + b1 * b1);
  const C2 = Math.sqrt(a2 * a2 + b2 * b2);
  const avgC = (C1 + C2) / 2;
  const avgC7 = avgC ** 7;
  const g = 0.5 * (1 - Math.sqrt(avgC7 / (avgC7 + 25 ** 7)));
  const a1p = a1 * (1 + g);
  const a2p = a2 * (1 + g);
  const C1p = Math.sqrt(a1p * a1p + b1 * b1);
  const C2p = Math.sqrt(a2p * a2p + b2 * b2);
  const h1p = Math.atan2(b1, a1p) * (180 / Math.PI) + (Math.atan2(b1, a1p) < 0 ? 360 : 0);
  const h2p = Math.atan2(b2, a2p) * (180 / Math.PI) + (Math.atan2(b2, a2p) < 0 ? 360 : 0);
  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  let dhp = h2p - h1p;
  if (C1p * C2p === 0) dhp = 0;
  else if (Math.abs(dhp) > 180) dhp += dhp < 0 ? 360 : -360;
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp * Math.PI / 180) / 2);
  const avgLp = (L1 + L2) / 2;
  const avgCp = (C1p + C2p) / 2;
  let avghp = (h1p + h2p) / 2;
  if (C1p * C2p !== 0 && Math.abs(h1p - h2p) > 180) {
    avghp += avghp < 180 ? 180 : -180;
  }
  const T =
    1 -
    0.17 * Math.cos((avghp - 30) * Math.PI / 180) +
    0.24 * Math.cos(2 * avghp * Math.PI / 180) +
    0.32 * Math.cos((3 * avghp + 6) * Math.PI / 180) -
    0.20 * Math.cos((4 * avghp - 63) * Math.PI / 180);
  const SL = 1 + 0.015 * (avgLp - 50) ** 2 / Math.sqrt(20 + (avgLp - 50) ** 2);
  const SC = 1 + 0.045 * avgCp;
  const SH = 1 + 0.015 * avgCp * T;
  const avgCp7 = avgCp ** 7;
  const RC = 2 * Math.sqrt(avgCp7 / (avgCp7 + 25 ** 7));
  const dTheta = 30 * Math.exp(-(((avghp - 275) / 25) ** 2));
  const RT = -Math.sin(2 * dTheta * Math.PI / 180) * RC;
  return Math.sqrt(
    (dLp / SL) ** 2 +
    (dCp / SC) ** 2 +
    (dHp / SH) ** 2 +
    RT * (dCp / SC) * (dHp / SH)
  );
}

// ── P3 → sRGB ─────────────────────────────────────────────────────────────────

/**
 * Convert Display-P3 pixel values to sRGB in-place (relative colorimetric).
 * Input/output: RGBA bytes (Uint8Array or Buffer).
 * Returns the same img object.
 */
export function p3ToSrgb(img) {
  const data = img.data;
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b] = p3PixelToSrgb(data[i], data[i + 1], data[i + 2]);
    data[i] = r; data[i + 1] = g; data[i + 2] = b;
  }
  return img;
}

function p3PixelToSrgb(r8, g8, b8) {
  // Linearize P3 (same gamma as sRGB)
  const lin = (v) => {
    const n = v / 255;
    return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  };
  const lr = lin(r8), lg = lin(g8), lb = lin(b8);
  // P3 D65 → XYZ
  const X = 0.4865709 * lr + 0.2656677 * lg + 0.1982173 * lb;
  const Y = 0.2289946 * lr + 0.6917385 * lg + 0.0792669 * lb;
  const Z = 0.0000000 * lr + 0.0451134 * lg + 1.0439444 * lb;
  // XYZ → sRGB D65
  const lR =  3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z;
  const lG = -0.9692660 * X + 1.8760108 * Y + 0.0415560 * Z;
  const lB =  0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z;
  // Gamma-encode
  const enc = (v) => {
    const c = Math.max(0, Math.min(1, v));
    return Math.round((c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055) * 255);
  };
  return [enc(lR), enc(lG), enc(lB)];
}

// ── Lanczos3 resampling ───────────────────────────────────────────────────────

/**
 * Resample img to targetW × targetH using a Lanczos-3 filter.
 * Returns a new image object.
 */
export function resampleLanczos3(img, targetW, targetH) {
  const out = {
    width: targetW,
    height: targetH,
    data: new Uint8Array(targetW * targetH * 4),
  };

  const lanczos = (x) => {
    if (x === 0) return 1;
    if (Math.abs(x) >= 3) return 0;
    const px = Math.PI * x;
    return 3 * Math.sin(px) * Math.sin(px / 3) / (px * px);
  };

  const scaleX = img.width / targetW;
  const scaleY = img.height / targetH;

  for (let dy = 0; dy < targetH; dy++) {
    for (let dx = 0; dx < targetW; dx++) {
      const srcX = (dx + 0.5) * scaleX - 0.5;
      const srcY = (dy + 0.5) * scaleY - 0.5;
      const x0 = Math.floor(srcX) - 2;
      const y0 = Math.floor(srcY) - 2;
      let r = 0, g = 0, b = 0, a = 0, wSum = 0;
      for (let ky = 0; ky < 6; ky++) {
        const py = Math.max(0, Math.min(img.height - 1, y0 + ky));
        const wy = lanczos(srcY - (y0 + ky));
        for (let kx = 0; kx < 6; kx++) {
          const px = Math.max(0, Math.min(img.width - 1, x0 + kx));
          const wx = lanczos(srcX - (x0 + kx));
          const w = wx * wy;
          const off = (py * img.width + px) * 4;
          r += w * img.data[off];
          g += w * img.data[off + 1];
          b += w * img.data[off + 2];
          a += w * img.data[off + 3];
          wSum += w;
        }
      }
      const doff = (dy * targetW + dx) * 4;
      out.data[doff]     = Math.max(0, Math.min(255, Math.round(r / wSum)));
      out.data[doff + 1] = Math.max(0, Math.min(255, Math.round(g / wSum)));
      out.data[doff + 2] = Math.max(0, Math.min(255, Math.round(b / wSum)));
      out.data[doff + 3] = Math.max(0, Math.min(255, Math.round(a / wSum)));
    }
  }
  return out;
}

// ── Crop ─────────────────────────────────────────────────────────────────────

/** Extract a rectangular sub-image. Returns new image object. */
export function cropRect(img, x, y, w, h) {
  const out = { width: w, height: h, data: new Uint8Array(w * h * 4) };
  for (let row = 0; row < h; row++) {
    const srcOff = ((y + row) * img.width + x) * 4;
    const dstOff = row * w * 4;
    out.data.set(img.data.subarray(srcOff, srcOff + w * 4), dstOff);
  }
  return out;
}

// ── Drawing primitives ────────────────────────────────────────────────────────

/** Draw a solid-colour border rectangle (outline only, 1px). In-place. */
export function drawRect(img, x, y, w, h, r, g, b, alpha = 255) {
  const setPixel = (px, py) => {
    if (px < 0 || px >= img.width || py < 0 || py >= img.height) return;
    const o = (py * img.width + px) * 4;
    img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = alpha;
  };
  for (let i = x; i < x + w; i++) { setPixel(i, y); setPixel(i, y + h - 1); }
  for (let j = y; j < y + h; j++) { setPixel(x, j); setPixel(x + w - 1, j); }
}

/** Draw a translucent filled rectangle with alpha blending. In-place. */
export function drawFilledRect(img, x, y, w, h, r, g, b, alpha) {
  const a01 = alpha / 255;
  const ia = 1 - a01;
  for (let py = Math.max(0, y); py < Math.min(img.height, y + h); py++) {
    for (let px = Math.max(0, x); px < Math.min(img.width, x + w); px++) {
      const o = (py * img.width + px) * 4;
      img.data[o]     = Math.round(r * a01 + img.data[o]     * ia);
      img.data[o + 1] = Math.round(g * a01 + img.data[o + 1] * ia);
      img.data[o + 2] = Math.round(b * a01 + img.data[o + 2] * ia);
      img.data[o + 3] = Math.min(255, img.data[o + 3] + alpha);
    }
  }
}

// ── IoU ───────────────────────────────────────────────────────────────────────

/** Intersection-over-Union for two {x, y, w, h} bounding boxes. */
export function bboxIoU(a, b) {
  const ix = Math.max(a.x, b.x);
  const iy = Math.max(a.y, b.y);
  const ix2 = Math.min(a.x + a.w, b.x + b.w);
  const iy2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, ix2 - ix) * Math.max(0, iy2 - iy);
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

// ── Internal math ─────────────────────────────────────────────────────────────

/** Quantile of a sorted array (linear interpolation). */
export function quantile(sorted, q) {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const pos = q * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const frac = pos - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

/** Separable 2-D DCT-II on a flat Float64Array of size rows×cols. */
function dct2d(signal, cols, rows) {
  const out = new Float64Array(rows * cols);
  // DCT-II row-wise
  const tmp = new Float64Array(rows * cols);
  for (let row = 0; row < rows; row++) {
    dct1d(signal, tmp, row * cols, cols);
  }
  // DCT-II column-wise
  const col1d = new Float64Array(rows);
  const col1dOut = new Float64Array(rows);
  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) col1d[row] = tmp[row * cols + col];
    dct1d(col1d, col1dOut, 0, rows);
    for (let row = 0; row < rows; row++) out[row * cols + col] = col1dOut[row];
  }
  return out;
}

function dct1d(input, output, offset, n) {
  for (let k = 0; k < n; k++) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      sum += input[offset + i] * Math.cos((Math.PI / n) * (i + 0.5) * k);
    }
    output[offset + k] = sum;
  }
}

// ── AA-tolerant diff mask ─────────────────────────────────────────────────────

/**
 * Build an AA-tolerant diff mask (pixelmatch YIQ / anti-aliasing detection).
 * Returns { mask: img, diffPixelCount, totalPixels }.
 *
 * mask pixels: { r:255, g:0, b:0 } = differing; { r:255,g:255,b:0 } = AA-skip; rest = transparent.
 */
export function buildDiffMask(imgA, imgB, threshold = 0.1) {
  const { width, height } = imgA;
  const mask = { width, height, data: new Uint8Array(width * height * 4) };
  let diffCount = 0;

  const yiq = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const ia = (py * width + px) * 4;
      const ib = (py * imgB.width + px) * 4;
      const dr = imgA.data[ia]     - imgB.data[ib];
      const dg = imgA.data[ia + 1] - imgB.data[ib + 1];
      const db = imgA.data[ia + 2] - imgB.data[ib + 2];
      const yDelta = Math.abs(yiq(dr, dg, db)) / 255;

      const mo = (py * width + px) * 4;
      if (yDelta <= threshold) {
        // same — leave transparent
        mask.data[mo + 3] = 0;
        continue;
      }

      // Check anti-aliasing: if pixel is part of an AA edge in either image, skip
      if (isAntialiased(imgA, px, py, width, height) ||
          isAntialiased(imgB, px, py, imgB.width, imgB.height)) {
        // AA skip — yellow
        mask.data[mo]     = 255;
        mask.data[mo + 1] = 255;
        mask.data[mo + 2] = 0;
        mask.data[mo + 3] = 200;
        continue;
      }

      // Real diff — red
      mask.data[mo]     = 255;
      mask.data[mo + 1] = 0;
      mask.data[mo + 2] = 0;
      mask.data[mo + 3] = 255;
      diffCount++;
    }
  }
  return { mask, diffPixelCount: diffCount, totalPixels: width * height };
}

function isAntialiased(img, px, py, w, h) {
  // Heuristic: check 3×3 neighbourhood for rapid luma transitions
  const getLuma = (x, y) => {
    if (x < 0 || x >= w || y < 0 || y >= h) return null;
    const o = (y * w + x) * 4;
    return 0.299 * img.data[o] + 0.587 * img.data[o + 1] + 0.114 * img.data[o + 2];
  };
  const center = getLuma(px, py);
  let minDelta = Infinity, maxDelta = -Infinity;
  let transitions = 0;
  let prev = null;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const v = getLuma(px + dx, py + dy);
      if (v === null) continue;
      const d = Math.abs(v - center);
      if (d < minDelta) minDelta = d;
      if (d > maxDelta) maxDelta = d;
      if (prev !== null && Math.abs(v - prev) > 10) transitions++;
      prev = v;
    }
  }
  return maxDelta > 10 && minDelta < 10 && transitions >= 2;
}
