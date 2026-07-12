# HANDOFF.md — 新セッション引き継ぎ資料

**新しい Claude Code セッションでは、最初にこのファイルを読んでください。**

---

## プロジェクト基本情報

| 項目 | 内容 |
|---|---|
| プロジェクト名 | 究極ゴリラ ULTIMATE GORILLA |
| 公開URL | https://rokushakai.github.io/ultimate-gorilla/ |
| GitHub リポジトリ | https://github.com/rokushakai/ultimate-gorilla |
| デバッグURL | https://rokushakai.github.io/ultimate-gorilla/?debug=1 |
| 現在バージョン | **v0.36.1** |
| ブランチ | main |

---

## ゲーム概要

スマホ1画面で延々とプレイできる **UMA収集ブラウザRPG**。

- フィールドを歩いてランダムエンカウント → 戦闘 → レベルアップ → 図鑑埋めのループ
- **最終目標**: 伝説のUMA「究極ゴリラ」を捕まえること
  - 捕獲条件: レベル99 + 女神のウクレレ所持 + 究極ゴリラのHP1〜10 + うたうコマンド使用
- HTML/CSS/JavaScript ES5 のみ。外部ライブラリ・ビルドツール・サーバー不要
- `index.html` をダブルクリックするだけで動く（file:// 直接起動対応）
- GitHub Pages でも動作（静的ホスティング）

---

## 重要ファイル一覧

| ファイル | 役割 |
|---|---|
| `index.html` | UI構造（モーダル・フィールド・ボタン） |
| `script.js` | ゲームロジック全体（ES5 IIFE パターン） |
| `style.css` | スタイル（スマホ縦画面優先） |
| `GAME_DESIGN.md` | 正式仕様書（Single Source of Truth） |
| `TODO.md` | 実装予定一覧（実装済みも記録） |
| `CHANGELOG.md` | 変更履歴 |
| `README.md` | プレイヤー向け説明 + 開発者向け入口 |
| `README.txt` | ZIP配布同梱用プレイヤー向け説明書 |
| `CLAUDE.md` | Claude Code への開発ルール |
| `HANDOFF.md` | このファイル（引き継ぎ資料） |
| `DEVELOPMENT_CHECKLIST.md` | 実装前後の確認チェックリスト |
| `PROMPTS/START_NEW_SESSION.md` | 新セッション開始用プロンプト |
| `.claude/skills/ultimate-gorilla-dev/SKILL.md` | Skill定義ファイル |

---

## 現在実装済みの主要機能（v0.28時点）

### ゲームプレイ
- フィールド移動（十字キー/スワイプ/キーボード）、ランダムエンカウント
- 戦闘コマンド: たたかう / まほう / アイテム / つかまえる / うたう / にげる
- レベルアップ・まほう習得
- 転職システム（部活9種）
- 商人（買う/売る/装備売却）
- 宝箱4箇所 + 女神のウクレレ専用宝箱 + 伝説宝箱3箇所（🌟⭐🪄）
- 実家（全回復・オートセーブ・伝説装備イベント）
- 酒場・仲間4人（ジュリタニ/シュリタニ/ノリオ/ハルミ）
- 状態異常（アレルギー・におい）
- UMA図鑑（発見済み/捕獲済みの3状態）
- **[v0.32.1] 2つ目固有コマンド安定化**（§90）
  - **`showCompanionSpecialMenu` 改善**: s1/s2/sback 押下直後に全ボタン `disabled=true`（二重実行確実防止）
  - **`actuallyStartBattle` 更新**: `battleDamageReduction = 0` を先頭に追加（戦闘開始時リセット）
  - **軽減ログ改善**: 「守りの効果でダメージが少し減った！」に変更
  - **確認済み**: clearCompanionCommandState / 戻る動作 / 究極ゴリラ戦 / 捕獲率 / gainExp
- **[v0.32] 仲間2つ目の固有コマンド追加**（§89）
  - **`#companion-special-menu`**: 固有コマンド選択サブメニュー（1つ目 / 2つ目 / 戻る）
  - **`showCompanionSpecialMenu(cid)`**: サブメニューを表示する関数
  - **ジュリタニ「🛡️ かばう」**: 次の敵攻撃20%軽減 → `state.battleDamageReduction = 0.20`
  - **シュリタニ「🕸️ 捕獲の網」**: 微ダメ（2〜4）+ 捕獲フレーバー
  - **ノリオ「📝 経験値メモ」**: 小ダメ（4〜8）+ EXPフレーバー
  - **ハルミ「🛡️ まもりの光」**: 次の敵攻撃25%軽減 → `state.battleDamageReduction = 0.25`
  - **`enemyTurn()` ダメージ軽減**: `battleDamageReduction` 適用後リセット（究極ゴリラ戦を除く）
  - **保護**: 捕獲率/gainExp/まかせるAI/究極ゴリラ戦/UIロック は変更なし
- **[v0.31.1] まかせるAI安定化**（§88）
  - **最終クランプ追加**: 全補正後に `specialChance = Math.max(0, Math.min(1, specialChance))` で確定クランプ。
  - **確認済み**: 古いセーブガード・`clearCompanionCommandState()` の両クリアパスともに問題なし。
- **[v0.31] 仲間AIの状況判断・まかせる改善**（§87）
  - **状況判断**: 敵HP≤15=攻撃優先 / ハルミ+プレイヤーHP≤40%=90%回復 / HP≥85%=25%回復
  - **前回行動記憶**: `state.lastCompanionAutoAction[cid]` で "special"/"attack" を戦闘中記憶、±0.10 補正
  - **`clearCompanionCommandState()`**: `lastCompanionAutoAction = {}` リセット追加
  - **保護**: `runSingleCompanionAction()` / `runCompanionSpecialAction()` / UIロック / BGM は変更なし
- **[v0.30] 仲間コマンド・バランス調整**（§86）
  - **「まかせる」比率仲間別化**: ジュリタニ55%/シュリタニ65%/ノリオ50%/ハルミ70% で固有コマンドを選びやすく。
  - **ジュリタニ「会心の構え」**: 上限28/会心率30%（倍率1.6維持）、ログ2行化。
  - **シュリタニ「捕獲アシスト」**: ダメージLv連動1〜3、ログ整理。
  - **ノリオ「経験値の眼」**: 上限12、ログ整理。
  - **ハルミ「小さな癒し」**: 上限25、HP満タン時に専用メッセージ。
  - **保護**: 捕獲率システム / `gainExp()` / UIロック / BGM は変更なし。
- **[v0.29.1] 「まかせる」ランダム行動化**（§85）
  - **`runCompanionAutoCommand(cid)` 新設**: 50/50 でランダム行動選択。選択前に `"🤝 [名前]にまかせた！ → [行動名]"` をログ出力。
  - **`executeCompanionCommand()` 変更**: `mode === "auto"` → `runCompanionAutoCommand()` に変更。
  - **ハルミ維持**: 「小さな癒し」選択時も `return false` で敵ダメージなし・勝利チェックなし。
  - **保護**: `runSingleCompanionAction()` / `runCompanionSpecialAction()` / UIロック / BGM は変更なし。
- **[v0.29] 仲間固有コマンド拡張**（§84）
  - **仲間コマンドUI 3択化**: `[⚔️ たたかう] [固有コマンド]` / `[🤝 まかせる (全幅)]`。`grid-column:1/-1` でスマホ最適レイアウト。
  - **ジュリタニ「💥 会心の構え」**: 強めの物理攻撃（上限30）、35%で大会心×1.6倍。
  - **シュリタニ「🪤 捕獲アシスト」**: 1ダメージ + 捕獲フレーバーログ。
  - **ノリオ「📈 経験値の眼」**: 小ダメージ（上限10）+ EXPフレーバーログ。
  - **ハルミ「✨ 小さな癒し」**: 主人公HP小回復（上限30）、敵ダメージなし。
  - **`runCompanionSpecialAction(cid)` 新設**: 固有コマンド実行。返値 true=敵HP0（ハルミは常に false）。
  - **`executeCompanionCommand()` 拡張**: `mode === "special"` 分岐追加。3ボタン全て disable。
  - **保護**: `runSingleCompanionAction()` / `clearCompanionCommandState()` / `setBattleLocked()` / BGM は変更なし。
