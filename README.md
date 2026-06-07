# モンスターワールド

3D 3対3のモンスター対戦＋融合（ゆうごう）Webゲーム。静的HTML/JSのみで動作（ビルド不要・`file://` 直開きでもOK）。

🌐 **オンラインで遊ぶ**: https://minaiiiiiiiiii0310-beep.github.io/monster-fusion-world/

## 主な機能

- **3D バトル**（Three.js r160 同梱、オフライン可）— アーキタイプ × 属性 × ランクで装飾が変わるリッチなモンスター描画
- **9つの体型 × 9属性 × 7ランク** = 157種のモンスター
- **融合（ゆうごう）システム** — 同系統→ランクアップ、別系統同ランク→ランク+1、属性神→巨神→オリジン
- **3対3バトル** — コマンド入力 / 半オート（さくせん） / フルオート
- **3Dフリーマップ** — 拠点の町（やどや/ゆうごうじょ/ぼくじょう/どうぐや/とうぎじょう）
- **章立てストーリー** — ラスボス「まおうザルディア」＋エンディング
- **とうぎじょう** — CPUランクマッチ（かんたん/ふつう/むずかしい）
- **オンライン非同期PvP**（Firebase RTDB、`firebase-config.js` 設定で有効化）
- **DQM式 スカウト + 配合継承** — 戦闘でスカウト、融合で両親のスキル3つを継承
- **HP/MP持ち越し** — やどやで全回復、たねで永続強化

## 操作

スマホ：タップ／ドラッグでジョイスティック移動
PC：WASD or 矢印キー、各UIはクリック

## ローカル起動

```bash
# Python があれば
python -m http.server 8765
# その後 http://localhost:8765 を開く
```

または **`phone-preview.bat` をダブルクリック** — 同じWi-Fi上のスマホからも開けます。

## 構成

```
index.html
css/style.css
js/
  data.js        # 種族 / スキル / 属性 / 融合ラダー
  state.js       # 進行・所持・セーブ
  story.js       # 章 / 進行
  battle.js      # バトルロジック
  scene3d.js     # 3D 描画（モンスター装飾もここ）
  world.js       # 3D マップ・徘徊エンカウント
  arena.js       # とうぎじょう（CPU/オンライン共通）
  online.js      # Firebase RTDB 非同期PvP
  ui.js          # 画面構築
  main.js        # 起動
  vendor/three.min.js  # Three.js r160 UMD
```

## ライセンス

個人プロジェクト。コードは MIT 相当で扱ってOKです（連絡不要）。
