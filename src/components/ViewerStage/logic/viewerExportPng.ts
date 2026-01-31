// src/components/ViewerStage/logic/viewerExportPng.ts
import * as THREE from 'three';
import { message } from 'ant-design-vue';
import { cropCanvasByAlpha, downloadBlob } from '../../../lib/image/cropPng';
import { buildExportFilename } from '../../../lib/file/filename';
import type { CropBox } from '../recording';
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
  setExportScale?: (scale: number) => void;
  t: (key: string, args?: any) => string;
}) {
  const runExportWorker = async (args: {
    width: number;
    height: number;
    pixels: Uint8Array;
    crop?: CropBox;
    alphaThreshold?: number;
    padding?: number;
    format: 'png' | 'webp' | 'jpg';
    quality?: number;
  }): Promise<{ blob: Blob; format: 'png' | 'webp' | 'jpg' } | null> => {
    if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') {
      return null;
    }

    const worker = new Worker(
      new URL('../../../lib/image/exportPngWorker.ts', import.meta.url),
      { type: 'module' },
    );

    const requestId = Math.floor(Math.random() * 1e9);
    const payload = {
      id: requestId,
      width: args.width,
      height: args.height,
      pixels: args.pixels.buffer,
      crop: args.crop ?? null,
      alphaThreshold: args.alphaThreshold ?? 8,
      padding: args.padding ?? 3,
      format: args.format,
      quality: args.quality ?? 0.92,
    };

    const result = await new Promise<{ blob: Blob; format: 'png' | 'webp' | 'jpg' }>((resolve, reject) => {
      const onMessage = (ev: MessageEvent<any>) => {
        if (!ev.data || ev.data.id !== requestId) return;
        worker.removeEventListener('message', onMessage);
        worker.removeEventListener('error', onError);
        if (ev.data.error) reject(new Error(ev.data.error));
        else resolve({ blob: ev.data.blob as Blob, format: ev.data.format as any });
      };
      const onError = (err: ErrorEvent) => {
        worker.removeEventListener('message', onMessage);
        worker.removeEventListener('error', onError);
        reject(err.error ?? new Error('worker failed'));
      };
      worker.addEventListener('message', onMessage);
      worker.addEventListener('error', onError);
      worker.postMessage(payload, [payload.pixels]);
    });

    worker.terminate();
    return result;
  };

  const flipPixelsIntoImageData = async (
    src: Uint8Array,
    dst: Uint8ClampedArray,
    width: number,
    height: number,
  ): Promise<void> => {
    const rowSize = width * 4;
    for (let y = 0; y < height; y += 1) {
      const srcRow = (height - 1 - y) * rowSize;
      const dstRow = y * rowSize;
      dst.set(src.subarray(srcRow, srcRow + rowSize), dstRow);
      if (y % 32 === 0) {
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      }
    }
  };

  const canvasToBlob = (
    canvas: HTMLCanvasElement,
    format: 'png' | 'webp' | 'jpg',
    quality?: number,
  ): Promise<{ blob: Blob; format: 'png' | 'webp' | 'jpg' }> => {
    const type = format === 'png'
      ? 'image/png'
      : format === 'webp'
        ? 'image/webp'
        : 'image/jpeg';
    return new Promise((resolve, reject) => {
      if (format === 'webp') {
        // HTMLCanvasElement.toBlob 无 lossless 参数，默认有损；不支持则回退 PNG
        canvas.toBlob((b) => {
          if (b) resolve({ blob: b, format: 'webp' });
          else {
            canvas.toBlob((b2) => {
              if (b2) resolve({ blob: b2, format: 'png' });
              else reject(new Error('canvas.toBlob 返回空，无法导出图片'));
            }, 'image/png');
          }
        }, type, quality);
        return;
      }
      canvas.toBlob((b) => {
        if (b) resolve({ blob: b, format });
        else reject(new Error('canvas.toBlob 返回空，无法导出图片'));
      }, type, quality);
    });
  };

  async function onExportPng(payload: {
    scale: number;
    transparent: boolean;
    format?: 'png' | 'webp' | 'jpg';
    cropBox?: CropBox;
  }): Promise<void> {
    const stage = deps.getStage();
    if (!stage) return;

    const { scale, transparent, cropBox } = payload;
    const format = payload.format ?? 'png';
    const effectiveTransparent = format === 'jpg' ? false : transparent;

    const prevColor = new THREE.Color();
    stage.renderer.getClearColor(prevColor);
    const prevAlpha = stage.renderer.getClearAlpha();
    const prevAutoClear = stage.renderer.autoClear;
    const prevScissor = new THREE.Vector4();
    const prevViewport = new THREE.Vector4();
    let prevTarget: THREE.WebGLRenderTarget | null = null;
    let prevScissorTest = false;
    let renderTarget: THREE.WebGLRenderTarget | null = null;

    try {
      prevTarget = stage.renderer.getRenderTarget();
      prevScissorTest = stage.renderer.getScissorTest();
      stage.renderer.getScissor(prevScissor);
      stage.renderer.getViewport(prevViewport);
      stage.renderer.setClearColor(
        new THREE.Color(deps.getSettings().other.backgroundColor),
        effectiveTransparent ? 0 : 1,
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
        deps.setExportScale?.(s);
        message.warning(
          deps.t('viewer.export.scaleCapped', {
            requested: sRequested,
            used: s,
            limit,
          }),
        );
      }

      const fullW = Math.floor(w * s);
      const fullH = Math.floor(h * s);
      const pr = Math.max(1e-6, stage.renderer.getPixelRatio());
      const viewW = Math.max(1, Math.floor(fullW / pr));
      const viewH = Math.max(1, Math.floor(fullH / pr));
      renderTarget = new THREE.WebGLRenderTarget(fullW, fullH, {
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType,
        depthBuffer: true,
        stencilBuffer: false,
      });
      renderTarget.texture.name = 'exportPngTarget';
      (renderTarget.texture as any).colorSpace = stage.renderer.outputColorSpace;

      const settings = deps.getSettings();
      const stagePan = stage.getPanOffsets();
      const panSingle = stagePan.single ?? settings.pan.panOffset ?? { x: 0, y: 0, z: 0 };
      const panLeft = stagePan.left ?? settings.pan.panOffsetLeft ?? { x: 0, y: 0, z: 0 };
      const panRight = stagePan.right ?? settings.pan.panOffsetRight ?? { x: 0, y: 0, z: 0 };
      const orthoHalfHeight = stage.getOrthoHalfHeight();

      const camera = stage.getCamera();
      const controls = stage.getControls();
      const target = controls.target;
      const presets = stage.getViewPresets();

      const withPanOffset = (
        cam: AnyCamera,
        offset: { x: number; y: number; z: number },
        renderFn: () => void,
      ): void => {
        if (!offset) {
          renderFn();
          return;
        }
        const off = new THREE.Vector3(offset.x, offset.y, offset.z);
        if (off.lengthSq() < 1e-12) {
          renderFn();
          return;
        }
        const prevPos = cam.position.clone();
        const prevUp = cam.up.clone();
        const prevQuat = cam.quaternion.clone();
        const nextTarget = target.clone().add(off);
        cam.position.add(off);
        cam.lookAt(nextTarget);
        cam.updateMatrixWorld(true);
        renderFn();
        cam.position.copy(prevPos);
        cam.quaternion.copy(prevQuat);
        cam.up.copy(prevUp);
        cam.updateMatrixWorld(true);
      };

      stage.renderer.setRenderTarget(renderTarget);
      stage.renderer.autoClear = false;
      stage.renderer.setScissorTest(true);
      stage.renderer.setViewport(0, 0, viewW, viewH);
      stage.renderer.setScissor(0, 0, viewW, viewH);
      stage.renderer.clear(true, true, true);

      if (presets.length === 2) {
        const split = stage.getDualViewSplit?.() ?? settings.view.dualViewSplit ?? 0.5;
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

        const [leftPreset, rightPreset] = presets as [string, string];
        const qL = presetQuat(leftPreset).clone();
        const qR = presetQuat(rightPreset).clone();
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

        const leftPx = Math.floor(leftW * s);
        const leftViewW = Math.max(1, Math.floor(leftPx / pr));
        const rightViewW = Math.max(1, viewW - leftViewW);

        stage.renderer.setViewport(0, 0, leftViewW, viewH);
        stage.renderer.setScissor(0, 0, leftViewW, viewH);
        withPanOffset(camera, panLeft, () => {
          stage.renderer.render(stage.scene, camera);
        });

        stage.renderer.setViewport(leftViewW, 0, rightViewW, viewH);
        stage.renderer.setScissor(leftViewW, 0, rightViewW, viewH);
        withPanOffset(sideCamera, panRight, () => {
          stage.renderer.render(stage.scene, sideCamera);
        });

        stage.renderer.setScissorTest(false);
      }
      else {
        updateCameraForSize(camera, w, h, orthoHalfHeight);
        withPanOffset(camera, panSingle, () => {
          stage.renderer.render(stage.scene, camera);
        });
      }

      const pixels = new Uint8Array(fullW * fullH * 4);
      stage.renderer.readRenderTargetPixels(
        renderTarget,
        0,
        0,
        fullW,
        fullH,
        pixels,
      );

      let blob: Blob | null = null;
      let actualFormat: 'png' | 'webp' | 'jpg' = format;
      const workerCrop = cropBox
        ? {
            x: Math.round(cropBox.x * s),
            y: Math.round(cropBox.y * s),
            w: Math.round(cropBox.w * s),
            h: Math.round(cropBox.h * s),
          }
        : undefined;

      const workerBlob = await runExportWorker({
        width: fullW,
        height: fullH,
        pixels,
        crop: workerCrop,
        alphaThreshold: 8,
        padding: 3,
        format,
        quality: 0.92,
      });
      if (workerBlob) {
        blob = workerBlob.blob;
        actualFormat = workerBlob.format;
      }
      else if (cropBox) {
        const outFull = document.createElement('canvas');
        outFull.width = fullW;
        outFull.height = fullH;
        const outCtx = outFull.getContext('2d');
        if (!outCtx) throw new Error('无法创建输出 2D 上下文（exportPng）');
        const img = outCtx.createImageData(fullW, fullH);
        await flipPixelsIntoImageData(pixels, img.data, fullW, fullH);
        outCtx.putImageData(img, 0, 0);

        const sx = Math.round(cropBox.x * s);
        const sy = Math.round(cropBox.y * s);
        const sw = Math.round(cropBox.w * s);
        const sh = Math.round(cropBox.h * s);
        const x = Math.max(0, Math.min(sx, fullW - 1));
        const y = Math.max(0, Math.min(sy, fullH - 1));
        const w0 = Math.max(1, Math.min(sw, fullW - x));
        const h0 = Math.max(1, Math.min(sh, fullH - y));

        const out = document.createElement('canvas');
        out.width = w0;
        out.height = h0;
        const cropCtx = out.getContext('2d');
        if (!cropCtx) throw new Error('无法创建输出 2D 上下文（exportPng）');
        cropCtx.drawImage(outFull, x, y, w0, h0, 0, 0, w0, h0);
        const res = await canvasToBlob(out, format, 0.92);
        blob = res.blob;
        actualFormat = res.format;
      }
      else if (!workerBlob) {
        const outFull = document.createElement('canvas');
        outFull.width = fullW;
        outFull.height = fullH;
        const outCtx = outFull.getContext('2d');
        if (!outCtx) throw new Error('无法创建输出 2D 上下文（exportPng）');
        const img = outCtx.createImageData(fullW, fullH);
        await flipPixelsIntoImageData(pixels, img.data, fullW, fullH);
        outCtx.putImageData(img, 0, 0);
        const { canvas } = cropCanvasByAlpha(outFull, {
          alphaThreshold: 8,
          padding: 3,
        });
        const res = await canvasToBlob(canvas, format, 0.92);
        blob = res.blob;
        actualFormat = res.format;
      }
      if (!blob) throw new Error('导出失败：未生成图片');
      stage.renderer.setRenderTarget(prevTarget);
      stage.renderer.setScissorTest(prevScissorTest);
      stage.renderer.setScissor(prevScissor);
      stage.renderer.setViewport(prevViewport);
      const filename = buildExportFilename({
        modelFileName: deps.getModelFileName?.(),
        ext: `.${actualFormat}`,
      });
      downloadBlob(blob, filename);

      message.success(
        deps.t(
          effectiveTransparent
            ? 'viewer.export.pngSuccessTransparent'
            : 'viewer.export.pngSuccessSolid',
        ),
      );
    }
    catch (e) {
      console.error('export png failed:', e);
      message.error(
        deps.t('viewer.export.fail', { reason: (e as Error).message }),
      );
      message.warning(deps.t('viewer.export.tryLowerScale'));
    }
    finally {
      if (renderTarget) renderTarget.dispose();
      stage.renderer.setClearColor(prevColor, prevAlpha);
      stage.renderer.autoClear = prevAutoClear;
      stage.renderer.setScissorTest(prevScissorTest);
      stage.renderer.setScissor(prevScissor);
      stage.renderer.setViewport(prevViewport);
      stage.renderer.setRenderTarget(prevTarget);
      stage.invalidate();
    }
  }

  return { onExportPng };
}

export type PngExporter = ReturnType<typeof createPngExporter>;
