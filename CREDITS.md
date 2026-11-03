# CREDITS — 素材のクレジット

## 楽器サンプル（ゲームセンター「🎹 メロディくずし」）

`samples/` フォルダの楽器音は、次の音源から作成しています。

- 音源: **FluidR3_GM** — 作者 Frank Wen
- 変換元: [gleitz/midi-js-soundfonts](https://github.com/gleitz/midi-js-soundfonts)（FluidR3_GM を MP3 に書き出したもの）
- ライセンス: [Creative Commons Attribution 3.0（CC BY 3.0）](https://creativecommons.org/licenses/by/3.0/)
- 変更点: 音色を選び、各音色から C2〜C7 の長3度おき16音だけを抜き出して JavaScript ファイルにまとめた。ゲーム内では再生速度を変えて間の音程を作り、モノラル化・短く切って再生している

収録音色: Celesta / Vibraphone / Acoustic Guitar (nylon) / Acoustic Guitar (steel) / Acoustic Bass / Choir Aahs / Koto

ベース（v1.69〜。🎸 ゴリラベース・シーケンサーのベース）: Acoustic Bass / Electric Bass (finger) / Electric Bass (pick) / Fretless Bass / Slap Bass 1 / Slap Bass 2 / Synth Bass 1 / Synth Bass 2。ベースは C1〜C5 の短3度おき17音を抜き出した（同じ FluidR3_GM・CC BY 3.0。変更点も上と同じ）

エレキギター（v1.96〜。🤘 ゴリラギター）: Electric Guitar (jazz) / Electric Guitar (clean) / Electric Guitar (muted) / Overdriven Guitar / Distortion Guitar。C2〜C7 の長3度おき16音を抜き出した（同じ FluidR3_GM・CC BY 3.0。変更点も上と同じ）

ストリングス（v2.07〜v2.18。🎻 ゴリラストリングス）: v2.19 までにぜんぶ下の VSCO 2 CE の録音に変えた

管楽器（v2.12〜v2.17。🎺 ゴリラホーン）: v2.18 までにぜんぶ下の生の録音（VSCO 2 CE・アイオワ大学・MTG Solo Saxophones）に変えた

## 弦楽器の録音（v2.15〜。🎻 ゴリラストリングス・メロディくずし・シーケンサー）

`samples/vsco_*.js`（vsco_violin・vsco_viola・vsco_cello・vsco_contrabass・vsco_ens・vsco_trem・vsco_pizz・vsco_harp と、弱く弾いた録音の *_p）

- 音源: **VSCO 2 Community Edition** — Versilian Studios
- 配布元: [sgossner/VSCO-2-CE](https://github.com/sgossner/VSCO-2-CE)
- ライセンス: [CC0 1.0（パブリックドメイン）](https://creativecommons.org/publicdomain/zero/1.0/) — クレジットの表記は必要ないが、出どころとして記す
- 変更点: ソロバイオリン（ビブラート）・ビオラセクション・チェロセクション・ソロコントラバス・バイオリン/ビオラ/チェロのセクション（のばす・トレモロ・ピチカート）・ハープから、およそ短3度おきの音を選び、モノラル 22050Hz にして頭の無音を切り、2.7 秒（ピチカート 1.6 秒）に切ってフェードをつけ、音量をそろえ、のびている所をくり返せるようにクロスフェードして、MP3（56kbps）で JavaScript ファイルにまとめた。合奏・トレモロ・ピチカートは低い音をチェロ、まん中をビオラ、高い音をバイオリンのセクションでつないだ

管楽器（v2.16〜。🎺 ゴリラホーン・メロディくずし・シーケンサー）: `samples/vsco_trumpet`・`vsco_trombone`・`vsco_tuba`・`vsco_horn`・`vsco_oboe`・`vsco_bassoon`・`vsco_clarinet`・`vsco_flute`（と *_p）。同じ VSCO 2 Community Edition（CC0）の Trumpet / Tenor Trombone / Tuba / F Horn / Oboe / Bassoon / Clarinet / Flute ののばす録音から、上と同じように作った。ブラスセクション `samples/vsco_brass`（と _p）は、このトランペット（2本）・F ホルン・テナートロンボーン（2本）の録音を、音ごとに少し高さと時間をずらして重ね、のびている所の大きさをそろえて作った

## アップライトピアノ・パイプオルガン・鉄琴・木琴の録音（v2.22〜）

`samples/vsco_piano.js`・`vsco_organ.js`・`vsco_marimba.js`・`vsco_xylo.js`・`vsco_glock.js`

- 音源: **VSCO 2 Community Edition** — Versilian Studios（Upright Piano・Organ は Ivy Audio の Simon Dalzell による録音）
- 配布元: [sgossner/VSCO-2-CE](https://github.com/sgossner/VSCO-2-CE)
- ライセンス: [CC0 1.0（パブリックドメイン）](https://creativecommons.org/publicdomain/zero/1.0/) — クレジットの表記は必要ないが、出どころとして記す（ピアノとオルガンは元の作者と Versilian Studios の表記が勧められている）
- 変更点: Upright Piano（まん中の強さ）・Organ（Loud の手鍵盤）・Marimba・Xylophone・Glockenspiel から音を選び、モノラル 22050Hz にして頭の無音を切り、短く切ってフェードをつけ（オルガンはのびている所をくり返せるようにクロスフェード）、音量をそろえて、MP3（56kbps）で JavaScript ファイルにまとめた

## グランドピアノの録音（v2.27〜。🎹 ゴリラピアノ・メロディくずし・シーケンサー）

`samples/sal_grand.js`

- 音源: **Salamander Grand Piano V3** — Alexander Holm（sfz 版: kinwie）
- 配布元: [sfzinstruments/SalamanderGrandPiano](https://github.com/sfzinstruments/SalamanderGrandPiano)（元: [archive.org](https://archive.org/details/SalamanderGrandPianoV3)）
- ライセンス: [Creative Commons Attribution 3.0（CC BY 3.0）](https://creativecommons.org/licenses/by/3.0/)
- 変更点: 16段階の強さのうち v10 の録音を A0〜C8 の短3度おき30音選び、モノラル 22050Hz にして頭の無音を切り、3.5 秒に切ってフェードをつけ、音量をそろえて、MP3（56kbps）で JavaScript ファイルにまとめた

## エレピの録音（v2.27〜。🎹 ゴリラピアノ・メロディくずし・シーケンサー）

`samples/gs_wurli.js`・`gs_cp80.js`

- 音源: **GregSullivan E-Pianos**（Wurlitzer EP200・Yamaha CP80）— Greg Sullivan（sfz 版: kinwie）
- 配布元: [sfzinstruments/GregSullivan.E-Pianos](https://github.com/sfzinstruments/GregSullivan.E-Pianos)
- ライセンス: [Creative Commons Attribution 3.0（CC BY 3.0）](https://creativecommons.org/licenses/by/3.0/)
- 変更点: Wurlitzer EP200 は f の録音（ない音は ff・mp・pp）から16音、sfz の音程の直しをかけて、CP80 は F の録音から16音を選び、モノラル 22050Hz にして頭の無音を切り、短く切ってフェードをつけ、音量をそろえて、MP3（56kbps）で JavaScript ファイルにまとめた

## サックスの録音（v2.17〜。🎺 ゴリラホーン・メロディくずし・シーケンサー）

`samples/iowa_altosax.js`・`samples/iowa_sopsax.js`（と弱く吹いた録音の *_p）

- 音源: **University of Iowa Musical Instrument Samples（MIS）** — University of Iowa Electronic Music Studios
- 配布元: [theremin.music.uiowa.edu/MIS.html](https://theremin.music.uiowa.edu/MIS.html)
- 利用条件: 「may be downloaded and used for any projects, without restrictions」（どんな用途でも制限なく使ってよい）
- 変更点: Alto Saxophone / Soprano Saxophone のビブラートありの pp と ff の録音を、無音のところで1音ずつに切り分け、およそ短3度おきの音を選び、モノラル 22050Hz・2.4 秒に切ってフェードをつけ、音量をそろえ、のびている所をくり返せるようにクロスフェードして、MP3（56kbps）で JavaScript ファイルにまとめた

## テナー・バリトンサックスの録音（v2.18〜。🎺 ゴリラホーン・メロディくずし・シーケンサー）

`samples/mtg_tenorsax.js`・`samples/mtg_barisax.js`（と弱く吹いた録音の *_p）

- 音源: **MTG Solo Saxophones** — 録音: MTG（Music Technology Group, Universitat Pompeu Fabra）の freesound.org のパック、SFZ 化: kinwie
- 配布元: [sfzinstruments/MTG.SoloSax](https://github.com/sfzinstruments/MTG.SoloSax)（元の録音: [freesound.org/people/MTG](https://freesound.org/people/MTG/)）
- ライセンス: [Creative Commons Attribution 4.0（CC BY 4.0）](https://creativecommons.org/licenses/by/4.0/)
- 変更点: Tenor Sax・Baritone Sax の p と f の録音から、およそ短3度おきの音を選び、SFZ の音程の補正（tune）を当ててモノラル 22050Hz・2.4 秒に切ってフェードをつけ、音量をそろえ、のびている所をくり返せるようにクロスフェードして、MP3（56kbps）で JavaScript ファイルにまとめた

## ウクレレの録音（v2.26〜。🪕 ゴリラウクレレ・メロディくずし・シーケンサー）

`samples/fs_ukulele.js`

- 音源: **Ukulele**（パック）— Sadiquecat（[freesound.org/people/Sadiquecat/packs/40584](https://freesound.org/people/Sadiquecat/packs/40584/)）
- ライセンス: [CC0 1.0（パブリックドメイン）](https://creativecommons.org/publicdomain/zero/1.0/) — クレジットの表記は必要ないが、出どころとして記す
- v2.30〜: `samples/fs_uke_concert.js`（同じパックの「Ukulele Old」の NT5 の録音。開放の C と 15 フレットは音程を直した）・`samples/fs_uke_tenor.js`（「Ukulele」の NT5 の録音）。v2.32 から、コンサート・テナーは低い響きを足し・高いほうをおだやかにし・余韻をのばす加工をしているも同じ作り方で作った
- 変更点: ソプラノウクレレの単音（「Ukulele OS_ (弦) Fret (フレット) ZoomH5XY」）から C4〜D6 の短3度おき10音を選び、freesound の試聴用 MP3 からモノラル 22050Hz にして頭の無音を切り、2.5 秒に切ってフェードをつけ、音量をそろえて、MP3（56kbps）で JavaScript ファイルにまとめた

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
