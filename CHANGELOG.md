# CHANGELOG.md — 変更履歴

このファイルには、実装した変更を記録する。書式は
[Keep a Changelog](https://keepachangelog.com/) を簡略化したもの。
未実装の予定は [TODO.md](TODO.md)、仕様の詳細は [GAME_DESIGN.md](GAME_DESIGN.md) を参照。


## [0.24.1] - 2026-07-11 — 仲間セリフ安定化・横スクロール制覇のみ反応追加 (§76)

### Changed
- **`getCompanionQuote(c)` 安定化** (§76): `if (!c) return null` null ガード追加。優先順位に2状態を追加。
  - **priority 3 追加**: `isLegendaryEquipmentComplete() && !isFullyCompleted()` → `legendaryLine` 橙 `#ffb347`（完全達成前でも伝説装備コンプで反応）
  - **priority 7 追加**: `isSideStoryCleared() && !state.gameCleared` → `sideClearLine` 薄紫 `#c8b4ff`（横スクロール制覇のみ・未クリアでも反応）

### Added
- **デバッグ §76**: 3ボタン追加
  - `btn-debug-companions-normal` → 通常状態（未クリア・未制覇）でセリフなし確認
  - `btn-debug-companions-side-only` → 横スクロール制覇のみ（未クリア）→ 薄紫セリフ確認
  - `btn-debug-companions-legendary-only` → 伝説装備コンプリートのみ（未完全達成）→ 橙セリフ確認

## [0.24] - 2026-07-11 — 仲間4人の会話バリエーション追加 (§75)

### Added
- **`getCompanionQuote(c)` ヘルパー** (§75): 5段階状態を判定して `{text, color}` を返す。優先順: legendary > fullClear > dex > sideClear > clear。BGM / 仲間能力値 / 加入処理は変更なし。
- **`COMPANION_DATA` に3フィールド追加** (§75): 全4仲間に `sideClearLine`（クリア+横スクロール制覇・薄紫 `#c8b4ff`）/ `dexLine`（クリア+図鑑コンプ・水色 `#74c0fc`）/ `legendaryLine`（完全達成+伝説装備コンプ・明金 `#ffd700`）を追加。既存の `clearLine` / `fullClearLine` は維持。
- **デバッグ §75**: `btn-debug-companions-postclear`（クリアのみ）・`btn-debug-companions-side-cleared`（+横スクロール）・`btn-debug-companions-dex-complete`（+図鑑）・`btn-debug-companions-full-clear`（完全達成）・`btn-debug-companions-legendary`（+伝説装備）の5ボタン追加。各ボタンで該当状態を即設定し酒場を開く。

### Changed
- **`renderTavernRecruit()` / `renderTavernViewParty()`** (§75): 2状態ハードコードから `getCompanionQuote(c)` 呼び出しに置き換え。
- **冒険の記録「次の目標」** (§75): 全達成時メッセージを「酒場で仲間たちの言葉を聞いてみるのもよいでしょう。」を含む文に更新。

## [0.23] - 2026-07-11 — クリア後フィールドBGM軽量メロディ調整 (§74)

### Added
- **`BGM_DATA.fieldClear`** (§74): クリア後フィールド専用メロディエントリを `BGM_DATA` に追加。`waveType: "triangle"`（square より柔らかい音色）・vol: 0.05（field と同音量）・Cメジャー・約7.75秒ループ。ユーザー指定パターン（C-E-G-A→D-F-A-G→C-E-G-C5-B-A-G→E-G-A-G-E-D-C）を実装。
- **`getFieldBgmType()` ヘルパー** (§74): `state.gameCleared` が true なら `"fieldClear"`、それ以外は `"field"` を返す小関数。BGM_DATA 定義の直前に配置。
- **デバッグ §74**: `btn-debug-bgm-field-clear`（🌟 クリア後フィールドBGM テスト再生）ボタン追加。既存の `btn-debug-bgm-field` のラベルを「通常フィールドBGM」に更新。

### Changed
- **`updateBGM("field")` 全呼び出し箇所** (§74): `updateBGM(getFieldBgmType())` に置換（合計8箇所：finishBattle / サウンドトグル / BGMトグル / エンディング後フィールド復帰 / Dパッド4方向 / キーボード4方向）。BGM制御関数自体（`stopBGMHard` / `startBGM` / `updateBGM` / `_scheduleBGMLoop`）は一切変更なし。

### Notes
- BGM制御（stopBGMHard・bgmSessionId・activeBgmNodes・activeBgmTimers・bgmMasterGain 等）は変更なし。BGM重なりバグ対策（v0.8.6.3）は維持。
- クリア前の通常フィールドBGM・バトルBGM・エンディングBGMは変更なし。

## [0.22] - 2026-07-11 — 図鑑未捕獲UMAヒント強化 (§73)

### Added
- **UMA_DATA 全9種にヒントフィールド追加** (§73): `hintArea`（出現エリア）/ `hintText`（発見ヒント）/ `hintCatch`（捕獲ヒント）を全UMAに追加。究極ゴリラは Lv99+ウクレレ+HP1〜10+うたう の専用ヒントを設定。
- **図鑑モーダル（renderDexBody）のヒント表示** (§73): 未発見UMAカードに `📍hintArea`、発見済み未捕獲カードに `💡hintText` を表示。
- **図鑑詳細モーダル（openMonsterDetailModal）の捕獲ヒント** (§73): 通常UMAが発見済み未捕獲の場合に `💡 捕獲ヒント` セクションとして `hintCatch` を追加表示。究極ゴリラは従来の専用表示を維持。
- **UMA博士 未捕獲ヒント** (§73): 図鑑未コンプ時に最初の未捕獲UMAの名前と hintArea/hintText を参照したセリフを追加。捕獲数4以上・8以上で分岐。
- **攻略ペーパービュー屋 getProgressHint() 強化** (§73): クリア後・横スクロール制覇・図鑑未コンプ時に最初の未捕獲UMAの名前/hintText/hintCatch を tier 1/2/3 で段階的に表示。
- **冒険の記録 図鑑セクション「図鑑でヒントを確認」** (§73): 未コンプ時に `📖 図鑑でヒントを確認` ボタンを追加。クリックで記録モーダルを閉じ図鑑モーダルへ遷移。
- **デバッグ §73**: `btn-debug-dex-one-uncaptured`（最初のUMAだけ未捕獲）/ `btn-debug-dex-one-seen`（最初のUMAだけ発見済み）/ `btn-debug-dex-reset`（図鑑全リセット）の3ボタン追加。

## [0.21] - 2026-07-11 — UMA図鑑コンプリート演出強化 (§72)

### Changed
- **`openDexCompleteModal()` 演出強化** (§72): 本文を「すべてのUMAが図鑑に記録された」「スカイフィッシュも、ツチノコも、そして究極ゴリラも」「一匹ずつ向き合い、積み重ねてきた記録は…」の3段構成に刷新。称号表示をクリア＋横スクロール制覇済みなら「究極とUMA図鑑を極めし者」、そうでなければ「UMA図鑑を極めし者」に分岐。
- **UMA博士（NPC D）図鑑コンプリート反応追加** (§72): 「図鑑コンプリート＋究極ゴリラ未捕獲」の専用セリフを追加（「UMA図鑑をここまで埋めたのか……見事じゃ。」→「最後は、歌が必要になるはずじゃ。」）。クリア済みの図鑑コンプリートセリフも「すべてのUMAを記録し、究極ゴリラに歌を届けたのじゃな。おぬしはもう、立派なUMAハンターじゃ。」に改定。
- **冒険の記録 UMA図鑑セクション** (§72): コンプリート時「✅ コンプリート！すべてのUMAが図鑑に記録された。」、未コンプ時「あとN種類 — 未捕獲のUMAを探してみよう。」に強化。

### Added
- **デバッグ §72**: `btn-debug-open-record-dex`（冒険の記録を開いてUMA図鑑セクション確認）ボタン追加。図鑑コンプリートテストセクションのラベルも更新。

## [0.20.1] - 2026-07-11 — 伝説装備コンプリート安定化・表示確認 (§71)

### Changed
- **`LEGEND_EQUIPS` 拡張** (§71): 各エントリに `slot` と `itemId` フィールドを追加（ペガサスのよろい: armor/pegasusarmor など全7種）。
- **`isLegendaryEquipmentComplete()` 強化** (§71): フラグ確認に加え、旧セーブ互換のため `isEquipOwned()` による所持確認も追加。フラグが未設定でも所持中・装備中なら入手済み扱い。
- **冒険の記録 伝説装備リスト表示** (§71): 各装備に `✅ `（入手済み）/ `・`（未入手）プレフィックスを追加し視覚的に識別しやすくした。
- **NPC K（鍛冶屋）伝説セリフ整理** (§71): コンプリート時・未コンプ（一部入手済み）・Lv30以上未入手の各セリフを複数 `lines.push()` に分け、自然な会話調に整備。

### Added
- **デバッグ §71**: `btn-debug-legend-only-incomplete`（伝説装備だけ未達成にして他を維持）/ `btn-debug-open-record-legendary`（冒険の記録を直接開いて伝説装備確認）を追加。

## [0.20] - 2026-07-11 — 伝説装備コンプリート報酬 (§70)

### Added
- **`isLegendaryEquipmentComplete()`** (§70): 伝説装備7種すべての取得フラグを確認するヘルパー関数を追加。
- **`state.legendaryRewardClaimed`** (§70): 報酬受取済みフラグ。`saveGame()` / `loadGame()` / 初期 state に追加。
- **`#legendary-complete-modal`** (§70): 伝説装備コンプリート報酬モーダルを index.html に追加（⚔️絵文字タイトル）。
- **`openLegendaryCompleteModal()`** (§70): 報酬付与（2000G + ラーメン×2）+ 称号取得アナウンス + ボタンで装備画面へ遷移。
- **称号「すべての伝説を集めし者」** (§70): `isFullyCompleted() && isLegendaryEquipmentComplete()` を最高位称号として `getPlayerTitle()` に追加。
- **`openEquipModal()` 報酬チェック** (§70): 装備画面を開く前に未受取報酬がある場合は先に `openLegendaryCompleteModal()` を呼ぶ。
- **冒険の記録 `⚔️ 伝説装備` セクション** (§70): 各装備の入手状況・進捗バー・N/7表示・コンプリート/残数を `renderRecordBody()` に追加。
- **冒険の記録 `✨ 伝説装備コンプリート報酬` セクション** (§70): 受取済み/未受取/未解放の3状態を `renderRecordBody()` に追加。
- **総合達成率スコア更新** (§70): 最大25pt → **最大32pt**（本編1 + 横スクロール12 + UMA図鑑12 + 伝説装備7）。
- **称号条件一覧** (§70): 「すべての伝説を集めし者」を最上位に `renderRecordBody()` の称号条件表へ追加。
- **次の目標** (§70): 伝説装備未コンプリート時に「伝説装備を全7種集めよう」ヒントを追加。
- **NPC K（鍛冶屋）伝説コンプリート反応** (§70): コンプリート時に専用セリフ、未コンプリートで一部入手済みの場合は残数ヒント。
- **`openHomeModal` 伝説ヒント** (§70): `postClearHints` に伝説装備コンプリート誘導ヒントを追加。
- **`getProgressHint` priority=0 更新** (§70): 伝説コンプリートを最高優先に昇格、`isFullyCompleted()` 時に伝説誘導ヒントを追加。
- **デバッグ §70**: `btn-debug-legend-all`（全7種入手）/ `btn-debug-legend-reward-reset`（未受取に戻す）/ `btn-debug-legend-reward-modal`（モーダル表示）を追加。

### Changed
- **`getPlayerTitle()`** (§70): 新最高位称号「すべての伝説を集めし者」を先頭に追加（旧最高位「究極とUMA図鑑を極めし者」は2番目へ）。
- **`renderRecordBody()` スコア計算** (§70): 分母を25→32に変更。`legendCount`/`legendPts`/`legendPct` 変数追加。

## [0.19] - 2026-07-11 — NPC固有イベント深化・クリア後世界の会話強化 (§69)

### Added
- **`isUltimateGorillaCaptured()` / `isFullyCompleted()`** (§69): 完全達成（クリア+横スクロール制覇+図鑑コンプリート）を判定するヘルパー関数を追加。
- **全4NPC 完全達成セリフ** (§69): UMA博士・旅人・ゴリラ研究家・王様の使い に `isFullyCompleted()` 分岐を追加。各NPC固有の完全達成セリフを実装。
- **全4NPC 横スクロール未制覇誘導** (§69): クリア済みだが横スクロール未制覇の場合に横スクロール方面へのセリフを追加。
- **UMA博士 横スクロール制覇済み→歌誘導セリフ強化** (§69): `!gameCleared && isSideStoryCleared()` 分岐に「あとは歌を届けるだけじゃ」を追加。
- **仲間 `fullClearLine`** (§69): 完全達成時の専用セリフを全4仲間（ジュリタニ/シュリタニ/ノリオ/ハルミ）に追加。酒場「仲間を見る」「仲間を探す」で金色斜体表示。
- **`openHomeModal` 完全達成ヒント** (§69): `isFullyCompleted()` を最高優先として「余韻」系ヒントを追加。
- **`openHomeModal` クリア+横スクロール制覇ヒント** (§69): 中間達成状態用ヒントを追加。
- **デバッグ §69** (§69): NPC会話テスト3ボタン（完全達成/クリアのみ/横スクロール制覇のみ）を追加。

### Changed
- **仲間 `clearLine` 更新** (§69): 全4仲間のクリア後セリフを、内容に合わせてより具体的な文に改定。
- **`getProgressHint` priority=0** (§69): 完全達成時に「余韻の時間」テキスト。横スクロール未制覇を最下位ケースとして整理。
- **酒場表示ロジック** (§69): `isFullyCompleted()` の場合は `fullClearLine` を優先表示（金色）、通常クリアは `clearLine`（緑）。

## [0.18.1] - 2026-07-11 — 冒険の記録UI改善・達成率プログレスバー追加 (§68)

### Added
- **総合達成率バー** (§68): 記録モーダル最上部に 総合達成率（%）と CSS プログレスバーを追加。スコアは 本編1pt + 横スクロール12pt + UMA図鑑12pt（捕獲数/全種×12）= 最大25pt換算。
- **カテゴリ別プログレスバー** (§68): 本編・横スクロール編・UMA図鑑の各セクションに個別バーを追加。横スクロールはステージクリア+ボス撃退の内訳も表示。
- **`.record-progress` / `.record-progress-fill`** (§68): プログレスバー用CSSクラスを style.css に追加。グラデーション塗り。
- **`.record-section-goal`** (§68): 「次の目標」セクションを金色ボーダー・薄背景で強調するCSSクラスを追加。
- **カードスタイル改善** (§68): `.record-section` を `rgba(0,0,0,0.2)` 背景 + `rgba` 半透明ボーダーに更新。
- **「次の目標」セクション強調** (§68): `record-section-goal` クラスで金色ボーダー表示。見出しも金色に変更。
- **「現在の称号」セクション拡張** (§68): 見出しを `🏅 現在の称号` に変更、称号テキストをやや大きく表示。
- **横スクロール制覇時バナー** (§68): 全ステージ制覇済みの場合に緑色で「✅ 全ステージ制覇済み」を表示。

### Changed
- **`renderRecordBody()`** (§68): 総合スコア計算・プログレスバー出力ヘルパー `pbar()` を追加。各セクションをバー付きに更新。

## [0.18] - 2026-07-11 — 冒険の記録・達成状況パネル (§67)

### Added
- **`#record-modal` 冒険の記録モーダル** (§67): 達成状況を一覧できる新モーダルを追加。
- **「📜記録」ボタン** (§67): 上部メニュー `status-row` に `btn-record` ボタンを追加。
- **`openRecordModal()` / `renderRecordBody()`** (§67): 記録モーダルの開閉・レンダリング関数。
- **`getPlayerTitle()` 共通関数** (§67): 6段階称号判定を一元化。`renderStatus()` / `renderEndingPage()` の重複ロジックを置き換え。
- **`.record-section` / `.record-row` CSS** (§67): 記録モーダル専用スタイルを style.css に追加。
- **デバッグ §67** (§67): 「📜 冒険の記録を開く」ボタン追加。

### 表示項目
- 現在の称号（`getPlayerTitle()` の結果を大きく強調）
- 究極ゴリラ捕獲状態（未捕獲なら条件ヒント付き）
- 横スクロール編総合＋各ステージ（1〜6）クリア/ボス撃退状態
- UMA図鑑捕獲数（コンプリートなら表示）
- 図鑑コンプリート報酬受取状態
- 次の目標（状態に応じて1文）
- 称号条件一覧（6段階・現在の称号を▶でハイライト）

### Changed
- **`renderStatus()` playerTitle** (§67): `getPlayerTitle()` を呼ぶように1行化。
- **`renderEndingPage()` finalTitle** (§67): `getPlayerTitle()` を呼ぶように1行化。

## [0.17.1] - 2026-07-11 — 図鑑コンプリート報酬・仲間別クリア後セリフ (§66)

### Added
- **`isUmaDexComplete()` ヘルパー** (§66): UMA_DATA 全種を捕獲済みかチェックする関数を追加。
- **`state.dexCompleteRewardClaimed`** (§66): 図鑑コンプリート報酬受取済みフラグ。saveGame/loadGame/初期値に追加。
- **`#dex-complete-modal`** (§66): 図鑑コンプリート報酬モーダル（index.html）。称号・報酬内容・「図鑑を見る」ボタン。
- **`openDexCompleteModal()`** (§66): 3000G＋ラーメン×3を付与し報酬モーダルを開く新関数。
- **仲間クリア後セリフ `clearLine`** (§66): COMPANION_DATA の各仲間にクリア後専用セリフを追加。酒場「仲間を見る」「仲間を探す」でクリア後に表示。
- **デバッグ §66** (§66): 5ボタン追加（全UMA捕獲済み・報酬リセット・報酬モーダル表示・完全達成状態・仲間セリフ確認）。

### Changed
- **称号優先順位更新** (§66): 「究極とUMA図鑑を極めし者」（クリア+横+図鑑）>「究極を歌い、聖域を越えし者」(クリア+横)>「UMA図鑑を極めし者」(図鑑のみ)>「森に歌を届けし者」(クリアのみ)>「究極に近づきし者」(Lv99)>「勇者の子孫」の6段階に拡張。`renderStatus()` ・`renderEndingPage()` 両方に反映。
- **`openDexModal()` 報酬チェック** (§66): 開いた時に `isUmaDexComplete() && !dexCompleteRewardClaimed` なら先に報酬モーダルを表示。
- **`renderDexBody()` コンプリート表示** (§66): 全UMA捕獲済みなら「🎉 UMA図鑑コンプリート！」バナーを発見/捕獲カウントの代わりに表示。
- **UMA博士 図鑑コンプリート反応** (§66): クリア後かつ図鑑コンプリートの場合、専用のお祝いセリフに分岐して早期return。
- **`getProgressHint()` 完全制覇ヒント** (§66): priority=0 のブランチに「図鑑+横スクロール制覇」「図鑑のみ」の最高優先ヒントを追加。
- **`openHomeModal()` 図鑑コンプリートヒント** (§66): クリア後かつ図鑑コンプリートの場合、専用ランダムヒントを表示（既存クリア後ヒントより優先）。

## [0.17] - 2026-07-11 — 究極ゴリラ捕獲クライマックス演出・クリア後リアクション強化 (§65)

### Added
- **捕獲成功モーダル `#capture-modal`** (§65): エンディング前に「🎵 歌が届いた」モーダルを挿入。「王様へ報告する」ボタンでエンディングへ続く。
- **総合称号「究極を歌い、聖域を越えし者」** (§65): クリア済み＋横スクロール制覇済み（s6クリア＋チンパンジー撃退）の場合に表示される上位称号を追加。ステータス画面・エンディング最終ページに反映。
- **index.html ヘルプ「🌟 クリア後の遊び方」** (§65): 図鑑・横スクロール・チンパンジー・伝説装備・総合称号の説明を追加。
- **デバッグ §65** (§65): 「捕獲成功モーダルを見る」「クリア済み+横スクロール制覇状態にする」「クリア済みのみにする」3ボタン追加。

### Changed
- **`doSingUltimateGorilla()` 演出強化** (§65): 捕獲成功ログを「女神のウクレレを静かにかき鳴らした→森に歌が広がっていく→じっと耳をすませている→ゆっくりと近づいてきた→捕まえた！」の5行クライマックス演出に刷新。
- **UMA博士 クリア後セリフ** (§65): 「ついに究極ゴリラを捕まえたのじゃな……！力でねじ伏せるのではなく歌を届けたから……おぬしは本物のUMAハンターじゃ。」に更新。
- **旅人 クリア後セリフ追加** (§65): 「おいおい、本当に究極ゴリラを捕まえたのか？最初から、ただ者じゃないとは思ってたけどな。」を関数先頭で早期return。
- **ゴリラ研究家 クリア後セリフ** (§65): 「究極ゴリラを捕まえた記録は、歴史に残る。チンパンジーを退かせた強さ。究極ゴリラに歌を届けたやさしさ。どちらも、君の冒険の証だ。」に更新。
- **王様の使い クリア後セリフ** (§65): 「王はすでに報告を受けている。究極ゴリラを捕まえた者として、おぬしの名は森の歴史に刻まれるだろう。」に更新。
- **実家ヒント クリア後対応** (§65): クリア後は4種類の専用ランダムヒント（図鑑・横スクロール・歌の感慨など）を表示。
- **攻略ペーパービュー屋 クリア後メッセージ** (§65): priority=0 に専用ブランチを追加。横スクロール制覇済みなら総合称号に言及、未制覇なら横スクロールへの誘導メッセージを返す。

## [0.16.1] - 2026-07-11 — 究極ゴリラ捕獲チャンス演出・ガマン状態表示 (§64)

### Added
- **`#battle-gaman-status`** (§64): 戦闘画面のプレイヤーステータス欄の下にガマン中インジケーター追加。`state.gamanActive` に連動して表示/非表示。`updateBattlePlayerStatus()` で制御。
- **`.btn-chance` + `@keyframes pulse-chance`** (§64): うたうボタンが捕獲チャンス時に金色に点滅するアニメーション CSS 追加。
- **`updateSingButtonChance(active)`** (§64): `#btn-sing` に `.btn-chance` クラスを付与/除去する新関数。

### Changed
- **`checkUltimateGorillaHpHint()`** (§64): 単一メッセージから条件別4分岐に拡張。Lv99+ウクレレ両方あり→チャンスメッセージ+うたうボタン強調、Lv不足→専用メッセージ、ウクレレなし→専用メッセージ、両方なし→両方不足メッセージ。
- **`useWaza()` ガマン分岐** (§64): ガマン状態変更直後に `updateBattlePlayerStatus()` を呼び出し、インジケーターを即時反映。
- **`actuallyStartBattle()`** (§64): 戦闘開始時に `updateSingButtonChance(false)` を呼び出しうたうボタンをリセット。
- **`finishBattle()`** (§64): 戦闘終了時に `updateSingButtonChance(false)` を呼び出しうたうボタンをリセット。
- **デバッグ §64** (§64): 「Lv99+ウクレレ+HP10（チャンス表示確認）」「Lv50+ウクレレ+HP10（Lv不足確認）」「Lv99+ウクレレなし+HP10（ウクレレ不足確認）」3ボタン追加。

## [0.16] - 2026-07-10 — 捕獲支援技「ここはひとつガマン」 (§63)

### Added
- **WAZA_DATA「ここはひとつガマン」** (§63): わざに新技追加。その戦闘中だけ通常攻撃ダメージを1/4に（最低1）。fixedDmg なし・type:"weakenAttack"。
- **useWaza() ガマン分岐** (§63): `type === "weakenAttack"` の場合に `state.gamanActive = true` を設定。再使用時はメッセージのみ（効果は変わらず）。
- **doFight() ガマン補正** (§63): 会心計算後に `state.gamanActive` なら `Math.floor(dmg/4)`・最低1。ガマン中専用ログメッセージ（通常/会心で分岐）。
- **finishBattle() ガマン解除** (§63): `state.gamanActive = false` を追加。勝利/捕獲/逃走/敗北すべての戦闘終了で解除。
- **openWazaMenu() 説明更新** (§63): 説明文を「固定ダメージで削ったり、ガマンで通常攻撃を弱めたりできます」に更新。ガマン中はメニューに「⚡ガマン中」を付記。ガマン技は「効果中」表示で区別。
- **デバッグ §63** (§63): 「😤 ガマン状態でのらいぬ戦闘」「😤 ガマン状態で究極ゴリラHP12」「🔄 ガマン状態解除」の3ボタン追加。

### Changed
- **NPC UMA博士** (§63): capturedCount<4 ヒントを「はずかし固め・小」「ここはひとつガマン」両方に言及に更新。Lv50+ヒントも同様に更新。
- **getProgressHint priority17 tier3** (§63): 「ここはひとつガマン」を追記。
- **index.html ヘルプ** (§63): わざセクションを固定ダメージ技 + 補助技の2構成に更新。「ここはひとつガマン」説明追加。

## [0.15.1] - 2026-07-10 — わざコマンド安定化・表示整理・究極ゴリラ捕獲テスト強化 (§62)

### Fixed
- **actuallyStartBattle()** (§62): 戦闘開始時に `#waza-menu` を `hidden` にするよう修正（magic-menu/item-menu は対象だったが waza-menu が漏れていた）

### Changed
- **WAZA_DATA** (§62): `hazukashigatame` 表示名を「はずかし固め」→「**はずかし固め・小**」に変更（まほうの「はずかし固め」と区別。内部IDは変更なし）
- **getProgressHint priority17 tier3** (§62): 「はずかし固め・小」の名前を明記
- **index.html ヘルプ** (§62): わざ技名を「はずかし固め・小」に更新。まほうとの違いを注記追加

### Added
- **openWazaMenu()** (§62): メニュー先頭に説明テキスト「UMAを弱らせるための固定ダメージ技です。削りすぎに注意！」追加
- **checkUltimateGorillaHpHint(e)** (§62): 究極ゴリラHP1〜10時に「うたう」チャンスをログ表示するヘルパー関数追加
- **useWaza()** (§62): 残りHP表示ログ追加（「残りHP: X / MaxHP」）、`checkUltimateGorillaHpHint()` 呼び出し追加
- **doFight()** (§62): `checkUltimateGorillaHpHint()` 呼び出し追加（winBattle チェック後）
- **デバッグ §62**: 「🦍 究極ゴリラ捕獲テスト」セクション追加。HP12/10/1 で直接戦闘開始できるボタン3本追加
- **debugForceUltimateGorillaHP12/10/1()** (§62): HP指定で究極ゴリラ戦闘開始する関数3種追加

## [0.15] - 2026-07-10 — わざシステム（捕獲支援・低固定ダメージ技）(§61)

### Added
- **WAZA_DATA** (§61): 低固定ダメージ技4種の配列新設 (はずかし固め1/キドクラッチ2/カリツォー3/グーパンチ4、MPなし・防御無視固定ダメージ)
- **openWazaMenu()** (§61): わざサブメニュー生成関数追加 (openMagicMenu と同パターン)
- **useWaza(id)** (§61): 固定ダメージ付与・renderEnemy・winBattle チェック・敵ターン移行
- **#btn-waza** (§61): `#battle-menu` 最後にフル幅ボタン追加（grid-column:span 2、緑背景 #1e4d2b）
- **#waza-menu** (§61): `#item-menu` の後にサブメニュー div 追加 (class="hidden submenu")
- **init()** (§61): `btn-waza` → `openWazaMenu` クリックリスナー追加
- **NPC_DATA UMA博士** (§61): 捕獲数<4 時にわざコマンドヒント追加、Lv50+未クリア時にHP調整ヒント追加
- **HOME_HINTS** (§61): わざコマンドを紹介するヒント2件追加
- **getProgressHint priority 17 tier3** (§61): 究極ゴリラ捕獲条件の説明にわざ活用法を追記
- **index.html ヘルプ** (§61): 「🥊 わざコマンドについて」セクション追加（うたうセクションの直前）

## [0.14.1] - 2026-07-09 — 横スクロール編クリア後導線・究極ゴリラ捕獲誘導 (§60)

### Added
- **isSideStoryCleared()** (§60): `sm.stageCleared["6"] && sm.defeatedEnemies["6:34,2"]` で横スクロール編制覇判定するヘルパー関数追加
- **renderStatusBody()** (§60): 「横スクロール編 ✅ 制覇済み / 進行中」行追加。最上位称号を「ゴリラの世界の外側を見た者」に変更（旧: チンパンジーの聖域の覇者）
- **NPC_DATA UMA博士(D)** (§60): 横スクロール編制覇後の専用セリフ追加（究極ゴリラ捕獲へ誘導）
- **NPC_DATA 旅人(R)** (§60): 横スクロール編制覇後の専用セリフ追加（歌を待つゴリラへの言及）
- **NPC_DATA ゴリラ研究家(E)** (§60): 横スクロール編制覇後のセリフ追加（究極ゴリラとチンパンジーの役割の違いを説明）
- **NPC_DATA 王様の使い(S)** (§60): 横スクロール編制覇後のセリフ追加（究極ゴリラ捕獲準備を促す）
- **HOME_HINTS** (§60): 横スクロール編制覇後誘導ヒント2件追加
- **openHomeModal** (§60): isSideStoryCleared() 分岐で固定ヒント追加（Lv99/ウクレレ/うたうの捕獲条件）
- **getHintPriority()** (§60): priority17 新設（横スクロール編制覇済み・究極ゴリラ未捕獲 → 最高優先度）
- **getProgressHint()** (§60): priority17 の3段階ヒント追加。priority9 テキストを「s6クリア済みだがチンパンジー未撃退」向けに変更
- **openStage6GoalModal()** (§60): チンパンジー撃退済みのボディに「究極ゴリラはまだ君の歌を待っている」文を追加
- **デバッグ** (§60): 横スクロール編制覇状態にする / 究極ゴリラ捕獲条件セット(Lv99+ウクレレ) / 究極ゴリラ未捕獲状態に戻す の3ボタン追加
- **index.html ヘルプ** (§60): 「🌿 横スクロール編と本編目的」セクション追加（究極ゴリラ捕獲4条件を明示）

## [0.14] - 2026-07-09 — 横スクロールステージ6「チンパンジーの聖域」(§59)

### Added
- **ultimate_chimpanzee** (§59): NON_UMA_DATA に究極チンパンジー追加 (HP1500/ATK72/DEF32/EXP3000/canCapture:false)
- **SIDE_STAGE_DATA[6]** (§59): ステージ6「チンパンジーの聖域」40×5マップ追加 (startX=1, startY=2, goalX=38)
  - row2中央: H@x=2(帰還), n@x=5(守護者), e@x=13(固定敵), m@x=21(商人), b@x=34(究極チンパンジー), G@x=37, H@x=38
  - 宝箱4個(row0:x=8/x=29, row3:x=16, row4:x=4), 固定敵3体, NPC2人
- **SIDE_FIXED_ENCOUNTERS stage6** (§59): 異邦人(6:13,2)・さまようおやじ(6:27,1)・デスマッチレスラー(6:23,3) 追加
- **stage6RewardLevel** (§59): 状態初期化・saveGame・loadGame に追加
- **moveSidePlayer 'b' tile** (§59): ステージ6 → ultimate_chimpanzee 分岐追加
- **openSideGoalModal** (§59): ステージ6ルーティング追加
- **openSideNpcModal** (§59): ステージ6ルーティング追加
- **openSideChest** (§59): ステージ6専用報酬テーブル追加 (80-180G / ラーメン / お弁当 / デオドラント)
- **openStage5GoalModal** (§59): 予告テキスト削除、「🌿 チンパンジーの聖域へ進む」ボタン追加
- **openStage6GoalModal()** (§59): ステージ6ゴール演出関数追加（JS生成ボタン方式）
  - 撃退800G+ラーメン / 未撃退300G / 差分500G+ラーメン
- **openStage6NpcModal()** (§59): ステージ6NPC会話関数追加（聖域の守護者/迷い込んだ修行者）
- **openSideGateModal** (§59): 説明文を「5ステージ」→「6ステージ」に更新
- **renderStatusBody()** (§59): stage6進捗2行 + 称号「聖域を越えし者」「チンパンジーの聖域の覇者」追加
- **getHintPriority()/getProgressHint()** (§59): priority16新設(s5クリア・s6未クリア)、priority9を6ステージ版に更新
- **saveGame/loadGame** (§59): `sideMapStage6Reward` 追加
- **デバッグ** (§59): stage6-enter/near-goal/clear-reset/set-ultimatechimgori/強制ENC/items-reset + return-H/goal-H/ゴールモーダル表示追加
- **index.html ヘルプ** (§59): 「🌿 ステージ6「チンパンジーの聖域」」セクション追加

## [0.13.1] - 2026-07-09 — ゴール側G/H配置変更「ボス→G→H」(§58)

### Fixed
- **SIDE_STAGE_DATA[1/2/3/4/5]** (§58): 全5ステージのゴール側配置を `b→H→G` から `b→G→H` に変更
  - x=37: G(ゴール🏁) — ボスを倒した後まず踏めるゴールタイル
  - x=38: H(帰還ゲート🏠) — ゴール後に右へ1歩で帰還ゲートに到達
  - goalX=38 は維持（H@38 がカメラ範囲内に入るよう保持）
- **debug=1 ゴール側ボタン** (§58): HTML表示とtoastメッセージをG@37/H@38の新位置に更新
- **index.html ヘルプ** (§58): 帰還ゲート位置説明を「ゴール直前(x=37)」→「ゴール通過後(x=38)」に更新

### 変更マップ行

| ステージ | 変更前末尾 | 変更後末尾 |
|---|---|---|
| 1 はじまりの草原 | `...bHGg` | `...bGHg` |
| 2 あやしい森     | `...bgHGg` | `...bgGHg` |
| 3 古びた町はずれ | `...gg##gHGg` | `...gg##gGHg` |
| 4 ゴリラ山道     | `...bgggHGg` | `...bgggGHg` |
| 5 黒い城         | `...bgggHGg` | `...bgggGHg` |

## [0.13] - 2026-07-07 — 横スクロールステージ5「黒い城」(§57)

### Added
- **lastboss_gorilla** (§57): NON_UMA_DATA にラスボス級ゴリラ追加 (HP1000/ATK58/DEF22/EXP1400/canCapture:false)
- **SIDE_STAGE_DATA[5]** (§57): ステージ5「黒い城」40×5マップ追加 (startX=1, startY=2, goalX=38)
- **SIDE_FIXED_ENCOUNTERS stage5** (§57): 宇宙人(5:14,2)・来訪者(5:27,1)・異邦人(5:23,3) 追加
- **stage5RewardLevel** (§57): 状態初期化・saveGame・loadGame に追加
- **moveSidePlayer 'b' tile** (§57): ステージ5 → lastboss_gorilla 分岐追加
- **openSideGoalModal** (§57): ステージ5ルーティング追加
- **openSideNpcModal** (§57): ステージ5ルーティング追加
- **openStage4GoalModal** (§57): 「🏰 黒い城へ進む」ボタン追加
- **openStage5GoalModal** (§57): ステージ5ゴール演出関数追加（JS生成ボタン方式）
- **openStage5NpcModal** (§57): ステージ5NPC会話関数追加（城門前の兵士/逃げ腰の旅人）
- **openSideChest** (§57): ステージ5高報酬テーブル追加（60〜130G/ラーメン/弁当/デオドラント）
- **renderStatusBody** (§57): 黒い城・ラスボス級ゴリラ進捗行追加 + 「黒い城の覇者」「黒い城を越えし者」称号追加
- **getHintPriority** (§57): s5Cleared→9(全5ステージ)、s4Cleared→15(ステージ5ガイド)に更新
- **getProgressHint** (§57): priority=15(ステージ5ガイド)追加、priority=9を5ステージ版に更新
- **openSideGateModal** (§57): 説明文を「5ステージ」に更新
- **debug=1** (§57): ステージ5デバッグボタン8個・ハンドラ追加
- **index.html ヘルプ** (§57): 「🏰 ステージ5「黒い城」」セクション追加

### ステージ5「黒い城」仕様

| 項目 | 内容 |
|------|------|
| マップ | 40×5 (castleテーマ) |
| ボス | ラスボス級ゴリラ b@(33,2) |
| 帰還ゲート | スタート側 H@(2,2)、ゴール側 H@(37,2) |
| 固定敵 | 宇宙人@(14,2)、来訪者@(27,1)、異邦人@(23,3) |
| NPC | 城門前の兵士@(5,2)、逃げ腰の旅人@(12,1) |
| 商人 | m@(21,2) |
| 宝箱 | 4個 (row0×2, row3, row4×2) |
| 報酬 | ボス撃退:500G+ラーメン / 未撃退:200G / 差額:300G+ラーメン |
| ステージ6 | 「チンパンジーの聖域」は未実装 — ゴールモーダルに予告テキストのみ |

## [0.12.1] - 2026-07-06 — ゴール側帰還ゲート追加 (§56)

### Added
- **SIDE_STAGE_DATA[1] row1 x=37** (§56): ゴール側帰還ゲート 'H' 追加 (スタートH@2 + ゴールH@37)
- **SIDE_STAGE_DATA[2] row1 x=37** (§56): ゴール側帰還ゲート 'H' 追加
- **SIDE_STAGE_DATA[3] row2 x=37** (§56): ゴール側帰還ゲート 'H' 追加
- **SIDE_STAGE_DATA[4] row2 x=37** (§56): ゴール側帰還ゲート 'H' 追加
- **デバッグボタン** (§56): 全4ステージにゴール側H付近移動ボタン追加 + ステージ4スタート側Hボタン追加
- **index.html ヘルプ** (§56): 帰還ゲート2か所(スタート/ゴール側)の説明を更新

### H位置テーブル (v0.12.1以降)

| ステージ | スタート側H | ゴール側H | ボス位置 | ゴール |
|---|---|---|---|---|
| 1 はじまりの草原 | (2,1) | (37,1) | b@(36,1) | G@38 |
| 2 あやしい森     | (2,1) | (37,1) | b@(35,1) | G@38 |
| 3 古びた町はずれ | (2,2) | (37,2) | b@(31,2) | G@38 |
| 4 ゴリラ山道     | (2,2) | (37,2) | b@(33,2) | G@38 |


## [0.12] - 2026-07-06 — 横スクロールステージ4「ゴリラ山道」追加

### Added
- **SIDE_STAGE_DATA[4]「ゴリラ山道」** (§55): 40×5マップ。startX=1, startY=2, goalX=38
  - 高路(row0): 岩場の安全ルート。宝箱2個(x=8, x=28)
  - 上中路(row1): 旅人NPC(x=12)、校長(固定敵 x=31)
  - 中央路(row2): H帰還ゲート(x=2)、老人NPC(x=5)、空手姉妹(固定敵 x=15)、商人(x=20)、大魔王ゴリラ(x=33)、ゴール(x=38)
  - 下中路(row3): 宝箱(x=22)、デスマッチレスラー(固定敵 x=25)
  - 下路(row4): 宝箱(x=4)、水路あり
- **大魔王ゴリラ** (§55): NON_UMA_DATAに追加。HP700/ATK46/DEF16/EXP850/canCapture:false
- **SIDE_FIXED_ENCOUNTERS** (§55): ステージ4固定敵3体追加（空手姉妹/校長/デスマッチレスラー）
- **`openStage4GoalModal()`** (§55): ゴール演出・報酬分岐。未撃退120G / 撃退済み350G+ラーメン
- **`openStage4NpcModal()`** (§55): 老人(ny=2) / 旅人(ny=1) 分岐NPC会話
- **openStage3GoalModal() に「⛰️ ゴリラ山道へ進む」ボタン追加** (§55)
- **openSideGoalModal() / openSideNpcModal() にstage4ルーティング追加** (§55)
- **openSideChest() stage4専用報酬テーブル** (§55): 40〜100G / デオドラント / お弁当 / やくそう
- **state.sideMap.stage4RewardLevel** (§55): 報酬受取フラグ(0/1/2)
- **saveGame() / loadGame()** (§55): `sideMapStage4Reward` 追加
- **renderStatusBody() stage4進捗** (§55): ゴリラ山道クリア・大魔王ゴリラ撃退状況・称号「山道を越えし者」「ゴリラ山道の覇者」
- **getHintPriority() priority 14** (§55): s3クリア・s4未クリア → ゴリラ山道ガイド
- **getProgressHint() priority 9 更新 / priority 14 追加** (§55): 4ステージ対応ヒント
- **デバッグ機能** (§55): ステージ4移動/ゴール直前/フラグリセット/アイテムリセット/大魔王ゴリラ撃退/強制エンカウント/ゴールモーダル表示
- **index.html ヘルプ** (§55): ステージ4説明セクション追加
- **openSideGateModal()** (§55): ゲート説明文を「4ステージ」に更新


## [0.11.3.2] - 2026-07-06 — ゴールモーダルJS生成ボタン方式 + 帰還ゲート位置修正

### Fixed
- **ゴールモーダルボタンをJS生成方式に変更** (§54): 静的HTMLボタン4つ（`btn-side-goal-forest/town/return/stay`）を削除し、各ゴール関数内で `document.createElement` によりボタンを生成してアタッチ。`hidden` クラス付け外しによる実機不具合を根本解消
- **帰還ゲート H タイルの位置変更** (§54): x=0 → x=2 に移動。スタート(x=1)のすぐ右に配置し、プレイヤーが自然に発見できるようにした
  - ステージ1: (x=0, y=1) → (x=2, y=1)
  - ステージ2: (x=0, y=1) → (x=2, y=1)
  - ステージ3: (x=0, y=2) → (x=2, y=2)

### Added
- **`returnToNormalMapFromSide()`** (§54): ゴール/帰還ゲート両モーダルを閉じてから `switchToNormalMap()` を呼ぶ共通関数
- **DEBUG console.log** (§54): `moveSidePlayer()` の G/H タイル検知時に `[DEBUG]` ログ出力（`?debug=1` 時のみ）
- **デバッグボタン更新** (§54): 帰還ゲート移動ボタンを x=2 に更新 + モーダル直接表示ボタン4つ追加（ステージ1/2/3ゴール、帰還ゲート）


## [0.11.3] - 2026-07-05 — 横スクロール帰還導線修正

### Fixed
- **`switchToNormalMap()` 戻り位置修正** (§53): 通常マップ(2,4)へ戻すよう修正。🌀ゲート(2,3)の1マス下なので再接触ループを防止
- **ゴールモーダル ボタン表示保証** (§53): 各ステージのゴールモーダルで `btn-side-goal-return` を `classList.remove("hidden")` で明示的に表示
- **ゴールモーダル 滞在ボタンラベル変更** (§53):
  - ステージ1: 「↩ この草原に残る」
  - ステージ2: 「↩ この森に残る」
  - ステージ3: 「↩ この町はずれに残る」

### Added
- **🏠 帰還ゲートタイル** (§53): 横スクロール各ステージのスタート付近 (x=0) に `'H'` タイル追加
  - ステージ1: (x=0, y=1) / ステージ2: (x=0, y=1) / ステージ3: (x=0, y=2)
- **帰還ゲートモーダル** (§53): `modal-side-return-gate` 追加。「🏠 通常マップへ戻る」「↩ やめる」ボタン付き
- **`openSideReturnGateModal()`** (§53): 帰還ゲート踏んだ時の確認モーダル表示関数
- **ヘルプ更新** (§53, index.html): 「🏠 横スクロールマップから戻る方法」セクション追加
- **NPC_DATA.D 更新** (§53): 横スクロール訪問済み時に帰還ゲートの説明を追加
- **ヒント屋 priority 11/13 更新** (§53): 帰還ゲート・ゴール画面から戻れる旨を追記
- **デバッグボタン** (§53): ステージ1/2/3帰還ゲート付近へ移動 / 通常マップへ強制帰還


## [0.11.2] - 2026-07-05 — 横スクロールマップ入口ゲート・道案内改善

### Added
- **🌀ゲートタイル** (§52): 通常マップ(2,3)に`'V'`タイル追加。踏むと横スクロールマップへ移動できる
- **ゲートモーダル** (§52): 初回は詳細説明（「はじまりの草原」への移動方法・帰り方）、2回目以降は短い確認のみ
- **gateExplained フラグ** (§52): `state.sideMap.gateExplained` を追加。saveGame/loadGame 対応済み（古いセーブは false で補完）
- **NPC台詞更新** (§52):
  - UMA博士(D): 横スクロール未訪問+Lv5以上でゲート場所ヒント追加
  - UMA博士(D): 図鑑捕獲数が少ない時に「UMAはHPが0になると逃げる」捕獲ヒント追加
  - 旅人(R): 横スクロール未訪問+ステージ1未クリア時にゲートヒント追加
  - 王様の使い(S): 低レベル+横スクロール未訪問時にゲートヒント追加
- **ヒント屋 priority 13** (§52): 横スクロール未訪問+Lv40未満 → 🌀ゲート案内ヒントを返す
- **ヘルプ更新** (index.html): 「🌀 横スクロールマップへの行き方」セクション追加
- **デバッグボタン** (§52, debug=1): 「🌀 ゲートタイル付近へ移動」「🔄 ゲート説明フラグリセット」

### Design Notes (未実装)
- 将来の捕獲補助技メモを GAME_DESIGN.md §52 に追加（はずかし固め/キドクラッチ/カリツォー/グーパンチ/ここはひとつガマン）


## [0.11.1] - 2026-07-05 — ステージ3安定化・デバッグ補強・ステージ4予告

### Added
- **`validateSideFixedEncounters()`** (§51): SIDE_FIXED_ENCOUNTERS の敵IDが NON_UMA_DATA に存在するか検証するdebug=1専用関数。
- **デバッグボタン2本追加** (§51):
  - `🏚️ ステージ3宝箱・固定敵リセット` (btn-debug-side-stage3-items-reset): stage3キーの openedChests/defeatedEnemies をすべて削除。
  - `🧪 固定敵IDチェック` (btn-debug-validate-encounters): validateSideFixedEncounters() を実行。

### Fixed
- **`triggerFixedEncounter()` 安全化** (§51): 未定義の敵IDが渡された際に `console.warn` を出力し `triggerEncounter()` へフォールバックするよう変更。従来は `return;` のみでエラーも出ずゲームが止まっていた。

### Changed
- **`openStage3GoalModal()`**: 魔王ゴリラ撃退後の全報酬受取時に「ゴリラ山道」「大魔王ゴリラ」の予告テキストを追加。
- **`getProgressHint()` priority 9**: 3ステージ制覇後のヒントをステージ4「ゴリラ山道」・大魔王ゴリラへの言及を含む内容に更新。
- **GAME_DESIGN.md §51 追加**: ステージ4「ゴリラ山道」将来構想・安定化項目の正式仕様を記録。

### Confirmed (変更なし)
- **固定敵IDはすべて実在**: `powerharassmentsenpai` / `wanderingman` / `deathmatch` はすべて NON_UMA_DATA に存在することを確認。
- **CSS表示問題なし**: `aspect-ratio: var(--cols)/var(--rows)` の実装により5行ステージも自動的に正しいサイズで表示される。変更不要。
- **進行度表示**: `stageData.name + "  📍" + sm.x + "/" + goalX + "  あと" + dist` の形式でステージ3も正しく表示される。

## [0.11] - 2026-07-05 — 横スクロールステージ3「古びた町はずれ」実装

### Added
- **SIDE_STAGE_DATA[3]「古びた町はずれ」** (§50): 40×5マップ。廃墟・荒れ地・5路構成。
  - row0 (最上段): 宝箱(x=18,x=35)
  - row1 (上段): NPC-商人?(x=10)
  - row2 (メイン): 老人NPC(x=3)、怪しい旅人NPC(x=5)、固定敵(x=15)、ボス魔王ゴリラ(x=31)、ゴール(x=38)
  - row3 (下段): 固定敵(x=12)
  - row4 (最下段): 宝箱(x=4,x=19)、固定敵(x=27)
- **魔王ゴリラ** (§50): HP400/ATK34/DEF11/EXP500/canCapture:false。ステージ3専用固定ボス。
- **openStage3GoalModal()**: 魔王ゴリラ撃退分岐 + 報酬二重取り防止 (stage3RewardLevel 0/1/2)。
  - level0→2(魔王倒済): 220G + ラーメン×1
  - level0→1(魔王未倒): 80G
  - level1→2(魔王倒後): 140G + ラーメン×1
- **openStage3NpcModal()**: 老人(y=2) / 怪しい旅人(y≠2)。魔王撃退前後でセリフ分岐。
- **「🏚️ 古びた町はずれへ進む」ボタン**: ステージ2ゴールモーダル + index.html に追加。
- **セーブ/ロード**: sideMapStage3Reward フラグ追加。
- **SIDE_FIXED_ENCOUNTERS**: ステージ3固定敵3体を追加 (powerharassmentsenpai/wanderingman/deathmatch)。
- **ヒント優先度12** (§50): ステージ2クリア・ステージ3未クリア時のステージ3ヒント。
- **renderStatus()**: ステージ3進捗2行追加。称号に「町はずれの覇者」「町はずれを越えし者」追加。
- **デバッグボタン5本追加**: stage3-enter / stage3-near-goal / stage3-clear-reset / set-maougori / maou-gorilla-encounter
- **ヘルプ**: 🏚️ ステージ3「古びた町はずれ」セクション追加。

### Changed
- **openStage2GoalModal()**: btn-side-goal-town を show する処理を追加。
- **moveSidePlayer() 'b' タイル**: stage===3 の場合 triggerFixedEncounter("maou_gorilla") を起動。
- **renderSideField() / moveSidePlayer()**: SIDE_MAP_HEIGHT/SIDE_MAP_WIDTH を動的に rows.length / rows[0].length で計算（5行ステージ対応）。
- **renderField()**: CSS `--rows` 変数をステージの行数に合わせて動的セット。
- **getHintPriority()**: 優先度12を追加（s2クリア・s3未クリア）、優先度9を「全3ステージクリア」に更新。
- **getProgressHint()**: priority 9/12 を更新・追加。

## [0.10.1] - 2026-07-05 — 攻略ペーパービュー屋ヒント拡張・ステージ別固定敵改善

### Added
- **SIDE_FIXED_ENCOUNTERS** (§49): ステージ別固定敵マップ。getSideKey() 形式のキーで敵IDを指定。
  - ステージ1 "31,1": wilddog (のらいぬ)
  - ステージ1 "14,2": bumpman (ぶつかりおじさん)
  - ステージ2 "2:14,1": wannabeninja (忍者かぶれ)
  - ステージ2 "2:12,2": bandit (山賊)
  - ステージ2 "2:32,2": oni (鬼)
- **ヒント優先度9/10/11** (§49): 横スクロール進捗に応じた新ヒント追加。
  - 9: ステージ1&2両方クリア → 次ステージ予告メッセージ
  - 10: ステージ1クリア・ステージ2未クリア → ボスゴリラ撃退状態で分岐
  - 11: ステージ未クリアだが横スクロールを訪問済み → 中ボスゴリラ撃退状態で分岐
- **デバッグボタン**: 「📰 ヒントショップを開く」ボタン追加 (btn-debug-open-hint-shop)

### Changed
- **moveSidePlayer() 'e' タイル**: SIDE_FIXED_ENCOUNTERS を参照し、マップ上に登録済みの固定敵はランダムエンカウントを使わず triggerFixedEncounter() で起動するように変更。
- **getHintPriority()**: 横スクロール進捗チェック (s1Cleared/s2Cleared/sideVisited) を追加、優先度を0〜11に拡張。
- **getProgressHint()**: 優先度9/10/11のヒントを追加。priority 10/11はボス/中ボス撃退フラグで内容が分岐。
- **renderHintResult()**: ヘッダ表示を「📄 〇〇を購入した！(NNG)」形式に変更。ヒント本文の「」括弧を除去。
- **ヘルプ**: ⚡固定敵の説明にステージ別詳細を追記。「📰 攻略ペーパービュー屋について」セクション追加。

## [0.10] - 2026-07-05 — 横スクロールステージ2「あやしい森」実装

### Added
- **ボスゴリラ** (§48): HP250/ATK26/DEF8/EXP290/canCapture:false。ステージ2専用固定ボス。
- **SIDE_STAGE_DATA[2]「あやしい森」** (§48): 40×3マップ。上路/中路/下路の3ルート。
  - row0 (高路): 宝箱(x=17)、NPC-A(x=20)
  - row1 (メイン): NPC-B(x=4)、固定敵(x=14)、ボスゴリラ(x=35)、ゴール(x=38)
  - row2 (下路): 宝箱(x=4,x=26)、固定敵(x=12,x=32)
- **「🌲 あやしい森へ進む」ボタン**: ステージ1ゴールモーダルにボタン追加。クリア時に表示。
- **getSideKey() ヘルパー**: ステージ別イベントキー生成でステージ間の衝突防止。
- **openStage2GoalModal()**: ボスゴリラ撃退分岐 + 報酬二重取り防止 (stage2RewardLevel 0/1/2)。
  - 撃退済み初回ゴール: 150G + 🍱お弁当×1
  - 未撃退初回ゴール: 50G
  - 差分報酬: 追加100G + 🍱お弁当×1
- **openStage2NpcModal()**: ボスゴリラ撃退フラグでNPC2人のセリフ分岐。
- **ステータス画面**: ステージ2クリア/ボスゴリラ撃退/称号「森の制覇者」追加。
- **ヘルプ**: 「🌲 ステージ2「あやしい森」」セクション追加。
- **デバッグボタン**: あやしい森へ移動 / 森ゴール直前 / ステージ2フラグリセット / ボスゴリラ撃退済み / ボスゴリラ強制ENC

### Changed
- **moveSidePlayer()**: getSideKey() 使用、ボスタイル('b')でステージによりmidboss/boss切り替え。
- **renderSideField()**: getSideKey() 使用、'b'タイルの撃破済み表示に対応。
- **openSideNpcModal()**: ステージ2ではopenStage2NpcModal()へルーティング。

### Fixed
- **v0.9.1互換補正**: stageCleared["1"]=true かつ sideMapStage1Reward=0 の古いセーブを読込時に補正（1 or 2 に自動設定）。

### Saved
- `sideMapStage2Reward` (number 0/1/2): state.sideMap.stage2RewardLevel

## [0.9.3] - 2026-07-05 — 横スクロールステージ1クリア体験強化

### Added
- **ゴール演出強化** (§47): 中ボス撃退有無でゴールモーダルを2パターンに分岐
  - 中ボス撃退済みで初回ゴール: "はじまりの草原を制覇した！" → 100G + パン×1
  - 中ボス未撃退で初回ゴール: "はじまりの草原を抜けた！" → 30G
  - 中ボス未撃退クリア後→中ボス撃退→再ゴール: 差分報酬 70G + パン×1
  - 全報酬受取後: "あやしい森・ボスゴリラ" のステージ2予告を表示
- **報酬二重受け取り防止**: `stage1RewardLevel` (0/1/2) で報酬状態を管理。`sideMapStage1Reward` としてセーブ。
- **ステータス画面進捗表示**: 「横スクロール進捗」セクション追加（クリア済み/撃退済み/横スクロール称号）
- **横スクロールNPCセリフ4パターン分岐**: stage1Cleared × midbossDefeated の組み合わせで旅人・案内人が変化
- **通常マップ旅人(R) セリフ追加**: ステージ1クリア後に「あやしい森」予告セリフを末尾に追加
- **ヘルプ追記**: 「🏁 横スクロールマップのゴールとクリア」セクション追加
- **デバッグ追加**: 「✅ ステージ1クリアフラグON」「✅ 中ボス撃退済みにする」ボタン追加
- **デバッグ更新**: 「クリア・撃破フラグをリセット」が `stage1RewardLevel` もリセットするように変更

### Changed
- **ゴールモーダルのボタンラベル**: クリア済み再訪時に「もう一度草原を探索する」に動的変更
- **旧ゴール報酬 (50G固定)** → 分岐報酬 (30G / 100G+パン / 差分70G+パン) に変更

## [0.9.2.1] - 2026-07-05 — 中ボスゴリラ捕獲不可・実機確認補強

### Fixed
- **中ボスゴリラ捕獲不可** (§46): `canCapture: false` フラグを追加。`attemptCapture()` 冒頭でブロック。`clamp(0.05, 0.95)` の下限により `captureRate:0` でも5%捕獲チャンスが残る問題を解消。
- **UMA・通常モンスター・究極ゴリラの捕獲ロジックは変更なし**

### Added
- **捕獲不可メッセージ**: "中ボスゴリラはUMAではない！ 捕まえる相手ではなく、道をふさぐ強敵だ！"
- **gainExp() ログ改善** (§46): ノリオ効果時に "(元EXP → 最終EXP)" を表示。例: "📈 ノリオ効果！ EXP 2倍！ (80 → 160)"
- **中ボス撃退後NPCセリフ変化**: `defeatedEnemies["36,1"]` を参照し横スクロール案内人・旅人NPCのセリフが変化。ゴリラ研究家(Lv10以上)にも撃退前後の分岐を追加。
- **ヘルプ追記**: 「💢 ボス系モンスターについて」セクション追加。仲間システムのノリオ説明を「経験値2倍」に更新。
- **デバッグ追加**: 「EXPを0にする(ノリオ効果確認用)」ボタン。

## [0.9.2] - 2026-07-05 — のりお指令②: 中ボスゴリラ・敵再調整・のりお効果変更

### Added
- **中ボスゴリラ** (§45): 横スクロールステージ1 x=36 に 'b' タイルとして配置。HP150, ATK20, DEF5, EXP160。captureRate:0, fleeRate:0.30。専用逃走メッセージあり。
- **新タイル 'b'** (💢): 中ボスゴリラ固定戦闘タイル。SIDE_TILE_EMOJI / SIDE_NO_ENCOUNTER に登録。
- **`triggerFixedEncounter(enemyId)`**: 固定IDの敵を直接起動する関数。
- **`gainExp(baseExp)`**: EXP取得共通ヘルパー。のりお同行時に "📈 ノリオ効果！ EXP 2倍！" ログ付きで2倍処理。
- **デバッグ追加**: 中ボスゴリラ強制エンカウント・ノリオを仲間にする・中ボスゴリラ撃退フラグリセット

### Changed
- **のりお仲間能力**: 逃走成功率+0.15 (fleeMod) → 獲得経験値×2 (expMod:2)。emoji/feature/effectDesc/joinMsgs/failMsgs も更新。
- **敵HP/EXP全体底上げ**: 序盤(minLv1-2)×1.5〜1.6、中盤(minLv3-7)×1.7、後半(minLv5+)×2.0〜2.1。UMA×1.2。メタル系・究極ゴリラは変更なし。
- **winBattle()**: `customEscapeMsgs` に対応（ボス専用逃走メッセージ）。gainExp 使用に変更。
- **doRun()**: gainExp 使用に変更。
- **attemptCapture()**: gainExp 使用に変更。
- **doSingUltimateGorilla()**: gainExp 使用に変更。
- **actuallyStartBattle()**: `customEscapeMsgs` を state.enemy にコピー。
- **SIDE_STAGE_DATA row1**: x=36 を 'g' → 'b' (中ボスゴリラ) に変更。
- **NPC会話**: UMA博士・旅人・ゴリラ研究家・横スクロールNPC に中ボス/経験値ヒントを追加。
- **デバッグ「ゴール直前」**: x=35→x=34 に変更（中ボスゴリラx=36の手前）。

## [0.9.1] - 2026-07-05 — 横スクロールマップ探索性アップデート

### Added
- **縦移動の有効化** (§44): y=0〜2 を自由に移動。迂回路A(x=11-13)・迂回路B(x=27-29)
- **マップ再設計**: 高路(安全)・メイン・低路(危険/報酬多)の3ルート、木ブロックで迂回誘導
- **新タイル**: `G`(🏁 ゴール), `p`(🧑 旅人NPC)
- **固定敵撃破追跡**: `state.sideMap.defeatedEnemies` + `finishBattle()` フック
- **ゴールモーダル** (`#modal-side-goal`): 50G報酬 (一回のみ)、「通常マップへ戻る」/「探索を続ける」
- **NPC2 (旅人)**: 高路と低路の使い方を示唆するセリフ
- **宝箱バリエーション**: 金(40%)・コーヒー(20%)・パン(20%)・やくそう(20%)
- **進捗バー更新**: "あとN" 形式 + クリア済みは "✅ クリア済み" 表示
- **デバッグ追加**: スタート地点・ゴール直前・クリア/撃破フラグリセット
- **ヘルプ更新**: 横スクロールマップの3ルート説明を追加
- **セーブ追加**: `sideMapDefeated`, `sideMapCleared` (古いセーブは `{}` で補完)

### Changed
- `SIDE_STAGE_DATA[1].rows`: 新マップデザイン(3ルート)に置き換え
- `openSideNpcModal()`: `npcType` 引数で案内人/旅人のセリフを切り替え

## [0.9] - 2026-07-05 — 横スクロールマップ試作

### Added
- **横スクロールマップモード** (§43):
  - `state.mapMode: "normal"|"side"` + `state.sideMap {x,y,stage,openedChests}` 追加
  - `SIDE_STAGE_DATA` ステージ1「はじまりの草原」(40×3 タイルマップ): g/f/#/~/c/n/m/e/. タイル
  - `SIDE_MAP_WIDTH=40`, `SIDE_MAP_HEIGHT=3`, `SIDE_VIEW_COLS=9`, `SIDE_VIEW_ROWS=3`
  - `renderField()` スマートディスパッチ: side モード時に --cols/--rows 更新後 `renderSideField()` へ
  - `renderSideField()`: 横スクロールカメラ・タイル描画・プレイヤー🦍・📦開封済み宝箱
  - `moveSidePlayer(dx, dy)`: 衝突判定・タイルイベント(宝箱/NPC/商人/固定戦闘/ランダム戦闘)
  - `openSideChest(x, y)`: 開封済み管理・30〜100G 報酬
  - `openSideNpcModal()`: 旅の案内人 — 既存 `npc-modal` を流用
  - `switchToSideMap()` / `switchToNormalMap()`
  - `startWalking()` / キーボードハンドラ / スワイプハンドラ: mapMode 分岐追加
  - デバッグ: 「⬇️ 横スクロールマップへ移動」「⬆️ 通常マップへ戻る」ボタン
  - `saveGame()` / `loadGame()`: mapMode・sideMapX/Y/Stage/Chests 追加 (古いセーブは || デフォルト値)
  - `index.html` に `#side-map-info` 情報バー追加(通常マップでは非表示)

### Notes
- 既存通常マップ・戦闘・NPC会話・BGM制御・セーブデータ構造に変更なし
- 今回実装しないもの: 横スクロール専用BGM / 複数ステージ移動 / 縦移動


## [0.8.8.1] - 2026-07-05 — 緊急バグ修正: ステータスメニュー復旧・攻略ペーパービュー屋修正

### Fixed
- **ステータスメニュー非表示の修正** (§42):
  - 原因: `viewport-fit=cover` + iOS Dynamic Island/ノッチの safe area 未対応
  - `style.css` の `#game` に `padding-top: env(safe-area-inset-top, 0px)` 追加
  - `#dpad` に `padding-bottom: env(safe-area-inset-bottom, 0px)` 追加 (iPhone ホームバー対策)
- **攻略ペーパービュー屋 `undefinedG` 表示修正** (§42):
  - 原因: `renderHintShopMenu()` / `buyHint()` が `p.money` を参照(存在しないプロパティ)
  - `p.money` → `p.gold` に修正 (3箇所: 表示・disabled判定・購入処理)
- **攻略ペーパービュー屋 購入不可修正** (§42): 同上(金額比較が `undefined >= cost` → 常に false)
- **攻略ペーパービュー屋 ラベル縦崩れ修正** (§42):
  - 原因: `.shop-menu-btn` の `width: 100%` が flex コンテナ内でボタン全幅を占有し span が潰れる
  - `.shop-row .shop-menu-btn { width: auto; flex: 0 0 auto; }` 追加

### Notes
- GAME_DESIGN.md §42 追記
- BGM制御・モンスター・装備・マップに変更なし


## [0.8.8] - 2026-07-05 — NPCセリフ拡充・攻略ヒント強化

### Added
- **NPC_DATA 全5NPC のセリフ拡充** (§41):
  - D(UMA博士): lv<5/lv5-9/lv≥10 の3段階追加。UMA vs 通常モンスターの説明、メタルゴリラヒント
  - R(旅人): lv≥15 段階追加。逃げ作戦・装備重要性を強化。既存 lv<10 のらいぬヒントは維持
  - K(鍛冶屋): lv<10 向け装備アドバイス・のらいぬ対策、lv20-39 宝箱アドバイス、lv<30 伝説テーザー追加
  - E(ゴリラ研究家): lv<10 向けゴリラ種類説明(通常/メタル/究極)、lv10-49 メタルゴリラヒント追加、クリア後テキスト強化
  - S(王様の使い): クリア前をlv≥50/else 2段階化、逃げても良いこと・目標を明示。クリア後テキスト強化
- **HOME_HINTS 6件追加** (§41): 計13→19件
  - のらいぬが怖い時は逃げてOK / レベルアップ効果 / 装備重要性 / メタルゴリラ / 経験値 / 宝箱
- **ヘルプ画面2セクション追加** (§41):
  - 「💡 戦闘のコツ」: 逃げ作戦・のらいぬ警告・HP0経験値・レベルアップ効果
  - 「👾 モンスターの種類」: 通常モンスター/UMA/メタルゴリラ系の特徴
- **デバッグボタン追加** (§41): Lv.1/Lv.5/Lv.10 設定ボタン（NPC会話テスト用, `?debug=1` のみ）

### Fixed
- ヘルプ画面の「逃げられた！」表記を「逃げていった！！」に修正（v0.8.7 の変更と整合）

### Notes
- GAME_DESIGN.md §41 追記
- 今回追加したのはテキスト・ヒント類のみ。BGM制御・モンスター・装備・マップに変更なし


## [0.8.7] - 2026-07-04 — のりお指令: モンスター追加・のらいぬ調整・戦闘メッセージ改善

### Added
- **通常モンスター26体追加** (§40): のりおプロデューサー指令によるモンスター追加
  - 序盤(minLevel 1): キャンプ女子⛺・小籠包🥟・弾き語り女子🎤・失礼な人🤬
  - 中盤(minLevel 3-4): 忍者かぶれ🎭・強肩キャッチャー⚾・半グレ🧢・バンギャ💀・古着屋兄さん👕・先生📏・グルメ気取り🍜・痴漢🚇
  - 後半(minLevel 8-12): アンドレ💪・デスマッチレスラー🤼・三鷹のよっぱらい🍺・教頭👔・校長🎓・いんちき放送作家📺・エセ脚本家✍️・インプラント歯医者🦷・霊界探偵🔮・空手姉妹🥋・グラビアアイドル📸・宇宙人👽・異邦人🌍・来訪者🚪
  - 特殊行動付き: 半グレ(におい付与)・いんちき放送作家/霊界探偵(所持金を盗む)・エセ脚本家/インプラント歯医者(MP吸収)・痴漢/三鷹のよっぱらい(不意打ち)
- **`startMsg` フィールドと表示サポート追加**: モンスターデータに専用出現メッセージを定義できるようになった。`actuallyStartBattle()` で出現メッセージ直後に表示
- **デバッグボタン追加**: のらいぬ強制エンカウント / ランダム通常モンスター強制エンカウント (`?debug=1` のみ)

### Changed
- **のらいぬを序盤の強敵に調整** (§40): HP 13→18, 攻撃 5→8, 防御 1→2, EXP 7→12, 出現重み 8→5
  - `startMsg` 追加: 「のらいぬが低くうなっている……！ レベルが低いうちは逃げるのが賢明かもしれない。」
  - 初期Lv(atk=5, def=2時)では2〜3発耐える耐久力で序盤に緊張感を演出
- **HP0時の戦闘終了メッセージ改善** (§40): 「○○に逃げられた！」→ランダムバリエーション4種
  - 「は逃げていった！！」「はあわてて逃げていった！！」「はフラフラしながら逃げていった！！」「は戦意を失って逃げていった！！」
  - 「倒した感じ」を出しつつ「逃走描写」を維持
- **旅人NPC にヒント追加**: Lv10未満のプレイヤーに「のらいぬは序盤では意外と強い。危ないと思ったら「にげる」を使うのも立派な勇者の判断」を表示

### Notes
- GAME_DESIGN.md §6.1テーブル更新・§13メッセージ表記更新・§40追記
- README.md 遊び方の「逃げられた」表記を「逃げていった」に更新

---

## [0.8.6.3] - 2026-07-04 — BGMノード完全停止・予約音キャンセル修正

### Fixed
- **BGM重複再生（約5秒の重なり）根本修正** (§39): v0.8.6.2でも約5秒のBGM重複が残っていた問題を修正
  - **根本原因1**: `activeBgmNodes` に `osc` 単体のみ保存していたため、`gain.gain` のスケジュール済み音量変化をキャンセルできず旧BGMの音が残り続けた
  - **根本原因2**: `activeBgmTimers` 未実装で旧セッションの `setTimeout` がキャンセルされず、旧ループタイマーが発火して新BGMに `_scheduleBGMLoop` が二重実行されていた
  - **修正**: `stopBGMHard()` 新設。4段階消音: ①セッションID更新 ②全タイマー `clearTimeout` ③全ノードの `gain=0` + `gain.disconnect()` ④マスターゲイン破棄
  - `activeBgmNodes` を `{osc, gain}` ペアで追跡するよう変更
  - `activeBgmTimers` 配列を実装。タイマー発火時に自身を配列から削除し、セッション比較でスキップ
  - `bgmSessionId` を導入。`stopBGMHard()` で +1。古いタイマーコールバックが `capturedSession !== bgmSessionId` でスキップ
  - `stopBGM()` は `stopBGMHard()` のエイリアスに変更（後方互換）
  - デバッグボタン「BGM完全停止(stopBGMHard)」追加。トーストに `activeBgmNodes` 件数を表示

### Notes
- GAME_DESIGN.md §38更新 + §39追記
- TODO.md v0.8.6.3エントリ追加

---

## [0.8.6.2] - 2026-07-04 — BGM即時切り替え修正

### Fixed
- **BGM重複再生（約2秒の重なり）根本修正** (§38): 戦闘開始/終了時に旧BGMが約2秒間鳴り続ける不具合を修正
  - **根本原因**: `_scheduleBGMLoop` で `osc.stop(t+dur)` 呼び済みのノードに `stopBGM()` が再度 `stop()` を呼ぶと Web Audio API が `InvalidStateError` をスロー。これを `try-catch` で握りつぶしていたため旧BGMが止まらなかった
  - **修正**: `bgmMasterGain`（全BGMノードの共通出力先 GainNode）を導入。`stopBGM()` で `bgmMasterGain.disconnect()` を実行し音声グラフから切断することで即消音
  - `getOrCreateBgmMasterGain()` ヘルパー追加。BGMセッションごとに新規生成
  - `_scheduleBGMLoop()`: 各ノートの `gain` を `audioCtx.destination` ではなく `bgmMasterGain` に接続するよう変更
  - `startBGM()` / `stopBGM()`: `DEBUG_MODE` 時に `[BGM] immediate switch` / `stop immediate` / `play` のコンソールログを出力

### Notes
- GAME_DESIGN.md §34 BGM切り替え方針を更新、§38 追記

---

## [0.8.6.1] - 2026-07-04 — 状態異常ゴーストキー修正

### Fixed
- **`clearAilment` ゴーストキー問題**: アレルギー/においカウントが0になった時に `clearAilment` が `hasAilment`(value>0チェック) で空振りし `statusAilments` にvalue=0のキーが残留するバグを修正
  - `clearAilment` の入口ガードを `!hasAilment(id)` → `!(id in state.player.statusAilments)` に変更。value=0でも正しくキーを削除しトーストを表示
- **`doRest` の `hadAilments` 誤判定**: `Object.keys(p.statusAilments).length > 0` はゴーストキー(value=0)を有効な状態異常と誤判定し「体調もよくなった！」を表示していた。`hasAilment` ベースのチェックに変更

---

## [0.8.6] - 2026-07-04 — BGM重なり修正 + 攻略ペーパービュー屋

### Fixed
- **BGM重なり再生バグ** (§36): BGM切り替え時に旧BGMが停止せず重なる問題を修正
  - `bgmGeneration` カウンタを導入。`stopBGM()` でインクリメントし、古いループの setTimeout コールバックが世代不一致で自動失効
  - `activeBgmNodes[]` で全オシレーターを追跡。`stopBGM()` でノード全停止 + 切断
  - `_scheduleBGMLoop()` に `gen` 引数を追加。先頭・setTimeout 内の2か所で世代チェック
  - `startBGM()` が `stopBGM()` 後に現世代番号をキャプチャしてループに渡す
  - デバッグBGMボタンの `bgmCurrentType = null` を `stopBGM()` に修正

### Added
- **攻略ペーパービュー屋NPC** (§37): フィールド (4,3) に 📰 NPC を配置（マップ文字 `N`）
  - 10G / 50G / 100G の3段階ヒント購入メニュー (`hint-shop-modal`)
  - `getHintPriority()`: 現在進行状況を優先度0〜8に分類
  - `getProgressHint(tier)`: 優先度 × 3段階でヒント文字列を返す
  - 購入時: `playSE("itemGet")` + 所持金減算 + `saveGame()`
  - 「もう一度買う」でメニューに戻れる
  - 所持金不足時はボタンを無効化

### Notes
- GAME_DESIGN.md §36, §37 追記

## [0.8.5] - 2026-07-04 — Lv99到達演出・成長達成感アップ

### Added
- **`level99` SE** (§35): 7ノートの上昇ファンファーレ。`levelUp` SE より長く・大きい音
- **`state.eventFlags.level99Reached`**: Lv99到達フラグ（`level99Shown` と独立管理）
- **デバッグ機能** (`?debug=1`):
  - 「📉 Lv.98にする」 (`debugSetLevel98()`)
  - 「⬆️ 次の戦闘でLvUP(EXP設定)」 (`debugSetLvUpExp()`)
  - 「🔄 Lv99到達フラグをリセット」 (`debugResetLv99()`)

### Changed
- **`openLv99Modal()`**: ドラマチックな内容に強化（長旅の結実・ウクレレ案内・締め言葉）
- **`levelUp()`**: Lv99到達時は `levelUp` SE の代わりに `level99` SE を再生、`eventFlags.level99Reached = true` をセット
- **ステータス称号**: Lv99到達（未クリア）時に「究極に近づきし者」を表示
- **ゴール表示**: Lv99到達済み（ウクレレ未所持）のテキストに強調スタイルを適用
- **実家ヒント** (`openHomeModal()`): Lv99到達後はランダムヒントの代わりに文脈ヒントを表示
- **NPC・UMA博士 (D)**: Lv99到達後 / クリア後の専用セリフに分岐
- **`debugSetLevel99()`**: 初回実行時は `level99` SE + Lv99モーダルを表示（再実行はトーストのみ）
- **`debugPlayLv99Event()`**: `level99` SE を追加再生

### Notes
- GAME_DESIGN.md §35 追記

## [0.8.4] - 2026-07-04 — BGM/SE・サウンド設定

### Added
- **サウンドシステム** (§34): Web Audio API ベースの BGM/SE 基盤
  - BGM 3種: `"field"` (フィールド) / `"battle"` (バトル) / `"ending"` (エンディング)
  - SE 9種: `battleStart` / `attack` / `damage` / `captureOk` / `captureFail` / `levelUp` / `chestOpen` / `itemGet` / `endingStart`
  - `startBGM(type)` / `stopBGM()` / `updateBGM(type)` / `playSE(type)` 関数
  - `_scheduleBGMLoop()`: OscillatorNode を使った setTimeout ループ方式
  - `initAudioContext()`: ユーザー操作時に AudioContext 初期化（iOS 自動再生制限対応）
  - `loadSoundSettings()` / `saveSoundSettings()`: 別キー `"ultimateGorillaSoundV1"` で保存
- 設定画面に 🔊/🎵/🔔 トグルボタンを追加
- デバッグ: SE テスト・各 BGM テスト・BGM 停止ボタン（`?debug=1` 時のみ）
- `SOUND_KEY` 定数: `"ultimateGorillaSoundV1"`

### Changed
- `actuallyStartBattle()`: バトル BGM 開始 + `battleStart` SE
- `finishBattle()`: フィールド BGM に戻す
- `openEndingModal()`: エンディング BGM 開始 + `endingStart` SE
- エンディング終了（「冒険を続ける」): フィールド BGM に戻す
- `bindDpadHold()` / キーボード入力: 最初の操作でフィールド BGM を開始
- `doFight()`: `attack` SE
- `enemyTurn()`: `damage` SE
- `attemptCapture()`: `captureOk` / `captureFail` SE
- `levelUp()`: `levelUp` SE
- `openChest()` / `openUkuleleChest()` / `openLegendaryChest*()`: `chestOpen` SE
- `giveKingReward()`: `itemGet` SE
- `init()`: `loadSoundSettings()` を呼ぶ

