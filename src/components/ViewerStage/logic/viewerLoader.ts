// src/components/ViewerStage/logic/viewerLoader.ts
import { reactive, ref } from 'vue';
import type { Ref } from 'vue';
import { message } from 'ant-design-vue';

import type {
  ViewerSettings,
  LammpsTypeMapItem,
  AtomTypeColorMapItem,
  OpenSettingsPayload,
} from '../../../lib/viewer/settings';
import type { SettingsPatch } from '../../../lib/viewer/mergeSettings';
import {
  hasUnknownElementMappingForTypeIds,
  DEFAULT_DETAILS,
  buildElementColorRecordFromRows,
} from '../../../lib/viewer/settings';
import { normalizeViewPresets } from '../../../lib/viewer/viewPresets';
import { computeMd5ForArrayBuffer } from '../../../lib/file/md5';
import type { LayerSourceInfo } from '../../../lib/viewer/sessionTypes';

import { parseStructure, toForcedFilename } from '../../../lib/structure/parse';
import type { ParseMode, ParseInfo } from '../../../lib/structure/parse';
import type { StructureModel } from '../../../lib/structure/types';

import {
  buildLammpsTypeToElementMap,
  collectTypeIdsAndElementDefaultsFromAtoms,
  mergeTypeMap,
  normalizeTypeMapRows,
  typeMapEquals,
} from '../typeMap';
import { PANEL_KEYS, type PanelKey } from '../../../lib/viewer/panelKeys';

import { isLammpsDumpFormat } from '../../../lib/structure/parsers/lammpsDump';
import { isLammpsDataFormat } from '../../../lib/structure/parsers/lammpsData';
import { applyAnimationInfo } from '../animation';

import type { ThreeStage } from '../../../lib/three/stage';
import type { ModelRuntime } from '../modelRuntime';
import type { InspectCtx } from '../ctx/inspect';
import type { LayerSourceData } from './sourceStore';

type RenderReason = 'load' | 'reparse';

