# 究極ゴリラ：シンセ高度化・DAW 計画のための技術引継ぎレポート

- 作成: Claude Code（このリポジトリの開発担当）／2026-11-04
- 対象バージョン: **v2.33**（`main`・commit `c78c306`。docs のみの commit `3aadcf7` を含む）
- 目的: ChatGPT と「シンセの高度化（VPS Avenger 2 クラス）」と「将来の DAW ゲーム」の正式な開発指示を作るための現状報告
- このレポートを作るために、コード・セーブデータ・ビルド設定・Git には一切変更を加えていない（このファイルを置いただけ。commit もしていない）

### 表記のきまり
- **［確認］** コードや文書を読んで確かめた事実（ファイル:行 を添える）
- **［推測］** コードから考えたが、実機・計測で確かめていないこと
- **A** ユーザーの明示的な指示 ／ **B** Claude Code が提案・設計したもの ／ **C** 今回の調査にもとづく新しい提案
- 行番号は v2.33 時点のもの

---

## 1. エグゼクティブサマリー

1. **作り**: 外部ライブラリなし・ビルドなしの **素の HTML / CSS / JavaScript（ES5）**。`index.html` を開くだけで動き（file://）、GitHub Pages でも動く。RPG 本体は `script.js`（約 2 万行）、ゲームセンターは `arcade*.js` の 15 ファイルで、**30 本のゲーム**がある（楽器ゲーム 8 本、メロディくずし・歌詞くずし、レトロ・パズル・クイズなど）。
2. **音**: 楽器ゲームはすべて、1 つの共通の音のエンジン **`window.UGMelody`（`arcade-melody.js`）** の AudioContext を共有している。音源は 2 種類ある。
   - GM 128 音色ぶんの合成レシピ（Web Audio のノードを組み合わせる）
   - **生の楽器の録音**（`samples/*.js` に base64 の MP3 を入れたもの。73 ファイル・約 25MB）
3. **シーケンサー**: ゴリラウクレレの中にある（`arcade-ukulele.js`、4,783 行）。**コードの行を並べる作りが中心**で、決まったトラック 7 本と追加トラック 8 本がある。ほかの 7 つの楽器ゲームは、すべてこのシーケンサーにつながっている（**テイクを送る ／ 曲を伴奏に流す**）。テンポの地図、ミキサー、MIDI 書き出し、WAV 書き出しもある。DAW の「部品」としては使えるが、DAW の「中心のデータの形」には向かない（§5.6）。
4. **シンセ（`arcade-synth.js`）**:
   - オシレーター 2 本（ユニゾン最大 3、サブ）
   - ローパスフィルター 1 つとフィルターエンベロープ
   - 音量の ADSR、LFO 1 つ（行き先 3 つ）、モノ／ポリ、グライド、XY パッド
   - アルペジエーター、プリセット 12、じぶんの音色 12、▶ パターン（v2.33）
   - UI にあるパラメーターは**すべて音に反映されている**［確認］。
   - Avenger 級の機能（モジュレーションマトリクス、複数の LFO・エンベロープ、ウェーブテーブル・FM・グラニュラー、エフェクトチェーン、ボイス管理）は**ない**。
5. **大きな制約**: CLAUDE.md の決まり（**ES5 のみ・外部ライブラリなし・ビルドなし・file:// で動くこと**）と、今回の方針（ライブラリ・TypeScript・AudioWorklet・WASM を使ってよい）がぶつかっている。**AudioWorklet と WASM は、そのままでは file:// で読みこめない**［推測・要検証］。正式な指示を作る前に、この決まりを書きかえるかどうかを決める必要がある。
6. **今回の調査で見つけた不具合（未修正）**: v2.27 から、ゴリラピアノの音色の一覧で **チェレスタ・ビブラフォン・マリンバ・ハープの 4 つが選べなくなっている**。`arcade-piano.js:38` のコメント（`// §322 v2.27`）が、同じ行の後ろの要素を消している（commit `3c95f65`）。§10 の課題の 1 番目。
7. **推奨（C）**: いきなりシンセを作りかえない。順番は次のとおり。
   - ①資産の保護（不具合の修正、データの形の文書化、テスト）
   - ②音のエンジンの共通化（時計・バス・ボイス管理・バンドのエンジン）
   - ③シンセのデータの形 v2（版番号つきの patch）
   - ④〜⑥ モジュレーション → エフェクト → 高度な合成
   - ⑦シーケンサーとの統合
   - ⑧DAW のデータの形（プロジェクト・クリップ・IndexedDB）
   - ⑨DAW 本体
   - 詳しくは §12。

---

## 2. RPG 全体の構造

### 2.1 ディレクトリと主なファイル［確認］

| パス | 大きさ | 役割 |
|---|---|---|
| `index.html` | 716 行 | 画面の HTML（モーダル・フィールド・ゲームセンターの枠）。CSS と 16 本の JS を `?v=2.33` つきで読みこむ（`index.html:8, 699–714`） |
| `style.css` | 1,351 行 | 全体の見た目（スマホ縦向き優先） |
| `script.js` | 20,282 行／1.2MB | **RPG 本体**（フィールド・戦闘・仲間・図鑑・イベント・BGM と効果音・セーブ・デバッグメニュー・ゲームセンターの入り口） |
| `arcade.js` | 2,883 行 | **ゲームセンターの土台**（`window.UGArcade`）とレトロゲーム 15 本 |
| `arcade-melody.js` | 2,353 行 | **共通の音のエンジン `UGMelody`** と「メロディくずし」 |
| `arcade-chords.js` | 621 行 | コード理論 `UGChords`（コード名の読み書き・押さえ方の探索・シーケンサーの予定作り `schedule`） |
| `arcade-ukulele.js` | 4,783 行 | ゴリラウクレレと **シーケンサー**（`UGUkulele`） |
| `arcade-piano.js` | 1,626 行 | ゴリラピアノ（`UGPiano`） |
| `arcade-drum.js` | 1,917 行 | ゴリラドラム（`UGDrum`） |
| `arcade-bass.js` | 2,044 行 | ゴリラベースと**バンドの共通部品**（`UGBass`: コード・コード進行・ハネ・音量のバス・ベースのパターン・伴奏の読みこみ） |
| `arcade-guitar.js` | 1,471 行 | ゴリラギター（`UGGuitar`） |
| `arcade-strings.js` | 1,412 行 | ゴリラストリングスと**のばす録音のエンジン**（`UGStrings`） |
| `arcade-horn.js` | 1,089 行 | ゴリラホーン（`UGHorn`） |
| `arcade-synth.js` | 1,117 行 | ゴリラシンセ（`UGSynth`） |
| `arcade-lyrics.js` / `arcade-table.js` / `arcade-sports.js` / `arcade-quiz.js` | 700 / 677 / 271 / 1,074 行 | 歌詞くずし ／ 五目ならべ・ナンプレ・ソリティア ／ バッティング ／ ゴリラクイズ |
| `samples/*.js` | 73 ファイル・約 25MB | 楽器の録音（`window.UGMelodySamples.banks[名前] = { prog, notes: { MIDI番号: base64 の mp3 } }`） |
| `tests/` | 17 ファイル | Node の自動テスト（`node tests/run.js`、**1,019 項目**。`harness.js` が DOM と Web Audio のにせものを用意する） |
| `assets/` | — | BGM などの素材 |
| `backup_v1/` | — | 初期の版のバックアップ |
| `.claude/skills/ultimate-gorilla-dev/` | — | Claude Code 用の開発スキル |
| `PROMPTS/START_NEW_SESSION.md` | — | 新しいセッションで最初に貼るプロンプト |
| 文書 | — | `CLAUDE.md`（開発ルール）・`HANDOFF.md`（引継ぎ）・`GAME_DESIGN.md`（**仕様の正本**・11,737 行・§1〜§329）・`TODO.md`・`CHANGELOG.md`・`README.md`・`CREDITS.md`（素材のクレジット）・`DEV_LOG.md`・`DEVELOPMENT_CHECKLIST.md`・`BGM_ASSET_GUIDE.md` |

### 2.2 言語・フレームワーク・ビルド・公開［確認］
- **言語**: JavaScript ES5 のみ（`var`、アロー関数なし、テンプレートリテラルなし。`tests/harness.js` の `es5Problems` で調べている）。HTML / CSS。
- **フレームワーク・外部ライブラリ**: なし（CDN もなし）。
- **ビルド**: なし。ファイルをそのまま配る。
- **公開**: GitHub Pages（`https://rokushakai.github.io/ultimate-gorilla/`）。`.github/workflows` はない。ブランチ `main` をそのまま公開する設定だと考えられる［推測：Pages の設定画面は見ていない］。
- **キャッシュ対策**: 出すたびに `index.html` の `?v=` をそろえる（CLAUDE.md）。録音を作りなおしたときは `MELODY_SAMPLE_V`（`arcade-melody.js`、いまは "2.32"）も上げる。
- **モジュールの作り**: どのファイルも即時関数 `(function () { "use strict"; ... })()` で、`window.UG*` に機能を出す。読みこみの順番は `index.html:699–714`。たがいに使い合う部分は、呼ぶときに `window.UGBass` などを見る遅い結びつけで解決している。

