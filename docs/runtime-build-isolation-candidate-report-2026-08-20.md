# 运行时构建输出隔离候选验收报告

- 状态：待产品验收；未提交、未推送、未部署。
- 基线：`9b2b3fe85c5a31a52420a1d2d5f02f2790ab8be1`。
- 范围：`package.json`、`scripts/build-production-game.mjs`、`scripts/runtime-build-isolation-regression.mjs`、本报告。

## 根因与修复

运行树缺少本地依赖时，经 npm/Next 的多 lockfile 根推断会使构建产物落入根工作区 `.next`，导致运行树无法通过生产启动器启动。新构建器使用 `require.resolve('next/dist/bin/next')` 解析既有 Next CLI，并以 `cwd: process.cwd()` 执行，构建输出落入调用运行树自身 `.next`。

## RED/GREEN

- RED：独立运行树启动时 `.next` 缺少 BUILD_ID，生产启动器拒绝启动。
- GREEN：候选 `npm run build` 成功，候选自身 `.next/BUILD_ID` 存在；静态专项锁定构建脚本、当前 cwd 和无硬编码根路径。

## 验证

- `test:runtime-build-isolation`：通过。
- `test:production-launch`：通过。
- `test:approved-deployment-paths`：通过。
- `test:p0-post-pong-kong-reachability`：通过。
- `npx tsc --noEmit --incremental false`：通过。
- `npm run build`：通过，输出位于候选树 `.next`。
- `git diff --check`：通过。

未操作 18768、浏览器 Storage、用户对局、Stage8/selfplay/replay/训练资产或空间回收。
