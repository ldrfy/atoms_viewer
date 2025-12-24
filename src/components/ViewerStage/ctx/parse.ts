import type { Ref } from "vue";
import type { ParseMode, ParseInfo } from "../../../lib/structure/parse";
import type { MaybeRef } from "./common";

export type ParseCtx = {
  hasModel: MaybeRef<boolean>;
  /** ParseInfo is defined in lib/structure/parse. */
  parseInfo: ParseInfo;
  parseMode: Ref<ParseMode>;
  setParseMode: (mode: ParseMode) => void;
};

export function createParseCtx(args: {
  hasModel: MaybeRef<boolean>;
  parseInfo: ParseInfo;
  parseMode: Ref<ParseMode>;
  setParseMode: (mode: ParseMode) => void;
}): ParseCtx {
  return {
    hasModel: args.hasModel,
    parseInfo: args.parseInfo,
    parseMode: args.parseMode,
    setParseMode: args.setParseMode,
  };
}
