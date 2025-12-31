import { shallowRef } from "vue";
import type { Ref } from "vue";
import type { LammpsTypeMapItem } from "./settings";

import type { ParseMode, ParseInfo } from "../structure/parse";
import type { ModelLayerInfo } from "../../components/ViewerStage/modelRuntime";

export type ViewerPublicApi = {
  // actions
  openFilePicker: () => void;
  exportPng: (payload: {
    scale: number;
    transparent: boolean;
  }) => void | Promise<void>;

  // LAMMPS typeId -> element mapping
  refreshTypeMap: () => void;

  // parse
  parseInfo: ParseInfo;
  parseMode: Ref<ParseMode>;
  setParseMode: (mode: ParseMode) => void;

  // layers
  layers: Ref<ModelLayerInfo[]>;
  activeLayerId: Ref<string | null>;
  setActiveLayer: (id: string) => void;
  setLayerVisible: (id: string, visible: boolean) => void;
  removeLayer: (id: string) => void;

  // per-layer LAMMPS type map (active layer)
  activeLayerTypeMap: Ref<LammpsTypeMapItem[]>;
  setActiveLayerTypeMap: (rows: LammpsTypeMapItem[]) => void;
};

/**
 * A lightweight, global bridge to access the current ViewerStage instance.
 *
 * Rationale:
 * - SettingsSider is a sibling of ViewerStage (not a direct parent),
 *   so passing refs through multiple components becomes brittle.
 * - This bridge keeps the integration explicit and type-safe.
 */
export const viewerApiRef = shallowRef<ViewerPublicApi | null>(null);

export function setViewerApi(api: ViewerPublicApi | null): void {
  viewerApiRef.value = api;
}
