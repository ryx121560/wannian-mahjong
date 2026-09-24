# Stage8 Windows disposable diagnostic identity 候选报告（2026-09-16）

## 结论

本候选基于已发布提交 `fae72b67b297672960d49361e6252c7e022d9040`，为 Windows 一次性后台诊断构造并校验确定性的未签名 identity/control 输入。候选只提供 `--check`，没有 `--emit`、Task Scheduler 或 Service 操作入口，不能注册或运行诊断。

真实 `--check` 已针对干净的 `fae72b6` 发布工作树执行两次，输出逐字一致，identity SHA-256 为：

`d4166d519f323f289faec84ff53b87a24aa5798af5e16fd16bc3a765997075fd`

## 基线与范围

- 基线：`HEAD=origin/main=fae72b67b297672960d49361e6252c7e022d9040`。
- 候选分支：`codex/stage8-windows-task-diagnostic-identity-20260916`。
- 状态：未提交、未推送、未部署。
- 精确范围：5 个项目文件。
- 新依赖：无。
- 页面、规则、AI、服务、数据库与 18768：无变更。

## 固定身份

- `hostRunId=stage8-disposable-diagnostic-20260916`。
- `targetRunId=stage8-disposable-diagnostic-20260916-diagnostic`。
- `taskName=Stage8-Host-stage8-disposable-diagnostic-20260916`。
- 发布提交固定为 `fae72b67b297672960d49361e6252c7e022d9040`。
- workload 固定为 12 分钟 disposable diagnostic，并显式禁止正式 Pilot、第三次 Pilot、训练、Smoke、自弈、回放和模型读取。
- 证据根、control 路径、日志路径和五份阶段授权路径固定派生到当前 OS 临时目录；项目树和正式 E 盘路径均不允许。

## 字节身份绑定

候选逐字读取并绑定：

- Node 可执行文件。
- `scripts/stage8-windows-task-host-runner.mjs`。
- `scripts/stage8-windows-task-host-diagnostic.mjs`。
- `src/game/stage8/offline-windows-task-host-control.ts`。
- `src/game/stage8/offline-action-identity.ts`。

同时绑定参数、工作目录、空环境白名单、S4U/Limited 任务配置、绝对路径、容量和清理策略。Git 检查要求 source root 的 HEAD 精确等于 `fae72b6` 且工作树干净。

## 未签名授权边界

输出的 control template 明确保持：

- `authorization.approvalId=null`。
- `authorization.granted=false`。
- `authorization.authorizationSha256=null`。
- `manifestSha256=null`。

因此模板不能通过已发布 runner 的 control validator。

候选另行输出一份 control signing request，以及五份互相独立的阶段 signing request：

1. `materials-emit`
2. `register`
3. `run`
4. `verify`
5. `delete`

每份请求的 `approval=null`、`controlManifestSha256=null`。候选不签发 approval、不生成 authorization SHA，也不把测试 fixture 当成正式授权。

## RED

以下场景全部失败关闭：

- 错误发布 commit 或 dirty checkout。
- Node 或任一绑定源码字节漂移。
- 参数、cwd、环境或任一哈希漂移。
- 旧正式 Pilot runId、旧 16 局 runId 或任务名漂移。
- 缺字段、多字段或错误阶段 scope。
- 相对 source root。
- 项目树内证据根或正式 E 盘证据根。
- 开启正式 Pilot、第三次 Pilot、训练或 Smoke。
- 试图把未签名模板交给已发布 control validator。

## GREEN 与零副作用

- 专项回归通过；只使用内存和 OS 临时目录。
- 同一输入重复 `--check` 的序列化结果逐字一致。
- 真实 `--check` 两次输出逐字一致，identity 为 `d4166d519f323f289faec84ff53b87a24aa5798af5e16fd16bc3a765997075fd`。
- 默认沙箱曾因禁止 Node 内部 `spawnSync git` 而返回 `checkout-inspection-failed`；失败结果所有副作用指标为 0。以允许只读 Git 子进程的权限重跑后通过，没有改变候选或目标路径。
- 定向 strict TypeScript 与两个新增脚本语法检查通过。

最终指标：

- `filesWritten=0`
- `scheduledTasksRead=0`
- `scheduledTasksMutated=0`
- `servicesRead=0`
- `servicesMutated=0`
- `targetRootReads=0`
- `formalPathsRead=0`
- `formalPilotGamesCredited=0`

## 未执行且仍需独立授权

- 未持久化本次 stdout 中的 identity/control/signing request bundle。
- 未签发 control approval 或任何阶段 authorization。
- 未生成 Task XML 材料。
- 未读取、注册、启动、停止、禁用或删除真实计划任务或服务。
- 未执行 12 分钟或任何超过 10 分钟的诊断。
- 未启动第三次 Pilot、训练、Smoke、自弈、回放或模型流程。
- 未修改正式 E 盘 control、authorization、artifact 或 quarantine。
- 未部署、未操作 18768、未访问用户数据。

后续必须先由产品针对本 identity 独立签发 control approval；形成最终 control manifest 后，再分别签发 `materials-emit/register/run/verify/delete`。任一步均不得由前一步自动推导。
