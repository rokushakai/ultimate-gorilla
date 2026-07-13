# DEV_LOG.md — 開発ログ

このファイルには、開発中に判明した問題・判断・注意点を記録する。
仕様は GAME_DESIGN.md、変更履歴は CHANGELOG.md を参照。

---

## v0.40 (2026-07-14)

### 設計判断

- **`renderStatus()` は未定義**: コード全体で `renderStatus()` が多数呼び出されているが、定義は `renderStatusBody()` のみ。pre-existing bug。v0.40の `equipCompanionGear()` では `renderStatusBody()` を直接呼び出す方針とした。
- **装備ボーナスは会心倍率に乗せない**: ジュリタニ 会心の構え / 通常攻撃ともに、会心倍率（×1.5/×1.6）計算後にフラット加算。意図: 装備が強くなりすぎない・会心の価値を保持。
- **`ensureCompanionGearState()` は冪等**: loadGame後・equipCompanionGear・renderStatusBody内で複数回呼ばれても、`companionGearVersion >= 1` ガードで二重配布しない。
- **スターター装備は自動装備しない**: `ensureCompanionGearState()` はインベントリに追加するのみ。プレイヤーがステータス画面で手動装備する設計。

## v0.39.1 (2026-07-13)

### 確認・設計判断

- **milestonesガード2段階化**: `!cl.milestones || typeof !== "object" || Array.isArray()` のいずれかで旧セーブ補完。milestonesがobjectなら `typeof key !== "boolean"` でキー単位の安全補完。これにより `debugでfalseを設定してからgetCompanionLevel()を再呼び出ししても上書きされない` という保証が生まれた。
- **Lv99ダブルログ問題なし**: `gainCompanionExp()` の `if (cl.level >= 99) { 🌟ログ } else if (cl.level > oldLevel) { 🎉ログ }` は排他的if/else if 構造のため、🌟と🎉が同時に出ることはない。確認のみでコード変更なし。
- **セーブタイミング問題なし**: milestonesフラグは `checkCompanionLevelMilestones()` 内でメモリ更新され、`finishBattle()→saveGame()` で確実に保存される。追加saveは不要。
- **Lv1→Lv60の複数節目確認**: 20000EXP付与でLv60超え。Lv50セリフのみ表示・Lv10/50フラグtrue・Lv99false が期待動作。デバッグボタン `🚀 複数節目確認` で再現可能。

---

## v0.39 (2026-07-13)

### 追加・変更

- **`COMPANION_LEVEL_MILESTONE_LINES` 追加**: COMPANION_DATA直後に配置。4仲間×3段階（Lv10/50/99）のセリフを定数オブジェクトで管理。
- **`checkCompanionLevelMilestones(cid, oldLevel, newLevel)` 追加**: 節目到達チェック・戦闘ログ・フラグ更新の共通関数。複数節目を一度に越えた場合は最高節目セリフのみ表示し、全通過済みをtrueに記録する。
- **`getCompanionLevel()` 更新**: `milestones` フィールドが未定義の場合、現在Lvに基づいて旧セーブを自動補完。Lv10→level10:true / Lv50→level10+level50:true / Lv99→全true。
- **`gainCompanionExp()` 更新**: `startLevel` を `oldLevel` に改名し、Lvアップ後に `checkCompanionLevelMilestones` を呼び出す。既存Lv99専用ログは保持。
- **ステータス画面 「成長の節目」行**: 成長効果行の直後に追加。`Lv10 ✓　Lv50 ✓　Lv99 ・` 形式で節目到達状況を表示。`cl.milestones` を直接使用（`getCompanionLevel()` でフィールドが保証されているため null ガード不要）。

### 設計判断

- **セーブ形式**: `state.companionLevels[cid].milestones` として既存の `companionLevels` キーに内包。新しいトップレベルキーを追加しないため、既存のsave/loadコードを変更不要。
- **旧セーブ補完のタイミング**: `getCompanionLevel()` 内で行う。この関数は必ず最初に呼ばれるため、saveGame/loadGame側に補完コードを書く必要がない。
- **「最高節目のみ表示」の理由**: 大量EXP付与デバッグや戦闘チェーンでセリフが連続するのを防ぐ。低い節目フラグはtrueに記録されるため、後から遅れて表示されることもない。
- **`gainCompanionExp()` の `startLevel` → `oldLevel` 変更**: 変数名を意図に合わせて明確化。`startLevel` は「節目計算の起点」の意味を正確に伝えていなかった。

---

## v0.38.1 (2026-07-12)

### 確認・設計判断