- **[v0.28.1] 仲間コマンド選択安定化**（§83）
  - **`setBattleLocked()` 修正**: セレクターを `.submenu:not(#companion-command-menu) button` に変更。仲間コマンドボタンへの `disabled=false` 上書きが不要になった。
  - **`clearCompanionCommandState()` 新設**: キュー・フラグ・UI を一括クリアするヘルパー。`finishBattle()` から呼ばれる。
  - **`state.companionCommandActive/Locked`**: フェーズ管理フラグ（transient, セーブ対象外）。
  - **`executeCompanionCommand()` 強化**: `if (companionCommandLocked) return;` / `companionCommandLocked = true;` で二重実行を防止。
  - **保護**: `index.html` / BGM / セーブデータ / `winBattle()` / `enemyTurn()` は変更なし。
- **[v0.28] 仲間ごとの戦闘コマンド選択・第一段階**（§82）
  - **`runSingleCompanionAction(cid)`**: 仲間1人分の行動共通関数。返値 true=敵HP0。
  - **`startCompanionCommands()`**: コマンドキュー初期化。`e.final` → 見守りログ→敵ターン。仲間なし → 敵ターン。
  - **`showCompanionCommandForIdx(idx)`**: 「⚔️ たたかう」「🤝 まかせる」2択メニューを表示。
  - **`executeCompanionCommand(cid, mode)`**: ダブルクリック防止→行動実行→次の仲間 or 勝利/敵ターン。
  - **`finishBattle()` クリーンアップ**: `clearCompanionCommandState()` 呼び出しに集約（§83）。
  - **HTML**: `companion-command-menu` div を `index.html` に追加（`waza-menu` 直後）。
  - **保護**: `winBattle()` / `enemyTurn()` / `finishBattle()` / BGM は変更なし。
- **[v0.27.1] 仲間自動戦闘安定化**（§81）
  - **`runCompanionAutoActions()` 返値**: `true` = 仲間が敵を倒した、`false` = 生存 or スキップ。
  - **即ブレーク**: 各仲間の攻撃後に `if (e.hp <= 0) { break; }` を追加。次の仲間が不要に行動しない。
  - **`scheduleAfterPlayerAttack()` 判定強化**: `var companionKilled = runCompanionAutoActions()` → `if (companionKilled || ...)` でより明示的な勝利判定。
  - **敵ターン完全封鎖**: 返値 true の場合は `setTimeout(enemyTurn, 400)` に到達しない。
  - **保護**: `finishBattle()` / `gainExp()` / `winBattle()` / BGM は変更なし。
- **[v0.27] 仲間の戦闘自動参加**（§80）
  - **`scheduleAfterPlayerAttack()`**: プレイヤー攻撃後600ms→仲間自動行動→400ms→敵ターン。
  - **`runCompanionAutoActions()`**: 仲間を順番に自動行動。`e.final`（究極ゴリラ）時はスキップ。
  - **4仲間の行動**: ジュリタニ会心追撃 / シュリタニ捕獲補助 / ノリオEXP煽り / ハルミ魔法攻撃。
  - **トリガー**: `doFight()` / `castSpell()` 攻撃ブランチ / `useWaza()` 固定ダメージブランチ。
  - **除外**: にげる / アイテム / うたう / つかまえる / 回復まほう → 仲間行動なし。
  - **保護**: `finishBattle()` / `gainExp()` / `winBattle()` / `enemyTurn()` / BGM は変更なし。
- **[v0.26.1] フィールド仲間追従安定化**（§79）
  - **`resetPartyTrail()`**: `state.partyTrail = []` を一本化した共通関数。ES5関数宣言でホイスト済み。
  - **仲間変更時リセット**: `recruitCompanion()` / `dismissCompanion()` で加入/離脱直後にリセット。
  - **debug全ボタン対応**: companion UIデバッグ8本 + party-follow-on / trail-reset / 新設 clear-trail で `resetPartyTrail()` 統一。
  - **nullセーフ化**: `renderField()` で `state.partyTrail || []`、`movePlayer()` で `if (!state.partyTrail)` ガード。
  - **保護**: 仲間能力・加入/離脱処理・パーティ上限・戦闘・BGM は変更なし。
- **[v0.26] フィールド仲間追従表示**（§78）
  - **`state.partyTrail`**: 状態オブジェクトに追加（最大2エントリ `{x, y}`）。ロード時・マップ切り替え時にリセット。
  - **`movePlayer()`**: 有効な移動前に現在位置を `partyTrail.unshift()` でトップへ追加。2件を超えたら末尾を削除。
  - **`renderField()`**: ループ前に `trailMap` を構築。仲間0優先（逆順ループで上書き）。タイル描画でプレイヤー→仲間追従→地形の順で判定。
  - **リセット箇所**: `switchToSideMap()` / `switchToNormalMap()` / `loadGame()` で `state.partyTrail = []`。
  - **デバッグ §78**: 仲間2人追加ボタン + 軌跡リセットボタン。
  - **保護**: 仲間能力・加入/離脱処理・パーティ上限・戦闘・BGM・横スクロールマップは一切変更なし。
- **[v0.25] 酒場UI改善・仲間カード整理**（§77）
  - **仲間カード CSS**: `.companion-card` 系クラス群を `style.css` に追加。角丸ボーダー・半透明背景・左ボーダーセリフ枠。
  - **酒場3画面をカード化**: `renderTavernRecruit` / `renderTavernViewParty` / `renderTavernLeave` が `companion-card` 形式に統一。
  - **セリフ枠**: `companion-quote` で `currentColor` 左ボーダー + 薄背景 + 斜体。`getCompanionQuote()` の色がボーダーにも自動反映。
  - **状態ラベル**: 各カードに「✓ パーティ中」(緑) / 「待機中」(グレー) を右端表示。
  - **保護**: `getCompanionQuote()` / `recruitCompanion()` / `dismissCompanion()` / 仲間能力 は変更なし。
- **[v0.24.1] 仲間セリフ安定化・横スクロール制覇のみ反応追加**（§76）
  - **`getCompanionQuote(c)` null ガード**: `if (!c) return null` 追加。undefined フィールドも `&&` で安全。
  - **priority 3**: `isLegendaryEquipmentComplete() && !isFullyCompleted()` → `legendaryLine` 橙 `#ffb347`
  - **priority 7**: `isSideStoryCleared() && !state.gameCleared` → `sideClearLine` 薄紫 `#c8b4ff`
  - **デバッグ §76**: 通常 / 横スクロール制覇のみ / 伝説装備コンプのみ の3ボタン追加（計8状態テスト可能）
  - **保護**: BGM・仲間能力・加入処理・パーティ上限は変更なし。
- **[v0.24] 仲間4人の会話バリエーション追加**（§75）
  - **`getCompanionQuote(c)` ヘルパー**: 5段階状態判定（legendary > fullClear > dex > sideClear > clear）で `{text, color}` を返す。
  - **`COMPANION_DATA` 拡張**: 全4仲間に `sideClearLine`（薄紫）/ `dexLine`（水色）/ `legendaryLine`（明金）を追加。既存 `clearLine` / `fullClearLine` は維持。
  - **酒場「仲間を探す」「仲間を見る」**: `getCompanionQuote()` ベースの多段階セリフ表示に更新。
  - **冒険の記録「次の目標」**: 全達成時に酒場の仲間を促すメッセージへ更新。
  - **デバッグ §75**: 5状態テストボタン追加（クリアのみ/+横スクロール/+図鑑/完全達成/+伝説装備）。
  - **保護対象**: BGM制御・仲間能力値・加入処理・パーティ上限 は一切変更なし。
