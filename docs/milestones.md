# 里程碑计划

## 1. 项目结构整理

- 建立 `src/pages`、`src/components`、`src/game`、`src/types`、`src/store`、`src/styles`。
- 保持现有游戏可通过 iframe 正常加载。

## 2. 游戏基础模块迁移

- 将牌型、牌堆、排序、日志等工具逐步迁移为 TypeScript 模块。
- 保持静态 HTML 游戏逻辑不被破坏。

## 3. 页面组件化

- 将当前 Canvas 游戏外壳逐步拆成 React 页面和组件。
- 优先拆入口、操作区、结果区和状态展示。

## 4. 规则模块化

- 将胡牌、碰、杠、计分等逻辑从 HTML 中迁移到 `src/game/rules`。

## 5. AI 与持久化整理

- 梳理 MCTS、RL 训练代码。
- 保留 Next API Routes 保存和读取 RL 权重。
