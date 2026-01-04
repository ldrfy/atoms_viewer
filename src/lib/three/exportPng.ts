import * as THREE from 'three';
import type { AnyCamera } from './camera';
import { updateCameraForSize } from './camera';
import { getElementSize } from './resize';
import { cropCanvasToPngBlob, downloadBlob } from '../image/cropPng';

export async function exportTransparentCroppedPng(params: {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: AnyCamera;
  host: HTMLElement;
  filename: string;
  scale: number;
  orthoHalfHeight: number;
  alphaThreshold?: number;
  padding?: number;
}): Promise<void> {
  const {
    renderer,
    scene,
    camera,
    host,
    filename,
    scale,
    orthoHalfHeight,
    alphaThreshold = 8,
    padding = 3,
  } = params;

  const prevSize = new THREE.Vector2();
  renderer.getSize(prevSize);
  const prevPixelRatio = renderer.getPixelRatio();

  const { w, h } = getElementSize(host);

  renderer.setPixelRatio(1);
  renderer.setSize(w * scale, h * scale, false);

  // 相机按“逻辑视口 w/h”更新（不是 w*scale）
  updateCameraForSize(camera, w, h, orthoHalfHeight);

  renderer.render(scene, camera);

  const { blob } = await cropCanvasToPngBlob(renderer.domElement, {
    alphaThreshold,
    padding,
  });
  downloadBlob(blob, filename);

  // restore
  renderer.setPixelRatio(prevPixelRatio);
  renderer.setSize(prevSize.x, prevSize.y, false);

  updateCameraForSize(camera, prevSize.x, prevSize.y, orthoHalfHeight);
  renderer.render(scene, camera);
}
