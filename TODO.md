# TODO.md — 実装予定一覧

このプロジェクトの開発フローは以下の順番で進める。

1. プロデューサーからアイデアが共有される
2. [GAME_DESIGN.md](GAME_DESIGN.md) へ仕様として整理する
3. このファイル(TODO.md)へ実装予定として登録する(優先順位付け)
4. 必要なら実装する
5. [CHANGELOG.md](CHANGELOG.md) を更新する
6. GitHubへコミット・push する

「実装済み」のバージョンも記録として残し、上から新しい順に並べる。


## 🔮 今後の実装候補（プレイヤーフィードバックより）

### Version 0.44.1 候補以降

仲間サイドストーリー完了演出(v0.44.2候補) / 仲間装備商人販売 / 仲間わざ習得演出 / 仲間わざ2種類目 / サイドストーリー第2話

---

## ✅ 実装済み

### Version 0.44.1 — 仲間サイドストーリー安定化 (§114)

- **`normalizeCompanionSideStoryFlags()` 返値**: `changed` bool返却、loadGame()でsave判定に使用 ✅
- **モジュールスコープ変数4本**: `_cstorySessionId` / `_cstoryFromTavern` / `_cstoryAdvanceLock` / `_cstoryAdvanceTimer` ✅
- **`startCompanionSideStory()` 強化**: データ検証・酒場追跡・セッション更新 ✅
- **`closeCompanionSideStoryModal()` 強化**: 酒場からの場合のみ酒場再開・セッション変数クリア ✅
- **`btn-cstory-next`ハンドラ強化**: 全行advanceLock・200msタイマー・セッション検証 ✅
- **`showCompanionSideStoryLine()` 強化**: 再読時「物語を閉じる」・nullチェック ✅
- **`btn-debug-v44-story-reset-flags`**: 閲覧中でも安全なリセット ✅
- **`btn-debug-v44-story-boundary` 強化**: 4点境界確認（最終行表示だけ→未完 を追加） ✅
- **デバッグ2本追加**: 高速連打確認 / フラグ破損修復確認 ✅

### Version 0.44 — 仲間サイドストーリー第一段階 (§113)

- **`COMPANION_SIDE_STORY_DATA`**: 4仲間分のストーリーデータ定数 ✅
- **`state.companionSideStoryFlags`**: 完了フラグ（永続） ✅
- **`normalizeCompanionSideStoryFlags()`**: 旧セーブ互換ガード ✅
- **`hasCompanionEverJoined(cid)`**: 「一度でも仲間になった」判定 ✅
- **`isCompanionSideStoryUnlocked(cid)` / `getCompanionSideStoryLockReason(cid)`**: 解放判定・理由テキスト ✅
- **`showCompanionSideStoryLine()` / `startCompanionSideStory()` / `completeCompanionSideStory()` / `closeCompanionSideStoryModal()`**: 物語フロー関数群 ✅
- **酒場「📖 仲間の物語」セクション** (`renderTavernStories()`): ストーリーカード表示 ✅
- **`renderTavernMain()` 更新**: 仲間の物語ボタン追加 ✅
- **ステータス画面 §113セクション** (`renderStatusBody()`): 物語状態表示（全仲間） ✅
- **冒険の記録 §113セクション** (`renderRecordBody()`): 物語進捗 X/4 ✅
- **`#companion-story-modal`** (`index.html`): 会話モーダル ✅
- **`btn-cstory-next` / `btn-cstory-close`** (`init()`): 二重押し防止イベント ✅
- **`saveGame()` / `loadGame()` / `newGame()`**: companionSideStoryFlags対応 ✅
- **デバッグ9本 (§113)**: 解放セット / リセット / 全完了 / 境界確認2本 / 直接開く4本 ✅

### Version 0.43.1 — 仲間わざ安定化 (§112)

- **`ensureCompanionTechniqueUsageState()`**: 欠損キー補完ヘルパー（全リセットなし） ✅
- **`actuallyStartBattle()` 更新**: `resetCompanionTechniqueUsage()` 追加（belt-and-suspenders） ✅
- **`runCompanionTechniqueAction()` 更新**: ガードを `ensureCompanionTechniqueUsageState()` に変更 ✅
- **`clearCompanionCommandState()` コメント更新**: finishBattle()経由のみ呼ばれる旨を明記 ✅
- **デバッグ3本 (§112)**: ラウンド持越し / シュリタニHP1境界 / ハルミ回復・軽減境界 ✅
- **調査結果**: `clearCompanionCommandState()` は finishBattle() からのみ呼ばれる（ラウンド間リセットバグなし）✅

### Version 0.43 — 仲間わざ第一段階 (§111)

- **`COMPANION_TECHNIQUE_DATA`**: 4仲間分の仲間わざ定数（名前・習得条件・効果値） ✅
- **習得条件**: Lv25以上 + 特化装備rewardFlag=true（両方必要） ✅
- **`isCompanionTechniqueUnlocked(cid)`**: 習得判定ヘルパー ✅
- **`getCompanionTechniqueLockReason(cid)`**: 未習得理由テキスト ✅
- **`resetCompanionTechniqueUsage()`**: 1戦闘1回状態リセット ✅
- **`runCompanionTechniqueAction(cid)`**: わざ実行（null=不発ターン消費なし） ✅
- **仲間コマンドUI 5択**: たたかう/固有/まほう/わざ/まかせる ✅
- **`executeCompanionCommand()` technique分岐**: null時メニュー戻り ✅
- **ステータス画面 仲間わざセクション**: 習得済み/未習得・条件表示 ✅
- **冒険の記録 ⚡仲間わざ習得セクション**: 0/4〜4/4 ✅
- **デバッグ4本 (§111)**: 全員習得 / 使用リセット / ロック確認 / 1回確認 ✅
- **`clearCompanionCommandState()` 更新**: resetCompanionTechniqueUsage()追加 ✅

### Version 0.42.1 — 仲間装備探索報酬安定化 (§110)

- **`normalizeCompanionGearRewardFlags()`**: rewardFlags全エントリ検証・補正（boolean以外→false、インベントリ/装備スロット存在→true昇格） ✅
- **`grantCompanionGearReward()` バリデーション強化**: 無効gearId拒否・フラグ未設定インベントリ持ち→flag=true修正（在庫増やさない） ✅
- **`reconcileCompanionGearRewards()` 改善**: 付与装備名収集・`_pendingGearRewardNotices` push・返値true/false（冪等性確認可能） ✅
- **`renderField()` 遅延トースト**: loadGame時の reconcile 通知を初回フィールド描画時に showToast() ✅
- **`loadGame()` save条件**: `|| _reconciled` 追加（reconcile発生セーブも即時永続化） ✅
- **`renderStatusBody()` UI**: flag=true+所持0 → 「入手済み(現在未所持)」表示（仲間装備リスト・装備袋の両セクション） ✅
- **デバッグボタン2本 (§110)**: Stage2初回・再クリア確認 / reconcile×2確認 ✅

### Version 0.42 — 特化装備探索報酬システム (§109)

- **特化装備4種を探索報酬として実装**: ステージ2〜5初回クリア付与 ✅
- **`COMPANION_GEAR_REWARD_DATA`**: 入手元情報定数 ✅
- **`state.companionGearRewardFlags`**: 取得済みフラグ（二重取得防止） ✅
- **`grantCompanionGearReward()`**: 初回のみ付与ヘルパー ✅
- **`reconcileCompanionGearRewards()`**: ロード時補完（旧セーブ互換） ✅
- **UI**: 未所持特化装備の入手先表示 / 冒険の記録に特化装備収集セクション ✅
- **デバッグボタン4本 (§109)**: リセット/全取得/v2→v3確認/二重取得防止確認 ✅

### Version 0.41.1 — 仲間装備選択システム安定化 (§108)

- **`ensureCompanionGearState()` versionガード強化**: Infinity/文字列/"1"パース/負数クランプ ✅
- **装備選択UI 連打防止**: data-gear-action クリック直後 disabled=true ✅
- **v0.41実装構造確認**: 8装備×actionKey対応・version移行チェーン・combat actionKey統一 ✅
- **デバッグボタン2本 (§108)**: 行動別ボーナス全確認(32パターン) / 装備切替残留チェック ✅

### Version 0.41 — 仲間装備2種類目・装備選択アップデート (§107)

- **`COMPANION_GEAR_DATA` 拡張**: 特化装備4種追加（会心の腕輪/網師のベルト/研究ノート/祈りのブローチ）で合計8種 ✅
- **`getCompanionEquipmentBonus(cid, type, actionKey)`**: actionKey対応（"attack"/"special1"/"special2"/"magic"）後方互換 ✅
- **全コンバットアクションに actionKey 追加**: 8箇所更新 ✅
- **`ensureCompanionGearState()` v1→v2移行ブロック**: 新装備4種各1個配布・version=2 ✅
- **`loadGame()` v2昇格検出 → 自動 saveGame()** ✅
- **ステータス画面装備UI刷新**: 全装備一覧・バッジ（★装備中/装備可能/未所持）・effectDesc行 ✅
- **仲間装備袋 仲間別グループ表示**: 4仲間×2種グループ形式 ✅
- **おすすめ一括装備 明示的スターター選択**: preferred mapでhotblood_bandana等4種固定 ✅
- **デバッグボタン4本 (§107)**: v1→v2移行確認 / 新装備全員装備 / ジュリタニ比較 / ハルミ比較 ✅

### Version 0.40.1 — 仲間装備システム安定化 (§106)

- **`ensureCompanionGearState()`**: inventory値サニタイズ (NaN/負数/Infinity/文字列/null → 0)。companionGearVersion 型ガード ✅
- **`getCompanionEquippedGear()`**: cid検証・gearId型検証・allowedCompanion照合・在庫チェック完備 ✅
- **`getCompanionEquipmentBonus()`**: Math.max(0,bonus) 保証・型不正ガード ✅
- **`equipCompanionGear()`**: cidガード強化・toast通知 ✅
- **`loadGame()`**: _prevGearVer でスターター配布後の saveGame() 追加 ✅
- **デバッグボタン2本**: 破損確認 / 増殖防止確認 ✅

### Version 0.40 — 仲間装備システム第一段階 (§105)

- **COMPANION_GEAR_DATA**: スターター4種定義（専用+ボーナス） ✅
- **ensureCompanionGearState()**: 旧セーブ自動スターター配布 (version=0→1) ✅
- **装備ヘルパー3関数**: getCompanionEquippedGear / getCompanionEquipmentBonus / equipCompanionGear ✅
- **全コンバットアクションに装備ボーナス適用**: 8箇所（通常/特殊/魔法×4仲間、ジュリタニ会心後、ハルミmaxHp前） ✅
- **ステータス画面**: 装備行・装備袋・おすすめ一括装備 ✅
- **saveGame/loadGame/newGame**: companionEquipment/GearInventory/GearVersion ✅
- **デバッグボタン5本** ✅

### Version 0.39.1 — 仲間Lv節目セリフ安定化 (§104)

- **milestonesデータガード強化**: null/配列/破損 → 旧セーブ補完。存在するobject → 既存boolean保持・欠損/非boolean補完 ✅
- **旧セーブと新セーブの区別**: 旧セーブ(milestones未定義)は現在Lvで補完。新セーブ(milestones定義済み)は値を尊重 ✅
- **debugのfalse設定を保護**: getCompanionLevel()再呼び出しで上書きされないことを確認 ✅
- **デバッグボタン2本追加**: 2人同時Lv10確認 / 複数節目確認（Lv1→Lv60） ✅
- 境界値・複数節目・Lv99ダブルログなし・セーブタイミング: 確認済み・コード変更なし ✅

### Version 0.39 — 仲間Lv節目セリフ・成長の記録 (§103)

- **`COMPANION_LEVEL_MILESTONE_LINES`**: 仲間4人×Lv10/50/99のセリフデータ定数 ✅
- **`checkCompanionLevelMilestones(cid, oldLevel, newLevel)`**: 節目チェック・ログ表示・フラグ更新 ✅
- **`getCompanionLevel()` 更新**: `milestones` 未定義時に現在Lvで補完（旧セーブ互換） ✅
- **`gainCompanionExp()` 更新**: `oldLevel` 保存・Lvアップ後に `checkCompanionLevelMilestones` 呼び出し ✅
- **ステータス画面「成長の節目」行**: 全4仲間に Lv10/50/99 到達状況を表示 ✅
- **デバッグボタン4本 (§103)**: Lv10確認(ジュリタニ) / Lv50確認(シュリタニ) / Lv99確認(ノリオ) / フラグ全リセット ✅
- セーブ/ロード: `state.companionLevels[cid].milestones` として既存キーに内包 ✅
- 旧セーブ: Lv10→10済 / Lv50→10/50済 / Lv99→全済 / Lv1〜9→全未達 に自動補完 ✅
- 複数節目越え: 最高節目セリフのみ表示、全通過済みをtrueに記録 ✅

### Version 0.38.1 — 仲間Lv能力成長安定化 (§102)

- 成長段階境界値確認: Lv9→10 / 24→25 / 49→50 / 74→75 / 98→99 ✅
- 二重適用なし確認: runCompanionAutoCommand()に追加適用なし ✅
- 手動/まかせるAI同一値: 行動関数共用で構造上一致 ✅
- ハルミ最大HP超過なし確認 ✅
- 捕獲率・EXP2倍・軽減率・AI比率変更なし確認 ✅
- セーブ互換確認: growthTier/growthBonusはLvから毎回計算 ✅

### Version 0.38 — 仲間Lvによる能力成長 (§101)

- **`getCompanionGrowthTier(cid)`**: Lv→Tier 0〜5 変換関数 ✅
- **`getCompanionGrowthBonus(cid)`**: Tier→成長ボーナス変換関数 ✅
- **`runSingleCompanionAction` 更新**: ジュリタニ/シュリタニ/ノリオに成長ボーナス加算。ハルミ通常攻撃はなし ✅
- **`runCompanionSpecialAction` 更新**: 固有1・固有2に成長ボーナス加算。かばう・まもりの光の軽減率変更なし ✅
- **`runCompanionMagicAction` 更新**: 攻撃まほう3種+ハルミ回復まほうに成長ボーナス加算 ✅
- **ステータス画面「成長効果」行追加**: 全4仲間に Tier別表示 ✅
- **デバッグボタン2本追加**: ハルミ回復成長確認 Lv1/Lv99 ✅

