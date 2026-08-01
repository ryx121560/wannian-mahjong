# P1 顶部状态栏候选验收报告

状态：研发自测通过，等待产品验收；未合并、未提交、未推送、未发布。

## 范围

- 删除短四家积分栏 `#scorebar`、其 CSS、`updateScorebar`、`_spUpdateScore`、`_spInitScore` 与全部调用。
- 删除旧的第二状态/结算节点 `#msg`；页面只保留 `#bar` 作为顶部常驻状态与结算栏。
- 将 `#bar` 固定在视口顶部居中并设置 `pointer-events:none`、宽度约束、最大高度和小屏样式。
- 普通胡牌、流局、杠开、破产重置和已结束快照恢复均将最终摘要写入 `#bar`。
- 自弈状态面板只保留训练状态、局数和图表，不渲染四家积分。
- 新增 `test:p1-statusbar`，并将既有推荐回归中的已结束快照断言从已删除的 `#msg` 迁移到 `#bar`。

## 专项覆盖

- 页面不存在 `#scorebar`、`#msg`、积分栏更新函数或自弈积分节点。
- `#bar` 是唯一非空状态栏；空值、空白、`null` 和 `undefined` 都会回退到稳定状态文本。
- idle、新局、进行中、响应、刷新恢复、胡牌、流局、杠开、破产和自弈入口均保留状态或结算文本。
- 静态几何断言与隔离页面实测覆盖 `1366x768`、`1920x1080`、`320x568`、`375x667`、`390x844`：状态栏不与推荐面板或底部按钮重叠。

## 隔离页面证据

- 仅临时启动 `127.0.0.1:18769`，HTTP 200；未启动、访问或操作 `18768`。
- 页面实测 `#bar` 数量为 1，`#scorebar` 数量为 0，`#bar` 可见、固定定位、`pointer-events:none`。
- 五种视口均满足状态栏底部小于推荐面板顶端和底部按钮顶端；控制台 error 为 0。
- 隔离标签已关闭、视口已复位，18769 临时服务已停止并确认端口释放。

## 回归结果

| 命令 | 结果 |
| --- | --- |
| `npm.cmd run test:p1-statusbar` | 通过 |
| `npm.cmd run test:rules` | 472/472 通过 |
| `npm.cmd run test:recommendation` | 100/100 通过 |
| `npm.cmd run test:p0-kong-page-persistence` | 通过 |
| `npm.cmd run test:response-restore-revalidation` | 通过 |
| `npm.cmd run verify:browser-rules` | 通过 |
| `npm.cmd run verify:recommendation` | 通过 |
| `npx.cmd tsc --noEmit` | 通过 |
| `npm.cmd run build` | 通过 |
| `git diff --check` | 通过 |

## 候选文件

- `package.json`
- `public/game/wannian-mahjong.html`
- `scripts/p1-statusbar-regression.mjs`
- `scripts/stage4-recommendation-regression.mjs`
- 本报告

## 明确排除

- 未修改积分计算、积分持久化、积分 API、新游戏语义或快照耐久性方案。
- 未修改 P0 杠规则、AI/MCTS/推荐策略、Stage8 action space、训练、自弈生成、服务或用户数据。
- 未访问用户浏览器存储或 `127.0.0.1:18768`。
- 构建产生的 `rule_engine.js`、`recommendation_engine.js` EOL 差异及 `tsconfig.tsbuildinfo` 已清理，不属于候选。