### 2.3 RPG 本体のアーキテクチャ［確認］
- `script.js` 全体が 1 つの即時関数。状態は 1 つの `state` オブジェクトにまとまっている（例: `state.arcadeHighScores`・`state.arcadeMedals`、`script.js:1297–1300`）。
- セーブは `saveGame()`（`script.js:17650`）と `loadGame()`（`17725`）。localStorage のキー `"ultimateGorillaSaveV2"`。音の設定は `"ultimateGorillaSoundV1"`。
- **RPG の BGM と効果音は、自分専用の AudioContext を持っている**（`initAudioContext`、`script.js:18300` 付近）。楽器ゲームの AudioContext とは別。

### 2.4 ゲームセンターのアーキテクチャ（`arcade.js`）［確認］
- **登録**: `register(def)`。def の中身は次のとおり。
  - `{ id, name, icon, cat, music, desc, help, controls, keys, setup, setupLabel, panel, create(api, cfg) }`
  - `create` は `{ input(action, down), pointer(type, x, y, id), step(), draw(ctx) }` を返す。
- **はじまり方**: `UGArcade.start(gameId, rootEl, opts)`。
  - `setup` があるゲームは、まず「はじめの画面」（`setup(root, ctl)`）を出す。`ctl.done(config)` で本編（`create(api, config)`）に進む。
- **ループ**: `requestAnimationFrame` の上で、**1/60 秒きざみの固定ステップ**（`STEP_MS`、`arcade.js:12, 272–290`）。1 回の描画で最大 5 ステップまで取りもどし、それをこえた遅れは捨てる。1 回のあいだが 100ms をこえたら 100ms とみなす。
- **api**（`arcade.js:382` 付近）: `W` / `H`・`addScore`・`getScore`・`addMedals`・`gameOver`・`panel`（キャンバスの下の HTML の場所）・`setCanvasHeight`・`setCompact`・`setLandscape`・`setRootClass`・`restart(config)`（v2.31）。
- **下のボタン**: 一時停止 ／ 🏠 はじめの画面（v2.31）／ やめる。終わったら もう一度 ／ 設定 ／ メニューへ。
- **内部の道具 `I`**（`window.UGArcade.internal`）: `W`・`hudText`・`emojiAt`・`lsGet` / `lsSet`・`escHtml`・`register`・`addStopHook`・`saveBlob` など。
- **RPG とのつながり**（`script.js:19512` の `startArcadeGame`）:
  - `UGArcade.start(gameId, stageEl, { soundEnabled, hiScore, onEnd: onArcadeGameEnd, onExit: onArcadeGameExit })` で呼ぶ。
  - 音楽のゲームでは BGM を止める（`stopBGM()`）。
  - 終わったらスコアに応じて**メダル**を足し、ハイスコアと一緒に RPG のセーブに書く（`onArcadeGameEnd`）。

### 2.5 セーブデータの管理［確認］
- RPG: `ultimateGorillaSaveV2`。CLAUDE.md の決まりで、新しい項目は `saveGame` / `loadGame` / `newGame` の 3 つに足し、`loadGame` では `!!data.x` のように古いセーブでも落ちない書き方にする。
- ゲームセンターの各ゲーム: ゲームごとに localStorage のキーを持つ（全部 `ultimateGorilla…V1`）。
  - 例: `…UkuleleSeqV1`（シーケンサーの曲）・`…PianoTakesV1`・`…SynthPrefsV1`・`…SynthMyV1`・`…DrumPatsV1`・`…BassMyPatsV1`・`…UkulelePadsV1`（＋バリトン用 `…PadsV1Bari`）・`…LatencyV1`（タイミングの補正）。
  - 読みこむときは、どのゲームも `xxxClean()` 関数で値の範囲を確かめて直す（壊れたデータや古いデータへの備え）。
- **保存先はすべて localStorage**。IndexedDB は使っていない。容量の上限（だいたい 5MB）は §10 の課題。

### 2.6 音の管理
- **ゲームセンター**: `UGMelody.audioInit()`（`arcade-melody.js:140`）で **AudioContext を 1 つだけ** 作り、全員で使う。中のつながりは次のとおり［確認］。
  - `master`（Gain 0.25）→ `destination`
  - `bus`（ここに各楽器の音が入る）→ `master`
  - `bus` → `revSend` → Convolver（2.2 秒のインパルスを作る）→ `revOut`（0.7）→ `master`
  - `bus` → `dlySend` → Delay（0.28 秒）→ ローパス（3kHz）→ フィードバック（0.32）→ Delay（ループ）→ `master`
  - 雑音用のバッファも 1 つ持つ
- **RPG**: `script.js` に BGM・効果音用の別の AudioContext がある。
- まとめると、**AudioContext は 2 つ**（RPG 用とゲームセンター用）。ゲームセンターの中では 1 つを共有していて、楽器ゲームごとに作りなおしてはいない［確認］。

### 2.7 モジュール間の依存（実行するときに参照する向き）［確認］

```
arcade.js (UGArcade・I)
 └ arcade-melody.js (UGMelody: AudioContext・バス・GM の合成・録音のバンク・WAV/MIDI)
    ├ arcade-chords.js (UGChords: コード理論・schedule)
    │  └ arcade-ukulele.js (UGUkulele: ウクレレ・シーケンサー・seqPlayEvent・xAdd・mixer)
    ├ arcade-bass.js (UGBass: chord・cprog・SWINGS・bus・patterns・backing) ← ギター・ストリングス・ホーン・ピアノ・シンセ・ウクレレのパターンが使う
    ├ arcade-strings.js (UGStrings: のばす録音の声・note・hold・sustains) ← ホーン・ピアノ（オルガン）・ウクレレのシーケンサーが使う
    ├ arcade-drum.js (UGDrum: patternList・patternSteps・patVel・prefs) ← バンドの機能のあるゲームがみな使う
    ├ arcade-piano.js (UGPiano: PLAYS・barSteps・voicing・play) ← シンセのパターンが使う
    └ arcade-synth.js (UGSynth: note・voice・patchClean) ← ウクレレのシーケンサーが、シンセの音色つきトラックで使う
楽器ゲーム 7 本 → UGUkulele（seqLoad・expand・seqSchedule・seqPlayEvent・mixer・fxPush・xAdd）で「伴奏」と「シーケンサーへ送る」
```

---

## 3. ゲームセンターの全ゲーム一覧（30 本）［確認］

「保存」の列は、ゲームが自分の localStorage キーを持つかどうか。ハイスコアとメダルは、どのゲームも RPG のセーブに入る（`onArcadeGameEnd`）。RPG とのつながりは、全ゲームとも §2.4 の `UGArcade.start` という同じ形。

| # | id | 正式名称 | ファイル | 種類 | 主な機能 | 保存 | 依存 |
|---|---|---|---|---|---|---|---|
| 1 | blocks | ゴリラブロック | arcade.js | パズル | 落ちものパズル | ハイスコアだけ | — |
| 2 | shooter | UMAシューター | arcade.js | アクション | 縦スクロールのシューティング | 〃 | — |
| 3 | pinball | ゴリラピンボール | arcade.js | アクション | フリッパーとバンパー | 〃 | — |
| 4 | breakout | ジャングルくずし | arcade.js | アクション | ブロックくずし | 〃 | — |
| 5 | snake | バナナスネーク | arcade.js | アクション | スネーク | 〃 | — |
| 6 | tennis | ゴリラテニス | arcade.js | アクション | CPU とラリー | 〃 | — |
| 7 | crossing | UMAクロッシング | arcade.js | アクション | 道路と川をわたる | 〃 | — |
| 8 | mole | ゴリラたたき | arcade.js | アクション | もぐらたたき | 〃 | — |
| 9 | sweeper | UMAスイーパー | arcade.js | パズル | マインスイーパー | 〃 | — |
| 10 | g2048 | ゴリラ2048 | arcade.js | パズル | 2048 | 〃 | — |
| 11 | reversi | ゴリラリバーシ | arcade.js | パズル | CPU とリバーシ | 〃 | — |
| 12 | slide | スライドパズル | arcade.js | パズル | 15 パズル | 〃 | — |
| 13 | memory | UMAしんけいすいじゃく | arcade.js | パズル | 神経衰弱 | 〃 | — |
| 14 | meteor | メテオシューター | arcade.js | アクション | 隕石をこわす | 〃 | — |
| 15 | defense | バナナディフェンス | arcade.js | アクション | ミサイルを迎え撃つ | 〃 | — |
| 16 | melody | メロディくずし | arcade-melody.js | 音楽 | 当たった所で音が鳴るブロックくずし・GM 音色・和音・録音・MIDI 出力 | `MelodyPrefsV1` / `MelodyRecV1` | UGMelody |
| 17 | lyrics | 歌詞くずし | arcade-lyrics.js | 音楽 | 言葉のブロックで作詞（メロディくずしと組み合わせて歌詞つき再生） | `LyricsV1` / `LyricsPrefsV1` | UGMelody |
| 18 | gomoku | ゴリラ五目ならべ | arcade-table.js | パズル | CPU と対戦 | ハイスコアだけ | — |
| 19 | sudoku | ゴリラナンプレ | arcade-table.js | パズル | 数独（3 段階） | 〃 | — |
| 20 | solitaire | ゴリラソリティア | arcade-table.js | パズル | クロンダイク | 〃 | — |
| 21 | batting | ゴリラバッティングセンター | arcade-sports.js | アクション | 20 球を打ち返す | 〃 | — |
| 22 | quiz | ゴリラクイズ | arcade-quiz.js | クイズ | 17 ジャンルの 4 択 | 〃 | — |
| 23 | ukulele | ゴリラウクレレ | arcade-ukulele.js | 音楽 | §4.1 | 多数（§2.5） | UGChords・UGMelody・UGBass・UGStrings・UGSynth・UGDrum |
| 24 | piano | ゴリラピアノ | arcade-piano.js | 音楽 | §4.2 | Prefs / Takes / Pads / Pats / Best | UGUkulele・UGBass・UGStrings・UGDrum |
| 25 | drum | ゴリラドラム | arcade-drum.js | 音楽 | §4.3 | Prefs / Takes / Pats / PatPads / Song / Best | UGUkulele・UGMelody |
| 26 | bass | ゴリラベース | arcade-bass.js | 音楽 | §4.4 | Prefs / Takes / MyPats / Best・`GripV1` | UGUkulele・UGDrum |
| 27 | guitar | ゴリラギター | arcade-guitar.js | 音楽 | §4.5 | Prefs / Takes / Best | UGBass・UGUkulele・UGDrum |
| 28 | strings | ゴリラストリングス | arcade-strings.js | 音楽 | §4.6 | Prefs / Takes / Best | UGBass・UGUkulele・UGDrum |
| 29 | horn | ゴリラホーン | arcade-horn.js | 音楽 | §4.7 | Prefs / Takes / Best | UGStrings・UGBass・UGUkulele・UGDrum |
| 30 | synth | ゴリラシンセ | arcade-synth.js | 音楽 | §4.8・§6 | Prefs / Takes / My | UGBass・UGPiano・UGUkulele・UGDrum |

