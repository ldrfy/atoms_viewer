export type Vec3 = [number, number, number];

export interface Atom {
  element: string;
  position: Vec3;
  /** Fractional position for periodic structures. */
  fracPosition?: Vec3;
  /** Original atom name (e.g. "CA"). */
  name?: string;
  /** Residue name (e.g. "ALA"). */
  resName?: string;
  /** Residue sequence number. */
  resSeq?: number;
  /** Chain identifier. */
  chainId?: string;

  // 仅 LAMMPS dump 等格式会有
  typeId?: number; // LAMMPS 的 type
  id?: number; // LAMMPS 的 id（用于排序、动画稳定）
}

export type FrameMeta = {
  comment?: string;
  timestep?: number;
};

export interface StructureModel {
  atoms: Atom[];
  comment?: string;
  /** Unit cell parameters when available. */
  cell?: CellParams;

  // 预留：多帧轨迹/动画（xyz 多帧、md 等）
  frames?: Atom[][];
  frameMeta?: FrameMeta[];

  // 元信息：便于 UI 展示、日志记录
  source?: {
    filename: string;
    format: string;
  };
}

export type CellParams = {
  a: number;
  b: number;
  c: number;
  alpha: number;
  beta: number;
  gamma: number;
};

export interface SampleManifestItem {
  fileName: string;
  label: string;
  url: string;
  //   MB
  size: number;
}
