<template>
    <a-drawer v-model:open="openModel" :title="t('settings.title')" placement="right"
        width="min(360px, calc(100vw - 24px))" :mask="true"
        :mask-closable="true" :destroy-on-close="false">
        <!-- 关键：activeKey 由父组件控制 -->
        <a-collapse v-model:activeKey="activeKeyModel" ghost accordion>
            <!-- 文件 / 导出 / 解析 -->
            <a-collapse-panel key="files" :header="t('settings.panel.files.header')">
                <a-form layout="vertical">
                    <a-form-item>
                        <a-button type="primary" block :disabled="!viewerApi" @click="onOpenFile">
                            {{ t('settings.panel.files.openFile') }}
                        </a-button>
                        <a-typography-text type="secondary" style="display:block;margin-top:6px;">
                            {{ t('settings.panel.files.openFileHint') }}
                        </a-typography-text>
                    </a-form-item>

                    <a-divider style="margin: 8px 0" />

                    <a-form-item :label="t('settings.panel.files.export.header')">
                        <a-row :gutter="8" align="middle">
                            <a-col :flex="1">
                                <a-input-number v-model:value="exportScale" :min="1" :max="5" :step="0.1"
                                    :precision="1" :controls="false" style="width: 100%" />
                            </a-col>
                            <a-col :style="{ width: '96px' }">
                                <a-button block type="primary" :disabled="!hasAnyLayer" @click="onExport">
                                    {{ t('settings.panel.files.export.button') }}
                                </a-button>
                            </a-col>
                        </a-row>

                        <div style="margin-top: 8px">
                            <a-checkbox v-model:checked="exportTransparent">
                                {{ t('settings.panel.files.export.transparent') }}
                            </a-checkbox>
                        </div>

                        <a-typography-text type="secondary" style="display:block;margin-top:6px;">
                            {{ t('settings.panel.files.export.hint') }}
                        </a-typography-text>
                    </a-form-item>

                    <a-divider style="margin: 8px 0" />

                    <a-form-item :label="t('settings.panel.files.parse.header')">
                        <a-space direction="vertical" :size="6" style="width: 100%">
                            <a-select size="small" v-model:value="parseModeModel" :options="parseModeOptions"
                                :disabled="!hasAnyLayer" style="width: 100%" />

                            <a-alert v-if="viewerApi?.parseInfo.success === false" type="error" show-icon
                                :description="viewerApi?.parseInfo.errorMsg || '-'" />

                            <a-descriptions size="small" :column="1" bordered>
                                <a-descriptions-item :label="t('viewer.parse.format')">
                                    <a-tag>{{ viewerApi?.parseInfo.format || '-' }}</a-tag>
                                </a-descriptions-item>
                                <a-descriptions-item :label="t('viewer.parse.file')">
                                    <span style="word-break: break-all">{{ viewerApi?.parseInfo.fileName || '-' }}</span>
                                </a-descriptions-item>
                                <a-descriptions-item :label="t('viewer.parse.atoms')">
                                    {{ viewerApi?.parseInfo.atomCount ?? 0 }}
                                </a-descriptions-item>
                                <a-descriptions-item v-if="(viewerApi?.parseInfo.frameCount ?? 0) > 1"
                                    :label="t('viewer.parse.frames')">
                                    {{ viewerApi?.parseInfo.frameCount }}
                                </a-descriptions-item>
                            </a-descriptions>
                        </a-space>
                    </a-form-item>
                </a-form>
            </a-collapse-panel>
            <!-- 显示 / 视图 -->
            <a-collapse-panel key="display" :header="t('settings.panel.display.header')">
                <a-form layout="vertical">
                    <!-- 投影 -->
                    <a-form-item>
                        <a-row justify="space-between" align="middle">
                            <a-col>{{ t("settings.panel.display.perspective") }}</a-col>
                            <a-col>
                                <a-switch v-model:checked="orthographicModel" />
                            </a-col>
                        </a-row>
                    </a-form-item>

                    <!-- 坐标轴 -->
                    <a-form-item>
                        <a-row justify="space-between" align="middle">
                            <a-col>{{ t("settings.panel.display.axes") }}</a-col>
                            <a-col>
                                <a-switch v-model:checked="showAxesModel" />
                            </a-col>
                        </a-row>
                    </a-form-item>

                    <!-- Bonds -->
                    <a-form-item>
                        <a-row justify="space-between" align="middle">
                            <a-col>{{ t("settings.panel.display.bonds") }}</a-col>
                            <a-col>
                                <a-switch v-model:checked="showBondsModel" />
                            </a-col>
                        </a-row>
                    </a-form-item>

                    <!-- 原子大小 -->
                    <a-form-item :label="t('settings.panel.display.atomSize')">
                        <a-row :gutter="8" align="middle">
                            <a-col :flex="1">
                                <a-slider v-model:value="atomScaleModel" :min="0.2" :max="2" :step="0.05" />
                            </a-col>
                            <a-col :style="{ width: '96px' }">
                                <a-input-number v-model:value="atomScaleModel" :min="0.2" :max="2" :step="0.05"
                                    style="width: 100%" />
                            </a-col>
                        </a-row>
                    </a-form-item>


                    <!-- 录制帧率 -->
                    <a-form-item :label="t('settings.panel.display.recordFps')">
                        <a-row :gutter="8" align="middle">
                            <a-col :flex="1">
                                <a-slider v-model:value="recordFpsModel" :min="1" :max="120" :step="1" />
                            </a-col>
                            <a-col :style="{ width: '96px' }">
                                <a-input-number v-model:value="recordFpsModel" :min="1" :max="120" :step="1"
                                    style="width: 100%" />
                            </a-col>
                        </a-row>

                        <a-typography-text type="secondary" style="display:block;margin-top:6px;">
                            {{ t('settings.panel.display.recordFpsHint') }}
                        </a-typography-text>
                    </a-form-item>

                </a-form>
            </a-collapse-panel>

            <!-- 姿态 -->
            <a-collapse-panel key="pose" :header="t('settings.panel.pose.header')">
                <a-form layout="vertical">
                    <a-form-item :label="t('settings.panel.pose.rotX')">
                        <a-row :gutter="8" align="middle">
                            <a-col :flex="1">
                                <a-slider v-model:value="rotXModel" :min="-180" :max="180" :step="1" />
                            </a-col>
                            <a-col :style="{ width: '96px' }">
                                <a-input-number v-model:value="rotXModel" :min="-180" :max="180" :step="1"
                                    style="width: 100%" />
                            </a-col>
                        </a-row>
                    </a-form-item>

                    <a-form-item :label="t('settings.panel.pose.rotY')">
                        <a-row :gutter="8" align="middle">
                            <a-col :flex="1">
                                <a-slider v-model:value="rotYModel" :min="-180" :max="180" :step="1" />
                            </a-col>
                            <a-col :style="{ width: '96px' }">
                                <a-input-number v-model:value="rotYModel" :min="-180" :max="180" :step="1"
                                    style="width: 100%" />
                            </a-col>
                        </a-row>
                    </a-form-item>

                    <a-form-item :label="t('settings.panel.pose.rotZ')">
                        <a-row :gutter="8" align="middle">
                            <a-col :flex="1">
                                <a-slider v-model:value="rotZModel" :min="-180" :max="180" :step="1" />
                            </a-col>
                            <a-col :style="{ width: '96px' }">
                                <a-input-number v-model:value="rotZModel" :min="-180" :max="180" :step="1"
                                    style="width: 100%" />
                            </a-col>
                        </a-row>
                    </a-form-item>

                    <a-form-item>
                        <a-row :gutter="8">
                            <a-col :span="12">
                                <a-button block @click="resetPose">
                                    {{ t("settings.panel.pose.resetPose") }}
                                </a-button>
                            </a-col>
                            <a-col :span="12">
                                <a-button block @click="resetView">
                                    {{ t("settings.panel.pose.resetView") }}
                                </a-button>
                            </a-col>
                        </a-row>
                    </a-form-item>
                </a-form>
            </a-collapse-panel>

            <!-- LAMMPS dump data -->
            <a-collapse-panel key="lammps" :header="t('settings.panel.lammps.header')">
                <a-form layout="vertical">
                    <a-alert type="info" show-icon :message="t('settings.panel.lammps.alert')" />

                    <a-form-item :label="t('settings.panel.lammps.mapLabel')" style="margin-top: 12px;">
                        <div v-for="(row, idx) in lammpsTypeMapModel" :key="`${row.typeId}-${idx}`"
                            style="margin-bottom: 8px;">
                            <a-row :gutter="8" align="middle">
                                <a-col :span="8">
                                    <a-input-number :min="1" :step="1" :value="row.typeId" style="width: 100%;"
                                        :placeholder="t('settings.panel.lammps.typePlaceholder')"
                                        @change="onLammpsTypeId(idx, $event)" />
                                </a-col>

                                <a-col :span="10">
                                    <a-select show-search :value="row.element" style="width: 100%;"
                                        :placeholder="t('settings.panel.lammps.elementPlaceholder')"
                                        :options="atomicOptions" :filter-option="filterAtomicOption"
                                        @change="onLammpsElementChange(idx, $event)" />
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
                            <a-button block type="primary" :disabled="!viewerApi" @click="onRefreshTypeMap">
                                {{ t("settings.panel.lammps.refresh") }}
                            </a-button>
                        </div>

                        <a-typography-text type="secondary" style="display:block;margin-top:8px;">
                            {{ t("settings.panel.lammps.hint") }}
                        </a-typography-text>
                    </a-form-item>
                </a-form>
            </a-collapse-panel>

            <!-- 多模型图层 -->
            <a-collapse-panel key="layers" :header="t('settings.panel.layers.header')">
                <a-space direction="vertical" :size="8" style="width: 100%">
                    <a-alert v-if="!viewerApi" type="info" show-icon
                        :message="t('settings.panel.layers.noViewer')" />

                    <a-alert v-else-if="layerList.length === 0" type="info" show-icon
                        :message="t('settings.panel.layers.empty')" />

                    <div v-else class="layers-list">
                        <div v-for="l in layerList" :key="l.id" class="layer-row" :class="{ active: l.id === activeLayerId }"
                            @click="onSetActive(l.id)">
                            <div class="layer-left">
                                <a-radio :checked="l.id === activeLayerId" />
                            </div>
                            <div class="layer-main">
                                <div class="layer-name" :title="l.name">{{ l.name }}</div>
                                <div class="layer-meta">
                                    {{ t('settings.panel.layers.meta', { atoms: l.atomCount, frames: l.frameCount }) }}
                                </div>
                            </div>
                            <div class="layer-right" @click.stop>
                                <a-switch size="small" :checked="l.visible" @change="(v: boolean) => onToggleLayer(l.id, v)" />
                            </div>
                        </div>
                    </div>

                    <a-typography-text type="secondary" style="display:block;">
                        {{ t('settings.panel.layers.hint') }}
                    </a-typography-text>
                </a-space>
            </a-collapse-panel>

        </a-collapse>
    </a-drawer>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import type { ViewerSettings } from "../../lib/viewer/settings";
