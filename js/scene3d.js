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
      // 低スペック端末では antialias を切ってフォールバック
      const dpr = window.devicePixelRatio || 1;
      const lowPower = dpr <= 1 && (navigator.hardwareConcurrency || 4) < 4;
      renderer = new THREE.WebGLRenderer({
        canvas, antialias: !lowPower, alpha: true, preserveDrawingBuffer: true,
        powerPreference: lowPower ? 'low-power' : 'high-performance',
      });
    } catch (e) { console.warn('Scene3D init failed', e); return false; }
    if (!renderer) return false;
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
    // GPU context lost対策
    canvas.addEventListener('webglcontextlost', (ev) => {
      ev.preventDefault();
      console.warn('WebGL context lost');
      active = false;
    }, false);
    canvas.addEventListener('webglcontextrestored', () => {
      console.warn('WebGL context restored');
      active = true; last = performance.now(); loop();
    }, false);
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

  /* 反転裏面シェルでセル風アウトラインを追加（鳥山明風の縁取り）。
   * 大きめのジオメトリだけを対象（小物・装飾はスキップ）。
   * サイズに応じてアウトラインの太さを微調整：大きい部品ほどやや薄く、
   * 中サイズで最も太く、極小は無視（線が太すぎてつぶれるのを防ぐ）。
   */
  function addOutlines(group, options = {}) {
    const minRadius = options.minRadius ?? 0.18;
    const baseScale = options.scale ?? 1.045;
    const color = options.color ?? 0x101018;
    const toAdd = [];
    group.traverse(obj => {
      if (!obj.isMesh) return;
      if (!obj.material || !obj.material.userData || !obj.material.userData.outlineable) return;
      if (!obj.geometry.boundingSphere) obj.geometry.computeBoundingSphere();
      const r = obj.geometry.boundingSphere.radius;
      if (r < minRadius) return;
      if (obj.material.opacity < 0.85) return;
      // サイズに応じてアウトラインの厚みを調整：大きい部品は薄め、中サイズは普通
      let s = baseScale;
      if (r > 1.0) s = 1.03;
      else if (r > 0.6) s = 1.04;
      else if (r > 0.3) s = 1.05;
      else s = 1.06;
      toAdd.push({ obj, scale: s });
    });
    toAdd.forEach(({ obj, scale }) => {
      const outlineMat = new THREE.MeshBasicMaterial({
        color, side: THREE.BackSide, transparent: false,
      });
      const shell = new THREE.Mesh(obj.geometry, outlineMat);
      shell.position.copy(obj.position);
      shell.rotation.copy(obj.rotation);
      shell.scale.copy(obj.scale).multiplyScalar(scale);
      obj.parent.add(shell);
      shell.renderOrder = -1;
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

  /* =========================================================================
   *  系統別ビルダー（FAMILY_BUILDERS）
   *
   *  「他の3Dゲームのモンスター」を参考にした、系統(family)ごとに固有の
   *  シルエットを持つキャラクターデザイン。汎用アーキタイプ(blob/beast/...)
   *  ではなく、ドラクエのスライム、ポケモンのキャラ、モンスターハンターの
   *  ような「一目で何のモンスターか分かる」造形を目指す。
   *
   *  各ビルダーは (species, mats, decos) を受け取り THREE.Group を返す。
   *  group.userData.top に「HPプレート用の頭頂Y座標」を設定する。
   *  ティア(1-5)で大きさや装飾を変える。
   * =======================================================================*/

  /* 共通: 4本足を作る（獣・竜系の脚） */
  function quadLegs(g, col, h, sx, sz, mats, paw = true) {
    [-sx, sx].forEach(x => [sz, -sz].forEach(z => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.16, h * 0.18, h, 8),
        mat(shade(col, 0.82)));
      leg.position.set(x, h * 0.5, z); g.add(leg); mats.push(leg.material);
      if (paw) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(h * 0.42, h * 0.18, h * 0.55),
          mat(shade(col, 0.65)));
        p.position.set(x, h * 0.08, z + 0.05); g.add(p); mats.push(p.material);
      }
    }));
  }

  /* 共通: コウモリ翼 */
  function batWings(g, col, scale, mats, opts = {}) {
    const w = scale, dark = mix(col, 0x000000, 0.4);
    [-1, 1].forEach(s => {
      // 主翼
      const wing = new THREE.Mesh(new THREE.BoxGeometry(w * 1.1, w * 0.8, 0.06),
        mat(shade(col, 0.55), { opacity: 0.88, flat: false }));
      wing.position.set(s * w * 0.75, opts.y ?? 1.5, opts.z ?? -0.3);
      wing.rotation.set(0.15, s * 0.7, s * 0.2);
      g.add(wing); mats.push(wing.material);
      // 骨（細い棒）
      const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, w * 1.05, 6),
        mat(dark, { outline: false }));
      bone.position.copy(wing.position);
      bone.rotation.set(0, s * 0.7, Math.PI / 2);
      g.add(bone); mats.push(bone.material);
    });
  }

  /* 共通: 鳥の翼（羽根） */
  function birdWings(g, col, scale, mats) {
    const w = scale;
    [-1, 1].forEach(s => {
      const main = new THREE.Mesh(new THREE.BoxGeometry(w * 0.8, w * 0.65, 0.1),
        mat(shade(col, 0.85)));
      main.position.set(s * 0.85, 1.0, -0.15); main.rotation.y = s * 0.5;
      g.add(main); mats.push(main.material);
      const tip = new THREE.Mesh(new THREE.BoxGeometry(w * 0.4, w * 0.45, 0.06),
        mat(mix(col, 0xffffff, 0.4)));
      tip.position.set(s * 1.25, 0.95, -0.3); tip.rotation.y = s * 0.65;
      g.add(tip); mats.push(tip.material);
    });
  }

  /* 共通: 天使の翼（白い羽） */
  function angelWings(g, mats) {
    [-1, 1].forEach(s => {
      const wing = new THREE.Mesh(new THREE.SphereGeometry(0.85, 14, 8, 0, Math.PI),
        mat(0xfaf8ee, { flat: false, rough: 0.4 }));
      wing.position.set(s * 0.55, 1.55, -0.25);
      wing.scale.set(0.45, 1.0, 0.7);
      wing.rotation.set(0, s * 0.45, s * 0.15);
      g.add(wing); mats.push(wing.material);
      // 羽の先（光沢）
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 8, 0, Math.PI),
        mat(0xffffff, { flat: false, rough: 0.3, emissive: 0xfff1a8, emissiveIntensity: 0.3 }));
      tip.position.set(s * 0.95, 1.85, -0.4);
      tip.scale.set(0.4, 0.7, 0.5);
      tip.rotation.set(0, s * 0.6, s * 0.2);
      g.add(tip); mats.push(tip.material);
    });
  }

  /* ---- スライム系（sla, mtl も使う） ---------------------------------- */
  function buildSlimeFamily(species, mats, decos) {
    const col = new THREE.Color(DB.ELEMENTS[species.el].color).getHex();
    const tier = Math.min(5, species.rank);
    const g = new THREE.Group();
    // ドラクエ風水滴ボディ：地面に座る丸い土台 → なめらかに尖る上部
    // 土台のドーム（地面に接するよう底をy=0に）
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(1.0, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2),
      mat(col, { rough: 0.3, opacity: 0.95 }));
    dome.position.y = 0; dome.scale.set(1.05, 0.85, 1.05);
    g.add(dome); mats.push(dome.material);
    // 上のふくらみ（顔がのる球）
    const upperBall = new THREE.Mesh(new THREE.SphereGeometry(0.85, 24, 24),
      mat(col, { rough: 0.3, opacity: 0.95 }));
    upperBall.position.y = 0.95; upperBall.scale.set(0.95, 0.92, 0.95);
    g.add(upperBall); mats.push(upperBall.material);
    // 先端のとがり
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.55, 14),
      mat(col, { rough: 0.3, opacity: 0.95 }));
    tip.position.y = 1.75;
    g.add(tip); mats.push(tip.material);
    // 大きな目（DQスライム風: 白目＋大きな瞳＋ハイライト）
    [-0.28, 0.28].forEach(sx => {
      const eyeW = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 16),
        mat(0xffffff, { flat: false, rough: 0.2 }));
      eyeW.position.set(sx, 1.05, 0.6); g.add(eyeW); mats.push(eyeW.material);
      const eyeB = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 12),
        mat(0x0a0a14, { flat: false, rough: 0.25 }));
      eyeB.position.set(sx, 1.03, 0.76); eyeB.scale.set(1, 1.2, 0.9);
      g.add(eyeB); mats.push(eyeB.material);
      const hl = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8),
        mat(0xffffff, { flat: false, emissive: 0xffffff, emissiveIntensity: 0.8, outline: false }));
      hl.position.set(sx + 0.045, 1.14, 0.85); g.add(hl); mats.push(hl.material);
    });
    // にっこり口（曲線）
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.048, 6, 10, Math.PI),
      mat(0x281428, { flat: false, rough: 0.5 }));
    mouth.position.set(0, 0.7, 0.9); mouth.rotation.x = Math.PI;
    g.add(mouth); mats.push(mouth.material);
    // ティア3+: 王冠
    if (tier >= 3) {
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.2, 8),
        mat(mix(col, 0xffd23d, 0.5), { metal: 0.4, rough: 0.3 }));
      crown.position.y = 1.5; g.add(crown); mats.push(crown.material);
    }
    if (tier >= 4) {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const p = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.2, 4),
          mat(mix(col, 0xffd23d, 0.5), { metal: 0.4 }));
        p.position.set(Math.cos(a) * 0.36, 1.68, Math.sin(a) * 0.36);
        g.add(p); mats.push(p.material);
      }
    }
    g.userData.top = 2.05 + (tier >= 3 ? 0.2 : 0);
    return g;
  }

  /* ---- メタル系（mtl: メタリック素材で同形状） ----------------------- */
  function buildMetalSlime(species, mats, decos) {
    const g = buildSlimeFamily(species, mats, decos);
    // すべてのマテリアルをメタル化
    mats.forEach(m => {
      if (!m) return;
      m.metalness = 0.9;
      m.roughness = 0.18;
      m.color.set(0xbfc6d0);
    });
    return g;
  }

  /* ---- 狼系（bea, ice, thu, dmn, roc, ice_bea） ----------------------- */
  function buildWolfFamily(species, mats, decos, opts = {}) {
    const col = new THREE.Color(DB.ELEMENTS[species.el].color).getHex();
    const tier = Math.min(5, species.rank);
    const g = new THREE.Group();
    // 胴体（横長・低姿勢）
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.85, 0.95),
      mat(col, { rough: 0.7 }));
    body.position.set(0, 0.95, 0); g.add(body); mats.push(body.material);
    // お腹（明るい）
    belly(g, 0.78, 0.5, 1.15, 0.7, mix(col, 0xffffff, 0.35), mats);
    // 首
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.4, 0.55, 10),
      mat(shade(col, 1.05)));
    neck.position.set(0, 1.15, 0.45); neck.rotation.x = 0.6;
    g.add(neck); mats.push(neck.material);
    // 頭（鼻先が尖る）
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.6, 0.8),
      mat(shade(col, 1.1)));
    head.position.set(0, 1.4, 0.85); g.add(head); mats.push(head.material);
    // マズル（鼻先・先細り）
    const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.35, 0.45),
      mat(shade(col, 0.95)));
    muzzle.position.set(0, 1.27, 1.25); g.add(muzzle); mats.push(muzzle.material);
    // 鼻
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 10),
      mat(0x14141c, { flat: false, rough: 0.4 }));
    nose.position.set(0, 1.34, 1.47); g.add(nose); mats.push(nose.material);
    // 鋭い三角耳（オオカミ）
    [-0.25, 0.25].forEach(sx => {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.45, 4),
        mat(shade(col, 1.05)));
      ear.position.set(sx, 1.82, 0.78); ear.rotation.z = sx * 0.18;
      g.add(ear); mats.push(ear.material);
      // 耳の内側（暗いピンク）
      const inner = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.25, 4),
        mat(0xc4607a, { rough: 0.6 }));
      inner.position.set(sx, 1.78, 0.84); inner.rotation.z = sx * 0.18;
      g.add(inner); mats.push(inner.material);
    });
    // 牙（ティア3+でちらり）
    if (tier >= 3) {
      [-0.12, 0.12].forEach(sx => {
        const fang = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.18, 4),
          mat(0xfaf8e2, { rough: 0.3 }));
        fang.position.set(sx, 1.16, 1.4); fang.rotation.x = Math.PI;
        g.add(fang); mats.push(fang.material);
      });
    }
    // たてがみ（ティア3+：肩まわりに毛皮塊）
    if (tier >= 3) {
      const maneCol = opts.maneColor ?? mix(col, 0x000000, 0.25);
      const mane = new THREE.Mesh(new THREE.SphereGeometry(0.85, 18, 16),
        mat(maneCol, { rough: 0.85, flat: true }));
      mane.position.set(0, 1.25, 0.35); mane.scale.set(1.15, 0.85, 0.85);
      g.add(mane); mats.push(mane.material);
    }
    // 目（鋭い）
    [-0.18, 0.18].forEach(sx => {
      const w = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 12),
        mat(0xffffff, { flat: false, rough: 0.2 }));
      w.position.set(sx, 1.5, 1.1); g.add(w); mats.push(w.material);
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 10),
        mat(opts.pupilColor ?? 0x331c0c, { flat: false }));
      p.position.set(sx, 1.5, 1.18); g.add(p); mats.push(p.material);
    });
    // 怒り眉
    [-0.18, 0.18].forEach(sx => {
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.05, 0.04),
        mat(0x14141c, { outline: false }));
      brow.position.set(sx, 1.63, 1.18); brow.rotation.z = sx > 0 ? -0.35 : 0.35;
      g.add(brow); mats.push(brow.material);
    });
    // 脚（4本）
    quadLegs(g, col, 0.65, 0.5, 0.42, mats);
    // 尻尾
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.95, 8),
      mat(shade(col, 0.85)));
    tail.position.set(0, 1.15, -0.7); tail.rotation.x = -0.8;
    g.add(tail); mats.push(tail.material);
    // 尻尾の先（明るい毛束）
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12),
      mat(mix(col, opts.tailTipColor ?? 0xffffff, 0.4), { rough: 0.7 }));
    tip.position.set(0, 1.62, -1.06); g.add(tip); mats.push(tip.material);
    g.userData.top = 2.2;
    return g;
  }

  /* ---- 猫系（cat） — 狼より小さく、丸い --------------------------------- */
  function buildCatFamily(species, mats, decos) {
    const col = new THREE.Color(DB.ELEMENTS[species.el].color).getHex();
    const tier = Math.min(5, species.rank);
    const g = new THREE.Group();
    // 胴体（やや小さく丸め）
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.6, 18, 16),
      mat(col, { rough: 0.55 }));
    body.scale.set(1.2, 0.85, 1.4); body.position.set(0, 0.85, 0);
    g.add(body); mats.push(body.material);
    belly(g, 0.7, 0.35, 1.05, 0.7, mix(col, 0xffffff, 0.45), mats);
    // 頭
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.5, 18, 18),
      mat(shade(col, 1.08)));
    head.position.set(0, 1.25, 0.65); g.add(head); mats.push(head.material);
    // 猫の三角耳（小さく、ピンと立つ）
    [-0.27, 0.27].forEach(sx => {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.36, 4),
        mat(shade(col, 1.05)));
      ear.position.set(sx, 1.7, 0.55); ear.rotation.z = sx * 0.08;
      g.add(ear); mats.push(ear.material);
      const inner = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.2, 4),
        mat(0xff9bb8, { rough: 0.5 }));
      inner.position.set(sx, 1.66, 0.58); inner.rotation.z = sx * 0.08;
      g.add(inner); mats.push(inner.material);
    });
    // 顔
    face(g, 1.28, 0.95, 0.16, 0.12, mats, { blush: true });
    // ヒゲ（細いボックス）
    [-1, 1].forEach(s => [-0.04, 0, 0.04].forEach(ay => {
      const w = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.012, 0.012),
        mat(0x222222, { outline: false }));
      w.position.set(s * 0.36, 1.15 + ay, 1.0); w.rotation.z = s * 0.08;
      g.add(w); mats.push(w.material);
    }));
    // ピンクの鼻
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8),
      mat(0xff7aa0, { flat: false, rough: 0.4 }));
    nose.position.set(0, 1.18, 1.13); g.add(nose); mats.push(nose.material);
    // 4本足（短め）
    quadLegs(g, col, 0.55, 0.32, 0.38, mats);
    // 長い尻尾（先がカール）
    [0, 1, 2, 3].forEach(i => {
      const seg = new THREE.Mesh(new THREE.SphereGeometry(0.13 - i * 0.02, 12, 12),
        mat(shade(col, 1 - i * 0.04)));
      const t = i / 3, a = t * Math.PI * 0.7;
      seg.position.set(Math.sin(a) * 0.25, 1.05 + t * 0.6, -0.6 - t * 0.35);
      g.add(seg); mats.push(seg.material);
    });
    // ティア4+: バステト風アクセサリー（金リング）
    if (tier >= 4) {
      const collar = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.06, 8, 16),
        mat(0xffd23d, { metal: 0.7, rough: 0.25 }));
      collar.position.set(0, 1.0, 0.45); collar.rotation.x = Math.PI / 2;
      g.add(collar); mats.push(collar.material);
    }
    g.userData.top = 1.95;
    return g;
  }

  /* ---- 鳥系（bir, win, fay, stb） --------------------------------------- */
  function buildBirdFamily(species, mats, decos, opts = {}) {
    const col = new THREE.Color(DB.ELEMENTS[species.el].color).getHex();
    const tier = Math.min(5, species.rank);
    const g = new THREE.Group();
    // 丸い体
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.78, 20, 20),
      mat(col, { rough: 0.5 }));
    body.scale.set(1, 1.2, 1); body.position.y = 1.0;
    g.add(body); mats.push(body.material);
    belly(g, 0.85, 0.5, 1.0, 1.2, mix(col, 0xffffff, 0.5), mats);
    // 頭
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.45, 18, 18),
      mat(shade(col, 1.08)));
    head.position.set(0, 1.85, 0.05); g.add(head); mats.push(head.material);
    // くちばし（鋭く曲がる）
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.42, 6),
      mat(0xf2a833, { rough: 0.4 }));
    beak.position.set(0, 1.78, 0.55); beak.rotation.x = Math.PI / 2;
    g.add(beak); mats.push(beak.material);
    // 下くちばし
    const beak2 = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.28, 6),
      mat(0xc78821, { rough: 0.4 }));
    beak2.position.set(0, 1.66, 0.52); beak2.rotation.x = Math.PI / 2;
    g.add(beak2); mats.push(beak2.material);
    // 大きな目
    [-0.18, 0.18].forEach(sx => {
      const w = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 14),
        mat(0xffffff, { flat: false, rough: 0.2 }));
      w.position.set(sx, 1.92, 0.32); g.add(w); mats.push(w.material);
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 12),
        mat(0x0a0a14, { flat: false }));
      p.position.set(sx, 1.92, 0.42); g.add(p); mats.push(p.material);
      const hl = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8),
        mat(0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.7, outline: false }));
      hl.position.set(sx + 0.03, 1.97, 0.48); g.add(hl); mats.push(hl.material);
    });
    // 頭の飾り羽（ティア2+）
    if (tier >= 2) {
      const crest = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.4, 5),
        mat(mix(col, 0xffffff, 0.35)));
      crest.position.set(0, 2.18, -0.05); crest.rotation.x = -0.3;
      g.add(crest); mats.push(crest.material);
    }
    if (tier >= 4) {
      // 横にも飾り羽
      [-0.1, 0.1].forEach(sx => {
        const cf = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.3, 5),
          mat(mix(col, 0xffffff, 0.4)));
        cf.position.set(sx, 2.1, -0.1); cf.rotation.set(-0.4, sx * 1.5, 0);
        g.add(cf); mats.push(cf.material);
      });
    }
    // 翼
    birdWings(g, col, 1.0, mats);
    // 尾羽（後ろに広がる扇）
    [-1, 0, 1].forEach(i => {
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.05),
        mat(shade(col, 0.9 - Math.abs(i) * 0.05)));
      f.position.set(i * 0.18, 0.95, -0.85);
      f.rotation.set(-0.4, 0, i * 0.18);
      g.add(f); mats.push(f.material);
    });
    // 細い足（地面に届くよう調整）
    [-0.18, 0.18].forEach(sx => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.6, 6),
        mat(0xc78821));
      leg.position.set(sx, 0.32, 0.05); g.add(leg); mats.push(leg.material);
      // 鳥の足趾（地面に密着）
      [-0.07, 0.07].forEach(tx => {
        const claw = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.2),
          mat(0x8a5a18));
        claw.position.set(sx + tx, 0.03, 0.18); g.add(claw); mats.push(claw.material);
      });
    });
    g.userData.top = 2.45;
    return g;
  }

  /* ---- 植物系（pla） --------------------------------------------------- */
  function buildPlantFamily(species, mats, decos) {
    const col = new THREE.Color(DB.ELEMENTS[species.el].color).getHex();
    const tier = Math.min(5, species.rank);
    const g = new THREE.Group();
    // 鉢/土
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.45, 0.55, 12),
      mat(0x7a4a25, { rough: 0.9 }));
    pot.position.y = 0.28; g.add(pot); mats.push(pot.material);
    // 鉢のフチ
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.07, 8, 18),
      mat(0xa37238, { rough: 0.7 }));
    rim.position.y = 0.55; rim.rotation.x = Math.PI / 2;
    g.add(rim); mats.push(rim.material);
    // 茎（中央の柱）
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.7, 8),
      mat(mix(col, 0x224422, 0.4)));
    stem.position.y = 0.9; g.add(stem); mats.push(stem.material);
    // 大きな花の球
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.62, 20, 20),
      mat(col, { flat: false, rough: 0.4 }));
    bulb.position.y = 1.55; g.add(bulb); mats.push(bulb.material);
    // 花びら（5〜7枚）
    const petalCount = 5 + Math.min(2, Math.max(0, tier - 2));
    for (let i = 0; i < petalCount; i++) {
      const a = (i / petalCount) * Math.PI * 2;
      const petal = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 14),
        mat(mix(col, 0xffeecc, 0.5)));
      petal.scale.set(1.1, 0.55, 0.55);
      petal.position.set(Math.cos(a) * 0.5, 1.6, Math.sin(a) * 0.5);
      petal.rotation.set(0, -a + Math.PI / 2, 0);
      g.add(petal); mats.push(petal.material);
    }
    // 顔（花の中央）
    face(g, 1.55, 0.55, 0.16, 0.12, mats, { blush: true });
    // ツル（腕）— ティア3+
    if (tier >= 3) {
      [-1, 1].forEach(s => {
        // 4節のツル
        for (let k = 0; k < 4; k++) {
          const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.08 - k * 0.012, 0.09 - k * 0.012, 0.3, 8),
            mat(shade(col, 0.7)));
          const t = k / 3;
          seg.position.set(s * (0.6 + t * 0.5), 1.0 + Math.sin(t * Math.PI) * 0.6, 0);
          seg.rotation.z = -s * (0.3 + t * 0.4);
          g.add(seg); mats.push(seg.material);
        }
      });
    }
    // 葉（鉢周りに数枚）
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.4, 4),
        mat(0x4a9a4a));
      leaf.position.set(Math.cos(a) * 0.55, 0.65, Math.sin(a) * 0.55);
      leaf.rotation.set(Math.PI / 2 + 0.6 * Math.cos(a + Math.PI), 0,
                        0.6 * Math.sin(a + Math.PI));
      g.add(leaf); mats.push(leaf.material);
    }
    g.userData.top = 2.05;
    return g;
  }

  /* ---- キノコ系（mus） --------------------------------------------------- */
  function buildMushroomFamily(species, mats, decos) {
    const col = new THREE.Color(DB.ELEMENTS[species.el].color).getHex();
    const tier = Math.min(5, species.rank);
    const g = new THREE.Group();
    // 白い茎の体
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.5, 0.85, 14),
      mat(0xfff8e8, { rough: 0.55 }));
    stem.position.y = 0.55; g.add(stem); mats.push(stem.material);
    // キノコの傘（半球）
    const capCol = mix(col, 0xe04040, 0.5);
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.95, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2),
      mat(capCol, { flat: false, rough: 0.45 }));
    cap.position.y = 1.05; cap.scale.set(1.05, 0.85, 1.05);
    g.add(cap); mats.push(cap.material);
    // 傘の下のヒダ
    const gill = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.4, 0.18, 18),
      mat(0xf2d6b8, { rough: 0.7 }));
    gill.position.y = 0.92; g.add(gill); mats.push(gill.material);
    // 傘の白い斑点
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 14, 0, Math.PI * 2, 0, Math.PI / 2),
        mat(0xfffaf0, { rough: 0.5 }));
      dot.position.set(Math.cos(a) * 0.55, 1.32, Math.sin(a) * 0.55);
      dot.scale.set(1, 0.55, 1);
      g.add(dot); mats.push(dot.material);
    }
    // 茎の前面に顔（目）
    [-0.13, 0.13].forEach(sx => {
      const ey = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 12),
        mat(0x14141c, { flat: false }));
      ey.position.set(sx, 0.7, 0.4); g.add(ey); mats.push(ey.material);
      const hl = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 8),
        mat(0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.7, outline: false }));
      hl.position.set(sx + 0.02, 0.75, 0.46); g.add(hl); mats.push(hl.material);
    });
    // ニッコリ口
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.025, 6, 10, Math.PI),
      mat(0x281428, { rough: 0.5 }));
    mouth.position.set(0, 0.55, 0.43); mouth.rotation.x = Math.PI;
    g.add(mouth); mats.push(mouth.material);
    // 短い手（ティア3+）
    if (tier >= 3) {
      [-1, 1].forEach(s => {
        const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.32, 7),
          mat(0xfff8e8));
        arm.position.set(s * 0.42, 0.55, 0.05); arm.rotation.z = s * 0.4;
        g.add(arm); mats.push(arm.material);
      });
    }
    g.userData.top = 1.65;
    return g;
  }

  /* ---- ゴースト系（gho） --------------------------------------------------- */
  function buildGhostFamily(species, mats, decos) {
    const col = new THREE.Color(DB.ELEMENTS[species.el].color).getHex();
    const tier = Math.min(5, species.rank);
    const g = new THREE.Group();
    // 半透明の体（球＋下に向かって細くなる）
    const opacity = 0.62;
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.78, 20, 20),
      mat(col, { rough: 0.3, opacity, emissive: col, emissiveIntensity: 0.35 }));
    body.position.y = 1.4; g.add(body); mats.push(body.material);
    // 下にしっぽ（先細りの円錐）
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.78, 1.2, 18),
      mat(col, { rough: 0.3, opacity, emissive: col, emissiveIntensity: 0.3 }));
    tail.position.y = 0.6; tail.rotation.x = Math.PI;
    g.add(tail); mats.push(tail.material);
    // ぼろぼろの裾（横にもう一本円錐をずらして配置）
    [-0.25, 0.25].forEach(sx => {
      const fray = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.85, 8),
        mat(col, { rough: 0.4, opacity: opacity * 0.85 }));
      fray.position.set(sx, 0.5, 0); fray.rotation.x = Math.PI; fray.rotation.z = sx * 0.4;
      g.add(fray); mats.push(fray.material);
    });
    // 怖い目（白いオーブが光る・瞳なし）
    [-0.22, 0.22].forEach(sx => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 14),
        mat(0xffffff, { flat: false, rough: 0.1, emissive: 0xfff8c8, emissiveIntensity: 1.0, outline: false }));
      eye.position.set(sx, 1.5, 0.7); g.add(eye); mats.push(eye.material);
    });
    // 不気味な口（縦線）
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.22, 0.1),
      mat(0x14141c, { rough: 0.5, outline: false }));
    mouth.position.set(0, 1.2, 0.78); g.add(mouth); mats.push(mouth.material);
    // 手のような尻尾（ティア3+）
    if (tier >= 3) {
      [-1, 1].forEach(s => {
        const arm = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.55, 8),
          mat(col, { rough: 0.4, opacity: opacity * 0.9 }));
        arm.position.set(s * 0.7, 1.25, 0); arm.rotation.z = s * 1.6;
        g.add(arm); mats.push(arm.material);
      });
    }
    g.userData.top = 2.15;
    return g;
  }

  /* ---- 炎系（ifr） --------------------------------------------------- */
  function buildFlameFamily(species, mats, decos) {
    const col = new THREE.Color(DB.ELEMENTS[species.el].color).getHex();
    const tier = Math.min(5, species.rank);
    const g = new THREE.Group();
    // 体は炎（円錐を組み合わせて燃え盛る形）
    const baseGlow = mat(0xff4a14, { flat: true, rough: 0.5, emissive: 0xff3300, emissiveIntensity: 0.95 });
    const middleGlow = mat(0xff7a30, { flat: true, rough: 0.5, emissive: 0xff5a14, emissiveIntensity: 1.0 });
    const topGlow = mat(0xffd23d, { flat: true, rough: 0.5, emissive: 0xff8a20, emissiveIntensity: 1.0 });
    // 大きな下半身の炎
    const base = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.2, 10), baseGlow);
    base.position.y = 0.7; g.add(base); mats.push(base.material);
    // 中段
    const mid = new THREE.Mesh(new THREE.ConeGeometry(0.6, 0.9, 10), middleGlow);
    mid.position.y = 1.45; g.add(mid); mats.push(mid.material);
    // 先端
    const top = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.6, 8), topGlow);
    top.position.y = 2.05; g.add(top); mats.push(top.material);
    // 横の小炎（腕のように）
    [-1, 1].forEach(s => {
      const arm = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.7, 8), middleGlow);
      arm.position.set(s * 0.78, 1.05, 0); arm.rotation.z = s * 1.3;
      g.add(arm);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.4, 6), topGlow);
      tip.position.set(s * 1.05, 1.35, 0); tip.rotation.z = s * 1.4;
      g.add(tip);
    });
    // 怖い目（炎の中で光る）
    [-0.2, 0.2].forEach(sx => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 14),
        mat(0xfff8e0, { flat: false, emissive: 0xffe060, emissiveIntensity: 1.4, outline: false }));
      eye.position.set(sx, 1.3, 0.42); g.add(eye); mats.push(eye.material);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8),
        mat(0x331100, { flat: false }));
      pupil.position.set(sx, 1.3, 0.5); g.add(pupil); mats.push(pupil.material);
    });
    // ティア4+: 王冠の炎
    if (tier >= 4) {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.35, 4), topGlow);
        spike.position.set(Math.cos(a) * 0.35, 2.4, Math.sin(a) * 0.35);
        g.add(spike);
      }
    }
    g.userData.top = 2.7;
    return g;
  }

  /* ---- 氷系（ice） — 狼ベース＋氷の装飾 ---------------------------------- */
  function buildIceFamily(species, mats, decos) {
    // 狼ベース（白めの色）
    const g = buildWolfFamily(species, mats, decos, {
      maneColor: 0xb8dde6,
      tailTipColor: 0xeaf6ff,
      pupilColor: 0x113355,
    });
    // 背中の氷の結晶
    const col = 0xbfe6ff;
    for (let i = 0; i < 5; i++) {
      const x = (i - 2) * 0.25;
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.5 + Math.abs(i - 2) * -0.05, 4),
        mat(col, { flat: true, opacity: 0.92, metal: 0.4, emissive: 0x4a86c8, emissiveIntensity: 0.4 }));
      c.position.set(x, 1.55, -0.05); c.rotation.z = (i - 2) * 0.12;
      g.add(c); mats.push(c.material);
    }
    // 肩のひとひら
    [-0.6, 0.6].forEach(sx => {
      const sf = new THREE.Mesh(new THREE.OctahedronGeometry(0.18, 0),
        mat(col, { flat: true, opacity: 0.85, emissive: 0x4a86c8, emissiveIntensity: 0.45 }));
      sf.position.set(sx, 1.3, 0.4); g.add(sf); mats.push(sf.material);
    });
    return g;
  }

  /* ---- ドラゴン系（dra, ser, anu） --------------------------------------- */
  function buildDragonFamily(species, mats, decos, opts = {}) {
    const col = new THREE.Color(DB.ELEMENTS[species.el].color).getHex();
    const tier = Math.min(5, species.rank);
    const g = new THREE.Group();
    // 大きな胴体
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.95, 20, 20),
      mat(col, { flat: false, rough: 0.45, metal: 0.12 }));
    body.scale.set(1.1, 1.0, 1.35); body.position.y = 1.05;
    g.add(body); mats.push(body.material);
    // 腹（うろこ風の明色）
    belly(g, 0.85, 0.6, 1.4, 0.85, mix(col, 0xffeac0, 0.5), mats);
    // 長い首
    const neck1 = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.5, 0.7, 12),
      mat(shade(col, 1.05)));
    neck1.position.set(0, 1.55, 0.45); neck1.rotation.x = 0.45;
    g.add(neck1); mats.push(neck1.material);
    const neck2 = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.55, 10),
      mat(shade(col, 1.08)));
    neck2.position.set(0, 1.95, 0.75); neck2.rotation.x = 0.65;
    g.add(neck2); mats.push(neck2.material);
    // 頭（横長）
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.5, 0.85),
      mat(shade(col, 1.12)));
    head.position.set(0, 2.3, 1.1); g.add(head); mats.push(head.material);
    // あご
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.55),
      mat(shade(col, 0.85)));
    jaw.position.set(0, 2.08, 1.28); g.add(jaw); mats.push(jaw.material);
    // 牙
    [-0.16, 0.16].forEach(sx => {
      const fang = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.18, 4),
        mat(0xf8f4dc, { rough: 0.25 }));
      fang.position.set(sx, 2.05, 1.5); fang.rotation.x = Math.PI;
      g.add(fang); mats.push(fang.material);
    });
    // 角（2対）
    horn(g, -0.22, 2.6, 1.0, mats, mix(col, 0x000000, 0.35));
    horn(g, 0.22, 2.6, 1.0, mats, mix(col, 0x000000, 0.35));
    if (tier >= 3) {
      horn(g, -0.36, 2.45, 0.85, mats, mix(col, 0x000000, 0.4));
      horn(g, 0.36, 2.45, 0.85, mats, mix(col, 0x000000, 0.4));
    }
    // 鋭い目
    [-0.18, 0.18].forEach(sx => {
      const w = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 12),
        mat(0xfff0c0, { flat: false, emissive: 0xffaa20, emissiveIntensity: 0.5 }));
      w.position.set(sx, 2.4, 1.4); g.add(w); mats.push(w.material);
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.14, 0.04),
        mat(0x0a0a14, { outline: false }));
      p.position.set(sx, 2.4, 1.5); g.add(p); mats.push(p.material);
    });
    // 怒り眉
    [-0.18, 0.18].forEach(sx => {
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.06),
        mat(mix(col, 0x000000, 0.4), { outline: false }));
      brow.position.set(sx, 2.56, 1.42); brow.rotation.z = sx > 0 ? -0.4 : 0.4;
      g.add(brow); mats.push(brow.material);
    });
    // コウモリ翼（大きめ）
    batWings(g, col, 1.5, mats, { y: 1.55, z: -0.35 });
    // 太い4本足
    quadLegs(g, col, 0.95, 0.55, 0.55, mats);
    // 尻尾（円錐2セグメント＋スパイク）
    const tail1 = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 0.85, 8),
      mat(shade(col, 0.95)));
    tail1.position.set(0, 1.0, -0.9); tail1.rotation.x = -0.8;
    g.add(tail1); mats.push(tail1.material);
    const tail2 = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.95, 8),
      mat(shade(col, 0.85)));
    tail2.position.set(0, 0.65, -1.5); tail2.rotation.x = -1.3;
    g.add(tail2); mats.push(tail2.material);
    // 尻尾のスパイク
    [0.0, 0.4, 0.8].forEach(t => {
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.22, 5),
        mat(mix(col, 0xffffff, 0.25)));
      sp.position.set(0, 1.3 - t * 0.45, -0.7 - t * 0.55);
      sp.rotation.x = -0.6; g.add(sp); mats.push(sp.material);
    });
    g.userData.top = 3.0;
    return g;
  }

  /* ---- 悪魔系（dev） ----------------------------------------------------- */
  function buildDemonFamily(species, mats, decos) {
    const col = new THREE.Color(DB.ELEMENTS[species.el].color).getHex();
    const tier = Math.min(5, species.rank);
    const g = new THREE.Group();
    // 胴（やせ型）
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.68, 1.05, 0.48),
      mat(col, { rough: 0.6 }));
    torso.position.y = 1.18; g.add(torso); mats.push(torso.material);
    // 胸の暗黒ジェム
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0),
      mat(0x7a3aff, { flat: true, rough: 0.25, emissive: 0x7a3aff, emissiveIntensity: 0.9 }));
    gem.position.set(0, 1.38, 0.26); g.add(gem); mats.push(gem.material);
    // 頭
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.4, 18, 18),
      mat(shade(col, 1.1)));
    head.position.y = 2.05; g.add(head); mats.push(head.material);
    // 大きく曲がった角
    [-1, 1].forEach(s => {
      // 角の基部
      const h1 = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.32, 6),
        mat(mix(col, 0x000000, 0.45)));
      h1.position.set(s * 0.22, 2.32, 0); h1.rotation.set(0, 0, s * 0.4);
      g.add(h1); mats.push(h1.material);
      // 角の先（カーブ）
      const h2 = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.5, 6),
        mat(mix(col, 0x000000, 0.5)));
      h2.position.set(s * 0.42, 2.52, -0.05); h2.rotation.set(-0.3, 0, s * 0.85);
      g.add(h2); mats.push(h2.material);
    });
    // 牙（口元）
    [-0.1, 0.1].forEach(sx => {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.13, 4),
        mat(0xf2eed0));
      f.position.set(sx, 1.85, 0.35); f.rotation.x = Math.PI;
      g.add(f); mats.push(f.material);
    });
    // 光る赤い目
    [-0.14, 0.14].forEach(sx => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 14),
        mat(0xff3a4a, { flat: false, emissive: 0xff2030, emissiveIntensity: 1.3, outline: false }));
      eye.position.set(sx, 2.08, 0.35); g.add(eye); mats.push(eye.material);
    });
    // 怒り眉（太め）
    [-0.14, 0.14].forEach(sx => {
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.07, 0.06),
        mat(mix(col, 0x000000, 0.5), { outline: false }));
      brow.position.set(sx, 2.25, 0.35); brow.rotation.z = sx > 0 ? -0.45 : 0.45;
      g.add(brow); mats.push(brow.material);
    });
    // 腕（鋭い爪）
    [-1, 1].forEach(s => {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.8, 8),
        mat(shade(col, 0.95)));
      arm.position.set(s * 0.48, 1.18, 0); arm.rotation.z = s * 0.3;
      g.add(arm); mats.push(arm.material);
      // 手
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 12),
        mat(shade(col, 0.85)));
      hand.position.set(s * 0.72, 0.7, 0); g.add(hand); mats.push(hand.material);
      // 爪 3本
      [-0.06, 0, 0.06].forEach(ox => {
        const claw = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.16, 4),
          mat(0x222226));
        claw.position.set(s * 0.72 + ox, 0.5, 0.08); claw.rotation.x = Math.PI;
        g.add(claw); mats.push(claw.material);
      });
    });
    // 脚
    [-0.2, 0.2].forEach(s => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.85, 8),
        mat(shade(col, 0.85)));
      leg.position.set(s, 0.42, 0); g.add(leg); mats.push(leg.material);
      // 足（蹄）
      const hoof = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.32),
        mat(mix(col, 0x000000, 0.5)));
      hoof.position.set(s, 0.06, 0.1); g.add(hoof); mats.push(hoof.material);
    });
    // コウモリ翼
    batWings(g, col, 0.95, mats, { y: 1.45, z: -0.3 });
    // 矢じり尻尾
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 0.7, 6),
      mat(shade(col, 0.9)));
    tail.position.set(0, 0.95, -0.4); tail.rotation.x = -0.5;
    g.add(tail); mats.push(tail.material);
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.25, 4),
      mat(shade(col, 0.7)));
    arrow.position.set(0, 0.65, -0.7); arrow.rotation.x = -2.0;
    g.add(arrow); mats.push(arrow.material);
    g.userData.top = 2.7;
    return g;
  }

  /* ---- 天使系（lig） --------------------------------------------------- */
  function buildAngelFamily(species, mats, decos) {
    const col = new THREE.Color(DB.ELEMENTS[species.el].color).getHex();
    const tier = Math.min(5, species.rank);
    const g = new THREE.Group();
    // 白いローブの胴
    const robe = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.6, 1.1, 14),
      mat(0xfaf6e2, { rough: 0.6 }));
    robe.position.y = 0.85; g.add(robe); mats.push(robe.material);
    // 帯（属性色）
    const sash = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.18, 14),
      mat(mix(col, 0xffd23d, 0.5), { rough: 0.5, metal: 0.3 }));
    sash.position.y = 1.05; g.add(sash); mats.push(sash.material);
    // 頭（明るい肌色）
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.36, 18, 18),
      mat(0xf8d9b6, { flat: false, rough: 0.5 }));
    head.position.y = 1.78; g.add(head); mats.push(head.material);
    // 髪（金）
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
      mat(0xffd87a, { flat: false, rough: 0.6 }));
    hair.position.y = 1.95; g.add(hair); mats.push(hair.material);
    // 表情
    face(g, 1.82, 0.32, 0.1, 0.07, mats, { blush: true, brow: false });
    // 大きな天使の翼
    angelWings(g, mats);
    // 光輪（element flair で既に出るが、強調する追加）
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.05, 8, 28),
      mat(0xfff5a8, { flat: false, rough: 0.15, emissive: 0xffd544, emissiveIntensity: 1.0 }));
    halo.position.y = 2.35; halo.rotation.x = Math.PI / 2;
    g.add(halo); mats.push(halo.material);
    decos.push({ obj: halo, kind: 'spin', axis: 'z', speed: 1.0 });
    // 腕（袖が広がる）
    [-1, 1].forEach(s => {
      const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.7, 9),
        mat(0xfaf6e2, { rough: 0.6 }));
      sleeve.position.set(s * 0.5, 1.05, 0); sleeve.rotation.z = s * 0.25;
      g.add(sleeve); mats.push(sleeve.material);
      // 手
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 10),
        mat(0xf8d9b6, { flat: false }));
      hand.position.set(s * 0.7, 0.62, 0); g.add(hand); mats.push(hand.material);
    });
    g.userData.top = 2.55;
    return g;
  }

  /* ---- スケルトン系（und） ----------------------------------------------- */
  function buildSkeletonFamily(species, mats, decos) {
    const col = new THREE.Color(DB.ELEMENTS[species.el].color).getHex();
    const tier = Math.min(5, species.rank);
    const g = new THREE.Group();
    const bone = 0xeae4cf;
    // ろっ骨ケージ（縦に並ぶボックス）
    for (let i = 0; i < 4; i++) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(0.32 - i * 0.02, 0.04, 8, 14),
        mat(bone, { rough: 0.6 }));
      rib.position.y = 0.85 + i * 0.18; rib.rotation.x = Math.PI / 2;
      rib.scale.set(1, 0.6, 1);
      g.add(rib); mats.push(rib.material);
    }
    // 背骨
    const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.1, 8),
      mat(bone));
    spine.position.y = 1.1; g.add(spine); mats.push(spine.material);
    // 骨盤
    const pelvis = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.07, 8, 14),
      mat(bone));
    pelvis.position.y = 0.65; pelvis.rotation.x = Math.PI / 2;
    g.add(pelvis); mats.push(pelvis.material);
    // 頭蓋骨
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 16),
      mat(bone, { flat: false, rough: 0.55 }));
    skull.position.y = 1.95; skull.scale.set(1, 1, 1.05);
    g.add(skull); mats.push(skull.material);
    // 顎
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.16, 0.3),
      mat(shade(bone, 0.92)));
    jaw.position.set(0, 1.75, 0.1); g.add(jaw); mats.push(jaw.material);
    // 暗い眼窩（穴）
    [-0.13, 0.13].forEach(sx => {
      const ho = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 12),
        mat(0x0a0a14, { flat: false, emissive: 0xff2030, emissiveIntensity: tier >= 3 ? 1.2 : 0.6, outline: false }));
      ho.position.set(sx, 1.98, 0.22); g.add(ho); mats.push(ho.material);
    });
    // 歯
    [-0.12, -0.04, 0.04, 0.12].forEach(sx => {
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 0.04),
        mat(0xfff0d4, { outline: false }));
      tooth.position.set(sx, 1.8, 0.22); g.add(tooth); mats.push(tooth.material);
    });
    // 骨の腕
    [-1, 1].forEach(s => {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.75, 6),
        mat(bone));
      arm.position.set(s * 0.45, 1.15, 0); arm.rotation.z = s * 0.2;
      g.add(arm); mats.push(arm.material);
      // 手の球
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 10),
        mat(bone, { flat: false }));
      hand.position.set(s * 0.6, 0.72, 0); g.add(hand); mats.push(hand.material);
    });
    // 骨の脚
    [-0.16, 0.16].forEach(sx => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.7, 6),
        mat(bone));
      leg.position.set(sx, 0.32, 0); g.add(leg); mats.push(leg.material);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.07, 0.28),
        mat(shade(bone, 0.85)));
      foot.position.set(sx, 0.04, 0.07); g.add(foot); mats.push(foot.material);
    });
    // フード（ティア3+）
    if (tier >= 3) {
      const hood = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 12, 0, Math.PI * 2, 0, Math.PI / 2),
        mat(0x2a1230, { rough: 0.85 }));
      hood.position.y = 2.05; hood.scale.set(1.05, 1.0, 1.05);
      g.add(hood); mats.push(hood.material);
    }
    // 鎌（ティア4+）
    if (tier >= 4) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.7, 6),
        mat(0x4a2810));
      pole.position.set(0.85, 1.15, 0); pole.rotation.z = -0.3;
      g.add(pole); mats.push(pole.material);
      const blade = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.6, 3),
        mat(0xc8d0d8, { metal: 0.7, rough: 0.2, flat: true }));
      blade.position.set(1.15, 1.95, 0); blade.rotation.set(0, 0, Math.PI / 2);
      g.add(blade); mats.push(blade.material);
    }
    g.userData.top = 2.4;
    return g;
  }

  /* ---- 亀系（tur） --------------------------------------------------- */
  function buildTurtleFamily(species, mats, decos) {
    const col = new THREE.Color(DB.ELEMENTS[species.el].color).getHex();
    const tier = Math.min(5, species.rank);
    const g = new THREE.Group();
    // 甲羅（上半球）
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(1.1, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2),
      mat(mix(col, 0x335533, 0.45), { flat: false, rough: 0.65 }));
    shell.position.y = 0.95; shell.scale.set(1.1, 0.85, 1.1);
    g.add(shell); mats.push(shell.material);
    // 甲羅のパターン（6角形のリム）
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const seg = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.55),
        mat(mix(col, 0x224422, 0.6)));
      seg.position.set(Math.cos(a) * 0.55, 1.4, Math.sin(a) * 0.55);
      seg.rotation.y = -a; g.add(seg); mats.push(seg.material);
    }
    // 腹側（明るい）
    const belly2 = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.18, 18),
      mat(0xfae3a0, { rough: 0.8 }));
    belly2.position.y = 0.55; g.add(belly2); mats.push(belly2.material);
    // 頭（前から伸びる）
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.36, 16, 16),
      mat(mix(col, 0xa9c98a, 0.45), { flat: false, rough: 0.55 }));
    head.position.set(0, 0.95, 1.05); g.add(head); mats.push(head.material);
    // 首
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 0.4, 10),
      mat(mix(col, 0xa9c98a, 0.45)));
    neck.position.set(0, 0.88, 0.85); neck.rotation.x = Math.PI / 2;
    g.add(neck); mats.push(neck.material);
    // 顔
    face(g, 1.0, 1.32, 0.13, 0.1, mats, { blush: true });
    // 4本足
    [-0.65, 0.65].forEach(sx => [-0.55, 0.55].forEach(sz => {
      const leg = new THREE.Mesh(new THREE.SphereGeometry(0.25, 14, 12),
        mat(mix(col, 0xa9c98a, 0.45)));
      leg.position.set(sx, 0.4, sz); leg.scale.set(1, 0.6, 1.2);
      g.add(leg); mats.push(leg.material);
    }));
    // 短い尻尾
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.32, 6),
      mat(mix(col, 0xa9c98a, 0.45)));
    tail.position.set(0, 0.85, -1.0); tail.rotation.x = -1.6;
    g.add(tail); mats.push(tail.material);
    // 甲羅のスパイク（ティア3+）
    if (tier >= 3) {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 12;
        const sp = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.32, 4),
          mat(mix(col, 0x88aaff, 0.4), { metal: 0.3 }));
        sp.position.set(Math.cos(a) * 0.7, 1.5, Math.sin(a) * 0.7);
        g.add(sp); mats.push(sp.material);
      }
    }
    g.userData.top = 1.95;
    return g;
  }

  /* ---- ジュエル系（jwl） — 結晶生物 ------------------------------------ */
  function buildJewelFamily(species, mats, decos) {
    const col = new THREE.Color(DB.ELEMENTS[species.el].color).getHex();
    const tier = Math.min(5, species.rank);
    const g = new THREE.Group();
    // 土台の小さな結晶ベース（地面に接する）
    const base = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.4, 6),
      mat(mix(col, 0x000000, 0.3), { flat: true, rough: 0.4, metal: 0.5 }));
    base.position.y = 0.2; g.add(base); mats.push(base.material);
    // メインの結晶体
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.85, 0),
      mat(col, { flat: true, rough: 0.15, metal: 0.65, opacity: 0.92,
        emissive: col, emissiveIntensity: 0.6 }));
    core.position.y = 1.05; g.add(core); mats.push(core.material);
    // 周囲の小さな結晶
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const cr = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0),
        mat(mix(col, 0xffffff, 0.3), { flat: true, rough: 0.18, metal: 0.55,
          emissive: col, emissiveIntensity: 0.5 }));
      cr.position.set(Math.cos(a) * 0.7, 0.55 + (i % 2) * 0.35, Math.sin(a) * 0.7);
      cr.rotation.set(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28);
      g.add(cr); mats.push(cr.material);
      decos.push({ obj: cr, kind: 'spin', axis: ['x', 'y', 'z'][i % 3], speed: 0.5 });
    }
    // 光る目
    [-0.18, 0.18].forEach(sx => {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 12),
        mat(0xffffff, { flat: false, emissive: 0xffffff, emissiveIntensity: 1.2, outline: false }));
      e.position.set(sx, 1.15, 0.7); g.add(e); mats.push(e.material);
    });
    g.userData.top = 1.95;
    return g;
  }

  /* ---- 虫系（bug） — 多節体＋触角＋複眼 ---------------------------------- */
  function buildBugFamily(species, mats, decos) {
    const col = new THREE.Color(DB.ELEMENTS[species.el].color).getHex();
    const tier = Math.min(5, species.rank);
    const g = new THREE.Group();
    // 3節の硬い甲殻
    const segs = [
      { z: 0.6, r: 0.55, c: 1.05 },
      { z: 0.0, r: 0.6,  c: 1.0 },
      { z: -0.6, r: 0.5, c: 0.9 },
    ];
    segs.forEach((s, i) => {
      const seg = new THREE.Mesh(new THREE.SphereGeometry(s.r, 18, 18),
        mat(shade(col, s.c), { flat: false, rough: 0.3, metal: 0.45 }));
      seg.position.set(0, 0.6, s.z); seg.scale.set(1.1, 0.85, 1.0);
      g.add(seg); mats.push(seg.material);
    });
    // 頭（前）
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 16),
      mat(shade(col, 1.1), { flat: false, rough: 0.3, metal: 0.4 }));
    head.position.set(0, 0.7, 0.95); g.add(head); mats.push(head.material);
    // 大きな複眼（黒・光沢）
    [-0.22, 0.22].forEach(sx => {
      const ce = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 16),
        mat(0x14141c, { flat: false, rough: 0.1, metal: 0.7 }));
      ce.position.set(sx, 0.78, 1.18); g.add(ce); mats.push(ce.material);
      // 反射のキラめき
      const hl = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8),
        mat(0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.7, outline: false }));
      hl.position.set(sx + 0.07, 0.88, 1.32); g.add(hl); mats.push(hl.material);
    });
    // 顎（小さなマンディブル）
    [-0.12, 0.12].forEach(sx => {
      const j = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.2, 4),
        mat(mix(col, 0x000000, 0.3)));
      j.position.set(sx, 0.55, 1.32); j.rotation.x = Math.PI;
      g.add(j); mats.push(j.material);
    });
    // 触角（光るチップ）
    [-0.15, 0.15].forEach(sx => {
      const a = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.55, 5),
        mat(shade(col, 0.6)));
      a.position.set(sx, 1.05, 1.15); a.rotation.set(-0.4, 0, sx * 0.4);
      g.add(a); mats.push(a.material);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 10),
        mat(mix(col, 0xffffff, 0.5), { emissive: col, emissiveIntensity: 0.6, outline: false }));
      tip.position.set(sx + sx * 0.3, 1.32, 1.45); g.add(tip); mats.push(tip.material);
    });
    // 6本の脚（3節 × 左右）
    [-1, 1].forEach(s => [0.6, 0.0, -0.55].forEach((sz, i) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.7, 5),
        mat(shade(col, 0.55)));
      leg.position.set(s * 0.55, 0.35, sz); leg.rotation.z = s * 0.9;
      g.add(leg); mats.push(leg.material);
      const ft = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8),
        mat(0x222226));
      ft.position.set(s * 0.85, 0.06, sz); g.add(ft); mats.push(ft.material);
    }));
    // ティア3+: 透明な翅
    if (tier >= 3) {
      [-1, 1].forEach(s => {
        const wing = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 8, 0, Math.PI),
          mat(0xeaf6ff, { flat: false, rough: 0.1, opacity: 0.35, metal: 0.2 }));
        wing.position.set(s * 0.4, 1.1, -0.1); wing.scale.set(0.4, 0.85, 1.1);
        wing.rotation.set(0.3, s * 0.4, 0);
        g.add(wing); mats.push(wing.material);
      });
    }
    // ティア4+: 背中のスパイク
    if (tier >= 4) {
      [-0.3, 0, 0.3].forEach(x => {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.32, 4),
          mat(shade(col, 0.5), { metal: 0.5 }));
        spike.position.set(x, 1.18, 0);
        g.add(spike); mats.push(spike.material);
      });
    }
    g.userData.top = 1.55;
    return g;
  }

  /* ---- 岩ゴーレム系（mat） — 重厚な岩のブロック ------------------------- */
  function buildStoneGolemFamily(species, mats, decos) {
    const col = new THREE.Color(DB.ELEMENTS[species.el].color).getHex();
    const stoneCol = mix(col, 0x6a6058, 0.55);
    const tier = Math.min(5, species.rank);
    const g = new THREE.Group();
    // 胸（巨大な岩の塊）
    const torso = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.4, 1.05),
      mat(stoneCol, { rough: 0.95, metal: 0.15, flat: true }));
    torso.position.y = 1.35; g.add(torso); mats.push(torso.material);
    // 胸の発光コア
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0),
      mat(col, { flat: true, rough: 0.2, emissive: col, emissiveIntensity: 1.2 }));
    core.position.set(0, 1.35, 0.55); g.add(core); mats.push(core.material);
    // 中央のクラック（発光ライン）
    const crack = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.0, 0.04),
      mat(mix(col, 0xffffff, 0.55), { flat: false, emissive: col, emissiveIntensity: 0.85 }));
    crack.position.set(0, 1.35, 0.54); g.add(crack); mats.push(crack.material);
    // 肩のロック（大きな丸い石）
    [-0.85, 0.85].forEach(sx => {
      const sh = new THREE.Mesh(new THREE.DodecahedronGeometry(0.4, 0),
        mat(shade(stoneCol, 0.95), { rough: 0.95, flat: true }));
      sh.position.set(sx, 2.0, 0); sh.rotation.set(Math.random(), Math.random(), Math.random());
      g.add(sh); mats.push(sh.material);
    });
    // 頭（小さなブロック）
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.62, 0.6),
      mat(shade(stoneCol, 1.05), { rough: 0.95, flat: true }));
    head.position.y = 2.4; g.add(head); mats.push(head.material);
    // 顎（下面）
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.45),
      mat(shade(stoneCol, 0.85)));
    jaw.position.set(0, 2.12, 0.05); g.add(jaw); mats.push(jaw.material);
    // 発光する目
    [-0.14, 0.14].forEach(sx => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 12),
        mat(mix(col, 0xfff8c0, 0.5), { emissive: col, emissiveIntensity: 1.4, outline: false }));
      eye.position.set(sx, 2.42, 0.31); g.add(eye); mats.push(eye.material);
    });
    // 太い腕（岩のブロック）
    [-1, 1].forEach(s => {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.15, 0.42),
        mat(shade(stoneCol, 0.88), { rough: 0.95, flat: true }));
      arm.position.set(s * 0.9, 1.3, 0); g.add(arm); mats.push(arm.material);
      // 拳（巨大）
      const fist = new THREE.Mesh(new THREE.DodecahedronGeometry(0.32, 0),
        mat(shade(stoneCol, 0.75), { rough: 0.95, flat: true }));
      fist.position.set(s * 0.9, 0.65, 0); g.add(fist); mats.push(fist.material);
      // 拳のクリスタル装飾
      if (tier >= 3) {
        const cs = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0),
          mat(col, { flat: true, emissive: col, emissiveIntensity: 0.9 }));
        cs.position.set(s * 1.05, 0.7, 0.15); g.add(cs); mats.push(cs.material);
      }
    });
    // 太い脚
    [-0.35, 0.35].forEach(sx => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.65, 0.45),
        mat(shade(stoneCol, 0.78), { rough: 0.95, flat: true }));
      leg.position.set(sx, 0.32, 0); g.add(leg); mats.push(leg.material);
    });
    // ティア4+: 背中の結晶
    if (tier >= 4) {
      [-0.2, 0.2].forEach((sx, i) => {
        const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0),
          mat(col, { flat: true, emissive: col, emissiveIntensity: 0.9 }));
        c.position.set(sx, 1.85, -0.55); c.rotation.set(0.5, 0, sx * 0.5);
        g.add(c); mats.push(c.material);
      });
    }
    g.userData.top = 2.85;
    return g;
  }

  /* ---- 水生系（aqu） — 大きな魚＋ヒレ＋ティア5触手 ----------------------- */
  function buildAquaticFamily(species, mats, decos) {
    const col = new THREE.Color(DB.ELEMENTS[species.el].color).getHex();
    const tier = Math.min(5, species.rank);
    const g = new THREE.Group();
    // 流線形の本体
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.85, 22, 18),
      mat(col, { flat: false, rough: 0.32, metal: 0.18 }));
    body.scale.set(1.55, 1, 0.95); body.position.y = 1.0;
    g.add(body); mats.push(body.material);
    // 腹（明るい・うろこ感）
    belly(g, 0.78, 0.1, 1.7, 0.7, mix(col, 0xfff8e0, 0.55), mats);
    // 上の背びれ（縦長三角）
    const dorsal = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.85, 4),
      mat(shade(col, 0.88), { opacity: 0.95, flat: true }));
    dorsal.position.set(0, 1.75, 0); g.add(dorsal); mats.push(dorsal.material);
    // 尾びれ（後ろの扇）
    const tailFin = new THREE.Mesh(new THREE.ConeGeometry(0.65, 0.8, 4),
      mat(shade(col, 0.85), { opacity: 0.92 }));
    tailFin.position.set(0, 1.0, -1.35); tailFin.rotation.x = Math.PI / 2;
    tailFin.scale.set(1, 0.5, 1);
    g.add(tailFin); mats.push(tailFin.material);
    // 横の小ヒレ
    [-1, 1].forEach(s => {
      const sf = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.55, 4),
        mat(shade(col, 0.9), { opacity: 0.9 }));
      sf.position.set(s * 0.88, 0.85, 0.3); sf.rotation.z = s * 1.1;
      sf.rotation.x = -0.3;
      g.add(sf); mats.push(sf.material);
    });
    // 大きな目
    [-0.35, 0.35].forEach(sx => {
      const w = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 16),
        mat(0xffffff, { flat: false, rough: 0.15 }));
      w.position.set(sx, 1.12, 0.7); g.add(w); mats.push(w.material);
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 12),
        mat(0x14141c, { flat: false }));
      p.position.set(sx, 1.12, 0.83); g.add(p); mats.push(p.material);
      const hl = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8),
        mat(0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.8, outline: false }));
      hl.position.set(sx + 0.04, 1.18, 0.92); g.add(hl); mats.push(hl.material);
    });
    // 口（少し開けて尖った歯）
    if (tier >= 3) {
      // 歯
      [-0.12, -0.04, 0.04, 0.12].forEach(sx => {
        const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.1, 4),
          mat(0xfff0d4));
        tooth.position.set(sx, 0.92, 1.32); tooth.rotation.x = Math.PI;
        g.add(tooth); mats.push(tooth.material);
      });
    }
    // 鰓（gills）
    [-0.6, 0.6].forEach(sx => [0, 0.13, -0.13].forEach(dy => {
      const gill = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.04),
        mat(shade(col, 0.65)));
      gill.position.set(sx, 1.0 + dy, 0.55); g.add(gill); mats.push(gill.material);
    }));
    // ティア5: 触手（クラーケン化）
    if (tier >= 5) {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        for (let k = 0; k < 4; k++) {
          const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.12 - k * 0.018, 0.13 - k * 0.018, 0.28, 8),
            mat(shade(col, 0.85)));
          const t = k / 4;
          seg.position.set(Math.cos(a) * (0.5 + t * 0.4),
                           0.55 - t * 0.5,
                           Math.sin(a) * (0.5 + t * 0.4));
          g.add(seg); mats.push(seg.material);
        }
      }
    }
    g.userData.top = 2.1;
    return g;
  }

  /* ---- 属性神（god_*）— 各属性ごとの神々しい姿 ------------------------- */
  function buildGodFamily(species, mats, decos) {
    const el = species.el;
    const col = new THREE.Color(DB.ELEMENTS[el].color).getHex();
    let g;
    // 各属性ごとに違うベースを使い、神々しさを上乗せ
    switch (el) {
      case 'fire':
      case 'light':
      case 'dark':
        g = buildDragonFamily(species, mats, decos);
        break;
      case 'water':
        g = buildAquaticFamily(species, mats, decos);
        break;
      case 'grass':
        g = buildPlantFamily(species, mats, decos);
        break;
      case 'wind':
        g = buildBirdFamily(species, mats, decos);
        break;
      case 'earth':
        g = buildStoneGolemFamily(species, mats, decos);
        break;
      case 'thunder':
        g = buildWolfFamily(species, mats, decos);
        break;
      default:
        g = buildSlimeFamily(species, mats, decos);
    }
    // 神聖オーラ：背後の大きな光輪
    const auraCol = mix(col, 0xffffff, 0.4);
    const aura = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.4, 36),
      new THREE.MeshBasicMaterial({ color: auraCol, transparent: true, opacity: 0.42, side: THREE.DoubleSide }));
    aura.position.set(0, g.userData.top * 0.55, -0.4);
    g.add(aura);
    decos.push({ obj: aura, kind: 'spin', axis: 'z', speed: 0.4 });
    // 王冠（金色の細かいスパイク）
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.32, 4),
        mat(0xffd23d, { metal: 0.7, rough: 0.2, flat: true, emissive: 0xffaa00, emissiveIntensity: 0.6 }));
      sp.position.set(Math.cos(a) * 0.42, g.userData.top + 0.15, Math.sin(a) * 0.42);
      g.add(sp); mats.push(sp.material);
    }
    // 周回する3つの大きなオーブ
    for (let i = 0; i < 3; i++) {
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 16),
        mat(col, { flat: false, emissive: col, emissiveIntensity: 1.3, opacity: 0.92 }));
      g.add(orb); mats.push(orb.material);
      decos.push({
        obj: orb, kind: 'orbit',
        radius: 1.4, angle: (i / 3) * Math.PI * 2, speed: 0.7,
        h: g.userData.top * 0.6,
      });
    }
    g.userData.top += 0.25;
    return g;
  }

  /* ---- 巨神（titan_*）— god よりさらに巨大かつ装飾 -------------------- */
  function buildTitanFamily(species, mats, decos) {
    const g = buildGodFamily(species, mats, decos);
    const col = new THREE.Color(DB.ELEMENTS[species.el].color).getHex();
    // 神より一回り大きく
    g.scale.multiplyScalar(1.18);
    // 二重の光輪（巨神の象徴）
    const halo2 = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.05, 8, 28),
      mat(0xfff5a8, { flat: false, emissive: 0xffd544, emissiveIntensity: 1.0 }));
    halo2.position.y = g.userData.top + 0.5;
    halo2.rotation.x = Math.PI / 2.2;
    g.add(halo2); mats.push(halo2.material);
    decos.push({ obj: halo2, kind: 'spin', axis: 'z', speed: 1.5 });
    // 後ろに6翼（神話の天使的）
    for (let i = 0; i < 3; i++) {
      [-1, 1].forEach(s => {
        const w = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 8, 0, Math.PI),
          mat(0xffffff, { flat: false, rough: 0.4, opacity: 0.85, emissive: col, emissiveIntensity: 0.3 }));
        w.position.set(s * 0.4, g.userData.top * 0.5 + i * 0.35, -0.55);
        w.scale.set(0.35, 1.0, 0.8);
        w.rotation.set(0, s * 0.4, s * 0.18);
        g.add(w); mats.push(w.material);
      });
    }
    // 王の杖（後ろから前へ突き出す）
    if (Math.random() > 0.5) { // ランダムだがビルド時固定（実質常時）
      const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 8),
        mat(0xc8a04a, { metal: 0.7, rough: 0.3 }));
      staff.position.set(0.95, 1.5, 0); staff.rotation.z = 0.15;
      g.add(staff); mats.push(staff.material);
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 16),
        mat(col, { flat: false, emissive: col, emissiveIntensity: 1.4 }));
      orb.position.set(1.13, 2.7, 0); g.add(orb); mats.push(orb.material);
    }
    return g;
  }

  /* ---- オリジン — 全属性の融合の究極存在 -------------------------------- */
  function buildOriginFamily(species, mats, decos) {
    const g = new THREE.Group();
    // 中心の白い人型（オーラ）
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.6, 24, 24),
      mat(0xffffff, { flat: false, rough: 0.15, emissive: 0xffffff, emissiveIntensity: 0.9 }));
    core.position.y = 1.4; g.add(core); mats.push(core.material);
    // 胸の大きなプリズム
    const prism = new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0),
      mat(0xffffff, { flat: true, rough: 0.1, opacity: 0.85,
        emissive: 0xffffff, emissiveIntensity: 1.5 }));
    prism.position.y = 1.4; g.add(prism); mats.push(prism.material);
    decos.push({ obj: prism, kind: 'spin', axis: 'y', speed: 0.5 });
    // 多重の翼（8枚＝全属性のシンボル）
    const ELS = ['fire', 'water', 'grass', 'wind', 'earth', 'thunder', 'light', 'dark'];
    ELS.forEach((el, i) => {
      const a = (i / ELS.length) * Math.PI * 2;
      const elc = new THREE.Color(DB.ELEMENTS[el].color).getHex();
      const wing = new THREE.Mesh(new THREE.SphereGeometry(0.7, 14, 8, 0, Math.PI),
        mat(elc, { flat: false, rough: 0.4, opacity: 0.55,
          emissive: elc, emissiveIntensity: 0.7 }));
      wing.position.set(Math.cos(a) * 0.65, 1.5, Math.sin(a) * 0.65);
      wing.scale.set(0.35, 1.1, 0.6);
      wing.rotation.set(0, -a, 0);
      g.add(wing); mats.push(wing.material);
    });
    // 大きな光輪（後ろ）
    const halo = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.5, 48),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
    halo.position.set(0, 1.6, -0.5); halo.rotation.x = -0.3;
    g.add(halo);
    decos.push({ obj: halo, kind: 'spin', axis: 'z', speed: 0.5 });
    // 全属性の周回オーブ
    ELS.forEach((el, i) => {
      const elc = new THREE.Color(DB.ELEMENTS[el].color).getHex();
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 14),
        mat(elc, { flat: false, emissive: elc, emissiveIntensity: 1.4 }));
      g.add(orb); mats.push(orb.material);
      decos.push({
        obj: orb, kind: 'orbit',
        radius: 1.7, angle: (i / ELS.length) * Math.PI * 2, speed: 0.6,
        h: 1.4 + Math.sin(i) * 0.4,
      });
    });
    // 王冠
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.4, 4),
        mat(0xffd23d, { metal: 0.8, rough: 0.15, flat: true,
          emissive: 0xffd544, emissiveIntensity: 0.95 }));
      sp.position.set(Math.cos(a) * 0.4, 2.4, Math.sin(a) * 0.4);
      g.add(sp); mats.push(sp.material);
    }
    // 顔（神々しい無表情）
    [-0.16, 0.16].forEach(sx => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 12),
        mat(0xfff8c0, { flat: false, emissive: 0xfff8c0, emissiveIntensity: 1.3, outline: false }));
      eye.position.set(sx, 1.55, 0.55); g.add(eye); mats.push(eye.material);
    });
    g.userData.top = 2.7;
    return g;
  }

  /* ---- 系統 → ビルダーの辞書 -------------------------------------------- */
  const FAMILY_BUILDERS = {
    sla: buildSlimeFamily,        // スライム — DQ風水滴
    mtl: buildMetalSlime,         // メタル — メタリック素材
    bea: buildWolfFamily,         // オオカミ
    ice: buildIceFamily,          // 氷ビースト
    thu: buildWolfFamily,         // サンダービースト（同じ狼ベース）
    dmn: buildWolfFamily,         // 悪魔系ビースト
    roc: buildWolfFamily,         // 岩獣
    uni: buildWolfFamily,         // ユニコーン（暫定）
    cat: buildCatFamily,          // ねこ
    bir: buildBirdFamily,         // 鳥
    win: buildBirdFamily,         // 風妖
    fay: buildBirdFamily,         // 妖精
    stb: buildBirdFamily,         // 石像鳥
    pla: buildPlantFamily,        // 植物
    mus: buildMushroomFamily,     // キノコ
    gho: buildGhostFamily,        // ゴースト
    ifr: buildFlameFamily,        // 炎の精
    dra: buildDragonFamily,       // 竜
    ser: buildDragonFamily,       // 蛇竜
    anu: buildDragonFamily,       // 光竜
    dev: buildDemonFamily,        // 悪魔
    lig: buildAngelFamily,        // 天使
    und: buildSkeletonFamily,     // アンデッド
    tur: buildTurtleFamily,       // 亀
    jwl: buildJewelFamily,        // 結晶
    bug: buildBugFamily,          // 虫
    mat: buildStoneGolemFamily,   // 岩ゴーレム
    aqu: buildAquaticFamily,      // 水生
    god: buildGodFamily,          // 属性神（rank 6）
    titan: buildTitanFamily,      // 巨神（rank 7）
    origin: buildOriginFamily,    // オリジン（究極）
  };

  /* AI画像（assets/monsters/<id>.png）があればスプライトとして使う。
   * 事前に Art.preload() で存在確認しておくことが前提。 */
  function buildSpriteCreature(species, mats, decos) {
    if (typeof Art === 'undefined') return null;
    if (Art.has(species.id) !== true) return null;
    const tex = Art.threeTexture(species.id);
    if (!tex) return null;
    const g = new THREE.Group();
    const matSprite = new THREE.SpriteMaterial({
      map: tex, transparent: true, alphaTest: 0.05,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(matSprite);
    // 体サイズ（ランクで大きくなる）
    const baseSize = 2.0 + Math.min(species.rank, 7) * 0.18;
    sprite.scale.set(baseSize, baseSize, 1);
    sprite.position.y = baseSize * 0.5 + 0.1;
    g.add(sprite);
    mats.push(matSprite);
    g.userData.top = baseSize + 0.2;
    g.userData.isSprite = true;
    return g;
  }

  /* ---- 全体ビルド ----------------------------------------------------- */
  function buildCreature(species) {
    const m = [];
    const decos = [];
    const col = new THREE.Color(DB.ELEMENTS[species.el].color).getHex();
    const demon = species.el === 'dark';
    let g;
    // 0. AI画像があれば最優先でスプライト化
    g = buildSpriteCreature(species, m, decos);
    if (g) {
      // 属性/ランクフレアはまだ載せる（光輪・周回オーブ等）
      const baseTop = g.userData.top;
      addElementFlair(g, species.el, baseTop, m, decos);
      addRankFlair(g, species.rank, col, baseTop, m, decos);
      const s = 0.74 + Math.min(species.rank, 7) * 0.1;
      g.scale.setScalar(s);
      g.userData.glow = species.rank >= 4 ? new THREE.Color(DB.ELEMENTS[species.el].color) : null;
      return {
        group: g, mats: m, decos,
        top: (baseTop + (species.rank >= 7 ? 0.35 : species.rank >= 5 ? 0.2 : 0.1)) * s,
        glow: g.userData.glow, scale: s,
      };
    }
    // 系統別ビルダーが定義されていれば優先（モンスター個性を出す）
    const familyFn = FAMILY_BUILDERS[species.family];
    if (familyFn) {
      g = familyFn(species, m, decos);
    } else {
      // フォールバック: 汎用アーキタイプ（属性神・巨神・オリジンや未定義の家系用）
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
        decos: built.decos, shadow, family: sp.family, scale: built.scale,
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
  function hit(uid, kind, el, attackerUid) {
    const e = find(uid); if (!e) return;
    e.anim.hit = 1; e.anim.hitKind = kind;
    // 属性別エフェクト（魔法）→ 通常打撃なら従来の赤バースト
    if (el && el !== 'none') {
      const atk = attackerUid != null ? find(attackerUid) : null;
      elementProjectile(atk, e, el);
      elementBurst(e, el);
    } else {
      impactBurst(e, kind);
    }
  }
  function heal(uid) {
    const e = find(uid); if (!e) return;
    e.anim.heal = 1;
    healBurst(e);
  }
  function buff(uid) {
    const e = find(uid); if (!e) return;
    e.anim.buff = 1;
    buffBurst(e);
  }

  /* 属性別の色と粒子形状 */
  const EL_COLORS = {
    fire:    { main: 0xff6a14, hl: 0xffd040, emit: 0xff3a00, geom: 'cone' },
    water:   { main: 0x3da4ff, hl: 0xc8e8ff, emit: 0x1a64aa, geom: 'crystal' },
    grass:   { main: 0x5fd06a, hl: 0xb6f0a8, emit: 0x2a8a2a, geom: 'leaf' },
    wind:    { main: 0xaeefe0, hl: 0xffffff, emit: 0x4ad0b0, geom: 'sphere' },
    earth:   { main: 0xc69a5b, hl: 0xefd09a, emit: 0x6b4a20, geom: 'rock' },
    thunder: { main: 0xffd23d, hl: 0xfff0a0, emit: 0xffa000, geom: 'bolt' },
    light:   { main: 0xfff1a8, hl: 0xffffff, emit: 0xffd544, geom: 'sphere' },
    dark:    { main: 0xa06bff, hl: 0xe0c0ff, emit: 0x5a30a0, geom: 'tendril' },
    none:    { main: 0xff5050, hl: 0xffaaaa, emit: 0xff2030, geom: 'sphere' },
  };
  function makeElementMesh(el, scale = 1) {
    const c = EL_COLORS[el] || EL_COLORS.none;
    let g;
    switch (c.geom) {
      case 'cone':
        g = new THREE.ConeGeometry(0.1 * scale, 0.28 * scale, 5); break;
      case 'crystal':
        g = new THREE.OctahedronGeometry(0.1 * scale, 0); break;
      case 'leaf':
        g = new THREE.ConeGeometry(0.08 * scale, 0.22 * scale, 3); break;
      case 'rock':
        g = new THREE.DodecahedronGeometry(0.1 * scale, 0); break;
      case 'bolt':
        g = new THREE.ConeGeometry(0.06 * scale, 0.34 * scale, 3); break;
      case 'tendril':
        g = new THREE.ConeGeometry(0.06 * scale, 0.32 * scale, 4); break;
      default:
        g = new THREE.SphereGeometry(0.1 * scale, 8, 8);
    }
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
      color: c.main, transparent: true, opacity: 0.95,
    }));
    m.material.emissive = new THREE.Color(c.emit);
    return m;
  }

  /* 属性別の被弾バースト */
  function elementBurst(e, el) {
    const c = EL_COLORS[el] || EL_COLORS.none;
    const n = el === 'fire' || el === 'thunder' ? 14 : 11;
    const cy = e.top * 0.55 + 0.3;
    for (let i = 0; i < n; i++) {
      const m = makeElementMesh(el, 0.8 + Math.random() * 0.6);
      m.position.set(e.group.position.x, cy, e.group.position.z);
      m.rotation.set(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28);
      scene.add(m);
      const a = Math.random() * Math.PI * 2;
      const sp = 3.0 + Math.random() * 2.5;
      const upBias = (el === 'fire' || el === 'thunder' || el === 'light') ? 2.5 : 1.2;
      burstParticles.push({
        mesh: m, mat: m.material,
        vx: Math.cos(a) * sp, vy: upBias + Math.random() * 2.0, vz: Math.sin(a) * sp,
        rx: (Math.random() - 0.5) * 4, ry: (Math.random() - 0.5) * 4, rz: (Math.random() - 0.5) * 4,
        age: 0, ttl: 0.55 + Math.random() * 0.3,
        gravity: (el === 'fire' || el === 'thunder' || el === 'light' || el === 'wind') ? -2.5 : -6,
      });
    }
    // 中心の閃光
    const flash = new THREE.Mesh(new THREE.SphereGeometry(0.5, 18, 18),
      new THREE.MeshBasicMaterial({
        color: c.hl, transparent: true, opacity: 0.85,
      }));
    flash.material.emissive = new THREE.Color(c.main);
    flash.position.set(e.group.position.x, cy, e.group.position.z);
    scene.add(flash);
    burstParticles.push({
      mesh: flash, mat: flash.material,
      vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, rz: 0,
      age: 0, ttl: 0.28, scale: 1, scaleVel: 3.0, gravity: 0,
    });
  }

  /* 属性別の投射体（攻撃側 → 被弾側） */
  function elementProjectile(atk, tgt, el) {
    if (!atk || !tgt) return;
    const c = EL_COLORS[el] || EL_COLORS.none;
    const sx = atk.group.position.x, sy = atk.top * 0.55, sz = atk.group.position.z;
    const tx = tgt.group.position.x, ty = tgt.top * 0.55 + 0.3, tz = tgt.group.position.z;
    const dx = tx - sx, dy = ty - sy, dz = tz - sz;
    const ttl = 0.32;
    const proj = makeElementMesh(el, 1.4);
    proj.position.set(sx, sy + 0.5, sz);
    scene.add(proj);
    burstParticles.push({
      mesh: proj, mat: proj.material,
      vx: dx / ttl, vy: dy / ttl, vz: dz / ttl,
      rx: 0, ry: el === 'wind' ? 12 : 6, rz: 0,
      age: 0, ttl, gravity: 0, fade: 0.4,
    });
  }

  /* 衝撃の粒子エフェクト：被弾位置に8〜12個の小球を放射状に飛ばす */
  let burstParticles = [];   // {mesh, vx,vy,vz, age, ttl, mat}
  const MAX_PARTICLES = 180;
  function _capParticles() {
    // 上限を超えたら一番古いものから削除
    while (burstParticles.length > MAX_PARTICLES) {
      const old = burstParticles.shift();
      if (old) {
        try { scene.remove(old.mesh); } catch (e) {}
        try { old.mat && old.mat.dispose(); } catch (e) {}
        try { old.mesh && old.mesh.geometry && old.mesh.geometry.dispose(); } catch (e) {}
      }
    }
  }
  function impactBurst(e, kind) {
    const isCrit = kind === 'crit';
    const n = isCrit ? 14 : 10;
    const col = isCrit ? 0xffd040 : 0xff5050;
    const cy = e.top * 0.5 + 0.5;
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.08 + Math.random() * 0.06, 6, 6),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.95 }));
      m.position.set(e.group.position.x, cy, e.group.position.z);
      scene.add(m);
      const a = Math.random() * Math.PI * 2;
      const sp = 3.5 + Math.random() * 2.5;
      burstParticles.push({
        mesh: m, mat: m.material,
        vx: Math.cos(a) * sp, vy: 2 + Math.random() * 2, vz: Math.sin(a) * sp,
        age: 0, ttl: 0.5 + Math.random() * 0.2,
      });
    }
  }
  function healBurst(e) {
    const n = 10;
    const cy = e.top * 0.5 + 0.4;
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.07 + Math.random() * 0.04, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0x6effa0, transparent: true, opacity: 0.92 }));
      m.position.set(e.group.position.x + (Math.random() - 0.5) * 0.6, cy, e.group.position.z + (Math.random() - 0.5) * 0.4);
      scene.add(m);
      burstParticles.push({
        mesh: m, mat: m.material,
        vx: (Math.random() - 0.5) * 0.6, vy: 1.5 + Math.random() * 1.0, vz: (Math.random() - 0.5) * 0.6,
        age: 0, ttl: 0.7 + Math.random() * 0.3,
      });
    }
  }
  function buffBurst(e) {
    const n = 8;
    const cy = e.top * 0.45;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const m = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.09, 0),
        new THREE.MeshBasicMaterial({ color: 0x9ac0ff, transparent: true, opacity: 0.95 }));
      m.position.set(e.group.position.x + Math.cos(a) * 0.6, cy, e.group.position.z + Math.sin(a) * 0.6);
      scene.add(m);
      burstParticles.push({
        mesh: m, mat: m.material,
        vx: 0, vy: 1.5 + Math.random() * 0.4, vz: 0,
        age: 0, ttl: 0.6,
      });
    }
  }
  function updateBurstParticles(dt) {
    if (burstParticles.length === 0) return;
    _capParticles();
    const next = [];
    for (const p of burstParticles) {
      p.age += dt;
      if (p.age >= p.ttl) {
        scene.remove(p.mesh);
        try { p.mat.dispose(); } catch (e) {}
        try { p.mesh.geometry && p.mesh.geometry.dispose(); } catch (e) {}
        continue;
      }
      // 位置
      p.vy += (p.gravity != null ? p.gravity : -6) * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      // 回転
      if (p.rx) p.mesh.rotation.x += p.rx * dt;
      if (p.ry) p.mesh.rotation.y += p.ry * dt;
      if (p.rz) p.mesh.rotation.z += p.rz * dt;
      // スケール変化（閃光の拡大用）
      if (p.scaleVel) {
        p.scale = (p.scale || 1) + p.scaleVel * dt;
        p.mesh.scale.setScalar(p.scale);
      }
      // 透明度
      const t = p.age / p.ttl;
      const fadeStart = p.fade != null ? p.fade : 0;
      const baseOp = (p.scaleVel ? 0.85 : 0.95);
      p.mat.opacity = baseOp * Math.max(0, 1 - (t - fadeStart) / Math.max(0.0001, (1 - fadeStart)));
      next.push(p);
    }
    burstParticles = next;
  }
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
    updateBurstParticles(dt);
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
      // アイドル（ふわふわ）— 系統ごとに微調整して個性を出す
      let bob = 0, sway = 0;
      let squishY = 1, squishXZ = 1;
      let rotZ = 0;
      if (!e.dead) {
        const t = clock + e.phase;
        switch (e.family) {
          case 'sla': case 'mtl':  // スライム系: ぷるぷる
            bob = Math.sin(t * 2.0) * 0.05;
            squishY = 1 + Math.sin(t * 4.5) * 0.06;
            squishXZ = 1 - (squishY - 1) * 0.5;
            break;
          case 'gho':  // ゴースト: 高めにふわふわ＋左右ドリフト
            bob = Math.sin(t * 1.4) * 0.18 + 0.15;
            sway = Math.sin(t * 0.8) * 0.1;
            rotZ = Math.sin(t * 0.6) * 0.05;
            break;
          case 'ifr':  // 炎: 高速にゆらぐ
            bob = Math.sin(t * 3.5) * 0.06;
            squishY = 1 + Math.sin(t * 7) * 0.04;
            squishXZ = 1 - (squishY - 1) * 0.3;
            break;
          case 'bug':  // 虫: 細かい震え
            bob = Math.sin(t * 2.5) * 0.04;
            sway = Math.sin(t * 6) * 0.02;
            break;
          case 'jwl': case 'mat':  // 結晶/岩: ほぼ動かない（重厚感）
            bob = Math.sin(t * 1.5) * 0.025;
            break;
          case 'bir': case 'win': case 'fay': case 'stb':  // 鳥: 翼の上下感
            bob = Math.sin(t * 3.0) * 0.12;
            break;
          case 'lig': case 'god': case 'titan': case 'origin':  // 神: ゆったり浮遊
            bob = Math.sin(t * 1.2) * 0.12 + 0.08;
            rotZ = Math.sin(t * 0.4) * 0.04;
            break;
          case 'aqu':  // 水生: 横にゆらゆら（泳ぐ感）
            sway = Math.sin(t * 1.5) * 0.08;
            bob = Math.cos(t * 1.5) * 0.05;
            break;
          default:  // ふつうの獣・人型・ドラゴン等
            bob = Math.sin(t * 2.2) * 0.09;
        }
      }
      // 気絶
      if (e.dead) {
        e.group.rotation.x = Math.min(Math.PI / 2.1, e.group.rotation.x + dt * 2.5);
        e.mats.forEach(m => { m.opacity = Math.max(0.18, m.opacity - dt * 1.5); });
        if (e.shadow) e.shadow.material.opacity = Math.max(0, e.shadow.material.opacity - dt * 1.5);
      } else {
        e.group.rotation.x = 0;
        e.group.rotation.z = rotZ;
        // squish: 元のスケール(e.scale)に係数を掛ける
        e.group.scale.set(e.scale * squishXZ, e.scale * squishY, e.scale * squishXZ);
      }

      e.group.position.set(x + sway, y + bob, z);
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
    burstParticles.forEach(p => { try { p.mat.dispose(); } catch (e) {} });
    burstParticles = [];
  }

  function pause() { paused = true; if (raf) { cancelAnimationFrame(raf); raf = null; } }
  function resume() { if (paused && active) { paused = false; last = performance.now(); loop(); } }

  return { init, setup, updateBars, setTargetMode, act, hit, heal, buff, pop, dispose, pause, resume,
           get active() { return active; } };
})();
