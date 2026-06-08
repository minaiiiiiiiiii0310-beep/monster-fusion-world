/* =========================================================================
 *  snap_data.js  —  モンスター・スナップ カードデータ（25種類の バランス能力）
 *
 *  rank → cost/pow:
 *    rank 1 → cost 1, pow 2
 *    rank 2 → cost 2, pow 3
 *    rank 3 → cost 3, pow 5
 *    rank 4 → cost 4, pow 7
 *    rank 5 → cost 5, pow 9
 *    rank 6 → cost 6, pow 11
 *    rank 7 → cost 6, pow 13
 *
 *  能力 25種類（バトルなし版、純粋な POW 比較）:
 *    onReveal:   slime_buff / angel_bless / rank_up / devil_strike / dragon_burn /
 *                heal_draw / bird_fly / swap_lane / chain_buff / elemental_boost /
 *                summon / copy_strongest
 *    ongoing:    ongoing_aura / titan_boost / light_aura / gang_up /
 *                lone_warrior / underdog / last_stand / shield
 *    endOfTurn:  growth / regen / drain
 *    onDestroyed: phoenix_revive / explode
 * =======================================================================*/

const SnapData = (() => {

  const RANK_TABLE = {
    1: { cost: 1, pow: 2 },
    2: { cost: 2, pow: 3 },
    3: { cost: 3, pow: 5 },
    4: { cost: 4, pow: 7 },
    5: { cost: 5, pow: 9 },
    6: { cost: 6, pow: 11 },
    7: { cost: 6, pow: 13 },
  };

  const ABILITIES = {
    none:           { text: '',                                       type: 'none' },

    // ===== onReveal =====
    slime_buff:     { text: 'プレイ時: 同レーン味方 +1 POW',            type: 'onReveal' },
    angel_bless:    { text: 'プレイ時: 全レーン味方 +1 POW',            type: 'onReveal' },
    rank_up:        { text: 'プレイ時: 同レーン他味方の POW を ×1.5',   type: 'onReveal' },
    devil_strike:   { text: 'プレイ時: 敵 最弱カードを 破壊',           type: 'onReveal' },
    dragon_burn:    { text: 'プレイ時: 同レーン敵 -2 POW',             type: 'onReveal' },
    heal_draw:      { text: 'プレイ時: 山札から +1 ドロー',             type: 'onReveal' },
    bird_fly:       { text: 'プレイ時: 最も劣勢なレーンへ 移動',         type: 'onReveal' },
    swap_lane:      { text: 'プレイ時: 敵が 一番強い レーンへ ワープ',   type: 'onReveal' },
    chain_buff:     { text: 'プレイ時: 全味方の 同系統 +2 POW',         type: 'onReveal' },
    elemental_boost:{ text: 'プレイ時: 全味方の 同属性 +2 POW',         type: 'onReveal' },
    summon:         { text: 'プレイ時: 同レーンに 使い魔(2POW) を 召喚', type: 'onReveal' },
    copy_strongest: { text: 'プレイ時: 同レーン最強味方の POW を コピー', type: 'onReveal' },
    draw_2:         { text: 'プレイ時: 山札から +2 ドロー',            type: 'onReveal' },
    boost_neighbor: { text: 'プレイ時: 隣接レーンの味方 +1 POW',        type: 'onReveal' },

    // ===== ongoing =====
    ongoing_aura:   { text: '永続: 同レーン味方 +1 POW',               type: 'ongoing' },
    titan_boost:    { text: '永続: 全レーン味方 +2 POW',               type: 'ongoing' },
    light_aura:     { text: '永続: 同レーン敵 -1 POW',                 type: 'ongoing' },
    gang_up:        { text: '同レーン仲間 1体 ごとに +1 POW',           type: 'ongoing' },
    lone_warrior:   { text: '同レーン自分のみで +5 POW',                type: 'ongoing' },
    underdog:       { text: '同レーンが 負けてれば +4 POW',             type: 'ongoing' },
    last_stand:     { text: '最終ターン に +6 POW',                    type: 'ongoing' },
    late_bloomer:   { text: '中盤以降、ターンが進むほど +POW',           type: 'ongoing' },
    shield:         { text: '能力で 破壊・弱体化されない',              type: 'ongoing' },

    // ===== endOfTurn =====
    growth:         { text: '毎ターン: 自分の POW +1',                 type: 'endOfTurn' },
    regen:          { text: '毎ターン: 同レーン他味方 +1 POW',           type: 'endOfTurn' },
    drain:          { text: '毎ターン: 同レーン敵 -1 POW',              type: 'endOfTurn' },

    // ===== onDestroyed =====
    phoenix_revive: { text: '破壊時: 次ターン 復活 (-2 POW)',           type: 'onDestroyed' },
    explode:        { text: '破壊時: 同レーン敵 -3 POW',                type: 'onDestroyed' },
  };

  // 系統 × tier(1-5) → 能力ID
  const FAMILY_ABILITY = {
    // スライム: 仲間を 強化
    sla: ['slime_buff', 'slime_buff', 'rank_up',    'chain_buff',     'rank_up'],
    // けもの: 成長と 大器晩成
    bea: ['growth',     'gang_up',    'late_bloomer','last_stand',    'titan_boost'],
    // とり: 機動
    bir: ['bird_fly',   'bird_fly',   'bird_fly',   'bird_fly',       'bird_fly'],
    // しょくぶつ: 回復と ドロー
    pla: ['heal_draw',  'regen',      'regen',      'regen',          'angel_bless'],
    // むし: 群れと 爆発
    bug: ['summon',     'slime_buff', 'gang_up',    'drain',          'explode'],
    // アンデッド: 復活
    und: ['growth',     'phoenix_revive','phoenix_revive','drain',    'phoenix_revive'],
    // すいせい: 安定成長
    aqu: ['growth',     'drain',      'growth',     'copy_strongest', 'rank_up'],
    // ドラゴン: 火力
    dra: ['dragon_burn','growth',     'dragon_burn','dragon_burn',    'titan_boost'],
    // あくま: 破壊
    dev: ['devil_strike','devil_strike','devil_strike','devil_strike','devil_strike'],
    // こうぶつ: 防御
    mat: ['shield',     'shield',     'shield',     'shield',         'shield'],
    // ほのお: 火力と 爆発
    ifr: ['dragon_burn','dragon_burn','explode',    'dragon_burn',    'explode'],
    // こおり: 凍結
    ice: ['drain',      'drain',      'dragon_burn','drain',          'drain'],
    // いかずち: 急襲と 覚醒
    thu: ['growth',     'growth',     'last_stand', 'rank_up',        'rank_up'],
    // ひかり: 全体支援
    lig: ['heal_draw',  'angel_bless','angel_bless','angel_bless',    'angel_bless'],
    // せいじゅう: 神聖
    uni: ['growth',     'growth',     'angel_bless','rank_up',        'rank_up'],
    // きのこ: 持続回復
    mus: ['heal_draw',  'regen',      'regen',      'regen',          'regen'],
    // ゆうれい: 不滅
    gho: ['growth',     'phoenix_revive','phoenix_revive','phoenix_revive','phoenix_revive'],
    // がんせき: 鉄壁
    roc: ['shield',     'shield',     'ongoing_aura','shield',        'shield'],
    // かぜ: 機動と 拡散
    win: ['bird_fly',   'bird_fly',   'boost_neighbor','swap_lane',   'bird_fly'],
    // うみへび: 成長
    ser: ['growth',     'growth',     'growth',     'growth',         'titan_boost'],
    // まじん: 破壊と 火力
    dmn: ['devil_strike','dragon_burn','devil_strike','devil_strike', 'devil_strike'],
    // ようせい: 支援とドロー
    fay: ['heal_draw',  'draw_2',     'angel_bless','angel_bless',    'angel_bless'],
    // かいじゅう: 防御
    tur: ['shield',     'shield',     'shield',     'shield',         'shield'],
    // ねこ: 多様
    cat: ['gang_up',    'copy_strongest','growth',  'lone_warrior',   'rank_up'],
    // いしどり: 守と 機動
    stb: ['shield',     'shield',     'bird_fly',   'bird_fly',       'shield'],
    // せいりゅう: 光と 強化
    anu: ['light_aura', 'light_aura', 'elemental_boost','angel_bless','titan_boost'],
    // こうぶつ動: 防御
    mtl: ['shield',     'shield',     'shield',     'shield',         'shield'],
    // ほうせき: コピー
    jwl: ['ongoing_aura','ongoing_aura','copy_strongest','rank_up',   'rank_up'],
  };

  const SPECIAL_ABILITY = {
    god:   'titan_boost',
    titan: 'titan_boost',
    origin:'angel_bless',
  };

  // 能力ごとの POW 調整（強い能力ほど 控えめ POW）
  const POW_ADJUST = {
    none: 0,
    // 強(-2)
    angel_bless: -2,
    titan_boost: -2,
    copy_strongest: -2,
    last_stand: -2,
    // 中(-1)
    slime_buff: -1,
    rank_up: -1,
    devil_strike: -1,
    dragon_burn: -1,
    heal_draw: -1,
    chain_buff: -1,
    elemental_boost: -1,
    ongoing_aura: -1,
    light_aura: -1,
    growth: -1,
    regen: -1,
    drain: -1,
    explode: -1,
    phoenix_revive: -1,
    shield: -1,
    summon: -1,
    underdog: -1,
    // 弱・条件付(0)
    bird_fly: 0,
    swap_lane: 0,
    gang_up: 0,
    lone_warrior: 0,
    draw_2: -2,
    boost_neighbor: -1,
    late_bloomer: -1,
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
        pow: Math.max(1, base.pow + powAdj),
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

  // スターターデッキ（16枚）
  function starterDeck() {
    return [
      // tier 1 (cost 1, pow 2): 6枚
      'sla1', 'bea1', 'bir1', 'pla1', 'cat1', 'mus1',
      // tier 2 (cost 2, pow 3): 5枚
      'sla2', 'bea2', 'bir2', 'pla2', 'mus2',
      // tier 3 (cost 3, pow 5): 3枚
      'sla3', 'bea3', 'dra1',
      // tier 4 (cost 4, pow 7): 2枚
      'dra2', 'lig3',
    ];
  }

  return {
    ABILITIES, RANK_TABLE,
    getCard, allCards, starterDeck,
  };
})();
