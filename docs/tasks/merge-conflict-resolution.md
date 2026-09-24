# 任务：分叉合并的隔离试做与冲突裁决报告

> **给 Codex 执行的任务说明。** 发送方式：在新会话或产品2 会话里发送
> 「读 docs/tasks/merge-conflict-resolution.md，按里面的要求执行」。
>
> 如果本会话已经执行过 `docs/tasks/git-divergence-analysis.md` 的分析，
> **可直接采用那份结论，不必重复第一步的核对。**

---

## 硬性边界（先读，优先于本文件的其他一切要求）

1. **不要碰主工作区** `C:\Users\Administrator\Documents\NEW` 的任何文件、索引、引用。
   后续所有 Git 操作都在新建的隔离 worktree 里做。
2. **不要改本地 `main`**。不要 `push`、不要 `reset`、不要 `rebase`、
   不要删除任何分支或已有 worktree。
3. **不要动这 4 个有未提交改动的文件**，它们容易被合并前的清理动作误覆盖：

   ```
   rl_weights.json
   docs/stage5-mcts-selfplay-comparison.json
   docs/stage6-selfplay-metrics-comparison.json
   docs/strong-ai-kong-zhichan-review-2026-07-10.json
   ```

4. **不要用 `git fetch`**（它会更新远端跟踪引用）。需要确认远端时用只读查询：
   `git ls-remote origin main`。**已验证该命令在本机可用**，参考值 `7c587b44...`。
5. 所有工作都在**新建的隔离 worktree** 内进行，建议路径
   `.worktrees/merge-dryrun-20260924`（`.worktrees/` 已在 `.gitignore` 中）。
   **完成后保留这个 worktree，不要删除**——留给用户审阅。
6. **输出必须限幅。** 不要贴全量 diff，不要贴完整文件内容，不要递归列目录。

---

## 已核实的事实（直接采用，不要重新推导）

| 项 | 值 |
|---|---|
| 主工作区 | `C:\Users\Administrator\Documents\NEW` |
| 本地 `main` | `2e13b40`，独有 **6** 个提交 |
| `origin/main` | `7c587b4`（远端实测 `7c587b44ad85d301e0c60210beb2f1068a41e150`，与缓存一致） |
| 远端独有提交 | **75** 个 |
| 共同祖先 | `f0295d2` |
| git 版本 | 2.48.1.windows.1 |
| 现有 worktree | 143 棵 |
| 工作区未提交 | 4 个已跟踪修改 + 136 个未跟踪项 |

### 已用 `git merge-tree` 预演出的确定冲突（10 个）

| 文件 | 冲突类型 |
|---|---|
| `package.json` | content |
| `public/game/rule_engine.js` | content |
| `public/game/wannian-mahjong.html` | content |
| `src/game/rules/index.ts` | content |
| `scripts/stage7-recommendation-regression.mjs` | content |
| `src/game/rules/added-kong.ts` | **add/add** |
| `scripts/response-real-meld-context-regression.mjs` | **add/add** |
| `scripts/response-restore-revalidation-regression.mjs` | **add/add** |
| `scripts/stage8-v2-added-kong-page-adapter-regression.mjs` | **add/add** |
| `scripts/stage8-v2-added-kong-resolution-regression.mjs` | **add/add** |

另有 `scripts/stage4-recommendation-regression.mjs` **可自动合并**（无冲突）。
即：路径重叠 11 个 = 10 个真冲突 + 1 个自动合并成功。

**冲突集中在「加杠（added kong）」功能域**：5 个 add/add 里有 4 个文件名带 `kong`。
本地侧的 `2e13b40 feat: 合入加杠纯结算页面桥接` 与远端的加杠相关工作正面重叠。

---

## 阶段一：逐文件冲突分析（只读，不写代码）

对上面 10 个文件**逐个**输出以下六项。不要合并成一个笼统结论。

1. 本地侧改了什么（限定在本地独有的那 6 个提交范围内）
2. 远端侧改了什么（从远端 75 个提交里找出相关的那几个）
3. 冲突的实质：
   - `content` 型 → 同一处代码被双方改了？还是不同处但 Git 无法自动合并？
   - `add/add` 型 → 双方各自新增同名文件，**两版的意图分别是什么**
4. 你建议怎么解，**依据是什么**
5. 这一处存在几个合理解？如果有多解，**都列出来**
6. 置信度：高 / 中 / 低。**低置信度的必须显式标注为"需用户裁决"**

### 特别要求

**5 个 add/add 文件是本次的核心裁决点。** 它们是双方独立新增的同名文件，不能用
"取一边"草率处理。对每一个都要回答：两边是不是在做同一件事？如果是，哪一版更完整？
能不能合并两者的意图？如果两边做的是不同的事，是否该改用不同文件名？

`package.json` 也要留意：远端改了 `package-lock.json` 并新增了 `onnxruntime-node`，
本地只改了部分测试命令——**两者是否兼容**要单独说明。

---

## 阶段二：隔离试合并

在新建的隔离 worktree 内：

1. 从本地 `main` 切出新 worktree
2. 执行 `git merge origin/main`
3. **逐个解决** 10 个冲突，每一处的解决方式都要记录依据
4. 解决后跑以下验证，**只回结果摘要，不回全量输出**：
   - 加杠相关回归（`scripts/` 下带 `added-kong` 或 `kong` 的脚本）
   - rules 回归
   - 定向 `tsc` 检查
5. **不要 push，不要动 main。** 可以在隔离 worktree 内做一个本地提交，方便查看结果。

如果某处冲突你无法有把握地解决，**保留冲突标记并明确说明**，
不要猜测后强行合入——错误的自动合并比留着冲突更危险。

---

## 阶段三：产出报告

写入 `docs/tasks/merge-conflict-report.md`：

1. **逐文件解决表**：文件 / 冲突类型 / 解决方式 / 依据 / 置信度
2. **需用户裁决清单**：所有你标为低置信度或有多解的条目，单独成节
3. **测试结果**：命令 + 结果摘要
4. **隔离 worktree 路径** + 复现命令（让用户可以自己去看合并结果）
5. **一句话结论**：这份合并结果是否可以进入下一步评审

## 输出要求

- 结论先行
- 表格汇总
- **明确区分「事实」「推断」「建议」**——不要把推断写成事实
- 不确定的地方标出来，不要猜
- 不要贴全量 diff，不要贴完整文件内容

---

## 执行状态（2026-09-24，隔离 worktree）

- 阶段一：已核对 10 个冲突文件的本地/远端相关提交及实际冲突块；具体裁决和备选方案见 `merge-conflict-report.md`。
- 阶段二：已在 `codex/merge-dryrun-20260924` 从本地 `main` 建立隔离 worktree，并试合并 `origin/main`。10 个冲突均形成候选解；保留本地加杠结算分数守恒断言。候选解已暂存；提交状态以隔离分支的 Git 记录为准。
- 阶段三：验证结果：15 个杠类回归全部通过；rules 472 通过、0 失败；定向 TypeScript 检查通过；两个响应回归和阶段七回归通过。最终报告见 `merge-conflict-report.md`。
- 范围边界：主工作区四个未提交跟踪文件、`main` 引用和远端均未修改。隔离工作树保留供审阅。
