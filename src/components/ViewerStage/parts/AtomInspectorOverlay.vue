<template>
  <Teleport to="body">
    <!-- Mini collapsed handle -->
    <Transition name="atom-inspector-mini-fade">
      <div
        v-show="visible && collapsed"
        class="atom-inspector-mini"
        :class="placement === 'bottom' ? 'is-bottom' : 'is-left'"
        role="button"
        tabindex="0"
        @click="collapsed = false"
        @keydown.enter.prevent="collapsed = false"
        @keydown.space.prevent="collapsed = false"
      >
        <a-button class="mini-handle">
          <component :is="expandIcon" />
        </a-button>
      </div>
    </Transition>

    <!-- Floating panel (no Ant Drawer) -->
    <Transition :name="panelTransitionName">
      <div
        v-show="visible && !collapsed"
        class="atom-inspector-panel"
        :style="panelStyle"
      >
        <!-- Resize handle -->
        <div
          class="atom-inspector__resizer"
          :class="placement === 'bottom' ? 'is-bottom' : 'is-right'"
          role="separator"
          aria-label="resize"
          @pointerdown.prevent="onResizeStart"
        />

        <div class="atom-inspector-panel__inner">
          <!-- Header (glass title bar) -->
          <div class="atom-inspector__header">
            <!-- Mobile only: grab handle (same UX as SettingsSider settings-grab) -->
            <div
              v-if="placement === 'bottom'"
              class="atom-inspector__grab"
              aria-label="resize"
              title="Resize"
              role="button"
              tabindex="0"
              @pointerdown.prevent="onResizeStart"
            >
              <div class="atom-inspector__grab-bar" />
            </div>

            <div class="atom-inspector__header-row">
              <div class="atom-inspector__title">
                <a-typography-text strong>
                  {{ t('viewer.inspect.title') }}
                </a-typography-text>
                <a-typography-text v-if="selected.length" type="secondary" class="atom-inspector__count">
                  ({{ selected.length }})
                </a-typography-text>
              </div>

              <a-space size="small">
                <a-tooltip :title="t('viewer.inspect.measureMode')">
                  <a-switch
                    v-model:checked="measureMode"
                    size="small"
                    :aria-label="t('viewer.inspect.measureMode')"
                    :title="t('viewer.inspect.measureMode')"
                  />
                </a-tooltip>

                <a-button size="small" :disabled="selected.length === 0" @click="clear">
                  {{ t('viewer.inspect.clear') }}
                </a-button>

                <a-button
                  type="text"
                  size="small"
                  aria-label="collapse"
                  title="Collapse"
                  @click="collapsed = true"
                >
                  <component :is="collapseIcon" />
                </a-button>
              </a-space>
            </div>
          </div>

          <!-- Body -->
          <div class="atom-inspector__body">
            <div v-if="selected.length === 0" class="atom-inspector__empty">
              <a-typography-text type="secondary">
                {{ t('viewer.inspect.hint') }}
              </a-typography-text>
            </div>

            <div v-else class="atom-inspector__content">
              <!-- Scrollable list -->
              <div class="atom-inspector__list">
                <a-list size="small" :data-source="selected" :split="false">
                  <template #renderItem="{ item, index }">
                    <a-list-item class="atom-item">
                      <div class="atom-row">
                        <div class="atom-index">
                          <a-tag color="blue">
                            {{ index + 1 }}
                          </a-tag>
                        </div>

                        <div class="atom-body">
                          <div class="atom-header">
                            <a-typography-text strong class="atom-element">
                              {{ item.element }}
                            </a-typography-text>

                            <div class="atom-meta">
                              <a-typography-text type="secondary">
                                Z={{ item.atomicNumber }}
                              </a-typography-text>
                              <a-typography-text type="secondary">
                                idx={{ item.atomIndex + 1 }}
                              </a-typography-text>
                              <a-typography-text v-if="item.id != null" type="secondary">
                                id={{ item.id }}
                              </a-typography-text>
                              <a-typography-text v-if="item.typeId != null" type="secondary">
                                type={{ item.typeId }}
                              </a-typography-text>
                            </div>
                          </div>

                          <div class="atom-inspector__coords">
                            x={{ fmt(item.position?.[0]) }},
                            y={{ fmt(item.position?.[1]) }},
                            z={{ fmt(item.position?.[2]) }}
                          </div>
                        </div>
                      </div>
                    </a-list-item>
                  </template>
                </a-list>
              </div>

              <!-- Fixed footer: measures -->
              <div class="atom-inspector__footer">
                <a-divider v-if="measureMode && measure.distance12 != null" style="margin: 10px 0" />

                <a-descriptions size="small" :column="1">
                  <a-descriptions-item
                    v-if="measureMode && measure.distance12 != null"
                    :label="`${t('viewer.inspect.distance')} (1–2)`"
                  >
                    {{ fmt(measure.distance12) }} Å
                  </a-descriptions-item>

                  <a-descriptions-item
                    v-if="measureMode && measure.distance23 != null"
                    :label="`${t('viewer.inspect.distance')} (2–3)`"
                  >
                    {{ fmt(measure.distance23) }} Å
                  </a-descriptions-item>

                  <a-descriptions-item
                    v-if="measureMode && measure.angleDeg != null"
                    :label="t('viewer.inspect.angle')"
                  >
                    {{ fmt(measure.angleDeg) }}°
                  </a-descriptions-item>
                </a-descriptions>

                <a-typography-text
                  v-if="measureMode && selected.length > 1"
                  type="secondary"
                  class="atom-inspector__measureHint"
                >
                  {{ t('viewer.inspect.orderHint') }}
                </a-typography-text>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  DownOutlined,
  LeftOutlined,
  RightOutlined,
  UpOutlined,
} from '@ant-design/icons-vue';
import type { InspectCtx } from '../ctx/inspect';
import {
  blockPullToRefresh,
  unblockPullToRefresh,
  type PullToRefreshBlockToken,
} from '../../../lib/dom/pullToRefreshBlock';

