# BGM_ASSET_GUIDE.md — 究極ゴリラ BGM音源仕様ガイド

**対象バージョン**: v0.52 (§132)
**作成日**: 2026-08-02
**更新者**: Claude Code

このドキュメントは、外部楽曲「uranawanaii」をゲームに組み込むための完全な仕様書です。
v0.52（本ドキュメント作成・フォルダ準備）→ v0.52.1（実際のBGM接続実装）の2段階で進めます。

---

## 1. 現行BGM構造

### BGM方式

**方式 A: JavaScript生成音（Web Audio API + OscillatorNode）のみ**

- 外部音源ファイル（mp3/ogg/wav）は一切使用していない
- HTMLAudioElement は使用していない
- AudioContext + OscillatorNode + GainNode で音符を逐次生成してループ再生する
- 実装ファイル: `script.js` のみ（line 13770付近の `BGM_DATA` 変数 〜 `_scheduleBGMLoop()` 関数）

### 使用API

```
AudioContext (window.AudioContext || window.webkitAudioContext)
OscillatorNode.createOscillator()
GainNode.createGain()
AudioNode.connect() / disconnect()
AudioParam.setValueAtTime() / exponentialRampToValueAtTime() / cancelScheduledValues()
OscillatorNode.start(t) / stop(t + dur)
```

---

## 2. BGM cue一覧

| cue名 | 使用場面 | waveType | vol | ループ秒数 | 開始関数 | 停止関数 |
|---|---|---|---|---|---|---|
| `field` | 通常フィールド（クリア前） | square | 0.05 | 約8秒 | `updateBGM("field")` | `stopBGMHard()` |
| `fieldClear` | フィールド（クリア後） | triangle | 0.05 | 約7.75秒 | `updateBGM("fieldClear")` | `stopBGMHard()` |
| `battle` | 全戦闘（通常・ボス共通） | square | 0.06 | 約6.4秒 | `updateBGM("battle")` | `stopBGMHard()` |
| `ending` | エンディング演出中 | sine | 0.06 | 約12秒 | `updateBGM("ending")` | `stopBGMHard()` |

### BGM切替トリガー（コード上の呼び出し箇所）

| イベント | 関数 | 呼び出し |
|---|---|---|
| Dパッド押下 | `bindDpadHold()` → pointerdown | `updateBGM(getFieldBgmType())` |
| キーボード矢印キー | keydown handler | `updateBGM(getFieldBgmType())` |
| 戦闘開始 | `actuallyStartBattle()` | `updateBGM("battle")` |
| 戦闘終了 | `finishBattle()` | `updateBGM(getFieldBgmType())` |
| エンディング開始 | `openEndingModal()` | `updateBGM("ending")` |
| エンディング終了（「冒険を続ける」） | btn-ending-next handler | `updateBGM(getFieldBgmType())` |
| BGMトグルON | btn-toggle-bgm handler | `updateBGM(getFieldBgmType())` |
| BGMトグルOFF | btn-toggle-bgm handler | `stopBGM()` = `stopBGMHard()` |

### getFieldBgmType() の動作

```javascript
function getFieldBgmType() {
  return (state && state.gameCleared) ? "fieldClear" : "field";
}
```

- `state.gameCleared = false` → `"field"`
- `state.gameCleared = true` → `"fieldClear"`

### 注意事項

- **サイドマップ（ステージ1〜6）専用BGMは存在しない**
  - ステージ内でもフィールドBGMまたはバトルBGMのみが使われる
- **ボス戦は通常バトルBGMと同一のcue**（ボス専用BGMなし）
- `updateBGM(type)` は既に同じtypeが再生中なら何もしない（重複なし）

---

## 3. stopBGMHard() 仕様

`script.js` line 13839 付近に定義。

```
stopBGMHard() の停止処理（順番通りに実行）:
1. bgmSessionId++       — 旧ループの setTimeout コールバックを無効化
2. bgmGeneration++      — 旧 _scheduleBGMLoop の世代チェックを失敗させる
3. bgmStopFlag = true   — ループ継続チェックを失敗させる
4. bgmCurrentType = null
5. activeBgmTimers 全件 clearTimeout → activeBgmTimers = []
6. bgmSchedulerId = null
7. activeBgmNodes 全件:
   - gain.gain.cancelScheduledValues(_now)
   - gain.gain.setValueAtTime(0, _now)  — 即消音
   - gain.disconnect()
   - osc.disconnect()
   ※ osc.stop() は呼ばない（osc.stop(t+dur)で予約済みのため二重呼び出し禁止）
8. activeBgmNodes = []
9. bgmMasterGain がある場合:
   - bgmMasterGain.gain.cancelScheduledValues(_now)
   - bgmMasterGain.gain.setValueAtTime(0, _now)
   - bgmMasterGain.disconnect()
   - bgmMasterGain = null
```

