<template>
  <a-config-provider :theme="antTheme">
    <a-layout class="root">
      <a-layout-sider
        class="sider"
        :trigger="null"
        collapsible
        v-model:collapsed="collapsed"
        :width="280"
        :collapsedWidth="56"
      >
        <div class="sider-header">
          <a-button
            type="text"
            class="collapse-btn"
            @click="toggleCollapsed"
            aria-label="toggle sidebar"
          >
            <MenuUnfoldOutlined v-if="collapsed" />
            <MenuFoldOutlined v-else />
          </a-button>
          <div v-if="!collapsed" class="sider-title">配置</div>
        </div>

        <div v-if="!collapsed" class="sider-body">
          <a-collapse v-model:activeKey="activeKeys" ghost>
            <a-collapse-panel key="display" header="显示">
              <a-form layout="vertical">
                <a-form-item label="原子大小">
                  <a-slider
                    v-model:value="settings.atomScale"
                    :min="0.2"
                    :max="2"
                    :step="0.05"
                  />
                </a-form-item>

                <a-form-item label="显示坐标轴">
                  <a-switch v-model:checked="settings.showAxes" />
                </a-form-item>

                <a-form-item label="显示键（Bonds）">
                  <a-switch v-model:checked="settings.showBonds" />
                </a-form-item>
              </a-form>
            </a-collapse-panel>

            <a-collapse-panel key="render" header="渲染">
              <a-form layout="vertical">
                <a-form-item label="背景">
                  <a-select
                    v-model:value="settings.background"
                    :options="bgOptions"
                  />
                </a-form-item>
              </a-form>
            </a-collapse-panel>
          </a-collapse>
        </div>
      </a-layout-sider>

      <a-layout>
        <a-layout-header class="header">
          <div class="header-left">ldr_atoms</div>
          <div class="header-right">
            <!-- 先放占位：后续接“打开 xyz / 导入 CNT/graphene” -->
            <!-- <a-button type="primary" @click="noop">打开 XYZ</a-button> -->
          </div>
        </a-layout-header>

        <a-layout-content class="content">
          <ViewerStage />
        </a-layout-content>
      </a-layout>
    </a-layout>
  </a-config-provider>
</template>

<script setup lang="ts">
import { reactive, ref } from "vue";
import { MenuFoldOutlined, MenuUnfoldOutlined } from "@ant-design/icons-vue";
import ViewerStage from "./components/ViewerStage.vue";
import { theme } from "ant-design-vue";
const antTheme = {
  algorithm: theme.darkAlgorithm,
};
const collapsed = ref(false);
const activeKeys = ref<string[]>(["display"]);

const settings = reactive({
  atomScale: 1,
  showAxes: true,
  showBonds: true,
  background: "dark",
});

const bgOptions = [
  { value: "dark", label: "深色" },
  { value: "light", label: "浅色" },
];

function toggleCollapsed(): void {
  collapsed.value = !collapsed.value;
}

function noop(): void {
  // 占位：下一步接 xyz 导入
}
</script>

<style scoped>
.root {
  height: 100%;
}

.sider {
  border-right: 1px solid #1f1f1f;
}

.sider-header {
  height: 48px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 8px;
  border-bottom: 1px solid #1f1f1f;
}

.collapse-btn {
  width: 40px;
  height: 40px;
}

.sider-title {
  font-weight: 600;
}

.sider-body {
  padding: 12px;
  overflow: auto;
  height: calc(100% - 48px);
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  border-bottom: 1px solid #1f1f1f;
  background: #0f0f0f;
  color: #e6e6e6;
}

.content {
  height: calc(100% - 64px);
  background: #000;
}
</style>
