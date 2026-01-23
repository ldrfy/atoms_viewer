<template>
  <div class="settings-header">
    <!-- Mobile only: grab handle -->
    <div
      v-if="showGrab"
      class="settings-grab"
      aria-label="resize"
      :title="t('common.resize')"
      role="button"
      tabindex="0"
      @pointerdown.stop.prevent="onResizeStart"
    >
      <div class="settings-grab-bar" />
    </div>

    <div class="settings-header-row">
      <a-typography-text strong>
        {{ t('settings.title') }}
      </a-typography-text>

      <a-button
        type="text"
        size="small"
        aria-label="close"
        :title="t('common.close')"
        @click="emit('close')"
      >
        <CloseOutlined />
      </a-button>
    </div>
  </div>

  <div class="settings-body">
    <a-collapse
      v-model:active-key="activeKeyProxy"
      ghost
      class="settings-collapse"
      expand-icon-position="end"
    >
      <a-collapse-panel
        v-for="p in panels"
        :key="p.key"
      >
        <template #header>
          <span class="settings-panel-header">
            <component :is="p.icon" class="settings-panel-icon" />
            <a-typography-text strong>
              {{ t(p.headerKey) }}
            </a-typography-text>
            <span v-if="isPanelDirty(p.key)" class="settings-panel-dirty" aria-hidden="true" />
          </span>
        </template>
        <component :is="p.comp" />
      </a-collapse-panel>
    </a-collapse>

    <div class="settings-build-info">
      <a-typography-text type="secondary" class="settings-text-secondary">
        {{ t('settings.buildTime') }} {{ buildTimeText }}
      </a-typography-text>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, provide, reactive, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  AppstoreOutlined,
  BgColorsOutlined,
  CloseOutlined,
  EyeOutlined,
  FolderOpenOutlined,
  SettingOutlined,
  SlidersOutlined,
  SwapOutlined,
  SyncOutlined,
} from '@ant-design/icons-vue';

import FilesPanel from './panels/FilesPanel.vue';
import LayersPanel from './panels/LayersPanel.vue';
import ViewPanel from './panels/ViewPanel.vue';
import RotatePanel from './panels/RotatePanel.vue';
import LammpsPanel from './panels/LammpsPanel.vue';
import ColorsPanel from './panels/ColorsPanel.vue';
import DetailsPanel from './panels/DetailsPanel.vue';
import OtherPanel from './panels/OtherPanel.vue';
import {
  DEFAULT_SETTINGS,
  DEFAULT_LAYER_DISPLAY,
} from '../../lib/viewer/settings';
import type { AtomTypeColorMapItem } from '../../lib/viewer/settings';
import { useSettingsSiderContext } from './useSettingsSiderContext';
import { settingsSiderDirtyContextKey, settingsSiderDerivedContextKey } from './context';
import { viewerApiRef } from '../../lib/viewer/bridge';
import { APP_BUILD_TIME } from '../../lib/appMeta';
import { isLammpsDumpFormat } from '../../lib/structure/parsers/lammpsDump';
import { isLammpsDataFormat } from '../../lib/structure/parsers/lammpsData';
import { getVisualStylePreset } from '../../lib/viewer/visualStyles';
import { getElementColorHex } from '../../lib/structure/chem';
import { getAtomTypeColorKey } from '../ViewerStage/colorMap';
import { PANEL_KEYS, PANEL_HEADER_KEYS } from '../../lib/viewer/panelKeys';

const props = withDefaults(
  defineProps<{
    showGrab?: boolean;
    activeKey: string[];
  }>(),
  {
    showGrab: false,
  },
);

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'resize-start', ev: PointerEvent): void;
  (e: 'update:activeKey', v: string[]): void;
}>();

const { t, locale } = useI18n();
const { settings } = useSettingsSiderContext();

const viewerApi = computed(() => viewerApiRef.value);
const layerList = computed(() => viewerApi.value?.layers.value ?? []);
const activeLayerId = computed(() => viewerApi.value?.activeLayerId.value ?? null);
const activeLayerInfo = computed(() => {
  const id = activeLayerId.value;
  if (!id) return null;
  return layerList.value.find(l => l.id === id) ?? null;
});
const activeLayerIsLammps = computed(() => {
  const format = activeLayerInfo.value?.sourceFormat ?? '';
  return isLammpsDumpFormat(format) || isLammpsDataFormat(format);
});

const panelDirtyFlags = reactive<Record<string, boolean>>({});
provide(settingsSiderDirtyContextKey, {
  setPanelDirty: (key: string, dirty: boolean) => {
    panelDirtyFlags[key] = dirty;
  },
});