- 実装状況: 30 本とも遊べる状態で公開している［確認］。
- 自動テスト: `tests/test-core.js` など 15 スイートで動きを確かめている。

---

## 4. 楽器ゲーム 8 種類の詳細

共通事項［確認］:
- **音**: すべて `UGMelody` の AudioContext を使う。録音の音源の再生は `AudioBufferSourceNode` ＋ `GainNode`（`melodySampleNote`）。録音がないときは GM の合成レシピ（Oscillator・Biquad・Gain・WaveShaper・雑音のバッファ）で鳴らす。
- **エフェクト**: 全体共通のリバーブとディレイの送り（§2.6）。ゲームごとのエフェクトは、ギター（コーラス・ディレイ・リバーブ）とベース（倍音を足す処理）だけ。
- **画面の下の共通ボタン**: 一時停止・はじめの画面・やめる。

**8 楽器の機能の一覧**（○ ある／△ 形が違う・一部／－ ない。v2.33、`GAME_DESIGN.md §328` を更新したもの）

| 機能 | ウクレレ | ピアノ | ドラム | ベース | ギター | ストリングス | ホーン | シンセ |
|---|---|---|---|---|---|---|---|---|
| 生の録音の音 | ○ | ○ | ○ | ○ | ○ | ○（強弱 2 段） | ○（強弱 2 段） | －（合成） |
| 録音（テイク） | △（シーケンサーで録る） | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| シーケンサーへ送る | △（シーケンサーそのもの） | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| シーケンサーの曲を伴奏に | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| ▶ パターン | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○（v2.33） |
| コード進行 | ○ | ○ | － | ○ | ○ | ○ | ○ | ○ |
| ハネ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| バンド（ドラム＋ベース） | ○ | ○ | △ | △ | ○ | ○ | ○ | ○ |
| じぶんのパターン | ○ | ○ | ○ | ○ | － | － | － | △（ピアノのものを使う） |
| よこ向き | － | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| リズムゲーム | ○ | ○ | ○ | ○ | ○ | ○ | ○ | － |
| れんしゅう・クイズ | ○ | ○ | ○ | ○ | － | － | － | － |

### 4.1 ゴリラウクレレ（`arcade-ukulele.js`）
- **音源**: 音色番号 140「ウクレレ（生）」（GM に番号がないので作った番号。MIDI では 24）。
  - 種類（v2.30〜2.32）は ソプラノ `fs_ukulele`・コンサート `fs_uke_concert`・テナー `fs_uke_tenor`・バリトン `acoustic_guitar_nylon`。`UGMelody.setUkeType` で切りかえる。
  - 弦ごとに出口（`ukeStringOut`）があり、同じ弦の前の音を 0.04 秒で消してから鳴らす。
- **演奏のしかた**:
  - 指板を押さえる。押さえ方はリアルタイム・ホールド・ハイブリッド・スマートの 4 つ。
  - サウンドホールの上をスワイプしてストロークする。ダウン・アップのボタンもある。
  - パッド 16 個、▶ パターン（v2.29）、ウクレレの種類（v2.30）。
- **モード**: フリー演奏・コード練習（易しい〜難しい）・コード進行練習（28 種）・コード辞典・カスタム・マイコード・耳コピ・上達メニュー（ストローク練習・1 分間チェンジ・タイミングの補正）・シーケンサー。
- **バリトン**: D G B E。`UKE_BARI` で音・押さえ方・コード名を 5 半音ずらす（`ukeMidi` / `ukeVoice` / `ukeDetect`）。
- **課題**: ファイルが巨大（4,783 行）。画面・音・データが 1 ファイルにまざっている。よこ向きがない。

### 4.2 ゴリラピアノ（`arcade-piano.js`）
- **音色**（`PIANO_VOICES`、`arcade-piano.js:38`）: グランド（Salamander・CC BY 3.0）・アップライト（VSCO2）・エレピ（Wurlitzer・CC BY 3.0）・CP80・パイプオルガン（押しているあいだのばす）・シロフォン・グロッケン。
  - **チェレスタ・ビブラフォン・マリンバ・ハープは不具合で一覧から消えている**（§1-6）。
- **モード**: じゆう（鍵盤・パッド 16 個・パッドのアルペジオと 34 種の演奏パターン・じぶんのパターン 16 個・▶ パターン（v2.28））・れんしゅう（光る鍵盤）・リズムゲーム（9 曲）。
- **ほかの機能**: コード名の表示（別の読み方・オンコード）、よこ向き、録音（テイク 10 個）、伴奏、シーケンサーへ送る（「🎹 ピアノ打ち込み」トラック）。

### 4.3 ゴリラドラム（`arcade-drum.js`）
- **音**: パッド 8 つ（キック・スネア・クラップ・リム・ハイハット・オープンハイハット・タム・クラッシュ）。生ドラム 5 セット（DRS・Virtuosity・Big Rusty・ブラシ・Swirly）と合成。
- **モード**: じゆう・ステップ（16 マスの打ち込み）・リズム（易しい・ふつう・難しい）。
- **ほかの機能**: 演奏パターン、ハネ、じぶんのフィル、ソング（パターンを並べる）、シーケンサーへ送る（「🥁 ドラム打ち込み」）、よこ向き。
- **ほかのゲームとの関係**: ほかのゲームのバンドの機能は、ここの `patternList` / `patternSteps` を使う。

### 4.4 ゴリラベース（`arcade-bass.js`）
- **音色**: ウッド・エレキ（指）・ピック・フレットレス・スラップ 2 つ・シンセベース 2 つ（録音）。
- **演奏**: フレット・パッド。奏法はスラップ・ミュート・スライド。
- **パターン**: 文字の種類は R 3 5 7 6 8 v A -。じぶんのパターン、ハネ、音の長さ、アクセント、ドラムのリズム、つなぎの音、4 小節ごとのフィル。
- **練習**: キーとスケール（旋法つき）、コード進行（14 種）、リズムゲーム、クイズ（フレット当て・度数当て）、だんだん速く。
- **共通部品**: `UGBass` には、バンドの機能の共通部品（chord・cprog・cprogAt・SWINGS・swingOf・bus・patterns・tokNote・backing）が入っていて、ほかのゲームが使う。

### 4.5 ゴリラギター（`arcade-guitar.js`）
- **音色**: ナイロン・スチール・ジャズ・クリーン・クランチ・ディストーション（録音）。カッティングにはミュートの録音を使う。
- **演奏**: 単音とストローク（強さあり）。チョーキング・ビブラート・ブリッジミュート・パワーコード・カポ・左利き・じぶんでならべるコード。
- **エフェクト**: コーラス・ディレイ・リバーブ（`gtrFxBuild`）。
- **パターン**: 文字の種類は D U x s B 1〜6 -、13 種。コード進行・バンド。
- **ほかの機能**: リズムゲーム・よこ向き・送る・伴奏。
- **ない機能**: じぶんのパターン。

### 4.6 ゴリラストリングス（`arcade-strings.js`）
- **楽器**: バイオリン・ビオラ・チェロ・コントラバス・合奏・ゆったり合奏・トレモロ・ピチカート・ハープ。
- **音**: VSCO2 の録音で、弱い・強いの 2 段。`UGStrings` の声は、ループ点を決めた `AudioBufferSource` を 2 層重ね、強さに応じて等パワーで混ぜる（`STR_LAYER_LO 0.3 / HI 0.95`）。
- **演奏**: 弓でこする（速さで大きさが決まる）。ビブラート、編成（6 パートまで・人数）。
- **パターン**: 12 種。ほかに リズムゲーム・よこ向き・パートごとに録って送る。

