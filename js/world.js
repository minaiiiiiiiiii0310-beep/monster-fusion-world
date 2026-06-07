/* =========================================================================
 *  world.js  —  歩ける3Dの町（拠点マップ）
 *  プレイヤーを移動させ、施設に近づいて「はいる」と各機能へ。
 * =======================================================================*/
const World = (() => {
  let renderer, scene, camera, raf = null, canvas, labelLayer;
  let player, follower;
  let facilities = [];     // {id,name,emoji,x,z,r,group,label}
  let roamers = [];        // フィールドの徘徊モンスター {group,label,species,level,x,z,...}
  let chests = [];         // フィールドの宝箱
  let masterLabel;
  let keys = {}, mv = { x: 0, y: 0 };
  let active = false, paused = false;
  let nearby = null;
  let onInteract = null, onEncounter = null, onChest = null;
  let mode = 'town', areaCfg = null, encounterPending = false;
  let last = 0, clock = 0, saveT = 0;
  const POS = { x: 0, z: 12 };
  let angle = Math.PI;

  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const mat = (hex, o = {}) => new THREE.MeshStandardMaterial({
    color: hex, roughness: o.rough ?? 0.8, metalness: o.metal ?? 0.0, flatShading: o.flat ?? true });
  const shade = (hex, f) => new THREE.Color(hex).multiplyScalar(f).getHex();

  /* ---- 施設レイアウト --------------------------------------------------- */
  const LAYOUT = [
    { id: 'gate',   name: 'ゲート',     emoji: '🌀', x: 0,   z: -13, color: 0x6b54c8, big: true },
    { id: 'inn',    name: 'やどや',     emoji: '🛏️', x: -11, z: -8,  color: 0xc77f3a },
    { id: 'fusion', name: 'ゆうごうじょ', emoji: '🥚', x: 11,  z: -8,  color: 0x4aa3b5 },
    { id: 'ranch',  name: 'モンスターぼくじょう', emoji: '🐾', x: -13, z: 2, color: 0x5fa84a },
    { id: 'shop',   name: 'どうぐや',   emoji: '🛒', x: 13,  z: 2,  color: 0xc9a14a },
    { id: 'arena',  name: 'とうぎじょう', emoji: '⚔️', x: 0,   z: 9,  color: 0xb05050, big: true },
  ];

  /* ---- 初期化 ---------------------------------------------------------- */
  function init(cv, labels, interactCb, opts) {
    dispose();
    opts = opts || {};
    canvas = cv; labelLayer = labels; onInteract = interactCb;
    mode = opts.mode || 'town';
    areaCfg = opts.area || null;
    onEncounter = opts.onEncounter || null;
    onChest = opts.onChest || null;
    encounterPending = false;
    if (mode === 'field') { POS.x = 0; POS.z = 16; angle = Math.PI; }
    else { const p = State.data.player || { x: 0, z: 12, angle: Math.PI }; POS.x = p.x; POS.z = p.z; angle = p.angle == null ? Math.PI : p.angle; }

    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
      const w = canvas.clientWidth || 360, h = canvas.clientHeight || 480;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(w, h, false);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.15;

      scene = new THREE.Scene();
      scene.background = sky();
      scene.fog = new THREE.Fog(0x9fc6e8, 26, 60);

      camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 200);

      scene.add(new THREE.HemisphereLight(0xdff0ff, 0x4a6a3a, 1.1));
      const sun = new THREE.DirectionalLight(0xfff2d8, 1.5);
      sun.position.set(8, 16, 10); scene.add(sun);

      buildGround();
      facilities = []; roamers = []; chests = [];
      labelLayer.innerHTML = '';
      if (mode === 'field') buildField();
      else { LAYOUT.forEach(f => buildFacility(f)); buildMaster(); }
      buildPlayer();
    } catch (e) {
      console.error('World.init failed:', e);
      dispose();
      return false;
    }

    active = true; paused = false; clock = 0; last = performance.now();
    bindKeys();
    loop();
    window.addEventListener('resize', onResize);
    renderFrame();
    return true;
  }

  function sky() {
    const c = document.createElement('canvas'); c.width = 8; c.height = 256;
    const ctx = c.getContext('2d'); const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#6fb7f0'); g.addColorStop(0.6, '#bfe0f5'); g.addColorStop(1, '#e9f4d8');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 8, 256);
    return new THREE.CanvasTexture(c);
  }

  function buildGround() {
    const fieldMode = mode === 'field';
    const groundCol = fieldMode ? 0x5a8f48 : 0x6fae54;
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(70, 70),
      new THREE.MeshStandardMaterial({ color: groundCol, roughness: 1 }));
    grass.rotation.x = -Math.PI / 2; scene.add(grass);
    if (!fieldMode) {
      // 町：中央の広場（石だたみ）
      const plaza = new THREE.Mesh(new THREE.CircleGeometry(9, 40),
        new THREE.MeshStandardMaterial({ color: 0xb9b2a0, roughness: 1 }));
      plaza.rotation.x = -Math.PI / 2; plaza.position.y = 0.02; scene.add(plaza);
      for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; tree(Math.cos(a) * 22, Math.sin(a) * 22); }
    } else {
      // フィールド：奥に行くほど色が暗い「危険ゾーン」＋まばらな木
      const danger = new THREE.Mesh(new THREE.PlaneGeometry(70, 28),
        new THREE.MeshStandardMaterial({ color: 0x3a4a30, roughness: 1, transparent: true, opacity: 0.6 }));
      danger.rotation.x = -Math.PI / 2; danger.position.set(0, 0.015, -20); scene.add(danger);
      for (let i = 0; i < 14; i++) tree((Math.random() - 0.5) * 60, -24 + Math.random() * 36);
    }
  }
  function tree(x, z) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 1.2, 6), mat(0x7a5230));
    trunk.position.y = 0.6; g.add(trunk);
    const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1, 0), mat(0x4f9a3e));
    leaf.position.y = 1.8; g.add(leaf);
    g.position.set(x, 0, z); scene.add(g);
  }

  function buildFacility(f) {
    const g = new THREE.Group();
    const s = f.big ? 1.4 : 1.0;
    const W = 4.2 * s, H = 3.0 * s, D = 4.2 * s;
    const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), mat(f.color, { rough: 0.9 }));
    body.position.y = H / 2; g.add(body);
    // 屋根
    const roof = new THREE.Mesh(new THREE.ConeGeometry(W * 0.82, 1.8 * s, 4),
      mat(shade(f.color, 0.6), { rough: 0.9 }));
    roof.position.y = H + 0.9 * s; roof.rotation.y = Math.PI / 4; g.add(roof);
    // ドア（手前 +z 側）
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.9, 0.2), mat(0x3a2a1a));
    door.position.set(0, 0.95, D / 2 + 0.01); g.add(door);
    g.position.set(f.x, 0, f.z); scene.add(g);

    // 看板ラベル（HTML）
    const label = document.createElement('div');
    label.className = 'world-label';
    label.innerHTML = `<span class="wl-emoji">${f.emoji}</span><span class="wl-name">${f.name}</span>`;
    labelLayer.appendChild(label);

    facilities.push({ ...f, group: g, label, top: H + 2.0 * s, doorZ: f.z + D / 2, r: Math.max(W, D) / 2 });
  }

  function buildMaster() {
    const g = new THREE.Group();
    const robe = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.7, 1.5, 8), mat(0x5b3a8c));
    robe.position.y = 0.75; g.add(robe);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 12), mat(0xf0c9a0));
    head.position.y = 1.7; g.add(head);
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.8, 8), mat(0x442a6e));
    hat.position.y = 2.15; g.add(hat);
    g.position.set(0, 0, 3); g.rotation.y = Math.PI; scene.add(g);
    masterLabel = document.createElement('div');
    masterLabel.className = 'world-label master';
    masterLabel.innerHTML = `<span class="wl-emoji">🧙</span><span class="wl-name">マスター</span>`;
    labelLayer.appendChild(masterLabel);
    facilities.push({ id: 'master', name: 'マスター', x: 0, z: 3, group: g, label: masterLabel, top: 2.6, doorZ: 3.6, r: 1.2, isMaster: true });
  }

  /* ---- フィールド（徘徊モンスター）------------------------------------ */
  function buildField() {
    // 出口（入口）の門：南(z大)に配置
    const g = new THREE.Group();
    const arch = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.28, 8, 16), mat(0x8a6a3a));
    arch.position.y = 1.6; g.add(arch);
    g.position.set(0, 0, 19); scene.add(g);
    const label = document.createElement('div');
    label.className = 'world-label';
    label.innerHTML = `<span class="wl-emoji">🚪</span><span class="wl-name">まちへ もどる</span>`;
    labelLayer.appendChild(label);
    facilities.push({ id: 'exit', name: 'まちへ もどる', x: 0, z: 19, group: g, label, top: 3.2, r: 1.4 });

    spawnRoamers();
    spawnChests();
    spawnBoss();
  }

  function spawnRoamers() {
    if (!areaCfg) return;
    const pool = areaCfg.pool, n = 8;
    const extra = areaCfg.endless ? Math.floor(Math.max(0, State.data.wins - areaCfg.reqWins) / 6) : 0;
    for (let i = 0; i < n; i++) {
      const sp = pool[Math.floor(Math.random() * pool.length)];
      const x = (Math.random() - 0.5) * 40, z = -22 + Math.random() * 34;
      const depth = Math.max(0, Math.min(1, (14 - z) / 36));
      const lvl = Math.max(1, Math.round(areaCfg.min + (areaCfg.max - areaCfg.min) * depth) + extra);
      buildRoamer(sp, lvl, x, z, false);
    }
  }

  // フィールドの主（ボス）：未クリアなら最奥に出現
  function spawnBoss() {
    if (!areaCfg || State.isCleared(areaCfg.id)) return;
    const pool = areaCfg.pool;
    // プールで最も高ランクの種をボスに
    let bossSp = pool[0], bestRank = 0;
    pool.forEach(id => { const s = DB.species(id); if (s && s.rank > bestRank) { bestRank = s.rank; bossSp = id; } });
    const extra = areaCfg.endless ? Math.floor(Math.max(0, State.data.wins - areaCfg.reqWins) / 6) : 0;
    buildRoamer(bossSp, areaCfg.max + 4 + extra, 0, -23, true);
  }

  function buildRoamer(sp, level, x, z, isBoss) {
    const s = DB.species(sp); if (!s) return;
    const g = new THREE.Group();
    const col = new THREE.Color(DB.ELEMENTS[s.el].color).getHex();
    const r = isBoss ? 1.2 : 0.6;
    const body = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), mat(col, { rough: 0.5 }));
    body.scale.set(1, 0.85, 1); body.position.y = r; g.add(body);
    [-r * 0.33, r * 0.33].forEach(sx => {
      const e = new THREE.Mesh(new THREE.SphereGeometry(r * 0.17, 8, 8), mat(0xffffff, { flat: false }));
      e.position.set(sx, r * 1.2, r * 0.75); g.add(e);
    });
    if (isBoss) { body.material.emissive = new THREE.Color(col); body.material.emissiveIntensity = 0.4; }
    g.position.set(x, 0, z); scene.add(g);
    const label = document.createElement('div');
    label.className = 'world-label roamer' + (isBoss ? ' boss' : '');
    label.innerHTML = `<span class="wl-emoji">${isBoss ? '👑' : ''}${s.emoji}</span><span class="wl-name">Lv${level}</span>`;
    labelLayer.appendChild(label);
    const a = Math.random() * 6.28;
    roamers.push({ group: g, label, species: sp, level, x, z, vx: Math.sin(a), vz: Math.cos(a),
      turn: 1 + Math.random() * 2, t: 0, top: isBoss ? 2.8 : 1.5, isBoss: !!isBoss, speed: isBoss ? 1.2 : 2.0 });
  }

  function spawnChests() {
    for (let i = 0; i < 4; i++) {
      const x = (Math.random() - 0.5) * 44, z = -22 + Math.random() * 36;
      const reward = Math.random() < 0.5
        ? { type: 'gold', amount: 30 + Math.floor(Math.random() * 80) }
        : { type: 'item', key: ['herb', 'elixir', 'atk', 'def', 'spd', 'hp'][Math.floor(Math.random() * 6)] };
      buildChest(x, z, reward);
    }
  }
  function buildChest(x, z, reward) {
    const g = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.5), mat(0xb9892f, { metal: 0.3, rough: 0.5 }));
    box.position.y = 0.3; g.add(box);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.18, 0.54), mat(0x8a5f1f, { metal: 0.3 }));
    lid.position.y = 0.6; g.add(lid);
    g.position.set(x, 0, z); scene.add(g);
    const label = document.createElement('div');
    label.className = 'world-label chest';
    label.innerHTML = `<span class="wl-emoji">🎁</span>`;
    labelLayer.appendChild(label);
    chests.push({ group: g, label, x, z, top: 1.1, reward, dead: false });
  }

  function buildPlayer() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.4, 0.9, 8), mat(0x3060c0));
    body.position.y = 0.65; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 12), mat(0xf0c39a));
    head.position.y = 1.35; g.add(head);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.31, 12, 12), mat(0x4a2f1a));
    hair.scale.set(1, 0.6, 1); hair.position.y = 1.5; g.add(hair);
    const cape = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.8, 0.08), mat(0xc83838));
    cape.position.set(0, 0.75, -0.28); g.add(cape);
    g.position.set(POS.x, 0, POS.z); g.rotation.y = angle;
    scene.add(g); player = g;

    // 先頭モンスターが ついてくる
    const lead = State.partyMons()[0];
    if (lead) {
      const fg = new THREE.Group();
      const col = new THREE.Color(DB.ELEMENTS[DB.species(lead.species).el].color).getHex();
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 1), mat(col, { rough: 0.5 }));
      b.scale.set(1, 0.85, 1); b.position.y = 0.45; fg.add(b);
      fg.position.set(POS.x, 0, POS.z + 1.2); scene.add(fg);
      follower = { group: fg, tx: POS.x, tz: POS.z + 1.2 };
    }
  }

  /* ---- 入力 ------------------------------------------------------------ */
  function bindKeys() {
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
  }
  function onKey(e) {
    if (!active || paused) return;
    const k = e.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
    keys[k] = true;
    if (k === 'e' || k === 'enter' || k === ' ') interact();
  }
  function onKeyUp(e) { keys[e.key.toLowerCase()] = false; }
  function setMove(x, y) { mv.x = x; mv.y = y; }   // ジョイスティック（-1..1）

  function inputVec() {
    let x = mv.x, z = mv.y;   // y(下)=+z(手前)
    if (keys['a'] || keys['arrowleft']) x -= 1;
    if (keys['d'] || keys['arrowright']) x += 1;
    if (keys['w'] || keys['arrowup']) z -= 1;
    if (keys['s'] || keys['arrowdown']) z += 1;
    const len = Math.hypot(x, z);
    if (len > 1) { x /= len; z /= len; }
    return { x, z, len: Math.min(1, len) };
  }

  /* ---- 更新 ------------------------------------------------------------ */
  function update(dt) {
    if (paused) return;
    const inp = inputVec();
    const speed = 7.5;
    let nx = POS.x + inp.x * speed * dt;
    let nz = POS.z + inp.z * speed * dt;

    // 施設との衝突（円で押し出し）。exit はすり抜け可
    facilities.forEach(f => {
      if (f.id === 'exit') return;
      const dx = nx - f.x, dz = nz - f.z;
      const d = Math.hypot(dx, dz);
      const min = f.r + 0.7;
      if (d < min && d > 0.0001) { nx = f.x + dx / d * min; nz = f.z + dz / d * min; }
    });
    // 外周
    const bound = mode === 'field' ? 26 : 22;
    nx = Math.max(-bound, Math.min(bound, nx));
    nz = Math.max(mode === 'field' ? -26 : -22, Math.min(mode === 'field' ? 22 : 22, nz));
    POS.x = nx; POS.z = nz;

    // 徘徊モンスターの移動＆接触判定（フィールドのみ）
    if (mode === 'field' && !encounterPending) {
      for (const r of roamers) {
        if (r.dead) continue;
        r.t += dt;
        if (r.t > r.turn) { r.t = 0; r.turn = 1.5 + Math.random() * 2.5; const a = Math.random() * 6.28; r.vx = Math.sin(a); r.vz = Math.cos(a); }
        r.x += r.vx * (r.speed || 2) * dt; r.z += r.vz * (r.speed || 2) * dt;
        if (r.x < -26 || r.x > 26) { r.vx *= -1; r.x = Math.max(-26, Math.min(26, r.x)); }
        if (r.z < -26 || r.z > 18) { r.vz *= -1; r.z = Math.max(-26, Math.min(18, r.z)); }
        r.group.position.set(r.x, 0.05 + Math.abs(Math.sin(clock * 4 + r.x)) * 0.12, r.z);
        if (Math.hypot(POS.x - r.x, POS.z - r.z) < (r.isBoss ? 2.0 : 1.5)) {
          encounterPending = true; r.dead = true;
          if (onEncounter) onEncounter({ species: r.species, level: r.level, boss: r.isBoss });
          break;
        }
      }
      // 宝箱の接触
      for (const c of chests) {
        if (c.dead) continue;
        if (Math.hypot(POS.x - c.x, POS.z - c.z) < 1.3) {
          c.dead = true; scene.remove(c.group); c.label.style.display = 'none';
          if (onChest) onChest(c.reward);
        }
      }
    }

    if (inp.len > 0.05) {
      const desired = Math.atan2(inp.x, inp.z);
      angle = lerpAngle(angle, desired, 0.2);
    }
    player.position.set(POS.x, Math.abs(Math.sin(clock * 9)) * (inp.len > 0.05 ? 0.08 : 0) , POS.z);
    player.rotation.y = angle;

    // フォロワー追従
    if (follower) {
      const fg = follower.group;
      const tx = POS.x - Math.sin(angle) * 1.3, tz = POS.z - Math.cos(angle) * 1.3;
      fg.position.x += (tx - fg.position.x) * Math.min(1, dt * 5);
      fg.position.z += (tz - fg.position.z) * Math.min(1, dt * 5);
      fg.position.y = Math.abs(Math.sin(clock * 4)) * 0.1;
    }

    // カメラ追従
    camera.position.set(POS.x, 9.5, POS.z + 12);
    camera.lookAt(POS.x, 1.2, POS.z - 3);

    // 近接施設の判定
    let best = null, bestD = 99;
    facilities.forEach(f => {
      const d = Math.hypot(POS.x - f.x, POS.z - f.z);
      if (d < f.r + 2.6 && d < bestD) { bestD = d; best = f; }
    });
    if (best !== nearby) {
      nearby = best;
      if (typeof onNearbyChange === 'function') onNearbyChange(nearby);
    }

    // 位置の自動セーブ（町のみ・2秒ごと）
    saveT += dt;
    if (saveT > 2) { saveT = 0; if (mode === 'town') State.setPlayerPos(POS.x, POS.z, angle); }
  }

  let onNearbyChange = null;
  function setNearbyCallback(cb) { onNearbyChange = cb; }

  function lerpAngle(a, b, t) {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  }

  function loop() {
    if (paused) { raf = null; return; }
    raf = requestAnimationFrame(loop);
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000); last = now; clock += dt;
    update(dt);
    renderer.render(scene, camera);
    positionLabels();
  }
  function renderFrame() {
    if (!active || !renderer) return;
    update(0); renderer.render(scene, camera); positionLabels();
  }

  function positionLabels() {
    const rect = canvas.getBoundingClientRect();
    facilities.forEach(f => {
      const top = V(f.x, f.top || 2.4, f.z);
      top.project(camera);
      if (top.z > 1) { f.label.style.display = 'none'; return; }
      f.label.style.display = '';
      f.label.style.left = (top.x * 0.5 + 0.5) * rect.width + 'px';
      f.label.style.top = (-top.y * 0.5 + 0.5) * rect.height + 'px';
      f.label.classList.toggle('near', nearby === f);
    });
    const place = (o) => {
      if (o.dead) { o.label.style.display = 'none'; return; }
      const top = V(o.x, o.top, o.z); top.project(camera);
      if (top.z > 1) { o.label.style.display = 'none'; return; }
      o.label.style.display = '';
      o.label.style.left = (top.x * 0.5 + 0.5) * rect.width + 'px';
      o.label.style.top = (-top.y * 0.5 + 0.5) * rect.height + 'px';
    };
    roamers.forEach(place);
    chests.forEach(place);
  }

  /* ---- 操作 ------------------------------------------------------------ */
  function interact() {
    if (nearby && onInteract) { savePos(); onInteract(nearby.id); }
  }
  function savePos() { if (mode === 'town') { State.setPlayerPos(POS.x, POS.z, angle); State.save(); } }

  function pause() { paused = true; if (raf) { cancelAnimationFrame(raf); raf = null; } }
  function resume() { if (paused && active) { paused = false; last = performance.now(); loop(); } }

  function onResize() {
    if (!active || !canvas) return;
    const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }

  function dispose() {
    if (active) savePos();
    if (raf) { cancelAnimationFrame(raf); raf = null; }
    window.removeEventListener('resize', onResize);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('keyup', onKeyUp);
    if (renderer) { try { renderer.dispose(); renderer.forceContextLoss(); } catch (e) {} renderer = null; }
    facilities = []; roamers = []; chests = []; keys = {}; mv = { x: 0, y: 0 }; nearby = null;
    active = false; paused = false; scene = null; camera = null; player = null; follower = null;
  }

  return {
    init, dispose, pause, resume, setMove, interact, savePos, renderFrame, setNearbyCallback,
    get active() { return active; }, get nearby() { return nearby; },
  };
})();
