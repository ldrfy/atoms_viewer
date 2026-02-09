# Project Memory (Codex)

## Project Context
- antdv-next
- vue
- vite

## Commands
- dev:
- build: pnpm build (run after code changes)
- test:
- lint: pnpm lint:fix (run after code changes)

## Code Style
- Keep code concise; prioritize simple, working implementations over broad compatibility

## Do / Don't
- Do: 优先使用 antdv-next 的现成组件/能力，尽量不要自己手写 CSS 和自建组件（除非 ant 不满足需求），比如能用 `a-flex` 和 `a-space` 的不要手写 `div+css`
- Do: 每次创建关键函数、关键变量、关键逻辑时，中英双文注释，并且中英分行，不要写一起
- Don't: 不要设置aria-label参数

## Notes
- 以后写完代码总结或者和我说话时用中文
