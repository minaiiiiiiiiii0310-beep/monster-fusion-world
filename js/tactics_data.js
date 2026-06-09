/* =========================================================================
 *  tactics_data.js  —  モンスター・タクティクス（6×6 盤面 戦略 ゲーム）
 *
 *  既存の DB.species (157種) を 元に、戦術用 パラメータを 付与:
 *    - cost  召喚コスト
 *    - hp    体力（耐久力）
 *    - atk   攻撃力
 *    - mov   1ターンに 移動できる マス数
 *    - rng   攻撃範囲（1=隣接, 2=2マス先まで など）
 *    - skill 特殊技能 ID
 *
 *  rank → ステータス 標準マッピング:
 *    rank 1 → cost 1, hp 2, atk 1, mov 1, rng 1   (チップ駒)
 *    rank 2 → cost 2, hp 3, atk 2, mov 1, rng 1
 *    rank 3 → cost 3, hp 5, atk 3, mov 1, rng 1
 *    rank 4 → cost 4, hp 7, atk 4, mov 2, rng 1
 *    rank 5 → cost 5, hp 9, atk 5, mov 2, rng 1
 *    rank 6 → cost 6, hp 12, atk 7, mov 2, rng 2  (属性神)
 *    rank 7 → cost 7, hp 15, atk 9, mov 3, rng 2  (巨神/オリジン)
 * =======================================================================*/