### 通常 stopBGM() との違い

v0.8.6.3 以降、`stopBGM()` は `stopBGMHard()` の後方互換エイリアスです。
機能上の差異はありません。既存の呼び出し箇所は `stopBGM()` のまま動作します。

---

## 4. BGMセッション仕様

- **変数**: `var bgmSessionId = 0;`
- **型**: 整数（単調増加カウンタ）
- **増加タイミング**: `stopBGMHard()` の先頭で `bgmSessionId++`
- **用途**: `_scheduleBGMLoop` が生成する setTimeout コールバック内でセッションIDを照合し、古いセッションのコールバックを即座に棄却する

```
startBGM(type)
  → stopBGMHard()  — bgmSessionId++
  → _scheduleBGMLoop(type, ..., session)
       setTimeout( function() {
         if (capturedSession !== bgmSessionId) return;  // 旧セッションなら棄却
         ...次ループをスケジュール...
       }, delayMs)
```

---

## 5. BGMタイマー仕様

- **変数**: `var activeBgmTimers = [];`
- **型**: setTimeout ID の配列
- **登録タイミング**: `_scheduleBGMLoop` の末尾で `activeBgmTimers.push(timerId)`
- **削除タイミング**:
  - コールバック実行時: `activeBgmTimers.splice(k, 1)` で自己削除
  - `stopBGMHard()`: 全件 `clearTimeout` → `activeBgmTimers = []`
- **タイマー間隔計算**:
  ```
  loopDur = 全音符の dur の合計
  delayMs = Math.max(100, (loopDur - 0.15) * 1000)
  ```
  ※ ループが終わる0.15秒前に次ループをスケジュールしてシームレスにつなぐ

---

## 6. BGMノード仕様

- **変数**: `var activeBgmNodes = [];` — `{osc, gain}` ペアの配列
- **生成**: `BGM_DATA[type].notes` の各音符（freq > 0）ごとに生成

```
接続グラフ:
OscillatorNode (osc)
  → GainNode (noteGain)  [音量エンベロープ: exponentialRampToValueAtTime]
    → GainNode (bgmMasterGain)  [マスター音量: setValueAtTime(1)]
      → AudioContext.destination
```

- `bgmMasterGain`: `getOrCreateBgmMasterGain()` で取得。`stopBGMHard()` で disconnect → null
- `noteGain.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.85)` — 音符の85%地点から自然減衰
- `osc.start(t)` / `osc.stop(t + dur)` でタイミングスケジュール済み

---

## 7. 最小構成（3ファイル）

| ファイル名 | BGM cue | 場面 |
|---|---|---|
| `uranawanaii_field.mp3` | `field` + `fieldClear` | 通常フィールド全般（クリア前後共通） |
| `uranawanaii_battle.mp3` | `battle` | 全戦闘 |
| `uranawanaii_ending.mp3` | `ending` | エンディング |

**合計: 3ファイル**

---

## 8. 推奨構成（4ファイル）

| ファイル名 | BGM cue | 場面 |
|---|---|---|
| `uranawanaii_field.mp3` | `field` | 通常フィールド（クリア前） |
| `uranawanaii_field_clear.mp3` | `fieldClear` | フィールド（クリア後） |
| `uranawanaii_battle.mp3` | `battle` | 全戦闘 |
| `uranawanaii_ending.mp3` | `ending` | エンディング |

**合計: 4ファイル**

クリア後に音楽的な変化を持たせたい場合は推奨構成を採用してください。
フィールド曲のアレンジ版として fieldClear を準備するのが理想的です。

---

## 9. 楽曲割当表

| 場面 | BGM cue | 対応ファイル（推奨構成） | 対応ファイル（最小構成） | ループ | 共用先 |
|---|---|---|---|---|---|
| 通常フィールド | `field` | `uranawanaii_field.mp3` | `uranawanaii_field.mp3` | 有 | — |
| クリア後フィールド | `fieldClear` | `uranawanaii_field_clear.mp3` | `uranawanaii_field.mp3` | 有 | field（最小構成時） |
| 全戦闘 | `battle` | `uranawanaii_battle.mp3` | `uranawanaii_battle.mp3` | 有 | — |
| エンディング | `ending` | `uranawanaii_ending.mp3` | `uranawanaii_ending.mp3` | 有 | — |

---

## 10. 正式格納先

### Windows パス（フルパス）

```
C:\projects\ultimate-gorilla\assets\audio\bgm\uranawanaii\
```

### GitHub Pages 相対パス（index.html 基準）

```
./assets/audio/bgm/uranawanaii/
```

---

## 11. 正式ファイル名全件（推奨構成）

```
uranawanaii_field.mp3
uranawanaii_field_clear.mp3
uranawanaii_battle.mp3
uranawanaii_ending.mp3
```

