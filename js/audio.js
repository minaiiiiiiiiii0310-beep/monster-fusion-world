/* =========================================================================
 *  audio.js  —  Web Audio API による効果音(SFX)と簡易BGM
 *
 *  外部音声ファイル不要。すべて AudioContext のオシレータ＋ノイズで合成。
 *  - SoundFX: 戦闘ヒット/クリティカル/回復/強化/属性魔法/勝利/敗北 等
 *  - BGM: town / field / battle / boss / victory（短いアルペジオループ）
 *  - 初回のユーザータップで AudioContext を unlock（モバイル要件）
 *  - localStorage で ミュート設定を保持
 * =======================================================================*/
const SoundFX = (() => {
  let ctx, master, sfxBus, bgmBus;
  let bgmTimer = null, bgmPlaying = false;
  let muted = false;
  let sfxVol = 0.4, bgmVol = 0.32;
  const SAVE_KEY = 'monfusion_muted';

  try { muted = localStorage.getItem(SAVE_KEY) === '1'; } catch (e) {}

  function init() {
    if (ctx) return;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 1;     // master はミュート専用（0/1）
      master.connect(ctx.destination);
      sfxBus = ctx.createGain();
      sfxBus.gain.value = sfxVol;
      sfxBus.connect(master);
      bgmBus = ctx.createGain();
      bgmBus.gain.value = bgmVol;
      bgmBus.connect(master);
    } catch (e) { ctx = null; }
  }

  function unlock() {
    if (!ctx) init();
    if (ctx && ctx.state === 'suspended') {
      try { ctx.resume(); } catch (e) {}
    }
  }

  function setMuted(m) {
    muted = !!m;
    try { localStorage.setItem(SAVE_KEY, muted ? '1' : '0'); } catch (e) {}
    if (master) master.gain.value = muted ? 0 : 1;
  }
  function isMuted() { return muted; }
  function setVolumes(v) {
    if (v && typeof v.sfx === 'number') sfxVol = Math.max(0, Math.min(1, v.sfx));
    if (v && typeof v.bgm === 'number') bgmVol = Math.max(0, Math.min(1, v.bgm));
    if (sfxBus) sfxBus.gain.value = sfxVol;
    if (bgmBus) bgmBus.gain.value = bgmVol;
  }
  function getVolumes() { return { sfx: sfxVol, bgm: bgmVol }; }

  /* オシレータ単発 */
  function tone(freq, dur, type = 'sine', vol = 0.3, attack = 0.005) {
    if (!ctx || muted) return;
    const now = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(vol, now + attack);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    o.connect(g); g.connect(sfxBus);
    o.start(now); o.stop(now + dur + 0.02);
  }

  /* 周波数スイープ */
  function sweep(f1, f2, dur, type = 'sawtooth', vol = 0.3) {
    if (!ctx || muted) return;
    const now = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f1, now);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), now + dur);
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    o.connect(g); g.connect(sfxBus);
    o.start(now); o.stop(now + dur + 0.02);
  }

  /* ノイズバースト（衝撃・ノイジー成分） */
  function noise(dur, vol = 0.3, filterFreq = 0) {
    if (!ctx || muted) return;
    const now = ctx.currentTime;
    const bufSize = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
      const env = 1 - i / bufSize;
      d[i] = (Math.random() * 2 - 1) * env;
    }
    const src = ctx.createBufferSource(); src.buffer = buf;
    const g = ctx.createGain(); g.gain.value = vol;
    let node = src;
    if (filterFreq > 0) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = filterFreq;
      node.connect(f); node = f;
    }
    node.connect(g); g.connect(sfxBus);
    src.start(now); src.stop(now + dur + 0.02);
  }

  /* SFX 名前付き */
  const ELEMENT_SFX = {
    fire:    () => { sweep(180, 60, 0.25, 'sawtooth', 0.28); noise(0.18, 0.18, 2200); },
    water:   () => { tone(700, 0.18, 'triangle', 0.3); tone(1000, 0.12, 'sine', 0.22); },
    grass:   () => { tone(440, 0.18, 'triangle', 0.25); tone(660, 0.18, 'sine', 0.18); },
    wind:    () => { sweep(900, 1400, 0.22, 'sine', 0.22); noise(0.18, 0.12, 4000); },
    earth:   () => { sweep(120, 70, 0.25, 'square', 0.3); noise(0.15, 0.22, 800); },
    thunder: () => { noise(0.06, 0.4, 8000); sweep(110, 50, 0.22, 'sawtooth', 0.32); },
    light:   () => { tone(880, 0.3, 'sine', 0.28); tone(1320, 0.28, 'sine', 0.22);
                     tone(1760, 0.25, 'sine', 0.18); },
    dark:    () => { sweep(90, 50, 0.3, 'sawtooth', 0.3); tone(70, 0.25, 'square', 0.22); },
    none:    () => { noise(0.1, 0.32, 3500); },
  };

  function sfx(name, opts = {}) {
    if (!ctx) init();
    if (!ctx || muted) return;
    unlock();
    switch (name) {
      case 'click':     tone(900, 0.05, 'square', 0.2); break;
      case 'select':    tone(660, 0.07, 'triangle', 0.22); break;
      case 'cancel':    tone(330, 0.08, 'square', 0.22); break;
      case 'hit':       noise(0.13, 0.32, 3500); tone(160, 0.1, 'square', 0.18); break;
      case 'crit':      sweep(800, 200, 0.22, 'square', 0.35); noise(0.1, 0.3, 6000); break;
      case 'heal':      tone(523, 0.3, 'sine', 0.3, 0.02);
                        tone(659, 0.3, 'sine', 0.22, 0.05);
                        tone(784, 0.3, 'sine', 0.18, 0.08); break;
      case 'buff':      sweep(440, 880, 0.3, 'triangle', 0.28); break;
      case 'levelup':   tone(523, 0.12, 'triangle', 0.3);
                        setTimeout(() => tone(659, 0.12, 'triangle', 0.3), 100);
                        setTimeout(() => tone(784, 0.15, 'triangle', 0.3), 200);
                        setTimeout(() => tone(1047, 0.25, 'sine', 0.3), 320); break;
      case 'fuse':      sweep(220, 880, 0.6, 'triangle', 0.32);
                        setTimeout(() => sweep(880, 1760, 0.4, 'sine', 0.3), 600); break;
      case 'gold':      tone(1200, 0.08, 'triangle', 0.3);
                        setTimeout(() => tone(1800, 0.08, 'triangle', 0.25), 80); break;
      case 'scout':     tone(880, 0.12, 'triangle', 0.25);
                        setTimeout(() => tone(1320, 0.18, 'triangle', 0.25), 120); break;
      case 'menu':      tone(550, 0.06, 'triangle', 0.2); break;
      case 'win':       [523, 659, 784, 1047].forEach((f, i) =>
                          setTimeout(() => tone(f, 0.22, 'triangle', 0.3), i * 100)); break;
      case 'lose':      sweep(440, 110, 0.6, 'sawtooth', 0.3); break;
      case 'spell': {
        const el = opts.el || 'none';
        const fn = ELEMENT_SFX[el] || ELEMENT_SFX.none;
        fn();
        break;
      }
      default: break;
    }
  }

  /* 簡易 BGM: 16ステップのアルペジオを繰り返す */
  const BGM_PATTERNS = {
    town: {
      tempo: 110, type: 'triangle',
      seq: ['C4', 'E4', 'G4', 'C5', 'E4', 'G4', 'B4', 'C5',
            'D5', 'B4', 'G4', 'E4', 'F4', 'A4', 'C5', 'A4'],
    },
    field: {
      tempo: 96, type: 'triangle',
      seq: ['A3', 'C4', 'E4', 'A4', 'E4', 'C4', 'D4', 'F4',
            'A4', 'D4', 'C4', 'A3', 'G3', 'B3', 'D4', 'G4'],
    },
    battle: {
      tempo: 145, type: 'square',
      seq: ['A3', 'A3', 'C4', 'A3', 'E4', 'A3', 'C4', 'A3',
            'G3', 'G3', 'B3', 'G3', 'D4', 'G3', 'B3', 'G3'],
    },
    boss: {
      tempo: 130, type: 'sawtooth',
      seq: ['D3', 'F3', 'A3', 'D4', 'F4', 'D4', 'A3', 'F3',
            'C3', 'E3', 'G3', 'C4', 'E4', 'C4', 'G3', 'E3'],
    },
    victory: {
      tempo: 130, type: 'triangle',
      seq: ['C5', 'E5', 'G5', 'C6', 'B5', 'G5', 'E5', 'C5'],
    },
  };
  const N2F = { 'A3': 220.00, 'B3': 246.94, 'C4': 261.63, 'D4': 293.66, 'E4': 329.63,
    'F4': 349.23, 'G4': 392.00, 'A4': 440.00, 'B4': 493.88, 'C5': 523.25,
    'D5': 587.33, 'E5': 659.25, 'F5': 698.46, 'G5': 783.99, 'A5': 880.00,
    'B5': 987.77, 'C6': 1046.50, 'D3': 146.83, 'F3': 174.61, 'C3': 130.81, 'E3': 164.81, 'G3': 196.00 };

  function bgm(name) {
    if (!ctx) init();
    if (!ctx) return;
    unlock();
    stopBgm();
    if (!name || muted) return;
    const p = BGM_PATTERNS[name];
    if (!p) return;
    let idx = 0;
    const step = 60000 / p.tempo / 2;   // 16分音符
    bgmPlaying = true;
    bgmTimer = setInterval(() => {
      if (!bgmPlaying || !ctx || muted) return;
      const noteName = p.seq[idx % p.seq.length];
      const f = N2F[noteName];
      if (f) {
        const now = ctx.currentTime;
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = p.type;
        o.frequency.value = f;
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(0.08, now + 0.015);
        g.gain.exponentialRampToValueAtTime(0.001, now + step / 1000 * 0.9);
        o.connect(g); g.connect(bgmBus);
        o.start(now); o.stop(now + step / 1000 + 0.05);
      }
      // ベース音（低音）— 4ステップに1回
      if (idx % 4 === 0 && f) {
        const now = ctx.currentTime;
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'triangle';
        o.frequency.value = f / 4;
        g.gain.setValueAtTime(0.06, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + step / 1000 * 3);
        o.connect(g); g.connect(bgmBus);
        o.start(now); o.stop(now + step / 1000 * 3 + 0.05);
      }
      idx++;
    }, step);
  }

  function stopBgm() {
    if (bgmTimer) { clearInterval(bgmTimer); bgmTimer = null; }
    bgmPlaying = false;
  }

  return { init, unlock, sfx, bgm, stopBgm, setMuted, isMuted, setVolumes, getVolumes };
})();
