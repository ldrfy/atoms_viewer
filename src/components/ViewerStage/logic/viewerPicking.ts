// src/components/ViewerStage/logic/viewerPicking.ts
import * as THREE from 'three';
import type { Ref } from 'vue';

import type { ViewerSettings } from '../../../lib/viewer/settings';
import { normalizeViewPresets } from '../../../lib/viewer/viewPresets';
import { ATOMIC_SYMBOLS } from '../../../lib/structure/chem';
import type { Atom } from '../../../lib/structure/types';
import type { AnyCamera } from '../../../lib/three/camera';

import type { ThreeStage } from '../../../lib/three/stage';
import type { ModelRuntime } from '../modelRuntime';

import {
  computeDistance,
  computeAngleDeg,
  atomicNumberFromSymbol,
  type SelectedAtom,
  type InspectCtx,
} from '../ctx/inspect';

type RenderDeps = {
  settingsRef: Readonly<Ref<ViewerSettings>>;
  getStage: () => ThreeStage | null;
  getRuntime: () => ModelRuntime | null;

  patchSettings?: (patch: Partial<ViewerSettings>) => void;

  inspectCtx: InspectCtx;

  isSelectingRecordArea: Ref<boolean>;

  getActiveLayerId: () => string | null;
  setActiveLayer: (id: string) => void;
};

