#!/usr/bin/env node
/* =========================================================================
 *  test_tactics.js  —  Phase A スモークテスト
 *
 *  ブラウザ依存（global DB / TacticsData）を モックして
 *  Node で エンジン と データを 検証。
 *
 *  実行: node tests/test_tactics.js
 * =======================================================================*/

'use strict';

const path = require('path');
const fs = require('fs');

// ===== ミニマル モック DB =====
// data.js は 巨大なので、テスト用に 最小限の SPECIES だけ 用意。
const mockSpecies = {};
const families = ['sla', 'bea', 'bir', 'pla', 'cat', 'mus', 'dra', 'lig'];
const els = ['fire', 'water', 'grass', 'wind', 'light'];
families.forEach((f, fi) => {
  for (let t = 1; t <= 5; t++) {
    mockSpecies[f + t] = {
      name: f.toUpperCase() + t,
      emoji: '🦴',
      family: f,
      el: els[fi % els.length],
      rank: t,
    };
  }
});
els.forEach(e => {
  mockSpecies['god_' + e] = { name: 'GOD_' + e, emoji: '✨', family: 'god', el: e, rank: 6 };
  mockSpecies['titan_' + e] = { name: 'TITAN_' + e, emoji: '🦣', family: 'titan', el: e, rank: 7 };
});
mockSpecies['origin'] = { name: 'ORIGIN', emoji: '🌌', family: 'origin', el: 'none', rank: 7 };

global.DB = { SPECIES: mockSpecies };

// ===== TacticsData / Engine 読み込み =====
const dataPath = path.join(__dirname, '..', 'js', 'tactics_data.js');
const enginePath = path.join(__dirname, '..', 'js', 'tactics_engine.js');

function loadModule(file) {
  const src = fs.readFileSync(file, 'utf-8');
  // ブラウザ用 `const X = (() => {...})()` を Function() で 評価。
  // 内部の `module.exports = X` で 値を 取り出し、グローバルにも 注入。
  const fn = new Function('module', 'exports', src);
  const fake = { exports: {} };
  fn.call(global, fake, fake.exports);
  return fake.exports;
}

global.TacticsData = loadModule(dataPath);
const TacticsData = global.TacticsData;
global.TacticsEngine = loadModule(enginePath);
const TacticsEngine = global.TacticsEngine;

