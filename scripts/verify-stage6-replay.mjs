import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const fixturesPath = path.join(root, 'docs/stage6-replay-fixtures.json');
const TILE_KEYS = new Set([
  'wan1', 'wan2', 'wan3', 'wan4', 'wan5', 'wan6', 'wan7', 'wan8', 'wan9',
  'tong1', 'tong2', 'tong3', 'tong4', 'tong5', 'tong6', 'tong7', 'tong8', 'tong9',
  'tiao1', 'tiao2', 'tiao3', 'tiao4', 'tiao5', 'tiao6', 'tiao7', 'tiao8', 'tiao9',
  'dong', 'nan', 'xi', 'bei', 'zhong', 'fa', 'bai',
]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function takeTile(collection, tile, label) {
  const idx = collection.indexOf(tile);
  if (idx < 0) throw new Error(`${label}: missing tile ${tile}`);
  collection.splice(idx, 1);
}

function validateTile(tile, label) {
  if (!TILE_KEYS.has(tile)) throw new Error(`${label}: invalid tile ${tile}`);
}

function assertDiscards(actual, expected, label) {
  for (let player = 0; player < 4; player += 1) {
    const a = JSON.stringify(actual[player] || []);
    const e = JSON.stringify(expected[player] || []);
    if (a !== e) throw new Error(`${label}: player ${player} discards ${a}, expected ${e}`);
  }
}

function assertMelds(actual, expected = [], label) {
  const simplified = actual.map((meld) => ({
    player: meld.player,
    type: meld.type,
    tile: meld.tile,
    count: meld.tiles.length,
  }));
  const a = JSON.stringify(simplified);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label}: melds ${a}, expected ${e}`);
}

function replay(fixture) {
  const hands = clone(fixture.initialHands);
  const wall = clone(fixture.wall);
  const discards = [[], [], [], []];
  const melds = [];

  for (const hand of hands) {
    for (const tile of hand) validateTile(tile, `${fixture.gameId} initial hand`);
  }
  for (const tile of wall) validateTile(tile, `${fixture.gameId} wall`);

  for (const event of fixture.events) {
    validateTile(event.tile, `${fixture.gameId} turn ${event.turn}`);
    const player = event.player;
    if (event.action === 'draw') {
      const next = wall.shift();
      if (next !== event.tile) throw new Error(`${fixture.gameId} turn ${event.turn}: draw ${event.tile}, wall had ${next}`);
      hands[player].push(event.tile);
    } else if (event.action === 'discard') {
      takeTile(hands[player], event.tile, `${fixture.gameId} turn ${event.turn} discard`);
      discards[player].push(event.tile);
    } else if (event.action === 'pong') {
      const fromPlayer = event.fromPlayer;
      const last = discards[fromPlayer]?.[discards[fromPlayer].length - 1];
      if (last !== event.tile) throw new Error(`${fixture.gameId} turn ${event.turn}: pong source ${last}, expected ${event.tile}`);
      discards[fromPlayer].pop();
      takeTile(hands[player], event.tile, `${fixture.gameId} turn ${event.turn} pong first`);
      takeTile(hands[player], event.tile, `${fixture.gameId} turn ${event.turn} pong second`);
      melds.push({ player, type: 'pong', tile: event.tile, tiles: [event.tile, event.tile, event.tile] });
    } else {
      throw new Error(`${fixture.gameId} turn ${event.turn}: unsupported action ${event.action}`);
    }
  }

  assertDiscards(discards, fixture.expected.finalDiscards, fixture.gameId);
  assertMelds(melds, fixture.expected.melds || [], fixture.gameId);
  if (wall.length !== fixture.expected.wallRemaining) {
    throw new Error(`${fixture.gameId}: wall remaining ${wall.length}, expected ${fixture.expected.wallRemaining}`);
  }
}

const failures = [];
const data = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));
for (const fixture of data.fixtures || []) {
  try {
    replay(fixture);
  } catch (error) {
    failures.push(error.message);
  }
}

console.log(JSON.stringify({
  pass: failures.length === 0,
  fixtures: (data.fixtures || []).length,
  checked: ['draw-order', 'discard-from-hand', 'pong-source-discard', 'final-discard-state', 'wall-remaining'],
  failures,
}, null, 2));

if (failures.length) process.exit(1);
