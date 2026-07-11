# DEV_LOG.md — 開発ログ

このファイルには、開発中に判明した問題・判断・注意点を記録する。
仕様は GAME_DESIGN.md、変更履歴は CHANGELOG.md を参照。

---

## v0.28 (2026-07-12)

### 追加・変更

- **`runSingleCompanionAction(cid)` 新設 (§82)**: 仲間1人分の行動を実行する共通関数。`runCompanionAutoActions()` のループ内ロジックを抽出し、仲間コマンド選択とも共用。返値 true=敵HP0。
- **`startCompanionCommands()` 新設 (§82)**: `scheduleAfterPlayerAttack()` が呼ぶエントリポイント。`e.final` → 見守りログ→400ms→敵ターン。仲間なし → 400ms→敵ターン。仲間あり → キュー初期化 → `showCompanionCommandForIdx(0)`。
- **`showCompanionCommandForIdx(idx)` 新設 (§82)**: innerHTML で「ジュリタニの行動は？」＋2ボタンを動的生成。`disabled=false` でボタン有効化（`setBattleLocked(true)` 中でも操作可能にするため）。
- **`executeCompanionCommand(cid, mode)` 新設 (§82)**: ダブルクリック防止（即 disabled）→ メニュー非表示 → `runSingleCompanionAction()` → インデックス++ → 次メニューまたは `winBattle()`/`enemyTurn()`。
- **`scheduleAfterPlayerAttack()` 変更 (§82)**: 600ms後に `runCompanionAutoActions()` を直呼び → `startCompanionCommands()` 呼び出しに変更。
- **`runCompanionAutoActions()` 変更 (§82)**: 内部ロジックを `runSingleCompanionAction()` に委譲。API として維持。
- **`finishBattle()` 変更 (§82)**: コマンドキュークリア + `companion-command-menu` 非表示を追加（最小変更）。
- **HTML: `companion-command-menu` 追加 (§82)**: `waza-menu` の直後に `class="hidden submenu"` の div。innerHTML で動的生成するので空の div として定義。

### 設計判断

- **`setBattleLocked` との共存**: `companion-command-menu` は class `submenu` を持つため `setBattleLocked(true)` でボタンが disabled になる。`showCompanionCommandForIdx()` で明示的に `disabled=false` で上書きすることで共存。
- **`たたかう` と `まかせる` を同一の行動にした理由**: 第一段階では UI の区別だけ作り、将来の固有コマンド拡張に備える。v0.28.1 以降で差別化予定。
- **`battle-menu` の表示タイミング**: 仲間コマンドメニュー表示中は `battle-menu` を hidden。仲間全員行動後（または全仲間スキップ後）に `classList.remove("hidden")` して 400ms→敵ターン。その後 `setBattleLocked(false)` で通常に戻る。
- **`finishBattle()` の最小変更方針**: ユーザーが「壊さないでください」と指定している関数なので、4行のクリーンアップのみ追加し他の行動は変更しない。

## v0.27.1 (2026-07-12)

### 追加・変更

- **`runCompanionAutoActions()` 返値追加 (§81)**: `true` = 仲間攻撃で敵HP0、`false` = 敵生存またはスキップ。早期リターンも `return false` に統一。
- **各仲間の攻撃後に即ブレーク (§81)**: `e.hp = Math.max(0, e.hp - dmg)` → `renderEnemy()` → `if (e.hp <= 0) { break; }` の順で処理。次ループ開始時の `if (e.hp <= 0) break` に頼るのではなく、攻撃直後に離脱する。
- **`scheduleAfterPlayerAttack()` 判定強化 (§81)**: `runCompanionAutoActions()` の返値を `companionKilled` に受け取り、`if (companionKilled || (state.enemy && state.enemy.hp <= 0))` で勝利判定。返値が `true` の場合は `winBattle()` のみ実行され `setTimeout(enemyTurn, 400)` に到達しない。
- **デバッグボタン追加 (§81)**: `btn-debug-companion-kill-wilddog` — 仲間2人+のらいぬHP3。たたかうを押した後、仲間が撃破→勝利処理→敵ターンなし、のフローを1回で確認できる。

### 設計判断

- `winBattle()` や `finishBattle()` には手を入れない方針を維持した。`scheduleAfterPlayerAttack()` の返値ベース判定だけで「仲間が倒したケース」を完全にカバーできる。
- `state.battleWon` フラグは追加しなかった。`winBattle()` → `showBattleEnd()` → `setBattleLocked(true)` の流れで UI ロックされるため、非同期タイマーが再発火しても `state.inBattle` ガードと返値チェックで二重発火は防止できる。
- ボス撃退フラグ（`defeatedEnemies`）の設定タイミングは `finishBattle()`（OKボタン押下後）で変わらない。仲間が倒しても `winBattle()` → `showBattleEnd()` → OK押下 → `finishBattle()` の正規ルートを経由するため、フラグが入らないリスクはない。

## v0.26.1 (2026-07-12)

### 追加・変更

- **`resetPartyTrail()` 共通関数化 (§79)**: `state.partyTrail = []` が複数箇所に散在していたのを1つの関数に集約。ES5関数宣言なので `loadGame()` や他の関数から先行参照しても問題なし（ホイスティング）。
- **`recruitCompanion()` でリセット (§79)**: `p.companions.push(id)` 直後に `resetPartyTrail()` を追加。新しく加入した仲間が古い軌跡の座標に突然現れるのを防ぐ。
- **`dismissCompanion()` でリセット (§79)**: `p.companions.splice(idx, 1)` 直後に `resetPartyTrail()`。離脱した仲間の座標が残った仲間のインデックスにズレて割り当てられるのを防ぐ。
- **companion デバッグボタン8本に `resetPartyTrail()` 追加 (§79)**: `state.player.companions = [...]` 直後に一括で追加（`replace_all: true` で実施）。酒場UIテスト後にフィールドへ戻った時に軌跡が正しく初期化されている。
- **nullセーフ化 (§79)**: `renderField()` の `var trail = state.partyTrail || []` で undefined 時もループが安全。`movePlayer()` の `if (!state.partyTrail) { state.partyTrail = []; }` で強制初期化。
- **新debugボタン「👥 パーティ解除 + 軌跡リセット」 (§79)**: フィールドテスト時に追従なし状態をすぐ作れる。

