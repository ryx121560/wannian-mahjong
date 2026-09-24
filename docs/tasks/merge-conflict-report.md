# 分叉合并隔离试做报告（2026-09-24）

**结论：候选合并可以进入下一步人工评审；尚不应据此直接更新 `main` 或部署。** 隔离工作树中的 10 个冲突已形成可运行的候选解，杠类、规则和定向类型检查均通过。下表把观察到的事实、对行为等价性的推断和建议分别写明。

隔离工作树：`C:\Users\Administrator\Documents\NEW\.worktrees\merge-dryrun-20260924`；分支：`codex/merge-dryrun-20260924`。基线为本地 `main` 的 `2e13b40`，合入对象为已有的 `origin/main` `7c587b4`。未 fetch、push、reset、rebase，也未改本地 `main` 或主工作区的四个未提交跟踪文件。根目录没有可读取的 `AGENTS.md`。

## 逐文件分析与候选解决

表中的「远端版」指此隔离试做采用的 `origin/main` 文件内容，并非建议无条件覆盖本地工作。提交号限定在各自分叉之后。

| 文件 | 类型 | 本地侧事实 | 远端侧事实 | 冲突实质与候选解决依据 | 合理解及置信度 |
|---|---|---|---|---|---|
| `package.json` | content | `d693a2d`、`6d99852`、`2e13b40` 加入响应恢复与加杠回归命令。 | 远端逐步加入 89 个本地没有的脚本及 ONNX、构建/启动流程；三个本地新增回归命令也已经存在，命令内容相同。 | 同一 `scripts` 区段发生文本冲突。**建议/候选：**保留远端版。静态检查显示三个本地命令无丢失，`package-lock.json` 根依赖与 package 的四个依赖版本一致，包含 `onnxruntime-node@1.27.0` 条目。 | 保留远端脚本；或逐项手工合并并复核构建入口。**高**。运行环境的现有依赖目录缺少 ONNX 包，故未验证 ONNX 运行。 |
| `public/game/rule_engine.js` | content | `2e13b40` 加入加杠纯结算逻辑和导出。 | `632ad66`、`539782b`、`2525168` 等扩展资源杠、特殊杠、假胡分支；另有离线规则门禁和重放。 | 同一规则函数及导出区被改。**建议/候选：**远端版，与远端 TypeScript 源和其他浏览器规则导出保持对应；杠类回归通过。 | 远端版；或按 TypeScript 重新生成后核对产物。**中**，生成一致性尚未独立核对。 |
| `public/game/wannian-mahjong.html` | content | `d693a2d`、`6d99852`、`2e13b40` 分别加入顶部积分栏、恢复响应重校验、加杠纯结算页面桥接。 | 远端增加统一 `bar` 顶栏、响应/杠状态重校验、规则核心动作、资源及特殊杠页面流程、结算摘要和多项展示修复。 | 15 个冲突块中既有同一交互入口，也有不同功能紧邻插入导致的冲突。**建议/候选：**远端版；两个响应回归、阶段七及杠类页面回归通过。 | 远端统一顶栏和页面流程；或再植入本地独立积分栏与桥接。**中**，UI 视觉和实际对局流程仍需人工评审。 |
| `src/game/rules/index.ts` | content | `2e13b40` 导出 `added-kong`。 | 远端导出 `kong-resource`、`concealed-kong`、`added-kong`、`special-kong`、`round-transition`。 | 同一导出位置冲突。**建议/候选：**远端版完整包含本地导出；定向 tsc 通过。 | 远端版或逐行取并集，结果相同。**高**。 |
| `scripts/stage7-recommendation-regression.mjs` | content | `d693a2d` 检查 `scorebar` 的单一 DOM、样式和更新。 | `31d76c7`、`80f5f44` 检查远端统一 `bar`、结算摘要及无旧自弈积分栏。 | 同一组 DOM 断言目标不同。**建议/候选：**远端版与候选页面结构一致；该脚本通过。 | 远端断言；或同时保留第二栏并改页面。**中**，顶栏产品呈现需人工确认。 |
| `src/game/rules/added-kong.ts` | add/add | `2e13b40` 独立新增抢杠、继续出牌、即时杠开结算的纯函数。 | `a3ba905` 新增同名规则，`2525168` 扩展资源假胡；涵盖抢杠、连杠窗口、即时/假胡结算、资源状态。 | **双方在做同一件事**；远端状态与分支更完整，但本地强调纯结算。**建议/候选：**远端实现，配套本地分数守恒断言验证即时结算。 | 远端规则；或逐分支人工融合本地结算实现。**中**。无需改名，两版是同一个公开规则入口。 |
| `scripts/response-real-meld-context-regression.mjs` | add/add | `d693a2d`、`6d99852` 测真实副露参与点炮、抢杠、杠开、自摸、听牌等校验。 | `31d76c7` 等从真实副露起步，后改为通过 `pageRuleState`、规则核心合法动作和原子预检来检查。 | **双方验证同一安全意图**，但页面实现路径不同；远端覆盖后续规则核心路径，本地的旧页面正则已不适用。**建议/候选：**远端版；脚本通过。 | 远端版；或增补与新结构相符的本地断言。**中**。无需改名。 |
| `scripts/response-restore-revalidation-regression.mjs` | add/add | `6d99852` 新增旧响应快照复验，防止恢复后保留虚假的胡/杠状态。 | `31d76c7` 等独立新增相同目标，并扩展资源及连杠窗口恢复校验、无副作用的响应状态。 | **双方在做同一件事**；远端版测试场景更多且保留本地旧响应断言。**建议/候选：**远端版；脚本通过。 | 远端版；或逐断言合并。**高**。无需改名。 |
| `scripts/stage8-v2-added-kong-page-adapter-regression.mjs` | add/add | `2e13b40` 新增页面桥接静态断言，要求重算比对、结算校验，禁止直接调用 `applyWin`。 | `a3ba905` 等新增同名页面适配回归，包含实际提交前重放、缺失/伪造结算拒绝、无提前页面变更等检查。 | **双方在做同一件事**；远端版通过运行行为检验本地关注的原子提交意图，覆盖更深。**建议/候选：**远端版；脚本通过。 | 远端版；或同时保留静态断言以防 API 形状改变。**中**。无需改名。 |
| `scripts/stage8-v2-added-kong-resolution-regression.mjs` | add/add | `2e13b40` 新增抢杠、继续、即时结算以及分数增量守恒断言。 | `a3ba905`、`2525168` 新增同名回归，覆盖抢杠、继续、即时、假胡、连杠窗口；原版缺少本地的分数守恒断言。 | **双方在做同一件事**；远端场景更多，本地有独有的结算不变量。**候选：**以远端版为基底，补回本地的两条即时结算守恒断言；脚本通过。 | 当前组合；或拆成两个不同测试文件以保留各自场景。**高**；同一入口更便于回归，无需改名。 |