- **二重適用が起きない構造**: `runCompanionAutoCommand()` は `runSingleCompanionAction()` / `runCompanionSpecialAction()` / `runCompanionMagicAction()` を直接呼ぶため、成長ボーナスは行動関数内で1回だけ計算される。まかせる経由でも手動経由でも同じ値。追加適用なし。
- **ハルミ通常攻撃に成長ボーナスなし（意図的）**: `runSingleCompanionAction` のハルミ行動（光の攻撃）は攻撃なので回復系成長は適用しない。自動戦闘でハルミが攻撃するのは敵HP残量が多い時のみで、主な役割は回復のため矛盾しない。
- **ダメージ上限引き上げ方式**: `Math.min(旧cap, base_formula) + growthBonus` を外側の新cap でクランプ。旧capをそのまま使うと Lv99成長ボーナスが cap に吸収されてしまうため。新capは `旧cap + 最大ボーナス` の計算値を基準にした。
- **セーブデータに成長値を保存しない**: `growthTier` / `growthBonus` は `state.companionLevels` から毎回計算する。保存不要のため旧セーブとの互換問題がない。

---

## v0.38 (2026-07-12)

### 追加・変更

- **`getCompanionGrowthTier(cid)` 追加**: 仲間LvをTier 0〜5に変換。Lv1〜9=0 / 10〜24=1 / 25〜49=2 / 50〜74=3 / 75〜98=4 / 99=5。
- **`getCompanionGrowthBonus(cid)` 追加**: Tier×係数でボーナス値を返す。ジュリタニは×2（最大+10）、シュリタニ/ノリオは×1（最大+5）、ハルミは×2（最大+10）。
- **`runSingleCompanionAction` 更新**: ジュリタニ(cap20→30) / シュリタニ(cap5→10) / ノリオ(cap15→20) に成長ボーナス加算。ハルミ通常攻撃は変更なし。
- **`runCompanionSpecialAction` 更新**: 固有1（ジュリタニ cap28→38 / シュリタニ cap3→8 / ノリオ cap12→17 / ハルミ cap25→35） / 固有2（シュリタニ cap4→9 / ノリオ cap8→13）。かばう・まもりの光の軽減率は変更なし。
- **`runCompanionMagicAction` 更新**: ジュリタニ熱血エール / シュリタニおちつきの霧 / ノリオ観察メモ / ハルミ小さな回復 にそれぞれ成長ボーナスを加算。
- **ステータス画面「成長効果」行追加**: 全4仲間の成長段階とボーナス値を表示。

### 設計判断

- **ハルミ回復成長は小さな癒しと小さな回復の両方に適用**: 固有1（癒し）とまほう（回復）は別コマンドパスだが、どちらも「回復量成長」の主体なので両方にボーナスを加える。
- **熱血エール（まほう）のcap設定**: 既存は固定5〜12のランダム+成長ボーナスなのでcap不要。最大でも5+7+10=22で問題なし。

---

## v0.37.1 (2026-07-12)

### 追加・変更

- **`getCompanionLevel` データガード強化**: level/exp/nextExp に型チェック・範囲クランプを追加。旧セーブや破損データでも `TypeError` が起きない。
- **`gainCompanionExp` ログ改善**: 1Lvごとにログ出力する方式から、最終到達Lvのみ1回出力する方式に変更。複数Lvアップ時のバトルログ過多を防止。Lv99到達時は `"🌟 最高レベル Lv99 に到達した！"` の専用ログ。
- **Lv99時UI統一**: 酒場（仲間を探す/仲間を見る）・ステータス画面・冒険の記録でLv99時の表示を統一（「Lv.99 MAX」/「MAX」）。
- **デバッグボタン3本追加** (§100): Lv1リセット/複数Lvアップ確認/パーティ仲間のみEXP確認。

### 設計判断

- **ログを最終Lvのみにした理由**: Lv1から一気にEXP500付与すると9回連続でLvアップログが流れてバトルログが埋まるため。Lv8になった！の1行で十分、Lv9 Lv10の分は余分なログ。
- **Lv99表示は「MAX」で統一**: `nextExp = 99 * 10 + 15 = 1005` を表示するより「MAX」のほうが直感的。EXPは `getCompanionLevel` のガードで常に0に保証されているので、`0 / 1005` という誤表示も起きない。
- **EXP二重付与は起きない設計が確認された**: `attemptCapture` 成功時は `showBattleEnd()` を直接呼び、`winBattle()` には入らない。`doCatch()` も `attemptCapture` 返値が `true` の場合は `enemyTurn` を呼ばない。構造上の安全が確認済み。

---

## v0.37 (2026-07-12)

### 追加・変更

