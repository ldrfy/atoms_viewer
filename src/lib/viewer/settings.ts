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
  // 新增：是否正交（关闭透视）
  orthographic: boolean;

  // 新增：触发“恢复视角”的序号（每次 +1）
  resetViewSeq: number;
};

export const DEFAULT_SETTINGS: ViewerSettings = {
  atomScale: 1,
  showAxes: true,
  showBonds: true,
  background: "dark",
  rotationDeg: { x: 0, y: 0, z: 0 },
  orthographic: false,
  resetViewSeq: 0,
};

export const BG_OPTIONS = [
  { value: "dark" as const, label: "深色" },
  { value: "light" as const, label: "浅色" },
];