另有 `scripts/stage4-recommendation-regression.mjs` 由 Git 自动合并，无人工冲突，不计入上表 10 项。

## 需用户裁决与评审关注

**没有低置信度而必须保留冲突标记的条目。** 下列项目存在合理多解，已在隔离候选中按上表选择；请在下一步评审中确认：

1. 顶栏采用远端统一 `bar`，还是恢复本地独立 `scorebar`；候选页和阶段七回归采用前者。需要浏览器视觉及移动端操作确认。
2. 加杠规则和页面桥接采用远端较完整的资源状态机。本地的纯结算目的已由运行回归和分数守恒断言部分覆盖；仍需审视实际对局中的即时胡、假胡、连杠交互。
3. `rule_engine.js` 采用远端产物，需在正式合入流程中核对规则构建产物与 TypeScript 源一致。
4. `onnxruntime-node` 在锁文件中声明一致，但当前供测试的主工作区依赖目录没有该包。若评审包含 ONNX 路径，需要在独立环境按锁文件安装后验证。

## 验证

| 命令或范围 | 结果 |
|---|---|
| `node scripts/*kong*regression.mjs`（逐个运行，共 15 个匹配脚本） | 15 通过、0 失败 |
| `node scripts/benchmark-runner.mjs` | 472 通过、0 失败 |
| `node node_modules/typescript/bin/tsc --noEmit --target ES2020 --module commonjs --moduleResolution node --skipLibCheck src/game/rules/added-kong.ts src/game/rules/index.ts` | 通过 |
| `node scripts/response-real-meld-context-regression.mjs` | 通过 |
| `node scripts/response-restore-revalidation-regression.mjs` | 通过 |
| `node scripts/stage7-recommendation-regression.mjs` | 通过，失败列表为空 |
| `git diff --cached --check --` 本次处理的 10 个冲突文件和 2 份任务文档 | 通过 |
| `git diff --cached --check` 整次合并 | 未通过：远端带入的若干既有文档存在尾随空白或末尾空行；本次未改这些无冲突文档 |

为复用现有 TypeScript 依赖，隔离工作树的 `node_modules` 是指向主工作区现有依赖目录的 junction；测试只读该目录，构建输出在脚本创建的临时目录。它没有被加入 Git。

## 审阅与复现

```powershell
Set-Location 'C:\Users\Administrator\Documents\NEW\.worktrees\merge-dryrun-20260924'
git -c safe.directory=C:/Users/Administrator/Documents/NEW/.worktrees/merge-dryrun-20260924 status --short
git -c safe.directory=C:/Users/Administrator/Documents/NEW/.worktrees/merge-dryrun-20260924 show --stat --oneline HEAD
node scripts/stage8-v2-added-kong-resolution-regression.mjs
node scripts/benchmark-runner.mjs
```

**事实：**这些命令只针对保留的隔离工作树；此报告不宣称 UI 人工评审或 ONNX 路径已经完成。**推断：**候选解在已验证的加杠、响应和规则路径上保持行为一致。**建议：**先完成上面的人工评审，再决定是否将该分支带入主线。
