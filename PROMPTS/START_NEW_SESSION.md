# START_NEW_SESSION.md — 新セッション開始用プロンプト

新しい Claude Code チャット/セッションで最初に貼るプロンプトです。
以下の「---貼り付けここから---」から「---貼り付けここまで---」の間をコピーしてください。

---

---貼り付けここから---

このリポジトリはスマホ向けブラウザRPG「究極ゴリラ ULTIMATE GORILLA」です。

まず以下のファイルをこの順番で読み、現在状況を完全に把握してください。

1. HANDOFF.md — 現在のバージョン・実装済み機能・未実装・次の推奨順
2. CLAUDE.md — このプロジェクトの開発ルール
3. GAME_DESIGN.md — 正式仕様書（Single Source of Truth）
4. TODO.md — 実装予定一覧
5. CHANGELOG.md — 変更履歴

把握したら、以下のルールを守って作業してください。

- 開発フロー: GAME_DESIGN.md更新 → TODO.md更新 → 実装 → CHANGELOG.md更新 → commit → push
- 言語: ES5（var、アロー関数なし、テンプレートリテラルなし）
- デバッグ: ?debug=1 URLのみでデバッグメニューを表示（通常URLでは絶対に出さない）
- セーブ互換: 新フラグは saveGame/loadGame/newGame すべてに追加する
- スマホUI優先: 縦画面480px前後、長押し抑制を維持する
- 既存機能（v0.7.1まで）を壊さない

公開URL: https://rokushakai.github.io/ultimate-gorilla/
デバッグURL: https://rokushakai.github.io/ultimate-gorilla/?debug=1
GitHub: https://github.com/rokushakai/ultimate-gorilla

詳細は DEVELOPMENT_CHECKLIST.md を参照してください。

---

---貼り付けここまで---

---

## 追加作業を依頼する場合の補足テンプレート

上記の基本プロンプトの後に、以下を追加してください：

```
今回やりたいこと：
[ここに具体的なやりたいことを書く]

例：
・最強装備「伝説のつるぎ」を隠しNPCから入手できるようにしたい
・図鑑で捕獲済みUMAをタップするとHP/攻撃力が見えるようにしたい
・〇〇のバグを直したい: [バグの詳細]
```

---

## セッション開始後のフロー

1. Claude が各ドキュメントを読む
2. 現在状況を把握したことを報告する
3. やりたいことを伝える
4. GAME_DESIGN.md / TODO.md への仕様追加を確認してから実装を始める
5. 実装完了後、CHANGELOG.md 更新 → commit → push → 結果報告
