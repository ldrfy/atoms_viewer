type LayerSourceLike = {
  fileName?: string | null;
};

export type LayerNameLike = {
  id?: string | null;
  name?: string | null;
  source?: LayerSourceLike | null;
};

/**
 * 获取图层基础名称（优先文件名）。
 *
 * Get base layer name (prefer source file name).
 */
export function getLayerBaseName(layer: LayerNameLike | null | undefined): string {
  const fileName = String(layer?.source?.fileName ?? '').trim();
  if (fileName) return fileName;
  const name = String(layer?.name ?? '').trim();
  if (name) return name;
  const id = String(layer?.id ?? '').trim();
  return id || '-';
}

/**
 * 根据图层在列表中的位置生成显示名：`序号.名称`。
 *
 * Build display name as `index.name` by layer order in current list.
 */
export function formatLayerDisplayName(
  layer: LayerNameLike | null | undefined,
  layers: LayerNameLike[] | null | undefined,
): string {
  const baseName = getLayerBaseName(layer);
  const list = Array.isArray(layers) ? layers : [];
  const id = String(layer?.id ?? '').trim();
  const idx = id
    ? list.findIndex(item => String(item?.id ?? '').trim() === id)
    : -1;
  if (idx < 0) return baseName;
  return `${idx + 1}. ${baseName}`;
}
