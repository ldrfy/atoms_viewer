<template>
  <div class="settings-content">
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
              <span class="settings-panel-header-main">
                <component :is="p.icon" class="settings-panel-icon" />
                <a-typography-text strong>
                  {{ t(p.headerKey) }}
                </a-typography-text>
                <span
                  v-if="isPanelDirty(p.key)"
                  class="settings-panel-indicator"
                >
                  <span class="settings-panel-dirty" aria-hidden="true" />
                  <a-tooltip
                    v-if="hasPanelReset(p.key)"
                    :title="t('settings.panel.resetPanelButton')"
                  >
                    <a-popconfirm
                      :title="t('settings.panel.resetPanelConfirm')"
                      :ok-text="t('common.confirm')"
                      :cancel-text="t('common.cancel')"
                      @confirm.stop="resetPanel(p.key)"
                    >
                      <a-button
                        type="text"
                        size="small"
                        class="settings-panel-reset-button"
                        :aria-label="t('settings.panel.resetPanelButton')"
                        :title="t('settings.panel.resetPanelButton')"
                        @click.stop
                      >
                        <ReloadOutlined />
                      </a-button>
                    </a-popconfirm>
                  </a-tooltip>
                </span>
              </span>
            </span>
          </template>
          <component :is="p.comp" />
        </a-collapse-panel>
      </a-collapse>

      <div class="settings-clear-storage settings-gap-top-md">
        <a-button
          block
          danger
          @click="onClearStorage"
        >
          {{ t('settings.clearStorage') }}
        </a-button>
        <a-typography-text type="secondary" class="settings-text-secondary">
          {{ t('settings.clearStorageHint') }}
        </a-typography-text>
        <a-typography-text type="secondary" class="settings-text-secondary">
          {{ storageUsageText }}
        </a-typography-text>
        <a-typography-text type="secondary" class="settings-text-secondary">
          {{ storageUsageDetailText }}
        </a-typography-text>
      </div>
    </div>

    <div class="settings-footer">
      <a-typography-text type="secondary" class="settings-text-secondary settings-build-text">
        {{ t('settings.buildTime') }} {{ buildTimeText }}
      </a-typography-text>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, provide, reactive, watch, nextTick, ref, onMounted, onBeforeUnmount } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  AppstoreOutlined,
  BgColorsOutlined,
  CloseOutlined,
  EyeOutlined,
  FolderOpenOutlined,
  ReloadOutlined,
  SettingOutlined,
  SlidersOutlined,
  SwapOutlined,
  SyncOutlined,
} from '@ant-design/icons-vue';
import { Modal } from 'ant-design-vue';

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
  DEFAULT_DETAILS,
  hasUnknownElementMappingForTypeIds,
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
import { APP_BUILD_TIME } from '../../lib/appMeta';
import { isLammpsDumpFormat } from '../../lib/structure/parsers/lammpsDump';
import { isLammpsDataFormat } from '../../lib/structure/parsers/lammpsData';
import { getElementColorHex } from '../../lib/structure/chem';
import { getVisualStylePreset } from '../../lib/viewer/visualStyles';
import { PANEL_KEYS, PANEL_HEADER_KEYS } from '../../lib/viewer/panelKeys';
import { clearAllSettings } from '../../lib/viewer/settingsActions';
import { estimateSessionCacheBytes } from '../../lib/viewer/sessionStorage';

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

const storageUsageText = ref<string>('');
const storageUsageDetailText = ref<string>('');
const localStorageBytes = ref<number>(0);
const cacheStorageBytes = ref<number>(0);

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) return '-';
  const b = Math.max(0, bytes);
  if (b < 1024) return `${Math.round(b)} B`;
  const kb = b / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(2)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

function calcLocalStorageBytes(): number {
  try {
    const encoder = new TextEncoder();
    let total = 0;
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key) continue;
      const val = localStorage.getItem(key) ?? '';
      total += encoder.encode(key).length + encoder.encode(val).length;
    }
    return total;
  }
  catch {
    return 0;
  }
}