### 4.7 ゴリラホーン（`arcade-horn.js`）
- **楽器**: トランペット・トロンボーン・チューバ・ホルン・ブラスセクション・ソプラノ／アルト／テナー／バリトンサックス・オーボエ・ファゴット・クラリネット・フルート（13 種）。
- **録音の出どころ**: VSCO2・アイオワ大学 MIS・MTG。
- **演奏**: キーの上のほうほど強く吹ける。ソロとセクション（5 つのプリセット）。
- **パターン**: 10 種。ほかに リズムゲーム・よこ向き・パートごとに送る。

### 4.8 ゴリラシンセ（`arcade-synth.js`） → 詳しくは §6
- **音作り**: 合成のみ（Oscillator・Biquad・Gain）。
- **弾き方**: 鍵盤（たて 10 白鍵、よこ 15 白鍵）と XY パッド、XY パッド演奏。
- **演奏の機能**: アルペジエーター、▶ パターン（v2.33）。
- **保存と連携**: 録音（音色ごと保存）、伴奏、送る（「🎛️ シンセ打ち込み」トラックに音色（patch）ごと）。

### 4.9 未完成・予定（B: `GAME_DESIGN.md §328` に順番がある）
1. ギター・ストリングス・ホーンに、じぶんのパターン
2. ウクレレのよこ向き
3. シンセのリズムゲーム
4. ギター・ストリングス・ホーン・シンセのクイズ
5. DAW ゲーム

---

## 5. ウクレレシーケンサーの仕組み（重点）

### 5.1 データの形（`ukeSeqClean`、`arcade-ukulele.js:445`）［確認］

```js
// localStorage "ultimateGorillaUkuleleSeqV1"
{ cur: <seq>, songs: [ { id: 1, name: "曲名", seq: <seq> } /* 10曲まで */ ] }

// <seq>（既定値 ukeSeqDefault の形・抜粋）
{
  bpm: 90, key: 0, meter: 4,               // BPM 40〜240・移調 -11〜11・拍子 3 か 4
  swing: 0.5, swingGrid: 0.5,              // ハネ（0.5〜0.75）と、ハネをかける音符（8分 0.5 / 16分 0.25）
  style: "e", pattern: "D-DU-UDU",         // 曲全体の奏法とストロークのパターン
  metronome: true, countIn: true, loop: false, backing: true,
  loopOn: false, loopA: 0, loopB: 3,       // 区間ループ（行の番号）
  pos: "auto", rate: 100, rateUp: false, dyn: false, rev: -1, dly: -1,
  arr: ["イントロ", "サビ"],                // 曲の構成（セクション名の並び・32まで）
  lyrics: { id: 0 },
  rows: [                                   // 64行まで
    { type: "chord", name: "C", len: "w", pos: "auto", style: "song", pattern: "" },
    { type: "rest", len: "h" },
    { type: "key", semis: 2 },              // 転調（長さなし）
    { type: "tempo", bpm: 120 },            // テンポ変更（長さなし）
    { type: "sec", name: "サビ" }           // セクション（長さなし）
  ],
  tracks: <tracks>
}
```

- 長さの id は `C.SEQ_LENGTHS`（`w` 全音符など）か `"b2.5"`（2.5 拍・0.25 きざみ・32 拍まで）。
- **曲は「コードの行」の並びが中心**で、時間の位置は行の長さを足していって決まる。

### 5.2 トラック（`ukeTracksClean` `:1026`・`ukeXClean` `:641`）［確認］

```js
<tracks> = {
  uke:  { on: true, vol: 80, mute: false, solo: false, pan: 0, prog: 140, uk: true },
  bass: { on, vol, mute, solo, pan, prog: 32, pattern: "root" },        // コードから自動で作る
  drum: { on, vol, mute, solo, pan, groove: "8beat", fill: "off", custom: [[36,[0,8,10]],[38,[4,12]],[42,[0,2,4,6,8,10,12,14]]] },
  pad:  { on, vol, mute, solo, pan, prog: 48 },                          // コードから自動で作る
  rec1: { ..., prog: 140, quant: "off", notes: [[拍, midi, 強さ]] },    // 3000音まで（長さなし）
  rec2: { ...同上... },
  mel:  { ..., prog: 0, notes: [[拍, 長さ, midi(, 強さ)]] },             // 1000音まで
  xs: ["x1", "x2"],                                                      // 追加トラック 8本まで
  x1: { preset: "pnotes", kind: "notes", name: "ピアノ打ち込み", on, mute, solo, genre: false,
        vol: 70, pan: 0, prog: 0, play: "hold", oct: 0, notes: [[0, 1, 60], [1, 0.5, 64, 0.6]] },
  x2: { preset: "ynotes", kind: "notes", prog: 81, patch: { w1: "saw", cut: 0.62 /* ...シンセの音色 */ }, notes: [...] }
}
```

- 追加トラックのプリセット（`UKE_X_PRESETS`、`:617` 付近）は 23 種類。
  - 「コードから自動で弾く」もの（ストリングス・パッド・リード・ピアノ・ブラスなど）
  - 「打ち込み」のもの（mel・synmel・**pnotes / dnotes / bnotes / gnotes / snotes / hnotes / ynotes ＝ 各楽器ゲームから送られたテイクの入れもの**）
- 音量は 0〜100。パンは −0.6 / 0 / 0.6 の 3 段だけ。ミュートとソロ（`ukeTrackAudible`）。

### 5.3 予定作りとタイミング［確認］
- **予定作り**: `ukeSeqSchedule(seq, lowG)`（`:1286`）が `C.schedule(seq, resolve)`（`arcade-chords.js:531`）を呼ぶ。返り値は次のとおり。
  - `{ events, rows, tm(b), tmRaw(b), beatAt(t), lead, spb, time, beats, meter, tracks }`
  - **テンポの地図**: テンポの行ごとに区切り `segs: [{ b0, t0, spb }]` を作る。`tm(b)` は「拍 → 秒」（ハネを含む）、`beatAt(t)` は「秒 → 拍」。
  - `events` の中身: `{ t, kind: "strum"|"pluck"|"chuck"|"click"|"note"|"drum", track, midi, level, sec, shape, dir, string }`。
  - ウクレレ以外のトラックの出来事は `ukeTrackEvents`（`:1093`）・`ukeXEvents`（`:1223`）が作る。
- **再生**（シーケンサーの画面、`ukeSeqStart` `:1364`）:
  - `setInterval` で **25ms ごと**に、`AudioContext.currentTime` から **120ms 先まで**を予約する。
  - ループは、カウントインを飛ばしてくり返す（くり返すごとに練習のテンポを ＋5% できる）。
- **1 つの音を鳴らす**: `ukeSeqPlayEvent(UG, ac, ev, when, lowG, level, outs, mix, tracks)`（`:1310`）。
  - シンセの音色つきのトラック → `UGSynth.note(patch, …, sec)`
  - のばせる録音（弦・管・オルガン）→ `UGStrings.note(prog, …, sec)`
  - それ以外 → `UG.synth(midi, prog, when, …)`。ドラムは `UG.drum`。
- **ミキサー**: `ukeMixer` が、トラックごとに Gain ＋ StereoPanner を作って `bus` につなぐ。
- **ベロシティ**: 音ごとの `level`（0.1〜1）。のばす録音では、強さで弱い録音と強い録音の混ぜ方が変わる。

### 5.4 楽器ゲームとのつながり［確認］
- **送る**（各ゲームの `xxxSendToSeq`）:
  - `U.seqLoad()` → `U.xAdd(st.cur.tracks, "pnotes" など)` → `notes`（`[拍, 長さ, midi, 強さ]`）を入れる → `U.seqSave`。
  - ストリングスとホーンは、パートごとに別のトラックにする。
- **伴奏**（`UGBass.backing(id)`、`arcade-bass.js:472`）:
  - `U.seqLoad` → `U.expand(U.seqClean(sq))` → `seqAtRate` → `seqSchedule` → `{ name, seq, s: 予定, lowG, key, chords }` を返す。
  - 各ゲームの `backStep()` が、**ゲームの毎フレーム（1/60 秒）ごとに 0.1 秒先まで**を `U.seqPlayEvent` で予約する。
  - 「録音しながら伴奏」「パターン（ドラム・ベースつき）を曲に合わせる」もこの予定（`back.s.tm`）を使う。

### 5.5 保存・互換［確認］
- **すべての読みこみは `ukeSeqClean`** を通る。足りない項目は既定値で埋める。古い曲の直し（例: v2.26 で `uke.prog` 24 → 140。直したしるしは `uk`）もここでやっている。
- **書き出し**:
  - MIDI: SMF フォーマット 1。トラックごとの MTrk・テンポ・音の長さ・歌詞（`ukeMidiBytes` `:1455`）。
  - WAV: `ukeSeqExportWav` → `UG.renderWav`（OfflineAudioContext・32kHz・**最長 180 秒**）。
  - プロジェクトの JSON ファイル: 保存（`ukeProjectJson`・`:2715`）と読みこみ（FileReader・`:2649`）。曲とマイコードが入る（§179）。
  - MIDI の読みこみはない［確認：FileReader を使うのはこの JSON の読みこみだけ］。
