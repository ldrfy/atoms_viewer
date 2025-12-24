<template>
    <div v-if="visible" class="empty-overlay">
        <div class="empty-card">
            <a-empty>
                <template #description>
                    <a-typography style="text-align: center">
                        <a-typography-title :level="4" style="margin: 0">
                            {{ t("viewer.empty.title") }}
                        </a-typography-title>

                        <a-typography-text type="secondary">
                            {{ t("viewer.empty.subtitle") }}
                        </a-typography-text>
                    </a-typography>
                </template>

                <a-space direction="vertical" :size="12" class="empty-actions">
                    <a-button type="primary" @click="ctx.openFilePicker">
                        {{ t("viewer.empty.pickFile") }}
                    </a-button>

                    <a-button @click="ctx.preloadDefault">
                        {{ t("viewer.empty.preloadDefault") }}
                    </a-button>
                </a-space>
            </a-empty>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, unref } from "vue";
import { useI18n } from "vue-i18n";

import type { EmptyCtx } from "../ctx";

const props = defineProps<{ ctx: EmptyCtx }>();
const { t } = useI18n();

const visible = computed(() => {
    return !unref(props.ctx.hasModel) && !unref(props.ctx.isDragging) && !unref(props.ctx.isLoading);
});
</script>