async function refreshStorageUsage(): Promise<void> {
  try {
    const localBytes = localStorageBytes.value;
    const cacheBytes = cacheStorageBytes.value;
    const computedUsed = localBytes + cacheBytes;
    storageUsageText.value = t('settings.storageUsageOnly', {
      used: formatBytes(computedUsed),
    });
    storageUsageDetailText.value = t('settings.storageUsageDetail', {
      local: formatBytes(localBytes),
      cache: formatBytes(cacheBytes),
    });
  }
  catch {
    storageUsageText.value = t('settings.storageUsageUnknown');
    storageUsageDetailText.value = '';
  }
}

async function refreshLocalStorageUsage(): Promise<void> {
  localStorageBytes.value = calcLocalStorageBytes();
  await refreshStorageUsage();
}

async function refreshCacheStorageUsage(): Promise<void> {
  cacheStorageBytes.value = await estimateSessionCacheBytes();
  await refreshStorageUsage();
}

void refreshLocalStorageUsage();
void refreshCacheStorageUsage();

function onSessionSaved(): void {
  void refreshCacheStorageUsage();
}

onMounted(() => {
  window.addEventListener('atoms-viewer:session-saved', onSessionSaved);
});

onBeforeUnmount(() => {
  window.removeEventListener('atoms-viewer:session-saved', onSessionSaved);
});

const filesDirty = computed(() => {
  const exportScale = settings.value.files.exportPngScale ?? DEFAULT_SETTINGS.files.exportPngScale;
  const exportTransparent = settings.value.files.exportPngTransparent ?? DEFAULT_SETTINGS.files.exportPngTransparent;
  const exportImageFormat = settings.value.files.exportImageFormat ?? DEFAULT_SETTINGS.files.exportImageFormat;
  const cacheRemoteOnExport = settings.value.files.cacheRemoteOnExport ?? DEFAULT_SETTINGS.files.cacheRemoteOnExport;
  return (
    exportScale !== DEFAULT_SETTINGS.files.exportPngScale
    || exportTransparent !== DEFAULT_SETTINGS.files.exportPngTransparent
    || exportImageFormat !== DEFAULT_SETTINGS.files.exportImageFormat
    || cacheRemoteOnExport !== DEFAULT_SETTINGS.files.cacheRemoteOnExport
  );
});
const layersDirty = computed(() => (viewerApi.value?.layers.value.length ?? 0) > 1);

const detailsDirty = computed(() => {
  const cur = viewerApi.value?.activeLayerDisplay?.value ?? DEFAULT_DETAILS;
  const styleBase = getVisualStylePreset(
    settings.value.other.visualStyle ?? DEFAULT_SETTINGS.other.visualStyle,
  ).display;
  return (
    cur.representation !== DEFAULT_DETAILS.representation
    || cur.atomScale !== styleBase.atomScale
    || cur.showBonds !== DEFAULT_DETAILS.showBonds
    || cur.sphereSegments !== DEFAULT_DETAILS.sphereSegments
    || cur.bondFactor !== styleBase.bondFactor
    || cur.bondRadius !== styleBase.bondRadius
    || cur.atomRoughness !== styleBase.atomRoughness
  );
});

const viewDirty = computed(() => {
  const defaultDistance = Number.isFinite(settings.value.view.initialDualViewDistance)
    ? (settings.value.view.initialDualViewDistance as number)
    : DEFAULT_SETTINGS.view.dualViewDistance;
  return (
    settings.value.view.orthographic !== DEFAULT_SETTINGS.view.orthographic
    || !arraysEqual(settings.value.view.viewPresets, DEFAULT_SETTINGS.view.viewPresets)
    || settings.value.view.dualViewSplit !== DEFAULT_SETTINGS.view.dualViewSplit
    || (settings.value.view.dualViewDistance ?? defaultDistance) !== defaultDistance
    || settings.value.view.rotationDeg.x !== 0
    || settings.value.view.rotationDeg.y !== 0
    || settings.value.view.rotationDeg.z !== 0
  );
});