### 設計判断

- `recruitCompanion()` / `dismissCompanion()` だけでなく、デバッグボタン経由の直接 `companions =` 変更にも対応するため、デバッグハンドラー全8本にも追加した。debug=1 環境でのテストフローで軌跡が乱れない。
- `state.partyTrail` を `state.player.partyTrail` にしなかった理由: プレイヤー個人のデータではなくフィールド描画上の揮発データなので state トップレベルが適切。saveGame に含めないポリシーも維持。

## v0.26 (2026-07-12)

### 追加・変更

- **`state.partyTrail` 追加 (§78)**: 状態オブジェクトのトップレベルに `partyTrail: []` を追加。`sideMap` オブジェクト内ではなく、`mapMode` と同階層に置くことで管理が明確。
- **`movePlayer()` 更新 (§78)**: 有効な移動（境界チェック・ブロックチェック通過後）のみ `unshift()` を実行。移動失敗時は軌跡を更新しない。`p.x = nx; p.y = ny;` の直前で実行するため、unshift 直後の `partyTrail[0]` は「プレイヤーが今いた（移動前の）位置」になる。
- **`renderField()` trailMap 構築 (§78)**: 逆順ループ（companion 1 → companion 0）で trailMap を構築することで、仲間0が仲間1と同座標になった場合に仲間0の絵文字が勝つ。プレイヤーと同座標の軌跡はスキップ（重ね描画なし）。
- **マップ切り替えでリセット (§78)**: `switchToSideMap()` と `switchToNormalMap()` の両方で `state.partyTrail = []`。これにより横スクロール←→通常マップ往復後に軌跡が残らない。
- **`loadGame()` でリセット (§78)**: 軌跡はセーブデータに保存しない（フィールド上の位置は揮発データ）。ロード後は空軌跡から再スタート。

### 設計判断

- **partyTrail は saveGame に含めない**: 軌跡は次のログインの最初の1〜2歩で自然に埋まるため、永続化する必要がない。セーブデータのサイズを増やさない。
- **`unshift` + `pop` vs `push` + `slice`**: `unshift` は O(n) だが配列長が最大2なので無視できる。`partyTrail[i]` が「仲間i が立つ位置」に直接対応する直感的なインデックスが保てる。

## v0.25 (2026-07-11)

### 追加・変更

- **仲間カード CSS (§77)**: `style.css` の `.shop-back-btn` ブロック直後に `.companion-card` 系クラス群を追加。`companion-quote` の `border-left: 3px solid currentColor` は、インラインで設定する `color` 値を自動参照するため JS 側で別途ボーダー色を指定する必要がない。
- **`renderTavernRecruit()` 刷新 (§77)**: `shop-row` + インラインスタイルの複合構造 → `companion-card` 形式に統一。全4仲間を常にカード表示し、状態（パーティ中/待機中）を右端ラベルで示す。
- **`renderTavernViewParty()` 刷新 (§77)**: 同じく `companion-card` 形式。仲間がいない時は案内メッセージ。
- **`renderTavernLeave()` 改善 (§77)**: `shop-row` → `companion-card` 形式。外すボタンは `.leave-btn` クラスで赤ボーダー。

### 注意点

- `companion-quote` の `border-left: 3px solid currentColor` はCSS標準。inline の `style="color:#..."` で色が変わると左ボーダーも追従する。IE非対応だが、このゲームはモダンブラウザ前提なので問題なし。
- 仲間加入/離脱処理 (`recruitCompanion` / `dismissCompanion`) は一切変更せず、既存のイベントハンドラーをそのまま流用。

## v0.24.1 (2026-07-11)

### 追加・変更

- **`getCompanionQuote(c)` 安全化 (§76)**: `if (!c) return null` ガードを先頭に追加。undefined な仲間データでも落ちない。
- **priority 3 — 伝説装備コンプリートのみ**: `isLegendaryEquipmentComplete()` だが `isFullyCompleted()` でない場合、`legendaryLine` を `#ffb347`（橙）で表示。priority 2 の fullClear チェックより後に配置するため `!isFullyCompleted()` の明示判定は不要（先に return 済み）。
- **priority 7 — 横スクロール制覇のみ（未クリア）**: `isSideStoryCleared()` だが `state.gameCleared` でない場合、`sideClearLine` を `#c8b4ff`（薄紫）で表示。先行の `state.gameCleared && isSideStoryCleared()` チェック（priority 5）で return 済みのため `!state.gameCleared` 判定不要。
- **デバッグ §76**: `btn-debug-companions-normal` / `btn-debug-companions-side-only` / `btn-debug-companions-legendary-only` の3ボタン追加。v0.24 の5ボタンと合わせて計8状態テスト可能。

### 注意点

- `getCompanionQuote(c)` の全7 branch は短絡評価（先行 return）で動作するため、`!isFullyCompleted()` / `!state.gameCleared` の否定条件を明示しなくても正しく動く。
- `legendaryLine` が伝説装備コンプのみ（橙）と完全達成+伝説装備（明金）の両方で使われる。どちらも「伝説装備全部揃えたのか」という内容で自然。
- `sideClearLine` もクリア+制覇（priority 5）と制覇のみ（priority 7）の両方で使われる。どちらも横スクロール達成の喜びを表すセリフで自然。

## v0.23 (2026-07-11)

### 追加・変更

- **`getFieldBgmType()` 追加**: `BGM_DATA` の直前に配置。`state.gameCleared` が true なら `"fieldClear"` を返す。BGM制御コードは一切変更なし。
- **`BGM_DATA.fieldClear` 追加**: `waveType: "triangle"`（Web Audio API 標準対応）・`vol: 0.05`（field と同一）・Cメジャー・0.25s 単位ノート・約7.75秒ループ。ユーザー指定メロディパターンをそのまま実装。
- **`updateBGM("field")` → `updateBGM(getFieldBgmType())` 全置換**: `replace_all: true` で8箇所一括置換。`startBGM("field")` は debug ボタン（明示テスト用）のみに残存。
- **デバッグ**: `btn-debug-bgm-field-clear` 追加・`btn-debug-bgm-field` ラベルを「通常フィールドBGM」に更新。