### Version 0.37.1 — 仲間成長システム安定化 (§100)

- **`getCompanionLevel` データガード**: level(1〜99)/exp(0以上)/nextExp(正の数) の安全化 ✅
- **`gainCompanionExp` ログ改善**: 最終Lvのみ1回出力。Lv99到達は専用ログ `"🌟 最高レベル Lv99 に到達した！"` ✅
- **Lv99時表示統一**: 酒場「Lv.99 MAX」/ステータスEXP「MAX」/冒険の記録「Lv.99 MAX」✅
- **EXP二重付与なし確認**: winBattle/attemptCapture で各1回のみ確認 ✅
- **デバッグボタン3本追加**: Lv1リセット/複数Lvアップ確認/パーティ仲間のみEXP確認 ✅

### Version 0.37 — 仲間成長システム（Lv・EXP 第一段階）(§99)

- **`state.companionLevels` 追加**: `{ cid: { level, exp, nextExp } }` — state・saveGame・loadGame 対応 ✅
- **`getCompanionLevel(cid)` 追加**: 初回アクセス時 `{ level:1, exp:0, nextExp:25 }` で初期化 ✅
- **`gainCompanionExp(baseExp)` 追加**: パーティ中の仲間にEXP付与。Lv99キャップ。Lvアップログ出力 ✅
- **`winBattle()` 更新**: 通常勝利時にパーティ仲間もEXP取得 ✅
- **`attemptCapture()` 更新**: 捕獲成功時にパーティ仲間もEXP取得 ✅
- **EXPテーブル**: 主人公と同じ `nextExp = level * 10 + 15` ✅
- **Lvアップログ**: `"🎉 [名前]は Lv[N]になった！"` を battleログに出力 ✅
- **酒場「仲間を探す」Lv表示**: 各仲間カードに Lv.N を水色で追加 ✅
- **酒場「仲間を見る」Lv表示**: パーティ中仲間カードに Lv.N を追加 ✅
- **ステータス画面「仲間」強化**: 全4仲間の `Lv.N / EXP N/M / パーティ状態` 表示 ✅
- **冒険の記録「👥 仲間」追加**: 全4仲間のLv表示（「次の目標」直前）✅
- **セーブ互換**: 古いセーブは `companionLevels: {}` で補完 ✅
- **仲間能力変更なし**: 会心/捕獲/EXP2倍/まほう固定。LvによるAI/数値強化は未実装 ✅
- **`gainExp()` / BGM / 捕獲率 変更なし** ✅
- **デバッグボタン3本追加** (§99): 仲間Lv10 / Lv50 / Lv99（4人全員一括）✅

### Version 0.36.1 — まかせるAI 4択安定化 (§98)

- **まほうログ形式確認**: 2行形式（名前にまかせた！ + まほう名を選んだ！）が正しく動作 ✅
- **ウェイト正規化確認**: 全パスで正規化後 合計=1.0 になることを確認 ✅
- **前回行動記憶 `"magic"` 確認**: ペナルティ補正 → 正規化の流れが正常 ✅
- **ハルミ低HP 回復80% 確認**: 固有回復 + まほう回復の組み合わせ正常 ✅
- **ハルミ高HP 攻撃寄り 確認**: 回復系過多にならないことを確認 ✅
- **攻撃系まほう勝利フロー確認**: `true` 返値 → `winBattle()` → 二重 `enemyTurn()` なし ✅
- **ハルミ小さな回復（まかせる時）**: 常に `false` → winBattle に入らない ✅
- **手動まほうUI 変更なし確認**: `showCompanionMagicMenu` / `executeCompanionCommand` 変更なし ✅
- **デバッグボタン2本追加** (§98): 魔法名ログ確認 / 攻撃魔法勝利確認 ✅

### Version 0.36 — まかせるAIに仲間まほうを混ぜる (§97)

- **`runCompanionAutoCommand(cid)` 4択対応**: たたかう / 固有1 / 固有2 / **まほう** の4択に拡張 ✅
- **仲間別基本比率（まほう追加）**: ジュリタニ(30/35/15/20%) / シュリタニ(20/35/25/20%) / ノリオ(35/30/15/20%) / ハルミ(20/35/20/25%) ✅
- **敵HP≤15 4択状況判断**: ジュリタニ(45/35/5/15%) / シュリタニ(50/25/10/15%) / ノリオ(55/25/5/15%) / ハルミ(70/5/10/15%) ✅
- **ハルミ+HP≤40% 4択**: たたかう5% / 小さな癒し45% / まもりの光15% / 小さな回復35% ✅
- **ハルミ+HP≥85% 4択**: たたかう45% / 小さな癒し5% / まもりの光35% / 小さな回復15% ✅
- **前回行動記憶 4択対応**: `"magic"` キーを追加。前回 magic → wM -0.10 補正 ✅
- **ウェイト正規化 4択**: `total = wA + wS1 + wS2 + wM`。total≤0 フォールバック ✅
- **magic ログ2行**: `"🤝 名前にまかせた！" + "まほう名を選んだ！"` ✅
- **magic 実行**: `runCompanionMagicAction(cid)` 呼び出し → 勝利時 `true` 返値 → `winBattle()` ✅
- **ハルミ小さな回復（まかせる時）**: `updateBattlePlayerStatus()` は `runCompanionMagicAction` 内で呼ばれる ✅
- **`"special"` 後方互換**: 旧セーブの `"special"` → `"special1"` 扱いを維持 ✅
- **仲間MP / 主人公MP消費なし** ✅
- **捕獲率 / `gainExp()` / BGM制御 変更なし** ✅
- **究極ゴリラ戦で仲間コマンドなし**（変更なし）✅
- **デバッグボタン3本追加** (§97): 4択確認 / ハルミ回復確認 / 敵HP10確認 ✅

### Version 0.35.1 — 仲間まほう安定化 (§96)

- **`showCompanionMagicMenu()` に `companionCommandLocked` ガード追加**: `companionCommandActive` チェックに加え、`companionCommandLocked` チェックを追加。二重呼び出し防止を強化 ✅
- **戻る動作確認**: `↩ 戻る` → `showCompanionCommandForIdx(idx)` → `companionCommandLocked = false` のパスが正常 ✅
- **二重クリック防止確認**: `disabled=true` による防護が機能していることを確認。無効ボタンはイベント発火しない ✅
- **`clearCompanionCommandState()` 確認**: `#companion-magic-menu` hidden 追加済み（v0.35）。次戦闘に前回情報が残らない ✅
- **ハルミ「小さな回復」HP色更新確認**: `updateBattlePlayerStatus()` 呼び出しにより HP色・バッジが即更新 ✅
- **攻撃系まほう勝利処理確認**: `true` 返値 → `executeCompanionCommand` → `winBattle()` フロー正常 ✅
- **デバッグボタン2本追加** (§96): 「仲間まほう勝利確認（敵HP5）」「まほうメニュー連打防止確認」 ✅
- 仲間MP / 主人公MP消費なし ✅
- まかせるAI（3択）変更なし ✅
- 捕獲率 / `gainExp()` / BGM制御 変更なし ✅

### Version 0.35 — 仲間まほう追加 (§95)

- **仲間コマンドUIに「✨ まほう」追加**: 2×2グリッド（⚔️/⭐ / ✨/🤝）レイアウト ✅
- **`#companion-magic-menu`**: `index.html` に仲間まほうサブメニュー div 追加 ✅
- **`showCompanionMagicMenu(cid)`**: 仲間まほうサブメニューを表示する関数 ✅
- **`runCompanionMagicAction(cid)`**: 仲間まほう実行。返値 true=敵HP0、false=生存/回復 ✅
- **ジュリタニ「🔥 熱血エール」**: 敵に 5〜12 ダメージ ✅
- **シュリタニ「🫧 おちつきの霧」**: 敵に 1〜3 微ダメージ + 捕獲フレーバー ✅
- **ノリオ「🔍 観察メモ」**: 敵に 3〜7 小ダメージ + EXPフレーバー ✅
- **ハルミ「✨ 小さな回復」**: 主人公HP 15〜25 回復。HP満タン時は専用メッセージ ✅
- **`setBattleLocked()` 更新**: `#companion-magic-menu` を除外セレクターに追加 ✅
- **`clearCompanionCommandState()` 更新**: `#companion-magic-menu` を hidden に追加 ✅
- **`executeCompanionCommand()` 更新**: `"magic"` モード追加 + mBtn disable ✅
- **ハルミ回復で `updateBattlePlayerStatus()` 呼び出し**: HP色・バッジ連動 ✅
- **攻撃系まほうで `renderEnemy()` 呼び出し**: 敵HP更新 ✅
- **仲間MP未実装**: 主人公MPも消費しない ✅
- **まかせるAIには未混入**: たたかう / 固有1 / 固有2 の3択を維持 ✅
- **捕獲率/`gainExp()` 変更なし** ✅
- **BGM制御変更なし** ✅
- **究極ゴリラ戦で仲間コマンドなし** ✅（変更なし）
- **デバッグボタン3本追加** (§95): 仲間まほう確認 / ハルミHP25% / 仲間まほうUI確認 ✅

### Version 0.34.1 — 戦闘UI安定化 (§94)

- **CSS バグ修正**: `.battle-hp-warn` が `#ffd166`（親と同色）だったため `#ff9f1c`（オレンジ）に修正 ✅
- **HP色レビュー確認**: `hpEl.className` の直接代入で毎回上書き。回復後の色戻り・次戦闘リセットも正常 ✅
- **守り効果バッジクリア確認**: `clearCompanionCommandState()` 内でリセット順序が正しいことを確認 ✅
- **うたうチャンスバッジ安定確認**: `state.enemy.id === "ultimategorilla"` チェックで通常敵戦では絶対に出ない ✅
- **ガマン+守りバッジ共存確認**: `flex-wrap: wrap` で折り返し対応済み ✅
- **仲間コマンド進捗確認**: `total > 1` のみ表示、1人では非表示 ✅
- **デバッグボタン2本追加**: HP色確認（HP45%）/ ガマン+守りバッジ同時確認 ✅

### Version 0.34 — 戦闘UI改善・状態表示 (§93)

- **主人公HP カラー表示**: HP≥50%=通常(黄)、30〜49%=`.battle-hp-warn`(黄強調)、<30%=`.battle-hp-danger`(赤) ✅
- **`#battle-status-badges`**: 戦闘状態バッジ表示エリア追加 (`index.html`) ✅
- **`updateBattleStatusBadges()`**: 守り効果あり / うたうチャンス バッジを動的更新 ✅
- **🛡️ 守り効果あり バッジ**: `battleDamageReduction > 0` の間表示。敵攻撃後に自動消去 ✅
- **🎤 うたうチャンス バッジ**: 究極ゴリラHP1〜10 + Lv99 + ウクレレ所持 時に表示 ✅
- **仲間コマンド進捗表示**: `showCompanionCommandForIdx` に「N/M人目」追加 ✅
- **敵HP表示改善**: `enemy-hp-text` を `"HP N/M"` 形式に変更 ✅
- **`updateBattleStatusBadges()` 呼び出しタイミング**: `updateBattlePlayerStatus()` / `runCompanionSpecialAction()` / `checkUltimateGorillaHpHint()` / `clearCompanionCommandState()` ✅
- **デバッグボタン2本追加**: 戦闘UI確認 / 守り効果バッジ確認 ✅
- **戦闘ロジック変更なし**: `enemyTurn`/`winBattle`/`finishBattle`/`gainExp`/BGM は変更なし ✅
- **捕獲率/gainExp() 変更なし** ✅

### Version 0.33.1 — まかせるAI 3択安定化 (§92)

- **ログ形式改善**: `"🤝 name にまかせた！ → action"` → `"🤝 name にまかせた！" / "action を選んだ！"` の2行形式 ✅
- **デバッグボタン3本のラベル改善**: 分かりやすい名称に統一 ✅
- **デバッグボタン3の動作変更**: 「ハルミHP30%確認」→「敵HP10確認」（enemyHpLow 状況判断テスト）✅
- **ウェイト正規化確認**: total≤0フォールバック / Math.max(0,...) クランプ 済み ✅
- **前回行動記憶3択確認**: "attack"/"special1"/"special2" 対応・"special" 後方互換 済み ✅
- **battleDamageReduction 接続確認**: runCompanionSpecialAction 経由で手動選択と同じ経路 ✅
- **捕獲率/gainExp() 変更なし** ✅

### Version 0.33 — まかせるAI 2つ目固有コマンド対応 (§91)

- **`runCompanionAutoCommand(cid)` 3択対応**: たたかう / 1つ目固有 / 2つ目固有 のウェイト正規化方式 ✅
- **仲間別基本ウェイト**: ジュリタニ(35/45/20%) / シュリタニ(25/45/30%) / ノリオ(40/40/20%) / ハルミ(25/50/25%) ✅
- **状況判断3択**: 敵HP≤15 / ハルミ+HP≤40% / ハルミ+HP≥85% のウェイトをオーバーライド ✅
- **前回行動記憶3択**: `"attack"` / `"special1"` / `"special2"` の3値に拡張。前回行動を-0.10後に正規化 ✅
- **後方互換**: 古い `"special"` 値を `"special1"` として処理 ✅
- **`battleDamageReduction` 経路**: まかせるで「かばう」/「まもりの光」が選ばれても軽減が発動 ✅
- **捕獲率/`gainExp()` 変更なし** ✅

### Version 0.32.1 — 2つ目固有コマンド安定化 (§90)

- **`showCompanionSpecialMenu()` 改善**: s1/s2/sback クリック直後に全ボタンを `disabled=true` ✅
- **`actuallyStartBattle()` 更新**: `state.battleDamageReduction = 0` を追加（二重安全） ✅
- **敵攻撃ログ改善**: 軽減発動時のログを「守りの効果でダメージが少し減った！」に変更 ✅
- **確認済み**: clearCompanionCommandState / 戻る動作 / 究極ゴリラ戦 / 捕獲率 / gainExp ✅

### Version 0.32 — 仲間2つ目の固有コマンド追加 (§89)

