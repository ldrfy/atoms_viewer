<template>
  <a-drawer
    v-model:open="openModel"
    class="settings-drawer"
    :placement="drawerPlacement"
    :mask="true"
    :mask-closable="true"
    :destroy-on-close="false"
    :closable="false"
    :maskStyle="maskStyle"
    :width="drawerPlacement === 'right' ? drawerWidth : undefined"
    :height="drawerPlacement === 'bottom' ? mobileHeight : undefined"
    :get-container="false"
    :contentWrapperStyle="contentWrapperStyle"
    :bodyStyle="drawerBodyStyle"
  >
    <!-- 自定义 Header：手机端更像 bottom-sheet -->
    <div class="settings-header">
      <div
        v-if="drawerPlacement === 'bottom'"
        class="settings-grab"
        @pointerdown.prevent="onResizeStart"
        aria-label="resize"
        title="Resize"
        role="button"
        tabindex="0"
      >
        <div class="settings-grab-bar"></div>
      </div>

      <div class="settings-header-row">
        <div class="settings-title">
          {{ t("settings.title") }}
        </div>

        <a-button
          type="text"
          size="small"
          @click="openModel = false"
          aria-label="close"
          title="Close"
        >
          ✕
        </a-button>
      </div>
    </div>

    <!-- 内容区：可滚动，避免撑爆 -->
    <div class="settings-body">
      <!-- activeKey 由父组件控制；允许多面板同时展开/折叠 -->
      <a-collapse
        v-model:activeKey="activeKeyModel"
        ghost
        class="settings-collapse"
      >
        <!-- 文件 / 导出 / 解析 -->
        <a-collapse-panel
          key="files"
          :header="t('settings.panel.files.header')"
        >
          <a-form layout="vertical">
            <a-form-item :label="t('settings.panel.files.export.header')">
              <!-- 倍率 + 透明：同一行，两端对齐（移动端更紧凑） -->
              <a-row justify="space-between" align="middle" :gutter="8">
                <a-col>
                  <a-input-number
                    aria-label="Export scale"
                    title="Export scale"
                    v-model:value="exportScale"
                    :min="1"
                    :max="5"
                    :step="0.1"
                    :precision="1"
                    style="width: 140px"
                  />
                </a-col>
                <a-col>
                  <a-checkbox v-model:checked="exportTransparent">
                    {{ t("settings.panel.files.export.transparent") }}
                  </a-checkbox>
                </a-col>
              </a-row>

              <div style="margin-top: 8px">
                <a-button
                  block
                  type="primary"
                  :disabled="!hasAnyLayer"
                  @click="onExport"
                >
                  {{ t("settings.panel.files.export.button") }}
                </a-button>
              </div>

              <a-typography-text
                type="secondary"
                style="display: block; margin-top: 6px"
              >
                {{ t("settings.panel.files.export.hint") }}
              </a-typography-text>
            </a-form-item>

            <a-divider style="margin: 8px 0" />

            <a-form-item :label="t('settings.panel.files.parse.header')">
              <a-space direction="vertical" :size="6" style="width: 100%">
                <a-select
                  :aria-label="t('viewer.parse.mode')"
                  :title="t('viewer.parse.mode')"
                  v-model:value="parseModeModel"
                  :options="parseModeOptions"
                  :disabled="!hasAnyLayer"
                  style="width: 100%"
                />

                <a-alert
                  v-if="viewerApi?.parseInfo.success === false"
                  type="error"
                  show-icon
                  :description="viewerApi?.parseInfo.errorMsg || '-'"
                />

                <a-descriptions size="small" :column="1" bordered>
                  <a-descriptions-item :label="t('viewer.parse.format')">
                    <a-tag>{{ viewerApi?.parseInfo.format || "-" }}</a-tag>
                  </a-descriptions-item>
                  <a-descriptions-item :label="t('viewer.parse.file')">
                    <span style="word-break: break-all">{{
                      viewerApi?.parseInfo.fileName || "-"
                    }}</span>
                  </a-descriptions-item>
                  <a-descriptions-item :label="t('viewer.parse.atoms')">
                    {{ viewerApi?.parseInfo.atomCount ?? 0 }}
                  </a-descriptions-item>
                  <a-descriptions-item
                    v-if="(viewerApi?.parseInfo.frameCount ?? 0) > 1"
                    :label="t('viewer.parse.frames')"
                  >
                    {{ viewerApi?.parseInfo.frameCount }}
                  </a-descriptions-item>
                </a-descriptions>
              </a-space>
            </a-form-item>
          </a-form>
        </a-collapse-panel>

        <!-- 多模型图层 -->
        <a-collapse-panel
          key="layers"
          :header="t('settings.panel.layers.header')"
        >
          <a-space direction="vertical" :size="8" style="width: 100%">
            <!-- 文件选择放在“模型图层”最上方 -->
            <div>
              <a-button
                type="primary"
                block
                :disabled="!viewerApi"
                @click="onOpenFile"
              >
                {{ t("settings.panel.files.openFile") }}
              </a-button>
              <a-typography-text
                type="secondary"
                style="display: block; margin-top: 6px"
              >
                {{ t("settings.panel.files.openFileHint") }}
              </a-typography-text>
            </div>

            <a-divider style="margin: 8px 0" />

            <a-alert
              v-if="!viewerApi"
              type="info"
              show-icon
              :message="t('settings.panel.layers.noViewer')"
            />

            <a-alert
              v-else-if="layerList.length === 0"
              type="info"
              show-icon
              :message="t('settings.panel.layers.empty')"
            />

            <div v-else class="layers-list">
              <div
                v-for="l in layerList"
                :key="l.id"
                class="layer-row"
                :class="{ active: l.id === activeLayerId }"
                @click="onSetActive(l.id)"
              >
                <div class="layer-left">
                  <a-radio :checked="l.id === activeLayerId" />
                </div>
                <div class="layer-main">
                  <div class="layer-name" :title="l.name">{{ l.name }}</div>
                  <div class="layer-meta">
                    {{
                      t("settings.panel.layers.meta", {
                        atoms: l.atomCount,
                        frames: l.frameCount,
                      })
                    }}
                  </div>
                </div>
                <div class="layer-right" @click.stop>
                  <a-space :size="4">
                    <a-switch
                      size="small"
                      :checked="l.visible"
                      :aria-label="'Visibility: ' + l.name"
                      :title="'Visibility: ' + l.name"
                      @change="(v: boolean) => onToggleLayer(l.id, v)"
                    />
                    <a-popconfirm
                      :title="t('settings.panel.layers.deleteConfirm')"
                      @confirm="() => onDeleteLayer(l.id)"
                    >
                      <a-button
                        type="text"
                        danger
                        aria-label="delete layer"
                        title="Delete layer"
                      >
                        <DeleteOutlined />
                      </a-button>
                    </a-popconfirm>
                  </a-space>
                </div>
              </div>
            </div>

            <a-typography-text type="secondary" style="display: block">
              {{ t("settings.panel.layers.hint") }}
            </a-typography-text>
          </a-space>
        </a-collapse-panel>

        <!-- 显示 / 视图 -->
        <a-collapse-panel
          key="display"
          :header="t('settings.panel.display.header')"
        >
          <a-form layout="vertical">
            <!-- 恢复原始方向：放在“显示”最上方 -->
            <a-form-item>
              <a-button block @click="resetDistance">
                {{ t("settings.panel.pose.resetView") }}
              </a-button>
            </a-form-item>

            <a-form-item
              v-if="viewPresetsModel.length > 0"
              :label="t('settings.panel.display.dualViewDistance')"
            >
              <a-row :gutter="8" align="middle">
                <a-col :flex="1">
                  <a-slider
                    v-model:value="dualViewDistanceModel"
                    :min="1"
                    :max="dualViewDistanceMax"
                    :step="0.5"
                  />
                </a-col>
                <a-col :style="{ width: '96px' }">
                  <a-input-number
                    :aria-label="t('settings.panel.display.dualViewDistance')"
                    :title="t('settings.panel.display.dualViewDistance')"
                    v-model:value="dualViewDistanceModel"
                    :min="1"
                    :max="dualViewDistanceMax"
                    :step="0.5"
                    style="width: 100%"
                  />
                </a-col>
              </a-row>
            </a-form-item>
            <!-- 多视角：正视 / 侧视 / 俯视
                         - 选 1 个 => 单视图
                         - 选 2 个 => 双视图（左右显示所选两视角） -->
            <a-form-item :label="t('settings.panel.display.viewPresets')">
              <!-- Use a controlled value + change handler to enforce:
                             1) at least one preset must be selected
                             2) at most two presets; selecting a 3rd auto-unchecks the oldest -->
              <a-checkbox-group
                :value="viewPresetsModel"
                :options="viewPresetOptions"
                @change="onViewPresetsChange"
              />
              <a-typography-text
                type="secondary"
                style="display: block; margin-top: 6px"
              >
                {{ t("settings.panel.display.viewPresetsHint") }}
              </a-typography-text>
            </a-form-item>

            <a-form-item
              v-if="viewPresetsModel.length === 2"
              :label="t('settings.panel.display.dualViewSplit')"
            >
              <a-row :gutter="8" align="middle">
                <a-col :flex="1">
                  <a-slider
                    v-model:value="dualViewSplitPctModel"
                    :min="10"
                    :max="90"
                    :step="1"
                  />
                </a-col>
                <a-col :style="{ width: '96px' }">
                  <a-input-number
                    :aria-label="t('settings.panel.display.dualViewSplit')"
                    :title="t('settings.panel.display.dualViewSplit')"
                    v-model:value="dualViewSplitPctModel"
                    :min="10"
                    :max="90"
                    :step="1"
                    style="width: 100%"
                  />
                </a-col>
              </a-row>
              <a-typography-text
                type="secondary"
                style="display: block; margin-top: 6px"
              >
                {{ t("settings.panel.display.dualViewSplitHint") }}
              </a-typography-text>
            </a-form-item>

            <!-- 投影 -->
            <a-form-item>
              <a-row justify="space-between" align="middle">
                <a-col>{{ t("settings.panel.display.perspective") }}</a-col>
                <a-col>
                  <a-switch
                    v-model:checked="orthographicModel"
                    :aria-label="t('settings.panel.display.perspective')"
                    :title="t('settings.panel.display.perspective')"
                  />
                </a-col>
              </a-row>
            </a-form-item>
          </a-form>
        </a-collapse-panel>

        <!-- 姿态 -->
        <a-collapse-panel key="pose" :header="t('settings.panel.pose.header')">
          <a-form layout="vertical">
            <a-form-item :label="t('settings.panel.pose.rotX')">
              <a-row :gutter="8" align="middle">
                <a-col :flex="1">
                  <a-slider
                    v-model:value="rotXModel"
                    :min="-180"
                    :max="180"
                    :step="1"
                  />
                </a-col>
                <a-col :style="{ width: '96px' }">
                  <a-input-number
                    :aria-label="t('settings.panel.pose.rotX')"
                    :title="t('settings.panel.pose.rotX')"
                    v-model:value="rotXModel"
                    :min="-180"
                    :max="180"
                    :step="1"
                    style="width: 100%"
                  />
                </a-col>
              </a-row>
            </a-form-item>

            <a-form-item :label="t('settings.panel.pose.rotY')">
              <a-row :gutter="8" align="middle">
                <a-col :flex="1">
                  <a-slider
                    v-model:value="rotYModel"
                    :min="-180"
                    :max="180"
                    :step="1"
                  />
                </a-col>
                <a-col :style="{ width: '96px' }">
                  <a-input-number
                    :aria-label="t('settings.panel.pose.rotY')"
                    :title="t('settings.panel.pose.rotY')"
                    v-model:value="rotYModel"
                    :min="-180"
                    :max="180"
                    :step="1"
                    style="width: 100%"
                  />
                </a-col>
              </a-row>
            </a-form-item>

            <a-form-item :label="t('settings.panel.pose.rotZ')">
              <a-row :gutter="8" align="middle">
                <a-col :flex="1">
                  <a-slider
                    v-model:value="rotZModel"
                    :min="-180"
                    :max="180"
                    :step="1"
                  />
                </a-col>
                <a-col :style="{ width: '96px' }">
                  <a-input-number
                    :aria-label="t('settings.panel.pose.rotZ')"
                    :title="t('settings.panel.pose.rotZ')"
                    v-model:value="rotZModel"
                    :min="-180"
                    :max="180"
                    :step="1"
                    style="width: 100%"
                  />
                </a-col>
              </a-row>
            </a-form-item>

            <a-form-item>
              <a-button block @click="resetPose">
                {{ t("settings.panel.pose.resetPose") }}
              </a-button>
            </a-form-item>
          </a-form>
        </a-collapse-panel>

        <!-- LAMMPS dump data -->
        <a-collapse-panel
          key="lammps"
          :header="t('settings.panel.lammps.header')"
        >
          <a-form layout="vertical">
            <a-alert
              type="info"
              show-icon
              :message="t('settings.panel.lammps.alert')"
            />

            <a-space :size="6" style="margin-top: 8px; flex-wrap: wrap">
              <a-typography-text type="secondary">
                {{ t("settings.panel.lammps.currentLayer") }}:
              </a-typography-text>
              <a-tooltip
                v-if="activeLayerInfo"
                :title="activeLayerInfo.sourceFileName || activeLayerInfo.id"
              >
                <a-tag style="max-width: 100%">
                  <span
                    style="
                      display: inline-block;
                      max-width: 260px;
                      overflow: hidden;
                      text-overflow: ellipsis;
                      white-space: nowrap;
                      vertical-align: bottom;
                    "
                  >
                    {{ activeLayerInfo.name }}
                  </span>
                </a-tag>
              </a-tooltip>
              <a-typography-text v-else type="secondary">-</a-typography-text>
            </a-space>

            <a-form-item
              :label="t('settings.panel.lammps.mapLabel')"
              style="margin-top: 12px"
            >
              <div
                v-for="(row, idx) in lammpsTypeMapModel"
                :key="`${row.typeId}-${idx}`"
                style="margin-bottom: 8px"
              >
                <a-row :gutter="8" align="middle">
                  <a-col :span="8">
                    <a-input-number
                      :aria-label="t('settings.panel.lammps.typePlaceholder')"
                      :title="t('settings.panel.lammps.typePlaceholder')"
                      :min="1"
                      :step="1"
                      :value="row.typeId"
                      style="width: 100%"
                      :placeholder="t('settings.panel.lammps.typePlaceholder')"
                      @change="onLammpsTypeId(idx, $event)"
                    />
                  </a-col>

                  <a-col :span="10">
                    <a-select
                      show-search
                      :aria-label="
                        t('settings.panel.lammps.elementPlaceholder')
                      "
                      :title="t('settings.panel.lammps.elementPlaceholder')"
                      :value="row.element"
                      style="width: 100%"
                      :placeholder="
                        t('settings.panel.lammps.elementPlaceholder')
                      "
                      :options="atomicOptions"
                      :filter-option="filterAtomicOption"
                      @change="onLammpsElementChange(idx, $event)"
                    />
                  </a-col>

                  <a-col :span="6">
                    <a-button danger block @click="removeLammpsRow(idx)">
                      {{ t("common.delete") }}
                    </a-button>
                  </a-col>
                </a-row>
              </div>

              <a-row :gutter="8">
                <a-col :span="12">
                  <a-button block @click="addLammpsRow">
                    {{ t("settings.panel.lammps.addMapping") }}
                  </a-button>
                </a-col>
                <a-col :span="12">
                  <a-button block @click="clearLammpsRows">
                    {{ t("settings.panel.lammps.clear") }}
                  </a-button>
                </a-col>
              </a-row>

              <div style="margin-top: 8px">
                <a-button
                  block
                  type="primary"
                  :disabled="!viewerApi"
                  @click="onRefreshTypeMap"
                >
                  {{ t("settings.panel.lammps.refresh") }}
                </a-button>
              </div>

              <a-typography-text
                type="secondary"
                style="display: block; margin-top: 8px"
              >
                {{ t("settings.panel.lammps.hint") }}
              </a-typography-text>
            </a-form-item>
          </a-form>
        </a-collapse-panel>

        <!-- 其他 -->
        <a-collapse-panel
          key="other"
          :header="t('settings.panel.other.header')"
        >
          <a-form layout="vertical">
            <!-- 坐标轴 -->
            <a-form-item>
              <a-row justify="space-between" align="middle">
                <a-col>{{ t("settings.panel.other.axes") }}</a-col>
                <a-col>
                  <a-switch
                    v-model:checked="showAxesModel"
                    :aria-label="t('settings.panel.other.axes')"
                    :title="t('settings.panel.other.axes')"
                  />
                </a-col>
              </a-row>
            </a-form-item>

            <!-- Bonds -->
            <a-form-item>
              <a-row justify="space-between" align="middle">
                <a-col>{{ t("settings.panel.other.bonds") }}</a-col>
                <a-col>
                  <a-switch
                    v-model:checked="showBondsModel"
                    :aria-label="t('settings.panel.other.bonds')"
                    :title="t('settings.panel.other.bonds')"
                  />
                </a-col>
              </a-row>
            </a-form-item>

            <!-- 原子大小 -->
            <a-form-item :label="t('settings.panel.other.atomSize')">
              <a-row :gutter="8" align="middle">
                <a-col :flex="1">
                  <a-slider
                    v-model:value="atomScaleModel"
                    :min="0.2"
                    :max="2"
                    :step="0.05"
                  />
                </a-col>
                <a-col :style="{ width: '96px' }">
                  <a-input-number
                    :aria-label="t('settings.panel.other.atomSize')"
                    :title="t('settings.panel.other.atomSize')"
                    v-model:value="atomScaleModel"
                    :min="0.2"
                    :max="2"
                    :step="0.05"
                    style="width: 100%"
                  />
                </a-col>
              </a-row>
            </a-form-item>

            <!-- 录制帧率 -->
            <a-form-item :label="t('settings.panel.other.recordFps')">
              <a-row :gutter="8" align="middle">
                <a-col :flex="1">
                  <a-slider
                    v-model:value="recordFpsModel"
                    :min="1"
                    :max="120"
                    :step="1"
                  />
                </a-col>
                <a-col :style="{ width: '96px' }">
                  <a-input-number
                    :aria-label="t('settings.panel.other.recordFps')"
                    :title="t('settings.panel.other.recordFps')"
                    v-model:value="recordFpsModel"
                    :min="1"
                    :max="120"
                    :step="1"
                    style="width: 100%"
                  />
                </a-col>
              </a-row>

              <a-typography-text
                type="secondary"
                style="display: block; margin-top: 6px"
              >
                {{ t("settings.panel.other.recordFpsHint") }}
              </a-typography-text>
            </a-form-item>
          </a-form>
        </a-collapse-panel>
      </a-collapse>
    </div>
  </a-drawer>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted, onBeforeUnmount } from "vue";
