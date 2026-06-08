# 🎨 モンスター画像（AI 生成）の入れ方

このフォルダに **`<種族ID>.png`** を置くと、ゲームのバトル/ずかん/ぼくじょう/ゆうごう/タイトル すべてで自動的に絵文字の代わりに表示されます。画像が無い種族は絵文字のまま（フォールバック）。

## 📐 規格

| 項目 | 推奨値 |
|---|---|
| サイズ | **512 × 512 px**（正方形） |
| 形式 | PNG（透過背景） |
| ファイル名 | **`<種族ID>.png`** 例: `sla1.png`, `dra5.png`, `god_fire.png` |
| 配置 | このフォルダ直下 |
| 画風 | 統一感のため、すべて**同じプロンプトベース**で作るのを強く推奨 |

## 🎨 推奨される共通プロンプト（テンプレート）

すべてのモンスターを統一感のある画風にするため、以下のテンプレートに各モンスターの説明を差し込みます。

```
cute cartoon monster, [モンスターの説明], full body portrait, centered,
transparent background, anime style, simple shape, vibrant colors,
soft cel-shading with bold outlines, suitable for a 2D mobile game card,
no text, no watermark --ar 1:1 --style raw
```

Midjourney なら `--ar 1:1`、Stable Diffusion なら `--width 512 --height 512` で正方形指定。

## 📋 全 157 種のプロンプト一覧

### 系統別の "[モンスターの説明]" 部分（28系統 × 5ティア）

#### sla (スライム): water blob
- `sla1` スラ — **a tiny blue slime drop with big eyes**
- `sla2` ベススラ — **a medium blue slime with two eyes and small horns**
- `sla3` スラナイト — **a blue slime warrior wearing knight armor and small sword**
- `sla4` スラキング — **a large blue slime king with golden crown and majestic cape**
- `sla5` スラゴッド — **a divine blue slime god radiating holy light, golden halo**

#### bea (ビースト/オオカミ): none beast
- `bea1` コボル — **a small brown wolf cub with fangs**
- `bea2` ガルー — **a teen brown wolf, fierce expression**
- `bea3` ウルフェン — **an adult gray wolf with battle scars**
- `bea4` フェンリル — **a massive silver wolf with icy mane, legendary**
- `bea5` ベヒモス — **a colossal black wolf-beast with horns, monstrous**

#### bir (バード): wind bird
- `bir1` ピヨル — **a fluffy yellow chick with tiny wings**
- `bir2` ホークル — **a sky-blue hawk with spread wings**
- `bir3` グリフォ — **a griffon with lion body and eagle head**
- `bir4` ロックチョウ — **a giant roc bird with golden feathers**
- `bir5` ガルーダ — **a majestic divine eagle with rainbow wings**

#### pla (プラント): grass plant
- `pla1` マンドラ — **a small mandrake with leafy hair**
- `pla2` ラフレシ — **a giant red flower monster with eyes**
- `pla3` トレント — **a wooden tree-man with branch arms**
- `pla4` エルダー — **an ancient elder treant with glowing eyes**
- `pla5` ワルツリー — **a wicked dark treelord with twisted branches**

#### bug (バグ): earth insect
- `bug1` アリゲ — **a giant red ant warrior**
- `bug2` ビートル — **a rhinoceros beetle with shiny carapace**
- `bug3` デスモス — **a death moth with skull pattern**
- `bug4` ホーネト — **a giant yellow hornet with venom stinger**
- `bug5` デスビー — **a queen demon bee, intimidating**

#### und (アンデッド): dark undead
- `und1` ホネオ — **a small skeleton with rusty sword**
- `und2` スケルト — **a skeleton warrior with shield**
- `und3` リッチ — **a hooded lich with glowing eyes**
- `und4` デスナイ — **a dark death knight in black armor**
- `und5` デュラハン — **a headless rider holding his own head, terrifying**

#### aqu (アクア/魚): water fish
- `aqu1` サカナ — **a cute orange fish with big eyes**
- `aqu2` マーマン — **a merman warrior with trident**
- `aqu3` クラーケ — **a young kraken with purple tentacles**
- `aqu4` リヴァイ — **a massive sea serpent leviathan**
- `aqu5` シードラ — **a divine sea dragon with crown of coral**

#### dra (ドラゴン): fire dragon
- `dra1` ドラポン — **a cute baby red dragon hatchling**
- `dra2` ドラグ — **a teen red dragon with small wings**
- `dra3` ドラグーン — **an adult red dragon, fierce**
- `dra4` ティラノ — **a massive T-rex like dragon**
- `dra5` ファヴニル — **a legendary golden dragon with rainbow scales**

#### dev (デビル): dark demon
- `dev1` コアク — **a small purple imp with bat wings**
- `dev2` デビラ — **a teen devil with horns and pitchfork**
- `dev3` マオウ — **a demon lord with massive horns**
- `dev4` アークデ — **an arch-demon with multiple wings**
- `dev5` ルシフェ — **the supreme devil Lucifer, dark and majestic**

