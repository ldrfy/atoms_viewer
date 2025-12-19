<script setup lang="ts">
import { ref } from "vue";
import { theme } from "ant-design-vue";

import SettingsSider from "./components/SettingsSider";
import ViewerStage from "./components/ViewerStage";

import {
  BG_OPTIONS,
  DEFAULT_SETTINGS,
  type ViewerSettings,
} from "./lib/viewer/settings";

const antTheme = { algorithm: theme.darkAlgorithm };

const collapsed = ref(false);
const activeKeys = ref<string[]>(["display"]);

// 关键：用 ref，而不是 reactive
const settings = ref<ViewerSettings>({
  ...DEFAULT_SETTINGS,
  rotationDeg: { ...DEFAULT_SETTINGS.rotationDeg },
});
</script>

<template>
  <a-config-provider :theme="antTheme">
    <a-layout class="root">
      <SettingsSider
        v-model:collapsed="collapsed"
        v-model:activeKeys="activeKeys"
        v-model:settings="settings"
        :bg-options="BG_OPTIONS"
      />

      <a-layout>
        <a-layout-content class="content">
          <ViewerStage :settings="settings" />
        </a-layout-content>
      </a-layout>
    </a-layout>
  </a-config-provider>
</template>

<style scoped>
.root {
  height: 100%;
}

.content {
  height: 100%;
  background: #000;
}
</style>