import { message } from "ant-design-vue";
import { DeleteOutlined } from "@ant-design/icons-vue";
import type { ViewerSettings } from "../../lib/viewer/settings";
import {
  normalizeViewPresets,
  type ViewPreset,
} from "../../lib/viewer/viewPresets";
import {
  ATOMIC_SYMBOLS,
  normalizeElementSymbol,
} from "../../lib/structure/chem";
import { useI18n } from "vue-i18n";
import { viewerApiRef } from "../../lib/viewer/bridge";
import type { ParseMode } from "../../lib/structure/parse";
import { isDark } from "../../theme/mode";

/** 本地类型：避免 settings.ts 导出名不一致造成报错
 * Local type to avoid export-name mismatch in settings.ts
 */
type LammpsTypeMapItem = { typeId: number; element: string };

const { t } = useI18n();

const viewerApi = computed(() => viewerApiRef.value);
const layerList = computed(() => viewerApi.value?.layers.value ?? []);
const activeLayerId = computed(
  () => viewerApi.value?.activeLayerId.value ?? null
);
const activeLayerInfo = computed(() => {
  const id = activeLayerId.value;
  if (!id) return null;
  return layerList.value.find((l) => l.id === id) ?? null;
});
const hasAnyLayer = computed(() => layerList.value.length > 0);

