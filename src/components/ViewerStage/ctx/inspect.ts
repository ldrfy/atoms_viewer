import { ref, type Ref } from 'vue';
import type { Atom } from '../../../lib/structure/types';

export type SelectedAtom = {
  layerId: string;
  atomIndex: number;
  element: string;
  atomicNumber: number;
  id?: number;
  typeId?: number;
  position: [number, number, number]; // raw position
};

export type MeasureInfo = {
  distance12?: number; // Å
  distance23?: number; // Å
  angleDeg?: number;
};

export type InspectCtx = {
  enabled: Ref<boolean>;
  measureMode: Ref<boolean>;
  selected: Ref<SelectedAtom[]>;
  measure: Ref<MeasureInfo>;
  clear: () => void;
};

export function createInspectCtx(): InspectCtx {
  const enabled = ref(true);
  const measureMode = ref(false);
  const selected = ref<SelectedAtom[]>([]);
  const measure = ref<MeasureInfo>({});

  function clear(): void {
    selected.value = [];
    measure.value = {};
  }

  return {
    enabled,
    measureMode,
    selected,
    measure,
    clear,
  };
}

export function computeDistance(a: Atom, b: Atom): number {
  const dx = a.position[0] - b.position[0];
  const dy = a.position[1] - b.position[1];
  const dz = a.position[2] - b.position[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function computeAngleDeg(a: Atom, b: Atom, c: Atom): number {
  // angle ABC, with B as vertex
  const bax = a.position[0] - b.position[0];
  const bay = a.position[1] - b.position[1];
  const baz = a.position[2] - b.position[2];

  const bcx = c.position[0] - b.position[0];
  const bcy = c.position[1] - b.position[1];
  const bcz = c.position[2] - b.position[2];

  const dot = bax * bcx + bay * bcy + baz * bcz;
  const na = Math.sqrt(bax * bax + bay * bay + baz * baz);
  const nc = Math.sqrt(bcx * bcx + bcy * bcy + bcz * bcz);

  const denom = Math.max(1e-12, na * nc);
  const cos = Math.min(1, Math.max(-1, dot / denom));
  return (Math.acos(cos) * 180) / Math.PI;
}

export function atomicNumberFromSymbol(symbol: string, atomicSymbols: readonly string[]): number {
  const idx = atomicSymbols.indexOf(symbol as any);
  return idx >= 0 ? idx : 0;
}