- **`state.companionLevels` 追加**: state オブジェクトに `companionLevels: {}` を追加。`saveGame/loadGame` 両方に対応。古いセーブは `data.companionLevels || {}` で補完。
- **`getCompanionLevel(cid)` 追加**: 仲間のLv/EXP状態を取得する関数。初回呼び出し時に `{ level: 1, exp: 0, nextExp: 25 }` で初期化する（guard付き）。
- **`gainCompanionExp(baseExp)` 追加**: `gainExp/addExp/levelUp` の直後に定義。パーティ中の仲間にEXPを付与し、Lv99までレベルアップ処理を行う。
- **`winBattle()` / `attemptCapture()` 更新**: `gainExp(e.exp)` 直後に `gainCompanionExp(e.exp)` を追加。どちらも敵のベースEXP（ノリオ倍率適用前）を付与。
- **酒場UI Lv 表示追加**: `renderTavernRecruit` / `renderTavernViewParty` の各仲間カードに Lv.N を追加（水色、companion-card-header の直下）。
- **ステータス画面「仲間」強化**: `COMPANION_DATA.forEach` で全4仲間を表示に変更。各仲間に Lv / EXP / パーティ状態を表示。
- **冒険の記録「👥 仲間」追加**: 「次の目標」セクションの直前に全4仲間のLvを record-section として追加。

### 設計判断

- **ノリオ倍率を仲間に適用しない**: ノリオの `expMod:2` は主人公のための能力。仲間へは base exp（`e.exp`）を付与することで、ノリオ能力の独自性を保つ。
- **`getCompanionLevel` 方式**: `COMPANION_DATA` に lv/exp を直接追加しない。`state.companionLevels` の別オブジェクトに分離することで、COMPANION_DATA はデータ（固有能力の定義）のまま保つ。起動時の初期値は state に、セーブは companionLevels キーで管理。
- **Lv99でEXPを0にリセット**: キャップ後も `gainCompanionExp` を呼ぶたびに `if (cl.level >= 99) return;` でスキップ。EXPの「たまりっぱなし」を防ぐ。
- **全4仲間を表示**: ステータス画面 / 冒険の記録では、パーティ外の仲間のLvも表示する。「待機中でも成長の痕跡が残る」設計は今後のEXP共有ルール変更を想定。

---

## v0.36.1 (2026-07-12)

### 追加・変更

- **デバッグボタン2本追加 (§98)**: 「🎲 まかせるAI 魔法名ログ確認」「🎲 まかせるAI 攻撃魔法勝利確認」。

### 設計判断・確認結果

- **なぜコード変更なしで済んだか**: v0.36 の実装時点でまほう勝利フロー・ハルミ false 返値・前回記憶ペナルティ・ウェイト正規化 はすべて正しく実装されていた。安定化パスとして8項目を確認したが、バグは発見されなかった。デバッグボタン追加のみで v0.36.1 完了。
- **デバッグボタンの設計**: `btn-debug-v361-magic-log` は前回記憶クリア（`lastCompanionAutoAction = {}`）込みでセットアップ。`btn-debug-v361-magic-win` は敵HP5でセットアップし、攻撃系まほうが勝利フローに入るかを確認しやすくした。どちらも戦闘中チェック（`state.inBattle` ガード）付き。

---

## v0.36 (2026-07-12)

### 追加・変更

- **`runCompanionAutoCommand(cid)` を4択に拡張 (§97)**: 3択（wA / wS1 / wS2）から4択（wA / wS1 / wS2 / wM）に拡張。`wM` はまほうの重み。
- **仲間別基本比率の再設定**: 旧 v0.33 の比率から仲間まほうの重みを割り当て直した。既存の比率（wA/wS1/wS2）を若干減らして wM 分を確保。
- **前回行動記憶に `"magic"` 追加**: `state.lastCompanionAutoAction[cid]` が `"magic"` の場合 `wM -= 0.10` → 正規化。他の3択補正ロジックと同じ形式。
- **ウェイト正規化を4択対応**: `total = wA + wS1 + wS2 + wM`。フォールバックも `wM = 0` を追加。
- **行動選択を4択対応**: `roll < wA + wS1 + wS2` の後に `else { chosenAction = "magic"; }` を追加。
- **magic 実行ブランチを追加**: `runCompanionMagicAction(cid)` を呼び出す。ログは既存2行形式と統一。

### 設計判断

