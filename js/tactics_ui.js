/* =========================================================================
 *  tactics_ui.js  —  モンスター・タクティクス UI (ミニマル版)
 *
 *  画面構成（縦持ち スマホ最適化）:
 *    上:    敵情報（HP合計, ハンド数, デッキ数）
 *    中央: 6×6 盤面
 *    下:    自分情報 + 手札（モンスター / 魔法）+ 行動ボタン
 *
 *  操作:
 *    - 手札カード タップ → 選択
 *    - 自陣マス タップ → 召喚（モンスター選択時）
 *    - 魔法発動 → 対象選択（必要なら）
 *    - 場のピース タップ → 移動/攻撃 モード
 *    - エンドターン ボタン
 * =======================================================================*/
const TacticsUI = (() => {
  let root;
  let onExit = null;
  let selected = null;   // { kind: 'hand'|'magic'|'piece', uid, card?, piece? }
  let pendingMagic = null;   // { magicUid, needsTarget: 'piece' | 'cell' | 'lane' }
  let _cpuBusy = false;

  function start(opts = {}) {
    onExit = opts.onExit || null;
    root = document.getElementById('screen');
    // 保存済み ツインデッキを 優先 利用
    const savedMon = State.data && State.data.tacticsMonsterDeck;
    const savedMag = State.data && State.data.tacticsMagicDeck;
    TacticsEngine.start({
      allyMonsterDeck:  opts.allyMonsterDeck
        || (Array.isArray(savedMon) && savedMon.length === 12 ? savedMon : TacticsData.starterMonsterDeck()),
      enemyMonsterDeck: opts.enemyMonsterDeck || TacticsData.starterMonsterDeck(),
      allyMagicDeck:    opts.allyMagicDeck
        || (Array.isArray(savedMag) && savedMag.length === 6 ? savedMag : TacticsData.starterMagicDeck()),
      enemyMagicDeck:   opts.enemyMagicDeck   || TacticsData.starterMagicDeck(),
    });
    selected = null;
    pendingMagic = null;
    _cpuBusy = false;
    render();
  }

  /* ============ 描画 ============ */
  function render() {
    const G = TacticsEngine.state();
    if (!G) return;
    if (G.over) { renderResult(); return; }

    root.innerHTML = `
      <div class="tac-screen ${G.whose === 'enemy' ? 'enemy-turn' : ''}">
        <div class="tac-top">
          <button class="tac-back" data-act="tacExit">←</button>
          <div class="tac-info">
            <span class="tac-turn">T ${G.turn}</span>
            <span class="tac-whose ${G.whose}">${G.whose === 'ally' ? '★あなた' : '◆あいて'}</span>
            <span class="tac-energy">⚡<b>${G.energy[G.whose]}</b></span>
          </div>
          <button class="tac-end ${G.whose === 'ally' ? '' : 'disabled'}"
                  data-act="tacEndTurn"
                  ${G.whose === 'ally' ? '' : 'disabled'}>
            ${G.whose === 'ally' ? 'ターン終了' : '相手の番…'}
          </button>
        </div>

        <div class="tac-enemy-info">
          <span>◆ ハンド ${G.monsterHand.enemy.length}/${TacticsEngine.HAND_MAX}</span>
          <span>📦 残${G.monsterDeck.enemy.length}</span>
          <span>🪄 ${G.magicHand.enemy.length}</span>
          ${G.pendingReactions.enemy.length > 0
            ? `<span class="tac-trap">🪤×${G.pendingReactions.enemy.length}</span>` : ''}
        </div>

        <div class="tac-board">
          ${renderBoard()}
        </div>

        <div class="tac-ally-info">
          <span>📦 残${G.monsterDeck.ally.length}</span>
          ${G.pendingReactions.ally.length > 0
            ? `<span class="tac-trap">🪤×${G.pendingReactions.ally.length}</span>` : ''}
          ${G.preCombat.ally
            ? `<span class="tac-mod">⚔ 戦闘前 mod</span>` : ''}
        </div>

        <div class="tac-log">${(G.log.slice(-2).join(' / ')) || '&nbsp;'}</div>

        <div class="tac-hand-section">
          <div class="tac-hand-label">モンスター (${G.monsterHand.ally.length})</div>
          <div class="tac-hand">${renderMonsterHand()}</div>
        </div>
        <div class="tac-hand-section">
          <div class="tac-hand-label">魔法 (${G.magicHand.ally.length})</div>
          <div class="tac-magic-hand">${renderMagicHand()}</div>
        </div>

        ${pendingMagic ? renderPendingMagicPrompt() : ''}
      </div>
    `;
  }

  function renderBoard() {
    const G = TacticsEngine.state();
    let html = '';
    for (let y = 0; y < TacticsEngine.BOARD_H; y++) {
      html += '<div class="tac-row">';
      for (let x = 0; x < TacticsEngine.BOARD_W; x++) {
        const piece = G.board[y][x];
        const cls = [];
        if (y <= 1) cls.push('enemy-zone');
        else if (y >= 4) cls.push('ally-zone');
        if (selected && selected.kind === 'piece') {
          // 移動 / 攻撃 候補
          const p = selected.piece;
          if (p) {
            const dist = Math.max(Math.abs(p.x - x), Math.abs(p.y - y));
            if (!piece && !p.moved && dist <= TacticsEngine.effectiveMov(p)) {
              cls.push('move-target');
            }
            if (piece && piece.owner !== p.owner && !p.attacked
                && dist <= TacticsEngine.effectiveRng(p)) {
              cls.push('attack-target');
            }
          }
        }
        if (selected && selected.kind === 'hand') {
          // 召喚 候補
          if (!piece && TacticsEngine.STARTING_ROWS.ally.includes(y)) {
            cls.push('summon-target');
          }
        }
        if (pendingMagic && pendingMagic.needsTarget === 'cell' && !piece) {
          cls.push('magic-cell-target');
        }
        const isSel = selected && selected.kind === 'piece' && piece && selected.uid === piece.uid;
        if (isSel) cls.push('piece-selected');

        html += `<div class="tac-cell ${cls.join(' ')}"
                      data-act="tacCellTap" data-x="${x}" data-y="${y}">
          ${piece ? renderPiece(piece) : ''}
        </div>`;
      }
      html += '</div>';
    }
    return html;
  }

  function renderPiece(p) {
    const ownerCls = p.owner === 'ally' ? 'ally' : 'enemy';
    const hpPct = Math.max(0, Math.min(100, (p.curHp / Math.max(1, p.maxHp)) * 100));
    const hpCls = hpPct < 35 ? 'low' : hpPct < 70 ? 'mid' : 'ok';
    const art = (typeof Art !== 'undefined')
      ? Art.imgTag(p.id, p.emoji, { cls: 'tac-piece-art' })
      : `<span class="tac-piece-emoji">${p.emoji}</span>`;
    return `
      <div class="tac-piece ${ownerCls}" data-el="${p.el || 'none'}">
        <div class="tac-piece-art-wrap">${art}</div>
        <div class="tac-piece-stats">
          <span class="tac-piece-atk">⚔${p.atk + (p.bonusAtk || 0)}</span>
          <span class="tac-piece-hp ${hpCls}">${p.curHp}</span>
        </div>
        ${p.skill && p.skill !== 'none'
          ? `<span class="tac-piece-skill" title="${p.skillText || ''}">${skillIcon(p.skill)}</span>` : ''}
      </div>`;
  }

  function skillIcon(s) {
    const map = {
      armor: '🛡', swift: '💨', longshot: '🏹', regenerate: '💚',
      aura_buff: '⬆', aura_debuff: '⬇',
      summon_token: '🥚', summon_draw: '🃏', summon_buff: '💪',
      pierce: '🗡', chain_sweep: '🌪', knockback: '👊', lifesteal: '🩸',
      counter: '↩', dodge: '💨',
      explode: '💥', revive: '🔄', death_curse: '☠',
      dimension_shift: '🌀', heal_self: '💗', rally_call: '📣',
    };
    return map[s] || '✨';
  }

  function renderMonsterHand() {
    const G = TacticsEngine.state();
    const energy = G.energy.ally;
    const cards = G.monsterHand.ally.map(c => {
      const playable = c.cost <= energy && G.whose === 'ally'
                       && TacticsEngine.piecesOf('ally').length < TacticsEngine.MAX_ON_BOARD;
      const sel = selected && selected.kind === 'hand' && selected.uid === c.uid;
      const cls = ['tac-card'];
      if (!playable) cls.push('disabled');
      if (sel) cls.push('selected');
      const art = (typeof Art !== 'undefined')
        ? Art.imgTag(c.id, c.emoji, { cls: 'tac-card-art' })
        : `<span class="tac-card-emoji">${c.emoji}</span>`;
      return `<div class="${cls.join(' ')}" data-el="${c.el || 'none'}"
                   data-act="tacHandTap" data-uid="${c.uid}">
        <div class="tac-card-cost">${c.cost}</div>
        <div class="tac-card-stats">⚔${c.atk}/${c.hp}❤</div>
        <div class="tac-card-art-wrap">${art}</div>
        <div class="tac-card-name">${c.name}</div>
      </div>`;
    });
    return cards.join('') || '<div class="tac-no-hand">手札なし</div>';
  }

  function renderMagicHand() {
    const G = TacticsEngine.state();
    const energy = G.energy.ally;
    const cards = G.magicHand.ally.map(m => {
      const playable = m.cost <= energy && G.whose === 'ally';
      const sel = pendingMagic && pendingMagic.magicUid === m.uid;
      const cls = ['tac-magic-card', `timing-${m.timing}`];
      if (!playable) cls.push('disabled');
      if (sel) cls.push('selected');
      return `<div class="${cls.join(' ')}"
                   data-act="tacMagicTap" data-uid="${m.uid}">
        <div class="tac-card-cost">${m.cost}</div>
        <div class="tac-magic-timing">${timingLabel(m.timing)}</div>
        <div class="tac-magic-name">${m.name}</div>
        <div class="tac-magic-text">${m.text || ''}</div>
      </div>`;
    });
    return cards.join('') || '<div class="tac-no-hand">魔法なし</div>';
  }

  function timingLabel(t) {
    return ({ start: '開始', preCombat: '戦闘前', reaction: '伏せ' })[t] || t;
  }

  function renderPendingMagicPrompt() {
    const G = TacticsEngine.state();
    const m = G.magicHand.ally.find(c => c.uid === pendingMagic.magicUid);
    if (!m) return '';
    return `
      <div class="tac-magic-prompt">
        <span>🪄 ${m.name}: ${pendingMagic.hint || '対象選択'}</span>
        <button data-act="tacCancelMagic">キャンセル</button>
      </div>
    `;
  }

  function renderResult() {
    const G = TacticsEngine.state();
    const win = G.winner === 'ally';
    root.innerHTML = `
      <div class="tac-screen tac-result">
        <h1 class="${win ? 'win' : 'lose'}">${win ? '🎉 勝利！' : '😢 敗北'}</h1>
        <div class="tac-result-detail">
          ターン: ${G.turn} <br>
          残ピース: 味方 ${TacticsEngine.piecesOf('ally').length} / 敵 ${TacticsEngine.piecesOf('enemy').length}
        </div>
        <div class="tac-result-actions">
          <button class="btn primary wide" data-act="tacRestart">▶ もう一度</button>
          <button class="btn wide" data-act="tacExit">タイトルへ</button>
        </div>
      </div>
    `;
  }

  /* ============ 操作ハンドラ ============ */
  function handTap(uid) {
    const G = TacticsEngine.state();
    if (G.whose !== 'ally') return;
    const card = G.monsterHand.ally.find(c => c.uid === uid);
    if (!card) return;
    if (selected && selected.kind === 'hand' && selected.uid === uid) {
      selected = null;
    } else {
      selected = { kind: 'hand', uid, card };
      pendingMagic = null;
    }
    render();
  }

  function magicTap(uid) {
    const G = TacticsEngine.state();
    if (G.whose !== 'ally') return;
    const magic = G.magicHand.ally.find(m => m.uid === uid);
    if (!magic) return;
    if (G.energy.ally < magic.cost) return;
    selected = null;
    // 対象 必要 判定
    switch (magic.id) {
      case 'rally':
      case 'summoning_gate':
      case 'elemental_edge':
      case 'iron_wall':
      case 'critical_strike':
      case 'counter_trap':
      case 'mirror_force':
      case 'reverse_resource':
      case 'gravity_force': {
        // 即時 発動
        TacticsMagic.cast('ally', uid, {});
        pendingMagic = null;
        render();
        return;
      }
      case 'healing_wind': {
        pendingMagic = { magicUid: uid, needsTarget: 'piece', filter: 'ally',
                         hint: '回復する 味方を タップ' };
        render();
        return;
      }
      case 'teleport': {
        pendingMagic = { magicUid: uid, needsTarget: 'piece2', filter: 'ally',
                         hint: '味方 → 移動先の マス を 順に タップ' };
        render();
        return;
      }
      case 'lane_burst': {
        // 簡易 UI: prompt で 列を 指定
        const ans = window.prompt('列を 指定（例: row3 / col2、0〜5）', 'row5');
        if (!ans) return;
        const m = ans.match(/^(row|col)\s*(\d)$/);
        if (!m) { alert('入力 形式 エラー'); return; }
        TacticsMagic.cast('ally', uid, { axis: m[1], index: +m[2] });
        render();
        return;
      }
    }
  }

  function cellTap(x, y) {
    const G = TacticsEngine.state();
    if (G.whose !== 'ally') return;
    const piece = G.board[y][x];

    // pendingMagic の 解決
    if (pendingMagic) {
      const m = G.magicHand.ally.find(c => c.uid === pendingMagic.magicUid);
      if (!m) { pendingMagic = null; render(); return; }
      if (pendingMagic.needsTarget === 'piece') {
        if (piece && piece.owner === 'ally') {
          TacticsMagic.cast('ally', pendingMagic.magicUid, { targetUid: piece.uid });
          pendingMagic = null;
          render();
          return;
        }
      } else if (pendingMagic.needsTarget === 'piece2') {
        if (!pendingMagic.targetUid) {
          if (piece && piece.owner === 'ally') {
            pendingMagic.targetUid = piece.uid;
            pendingMagic.hint = `${piece.name} → 移動先マスを タップ`;
            render();
          }
          return;
        }
        if (!piece) {
          TacticsMagic.cast('ally', pendingMagic.magicUid,
            { targetUid: pendingMagic.targetUid, x, y });
          pendingMagic = null;
          render();
          return;
        }
      }
      return;
    }

    // 手札 → マス（召喚）
    if (selected && selected.kind === 'hand') {
      const res = TacticsEngine.summon('ally', selected.uid, x, y);
      if (res.ok) {
        selected = null;
        render();
      } else {
        // 失敗 ログ
        console.warn(res.msg);
      }
      return;
    }
    // ピース選択 → 移動 or 攻撃
    if (selected && selected.kind === 'piece') {
      const p = selected.piece;
      if (piece && piece.owner === 'ally' && piece.uid !== p.uid) {
        // 別 味方 選び 直し
        selected = { kind: 'piece', uid: piece.uid, piece };
        render();
        return;
      }
      if (piece && piece.owner !== p.owner) {
        // 攻撃
        const res = TacticsEngine.attack(p.uid, piece.uid);
        if (res.ok) selected = null;
        render();
        return;
      }
      if (!piece) {
        // 移動
        const res = TacticsEngine.move(p.uid, x, y);
        if (res.ok) {
          // 移動 完了 → 選択 維持して 攻撃 可能か
          if (!p.attacked) {
            // 攻撃 可能な 敵 があれば 選択 維持
          } else {
            selected = null;
          }
          render();
        }
        return;
      }
    }
    // ピース 選択 開始
    if (piece && piece.owner === 'ally') {
      selected = { kind: 'piece', uid: piece.uid, piece };
      pendingMagic = null;
      render();
    }
  }

  function endTurn() {
    const G = TacticsEngine.state();
    if (G.whose !== 'ally' || _cpuBusy) return;
    selected = null;
    pendingMagic = null;
    TacticsEngine.endTurn();
    render();
    // CPU ターン
    if (G.whose === 'enemy' && !G.over) {
      _cpuBusy = true;
      setTimeout(() => {
        try {
          TacticsCPU.takeTurn('enemy');
        } finally {
          _cpuBusy = false;
          render();
        }
      }, 300);
    }
  }

  function cancelMagic() {
    pendingMagic = null;
    render();
  }

  function restart() {
    start({ onExit });
  }
  function exit() {
    if (onExit) onExit();
  }

  return {
    start, render, restart, exit,
    handTap, magicTap, cellTap, endTurn, cancelMagic,
  };
})();
