export type CropBounds = { x: number; y: number; w: number; h: number };

export type AlphaCropOptions = {
  /** alpha 阈值：0~255。越大越“严格”，默认 8 */
  alphaThreshold?: number;
  /** 裁剪外扩像素，防止锯齿边缘被切掉，默认 3 */
  padding?: number;
  /** 裁剪失败（全透明）时是否返回原图，默认 true */
  fallbackToFull?: boolean;
};

/**
 * 在 ImageData 中寻找“非透明像素”的最小外接矩形。
 *
 * Args:
 *   img (ImageData): 输入像素数据
 *   options (AlphaCropOptions): alpha 阈值、padding 等
 *
 * Returns:
 *   CropBounds | null: 若全透明则返回 null
 */
export function findNonTransparentBounds(
  img: ImageData,
  options: AlphaCropOptions = {}
): CropBounds | null {
  const alphaThreshold = options.alphaThreshold ?? 8;
  const padding = options.padding ?? 3;

  const { width, height, data } = img;

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    const row = y * width * 4;
    for (let x = 0; x < width; x += 1) {
      const a = data[row + x * 4 + 3];
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

/**
 * 把任意 canvas 复制到 2D canvas（便于 getImageData）。
 *
 * Args:
 *   src (HTMLCanvasElement): 源 canvas（WebGL 或 2D）
 *
 * Returns:
 *   HTMLCanvasElement: 复制后的 2D canvas
 */
export function copyTo2dCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const tmp = document.createElement("canvas");
  tmp.width = src.width;
  tmp.height = src.height;

  const ctx = tmp.getContext("2d");
  if (!ctx) throw new Error("无法创建 2D 上下文（copyTo2dCanvas）");

  ctx.clearRect(0, 0, tmp.width, tmp.height);
  ctx.drawImage(src, 0, 0);
  return tmp;
}

/**
 * 按 alpha 自动裁剪 canvas，返回裁剪后的新 canvas。
 *
 * Args:
 *   src (HTMLCanvasElement): 输入 canvas
 *   options (AlphaCropOptions): 裁剪参数
 *
 * Returns:
 *   { canvas, bounds }: 裁剪结果 canvas 与裁剪框（相对原图像素坐标）
 */
export function cropCanvasByAlpha(
  src: HTMLCanvasElement,
  options: AlphaCropOptions = {}
): { canvas: HTMLCanvasElement; bounds: CropBounds } {
  const fallbackToFull = options.fallbackToFull ?? true;

  const tmp = copyTo2dCanvas(src);
  const ctx = tmp.getContext("2d");
  if (!ctx) throw new Error("无法创建 2D 上下文（cropCanvasByAlpha）");

  const img = ctx.getImageData(0, 0, tmp.width, tmp.height);
  const bounds = findNonTransparentBounds(img, options);

  const crop =
    bounds ??
    (fallbackToFull ? { x: 0, y: 0, w: tmp.width, h: tmp.height } : null);
  if (!crop) {
    // 全透明且不允许 fallback
    const empty = document.createElement("canvas");
    empty.width = 1;
    empty.height = 1;
    return { canvas: empty, bounds: { x: 0, y: 0, w: 1, h: 1 } };
  }

  const out = document.createElement("canvas");
  out.width = crop.w;
  out.height = crop.h;

  const outCtx = out.getContext("2d");
  if (!outCtx) throw new Error("无法创建输出 2D 上下文（cropCanvasByAlpha）");

  outCtx.clearRect(0, 0, crop.w, crop.h);
  outCtx.drawImage(tmp, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);

  return { canvas: out, bounds: crop };
}

/**
 * canvas -> PNG Blob
 *
 * Args:
 *   canvas (HTMLCanvasElement): 输入 canvas
 *
 * Returns:
 *   Promise<Blob>: PNG blob
 */
export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b) resolve(b);
      else reject(new Error("canvas.toBlob 返回空，无法导出 PNG"));
    }, "image/png");
  });
}

/**
 * 一步完成：按 alpha 裁剪，并导出裁剪后的 PNG Blob。
 *
 * Args:
 *   src (HTMLCanvasElement): 输入 canvas（建议为已经渲染好的 WebGL canvas）
 *   options (AlphaCropOptions): 裁剪参数
 *
 * Returns:
 *   Promise<{ blob, bounds }>: PNG blob 与裁剪框
 */
export async function cropCanvasToPngBlob(
  src: HTMLCanvasElement,
  options: AlphaCropOptions = {}
): Promise<{ blob: Blob; bounds: CropBounds }> {
  const { canvas, bounds } = cropCanvasByAlpha(src, options);
  const blob = await canvasToPngBlob(canvas);
  return { blob, bounds };
}

/**
 * 下载工具：Blob -> download
 *
 * Args:
 *   blob (Blob): blob
 *   filename (string): 文件名
 *
 * Returns:
 *   void
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
