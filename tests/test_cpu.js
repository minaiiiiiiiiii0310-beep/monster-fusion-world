#!/usr/bin/env node
/* tactics_cpu.js の テスト。
 * 実行: node tests/test_cpu.js
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
global.TacticsCPU = loadModule(path.join(__dirname, '..', 'js', 'tactics_cpu.js'));

const { TacticsEngine, TacticsMagic, TacticsCPU } = global;

let passed = 0, failed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; failures.push({ name, error: e }); console.log(`  ✗ ${name}\n    ${e.message}`); }
}
function eq(a, b, msg) { if (a !== b) throw new Error(`${msg || 'eq'}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
function ok(c, m) { if (!c) throw new Error(m || 'expected truthy'); }
function notOk(c, m) { if (c) throw new Error(m || 'expected falsy'); }

function newGame() {
  return TacticsEngine.start({
    allyMonsterDeck:  ['sla1', 'bea1', 'bir1', 'pla1', 'cat1', 'mus1', 'sla1', 'bea1', 'bir1', 'pla1', 'cat1', 'mus1'],
    enemyMonsterDeck: ['sla1', 'bea1', 'bir1', 'pla1', 'cat1', 'mus1', 'sla1', 'bea1', 'bir1', 'pla1', 'cat1', 'mus1'],
    allyMagicDeck: [],
    enemyMagicDeck: [],
  });
}

console.log('=== TacticsCPU: 基本動作 ===');

test('takeTurn: 何か 行動して エンドターン まで 進む', () => {
  const G = newGame();
  // ally → enemy へ
  TacticsEngine.endTurn();
  const beforeTurn = G.turn;
  const beforeWhose = G.whose;
  TacticsCPU.takeTurn('enemy');
  // ターン 交代した
  ok(G.whose !== beforeWhose || G.over, 'turn ended');
});

test('takeTurn: 召喚できる時は 召喚する', () => {
  const G = newGame();
  TacticsEngine.endTurn();   // enemy turn
  const beforePieces = TacticsEngine.piecesOf('enemy').length;
  const actions = TacticsCPU.takeTurn('enemy', { dryRun: true });
  const hasSummon = actions.some(a => a.kind === 'summon');
  ok(hasSummon, 'plan contains summon action');
});

test('dryRun: 計画を 返すが 実行しない', () => {
  const G = newGame();
  TacticsEngine.endTurn();
  const before = JSON.parse(JSON.stringify({
    energy: G.energy,
    pieces: TacticsEngine.piecesOf('enemy').length,
  }));
  const actions = TacticsCPU.takeTurn('enemy', { dryRun: true });
  const after = {
    energy: G.energy,
    pieces: TacticsEngine.piecesOf('enemy').length,
  };
  eq(after.energy.enemy, before.energy.enemy, 'energy unchanged');
  eq(after.pieces, before.pieces, 'pieces unchanged');
  ok(Array.isArray(actions), 'returns action list');
});

console.log();
console.log('=== TacticsCPU: 召喚配置 ===');

test('召喚: 敵陣 (y=0 or 1) に 配置する', () => {
  const G = newGame();
  TacticsEngine.endTurn();   // enemy turn
  TacticsCPU.takeTurn('enemy', { skipEndTurn: true });
  const pieces = TacticsEngine.piecesOf('enemy');
  ok(pieces.length >= 1, 'summoned at least 1');
  pieces.forEach(p => {
    ok(p.y === 0 || p.y === 1, `enemy piece at y=${p.y}, expected 0 or 1`);
  });
});

console.log();
console.log('=== TacticsCPU: 攻撃 / 移動 ===');

test('攻撃: 隣接敵が いれば 攻撃する', () => {
  const G = newGame();
  // 敵 駒を 配置（直接 board 操作）
  const card = TacticsData.getMonster('sla1');
  const enemyPiece = {
    ...card, owner: 'enemy', curHp: card.hp, maxHp: card.hp,
    bonusAtk: 0, moved: false, attacked: false, activeUsed: false,
    uid: 88888, x: 2, y: 2,
  };
  G.board[2][2] = enemyPiece;
  // 味方 駒を 隣接配置
  const allyPiece = {
    ...card, owner: 'ally', curHp: 5, maxHp: 5,
    bonusAtk: 0, moved: false, attacked: false, activeUsed: false,
    uid: 88889, x: 2, y: 3,
  };
  G.board[3][2] = allyPiece;
  // 敵ターンで CPU 動作
  TacticsEngine.endTurn();
  const beforeHp = allyPiece.curHp;
  TacticsCPU.takeTurn('enemy', { skipEndTurn: true });
  // 攻撃が 発生した（味方の HP が 減るか、enemy.attacked=true）
  ok(allyPiece.curHp < beforeHp || enemyPiece.attacked, 'attack happened');
});

test('移動: 攻撃 不可なら 近づく', () => {
  const G = newGame();
  const card = TacticsData.getMonster('sla1');
  // 敵 駒 (2,0) 自陣
  const enemyPiece = {
    ...card, owner: 'enemy', curHp: card.hp, maxHp: card.hp,
    bonusAtk: 0, moved: false, attacked: false, activeUsed: false,
    uid: 77777, x: 2, y: 0,
  };
  G.board[0][2] = enemyPiece;
  // 味方 駒 (2,5) 遠い
  const allyPiece = {
    ...card, owner: 'ally', curHp: 5, maxHp: 5,
    bonusAtk: 0, moved: false, attacked: false, activeUsed: false,
    uid: 77778, x: 2, y: 5,
  };
  G.board[5][2] = allyPiece;
  TacticsEngine.endTurn();
  const beforeY = enemyPiece.y;
  TacticsCPU.takeTurn('enemy', { skipEndTurn: true });
  // y が 増えた（敵 = 下方向へ 進む）
  ok(enemyPiece.y > beforeY, `expected move down, was ${beforeY} → ${enemyPiece.y}`);
});

console.log();
console.log('=== TacticsCPU: 魔法 利用 ===');

test('healing_wind: 瀕死の 味方が いれば 唱える', () => {
  const G = newGame();
  // 敵に healing_wind を 持たせる
  const hw = TacticsData.getMagic('healing_wind');
  G.magicHand.enemy.push({ ...hw, uid: 66666 });
  // 敵駒を 配置 (瀕死)
  const card = TacticsData.getMonster('sla1');
  const enemyPiece = {
    ...card, owner: 'enemy', curHp: 1, maxHp: 5,
    bonusAtk: 0, moved: false, attacked: false, activeUsed: false,
    uid: 66667, x: 2, y: 1,
  };
  G.board[1][2] = enemyPiece;
  TacticsEngine.endTurn();
  // CPU は healing_wind を 唱えて 全回復させる はず
  TacticsCPU.takeTurn('enemy', { skipEndTurn: true });
  ok(enemyPiece.curHp >= 4, `expected restored to full, got ${enemyPiece.curHp}`);
});

test('rally: 味方 2体以上で 唱える', () => {
  const G = newGame();
  const rally = TacticsData.getMagic('rally');
  // 敵を 2駒 配置
  const card = TacticsData.getMonster('sla1');
  const p1 = { ...card, owner: 'enemy', curHp: 5, maxHp: 5,
               bonusAtk: 0, moved: false, attacked: false, activeUsed: false,
               uid: 55556, x: 1, y: 1 };
  const p2 = { ...card, owner: 'enemy', curHp: 5, maxHp: 5,
               bonusAtk: 0, moved: false, attacked: false, activeUsed: false,
               uid: 55557, x: 2, y: 1 };
  G.board[1][1] = p1;
  G.board[1][2] = p2;
  // ターン 2 まで 進める（enemy が rally cost 2 を 払えるよう）
  TacticsEngine.endTurn();   // turn1 enemy
  TacticsEngine.endTurn();   // turn2 ally
  TacticsEngine.endTurn();   // turn2 enemy, energy=2
  // rally を 強制 投入
  G.magicHand.enemy.push({ ...rally, uid: 55555 });
  TacticsCPU.takeTurn('enemy', { skipEndTurn: true });
  // バフが 適用されている
  const hasBuff = G.activeBuffs.some(b => b.side === 'enemy' && b.atkBonus === 1);
  ok(hasBuff, 'rally buff active');
});

console.log();
console.log('=== TacticsCPU: 統合 シナリオ ===');

test('数ターン プレイで ゲームが 終了に 向かう', () => {
  const G = newGame();
  let turns = 0;
  while (!G.over && turns < 30) {
    if (G.whose === 'ally') {
      // 簡易: ally も CPU で 動かす
      TacticsCPU.takeTurn('ally');
    } else {
      TacticsCPU.takeTurn('enemy');
    }
    turns++;
  }
  // 30ターン以内に 何かしらの 結果が 出る（または 進む）
  ok(turns < 30 || G.turn > 5, `played ${turns} turns`);
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