### 注意点

- `stopBGMHard()` / `startBGM()` / `updateBGM()` / `_scheduleBGMLoop()` / `bgmSessionId` / `activeBgmNodes` / `activeBgmTimers` / `bgmMasterGain` はすべて変更なし。BGM重なりバグ対策（v0.8.6.3）は維持。
- `waveType: "triangle"` は Web Audio API OscillatorNode の標準対応値（"sine" / "square" / "sawtooth" / "triangle"）。外部ファイル不要。
- `updateBGM(getFieldBgmType())` は `bgmCurrentType === type` チェックがあるため、すでに fieldClear が鳴っている状態で再呼び出しされても二重再生しない（既存の updateBGM 安全設計が引き継がれる）。

## v0.22 (2026-07-11)

### 追加・変更

- **UMA_DATA ヒントフィールド追加**: 全9種（カッパ〜究極ゴリラ）に `hintArea` / `hintText` / `hintCatch` を追加。究極ゴリラはLv99+ウクレレ+HP1〜10+うたう の専用ヒント文。
- **renderDexBody() ヒント表示**: 未発見カードに `📍hintArea`、発見済み未捕獲カードに `💡hintText` を各カード下部に表示。
- **openMonsterDetailModal() 捕獲ヒント追加**: `!isMetal && !isFinal && !isCaptured && st === "seen"` 条件で `hintCatch` を「💡 捕獲ヒント」セクションとして表示。究極ゴリラの既存「⚠️ 捕獲について」は変更なし。
- **NPC D（UMA博士） 未捕獲ヒント**: `firstUncaptured` を UMA_DATA から取得し、capturedCount >= 8 の場合は名前 + hintText、capturedCount >= 4 の場合は名前 + hintArea を含むセリフ追加。
- **getProgressHint() priority=0 図鑑未コンプ分岐強化**: `isSideStoryCleared()` 後の 3 tier を `firstUnc`（最初の未捕獲UMA）の名前/hintText/hintCatch で具体的に表示するよう変更。
- **renderRecordBody() 「図鑑でヒントを確認」ボタン**: 未コンプ時に `btn-record-open-dex` ボタン追加。クリックで `closeModal("record-modal")` → `openDexModal()` へ遷移。
- **デバッグ §73**: 3ボタン追加（最初のUMAだけ未捕獲 / 発見済み / 図鑑全リセット）。

### 注意点

- `openMonsterDetailModal` 内で `st` は関数スコープの変数。メタル(dataType==="metal")時は `null` なので `!isMetal` 条件を必ず守ること。
- `btn-debug-dex-reset` は `state.player.dex = {}` で図鑑を完全初期化する。dexCompleteRewardClaimed は変更しない（別途リセットボタンが既存）。
- 究極ゴリラの `hintCatch` も追加されているが、図鑑詳細での表示は `isFinal` 条件で弾かれ、従来の「⚠️ 捕獲について」が優先される。

## v0.21 (2026-07-11)

### 追加・変更

- **`openDexCompleteModal()` 演出刷新**: 旧テキスト「称号〜を獲得！全てのUMAを捕まえた。」を廃止し、3段構成に変更。①「すべてのUMAが図鑑に記録された！」② スカイフィッシュ・ツチノコ・究極ゴリラへの言及 ③「力だけではたどり着けない冒険の証」。称号は `state.gameCleared && isSideStoryCleared()` で「究極とUMA図鑑を極めし者」「UMA図鑑を極めし者」に分岐。
- **UMA博士 `isUmaDexComplete() && !state.gameCleared` 分岐追加**: getLines の最初に判定を追加。図鑑が完成しているが究極ゴリラを未捕獲の場合、「見事じゃ → 歌が必要」のセリフを返して早期 return。既存の capturedCount >= 8 分岐より優先。
- **UMA博士 クリア済み + 図鑑コンプリートセリフ改定**: 旧「図鑑が……完成しておる！！わしは長年…」を「すべてのUMAを記録し、究極ゴリラに歌を届けたのじゃな。おぬしはもう、立派なUMAハンターじゃ。」に変更。
- **冒険の記録 UMA図鑑セクション**: コンプリート時に「✅ コンプリート！すべてのUMAが図鑑に記録された。」、未コンプ時に「あとN種類 — 未捕獲のUMAを探してみよう。」の説明テキストを追加。
- **デバッグ §72**: `btn-debug-open-record-dex` 追加（冒険の記録モーダルを開いてUMA図鑑セクションを確認するボタン）。

### 注意点

- 図鑑コンプリート報酬のフラグ (`dexCompleteRewardClaimed`)・報酬内容 (3000G + ラーメン×3)・二重受取防止ロジックは変更なし。
- `isFullyCompleted()` チェックは UMA博士の `if (state.gameCleared)` ブロック内で最高優先のまま。新しい `isUmaDexComplete() && !state.gameCleared` 分岐はその外側（未クリア時専用）なので干渉しない。

---

## v0.20.1 (2026-07-11)

### 確認・修正・整備

