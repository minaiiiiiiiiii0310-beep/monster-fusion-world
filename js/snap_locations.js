/* =========================================================================
 *  snap_locations.js  —  3レーンの場所効果
 *
 *  各レーンには 1つのロケーションが割り当てられ、配置や POW に影響する。
 * =======================================================================*/
const SnapLocations = (() => {

  /**
   * 各ロケーションは以下のフックを持てる:
   *   canPlace(card, lane)         : この場所にプレイできるか (true/false)
   *   onPlace(card, lane, side, game) : プレイ直後に呼ばれる
   *   modifyPow(card, lane, side, game) : 表示用POW計算（プラス/マイナス補正値）
   *   onTurnEnd(lane, side, game)  : ターン終了時
   *   onGameEnd(lane, side, game)  : ゲーム終了時の最終POW補正
   */
  const LOCATIONS = {
    volcano: {
      id: 'volcano',
      name: '🔥 火山',
      desc: '火属性 +2 POW / 水属性 -1 POW',
      modifyPow(card) {
        if (card.el === 'fire') return 2;
        if (card.el === 'water') return -1;
        return 0;
      },
    },
    coast: {
      id: 'coast',
      name: '💧 海岸',
      desc: '水属性 +2 POW / 火属性 -1 POW',
      modifyPow(card) {
        if (card.el === 'water') return 2;
        if (card.el === 'fire') return -1;
        return 0;
      },
    },
    forest: {
      id: 'forest',
      name: '🌿 森',
      desc: '草属性 +2 POW',
      modifyPow(card) { return card.el === 'grass' ? 2 : 0; },
    },
    mountain: {
      id: 'mountain',
      name: '⛰️ 山',
      desc: '土属性 +2 POW',
      modifyPow(card) { return card.el === 'earth' ? 2 : 0; },
    },
    thunderhead: {
      id: 'thunderhead',
      name: '⚡ 雷雲',
      desc: '雷属性 +2 POW',
      modifyPow(card) { return card.el === 'thunder' ? 2 : 0; },
    },
    altar: {
      id: 'altar',
      name: '✨ 光の祭壇',
      desc: '光属性 +2 POW',
      modifyPow(card) { return card.el === 'light' ? 2 : 0; },
    },
    abyss: {
      id: 'abyss',
      name: '🌑 闇の谷',
      desc: '闇属性 +2 POW',
      modifyPow(card) { return card.el === 'dark' ? 2 : 0; },
    },
    wind: {
      id: 'wind',
      name: '🌪️ 風の丘',
      desc: '風属性 +2 POW',
      modifyPow(card) { return card.el === 'wind' ? 2 : 0; },
    },
    palace: {
      id: 'palace',
      name: '🏰 王宮',
      desc: 'rank 4+ のみ配置可',
      canPlace(card) { return (card.rank || 1) >= 4; },
    },
    nursery: {
      id: 'nursery',
      name: '🍼 子供部屋',
      desc: 'rank 1-2 のみ配置可',
      canPlace(card) { return (card.rank || 1) <= 2; },
    },
    arena: {
      id: 'arena',
      name: '⚔️ 闘技場',
      desc: 'ターン終了時、ここの最弱が破壊される',
      onTurnEnd(lane, side, game) {
        // 各side のカードをチェック、最弱を破壊
        ['ally', 'enemy'].forEach(s => {
          const cards = game.board[lane][s];
          if (cards.length < 2) return;
          const sorted = [...cards].sort((a, b) =>
            game.effectivePow(a, lane, s) - game.effectivePow(b, lane, s));
          const victim = sorted[0];
          if (victim) game.destroyCard(victim, lane, s);
        });
      },
    },
    eldorado: {
      id: 'eldorado',
      name: '💰 黄金郷',
      desc: '試合終了時、ここのカード POW ×2',
      onGameEnd(card) { return card.pow; },   // POW を倍にする (ベースぶん追加)
    },
    storm: {
      id: 'storm',
      name: '⛈️ 嵐',
      desc: '毎ターン全カード -1 POW',
      modifyPow() { return -1; },
    },
    paradise: {
      id: 'paradise',
      name: '🌸 桃源郷',
      desc: '毎ターン全カード +1 POW',
      modifyPow() { return 1; },
    },
    barrier: {
      id: 'barrier',
      name: '🚫 結界',
      desc: 'このレーンには配置できない',
      canPlace() { return false; },
    },
    ranch: {
      id: 'ranch',
      name: '🐄 牧場',
      desc: '同系統 2+ で 全員 +2 POW',
      modifyPow(card, lane, side, game) {
        const sameFam = (game.board[lane][side] || []).filter(c => c.family === card.family);
        if (sameFam.length >= 2) return 2;
        return 0;
      },
    },
    temple: {
      id: 'temple',
      name: '🌌 神殿',
      desc: 'rank 5+ のみ配置可',
      canPlace(card) { return (card.rank || 1) >= 5; },
    },
    market: {
      id: 'market',
      name: '🛒 闇市場',
      desc: '配置スロット 4枚（通常3枚）',
      maxSlots: 4,
    },
    sanctuary: {
      id: 'sanctuary',
      name: '🪞 鏡の間',
      desc: 'プレイ時にカードがコピー（+1枚）',
      onPlace(card, lane, side, game) {
        const slots = game.board[lane][side];
        if (slots.length < (this.maxSlots || 3)) {
          const copy = { ...card, _isCopy: true };
          slots.push(copy);
        }
      },
    },
    graveyard: {
      id: 'graveyard',
      name: '🪦 墓場',
      desc: '破壊されたカードがランダムに復活',
      maxSlots: 3,
    },
  };

  function all() { return Object.values(LOCATIONS); }

  // 試合開始時の3レーン: ランダムに 3つ重複なしで選ぶ
  function pickThree() {
    const pool = all().filter(l => l.id !== 'barrier');  // 結界は除外（MVP）
    const arr = pool.slice();
    const out = [];
    for (let i = 0; i < 3; i++) {
      const idx = Math.floor(Math.random() * arr.length);
      out.push(arr.splice(idx, 1)[0]);
    }
    return out;
  }

  function byId(id) { return LOCATIONS[id]; }

  return { LOCATIONS, all, pickThree, byId };
})();
