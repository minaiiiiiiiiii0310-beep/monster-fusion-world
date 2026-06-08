/* =========================================================================
 *  snap_engine.js  —  モンスター・スナップ コアゲームロジック
 *
 *  ・3レーン × 4スロット × 6ターン
 *  ・両者同時公開
 *  ・能力評価: onReveal → ongoing(modifyPow) → endOfTurn → onDestroyed
 * =======================================================================*/
const SnapEngine = (() => {
  const MAX_TURN = 8;
  const HAND_MAX = 8;
  const INITIAL_HAND = 5;
  const SLOTS_PER_LANE = 3;
  const SWAP_FEE = 1;        // ホットスワップの 追加 エネルギー
  const HP_PER_POW = 2;      // 各カードの HP = pow * HP_PER_POW

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
      bet: 1,                              // ベット倍率
      snapped: { ally: false, enemy: false },  // 各陣営の Snap宣言済みフラグ
      retreated: false,                     // プレイヤーがおりたか
      extraCost: { ally: 0, enemy: 0 },     // ホットスワップ等の 追加エネルギー消費
      justRevealed: [],                     // 直前ターンに 公開された カード uid（アニメ用）
      lastTurnLog: [],                      // 直前ターンの ハイライト
      phase: 'deploy',                      // 'deploy' | 'attack' | 'end'
    };
    // 初期手札 5枚
    drawN('ally', INITIAL_HAND);
    drawN('enemy', INITIAL_HAND);
    // ターン1の開始時に 最初のロケーションを公開
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
      if (card) {
        const maxHp = Math.max(2, (card.pow || 1) * HP_PER_POW);
        G.hand[side].push({
          ...card,
          uid: nextUid(),
          maxHp,
          hp: maxHp,
        });
      }
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

    // エネルギーチェック（pending + extraCost 含む）
    const usedEnergy = G.pending[side].reduce((s, p) => s + p.card.cost, 0) + (G.extraCost[side] || 0);
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

  /* ----- ホットスワップ -----
   * すでに公開済みの 自分のカードを 手札に 戻す。コスト = SWAP_FEE。
   * 戻したカードは 全 HP 回復。
   */
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
    // 撤収
    G.board[targetLane][side].splice(targetIdx, 1);
    target.hp = target.maxHp;   // 戻すと回復
    G.hand[side].push(target);
    G.extraCost[side] = (G.extraCost[side] || 0) + SWAP_FEE;
    G.log.push(`${side === 'ally' ? '★' : '◆'} ${target.name} を回収（-${SWAP_FEE}⚡）`);
    return { ok: true };
  }

  /* ----- 配置フェーズ終了: 両者の pending を同時公開 → attack フェーズへ ----- */
  function endTurn() {
    if (!G || G.over) return G;
    G.lastTurnLog = [];

    // 1) pending を盤面に確定（両側）
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

    // 4) attack フェーズ開始: 全カードの attacked フラグを リセット
    forEachCard((card) => { card.attacked = false; });
    G.phase = 'attack';
    return G;
  }

  /* ----- プレイヤー：1枚で 1枚を 攻撃 -----
   *   attacker は 同レーン の 敵 1枚を 選んで 攻撃。
   *   攻撃済みの カードは 同ターン中 再攻撃 不可。
   */
  function attack(side, attackerUid, targetUid) {
    if (!G || G.over) return { ok: false, msg: 'ゲーム終了済み' };
    if (G.phase !== 'attack') return { ok: false, msg: '戦闘フェーズ外' };
    const opp = side === 'ally' ? 'enemy' : 'ally';
    let attacker = null, attackerLane = -1;
    let target = null, targetLane = -1;
    G.board.forEach((slot, i) => {
      const a = slot[side].find(c => c.uid === attackerUid);
      if (a) { attacker = a; attackerLane = i; }
      const t = slot[opp].find(c => c.uid === targetUid);
      if (t) { target = t; targetLane = i; }
    });
    if (!attacker) return { ok: false, msg: '攻撃カードが見つからない' };
    if (!target) return { ok: false, msg: '目標が見つからない' };
    if (attacker.attacked) return { ok: false, msg: 'すでに攻撃済み' };
    if (attackerLane !== targetLane) return { ok: false, msg: '同レーンのみ攻撃可' };
    // ダメージ計算
    const pow = effectivePow(attacker, attackerLane, side);
    const dmgInfo = applyDamage(target, pow, attacker);
    // double_strike: 2回攻撃
    if (attacker.ability === 'double_strike' && target.hp > 0) {
      applyDamage(target, pow, attacker);
    }
    attacker.attacked = true;
    G.log.push(`${side === 'ally' ? '★' : '◆'} ${attacker.name} → ${target.name} に ${pow}DMG`);
    if (target.hp <= 0) destroyCard(target, targetLane, opp);
    return { ok: true, damage: pow };
  }

  /* ----- finishCombat: 旧 API（後方互換）。一括処理。 ----- */
  function finishCombat() {
    if (!G || G.over) return G;
    if (G.phase !== 'attack') return G;
    const plan = planCpuAttacks();
    plan.forEach(p => attack('enemy', p.attackerUid, p.targetUid));
    endOfRoundCleanup();
    return G;
  }

  /* ----- CPU の 攻撃計画を 返す（実行は しない） -----
   * UI が 順次 実行できるよう、ターゲットを 事前に 計算。
   */
  function planCpuAttacks() {
    if (!G || G.phase !== 'attack') return [];
    const plan = [];
    // simulate HP（カード destruction を 仮想的に 反映）
    // 単純実装: 現状の HP で 最弱を ターゲット、計画後 すぐ実行する 前提
    G.board.forEach((slot, laneIdx) => {
      if (!slot.enemy.length || !slot.ally.length) return;
      slot.enemy.forEach(attacker => {
        if (attacker.attacked) return;
        const targets = slot.ally.filter(c => c.hp > 0);
        if (!targets.length) return;
        let target = targets[0];
        targets.forEach(t => {
          if (t.hp < target.hp) target = t;
          else if (t.hp === target.hp && t.pow > target.pow) target = t;
        });
        plan.push({
          attackerUid: attacker.uid,
          targetUid: target.uid,
          lane: laneIdx,
        });
      });
    });
    return plan;
  }

  /* ----- ターン末の 後片付け（CPU 攻撃が 終わった後に 呼ぶ）----- */
  function endOfRoundCleanup() {
    if (!G || G.over) return G;
    // End of turn 能力
    forEachCard((card, lane, side) => triggerEndOfTurn(card, lane, side));
    // ロケーション onTurnEnd
    G.board.forEach((lane, idx) => {
      if (lane.location.onTurnEnd) lane.location.onTurnEnd(idx, null, api());
    });
    // 次ターン or ゲーム終了
    if (G.turn >= MAX_TURN) {
      finishGame();
      G.phase = 'end';
    } else {
      G.turn += 1;
      G.energy.ally = Math.min(8, G.turn);
      G.energy.enemy = Math.min(8, G.turn);
      if (G.turn === 2) G.board[1].locationRevealed = true;
      if (G.turn === 3) G.board[2].locationRevealed = true;
      drawN('ally', 1);
      drawN('enemy', 1);
      G.phase = 'deploy';
    }
    return G;
  }

  function applyDamage(card, dmg, attacker) {
    let reduced = dmg;
    if (card.ability === 'shield' && (!attacker || attacker.ability !== 'pierce')) {
      reduced = Math.ceil(reduced / 2);
    }
    // pierce: 追加 +2 ダメージ
    if (attacker && attacker.ability === 'pierce') reduced += 2;
    card.hp = Math.max(0, card.hp - reduced);
    // lifesteal: 攻撃側がHP回復
    if (attacker && attacker.ability === 'lifesteal') {
      attacker.hp = Math.min(attacker.maxHp || attacker.pow * 2, attacker.hp + Math.ceil(reduced / 2));
    }
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
      case 'drain':
      case 'heal_self':
      case 'heal_lane': {
        if (id === 'growth') {
          card.pow += 1;
        } else if (id === 'regen') {
          slot[side].forEach(c => { if (c.uid !== card.uid) c.pow += 1; });
        } else if (id === 'drain') {
          slot[opp].forEach(c => c.pow = Math.max(0, c.pow - 1));
        } else if (id === 'heal_self') {
          card.hp = card.maxHp;
        } else if (id === 'heal_lane') {
          slot[side].forEach(c => { c.hp = Math.min(c.maxHp, c.hp + 3); });
        }
        break;
      }
      // ----- 新 onReveal -----
      case 'summon': {
        // 同レーンに 2POW/4HP のトークンを 召喚
        const maxSlots = slot.location.maxSlots || SLOTS_PER_LANE;
        if (slot[side].length < maxSlots) {
          slot[side].push({
            id: 'token', name: 'トークン', emoji: '✨',
            cost: 0, pow: 2, maxHp: 4, hp: 4,
            el: card.el || 'none', ability: 'none', abilityType: 'none',
            uid: nextUid(), _token: true,
          });
          G.log.push(`${card.name}: トークンを召喚`);
        }
        break;
      }
      case 'draw_2': {
        drawN(side, 2);
        G.log.push(`${card.name}: 2枚ドロー`);
        break;
      }
      case 'bounce_enemy': {
        // 同レーンの 最弱敵を 手札に戻す（敵の手札に）
        if (slot[opp].length) {
          let weakest = slot[opp][0];
          slot[opp].forEach(c => { if (c.pow < weakest.pow) weakest = c; });
          slot[opp] = slot[opp].filter(c => c.uid !== weakest.uid);
          if (G.hand[opp].length < HAND_MAX) {
            weakest.hp = weakest.maxHp;
            G.hand[opp].push(weakest);
          }
          G.log.push(`${card.name}: ${weakest.name} を手札に戻す`);
        }
        break;
      }
      case 'copy_strongest': {
        // 同レーン最強の味方の POW を コピー（自分以外）
        let strongest = null;
        slot[side].forEach(c => {
          if (c.uid === card.uid) return;
          if (!strongest || c.pow > strongest.pow) strongest = c;
        });
        if (strongest) {
          card.pow = strongest.pow;
          G.log.push(`${card.name}: ${strongest.name} の力 ${strongest.pow} をコピー`);
        }
        break;
      }
      case 'swap_lane': {
        // 同レーンの 自分以外の味方と 位置交換は 視覚的意味のみだが、
        // ロケーション効果が 切り替わる ケースで 戦略性が出る
        const others = slot[side].filter(c => c.uid !== card.uid);
        if (others.length) {
          // 他レーンへの シャッフル
          let best = lane, bestDiff = totals(lane).enemy - totals(lane).ally;
          if (side === 'enemy') bestDiff = -bestDiff;
          G.board.forEach((l, i) => {
            if (i === lane) return;
            const maxSlots = l.location.maxSlots || SLOTS_PER_LANE;
            if (l[side].length >= maxSlots) return;
            let diff = totals(i).enemy - totals(i).ally;
            if (side === 'enemy') diff = -diff;
            if (diff > bestDiff) { bestDiff = diff; best = i; }
          });
          if (best !== lane) {
            const idx = slot[side].findIndex(c => c.uid === card.uid);
            slot[side].splice(idx, 1);
            G.board[best][side].push(card);
            G.log.push(`${card.name}: レーン${best + 1}へワープ`);
          }
        }
        break;
      }
      case 'chain_buff': {
        // 同系統の味方 全レーン +2 POW
        let cnt = 0;
        G.board.forEach(l => l[side].forEach(c => {
          if (c.uid !== card.uid && c.family === card.family) { c.pow += 2; cnt++; }
        }));
        if (cnt) G.log.push(`${card.name}: 同系統 ${cnt}体を強化`);
        break;
      }
      case 'elemental_boost': {
        // 同属性の味方 +2 POW
        let cnt = 0;
        G.board.forEach(l => l[side].forEach(c => {
          if (c.uid !== card.uid && c.el === card.el && card.el !== 'none') {
            c.pow += 2; cnt++;
          }
        }));
        if (cnt) G.log.push(`${card.name}: 同属性 ${cnt}体を強化`);
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
    // death_curse: 同レーンの 敵全体 HP -5
    if (card.ability === 'death_curse') {
      const opp = side === 'ally' ? 'enemy' : 'ally';
      G.board[lane][opp].forEach(c => { c.hp = Math.max(0, c.hp - 5); });
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
    // berserker: HP半分以下で +3 POW
    if (card.ability === 'berserker' && card.maxHp && card.hp <= card.maxHp / 2) {
      pow += 3;
    }
    return Math.max(0, pow);
  }

  function totals(laneIdx) {
    const slot = G.board[laneIdx];
    const sum = (side) => slot[side].reduce((s, c) => s + effectivePow(c, laneIdx, side), 0);
    return { ally: sum('ally'), enemy: sum('enemy') };
  }

  /* ----- Snap! 宣言（ベット倍率を 2倍に） -----
   * 各陣営とも 1試合に 1回だけ宣言可能。最大 bet = 4（双方が 1回ずつ）。
   * 宣言可能ターン: 1〜5（ターン6 = 最終公開なので 宣言不可）。
   */
  function declareSnap(side) {
    if (!G || G.over) return { ok: false, msg: 'ゲーム終了済み' };
    if (G.snapped[side]) return { ok: false, msg: 'すでに Snap 宣言済み' };
    if (G.turn >= MAX_TURN) return { ok: false, msg: '最終ターンは Snap 不可' };
    G.snapped[side] = true;
    G.bet *= 2;
    G.log.push(`${side === 'ally' ? '★ あなた' : '◆ あいて'} が Snap！ ベット倍率 ${G.bet}倍`);
    return { ok: true, bet: G.bet };
  }

  /* ----- おりる（敵の Snap 後、プレイヤーが 撤退できる） -----
   * ベットの 半分の 損失で 試合終了。
   */
  function retreat() {
    if (!G || G.over) return { ok: false };
    G.over = true;
    G.retreated = true;
    G.result = 'retreat';
    G.bet = Math.max(1, G.bet / 2);   // おりたら 半額損失
    G.log.push(`★ あなた が おりた（損失 ${G.bet}倍）`);
    return { ok: true };
  }

  /* ----- CPU が Snap 宣言すべきか 評価 -----
   * 簡易: 自陣の 想定勝ちレーン数 + ロケーション相性 + ターン数
   */
  function cpuShouldSnap() {
    if (G.snapped.enemy) return false;
    if (G.turn < 3 || G.turn >= MAX_TURN) return false;
    let winningLanes = 0, totalDiff = 0;
    G.board.forEach((slot, i) => {
      const t = totals(i);
      if (t.enemy > t.ally) winningLanes++;
      totalDiff += t.enemy - t.ally;
    });
    // 2レーン以上 勝っていて、総POW 差が +5 以上で 宣言
    return winningLanes >= 2 && totalDiff >= 5;
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
    // ベット倍率を 反映したランクポイント変動
    const baseDelta = G.result === 'win' ? 10 : G.result === 'lose' ? -10 : 0;
    G.rankDelta = Math.round(baseDelta * G.bet);
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

  // retreat 後のランクポイント計算
  function applyRetreatPenalty() {
    G.rankDelta = Math.round(-5 * G.bet);
    G.allyLanes = 0; G.enemyLanes = 0;
  }

  return {
    MAX_TURN, HAND_MAX, INITIAL_HAND, SLOTS_PER_LANE, SWAP_FEE, HP_PER_POW,
    start, state, play, unplay, withdraw, endTurn,
    attack, finishCombat, planCpuAttacks, endOfRoundCleanup,
    declareSnap, retreat, cpuShouldSnap, applyRetreatPenalty,
    effectivePow, totals, destroyCard,
  };
})();