const exportScale = ref<number>(2);
const exportTransparent = ref<boolean>(true);

const parseModeModel = computed<ParseMode>({
  get: () => viewerApi.value?.parseMode.value ?? "auto",
  set: (v) => viewerApi.value?.setParseMode(v),
});

const parseModeOptions = computed(() => [
  { value: "auto", label: t("viewer.parse.modeOptions.auto") },
  { value: "xyz", label: t("viewer.parse.modeOptions.xyz") },
  { value: "pdb", label: t("viewer.parse.modeOptions.pdb") },
  { value: "lammpsdump", label: t("viewer.parse.modeOptions.lammpsdump") },
  { value: "lammpsdata", label: t("viewer.parse.modeOptions.lammpsdata") },
]);

function onOpenFile(): void {
  viewerApi.value?.openFilePicker();
}

function onExport(): void {
  if (!viewerApi.value) return;
  void viewerApi.value.exportPng({
    scale: exportScale.value,
    transparent: exportTransparent.value,
  });
}

function onSetActive(id: string): void {
  viewerApi.value?.setActiveLayer(id);
}

function onToggleLayer(id: string, visible: boolean): void {
  viewerApi.value?.setLayerVisible(id, visible);
}

function onDeleteLayer(id: string): void {
  viewerApi.value?.removeLayer(id);
}

