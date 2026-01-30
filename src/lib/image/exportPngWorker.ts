type CropBox = { x: number; y: number; w: number; h: number };

type ExportRequest = {
  id: number;
  width: number;
  height: number;
  pixels: ArrayBuffer;
  crop?: CropBox | null;
  alphaThreshold?: number;
  padding?: number;
  format?: 'png' | 'webp' | 'jpg';
  quality?: number;
};

type ExportResponse = {
  id: number;
  blob?: Blob;
  format?: 'png' | 'webp' | 'jpg';
  error?: string;
};

function findNonTransparentBounds(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  alphaThreshold: number,
  padding: number,
): CropBox | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    const row = y * width * 4;
    for (let x = 0; x < width; x += 1) {
      const a = data[row + x * 4 + 3]!;
      if (a > alphaThreshold) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0 || maxY < 0) return null;

  const x0 = Math.max(0, minX - padding);
  const y0 = Math.max(0, minY - padding);
  const x1 = Math.min(width - 1, maxX + padding);
  const y1 = Math.min(height - 1, maxY + padding);

  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

function flipPixels(
  src: Uint8Array,
  width: number,
  height: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  const rowSize = width * 4;
  for (let y = 0; y < height; y += 1) {
    const srcRow = (height - 1 - y) * rowSize;
    const dstRow = y * rowSize;
    out.set(src.subarray(srcRow, srcRow + rowSize), dstRow);
  }
  return out;
}

function clampCrop(
  crop: CropBox,
  width: number,
  height: number,
): CropBox {
  const x = Math.max(0, Math.min(Math.round(crop.x), width - 1));
  const y = Math.max(0, Math.min(Math.round(crop.y), height - 1));
  const w0 = Math.max(1, Math.min(Math.round(crop.w), width - x));
  const h0 = Math.max(1, Math.min(Math.round(crop.h), height - y));
  return { x, y, w: w0, h: h0 };
}

function extractCrop(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  crop: CropBox,
): { data: Uint8ClampedArray; width: number; height: number } {
  const c = clampCrop(crop, width, height);
  const out = new Uint8ClampedArray(c.w * c.h * 4);
  const srcRowSize = width * 4;
  const dstRowSize = c.w * 4;
  for (let y = 0; y < c.h; y += 1) {
    const srcStart = (c.y + y) * srcRowSize + c.x * 4;
    const dstStart = y * dstRowSize;
    out.set(data.subarray(srcStart, srcStart + dstRowSize), dstStart);
  }
  return { data: out, width: c.w, height: c.h };
}

async function buildPngBlob(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  format: 'png' | 'webp' | 'jpg',
  quality: number,
): Promise<{ blob: Blob; format: 'png' | 'webp' | 'jpg' }> {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建输出 2D 上下文（worker）');
  const img = new ImageData(width, height);
  img.data.set(data);
  ctx.putImageData(img, 0, 0);
  const type = format === 'png'
    ? 'image/png'
    : format === 'webp'
      ? 'image/webp'
      : 'image/jpeg';
  if (format === 'webp') {
    try {
      const blob = await canvas.convertToBlob({
        type,
        quality,
        lossless: true,
      } as any);
      return { blob, format: 'webp' };
    }
    catch {
      const blob = await canvas.convertToBlob({ type: 'image/png' });
      return { blob, format: 'png' };
    }
  }
  const blob = await canvas.convertToBlob({ type, quality });
  return { blob, format };
}

self.onmessage = async (ev: MessageEvent<ExportRequest>) => {
  const {
    id,
    width,
    height,
    pixels,
    crop,
    alphaThreshold = 8,
    padding = 3,
    format = 'png',
    quality = 0.92,
  } = ev.data;
  try {
    const src = new Uint8Array(pixels);
    const flipped = flipPixels(src, width, height);

    let outData = flipped;
    let outW = width;
    let outH = height;

    if (crop && crop.w > 0 && crop.h > 0) {
      const cropped = extractCrop(flipped, width, height, crop);
      outData = cropped.data;
      outW = cropped.width;
      outH = cropped.height;
    }
    else {
      const bounds = findNonTransparentBounds(flipped, width, height, alphaThreshold, padding);
      if (bounds) {
        const cropped = extractCrop(flipped, width, height, bounds);
        outData = cropped.data;
        outW = cropped.width;
        outH = cropped.height;
      }
    }

    const res = await buildPngBlob(outData, outW, outH, format, quality);
    (self as any).postMessage({ id, blob: res.blob, format: res.format } as ExportResponse);
  }
  catch (err) {
    (self as any).postMessage({ id, error: (err as Error).message } as ExportResponse);
  }
};