- **WAV の弱点［確認］**: WAV にするとき、予定を `[ミリ秒, midi, 音色の記号, 強さ]` に変換している（`ukeSeqRec` `:1415`）。このため、**音の長さ（`sec`）とシンセの音色（`patch`）が失われる**。のばす録音やシンセのトラックは、画面で再生した音と同じにはならない。

### 5.6 DAW の土台に使えるかの評価（C）
- **使える部品**:
  - `C.schedule` のテンポの地図（`tm` / `beatAt` / テンポの区切り / ハネ）
  - `ukeSeqPlayEvent` の音色ごとの鳴らし分け
  - ミキサー（Gain ＋ Panner）
  - 音符の形 `[拍, 長さ, midi, 強さ]`（各テイクと mel・x トラックで共通）
  - MIDI 書き出し、テイクを送る仕組み、`xxxClean` の検証のやり方
- **DAW の中心には向かないところ**:
  1. 曲が「コードの行」の並びでできている。クリップを自由な位置に置けない。
  2. トラックは決まった 7 本＋8 本までで、録音トラックは音の長さを持たない形。
  3. トラックごとのエフェクト、オートメーション、オーディオのクリップがない。
  4. 保存は localStorage（曲 10 曲まで）と JSON ファイル。オーディオは入らない。
  5. 画面とエンジンが 1 つの 4,783 行のファイルにまざっている。
  6. 伴奏の時計がゲームのフレームに頼っている（§10）。
- **おすすめ**: 新しい「プロジェクトのデータの形」（§8.3）を作り、いまのシーケンスの曲は**変換して読みこむ**。いまの曲の形はそのまま残す（後方互換）。

---

## 6. シンセの現状（`arcade-synth.js`）

### 6.1 パラメーターの一覧と、音に反映されているか（`SYN_PARAMS` `:28` と `synVoice` `:78`）［確認］

| 項目 | キー（範囲） | 音への反映 | 作りの中身 |
|---|---|---|---|
| OSC1 の波形 | `w1`（saw / square / tri / sine） | ○ | Oscillator.type |
| OSC2 の波形 | `w2`（＋off） | ○ | 2 本目の Oscillator |
| ユニゾン | `uni` 1〜3 | ○ | OSC1 を 1〜3 本・ずらし ±7 / ±12 セントで固定（`SYN_UNI`） |
| OSC2 の音量 | `mix` 0〜1 | ○ | Gain |
| デチューン | `det` 0〜50 セント | ○ | OSC2 の detune |
| OSC2 のオクターブ | `oct2` −1〜1 | ○ | 周波数の倍率 |
| サブ | `sub` 0〜1 | ○ | 1 オクターブ下の square（音量 ×0.8） |
| フィルターの種類 | — | ローパスだけ（固定） | BiquadFilter "lowpass"（12dB/oct） |
| カットオフ | `cut` 0〜1 | ○ | 60Hz × 2^(8·cut)（60Hz〜15kHz） |
| レゾナンス | `res` 0〜1 | ○ | Q = 0.7 ＋ 17.3·res² |
| フィルターのエンベロープの量 | `env` 0〜1 | ○ | 立ち上がりで +5 オクターブ×env まで開く |
| 閉じる速さ・閉じたあと | `fd` 0.02〜2 秒・`fs` 0〜1 | ○ | `setTargetAtTime` |
| 音量の ADSR | `a` / `d` / `s` / `r` | ○ | Gain のオートメーション（R は `synRelease`） |
| LFO の速さ・深さ・行き先 | `lrate` 0.1〜12Hz・`ldep`・`lto`（pitch / cut / amp） | ○ | Oscillator（sine 固定）→ Gain → detune ／ filter.detune ／ 震わせ用の Gain |
| モノ・ポリ | `mono` | ○ | モノは 1 声で、後から押した音を優先 |
| ポルタメント | `glide` 0〜0.5 秒 | ○（モノのときだけ） | `synPitch` の `setTargetAtTime` |
| 音量 | `vol` 0〜1 | ○ | ピーク ＝ 0.4·vol·強さ |
| 強さ（ベロシティ） | — | 音量だけに効く | フィルターなどへは効かない |
| XY パッド | — | ○ | 横 ＝ cut、縦 ＝ ldep を、鳴っている声にも変える（`synSetCut` / `synSetLfo`） |
| アルペジエーター | `arp`（on・mode 5・rate 8分/16分/3連・oct 1〜3・gate） | ○ | AudioContext の時刻で予約（`arpStep`） |
| プリセット | `SYN_PRESETS` 12 個 | ○ | `synPatchClean` で範囲を確かめる |
| じぶんの音色 | `ultimateGorillaSynthMyV1`（12 個） | ○ | 名前と patch |
| エフェクト | — | シンセ専用のものはない | 全体のリバーブ・ディレイだけ |
| ▶ パターン・バンド | `spat`・`srate`・`swing`・`cprog`・`sev`・`drum`・`bpat`・`yvol` / `bvol` / `dvol` | ○（v2.33） | ピアノの `barSteps` を使う。ドラムとベースはそれぞれのゲームのものを使う |

- **ない機能**: ノイズのオシレーター、PWM、波形のモーフィング、オシレーターごとの半音・細かい音程、キーで変わるフィルター、HP / BP / ノッチのフィルター、2 つ目のエンベロープ、2 つ目の LFO、LFO の波形の選択、テンポに合わせる LFO、モジュレーションマトリクス、ボイスを奪う仕組み・同時発音数の上限、シンセ専用のエフェクト、ステップシーケンサー。

### 6.2 1 つの声の音声ノードのつながり（`synVoice`）［確認］

```
[OSC1 ×uni] ─Gain(1/√uni)─┐
[OSC2]      ─Gain(mix)────┼→ mixg(Gain: 0.7/max(1,合計×0.8)) → filt(Biquad lowpass) ─┬→ amp(Gain: ADSR) → out
[SUB square]─Gain(sub×0.8)┘                                                          │  （lto=amp のときは filt → trem(Gain) → amp）
LFO(Oscillator sine) → lg(Gain: 深さ) → {各 OSC.detune ｜ filt.detune ｜ trem.gain}
out = UGBass.bus(buses, "y", yvol) → UGMelody.audio.bus → (master / reverb / delay) → destination
```

### 6.3 AudioContext と解放［確認・一部推測］
- AudioContext は `UGMelody.audio.ctx` を共有している（自分では作らない）。
- 声をはなすとき（`synRelease` `:135`）は、エンベロープを R で 0 に向け、`end = t + r×1.6 + 0.05` に Oscillator と LFO を `stop()` する。**`disconnect()` は呼んでいない**。止まったソースと、参照のないノードはブラウザが回収するしくみに任せている［推測：長時間の計測はしていない］。
- 声の配列 `arpVo` と `pat.vo` は、終わった声を取りのぞいている（32 と 64 で切りつめる）。
- `synNote(...).kill()` で、シーケンサーを止めたときにすぐ消せる（`UGUkulele.susStop` から呼ぶ）。

### 6.4 シーケンサーとのつながり［確認］
- テイクは `{ id, name, bpm, meter, pname, patch, notes }` の形で保存する。「送る」で `ynotes` トラックに `patch` ごと入れる（`synSendToSeq`）。
- 曲の中では `ukeSeqPlayEvent` が `UGSynth.note(patch, midi, out, when, level, sec)` で鳴らす。
- **WAV 書き出しではシンセの音色が使われない**（§5.5）。

---

## 7. 過去のユーザー指示・Claude 設計構想

### 7.0 参照できた資料
- 参照できた: `CLAUDE.md`、`HANDOFF.md`、`GAME_DESIGN.md`（§ごとに「プロデューサーの意見／方針」が書いてある所がある）、`TODO.md`、`CHANGELOG.md`、Git の履歴（328 commit、2026-06-28〜）、コードのコメント、**このセッションの会話**（先の部分は要約として残っている）。
- **参照できない**: これより前の Claude Code のセッションの会話記録、Issue（GitHub の Issue は見ていない）。それより前のユーザーの指示は、上の文書に書かれている範囲でしかわからない。
- **注意**: `GAME_DESIGN.md` の「プロデューサーの意見／方針」は、ユーザーの言葉を Claude が要約して書いたもの。原文ではない。

### 7.1 A：ユーザーから明示的に指示された内容（確認できたもの）