const props = withDefaults(
  defineProps<{
    open: boolean;
    settings: ViewerSettings;
    activeKey?: string[]; // <- 允许空数组（全部折叠）
  }>(),
  {
    activeKey: () => ["display"], // <- 默认展开“显示”
  }
);

const emit = defineEmits<{
  (e: "update:open", v: boolean): void;
  (e: "update:settings", v: ViewerSettings): void;
  (e: "update:activeKey", v: string[]): void;
}>();

/**
 * Drawer open v-model
 * 抽屉开关双向绑定
 */
const openModel = computed({
  get: () => props.open,
  set: (v: boolean) => emit("update:open", v),
});

/**
 * Collapse activeKey v-model
 * 折叠面板展开项双向绑定
 */
// Ant Design Vue 在不同模式下可能回传 string 或 string[]。
// 这里统一规范成 string[]，支持“全部折叠”（空数组）。
const activeKeyModel = computed<string[]>({
  get: () => props.activeKey ?? [],
  set: (v: unknown) => {
    const next = Array.isArray(v)
      ? v.map((x) => String(x))
      : v != null && String(v) !== ""
      ? [String(v)]
      : [];
    emit("update:activeKey", next);
  },
});

/** -----------------------------
 * Responsive drawer placement
 * mobile: bottom-sheet
 * desktop: right drawer
 * ----------------------------- */
