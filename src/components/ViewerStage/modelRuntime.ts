import * as THREE from "three";
import type { Ref } from "vue";

import type { Atom, StructureModel } from "../../lib/structure/types";
import type { ViewerSettings } from "../../lib/viewer/settings";
import type { ThreeStage } from "../../lib/three/stage";

import { normalizeElementSymbol } from "../../lib/structure/chem";
import { makeTextLabel } from "../../lib/three/labels2d";
import { removeAndDisposeInstancedMeshes } from "../../lib/three/dispose";
import { buildBondMeshesBicolor } from "../../lib/three/instancedBonds";
import {
  buildAtomMeshesByElement,
  applyAtomScaleToMeshes,
  getSphereBaseRadiusByElement,
} from "../../lib/three/instancedAtoms";
import { fitCameraToAtoms, isPerspective } from "../../lib/three/camera";

import { applyFrameAtomsToMeshes, computeMeanCenterInto } from "./animation";
import { remapElementByTypeId } from "./typeMap";

/**
 * 模型运行时（渲染层）：
 * - 管理当前模型的 InstancedMesh（原子、键合）
 * - 管理动画帧数据、锁中心更新
 * - 提供 applyXXX 以响应 settings 改动
 *
 * Model runtime (render layer):
 * - Manage instanced meshes (atoms, bonds)
 * - Manage animation frames & "center lock" update
 * - Provide applyXXX methods reacting to settings changes
 */
export type ModelRuntime = {
  clearModel: () => void;

  /** 渲染模型（建立第一帧的 mesh 并 fit 相机） / Render model (build meshes for first frame and fit camera) */
  renderModel: (model: StructureModel) => {
    frameCount: number;
    hasAnimation: boolean;
  };

  /** 应用某帧位置（只更新原子实例矩阵） / Apply a frame (update atom instance matrices only) */
  applyFrameByIndex: (idx: number) => void;

  /** 重建 meshes（颜色/半径/键合等） / Rebuild meshes (colors/radii/bonds, etc.) */
  rebuildVisualsForAtoms: (atoms: Atom[]) => void;

  applyAtomScale: () => void;
  applyShowBonds: () => void;
  applyShowAxes: () => void;
  applyModelRotation: () => void;

  /** typeMap 变化后的处理：重映射元素并重建当前帧 / On typeMap change: remap elements and rebuild current frame */
  onTypeMapChanged: (currentFrameIndex: number) => void;

  getFrameCount: () => number;
  hasAnyTypeId: () => boolean;
  getLastBondSegCount: () => number;
  applyBackgroundColor: () => void;
};

/**
 * 创建模型运行时对象。
 *
 * Create model runtime.
 */
