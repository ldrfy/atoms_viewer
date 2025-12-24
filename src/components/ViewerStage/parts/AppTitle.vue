<template>
    <div class="app-title">
        <div class="app-title-row">
            <img class="app-logo" :src="logoSrc" alt="logo" />
            <a-typography-title :level="5" :style="{ margin: 0, color: token.colorPrimary }">
                {{ appName }}
            </a-typography-title>
        </div>
    </div>
</template>

<script setup lang="ts">
import { theme } from "ant-design-vue";

withDefaults(
    defineProps<{
        appName: string;
        logoSrc?: string;
    }>(),
    { logoSrc: "public/lav.svg" }
);

const { token } = theme.useToken();
</script>
