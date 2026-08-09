# P0 特殊杠规则阶段 1 候选验收报告

- 日期：2026-08-09
- 候选路径：`C:\Users\Administrator\Documents\NEW\.candidates\codex-p0-special-kong-stage1-shell-20260809-r2`
- 分支：`codex/p0-special-kong-stage1-shell-20260809-r2`
- 基线：`32114ce9f0cef537289bfd4f295a09e047d7dd7c`
- 状态：产品验收通过；未合并、未提交、未推送、未部署。

## 范围

仅变更纯规则、计分、规则类型和阶段 1 回归：

- `forcedRunConcealed` 在补牌后已满足普通暗杠真实完整结构时拒绝声明，不能绕过普通暗杠即时结算。
- 条件化资源求解从真实资源牌来源构建单次见证，枚举分解后按最终分类分数降序、完整分解签名升序选择。
- 新增碰后候选暗杠资源的枚举与纯生命周期：放弃不消费、候选同牌被主动打出或局终失效、实际声明消费。
- 双碰强跑中被选择资源消费、未选择的真实碰资源保持 active。
- 普通 addedKong 首补仅在命中另一真实碰副露第 4 张时开放连杠窗口；链式最终分解仅使用第一资源一次。自己开杠链真胡三家各付 8、假胡三家各付 4，之后叠加既有牌型倍率并逐付款方封顶 16。

未变更：页面、快照、AI/MCTS/推荐、Stage8 simulation/action-space、selfplay、replay、模型、训练、服务、18768、用户浏览器数据。

## TDD 证据

红测先运行 `scripts/p0-special-kong-rules-stage1-regression.mjs`，在基线失败：`resolveForcedRunConcealed must be exported`，退出码 1。

实现后同一回归通过，覆盖：

- 普通暗杠真实完整输入声明暗杠强跑被拒绝；
- 非成型暗杠强跑成功假胡的 2/2/2 支付；
- 候选资源放弃、打出同牌、局终的生命周期；
- 碰后四张候选的稳定枚举；
- 双碰选择资源消费、未选资源保持 active；
- addedKong 首补非匹配无连杠窗口；
- 已确认双碰 addedKong 链：第一资源参与第二杠最终分解，真胡 8/8/8、假胡 4/4/4。

## 回归结果

全部通过：

- `npm.cmd run test:p0-special-kong-rules`
- `npm.cmd run test:p0-kong-resource`
- `npm.cmd run test:normal-concealed-kong`
- `npm.cmd run test:response-phase`
- `npm.cmd run test:response-real-meld-context`
- `npm.cmd run test:response-restore-revalidation`
- `npm.cmd run test:rules`：472/472
- `npm.cmd run test:recommendation`：100/100
- `npm.cmd run test:mcts`：154/154
- `npm.cmd run test:strong-ai`：391/391
- `npm.cmd run test:stage7-recommendation`：320/320
- `npm.cmd run test:stage7-ai-unified`：58/58
- `npm.cmd exec -- tsc --noEmit --incremental false`
- `git diff --check`

未运行会生成浏览器资源的 build/verify 命令，以保持阶段 1 不产生页面构建产物；页面与 Stage8 接入仍需后续独立授权。
