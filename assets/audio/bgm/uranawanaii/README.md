# assets/audio/bgm/uranawanaii/ — BGM音源格納フォルダ

## このフォルダの用途

究極ゴリラ ULTIMATE GORILLA の BGM 音源ファイル（uranawanaii）を格納するフォルダです。
v0.52.1 で実際の BGM ファイル再生基盤を実装する際に参照されます。

## コピーする音源ファイル一覧

以下のファイルをこのフォルダに配置してください。

| ファイル名 | BGM cue | 使用場面 |
|---|---|---|
| `uranawanaii_field.mp3` | `field` | 通常フィールド（ゲームクリア前） |
| `uranawanaii_field_clear.mp3` | `fieldClear` | フィールド（ゲームクリア後） |
| `uranawanaii_battle.mp3` | `battle` | 全戦闘（通常戦闘・ボス戦共通） |
| `uranawanaii_ending.mp3` | `ending` | エンディング（5ページ演出中） |

### 最小構成（3ファイルで代用する場合）

field と fieldClear を同じ音源で代用する場合:

| ファイル名 | BGM cue | 備考 |
|---|---|---|
| `uranawanaii_field.mp3` | `field` + `fieldClear` 兼用 | v0.52.1の実装時に cue 名を共用にする |
| `uranawanaii_battle.mp3` | `battle` | |
| `uranawanaii_ending.mp3` | `ending` | |

## ファイル形式

- **Web 配信用: MP3（推奨）**
  - エンコード設定: 192kbps / 44.1kHz / stereo / CBR or VBR
  - 理由: iOS Safari / Android Chrome / PC 全ブラウザで対応済み
- 任意フォールバック: OGG Vorbis（今回は用意しなくてよい）
- 制作マスター: WAV 24bit 44.1kHz stereo（このフォルダには置かない）

## ループ要件

- **シームレスループ必須**: ファイルの末尾と先頭がつながるよう編集する
- 末尾の無音を除去すること（DAW でのバウンス時に生じる余白無音）
- フェードアウトは入れないこと（プログラム側でのフェード処理と干渉する）
- ループポイントはファイル先頭から末尾まで全体をループする設計（intro+loop 分割は v0.52.1 では非対応）

## 音量目安

- ラウドネス: **-16 LUFS 〜 -14 LUFS**（ゲームBGM推奨範囲）
- True Peak: **-1 dBTP 以下**
- 現行の Web Audio API 生成 BGM の vol 設定 (0.05〜0.06) と釣り合う音量を目安にする

## 容量目安

| ファイル | 目安 |
|---|---|
| `uranawanaii_field.mp3` | 2〜5 MB |
| `uranawanaii_field_clear.mp3` | 2〜5 MB |
| `uranawanaii_battle.mp3` | 1〜4 MB |
| `uranawanaii_ending.mp3` | 3〜6 MB |
| 合計 | 8〜20 MB |

Git LFS は不要（ファイルサイズが上記範囲であれば通常の git で管理可能）。

## マスター音源は置かないこと

- WAV / AIFF 等のマスター音源はこのフォルダに置かない
- マスターは制作環境のローカルにのみ保管する
- GitHub にプッシュするのは MP3 のみ

## 音源格納後の確認方法

以下の PowerShell コマンドで配置確認できます：

```powershell
Get-ChildItem "C:\projects\ultimate-gorilla\assets\audio\bgm\uranawanaii" | Select-Object Name, @{N='Size(MB)';E={[math]::Round($_.Length/1MB,2)}}
```

配置後は Claude Code に以下のように伝えてください：

```
指定フォルダへ全音源を配置しました
```

v0.59 (§140) で BGM 再生基盤（HTMLAudioElement による再生）を実装済み。4ファイルすべてGit管理対象。
