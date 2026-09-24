# 庄家继承规则候选验收报告（2026-08-13）

## 状态

- 状态：候选实现完成，等待产品验收。
- 集成状态：未合并、未推送、未部署。
- 隔离分支：codex/dealer-continuity-implementation-20260813
- 基线 HEAD / origin/main：$head
- 未访问 18768、浏览器 Storage 或用户数据；未启动服务、Stage8 或训练下游。

## 实现范围

1. public/game/wannian-mahjong.html
   - 新增无副作用 esolveNextDealer(previousState)。
   - 仅接受已结束、赢家为 0..3 整数且具有可信未破产标记（当前 schema -1 或旧布尔 alse）的上一局；其他输入失败关闭到座位 0。
   - 
ewGame() 在清空 _lastResult 前冻结决策，并以同一结果设置 GS.dealer 与 GS.cur；移除随机庄家。
   - 杠开结算只补齐既有 ankrupt 结果元数据，未改变特殊杠判断、付款或积分。
2. scripts/dealer-continuity-regression.mjs
   - 覆盖赢家继承、流局、破产、未结束直接新局、非法赢家、旧/缺失结果、结束快照恢复契约及新局调用顺序。
3. package.json
   - 新增 	est:dealer-continuity。
4. 本报告。

明确未改：积分算法与持久化、特殊杠规则与结算、Stage8、AI策略、导出、服务端和快照 schema。

## TDD 红绿证据

### RED 1


ode scripts/dealer-continuity-regression.mjs

按预期失败：missing production function resolveNextDealer。失败来自功能尚不存在，不是语法、路径或环境错误。

### GREEN 1

最小接入后 
pm.cmd run test:dealer-continuity 通过。

### RED 2

新增不可信旧结果 { phase:'ended', _lastResult:{ winner:2 } } 后，专项按预期失败：实际返回 2、期望失败关闭到 0。

### GREEN 2

收紧为只有 ankrupt === -1 或 ankrupt === false 才证明未破产，专项再次通过。

## 验证结果

以下门禁全部通过：

- 	est:dealer-continuity
- 	est:response-phase
- 	est:response-restore-revalidation
- 	est:p0-kong-page-persistence
- 	est:p0-special-kong-page-phase2
- 	est:p1-top-settlement-persistence
- 	est:normal-concealed-kong
- 	est:rules：472/472
- 	est:recommendation：100/100
- 	est:stage7-recommendation：320/320
- 	est:stage7-ai-unified：58/58
- 
px.cmd tsc --noEmit --incremental false
- erify:browser-rules
- erify:recommendation
- 
pm.cmd run build
- git diff --check

构建生成的 ule_engine.js、strong_rule_ai.js、ecommendation_engine.js、mcts_enhancement_engine.js 已恢复到基线；隔离候选 .next 已清理，未纳入候选。

## 文件身份

- 页面 SHA256：$htmlHash
- 专项 SHA256：$testHash
- package SHA256：$packageHash

## 阻塞项

- 功能与回归无阻塞。
- 平台 pply_patch 对新 worktree 发生 ACL 拒绝；依据既有“仅隔离候选可用 Shell/Git 编辑”的授权，使用唯一精确替换并通过 diff 审计。未修改 main。