| 内容 | 根拠 |
|---|---|
| 開発のきまり: ES5 のみ・外部ライブラリなし・ビルドなし・file:// と Pages の両方で動く・`?v=` をそろえる・スマホ縦向き優先・長押しの抑制・モーダルは `.modal` を使う・`?debug=1` のときだけデバッグメニュー・セーブの互換のルール・v0.7.1 までの機能を壊さない・GAME_DESIGN → TODO → 実装 → CHANGELOG → commit → push の順・commit の書き方 | `CLAUDE.md` |
| 「最終的にDAWゲームを作って、それに踏襲できると良い。普通のDAWみたいなトラック構成だったりGarageBandみたいなループを仕込むやつとか充実したDAW機能があり、諸々のゲームで作った素材を生かせられるもの。これは最後で良い。今は基盤を作っている」 | このセッション（2026-11-03）。`GAME_DESIGN.md §321` に要約あり |
| 「ピアノもウクレレもパターン演奏を入れたい。色んな楽器ゲームで使った技術をすべての楽器ゲームに展開したい（シンセの実装が終わってから）」 | 同上 → v2.28・v2.29 で実装 |
| 「ウクレレもピアノも生の音がほしい。ピアノにエレピとオルガンも。あとはシンセのプリセットで補う」 | 同上 → v2.26・v2.27（ハモンド系オルガンは自由な録音がなく、見送り） |
| シンセを別のゲームにするか、ピアノを広げるか → Claude のおすすめ（別のゲーム）に同意（「そのおすすめでいきたいです！！」） | このセッション → v2.24 |
| 「テナー・バリトン（サックス）も生の音に」「全部を順次お願いします」（シーケンサーの強弱・先読み・ほかの生の音） | このセッション → v2.18〜v2.21 |
| ウクレレをソプラノ・コンサート（ユーザーの言い方は「アルト」）・テナー・バリトンから選べるように | このセッション（2026-11-04）→ v2.30 |
| 種類をすぐ変えたい・「はじめの画面」へのボタン・パターンが切りかわらない | 同上 → v2.31（`GAME_DESIGN.md §326`） |
| ソプラノ・コンサート・テナーが同じに聞こえるので、太さを適したものに | 同上 → v2.32（`§327`） |
| **今回**: シンセを VPS Avenger 2 級へ段階的に高める。外部ライブラリ・TypeScript・AudioWorklet・WASM の導入に制限なし。調査のみで変更しない | この依頼 |

- 出どころがはっきりしない方針（記録には「方針」として書かれているが、ユーザーの指示か Claude の提案か、文書からは決められない）:
  - **録音のライセンス**: CC0・CC BY だけ使い、NC やライセンスが不明なものは使わない（`§321`）
  - **BGM のコードには手を入れない**（コードのコメント「BGM関数本体は変更なし」、`script.js:19518`）

### 7.2 B：Claude Code が提案・設計した内容
- 計画の順番: 生の録音 → ピアノ・ウクレレのパターン → 機能をそろえる → DAW（`§321`）。ユーザーの依頼を Claude が順番に並べたもの。
- 機能の一覧表と、足りないものを埋める順番（`§328`: シンセのパターン → じぶんのパターン → ウクレレのよこ向き → シンセのリズムゲーム → クイズ → DAW）。v2.33 でシンセのパターンまで実装した。
- シンセの設計（§319・§320）、パターン演奏のエンジン（ギター §284 を元に、各ゲームへ広げた）、ウクレレの種類の作り（バリトンは 5 半音ずらす §325、音色の加工 §327）、生の録音の作り方（変換の道具は作業用のフォルダにあり、リポジトリには入っていない）。
- **シーケンサーの「DAW 化」第 1〜4 段階**（v0.95〜v0.98・`§176〜§179`: タイムライン・トラックとミキサー・録音と重ね録り・曲の構成とテンポと MIDI とプロジェクト保存）。指示か提案かは記録から決められない。

### 7.3 以前の指示と現在の実装の違い
- ウクレレの「アルト」は、実装では「コンサート」とした（アルトという名前のウクレレは一般的ではないため）。この点はユーザーに確かめていない。
- コンサート・テナー・バリトンは本物のその大きさの録音ではない（§4.1）。本物の録音が見つかったら差しかえる約束になっている。
- DAW は「最後で良い」とされ、まだ着手していない。

---

## 8. 将来の DAW 構想と音楽データの形

### 8.1 DAW の機能ごとの状態（v2.33）

| 機能 | 状態 | 根拠・中身 |
|---|---|---|
| マルチトラック | **一部実装** | シーケンサー: 決まった 7 本＋追加 8 本（§5.2） |
| MIDI 相当の演奏データ | **実装済み** | `[拍, 長さ, midi, 強さ]`・SMF の書き出し。MIDI の読みこみはない |
| Piano Roll | **実装済み（シーケンサーの中）** | `§198`・`§199`（範囲選択・コピー） |
| オーディオのループ・クリップ | **未検討** | 録音したオーディオを扱う仕組みはない（マイク入力もない） |
| ループの一覧（Loop Browser） | **構想のみ** | ユーザーの「GarageBand のようなループ」（A） |
| BPM の同期 | **実装済み（予定の時刻で）** | テンポの地図。各ゲームの伴奏とパターンが曲の時刻に合わせる |
| ミキサー | **一部実装** | 音量・3 段のパン・ミュート・ソロ |
| エフェクト | **一部実装** | 全体のリバーブ・ディレイ（曲ごとの量 `rev` / `dly`）。トラックごとのものはない |
| オートメーション | **未検討** | — |
| プリセットの共有 | **未検討** | シンセのじぶんの音色は端末の中だけ。書き出し・読みこみはない |
| WAV 書き出し | **実装済み（制限あり）** | 180 秒まで。音の長さとシンセの音色が失われる（§5.5） |
| プロジェクトの保存 | **実装済み（シーケンサー）** | 曲 10 個（localStorage）＋「📦 プロジェクトをファイルに保存 ／ 📂 ファイルから読み込む」（JSON。`ukeProjectJson`・`arcade-ukulele.js:2715` と読みこみ `:2649`。曲の全部の設定・トラック・録音・メロディ・構成・マイコード、§179）［確認］ |
| 楽器ゲームとの連携 | **実装済み** | 送る（7 ゲーム）・伴奏（7 ゲーム） |

### 8.2 いまのデータの形の見本［確認］

```js
// 楽器ゲームのテイク（ピアノ。ほかもだいたい同じ）  localStorage "ultimateGorillaPianoTakesV1" = [take, ...]（10個まで）
{ id: 3, name: "テイク 3", bpm: 90, meter: 4, prog: 0, song: "", notes: [[0, 0.5, 60], [0.5, 0.5, 64, 0.6]] }

// シンセのテイク（音色ごと）
{ id: 1, name: "テイク 1", bpm: 100, meter: 4, pname: "のこぎりリード", patch: { /* 6.1 のキー全部 */ }, notes: [[0, 0.25, 72]] }

// シンセの音色（patch）
{ w1: "saw", w2: "saw", lto: "pitch", mono: true, uni: 1, mix: 0.6, det: 12, oct2: 0, sub: 0, cut: 0.62, res: 0.25,
  env: 0.35, fd: 0.3, fs: 0.4, a: 0.005, d: 0.2, s: 0.8, r: 0.15, lrate: 5.5, ldep: 0.12, glide: 0.06, vol: 0.75 }

// ドラムのパターンの1拍子ぶん（UGDrum.patternSteps(id)）: [[GMドラムの番号, [鳴らすマス, ...]], ...]（16マス、3拍子は12マス）
[[36, [0, 8, 10]], [38, [4, 12]], [42, [0, 2, 4, 6, 8, 10, 12, 14]]]

// ベースのパターン（UGBass.patterns(meter)）: [id, 名前, 1小節の文字, 拍子]
["r5", "ルートと5度", "R-5-R-5-", 4]

// ピアノの鳴らし方（PIANO_PLAYS）: [id, 名前, 種類, 文字, 1文字の拍]
["bunch", "ブンチャッ（2ビート）", "pat", "B-H-B-H-", 0.5]

// ウクレレのパッド  "ultimateGorillaUkulelePadsV1" = 16個
[{ name: "C", shape: [0, 0, 0, 3] }, null, ...]

// 録音のバンク（samples/vsco_piano.js）
window.UGMelodySamples.banks["vsco_piano"] = { prog: 1, notes: { "60": "<base64 mp3>", ... } };
```

### 8.3 DAW に転用するときの互換性のリスク（C）
1. **拍が基準で、テンポの地図は曲の中だけにある**: テイクは `bpm` と拍で保存されている。DAW で別のテンポの曲に入れるときは、拍のまま使うか秒に直すかを決める必要がある。
2. **音色の参照がまちまち**: GM の番号 ＋ 作った番号（140 は「いまのウクレレの種類」で、端末の設定で音が変わる）、`patch` の埋めこみ、楽器の id（`"violin"`）がまざっている。DAW では「楽器の参照 ＝ { 種類, id, 版, 設定 }」に統一するのがよい。
3. **録音トラック（rec1 / rec2）は長さを持たない**（`[拍, midi, 強さ]`）。ほかは `[拍, 長さ, midi, 強さ]`。
4. **シーケンサーの曲の形はコードの行が中心**。クリップの形に直すとき、自動演奏（ストローク・ベース・パッド）は「コードのクリップ」＋「生成のルール」として持つか、音符に展開して固めるかを選ぶ必要がある。
5. **localStorage の容量**: シーケンサー・テイク・音色をすべて localStorage に入れている。オーディオの素材は入らない → IndexedDB が必要。
6. **版の印がほとんどない**: プロジェクトの JSON ファイル（`{ type, version: 1, saved, song, myChords }`・`ukeProjectJson`）以外のデータ（localStorage の曲・テイク・patch・パターン）には `version` の欄がなく、`xxxClean` の既定値で互換を保っている。DAW の形には版番号と移行の関数を入れるべき。
7. **シンセの patch v1 → v2**: パラメーターを増やすとき、v1 の patch（テイク・じぶんの音色・シーケンサーの ynotes の中）を、同じ音のまま v2 に移す関数が必要。

