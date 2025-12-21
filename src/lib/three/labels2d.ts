import {
  CSS2DRenderer,
  CSS2DObject,
} from "three/addons/renderers/CSS2DRenderer.js";

/**把 CSS2DRenderer 挂到 host 上，并返回 renderer。*/
export function attachCss2dRenderer(
  host: HTMLElement,
  zIndex = "2"
): CSS2DRenderer {
  const r = new CSS2DRenderer();
  r.domElement.style.position = "absolute";
  r.domElement.style.top = "0";
  r.domElement.style.left = "0";
  r.domElement.style.pointerEvents = "none";
  r.domElement.style.zIndex = zIndex;

  // 确保叠加层对齐 host
  if (!host.style.position) host.style.position = "relative";

  host.appendChild(r.domElement);
  return r;
}

export function makeTextLabel(text: string, className?: string): CSS2DObject {
  const div = document.createElement("div");
  div.textContent = text;
  if (className) div.className = className;
  return new CSS2DObject(div);
}
