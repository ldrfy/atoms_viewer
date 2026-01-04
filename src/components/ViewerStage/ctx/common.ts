import type { Ref } from 'vue';

/**
 * Accept either a raw value or a Ref-wrapped value.
 * Useful for ctx objects passed into parts components.
 */
export type MaybeRef<T> = T | Ref<T>;
