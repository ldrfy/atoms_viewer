<template>
  <a-flex vertical class="settings-content">
    <a-flex vertical class="settings-header">
      <!-- Mobile only: grab handle -->
      <div
        v-if="showGrab"
        class="settings-grab"
        role="button"
        tabindex="0"
        @pointerdown.stop.prevent="onResizeStart"
      >
        <div class="settings-grab-bar" />
      </div>

      <a-flex align="center" justify="space-between" class="settings-header-row">
        <a-typography-text strong>
          {{ t('settings.title') }}
        </a-typography-text>

        <a-button
          variant="link"
          color="default"
          size="small"
          @click="emit('close')"
        >
          <CloseOutlined />
        </a-button>
      </a-flex>
    </a-flex>

    <a-flex vertical class="settings-body">
      <a-collapse
        v-model:active-key="activeKeyProxy"
        class="settings-collapse"
        ghost
        expand-icon-placement="end"
        :items="collapseItems"
        :label-render="renderCollapseLabel"
      />

      <a-flex vertical gap="small" style="padding: 16px 12px;">
        <a-button
          block
          danger
          @click="onClearSettings"
        >
          {{ t('settings.clearSettings') }}
        </a-button>
        <a-typography-text type="secondary">
          {{ t('settings.clearStorageHint') }}
        </a-typography-text>
      </a-flex>
      <!-- Dev tip: use the browser console to inspect cache/storage sizes via `localStorage.getItem('settings')` or `localStorage.getItem('atomsViewer.layerSnapshotCache.v1')`. -->
    </a-flex>

    <a-typography-text type="secondary" class="settings-footer  settings-build-text">
      v{{ APP_VERSION }} · {{ t('settings.buildTime') }} {{ buildTimeText }}
    </a-typography-text>
  </a-flex>
</template>

<script setup lang="ts">
import { computed, provide, reactive, watch, nextTick, onMounted, onBeforeUnmount, h } from 'vue';
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
} from '@antdv-next/icons';
import { Modal, type CollapseProps } from 'antdv-next';

import FilesPanel from './panels/FilesPanel.vue';
import LayersPanel from './panels/LayersPanel.vue';
import ViewPanel from './panels/ViewPanel.vue';
import RotatePanel from './panels/RotatePanel.vue';
import LammpsPanel from './panels/LammpsPanel.vue';
import ColorsPanel from './panels/ColorsPanel.vue';
import DetailsPanel from './panels/DetailsPanel.vue';
import OtherPanel from './panels/OtherPanel.vue';
import CollapsePanelLabel from './parts/CollapsePanelLabel.vue';
import {
  countUnknownElementMappingForTypeIds,
  DEFAULT_SETTINGS,
  DEFAULT_DETAILS,
} from '../../lib/viewer/settings';
import { useSettingsSiderContext } from './useSettingsSiderContext';
import { useSettingsSiderControlContext } from './useSettingsSiderControlContext';
import {
  settingsSiderDirtyContextKey,
  settingsSiderDerivedContextKey,
  settingsSiderResetContextKey,
} from './context';
import { viewerApiRef } from '../../lib/viewer/bridge';
import { parseColorMapKey } from '../ViewerStage/colorMap';
import { APP_BUILD_TIME, APP_VERSION } from '../../lib/appMeta';
import { isLammpsDumpFormat } from '../../lib/structure/parsers/lammpsDump';
import { isLammpsDataFormat } from '../../lib/structure/parsers/lammpsData';
import { getElementColorHex } from '../../lib/structure/chem';
import { getVisualStylePreset } from '../../lib/viewer/visualStyles';
import { PANEL_KEYS, PANEL_HEADER_KEYS } from '../../lib/viewer/panelKeys';
import { applyDefaultSettings } from '../../lib/viewer/settingsActions';
import { saveSettingsToStorage } from '../../lib/viewer/settingsStorage';
import { setThemeMode } from '../../theme/mode';

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
const { replaceSettings, notifyClearStorageUi } = useSettingsSiderControlContext();

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

const panelResetActions = new Map<string, () => void>();
const panelResetFlags = reactive<Record<string, boolean>>({});
function registerPanelReset(key: string, action: () => void): () => void {
  panelResetActions.set(key, action);
  panelResetFlags[key] = true;
  return () => {
    if (panelResetActions.get(key) !== action) return;
    panelResetActions.delete(key);
    delete panelResetFlags[key];
  };
}

