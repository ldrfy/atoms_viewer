import type {
  AtomTypeColorMapItem,
  LammpsTypeMapItem,
  LayerDisplaySettings,
  AutoRotateSettings,
  ViewerSettings,
  FileSettingsGroup,
  DisplaySettingsGroup,
  OtherSettingsGroup,
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
  details: LayerDisplaySettings;
  /** Per-layer colors */
  colors: AtomTypeColorMapItem[];
  /** Per-layer LAMMPS type mapping */
  lammps: LammpsTypeMapItem[];
};

export type LayerSourceData = LayerSourceInfo & {
  layerId: string;
  buffer?: ArrayBuffer;
};

export type ViewerSettingsCategorized = {
  files: FileSettingsGroup;
  rotation: AutoRotateSettings;
  view: DisplaySettingsGroup;
  details: LayerDisplaySettings;
  lammps: LammpsTypeMapItem[];
  colors: AtomTypeColorMapItem[];
  other: OtherSettingsGroup;
};

export type SessionSnapshot = {
  version: string;
  savedAt: string;
  app?: {
    locale?: string;
  };
  settings: ViewerSettingsCategorized | ViewerSettings;
  layers: LayerSnapshot[];
};
