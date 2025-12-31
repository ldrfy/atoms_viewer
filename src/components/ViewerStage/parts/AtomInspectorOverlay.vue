<template>
    <a-card v-if="visible" class="atom-inspector" @pointerdown.stop>
        <div class="atom-inspector__header">
            <div class="atom-inspector__title">{{ t('viewer.inspect.title') }}</div>
            <a-space size="small">
                <a-tooltip :title="t('viewer.inspect.measureMode')">
                    <a-switch v-model:checked="measureMode" size="small" />
                </a-tooltip>
                <a-button size="small" @click="clear" :disabled="selected.length === 0">
                    {{ t('viewer.inspect.clear') }}
                </a-button>
            </a-space>
        </div>

        <div class="atom-inspector__body">

            <div v-if="selected.length === 0" class="atom-inspector__empty">
                <a-typography-text type="secondary">
                    {{ t('viewer.inspect.hint') }}
                </a-typography-text>
            </div>

            <!-- Content -->
            <div v-else class="atom-inspector__content">

                <!-- Atoms -->
                <a-list size="small" :data-source="selected" :split="false" class="atom-inspector__atoms">
                    <template #renderItem="{ item, index }">
                        <a-list-item class="atom-inspector__atom">
                            <div class="atom-row">
                                <!-- index -->
                                <div class="atom-index">
                                    <a-tag color="blue">{{ index + 1 }}</a-tag>
                                </div>

                                <!-- body -->
                                <div class="atom-body">
                                    <div class="atom-header">
                                        <a-typography-text strong class="atom-inspector__el">
                                            {{ item.element }}
                                        </a-typography-text>

                                        <a-typography-text type="secondary">
                                            Z={{ item.atomicNumber }}
                                        </a-typography-text>

                                        <a-typography-text type="secondary">
                                            idx={{ item.atomIndex + 1 }}
                                        </a-typography-text>

                                        <a-typography-text v-if="item.id != null" type="secondary">
                                            id={{ item.id }}
                                        </a-typography-text>

                                        <a-typography-text v-if="item.typeId != null" type="secondary">
                                            type={{ item.typeId }}
                                        </a-typography-text>
                                    </div>

                                    <div class="atom-inspector__coords">
                                        x={{ fmt(item.position?.[0]) }},
                                        y={{ fmt(item.position?.[1]) }},
                                        z={{ fmt(item.position?.[2]) }}
                                    </div>
                                </div>
                            </div>
                        </a-list-item>
                    </template>
                </a-list>

                <!-- Divider -->
                <a-divider style="margin: 10px 0" />

                <!-- Measures -->
                <a-descriptions size="small" :column="1" class="atom-inspector__measures">
                    <a-descriptions-item v-if="measure.distance12 != null"
                        :label="`${t('viewer.inspect.distance')} (1–2)`">
                        {{ fmt(measure.distance12) }} Å
                    </a-descriptions-item>

                    <a-descriptions-item v-if="measure.distance23 != null"
                        :label="`${t('viewer.inspect.distance')} (2–3)`">
                        {{ fmt(measure.distance23) }} Å
                    </a-descriptions-item>

                    <a-descriptions-item v-if="measure.angleDeg != null" :label="t('viewer.inspect.angle')">
                        {{ fmt(measure.angleDeg) }}°
                    </a-descriptions-item>
                </a-descriptions>

                <a-typography-text v-if="selected.length > 1" type="secondary" class="atom-inspector__measureHint">
                    {{ t('viewer.inspect.orderHint') }}
                </a-typography-text>

            </div>
        </div>


    </a-card>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import type { InspectCtx } from "../ctx/inspect";

const props = defineProps<{ ctx: InspectCtx }>();
const { t } = useI18n();

// NOTE: `props.ctx` is a plain object containing nested Refs.
// In Vue templates, nested refs inside a plain object are NOT reliably auto-unwrapped.
// Expose the nested refs as top-level bindings to avoid runtime render errors.
const enabled = props.ctx.enabled;
const measureMode = props.ctx.measureMode;
const selected = props.ctx.selected;
const measure = props.ctx.measure;
const clear = props.ctx.clear;

const visible = computed(() => enabled.value);

function fmt(v: number | null | undefined): string {
    if (v == null || !Number.isFinite(v)) return "-";
    return v.toFixed(4);
}
</script>

<style scoped>
.atom-inspector {
    position: absolute;
    right: 12px;
    bottom: 12px;
    z-index: 25;
    pointer-events: auto;

    width: min(360px, calc(100vw - 24px));
    max-width: calc(100vw - 24px);

}

/* Mobile: avoid overlapping the bottom AnimBar (which can be wide). */
@media (max-width: 640px) {
    .atom-inspector {
        top: 56px;
        bottom: auto;
    }
}

.atom-inspector__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
}

.atom-inspector__title {
    font-weight: 600;
    font-size: 13px;
    line-height: 18px;
}

.atom-inspector__body {
    margin-top: 8px;
}


.atom-row {
    display: flex;
    align-items: flex-start;
}

.atom-index {
    text-align: right;
    margin-right: 8px;
}

.atom-body {
    flex: 1;
}

.atom-header>* {
    margin-right: 8px;
}

.atom-inspector__coords {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
</style>
