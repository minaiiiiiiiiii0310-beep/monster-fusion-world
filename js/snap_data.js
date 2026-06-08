/* =========================================================================
 *  snap_data.js  —  モンスター・スナップ用 カードデータ
 *
 *  既存の DB.species (157種) に Snap 用パラメータを付与:
 *    - cost    エネルギーコスト
 *    - pow     基本POW
 *    - ability 能力ID（snap_engine.js で解釈）
 *
 *  rank → cost/pow の標準マッピング:
 *    rank 1 → cost 1, pow 2
 *    rank 2 → cost 2, pow 3
 *    rank 3 → cost 3, pow 5
 *    rank 4 → cost 4, pow 7
 *    rank 5 → cost 5, pow 9
 *    rank 6 → cost 6, pow 11
 *    rank 7 → cost 6, pow 13
 *
 *  特殊能力を持つカードは pow を控えめに、能力で差別化。
 * =======================================================================*/

const SnapData = (() => {

  // 標準コスト/POW
  const RANK_TABLE = {
    1: { cost: 1, pow: 2 },
    2: { cost: 2, pow: 3 },
    3: { cost: 3, pow: 5 },
    4: { cost: 4, pow: 7 },
    5: { cost: 5, pow: 9 },
    6: { cost: 6, pow: 11 },
    7: { cost: 6, pow: 13 },
  };

  // 能力定義（snap_engine.js で実装）
  // key: ability ID, value: { text, type, ... }
  const ABILITIES = {
    // ----- On Reveal -----
    none:           { text: '',                                       type: 'none' },
    slime_buff:     { text: 'プレイ時: 同レーンの味方 +1 POW',         type: 'onReveal' },
    metal_dodge:    { text: '能力で破壊・弱体化されない',              type: 'ongoing' },
    bird_fly:       { text: 'プレイ時: 別のレーンへ移動',              type: 'onReveal' },
    angel_bless:    { text: 'プレイ時: 全レーンの味方 +1 POW',         type: 'onReveal' },
    devil_strike:   { text: 'プレイ時: 相手の最弱カードを破壊',         type: 'onReveal' },
    dragon_burn:    { text: 'プレイ時: 同レーンの敵 -2 POW',          type: 'onReveal' },
    heal_draw:      { text: 'プレイ時: 手札に1枚追加',                 type: 'onReveal' },
    fusion_call:    { text: 'プレイ時: 同レーン同系統と合体 +4 POW',   type: 'onReveal' },
    rank_up:        { text: 'プレイ時: 同レーンの味方の POW を 1.5倍', type: 'onReveal' },

    // ----- Ongoing -----
    ongoing_aura:   { text: '永続: 同レーンの味方 +1 POW',             type: 'ongoing' },
    titan_boost:    { text: '永続: 全レーンの味方 +2 POW',             type: 'ongoing' },
    golem_shield:   { text: '永続: 破壊されない',                     type: 'ongoing' },
    light_aura:     { text: '永続: 同レーンの敵 -1 POW',               type: 'ongoing' },

    // ----- End of turn -----
    growth:         { text: '毎ターン: 自分の POW +1',                type: 'endOfTurn' },
    regen:          { text: '毎ターン: 同レーンの味方 POW +1',         type: 'endOfTurn' },
    drain:          { text: '毎ターン: 同レーンの敵 -1 POW',          type: 'endOfTurn' },

    // ----- On destroyed -----
    phoenix_revive: { text: '破壊時: 次ターンに復活',                  type: 'onDestroyed' },
    explode:        { text: '破壊時: 同レーンの敵全体 -3 POW',         type: 'onDestroyed' },
  };

  // ----- 系統ごとに能力を割り当てる ----- //
  // FAMILY_ABILITY[family][tier-1] = abilityID
  // tier = species.rank (1〜5)。神/巨神/オリジンは別途。
  const FAMILY_ABILITY = {
    sla: ['slime_buff', 'slime_buff', 'rank_up',     'slime_buff', 'rank_up'],
    bea: ['none',       'growth',     'dragon_burn', 'growth',     'titan_boost'],
    bir: ['bird_fly',   'bird_fly',   'bird_fly',    'bird_fly',   'bird_fly'],
    pla: ['heal_draw',  'none',       'regen',       'regen',      'regen'],
    bug: ['none',       'explode',    'explode',     'drain',      'drain'],
    und: ['none',       'phoenix_revive', 'phoenix_revive', 'drain', 'phoenix_revive'],
    aqu: ['none',       'none',       'growth',      'growth',     'rank_up'],
    dra: ['none',       'growth',     'dragon_burn', 'dragon_burn','titan_boost'],
    dev: ['devil_strike','devil_strike','devil_strike','devil_strike','devil_strike'],
    mat: ['golem_shield','golem_shield','golem_shield','golem_shield','golem_shield'],
    ifr: ['dragon_burn','dragon_burn','dragon_burn', 'explode',    'explode'],
    ice: ['drain',      'drain',      'drain',       'drain',      'drain'],
    thu: ['none',       'growth',     'growth',      'dragon_burn','rank_up'],
    lig: ['heal_draw',  'angel_bless','angel_bless', 'angel_bless','angel_bless'],
    uni: ['none',       'growth',     'angel_bless', 'rank_up',    'rank_up'],
    mus: ['heal_draw',  'regen',      'regen',       'regen',      'regen'],
    gho: ['none',       'phoenix_revive', 'phoenix_revive', 'phoenix_revive', 'phoenix_revive'],
    roc: ['golem_shield','golem_shield','golem_shield','ongoing_aura','golem_shield'],
    win: ['bird_fly',   'bird_fly',   'bird_fly',    'bird_fly',   'angel_bless'],
    ser: ['growth',     'growth',     'growth',      'growth',     'titan_boost'],
    dmn: ['devil_strike','dragon_burn','devil_strike','dragon_burn','devil_strike'],
    fay: ['heal_draw',  'heal_draw',  'angel_bless', 'angel_bless','angel_bless'],
    tur: ['golem_shield','golem_shield','golem_shield','golem_shield','golem_shield'],
    cat: ['none',       'none',       'growth',      'rank_up',    'rank_up'],
    stb: ['golem_shield','golem_shield','bird_fly',  'bird_fly',   'golem_shield'],
    anu: ['light_aura', 'light_aura', 'angel_bless', 'angel_bless','titan_boost'],
    mtl: ['metal_dodge','metal_dodge','metal_dodge', 'metal_dodge','metal_dodge'],
    jwl: ['ongoing_aura','ongoing_aura','ongoing_aura','rank_up',   'rank_up'],
  };

  // 神/巨神/オリジンの能力
  const SPECIAL_ABILITY = {
    god:   'titan_boost',     // 属性神
    titan: 'titan_boost',     // 巨神
    origin:'angel_bless',     // オリジン（全体強化）
  };

  // 能力を持つカードはベース POW を下げる（バランス）
  // ability -> pow adjustment
  const POW_ADJUST = {
    none: 0,
    slime_buff: -1,
    metal_dodge: 0,
    bird_fly: 0,
    angel_bless: -2,
    devil_strike: -1,
    dragon_burn: -1,
    heal_draw: -1,
    fusion_call: -1,
    rank_up: -1,
    ongoing_aura: -1,
    titan_boost: -2,
    golem_shield: -1,
    light_aura: -1,
    growth: -1,
    regen: -1,
    drain: -1,
    phoenix_revive: -1,
    explode: -1,
  };

  // 既存 species → snap card 変換
  let _cache = null;
  function buildCards() {
    if (_cache) return _cache;
    const cards = {};
    if (typeof DB === 'undefined') return cards;
    Object.keys(DB.SPECIES || {}).forEach(id => {
      const sp = DB.SPECIES[id];
      const baseRank = Math.min(7, Math.max(1, sp.rank || 1));
      const base = RANK_TABLE[baseRank];
      let ability = 'none';
      if (sp.family === 'god' || sp.family === 'titan' || sp.family === 'origin') {
        ability = SPECIAL_ABILITY[sp.family] || 'titan_boost';
      } else {
        const list = FAMILY_ABILITY[sp.family];
        if (list) ability = list[Math.min(4, baseRank - 1)] || 'none';
      }
      const powAdj = POW_ADJUST[ability] || 0;
      cards[id] = {
        id,
        name: sp.name,
        emoji: sp.emoji,
        art: id,
        cost: base.cost,
        pow: base.pow + powAdj,
        el: sp.el || 'none',
        family: sp.family,
        rank: sp.rank,
        ability,
        abilityText: ABILITIES[ability]?.text || '',
        abilityType: ABILITIES[ability]?.type || 'none',
      };
    });
    _cache = cards;
    return cards;
  }

  function getCard(id) {
    const cards = buildCards();
    return cards[id];
  }
  function allCards() {
    return buildCards();
  }

  // スターターデッキ（12枚）: 図鑑が空でも遊べるよう既定セット
  function starterDeck() {
    return [
      'sla1', 'bea1', 'bir1', 'pla1', 'cat1', 'mus1',  // スターター6
      'sla2', 'bea2', 'bir2', 'pla2',                   // tier 2
      'sla3', 'dra1',                                    // 切り札
    ];
  }

  return {
    ABILITIES, RANK_TABLE,
    getCard, allCards, starterDeck,
  };
})();