- **装備中アイテムの判定**: 伝説装備フラグは取得時点で `= true` になりセーブされる。装備スロットへの移動はフラグに影響しない。旧セーブ互換のため `isLegendaryEquipmentComplete()` に `isEquipOwned()` の二段チェックを追加（フラグが落ちていても所持中/装備中なら入手済み扱い）。
- **LEGEND_EQUIPS 拡張**: `slot`（"armor"/"shield"/"helmet"/"weapon"）と `itemId`（実際のアイテムID文字列）を各エントリに追加。これにより `findEquipSlot()` + `isEquipOwned()` による所持確認が可能になった。
- **報酬二重受取防止**: `legendaryRewardClaimed` フラグが `saveGame()` / `loadGame()` に追加済みであることを確認。`openEquipModal()` のチェックと `openLegendaryCompleteModal()` 内でのフラグ設定により二重受取不可。
- **冒険の記録 表示**: `✅ ` / `・` プレフィックスを各伝説装備名に追加し、視覚的に入手/未入手が一目で分かるように改善。
- **鍛冶屋 NPC K**: コンプリート時を2行・残数ヒントを2行・Lv30+未入手を2行 `lines.push()` に分割。自然な会話テンポに整備。
- **デバッグ追加**: `btn-debug-legend-only-incomplete`（他の達成状況を維持したまま伝説装備フラグと `legendaryRewardClaimed` をリセット） / `btn-debug-open-record-legendary`（冒険の記録を開いて伝説装備セクションを直接確認）。

### 判定仕様まとめ（v0.20.1確定）

- **入手済み判定**: `state.eventFlags[le.flag] === true` または `isEquipOwned(findEquipSlot(le.slot), le.itemId)`
- **コンプリート判定**: 上記を7種すべてについて確認
- **報酬トリガー**: `openEquipModal()` で `isLegendaryEquipmentComplete() && !state.legendaryRewardClaimed`
- **総合スコア**: 本編1 + 横スクロール12 + UMA図鑑12 + 伝説装備7 = max32pt

---

## v0.20 (2026-07-11)

### 追加・変更

- **`isLegendaryEquipmentComplete()`**: `LEGEND_EQUIPS.every(function(le) { return !!state.eventFlags[le.flag]; })` で7種すべてを確認。`LEGEND_EQUIPS` は既存配列（ペガサスのよろい/六連のたて/宇宙のかぶと/如意棒/アンドロメダの鎖/キグナスのかぶと/ドラゴンのたて）。
- **称号最高位更新**: `getPlayerTitle()` に `isFullyCompleted() && isLegendaryEquipmentComplete()` を最高優先として追加。旧最高位「究極とUMA図鑑を極めし者」は2番目へ降格。
- **`openEquipModal()` チェック**: 装備画面を開く前に `!state.legendaryRewardClaimed` かつ `isLegendaryEquipmentComplete()` の場合に `openLegendaryCompleteModal()` を先出し。`dexCompleteRewardClaimed` パターンと同じ実装。
- **`openLegendaryCompleteModal()`**: 報酬付与→フラグ立て→saveGame→updateStatusBar→ボタンハンドラ設定→HTML生成→openModal の順。称号取得時は追加メッセージ（`isFullyCompleted()` チェック）。
- **`renderRecordBody()` スコア**: 分母を25→32に変更。`legendCount`/`legendPts`/`legendPct` を追加。伝説装備セクションと報酬セクションを追加。次の目標・称号条件一覧も更新。
- **NPC K 鍛冶屋**: `isLegendaryEquipmentComplete()` 時に専用セリフ。`hasAnyLegend` 時は `LEGEND_EQUIPS.filter()` で残数を計算してセリフに含める。
- **デバッグ §70**: `btn-debug-legend-all`（全7種 `eventFlags` を true に）/ `btn-debug-legend-reward-reset`（`legendaryRewardClaimed = false`）/ `btn-debug-legend-reward-modal`（全7種入手後 `legendaryRewardClaimed = false` にしてモーダル表示）。

### 注意点

- `LEGEND_EQUIPS` は v0.8.3 時点から7種確定。新たな伝説装備を追加する場合は `LEGEND_EQUIPS` 配列への追加だけで `isLegendaryEquipmentComplete()` / `renderRecordBody()` の7件表示・スコア計算すべてに自動反映される（ただしスコア上限32の分母 `/32` と表示上の `7` は手動更新が必要）。
- `isFullyCompleted()` は変更なし（`state.gameCleared && isSideStoryCleared() && isUmaDexComplete()`）。伝説装備コンプリートは別条件として `isLegendaryEquipmentComplete()` で独立管理。
- `legendPct` は `renderRecordBody()` 内の伝説装備プログレスバーで使用（`pbar(legendPct, ...)` 呼び出し）。

---

## v0.19 (2026-07-11)

### 追加・変更

- **`isFullyCompleted()`**: `state.gameCleared && isSideStoryCleared() && isUmaDexComplete()` の3条件すべてを確認する関数。`isUltimateGorillaCaptured()` は `state.gameCleared` の別名エイリアス（将来の分離拡張に備えた形式）。
- **NPC 完全達成分岐**: D/R/E/S 全4NPC の `if (state.gameCleared)` ブロック内に `if (isFullyCompleted())` チェックを最高優先として追加。各NPC固有のセリフで一貫した余韻を演出。
- **UMA博士 中間誘導強化**: `!gameCleared && isSideStoryCleared()` ブロックに「あとは歌を届けるだけじゃ」を追加。スペックの「横スクロール制覇済み・究極ゴリラ未捕獲」向け中間メッセージ。
- **COMPANION_DATA `clearLine` 改定**: 4仲間すべてのクリア後セリフをより具体的な内容に更新。旧セリフは廃止（破壊的変更だが、ゲーム体験向上のため採用）。
- **COMPANION_DATA `fullClearLine` 追加**: 完全達成時専用の新プロパティ。酒場で `isFullyCompleted()` の場合に金色(`#ffd166`)斜体で表示。通常クリアは `clearLine` で緑色(`#a9e34b`)のまま。
- **`openHomeModal` 優先度更新**: `isFullyCompleted()` を最高優先に追加。`gameCleared && isSideStoryCleared()` の中間分岐も追加。
- **`getProgressHint` priority=0 整理**: 完全達成を最高優先に昇格。横スクロール未制覇の誘導テキストを仕様書テキストに更新。
- **デバッグ §69**: NPC会話テスト3ボタン追加。各ボタンは状態をセットしてUMA博士(D)を直接開く形式。

### 注意点