// ===== 簡易 アサート =====
let passed = 0, failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    failures.push({ name, error: e });
    console.log(`  ✗ ${name}`);
    console.log(`    ${e.message}`);
  }
}
function eq(a, b, msg) {
  if (a !== b) throw new Error(`${msg || 'eq'}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
function ok(cond, msg) {
  if (!cond) throw new Error(msg || 'expected truthy');
}
function notOk(cond, msg) {
  if (cond) throw new Error(msg || 'expected falsy');
}

console.log('=== TacticsData ===');

test('スターターデッキは モンスター12枚 / 魔法6枚', () => {
  eq(TacticsData.starterMonsterDeck().length, 12, 'monster deck');
  eq(TacticsData.starterMagicDeck().length, 6, 'magic deck');
});

test('rank1 モンスターは cost=1 hp=2 atk=1', () => {
  const sla1 = TacticsData.getMonster('sla1');
  ok(sla1, 'sla1 exists');
  eq(sla1.cost, 1, 'cost');
  eq(sla1.hp, 2, 'hp');
  eq(sla1.atk, 1, 'atk');
});

test('rank5 モンスターは cost=5 hp=9 atk=5 mov=2', () => {
  const sla5 = TacticsData.getMonster('sla5');
  ok(sla5, 'sla5 exists');
  eq(sla5.cost, 5, 'cost');
  eq(sla5.hp, 9, 'hp');
  eq(sla5.atk, 5, 'atk');
  eq(sla5.mov, 2, 'mov');
});

test('rank7 (titan) は cost=7 mov=3 rng=2', () => {
  const titan = TacticsData.getMonster('titan_fire');
  ok(titan, 'titan exists');
  eq(titan.cost, 7, 'cost');
  eq(titan.mov, 3, 'mov');
  eq(titan.rng, 2, 'rng');
});

test('魔法 カードは timing を 持つ', () => {
  const burst = TacticsData.getMagic('lane_burst');
  ok(burst, 'lane_burst exists');
  eq(burst.timing, 'start', 'timing start');
  const trap = TacticsData.getMagic('gravity_force');
  eq(trap.timing, 'reaction', 'reaction trap');
});

test('skill は 系統別に 割り当てされる', () => {
  const bir5 = TacticsData.getMonster('bir5');
  // birds: ['swift', 'swift', 'longshot', 'longshot', 'dimension_shift']
  eq(bir5.skill, 'dimension_shift', 'bir5 skill');
});

console.log();
console.log('=== TacticsEngine: 初期化 ===');

test('start() で 6x6 ボードと 4枚 手札', () => {
  const G = TacticsEngine.start();
  eq(G.board.length, 6, 'rows');
  eq(G.board[0].length, 6, 'cols');
  eq(G.monsterHand.ally.length, 4, 'ally monster hand');
  eq(G.monsterHand.enemy.length, 4, 'enemy monster hand');
  eq(G.magicHand.ally.length, 2, 'ally magic hand');
  eq(G.turn, 1, 'turn');
  eq(G.whose, 'ally', 'whose');
  notOk(G.over, 'not over');
});

test('全マス 初期は 空', () => {
  TacticsEngine.start();
  for (let y = 0; y < 6; y++) {
    for (let x = 0; x < 6; x++) {
      eq(TacticsEngine.cell(x, y), null, `cell ${x},${y}`);
    }
  }
});

console.log();
console.log('=== TacticsEngine: 召喚 ===');

test('召喚: 召喚可能行(y=4,5)に 配置できる', () => {
  const G = TacticsEngine.start();
  const card = G.monsterHand.ally.find(c => c.cost <= G.energy.ally);
  ok(card, 'affordable card');
  const res = TacticsEngine.summon('ally', card.uid, 2, 5);
  ok(res.ok, res.msg);
  ok(TacticsEngine.cell(2, 5), 'cell occupied');
  eq(TacticsEngine.cell(2, 5).name, card.name, 'piece name');
});

test('召喚: 召喚可能行 外（y=2 等）には 置けない', () => {
  const G = TacticsEngine.start();
  const card = G.monsterHand.ally.find(c => c.cost <= G.energy.ally);
  ok(card);
  const res = TacticsEngine.summon('ally', card.uid, 2, 2);
  notOk(res.ok, 'should fail');
});

test('召喚: 占有マスには 置けない', () => {
  const G = TacticsEngine.start();
  const cheap = G.monsterHand.ally.filter(c => c.cost <= G.energy.ally);
  ok(cheap.length >= 1, 'at least 1 cheap card');
  TacticsEngine.summon('ally', cheap[0].uid, 2, 5);
  // 2回目は どんなカードでも 同じマスは NG
  // 同じ uid はすでに 手札外なので 別カード（あれば）で 試す
  // cost を 払えない 場合も summon は エネルギー不足で 失敗するが、ここで 検証したいのは
  // 占有マスの 拒否。同じ uid を 再度送るのは 不正なので 別カードで。
  const other = G.monsterHand.ally.find(c => c.cost <= G.energy.ally - cheap[0].cost);
  if (other) {
    const res = TacticsEngine.summon('ally', other.uid, 2, 5);
    notOk(res.ok, 'should fail (occupied)');
  }
});

test('召喚: エネルギー不足 で 失敗', () => {
  const G = TacticsEngine.start();
  // ターン1 は エネルギー1。3コスト以上の カードは 出せない
  const expensive = G.monsterHand.ally.find(c => c.cost >= 3);
  if (!expensive) return;  // skip if no expensive card
  const res = TacticsEngine.summon('ally', expensive.uid, 2, 5);
  notOk(res.ok, 'should fail');
});

console.log();
console.log('=== TacticsEngine: 移動 ===');

function cheapPlainCard(G, side) {
  // 廉価で 移動拡張(swift)も longshot も 持たない、テスト 安定化用の カード
  return G.monsterHand[side].find(
    c => c.cost <= G.energy[side] && c.skill !== 'swift' && c.skill !== 'longshot'
  );
}

test('移動: 隣接マス OK', () => {
  const G = TacticsEngine.start();
  const card = cheapPlainCard(G, 'ally');
  ok(card, 'cheap plain card exists');
  const r = TacticsEngine.summon('ally', card.uid, 2, 5);
  ok(r.ok, r.msg);
  const mv = TacticsEngine.move(r.piece.uid, 3, 4);
  ok(mv.ok, mv.msg);
  eq(TacticsEngine.cell(2, 5), null, 'src empty');
  ok(TacticsEngine.cell(3, 4), 'dst occupied');
});

test('移動: 範囲外 (mov=1 で 2マス) は NG', () => {
  const G = TacticsEngine.start();
  const card = cheapPlainCard(G, 'ally');
  ok(card, 'cheap plain card exists');
  const r = TacticsEngine.summon('ally', card.uid, 2, 5);
  ok(r.ok, r.msg);
  const mv = TacticsEngine.move(r.piece.uid, 4, 3);   // 距離 2
  notOk(mv.ok, 'should fail');
});

test('移動: 1ターンに 1回だけ', () => {
  const G = TacticsEngine.start();
  const card = cheapPlainCard(G, 'ally');
  ok(card);
  const r = TacticsEngine.summon('ally', card.uid, 2, 5);
  TacticsEngine.move(r.piece.uid, 3, 4);
  const mv2 = TacticsEngine.move(r.piece.uid, 4, 4);
  notOk(mv2.ok, 'second move should fail');
});

console.log();
console.log('=== TacticsEngine: 戦闘 ===');

test('攻撃: 隣接敵に ダメージ', () => {
  const G = TacticsEngine.start();
  const ac = cheapPlainCard(G, 'ally');
  ok(ac, 'cheap ally');
  const ar = TacticsEngine.summon('ally', ac.uid, 2, 5);
  ok(ar.ok);
  TacticsEngine.endTurn();
  const ec = cheapPlainCard(G, 'enemy');
  ok(ec, 'cheap enemy');
  const er = TacticsEngine.summon('enemy', ec.uid, 2, 4);   // y=4 はダメ → y=1 が enemy 召喚行
  // 上の row は STARTING_ROWS.enemy = [0, 1] なので y=4 は NG
  // y=1 に 召喚
  if (!er.ok) {
    const er2 = TacticsEngine.summon('enemy', ec.uid, 2, 1);
    ok(er2.ok);
  }
  TacticsEngine.endTurn();   // 味方ターン
  // 味方を y=4 へ 1マス 移動
  TacticsEngine.move(ar.piece.uid, 2, 4);
  // 敵ターン
  TacticsEngine.endTurn();
  // 敵を y=2 へ 移動（敵の 1マス 前進）
  const enemyPiece = TacticsEngine.piecesOf('enemy')[0];
  TacticsEngine.move(enemyPiece.uid, 2, 2);
  TacticsEngine.endTurn();   // 味方ターン に 戻る
  // 味方を y=3 へ 移動（敵と 隣接）
  TacticsEngine.move(ar.piece.uid, 2, 3);
  // 距離が 1 になっているはず
  const dist = TacticsEngine.chebyshev(ar.piece, enemyPiece);
  ok(dist === 1, `expected adjacent, got dist ${dist}`);
  const beforeHp = enemyPiece.curHp;
  const res = TacticsEngine.attack(ar.piece.uid, enemyPiece.uid);
  ok(res.ok, res.msg);
  ok(enemyPiece.curHp < beforeHp || enemyPiece.curHp <= 0, 'damage applied (or destroyed)');
});

test('攻撃: 射程外は NG', () => {
  TacticsEngine.start();
  const G = TacticsEngine.state();
  const ac = G.monsterHand.ally.find(c => c.cost <= G.energy.ally);
  ok(ac, 'cheap ally card exists');
  TacticsEngine.summon('ally', ac.uid, 0, 5);
  TacticsEngine.endTurn();
  // 敵ターン: cost 1 の カードを 選ぶ
  const ec = G.monsterHand.enemy.find(c => c.cost <= G.energy.enemy);
  ok(ec, 'cheap enemy card exists');
  TacticsEngine.summon('enemy', ec.uid, 5, 0);
  TacticsEngine.endTurn();   // 味方ターン に 戻る
  const ally = TacticsEngine.piecesOf('ally')[0];
  const enemy = TacticsEngine.piecesOf('enemy')[0];
  ok(ally && enemy, 'both pieces exist');
  const res = TacticsEngine.attack(ally.uid, enemy.uid);
  notOk(res.ok, 'should fail');
});

console.log();
console.log('=== TacticsEngine: ターン進行 ===');

test('endTurn で 相手ターンに なり、エネルギーが 増える', () => {
  const G = TacticsEngine.start();
  eq(G.whose, 'ally');
  eq(G.energy.ally, 1);
  TacticsEngine.endTurn();
  eq(G.whose, 'enemy');
  TacticsEngine.endTurn();
  eq(G.whose, 'ally');
  eq(G.turn, 2);
  eq(G.energy.ally, 2);
});

test('endTurn で moved/attacked がリセット', () => {
  const G = TacticsEngine.start();
  const card = cheapPlainCard(G, 'ally');
  ok(card);
  const r = TacticsEngine.summon('ally', card.uid, 2, 5);
  ok(r.ok);
  TacticsEngine.move(r.piece.uid, 3, 4);
  ok(r.piece.moved);
  TacticsEngine.endTurn();   // 敵ターン
  TacticsEngine.endTurn();   // 味方ターン に 戻る
  eq(r.piece.moved, false, 'moved reset');
});

console.log();
console.log('=== TacticsEngine: 隣接 / 距離 ===');

test('chebyshev 距離', () => {
  eq(TacticsEngine.chebyshev({ x: 0, y: 0 }, { x: 3, y: 4 }), 4);
  eq(TacticsEngine.chebyshev({ x: 2, y: 2 }, { x: 3, y: 3 }), 1);
});

test('neighbors は 隣接8マスの ピースを 返す', () => {
  const G = TacticsEngine.start();
  const c1 = G.monsterHand.ally[0];
  const c2 = G.monsterHand.ally[1];
  TacticsEngine.summon('ally', c1.uid, 2, 5);
  // 同じ ターン中で 2マス 召喚 (両方 1コストなら OK)
  if (c2.cost <= G.energy.ally) {
    TacticsEngine.summon('ally', c2.uid, 3, 5);
    const neigh = TacticsEngine.neighbors(2, 5);
    eq(neigh.length, 1, 'one neighbor');
  }
});

console.log();
console.log(`=== 結果: ${passed} passed / ${failed} failed ===`);
if (failed > 0) {
  console.log('\n失敗 詳細:');
  failures.forEach(f => {
    console.log(`  ✗ ${f.name}`);
    console.log(`    ${f.error.message}`);
    if (f.error.stack) console.log(f.error.stack.split('\n').slice(1, 4).join('\n'));
  });
  process.exit(1);
}
process.exit(0);
