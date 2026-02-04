<template>
  <div v-if="hasModelOrParseError" class="parse-inline">
    <a-popover
      v-model:open="open"
      :trigger="['click']"
      placement="bottomLeft"
      :overlay-class-name="'parse-popover'"
      :destroy-tooltip-on-hide="true"
    >
      <template #content>
        <div class="parse-pop-content">
          <div class="parse-pop-title">
            {{ t("viewer.parse.mode") }}
          </div>

          <a-space direction="vertical" :size="6" class="parse-full-width">
            <a-select
              v-model:value="parseModeModel"
              :aria-label="t('viewer.parse.mode')"
              :title="t('viewer.parse.mode')"
              :options="parseModeOptions"
              class="parse-full-width"
            />

            <a-alert
              v-if="ctx.parseInfo.success === false"
              type="error"
              show-icon
              class="parse-alert"
              :description="ctx.parseInfo.errorMsg || '-'"
            />

            <a-descriptions
              size="small"
              :column="1"
              class="parse-desc"
              bordered
              :items="parseDescItems"
            />
          </a-space>
        </div>
      </template>

      <a-button
        class="btn-icon parse-handle"
        type="text"
        :aria-label="t('viewer.parse.mode')"
        :title="t('viewer.parse.mode')"
      >
        <ExclamationCircleOutlined />
      </a-button>
    </a-popover>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, unref, watch, h } from 'vue';
import { useI18n } from 'vue-i18n';
import { Tag } from 'antdv-next';
import type { ParseMode } from '../../../lib/structure/parse';
import { buildParseModeOptions } from '../../../lib/structure/parseOptions';
import { ExclamationCircleOutlined } from '@antdv-next/icons';

import type { ParseCtx } from '../ctx';

const props = defineProps<{ ctx: ParseCtx }>();
const { t } = useI18n();

const open = ref(false);
const hasModel = computed(() => !!unref(props.ctx.hasModel));
const hasModelOrParseError = computed(() =>
  hasModel.value || props.ctx.parseInfo?.success === false,
);

const parseModeModel = computed<ParseMode>({
  get: () => props.ctx.parseMode.value,
  set: v => props.ctx.setParseMode(v),
});

const parseModeOptions = computed(() => buildParseModeOptions(t));

function formatBytes(size: number | null | undefined): string {
  // 文件大小格式化
  // Format file size
  if (size == null || !Number.isFinite(size)) return '-';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let val = Math.max(0, Number(size));
  let idx = 0;
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024;
    idx += 1;
  }
  const text = idx === 0 ? `${Math.round(val)}` : val.toFixed(2);
  return `${text} ${units[idx]}`;
}

// 解析信息描述项
// Parse info description items.
const parseDescItems = computed(() => {
  const items = [
    {
      label: t('viewer.parse.format'),
      content: h(Tag, null, { default: () => props.ctx.parseInfo.format || '-' }),
    },
    {
      label: t('viewer.parse.file'),
      content: h('span', { class: 'parse-filename' }, props.ctx.parseInfo.fileName || '-'),
    },
    {
      label: t('viewer.parse.fileSize'),
      content: formatBytes(props.ctx.parseInfo.fileSize),
    },
    {
      label: t('viewer.parse.storedSize'),
      content: formatBytes(props.ctx.parseInfo.storedSize),
    },
    {
      label: t('viewer.parse.atoms'),
      content: props.ctx.parseInfo.atomCount,
    },
  ];
  if ((props.ctx.parseInfo.frameCount ?? 0) > 1) {
    items.push({
      label: t('viewer.parse.frames'),
      content: props.ctx.parseInfo.frameCount,
    });
  }
  return items;
});

/** 解析出错时自动打开 popover（原来在 index.vue 的 watch） */
watch(
  () => props.ctx.parseInfo?.errorSeq,
  (n, prev) => {
    const nn = n ?? 0;
    const pp = prev ?? 0;
    if (nn > pp) open.value = true;
  },
);
</script>

<style>

.parse-overlay {
    position: absolute;
    left: 18px;
    top: 52%;
    transform: translateY(-50%);
    z-index: 25;
    pointer-events: auto;
}
.parse-inline {
    display: inline-flex;
    align-items: center;
    pointer-events: auto;
}

.parse-full-width {
    width: 100%;
}

/* 把手按钮 */
.parse-handle {
    width: 20px;
    height: 20px;
    padding: 0;
    font-size: 13px;
}

/* Popover 容器的宽度控制：桌面固定，手机不溢出 */
.parse-popover .ant-popover-inner {
    width: min(320px, calc(100vw - 24px));
}

.parse-pop-content {
    width: 100%;
    /* Prevent scroll-chain to page (avoid triggering pull-to-refresh when swiping inside popover) */
    max-height: min(60vh, 420px);
    overflow: auto;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
    touch-action: pan-y;
}

.parse-pop-title {
    font-weight: 600;
    margin-bottom: 8px;
}

.parse-popover .parse-alert {
    display: flex;
    align-items: center;
    padding: 4px 8px;
    font-size: 12px;
}

.parse-popover .parse-alert .ant-alert-icon {
    font-size: 12px;
}

.parse-popover .parse-alert .ant-alert-description {
    font-size: 12px;
    line-height: 1.3;
}
</style>