- `isUltimateGorillaCaptured()` は `state.gameCleared` と同義。ゲーム内では究極ゴリラ捕獲がクリア条件なので分離しても同じ値になる。
- 完全達成の `isFullyCompleted()` チェックはNPC_DATAの各getLines内で毎回評価される（状態変化に自動追従）。
- `fullClearLine` を持たない仲間を追加した場合は `if (c.fullClearLine)` チェックがあるので表示されない（安全）。

---

## v0.18 (2026-07-11)

### 追加・変更

- **`getPlayerTitle()`**: `isSideStoryCleared()` / `isUmaDexComplete()` / `state.gameCleared` / Lv99 の6条件を `if` チェーンで返す。`renderStatus()` と `renderEndingPage()` の重複ロジックをこの1関数に置き換えた。
- **`#record-modal` / `renderRecordBody()`**: 達成状況の全セクションを innerHTML で生成。`chk()` ローカルヘルパー（val→greenスパン）で✅/pending表示を統一。称号条件一覧は現在の称号を `▶` でハイライトする。
- **「📜記録」ボタン**: `.status-row` に `flex-wrap:wrap` が既にあるので7個目のボタンを追加しても問題なく折り返す。
- **デバッグ §67**: `btn-debug-open-record` 1ボタンのみ追加（`closeModal("settings-modal")` → `openRecordModal()`）。

### 注意点

- `renderRecordBody()` はモーダルを開く前に毎回呼ぶ（状態が変わっても常に最新表示になる）。
- 横スクロールボス撃退キーは既存 `renderStatus()` と同じ文字列をそのまま使用（"36,1", "2:35,1", 等）。

---

## v0.17.1 (2026-07-11)

### 追加・変更

- **`isUmaDexComplete()`**: `UMA_DATA` の全エントリが `state.player.dex[id] === "captured"` かをループで確認。究極ゴリラも含む（うたうで捕獲可能なため）。
- **`state.dexCompleteRewardClaimed`**: 初期値 `false`。saveGame/loadGame に追加済み（`!!data.dexCompleteRewardClaimed` で古いセーブ互換）。
- **`#dex-complete-modal`**: index.html に `#capture-modal` の前に追加。ボタン id は `btn-dex-complete-next`。
- **`openDexCompleteModal()`**: 呼ばれるたびに3000G+ラーメン×3を付与してフラグをセットする。デバッグボタンから直接呼ぶ設計なので毎回報酬が出る（デバッグ用にリセットボタン併設）。
- **`openDexModal()` の先頭チェック**: `isUmaDexComplete() && !state.dexCompleteRewardClaimed` なら `openDexCompleteModal()` を呼んで早期 return。
- **称号6段階**: `renderStatus()` と `renderEndingPage()` の両方で `isUmaDexComplete()` を参照する優先順位チェーンに更新。
- **COMPANION_DATA `clearLine`**: 各仲間に文字列プロパティを追加。酒場の「仲間を見る」「仲間を探す」で `state.gameCleared && c.clearLine` 時に斜体テキストで表示。
- **UMA博士**: `if (state.gameCleared)` ブロックの先頭に `isUmaDexComplete()` チェックを追加して早期 return する。
- **デバッグ §66**: 「全UMA捕獲済み」「報酬リセット」「報酬モーダル直表示」「完全達成状態」「仲間セリフ確認」の5ボタン。

### 注意点

- `openDexCompleteModal()` は毎回報酬付与するが、`dexCompleteRewardClaimed = true` になると `openDexModal()` から自動呼び出しされなくなるため、通常プレイでは1回限りになる。
- エンディングの finalTitle は `isSideStoryCleared() && isUmaDexComplete()` が両方必要で「究極とUMA図鑑を極めし者」になる。

---

## v0.17 (2026-07-11)

### 追加・変更

- **`doSingUltimateGorilla()` 演出刷新**: 5行クライマックスログに変更。「静かにかき鳴らした→歌が広がる→耳をすませる→近づいてきた→捕まえた！」の流れ。
- **`openCaptureModal()` 新関数 + `#capture-modal` HTML**: `openClearModal()` が `openCaptureModal()` → `openEndingModal()` の順で呼ぶように変更。モーダルは `onclick` を `openCaptureModal()` 内で設定（毎回上書きなので問題なし）。
- **総合称号**: `renderEndingPage()` isFinal ページと `renderStatus()` playerTitle の両方で `isSideStoryCleared()` を呼び、横スクロール制覇済みなら「究極を歌い、聖域を越えし者」を返す。
- **NPC 全4名のクリア後反応**: UMA博士は `return lines` 追加で早期終了。旅人は関数先頭で `if (state.gameCleared)` を追加して早期 return。ゴリラ研究家・王様の使いはセリフを差し替え。
- **実家ヒント**: `openHomeModal()` の先頭で `if (state.gameCleared)` チェックを追加。postClearHints 配列からランダム選択。
- **攻略ペーパー**: `getProgressHint()` の `h` 配列の直前に `if (priority === 0)` 専用ブランチを追加。横スクロール制覇の有無で 2 パターン × 3 tier = 6 メッセージ。
- **ヘルプ**: index.html の攻略ペーパー説明の後に「🌟 クリア後の遊び方」セクションを追加。
- **デバッグ §65**: 捕獲モーダル直表示・クリア後Full（全ステージ+チンパンジー撃退）・クリア後Only（横スクロールリセット）の3ボタン。

### 設計メモ

- `openCaptureModal()` の `onclick` は毎回 `openCaptureModal()` が呼ばれるたびに上書きされる。エンディング再視聴時は `openEndingModal()` を直接呼ぶので問題なし。
- 総合称号は `isSideStoryCleared()` を使用（s6クリア AND チンパンジー撃退）。これは `isSideStoryCleared()` 既存の判定と同じ。
- `btn-debug-set-postclear-full` ハンドラでは `state.sideMap.stageCleared` ループに `String(_si)` でキーを作成。既存の `stageCleared` キー形式と一致させた。
- IDE の「var の代わりに let/const を使え」警告は ES5 意図的制約のため無視。実行時エラーではない。
- `node --check` → exit 0（構文エラーなし）。

---

