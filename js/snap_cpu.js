/* =========================================================================
 *  snap_cpu.js  —  CPU 対戦相手の AI
 *
 *  単純評価ベース:
 *   1. 各レーンの「想定POW差」を計算
 *   2. 不利なレーンは諦め、勝てそうな2レーンに集中投資
 *   3. ロケーション効果を考慮（火山に火カードを優先）
 *   4. 終盤は高コストカードを温存しすぎず使い切る
 * =======================================================================*/
const SnapCPU = (() => {

  function planTurn(G) {
    const side = 'enemy';
    const opp = 'ally';
    let energyLeft = G.energy[side];
    // pending として積むカードのリスト
    const plays = [];

    // 評価: 各レーンの現在POW差
    function laneScore(laneIdx) {
      const slot = G.board[laneIdx];
      const allyPow = slot.ally.reduce((s, c) => s + SnapEngine.effectivePow(c, laneIdx, 'ally'), 0);
      const enemyPow = slot.enemy.reduce((s, c) => s + SnapEngine.effectivePow(c, laneIdx, 'enemy'), 0);
      return enemyPow - allyPow;   // enemy が +、ally が −
    }

    // 候補カード: 手札のうちエネルギー範囲内で出せるもの
    function affordable() {
      return G.hand[side].filter(c => c.cost <= energyLeft);
    }

    // 配置先評価: ロケーション補正・スロット可・能力相性
    function placementScore(card, laneIdx) {
      const slot = G.board[laneIdx];
      // 場所制約
      if (slot.location.canPlace && !slot.location.canPlace(card, laneIdx)) return -999;
      const maxSlots = slot.location.maxSlots || SnapEngine.SLOTS_PER_LANE;
      const alreadyPlaced = plays.filter(p => p.lane === laneIdx).length;
      if (slot[side].length + alreadyPlaced >= maxSlots) return -999;

      let s = card.pow;
      if (slot.location.modifyPow) s += slot.location.modifyPow(card, laneIdx, side, { board: G.board });
      // 不利なレーンには出さない
      const deficit = -laneScore(laneIdx);   // ally 優勢なら +
      if (deficit > 10) s -= 5;
      // 能力に合わせて補正
      if (card.ability === 'slime_buff' && slot[side].length > 0) s += 1;
      if (card.ability === 'angel_bless' || card.ability === 'titan_boost') s += 3;
      if (card.ability === 'devil_strike') s += 2;
      // ターン1〜2 はランダム性で散らす
      if (G.turn <= 2) s += Math.random() * 1.5;
      return s;
    }

    // 貪欲法: コストの高いカード優先
    let attempts = 0;
    while (energyLeft > 0 && attempts < 10) {
      attempts++;
      const cards = affordable();
      if (!cards.length) break;
      let best = null, bestScore = -Infinity, bestLane = 0;
      cards.forEach(card => {
        [0, 1, 2].forEach(li => {
          // 公開済みレーンだけに置けるならそれ優先
          if (!G.board[li].locationRevealed) return;
          const s = placementScore(card, li);
          if (s > bestScore) { bestScore = s; best = card; bestLane = li; }
        });
      });
      if (!best || bestScore < 0) break;
      plays.push({ cardUid: best.uid, lane: bestLane });
      energyLeft -= best.cost;
      // 仮想的にエネルギーを消費
      // （プランナーが手札を覚えやすいよう、エンジン的にはまだ play しない）
      // affordable() は再計算される（同じカードが2回選ばれないよう uid を覚えておく）
      const idx = G.hand[side].findIndex(c => c.uid === best.uid);
      if (idx >= 0) G.hand[side].splice(idx, 1);
    }
    // 仮想的に取り除いたカードを戻す（実プレイは ui 側で execute() で行う）
    plays.forEach(p => {
      const card = SnapEngine.state().hand[side].find(c => c.uid === p.cardUid)
        || (G._stash || []).find(c => c.uid === p.cardUid);
    });
    return plays;
  }

  // CPU の計画を実行（実 play() 呼び出し）
  function execute(plays) {
    plays.forEach(p => {
      SnapEngine.play('enemy', p.cardUid, p.lane);
    });
  }

  // 計画 → 実行を一括
  function takeTurn(G) {
    // CPU の手札を取り戻して計画
    const original = G.hand.enemy.slice();
    const plays = planTurn(G);
    // planTurn は手札を仮想消費してしまうので、元に戻す
    G.hand.enemy = original;
    execute(plays);
  }

  return { takeTurn };
})();
