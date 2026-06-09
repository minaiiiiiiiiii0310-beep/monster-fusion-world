/* =========================================================================
 *  tactics_engine.js  —  6×6 盤面 戦術 ゲーム コアエンジン
 *
 *  ・盤面: 6×6 = 36マス
 *  ・両陣営は ボード上部(敵) / 下部(自) から 開始
 *  ・ターン制: 自分のターン → 召喚 + 移動 + 攻撃 → エンドターン
 *  ・勝利条件: 相手の 場・デッキの モンスターを 全滅
 *
 *  能力評価順:
 *    onSummon → passive(常時) → onAttack → onDamaged → onDeath → end
 * =======================================================================*/
const TacticsEngine = (() => {
  const BOARD_W = 6;
  const BOARD_H = 6;
  const HAND_MAX = 6;
  const MAGIC_HAND_MAX = 4;
  const MAX_ON_BOARD = 6;        // 1陣営の 場上 最大数
  const INITIAL_MONSTER_HAND = 4;
  const INITIAL_MAGIC_HAND = 2;
  const STARTING_ROWS = {
    ally:  [4, 5],               // 下2段が 味方 召喚可能
    enemy: [0, 1],               // 上2段が 敵 召喚可能
  };

  let G = null;
  let _uid = 1;
  function nextUid() { return _uid++; }

  /* ============ 試合 開始 ============ */
  function start(opts = {}) {
    _uid = 1;
    const allyMonsterDeck = (opts.allyMonsterDeck || TacticsData.starterMonsterDeck()).slice();
    const enemyMonsterDeck = (opts.enemyMonsterDeck || TacticsData.starterMonsterDeck()).slice();
    const allyMagicDeck = (opts.allyMagicDeck || TacticsData.starterMagicDeck()).slice();
    const enemyMagicDeck = (opts.enemyMagicDeck || TacticsData.starterMagicDeck()).slice();

    G = {
      board: makeBoard(),
      monsterHand: { ally: [], enemy: [] },
      magicHand:   { ally: [], enemy: [] },
      monsterDeck: { ally: shuffle(allyMonsterDeck), enemy: shuffle(enemyMonsterDeck) },
      magicDeck:   { ally: shuffle(allyMagicDeck),   enemy: shuffle(enemyMagicDeck) },
      energy: { ally: 1, enemy: 1 },
      turn: 1,
      whose: 'ally',
      phase: 'start',           // start | main | end
      pendingReactions: { ally: [], enemy: [] },   // 伏せ魔法（リアクション）
      activeBuffs: [],          // 1ターンの 一時バフ
      over: false,
      winner: null,
      log: [],
    };
    drawMonster('ally', INITIAL_MONSTER_HAND);
    drawMonster('enemy', INITIAL_MONSTER_HAND);
    drawMagic('ally', INITIAL_MAGIC_HAND);
    drawMagic('enemy', INITIAL_MAGIC_HAND);
    return G;
  }

  function makeBoard() {
    const b = [];
    for (let y = 0; y < BOARD_H; y++) {
      const row = [];
      for (let x = 0; x < BOARD_W; x++) row.push(null);
      b.push(row);
    }
    return b;
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function drawMonster(side, n) {
    for (let i = 0; i < n; i++) {
      if (G.monsterHand[side].length >= HAND_MAX) break;
      const id = G.monsterDeck[side].shift();
      if (!id) break;
      const c = TacticsData.getMonster(id);
      if (c) G.monsterHand[side].push({ ...c, uid: nextUid() });
    }
  }

  function drawMagic(side, n) {
    for (let i = 0; i < n; i++) {
      if (G.magicHand[side].length >= MAGIC_HAND_MAX) break;
      const id = G.magicDeck[side].shift();
      if (!id) break;
      const c = TacticsData.getMagic(id);
      if (c) G.magicHand[side].push({ ...c, uid: nextUid() });
    }
  }

  function state() { return G; }
  function opp(side) { return side === 'ally' ? 'enemy' : 'ally'; }

  /* ============ 配置・座標 ============ */
  function inBoard(x, y) {
    return x >= 0 && x < BOARD_W && y >= 0 && y < BOARD_H;
  }
  function cell(x, y) {
    if (!inBoard(x, y)) return null;
    return G.board[y][x];
  }
  function setCell(x, y, piece) {
    if (!inBoard(x, y)) return;
    G.board[y][x] = piece;
    if (piece) { piece.x = x; piece.y = y; }
  }
  function findPiece(uid) {
    for (let y = 0; y < BOARD_H; y++) {
      for (let x = 0; x < BOARD_W; x++) {
        const p = G.board[y][x];
        if (p && p.uid === uid) return p;
      }
    }
    return null;
  }
  function piecesOf(side) {
    const out = [];
    for (let y = 0; y < BOARD_H; y++) {
      for (let x = 0; x < BOARD_W; x++) {
        const p = G.board[y][x];
        if (p && p.owner === side) out.push(p);
      }
    }
    return out;
  }
  function chebyshev(a, b) {
    return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  }

  /* ============ 召喚 ============ */
  function canSummonAt(side, card, x, y) {
    if (!inBoard(x, y)) return { ok: false, msg: '盤外' };
    if (cell(x, y)) return { ok: false, msg: '占有マス' };
    if (!STARTING_ROWS[side].includes(y)) {
      return { ok: false, msg: '召喚可能行外' };
    }
    if (piecesOf(side).length >= MAX_ON_BOARD) {
      return { ok: false, msg: '盤上 上限' };
    }
    if (G.energy[side] < card.cost) {
      return { ok: false, msg: 'エネルギー不足' };
    }
    return { ok: true };
  }

  function summon(side, cardUid, x, y) {
    if (!G || G.over) return { ok: false, msg: 'ゲーム終了済み' };
    if (G.whose !== side) return { ok: false, msg: 'あなたのターンではない' };
    const idx = G.monsterHand[side].findIndex(c => c.uid === cardUid);
    if (idx < 0) return { ok: false, msg: '手札にない' };
    const card = G.monsterHand[side][idx];
    const can = canSummonAt(side, card, x, y);
    if (!can.ok) return can;
    // 召喚
    G.monsterHand[side].splice(idx, 1);
    G.energy[side] -= card.cost;
    const piece = {
      ...card,
      owner: side,
      curHp: card.hp,
      maxHp: card.hp,
      bonusAtk: 0,
      moved: false,
      attacked: false,
      activeUsed: false,
      x, y,
    };
    setCell(x, y, piece);
    G.log.push(`${side === 'ally' ? '★' : '◆'} ${card.name} を (${x},${y}) に 召喚`);
    triggerOnSummon(piece);
    return { ok: true, piece };
  }

  /* ============ 移動 ============ */
  function canMove(piece, x, y) {
    if (!piece) return { ok: false, msg: 'ピースなし' };
    if (G.whose !== piece.owner) return { ok: false, msg: 'あなたのターンではない' };
    if (piece.moved) return { ok: false, msg: 'すでに移動済み' };
    if (!inBoard(x, y)) return { ok: false, msg: '盤外' };
    if (cell(x, y)) return { ok: false, msg: '占有マス' };
    const movRange = effectiveMov(piece);
    const dist = Math.max(Math.abs(piece.x - x), Math.abs(piece.y - y));
    if (dist > movRange) return { ok: false, msg: '移動範囲外' };
    return { ok: true };
  }

  function effectiveMov(piece) {
    let m = piece.mov;
    if (piece.skill === 'swift') m += 1;
    return m;
  }

  function effectiveRng(piece) {
    let r = piece.rng;
    if (piece.skill === 'longshot') r += 1;
    return r;
  }

  function move(uid, x, y) {
    const piece = findPiece(uid);
    if (!piece) return { ok: false, msg: 'ピースが 見つからない' };
    const can = canMove(piece, x, y);
    if (!can.ok) return can;
    setCell(piece.x, piece.y, null);
    setCell(x, y, piece);
    piece.moved = true;
    G.log.push(`${piece.owner === 'ally' ? '★' : '◆'} ${piece.name} → (${x},${y})`);
    return { ok: true };
  }

  /* ============ 攻撃 ============ */
  function effectiveAtk(piece) {
    let a = piece.atk + (piece.bonusAtk || 0);
    // オーラバフ: 隣接味方の aura_buff
    neighbors(piece.x, piece.y).forEach(p => {
      if (p && p.owner === piece.owner && p.skill === 'aura_buff') a += 1;
    });
    // オーラデバフ: 隣接敵の aura_debuff
    neighbors(piece.x, piece.y).forEach(p => {
      if (p && p.owner !== piece.owner && p.skill === 'aura_debuff') a -= 1;
    });
    // 一時バフ（rally_call / lane_burst 等）
    G.activeBuffs.forEach(b => {
      if (b.side === piece.owner && b.matches(piece)) a += b.atkBonus;
    });
    return Math.max(0, a);
  }

  function neighbors(x, y) {
    const out = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const c = cell(x + dx, y + dy);
        if (c) out.push(c);
      }
    }
    return out;
  }

  function canAttack(attacker, target) {
    if (!attacker || !target) return { ok: false, msg: '対象なし' };
    if (G.whose !== attacker.owner) return { ok: false, msg: 'あなたのターンではない' };
    if (attacker.attacked) return { ok: false, msg: 'すでに攻撃済み' };
    if (target.owner === attacker.owner) return { ok: false, msg: '味方は攻撃不可' };
    const dist = chebyshev(attacker, target);
    if (dist > effectiveRng(attacker)) return { ok: false, msg: '射程外' };
    return { ok: true };
  }

  function attack(attackerUid, targetUid) {
    const attacker = findPiece(attackerUid);
    const target = findPiece(targetUid);
    const can = canAttack(attacker, target);
    if (!can.ok) return can;
    const damage = effectiveAtk(attacker);
    const dealt = applyDamage(target, damage, attacker);
    attacker.attacked = true;
    G.log.push(`⚔ ${attacker.name} → ${target.name} に ${dealt} ダメージ`);
    // onAttack 効果
    triggerOnAttack(attacker, target, dealt);
    // 死亡判定
    if (target.curHp <= 0) destroyPiece(target, attacker);
    checkWin();
    return { ok: true, damage: dealt };
  }

  function applyDamage(target, raw, attacker) {
    let dmg = raw;
    // 鎧（pierce で 無視可）
    if (target.skill === 'armor' && (!attacker || attacker.skill !== 'pierce')) {
      dmg = Math.max(0, dmg - 1);
    }
    // 回避
    if (target.skill === 'dodge' && Math.random() < 0.5) {
      G.log.push(`💨 ${target.name} が 回避！`);
      return 0;
    }
    target.curHp -= dmg;
    // カウンター
    if (target.skill === 'counter' && attacker && dmg > 0) {
      const counterDmg = Math.ceil(effectiveAtk(attacker) / 2);
      attacker.curHp -= counterDmg;
      G.log.push(`↩ ${target.name} の カウンター: ${counterDmg} 反撃`);
      if (attacker.curHp <= 0) destroyPiece(attacker, target);
    }
    return dmg;
  }

  /* ============ 死亡 / 効果トリガー ============ */
  function destroyPiece(piece, killer) {
    if (!piece) return;
    G.log.push(`☠ ${piece.name} 撃破`);
    setCell(piece.x, piece.y, null);
    triggerOnDeath(piece, killer);
  }

  function triggerOnSummon(piece) {
    switch (piece.skill) {
      case 'summon_token': {
        // 隣接 空マスに 1/1 トークン
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = piece.x + dx, ny = piece.y + dy;
            if (inBoard(nx, ny) && !cell(nx, ny)) {
              const token = {
                id: 'token',
                name: '使い魔',
                emoji: '👻',
                cost: 0, hp: 1, atk: 1, mov: 1, rng: 1,
                el: piece.el || 'none', family: 'token',
                rank: 1, skill: 'none',
                owner: piece.owner,
                curHp: 1, maxHp: 1, bonusAtk: 0,
                moved: false, attacked: false, activeUsed: false,
                uid: nextUid(),
                _token: true,
              };
              setCell(nx, ny, token);
              G.log.push(`✨ ${piece.name}: トークン 召喚 (${nx},${ny})`);
              return;
            }
          }
        }
        break;
      }
      case 'summon_draw': {
        drawMonster(piece.owner, 1);
        G.log.push(`🃏 ${piece.name}: +1 ドロー`);
        break;
      }
      case 'summon_buff': {
        neighbors(piece.x, piece.y).forEach(p => {
          if (p && p.owner === piece.owner) p.bonusAtk += 1;
        });
        G.log.push(`💪 ${piece.name}: 隣接味方 +1 atk`);
        break;
      }
    }
  }

  function triggerOnAttack(attacker, target, dealt) {
    switch (attacker.skill) {
      case 'chain_sweep': {
        // 隣接 敵全員に 半分ダメージ（メインターゲット除く）
        const half = Math.ceil(dealt / 2);
        neighbors(attacker.x, attacker.y).forEach(p => {
          if (p && p.owner !== attacker.owner && p.uid !== target.uid) {
            const d = applyDamage(p, half, attacker);
            G.log.push(`💥 ${attacker.name} chain: ${p.name} に ${d}`);
            if (p.curHp <= 0) destroyPiece(p, attacker);
          }
        });
        break;
      }
      case 'knockback': {
        // 敵を 1マス 後退
        const dx = Math.sign(target.x - attacker.x);
        const dy = Math.sign(target.y - attacker.y);
        const nx = target.x + dx, ny = target.y + dy;
        if (inBoard(nx, ny) && !cell(nx, ny)) {
          setCell(target.x, target.y, null);
          setCell(nx, ny, target);
          G.log.push(`💨 ${target.name} を 押し戻し → (${nx},${ny})`);
        }
        break;
      }
      case 'lifesteal': {
        attacker.curHp = Math.min(attacker.maxHp, attacker.curHp + Math.ceil(dealt / 2));
        G.log.push(`🩸 ${attacker.name} 吸収 +${Math.ceil(dealt / 2)} HP`);
        break;
      }
    }
  }

  function triggerOnDeath(piece, killer) {
    switch (piece.skill) {
      case 'explode': {
        neighbors(piece.x, piece.y).forEach(p => {
          if (p && p.owner !== piece.owner) {
            const d = applyDamage(p, 3, piece);
            G.log.push(`💥 ${piece.name} 自爆: ${p.name} に ${d}`);
            if (p.curHp <= 0) destroyPiece(p, piece);
          }
        });
        break;
      }
      case 'revive': {
        // 次ターン 復活予約（同じ位置に 戻す、HP半分）
        G.pendingReactions[piece.owner].push({
          type: 'revive',
          piece: { ...piece, curHp: Math.ceil(piece.maxHp / 2), moved: false, attacked: false },
          x: piece.x, y: piece.y,
          turn: G.turn + 1,
        });
        G.log.push(`🔄 ${piece.name} 復活予約（次ターン頭）`);
        break;
      }
      case 'death_curse': {
        if (killer) {
          killer.bonusAtk = Math.max(-killer.atk, (killer.bonusAtk || 0) - 2);
          G.log.push(`☠ ${piece.name} の呪い: ${killer.name} の atk -2`);
        }
        break;
      }
    }
  }

  /* ============ 任意発動 アクティブ ============ */
  function useActive(uid, params = {}) {
    const piece = findPiece(uid);
    if (!piece) return { ok: false, msg: 'ピースなし' };
    if (G.whose !== piece.owner) return { ok: false, msg: 'あなたのターンではない' };
    if (piece.activeUsed) return { ok: false, msg: 'すでに使用済み' };
    if (piece.skillType !== 'active') return { ok: false, msg: 'アクティブ能力なし' };
    switch (piece.skill) {
      case 'dimension_shift': {
        const { x, y } = params;
        if (!inBoard(x, y) || cell(x, y)) return { ok: false, msg: '無効なマス' };
        setCell(piece.x, piece.y, null);
        setCell(x, y, piece);
        piece.activeUsed = true;
        G.log.push(`🌀 ${piece.name} ワープ → (${x},${y})`);
        return { ok: true };
      }
      case 'heal_self': {
        piece.curHp = piece.maxHp;
        piece.activeUsed = true;
        G.log.push(`💚 ${piece.name} HP全回復`);
        return { ok: true };
      }
      case 'rally_call': {
        G.activeBuffs.push({
          side: piece.owner,
          atkBonus: 1,
          matches: (p) => p.owner === piece.owner,
          turn: G.turn,
        });
        piece.activeUsed = true;
        G.log.push(`📣 ${piece.name} ラリーコール: 味方 +1 atk this turn`);
        return { ok: true };
      }
    }
    return { ok: false, msg: '未実装' };
  }

  /* ============ ターン進行 ============ */
  function endTurn() {
    if (G.over) return G;
    // 復活処理
    G.pendingReactions[G.whose] = G.pendingReactions[G.whose].filter(r => {
      if (r.type === 'revive' && r.turn === G.turn + 1) {
        if (!cell(r.x, r.y) && piecesOf(G.whose).length < MAX_ON_BOARD) {
          setCell(r.x, r.y, r.piece);
          G.log.push(`🔄 ${r.piece.name} が 蘇った`);
        }
        return false;
      }
      return true;
    });

    // ターン交代
    G.whose = opp(G.whose);
    if (G.whose === 'ally') {
      G.turn += 1;
      // 1ターン限定 バフを 切る
      G.activeBuffs = G.activeBuffs.filter(b => b.turn === G.turn);
    }
    // エネルギー回復
    G.energy[G.whose] = Math.min(10, G.turn);
    // ドロー
    drawMonster(G.whose, 1);
    if (G.turn % 2 === 0) drawMagic(G.whose, 1);   // 魔法は 2ターンに 1枚
    // moved/attacked リセット
    piecesOf(G.whose).forEach(p => { p.moved = false; p.attacked = false; });
    // 再生
    piecesOf(G.whose).forEach(p => {
      if (p.skill === 'regenerate' && p.curHp < p.maxHp) {
        p.curHp = Math.min(p.maxHp, p.curHp + 1);
      }
    });
    checkWin();
    return G;
  }

  /* ============ 勝敗判定 ============ */
  function checkWin() {
    if (G.over) return;
    const allyPieces = piecesOf('ally').length;
    const enemyPieces = piecesOf('enemy').length;
    const allyDeck = G.monsterDeck.ally.length + G.monsterHand.ally.length;
    const enemyDeck = G.monsterDeck.enemy.length + G.monsterHand.enemy.length;
    // 場が 空 + 手札も デッキも 空 = 敗北
    if (allyPieces === 0 && allyDeck === 0) {
      G.over = true; G.winner = 'enemy';
      G.log.push('★ あなた の モンスターが 全滅');
    } else if (enemyPieces === 0 && enemyDeck === 0) {
      G.over = true; G.winner = 'ally';
      G.log.push('◆ あいて の モンスターが 全滅');
    }
  }

  return {
    BOARD_W, BOARD_H, HAND_MAX, MAGIC_HAND_MAX, MAX_ON_BOARD,
    STARTING_ROWS,
    start, state,
    drawMonster, drawMagic,
    summon, move, attack, useActive, endTurn,
    canSummonAt, canMove, canAttack,
    effectiveAtk, effectiveMov, effectiveRng,
    findPiece, piecesOf, cell, inBoard, chebyshev, neighbors,
    checkWin,
    // 試合状態の 直接アクセス（魔法カードが 内部状態を 触る用）
    _internal: () => ({ destroyPiece, applyDamage }),
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = TacticsEngine;
}
