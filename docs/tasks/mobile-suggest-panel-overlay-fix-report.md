# 移动端 `#suggest` 面板修复报告

状态：代码候选与产品3独立浏览器验收已完成；老板已授权本轮提交/推送。
日期：2026-09-24

## 基线与改动

- 本地 `main` 为 `0e1340b90b7b064cb6df266acc267ad6c44826d5`；`git merge-base --is-ancestor ac51bfe main` 退出码 0；页面已无 `#scorebar`，满足老板选定的 A 顺序。
- 只改 `public/game/wannian-mahjong.html` 第 68 行的既有 `max-width:600px` 媒体查询，给 `#suggest` 增加移动端 `top:calc(94px + 66vw);bottom:284px;left:8px;right:auto!important;width:calc(100vw - 16px)`。既有 `overflow-y:auto` 保留，长建议可在面板内滚动。
- 桌面媒体查询外的规则完全未变；未改 `#bar`、加杠逻辑、规则引擎、服务端、生产端口或用户存档。未新增依赖或单测文件。开发与验收阶段未提交、未推送。
- `right:auto!important` 用于覆盖页面运行时写入的 `el.style.right`，避免旧定位把面板移出移动视口。纵向定位依据现有 `fitCanvas()`：画布按 `(innerWidth-40)/1360` 缩放、原高 900；390px 下原实测画布底边为 y=344，按钮从 y=568 起。新规则在该宽度预计把面板放在两者之间。

## 几何对照

下表“改动前”是 `docs/tasks/merge-candidate-status-message-repair-verification.md` 与 `E:\WorkBuddyWorkSpace\2026-09-23-12-53-04\codex-context-kit\after-fix-live-check.txt` 的既有浏览器实测；“改动后”仅为 CSS 计算值，**不是本次浏览器实测**。

| 390×844 项 | 改动前实测 | 改动后 CSS 预计 | 验收状态 |
|---|---:|---:|---|
| `#suggest` x / right | 140 / 620 | 8 / 382 | 待浏览器复测 |
| `#suggest` y / bottom | 112 / 804 | 351.4 / 560 | 待浏览器复测 |
| `#suggest` 宽 / 高 | 480 / 692 | 374 / 208.6 | 待浏览器复测 |
| 与 `canvas` 重叠面积 | 53,270 px² | 预计 0（画布底边原实测 y=344） | 待浏览器复测 |
| 与按钮重叠面积 | 至少 8 个元素有重叠 | 预计 0（按钮最早原实测 y=568） | 待浏览器复测 |
| `body.scrollWidth` | 390 | 预计 390 | 待浏览器复测 |
| `#bar` | 374×48，y8–56 | 样式未改，预计一致 | 待浏览器复测 |
| 建议文字 | 原实测含推荐牌、目标、理由 | DOM 生成逻辑未改，面板内部滚动 | 待浏览器复测完整性与可读性 |

桌面 1440×900：媒体查询不生效，`#suggest` 几何预计保持原实测 x=950、right=1430、宽 480；`#bar` 预计保持 520×60，y14–74。桌面端实际截图和几何仍待复测。

## 已执行验证与原始结果

环境：Windows PowerShell、项目现有 Node.js；在主工作区运行，未启动预览服务。

```text
node scripts/stage7-recommendation-regression.mjs
exit=0; tail: "failures": []

node scripts/p1-statusbar-regression.mjs
exit=0; tail: p1 statusbar regression passed

node scripts/p1-top-settlement-persistence-regression.mjs
exit=0; tail: P1 top settlement persistence regression: passed

node scripts/p1-ended-action-buttons-regression.mjs
exit=0; tail: p1 ended action buttons regression passed

git diff --check -- public/game/wannian-mahjong.html
exit=0

git diff --numstat -- public/game/wannian-mahjong.html
1  1  public/game/wannian-mahjong.html
```

**浏览器脚本原始输出：尚无。** 此会话的浏览器工具此前拒绝打开本地候选页面，并明确禁止通过本地服务或其他入口绕过 URL 策略；本次没有重新运行 `verify-interaction.cjs`，不能把上面的 CSS 推算和静态/既有回归记为实测通过。交给“产品3”在其独立环境使用 `codex-context-kit/verify-interaction.cjs` 或等价工具复测，附原始输出后再判断是否可推送。

## 待复测项与残余风险

1. 在独立 `127.0.0.1` 非生产端口（不得使用 18768）进入真实对局，390×844 测量 `#suggest` 的边界、与 `canvas` / 每个按钮的矩形重叠、`body.scrollWidth`、`#bar` 几何，并确认推荐牌、目标、理由可通过内部滚动完整读取。
2. 在 1440×900 确认桌面布局和 `#bar` 不变。原桌面设计本就与画布部分重叠，本次不改变这一产品选择。
3. 390×844 之外，较矮视口的画布与按钮间隙可能不足；本次未做断点矩阵验收。若独立复测发现面板高度不足或滚动困难，应在推送前单独裁决布局方案。