const props = defineProps<{ ctx: InspectCtx }>();
const { t } = useI18n();

const enabled = props.ctx.enabled;
const measureMode = props.ctx.measureMode;
const selected = props.ctx.selected;
const measure = props.ctx.measure;
const clear = props.ctx.clear;

const visible = computed(() => enabled.value);

/** --- Responsive placement (desktop: left, mobile: bottom) --- */
const isMobile = ref(false);
function updateIsMobile() {
  isMobile.value = window.matchMedia('(max-width: 768px)').matches;
}
onMounted(() => {
  updateIsMobile();
  window.addEventListener('resize', updateIsMobile, { passive: true });
});
onBeforeUnmount(() => {
  window.removeEventListener('resize', updateIsMobile);
});

const placement = computed<'left' | 'bottom'>(() => (isMobile.value ? 'bottom' : 'left'));

const expandIcon = computed(() =>
  placement.value === 'left' ? RightOutlined : UpOutlined,
);
const collapseIcon = computed(() =>
  placement.value === 'left' ? LeftOutlined : DownOutlined,
);
const panelTransitionName = computed(() =>
  placement.value === 'left' ? 'atom-inspector-slide-left' : 'atom-inspector-slide-up',
);

/** --- collapsed logic ---
 * - no atoms -> collapsed
 * - 0 -> >0 -> auto expand
 */
const collapsed = ref(true);
watch(
  () => selected.value.length,
  (n, prev) => {
    if (n === 0) collapsed.value = true;
    if (prev === 0 && n > 0) collapsed.value = false;
  },
  { immediate: true },
);
watch(
  () => visible.value,
  (v) => {
    if (!v) collapsed.value = true;
    if (!v) onResizeEnd();
  },
);

watch(
  () => collapsed.value,
  (v) => {
    if (v) onResizeEnd();
  },
);

/** --- Size persistence + resizing --- */
function loadNum(key: string, fallback: number) {
  const raw = localStorage.getItem(key);
  const v = raw != null ? Number(raw) : NaN;
  return Number.isFinite(v) ? v : fallback;
}
function saveNum(key: string, v: number) {
  localStorage.setItem(key, String(v));
}

const desktopWidth = ref(loadNum('atomInspector.desktopWidth', 360)); // px
const mobileHeight = ref(loadNum('atomInspector.mobileHeight', 280)); // px

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