- **`runCompanionMagicAction` は変更不要**: まかせるAIから呼んでも手動選択時と全く同じ動作をする。`updateBattlePlayerStatus()` は `runCompanionMagicAction` 内で呼ばれるので、まかせる経由でもHP色更新が機能する。
- **ハルミ小さな回復はまかせるで winBattle に入らない**: `runCompanionMagicAction("harumi")` は常に `return false` → `executeCompanionCommand` の `if (killed || e.hp <= 0)` は false → 次の仲間or敵ターンへ。
- **攻撃系まほうの勝利フロー**: `runCompanionMagicAction(cid)` が `true` 返値 → `runCompanionAutoCommand` が `true` 返値 → `executeCompanionCommand` の `killed = true` → `winBattle()` → 二重 enemyTurn なし。v0.35 と同じフロー。
- **敵HP≤15 での magic 15%**: とどめを優先しつつも、まほう（攻撃系）でとどめを刺せる確率を残す。ハルミは 15% が小さな回復（回復のみ、winBattle に入らない）だが、敵HP≤15 なら次のターンに通常攻撃でも倒せる確率が高い。
- **ハルミ+HP≤40% の小さな回復35%**: 固有1の「小さな癒し」（45%）と合わせて回復系合計80%。2種の回復を両方使えるのが4択の利点。旧3択では固有1にすべての回復を集中させていたが、分散することでバリエーションが増える。

---

## v0.35.1 (2026-07-12)

### 追加・変更

- **`showCompanionMagicMenu()` に `companionCommandLocked` ガード追加 (§96)**: `if (!state.companionCommandActive) return;` の直後に `if (state.companionCommandLocked) return;` を追加。理論上は `✨ まほう` ボタンが表示されている時点で `companionCommandLocked = false` のはずだが（`showCompanionCommandForIdx` で明示的にリセットされる）、防御的プログラミングとして追加した。

### 設計判断・確認結果

- **なぜ `companionCommandLocked` ガードが必要か**: `showCompanionCommandForIdx` は末尾で `companionCommandLocked = false` を設定するが、何らかの予期しない経路で `companionCommandLocked = true` のまま `btn-companion-magic` が押せた場合に二重サブメニュー表示を防ぐ。守備的な追加。
- **戻る動作フローの確認**: `↩ 戻る` クリック → 全ボタン disable → magic menu hidden → `showCompanionCommandForIdx(state.companionCommandIndex)` 呼び出し → この関数内の `state.companionCommandLocked = false` で確実にリセット → 4択ボタン再生成（disabled でない）。連打しても2回目は disabled ボタンのため無効。
- **`clearCompanionCommandState()` の網羅性**: `#companion-magic-menu` の hidden は v0.35 で追加済み。`battle-gaman-status` は `updateBattlePlayerStatus()` 経由で制御され、`finishBattle()` が `gamanActive = false` を設定することで間接的にクリアされる。`clearCompanionCommandState` から直接 hidden を操作しなくても問題ない（battle screen 自体が hide される）。
- **攻撃系まほうの勝利フロー確認**: `runCompanionMagicAction` が `e.hp <= 0` なら `true` → `executeCompanionCommand` の `if (killed || e.hp <= 0) { winBattle(); return; }` で winBattle → その後の `showCompanionCommandForIdx` には到達しない → `enemyTurn()` の二重予約もない。

---

## v0.35 (2026-07-12)

### 追加・変更

- **仲間コマンドUIを4択化 (§95)**: `showCompanionCommandForIdx()` の `menu.innerHTML` を変更。`まかせる` から `grid-column:1/-1` を削除し、`✨ まほう` ボタンを追加。2×2グリッド（⚔️/⭐ / ✨/🤝）になる。
- **`showCompanionMagicMenu(cid)` 新設 (§95)**: `showCompanionSpecialMenu` と同じパターン。表示時に `#companion-command-menu` を hidden にし、戻るボタンで `showCompanionCommandForIdx` に戻る。
- **`runCompanionMagicAction(cid)` 新設 (§95)**: 4仲間分の仲間まほうを実装。ハルミのみ常に `return false`（回復は winBattle に入らない）。他3仲間は敵HP0なら `true` を返して winBattle フローへ。

### 設計判断

- **なぜ「まかせるAI」に仲間まほうを混ぜないか**: v0.35 は「仲間まほうの入口」。AI に混ぜると状況判断の複雑度が上がる。v0.36 以降で状況判断を整備してから追加する方針。
- **ハルミの「小さな回復」と既存の「小さな癒し」（固有1）の違い**: 固有1（小さな癒し）は `runCompanionSpecialAction` で実行する。仲間まほう枠の「小さな回復」は `runCompanionMagicAction` で実行する。名前を変えることで UI 上の区別をつけた。効果量は近似しているが、仲間まほう枠からのみ選べる独立したコマンドとして管理する。
- **`#companion-magic-menu` を `setBattleLocked()` から除外した理由**: 固有コマンドサブメニューと同じく `companionCommandLocked` で二重実行防止を管理するため、`setBattleLocked()` による全体ロックから除外する必要がある。
- **ダメージ量を控えめにした理由**: 仲間まほうは「入口」なのでゲームバランスへの影響を最小化。ジュリタニ（会心の構え: 上限28）より弱い 5〜12。シュリタニはフレーバー中心で 1〜3。ノリオは観察キャラとして 3〜7。ハルミは回復のみ。

