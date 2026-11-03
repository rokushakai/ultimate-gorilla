# CREDITS — 素材のクレジット

## 楽器サンプル（ゲームセンター「🎹 メロディくずし」）

`samples/` フォルダの楽器音は、次の音源から作成しています。

- 音源: **FluidR3_GM** — 作者 Frank Wen
- 変換元: [gleitz/midi-js-soundfonts](https://github.com/gleitz/midi-js-soundfonts)（FluidR3_GM を MP3 に書き出したもの）
- ライセンス: [Creative Commons Attribution 3.0（CC BY 3.0）](https://creativecommons.org/licenses/by/3.0/)
- 変更点: 音色を選び、各音色から C2〜C7 の長3度おき16音だけを抜き出して JavaScript ファイルにまとめた。ゲーム内では再生速度を変えて間の音程を作り、モノラル化・短く切って再生している

収録音色: Acoustic Grand Piano / Electric Piano 1 / Celesta / Vibraphone / Marimba / Acoustic Guitar (nylon) / Acoustic Guitar (steel) / Acoustic Bass / Choir Aahs / Koto

ベース（v1.69〜。🎸 ゴリラベース・シーケンサーのベース）: Acoustic Bass / Electric Bass (finger) / Electric Bass (pick) / Fretless Bass / Slap Bass 1 / Slap Bass 2 / Synth Bass 1 / Synth Bass 2。ベースは C1〜C5 の短3度おき17音を抜き出した（同じ FluidR3_GM・CC BY 3.0。変更点も上と同じ）

エレキギター（v1.96〜。🤘 ゴリラギター）: Electric Guitar (jazz) / Electric Guitar (clean) / Electric Guitar (muted) / Overdriven Guitar / Distortion Guitar。C2〜C7 の長3度おき16音を抜き出した（同じ FluidR3_GM・CC BY 3.0。変更点も上と同じ）

ストリングス（v2.07〜。🎻 ゴリラストリングス）: String Ensemble 2。C1〜C7 の長3度おき19音を抜き出した（同じ FluidR3_GM・CC BY 3.0。変更点も上と同じ。v2.15 でほかの弦は下の VSCO 2 CE の録音に変えた）

管楽器（v2.12〜。🎺 ゴリラホーン）: Brass Section / Tenor Sax / Baritone Sax（v2.16 でほかの管楽器は VSCO 2 CE、v2.17 でアルト・ソプラノサックスはアイオワ大学の録音に変えた）。C1〜C7 の長3度おき19音を抜き出した（鳴らない高い音はのぞく。同じ FluidR3_GM・CC BY 3.0。変更点も上と同じ）

## 弦楽器の録音（v2.15〜。🎻 ゴリラストリングス・メロディくずし・シーケンサー）

`samples/vsco_*.js`（vsco_violin・vsco_viola・vsco_cello・vsco_contrabass・vsco_ens・vsco_trem・vsco_pizz・vsco_harp と、弱く弾いた録音の *_p）

- 音源: **VSCO 2 Community Edition** — Versilian Studios
- 配布元: [sgossner/VSCO-2-CE](https://github.com/sgossner/VSCO-2-CE)
- ライセンス: [CC0 1.0（パブリックドメイン）](https://creativecommons.org/publicdomain/zero/1.0/) — クレジットの表記は必要ないが、出どころとして記す
- 変更点: ソロバイオリン（ビブラート）・ビオラセクション・チェロセクション・ソロコントラバス・バイオリン/ビオラ/チェロのセクション（のばす・トレモロ・ピチカート）・ハープから、およそ短3度おきの音を選び、モノラル 22050Hz にして頭の無音を切り、2.7 秒（ピチカート 1.6 秒）に切ってフェードをつけ、音量をそろえ、のびている所をくり返せるようにクロスフェードして、MP3（56kbps）で JavaScript ファイルにまとめた。合奏・トレモロ・ピチカートは低い音をチェロ、まん中をビオラ、高い音をバイオリンのセクションでつないだ

管楽器（v2.16〜。🎺 ゴリラホーン・メロディくずし・シーケンサー）: `samples/vsco_trumpet`・`vsco_trombone`・`vsco_tuba`・`vsco_horn`・`vsco_oboe`・`vsco_bassoon`・`vsco_clarinet`・`vsco_flute`（と *_p）。同じ VSCO 2 Community Edition（CC0）の Trumpet / Tenor Trombone / Tuba / F Horn / Oboe / Bassoon / Clarinet / Flute ののばす録音から、上と同じように作った

## サックスの録音（v2.17〜。🎺 ゴリラホーン・メロディくずし・シーケンサー）

`samples/iowa_altosax.js`・`samples/iowa_sopsax.js`（と弱く吹いた録音の *_p）

- 音源: **University of Iowa Musical Instrument Samples（MIS）** — University of Iowa Electronic Music Studios
- 配布元: [theremin.music.uiowa.edu/MIS.html](https://theremin.music.uiowa.edu/MIS.html)
- 利用条件: 「may be downloaded and used for any projects, without restrictions」（どんな用途でも制限なく使ってよい）
- 変更点: Alto Saxophone / Soprano Saxophone のビブラートありの pp と ff の録音を、無音のところで1音ずつに切り分け、およそ短3度おきの音を選び、モノラル 22050Hz・2.4 秒に切ってフェードをつけ、音量をそろえ、のびている所をくり返せるようにクロスフェードして、MP3（56kbps）で JavaScript ファイルにまとめた

## ドラムのサンプル（ゲームセンター「🥁 ゴリラドラム」・シーケンサーのドラム）

### ロック: `samples/drums_drs.js`

- 音源: **DRSKit**（v1.0）— DrumGizmo チーム（Lars Muldjord・Bent Bisballe Nyeng）と DRSDrums の Jes Eiler。sfz 版の作成 kinwie
- 配布元: [sfzinstruments/DrumGizmo.DRSKit](https://github.com/sfzinstruments/DrumGizmo.DRSKit)
- ライセンス: [Creative Commons Attribution 4.0（CC BY 4.0）](https://creativecommons.org/licenses/by/4.0/)
- 変更点: キック・スネア・リム・ハイハット（クローズ/オープン）・タム3つ・クラッシュ・ライドから1打ずつ（強さの上から2割くらい）を選び、近くのマイクと天井のマイク（クラッシュは部屋のマイクも）を混ぜてモノラル 22050Hz・16bit にし、頭をそろえて短く切ってフェードをつけ、音量をそろえて JavaScript ファイルにまとめた

### ジャズ: `samples/drums_virtuosity.js`

`samples/drums_virtuosity.js` の生ドラムの音は、次の音源から作成しています。

- 音源: **Virtuosity Drums** — Versilian Studios・Karoryfer Samples（ボストンの Virtuosity Musical Instruments で収録）
- 配布元: [sfzinstruments/virtuosity_drums](https://github.com/sfzinstruments/virtuosity_drums)
- ライセンス: [CC0 1.0（パブリックドメイン）](https://creativecommons.org/publicdomain/zero/1.0/) — クレジットの表記は必要ないが、出どころとして記す
- 変更点: 「mid」マイクの音から9つ（キックは「kickmic」のマイクの音に mid を少し混ぜた）（キック・スネア・クロススティック・ハイハット（クローズ/オープン）・タム（高）・フロアタム・クラッシュ・ライド）を1つずつ選び、モノラル 22050Hz・16bit に変換し、頭をそろえて短く切ってフェードをつけ、音量をそろえて JavaScript ファイルにまとめた。タム（中）などは近い太鼓の高さを変えて鳴らしている

### ビンテージ・ブラシ: `samples/drums_rusty.js`・`samples/drums_brush.js`

- 音源: **Big Rusty Drums** — Karoryfer Samples
- 配布元: [sfzinstruments/karoryfer.big-rusty-drums](https://github.com/sfzinstruments/karoryfer.big-rusty-drums)
- ライセンス: [CC0 1.0（パブリックドメイン）](https://creativecommons.org/publicdomain/zero/1.0/) — クレジットの表記は必要ないが、出どころとして記す
- 変更点: キック（24"）・スネア（14"）・サイドスティック・ハイハット（クローズ/オープン）・タム（14"/15"/18"）・クラッシュ（17"）・ライド（22"）から1打ずつ（ビンテージはスティック、ブラシはブラシで叩いた音。強さは上から2番目くらい）を選び、近くのマイクと天井のマイクを混ぜてモノラル 22050Hz・16bit にし、頭をそろえて短く切ってフェードをつけ、音量をそろえて JavaScript ファイルにまとめた

### ルーム: `samples/drums_swirly.js`

- 音源: **Swirly Drums** — Karoryfer Samples（サイドスティックだけ Big Rusty Drums）
- 配布元: [sfzinstruments/karoryfer.swirly-drums](https://github.com/sfzinstruments/karoryfer.swirly-drums)
- ライセンス: [CC0 1.0（パブリックドメイン）](https://creativecommons.org/publicdomain/zero/1.0/) — クレジットの表記は必要ないが、出どころとして記す
- 変更点: キック・スネア・ハイハット（クローズ/オープン）・タム3つ・クラッシュ・ライドから1打ずつ選び、乾いた音と部屋の響きの音（wet）を混ぜてモノラル 22050Hz・16bit にし、頭をそろえて短く切ってフェードをつけ、音量をそろえて JavaScript ファイルにまとめた
