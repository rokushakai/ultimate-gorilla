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

- 言語: 純粋な HTML/CSS/JavaScript ES5 のみ（`var`、アロー関数なし、テンプレートリテラルなし）
- 外部ライブラリ・ビルドツール・サーバー不要
- `file://` 直接起動 と GitHub Pages 両方で動作すること
- 相対パスを壊さないこと（`index.html` / `style.css` / `script.js` が同じフォルダにある）

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
