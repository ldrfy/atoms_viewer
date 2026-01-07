/**
 * Global pull-to-refresh / overscroll blocker (ref-counted).
 * 全局下拉刷新/过度滚动屏蔽器（引用计数）。
 *
 * Used by mobile drag-resize interactions (e.g., Settings bottom sheet, Atom Inspector).
 * 用于移动端拖拽缩放交互（如设置面板、原子检查器）。
 *
 * Mobile Firefox can still trigger pull-to-refresh unless we:
 * - lock page scroll via body { position: fixed; top: -scrollY }
 * - add document-level (capture) touchstart/touchmove listeners with passive:false
 * - temporarily set html/body overscrollBehaviorY + touchAction
 *
 * 在移动端 Firefox 中，需要：
 * - 固定 body 防止页面滚动
 * - 捕获 touch 事件并阻止默认行为
 * - 临时设置 html/body 的 overscroll/touchAction
 */

export type PullToRefreshBlockToken = symbol;

type SavedBodyStyle = {
  position: string;
  top: string;
  left: string;
  right: string;
  width: string;
  overflow: string;
  overscrollBehaviorY: string;
  touchAction: string;
};

type SavedHtmlStyle = {
  overscrollBehaviorY: string;
  touchAction: string;
};

type GlobalPtrBlockState = {
  count: number;
  scrollY: number;
  tokens: Set<PullToRefreshBlockToken>;
  bodyStyle: SavedBodyStyle;
  htmlStyle: SavedHtmlStyle;
  touchStartBlocker: ((e: TouchEvent) => void) | null;
  touchMoveBlocker: ((e: TouchEvent) => void) | null;
};

declare global {
  interface Window {
    __lavPtrBlock?: GlobalPtrBlockState;
  }
}

function ensureState(): GlobalPtrBlockState | null {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;

  if (window.__lavPtrBlock) return window.__lavPtrBlock;

  const body = document.body as HTMLElement;
  const html = document.documentElement as HTMLElement;
  const scrollY = window.scrollY || window.pageYOffset || 0;

  const state: GlobalPtrBlockState = {
    count: 0,
    scrollY,
    tokens: new Set<PullToRefreshBlockToken>(),
    bodyStyle: {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
      overscrollBehaviorY: (body.style as any).overscrollBehaviorY ?? '',
      touchAction: (body.style as any).touchAction ?? '',
    },
    htmlStyle: {
      overscrollBehaviorY: (html.style as any).overscrollBehaviorY ?? '',
      touchAction: (html.style as any).touchAction ?? '',
    },
    touchStartBlocker: null,
    touchMoveBlocker: null,
  };

  window.__lavPtrBlock = state;
  return state;
}

function applyBlock(state: GlobalPtrBlockState): void {
  const body = document.body as HTMLElement;
  const html = document.documentElement as HTMLElement;

  // Add class hooks (used by CSS to suppress overscroll further)
  html.classList.add('resizing');
  body.classList.add('resizing');

  // Freeze the page scroll position.
  state.scrollY = window.scrollY || window.pageYOffset || 0;
  body.style.position = 'fixed';
  body.style.top = `-${state.scrollY}px`;
  body.style.left = '0';
  body.style.right = '0';
  body.style.width = '100%';
  body.style.overflow = 'hidden';
  (body.style as any).overscrollBehaviorY = 'none';
  (body.style as any).touchAction = 'none';
  (html.style as any).overscrollBehaviorY = 'none';
  (html.style as any).touchAction = 'none';

  // Document-level blockers (capture + passive:false) are the most reliable for mobile Firefox.
  state.touchStartBlocker = (ev: TouchEvent) => {
    if (!window.__lavPtrBlock || window.__lavPtrBlock.count <= 0) return;
    if (ev.cancelable) {
      ev.preventDefault();
      ev.stopPropagation();
    }
  };
  document.addEventListener('touchstart', state.touchStartBlocker, {
    passive: false,
    capture: true,
  });

  state.touchMoveBlocker = (ev: TouchEvent) => {
    if (!window.__lavPtrBlock || window.__lavPtrBlock.count <= 0) return;
    if (ev.cancelable) {
      ev.preventDefault();
      ev.stopPropagation();
    }
  };
  document.addEventListener('touchmove', state.touchMoveBlocker, {
    passive: false,
    capture: true,
  });
}

function removeBlock(state: GlobalPtrBlockState): void {
  const body = document.body as HTMLElement;
  const html = document.documentElement as HTMLElement;

  html.classList.remove('resizing');
  body.classList.remove('resizing');

  if (state.touchStartBlocker) {
    document.removeEventListener('touchstart', state.touchStartBlocker as any, true);
    state.touchStartBlocker = null;
  }
  if (state.touchMoveBlocker) {
    document.removeEventListener('touchmove', state.touchMoveBlocker as any, true);
    state.touchMoveBlocker = null;
  }

  // Restore styles.
  body.style.position = state.bodyStyle.position;
  body.style.top = state.bodyStyle.top;
  body.style.left = state.bodyStyle.left;
  body.style.right = state.bodyStyle.right;
  body.style.width = state.bodyStyle.width;
  body.style.overflow = state.bodyStyle.overflow;
  (body.style as any).overscrollBehaviorY = state.bodyStyle.overscrollBehaviorY;
  (body.style as any).touchAction = state.bodyStyle.touchAction;
  (html.style as any).overscrollBehaviorY = state.htmlStyle.overscrollBehaviorY;
  (html.style as any).touchAction = state.htmlStyle.touchAction;

  // Restore scroll position.
  const y = state.scrollY;
  window.scrollTo(0, y);
}

/**
 * Enable global pull-to-refresh blocking.
 * Returns a token which must be passed back to unblockPullToRefresh().
 */
export function blockPullToRefresh(): PullToRefreshBlockToken {
  // Always return a token so callers can keep simple logic.
  const token = Symbol('ptr-block') as PullToRefreshBlockToken;
  const state = ensureState();
  if (!state) return token;

  if (!state.tokens.has(token)) {
    state.tokens.add(token);
    state.count += 1;
    if (state.count === 1) applyBlock(state);
  }
  return token;
}

/**
 * Disable global pull-to-refresh blocking for the provided token.
 * Safe to call multiple times.
 */
export function unblockPullToRefresh(token: PullToRefreshBlockToken | null | undefined): void {
  const state = window.__lavPtrBlock;
  if (!state || !token) return;
  if (!state.tokens.has(token)) return;

  state.tokens.delete(token);
  state.count = Math.max(0, state.count - 1);

  if (state.count === 0) {
    removeBlock(state);
    delete window.__lavPtrBlock;
  }
}