---

## v0.34.1 (2026-07-12)

### 追加・変更

- **CSS バグ修正 (§94)**: `#b-hp-text.battle-hp-warn { color: #ffd166; }` が `#battle-player-status { color: #ffd166; }` と同色のため、警告状態が視覚的に区別できなかった。`#ff9f1c`（オレンジ）に変更。これは v0.34 実装時の見落とし。

### 設計判断

- **なぜ `hpEl.className` の直接代入が安全か**: `#b-hp-text` は v0.34 以前にクラスを一切持っていなかったため、`className = ""` （クラスなし）に戻せば確実にリセットされる。`classList.remove` を使うより明示的で確実。
- **`battle-hp-warn` の色をオレンジにした理由**: 警告（30〜49%）と通常（50%以上）が同じ黄色では意味がない。オレンジ（`#ff9f1c`）は既存の UI カラー（黄 #ffd166、緑 #06d6a0、青 #4cc9f0）の中間トーンで自然に見える。
- **ガマン+守りデバッグボタン**: `state.gamanActive = true` を直接セットするのはデバッグ専用操作。実際の ガマン コマンドを踏まなくても状態バッジの共存を確認できる。

---

## v0.34 (2026-07-12)

### 追加・変更

- **`#battle-status-badges` 追加 (§93)**: `index.html` の `battle-gaman-status` 直後に配置。CSS で `display:flex;gap:6px;` のバッジ行を形成。バッジがなければ `.hidden` で非表示。
- **`updateBattleStatusBadges()` 新設 (§93)**: `battleDamageReduction > 0` → `🛡️ 守り効果あり`。究極ゴリラ HP1〜10 + Lv99 + ウクレレ → `🎤 うたうチャンス`。innerHTML 書き換えで管理。
- **HP カラークラス (§93)**: `hpEl.className` を直接代入（クラスは1つしかないため `classList` でなく `className` で十分）。`battle-hp-danger`/`battle-hp-warn` の2クラスのみ。既存の `color: #ffd166` は `#battle-player-status` で設定済みなので、クラスなし時は自然にリセットされる。
- **`showCompanionCommandForIdx` 進捗表示 (§93)**: `queue.length > 1` の場合のみ `（N/M人目）` をタイトルに追加。仲間1人のときは表示しない。

### 設計判断

- **なぜ `battle-gaman-status` をそのまま残したか**: v0.16.1 から安定動作しており、触る必要がない。`battle-status-badges` は「守り効果」と「うたうチャンス」に特化した別エリアとして追加し、両者は独立して動作する。
- **`updateBattleStatusBadges()` を `updateBattlePlayerStatus()` の末尾に置いた理由**: `updateBattlePlayerStatus` は HP 変化のほぼ全タイミングで呼ばれるため、ここに置くだけで戦闘中の大半の状態変化をカバーできる。`battleDamageReduction` のセット直後（`runCompanionSpecialAction` の guard 系）だけは `updateBattlePlayerStatus` が呼ばれないため、そこだけ明示的に追加呼び出しした。
- **`clearCompanionCommandState()` への追加**: 戦闘終了時に `battleDamageReduction = 0` の直後でバッジを消す。`finishBattle()` が直後に battle-screen を hide するので実際には見えないが、DOM を常にクリーンな状態に保つ設計として追加。

---

## v0.33.1 (2026-07-12)

### 追加・変更

- **`runCompanionAutoCommand()` ログ2行化 (§92)**: `"🤝 name にまかせた！ → action"` を2行に分割。1行目は「まかせた」宣言、2行目は「○○を選んだ！」。`runCompanionSpecialAction()` が出す詳細ログとの二重感がなく、かつ special1/special2 の区別がプレイヤーに伝わる。
- **デバッグボタン3の変更 (§92)**: 旧: ハルミのみ + HP30%（プレイヤーHP低下テスト）。新: 仲間4人 + 敵HP10（`enemyHpLow`テスト）。`actuallyStartBattle()` 後に `state.enemy.hp = 10; renderEnemy();` を実行してセット。

### 設計判断

