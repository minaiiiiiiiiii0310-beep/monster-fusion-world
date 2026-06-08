/* =========================================================================
 *  story.js  —  ストーリー進行（章・マスターのセリフ・ラスボス・追加章）
 *  進行は「ゲートでの勝利数」を節目に進む。
 *  - 章 1〜6: 既存ライン → まおう ザルディアとの けっせん
 *  - 章 7〜10: 追加されたエンドゲーム（属性神・巨神・オリジン）
 * =======================================================================*/
const Story = (() => {

  // 各章：goal=やること、need=必要勝利数（次の章へ進む条件）
  const CHAPTERS = [
    { goal: 'ゲートへ行き、モンスターと 5回 たたかって 勝とう', need: 5,
      done: ['ほう、なかなか やるな。', 'キミには 才能が ある。',
        '次は あれ果てた森。気をつけて 進め。'] },
    { goal: 'あれ果てた森を こえて 12勝を めざせ', need: 12,
      done: ['森の おくの 気配が おさまった。', 'つぎは 火の山だ。',
        '炎の中の すみかが キミを 試す。'] },
    { goal: 'ほのおの山の ぬしに いどみ 24勝', need: 24,
      done: ['炎を のりこえたか！', 'りゅうたちが キミを 待っている。',
        '空に そびえる 霊峰は おそろしい場所だ。'] },
    { goal: 'りゅうのすみかで 力をつけ 40勝', need: 40,
      done: ['竜を したがえる者よ…', 'ついに あやつが 動きだした。',
        'まおう ザルディアが よみがえる。'] },
    { goal: 'まおうが よみがえった。60勝して まおうの城へ', need: 60,
      done: ['よくぞ ここまで！', 'いざ、けっせんの ときだ。',
        'マスターに はなしかけて 「けっせん」を 選べ。'] },
    { goal: 'マスターに はなしかけ「けっせん」で まおうを たおせ！', need: 80,
      done: ['まおうは 倒れた。だが…', 'これは おわりでは ない。',
        '世界の 奥底で 古の 属性神たちが 目を 覚ましつつある。'] },
    // ---- ここから追加章（ポストエンドゲーム）----
    { goal: 'いにしえの神殿に 通う扉が ひらいた。100勝で 神々と まみえよう', need: 100,
      done: ['属性神たちが キミを 認めた。', 'だが まだ 上が ある。',
        '巨神（タイタン）が 目覚めはじめている。'] },
    { goal: '8柱の 属性神を 経て、130勝で 巨神の 領域へ', need: 130,
      done: ['巨神は 大地を ふるわせる。', 'ひとりひとりが 神を こえる力。',
        'すべてを たおしたとき、世界の 真理に 触れるだろう。'] },
    { goal: '巨神を 1柱でも 倒し、150勝を 達成せよ', need: 150,
      done: ['世界の 中心に 一筋の 光が さした。', '次元の はざまから 声がする…',
        '「キミは オリジンに 出会う 用意が できたか？」'] },
    { goal: '神殿の 最深部、オリジンとの 接触まで 180勝', need: 180,
      done: ['オリジンは うなずいた。', 'これより 上は キミ次第。',
        '伝説の マスターとして 物語は つづく。'] },
    { goal: '伝説の マスター — 君は すでに 物語の 主人公だ', need: 99999,
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
    'そして 神殿の 奥に 新たな 扉が あらわれた…',
    '【 第1章 クリア！ 真の 冒険が ここから 始まる 】',
  ];

  // サイドクエスト：随時クリアの「実績」風タスク
  const SIDE_QUESTS = [
    { id: 'tame10', label: 'モンスターを 10種類 みつける', target: 10,
      hint: '図鑑(ずかん)が 育つ', reward: 100,
      check: () => State.seenCount() >= 10 },
    { id: 'fuse5', label: 'ゆうごうを 5回 おこなう', target: 5,
      hint: 'ゆうごうじょで 重ねるごとに 強くなる', reward: 150,
      check: () => (State.data.fuseCount || 0) >= 5 },
    { id: 'rankSilver', label: 'とうぎじょうで シルバー以上に', target: 1,
      hint: '勝つほど ランクが あがる', reward: 200,
      check: () => (State.data.rank || 0) >= 60 },
    { id: 'allAreas', label: '5つの エリアを 解放する', target: 5,
      hint: 'ゲートの 奥は 勝利数で ひらく', reward: 300,
      check: () => DB.AREAS.filter(a => State.areaUnlocked(a)).length >= 5 },
    { id: 'goldHoard', label: 'ゴールドを 2000 ためる', target: 2000,
      hint: 'たねや どうぐを 売り買い', reward: 0,
      check: () => State.data.gold >= 2000 },
  ];

  // 章ごとの NPC 共通セリフ（住人がストーリー進行を知っている雰囲気）
  const NPC_FLAVOR_BY_CHAPTER = [
    ['よろしく 新人マスター！', 'ゲートで まずは 5勝してみよう'],
    ['森の おくは あぶないらしいよ…', '森のヌシは 強敵だぞ'],
    ['炎の山が ざわめいている', '火の精が おどっているそうだ'],
    ['空に 竜の影が 見えた!', '竜つかいに なれたら すごいな'],
    ['まおうが よみがえったって…', '城に 入る勇気が あるかい？'],
    ['伝説の マスターよ、ありがとう', '世界に 平和が もどった！'],
    ['神殿の 扉が ひらいた…', '神々が 試そうとしてる'],
    ['巨神は 山より 大きいって！', '本当に 戦えるのかな…'],
    ['オリジン…？ 噂は きいたことが', '究極の 存在らしい'],
    ['きみは もう 伝説だよ', '物語は キミの 中に ある'],
    ['永遠の マスターさま！', '世界は キミを 忘れない'],
  ];

  const chapter = () => Math.min(State.data.story.chapter, CHAPTERS.length - 1);
  const current = () => CHAPTERS[chapter()];
  const goal = () => current().goal;

  // 次の章へ進める？（勝利数が条件に到達）
  function canAdvance() {
    const c = current();
    // 章5（まおうの城へ）はボス撃破するまで進めない
    if (chapter() === 5 && !State.data.bossBeaten) return false;
    return chapter() < CHAPTERS.length - 1 && State.data.wins >= c.need;
  }
  // 章を進めて、完了セリフを返す
  function advance() {
    const c = current();
    const lines = c.done.slice();
    State.setStory({ chapter: chapter() + 1 });
    return lines;
  }

  // まおう ザルディアと たたかえる章（=ch 5）か
  const isBossChapter = () => chapter() === 5;
  // 既存コードとの互換：「最終章」相当
  const isFinalChapter = () => chapter() >= CHAPTERS.length - 1;
  const bossReady = () => isBossChapter() && !State.data.bossBeaten;

  // 章に応じた NPC セリフをランダムに1つ返す
  function npcFlavor() {
    const ch = chapter();
    const list = NPC_FLAVOR_BY_CHAPTER[Math.min(ch, NPC_FLAVOR_BY_CHAPTER.length - 1)];
    return list[Math.floor(Math.random() * list.length)];
  }

  // サイドクエスト：未完了かつ条件を満たしたものを返す（達成チェック用）
  function newlyCompletedQuests() {
    const done = State.data.questDone || {};
    return SIDE_QUESTS.filter(q => !done[q.id] && q.check());
  }
  function markQuestDone(id) {
    if (!State.data.questDone) State.data.questDone = {};
    State.data.questDone[id] = true;
  }
  function questStatus() {
    const done = State.data.questDone || {};
    return SIDE_QUESTS.map(q => ({ ...q, done: !!done[q.id] }));
  }

  return {
    CHAPTERS, INTRO, BOSS, ENDING, SIDE_QUESTS,
    chapter, current, goal, canAdvance, advance,
    isFinalChapter, isBossChapter, bossReady,
    npcFlavor, newlyCompletedQuests, markQuestDone, questStatus,
  };
})();
