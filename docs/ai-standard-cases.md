# AI 标准牌例集

本文档对应 `docs/ai-discard-logic-spec.md` 的 P3。目标是用固定牌例做人工回归，确认 AI 修改后仍符合“稳定、可解释、不犯低级错”的产品标准。

牌例使用 `wan1`、`tong9`、`tiao5`、`dong`、`nan`、`xi`、`bei`、`zhong`、`fa`、`bai` 表示牌。每个牌例只约束“期望弃牌类型”，不强制唯一牌，除非牌例说明中明确写出。

同名机器可读版本见 `docs/ai-standard-cases.json`，后续可直接作为 fixture 数据源。

## 回归使用方式

- 修改 AI 后，至少抽查本文件中的相关类别牌例。
- 导出游戏记录时，对照 `suggestLogs` 检查 `source`、`route`、`shantenAfter`、`breaksMeld`、`breaksPair`、`breaksTaatsu`、`waitCount`、`defenseScore` 和 `reason`。
- 如果后续补自动化测试，可以把 `hand`、`scene`、`expected` 直接转为 fixture。

## 牌例列表

### 1. 孤张优先

- `hand`: `wan2,wan3,wan4,tong3,tong4,tiao6,tiao7,wan8,tong9,bei,zhong,fa,bai,wan1`
- `scene`: 序盘，无副露，普通对局。
- `expected`: 优先弃连接度最低的孤张或价值较低字牌，不应拆 `wan2-3-4`、`tong3-4`、`tiao6-7`。
- `focus`: 孤张评分方向应取低连接度候选。

### 2. 两面搭子保护

- `hand`: `wan3,wan4,tong4,tong5,tiao6,tiao7,wan9,tong1,tiao1,dong,nan,zhong,zhong,bai`
- `scene`: 序盘，无明显危险。
- `expected`: 不应拆 `wan3-4`、`tong4-5`、`tiao6-7` 这类两面搭子。
- `focus`: `breaksTaatsu` 应能暴露拆搭子风险。

### 3. 边搭与中张取舍

- `hand`: `wan1,wan2,wan5,wan6,tong2,tong3,tiao8,tiao9,dong,xi,zhong,fa,bai,bai`
- `scene`: 序盘，多个候选向听接近。
- `expected`: 在向听相同下，优先保留中张两面潜力，边搭可让位于更高质量搭子。
- `focus`: 候选相同向听时比较结构质量。

### 4. 对子保护

- `hand`: `wan2,wan2,wan4,wan5,tong6,tong7,tiao3,tiao4,dong,nan,xi,zhong,fa,tong9`
- `scene`: 普通路线，无防守压力。
- `expected`: 不应无收益拆 `wan2,wan2` 对子。
- `focus`: `breaksPair` 为 true 的候选应被降权。

### 5. 七对子五对保护

- `hand`: `wan1,wan1,wan3,wan3,tong5,tong5,tiao7,tiao7,dong,dong,wan9,tong2,fa,bai`
- `scene`: 七对子路线明显，已有 5 对。
- `expected`: 优先弃单张，不应拆任何对子。
- `focus`: route 应倾向 `7p`，且对子候选被保护。

### 6. 打烂路线保护

- `hand`: `wan1,wan5,wan9,tong2,tong6,tiao3,tiao7,dong,nan,xi,bei,zhong,fa,bai`
- `scene`: 打烂形态完整度高，但同花色数牌跨越多个正宗组。
- `expected`: 不升级半正宗/全正宗路线，保持 `dalan` 并优先处理路线冲突牌。
- `focus`: route 应允许 `dalan` 参与综合向听比较。

### 7. 半正宗路线保护

- `hand`: `wan1,wan4,wan7,tong2,tong5,tong8,tiao3,tiao6,tiao9,dong,nan,zhong,fa,bai`
- `scene`: 半正宗/正宗潜力明显。
- `expected`: 候选相同时保留正宗组内关键牌，优先处理路线外低价值牌。
- `focus`: routeScore 应体现 `banzheng` 路线。

### 8. 全正宗路线保护

- `hand`: `wan1,wan4,wan7,tong1,tong4,tong7,tiao1,tiao4,tiao7,dong,nan,xi,zhong,bai`
- `scene`: 全正宗方向强。
- `expected`: 不应随意拆正宗组内结构。
- `focus`: route 应允许 `quanzheng` 参与比较。

### 9. 混一色倾向

- `hand`: `wan2,wan3,wan4,wan6,wan7,wan8,wan9,wan9,dong,nan,xi,zhong,fa,tong5`
- `scene`: 万子加字牌的混一色倾向明显。
- `expected`: 候选相同向听时，优先弃非主色 `tong5`。
- `focus`: 染手偏向不能导致拆主色有效结构。

### 10. 听牌最大进张