const isMobile = ref(false);

function updateIsMobile(): void {
  isMobile.value = window.matchMedia("(max-width: 768px)").matches;
}

onMounted(() => {
  updateIsMobile();
  window.addEventListener("resize", updateIsMobile, { passive: true });
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", updateIsMobile);
  onResizeEnd(); // 确保移除监听
});

const drawerPlacement = computed<"right" | "bottom">(() =>
  isMobile.value ? "bottom" : "right"
);

const drawerWidth = "min(360px, calc(100vw - 24px))";

/** -----------------------------
 * Mobile height resize (bottom-sheet)
 * ----------------------------- */
function loadNum(key: string, fallback: number): number {
  const raw = localStorage.getItem(key);
  const v = raw != null ? Number(raw) : NaN;
  return Number.isFinite(v) ? v : fallback;
}
function saveNum(key: string, v: number): void {
  localStorage.setItem(key, String(v));
}

const mobileHeight = ref<number>(
  loadNum(
    "settingsDrawer.mobileHeight",
    Math.min(560, Math.floor(window.innerHeight * 0.75))
  )
);

let resizing = false;
let startY = 0;
let startH = 0;
let activePointerId: number | null = null;

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function onResizeStart(e: PointerEvent): void {
  if (drawerPlacement.value !== "bottom") return;

  resizing = true;
  activePointerId = e.pointerId;
  startY = e.clientY;
  startH = mobileHeight.value;

  window.addEventListener("pointermove", onResizing, { passive: false });
  window.addEventListener("pointerup", onResizeEnd, { passive: true });
  window.addEventListener("pointercancel", onResizeEnd, { passive: true });
}

