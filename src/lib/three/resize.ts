import type * as THREE from 'three';
import type { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';

export type ElementSize = { w: number; h: number };

export function getElementSize(el: HTMLElement): ElementSize {
  const rect = el.getBoundingClientRect();
  return {
    w: Math.max(1, Math.floor(rect.width)),
    h: Math.max(1, Math.floor(rect.height)),
  };
}

/** 监听元素尺寸变化，返回 disposer。 */
export function observeElementResize(
  el: HTMLElement,
  onResize: (size: ElementSize) => void,
): () => void {
  const ro = new ResizeObserver(() => onResize(getElementSize(el)));
  ro.observe(el);

  // 初次也触发一次
  onResize(getElementSize(el));

  return () => ro.disconnect();
}

/** 同步 WebGLRenderer / CSS2DRenderer 尺寸到 host，返回 (w,h)。 */
export function syncRenderersToHost(
  host: HTMLElement,
  renderer: THREE.WebGLRenderer,
  labelRenderer: CSS2DRenderer | null,
): ElementSize {
  const size = getElementSize(host);
  renderer.setSize(size.w, size.h);
  labelRenderer?.setSize(size.w, size.h);
  return size;
}