const filesDirty = computed(() => {
  const exportScale = settings.value.exportPngScale ?? DEFAULT_SETTINGS.exportPngScale;
  const exportTransparent = settings.value.exportPngTransparent ?? DEFAULT_SETTINGS.exportPngTransparent;
  const cacheRemoteOnExport = settings.value.cacheRemoteOnExport ?? DEFAULT_SETTINGS.cacheRemoteOnExport;
  return (
    exportScale !== DEFAULT_SETTINGS.exportPngScale
    || exportTransparent !== DEFAULT_SETTINGS.exportPngTransparent
    || cacheRemoteOnExport !== DEFAULT_SETTINGS.cacheRemoteOnExport
  );
});
const layersDirty = computed(() => (viewerApi.value?.layers.value.length ?? 0) > 1);

const detailsDirty = computed(() => {
  const active = viewerApi.value?.activeLayerDisplay?.value;
  const cur = active ?? settings.value;
  const styleBase = getVisualStylePreset(
    settings.value.visualStyle ?? DEFAULT_SETTINGS.visualStyle,
  ).display;
  return (
    cur.representation !== DEFAULT_LAYER_DISPLAY.representation
    || cur.atomScale !== styleBase.atomScale
    || cur.showBonds !== DEFAULT_LAYER_DISPLAY.showBonds
    || cur.sphereSegments !== DEFAULT_LAYER_DISPLAY.sphereSegments
    || cur.bondFactor !== styleBase.bondFactor
    || cur.bondRadius !== styleBase.bondRadius
    || cur.atomRoughness !== styleBase.atomRoughness
  );
});

const viewDirty = computed(() => {
  const defaultDistance = Number.isFinite(settings.value.initialDualViewDistance)
    ? (settings.value.initialDualViewDistance as number)
    : DEFAULT_SETTINGS.dualViewDistance;
  return (
    settings.value.orthographic !== DEFAULT_SETTINGS.orthographic
    || !arraysEqual(settings.value.viewPresets, DEFAULT_SETTINGS.viewPresets)
    || settings.value.dualViewSplit !== DEFAULT_SETTINGS.dualViewSplit
    || (settings.value.dualViewDistance ?? defaultDistance) !== defaultDistance
    || settings.value.rotationDeg.x !== 0
    || settings.value.rotationDeg.y !== 0
    || settings.value.rotationDeg.z !== 0
  );
});

const rotationDirty = computed(() => {
  const cur = settings.value.autoRotate;
  const def = DEFAULT_SETTINGS.autoRotate;
  return (
    !!cur.enabled !== !!def.enabled
    || cur.presetId !== def.presetId
    || cur.speedDegPerSec !== def.speedDegPerSec
    || !!cur.pauseOnInteract !== !!def.pauseOnInteract
    || cur.resumeDelayMs !== def.resumeDelayMs
  );
});

const otherDirty = computed(() => {
  const styleBase = getVisualStylePreset(
    settings.value.visualStyle ?? DEFAULT_SETTINGS.visualStyle,
  ).display;
  return (
    settings.value.showAxes !== DEFAULT_SETTINGS.showAxes
    || settings.value.refreshBondsOnPlay !== DEFAULT_SETTINGS.refreshBondsOnPlay
    || settings.value.frame_rate !== DEFAULT_SETTINGS.frame_rate
    || settings.value.autoRotateOnLoad !== DEFAULT_SETTINGS.autoRotateOnLoad
    || settings.value.themeMode !== DEFAULT_SETTINGS.themeMode
    || settings.value.visualStyle !== DEFAULT_SETTINGS.visualStyle
    || settings.value.modelLightIntensity !== styleBase.modelLightIntensity
    || (settings.value.themeReadabilityCheckOnOpen ?? true)
      !== (DEFAULT_SETTINGS.themeReadabilityCheckOnOpen ?? true)
  );
});

provide(settingsSiderDerivedContextKey, {
  filesDirty,
  layersDirty,
  viewDirty,
  rotationDirty,
  otherDirty,
  detailsDirty,
});

function arraysEqual(a: unknown, b: unknown): boolean {
  const arrA = Array.isArray(a) ? a : [];
  const arrB = Array.isArray(b) ? b : [];
  if (arrA.length !== arrB.length) return false;
  return arrA.every((v, i) => v === arrB[i]);
}

function buildPresetColorMap(styleId: string): Record<string, string> {
  const preset = getVisualStylePreset(styleId as any);
  const out: Record<string, string> = {};
  for (const r of preset.colorMapTemplate ?? []) {
    const key = getAtomTypeColorKey(r.element, r.typeId);
    if (!key) continue;
    const c = String(r.color ?? '').trim().toUpperCase();
    if (!c) continue;
    out[key] = c;
  }
  return out;
}

