import { shallowRef } from 'vue';
import type { Ref } from 'vue';
import type {
  LammpsTypeMapRecord,
  DetailsSettingsGroup,
  ViewerSettings,
} from './settings';
import type { ColorMapRecord } from '../../components/ViewerStage/colorMap';
import type { LayerSortBy } from './sessionTypes';

import type { ParseMode, ParseInfo } from '../structure/parse';
import type { ModelLayerInfo } from '../../components/ViewerStage/modelRuntime';
import type { StructureExportFormat } from '../structure/export';

export type ViewerPublicApi = {
  /** Open the OS file picker and load a model into the viewer. */
  openFilePicker: () => void;
  /** Export current viewport to a PNG image. */
  exportPng: (payload: {
    scale: number;
    transparent: boolean;
    format?: 'png' | 'webp' | 'jpg';
    cropBox?: { x: number; y: number; w: number; h: number };
  }) => void | Promise<void>;
  /** Select an area and export to PNG. */
  exportPngWithSelection: (payload: {
    scale: number;
    transparent: boolean;
    format?: 'png' | 'webp' | 'jpg';
  }) => void;
  /** Export current active layer to a structure file (text formats). */
  exportStructureFile: (format: StructureExportFormat) => Promise<{
    blob: Blob;
    filename: string;
  }>;

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
  /** Toggle visibility for all layers at once. */
  setAllLayersVisible: (visible: boolean) => void;
  /** Sort layer order for display. */
  sortLayers: (opts: { by: 'time' | 'name'; direction: 'asc' | 'desc' }) => void;
  /** Current layer sort mode (persisted in session export). */
  layerSortBy: Ref<LayerSortBy>;
  /** Remove a layer from the scene and internal state. */
  removeLayer: (id: string) => void;

  /** LAMMPS typeId→element mapping for the active layer (editable in Settings). */
  activeLayerTypeMap: Ref<LammpsTypeMapRecord>;
  /** Active layer LAMMPS typeId list (sorted). */
  activeLayerTypeIds: Ref<number[]>;
  /** Whether the active layer's type map has been applied via refresh. */
  activeLayerTypeMapApplied: Ref<boolean>;
  /** Replace the entire active-layer type map. */
  setActiveLayerTypeMap: (map: LammpsTypeMapRecord) => void;
  /** Apply a template mapping to all layers (only existing typeIds). */
  applyTypeMapToAllLayers: (map: LammpsTypeMapRecord) => void;
  /** Reset all layers' type map to defaults (based on current atoms). */
  resetAllLayersTypeMapToDefaults: (opts?: {
    templateMap?: LammpsTypeMapRecord;
    useAtomDefaults?: boolean;
  }) => void;

  /**
   * Per-layer atom colors for the active layer.
   * Keying rules:
   * - Generic: "C"
   * - LAMMPS: "C.1", "C.2"
   */
  activeLayerColorMap: Ref<ColorMapRecord>;
  /** Active layer color key order (for UI). */
  activeLayerColorKeys: Ref<string[]>;
  /** Replace the entire active-layer color map. */
  setActiveLayerColorMap: (map: ColorMapRecord) => void;
  /** Replace all layers' color maps at once (duplicate keys per layer). */
  setAllLayersColorMap: (map: ColorMapRecord) => void;
  /** Reset all layers' color maps to default element colors. */
  resetAllLayersColorMapToDefaults: () => void;

  /** Per-layer display settings (atom size / bond visibility / quality) for the active layer. */
  activeLayerDisplay: Ref<DetailsSettingsGroup | null>;
  /** Patch active-layer display settings; optionally apply to all layers. */
  setActiveLayerDisplay: (
    patch: Partial<DetailsSettingsGroup>,
    opts?: { applyToAll?: boolean },
  ) => void;
  /** Snapshot current layers with metadata/settings (for export/session). */
  getLayerSnapshots: () => Promise<import('./sessionTypes').LayerSnapshot[]>;
  /** Apply per-layer snapshots with MD5 matching fallback by order. */
  applyLayerSnapshots: (
    snaps: import('./sessionTypes').LayerSnapshot[],
  ) => Promise<void>;
  /** Get layer source blobs/metadata for export/session restore. */
  getLayerSources: () => Promise<import('./sessionTypes').LayerSourceData[]>;
  /** Apply a full session snapshot (settings + layers), optionally with bundled files. */
  applySessionSnapshot: (
    snapshot: import('./sessionTypes').SessionSnapshot,
    files?: File[],
    opts?: { suppressSessionSave?: boolean },
  ) => Promise<void>;
  /** Whether remote models should be cached locally for export/restore. */
  cacheRemoteOnExport: Ref<boolean>;
  /** Toggle remote model caching for export/restore. */
  setCacheRemoteOnExport: (v: boolean) => void;
  /** Apply view-related settings (distance/rotation) to the stage immediately. */
  applyViewFromSettings: (overrides?: Partial<ViewerSettings>) => void;
  /** Temporarily suspend settings sync from controls/auto-rotation. */
  suspendSettingsSync: (ms?: number) => void;

  /** Whether any visible layer uses custom atom colors. */
  visibleCustomColors: Ref<boolean>;
};

/**
 * A lightweight, global bridge to access the current ViewerStage instance.
 *
 * Rationale:
 * - SettingsSider is a sibling of ViewerStage (not a direct parent),
 *   so passing refs through multiple components becomes brittle.
 * - This bridge keeps the integration explicit and type-safe.
 *
 * 轻量级全局桥接，用于访问当前 ViewerStage。
 * 说明：
 * - SettingsSider 与 ViewerStage 为同级组件，传参链易碎；
 * - 通过桥接保持调用显式且类型安全。
 */
export const viewerApiRef = shallowRef<ViewerPublicApi | null>(null);

/**
 * Update the global ViewerStage bridge reference.
 * 更新全局 ViewerStage 桥接引用。
 */
export function setViewerApi(api: ViewerPublicApi | null): void {
  viewerApiRef.value = api;
}