### Notes
- GAME_DESIGN.md §34 追記

## [0.8.3] - 2026-07-04 — 伝説装備追加・NPCヒント連動イベント

### Added
- **キグナスのかぶと** (§33): フィールド ✨宝箱 (X, 9,6)、Lv40以上で入手。防御+12 HP+5
- **ドラゴンのたて** (§33): 王様の使いNPCとの接触、gameCleared後に授与。防御+26 HP+8
- `openLegendaryChestX()`: キグナスのかぶと伝説宝箱ロジック
- `giveKingReward()`: 王様の使い経由のドラゴンのたて授与ロジック
- movePlayer: Xタイルハンドラ追加、Sタイルを王様報酬分岐に対応
- `state.eventFlags` に `cygnusHelmetGot` / `dragonShieldGot` を追加
- LEGEND_EQUIPS: 5種 → 7種に拡張

### Changed
- `cygnuskabuto`: `defBonus: 8, buyPrice: 70` → `defBonus: 12, hpBonus: 5, isLegendary: true`（商人購入不可・強化）
- `dragonshield`: `defBonus: 12, buyPrice: 100` → `defBonus: 26, hpBonus: 8, isLegendary: true`（商人購入不可・強化）
- 旅人(R) NPC: Lv40+ で✨宝箱のヒントを追加
- 鍛冶屋(K) NPC: キグナスのかぶと・如意棒のヒントを段階別に更新
- 王様の使い(S) NPC: dragonShieldGot 後は「見守っている」セリフに更新
- ステータス画面・目標画面の伝説装備進捗: `/5` → `/LEGEND_EQUIPS.length` (動的)
- `debugGetAllLegendary` / `debugResetLegendary`: 新装備2種を追加

