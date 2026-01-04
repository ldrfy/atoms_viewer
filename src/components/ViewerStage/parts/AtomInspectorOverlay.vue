<template>
  <!-- Mini collapsed bar -->
  <div
    v-if="visible && collapsed"
    class="atom-inspector-mini"
    role="button"
    tabindex="0"
    @click="collapsed = false"
    @keydown.enter.prevent="collapsed = false"
    @keydown.space.prevent="collapsed = false"
  >
    <a-button class="mini-handle" size="small">
      ⟨
    </a-button>
  </div>

  <!-- Drawer -->
  <a-drawer
    v-if="visible"
    :placement="placement"
    :open="visible && !collapsed"
    :closable="false"
    :mask="false"
    :get-container="false"
    :style="drawerRootStyle"
    :content-wrapper-style="contentWrapperStyle"
    :body-style="drawerBodyStyle"
    :width="placement === 'right' ? desktopWidth : undefined"
    :height="placement === 'bottom' ? mobileHeight : undefined"
  >
    <!-- Resize handle -->
    <div
      class="atom-inspector__resizer"
      :class="placement === 'right' ? 'is-right' : 'is-bottom'"
      @mousedown.prevent="onResizeStart"
    />

    <!-- Header -->
    <div class="atom-inspector__header">
      <div class="atom-inspector__title">
        {{ t('viewer.inspect.title') }}
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
          ⟩
        </a-button>
      </a-space>
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
          <a-divider style="margin: 10px 0" />

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
  </a-drawer>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { useI18n } from 'vue-i18n';
import type { InspectCtx } from '../ctx/inspect';

const props = defineProps<{ ctx: InspectCtx }>();
const { t } = useI18n();

const enabled = props.ctx.enabled;
const measureMode = props.ctx.measureMode;
const selected = props.ctx.selected;
const measure = props.ctx.measure;
const clear = props.ctx.clear;

const visible = computed(() => enabled.value);

/** --- Responsive placement (desktop: right, mobile: bottom) --- */
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

const placement = computed<'right' | 'bottom'>(() => (isMobile.value ? 'bottom' : 'right'));

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

const resizing = ref(false);
let startX = 0;
let startY = 0;
let startW = 0;
let startH = 0;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function onResizeStart(e: MouseEvent) {
  resizing.value = true;
  startX = e.clientX;
  startY = e.clientY;
  startW = desktopWidth.value;
  startH = mobileHeight.value;

  window.addEventListener('mousemove', onResizing, { passive: false });
  window.addEventListener('mouseup', onResizeEnd, { passive: true });
}

function onResizing(e: MouseEvent) {
  if (!resizing.value) return;

  if (placement.value === 'right') {
    // drag handle on left edge: moving left increases width
    const dx = startX - e.clientX;
    const maxW = Math.floor(window.innerWidth * 0.7);
    desktopWidth.value = clamp(startW + dx, 260, Math.max(260, maxW));
    saveNum('atomInspector.desktopWidth', desktopWidth.value);
  }
  else {
    // bottom drawer: dragging up increases height
    const dy = startY - e.clientY;
    const maxH = Math.floor(window.innerHeight * 0.7);
    mobileHeight.value = clamp(startH + dy, 200, Math.max(200, maxH));
    saveNum('atomInspector.mobileHeight', mobileHeight.value);
  }

  e.preventDefault();
}

function onResizeEnd() {
  resizing.value = false;
  window.removeEventListener('mousemove', onResizing);
  window.removeEventListener('mouseup', onResizeEnd);
}
onBeforeUnmount(() => onResizeEnd());

/** --- Drawer styles --- */
const drawerRootStyle = {
  position: 'absolute',
};

const contentWrapperStyle = computed(() => {
  // Make it feel like a floating inspector panel instead of a full-screen drawer.
  if (placement.value === 'right') {
    return {
      top: '18%',
      height: '64%',
      right: '12px',
      borderRadius: '10px',
      overflow: 'hidden',
      boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
    } as Record<string, any>;
  }
  return {
    left: '0',
    right: '0',
    borderRadius: '10px 10px 0 0',
    overflow: 'hidden',
    boxShadow: '0 -10px 30px rgba(0,0,0,0.12)',
  } as Record<string, any>;
});

const drawerBodyStyle = {
  padding: '10px 12px',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
};

function fmt(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '-';
  return v.toFixed(4);
}
</script>

<style scoped>
/* Mini collapsed handle */
.atom-inspector-mini {
    position: absolute;
    right: 0px;
    top: 40%;
    width: 24px;
    height: 72px;
    border-radius: 6px 0 0 6px;
    display: flex;
    padding: 24px;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    z-index: 25;
}

.mini-handle {
    font-size: 12px;
    -webkit-user-select: none;
    user-select: none;
    padding: 0 6px;
}

/* Resize handle */
.atom-inspector__resizer {
    position: absolute;
    z-index: 2;
    background: transparent;
}

.atom-inspector__resizer.is-right {
    left: 0;
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

/* Header */
.atom-inspector__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding-bottom: 8px;
    margin-bottom: 6px;
    border-bottom: 1px solid rgba(0, 0, 0, 0.06);
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
    /* avoid scrollbar overlapping text */
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
