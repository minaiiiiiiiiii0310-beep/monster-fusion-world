/* =========================================================================
 *  tactics_magic.js  —  魔法カード 効果 実装（3タイミング）
 *
 *  ・start:     ターン開始時（自軍 強化 / ドロー / テレポート など）
 *  ・preCombat: 戦闘直前 (1回 限り 攻撃修飾)
 *  ・reaction:  伏せ 魔法 (相手の 行動を トリガーに 自動発動)
 *
 *  API:
 *    canCast(side, magicUid, params)   発動条件チェック
 *    cast(side, magicUid, params)      発動 + 効果適用
 *
 *  params の 例:
 *    teleport:       { targetUid, x, y }
 *    healing_wind:   { targetUid }
 *    lane_burst:     { axis: 'row' | 'col', index: 0..5 }
 *
 *  リアクション は cast 時に G.pendingReactions に セット されるだけ。
 *  実際の トリガーは tactics_engine.js の attack/destroyPiece/endTurn 内。
 * =======================================================================*/

const TacticsMagic = (() => {

  function canCast(side, magicUid, params = {}) {
    const G = TacticsEngine.state();
    if (!G || G.over) return { ok: false, msg: 'ゲーム終了済み' };
    const card = G.magicHand[side].find(m => m.uid === magicUid);
    if (!card) return { ok: false, msg: '手札にない' };
    if (G.energy[side] < card.cost) return { ok: false, msg: 'エネルギー不足' };
    // ターン制限: 自分のターン中で start タイミング、preCombat タイミング、
    // 自分の伏せセット (reaction) のみ 可能
    if (G.whose !== side) return { ok: false, msg: 'あなたのターンではない' };
    // 個別 検証
    switch (card.id) {
      case 'teleport': {
        const piece = TacticsEngine.findPiece(params.targetUid);
        if (!piece || piece.owner !== side) return { ok: false, msg: '対象が 味方ではない' };
        if (!TacticsEngine.inBoard(params.x, params.y) || TacticsEngine.cell(params.x, params.y)) {
          return { ok: false, msg: '無効な 移動先' };
        }
        break;
      }
      case 'healing_wind': {
        const p = TacticsEngine.findPiece(params.targetUid);
        if (!p || p.owner !== side) return { ok: false, msg: '対象が 味方ではない' };
        break;
      }
      case 'lane_burst': {
        if (params.axis !== 'row' && params.axis !== 'col') {
          return { ok: false, msg: 'axis は row/col' };
        }
        if (typeof params.index !== 'number') return { ok: false, msg: 'index 必要' };
        if (params.index < 0 || params.index >= 6) return { ok: false, msg: 'index 範囲外' };
        break;
      }
    }
    return { ok: true, card };
  }

  function cast(side, magicUid, params = {}) {
    const check = canCast(side, magicUid, params);
    if (!check.ok) return check;
    const G = TacticsEngine.state();
    const card = TacticsEngine.consumeMagicFromHand(side, magicUid);
    if (!card) return { ok: false, msg: '消費失敗' };

    switch (card.id) {
      // ===== start タイミング =====
      case 'rally': {
        TacticsEngine.addBuff({
          side, atkBonus: 1,
          matches: (p) => p.owner === side,
          turn: G.turn,
        });
        G.log.push(`✨ ${card.name}: 味方 +1 atk this turn`);
        return { ok: true };
      }
      case 'lane_burst': {
        const axis = params.axis, idx = params.index;
        TacticsEngine.addBuff({
          side, atkBonus: 3,
          matches: (p) => p.owner === side && (axis === 'row' ? p.y === idx : p.x === idx),
          turn: G.turn,
        });
        G.log.push(`✨ ${card.name}: ${axis === 'row' ? '横' : '縦'}${idx + 1}列の 味方 +3 atk`);
        return { ok: true };
      }
      case 'healing_wind': {
        const p = TacticsEngine.findPiece(params.targetUid);
        if (p) {
          p.curHp = p.maxHp;
          G.log.push(`💚 ${card.name}: ${p.name} 全回復`);
        }
        return { ok: true };
      }
      case 'summoning_gate': {
        TacticsEngine.drawMonster(side, 2);
        G.log.push(`🎴 ${card.name}: モンスター 2枚 ドロー`);
        return { ok: true };
      }
      case 'teleport': {
        TacticsEngine.teleportPiece(params.targetUid, params.x, params.y);
        G.log.push(`🌀 ${card.name}: ワープ → (${params.x},${params.y})`);
        return { ok: true };
      }

      // ===== preCombat タイミング =====
      // 次に 攻撃する時 1回だけ 適用される モディファイヤ。
      case 'elemental_edge': {
        TacticsEngine.setPreCombat(side, { atkBonus: 2 });
        G.log.push(`🔥 ${card.name}: 次の攻撃 +2 atk`);
        return { ok: true };
      }
      case 'iron_wall': {
        TacticsEngine.setPreCombat(side, { reduceDmg: 3 });
        G.log.push(`🛡 ${card.name}: 次に 受ける攻撃 -3 ダメージ`);
        return { ok: true };
      }
      case 'critical_strike': {
        TacticsEngine.setPreCombat(side, { damageMult: 1.5 });
        G.log.push(`⚔ ${card.name}: 次の攻撃 ダメージ ×1.5`);
        return { ok: true };
      }

      // ===== reaction タイミング（伏せ） =====
      case 'counter_trap': {
        TacticsEngine.addReaction(side, {
          type: 'counter_trap',
          trigger: 'opp_attack',
          setTurn: G.turn,
        });
        G.log.push(`🪤 ${card.name}: トラップ セット`);
        return { ok: true };
      }
      case 'mirror_force': {
        TacticsEngine.addReaction(side, {
          type: 'mirror_force',
          trigger: 'opp_attack',
          setTurn: G.turn,
        });
        G.log.push(`🪞 ${card.name}: トラップ セット`);
        return { ok: true };
      }
      case 'reverse_resource': {
        TacticsEngine.addReaction(side, {
          type: 'reverse_resource',
          trigger: 'ally_death',
          setTurn: G.turn,
        });
        G.log.push(`🔄 ${card.name}: トラップ セット（味方撃破で 発動）`);
        return { ok: true };
      }
      case 'gravity_force': {
        // 次の 相手ターンの 移動制限（1ターン）
        const o = side === 'ally' ? 'enemy' : 'ally';
        TacticsEngine.setMoveBlocked(o, 2);   // 2 で デクリされて 1 になり 次ターン 効く
        G.log.push(`⛓ ${card.name}: 次の相手ターン 移動 制限`);
        return { ok: true };
      }
    }
    return { ok: false, msg: '未実装: ' + card.id };
  }

  return { canCast, cast };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = TacticsMagic;
}