provide(settingsSiderResetContextKey, { registerPanelReset });

// 需要检查设置/模型缓存大小时，可在浏览器控制台运行：
// console.log(localStorage.getItem('settings'), localStorage.getItem('atomsViewer.layerSnapshotCache.v1'));

function onSessionSaved(): void {
}

onMounted(() => {
  window.addEventListener('atoms-viewer:session-saved', onSessionSaved);
});

onBeforeUnmount(() => {
  window.removeEventListener('atoms-viewer:session-saved', onSessionSaved);
});

// 文件面板修改计数。
// Dirty count for Files panel.
const filesDirtyCount = computed(() => {
  const exportScale = settings.value.files.exportPngScale ?? DEFAULT_SETTINGS.files.exportPngScale;
  const exportTransparent = settings.value.files.exportPngTransparent ?? DEFAULT_SETTINGS.files.exportPngTransparent;
  const exportImageFormat = settings.value.files.exportImageFormat ?? DEFAULT_SETTINGS.files.exportImageFormat;
  const cacheRemoteOnExport = settings.value.files.cacheRemoteOnExport ?? DEFAULT_SETTINGS.files.cacheRemoteOnExport;
  let count = 0;
  if (exportScale !== DEFAULT_SETTINGS.files.exportPngScale) count += 1;
  if (exportTransparent !== DEFAULT_SETTINGS.files.exportPngTransparent) count += 1;
  if (exportImageFormat !== DEFAULT_SETTINGS.files.exportImageFormat) count += 1;
  if (cacheRemoteOnExport !== DEFAULT_SETTINGS.files.cacheRemoteOnExport) count += 1;
  return count;
});
// 图层面板修改计数（额外图层数）。
// Dirty count for Layers panel (extra layers).
const layersDirtyCount = computed(() => {
  const count = viewerApi.value?.layers.value.length ?? 0;
  return count > 1 ? count : 0;
});

// 细节面板修改计数。
// Dirty count for Details panel.
const detailsDirtyCount = computed(() => {
  const cur = viewerApi.value?.activeLayerDisplay?.value ?? DEFAULT_DETAILS;
  const styleBase = getVisualStylePreset(
    settings.value.other.visualStyle ?? DEFAULT_SETTINGS.other.visualStyle,
  ).display;
  let count = 0;
  if (cur.representation !== DEFAULT_DETAILS.representation) count += 1;
  if (cur.atomScale !== styleBase.atomScale) count += 1;
  if (cur.showBonds !== DEFAULT_DETAILS.showBonds) count += 1;
  if (cur.sphereSegments !== DEFAULT_DETAILS.sphereSegments) count += 1;
  if (cur.bondFactor !== styleBase.bondFactor) count += 1;
  if (cur.bondRadius !== styleBase.bondRadius) count += 1;
  if (cur.atomRoughness !== styleBase.atomRoughness) count += 1;
  if (cur.showAtomIndex !== DEFAULT_DETAILS.showAtomIndex) count += 1;
  if (cur.showElementSymbol !== DEFAULT_DETAILS.showElementSymbol) count += 1;
  return count;
});

// 视角面板修改计数。
// Dirty count for View panel.
const viewDirtyCount = computed(() => {
  const defaultDistance = Number.isFinite(settings.value.view.initialDualViewDistance)
    ? (settings.value.view.initialDualViewDistance as number)
    : DEFAULT_SETTINGS.view.dualViewDistance;
  let count = 0;
  if (settings.value.view.orthographic !== DEFAULT_SETTINGS.view.orthographic) count += 1;
  if (!arraysEqual(settings.value.view.viewPresets, DEFAULT_SETTINGS.view.viewPresets)) count += 1;
  if (settings.value.view.dualViewSplit !== DEFAULT_SETTINGS.view.dualViewSplit) count += 1;
  if ((settings.value.view.dualViewDistance ?? defaultDistance) !== defaultDistance) count += 1;
  if (settings.value.view.rotationDeg.x !== 0) count += 1;
  if (settings.value.view.rotationDeg.y !== 0) count += 1;
  if (settings.value.view.rotationDeg.z !== 0) count += 1;
  return count;
});