- **固有コマンドサブメニュー追加**: 「⭐ 固有」押下で2択+戻るのサブメニューを表示 ✅
- **`#companion-special-menu` 追加**: `index.html` に `div.submenu.hidden` を追加 ✅
- **`setBattleLocked()` 更新**: `:not(#companion-special-menu)` を除外セレクターに追加 ✅
- **`clearCompanionCommandState()` 更新**: `battleDamageReduction=0` / `companion-special-menu` hidden を追加 ✅
- **`showCompanionSpecialMenu(cid)` 新設**: 固有コマンド選択サブメニューを表示する関数 ✅
- **`runCompanionSpecialAction(cid, specialId)` 拡張**: `specialId="second"` で2つ目を実行 ✅
- **ジュリタニ「🛡️ かばう」**: 次の敵攻撃20%軽減（`battleDamageReduction=0.20`） ✅
- **シュリタニ「🕸️ 捕獲の網」**: Lv連動微ダメージ（2〜4）+ 捕獲フレーバー ✅
- **ノリオ「📝 経験値メモ」**: Lv連動小ダメージ（4〜8）+ EXPフレーバー ✅
- **ハルミ「🛡️ まもりの光」**: 次の敵攻撃25%軽減（`battleDamageReduction=0.25`） ✅
- **`enemyTurn()` ダメージ軽減**: `battleDamageReduction` が設定されていれば適用して1回リセット ✅
- **捕獲率/`gainExp()` 変更なし** ✅
- **まかせるAIへの混入なし**: 「まかせる」は1つ目固有コマンドのまま ✅
- **究極ゴリラ戦で仲間コマンドなし** ✅ (変更なし)

### Version 0.31.1 — まかせるAI安定化 (§88)

- **最終クランプ追加**: 全補正後に `specialChance = Math.max(0, Math.min(1, specialChance))` ✅
- **初期化ガード確認**: 古いセーブでも `lastCompanionAutoAction` が安全 ✅
- **クリアパス確認**: `finishBattle()` 経由の両経路で必ずリセットされることを確認 ✅

### Version 0.31 — 仲間AIの状況判断・まかせる改善 (§87)

- **状況判断**: 敵HP≤15→攻撃優先 / ハルミ+プレイヤーHP≤40%→回復90% / ハルミ+HP≥85%→回復25% ✅
- **前回行動記憶**: `state.lastCompanionAutoAction` で仲間ごとの前回行動を記憶 ✅
- **前回行動補正**: 前回と同じ行動を選びにくくする（±0.10） ✅
- **`clearCompanionCommandState()` 更新**: `lastCompanionAutoAction` も戦闘終了時にリセット ✅
- **デバッグボタン追加**: HP満タン / HP低下 / 敵HP低め の3種 ✅

### Version 0.30 — 仲間コマンド・バランス調整 (§86)

- **「まかせる」比率を仲間別に調整**: ジュリタニ55%/シュリタニ65%/ノリオ50%/ハルミ70% ✅
- **ジュリタニ「会心の構え」**: 上限 30→28、会心率 35%→30% ✅
- **シュリタニ「捕獲アシスト」**: ダメージ 固定1→Lv連動1〜3 ✅
- **ノリオ「経験値の眼」**: ダメージ上限 10→12 ✅
- **ハルミ「小さな癒し」**: 回復上限 30→25、HP満タン時に専用メッセージ ✅
- **ログ形式統一**: 「アクション名 + 効果」の2行形式に整理 ✅

### Version 0.29.1 — 「まかせる」ランダム行動化 (§85)

- **`runCompanionAutoCommand(cid)` 新設**: まかせる専用。50/50 で通常攻撃 or 固有コマンドをランダム選択 ✅
- **選択ログ**: `"🤝 [名前]にまかせた！ → [行動名]"` を出力 ✅
- **`executeCompanionCommand()` 変更**: `mode === "auto"` → `runCompanionAutoCommand()` 呼び出し ✅
- **ハルミ維持**: 固有コマンド選択時も `return false` で敵ダメージなし・勝利チェック不要 ✅
- **デバッグボタン追加**: まかせるランダム確認 / ハルミまかせる回復確認 ✅

### Version 0.29 — 仲間固有コマンド拡張 (§84)

- **仲間コマンドUI 3択化**: `[⚔️ たたかう] [固有コマンド] / [🤝 まかせる (全幅)]` ✅
- **ジュリタニ「💥 会心の構え」**: 強攻撃（上限30）、35%で大会心×1.6倍 ✅
- **シュリタニ「🪤 捕獲アシスト」**: 1ダメージ + 捕獲フレーバーログ ✅
- **ノリオ「📈 経験値の眼」**: 小ダメージ（上限10）+ EXPフレーバーログ ✅
- **ハルミ「✨ 小さな癒し」**: 主人公HP小回復（上限30）、最大HP超えない ✅
- **`runCompanionSpecialAction(cid)` 新設**: 固有コマンド実行関数 ✅
- **`executeCompanionCommand()` 拡張**: `mode === "special"` で固有コマンド分岐 ✅
- **デバッグボタン追加**: 固有コマンドテスト / ハルミ回復確認 ✅

### Version 0.28.1 — 仲間コマンド選択安定化 (§83)

- **`setBattleLocked()` セレクター修正**: `companion-command-menu` を除外し `disabled=false` 上書き不要に ✅
- **`clearCompanionCommandState()` 新設**: キュー・フラグ・UI を一括クリア ✅
- **`state.companionCommandActive/Locked` 追加**: フェーズ管理と二重押し防止 ✅
- **`executeCompanionCommand()` ガード強化**: 先頭の `if (companionCommandLocked) return;` 追加 ✅
- **`finishBattle()` 集約**: インライン掃除 → `clearCompanionCommandState()` 呼び出し ✅

### Version 0.28 — 仲間ごとの戦闘コマンド選択・第一段階 (§82)

- **`runSingleCompanionAction(cid)`**: 仲間1人分の行動を実行する共通関数 ✅
- **`startCompanionCommands()`**: コマンドキュー初期化 + 最初のメニューを表示 ✅
- **`showCompanionCommandForIdx(idx)`**: 仲間コマンドメニュー（たたかう/まかせる）を表示 ✅
- **`executeCompanionCommand(cid, mode)`**: コマンドボタン押下処理 + 次の仲間 or 敵ターン ✅
- **究極ゴリラ戦**: `e.final` → コマンドなし、見守りログ ✅
- **`finishBattle()` クリーンアップ**: 仲間コマンドキューを戦闘終了時にリセット ✅
- **デバッグボタン**: 3種（のらいぬ / 中ボスHP30 / 究極ゴリラHP10） ✅

### Version 0.27.1 — 仲間自動戦闘安定化 (§81)

- **`runCompanionAutoActions()` 返値**: `true` / `false` で仲間撃破を明示 ✅
- **各仲間に `if (e.hp <= 0) { break; }` 追加**: 後続仲間の不要行動を防止 ✅
- **`scheduleAfterPlayerAttack()` 判定強化**: `companionKilled` 返値で `winBattle/enemyTurn` 分岐 ✅
- **デバッグボタン**: 「仲間2人+のらいぬHP3（仲間撃破確認）」 ✅

### Version 0.27 — 仲間の戦闘自動参加 (§80)

- **`scheduleAfterPlayerAttack()`**: プレイヤー攻撃後に仲間行動→敵ターンをスケジュール ✅
- **`runCompanionAutoActions()`**: 仲間4人の自動行動（ジュリタニ会心/シュリタニ捕獲補助/ノリオEXP/ハルミ魔法） ✅
- **究極ゴリラ保護**: `e.final` フラグ時は仲間行動スキップ ✅
- **`doFight()` / `castSpell()` / `useWaza()` 更新**: 攻撃行動後に `scheduleAfterPlayerAttack()` を使用 ✅
- **デバッグボタン**: 「仲間2人+のらいぬ戦闘」「仲間2人+究極ゴリラHP10」 ✅

### Version 0.26.1 — フィールド仲間追従安定化 (§79)

- **`resetPartyTrail()` 共通化**: `state.partyTrail = []` を1か所に集約。全14箇所で統一使用 ✅
- **仲間加入/離脱時リセット**: `recruitCompanion()` / `dismissCompanion()` で呼び出し追加 ✅
- **nullセーフ化**: `renderField()` `|| []` ガード / `movePlayer()` `if (!state.partyTrail)` ガード ✅
- **debug全ボタン対応**: companion UIデバッグ8本 + 追従テスト3本に `resetPartyTrail()` 統一 ✅
- **新debugボタン**: 「👥 パーティ解除 + 軌跡リセット」追加 ✅

### Version 0.26 — フィールド仲間追従表示 (§78)

- **`state.partyTrail: []`** 追加: 状態オブジェクトに最大2エントリの軌跡配列 ✅
- **`movePlayer()` 更新**: 有効な移動前に現在位置を `unshift()`、2件超で `pop()` ✅
- **`renderField()` 更新**: `trailMap` でトレイル位置→仲間絵文字を構築。タイル描画に仲間追従チェック追加 ✅
- **リセット**: `switchToSideMap()` / `switchToNormalMap()` / `loadGame()` で `state.partyTrail = []` ✅
- **デバッグ §78**: 仲間2人追加(ジュリタニ+ハルミ) / 軌跡リセット の2ボタン追加 ✅
- **保護**: 仲間能力・加入/離脱処理・パーティ上限・戦闘・BGM・横スクロールマップは変更なし ✅

### Version 0.25 — 酒場UI改善・仲間カード整理 (§77)

- **`.companion-card` CSS追加** (§77): 角丸ボーダー・半透明カード。`companion-card-header` / `companion-name` / `companion-ability` / `companion-status` / `companion-quote` / `companion-action` クラス群 ✅
- **`renderTavernRecruit()` 更新** (§77): `shop-row` → `companion-card` 形式。全仲間をカード表示。加入可能なら「🤝 仲間にする」フルwidthボタン ✅
- **`renderTavernViewParty()` 更新** (§77): `shop-row` → `companion-card` 形式。能力+セリフ表示 ✅
- **`renderTavernLeave()` 更新** (§77): `shop-row` → `companion-card` 形式。「👋 外す」ボタン（赤ボーダー）✅
- **デバッグセクションヘッダー更新** (§77): §75-77 v0.24〜v0.25 に整理 ✅

### Version 0.24.1 — 仲間セリフ安定化・横スクロール制覇のみ反応追加 (§76)

- **`getCompanionQuote(c)` null ガード追加** (§76): `if (!c) return null` で安全化 ✅
- **横スクロール制覇のみ（未クリア）対応** (§76): `isSideStoryCleared() && !state.gameCleared` → `sideClearLine` 薄紫 ✅
- **伝説装備コンプリートのみ対応** (§76): `isLegendaryEquipmentComplete() && !isFullyCompleted()` → `legendaryLine` 橙 ✅
- **デバッグ §76**: 通常状態・横スクロール制覇のみ・伝説装備コンプのみ のテストボタン3本追加 ✅

### Version 0.24 — 仲間4人の会話バリエーション追加 (§75)

- **`getCompanionQuote(c)` ヘルパー追加** (§75): 5段階状態判定で適切なセリフと色を返す ✅
- **`COMPANION_DATA` に3フィールド追加** (§75): `sideClearLine` / `dexLine` / `legendaryLine` ✅
- **`renderTavernRecruit()` 更新** (§75): 2状態 → `getCompanionQuote()` 使用 ✅
- **`renderTavernViewParty()` 更新** (§75): 2状態 → `getCompanionQuote()` 使用 ✅
- **冒険の記録「次の目標」更新** (§75): 全達成時に酒場の仲間を促すメッセージ追加 ✅
- **デバッグ §75**: 仲間セリフ状態テストボタン追加 ✅

### Version 0.23 — クリア後フィールドBGM軽量メロディ調整 (§74)

- **`BGM_DATA.fieldClear` 追加** (§74): triangle音色・Cメジャー・穏やか余韻ループ ✅
- **`getFieldBgmType()` ヘルパー追加** (§74): `state.gameCleared` で field/fieldClear を切り替え ✅
- **`updateBGM("field")` → `updateBGM(getFieldBgmType())` 全置換** (§74): 8箇所 ✅
- **デバッグ §74**: クリア後フィールドBGMテストボタン追加 ✅

### 今後のTODO

- BGMメロディさらなる微調整
- 仲間4人の会話バリエーション追加
- 冒険の記録UI改善（達成率バー・アイコン追加など）

### Version 0.22 — 図鑑未捕獲UMAヒント強化 (§73)

- **UMA_DATA 全9種に hintArea/hintText/hintCatch 追加** (§73): 究極ゴリラは専用ヒント ✅
- **図鑑モーダル（renderDexBody）未発見/未捕獲ヒント表示** (§73): 📍hintArea / 💡hintText ✅
- **図鑑詳細モーダル 捕獲ヒント追加** (§73): 通常UMA 発見済み未捕獲時に hintCatch 表示 ✅
- **UMA博士 未捕獲ヒント** (§73): 最初の未捕獲UMA名 + hintArea/hintText セリフ追加 ✅
- **攻略ペーパービュー屋 getProgressHint() 強化** (§73): 未捕獲UMAを tier 別で具体的にヒント ✅
- **冒険の記録 図鑑セクション「図鑑でヒントを確認」ボタン** (§73): 未コンプ時に追加 ✅
- **デバッグ §73** (§73): 最初のUMAだけ未捕獲 / 発見済み / 図鑑全リセット の3ボタン追加 ✅

### 今後のTODO

- クリア後フィールドBGM調整（BGM制御は触らず、メロディ配列のみ調整）
- 仲間4人の会話バリエーション追加
- 冒険の記録UI改善（達成率バー・アイコン追加など）

### Version 0.21 — UMA図鑑コンプリート演出強化 (§72)

- **`openDexCompleteModal()` 演出強化** (§72): 本文3段構成 + 称号分岐 ✅
- **UMA博士 図鑑コンプリート＋未クリア 専用セリフ追加** (§72) ✅
- **UMA博士 クリア済み図鑑コンプリートセリフ改定** (§72) ✅
- **冒険の記録 UMA図鑑セクション メッセージ強化** (§72): コンプリート/未コンプ時テキスト ✅
- **デバッグ §72** (§72): 図鑑セクション確認ボタン追加 ✅

### Version 0.20.1 — 伝説装備コンプリート安定化・表示確認 (§71)

