import type { LayerSourceData } from '../../../lib/viewer/sessionTypes';

export type { LayerSourceData };

export function createLayerSourceStore() {
  const map = new Map<string, LayerSourceData>();

  return {
    set(id: string, data: LayerSourceData): void {
      map.set(id, data);
    },
    get(id: string): LayerSourceData | undefined {
      return map.get(id);
    },
    delete(id: string): void {
      map.delete(id);
    },
    clear(): void {
      map.clear();
    },
    entries(): IterableIterator<[string, LayerSourceData]> {
      return map.entries();
    },
  };
}