ファイル名は全て小文字・アンダースコア区切りで統一してください（スペース・大文字・日本語不可）。

---

## 12. 推奨Web形式

### MP3（推奨・第一候補）

- 対応ブラウザ: iOS Safari / Android Chrome / Chrome / Firefox / Edge — 全対応
- Web Audio API の `decodeAudioData()` で直接デコード可能
- ビットレート: **192kbps CBR** または **V2 VBR** 相当
- 理由: 最も広い互換性。このゲームはfile://直接起動とGitHub Pages両対応が必要なため、フォールバック不要な単一形式が最適

### OGG Vorbis（任意フォールバック）

- 今回は用意しなくてよい
- Chrome/Firefoxでは圧縮率が高いが、iOSが非対応のため必須ではない
- 将来的にアプリ配布やChrome特化最適化が必要になった場合に検討する

---

## 13. 制作マスター形式

- **形式**: WAV 24bit / 44.1kHz / Stereo
- このフォルダには置かない（GitHub には上げない）
- 制作環境のローカルに保管し、MP3 エンコード後にのみ本フォルダに配置する

---

## 14. 音源技術仕様

| 項目 | 値 |
|---|---|
| サンプルレート | 44.1kHz |
| ビットレート | 192kbps（MP3 CBR推奨） |
| チャンネル数 | Stereo（2ch） |
| LUFS（統合ラウドネス） | -16〜-14 LUFS |
| True Peak | -1 dBTP 以下 |

---

## 15. ループ編集要件

- **シームレスループ必須**: ファイルの先頭と末尾がつながるよう編集する
- **無音削除**: DAW でのバウンス時に生じる末尾の無音（サイレンス）は除去する
- **フェードアウト禁止**: ファイル末尾にフェードアウトを入れない（プログラム側でクロスフェードする場合を除く）
- **推奨ループ構造**: intro+loop 分割は v0.52.1 では非対応。ファイル全体を1ループとして扱う

---

## 16. intro+loop 方式の要否

v0.52.1 では対応しません。ファイル全体（先頭〜末尾）をシームレスにループします。

将来的に intro（一度だけ再生）+ loop（繰り返し）の2パート構成が必要になった場合は、
`AudioBuffer.loopStart / loopEnd` を使った実装で対応予定です。

---

## 17. 推奨曲長・容量

| 項目 | 推奨値 |
|---|---|
| 推奨曲長 | 1〜3分（60〜180秒）のループ素材 |
| 推奨ファイル容量 | 2〜5 MB / ファイル |
| 全BGM合計容量目安 | 8〜20 MB（4ファイル推奨構成） |

---

## 18. Git LFS 要否判断

- GitHub の単一ファイル制限: 100MB
- 今回の全BGM合計目安: 8〜20 MB
- **判断: Git LFS 不要**
  - 各ファイルが100MB未満であれば通常の `git add / commit / push` で管理可能
  - リポジトリの総容量が50MB以下を維持できる範囲
- 将来的に動画やSEを大量追加する場合は `.gitattributes` + Git LFS を検討する

---

## 19. Windows コピー手順

1. 制作した音源ファイルを以下のフォルダへコピーします:

```
C:\projects\ultimate-gorilla\assets\audio\bgm\uranawanaii\
```

2. PowerShell で配置確認:

```powershell
Get-ChildItem "C:\projects\ultimate-gorilla\assets\audio\bgm\uranawanaii" | Where-Object { $_.Extension -eq ".mp3" } | Select-Object Name, @{N='Size(MB)';E={[math]::Round($_.Length/1MB,2)}}
```

3. Claude Code に以下のように伝えます:

```
指定フォルダへ全音源を配置しました
```

---

## 20. 音源配置確認 PowerShell コマンド

```powershell
# ファイル存在確認
@("uranawanaii_field.mp3","uranawanaii_field_clear.mp3","uranawanaii_battle.mp3","uranawanaii_ending.mp3") | ForEach-Object {
  $path = "C:\projects\ultimate-gorilla\assets\audio\bgm\uranawanaii\$_"
  [PSCustomObject]@{ File=$_; Exists=(Test-Path $path); SizeMB=if(Test-Path $path){[math]::Round((Get-Item $path).Length/1MB,2)}else{"--"} }
}
```

---

## 21. スマホ自動再生制限と現状の対応

### 現行の対応

- `var soundEnabled = false;` がデフォルト（初回起動時は常にサウンドOFF）
- `loadSoundSettings()` で localStorage から設定を復元（前回ONにしていれば復元）
- BGM / SE は `!soundEnabled` の場合は即 `return`（何も鳴らない）
- ユーザーが設定画面の「🔊 サウンド: OFF」ボタンをタップしてONにした時点で初めて `initAudioContext()` が呼ばれる
- `initAudioContext()` はユーザー操作（タップ/クリック）に起因する関数チェーンの中で呼ばれる