- **`LEGEND_EQUIPS` に `slot`/`itemId` 追加** (§71): 装備スロット情報を明示化 ✅
- **`isLegendaryEquipmentComplete()` 強化** (§71): フラグ確認 + `isEquipOwned()` 二段構成で旧セーブ対応 ✅
- **冒険の記録 伝説装備リスト `✅/・` プレフィックス** (§71): 入手済み/未入手を視覚的に区別 ✅
- **NPC K 鍛冶屋セリフ整理** (§71): コンプリート/残数ヒント/未入手Lv30+/低Lvを複数行の自然なセリフに整備 ✅
- **デバッグ §71** (§71): 伝説装備だけ未達成にする / 冒険の記録（伝説確認）の2ボタン追加 ✅

### Version 0.20 — 伝説装備コンプリート報酬 (§70)

- **`isLegendaryEquipmentComplete()`** (§70): 伝説装備7種すべての取得確認ヘルパー ✅
- **`state.legendaryRewardClaimed`** (§70): 報酬受取済みフラグ（saveGame/loadGame/初期state対応） ✅
- **`#legendary-complete-modal`** (§70): コンプリート報酬モーダル（⚔️タイトル・テキスト・ボタン）を index.html に追加 ✅
- **`openLegendaryCompleteModal()`** (§70): 報酬付与（2000G＋ラーメン×2）+ 称号アナウンス + 装備画面遷移 ✅
- **`openEquipModal()` 報酬チェック** (§70): 未受取なら先に `openLegendaryCompleteModal()` を呼ぶ ✅
- **称号「すべての伝説を集めし者」** (§70): `getPlayerTitle()` の最高位称号として追加 ✅
- **冒険の記録 `⚔️ 伝説装備` セクション** (§70): N/7進捗バー・各装備入手状況 ✅
- **冒険の記録 `✨ 伝説装備コンプリート報酬` セクション** (§70): 3状態表示 ✅
- **総合達成率スコア更新** (§70): 最大25pt → 最大32pt（+伝説装備7pt）✅
- **称号条件一覧** (§70): 「すべての伝説を集めし者」を最上位に追加 ✅
- **次の目標** (§70): 伝説未コンプ時の誘導ヒント追加 ✅
- **NPC K（鍛冶屋）伝説コンプリート反応** (§70): 全7種コンプリート後セリフ・残数ヒント ✅
- **`openHomeModal` 伝説ヒント** (§70): `postClearHints` に伝説誘導ヒント追加 ✅
- **`getProgressHint` priority=0 更新** (§70): 伝説コンプリートを最高優先に昇格 ✅
- **デバッグ §70** (§70): 全7種入手 / 未受取リセット / モーダル表示の3ボタン ✅

### Version 0.19 — NPC固有イベント深化・クリア後世界の会話強化 (§69)

- **`isUltimateGorillaCaptured()` / `isFullyCompleted()`** (§69): 完全達成判定ヘルパー追加 ✅
- **UMA博士 完全達成セリフ** (§69): `isFullyCompleted()` チェックを `if (state.gameCleared)` の最高優先に追加 ✅
- **UMA博士 横スクロール未制覇誘導** (§69): クリア後かつ `!isSideStoryCleared()` の場合に横スクロール方面へ誘導 ✅
- **UMA博士 横スクロール制覇済み・未捕獲セリフ強化** (§69): 「歌を届けるだけじゃ」セリフ追加 ✅
- **旅人 完全達成セリフ** (§69): `isFullyCompleted()` 分岐追加 ✅
- **旅人 横スクロール未制覇誘導** (§69): クリア後に横スクロール言及を追加 ✅
- **ゴリラ研究家 完全達成セリフ** (§69): `isFullyCompleted()` 分岐追加 ✅
- **ゴリラ研究家 横スクロール未制覇誘導** (§69): クリア後に横スクロール言及を追加 ✅
- **王様の使い 完全達成セリフ** (§69): `isFullyCompleted()` 分岐追加 ✅
- **王様の使い 横スクロール未制覇誘導** (§69): クリア後に横スクロール言及を追加 ✅
- **仲間 `clearLine` 更新** (§69): ジュリタニ/シュリタニ/ノリオ/ハルミ 全員のクリア後セリフを改定 ✅
- **仲間 `fullClearLine` 追加** (§69): 完全達成時専用セリフを各仲間に追加（金色斜体で表示） ✅
- **酒場表示 完全達成セリフ優先** (§69): `renderTavernRecruit` / `renderTavernViewParty` で `isFullyCompleted()` の場合に `fullClearLine` を優先表示 ✅
- **`openHomeModal` 完全達成ヒント** (§69): `isFullyCompleted()` 最高優先度で「余韻」系ヒントを追加 ✅
- **`openHomeModal` クリア+横スクロール制覇ヒント** (§69): `gameCleared && isSideStoryCleared()` 分岐を追加 ✅
- **`openHomeModal` クリア後ヒント拡充** (§69): `postClearHints` に「森の空気」ヒントを追加 ✅
- **`getProgressHint` priority=0 完全達成メッセージ** (§69): 「余韻の時間」テキストに更新 ✅
- **`getProgressHint` priority=0 横スクロール未制覇誘導** (§69): 最下位ケースを「横スクロールへ」に整理 ✅
- **デバッグ §69** (§69): NPC会話テスト3ボタン追加（完全達成/クリアのみ/横スクロール制覇のみ） ✅

### 今後の TODO

- 実績バッジ追加（初回捕獲・初ステージクリアなど）
- 図鑑未捕獲UMAヒント強化（どこで出るか案内）
- NPCイベントの小イベント化（会話回数カウントなど）

### Version 0.18.1 — 冒険の記録UI改善・達成率プログレスバー追加 (§68)

- **総合達成率バー** (§68): 最大25pt換算の総合スコアと CSS プログレスバーを記録モーダル上部に追加 ✅
- **カテゴリ別プログレスバー** (§68): 本編/横スクロール/UMA図鑑 セクションに個別バー追加 ✅
- **`.record-progress` / `.record-progress-fill`** (§68): プログレスバー用CSS追加 ✅
- **`.record-section-goal`** (§68): 「次の目標」セクション強調CSS追加 ✅
- **カードスタイル改善** (§68): `.record-section` を半透明背景・rgba ボーダーに更新 ✅

### Version 0.18 — 冒険の記録・達成状況パネル (§67)

- **`getPlayerTitle()`** (§67): 6段階称号判定の共通関数 ✅
- **「📜記録」ボタン追加** (§67): 上部メニューに `btn-record` ✅
- **`#record-modal` 冒険の記録モーダル** (§67): 達成状況の一覧表示 ✅
- **`renderRecordBody()`** (§67): 称号/クリア状態/横スクロール/図鑑/報酬/次の目標/称号条件表示 ✅
- **デバッグ §67** (§67): 記録モーダル確認ボタン ✅

### 今後の TODO

- 冒険の記録UI改善（達成率バー・アイコン強化など）
- 実績バッジ追加（初回捕獲・初ステージクリアなど）
- 図鑑未捕獲UMAヒント強化（どこで出るか案内）

### Version 0.17.1 — 図鑑コンプリート報酬・仲間別クリア後セリフ (§66)

- **`isUmaDexComplete()`** (§66): UMA全種捕獲判定ヘルパー ✅
- **`state.dexCompleteRewardClaimed`** (§66): 報酬受取フラグ（save/load/初期値） ✅
- **`#dex-complete-modal`** (§66): 図鑑コンプリート報酬モーダル（index.html） ✅
- **`openDexCompleteModal()`** (§66): 3000G＋ラーメン×3 付与 ✅
- **仲間クリア後セリフ** (§66): COMPANION_DATA に `clearLine` 追加、酒場で表示 ✅
- **称号優先順位6段階** (§66): 完全制覇>図鑑完全>横+クリア>クリア>Lv99>デフォルト ✅
- **UMA博士 図鑑コンプリート反応** (§66): クリア後+図鑑完全の分岐セリフ ✅
- **攻略ペーパー・実家ヒント 完全制覇対応** (§66) ✅
- **デバッグ §66** (§66): 5ボタン追加 ✅

### 今後の TODO

- （未定）

### Version 0.17 — 究極ゴリラ捕獲クライマックス演出・クリア後リアクション強化 (§65)

- **`doSingUltimateGorilla()` 演出強化** (§65): 捕獲成功ログを5行のクライマックス演出に刷新 ✅
- **`#capture-modal` 追加** (§65): 捕獲成功直後の専用モーダル（「歌が届いた」）→「王様へ報告する」でエンディングへ ✅
- **総合称号「究極を歌い、聖域を越えし者」** (§65): クリア済み＋横スクロール制覇済み時にステータス・エンディング最終ページで表示 ✅
- **NPC クリア後反応** (§65): UMA博士・旅人・ゴリラ研究家・王様の使い 全員にクリア後専用セリフを追加 ✅
- **実家クリア後ヒント** (§65): `openHomeModal()` でクリア後は専用ランダムヒントを表示 ✅
- **攻略ペーパークリア後メッセージ** (§65): priority=0 に専用ブランチ追加（横スクロール制覇の有無で分岐） ✅
- **ヘルプ「クリア後の遊び方」** (§65): index.html ヘルプに新セクション追加 ✅
- **デバッグ §65** (§65): 3ボタン追加（捕獲モーダル表示・クリア後Full・クリア後Only） ✅

### 今後の TODO

- クリア後イベント追加（実家アンドロメダ等以外）
- 図鑑コンプリート報酬
- 仲間別クリア後セリフ

### Version 0.16.1 — 究極ゴリラ捕獲チャンス演出・ガマン状態表示 (§64)

- **`#battle-gaman-status`** (§64): 戦闘画面にガマン中インジケーター追加（index.html + updateBattlePlayerStatus） ✅
- **`.btn-chance`** (§64): うたうボタン用の金色点滅アニメーション CSS 追加 ✅
- **`updateSingButtonChance(active)`** (§64): うたうボタンのチャンス演出を切替える新関数 ✅
- **`checkUltimateGorillaHpHint()` 4分岐** (§64): Lv99+ウクレレ / Lv不足 / ウクレレなし / 両方なし の条件別メッセージ + チャンス時うたうボタン強調 ✅
- **`useWaza()` ガマン分岐** (§64): `updateBattlePlayerStatus()` 即時呼び出し追加 ✅
- **`actuallyStartBattle()`** (§64): `updateSingButtonChance(false)` リセット追加 ✅
- **`finishBattle()`** (§64): `updateSingButtonChance(false)` リセット追加 ✅
- **デバッグ §64** (§64): 条件別テスト3ボタン追加（チャンス表示 / Lv不足 / ウクレレなし） ✅

### Version 0.16 — 捕獲支援技「ここはひとつガマン」 (§63)

- **WAZA_DATA「gaman」** (§63): type:"weakenAttack" の新技エントリ追加 ✅
- **state.gamanActive** (§63): 初期値 false でフラグ追加 ✅
- **useWaza() ガマン分岐** (§63): type===weakenAttack で gamanActive 操作・再使用メッセージ ✅
- **doFight() ガマン補正** (§63): 会心後 1/4 (最低1)・ログ分岐 ✅
- **finishBattle() ガマン解除** (§63): state.gamanActive = false 追加 ✅
- **openWazaMenu() 更新** (§63): 説明文更新・ガマン状態表示・type分岐レンダリング ✅
- **UMA博士 NPC** (§63): ガマン言及を追加 ✅
- **getProgressHint priority17 tier3** (§63): 「ここはひとつガマン」追記 ✅
- **index.html ヘルプ** (§63): 補助技セクション追加（ガマン説明） ✅
- **デバッグ §63** (§63): ガマン状態戦闘2本 + 解除ボタン追加 ✅

### 今後の TODO

- わざの「戦闘コマンドの順番・配置」見直し（ユーザーフィードバック次第）

### Version 0.15.1 — わざコマンド安定化・表示整理・究極ゴリラ捕獲テスト強化 (§62)

- **WAZA_DATA** (§62): `hazukashigatame` 表示名を「はずかし固め・小」に変更（まほうとの区別。ID変更なし） ✅
- **actuallyStartBattle()** (§62): 戦闘開始時に `#waza-menu` も hidden に追加（バグ修正） ✅
- **openWazaMenu()** (§62): メニュー先頭に説明テキスト追加 ✅
- **checkUltimateGorillaHpHint(e)** (§62): 究極ゴリラHP1〜10時に「うたう」チャンスを表示するヘルパー追加 ✅
- **useWaza()** (§62): 残りHP表示ログ追加 + `checkUltimateGorillaHpHint()` 追加 ✅
- **doFight()** (§62): `checkUltimateGorillaHpHint()` 追加 ✅
- **デバッグ §62** (§62): 究極ゴリラ HP12/10/1 戦闘開始ボタン3本追加 ✅
- **getProgressHint priority17 tier3** (§62): 「はずかし固め・小」の名前を明記 ✅
- **index.html ヘルプ** (§62): わざ技名を「はずかし固め・小」に更新、まほうとの違い注記 ✅

### Version 0.15 — わざシステム（捕獲支援・低固定ダメージ技）(§61)

- **WAZA_DATA** (§61): 配列新設（はずかし固め/キドクラッチ/カリツォー/グーパンチ。固定1〜4ダメージ） ✅
- **openWazaMenu()** (§61): わざサブメニュー表示関数追加 ✅
- **useWaza(id)** (§61): 固定ダメージ付与・renderEnemy・敵ターン移行 ✅
- **#btn-waza** (§61): `#battle-menu` 最後に追加（grid-column:span 2、緑背景） ✅
- **#waza-menu** (§61): `#item-menu` の後に追加（class="hidden submenu"） ✅
- **init()** (§61): `btn-waza` → `openWazaMenu` リスナー追加 ✅
- **NPC_DATA UMA博士** (§61): 捕獲数<4 時にわざヒント追加、Lv50+でHP調整ヒント追加 ✅
- **HOME_HINTS** (§61): わざコマンドヒント2件追加 ✅
- **getProgressHint priority 17 tier3** (§61): わざ言及を追加 ✅
- **index.html ヘルプ** (§61): 「🥊 わざコマンドについて」セクション追加 ✅

### 今後の TODO