import { ATOMIC_SYMBOLS, normalizeElementSymbol } from "../../lib/structure/chem";
import { useI18n } from "vue-i18n";
import { viewerApiRef } from "../../lib/viewer/bridge";
import type { ParseMode } from "../../lib/structure/parse";

/** 本地类型：避免 settings.ts 导出名不一致造成报错
 * Local type to avoid export-name mismatch in settings.ts
 */
type LammpsTypeMapItem = { typeId: number; element: string };

const { t } = useI18n();

const viewerApi = computed(() => viewerApiRef.value);
const layerList = computed(() => viewerApi.value?.layers.value ?? []);
const activeLayerId = computed(() => viewerApi.value?.activeLayerId.value ?? null);
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
    void viewerApi.value.exportPng({ scale: exportScale.value, transparent: exportTransparent.value });
}

function onSetActive(id: string): void {
    viewerApi.value?.setActiveLayer(id);
}

function onToggleLayer(id: string, visible: boolean): void {
    viewerApi.value?.setLayerVisible(id, visible);
}

const props = defineProps<{
    open: boolean;
    settings: ViewerSettings;
    /**
     * 折叠面板当前展开项（accordion 模式下为单 key）
     * Current expanded panel key (single key under accordion)
     */
    activeKey: string;
}>();

