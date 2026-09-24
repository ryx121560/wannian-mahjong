# P0 普通暗杠立即结算候选验收报告

状态：候选完成，待产品验收；未合并、未推送、未部署。

## 基线与隔离

- 基线：本地已获取的 `origin/main` / `f89b8a69b5deb7944d228f928842f1aa08c3b679`。
- 收尾时的 `git ls-remote origin refs/heads/main` 受本机 Git 凭据错误阻断，未将本地远端跟踪引用表述为实时远端确认；最终集成前必须重新获取并核对远端。
- 隔离工作树：`codex/normal-concealed-kong-settlement`。
- 未访问 `127.0.0.1:18768`、浏览器存储或阶段八训练运行。
- 未创建候选模型、selfplay、replay、checkpoint、ONNX、Smoke、Pilot 或 Arena 产物。

## 红测证据

首次执行 `npm.cmd run test:normal-concealed-kong` 时失败：

```
TypeError: rules.resolveConcealedKongDraw is not a function
```

首次执行 `npm.cmd run test:stage8-v2-normal-concealed-kong` 时失败：

```
ENOENT: .../src/game/stage8
```

两项分别证明普通暗杠规则 API 与独立 Stage8 v2 适配入口在实现前均不存在。

## 实现范围

- 规则核心新增普通暗杠补牌结算：补牌后仅产生 `concealedKongTrueWin` 或 `concealedKongFakeWin`，均立即终局，无抢杠、无弃牌分支。
- 结算责任：假胡每个其他玩家 4 分，真胡每个其他玩家 8 分；仅叠加既有牌型倍率，并在全部倍率后按付款方独立封顶 16 分。未调用旧通用暗杠/杠开倍率。
- 页面复用已有通用“杠”入口；副露以 `concealed=true` 保存并映射为真实 `anGang`；结构化 `kongAction`、`kongOutcome` 与 `scoreDeltas` 经既有 `_lastResult` 快照路径保留。
- Stage8 v2 只新增独立的普通暗杠 canonical action、声明与纯模拟入口，强制 `stage8-action-space-v2` 协议，拒绝 v1 replay/checkpoint/model/manifest 字段；不接入 v1 训练输入。
- 浏览器规则包 `public/game/rule_engine.js` 已由源码重建，提供页面实际调用的规则 API。

## 关键回归

- 四张 6 筒暗杠后补 6 万：假胡，`[+12,-4,-4,-4]`。
- 同一固定牌形补 8 万或 5 筒：真胡，`[+24,-8,-8,-8]`。
- 真胡的清一色与碰碰胡倍率：每名付款方封顶 16，赢家 `+48`。
- 普通暗杠无抢杠窗口，不会转入弃牌。
- 页面日志记录“普通暗杠”和补摸；快照恢复保留真实暗杠标记与可信结算摘要。
- Stage8 v2 模拟只从墙顶获得补牌，动作与结果保持独立、可复放且公开摘要隐私扫描为零。

## 验证结果

| 命令 | 结果 |
| --- | --- |
| `npm.cmd run test:normal-concealed-kong` | 通过 |
| `npm.cmd run test:stage8-v2-normal-concealed-kong` | 通过 |
| `npm.cmd run test:p0-kong-resource` | 通过 |
| `npm.cmd run test:p0-kong-page-persistence` | 通过 |
| `npm.cmd run test:response-real-meld-context` | 通过 |
| `npm.cmd run test:response-restore-revalidation` | 通过 |
| `npm.cmd run test:rules` | 472/472 |
| `npm.cmd run test:recommendation` | 100/100 |
| `npm.cmd run test:mcts` | 154/154 |
| `npm.cmd run test:strong-ai` | 391/391 |
| `npm.cmd run test:stage7-recommendation` | 320/320 |
| `npm.cmd run test:stage7-ai-unified` | 58/58 |
| `npm.cmd run verify:browser-rules` | 通过 |
| `npm.cmd run verify:recommendation` | 通过 |
| `npm.cmd run verify:mcts` | 通过 |
| `npx.cmd tsc --noEmit` | 通过 |
| `npm.cmd run build` | 通过 |
| `git diff --check` | 通过 |

## 范围排除

- 不包含 P2 导出文件名或桌面目录写入。
- 不包含页面以外的 AI/MCTS/推荐策略变更。
- 不包含 Stage8 v1、训练、经验池、模型、运行时或浏览器用户数据。
- 构建期间生成的 `strong_rule_ai.js`、`recommendation_engine.js`、`mcts_enhancement_engine.js` 语义差异已恢复并排除；`tsconfig.tsbuildinfo` 已清理。

## 待产品决定

本候选尚未提交、合并、推送或部署。通过验收后，才进行干净集成、普通非 force 推送和单独部署授权流程。
