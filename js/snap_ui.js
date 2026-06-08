/* =========================================================================
 *  snap_ui.js  —  モンスター・スナップ UI
 *
 *  画面構成（縦持ちスマホ最適化）:
 *    上:    ターン/エネルギー/Snap
 *    中央: 3レーン（横並び、各レーンに enemy/ally スロット）
 *    下:   手札 ＋ End Turn ボタン
 * =======================================================================*/
const SnapUI = (() => {
  let root, selectedCard = null;
  let selectedAttacker = null;     // 攻撃フェーズで選択中の 味方カード
  let onExit = null;
  let opponentName = 'CPU';
  let mode = 'cpu';   // 'cpu' | 'online'

  function start(opts) {
    onExit = opts && opts.onExit;
    root = document.getElementById('screen');
    const allyDeck = (opts && opts.deck) || SnapData.starterDeck();
    const enemyDeck = (opts && opts.enemyDeck) || makeEnemyDeck();
    opponentName = (opts && opts.opponentName) || 'CPU';
    mode = (opts && opts.mode) || 'cpu';
    SnapEngine.start(allyDeck, enemyDeck);
    render();
  }

  function makeEnemyDeck() {
    // CPU 用の標準デッキ（スターター + 強カード）
    return [
      'sla1', 'bea1', 'bir1', 'cat1', 'mus1', 'pla1',
      'sla2', 'dra1', 'bea2', 'lig2',
      'dra2', 'dev1',
    ];
  }

  function render() {
    const G = SnapEngine.state();
    if (!G) return;
    if (G.over) { renderResult(); return; }

    const usedEnergy = G.pending.ally.reduce((s, p) => s + p.card.cost, 0) + (G.extraCost.ally || 0);
    const remaining = G.energy.ally - usedEnergy;
    const inAttack = G.phase === 'attack';

    // Snap! ボタンの 状態判定（deploy フェーズのみ）
    const canPlayerSnap = !G.snapped.ally && G.turn < SnapEngine.MAX_TURN && !inAttack;
    const snapBtn = canPlayerSnap
      ? `<button class="snap-snap-btn" data-act="snapSnap" title="ベットを2倍">Snap!</button>`
      : `<span class="snap-bet">×${G.bet}</span>`;

    // 敵が Snap 宣言済みで まだ プレイヤーが おりていない時、撤退ボタン
    const retreatBtn = (G.snapped.enemy && !G.snapped.ally && G.turn < SnapEngine.MAX_TURN && !inAttack)
      ? `<button class="snap-retreat" data-act="snapRetreat" title="半額損失で撤退">おりる</button>`
      : '';

    // 攻撃 残数
    const attackable = countAttackable();

    // フッターボタン
    let footBtn;
    if (inAttack) {
      footBtn = `<button class="snap-end-btn battle" data-act="snapFinishCombat">
        ⚔ 戦闘終了 ${attackable > 0 ? `(残り ${attackable})` : ''}
      </button>`;
    } else {
      footBtn = `<button class="snap-end-btn ${G.pending.ally.length === 0 ? 'pass' : ''}" data-act="snapEndTurn">
        ${G.pending.ally.length === 0 ? '⏭ パス' : '▶ 公開 (' + G.pending.ally.length + '枚)'}
      </button>`;
    }

    // フェーズ表示
    const phaseLabel = inAttack
      ? '<span class="phase-tag attack">⚔ 戦闘フェーズ</span>'
      : '<span class="phase-tag deploy">🎴 配置フェーズ</span>';

    root.innerHTML = `
      <div class="snap-screen ${inAttack ? 'phase-attack' : 'phase-deploy'}">
        <div class="snap-top">
          <button class="snap-back" data-act="snapExit">←</button>
          <div class="snap-info">
            <span class="snap-turn">T ${G.turn}/${SnapEngine.MAX_TURN}</span>
            ${inAttack
              ? ''
              : `<span class="snap-energy" title="エネルギー">⚡ <b>${remaining}</b>/${G.energy.ally}</span>`}
            <span class="snap-bet-info" title="ベット倍率">💰 ×${G.bet}</span>
          </div>
          ${retreatBtn}
          ${snapBtn}
        </div>

        <div class="phase-bar">${phaseLabel}
          ${inAttack && selectedAttacker
            ? `<span class="phase-hint">👉 同レーンの 敵を タップ</span>`
            : inAttack
            ? `<span class="phase-hint">⚔ 攻撃する 味方カードを タップ</span>`
            : `<span class="phase-hint">手札 → レーン に カードを 配置</span>`}
        </div>

        <div class="snap-board">
          ${renderLanes()}
        </div>

        <div class="snap-log">
          ${G.log.slice(-3).map(l => `<div>${l}</div>`).join('')}
        </div>

        ${inAttack ? '' : `<div class="snap-hand">${renderHand()}</div>`}

        <div class="snap-foot">
          ${footBtn}
        </div>
      </div>
    `;
  }

  // 攻撃可能な 味方カード数
  function countAttackable() {
    const G = SnapEngine.state();
    if (!G || G.phase !== 'attack') return 0;
    let count = 0;
    G.board.forEach((slot, i) => {
      if (!slot.enemy.length) return;   // 敵が いない レーンは 攻撃対象なし
      slot.ally.forEach(c => { if (!c.attacked && c.hp > 0) count++; });
    });
    return count;
  }

  function renderLanes() {
    const G = SnapEngine.state();
    // 縦積み（vertical stack）でレーンを表示。各レーンが 横長 ストリップ。
    return G.board.map((lane, idx) => {
      const tot = SnapEngine.totals(idx);
      const lead = tot.ally > tot.enemy ? 'ally' : tot.enemy > tot.ally ? 'enemy' : '';
      const loc = lane.location;
      const locDisp = lane.locationRevealed
        ? `<div class="lane-loc"><span class="lane-loc-name">${loc.name}</span> <small>${loc.desc}</small></div>`
        : `<div class="lane-loc dim">???</div>`;
      return `
        <div class="lane-strip" data-lane="${idx}">
          <div class="lane-bar">
            <span class="lane-no">L${idx + 1}</span>
            ${locDisp}
            <span class="lane-pow ${lead === 'enemy' ? 'enemy-lead' : ''}" title="敵POW">敵 ${tot.enemy}</span>
            <span class="lane-pow ${lead === 'ally' ? 'ally-lead' : ''}" title="味方POW">★ ${tot.ally}</span>
          </div>
          <div class="lane-rows">
            <div class="lane-row enemy">${renderSlots(lane, 'enemy', idx)}</div>
            <div class="lane-row ally">${renderSlots(lane, 'ally', idx, true)}</div>
          </div>
        </div>`;
    }).join('');
  }

  function renderSlots(lane, side, laneIdx, playable = false) {
    const G = SnapEngine.state();
    const inAttack = G.phase === 'attack';
    const maxSlots = lane.location.maxSlots || SnapEngine.SLOTS_PER_LANE;
    const placed = lane[side];
    // pending (味方のみ、deploy フェーズ中のみ表示)
    const pendings = (side === 'ally' && !inAttack)
      ? G.pending.ally.filter(p => p.lane === laneIdx)
      : [];
    const cards = [...placed, ...pendings.map(p => ({ ...p.card, _pending: true }))];

    let html = '';
    for (let i = 0; i < maxSlots; i++) {
      const c = cards[i];
      if (c) {
        html += renderCard(c, { side, lane: laneIdx, pending: c._pending });
      } else {
        // 空スロット
        // 攻撃フェーズでは ドロップ目標に ならない
        const dropAttr = (!inAttack && playable && selectedCard)
          ? `data-act="snapDrop" data-lane="${laneIdx}"` : '';
        const targetCls = (!inAttack && selectedCard) ? 'target' : '';
        html += `<div class="snap-slot empty ${targetCls}" ${dropAttr}>+</div>`;
      }
    }
    return html;
  }

  function renderCard(c, opts) {
    const G = SnapEngine.state();
    const inAttack = G.phase === 'attack';
    const pendingCls = opts.pending ? ' pending' : '';
    const sideCls = opts.side === 'enemy' ? ' enemy-side' : '';
    const justCls = (G.justRevealed || []).includes(c.uid) ? ' just-revealed' : '';
    const el = c.el || 'none';
    const pow = opts.lane != null
      ? SnapEngine.effectivePow(c, opts.lane, opts.side)
      : c.pow;
    const art = typeof Art !== 'undefined'
      ? Art.imgTag(c.id, c.emoji, { cls: 'snap-card-art' })
      : `<span class="snap-card-art-emoji">${c.emoji}</span>`;

    // 行動の 振り分け
    let act = '';
    let extraCls = '';
    if (opts.pending) {
      act = `data-act="snapUnplay" data-uid="${c.uid}"`;
    } else if (inAttack) {
      // 攻撃フェーズ
      const enemyHasCards = G.board[opts.lane].enemy.length > 0;
      if (opts.side === 'ally' && !c.attacked && c.hp > 0 && enemyHasCards) {
        act = `data-act="snapAttackPick" data-uid="${c.uid}"`;
        extraCls += ' attack-ready';
        if (selectedAttacker && selectedAttacker.uid === c.uid) extraCls += ' attack-selected';
      } else if (opts.side === 'ally' && c.attacked) {
        extraCls += ' attacked';
      } else if (opts.side === 'enemy' && selectedAttacker
                 && selectedAttacker.lane === opts.lane && c.hp > 0) {
        // 攻撃可能な ターゲット
        act = `data-act="snapAttackTarget" data-uid="${c.uid}"`;
        extraCls += ' attack-target';
      }
    } else if (opts.side === 'ally' && !c._token) {
      // deploy フェーズ: ホットスワップ
      act = `data-act="snapWithdraw" data-uid="${c.uid}"`;
    }

    // HP バー
    const maxHp = c.maxHp || (c.pow * 2);
    const hp = c.hp != null ? c.hp : maxHp;
    const hpPct = Math.max(0, Math.min(100, (hp / Math.max(1, maxHp)) * 100));
    const hpCls = hpPct < 35 ? 'low' : hpPct < 70 ? 'mid' : 'ok';
    const hurt = c._lastHp != null && c._lastHp > hp ? ' hurt' : '';
    c._lastHp = hp;
    return `
      <div class="snap-card lane-card${pendingCls}${sideCls}${justCls}${hurt}${extraCls}" data-el="${el}" ${act}>
        <div class="snap-card-cost">${c.cost}</div>
        <div class="snap-card-pow">${pow}</div>
        <div class="snap-card-art-wrap">${art}</div>
        <div class="snap-card-name">${c.name}</div>
        <div class="snap-card-hp">
          <span class="hp-bar ${hpCls}" style="width:${hpPct}%"></span>
          <span class="hp-text">${hp}/${maxHp}</span>
        </div>
      </div>
    `;
  }

  function renderHand() {
    const G = SnapEngine.state();
    const usedEnergy = G.pending.ally.reduce((s, p) => s + p.card.cost, 0) + (G.extraCost.ally || 0);
    const remaining = G.energy.ally - usedEnergy;
    const cards = G.hand.ally.map(c => {
      const playable = c.cost <= remaining;
      const sel = selectedCard && c.uid === selectedCard.uid;
      const act = playable ? `data-act="snapPick" data-uid="${c.uid}"` : '';
      const cls = ['snap-card', 'in-hand'];
      if (!playable) cls.push('disabled');
      if (sel) cls.push('selected');
      const el = c.el || 'none';
      const art = typeof Art !== 'undefined'
        ? Art.imgTag(c.id, c.emoji, { cls: 'snap-card-art' })
        : `<span class="snap-card-art-emoji">${c.emoji}</span>`;
      return `
        <div class="${cls.join(' ')}" data-el="${el}" ${act}>
          <div class="snap-card-cost">${c.cost}</div>
          <div class="snap-card-pow">${c.pow}</div>
          <div class="snap-card-art-wrap">${art}</div>
          <div class="snap-card-name">${c.name}</div>
          ${c.abilityText ? `<div class="snap-card-ability">${c.abilityText}</div>` : ''}
        </div>`;
    }).join('');
    return cards || '<div class="snap-no-hand">手札が ない</div>';
  }

  function renderResult() {
    const G = SnapEngine.state();
    const win = G.result === 'win';
    const tie = G.result === 'tie';
    const retreated = G.result === 'retreat';
    let title;
    if (retreated) title = '🏳 撤退';
    else if (win) title = '🎉 勝利！';
    else if (tie) title = '🤝 引き分け';
    else title = '😢 敗北';
    const lanes = retreated ? '— : —' : `${G.allyLanes || 0} - ${G.enemyLanes || 0}`;
    let laneDetail = G.board.map((slot, i) => {
      let aPow = slot.ally.reduce((s, c) => s + SnapEngine.effectivePow(c, i, 'ally'), 0);
      let ePow = slot.enemy.reduce((s, c) => s + SnapEngine.effectivePow(c, i, 'enemy'), 0);
      const lead = aPow > ePow ? '★味方' : ePow > aPow ? '◆敵' : '=互角';
      return `<div class="snap-result-lane">レーン${i + 1} (${slot.location.name}): 味方${aPow} vs 敵${ePow} ${lead}</div>`;
    }).join('');
    const delta = G.rankDelta || 0;
    const deltaStr = delta > 0 ? `+${delta}` : `${delta}`;
    const deltaCls = delta > 0 ? 'win' : delta < 0 ? 'lose' : 'tie';
    const newRank = State.data?.snapRank || 0;
    root.innerHTML = `
      <div class="snap-screen snap-result">
        <h1 class="${win ? 'win' : (retreated || !tie) ? 'lose' : 'tie'}">${title}</h1>
        <div class="snap-result-lanes">取得レーン: ${lanes}</div>
        <div class="snap-result-bet">
          ベット ×${G.bet} ／ ランクポイント <span class="${deltaCls}">${deltaStr}</span>（合計 ${newRank}）
        </div>
        <div class="snap-result-detail">${laneDetail}</div>
        <div class="snap-result-actions">
          <button class="btn primary wide" data-act="snapRestart">▶ もう一度</button>
          <button class="btn wide" data-act="snapExit">タイトルへ</button>
        </div>
      </div>
    `;
    if (typeof SoundFX !== 'undefined') {
      SoundFX.sfx(win ? 'win' : tie ? 'menu' : 'lose');
    }
  }

  /* ====== アクション ====== */
  function pickCard(uid) {
    const G = SnapEngine.state();
    const c = G.hand.ally.find(c => c.uid === uid);
    if (!c) return;
    if (selectedCard && selectedCard.uid === uid) {
      selectedCard = null;
    } else {
      selectedCard = c;
    }
    if (typeof SoundFX !== 'undefined') SoundFX.sfx('select');
    render();
  }
  function dropOn(laneIdx) {
    if (!selectedCard) return;
    const res = SnapEngine.play('ally', selectedCard.uid, laneIdx);
    if (!res.ok) {
      if (typeof SoundFX !== 'undefined') SoundFX.sfx('cancel');
      // 軽く揺らす演出（将来）
      console.warn(res.msg);
      return;
    }
    selectedCard = null;
    if (typeof SoundFX !== 'undefined') SoundFX.sfx('click');
    render();
  }
  function unplayCard(uid) {
    SnapEngine.unplay('ally', uid);
    if (typeof SoundFX !== 'undefined') SoundFX.sfx('cancel');
    render();
  }

  function withdrawCard(uid) {
    // すでに公開済みの自分のカードを 手札に戻す（1エネルギー）
    if (!window.confirm(`このカードを 手札に戻しますか？\nコスト: ${SnapEngine.SWAP_FEE}⚡`)) return;
    const res = SnapEngine.withdraw('ally', uid);
    if (!res.ok) {
      if (typeof SoundFX !== 'undefined') SoundFX.sfx('cancel');
      if (res.msg) alert(res.msg);
      return;
    }
    if (typeof SoundFX !== 'undefined') SoundFX.sfx('cancel');
    render();
  }
  function endTurn() {
    // 配置フェーズ → 公開 → 攻撃フェーズへ
    const G = SnapEngine.state();
    const cpuSnappedBefore = G.snapped.enemy;
    SnapCPU.takeTurn(G);
    const cpuJustSnapped = G.snapped.enemy && !cpuSnappedBefore;
    SnapEngine.endTurn();
    selectedCard = null;
    selectedAttacker = null;
    if (typeof SoundFX !== 'undefined') SoundFX.sfx(cpuJustSnapped ? 'crit' : 'buff');
    if (G.over) recordResult(G);
    render();
    // CPU Snap バナー
    if (cpuJustSnapped) {
      showSnapBanner(`💰 あいて Snap！ ×${G.bet}`);
      setTimeout(() => alertCpuSnap(G), 600);
    }
  }

  function pickAttacker(uid) {
    const G = SnapEngine.state();
    if (!G || G.phase !== 'attack') return;
    let target = null, targetLane = -1;
    G.board.forEach((slot, i) => {
      const c = slot.ally.find(x => x.uid === uid);
      if (c) { target = c; targetLane = i; }
    });
    if (!target) return;
    if (target.attacked || target.hp <= 0) return;
    if (selectedAttacker && selectedAttacker.uid === uid) {
      selectedAttacker = null;   // トグル
    } else {
      selectedAttacker = { uid, lane: targetLane };
    }
    if (typeof SoundFX !== 'undefined') SoundFX.sfx('select');
    render();
  }

  function attackTarget(uid) {
    const G = SnapEngine.state();
    if (!G || G.phase !== 'attack' || !selectedAttacker) return;
    const res = SnapEngine.attack('ally', selectedAttacker.uid, +uid);
    if (!res.ok) {
      if (typeof SoundFX !== 'undefined') SoundFX.sfx('cancel');
      if (res.msg) console.warn(res.msg);
      return;
    }
    selectedAttacker = null;
    if (typeof SoundFX !== 'undefined') SoundFX.sfx('crit');
    flashBattle();
    render();
  }

  function finishCombat() {
    const G = SnapEngine.state();
    if (!G || G.phase !== 'attack') return;
    const turnBefore = G.turn;
    SnapEngine.finishCombat();
    selectedAttacker = null;
    if (typeof SoundFX !== 'undefined') SoundFX.sfx('buff');
    if (G.over) recordResult(G);
    render();
    // ターン切替バナー
    if (G.turn > turnBefore && !G.over) {
      showTurnBanner(G.turn);
    }
    // バトルがあった場合の フラッシュ
    if ((G.log || []).slice(-8).some(l => l.includes('DMG'))) {
      flashBattle();
    }
  }

  /* ===== 演出 ===== */
  function showTurnBanner(turn) {
    const old = document.querySelector('.snap-banner.turn');
    if (old) old.remove();
    const b = document.createElement('div');
    b.className = 'snap-banner turn';
    b.innerHTML = `<span class="banner-num">ターン ${turn}</span><small>/ ${SnapEngine.MAX_TURN}</small>`;
    document.body.appendChild(b);
    setTimeout(() => b.classList.add('show'), 10);
    setTimeout(() => b.classList.add('hide'), 900);
    setTimeout(() => b.remove(), 1400);
  }
  function showSnapBanner(text) {
    const b = document.createElement('div');
    b.className = 'snap-banner snap';
    b.textContent = text;
    document.body.appendChild(b);
    setTimeout(() => b.classList.add('show'), 10);
    setTimeout(() => b.classList.add('hide'), 1100);
    setTimeout(() => b.remove(), 1600);
  }
  function flashBattle() {
    document.body.classList.add('battle-flash');
    setTimeout(() => document.body.classList.remove('battle-flash'), 400);
  }

  function alertCpuSnap(G) {
    // ブラウザ標準ダイアログで案内（モバイル互換性が 高い）
    const cont = window.confirm(
      `💰 あいてが Snap！ ベット ×${G.bet} に。\n\n` +
      `OK = 続行 / キャンセル = おりる（損失 半額）`
    );
    if (!cont) {
      SnapEngine.retreat();
      SnapEngine.applyRetreatPenalty();
      recordResult(SnapEngine.state());
      render();
    }
  }
  function restart() {
    selectedCard = null;
    selectedAttacker = null;
    start({ onExit, mode, opponentName });
  }
  function exit() {
    selectedCard = null;
    selectedAttacker = null;
    if (typeof onExit === 'function') onExit();
  }
  function snap() {
    const G = SnapEngine.state();
    if (!G || G.over) return;
    const res = SnapEngine.declareSnap('ally');
    if (!res.ok) {
      if (typeof SoundFX !== 'undefined') SoundFX.sfx('cancel');
      return;
    }
    if (typeof SoundFX !== 'undefined') SoundFX.sfx('crit');
    showSnapBanner(`💰 Snap！ ×${G.bet}`);
    render();
  }
  function retreat() {
    const G = SnapEngine.state();
    if (!G || G.over) return;
    if (!window.confirm(`おりますか？\n損失 ×${Math.max(1, G.bet / 2)} のランクポイント減。`)) return;
    SnapEngine.retreat();
    SnapEngine.applyRetreatPenalty();
    recordResult(SnapEngine.state());
    if (typeof SoundFX !== 'undefined') SoundFX.sfx('cancel');
    render();
  }

  // 勝敗を State に記録（snapWins / snapRank）
  function recordResult(G) {
    if (!State || !State.data) return;
    if (G.result === 'win') {
      State.data.snapWins = (State.data.snapWins || 0) + 1;
    } else if (G.result === 'lose') {
      State.data.snapLoses = (State.data.snapLoses || 0) + 1;
    }
    State.data.snapRank = Math.max(0, (State.data.snapRank || 0) + (G.rankDelta || 0));
    State.save();
  }

  return {
    start, render, restart, exit,
    pickCard, dropOn, unplayCard, withdrawCard, endTurn,
    pickAttacker, attackTarget, finishCombat,
    snap, retreat,
  };
})();
