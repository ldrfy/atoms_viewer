<template>
  <a-card
    class="pan-pad"
    size="small"
    :bordered="false"
    :body-style="{ padding: '10px 12px' }"
    role="group"
    aria-label="pan"
  >
    <div class="pan-pad__body">
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
        <a-typography-text class="pan-step__label" type="secondary">
          {{ t('viewer.pan.step') }}
        </a-typography-text>
        <a-input-number
          size="small"
          :min="0.2"
          :max="5"
          :step="0.1"
          :value="panStepScale"
          class="pan-step__input"
          :aria-label="t('viewer.pan.step')"
          :title="t('viewer.pan.step')"
          @change="onStepChange"
        />
      </div>
      <div class="pan-target">
        <a-typography-text type="secondary">
          {{ t('viewer.pan.target') }}: {{ targetLabel }}
        </a-typography-text>
      </div>
    </div>
  </a-card>
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
  padding: 0;
  border-radius: 14px;
  background: var(--glass-panel-bg);
  border: 1px solid rgba(0, 0, 0, 0.1);
  backdrop-filter: blur(var(--glass-panel-blur));
  -webkit-backdrop-filter: blur(var(--glass-panel-blur));
  pointer-events: auto;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.12);
}

:root[data-theme="dark"] .pan-pad {
  border-color: rgba(255, 255, 255, 0.14);
}

.pan-btn {
  width: 32px;
  height: 32px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
}

.pan-center {
  background: rgba(24, 144, 255, 0.12);
  border-color: rgba(24, 144, 255, 0.2);
  grid-column: 2;
  grid-row: 2;
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

.pan-step {
  grid-column: 1 / span 3;
  grid-row: 4;
  display: flex;
  align-items: center;
  gap: 6px;
}

.pan-target {
  grid-column: 1 / span 3;
  grid-row: 5;
}

.pan-step__input {
  width: 74px;
}

.pan-target {
  white-space: nowrap;
}

.pan-pad__body {
  display: grid;
  grid-template-columns: 32px 32px 32px;
  grid-template-rows: 32px 32px 32px auto auto;
  gap: 6px 8px;
}

@media (max-width: 768px) {
  .pan-pad {
    right: 8px;
    bottom: 148px;
    border-radius: 12px;
    box-shadow: 0 8px 18px rgba(0, 0, 0, 0.12);
  }

  .pan-pad__body {
    grid-template-columns: 30px 30px 30px;
    grid-template-rows: 30px 30px 30px auto auto;
    gap: 6px;
  }

  .pan-btn {
    width: 30px;
    height: 30px;
    border-radius: 9px;
  }

  .pan-step__input {
    width: 64px;
  }
}
</style>
