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

    const usedEnergy = G.pending.ally.reduce((s, p) => s + p.card.cost, 0);
    const remaining = G.energy.ally - usedEnergy;

    // Snap! ボタンの 状態判定
    const canPlayerSnap = !G.snapped.ally && G.turn < SnapEngine.MAX_TURN;
    const snapBtn = canPlayerSnap
      ? `<button class="snap-snap-btn" data-act="snapSnap" title="ベットを2倍">Snap!</button>`
      : `<span class="snap-bet">×${G.bet}</span>`;

    // 敵が Snap 宣言済みで まだ プレイヤーが おりていない時、撤退ボタン
    const retreatBtn = (G.snapped.enemy && !G.snapped.ally && G.turn < SnapEngine.MAX_TURN)
      ? `<button class="snap-retreat" data-act="snapRetreat" title="半額損失で撤退">おりる</button>`
      : '';

    root.innerHTML = `
      <div class="snap-screen">
        <div class="snap-top">
          <button class="snap-back" data-act="snapExit">←</button>
          <div class="snap-info">
            <span class="snap-turn">T ${G.turn}/${SnapEngine.MAX_TURN}</span>
            <span class="snap-energy" title="エネルギー">
              ⚡ <b>${remaining}</b>/${G.energy.ally}
            </span>
            <span class="snap-bet-info" title="ベット倍率">💰 ×${G.bet}</span>
          </div>
          ${retreatBtn}
          ${snapBtn}
        </div>

        <div class="snap-board">
          ${renderLanes()}
        </div>

        <div class="snap-log">
          ${G.log.slice(-3).map(l => `<div>${l}</div>`).join('')}
        </div>

        <div class="snap-hand">
          ${renderHand()}
        </div>

        <div class="snap-foot">
          <button class="snap-end-btn ${G.pending.ally.length === 0 ? 'pass' : ''}" data-act="snapEndTurn">
            ${G.pending.ally.length === 0 ? '⏭ パス' : '✅ 確定 (' + G.pending.ally.length + '枚)'}
          </button>
        </div>
      </div>
    `;
  }

  function renderLanes() {
    const G = SnapEngine.state();
    return G.board.map((lane, idx) => {
      const tot = SnapEngine.totals(idx);
      const lead = tot.ally > tot.enemy ? 'ally' : tot.enemy > tot.ally ? 'enemy' : '';
      const loc = lane.location;
      const locDisp = lane.locationRevealed
        ? `<div class="snap-loc"><b>${loc.name}</b><br><small>${loc.desc}</small></div>`
        : `<div class="snap-loc dim"><b>???</b></div>`;
      return `
        <div class="snap-lane">
          <div class="snap-lane-head">
            <span class="snap-lane-no">レーン ${idx + 1}</span>
            <span class="snap-pow ${lead === 'enemy' ? 'lead' : ''}" title="相手POW">${tot.enemy}</span>
          </div>
          <div class="snap-row enemy">
            ${renderSlots(lane, 'enemy', idx)}
          </div>
          ${locDisp}
          <div class="snap-row ally">
            ${renderSlots(lane, 'ally', idx, true)}
          </div>
          <div class="snap-lane-head bottom">
            <span class="snap-lane-no">あなた</span>
            <span class="snap-pow ${lead === 'ally' ? 'lead' : ''}" title="自分POW">${tot.ally}</span>
          </div>
        </div>`;
    }).join('');
  }

  function renderSlots(lane, side, laneIdx, playable = false) {
    const G = SnapEngine.state();
    const maxSlots = lane.location.maxSlots || SnapEngine.SLOTS_PER_LANE;
    const placed = lane[side];
    // pending (味方のみ)
    const pendings = side === 'ally'
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
        const dropAttr = (playable && selectedCard) ? `data-act="snapDrop" data-lane="${laneIdx}"` : '';
        html += `<div class="snap-slot empty ${selectedCard ? 'target' : ''}" ${dropAttr}>+</div>`;
      }
    }
    return html;
  }

  function renderCard(c, opts) {
    const pendingCls = opts.pending ? ' pending' : '';
    const sideCls = opts.side === 'enemy' ? ' enemy-side' : '';
    const el = c.el || 'none';
    const pow = opts.lane != null
      ? SnapEngine.effectivePow(c, opts.lane, opts.side)
      : c.pow;
    const art = typeof Art !== 'undefined'
      ? Art.imgTag(c.id, c.emoji, { cls: 'snap-card-art' })
      : `<span class="snap-card-art-emoji">${c.emoji}</span>`;
    const act = opts.pending ? `data-act="snapUnplay" data-uid="${c.uid}"` : '';
    return `
      <div class="snap-card${pendingCls}${sideCls}" data-el="${el}" ${act}>
        <div class="snap-card-cost">${c.cost}</div>
        <div class="snap-card-pow">${pow}</div>
        <div class="snap-card-art-wrap">${art}</div>
        <div class="snap-card-name">${c.name}</div>
      </div>
    `;
  }

  function renderHand() {
    const G = SnapEngine.state();
    const usedEnergy = G.pending.ally.reduce((s, p) => s + p.card.cost, 0);
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
  function endTurn() {
    // CPU の手を 決定（中で CPU 側 Snap も判定）
    const G = SnapEngine.state();
    const cpuSnappedBefore = G.snapped.enemy;
    SnapCPU.takeTurn(G);
    const cpuJustSnapped = G.snapped.enemy && !cpuSnappedBefore;
    // 同時公開
    SnapEngine.endTurn();
    selectedCard = null;
    if (typeof SoundFX !== 'undefined') SoundFX.sfx(cpuJustSnapped ? 'crit' : 'buff');
    // 試合終了時は 勝敗を 記録
    if (G.over) recordResult(G);
    render();
    // CPU が Snap した瞬間は、撤退案内モーダルを 一度だけ 表示
    if (cpuJustSnapped && !G.over && G.turn < SnapEngine.MAX_TURN) {
      setTimeout(() => alertCpuSnap(G), 50);
    }
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
    start({ onExit, mode, opponentName });
  }
  function exit() {
    selectedCard = null;
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
    pickCard, dropOn, unplayCard, endTurn, snap, retreat,
  };
})();
