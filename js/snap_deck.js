/* =========================================================================
 *  snap_deck.js  —  デッキ・ビルダー UI
 *
 *  157体の Snapカードから 12枚を 選んで デッキを 編成。
 *  State.data.snapDeck に 保存され、SnapUI.start() で 自動的に 使用される。
 *
 *  画面構成（縦持ちスマホ最適化）:
 *    上:   タイトル / 選択中デッキ枚数 / 保存ボタン
 *    中央: フィルタ（コスト / 属性 / 系統）
 *    下:   全カード一覧（タップで 追加・削除）
 * =======================================================================*/
const SnapDeck = (() => {
  const DECK_SIZE = 12;
  let root, onExit;
  let deck = [];                          // 現在編集中のデッキ（カードID配列）
  let filterCost = 'all';
  let filterEl = 'all';

  function start(opts) {
    onExit = opts && opts.onExit;
    root = document.getElementById('screen');
    // 現在の保存デッキを読み込み
    const saved = (State.data && State.data.snapDeck) || SnapData.starterDeck();
    deck = saved.slice(0, DECK_SIZE);
    render();
  }

  function render() {
    const cards = SnapData.allCards();
    const ids = Object.keys(cards);
    // フィルタ適用
    const filtered = ids.filter(id => {
      const c = cards[id];
      if (filterCost !== 'all' && c.cost !== +filterCost) return false;
      if (filterEl !== 'all' && c.el !== filterEl) return false;
      return true;
    });
    // ソート: cost → pow
    filtered.sort((a, b) => {
      const ca = cards[a], cb = cards[b];
      return ca.cost - cb.cost || cb.pow - ca.pow;
    });

    const deckCards = deck.map(id => cards[id]).filter(Boolean);
    const total = deckCards.length;
    const valid = total === DECK_SIZE;
    const avgCost = total > 0 ? (deckCards.reduce((s, c) => s + c.cost, 0) / total).toFixed(1) : '—';

    root.innerHTML = `
      <div class="deck-screen">
        <div class="deck-top">
          <button class="snap-back" data-act="deckExit">←</button>
          <div class="deck-title">
            デッキ編成 <b class="${valid ? 'ok' : 'warn'}">${total}/${DECK_SIZE}</b>
            <span class="deck-avg">平均コスト ${avgCost}</span>
          </div>
          <button class="deck-save ${valid ? '' : 'disabled'}" data-act="deckSave">💾 保存</button>
        </div>

        <div class="deck-current">
          ${renderDeckList(deckCards)}
        </div>

        <div class="deck-filters">
          <div class="deck-filter-row">
            <span class="deck-filter-label">コスト:</span>
            ${renderFilterChip('cost', 'all', 'すべて')}
            ${[1, 2, 3, 4, 5, 6].map(c => renderFilterChip('cost', c, `${c}`)).join('')}
          </div>
          <div class="deck-filter-row">
            <span class="deck-filter-label">属性:</span>
            ${renderFilterChip('el', 'all', 'すべて')}
            ${['fire', 'water', 'grass', 'wind', 'earth', 'thunder', 'light', 'dark']
              .map(e => renderFilterChip('el', e, elIcon(e))).join('')}
          </div>
        </div>

        <div class="deck-pool">
          ${filtered.map(id => renderPoolCard(cards[id], id)).join('') || '<div class="deck-no-results">該当するカードなし</div>'}
        </div>
      </div>
    `;
  }

  function renderFilterChip(kind, value, label) {
    const cur = (kind === 'cost') ? filterCost : filterEl;
    const sel = String(cur) === String(value) ? 'selected' : '';
    return `<button class="deck-chip ${sel}" data-act="deckFilter" data-kind="${kind}" data-value="${value}">${label}</button>`;
  }

  function elIcon(el) {
    return ({ fire: '🔥', water: '💧', grass: '🌿', wind: '🍃', earth: '🪨',
      thunder: '⚡', light: '✨', dark: '🌑' })[el] || el;
  }

  function renderDeckList(deckCards) {
    if (!deckCards.length) {
      return '<div class="deck-empty">↓ 下のカードを タップして 12枚 選びましょう</div>';
    }
    // コスト順
    const sorted = deckCards.slice().sort((a, b) => a.cost - b.cost);
    return sorted.map((c, i) => `
      <div class="deck-current-card" data-act="deckRemove" data-uid="${i}" data-el="${c.el || 'none'}">
        <div class="snap-card-cost">${c.cost}</div>
        <div class="deck-mini-emoji">${typeof Art !== 'undefined' ? Art.imgTag(c.id, c.emoji, { cls: 'deck-art' }) : c.emoji}</div>
        <div class="deck-mini-name">${c.name}</div>
      </div>`).join('');
  }

  function renderPoolCard(c, id) {
    const inDeck = deck.includes(id);
    const cls = `deck-pool-card${inDeck ? ' in-deck' : ''}`;
    const art = (typeof Art !== 'undefined')
      ? Art.imgTag(id, c.emoji, { cls: 'snap-card-art' })
      : `<span class="snap-card-art-emoji">${c.emoji}</span>`;
    return `
      <div class="${cls}" data-act="deckAdd" data-id="${id}" data-el="${c.el || 'none'}">
        <div class="snap-card-cost">${c.cost}</div>
        <div class="snap-card-pow">${c.pow}</div>
        <div class="snap-card-art-wrap">${art}</div>
        <div class="snap-card-name">${c.name}</div>
        ${c.abilityText ? `<div class="snap-card-ability">${c.abilityText}</div>` : ''}
        ${inDeck ? '<div class="deck-check">✓</div>' : ''}
      </div>`;
  }

  /* ====== アクション ====== */
  function addCard(id) {
    if (deck.includes(id)) {
      // 同じIDタップで 削除
      deck = deck.filter(d => d !== id);
    } else {
      if (deck.length >= DECK_SIZE) {
        toastInline('デッキは ' + DECK_SIZE + ' 枚まで');
        return;
      }
      deck.push(id);
    }
    if (typeof SoundFX !== 'undefined') SoundFX.sfx('click');
    render();
  }

  function removeCard(i) {
    const idx = +i;
    const deckCards = deck.map(id => SnapData.getCard(id)).filter(Boolean);
    const sorted = deckCards.slice().sort((a, b) => a.cost - b.cost);
    const target = sorted[idx];
    if (target) {
      const k = deck.indexOf(target.id);
      if (k >= 0) deck.splice(k, 1);
    }
    if (typeof SoundFX !== 'undefined') SoundFX.sfx('cancel');
    render();
  }

  function setFilter(kind, value) {
    if (kind === 'cost') filterCost = value;
    else if (kind === 'el') filterEl = value;
    render();
  }

  function save() {
    if (deck.length !== DECK_SIZE) {
      toastInline(`デッキは ちょうど ${DECK_SIZE} 枚 必要`);
      return;
    }
    State.data.snapDeck = deck.slice();
    State.save();
    if (typeof SoundFX !== 'undefined') SoundFX.sfx('win');
    toastInline('💾 デッキを 保存しました');
    setTimeout(() => exit(), 500);
  }

  function exit() {
    if (typeof onExit === 'function') onExit();
  }

  function toastInline(msg) {
    const bar = document.createElement('div');
    bar.className = 'deck-toast';
    bar.textContent = msg;
    document.body.appendChild(bar);
    setTimeout(() => bar.remove(), 1600);
  }

  return {
    start,
    addCard, removeCard, setFilter, save, exit,
    DECK_SIZE,
  };
})();
