<template>
  <div
    ref="padRef"
    class="pan-pad"
    :style="panelStyle"
  >
    <a-space direction="vertical" size="small" class="pan-stack">
      <div class="pan-pad-grid">
        <span />
        <a-button
          size="small"
          type="text"
          :aria-label="t('viewer.pan.up')"
          :title="t('viewer.pan.up')"
          @click="handlePan('up')"
        >
          <CaretUpOutlined />
        </a-button>
        <span />
        <a-button
          size="small"
          type="text"
          :aria-label="t('viewer.pan.left')"
          :title="t('viewer.pan.left')"
          @click="handlePan('left')"
        >
          <CaretLeftOutlined />
        </a-button>
        <a-button
          size="small"
          type="text"
          :aria-label="isPanned ? t('viewer.pan.center') + '（已平移）' : t('viewer.pan.center')"
          :title="isPanned ? t('viewer.pan.center') + '（已平移）' : t('viewer.pan.center')"
          @click="handleReset"
        >
          <AimOutlined :class="{ 'pan-icon--active': isPanned }" />
        </a-button>
        <a-button
          size="small"
          type="text"
          :aria-label="t('viewer.pan.right')"
          :title="t('viewer.pan.right')"
          @click="handlePan('right')"
        >
          <CaretRightOutlined />
        </a-button>
        <span />
        <a-button
          size="small"
          type="text"
          :aria-label="t('viewer.pan.down')"
          :title="t('viewer.pan.down')"
          @click="handlePan('down')"
        >
          <CaretDownOutlined />
        </a-button>
        <span />
        <a-typography-text v-if="targetLabel" type="secondary" class="pan-target-label">
          {{ targetLabel }}
        </a-typography-text>
      </div>
    </a-space>
  </div>
</template>

<script setup lang="ts">
import {
  AimOutlined,
  CaretDownOutlined,
  CaretLeftOutlined,
  CaretRightOutlined,
  CaretUpOutlined,
} from '@ant-design/icons-vue';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';

type PanDir = 'left' | 'right' | 'up' | 'down';

const props = defineProps<{
  onPan: (dir: PanDir) => void;
  onReset: () => void;
  targetSide: 'left' | 'right' | 'single';
  isPanned: boolean;
}>();

const { t } = useI18n();
const padRef = ref<HTMLElement | null>(null);
const isMobile = ref(false);
const mobileBottom = ref(12);
let resizeTimer: number | null = null;
let padResizeObserver: ResizeObserver | null = null;

function handlePan(dir: PanDir): void {
  props.onPan(dir);
}

function handleReset(): void {
  props.onReset();
}

const targetLabel = computed(() => {
  if (props.targetSide === 'left') return t('viewer.pan.sideLeft');
  if (props.targetSide === 'right') return t('viewer.pan.sideRight');
  return '';
});

const panelStyle = computed(() => {
  if (!isMobile.value) return undefined;
  return {
    right: '12px',
    bottom: `${mobileBottom.value}px`,
  };
});

function onResize(): void {
  updateMobileOffset();
  updatePadWidth();
  if (resizeTimer) window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(updateMobileOffset, 120);
}

function updateMobileOffset(): void {
  isMobile.value = window.innerWidth <= 768;
  mobileBottom.value = 12;
}

function updatePadWidth(): void {
  const el = padRef.value;
  if (!el) return;
  const width = Math.ceil(el.getBoundingClientRect().width);
  document.documentElement.style.setProperty('--pan-pad-width', `${width}px`);
}

function attachPadObserver(): void {
  if (padResizeObserver) {
    padResizeObserver.disconnect();
    padResizeObserver = null;
  }
  const el = padRef.value;
  if (!el || typeof ResizeObserver === 'undefined') return;
  padResizeObserver = new ResizeObserver(() => updatePadWidth());
  padResizeObserver.observe(el);
}

onMounted(() => {
  updateMobileOffset();
  updatePadWidth();
  attachPadObserver();
  window.addEventListener('resize', onResize);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize);
  if (padResizeObserver) padResizeObserver.disconnect();
  if (resizeTimer) window.clearTimeout(resizeTimer);
  document.documentElement.style.removeProperty('--pan-pad-width');
});
</script>

<style scoped>
.pan-pad {
  position: fixed;
  z-index: 210;
  pointer-events: auto;
  display: inline-flex;
  right: 12px;
  bottom: 12px;
}

.pan-stack {
  align-items: center;
}

.pan-pad-grid {
  display: grid;
  grid-template-columns: repeat(3, auto);
  grid-template-rows: repeat(3, auto);
  gap: 6px;
  align-items: center;
  justify-items: center;
  position: relative;
}

.pan-icon--active {
  color: var(--ant-primary-color, #1677ff);
}

.pan-target-label {
  position: absolute;
  right: 12px;
  bottom: 6px;
  font-size: 12px;
  line-height: 1;
}

</style>