- ここはひとつガマン（自分の攻撃力を大幅に下げる） → 状態バフ/デバフ系技として将来実装候補
- わざの「戦闘コマンドの順番・配置」見直し（ユーザーフィードバック次第）
- 究極ゴリラ捕獲直前の演出強化（HP警告・捕獲チャンス告知など）

### Version 0.14.1 — 横スクロール編クリア後導線・究極ゴリラ捕獲誘導 (§60)

- **isSideStoryCleared()** (§60): 横スクロール編制覇判定ヘルパー関数追加 ✅
- **getHintPriority** (§60): priority17追加(isSideStoryCleared + !gameCleared → 究極ゴリラ誘導)、priority9を「チンパンジー未撃退」限定に ✅
- **getProgressHint** (§60): priority17追加(3段階で究極ゴリラ捕獲条件を誘導) ✅
- **NPC_DATA UMA博士** (§60): isSideStoryCleared時のセリフ追加 ✅
- **NPC_DATA ゴリラ研究家** (§60): isSideStoryCleared時のセリフ追加（究極ゴリラとチンパンジーの違い） ✅
- **NPC_DATA 王様の使い** (§60): isSideStoryCleared時のセリフ追加 ✅
- **NPC_DATA 旅人** (§60): isSideStoryCleared時のセリフ追加 ✅
- **HOME_HINTS** (§60): 横スクロール編制覇後ヒント2件追加 ✅
- **openHomeModal** (§60): isSideStoryCleared + !gameCleared 時の固定ヒント追加 ✅
- **renderStatusBody** (§60): 称号「チンパンジーの聖域の覇者」→「ゴリラの世界の外側を見た者」に変更 + 横スクロール編総合行追加 ✅
- **openStage6GoalModal** (§60): 全取得完了ルートに究極ゴリラへの導線テキスト追加 ✅
- **debug=1 HTMLボタン** (§60): 横スクロール編制覇/究極ゴリラ準備ボタン追加 ✅
- **debug=1 ハンドラ** (§60): 上記ボタンのハンドラ追加 ✅
- **index.html ヘルプ** (§60): 「横スクロール編と本編目的」セクション追加 ✅

### 今後の TODO

- UMA捕獲支援用の低固定ダメージ技（横スクロール編クリア後イベントなど）
- 横スクロール編クリア後イベント深化（特別なNPC出現など）
- 究極ゴリラ捕獲直前の演出強化（HP警告・捕獲チャンス告知など）

### Version 0.14 — 横スクロールステージ6「チンパンジーの聖域」(§59)

- **ultimate_chimpanzee** (§59): NON_UMA_DATAに究極チンパンジー追加 (HP1500/ATK72/DEF32/EXP3000/canCapture:false) ✅
- **SIDE_STAGE_DATA[6]** (§59): 40×5マップ追加 (チンパンジーの聖域) ✅
- **SIDE_FIXED_ENCOUNTERS stage6** (§59): 異邦人(6:13,2)/さまようおやじ(6:27,1)/デスマッチ(6:23,3) 追加 ✅
- **stage6RewardLevel** (§59): 状態・saveGame・loadGame に追加 ✅
- **moveSidePlayer 'b' tile** (§59): ステージ6 → ultimate_chimpanzee 分岐追加 ✅
- **openSideGoalModal** (§59): ステージ6ルーティング追加 ✅
- **openSideNpcModal** (§59): ステージ6ルーティング追加 ✅
- **openStage5GoalModal** (§59): 「🌿 チンパンジーの聖域へ進む」ボタン追加、予告テキスト削除 ✅
- **openStage6GoalModal** (§59): ステージ6ゴール演出関数追加（JS生成ボタン方式）✅
- **openStage6NpcModal** (§59): ステージ6NPC会話関数追加（聖域の守護者/迷い込んだ修行者）✅
- **openSideChest** (§59): ステージ6高報酬テーブル追加（80〜180G/ラーメン/お弁当/デオドラント）✅
- **renderStatusBody** (§59): チンパンジーの聖域・究極チンパンジー進捗行追加 + 称号追加 ✅
- **getHintPriority** (§59): s6Cleared→9(全6ステージ)、s5Cleared→16(ステージ6ガイド)に更新 ✅
- **getProgressHint** (§59): priority=16追加、priority=9を6ステージ版に更新 ✅
- **openSideGateModal** (§59): 説明文を「6ステージ」に更新 ✅
- **debug=1 HTMLボタン** (§59): ステージ6デバッグボタン追加 ✅
- **debug=1 ハンドラ** (§59): ステージ6デバッグハンドラ追加 ✅
- **index.html ヘルプ** (§59): ステージ6セクション追加 ✅

### Version 0.13.1 — ゴール側G/H配置変更「ボス→G→H」(§58)

- **SIDE_STAGE_DATA[1] row1** (§58): x=37→G, x=38→H (HG→GH入れ替え) ✅
- **SIDE_STAGE_DATA[2] row1** (§58): x=37→G, x=38→H ✅
- **SIDE_STAGE_DATA[3] row2** (§58): x=37→G, x=38→H ✅
- **SIDE_STAGE_DATA[4] row2** (§58): x=37→G, x=38→H ✅
- **SIDE_STAGE_DATA[5] row2** (§58): x=37→G, x=38→H ✅
- **debug=1 ゴール側ボタン** (§58): toastメッセージをG@37/H@38に更新 ✅
- **index.html ヘルプ** (§58): 帰還ゲート位置説明を更新 ✅

### Version 0.13 — 横スクロールステージ5「黒い城」(§57)

- **lastboss_gorilla** (§57): NON_UMA_DATAにラスボス級ゴリラ追加 (HP1000/ATK58/DEF22/EXP1400/canCapture:false) ✅
- **SIDE_STAGE_DATA[5]** (§57): 40×5マップ追加 (黒い城) ✅
- **SIDE_FIXED_ENCOUNTERS stage5** (§57): 宇宙人(5:14,2)/来訪者(5:27,1)/異邦人(5:23,3)追加 ✅
- **stage5RewardLevel** (§57): 状態・セーブ・ロードに追加 ✅
- **moveSidePlayer 'b' tile** (§57): ステージ5→lastboss_gorilla 分岐追加 ✅
- **openSideGoalModal** (§57): ステージ5ルーティング追加 ✅
- **openSideNpcModal** (§57): ステージ5ルーティング追加 ✅
- **openStage4GoalModal** (§57): 「🏰 黒い城へ進む」ボタン追加 ✅
- **openStage5GoalModal** (§57): ステージ5ゴール演出関数追加 ✅
- **openStage5NpcModal** (§57): ステージ5NPC会話関数追加 ✅
- **openSideChest** (§57): ステージ5高報酬テーブル追加 ✅
- **renderStatusBody** (§57): ステージ5進捗行+称号追加 ✅
- **getHintPriority** (§57): s5Cleared(9)、s4Cleared(15)に更新 ✅
- **getProgressHint** (§57): priority=15(ステージ5ガイド)追加、priority=9更新 ✅
- **openSideGateModal** (§57): 説明文を「5ステージ」に更新 ✅
- **debug=1 HTMLボタン** (§57): ステージ5デバッグボタン追加 ✅
- **debug=1 ハンドラ** (§57): ステージ5デバッグハンドラ追加 ✅
- **index.html ヘルプ** (§57): ステージ5セクション追加 ✅

### Version 0.12.1 — ゴール側帰還ゲート追加 (§56)

- **SIDE_STAGE_DATA[1] row1 x=37** (§56): 'g' → 'H' (ゴール側帰還ゲート) ✅
- **SIDE_STAGE_DATA[2] row1 x=37** (§56): 'g' → 'H' ✅
- **SIDE_STAGE_DATA[3] row2 x=37** (§56): 'g' → 'H' ✅
- **SIDE_STAGE_DATA[4] row2 x=37** (§56): 'g' → 'H' ✅
- **デバッグボタン追加** (§56): 全4ステージにゴール側Hゲート移動ボタン追加 ✅
- **index.html ヘルプ更新** (§56): スタート側+ゴール側の両Hゲートを説明 ✅

### Version 0.12 — 横スクロールステージ4「ゴリラ山道」(§55)

- **SIDE_STAGE_DATA[4]** (§55): 40×5マップ追加 (ゴリラ山道) ✅
- **daimaou_gorilla** (§55): NON_UMA_DATAに大魔王ゴリラ追加 (HP700/ATK46/DEF16/EXP850/canCapture:false) ✅
- **SIDE_FIXED_ENCOUNTERS stage4** (§55): 空手姉妹(4:15,2)/校長(4:31,1)/デスマッチレスラー(4:25,3)追加 ✅
- **state.sideMap.stage4RewardLevel** (§55): 初期値0追加 ✅
- **moveSidePlayer() 'b'タイル** (§55): stage4→大魔王ゴリラ分岐追加 ✅
- **openSideChest() stage4報酬** (§55): 高報酬テーブル追加 ✅
- **openSideNpcModal() stage4ルーティング** (§55): stage=4→openStage4NpcModal ✅
- **openStage4NpcModal()** (§55): 老人/旅人分岐NPC会話追加 ✅
- **openStage4GoalModal()** (§55): ゴール演出・報酬分岐・JSボタン生成追加 ✅
- **openStage3GoalModal()** (§55): 「⛰️ ゴリラ山道へ進む」ボタン追加 ✅
- **openSideGoalModal() stage4ルーティング** (§55): stage=4→openStage4GoalModal ✅
- **renderStatusBody() stage4進捗** (§55): ゴリラ山道クリア/大魔王ゴリラ撃退/称号追加 ✅
- **getHintPriority() / getProgressHint()** (§55): s4Cleared対応・priority14新設 ✅
- **saveGame() / loadGame()** (§55): sideMapStage4Reward追加 ✅
- **デバッグ機能** (§55): stage4移動/ゴール直前/フラグリセット/モーダル表示ボタン追加 ✅
- **index.html ヘルプ** (§55): ステージ4説明セクション追加 ✅

### Version 0.11.3.2 — ゴールモーダルJS生成ボタン方式 + 帰還ゲート位置修正 (§54)

- **`returnToNormalMapFromSide()`** (§54): 両モーダルを閉じてから `switchToNormalMap()` を呼ぶ共通関数 ✅
- **ゴールモーダルJS生成方式** (§54): 静的HTMLボタン廃止 → 各ゴール関数内で `createElement` で生成 ✅
- **帰還ゲート位置修正** (§54): H タイルを x=0 → x=2 に移動（ステージ1/2/3すべて） ✅
- **DEBUG console.log** (§54): moveSidePlayer() の G/H タイル検知時にログ出力 ✅
- **デバッグボタン更新** (§54): 帰還ゲート移動ボタンを x=2 に更新 + モーダル直接表示ボタン追加 ✅
- **modal-side-goal の静的ボタン削除** (index.html §54): btn-side-goal-* の静的ボタン4つを除去 ✅

### Version 0.11.3 — 横スクロール帰還導線修正 (§53)

- **`switchToNormalMap()` 戻り位置修正** (§53): 通常マップ(2,4)へ戻すよう変更（ゲート再接触ループ防止） ✅
- **帰還ゲートタイル 'H'** (§53): 各ステージスタート付近(x=0)に配置 → SIDE_TILE_EMOJI/SIDE_NO_ENCOUNTER更新 ✅
- **`openSideReturnGateModal()`** (§53): 帰還ゲート踏んだ時の確認モーダル関数追加 ✅
- **ゴールモーダルのボタン整理** (§53): 各ステージの「滞在」ボタンラベルを変更、通常マップ戻るボタンを明示的に表示 ✅
- **modal-side-return-gate** (index.html): 帰還ゲートモーダルHTML追加 ✅
- **ヘルプ更新** (index.html): 帰還方法のセクションを追加 ✅
- **NPC/ヒント屋更新** (§53): 帰還ゲートの存在を案内 ✅
- **デバッグボタン** (§53): ステージ1/2/3帰還ゲート付近へ移動 / 通常マップへ強制帰還 ✅
- **DEV_LOG.md** 新規作成 ✅



### Version 0.11.2 — 横スクロールマップ入口ゲート・道案内改善 (§52)

- **🌀ゲートタイル追加** (§52): 通常マップ(2,3)に`'V'`タイル配置 → TERRAIN_EMOJI/SAFE_TILE更新 ✅
- **ゲートモーダル** (§52): 初回は詳細説明、2回目以降は短い確認 (`gateExplained` フラグ) ✅
- **gateExplained フラグ** (§52): `state.sideMap.gateExplained` + saveGame/loadGame対応 ✅
- **NPC台詞更新** (§52): UMA博士(D)/旅人(R)/王様の使い(S) にゲート場所ヒント追加 ✅
- **UMA捕獲ヒント** (§52): UMA博士の台詞に「HPが0になると逃げる」旨を追加 ✅
- **ヒント屋 priority 13** (§52): 横スクロール未訪問+Lv40未満 → ゲート案内ヒント ✅
- **ヘルプ更新** (index.html): 「🌀 横スクロールマップへの行き方」セクション追加 ✅
- **modal-side-gate** (index.html): ゲートモーダルHTML追加 ✅
- **デバッグボタン** (§52): ゲート移動 / 説明フラグリセット ✅
- **将来の捕獲補助技デザインメモ** (§52): GAME_DESIGN.md §52 に記録済み（実装なし） ✅

### Version 0.11.1 — ステージ3安定化・デバッグ補強・ステージ4予告

- **固定敵IDの実在確認** (§51): `powerharassmentsenpai` / `wanderingman` / `deathmatch` すべて NON_UMA_DATA に実在 ✅
- **triggerFixedEncounter 安全化** (§51): 未定義IDに `console.warn` + `triggerEncounter()` フォールバックを追加
- **validateSideFixedEncounters()** (§51): SIDE_FIXED_ENCOUNTERS のID整合性チェック関数を追加 (debug=1専用)
- **デバッグボタン追加** (§51):
  - `🏚️ ステージ3宝箱・固定敵リセット`: stage3キーの openedChests / defeatedEnemies を削除
  - `🧪 固定敵IDチェック`: validateSideFixedEncounters() を実行
- **ステージ4「ゴリラ山道」予告テキスト** (§51):
  - openStage3GoalModal: 全報酬受取時に大魔王ゴリラ予告を追加
  - getProgressHint priority 9: ステージ4・大魔王ゴリラへの言及を強化