function onResizing(e: PointerEvent): void {
  if (!resizing) return;
  if (activePointerId != null && e.pointerId !== activePointerId) return;

  // 向上拖动 => 高度增加
  const dy = startY - e.clientY;
  const maxH = Math.floor(window.innerHeight * 0.92);
  mobileHeight.value = clamp(startH + dy, 260, maxH);
  saveNum("settingsDrawer.mobileHeight", mobileHeight.value);

  e.preventDefault();
}

function onResizeEnd(): void {
  if (!resizing) return;
  resizing = false;
  window.removeEventListener("pointermove", onResizing);
  window.removeEventListener("pointerup", onResizeEnd);
  window.removeEventListener("pointercancel", onResizeEnd);
  activePointerId = null;
}

/** -----------------------------
 * Drawer styles
 * ----------------------------- */
const contentWrapperStyle = computed(() => {
  if (drawerPlacement.value === "right") {
    // 桌面端：铺满上下，避免出现/消失滚动条导致的缩放抖动
    return {
      top: "0",
      bottom: "0",
      height: "100%",
      right: "0",
      borderRadius: "0",
      overflow: "hidden",
      boxShadow: "0 12px 34px rgba(0,0,0,0.16)",
    } as Record<string, any>;
  }

  // 手机端：bottom-sheet，圆角顶边 + safe-area
  return {
    borderRadius: "14px 14px 0 0",
    overflow: "hidden",
    boxShadow: "0 -12px 34px rgba(0,0,0,0.14)",
  } as Record<string, any>;
});

