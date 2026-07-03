---
name: ultimate-gorilla-dev
description: |
  究極ゴリラ ULTIMATE GORILLA のプロジェクト専用開発スキル。
  このスキルを呼び出すと、プロジェクト固有の開発手順・ルール・注意点を参照できます。
---

# 究極ゴリラ 開発スキル

## プロジェクト概要

- **プロジェクト名**: 究極ゴリラ ULTIMATE GORILLA
- **種別**: スマホ向けブラウザRPG（UMA収集）
- **公開URL**: https://rokushakai.github.io/ultimate-gorilla/
- **GitHub**: https://github.com/rokushakai/ultimate-gorilla
- **デバッグURL**: https://rokushakai.github.io/ultimate-gorilla/?debug=1
- **現在バージョン**: HANDOFF.md を参照（常に最新状態を確認すること）

## 作業開始時の必読ファイル

このスキルを呼び出した後、必ず以下を読んでから作業を始めること：

1. **HANDOFF.md** — 現在バージョン・実装済み・未実装・次の推奨順
2. **GAME_DESIGN.md** — 正式仕様（Single Source of Truth）
3. **TODO.md** — 実装予定一覧
4. **CHANGELOG.md** — 変更履歴

## 技術スタック

- HTML / CSS / JavaScript ES5 **のみ**
- 外部ライブラリなし、ビルドツールなし、サーバー起動不要
- `index.html` を直接開くだけで動く（file:// 対応）
- GitHub Pages でも動作（相対パスで読み込み）
- IIFE パターン: `(function() { "use strict"; ... })()`

## ES5 制約（厳守）

```javascript
// NG: ES6+
const x = 1;
let y = 2;
const fn = () => {};
const str = `Hello ${name}`;

// OK: ES5
var x = 1;
var y = 2;
var fn = function() {};
var str = "Hello " + name;
```

## 開発フロー

```
GAME_DESIGN.md 更新 → TODO.md 更新 → 実装 → CHANGELOG.md 更新 → commit → push
```

## セーブデータの扱い方

- localStorage キー: `"ultimateGorillaSaveV2"`
- 新フラグ追加時は `saveGame()` / `loadGame()` / `newGame()` すべてに追加
- `loadGame()` は `!!data.flag` / `data.val || defaultVal` で古いセーブ対応

## デバッグメニュー制御

```javascript
// 通常URLでは false、?debug=1 では true
var DEBUG_MODE = window.location.search.indexOf("debug=1") >= 0;

// デバッグボタンは必ずこの条件で囲む
if (DEBUG_MODE) {
  html += '<button ...>デバッグ機能</button>';
}
```

## スマホUI ルール

- 幅480px縦画面を最優先
- モーダル: `.modal` / `.modal-box` クラスを使う
- ボタン: `.modal-btn` または `.shop-menu-btn` を使う
- 長押し抑制: CSS `-webkit-user-select: none` と JS contextmenu preventDefault 済み

## モーダルの開閉

```javascript
openModal("modal-id");   // 表示（hidden クラスを除去）
closeModal("modal-id");  // 非表示（hidden クラスを追加）
// 直接 classList 操作は使わないこと
```

## 既存機能（壊してはいけないもの）

v0.7.1 時点の実装済み機能：

- フィールド移動・ランダムエンカウント・戦闘6コマンド
- レベルアップ・まほう習得・転職
- 商人・宝箱・実家・酒場・仲間4人
- UMA図鑑・状態異常
- 究極ゴリラ捕獲条件（Lv99+ウクレレ+HP1-10+うたう）
- 5ページエンディング・称号・再視聴
- Lv99マイルストーンモーダル（初回のみ）
- デバッグメニュー（?debug=1）

## 大型改修の扱い

以下は大型改修扱い。専用ブランチで着手し、事前に GAME_DESIGN.md に仕様を書くこと：

- **横スクロールマップ**（§5.5）: renderField / RAW_MAP / カメラ / セーブ座標すべてに影響
- 複数マップ間移動
- 仲間フィールド追従

## commit メッセージ形式

```
feat: add [機能名] v[バージョン]
fix: [バグ内容] v[バージョン]
docs: update [ドキュメント名]
```

## 次の推奨実装順（HANDOFF.md の最新版を参照）

1. 最強装備のイベント入手
2. 図鑑のUMA詳細ステータス表示
3. ストーリーイベント・NPC会話
4. BGM/SE（Base64インライン埋め込み）
5. 仲間システム拡張
6. 横スクロールマップ（v0.9+, 大型改修）