**建议**：当前改动可交付“产品3”独立浏览器测试，但尚不能建议推送。测试满足任务阈值后，由“产品3”询问老板是否推送；此会话不自行推送。

## 产品3独立复核进展（2026-09-24）

- 已重新读取本任务记录及本报告。当前根目录 `AGENTS.md` 缺失；页面候选仍是主工作区 `public/game/wannian-mahjong.html` 的未提交修改。
- 本会话调用 Codex 内置浏览器打开 `file:///C:/Users/Administrator/Documents/NEW/public/game/wannian-mahjong.html`，被 Browser use URL policy 明确拒绝。工具同时禁止以本地服务、脚本、其他浏览器入口或间接命令实现同一访问。故本会话未启动预览服务，未运行 `verify-interaction.cjs`，没有浏览器截图或几何原始输出。
- 390×844 和 1440×900 的真实点击、几何及文字可读性仍**未验收**。此前 CSS 推算与回归退出码不能替代这些条件；当前**不建议提交或推送**。
- 只有经正式策略允许指定的隔离预览地址、且浏览器工具不再拒绝后，才能在非 `18768` 的独立端口重新进行该项验收。不得通过改用其他浏览器技术绕过本次拒绝。

## 产品3独立浏览器验收结论（2026-09-24，后续实测）

前一节记录的是 `file:///C:/Users/Administrator/Documents/NEW/public/game/wannian-mahjong.html` 被 Browser Use URL policy 拒绝时的状态，不代表 `http://127.0.0.1:<port>` 也被拒绝。收到 OpenAI 支持对本地开发服务器正式预览路径的说明后，本次只读服务当前主工作区的 `public`，使用 `http://127.0.0.1:18925/game/wannian-mahjong.html`。Codex 内置浏览器成功打开该地址。未访问或占用 `18768`，未使用 Chrome 插件，未部署或改动页面代码。

操作路径：在 390×844 视口真实点击“新游戏”，读取实际 DOM 几何与文本；按 End 将 `#suggest` 滚动到底；切至 1440×900 并重载，等待页面渲染稳定后复核桌面几何与截图。首次切换视口时页面定位尚未稳定，曾瞬时读到 `right=1573`；重载并等待渲染后为 `right=1430`，以下只记录稳定状态。

| 390×844 实测项 | 结果 | 阈值 |
|---|---:|---:|
| `#suggest` x / right | 8 / 382 | `x>=0`，`right<=390` |
| `#suggest` y / bottom / 宽 / 高 | 351.390625 / 560 / 374 / 208.609375 | 位于牌桌与按钮之间 |
| `canvas#c` bottom | 343.609375 | 与面板重叠面积 0 |
| `#suggest` 与画布重叠 | 0 px² | 0 |
| `#suggest` 与任一按钮重叠 | 无 | 0 |
| `document.body.scrollWidth` | 390 | 390 |
| `#bar` | x=8，y=8，374×48 | 与修改前一致 |
| 面板内部滚动 | `overflow-y:auto`；`scrollTop` 从 0 到最大 2379 | 可滚动到底 |

真实页面含“推荐打出”、“推荐目标”、“核心理由”；滚动到底后可读取“十、本局推荐总结”末尾内容。移动端截图显示牌桌、面板和按钮分隔，未见遮挡。

1440×900 稳定实测：`#suggest` x=950、right=1430、宽 480；`#bar` x=460、y=14、520×60；`document.body.scrollWidth=1440`。与改动前报告的桌面几何一致。桌面面板与牌桌原有部分重叠仍在，本次移动端 CSS 未改变这一布局选择。

**裁决建议**：本任务规定的 390×844 / 1440×900 浏览器验收条件已通过，移动端 CSS 候选可进入用户的提交/推送裁决；本报告不构成提交或推送授权。较矮视口等断点矩阵仍未覆盖。静态预览未验证生产 `18768` 的 RL 接口，也不代表生产部署验收。

## 后续发布授权与范围

老板已在“产品3”主线会话明确授权本轮推送，指定由本开发会话执行；这发生在上一节验收结论之后。发布前只暂存页面文件与本任务的两份文档。实时查询的 `origin/main` 为 `7c587b44ad85d301e0c60210beb2f1068a41e150`，本地 `main` 为 `0e1340b90b7b064cb6df266acc267ad6c44826d5`。本轮普通快进推送会连同本地领先的 8 个既有提交一起发布：`682c598`、`de4915a`、`ff463e0`、`d693a2d`、`6d99852`、`2e13b40`、`ac51bfe`、`0e1340b`。生产部署和 `18768` 不在本轮范围。