function getBaseColorForRow(styleId: string, row: AtomTypeColorMapItem): string {
  if (styleId !== 'default') {
    const preset = buildPresetColorMap(styleId);
    const key = getAtomTypeColorKey(row.element, row.typeId);
    return preset[key] ?? getElementColorHex(row.element ?? 'E');
  }
  return getElementColorHex(row.element ?? 'E');
}

function hasCustomColors(): boolean {
  const styleId = settings.value.visualStyle ?? DEFAULT_SETTINGS.visualStyle;
  const template = settings.value.colorMapTemplate ?? [];
  if (template.length === 0) return false;
  return template.some((row) => {
    const base = getBaseColorForRow(styleId, row);
    const cur = String(row.color ?? '').trim().toUpperCase();
    return cur !== String(base).trim().toUpperCase();
  });
}

function hasCustomTypeMap(): boolean {
  const template = settings.value.lammpsTypeMap ?? [];
  const rows = viewerApi.value?.activeLayerTypeMap?.value ?? [];
  const all = [...template, ...rows];
  return all.some(r => (r.element ?? '').toString().trim().toUpperCase() !== 'E');
}

function isTypeMapApplied(): boolean {
  return !!viewerApi.value?.activeLayerTypeMapApplied?.value;
}

function isPanelDirty(key: string): boolean {
  if (key === PANEL_KEYS.files) return filesDirty.value;
  if (key === PANEL_KEYS.layers) return layersDirty.value;
  if (key === PANEL_KEYS.colors) return hasCustomColors();
  if (key === PANEL_KEYS.lammps) return isTypeMapApplied() && hasCustomTypeMap();
  if (key === PANEL_KEYS.details) return detailsDirty.value;
  if (key === PANEL_KEYS.view) return viewDirty.value;
  if (key === PANEL_KEYS.rotation) return rotationDirty.value;
  if (key === PANEL_KEYS.other) return otherDirty.value;
  return false;
}

const basePanels = [
  { key: PANEL_KEYS.files, headerKey: PANEL_HEADER_KEYS.files, comp: FilesPanel, icon: FolderOpenOutlined },
  { key: PANEL_KEYS.rotation, headerKey: PANEL_HEADER_KEYS.rotation, comp: RotatePanel, icon: SyncOutlined },
  { key: PANEL_KEYS.view, headerKey: PANEL_HEADER_KEYS.view, comp: ViewPanel, icon: EyeOutlined },
  { key: PANEL_KEYS.layers, headerKey: PANEL_HEADER_KEYS.layers, comp: LayersPanel, icon: AppstoreOutlined },
  { key: PANEL_KEYS.lammps, headerKey: PANEL_HEADER_KEYS.lammps, comp: LammpsPanel, icon: SwapOutlined },
  { key: PANEL_KEYS.details, headerKey: PANEL_HEADER_KEYS.details, comp: DetailsPanel, icon: SlidersOutlined },
  { key: PANEL_KEYS.colors, headerKey: PANEL_HEADER_KEYS.colors, comp: ColorsPanel, icon: BgColorsOutlined },
  { key: PANEL_KEYS.other, headerKey: PANEL_HEADER_KEYS.other, comp: OtherPanel, icon: SettingOutlined },
] as const;
const panels = computed(() =>
  activeLayerIsLammps.value
    ? basePanels
    : basePanels.filter(p => p.key !== PANEL_KEYS.lammps),
);

const activeKeyProxy = computed<string[]>({
  get: () => props.activeKey,
  set: (v: unknown) => {
    const next = Array.isArray(v)
      ? v.map(x => String(x))
      : v != null && String(v) !== ''
        ? [String(v)]
        : [];
    emit('update:activeKey', next);
  },
});

const buildTimeText = computed(() => {
  if (!APP_BUILD_TIME) return t('settings.buildTimeUnknown');
  const parsed = new Date(APP_BUILD_TIME);
  if (Number.isNaN(parsed.getTime())) return t('settings.buildTimeUnknown');
  return new Intl.DateTimeFormat(locale.value, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
});

watch(
  () => activeLayerIsLammps.value,
  (isLammps) => {
    if (isLammps) return;
    if (props.activeKey.includes(PANEL_KEYS.lammps)) {
      emit('update:activeKey', props.activeKey.filter(k => k !== PANEL_KEYS.lammps));
    }
  },
);

function onResizeStart(ev: PointerEvent): void {
  emit('resize-start', ev);
}

</script>
