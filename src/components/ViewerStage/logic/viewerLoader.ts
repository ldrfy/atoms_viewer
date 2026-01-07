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
import {
  hasUnknownElementMappingForTypeIds,
  DEFAULT_LAYER_DISPLAY,
} from '../../../lib/viewer/settings';
import { normalizeViewPresets } from '../../../lib/viewer/viewPresets';

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

import { isLammpsDumpFormat } from '../../../lib/structure/parsers/lammpsDump';
import { isLammpsDataFormat } from '../../../lib/structure/parsers/lammpsData';
import { applyAnimationInfo } from '../animation';

import type { ThreeStage } from '../../../lib/three/stage';
import type { ModelRuntime } from '../modelRuntime';
import type { InspectCtx } from '../ctx/inspect';

type RenderReason = 'load' | 'reparse';

export function createViewerLoader(deps: {
  settingsRef: Readonly<Ref<ViewerSettings>>;
  getStage: () => ThreeStage | null;
  getRuntime: () => ModelRuntime | null;

  patchSettings?: (patch: Partial<ViewerSettings>) => void;
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
}) {
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

  function focusSettingsToFilesAndOpen(): void {
    // When parsing fails and user needs to manually choose a parse mode,
    // automatically open Settings and focus the Files panel.
    lastLoadNeedsLammpsFocus = false;
    deps.requestOpenSettings?.({ focusKey: 'files', open: true });
  }

  function handleLammpsTypeMapAndSettings(
    model: StructureModel,
    reason: RenderReason,
  ): void {
    const runtime = deps.getRuntime();

    const runtimeRows = ((runtime?.activeTypeMapRows.value ?? []) as LammpsTypeMapItem[])
      .map(r => ({ typeId: r.typeId, element: r.element }));
    const settingsRows = ((getSettings().lammpsTypeMap ?? []) as LammpsTypeMapItem[])
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
    opts?: { hidePreviousLayers?: boolean },
  ): void {
    const stage = deps.getStage();
    const runtime = deps.getRuntime();
    if (!stage || !runtime) return;

    if (reason === 'load') deps.inspectCtx.clear();

    const forcedName = toForcedFilename(fileName, parseMode.value);

    const model = parseStructure(text, forcedName, {
      lammpsTypeToElement: buildLammpsTypeToElementMap(
        (reason === 'load' ? [] : (getSettings().lammpsTypeMap ?? [])) as LammpsTypeMapItem[],
      ),
      lammpsSortById: true,
    });

    const info
      = reason === 'reparse'
        ? runtime.replaceActiveLayerModel(model)
        : runtime.renderModel(model, {
            hidePreviousLayers: opts?.hidePreviousLayers,
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
  }

  function syncViewPresetAndDistanceOnModelLoad(): void {
    const stage = deps.getStage();
    if (!stage) return;

    const canPatch = !!deps.patchSettings;

    const cam = stage.getCamera();
    const controls = stage.getControls();
    const settings = getSettings();
    const distFromSettings = settings.dualViewDistance;
    const distFromCamera = cam.position.distanceTo(controls.target);
    const dist = (typeof distFromSettings === 'number' && Number.isFinite(distFromSettings))
      ? distFromSettings
      : distFromCamera;

    stage.setDualViewDistance(dist);

    if (canPatch) {
      const patch: Partial<ViewerSettings> = {
        initialDualViewDistance: distFromCamera,
      };
      if (!Number.isFinite(distFromSettings)) {
        patch.dualViewDistance = dist;
      }
      deps.patchSettings!(patch);
    }

    let presets = normalizeViewPresets(getSettings().viewPresets);
    if (presets.length === 0 && !!getSettings().dualViewEnabled) {
      presets = ['front', 'side'];
    }

    if (presets.length === 0) {
      const w = stage.host.getBoundingClientRect().width;
      presets = w >= 900 ? ['front', 'side'] : ['front'];
      if (canPatch)
        deps.patchSettings!({ viewPresets: presets, dualViewEnabled: false });
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
        lammpsTypeMap: cloneTypeMapRows(runtime.activeTypeMapRows.value),
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

    if (deps.patchSettings) {
      deps.patchSettings({
        colorMapTemplate: cloneColorMapRows(runtime.activeColorMapRows.value),
      });
    }
  }

  function isLayerDisplayModified(): boolean {
    const runtime = deps.getRuntime();
    const cur = runtime?.activeDisplaySettings.value ?? null;
    if (!cur) return false;
    return (
      cur.atomScale !== DEFAULT_LAYER_DISPLAY.atomScale
      || cur.showBonds !== DEFAULT_LAYER_DISPLAY.showBonds
      || cur.sphereSegments !== DEFAULT_LAYER_DISPLAY.sphereSegments
      || cur.bondFactor !== DEFAULT_LAYER_DISPLAY.bondFactor
      || cur.bondRadius !== DEFAULT_LAYER_DISPLAY.bondRadius
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
    if (wantsLammps) focusKeys.push('lammps');
    if (wantsLayers) focusKeys.push('layers');
    if (wantsColors) focusKeys.push('colors');
    if (wantsLayerDisplay) focusKeys.push('layerDisplay');

    if (focusKeys.length > 0) {
      deps.requestOpenSettings?.({
        focusKeys: Array.from(new Set(focusKeys)),
        open: true,
      });
      message.info(
        deps.t?.('viewer.settings.modifiedHint')
        ?? '已检测到修改的设置，已打开相关面板。',
      );
      if (deps.patchSettings && deps.settingsRef.value.autoRotate.autoEnabledBySystem) {
        deps.patchSettings({
          autoRotate: {
            ...deps.settingsRef.value.autoRotate,
            enabled: false,
            autoEnabledBySystem: false,
          },
        });
        message.info(
          deps.t?.('viewer.autoRotate.disabledHint')
          ?? '检测到相关设置已展开，已停止自动旋转。',
        );
      }
      return;
    }

    deps.requestOpenSettings?.({
      focusKeys: ['display', 'autoRotate'],
      open: true,
    });
    if (deps.patchSettings) {
      deps.patchSettings({
        autoRotate: {
          ...deps.settingsRef.value.autoRotate,
          enabled: true,
          autoEnabledBySystem: true,
        },
      });
      message.info(
        deps.t?.('viewer.autoRotate.enabledHint')
        ?? '已开启自动旋转，可在设置-自动旋转-启用中关闭。',
      );
    }
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
    opts?: { hidePreviousLayers?: boolean },
  ): Promise<void> {
    try {
      deps.stopPlay();

      lastRawText = text;
      lastRawFileName = fileName;

      renderFromText(text, fileName, 'load', {
        hidePreviousLayers: opts?.hidePreviousLayers,
      });

      syncViewPresetAndDistanceOnModelLoad();

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
      focusSettingsToFilesAndOpen();
    }

    deps.isLoading.value = false;
    deps.hasModel.value = true;

    parseMode.value = 'auto';
    parseInfo.fileName = fileName;
  }

  async function loadUrl(url: string, fileName: string): Promise<void> {
    if (deps.isLoading.value) return;
    await loadInit();
    const t0 = performance.now();

    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const text = await res.text();

    await loadText(t0, text, fileName, {
      hidePreviousLayers: true,
    });
  }

  async function loadFilesInternal(
    files: File[],
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

      for (const f of files) {
        try {
          const text = await f.text();
          lastRawText = text;
          lastRawFileName = f.name;

          renderFromText(text, f.name, 'load', {
            hidePreviousLayers: okCount === 0,
          });

          okCount += 1;
          lastOkName = f.name;
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
        focusSettingsToFilesAndOpen();
      }
    }
    catch (err) {
      parseInfo.success = false;
      parseInfo.errorMsg = (err as Error).message ?? String(err);
      parseInfo.errorSeq += 1;
      console.error(err);
      message.error(`${deps.t('viewer.parse.notice')}: ${parseInfo.errorMsg}`);
      focusSettingsToFilesAndOpen();
    }
    finally {
      deps.isLoading.value = false;
    }
  }

  async function loadFiles(
    files: File[],
  ): Promise<void> {
    await loadFilesInternal(files);
  }

  async function loadFile(file: File): Promise<void> {
    await loadFilesInternal([file]);
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
  };
}

export type ViewerLoader = ReturnType<typeof createViewerLoader>;