- **CSS確認**: aspect-ratio: 9/5 が5行ステージで正しく機能することを確認（変更不要）
- **GAME_DESIGN.md §51**: ステージ4構想・安定化項目を追加

### Version 0.11 — 横スクロールステージ3「古びた町はずれ」実装

- **SIDE_STAGE_DATA[3]** (§50): 40×5マップ「古びた町はずれ」追加
  - row0(高路)/row1(上中路)/row2(中央路)/row3(下中路)/row4(下路) の5ルート
  - 商人(x=3,y=2), NPC-老人(x=5,y=2), NPC-怪しい旅人(x=10,y=1), 宝箱4個
  - 固定敵3体(パワハラ先輩/さまようおやじ/デスマッチレスラー)
  - 魔王ゴリラ(b, x=31,y=2), ゴール(G, x=38,y=2)
- **魔王ゴリラ** (§50): HP400/ATK34/DEF11/EXP500, canCapture:false
  - 専用出現メッセージ・撃退メッセージ付き
- **SIDE_FIXED_ENCOUNTERS** 追加: stage3固定敵3体
- **openStage3GoalModal()**: 魔王ゴリラ撃退分岐 + 報酬二重取り防止 (stage3RewardLevel 0/1/2)
  - 撃退済み初回ゴール: 220G + ラーメン×1
  - 未撃退初回ゴール: 80G
  - 差分報酬: 140G + ラーメン×1
- **openStage3NpcModal()**: 老人/怪しい旅人 × 魔王ゴリラ撃退済みでセリフ分岐
- **ステージ2ゴールモーダル**: 「🏚️ 古びた町はずれへ進む」ボタン追加 (s2クリア後)
- **動的マップサイズ**: renderSideField/moveSidePlayer が rows.length/rows[0].length を使用
- **renderField**: --rows CSS変数を stage に応じて動的設定
- **ステータス画面**: ステージ3進捗・称号「町はずれの覇者」追加
- **攻略ペーパービュー屋**: priority12 (s2クリア・s3未クリア) ヒント追加, priority9 更新
- **ヘルプ**: 「🏚️ ステージ3「古びた町はずれ」」セクション追加
- **セーブキー追加**: `sideMapStage3Reward`
- **デバッグ (debug=1)**: ステージ3関連ボタン5個追加

### Version 0.10.1 — 攻略ペーパービュー屋ヒント拡張・ステージ別固定敵改善

- **攻略ペーパービュー屋ヒント拡張** (§49): 横スクロールステージ1/2進行状況に応じたヒントを追加
  - 優先度11: ステージ1ガイド（中ボス撃退済みで分岐）
  - 優先度10: ステージ2ガイド（ボス撃退済みで分岐）
  - 優先度9: 両ステージクリア済み → 次の予告
- **ヒント表示改善**: 「📄 ぼんやりヒントを購入した！」形式に変更、本文から「」括弧を除去
- **SIDE_FIXED_ENCOUNTERS** (§49): ステージ別固定敵マップ追加
  - stage1 x=31,y=1: のらいぬ / stage1 x=14,y=2: ぶつかりおじさん
  - stage2 x=14,y=1: 忍者かぶれ / stage2 x=12,y=2: 山賊 / stage2 x=32,y=2: 鬼
- **固定敵エンカウント改善**: `moveSidePlayer()` の 'e' タイル処理で固定敵マップを参照
- **ヘルプ追記**: 攻略ペーパービュー屋の説明・横スクロール固定敵説明更新
- **デバッグ追加 (debug=1)**: 「📰 ヒントショップを開く」ボタン追加

### Version 0.10 — 横スクロールステージ2「あやしい森」実装

- **ボスゴリラ追加** (§48): HP250/ATK26/DEF8/EXP290、canCapture:false、通常エンカウントには出ない
- **ステージ2マップ「あやしい森」** (§48): 40×3、上路/中路/下路の3ルート、宝箱3個、固定敵3体、NPC2人
- **ステージ切り替え**: ステージ1ゴールモーダルに「🌲 あやしい森へ進む」ボタン追加
- **getSideKey()ヘルパー**: ステージ別イベントキー生成（ステージ間の openedChests/defeatedEnemies 衝突防止）
- **ステージ2ゴール演出**: ボス撃退分岐（撃退済み→150G+お弁当 / 未撃退→50G / 差分→100G+お弁当）、報酬二重防止
- **ステージ2 NPC2人**: ボスゴリラ撃退前後でセリフ分岐 (openStage2NpcModal)
- **ステータス画面強化**: ステージ2クリア状況・ボスゴリラ撃退・称号「森の制覇者」追加
- **セーブ追加**: `sideMapStage2Reward`、v0.9.1互換補正（クリア済みなのにstage1RewardLevel=0の古いセーブを補正）
- **ヘルプ追記**: 「🌲 ステージ2「あやしい森」」セクション追加
- **デバッグ追加 (debug=1)**: あやしい森へ移動 / 森ゴール直前 / ステージ2フラグリセット / ボスゴリラ撃退済み / ボスゴリラ強制ENC

### Version 0.9.3 — 横スクロールステージ1クリア体験強化

- **ゴール演出強化** (§47): 中ボス撃退有無で2パターンのゴールモーダルを表示
- **報酬分岐**: 中ボス撃退済みで初回ゴール→100G+パン、未撃退→30G、差分報酬→70G+パン
- **報酬二重受け取り防止**: `stage1RewardLevel` (0/1/2) で管理
- **ステータス画面進捗表示**: 「横スクロール進捗」セクション追加（クリア済み/撃退済み/称号）
- **横スクロールNPCセリフ4パターン分岐**: stage1Cleared × midbossDefeated の組み合わせで分岐
- **通常マップ旅人(R) セリフ追加**: ステージ1クリア後に「あやしい森」予告セリフを追加
- **ステージ2予告**: 全報酬受取後のゴールモーダルに「あやしい森・ボスゴリラ」の予告を表示
- **ヘルプ追記**: 「🏁 横スクロールマップのゴールとクリア」セクション追加
- **デバッグ追加**: ステージ1クリアフラグON / 中ボス撃退済みにする
- **セーブ追加**: `sideMapStage1Reward` (古いセーブは0で補完)

### Version 0.9.2.1 — 中ボスゴリラ捕獲不可・実機確認補強

- **捕獲不可フラグ実装**: `canCapture: false` を中ボスゴリラに追加。`actuallyStartBattle()` でコピー。`attemptCapture()` 冒頭でブロック。
- **捕獲不可メッセージ**: 専用の2行メッセージを表示（敵ターンへ移行）
- **clamp問題解消**: `captureRate:0` でも5%捕獲チャンスが残るバグを仕様レベルで封じた
- **gainExp() ログ改善**: ノリオ効果時に元EXP・倍率・最終EXPが分かるメッセージに変更
- **中ボス撃退後NPCセリフ変化**: 横スクロール案内人・旅人NPCが `defeatedEnemies["36,1"]` で分岐
- **ゴリラ研究家に中ボスヒント追加**: 撃退前後でセリフ変化
- **ヘルプ追記**: 「ボス系モンスター」セクション追加、ノリオ説明を「経験値2倍」に更新
- **デバッグ追加**: EXPを0にする (`btn-debug-reset-exp`)

### Version 0.9.2 — のりお指令②: 中ボスゴリラ・敵再調整・のりお効果変更

- **HP0→逃走表現の統一確認**: winBattle() バリエーション、中ボスゴリラ専用メッセージ
- **のりお能力変更**: 逃走成功率+0.15 → 獲得経験値×2 (expMod:2)、絵文字・説明文も更新
- **gainExp() 追加**: EXP取得ヘルパー。のりお同行時は2倍ログ付きで処理
- **敵HP/EXP全体底上げ**: 序盤×1.5〜1.6、中盤×1.7、後半×2.0〜2.1、UMA×1.2、メタル不変
- **中ボスゴリラ追加**: 横スクロールステージ1 x=36 に 'b' タイル配置 (HP150, ATK20, DEF5, EXP160)
- **SIDE_TILE_EMOJI 'b' 追加**: 💢、SIDE_NO_ENCOUNTER に登録
- **将来5〜6面計画**: GAME_DESIGN.md §45 にステージ構成を記述
- **NPC会話更新**: UMA博士・旅人・ゴリラ研究家・openSideNpcModal に中ボス/経験値ヒント追加
- **デバッグ追加**: 中ボスゴリラ強制エンカウント・ノリオ仲間化・中ボス撃退フラグリセット

### Version 0.9.1 — 横スクロールマップ探索性アップデート

- **縦移動の有効化**: y=0〜2 を自由に移動可能(迂回路 A・B)
- **マップ再設計**: 40×3、高路/メイン/低路の3ルート、木ブロックで迂回誘導
- **新タイル追加**: G(ゴール🏁)、p(旅人NPC🧑)
- **固定敵撃破追跡**: `defeatedEnemies`、`finishBattle()` フックで確定
- **ステージクリアモーダル**: 50G報酬・`stageCleared` フラグ・「通常マップへ戻る」
- **NPC2追加**: 旅人NPCで高路/低路の示唆
- **宝箱バリエーション**: 金・コーヒー・パン・ポーション
- **進捗表示更新**: "あとN" 形式 + クリア済み表示
- **デバッグ追加**: スタート地点・ゴール直前・クリアフラグリセット
- **ヘルプ更新**: 横スクロールマップの説明を追加
- **セーブ追加**: `sideMapDefeated`, `sideMapCleared`

### Version 0.9 — 横スクロールマップ試作

- **横スクロールマップモード追加** (§43):
  - `state.mapMode: "normal"|"side"` + `state.sideMap {x,y,stage,openedChests}` 追加
  - `SIDE_STAGE_DATA` ステージ1「はじまりの草原」(40×3 タイルマップ)追加
  - `renderField()` をスマートディスパッチ化 — side モード時に `renderSideField()` へルーティング
  - `renderSideField()` 追加: 横スクロールカメラ・タイル描画・プレイヤー(🦍)表示
  - `moveSidePlayer(dx, dy)` 追加: 衝突判定・タイルイベント(宝箱/NPC/商人/固定戦闘/ランダム戦闘)
  - `openSideChest(x, y)` 追加: 開封済み管理・ゴールド報酬
  - `openSideNpcModal()` 追加: 旅の案内人NPC — 既存 npc-modal を流用
  - `switchToSideMap()` / `switchToNormalMap()` 追加
  - `startWalking()` / キーボード / スワイプ: mapMode に応じて分岐
  - デバッグボタン「⬇️ 横スクロールマップへ移動」「⬆️ 通常マップへ戻る」追加
  - `saveGame()` / `loadGame()`: `mapMode`・`sideMapX/Y/Stage/Chests` を追加(後方互換あり)
  - `#field-viewport` の `--cols`/`--rows` を切り替え時に自動更新
  - `#side-map-info` 情報バー: ステージ名と進捗表示

### Version 0.8.8.1 — 緊急バグ修正: ステータスメニュー復旧・攻略ペーパービュー屋修正

- **ステータスメニュー非表示の修正** (§42): iOS セーフエリア対応
  - `#game` に `padding-top: env(safe-area-inset-top, 0px)` 追加
  - `#dpad` に `padding-bottom: env(safe-area-inset-bottom, 0px)` 追加
- **攻略ペーパービュー屋 undefinedG 修正** (§42): `p.money` → `p.gold` に修正 (3箇所)
- **攻略ペーパービュー屋の購入不可修正** (§42): 同上
- **攻略ペーパービュー屋のラベル縦崩れ修正** (§42): `.shop-row .shop-menu-btn { width: auto }` 追加

### Version 0.8.8 — NPCセリフ拡充・攻略ヒント強化

- **NPC_DATA 全5NPC のセリフ拡充** (§41):
  - D(UMA博士): UMA vs 通常モンスター説明、メタルゴリラヒント、レベル段階別セリフ追加
  - R(旅人): lv≥15 段階追加、逃げ作戦・装備重要性を強化
  - K(鍛冶屋): lv<10 向け装備アドバイス・のらいぬ対策、lv<30 伝説テーザー追加
  - E(ゴリラ研究家): lv<10 向けゴリラ種類説明、lv10-49 メタルゴリラヒント追加
  - S(王様の使い): クリア前をlv≥50/else 2段階化、具体的目標テキスト追加
- **HOME_HINTS 6件追加** (§41): のらいぬ逃げ推奨・レベルアップ効果・装備重要性・メタルゴリラ・経験値・宝箱
- **ヘルプ画面2セクション追加** (§41): 💡 戦闘のコツ・👾 モンスターの種類
- **デバッグボタン追加** (§41): Lv.1/Lv.5/Lv.10 設定ボタン

### Version 0.8.7 — のりお指令: モンスター追加・のらいぬ調整・戦闘メッセージ改善

- **HP0時の戦闘終了メッセージ変更** (§40):
  - 「○○に逃げられた！」→「○○は逃げていった！！」にランダムバリエーション4種で変更
  - バリエーション: 逃げていった / あわてて逃げていった / フラフラしながら逃げていった / 戦意を失って逃げていった
- **のらいぬを序盤の強敵に調整** (§40):
  - HP 13→18, 攻撃 5→8, 防御 1→2, EXP 7→12, 出現重み 8→5
  - `startMsg` フィールドで専用出現メッセージを追加
  - `actuallyStartBattle()` に `startMsg` 表示サポートを追加
- **通常モンスター追加** (§40): 26体追加(序盤4体・中盤8体・後半14体)
  - 序盤(minLevel 1): キャンプ女子・小籠包・弾き語り女子・失礼な人
  - 中盤(minLevel 3-4): 忍者かぶれ・強肩キャッチャー・半グレ・バンギャ・古着屋兄さん・先生・グルメ気取り・痴漢
  - 後半(minLevel 8-12): アンドレ・デスマッチレスラー・三鷹のよっぱらい・教頭・校長・いんちき放送作家・エセ脚本家・インプラント歯医者・霊界探偵・空手姉妹・グラビアアイドル・宇宙人・異邦人・来訪者