const drawerBodyStyle = computed(() => {
  return {
    padding: "0",
    height: "100%",
    display: "flex",
    flexDirection: "column",
  } as Record<string, any>;
});

// Allow seeing the model behind the drawer a bit more (still blocks clicks via mask).
const maskStyle = computed(() => {
  return {
    background: isDark.value ? "rgba(0,0,0,0.30)" : "rgba(0,0,0,0.14)",
  } as Record<string, any>;
});

/** 合并并回写 settings / Patch settings back to parent */
function patchSettings(
  patch: Omit<Partial<ViewerSettings>, "rotationDeg"> & {
    rotationDeg?: Partial<ViewerSettings["rotationDeg"]>;
  }
): void {
  emit("update:settings", {
    ...props.settings,
    ...patch,
    rotationDeg: {
      ...props.settings.rotationDeg,
      ...(patch.rotationDeg ?? {}),
    },
  });
}

/* -----------------------------
 * Display / Pose settings
 * ----------------------------- */

const recordFpsModel = computed({
  get: () => props.settings.frame_rate ?? 60,
  set: (v: number) =>
    patchSettings({ frame_rate: Math.max(1, Math.min(120, Math.floor(v))) }),
});

const atomScaleModel = computed({
  get: () => props.settings.atomScale,
  set: (v: number) => patchSettings({ atomScale: v }),
});

const showAxesModel = computed({
  get: () => props.settings.showAxes,
  set: (v: boolean) => patchSettings({ showAxes: v }),
});

const showBondsModel = computed({
  get: () => props.settings.showBonds,
  set: (v: boolean) => patchSettings({ showBonds: v }),
});

/**
 * 注意 / Note:
 * 你这里文案是 perspective，但变量叫 orthographicModel。
 * 当前逻辑：switch 开 = 透视，所以用 !orthographic 映射。
 * If you want "switch ON = orthographic", remove the negation.
 */
const orthographicModel = computed({
  get: () => !props.settings.orthographic,
  set: (v: boolean) => patchSettings({ orthographic: !v }),
});

const viewPresetOptions = computed(() => [
  { label: t("settings.panel.display.viewPresetFront"), value: "front" },
  { label: t("settings.panel.display.viewPresetSide"), value: "side" },
  { label: t("settings.panel.display.viewPresetTop"), value: "top" },
]);

// View presets selection is a controlled value so we can enforce constraints:
// - At least one preset must be selected.
// - At most two presets; selecting a 3rd auto-unchecks the oldest.
const viewPresetsModel = ref<ViewPreset[]>(["front"]);

function syncViewPresetsFromProps(): void {
  const cur = normalizeViewPresets(props.settings.viewPresets);
  if (cur.length > 0) {
    viewPresetsModel.value = cur;
    return;
  }
  // Backward-compat: old dualViewEnabled implies [front, side]
  if (props.settings.dualViewEnabled) {
    viewPresetsModel.value = ["front", "side"];
    return;
  }
  // Never allow empty in UI
  viewPresetsModel.value = ["front"];
}

watch(
  () => [props.settings.viewPresets, props.settings.dualViewEnabled] as const,
  () => syncViewPresetsFromProps(),
  { immediate: true, deep: true }
);

function onViewPresetsChange(nextRaw: any): void {
  // Do NOT normalize here: the change payload may contain 3 items.
  // We need the raw set to correctly detect the newly added preset and drop the oldest.
  const arr = Array.isArray(nextRaw) ? nextRaw : [];
  const next = arr.filter(
    (x): x is ViewPreset => x === "front" || x === "side" || x === "top"
  );
  const prev = viewPresetsModel.value;

  // Prevent unselecting all
  if (!next || next.length === 0) {
    message.warning(t("settings.panel.display.viewPresetsNeedOne"));
    return;
  }

  // Build a stable selection order based on user actions:
  // keep previous ones that are still selected, then append newly added ones.
  const keep = prev.filter((p) => next.includes(p));
  const added = next.filter((p) => !prev.includes(p));
  const merged = [...keep, ...added];

  // Enforce max-two: drop the oldest (front of the array).
  while (merged.length > 2) merged.shift();

  viewPresetsModel.value = merged;
  patchSettings({ viewPresets: merged, dualViewEnabled: false });
}

const dualViewDistanceModel = computed({
  get: () => props.settings.dualViewDistance ?? 10,
  set: (v: number) => patchSettings({ dualViewDistance: v }),
});