## v0.16.1 (2026-07-11)

### 追加・変更

- **`#battle-gaman-status` div 追加** (index.html): `#battle-player-status` 直後に配置。`updateBattlePlayerStatus()` の最後でガマン状態を反映（`hidden` クラスの付け外し）。`useWaza()` のガマン分岐でも即時呼び出し。
- **`.btn-chance` CSS 追加** (style.css): `#btn-sing` に付与する金色点滅アニメーション。`!important` で `#battle-menu button` の通常スタイルに上書き。
- **`updateSingButtonChance(active)` 新関数**: `#btn-sing` に `.btn-chance` を付与/除去するのみの小関数。`actuallyStartBattle()`・`finishBattle()` で `false` 呼び出しによりリセット。
- **`checkUltimateGorillaHpHint()` 拡張**: HP1〜10に入ったとき、Lv99 × ウクレレ有無の4条件分岐でメッセージを切り替え。チャンス条件達成時のみ `updateSingButtonChance(true)` を呼び出す。
- **デバッグ §64**: 3本追加（チャンス表示 / Lv不足 / ウクレレなし）。いずれも `actuallyStartBattle` → `enemy.hp = 10` → `renderEnemy` → `checkUltimateGorillaHpHint` の順で即時ヒント確認が可能。

### 設計メモ

- `updateSingButtonChance(false)` を `actuallyStartBattle` と `finishBattle` の両方で呼ぶ理由: 同じ戦闘画面を連続利用するとき（戦闘→フィールド→戦闘）にボタン状態が持ち越されないため。
- ガマンインジケーターを `updateBattlePlayerStatus()` で制御した理由: 既存の呼び出し箇所（actuallyStartBattle / enemyTurn / handlePlayerDown / useWaza 内）にすでに組み込まれており、独立関数不要。
- `node --check` → exit 0（構文エラーなし）。

---

## v0.16 (2026-07-10)

### 追加・変更

- **`state.gamanActive: false` 追加**: state 最上位に一時フラグ追加。`inBattle` の下、`enemy` の上に配置。
- **WAZA_DATA「gaman」追加**: `{ id: "gaman", name: "ここはひとつガマン", type: "weakenAttack", emoji: "😤" }`。fixedDmg を持たず type:"weakenAttack" で他の技と区別。
- **useWaza() 分岐実装**: `waza.type === "weakenAttack"` の場合に早期 return でガマン処理。初回は `state.gamanActive = true` + 3行ログ。再使用は2行メッセージのみ（効果は変わらず、1ターン消費）。固定ダメージ処理は else ではなく return 後の流れで維持。
- **doFight() ガマン補正**: 会心計算後（`if(isCrit){ dmg = ... }`）の直後に `if(state.gamanActive){ dmg = Math.max(1, Math.floor(dmg/4)); }` を追加。log は isCrit × gamanActive の2×2の条件で分岐。
- **finishBattle() 解除**: `state.inBattle = false` の直後に `state.gamanActive = false` を追加。handlePlayerDown → finishBattle() / showBattleEnd → OKボタン → finishBattle() いずれも経由する。
- **openWazaMenu() 更新**: 説明文を「固定ダメージで削ったり、ガマンで通常攻撃を弱めたりできます」に更新。ガマン中は「⚡ガマン中」付記。ガマン技は「効果中」/「通常攻撃を弱める」で表示分岐。
- **UMA博士セリフ更新**: capturedCount<4 と Lv50+ 両方に「はずかし固め・小」「ここはひとつガマン」の言及追加。
- **getProgressHint priority17 tier3**: 「ここはひとつガマン」追記。
- **index.html ヘルプ**: 「補助技：」セクション追加。「ここはひとつガマン」説明（効果・解除タイミング）を記載。
- **デバッグ §63**: 「😤 ガマン状態でのらいぬ戦闘」「😤 ガマン状態で究極ゴリラHP12」「🔄 ガマン状態解除」の3ボタン追加。インラインハンドラで実装。

### 設計メモ

- 永続ステータス変更なし。`state.player.atk` は一切触らない。
- 解除漏れリスク: すべての戦闘終了が `finishBattle()` を経由するため、`finishBattle()` の1箇所にのみ解除処理を追加すれば十分。`handlePlayerDown()` も `finishBattle()` を直接呼ぶ。
- `state.gamanActive` は `loadGame()` / `saveGame()` には含めない（揮発性の戦闘フラグ）。ゲームロード時は state 初期値 `false` が使われる。
- `node --check` → exit 0（構文エラーなし）。

---

## v0.15.1 (2026-07-10)

### 修正・追加

- **actuallyStartBattle() バグ修正**: 戦闘開始時に magic-menu/item-menu は hidden にしていたが waza-menu が漏れていた。`document.getElementById("waza-menu").classList.add("hidden")` を追加。
- **WAZA_DATA 表示名変更**: `hazukashigatame` の `name` を「はずかし固め」→「はずかし固め・小」に変更。まほうコマンドの「はずかし固め」（MP3消費・可変6ダメージ）と見た目上区別するため。内部IDは変更なし（セーブデータ互換を維持）。
- **openWazaMenu() 説明テキスト追加**: メニュー先頭に「UMAを弱らせるための固定ダメージ技です。削りすぎに注意！」を追加。
- **checkUltimateGorillaHpHint(e) 追加**: doFight() の直前に配置した共有ヘルパー関数。究極ゴリラ(id="ultimategorilla")のHPが1〜10の時に「🎵 「うたう」チャンス！」をログに表示する。doFight / useWaza 双方から呼ぶ。
- **useWaza() 改善**: ダメージログの次行に「残りHP: X / MaxHP」を追加。winBattle チェック後に `checkUltimateGorillaHpHint()` 追加。
- **doFight() 改善**: winBattle チェック後に `checkUltimateGorillaHpHint()` 追加。
- **デバッグ §62**: 究極ゴリラ捕獲テスト用ボタン3本（HP12/10/1で戦闘開始）を `btn-debug-clear-gameclear` の下に追加。`debugForceUltimateGorillaHP12/10/1()` の3関数を `debugForceUltimateGorillaHP5()` の直後に追加。
- **getProgressHint priority17 tier3**: 「はずかし固め・小」の名前を明記。
- **index.html ヘルプ**: わざ技名を「はずかし固め・小」に更新。まほうとの違いを `<p class="small">` で注記。

