<template>
  <a-form layout="vertical">
    <a-form-item class="settings-gap-top-md">
      <a-row align="middle" justify="space-between">
        <a-col>
          <a-space :size="6" align="center">
            <span>{{ t('settings.panel.lammps.mapLabel') }}</span>
            <a-tooltip :title="t('settings.panel.lammps.apply')" placement="left">
              <a-button
                type="text"
                :disabled="!hasAnyLayer"
                :aria-label="t('settings.panel.lammps.apply')"
                :title="t('settings.panel.lammps.apply')"
                @click="onApplyTypeMap"
              >
                <CheckCircleOutlined :class="{ 'lammps-apply-icon': hasAnyLayer }" />
              </a-button>
            </a-tooltip>
          </a-space>
        </a-col>
        <a-col :flex="1" class="lammps-header-right">
          <a-tooltip :title="t('settings.panel.lammps.hint')" placement="left">
            <a-button
              type="text"
              :aria-label="t('settings.panel.lammps.hint')"
              :title="t('settings.panel.lammps.hint')"
            >
              <QuestionCircleOutlined />
            </a-button>
          </a-tooltip>
        </a-col>
      </a-row>
      <a-space :size="6" class="lammps-layer-row settings-flex-wrap">
        <a-typography-text type="secondary">
          {{ t('settings.panel.layers.applyTargets') }}:
        </a-typography-text>
        <template v-if="targetLayerInfos.length > 0">
          <a-tooltip
            v-for="l in targetLayerInfos"
            :key="l.id"
            :title="l.source?.fileName || l.id"
          >
            <a-tag class="settings-tag-full">
              <span class="settings-tag-ellipsis">
                {{ l.name || l.source?.fileName || l.id }}
              </span>
            </a-tag>
          </a-tooltip>
        </template>
        <a-typography-text v-else type="secondary">
          -
        </a-typography-text>
      </a-space>
      <div class="settings-gap-top-sm">
        <div
          v-for="(typeId, idx) in activeLayerTypeIds"
          :key="`${typeId}-${idx}`"
          class="settings-gap-bottom-sm"
        >
          <a-row align="middle" :gutter="8">
            <a-col :span="4">
              <a-tag class="settings-lammps-type">
                {{ typeId }}
              </a-tag>
            </a-col>

            <a-col :span="20">
              <a-select
                show-search
                :aria-label="t('settings.panel.lammps.elementPlaceholder')"
                :title="t('settings.panel.lammps.elementPlaceholder')"
                :value="draftMap[String(typeId)] || 'E'"
                class="settings-full-width"
                :placeholder="t('settings.panel.lammps.elementPlaceholder')"
                :options="atomicOptions"
                :filter-option="filterAtomicOption"
                @change="onLammpsElementChange(idx, $event)"
              />
            </a-col>
          </a-row>
        </div>
      </div>
    </a-form-item>
  </a-form>
</template>

<script setup lang="ts">
import { CheckCircleOutlined, QuestionCircleOutlined } from '@ant-design/icons-vue';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import { viewerApiRef } from '../../../lib/viewer/bridge';
import { useSettingsSiderContext } from '../useSettingsSiderContext';
import { ATOMIC_SYMBOL_LIST, normalizeElementSymbol } from '../../../lib/structure/chem';
import { isLammpsDumpFormat } from '../../../lib/structure/parsers/lammpsDump';
import { isLammpsDataFormat } from '../../../lib/structure/parsers/lammpsData';
import type { LammpsTypeMapRecord } from '../../../lib/viewer/settings';

const { t } = useI18n();
const { hasAnyLayer, selectedLayerIds } = useSettingsSiderContext();

const viewerApi = computed(() => viewerApiRef.value);
const layerList = computed(() => viewerApi.value?.layers.value ?? []);
const activeLayerId = computed(() => viewerApi.value?.activeLayerId.value ?? null);

const activeLayerTypeIds = computed(() => viewerApi.value?.activeLayerTypeIds.value ?? []);

const draftMap = ref<LammpsTypeMapRecord>({});

const atomicOptions = computed(() =>
  ATOMIC_SYMBOL_LIST.map((symRaw) => {
    const sym = normalizeElementSymbol(symRaw) || 'E';
    return { value: sym, label: sym === 'E' ? 'E (Unknown)' : sym };
  }),
);

function filterAtomicOption(
  input: string,
  option?: { value?: unknown; label?: unknown },
): boolean {
  const q = (input ?? '').trim().toLowerCase();
  if (!q) return true;
  const value = String(option?.value ?? '').toLowerCase();
  const label = String(option?.label ?? '').toLowerCase();
  return value.includes(q) || label.includes(q);
}

function toElement(v: unknown): string {
  return normalizeElementSymbol(String(v ?? '')) || 'E';
}

const lastApplied = ref<LammpsTypeMapRecord | null>(null);
watch(
  () => [activeLayerId.value, activeLayerTypeIds.value, viewerApi.value?.activeLayerTypeMapApplied?.value],
  () => {
    const map = viewerApi.value?.activeLayerTypeMap.value ?? {};
    lastApplied.value = { ...map };
    draftMap.value = { ...map };
  },
  { immediate: true },
);

// Resolve target layers: selection first, otherwise active layer.
// 解析目标图层：优先选中列表，否则回退到当前图层。
const targetLayerIds = computed(() => {
  const picked = selectedLayerIds.value.filter(Boolean);
  if (picked.length > 0) return picked;
  return activeLayerId.value ? [activeLayerId.value] : [];
});
// Filter targets to LAMMPS-compatible layers only.
// 仅保留 LAMMPS 相关图层作为目标。
const lammpsTargetLayerIds = computed(() => {
  const idSet = new Set(targetLayerIds.value);
  return layerList.value
    .filter(l => idSet.has(l.id))
    .filter((l) => {
      const format = l.sourceFormat ?? '';
      return isLammpsDumpFormat(format) || isLammpsDataFormat(format);
    })
    .map(l => l.id);
});
const targetLayerInfos = computed(() => {
  if (lammpsTargetLayerIds.value.length === 0) return [];
  const byId = new Map(layerList.value.map(l => [l.id, l]));
  return lammpsTargetLayerIds.value.map(id => byId.get(id)).filter(Boolean) as any[];
});

function onLammpsElementChange(idx: number, v: unknown): void {
  const element = toElement(v);
  const typeIds = activeLayerTypeIds.value ?? [];
  const tid = typeIds[idx];
  if (!tid) return;
  draftMap.value = { ...draftMap.value, [String(tid)]: element };
}

function onApplyTypeMap(): void {
  const map = { ...draftMap.value };
  lastApplied.value = { ...map };
  const targets = lammpsTargetLayerIds.value;
  if (targets.length === 0) return;
  viewerApi.value?.applyTypeMapToLayerIds?.(map, targets);
}

</script>

<style scoped>
.lammps-apply-icon {
  color: var(--ant-colorPrimary, #1677ff);
}

.lammps-header-right {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  min-width: 0;
}

.lammps-layer-row {
  margin-top: 8px;
  margin-bottom: 8px;
  margin-left: 2px;
}
</style>