export function createViewerPickingController(deps: RenderDeps) {
  // picking helpers
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let pointerDown: { x: number; y: number; tMs: number } | null = null;

  // model rotation via drag (left button)
  let rotateLast: { x: number; y: number } | null = null;
  let rotatePointerId: number | null = null;
  let rotatePointerType: string | null = null;
  let dragRotationDeg: { x: number; y: number; z: number } | null = null;

  let rotSyncTimer = 0;
  let lastRotSyncMs = 0;

  // selection visuals
  let selectionGroup: THREE.Group | null = null;
  let markerMeshes: THREE.Mesh[] = [];
  let line12: THREE.Mesh | null = null;
  let line23: THREE.Mesh | null = null;
  let lineGeometry: THREE.CylinderGeometry | null = null;
  let lineMaterial: THREE.MeshBasicMaterial | null = null;

  let selectionVisuals: Array<{
    mesh: THREE.InstancedMesh;
    instanceId: number;
  }> = [];
  const tmpMat = new THREE.Matrix4();
  const tmpPos = new THREE.Vector3();
  const lineUp = new THREE.Vector3(0, 1, 0);
  const lineDir = new THREE.Vector3();
  const lineQuat = new THREE.Quaternion();
  const lineScale = new THREE.Vector3();
  const lineCenter = new THREE.Vector3();
  const lineP1 = new THREE.Vector3();
  const lineP2 = new THREE.Vector3();

  function wrapDeg180(deg: number): number {
    let x = ((((deg + 180) % 360) + 360) % 360) - 180;
    if (x === -180) x = 180;
    return x;
  }

  function updateSelectionMeasure(): void {
    const sel = deps.inspectCtx.selected.value;
    const m: { distance12?: number; distance23?: number; angleDeg?: number }
      = {};

    if (sel.length >= 2 && sel[0]?.position && sel[1]?.position) {
      const a = { element: 'E', position: sel[0]!.position } as Atom;
      const b = { element: 'E', position: sel[1]!.position } as Atom;
      m.distance12 = computeDistance(a, b);
    }

    if (
      sel.length >= 3
      && sel[0]?.position
      && sel[1]?.position
      && sel[2]?.position
    ) {
      const b = { element: 'E', position: sel[1]!.position } as Atom;
      const c = { element: 'E', position: sel[2]!.position } as Atom;
      m.distance23 = computeDistance(b, c);

      const a = { element: 'E', position: sel[0]!.position } as Atom;
      m.angleDeg = computeAngleDeg(a, b, c);
    }

    deps.inspectCtx.measure.value = m;
  }

  function ensureSelectionVisuals(): void {
    const stage = deps.getStage();
    if (!stage) return;
    if (selectionGroup) return;

    selectionGroup = new THREE.Group();
    selectionGroup.name = 'atom-selection';
    stage.modelGroup.add(selectionGroup);

    const geo = new THREE.SphereGeometry(1, 18, 18);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0xffd400),
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    });
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = -2;
    mat.polygonOffsetUnits = -2;

    markerMeshes = Array.from({ length: 3 }).map(() => {
      const m = new THREE.Mesh(geo, mat);
      m.visible = false;
      m.renderOrder = 10;
      m.frustumCulled = false;
      return m;
    });
    for (const m of markerMeshes) selectionGroup.add(m);

    lineGeometry = new THREE.CylinderGeometry(1, 1, 1, 12, 1, false);
    lineMaterial = new THREE.MeshBasicMaterial({
      color: 0xffd400,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
    });

    const makeLine = (): THREE.Mesh => {
      const ln = new THREE.Mesh(lineGeometry!, lineMaterial!);
      ln.visible = false;
      ln.renderOrder = 9;
      ln.frustumCulled = false;
      return ln;
    };

    line12 = makeLine();
    line23 = makeLine();
    selectionGroup.add(line12);
    selectionGroup.add(line23);
  }

  function updateSelectionVisuals(): void {
    const stage = deps.getStage();
    if (!stage) return;

    const requestRedraw = () => stage.invalidate();

    ensureSelectionVisuals();
    if (!selectionGroup || markerMeshes.length === 0) return;

    stage.modelGroup.updateMatrixWorld(true);

    const sel = deps.inspectCtx.selected.value;
    for (const m of markerMeshes) m.visible = false;
    if (line12) line12.visible = false;
    if (line23) line23.visible = false;

    if (sel.length === 0 || selectionVisuals.length === 0) {
      requestRedraw();
      return;
    }

    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < Math.min(3, sel.length); i += 1) {
      const v = selectionVisuals[i];
      if (!v) continue;

      v.mesh.getMatrixAt(v.instanceId, tmpMat);
      tmpPos.setFromMatrixPosition(tmpMat);

      v.mesh.updateMatrixWorld(true);
      v.mesh.localToWorld(tmpPos);

      stage.modelGroup.worldToLocal(tmpPos);

      const geoAny = v.mesh.geometry as any;
      const rParam = geoAny?.parameters?.radius as number | undefined;
      if (!v.mesh.geometry.boundingSphere)
        v.mesh.geometry.computeBoundingSphere();
      const rBound = v.mesh.geometry.boundingSphere?.radius;
      const r = Math.max(0.05, rParam ?? rBound ?? 0.3);
      const haloR = r * 1.25;

      markerMeshes[i]!.scale.setScalar(haloR);
      markerMeshes[i]!.position.copy(tmpPos);
      markerMeshes[i]!.visible = true;

      pts.push(tmpPos.clone());
    }

    const runtime = deps.getRuntime();
    const display = runtime?.activeDisplaySettings?.value;
    const baseBondRadius = Number.isFinite(display?.bondRadius)
      ? (display!.bondRadius as number)
      : (Number.isFinite(deps.settingsRef.value.bondRadius)
          ? deps.settingsRef.value.bondRadius
          : 0.09);
    const lineRadius = Math.min(
      Math.max(0.008, baseBondRadius * 0.7),
      baseBondRadius * 0.9,
    );

    const updateLine = (mesh: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3) => {
      lineP1.copy(a);
      lineP2.copy(b);

      lineCenter.addVectors(lineP1, lineP2).multiplyScalar(0.5);
      lineDir.subVectors(lineP2, lineP1);
      const len = lineDir.length();
      if (len < 1.0e-7) {
        mesh.visible = false;
        return;
      }

      lineDir.multiplyScalar(1 / len);
      lineQuat.setFromUnitVectors(lineUp, lineDir);
      lineScale.set(lineRadius, len, lineRadius);

      mesh.position.copy(lineCenter);
      mesh.quaternion.copy(lineQuat);
      mesh.scale.copy(lineScale);
      mesh.visible = true;
    };

    if (pts.length >= 2 && line12) {
      updateLine(line12, pts[0]!, pts[1]!);
    }
    if (pts.length >= 3 && line23) {
      updateLine(line23, pts[1]!, pts[2]!);
    }

    requestRedraw();
  }

  // Patch inspectCtx.clear to also clear visuals tracking (no need to duplicate in callers)
  const originalClear = deps.inspectCtx.clear;
  deps.inspectCtx.clear = () => {
    originalClear();
    selectionVisuals = [];
    updateSelectionVisuals();
  };

  function addPickedAtom(params: {
    layerId: string;
    atomIndex: number;
    element: string;
    atom: Atom;
    mesh: THREE.InstancedMesh;
    instanceId: number;
    additive: boolean;
  }): void {
    const { layerId, atomIndex, element, atom, mesh, instanceId, additive }
      = params;

    const picked: SelectedAtom = {
      layerId,
      atomIndex,
      element,
      atomicNumber: atomicNumberFromSymbol(element, ATOMIC_SYMBOLS),
      id: atom.id,
      typeId: atom.typeId,
      position: [atom.position[0], atom.position[1], atom.position[2]],
    };

    if (deps.getActiveLayerId() && deps.getActiveLayerId() !== layerId) {
      deps.setActiveLayer(layerId);
    }

    const sel = [...deps.inspectCtx.selected.value];
    const visuals = [...selectionVisuals];

    const existsIdx = sel.findIndex(
      x => x.layerId === layerId && x.atomIndex === atomIndex,
    );
    if (existsIdx >= 0) {
      if (additive) {
        sel.splice(existsIdx, 1);
        visuals.splice(existsIdx, 1);
      }
      else {
        sel.splice(0, sel.length, picked);
        visuals.splice(0, visuals.length, { mesh, instanceId });
      }
    }
    else {
      if (!additive) {
        sel.splice(0, sel.length, picked);
        visuals.splice(0, visuals.length, { mesh, instanceId });
      }
      else {
        if (sel.length >= 3) {
          sel.splice(0, 1);
          visuals.splice(0, 1);
        }
        sel.push(picked);
        visuals.push({ mesh, instanceId });
      }
    }

    deps.inspectCtx.selected.value = sel;
    selectionVisuals = visuals;

    updateSelectionMeasure();
    updateSelectionVisuals();
  }

  function handlePick(e: PointerEvent): void {
    if (!deps.inspectCtx.enabled.value) return;
    if (deps.isSelectingRecordArea.value) return;

    const stage = deps.getStage();
    const runtime = deps.getRuntime();
    if (!stage || !runtime) return;

    const canvas = stage.renderer.domElement;
    const rect = canvas.getBoundingClientRect();

    const rawPresets = deps.settingsRef.value.viewPresets;
    const presets
      = normalizeViewPresets(rawPresets).length > 0
        ? normalizeViewPresets(rawPresets)
        : deps.settingsRef.value.dualViewEnabled
          ? (['front', 'side'] as const)
          : ([] as const);

    const isDual = presets.length === 2;

    let pickCamera: AnyCamera = stage.getCamera();
    let viewportW = rect.width;
    let xPx = e.clientX - rect.left;

    if (isDual) {
      const rRaw = deps.settingsRef.value.dualViewSplit;
      const r = typeof rRaw === 'number' && Number.isFinite(rRaw) ? rRaw : 0.5;
      const leftW = Math.max(1, rect.width * Math.max(0.1, Math.min(0.9, r)));
      const rightW = Math.max(1, rect.width - leftW);

      if (xPx <= leftW) {
        viewportW = leftW;
      }
      else {
        const aux = stage.getAuxCamera();
        if (aux) pickCamera = aux;
        viewportW = rightW;
        xPx = xPx - leftW;
      }
    }

    const x = (xPx / Math.max(1, viewportW)) * 2 - 1;
    const y = -(((e.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1);
    ndc.set(x, y);

    raycaster.setFromCamera(ndc, pickCamera);

    const meshes = runtime.getVisibleAtomMeshes();
    const hit = raycaster.intersectObjects(meshes, false)[0];
    if (!hit) {
      deps.inspectCtx.clear();
      return;
    }

    const mesh = hit.object as THREE.InstancedMesh;
    const instanceId = (hit as any).instanceId as number | undefined;
    if (instanceId == null) return;

    const indices = mesh.userData.atomIndices as number[] | undefined;
    if (!indices) return;

    const atomIndex = indices[instanceId];
    if (atomIndex == null) return;

    const layerId = (mesh.userData as any).layerId as string | undefined;
    if (!layerId) return;

    if (deps.getActiveLayerId() !== layerId) {
      deps.setActiveLayer(layerId);
    }

    const atoms = runtime.getActiveAtoms();
    if (!atoms) return;

    const atom = atoms[atomIndex];
    if (!atom) return;

    const element
      = (mesh.userData.element as string | undefined) ?? atom.element ?? 'E';

    const additive
      = deps.inspectCtx.measureMode.value || e.shiftKey || e.ctrlKey || e.metaKey;

    addPickedAtom({
      layerId,
      atomIndex,
      element,
      atom,
      mesh,
      instanceId,
      additive,
    });
  }

  // ---- pointer rotate + click-to-pick ----
  let removePickListeners: (() => void) | null = null;

  function clearRotate(canvas: HTMLCanvasElement): void {
    if (rotatePointerId != null) {
      try {
        canvas.releasePointerCapture(rotatePointerId);
      }
      catch {
        // ignore
      }
    }
    rotateLast = null;
    rotatePointerId = null;
    rotatePointerType = null;
    dragRotationDeg = null;

    if (rotSyncTimer) {
      window.clearTimeout(rotSyncTimer);
      rotSyncTimer = 0;
    }
  }

  function flushRotationToSettings(force: boolean): void {
    if (!deps.patchSettings) return;
    if (!dragRotationDeg) return;

    const ROT_SYNC_INTERVAL_MS = 120;
    const now = performance.now();
    if (!force && now - lastRotSyncMs < ROT_SYNC_INTERVAL_MS) return;

    lastRotSyncMs = now;
    deps.patchSettings({ rotationDeg: { ...dragRotationDeg } });
  }

  function scheduleRotationSync(force = false): void {
    if (!deps.patchSettings) return;
    if (!dragRotationDeg) return;

    const ROT_SYNC_INTERVAL_MS = 120;

    if (force) {
      if (rotSyncTimer) {
        window.clearTimeout(rotSyncTimer);
        rotSyncTimer = 0;
      }
      flushRotationToSettings(true);
      return;
    }

    flushRotationToSettings(false);
    if (rotSyncTimer) return;

    const due = Math.max(
      0,
      ROT_SYNC_INTERVAL_MS - (performance.now() - lastRotSyncMs),
    );
    rotSyncTimer = window.setTimeout(() => {
      rotSyncTimer = 0;
      flushRotationToSettings(true);
    }, due);
  }

  function applyDragRotationToStage(): void {
    const stage = deps.getStage();
    if (!stage || !dragRotationDeg) return;

    stage.pivotGroup.rotation.set(
      THREE.MathUtils.degToRad(dragRotationDeg.x),
      THREE.MathUtils.degToRad(dragRotationDeg.y),
      THREE.MathUtils.degToRad(dragRotationDeg.z),
    );

    stage.invalidate();
  }

  function attach(): void {
    const stage = deps.getStage();
    if (!stage) return;
    const canvas = stage.renderer.domElement;

    const onPointerDown = (e: PointerEvent) => {
      if (e.isPrimary === false) return;

      pointerDown = { x: e.clientX, y: e.clientY, tMs: performance.now() };

      const pt = (e as any).pointerType as string | undefined;
      const isTouch = pt === 'touch';
      const isMouseLike = pt === 'mouse' || pt === 'pen' || !pt;

      const canRotate
        = (isMouseLike && (e.buttons & 1) === 1) || (isTouch && e.isPrimary);

      if (!canRotate) return;
      if (deps.isSelectingRecordArea.value) return;

      rotateLast = { x: e.clientX, y: e.clientY };
      rotatePointerId = e.pointerId;
      rotatePointerType = pt ?? null;

      try {
        canvas.setPointerCapture(e.pointerId);
      }
      catch {
        // ignore
      }
    };

    const ROT_SPEED_DEG_PER_PX = 0.3;

    const onPointerMove = (e: PointerEvent) => {
      if (rotatePointerId == null) return;
      if (e.pointerId !== rotatePointerId) return;
      if (!rotateLast) return;

      if (deps.isSelectingRecordArea.value) return;

      const ptNow
        = rotatePointerType
          ?? ((e as any).pointerType as string | undefined)
          ?? null;

      const isTouchNow = ptNow === 'touch';
      const isMouseLikeNow = ptNow === 'mouse' || ptNow === 'pen' || !ptNow;

      if (isMouseLikeNow && (e.buttons & 1) !== 1) {
        clearRotate(canvas);
        return;
      }
      if (isTouchNow && (e.pressure ?? 0) === 0) {
        clearRotate(canvas);
        return;
      }

      const dx = e.clientX - rotateLast.x;
      const dy = e.clientY - rotateLast.y;
      rotateLast = { x: e.clientX, y: e.clientY };
      if (dx === 0 && dy === 0) return;

      if (!dragRotationDeg) {
        // IMPORTANT:
        // When auto-rotation is enabled, settings.rotationDeg is updated on a throttled
        // cadence. During user interaction (especially when auto-rotation pauses),
        // using the settings snapshot as the drag baseline can appear to “restart”
        // from an older angle.
        //
        // Always use the stage's *actual* current rotation as the drag baseline.
        const stage = deps.getStage();
        if (stage) {
          const eul = stage.pivotGroup.rotation;
          dragRotationDeg = {
            x: wrapDeg180(THREE.MathUtils.radToDeg(eul.x)),
            y: wrapDeg180(THREE.MathUtils.radToDeg(eul.y)),
            z: wrapDeg180(THREE.MathUtils.radToDeg(eul.z)),
          };
        }
        else {
          const cur = deps.settingsRef.value.rotationDeg;
          dragRotationDeg = { x: cur.x, y: cur.y, z: cur.z };
        }
      }

      dragRotationDeg.x = wrapDeg180(
        dragRotationDeg.x + dy * ROT_SPEED_DEG_PER_PX,
      );
      dragRotationDeg.y = wrapDeg180(
        dragRotationDeg.y + dx * ROT_SPEED_DEG_PER_PX,
      );

      applyDragRotationToStage();
      scheduleRotationSync(false);
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!pointerDown) return;
      if (e.isPrimary === false) {
        pointerDown = null;
        return;
      }

      const dx = e.clientX - pointerDown.x;
      const dy = e.clientY - pointerDown.y;
      const dt = performance.now() - pointerDown.tMs;
      pointerDown = null;

      scheduleRotationSync(true);
      clearRotate(canvas);

      if (Math.hypot(dx, dy) <= 6 && dt <= 400) {
        handlePick(e);
      }
    };

    const onPointerCancel = () => {
      pointerDown = null;
      scheduleRotationSync(true);
      clearRotate(canvas);
    };

    canvas.addEventListener('pointerdown', onPointerDown, { passive: true });
    canvas.addEventListener('pointermove', onPointerMove, { passive: true });
    canvas.addEventListener('pointerup', onPointerUp, { passive: true });
    canvas.addEventListener('pointercancel', onPointerCancel, {
      passive: true,
    });

    removePickListeners = () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerCancel);
    };
  }

  function detach(): void {
    removePickListeners?.();
    removePickListeners = null;
  }

  return {
    attach,
    detach,
    updateSelectionVisuals,
  };
}

export type ViewerPickingController = ReturnType<
  typeof createViewerPickingController
>;
