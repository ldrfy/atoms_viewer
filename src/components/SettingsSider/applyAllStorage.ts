export type ApplyAllLayersFlags = {
  details?: boolean;
  colors?: boolean;
  lammps?: boolean;
};

const APPLY_ALL_DETAILS_KEY = 'settings.details.applyAllLayers';
const APPLY_ALL_COLORS_KEY = 'settings.colors.applyAllLayers';
const APPLY_ALL_LAMMPS_KEY = 'settings.lammps.applyAllLayers';

function readFlag(key: string): boolean | undefined {
  try {
    const raw = localStorage.getItem(key);
    if (raw === '0') return false;
    if (raw === '1') return true;
  }
  catch {
    // ignore storage failures
  }
  return undefined;
}

function writeFlag(key: string, value: boolean | undefined): void {
  if (typeof value !== 'boolean') return;
  try {
    localStorage.setItem(key, value ? '1' : '0');
  }
  catch {
    // ignore storage failures
  }
}

export function readApplyAllLayersFlags(): ApplyAllLayersFlags {
  return {
    details: readFlag(APPLY_ALL_DETAILS_KEY),
    colors: readFlag(APPLY_ALL_COLORS_KEY),
    lammps: readFlag(APPLY_ALL_LAMMPS_KEY),
  };
}

export function writeApplyAllLayersFlags(flags: ApplyAllLayersFlags): void {
  writeFlag(APPLY_ALL_DETAILS_KEY, flags.details);
  writeFlag(APPLY_ALL_COLORS_KEY, flags.colors);
  writeFlag(APPLY_ALL_LAMMPS_KEY, flags.lammps);
}