### v0.52.1での注意事項

- HTMLAudioElement を使う場合も同様に、ユーザー操作後にのみ `audio.play()` を呼ぶこと
- `AudioContext.resume()` が必要な場合は、ユーザー操作のイベントハンドラ内で呼ぶこと
- `autoplay` 属性は使用しないこと

---

## 22. ページ非表示時の方針

- 現行コードには `visibilitychange` / `pagehide` / `beforeunload` イベントリスナーがない
- ページが非表示になった場合はブラウザが自動的に AudioContext を suspend する（Chrome 74以降の仕様）
- v0.52.1 でファイル再生を導入する際も、ページ非表示時の処理は明示的に実装しない方針
  - ブラウザのデフォルト挙動（自動 suspend）に委任する
  - 必要に応じて将来バージョンで `visibilitychange` + `audio.pause()` を追加できる

---

## 23. 音源読み込み失敗時のフォールバック方針

- **v0.52.1 での実装方針**: `HTMLAudioElement` の `onerror` または `AudioBuffer.decodeAudioData` の reject で検出
- **フォールバック**: 読み込みに失敗した場合は、現行の JavaScript 生成 BGM（`BGM_DATA`）に自動フォールバック
- ユーザーへの通知: エラートースト「BGMファイルの読み込みに失敗しました（内蔵BGMで代替）」を表示
- 404 エラー（ファイル未配置）でも同様にフォールバック

---

## 24. 権利確認欄

v0.52.1 で音源を実際に組み込む前に以下を確認してください。

| 確認項目 | 内容 |
|---|---|
| 楽曲名 | uranawanaii（ウラナワナイ）|
| 作詞 | （確認・記入してください） |
| 作曲 | （確認・記入してください） |
| 演奏 | （確認・記入してください） |
| 音源制作者 | （確認・記入してください） |
| ゲーム利用許可 | （確認・記入してください：許可あり / 作者本人 / など） |
| 配信・公開許可 | （確認・記入してください：GitHub Pages 公開可否） |
| 第三者素材の使用 | （確認・記入してください：サンプル / ループ素材等の使用有無） |
| JASRAC 信託状況 | （確認・記入してください：信託あり / 信託なし / 自己管理 / 不明） |
| 配信収益 | ゲーム自体は無料公開。将来的にキャプチャ動画等での配信有無を確認 |

---

## 25. 次回 v0.52.1 の実装内容

v0.52.1 で以下を実装します（BGMコードの変更はこの時に初めて行う）:

1. **音源プリロード**:
   - ゲーム起動時またはサウンドON時に `HTMLAudioElement` または `fetch + decodeAudioData` で音源を読み込む
   - 読み込み完了フラグ `bgmFileLoaded = { field: false, ... }` を管理

2. **BGMファイル再生基盤**:
   - `startBGM(type)` に分岐を追加: 音源ファイルが読み込まれていれば `audio.play()` を使用、未読み込みなら既存の `BGM_DATA` 生成音で代替

3. **ループ再生**:
   - `HTMLAudioElement` の場合: `audio.loop = true`
   - `AudioBuffer` の場合: `source.loop = true`

4. **bgm-manifest.example.json の本番化**:
   - `assets/audio/bgm/uranawanaii/bgm-manifest.json` として保存
   - `script.js` から fetch して cue → ファイル名の対応を読み込む（または定数として埋め込む）

5. **既存 `BGM_DATA` 生成BGMの位置づけ**:
   - ファイル再生が成功した場合は `BGM_DATA` 生成音を使わない
   - ファイル再生失敗時のフォールバックとして `BGM_DATA` 生成音を維持

---

## 26. 今回（v0.52）変更しなかったもの一覧

以下は v0.52 で一切変更していません:

- `script.js`: BGM再生コード全般（`stopBGMHard` / `startBGM` / `stopBGM` / `updateBGM` / `_scheduleBGMLoop` / `getOrCreateBgmMasterGain` / `getFieldBgmType` / `BGM_DATA` / `bgmSessionId` / `activeBgmNodes` / `activeBgmTimers` / `bgmMasterGain` / `bgmGeneration` / `bgmStopFlag` / `bgmCurrentType` / `initAudioContext`）
- `script.js`: SE再生コード（`playSE` / `SE_SPECS`）
- `script.js`: サウンド設定（`soundEnabled` / `bgmEnabled` / `seEnabled` / `loadSoundSettings` / `saveSoundSettings`）
- `index.html`: BGM関連の要素・モーダル・ボタン
- 既存BGMの挙動（フィールド/バトル/エンディング/クリア後フィールドの切替タイミング）
- ゲーム進行・マップ・敵・仲間・捕獲率・セーブデータ構造
- 通常URLでは `?debug=1` なしでデバッグメニューを表示しないこと
