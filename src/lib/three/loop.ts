export type RafLoop = {
  start: () => void;
  stop: () => void;
};

export function createRafLoop(tick: () => void): RafLoop {
  let rafId = 0;

  function frame(): void {
    tick();
    rafId = window.requestAnimationFrame(frame);
  }

  function start(): void {
    if (rafId) return;
    frame();
  }

  function stop(): void {
    if (rafId) window.cancelAnimationFrame(rafId);
    rafId = 0;
  }

  return { start, stop };
}