### 設計メモ

- WAZA_DATA の `id` は内部参照のみに使用（`useWaza(id)` / `findById(WAZA_DATA, id)`）。`state.player.spells` に格納されるのは SPELL_DATA の ID のみであるため、同名 ID が SPELL_DATA にあっても相互汚染しない。
- `checkUltimateGorillaHpHint()` の配置位置: `doFight()` の直前。函数宣言の巻き上げがあるためどこでも呼び出せるが、意味的に隣接する場所にまとめた。
- `node --check` → exit 0（構文エラーなし）。

---

## v0.15 (2026-07-10)

### 追加

- 戦闘コマンドに「🥊 わざ（捕獲支援）」ボタン追加（フル幅、緑背景）。
- WAZA_DATA: 低固定ダメージ技4種（はずかし固め1/キドクラッチ2/カリツォー3/グーパンチ4）。
- openWazaMenu() / useWaza(id): サブメニュー・固定ダメージ付与ロジック追加。
- #waza-menu: `.submenu` クラスで既存の setBattleLocked(.submenu button) に自動包含。
- UMA博士 NPC: 捕獲数<4 時にわざコマンドヒント、Lv50+でHP調整ヒント追加。
- HOME_HINTS: わざ系ヒント2件追加。
- getProgressHint priority17 tier3: わざ活用法を追記。
- index.html ヘルプ: 「わざコマンドについて」セクション追加。

### 設計メモ

- WAZA_DATA は SPELL_DATA と完全に別配列。同名 ID(hazukashigatame 等)が両方に存在するが、findById の参照先配列が別なので衝突なし。
- useWaza はダメージ計算なし（固定値）。防御・攻撃力・ハルミ補正は一切乗らない。
- `node --check` → exit 0 (構文エラーなし)。

---

## v0.14.1 (2026-07-09)

### 追加

- 横スクロール編制覇後の究極ゴリラ捕獲誘導システム実装。
- isSideStoryCleared() ヘルパー: `sm.stageCleared["6"] && sm.defeatedEnemies["6:34,2"]`。
- ステータス画面に「横スクロール編 ✅ 制覇済み / 進行中」行追加。
- 最上位称号を「チンパンジーの聖域の覇者」→「ゴリラの世界の外側を見た者」に格上げ。
- NPC 4体（UMA博士/旅人/ゴリラ研究家/王様の使い）に横スクロール編制覇後セリフ追加。
- getHintPriority に priority17 追加。getProgressHint priority17 の3段階ヒント。
- priority9 テキストを「s6クリア済みだがチンパンジー未撃退」向けに変更。
- デバッグ3ボタン: 横スクロール編制覇/Lv99+ウクレレセット/ゲームクリアリセット。
- index.html ヘルプに「🌿 横スクロール編と本編目的」セクション追加。

### 設計メモ

- btn-debug-set-capture-ready ハンドラのバグ修正: `while + gainExp(0)` → `debugSetLevel99` パターン（p.level=99 + recomputeStats() + p.hasUkulele=true）に置き換え。
- priority17 は gameCleared チェックを getHintPriority の先頭で行うため「横スクロール編制覇 + 究極ゴリラ未捕獲」専用になる。
- isSideStoryCleared() はNPC・HOME_HINTS・openHomeModal・getHintPriority・renderStatusBody など複数箇所から参照。
- `node --check` → exit 0 (構文エラーなし)。

---

## v0.14 (2026-07-09)

### 追加

- 横スクロールステージ6「チンパンジーの聖域」(40×5マップ) 追加。
- 究極チンパンジー固定戦闘 / ステージ6報酬 / ゴール演出を実装。
- ステージ5ゴールモーダルに「🌿 チンパンジーの聖域へ進む」ボタン追加 (予告テキスト削除)。
- ヒント屋 priority 16 新設（s5クリア・s6未クリア向けガイド）。
- ゲートモーダル説明文を「5ステージ」→「6ステージ」に更新。

### 設計メモ

- row2 merchant (m) は x=21。boss は x=34 (キー: "6:34,2")。スタート側H@(2,2)、ゴール側G@(37,2)→H@(38,2)。
- 究極チンパンジーは HP1500/ATK72/DEF32 で全ボス中最強。EXP3000。
- stage6 の箱報酬: 80-180G / ラーメン / お弁当 / デオドラントスプレー（stage5より高水準）。
- 全マップ行を `node -e` で検証 → 全5行が40文字であることを確認。
- `node --check` → exit 0 (構文エラーなし)。

---

## v0.13.1 (2026-07-09)

### 修正

- 全5ステージのゴール側 H/G 配置を `b→H→G` から `b→G→H` に変更。
- G(ゴール)@x=37、H(帰還ゲート)@x=38 の順になり、プレイヤーはボス撃退→ゴール→帰還ゲートの自然な動線で進める。

### 設計メモ

- goalX=38 は変更なし。H が x=38 になったため、カメラが H まで表示されるよう goalX=38 を維持する必要がある。
- `moveSidePlayer()` の 'G' / 'H' 処理は変更不要。タイル文字を判定する共通ロジックがそのまま動く。
- v0.12.1 では H→G の順だったため「ゴール前に帰還ゲートを踏んでしまう」問題があった。本修正で解消。
- 全5行を `node -e` で再検証 → 全5行が40文字、x=37=G、x=38=H であることを確認。
- `node --check` → exit 0 (構文エラーなし)。

---

## v0.13 (2026-07-07)

### 追加

- 横スクロールステージ5「黒い城」(40×5マップ)追加。
- ラスボス級ゴリラ固定戦闘 / ステージ5報酬 / ゴール演出を実装。
- ステージ4ゴールモーダルに「🏰 黒い城へ進む」ボタン追加。
- ヒント屋 priority 15 新設（s4クリア・s5未クリア向けガイド）。
- ゲートモーダル説明文を「4ステージ」→「5ステージ」に更新。

