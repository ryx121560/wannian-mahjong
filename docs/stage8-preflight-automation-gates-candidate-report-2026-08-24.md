# 阶段八前自动化可靠性门禁候选报告

状态：候选，未提交、未推送、未部署，也不构成训练授权。

基线：`origin/main` 解析为 `26beebb06cd398ee4d57fa13693965e2bd8e2133`。

## 范围

- 固定种子、Stage8 v2规范动作空间驱动的离线状态机；不调用生产AI、训练、自弈或未来墙。
- 已发现P0的脱敏索引校验，索引只指向已有确定性回归脚本。
- 单一聚合门禁，串行执行核心规则、页面VM/DOM回归、P0回归、浏览器规则包一致性、Stage8 v2动作/执行门禁、TypeScript、构建与差异检查。

## 状态机契约

- 24个固定种子，每个种子两次重演并比对包含实际动作、状态与结算摘要的SHA-256轨迹；失败上下文携带 `seed`、`step` 与动作。
- 每步从 `deriveStage8V2RoundEngineActions` 取得规范动作；在项目尚无通用碰/过执行器的边界下，离线夹具执行受控的碰/过转移并在动作前后复核规则合法性、牌数守恒、无NaN及积分零和。这不是完整四家实际对局、AI策略或训练模拟。
- 定向矩阵使用现有规则/round-engine执行：正常自摸（`canWin`→`scoreSettlement`）、直铲、强跑成功、强跑失败弃牌；后3者由 `executeStage8V2RoundKongAction` 返回真实结果与结算。
- 墙耗尽的普通流局目前没有可调用的规则核心结算入口，本门禁明确报告为 `not-ended`，不合成ended或结算。canvas仅依赖可重复的VM/结构断言，未引入脆弱截图比较。

## 聚合命令

`npm run test:stage8-preflight-automation`。任何子门禁失败会输出子门禁ID及可直接复现的命令。

## 实跑证据

- `npm run test:stage8-preflight-automation`：通过，19项串行门禁，约26秒。
- 核心规则：472/472；P0索引：8项。
- 固定种子状态机：24个种子、每个两次重演，实际覆盖规范弃牌/碰/过，全部通过；定向覆盖正常胡、直铲、强跑成功与失败弃牌。每次失败均会输出种子、步数与动作。
- 页面结构夹具：响应、响应恢复、杠页面持久化、终局按钮、终局补牌owner、AI新摸牌均通过。
- 规则包与阶段八边界：浏览器规则包 `--check`、普通加杠浏览器一致性、Stage8 v2 action-space、kong-execution均通过。
- `npx tsc --noEmit`、候选树 `npm run build`（Next 8/8）、`git diff --check`均通过。
- 聚合器以 `npx tsc --noEmit --incremental false` 禁止产生 `tsconfig.tsbuildinfo`，结束时再按候选精确7文件白名单校验 `git status --porcelain`；任何额外未跟踪缓存或生成包均失败关闭。

首次聚合实跑发现 `p1-ended-action-buttons-regression.mjs` 的VM上下文未提供近期页面改用的 `collectPageKongDeclarations`；本候选仅补充该夹具桩，不改变生产页面逻辑。独立复验指出初版状态机仅为弃牌守恒smoke，已重构为上述规范动作执行器并重新全量复跑。

## 不跨越的边界

- 不读取浏览器Storage、用户页面或用户导出。
- 不启动训练、自弈、replay、模型、Smoke、Pilot、Arena、Champion或服务。
- 不修改规则、计分、AI策略、页面产品行为或Stage8生产代码。
