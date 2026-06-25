# AI 规则核心

`public/game/ai/rule_core.js` 是普通对局规则 AI 的第一阶段独立核心模块。它不读取 DOM、`GS`、本地存储、MCTS 或 RL，只提供可复用的纯函数。

## 运行路径

1. 页面先加载 `ai/rule_core.js`，暴露 `window.AIRuleCore`。
2. HTML 主脚本强校验核心模块存在，然后初始化 `AI_ENGINE_INFO`。
3. `aiChooseDiscard` 和 `aiRespond` 仍是普通对局唯一编排入口。
4. 编排入口负责读取游戏状态；稳定的比较和评分逻辑委托给规则核心。

当前核心标识：

```text
wannian-rule-core @ 2026-06-20-r1
```

## API

| API | 职责 |
| --- | --- |
| `compareRoutes(a, b)` | 综合向听相同时统一路线优先级 |
| `compareWaitShape(before, after)` | 判断杠牌是否丢失原有待牌 |
| `scoreTenpaiCandidate(input)` | 统一听牌候选的等张、枚数、安全和结构评分 |
| `scoreSemiFoldCandidate(input)` | 统一高危险半弃和候选评分 |
| `canLearningOverride(candidate, rule)` | 统一 MCTS/RL 覆盖规则结果的门槛 |

## 边界

- 核心模块不得读取其他玩家暗手。
- 核心模块不得直接修改游戏状态。
- 核心模块不得自行启用 MCTS/RL。
- `aiChooseDiscard` 和 `aiRespond` 的入口名称与日志 schema 保持稳定。
- 后续迁移优先提取纯函数，不一次性重写整份 HTML 游戏逻辑。

## 验证

- 页面入口审计记录 `ruleCoreLoaded`、`ruleCoreId` 和 `ruleCoreVersion`。
- AI 设置面板展示当前规则核心版本。
- 每局日志的 `aiEngine.ruleCore` 固化核心 ID 和版本。
- 接入后 20 个标准牌例运行时回归结果为 `20/20`。
