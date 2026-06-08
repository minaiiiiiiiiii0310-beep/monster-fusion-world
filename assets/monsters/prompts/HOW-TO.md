# 🎨 AI モンスター画像 完全ワークフロー

## 📁 ファイル構成

```
ゲーム/
├── assets/monsters/
│   ├── raw/                  ← AI 生成画像をここに入れる（任意のファイル名）
│   │   └── _done/            ← 処理済みは ここへ自動退避
│   ├── sla1.png              ← 完成形（自動配置）
│   ├── bea1.png
│   ├── ...
│   ├── manifest.json         ← 自動更新
│   └── prompts/              ← AI 用プロンプト集（このフォルダ）
│       ├── ALL-157-midjourney.txt        ← Midjourney /imagine 全 157 個
│       ├── ALL-157-dalle.txt             ← DALL-E / ChatGPT 用
│       ├── ALL-157-stable-diffusion.txt  ← SD（Negative付き）
│       └── bing-quick-links.html         ← Bing クリック1発で開く
└── scripts/
    ├── install-ai-art.bat    ← ダブルクリックで自動処理
    └── install-ai-art.ps1
```

## 🚀 5分で始める（スタータ6種）

### Step 1 — AI で 6 枚生成（最初）

**最も簡単: Bing Image Creator（無料・Microsoft アカウント）**

1. `assets/monsters/prompts/bing-quick-links.html` を **ブラウザで開く**
2. 上部「★ スターター6種」の各 [生成 →] ボタンをクリック
3. Bing が開くので **作成** を押す（4枚出るので気に入った1枚をダウンロード）
4. ダウンロードしたら **ファイル名を `sla1.png` 等に変更**
5. 6枚すべて `assets/monsters/raw/` に入れる

別の選択肢:
- **Midjourney**: `ALL-157-midjourney.txt` の最初の6行を Discord に1つずつ送信
- **ChatGPT (Plus)**: `ALL-157-dalle.txt` の最初の6プロンプトを順に投げる

### Step 2 — 自動インストール

```
1. エクスプローラーで scripts/install-ai-art.bat をダブルクリック
   または
2. PowerShell で:
   cd C:\Users\81806\ゲーム
   .\scripts\install-ai-art.ps1
```

これで：
- raw/ の画像を 512×512 PNG（透過対応）にリサイズ
- assets/monsters/<id>.png に配置
- manifest.json を更新
- 「GitHub に push しますか？」と聞くので `y` でOK
- → 1〜2分で公開URL に反映

### Step 3 — スマホで確認

`https://minaiiiiiiiiii0310-beep.github.io/monster-fusion-world/` をリロード。

- 起動時にトーストで「🎨 AI画像を検出！」と出る
- **せってい → バトル表示 → 🎴 2Dカード** を選んで戦闘
- カードに AI 絵が表示される

## 📈 段階的に増やす

最初の 6 種で雰囲気を確認したら、残り 151 種を少しずつ:

| フェーズ | 推奨タスク | 効果 |
|---|---|---|
| ✓ 1 | スタータ6 (sla1/bea1/bir1/pla1/cat1/mus1) | プレイ開始の印象 ↑↑↑ |
| 2 | 各家系の **rank 5**（系統28枚） | 終盤の主役モンスター |
| 3 | 残りの **rank 1-4** | 育成中の見栄え |
| 4 | **属性神 8 + 巨神 8 + オリジン** | ラスボス級の威厳 |

## 💡 統一感を強化するコツ

### Midjourney: Style Reference (`--sref`) を使う

1. 最初に sla1 を生成
2. 気に入った絵の右クリック → **... → Copy → Job ID** を取得
3. 以降のプロンプトの末尾に `--sref <Job-ID>` を付ける
4. 全部の絵が同じ画風で揃う

### Stable Diffusion: Seed 固定 + ControlNet

1. 同じ Seed（例: 42）を全プロンプトで使用
2. シルエットを揃えたい場合は ControlNet (Canny/Lineart) で参照画像を指定

### DALL-E / ChatGPT: スレッド内で1人キャラ生成

1. 「これから6体の同シリーズ・キャラ画像を生成します。すべて同じ画風・同じカード型サイズで」と最初に宣言
2. プロンプトを1つずつ投げる

## 🛠 トラブルシュート

### 画像が反映されない

- ブラウザのキャッシュ: **強制リロード**（Ctrl+Shift+R / iOS は履歴削除）
- Service Worker の古いキャッシュ: 設定 → ブラウザの「サイトデータ削除」
- 確認: `https://minaiiiiiiiiii0310-beep.github.io/monster-fusion-world/assets/monsters/sla1.png` を直接開いて画像が見えるか
- 確認: ブラウザコンソールで `Art.has('sla1')` が `true` になるか

### `install-ai-art.bat` が動かない

- PowerShell 実行ポリシー: BAT が `-ExecutionPolicy Bypass` で起動するので通常OK
- もし `PowerShell` が見つからないと出る場合: スタートメニューで "PowerShell" を検索して起動 → スクリプトを手動実行

### サイズ・形が崩れる

- 512×512 正方形に **アスペクト維持で中央配置** されるので、元画像が極端な縦長/横長だと余白が大きくなる
- 推奨: AI 生成時に **1:1 比率** で指定する

### `git push` でエラー

- `gh auth status` で GitHub にログイン中か確認
- `git remote -v` で origin が正しく設定されているか確認
- 認証が切れていたら `gh auth login` を再実行

## 🎯 完成イメージ

全 157 枚揃うと、**販売レベルの本格的なRPG**っぽい見栄えになります。スタータ6だけでも、プリミティブの粗いビジュアルから「**ちゃんとしたキャラデザ**」に印象が一変します。

頑張ってください！
