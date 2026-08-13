# C4 v2-compatible actor runtime 决策来源只读审计

状态：产品方案审查中；未实现；未运行；未采集；未训练。

## 审计基线

- Git commit：`64def8ccfd8596c4542cda35a0a271bb1c169215`
- 动作协议：`stage8-action-space-v2`
- canonical registry Git blob SHA256：`7B742C3AB12DFAA0CF005070AFBFBC7AFCB3992CFC5C79AFFEE5B01B2AF4E9E7`
- 已审计规则依赖集合指纹：`79EECCE2DA981B38AC2154777A54ED8B90F3B1CD66C8F506DC2F7848E6B7F028`

审计范围只包含已发布的 v2 registry、规则/页面/round-engine 适配器，以及现有推荐、MCTS、强 AI 和页面统一决策入口。未读取或使用 v1 replay、checkpoint、model、manifest，也未访问 18768 或浏览器 Storage。

## v2 协议现状

`src/game/stage8/action-registry-v2.ts` 已定义 14 类互不重叠的 canonical 动作：

`pass`、`discard`、`pong`、`win`、`directChisel`、`forcedRunImmediate`、`forcedRunDeferred`、`addedKong`、`chainKong`、`normalConcealedKong`、`forcedRunConcealed`、`postPongCandidateConcealedKong`、`doublePongForcedRun`、`declineKong`。

规则、页面语义和 round-engine 均有独立合法动作与特殊杠执行适配器。声明阶段不依赖墙顶，执行阶段才消费补牌；v1 artifact 字段由协议入口拒绝。这些能力足以作为 actor 的可信合法动作/执行边界，但它们本身不负责非强制动作的策略选择。

## 现有决策来源覆盖

| 来源 | 可复用能力 | 缺口 | 结论 |
| --- | --- | --- | --- |
| 规则与 v2 round-engine | 生成 canonical 合法动作、执行优先级、抢杠、补牌、结算 | 不对多个非强制合法动作做策略选择 | 可作为唯一合法性与执行来源，不是 actor |
| 强 AI | `makeDecision()` 对弃牌候选评分并返回 `selectedTile` | 不输出 response/special-kong canonical action；输入状态类型仍含完整玩家状态 | 仅能参考弃牌特征，不能直接复用为完整 v2 actor |
| MCTS enhancement v1 | 接受 `discard/pong/kong/win/pass` 并排序 | 所有杠压成单一 `kong`；没有 v2 actionId、resource signature、声明窗口、特殊杠参数；版本仍为 stage5/stage6 v1 | 不可直接复用；映射会合并语义不同动作 |
| recommendation | 展示弃牌与响应建议，响应采用文本优先级 | 输出自然语言字符串，使用 `Date.now()` 生成记录；不是执行策略，也不覆盖 14 类 canonical 动作 | 不可作为确定性 actor |
| 页面统一 AI | 已能调用规则/MCTS并执行碰、杠、胡、弃牌 | 依赖 `GS`、DOM、timer、日志和页面副作用；部分路径使用 `Math.random()`；特殊杠选择未形成完整 canonical 策略身份 | 不可用于隔离语料 runtime |
| C3 step150 | 可见特征 v2 的 value 输出 | manifest 为 action-space-v1；policy logits 为 511 维 v1 | 只能作为只读 value observer，禁止参与 v2 动作选择 |

## 全动作决策覆盖结论

现有 MCTS/推荐/强 AI 组合只对基础动作和通用 `kong` 有部分策略判断，无法无歧义覆盖以下 v2 决策：直铲与即时强跑二选一、延迟强跑与放弃、普通加杠与 chain window、普通暗杠与暗杠强跑、碰后候选暗杠、双碰选择性强跑、多候选 `declineKong`。把这些动作重新压成 `kong` 会破坏 action mask、资源身份和归因，不能通过门禁。

因此没有安全、现成、可直接复用的 v2-compatible actor runtime。

## 最小安全候选

建议后续另行授权实现诊断专用 `c4-diagnostic-v2-canonical-sampler`：

1. 可信规则控制器先完成胡/抢杠优先和跨玩家仲裁，并输出已经 rule-authorized 的 canonical action 集合。
2. actor 只接收脱敏可见 observation 与 canonical actions，不接收 `GameState`、墙、对手暗手、C3 policy logits 或任何 v1 artifact。
3. 对 actionId 升序后的集合，用独立 SHA256 seed 域做确定性均匀选择。该 sampler 只用于诊断状态覆盖，不声称 Stage7 能力或策略质量。
4. action 执行回到已验收 round-engine；actor 不接触补牌，执行后才由规则核心返回 outcome/settlement。
5. C3 step150 observer 只读取同一 actor 可见特征的 value 输出。observer 开关不能改变 sampler seed、动作集合、决策或状态。

该候选避免把不完整的旧策略强行升级为 v2，同时能覆盖全部 14 类动作并保持可重演。其局面分布属于诊断 sampler 分布，不能直接作为能力证据或 H-C4 calibration corpus。

## 隐私与输入边界缺口

当前 `Stage8V2VisibleActionInput.state` 类型仍是完整 `GameState`，其中可包含 `wallTiles` 和其他玩家手牌。现有适配器在声明逻辑中没有按墙顶筛选，但这个类型不能直接暴露给 actor。最小实现必须增加结构化 `Stage8C4DiagnosticActorObservation` allowlist，并让 actor 只接收该结构和 canonical action 列表；完整状态只存在于可信规则/执行控制器内部。

允许字段：actor 自己手牌摘要、公开副露/弃牌、积分、轮次/阶段、公开最后弃牌、actor 自己的公开资源摘要、wall remaining count、canonical legal actions。

禁止字段：墙牌序列/墙顶、其他玩家暗手、完整模拟状态、用户记录、训练/replay/checkpoint/model/manifest 路径、C3 policy logits。

## 产品决策

本审计不选择现有强 AI、MCTS 或推荐作为 actor。建议产品只批准后续实现上述诊断 sampler 与输入隔离层，并先做 fixture/dry-run 门禁；未批准前维持 `v2-compatible-actor-unavailable`，诊断根不得创建。