export function createModelRuntime(params: {
  stage: ThreeStage;
  settingsRef: Readonly<Ref<ViewerSettings>>;
  hasModel: Ref<boolean>;
  atomSizeFactor: number;
  bondFactor: number;
  bondRadius: number;
}): ModelRuntime {
  const {
    stage,
    settingsRef,
    hasModel,
    atomSizeFactor,
    bondFactor,
    bondRadius,
  } = params;

  const getSettings = (): ViewerSettings => settingsRef.value;

  let atomMeshes: THREE.InstancedMesh[] = [];
  let bondMeshes: THREE.InstancedMesh[] = [];
  let lastBondSegCount = 0;

  // 动画帧数据（显示层） / Animation frames (display layer)
  let animFrames: Atom[][] = [];

  // 是否存在任何 typeId（决定是否响应 typeMap watch） / Whether any atoms have typeId
  let hasAnyType = false;

  // 锁中心：第一帧中心 / Center-lock: first frame mean center
  const baseCenter = new THREE.Vector3();
  const centerTmp = new THREE.Vector3();
  const matTmp = new THREE.Matrix4();

  // 坐标轴 / Axes helper
  let axesHelper: THREE.AxesHelper | null = null;

  const degToRad = (d: number): number => (d * Math.PI) / 180;

  /**
   * 释放坐标轴辅助对象资源（可选）。
   *
   * Dispose axes helper resources (optional but safer).
   */
  const disposeAxesHelper = (): void => {
    if (!axesHelper) return;
    axesHelper.geometry.dispose();
    const mat = axesHelper.material;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else mat.dispose();
    axesHelper = null;
  };

  /**
   * 清理并释放当前的原子/键合 InstancedMesh。
   *
   * Remove and dispose current atom/bond instanced meshes.
   */
  const disposeVisualMeshes = (): void => {
    removeAndDisposeInstancedMeshes(stage.modelGroup, atomMeshes);
    atomMeshes = [];

    removeAndDisposeInstancedMeshes(stage.modelGroup, bondMeshes);
    bondMeshes = [];

    lastBondSegCount = 0;
  };

  /**
   * 将某帧的原子坐标应用到 instanced meshes（锁中心避免整体漂移）。
   *
   * Apply a frame's atom positions to instanced meshes (center-locked to avoid drifting).
   */
  const applyFrameAtoms = (frameAtoms: Atom[]): void => {
    applyFrameAtomsToMeshes({
      frameAtoms,
      atomMeshes,
      baseCenter,
      centerTmp,
      matTmp,
    });
  };

  /**
   * 更新坐标轴标签与 AxesHelper（按包围盒大小定长度）。
   *
   * Update axes labels and AxesHelper (length derived from bounding box).
   */
  const updateAxes = (box: THREE.Box3): void => {
    // 先清理旧对象 / Clear old objects
    disposeAxesHelper();
    stage.axesGroup.clear();

    const size = box.getSize(new THREE.Vector3());
    const axisLen = Math.max(size.x, size.y, size.z) * 0.6;

    const lx = makeTextLabel("X");
    lx.position.set(axisLen, 0, 0);

    const ly = makeTextLabel("Y");
    ly.position.set(0, axisLen, 0);

    const lz = makeTextLabel("Z");
    lz.position.set(0, 0, axisLen);

    stage.axesGroup.add(lx, ly, lz);

    axesHelper = new THREE.AxesHelper(axisLen);
    (axesHelper.material as THREE.LineBasicMaterial).depthTest = false;
    axesHelper.renderOrder = 999;
    stage.axesGroup.add(axesHelper);
  };

  const clearModel = (): void => {
    disposeVisualMeshes();
    disposeAxesHelper();
    stage.axesGroup.clear();
    hasModel.value = false;
  };

  /**
   * 重建视觉对象（原子 mesh + 键合 mesh）。
   *
   * Rebuild visuals (atom meshes + bond meshes).
   */
  const rebuildVisualsForAtoms = (atoms: Atom[]): void => {
    disposeVisualMeshes();

    const s = getSettings();

    atomMeshes = buildAtomMeshesByElement({
      atoms,
      atomSizeFactor,
      atomScale: s.atomScale,
    });
    atomMeshes.forEach((m) => stage.modelGroup.add(m));

    const bondRes = buildBondMeshesBicolor({
      atoms,
      bondFactor,
      atomSizeFactor,
      bondRadius,
    });
    bondMeshes = bondRes.meshes;
    lastBondSegCount = bondRes.segCount;
    bondMeshes.forEach((m) => stage.modelGroup.add(m));

    hasModel.value = true;

    applyShowBonds();
    applyAtomScale();
  };

  const applyShowAxes = (): void => {
    stage.axesGroup.visible = getSettings().showAxes;
  };

  const applyShowBonds = (): void => {
    const flag = getSettings().showBonds;
    for (const m of bondMeshes) m.visible = flag;
  };

  const applyAtomScale = (): void => {
    applyAtomScaleToMeshes(atomMeshes, getSettings().atomScale);
  };

  const applyModelRotation = (): void => {
    const s = getSettings();
    stage.pivotGroup.rotation.set(
      degToRad(s.rotationDeg.x),
      degToRad(s.rotationDeg.y),
      degToRad(s.rotationDeg.z)
    );
  };

  /**
   * 渲染模型：以第一帧建模，fit 相机，初始化 pivot/model 偏移。
   *
   * Render model: build using the first frame, fit camera, init pivot/model offset.
   */
  const renderModel = (
    model: StructureModel
  ): { frameCount: number; hasAnimation: boolean } => {
    const frames =
      model.frames && model.frames.length > 0 ? model.frames : [model.atoms];

    // 原始帧：保留 id/typeId，规范化 element（防止空字符串）
    // Raw frames: preserve id/typeId, normalize element (avoid empty)
    const rawFrames: Atom[][] = frames.map((fr) =>
      fr.map((a) => ({
        element: normalizeElementSymbol(a.element) || "E",
        position: a.position,
        id: a.id,
        typeId: a.typeId,
      }))
    );

    // 是否存在 typeId（决定 lammpsTypeMap watcher 是否生效）
    // Whether any typeId exists (controls whether lammpsTypeMap watcher is meaningful)
    hasAnyType = rawFrames.some((fr) => fr.some((a) => a.typeId));

    // 显示层 frames：按 typeId 映射 element（用户配置）
    // Display frames: remap element based on typeId (user config)
    animFrames = remapElementByTypeId(
      rawFrames,
      getSettings().lammpsTypeMap ?? []
    );

    // 多帧要求原子数一致，否则 instanceIndex 无法复用
    // Multi-frame requires same atom count to reuse instance indices
    const n0 = animFrames[0]!.length;
    for (let fi = 1; fi < animFrames.length; fi += 1) {
      if (animFrames[fi]!.length !== n0) {
        throw new Error("XYZ 多帧动画要求每一帧原子数相同。");
      }
    }

    // 用第一帧建模 / Build from first frame
    const atoms0 = animFrames[0]!;
    clearModel();

    // 计算包围盒（用于轴长度） / Bounding box (for axes length)
    const box = new THREE.Box3();
    for (const a of atoms0) {
      box.expandByPoint(
        new THREE.Vector3(a.position[0], a.position[1], a.position[2])
      );
    }

    // pivot 放到模型中心，modelGroup 反向偏移，保证旋转围绕中心
    // Place pivot at model center; offset modelGroup negatively so rotation is around center
    const center = computeMeanCenterInto(atoms0, centerTmp);
    baseCenter.copy(center);

    stage.pivotGroup.position.copy(center);
    stage.modelGroup.position.set(-center.x, -center.y, -center.z);

    rebuildVisualsForAtoms(atoms0);

    // fit camera
    const cam = stage.getCamera();
    const ctrls = stage.getControls();
    const newHalf = fitCameraToAtoms({
      atoms: atoms0,
      camera: cam,
      controls: ctrls,
      host: stage.host,
      getSphereRadiusByElement: (el: string) =>
        getSphereBaseRadiusByElement(el, atomSizeFactor),
      orthoHalfHeight: stage.getOrthoHalfHeight(),
    });

    if (!isPerspective(cam)) stage.setOrthoHalfHeight(newHalf);

    applyShowAxes();
    applyModelRotation();
    applyFrameAtoms(atoms0);
    updateAxes(box);

    return {
      frameCount: animFrames.length,
      hasAnimation: animFrames.length > 1,
    };
  };

  /**
   * 应用某帧坐标（不重建 mesh，性能最好）。
   *
   * Apply frame coordinates (no mesh rebuild; best performance).
   */
  const applyFrameByIndex = (idx: number): void => {
    const n = animFrames.length;
    if (n === 0) return;
    const clamped = Math.min(Math.max(0, idx), n - 1);
    applyFrameAtoms(animFrames[clamped]!);
  };

  /**
   * typeMap 改动：重映射 frames -> 重建当前帧 mesh（颜色/半径/键合）
   *
   * On typeMap change: remap frames -> rebuild meshes for current frame.
   */
  const onTypeMapChanged = (currentFrameIndex: number): void => {
    if (animFrames.length === 0) return;

    animFrames = remapElementByTypeId(
      animFrames,
      getSettings().lammpsTypeMap ?? []
    );

    const cur = animFrames[currentFrameIndex] ?? animFrames[0];
    if (!cur) return;

    rebuildVisualsForAtoms(cur);
    applyFrameAtoms(cur);
  };

  const applyBackgroundColor = (): void => {
    if (!stage) return;

    let bgc = getSettings().backgroundColor;

    if (!bgc) {
      return;
    }

    stage.renderer.setClearColor(
      new THREE.Color(bgc),
      getSettings().backgroundTransparent ? 0 : 1
    );
  };

  return {
    clearModel,
    renderModel,
    applyFrameByIndex,
    rebuildVisualsForAtoms,
    applyAtomScale,
    applyShowBonds,
    applyShowAxes,
    applyModelRotation,
    onTypeMapChanged,
    getFrameCount: () => animFrames.length,
    hasAnyTypeId: () => hasAnyType,
    getLastBondSegCount: () => lastBondSegCount,
    applyBackgroundColor,
  };
}
