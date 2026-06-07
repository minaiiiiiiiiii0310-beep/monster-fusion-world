/* =========================================================================
 *  arena.js  —  とうぎじょう（ランクマッチ：CPU対戦）
 *  プレイヤーの強さに合わせた相手チームと報酬を生成する。
 * =======================================================================*/
const Arena = (() => {

  const POOL = ['dra2', 'dev2', 'bea2', 'bir2', 'und2', 'aqu2', 'mat2', 'pla2', 'bug2', 'sla2',
                'dra3', 'dev3', 'bea3', 'bir3', 'und3', 'aqu3', 'mat3', 'pla3', 'bug3', 'sla3'];

  const TIERS = {
    easy:   { name: 'かんたん', off: 0, gold: 60,  rank: 8,  pool: 0 },
    normal: { name: 'ふつう',   off: 2, gold: 110, rank: 16, pool: 6 },
    hard:   { name: 'むずかしい', off: 4, gold: 180, rank: 30, pool: 12 },
  };

  function avgLevel() {
    const p = State.partyMons();
    if (!p.length) return 5;
    return Math.round(p.reduce((s, m) => s + m.level, 0) / p.length);
  }

  // 相手チームと報酬を作る
  function makeMatch(tierKey) {
    const t = TIERS[tierKey] || TIERS.normal;
    const base = Math.max(2, avgLevel() + t.off);
    const pool = POOL.slice(t.pool, t.pool + 12);
    const defs = [];
    for (let i = 0; i < 3; i++) {
      const sp = pool[Math.floor(Math.random() * pool.length)];
      defs.push({ species: sp, level: Math.max(1, base + (Math.floor(Math.random() * 3) - 1)) });
    }
    return { defs, reward: { gold: t.gold, rank: t.rank }, tier: t.name };
  }

  return { TIERS, makeMatch, avgLevel };
})();