- **[v0.23] クリア後フィールドBGM軽量メロディ調整**（§74）
  - **`BGM_DATA.fieldClear`**: クリア後専用フィールドBGMエントリを追加。triangle音色・Cメジャー・約7.75秒ループ。穏やか余韻メロディ。BGM制御コードは一切変更なし。
  - **`getFieldBgmType()`**: `state.gameCleared` に応じて `"field"` / `"fieldClear"` を返すヘルパー。
  - **`updateBGM("field")` 全置換**: finishBattle / サウンドトグル / BGMトグル / エンディング後 / Dパッド / キーボードの全8箇所を `updateBGM(getFieldBgmType())` に変更。
  - **デバッグ §74**: クリア後フィールドBGMテストボタン追加（btn-debug-bgm-field-clear）。
  - **保護対象**: `stopBGMHard()` / `startBGM()` / `updateBGM()` / `_scheduleBGMLoop()` / `bgmSessionId` / `activeBgmNodes` / `activeBgmTimers` / `bgmMasterGain` はすべて未変更。
- **[v0.22] 図鑑未捕獲UMAヒント強化**（§73）
  - **UMA_DATA 全9種にヒントフィールド追加**: `hintArea`（出現エリア）/ `hintText`（発見ヒント）/ `hintCatch`（捕獲ヒント）。究極ゴリラは Lv99+ウクレレ+HP1〜10+うたう の専用ヒント。
  - **図鑑モーダルのヒント表示**: 未発見UMAに `hintArea`（📍）、発見済み未捕獲UMAに `hintText`（💡）を各カード内に表示。
  - **図鑑詳細モーダルの捕獲ヒント**: 通常UMAが発見済み未捕獲の場合、`hintCatch` を「💡 捕獲ヒント」セクションとして追加表示。
  - **UMA博士 未捕獲ヒント**: 図鑑未コンプ時に最初の未捕獲UMAの名前と `hintArea` / `hintText` を示すセリフを追加。
  - **攻略ペーパービュー屋 getProgressHint()**: クリア後・横スクロール制覇後・図鑑未コンプ時のヒントを最初の未捕獲UMAの名前/hintText/hintCatch で具体的に強化。
  - **冒険の記録 図鑑セクション**: 未コンプ時に「📖 図鑑でヒントを確認」ボタンを追加。クリックで記録モーダルを閉じ図鑑モーダルへ遷移。
  - **デバッグ §73**: 最初のUMAだけ未捕獲 / 最初のUMAだけ発見済み / 図鑑全リセット の3ボタン追加。
- **[v0.21] UMA図鑑コンプリート演出強化**（§72）
  - **`openDexCompleteModal()`**: 本文を3段構成に刷新。称号がクリア＋横スクロール制覇状態かどうかで分岐表示。
  - **UMA博士 図鑑コンプリート反応**: 「図鑑コンプリート＋未クリア」専用セリフ追加。クリア済みセリフも改定。
  - **冒険の記録 UMA図鑑セクション**: コンプリート/未コンプ時のメッセージを強化。
  - **デバッグ §72**: 図鑑セクション確認ボタン追加。
- **[v0.20.1] 伝説装備コンプリート安定化**（§71）
  - **`LEGEND_EQUIPS` 拡張**: 各エントリに `slot`/`itemId` フィールドを追加（全7種の装備スロットとIDを明示）。
  - **`isLegendaryEquipmentComplete()` 強化**: フラグ + `isEquipOwned()` の二段構成。旧セーブでも装備中/所持中なら入手済み扱い。
  - **冒険の記録 伝説装備リスト**: 各装備名に `✅`（入手済み）/ `・`（未入手）プレフィックス追加。
  - **NPC K 鍛冶屋セリフ**: コンプリート/未コンプ(残数)/未入手Lv30+/未入手低Lv の各状態を自然な複数行セリフに整備。
  - **デバッグ §71**: 伝説装備だけ未達成にする / 冒険の記録（伝説確認）の2ボタン追加。
- **[v0.20] 伝説装備コンプリート報酬**（§70）
  - **`isLegendaryEquipmentComplete()`**: 伝説装備7種すべての取得を確認するヘルパー関数。
  - **`#legendary-complete-modal`**: コンプリート報酬モーダル（2000G＋ラーメン×2）。
  - **称号「すべての伝説を集めし者」**: `isFullyCompleted() && isLegendaryEquipmentComplete()` の最高位称号（旧「究極とUMA図鑑を極めし者」は2番目へ）。
  - **冒険の記録 伝説装備セクション**: N/7進捗バー・各装備入手状況・コンプリート報酬受取状況。
  - **総合達成率**: 最大32pt（本編1+横スクロール12+UMA図鑑12+伝説装備7）に更新。
  - **NPC K 鍛冶屋**: コンプリート時専用セリフ・残数ヒント追加。
  - **デバッグ §70**: 全7種入手 / 未受取リセット / モーダル表示の3ボタン。
- **[v0.17] 究極ゴリラ捕獲クライマックス演出・クリア後リアクション強化**（§65）
  - **`doSingUltimateGorilla()`**: 捕獲成功ログを5行演出に刷新。
  - **`#capture-modal`**: エンディング前の捕獲成功モーダル。「王様へ報告する」でエンディングへ。
  - **総合称号**: クリア＋横スクロール制覇で「究極を歌い、聖域を越えし者」。`isSideStoryCleared()` で判定。
  - **NPC クリア後反応**: UMA博士・旅人・ゴリラ研究家・王様の使い 全員に専用セリフ。
  - **実家クリア後ヒント**: ランダム4種の専用ヒント。
  - **攻略ペーパークリア後**: priority=0 専用ブランチ（制覇有無で2パターン）。
- **[v0.17.1] 図鑑コンプリート報酬・仲間別クリア後セリフ**（§66）
  - **`isUmaDexComplete()`**: UMA全種捕獲判定ヘルパー。
  - **`#dex-complete-modal`**: 図鑑コンプリート報酬モーダル（3000G＋ラーメン×3）。
  - **称号6段階**: 「究極とUMA図鑑を極めし者」>「究極を歌い、聖域を越えし者」>「UMA図鑑を極めし者」>「森に歌を届けし者」>「究極に近づきし者」>「勇者の子孫」。
  - **仲間クリア後セリフ**: 酒場「仲間を見る」「仲間を探す」でクリア後に固有セリフ表示。
  - **UMA博士 図鑑コンプリート反応**: クリア後+図鑑完全で専用お祝いセリフ。
- **[v0.18] 冒険の記録・達成状況パネル**（§67）
  - **「📜記録」ボタン**: 上部メニューに追加。`btn-record`。
  - **`#record-modal`**: 達成状況一覧モーダル（称号/クリア/横スクロール/図鑑/報酬/次の目標/称号条件）。
  - **`getPlayerTitle()`**: 6段階称号判定を共通関数化。`renderStatus()` / `renderEndingPage()` から参照。
  - **ヘルプ**: 「🌟 クリア後の遊び方」セクション追加。
- **[v0.16.1] 究極ゴリラ捕獲チャンス演出・ガマン状態表示**（§64）
  - **`#battle-gaman-status`**: 戦闘画面にガマン中インジケーター（緑色テキスト）。`updateBattlePlayerStatus()` + `useWaza()` ガマン分岐で制御。
  - **`.btn-chance`**: うたうボタンの金色点滅アニメーション CSS。チャンス条件達成時のみ付与。
  - **`updateSingButtonChance(active)`**: `#btn-sing` に `.btn-chance` を付与/除去。`actuallyStartBattle` / `finishBattle` でリセット。
  - **`checkUltimateGorillaHpHint()`**: HP1〜10時に Lv99+ウクレレ / Lv不足 / ウクレレなし / 両方なし の4分岐メッセージ。チャンス時うたうボタン強調。
