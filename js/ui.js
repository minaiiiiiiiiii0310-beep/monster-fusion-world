/* =========================================================================
 *  ui.js  —  画面描画・操作・バトル演出
 * =======================================================================*/
const UI = (() => {

  let root;                 // #screen
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const pct = (v, max) => Math.max(0, Math.min(100, (v / max) * 100));
  const rndInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
  const TACTICS = { gangan: 'ガンガンいこうぜ', daiji: 'いのちだいじに', balance: 'バランス' };
  let backTarget = 'town';   // ヘッダー「もどる」の行き先
  let fieldArea = 0;          // 現在いるフィールドのエリアID

  /* ===== 共通パーツ ===================================================== */
  function elBadge(mon) {
    const s = DB.species(mon.species);
    const plus = mon.plus ? `<span class="plus">+${mon.plus}</span>` : '';
    return `<span class="eltag" style="background:${DB.ELEMENTS[s.el].color}"></span>` + plus;
  }

  function monCard(mon, opts = {}) {
    const s = DB.species(mon.species);
    const st = DB.effStats(mon);
    const hp = mon.hp == null ? st.hp : mon.hp;
    const inParty = State.data.party.includes(mon.uid);
    const cls = ['mon-card'];
    if (inParty) cls.push('in-party');
    if (opts.selected) cls.push('selected');
    if (opts.dim) cls.push('dim');
    if (hp <= 0) cls.push('fainted');
    return `
      <div class="${cls.join(' ')}" data-act="${opts.act || 'detail'}" data-uid="${mon.uid}">
        ${inParty ? '<div class="party-flag">出</div>' : ''}
        <div class="mc-emoji">${s.emoji}</div>
        <div class="mc-name">${State.displayName(mon)}</div>
        <div class="mc-sub">Lv${mon.level} ${elBadge(mon)}</div>
        <div class="mc-hp"><span style="width:${pct(hp, st.hp)}%"></span></div>
      </div>`;
  }

  function statRow(label, val, max, color) {
    return `<div class="stat-row"><span class="stat-l">${label}</span>
      <span class="stat-bar"><span style="width:${pct(val, max)}%;background:${color}"></span></span>
      <span class="stat-v">${val}</span></div>`;
  }

  /* ===== ルーター ====================================================== */
  function show(name, arg) {
    root = document.getElementById('screen');
    closeModal();
    if (name !== 'battle' && Scene3D.active) Scene3D.dispose();
    if (name !== 'town' && name !== 'field' && name !== 'world' && World.active) World.dispose();
    if (name === 'home') renderHome();
    else if (name === 'town') renderTown();
    else if (name === 'field') renderField();
    else if (name === 'world') renderWorld();
    else if (name === 'box') renderBox();
    else if (name === 'fusion') { fuseA = null; fuseB = null; renderFusion(); }
    else if (name === 'explore') renderExplore();
    else if (name === 'shop') renderShop();
    else if (name === 'dex') renderDex();
    else if (name === 'settings') renderSettings();
    else if (name === 'battle') renderBattle();
    window.scrollTo(0, 0);
  }

  /* ===== タイトル ====================================================== */
  function renderHome() {
    const has = State.data.wins > 0 || State.data.box.length > 3 || State.data.story.chapter > 0;
    const party = State.partyMons();
    const emojis = party.map(m => `<span class="home-emoji">${DB.species(m.species).emoji}</span>`).join('');
    root.innerHTML = `
      <div class="home title">
        <h1 class="game-title">モンスター<br><span>ワールド</span></h1>
        <p class="title-sub">— ゆうごうと ぼうけんの ものがたり —</p>
        <div class="pp-emojis">${emojis}</div>
        <button class="menu-btn big start" data-act="startAdventure"><span class="mi">▶</span>${has ? 'つづきから' : 'ぼうけんを はじめる'}</button>
        <div class="title-mini">
          <button class="btn ghost" data-act="dexFromTitle">📖 ずかん</button>
          <button class="btn ghost" data-act="settingsFromTitle">⚙️ せってい</button>
        </div>
        <div class="home-stat">かちすう ${State.data.wins}　／　ランク ${State.rankName()}</div>
      </div>`;
  }

  /* ===== 町（3Dマップ）================================================ */
  function renderTown() {
    root.innerHTML = `
      <div class="town">
        <canvas id="world-canvas"></canvas>
        <div id="world-labels"></div>
        <div class="town-hud">
          <div class="hud-top">
            <span class="hud-chip">🪙 ${State.data.gold}</span>
            <span class="hud-chip">🏅 ${State.rankName()}</span>
            <button class="hud-menu" data-act="townMenu">≡ メニュー</button>
          </div>
          <div class="hud-goal">🎯 ${Story.goal()}</div>
          <div id="joystick" class="joystick"><div id="joy-knob" class="joy-knob"></div></div>
          <button id="enter-btn" class="enter-btn" data-act="worldInteract" disabled>はいる</button>
        </div>
      </div>`;
    const cv = document.getElementById('world-canvas');
    const labels = document.getElementById('world-labels');
    const ok = World.init(cv, labels, onFacility);
    if (!ok) {
      root.innerHTML = `${header('町')}<p class="hint">3D表示が つかえない環境のようです。WebGL対応ブラウザで お試しください。</p>
        <button class="btn wide" data-act="explore">ゲートへ（バトル）</button>`;
      return;
    }
    World.setNearbyCallback(updateEnterBtn);
    bindJoystick();
    if (!State.data.story.seenIntro) {
      World.pause();
      dialogue('🧙 マスター', Story.INTRO, () => { State.setStory({ seenIntro: true }); World.resume(); });
    }
  }

  /* ===== オーバーワールド（広い冒険マップ）=========================== */
  function renderWorld() {
    root.innerHTML = `
      <div class="town">
        <canvas id="world-canvas"></canvas>
        <div id="world-labels"></div>
        <div class="town-hud">
          <div class="hud-top">
            <span class="hud-chip">🗺️ ぼうけんマップ</span>
            <span class="hud-chip">🪙 ${State.data.gold}</span>
            <button class="hud-menu" data-act="town">🏠 まちへ</button>
          </div>
          <div class="hud-goal">🧭 道に沿って進むと エリアの入口や 旅人の村がある</div>
          <div id="joystick" class="joystick"><div id="joy-knob" class="joy-knob"></div></div>
          <button id="enter-btn" class="enter-btn" data-act="worldInteract" disabled>はいる</button>
        </div>
      </div>`;
    const cv = document.getElementById('world-canvas');
    const labels = document.getElementById('world-labels');
    const ok = World.init(cv, labels, onOverworldPOI, {
      mode: 'overworld',
      onEncounter: onOverworldEncounter,
    });
    if (!ok) {
      root.innerHTML = `${header('ぼうけんマップ')}<p class="hint">3D表示が つかえない環境のようです。</p>
        <button class="btn wide" data-act="town">まちへ もどる</button>`;
      return;
    }
    World.setNearbyCallback(updateEnterBtn);
    bindJoystick();
  }

  function onOverworldPOI(id) {
    if (id === 'overworld_home') { show('town'); return; }
    if (id && id.startsWith('overworld_area_')) {
      const areaId = parseInt(id.replace('overworld_area_', ''), 10);
      const area = (DB.AREAS && DB.AREAS[areaId]) || DB.AREAS[0];
      if (!State.areaUnlocked(area)) {
        World.pause();
        showModal(`<div class="dialogue"><div class="dlg-spk">🔒 とおせんぼ</div>
          <div class="dlg-text">「${area.name}」へは まだ 行けない。<br>かちすう ${area.reqWins} ぐらいに なったら また 来よう。</div>
          <button class="btn primary wide" data-act="closeFacility">わかった</button></div>`, true);
        return;
      }
      enterField(areaId);
      return;
    }
    if (id && id.startsWith('village_')) {
      // 旅人の村：軽い回復とゴールド少々
      World.pause();
      State.healAll();
      State.addGold(20);
      showModal(`<div class="dialogue"><div class="dlg-spk">🏡 旅人の村</div>
        <div class="dlg-text">旅人たちが もてなしてくれた。<br>HP/MPが ぜんかいし、20ゴールドの 餞別を もらった。</div>
        <button class="btn primary wide" data-act="closeFacility">ありがとう！</button></div>`, true);
      return;
    }
  }

  function onOverworldEncounter(def) {
    // オーバーワールドの遭遇＝接触したモンスターの所属エリアを推定
    let bestArea = DB.AREAS[0], bestRank = 99;
    for (const a of DB.AREAS) {
      if (a.pool.includes(def.species)) {
        const diff = Math.abs(a.min - def.level);
        if (diff < bestRank) { bestRank = diff; bestArea = a; }
      }
    }
    const sp = DB.species(def.species);
    const defs = [def];
    if (Math.random() < 0.35) {
      const s2 = bestArea.pool[Math.floor(Math.random() * bestArea.pool.length)];
      defs.push({ species: s2, level: Math.max(1, def.level + (Math.floor(Math.random() * 3) - 1)) });
    }
    beginEncounter(defs, { mode: 'overworld', area: bestArea, fromOverworld: true,
      intro: `${sp.emoji} ${sp.name}(Lv${def.level}) が しのびよってきた！` });
  }

  /* ===== フィールド（3D・徘徊モンスター）============================== */
  function enterField(areaId) { fieldArea = areaId; show('field'); }

  function renderField() {
    const area = DB.AREAS[fieldArea] || DB.AREAS[0];
    root.innerHTML = `
      <div class="town">
        <canvas id="world-canvas"></canvas>
        <div id="world-labels"></div>
        <div class="town-hud">
          <div class="hud-top">
            <span class="hud-chip">${area.emoji} ${area.name}</span>
            <span class="hud-chip">🪙 ${State.data.gold}</span>
            <button class="hud-menu" data-act="town">🚪 まちへ</button>
          </div>
          <div class="hud-goal">🗺️ モンスターに ふれると バトル！ 奥(おく)に行くほど 強い</div>
          <div id="joystick" class="joystick"><div id="joy-knob" class="joy-knob"></div></div>
          <button id="enter-btn" class="enter-btn" data-act="worldInteract" disabled>はいる</button>
        </div>
      </div>`;
    const cv = document.getElementById('world-canvas');
    const labels = document.getElementById('world-labels');
    const ok = World.init(cv, labels, onFacility, { mode: 'field', area,
      onEncounter: onFieldEncounter, onChest: onFieldChest });
    if (!ok) {
      root.innerHTML = `${header('フィールド')}<p class="hint">3D表示が つかえない環境のようです。</p>
        <button class="btn wide" data-act="town">まちへ もどる</button>`;
      return;
    }
    World.setNearbyCallback(updateEnterBtn);
    bindJoystick();
  }

  // 徘徊モンスターに接触 → 戦闘へ
  function onFieldEncounter(def) {
    const area = DB.AREAS[fieldArea] || DB.AREAS[0];
    const sp = DB.species(def.species);
    if (def.boss) {
      // フィールドの主（ボス）：単体・強め
      beginEncounter([{ species: def.species, level: def.level }],
        { mode: 'field', area, fromField: true, boss: true,
          intro: `👑 ${area.name}の ぬし ${sp.name}(Lv${def.level}) が たちはだかった！` });
      return;
    }
    const defs = [def];
    if (Math.random() < 0.5) {
      const s2 = area.pool[Math.floor(Math.random() * area.pool.length)];
      defs.push({ species: s2, level: Math.max(1, def.level + (Math.floor(Math.random() * 3) - 1)) });
    }
    beginEncounter(defs, { mode: 'field', area, fromField: true,
      intro: `${sp.emoji} ${sp.name}(Lv${def.level}) が おそってきた！` });
  }

  // 宝箱に接触
  function onFieldChest(reward) {
    let msg;
    if (reward.type === 'gold') { State.addGold(reward.amount); msg = `🪙 ${reward.amount} ゴールド を てにいれた！`; }
    else {
      State.addItem(reward.key, 1);
      const def = State.ITEM_DEF[reward.key] || State.SEED_DEF[reward.key];
      msg = `🎁 ${def ? def.name : reward.key} を てにいれた！`;
    }
    World.pause();
    showModal(`<div class="dialogue"><div class="dlg-spk">🎁 たからばこ</div>
      <div class="dlg-text">${msg}</div>
      <button class="btn primary wide" data-act="closeFacility">やった！</button></div>`, true);
  }

  function updateEnterBtn(near) {
    const b = document.getElementById('enter-btn');
    if (!b) return;
    if (near) { b.disabled = false; b.textContent = near.isMaster ? '💬 はなす' : '▶ ' + near.name; }
    else { b.disabled = true; b.textContent = 'はいる'; }
  }

  function bindJoystick() {
    const base = document.getElementById('joystick');
    const knob = document.getElementById('joy-knob');
    if (!base) return;
    const R = 40; let id = null;
    const move = (e) => {
      if (id === null) return;
      const r = base.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      const len = Math.hypot(dx, dy) || 1, m = Math.min(1, len / R);
      const nx = dx / len * m, ny = dy / len * m;
      knob.style.transform = `translate(${nx * R}px,${ny * R}px)`;
      World.setMove(nx, ny);
    };
    const up = () => { id = null; knob.style.transform = 'translate(0,0)'; World.setMove(0, 0); };
    base.addEventListener('pointerdown', (e) => { id = e.pointerId; try { base.setPointerCapture(id); } catch (x) {} move(e); });
    base.addEventListener('pointermove', move);
    base.addEventListener('pointerup', up);
    base.addEventListener('pointercancel', up);
  }

  /* ---- 施設に はいる ---- */
  function onFacility(id) {
    if (id === 'gate') show('world');                  // ゲート → 広いオーバーワールドへ
    else if (id === 'exit') show('town');
    else if (id === 'fusion') goScreen('fusion', 'town');
    else if (id === 'ranch') goScreen('box', 'town');
    else if (id === 'shop') goScreen('shop', 'town');
    else if (id === 'inn') openInn();
    else if (id === 'arena') openArena();
    else if (id === 'master') openMaster();
    else if (id && id.startsWith('npc_')) openNPCDialogue(id);
  }

  function openNPCDialogue(id) {
    const f = (World.facilities || []).find(ff => ff.id === id);
    if (!f) return;
    World.pause();
    showModal(`<div class="dialogue"><div class="dlg-spk">${f.emoji} ${f.name}</div>
      <div class="dlg-text">${f.msg || 'こんにちは！'}</div>
      <button class="btn primary wide" data-act="closeFacility">またね</button></div>`, true);
  }

  function openInn() {
    World.pause(); State.healAll();
    showModal(`<div class="dialogue"><div class="dlg-spk">🛏️ やどや</div>
      <div class="dlg-text">ゆっくり おやすみください。<br>すべての モンスターの HP・MPが ぜんかいし、戦闘不能も そせいしました。ぼうけんも きろく。</div>
      <button class="btn primary wide" data-act="closeFacility">ありがとう！</button></div>`, true);
  }

  function openMaster() {
    World.pause();
    const d = State.data;
    if (d.bossBeaten && !d.story.seenEnding) {
      dialogue('🧙 マスター', Story.ENDING, () => { State.setStory({ seenEnding: true }); World.resume(); });
    } else if (Story.canAdvance()) {
      const lines = Story.advance();
      State.addGold(120);
      dialogue('🧙 マスター', lines.concat(['（ごほうび 120ゴールド！ つぎの もくひょう：）', Story.goal()]),
        () => World.resume());
    } else if (Story.bossReady()) {
      showModal(`<div class="dialogue"><div class="dlg-spk">🧙 マスター</div>
        <div class="dlg-text">まおう ザルディアが 待っている。<br>けっせんに いどむか？</div>
        <div class="res-btns">
          <button class="btn primary" data-act="startBoss">けっせん！</button>
          <button class="btn ghost" data-act="closeFacility">まだ やめておく</button>
        </div></div>`, true);
    } else {
      dialogue('🧙 マスター', ['いまの もくひょう：', Story.goal()], () => World.resume());
    }
  }

  function openArena() {
    World.pause();
    const tiers = Object.keys(Arena.TIERS).map(k => {
      const t = Arena.TIERS[k];
      return `<button class="btn" data-act="arenaMatch" data-tier="${k}">${t.name}
        <small>🏅+${t.rank} ／ 🪙${t.gold}</small></button>`;
    }).join('');
    showModal(`<div class="arena-modal">
      <h2>⚔️ とうぎじょう</h2>
      <div class="arena-rank">ランク <b>${State.rankName()}</b>（${State.data.rank}pt）</div>
      <p class="hint">CPUランクマッチで かちあがろう！</p>
      <div class="arena-tiers">${tiers}</div>
      <button class="btn primary wide" data-act="arenaOnline">🌐 オンライン対戦</button>
      <button class="btn ghost wide" data-act="closeFacility">でる</button>
    </div>`, true);
  }

  function showOnlineSetup() {
    showModal(`<div class="dialogue"><div class="dlg-spk">🌐 オンライン対戦</div>
      <div class="dlg-text" style="text-align:left">
        オンライン対戦には 無料の Firebase せってい が ひつようです。<br><br>
        1) Firebase で プロジェクト作成<br>
        2) Realtime Database を ついか<br>
        3) <b>js/firebase-config.js</b> に せっていを はりつけ<br><br>
        せっていすると、世界中の マスターの 編成と たいせんできます（非同期PvP）。
      </div>
      <button class="btn primary wide" data-act="closeFacility">とじる</button></div>`, true);
  }

  /* ---- どうぐや ---- */
  function renderShop() {
    const d = State.data;
    const itemDesc = { heal: 'HPかいふく', mp: 'MPかいふく', revive: 'そせい' };
    const consum = Object.keys(State.ITEM_DEF).map(k => {
      const it = State.ITEM_DEF[k];
      return `<div class="shop-item">
        <div><b>${it.name}</b><br><small>${itemDesc[it.kind]}${it.kind === 'revive' ? '' : ' +' + it.power}（戦闘でつかう）</small></div>
        <div class="shop-buy"><span class="own">×${d.items[k] || 0}</span>
          <button class="btn small" data-act="buy" data-key="${k}">🪙${it.price} かう</button></div>
      </div>`;
    }).join('');
    const seeds = Object.keys(State.SEED_DEF).map(k => {
      const s = State.SEED_DEF[k];
      const stl = { atk: 'こうげき', def: 'みのまもり', spd: 'すばやさ', hp: 'さいだいHP' }[s.stat];
      return `<div class="shop-item">
        <div><b>${s.name}</b><br><small>${stl} +${s.amount}（永久・詳細画面でつかう）</small></div>
        <div class="shop-buy"><span class="own">×${d.items[k] || 0}</span>
          <button class="btn small" data-act="buy" data-key="${k}">🪙${s.price} かう</button></div>
      </div>`;
    }).join('');
    root.innerHTML = `${header('どうぐや')}
      <div class="shop-gold">しょじ 🪙 ${d.gold}</div>
      <h3 class="shop-sec">🎒 どうぐ（戦闘でつかう）</h3>
      <div class="shop-list">${consum}</div>
      <h3 class="shop-sec">🌱 つよさのたね（永久強化）</h3>
      <div class="shop-list">${seeds}</div>`;
  }

  /* ---- ダイアログ ---- */
  let dlg = null;
  function dialogue(speaker, lines, onDone) {
    dlg = { speaker, lines: lines.slice(), i: 0, onDone };
    renderDialogue();
  }
  function renderDialogue() {
    const last = dlg.i >= dlg.lines.length - 1;
    showModal(`<div class="dialogue">
      <div class="dlg-spk">${dlg.speaker}</div>
      <div class="dlg-text">${dlg.lines[dlg.i]}</div>
      <button class="btn primary wide" data-act="dlgNext">${last ? 'とじる' : 'つぎへ ▶'}</button>
    </div>`, true);
  }

  function goScreen(name, back) { backTarget = back; show(name); }

  /* ===== モンスターボックス / パーティ編成 ============================ */
  function renderBox() {
    const box = State.data.box;
    const list = box.map(m => monCard(m)).join('');
    root.innerHTML = `
      ${header('モンスター')}
      <p class="hint">タップで しょうさい・パーティへんせい。パーティは さいだい3たい。</p>
      <div class="party-slots">
        ${[0, 1, 2].map(i => {
          const m = State.partyMons()[i];
          return `<div class="pslot">${m ? DB.species(m.species).emoji + '<br>' + State.displayName(m) : 'あき'}</div>`;
        }).join('')}
      </div>
      <div class="mon-grid">${list}</div>`;
  }

  /* ===== モンスター詳細モーダル ======================================== */
  function showDetail(uid) {
    const mon = State.getById(uid);
    if (!mon) return;
    const s = DB.species(mon.species);
    const st = DB.effStats(mon);
    const inParty = State.data.party.includes(uid);
    const inh = mon.inherited || [];
    const skills = DB.knownSkills(mon).map(id => DB.skill(id).name + (inh.includes(id) ? '★' : ''));
    const need = DB.expForLevel(mon.level);
    const famName = DB.familyName(s.family);
    const html = `
      <div class="detail">
        <div class="d-head">
          <div class="d-emoji">${s.emoji}</div>
          <div>
            <div class="d-name">${State.displayName(mon)}</div>
            <div class="d-sub"><b class="rankbadge">ランク${DB.rankLabel(s)}</b> Lv${mon.level} ／ ${famName}系 ／ ${DB.ELEMENTS[s.el].name}属性
              ${mon.plus ? `<span class="plus">+${mon.plus}</span>` : ''}</div>
          </div>
        </div>
        <div class="d-stats">
          ${statRow('HP', st.hp, 800, '#56d364')}
          ${statRow('MP', st.mp, 130, '#58a6ff')}
          ${statRow('こうげき', st.atk, 170, '#ff7b54')}
          ${statRow('みのまもり', st.def, 130, '#ffd23d')}
          ${statRow('すばやさ', st.spd, 90, '#7fe3c9')}
        </div>
        <div class="d-exp">HP ${Math.max(0, mon.hp)}/${st.hp}　MP ${Math.max(0, mon.mp)}/${st.mp}　／　つぎのLvまで ${Math.max(0, need - mon.exp)}</div>
        <div class="d-skills"><b>とくぎ:</b> ${skills.length ? skills.join('・') : 'なし'}<br><small>★=配合で継承</small></div>
        <div class="d-actions">
          <button class="btn" data-act="togParty" data-uid="${uid}">${inParty ? 'パーティから はずす' : 'パーティに いれる'}</button>
          <button class="btn" data-act="rename" data-uid="${uid}">なまえ</button>
          ${seedTotal() > 0 ? `<button class="btn" data-act="useSeedMenu" data-uid="${uid}">🌱 たねをつかう</button>` : ''}
          <button class="btn danger" data-act="release" data-uid="${uid}">にがす</button>
        </div>
        <button class="btn ghost wide" data-act="closeModal">とじる</button>
      </div>`;
    showModal(html);
  }

  function seedTotal() {
    const it = State.data.items || {};
    return (it.atk || 0) + (it.def || 0) + (it.spd || 0) + (it.hp || 0);
  }

  function showSeedMenu(uid) {
    const it = State.data.items || {};
    const list = Object.keys(State.SEED_DEF).filter(k => (it[k] || 0) > 0).map(k => {
      const s = State.SEED_DEF[k];
      return `<button class="btn" data-act="doSeed" data-key="${k}" data-uid="${uid}">${s.name} ×${it[k]}</button>`;
    }).join('');
    showModal(`<div class="dialogue"><div class="dlg-spk">🌱 たねをつかう</div>
      <div class="res-btns">${list || '<p class="hint">たねが ありません</p>'}
      <button class="btn ghost" data-act="detail" data-uid="${uid}">もどる</button></div></div>`);
  }

  /* ===== 配合 ========================================================== */
  let fuseA = null, fuseB = null;
  function renderFusion() {
    fuseA = fuseA && State.getById(fuseA) ? fuseA : null;
    fuseB = fuseB && State.getById(fuseB) ? fuseB : null;
    const box = State.data.box;
    let preview = '<div class="fz-preview empty">おやを 2たい えらんでね</div>';
    let canFuse = false;
    if (fuseA && fuseB && fuseA !== fuseB) {
      const a = State.getById(fuseA), b = State.getById(fuseB);
      const resId = State.fusionResultSpecies(a, b);
      const rs = DB.species(resId);
      const newPlus = (a.plus || 0) + (b.plus || 0) + 1;
      const isNew = !State.data.seen[resId];
      preview = `
        <div class="fz-preview">
          <div class="fz-parents">
            <span>${DB.species(a.species).emoji}</span>
            <span class="fz-plus">＋</span>
            <span>${DB.species(b.species).emoji}</span>
          </div>
          <div class="fz-arrow">▼</div>
          <div class="fz-result">
            <div class="fz-remoji">${rs.emoji}</div>
            <div class="fz-rname">${rs.name} <span class="plus">+${newPlus}</span></div>
            ${isNew ? '<div class="fz-new">★ あたらしい モンスター！</div>' : ''}
          </div>
        </div>`;
      canFuse = true;
    }
    const cards = box.map(m => {
      const sel = m.uid === fuseA || m.uid === fuseB;
      return monCard(m, { act: 'fzPick', selected: sel });
    }).join('');
    root.innerHTML = `
      ${header('ゆうごう')}
      <p class="hint">2たいを かけあわせて 新種をつくる！ おやは いなくなるよ。</p>
      ${preview}
      <div class="fz-buttons">
        <button class="btn primary wide ${canFuse ? '' : 'disabled'}" data-act="doFuse">ゆうごうする</button>
        <button class="btn ghost" data-act="fzClear">えらびなおす</button>
        <button class="btn ghost" data-act="recipes">レシピ</button>
      </div>
      <div class="mon-grid">${cards}</div>`;
  }

  function showRecipes() {
    const html = `<div class="recipes"><h3>ゆうごうレシピ ヒント</h3>
      <ul>${DB.RECIPE_HINTS.map(r => `<li>${r}</li>`).join('')}</ul>
      <button class="btn ghost wide" data-act="closeModal">とじる</button></div>`;
    showModal(html);
  }

  /* ===== ずかん ======================================================== */
  function renderDex() {
    const ids = Object.keys(DB.SPECIES);
    const seen = State.seenCount();
    // コンプ率マイルストーン報酬（30種ごとに 300G）
    const milestones = Math.floor(seen / 30);
    let rewardMsg = '';
    if (milestones > State.data.dexReward) {
      const gain = (milestones - State.data.dexReward) * 300;
      State.addGold(gain); State.data.dexReward = milestones; State.save();
      rewardMsg = `<div class="res-block unlock">🎉 ずかん達成報酬 🪙${gain} を かくとく！</div>`;
    }
    const pctv = Math.round(seen / ids.length * 100);
    const cells = ids.map(id => {
      const s = DB.species(id);
      const ok = State.data.seen[id];
      return `<div class="dex-cell ${ok ? '' : 'unseen'}">
        <div class="dex-emoji">${ok ? s.emoji : '❓'}</div>
        <div class="dex-name">${ok ? s.name : '???'}</div></div>`;
    }).join('');
    root.innerHTML = `${header('ずかん')}
      <p class="hint">はっけん: ${seen} / ${ids.length}（${pctv}%）　30種ごとに ほうしゅう🪙</p>
      ${rewardMsg}
      <div class="dex-grid">${cells}</div>`;
  }

  /* ===== たんけん（エリア選択）======================================== */
  function renderExplore() {
    const cards = DB.AREAS.map(a => {
      const open = State.areaUnlocked(a);
      return `<button class="area-card ${open ? '' : 'locked'}" ${open ? `data-act="enterField" data-area="${a.id}"` : ''}>
        <span class="area-emoji">${a.emoji}</span>
        <span class="area-info"><b>${a.name}</b><br>
          <small>${open ? `てきLv ${a.min}〜${a.max}${a.endless ? '（むげん）' : ''}` : `🔒 ${a.reqWins}かい かつと かいほう`}</small>
        </span>
      </button>`;
    }).join('');
    root.innerHTML = `${header('ゲート — いく世界を えらぶ')}
      <p class="hint">世界をえらんで しゅつげき！ フィールドを 歩き、モンスターに ふれて バトル。奥ほど強い。</p>
      <div class="area-list">${cards}</div>`;
  }

  /* ===== バトル ======================================================== */
  let bs = null;   // battle ui state

  // すべての戦闘の共通入口（フィールド／アリーナ／オンライン／ボス）
  function beginEncounter(defs, meta) {
    const party = State.partyMons();
    if (!party.length) { alert('パーティに モンスターが いません'); return; }
    Battle.start(party, defs, meta || {});
    defs.forEach(d => State.markSeen(d.species));
    bs = { auto: false, ended: false, animating: false, log: [],
           queue: [], qi: 0, actions: [], cmdView: 'root', pending: null,
           targetSide: null, dispHP: {}, dispMP: {}, meta: meta || {} };
    Battle.cur.allies.concat(Battle.cur.enemies).forEach(c => {
      bs.dispHP[c.uid] = c.hp; bs.dispMP[c.uid] = c.mp;
    });
    pushLog((meta && meta.intro) || 'バトル かいし！');
    show('battle');
    beginInputPhase();
  }

  function startBattle(areaId) {
    const area = DB.AREAS[areaId];
    const defs = rollEncounter(area);
    beginEncounter(defs, { mode: 'field', area, intro: `${area.emoji} ${area.name} に てきが あらわれた！` });
  }
  function startBoss() {
    closeModal();
    beginEncounter(Story.BOSS.team.map(t => ({ ...t })),
      { mode: 'boss', name: Story.BOSS.name, intro: `${Story.BOSS.name} が たちはだかった！` });
  }

  function rollEncounter(area) {
    const extra = area.endless ? Math.floor(Math.max(0, State.data.wins - area.reqWins) / 6) : 0;
    let count = 1;
    if (Math.random() < 0.55) count++;
    if (Math.random() < 0.35) count++;
    const defs = [];
    for (let i = 0; i < count; i++) {
      const sp = area.pool[Math.floor(Math.random() * area.pool.length)];
      defs.push({ species: sp, level: Math.max(1, rndInt(area.min, area.max) + extra) });
    }
    return defs;
  }

  function pushLog(t) { bs.log.push(t); if (bs.log.length > 40) bs.log.shift(); }

  function combatCard(c, side) {
    const hp = bs.dispHP[c.uid] != null ? bs.dispHP[c.uid] : c.hp;
    const mp = bs.dispMP[c.uid] != null ? bs.dispMP[c.uid] : c.mp;
    const targetable = bs.cmdView === 'target' &&
      ((bs.targetSide === 'enemy' && side === 'enemy') || (bs.targetSide === 'ally' && side === 'ally'));
    const buffs = Object.keys(c.buffs).length
      ? `<span class="cbuff">${c.buffs.atk ? '⚔️' : ''}${c.buffs.def ? '🛡️' : ''}</span>` : '';
    return `
      <div class="combatant ${side} ${c.alive ? '' : 'dead'} ${targetable ? 'targetable' : ''}"
           data-side="${side}" data-index="${c.index}"
           ${targetable ? `data-act="pickTarget" data-uid="${c.uid}"` : ''}>
        <div class="cb-emoji">${c.emoji}</div>
        <div class="cb-name">${c.name} <span class="lv">Lv${c.level}</span>${buffs}</div>
        <div class="cb-hpbar"><span style="width:${pct(hp, c.maxHP)}%"></span></div>
        <div class="cb-nums">HP ${Math.max(0, Math.round(hp))}${side === 'ally' ? ` <span class="mp">MP ${Math.max(0, Math.round(mp))}</span>` : ''}</div>
      </div>`;
  }

  // バトル画面の組み立て（3Dアリーナ ＋ 下部UI）。最初に1回だけアリーナを作る。
  function renderBattle() {
    if (!Battle.cur) return;
    buildArena();
    refresh();
  }

  function buildArena() {
    root.innerHTML = `
      <div class="battle">
        <div id="arena"><canvas id="arena-canvas"></canvas><div id="hp-overlay"></div></div>
        <div id="bt-dyn"></div>
      </div>`;
    const cv = document.getElementById('arena-canvas');
    const ov = document.getElementById('hp-overlay');
    bs.use3d = Scene3D.init(cv, ov);
    if (bs.use3d) {
      Scene3D.setup(Battle.cur.allies, Battle.cur.enemies);
      Scene3D.updateBars(bs.dispHP, bs.dispMP);
    }
  }

  // 下部UI（ターン情報・ログ・コマンド）だけを更新（アリーナは保持）
  function refresh() {
    if (bs.use3d) { Scene3D.updateBars(bs.dispHP, bs.dispMP); renderBottom(); }
    else render2D();
  }

  function renderBottom() {
    const dyn = document.getElementById('bt-dyn');
    if (!dyn) return;
    const logHtml = bs.log.slice(-4).map(t => `<div>${t}</div>`).join('');
    dyn.innerHTML = `
      <div class="bt-top">
        <span>ターン ${Battle.cur.round}</span>
        <span>さくせん: ${TACTICS[State.data.tactic]}</span>
      </div>
      <div class="bt-log">${logHtml}</div>
      <div class="cmd-area">${renderCommand()}</div>`;
  }

  // WebGL非対応時の 2D フォールバック（従来表示）
  function render2D() {
    const enemies = Battle.cur.enemies.map(c => combatCard(c, 'enemy')).join('');
    const allies = Battle.cur.allies.map(c => combatCard(c, 'ally')).join('');
    const logHtml = bs.log.slice(-4).map(t => `<div>${t}</div>`).join('');
    root.innerHTML = `
      <div class="battle">
        <div class="bt-top">
          <span>ターン ${Battle.cur.round}</span>
          <span>さくせん: ${TACTICS[State.data.tactic]}</span>
        </div>
        <div class="enemy-row">${enemies}</div>
        <div class="bt-log">${logHtml}</div>
        <div class="ally-row">${allies}</div>
        <div class="cmd-area">${renderCommand()}</div>
      </div>`;
  }

  function renderCommand() {
    if (bs.ended) return '';
    if (bs.animating) return `<div class="cmd-wait">…</div>`;
    if (bs.auto) {
      return `<div class="cmd-auto">
        <span>オート せんとうちゅう</span>
        <button class="btn" data-act="autoStop">てうちにもどす</button>
        <button class="btn ghost" data-act="cycleTactic">さくせん: ${TACTICS[State.data.tactic]}</button>
      </div>`;
    }
    const cur = bs.queue[bs.qi];
    if (!cur) return '';
    let body;
    if (bs.cmdView === 'root') {
      body = `
        <button class="cbtn" data-act="cmdAttack">⚔️ たたかう</button>
        <button class="cbtn" data-act="cmdSkills">✨ とくぎ</button>
        <button class="cbtn" data-act="cmdItem">🎒 どうぐ</button>
        <button class="cbtn" data-act="cmdScout">🎯 スカウト</button>
        <button class="cbtn" data-act="cmdDefend">🛡️ ぼうぎょ</button>
        <button class="cbtn" data-act="cmdFlee">🏃 にげる</button>`;
    } else if (bs.cmdView === 'skills') {
      const all = cur.skills.map(id => {
        const sk = DB.skill(id);
        const ok = sk.mp <= cur.mp;
        return `<button class="cbtn skill ${ok ? '' : 'disabled'}" ${ok ? `data-act="cmdPickSkill" data-sid="${id}"` : ''}>
          ${sk.name}<small>MP${sk.mp}</small></button>`;
      }).join('');
      body = `${all || '<div class="cmd-wait">つかえる とくぎが ない</div>'}
        <button class="cbtn back" data-act="cmdBack">← もどる</button>`;
    } else if (bs.cmdView === 'items') {
      const owned = Object.keys(State.ITEM_DEF).filter(k => State.itemCount(k) > 0);
      const list = owned.map(k => {
        const it = State.ITEM_DEF[k];
        return `<button class="cbtn skill" data-act="cmdPickItem" data-key="${k}">${it.name}<small>×${State.itemCount(k)}</small></button>`;
      }).join('');
      body = `${list || '<div class="cmd-wait">どうぐが ない</div>'}
        <button class="cbtn back" data-act="cmdBack">← もどる</button>`;
    } else { // target
      body = `<div class="cmd-target">たいしょうを えらんでね</div>
        <button class="cbtn back" data-act="cmdBack">← もどる</button>`;
    }
    return `
      <div class="cmd-head">▶ ${cur.name} の こうどう</div>
      <div class="cmd-grid">${body}</div>
      <div class="cmd-foot">
        <button class="btn small" data-act="autoRound">おまかせ1ターン</button>
        <button class="btn small" data-act="autoStart">▶ オート</button>
        <button class="btn small ghost" data-act="cycleTactic">${TACTICS[State.data.tactic]}</button>
      </div>`;
  }

  /* ---- コマンド入力フェーズ ---- */
  function beginInputPhase() {
    if (bs.ended) return;
    if (bs.auto) { autoResolveRound(); return; }
    bs.queue = Battle.livingAllies();
    bs.qi = 0; bs.actions = []; bs.cmdView = 'root'; bs.pending = null; bs.targetSide = null;
    if (bs.use3d) Scene3D.setTargetMode(null);
    refresh();
  }

  function commitAction(action) {
    bs.actions.push({ actor: bs.queue[bs.qi], action });
    bs.qi++; bs.cmdView = 'root'; bs.pending = null; bs.targetSide = null;
    if (bs.use3d) Scene3D.setTargetMode(null);
    if (bs.qi >= bs.queue.length) runRound(bs.actions);
    else refresh();
  }

  // ターゲット選択モードへ
  function enterTarget(type, skillId, side) {
    bs.pending = { type, skillId };
    bs.targetSide = side; bs.cmdView = 'target';
    if (bs.use3d) Scene3D.setTargetMode(side);
    refresh();
  }

  async function runRound(actions) {
    const res = Battle.resolveRound(actions && actions.length ? actions : null);
    await animateSteps(res.steps);
    afterRound(res.result);
  }
  function autoResolveRound() {
    if (bs.ended) return;
    runRound(null);
  }

  async function animateSteps(steps) {
    bs.animating = true;
    if (bs.use3d) Scene3D.setTargetMode(null);
    refresh();
    for (const st of steps) {
      if (st.actorUid != null && st.mpAfter != null) bs.dispMP[st.actorUid] = st.mpAfter;
      if (st.targetUid != null && st.hpAfter != null) bs.dispHP[st.targetUid] = st.hpAfter;
      pushLog(st.text);
      if (bs.use3d) {
        if (st.actorUid != null && st.mpAfter != null) Scene3D.act(st.actorUid);
        if (st.fx === 'hit' || st.fx === 'crit') {
          // 魔法スキルは属性別、物理は通常の赤バースト
          const magicEl = st.skillType === 'magic' ? st.el : null;
          Scene3D.hit(st.targetUid, st.fx, magicEl, st.attackerUid);
        }
        else if (st.fx === 'heal') Scene3D.heal(st.targetUid);
        else if (st.fx === 'buff') Scene3D.buff(st.targetUid);
        Scene3D.updateBars(bs.dispHP, bs.dispMP);
        if (st.amount != null && st.targetUid != null) {
          Scene3D.pop(st.targetUid, (st.fx === 'heal' ? '+' : '') + st.amount,
            st.fx === 'heal' ? 'heal' : st.fx === 'crit' ? 'crit' : 'dmg');
        }
        renderBottom();
      } else {
        render2D();
        flashStep(st);
      }
      await sleep(bs.auto ? 360 : 640);
    }
    bs.animating = false;
  }

  function flashStep(st) {
    const sel = st.targetSel || st.actorSel;
    if (!sel) return;
    const card = root.querySelector(`.combatant[data-side="${sel.side}"][data-index="${sel.index}"]`);
    if (!card) return;
    const fxCls = { hit: 'fx-hit', crit: 'fx-crit', heal: 'fx-heal', buff: 'fx-buff', miss: 'fx-miss' }[st.fx];
    if (fxCls) { card.classList.add(fxCls); setTimeout(() => card.classList.remove(fxCls), 350); }
    if (st.amount != null) {
      const f = document.createElement('div');
      f.className = 'float-num ' + (st.fx === 'heal' ? 'heal' : st.fx === 'crit' ? 'crit' : 'dmg');
      f.textContent = (st.fx === 'heal' ? '+' : '') + st.amount;
      card.appendChild(f);
      setTimeout(() => f.remove(), 800);
    }
  }

  function afterRound(result) {
    if (result === 'win') { Battle.syncBack(); return doWin(); }
    if (result === 'lose') return doLose();
    if (result === 'flee') { Battle.syncBack(); bs.ended = true; show('town'); return; }
    if (bs.auto) setTimeout(() => autoResolveRound(), 450);
    else beginInputPhase();
  }

  /* ---- 勝利処理（モードで報酬が変わる）---- */
  function doWin() {
    bs.ended = true;
    const meta = bs.meta || {};
    const enemies = Battle.cur.enemies;
    const exp = Math.max(8, enemies.reduce((s, e) => s + e.level, 0) * 5);
    const party = State.partyMons();
    const lvups = [];
    party.forEach(m => {
      const r = State.gainExp(m, exp);
      if (r.leveled > 0 || r.newSkills.length) {
        lvups.push(`${State.displayName(m)} は Lv${m.level} に！` +
          (r.newSkills.length ? ` ＜${r.newSkills.join('・')}＞ をおぼえた！` : ''));
      }
    });
    const lvBlock = lvups.length ? `<div class="res-block">${lvups.map(t => `<div>${t}</div>`).join('')}</div>` : '';

    // スカウトで仲間になったモンスターを追加（全モード共通）
    const scouted = (Battle.cur.scouted || []).map(sc => {
      const nm = State.makeMonster(sc.species, sc.level);
      return State.addMonster(nm) ? nm : null;
    }).filter(Boolean);
    const scoutBlock = scouted.length ? `<div class="res-block recruit">${scouted.map(m =>
      `<div>🎯 ${DB.species(m.species).emoji} ${State.displayName(m)} を スカウトした！</div>`).join('')}</div>` : '';

    let head = '🎉 しょうり！', reward = '', extra = '', btns = '';

    if (meta.mode === 'arena' || meta.mode === 'online') {
      const r = meta.reward || { gold: 80, rank: 10 };
      State.addGold(r.gold); State.addRank(r.rank);
      head = meta.mode === 'online' ? '🌐 オンライン しょうり！' : '⚔️ ランクマッチ しょうり！';
      reward = `<p class="exp">けいけんち ${exp} ／ 🪙${r.gold} ／ 🏅+${r.rank}pt</p>`;
      extra = `<div class="res-block">ランク: ${State.rankName()}（${State.data.rank}pt）</div>`;
      btns = `<button class="btn primary" data-act="town">まちへ もどる</button>`;
    } else if (meta.mode === 'boss') {
      State.addGold(800); State.data.bossBeaten = true; State.save();
      head = '👑 まおうを たおした！';
      reward = `<p class="exp">けいけんち ${exp} ／ 🪙800</p>`;
      extra = `<div class="res-block unlock">世界に へいわが もどった！ マスターに ほうこくしよう。</div>`;
      btns = `<button class="btn primary" data-act="town">まちへ もどる</button>`;
    } else {
      // フィールド（ゲート）。スカウトが主なので 自然加入は控えめ
      const recruited = [];
      enemies.forEach(e => {
        if (e.scouted) return;
        const sp = DB.species(e.species);
        if (Math.random() < (sp.recruit || 0) * 0.3) {
          const nm = State.makeMonster(e.species, Math.max(1, e.level - 1));
          if (State.addMonster(nm)) recruited.push(nm);
        }
      });
      let gold = enemies.reduce((s, e) => s + e.level, 0) * 3 + 8;
      let bossBlock = '';
      if (meta.boss && meta.area) {
        gold += 200 + meta.area.id * 100;
        if (!State.isCleared(meta.area.id)) { State.markCleared(meta.area.id); }
        head = '👑 フィールドの ぬしを たおした！';
        bossBlock = `<div class="res-block unlock">「${meta.area.name}」を せいは！ ボーナスゴールド獲得！</div>`;
      }
      State.addGold(gold);
      const prevWins = State.data.wins;
      State.addWin(meta.boss ? 3 : 1);
      const newAreas = DB.AREAS.filter(a => a.reqWins > 0 && prevWins < a.reqWins && State.data.wins >= a.reqWins);
      const goalDone = Story.canAdvance() ? `<div class="res-block unlock">🎯 もくひょう たっせい！ マスターに はなしに いこう</div>` : '';
      reward = `<p class="exp">けいけんち ${exp} ／ 🪙${gold}</p>`;
      extra = bossBlock +
        (recruited.length ? `<div class="res-block recruit">${recruited.map(m => `<div>🤝 ${DB.species(m.species).emoji} ${State.displayName(m)} が なかまに なった！</div>`).join('')}</div>` : '') +
        (newAreas.length ? `<div class="res-block unlock">${newAreas.map(a => `<div>🔓 ゲートに 新しい世界「${a.name}」が！</div>`).join('')}</div>` : '') +
        goalDone;
      btns = meta.fromOverworld
        ? `<button class="btn primary" data-act="world">マップへ もどる</button>
           <button class="btn" data-act="town">まちへ</button>`
        : meta.fromField
        ? `<button class="btn primary" data-act="field">ぼうけんを つづける</button>
           <button class="btn" data-act="town">まちへ</button>`
        : `<button class="btn primary" data-act="enter" data-area="${meta.area.id}">もういちど</button>
           <button class="btn" data-act="town">まちへ</button>`;
    }

    showModal(`<div class="result win"><h2>${head}</h2>${reward}${lvBlock}${scoutBlock}${extra}
      <div class="res-btns">${btns}</div></div>`, true);
  }

  function doLose() {
    bs.ended = true;
    const lost = Math.floor(State.data.gold / 2);
    State.addGold(-lost);
    State.healAll();   // 拠点に運ばれ そせい
    showModal(`<div class="result lose">
      <h2>💧 ぜんめつ…</h2>
      <p>きずついた モンスターたちは やどやで かいふくした。<br>${lost > 0 ? `🪙${lost} を おとした…` : ''}</p>
      <div class="res-btns"><button class="btn primary" data-act="town">まちへ もどる</button></div>
    </div>`, true);
  }

  /* ===== モーダル ====================================================== */
  function showModal(html, noClose) {
    closeModal();
    const ov = document.createElement('div');
    ov.id = 'overlay';
    ov.innerHTML = `<div class="modal">${html}</div>`;
    if (!noClose) ov.addEventListener('click', (e) => { if (e.target === ov) closeModal(); });
    document.body.appendChild(ov);
  }
  function closeModal() {
    const ov = document.getElementById('overlay');
    if (ov) ov.remove();
  }

  /* ===== ヘッダー ====================================================== */
  function header(title) {
    return `<div class="topbar">
      <button class="back-btn" data-act="back">← もどる</button>
      <span class="topbar-title">${title}</span></div>`;
  }

  /* ===== さくせん切替 ================================================== */
  function cycleTactic() {
    const order = ['balance', 'gangan', 'daiji'];
    const i = order.indexOf(State.data.tactic);
    State.data.tactic = order[(i + 1) % order.length];
    State.save();
  }

  /* ===== せってい ====================================================== */
  function renderSettings() {
    root.innerHTML = `${header('せってい')}
      <div class="settings">
        <div class="set-row">
          <b>デフォルトの さくせん</b><br>
          <button class="btn" data-act="cycleTactic2">${TACTICS[State.data.tactic]}（タップで へんこう）</button>
        </div>
        <div class="set-row">
          <b>データ</b><br>
          <button class="btn danger" data-act="reset">さいしょから やりなおす</button>
        </div>
        <p class="hint">セーブは じどう（このブラウザ内に ほぞん）。</p>
      </div>`;
  }

  /* ===== クリック ディスパッチ ======================================== */
  const ACTIONS = {
    home: () => show('home'),
    town: () => show('town'),
    back: () => show(backTarget),
    box: () => show('box'),
    fusion: () => { fuseA = null; fuseB = null; show('fusion'); },
    explore: () => show('explore'),
    dex: () => show('dex'),
    settings: () => show('settings'),
    closeModal: () => closeModal(),

    // タイトル / 町
    startAdventure: () => { backTarget = 'home'; show('town'); },
    dexFromTitle: () => goScreen('dex', 'home'),
    settingsFromTitle: () => goScreen('settings', 'home'),
    worldInteract: () => { if (World.active) World.interact(); },
    closeFacility: () => { closeModal(); if (World.active) World.resume(); },
    dlgNext: () => {
      if (!dlg) { closeModal(); return; }
      if (dlg.i < dlg.lines.length - 1) { dlg.i++; renderDialogue(); }
      else { closeModal(); const cb = dlg.onDone; dlg = null; if (cb) cb(); }
    },
    townMenu: () => {
      World.pause();
      showModal(`<div class="dialogue"><div class="dlg-spk">≡ メニュー</div>
        <div class="res-btns">
          <button class="btn" data-act="dexFromTown">📖 ずかん</button>
          <button class="btn" data-act="tacticFromTown">さくせん: ${TACTICS[State.data.tactic]}</button>
          <button class="btn ghost" data-act="titleFromTown">タイトルへ</button>
          <button class="btn ghost" data-act="closeFacility">とじる</button>
        </div></div>`, true);
    },
    dexFromTown: () => goScreen('dex', 'town'),
    tacticFromTown: () => { cycleTactic(); ACTIONS.townMenu(); },
    titleFromTown: () => { closeModal(); show('home'); },

    // ストーリー / アリーナ / ショップ
    startBoss: () => startBoss(),
    arenaMatch: (d) => {
      const m = Arena.makeMatch(d.tier);
      closeModal();
      beginEncounter(m.defs, { mode: 'arena', reward: m.reward, name: 'ランクマッチ',
        intro: `ランクマッチ（${m.tier}）かいし！` });
    },
    arenaOnline: async () => {
      if (!Online.available()) { showOnlineSetup(); return; }
      showModal(`<div class="dialogue"><div class="dlg-text">あいてを さがしています…🌐</div></div>`, true);
      try {
        await Online.publishTeam();
        const opp = await Online.findOpponent();
        closeModal();
        if (!opp) { alert('いま たいせんあいてが いません。あとで ためしてね'); World.resume(); return; }
        beginEncounter(opp.defs, { mode: 'online', name: opp.name,
          reward: { gold: 130, rank: 22 }, intro: `${opp.name} の チームと たいせん！` });
      } catch (e) { closeModal(); alert('オンラインに せつぞくできませんでした'); World.resume(); }
    },
    buy: (d) => { if (State.buy(d.key)) renderShop(); else alert('ゴールドが たりません'); },
    buySeed: (d) => { if (State.buy(d.key)) renderShop(); else alert('ゴールドが たりません'); },
    useSeedMenu: (d) => showSeedMenu(+d.uid),
    doSeed: (d) => {
      if (State.useSeed(d.key, +d.uid)) { closeModal(); showDetail(+d.uid); }
    },

    detail: (d) => showDetail(+d.uid),
    togParty: (d) => {
      if (!State.toggleParty(+d.uid)) alert('パーティは 1〜3たいまで');
      showDetail(+d.uid);
    },
    rename: (d) => {
      const m = State.getById(+d.uid);
      const nv = window.prompt('あたらしい なまえ（からっぽで もとにもどす）', m.nickname || '');
      if (nv !== null) { m.nickname = nv.slice(0, 8); State.save(); showDetail(+d.uid); }
    },
    release: (d) => {
      const m = State.getById(+d.uid);
      if (window.confirm(`${State.displayName(m)} を にがしますか？`)) {
        State.release(+d.uid); closeModal(); show('box');
      }
    },

    // 配合
    fzPick: (d) => {
      const uid = +d.uid;
      if (fuseA === uid) fuseA = null;
      else if (fuseB === uid) fuseB = null;
      else if (!fuseA) fuseA = uid;
      else if (!fuseB) fuseB = uid;
      else fuseB = uid;
      renderFusion();
    },
    fzClear: () => { fuseA = null; fuseB = null; renderFusion(); },
    recipes: () => showRecipes(),
    doFuse: () => {
      if (!(fuseA && fuseB && fuseA !== fuseB)) return;
      const res = State.fuse(fuseA, fuseB);
      if (!res.ok) { alert(res.msg); return; }
      const rs = DB.species(res.child.species);
      const inhNames = (res.child.inherited || []).map(id => DB.skill(id).name);
      fuseA = null; fuseB = null;
      const html = `<div class="result fuse">
        <h2>✨ ゆうごう せいこう！</h2>
        <div class="fz-remoji big">${rs.emoji}</div>
        <div class="fz-rname"><b class="rankbadge">ランク${DB.rankLabel(rs)}</b> ${rs.name} <span class="plus">+${res.child.plus}</span> が うまれた！</div>
        ${inhNames.length ? `<div class="res-block">受け継いだ特技: ${inhNames.join('・')}</div>` : ''}
        <p class="hint">親の力を継ぎ、初期ステータスUP。強い親どうしを 重ねるほど 強くなる！</p>
        <div class="res-btns">
          <button class="btn primary" data-act="afterFuse">つづける</button>
        </div></div>`;
      showModal(html, true);
    },
    afterFuse: () => { closeModal(); show('fusion'); },

    // たんけん / バトル
    enter: (d) => { closeModal(); startBattle(+d.area); },
    enterField: (d) => { closeModal(); enterField(+d.area); },
    field: () => { closeModal(); show('field'); },
    world: () => { closeModal(); show('world'); },

    cmdAttack: () => { enterTarget('attack', null, 'enemy'); },
    cmdScout: () => { enterTarget('scout', null, 'enemy'); },
    cmdSkills: () => { bs.cmdView = 'skills'; if (bs.use3d) Scene3D.setTargetMode(null); refresh(); },
    cmdItem: () => { bs.cmdView = 'items'; if (bs.use3d) Scene3D.setTargetMode(null); refresh(); },
    cmdPickItem: (d) => {
      bs.pending = { type: 'item', itemKey: d.key, skillId: null };
      bs.targetSide = 'ally'; bs.cmdView = 'target';
      if (bs.use3d) Scene3D.setTargetMode('ally', true);
      refresh();
    },
    cmdDefend: () => commitAction({ type: 'defend' }),
    cmdFlee: () => commitAction({ type: 'flee' }),
    cmdBack: () => { bs.cmdView = 'root'; bs.pending = null; bs.targetSide = null; if (bs.use3d) Scene3D.setTargetMode(null); refresh(); },
    cmdPickSkill: (d) => {
      const sk = DB.skill(d.sid);
      if (sk.type === 'heal' && sk.target === 'one') enterTarget('skill', d.sid, 'ally');
      else if (sk.type === 'heal' && sk.target === 'allyAll') commitAction({ type: 'skill', skillId: d.sid, targetUid: null });
      else if (sk.type === 'buff') commitAction({ type: 'skill', skillId: d.sid, targetUid: bs.queue[bs.qi].uid });
      else if (sk.target === 'all') commitAction({ type: 'skill', skillId: d.sid, targetUid: null });
      else enterTarget('skill', d.sid, 'enemy');
    },
    pickTarget: (d) => {
      commitAction({ type: bs.pending.type, skillId: bs.pending.skillId, itemKey: bs.pending.itemKey, targetUid: +d.uid });
    },
    autoRound: () => { bs.cmdView = 'root'; if (bs.use3d) Scene3D.setTargetMode(null); runRound(null); },
    autoStart: () => { bs.auto = true; if (bs.use3d) Scene3D.setTargetMode(null); refresh(); autoResolveRound(); },
    autoStop: () => { bs.auto = false; beginInputPhase(); },
    cycleTactic: () => { cycleTactic(); refresh(); },
    cycleTactic2: () => { cycleTactic(); renderSettings(); },

    reset: () => { if (window.confirm('データをけして さいしょから はじめますか？')) { State.reset(); fuseA = fuseB = null; show('home'); } },
  };

  function onClick(e) {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const act = t.dataset.act;
    if (ACTIONS[act]) { e.preventDefault(); ACTIONS[act](t.dataset, t, e); }
  }

  /* ===== 起動 ========================================================== */
  function init() {
    document.addEventListener('click', onClick);
    State.load();
    show('home');
  }

  return { init, show, facility: onFacility, _fieldEncounter: onFieldEncounter };
})();
