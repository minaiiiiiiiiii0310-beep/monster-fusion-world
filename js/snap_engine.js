/* =========================================================================
 *  snap_engine.js  —  モンスター・スナップ コアゲームロジック
 *
 *  ・3レーン × 3スロット × 6ターン
 *  ・両者同時公開
 *  ・能力評価: onReveal → ongoing(modifyPow) → endOfTurn → onDestroyed
 *  ・バトル/HP は廃止（純粋な POW 比較ゲーム）
 * =======================================================================*/
const SnapEngine = (() => {
  const MAX_TURN = 10;
  const HAND_MAX = 9;
  const INITIAL_HAND = 4;     // 4枚スタート、毎ターン 1枚 ドロー
  const SLOTS_PER_LANE = 3;
  const SWAP_FEE = 1;        // ホットスワップの 追加 エネルギー
  const MOVE_FEE = 1;        // レーン移動の 追加 エネルギー
  const ENERGY_CAP = 10;

  let G = null;

  function start(allyDeckIds, enemyDeckIds) {
    const locs = SnapLocations.pickThree();
    G = {
      turn: 1,
      energy: { ally: 1, enemy: 1 },
      deck: { ally: shuffle(allyDeckIds.slice()), enemy: shuffle(enemyDeckIds.slice()) },
      hand: { ally: [], enemy: [] },
      board: locs.map(loc => ({ ally: [], enemy: [], location: loc, locationRevealed: false })),
      pending: { ally: [], enemy: [] },
      destroyed: [],
      over: false,
      result: null,
      log: [],
      bet: 1,
      snapped: { ally: false, enemy: false },
      retreated: false,
      extraCost: { ally: 0, enemy: 0 },
      justRevealed: [],
    };
    drawN('ally', INITIAL_HAND);
    drawN('enemy', INITIAL_HAND);
    G.board[0].locationRevealed = true;
    return G;
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function drawN(side, n) {
    for (let i = 0; i < n; i++) {
      if (G.hand[side].length >= HAND_MAX) break;
      const next = G.deck[side].shift();
      if (!next) break;
      const card = SnapData.getCard(next);
      if (card) G.hand[side].push({ ...card, uid: nextUid() });
    }
  }

  let _uid = 1;
  function nextUid() { return _uid++; }

  function state() { return G; }

  /* ----- カードをプレイ（pending に入れる） ----- */
  function play(side, cardUid, laneIdx) {
    if (!G || G.over) return { ok: false, msg: 'ゲーム終了済み' };
    const idx = G.hand[side].findIndex(c => c.uid === cardUid);
    if (idx < 0) return { ok: false, msg: '手札にカードが ない' };
    const card = G.hand[side][idx];

    const usedEnergy = G.pending[side].reduce((s, p) => s + p.card.cost, 0) + (G.extraCost[side] || 0);
    if (usedEnergy + card.cost > G.energy[side]) {
      return { ok: false, msg: 'エネルギー不足' };
    }
    const lane = G.board[laneIdx];
    if (!lane) return { ok: false, msg: 'レーンが無効' };
    const maxSlots = lane.location.maxSlots || SLOTS_PER_LANE;
    const slotsUsed = lane[side].length + G.pending[side].filter(p => p.lane === laneIdx).length;
    if (slotsUsed >= maxSlots) {
      return { ok: false, msg: 'このレーンは満杯' };
    }
    if (lane.location.canPlace && !lane.location.canPlace(card, laneIdx)) {
      return { ok: false, msg: `${lane.location.name} には置けない` };
    }
    G.hand[side].splice(idx, 1);
    G.pending[side].push({ card, lane: laneIdx });
    return { ok: true, card };
  }

  function unplay(side, cardUid) {
    const idx = G.pending[side].findIndex(p => p.card.uid === cardUid);
    if (idx < 0) return false;
    const p = G.pending[side][idx];
    G.pending[side].splice(idx, 1);
    G.hand[side].push(p.card);
    return true;
  }

  /* ----- ホットスワップ：公開済みカードを 手札に戻す ----- */
  function withdraw(side, revealedUid) {
    if (!G || G.over) return { ok: false };
    let target = null, targetLane = -1, targetIdx = -1;
    G.board.forEach((slot, i) => {
      const idx = slot[side].findIndex(c => c.uid === revealedUid);
      if (idx >= 0) { target = slot[side][idx]; targetLane = i; targetIdx = idx; }
    });
    if (!target) return { ok: false, msg: '対象カードがない' };
    if (G.hand[side].length >= HAND_MAX) return { ok: false, msg: '手札がいっぱい' };
    const usedEnergy = G.pending[side].reduce((s, p) => s + p.card.cost, 0) + (G.extraCost[side] || 0);
    if (usedEnergy + SWAP_FEE > G.energy[side]) return { ok: false, msg: 'エネルギー不足' };
    G.board[targetLane][side].splice(targetIdx, 1);
    G.hand[side].push(target);
    G.extraCost[side] = (G.extraCost[side] || 0) + SWAP_FEE;
    G.log.push(`${side === 'ally' ? '★' : '◆'} ${target.name} を回収`);
    return { ok: true };
  }

  /* ----- ターン終了: 公開 → 能力解決 → 次ターン ----- */
  function endTurn() {
    if (!G || G.over) return G;

    // 1) pending を盤面に確定
    const revealed = { ally: [], enemy: [] };
    const justUids = [];
    ['enemy', 'ally'].forEach(side => {
      G.pending[side].forEach(p => {
        G.board[p.lane][side].push(p.card);
        revealed[side].push({ card: p.card, lane: p.lane });
        justUids.push(p.card.uid);
        G.log.push(`${side === 'ally' ? '★' : '◆'} ${p.card.name} がレーン${p.lane + 1}に登場`);
      });
    });
    G.justRevealed = justUids;
    G.pending = { ally: [], enemy: [] };
    G.extraCost = { ally: 0, enemy: 0 };

    // 2) onReveal（敵→味方）
    revealed.enemy.forEach(r => triggerOnReveal(r.card, r.lane, 'enemy'));
    revealed.ally.forEach(r => triggerOnReveal(r.card, r.lane, 'ally'));

    // 3) ロケーションの onPlace
    revealed.enemy.forEach(r => triggerLocationOnPlace(r.card, r.lane, 'enemy'));
    revealed.ally.forEach(r => triggerLocationOnPlace(r.card, r.lane, 'ally'));

    // 4) End of turn 能力
    forEachCard((card, lane, side) => triggerEndOfTurn(card, lane, side));

    // 5) ロケーション onTurnEnd
    G.board.forEach((lane, idx) => {
      if (lane.location.onTurnEnd) lane.location.onTurnEnd(idx, null, api());
    });

    // 6) 次ターン or ゲーム終了
    if (G.turn >= MAX_TURN) {
      finishGame();
    } else {
      G.turn += 1;
      G.energy.ally = Math.min(ENERGY_CAP, G.turn);
      G.energy.enemy = Math.min(ENERGY_CAP, G.turn);
      // ロケーション 順次 公開（ターン 3, 5）
      if (G.turn === 3) G.board[1].locationRevealed = true;
      if (G.turn === 5) G.board[2].locationRevealed = true;
      drawN('ally', 1);
      drawN('enemy', 1);
    }
    return G;
  }

  /* ----- レーン移動：盤上の カードを 別レーンへ ----- */
  function moveLane(side, cardUid, newLane) {
    if (!G || G.over) return { ok: false };
    let card = null, oldLane = -1, oldIdx = -1;
    G.board.forEach((slot, i) => {
      const idx = slot[side].findIndex(c => c.uid === cardUid);
      if (idx >= 0) { card = slot[side][idx]; oldLane = i; oldIdx = idx; }
    });
    if (!card) return { ok: false, msg: '対象カードがない' };
    if (oldLane === newLane) return { ok: false, msg: '同じレーン' };
    const dest = G.board[newLane];
    if (!dest) return { ok: false, msg: 'レーンが無効' };
    if (!dest.locationRevealed) return { ok: false, msg: 'レーンが まだ 公開されてない' };
    const maxSlots = dest.location.maxSlots || SLOTS_PER_LANE;
    if (dest[side].length >= maxSlots) return { ok: false, msg: 'このレーンは満杯' };
    if (dest.location.canPlace && !dest.location.canPlace(card, newLane)) {
      return { ok: false, msg: `${dest.location.name} には置けない` };
    }
    const usedEnergy = G.pending[side].reduce((s, p) => s + p.card.cost, 0) + (G.extraCost[side] || 0);
    if (usedEnergy + MOVE_FEE > G.energy[side]) return { ok: false, msg: 'エネルギー不足' };
    G.board[oldLane][side].splice(oldIdx, 1);
    G.board[newLane][side].push(card);
    G.extraCost[side] = (G.extraCost[side] || 0) + MOVE_FEE;
    G.log.push(`${side === 'ally' ? '★' : '◆'} ${card.name} → L${newLane + 1} へ移動`);
    return { ok: true };
  }

  function forEachCard(fn) {
    G.board.forEach((lane, laneIdx) => {
      ['ally', 'enemy'].forEach(side => {
        lane[side].forEach(c => fn(c, laneIdx, side));
      });
    });
  }

  function triggerOnReveal(card, lane, side) {
    if (card.abilityType !== 'onReveal') return;
    runAbility(card.ability, card, lane, side);
  }
  function triggerEndOfTurn(card, lane, side) {
    if (card.abilityType !== 'endOfTurn') return;
    runAbility(card.ability, card, lane, side);
  }
  function triggerOnDestroyed(card, lane, side) {
    if (card.abilityType !== 'onDestroyed') return;
    runAbility(card.ability, card, lane, side);
  }
  function triggerLocationOnPlace(card, lane, side) {
    const loc = G.board[lane].location;
    if (loc.onPlace) loc.onPlace(card, lane, side, api());
  }

  /* ----- 能力ID → 実装 ----- */
  function runAbility(id, card, lane, side) {
    const opp = side === 'ally' ? 'enemy' : 'ally';
    const slot = G.board[lane];
    switch (id) {
      // ===== onReveal =====
      case 'slime_buff': {
        slot[side].forEach(c => { if (c.uid !== card.uid) c.pow += 1; });
        G.log.push(`✦ ${card.name}: 同レーン味方を +1 POW`);
        break;
      }
      case 'angel_bless': {
        G.board.forEach(l => l[side].forEach(c => { if (c.uid !== card.uid) c.pow += 1; }));
        G.log.push(`✦ ${card.name}: 全味方を +1 POW`);
        break;
      }
      case 'rank_up': {
        slot[side].forEach(c => {
          if (c.uid !== card.uid) c.pow = Math.ceil(c.pow * 1.5);
        });
        G.log.push(`✦ ${card.name}: 同レーン味方が 覚醒（×1.5）`);
        break;
      }
      case 'devil_strike': {
        let weakest = null, wLane = -1;
        G.board.forEach((l, i) => {
          l[opp].forEach(c => {
            if (c.ability === 'shield') return;   // shield 持ちは 守られる
            const ep = effectivePow(c, i, opp);
            if (!weakest || ep < effectivePow(weakest, wLane, opp)) {
              weakest = c; wLane = i;
            }
          });
        });
        if (weakest) {
          destroyCard(weakest, wLane, opp);
          G.log.push(`✦ ${card.name}: ${weakest.name} を破壊`);
        }
        break;
      }
      case 'dragon_burn': {
        slot[opp].forEach(c => {
          if (c.ability !== 'shield') c.pow = Math.max(0, c.pow - 2);
        });
        G.log.push(`✦ ${card.name}: 同レーン敵 -2 POW`);
        break;
      }
      case 'heal_draw': {
        drawN(side, 1);
        G.log.push(`✦ ${card.name}: 1枚ドロー`);
        break;
      }
      case 'bird_fly': {
        // 別レーンへ最も劣勢な場所に飛ぶ
        let bestLane = lane, bestDiff = (totals(lane).ally - totals(lane).enemy);
        if (side === 'enemy') bestDiff = -bestDiff;
        G.board.forEach((l, i) => {
          if (i === lane || !l.locationRevealed) return;
          const maxSlots = l.location.maxSlots || SLOTS_PER_LANE;
          if (l[side].length >= maxSlots) return;
          if (l.location.canPlace && !l.location.canPlace(card, i)) return;
          let diff = totals(i).ally - totals(i).enemy;
          if (side === 'enemy') diff = -diff;
          if (diff < bestDiff) { bestDiff = diff; bestLane = i; }
        });
        if (bestLane !== lane) {
          const idx = slot[side].findIndex(c => c.uid === card.uid);
          if (idx >= 0) slot[side].splice(idx, 1);
          G.board[bestLane][side].push(card);
          G.log.push(`✦ ${card.name}: レーン${bestLane + 1}へ 飛んだ`);
        }
        break;
      }
      case 'swap_lane': {
        // 最も敵 POW が 高い レーンに 移動
        let bestLane = lane, bestEnemy = -1;
        G.board.forEach((l, i) => {
          if (i === lane || !l.locationRevealed) return;
          const maxSlots = l.location.maxSlots || SLOTS_PER_LANE;
          if (l[side].length >= maxSlots) return;
          const e = totals(i).enemy;
          if (e > bestEnemy) { bestEnemy = e; bestLane = i; }
        });
        if (bestLane !== lane) {
          const idx = slot[side].findIndex(c => c.uid === card.uid);
          if (idx >= 0) slot[side].splice(idx, 1);
          G.board[bestLane][side].push(card);
          G.log.push(`✦ ${card.name}: レーン${bestLane + 1}へ ワープ`);
        }
        break;
      }
      case 'chain_buff': {
        let cnt = 0;
        G.board.forEach(l => l[side].forEach(c => {
          if (c.uid !== card.uid && c.family === card.family) { c.pow += 2; cnt++; }
        }));
        if (cnt) G.log.push(`✦ ${card.name}: 同系統 ${cnt}体 +2 POW`);
        break;
      }
      case 'elemental_boost': {
        let cnt = 0;
        G.board.forEach(l => l[side].forEach(c => {
          if (c.uid !== card.uid && c.el === card.el && card.el !== 'none') {
            c.pow += 2; cnt++;
          }
        }));
        if (cnt) G.log.push(`✦ ${card.name}: 同属性 ${cnt}体 +2 POW`);
        break;
      }
      case 'summon': {
        const maxSlots = slot.location.maxSlots || SLOTS_PER_LANE;
        if (slot[side].length < maxSlots) {
          slot[side].push({
            id: 'token', name: '使い魔', emoji: '👻',
            cost: 0, pow: 2, el: card.el || 'none',
            ability: 'none', abilityType: 'none',
            uid: nextUid(), _token: true, rank: 1,
          });
          G.log.push(`✦ ${card.name}: 使い魔を 召喚`);
        }
        break;
      }
      case 'copy_strongest': {
        let strongest = null;
        slot[side].forEach(c => {
          if (c.uid === card.uid) return;
          if (!strongest || c.pow > strongest.pow) strongest = c;
        });
        if (strongest) {
          card.pow = strongest.pow;
          G.log.push(`✦ ${card.name}: ${strongest.name} の力 ${strongest.pow} を コピー`);
        }
        break;
      }
      case 'draw_2': {
        drawN(side, 2);
        G.log.push(`✦ ${card.name}: 2枚ドロー`);
        break;
      }
      case 'boost_neighbor': {
        let cnt = 0;
        [lane - 1, lane + 1].forEach(li => {
          if (li < 0 || li >= G.board.length) return;
          G.board[li][side].forEach(c => { c.pow += 1; cnt++; });
        });
        if (cnt) G.log.push(`✦ ${card.name}: 隣接レーン ${cnt}体 +1 POW`);
        break;
      }

      // ===== endOfTurn =====
      case 'growth': {
        card.pow += 1;
        break;
      }
      case 'regen': {
        slot[side].forEach(c => { if (c.uid !== card.uid) c.pow += 1; });
        break;
      }
      case 'drain': {
        slot[opp].forEach(c => {
          if (c.ability !== 'shield') c.pow = Math.max(0, c.pow - 1);
        });
        break;
      }

      // ongoing は modifyPow で評価（runAbility では 何もしない）
      // onDestroyed も destroyCard 内で別途処理
    }
  }

  /* ----- カード破壊 ----- */
  function destroyCard(card, lane, side) {
    if (card.ability === 'shield') return;   // 破壊耐性
    const slot = G.board[lane][side];
    const idx = slot.findIndex(c => c.uid === card.uid);
    if (idx < 0) return;
    slot.splice(idx, 1);
    G.destroyed.push({ card, lane, side, atTurn: G.turn });
    G.log.push(`☠ ${card.name} が 倒れた`);
    triggerOnDestroyed(card, lane, side);
    // phoenix_revive
    if (card.ability === 'phoenix_revive' && !card._revived) {
      card._revived = true;
      const maxSlots = G.board[lane].location.maxSlots || SLOTS_PER_LANE;
      if (G.board[lane][side].length < maxSlots) {
        G.board[lane][side].push({ ...card, _revived: true, pow: Math.max(1, card.pow - 2) });
        G.log.push(`🔄 ${card.name} が 蘇った`);
      }
    }
    // explode
    if (card.ability === 'explode') {
      const opp = side === 'ally' ? 'enemy' : 'ally';
      G.board[lane][opp].forEach(c => c.pow = Math.max(0, c.pow - 3));
      G.log.push(`💥 ${card.name}: 爆発！ 同レーン敵 -3 POW`);
    }
  }

  /* ----- effectivePow: POW + ongoing 補正 + ロケーション補正 ----- */
  function effectivePow(card, lane, side) {
    let pow = card.pow;
    const slot = G.board[lane];
    const opp = side === 'ally' ? 'enemy' : 'ally';
    // ongoing 補正
    G.board.forEach((l, li) => {
      l[side].forEach(c => {
        if (c.uid === card.uid) return;
        if (c.abilityType !== 'ongoing') return;
        switch (c.ability) {
          case 'ongoing_aura':
            if (li === lane) pow += 1;
            break;
          case 'titan_boost':
            pow += 2;
            break;
          case 'light_aura':
            // 敵を弱らせる ongoing は opponent 側で処理
            break;
        }
      });
      l[opp].forEach(c => {
        if (c.abilityType !== 'ongoing') return;
        if (c.ability === 'light_aura' && li === lane) pow = Math.max(0, pow - 1);
      });
    });
    // 自分自身の ongoing
    if (card.ability === 'gang_up') {
      const allyCount = slot[side].length;
      pow += Math.max(0, allyCount - 1);   // 自分を 除いた 数だけ +
    }
    if (card.ability === 'lone_warrior' && slot[side].length === 1) {
      pow += 5;
    }
    if (card.ability === 'underdog' && totals(lane).enemy > totals(lane).ally) {
      pow += 4;
    }
    if (card.ability === 'last_stand' && G.turn === MAX_TURN) {
      pow += 6;
    }
    if (card.ability === 'late_bloomer') {
      pow += Math.max(0, G.turn - 3);   // T4=+1 ... T10=+7
    }
    // ロケーション補正
    if (slot.location.modifyPow) {
      pow += slot.location.modifyPow(card, lane, side, api());
    }
    return Math.max(0, pow);
  }

  function totals(laneIdx) {
    const slot = G.board[laneIdx];
    const sum = (side) => slot[side].reduce((s, c) => s + effectivePow(c, laneIdx, side), 0);
    return { ally: sum('ally'), enemy: sum('enemy') };
  }

  /* ----- Snap! 宣言 ----- */
  function declareSnap(side) {
    if (!G || G.over) return { ok: false, msg: 'ゲーム終了済み' };
    if (G.snapped[side]) return { ok: false, msg: 'すでに Snap 宣言済み' };
    if (G.turn >= MAX_TURN) return { ok: false, msg: '最終ターンは Snap 不可' };
    G.snapped[side] = true;
    G.bet *= 2;
    G.log.push(`${side === 'ally' ? '★ あなた' : '◆ あいて'} が Snap！ ×${G.bet}`);
    return { ok: true, bet: G.bet };
  }

  function retreat() {
    if (!G || G.over) return { ok: false };
    G.over = true;
    G.retreated = true;
    G.result = 'retreat';
    G.bet = Math.max(1, G.bet / 2);
    G.log.push(`★ あなた が おりた（損失 ×${G.bet}）`);
    return { ok: true };
  }

  function cpuShouldSnap() {
    if (G.snapped.enemy) return false;
    // 試合の 中盤〜後半（4ターン目以降〜最終2手前まで）に Snap 判断
    if (G.turn < 4 || G.turn >= MAX_TURN - 1) return false;
    let winningLanes = 0, totalDiff = 0;
    G.board.forEach((slot, i) => {
      const t = totals(i);
      if (t.enemy > t.ally) winningLanes++;
      totalDiff += t.enemy - t.ally;
    });
    return winningLanes >= 2 && totalDiff >= 6;
  }

  function finishGame() {
    G.over = true;
    let allyLanes = 0, enemyLanes = 0;
    G.board.forEach((slot, i) => {
      let allyPow = 0, enemyPow = 0;
      slot.ally.forEach(c => {
        let p = effectivePow(c, i, 'ally');
        if (slot.location.onGameEnd) p += slot.location.onGameEnd(c, i, 'ally', api()) || 0;
        allyPow += p;
      });
      slot.enemy.forEach(c => {
        let p = effectivePow(c, i, 'enemy');
        if (slot.location.onGameEnd) p += slot.location.onGameEnd(c, i, 'enemy', api()) || 0;
        enemyPow += p;
      });
      if (allyPow > enemyPow) allyLanes++;
      else if (enemyPow > allyPow) enemyLanes++;
    });
    if (allyLanes > enemyLanes) G.result = 'win';
    else if (enemyLanes > allyLanes) G.result = 'lose';
    else {
      let aTotal = 0, eTotal = 0;
      G.board.forEach((slot, i) => {
        slot.ally.forEach(c => aTotal += effectivePow(c, i, 'ally'));
        slot.enemy.forEach(c => eTotal += effectivePow(c, i, 'enemy'));
      });
      G.result = aTotal > eTotal ? 'win' : eTotal > aTotal ? 'lose' : 'tie';
    }
    G.allyLanes = allyLanes;
    G.enemyLanes = enemyLanes;
    const baseDelta = G.result === 'win' ? 10 : G.result === 'lose' ? -10 : 0;
    G.rankDelta = Math.round(baseDelta * G.bet);
  }

  function applyRetreatPenalty() {
    G.rankDelta = Math.round(-5 * G.bet);
    G.allyLanes = 0; G.enemyLanes = 0;
  }

  function api() {
    return {
      board: G.board,
      effectivePow,
      destroyCard,
      log: (m) => G.log.push(m),
    };
  }

  return {
    MAX_TURN, HAND_MAX, INITIAL_HAND, SLOTS_PER_LANE, SWAP_FEE, MOVE_FEE,
    start, state, play, unplay, withdraw, moveLane, endTurn,
    declareSnap, retreat, cpuShouldSnap, applyRetreatPenalty,
    effectivePow, totals, destroyCard,
  };
})();