let resizing = false;
let startX = 0;
let startY = 0;
let startW = 0;
let startH = 0;
let activePointerId: number | null = null;
let ptrBlockToken: PullToRefreshBlockToken | null = null;

function startBlockPullToRefresh(): void {
  // Ref-counted global blocker shared by all panels.
  if (!ptrBlockToken) ptrBlockToken = blockPullToRefresh();
}

function stopBlockPullToRefresh(): void {
  if (ptrBlockToken) {
    unblockPullToRefresh(ptrBlockToken);
    ptrBlockToken = null;
  }
}

function onResizeStart(e: PointerEvent) {
  // Prevent browser default panning / pull-to-refresh gesture from starting.
  try {
    e.preventDefault();
    e.stopPropagation();
  }
  catch {
    // ignore
  }

  resizing = true;
  activePointerId = e.pointerId;
  startX = e.clientX;
  startY = e.clientY;
  startW = desktopWidth.value;
  startH = mobileHeight.value;

  try {
    (e.currentTarget as HTMLElement | null)?.setPointerCapture?.(e.pointerId);
  }
  catch {
    // ignore
  }

  // Only needed for mobile (bottom sheet): suppress pull-to-refresh overscroll while resizing.
  if (placement.value === 'bottom') startBlockPullToRefresh();

  window.addEventListener('pointermove', onResizing, { passive: false });
  window.addEventListener('pointerup', onResizeEnd, { passive: true });
  window.addEventListener('pointercancel', onResizeEnd, { passive: true });
  window.addEventListener('lostpointercapture', onResizeEnd as any, { passive: true });
}

function onResizing(e: PointerEvent) {
  if (!resizing) return;
  if (activePointerId != null && e.pointerId !== activePointerId) return;

  // Cancel default panning while dragging (important on mobile Firefox).
  try {
    e.preventDefault();
    e.stopPropagation();
  }
  catch {
    // ignore
  }

  if (placement.value === 'left') {
    // drag handle on right edge: dragging right increases width
    const dx = e.clientX - startX;
    const maxW = Math.floor(window.innerWidth * 0.7);
    desktopWidth.value = clamp(startW + dx, 260, Math.max(260, maxW));
    saveNum('atomInspector.desktopWidth', desktopWidth.value);
  }
  else {
    // bottom panel: dragging up increases height
    const dy = startY - e.clientY;
    const maxH = Math.floor(window.innerHeight * 0.7);
    mobileHeight.value = clamp(startH + dy, 200, Math.max(200, maxH));
    saveNum('atomInspector.mobileHeight', mobileHeight.value);
  }
}

function onResizeEnd() {
  if (!resizing) return;
  resizing = false;
  activePointerId = null;
  stopBlockPullToRefresh();
  window.removeEventListener('pointermove', onResizing);
  window.removeEventListener('pointerup', onResizeEnd);
  window.removeEventListener('pointercancel', onResizeEnd);
  window.removeEventListener('lostpointercapture', onResizeEnd as any);
}
onBeforeUnmount(() => onResizeEnd());

const panelStyle = computed(() => {
  const z = 220;
  if (placement.value === 'left') {
    return {
      position: 'fixed',
      zIndex: z,
      left: '12px',
      top: '18%',
      height: '64%',
      width: `${desktopWidth.value}px`,
      borderRadius: '10px',
    } as Record<string, any>;
  }
  return {
    position: 'fixed',
    zIndex: z,
    left: 0,
    right: 0,
    bottom: 0,
    height: `${mobileHeight.value}px`,
    borderRadius: '10px 10px 0 0',
  } as Record<string, any>;
});

function fmt(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '-';
  return v.toFixed(4);
}
</script>

<style>
/*
  Atom inspector uses a Teleport + fixed-position floating panel.
  Avoid Ant Drawer so glass / blur works consistently across desktop & mobile.
*/

:root {
  --atom-inspector-bg: var(--glass-panel-bg);
  --atom-inspector-header-bg: var(--glass-panel-header-bg);
  --atom-inspector-blur: var(--glass-panel-blur);
  --atom-inspector-border: rgba(0, 0, 0, 0.10);
}

:root[data-theme="dark"] {
  --atom-inspector-border: rgba(255, 255, 255, 0.14);
}