const TacticsData = (() => {

  const RANK_STATS = {
    1: { cost: 1, hp: 2,  atk: 1, mov: 1, rng: 1 },
    2: { cost: 2, hp: 3,  atk: 2, mov: 1, rng: 1 },
    3: { cost: 3, hp: 5,  atk: 3, mov: 1, rng: 1 },
    4: { cost: 4, hp: 7,  atk: 4, mov: 2, rng: 1 },
    5: { cost: 5, hp: 9,  atk: 5, mov: 2, rng: 1 },
    6: { cost: 6, hp: 12, atk: 7, mov: 2, rng: 2 },
    7: { cost: 7, hp: 15, atk: 9, mov: 3, rng: 2 },
  };

  // ===== モンスター 技能 =====
  // type: passive(常時) / onSummon(召喚時) / onAttack(攻撃時) /
  //       onDamaged(被弾時) / onDeath(撃破時) / active(任意発動)
  const SKILLS = {
    none:            { text: '',                                          type: 'none' },

    // ----- パッシブ -----
    armor:           { text: '受けるダメージ -1',                          type: 'passive' },
    swift:           { text: 'mov +1（移動範囲拡張）',                      type: 'passive' },
    longshot:        { text: 'rng +1（攻撃範囲拡張）',                      type: 'passive' },
    regenerate:      { text: '毎ターン HP +1（最大HPまで）',                 type: 'passive' },
    aura_buff:       { text: '隣接味方の atk +1',                          type: 'passive' },
    aura_debuff:     { text: '隣接敵の atk -1',                           type: 'passive' },

    // ----- 召喚時 -----
    summon_token:    { text: '召喚時: 隣接マスに 子分（1/1）を 召喚',         type: 'onSummon' },
    summon_draw:     { text: '召喚時: モンスター札を +1 ドロー',             type: 'onSummon' },
    summon_buff:     { text: '召喚時: 隣接味方を +1 atk 永続',              type: 'onSummon' },

    // ----- 攻撃時 -----
    pierce:          { text: '攻撃時: 相手の armor を 無視',                type: 'onAttack' },
    chain_sweep:     { text: '攻撃時: 隣接 全敵に 半減ダメージ',             type: 'onAttack' },
    knockback:       { text: '攻撃時: 相手を 1マス 押し戻す',               type: 'onAttack' },
    lifesteal:       { text: '攻撃時: 与ダメ分 自HP回復',                   type: 'onAttack' },

    // ----- 被弾時 -----
    counter:         { text: '被弾時: 攻撃者に atk/2 ダメージ',             type: 'onDamaged' },
    dodge:           { text: '被弾時: 50%で 回避',                         type: 'onDamaged' },

    // ----- 撃破時 -----
    explode:         { text: '撃破時: 隣接マスに 3 ダメージ',                type: 'onDeath' },
    revive:          { text: '撃破時: 次ターン頭に 復活（HP半分）',          type: 'onDeath' },
    death_curse:     { text: '撃破時: 撃破者に -2 atk 永続',                type: 'onDeath' },

    // ----- 任意発動 -----
    dimension_shift: { text: '能動: 任意の 空マスに ワープ（1試合 1回）',    type: 'active' },
    heal_self:       { text: '能動: HP 全回復（1試合 1回）',                type: 'active' },
    rally_call:      { text: '能動: 味方全員 +1 atk this ターン',           type: 'active' },
  };

  // 系統 × ティア → スキルID
  const FAMILY_SKILL = {
    sla: ['none',           'aura_buff',    'summon_token',   'aura_buff',     'rally_call'],
    bea: ['none',           'swift',        'regenerate',     'chain_sweep',   'aura_buff'],
    bir: ['swift',          'swift',        'longshot',       'longshot',      'dimension_shift'],
    pla: ['summon_draw',    'regenerate',   'regenerate',     'aura_buff',     'aura_buff'],
    bug: ['summon_token',   'explode',      'summon_token',   'explode',       'death_curse'],
    und: ['none',           'revive',       'death_curse',    'revive',        'revive'],
    aqu: ['none',           'regenerate',   'lifesteal',      'lifesteal',     'rally_call'],
    dra: ['none',           'pierce',       'pierce',         'chain_sweep',   'aura_buff'],
    dev: ['pierce',         'pierce',       'lifesteal',      'pierce',        'pierce'],
    mat: ['armor',          'armor',        'armor',          'armor',         'armor'],
    ifr: ['pierce',         'pierce',       'explode',        'chain_sweep',   'death_curse'],
    ice: ['knockback',      'knockback',    'aura_debuff',    'knockback',     'knockback'],
    thu: ['swift',          'swift',        'pierce',         'pierce',        'chain_sweep'],
    lig: ['summon_draw',    'heal_self',    'aura_buff',      'aura_buff',     'rally_call'],
    uni: ['regenerate',     'heal_self',    'aura_buff',      'rally_call',    'rally_call'],
    mus: ['summon_draw',    'regenerate',   'regenerate',     'regenerate',    'heal_self'],
    gho: ['dodge',          'revive',       'death_curse',    'revive',        'dimension_shift'],
    roc: ['armor',          'armor',        'counter',        'armor',         'armor'],
    win: ['swift',          'dimension_shift','swift',        'swift',         'aura_buff'],
    ser: ['regenerate',     'lifesteal',    'regenerate',     'regenerate',    'aura_buff'],
    dmn: ['pierce',         'death_curse',  'lifesteal',      'death_curse',   'pierce'],
    fay: ['summon_draw',    'summon_draw',  'aura_buff',      'aura_buff',     'rally_call'],
    tur: ['armor',          'armor',        'counter',        'armor',         'armor'],
    cat: ['dodge',          'dodge',        'swift',          'dodge',         'swift'],
    stb: ['armor',          'counter',      'longshot',       'longshot',      'armor'],
    anu: ['aura_debuff',    'aura_debuff',  'aura_buff',      'aura_buff',     'rally_call'],
    mtl: ['armor',          'armor',        'counter',        'armor',         'armor'],
    jwl: ['aura_buff',      'aura_buff',    'aura_buff',      'rally_call',    'rally_call'],
  };

  const SPECIAL_SKILL = {
    god:    'rally_call',
    titan:  'aura_buff',
    origin: 'rally_call',
  };

  // ===== 魔法 カード =====
  // timing: start(ターン開始時) / preCombat(戦闘直前) / reaction(リアクション)
  // effect: 効果ID（tactics_magic.js で 解釈）
  const MAGIC_CARDS = {
    // ----- ターン開始時 -----
    lane_burst:      { name: 'レーン・バースト', timing: 'start', cost: 2,
                       text: '列(縦/横)の 味方全員 +3 atk this ターン' },
    rally:           { name: 'ラリーコール',    timing: 'start', cost: 2,
                       text: '全味方 +1 atk this ターン' },
    healing_wind:    { name: '癒しの風',        timing: 'start', cost: 1,
                       text: '味方1体 HP 全回復' },
    summoning_gate:  { name: '召喚ゲート',      timing: 'start', cost: 3,
                       text: 'モンスター札を +2 ドロー' },
    teleport:        { name: 'テレポート',     timing: 'start', cost: 2,
                       text: '味方1体を 任意マスに ワープ' },

    // ----- 戦闘直前 -----
    elemental_edge:  { name: '属性エッジ',     timing: 'preCombat', cost: 1,
                       text: '攻撃側 +2 atk（1回）' },
    iron_wall:       { name: '鉄壁',          timing: 'preCombat', cost: 1,
                       text: '被攻撃側 受けダメ -3（1回）' },
    critical_strike: { name: 'クリティカル',   timing: 'preCombat', cost: 2,
                       text: '攻撃側の damage × 1.5（1回）' },

    // ----- リアクション（伏せ） -----
    gravity_force:   { name: 'グラビティ',     timing: 'reaction', cost: 2,
                       text: '相手の 移動を 1マスに制限（次の相手ターン）' },
    counter_trap:    { name: 'カウンタートラップ', timing: 'reaction', cost: 2,
                       text: '相手の 攻撃を 1回 無効化' },
    reverse_resource:{ name: 'リバース・リソース', timing: 'reaction', cost: 1,
                       text: '味方撃破時: モンスター札 +1 ドロー' },
    mirror_force:    { name: 'ミラーフォース',  timing: 'reaction', cost: 3,
                       text: '相手攻撃を 反射（相手に 同ダメ）' },
  };

  // ===== カード ビルド =====
  let _monsterCache = null;
  function buildMonsterCards() {
    if (_monsterCache) return _monsterCache;
    const cards = {};
    if (typeof DB === 'undefined' || !DB.SPECIES) return cards;
    Object.keys(DB.SPECIES).forEach(id => {
      const sp = DB.SPECIES[id];
      const rank = Math.min(7, Math.max(1, sp.rank || 1));
      const base = RANK_STATS[rank];
      let skill = 'none';
      if (sp.family === 'god' || sp.family === 'titan' || sp.family === 'origin') {
        skill = SPECIAL_SKILL[sp.family] || 'none';
      } else {
        const list = FAMILY_SKILL[sp.family];
        if (list) skill = list[Math.min(4, rank - 1)] || 'none';
      }
      cards[id] = {
        id,
        kind: 'monster',
        name: sp.name,
        emoji: sp.emoji,
        cost: base.cost,
        hp:   base.hp,
        atk:  base.atk,
        mov:  base.mov,
        rng:  base.rng,
        el:   sp.el || 'none',
        family: sp.family,
        rank,
        skill,
        skillText: SKILLS[skill]?.text || '',
        skillType: SKILLS[skill]?.type || 'none',
      };
    });
    _monsterCache = cards;
    return cards;
  }

  function buildMagicCards() {
    const cards = {};
    Object.keys(MAGIC_CARDS).forEach(id => {
      cards[id] = { id, kind: 'magic', ...MAGIC_CARDS[id] };
    });
    return cards;
  }

  function getMonster(id) { return buildMonsterCards()[id]; }
  function getMagic(id)   { return buildMagicCards()[id]; }
  function allMonsters()  { return buildMonsterCards(); }
  function allMagic()     { return buildMagicCards(); }

  // ===== スターターデッキ =====
  function starterMonsterDeck() {
    // 12 枚: 低コスト多め
    return [
      'sla1', 'sla1', 'bea1', 'bea1',          // 1コスト ×4
      'bir1', 'pla1', 'cat1', 'mus1',          // 1コスト ×4
      'sla2', 'bea2', 'bir2',                  // 2コスト ×3
      'dra1',                                  // 3コスト ×1
    ];
  }
  function starterMagicDeck() {
    // 6 枚
    return [
      'lane_burst', 'rally',
      'elemental_edge', 'iron_wall',
      'gravity_force', 'reverse_resource',
    ];
  }

  return {
    RANK_STATS, SKILLS, MAGIC_CARDS,
    getMonster, getMagic, allMonsters, allMagic,
    starterMonsterDeck, starterMagicDeck,
  };
})();

// Node 環境（テスト）でも 使える 簡易 export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TacticsData;
}
