/* =========================================================================
 *  tactics_deck.js  —  ツインデッキ ビルダー UI
 *
 *  プレイヤーは モンスターデッキ と 魔法デッキ を 別々に 編成。
 *  保存: State.data.tacticsMonsterDeck / State.data.tacticsMagicDeck
 *
 *  画面構成:
 *    上:    タイトル / 現在の編成枚数 / 保存ボタン
 *    タブ: モンスター / 魔法 切替
 *    中央: 候補カード一覧（フィルタ付き）
 *    下:    現在の デッキ プレビュー
 * =======================================================================*/
const TacticsDeck = (() => {
  const MONSTER_SIZE = 12;
  const MAGIC_SIZE = 6;

  let root, onExit;
  let monsterDeck = [];
  let magicDeck = [];
  let tab = 'monster';
  let filterCost = 'all';
  let filterEl = 'all';

  function start(opts) {
    onExit = opts && opts.onExit;
    root = document.getElementById('screen');
    const savedM = (State.data && State.data.tacticsMonsterDeck);
    const savedX = (State.data && State.data.tacticsMagicDeck);
    monsterDeck = (Array.isArray(savedM) && savedM.length === MONSTER_SIZE)
      ? savedM.slice() : TacticsData.starterMonsterDeck();
    magicDeck = (Array.isArray(savedX) && savedX.length === MAGIC_SIZE)
      ? savedX.slice() : TacticsData.starterMagicDeck();
    tab = 'monster';
    filterCost = 'all';
    filterEl = 'all';
    render();
  }

  function render() {
    const monValid = monsterDeck.length === MONSTER_SIZE;
    const magValid = magicDeck.length === MAGIC_SIZE;
    const allValid = monValid && magValid;
    root.innerHTML = `
      <div class="tdeck-screen">
        <div class="tdeck-top">
          <button class="tdeck-back" data-act="tdeckExit">←</button>
          <div class="tdeck-title">タクティクス デッキ編成</div>
          <button class="tdeck-save ${allValid ? '' : 'disabled'}"
                  data-act="tdeckSave" ${allValid ? '' : 'disabled'}>💾 保存</button>
        </div>

        <div class="tdeck-tabs">
          <button class="tdeck-tab ${tab === 'monster' ? 'active' : ''}"
                  data-act="tdeckTab" data-tab="monster">
            モンスター <b class="${monValid ? 'ok' : 'warn'}">${monsterDeck.length}/${MONSTER_SIZE}</b>
          </button>
          <button class="tdeck-tab ${tab === 'magic' ? 'active' : ''}"
                  data-act="tdeckTab" data-tab="magic">
            魔法 <b class="${magValid ? 'ok' : 'warn'}">${magicDeck.length}/${MAGIC_SIZE}</b>
          </button>
        </div>

        <div class="tdeck-current">
          ${renderCurrentList()}
        </div>

        ${tab === 'monster' ? renderMonsterFilters() : renderMagicFilters()}

        <div class="tdeck-pool">
          ${tab === 'monster' ? renderMonsterPool() : renderMagicPool()}
        </div>
      </div>
    `;
  }

  function renderMonsterFilters() {
    const costs = ['all', 1, 2, 3, 4, 5, 6, 7];
    const els = ['all', 'fire', 'water', 'grass', 'wind', 'earth', 'thunder', 'light', 'dark'];
    return `
      <div class="tdeck-filters">
        <div class="tdeck-filter-row">
          <span class="tdeck-flabel">コスト:</span>
          ${costs.map(c => `<button class="tdeck-chip ${String(filterCost) === String(c) ? 'sel' : ''}"
            data-act="tdeckFilter" data-kind="cost" data-value="${c}">${c === 'all' ? '全' : c}</button>`).join('')}
        </div>
        <div class="tdeck-filter-row">
          <span class="tdeck-flabel">属性:</span>
          ${els.map(e => `<button class="tdeck-chip ${String(filterEl) === e ? 'sel' : ''}"
            data-act="tdeckFilter" data-kind="el" data-value="${e}">${elName(e)}</button>`).join('')}
        </div>
      </div>
    `;
  }

  function renderMagicFilters() {
    const timings = ['all', 'start', 'preCombat', 'reaction'];
    return `
      <div class="tdeck-filters">
        <div class="tdeck-filter-row">
          <span class="tdeck-flabel">タイミング:</span>
          ${timings.map(t => `<button class="tdeck-chip ${String(filterCost) === t ? 'sel' : ''}"
            data-act="tdeckFilter" data-kind="cost" data-value="${t}">${timingLabel(t)}</button>`).join('')}
        </div>
      </div>
    `;
  }

  function elName(e) {
    return ({ all: '全', fire: '🔥', water: '💧', grass: '🌿', wind: '🍃',
      earth: '🪨', thunder: '⚡', light: '✨', dark: '🌑' })[e] || e;
  }
  function timingLabel(t) {
    return ({ all: '全', start: '開始時', preCombat: '戦闘前', reaction: '伏せ' })[t] || t;
  }

  function renderCurrentList() {
    const list = tab === 'monster' ? monsterDeck : magicDeck;
    if (!list.length) {
      return '<div class="tdeck-empty">↓ 候補から タップして 追加</div>';
    }
    if (tab === 'monster') {
      // モンスター: 同じ ID を 集計
      const counter = {};
      list.forEach(id => counter[id] = (counter[id] || 0) + 1);
      return Object.keys(counter).sort().map(id => {
        const c = TacticsData.getMonster(id);
        if (!c) return '';
        const cnt = counter[id];
        return `<div class="tdeck-chip-card" data-el="${c.el || 'none'}"
                     data-act="tdeckRemove" data-id="${id}">
          <span class="tdc-emoji">${c.emoji}</span>
          <span class="tdc-name">${c.name}</span>
          <span class="tdc-cost">⚡${c.cost}</span>
          ${cnt > 1 ? `<span class="tdc-count">×${cnt}</span>` : ''}
        </div>`;
      }).join('');
    } else {
      // 魔法: 同様
      const counter = {};
      list.forEach(id => counter[id] = (counter[id] || 0) + 1);
      return Object.keys(counter).sort().map(id => {
        const m = TacticsData.getMagic(id);
        if (!m) return '';
        const cnt = counter[id];
        return `<div class="tdeck-chip-card tdeck-magic timing-${m.timing}"
                     data-act="tdeckRemove" data-id="${id}">
          <span class="tdc-name">${m.name}</span>
          <span class="tdc-cost">⚡${m.cost}</span>
          ${cnt > 1 ? `<span class="tdc-count">×${cnt}</span>` : ''}
        </div>`;
      }).join('');
    }
  }

  function renderMonsterPool() {
    const cards = TacticsData.allMonsters();
    const ids = Object.keys(cards).filter(id => {
      const c = cards[id];
      if (filterCost !== 'all' && c.cost !== +filterCost) return false;
      if (filterEl !== 'all' && c.el !== filterEl) return false;
      return true;
    });
    ids.sort((a, b) => {
      const A = cards[a], B = cards[b];
      return A.cost - B.cost || B.atk - A.atk;
    });
    return ids.map(id => {
      const c = cards[id];
      const inDeck = monsterDeck.filter(d => d === id).length;
      const cls = ['tdeck-pool-card'];
      if (inDeck > 0) cls.push('in-deck');
      const art = (typeof Art !== 'undefined')
        ? Art.imgTag(id, c.emoji, { cls: 'tdeck-art' })
        : `<span class="tdeck-emoji">${c.emoji}</span>`;
      return `<div class="${cls.join(' ')}" data-el="${c.el || 'none'}"
                   data-act="tdeckAdd" data-kind="monster" data-id="${id}">
        <div class="tdeck-pc-cost">⚡${c.cost}</div>
        <div class="tdeck-pc-art">${art}</div>
        <div class="tdeck-pc-name">${c.name}</div>
        <div class="tdeck-pc-stats">⚔${c.atk}/${c.hp}❤️</div>
        ${c.skill && c.skill !== 'none'
          ? `<div class="tdeck-pc-skill" title="${c.skillText}">${c.skillText}</div>` : ''}
        ${inDeck > 0 ? `<div class="tdeck-check">×${inDeck}</div>` : ''}
      </div>`;
    }).join('') || '<div class="tdeck-no">該当カード なし</div>';
  }

  function renderMagicPool() {
    const cards = TacticsData.allMagic();
    const ids = Object.keys(cards).filter(id => {
      if (filterCost !== 'all' && cards[id].timing !== filterCost) return false;
      return true;
    });
    ids.sort((a, b) => cards[a].cost - cards[b].cost);
    return ids.map(id => {
      const m = cards[id];
      const inDeck = magicDeck.filter(d => d === id).length;
      const cls = ['tdeck-pool-card', 'tdeck-magic-pool', `timing-${m.timing}`];
      if (inDeck > 0) cls.push('in-deck');
      return `<div class="${cls.join(' ')}"
                   data-act="tdeckAdd" data-kind="magic" data-id="${id}">
        <div class="tdeck-pc-cost">⚡${m.cost}</div>
        <div class="tdeck-pc-timing">${timingLabel(m.timing)}</div>
        <div class="tdeck-pc-name">${m.name}</div>
        <div class="tdeck-pc-text">${m.text || ''}</div>
        ${inDeck > 0 ? `<div class="tdeck-check">×${inDeck}</div>` : ''}
      </div>`;
    }).join('') || '<div class="tdeck-no">該当魔法 なし</div>';
  }

  /* ============ アクション ============ */
  function addCard(kind, id) {
    if (kind === 'monster') {
      if (monsterDeck.length >= MONSTER_SIZE) {
        toast(`モンスターは ${MONSTER_SIZE} 枚まで`);
        return;
      }
      // 同名 3枚 まで
      if (monsterDeck.filter(d => d === id).length >= 3) {
        toast('同じカードは 3枚まで');
        return;
      }
      monsterDeck.push(id);
    } else {
      if (magicDeck.length >= MAGIC_SIZE) {
        toast(`魔法は ${MAGIC_SIZE} 枚まで`);
        return;
      }
      // 魔法は 同名 2枚 まで
      if (magicDeck.filter(d => d === id).length >= 2) {
        toast('同じ魔法は 2枚まで');
        return;
      }
      magicDeck.push(id);
    }
    render();
  }

  function removeCard(id) {
    if (tab === 'monster') {
      const idx = monsterDeck.indexOf(id);
      if (idx >= 0) monsterDeck.splice(idx, 1);
    } else {
      const idx = magicDeck.indexOf(id);
      if (idx >= 0) magicDeck.splice(idx, 1);
    }
    render();
  }

  function setTab(t) {
    tab = t;
    filterCost = 'all'; filterEl = 'all';
    render();
  }
  function setFilter(kind, value) {
    if (kind === 'cost') filterCost = value;
    else if (kind === 'el') filterEl = value;
    render();
  }

  function save() {
    if (monsterDeck.length !== MONSTER_SIZE) { toast('モンスターが 12枚 必要'); return; }
    if (magicDeck.length !== MAGIC_SIZE) { toast('魔法が 6枚 必要'); return; }
    State.data.tacticsMonsterDeck = monsterDeck.slice();
    State.data.tacticsMagicDeck = magicDeck.slice();
    State.save();
    toast('💾 保存しました');
    setTimeout(() => exit(), 500);
  }

  function exit() { if (onExit) onExit(); }

  function toast(msg) {
    const bar = document.createElement('div');
    bar.className = 'tdeck-toast';
    bar.textContent = msg;
    document.body.appendChild(bar);
    setTimeout(() => bar.remove(), 1600);
  }

  return {
    start, render,
    addCard, removeCard, setTab, setFilter, save, exit,
    MONSTER_SIZE, MAGIC_SIZE,
  };
})();