const rotationDirty = computed(() => {
  const cur = settings.value.rotation;
  const def = DEFAULT_SETTINGS.rotation;
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
    settings.value.other.visualStyle ?? DEFAULT_SETTINGS.other.visualStyle,
  ).display;
  return (
    settings.value.other.showAxes !== DEFAULT_SETTINGS.other.showAxes
    || settings.value.other.refreshBondsOnPlay !== DEFAULT_SETTINGS.other.refreshBondsOnPlay
    || settings.value.other.keepActiveLayerOnHide !== DEFAULT_SETTINGS.other.keepActiveLayerOnHide
    || settings.value.other.panStepScale !== DEFAULT_SETTINGS.other.panStepScale
    || settings.value.other.themeMode !== DEFAULT_SETTINGS.other.themeMode
    || settings.value.other.visualStyle !== DEFAULT_SETTINGS.other.visualStyle
    || settings.value.other.modelLightIntensity !== styleBase.modelLightIntensity
    || settings.value.other.backgroundColor !== DEFAULT_SETTINGS.other.backgroundColor
    || settings.value.other.backgroundColorMode !== DEFAULT_SETTINGS.other.backgroundColorMode
    || settings.value.other.backgroundTransparent !== DEFAULT_SETTINGS.other.backgroundTransparent
    || settings.value.other.selectionHighlightColor !== DEFAULT_SETTINGS.other.selectionHighlightColor
    || (settings.value.other.themeReadabilityCheckOnOpen ?? true)
      !== (DEFAULT_SETTINGS.other.themeReadabilityCheckOnOpen ?? true)
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

const colorsDirty = computed(() => {
  const visualStyle = settings.value.other.visualStyle ?? DEFAULT_SETTINGS.other.visualStyle;
  const expected = visualStyle === 'default'
    ? {}
    : { ...getVisualStylePreset(visualStyle).colorMapTemplate };
  const layerRecord = viewerApi.value?.activeLayerColorMap?.value ?? {};
  let layerDirty = false;
  for (const [key, value] of Object.entries(layerRecord)) {
    const { element } = parseColorMapKey(key);
    if (!element) continue;
    const base = expected[element] ?? getElementColorHex(element);
    const curColor = String(value ?? '').trim().toUpperCase();
    if (curColor && curColor !== String(base).trim().toUpperCase()) {
      layerDirty = true;
      break;
    }
  }
  return layerDirty;
});

function hasCustomTypeMap(): boolean {
  const map = viewerApi.value?.activeLayerTypeMap?.value ?? {};
  const typeIds = viewerApi.value?.activeLayerTypeIds?.value ?? [];
  return hasUnknownElementMappingForTypeIds(map, typeIds);
}

function isTypeMapApplied(): boolean {
  return !!viewerApi.value?.activeLayerTypeMapApplied?.value;
}

function isPanelDirty(key: string): boolean {
  if (key === PANEL_KEYS.files) return filesDirty.value;
  if (key === PANEL_KEYS.layers) return layersDirty.value;
  if (key === PANEL_KEYS.colors) return colorsDirty.value;
  if (key === PANEL_KEYS.lammps) return !isTypeMapApplied() || hasCustomTypeMap();
  if (key === PANEL_KEYS.details) return detailsDirty.value;
  if (key === PANEL_KEYS.view) return viewDirty.value;
  if (key === PANEL_KEYS.rotation) return rotationDirty.value;
  if (key === PANEL_KEYS.other) return otherDirty.value;
  return false;
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

function onClearStorage(): void {
  Modal.confirm({
    title: t('settings.clearStorageConfirmTitle'),
    content: t('settings.clearStorageConfirmBody'),
    centered: true,
    okText: t('common.confirm'),
    cancelText: t('common.cancel'),
    onOk: async () => {
      await clearAllSettings({
        currentSettings: settings.value,
        viewerApi: viewerApi.value,
        replaceSettings,
        nextTick,
        onAfterClear: notifyClearStorageUi,
      });
      await refreshLocalStorageUsage();
      await refreshCacheStorageUsage();
    },
  });
}

</script>
