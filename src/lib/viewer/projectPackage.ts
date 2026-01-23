import JSZip from 'jszip';
import { buildExportFilename } from '../file/filename';
import { APP_BUILD_TIME, APP_VERSION } from '../appMeta';
import type { ViewerSettings } from './settings';
import type { LayerSnapshot, LayerSourceData, SessionSnapshot } from './sessionTypes';
import { buildCategorizedSettings } from './sessionTemplates';

export type ApplyAllLayersFlags = {
  details?: boolean;
  colors?: boolean;
};

function applyApplyAllLayers(
  settings: SessionSnapshot['settings'],
  flags?: ApplyAllLayersFlags,
): SessionSnapshot['settings'] {
  if (!flags) return settings;
  if (!settings || typeof settings !== 'object') return settings;
  const categorized = settings as any;
  if (categorized.details && typeof categorized.details === 'object' && typeof flags.details === 'boolean') {
    categorized.details.applyAllLayers = flags.details;
  }
  if (typeof flags.colors === 'boolean') {
    const colors = categorized.colors;
    if (Array.isArray(colors)) {
      categorized.colors = {
        rows: colors,
        applyAllLayers: flags.colors,
      };
    }
    else if (colors && typeof colors === 'object') {
      colors.applyAllLayers = flags.colors;
    }
  }
  return settings;
}

export function buildSettingsSnapshot(
  settings: ViewerSettings,
  layers: LayerSnapshot[],
  app?: SessionSnapshot['app'],
  applyAllLayers?: ApplyAllLayersFlags,
): SessionSnapshot {
  const savedAt = new Date().toISOString();
  return {
    settings: applyApplyAllLayers(buildCategorizedSettings(settings), applyAllLayers),
    layers,
    app: {
      version: APP_VERSION,
      savedAt,
      buildTime: APP_BUILD_TIME,
      ...(app ?? {}),
    },
  };
}

export async function buildProjectZip(params: {
  settings: ViewerSettings;
  layers: LayerSnapshot[];
  sources: LayerSourceData[];
  modelFileName?: string;
  app?: SessionSnapshot['app'];
  applyAllLayers?: ApplyAllLayersFlags;
}): Promise<{ blob: Blob; filename: string }> {
  const { settings, layers, sources, modelFileName, app, applyAllLayers } = params;
  const zip = new JSZip();
  const payload = buildSettingsSnapshot(settings, layers, app, applyAllLayers);
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

  const blob = await zip.generateAsync({ type: 'blob' });
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
