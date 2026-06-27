# AI 规则引擎阶段一实现状态

## 已完成

- 新增 `src/game/rules` TypeScript 规则模块，提供 PRD 要求的五个产品接口：
  - `canWin(hand, context)`
  - `getShanten(hand, context)`
  - `getLegalActions(state, playerId)`
  - `scoreSettlement(winResult, state)`
  - `classifyHand(hand, context)`
- 新增 `docs/rule-standard-cases.json`，包含 30 个规则与计分牌例。
- 保留 `docs/ai-standard-cases.json` 中现有 20 个 AI 底线牌例。
- 新增 `scripts/rule-regression.mjs`，可命令行运行规则回归并输出通过/失败。
- 当前 HTML 入口 `public/game/wannian-mahjong.html` 未迁移、未替换，避免影响现有 UI、刷新恢复、AI 日志和对局编排。

## 当前边界

- TypeScript 规则模块已经可回归验证，但尚未全面接管 HTML 游戏运行时。
- `getShanten` 当前是阶段一基础版，用于规则回归和路线对照，不作为强 AI 评分模型。
- 万能牌/假胡仅保留接口字段，具体杠后万能替代规则仍需继续补标准牌例后细化。
- `getLegalActions` 覆盖胡、自摸、碰、明杠、暗杠、过、出牌；加杠接口位已定义，HTML 运行时仍保留现有加杠流程。

## 验证命令

```powershell
npm.cmd run test:rules
npm.cmd run build
```

## 后续建议

1. 继续补齐万能牌/假胡和加杠细分牌例。
2. 将 HTML 中胡牌判断逐步委托给 `src/game/rules` 的同源 public 适配层。
3. 将计分结算迁移到规则模块后，再迁移碰杠合法性判断。
4. 每次 AI 或规则修改后同时运行规则回归和现有 AI 标准牌例检查。
