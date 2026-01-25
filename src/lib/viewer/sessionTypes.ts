import type {
  LammpsTypeMapItem,
  DetailsSettingsGroup,
  ViewerSettings,
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
  id: string;
  name: string;
  visible: boolean;
  source?: LayerSourceInfo;
  /** Per-layer appearance */
  details: DetailsSettingsGroup;
  /** Per-layer colors */
  colors: {
    data: Record<string, string>;
  };
  /** Per-layer LAMMPS type mapping */
  lammps: LammpsTypeMapItem[];
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
  settings: ViewerSettingsCategorized | ViewerSettings;
  layers: LayerSnapshot[];
};
