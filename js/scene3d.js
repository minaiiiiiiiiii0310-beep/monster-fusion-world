/* =========================================================================
 *  scene3d.js  —  Three.js による 3D バトル表示（ビジュアル強化版）
 *
 *  各モンスターは「アーキタイプ × 属性 × ランク」の3層で組み立てる:
 *    1) アーキタイプ: 体型ベース(blob/beast/bird/dragon/humanoid/golem/bug/fish/plant)
 *    2) 属性フレア : ほのお/みず/くさ/かぜ/つち/いかずち/ひかり/やみ ごとの装飾
 *    3) ランクフレア: 高ランク(5+)で軌道オーブ・(7+)で結晶クラウン
 *
 *  すべて Three.js のプリミティブの組み合わせ。ビルド不要・依存ゼロ。
 * =======================================================================*/
const Scene3D = (() => {
  let renderer, scene, camera, raf = null, overlay, canvas;
  let entries = [];          // {uid, side, group, base, dir, phase, top, mats, plate, hpFill, mpFill, hpText, anim, dead, deadShown, glow, decos, shadow, maxHP, maxMP}
  let clock = 0, last = 0;
  let active = false;
  let paused = false;
  let targetSide = null;

  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  /* ---- 初期化 ---------------------------------------------------------- */
  function init(cv, ov) {
    dispose();
    canvas = cv; overlay = ov;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    } catch (e) { return false; }
    const w = canvas.clientWidth || 360, h = canvas.clientHeight || 300;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;

    scene = new THREE.Scene();
    scene.background = makeSky();
    scene.fog = new THREE.Fog(0x141a2c, 14, 30);

    // 横長/正方形/縦長 どちらでも被写体が画面内に納まるよう FOV と注視点を調整
    const aspect = w / h;
    const fov = aspect < 1.2 ? 52 : 44;          // 縦長気味なら広角に
    camera = new THREE.PerspectiveCamera(fov, aspect, 0.1, 100);
    // 味方(z=3)〜敵(z=-3.2)が両方入るよう、高め＆後ろ＆中央を注視
    camera.position.set(0, 5.4, 10.0);
    camera.lookAt(0, 1.4, 0.2);

    // 鳥山明風のコントラスト高めライティング：環境光抑えめ＋強い順光＋強い逆光
    scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x33281a, 0.65));
    // キー（順光・暖色）
    const key = new THREE.DirectionalLight(0xfff0d0, 2.0);
    key.position.set(4, 9, 6);
    scene.add(key);
    // フィル
    const fill = new THREE.DirectionalLight(0xffffff, 0.35);
    fill.position.set(0, 4, 9);
    scene.add(fill);
    // 逆光（リム）— 縁取りを強調
    const rim = new THREE.DirectionalLight(0xaecbff, 1.2);
    rim.position.set(-5, 4, -6);
    scene.add(rim);
    // バックスポット（さらに縁を立たせる）
    const back = new THREE.DirectionalLight(0xffe7c2, 0.7);
    back.position.set(6, 6, -8);
    scene.add(back);

    // 地面
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(11, 48),
      new THREE.MeshStandardMaterial({ color: 0x3a4870, roughness: 0.95 }));
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
    // アリーナリング
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(3.4, 3.6, 64),
      new THREE.MeshBasicMaterial({ color: 0x44608f, transparent: true, opacity: 0.55 }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.011;
    scene.add(ring);
    // 内側のグラデ
    const innerRing = new THREE.Mesh(
      new THREE.RingGeometry(2.5, 2.55, 48),
      new THREE.MeshBasicMaterial({ color: 0x6f8ed0, transparent: true, opacity: 0.28 }));
    innerRing.rotation.x = -Math.PI / 2; innerRing.position.y = 0.012;
    scene.add(innerRing);

    active = true; clock = 0; last = performance.now();
    loop();
    window.addEventListener('resize', onResize);
    return true;
  }

  function makeSky() {
    const c = document.createElement('canvas'); c.width = 8; c.height = 256;
    const g = c.getContext('2d').createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#1b2745'); g.addColorStop(0.55, '#141a2c'); g.addColorStop(1, '#0c0f17');
    const ctx = c.getContext('2d'); ctx.fillStyle = g; ctx.fillRect(0, 0, 8, 256);
    const tex = new THREE.CanvasTexture(c); return tex;
  }

  function onResize() {
    if (!active || !canvas) return;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }

  /* ---- マテリアル & パーツ -------------------------------------------- */
  function mat(hex, opts = {}) {
    // 鳥山明風: 色の彩度をブースト（暗すぎ・薄すぎを避ける）
    const c = new THREE.Color(hex);
    if (!opts.raw) {
      // 彩度を1.2倍、明度を0.92倍にしてビビッドに
      const hsl = { h: 0, s: 0, l: 0 };
      c.getHSL(hsl);
      c.setHSL(hsl.h, Math.min(1, hsl.s * 1.25), Math.min(0.95, hsl.l * 0.96));
    }
    const m = new THREE.MeshStandardMaterial({
      color: c,
      roughness: opts.rough ?? 0.65,
      metalness: opts.metal ?? 0.04,
      flatShading: opts.flat ?? true,
      transparent: true,
      opacity: opts.opacity ?? 1,
      emissive: opts.emissive != null ? new THREE.Color(opts.emissive) : new THREE.Color(0x000000),
      emissiveIntensity: opts.emissiveIntensity ?? 1,
    });
    if (opts.outline !== false) m.userData.outlineable = true;  // ハイライト・小物以外
    return m;
  }
  const shade = (hex, f) => new THREE.Color(hex).multiplyScalar(f).getHex();
  const mix = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t).getHex();

  /* 反転裏面シェルでセル風アウトラインを追加（鳥山明風の太い縁取り）。
   * 大きめのジオメトリだけを対象（小物・装飾はスキップ）。
   */
  function addOutlines(group, options = {}) {
    const minRadius = options.minRadius ?? 0.16;
    const scale = options.scale ?? 1.06;
    const color = options.color ?? 0x101018;
    const toAdd = [];
    group.traverse(obj => {
      if (!obj.isMesh) return;
      if (!obj.material || !obj.material.userData || !obj.material.userData.outlineable) return;
      // ジオメトリのサイズで取捨選択（目のハイライトのような極小は無視）
      if (!obj.geometry.boundingSphere) obj.geometry.computeBoundingSphere();
      const r = obj.geometry.boundingSphere.radius;
      if (r < minRadius) return;
      // 装飾用（透過の薄いもの・発光強いもの）はアウトラインしない
      if (obj.material.opacity < 0.85) return;
      toAdd.push({ obj, r });
    });
    toAdd.forEach(({ obj }) => {
      const outlineMat = new THREE.MeshBasicMaterial({
        color, side: THREE.BackSide, transparent: false,
      });
      const shell = new THREE.Mesh(obj.geometry, outlineMat);
      shell.position.copy(obj.position);
      shell.rotation.copy(obj.rotation);
      shell.scale.copy(obj.scale).multiplyScalar(scale);
      // 親に追加（兄弟として）
      obj.parent.add(shell);
      shell.renderOrder = -1;   // 中身より先に描画
    });
  }

  /* かわいい顔: 大きめの目 + ハイライト + 口 + 眉 + 任意のほっぺ（鳥山明風） */
  function face(group, y, z, spread, size, mats, opts = {}) {
    [-spread, spread].forEach(sx => {
      // 白目
      const w = new THREE.Mesh(new THREE.SphereGeometry(size, 16, 16),
        mat(0xffffff, { flat: false, rough: 0.2 }));
      w.position.set(sx, y, z); group.add(w); mats.push(w.material);
      // 瞳（縦長で漫画的に）
      const p = new THREE.Mesh(new THREE.SphereGeometry(size * 0.62, 12, 12),
        mat(0x1a1a26, { flat: false, rough: 0.3 }));
      p.position.set(sx, y - size * 0.05, z + size * 0.7);
      p.scale.set(1, 1.2, 0.9);
      group.add(p); mats.push(p.material);
      // きらめき(emissive・大きめ)
      const hl = new THREE.Mesh(new THREE.SphereGeometry(size * 0.28, 10, 10),
        mat(0xffffff, { flat: false, rough: 0.1, emissive: 0xffffff, emissiveIntensity: 0.7, outline: false }));
      hl.position.set(sx + size * 0.18, y + size * 0.28, z + size * 0.95);
      group.add(hl); mats.push(hl.material);
    });
    // 眉（鳥山明風のシャープな線）
    if (opts.brow !== false) {
      [-spread, spread].forEach(sx => {
        const brow = new THREE.Mesh(
          new THREE.BoxGeometry(size * 0.9, size * 0.18, size * 0.2),
          mat(opts.browColor ?? 0x1a1a22, { flat: false, rough: 0.5, outline: false }));
        brow.position.set(sx, y + size * 1.05, z + size * 0.6);
        brow.rotation.z = sx > 0 ? -0.18 : 0.18;     // への字（怒り眉）少しだけ
        group.add(brow); mats.push(brow.material);
      });
    }
    if (opts.mouth !== false) {
      const mm = new THREE.Mesh(new THREE.BoxGeometry(size * 0.7, size * 0.14, size * 0.18),
        mat(0x261a26, { flat: false, rough: 0.6, outline: false }));
      mm.position.set(0, y - size * 1.05, z + 0.02); group.add(mm); mats.push(mm.material);
    }
    if (opts.blush) {
      [-spread * 1.55, spread * 1.55].forEach(sx => {
        const cb = new THREE.Mesh(new THREE.SphereGeometry(size * 0.55, 10, 10),
          mat(0xff8aa8, { flat: false, rough: 0.55, opacity: 0.7, outline: false }));
        cb.position.set(sx, y - size * 0.55, z * 0.9 + 0.01);
        cb.scale.set(1, 0.7, 0.6);
        group.add(cb); mats.push(cb.material);
      });
    }
  }

  function horn(group, x, y, z, mats, col = 0xf2e9d8) {
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.5, 8), mat(col, { rough: 0.4 }));
    c.position.set(x, y, z); c.rotation.z = x > 0 ? -0.3 : 0.3; group.add(c); mats.push(c.material);
  }

  /* お腹のパッチ（明るい色のハイライト） */
  function belly(group, y, z, w, h, col, mats) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 14), mat(col, { flat: false, rough: 0.5 }));
    b.scale.set(w, h, 0.5); b.position.set(0, y, z); group.add(b); mats.push(b.material);
  }

  /* ---- アーキタイプ別 モデル（強化版） ------------------------------- */
  function buildBlob(col, m) {
    const g = new THREE.Group();
    // つるんとした本体
    const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.92, 2),
      mat(col, { rough: 0.35, opacity: 0.96 }));
    body.scale.set(1, 0.88, 1); body.position.y = 0.85; g.add(body); m.push(body.material);
    // お腹ハイライト
    belly(g, 0.65, 0.45, 1.05, 0.9, mix(col, 0xffffff, 0.35), m);
    // 頭の上のヒトデアンテナ
    const ant = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 10),
      mat(mix(col, 0xffffff, 0.5), { flat: false, rough: 0.4 }));
    ant.position.set(0, 1.85, 0); g.add(ant); m.push(ant.material);
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.25, 6),
      mat(shade(col, 0.6))); stalk.position.set(0, 1.7, 0); g.add(stalk); m.push(stalk.material);
    face(g, 0.95, 0.72, 0.28, 0.15, m, { blush: true });
    g.userData.top = 2.0; return g;
  }

  function buildBeast(col, m) {
    const g = new THREE.Group();
    // 胴
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.85, 0.9), mat(col, { flat: true }));
    body.position.set(0, 0.95, 0); g.add(body); m.push(body.material);
    // お腹
    const bel = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.5, 0.05),
      mat(mix(col, 0xffffff, 0.3))); bel.position.set(0, 0.85, 0.48); g.add(bel); m.push(bel.material);
    // 頭
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.72, 0.72), mat(shade(col, 1.1)));
    head.position.set(0, 1.22, 0.78); g.add(head); m.push(head.material);
    // 鼻（小さなボックス）
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.1),
      mat(0x2a1a22, { flat: false, rough: 0.5 }));
    nose.position.set(0, 1.18, 1.16); g.add(nose); m.push(nose.material);
    // 脚
    [-0.45, 0.45].forEach(sx => [0.45, -0.45].forEach(sz => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.7, 0.24), mat(shade(col, 0.8)));
      leg.position.set(sx, 0.35, sz); g.add(leg); m.push(leg.material);
      // 足先（足の甲を少し明るく）
      const paw = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.12, 0.32),
        mat(shade(col, 0.65), { rough: 0.7 }));
      paw.position.set(sx, 0.06, sz + 0.04); g.add(paw); m.push(paw.material);
    }));
    // 耳
    [-0.3, 0.3].forEach(sx => {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.36, 6), mat(shade(col, 1.1)));
      ear.position.set(sx, 1.66, 0.7); g.add(ear); m.push(ear.material);
      // 耳の内側（ピンク）
      const inner = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.2, 6),
        mat(0xff9bb6, { flat: false, rough: 0.5 }));
      inner.position.set(sx, 1.62, 0.74); g.add(inner); m.push(inner.material);
    });
    // しっぽ
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.14, 0.75, 8), mat(shade(col, 0.9)));
    tail.position.set(0, 1.12, -0.65); tail.rotation.x = 0.85; g.add(tail); m.push(tail.material);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 12), mat(mix(col, 0xffffff, 0.3)));
    tip.position.set(0, 1.55, -0.95); g.add(tip); m.push(tip.material);
    face(g, 1.3, 1.13, 0.2, 0.12, m, { blush: true });
    g.userData.top = 2.05; return g;
  }

  function buildBird(col, m) {
    const g = new THREE.Group();
    // 体
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.72, 16, 16), mat(col, { flat: false, rough: 0.55 }));
    body.scale.set(1, 1.15, 1); body.position.y = 1.0; g.add(body); m.push(body.material);
    // お腹
    belly(g, 0.85, 0.45, 1.0, 1.2, mix(col, 0xffffff, 0.45), m);
    // くちばし(上下)
    const beakU = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.4, 8), mat(0xffb13d));
    beakU.position.set(0, 1.18, 0.72); beakU.rotation.x = Math.PI / 2; g.add(beakU); m.push(beakU.material);
    const beakD = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.3, 8), mat(0xe09230));
    beakD.position.set(0, 1.04, 0.7); beakD.rotation.x = Math.PI / 2; g.add(beakD); m.push(beakD.material);
    // つばさ
    [-1, 1].forEach(s => {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.55, 0.08), mat(shade(col, 0.8)));
      wing.position.set(s * 0.75, 1.0, -0.1); wing.rotation.y = s * 0.5; g.add(wing); m.push(wing.material);
      // 羽根の先（明るい色のチップ）
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.35, 0.05), mat(mix(col, 0xffffff, 0.35)));
      tip.position.set(s * 1.15, 0.95, -0.25); tip.rotation.y = s * 0.65; g.add(tip); m.push(tip.material);
    });
    // 脚
    [-0.22, 0.22].forEach(sx => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.45, 6), mat(0xffb13d));
      leg.position.set(sx, 0.42, 0.05); g.add(leg); m.push(leg.material);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 0.18), mat(0xe09230));
      foot.position.set(sx, 0.18, 0.1); g.add(foot); m.push(foot.material);
    });
    // 頭の羽根
    const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.32, 5), mat(mix(col, 0xffffff, 0.4)));
    tuft.position.set(0, 1.85, -0.1); tuft.rotation.x = -0.3; g.add(tuft); m.push(tuft.material);
    face(g, 1.22, 0.55, 0.22, 0.115, m, { blush: true });
    g.userData.top = 2.0; return g;
  }

  function buildDragon(col, m) {
    const g = new THREE.Group();
    // 体
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.88, 16, 16), mat(col, { flat: false, rough: 0.45, metal: 0.1 }));
    body.scale.set(1, 1.05, 1.3); body.position.y = 1.0; g.add(body); m.push(body.material);
    // お腹（鱗パターン風の明るい横長）
    belly(g, 0.85, 0.55, 1.2, 0.8, mix(col, 0xffeacc, 0.4), m);
    // 首
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, 1.0, 12), mat(shade(col, 1.05)));
    neck.position.set(0, 1.75, 0.55); neck.rotation.x = 0.5; g.add(neck); m.push(neck.material);
    // 頭
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.55, 0.85), mat(shade(col, 1.1), { flat: true }));
    head.position.set(0, 2.2, 1.02); g.add(head); m.push(head.material);
    // 口先のあご
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.18, 0.5),
      mat(shade(col, 0.85))); jaw.position.set(0, 2.0, 1.2); g.add(jaw); m.push(jaw.material);
    // 翼（2セグメント風）
    [-1, 1].forEach(s => {
      const w1 = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.85, 0.06), mat(shade(col, 0.78), { opacity: 0.92 }));
      w1.position.set(s * 0.95, 1.55, -0.35); w1.rotation.set(0.2, s * 0.7, s * 0.2);
      g.add(w1); m.push(w1.material);
      const w2 = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, 0.06), mat(mix(col, 0x000000, 0.15), { opacity: 0.9 }));
      w2.position.set(s * 1.5, 1.3, -0.55); w2.rotation.set(0.3, s * 0.9, s * 0.2);
      g.add(w2); m.push(w2.material);
    });
    // 尾＋スパイク3つ
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.32, 1.4, 10), mat(shade(col, 0.9)));
    tail.position.set(0, 0.95, -1.05); tail.rotation.x = -1.3; g.add(tail); m.push(tail.material);
    [0.0, 0.4, 0.8].forEach(t => {
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.22, 5),
        mat(mix(col, 0xffffff, 0.3))); sp.position.set(0, 1.4 - t * 0.4, -0.5 - t * 0.45);
      sp.rotation.x = -0.6; g.add(sp); m.push(sp.material);
    });
    // 角
    horn(g, -0.22, 2.5, 0.95, m); horn(g, 0.22, 2.5, 0.95, m);
    // 目（鋭め・ほっぺ無し）
    face(g, 2.3, 1.32, 0.18, 0.1, m, { blush: false });
    g.userData.top = 2.95; return g;
  }

  function buildHumanoid(col, m, demon) {
    const g = new THREE.Group();
    // 胴
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.0, 0.45), mat(col));
    torso.position.y = 1.15; g.add(torso); m.push(torso.material);
    // 胸の宝石/プレート
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.13, 0),
      mat(mix(col, 0xffffff, 0.55), { flat: true, rough: 0.25, emissive: col, emissiveIntensity: 0.5 }));
    gem.position.set(0, 1.35, 0.24); g.add(gem); m.push(gem.material);
    // 頭
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.38, 16, 16), mat(shade(col, 1.1), { flat: false }));
    head.position.y = 1.97; g.add(head); m.push(head.material);
    // 髪/フード
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      mat(shade(col, 0.7), { rough: 0.7 }));
    hood.position.y = 2.12; g.add(hood); m.push(hood.material);
    // 腕
    [-0.5, 0.5].forEach(s => {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.85, 9), mat(shade(col, 0.95)));
      arm.position.set(s, 1.15, 0); arm.rotation.z = s * 0.25; g.add(arm); m.push(arm.material);
      // 手
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 10), mat(shade(col, 1.05)));
      hand.position.set(s * 0.72, 0.7, 0); g.add(hand); m.push(hand.material);
    });
    // 脚
    [-0.22, 0.22].forEach(s => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.8, 9), mat(shade(col, 0.85)));
      leg.position.set(s, 0.4, 0); g.add(leg); m.push(leg.material);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 0.32), mat(shade(col, 0.65)));
      foot.position.set(s, 0.05, 0.08); g.add(foot); m.push(foot.material);
    });
    // 悪魔: 角＋翼
    if (demon) {
      horn(g, -0.2, 2.28, 0, m, mix(col, 0x000000, 0.4));
      horn(g, 0.2, 2.28, 0, m, mix(col, 0x000000, 0.4));
      [-1, 1].forEach(s => {
        const wing = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.75, 0.05),
          mat(shade(col, 0.55), { opacity: 0.85 }));
        wing.position.set(s * 0.7, 1.4, -0.3); wing.rotation.y = s * 0.6; g.add(wing); m.push(wing.material);
        // 翼の骨
        const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.85, 5),
          mat(mix(col, 0x000000, 0.55)));
        bone.position.set(s * 0.95, 1.4, -0.32); bone.rotation.set(0, s * 0.6, Math.PI / 2);
        g.add(bone); m.push(bone.material);
      });
    }
    face(g, 2.02, 0.32, 0.13, 0.085, m, { blush: !demon });
    g.userData.top = 2.55; return g;
  }

  function buildGolem(col, m) {
    const g = new THREE.Group();
    // 胴
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.25, 0.95),
      mat(col, { rough: 0.92, metal: 0.25, flat: true }));
    body.position.y = 1.3; g.add(body); m.push(body.material);
    // クラック（中心の光るライン）
    const crack = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.0, 0.04),
      mat(mix(col, 0xffffff, 0.6), { flat: false, emissive: col, emissiveIntensity: 0.8 }));
    crack.position.set(0, 1.3, 0.48); g.add(crack); m.push(crack.material);
    // 頭
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), mat(shade(col, 1.1), { rough: 0.9 }));
    head.position.y = 2.2; g.add(head); m.push(head.material);
    // 顎
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.15, 0.5), mat(shade(col, 0.85)));
    jaw.position.set(0, 1.9, 0.05); g.add(jaw); m.push(jaw.material);
    // 肩のロックバンプ
    [-0.6, 0.6].forEach(s => {
      const bump = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22, 0), mat(shade(col, 0.95), { rough: 0.95 }));
      bump.position.set(s, 1.85, 0); g.add(bump); m.push(bump.material);
    });
    // 腕
    [-0.78, 0.78].forEach(s => {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.36, 1.05, 0.36), mat(shade(col, 0.85), { rough: 0.9 }));
      arm.position.set(s, 1.25, 0); g.add(arm); m.push(arm.material);
      const fist = new THREE.Mesh(new THREE.DodecahedronGeometry(0.26, 0), mat(shade(col, 0.7), { rough: 0.95 }));
      fist.position.set(s, 0.65, 0); g.add(fist); m.push(fist.material);
    });
    // 脚
    [-0.33, 0.33].forEach(s => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.7, 0.42), mat(shade(col, 0.8), { rough: 0.9 }));
      leg.position.set(s, 0.35, 0); g.add(leg); m.push(leg.material);
    });
    // 目（発光）
    [-0.14, 0.14].forEach(sx => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 10),
        mat(0xffe26a, { flat: false, emissive: 0xffaa22, emissiveIntensity: 1.1 }));
      eye.position.set(sx, 2.22, 0.32); g.add(eye); m.push(eye.material);
    });
    g.userData.top = 2.65; return g;
  }

  function buildBug(col, m) {
    const g = new THREE.Group();
    // 多節体
    [0.55, 0, -0.55].forEach((z, i) => {
      const seg = new THREE.Mesh(new THREE.SphereGeometry(0.6 - i * 0.06, 14, 14),
        mat(shade(col, 1 - i * 0.06), { metal: 0.35, rough: 0.4 }));
      seg.position.set(0, 0.62, z); g.add(seg); m.push(seg.material);
    });
    // 脚
    [-1, 1].forEach(s => [0.45, 0, -0.45].forEach(z => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.65, 5), mat(shade(col, 0.7)));
      leg.position.set(s * 0.55, 0.35, z); leg.rotation.z = s * 0.9; g.add(leg); m.push(leg.material);
      const ft = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), mat(0x222226));
      ft.position.set(s * 0.85, 0.1, z); g.add(ft); m.push(ft.material);
    }));
    // 触角
    [-0.18, 0.18].forEach(sx => {
      const a = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.45, 5),
        mat(shade(col, 0.7))); a.position.set(sx, 1.1, 0.78); a.rotation.x = -0.3;
      g.add(a); m.push(a.material);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8),
        mat(mix(col, 0xffffff, 0.5), { emissive: col, emissiveIntensity: 0.4 }));
      tip.position.set(sx, 1.3, 0.95); g.add(tip); m.push(tip.material);
    });
    // 大きめの複眼
    [-0.2, 0.2].forEach(sx => {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.18, 14, 14),
        mat(0x1a1a26, { flat: false, rough: 0.15, metal: 0.5 }));
      e.position.set(sx, 0.82, 0.62); g.add(e); m.push(e.material);
      const hl = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8),
        mat(0xffffff, { flat: false, emissive: 0xffffff, emissiveIntensity: 0.6 }));
      hl.position.set(sx + 0.06, 0.92, 0.75); g.add(hl); m.push(hl.material);
    });
    g.userData.top = 1.55; return g;
  }

  function buildFish(col, m) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.82, 18, 18), mat(col, { rough: 0.4, metal: 0.15 }));
    body.scale.set(1.45, 0.95, 0.9); body.position.y = 0.95; g.add(body); m.push(body.material);
    // お腹（明るい）
    belly(g, 0.7, 0.05, 1.6, 0.7, mix(col, 0xffffff, 0.55), m);
    // しっぽ
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.7, 5), mat(shade(col, 0.85), { opacity: 0.92 }));
    tail.position.set(0, 0.95, -1.0); tail.rotation.x = Math.PI / 2; g.add(tail); m.push(tail.material);
    // 背びれ
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.55, 5), mat(shade(col, 0.9), { opacity: 0.92 }));
    fin.position.set(0, 1.55, 0); g.add(fin); m.push(fin.material);
    // 横ひれ
    [-1, 1].forEach(s => {
      const sf = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.4, 4), mat(shade(col, 0.85), { opacity: 0.9 }));
      sf.position.set(s * 0.75, 0.95, 0.15); sf.rotation.z = s * 1.0; g.add(sf); m.push(sf.material);
    });
    // 鰓
    [-0.55, 0.55].forEach(sx => {
      const g1 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.18, 0.05),
        mat(shade(col, 0.7))); g1.position.set(sx, 0.95, 0.55); g.add(g1); m.push(g1.material);
    });
    face(g, 1.12, 0.85, 0.32, 0.13, m, { blush: true });
    g.userData.top = 1.95; return g;
  }

  function buildPlant(col, m) {
    const g = new THREE.Group();
    // 鉢
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.42, 0.5, 10),
      mat(0x8a5a3a, { rough: 0.9 }));
    pot.position.y = 0.3; g.add(pot); m.push(pot.material);
    // 鉢のフチ
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, 8, 16),
      mat(0xa6764a, { rough: 0.8 }));
    rim.position.y = 0.55; rim.rotation.x = Math.PI / 2; g.add(rim); m.push(rim.material);
    // 球根（本体）
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.58, 16, 16),
      mat(col, { flat: false, rough: 0.5 }));
    bulb.position.y = 0.98; g.add(bulb); m.push(bulb.material);
    // 葉
    [0, 1, 2, 3, 4].forEach(i => {
      const a = i / 5 * Math.PI * 2;
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.75, 5),
        mat(mix(col, 0x44aa44, 0.4)));
      leaf.position.set(Math.cos(a) * 0.5, 1.45, Math.sin(a) * 0.5);
      leaf.rotation.set(0.55 * Math.cos(a + Math.PI), 0, 0.55 * Math.sin(a));
      g.add(leaf); m.push(leaf.material);
    });
    // 真ん中の花/ヘタ
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 10),
      mat(mix(col, 0xffeb6e, 0.5), { emissive: 0xffaa00, emissiveIntensity: 0.4 }));
    top.position.y = 1.9; g.add(top); m.push(top.material);
    face(g, 0.95, 0.55, 0.22, 0.13, m, { blush: true });
    g.userData.top = 2.05; return g;
  }

  /* ---- 属性フレア（種ごとに頭頂部・周囲に装飾） --------------------- */
  function addElementFlair(group, el, topH, mats, decos) {
    if (!el || el === 'none') return;
    const ELC = DB.ELEMENTS[el].color;
    switch (el) {
      case 'fire': {
        // 炎の冠
        for (let i = 0; i < 3; i++) {
          const offset = i - 1;
          const h = 0.55 - Math.abs(offset) * 0.12;
          const flame = new THREE.Mesh(new THREE.ConeGeometry(0.13 - Math.abs(offset) * 0.02, h, 6),
            mat(0xff5a1a, { flat: true, rough: 0.4, emissive: 0xff3300, emissiveIntensity: 0.95, opacity: 0.95 }));
          flame.position.set(offset * 0.18, topH + h * 0.4 - 0.08, 0);
          flame.rotation.z = offset * 0.18;
          group.add(flame); mats.push(flame.material);
          decos.push({ obj: flame, kind: 'flame', phase: Math.random() * 6.28 });
        }
        break;
      }
      case 'water': {
        // 氷の結晶
        [-0.2, 0, 0.2].forEach((x, i) => {
          const h = i === 1 ? 0.42 : 0.3;
          const c = new THREE.Mesh(new THREE.ConeGeometry(0.09, h, 5),
            mat(0xbfe6ff, { flat: true, rough: 0.15, metal: 0.45, opacity: 0.92, emissive: 0x3a78c8, emissiveIntensity: 0.5 }));
          c.position.set(x, topH - 0.04 + (i === 1 ? 0.06 : -0.02), 0);
          group.add(c); mats.push(c.material);
        });
        break;
      }
      case 'grass': {
        // 葉のクラスタ
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.32, 4),
            mat(0x6bcc55, { flat: true }));
          leaf.position.set(Math.cos(a) * 0.16, topH + 0.1, Math.sin(a) * 0.16);
          leaf.rotation.set(Math.PI / 3 * Math.cos(a), 0, Math.PI / 3 * Math.sin(a));
          group.add(leaf); mats.push(leaf.material);
        }
        // 花の蕾
        const bud = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 12),
          mat(0xffeb6e, { flat: false, rough: 0.4, emissive: 0xffaa00, emissiveIntensity: 0.5 }));
        bud.position.set(0, topH + 0.22, 0);
        group.add(bud); mats.push(bud.material);
        break;
      }
      case 'wind': {
        // 旋風リング
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.04, 8, 28),
          mat(0xaaffe0, { flat: false, opacity: 0.7, rough: 0.3, emissive: 0x44ddaa, emissiveIntensity: 0.7 }));
        ring.position.set(0, topH + 0.18, 0);
        ring.rotation.x = Math.PI / 2;
        group.add(ring); mats.push(ring.material);
        decos.push({ obj: ring, kind: 'spin', axis: 'z', speed: 2.2 });
        break;
      }
      case 'earth': {
        // 岩のコブ
        for (let i = 0; i < 4; i++) {
          const a = i / 4 * Math.PI * 2 + 0.4;
          const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.13, 0),
            mat(0x9a7b4a, { flat: true, rough: 0.95 }));
          rock.position.set(Math.cos(a) * 0.55, topH * 0.55 + 0.1, Math.sin(a) * 0.35);
          rock.rotation.set(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28);
          group.add(rock); mats.push(rock.material);
        }
        break;
      }
      case 'thunder': {
        // 稲妻のトサカ
        for (let i = 0; i < 3; i++) {
          const c = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.32, 4),
            mat(0xffe04a, { flat: true, emissive: 0xffaa00, emissiveIntensity: 0.95 }));
          c.position.set(-0.18 + i * 0.18, topH + 0.12, 0);
          c.rotation.z = (i % 2 === 0 ? 0.35 : -0.35);
          group.add(c); mats.push(c.material);
          decos.push({ obj: c, kind: 'spark', phase: Math.random() * 6.28 });
        }
        break;
      }
      case 'light': {
        // 光輪
        const halo = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.05, 8, 28),
          mat(0xfff5a8, { flat: false, opacity: 0.9, rough: 0.15, emissive: 0xffd544, emissiveIntensity: 1.0 }));
        halo.position.set(0, topH + 0.32, 0);
        halo.rotation.x = Math.PI / 2;
        group.add(halo); mats.push(halo.material);
        decos.push({ obj: halo, kind: 'spin', axis: 'z', speed: 1.4 });
        break;
      }
      case 'dark': {
        // 闇のトゲ
        for (let i = 0; i < 4; i++) {
          const a = i / 4 * Math.PI * 2 + Math.PI / 4;
          const tendril = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.45, 4),
            mat(0x5e3aab, { flat: true, opacity: 0.88, emissive: 0x301a55, emissiveIntensity: 0.85 }));
          tendril.position.set(Math.cos(a) * 0.28, topH + 0.18, Math.sin(a) * 0.28);
          tendril.rotation.z = Math.cos(a) * 0.4;
          tendril.rotation.x = Math.sin(a) * 0.4;
          group.add(tendril); mats.push(tendril.material);
        }
        // 中央の暗黒オーブ
        const orb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 12),
          mat(0x2a0f55, { flat: false, opacity: 0.85, emissive: 0x7a3aff, emissiveIntensity: 0.7 }));
        orb.position.set(0, topH + 0.2, 0);
        group.add(orb); mats.push(orb.material);
        decos.push({ obj: orb, kind: 'pulse', phase: 0 });
        break;
      }
    }
  }

  /* ---- ランクフレア（軌道オーブ・結晶クラウン・台座光） -------------- */
  function addRankFlair(group, rank, colorHex, topH, mats, decos) {
    // rank 5+: 周回オーブ
    if (rank >= 5) {
      const n = rank >= 7 ? 6 : (rank >= 6 ? 4 : 3);
      for (let i = 0; i < n; i++) {
        const a0 = i / n * Math.PI * 2;
        const orb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 12),
          mat(colorHex, { flat: false, opacity: 0.85, emissive: colorHex, emissiveIntensity: 1.2 }));
        group.add(orb); mats.push(orb.material);
        decos.push({
          obj: orb, kind: 'orbit',
          radius: 0.85 + (i % 2) * 0.12,
          angle: a0,
          speed: 0.6 + (rank - 5) * 0.15,
          h: topH * 0.55 + (i % 2) * 0.2,
        });
      }
    }
    // rank 7+: 結晶クラウン
    if (rank >= 7) {
      for (let i = 0; i < 5; i++) {
        const a = i / 5 * Math.PI * 2 + Math.PI / 10;
        const cr = new THREE.Mesh(new THREE.OctahedronGeometry(0.13, 0),
          mat(colorHex, { flat: true, opacity: 0.92, emissive: colorHex, emissiveIntensity: 1.0 }));
        cr.position.set(Math.cos(a) * 0.4, topH + 0.18, Math.sin(a) * 0.4);
        group.add(cr); mats.push(cr.material);
        decos.push({ obj: cr, kind: 'spin', axis: 'y', speed: 0.6 });
      }
    }
    // rank 6+: 足元の魔法陣
    if (rank >= 6) {
      const disc = new THREE.Mesh(
        new THREE.RingGeometry(0.6, 0.85, 32),
        new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.42, side: THREE.DoubleSide }));
      disc.rotation.x = -Math.PI / 2;
      disc.position.y = 0.03;
      group.add(disc);
      decos.push({ obj: disc, kind: 'spin', axis: 'z', speed: 0.7, isBasic: true });
    }
  }

  /* ---- 全体ビルド ----------------------------------------------------- */
  function buildCreature(species) {
    const m = [];
    const decos = [];
    const col = new THREE.Color(DB.ELEMENTS[species.el].color).getHex();
    const demon = species.el === 'dark';
    let g;
    switch (species.arch) {
      case 'blob':     g = buildBlob(col, m); break;
      case 'beast':    g = buildBeast(col, m); break;
      case 'bird':     g = buildBird(col, m); break;
      case 'plant':    g = buildPlant(col, m); break;
      case 'bug':      g = buildBug(col, m); break;
      case 'humanoid': g = buildHumanoid(col, m, demon); break;
      case 'fish':     g = buildFish(col, m); break;
      case 'dragon':   g = buildDragon(col, m); break;
      case 'golem':    g = buildGolem(col, m); break;
      default:         g = buildBlob(col, m);
    }
    const baseTop = g.userData.top;
    // 属性フレア → ランクフレア の順
    addElementFlair(g, species.el, baseTop, m, decos);
    addRankFlair(g, species.rank, col, baseTop, m, decos);

    // 鳥山明風アウトライン（最後に追加：装飾より小さいものはスキップ）
    addOutlines(g, { minRadius: 0.16, scale: 1.06 });

    const s = 0.74 + Math.min(species.rank, 7) * 0.1;
    g.scale.setScalar(s);
    g.userData.glow = species.rank >= 4 ? new THREE.Color(DB.ELEMENTS[species.el].color) : null;
    return {
      group: g,
      mats: m,
      decos,
      top: (baseTop + (species.rank >= 7 ? 0.35 : species.rank >= 5 ? 0.2 : 0.1)) * s,
      glow: g.userData.glow,
      scale: s,
    };
  }

  /* ---- セットアップ --------------------------------------------------- */
  function spread(n, gap) {
    if (n <= 1) return [0];
    const arr = []; const start = -(n - 1) / 2;
    for (let i = 0; i < n; i++) arr.push((start + i) * gap);
    return arr;
  }

  function setup(allies, enemies) {
    entries.forEach(e => {
      scene.remove(e.group);
      if (e.shadow) scene.remove(e.shadow);
    });
    entries = [];
    overlay.innerHTML = '';
    addSide(enemies, 'enemy', -3.0, Math.PI);   // 奥・手前を向く
    addSide(allies, 'ally', 2.4, 0);            // 手前・奥を向く（画面内に収まるよう少し奥へ）
    renderFrame();
  }

  function addSide(list, side, z, rotY) {
    const xs = spread(list.length, 2.3);
    list.forEach((c, i) => {
      const sp = DB.species(c.species);
      const built = buildCreature(sp);
      const g = built.group;
      g.position.set(xs[i], 0, z);
      g.rotation.y = rotY;
      scene.add(g);

      // 接地シャドウ（個別の暗い円）
      const shadow = new THREE.Mesh(
        new THREE.CircleGeometry(0.65 * built.scale, 28),
        new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45 })
      );
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.set(xs[i], 0.02, z);
      scene.add(shadow);

      const plate = document.createElement('div');
      plate.className = 'plate ' + side;
      plate.innerHTML = `<div class="pl-name">${c.name}<span class="pl-lv">Lv${c.level}</span></div>
        <div class="pl-hp"><span></span></div>` +
        (side === 'ally' ? `<div class="pl-mp"><span></span></div>` : '');
      overlay.appendChild(plate);

      entries.push({
        uid: c.uid, side, group: g, base: V(xs[i], 0, z), dir: side === 'ally' ? -1 : 1,
        phase: Math.random() * 6.28, top: built.top, mats: built.mats, glow: built.glow,
        decos: built.decos, shadow,
        maxHP: c.maxHP, maxMP: c.maxMP,
        plate, hpFill: plate.querySelector('.pl-hp span'), mpFill: plate.querySelector('.pl-mp span'),
        anim: { attack: 0, hit: 0, hitKind: null, heal: 0, buff: 0, faint: 0 },
        dead: false, deadShown: false,
      });
    });
  }

  /* ---- バー更新 ------------------------------------------------------- */
  function updateBars(dispHP, dispMP) {
    entries.forEach(e => {
      const hp = dispHP[e.uid] != null ? dispHP[e.uid] : e.maxHP;
      const w = Math.max(0, Math.min(100, hp / e.maxHP * 100));
      if (e.hpFill) e.hpFill.style.width = w + '%';
      if (e.mpFill) {
        const mp = dispMP[e.uid] != null ? dispMP[e.uid] : e.maxMP;
        e.mpFill.style.width = Math.max(0, Math.min(100, mp / e.maxMP * 100)) + '%';
      }
      if (hp <= 0 && !e.deadShown) { e.anim.faint = 1; e.deadShown = true; e.dead = true; e.plate.classList.add('dead'); }
    });
    renderFrame();
  }

  /* ---- ターゲットモード ----------------------------------------------- */
  function setTargetMode(side, includeDead) {
    targetSide = side;
    entries.forEach(e => {
      const on = side && e.side === side && (includeDead || !e.dead);
      e.plate.classList.toggle('targetable', !!on);
      if (on) { e.plate.dataset.act = 'pickTarget'; e.plate.dataset.uid = e.uid; }
      else { delete e.plate.dataset.act; delete e.plate.dataset.uid; }
    });
  }

  /* ---- アニメーション トリガ ----------------------------------------- */
  const find = (uid) => entries.find(e => e.uid === uid);
  function act(uid)  { const e = find(uid); if (e && !e.dead) e.anim.attack = 1; }
  function hit(uid, kind) { const e = find(uid); if (e) { e.anim.hit = 1; e.anim.hitKind = kind; } }
  function heal(uid) { const e = find(uid); if (e) e.anim.heal = 1; }
  function buff(uid) { const e = find(uid); if (e) e.anim.buff = 1; }
  function pop(uid, text, cls) {
    const e = find(uid); if (!e) return;
    const f = document.createElement('div');
    f.className = 'float-num ' + cls; f.textContent = text;
    e.plate.appendChild(f);
    setTimeout(() => f.remove(), 800);
  }

  /* ---- ループ --------------------------------------------------------- */
  function loop() {
    if (paused) { raf = null; return; }
    raf = requestAnimationFrame(loop);
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000); last = now; clock += dt;
    update(dt);
    renderer.render(scene, camera);
    positionPlates();
  }

  function renderFrame() {
    if (!active || !renderer) return;
    update(0);
    renderer.render(scene, camera);
    positionPlates();
  }

  function update(dt) {
    entries.forEach(e => {
      const a = e.anim, P = e.base;
      let er = 0, eg = 0, eb = 0;
      let z = P.z, x = P.x, y = P.y;
      // 攻撃ランジ
      if (a.attack > 0) { a.attack = Math.max(0, a.attack - dt / 0.5);
        z += e.dir * Math.sin((1 - a.attack) * Math.PI) * 1.4; }
      // 被弾
      if (a.hit > 0) { a.hit = Math.max(0, a.hit - dt / 0.35);
        x += Math.sin((1 - a.hit) * 34) * a.hit * 0.16;
        z -= e.dir * a.hit * 0.25;
        const inten = a.hit; if (a.hitKind === 'crit') { er = inten; eg = inten * 0.7; } else er = inten; }
      // 回復
      if (a.heal > 0) { a.heal = Math.max(0, a.heal - dt / 0.6); eg = Math.max(eg, a.heal * 0.9);
        y += Math.sin((1 - a.heal) * Math.PI) * 0.25; }
      // 強化
      if (a.buff > 0) { a.buff = Math.max(0, a.buff - dt / 0.6); eb = Math.max(eb, a.buff * 0.9); er = Math.max(er, a.buff * 0.2); }
      // アイドル（ふわふわ）
      const bob = e.dead ? 0 : Math.sin(clock * 2.2 + e.phase) * 0.09;
      // 気絶
      if (e.dead) {
        e.group.rotation.x = Math.min(Math.PI / 2.1, e.group.rotation.x + dt * 2.5);
        e.mats.forEach(m => { m.opacity = Math.max(0.18, m.opacity - dt * 1.5); });
        if (e.shadow) e.shadow.material.opacity = Math.max(0, e.shadow.material.opacity - dt * 1.5);
      } else {
        e.group.rotation.x = 0;
      }

      e.group.position.set(x, y + bob, z);
      // シャドウは地面に固定して x,z だけ追従
      if (e.shadow) {
        e.shadow.position.x = x;
        e.shadow.position.z = z;
        // ジャンプ中は影を縮める
        const jump = Math.max(a.attack, a.heal);
        const sc = 1 - Math.min(0.5, jump * 0.5);
        e.shadow.scale.set(sc, sc, sc);
      }

      // 高ランク常時グロウ
      if (e.glow) { er = Math.max(er, e.glow.r * 0.25); eg = Math.max(eg, e.glow.g * 0.25); eb = Math.max(eb, e.glow.b * 0.25); }
      e.mats.forEach(m => m.emissive.setRGB(er * 0.6, eg * 0.6, eb * 0.6));

      // デコレーション（属性・ランク）の固有アニメーション
      e.decos.forEach(d => {
        if (d.kind === 'orbit') {
          d.angle += d.speed * dt;
          d.obj.position.set(Math.cos(d.angle) * d.radius, d.h, Math.sin(d.angle) * d.radius);
        } else if (d.kind === 'spin') {
          if (d.axis === 'x') d.obj.rotation.x += d.speed * dt;
          else if (d.axis === 'y') d.obj.rotation.y += d.speed * dt;
          else d.obj.rotation.z += d.speed * dt;
        } else if (d.kind === 'flame') {
          d.phase += dt * 6;
          const sy = 1 + Math.sin(d.phase) * 0.18;
          d.obj.scale.y = sy;
        } else if (d.kind === 'spark') {
          d.phase += dt * 8;
          d.obj.material.emissiveIntensity = 0.8 + Math.sin(d.phase) * 0.35;
        } else if (d.kind === 'pulse') {
          d.phase += dt * 3;
          const s = 1 + Math.sin(d.phase) * 0.15;
          d.obj.scale.set(s, s, s);
        }
      });
    });
  }

  function positionPlates() {
    const rect = canvas.getBoundingClientRect();
    const w = rect.width, h = rect.height;
    entries.forEach(e => {
      const p = e.group.position;
      const head = V(p.x, e.top + 0.3, p.z);
      head.project(camera);
      if (head.z > 1) { e.plate.style.display = 'none'; return; }
      e.plate.style.display = '';
      const sx = (head.x * 0.5 + 0.5) * w;
      const sy = (-head.y * 0.5 + 0.5) * h;
      e.plate.style.left = sx + 'px';
      e.plate.style.top = sy + 'px';
    });
  }

  /* ---- 破棄 ----------------------------------------------------------- */
  function dispose() {
    if (raf) cancelAnimationFrame(raf), raf = null;
    window.removeEventListener('resize', onResize);
    if (renderer) {
      try { renderer.dispose(); renderer.forceContextLoss(); } catch (e) {}
      renderer = null;
    }
    entries = []; active = false; scene = null; camera = null;
  }

  function pause() { paused = true; if (raf) { cancelAnimationFrame(raf); raf = null; } }
  function resume() { if (paused && active) { paused = false; last = performance.now(); loop(); } }

  return { init, setup, updateBars, setTargetMode, act, hit, heal, buff, pop, dispose, pause, resume,
           get active() { return active; } };
})();
