<template>
    <div v-if="visible" class="atom-inspector" @pointerdown.stop>
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
                <a-typography-text type="secondary">{{ t('viewer.inspect.hint') }}</a-typography-text>
            </div>

            <div v-else class="atom-inspector__content">
                <div class="atom-inspector__atoms">
                    <div v-for="(a, i) in selected" :key="`${a.layerId}:${a.atomIndex}`" class="atom-inspector__atom">
                        <div class="atom-inspector__atomLine">
                            <span class="atom-inspector__badge">{{ i + 1 }}</span>
                            <span class="atom-inspector__el">{{ a.element }}</span>
                            <span class="atom-inspector__meta">Z={{ a.atomicNumber }}</span>
                            <span class="atom-inspector__meta">idx={{ a.atomIndex + 1 }}</span>
                            <span v-if="a.id != null" class="atom-inspector__meta">id={{ a.id }}</span>
                            <span v-if="a.typeId != null" class="atom-inspector__meta">type={{ a.typeId }}</span>
                        </div>
                        <div class="atom-inspector__coords">
                            x={{ fmt(a.position?.[0]) }}, y={{ fmt(a.position?.[1]) }}, z={{ fmt(a.position?.[2]) }}
                        </div>
                    </div>
                </div>

                <a-divider style="margin: 10px 0" />

                <div class="atom-inspector__measures">
                    <div v-if="measure.distance12 != null" class="atom-inspector__measure">
                        <span class="atom-inspector__measureLabel">{{ t('viewer.inspect.distance') }} (1-2)</span>
                        <span class="atom-inspector__measureValue">{{ fmt(measure.distance12) }} Å</span>
                    </div>
                    <div v-if="measure.distance23 != null" class="atom-inspector__measure">
                        <span class="atom-inspector__measureLabel">{{ t('viewer.inspect.distance') }} (2-3)</span>
                        <span class="atom-inspector__measureValue">{{ fmt(measure.distance23) }} Å</span>
                    </div>
                    <div v-if="measure.angleDeg != null" class="atom-inspector__measure">
                        <span class="atom-inspector__measureLabel">{{ t('viewer.inspect.angle') }}</span>
                        <span class="atom-inspector__measureValue">{{ fmt(measure.angleDeg) }}°</span>
                    </div>
                    <div v-if="selected.length > 1" class="atom-inspector__measureHint">
                        <a-typography-text type="secondary">
                            {{ t('viewer.inspect.orderHint') }}
                        </a-typography-text>
                    </div>
                </div>
            </div>
        </div>
    </div>
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

    background: rgba(255, 255, 255, 0.92);
    border: 1px solid rgba(0, 0, 0, 0.08);
    border-radius: 10px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
    backdrop-filter: blur(8px);
    padding: 10px 12px;
}

/* Dark mode (Ant Design theme sets body class) */
:global(.dark) .atom-inspector {
    background: rgba(20, 20, 20, 0.88);
    border-color: rgba(255, 255, 255, 0.12);
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

.atom-inspector__empty {
    font-size: 12px;
}

.atom-inspector__atom {
    padding: 6px 0;
    border-bottom: 1px dashed rgba(0, 0, 0, 0.08);
}

:global(.dark) .atom-inspector__atom {
    border-bottom-color: rgba(255, 255, 255, 0.12);
}

.atom-inspector__atom:last-child {
    border-bottom: none;
}

.atom-inspector__atomLine {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 6px;
    font-size: 12px;
}

.atom-inspector__badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 9px;
    background: rgba(0, 0, 0, 0.06);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
}

:global(.dark) .atom-inspector__badge {
    background: rgba(255, 255, 255, 0.12);
}

.atom-inspector__el {
    font-weight: 600;
}

.atom-inspector__meta {
    font-variant-numeric: tabular-nums;
    opacity: 0.85;
}

.atom-inspector__coords {
    font-size: 12px;
    opacity: 0.9;
    margin-top: 2px;
    margin-left: 25px;
    font-variant-numeric: tabular-nums;
    word-break: break-word;
}

.atom-inspector__measures {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.atom-inspector__measure {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    font-size: 12px;
}

.atom-inspector__measureLabel {
    opacity: 0.85;
}

.atom-inspector__measureValue {
    font-variant-numeric: tabular-nums;
    font-weight: 600;
}

.atom-inspector__measureHint {
    font-size: 12px;
}

/* Mobile: avoid overlapping the bottom AnimBar (which can be wide). */
@media (max-width: 640px) {
    .atom-inspector {
        top: 56px;
        bottom: auto;
    }
}
</style>