- **なぜデバッグボタン3を「敵HP10確認」に変えたか**: 旧の「ハルミHP30%確認」はハルミの `playerHpPct ≤ 0.40` 条件を試していた。しかしハルミのHP条件は 1つ目のデバッグボタン（全員・ランダム）でも確認できる。一方、`enemyHpLow`（敵HP≤15での全員攻撃優先シフト）を専用ボタンで試す手段がなかったため、3つ目をそちらに割り当てた。
- **なぜ `actuallyStartBattle` 後に `state.enemy.hp` を書き換えるか**: バトル開始時に敵HPがリセットされるが、その直後に `state.enemy.hp = 10` とオーバーライドすることで、プレイヤーが「まかせる」を押した時点で `enemyHpLow` 判定が `true` になる。安全なパターン（`actuallyStartBattle` が内部でレンダリングを済ませた後で上書き）で、副作用なし。

---

## v0.33 (2026-07-12)

### 追加・変更

- **`runCompanionAutoCommand(cid)` 3択化 (§91)**: 旧: `specialChance` による 2 択（attack or special1）。新: `wA / wS1 / wS2` の 3 ウェイトを正規化して 3 択（attack / special1 / special2）。`Math.random()` の累積確率比較で選択し、`state.lastCompanionAutoAction[cid]` に `"attack"/"special1"/"special2"` を記録。
- **状況判断テーブル追加 (§91)**: 敵HP低い（≤15）→ 全員攻撃寄りシフト。harumi のみ HP% 条件も追加（≤40% で癒し最優先 / ≥85% で光増量）。
- **前回行動記憶の3択対応 (§91)**: `"special"` 値を `"special1"` として扱う後方互換処理を追加。ペナルティ(-0.10)後に正規化するため、残りのウェイトに自動再分配される。

### 設計判断

- **なぜ正規化方式にしたか**: 固定合計 1.0 のウェイトテーブルを手で調整するより、3 値を「大まかな比率」で書いて正規化した方が、将来 4 択に拡張する際も変更箇所が少ない。
- **なぜ `"special"` 後方互換を入れたか**: `lastCompanionAutoAction` は transient（戦闘ごとにリセット）なので実際には引き継がれないが、将来的にセーブ対象にする可能性を考え、古い値でも落ちないようにした。
- **`battleDamageReduction` との関係**: まかせる AI が special2（かばう / まもりの光）を選んだ場合、`runCompanionSpecialAction(cid, "second")` が `state.battleDamageReduction` をセットする。以降の `enemyTurn()` で適用 → 0 リセット、という既存フローに完全に乗る。新規の変更は不要だった。

---

## v0.32.1 (2026-07-12)

### 追加・変更

- **`showCompanionSpecialMenu()` ボタン無効化 (§90)**: s1/s2/sback のクリック直後に `querySelectorAll("button").forEach(disabled=true)` で全ボタンを無効化してから `classList.add("hidden")`。クリックとメニュー消滅の間に別ボタンを押される可能性を排除。
- **`actuallyStartBattle()` リセット追加 (§90)**: `finishBattle()` → `clearCompanionCommandState()` でリセットされるが、将来的に別の戦闘開始パスができた場合に備え、`state.battleDamageReduction = 0` を `actuallyStartBattle` 先頭にも追加。
- **軽減ログ変更 (§90)**: 「🛡️ ダメージが軽減された！」は技術的すぎるため「🛡️ 守りの効果でダメージが少し減った！」に変更。

### 設計判断

- **なぜ `sback` も disable したか**: 「戻る」連打で `showCompanionCommandForIdx` が二重に呼ばれても実害はないが、UI の一貫性のため同じ disable パターンで統一した。`showCompanionCommandForIdx` 内で `companionCommandLocked = false` が再設定されるので、戻る後のコマンド選択には影響しない。
- **`clearCompanionCommandState` は既に完全だった**: v0.32 時点で companionCommandQueue/Index/Active/Locked/lastCompanionAutoAction/battleDamageReduction/companion-command-menu/companion-special-menu の8項目全てがクリアされており、v0.32.1 での追加変更は不要だった。

---

## v0.32 (2026-07-12)

### 追加・変更

- **`showCompanionSpecialMenu(cid)` 新設 (§89)**: `companion-command-menu` を隠して `companion-special-menu` を表示する。1つ目 / 2つ目 / 戻る の3ボタン。「戻る」は `showCompanionCommandForIdx(state.companionCommandIndex)` を再呼び出し。
- **`runCompanionSpecialAction(cid, specialId)` 拡張 (§89)**: `specialId === "second"` のブランチを先頭に追加。既存の1つ目コマンドは `if (cid === "juritani") ...` ブロックで変更なし。
- **`state.battleDamageReduction` 追加 (§89)**: transient フラグ（セーブ対象外）。`clearCompanionCommandState()` でリセット。複数適用時は `Math.max` で高い方を採用。
- **`enemyTurn()` 軽減処理追加 (§89)**: 通常敵の `dmg` 確定直後に `if (state.battleDamageReduction)` チェック。`Math.floor(dmg * (1 - reduction))` で計算し最低1を保証。

