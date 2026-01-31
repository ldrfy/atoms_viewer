import type { ComputedRef } from 'vue';
import type { InspectSelectionItem } from '../../../lib/viewer/settings';
import type { InspectCtx } from '../ctx/inspect';
import type { ModelRuntime } from '../modelRuntime';

export type InspectSelectionHelperDeps = {
  inspectCtx: InspectCtx;
  runtime: () => ModelRuntime | null;
  activeLayerId: ComputedRef<string | null>;
};

export function createInspectSelectionHelper(deps: InspectSelectionHelperDeps) {
  let pickingRef: { rebuildSelectionVisualsFromSelected: () => void } | null = null;
  const suppress = { value: false };
  const lastSig = { value: '' };

  // Prefer layer file name as display label.
  // 优先使用图层文件名作为显示标签。
  function getLayerLabel(layerId: string): string {
    const runtime = deps.runtime();
    const info = runtime?.layers.value.find(l => l.id === layerId) ?? null;
    const file = String(info?.source?.fileName ?? '').trim();
    const name = String(info?.name ?? '').trim();
    return file || name || layerId;
  }

  // 生成选中列表签名，避免无意义重复同步。
  // Build a signature for selections to prevent redundant sync.
  function buildSelectionSignature(sel: InspectCtx['selected']['value']): string {
    return JSON.stringify((sel ?? []).map(s => ({
      layerId: s.layerId,
      atomIndex: s.atomIndex,
      element: s.element,
      id: s.id,
      typeId: s.typeId,
      position: s.position ? [s.position[0], s.position[1], s.position[2]] : undefined,
    })));
  }

  // 将 UI 选中列表转换为每层存储的精简条目。
  // Convert UI selections into per-layer compact items.
  function collectByLayer(sel: InspectCtx['selected']['value']): Map<string, InspectSelectionItem[]> {
    const byLayer = new Map<string, InspectSelectionItem[]>();
    for (const s of sel ?? []) {
      const layerId = s.layerId ?? deps.activeLayerId.value ?? '';
      if (!layerId) continue;
      const list = byLayer.get(layerId) ?? [];
      list.push({
        atomIndex: s.atomIndex,
        element: s.element,
        id: s.id,
        typeId: s.typeId,
        position: s.position ? [...s.position] as [number, number, number] : undefined,
      });
      byLayer.set(layerId, list);
    }
    return byLayer;
  }

  // 将存储条目还原为 UI 选择结构（补上 layerId 与缺失属性）。
  // Hydrate stored items into UI selection (inject layerId + missing fields).
  function hydrateSelection(items: InspectSelectionItem[], layerId: string): InspectCtx['selected']['value'] {
    const out: InspectCtx['selected']['value'] = [];
    for (const item of items ?? []) {
      const base = {
        layerId,
        layerName: getLayerLabel(layerId),
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

  // 从运行时恢复当前图层选中原子。
  // Restore current-layer selection from runtime state.
  function rehydrateFromSettings(): void {
    const runtime = deps.runtime();
    const runtimeLayers = runtime?.layers.value ?? [];
    if (runtimeLayers.length === 0) return;
    // 聚合所有图层的选中列表，保证多图层恢复。
    // Aggregate selections from all layers to restore multi-layer selection.
    const hydrated: InspectCtx['selected']['value'] = [];
    for (const layer of runtimeLayers) {
      const items = runtime?.getLayerInspectSelection?.(layer.id) ?? [];
      if (!items || items.length === 0) continue;
      hydrated.push(...hydrateSelection(items, layer.id));
    }
    suppress.value = true;
    deps.inspectCtx.selected.value = hydrated;
    suppress.value = false;
    lastSig.value = buildSelectionSignature(hydrated);
    pickingRef?.rebuildSelectionVisualsFromSelected();
  }

  // 选中变化时同步到运行时（按图层保存）。
  // Sync selection changes into runtime (store per layer).
  function onSelectionChanged(sel: InspectCtx['selected']['value']): void {
    if (suppress.value) return;
    const sig = buildSelectionSignature(sel);
    if (sig === lastSig.value) return;
    lastSig.value = sig;
    const runtime = deps.runtime();
    const byLayer = collectByLayer(sel);
    const runtimeLayers = runtime?.layers.value ?? [];
    if (byLayer.size === 0) {
      for (const layer of runtimeLayers) {
        runtime?.setLayerInspectSelection?.(layer.id, []);
      }
      return;
    }
    for (const [layerId, items] of byLayer) {
      runtime?.setLayerInspectSelection?.(layerId, items);
    }
    // 清理未出现在选择列表中的图层。
    // Clear selections for layers not present in the current list.
    for (const layer of runtimeLayers) {
      if (!byLayer.has(layer.id)) {
        runtime?.setLayerInspectSelection?.(layer.id, []);
      }
    }
  }

  return {
    setPicking: (ref: { rebuildSelectionVisualsFromSelected: () => void } | null) => {
      pickingRef = ref;
    },
    rehydrateFromSettings,
    onSelectionChanged,
  };
}
