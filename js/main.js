/* =========================================================================
 *  main.js  —  起動
 * =======================================================================*/
window.addEventListener('DOMContentLoaded', () => {
  UI.init();
  // ミュートボタンの表示を保存状態に合わせる
  if (typeof SoundFX !== 'undefined') {
    const btn = document.getElementById('mute-btn');
    if (btn) btn.textContent = SoundFX.isMuted() ? '🔇' : '🔊';
  }
});