- **[v0.16] 捕獲支援技「ここはひとつガマン」**（§63）
  - **`state.gamanActive`**: 戦闘中一時フラグ。`finishBattle()` で必ず `false` にリセット。永続ステータスは変更しない。
  - **WAZA_DATA「gaman」**: `type: "weakenAttack"`。fixedDmg なし。
  - **doFight()**: 会心計算後に `gamanActive` なら 1/4（最低1）。ガマン中ログ分岐（通常/会心で別メッセージ）。
  - **useWaza()**: `type === "weakenAttack"` で固定ダメージ処理をスキップしフラグ操作。再使用は1ターン消費でメッセージ表示。
  - **finishBattle()**: `state.gamanActive = false` 追加。勝利/捕獲/逃走/敗北すべてで解除。
  - **openWazaMenu()**: 説明文更新・ガマン状態表示・type分岐レンダリング。
  - **デバッグ §63**: ガマン状態での戦闘開始2本 + 解除ボタン。
- **[v0.15.1] わざコマンド安定化・表示整理・究極ゴリラ捕獲テスト強化**（§62）
  - **WAZA_DATA**: `hazukashigatame` 表示名を「はずかし固め・小」に変更（まほうの「はずかし固め」と区別。内部ID変更なし）。
  - **actuallyStartBattle()**: 戦闘開始時に `#waza-menu` も `hidden` に追加するバグ修正。
  - **openWazaMenu()**: メニュー先頭に「削りすぎに注意！」説明テキスト追加。
  - **checkUltimateGorillaHpHint(e)**: 究極ゴリラHP1〜10時に「うたう」チャンスをログ表示するヘルパー関数（doFight/useWaza 共用）。
  - **useWaza()**: 残りHP表示ログ追加 + `checkUltimateGorillaHpHint()` 呼び出し。
  - **doFight()**: winBattle チェック後に `checkUltimateGorillaHpHint()` 呼び出し追加。
  - **デバッグ §62**: 究極ゴリラ HP12/10/1 で直接戦闘開始できるボタン3本追加。
  - **getProgressHint priority17 tier3**: 「はずかし固め・小」の名前を明記。
  - **index.html ヘルプ**: 技名を「はずかし固め・小」に更新、まほうとの違いを注記。
- **[v0.15] わざシステム（捕獲支援・低固定ダメージ技）**（§61）
  - **WAZA_DATA**: はずかし固め・小(1)/キドクラッチ(2)/カリツォー(3)/グーパンチ(4)。MPなし・防御無視・固定ダメージ。
  - **openWazaMenu() / useWaza(id)**: サブメニュー生成・固定ダメージ付与・敵ターン移行。openMagicMenu と同パターン。
  - **#btn-waza**: `#battle-menu` 最後にフル幅ボタン（grid-column:span 2、緑背景）。
  - **#waza-menu**: サブメニューdiv追加（class="hidden submenu"）。setBattleLocked は `.submenu button` を対象にしているため自動で無効化される。
  - **NPC_DATA UMA博士**: 捕獲数<4 時にわざヒント追加。Lv50+でHP調整ヒント追加。
  - **HOME_HINTS / getProgressHint priority17 tier3**: わざコマンド活用法を追記。
  - **index.html ヘルプ**: 「🥊 わざコマンドについて」セクション追加（技一覧・使用目的を明示）。
- **[v0.14.1] 横スクロール編クリア後導線・究極ゴリラ捕獲誘導**（§60）
  - **isSideStoryCleared()**: `sm.stageCleared["6"] && sm.defeatedEnemies["6:34,2"]` で横スクロール編制覇判定。
  - **renderStatusBody()**: 「横スクロール編 ✅ 制覇済み / 進行中」行追加。称号を「チンパンジーの聖域の覇者」→「ゴリラの世界の外側を見た者」に格上げ。
  - **NPC_DATA**: UMA博士/旅人/ゴリラ研究家/王様の使い に横スクロール編制覇後の専用セリフ追加（究極ゴリラ捕獲誘導）。
  - **HOME_HINTS**: 横スクロール編制覇後の誘導ヒント2件追加。openHomeModal に isSideStoryCleared() 固定ヒント追加。
  - **getHintPriority()/getProgressHint()**: priority17 新設（横スクロール編制覇済み・究極ゴリラ未捕獲）。priority9 を「s6クリア済みだがチンパンジー未撃退」限定に変更。
  - **openStage6GoalModal()**: チンパンジー撃退済みのボディに「究極ゴリラはまだ君の歌を待っている」文を追加。
  - **デバッグ**: 横スクロール編制覇状態にする / 究極ゴリラ捕獲条件セット(Lv99+ウクレレ) / 究極ゴリラ未捕獲状態に戻す の3ボタン追加。
  - **index.html ヘルプ**: 「🌿 横スクロール編と本編目的」セクション追加（横スクロール編≠ゲームクリア・究極ゴリラ捕獲条件を明示）。
- **[v0.14] 横スクロールステージ6「チンパンジーの聖域」実装**（§59）
  - **究極チンパンジー**: HP1500/ATK72/DEF32/EXP3000、canCapture:false。位置: 中央路 x=34(キー: "6:34,2")。
  - **SIDE_STAGE_DATA[6]「チンパンジーの聖域」(40×5)**: 木立5路構成。宝箱4個、固定敵3体、NPC2人、究極チンパンジー。
  - **ステージ5ゴールモーダル**: 予告テキスト削除→「🌿 チンパンジーの聖域へ進む」ボタン追加。
  - **openStage6GoalModal()**: 撃退800G+ラーメン / 未撃退300G / 差分500G+ラーメン。
  - **openStage6NpcModal()**: 聖域の守護者(y=2) / 迷い込んだ修行者(y=1)。撃退前後セリフ分岐。
  - **renderStatusBody()**: stage6進捗2行 + 称号「聖域を越えし者」「チンパンジーの聖域の覇者」追加。
  - **getHintPriority()/getProgressHint()**: priority16新設(s5クリア・s6未クリア)、priority9を6ステージ版に更新。
  - **saveGame/loadGame**: `sideMapStage6Reward` 追加。
  - **openSideGateModal**: 「5ステージ」→「6ステージ」に更新。
  - **デバッグ**: stage6-enter/near-goal/clear-reset/set-ultimatechimgori/強制ENC/items-reset/return-H/goal-H/ゴールモーダル表示追加。
  - **index.html ヘルプ**: 「🌿 ステージ6「チンパンジーの聖域」」セクション追加。
- **[v0.13] 横スクロールステージ5「黒い城」実装**（§57）
  - **ラスボス級ゴリラ**: HP1000/ATK58/DEF22/EXP1400、canCapture:false。位置: 中央路 x=33(キー: "5:33,2")。
  - **SIDE_STAGE_DATA[5]「黒い城」(40×5)**: 城壁5路構成。宝箱5個、固定敵3体、NPC2人、ラスボス級ゴリラ。
  - **ステージ4ゴールモーダル**: 「🏰 黒い城へ進む」ボタン追加。
  - **openStage5GoalModal()**: 撃退500G+ラーメン / 未撃退200G / 差分300G+ラーメン。
  - **openStage5NpcModal()**: 城門前の兵士(y=2) / 逃げ腰の旅人(y=1)。撃退前後セリフ分岐。
  - **renderStatusBody()**: stage5進捗2行 + 称号「黒い城を越えし者」「黒い城の覇者」追加。
  - **getHintPriority()/getProgressHint()**: priority15新設(s4クリア・s5未クリア)、priority9を5ステージ版に更新。
  - **saveGame/loadGame**: `sideMapStage5Reward` 追加。
  - **ゴールモーダル予告テキスト**: 「チンパンジーの聖域」への言及のみ(ステージ6未実装)。
  - **デバッグ**: stage5-enter/near-goal/clear-reset/set-lastbossgori/強制ENC/items-reset/return-H/goal-H/ゴールモーダル表示追加。
  - **index.html ヘルプ**: 「🏰 ステージ5「黒い城」」セクション追加。ゲート説明を「5ステージ」に更新。