- **NPC旅人ヒント追加**: Lv10未満のプレイヤーに「のらいぬは序盤では強い。逃げるのも立派な判断」を表示
- **デバッグボタン追加** (§40): のらいぬ強制エンカウント / ランダム通常モンスター強制エンカウント
- GAME_DESIGN.md §6.1テーブル更新・§13メッセージ表記更新・§40追記
- README.md 更新

### Version 0.8.6.3 — BGMノード完全停止・予約音キャンセル修正

- **`stopBGMHard()` 新設** (§39):
  - `bgmSessionId++` / `bgmGeneration++` でセッション世代を更新し古いコールバックをスキップ
  - `activeBgmTimers` の全 `setTimeout` を `clearTimeout()` でキャンセル
  - `activeBgmNodes` の各 `{osc, gain}` に対して `gain.gain=0` + `gain.disconnect()` で消音
  - `bgmMasterGain` も `gain=0` + `disconnect()` + null化
- **`stopBGM()` を `stopBGMHard()` のエイリアスに変更**（後方互換）
- **`startBGM(type)`**: `stopBGMHard()` 後に `session = bgmSessionId` をキャプチャして渡す
- **`_scheduleBGMLoop()` を `session` パラメータ対応に変更**:
  - `{osc, gain}` ペアで `activeBgmNodes` に追跡
  - タイマーIDを `activeBgmTimers` に push/splice で管理
  - タイマーコールバックで `capturedSession !== bgmSessionId` チェック
- デバッグボタン `btn-debug-bgm-hard-stop` 追加
- GAME_DESIGN.md §38更新 + §39追記
- 根本原因: `activeBgmNodes` に `osc` 単体のみ追跡 → `gain` のスケジュール済み音量変化をキャンセルできず。`activeBgmTimers` 未実装 → 旧セッションのループタイマーが発火して新BGMに二重ループ発生

### Version 0.8.6.2 — BGM即時切り替え修正

- **BGM即時切り替え修正** (§38):
  - `bgmMasterGain` 変数を追加（全BGMノードの共通出力先GainNode）
  - `getOrCreateBgmMasterGain()` ヘルパー関数を追加
  - `stopBGM()`: `bgmMasterGain.disconnect()` で即消音 → null化。個別ノード停止は補助的に試行
  - `_scheduleBGMLoop()`: `gain.connect(audioCtx.destination)` → `gain.connect(master)` に変更
  - `startBGM()` / `stopBGM()`: `DEBUG_MODE` 時に `[BGM]` プレフィックスのコンソールログを出力
  - 根本原因: `osc.stop(t+dur)` 呼び済みノードに再度 `stop()` すると `InvalidStateError` が発生、`try-catch` で握りつぶされ旧BGMが止まらなかった
- GAME_DESIGN.md §38 追記

### Version 0.8.6.1 — 状態異常ゴーストキー修正

- `clearAilment` ゴーストキー問題: value=0 のキーが `statusAilments` に残留するバグを修正
- `doRest` の `hadAilments` 誤判定: ゴーストキーで「体調もよくなった！」が誤表示される問題を修正

### Version 0.8.6 — BGM重なり修正 + 攻略ペーパービュー屋

- **BGM重なり修正** (§36):
  - `bgmGeneration` / `activeBgmNodes` 変数を追加
  - `stopBGM()` でオシレーターノードを一括停止
  - `_scheduleBGMLoop()` に世代チェックを追加
  - `startBGM()` が世代番号をループに渡すよう変更
  - デバッグBGMボタンの `bgmCurrentType = null` を `stopBGM()` に修正
- **攻略ペーパービュー屋NPC追加** (§37):
  - フィールド (4,3) に 📰NPC を配置（マップ文字 `N`）
  - 10G / 50G / 100G の3段階ヒント購入メニュー
  - `getHintPriority()` で現在進行状況を判定（優先度0〜8）
  - `getProgressHint(tier)` で状況別ヒント文字列を生成
  - 購入時に `playSE("itemGet")` + 所持金減算 + saveGame
  - 購入後「もう一度買う」でメニューに戻れる
  - `hint-shop-modal` を index.html に追加
- GAME_DESIGN.md §36, §37 追記

### Version 0.8.5 — Lv99到達演出・成長達成感アップ

- Lv99到達時に専用ファンファーレ SE（`level99`）を追加（GAME_DESIGN.md §35）
- Lv99到達モーダルの内容を強化（ドラマチックな叙述・フィールドガイド）
- ステータス称号に「究極に近づきし者」を追加（Lv99未クリア時）
- ゴール表示に Lv99 到達済みの強調スタイルを追加
- 実家ヒントを文脈化（Lv99到達後は専用ヒントを表示）
- NPC・UMA博士(D): Lv99到達後 / クリア後の専用セリフ追加
- `state.eventFlags.level99Reached` フラグを追加（セーブ互換対応済み）
- `debugSetLevel99()` 改修: 初回ならSE+モーダル表示、再実行はトーストのみ
- `debugPlayLv99Event()` 改修: `level99` SE も再生
- デバッグ追加: 「Lv.98にする」「次の戦闘でLvUP(EXP設定)」「Lv99到達フラグをリセット」
- GAME_DESIGN.md §35 追記

### Version 0.8.4 — BGM/SE・サウンド設定

- Web Audio API ベースの軽量サウンドシステムを追加（GAME_DESIGN.md §34）
  - BGM 3種: field（フィールド）/ battle（バトル）/ ending（エンディング）
  - SE 9種: battleStart, attack, damage, captureOk, captureFail, levelUp, chestOpen, itemGet, endingStart
  - 外部音声ファイル不要（OscillatorNode による手続き的サウンド生成）
- サウンド設定を別キー (`"ultimateGorillaSoundV1"`) で保存（ニューゲームで消えない）
- 設定画面に 🔊/🎵/🔔 トグルボタンを追加
- スマホ自動再生制限に対応（初回ユーザー操作で AudioContext を初期化）
- デバッグ: SE テスト・各 BGM テスト・BGM 停止ボタンを追加
- 明示的に未実装: 2周目・横スクロール実装本体

### Version 0.8.3 — 伝説装備追加・NPCヒント連動イベント

- 伝説装備2種を追加（GAME_DESIGN.md §33）
  - キグナスのかぶと: フィールド ✨宝箱(X, 9,6)、Lv40以上 (防御+12 HP+5)
  - ドラゴンのたて: 王様の使いNPCからクリア後に受け取り (防御+26 HP+8)
- `cygnuskabuto` / `dragonshield` を isLegendary: true に変更・商人購入不可化・ステータス強化
- 王様の使いNPC: gameCleared時に接触でドラゴンのたてを授与する専用イベント追加
- NPC セリフ更新: 旅人(R)・鍛冶屋(K)・王様の使い(S)
- `state.eventFlags` に `cygnusHelmetGot` / `dragonShieldGot` を追加
- LEGEND_EQUIPS を 5種 → 7種に拡張（伝説装備進捗が自動更新）
- debugGetAllLegendary / debugResetLegendary に新装備追加
- GAME_DESIGN.md §33 追記
- 明示的に未実装: BGM/SE・2周目・横スクロール実装本体

### Version 0.8.2 — NPC会話システム・ヒント導線強化

- フィールドに固定NPC 5人を配置（GAME_DESIGN.md §32）
  - UMA博士(D, 2,2): 図鑑ヒント・メタルゴリラ案内
  - 旅人(R, 5,5): 伝説宝箱・フィールド探索ヒント
  - 鍛冶屋(K, 10,2): 装備・伝説装備ヒント
  - ゴリラ研究家(E, 6,9): 究極ゴリラ捕獲条件ヒント
  - 王様の使い(S, 10,1): クリア後報酬案内
- NPC接触で会話モーダル表示（npc-modal）
- 状態に応じたセリフ動的切り替え（level・hasUkulele・gameCleared・eventFlags・companions）
- 会話済みフラグなし（毎回話しかけ可）
- GAME_DESIGN.md §32 追記
- 明示的に未実装: BGM/SE・2周目・横スクロール実装本体

### Version 0.8.1 — UMA図鑑詳細表示・図鑑強化

- 図鑑一覧に進捗表示（発見 N/M、捕獲 N/M）を追加（§31）
- 発見済み・捕獲済みUMAをタップすると詳細モーダルを表示
  - No./名前/絵文字/レア度/分類/捕獲状態
  - HP/攻撃力/防御力/捕獲率/経験値/売却価格
  - 状態異常付与情報（ビッグフット・蚊系など）
  - 説明文（flavertext）
- 究極ゴリラの特別詳細表示（捕獲前警告・捕獲後金枠）
- 図鑑下部にメタル系（特殊エネミー）セクション追加（3種常時表示・タップで詳細）
- 全UMA（9種）+ メタル系（3種）に説明文（descフィールド）追加
- ステータス画面の図鑑進捗を「発見 N/M」「捕獲 N/M」の2行表示に更新
- GAME_DESIGN.md §31 追記
- 明示的に未実装: 図鑑フィルター・メタル系の遭遇記録トラッキング・大量UMA追加

### Version 0.8 — 伝説装備イベント・終盤探索強化

- 伝説装備5種をイベント限定入手に実装(GAME_DESIGN.md §30)
  - ペガサスのよろい: フィールド 🌟 宝箱(A)、Lv50以上
  - 六連のたて: 実家で休む、Lv60以上
  - 宇宙のかぶと: フィールド ⭐ 宝箱(C)、女神のウクレレ所持
  - 如意棒: フィールド 🪄 宝箱(J)、Lv70以上＋ジュリタニ同行
  - アンドロメダの鎖: 実家で休む、クリア後
- `isLegendary: true` フラグ追加(装備データ)
- 伝説装備の売却不可(商人画面で「売却不可」disabled、`sellEquip()`でも二重チェック)
- 装備画面に `★伝説` マーク表示
- ステータス画面に「★ 伝説装備 (N/5)」進捗セクションを追加
- 目標表示にLv50+/60+/70+/クリア後の伝説装備ヒントを追加
- `HOME_HINTS` に伝説装備ヒント4件追加
- `state.eventFlags` でイベント管理(セーブ対応・ニューゲームでリセット)
- 新タイル A/C/J 追加(SAFE_TILE・TERRAIN_EMOJI・renderField・movePlayer)
- デバッグボタン「⭐ 伝説装備を全入手」「🔄 伝説装備フラグをリセット」追加
- GAME_DESIGN.md §30 追記
- 明示的に未実装: BGM/SE・2周目・横スクロール実装本体・ボスダンジョン

### Version 0.7.1 — レベル99到達演出・クリア前達成感強化

- Lv99到達時の専用マイルストーンモーダルを追加(戦闘終了後に表示。§3.8)
  - 絵文字⚡・「ついにレベル99！」・ウクレレ所持状況に応じた次の目標案内
  - `state.pendingLv99` フラグで戦闘終了後に表示。クリア演出と同時発生時はクリアを優先。
- Lv99到達演出は初回のみ表示(`level99Shown` フラグ。セーブ対象・ニューゲームでリセット)
- デバッグメニューに「🎖 Lv99演出を再生」ボタンを追加
- GAME_DESIGN.md §3.8(Lv99マイルストーン)を追記
- GAME_DESIGN.md §5.5(横スクロールマップ将来構想)をボコスカウォーズ案含め詳細化
- TODO.md 今後の実装予定に横スクロールマップを「将来の大型改修」として登録
- 明示的に未実装: BGM/SE・2周目・横スクロール実装本体・ボスダンジョン・最強装備イベント

### Version 0.7 — 本格エンディング・クリア演出

- 5ページ構成のエンディングモーダル(暫定クリアモーダルを昇格): 女神のウクレレ→森へ帰る→王様への報告→スタッフロール→クリア総括
- スタッフロール風クレジット表示(ENDING_CREDITS 配列で管理)
- 「つぎへ ▶」「冒険を続ける」ボタンでページ送り
- クリア称号を追加: クリア前「勇者の子孫」/ クリア後「森に歌を届けし者」
- ステータス画面(📊)に称号行を追加
- エンディング再視聴: 設定画面(⚙️)とステータス画面(📊)に「🎬 エンディングを見る」ボタンを追加
- 図鑑で究極ゴリラ捕獲済み時に金枠 + 「伝説のUMA」「森へ帰った」を特別表示
- デバッグメニューに「🎬 エンディングを再生」「🏆 クリア済みにする」を追加(§28)
- GAME_DESIGN.md §3.6/§14.5/§17/§28/§29 を追記・更新
- 明示的に未実装: BGM/SE・本格アニメーション/2周目/横スクロール/ボスダンジョン/仲間追従

### Version 0.6.1 — クリア導線・バランス調整・テスト補助

- ステータス画面に「🎯 現在の目標」セクションを追加(進行状態に応じて6段階で自動切替)
- 実家モーダルにランダムヒント表示(9種類。女神のウクレレ・メタルゴリラ・究極ゴリラなど)
- 目的説明モーダルの内容を更新(Lv99目標・ウクレレ・うたうヒントを追記)
- 暫定クリアモーダルの内容を改善(クリア後案内・正式エンディング予告)
- メタルゴリラ系EXPを大幅増量: 40→120 / 120→400 / 300→1000
- メタルゴリラ系出現率を微増: METAL_ENCOUNTER_CHANCE 0.04→0.06
- メタルゴリラ系遭遇時に専用メッセージ(「キラリと光った！経験値のチャンスだ！」)
- EXPカーブを緩和: level×15+20 → level×10+15(約33%減)
- 究極ゴリラ通常捕獲ブロックのメッセージ確認(既存実装を確認・維持)
- 暫定クリア後の挙動確認(フィールド復帰・継続プレイ可・ニューゲームでリセット)
- デバッグメニュー追加(URLに?debug=1を付けると設定画面に表示): Lv99化・ウクレレ入手・
  究極ゴリラ強制エンカウント・敵HP5設定・9999G追加・クリアリセット
- GAME_DESIGN.md §3.6/§3.7/§6.3/§26/§27 を追記・更新
- 明示的に未実装: 本格エンディング/エンドロール/2周目/BGM・SE/横スクロール/ボスダンジョン

### Version 0.6 — うたう・女神のウクレレ・究極ゴリラ捕獲条件

