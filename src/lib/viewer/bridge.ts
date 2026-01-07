import { shallowRef } from 'vue';
import type { Ref } from 'vue';
import type {
  LammpsTypeMapItem,
  AtomTypeColorMapItem,
  LayerDisplaySettings,
  ViewerSettings,
} from './settings';

import type { ParseMode, ParseInfo } from '../structure/parse';
import type { ModelLayerInfo } from '../../components/ViewerStage/modelRuntime';

export type ViewerPublicApi = {
  /** Open the OS file picker and load a model into the viewer. */
  openFilePicker: () => void;
  /** Export current viewport to a PNG image. */
  exportPng: (payload: {
    scale: number;
    transparent: boolean;
  }) => void | Promise<void>;

  /**
   * Apply the current active-layer LAMMPS typeId→element mapping.
   * This triggers a re-parse / rebuild of the active layer visuals.
   */
  refreshTypeMap: () => void;

  /**
   * Apply the current active-layer color map to existing meshes.
   * This does NOT require reloading the model data.
   */
  refreshColorMap: (opts?: { applyToAll?: boolean }) => void;

  /** Parsed metadata for the currently loaded file(s). */
  parseInfo: ParseInfo;
  /** Current parsing mode (e.g. auto / strict). */
  parseMode: Ref<ParseMode>;
  /** Update parsing mode; may affect how the next file is interpreted. */
  setParseMode: (mode: ParseMode) => void;

  /** All loaded layers (multi-file and/or multi-frame). */
  layers: Ref<ModelLayerInfo[]>;
  /** The currently selected/active layer id. */
  activeLayerId: Ref<string | null>;
  /** Switch the active layer. */
  setActiveLayer: (id: string) => void;
  /** Toggle visibility of a layer without removing it. */
  setLayerVisible: (id: string, visible: boolean) => void;
  /** Remove a layer from the scene and internal state. */
  removeLayer: (id: string) => void;

  /** LAMMPS typeId→element mapping rows for the active layer (editable in Settings). */
  activeLayerTypeMap: Ref<LammpsTypeMapItem[]>;
  /** Whether the active layer's type map has been applied via refresh. */
  activeLayerTypeMapApplied: Ref<boolean>;
  /** Replace the entire active-layer type map. */
  setActiveLayerTypeMap: (rows: LammpsTypeMapItem[]) => void;
  /** Reset all layers' type map rows to defaults (based on current atoms). */
  resetAllLayersTypeMapToDefaults: (opts?: {
    templateRows?: LammpsTypeMapItem[];
    useAtomDefaults?: boolean;
  }) => void;

  /**
   * Per-layer atom colors for the active layer.
   * Keying rules:
   * - Generic formats: { element: 'C', color: '#RRGGBB' }
   * - LAMMPS: { element: 'C', typeId: 1, color: '#RRGGBB' } -> colorKey "C1"
   */
  activeLayerColorMap: Ref<AtomTypeColorMapItem[]>;
  /** Replace the entire active-layer color map. */
  setActiveLayerColorMap: (rows: AtomTypeColorMapItem[]) => void;
  /** Replace all layers' color maps at once (duplicate rows per layer). */
  setAllLayersColorMap: (rows: AtomTypeColorMapItem[]) => void;
  /** Reset all layers' color maps to default element colors. */
  resetAllLayersColorMapToDefaults: () => void;

  /** Per-layer display settings (atom size / bond visibility / quality) for the active layer. */
  activeLayerDisplay: Ref<LayerDisplaySettings | null>;
  /** Patch active-layer display settings; optionally apply to all layers. */
  setActiveLayerDisplay: (
    patch: Partial<LayerDisplaySettings>,
    opts?: { applyToAll?: boolean },
  ) => void;
  /** Apply view-related settings (distance/rotation) to the stage immediately. */
  applyViewFromSettings: (overrides?: Partial<ViewerSettings>) => void;
  /** Temporarily suspend settings sync from controls/auto-rotation. */
  suspendSettingsSync: (ms?: number) => void;
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
