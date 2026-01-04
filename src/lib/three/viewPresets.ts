import * as THREE from 'three';
import type { AnyCamera } from './camera';
import type { ViewPreset } from '../viewer/viewPresets';

const V_UP = new THREE.Vector3(0, 1, 0);
const V_UP_TOP = new THREE.Vector3(0, 0, 1);

/**
 * Apply an axis-aligned preset pose to a camera.
 * - front: camera at +Z, up +Y
 * - side:  camera at +X, up +Y
 * - top:   camera at +Y, up +Z
 */
export function applyCameraPoseForPreset(params: {
  camera: AnyCamera;
  preset: ViewPreset;
  target: THREE.Vector3;
  distance: number;
}): void {
  const { camera, preset, target } = params;
  const dist = Math.max(1e-6, params.distance);

  const dir = new THREE.Vector3();
  switch (preset) {
    case 'front':
      dir.set(0, 0, 1);
      camera.up.copy(V_UP);
      break;
    case 'side':
      dir.set(1, 0, 0);
      camera.up.copy(V_UP);
      break;
    case 'top':
      dir.set(0, 1, 0);
      camera.up.copy(V_UP_TOP);
      break;
    default:
      dir.set(0, 0, 1);
      camera.up.copy(V_UP);
      break;
  }

  camera.position.copy(target).add(dir.multiplyScalar(dist));
  camera.lookAt(target);
}
