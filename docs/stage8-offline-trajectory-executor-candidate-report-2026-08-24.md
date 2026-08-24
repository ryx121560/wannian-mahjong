# 阶段八离线轨迹执行与重放验证候选报告

状态：候选，未提交、未推送、未部署、未启动任何训练或运行时流程。

## 范围

仅 9 个文件：规则回合状态/转移、离线适配、纯轨迹执行器、轨迹专项、136 张固定种子遍历、本报告、package 脚本，以及由现有生成器逐字再生的 `public/game/rule_engine.js`。未修改页面、服务、AI 策略、计分、牌墙规则、训练资产或浏览器 Storage。

## 真源映射

- `docs/rules.md`：规则真源为 `src/game/rules`。
- 正式阶段八 PRD：轨迹必须执行真实规则、只向策略暴露可见信息、非法/非零和/不可复现即熔断；本候选不产生样本或训练产物。
- `transitionRound`：所有状态变更委托规则真源；轨迹执行器不调用页面逻辑、MCTS 或策略。

## 契约

- 轨迹仅接收显式 canonical Stage8 v2 动作。每步先验证 actor、可见状态哈希和完整规范合法动作集合，再调用离线适配和 `transitionRound`。
- 摸牌是无策略选择的确定性系统转移；所有玩家决策仍必须由显式 canonical 动作给出。
- 成功步骤使用执行器自己的 `traceStep` 与哈希链；不改变 `GameState.turn` 的既有业务语义。
- 专用杠出现可抢杠时，规则层建立 pending 状态，绑定 canonical 动作、牌/资源签名、声明者、响应顺序与内部 pre-state identity；响应只由当前合法集合推导。胡优先，所有人过后才重新验证并提交。
- 特殊杠公开事件包含 canonical identity、牌、是否已提交和结果，但不含对手暗手或墙序。
- 任何上下文、哈希、合法集、专用声明或状态不变量错误均失败关闭，原输入状态不变。

## RED/GREEN

- GREEN：`forcedRunConcealed` 与 `postPongCandidateConcealedKong` 均从完整 canonical 合法集生成真实声明并按真源直接提交，无伪造抢杠窗口；各自固定 trace hash 重演一致。
- GREEN：`doublePongForcedRun` 与 `chainKong` 均从 canonical 合法集生成真实声明并进入 pending 有序响应；三家全过才原子提交。另有“前位 pass、后位合法抢杠胡”路径，胡优先且 pending 杠不提交；固定 trace hash 重演一致。
- GREEN：成功 `traceStep` 从 1 开始严格单调；终局后动作熔断且终局 state 零变化。
- RED：伪造 visible hash、伪造 canonical special-kong identity 均被熔断且零输入副作用。

## 边界

本候选是离线规则执行与重放基础，不是 selfplay、训练、样本生成、模型推理、Smoke/Pilot/Arena/Champion 或 runtime 授权。136 张遍历从每步完整 canonical 合法集合中按只读确定性公开规则选择显式动作，8 个固定种子均从 136 张完整牌池到真实墙尽/胡终局并逐字重演。该批实际随机覆盖仅为 `discard`、`pass`，如实输出且不冒充罕见动作随机覆盖；四类 special 由独立定向矩阵证明。

## 本轮验证

- `test:rules -- --level L1`：472/472。
- `test:stage8-offline-trajectory-executor`：四类 special canonical 矩阵、抢杠/全过、哈希重演、traceStep 与熔断全部通过。
- `test:stage8-offline-four-player-batch`：8 固定种子、牌守恒、有限零和、唯一终局、逐字重演及实际 canonical 覆盖输出通过；明确无训练数据、行为分布或强度证据。
- `test:stage8-offline-round-integrity`、`test:stage8-v2-action-space`、`test:stage8-v2-kong-execution`、`test:p0-kong-resource`、`tsc --noEmit --incremental false`：通过。
- `npm run build`：Next 8/8 通过；随后直接执行 `build-browser-rule-engine --check` 与冻结包身份校验均通过。
- `rule_engine.js` SHA-256：`A79683A32AC207FD2C7E64EF833F7CBDD19C392E93489FACD35E8797E95874AB`。
- 其余冻结浏览器包经构建后身份校验保持原内容；未发现 `tsconfig.tsbuildinfo` 或额外生成包差异。