#### mat (マテリアル/ゴーレム): earth golem
- `mat1` ストン — **a small stone gargoyle**
- `mat2` ゴーレ — **a rocky golem with cracks**
- `mat3` アイゴレ — **an iron golem with glowing eyes**
- `mat4` タイタロ — **a titanic stone titan with crystal core**
- `mat5` コロッサ — **a colossus mountain-sized golem**

#### ifr (イフリト): fire blob
- `ifr1` メラゴ — **a small fire spirit flame**
- `ifr2` フレイム — **a fire elemental with flame body**
- `ifr3` インフェ — **an inferno demon wreathed in flames**
- `ifr4` ヴァルカ — **a volcanic vulcan god with lava skin**
- `ifr5` イフリト — **the great Ifrit, king of fire**

#### ice (アイス): water beast
- `ice1` フブキ — **a small white snow fox**
- `ice2` ブリザド — **a frost beast with icy fur**
- `ice3` アイスゴ — **an ice golem with crystal armor**
- `ice4` フロスト — **a frost giant with massive ice club**
- `ice5` ヨトゥン — **the giant Jotunn lord of ice**

#### thu (サンダー): thunder beast
- `thu1` スパーク — **a small electric mouse-like creature**
- `thu2` ボルト — **a lightning fox with crackling fur**
- `thu3` サンダ — **a thunder beast with mane of lightning**
- `thu4` ライジン — **the thunder god Raijin with drums**
- `thu5` トール — **the mighty Thor with hammer and lightning**

#### lig (ライト/天使): light humanoid
- `lig1` ピクシー — **a tiny pixie with butterfly wings**
- `lig2` エンジェ — **an angel with white robe and halo**
- `lig3` セラフ — **a seraph with six glowing wings**
- `lig4` アークエ — **an archangel in golden armor**
- `lig5` メタトロ — **Metatron, supreme angel of light**

#### uni (ユニコーン): light beast
- `uni1` ユニコ — **a young white unicorn**
- `uni2` ペガサ — **a pegasus with feathered wings**
- `uni3` キリン — **a kirin/qilin asian unicorn**
- `uni4` アルビオ — **an albino royal unicorn with golden horn**
- `uni5` ホーリド — **a holy divine unicorn radiating light**

#### mus (マッシュ): grass plant
- `mus1` キノピ — **a cute red mushroom with white spots**
- `mus2` マッシュ — **a mushroom warrior with arms**
- `mus3` モーモン — **a giant mushroom with eyes**
- `mus4` スポア — **a spore mushroom releasing dust**
- `mus5` マイコ — **the mushroom king with cap crown**

#### gho (ゴースト): dark blob
- `gho1` オバケ — **a cute white ghost with tongue out**
- `gho2` ゴースト — **a translucent ghost with sad eyes**
- `gho3` ファント — **a phantom in tattered cloak**
- `gho4` レイス — **a wraith with shadowy form**
- `gho5` リーパー — **a grim reaper with scythe and hood**

#### roc (ロック獣): earth beast
- `roc1` ロッキ — **a small rocky boar**
- `roc2` ストガル — **a stone wolf with rock spikes**
- `roc3` ロックゴ — **a stone rhino with crystal horn**
- `roc4` ベヒロク — **a behemoth made of granite**
- `roc5` グラニト — **a granite titan ancient beast**

#### win (ウィンド): wind bird
- `win1` ウィスプ — **a wind wisp with feathered tail**
- `win2` シルフ — **a sylph fairy of wind**
- `win3` テンペス — **a tempest spirit with cyclone**
- `win4` ハルピュ — **a harpy with bird wings and claws**
- `win5` バハール — **a desert wind storm spirit**

#### ser (サーペント): water dragon
- `ser1` ナーガ — **a small water naga snake**
- `ser2` ヒュドラ — **a 3-headed hydra**
- `ser3` ウミドラ — **a sea dragon with fins**
- `ser4` ティアマ — **Tiamat the chaos dragon goddess**
- `ser5` ヨルム — **Jormungandr, the world serpent**

#### dmn (悪魔獣): dark beast
- `dmn1` バァル — **a small horned demon goat**
- `dmn2` ベリト — **a fiendish boar with red eyes**
- `dmn3` ガープ — **a demon wolf with shadow flames**
- `dmn4` アモン — **a dragon-headed demon prince**
- `dmn5` バフォメ — **Baphomet, goat-headed demon lord**

#### fay (フェアリー): light bird
- `fay1` コビト — **a tiny hat-wearing dwarf**
- `fay2` ヨウセイ — **a delicate fairy with petal wings**
- `fay3` ティンク — **a sparkle fairy radiating magic**
- `fay4` オベロン — **Oberon king of the fairies**
- `fay5` ティタニ — **Titania, fairy queen with crown**

