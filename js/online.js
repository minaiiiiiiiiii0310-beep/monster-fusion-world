/* =========================================================================
 *  online.js  —  オンライン対戦（Firebase Realtime Database）
 *  方式：非同期PvP。自分の編成を「ぼうえいチーム」として登録し、
 *        他プレイヤーの実在チームを取得して対戦する（相手モンスターはAI操作）。
 *  firebase-config.js に設定があるときだけ有効。SDKは使う時に遅延ロード。
 * =======================================================================*/
const Online = (() => {
  let app = null, db = null, uid = null, ready = false;
  const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';

  const available = () => !!window.FIREBASE_CONFIG;

  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = () => rej(new Error('load fail ' + src));
      document.head.appendChild(s);
    });
  }

  async function ensureInit() {
    if (ready) return true;
    if (!available()) return false;
    if (typeof firebase === 'undefined') {
      await loadScript(SDK + 'firebase-app-compat.js');
      await loadScript(SDK + 'firebase-database-compat.js');
      await loadScript(SDK + 'firebase-auth-compat.js');
    }
    app = firebase.initializeApp(window.FIREBASE_CONFIG);
    db = firebase.database();
    await firebase.auth().signInAnonymously();
    uid = firebase.auth().currentUser.uid;
    ready = true;
    return true;
  }

  function teamSnapshot() {
    return State.partyMons().map(m => ({
      species: m.species, level: m.level, plus: m.plus || 0,
      bonus: m.bonus || { hp: 0, atk: 0, def: 0, spd: 0, mp: 0 },
    }));
  }

  // 自分の編成を登録（ぼうえいチーム）
  async function publishTeam() {
    if (!(await ensureInit())) return false;
    await db.ref('teams/' + uid).set({
      name: State.data.playerName || ('マスター' + uid.slice(0, 4)),
      rank: State.data.rank || 0,
      team: teamSnapshot(),
      ts: Date.now(),
    });
    return true;
  }

  // 対戦相手をさがす（自分以外のランダムな実在チーム）
  async function findOpponent() {
    if (!(await ensureInit())) return null;
    const snap = await db.ref('teams').limitToLast(50).get();
    const all = snap.val() || {};
    const ids = Object.keys(all).filter(k => k !== uid && all[k] && all[k].team && all[k].team.length);
    if (!ids.length) return null;
    const pick = all[ids[Math.floor(Math.random() * ids.length)]];
    return {
      name: pick.name || 'なぞのマスター',
      rank: pick.rank || 0,
      defs: pick.team.map(t => ({ species: t.species, level: t.level, plus: t.plus || 0, bonus: t.bonus })),
    };
  }

  return { available, ensureInit, publishTeam, findOpponent, get uid() { return uid; } };
})();
