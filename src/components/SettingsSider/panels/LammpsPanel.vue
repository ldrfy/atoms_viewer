<template>
  <a-form layout="vertical">
    <a-form-item class="settings-gap-bottom-sm">
      <ApplyLayerTargets
        :label="t('settings.panel.layers.applyTargets')"
        :apply-title="t('settings.panel.lammps.apply')"
        :show-apply="hasPendingChanges"
        :apply-disabled="!hasAnyLayer || !hasPendingChanges"
        :apply-active="hasAnyLayer && hasPendingChanges"
        :layers="lammpsTargetLayerInfos"
        :active-layer-id="activeLayerId"
        @apply="onApplyTypeMap"
      />
    </a-form-item>
    <a-form-item class="settings-gap-top-sm settings-gap-bottom-sm">
      <a-row align="middle" justify="space-between">
        <a-col>
          <span>{{ t('settings.panel.lammps.mapLabel') }}</span>
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
      <div class="settings-gap-top-sm">
        <div
          v-for="(typeId, idx) in mergedTypeIds"
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
import { QuestionCircleOutlined } from '@ant-design/icons-vue';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import { viewerApiRef } from '../../../lib/viewer/bridge';
import { useSettingsSiderContext } from '../useSettingsSiderContext';
import { ATOMIC_SYMBOL_LIST, normalizeElementSymbol } from '../../../lib/structure/chem';
import { isLammpsDumpFormat } from '../../../lib/structure/parsers/lammpsDump';
import { isLammpsDataFormat } from '../../../lib/structure/parsers/lammpsData';
import { DEFAULT_LAMMPS } from '../../../lib/viewer/settings';
import type { LammpsTypeMapRecord } from '../../../lib/viewer/settings';
import ApplyLayerTargets from '../components/ApplyLayerTargets.vue';
import { usePendingAutoApply } from '../composables/usePendingAutoApply';
import { useSettingsTargetLayers } from '../composables/useSettingsTargetLayers';

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
const confirmedMap = ref<LammpsTypeMapRecord>({});
const lastSelectedIds = ref<string[]>([]);
const { targetLayerIds } = useSettingsTargetLayers({
  selectedLayerIds,
  activeLayerId,
  layerList,
});
const { filterPending } = usePendingAutoApply(layerList);
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
const lammpsTargetLayerInfos = computed(() => {
  if (lammpsTargetLayerIds.value.length === 0) return [];
  const byId = new Map(layerList.value.map(l => [l.id, l]));
  return lammpsTargetLayerIds.value.map(id => byId.get(id)).filter(Boolean) as any[];
});

// Merge typeIds across selected target layers.
// 合并目标图层的 typeIds。
const mergedTypeIds = computed(() => {
  const ids = new Set<number>();
  for (const l of lammpsTargetLayerInfos.value) {
    const list = (l as any)?.typeIds ?? [];
    for (const tid of list) {
      const n = Number(tid);
      if (Number.isFinite(n)) ids.add(n);
    }
  }
  const merged = Array.from(ids).sort((a, b) => a - b);
  if (merged.length > 0) return merged;
  return activeLayerTypeIds.value ?? [];
});

function buildDraftMap(typeIds: number[]): LammpsTypeMapRecord {
  const next: LammpsTypeMapRecord = {};
  const targets = lammpsTargetLayerInfos.value;
  const targetCount = targets.length;
  for (const tid of typeIds) {
    const key = String(tid);
    let picked = '';
    if (targetCount > 0) {
      if (targetCount === 1) {
        const map = (targets[0] as any)?.typeMap ?? {};
        picked = normalizeElementSymbol(String(map[key] ?? '')) || '';
      }
      else {
        const vals = new Set<string>();
        for (const layer of targets) {
          const map = (layer as any)?.typeMap ?? {};
          const val = normalizeElementSymbol(String(map[key] ?? '')) || '';
          vals.add(val);
        }
        if (vals.size === 1) {
          picked = Array.from(vals)[0] ?? '';
        }
      }
    }
    if (picked) {
      next[key] = picked;
      continue;
    }
    const fromDefault = normalizeElementSymbol(String((DEFAULT_LAMMPS.data ?? {})[key] ?? '')) || '';
    next[key] = fromDefault || 'E';
  }
  return next;
}

function buildConfirmedMap(typeIds: number[]): LammpsTypeMapRecord {
  const base = confirmedMap.value ?? {};
  const next: LammpsTypeMapRecord = {};
  for (const tid of typeIds) {
    const key = String(tid);
    const val = normalizeElementSymbol(String(base[key] ?? '')) || '';
    if (val) {
      next[key] = val;
      continue;
    }
    const fromDefault = normalizeElementSymbol(String((DEFAULT_LAMMPS.data ?? {})[key] ?? '')) || '';
    next[key] = fromDefault || 'E';
  }
  return next;
}

