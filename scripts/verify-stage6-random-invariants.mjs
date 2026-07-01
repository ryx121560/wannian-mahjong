const TILE_KEYS = [
  'wan1', 'wan2', 'wan3', 'wan4', 'wan5', 'wan6', 'wan7', 'wan8', 'wan9',
  'tong1', 'tong2', 'tong3', 'tong4', 'tong5', 'tong6', 'tong7', 'tong8', 'tong9',
  'tiao1', 'tiao2', 'tiao3', 'tiao4', 'tiao5', 'tiao6', 'tiao7', 'tiao8', 'tiao9',
  'dong', 'nan', 'xi', 'bei', 'zhong', 'fa', 'bai',
];

function mulberry32(seed) {
  return function rand() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fullWall() {
  return TILE_KEYS.flatMap((tile) => [tile, tile, tile, tile]);
}

function shuffle(items, rand) {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function removeAt(items, idx) {
  const [tile] = items.splice(idx, 1);
  return tile;
}

function countAll(state) {
  const counts = new Map();
  const add = (tile) => counts.set(tile, (counts.get(tile) || 0) + 1);
  state.wall.forEach(add);
  state.hands.flat().forEach(add);
  state.discards.flat().forEach(add);
  state.melds.flat().flatMap((meld) => meld.tiles).forEach(add);
  return counts;
}

function assertInvariant(state, label) {
  const counts = countAll(state);
  const total = Array.from(counts.values()).reduce((sum, count) => sum + count, 0);
  if (total !== 136) throw new Error(`${label}: total tile count ${total}, expected 136`);
  for (const tile of TILE_KEYS) {
    const count = counts.get(tile) || 0;
    if (count !== 4) throw new Error(`${label}: ${tile} count ${count}, expected 4`);
  }
}

function simulate(seed) {
  const rand = mulberry32(seed);
  const wall = shuffle(fullWall(), rand);
  const hands = [[], [], [], []];
  const discards = [[], [], [], []];
  const melds = [[], [], [], []];
  for (let player = 0; player < 4; player += 1) {
    for (let i = 0; i < 13; i += 1) hands[player].push(wall.pop());
  }
  hands[0].push(wall.pop());
  const state = { wall, hands, discards, melds };
  assertInvariant(state, `seed ${seed} after deal`);

  let current = 0;
  for (let turn = 0; turn < 72 && state.wall.length > 0; turn += 1) {
    if (state.hands[current].length % 3 === 1 && state.wall.length > 0) {
      state.hands[current].push(state.wall.pop());
    }
    const discardIdx = Math.floor(rand() * state.hands[current].length);
    const discarded = removeAt(state.hands[current], discardIdx);
    state.discards[current].push(discarded);

    const responder = (current + 1) % 4;
    const sameIdx = state.hands[responder].map((tile, idx) => (tile === discarded ? idx : -1)).filter((idx) => idx >= 0);
    if (sameIdx.length >= 2 && rand() < 0.08) {
      state.discards[current].pop();
      const taken = [discarded];
      for (const idx of sameIdx.slice(0, 2).sort((a, b) => b - a)) taken.push(removeAt(state.hands[responder], idx));
      state.melds[responder].push({ type: 'peng', tiles: taken });
      current = responder;
    } else {
      current = (current + 1) % 4;
    }
    assertInvariant(state, `seed ${seed} turn ${turn + 1}`);
  }
}

const seeds = Array.from({ length: 200 }, (_, idx) => 20260701 + idx);
const failures = [];
for (const seed of seeds) {
  try {
    simulate(seed);
  } catch (error) {
    failures.push(error.message);
  }
}

console.log(JSON.stringify({
  pass: failures.length === 0,
  simulations: seeds.length,
  checkedInvariants: ['total-136', 'tile-count-equals-4', 'hand-wall-discard-meld-conservation'],
  failures: failures.slice(0, 20),
}, null, 2));

if (failures.length) process.exit(1);
