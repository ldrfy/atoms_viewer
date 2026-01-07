import type { ParseMode } from './parse';

/** UI parse-mode option item. / 解析模式选项（用于 UI 列表）。 */
export type ParseModeOption = { value: ParseMode; label: string };

/**
 * Build localized parse-mode options.
 * 生成本地化的解析模式选项列表。
 */
export function buildParseModeOptions(t: (key: string) => string): ParseModeOption[] {
  return [
    { value: 'auto', label: t('viewer.parse.modeOptions.auto') },
    { value: 'xyz', label: t('viewer.parse.modeOptions.xyz') },
    { value: 'pdb', label: t('viewer.parse.modeOptions.pdb') },
    { value: 'lammpsdump', label: t('viewer.parse.modeOptions.lammpsdump') },
    { value: 'lammpsdata', label: t('viewer.parse.modeOptions.lammpsdata') },
  ];
}