---

## 9. 技術的課題（重大度：高 ／ 中 ／ 低、優先度：1 がいちばん先）

| # | 課題 | 重大度 | 優先 | 中身 |
|---|---|---|---|---|
| 1 | **ピアノの音色 4 つが選べない不具合** | 中 | 1 | `arcade-piano.js:38`（§1-6）。保存された設定の音色が 8・11・12・46 の人は、ピアノ（0）に戻されている［確認：`pianoProgOk` で 0 になる］ |
| 2 | **ゲームの時計がフレームに頼っている** | 高（DAW では） | 2 | パターン・伴奏・バンドは `now() = frame/60` を基準に `ac.currentTime + (予定 − now())` で予約している。描画がとどこおって 1/60 秒のステップが 5 回分より多く遅れると、遅れた時間が捨てられ、ゲームの時計が音の時計より遅れる → テンポのずれ・ゆれ［推測：低速端末での計測はしていない］。シーケンサーの画面の再生（`setInterval` ＋ `ac.currentTime`）は大丈夫。タブが裏に回ると rAF が止まり、パターンも止まる |
| 3 | **パターン・バンドのエンジンを 6 か所に写している** | 中 | 3 | `patStart` / `patStep` / `drumStep` / `bassStep` / `barHead` などを、ギター・ストリングス・ホーン・ピアノ・ウクレレ・シンセにほぼ同じ形で写している（各 150〜250 行）。直すときに 6 か所を直す必要がある |
| 4 | **巨大なファイル** | 中 | 4 | `script.js` 20,282 行、`arcade-ukulele.js` 4,783 行、`arcade-melody.js` 2,353 行。画面・エンジン・データがまざっている |
| 5 | **声を管理する仕組みがない** | 中 | 3 | 同時発音数の上限・ボイスを奪う仕組みがない。シンセの声 1 つあたり Oscillator 最大 5（OSC1×3・OSC2・SUB）＋LFO。ユニゾン 3 のパッドで和音とアルペジオを重ねると、ノードの数が増える［推測：CPU は計測していない］ |
| 6 | **ノードの明示的な解放がない** | 低〜中 | 5 | `disconnect()` を呼ばない（§6.3）。長い時間遊んだときのメモリは計測していない |
| 7 | **AudioContext が 2 つ** | 低 | 6 | RPG（BGM・効果音）とゲームセンター。iPhone では両方とも、さわったときに `resume` が必要 |
| 8 | **WAV 書き出しが画面の音と違う** | 中（DAW では高） | 4 | 音の長さとシンセの音色が失われる。180 秒まで |
| 9 | **localStorage の容量** | 中 | 4 | テイク・曲・パターンを全部入れている。上限をこえたら `lsSet` が失敗する［推測：使用量は計測していない］ |
| 10 | **録音の素材が大きい** | 中 | 5 | 25MB の base64 の JS を必要なときに読む。解いたバッファは最大 16 バンク（`MELODY_SAMPLE_KEEP`）。iPhone のメモリは確かめていない |
| 11 | **iPhone** | 中 | 5 | `webkitAudioContext` への切りかえ・`resume` はある。実機での確認は、この調査ではしていない（私の確認はヘッドレス Chrome だけ） |
| 12 | **GitHub Pages の制約** | 低 | — | 静的配信だけ（サーバー処理なし）。SharedArrayBuffer に必要な COOP/COEP の見出しを付けられない → **SharedArrayBuffer を使う WASM のスレッドは使えない**［推測：一般的な Pages の仕様にもとづく。この調査では確かめていない］ |
| 13 | **file:// の制約** | 高（方針によっては） | 2 | AudioWorklet の `addModule()` や WASM の `fetch` は、file:// では読みこめないことが多い。Blob URL や base64 で埋めこむ回避策はある［推測・要検証］。「file:// でも動く」という決まりを残すかどうかで設計が変わる |
| 14 | **外部ライブラリ・TypeScript の導入** | — | 2 | いまはビルドがない。入れるならビルド（例: esbuild）で 1 つの JS にまとめ、**できたファイルを commit して**、file:// と Pages で動く形を保つのが無難（C）。テスト（Node の vm で動く）も、ビルドしたものを読むように変える必要がある |
| 15 | **古いセーブとの互換** | 中 | 継続 | `xxxClean` で守っている。新しい形には版番号と移行の関数を入れる（§8.3-6） |

- **AudioWorklet**［推測］: Chrome・Safari（14.5 以降）・Firefox で使える。ただし安全な場所（https または localhost）が必要で、file:// では制限がある。
- **WASM**［推測］: `WebAssembly.instantiate` に base64 を直して渡せば、fetch なしでも読める。スレッド（SharedArrayBuffer）は Pages では使えない見込み。

---

## 10. シンセ高度化（Avenger 級）の実現可能性（C）

### 10.1 いまの作りでできるか
- **Web Audio のノードのまま（ES5 のままでも）できるもの**:
  - オシレーターを増やす、ノイズ、PWM（2 本の saw の差か、PeriodicWave）
  - 静的なウェーブテーブル（PeriodicWave）
  - 2 オペレーターの FM（Oscillator → Gain → frequency）
  - フィルターの種類（LP / HP / BP / ノッチ、Biquad を 2 つ重ねて 24dB）
  - 複数のエンベロープ、複数の LFO
  - モジュレーションマトリクス（行き先が AudioParam なら Gain でつなげる）
  - エフェクト（WaveShaper・Delay ＋ LFO のコーラス・オールパスのフェイザー・Convolver・DynamicsCompressor・EQ）
- **AudioWorklet（または WASM）が必要なもの**:
  - ウェーブテーブルの位置をなめらかに動かす
  - 多オペレーターの FM や帰還
  - グラニュラー（細かく動かすもの）
  - サンプル単位のモジュレーション（エンベロープ → ウェーブテーブルの位置など）
  - 高品質なフィルター（ラダー・SVF）
  - 数の多いユニゾン（Avenger は最大 16 くらい）を軽く鳴らすこと
- **結論**: 第 1 段（ノードのまま）で、いまの作りの延長として「Avenger の入り口」までは行ける。本格的なもの（ウェーブテーブルのモーフィング・グラニュラー・重い FM）は、ワークレットの音のエンジンを新しく作る方がよい。

### 10.2 再利用できるもの
- **音色のデータ**: `synPatchClean` の考え方（範囲を確かめる・既定値）。
- **演奏の部品**:
  - 予定の作り方（`ac.currentTime` で予約・先読み 0.1 秒）
  - アルペジエーター（`synArpOrder`）、▶ パターン（`UGPiano.barSteps`）、XY パッドの考え方
- **画面**: 鍵盤（`synLayout` / `synKeyAt`）。
- **連携**: テイクの保存、送る、シーケンサーでの再生（`UGSynth.note` の形をそのまま保てば、シーケンサー側を直さずにすむ）。

### 10.3 改修するべき所
1. **patch を v2（版番号つき）にする**: v1 → v2 の移行を作り、`UGSynth.note(patch, m, out, when, vel, sec)` の形は保つ。
2. **ボイス管理**: 同時発音数、奪い方、明示的な `disconnect`。
3. **時計**: ゲームのフレームから、`ac.currentTime` を基準にした共通の予定作り（`setInterval` か Worker）に移す。
4. **出口**: シンセ専用のエフェクトのバスを、`UGMelody.bus` の前に入れる。

### 10.4 独立したモジュールにするべきもの
- **音色のエンジン**（`UGSynthEngine`）: 画面と分ける。ゲーム・シーケンサー・DAW・WAV 書き出し（OfflineAudioContext）から同じように呼べる形にする。
- **共通の時計**（`UGClock`）と**バンドのエンジン**（`UGBand`: パターン・コード進行・ドラム・ベース）: 6 か所の写しを 1 つにする。
- **データの形**（`UGProject`）: patch・クリップ・プロジェクトの検証と移行。
- **エフェクトのチェーン**（`UGFx`）: シンセとトラックの両方で使う。

### 10.5 ライブラリの候補［推測：評価は一般的な知識にもとづく。この調査では試していない］
- **Tone.js**: 時計・シンセ・エフェクトがそろっている。ただし大きく、独自のコンテキストの管理がある。いまの `UGMelody` の AudioContext と合わせるには `Tone.setContext` が必要。全体で使うより、部分的に使う方が向く。
- **Faust（→ WASM / AudioWorklet）**: フィルター・FM・エフェクトなどの DSP を書いて、ワークレットにできる。重い DSP に向く。
- **自前の AudioWorklet（TypeScript）**: いちばん自由で軽いが、作る量は多い。
- **おすすめ（C）**: 時計とデータの形は自前で作る（いまの形と合わせやすい）。重い DSP だけを Faust か自前のワークレットにする。Tone.js は使わないか、エフェクトだけに使う。

### 10.6 将来の DAW に悪い影響を与えやすい設計（C）
- シンセの音を**ゲームの画面の中**だけで作る（いまの形）。DAW やオフライン書き出しから呼べなくなる。
- patch を**版番号なし**で増やす。
- **フレームの時計**のまま機能を増やす。
- **localStorage** に大きなデータ（ウェーブテーブル・サンプル）を入れる。
- 音色の参照を**埋めこみ**だけにする（同じ音色を共有・更新できない）。