.atom-inspector-panel {
  background: var(--atom-inspector-bg);
  backdrop-filter: blur(var(--atom-inspector-blur));
  -webkit-backdrop-filter: blur(var(--atom-inspector-blur));
  border: 1px solid var(--atom-inspector-border);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  pointer-events: auto;
}

.atom-inspector-panel.is-bottom {
  box-shadow: 0 -10px 30px rgba(0, 0, 0, 0.12);
}

.atom-inspector-panel__inner {
  position: relative;
  height: 100%;
  padding: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* Mini collapsed handle (also glass) */
.atom-inspector-mini {
  position: fixed;
  z-index: 221;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  pointer-events: auto;
  left: 0px;
  top: 40%;
}

.mini-handle {
  font-size: 12px;
  -webkit-user-select: none;
  user-select: none;
  padding: 0 8px;
  background: none;
}

/* Transitions */
.atom-inspector-slide-left-enter-active,
.atom-inspector-slide-left-leave-active {
  transition: transform 180ms ease, opacity 180ms ease;
}
.atom-inspector-slide-left-enter-from,
.atom-inspector-slide-left-leave-to {
  transform: translateX(-12px);
  opacity: 0;
}

.atom-inspector-slide-up-enter-active,
.atom-inspector-slide-up-leave-active {
  transition: transform 200ms ease, opacity 200ms ease;
}
.atom-inspector-slide-up-enter-from,
.atom-inspector-slide-up-leave-to {
  transform: translateY(18px);
  opacity: 0;
}

.atom-inspector-mini-fade-enter-active,
.atom-inspector-mini-fade-leave-active {
  transition: opacity 160ms ease;
}
.atom-inspector-mini-fade-enter-from,
.atom-inspector-mini-fade-leave-to {
  opacity: 0;
}
</style>

<style scoped>
/* Mobile grab handle (resize hotzone) */
.atom-inspector__grab {
  padding: 10px 0 6px;
  cursor: row-resize;
  display: flex;
  justify-content: center;
  touch-action: none;
}

.atom-inspector__grab-bar {
  width: 44px;
  height: 4px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.18);
}

:root[data-theme="dark"] .atom-inspector__grab-bar {
  /* On dark theme the handle must be bright enough to be visible */
  background: rgba(255, 255, 255, 0.26);
}

/* Resize handle */
.atom-inspector__resizer {
  position: absolute;
  z-index: 2;
  background: transparent;
  /* Critical on mobile Firefox: prevent default panning / pull-to-refresh while dragging */
  touch-action: none;
}

.atom-inspector__resizer.is-right {
  right: 0;
  top: 0;
  bottom: 0;
  width: 8px;
  cursor: col-resize;
}

.atom-inspector__resizer.is-bottom {
  left: 0;
  right: 0;
  top: 0;
  height: 8px;
  cursor: row-resize;
}

/* Header (glass title bar, matches SettingsSider header) */
.atom-inspector__header {
  position: sticky;
  top: 0;
  z-index: 2;
  background: var(--atom-inspector-header-bg);
  backdrop-filter: blur(var(--atom-inspector-blur));
  -webkit-backdrop-filter: blur(var(--atom-inspector-blur));
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
}

:root[data-theme="dark"] .atom-inspector__header {
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
}

.atom-inspector__header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
}

.atom-inspector__title {
  font-weight: 600;
  font-size: 13px;
  line-height: 1.2;
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.atom-inspector__count {
  font-size: 12px;
}

/* Body layout */
.atom-inspector__body {
  padding: 10px 12px;
  font-size: 12px;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.atom-inspector__empty {
  padding: 10px 0;
}

.atom-inspector__content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.atom-inspector__list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding-right: 4px;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
}

.atom-inspector__footer {
  flex: 0 0 auto;
}

/* Rows */
.atom-row {
  display: flex;
  gap: 8px;
}

.atom-body {
  flex: 1;
  min-width: 0;
}

.atom-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.atom-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: flex-end;
}

.atom-element {
  white-space: nowrap;
}

/* coords */
.atom-inspector__coords {
  margin-top: 2px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  word-break: break-all;
}

/* list item spacing */
.atom-item :deep(.ant-list-item) {
  padding: 6px 0;
}

.atom-inspector__measureHint {
  display: block;
  margin-top: 6px;
}
</style>
