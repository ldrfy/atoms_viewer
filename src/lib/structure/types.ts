export type Vec3 = [number, number, number];

export interface Atom {
  element: string;
  position: Vec3;
}

export interface StructureModel {
  atoms: Atom[];
  comment?: string;

  // 预留：多帧轨迹/动画（xyz 多帧、md 等）
  frames?: Atom[][];

  // 元信息：便于 UI 展示、日志记录
  source?: {
    filename: string;
    format: string;
  };
}