- **[v0.13.1] ゴール側G/H配置変更**（§58）
  - **全5ステージの終端を `b→H→G` から `b→G→H` に変更**: x=37→G(ゴール), x=38→H(帰還ゲート)。goalX=38 は維持。
  - **プレイフロー改善**: ボスを倒してそのまま進むとゴール🏁→帰還ゲート🏠の自然な順で到達できる。
  - **デバッグ更新**: toastメッセージをG@37/H@38の新位置に更新。
  - **index.html ヘルプ更新**: 帰還ゲート位置を「ゴール通過後(x=38)」に更新。
- **[v0.12.1] ゴール側帰還ゲート追加**（§56）
  - **全4ステージのゴール直前にH追加**: 元は x=37→H, G@x=38。§58 v0.13.1 にてG/H位置を入れ替え済み。
  - **デバッグ強化**: 全4ステージにゴール側H付近移動ボタン追加(x=36,ボス撃退済みにして移動)。ステージ4スタート側Hボタン追加。
- **[v0.12] 横スクロールステージ4「ゴリラ山道」実装**（§55）
  - **SIDE_STAGE_DATA[4]「ゴリラ山道」(40×5)**: 岩場5路構成。宝箱4個、固定敵3体、NPC2人、大魔王ゴリラ。
  - **大魔王ゴリラ**: HP700/ATK46/DEF16/EXP850、canCapture:false。位置: 中央路 x=33(キー: "4:33,2")。
  - **ステージ3ゴールモーダル**: 「⛰️ ゴリラ山道へ進む」ボタン追加。
  - **openStage4GoalModal()**: 撃退350G+ラーメン / 未撃退120G / 差分230G+ラーメン。
  - **openStage4NpcModal()**: 老人(y=2) / 旅人(y=1)。撃退前後セリフ分岐。
  - **renderStatusBody()**: stage4進捗2行 + 称号「山道を越えし者」「ゴリラ山道の覇者」追加。
  - **getHintPriority()/getProgressHint()**: priority14新設(s3クリア・s4未クリア)、priority9を4ステージ版に更新。
  - **saveGame/loadGame**: `sideMapStage4Reward` 追加。
  - **デバッグ**: stage4-enter/near-goal/clear-reset/set-daimaougori/強制ENC/items-reset/ゴールモーダル表示追加。
  - **index.html**: ヘルプに「⛰️ ステージ4」セクション追加。ゲート説明を「4ステージ」に更新。
- **[v0.11.3.2] ゴールモーダルJS生成ボタン方式 + 帰還ゲート位置修正**（§54）
  - **ゴールモーダルボタン JS 生成方式**: `modal-side-goal` の静的ボタン4つ削除。各ゴール関数内で `document.createElement` でボタン生成・アタッチ。`hidden` 依存を廃止し実機不具合を根本解消。
  - **`returnToNormalMapFromSide()`**: 両モーダルを閉じてから `switchToNormalMap()` を呼ぶ共通関数。
  - **帰還ゲート H 位置**: x=0 → x=2 へ移動（ステージ1/2/3すべて）。スタート(x=1)のすぐ右。
  - **DEBUG console.log**: G/H タイル検知時に `[DEBUG]` ログ（`?debug=1` 時のみ）。
  - **デバッグボタン更新**: 帰還ゲート移動を x=2 に更新 + ゴール/帰還モーダル直接表示ボタン4つ追加。
- **[v0.11.3] 横スクロール帰還導線修正**（§53）
  - **switchToNormalMap() 戻り位置修正**: 通常マップ(2,4)へ戻す。🌀ゲート(2,3)の1マス下 = 再接触ループを防止。
  - **🏠帰還ゲートタイル追加**: 各ステージ x=0 に `'H'` タイル（§54 で x=2 に修正済み）。
  - **帰還ゲートモーダル**: `modal-side-return-gate`。踏むと「通常マップへ戻る」or「やめる」の確認。
  - **ヘルプ追記**: 「🏠 横スクロールマップから戻る方法」セクション追加。
  - **NPC/ヒント更新**: UMA博士・ヒント屋に帰還ゲートの案内追記。
  - **デバッグボタン追加**: ステージ1/2/3帰還ゲートへ移動 / 通常マップへ強制帰還。
- **[v0.11.2] 横スクロールマップ入口ゲート・道案内改善**（§52）
  - **🌀ゲートタイル**: 通常マップ(2,3)に`'V'`タイル追加。踏むとモーダルが開き横スクロールへ移動できる。
  - **ゲートモーダル**: 初回は詳細説明付き、2回目以降は短い確認のみ（`gateExplained` フラグで制御）。
  - **gateExplained フラグ**: `state.sideMap.gateExplained`。saveGame/loadGame/newGame 対応済み。
  - **NPC台詞更新**: UMA博士・旅人・王様の使いにゲート場所ヒント追加。UMA博士にUMA捕獲ヒント追加。
  - **ヒント屋 priority 13**: 横スクロール未訪問+Lv40未満でゲート案内ヒントを返す。
  - **ヘルプ更新**: 「🌀 横スクロールマップへの行き方」セクション追加。
  - **デバッグボタン追加**: 🌀 ゲートタイル付近へ移動 / 🔄 ゲート説明フラグリセット。
  - **GAME_DESIGN.md §52**: ゲート仕様・将来の捕獲補助技デザインメモを追記。
- **[v0.11.1] ステージ3安定化・デバッグ補強・ステージ4予告**（§51）
  - **固定敵ID確認済み**: powerharassmentsenpai / wanderingman / deathmatch はすべて NON_UMA_DATA に実在。
  - **triggerFixedEncounter 安全化**: 未定義IDに console.warn + triggerEncounter() フォールバックを追加。
  - **validateSideFixedEncounters()**: SIDE_FIXED_ENCOUNTERS のID整合性チェック関数（debug=1専用）。
  - **デバッグ2ボタン追加**: 🏚️ ステージ3宝箱・固定敵リセット / 🧪 固定敵IDチェック。
  - **ステージ4「ゴリラ山道」予告**: openStage3GoalModal の全報酬受取後テキストに大魔王ゴリラへの予告を追加。
  - **getProgressHint priority 9**: ステージ4・大魔王ゴリラへの言及を含む内容に更新。
  - **CSS確認済み**: aspect-ratio: 9/5 が5行ステージで正しく機能（変更不要）。
  - **GAME_DESIGN.md §51**: ステージ4構想・安定化項目の正式仕様を追記。
- **[v0.11] 横スクロールステージ3「古びた町はずれ」実装**（§50）
  - **魔王ゴリラ**: HP400/ATK34/DEF11/EXP500、canCapture:false。ステージ3専用固定ボス。
  - **SIDE_STAGE_DATA[3]「古びた町はずれ」(40×5)**: 廃墟・荒れ地5路構成。宝箱4個、固定敵3体、NPC2人、ボス1体。
  - **openStage3GoalModal()**: 魔王撃退有無でセリフ・報酬分岐（220G+ラーメン / 80G / 差分140G+ラーメン）
  - **openStage3NpcModal()**: 老人(y=2) / 怪しい旅人(y≠2)。魔王撃退前後でセリフ分岐。
  - **renderSideField() / moveSidePlayer()**: 動的マップサイズ対応（rows.length / rows[0].length で計算）。
  - **renderField()**: CSS `--rows` をステージ行数に合わせて動的セット（5行ステージ対応）。
  - **ゴールモーダル**: 「🏚️ 古びた町はずれへ進む」ボタン追加。ステージ2クリア後に表示。
  - **getHintPriority()**: 優先度12追加（s2クリア・s3未クリア）。優先度9を全3ステージクリア時に更新。
  - **renderStatus()**: ステージ3進捗2行追加。称号「町はずれの覇者」「町はずれを越えし者」追加。
  - **セーブ/ロード**: sideMapStage3Reward キー追加。
  - **SIDE_FIXED_ENCOUNTERS**: ステージ3固定敵3体追加（powerharassmentsenpai/wanderingman/deathmatch）。
  - **デバッグ**: 5ボタン追加（stage3-enter/near-goal/clear-reset/set-maougori/maou-gorilla-encounter）。
  - **ヘルプ**: 「🏚️ ステージ3「古びた町はずれ」」セクション追加。
