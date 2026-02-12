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
        :class="{ 'atom-inspector-panel--resizing': isResizing }"
        :style="panelStyle"
      >
        <!-- Resize handle -->
        <div
          v-if="placement === 'bottom'"
          class="atom-inspector__resizer is-bottom"
          role="separator"
          @pointerdown.prevent="onResizeStart('mobile', $event)"
        />

        <div
          class="atom-inspector-panel__inner"
          :class="{ 'atom-inspector-panel__inner--suspended': isResizing }"
        >
          <!-- Header (glass title bar) -->
          <div class="atom-inspector__header">
            <!-- Mobile only: grab handle (same UX as SettingsSider settings-grab) -->
            <div
              v-if="placement === 'bottom'"
              class="atom-inspector__grab"
              :title="t('common.resize')"
              role="button"
              tabindex="0"
              @pointerdown.prevent="onResizeStart('mobile', $event)"
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

              <a-space size="small" class="atom-inspector__actions">
                <a-tooltip :title="t('viewer.inspect.measureMode')">
                  <a-switch
                    v-model:checked="measureMode"
                    size="small"
                    :title="t('viewer.inspect.measureMode')"
                  />
                </a-tooltip>

                <a-tooltip :title="t('viewer.inspect.selectAll')">
                  <a-button
                    size="small"
                    :type="isAllChecked ? 'primary' : 'default'"
                    :disabled="selected.length === 0"
                    :title="t('viewer.inspect.selectAll')"
                    @click="toggleSelectAll"
                  >
                    <CheckOutlined />
                  </a-button>
                </a-tooltip>

                <a-tooltip
                  :title="t('viewer.inspect.deleteHint')"
                  :overlay-style="{ pointerEvents: 'none' }"
                >
                  <a-button
                    size="small"
                    danger
                    :disabled="checkedKeys.size === 0"
                    @click="removeChecked"
                  >
                    <DeleteOutlined />
                  </a-button>
                </a-tooltip>

                <a-button
                  type="text"
                  size="small"
                  :title="t('common.collapse')"
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
                <a-flex
                  v-for="(item, index) in selected"
                  :key="item.atomIndex ?? index"
                  gap="middle"
                  align="center"
                  style="padding: 5px;"
                >
                  <a-tag color="green" variant="outlined">
                    {{ index + 1 }}
                  </a-tag>

                  <a-popover :trigger="['click']" :content="buildTooltip(item)" placement="topLeft">
                    <a-space direction="vertical" :size="0" style="flex: 1; min-width: 0;">
                      <a-typography-text strong>
                        {{ item.element }} {{ item.atomIndex + 1 }}
                      </a-typography-text>

                      <a-typography-text>
                        x={{ fmt(item.position?.[0]) }},
                        y={{ fmt(item.position?.[1]) }},
                        z={{ fmt(item.position?.[2]) }}
                      </a-typography-text>
                    </a-space>
                  </a-popover>

                  <a-checkbox
                    :checked="isItemChecked(item)"
                    @change="onItemChecked(item, $event.target.checked)"
                  />
                </a-flex>
              </div>

              <!-- Fixed footer: measures -->
              <div class="atom-inspector__footer">
                <a-divider v-if="measureMode && measure.distance12 != null" />

                <a-descriptions size="small" :column="1" :items="measureItems" />

                <!-- 提示文案包一层容器，确保上下间距稳定生效。 -->
                <!-- Wrap hint text with a container so vertical spacing is applied reliably. -->
                <div v-if="measureMode && selected.length > 1" class="atom-inspector__measureHint">
                  <a-typography-text type="secondary">
                    {{ t('viewer.inspect.orderHint') }}
                  </a-typography-text>
                </div>
              </div>
            </div>
          </div>
        </div>
        <!-- 交互期轻量壳层：完全冻结内容显示但保留组件状态。 -->
        <!-- Lightweight shell during interaction: freeze visual content while preserving component state. -->
        <div v-if="isResizing" class="atom-inspector-drag-shell">
          <div class="atom-inspector-drag-shell__grab">
            <div class="atom-inspector__grab-bar" />
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
  CheckOutlined,
  DeleteOutlined,
  DownOutlined,
  LeftOutlined,
  RightOutlined,
  UpOutlined,
} from '@antdv-next/icons';
import type { InspectCtx } from '../ctx/inspect';
import {
  createPointerDragWithPullToRefreshBlock,
} from '../../../lib/dom/pullToRefreshBlock';
import { clampNumber } from '../../../lib/utils/number';
import { loadNumber, saveNumber } from '../../../lib/utils/storage';

