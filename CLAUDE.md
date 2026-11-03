# CLAUDE.md — 究極ゴリラ開発ルール

このファイルを読んだら、続けて **HANDOFF.md** も読んでください。
詳細仕様は **GAME_DESIGN.md**、実装予定は **TODO.md** にあります。

## 作業前に必ず読むファイル

1. HANDOFF.md — 現在のバージョン/実装済み/未実装/次の推奨順
2. GAME_DESIGN.md — 正式仕様(Single Source of Truth)
3. TODO.md — 実装予定と実装済み一覧
4. CHANGELOG.md — 変更履歴

## 開発フロー（この順番を守ること）

GAME_DESIGN.md 更新 → TODO.md 更新 → 実装 → CHANGELOG.md 更新 → commit → push

## 技術ルール

技術ルールは「既存コード」と「新しいシンセのコード」で分かれる（2026-11-04 のユーザーの方針・GAME_DESIGN §330）。

### A. 既存コード（RPG・ゲームセンター・レトロゲーム・楽器ゲーム・シーケンサー）
対象: `script.js`・`style.css`・`index.html`・`arcade.js`・`arcade-*.js`（`arcade-synth.js` もふくむ）・`samples/*.js`・`tests/*.js`

- 言語: 純粋な HTML/CSS/JavaScript ES5 のみ（`var`、アロー関数なし、テンプレートリテラルなし）
- 外部ライブラリ・ビルドツール・サーバー不要（そのまま配るファイル）
- 無意味な全面リファクタリングはしない。新しいシンセのエンジンを呼ぶ所だけ、ES5 のまま直す
- `file://` 直接起動 と GitHub Pages 両方で動作すること
- 相対パスを壊さないこと（`index.html` / `style.css` / `script.js` が同じフォルダにある）
- リリースのたびに `index.html` の CSS・JS の `?v=` を新しいバージョンにそろえる（HANDOFF.md の現在バージョンと同じ。テストで確認）。楽器サンプルを作りなおしたときは `arcade-melody.js` の `MELODY_SAMPLE_V` も上げる

### B. 新しいシンセのコード（シンセの高度化に必要な範囲だけ）
対象: シンセのエンジンのソース（予定: `synth/src/`）・その出力（予定: `synth/dist/`）・ビルドの設定・`tools/` の開発用の道具

- ES2015 以降・TypeScript・npm・ビルド（esbuild など）・AudioWorklet・WebAssembly・ライブラリを使ってよい。ライブラリは機能・音質・保守性・ライセンス・大きさで選び、選んだ理由を GAME_DESIGN に書く（ライセンスは MIT・BSD・Apache・ISC などの自由なものだけ。GPL/LGPL・NC は使わない）
- **出力（配るファイル）**: ビルドした結果を **ふつうの `<script>`（モジュールでない）で読める1ファイル** にして、リポジトリに commit する（GitHub Pages はビルドしないで配るだけ）。`file://` では ES モジュール（`type="module"`）・Blob URL のワークレット・`fetch` が使えないため（§330 で確かめた）
  - AudioWorklet のコードは **data: URL** で読みこむ（`file://` でも動く）。WASM は **base64 で埋めこんで** `WebAssembly.instantiate`（`fetch` しない）
  - SharedArrayBuffer（WASM のスレッド）は使わない（GitHub Pages では使えない）
- **外向きの約束を守る**: `window.UGSynth`（`note(patch, midi, out, when, vel, sec)` と `kill()`・`patchClean`・`voice`・`SEQ_PROG` など）を、ES5 の既存コードからそのまま呼べるようにする
- **AudioContext**: リアルタイムでは `UGMelody.audio.ctx` を使う（自分で作らない）。OfflineAudioContext でも同じエンジンが動くように作る
- **フォールバック**: AudioWorklet などが使えないときは、いまの Web Audio のノードの作りで鳴らす。高度な機能が使えなくても RPG 全体は起動する
- **テスト**: `node tests/run.js` で、出力したファイルも Node の vm（`tests/harness.js`）で読みこめるようにする。音の比べは `node tools/synth-golden.js`（Chrome が要る）
- **正式な動作環境**: GitHub Pages（HTTPS）と localhost（開発用の HTTP サーバー）。`file://` にも引き続き配慮する

## UI ルール

- スマホ縦画面を最優先
- 長押し時のテキスト選択・コンテキストメニューを出さない（既存の CSS + JS で抑制済み）
- モーダルは既存の `.modal` / `.modal-box` クラスを使う

## デバッグ

- `?debug=1` を URL に付けた時だけデバッグメニューを表示
- 通常 URL ではデバッグメニューを出さないこと
- デバッグ URL: https://rokushakai.github.io/ultimate-gorilla/?debug=1

## セーブデータ互換ルール

- localStorage キー: `"ultimateGorillaSaveV2"`
- 新しいフラグを追加したら `saveGame()` / `loadGame()` の両方に追加する
- `loadGame()` では `!!data.newFlag` のように古いセーブでも落ちないようにする
- `newGame()` で新規フラグをリセットすること

## 既存機能を壊さないこと

- v0.7.1 までの実装（エンディング5ページ・Lv99モーダル・仲間・図鑑など）を壊さない
- 大型改修（横スクロールマップ等）は先に GAME_DESIGN.md に仕様を書いてから着手する
- 迷ったら HANDOFF.md の「次の推奨実装順」を参照する

## commit/push ルール

- コミットメッセージ: `feat:` / `fix:` / `docs:` + 機能名 + バージョン
- 例: `feat: add level 99 milestone event v0.7.1`
- push 先: `origin main`
- **シンセの高度化（§330）のあいだは、commit・push・公開の前にユーザーの許可をもらう**（特に `origin main` への push は勝手にしない）。`HANDOFF_SYNTH_DAW_REPORT.md` は消さない