// 旋转面板修改计数。
// Dirty count for Rotation panel.
const rotationDirtyCount = computed(() => {
  const cur = settings.value.rotation;
  const def = DEFAULT_SETTINGS.rotation;
  let count = 0;
  if (!!cur.enabled !== !!def.enabled) count += 1;
  if (cur.presetId !== def.presetId) count += 1;
  if (cur.speedDegPerSec !== def.speedDegPerSec) count += 1;
  if (!!cur.pauseOnInteract !== !!def.pauseOnInteract) count += 1;
  if (cur.resumeDelayMs !== def.resumeDelayMs) count += 1;
  return count;
});

// 其他面板修改计数。
// Dirty count for Other panel.
const otherDirtyCount = computed(() => {
  const styleBase = getVisualStylePreset(
    settings.value.other.visualStyle ?? DEFAULT_SETTINGS.other.visualStyle,
  ).display;
  let count = 0;
  if (settings.value.other.showAxes !== DEFAULT_SETTINGS.other.showAxes) count += 1;
  if (settings.value.other.refreshBondsOnPlay !== DEFAULT_SETTINGS.other.refreshBondsOnPlay) count += 1;
  if (settings.value.other.keepActiveLayerOnHide !== DEFAULT_SETTINGS.other.keepActiveLayerOnHide) count += 1;
  if (settings.value.other.panStepScale !== DEFAULT_SETTINGS.other.panStepScale) count += 1;
  if (settings.value.other.themeMode !== DEFAULT_SETTINGS.other.themeMode) count += 1;
  if (settings.value.other.visualStyle !== DEFAULT_SETTINGS.other.visualStyle) count += 1;
  if (settings.value.other.modelLightIntensity !== styleBase.modelLightIntensity) count += 1;
  if (settings.value.other.backgroundColor !== DEFAULT_SETTINGS.other.backgroundColor) count += 1;
  if (settings.value.other.backgroundColorMode !== DEFAULT_SETTINGS.other.backgroundColorMode) count += 1;
  if (settings.value.other.backgroundTransparent !== DEFAULT_SETTINGS.other.backgroundTransparent) count += 1;
  if (settings.value.other.selectionHighlightColor !== DEFAULT_SETTINGS.other.selectionHighlightColor) count += 1;
  if ((settings.value.other.themeReadabilityCheckOnOpen ?? true)
    !== (DEFAULT_SETTINGS.other.themeReadabilityCheckOnOpen ?? true)) count += 1;
  return count;
});

provide(settingsSiderDerivedContextKey, {
  filesDirty: computed(() => filesDirtyCount.value > 0),
  layersDirty: computed(() => layersDirtyCount.value > 0),
  viewDirty: computed(() => viewDirtyCount.value > 0),
  rotationDirty: computed(() => rotationDirtyCount.value > 0),
  otherDirty: computed(() => otherDirtyCount.value > 0),
  detailsDirty: computed(() => detailsDirtyCount.value > 0),
});

function arraysEqual(a: unknown, b: unknown): boolean {
  const arrA = Array.isArray(a) ? a : [];
  const arrB = Array.isArray(b) ? b : [];
  if (arrA.length !== arrB.length) return false;
  return arrA.every((v, i) => v === arrB[i]);
}

// 颜色面板修改计数。
// Dirty count for Colors panel.
const colorsDirtyCount = computed(() => {
  const visualStyle = settings.value.other.visualStyle ?? DEFAULT_SETTINGS.other.visualStyle;
  const expected = visualStyle === 'default'
    ? {}
    : { ...getVisualStylePreset(visualStyle).colorMapTemplate };
  const layerRecord = viewerApi.value?.activeLayerColorMap?.value ?? {};
  let count = 0;
  for (const [key, value] of Object.entries(layerRecord)) {
    const { element } = parseColorMapKey(key);
    if (!element) continue;
    const base = expected[element] ?? getElementColorHex(element);
    const curColor = String(value ?? '').trim().toUpperCase();
    if (curColor && curColor !== String(base).trim().toUpperCase()) {
      count += 1;
    }
  }
  return count;
});

// LAMMPS 面板修改计数。
// Dirty count for LAMMPS panel.
const lammpsDirtyCount = computed(() => {
  const map = viewerApi.value?.activeLayerTypeMap?.value ?? {};
  const typeIds = viewerApi.value?.activeLayerTypeIds?.value ?? [];
  return countUnknownElementMappingForTypeIds(map, typeIds);
});