const props = defineProps<{ ctx: InspectCtx }>();
const { t } = useI18n();

const enabled = props.ctx.enabled;
const measureMode = props.ctx.measureMode;
const selected = props.ctx.selected;
const measure = props.ctx.measure;

// 选中删除缓存键
// Selected deletion cache key.
const checkedKeys = ref<Set<string>>(new Set());

function buildItemKey(item: { layerId: string; atomIndex: number }): string {
  // 选中项唯一键
  // Unique key for a selection item.
  return `${item.layerId}:${item.atomIndex}`;
}

function isItemChecked(item: { layerId: string; atomIndex: number }): boolean {
  return checkedKeys.value.has(buildItemKey(item));
}

function onItemChecked(
  item: { layerId: string; atomIndex: number },
  checked: boolean,
): void {
  const next = new Set(checkedKeys.value);
  const key = buildItemKey(item);
  if (checked) next.add(key);
  else next.delete(key);
  checkedKeys.value = next;
}

function removeChecked(): void {
  // 批量删除选中原子
  // Bulk remove selected atoms.
  const delKeys = checkedKeys.value;
  if (delKeys.size === 0) return;
  selected.value = selected.value.filter(item => !delKeys.has(buildItemKey(item)));
  checkedKeys.value = new Set();
}

const totalSelectableCount = computed(() => {
  const keys = new Set<string>();
  for (const item of selected.value) {
    keys.add(buildItemKey(item));
  }
  return keys.size;
});

const isAllChecked = computed(() =>
  totalSelectableCount.value > 0
  && checkedKeys.value.size === totalSelectableCount.value,
);

function toggleSelectAll(): void {
  // 全选/取消全选
  // Toggle select all / clear all.
  if (isAllChecked.value) {
    checkedKeys.value = new Set();
    return;
  }
  const next = new Set<string>();
  for (const item of selected.value) {
    next.add(buildItemKey(item));
  }
  checkedKeys.value = next;
}

watch(
  () => selected.value,
  (list) => {
    const existing = new Set(list.map(item => buildItemKey(item)));
    const next = new Set<string>();
    for (const key of checkedKeys.value) {
      if (existing.has(key)) next.add(key);
    }
    if (next.size !== checkedKeys.value.size) checkedKeys.value = next;
  },
  { deep: true },
);

const visible = computed(() => enabled.value);

// 测量信息描述项
// Measurement description items.
const measureItems = computed(() => {
  const items = [];
  if (measureMode.value && measure.value.distance12 != null) {
    items.push({
      label: `${t('viewer.inspect.distance')} (1–2)`,
      content: `${fmt(measure.value.distance12)} Å`,
    });
  }
  if (measureMode.value && measure.value.distance23 != null) {
    items.push({
      label: `${t('viewer.inspect.distance')} (2–3)`,
      content: `${fmt(measure.value.distance23)} Å`,
    });
  }
  if (measureMode.value && measure.value.angleDeg != null) {
    items.push({
      label: t('viewer.inspect.angle'),
      content: `${fmt(measure.value.angleDeg)}°`,
    });
  }
  return items;
});

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

function buildTooltip(item: any): string {
  const parts: string[] = [];
  if (item.layerName || item.layerId) parts.push(String(item.layerName || item.layerId));
  if (item.id != null) parts.push(`id=${item.id}`);
  if (item.typeId != null) parts.push(`type=${item.typeId}`);
  return parts.join(' · ');
}

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
const desktopWidth = ref(loadNumber('atomInspector.desktopWidth', 360)); // px
const desktopHeight = ref(loadNumber('atomInspector.desktopHeight', 0)); // px
const mobileHeight = ref(loadNumber('atomInspector.mobileHeight', 280)); // px

onMounted(() => {
  if (desktopHeight.value <= 0) {
    desktopHeight.value = Math.floor(window.innerHeight * 0.64);
    saveNumber('atomInspector.desktopHeight', desktopHeight.value);
  }
});

