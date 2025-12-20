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
  rotationDeg: RotationDeg;
  // 新增：是否正交（关闭透视）
  orthographic: boolean;

  // 新增：触发“恢复视角”的序号（每次 +1）
  resetViewSeq: number;
};

export const DEFAULT_SETTINGS: ViewerSettings = {
  atomScale: 1,
  showAxes: false,
  showBonds: true,
  rotationDeg: { x: 0, y: 0, z: 0 },
  orthographic: false,
  resetViewSeq: 0,
};