export function createViewerLoader(deps: {
  settingsRef: Readonly<Ref<ViewerSettings>>;
  getStage: () => ThreeStage | null;
  getRuntime: () => ModelRuntime | null;

  patchSettings?: (patch: SettingsPatch) => void;
  requestOpenSettings?: (payload?: OpenSettingsPayload) => void;

  t: (key: string, args?: any) => string;

  inspectCtx: InspectCtx;
  isLoading: Ref<boolean>;
  hasModel: Ref<boolean>;

  // animation refs (mutated by applyAnimationInfo)
  frameIndex: Ref<number>;
  frameCount: Ref<number>;
  hasAnimation: Ref<boolean>;

  stopPlay: () => void;

  sourceStore: {
    set: (id: string, data: LayerSourceData) => void;
    get: (id: string) => LayerSourceData | undefined;
    delete: (id: string) => void;
    clear: () => void;
  };
  shouldCacheRemote?: () => boolean;
}) {
  const textDecoder = new TextDecoder();
  const parseMode = ref<ParseMode>('auto');

  const parseInfo = reactive<ParseInfo>({
    fileName: '',
    format: '',
    atomCount: 0,
    frameCount: 1,
    success: true,
    errorMsg: '',
    errorSeq: 0,
  });

  // Last successfully read raw file payload (for reparse).
  // 最近一次读取的原始文件内容（用于重新解析）。
  let lastRawText: string | null = null;
  let lastRawFileName: string | null = null;

  // Remember whether the last load should prompt LAMMPS mapping UI.
  // 记录上一次加载是否需要提示 LAMMPS 映射面板。
  let lastLoadNeedsLammpsFocus = false;
  let lastLoadIsLammps = false;

  function getSettings(): ViewerSettings {
    return deps.settingsRef.value;
  }

  function nextFrame(): Promise<void> {
    return new Promise(resolve =>
      window.requestAnimationFrame(() => resolve()),
    );
  }

  function updateParseInfo(
    model: StructureModel,
    displayFileName: string,
  ): void {
    parseInfo.fileName = displayFileName;
    parseInfo.format = model.source?.format ?? 'unknown';
    parseInfo.atomCount = model.atoms.length;
    parseInfo.frameCount
      = model.frames && model.frames.length > 0 ? model.frames.length : 1;
  }

  function handleLammpsTypeMapAndSettings(
    model: StructureModel,
    reason: RenderReason,
  ): void {
    const runtime = deps.getRuntime();

    const runtimeRows = ((runtime?.activeTypeMapRows.value ?? []) as LammpsTypeMapItem[])
      .map(r => ({ typeId: r.typeId, element: r.element }));
    const settingsRows = ((getSettings().lammps ?? []) as LammpsTypeMapItem[])
      .map(r => ({ typeId: r.typeId, element: r.element }));
    const baseRows = (reason === 'reparse'
      ? runtimeRows
      : runtimeRows.length > 0
        ? runtimeRows
        : settingsRows);

    const atoms0
      = model.frames && model.frames[0] ? model.frames[0] : model.atoms;
    const { typeIds: detectedTypeIdsRaw, defaults }
      = collectTypeIdsAndElementDefaultsFromAtoms(atoms0);

    let detectedTypeIds = detectedTypeIdsRaw;
    if (detectedTypeIdsRaw.length > 0) {
      const maxId = detectedTypeIdsRaw[detectedTypeIdsRaw.length - 1] ?? 0;
      if (Number.isFinite(maxId) && maxId > 0 && maxId <= 2000) {
        detectedTypeIds = Array.from({ length: maxId }, (_, i) => i + 1);
      }
    }

    const mergedRows = mergeTypeMap(baseRows, detectedTypeIds, defaults) as
      | LammpsTypeMapItem[]
      | undefined;

    const typeMapAdded = !typeMapEquals(
      normalizeTypeMapRows(baseRows),
      normalizeTypeMapRows(mergedRows ?? []),
    );

    const hasUnknownForThisDump = hasUnknownElementMappingForTypeIds(
      (mergedRows ?? []) as any,
      detectedTypeIds,
    );

    const usedCachedMapping = reason === 'load' && settingsRows.length > 0;
    lastLoadNeedsLammpsFocus = typeMapAdded || hasUnknownForThisDump || usedCachedMapping;

    if (runtime && mergedRows) {
      runtime.setActiveLayerTypeMapRows(mergedRows);
    }

    if (hasUnknownForThisDump) {
      message.warning(deps.t('viewer.lammps.mappingMissing'));
    }
  }

  function renderFromText(
    text: string,
    fileName: string,
    reason: RenderReason,
    opts?: {
      hidePreviousLayers?: boolean;
      sourceMeta?: LayerSourceInfo;
      skipAutoFit?: boolean;
      forcedLayerId?: string;
    },
  ): { frameCount: number; hasAnimation: boolean; layerId: string } | null {
    const stage = deps.getStage();
    const runtime = deps.getRuntime();
    if (!stage || !runtime) return null;

    if (reason === 'load') deps.inspectCtx.clear();

    const forcedName = toForcedFilename(fileName, parseMode.value);

    const model = parseStructure(text, forcedName, {
      lammpsTypeToElement: buildLammpsTypeToElementMap(
        (reason === 'load' ? [] : (getSettings().lammps ?? [])) as LammpsTypeMapItem[],
      ),
      lammpsSortById: true,
    });

    const info
      = reason === 'reparse'
        ? runtime.replaceActiveLayerModel(model)
        : runtime.renderModel(model, {
            hidePreviousLayers: opts?.hidePreviousLayers,
            sourceMeta: opts?.sourceMeta,
            skipAutoFit: opts?.skipAutoFit,
            forcedLayerId: opts?.forcedLayerId,
          });

    applyAnimationInfo(
      info,
      deps.frameIndex,
      deps.frameCount,
      deps.hasAnimation,
    );

    updateParseInfo(model, fileName);

    const fmt = model.source?.format ?? '';
    const atoms0
      = model.frames && model.frames[0] ? model.frames[0] : model.atoms;
    const { typeIds: detectedTypeIds }
      = collectTypeIdsAndElementDefaultsFromAtoms(atoms0);
    const isLmp
      = isLammpsDumpFormat(fmt)
        || isLammpsDataFormat(fmt)
        || detectedTypeIds.length > 0;

    if (isLmp) {
      handleLammpsTypeMapAndSettings(model, reason);
    }
    else {
      lastLoadNeedsLammpsFocus = false;
    }
    lastLoadIsLammps = isLmp;

    if (reason === 'reparse') {
      message.success(
        deps.t('viewer.parse.reparseSuccess', { format: parseInfo.format }),
      );
    }

    return info;
  }

  function syncViewPresetAndDistanceOnModelLoad(): void {
    const stage = deps.getStage();
    if (!stage) return;

    const canPatch = !!deps.patchSettings;

    const cam = stage.getCamera();
    const controls = stage.getControls();
    const settings = getSettings();
    const distFromSettings = settings.view.dualViewDistance;
    const distFromCamera = cam.position.distanceTo(controls.target);
    const dist = (typeof distFromSettings === 'number' && Number.isFinite(distFromSettings))
      ? distFromSettings
      : distFromCamera;

    stage.setDualViewDistance(dist);

    if (canPatch) {
      const patch: SettingsPatch = {
        view: {
          initialDualViewDistance: distFromCamera,
        },
      };
      if (!Number.isFinite(distFromSettings)) {
        patch.view = {
          ...(patch.view ?? {}),
          dualViewDistance: dist,
        };
      }
      deps.patchSettings!(patch);
    }

    let presets = normalizeViewPresets(getSettings().view.viewPresets);
    if (presets.length === 0) {
      const w = stage.host.getBoundingClientRect().width;
      presets = w >= 900 ? ['front', 'side'] : ['front'];
      if (canPatch)
        deps.patchSettings!({ view: { viewPresets: presets } });
    }

    stage.setViewPresets(presets);
  }

  function setParseMode(mode: ParseMode): void {
    if (parseMode.value === mode) return;
    parseMode.value = mode;

    if (!lastRawText || !lastRawFileName) return;
    if (!deps.getStage() || !deps.getRuntime()) return;

    try {
      deps.stopPlay();
      deps.inspectCtx.clear();
      renderFromText(lastRawText, lastRawFileName, 'reparse');
    }
    catch (err) {
      message.error(
        deps.t('viewer.parse.reparseFailed', { reason: (err as Error).message }),
      );
    }
  }

  function cloneTypeMapRows(rows: LammpsTypeMapItem[] | undefined): LammpsTypeMapItem[] {
    return (rows ?? []).map(r => ({ ...r }));
  }

  function cloneColorMapRows(
    rows: AtomTypeColorMapItem[] | undefined,
  ): AtomTypeColorMapItem[] {
    return (rows ?? []).map(r => ({ ...r }));
  }

  async function refreshTypeMap(): Promise<void> {
    const stage = deps.getStage();
    const runtime = deps.getRuntime();
    if (!stage || !runtime) return;
    if (!deps.hasModel.value) return;
    if (!runtime.hasAnyTypeId()) return;

    deps.inspectCtx.clear();

    const tStart = performance.now();
    if (!deps.isLoading.value) {
      deps.isLoading.value = true;
      await nextFrame();
      await nextFrame();
    }

    try {
      runtime.onTypeMapChanged();
    }
    finally {
      const minMs = 250;
      const elapsed = performance.now() - tStart;
      if (elapsed < minMs) {
        await new Promise(r =>
          window.setTimeout(r, Math.ceil(minMs - elapsed)),
        );
      }
      deps.isLoading.value = false;
    }

    if (deps.patchSettings) {
      deps.patchSettings({
        lammps: cloneTypeMapRows(runtime.activeTypeMapRows.value),
      });
    }
  }

  async function refreshColorMap(opts?: { applyToAll?: boolean }): Promise<void> {
    const stage = deps.getStage();
    const runtime = deps.getRuntime();
    if (!stage || !runtime) return;
    if (!deps.hasModel.value) return;

    const tStart = performance.now();
    if (!deps.isLoading.value) {
      deps.isLoading.value = true;
      await nextFrame();
    }

    try {
      runtime.onColorMapChanged(opts);
    }
    finally {
      const minMs = 150;
      const elapsed = performance.now() - tStart;
      if (elapsed < minMs) {
        await new Promise(r =>
          window.setTimeout(r, Math.ceil(minMs - elapsed)),
        );
      }
      deps.isLoading.value = false;
    }

    if (deps.patchSettings && opts?.applyToAll) {
      const rows = cloneColorMapRows(runtime.activeColorMapRows.value);
      deps.patchSettings({
        colors: { data: buildElementColorRecordFromRows(rows) },
      });
    }
  }

  function isLayerDisplayModified(): boolean {
    const runtime = deps.getRuntime();
    const cur = runtime?.activeDisplaySettings.value ?? null;
    if (!cur) return false;
    return (
      cur.atomScale !== DEFAULT_DETAILS.atomScale
      || cur.showBonds !== DEFAULT_DETAILS.showBonds
      || cur.sphereSegments !== DEFAULT_DETAILS.sphereSegments
      || cur.bondFactor !== DEFAULT_DETAILS.bondFactor
      || cur.bondRadius !== DEFAULT_DETAILS.bondRadius
    );
  }

  function focusSettingsToLayersOrLammps(): void {
    const runtime = deps.getRuntime();
    if (!deps.requestOpenSettings) return;
    const layerCount = runtime?.layers.value.length ?? 0;
    const wantsColors = (runtime?.activeColorMapRows.value ?? []).some(r => r.isCustom);
    const wantsLayers = layerCount > 1;
    const wantsLammps = lastLoadIsLammps || lastLoadNeedsLammpsFocus;
    const wantsLayerDisplay = isLayerDisplayModified();

    const focusKeys: string[] = [];
    if (wantsLammps) focusKeys.push(PANEL_KEYS.lammps);
    if (wantsLayers) focusKeys.push(PANEL_KEYS.layers);
    if (wantsColors) focusKeys.push(PANEL_KEYS.colors);
    if (wantsLayerDisplay) focusKeys.push(PANEL_KEYS.details);

    if (focusKeys.length > 0) {
      deps.requestOpenSettings?.({
        focusKeys: Array.from(new Set(focusKeys)),
        open: true,
      });
      message.info(
        deps.t?.('viewer.settings.modifiedHint')
        ?? '已检测到修改的设置，已打开相关面板。',
      );
      return;
    }

    const openKeys: PanelKey[] = [PANEL_KEYS.view];
    if (deps.settingsRef.value.other.autoRotateOnLoad) {
      openKeys.push(PANEL_KEYS.rotation);
    }
    deps.requestOpenSettings?.({
      focusKeys: openKeys,
      open: true,
    });
  }

  async function loadInit(): Promise<void> {
    if (!deps.getStage() || !deps.getRuntime()) return;
    if (deps.isLoading.value) return;

    deps.isLoading.value = true;
    await nextFrame();
  }

  async function loadText(
    t0: number,
    text: string,
    fileName: string,
    opts?: { hidePreviousLayers?: boolean; sourceMeta?: LayerSourceInfo; forcedLayerId?: string },
  ): Promise<string | null> {
    let info: { layerId: string } | null = null;
    try {
      deps.stopPlay();

      lastRawText = text;
      lastRawFileName = fileName;

      info = renderFromText(text, fileName, 'load', {
        hidePreviousLayers: opts?.hidePreviousLayers,
        sourceMeta: opts?.sourceMeta,
        forcedLayerId: opts?.forcedLayerId,
      });

      syncViewPresetAndDistanceOnModelLoad();

      if (deps.patchSettings) {
        const shouldAutoEnable = !!deps.settingsRef.value.other.autoRotateOnLoad;
        const current = deps.settingsRef.value.rotation;
        const enabled = !!current.enabled || shouldAutoEnable;
        const enabledBySystem = shouldAutoEnable && !current.enabled;
        deps.patchSettings({
          rotation: {
            ...current,
            enabled,
          },
        });
        if (enabledBySystem) {
          message.info(
            deps.t?.('viewer.autoRotate.enabledHint')
            ?? '已开启自动旋转，可在设置-自动旋转-启用中关闭。',
          );
        }
      }

      focusSettingsToLayersOrLammps();

      message.success(`${((performance.now() - t0) / 1000).toFixed(2)} s`);
      parseInfo.success = true;
      parseInfo.errorMsg = '';
    }
    catch (err) {
      parseInfo.success = false;
      parseInfo.errorMsg = (err as Error).message;
      parseInfo.errorSeq += 1;
      console.error(err);
      message.error(`${deps.t('viewer.parse.notice')}: ${parseInfo.errorMsg}`);
    }

    deps.isLoading.value = false;
    deps.hasModel.value = true;

    parseMode.value = 'auto';
    parseInfo.fileName = fileName;

    return info?.layerId ?? null;
  }

  async function loadUrl(
    url: string,
    fileName: string,
    opts?: { hidePreviousLayers?: boolean; forcedLayerId?: string },
  ): Promise<void> {
    if (deps.isLoading.value) return;
    await loadInit();
    const t0 = performance.now();

    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const buf = await res.arrayBuffer();
    const text = textDecoder.decode(buf);
    const md5 = computeMd5ForArrayBuffer(buf);
    const cacheRemote = deps.shouldCacheRemote?.() ?? false;
    const sourceMeta: LayerSourceInfo = {
      md5,
      size: buf.byteLength,
      fileName,
      url,
      type: 'url',
      cached: cacheRemote,
    };

    const layerId = await loadText(t0, text, fileName, {
      hidePreviousLayers: opts?.hidePreviousLayers ?? true,
      sourceMeta,
      forcedLayerId: opts?.forcedLayerId,
    });

    if (layerId) {
      deps.sourceStore.set(layerId, {
        layerId,
        ...sourceMeta,
        buffer: cacheRemote ? buf : undefined,
      });
    }
  }

  async function loadUrls(
    items: { url: string; fileName: string; forcedLayerId?: string }[],
    opts?: { hidePreviousLayers?: boolean },
  ): Promise<void> {
    if (!deps.getStage() || !deps.getRuntime()) return;
    if (deps.isLoading.value) return;
    if (!items || items.length === 0) return;

    await loadInit();
    const t0 = performance.now();

    try {
      deps.stopPlay();
      deps.inspectCtx.clear();

      let okCount = 0;
      let lastOkName = '';

      for (const item of items) {
        const displayName = item.fileName || item.url;
        try {
          const res = await fetch(item.url);
          if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
          const buf = await res.arrayBuffer();
          const text = textDecoder.decode(buf);
          const md5 = computeMd5ForArrayBuffer(buf);
          const cacheRemote = deps.shouldCacheRemote?.() ?? false;
          const sourceMeta: LayerSourceInfo = {
            md5,
            size: buf.byteLength,
            fileName: displayName,
            url: item.url,
            type: 'url',
            cached: cacheRemote,
          };

          lastRawText = text;
          lastRawFileName = displayName;

          const info = renderFromText(text, displayName, 'load', {
            hidePreviousLayers: opts?.hidePreviousLayers ?? okCount === 0,
            sourceMeta,
            forcedLayerId: item.forcedLayerId,
          });

          okCount += 1;
          lastOkName = displayName;

          if (info?.layerId) {
            deps.sourceStore.set(info.layerId, {
              layerId: info.layerId,
              ...sourceMeta,
              buffer: cacheRemote ? buf : undefined,
            });
          }
        }
        catch (err) {
          const msg = (err as Error).message ?? String(err);
          message.error(`${displayName}: ${msg}`);
        }
      }

      if (okCount > 0) {
        syncViewPresetAndDistanceOnModelLoad();

        message.success(
          `${okCount} file(s), ${((performance.now() - t0) / 1000).toFixed(
            2,
          )} s`,
        );

        parseInfo.success = true;
        parseInfo.errorMsg = '';
        deps.hasModel.value = true;
        parseMode.value = 'auto';
        parseInfo.fileName = lastOkName || lastRawFileName!;

        focusSettingsToLayersOrLammps();
      }
      else {
        parseInfo.success = false;
        parseInfo.errorMsg = deps.t('viewer.parse.notice');
        parseInfo.errorSeq += 1;
        parseInfo.fileName = lastRawFileName ?? '';
        parseInfo.format = '';
        parseInfo.atomCount = 0;
        parseInfo.frameCount = 1;
        message.error(deps.t('viewer.parse.notice'));
      }
    }
    catch (err) {
      parseInfo.success = false;
      parseInfo.errorMsg = (err as Error).message ?? String(err);
      parseInfo.errorSeq += 1;
      console.error(err);
      message.error(`${deps.t('viewer.parse.notice')}: ${parseInfo.errorMsg}`);
    }
    finally {
      deps.isLoading.value = false;
    }
  }

  async function loadFilesInternal(
    files: File[],
    opts?: { hidePreviousLayers?: boolean; forcedLayerId?: string },
  ): Promise<void> {
    if (!deps.getStage() || !deps.getRuntime()) return;
    if (deps.isLoading.value) return;

    await loadInit();
    const t0 = performance.now();

    try {
      deps.stopPlay();
      deps.inspectCtx.clear();

      let okCount = 0;
      let lastOkName = '';

      const isBatchLoad = files.length > 1;
      for (let i = 0; i < files.length; i += 1) {
        const f = files[i]!;
        const lowerName = f.name.toLowerCase();
        if (lowerName === 'config.json') {
          // Skip project config files if passed to the generic loader.
          continue;
        }
        try {
          const buf = await f.arrayBuffer();
          const text = textDecoder.decode(buf);
          const md5 = computeMd5ForArrayBuffer(buf);
          lastRawText = text;
          lastRawFileName = f.name;

          const sourceMeta: LayerSourceInfo = {
            md5,
            size: f.size,
            fileName: f.name,
            mime: f.type,
            type: 'file',
            cached: true,
          };

          const allowAutoFit = !isBatchLoad || okCount === 0 || i === files.length - 1;
          const info = renderFromText(text, f.name, 'load', {
            hidePreviousLayers: opts?.hidePreviousLayers ?? okCount === 0,
            sourceMeta,
            skipAutoFit: !allowAutoFit,
            forcedLayerId: opts?.forcedLayerId,
          });

          okCount += 1;
          lastOkName = f.name;

          if (info?.layerId) {
            deps.sourceStore.set(info.layerId, {
              layerId: info.layerId,
              ...sourceMeta,
              buffer: buf,
            });
          }
        }
        catch (err) {
          const msg = (err as Error).message ?? String(err);
          message.error(`${f.name}: ${msg}`);
        }
      }

      if (okCount > 0) {
        syncViewPresetAndDistanceOnModelLoad();

        message.success(
          `${okCount} file(s), ${((performance.now() - t0) / 1000).toFixed(
            2,
          )} s`,
        );

        parseInfo.success = true;
        parseInfo.errorMsg = '';
        deps.hasModel.value = true;
        parseMode.value = 'auto';
        parseInfo.fileName = lastOkName || lastRawFileName!;

        focusSettingsToLayersOrLammps();
      }
      else {
        parseInfo.success = false;
        parseInfo.errorMsg = deps.t('viewer.parse.notice');
        parseInfo.errorSeq += 1;
        parseInfo.fileName = lastRawFileName ?? '';
        parseInfo.format = '';
        parseInfo.atomCount = 0;
        parseInfo.frameCount = 1;
        message.error(deps.t('viewer.parse.notice'));
      }
    }
    catch (err) {
      parseInfo.success = false;
      parseInfo.errorMsg = (err as Error).message ?? String(err);
      parseInfo.errorSeq += 1;
      console.error(err);
      message.error(`${deps.t('viewer.parse.notice')}: ${parseInfo.errorMsg}`);
    }
    finally {
      deps.isLoading.value = false;
    }
  }

  async function loadFiles(
    files: File[],
    opts?: { hidePreviousLayers?: boolean; forcedLayerId?: string },
  ): Promise<void> {
    await loadFilesInternal(files, opts);
  }

  async function loadFile(
    file: File,
    opts?: { hidePreviousLayers?: boolean; forcedLayerId?: string },
  ): Promise<void> {
    await loadFilesInternal([file], opts);
  }

  return {
    parseMode,
    parseInfo,
    setParseMode,
    refreshTypeMap,
    refreshColorMap,
    loadFiles,
    loadFile,
    loadUrl,
    loadUrls,
  };
}

export type ViewerLoader = ReturnType<typeof createViewerLoader>;
