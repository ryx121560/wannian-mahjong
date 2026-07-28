# B+C 窄范围发布候选验收记录（2026-07-28）

## 候选边界

- 工作树：`codex/release-candidate-scorebar-meld`
- 基线：`ff463e0`
- 包含：
  - B：唯一 `#scorebar` 顶部居中、移动端安全边距与唯一展示回归。
  - C：所有胡牌/听牌/响应判定使用真实副露牌面，禁止副露数量合成虚假副露。
- 排除：A 未完成对局快照耐久性、`session_snapshot.js`、`next-with-port.mjs`、Stage8/training/replay/checkpoint、任何用户浏览器数据。
- 未合并 `main`、未提交、未推送、未启动或访问 `18768`。

## 变更清单

- `package.json`：增加 C 专项回归命令。
- `public/game/wannian-mahjong.html`：
  - B：唯一积分栏固定在视口顶部居中，小屏收紧布局；保留 `pointer-events:none` 与统一 `updateScorebar`。
  - C：`checkResponses`、听牌枚举、杠后评估和候选展示使用真实副露对象；移除数量转虚假东碰的路径。
- `scripts/stage4-recommendation-regression.mjs`：检查听牌枚举传入真实副露上下文。
- `scripts/stage7-recommendation-regression.mjs`：检查顶部唯一积分栏与移动端安全区。
- `scripts/response-real-meld-context-regression.mjs`：C 的 107 手反例、真实三东碰正例与结算审计回归。

## 回归与构建

| 命令 | 结果 |
| --- | --- |
| `npm.cmd run test:response-real-meld-context` | 通过 |
| `npm.cmd run test:stage7-recommendation` | 320/320 通过 |
| `npm.cmd run test:rules` | 472/472 通过 |
| `npm.cmd run test:recommendation` | 100/100 通过 |
| `npm.cmd run test:mcts` | 154/154 通过 |
| `npm.cmd run test:strong-ai` | 391/391 通过 |
| `npm.cmd run test:stage7-ai-unified` | 58/58 通过 |
| `npm.cmd run verify:browser-rules` | 通过 |
| `npm.cmd run verify:recommendation` | 通过 |
| `npm.cmd run verify:mcts` | 通过 |
| `npm.cmd run verify:strong-ai` | 通过 |
| `node C:\\Users\\Administrator\\Documents\\NEW\\node_modules\\next\\dist\\bin\\next build` | 通过 |

静态审计通过：不存在 `ruleMeldsByCount`、`listWaitsForMeldCount`、`sp-score` 或 `sp-scorebar` 残留。构建过程产生的浏览器包差异均经 `--ignore-space-at-eol` 确认为行尾变化，不纳入候选。

## 上线到 18768 的最小人工动作

仅在产品批准合并本候选、且用户完成当前旧对局或明确允许切换后执行：

1. 在主工作树合并已批准的 B+C 候选；本候选当前未执行该操作。
2. 在正在承载 `18768` 的终端显式停止旧服务，避免端口占用时脚本改用其它端口。
3. 在更新后的主工作树 PowerShell 终端执行：

```powershell
$env:PORT = '18768'
npm.cmd run dev
```

4. 确认终端显示监听 `18768`，再打开 `http://127.0.0.1:18768/game/wannian-mahjong.html`。
5. 用户当前旧对局在上述批准前不刷新、不访问、不修改；上线后是否刷新或继续对局由用户决定。

## 结论

候选具备 B+C 的独立发布验收证据。A 的四项高级人工快照门禁仍不属于本候选，也不影响 B+C 的独立评审。
