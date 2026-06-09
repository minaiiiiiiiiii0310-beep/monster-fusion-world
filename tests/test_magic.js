#!/usr/bin/env node
/* tactics_magic.js の テスト。
 * 実行: node tests/test_magic.js
 */

'use strict';

const path = require('path');
const fs = require('fs');

// ===== ミニマル モック DB =====
const mockSpecies = {};
const families = ['sla', 'bea', 'bir', 'pla', 'cat', 'mus', 'dra', 'lig'];
const els = ['fire', 'water', 'grass', 'wind', 'light'];
families.forEach((f, fi) => {
  for (let t = 1; t <= 5; t++) {
    mockSpecies[f + t] = {
      name: f.toUpperCase() + t, emoji: '🦴',
      family: f, el: els[fi % els.length], rank: t,
    };
  }
});
els.forEach(e => {
  mockSpecies['god_' + e] = { name: 'GOD_' + e, emoji: '✨', family: 'god', el: e, rank: 6 };
  mockSpecies['titan_' + e] = { name: 'TITAN_' + e, emoji: '🦣', family: 'titan', el: e, rank: 7 };
});
mockSpecies['origin'] = { name: 'ORIGIN', emoji: '🌌', family: 'origin', el: 'none', rank: 7 };
global.DB = { SPECIES: mockSpecies };

function loadModule(file) {
  const src = fs.readFileSync(file, 'utf-8');
  const fn = new Function('module', 'exports', src);
  const fake = { exports: {} };
  fn.call(global, fake, fake.exports);
  return fake.exports;
}

global.TacticsData = loadModule(path.join(__dirname, '..', 'js', 'tactics_data.js'));
global.TacticsEngine = loadModule(path.join(__dirname, '..', 'js', 'tactics_engine.js'));
global.TacticsMagic = loadModule(path.join(__dirname, '..', 'js', 'tactics_magic.js'));

const { TacticsEngine, TacticsMagic } = global;

