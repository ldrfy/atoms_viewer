// src/components/ViewerStage/logic/viewerPicking.ts
import * as THREE from 'three';
import type { Ref } from 'vue';

import type { ViewerSettings } from '../../../lib/viewer/settings';
import type { SettingsPatch } from '../../../lib/viewer/mergeSettings';
import { normalizeViewPresets } from '../../../lib/viewer/viewPresets';
import { MANUAL_ROTATION_SYNC_INTERVAL_MS } from '../../../lib/viewer/constants';
import type { Atom } from '../../../lib/structure/types';
import type { AnyCamera } from '../../../lib/three/camera';

import type { ThreeStage } from '../../../lib/three/stage';
import type { ModelRuntime } from '../modelRuntime';

import {
  computeDistance,
  computeAngleDeg,
  type SelectedAtom,
  type InspectCtx,
} from '../ctx/inspect';

type RenderDeps = {
  settingsRef: Readonly<Ref<ViewerSettings>>;
  getStage: () => ThreeStage | null;
  getRuntime: () => ModelRuntime | null;

  patchSettings?: (patch: SettingsPatch) => void;
  onRotationCommitted?: () => void;

  inspectCtx: InspectCtx;

  isSelectingRecordArea: Ref<boolean>;

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

  // selection visuals (reused meshes for highlight/measure lines).
  // 选中高亮与测量线共用几何体，避免频繁创建对象。
  let selectionGroup: THREE.Group | null = null;
  let markerMesh: THREE.InstancedMesh | null = null;
  let markerCapacity = 0;
  let markerGeometry: THREE.SphereGeometry | null = null;
  let markerMaterial: THREE.MeshBasicMaterial | null = null;
  let lineMesh: THREE.InstancedMesh | null = null;
  let lineCapacity = 0;
  let lineGeometry: THREE.CylinderGeometry | null = null;
  let lineMaterial: THREE.MeshBasicMaterial | null = null;
  let fillMesh: THREE.Mesh | null = null;
  let fillGeometry: THREE.BufferGeometry | null = null;
  let fillMaterial: THREE.MeshBasicMaterial | null = null;

  let selectionVisuals: Array<{
    mesh: THREE.InstancedMesh;
    instanceId: number;
  }> = [];
  const tmpMat = new THREE.Matrix4();
  const tmpPos = new THREE.Vector3();
  const tmpScale = new THREE.Vector3();
  const tmpQuat = new THREE.Quaternion();
  const lineUp = new THREE.Vector3(0, 1, 0);
  const lineDir = new THREE.Vector3();
  const lineQuat = new THREE.Quaternion();
  const lineScale = new THREE.Vector3();
  const lineCenter = new THREE.Vector3();
  const lineP1 = new THREE.Vector3();
  const lineP2 = new THREE.Vector3();
  const highlightColor = new THREE.Color();
  const pickCamPos = new THREE.Vector3();
  const pickCamUp = new THREE.Vector3();
  const pickCamQuat = new THREE.Quaternion();
  const pickTarget = new THREE.Vector3();
  const pickOffset = new THREE.Vector3();

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

  function getLayerLabel(layerId: string): string {
    const runtime = deps.getRuntime();
    const info = runtime?.layers.value.find(l => l.id === layerId) ?? null;
    const name = String(info?.name ?? '').trim();
    const file = String(info?.sourceFileName ?? '').trim();
    return name || file || layerId;
  }

  function ensureSelectionVisuals(): void {
    const stage = deps.getStage();
    if (!stage) return;
    if (selectionGroup) return;

    selectionGroup = new THREE.Group();
    selectionGroup.name = 'atom-selection';
    stage.modelGroup.add(selectionGroup);

    markerGeometry = new THREE.SphereGeometry(1, 18, 18);
    markerMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0xffd400),
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    });
    markerMaterial.polygonOffset = true;
    markerMaterial.polygonOffsetFactor = -2;
    markerMaterial.polygonOffsetUnits = -2;

    markerCapacity = 8;
    markerMesh = new THREE.InstancedMesh(
      markerGeometry,
      markerMaterial,
      markerCapacity,
    );
    markerMesh.visible = false;
    markerMesh.renderOrder = 10;
    markerMesh.frustumCulled = false;
    selectionGroup.add(markerMesh);

    lineGeometry = new THREE.CylinderGeometry(1, 1, 1, 12, 1, false);
    lineMaterial = new THREE.MeshBasicMaterial({
      color: 0xffd400,
      transparent: true,
      opacity: 0.5,
      depthTest: true,
      depthWrite: false,
    });
    lineCapacity = 8;
    lineMesh = new THREE.InstancedMesh(
      lineGeometry,
      lineMaterial,
      lineCapacity,
    );
    lineMesh.visible = false;
    lineMesh.renderOrder = 9;
    lineMesh.frustumCulled = false;
    selectionGroup.add(lineMesh);

    fillGeometry = new THREE.BufferGeometry();
    fillMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0xffd400),
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    fillMesh = new THREE.Mesh(fillGeometry, fillMaterial);
    fillMesh.visible = false;
    fillMesh.renderOrder = 8;
    fillMesh.frustumCulled = false;
    selectionGroup.add(fillMesh);
  }

  function updateSelectionVisuals(): void {
    const stage = deps.getStage();
    if (!stage) return;

    const requestRedraw = () => stage.invalidate();

    ensureSelectionVisuals();
    if (!selectionGroup || !markerMesh || !lineMesh || !fillMesh) return;

    stage.modelGroup.updateMatrixWorld(true);

    const sel = deps.inspectCtx.selected.value;
    const rawColor = deps.settingsRef.value.other.selectionHighlightColor ?? '#ffd400';
    try {
      highlightColor.set(rawColor);
    }
    catch {
      highlightColor.set('#ffd400');
    }
    if (markerMaterial) markerMaterial.color.copy(highlightColor);
    if (lineMaterial) lineMaterial.color.copy(highlightColor);
    if (fillMaterial) fillMaterial.color.copy(highlightColor);

    markerMesh.visible = false;
    lineMesh.visible = false;
    fillMesh.visible = false;

    if (sel.length === 0 || selectionVisuals.length === 0) {
      markerMesh.count = 0;
      markerMesh.instanceMatrix.needsUpdate = true;
      lineMesh.count = 0;
      lineMesh.instanceMatrix.needsUpdate = true;
      requestRedraw();
      return;
    }

    const pts: THREE.Vector3[] = [];
    const count = Math.min(sel.length, selectionVisuals.length);
    if (count > markerCapacity) {
      markerCapacity = Math.max(count, markerCapacity * 2);
      if (markerMesh) selectionGroup.remove(markerMesh);
      markerMesh = new THREE.InstancedMesh(
        markerGeometry!,
        markerMaterial!,
        markerCapacity,
      );
      markerMesh.renderOrder = 10;
      markerMesh.frustumCulled = false;
      selectionGroup.add(markerMesh);
    }

    markerMesh.count = count;
    markerMesh.visible = count > 0;
    tmpQuat.identity();

    for (let i = 0; i < count; i += 1) {
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

      tmpScale.setScalar(haloR);
      tmpMat.compose(tmpPos, tmpQuat, tmpScale);
      markerMesh.setMatrixAt(i, tmpMat);

      pts.push(tmpPos.clone());
    }
    markerMesh.instanceMatrix.needsUpdate = true;

    const runtime = deps.getRuntime();
    const display = runtime?.activeDisplaySettings?.value;
    const baseBondRadius = Number.isFinite(display?.bondRadius)
      ? (display!.bondRadius as number)
      : (Number.isFinite(deps.settingsRef.value.details.bondRadius)
          ? deps.settingsRef.value.details.bondRadius
          : 0.09);
    const lineRadius = Math.max(0.008, baseBondRadius * 1.5);

    const updateLine = (mesh: THREE.InstancedMesh, idx: number, a: THREE.Vector3, b: THREE.Vector3) => {
      lineP1.copy(a);
      lineP2.copy(b);

      lineCenter.addVectors(lineP1, lineP2).multiplyScalar(0.5);
      lineDir.subVectors(lineP2, lineP1);
      const len = lineDir.length();
      if (len < 1.0e-7) {
        tmpScale.set(0, 0, 0);
        tmpMat.compose(lineCenter, tmpQuat, tmpScale);
        mesh.setMatrixAt(idx, tmpMat);
        return;
      }

      lineDir.multiplyScalar(1 / len);
      lineQuat.setFromUnitVectors(lineUp, lineDir);
      lineScale.set(lineRadius, len, lineRadius);

      tmpMat.compose(lineCenter, lineQuat, lineScale);
      mesh.setMatrixAt(idx, tmpMat);
    };

    const segments = Math.max(0, pts.length - 1);
    if (segments > lineCapacity) {
      lineCapacity = Math.max(segments, lineCapacity * 2);
      if (lineMesh) selectionGroup.remove(lineMesh);
      lineMesh = new THREE.InstancedMesh(
        lineGeometry!,
        lineMaterial!,
        lineCapacity,
      );
      lineMesh.renderOrder = 9;
      lineMesh.frustumCulled = false;
      selectionGroup.add(lineMesh);
    }

    lineMesh.count = segments;
    lineMesh.visible = segments > 0;
    for (let i = 0; i < segments; i += 1) {
      updateLine(lineMesh, i, pts[i]!, pts[i + 1]!);
    }
    lineMesh.instanceMatrix.needsUpdate = true;

    if (pts.length >= 3) {
      const triCount = pts.length - 2;
      const positions = new Float32Array(triCount * 9);
      const p0 = pts[0]!;
      for (let i = 0; i < triCount; i += 1) {
        const p1 = pts[i + 1]!;
        const p2 = pts[i + 2]!;
        const base = i * 9;
        positions[base] = p0.x;
        positions[base + 1] = p0.y;
        positions[base + 2] = p0.z;
        positions[base + 3] = p1.x;
        positions[base + 4] = p1.y;
        positions[base + 5] = p1.z;
        positions[base + 6] = p2.x;
        positions[base + 7] = p2.y;
        positions[base + 8] = p2.z;
      }

      const nextGeometry = new THREE.BufferGeometry();
      nextGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      nextGeometry.computeVertexNormals();
      fillGeometry?.dispose();
      fillGeometry = nextGeometry;
      fillMesh.geometry = nextGeometry;
      fillMesh.visible = true;
    }
    else {
      fillMesh.visible = false;
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
      layerName: getLayerLabel(layerId),
      atomIndex,
      element,
      id: atom.id,
      typeId: atom.typeId,
      position: [atom.position[0], atom.position[1], atom.position[2]],
    };

    const sel = [...deps.inspectCtx.selected.value];
    const visuals = [...selectionVisuals];

    if (!additive) {
      sel.splice(0, sel.length, picked);
      visuals.splice(0, visuals.length, { mesh, instanceId });
    }
    else {
      sel.push(picked);
      visuals.push({ mesh, instanceId });
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

    const rawPresets = deps.settingsRef.value.view.viewPresets;
    const presets
      = normalizeViewPresets(rawPresets).length > 0
        ? normalizeViewPresets(rawPresets)
        : ([] as const);

    const isDual = presets.length === 2;

    let pickCamera: AnyCamera = stage.getCamera();
    let viewportW = rect.width;
    let xPx = e.clientX - rect.left;
    let side: 'left' | 'right' | 'single' = 'single';

    if (isDual) {
      const rRaw = deps.settingsRef.value.view.dualViewSplit;
      const r = typeof rRaw === 'number' && Number.isFinite(rRaw) ? rRaw : 0.5;
      const leftW = Math.max(1, rect.width * r);
      const rightW = Math.max(1, rect.width - leftW);

      if (xPx <= leftW) {
        viewportW = leftW;
        side = 'left';
      }
      else {
        const aux = stage.getAuxCamera();
        if (aux) pickCamera = aux;
        viewportW = rightW;
        xPx = xPx - leftW;
        side = 'right';
      }
    }

    const x = (xPx / Math.max(1, viewportW)) * 2 - 1;
    const y = -(((e.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1);
    ndc.set(x, y);

    const view = deps.settingsRef.value.view;
    if (side === 'left') {
      pickOffset.set(view.panOffsetLeft?.x ?? 0, view.panOffsetLeft?.y ?? 0, view.panOffsetLeft?.z ?? 0);
    }
    else if (side === 'right') {
      pickOffset.set(view.panOffsetRight?.x ?? 0, view.panOffsetRight?.y ?? 0, view.panOffsetRight?.z ?? 0);
    }
    else {
      pickOffset.set(view.panOffset?.x ?? 0, view.panOffset?.y ?? 0, view.panOffset?.z ?? 0);
    }

    if (pickOffset.lengthSq() > 1e-12) {
      pickCamPos.copy(pickCamera.position);
      pickCamUp.copy(pickCamera.up);
      pickCamQuat.copy(pickCamera.quaternion);
      pickTarget.copy(stage.getControls().target).add(pickOffset);

      pickCamera.position.add(pickOffset);
      pickCamera.lookAt(pickTarget);
      pickCamera.updateMatrixWorld(true);
      raycaster.setFromCamera(ndc, pickCamera);

      pickCamera.position.copy(pickCamPos);
      pickCamera.quaternion.copy(pickCamQuat);
      pickCamera.up.copy(pickCamUp);
      pickCamera.updateMatrixWorld(true);
    }
    else {
      raycaster.setFromCamera(ndc, pickCamera);
    }

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

    const atoms = runtime.getAtomsForLayer(layerId);
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

    const now = performance.now();
    if (!force && now - lastRotSyncMs < MANUAL_ROTATION_SYNC_INTERVAL_MS) return;

    lastRotSyncMs = now;
    deps.patchSettings({ view: { rotationDeg: { ...dragRotationDeg } } });
    // 旋转结束或强制同步时，确保触发一次会话保存（防止快速刷新丢失角度）
    if (force) {
      deps.onRotationCommitted?.();
    }
  }

  function scheduleRotationSync(force = false): void {
    if (!deps.patchSettings) return;
    if (!dragRotationDeg) return;

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
      MANUAL_ROTATION_SYNC_INTERVAL_MS - (performance.now() - lastRotSyncMs),
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
          const cur = deps.settingsRef.value.view.rotationDeg;
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
