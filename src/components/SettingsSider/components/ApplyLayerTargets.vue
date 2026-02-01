<template>
  <a-row align="middle" justify="space-between">
    <a-col>
      <a-space :size="6" align="center" class="apply-targets-header">
        <a-typography-text type="secondary">
          {{ label }}:
        </a-typography-text>
        <a-tooltip :title="showApply ? applyTitle : undefined">
          <a-button
            type="text"
            :disabled="applyDisabled"
            :aria-label="applyTitle"
            :title="applyTitle"
            class="apply-targets-button"
            :class="{ 'is-hidden': !showApply }"
            @click="onApply"
          >
            <CheckCircleOutlined :class="{ 'apply-targets-icon': applyActive }" />
          </a-button>
        </a-tooltip>
      </a-space>
    </a-col>
  </a-row>
  <a-space :size="6" class="apply-targets-row settings-flex-wrap">
    <template v-if="orderedLayers.length > 0">
      <a-tooltip
        v-for="l in orderedLayers"
        :key="l.id"
        :title="l.source?.fileName || l.id"
      >
        <a-tag
          class="settings-tag-full"
          :color="shouldHighlightAll || (highlightActive && l.id === activeLayerId) ? activeTagColor : undefined"
        >
          <span class="settings-tag-ellipsis">
            {{ l.name || l.source?.fileName || l.id }}
          </span>
        </a-tag>
      </a-tooltip>
    </template>
    <a-typography-text v-else type="secondary">
      {{ emptyText }}
    </a-typography-text>
  </a-space>
</template>

<script setup lang="ts">
import { CheckCircleOutlined } from '@ant-design/icons-vue';
import { computed } from 'vue';

type LayerInfoLike = {
  id: string;
  name?: string;
  source?: { fileName?: string };
};

const emit = defineEmits<{
  (e: 'apply'): void;
}>();

const props = withDefaults(defineProps<{
  label: string;
  applyTitle: string;
  showApply?: boolean;
  applyDisabled?: boolean;
  applyActive?: boolean;
  layers: LayerInfoLike[];
  activeLayerId?: string | null;
  highlightActive?: boolean;
  highlightAll?: boolean;
  activeTagColor?: string;
  emptyText?: string;
}>(), {
  showApply: true,
  applyDisabled: false,
  applyActive: false,
  activeLayerId: null,
  highlightActive: true,
  highlightAll: false,
  activeTagColor: 'blue',
  emptyText: '-',
});

// Order selected layers with active first.
// 选中图层排序：当前图层置顶。
const orderedLayers = computed(() => {
  const list = props.layers ?? [];
  if (list.length <= 1) return list;
  const activeId = props.activeLayerId;
  if (!activeId) return list;
  const active = list.find(l => l.id === activeId);
  if (!active) return list;
  return [active, ...list.filter(l => l.id !== activeId)];
});

const shouldHighlightAll = computed(() => props.highlightAll || orderedLayers.value.length === 1);

// Emit apply click.
// 触发应用事件。
function onApply(): void {
  if (!props.showApply) return;
  emit('apply');
}
</script>

<style scoped>
.apply-targets-header :deep(.ant-space-item) {
  min-height: 24px;
}

.apply-targets-button {
  padding: 0 12px;
  min-height: 24px;
}

.apply-targets-button.is-hidden {
  visibility: hidden;
}

.apply-targets-row {
  margin-top: 8px;
  margin-bottom: 8px;
  margin-left: 2px;
}

.apply-targets-icon {
  color: var(--ant-colorPrimary, #1677ff);
}
</style>
