/* =========================================================================
 *  ui.js  —  画面ルーター（モンスター・スナップ専用）
 *
 *  画面: home / snap / dex / settings
 *  3D RPG（バトル/世界/闘技場/ストーリー）は廃止。157体のデータ(data.js)と
 *  State(save/load)・SoundFX(音)・Art(画像) は Snap で共用するため温存。
 * =======================================================================*/
const UI = (() => {

  let root;
  let backTarget = 'home';

  // モード保持（次のスナップ起動時に 引き継ぐ）
  let snapMode = 'cpu';      // 'cpu' | 'online'
  let onlineOpp = null;       // online 対戦の 相手情報

  /* ===== ルーター ====================================================== */
  function show(name) {
    root = document.getElementById('screen');
    closeModal();
    if (name === 'home') renderHome();
    else if (name === 'snap') renderSnap();
    else if (name === 'deck') renderDeck();
    else if (name === 'dex') renderDex();
    else if (name === 'settings') renderSettings();
    else renderHome();
    window.scrollTo(0, 0);
    // BGM
    if (typeof SoundFX !== 'undefined') {
      SoundFX.bgm(name === 'snap' ? 'battle' : 'town');
    }
  }

  function goScreen(name, back) { backTarget = back; show(name); }

  /* ===== 共通パーツ ===================================================== */
  function header(title) {
    return `<div class="topbar">
      <button class="back-btn" data-act="back">← もどる</button>
      <span class="topbar-title">${title}</span></div>`;
  }

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

  function toast(msg, kind = 'ok', ms = 2200) {
    let bar = document.getElementById('toast');
    if (!bar) {
      bar = document.createElement('div'); bar.id = 'toast'; bar.className = 'toast';
      document.body.appendChild(bar);
    }
    bar.textContent = msg;
    bar.className = 'toast show ' + kind;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { bar.className = 'toast'; }, ms);
  }

  /* ===== タイトル ====================================================== */
  function renderHome() {
    // 適当に 3〜5 体の代表モンスター絵を 並べる（タイトル装飾）
    const featured = ['sla1', 'bea1', 'bir1', 'cat1', 'mus1'];
    const emojis = featured.map(id => {
      const sp = DB.species(id);
      if (!sp) return '';
      const inner = (typeof Art !== 'undefined') ? Art.imgTag(id, sp.emoji, { cls: 'home-art' }) : sp.emoji;
      return `<span class="home-emoji">${inner}</span>`;
    }).join('');
    const wins = (State.data && State.data.snapWins) || 0;
    const rank = (State.data && State.data.snapRank) || 0;
    const onlineAvail = (typeof Online !== 'undefined') && Online.available();
    root.innerHTML = `
      <div class="home title">
        <h1 class="game-title">モンスター<br><span>スナップ</span></h1>
        <p class="title-sub">— 3レーン × 6ターン の カードバトル —</p>
        <div class="pp-emojis">${emojis}</div>
        <button class="menu-btn big start" data-act="startSnapCpu"
          style="background:linear-gradient(180deg,#ff7a30,#c43014);border-color:#ffd23d;">
          <span class="mi">🎴</span>CPU と たいせん
        </button>
        ${onlineAvail ? `
          <button class="menu-btn big start" data-act="startSnapOnline"
            style="margin-top:10px;background:linear-gradient(180deg,#5b8cff,#3a64e0);border-color:#a8c5ff;">
            <span class="mi">🌐</span>オンライン たいせん
          </button>` : ''}
        <button class="menu-btn" data-act="goDeck" style="margin-top:10px;">
          <span class="mi">📋</span>デッキ編成
        </button>
        <div class="title-mini">
          <button class="btn ghost" data-act="dexFromTitle">📖 ずかん</button>
          <button class="btn ghost" data-act="settingsFromTitle">⚙️ せってい</button>
        </div>
        <div class="home-stat">かちすう ${wins} ／ ランク ${rank}</div>
      </div>`;
  }

  /* ===== モンスター・スナップ ========================================= */
  function renderSnap() {
    if (typeof SnapUI === 'undefined') {
      root.innerHTML = `${header('モンスター・スナップ')}
        <p class="hint">スナップ・モジュールが 読み込まれていません。再読み込みしてください。</p>`;
      return;
    }
    // 保存済みデッキを 使用（無ければ スターター）
    const deck = (State.data && State.data.snapDeck && State.data.snapDeck.length === 12)
      ? State.data.snapDeck.slice()
      : SnapData.starterDeck();
    let enemyDeck = null, opponentName = 'CPU';
    if (snapMode === 'online' && onlineOpp) {
      enemyDeck = onlineOpp.deck;
      opponentName = onlineOpp.name;
    }
    SnapUI.start({
      deck, enemyDeck, opponentName, mode: snapMode,
      onExit: () => show('home'),
    });
  }

  /* ===== デッキ編成 ===================================================== */
  function renderDeck() {
    if (typeof SnapDeck === 'undefined') {
      root.innerHTML = `${header('デッキ編成')}
        <p class="hint">デッキ・モジュールが 読み込まれていません。</p>`;
      return;
    }
    SnapDeck.start({ onExit: () => show('home') });
  }

  /* ===== オンライン対戦の 起動 ========================================= */
  async function startOnlineMatch() {
    if (typeof Online === 'undefined' || !Online.available()) {
      toast('オンラインは 未設定です', 'warn');
      return;
    }
    showModal(`<div class="dialogue"><div class="dlg-text">🌐 あいてを さがしています…</div></div>`, true);
    try {
      // 自分のデッキを 公開
      const myDeck = (State.data.snapDeck && State.data.snapDeck.length === 12)
        ? State.data.snapDeck
        : SnapData.starterDeck();
      await Online.publishSnapDeck(myDeck);
      // 相手を 探す
      const opp = await Online.findSnapOpponent();
      closeModal();
      if (!opp) {
        toast('いま 対戦相手が いません。CPU と 遊ぼう', 'warn');
        return;
      }
      onlineOpp = opp;
      snapMode = 'online';
      toast(`${opp.name}(R${opp.rank}) と マッチング！`, 'ok');
      show('snap');
    } catch (e) {
      closeModal();
      console.error('[Online]', e);
      toast('オンライン接続失敗', 'err');
    }
  }

  /* ===== ずかん（157体一覧） =========================================== */
  function renderDex() {
    const ids = Object.keys(DB.SPECIES || {});
    const cells = ids.map(id => {
      const s = DB.species(id);
      const art = (typeof Art !== 'undefined') ? Art.imgTag(id, s.emoji, { cls: 'dex-art' }) : s.emoji;
      const el = (DB.ELEMENTS[s.el] && DB.ELEMENTS[s.el].name) || '';
      return `<div class="dex-cell">
        <div class="dex-emoji">${art}</div>
        <div class="dex-name">${s.name}</div>
        <div class="dex-sub" style="font-size:9px;color:var(--sub);">ランク${DB.rankLabel(s)} / ${el}</div>
      </div>`;
    }).join('');
    root.innerHTML = `${header('ずかん')}
      <p class="hint">全 ${ids.length} 種類のモンスター。Snap デッキ素材として 使われます。</p>
      <div class="dex-grid">${cells}</div>`;
  }

  /* ===== せってい ====================================================== */
  function renderSettings() {
    const muted = (typeof SoundFX !== 'undefined') && SoundFX.isMuted();
    const sfxVol = Math.round(((State.data.audio && State.data.audio.sfx) ?? 0.4) * 100);
    const bgmVol = Math.round(((State.data.audio && State.data.audio.bgm) ?? 0.32) * 100);
    const wins = State.data.snapWins || 0;
    root.innerHTML = `${header('せってい')}
      <div class="settings">
        <div class="set-row">
          <b>サウンド</b>
          <div class="set-mute">
            <button class="btn small" data-act="toggleMute">${muted ? '🔇 ミュート中' : '🔊 サウンドON'}</button>
          </div>
          <label class="set-slider">SFX <input type="range" min="0" max="100" value="${sfxVol}" data-act="setSfxVol"><span class="set-val">${sfxVol}</span></label>
          <label class="set-slider">BGM <input type="range" min="0" max="100" value="${bgmVol}" data-act="setBgmVol"><span class="set-val">${bgmVol}</span></label>
        </div>

        <div class="set-row">
          <b>Snap の きろく</b>
          <div class="set-stats">
            <span>かちすう <b>${wins}</b></span>
          </div>
        </div>

        <div class="set-row">
          <b>セーブデータ</b>
          <div class="set-actions">
            <button class="btn small" data-act="exportSave">📥 エクスポート</button>
            <button class="btn small" data-act="importSave">📤 インポート</button>
            <button class="btn small danger" data-act="reset">🗑️ 初期化</button>
          </div>
          <p class="hint">エクスポートで セーブを 文字列化して 保存・別端末へ 移行できる。</p>
        </div>

        <div class="set-row">
          <b>🎨 AIモンスター画像 作成</b>
          <p class="hint">PC を使わず スマホだけで AI画像を 生成して ゲームに 反映できます。</p>
          <a href="mobile.html" class="btn primary" target="_blank" rel="noopener" style="text-decoration:none;display:inline-block;">
            📱 スマホで AI画像を作る
          </a>
        </div>

        <div class="set-row">
          <b>このゲームについて</b>
          <p class="hint">
            モンスター・スナップ v1 — 157体の モンスターを 使った 3レーン カードバトル。<br>
            ライセンス: 個人利用OK / オープンソース<br>
            <a href="https://github.com/minaiiiiiiiiii0310-beep/monster-fusion-world" target="_blank" rel="noopener" style="color:var(--accent);">GitHub リポジトリ</a>
          </p>
        </div>
      </div>`;
  }

  /* ===== セーブ エクスポート/インポート ================================= */
  function exportSaveData() {
    try {
      const raw = localStorage.getItem('monfusion_save_v2') || '';
      if (!raw) { toast('セーブが ありません', 'warn'); return; }
      const enc = btoa(unescape(encodeURIComponent(raw)));
      showModal(`<div class="dialogue"><div class="dlg-spk">📥 セーブの エクスポート</div>
        <div class="dlg-text">下の 文字列を コピーして 安全な場所に 保存してください。
          別端末で インポートすると 進行を 引き継げます。</div>
        <textarea class="save-blob" readonly onclick="this.select()">${enc}</textarea>
        <button class="btn primary wide" data-act="copySave" data-blob="${enc}">📋 コピー</button>
        <button class="btn ghost wide" data-act="closeModal">とじる</button>
        </div>`, false);
    } catch (e) { toast('エクスポート失敗', 'err'); }
  }
  function importSaveData() {
    showModal(`<div class="dialogue"><div class="dlg-spk">📤 セーブの インポート</div>
      <div class="dlg-text">エクスポートで えた 文字列を 貼り付けて ください。
        <strong>げんざいの セーブは 上書き されます。</strong></div>
      <textarea class="save-blob" id="import-blob" placeholder="ここに 貼り付け…"></textarea>
      <button class="btn primary wide" data-act="confirmImport">⚠ 上書きして インポート</button>
      <button class="btn ghost wide" data-act="closeModal">キャンセル</button>
      </div>`, false);
  }
  function confirmImport() {
    const ta = document.getElementById('import-blob');
    if (!ta) return;
    const enc = (ta.value || '').trim();
    if (!enc) { toast('文字列が 空です', 'warn'); return; }
    try {
      const raw = decodeURIComponent(escape(atob(enc)));
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.data) throw new Error('invalid');
      try { localStorage.setItem('monfusion_save_v2_backup', localStorage.getItem('monfusion_save_v2') || ''); } catch (e) {}
      localStorage.setItem('monfusion_save_v2', raw);
      closeModal();
      toast('インポート 成功！ 再読み込みします…', 'ok');
      setTimeout(() => location.reload(), 1100);
    } catch (e) { toast('文字列の 形式が ちがいます', 'err'); }
  }
  function copySave(blob) {
    if (!navigator.clipboard) return toast('クリップボードが 使えません', 'warn');
    navigator.clipboard.writeText(blob).then(
      () => toast('コピー しました', 'ok'),
      () => toast('コピー 失敗', 'err'),
    );
  }

  /* ===== クリック ディスパッチ ======================================== */
  const ACTIONS = {
    home: () => show('home'),
    back: () => show(backTarget),
    closeModal: () => closeModal(),

    // タイトル
    startSnap: () => { snapMode = 'cpu'; backTarget = 'home'; show('snap'); },
    startSnapCpu: () => { snapMode = 'cpu'; onlineOpp = null; backTarget = 'home'; show('snap'); },
    startSnapOnline: () => { startOnlineMatch(); },
    goDeck: () => goScreen('deck', 'home'),
    dexFromTitle: () => goScreen('dex', 'home'),
    settingsFromTitle: () => goScreen('settings', 'home'),

    // デッキ編成
    deckAdd: (d) => SnapDeck.addCard(d.id),
    deckRemove: (d) => SnapDeck.removeCard(d.uid),
    deckFilter: (d) => SnapDeck.setFilter(d.kind, d.value),
    deckSave: () => SnapDeck.save(),
    deckExit: () => SnapDeck.exit(),

    // ミュート/音量
    mute: () => {
      if (typeof SoundFX === 'undefined') return;
      SoundFX.setMuted(!SoundFX.isMuted());
      const btn = document.getElementById('mute-btn');
      if (btn) btn.textContent = SoundFX.isMuted() ? '🔇' : '🔊';
    },
    toggleMute: () => { ACTIONS.mute(); renderSettings(); },
    setSfxVol: (d, t, e) => {
      const v = (e.target?.value ?? t.value) / 100;
      if (typeof SoundFX !== 'undefined') SoundFX.setVolumes({ sfx: v });
      if (!State.data.audio) State.data.audio = { sfx: 0.4, bgm: 0.32 };
      State.data.audio.sfx = v; State.save();
      const valEl = t.parentElement?.querySelector('.set-val');
      if (valEl) valEl.textContent = Math.round(v * 100);
    },
    setBgmVol: (d, t, e) => {
      const v = (e.target?.value ?? t.value) / 100;
      if (typeof SoundFX !== 'undefined') SoundFX.setVolumes({ bgm: v });
      if (!State.data.audio) State.data.audio = { sfx: 0.4, bgm: 0.32 };
      State.data.audio.bgm = v; State.save();
      const valEl = t.parentElement?.querySelector('.set-val');
      if (valEl) valEl.textContent = Math.round(v * 100);
    },

    // セーブ
    exportSave: () => exportSaveData(),
    importSave: () => importSaveData(),
    confirmImport: () => confirmImport(),
    copySave: (d) => copySave(d.blob || ''),
    reset: () => { if (window.confirm('データをけして さいしょから はじめますか？')) { State.reset(); show('home'); } },

    // Snap
    snapPick: (d) => SnapUI.pickCard(+d.uid),
    snapDrop: (d) => SnapUI.dropOn(+d.lane),
    snapUnplay: (d) => SnapUI.unplayCard(+d.uid),
    snapWithdraw: (d) => SnapUI.withdrawCard(+d.uid),
    snapEndTurn: () => SnapUI.endTurn(),
    snapAttackPick: (d) => SnapUI.pickAttacker(+d.uid),
    snapAttackTarget: (d) => SnapUI.attackTarget(+d.uid),
    snapFinishCombat: () => SnapUI.finishCombat(),
    snapSnap: () => SnapUI.snap(),
    snapRetreat: () => SnapUI.retreat(),
    snapRestart: () => SnapUI.restart(),
    snapExit: () => { SnapUI.exit(); show('home'); },
  };

  function onClick(e) {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    if (t.tagName === 'INPUT' && t.type === 'range') return;
    const act = t.dataset.act;
    if (typeof SoundFX !== 'undefined') {
      SoundFX.unlock();
      if (act === 'closeModal' || act === 'cancel' || act === 'back') SoundFX.sfx('cancel');
      else SoundFX.sfx('click');
    }
    if (ACTIONS[act]) { e.preventDefault(); ACTIONS[act](t.dataset, t, e); }
  }

  function onInput(e) {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const act = t.dataset.act;
    if (ACTIONS[act]) ACTIONS[act](t.dataset, t, e);
  }

  /* ===== 起動 ========================================================== */
  function init() {
    document.addEventListener('click', onClick);
    document.addEventListener('input', onInput);
    State.load();
    if (typeof SoundFX !== 'undefined' && State.data.audio) {
      SoundFX.setVolumes(State.data.audio);
    }
    show('home');

    // 初期スターターの AI 画像を先読み
    if (typeof Art !== 'undefined' && Art.preload) {
      const starters = ['sla1', 'bea1', 'bir1', 'cat1', 'mus1', 'pla1'];
      Art.preload(starters);
    }
  }

  return { init, show };
})();
