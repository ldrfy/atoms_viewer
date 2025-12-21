<template>
    <a-drawer v-model:open="openModel" :title="t('settings.title')" placement="right" :width="360" :mask="true"
        :mask-closable="true" :destroy-on-close="false">
        <!-- 关键：activeKey 由父组件控制 -->
        <a-collapse v-model:activeKey="activeKeyModel" ghost accordion>
            <!-- 显示 / 视图 -->
            <a-collapse-panel key="display" :header="t('settings.panel.display.header')">
                <a-form layout="vertical">
                    <!-- 投影 -->
                    <a-form-item>
                        <a-row justify="space-between" align="middle">
                            <a-col>{{ t("settings.display.perspective") }}</a-col>
                            <a-col>
                                <a-switch v-model:checked="orthographicModel" />
                            </a-col>
                        </a-row>
                    </a-form-item>

                    <!-- 坐标轴 -->
                    <a-form-item>
                        <a-row justify="space-between" align="middle">
                            <a-col>{{ t("settings.display.axes") }}</a-col>
                            <a-col>
                                <a-switch v-model:checked="showAxesModel" />
                            </a-col>
                        </a-row>
                    </a-form-item>

                    <!-- Bonds -->
                    <a-form-item>
                        <a-row justify="space-between" align="middle">
                            <a-col>{{ t("settings.display.bonds") }}</a-col>
                            <a-col>
                                <a-switch v-model:checked="showBondsModel" />
                            </a-col>
                        </a-row>
                    </a-form-item>

                    <!-- 原子大小 -->
                    <a-form-item :label="t('settings.display.atomSize')">
                        <a-slider v-model:value="atomScaleModel" :min="0.2" :max="2" :step="0.05" />
                    </a-form-item>
                </a-form>
            </a-collapse-panel>

            <!-- 姿态 -->
            <a-collapse-panel key="pose" :header="t('settings.panel.pose.header')">
                <a-form layout="vertical">
                    <a-form-item :label="t('settings.pose.rotX')">
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

                    <a-form-item :label="t('settings.pose.rotY')">
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

                    <a-form-item :label="t('settings.pose.rotZ')">
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
                                    {{ t("settings.pose.resetPose") }}
                                </a-button>
                            </a-col>
                            <a-col :span="12">
                                <a-button block @click="resetView">
                                    {{ t("settings.pose.resetView") }}
                                </a-button>
                            </a-col>
                        </a-row>
                    </a-form-item>
                </a-form>
            </a-collapse-panel>

            <!-- LAMMPS dump -->
            <a-collapse-panel key="lammps" header="LAMMPS dump">
                <a-form layout="vertical">
                    <a-alert type="info" show-icon
                        message="当 dump 只提供 type（数字）时，需要在这里指定 type 对应元素符号，用于颜色/半径/键推断与稳定显示。" />

                    <a-form-item label="type id → 元素符号（支持搜索）" style="margin-top: 12px;">
                        <div v-for="(row, idx) in lammpsTypeMapModel" :key="`${row.typeId}-${idx}`"
                            style="margin-bottom: 8px;">
                            <a-row :gutter="8" align="middle">
                                <a-col :span="8">
                                    <a-input-number :min="1" :step="1" :value="row.typeId" style="width: 100%;"
                                        placeholder="type" @change="onLammpsTypeId(idx, $event)" />
                                </a-col>

                                <a-col :span="10">
                                    <a-select show-search :value="row.element" style="width: 100%;"
                                        placeholder="元素（如 C / O / Fe）" :options="atomicOptions"
                                        :filter-option="filterAtomicOption"
                                        @change="onLammpsElementChange(idx, $event)" />
                                </a-col>

                                <a-col :span="6">
                                    <a-button danger block @click="removeLammpsRow(idx)">删除</a-button>
                                </a-col>
                            </a-row>
                        </div>

                        <a-row :gutter="8">
                            <a-col :span="12">
                                <a-button block @click="addLammpsRow">添加映射</a-button>
                            </a-col>
                            <a-col :span="12">
                                <a-button block @click="clearLammpsRows">清空</a-button>
                            </a-col>
                        </a-row>

                        <a-typography-text type="secondary" style="display:block;margin-top:8px;">
                            建议 dump 输出包含 id、type、x y z。若每帧顺序不固定，解析端会按 id 排序以保证动画不抖动。
                        </a-typography-text>
                    </a-form-item>
                </a-form>
            </a-collapse-panel>
        </a-collapse>
    </a-drawer>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { ViewerSettings } from "../../lib/viewer/settings";
import { ATOMIC_SYMBOLS, normalizeElementSymbol } from "../../lib/structure/chem";
import { useI18n } from "vue-i18n";

/** 本地类型：避免 settings.ts 导出名不一致造成报错
 * Local type to avoid export-name mismatch in settings.ts
 */
type LammpsTypeMapItem = { typeId: number; element: string };

const { t } = useI18n();

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
</script>
