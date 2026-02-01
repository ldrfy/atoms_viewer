import { watch } from 'vue';
import type { ComputedRef } from 'vue';

type LayerIdLike = { id: string };

export function usePendingAutoApply(layerList: ComputedRef<LayerIdLike[]>) {
  // Track layer ids that have appeared.
  // 记录已出现过的图层 id。
  const knownLayerIds = new Set<string>();
  // Track layers pending one-time auto-apply.
  // 记录待执行一次自动应用的图层。
  const pendingAutoApplyIds = new Set<string>();

  // Track newly loaded layers for one-time auto-apply.
  // 跟踪新加载图层，仅在首次出现时自动应用。
  watch(
    layerList,
    (next) => {
      const nextIds = new Set(next.map(l => l.id));
      for (const id of nextIds) {
        if (!knownLayerIds.has(id)) pendingAutoApplyIds.add(id);
      }
      knownLayerIds.clear();
      for (const id of nextIds) knownLayerIds.add(id);
    },
    { immediate: true },
  );

  // Filter ids that are pending auto-apply, and mark them consumed.
  // 过滤待自动应用的 id，并标记为已消费。
  function filterPending(ids: string[]): string[] {
    const toApply = ids.filter(id => pendingAutoApplyIds.has(id));
    for (const id of toApply) pendingAutoApplyIds.delete(id);
    return toApply;
  }

  return {
    filterPending,
  };
}
