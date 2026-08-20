# 阶段 1 运行树卫生候选验收报告（2026-08-20）

## 候选

- 基线：`f0508553d7b508272d6c81f32b2ecc8a393290ee`
- 分支：`codex/stage1-runtime-hygiene-20260820`
- 工作树：`C:\Users\Administrator\Documents\NEW\.worktrees\codex-stage1-runtime-hygiene-20260820`

## 变更范围

- `scripts/next-with-port.mjs`：固定 Next 启动主机为 `127.0.0.1`；以 Node 内置模块解析复用现有 `next/dist/bin/next`，避免候选运行树回退到 `npx`。
- `scripts/assert-browser-build-artifacts-clean.mjs`：构建前仅检查四个白名单浏览器生成文件是否干净。
- `scripts/build-production-game.mjs`：成功构建后仅恢复四个白名单生成文件至 `HEAD` 基线。
- `package.json`：将构建前检查加入现有 `prebuild`，并暴露阶段 1 卫生回归命令。
- `scripts/stage1-runtime-hygiene-regression.mjs`：覆盖固定 loopback、Next CLI 解析、无 `npx` 回退和白名单恢复机制。
- `scripts/production-port-window-regression.mjs`：端口探测子进程无法启动时直接报告底层 spawn 错误，不能将其误判为端口窗口行为。

白名单仅为：

- `public/game/rule_engine.js`
- `public/game/strong_rule_ai.js`
- `public/game/recommendation_engine.js`
- `public/game/mcts_enhancement_engine.js`

未改麻将规则、页面对局、API 批准路径语义、Stage8/训练，也未删除任何空间资产或访问 Storage/用户对局。

## RED/GREEN

- RED：在四个白名单生成文件由本轮构建留下差异时，`npm run build` 在生成前以 `Generated browser artifacts must be clean before build` 失败。
- GREEN：恢复这四个已确认可再生文件后，`npm run build` 成功；构建后这四个文件的 `git status --porcelain -- <files>` 为空，`git diff --check` 通过。
- Git 所有权：构建前检查和构建后恢复均以 `git -c safe.directory=<process.cwd()>` 运行，只信任当前进程的候选工作树；不写入全局 Git 配置，也不放宽其他目录。
- 精确端口失败：监听探测同时处理异步 `error` 与同步 `listen` 异常；`PORT_WINDOW=0` 的占用端口仍报告 `No available port from <p> to <p>`。

## 运行验证

在候选树临时端口 `18769` 验证后已停止临时进程：

- 唯一监听：`127.0.0.1:18769`。
- 注入既有批准路径后，仅 HTTP GET 结果：`/` 200，`/game/rule_engine.js` 200，`/api/rl/load_rl` 200，`/api/game/export` 405（路由存在且未执行导出）。
- 验证使用的批准路径：`C:\Users\Administrator\Documents\NEW\rl_weights.json` 与 `C:\Users\Administrator\Desktop\workspace\json`。

## 门禁

- `npm run test:approved-deployment-paths`：通过。
- `npm run test:production-launch`：通过。
- `npm run test:runtime-build-isolation`：通过。
- `npm run test:production-port-window`：通过。
- `npm run test:stage1-runtime-hygiene`：通过。
- `npm run build`：通过。

## 后续

本候选尚未提交、推送或部署，等待产品复验。阶段 2 空间清理继续暂停，直至本候选获准发布并在正式运行树完成相同健康核验。
