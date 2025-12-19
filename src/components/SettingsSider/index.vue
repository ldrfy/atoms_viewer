<template>
    <a-layout-sider class="sider" :trigger="null" collapsible v-model:collapsed="collapsedModel" :width="320"
        :collapsedWidth="56">
        <div class="sider-header">
            <a-button type="text" class="collapse-btn" @click="toggleCollapsed" aria-label="toggle sidebar">
                <MenuUnfoldOutlined v-if="collapsedModel" />
                <MenuFoldOutlined v-else />
            </a-button>
            <div v-if="!collapsedModel" class="sider-title">配置</div>
        </div>

        <div v-if="!collapsedModel" class="sider-body">
            <a-collapse v-model:activeKey="activeKeysModel" ghost>
                <!-- 显示 / 视图 -->
                <a-collapse-panel key="display" header="显示">
                    <a-form layout="vertical">

                        <!-- 投影：一行 -->
                        <a-form-item label="">
                            <div class="row">
                                <div class="row-left">
                                    <span class="hint">是否透视</span>
                                </div>

                                <div class="row-right">
                                    <a-switch v-model:checked="orthographicModel" />
                                </div>
                            </div>
                        </a-form-item>

                        <!-- 坐标轴：switch + 右侧按钮一行 -->
                        <a-form-item>
                            <div class="row">
                                <div class="row-left">
                                    <span class="item-label">坐标轴</span>
                                </div>
                                <div class="row-right">
                                    <a-switch v-model:checked="showAxesModel" />
                                </div>
                            </div>
                        </a-form-item>

                        <!-- Bonds：一行 -->
                        <a-form-item>
                            <div class="row">
                                <div class="row-left">
                                    <span class="item-label">键</span>
                                </div>
                                <div class="row-right">
                                    <a-switch v-model:checked="showBondsModel" />
                                </div>
                            </div>
                        </a-form-item>

                        <a-form-item label="原子大小">
                            <a-slider v-model:value="atomScaleModel" :min="0.2" :max="2" :step="0.05" />
                        </a-form-item>

                        <a-form-item>
                            <div class="row">
                                <div class="row-left">
                                    <a-button @click="resetView">恢复原始位置</a-button>
                                </div>
                                <div class="row-right">
                                    <a-select v-model:value="backgroundModel" :options="bgOptions" />
                                </div>
                            </div>
                        </a-form-item>
                    </a-form>
                </a-collapse-panel>

                <!-- 姿态 -->
                <a-collapse-panel key="pose" header="姿态（模型旋转，单位：度）">
                    <a-form layout="vertical">
                        <a-form-item label="X 轴旋转">
                            <div class="angle-row">
                                <a-slider v-model:value="rotXModel" :min="-180" :max="180" :step="1" />
                                <a-input-number v-model:value="rotXModel" :min="-180" :max="180" :step="1" />
                            </div>
                        </a-form-item>

                        <a-form-item label="Y 轴旋转">
                            <div class="angle-row">
                                <a-slider v-model:value="rotYModel" :min="-180" :max="180" :step="1" />
                                <a-input-number v-model:value="rotYModel" :min="-180" :max="180" :step="1" />
                            </div>
                        </a-form-item>

                        <a-form-item label="Z 轴旋转">
                            <div class="angle-row">
                                <a-slider v-model:value="rotZModel" :min="-180" :max="180" :step="1" />
                                <a-input-number v-model:value="rotZModel" :min="-180" :max="180" :step="1" />
                            </div>
                        </a-form-item>

                        <div class="pose-actions">
                            <a-button @click="resetPose">重置旋转</a-button>
                        </div>
                    </a-form>
                </a-collapse-panel>
            </a-collapse>
        </div>
    </a-layout-sider>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { MenuFoldOutlined, MenuUnfoldOutlined } from "@ant-design/icons-vue";
import type { ViewerSettings } from "../../lib/viewer/settings";

const props = defineProps<{
    collapsed: boolean;
    activeKeys: string[];
    settings: ViewerSettings;
    bgOptions: Array<{ value: ViewerSettings["background"]; label: string }>;
}>();

const emit = defineEmits<{
    (e: "update:collapsed", v: boolean): void;
    (e: "update:activeKeys", v: string[]): void;
    (e: "update:settings", v: ViewerSettings): void;
}>();

const collapsedModel = computed({
    get: () => props.collapsed,
    set: (v) => emit("update:collapsed", v),
});

const activeKeysModel = computed({
    get: () => props.activeKeys,
    set: (v) => emit("update:activeKeys", v),
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

const orthographicModel = computed({
    get: () => props.settings.orthographic,
    set: (v: boolean) => patchSettings({ orthographic: v }),
});

const backgroundModel = computed({
    get: () => props.settings.background,
    set: (v: ViewerSettings["background"]) => patchSettings({ background: v }),
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

function toggleCollapsed(): void {
    collapsedModel.value = !collapsedModel.value;
}

function resetPose(): void {
    patchSettings({ rotationDeg: { x: 0, y: 0, z: 0 } });
}

function resetView(): void {
    patchSettings({
        rotationDeg: { x: 0, y: 0, z: 0 },
        resetViewSeq: (props.settings.resetViewSeq ?? 0) + 1,
    });
}

function snapPose(deltaDeg: number): void {
    patchSettings({ rotationDeg: { z: rotZModel.value + deltaDeg } });
}
</script>

<style scoped src="./index.css"></style>
