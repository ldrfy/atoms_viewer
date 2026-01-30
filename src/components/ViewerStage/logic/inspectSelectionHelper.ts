import type { Ref, ComputedRef } from 'vue';
import type { InspectSelectionItem } from '../../../lib/viewer/settings';
import type { InspectCtx } from '../ctx/inspect';
import type { ModelRuntime } from '../modelRuntime';
import type { LayerSourceData } from '../../../lib/viewer/sessionTypes';
import type { SettingsPatch } from '../../../lib/viewer/mergeSettings';
import type { ViewerSettings } from '../../../lib/viewer/settings';

const INSPECT_MAP_KEY = 'atomsViewer.inspectSelectionByMd5';

function loadInspectMap(): Record<string, InspectSelectionItem[]> {
  try {
    const raw = localStorage.getItem(INSPECT_MAP_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    if (typeof obj !== 'object' || obj === null) return {};
    return obj as Record<string, InspectSelectionItem[]>;
  }
  catch {
    return {};
  }
}

function saveInspectMap(map: Record<string, InspectSelectionItem[]>): void {
  try {
    localStorage.setItem(INSPECT_MAP_KEY, JSON.stringify(map));
  }
  catch {
    /* ignore */
  }
}

export type InspectSelectionHelperDeps = {
  settingsRef: Ref<ViewerSettings>;
  patchSettings: (patch: SettingsPatch) => void;
  inspectCtx: InspectCtx;
  layerSourceStore: {
    get: (id: string) => LayerSourceData | undefined;
    entries: () => IterableIterator<[string, LayerSourceData]>;
  };
  runtime: () => ModelRuntime | null;
  activeLayerId: ComputedRef<string | null>;
};

export function createInspectSelectionHelper(deps: InspectSelectionHelperDeps) {
  let pickingRef: { rebuildSelectionVisualsFromSelected: () => void } | null = null;
  const suppress = { value: false };
  const lastSig = { value: '' };

  function normalizeForSave(sel: InspectCtx['selected']['value']): InspectSelectionItem[] {
    return (sel ?? []).map(s => ({
      layerId: s.layerId,
      layerName: s.layerName,
      md5: deps.layerSourceStore.get(s.layerId)?.md5,
      atomIndex: s.atomIndex,
      element: s.element,
      id: s.id,
      typeId: s.typeId,
      position: s.position ? [...s.position] as [number, number, number] : undefined,
    }));
  }

  function resolveLayerId(item: InspectSelectionItem): string {
    if (item.md5) {
      for (const [layerId, data] of deps.layerSourceStore.entries()) {
        if (data?.md5 === item.md5) return layerId;
      }
      return '';
    }
    if (item.layerName) {
      for (const [layerId, data] of deps.layerSourceStore.entries()) {
        const name = data?.fileName || data?.url || data?.layerId;
        if (name === item.layerName) return layerId;
      }
    }
    const runtimeLayers = deps.runtime()?.layers.value ?? [];
    if (runtimeLayers.length === 1) return runtimeLayers[0]!.id;
    return item.layerId;
  }

  function hydrateSelection(items: InspectSelectionItem[]): InspectCtx['selected']['value'] {
    const out: InspectCtx['selected']['value'] = [];
    for (const item of items ?? []) {
      const layerId = resolveLayerId(item);
      if (!layerId) continue;
      const base = {
        layerId,
        layerName: item.layerName,
        atomIndex: item.atomIndex,
        element: item.element ?? 'E',
        id: item.id,
        typeId: item.typeId,
        position: item.position
          ? [item.position[0], item.position[1], item.position[2]] as [number, number, number]
          : [0, 0, 0] as [number, number, number],
      };
      if (!item.position || !item.element) {
        const atoms = deps.runtime()?.getAtomsForLayer(layerId);
        const atom = atoms?.[item.atomIndex];
        if (atom) {
          base.element = atom.element ?? base.element;
          base.position = [atom.position[0], atom.position[1], atom.position[2]] as [number, number, number];
          if (atom.id != null) base.id = atom.id;
          if (atom.typeId != null) base.typeId = atom.typeId;
        }
      }
      out.push(base);
    }
    return out;
  }

  function persistInspectForMd5(md5: string | undefined, items: InspectSelectionItem[]): void {
    if (!md5) return;
    const map = loadInspectMap();

    // 触发一次删除+重建，确保当前 md5 始终是最新插入顺序
    delete map[md5];
    map[md5] = items;

    // 只保留“未加载图层”的最近 5 个，其余丢弃；已加载的全部保留
    const loadedMd5 = new Set<string>();
    for (const [, data] of deps.layerSourceStore.entries()) {
      if (data?.md5) loadedMd5.add(data.md5);
    }
    const keys = Object.keys(map);
    const stale = keys.filter(k => !loadedMd5.has(k));
    if (stale.length > 5) {
      const toRemove = stale.slice(0, stale.length - 5); // 先删最老的
      toRemove.forEach(k => delete map[k]);
    }

    saveInspectMap(map);
  }

  function restoreInspectForMd5(md5: string | undefined): boolean {
    if (!md5) return false;
    const map = loadInspectMap();
    const list = Array.isArray(map[md5]) ? map[md5] as InspectSelectionItem[] : [];
    if (!list.length) return false;
    suppress.value = true;
    deps.inspectCtx.selected.value = hydrateSelection(list);
    suppress.value = false;
    pickingRef?.rebuildSelectionVisualsFromSelected();
    return true;
  }

  function rehydrateFromSettings(): void {
    const list = Array.isArray(deps.settingsRef.value.inspectSelection)
      ? deps.settingsRef.value.inspectSelection
      : [];
    if (list.length === 0) {
      // 优先用 runtime 中已带回的 per-layer 选中（会话恢复、导出设置加载时用）
      const runtimeLayers = deps.runtime()?.layers.value ?? [];
      const targetLayerId = deps.activeLayerId.value || runtimeLayers[0]?.id;
      if (targetLayerId) {
        const runtimeSel = deps.runtime()?.getLayerInspectSelection?.(targetLayerId);
        if (runtimeSel && runtimeSel.length) {
          suppress.value = true;
          deps.inspectCtx.selected.value = hydrateSelection(runtimeSel);
          suppress.value = false;
          pickingRef?.rebuildSelectionVisualsFromSelected();
          return;
        }
        const activeMd5 = deps.layerSourceStore.get(targetLayerId)?.md5;
        if (restoreInspectForMd5(activeMd5)) return;
      }
      return;
    }
    suppress.value = true;
    deps.inspectCtx.selected.value = hydrateSelection(list);
    suppress.value = false;
    pickingRef?.rebuildSelectionVisualsFromSelected();
  }

  function backfillSelectionMd5(_layerId: string, md5?: string): void {
    if (!md5) return;
    const list = Array.isArray(deps.settingsRef.value.inspectSelection)
      ? deps.settingsRef.value.inspectSelection
      : [];
    if (list.length === 0) return;
    restoreInspectForMd5(md5);
  }

  function onSelectionChanged(sel: InspectCtx['selected']['value']): void {
    if (suppress.value) return;
    const items = normalizeForSave(sel);
    const sig = JSON.stringify(items);
    if (sig === lastSig.value) return;
    lastSig.value = sig;
    // 不再写入全局 settings，直接记在每个 layer 里，导出跟随 layerSnapshots
    const activeId = deps.activeLayerId.value;
    if (activeId) {
      deps.runtime()?.setLayerInspectSelection?.(activeId, items);
    }
    const activeMd5 = deps.layerSourceStore.get(deps.activeLayerId.value ?? '')?.md5;
    persistInspectForMd5(activeMd5, items);
  }

  function onSettingsChanged(items: InspectSelectionItem[]): void {
    const list = Array.isArray(items) ? items : [];
    const sig = JSON.stringify(list);
    if (sig === lastSig.value) return;
    lastSig.value = sig;
    suppress.value = true;
    deps.inspectCtx.selected.value = hydrateSelection(list);
    suppress.value = false;
    pickingRef?.rebuildSelectionVisualsFromSelected();
  }

  function setPicking(p: { rebuildSelectionVisualsFromSelected: () => void } | null): void {
    pickingRef = p;
  }

  return {
    normalizeForSave,
    hydrateSelection,
    rehydrateFromSettings,
    backfillSelectionMd5,
    onSelectionChanged,
    onSettingsChanged,
    restoreInspectForMd5,
    setPicking,
    persistInspectForMd5,
  };
}