### Notes
- GAME_DESIGN.md §33 追記

---

## [0.8.2] - 2026-07-04 — NPC会話システム・ヒント導線強化

### Added
- **固定NPC 5人をフィールドに配置 (§32)**:
  - 🔎 UMA博士 (2,2): 図鑑収集ヒント・メタルゴリラ案内
  - 🧳 旅人 (5,5): 伝説宝箱・フィールド探索ヒント
  - 🔨 鍛冶屋 (10,2): 装備・伝説装備の売却不可・如意棒ヒント
  - 📚 ゴリラ研究家 (6,9): 究極ゴリラ捕獲条件ヒント
  - 👑 王様の使い (10,1): クリア後報酬（アンドロメダの鎖）案内
- **NPC会話モーダル (`npc-modal`)**: NPC接触で名前・絵文字・セリフを表示
- **状態別セリフ**: level・hasUkulele・gameCleared・eventFlags・companions に応じてセリフ動的切り替え
- 新タイル D/R/K/E/S を TERRAIN_EMOJI・SAFE_TILE に追加
- `.npc-speech` スタイル追加（青背景吹き出し）

### Notes
- 会話済みフラグなし。毎回話しかけ可能
- GAME_DESIGN.md §32 追記

---

## [0.8.1] - 2026-07-04 — UMA図鑑詳細表示・図鑑強化