- `hand`: `wan2,wan3,wan4,tong3,tong4,tong5,tiao5,tiao6,tiao7,wan6,wan7,dong,dong,wan8`
- `scene`: 弃牌后可听牌，存在多个听牌形。
- `expected`: 优先选择等张种类或剩余枚数更多的听牌形。
- `focus`: `waitCount` 应参与听牌阶段选择。

### 11. 听牌危险牌回避

- `hand`: `wan2,wan3,wan4,tong3,tong4,tong5,tiao5,tiao6,tiao7,wan6,wan7,dong,dong,wan8`
- `scene`: 末盘，对手多副露；两个危险对手都已打过 `wan2`。
- `expected`: 保持 2 种 5 枚听牌，并优先弃对危险对手的现物 `wan2`。
- `focus`: 听牌质量相同时由 `defenseScore` 决定。

### 12. 自己向听远时弃和

- `hand`: `bai,bei,bei,nan,tiao2,tiao3,tiao9,tong6,tong8,wan2,wan4,wan5,xi,zhong`
- `scene`: 末盘，对手明显危险，自己综合向听为 3；三个对手都已打过 `bai`。
- `expected`: 进入 `fullFold`，从全部手牌中选择全场现物 `bai`。
- `focus`: 向听较远时允许为安全牺牲进攻效率。

### 13. 领先时防守

- `hand`: `wan2,wan3,wan5,tong4,tong5,tong8,tiao6,tiao7,dong,dong,nan,xi,zhong,bai`
- `scene`: 中后期，自己分数领先，对手副露明显；三个对手都已打过 `bai`。
- `expected`: 进入 `fullFold` 并弃全场现物 `bai`。
- `focus`: 分数领先应提高防守权重。

### 14. 落后时进攻

- `hand`: `wan2,wan3,wan4,tong3,tong4,tong5,tiao5,tiao6,tiao7,wan6,wan7,dong,dong,fa`
- `scene`: 中后期，自己大幅落后且接近听牌。
- `expected`: 不应过度弃和；可在可控风险下保留高进张听牌。
- `focus`: 后续防守模型应支持风险容忍度联动。

### 15. 对手多副露防守

- `hand`: `wan2,wan3,wan4,tong3,tong4,tong5,tiao5,tiao6,tiao9,dong,nan,xi,zhong,bai`
- `scene`: 对手有 2 副露以上，牌局中后期；三个对手都已打过 `bai`。
- `expected`: 在同向听候选中优先弃全场现物 `bai`。
- `focus`: `defenseScore` 对多个对手危险应更敏感。

### 16. 明杠不恶化

- `hand`: `wan2,wan3,wan4,tong5,tong5,tong5,tiao3,tiao4,tiao5,dong,dong,zhong,fa`
- `scene`: 他家打出 `tong5`，AI 可明杠。
- `expected`: 只有模拟杠后综合向听不恶化才杠。
- `focus`: `aiRespond` 明杠路径必须先验证向听。

### 17. 听牌不破坏暗杠

- `hand`: `tiao7,tiao7,tiao7,tong1,tong2,tong3,tong7,tong7,tong7,wan7,wan7,wan7,wan7,wan8`
- `scene`: AI 摸到第四张 `wan7`；摸牌前听 `wan6/wan8/wan9`，暗杠后只听 `wan8`。
- `expected`: 跳过暗杠，响应日志中的 `lostWaits` 包含 `wan6/wan9`。
- `focus`: 听牌阶段暗杠必须完整保留原待牌。

### 18. 碰牌不恶化

- `hand`: `wan2,wan3,wan4,tong5,tong5,tiao3,tiao4,tiao5,wan7,wan8,dong,nan,zhong`
- `scene`: 他家打出 `tong5`，AI 可碰。
- `expected`: 碰后向听改善或不恶化才碰；无收益碰应被抑制。
- `focus`: `aiRespond` 碰路径必须模拟碰后手牌。

### 19. 假搭子识别

- `hand`: `wan3,wan5,tong4,tong5,tiao6,tiao7,wan9,tong9,tiao1,dong,nan,zhong,fa,bai`
- `scene`: 关键进张 `wan4` 已基本见光。
- `expected`: `wan3-5` 假搭子价值应下降，可以优先处理。
- `focus`: 候选过滤应识别死搭子。

### 20. MCTS/RL 不覆盖明显更优规则结果

- `hand`: `wan3,wan4,tong4,tong5,tiao6,tiao7,wan9,tong1,tiao1,dong,nan,zhong,zhong,bai`
- `scene`: 自弈或调试时启用 MCTS/RL。
- `expected`: 如果 MCTS/RL 选择会拆有效搭子或导致向听差于规则结果，应回退规则 AI。
- `focus`: `source` 应记录最终来源，`reason` 应说明覆盖或回退原因。

## 完成标准

- 20 个牌例均有手牌、局面信息和期望弃牌类型。
- 每次 AI 改动后至少按改动类型回归相关牌例。
- 任一牌例失败时，应保留导出的 `suggestLogs` 作为复盘证据。
