/* =========================================================================
 *  state.js  —  セーブデータ / 手持ちモンスター / 配合 / 経験値処理
 * =======================================================================*/
const State = (() => {

  const SAVE_KEY = 'monfusion_save_v2';   // データ刷新につきキー更新（旧セーブは無視）
  const BOX_CAP = 80;          // 手持ち上限

  let data = null;             // 実体（保存対象）
  let uidSeq = 1;              // モンスター個体の連番

  /* ---- モンスター個体の生成 -------------------------------------------- */
  function makeMonster(speciesId, level, opts = {}) {
    const mon = {
      uid: uidSeq++,
      species: speciesId,
      nickname: '',
      level: Math.max(1, level || 1),
      exp: 0,
      plus: opts.plus || 0,
      bonus: opts.bonus || { hp: 0, atk: 0, def: 0, spd: 0, mp: 0 },
      inherited: opts.inherited || [],   // 配合で受け継いだスキル
    };
    const st = DB.effStats(mon);
    mon.hp = st.hp; mon.mp = st.mp;   // 現在HP/MP（戦闘間で持ち越す）
    return mon;
  }

  function displayName(mon) {
    return mon.nickname || DB.species(mon.species).name;
  }

  /* ---- 初期データ ------------------------------------------------------- */
  function freshGame() {
    uidSeq = 1;
    const box = [
      makeMonster('sla1', 5),
      makeMonster('bea1', 4),
      makeMonster('bir1', 4),
    ];
    return {
      box,
      party: box.slice(0, 3).map(m => m.uid),  // 戦闘に出す3体
      wins: 0,
      tactic: 'balance',          // ガンガン / だいじに / バランス
      seen: {},                   // ずかん：見つけた種族ID
      unlockedAreaMax: 0,
      gold: 0,
      items: {},                  // どうぐ・たね 在庫（key→個数）
      rank: 0,                    // 闘技場ランクポイント
      bossBeaten: false,          // ラスボス撃破フラグ
      cleared: {},                // クリアしたフィールドのボス {areaId:true}
      dexReward: 0,               // 図鑑コンプ報酬の受取段階
      player: { x: 0, z: 7, angle: 0 },          // 3Dマップの自分の位置
      story: { chapter: 0, seenIntro: false, seenEnding: false },
      version: 2,
    };
  }

  // 消費どうぐ（戦闘中つかう）
  const ITEM_DEF = {
    herb:   { name: 'やくそう',         kind: 'heal',   power: 70,  price: 20 },
    sherb:  { name: 'スーパーやくそう', kind: 'heal',   power: 200, price: 70 },
    elixir: { name: 'まほうのせいすい', kind: 'mp',     power: 50,  price: 60 },
    leaf:   { name: 'せかいじゅのは',   kind: 'revive', power: 0.6, price: 150 },
  };

  const SEED_DEF = {
    atk: { name: 'ちからのたね', stat: 'atk', amount: 4,  price: 60 },
    def: { name: 'まもりのたね', stat: 'def', amount: 4,  price: 60 },
    spd: { name: 'すばやさのたね', stat: 'spd', amount: 3, price: 60 },
    hp:  { name: 'いのちのきのみ', stat: 'hp', amount: 15, price: 80 },
  };

  /* ---- セーブ / ロード -------------------------------------------------- */
  function save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ data, uidSeq }));
    } catch (e) { /* localStorage 不可環境では無視 */ }
  }

  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        data = parsed.data;
        uidSeq = parsed.uidSeq || (maxUid(data) + 1);
        ensureFields();
        return true;
      }
    } catch (e) { /* 壊れていたら新規 */ }
    data = freshGame();
    // 初期メンバーをずかん登録
    data.box.forEach(m => markSeen(m.species));
    save();
    return false;
  }

  function maxUid(d) {
    let mx = 0;
    (d.box || []).forEach(m => { if (m.uid > mx) mx = m.uid; });
    return mx;
  }

  // 旧バージョン互換：欠けたフィールドを補完 ＋ 不正データのサニタイズ
  function ensureFields() {
    if (!data.seen) data.seen = {};
    if (data.tactic == null) data.tactic = 'balance';
    if (data.unlockedAreaMax == null) data.unlockedAreaMax = 0;
    if (data.gold == null) data.gold = 0;
    if (!data.items) data.items = {};
    if (!data.cleared) data.cleared = {};
    if (data.dexReward == null) data.dexReward = 0;
    if (data.rank == null) data.rank = 0;
    if (data.bossBeaten == null) data.bossBeaten = false;
    if (!data.player) data.player = { x: 0, z: 7, angle: 0 };
    if (!data.overworld) data.overworld = { x: 0, z: 70, angle: Math.PI };
    if (!data.story) data.story = { chapter: 0, seenIntro: false, seenEnding: false };

    // 存在しない種族の個体を除去（データ刷新・旧セーブ対策）
    data.box = (data.box || []).filter(m => m && DB.species(m.species));
    if (data.box.length === 0) {
      data.box = [makeMonster('sla1', 5), makeMonster('bea1', 4), makeMonster('bir1', 4)];
      data.box.forEach(m => markSeen(m.species));
    }
    // パーティを実在uidに修復
    data.party = (data.party || []).filter(u => data.box.some(m => m.uid === u));
    if (data.party.length === 0) data.party = data.box.slice(0, 3).map(m => m.uid);

    data.box.forEach(m => {
      if (!m.bonus) m.bonus = { hp: 0, atk: 0, def: 0, spd: 0, mp: 0 };
      if (m.plus == null) m.plus = 0;
      const st = DB.effStats(m);
      if (m.hp == null) m.hp = st.hp;
      if (m.mp == null) m.mp = st.mp;
      m.hp = Math.min(m.hp, st.hp); m.mp = Math.min(m.mp, st.mp);
    });
  }

  // 全回復＆そせい（やどや・全滅時）
  function healAll() {
    data.box.forEach(m => { const st = DB.effStats(m); m.hp = st.hp; m.mp = st.mp; });
    save();
  }

  function reset() {
    localStorage.removeItem(SAVE_KEY);
    load();
  }

  /* ---- 手持ち操作 ------------------------------------------------------- */
  function getById(uid) { return data.box.find(m => m.uid === uid); }
  function partyMons() { return data.party.map(getById).filter(Boolean); }

  function markSeen(speciesId) { data.seen[speciesId] = true; }

  function addMonster(mon) {
    if (data.box.length >= BOX_CAP) return false;
    data.box.push(mon);
    markSeen(mon.species);
    return true;
  }

  function release(uid) {
    if (data.party.includes(uid) && data.box.length > 1) {
      // パーティから外す
      data.party = data.party.filter(u => u !== uid);
    }
    data.box = data.box.filter(m => m.uid !== uid);
    save();
  }

  function setParty(uids) {
    data.party = uids.slice(0, 3);
    save();
  }

  // パーティ枠のトグル（最大3体・最低1体）
  function toggleParty(uid) {
    if (data.party.includes(uid)) {
      if (data.party.length <= 1) return false;
      data.party = data.party.filter(u => u !== uid);
    } else {
      if (data.party.length >= 3) return false;
      data.party.push(uid);
    }
    save();
    return true;
  }

  /* ---- 経験値・レベルアップ -------------------------------------------- */
  // 戦闘後に経験値を与える。戻り値は { mon, gained, levels:[新たに覚えた特技名...] }
  function gainExp(mon, amount) {
    const learnedBefore = DB.knownSkills(mon);
    const before = DB.effStats(mon);
    mon.exp += amount;
    let leveled = 0;
    while (mon.level < 99 && mon.exp >= DB.expForLevel(mon.level)) {
      mon.exp -= DB.expForLevel(mon.level);
      mon.level++;
      leveled++;
    }
    if (leveled > 0) {
      // レベルアップでふえた最大値ぶん、現在値も上げる（戦闘不能でなければ）
      const after = DB.effStats(mon);
      if (mon.hp > 0) mon.hp = Math.min(after.hp, mon.hp + (after.hp - before.hp));
      mon.mp = Math.min(after.mp, mon.mp + (after.mp - before.mp));
    }
    const learnedAfter = DB.knownSkills(mon);
    const newSkills = learnedAfter
      .filter(id => !learnedBefore.includes(id))
      .map(id => DB.skill(id).name);
    return { gained: amount, leveled, newSkills };
  }

  /* ---- 融合（ゆうごう）------------------------------------------------- */
  // 属性×ランクから代表種を選ぶ（rank6=属性神 / rank7=巨神 or オリジン）
  function pickByElementRank(el, rank, exA, exB) {
    if (rank >= 7) return el ? ('titan_' + el) : 'origin';
    if (rank === 6) return DB.SPECIES['god_' + el] ? ('god_' + el) : 'origin';
    // rank<=5：その属性の同ランク種から、親と違うものを優先
    const tbl = DB.ELEMENT_RANK[el] || {};
    for (let r = rank; r >= 1; r--) {
      const pool = tbl[r];
      if (pool && pool.length) {
        const cand = pool.filter(id => id !== exA && id !== exB);
        return (cand.length ? cand : pool)[0];
      }
    }
    return exA || 'sla1';
  }

  // 継承スキルを最大3つ選ぶ（回復>補助>強力魔法>連撃>その他）
  function pickInheritSkills(pool) {
    const score = (id) => {
      const sk = DB.skill(id);
      if (sk.type === 'heal') return 6;
      if (sk.type === 'buff') return 5;
      if (sk.hits) return 4;
      if (sk.type === 'magic') return sk.power >= 36 ? 4 : (sk.target === 'all' ? 3 : 2);
      return 1;
    };
    return pool.slice().sort((a, b) => score(b) - score(a)).slice(0, 3);
  }

  // 2体の親から生まれる種族IDを決める（プレビュー兼用・副作用なし）
  function fusionResultSpecies(monA, monB) {
    const a = DB.species(monA.species);
    const b = DB.species(monB.species);
    if (!a || !b) return monA.species;

    // とくべつ：巨神(rank7)どうし → オリジン
    if (a.rank >= 7 && b.rank >= 7) return 'origin';

    // 同系統 → ライン上ひとつ上（最大ランク5まで）
    if (a.family === b.family && DB.FAMILY_LINE[a.family]) {
      const line = DB.FAMILY_LINE[a.family];
      const idx = Math.max(line.indexOf(monA.species), line.indexOf(monB.species));
      if (idx >= 0 && idx < line.length - 1) return line[idx + 1];
      // ライン最大どうし → 属性神(rank6)へ
      return pickByElementRank(a.el, 6, monA.species, monB.species);
    }

    // 別系統：同ランクどうしは「ひとつ上のランク」へ、違えば高い方のランク
    let rank = (a.rank === b.rank) ? Math.min(7, a.rank + 1) : Math.max(a.rank, b.rank);
    // 属性は強い（高ランク）側、同ランクなら親A
    const el = (a.rank >= b.rank) ? a.el : b.el;
    return pickByElementRank(el, rank, monA.species, monB.species);
  }

  // 実際に配合を実行：親2体を消費し、子を box に追加して返す
  function fuse(uidA, uidB) {
    if (uidA === uidB) return { ok: false, msg: 'おなじモンスターは えらべません' };
    const monA = getById(uidA);
    const monB = getById(uidB);
    if (!monA || !monB) return { ok: false, msg: 'モンスターが みつかりません' };
    if (data.box.length - 2 + 1 > BOX_CAP) {
      // 実質は減るので普通は問題ないが念のため
    }

    const resultId = fusionResultSpecies(monA, monB);

    // プラス値：親の合計 + 1（重ねるほど強い）
    const newPlus = (monA.plus || 0) + (monB.plus || 0) + 1;

    // DQM式：子の初期ボーナス＝両親の実効ステータス合計の約1/4
    const stA = DB.effStats(monA), stB = DB.effStats(monB);
    const inh = (k) => Math.floor((stA[k] + stB[k]) / 4);
    const bonus = { hp: inh('hp'), atk: inh('atk'), def: inh('def'), spd: inh('spd'), mp: inh('mp') };

    // スキル継承：両親のおぼえている特技から最大3つ（回復・補助・強力魔法を優先）
    const inherited = pickInheritSkills(
      [...new Set([...DB.knownSkills(monA), ...DB.knownSkills(monB)])]);

    // 子は Lv1 から（継承ボーナス＋プラス値で強化）
    const child = makeMonster(resultId, 1, { plus: newPlus, bonus, inherited });

    // 親を消す（パーティからも除外）
    data.party = data.party.filter(u => u !== uidA && u !== uidB);
    data.box = data.box.filter(m => m.uid !== uidA && m.uid !== uidB);
    data.box.push(child);
    markSeen(resultId);

    // パーティが3未満なら子を補充
    if (data.party.length < 3) data.party.push(child.uid);

    save();
    return { ok: true, child, isNew: true };
  }

  /* ---- たんけん進捗 ----------------------------------------------------- */
  function addWin(n = 1) {
    data.wins += n;
    // 解放エリアの更新
    DB.AREAS.forEach(a => {
      if (data.wins >= a.reqWins && a.id > data.unlockedAreaMax) {
        data.unlockedAreaMax = a.id;
      }
    });
    save();
  }

  function areaUnlocked(area) { return data.wins >= area.reqWins; }

  /* ---- ゴールド / どうぐ（たね）--------------------------------------- */
  function addGold(n) { data.gold = Math.max(0, data.gold + n); save(); }
  function spendGold(n) { if (data.gold < n) return false; data.gold -= n; save(); return true; }

  // 購入（たね・どうぐ 共通）
  function buy(key) {
    const d = SEED_DEF[key] || ITEM_DEF[key]; if (!d) return false;
    if (!spendGold(d.price)) return false;
    data.items[key] = (data.items[key] || 0) + 1;
    save(); return true;
  }
  const buySeed = buy;   // 後方互換
  function itemCount(key) { return data.items[key] || 0; }
  function consumeItem(key) {
    if ((data.items[key] || 0) <= 0) return false;
    data.items[key]--; save(); return true;
  }
  function addItem(key, n = 1) { data.items[key] = (data.items[key] || 0) + n; save(); }

  // たねを使う：対象モンスターの bonus を恒久強化
  function useSeed(key, uid) {
    const s = SEED_DEF[key];
    if (!s || (data.items[key] || 0) <= 0) return false;
    const mon = getById(uid); if (!mon) return false;
    if (!mon.bonus) mon.bonus = { hp: 0, atk: 0, def: 0, spd: 0, mp: 0 };
    mon.bonus[s.stat] = (mon.bonus[s.stat] || 0) + s.amount;
    data.items[key]--; save(); return true;
  }

  /* ---- クリア / 図鑑 --------------------------------------------------- */
  function markCleared(areaId) { data.cleared[areaId] = true; save(); }
  function isCleared(areaId) { return !!data.cleared[areaId]; }
  function seenCount() { return Object.keys(data.seen).filter(k => DB.species(k)).length; }

  /* ---- 闘技場ランク ---------------------------------------------------- */
  function addRank(n) { data.rank = Math.max(0, data.rank + n); save(); }
  function rankName() {
    const r = data.rank;
    if (r >= 2000) return 'グランドマスター';
    if (r >= 1200) return 'マスター';
    if (r >= 700) return 'ダイヤ';
    if (r >= 400) return 'ゴールド';
    if (r >= 200) return 'シルバー';
    if (r >= 80) return 'ブロンズ';
    return 'ルーキー';
  }

  /* ---- 3Dマップの自分の位置 ------------------------------------------- */
  function setPlayerPos(x, z, angle) {
    data.player = { x, z, angle };
    // 位置はこまめに保存（過剰書き込みを避けて呼び出し側で間引く）
  }

  /* オーバーワールド（広い冒険マップ）での自分の位置 */
  function setOverworldPos(x, z, angle) {
    data.overworld = { x, z, angle };
  }

  /* ---- ストーリー ------------------------------------------------------ */
  function setStory(patch) { Object.assign(data.story, patch); save(); }

  /* ---- 公開 ------------------------------------------------------------- */
  return {
    BOX_CAP, SEED_DEF, ITEM_DEF,
    load, save, reset,
    get data() { return data; },
    makeMonster, displayName,
    getById, partyMons,
    addMonster, release, setParty, toggleParty,
    gainExp, healAll,
    fusionResultSpecies, fuse,
    addWin, areaUnlocked, markSeen,
    addGold, spendGold, buy, buySeed, useSeed, itemCount, consumeItem, addItem,
    markCleared, isCleared, seenCount,
    addRank, rankName,
    setPlayerPos, setOverworldPos, setStory,
  };
})();
