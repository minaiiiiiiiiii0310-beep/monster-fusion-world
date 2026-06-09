/* =========================================================================
 *  tactics_cpu.js  —  CPU 対戦相手 AI（ヒューリスティック ベース）
 *
 *  方針: 「貪欲法 + 状況評価」。深い 探索は しないが、各ターンに 以下の
 *  順番で 最良手を 選ぶ:
 *    1. start タイミング 魔法（バフ/回復/ドロー が 有用なら 唱える）
 *    2. 召喚（コスト 効率順 + 良い 配置）
 *    3. 各 ピースの 行動（攻撃 / 移動）
 *    4. リアクション 魔法 をセット（次ターン以降の 備え）
 *
 *  プレイヤー側 にも 流用可能（side パラメータ）。
 * =======================================================================*/
const TacticsCPU = (() => {

  /* ============ メイン ============ */
  function takeTurn(side = 'enemy', opts = {}) {
    const G = TacticsEngine.state();
    if (!G || G.over) return;
    if (G.whose !== side) return;
    const actions = [];

    // 1. start 魔法（有用なものだけ）
    actions.push(...castUsefulStartMagic(side));
    // 2. 召喚（複数枚 / コスト降順）
    actions.push(...summonPlan(side));
    // 3. 各 ピースの 行動
    actions.push(...combatPlan(side));
    // 4. リアクション セット（伏せ）
    actions.push(...setReactionsPlan(side));

    if (opts.dryRun) return actions;
    actions.forEach(a => a.exec());
    // 終了
    if (!opts.skipEndTurn) TacticsEngine.endTurn();
    return actions;
  }

  /* ============ 1. 開始時 魔法 ============ */
  function castUsefulStartMagic(side) {
    const G = TacticsEngine.state();
    const list = [];
    const myPieces = TacticsEngine.piecesOf(side);
    const enemyPieces = TacticsEngine.piecesOf(side === 'ally' ? 'enemy' : 'ally');
    const myHand = G.magicHand[side];
    for (const m of myHand) {
      if (m.timing !== 'start') continue;
      if (G.energy[side] < m.cost) continue;
      switch (m.id) {
        case 'healing_wind': {
          // HP が 半分以下の 味方が いれば 唱える
          const target = myPieces
            .filter(p => p.curHp <= Math.floor(p.maxHp / 2))
            .sort((a, b) => (a.curHp / a.maxHp) - (b.curHp / b.maxHp))[0];
          if (target) {
            list.push({
              kind: 'magic',
              exec: () => TacticsMagic.cast(side, m.uid, { targetUid: target.uid }),
              desc: `cast healing_wind on ${target.name}`,
            });
            return list;   // 1ターンに 同種を 連発しないため、1つ 唱えたら 戻る
          }
          break;
        }
        case 'rally': {
          // 味方 2体以上で 唱える 価値あり
          if (myPieces.length >= 2) {
            list.push({
              kind: 'magic',
              exec: () => TacticsMagic.cast(side, m.uid, {}),
              desc: 'cast rally',
            });
            return list;
          }
          break;
        }
        case 'summoning_gate': {
          // 手札 が 少ない時に
          if (G.monsterHand[side].length <= 2) {
            list.push({
              kind: 'magic',
              exec: () => TacticsMagic.cast(side, m.uid, {}),
              desc: 'cast summoning_gate',
            });
            return list;
          }
          break;
        }
        case 'lane_burst': {
          // 列に 味方 2体以上 並べば 唱える
          for (let axis of ['row', 'col']) {
            for (let i = 0; i < 6; i++) {
              const inLane = myPieces.filter(p => axis === 'row' ? p.y === i : p.x === i);
              if (inLane.length >= 2) {
                list.push({
                  kind: 'magic',
                  exec: () => TacticsMagic.cast(side, m.uid, { axis, index: i }),
                  desc: `cast lane_burst ${axis} ${i}`,
                });
                return list;
              }
            }
          }
          break;
        }
        case 'teleport': {
          // 味方が 攻撃範囲外の 敵に 近づきたい時
          // 簡易: 最も 遠い 敵の 隣接マスへ ワープ
          if (myPieces.length === 0 || enemyPieces.length === 0) break;
          const myP = myPieces[0];
          const target = enemyPieces[0];
          // target の 隣 (空マス) を 探す
          let landed = null;
          for (let dy = -1; dy <= 1 && !landed; dy++) {
            for (let dx = -1; dx <= 1 && !landed; dx++) {
              if (dx === 0 && dy === 0) continue;
              const nx = target.x + dx, ny = target.y + dy;
              if (TacticsEngine.inBoard(nx, ny) && !TacticsEngine.cell(nx, ny)) {
                landed = { x: nx, y: ny };
              }
            }
          }
          if (landed) {
            list.push({
              kind: 'magic',
              exec: () => TacticsMagic.cast(side, m.uid, { targetUid: myP.uid, x: landed.x, y: landed.y }),
              desc: 'cast teleport',
            });
            return list;
          }
          break;
        }
      }
    }
    return list;
  }

  /* ============ 2. 召喚 計画 ============ */
  function summonPlan(side) {
    const G = TacticsEngine.state();
    const list = [];
    // 場の 上限まで コスト降順で 出す
    const hand = G.monsterHand[side].slice().sort((a, b) => b.cost - a.cost);
    const startRows = TacticsEngine.STARTING_ROWS[side];
    let energyLeft = G.energy[side]
      - (G.magicHand[side].filter(m => false).length);   // 既に 唱えた分は エンジンが 引いてる
    // 重要: 上の 関数で 引いた魔法ぶん は G.energy[side] に 反映済み
    // ↑のため energyLeft は G.energy[side] を 都度 参照
    let myCount = TacticsEngine.piecesOf(side).length;
    for (const card of hand) {
      if (myCount >= TacticsEngine.MAX_ON_BOARD) break;
      if (G.energy[side] < card.cost) continue;
      // 良い位置を 探す: 自陣 行で 空マスのうち、敵に 近い側を 優先
      let bestX = -1, bestY = -1, bestScore = -Infinity;
      for (const y of startRows) {
        for (let x = 0; x < TacticsEngine.BOARD_W; x++) {
          if (TacticsEngine.cell(x, y)) continue;
          // 敵側に 近い 行 (ally なら y=4, enemy なら y=1) を 優先
          const score = side === 'ally' ? (y === 4 ? 2 : 0) : (y === 1 ? 2 : 0);
          if (score > bestScore) {
            bestScore = score;
            bestX = x; bestY = y;
          }
        }
      }
      if (bestX < 0) break;
      // クロージャの ため キャプチャ
      const captured = { uid: card.uid, x: bestX, y: bestY, name: card.name };
      list.push({
        kind: 'summon',
        exec: () => {
          // 召喚時 また 同じマスが 空とは 限らないので 再評価
          if (TacticsEngine.cell(captured.x, captured.y)) {
            // 別マスを 探す
            for (const yy of startRows) {
              for (let xx = 0; xx < TacticsEngine.BOARD_W; xx++) {
                if (!TacticsEngine.cell(xx, yy)) {
                  return TacticsEngine.summon(side, captured.uid, xx, yy);
                }
              }
            }
            return { ok: false };
          }
          return TacticsEngine.summon(side, captured.uid, captured.x, captured.y);
        },
        desc: `summon ${captured.name} → (${bestX},${bestY})`,
      });
      // 仮想的に エネルギーを 引いて、また 仮想 myCount を 増やす
      // 注意: 実行は exec() で 行うので、ここでは 計画だけ。
      // 連続 召喚で エネルギー / 上限が 尽きる ケースを 考慮する 必要が ある。
      // ヒューリスティック: 最初の 1枚だけ 採用
      break;
    }
    return list;
  }

  /* ============ 3. 戦闘 計画 ============ */
  function combatPlan(side) {
    const G = TacticsEngine.state();
    const list = [];
    const myPieces = TacticsEngine.piecesOf(side);
    const oppSide = side === 'ally' ? 'enemy' : 'ally';
    myPieces.forEach(p => {
      if (p.attacked && p.moved) return;
      // 1. 攻撃 可能なら 攻撃（最弱の 敵を 狙う）
      if (!p.attacked) {
        const inRange = TacticsEngine.piecesOf(oppSide).filter(e => {
          return TacticsEngine.chebyshev(p, e) <= TacticsEngine.effectiveRng(p);
        });
        if (inRange.length > 0) {
          inRange.sort((a, b) => a.curHp - b.curHp);
          const target = inRange[0];
          const capturedP = p, capturedT = target;
          list.push({
            kind: 'attack',
            exec: () => TacticsEngine.attack(capturedP.uid, capturedT.uid),
            desc: `${p.name} → ${target.name}`,
          });
          return;
        }
      }
      // 2. 攻撃 できなければ 移動（敵に 近づく）
      if (!p.moved) {
        const target = closestEnemy(p, side);
        if (target) {
          const movRange = TacticsEngine.effectiveMov(p);
          // 敵に 1マス 近づく 最良マスを 探す
          let bestX = p.x, bestY = p.y, bestDist = TacticsEngine.chebyshev(p, target);
          for (let dy = -movRange; dy <= movRange; dy++) {
            for (let dx = -movRange; dx <= movRange; dx++) {
              if (dx === 0 && dy === 0) continue;
              const nx = p.x + dx, ny = p.y + dy;
              if (Math.max(Math.abs(dx), Math.abs(dy)) > movRange) continue;
              if (!TacticsEngine.inBoard(nx, ny)) continue;
              if (TacticsEngine.cell(nx, ny)) continue;
              const d = Math.max(Math.abs(nx - target.x), Math.abs(ny - target.y));
              if (d < bestDist) {
                bestDist = d; bestX = nx; bestY = ny;
              }
            }
          }
          if (bestX !== p.x || bestY !== p.y) {
            const capturedP = p, capturedX = bestX, capturedY = bestY;
            list.push({
              kind: 'move',
              exec: () => TacticsEngine.move(capturedP.uid, capturedX, capturedY),
              desc: `${p.name} move → (${bestX},${bestY})`,
            });
          }
        }
      }
    });
    return list;
  }

  function closestEnemy(piece, side) {
    const oppSide = side === 'ally' ? 'enemy' : 'ally';
    const enemies = TacticsEngine.piecesOf(oppSide);
    if (!enemies.length) return null;
    return enemies.slice().sort((a, b) =>
      TacticsEngine.chebyshev(piece, a) - TacticsEngine.chebyshev(piece, b)
    )[0];
  }

  /* ============ 4. リアクション セット ============ */
  function setReactionsPlan(side) {
    const G = TacticsEngine.state();
    const list = [];
    // 残り エネルギーで 伏せ 魔法を 仕掛ける（味方が 場に いる時）
    const myPieces = TacticsEngine.piecesOf(side);
    if (myPieces.length === 0) return list;
    const reactions = G.magicHand[side].filter(m => m.timing === 'reaction');
    // 既に 同種が セット済みなら スキップ
    const already = (G.pendingReactions[side] || []).map(r => r.type);
    for (const m of reactions) {
      if (G.energy[side] < m.cost) continue;
      if (already.includes(m.id)) continue;
      list.push({
        kind: 'reaction',
        exec: () => TacticsMagic.cast(side, m.uid, {}),
        desc: `set ${m.id}`,
      });
      // 1ターンに 1個だけ 伏せる
      break;
    }
    return list;
  }

  return { takeTurn };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = TacticsCPU;
}
