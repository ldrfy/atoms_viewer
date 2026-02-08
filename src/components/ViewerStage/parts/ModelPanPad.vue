<template>
  <div
    ref="padRef"
    class="pan-pad"
    :style="panelStyle"
  >
    <a-row
      :gutter="[6, 0]"
      align="middle"
      justify="center"
      style="width: 114px; height: 114px;"
    >
      <a-col :span="8" />
      <a-col :span="8" class="pan-col-cell">
        <a-button
          size="small"
          variant="link"
          color="default"
          :title="t('viewer.pan.up')"
          @click="handlePan('up')"
        >
          <CaretUpOutlined />
        </a-button>
      </a-col>
      <a-col :span="8" />

      <a-col :span="8" class="pan-col-cell">
        <a-button
          size="small"
          variant="link"
          color="default"
          :title="t('viewer.pan.left')"
          @click="handlePan('left')"
        >
          <CaretLeftOutlined />
        </a-button>
      </a-col>
      <a-col :span="8" class="pan-col-cell">
        <a-button
          size="small"
          variant="link"
          color="default"
          :title="isPanned ? t('viewer.pan.center') + '（已平移）' : t('viewer.pan.center')"
          @click="handleReset"
        >
          <AimOutlined :class="{ 'pan-icon--active': isPanned }" />
        </a-button>
      </a-col>
      <a-col :span="8" class="pan-col-cell">
        <a-button
          size="small"
          variant="link"
          color="default"
          :title="t('viewer.pan.right')"
          @click="handlePan('right')"
        >
          <CaretRightOutlined />
        </a-button>
      </a-col>

      <a-col :span="8" class="pan-col-cell">
        <a-typography-text
          v-if="targetLabelSide === 'left'"
          type="secondary"
          class="pan-target-label"
          ellipsis
        >
          {{ targetLabel }}
        </a-typography-text>
      </a-col>
      <a-col :span="8" class="pan-col-cell">
        <a-button
          size="small"
          variant="link"
          color="default"
          :title="t('viewer.pan.down')"
          @click="handlePan('down')"
        >
          <CaretDownOutlined />
        </a-button>
      </a-col>
      <a-col :span="8" class="pan-col-cell">
        <a-typography-text
          v-if="targetLabelSide === 'right'"
          type="secondary"
          class="pan-target-label"
          ellipsis
        >
          {{ targetLabel }}
        </a-typography-text>
      </a-col>
    </a-row>
  </div>
</template>

<script setup lang="ts">
import {
  AimOutlined,
  CaretDownOutlined,
  CaretLeftOutlined,
  CaretRightOutlined,
  CaretUpOutlined,
} from '@antdv-next/icons';
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

// 中文：控制底部标签显示在哪一侧（左/右）
// English: Control which side (left/right) the bottom label should appear on
const targetLabelSide = computed<'left' | 'right' | ''>(() => {
  if (props.targetSide === 'left') return 'left';
  if (props.targetSide === 'right') return 'right';
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

.pan-icon--active {
  color: var(--ant-primary-color, #1677ff);
}

.pan-col-cell {
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.pan-target-label {
  max-width: 30px;
  text-align: center;
  font-size: 12px;
  line-height: 1;
}

</style>
