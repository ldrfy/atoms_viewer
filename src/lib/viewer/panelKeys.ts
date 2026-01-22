export const PANEL_KEYS = {
  files: 'files',
  rotation: 'rotation',
  view: 'view',
  layers: 'layers',
  lammps: 'lammps',
  details: 'details',
  colors: 'colors',
  other: 'other',
} as const;

export type PanelKey = (typeof PANEL_KEYS)[keyof typeof PANEL_KEYS];

export const PANEL_HEADER_KEYS: Record<PanelKey, string> = {
  files: 'settings.panel.files.header',
  rotation: 'settings.panel.rotation.header',
  view: 'settings.panel.view.header',
  layers: 'settings.panel.layers.header',
  lammps: 'settings.panel.lammps.header',
  details: 'settings.panel.details.header',
  colors: 'settings.panel.colors.header',
  other: 'settings.panel.other.header',
};

export const PANEL_ORDER: PanelKey[] = [
  PANEL_KEYS.files,
  PANEL_KEYS.rotation,
  PANEL_KEYS.view,
  PANEL_KEYS.layers,
  PANEL_KEYS.lammps,
  PANEL_KEYS.details,
  PANEL_KEYS.colors,
  PANEL_KEYS.other,
];