### Added
- **図鑑進捗表示 (§31)**: 図鑑一覧上部に「📖 発見: N/9」「✅ 捕獲: N/9」を追加
- **UMA詳細モーダル (`uma-detail-modal`)**: 発見済み・捕獲済みのUMAをタップすると詳細を表示
  - No.（001〜009）/ 名前 / 絵文字 / レア度 / 分類 / 捕獲状態
  - HP / 攻撃力 / 防御力 / 捕獲率 / 経験値 / 売却価格
  - 状態異常付与情報（ビッグフット等）
  - 説明文（descフィールド）
- **究極ゴリラの特別詳細表示**:
  - 捕獲前: 「普通のつかまえるは通用しない」警告を表示
  - 捕獲済み: 金枠、「★ 伝説のUMA」「🌿 森へ帰った」バッジ
- **メタル系セクション**: 図鑑下部に常時表示されるメタルゴリラ3種エントリ、タップで詳細表示
  - 特徴（出現率・防御・経験値）と説明文を表示
- **全UMA（9種）+ メタル系（3種）に `desc` フィールド追加**（フレーバーテキスト）
- **ステータス画面の図鑑進捗を2行表示**:「図鑑発見 N/M」「図鑑捕獲 N/M」
- `.dex-clickable` クラス: cursor:pointer + タップアニメーション
- `.dex-progress` クラス: 進捗表示レイアウト
- GAME_DESIGN.md §31 追記

