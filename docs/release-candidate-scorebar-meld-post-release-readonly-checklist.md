# B+C 上线后只读验证清单

> 仅在 B+C 候选获准合并并完成 `18768` 服务切换后执行。本清单不要求、不允许刷新、点击或修改用户当前旧对局。

## 前置约束

- 使用 HTTP 只读检查或全新隔离浏览器 Profile，不接管用户当前浏览器标签。
- 不读取、导出、迁移、清理或写入 `localStorage`。
- 不点击“新游戏”、手牌、胡、碰、杠、过、导出或迁移按钮。
- A 存档高级人工门禁不属于本清单。

## 1. 服务与资源

1. 请求 `http://127.0.0.1:18768/game/wannian-mahjong.html`，确认 HTTP `200`。
2. 确认页面引用规则、强规则 AI、推荐和 MCTS 浏览器资源均返回 `200`。
3. 只读检查页面源码包含唯一 `id="scorebar"`，且不包含 `id="sp-score"` 或 `id="sp-scorebar"`。
4. 只读检查 `#scorebar` 样式包含 `top:14px`、`bottom:auto`、`pointer-events:none` 及移动端 `top:8px`。

## 2. 真实副露修复身份

1. 只读检查页面源码存在 `ruleMeldsForPlayer`、`ruleMeldsWithExtra` 和 `listWaitsWithMelds`。
2. 确认页面源码不包含 `ruleMeldsByCount` 或 `listWaitsForMeldCount`。
3. 记录本次发布前已通过的 `test:response-real-meld-context` 结果；不得使用用户旧局或用户浏览器存档重放第 107 手。

## 3. 隔离视觉确认

在全新隔离 Profile 打开页面但不开始新局，确认：

1. 顶部只有一个四家积分区域，位于页面顶部居中。
2. 该区域不遮挡牌桌、推荐面板或底部操作区。
3. 页面没有常驻存档诊断提示。

## 4. 记录与结论

- 记录服务监听 PID、URL、HTTP 状态、资源检查结果、页面源码检查结果和隔离 Profile 的视觉结论。
- 任一资源、静态身份或唯一积分展示检查失败，停止验证并回滚到发布前服务，不操作用户旧局。
- 本清单通过仅确认 B+C 发布身份和只读页面表现；不替代 A 的四项高级人工快照门禁。
