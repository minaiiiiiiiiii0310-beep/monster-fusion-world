/* =========================================================================
 *  snap_engine.js  —  モンスター・スナップ コアゲームロジック
 *
 *  ・3レーン × 4スロット × 6ターン
 *  ・両者同時公開
 *  ・能力評価: onReveal → ongoing(modifyPow) → endOfTurn → onDestroyed
 * =======================================================================*/
const SnapEngine = (() => {
  const MAX_TURN = 6;
  const HAND_MAX = 7;
  const SLOTS_PER_LANE = 4;

  /* ===== 試合状態 =====
   * {
   *   turn: 1,
   *   energy: { ally: 1, enemy: 1 },
   *   deck: { ally: [...cardIds], enemy: [...] },
   *   hand: { ally: [...cards], enemy: [...] },
   *   board: [
   *     { ally: [cards], enemy: [cards], location: {...} },
   *     { ally: [], enemy: [], location: {...} },
   *     { ally: [], enemy: [], location: {...} },
   *   ],
   *   pending: { ally: [{card, lane}], enemy: [...] }, // ターン中の伏せ
   *   destroyed: [],   // 破壊履歴
   *   over: false,
   *   result: null,    // 'win' | 'lose' | 'tie'
   *   log: [],
   * }
   */
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
    };
    // 初期手札3枚
    drawN('ally', 3);
    drawN('enemy', 3);
    // ターン1の開始時に最初のロケーションを公開
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
  // 公開フェーズまで POW 等は確定しない
  function play(side, cardUid, laneIdx) {
    if (!G || G.over) return { ok: false, msg: 'ゲーム終了済み' };
    const idx = G.hand[side].findIndex(c => c.uid === cardUid);
    if (idx < 0) return { ok: false, msg: '手札にカードが ない' };
    const card = G.hand[side][idx];

    // エネルギーチェック（pending 含む）
    const usedEnergy = G.pending[side].reduce((s, p) => s + p.card.cost, 0);
    if (usedEnergy + card.cost > G.energy[side]) {
      return { ok: false, msg: 'エネルギー不足' };
    }
    // レーンのスロット数チェック
    const lane = G.board[laneIdx];
    if (!lane) return { ok: false, msg: 'レーンが無効' };
    const maxSlots = lane.location.maxSlots || SLOTS_PER_LANE;
    const slotsUsed = lane[side].length + G.pending[side].filter(p => p.lane === laneIdx).length;
    if (slotsUsed >= maxSlots) {
      return { ok: false, msg: 'このレーンは満杯' };
    }
    // ロケーション canPlace
    if (lane.location.canPlace && !lane.location.canPlace(card, laneIdx)) {
      return { ok: false, msg: `${lane.location.name} には置けない` };
    }
    // 配置: 手札から取り除き、pending に
    G.hand[side].splice(idx, 1);
    G.pending[side].push({ card, lane: laneIdx });
    return { ok: true, card };
  }

  // 手札に戻す（同ターン中の取り消し）
  function unplay(side, cardUid) {
    const idx = G.pending[side].findIndex(p => p.card.uid === cardUid);
    if (idx < 0) return false;
    const p = G.pending[side][idx];
    G.pending[side].splice(idx, 1);
    G.hand[side].push(p.card);
    return true;
  }

  /* ----- ターン終了: 両者の pending を同時公開・能力解決・次ターン ----- */
  function endTurn() {
    if (!G || G.over) return G;
    // 1) pending を盤面に確定（両側）
    const revealed = { ally: [], enemy: [] };
    ['enemy', 'ally'].forEach(side => {   // 敵→味方の順で公開（マーベルスナップは Snap宣言者順だが、MVPでは敵先）
      G.pending[side].forEach(p => {
        G.board[p.lane][side].push(p.card);
        revealed[side].push({ card: p.card, lane: p.lane });
        G.log.push(`${side === 'ally' ? '★' : '◆'} ${p.card.name} がレーン${p.lane + 1}に登場`);
      });
    });
    G.pending = { ally: [], enemy: [] };

    // 2) onReveal を順番に発動（敵→味方）
    revealed.enemy.forEach(r => triggerOnReveal(r.card, r.lane, 'enemy'));
    revealed.ally.forEach(r => triggerOnReveal(r.card, r.lane, 'ally'));

    // 3) ロケーションの onPlace（reveal時、配置後）
    revealed.enemy.forEach(r => triggerLocationOnPlace(r.card, r.lane, 'enemy'));
    revealed.ally.forEach(r => triggerLocationOnPlace(r.card, r.lane, 'ally'));

    // 4) End of turn 能力（盤上の全カード）
    forEachCard((card, lane, side) => triggerEndOfTurn(card, lane, side));

    // 5) ロケーションの onTurnEnd
    G.board.forEach((lane, idx) => {
      if (lane.location.onTurnEnd) lane.location.onTurnEnd(idx, null, api());
    });

    // 6) 次ターン or ゲーム終了
    if (G.turn >= MAX_TURN) {
      finishGame();
    } else {
      G.turn += 1;
      G.energy.ally = G.turn;
      G.energy.enemy = G.turn;
      // 次のロケーション公開
      if (G.turn - 1 < G.board.length) {
        G.board[G.turn - 1].locationRevealed = true;
      }
      drawN('ally', 1);
      drawN('enemy', 1);
    }
    return G;
  }

  function forEachCard(fn) {
    G.board.forEach((lane, laneIdx) => {
      ['ally', 'enemy'].forEach(side => {
        lane[side].forEach(c => fn(c, laneIdx, side));
      });
    });
  }

  /* ----- 能力ハンドラ ----- */
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
      case 'slime_buff': {
        // 同レーンの味方 +1 POW（自分以外）
        slot[side].forEach(c => { if (c.uid !== card.uid) c.pow += 1; });
        G.log.push(`${card.name}: 同レーンの味方を強化`);
        break;
      }
      case 'angel_bless': {
        // 全レーンの味方 +1 POW
        G.board.forEach(l => l[side].forEach(c => { if (c.uid !== card.uid) c.pow += 1; }));
        G.log.push(`${card.name}: 全味方を祝福`);
        break;
      }
      case 'rank_up': {
        // 同レーンの味方の POW を 1.5倍（切り上げ）
        slot[side].forEach(c => {
          if (c.uid !== card.uid) c.pow = Math.ceil(c.pow * 1.5);
        });
        G.log.push(`${card.name}: 同レーンの味方が覚醒`);
        break;
      }
      case 'devil_strike': {
        // 相手の最弱カード破壊（全レーン中）
        let weakest = null, wLane = -1;
        G.board.forEach((l, i) => {
          l[opp].forEach(c => {
            const ep = effectivePow(c, i, opp);
            if (!weakest || ep < effectivePow(weakest, wLane, opp)) {
              weakest = c; wLane = i;
            }
          });
        });
        if (weakest) {
          destroyCard(weakest, wLane, opp);
          G.log.push(`${card.name}: ${weakest.name} を破壊！`);
        }
        break;
      }
      case 'dragon_burn': {
        // 同レーンの敵 -2 POW
        slot[opp].forEach(c => c.pow = Math.max(0, c.pow - 2));
        G.log.push(`${card.name}: 同レーンの敵を焼く`);
        break;
      }
      case 'heal_draw': {
        if (G.hand[side].length < HAND_MAX) drawN(side, 1);
        G.log.push(`${card.name}: 1枚ドロー`);
        break;
      }
      case 'bird_fly': {
        // 別のレーンに移動（最も自分の戦力が劣勢なレーンへ）
        let bestLane = lane, bestDiff = totals(lane).ally - totals(lane).enemy;
        if (side === 'enemy') bestDiff = -bestDiff;
        G.board.forEach((l, i) => {
          if (i === lane) return;
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
          G.log.push(`${card.name}: レーン${bestLane + 1}へ飛んだ`);
        }
        break;
      }
      case 'growth':
      case 'regen':
      case 'drain': {
        if (id === 'growth') {
          card.pow += 1;
        } else if (id === 'regen') {
          slot[side].forEach(c => { if (c.uid !== card.uid) c.pow += 1; });
        } else if (id === 'drain') {
          slot[opp].forEach(c => c.pow = Math.max(0, c.pow - 1));
        }
        break;
      }
      // ongoing 系は modifyPow で評価
      // onDestroyed 系も別途
    }
  }

  /* ----- onDestroyed の特殊処理 ----- */
  function destroyCard(card, lane, side) {
    if (card.ability === 'golem_shield') return;   // 破壊耐性
    if (card.ability === 'metal_dodge') return;
    const slot = G.board[lane][side];
    const idx = slot.findIndex(c => c.uid === card.uid);
    if (idx < 0) return;
    slot.splice(idx, 1);
    G.destroyed.push({ card, lane, side, atTurn: G.turn });
    G.log.push(`${card.name} が破壊された`);
    // onDestroyed 発動
    triggerOnDestroyed(card, lane, side);
    // phoenix_revive
    if (card.ability === 'phoenix_revive' && !card._revived) {
      card._revived = true;
      // 次ターン頭に復活予約（簡略: そのレーンに即復活）
      setTimeout(() => {
        const cur = G.board[lane][side];
        const maxSlots = G.board[lane].location.maxSlots || SLOTS_PER_LANE;
        if (cur.length < maxSlots) {
          cur.push({ ...card, _revived: true });
          G.log.push(`${card.name} が蘇った！`);
        }
      }, 0);
    }
    // explode
    if (card.ability === 'explode') {
      const opp = side === 'ally' ? 'enemy' : 'ally';
      G.board[lane][opp].forEach(c => c.pow = Math.max(0, c.pow - 3));
    }
  }

  /* ----- POW 計算 -----
   * 表示用 POW = card.pow + ongoing 補正 + ロケーション補正
   */
  function effectivePow(card, lane, side) {
    let pow = card.pow;
    const slot = G.board[lane];
    // ongoing 補正（同レーン or 全体）
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
        }
      });
      const opp = side === 'ally' ? 'enemy' : 'ally';
      l[opp].forEach(c => {
        if (c.abilityType !== 'ongoing') return;
        if (c.ability === 'light_aura' && li === lane) pow = Math.max(0, pow - 1);
      });
    });
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
      // タイブレーカー: 総POW
      let aTotal = 0, eTotal = 0;
      G.board.forEach((slot, i) => {
        slot.ally.forEach(c => aTotal += effectivePow(c, i, 'ally'));
        slot.enemy.forEach(c => eTotal += effectivePow(c, i, 'enemy'));
      });
      G.result = aTotal > eTotal ? 'win' : eTotal > aTotal ? 'lose' : 'tie';
    }
    G.allyLanes = allyLanes;
    G.enemyLanes = enemyLanes;
  }

  // API (能力やロケーションが操作するためのフック)
  function api() {
    return {
      board: G.board,
      effectivePow,
      destroyCard,
      log: (m) => G.log.push(m),
    };
  }

  return {
    MAX_TURN, HAND_MAX, SLOTS_PER_LANE,
    start, state, play, unplay, endTurn,
    effectivePow, totals, destroyCard,
  };
})();