### 10.7 シンセだけを先に作るときの注意（C）
- 外向きの約束（`UGSynth.note` / `voice` / `patchClean` / `SEQ_PROG`）と、保存の形（テイク・じぶんの音色・`ynotes` の patch）を変えないか、移行を必ず書く。
- 新しいエンジンの音は、ゲームの中と OfflineAudioContext（WAV 書き出し）の両方で鳴るようにしておく。
- CPU の上限（スマホ）を決めて、ボイスとユニゾンの数を制限する。
- ES5 とビルドなしの決まりを変えるなら、`CLAUDE.md` を先に書きかえる。テストの仕組み（`tests/harness.js` の vm）がビルド後のファイルで動くようにする。

---

## 11. Claude Code 推奨ロードマップ（C・今回は実装しない）

| フェーズ | 中身 | 依存 | 主なリスク |
|---|---|---|---|
| **0. 既存資産の保護** | ①ピアノの音色の不具合を直す ②いまのデータの形（テイク・シーケンサー・patch・パターン）を文書にして、見本のデータでテストを作る ③タグ（例: `v2.33-base`）を付ける ④`CLAUDE.md` の技術の決まりをどう変えるか決める（file:// を残すか・ビルドを入れるか・TypeScript・ワークレット・WASM） | なし | 決まりを決めないまま進むと、後で作りなおしになる |
| **1. 音声エンジンの整理** | 共通の時計 `UGClock`（`ac.currentTime` 基準・先読み）、バンドのエンジン `UGBand`（6 か所の写しを 1 つに）、ボイス管理、ノードの解放、AudioContext 1 つの方針 | 0 | 6 つの楽器ゲームの動きが変わる → いまの 1,019 項目のテストと、耳での確認が必要 |
| **2. シンセの基本強化** | patch v2（版番号・移行）、オシレーター 3〜4 本（波形・半音・細かい音程・ノイズ・PWM）、フィルターの種類と傾き、キーで変わる量・強さで変わる量、エンベロープ 3 つ・LFO 2〜3 つ（波形・テンポ同期） | 1 | 音が変わる（いまのプリセットを同じ音に保つ移行が必要） |
| **3. モジュレーションマトリクス** | 発生源（LFO・エンベロープ・強さ・キー・XY パッド・ランダム）× 行き先（AudioParam）× 量。画面はスマホで使える形に | 2 | 画面の複雑さ（スマホ縦向き） |
| **4. エフェクト** | シンセ用のエフェクトのチェーン（歪み・コーラス・フェイザー・ディレイ・リバーブ・EQ・コンプ）。並べかえ。共通の `UGFx` にして、DAW のトラックでも使う | 1（2 と並行可） | CPU |
| **5. 高度な合成** | ワークレット（または Faust の WASM）でウェーブテーブルのモーフィング・FM・グラニュラー・高品質のフィルター・多いユニゾン | 0 の決まり・2・3 | file:// / Pages の制約、iPhone の性能、テストの作り |
| **6. 既存シーケンサーとの統合** | `ynotes` のトラックを patch v2 に。シーケンサーで音色を参照する形（埋めこみ ＋ id）。WAV 書き出しで音の長さと patch を使う（`ukeSeqRec` を直す） | 2 | 古い曲の互換 |
| **7. DAW 連携の基盤** | プロジェクトのデータの形 `UGProject`（テンポの地図・トラック・クリップ（音符 ／ コード ／ オーディオ）・ミキサー・エフェクト・オートメーション・版番号）、IndexedDB、いまのシーケンサーの曲とテイクの変換、オフラインの書き出し（オーディオの素材にする） | 1・6 | データの移行・容量 |
| **8. DAW 本体** | タイムライン、ピアノロール（§198・§199 を再利用）、ループの一覧、ミキサー、オートメーション、WAV / MIDI、プロジェクトのファイルへの書き出し・読みこみ・共有 | 7 | 画面の量（スマホで DAW）・性能 |

- **優先順位**: 0 → 1 → 2 → (3・4) → 6 → 5 → 7 → 8。
  - 6 を 5 より先にするのは、シンセが「シーケンサー・DAW の音源」として早く役に立ち、データの形の問題を早く見つけられるため。
- **ユーザーが前に決めた順番**（§328 の 2〜5: じぶんのパターン・ウクレレのよこ向き・シンセのリズムゲーム・クイズ）を、このロードマップのどこに入れるか（先にやる・後にする・やめる）も決める必要がある。

---

## 12. ChatGPT へ引き継ぐべき重要事項

1. **いまの技術の決まり**（`CLAUDE.md`: ES5・ライブラリなし・ビルドなし・file:// と Pages）と、今回の方針（ライブラリ・TS・ワークレット・WASM 可）がぶつかっている。**最初にこれを決めて、`CLAUDE.md` を書きかえる指示が必要**。
2. **AudioContext はゲームセンター全体で 1 つ**（`UGMelody.audio.ctx`）。新しいシンセもこれを使うか、置きかえるかを決める（DAW・WAV 書き出しのため、OfflineAudioContext でも同じエンジンが動く必要がある）。
3. **外向きの約束**（ほかのゲームとシーケンサーから呼ばれている）:
   - `UGSynth.note(patch, midi, out, when, vel, sec)` → `kill()` のある声
   - `UGSynth.patchClean` / `UGSynth.voice`
   - `UGUkulele.seqPlayEvent` / `xAdd` / `seqLoad` / `seqSchedule` / `susStop`
   - `UGBass.backing` / `bus` / `chord` / `cprog`
   - `UGPiano.barSteps` / `voicing` / `PLAYS`
   - `UGDrum.patternList` / `patternSteps` / `patVel` / `prefs`
   - `UGMelody.synth` / `drum` / `loadSamples` / `prefetchSamples` / `renderWav` / `setUkeType` / `setDrumKit`
4. **保存の形と互換**: §5.1・§5.2・§8.2。読みこむときは必ず `xxxClean` を通す習慣がある。新しい形にも版番号と移行を入れる。
5. **開発の流れの決まり**: GAME_DESIGN → TODO → 実装 → CHANGELOG（＋ HANDOFF・README）→ commit → push origin main。`?v=` をそろえ、録音を作りなおしたら `MELODY_SAMPLE_V` も上げる。返事は日本語。`?debug=1` のときだけデバッグ。
6. **テスト**: `node tests/run.js`（1,019 項目・約 1 分）。`tests/harness.js` は DOM・Web Audio・localStorage のにせものを vm の中に作る。**AudioWorklet や WASM を入れるなら、テストの仕組みの拡張が必要**。
7. **音の確かめ方の限界**: Claude Code はヘッドレス Chrome で鳴っているか・エラーがないかまでは確かめられるが、**音を耳で聴くことはできない**。音の判断はユーザーがしている（例: v2.32 のウクレレの太さ）。音質の目標（Avenger 級）には、ユーザーが聴いて確かめる段取りを指示の中に入れる必要がある。
8. **ライセンス**: 録音は CC0 / CC BY だけ（`CREDITS.md` に記載）。ライブラリを入れるときも、ライセンスの決まりを作る必要がある。
9. **見つけた不具合**（ピアノの音色 4 つ）は、まだ直していない。
10. **画面の条件**: スマホの縦向き 480px 前後が最優先。シンセの画面（つまみ・マトリクス）の設計に強く効く。

---

## 13. 未確認事項と、確かめるのに必要な追加資料

| 未確認のこと | 確かめるには |
|---|---|
| 前のセッションでのユーザーの指示の原文 | 前のセッションの会話記録（Claude Code の記録ファイル）か、ユーザーの記憶 |
| 「DAW 化 第 1〜4 段階」（§176〜§179）を言い出したのが誰か | 同上 |
| 「録音は CC0 / CC BY だけ」「BGM のコードを触らない」がユーザーの指示か | ユーザーに確かめる |
| GitHub Pages の公開設定（ブランチとフォルダ） | リポジトリの Settings → Pages の画面 |
| GitHub の Issue | Issue の一覧（この調査では見ていない） |
| iPhone・Android の実機での音・タイミング・メモリ | 実機での確認（Safari の Web インスペクタ） |
| 長く遊んだときのメモリ（ノードを解放しないことの影響） | Chrome の Performance / Memory で計測 |
| 低速端末でのテンポのずれ（フレームの時計の問題） | 実機で、パターンと伴奏を数分鳴らして録音し、くらべる |
| localStorage の使用量 | 実際のユーザーの端末で `JSON.stringify(localStorage).length` |
| AudioWorklet / WASM が file:// で動くか（Blob URL・base64 の回避策を含む） | 小さな試作で、Chrome・Safari の file:// と Pages の https で試す |
| 「アルト」ウクレレの意図（コンサートでよいか） | ユーザーに確かめる |
| Avenger 級の「どこまで」が目標か（機能の優先順位・スマホで動くことの条件・CPU の上限） | ユーザーと ChatGPT で決める |

---

*このファイル（`HANDOFF_SYNTH_DAW_REPORT.md`）はリポジトリのいちばん上に置いた。commit も push もしていない。共有するときは、このファイルをそのまま渡せばよい。*