let startX = 0;
let startY = 0;
let startW = 0;
let startH = 0;
let resizeMode: 'width' | 'height' | 'mobile' = 'width';
// 交互期冻结重内容渲染，降低大列表拖拽卡顿。
// Freeze heavy content during resize interaction to reduce jank with large selected lists.
const isResizing = ref(false);
// 拖拽过程中只记录脏标记，结束后再一次性持久化，避免频繁 localStorage 写入。
// During drag, mark dirty only and persist once on release to avoid frequent localStorage writes.
let desktopWidthDirty = false;
let desktopHeightDirty = false;
let mobileHeightDirty = false;
const resizeDrag = createPointerDragWithPullToRefreshBlock({
  shouldBlockPullToRefresh: () => placement.value === 'bottom',
  onStart: (e) => {
    // Prevent browser default panning / pull-to-refresh gesture from starting.
    try {
      e.preventDefault();
      e.stopPropagation();
    }
    catch {
      // ignore
    }

    startX = e.clientX;
    startY = e.clientY;
    startW = desktopWidth.value;
    startH = resizeMode === 'mobile' ? mobileHeight.value : desktopHeight.value;
    isResizing.value = true;
  },
  onMove: (e) => {
    // Keep pointermove passive to avoid browser warnings.
    // 保持 pointermove 被动监听，避免浏览器警告。
    if (placement.value === 'left') {
      if (resizeMode === 'height') {
        const dy = e.clientY - startY;
        const topPx = Math.max(12, Math.floor(window.innerHeight * 0.18));
        const maxH = Math.max(220, window.innerHeight - topPx - 12);
        desktopHeight.value = clampNumber(startH + dy, 220, maxH);
        desktopHeightDirty = true;
      }
      else {
        // drag handle on right edge: dragging right increases width
        const dx = e.clientX - startX;
        const maxW = Math.floor(window.innerWidth * 0.7);
        desktopWidth.value = clampNumber(startW + dx, 320, Math.max(320, maxW));
        desktopWidthDirty = true;
      }
    }
    else {
      // bottom panel: dragging up increases height
      // 移动端最大高度与设置面板保持一致（80vh）。
      // Keep mobile max height aligned with Settings panel (80vh).
      const dy = startY - e.clientY;
      const maxH = Math.floor(window.innerHeight * 0.8);
      mobileHeight.value = clampNumber(startH + dy, 200, Math.max(200, maxH));
      mobileHeightDirty = true;
    }
  },
  onEnd: () => {
    isResizing.value = false;
    if (desktopWidthDirty) {
      saveNumber('atomInspector.desktopWidth', desktopWidth.value);
      desktopWidthDirty = false;
    }
    if (desktopHeightDirty) {
      saveNumber('atomInspector.desktopHeight', desktopHeight.value);
      desktopHeightDirty = false;
    }
    if (mobileHeightDirty) {
      saveNumber('atomInspector.mobileHeight', mobileHeight.value);
      mobileHeightDirty = false;
    }
  },
});

function onResizeStart(mode: 'width' | 'height' | 'mobile', e: PointerEvent) {
  resizeMode = mode;
  resizeDrag.start(e);
}

function onResizeEnd() {
  resizeDrag.stop();
  isResizing.value = false;
}
onBeforeUnmount(() => onResizeEnd());

const panelStyle = computed(() => {
  const z = 220;
  if (placement.value === 'left') {
    const topPx = Math.max(12, Math.floor(window.innerHeight * 0.18));
    const maxH = Math.max(220, window.innerHeight - topPx - 12);
    const height = clampNumber(desktopHeight.value, 220, maxH);
    return {
      position: 'fixed',
      zIndex: z,
      left: 0,
      top: `${topPx}px`,
      height: `${height}px`,
      width: 'fit-content',
      maxWidth: 'min(360px, 42vw)',
      borderRadius: '0 10px 10px 0',
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
  position: relative;
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

.atom-inspector-panel.atom-inspector-panel--resizing {
  transition: none;
  will-change: width, height;
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

.atom-inspector-panel__inner.atom-inspector-panel__inner--suspended {
  visibility: hidden;
  pointer-events: none;
  content-visibility: hidden;
}

.atom-inspector-drag-shell {
  position: absolute;
  inset: 0;
  z-index: 3;
  pointer-events: none;
  display: flex;
  justify-content: center;
}

.atom-inspector-drag-shell__grab {
  padding-top: 10px;
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

.atom-inspector__list {
  scrollbar-width: thin;
  scrollbar-color: rgba(120, 120, 120, 0.25) transparent;
}

.atom-inspector__list::-webkit-scrollbar {
  width: 8px;
}

.atom-inspector__list::-webkit-scrollbar-track {
  background: transparent;
}

.atom-inspector__list::-webkit-scrollbar-thumb {
  background-color: rgba(120, 120, 120, 0.25);
  border-radius: 999px;
  border: 2px solid transparent;
  background-clip: padding-box;
}

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
  position: relative;
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
  touch-action: pan-y;
  scrollbar-gutter: stable;
}

.atom-inspector__footer {
  flex: 0 0 auto;
}

.atom-inspector__measureHint {
  display: block;
  margin-top: 12px;
  margin-bottom: 12px;
}
</style>