// Allow the distance control to represent fitted camera distances for larger models.
// Keep a conservative minimum upper bound so the UI stays usable.
// const dualViewDistanceMax = computed(() => {
//     const v = props.settings.dualViewDistance ?? 10;
//     return Math.max(200, Math.ceil(v * 1.2));
// });
const dualViewDistanceMax = 500;

// Dual view split ratio: store as 0..1 in settings, expose as 10..90 (%) in UI
const dualViewSplitPctModel = computed({
  get: () => {
    const r =
      typeof props.settings.dualViewSplit === "number"
        ? props.settings.dualViewSplit
        : 0.5;
    return Math.round(Math.max(0.1, Math.min(0.9, r)) * 100);
  },
  set: (pct: number) => {
    const r = Math.max(0.1, Math.min(0.9, pct / 100));
    patchSettings({ dualViewSplit: r });
  },
});

const rotXModel = computed({
  get: () => props.settings.rotationDeg.x,
  set: (v: number) => patchSettings({ rotationDeg: { x: v } }),
});

const rotYModel = computed({
  get: () => props.settings.rotationDeg.y,
  set: (v: number) => patchSettings({ rotationDeg: { y: v } }),
});

const rotZModel = computed({
  get: () => props.settings.rotationDeg.z,
  set: (v: number) => patchSettings({ rotationDeg: { z: v } }),
});

function resetPose(): void {
  patchSettings({ rotationDeg: { x: 0, y: 0, z: 0 } });
}

function resetDistance(): void {
  // Restore the fitted distance captured on model load.
  // Do not touch model rotation so users can keep their chosen orientation.
  const d =
    typeof props.settings.initialDualViewDistance === "number" &&
    Number.isFinite(props.settings.initialDualViewDistance)
      ? props.settings.initialDualViewDistance
      : typeof props.settings.dualViewDistance === "number" &&
        Number.isFinite(props.settings.dualViewDistance)
      ? props.settings.dualViewDistance
      : 10;
  patchSettings({ dualViewDistance: d });
}

/* -----------------------------
 * LAMMPS type -> element mapping
 * ----------------------------- */

const lammpsTypeMapModel = computed<LammpsTypeMapItem[]>({
  get: () =>
    (viewerApi.value?.activeLayerTypeMap.value as
      | LammpsTypeMapItem[]
      | undefined) ?? [],
  set: (v) => viewerApi.value?.setActiveLayerTypeMap(v),
});

const atomicOptions = computed(() =>
  ATOMIC_SYMBOLS.map((symRaw) => {
    const sym = normalizeElementSymbol(symRaw) || "E";
    return { value: sym, label: sym === "E" ? "E (Unknown)" : sym };
  })
);

function filterAtomicOption(
  input: string,
  option?: { value?: unknown; label?: unknown }
): boolean {
  const q = (input ?? "").trim().toLowerCase();
  if (!q) return true;

  const value = String(option?.value ?? "").toLowerCase();
  const label = String(option?.label ?? "").toLowerCase();
  return value.includes(q) || label.includes(q);
}

function toInt(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v ?? ""));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.floor(n));
}

function toElement(v: unknown): string {
  return normalizeElementSymbol(String(v ?? "")) || "E";
}

function addLammpsRow(): void {
  const used = new Set(
    lammpsTypeMapModel.value.map((r) => toInt((r as any).typeId, 1))
  );
  let next = 1;
  while (used.has(next)) next += 1;
  lammpsTypeMapModel.value = [
    ...lammpsTypeMapModel.value,
    { typeId: next, element: "E" },
  ];
}

function removeLammpsRow(idx: number): void {
  lammpsTypeMapModel.value = lammpsTypeMapModel.value.filter(
    (_, i) => i !== idx
  );
}

function clearLammpsRows(): void {
  lammpsTypeMapModel.value = [];
}

function onLammpsTypeId(idx: number, v: unknown): void {
  const typeId = toInt(v, 1);
  lammpsTypeMapModel.value = lammpsTypeMapModel.value.map((row, i) =>
    i === idx ? { ...row, typeId } : row
  );
}

function onLammpsElementChange(idx: number, v: unknown): void {
  const element = toElement(v);
  lammpsTypeMapModel.value = lammpsTypeMapModel.value.map((row, i) =>
    i === idx ? { ...row, element } : row
  );
}

function onRefreshTypeMap(): void {
  viewerApi.value?.refreshTypeMap();
}
</script>

<style src="./index.css"></style>
