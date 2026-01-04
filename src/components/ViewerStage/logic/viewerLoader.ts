// src/components/ViewerStage/logic/viewerLoader.ts
import { reactive, ref } from 'vue';
import type { Ref } from 'vue';
import { message } from 'ant-design-vue';

import type {
  ViewerSettings,
  LammpsTypeMapItem,
  OpenSettingsPayload,
} from '../../../lib/viewer/settings';
import { hasUnknownElementMappingForTypeIds } from '../../../lib/viewer/settings';
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

  let lastRawText: string | null = null;
  let lastRawFileName: string | null = null;

  let lastLoadNeedsLammpsFocus = false;

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

  function focusSettingsToDisplaySilently(): void {
    lastLoadNeedsLammpsFocus = false;
    deps.requestOpenSettings?.({ focusKey: 'display', open: false });
  }

  function handleLammpsTypeMapAndSettings(
    model: StructureModel,
    reason: RenderReason,
  ): void {
    const runtime = deps.getRuntime();

    const baseRows = (
      (reason === 'reparse'
        ? runtime?.activeTypeMapRows.value ?? []
        : getSettings().lammpsTypeMap ?? []) as LammpsTypeMapItem[]
    ).map(r => ({ typeId: r.typeId, element: r.element }));

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

    lastLoadNeedsLammpsFocus = typeMapAdded || hasUnknownForThisDump;

    if (runtime && mergedRows) {
      runtime.setActiveLayerTypeMapRows(mergedRows);
    }

    if (typeMapAdded || hasUnknownForThisDump) {
      deps.requestOpenSettings?.({ focusKey: 'lammps', open: true });
    }
    else {
      deps.requestOpenSettings?.({ focusKey: 'display', open: false });
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
        (getSettings().lammpsTypeMap ?? []) as LammpsTypeMapItem[],
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
      focusSettingsToDisplaySilently();
    }

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
    const dist = cam.position.distanceTo(controls.target);

    stage.setDualViewDistance(dist);

    if (canPatch) {
      deps.patchSettings!({
        dualViewDistance: dist,
        initialDualViewDistance: dist,
      });
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
  }

  function focusSettingsToLayersOrLammps(): void {
    const runtime = deps.getRuntime();
    if (!deps.requestOpenSettings) return;

    if (lastLoadNeedsLammpsFocus) {
      deps.requestOpenSettings({ focusKey: 'lammps', open: true });
      return;
    }

    if (runtime?.hasAnyTypeId()) {
      const rows = normalizeTypeMapRows(
        ((runtime.activeTypeMapRows.value ?? []) as any) ?? [],
      );
      const activeAtoms = runtime.getActiveAtoms?.() ?? null;

      if (activeAtoms) {
        const { typeIds }
          = collectTypeIdsAndElementDefaultsFromAtoms(activeAtoms);
        if (hasUnknownElementMappingForTypeIds(rows as any, typeIds)) {
          deps.requestOpenSettings({ focusKey: 'lammps', open: true });
          return;
        }
      }

      const hasPlaceholder = rows.some((r) => {
        const el = (r.element ?? '').toString().trim();
        return !el || el.toUpperCase() === 'E';
      });
      if (hasPlaceholder) {
        deps.requestOpenSettings({ focusKey: 'lammps', open: true });
        return;
      }
    }

    deps.requestOpenSettings({ focusKey: 'layers', open: true });
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
    opts?: { hidePreviousLayers?: boolean; openSettingsAfter?: boolean },
  ): Promise<void> {
    try {
      deps.stopPlay();

      lastRawText = text;
      lastRawFileName = fileName;

      renderFromText(text, fileName, 'load', {
        hidePreviousLayers: opts?.hidePreviousLayers,
      });

      syncViewPresetAndDistanceOnModelLoad();

      if (opts?.openSettingsAfter) focusSettingsToLayersOrLammps();

      message.success(`${((performance.now() - t0) / 1000).toFixed(2)} s`);
      parseInfo.success = true;
      parseInfo.errorMsg = '';
    }
    catch (err) {
      parseInfo.success = false;
      parseInfo.errorMsg = (err as Error).message;
      parseInfo.errorSeq += 1;
      console.log(err);
      message.error(`${deps.t('viewer.parse.notice')}: ${parseInfo.errorMsg}`);
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
      openSettingsAfter: false,
    });
  }

  async function loadFilesInternal(
    files: File[],
    opts: { openSettingsAfter: boolean; source: 'drop' | 'picker' | 'api' },
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

        if (opts.openSettingsAfter) focusSettingsToLayersOrLammps();
      }
      else {
        parseInfo.success = false;
        parseInfo.errorMsg = deps.t('viewer.parse.notice');
        parseInfo.errorSeq += 1;
        message.error(deps.t('viewer.parse.notice'));
      }
    }
    catch (err) {
      parseInfo.success = false;
      parseInfo.errorMsg = (err as Error).message ?? String(err);
      parseInfo.errorSeq += 1;
      console.log(err);
      message.error(`${deps.t('viewer.parse.notice')}: ${parseInfo.errorMsg}`);
    }
    finally {
      deps.isLoading.value = false;
    }
  }

  async function loadFiles(
    files: File[],
    source: 'drop' | 'picker' | 'api',
  ): Promise<void> {
    await loadFilesInternal(files, { openSettingsAfter: true, source });
  }

  async function loadFile(file: File): Promise<void> {
    await loadFilesInternal([file], {
      openSettingsAfter: false,
      source: 'api',
    });
  }

  return {
    parseMode,
    parseInfo,
    setParseMode,
    refreshTypeMap,
    loadFiles,
    loadFile,
    loadUrl,
  };
}

export type ViewerLoader = ReturnType<typeof createViewerLoader>;