#### tur (タートル): water golem
- `tur1` カメっこ — **a tiny green turtle**
- `tur2` ガメラ — **a giant turtle with spikes**
- `tur3` ガーディ — **an armored turtle guardian**
- `tur4` アスピド — **a turtle island, mountain-sized**
- `tur5` ゲンブ — **Genbu the black tortoise of the north, sacred**

#### cat (キャット): none beast
- `cat1` ニャン — **a cute orange kitten**
- `cat2` キャット — **an alley cat with mischievous look**
- `cat3` ワーキャ — **a were-cat humanoid feline warrior**
- `cat4` ケットシ — **a Cait Sith fairy cat with boots**
- `cat5` バステト — **Egyptian goddess Bastet, cat-headed**

#### stb (ストーンバード): earth bird
- `stb1` イシドリ — **a stone bird statue come to life**
- `stb2` ガーゴイ — **a gargoyle with stone wings**
- `stb3` ロクチョ — **a rock roc bird**
- `stb4` バジリス — **a basilisk reptile bird with petrifying gaze**
- `stb5` コカトリ — **a cockatrice rooster-reptile chimera**

#### anu (アヌビス/光竜): light dragon
- `anu1` ヒカリ竜 — **a small light dragon glowing white**
- `anu2` セイント — **a holy saint dragon with halo**
- `anu3` ホリド竜 — **a divine sacred dragon**
- `anu4` ドラゴ神 — **a dragon god with radiant aura**
- `anu5` バハムー — **Bahamut, supreme dragon king**

#### mtl (メタル): none blob
- `mtl1` メタッコ — **a tiny silver metal slime**
- `mtl2` メタスラ — **a chrome metal slime, shiny**
- `mtl3` はぐレタル — **a small platinum slime, elusive**
- `mtl4` メタキング — **a golden metal slime king**
- `mtl5` メタゴッド — **a divine metal slime god, rainbow chrome**

#### jwl (ジュエル): light golem
- `jwl1` ジュエル — **a small ruby gem creature**
- `jwl2` クリスタ — **a crystal cluster monster**
- `jwl3` ダイヤモ — **a diamond golem, faceted**
- `jwl4` プリズム — **a prismatic rainbow crystal beast**
- `jwl5` ゴドジェム — **a divine gem god, all elements**

### 属性神 (rank 6) - 8体

各属性神は『**[属性] elemental god, divine majesty, radiating power**』:

- `god_fire` イグニス — **fire elemental god with crown of flames**
- `god_water` アクアス — **water elemental god, ocean throne**
- `god_grass` フローラ — **nature goddess Flora, blooming**
- `god_wind` テンペスト — **wind elemental god, vortex aura**
- `god_earth` ガイア — **earth mother Gaia, mountain crown**
- `god_thunder` フルゴル — **thunder god Fulgur, lightning bolts**
- `god_light` ルクス — **light god Lux, blinding white**
- `god_dark` ノクス — **dark god Nox, void aura**

### 巨神 (rank 7) - 8体

『**colossal [神話名] titan, world-shaking, ultimate form**』:

- `titan_fire` スルト — **Surtr the fire giant titan**
- `titan_water` ポセイド — **Poseidon the sea god titan**
- `titan_grass` ユグドラ — **Yggdrasil world tree titan**
- `titan_wind` ジン — **Djinn wind titan**
- `titan_earth` アトラス — **Atlas earth titan holding the sky**
- `titan_thunder` ゼウス — **Zeus thunder king titan**
- `titan_light` ソル — **Sol sun god titan**
- `titan_dark` ニュクス — **Nyx night goddess titan**

### オリジン (究極) - 1体

- `origin` オリジン — **the ultimate cosmic being containing all 8 elements, prismatic wings, divine crown, beyond godhood**

## 📦 効率的に生成するコツ

1. **同じスタイルパラメータ**で全部生成: `anime style, soft cel-shading, transparent bg`
2. **同じ参照画像**を Style Reference に使う（Midjourney `--sref`）→ 画風統一
3. **1家系まとめて生成** → tier 1〜5 の進化感が出やすい
4. **背景除去ツール**で透過化（remove.bg や Photoshop）
5. **正方形リサイズ**で 512x512 に統一（多くのAIは初期から正方形対応）

## 🚀 とりあえず数枚から試したい場合

スタートデッキの 6 種だけ用意すれば、新規プレイヤーは最初から AI 画像を見られます:
- `sla1` (スライム)
- `bea1` (オオカミの子)
- `bir1` (鳥のヒナ)
- `pla1` (植物)
- `cat1` (子猫)
- `mus1` (キノコ)

これだけで「あ、本格的だ」感が出ます。あとは徐々に増やしていけばOK。

## 🔧 動作確認

1. `assets/monsters/sla1.png` を1枚置く
2. ゲームを起動して「ぼくじょう」を開く
3. スラ（スライム系 tier1）が画像で表示されれば成功
4. 表示されない場合は ブラウザのコンソールで `Art.has('sla1')` を実行して `true` が返るか確認