// 统一获取面板修改计数。
// Get dirty count per panel.
function getPanelDirtyCount(key: string): number {
  if (key === PANEL_KEYS.files) return filesDirtyCount.value;
  if (key === PANEL_KEYS.layers) return layersDirtyCount.value;
  if (key === PANEL_KEYS.colors) return colorsDirtyCount.value;
  if (key === PANEL_KEYS.lammps) return lammpsDirtyCount.value;
  if (key === PANEL_KEYS.details) return detailsDirtyCount.value;
  if (key === PANEL_KEYS.view) return viewDirtyCount.value;
  if (key === PANEL_KEYS.rotation) return rotationDirtyCount.value;
  if (key === PANEL_KEYS.other) return otherDirtyCount.value;
  return 0;
}

function isPanelDirty(key: string): boolean {
  return getPanelDirtyCount(key) > 0;
}

function hasPanelReset(key: string): boolean {
  return Boolean(panelResetFlags[key]);
}

function resetPanel(key: string): void {
  panelResetActions.get(key)?.();
}

const basePanels = [
  { key: PANEL_KEYS.view, headerKey: PANEL_HEADER_KEYS.view, comp: ViewPanel, icon: EyeOutlined },
  { key: PANEL_KEYS.layers, headerKey: PANEL_HEADER_KEYS.layers, comp: LayersPanel, icon: AppstoreOutlined },
  { key: PANEL_KEYS.lammps, headerKey: PANEL_HEADER_KEYS.lammps, comp: LammpsPanel, icon: SwapOutlined },
  { key: PANEL_KEYS.colors, headerKey: PANEL_HEADER_KEYS.colors, comp: ColorsPanel, icon: BgColorsOutlined },
  { key: PANEL_KEYS.details, headerKey: PANEL_HEADER_KEYS.details, comp: DetailsPanel, icon: SlidersOutlined },
  { key: PANEL_KEYS.rotation, headerKey: PANEL_HEADER_KEYS.rotation, comp: RotatePanel, icon: SyncOutlined },
  { key: PANEL_KEYS.files, headerKey: PANEL_HEADER_KEYS.files, comp: FilesPanel, icon: FolderOpenOutlined },
  { key: PANEL_KEYS.other, headerKey: PANEL_HEADER_KEYS.other, comp: OtherPanel, icon: SettingOutlined },
] as const;
const panels = computed(() =>
  activeLayerIsLammps.value
    ? basePanels
    : basePanels.filter(p => p.key !== PANEL_KEYS.lammps),
);

// 折叠面板 items：使用新版 API 构造标题与重置按钮
// Collapse panel items: build headers & reset action via items API
const panelMap = computed(() =>
  Object.fromEntries(panels.value.map(p => [p.key, p])),
);

const collapseItems = computed<NonNullable<CollapseProps['items']>>(() =>
  panels.value.map(p => ({
    key: p.key,
    label: t(p.headerKey),
    children: h(p.comp),
  })),
);

// 自定义标题渲染，恢复原有图标/重置按钮
// Custom label render to keep icon + reset button
const renderCollapseLabel = ({ item }: { item: any; index: number }) => {
  const p = panelMap.value[item.key];
  if (!p) return item.label;

  const dirtyCount = getPanelDirtyCount(p.key);
  // 标题渲染拆分到独立组件，减少当前文件复杂度。
  // Move label rendering to a dedicated component to reduce complexity here.
  return h(CollapsePanelLabel, {
    icon: p.icon,
    title: t(p.headerKey),
    dirtyCount,
    showReset: isPanelDirty(p.key) && hasPanelReset(p.key),
    resetTooltip: t('settings.panel.resetPanelButton'),
    resetConfirmText: t('settings.panel.resetPanelConfirm'),
    onReset: () => resetPanel(p.key),
  });
};

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

async function applyDefaultSettingsRoutine(): Promise<void> {
  const next = await applyDefaultSettings({
    currentSettings: settings.value,
    viewerApi: viewerApi.value,
    replaceSettings,
    nextTick,
  });
  // 同步主题模式到全局状态
  // Sync theme mode to global state
  setThemeMode(next.other.themeMode);
  saveSettingsToStorage(next);
  notifyClearStorageUi?.();
}

function onClearSettings(): void {
  Modal.confirm({
    title: t('settings.clearSettingsConfirmTitle'),
    content: t('settings.clearSettingsConfirmBody'),
    centered: true,
    okText: t('common.confirm'),
    cancelText: t('common.cancel'),
    onOk: async () => {
      await applyDefaultSettingsRoutine();
    },
  });
}

</script>
