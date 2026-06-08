/* =========================================================================
 *  main.js  —  起動（スプラッシュ表示 → UI初期化 → スプラッシュ解除）
 * =======================================================================*/
function bootGame() {
  try {
    UI.init();
    // ミュートボタンの表示を保存状態に合わせる
    if (typeof SoundFX !== 'undefined') {
      const btn = document.getElementById('mute-btn');
      if (btn) btn.textContent = SoundFX.isMuted() ? '🔇' : '🔊';
    }
  } catch (e) {
    console.error('[Boot]', e);
    // 致命エラー: スプラッシュにエラー表示
    const splash = document.getElementById('splash');
    if (splash) {
      const tip = splash.querySelector('.splash-tip');
      if (tip) tip.innerHTML = '⚠ 起動エラー<br>ページを 再読み込みしてください';
      const sp = splash.querySelector('.splash-spinner');
      if (sp) sp.style.display = 'none';
    }
    return;
  }
  // スプラッシュをフェードアウト（フレームを1つ挟んで最初の描画安定後に）
  requestAnimationFrame(() => {
    setTimeout(() => {
      const splash = document.getElementById('splash');
      if (splash) splash.classList.add('done');
    }, 300);   // 一瞬残してドラマチックに
  });
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', bootGame);
} else {
  bootGame();
}
