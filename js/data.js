/* =========================================================================
 *  data.js  —  静的データ（150種以上のモンスター / 特技 / 融合ラダー / エリア）
 *  種族は「系統(family) × ティア(1〜5)」を generator で量産し、
 *  さらに属性神(rank6)・巨神(rank7)・オリジン(rank7) を加える。
 * =======================================================================*/
const DB = (() => {

  /* ---- 属性 ------------------------------------------------------------ */
  const ELEMENTS = {
    none:    { name: 'む',     color: '#9aa6c4' },
    fire:    { name: 'ほのお',   color: '#ff6b3d' },
    water:   { name: 'みず',    color: '#3da4ff' },
    grass:   { name: 'くさ',    color: '#5fd06a' },
    wind:    { name: 'かぜ',    color: '#7fe3c9' },
    earth:   { name: 'つち',    color: '#c69a5b' },
    thunder: { name: 'いかずち', color: '#ffd23d' },
    light:   { name: 'ひかり',   color: '#fff1a8' },
    dark:    { name: 'やみ',    color: '#a06bff' },
  };
  const STRONG = { fire: 'grass', grass: 'water', water: 'fire',
    wind: 'earth', earth: 'thunder', thunder: 'wind', light: 'dark', dark: 'light' };
  function elementMult(a, d) {
    if (!a || a === 'none' || !d) return 1.0;
    if (STRONG[a] === d) return 1.5;
    if (STRONG[d] === a) return 0.75;
    return 1.0;
  }

  /* ---- 特技 ------------------------------------------------------------ */
  // type: phys(power=%), magic(power=基礎値), heal, buff
  const SKILLS = {
    // 物理
    tackle: { name: 'たいあたり', type: 'phys', power: 125, el: 'none', mp: 0, target: 'one' },
    claw:   { name: 'ひっかき',   type: 'phys', power: 120, el: 'none', mp: 0, target: 'one' },
    bite:   { name: 'かみつき',   type: 'phys', power: 135, el: 'none', mp: 0, target: 'one' },
    peck:   { name: 'つつき',     type: 'phys', power: 118, el: 'wind', mp: 0, target: 'one' },
    slash:  { name: 'きりさく',   type: 'phys', power: 130, el: 'none', mp: 0, target: 'one' },
    rend:   { name: 'れんぞくこうげき', type: 'phys', power: 70, el: 'none', mp: 4, target: 'one', hits: [2, 3] },
    rockdrop:{ name: 'いわおとし', type: 'phys', power: 150, el: 'earth', mp: 4, target: 'one' },
    vinep:  { name: 'つるのムチ', type: 'phys', power: 118, el: 'grass', mp: 2, target: 'one' },
    tail:   { name: 'しっぽビンタ', type: 'phys', power: 100, el: 'none', mp: 4, target: 'all' },
    // 炎
    mera:   { name: 'メラ',   type: 'magic', power: 22, el: 'fire', mp: 3, target: 'one' },
    gira:   { name: 'ギラ',   type: 'magic', power: 18, el: 'fire', mp: 6, target: 'all' },
    merami: { name: 'メラミ', type: 'magic', power: 42, el: 'fire', mp: 8, target: 'one' },
    // 水
    hyado:  { name: 'ヒャド', type: 'magic', power: 22, el: 'water', mp: 3, target: 'one' },
    hyadaruko:{ name: 'ヒャダルコ', type: 'magic', power: 18, el: 'water', mp: 7, target: 'all' },
    mahyado:{ name: 'マヒャド', type: 'magic', power: 38, el: 'water', mp: 9, target: 'all' },
    // 草
    leaf:   { name: 'リーフカッター', type: 'magic', power: 22, el: 'grass', mp: 3, target: 'one' },
    storm:  { name: 'リーフストーム', type: 'magic', power: 18, el: 'grass', mp: 7, target: 'all' },
    bigleaf:{ name: 'グランドリーフ', type: 'magic', power: 40, el: 'grass', mp: 9, target: 'one' },
    // 風
    shippu: { name: 'しっぷう', type: 'magic', power: 22, el: 'wind', mp: 4, target: 'one' },
    bagi:   { name: 'バギ',   type: 'magic', power: 18, el: 'wind', mp: 5, target: 'all' },
    bagima: { name: 'バギマ', type: 'magic', power: 38, el: 'wind', mp: 9, target: 'all' },
    // 土
    stoneo: { name: 'ストーンエッジ', type: 'magic', power: 24, el: 'earth', mp: 4, target: 'one' },
    jishin: { name: 'じしん',  type: 'magic', power: 20, el: 'earth', mp: 8, target: 'all' },
    jibabig:{ name: 'グランドインパクト', type: 'magic', power: 42, el: 'earth', mp: 10, target: 'one' },
    // 雷
    dein:   { name: 'デイン',   type: 'magic', power: 26, el: 'thunder', mp: 5, target: 'one' },
    raidein:{ name: 'ライデイン', type: 'magic', power: 20, el: 'thunder', mp: 9, target: 'all' },
    gigadein:{ name: 'ギガデイン', type: 'magic', power: 46, el: 'thunder', mp: 11, target: 'one' },
    // 光
    holy:   { name: 'せいなるひかり', type: 'magic', power: 30, el: 'light', mp: 5, target: 'one' },
    holyrain:{ name: 'ホーリーレイン', type: 'magic', power: 22, el: 'light', mp: 10, target: 'all' },
    holybig:{ name: 'ジャッジメント', type: 'magic', power: 48, el: 'light', mp: 12, target: 'one' },
    // 闇
    darko:  { name: 'やみのいちげき', type: 'magic', power: 30, el: 'dark', mp: 5, target: 'one' },
    darkwave:{ name: 'やみのなみ', type: 'magic', power: 22, el: 'dark', mp: 8, target: 'all' },
    darkbig:{ name: 'ダークマター', type: 'magic', power: 46, el: 'dark', mp: 11, target: 'one' },
    // 無
    tama:   { name: 'こうげきだま', type: 'magic', power: 20, el: 'none', mp: 3, target: 'one' },
    io:     { name: 'イオ',   type: 'magic', power: 18, el: 'none', mp: 6, target: 'all' },
    iora:   { name: 'イオラ', type: 'magic', power: 38, el: 'none', mp: 10, target: 'all' },
    // 回復・補助（安く・使いやすく）
    hoimi:   { name: 'ホイミ',   type: 'heal', power: 45, mp: 2, target: 'one' },
    behoimi: { name: 'ベホイミ', type: 'heal', power: 95, mp: 5, target: 'one' },
    behomara:{ name: 'ベホマラー', type: 'heal', power: 70, mp: 10, target: 'allyAll' },
    behoma:  { name: 'ベホマ',   type: 'heal', power: 9999, mp: 9, target: 'one' },
    kiai:    { name: 'きあいため', type: 'buff', stat: 'atk', mult: 1.6, turns: 5, mp: 2, target: 'self' },
    scala:   { name: 'みのまもり', type: 'buff', stat: 'def', mult: 1.6, turns: 5, mp: 2, target: 'self' },
  };
  const BASIC = { name: 'たたかう', type: 'phys', power: 100, el: 'none', mp: 0, target: 'one' };

  // 属性→呪文（one / all / big）
  const EL_MAGIC = {
    fire:    { one: 'mera',   all: 'gira',     big: 'merami' },
    water:   { one: 'hyado',  all: 'hyadaruko', big: 'mahyado' },
    grass:   { one: 'leaf',   all: 'storm',    big: 'bigleaf' },
    wind:    { one: 'shippu', all: 'bagi',     big: 'bagima' },
    earth:   { one: 'stoneo', all: 'jishin',   big: 'jibabig' },
    thunder: { one: 'dein',   all: 'raidein',  big: 'gigadein' },
    light:   { one: 'holy',   all: 'holyrain', big: 'holybig' },
    dark:    { one: 'darko',  all: 'darkwave', big: 'darkbig' },
    none:    { one: 'tama',   all: 'io',       big: 'iora' },
  };

  /* ---- ランク別ベース（1〜7。高ランクほど大幅に強い）------------------ */
  const RANK_BASE = {
    1: { hp: 42,  atk: 12, def: 8,  spd: 9,  mp: 12 },
    2: { hp: 70,  atk: 19, def: 13, spd: 12, mp: 18 },
    3: { hp: 110, atk: 30, def: 21, spd: 16, mp: 26 },
    4: { hp: 160, atk: 44, def: 30, spd: 21, mp: 36 },
    5: { hp: 230, atk: 62, def: 42, spd: 27, mp: 48 },
    6: { hp: 320, atk: 84, def: 58, spd: 34, mp: 62 },
    7: { hp: 440, atk: 112, def: 78, spd: 42, mp: 80 },
  };

  const SPECIES = {};
  const FAMILY_LINE = {};                 // familyKey -> [id tier1..5]
  const ELEMENT_RANK = {};                // el -> rank -> [ids]

  function regIndex(s) {
    (ELEMENT_RANK[s.el] = ELEMENT_RANK[s.el] || {});
    (ELEMENT_RANK[s.el][s.rank] = ELEMENT_RANK[s.el][s.rank] || []).push(s.id);
  }

  function learnFor(el, tier, phys, support) {
    const m = EL_MAGIC[el] || EL_MAGIC.none;
    const L = [{ lv: 1, id: phys }];
    L.push({ lv: tier >= 3 ? 1 : 4, id: m.one });
    L.push({ lv: tier >= 3 ? 1 : 9, id: m.all });
    if (tier >= 3) L.push({ lv: tier >= 4 ? 1 : 16, id: m.big });
    if (support) {
      L.push({ lv: tier >= 3 ? 1 : 5, id: 'hoimi' });
      if (tier >= 3) L.push({ lv: tier >= 4 ? 1 : 18, id: 'behoimi' });
      if (tier >= 4) L.push({ lv: tier >= 5 ? 1 : 24, id: 'behomara' });
      if (tier >= 5) L.push({ lv: 1, id: 'behoma' });
    } else {
      // 回復を広く配る：非サポートも下位回復を覚える
      L.push({ lv: tier >= 4 ? 1 : 12, id: 'hoimi' });
      if (tier >= 5) L.push({ lv: 1, id: 'behoimi' });
    }
    if (tier >= 3) L.push({ lv: tier >= 5 ? 1 : 20, id: 'kiai' });
    // 重複除去
    const seen = {}; return L.filter(x => !seen[x.id] && (seen[x.id] = 1));
  }

  function mkSpecies(id, name, emoji, family, el, rank, arch, mod, growth, learn, recruit) {
    const b = RANK_BASE[rank], m = mod || {};
    const s = {
      id, name, emoji, family, el, rank, arch,
      base: {
        hp: Math.round(b.hp * (m.hp || 1)), atk: Math.round(b.atk * (m.atk || 1)),
        def: Math.round(b.def * (m.def || 1)), spd: Math.round(b.spd * (m.spd || 1)),
        mp: Math.round(b.mp * (m.mp || 1)),
      },
      growth: growth || 0.10, learn: learn || [], recruit: recruit == null ? 0.1 : recruit,
    };
    SPECIES[id] = s; regIndex(s);
    return s;
  }

  /* ---- 系統データ（key, el, arch, phys, support, names[5], emojis[5], mod）--- */
  const FAM = [
    ['sla', 'water', 'blob', 'tackle', true,  ['スラ', 'ベススラ', 'スラナイト', 'スラキング', 'スラゴッド'], ['🟦', '🔵', '🛡️', '👑', '✨'], { hp: 1.1, def: 1.1 }],
    ['bea', 'none',  'beast', 'bite',  false, ['コボル', 'ガルー', 'ウルフェン', 'フェンリル', 'ベヒモス'], ['🐺', '🐕', '🦁', '🐺', '🐂'], { atk: 1.15, spd: 1.1 }],
    ['bir', 'wind',  'bird', 'peck',   false, ['ピヨル', 'ホークル', 'グリフォ', 'ロックチョウ', 'ガルーダ'], ['🐤', '🦅', '🕊️', '🦅', '🦅'], { spd: 1.25, hp: 0.9 }],
    ['pla', 'grass', 'plant', 'vinep', true,  ['マンドラ', 'ラフレシ', 'トレント', 'エルダー', 'ワルツリー'], ['🌱', '🌺', '🌳', '🌳', '🌲'], { def: 1.2, hp: 1.1 }],
    ['bug', 'earth', 'bug',  'tackle', false, ['アリゲ', 'ビートル', 'デスモス', 'ホーネト', 'デスビー'], ['🐜', '🪲', '🦗', '🐝', '🪲'], { def: 1.2, atk: 1.05 }],
    ['und', 'dark',  'humanoid', 'claw', false, ['ホネオ', 'スケルト', 'リッチ', 'デスナイ', 'デュラハン'], ['💀', '☠️', '🧟', '⚔️', '🛡️'], { atk: 1.1 }],
    ['aqu', 'water', 'fish', 'tackle', true,  ['サカナ', 'マーマン', 'クラーケ', 'リヴァイ', 'シードラ'], ['🐟', '🧜', '🐙', '🐋', '🐉'], { spd: 1.1 }],
    ['dra', 'fire',  'dragon', 'bite', false, ['ドラポン', 'ドラグ', 'ドラグーン', 'ティラノ', 'ファヴニル'], ['🐲', '🦎', '🐉', '🦖', '🐉'], { hp: 1.15, atk: 1.2 }],
    ['dev', 'dark',  'humanoid', 'claw', false, ['コアク', 'デビラ', 'マオウ', 'アークデ', 'ルシフェ'], ['👿', '😈', '👹', '😈', '👹'], { atk: 1.15, spd: 1.1 }],
    ['mat', 'earth', 'golem', 'tackle', false, ['ストン', 'ゴーレ', 'アイゴレ', 'タイタロ', 'コロッサ'], ['🪨', '🗿', '🤖', '🏔️', '🗿'], { def: 1.4, spd: 0.7, hp: 1.15 }],
    ['ifr', 'fire',  'blob', 'tackle', false, ['メラゴ', 'フレイム', 'インフェ', 'ヴァルカ', 'イフリト'], ['🔥', '🔥', '🌋', '🔥', '🔥'], { atk: 1.2, mp: 1.1 }],
    ['ice', 'water', 'beast', 'claw', true,  ['フブキ', 'ブリザド', 'アイスゴ', 'フロスト', 'ヨトゥン'], ['❄️', '❄️', '🧊', '❄️', '🧊'], { def: 1.1, hp: 1.1 }],
    ['thu', 'thunder', 'beast', 'bite', false, ['スパーク', 'ボルト', 'サンダ', 'ライジン', 'トール'], ['⚡', '⚡', '🌩️', '⚡', '🔨'], { spd: 1.2, atk: 1.1 }],
    ['lig', 'light', 'humanoid', 'claw', true,  ['ピクシー', 'エンジェ', 'セラフ', 'アークエ', 'メタトロ'], ['🧚', '😇', '😇', '👼', '✨'], { mp: 1.2, def: 1.05 }],
    ['uni', 'light', 'beast', 'bite', true,  ['ユニコ', 'ペガサ', 'キリン', 'アルビオ', 'ホーリド'], ['🦄', '🐴', '🦌', '🦄', '🐉'], { spd: 1.15, mp: 1.1 }],
    ['mus', 'grass', 'plant', 'tackle', true,  ['キノピ', 'マッシュ', 'モーモン', 'スポア', 'マイコ'], ['🍄', '🍄', '🍄', '🍄', '🍄'], { hp: 1.15, def: 1.1 }],
    ['gho', 'dark',  'blob', 'claw', false, ['オバケ', 'ゴースト', 'ファント', 'レイス', 'リーパー'], ['👻', '👻', '👻', '👻', '💀'], { spd: 1.15 }],
    ['roc', 'earth', 'beast', 'tackle', false, ['ロッキ', 'ストガル', 'ロックゴ', 'ベヒロク', 'グラニト'], ['🪨', '🐗', '🦏', '🦏', '🗿'], { def: 1.3, hp: 1.15, spd: 0.8 }],
    ['win', 'wind',  'bird', 'peck', false, ['ウィスプ', 'シルフ', 'テンペス', 'ハルピュ', 'バハール'], ['🌬️', '🧚', '🌪️', '🦅', '🌪️'], { spd: 1.3 }],
    ['ser', 'water', 'dragon', 'bite', false, ['ナーガ', 'ヒュドラ', 'ウミドラ', 'ティアマ', 'ヨルム'], ['🐍', '🐉', '🌊', '🐉', '🐍'], { hp: 1.2, atk: 1.1 }],
    ['dmn', 'dark',  'beast', 'bite', false, ['バァル', 'ベリト', 'ガープ', 'アモン', 'バフォメ'], ['🐃', '🐗', '🐺', '🐲', '🐐'], { atk: 1.2 }],
    ['fay', 'light', 'bird', 'claw', true,  ['コビト', 'ヨウセイ', 'ティンク', 'オベロン', 'ティタニ'], ['🧚', '🧚', '✨', '👑', '👑'], { mp: 1.25, spd: 1.1 }],
    ['tur', 'water', 'golem', 'tackle', true,  ['カメっこ', 'ガメラ', 'ガーディ', 'アスピド', 'ゲンブ'], ['🐢', '🐢', '🐢', '🐢', '🐢'], { def: 1.45, spd: 0.7, hp: 1.2 }],
    ['cat', 'none',  'beast', 'claw', false, ['ニャン', 'キャット', 'ワーキャ', 'ケットシ', 'バステト'], ['🐱', '🐈', '🐈‍⬛', '🐱', '🐈'], { spd: 1.25, atk: 1.05 }],
    ['stb', 'earth', 'bird', 'peck', false, ['イシドリ', 'ガーゴイ', 'ロクチョ', 'バジリス', 'コカトリ'], ['🪨', '🗿', '🦅', '🦎', '🐔'], { def: 1.25, hp: 1.05 }],
    ['anu', 'light', 'dragon', 'bite', false, ['ヒカリ竜', 'セイント', 'ホリド竜', 'ドラゴ神', 'バハムー'], ['🐉', '🐲', '🐉', '🐉', '🐉'], { hp: 1.2, atk: 1.15, mp: 1.1 }],
    ['mtl', 'none',  'blob', 'tackle', false, ['メタッコ', 'メタスラ', 'はぐレタル', 'メタキング', 'メタゴッド'], ['🩶', '⬜', '🥈', '👑', '🏆'], { def: 1.8, spd: 1.4, hp: 0.5 }],
    ['jwl', 'light', 'golem', 'tackle', false, ['ジュエル', 'クリスタ', 'ダイヤモ', 'プリズム', 'ゴドジェム'], ['💎', '🔷', '💠', '🔶', '💎'], { def: 1.5, hp: 1.2 }],
  ];

  FAM.forEach(f => {
    const [key, el, arch, phys, support, names, emojis, mod] = f;
    FAMILY_LINE[key] = [];
    for (let t = 1; t <= 5; t++) {
      const id = key + t;
      const recruit = t === 1 ? 0.2 : t === 2 ? 0.12 : t === 3 ? 0.06 : t === 4 ? 0.02 : 0;
      mkSpecies(id, names[t - 1], emojis[t - 1], key, el, t, arch, mod,
        0.10, learnFor(el, t, phys, support), recruit);
      FAMILY_LINE[key].push(id);
    }
  });

  /* ---- 属性神(rank6) / 巨神(rank7) / オリジン(rank7) ------------------- */
  const GOD = {
    fire: ['イグニス', '🔥'], water: ['アクアス', '🌊'], grass: ['フローラ', '🌿'],
    wind: ['テンペスト', '🌪️'], earth: ['ガイア', '⛰️'], thunder: ['フルゴル', '🌩️'],
    light: ['ルクス', '🌟'], dark: ['ノクス', '🌑'],
  };
  const TITAN = {
    fire: ['スルト', '☄️'], water: ['ポセイド', '🔱'], grass: ['ユグドラ', '🌳'],
    wind: ['ジン', '🌀'], earth: ['アトラス', '🏔️'], thunder: ['ゼウス', '⚡'],
    light: ['ソル', '☀️'], dark: ['ニュクス', '🌚'],
  };
  const GOD_ARCH = { fire: 'dragon', water: 'fish', grass: 'plant', wind: 'bird',
    earth: 'golem', thunder: 'beast', light: 'dragon', dark: 'humanoid' };

  Object.keys(GOD).forEach(el => {
    const phys = { fire: 'bite', water: 'tackle', grass: 'vinep', wind: 'peck',
      earth: 'rockdrop', thunder: 'bite', light: 'slash', dark: 'claw' }[el];
    mkSpecies('god_' + el, GOD[el][0], GOD[el][1], 'god', el, 6, GOD_ARCH[el],
      { hp: 1.1, atk: 1.1 }, 0.11, learnFor(el, 5, phys, true), 0);
    mkSpecies('titan_' + el, TITAN[el][0], TITAN[el][1], 'titan', el, 7, GOD_ARCH[el],
      { hp: 1.15, atk: 1.15, def: 1.1 }, 0.11, learnFor(el, 5, phys, true), 0);
  });
  mkSpecies('origin', 'オリジン', '🌟', 'origin', 'light', 7, 'humanoid',
    { hp: 1.2, atk: 1.2, def: 1.2, spd: 1.2, mp: 1.2 }, 0.12,
    [{ lv: 1, id: 'holybig' }, { lv: 1, id: 'darkbig' }, { lv: 1, id: 'gigadein' },
     { lv: 1, id: 'behoma' }, { lv: 1, id: 'kiai' }], 0);

  /* ---- 融合ヒント ------------------------------------------------------ */
  const RECIPE_HINTS = [
    '同じ系統どうし → ひとつ上のランクへ進化',
    '別系統どうし → 強いほうの属性の 同ランク種が 生まれる',
    'おなじランク同士の融合 → ひとつ上のランクへ！（強い同士でどんどん上位へ）',
    'ランク5どうし → 属性神（ランク6）',
    'ランク6どうし → 巨神（ランク7）',
    'ランク7どうし → オリジン（最強）',
    '融合のたび「＋値」が上がり ステータスUP。重ねるほど強い！',
  ];

  /* ---- たんけんエリア（難易度を急上昇させる）------------------------- */
  // 序盤は弱いが、すぐに高ランク・高レベルの敵が出るように
  const AREAS = [
    { id: 0, name: 'はじまりの草原', emoji: '🌿', min: 1,  max: 4,  reqWins: 0,  rankCap: 1,
      pool: ['sla1', 'bea1', 'bir1', 'pla1', 'cat1', 'mus1'] },
    { id: 1, name: 'ざわめきの森',   emoji: '🌲', min: 4,  max: 9,  reqWins: 3,  rankCap: 2,
      pool: ['bug1', 'und1', 'aqu1', 'win1', 'sla2', 'bea2', 'pla2', 'mus2'] },
    { id: 2, name: 'しめった洞窟',   emoji: '🕳️', min: 9,  max: 16, reqWins: 8,  rankCap: 3,
      pool: ['mat2', 'gho2', 'roc2', 'dev1', 'und2', 'bug3', 'aqu3', 'ice3'] },
    { id: 3, name: 'ほのおの火山',   emoji: '🌋', min: 16, max: 26, reqWins: 16, rankCap: 4,
      pool: ['ifr3', 'dra3', 'dmn3', 'mat3', 'thu3', 'dev3', 'dra4', 'ifr4'] },
    { id: 4, name: 'りゅうの霊峰',   emoji: '🐉', min: 26, max: 38, reqWins: 26, rankCap: 4,
      pool: ['dra4', 'ser4', 'anu4', 'bir4', 'thu4', 'roc4', 'aqu4', 'win4'] },
    { id: 5, name: 'まおうの城',     emoji: '🏰', min: 38, max: 52, reqWins: 40, rankCap: 5,
      pool: ['dev4', 'dev5', 'und5', 'dmn5', 'gho5', 'dra5', 'mat5'] },
    { id: 6, name: 'いにしえの神殿', emoji: '🌌', min: 50, max: 75, reqWins: 60, rankCap: 6, endless: true,
      pool: ['anu5', 'ser5', 'lig5', 'uni5', 'dra5', 'god_fire', 'god_dark', 'god_light', 'god_water', 'god_thunder'] },
  ];

  /* ---- ステータス計算 -------------------------------------------------- */
  function effStats(mon) {
    const s = SPECIES[mon.species]; if (!s) return { hp: 1, atk: 1, def: 1, spd: 1, mp: 1 };
    const lv = mon.level, plusMult = 1 + 0.05 * (mon.plus || 0), bonus = mon.bonus || {};
    const calc = (k) => Math.max(1, Math.round(s.base[k] * (1 + s.growth * (lv - 1)) * plusMult + (bonus[k] || 0)));
    return { hp: calc('hp'), atk: calc('atk'), def: calc('def'), spd: calc('spd'), mp: calc('mp') };
  }
  function knownSkills(mon) {
    const s = SPECIES[mon.species]; if (!s) return [];
    const ids = []; s.learn.forEach(l => { if (mon.level >= l.lv && !ids.includes(l.id)) ids.push(l.id); });
    // 配合で継承したスキル
    (mon.inherited || []).forEach(id => { if (SKILLS[id] && !ids.includes(id)) ids.push(id); });
    return ids;
  }
  function expForLevel(level) { return Math.round(5 * level * level + 5 * level); }

  // ランク表記（DQM風 G〜X）
  function rankLabel(s) {
    if (!s) return '?';
    if (s.id === 'origin') return 'X';
    if (s.family === 'titan') return 'S';
    return ({ 1: 'G', 2: 'F', 3: 'E', 4: 'D', 5: 'C', 6: 'B', 7: 'A' }[s.rank]) || 'A';
  }

  function familyName(key) {
    return ({ sla: 'スライム', bea: 'けもの', bir: 'とり', pla: 'しょくぶつ', bug: 'むし',
      und: 'アンデッド', aqu: 'すいせい', dra: 'ドラゴン', dev: 'あくま', mat: 'こうぶつ',
      ifr: 'ほのお', ice: 'こおり', thu: 'いかずち', lig: 'ひかり', uni: 'せいじゅう',
      mus: 'きのこ', gho: 'ゆうれい', roc: 'がんせき', win: 'かぜ', ser: 'うみへび',
      dmn: 'まじん', fay: 'ようせい', tur: 'かいじゅう', cat: 'ねこ', stb: 'いしどり',
      anu: 'せいりゅう', god: 'ぞくせいしん', titan: 'きょしん', origin: 'げんしん' }[key] || key);
  }

  const speciesCount = () => Object.keys(SPECIES).length;

  return {
    ELEMENTS, SKILLS, BASIC, SPECIES, FAMILY_LINE, ELEMENT_RANK, EL_MAGIC,
    RECIPE_HINTS, AREAS, RANK_BASE,
    elementMult, effStats, knownSkills, expForLevel, familyName, speciesCount, rankLabel,
    species: (id) => SPECIES[id], skill: (id) => SKILLS[id] || BASIC,
  };
})();
