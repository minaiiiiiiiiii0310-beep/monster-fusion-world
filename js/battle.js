/* =========================================================================
 *  battle.js  —  3対3バトルの戦闘エンジン
 *  コマンド入力・オート・半オート（さくせん）すべてに対応。
 *  UI は resolveRound() が返す step 配列を順番に再生する。
 * =======================================================================*/
const Battle = (() => {

  let cur = null;          // 現在の戦闘
  let enemySeq = -1;       // 敵個体の仮uid

  /* ---- 戦闘員の生成 ----------------------------------------------------- */
  function fromMonster(mon, side, index) {
    const st = DB.effStats(mon);
    const sp = DB.species(mon.species);
    // 味方は現在HP/MPから開始（持ち越し）。敵(ref無し)は満タン。
    const curHP = side === 'ally' && mon.hp != null ? Math.min(st.hp, mon.hp) : st.hp;
    const curMP = side === 'ally' && mon.mp != null ? Math.min(st.mp, mon.mp) : st.mp;
    return {
      uid: side === 'ally' ? mon.uid : enemySeq--,
      ref: side === 'ally' ? mon : null,
      side, index,
      species: mon.species,
      name: State.displayName(mon),
      emoji: sp.emoji, el: sp.el, level: mon.level,
      maxHP: st.hp, hp: curHP,
      maxMP: st.mp, mp: curMP,
      atk: st.atk, def: st.def, spd: st.spd,
      skills: DB.knownSkills(mon),
      buffs: {}, defending: false, alive: curHP > 0,
    };
  }

  // 戦闘の現在HP/MPを 手持ちモンスターへ書き戻す（持ち越し）
  function syncBack() {
    if (!cur) return;
    cur.allies.forEach(c => { if (c.ref) { c.ref.hp = Math.round(c.hp); c.ref.mp = Math.round(c.mp); } });
  }

  // 野生モンスター（敵）を定義（種ID＋レベル[＋plus/bonus]）から作る
  function makeWild(def, index) {
    const pseudo = { species: def.species, level: def.level, plus: def.plus || 0, bonus: def.bonus || {} };
    const c = fromMonster(pseudo, 'enemy', index);
    c.species = def.species;
    c.wildLevel = def.level;
    return c;
  }

  /* ---- 戦闘開始 --------------------------------------------------------- */
  function start(allyMons, enemyDefs, meta) {
    enemySeq = -1;
    const allies = allyMons.map((m, i) => fromMonster(m, 'ally', i));
    const enemies = enemyDefs.map((d, i) => makeWild(d, i));
    cur = { allies, enemies, round: 0, over: false, result: null, meta: meta || {}, fledOnce: false, scouted: [] };
    return cur;
  }

  /* ---- 補助 ------------------------------------------------------------- */
  const living = (arr) => arr.filter(c => c.alive);
  const livingAllies  = () => living(cur.allies);
  const livingEnemies = () => living(cur.enemies);
  const statMult = (c, stat) => (c.buffs[stat] ? c.buffs[stat].mult : 1);
  const rnd = (a, b) => a + Math.random() * (b - a);

  // 戦闘員が使える特技（MPが足りるもの）＋ たたかう
  function availableSkills(c) {
    const list = [{ id: '__basic', skill: DB.BASIC }];
    c.skills.forEach(id => {
      const sk = DB.skill(id);
      if (sk.mp <= c.mp) list.push({ id, skill: sk });
    });
    return list;
  }

  // スカウト成功率：敵HPが低い・自分が格上・手持ちに余裕 ほど高い
  function scoutChance(actor, t) {
    if (State.data.box.length >= State.BOX_CAP) return 0;
    const hpRatio = t.hp / t.maxHP;
    const lvFactor = Math.min(1.7, (actor.level + 8) / (t.level + 8));
    let p = ((1 - hpRatio) * 0.6 + 0.08) * lvFactor;
    // すでに同種を持っていると少し下がる
    const owned = State.data.box.filter(m => m.species === t.species).length;
    p *= Math.max(0.4, 1 - owned * 0.15);
    return Math.max(0, Math.min(0.95, p));
  }

  function fleeChance() {
    const a = livingAllies().reduce((s, c) => s + c.spd, 0) / Math.max(1, livingAllies().length);
    const e = livingEnemies().reduce((s, c) => s + c.spd, 0) / Math.max(1, livingEnemies().length);
    return Math.min(0.9, Math.max(0.25, 0.5 + (a - e) / (a + e) * 0.5));
  }

  /* ---- ダメージ計算 ----------------------------------------------------- */
  function computeDamage(atk, def, skill) {
    let base, mitigFactor;
    if (skill.type === 'phys') {
      base = atk.atk * (skill.power / 100) * statMult(atk, 'atk');
      mitigFactor = 0.5;
    } else { // magic
      base = (skill.power + atk.atk * 0.4) * statMult(atk, 'atk');
      mitigFactor = 0.25;
    }
    const effDef = def.def * statMult(def, 'def') * mitigFactor;
    let dmg = base - effDef;
    const crit = Math.random() < 1 / 16;
    if (crit) dmg = base * 1.2;               // 会心は防御を大きく無視
    const elMult = DB.elementMult(skill.el, def.el);
    if (def.defending) dmg *= 0.5;
    dmg = Math.max(1, Math.round(dmg * elMult * rnd(0.9, 1.1)));
    return { dmg, elMult, crit };
  }

  /* ---- AI（敵 ＆ プレイヤーおまかせ）----------------------------------- */
  // c の行動を自動決定して action を返す。tactic はプレイヤー側のさくせん。
  function decideAction(c, tactic) {
    const allies  = c.side === 'ally' ? livingAllies()  : livingEnemies();
    const enemies = c.side === 'ally' ? livingEnemies() : livingAllies();
    const avail = availableSkills(c);

    const healSkills = avail.filter(a => a.skill.type === 'heal');
    const buffSkills = avail.filter(a => a.skill.type === 'buff');
    const dmgSkills  = avail.filter(a => a.skill.type === 'phys' || a.skill.type === 'magic');

    // 回復の判断しきい値
    let healThresh = 0.5;
    if (tactic === 'gangan') healThresh = 0.25;
    else if (tactic === 'daiji') healThresh = 0.6;
    else if (tactic === 'balance') healThresh = 0.45;

    // 1) 回復が必要な味方がいれば回復
    const hurt = allies.filter(a => a.hp / a.maxHP <= healThresh);
    if (healSkills.length && hurt.length) {
      // 複数瀕死ならベホマラー優先
      const all = healSkills.find(a => a.skill.target === 'allyAll');
      if (hurt.length >= 2 && all) {
        return { type: 'skill', skillId: all.id === '__basic' ? null : all.id, kind: all.skill, targetUid: null };
      }
      const single = healSkills.find(a => a.skill.target === 'one') || healSkills[0];
      const lowest = hurt.sort((x, y) => x.hp / x.maxHP - y.hp / y.maxHP)[0];
      return { type: 'skill', skillId: single.id, kind: single.skill, targetUid: lowest.uid };
    }

    // 2) たまに補助（だいじに/バランス）
    if (buffSkills.length && (tactic === 'daiji' || tactic === 'balance' || c.side === 'enemy')
        && !c.buffs.atk && Math.random() < 0.2) {
      const b = buffSkills[0];
      return { type: 'skill', skillId: b.id, kind: b.skill, targetUid: c.uid };
    }

    // 3) 攻撃
    if (dmgSkills.length && enemies.length) {
      // 候補をスコア化
      const scored = dmgSkills.map(a => {
        const sk = a.skill;
        let score = sk.type === 'magic' ? (sk.power + c.atk * 0.4) : c.atk * sk.power / 100;
        if (sk.target === 'all') score *= Math.min(enemies.length, 3) * 0.7; // 全体は頭割り気味
        // 属性有利を加味
        const bestEl = Math.max(...enemies.map(e => DB.elementMult(sk.el, e.el)));
        score *= bestEl;
        if (sk.id === '__basic') score *= 0.9;
        score *= rnd(0.85, 1.15);
        return { a, score };
      }).sort((x, y) => y.score - x.score);

      const pick = scored[0].a;
      const sk = pick.skill;
      let targetUid = null;
      if (sk.target === 'one') {
        // 属性有利＞低HP の順で選ぶ
        const t = enemies.slice().sort((x, y) => {
          const ex = DB.elementMult(sk.el, x.el), ey = DB.elementMult(sk.el, y.el);
          if (ex !== ey) return ey - ex;
          return x.hp - y.hp;
        })[0];
        targetUid = t.uid;
      }
      return { type: pick.id === '__basic' ? 'attack' : 'skill',
               skillId: pick.id === '__basic' ? null : pick.id, kind: sk, targetUid };
    }

    // 4) 何もできなければ たたかう
    const t = enemies[0];
    return { type: 'attack', skillId: null, kind: DB.BASIC, targetUid: t ? t.uid : null };
  }

  function autoAllyActions() {
    return livingAllies().map(c => ({ actor: c, action: decideAction(c, State.data.tactic) }));
  }

  /* ---- ターゲット解決 --------------------------------------------------- */
  function findByUid(uid) {
    return cur.allies.find(c => c.uid === uid) || cur.enemies.find(c => c.uid === uid);
  }
  function pickLivingFrom(side) {
    const arr = side === 'ally' ? livingAllies() : livingEnemies();
    return arr.length ? arr[Math.floor(Math.random() * arr.length)] : null;
  }

  /* ---- 1ターンの解決 --------------------------------------------------- */
  // allyActions: UIから渡される [{actor, action}]（省略時はおまかせ）
  function resolveRound(allyActions) {
    if (cur.over) return { steps: [], result: cur.result };
    cur.round++;
    const steps = [];

    // 防御フラグをリセット
    cur.allies.concat(cur.enemies).forEach(c => { c.defending = false; });

    // 行動リストを構築
    const acts = [];
    const allyList = allyActions && allyActions.length ? allyActions : autoAllyActions();
    allyList.forEach(e => acts.push(e));
    livingEnemies().forEach(c => acts.push({ actor: c, action: decideAction(c, null) }));

    // すばやさ順（バフ込み）
    acts.sort((x, y) => {
      const sx = x.actor.spd * statMult(x.actor, 'spd');
      const sy = y.actor.spd * statMult(y.actor, 'spd');
      if (sy !== sx) return sy - sx;
      return Math.random() - 0.5;
    });

    for (const { actor, action } of acts) {
      if (!actor.alive || cur.over) continue;
      resolveAction(actor, action, steps);
      checkOver();
      if (cur.over) break;
    }

    // バフのターン経過
    cur.allies.concat(cur.enemies).forEach(c => {
      Object.keys(c.buffs).forEach(k => {
        c.buffs[k].turns--;
        if (c.buffs[k].turns <= 0) delete c.buffs[k];
      });
    });

    checkOver();
    return { steps, result: cur.result };
  }

  function sel(c) { return { side: c.side, index: c.index }; }

  function resolveAction(actor, action, steps) {
    // にげる
    if (action.type === 'flee') {
      const ok = Math.random() < fleeChance();
      steps.push({ text: ok ? 'うまく にげきれた！' : 'しかし にげられなかった！',
                   actorSel: sel(actor), fx: null });
      if (ok) { cur.over = true; cur.result = 'flee'; }
      return;
    }
    // ぼうぎょ
    if (action.type === 'defend') {
      actor.defending = true;
      steps.push({ text: `${actor.name} は みをまもっている`, actorSel: sel(actor), targetUid: actor.uid, fx: 'buff' });
      return;
    }
    // どうぐ（消費アイテム）
    if (action.type === 'item') {
      const it = State.ITEM_DEF[action.itemKey];
      if (!it || !State.consumeItem(action.itemKey)) {
        steps.push({ text: 'どうぐが ない', actorSel: sel(actor), fx: 'miss' }); return;
      }
      let t = action.targetUid != null ? findByUid(action.targetUid) : actor;
      if (!t || t.side !== 'ally') t = actor;
      steps.push({ text: `${actor.name} は ${it.name} を つかった！`, actorSel: sel(actor), fx: 'buff' });
      if (it.kind === 'heal') {
        if (!t.alive) { steps.push({ text: 'しかし こうかが なかった', targetSel: sel(t), fx: 'miss' }); return; }
        const before = t.hp; t.hp = Math.min(t.maxHP, t.hp + it.power);
        steps.push({ text: `${t.name} の HPが ${t.hp - before} かいふく`, targetSel: sel(t), targetUid: t.uid, hpAfter: t.hp, fx: 'heal', amount: t.hp - before });
      } else if (it.kind === 'mp') {
        const before = t.mp; t.mp = Math.min(t.maxMP, t.mp + it.power);
        steps.push({ text: `${t.name} の MPが ${t.mp - before} かいふく`, targetSel: sel(t), actorUid: t.uid, mpAfter: t.mp, fx: 'heal' });
      } else if (it.kind === 'revive') {
        if (t.alive) { steps.push({ text: 'しかし こうかが なかった', targetSel: sel(t), fx: 'miss' }); return; }
        t.alive = true; t.hp = Math.max(1, Math.round(t.maxHP * it.power));
        steps.push({ text: `${t.name} が いきかえった！`, targetSel: sel(t), targetUid: t.uid, hpAfter: t.hp, fx: 'heal', amount: t.hp });
      }
      return;
    }
    // スカウト（仲間にする）
    if (action.type === 'scout') {
      let t = action.targetUid != null ? findByUid(action.targetUid) : pickLivingFrom('enemy');
      if (!t || !t.alive || t.side !== 'enemy') {
        steps.push({ text: 'しかし たいしょうが いない', actorSel: sel(actor), fx: 'miss' });
        return;
      }
      steps.push({ text: `${actor.name} は ${t.name} を スカウトした！`, actorSel: sel(actor), fx: 'buff' });
      const p = scoutChance(actor, t);
      if (Math.random() < p) {
        t.alive = false; t.hp = 0; t.scouted = true;
        cur.scouted.push({ species: t.species, level: t.level });
        steps.push({ text: `${t.name} は なかまに なりたそうに している！`, targetSel: sel(t), targetUid: t.uid, hpAfter: 0, fx: 'heal' });
      } else {
        steps.push({ text: `${t.name} は ふりむきもしない…（成功率 ${Math.round(p * 100)}%）`, targetSel: sel(t), fx: 'miss' });
      }
      return;
    }

    const skill = action.type === 'attack' ? DB.BASIC : DB.skill(action.skillId);
    // MP不足なら たたかう に変更
    let useSkill = skill, useType = action.type;
    if (skill.mp > actor.mp) { useSkill = DB.BASIC; useType = 'attack'; }
    if (useType === 'skill') actor.mp = Math.max(0, actor.mp - useSkill.mp);

    // 行動アナウンス
    let intro;
    if (useType === 'attack') intro = `${actor.name} の こうげき！`;
    else if (useSkill.type === 'phys') intro = `${actor.name} の ${useSkill.name}！`;
    else intro = `${actor.name} は ${useSkill.name} を となえた！`;
    steps.push({ text: intro, actorSel: sel(actor), actorUid: actor.uid, mpAfter: actor.mp, fx: null });

    // 効果別処理
    if (useSkill.type === 'heal') {
      const targets = useSkill.target === 'allyAll'
        ? living(actor.side === 'ally' ? cur.allies : cur.enemies)
        : [resolveHealTarget(actor, action)];
      targets.filter(Boolean).forEach(t => {
        const amount = Math.round(useSkill.power + actor.level * 1.2 + actor.atk * 0.2);
        const before = t.hp;
        t.hp = Math.min(t.maxHP, t.hp + amount);
        const healed = t.hp - before;
        steps.push({ text: `${t.name} の HPが ${healed} かいふくした`, targetSel: sel(t),
                     targetUid: t.uid, hpAfter: t.hp, fx: 'heal', amount: healed });
      });
      return;
    }

    if (useSkill.type === 'buff') {
      actor.buffs[useSkill.stat] = { mult: useSkill.mult, turns: useSkill.turns };
      const label = useSkill.stat === 'atk' ? 'こうげき力' : useSkill.stat === 'def' ? 'みのまもり' : 'すばやさ';
      steps.push({ text: `${actor.name} の ${label}が あがった！`, targetSel: sel(actor), targetUid: actor.uid, fx: 'buff' });
      return;
    }

    // ダメージ系
    const enemySide = actor.side === 'ally' ? 'enemy' : 'ally';
    let targets;
    if (useSkill.target === 'all') {
      targets = enemySide === 'enemy' ? livingEnemies() : livingAllies();
    } else {
      let t = action.targetUid != null ? findByUid(action.targetUid) : null;
      if (!t || !t.alive) t = pickLivingFrom(enemySide);
      targets = t ? [t] : [];
    }
    if (!targets.length) {
      steps.push({ text: 'しかし だれもいなかった', actorSel: sel(actor), fx: 'miss' });
      return;
    }

    const hits = useSkill.hits ? Math.floor(rnd(useSkill.hits[0], useSkill.hits[1] + 0.999)) : 1;
    for (let h = 0; h < hits; h++) {
      // 単体多段で対象が死んだら別の敵へ
      let tgs = targets.filter(t => t.alive);
      if (!tgs.length && useSkill.target === 'one') {
        const nt = pickLivingFrom(enemySide); if (nt) tgs = [nt]; else break;
      }
      tgs.forEach(t => {
        if (!t.alive) return;
        const { dmg, elMult, crit } = computeDamage(actor, t, useSkill);
        t.hp = Math.max(0, t.hp - dmg);
        let tag = '';
        if (crit) tag = 'かいしんのいちげき！ ';
        else if (elMult >= 1.5) tag = 'こうかは ばつぐん！ ';
        else if (elMult <= 0.8) tag = 'いまひとつ… ';
        steps.push({ text: `${tag}${t.name} に ${dmg} のダメージ！`, targetSel: sel(t),
                     targetUid: t.uid, hpAfter: t.hp, fx: crit ? 'crit' : 'hit', amount: dmg });
        if (t.hp <= 0 && t.alive) {
          t.alive = false;
          steps.push({ text: `${t.name} を たおした！`, targetSel: sel(t), fx: null });
        }
      });
    }
  }

  function resolveHealTarget(actor, action) {
    const side = actor.side === 'ally' ? cur.allies : cur.enemies;
    if (action.targetUid != null) {
      const t = findByUid(action.targetUid);
      if (t && t.alive) return t;
    }
    // 一番HP割合の低い味方
    const alive = living(side);
    return alive.sort((a, b) => a.hp / a.maxHP - b.hp / b.maxHP)[0];
  }

  function checkOver() {
    if (cur.over) return;
    if (livingEnemies().length === 0) { cur.over = true; cur.result = 'win'; }
    else if (livingAllies().length === 0) { cur.over = true; cur.result = 'lose'; }
  }

  /* ---- 公開 ------------------------------------------------------------- */
  return {
    get cur() { return cur; },
    start, resolveRound, autoAllyActions, syncBack,
    availableSkills, decideAction, fleeChance,
    livingAllies, livingEnemies,
  };
})();
