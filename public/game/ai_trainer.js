// ============================================================
// 万年麻将 AI 强化学习训练器
// 2层 MLP + 经验回放 + TD(Q-Learning)
// ============================================================

// --- 矩阵运算工具 ---
function matMul(A, B) {
  const m = A.length, k = A[0].length, n = B[0].length;
  const C = new Array(m);
  for (let i = 0; i < m; i++) {
    C[i] = new Array(n).fill(0);
    for (let j = 0; j < n; j++) {
      let s = 0;
      for (let p = 0; p < k; p++) s += A[i][p] * B[p][j];
      C[i][j] = s;
    }
  }
  return C;
}

function vecAdd(a, b) { return a.map((v, i) => v + b[i]); }
function vecSub(a, b) { return a.map((v, i) => v - b[i]); }
function vecMul(a, scalar) { return a.map(v => v * scalar); }
function vecElemMul(a, b) { return a.map((v, i) => v * b[i]); }
function vecOuter(a, b) {
  const m = new Array(a.length);
  for (let i = 0; i < a.length; i++) { m[i] = vecMul(b, a[i]); }
  return m;
}
function transpose(M) {
  const r = M.length, c = M[0].length;
  const T = new Array(c);
  for (let j = 0; j < c; j++) { T[j] = new Array(r); for (let i = 0; i < r; i++) T[j][i] = M[i][j]; }
  return T;
}
function relu(x) { return Math.max(0, x); }
function reluDeriv(x) { return x > 0 ? 1 : 0; }
function softmax(arr) {
  const max = Math.max(...arr);
  const exps = arr.map(v => Math.exp(v - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map(v => v / sum);
}

// --- 神经网络 ---
class MLP {
  // layers: [inputSize, hidden1Size, hidden2Size, outputSize]
  constructor(layers) {
    this.layers = layers;
    this.W = []; this.b = [];
    // Xavier 初始化
    for (let i = 0; i < layers.length - 1; i++) {
      const scale = Math.sqrt(2.0 / (layers[i] + layers[i + 1]));
      this.W[i] = new Array(layers[i + 1]);
      for (let j = 0; j < layers[i + 1]; j++) {
        this.W[i][j] = new Array(layers[i]);
        for (let k = 0; k < layers[i]; k++) this.W[i][j][k] = (Math.random() * 2 - 1) * scale;
      }
      this.b[i] = new Array(layers[i + 1]).fill(0);
      // 转置 W 方便前向计算 (W 存为 [输出 × 输入])
    }
    // Adam 参数
    this.mW = this.W.map(w => w.map(row => row.map(() => 0)));
    this.vW = this.W.map(w => w.map(row => row.map(() => 0)));
    this.mb = this.b.map(b => b.map(() => 0));
    this.vb = this.b.map(b => b.map(() => 0));
    this.t = 0;
  }

  // 前向传播，返回每层激活值（含输入层）
  forward(x) {
    const acts = [x]; // acts[0] = input
    let a = x;
    for (let i = 0; i < this.W.length; i++) {
      // a_out = relu(W[i] · a + b[i])，输出层不加 relu
      const z = this.W[i].map((row, j) => row.reduce((s, w, k) => s + w * a[k], 0) + this.b[i][j]);
      a = i === this.W.length - 1 ? z : z.map(relu);
      acts.push(a);
    }
    return { output: a, acts: acts };
  }

  // 单样本反向传播 + Adam 更新
  backward(input, target, lr) {
    const { acts } = this.forward(input);
    this.t++;
    const beta1 = 0.9, beta2 = 0.999, eps = 1e-8;

    // 输出层梯度 (MSE: dL/dz = output - target)
    let delta = vecSub(acts[acts.length - 1], target);

    for (let i = this.W.length - 1; i >= 0; i--) {
      const aPrev = acts[i]; // 输入到本层
      const dw = vecOuter(delta, aPrev); // [outSize × inSize]
      const db = delta;

      // Adam 更新 W
      for (let j = 0; j < this.W[i].length; j++) {
        for (let k = 0; k < this.W[i][j].length; k++) {
          const g = dw[j][k];
          this.mW[i][j][k] = beta1 * this.mW[i][j][k] + (1 - beta1) * g;
          this.vW[i][j][k] = beta2 * this.vW[i][j][k] + (1 - beta2) * g * g;
          const mHat = this.mW[i][j][k] / (1 - Math.pow(beta1, this.t));
          const vHat = this.vW[i][j][k] / (1 - Math.pow(beta2, this.t));
          this.W[i][j][k] -= lr * mHat / (Math.sqrt(vHat) + eps);
        }
      }
      // Adam 更新 b
      for (let j = 0; j < this.b[i].length; j++) {
        this.mb[i][j] = beta1 * this.mb[i][j] + (1 - beta1) * db[j];
        this.vb[i][j] = beta2 * this.vb[i][j] + (1 - beta2) * db[j] * db[j];
        this.mb[i][j] = this.mb[i][j] / (1 - Math.pow(beta1, this.t));
        this.vb[i][j] = this.vb[i][j] / (1 - Math.pow(beta2, this.t));
        this.b[i][j] -= lr * (this.mb[i][j] / (Math.sqrt(this.vb[i][j]) + eps));
      }

      // 向上一层传播 delta
      if (i > 0) {
        const deltaNext = new Array(aPrev.length).fill(0);
        for (let j = 0; j < this.W[i].length; j++) {
          for (let k = 0; k < aPrev.length; k++) {
            deltaNext[k] += delta[j] * this.W[i][j][k];
          }
        }
        // 乘 relu 导数 (非输出层)
        for (let k = 0; k < aPrev.length; k++) {
          deltaNext[k] *= reluDeriv(aPrev[k]);
        }
        delta = deltaNext;
      }
    }
  }

  serialize() {
    return JSON.stringify({ W: this.W, b: this.b, t: this.t, mW: this.mW, vW: this.mW, mb: this.mb, vb: this.vb });
  }

  static deserialize(json) {
    const data = JSON.parse(json);
    const nn = new MLP([1, 1, 1, 1]); // dummy
    nn.W = data.W; nn.b = data.b; nn.t = data.t || 0;
    nn.mW = data.mW || nn.W.map(w => w.map(r => r.map(() => 0)));
    nn.vW = data.vW || nn.W.map(w => w.map(r => r.map(() => 0)));
    nn.mb = data.mb || nn.b.map(b => b.map(() => 0));
    nn.vb = data.vb || nn.b.map(b => b.map(() => 0));
    nn.layers = [data.W[0][0].length, ...data.W.map(w => w.length)];
    return nn;
  }
}

// --- 牌编码常量 ---
const TILE_KEYS = (() => {
  const suits = ['wan', 'tong', 'tiao'];
  const nums = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const honors = ['dong', 'nan', 'xi', 'bei', 'zhong', 'fa', 'bai'];
  const keys = [];
  suits.forEach(s => nums.forEach(n => keys.push(`${s}${n}`)));
  honors.forEach(h => keys.push(h));
  return keys;
})();

const TILE_IDX = {};
TILE_KEYS.forEach((k, i) => TILE_IDX[k] = i);

// --- 状态编码器 ---
// 输入维度: 34(手牌) + 34(可见牌) + 6(辅助) = 74
const STATE_DIM = 74;

function encodeState(hand, playerIdx, GS) {
  const v = new Array(STATE_DIM).fill(0);

  // 34 维手牌计数
  for (const t of hand) {
    const idx = TILE_IDX[t.k];
    if (idx !== undefined) v[idx]++;
  }

  // 34 维已见牌 (弃牌 + 副露)
  const base = 34;
  for (let i = 0; i < 4; i++) {
    const discs = GS.playerDiscards[i] || [];
    for (const d of discs) {
      const idx = TILE_IDX[d.k];
      if (idx !== undefined) v[base + idx] = 1;
    }
    const melds = GS.players[i] ? (GS.players[i].melds || []) : [];
    for (const m of melds) {
      const idx = TILE_IDX[m.tile.k];
      if (idx !== undefined) v[base + idx] = 1;
    }
  }

  // 辅助特征 (base + 68 = offset 68)
  const off = 68;
  v[off + 0] = Math.min(GS.turn / 72, 1);       // 阶段
  v[off + 1] = dangerLevel ? dangerLevel(playerIdx) / 4 : 0;  // 危险度
  const shanten = calcShanten ? calcShanten(hand) : 4;
  v[off + 2] = Math.min(shanten / 6, 1);          // 向听数
  const bias = suitBias ? suitBias(hand) : { type: 'none', suit: null };
  v[off + 3] = bias.type === 'none' ? 0 : (bias.type === 'clear' ? 1 : (bias.type === 'mixed' ? 0.6 : 0.3)); // 染手程度
  v[off + 4] = GS.riichi ? (GS.riichi[playerIdx] ? 1 : 0.3) : 0; // 立直
  v[off + 5] = shanten === 0 ? 1 : 0;             // 是否听牌

  return v;
}

// --- RL Agent ---
class MahjongAgent {
  constructor(playerIdx) {
    this.playerIdx = playerIdx;
    this.nn = new MLP([STATE_DIM, 128, 128, 34]); // 34 输出 = 每种牌的 Q 值
    this.replayBuffer = [];
    this.maxBuffer = 5000;
    this.epsilon = 0.3;        // 探索率
    this.epsilonMin = 0.05;
    this.epsilonDecay = 0.9995;
    this.gamma = 0.95;         // 折扣因子
    this.lr = 0.0005;          // 初始学习率
    this.trainCount = 0;
    this.totalGames = 0;
  }

  // 选择弃牌 (epsilon-greedy)
  selectAction(stateVec, hand, GS) {
    const { output } = this.nn.forward(stateVec); // 34 维

    if (Math.random() < this.epsilon) {
      // 探索：过滤掉破坏面子的牌，从剩余牌中随机选
      const safeCands = [];
      for (let i = 0; i < hand.length; i++) {
        const sub = hand.filter((_, j) => j !== i);
        if (hand.filter(x => x.k === hand[i].k).length >= 3) continue;
        if (hand[i].t === 'num') {
          const s = hand[i].s, v = hand[i].v;
          if (sub.some(x => x.t === 'num' && x.s === s && x.v === v - 1) &&
              sub.some(x => x.t === 'num' && x.s === s && x.v === v + 1)) continue;
        }
        safeCands.push(i);
      }
      if (safeCands.length > 0) return safeCands[Math.floor(Math.random() * safeCands.length)];
      return Math.floor(Math.random() * hand.length);
    }

    // 利用：选手牌中 Q 值最高的
    let bestQ = -Infinity, bestIdx = 0;
    for (let i = 0; i < hand.length; i++) {
      const tileIdx = TILE_IDX[hand[i].k];
      const q = output[tileIdx];
      if (q > bestQ) { bestQ = q; bestIdx = i; }
    }
    return bestIdx;
  }
  // 获取某手牌位置的 Q 值
  getQ(stateVec, hand, idx) {
    const { output } = this.nn.forward(stateVec);
    const tileIdx = TILE_IDX[hand[idx].k];
    return output[tileIdx];
  }

  // 获取最大 Q 值
  getMaxQ(stateVec, hand) {
    const { output } = this.nn.forward(stateVec);
    let maxQ = -Infinity;
    for (const t of hand) {
      const idx = TILE_IDX[t.k];
      if (output[idx] > maxQ) maxQ = output[idx];
    }
    return maxQ;
  }

  // 存入经验
  store(stateVec, actionIdx, reward, nextStateVec, nextHand) {
    this.replayBuffer.push({ s: stateVec, a: actionIdx, r: reward, ns: nextStateVec, nh: nextHand || [] });
    if (this.replayBuffer.length > this.maxBuffer) this.replayBuffer.shift();
  }

  // 批量训练
  train(batchSize) {
    if (this.replayBuffer.length < batchSize) return;
    this.trainCount++;

    // 衰减学习率
    const lr = this.lr * Math.pow(0.999, this.trainCount);

    // 随机采样
    const batch = [];
    const indices = new Set();
    while (indices.size < Math.min(batchSize, this.replayBuffer.length)) {
      indices.add(Math.floor(Math.random() * this.replayBuffer.length));
    }
    for (const i of indices) batch.push(this.replayBuffer[i]);

    let totalLoss = 0;
    for (const exp of batch) {
      const { s, ns, r, nh } = exp;
      // 目标: r + gamma * max_a' Q(s', a')
      const nextMaxQ = ns ? this.getMaxQ(ns, nh) : 0;
      const target = r + this.gamma * nextMaxQ;

      // 当前 Q(s, a) — 重新前向+反向
      const { output } = this.nn.forward(s);
      const tileIdx = exp.a;
      const currentQ = output[tileIdx];

      // 构造目标向量（只更新被选动作的 Q 值）
      const targetVec = [...output];
      targetVec[tileIdx] = target;

      this.nn.backward(s, targetVec, lr);
      totalLoss += (target - currentQ) ** 2;
    }

    // 衰减 epsilon
    this.epsilon = Math.max(this.epsilonMin, this.epsilon * this.epsilonDecay);
    return totalLoss / batch.length;
  }

  // 持久化（HTTP → 本地文件）
  async save() {
    try {
      const payload = {
        agent: `p${this.playerIdx}`,
        nn: this.nn.serialize(),
        meta: { totalGames: this.totalGames, epsilon: this.epsilon, trainCount: this.trainCount, lr: this.lr }
      };
      await fetch('/api/rl/save_rl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (e) { /* 服务未启动则静默跳过 */ }
  }

  async load() {
    try {
      const r = await fetch('/api/rl/load_rl');
      const all = await r.json();
      const key = `p${this.playerIdx}`;
      if (all && all[key]) {
        this.nn = MLP.deserialize(all[key].nn);
        const m = all[key].meta || {};
        this.totalGames = m.totalGames || 0;
        this.epsilon = m.epsilon || this.epsilon;
        this.trainCount = m.trainCount || 0;
        this.lr = m.lr || this.lr;
        return true;
      }
    } catch (e) { /* 服务未启动则静默跳过 */ }
    return false;
  }

  // 每局结束后的复盘训练
  endGame(gameHistory, wasWinner) {
    this.totalGames++;
    // 基础奖励：赢 +10，输 -5
    const baseReward = wasWinner ? 10 : -5;

    // 对每步决策做 TD 更新
    for (let i = 0; i < gameHistory.length; i++) {
      const step = gameHistory[i];
      const nextState = i + 1 < gameHistory.length ? gameHistory[i + 1].state : null;
      // 即时奖励 + 最终奖励折现
      const gammaToEnd = Math.pow(this.gamma, gameHistory.length - i - 1);
      const reward = (step.immediateReward || 0) + gammaToEnd * baseReward;
      const parseHand = (hs) => hs ? hs.split(",").filter(Boolean).map(k => ({ k: k, t: "dongnanxibeizhongfabai".includes(k) ? "honor" : "num" })) : [];
      const nextHand = (i + 1 < gameHistory.length) ? parseHand(gameHistory[i + 1].handStr) : [];
      this.store(step.state, step.action, reward, nextState ? nextState.state : null, nextHand);
    }

    // 训练
    const batchSize = Math.min(64, this.replayBuffer.length);
    for (let i = 0; i < 3; i++) this.train(batchSize);

    // 每 10 局保存
    if (this.totalGames % 10 === 0) this.save();
  }
}

// --- 全局 RL 控制器 ---
window.RL = {
  agents: [null, new MahjongAgent(1), new MahjongAgent(2), new MahjongAgent(3)],
  gameHistory: [[], [], [], []],  // 每人一局的历史
  enabled: true,
  useRL: false,
  lastShanten: [0, 0, 0, 0],
  stats: { games: 0, p1Wins: 0, p2Wins: 0, p3Wins: 0 },

  async init() {
    for (let i = 1; i <= 3; i++) {
      if (!this.agents[i]) this.agents[i] = new MahjongAgent(i);
      await this.agents[i].load();
    }
    console.log('RL initialized. P1 ε=' + this.agents[1].epsilon.toFixed(3) +
      ' P2 ε=' + this.agents[2].epsilon.toFixed(3) +
      ' P3 ε=' + this.agents[3].epsilon.toFixed(3));
  },

  // AI 弃牌入口：返回手牌索引
  chooseDiscard(hand, playerIdx, GS) {
    if (!this.useRL || !this.agents[playerIdx]) return -1; // 回退规则 AI
    const stateVec = encodeState(hand, playerIdx, GS);
    const action = this.agents[playerIdx].selectAction(stateVec, hand, GS);

    // 记录本步状态（用于后续复盘）
    const tileIdx = TILE_IDX[hand[action].k];
    this.gameHistory[playerIdx].push({
      state: stateVec,
      action: tileIdx,
      immediateReward: 0,
      handStr: hand.map(t => t.k).join(',')
    });

    return action;
  },

  // 摸牌后/弃牌后记录向听数变化作为即时奖励
  recordShantenChange(playerIdx, oldShanten, newShanten) {
    const hist = this.gameHistory[playerIdx];
    if (hist.length === 0) return;
    const last = hist[hist.length - 1];
    // 向听数下降（接近听牌）= 正奖励
    if (newShanten < oldShanten) last.immediateReward += 2;
    else if (newShanten > oldShanten) last.immediateReward -= 1;
    // 听牌额外奖励
    if (newShanten === 0) last.immediateReward += 3;
    last.shanten = newShanten;
  },

  // 荣和/自摸/放铳 记录
  recordWin(playerIdx, byTsumo) {
    const hist = this.gameHistory[playerIdx];
    if (hist.length > 0) {
      hist[hist.length - 1].immediateReward += byTsumo ? 8 : 5;
    }
  },

  recordDealIn(playerIdx) {
    const hist = this.gameHistory[playerIdx];
    if (hist.length > 0) {
      hist[hist.length - 1].immediateReward -= 8;
    }
  },

  // 每局结束
  endGame(winnerIdx) {
    this.stats.games++;
    for (let i = 1; i <= 3; i++) {
      const won = i === winnerIdx;
      if (won) this.stats[`p${i}Wins`]++;
      this.agents[i].endGame(this.gameHistory[i], won);
      this.gameHistory[i] = [];
    }
    // 每 5 局打印统计
    if (this.stats.games % 5 === 0) {
      console.log(`RL stats: ${this.stats.games} games | P1:${this.stats.p1Wins} P2:${this.stats.p2Wins} P3:${this.stats.p3Wins} | ε=${this.agents[1].epsilon.toFixed(3)}`);
    }
  },

  // 一键保存
  async saveAll() {
    for (let i = 1; i <= 3; i++) await this.agents[i].save();
    console.log('RL models saved.');
  },

  // 启用/禁用 RL（回退规则）
  toggle() {
    this.useRL = !this.useRL;
    return this.useRL;
  }
};

console.log('[RL] Mahjong RL Trainer loaded. State dim:', STATE_DIM, 'MLP: [', STATE_DIM, ',128,128,34]');
