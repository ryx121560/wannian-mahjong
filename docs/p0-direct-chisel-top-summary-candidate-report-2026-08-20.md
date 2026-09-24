# P0 直铲与暗杠顶部摘要语义候选报告

日期：2026-08-20
候选分支：`codex/p0-direct-chisel-top-summary-20260820`
候选基线：`2ad4df739bcbee339a2a303bb52ce78239852d7b`

## 目标

顶部摘要在不改变结算语义的前提下，精确展示已完成的直铲和普通暗杠：

- `平胡（直铲·真胡）` / `平胡（直铲·假胡）`
- `平胡（暗杠·真胡）` / `平胡（暗杠·假胡）`
- `平胡（强行跑杠开）`（仅强行跑已结算；不区分真、假胡）

## 最小实现

- 新增仅供顶部摘要使用的白名单映射；认可 `directChisel`、`concealedKong` 各自的真、假胡 outcome，以及 `forcedRunImmediate`/`forcedRunDeferred` 的已结算真、假胡 outcome。
- 摘要归一化仅在上述组合成立时保留既有 `kongAction`/`kongOutcome`；未知值、旧摘要缺少字段、强跑和其他杠路径均继续使用原有通用文案。
- 格式化层对受认可语义使用全角括号；结算、规则、付款、积分、动作资格、结算对象与历史 Storage 均未修改。
- `GS._lastResult` 原有字段保持不变；顶部摘要 JSON 与会话快照的附加字段保持兼容。

## RED/GREEN

- RED：直铲假胡摘要写入后 `kongAction` 为 `undefined`，证明归一化丢失动作语义；强行跑已结算 outcome 也同样丢失。
- GREEN：直铲与普通暗杠的真、假胡字段，以及强行跑立即/延迟已结算字段均通过 JSON 存取；旧摘要无字段仍可读取。状态栏精确输出产品指定文案；强行跑失败、普通杠开、点炮、自摸和流局原文案不变。

## 验证

- `npm run test:p1-top-settlement-persistence` 通过。
- `npm run test:p1-statusbar` 通过。
- `npm run test:p0-direct-chisel-settlement` 通过。
- `npm run test:normal-concealed-kong` 通过。
- `npm run test:p0-kong-resource` 通过。
- `npm run build` 完整结束，`BUILD_EXIT_CODE=0`，候选 `.next/BUILD_ID=q7NXyNOzBpoJv1KrqdXA0`；构建后 Git 跟踪文件仅保留本候选预期改动，且无候选专属 Next/Node 进程。
- `git diff --check`：通过。

## 发布状态

未提交、未推送、未部署；等待产品复验。
