export type BackgroundMode = "dark" | "light";

export type RotationDeg = {
  x: number;
  y: number;
  z: number;
};

export type ViewerSettings = {
  atomScale: number;
  showAxes: boolean;
  showBonds: boolean;
  background: BackgroundMode;
  rotationDeg: RotationDeg;
};

export const DEFAULT_SETTINGS: ViewerSettings = {
  atomScale: 1,
  showAxes: true,
  showBonds: true,
  background: "dark",
  rotationDeg: { x: 0, y: 0, z: 0 },
};

export const BG_OPTIONS = [
  { value: "dark" as const, label: "深色" },
  { value: "light" as const, label: "浅色" },
];