### Not implemented (今回は明示的に未実装)
- 図鑑フィルター（全表示/発見済み/捕獲済み/未捕獲/レア/メタル系）
- メタル系の遭遇記録トラッキング（dexへの登録）
- 大量のUMA追加


## [0.8] - 2026-07-04 — 伝説装備イベント・終盤探索強化

### Added
- **伝説装備5種のイベント限定入手システム (§30)**:
  - ペガサスのよろい (防御+14 HP+5): フィールド 🌟 宝箱(タイルA, 座標11,4)、Lv50以上
  - 六連のたて (防御+20): 実家で休む、Lv60以上
  - 宇宙のかぶと (防御+15): フィールド ⭐ 宝箱(タイルC, 座標11,11)、女神のウクレレ所持
  - 如意棒 (攻撃+58): フィールド 🪄 宝箱(タイルJ, 座標7,15)、Lv70以上＋ジュリタニ同行
  - アンドロメダの鎖 (攻撃+44): 実家で休む、gameCleared後
- **`isLegendary: true` フラグ**: 装備データ5種に追加
- **伝説装備売却不可**: 商人画面「売却不可」disabled表示、`sellEquip()` でも二重チェック
- **装備画面 `★伝説` マーク**: `renderEquipBody()` で凡例表示
- **ステータス画面「★ 伝説装備 (N/5)」セクション**: 入手済/未入手を一覧表示
- **目標表示強化**: Lv50+/Lv60+/Lv70+/クリア後のそれぞれでヒントを動的表示
- **`HOME_HINTS` 追加(4件)**: 伝説宝箱・実家イベントへのヒント
- **`state.eventFlags` 管理**: セーブ/ロード/ニューゲーム対応
- **新マップタイル A/C/J**: SAFE_TILE・TERRAIN_EMOJI・renderField・movePlayer すべてに追加
- **`checkHomeEvents()` 関数**: 実家イベントで六連のたて・アンドロメダの鎖を付与
- **`openLegendaryChestA/C/J()` 関数**: フィールド伝説宝箱の開封処理
- **`LEGEND_EQUIPS` 定数**: ステータス画面進捗表示用リスト
- **デバッグメニュー拡張**: 「⭐ 伝説装備を全入手」「🔄 伝説装備フラグをリセット」ボタン追加

