# CREDITS — 素材のクレジット

## 楽器サンプル（ゲームセンター「🎹 メロディくずし」）

`samples/` フォルダの楽器音は、次の音源から作成しています。

- 音源: **FluidR3_GM** — 作者 Frank Wen
- 変換元: [gleitz/midi-js-soundfonts](https://github.com/gleitz/midi-js-soundfonts)（FluidR3_GM を MP3 に書き出したもの）
- ライセンス: [Creative Commons Attribution 3.0（CC BY 3.0）](https://creativecommons.org/licenses/by/3.0/)
- 変更点: 16音色を選び、各音色から C2〜C7 の長3度おき16音だけを抜き出して JavaScript ファイルにまとめた。ゲーム内では再生速度を変えて間の音程を作り、モノラル化・短く切って再生している

収録音色: Acoustic Grand Piano / Electric Piano 1 / Celesta / Vibraphone / Marimba / Acoustic Guitar (nylon) / Acoustic Guitar (steel) / Acoustic Bass / Violin / Orchestral Harp / String Ensemble 1 / Choir Aahs / Trumpet / Alto Sax / Flute / Koto

## ドラムのサンプル（ゲームセンター「🥁 ゴリラドラム」・シーケンサーのドラム）

`samples/drums_virtuosity.js` の生ドラムの音は、次の音源から作成しています。

- 音源: **Virtuosity Drums** — Versilian Studios・Karoryfer Samples（ボストンの Virtuosity Musical Instruments で収録）
- 配布元: [sfzinstruments/virtuosity_drums](https://github.com/sfzinstruments/virtuosity_drums)
- ライセンス: [CC0 1.0（パブリックドメイン）](https://creativecommons.org/publicdomain/zero/1.0/) — クレジットの表記は必要ないが、出どころとして記す
- 変更点: 「mid」マイクの音から9つ（キック・スネア・クロススティック・ハイハット（クローズ/オープン）・タム（高）・フロアタム・クラッシュ・ライド）を1つずつ選び、モノラル 22050Hz・16bit に変換し、頭をそろえて短く切ってフェードをつけ、音量をそろえて JavaScript ファイルにまとめた。タム（中）などは近い太鼓の高さを変えて鳴らしている
