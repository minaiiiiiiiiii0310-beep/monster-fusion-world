#!/usr/bin/env node
/* tactics_engine.js の 共鳴（resonance）機能 テスト。
 * 実行: node tests/test_resonance.js
 */

'use strict';
const path = require('path');
const fs = require('fs');

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

const { TacticsEngine, TacticsData } = global;

let passed = 0, failed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; failures.push({ name, error: e }); console.log(`  ✗ ${name}\n    ${e.message}`); }
}
function eq(a, b, msg) { if (a !== b) throw new Error(`${msg || 'eq'}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
function ok(c, m) { if (!c) throw new Error(m || 'expected truthy'); }

function placePiece(G, id, owner, x, y, uid) {
  const card = TacticsData.getMonster(id);
  const piece = {
    ...card, owner,
    curHp: card.hp, maxHp: card.hp, bonusAtk: 0,
    moved: false, attacked: false, activeUsed: false,
    x, y, uid: uid || (Math.random() * 1000000 | 0),
  };
  G.board[y][x] = piece;
  return piece;
}

function freshGame() {
  return TacticsEngine.start({
    allyMonsterDeck: ['sla1','sla1','sla1','sla1','sla1','sla1','sla1','sla1','sla1','sla1','sla1','sla1'],
    enemyMonsterDeck: ['sla1','sla1','sla1','sla1','sla1','sla1','sla1','sla1','sla1','sla1','sla1','sla1'],
    allyMagicDeck: [], enemyMagicDeck: [],
  });
}

console.log('=== 共鳴: 直線3連 ===');

test('横 3連で 全員 +2 atk', () => {
  const G = freshGame();
  // x=0,1,2 y=5 に 同じ owner の 駒
  const p1 = placePiece(G, 'sla1', 'ally', 0, 5, 1);   // sla1: atk=1
  const p2 = placePiece(G, 'sla1', 'ally', 1, 5, 2);
  const p3 = placePiece(G, 'sla1', 'ally', 2, 5, 3);
  const resos = TacticsEngine.detectResonances('ally');
  ok(resos.some(r => r.type === 'line3'), 'line3 detected');
  // sla1 base atk=1, line3 で +2 → 3
  // family3 (sla 3体) で +2 → 5
  // el3 (fire 3体) で +1 → 6  ※sla は fire 属性
  const atk = TacticsEngine.effectiveAtk(p1);
  ok(atk >= 3, `expected ≥3, got ${atk}`);
});

test('縦 3連で 全員 +2 atk', () => {
  const G = freshGame();
  const p1 = placePiece(G, 'bea1', 'ally', 0, 3, 1);   // bea1: fire ではない
  const p2 = placePiece(G, 'bea1', 'ally', 0, 4, 2);
  const p3 = placePiece(G, 'bea1', 'ally', 0, 5, 3);
  const resos = TacticsEngine.detectResonances('ally');
  ok(resos.some(r => r.type === 'line3'), 'line3 detected');
});

test('別 owner は 同列でも 共鳴しない', () => {
  const G = freshGame();
  placePiece(G, 'sla1', 'ally', 0, 5, 1);
  placePiece(G, 'sla1', 'enemy', 1, 5, 2);
  placePiece(G, 'sla1', 'ally', 2, 5, 3);
  const resos = TacticsEngine.detectResonances('ally');
  ok(!resos.some(r => r.type === 'line3'), 'no line3 cross-owner');
});

console.log();
console.log('=== 共鳴: 斜め3連 ===');

test('右下 斜め 3連 で diag3', () => {
  const G = freshGame();
  placePiece(G, 'sla1', 'ally', 0, 3, 1);
  placePiece(G, 'sla1', 'ally', 1, 4, 2);
  placePiece(G, 'sla1', 'ally', 2, 5, 3);
  const resos = TacticsEngine.detectResonances('ally');
  ok(resos.some(r => r.type === 'diag3'), 'diag3 detected');
});

test('斜め3連 で rng +1', () => {
  const G = freshGame();
  const p1 = placePiece(G, 'sla1', 'ally', 0, 3, 1);   // sla1 rng=1
  placePiece(G, 'sla1', 'ally', 1, 4, 2);
  placePiece(G, 'sla1', 'ally', 2, 5, 3);
  const rng = TacticsEngine.effectiveRng(p1);
  ok(rng >= 2, `expected rng ≥2, got ${rng}`);
});

console.log();
console.log('=== 共鳴: L字 3連 ===');

test('L字3連 で 角の駒に +3 atk', () => {
  const G = freshGame();
  // (0,5), (1,5), (1,4) ← (1,5) が 角
  const p1 = placePiece(G, 'sla1', 'ally', 0, 5, 1);
  const corner = placePiece(G, 'sla1', 'ally', 1, 5, 2);
  const p3 = placePiece(G, 'sla1', 'ally', 1, 4, 3);
  const resos = TacticsEngine.detectResonances('ally');
  ok(resos.some(r => r.type === 'L_shape'), 'L_shape detected');
});

console.log();
console.log('=== 共鳴: 同系統 / 同属性 ===');

test('同系統 3体 で family3 共鳴', () => {
  const G = freshGame();
  // 場所バラバラ
  placePiece(G, 'sla1', 'ally', 0, 5, 1);
  placePiece(G, 'sla1', 'ally', 4, 5, 2);
  placePiece(G, 'sla1', 'ally', 2, 4, 3);
  const resos = TacticsEngine.detectResonances('ally');
  ok(resos.some(r => r.type === 'family3'), 'family3 detected');
});

test('同属性 3体 で el3 共鳴', () => {
  const G = freshGame();
  // sla, bea, bir はそれぞれ fire / water / grass。
  // mockSpecies は fi%5 で els[fi % 5] を 割り当て。
  // 同じ属性に なるよう sla だけ で 3体（fire）
  placePiece(G, 'sla1', 'ally', 0, 5, 1);
  placePiece(G, 'sla2', 'ally', 1, 5, 2);
  placePiece(G, 'sla3', 'ally', 4, 4, 3);
  const resos = TacticsEngine.detectResonances('ally');
  ok(resos.some(r => r.type === 'el3'), 'el3 detected');
});

console.log();
console.log('=== 共鳴: 統合 (重複適用) ===');

test('直線 + 同系統 + 同属性 で +5 atk 以上', () => {
  const G = freshGame();
  const p1 = placePiece(G, 'sla1', 'ally', 0, 5, 1);
  placePiece(G, 'sla1', 'ally', 1, 5, 2);
  placePiece(G, 'sla1', 'ally', 2, 5, 3);
  // sla1 base=1 + line3(+2) + family3(+2) + el3(+1) = 6
  const atk = TacticsEngine.effectiveAtk(p1);
  ok(atk >= 6, `expected ≥6, got ${atk}`);
});

test('共鳴 なし は base atk のまま', () => {
  const G = freshGame();
  const p = placePiece(G, 'sla1', 'ally', 0, 5, 1);
  const atk = TacticsEngine.effectiveAtk(p);
  eq(atk, 1, 'sla1 base atk=1');
});

console.log();
console.log(`=== 結果: ${passed} passed / ${failed} failed ===`);
if (failed > 0) {
  console.log('\n失敗 詳細:');
  failures.forEach(f => {
    console.log(`  ✗ ${f.name}`);
    console.log(`    ${f.error.message}`);
  });
  process.exit(1);
}
process.exit(0);