### Not implemented (今回は明示的に未実装)
- BGM/SE・2周目・横スクロールマップ実装本体・ボスダンジョン


## [0.7.1] - 2026-07-03 — レベル99到達マイルストーン演出 + 継続開発体制整備

### Added
- **レベル99到達マイルストーンモーダル(§3.8)**:
  戦闘終了後、初回Lv99到達時に専用モーダルを表示。
  - ウクレレ所持済み → クリア手順ヒントを表示
  - ウクレレ未所持 → 次の目標(ウクレレ探索)を案内
  モーダルを閉じると通常フィールドに戻る。エンディングとの同時到達はエンディング優先。
- **`level99Shown` フラグ**: `saveGame()` / `loadGame()` に追加。同じプレイスルーで二度表示しない。
  `newGame()` でリセット。
- **デバッグメニュー拡張(§26)**:
  「🎖 Lv99演出を再生」ボタンを `?debug=1` モードに追加。
- GAME_DESIGN.md §3.8 (新規)、§5.5 (横スクロールマップ大型計画) を追記・更新。
- TODO.md 将来の大型改修セクションに横スクロールマップ(v0.9+)を追記。
- **継続開発体制ドキュメントを整備**:
  - `CLAUDE.md` — Claude Code への開発ルール（ES5/セーブ互換/デバッグ/UIルール等）
  - `HANDOFF.md` — 新セッション引き継ぎ資料（実装状況・ファイル一覧・次の推奨実装順）
  - `DEVELOPMENT_CHECKLIST.md` — 実装前後の確認チェックリスト
  - `PROMPTS/START_NEW_SESSION.md` — 新セッション開始用プロンプトテンプレート
  - `.claude/skills/ultimate-gorilla-dev/SKILL.md` — プロジェクト専用 Skill 定義