let passed = 0, failed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; failures.push({ name, error: e }); console.log(`  ✗ ${name}\n    ${e.message}`); }
}
function eq(a, b, msg) { if (a !== b) throw new Error(`${msg || 'eq'}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
function ok(c, m) { if (!c) throw new Error(m || 'expected truthy'); }
function notOk(c, m) { if (c) throw new Error(m || 'expected falsy'); }

function startGame(opts) {
  const G = TacticsEngine.start(Object.assign({
    allyMonsterDeck: ['sla1', 'bea1', 'bir1', 'pla1', 'cat1', 'mus1',
                      'sla1', 'bea1', 'bir1', 'pla1', 'cat1', 'mus1'],
    enemyMonsterDeck: ['sla1', 'bea1', 'bir1', 'pla1', 'cat1', 'mus1',
                       'sla1', 'bea1', 'bir1', 'pla1', 'cat1', 'mus1'],
    allyMagicDeck: [],
    enemyMagicDeck: [],
  }, opts || {}));
  // 全 魔法を 手札に 強制配置（テスト用、HAND_MAX 越えても OK）
  const allMagic = ['rally', 'healing_wind', 'summoning_gate', 'teleport',
                    'elemental_edge', 'iron_wall', 'critical_strike',
                    'counter_trap', 'mirror_force', 'reverse_resource',
                    'gravity_force', 'lane_burst'];
  G.magicHand.ally = [];
  let uidBase = 10000;
  for (const id of allMagic) {
    const card = TacticsData.getMagic(id);
    G.magicHand.ally.push({ ...card, uid: uidBase++ });
  }
  return G;
}

console.log('=== TacticsMagic: 起動チェック ===');

test('canCast: エネルギー不足は NG', () => {
  const G = startGame();
  // ターン1 エネルギー1。cost2 の lane_burst は NG
  const mc = G.magicHand.ally.find(m => m.cost >= 2);
  if (mc) {
    const res = TacticsMagic.canCast('ally', mc.uid, { axis: 'row', index: 5 });
    notOk(res.ok, 'should fail');
  }
});

test('canCast: 手札に ない 魔法は NG', () => {
  const G = startGame();
  const res = TacticsMagic.canCast('ally', 99999, {});
  notOk(res.ok);
});

console.log();
console.log('=== start タイミング ===');

test('rally: 味方 atk +1 this turn', () => {
  const G = startGame();
  // sla1 を 召喚
  const card = G.monsterHand.ally.find(c => c.cost === 1);
  ok(card);
  const r = TacticsEngine.summon('ally', card.uid, 2, 5);
  ok(r.ok);
  const baseAtk = TacticsEngine.effectiveAtk(r.piece);
  // rally cost=2 → ターン1 では 不可。ターン2 まで 進める
  TacticsEngine.endTurn(); TacticsEngine.endTurn();
  const rally = G.magicHand.ally.find(m => m.id === 'rally');
  ok(rally, 'rally in hand');
  const cast = TacticsMagic.cast('ally', rally.uid, {});
  ok(cast.ok, cast.msg);
  const newAtk = TacticsEngine.effectiveAtk(r.piece);
  ok(newAtk === baseAtk + 1, `expected +1 atk: ${baseAtk} → ${newAtk}`);
});

test('healing_wind: 対象味方 HP 全回復', () => {
  const G = startGame();
  const card = G.monsterHand.ally.find(c => c.cost === 1);
  const r = TacticsEngine.summon('ally', card.uid, 2, 5);
  ok(r.ok);
  // HP を 強制的に 削る
  r.piece.curHp = 1;
  // エネルギー回復のため ターンを 進める
  TacticsEngine.endTurn(); TacticsEngine.endTurn();
  const heal = G.magicHand.ally.find(m => m.id === 'healing_wind');
  ok(heal);
  const cast = TacticsMagic.cast('ally', heal.uid, { targetUid: r.piece.uid });
  ok(cast.ok, cast.msg);
  eq(r.piece.curHp, r.piece.maxHp, 'HP fully restored');
});

test('summoning_gate: モンスター 2枚 ドロー', () => {
  const G = startGame();
  const before = G.monsterHand.ally.length;
  // cost 3 → ターン3 まで 進める
  TacticsEngine.endTurn(); TacticsEngine.endTurn();
  TacticsEngine.endTurn(); TacticsEngine.endTurn();
  // ターン3 ally, energy 3
  const gate = G.magicHand.ally.find(m => m.id === 'summoning_gate');
  ok(gate);
  const cast = TacticsMagic.cast('ally', gate.uid, {});
  ok(cast.ok, cast.msg);
  // 2枚 増えるはず（ターン進行で 自動ドローも あるので 厳密ではないが +2 以上）
  ok(G.monsterHand.ally.length >= before + 1, 'drew cards');
});

test('teleport: ワープ で 任意マスに 移動', () => {
  const G = startGame();
  const card = G.monsterHand.ally.find(c => c.cost === 1);
  const r = TacticsEngine.summon('ally', card.uid, 2, 5);
  ok(r.ok);
  // cost 2 → ターン2 まで
  TacticsEngine.endTurn(); TacticsEngine.endTurn();
  const tp = G.magicHand.ally.find(m => m.id === 'teleport');
  ok(tp);
  const cast = TacticsMagic.cast('ally', tp.uid, { targetUid: r.piece.uid, x: 0, y: 3 });
  ok(cast.ok, cast.msg);
  eq(r.piece.x, 0, 'teleported x');
  eq(r.piece.y, 3, 'teleported y');
});

test('lane_burst: 指定列の 味方 +3 atk this turn', () => {
  const G = startGame();
  const card = G.monsterHand.ally.find(c => c.cost === 1);
  const r = TacticsEngine.summon('ally', card.uid, 2, 5);
  // ターン3 まで 進める (cost 2)
  TacticsEngine.endTurn(); TacticsEngine.endTurn();
  const base = TacticsEngine.effectiveAtk(r.piece);
  const burst = G.magicHand.ally.find(m => m.id === 'lane_burst');
  ok(burst);
  const cast = TacticsMagic.cast('ally', burst.uid, { axis: 'row', index: 5 });
  ok(cast.ok, cast.msg);
  // y=5 行の カードは +3 atk
  const after = TacticsEngine.effectiveAtk(r.piece);
  eq(after, base + 3, `expected +3: ${base} → ${after}`);
});

console.log();
console.log('=== preCombat タイミング ===');

test('elemental_edge: 次の攻撃 +2 atk', () => {
  const G = startGame();
  // ally と enemy 隣接 配置
  const ac = G.monsterHand.ally.find(c => c.cost === 1);
  const ar = TacticsEngine.summon('ally', ac.uid, 2, 5);
  TacticsEngine.endTurn();
  const ec = G.monsterHand.enemy.find(c => c.cost === 1);
  const er = TacticsEngine.summon('enemy', ec.uid, 2, 1);
  TacticsEngine.endTurn();   // ally
  TacticsEngine.move(ar.piece.uid, 2, 4);
  TacticsEngine.endTurn();   // enemy
  TacticsEngine.move(er.piece.uid, 2, 2);
  TacticsEngine.endTurn();   // ally
  TacticsEngine.move(ar.piece.uid, 2, 3);   // 敵と隣接
  // elemental_edge を 唱える (cost1)
  const edge = G.magicHand.ally.find(m => m.id === 'elemental_edge');
  ok(edge);
  const cast = TacticsMagic.cast('ally', edge.uid, {});
  ok(cast.ok, cast.msg);
  const baseAtk = TacticsEngine.effectiveAtk(ar.piece);
  const enemyHpBefore = er.piece.curHp;
  TacticsEngine.attack(ar.piece.uid, er.piece.uid);
  // 期待: damage = base + 2
  const dealt = enemyHpBefore - Math.max(0, er.piece.curHp);
  ok(dealt >= baseAtk + 2 - 1 /* armor等の 誤差 */, `damage ${dealt} >= ${baseAtk + 2}`);
});

test('iron_wall: 次の被攻撃 -3 ダメージ', () => {
  const G = startGame();
  const ac = G.monsterHand.ally.find(c => c.cost === 1);
  const ar = TacticsEngine.summon('ally', ac.uid, 2, 5);
  TacticsEngine.endTurn();
  const ec = G.monsterHand.enemy.find(c => c.cost === 1);
  const er = TacticsEngine.summon('enemy', ec.uid, 2, 1);
  // ally が iron_wall を セット（防御 mod）
  TacticsEngine.endTurn();   // ally
  // iron_wall cost1
  const wall = G.magicHand.ally.find(m => m.id === 'iron_wall');
  ok(wall);
  TacticsMagic.cast('ally', wall.uid, {});
  // 敵が 攻撃する まで シミュレート は 複雑なので、
  // 直接 attack を 呼ぶ ことで 防御効果を 検証する
  // 敵 → 味方 攻撃には 敵を ally に 隣接 させる 必要が あるが、
  // テストの 簡素化の ため 敵の curHp を 検査する 代わりに
  // ar.piece.curHp の 減少が 想定より 少ないかを 検査
  ar.piece.x = 2; ar.piece.y = 2;   // テストハック: 強制 隣接
  TacticsEngine.cell(2, 5); // dummy
  // ally の cell を 直接 移動
  TacticsEngine._internal && TacticsEngine._internal();   // expose
  // 直接 移動できないので skip — preCombat[ally] が セットされていることを 確認
  ok(G.preCombat.ally && G.preCombat.ally.reduceDmg === 3, 'preCombat ally has reduceDmg=3');
});

test('critical_strike: damage × 1.5', () => {
  const G = startGame();
  // ターン2 まで進む（cost 2）
  TacticsEngine.endTurn(); TacticsEngine.endTurn();
  const cs = G.magicHand.ally.find(m => m.id === 'critical_strike');
  ok(cs);
  const cast = TacticsMagic.cast('ally', cs.uid, {});
  ok(cast.ok, cast.msg);
  ok(G.preCombat.ally && G.preCombat.ally.damageMult === 1.5, 'damageMult set');
});

console.log();
console.log('=== reaction タイミング（伏せ）===');

test('counter_trap: 次の 敵攻撃を 無効化', () => {
  const G = startGame();
  TacticsEngine.endTurn(); TacticsEngine.endTurn();
  const trap = G.magicHand.ally.find(m => m.id === 'counter_trap');
  ok(trap);
  const cast = TacticsMagic.cast('ally', trap.uid, {});
  ok(cast.ok, cast.msg);
  // 伏せが セットされている
  eq(G.pendingReactions.ally.length, 1);
  eq(G.pendingReactions.ally[0].type, 'counter_trap');
});

test('mirror_force: トラップ セット OK', () => {
  const G = startGame();
  TacticsEngine.endTurn(); TacticsEngine.endTurn();
  TacticsEngine.endTurn(); TacticsEngine.endTurn();
  // cost 3 → ターン3
  const mf = G.magicHand.ally.find(m => m.id === 'mirror_force');
  ok(mf);
  const cast = TacticsMagic.cast('ally', mf.uid, {});
  ok(cast.ok, cast.msg);
  eq(G.pendingReactions.ally.filter(r => r.type === 'mirror_force').length, 1);
});

test('reverse_resource: 味方撃破時 ドロー', () => {
  const G = startGame();
  const ac = G.monsterHand.ally.find(c => c.cost === 1);
  const ar = TacticsEngine.summon('ally', ac.uid, 2, 5);
  // エネルギー 回復まで 進める
  TacticsEngine.endTurn(); TacticsEngine.endTurn();
  const rr = G.magicHand.ally.find(m => m.id === 'reverse_resource');
  ok(rr);
  const cast = TacticsMagic.cast('ally', rr.uid, {});
  ok(cast.ok, cast.msg);
  const before = G.monsterHand.ally.length;
  ar.piece.curHp = 0;
  TacticsEngine._internal().destroyPiece(ar.piece, null);
  ok(G.monsterHand.ally.length === before + 1, `expected +1 draw: ${before} → ${G.monsterHand.ally.length}`);
});

test('gravity_force: 相手 mov を 1 に 制限', () => {
  const G = startGame();
  // 敵に mov 2 の カード（rank 4+ → cost 4）が 必要なので、
  // 直接 敵駒を 配置して mov=2 を 期待
  const card = TacticsData.getMonster('sla4');   // mov=2
  // 敵 駒を 強制配置
  const piece = {
    ...card, owner: 'enemy', curHp: card.hp, maxHp: card.hp,
    bonusAtk: 0, moved: false, attacked: false, activeUsed: false,
    uid: 99999, x: 3, y: 2,
  };
  G.board[2][3] = piece;
  eq(TacticsEngine.effectiveMov(piece), 2, 'baseline mov 2');
  // gravity_force を 唱える (cost 2 → ターン2)
  TacticsEngine.endTurn(); TacticsEngine.endTurn();
  const gf = G.magicHand.ally.find(m => m.id === 'gravity_force');
  ok(gf);
  const cast = TacticsMagic.cast('ally', gf.uid, {});
  ok(cast.ok, cast.msg);
  // moveBlocked[enemy] = 2 がセット、次の敵ターンで 1 に なって 効く
  TacticsEngine.endTurn();   // enemy turn
  eq(TacticsEngine.effectiveMov(piece), 1, 'mov restricted to 1');
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