### 設計メモ

- row2 merchant (m) は x=21（デザイン上 x=20 を意図したが、e@14 + 6g + m で実際は x=21 になった）。機能上は問題なし。
- ステージ6「チンパンジーの聖域」はゴールモーダルに予告テキストのみ。実装は将来版。
- ラスボス級ゴリラキー: "5:33,2"。スタート側H@(2,2)、ゴール側H@(37,2)は既存の共通 'H' ロジックで動作。
- stage5 の箱報酬: 60-130G / ラーメン / 弁当 / デオドラントスプレー（stage4より高水準）。
- 全マップ行を `node -e` で検証 → 全5行が40文字であることを確認。
- `node --check` → exit 0 (構文エラーなし)。

---

## v0.12.1 (2026-07-06)

### 追加

- 全4ステージのゴール直前(x=37)に🏠帰還ゲートを追加。
- デバッグ: 全4ステージにゴール側H付近移動ボタン追加。ステージ4スタート側Hボタンも補完。

### 設計メモ

- H位置: スタート側x=2、ゴール側x=37。G(ゴール)はx=38。ボスbとGの間の1タイルに配置。
- `moveSidePlayer()` の 'H' 処理は変更不要（既存の共通ロジックがそのまま動く）。
- 4ステージすべてのメインrowでx=37が元々 'g' だったことを確認済み（`node -e` で検証）。

---

## v0.12 (2026-07-06)

### 追加

- 横スクロールステージ4「ゴリラ山道」(40×5 マップ) 追加。
- 大魔王ゴリラ固定戦闘 / ステージ4報酬 / ゴール演出を実装。
- ステージ3ゴールモーダルに「⛰️ ゴリラ山道へ進む」ボタン追加。
- ヒント屋 priority 14 新設（s3クリア・s4未クリア向けガイド）。

---

## v0.11.3.2 (2026-07-06)

### 問題

**v0.11.3 の帰還導線が実機で動作しない**

- ゴールモーダルのボタンが押せない・表示されないとの報告。
- 帰還ゲート 🏠 が見つからないとの報告。

### 原因

1. **静的ボタンの `hidden` 付け外し方式の不安定さ**: `btn-side-goal-forest/town/return/stay` の4ボタンは HTML に静的に存在し、各ゴール関数で `classList.remove("hidden")` / `classList.add("hidden")` で表示を制御していた。何らかの理由（レンダリングタイミング・モバイルブラウザ）で制御が機能しないケースがあった。

2. **帰還ゲート H が x=0 でプレイヤーに見えなかった**: スタートは x=1 で、プレイヤーは右方向（x増加方向）に進む。x=0 は左側でカメラには映るが、プレイヤーが自然に踏む動線上にない。

### 対処

1. **JS 生成ボタン方式へ移行**: `modal-side-goal` から静的ボタン4つを削除。`openSideGoalModal()` / `openStage2GoalModal()` / `openStage3GoalModal()` 内で `document.createElement("button")` を使い、`onclick` ハンドラを直接アタッチ。`hidden` クラス操作を完全に廃止。

2. **`returnToNormalMapFromSide()` 共通関数**: `closeModal("modal-side-goal")` + `closeModal("modal-side-return-gate")` + `switchToNormalMap()` をまとめた共通関数。

3. **帰還ゲート H を x=2 へ移動**: ステージ1(x=2,y=1)、ステージ2(x=2,y=1)、ステージ3(x=2,y=2)。スタート(x=1)から右へ1歩で踏める。

### 注意

- `init()` から削除した4つのリスナー（`btn-side-goal-return/stay/forest/town`）の参照が他コードに残っていないことを確認済み。
- ES5 制約のため `onclick` プロパティを使用（クロージャでの多重登録リスクを回避）。

---

---

## v0.11.3 (2026-07-05)

### 問題

**横スクロール世界に入れるが出られない**

v0.11.2 でゲートから横スクロールに入れるようになったが、
ゴールに到達する前に途中離脱する手段がなかった。
また、`switchToNormalMap()` が戻り先座標を設定していなかったため、
プレイヤーが 🌀ゲート(2,3) に戻り、次の移動で再接触する可能性があった。

### 対処

1. **帰還ゲートタイル 'H'**: 各ステージ x=0 に追加。
   スタートから左に1マスでいつでも帰還可能。
2. **`switchToNormalMap()` 修正**: 戻り先を (2,4) に固定。
   🌀ゲート(2,3)の1マス下なので再接触しない。
3. **ゴールモーダルのボタン明示化**: `btn-side-goal-return` を
   各ゴール関数で `classList.remove("hidden")` して確実に表示。

### 注意

- 帰還ゲート 'H' は SIDE_TILE_EMOJI に追加済み。
  通常マップの 'H' (実家) とは別物。通常マップとサイドマップでタイル文字の名前空間は独立している。
- `switchToNormalMap()` の戻り先 (2,4) は通常マップの '.' タイル。
  RAW_MAP 行4は `"#..........A#"` なので (2,4) は '.' で安全。

---

## v0.11.2 (2026-07-05)

### 追加

- 通常マップ (2,3) に 🌀ゲートタイル 'V' を追加。
- `state.sideMap.gateExplained` フラグで初回説明 / 以降短縮確認を分岐。
- NPC 3体・ヒント屋・ヘルプに入口案内を追記。

---

## v0.11.1 (2026-07-05)

### 修正

- `triggerFixedEncounter()`: 未定義IDの場合に `console.warn` + `triggerEncounter()` フォールバック追加。
- `validateSideFixedEncounters()`: debug=1 専用の固定敵ID整合性チェック関数を追加。

---

## v0.11 (2026-07-05)

### 追加

- 横スクロールステージ3「古びた町はずれ」(40×5 マップ) 追加。
- 魔王ゴリラ固定戦闘 / ステージ3報酬 / ゴール演出を実装。
