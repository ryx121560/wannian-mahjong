# 普通加杠纯结算与页面桥接合入证据（2026-08-21）

## 结论

已从候选中合入当前 `main` 可独立验证的最小闭环：

- 规则层新增纯函数 `resolveAddedKongDraw`，覆盖抢杠、杠开立即结算和杠后继续出牌。
- 页面普通加杠先以当前未变更状态重放规则结果；提交前逐字段比对重放结果。
- 杠开直接写入纯规则给出的四家 `after` 与 `delta`，校验分数前态、差分和零和；不再通过 `applyWin` 重新计算。
- 浏览器规则包已由现有构建脚本更新。

## 产品与协议核对

产品 PRD 要求奖励只来自真实结算的四家积分变化，规则引擎负责合法动作和真实结算；设计文档还要求真实积分零和检查。当前 main 的规则协议已具备 `canWin`、`classifyHand`、`scoreSettlement`、`GameState` 和普通 `addedKong` 合法动作，但不含 Stage8 v2 的动作注册、杠资源、连杠窗口或分解签名协议。

因此本次只合入普通加杠闭环，未改变训练、浏览器探索或正式决策策略。

## 回归证据

| 命令 | 结果 |
| --- | --- |
| `npm.cmd run test:stage8-v2-added-kong-resolution` | 通过：抢杠、杠开纯结算、继续出牌；结算差分零和 |
| `npm.cmd run test:stage8-v2-added-kong-page` | 通过：页面桥接重放、提交前校验、杠开不走 `applyWin` |
| `npm.cmd run verify:browser-rules` | 通过 |
| `npm.cmd run test:rules` | 通过，472/472 |
| `npm.cmd run test:response-restore-revalidation` | 通过 |
| `npx.cmd tsc --noEmit --incremental false` | 通过 |
| `npm.cmd run build` | 通过（首次受限环境为 Next 子进程报 `EPERM`，允许后复跑成功） |
| `git diff --check` | 通过 |

## 未合入候选内容及原因

1. `src/game/stage8/*`、Stage8 v2 动作空间/注册表/可见状态/回合引擎及其门禁脚本：当前 main 没有该目录或版本化协议，直接合入会引入超出普通加杠修复的离线训练协议面。
2. 加杠连杠窗口、`KongResource`、特殊杠声明与页面资源状态：当前 main 没有对应持久化状态、页面桥接函数或规则模块，候选无法独立应用。
3. `decompositionSignature`：当前 `HandClassification` 合约未定义此字段，直接写入会扩张现有规则/页面结果协议，未作为本次最小闭环合入。
4. 候选报告声称的完整 Stage8 v2 round/action-space 验证：依赖上述未合入协议，因此不应作为当前 main 的合入证据。
