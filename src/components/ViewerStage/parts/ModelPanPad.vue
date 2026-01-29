<template>
  <div class="pan-pad" role="group" aria-label="pan">
    <a-button
      class="pan-btn pan-up"
      size="small"
      :aria-label="t('viewer.pan.up')"
      :title="t('viewer.pan.up')"
      @click="handlePan('up')"
    >
      <UpOutlined />
    </a-button>
    <a-button
      class="pan-btn pan-left"
      size="small"
      :aria-label="t('viewer.pan.left')"
      :title="t('viewer.pan.left')"
      @click="handlePan('left')"
    >
      <LeftOutlined />
    </a-button>
    <a-button
      class="pan-btn pan-center"
      size="small"
      :aria-label="t('viewer.pan.center')"
      :title="t('viewer.pan.center')"
      @click="handleReset"
    >
      <AimOutlined />
    </a-button>
    <a-button
      class="pan-btn pan-right"
      size="small"
      :aria-label="t('viewer.pan.right')"
      :title="t('viewer.pan.right')"
      @click="handlePan('right')"
    >
      <RightOutlined />
    </a-button>
    <a-button
      class="pan-btn pan-down"
      size="small"
      :aria-label="t('viewer.pan.down')"
      :title="t('viewer.pan.down')"
      @click="handlePan('down')"
    >
      <DownOutlined />
    </a-button>
    <div class="pan-step">
      <span class="pan-step__label">{{ t('viewer.pan.step') }}</span>
      <a-input-number
        size="small"
        :min="0.2"
        :max="5"
        :step="0.1"
        :value="panStepScale"
        :aria-label="t('viewer.pan.step')"
        :title="t('viewer.pan.step')"
        @change="onStepChange"
      />
    </div>
    <div class="pan-target">
      {{ t('viewer.pan.target') }}: {{ targetLabel }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { AimOutlined, DownOutlined, LeftOutlined, RightOutlined, UpOutlined } from '@ant-design/icons-vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

type PanDir = 'left' | 'right' | 'up' | 'down';

const props = defineProps<{
  onPan: (dir: PanDir) => void;
  onReset: () => void;
  panStepScale: number;
  onStepScaleChange: (v: number) => void;
  targetSide: 'left' | 'right' | 'single';
}>();

const { t } = useI18n();

function handlePan(dir: PanDir): void {
  props.onPan(dir);
}

function handleReset(): void {
  props.onReset();
}

function onStepChange(v: number | null): void {
  if (typeof v !== 'number' || Number.isNaN(v)) return;
  props.onStepScaleChange(v);
}

const targetLabel = computed(() => {
  if (props.targetSide === 'left') return t('viewer.pan.sideLeft');
  if (props.targetSide === 'right') return t('viewer.pan.sideRight');
  return t('viewer.pan.sideSingle');
});
</script>

<style scoped>
.pan-pad {
  position: fixed;
  right: 16px;
  bottom: 18px;
  z-index: 210;
  display: grid;
  grid-template-columns: 28px 28px 28px;
  grid-template-rows: 28px 28px 28px auto auto;
  gap: 6px;
  padding: 8px;
  border-radius: 10px;
  background: var(--glass-panel-bg);
  border: 1px solid rgba(0, 0, 0, 0.1);
  backdrop-filter: blur(var(--glass-panel-blur));
  -webkit-backdrop-filter: blur(var(--glass-panel-blur));
  pointer-events: auto;
}

:root[data-theme="dark"] .pan-pad {
  border-color: rgba(255, 255, 255, 0.14);
}

.pan-btn {
  width: 28px;
  height: 28px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.pan-up {
  grid-column: 2;
  grid-row: 1;
}

.pan-left {
  grid-column: 1;
  grid-row: 2;
}

.pan-right {
  grid-column: 3;
  grid-row: 2;
}

.pan-down {
  grid-column: 2;
  grid-row: 3;
}

.pan-center {
  grid-column: 2;
  grid-row: 2;
}

.pan-step {
  grid-column: 1 / span 3;
  grid-row: 4;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.pan-step__label {
  opacity: 0.75;
}

.pan-target {
  grid-column: 1 / span 3;
  grid-row: 5;
  font-size: 12px;
  opacity: 0.75;
}

@media (max-width: 768px) {
  .pan-pad {
    bottom: 90px;
  }
}
</style>