const emit = defineEmits<{
    (e: "update:open", v: boolean): void;
    (e: "update:settings", v: ViewerSettings): void;
    (e: "update:activeKey", v: string): void;
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
const activeKeyModel = computed<string>({
    get: () => props.activeKey,
    set: (v: string) => emit("update:activeKey", v),
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

function resetView(): void {
    patchSettings({
        rotationDeg: { x: 0, y: 0, z: 0 },
        resetViewSeq: (props.settings.resetViewSeq ?? 0) + 1,
    });
}

/* -----------------------------
 * LAMMPS type -> element mapping
 * ----------------------------- */

const lammpsTypeMapModel = computed<LammpsTypeMapItem[]>({
    get: () => (props.settings.lammpsTypeMap as LammpsTypeMapItem[] | undefined) ?? [],
    set: (v) => patchSettings({ lammpsTypeMap: v }),
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
    lammpsTypeMapModel.value = [...lammpsTypeMapModel.value, { typeId: 1, element: "E" }];
}

function removeLammpsRow(idx: number): void {
    lammpsTypeMapModel.value = lammpsTypeMapModel.value.filter((_, i) => i !== idx);
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

<style scoped>
.layers-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.layer-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-radius: 10px;
    background: rgba(127, 127, 127, 0.08);
    cursor: pointer;
    user-select: none;
}

.layer-row.active {
    outline: 1px solid var(--ant-colorPrimary, #1677ff);
    background: rgba(22, 119, 255, 0.10);
}

.layer-left {
    flex: 0 0 auto;
}

.layer-main {
    flex: 1 1 auto;
    min-width: 0;
}

.layer-name {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.layer-meta {
    font-size: 12px;
    opacity: 0.75;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.layer-right {
    flex: 0 0 auto;
}
</style>