- **[v0.10.1] 攻略ペーパービュー屋ヒント拡張・ステージ別固定敵改善**（§49）
  - SIDE_FIXED_ENCOUNTERS マップ: ステージ1/2のタイル'e'に出す敵IDを固定指定
    - stage1: wilddog(31,1)、bumpman(14,2)  |  stage2: wannabeninja(2:14,1)、bandit(2:12,2)、oni(2:32,2)
  - moveSidePlayer() 'e'タイル: SIDE_FIXED_ENCOUNTERSにキーがあれば triggerFixedEncounter() を使用
  - getHintPriority(): 横スクロール進捗チェック追加、優先度を0〜11に拡張
    - 9: S1&S2クリア済み / 10: S1クリア・S2未クリア / 11: 横スクロール訪問済み・S1未クリア
  - getProgressHint(): 優先度10/11はボス・中ボス撃退フラグで内容が分岐
  - renderHintResult(): 表示形式「📄 〇〇を購入した！(NNG)」に変更、括弧除去
  - デバッグ: 「📰 ヒントショップを開く」ボタン追加
  - ヘルプ: 固定敵ステージ別説明追加、「📰 攻略ペーパービュー屋について」セクション追加
- **[v0.10] 横スクロールステージ2「あやしい森」実装**（§48）
  - ボスゴリラ追加: HP250/ATK26/DEF8/EXP290、canCapture:false
  - SIDE_STAGE_DATA[2]「あやしい森」(40×3): 上/中/下路3ルート、宝箱3個、固定敵3体、NPC2人
  - getSideKey() ヘルパーでステージ間イベントキー衝突防止。ステージ2キー: "2:x,y"
  - ゴールモーダルにステージ切り替えボタン「🌲 あやしい森へ進む」追加
  - openStage2GoalModal(): 報酬分岐（150G+お弁当 / 50G / 差分100G+お弁当）
  - openStage2NpcModal(): ボスゴリラ撃退前後セリフ分岐
  - ステータス画面: ステージ2進捗・称号「森の制覇者」追加
  - v0.9.1互換補正: 古いセーブの stage1RewardLevel=0 を読込時に自動補正
  - セーブキー追加: `sideMapStage2Reward`
  - ヘルプ: 「🌲 ステージ2「あやしい森」」セクション追加
  - デバッグ(debug=1): 5ボタン追加（あやしい森移動/ゴール直前/フラグリセット/ボス撃退済み/強制ENC）
- **[v0.9.3] 横スクロールステージ1クリア体験強化**（§47）
  - ゴール演出強化: 中ボス撃退有無で2パターン分岐（撃退済み→100G+パン / 未撃退→30G）
  - 差分報酬: 中ボス未撃退クリア後→中ボス撃退→再ゴール→追加70G+パン
  - `state.sideMap.stage1RewardLevel` (0/1/2) で報酬状態管理。セーブキー: `sideMapStage1Reward`
  - ステータス画面に「横スクロール進捗」セクション追加（クリア済み/撃退済み/横スクロール称号）
  - 横スクロールNPCセリフ4パターン分岐（stage1Cleared × midbossDefeated）
  - 通常マップ旅人(R)にステージ1クリア後セリフ追加（「あやしい森」予告）
  - 全報酬受取後のゴールモーダルにステージ2（あやしい森）予告を表示
  - ヘルプ: 「🏁 横スクロールマップのゴールとクリア」セクション追加
  - デバッグ: ステージ1クリアフラグON / 中ボス撃退済みにする ボタン追加
- **[v0.9.2.1] 中ボスゴリラ捕獲不可・実機確認補強**（§46）
  - `canCapture: false` フラグ + `actuallyStartBattle()` コピー + `attemptCapture()` ブロック
  - captureRate:0 + clamp下限0.05 の組み合わせによる5%捕獲チャンス問題を解消
  - gainExp() ログ改善: "(元EXP → 最終EXP)" 表示でノリオ効果を明示
  - 横スクロールNPC (案内人/旅人)が `defeatedEnemies["36,1"]` で撃退前後セリフ分岐
  - ゴリラ研究家: 中ボスゴリラ撃退前後でヒント変化
  - ヘルプ: 「💢 ボス系モンスター」セクション追加、ノリオ説明→「経験値2倍」に更新
  - デバッグ追加: EXPを0にする (ノリオ効果確認用)
- **[v0.9.2] のりお指令②: 中ボスゴリラ・敵再調整・のりお効果変更**（§45）
  - 新タイル: `b`(💢 中ボスゴリラ固定戦闘) — SIDE_STAGE_DATA row1 x=36 に配置
  - `triggerFixedEncounter(enemyId)`: 固定ID敵を起動する新関数
  - `gainExp(baseExp)`: EXP取得ヘルパー。のりお同行時に2倍処理+ログ
  - のりお能力: fleeMod:0.15 → expMod:2 (逃走→経験値2倍) + emoji/セリフ変更
  - 敵HP/EXP全体底上げ: 序盤×1.5〜1.6、中盤×1.7、後半×2.0〜2.1、UMA×1.2
  - 中ボスゴリラ: HP150, ATK20, DEF5, EXP160, captureRate:0, 専用逃走メッセージ
  - winBattle/doRun/attemptCapture/doSingUltimateGorilla → gainExp 統一
  - actuallyStartBattle: `customEscapeMsgs` を state.enemy にコピー
  - NPC会話: UMA博士・旅人・ゴリラ研究家・横スクロールNPC に中ボス/EXPヒント追加
  - デバッグ追加: 中ボス強制ENC / ノリオ仲間化 / 中ボス撃退フラグリセット
- **[v0.9.1] 横スクロールマップ探索性アップデート**（§44）
  - 縦移動を有効化(y=0〜2)。迂回路A(x=11-13)・迂回路B(x=27-29)
  - 新タイル: `G`(🏁 ゴール), `p`(🧑 旅人NPC)
  - 固定敵撃破追跡: `defeatedEnemies` + `finishBattle()` フック + `sideMapPendingFixedKey`
  - ゴールモーダル(`#modal-side-goal`): 50G報酬・`stageCleared`・「通常マップへ戻る」
  - マップ再設計: 高路/メイン/低路の3ルート、宝箱5個、固定敵2個
  - saveGame/loadGame: `sideMapDefeated`, `sideMapCleared` 追加
  - デバッグ追加: スタート/ゴール直前/クリアフラグリセット
- **[v0.9] 横スクロールマップ試作**（§43）
  - `state.mapMode: "normal"|"side"` + `state.sideMap {x,y,stage,openedChests}`
  - ステージ1「はじまりの草原」(40×3 タイルマップ) — g/f/#/~/c/n/m/e/. タイル
  - `renderField()` がスマートディスパッチ: side時に --cols/--rows 更新 → `renderSideField()`
  - `moveSidePlayer()`: 衝突/宝箱/NPC/商人/固定戦闘/ランダム戦闘
  - `switchToSideMap()` / `switchToNormalMap()` でモード切り替え
  - デバッグボタン2個: 「横スクロールマップへ移動」「通常マップへ戻る」
  - saveGame / loadGame: mapMode + sideMap 追加(古いセーブは デフォルト値で補完)
- **[v0.8.8.1] 緊急バグ修正**（§42）
  - iOS セーフエリア対応: `#game` に `padding-top: env(safe-area-inset-top)` 追加でノッチ裏隠れを解消
  - 攻略ペーパービュー屋: `p.money` → `p.gold` 修正 (undefinedG・購入不可)
  - `.shop-row .shop-menu-btn` に `width: auto` を追加しラベル縦崩れを修正
