/* =========================================================================
 *  art.js  —  モンスター AI 画像の読込ヘルパー
 *
 *  各モンスター画像は assets/monsters/<species-id>.png （透過PNG, 512x512推奨）
 *  に配置すると、ゲーム内の全画面（バトル/ずかん/ぼくじょう/ゆうごう/フィールド）
 *  で自動的に絵文字の代わりに表示される。画像が無いものは絵文字フォールバック。
 *
 *  使用法:
 *    Art.imgTag('sla1', 'sla1.emoji'): 画像があれば<img>を返し、無ければ
 *                                      onerror で絵文字へフォールバック
 *    Art.has(id) -> boolean (既に確認済みのものだけ true/false、未確認は undefined)
 *    Art.preload([id1, id2, ...]): バトル開始前などにまとめて先読み
 *    Art.threeTexture(id): Three.js 用テクスチャ（無ければ null）
 * =======================================================================*/
const Art = (() => {
  const PATH = 'assets/monsters/';
  // モバイルでの保存はリネームが面倒なので 主要な画像拡張子を全部許容
  const EXTS = ['.png', '.jpg', '.jpeg', '.webp'];
  // species_id -> { state: 'unknown'|'loading'|'ok'|'missing', ext: '.png', img: HTMLImageElement|null }
  const state = new Map();

  // 既知の(存在する)画像一覧を非同期に取得して state を埋める。
  // /assets/monsters/manifest.json があれば優先利用。
  async function loadManifest() {
    try {
      const res = await fetch(PATH + 'manifest.json', { cache: 'no-cache' });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data && data.species)) {
        data.species.forEach(id => state.set(id, { state: 'ok', img: null, ext: '.png' }));
      }
      // 拡張子別 リスト（manifest 高速化用）
      ['speciesJpg', 'speciesJpeg', 'speciesWebp'].forEach(key => {
        const ext = '.' + key.replace('species', '').toLowerCase();
        if (Array.isArray(data && data[key])) {
          data[key].forEach(id => state.set(id, { state: 'ok', img: null, ext }));
        }
      });
    } catch (e) { /* manifest 無くてもOK：onerrorで個別判定 */ }
  }

  function url(id, ext) {
    return PATH + id + (ext || (state.get(id) && state.get(id).ext) || '.png');
  }

  function has(id) {
    const s = state.get(id);
    return s ? s.state === 'ok' : undefined;   // 未確認 = undefined
  }

  function _markOk(id, img, ext) {
    state.set(id, { state: 'ok', img, ext: ext || '.png' });
  }
  function _markMissing(id) {
    state.set(id, { state: 'missing', img: null });
  }

  /* HTML用: 画像 + 絵文字フォールバック をネスト
     画像が見つからない場合、複数の拡張子を順に試して全部失敗したら絵文字へ */
  function imgTag(id, emoji, opts = {}) {
    const cls = opts.cls || 'mon-art';
    const alt = opts.alt || '';
    const size = opts.size || '';
    const known = has(id);
    if (known === false) {
      // 過去に missing 確定 → 絵文字だけ
      return `<span class="${cls}-emoji">${emoji}</span>`;
    }
    // 状態既知（ok）なら そのext、それ以外は .png から始めて onerror で .jpg/.jpeg/.webp 順に試す
    const startExt = (state.get(id) && state.get(id).ext) || '.png';
    const sizeAttr = size ? ` width="${size}" height="${size}"` : '';
    return `<img class="${cls}" src="${url(id, startExt)}"${sizeAttr} alt="${alt}"
      data-emoji="${emoji}" data-art-id="${id}" data-tried="${startExt}"
      onerror="window.Art && window.Art._onErr && window.Art._onErr(this)"
      onload="window.Art && window.Art._onOk && window.Art._onOk(this)">`;
  }

  function _onOk(imgEl) {
    const id = imgEl.dataset.artId;
    const ext = imgEl.dataset.tried || '.png';
    if (id) _markOk(id, null, ext);
  }
  function _onErr(imgEl) {
    const id = imgEl.dataset.artId;
    const tried = (imgEl.dataset.tried || '').split(',');
    // まだ試していない拡張子があれば 次を試す
    const remaining = EXTS.filter(e => !tried.includes(e));
    if (remaining.length > 0) {
      const next = remaining[0];
      imgEl.dataset.tried = (tried.join(',') + ',' + next).replace(/^,/, '');
      imgEl.src = url(id, next);
      return;
    }
    // 全拡張子失敗 → 絵文字に置換
    if (id) _markMissing(id);
    const emoji = imgEl.dataset.emoji || '';
    const span = document.createElement('span');
    span.className = (imgEl.className || 'mon-art') + '-emoji';
    span.textContent = emoji;
    imgEl.replaceWith(span);
  }

  /* Three.js: 画像が読めればテクスチャを返す（読めなければ null） */
  const texCache = new Map();
  function threeTexture(id) {
    if (typeof THREE === 'undefined') return null;
    if (has(id) === false) return null;
    if (texCache.has(id)) return texCache.get(id);
    try {
      const loader = new THREE.TextureLoader();
      const tex = loader.load(
        url(id),
        () => { _markOk(id); if (tex.colorSpace !== undefined) tex.colorSpace = THREE.SRGBColorSpace; },
        undefined,
        () => { _markMissing(id); texCache.set(id, null); }
      );
      texCache.set(id, tex);
      return tex;
    } catch (e) { texCache.set(id, null); return null; }
  }

  /* 先読み（バトル開始前など）— Promise を返す。
     複数の拡張子を順に試す。 */
  function preload(ids) {
    if (!Array.isArray(ids) || ids.length === 0) return Promise.resolve();
    return Promise.all(ids.map(id => new Promise(resolve => {
      if (has(id) !== undefined) return resolve();
      let i = 0;
      const tryNext = () => {
        if (i >= EXTS.length) { _markMissing(id); return resolve(); }
        const ext = EXTS[i++];
        const img = new Image();
        img.onload = () => { _markOk(id, img, ext); resolve(); };
        img.onerror = tryNext;
        img.src = url(id, ext);
      };
      tryNext();
    })));
  }

  /* AI画像が1つでも存在することを検出（自動で2Dモード推奨用） */
  function anyExists() {
    for (const [, v] of state) if (v.state === 'ok') return true;
    return false;
  }

  loadManifest();
  return { url, has, imgTag, threeTexture, preload, anyExists, _onErr, _onOk };
})();
window.Art = Art;
