/* =========================================================================
 *  story.js  —  ストーリー進行（章・マスターのセリフ・ラスボス）
 *  進行は「ゲートでの勝利数」を節目に進む。最後はまおうとのけっせん。
 * =======================================================================*/
const Story = (() => {

  // 各章：goal=やること、need=必要勝利数（次の章へ進む条件）
  const CHAPTERS = [
    { goal: 'ゲートへ行き、モンスターと 5回 たたかって 勝とう', need: 5,
      done: ['ほう、なかなか やるな。', 'キミには 才能が ある。'] },
    { goal: 'あれ果てた森を こえて 12勝を めざせ', need: 12,
      done: ['森の おくの 気配が おさまった。', 'つぎは 火の山だ。'] },
    { goal: 'ほのおの山の ぬしに いどみ 24勝', need: 24,
      done: ['炎を のりこえたか！', 'りゅうたちが キミを 待っている。'] },
    { goal: 'りゅうのすみかで 力をつけ 40勝', need: 40,
      done: ['竜を したがえる者よ…', 'ついに あやつが 動きだした。'] },
    { goal: 'まおうが よみがえった。60勝して まおうの城へ', need: 60,
      done: ['よくぞ ここまで！', 'いざ、けっせんの ときだ。'] },
    { goal: 'マスターに はなしかけ「けっせん」で まおうを たおせ！', need: 9999,
      done: [] },
  ];

  // はじめてのセリフ（新規ゲーム）
  const INTRO = [
    'ようこそ、モンスターマスターの 卵よ。',
    'この世界には ふしぎな モンスターたちが すんでいる。',
    'ゲートを くぐれば 別世界。仲間を 集め、ゆうごうで 育て、',
    'とうぎじょうでは 世界中の マスターと きそえる。',
    'まずは ゲートへ。キミの 冒険を はじめよう！',
  ];

  // ラスボス（けっせん）の編成
  const BOSS = {
    name: 'まおう ザルディア',
    team: [
      { species: 'dev3', level: 34 },
      { species: 'und3', level: 30 },
      { species: 'dev2', level: 30 },
    ],
  };

  const ENDING = [
    'まおう ザルディアは ひかりの 中へ きえていった……',
    '世界に へいわが もどった。',
    'キミは 立派な モンスターマスターに なったのだ。',
    'だが 冒険は つづく——とうぎじょうの 頂点、',
    'そして 見ぬ モンスターとの ゆうごうを めざして！',
    '【 おめでとう！ クリア！ 】',
  ];

  const chapter = () => Math.min(State.data.story.chapter, CHAPTERS.length - 1);
  const current = () => CHAPTERS[chapter()];
  const goal = () => current().goal;

  // 次の章へ進める？（勝利数が条件に到達）
  function canAdvance() {
    const c = current();
    return chapter() < CHAPTERS.length - 1 && State.data.wins >= c.need;
  }
  // 章を進めて、完了セリフを返す
  function advance() {
    const c = current();
    const lines = c.done.slice();
    State.setStory({ chapter: chapter() + 1 });
    return lines;
  }

  const isFinalChapter = () => chapter() >= CHAPTERS.length - 1;
  const bossReady = () => isFinalChapter() && !State.data.bossBeaten;

  return { CHAPTERS, INTRO, BOSS, ENDING, chapter, current, goal, canAdvance, advance, isFinalChapter, bossReady };
})();
