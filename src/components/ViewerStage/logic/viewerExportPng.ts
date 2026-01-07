// src/components/ViewerStage/logic/viewerExportPng.ts
import * as THREE from 'three';
import { message } from 'ant-design-vue';
import { normalizeViewPresets } from '../../../lib/viewer/viewPresets';
import { clampDualViewSplit } from '../../../lib/viewer/viewLayout';
import { cropCanvasToPngBlob, downloadBlob } from '../../../lib/image/cropPng';
import { buildExportFilename } from '../../../lib/file/filename';
import {
  isPerspective,
  updateCameraForSize,
  type AnyCamera,
} from '../../../lib/three/camera';
import type { ViewerSettings } from '../../../lib/viewer/settings';
import type { ThreeStage } from '../../../lib/three/stage';

export function createPngExporter(deps: {
  getStage: () => ThreeStage | null;
  getSettings: () => ViewerSettings;
  getModelFileName?: () => string | undefined;
  t: (key: string, args?: any) => string;
}) {
  async function onExportPng(payload: {
    scale: number;
    transparent: boolean;
  }): Promise<void> {
    const stage = deps.getStage();
    if (!stage) return;

    const { scale, transparent } = payload;

    const prevColor = new THREE.Color();
    stage.renderer.getClearColor(prevColor);
    const prevAlpha = stage.renderer.getClearAlpha();
    const prevSize = new THREE.Vector2();
    stage.renderer.getSize(prevSize);
    const prevPixelRatio = stage.renderer.getPixelRatio();
    const prevAutoClear = stage.renderer.autoClear;

    try {
      stage.renderer.setClearColor(
        new THREE.Color(deps.getSettings().backgroundColor),
        transparent ? 0 : 1,
      );

      const rect = stage.host.getBoundingClientRect();
      const w = Math.max(1, Math.floor(rect.width));
      const h = Math.max(1, Math.floor(rect.height));
      const sRequested = Math.max(1, scale);

      // Clamp export scale to GPU limits to avoid blank/white exports on some devices.
      const gl = stage.renderer.getContext();
      const maxTexParam = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE) ?? 0);
      const maxRbParam = Number(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) ?? 0);
      const capTex = Number(stage.renderer.capabilities.maxTextureSize ?? 0);
      const limits = [maxTexParam, maxRbParam, capTex].filter(v => Number.isFinite(v) && v > 0);
      const limit = limits.length ? Math.min(...limits) : 4096;
      const maxScale = Math.max(1, Math.floor(Math.min(limit / w, limit / h)));
      const s = Math.min(sRequested, maxScale);

      if (s !== sRequested) {
        message.warning(
          deps.t('viewer.export.scaleCapped', {
            requested: sRequested,
            used: s,
            limit,
          }),
        );
      }

      stage.renderer.setPixelRatio(1);
      stage.renderer.setSize(Math.floor(w * s), Math.floor(h * s), false);

      const settings = deps.getSettings();
      const orthoHalfHeight = stage.getOrthoHalfHeight();

      const camera = stage.getCamera();
      const controls = stage.getControls();
      const target = controls.target;

      const presets = (() => {
        const v = normalizeViewPresets(settings.viewPresets);
        if (v.length > 0) return v;
        return settings.dualViewEnabled
          ? (['front', 'side'] as const)
          : ([] as const);
      })();

      if (presets.length === 2) {
        const split = clampDualViewSplit(settings.dualViewSplit ?? 0.5);
        const leftW = Math.floor(w * split);
        const rightW = Math.max(1, w - leftW);

        updateCameraForSize(camera, leftW, h, orthoHalfHeight);
        const sideCamera = camera.clone() as AnyCamera;
        updateCameraForSize(sideCamera, rightW, h, orthoHalfHeight);

        const qFront = new THREE.Quaternion();
        const qSide = new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 1, 0),
          Math.PI / 2,
        );
        const qTop = new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(1, 0, 0),
          -Math.PI / 2,
        );

        const presetQuat = (p: string): THREE.Quaternion => {
          if (p === 'side') return qSide;
          if (p === 'top') return qTop;
          return qFront;
        };

        const qL = presetQuat(presets[0]).clone();
        const qR = presetQuat(presets[1]).clone();
        const offset = qR.multiply(qL.invert());

        const viewVec = camera.position.clone().sub(target);
        viewVec.applyQuaternion(offset);
        sideCamera.position.copy(target.clone().add(viewVec));

        const up = camera.up.clone().applyQuaternion(offset);
        sideCamera.up.copy(up);
        sideCamera.lookAt(target);

        sideCamera.near = camera.near;
        sideCamera.far = camera.far;
        if (!isPerspective(camera) && !isPerspective(sideCamera)) {
          (sideCamera as THREE.OrthographicCamera).zoom = (
            camera as THREE.OrthographicCamera
          ).zoom;
        }
        (sideCamera as any).updateProjectionMatrix?.();

        const fullW = Math.floor(w * s);
        const fullH = Math.floor(h * s);
        const leftPx = Math.floor(leftW * s);
        const rightPx = Math.max(1, fullW - leftPx);

        stage.renderer.autoClear = false;
        stage.renderer.setScissorTest(true);
        stage.renderer.setViewport(0, 0, fullW, fullH);
        stage.renderer.setScissor(0, 0, fullW, fullH);
        stage.renderer.clear(true, true, true);

        stage.renderer.setViewport(0, 0, leftPx, fullH);
        stage.renderer.setScissor(0, 0, leftPx, fullH);
        stage.renderer.render(stage.scene, camera);

        stage.renderer.setViewport(leftPx, 0, rightPx, fullH);
        stage.renderer.setScissor(leftPx, 0, rightPx, fullH);
        stage.renderer.render(stage.scene, sideCamera);

        stage.renderer.setScissorTest(false);
      }
      else {
        updateCameraForSize(camera, w, h, orthoHalfHeight);
        stage.renderer.render(stage.scene, camera);
      }

      const { blob } = await cropCanvasToPngBlob(stage.renderer.domElement, {
        alphaThreshold: 8,
        padding: 3,
      });
      const filename = buildExportFilename({
        modelFileName: deps.getModelFileName?.(),
        ext: '.png',
      });
      downloadBlob(blob, filename);

      message.success(deps.t('viewer.export.pngSuccess'));
    }
    catch (e) {
      console.error('export png failed:', e);
      message.error(
        deps.t('viewer.export.fail', { reason: (e as Error).message }),
      );
    }
    finally {
      stage.renderer.setClearColor(prevColor, prevAlpha);
      stage.renderer.setPixelRatio(prevPixelRatio);
      stage.renderer.setSize(prevSize.x, prevSize.y, false);
      stage.renderer.autoClear = prevAutoClear;
      stage.renderer.setScissorTest(false);
      stage.syncSize();
      stage.invalidate();
    }
  }

  return { onExportPng };
}

export type PngExporter = ReturnType<typeof createPngExporter>;
