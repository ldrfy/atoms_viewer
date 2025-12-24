<template>
    <div class="app-footer">
        <a v-if="githubUrl" class="app-footer-link" :href="githubUrl" target="_blank" rel="noopener noreferrer"
            :aria-label="t('viewer.about.openGithub')">
            <span class="app-footer-name">{{ appName }}</span>
            <span class="app-footer-sep">·</span>
            <span class="app-footer-ver">v{{ version }}</span>
            <template v-if="author">
                <span class="app-footer-sep">·</span>
                <span class="app-footer-author">{{ author }}</span>
            </template>
        </a>

        <template v-else>
            <span class="app-footer-name">{{ appName }}</span>
            <span class="app-footer-sep">·</span>
            <span class="app-footer-ver">v{{ version }}</span>
            <template v-if="author">
                <span class="app-footer-sep">·</span>
                <span class="app-footer-author">{{ author }}</span>
            </template>
        </template>
    </div>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";

defineProps<{
    appName: string;
    version: string;
    author?: string;
    githubUrl?: string;
}>();

const { t } = useI18n();
</script>