### 設計判断

- **固有コマンドをサブメニュー方式にした理由**: 1つ目と2つ目をそのまま横に並べると3列になり、スマホ幅 480px でボタンが小さくなりすぎる。サブメニューにすることで各ボタンが十分な幅を確保できる。
- **「⭐ 固有」ラベルにした理由**: 元の「💥 会心の構え」等の長いラベルはサブメニューに移動したため、メインメニューでは「⭐ 固有」という短いラベルで統一した。
- **`executeCompanionCommand` から companion-special-menu を hide した理由**: s1/s2 クリック時に `companion-special-menu` を hide してから `executeCompanionCommand` を呼ぶが、念のため `executeCompanionCommand` 内でも `csMenu.classList.add("hidden")` を実行する。二重呼び出し安全。
- **究極ゴリラ戦で `battleDamageReduction` を無視した理由**: 究極ゴリラ戦では仲間コマンドが出ないため、かばう/まもりの光が発動する経路がない。ただし `!e.final` ガードを追加して明示的に除外した。

---

## v0.31.1 (2026-07-12)

### 追加・変更

- **`runCompanionAutoCommand()` 最終クランプ追加 (§88)**: 前回行動補正（±0.10）適用直後に `specialChance = Math.max(0, Math.min(1, specialChance))` を実行。状況判断が低い値（0.15）を設定し、さらに `"special"` 連続補正 `-0.10` が加算されると `0.05` になるが、今後の調整で 0 以下になっても安全な設計に変更。

### 設計判断

- **なぜ各ブランチのクランプを外したか**: 前回実装ではブランチごとに `Math.max/Math.min` をしていたが、全補正を合算したあとに一度だけクランプする方がコードが明確で安全。Math.max/Math.min のネストが減り読みやすくなる。

---

## v0.31 (2026-07-12)

### 追加・変更

- **`runCompanionAutoCommand()` 状況判断追加 (§87)**: 優先順位は「敵HP低 > ハルミHP判断 > 基本比率 > 前回補正」の順。状況に応じて `specialChance` をオーバーライドし、その後に前回行動補正（±0.10）を加算する。
- **`state.lastCompanionAutoAction` 追加 (§87)**: 仲間ごとの前回行動（"special" / "attack"）を戦闘中だけ記録する `{}` オブジェクト。transient でセーブ対象外。`clearCompanionCommandState()` で戦闘終了時にリセット。
- **`clearCompanionCommandState()` 更新 (§87)**: `state.lastCompanionAutoAction = {}` を追加。

### 設計判断

- **敵HP≤15 でハルミも攻撃優先にした理由**: 残りHP15以下でハルミが70%の確率で回復を選ぶと、回復してから攻撃するより回復を繰り返してとどめを刺せない事態が起きうる。敵HP低下時は全仲間が攻撃に集中させる方がゲームテンポが良い。
- **前回行動補正を±0.10 にした理由**: 状況判断ルールの大きな確率補正（90%、25%など）を上書きしないように軽い補正にした。あくまで「同じ行動の連続を緩和する」程度の影響にとどめる。
- **harumi のみ HP 判断をした理由**: シュリタニ・ノリオ・ジュリタニは攻撃/捕獲補助のみで、HP に応じた行動変化は意味をなさない。ハルミだけが回復役なので状況判断が有意義。

---

## v0.30 (2026-07-12)

### 追加・変更

- **`runCompanionAutoCommand()` 比率変更 (§86)**: `specialChance` を仲間別に設定。ジュリタニ0.55 / シュリタニ0.65 / ノリオ0.50 / ハルミ0.70。役割に合った比率にすることで「まかせる」の挙動に個性が出る。
- **`runCompanionSpecialAction()` 数値・ログ調整 (§86)**: 各仲間の固有コマンドを「アクション名1行 + 効果1行」の2行形式に統一。数値は上記 CHANGELOG 参照。
- **ハルミ HP満タン対応 (§86)**: `actual <= 0` の場合に「しかし、HPはすでに満タンだ。」を表示。「HPが 0 回復した！」という不自然なメッセージを回避。

### 設計判断

- **シュリタニのダメージをLv連動にした理由**: 固定1ダメージは後半になるほど「弱い」印象が強くなる。Lv連動にすることで序盤1、高レベル時3と自然に成長する。ただし上限3と控えめにして「捕獲サポート役」の本分を維持した。
- **ハルミ回復上限を30→25にした理由**: 「まかせる」で70%の確率で選ばれるため、回復量が高いと実質的に無限回復に近くなる。25にすることでHP管理の緊張感を残す。
- **ログ2行形式統一の理由**: 「アクション名 → 効果」が視覚的に分かれることで、仲間コマンドの結果が読みやすくなる。