- **[v0.8.8] NPCセリフ拡充・攻略ヒント強化**（§41）
  - NPC_DATA 全5NPC のセリフをレベル段階別に拡充（D/R/K/E/S）
  - UMA博士: UMA vs 通常モンスター説明、メタルゴリラヒント、lv<5/lv5-9/lv≥10 分岐
  - 旅人: lv≥15 段階追加、逃げ作戦・装備重要性・宝箱ヒント強化
  - 鍛冶屋: lv<10 向けのらいぬ対策、lv<30 伝説テーザー、lv20-39 装備アドバイス
  - ゴリラ研究家: lv<10 ゴリラ種類説明、lv10-49 メタルゴリラヒント、クリア後強化
  - 王様の使い: クリア前をlv≥50/else 2段階化、逃げても良いことを明示
  - HOME_HINTS 6件追加（計19件）: のらいぬ逃げ・レベルアップ効果・装備・メタルゴリラ等
  - ヘルプ画面: 「💡 戦闘のコツ」「👾 モンスターの種類」2セクション追加
  - ヘルプ画面: 「逃げられた！」→「逃げていった！！」修正
  - デバッグ: Lv.1/Lv.5/Lv.10 設定ボタン追加（NPC会話テスト用）
- **[v0.8.7] のりお指令: モンスター追加・のらいぬ調整・戦闘メッセージ改善**（§40）
  - 通常モンスター26体追加(序盤4・中盤8・後半14)。minLevel/weight で出現バランス調整
  - のらいぬ強敵化: HP 13→18, 攻撃 5→8, 防御 1→2, EXP 7→12, startMsg追加
  - HP0時「○○に逃げられた！」→「○○は逃げていった！！」ランダムバリエーション4種
  - startMsgフィールド: 出現直後に専用メッセージを表示できるモンスターデータ機能
  - 旅人NPC にLv10未満向け逃げヒント追加
  - デバッグ: のらいぬ強制エンカウント / ランダム通常モンスター強制エンカウント
- **[v0.8.6.3] BGMノード完全停止・予約音キャンセル修正**（§39）
  - 根本原因: `activeBgmNodes` に `osc` 単体保存 → `gain` スケジュール済み音量変化をキャンセル不能。`activeBgmTimers` 未実装 → 旧タイマーが発火して二重ループ発生（約5秒重複）
  - `stopBGMHard()` 新設: ①セッションID更新 ②全タイマー clearTimeout ③gain=0+disconnect ④マスターゲイン破棄
  - `bgmSessionId` 追加: 古いタイマーコールバックをセッション比較でスキップ
  - `activeBgmNodes` を `{osc, gain}` ペアで追跡。`activeBgmTimers` を実装
  - `stopBGM()` は `stopBGMHard()` の後方互換エイリアスに変更
  - デバッグボタン「BGM完全停止(stopBGMHard)」追加
- **[v0.8.6.2] BGM即時切り替え修正**（§38）
  - 根本原因: `osc.stop(t+dur)` 呼び済みノードへの `stop()` 再呼び出しが `InvalidStateError` → try-catch握りつぶしで旧BGMが止まらなかった
  - `bgmMasterGain` 変数追加: 全BGMノードの共通出力先 GainNode
  - `getOrCreateBgmMasterGain()`: セッションごとにマスターゲインを作成
  - `stopBGM()`: v0.8.6.2時点では `bgmMasterGain.disconnect()` → null化で即消音（v0.8.6.3でエイリアスに変更）
  - `_scheduleBGMLoop()`: `gain.connect(master)` でマスターゲイン経由に変更
  - `DEBUG_MODE` 時: `[BGM] immediate switch/stop/play` のコンソールログ出力
- **[v0.8.6] BGM重なり修正 + 攻略ペーパービュー屋**（§36, §37）
  - BGM管理: `bgmGeneration`（世代番号）/ `activeBgmNodes[]`（ノード追跡）追加
  - `stopBGM()`: `bgmGeneration++` + オシレーターノード一括停止
  - `_scheduleBGMLoop(type, startTime, gen)`: 世代チェック2箇所、ノード追跡
  - `startBGM()`: `stopBGM()` 後に `gen = bgmGeneration` をキャプチャしてループへ渡す
  - 攻略ペーパービュー屋 📰 NPC: フィールド (4,3)、マップ文字 `N`
  - ヒント判定: `getHintPriority()`（優先度0〜8）/ `getProgressHint(tier)`（1〜3段階）
  - 料金: 10G(ぼんやり) / 50G(具体的) / 100G(ほぼ答え)
  - モーダル: `hint-shop-modal`（index.html）
- **[v0.8.5] Lv99到達演出・成長達成感アップ**（§35）
  - `level99` SE（ファンファーレ）追加
  - Lv99到達モーダル強化（ドラマチック叙述）
  - ステータス称号「究極に近づきし者」（Lv99未クリア時）
  - 実家ヒントを文脈化、UMA博士NPC Lv99/クリア後セリフ追加
  - `eventFlags.level99Reached` フラグ追加
  - デバッグ: Lv98にする / 次の戦闘でLvUP / Lv99フラグリセット
- **[v0.8.4] BGM/SE・サウンド設定**（§34）
  - Web Audio API ベース。外部ファイル不要
  - BGM 3種(field/battle/ending)、SE 9種
  - 設定画面に 🔊/🎵/🔔 トグルボタン。ニューゲームでリセットされない
  - スマホ自動再生制限対応（初回ユーザー操作で AudioContext 初期化）
  - サウンド設定キー: `"ultimateGorillaSoundV1"`
- **[v0.8.3] 伝説装備追加・NPCヒント連動イベント**（§33）
  - キグナスのかぶと (防御+12 HP+5): ✨宝箱(X, 9,6)、Lv40以上
  - ドラゴンのたて (防御+26 HP+8): 王様の使い(S)NPC、gameCleared後に接触で授与
  - `cygnuskabuto` / `dragonshield` を isLegendary: true に変更・強化（商人購入不可）
  - LEGEND_EQUIPS: 5種 → 7種
  - `state.eventFlags.cygnusHelmetGot` / `dragonShieldGot` を追加
- **[v0.8.2] フィールドNPC会話システム**（§32）
  - 固定NPC 5人: 🔎UMA博士(2,2) / 🧳旅人(5,5) / 🔨鍛冶屋(10,2) / 📚ゴリラ研究家(6,9) / 👑王様の使い(10,1)
  - NPC接触で会話モーダル表示（npc-modal）
  - 状態別セリフ: level・hasUkulele・gameCleared・eventFlags・companions で動的切り替え
- **[v0.8.1] 図鑑詳細表示**（§31）
  - 発見済み・捕獲済みUMAをタップで詳細モーダル表示
  - No./名前/レア度/分類/捕獲状態/HP/攻撃力/防御力/捕獲率/経験値/売却価格/説明文
  - 究極ゴリラ特別表示（捕獲前警告・捕獲後金枠）
  - メタル系セクション（3種常時表示・タップで詳細）
  - 全UMA9種 + メタル3種に descフィールド（フレーバーテキスト）追加
  - 図鑑上部に発見/捕獲進捗表示
  - ステータス画面の図鑑進捗を2行（発見N/M・捕獲N/M）に更新
- メタルゴリラ系（高経験値ボーナス敵）

### 伝説装備（v0.8 §30）
- ペガサスのよろい (防御+14 HP+5): 🌟宝箱(A)、Lv50以上
- 六連のたて (防御+20): 実家で休む、Lv60以上
- 宇宙のかぶと (防御+15): ⭐宝箱(C)、女神のウクレレ所持
- 如意棒 (攻撃+58): 🪄宝箱(J)、Lv70以上＋ジュリタニ同行
- アンドロメダの鎖 (攻撃+44): 実家で休む、クリア後
- `state.eventFlags` でイベント管理（セーブ/ロード/ニューゲーム対応）
- 装備画面 ★伝説マーク・売却不可・ステータス画面に進捗(N/5)