### Not implemented (今回は明示的に未実装)
- Lv99時の演出アニメーション・フラッシュ効果
- Lv99専用BGM
- 横スクロールマップ本体（計画のみ）

---

## [0.7] - 2026-07-03 — 本格エンディング・クリア演出

### Added
- **5ページ構成のエンディングモーダル(§28)**:
  暫定クリアモーダルを本格エンディングに昇格。
  - 🎵 女神のウクレレ(ウクレレを奏でる描写)
  - 🦍 究極ゴリラ、森へ帰る
  - 👑 王様への報告(「帰すことも勇者の務めなのじゃ」)
  - 🎬 スタッフロール風クレジット(ENDING_CREDITS 配列で管理)
  - 🏆 クリアおめでとう！(称号・継続プレイ案内)
  「つぎへ ▶」でページ送り、最終ページで「冒険を続ける」に変わる。
- **クリア称号を追加(§28)**:
  ステータス画面(📊)の最上部に称号行を表示。
  クリア前「勇者の子孫」/ クリア後「森に歌を届けし者」。
- **エンディング再視聴(§28)**:
  設定画面(⚙️)にクリア後「🎬 エンディングを見る」ボタンを追加。
  ステータス画面(📊)の重要アイテム欄にも同ボタンを追加。
- **図鑑の究極ゴリラ特別表示(§28)**:
  捕獲済み時に金枠 + 「伝説のUMA」「森へ帰った」を追加表示。
- **デバッグメニュー拡張(§26/§28)**:
  「🎬 エンディングを再生」「🏆 クリア済みにする」ボタンを追加。
- GAME_DESIGN.md §3.6/§14.5/§17/§28/§29 を追記・更新。

### Not implemented (今回は明示的に未実装)
- BGM/SE・アニメーション付き本格エンドロール
- 2周目要素・クリア後の強化コンテンツ
- 横スクロールマップ・ボスダンジョン
- 仲間フィールド追従・固有イベント
- 最強装備のイベント入手


## [0.6.1] - 2026-07-02 — クリア導線・バランス調整・テスト補助

### Added
- **ステータス画面に「🎯 現在の目標」セクションを追加(§3.6)**:
  進行状態に応じて6段階で自動切替表示。
  序盤→中盤→終盤→クリア後と段階的にガイド。
- **実家モーダルにランダムヒントを追加(§3.7)**:
  実家に帰るたびに9種類のヒントからランダムで1つ表示。
  女神のウクレレ・メタルゴリラ・究極ゴリラ捕獲条件などをさりげなく案内。
- **目的説明モーダルの内容を更新**:
  レベル99目標・女神のウクレレ・「うたう」コマンドのヒントを追記。
- **暫定クリアモーダルの内容を改善**:
  クリア後も続けられる旨・正式エンディング予告を追記。
- **メタルゴリラ系のEXP大幅増量(§6.3)**:
  メタルゴリラ: 40→120 / はぐれメタルゴリラ: 120→400 / フルメタルゴリラ: 300→1000。
- **メタルゴリラ系出現率を微増**: METAL_ENCOUNTER_CHANCE: 0.04→0.06。
- **メタルゴリラ系遭遇時の専用メッセージ**: 「キラリと光った！経験値のチャンスだ！」
- **EXPカーブを緩和**: 必要経験値の算式を `level×15+20` → `level×10+15` に変更(約33%減)。
- **デバッグメニューを追加(§26)**:
  URLに `?debug=1` を付けた時のみ設定画面に表示。
  - Lv.99にする / 女神のウクレレを入手 / 究極ゴリラ強制エンカウント /
    敵HP5設定(戦闘中のみ) / 9999G追加 / クリア・ウクレレをリセット
- GAME_DESIGN.md §3.6/§3.7/§6.3/§26/§27 を追記・更新。

### Not implemented (今回は明示的に未実装)
- 本格的なエンディング画面・エンドロール
- 2周目要素・クリア後の強化コンテンツ
- BGM/SE・音楽演出
- 横スクロールマップ・ボスダンジョン
- 大規模なレベルバランス再設計


## [0.6] - 2026-07-02 — うたう・女神のウクレレ・究極ゴリラ捕獲条件

### Added
- **「🎵 うたう」戦闘コマンドを追加(§12.5)**:
  battle-menu に 6個目のボタンとして追加。どのタイミングでも使用可能。
  - 通常敵: 次の「つかまえる」の捕獲率を +0.05 する(ハルミ同行中は +0.08)
  - ハルミ同行中は「ハルミが音程を整えた！」専用メッセージを表示
  - 究極ゴリラ相手: 条件に応じた専用判定を行う(下記参照)
- **重要アイテム「女神のウクレレ」を追加(§14.5)**:
  - マップに専用タイル 'U'(🪗)を追加。場所はフィールドの南側。
  - 一度開封すると再入手不可(openedChests に記録)。
  - `state.player.hasUkulele` として保存。ニューゲームでリセット。
  - ステータス画面「重要アイテム」欄で所持状態を確認できる。
- **究極ゴリラへの通常捕獲をブロック(§14.5)**:
  「つかまえる」「捕獲ロープ」ともに「普通の捕獲は通用しない！」でブロック。
- **究極ゴリラへの「うたう」条件判定(§14.5)**:
  条件未達時は条件ごとの専用メッセージ → 敵ターンへ。
  条件達成時(Lv99 + 女神のウクレレ所持 + HP1〜10): 5行の特別演出 + 捕獲成功。
- **暫定クリアモーダル**: 究極ゴリラ捕獲後、フィールドに戻ると暫定クリアモーダルを表示。
- **`gameCleared` フラグをセーブデータに保存**: ニューゲームでリセット。
- **ステータス画面に「重要アイテム」セクションを追加**: 女神のウクレレ所持状態・クリア記録を表示。
- **ヘルプ画面に「うたうコマンド」と「究極ゴリラの捕まえ方」を追加**。
- GAME_DESIGN.md §3/§8.6/§12.5/§14.5/§17 を更新、§25(v0.6未実装リスト)を追記。

### Not implemented (今回は明示的に未実装)
- 本格的なエンディング画面・エンドロール(暫定クリアモーダルのみ)
- 2周目要素・クリア後の強化コンテンツ
- レベル99到達時の専用演出
- BGM/SE・音楽演出


## [0.5.1] - 2026-07-01 — 酒場・仲間加入演出改善

### Added
- **仲間加入に成功/失敗の2分岐を追加(§10)**:
  仲間候補ごとの `joinRate` によるランダム判定を実装。
  失敗しても候補は酒場に残り、何度でも再挑戦できる。
  - ジュリタニ: 70%、シュリタニ: 65%、ノリオ: 75%、ハルミ: 60%
- **仲間固有の台詞を実装**: 成功・失敗それぞれに2行の台詞を追加。
  加入ボタン押下後に酒場画面内で台詞を表示し、OKまたは「戻る」で一覧に戻る。
- **「仲間を探す」一覧に effectDesc を明示表示**: 各仲間の効果説明を黄色で表示。
- **「同行中 ✓」表示に変更**: 既に仲間の候補は「同行中 ✓」ラベルを表示し、加入ボタンを非表示。
- **パーティー上限時のメッセージ改善**: 「上限です。仲間を外してから来てください。」と案内。
- GAME_DESIGN.md §9.5/§10 を更新、§24(v0.5.1未実装)を追記。

### Not implemented (今回は明示的に未実装)
- 仲間加入時の3分岐(加入/断る/戦闘 — 現在は2分岐のみ)
- NPCのフィールド追従表示・シンボルエンカウント方式
- 仲間固有イベント・専用装備・仲間の成長要素


## [0.5] - 2026-07-01 — 酒場・仲間システム

### Added
- **酒場(🍺)を正式オープン(§9.5)**: 「仲間を探す / 仲間を見る / 仲間を外す / やめる」の
  メニューを持つ酒場モーダルを実装。従来の「現在工事中」トーストから切り替え。
- **仲間候補4人の実装(§10)**: COMPANION_DATAを追加。
  - 💪 ジュリタニ — 攻撃時会心の一撃確率+20%(critBonus)
  - 🪤 シュリタニ — 捕獲率+0.10(captureMod)
  - 💨 ノリオ — 逃走成功率+0.15(fleeMod)
  - ✨ ハルミ — まほう効果+20%(spellMod)
- **仲間補正をリアルタイムで反映**:
  - ジュリタニ: `doFight()` で20%確率の会心(ダメージ×1.5) → 「💥 会心の一撃！」
  - シュリタニ: `attemptCapture()` の捕獲率に加算
  - ノリオ: `doRun()` の逃走成功率に加算
  - ハルミ: `castSpell()` の攻撃ダメージ・回復量に乗算
- **仲間上限**: パーティー最大2人(COMPANION_MAX)。上限時は加入不可メッセージ。
- **ステータス画面に仲間一覧**: 名前・効果説明を表示。
- **ステータスバーに仲間数を簡易表示**: 「🤝2/2」形式(仲間がいる場合のみ)。
- **ヘルプ画面に仲間システムの説明を追加**。
- **仲間情報をセーブ/ロード対応**: `player.companions`(idの配列)として保存。
  既存セーブデータからの移行は `companions: []` で初期化(エラーなし)。
- GAME_DESIGN.md §9.5/§10 を実装済みに更新、§23(v0.5未実装リスト)を追記。

### Not implemented (今回は明示的に未実装)
- NPCのフィールド追従表示・シンボルエンカウント方式
- 仲間加入時の会話3分岐(加入/断る/戦闘)
- 仲間固有イベント・専用装備・仲間の成長要素
- 究極ゴリラ捕獲イベント・うたうコマンド・レベル99イベント・女神のウクレレ
- 横スクロールマップ・最強装備イベント入手


## [0.4.5] - 2026-07-01 — 操作性・戦闘結果・セーブ管理・売却改善

### Added
- **戦闘終了OKボタン方式(§13)**: 戦闘に勝利・捕獲成功・逃走成功した際、
  バトルログに結果を全部表示したうえで「OK」ボタンが表示される。
  プレイヤーがOKを押してはじめてフィールドに戻る方式に変更。
  (プレイヤーが倒された時は従来通り即フィールド復帰)
- **戦闘開始直後コマンドロック(§13.7)**: 戦闘開始後800msの間、
  全コマンドボタンを無効化する。フィールド移動からの誤タップ防止。
  (不意打ちの場合は敵ターン終了後に解除)
- **設定画面にニューゲームボタン(§15)**: 設定モーダル最下部に
  「🔄 ニューゲーム(セーブデータをリセット)」ボタンを追加。
  確認ダイアログ→localStorage削除→リロードで初期状態に戻る。
- **商人に装備売却メニュー(§9)**: 「🔧 装備を売る」メニューを追加。
  所持装備を buyPrice/2 で売却できる(buyPrice未設定の場合は5G)。
  現在装備中のアイテムは売れない(「装備中」グレーアウト表示)。
- **GAME_DESIGN.md更新**: 仲間候補名・追加モンスター候補・追加まほう候補、
  §13.7/§13.8(スマホ操作改善)、§22(v0.4.5未実装リスト)を追記。

### Changed
- **スマホ長押し対策(§13.8)**: CSS `*` セレクタに
  `-webkit-user-select: none`・`-webkit-touch-callout: none` を追加。
  `button { touch-action: manipulation }` で長押しズームを抑制。
  JS で `#game` の `contextmenu` イベントを preventDefault。
  (`.dpad-btn` の `touch-action: none` は特異度が高いため維持)
- **十字キー操作の安定化**: `finishBattle()` 冒頭で `stopWalking()` を呼び、
  戦闘終了後に残留 walkTimer が動き続けるケースを防止。

### Not implemented (今回は明示的に未実装)
- 仲間システム本体・酒場加入・NPC追従
- 究極ゴリラ捕獲イベント本体・うたうコマンド・レベル99イベント
- 女神のウクレレ・横スクロールマップ本体
- 大量モンスター/まほう追加(詳細は GAME_DESIGN.md §22)


## [0.4.4] - 2026-07-01 — フィールド宝箱・戦闘外アイテム使用

### Added
- **宝箱システム**: フィールド上に 🎁 宝箱(Bタイル)を4箇所配置。
  触れると中身(お金/回復アイテム/低〜中ランク装備)をランダム入手。
  開封済みの宝箱は 📦 に変わり、同じセーブデータでは再入手不可。
  開封状態はlocalStorageにセーブされる。
  装備がすでに所持済みの場合は buyPrice/2 のゴールドに換算。
- **フィールド上でのアイテム使用**: ステータスバーに「🎒アイテム」ボタンを追加。
  やくそう/コーヒー/パン/お弁当/ラーメンで戦闘外にHP回復、
  せき止めシロップ/デオドラントスプレーで状態異常を治療できる。
  HP満タン/状態異常なしの場合はアイテムを消費せずメッセージ表示。
  使用後は自動セーブ。
