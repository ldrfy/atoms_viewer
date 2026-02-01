import { computed } from 'vue';
import type { ComputedRef, Ref } from 'vue';

type LayerInfoLike = { id: string };

export function useSettingsTargetLayers(args: {
  selectedLayerIds: Ref<string[]>;
  activeLayerId: Ref<string | null>;
  layerList: ComputedRef<LayerInfoLike[]>;
}) {
  const { selectedLayerIds, activeLayerId, layerList } = args;

  // Resolve target layers: selection first, otherwise active layer.
  // 解析目标图层：优先选中列表，否则回退到当前图层。
  const targetLayerIds = computed(() => {
    const picked = selectedLayerIds.value.filter(Boolean);
    if (picked.length > 0) return picked;
    return activeLayerId.value ? [activeLayerId.value] : [];
  });

  // Resolve target layer infos by id.
  // 根据 id 解析目标图层信息。
  const targetLayerInfos = computed(() => {
    if (targetLayerIds.value.length === 0) return [];
    const byId = new Map(layerList.value.map(l => [l.id, l]));
    return targetLayerIds.value.map(id => byId.get(id)).filter(Boolean) as LayerInfoLike[];
  });

  return {
    targetLayerIds,
    targetLayerInfos,
  };
}
