# 万年麻将 AI — 阶段一 PRD：规则引擎与评测地基

> **版本：** v1.0  
> **日期：** 2026-06-27  
> **状态：** 待评审  
> **预估工期：** 4-6 周  

---

## 目录

1. [概述](#一概述)
2. [交付物清单](#二交付物清单)
3. [牌数据结构定义](#三牌数据结构定义)
4. [模块一：tile-utils — 牌表示与基础操作](#四模块一tile-utils--牌表示与基础操作)
5. [模块二：meld-validator — 碰/杠/直铲合法性验证](#五模块二meld-validator--碰杠直铲合法性验证)
6. [模块三：hand-evaluator — 手牌评估](#六模块三hand-evaluator--手牌评估)
7. [模块四：score-calculator — 得分计算](#七模块四score-calculator--得分计算)
8. [模块五：wildcard-resolver — 宝牌解析](#八模块五wildcard-resolver--宝牌解析)
9. [模块六：rule-config — 规则配置](#九模块六rule-config--规则配置)
10. [模块七：benchmark-runner — 自动化评测框架](#十模块七benchmark-runner--自动化评测框架)
11. [L1 标准牌例集规范](#十一l1-标准牌例集规范)
12. [接口汇总](#十二接口汇总)
13. [验收标准](#十三验收标准)
14. [附录：完整测试用例清单](#十四附录完整测试用例清单)

---

## 一、概述

### 1.1 阶段目标

将万年麻将规则判断逻辑从 HTML/UI 层完全剥离，构建**独立、可测试、零 UI 依赖**的规则引擎。该引擎是后续所有 AI 能力（强规则 AI、MCTS、RL）的基石。

### 1.2 核心原则

- **纯函数优先**：所有规则判定函数不依赖全局状态，相同输入必定相同输出
- **零 UI 依赖**：引擎可在 Node.js 环境独立运行和测试
- **完整覆盖**：覆盖万年麻将所有规则边界（打烂体系、杠牌体系、宝牌机制、没走色翻番、牌型叠加、封顶）
- **可评测**：每个函数都有对应的标准牌例测试

### 1.3 技术选型建议

| 项目 | 建议 |
|------|------|
| 语言 | TypeScript（类型安全 + 浏览器/Node.js 双端运行） |
| 测试框架 | Vitest 或 Jest |
| 牌例格式 | JSON（便于批量加载和 CI 集成） |
| 模块化 | 每个模块独立 npm package 或 monorepo sub-package |

---

## 二、交付物清单

| # | 交付物 | 形式 | 验收标准 |
|---|--------|------|---------|
| 1 | 规则引擎核心模块（7个子模块） | TypeScript 源码 | 所有单元测试通过 |
| 2 | L1 标准牌例集 | JSON 文件 | ≥ 300 例，100% 通过 |
| 3 | 自动化评测框架 | CLI 工具 | 一键运行，生成报告 |
| 4 | 《万年麻将完整规则文档》 | Markdown | 覆盖全部规则边界 |

---

## 三、牌数据结构定义

### 3.1 牌的编码

使用 **"花色+数字"** 字符串编码，共 34 种牌：

```typescript
// 花色
type Suit = 'wan' | 'tiao' | 'tong' | 'feng' | 'jian';

// 万子：wan1 ~ wan9（共9种，各4张 = 36张）
// 条子：tiao1 ~ tiao9（共9种，各4张 = 36张）
// 筒子：tong1 ~ tong9（共9种，各4张 = 36张）
// 风牌：dong, nan, xi, bei（共4种，各4张 = 16张）
// 箭牌：zhong, fa, bai（共3种，各4张 = 12张）

type Tile = string; // 如 "wan1", "tiao5", "dong", "zhong"

// 牌的数值（序数牌取1~9，风牌箭牌取特殊值）
function tileValue(tile: Tile): number;
function tileSuit(tile: Tile): Suit;
function isHonor(tile: Tile): boolean; // 是否为字牌（风牌+箭牌）
function isWind(tile: Tile): boolean;  // 是否为风牌
function isArrow(tile: Tile): boolean; // 是否为箭牌
```

### 3.2 核心数据结构

```typescript
// 副露（碰/杠）
interface Meld {
  type: 'peng' | 'mingGang' | 'anGang' | 'zhiChan';
  tiles: [Tile, Tile, Tile, Tile?]; // 碰3张，杠4张
  fromPlayer?: number; // 直铲时记录打出牌的玩家
}

// 游戏状态
interface GameState {
  // 当前玩家手牌（不含副露）
  hand: Tile[];
  // 各玩家副露
  melds: Meld[][];
  // 各玩家弃牌堆
  discards: Tile[][];
  // 当前巡目（从1开始）
  turn: number;
  // 庄家位置（0-3）
  dealer: number;
  // 当前行动玩家（0-3）
  currentPlayer: number;
  // 各玩家当前得分
  scores: number[];
  // 牌墙剩余牌（用于杠后补牌模拟）
  wallTiles: Tile[];
  // 过水记录：{ player, tile, round }
  passRecords: { player: number; tile: Tile; round: number }[];
}

// 胡牌结果
interface WinResult {
  canWin: boolean;
  handType: HandType;
  baseScore: number;         // 牌型底分
  winMultiplier: number;     // 胡牌方式倍率
  isTrueWin: boolean;        // 真胡/假胡
  noColorBonus: boolean;     // 是否没走色
  finalScorePerPlayer: number[]; // 每家实际扣分（含封顶）
}

// 听牌结果
interface TenpaiResult {
  isTenpai: boolean;
  waitingTiles: Tile[];      // 听的牌列表
  waitingDetails: {          // 每种听牌的详情
    tile: Tile;
    remaining: number;       // 剩余枚数
    handTypeIfWin: HandType;
    baseScoreIfWin: number;
  }[];
}
```

### 3.3 牌型枚举

```typescript
enum HandType {
  PING_HU           = '平胡',
  PENG_PENG_HU      = '碰碰胡',
  QING_YI_SE        = '清一色',
  HUN_YI_SE         = '混一色',
  QI_DUI            = '七对',
  QUAN_FENG_XIANG   = '全风向',
  DA_LAN            = '打烂',
  BAN_ZHENG_ZONG    = '半正宗',
  QUAN_ZHENG_ZONG   = '全正宗',
  QI_ZI_BAN         = '七字半正宗',
  QI_ZI_QUAN        = '七字全正宗',
}

enum WinMethod {
  ZI_MO    = '自摸',
  DIAN_PAO = '点炮',
  QIANG_GANG = '抢杠',
  GANG_KAI  = '杠开',
  LIAN_GANG = '连杠',
  TIAN_HU   = '天胡',
  DI_HU     = '地胡',
}
```

---

## 四、模块一：tile-utils — 牌表示与基础操作

### 4.1 职责

提供牌的基本操作：排序、分组、花色判断、顺子/刻子/对子检测。

### 4.2 接口定义

```typescript
// === 牌属性 ===
function tileValue(tile: Tile): number;
// wan1→1, tiao5→5, dong→0, zhong→0

function tileSuit(tile: Tile): Suit;

function isNumberTile(tile: Tile): boolean;
// 是否序数牌（万筒条）

function isHonor(tile: Tile): boolean;
// 是否字牌（风牌+箭牌）

function isWind(tile: Tile): boolean;
// 是否风牌（东南西北）

function isArrow(tile: Tile): boolean;
// 是否箭牌（中发白）

// === 牌操作 ===
function sortTiles(tiles: Tile[]): Tile[];
// 按花色→数值排序

function groupBySuit(tiles: Tile[]): Map<Suit, Tile[]>;
// 按花色分组

function countTiles(tiles: Tile[]): Map<Tile, number>;
// 统计每种牌的数量

function getRemainingCount(tile: Tile, hand: Tile[], discards: Tile[][], melds: Meld[][]): number;
// 计算某张牌的剩余枚数

// === 面子/搭子检测 ===
function isShunzi(a: Tile, b: Tile, c: Tile): boolean;
// 是否顺子（同花色连续三张）

function isKezi(a: Tile, b: Tile, c: Tile): boolean;
// 是否刻子（三张相同）

function isDuizi(a: Tile, b: Tile): boolean;
// 是否对子

function isWindShunzi(a: Tile, b: Tile, c: Tile): boolean;
// 是否风牌顺子（任意三张不同风牌，或中发白）

// === 番种相关 ===
function isYaoJiu(tile: Tile): boolean;
// 是否幺九牌（1或9的序数牌）

function isZhongZhang(tile: Tile): boolean;
// 是否中张（2~8的序数牌）

function tileMod3Group(tile: Tile): 147 | 258 | 369 | 0;
// 序数牌返回模3分组（1/4/7→147, 2/5/8→258, 3/6/9→369），字牌返回0
```

### 4.3 单元测试要求

| 测试项 | 最少用例 |
|--------|:------:|
| tileValue/tileSuit 基本 | 10 |
| isHonor/isWind/isArrow 边界 | 8 |
| sortTiles 排序正确性 | 5 |
| isShunzi 顺子判定（含风牌顺子） | 8 |
| isKezi 刻子判定 | 3 |
| tileMod3Group 分组 | 12 |

---

## 五、模块二：meld-validator — 碰/杠/直铲合法性验证

### 5.1 职责

验证碰、杠（暗杠/明杠/强行跑杠）、直铲、连杠操作的合法性。**不吃牌**。

### 5.2 核心规则

```
杠牌基本前提：必须有 4 张相同牌。手中有 3 张（刻子）不能主动杠。
```

### 5.3 接口定义

```typescript
// === 碰 ===
function canPeng(hand: Tile[], discardTile: Tile): boolean;
// 手牌有2张与弃牌相同 → 可碰

// === 杠 ===
function canAnGang(hand: Tile[]): Tile[];
// 手中有4张相同 → 可暗杠，返回可暗杠的牌列表

function canMingGang(hand: Tile[], melds: Meld[], selfDrawnTile: Tile): Tile | null;
// 碰后自己摸到第4张 → 可明杠

function canQiangXingPaoGang(hand: Tile[], melds: Meld[], isTenpai: boolean, discardTile?: Tile): {
  canGang: boolean;
  gangTile: Tile | null;
  isPaoGang: boolean; // true=强行跑杠
} 
// 未听牌时可强行跑杠（别人打出第4张，或自己摸到第4张）
// 返回是否可杠 + 杠什么牌

// === 直铲 ===
function canZhiChan(
  hand: Tile[], 
  melds: Meld[], 
  isTenpai: boolean, 
  discardTile: Tile, 
  discardPlayer: number
): {
  canZhiChan: boolean;
  // 注意：即使 canZhiChan=true，如果同一张牌有人胡牌，胡牌优先
} 
// 条件：已听牌 + 手中有刻子(3张) + 别人打出该刻子第4张

// === 连杠 ===
function canLianGang(
  hand: Tile[], 
  melds: Meld[], 
  lastGangDrawTile: Tile
): {
  canLianGang: boolean;
  gangTile: Tile | null;
}
// 杠后补牌凑成另一组4张 → 可选连杠

// === 杠后补牌 ===
function getGangDrawTile(wallTiles: Tile[]): {
  drawTile: Tile;
  remainingWall: Tile[];
}
// 从牌墙末尾取1张（岭上牌），返回补牌 + 剩余牌墙
```

### 5.4 操作优先级

```
同一张牌，多人同时操作时的优先级：
1. 胡牌（最高优先级，从下家开始顺位优先，一炮不能多响）
2. 直铲（胡牌优先于直铲，与座位无关）
3. 碰/杠（从下家开始顺位优先）
```

### 5.5 单元测试要求

| 测试项 | 最少用例 |
|--------|:------:|
| 碰的合法性 | 5 |
| 暗杠检测 | 5 |
| 明杠检测 | 5 |
| 强行跑杠（成功/失败） | 8 |
| 直铲（听牌/未听牌/有刻子/无刻子） | 8 |
| 直铲被胡牌拦截 | 3 |
| 连杠触发与选择 | 5 |
| 杠后补牌 | 3 |

---

## 六、模块三：hand-evaluator — 手牌评估

### 6.1 职责

判定手牌的听牌状态、胡牌可能性、牌型分类。这是规则引擎最核心的模块。

### 6.2 子模块

```
hand-evaluator/
├── shanten.ts        # 向听数计算
├── tenpai.ts         # 听牌判定
├── standard-hand.ts  # 标准胡牌判定（4面子+1将）
├── seven-pairs.ts    # 七对判定
├── all-winds.ts      # 全风向判定
├── dalan.ts          # 打烂体系判定（打烂/半正宗/全正宗/七字半正宗/七字全正宗）
├── hand-type.ts      # 牌型综合判定 + 叠加
└── index.ts          # 统一导出
```

### 6.3 接口定义

#### 6.3.1 向听数计算

```typescript
function calcShanten(hand: Tile[], melds: Meld[]): number;
// 返回向听数。0=已听牌，-1=已胡牌
// 需要考虑：标准牌型、七对、全风向、打烂路线
```

#### 6.3.2 听牌判定

```typescript
function checkTenpai(hand: Tile[], melds: Meld[]): TenpaiResult;
// 返回听牌状态 + 听哪些牌 + 每张听的详情
```

#### 6.3.3 标准胡牌判定

```typescript
function checkStandardWin(hand: Tile[], melds: Meld[], winTile: Tile): {
  canWin: boolean;
  handType: HandType;
  // 判定逻辑：14张牌（含副露）是否能分解为4面子+1对将
  // 面子可以是顺子或刻子
  // 风牌可成顺子（任意三张不同风牌，中发白也成一顺）
}
```

**核心算法：递归回溯拆解面子**

```
输入：14张牌（含副露中的面子已固定）
1. 如果所有牌已拆完 → 成功
2. 尝试拆一个刻子（3张相同）
3. 尝试拆一个顺子（同花色连续3张）
4. 尝试拆风牌顺子（3张不同风牌，或中发白）
5. 如果剩下2张是对子 → 成功（将牌）
6. 回溯
```

#### 6.3.4 七对判定

```typescript
function checkSevenPairs(hand: Tile[], melds: Meld[]): boolean;
// 14张牌正好7个对子，无副露
// 注：七对不需要4面子结构
```

#### 6.3.5 全风向判定

```typescript
function checkAllWinds(hand: Tile[], melds: Meld[]): boolean;
// 14张牌全部是字牌（风牌+箭牌）
// 不需听牌即可胡，不需要4面子结构
```

#### 6.3.6 打烂体系判定

```typescript
function checkDalan(hand: Tile[], melds: Meld[]): {
  isDalan: boolean;           // 是否满足打烂基础条件
  handType: HandType;         // DA_LAN / BAN_ZHENG_ZONG / QUAN_ZHENG_ZONG / QI_ZI_BAN / QI_ZI_QUAN
}

// 打烂基础条件（三项必须同时满足）：
// 1. 14张牌全部不同（无对子）
// 2. 至少包含5种不同字牌（东南西北中发白）
// 3. 同花色任意两张序数牌差值 ≥ 3

// 在打烂基础上进一步判定：
// - 序数牌模3全同组（全147/全258/全369）→ 全正宗
// - 序数牌模3跨组（取值在147/258/369内但非全同组）→ 半正宗
// - 七字全齐（东南西北中发白齐全）+ 全正宗 → 七字全正宗
// - 七字全齐 + 半正宗 → 七字半正宗
```

**打烂差值判定算法：**

```typescript
function checkDalanDiff(tiles: Tile[]): boolean {
  // 按花色分组
  // 每组内排序
  // 检查任意相邻两张差值 >= 3
  const bySuit = groupBySuit(tiles.filter(isNumberTile));
  for (const [suit, suitTiles] of bySuit) {
    const values = suitTiles.map(tileValue).sort((a, b) => a - b);
    for (let i = 1; i < values.length; i++) {
      if (values[i] - values[i-1] < 3) return false;
    }
  }
  return true;
}
```

#### 6.3.7 牌型综合判定 + 叠加

```typescript
function classifyHand(hand: Tile[], melds: Meld[], winTile: Tile, winMethod: WinMethod): {
  handTypes: HandType[];    // 命中的所有牌型（可多个，用于叠加）
  baseScore: number;        // 叠加后的底分
}

// 牌型叠加规则：底分相乘
// 清一色(4) + 碰碰胡(2) = 8
// 清一色(4) + 七对(2) = 8
// 混一色(2) + 碰碰胡(2) = 4
// 混一色(2) + 七对(2) = 4
```

### 6.4 单元测试要求

| 测试项 | 最少用例 |
|--------|:------:|
| 标准胡牌（顺子+刻子混搭） | 15 |
| 标准胡牌（含风牌顺子） | 10 |
| 七对判定 | 8 |
| 全风向判定 | 5 |
| 打烂基础条件（全不同/字牌数/差值） | 20 |
| 半正宗判定 | 10 |
| 全正宗判定 | 10 |
| 七字半正宗判定 | 5 |
| 七字全正宗判定 | 5 |
| 牌型叠加（清一色+碰碰胡等） | 8 |
| 向听数计算 | 10 |
| 听牌判定 | 10 |

---

## 七、模块四：score-calculator — 得分计算

### 7.1 职责

根据牌型、胡牌方式、杠牌类型、没走色、真胡/假胡，计算最终得分。**受封顶 16 分限制**。

### 7.2 得分公式

#### 7.2.1 牌型底分表

| 牌型 | 底分 |
|------|:--:|
| 平胡 | 1 |
| 打烂 | 1 |
| 七对 | 2 |
| 碰碰胡 | 2 |
| 混一色 | 2 |
| 半正宗 | 2 |
| 清一色 | 4 |
| 全正宗 | 4 |
| 七字半正宗 | 4 |
| 七字全正宗 | 8 |
| 全风向 | 16 |

**牌型叠加：底分相乘。** 清一色(4) × 碰碰胡(2) = 8。

#### 7.2.2 暗杠/明杠得分

```
最终每家得分 = 牌型底分
  × 杠开×2
  × (暗杠×2，仅暗杠)
  × (没走色×2)
  × (没走色+真胡×2)
  × (假胡×2)
  → min(计算结果, 16) 封顶
```

#### 7.2.3 直铲得分

```
打出直铲牌的人 = 牌型底分 × 4 × (没走色×2) × (没走色+真胡×2)
其他两人       = 牌型底分 × 2 × (没走色×2) × (没走色+真胡×2)
→ 各受封顶16分限制
```

#### 7.2.4 其他胡牌方式

| 胡牌方式 | 得分 |
|---------|:--:|
| 自摸 | 牌型底分 ×1（三家各付） |
| 点炮 | 牌型底分 ×2（放炮者付） |
| 抢杠 | 6 分（被抢杠者付） |
| 天胡/地胡 | 4 分 |
| 连杠 | 杠开 ×2（每次连杠翻倍） |

### 7.3 没走色判定

```typescript
function checkNoColor(
  hand: Tile[], 
  melds: Meld[], 
  gangDrawTile: Tile, 
  handTypes: HandType[]
): boolean;

// 条件：手牌为清一色或混一色
// 补牌与手牌同花色（清一色/混一色的花色），或补到字牌/箭牌 → 没走色
```

### 7.4 接口定义

```typescript
function calculateScore(params: {
  handTypes: HandType[];
  baseScore: number;
  winMethod: WinMethod;
  gangType?: 'anGang' | 'mingGang' | 'zhiChan';
  noColorBonus: boolean;
  isTrueWin: boolean;
  lianGangCount: number;      // 连杠次数
  zhiChanFromPlayer?: number; // 直铲时打出牌的玩家
  currentPlayer: number;       // 胡牌玩家
}): {
  scorePerPlayer: number[];    // 每家实际扣分（含封顶）
  winnerGain: number;          // 赢家总收入
}
```

### 7.5 封顶规则

```typescript
const MAX_LOSS_PER_PLAYER = 16;

function applyCap(scorePerPlayer: number[]): number[] {
  return scorePerPlayer.map(s => Math.min(s, MAX_LOSS_PER_PLAYER));
}
```

### 7.6 单元测试要求

| 测试项 | 最少用例 |
|--------|:------:|
| 各牌型底分正确 | 12 |
| 自摸/点炮倍率 | 6 |
| 暗杠翻倍 | 5 |
| 明杠得分 | 5 |
| 直铲得分（打出者/其他两人） | 8 |
| 没走色翻番 | 8 |
| 没走色+真胡翻两番 | 5 |
| 连杠翻倍 | 5 |
| 牌型叠加得分 | 6 |
| 封顶 16 分截断 | 10 |
| 抢杠 6 分 | 3 |
| 天胡/地胡 4 分 | 2 |

---

## 八、模块五：wildcard-resolver — 宝牌解析

### 8.1 职责

直铲后判定真胡/假胡。宝牌是直铲后补摸的那张牌，可替代任意牌。

### 8.2 接口定义

```typescript
function resolveWildcard(
  hand: Tile[],           // 直铲前手牌（14张含刻子）
  melds: Meld[],          // 副露
  zhiChanDrawTile: Tile,  // 直铲补牌（宝牌）
): {
  isTrueWin: boolean;     // 真胡：不需要宝牌也能胡
  isFakeWin: boolean;     // 假胡：需要宝牌替代某张才能胡
  fakeWinReplacement?: {  // 假胡时宝牌替代了哪张
    originalTile: Tile;
    replacedBy: Tile;
  };
}

// 判定逻辑：
// 1. 用补牌替换手牌中的每一张（逐个尝试）
// 2. 如果存在一种替换能胡牌 → 假胡
// 3. 如果不需要替换就能胡 → 真胡
// 4. 分数差异：假胡 = 真胡分数 × 2
```

### 8.3 单元测试要求

| 测试项 | 最少用例 |
|--------|:------:|
| 真胡判定 | 8 |
| 假胡判定（宝牌替换） | 8 |
| 不能胡（替换也不能胡） | 5 |

---

## 九、模块六：rule-config — 规则配置

### 9.1 职责

提供规则参数化配置，便于未来扩展（如不同玩法变体）。

### 9.2 接口定义

```typescript
interface RuleConfig {
  // 基本
  totalTiles: number;           // 136
  canChi: boolean;              // false
  maxLossPerPlayer: number;     // 16

  // 打烂
  dalanMinHonorTypes: number;   // 5（至少5种字牌）
  dalanMinDiff: number;         // 3（同花色差值≥3）

  // 杠牌
  allowQiangXingPaoGang: boolean; // true
  zhiChanRequireTenpai: boolean;  // true

  // 胡牌
  allowMultipleRon: boolean;      // false（一炮不能多响）

  // 封顶
  enableCap: boolean;             // true
  capAmount: number;              // 16
}

const DEFAULT_RULES: RuleConfig = { ... };
```

---

## 十、模块七：benchmark-runner — 自动化评测框架

### 10.1 职责

加载标准牌例集，批量运行规则判定，生成评测报告。

### 10.2 牌例格式

```typescript
interface TestCase {
  id: string;                    // "L1-dalan-001"
  level: 'L1' | 'L2' | 'L3';
  category: string;              // "dalan-basic"
  description: string;
  
  // 输入
  hand: Tile[];
  melds: Meld[];
  winTile?: Tile;               // 胡的牌
  discardTile?: Tile;           // 别人打的牌
  isSelfDraw: boolean;
  gangType?: 'anGang' | 'mingGang' | 'zhiChan';
  zhiChanFromPlayer?: number;
  isTenpai: boolean;
  lianGangCount: number;
  
  // 期望输出
  expected: {
    canWin: boolean;
    handTypes?: HandType[];
    baseScore?: number;
    isTrueWin?: boolean;
    noColorBonus?: boolean;
    scorePerPlayer?: number[];
    canPeng?: boolean;
    canGang?: boolean;
    canZhiChan?: boolean;
    canLianGang?: boolean;
  };
}
```

### 10.3 CLI 接口

```bash
# 运行全部 L1 测试
npm run test:rules -- --level L1

# 运行指定分类
npm run test:rules -- --category dalan

# 生成报告
npm run test:rules -- --report json
```

### 10.4 评测报告格式

```json
{
  "timestamp": "2026-06-27T10:00:00Z",
  "totalCases": 320,
  "passed": 320,
  "failed": 0,
  "passRate": "100%",
  "byCategory": {
    "dalan-basic": { "total": 30, "passed": 30 },
    "dalan-subtype": { "total": 30, "passed": 30 },
    "gang-system": { "total": 30, "passed": 30 },
    "wildcard": { "total": 20, "passed": 20 },
    "no-color": { "total": 20, "passed": 20 },
    "wind-shunzi": { "total": 20, "passed": 20 },
    "win-multiplier": { "total": 20, "passed": 20 },
    "pass-rule": { "total": 15, "passed": 15 }
  },
  "failedCases": []
}
```

---

## 十一、L1 标准牌例集规范

### 11.1 总体要求

| 级别 | 数量 | 通过率要求 |
|------|:--:|:--:|
| L1 规则边界 | ≥ 300 | **100%** |

### 11.2 专项分布

| 专项领域 | 最少例数 | 覆盖要点 |
|---------|:------:|---------|
| 打烂基础条件 | 30 | 全不同边界、字牌数4/5/6/7、差值=2/=3/>3 |
| 打烂子型判定 | 30 | 逐级判定：打烂→半正宗→全正宗→七字半正宗→七字全正宗 |
| 杠牌体系 | 30 | 暗杠/明杠/强行跑杠成功/强行跑杠失败/直铲触发/直铲被胡牌拦截/连杠选择 |
| 宝牌真胡/假胡 | 20 | 真胡各牌型、假胡（宝牌替代不同位置）、不能胡 |
| 没走色翻番 | 20 | 清一色没走色/走色、混一色没走色/走色、补字牌算没走色 |
| 风牌顺子 | 20 | 不同风牌成顺、中发白成顺、风牌顺子+普通顺子混搭 |
| 胡牌方式倍率 | 20 | 自摸/点炮/杠开/连杠/抢杠/天地胡/暗杠vs明杠/直铲 |
| 牌型叠加 | 15 | 清一色+碰碰胡、清一色+七对、混一色+碰碰胡、叠加+杠开 |
| 过水规则 | 15 | 同圈放弃后同张牌不可胡、不同张可胡、进入下一圈可胡 |
| 封顶截断 | 15 | 刚好16分、超过16分截断、叠加牌型截断、杠开+没走色截断 |
| 听牌判定 | 10 | 单面听/两面听/三面听/单骑听/风牌听 |
| 向听数计算 | 10 | 1向听/2向听/已听牌/已胡牌 |
| 碰/杠合法性 | 10 | 可碰/不可碰/可杠/不可杠/刻子不能主动杠 |
| 补充边界 | 55 | 边界牌型、特殊组合、边缘case |

**总计：≥ 300 例**

### 11.3 牌例编写规范

每条例必须包含：
1. **唯一 ID**：格式 `L1-{category}-{序号}`
2. **清晰描述**：说明测试什么规则
3. **完整输入**：hand/melds/winTile/discardTile/isSelfDraw 等
4. **精确期望**：expected 中每个字段都要填

```json
{
  "id": "L1-dalan-basic-001",
  "level": "L1",
  "category": "dalan-basic",
  "description": "打烂基础条件满足——14张全不同+5种字牌+同花色差值≥3，应判定为打烂",
  "hand": ["wan1","wan4","wan7","tiao2","tiao6","tiao9","tong3","tong7","dong","nan","xi","bei","zhong","fa"],
  "melds": [],
  "winTile": "fa",
  "isSelfDraw": true,
  "isTenpai": true,
  "lianGangCount": 0,
  "expected": {
    "canWin": true,
    "handTypes": ["打烂"],
    "baseScore": 1,
    "isTrueWin": true,
    "noColorBonus": false,
    "scorePerPlayer": [1, 1, 1]
  }
}
```

---

## 十二、接口汇总

### 12.1 完整 API 导出

```typescript
// 从 rule-engine 包导出

// tile-utils
export { tileValue, tileSuit, isNumberTile, isHonor, isWind, isArrow,
         sortTiles, groupBySuit, countTiles, getRemainingCount,
         isShunzi, isKezi, isDuizi, isWindShunzi,
         isYaoJiu, isZhongZhang, tileMod3Group } from './tile-utils';

// meld-validator
export { canPeng, canAnGang, canMingGang, canQiangXingPaoGang,
         canZhiChan, canLianGang, getGangDrawTile } from './meld-validator';

// hand-evaluator
export { calcShanten, checkTenpai, checkStandardWin,
         checkSevenPairs, checkAllWinds, checkDalan,
         classifyHand } from './hand-evaluator';

// score-calculator
export { calculateScore, checkNoColor, applyCap } from './score-calculator';

// wildcard-resolver
export { resolveWildcard } from './wildcard-resolver';

// rule-config
export { RuleConfig, DEFAULT_RULES } from './rule-config';
```

### 12.2 不依赖 UI

所有函数接收数据、返回数据，不操作 DOM、不使用浏览器 API。可在 Node.js 中直接 `import` 使用。

---

## 十三、验收标准

### 13.1 功能验收

- [ ] `tile-utils` 所有函数通过单元测试
- [ ] `meld-validator` 碰/杠/直铲/连杠判定 100% 正确
- [ ] `hand-evaluator` 所有牌型判定 100% 正确（标准胡牌/七对/全风向/打烂5子型）
- [ ] `score-calculator` 得分计算正确（含叠加、杠开、没走色、封顶）
- [ ] `wildcard-resolver` 真胡/假胡判定正确
- [ ] L1 标准牌例集 ≥ 300 例，规则判定 **100% 通过**
- [ ] 打烂体系 5 种子型逐级判定正确
- [ ] 过水规则逻辑正确

### 13.2 非功能验收

- [ ] 规则引擎可在 Node.js 环境独立运行（零浏览器依赖）
- [ ] 同一局面重复执行 100 次，结果完全一致（纯函数无副作用）
- [ ] 单次胡牌判定耗时 < 5ms
- [ ] 单次向听数计算耗时 < 10ms
- [ ] 评测框架一键运行，输出 JSON 报告

### 13.3 交付验收

- [ ] 《万年麻将完整规则文档》.md — 覆盖全部规则边界
- [ ] 规则引擎源码（7 个子模块）+ 单元测试
- [ ] L1 标准牌例集 JSON（≥ 300 例）
- [ ] 自动化评测 CLI 工具 + 使用文档

---

## 十四、附录：完整测试用例清单

### A. 打烂体系测试（60例）

#### A1. 打烂基础条件（30例）

| ID | 描述 | 预期 |
|----|------|------|
| L1-dalan-basic-001 | 14张全不同+5种字牌+差值≥3 | 打烂 ✅ |
| L1-dalan-basic-002 | 14张全不同+5种字牌+差值=2 | 不满足 ❌ |
| L1-dalan-basic-003 | 14张全不同+4种字牌+差值≥3 | 不满足（字牌不够）❌ |
| L1-dalan-basic-004 | 有对子（不全不同） | 不满足 ❌ |
| L1-dalan-basic-005 | 7种字牌全齐+差值≥3 | 打烂 ✅ |
| ... | （剩余25例覆盖各边界） | |

#### A2. 打烂子型判定（30例）

| ID | 描述 | 预期 |
|----|------|------|
| L1-dalan-sub-001 | 打烂+模3全147 | 全正宗 |
| L1-dalan-sub-002 | 打烂+模3全258 | 全正宗 |
| L1-dalan-sub-003 | 打烂+模3全369 | 全正宗 |
| L1-dalan-sub-004 | 打烂+模3跨组(147+258) | 半正宗 |
| L1-dalan-sub-005 | 打烂+模3全147+七字全齐 | 七字全正宗 |
| L1-dalan-sub-006 | 打烂+模3跨组+七字全齐 | 七字半正宗 |
| ... | （剩余24例） | |

### B. 杠牌体系测试（30例）

| ID | 描述 | 预期 |
|----|------|------|
| L1-gang-001 | 手中有4张相同 | 可暗杠 |
| L1-gang-002 | 碰后摸到第4张 | 可明杠 |
| L1-gang-003 | 未听牌+有暗刻+别人打第4张 | 可强行跑杠 |
| L1-gang-004 | 强行跑杠补牌能组成顺子 | 跑杠成功 |
| L1-gang-005 | 强行跑杠补牌不能组成 | 跑杠失败 |
| L1-gang-006 | 已听牌+有刻子+别人打第4张 | 可直铲 |
| L1-gang-007 | 未听牌+有刻子+别人打第4张 | 不可直铲（只能强行跑杠） |
| L1-gang-008 | 直铲时有人胡同张牌 | 胡牌优先 |
| L1-gang-009 | 杠后补牌凑成另一组杠 | 可连杠 |
| L1-gang-010 | 杠后补牌不凑成杠 | 不可连杠 |
| ... | （剩余20例） | |

### C. 得分计算测试（73例）

#### C1. 牌型底分（12例）
#### C2. 胡牌方式倍率（6例）
#### C3. 暗杠/明杠（10例）
#### C4. 直铲（8例）
#### C5. 没走色（13例）
#### C6. 连杠（5例）
#### C7. 牌型叠加（6例）
#### C8. 封顶（10例）
#### C9. 抢杠/天地胡（5例）

### D. 宝牌真胡/假胡测试（20例）

### E. 风牌顺子测试（20例）

### F. 过水规则测试（15例）

### G. 听牌/向听测试（20例）

### H. 碰/杠合法性测试（10例）

### I. 补充边界测试（55例）

---

> **总计：≥ 303 例（核心专项），加上补充边界 ≥ 300 例**  
> **通过率要求：100%**
