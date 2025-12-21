export type Vec3 = [number, number, number];

export interface Atom {
  element: string;
  position: Vec3;

  // 仅 LAMMPS dump 等格式会有
  typeId?: number; // LAMMPS 的 type
  id?: number; // LAMMPS 的 id（用于排序、动画稳定）
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
