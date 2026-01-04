// eslint.config.js
import js from '@eslint/js';
import globals from 'globals';
import stylistic from '@stylistic/eslint-plugin';
import vue from 'eslint-plugin-vue';
import tseslint from 'typescript-eslint';

export default [
  // 1) 忽略目录
  {
    ignores: [
      'dist', 'coverage', 'node_modules', 'atoms_viewer', '.vscode',
    ],
  },

  // 2) 基础推荐规则
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs['flat/recommended'],

  // 3) 用 ESLint 负责“可自动修复”的格式化/风格（替代 Prettier 的那部分诉求）
  stylistic.configs.customize({
    indent: 2,
    quotes: 'single',
    semi: true,
    jsx: true,
  }),

  // 4) 全局语言选项（浏览器项目）
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.browser,
    },
  },

  // 5) 关键：让 .vue 的 <script lang="ts"> 用 TS parser（注意是 parserOptions.parser，不要覆盖 parser）
  // eslint-plugin-vue 要用 vue-eslint-parser 解析 .vue，TS parser 要放在 parserOptions.parser 里。 :contentReference[oaicite:3]{index=3}
  {
    files: ['**/*.{ts,tsx,vue}'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
      },
    },
  },

  // 6) Vue 模板/脚本缩进等（并避免与 stylistic 的 indent 冲突）
  {
    files: ['**/*.vue'],
    rules: {
      '@stylistic/indent': 'off',

      // 二元运算符换行缩进在不同风格下容易产生噪音；交给 formatter/人工控制。
      '@stylistic/indent-binary-ops': 'off',

      'vue/html-indent': ['error', 2],
      'vue/script-indent': ['error', 2, { baseIndent: 0, switchCase: 1 }],
      'vue/max-attributes-per-line': ['error', { singleline: 3, multiline: 1 }],

      // 按需：很多项目都会关掉
      'vue/multi-word-component-names': 'off',
    },
  },

  // 7) 项目约定：允许在与外部数据/第三方库交互时使用 any；避免 lint 阻塞开发。
  //    如需逐步收紧类型，可把该规则改为 "warn" 并在代码中逐步替换。
  {
    files: ['**/*.{ts,tsx,vue}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',

      // 允许空 catch（例如 requestData 在部分浏览器会抛异常，忽略即可）
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
];