- 装備モーダルの説明文を更新(商人・宝箱での入手に対応)。
- ヘルプ画面に宝箱(🎁)・フィールドアイテム使用(🎒)の説明を追加。
- GAME_DESIGN.md §5.7(宝箱)・§5.8(フィールドアイテム使用)・§21(v0.4.4未実装)
  を追記。

### Not implemented (今回は明示的に未実装)
- 最強装備の宝箱入手(§8.6。将来実装)
- 仲間システム本体・酒場加入・NPC追従
- 究極ゴリラ捕獲イベント本体・うたうコマンド・レベル99イベント
- 女神のウクレレ・横スクロールマップ本体・大規模マップ拡張


## [0.4.3] - 2026-06-30 — 実家イベント・回復・アイテム/装備入手改善

### Added
- **実家イベント**: フィールドの 🏠 タイルに触れると「実家に帰ってきた。」
  イベントが発生。「休む」を選ぶとHP・MP・状態異常が全回復し、
  オートセーブされる(「ぐっすり休んだ！」メッセージ表示)。
- **回復食料品4種を戦闘中に使用可能に**: コーヒー(HP+10)/パン(HP+20)/
  お弁当(HP+40)/ラーメン(HP全回復)を商人で購入でき、戦闘の
  「🧪アイテム」から使用できる。HP満タン時は「今は使う必要がない」と
  表示し消費しない。
- **商人に回復アイテムを追加**: コーヒー(5G)/パン(10G)/お弁当(20G)/
  ラーメン(40G)/せき止めシロップ(15G)/デオドラントスプレー(15G)。
- **商人の装備ラインナップを大幅拡充**: 武器13種・防具4種・盾2種・兜3種が
  新たに購入可能に(ドラゴンのたて/鋼鉄のかぶと/キグナスのかぶと/
  武者よろい/西洋風よろい/斧/金属バット/ヌンチャク等)。
- ヘルプ画面に実家(🏠)と回復アイテムの説明を追加。
- GAME_DESIGN.mdに将来仕様を追記: 実家の役割(§5.6)、フィールドドロップ案
  (§5.7)、最強装備の将来入手案(§8.6)。

### Not implemented (今回は明示的に未実装)
- フィールド上(戦闘外)でのアイテム使用(戦闘中のみ対応)
- 最強装備の入手手段(ペガサスのよろい/六連のたて/アンドロメダの鎖等)
- 仲間システム本体・酒場加入・NPC追従・究極ゴリラ捕獲イベント本体
  (§8.6参照)


## [0.4.2] - 2026-06-30 — 捕獲システム改善・モンスター追加

「このゲームは敵を倒すゲームではなく、UMAを弱らせて捕まえる/逃げられる
UMA収集RPGである」という方針を明確にした。

### Added
- 通常モンスターを10種追加: 蚊/蛇/ヤブ蚊/さまようおやじ/詐欺師/
  パワポ野郎/ぶつかりおじさん/鬼/パワハラ先輩/マラソンマン。
  一部に特殊行動(アレルギー/におい付与・MP吸収・所持金を盗む・不意打ち・
  逃げにくい)を実装。
- メタルゴリラ系3種を追加: メタルゴリラ(EXP40)/はぐれメタルゴリラ(EXP120)/
  フルメタルゴリラ(EXP300)。低確率出現・高防御・低HP の経験値稼ぎ専用ボーナス敵。
  専用の出現判定 `METAL_ENCOUNTER_CHANCE`(0.04)でUMAレア枠とは別に抽選。
- 攻撃まほう3種を追加: パクチー(MP4/威力8)/グーパンチ(MP6/威力12)/
  ホームラン(MP10/威力22)。
- GAME_DESIGN.mdへ将来仕様を追記:
  - 究極ゴリラ捕獲条件案(§14.5。Lv99+女神のウクレレ+うたうコマンド)
  - 横スクロールマップ案(§5.5。ボコスカウォーズ風、3〜5面)
  - 敵の分類仕様(§6。type:"uma"/"monster"/"metal")
  - まほう追加候補の一覧(§12)

### Changed
- 戦闘結果の表現変更: 敵のHPを0にしても「倒した」ではなく
  「○○に逃げられた！」と表示するようになった。UMA収集RPGとしての方向性を
  明確にする演出変更。経験値は従来通り入り、追加で小額の所持金も獲得するように
  なった(`Math.ceil(EXP / 2)`G)。
- 捕獲成功率のHP連動を強化: HP連動の係数を0.30→0.50に引き上げた。
  HPを1〜10程度まで減らすと、通常の敵はかなり捕まえやすくなる。
  レアUMAはこのボーナスを0.25に抑え、例外的に難しくした。
- 目的説明モーダルとヘルプモーダルの文言を「弱らせて捕まえる/逃げられる」
  という新しい方針に合わせて更新。

### Not implemented (今回は明示的に未実装)
- 横スクロールマップ本体、仲間システム本体、酒場での仲間加入、NPC追従、
  究極ゴリラ捕獲イベント本体、うたうコマンド、女神のウクレレ、
  レベル99イベント、大量の新規装備追加
  (詳細は [GAME_DESIGN.md §20](GAME_DESIGN.md#20-今回version-042で明示的に実装しなかったもの))


## [0.4.1] - 2026-06-29 — 初回プレイ改善・装備バランス調整

実際にプレイしてもらったフィードバック(「セーブ方法が分からない」「何を
目指せばいいか分からない」)と、装備が無条件で全て選べてしまうバランス上の
課題を受けて対応した。

### Added
- 目的説明画面: オープニング直後に初回のみ自動表示。⚙️設定の「🎯目的を見る」
  からいつでも再表示できる。
- セーブの分かりやすさ改善: 設定モーダルに「💾オートセーブ中」の説明文と
  「💾今すぐセーブ」ボタンを追加(押すと即座に保存し「セーブしました」と表示)。
- 📊ステータス確認画面(画面右上「📊ステータス」): 名前/レベル/HP・MP/経験値/
  所持金/職業/状態異常/現在の装備/覚えているまほう/所持アイテム数/
  捕まえたUMA総数/図鑑進捗をまとめて確認できる。
- ❓ヘルプ画面(⚙️設定の「❓ヘルプ」): 目的/操作方法/セーブ/戦闘/捕獲/装備/
  状態異常を1画面で解説。
- 商人に装備購入を追加: ⚔武器を買う/🥋防具を買う/🛡盾を買う/⛑兜を買うを
  メニューに追加(ワイヤーブラシ・ノコギリ・サバイバルナイフ・鉄の棒・
  ロックT・革ジャン・鉄のたて・ヘルメットの8種を販売)。
- せき止めシロップ/デオドラントスプレーを戦闘の「🧪アイテム」から実際に
  使用できるように(アレルギー/においを治療)。不要な時に使うと
  「今は使う必要がない」と表示し消費しない。

### Changed
- **装備を所持制に変更。** `player.ownedWeapons`/`ownedArmors`/`ownedShields`/
  `ownedHelmets` を追加し、所持していない装備は装備変更画面で選べず
  「未所持」と表示するようにした(Version 0.4では全装備を無条件で選べていた)。
  既存セーブ(Version 0.4以前)は読み込み時に、その時点で装備していたものを
  所持品として自動的に引き継ぐ。

### Not implemented (今回は明示的に未実装)
- 仲間システム本体、酒場での仲間加入、NPC追従、究極ゴリラ捕獲イベント、
  「うたう」コマンド、レベル99イベント
- 新しい大量装備の追加(商人で売る8種のみ追加)、新しいUMAの大量追加
  (詳細は [GAME_DESIGN.md §19](GAME_DESIGN.md#19-今回version-041で明示的に実装しなかったもの))


## [0.4] - 2026-06-28 — RPGらしさ強化アップデート

### Added
- ゲーム開発を企画書ベースで管理するためのドキュメントを新規作成
  - `GAME_DESIGN.md` — ゲーム仕様のSingle Source of Truth
  - `TODO.md` — バージョン別の実装予定一覧
  - `CHANGELOG.md` — 本ファイル
- 仲間システムの仕様を `GAME_DESIGN.md` に記載(プロデューサー提案。
  NPCとのシンボルエンカウント、会話による仲間化/拒否/戦闘の分岐、
  仲間の追従・固有能力など)。**未実装**、`TODO.md` の Version 0.5 に登録。
- RPGメッセージシステム: 「○○を見つけた!」(UMA初発見)、
  「経験値○○を獲得!」、「レベルが上がった!」などドラクエ風メッセージを追加。
- オープニングイベント: 初回起動時のみ王様のメッセージを表示(セーブデータに記録)。
- 酒場(🍺、建物のみ): 接触すると「現在工事中」メッセージ。仲間システムの土台。
- 装備システム: 武器/防具/盾/兜の装備変更画面(画面右上「🎽装備」)。
  `EQUIP_WEAPON_DATA`(22種)/`ARMOR_DATA`(8種)/`SHIELD_DATA`(4種)/`HELMET_DATA`(6種)を追加。
  既存の `WEAPON_DATA`(レガシー仕様)はそのまま維持し、加算は別枠として扱う。
  入手手段(購入/ドロップ)は未実装で、現在は全項目を自由に選べる。
- アイテムデータ追加(コーヒー/パン/お弁当/ラーメン/せき止めシロップ/デオドラントスプレー)。
  データのみで購入/使用ロジックは未実装。
- 状態異常システムの基盤 + 「アレルギー」(歩くたびにHP-1)「におい」(捕獲率-0.15)を実装。
  ビッグフット/山賊の攻撃を受けた時に低確率で発症する。状態はステータス欄に表示。
- まほうを `ATTACK_SPELL_DATA` / `HEAL_SPELL_DATA` に分離し、新規まほう10種を追加
  (はずかし固め/左フック/ハイキック/バックドロップ/キドクラッチ/魔性のスリーパー/
  ポイミ/ポポイミ/ポポマラー/ポポマズン)。既存の `SPELL_DATA` は結合版として維持。

### Changed
- `README.md` をプレイヤー向けの説明(遊び方/操作方法/起動方法/GitHub Pages公開方法)に
  整理し、ゲーム仕様の詳細部分は `GAME_DESIGN.md` に移設。
- `README.txt` の「今後追加すると良さそうな機能」に仲間システムを追記。

### Not implemented (今回は明示的に未実装)
- 仲間システム本体、酒場での仲間加入、究極ゴリラ捕獲イベント、
  「うたう」コマンド、レベル99イベント、NPC追従
  (詳細は [GAME_DESIGN.md §18](GAME_DESIGN.md#18-今回version-04で明示的に実装しなかったもの))


## [0.3] - 2026-06-28

### Added
- 設定画面(画面右上「⚙️設定」): 主人公の歩く速度(遅い/普通/速い)を変更可能。
  十字キーの押しっぱなしで設定速度の連続移動に対応(タップは1歩のまま)。
- GitHub Pagesでの公開(`https://rokushakai.github.io/ultimate-gorilla/`)。
  `index.html`/`style.css`/`script.js` を相対パスのまま公開できる構成に整理。
- Gitリポジトリの初期化、`.gitignore`、GitHub向け `README.md` の作成。

### Changed
- 究極ゴリラをラスボス級に再調整。
  - HP 150→5000、攻撃力22→150、防御8→60。
  - 攻撃は毎ターン「かいしんのいちげき」級の特大ダメージ(防御力をほぼ無視)。
  - 捕獲成功率は通常の捕獲式の結果に関わらず常に2%を上限にするよう変更。
  - 逃走成功率を0.90→0.95に変更し、「出会ったら逃げて生き延びる」前提を強化。
  - 発見モーダルの文言に「あまりの強さに、体が震える……」を追加。


## [0.2] - 2026-06-27

### Added
- 商人システム(村の🏪に接触): 買う(鉄の剣/やくそう/捕獲ロープ)/
  アイテムを売る/UMAを売る/やめる。
- 所持金(`gold`)システム。
- UMA収集システムへの再設計
  - UMA図鑑を「未発見/発見済み/捕獲済み」の3状態に拡張。
  - 所持UMA(`umaInventory`)。同じUMAを複数捕獲・所持・売却可能。
  - 売却してもUMA図鑑の捕獲済み記録は残る。
- 転職システム(村の⛩️に接触): 職業(部活)9種類
  (野球部/水泳部/テニス部/帰宅部/吹奏楽部/サッカー部/ラグビー部/陸上部/魔法戦士)。
  ステータス・捕獲率・逃走率・まほう習得率に補正がかかる。
- 捕獲ロープ(アイテム。捕獲率+25%で即捕獲を試みる)。
- セーブ/ロード(`localStorage`)。レベル/経験値/HP・MP/まほう/所持金/
  所持アイテム/所持UMA/図鑑/職業を保存。

### Changed
- データ構造を `UMA_DATA` / `NON_UMA_DATA` / `ITEM_DATA` / `WEAPON_DATA` /
  `SPELL_DATA` / `JOB_DATA` に整理(以後の追加はこれらの配列への追記で対応)。
- プレイヤーのステータス計算を「ベース値(レベルアップでのみ成長) + 職業補正 +
  武器加算」を都度再計算する方式に変更(`recomputeStats()`)。転職を
  繰り返しても値が累積しないようにした。

### Fixed
- マップデータの記述ミスにより商人タイルの位置が意図より1マスずれていた問題を修正。


## [0.1] - 2026-06-27

### Added
- 初期プロトタイプ。
  - フィールド移動(十字キー/スワイプ/キーボード)、ドラクエ風2Dマップ。
  - 一定歩数ごとのランダムエンカウント。
  - 戦闘コマンド: たたかう/まほう/アイテム/つかまえる/にげる。
  - 倒す・逃げる・捕まえる、いずれでも経験値を獲得しレベルアップ。
  - レベルアップ時にランダムでまほうを1つ習得。
  - フィールドの武器/回復アイテムの取得。
  - レアUMA(ビッグフット/ネッシー/イエティ/ジャージーデビル)と
    伝説のUMA「究極ゴリラ」(発見モーダル付き)。
