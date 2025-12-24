import type { MaybeRef } from "./common";

export type EmptyCtx = {
  hasModel: MaybeRef<boolean>;
  isDragging: MaybeRef<boolean>;
  isLoading: MaybeRef<boolean>;

  openFilePicker: () => void;
  preloadDefault: () => void;
};

export function createEmptyCtx(args: {
  hasModel: MaybeRef<boolean>;
  isDragging: MaybeRef<boolean>;
  isLoading: MaybeRef<boolean>;
  openFilePicker: () => void;
  preloadDefault: () => void;
}): EmptyCtx {
  return {
    hasModel: args.hasModel,
    isDragging: args.isDragging,
    isLoading: args.isLoading,
    openFilePicker: args.openFilePicker,
    preloadDefault: args.preloadDefault,
  };
}
