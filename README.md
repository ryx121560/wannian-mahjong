# 万年麻将

这是从桌面 `万年麻将-next` 整理后的 Next.js 项目版本。

## 启动

```bash
npm run dev
```

默认端口为 `18765`，启动后访问：

```text
http://localhost:18765
```

## 当前结构

- `src/app`: Next.js App Router 入口。
- `src/views`: 页面级组件。Next.js 的 `src/pages` 是 Pages Router 保留目录，所以本项目使用 `src/views` 承载页面层。
- `src/components`: 可复用展示组件。
- `src/game`: 麻将相关常量、工具和日志模块。
- `src/types`: 游戏类型定义。
- `src/store`: 当前游戏入口等状态聚合点。
- `src/styles`: 全局样式和变量。
- `public/game`: 当前可运行的原始游戏静态资源。
- `src/app/api/rl`: RL 权重读取和保存接口。

## 当前策略

第一步只整理项目结构，不重写完整游戏逻辑。现有玩法仍由 `public/game/wannian-mahjong.html` 执行，后续可以逐步把规则、引擎、AI 和界面迁移到 TypeScript 与 React 模块。

## 产品与 AI 文档

- `docs/rules.md`: 当前对外规则边界和支持牌型。
- `docs/ai-log-schema.md`: AI 出牌和响应日志导出字段说明。
- `docs/ai-discard-logic-spec.md`: AI 出牌逻辑优化规格。
- `docs/ai-discard-implementation-status.md`: AI 出牌逻辑 P0-P4 实施证据与剩余验收。
- `docs/ai-interaction-consistency-spec.md`: 玩家点击、分析、弃牌及 AI 链路一致性规格。
- `docs/ai-interaction-implementation-status.md`: 交互一致性规格的独立实施与验收证据。
- `docs/game-session-persistence-spec.md`: 页面刷新恢复、累计积分和破产重置规格。
- `docs/game-session-persistence-implementation-status.md`: 游戏快照 P0-P2 的独立实施与验收证据。
- `docs/ai-rule-core.md`: 独立 AI 规则核心的运行路径、API 和迁移边界。
- `docs/ai-standard-cases.md`: 20 个 AI 标准牌例，用于人工回归和后续自动化测试转换。
- `docs/ai-standard-cases.json`: 标准牌例的机器可读版本，便于后续生成 fixture。