- 戦闘コマンドに「🎵 うたう」を追加(専用ボタン。常時使用可能)
- 通常敵への「うたう」: 次の捕獲率を1ターン+0.05(ハルミ同行中は+0.08)
- ハルミ同行中は「ハルミが音程を整えた！」専用メッセージを表示
- 重要アイテム「女神のウクレレ」を追加(消耗なし・売却不可)
  - マップに専用タイル 'U'(🪗)を追加。一度入手したら再入手不可
  - ステータス画面で所持状態を確認可能
  - セーブデータに保存(`hasUkulele`)
- 究極ゴリラに通常「つかまえる」を使うと「普通の捕獲は通用しない！」でブロック
- 究極ゴリラへの「うたう」: レベル99+女神のウクレレ+HP1〜10 の3条件を判定
  - 条件未達時: 条件ごとの専用メッセージを表示して敵ターンへ
  - 条件達成時: 特別演出メッセージ5行→捕獲成功→暫定クリアモーダル
- `gameCleared` フラグをセーブデータに保存
- ステータス画面・ヘルプ画面を更新
- 明示的に未実装: 本格エンディング/エンドロール/2周目要素/BGM・SE

### Version 0.5.1 — 酒場・仲間加入演出改善

- 仲間候補ごとに `joinRate` を設定(ジュリタニ70%/シュリタニ65%/ノリオ75%/ハルミ60%)
- 加入試みに成功/失敗の2分岐を追加。失敗時も候補は残り何度でも再挑戦できる
- 仲間ごとに固有の成功台詞・断り台詞を実装(joinMsgs / failMsgs)
- 台詞を酒場画面内に表示し、演出後に候補一覧に戻る
- 「仲間を探す」一覧に effectDesc(効果説明)を明示表示
- すでに仲間の場合は「同行中 ✓」と表示(以前は「同行中」ボタン)
- パーティー上限時は「上限です。仲間を外してから来てください。」と表示
- GAME_DESIGN.md §9.5/§10を更新、§24(v0.5.1未実装)を追記
- 明示的に未実装: 加入時3分岐(戦闘分岐)/NPCフィールド追従/シンボルエンカウント

### Version 0.5 — 酒場・仲間システム

- 酒場(🍺)を正式オープン。「仲間を探す / 仲間を見る / 仲間を外す / やめる」の
  4メニューで構成される酒場モーダルを実装。
- 仲間候補4人のデータを追加(COMPANION_DATA):
  - ジュリタニ(critBonus +20%: 攻撃時会心の一撃確率アップ)
  - シュリタニ(captureMod +0.10: 捕獲率アップ)
  - ノリオ(fleeMod +0.15: 逃走成功率アップ)
  - ハルミ(spellMod +20%: まほう効果アップ)
- 仲間上限: 最大2人(COMPANION_MAX)。上限時は加入不可。
- 仲間の補正をリアルタイムで戦闘計算に反映:
  ジュリタニ→doFight()会心判定、シュリタニ→attemptCapture()加算、
  ノリオ→doRun()加算、ハルミ→castSpell()倍率加算
- 仲間情報(companions配列)をlocalStorageにセーブ/ロード対応
- ステータス画面に仲間一覧を追加
- ステータスバーに仲間数を簡易表示(仲間がいる場合のみ)
- ヘルプ画面に仲間システムの説明を追加
- GAME_DESIGN.md §9.5/§10を実装済みに更新、§23(v0.5未実装)を追記
- 明示的に未実装: NPCフィールド追従/シンボルエンカウント/加入時3分岐/
  仲間固有イベント/専用装備/仲間成長(詳細は §23)

### Version 0.4.5 — 操作性・戦闘結果・セーブ管理・売却改善
- 戦闘終了時に必ずOKボタンで結果確認→フィールド復帰方式に変更
  (たたかう/まほう/アイテム/つかまえる/にげる、全コマンドの終了で統一)
- 戦闘開始直後800msのコマンド入力ロック(誤タップ防止)
- スマホ長押しのテキスト選択/コンテキストメニュー抑制
  (CSS: -webkit-user-select/-webkit-touch-callout/touch-action: manipulation、
   JS: contextmenu preventDefault)
- 設定画面に「🔄 ニューゲーム(セーブデータをリセット)」ボタンを追加
  (確認ダイアログ→localStorage削除→リロードで初期状態に戻る)
- 商人に「🔧 装備を売る」メニューを追加
  (所持装備を buyPrice/2 で売却、装備中は売れない)
- GAME_DESIGN.mdに将来仕様を追記(仲間候補名/追加モンスター候補/追加まほう候補)
- 明示的に未実装: 仲間システム本体・酒場加入・NPC追従・うたうコマンド・
  レベル99イベント・女神のウクレレ・横スクロールマップ・
  大量モンスター/まほう追加(詳細は §22)

### Version 0.4.4 — フィールド宝箱・戦闘外アイテム使用
- フィールド上に宝箱シンボル(🎁 `B`タイル)を4箇所追加
- 宝箱の中身: お金(5〜50G)/回復アイテム/低〜中ランク装備の重み付き乱択
- 開封済みの宝箱は📦に変わり、再接触で「空だった」と表示(開封状態をセーブ)
- 装備はすでに所持済みの場合、代わりにゴールドを獲得
- フィールド上で「🎒アイテム」ボタンを追加(ステータスバーに配置)
- 戦闘外でやくそう/コーヒー/パン/お弁当/ラーメン/せき止めシロップ/デオドラントスプレーを使用可能
- HP満タン時の回復・状態異常でない時の治療は消費せずメッセージ表示
- ヘルプ画面に宝箱・フィールドアイテム使用の説明を追加
- GAME_DESIGN.mdに §5.7(宝箱) §5.8(フィールドアイテム) §21(未実装) を追記
- 明示的に未実装: 最強装備イベント入手・仲間システム・酒場加入・NPC追従・
  究極ゴリラ捕獲イベント・うたうコマンド・レベル99イベント・女神のウクレレ・
  横スクロールマップ本体

### Version 0.4.3 — 実家イベント・回復・アイテム/装備入手改善
- 実家イベント(🏠タイルに接触: HP/MP/状態異常全回復 + オートセーブ)
- 回復アイテム4種を実際に使えるように(コーヒー/パン/お弁当/ラーメン。戦闘中のみ対応)
- 商人に回復アイテムを追加(コーヒー5G/パン10G/お弁当20G/ラーメン40G/
  せき止めシロップ15G/デオドラントスプレー15G)
- 商人の装備ラインナップを大幅拡充(武器13種・防具4種・盾2種・兜3種が購入可能に)
- GAME_DESIGN.mdに将来仕様を追記(実家の役割§5.6、フィールドドロップ案§5.7、
  最強装備の将来入手案§8.6)
- ヘルプ画面に実家の説明を追加
- 明示的に未実装: フィールド上でのアイテム使用、最強装備の入手手段、
  仲間システム本体・酒場加入・NPC追従・究極ゴリラ捕獲イベント本体・
  うたうコマンド・レベル99イベント・女神のウクレレ

### Version 0.4.2 — 捕獲システム改善・モンスター追加
- 戦闘結果の表現を「倒した」→「○○に逃げられた！」に変更(経験値はそのまま、
  追加で所持金も獲得するように)
- 捕獲率のHP連動を強化(HP連動係数を0.30→0.50に。レアUMAは0.25に
  ダンピングして例外的に難しく)
- 敵を type: "uma" / "monster" / "metal" で分類
- 通常モンスターを10種追加(蚊/蛇/ヤブ蚊/さまようおやじ/詐欺師/
  パワポ野郎/ぶつかりおじさん/鬼/パワハラ先輩/マラソンマン)。
  一部に特殊行動(アレルギー/におい付与・MP吸収・所持金を盗む・不意打ち・
  逃げにくい)を実装
- メタルゴリラ系3種を追加(メタルゴリラ/はぐれメタルゴリラ/
  フルメタルゴリラ)。低確率出現・高防御・高経験値のボーナス敵
- 攻撃まほう3種追加(パクチー/グーパンチ/ホームラン)
- GAME_DESIGN.mdへ将来仕様を追記(究極ゴリラ捕獲条件、横スクロール
  マップ案、まほう追加候補)。コードは未実装
- 明示的に未実装: 仲間システム本体・酒場加入・NPC追従・究極ゴリラ捕獲
  イベント本体・うたうコマンド・レベル99イベント・女神のウクレレ・
  横スクロールマップ本体・大量の新規装備追加
  (詳細は [GAME_DESIGN.md §20](GAME_DESIGN.md#20-今回version-042で明示的に実装しなかったもの))

### Version 0.4.1 — 初回プレイ改善・装備バランス調整
- 目的説明画面(オープニング直後、初回のみ自動表示。設定からいつでも再表示可)
- セーブの分かりやすさ改善(設定モーダルに「オートセーブ中」表示+「今すぐセーブ」ボタン)
- ステータス確認画面(📊ステータスボタン。名前/Lv/HP・MP/経験値/所持金/職業/
  状態異常/装備/まほう/所持アイテム/捕獲UMA数/図鑑進捗)
- ヘルプ画面(❓ヘルプボタン。目的/操作/セーブ/戦闘/捕獲/装備/状態異常を解説)
- 装備の所持制(ownedWeapons/ownedArmors/ownedShields/ownedHelmets)。
  未所持の装備は装備変更画面で選べず「未所持」と表示。既存セーブは
  装備中だったものを自動的に所持品として引き継ぐ
- 商人に装備購入を追加(武器4種/鎧2種/盾1種/兜1種。残りは将来バージョン)
- せき止めシロップ/デオドラントスプレーを実際に使えるように(アレルギー/においを治療)
- 明示的に未実装: 仲間システム本体・酒場加入・NPC追従・究極ゴリラ捕獲イベント・
  うたうコマンド・レベル99イベント・大量の新規装備/UMA追加
  (詳細は [GAME_DESIGN.md §19](GAME_DESIGN.md#19-今回version-041で明示的に実装しなかったもの))

### Version 0.4 — RPGらしさ強化アップデート
- RPGメッセージシステム(発見/撃破/捕獲/逃走/経験値/レベルアップのドラクエ風メッセージ)
- オープニングイベント(初回起動時のみ、王様のメッセージ)
- 酒場(建物のみ。「現在工事中」表示。仲間システムの土台)
- 装備システム(武器/防具/盾/兜の装備変更画面。入手手段は未実装で全項目を選択可能)
- 初期装備データ追加(武器22種/防具8種/盾4種/兜6種)
- アイテムデータ追加(コーヒー/パン/お弁当/ラーメン/せき止めシロップ/デオドラントスプレー。データのみ)
- 状態異常システムの基盤+「アレルギー」「におい」の2種類
- まほうを攻撃/回復に分離(ATTACK_SPELL_DATA/HEAL_SPELL_DATA)、新規まほう10種追加
- 明示的に未実装: 仲間システム本体・酒場加入・究極ゴリラ捕獲イベント・
  うたうコマンド・レベル99イベント・NPC追従(詳細は [GAME_DESIGN.md §18](GAME_DESIGN.md#18-今回version-04で明示的に実装しなかったもの))

### Version 0.3 — ラスボス調整・設定・公開
- 究極ゴリラをラスボス級に調整(HP5000/攻撃力150/防御60/捕獲上限2%/かいしんのいちげき演出)
- 設定画面(歩く速度: 遅い/普通/速い、十字キー押しっぱなし移動)
- GitHub Pages公開、README.md整備

### Version 0.2 — UMA収集システム化
- 商人(買う/アイテムを売る/UMAを売る/やめる)
- 所持金システム
- UMA図鑑の3状態化(未発見/発見済み/捕獲済み)、所持UMA(同種複数所持可)
- 転職システム(職業/部活 9種、ステータス・捕獲率・逃走率・まほう習得率に補正)
- セーブ/ロード(localStorage)
- データ構造の整理(UMA_DATA/ITEM_DATA/WEAPON_DATA/SPELL_DATA/JOB_DATA)

### Version 0.1 — 初期プロトタイプ
- フィールド移動(十字キー/スワイプ/キーボード)、ドラクエ風2Dマップ
- ランダムエンカウント、戦闘(たたかう/にげる/つかまえる)
- 経験値・レベルアップ・まほう習得
- フィールドアイテム(武器/回復)の取得
- レアUMA・究極ゴリラの初期実装(発見モーダル)


## 🔜 今後の実装予定

### Version 0.6 以降 — 仲間システム拡張(予定)

- [ ] NPCのフィールド追従表示
- [ ] シンボルエンカウント方式への変更
- [ ] 加入時の会話3分岐(仲間になる / 断られる / 戦闘になる)
- [ ] 仲間固有イベント
- [ ] 仲間専用装備・仲間の成長要素
- 詳細仕様は [GAME_DESIGN.md §10](GAME_DESIGN.md#10-仲間システム) を参照。

### その他 近期 — 未定
プロデューサーからの新規アイデアをこのセクションに追記していく。
現時点で挙がっている検討事項(優先度未確定):

- 最強装備のイベント入手(§8.6。宝箱増設・ドロップ拡充)
- BGM/SE付き本格エンドロール(§28。v0.7でテキスト版実装済み)
- まほう・必殺技の追加候補の実装(§12)
- 通常モンスターの未実装候補の追加(§6.1)
- セーブ対象の拡張(プレイヤー座標・フィールドアイテム取得状況)
- 図鑑からのUMA詳細ステータス確認
- ストーリー性のあるイベント・NPCとの会話

### 将来の大型改修 — v0.9以降

- **横スクロールマップ (§5.5)**: ボコスカウォーズ風の3〜5面横スクロールフィールド。
  `renderField()` / `RAW_MAP` / カメラ / セーブ座標すべてに影響する大規模改修。
  専用ブランチで着手する。詳細仕様は GAME_DESIGN.md §5.5 参照。
- 複数の街・ダンジョン・ワールドマップ間の移動
- 仲間システム拡張(フィールド追従・固有イベント・3分岐加入)

### Version 1.0 — 正式版の目標(検討中)
- 究極ゴリラ討伐に関するエンドコンテンツ(専用装備・クリア後強化など、詳細未定)
- 上記すべての安定化・バランス調整


## 💰 実装しないことが決まっている事項

- 課金処理そのもの(将来の構想はあるが、現時点では実装しない方針。
  [GAME_DESIGN.md §17](GAME_DESIGN.md#17-今後追加予定設計レベルで検討中のものを含む) および
  `README.txt` の「将来の課金要素メモ」を参照)
