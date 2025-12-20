<template>
    <a-drawer v-model:open="openModel" :title="t('settings.title')" placement="right" :width="360" :mask="true"
        :mask-closable="true" :destroy-on-close="false">
        <a-collapse v-model:activeKey="activeKeys" ghost>
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
        </a-collapse>
    </a-drawer>
</template>

<script setup lang="ts">
import { ref,computed } from "vue";
import type { ViewerSettings } from "../../lib/viewer/settings";
import { useI18n } from "vue-i18n";

const { t } = useI18n();
const activeKeys = ref<string[]>(["display", "pose"]);
const props = defineProps<{
    open: boolean;
    settings: ViewerSettings;
}>();

const emit = defineEmits<{
    (e: "update:open", v: boolean): void;
    (e: "update:settings", v: ViewerSettings): void;
}>();

const openModel = computed({
    get: () => props.open,
    set: (v) => emit("update:open", v),
});

function patchSettings(
    patch: Partial<ViewerSettings> & {
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
 * 注意：你这里命名是 orthographicModel，但实际 UI 文案是 perspective。
 * 你当前逻辑是“switch 开 = 透视”，所以用 !orthographic 做映射。
 * 如果你想要“switch 开 = 正交”，就把这里改成不取反。
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
</script>
