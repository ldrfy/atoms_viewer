import JSZip from 'jszip';
import { buildExportFilename } from '../file/filename';
import { APP_BUILD_TIME, APP_VERSION } from '../appMeta';
import type { ViewerSettings, DetailsSettingsGroup } from './settings';
import { DEFAULT_DETAILS, DEFAULT_LAYER_ANIM } from './settings';
import type {
  LayerSnapshot,
  LayerSourceData,
  LayerSortBy,
  LayersSnapshot,
  SessionSnapshot,
} from './sessionTypes';
import { buildCategorizedSettings, pruneDefaultSettings } from './sessionTemplates';
import { readSessionCacheSizeMap } from './sessionStorage';

function pruneLayerSnapshot(
  layer: LayerSnapshot,
  storedSizeMap?: Record<string, number>,
): LayerSnapshot {
  const out: LayerSnapshot = {};
  if (layer.id) out.id = layer.id;

  const name = String(layer.name ?? '').trim();
  const fileName = String(layer.source?.fileName ?? '').trim();
  if (name && name !== fileName) out.name = name;

  if (layer.visible === false) out.visible = false;
  if (layer.selected === true) out.selected = true;
  if (Number.isFinite(layer.createdAtMs)) out.createdAtMs = Number(layer.createdAtMs);

  if (layer.source && typeof layer.source === 'object') {
    const src = layer.source;
    const nextSource: LayerSnapshot['source'] = {};
    if (src.md5) nextSource.md5 = src.md5;
    if (Number.isFinite(src.size)) nextSource.size = src.size;
    if (Number.isFinite(src.storedSize)) {
      nextSource.storedSize = src.storedSize;
    }
    else if (src.md5 && storedSizeMap) {
      const cachedSize = storedSizeMap[src.md5];
      if (Number.isFinite(cachedSize)) nextSource.storedSize = cachedSize;
    }
    if (src.fileName) nextSource.fileName = src.fileName;
    if (src.mime) nextSource.mime = src.mime;
    if (src.type) nextSource.type = src.type;
    if (src.url) nextSource.url = src.url;
    if (src.cached != null) nextSource.cached = src.cached;
    if (Object.keys(nextSource).length > 0) out.source = nextSource;
  }

  const details = (layer.details ?? {}) as Partial<DetailsSettingsGroup>;
  const nextDetails: Partial<DetailsSettingsGroup> = {};
  if (details.representation && details.representation !== DEFAULT_DETAILS.representation) {
    nextDetails.representation = details.representation;
  }
  if (details.atomScale != null && details.atomScale !== DEFAULT_DETAILS.atomScale) {
    nextDetails.atomScale = details.atomScale;
  }
  if (details.showBonds != null && details.showBonds !== DEFAULT_DETAILS.showBonds) {
    nextDetails.showBonds = details.showBonds;
  }
  if (details.sphereSegments != null && details.sphereSegments !== DEFAULT_DETAILS.sphereSegments) {
    nextDetails.sphereSegments = details.sphereSegments;
  }
  if (details.bondFactor != null && details.bondFactor !== DEFAULT_DETAILS.bondFactor) {
    nextDetails.bondFactor = details.bondFactor;
  }
  if (details.bondRadius != null && details.bondRadius !== DEFAULT_DETAILS.bondRadius) {
    nextDetails.bondRadius = details.bondRadius;
  }
  if (details.atomRoughness != null && details.atomRoughness !== DEFAULT_DETAILS.atomRoughness) {
    nextDetails.atomRoughness = details.atomRoughness;
  }
  if (Object.keys(nextDetails).length > 0) out.details = nextDetails as LayerSnapshot['details'];

  const lammps = layer.lammps?.data ?? {};
  if (lammps && Object.keys(lammps).length > 0) out.lammps = { data: { ...lammps } };

  const colorData = layer.colors?.data ?? {};
  const colorKeys = Object.keys(colorData);
  if (colorKeys.length > 0) {
    out.colors = { data: { ...colorData } };
  }

  if (layer.inspectSelection && layer.inspectSelection.length > 0) {
    const seen = new Set<string>();
    const normalized = layer.inspectSelection
      .map(item => ({
        atomIndex: item.atomIndex,
        element: item.element,
        position: item.position,
        typeId: item.typeId,
        id: item.id,
        order: item.order,
      }))
      .filter((item) => {
        const key = `${item.atomIndex}:${item.element ?? ''}:${item.position?.join(',') ?? ''}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    if (normalized.length > 0) {
      out.inspectSelection = normalized as LayerSnapshot['inspectSelection'];
    }
  }

  if (layer.anim) {
    const anim = layer.anim;
    const nextAnim: NonNullable<LayerSnapshot['anim']> = {};
    if (Number.isFinite(anim.frameIndex) && anim.frameIndex !== DEFAULT_LAYER_ANIM.frameIndex) {
      nextAnim.frameIndex = anim.frameIndex;
    }
    if (Number.isFinite(anim.playFps) && anim.playFps !== DEFAULT_LAYER_ANIM.playFps) {
      nextAnim.playFps = anim.playFps;
    }
    if (Object.keys(nextAnim).length > 0) {
      out.anim = nextAnim;
    }
  }

  return out;
}

export function buildSettingsSnapshot(
  settings: ViewerSettings,
  layers: LayerSnapshot[],
  app?: SessionSnapshot['app'],
  layersSortBy: LayerSortBy = 'name,ASC',
  activeLayerId?: string | null,
  compact: boolean = true,
): SessionSnapshot {
  // Read selected layer ids from storage (set by UI panel).
  // 从本地存储读取选中图层 id（由面板维护）。
  const selectedIds = (() => {
    try {
      const raw = localStorage.getItem('atomsViewer.layers.selectedIds.v1');
      if (!raw) return new Set<string>();
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return new Set<string>();
      return new Set(parsed.map(v => String(v)).filter(v => v.length > 0));
    }
    catch {
      return new Set<string>();
    }
  })();

  const savedAt = new Date().toISOString();
  const categorized = buildCategorizedSettings(settings);
  const pruned = compact ? pruneDefaultSettings(categorized) : categorized;
  // 为导出补充模型压缩后的大小信息。
  // Add compressed model sizes for export.
  const storedSizeMap = readSessionCacheSizeMap();
  const layerData: Record<string, LayerSnapshot> = {};
  for (const layer of layers ?? []) {
    const id = layer.id ?? '';
    if (!id) continue;
    // Mark selected flag on layer snapshot if it is selected in UI.
    // 若该图层在面板被选中，则写入选中标记。
    if (selectedIds.has(id)) layer.selected = true;
    layerData[id] = pruneLayerSnapshot(layer, storedSizeMap);
  }
  const layersSnapshot: LayersSnapshot = {
    sortBy: layersSortBy,
    activeId: activeLayerId ?? undefined,
    data: layerData,
  };
  const payload: SessionSnapshot = {
    settings: pruned,
    layers: layersSnapshot,
    app: {
      version: APP_VERSION,
      savedAt,
      buildTime: APP_BUILD_TIME,
      ...(app ?? {}),
    },
  };
  return payload;
}

export async function buildProjectZip(params: {
  settings: ViewerSettings;
  layers: LayerSnapshot[];
  sources: LayerSourceData[];
  modelFileName?: string;
  app?: SessionSnapshot['app'];
  layersSortBy?: LayerSortBy;
  activeLayerId?: string | null;
}): Promise<{ blob: Blob; filename: string }> {
  const {
    settings,
    layers,
    sources,
    modelFileName,
    app,
    layersSortBy,
    activeLayerId,
  } = params;
  const zip = new JSZip();
  const payload = buildSettingsSnapshot(
    settings,
    layers,
    app,
    layersSortBy,
    activeLayerId,
  );
  zip.file('config.json', JSON.stringify(payload, null, 2));

  for (const src of sources) {
    if (!src.buffer || !src.md5) continue;
    const stem = src.md5 || src.layerId;
    const ext = (() => {
      const name = src.fileName ?? '';
      const idx = name.lastIndexOf('.');
      if (idx >= 0 && idx < name.length - 1) return name.slice(idx);
      return '.bin';
    })();
    const path = `models/${stem}${ext}`;
    zip.file(path, src.buffer);
  }

  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  const filename = buildExportFilename({
    modelFileName: modelFileName ?? 'atoms-viewer',
    ext: 'zip',
  });
  return { blob, filename };
}

export type ParsedProjectZip = {
  snapshot?: SessionSnapshot;
  files: { md5?: string; file: File }[];
};

function guessMd5FromName(name: string): string | undefined {
  const base = name.split('/').pop() ?? name;
  const stem = base.includes('.') ? base.slice(0, base.lastIndexOf('.')) : base;
  const m = stem.match(/[a-fA-F0-9]{32}/);
  return m ? m[0]?.toLowerCase() : undefined;
}

export async function parseProjectZip(file: File | Blob): Promise<ParsedProjectZip> {
  const zip = await JSZip.loadAsync(file);
  const configEntry = zip.file(/config\.json$/i)[0];
  let snapshot: SessionSnapshot | undefined;
  if (configEntry) {
    const configText = await configEntry.async('string');
    snapshot = JSON.parse(configText) as SessionSnapshot;
  }

  const files: { md5?: string; file: File }[] = [];
  const modelDir = zip.folder('models');
  if (modelDir) {
    const entries = Object.values(modelDir.files);
    for (const e of entries) {
      if (e.dir) continue;
      const buf = await e.async('arraybuffer');
      const name = e.name.split('/').pop() ?? 'model.bin';
      files.push({ md5: guessMd5FromName(name), file: new File([buf], name) });
    }
  }

  return { snapshot, files };
}
