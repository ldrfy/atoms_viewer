<template>
  <div v-if="hasModel" class="parse-overlay">
    <a-popover
      v-model:open="open"
      trigger="click"
      placement="right"
      :overlay-class-name="'parse-popover'"
      :destroy-tooltip-on-hide="true"
    >
      <template #content>
        <div class="parse-pop-content">
          <div class="parse-pop-title">
            {{ t("viewer.parse.mode") }}
          </div>

          <a-space direction="vertical" :size="6" style="width: 100%">
            <a-select
              v-model:value="parseModeModel"
              size="small"
              :aria-label="t('viewer.parse.mode')"
              :title="t('viewer.parse.mode')"
              :options="parseModeOptions"
              style="width: 100%"
            />

            <a-alert
              v-if="ctx.parseInfo.success === false"
              type="error"
              show-icon
              :description="ctx.parseInfo.errorMsg || '-'"
            />

            <a-descriptions
              size="small"
              :column="1"
              class="parse-desc"
              bordered
            >
              <a-descriptions-item :label="t('viewer.parse.format')">
                <a-tag>{{ ctx.parseInfo.format || "-" }}</a-tag>
              </a-descriptions-item>

              <a-descriptions-item :label="t('viewer.parse.file')">
                <span class="parse-filename">{{ ctx.parseInfo.fileName || "-" }}</span>
              </a-descriptions-item>

              <a-descriptions-item :label="t('viewer.parse.atoms')">
                {{ ctx.parseInfo.atomCount }}
              </a-descriptions-item>

              <a-descriptions-item
                v-if="(ctx.parseInfo.frameCount ?? 0) > 1"
                :label="t('viewer.parse.frames')"
              >
                {{ ctx.parseInfo.frameCount }}
              </a-descriptions-item>
            </a-descriptions>
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
import { computed, ref, unref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ParseMode } from '../../../lib/structure/parse';
import { ExclamationCircleOutlined } from '@ant-design/icons-vue';

import type { ParseCtx } from '../ctx';

const props = defineProps<{ ctx: ParseCtx }>();
const { t } = useI18n();

const open = ref(false);
const hasModel = computed(() => !!unref(props.ctx.hasModel));

const parseModeModel = computed<ParseMode>({
  get: () => props.ctx.parseMode.value,
  set: v => props.ctx.setParseMode(v),
});

const parseModeOptions = computed(() => [
  { value: 'auto', label: t('viewer.parse.modeOptions.auto') },
  { value: 'xyz', label: t('viewer.parse.modeOptions.xyz') },
  { value: 'pdb', label: t('viewer.parse.modeOptions.pdb') },
  { value: 'lammpsdump', label: t('viewer.parse.modeOptions.lammpsdump') },
  { value: 'lammpsdata', label: t('viewer.parse.modeOptions.lammpsdata') },
]);

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