---

## v0.29.1 (2026-07-12)

### 追加・変更

- **`runCompanionAutoCommand(cid)` 新設 (§85)**: まかせる専用の関数。`Math.random() < 0.5` で通常攻撃（`runSingleCompanionAction`）または固有コマンド（`runCompanionSpecialAction`）をランダム選択。選択前に `"🤝 [名前]にまかせた！ → [行動名]"` をログ出力し、ユーザーが何が起きたか分かるようにした。
- **`executeCompanionCommand()` 変更 (§85)**: `mode === "auto"` を `runCompanionAutoCommand()` に委譲。以前は `runSingleCompanionAction()` を直呼びしていたため「まかせる」=「たたかう」の状態だった。

### 設計判断

- **50/50 均等確率を採用した理由**: 仲間別比率も検討したが、まず均等で安定させてから v0.30 でバランス調整する方が安全。
- **ログを「まかせる→行動名」の1行にした理由**: 2行目で各行動の固有ログが続くため、先頭ログは短くても意図が分かる。ログが渋滞しにくい。
- **`runCompanionAutoCommand` 内でも早期ガードを追加した理由**: `executeCompanionCommand` で既にチェックしているが、直接呼び出されるケースを考慮して二重に守る。

---

## v0.29 (2026-07-12)

### 追加・変更

- **`runCompanionSpecialAction(cid)` 新設 (§84)**: 仲間固有コマンドを実行する関数。`runSingleCompanionAction()` とは分離した独立関数。返値 true=敵HP0（ハルミは常に false）。
- **`showCompanionCommandForIdx()` 変更 (§84)**: 2択から3択へ拡張。`specialLabel` を仲間IDで分岐して取得。`<p>` タグと `btn-companion-auto` に `grid-column:1/-1` を追加してスマホUIを整理。`btn-companion-special` のonclick追加。
- **`executeCompanionCommand()` 変更 (§84)**: `sBtn (btn-companion-special)` の disable 処理を追加。`mode === "special"` 分岐で `runCompanionSpecialAction()` を呼び出す。
- **デバッグボタン追加 (§84)**: 「固有コマンドテスト（仲間4人+のらいぬ）」「ハルミ回復確認（HP40%+のらいぬ）」を debug=1 に追加。

### 設計判断

- **`runSingleCompanionAction()` を変更しない理由**: たたかう/まかせるが共有するため、変更するとどちらの行動かが曖昧になる。固有コマンドは完全に別関数で管理。
- **ハルミが `return false` 固定の理由**: 敵にダメージを与えないため、`e.hp <= 0` になることはない。winBattle() への誤接続を防ぐ。
- **グリッドレイアウトの選択**: `grid-column:1/-1` を `p` タグと「まかせる」ボタンに付けることで、2列グリッドのまま「たたかう / 固有コマンド」が1行目、「まかせる（全幅）」が2行目に収まる。3列グリッドへの変更より変更量が最小。

---

## v0.28.1 (2026-07-12)

### 追加・変更

- **`setBattleLocked()` セレクター変更 (§83)**: `.submenu:not(#companion-command-menu) button` にすることで、`companion-command-menu` のボタンを `setBattleLocked(true)` の影響外に置いた。v0.28 の `disabled=false` 上書きハックが不要になった。
- **`clearCompanionCommandState()` 新設 (§83)**: `companionCommandQueue/Index/Active/Locked` のリセットと `companion-command-menu` の非表示を1か所に集約。`finishBattle()` から呼ばれる。
- **`state.companionCommandActive/Locked` 追加 (§83)**: `Active` はコマンドフェーズ中フラグ、`Locked` は仲間1人分のターン内二重押しガード。どちらも transient でセーブ対象外。
- **`executeCompanionCommand()` ガード追加 (§83)**: 先頭に `if (state.companionCommandLocked) return; state.companionCommandLocked = true;` を追加。ボタン disabled と二重で二重実行を防止。

### 設計判断

- **`disabled=false` 上書き廃止**: v0.28 では `showCompanionCommandForIdx()` 内で明示的に `disabled=false` を呼んでいたが、`setBattleLocked` のセレクターを修正することで不要になった。`companion-command-menu` のボタンは `state.companionCommandLocked` によってのみ制御される。
- **二重ガードの理由**: `disabled=true` はUIレイヤーの防止であり、JS コールバック経由の二重実行は防げない。`companionCommandLocked` フラグで JS ロジックレベルで確実に1度だけ実行することを保証する。

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
