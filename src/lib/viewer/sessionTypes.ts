import type {
  LammpsTypeMapRecord,
  DetailsSettingsGroup,
  ViewerSettings,
  InspectSelectionItem,
} from './settings';

export type LayerSourceInfo = {
  md5?: string;
  size?: number;
  fileName?: string;
  mime?: string;
  type?: 'file' | 'url' | 'text';
  url?: string;
  cached?: boolean;
};

export type LayerSnapshot = {
  id?: string;
  name?: string;
  visible?: boolean;
  createdAtMs?: number;
  source?: LayerSourceInfo;
  /** Per-layer appearance */
  details?: DetailsSettingsGroup;
  /** Per-layer colors */
  colors?: {
    data?: Record<string, string>;
  };
  /** Per-layer LAMMPS type mapping */
  lammps?: {
    data?: LammpsTypeMapRecord;
  };
  /** Per-layer atom selections (for export/恢复) */
  inspectSelection?: InspectSelectionItem[];
};

export type LayerSortBy = 'time,ASC' | 'time,DESC' | 'name,ASC' | 'name,DESC';

export type LayersSnapshot = {
  sortBy: LayerSortBy;
  activeId?: string;
  data: Record<string, LayerSnapshot>;
};

export type LayerSourceData = LayerSourceInfo & {
  layerId: string;
  buffer?: ArrayBuffer;
};

export type ViewerSettingsCategorized = ViewerSettings;

export type SessionSnapshot = {
  app?: {
    version?: string;
    savedAt?: string;
    locale?: string;
    buildTime?: string;
  };
  settings: Partial<ViewerSettingsCategorized> | ViewerSettings;
  layers: LayersSnapshot;
};
