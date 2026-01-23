import type { ComputedRef, InjectionKey } from 'vue';

import type { ViewerSettings } from '../../lib/viewer/settings';

export type PatchSettingsFn = (
  patch: Omit<Partial<ViewerSettings>, 'rotationDeg'> & {
    rotationDeg?: Partial<ViewerSettings['rotationDeg']>;
  },
) => void;

/**
 * Keep this context intentionally minimal.
 *
 * Panels own their own logic, but they still need a safe way to read/write
 * the shared ViewerSettings object without prop-drilling.
 */
export interface SettingsSiderContext {
  settings: ComputedRef<ViewerSettings>;
  patchSettings: PatchSettingsFn;
  hasAnyLayer: ComputedRef<boolean>;
}

export const settingsSiderContextKey: InjectionKey<SettingsSiderContext> = Symbol(
  'SettingsSiderContext',
);

export interface SettingsSiderDirtyContext {
  setPanelDirty: (key: string, dirty: boolean) => void;
}

export const settingsSiderDirtyContextKey: InjectionKey<SettingsSiderDirtyContext> = Symbol(
  'SettingsSiderDirtyContext',
);

export interface SettingsSiderDerivedContext {
  filesDirty: ComputedRef<boolean>;
  layersDirty: ComputedRef<boolean>;
  viewDirty: ComputedRef<boolean>;
  rotationDirty: ComputedRef<boolean>;
  otherDirty: ComputedRef<boolean>;
  detailsDirty: ComputedRef<boolean>;
}

export const settingsSiderDerivedContextKey: InjectionKey<SettingsSiderDerivedContext> = Symbol(
  'SettingsSiderDerivedContext',
);

export interface SettingsSiderControlContext {
  replaceSettings: (next: ViewerSettings) => void;
  notifyClearStorageUi?: () => void;
}

export const settingsSiderControlContextKey: InjectionKey<SettingsSiderControlContext> = Symbol(
  'SettingsSiderControlContext',
);