// Resolve per-layer effective mapping for a typeId.
// 解析单层指定 typeId 的有效映射。
function resolveLayerTypeMapValue(layer: any, typeId: number): string {
  const map = (layer as any)?.typeMap ?? {};
  const raw = normalizeElementSymbol(String(map[String(typeId)] ?? '')) || '';
  if (raw) return raw;
  const fromDefault = normalizeElementSymbol(String((DEFAULT_LAMMPS.data ?? {})[String(typeId)] ?? '')) || '';
  return fromDefault || 'E';
}

// Detect if selected layers have conflicting type mappings.
// 判断选中图层是否存在映射冲突。
function hasMixedTypeMapAcrossTargets(): boolean {
  const targets = lammpsTargetLayerInfos.value;
  if (targets.length <= 1) return false;
  const typeIds = mergedTypeIds.value ?? [];
  for (const tid of typeIds) {
    let first = '';
    for (const layer of targets) {
      const cur = resolveLayerTypeMapValue(layer, tid);
      if (!first) {
        first = cur;
        continue;
      }
      if (cur !== first) return true;
    }
  }
  return false;
}

watch(
  () => [
    activeLayerId.value,
    mergedTypeIds.value,
    lammpsTargetLayerInfos.value.map(l => (l as any)?.typeMap),
    viewerApi.value?.activeLayerTypeMapApplied?.value,
  ],
  () => {
    const map = viewerApi.value?.activeLayerTypeMap.value ?? {};
    lastApplied.value = { ...map };
    if (Object.keys(confirmedMap.value ?? {}).length === 0 && Object.keys(map).length > 0) {
      confirmedMap.value = { ...map };
    }
    const hasConfirmed = Object.keys(confirmedMap.value ?? {}).length > 0;
    draftMap.value = hasConfirmed
      ? buildConfirmedMap(mergedTypeIds.value ?? [])
      : buildDraftMap(mergedTypeIds.value ?? []);
  },
  { immediate: true, deep: true },
);

function onLammpsElementChange(idx: number, v: unknown): void {
  const element = toElement(v);
  const typeIds = mergedTypeIds.value ?? [];
  const tid = typeIds[idx];
  if (!tid) return;
  draftMap.value = { ...draftMap.value, [String(tid)]: element };
}

const hasPendingChanges = computed(() => {
  const typeIds = mergedTypeIds.value ?? [];
  if (typeIds.length === 0) return false;
  // If selected layers disagree, allow applying to unify.
  // 若选中图层存在差异，则允许应用统一设置。
  if (hasMixedTypeMapAcrossTargets()) return true;
  const base = buildDraftMap(typeIds);
  for (const tid of typeIds) {
    const key = String(tid);
    const cur = String(base[key] ?? '').trim();
    const draft = String(draftMap.value[key] ?? '').trim();
    if (cur !== draft) return true;
  }
  return false;
});

function onApplyTypeMap(): void {
  const map = { ...draftMap.value };
  lastApplied.value = { ...map };
  confirmedMap.value = { ...map };
  const targets = lammpsTargetLayerIds.value;
  if (targets.length === 0) return;
  viewerApi.value?.applyTypeMapToLayerIds?.(map, targets);
  viewerApi.value?.refreshColorMap?.({ layerIds: targets });
  // Sync draft with latest mapping after apply.
  // 应用后同步草稿映射。
  draftMap.value = buildConfirmedMap(mergedTypeIds.value ?? []);
}

// Auto-apply current LAMMPS mapping to newly selected layers.
// 将当前 LAMMPS 映射自动应用到新选中的图层。
watch(
  targetLayerIds,
  (nextIds) => {
    const prev = new Set(lastSelectedIds.value);
    const added = nextIds.filter(id => !prev.has(id));
    lastSelectedIds.value = [...nextIds];
    if (added.length === 0) return;
    if (hasPendingChanges.value) return;
    const addedLammps = layerList.value
      .filter(l => added.includes(l.id))
      .filter((l) => {
        const format = l.sourceFormat ?? '';
        return isLammpsDumpFormat(format) || isLammpsDataFormat(format);
      })
      .map(l => l.id);
    const toApply = filterPending(addedLammps);
    if (toApply.length === 0) return;
    const map = Object.keys(confirmedMap.value ?? {}).length > 0
      ? { ...confirmedMap.value }
      : { ...draftMap.value };
    viewerApi.value?.applyTypeMapToLayerIds?.(map, toApply);
    viewerApi.value?.refreshColorMap?.({ layerIds: toApply });
  },
  { immediate: true },
);

</script>

<style scoped>
.lammps-header-right {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  min-width: 0;
}
</style>
