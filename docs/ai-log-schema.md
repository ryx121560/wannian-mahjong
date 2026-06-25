# AI 日志 Schema

本文档固化 `public/game/wannian-mahjong.html` 当前导出的 AI 决策日志字段，用于排查出牌不合理、人工回归标准牌例，以及后续迁移独立 AI 模块时保持兼容。

## 导出结构

`导出AI日志` 会优先导出当前对局；如果当前对局已经结束，则从本地保存的最近对局记录中导出 AI 决策。导出文件结构如下：

```json
{
  "schemaVersion": "ai-decision-export-v1",
  "gameId": "string",
  "aiEngine": {
    "id": "html-rule-ai",
    "version": "string",
    "ruleCore": {
      "id": "wannian-rule-core",
      "version": "string"
    },
    "mode": "ordinary | selfplay",
    "source": "rule | rule+mcts | rule+rl | rule+mcts+rl",
    "mcts": false,
    "rl": false,
    "entryAudit": {}
  },
  "exportedAt": "string",
  "decisions": []
}
```

`aiEngine.entryAudit` 同时记录 `ruleCoreLoaded`、`ruleCoreId` 和 `ruleCoreVersion`，用于确认独立规则核心已按预期加载。

## 出牌决策

`decisionType: "discard"` 表示 AI 主动出牌。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `schemaVersion` | string | 当前为 `ai-decision-v1` |
| `turn` | number | 当前回合数 |
| `player` | number | AI 玩家编号 |
| `playerName` | string | AI 玩家名称 |
| `phase` | string | `early`、`mid` 或 `late` |
| `hand` | string[] | 决策前手牌 |
| `discard` | string | 最终弃牌 key |
| `discardTile` | string | 兼容旧字段，等同于 `discard` |
| `discardLabel` | string | 最终弃牌展示名 |
| `source` | string | `rule`、`mcts`、`rl` 或 `fallback` |
| `route` | string | `norm`、`7p`、`dalan`、`quanzheng`、`banzheng` |
| `shantenBefore` | number | 出牌前综合向听 |
| `shantenAfter` | number | 出牌后综合向听 |
| `reason` | string | 最终选择原因 |
| `defenseMode` | string | `none`、`semiFold` 或 `fullFold` |
| `attackTolerance` | boolean | 是否因落后且接近听牌而降低防守权重 |
| `defenseWeight` | number | 防守权重 |
| `scorePosition` | string | `leading`、`behind` 或 `neutral` |
| `threatLevel` | number | 最高对手威胁估算 |
| `candidates` | object[] | 候选弃牌列表 |

候选弃牌字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `tile` | string | 候选弃牌 key |
| `tileLabel` | string | 候选弃牌展示名 |
| `shantenAfter` | number | 弃该牌后的综合向听 |
| `route` | string | 弃该牌后的最佳路线 |
| `breaksMeld` | boolean | 是否拆面子 |
| `breaksPair` | boolean | 是否拆对子 |
| `breaksTaatsu` | boolean | 是否拆搭子 |
| `waitCount` | number | 听牌时仍有剩余牌的等张数量；零枚待牌不计入 |
| `waitRemaining` | number | 等张剩余总枚数；已扣除拟弃牌和全部已知牌 |
| `waitTiles` | object[] | 等张明细，包含 `tile` 和 `remaining` |
| `structureScore` | number | 结构分；拆面子、对子或搭子时为负分 |
| `defenseScore` | number | 安全分 |
| `routeScore` | number | 路线分 |
| `finalScore` | number | 综合排序分 |

## 响应决策

`decisionType: "response"` 表示 AI 对弃牌或自杠机会做出的响应。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `schemaVersion` | string | 当前为 `ai-decision-v1` |
| `action` | string | `selfDrawWin`、`win`、`kong`、`skipKong`、`pong`、`pass`、`selfKong`、`skipSelfKong` |
| `tile` | string 或 null | 相关牌 key |
| `tileLabel` | string 或 null | 相关牌展示名 |
| `source` | string | 当前为 `rule` |
| `shantenBefore` | number | 响应前向听 |
| `shantenAfter` | number | 响应后向听 |
| `reason` | string | 响应原因 |
| `defenseMode` | string | `none`、`semiFold` 或 `fullFold` |
| `attackTolerance` | boolean | 是否因落后且接近听牌而降低防守权重 |
| `defenseWeight` | number | 防守权重 |
| `scorePosition` | string | 分数位置 |
| `threatLevel` | number | 最高对手威胁估算 |
| `candidates` | object[] | 响应候选和模拟结果 |

响应候选可包含：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `action` | string | 候选响应动作 |
| `shantenAfter` | number | 计入完成面子后的响应后向听 |
| `rawAfterShanten` | number | 未计入新增固定面子的普通面子手向听 |
| `routeAfter` | string | 响应后的最佳路线 |
| `bestDiscard` | string 或 null | 碰牌后模拟得到的最佳弃牌 key，部分动作存在 |
| `waitBefore` | string[] | 杠牌前待牌 key 列表，杠牌动作存在 |
| `waitAfter` | string[] | 杠牌后待牌 key 列表，杠牌动作存在 |
| `lostWaits` | string[] | 杠牌导致丢失的原待牌 key；非空时禁止开杠 |
| `danger` | number | 当次响应危险度，部分动作存在 |
| `phase` | string | 当次响应阶段，部分动作存在 |
| `type` | string | 自杠类型，部分动作存在 |

## 使用约定

- 用户反馈某次 AI 出牌不合理时，优先导出本文件对应的 AI 日志。
- 人工回归 `docs/ai-standard-cases.md` 时，应检查 `source`、`route`、`reason`、`candidates` 和结构破坏字段。
- 后续迁移独立 AI 模块时，应保持 `ai-decision-v1` 字段兼容；如需破坏性调整，新增 schema 版本。