### クリア・演出
- 究極ゴリラ捕獲条件（Lv99 + ウクレレ + HP1〜10 + うたう）
- 5ページ構成エンディングモーダル（§28）
- クリア称号「森に歌を届けし者」
- エンディング再視聴（設定画面・ステータス画面）
- 図鑑の究極ゴリラ特別表示（金枠・「伝説のUMA」）
- レベル99到達マイルストーンモーダル（§3.8）
  - 初回のみ表示（`level99Shown` フラグ）
  - ウクレレ所持状況に応じて動的コンテンツ切替

### デバッグ（`?debug=1`）
- Lv99にする / 女神のウクレレ入手 / 究極ゴリラHP5で強制エンカウント
- 敵HP5設定（戦闘中のみ）/ 9999G追加 / クリアリセット
- エンディングを再生 / クリア済みにする / Lv99演出を再生
- **[v0.8] 伝説装備を全入手(7/7) / 伝説装備フラグをリセット**
- **[v0.8.5] Lv.98にする / 次の戦闘でLvUP(EXP設定) / Lv99到達フラグをリセット**
- **[v0.8.4] SEテスト / フィールドBGM / バトルBGM / エンディングBGM / BGM停止**

---

## 現在未実装の主要機能

| 機能 | 状態 |
|---|---|
| モンスター追加・のらいぬ調整・メッセージ改善 | ✅ v0.8.7 で実装済み（§40）|
| BGMノード完全停止・予約音キャンセル | ✅ v0.8.6.3 で修正済み（§39）|
| BGM即時切り替え修正 | ✅ v0.8.6.2 で修正済み（§38）|
| BGM重なり修正（世代管理） | ✅ v0.8.6 で修正済み（§36）|
| 攻略ペーパービュー屋 | ✅ v0.8.6 で実装済み（§37）|
| Lv99到達演出強化 | ✅ v0.8.5 で実装済み（§35）|
| BGM/SE | ✅ v0.8.4 で実装済み（§34）|
| 本格エンドロール（アニメーション付き） | テキスト版実装済み、アニメなし |
| 2周目要素・クリア後強化コンテンツ | 未実装 |
| 最強装備のイベント入手 | ✅ v0.8 で実装済み（§30） |
| 仲間フィールド追従・固有イベント | 未実装 |
| 横スクロールマップ（§5.5） | 将来大型改修（v0.9+）|
| 複数マップ・ダンジョン | 未実装 |
| 図鑑からUMA詳細ステータス確認 | ✅ v0.8.1 で実装済み（§31） |
| フィールドNPC会話システム | ✅ v0.8.2 で実装済み（§32） |
| 伝説装備追加・NPCヒント連動 | ✅ v0.8.3 で実装済み（§33） |
| BGM/SE・サウンド設定 | ✅ v0.8.4 で実装済み（§34） |
| セーブ座標 | 未実装（リロード時は村入口スタート）|

---

## 開発フロー（必ず守ること）

```
1. GAME_DESIGN.md に仕様を整理・追記
2. TODO.md に実装予定を登録
3. index.html / script.js を実装
4. CHANGELOG.md に変更を記録
5. git commit → git push origin main
```

---

## セーブデータ周りの注意

- localStorage キー: `"ultimateGorillaSaveV2"`
- 新しいフラグを追加する場合:
  1. `state.player` または `state` のトップレベルに初期値を追加
  2. `saveGame()` に保存処理を追加
  3. `loadGame()` に読み込み処理を追加（`!!data.newFlag` で古いセーブに対応）
  4. `newGame()` でリセットされることを確認

---

## スマホUI周りの注意

- 画面幅 480px 前後の縦長レイアウトを最優先
- `touch-action: manipulation` / `-webkit-user-select: none` で長押し抑制済み
- モーダルは `.modal` / `.modal-box` クラスを使う（既存のアニメーション付き）
- 新規ボタンは `.modal-btn` または `.shop-menu-btn` クラスを使う
- フォントサイズは `0.85em` 〜 `1em` 程度に抑える（スマホ縦画面で見やすく）

---

## デバッグメニューの使い方

`?debug=1` を URL に付けると設定画面（⚙️）にテスト用ボタンが追加表示される。
通常 URL では絶対にデバッグメニューを表示しないこと（`DEBUG_MODE` 定数で制御）。

```javascript
// script.js 冒頭
var DEBUG_MODE = window.location.search.indexOf("debug=1") >= 0;
```

---

## 次の推奨実装順

1. **v0.26 フィールド仲間追従表示** — パーティ仲間を通常マップで主人公の後ろにドラクエ風に表示。工数中〜大（renderField改修）。専用ブランチで着手。
2. **v0.27 仲間の戦闘自動参加** — 仲間が自動行動（コマンド選択なし）。工数中。v0.26 完了後。
3. **v0.28 仲間ごとのコマンド選択** — 戦闘UIの大改修。最後に回す。

> プレイヤーフィードバック (v0.25 時点): 「仲間をフィールドで後ろに並べたい」「仲間も戦闘に参加してほしい」

## v0.12.1 横スクロール全体仕様 (最新)

| ステージ | 名前 | サイズ | ボス | 報酬(最大) |
|---|---|---|---|---|
| 1 | はじまりの草原 | 40×3 | 中ボスゴリラ | 100G+パン |
| 2 | あやしい森 | 40×3 | ボスゴリラ | 150G+お弁当 |
| 3 | 古びた町はずれ | 40×5 | 魔王ゴリラ | 220G+ラーメン |
| 4 | ゴリラ山道 | 40×5 | 大魔王ゴリラ | 350G+ラーメン |

## v0.12.1 Hゲート位置テーブル

| ステージ | スタート側H | ゴール側H | ボス |
|---|---|---|---|
| 1 はじまりの草原 | (2,1) | (37,1) | b@(36,1) |
| 2 あやしい森     | (2,1) | (37,1) | b@(35,1) |
| 3 古びた町はずれ | (2,2) | (37,2) | b@(31,2) |
| 4 ゴリラ山道     | (2,2) | (37,2) | b@(33,2) |

## 横スクロールからの帰還仕様 (v0.12.1)

| 方法 | 場所 | 動作 |
|---|---|---|
| 🏠 スタート側Hゲート | 各ステージ x=2 | 確認モーダル → switchToNormalMap() |
| 🏠 ゴール側Hゲート | 各ステージ x=37 | 確認モーダル → switchToNormalMap() |
| ゴール画面 | 🏁 ゴールタイル x=38 | ゴールモーダルの「🏠 通常マップへ戻る」→ switchToNormalMap() |
| 戻り先 | 通常マップ(2,4) | 🌀ゲート(2,3)の1マス下。再接触ループ防止 |
| 進捗保持 | 宝箱・固定敵・ステージクリア | switchToNormalMap()は mapMode 変更のみ。進捗は一切変わらない |

## v0.11.3 での「今回は実装しない」リスト

- ステージ4本体
- 大魔王ゴリラ実装
- 低固定ダメージ技の実装
- 新BGM追加 / BGM制御の大改修
- 仲間フィールド追従
- 究極ゴリラ仕様変更
- 通常マップの削除

## v0.11.2 での「今回は実装しない」リスト

- ステージ4本体
- 大魔王ゴリラ実装
- 低固定ダメージ技の実装（はずかし固め等）→ GAME_DESIGN.md §52 にメモのみ
- 新BGM追加 / BGM制御の大改修
- 仲間フィールド追従
- 究極ゴリラ仕様変更
- 通常マップの削除

---

## 新セッション開始時に最初に伝える文言

`PROMPTS/START_NEW_SESSION.md` をコピーして貼り付けてください。
