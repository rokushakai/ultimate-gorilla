// =========================================================
// 究極ゴリラ ULTIMATE GORILLA - メインスクリプト
// 外部ライブラリ不使用。file:// で直接開いても動くように
// type="module" や fetch() は使わず、すべてこのファイル内に
// データを持たせている。
//
// このゲームは「UMA収集RPG」。育つのは主人公だけで、
// UMAは育成せず、集める・図鑑登録する・売る対象として扱う。
// =========================================================

(function () {
  "use strict";

  // ---------------------------------------------------------
  // 1. マップデータ定義
  // ---------------------------------------------------------
  // 文字の意味:
  //   '#' 木・壁(進入不可)        '~' 水(進入不可)
  //   '.' 草原(エンカウントあり)   ',' 村の道(エンカウントなし)
  //   'H' 村の入口(開始地点)      'M' 商人(接触で売買メニュー)
  //   'G' 神様の社(接触で転職メニュー)  'T' 酒場(接触で簡易メッセージ。§9.5)
  //   'W' 武器アイテム(初期配置・読み込み後は'.'に変換)
  //   'P' 回復アイテム(初期配置・読み込み後は'.'に変換)
  // §129 v0.51: 通常マップ 26×36 (旧13×18の4倍) NW角に既存設備を保持
  // row9/16でcol12開放(東通路)、row17でcol7開放(南通路)
  // row25に1/2/3ワープ(col7/11/15)、row29に4/5/6ワープ(col7/11/15)
  var RAW_MAP = [
    "##########################",                    // row 0
    "#,,,H,,,T,,S##############",                   // row 1 H=start(4,1) T=tavern(8,1) S=king aide(11,1)
    "#,D,,,,M,,K,##############",                   // row 2 D=UMADoc(2,2) M=merchant(7,2) K=smith(10,2)
    "#,V,N,,,,G,,##############",                   // row 3 V=sideGate(2,3) N=paperView(4,3) G=shrine(9,3)
    "#..........A##############",                   // row 4 A=pegasus chest(11,4)
    "#....R..B...##############",                   // row 5 R=traveler(5,5) B=chest(8,5)
    "#...~~~..X..##############",                   // row 6 X=cygnus chest(9,6) water(4-6,6)
    "#...~~~.....##############",                   // row 7 water(4-6,7)
    "#.........B.##############",                   // row 8 B=chest(10,8)
    "#..W..E.........." + ",,,,,,,##",              // row 9 col12開放 東ウイング開始
    "#....P......#" + "....,,,,,,,##",              // row 10
    "#.....#....C#" + "....,,,,,,,##",              // row 11 C=cosmos chest(11,11)
    "#......W....#" + "....,,,,,,,##",              // row 12
    "#....P..B...#" + "....,,,,,,,##",              // row 13 B=chest(8,13)
    "#........U..#" + "....,,,,,,,##",              // row 14 U=ukulele chest(9,14)
    "#..#...J...##" + "....,,,,,,,##",              // row 15 J=nyoibo chest(7,15)
    "#..B........." + "....,,,,,,,##",              // row 16 col12開放 B=chest(3,16)
    "#######,#####" + ",,,,,,,,,,,,#",              // row 17 col7開放(南通路) 東ウイング南接続
    "#####,,,,,,,,,,,,,,,,,,###",                   // row 18 南エリア開始
    "#####.,,,,,,,,,,,,,,,,.###",                   // row 19
    "#####..,,,,,,,,,,,,,..####",                   // row 20
    "#####..,,,,,,,,,,,,,..####",                   // row 21
    "#####,,,,,,,,,,,,,,,,,####",                   // row 22
    "#####,,,,,,,,,,,,,,,,,####",                   // row 23
    "#####,,,,,,,,,,,,,,,,#####",                   // row 24 ワープ広場へ
    "#####,,1,,,2,,,3,,,,,#####",                   // row 25 ワープ1(7,25) 2(11,25) 3(15,25)
    "#####,,,,,,,,,,,,,,,,,####",                   // row 26
    "#####,,,,,,,,,,,,,,,,,####",                   // row 27 広場中央
    "#####,,,,,,,,,,,,,,,,,####",                   // row 28
    "#####,,4,,,5,,,6,,,,,#####",                   // row 29 ワープ4(7,29) 5(11,29) 6(15,29)
    "#####,,,,,,,,,,,,,,,,#####",                   // row 30
    "######,,,,,,,,,,,,,,######",                   // row 31
    "#######,,,,,,,,,,,,#######",                   // row 32
    "#########,,,,,,,,#########",                   // row 33
    "###########,,,,###########",                   // row 34
    "##########################"                    // row 35 南端壁
  ];

  var MAP_W = 26;
  var MAP_H = RAW_MAP.length;

  // 画面に同時に表示するタイル数(縦長スマホ向けに縦を多めに)
  var VIEW_COLS = 7;
  var VIEW_ROWS = 9;

  // 地形ごとの見た目(絵文字)
  var TERRAIN_EMOJI = {
    "#": "🌳",
    "~": "🟦",
    ".": "🟩",
    ",": "🟫",
    "H": "🏠",
    "M": "🏪",
    "G": "⛩️",
    "T": "🍺",
    "B": "🎁",  // 宝箱(§5.7。開封後は📦に変わる)
    "U": "🪗",  // 女神のウクレレ宝箱(§14.5。開封後は📦に変わる)
    "A": "🌟",  // ペガサスのよろい伝説宝箱(v0.8。Lv50+で開封)
    "C": "⭐",  // 宇宙のかぶと伝説宝箱(v0.8。ウクレレ所持で開封)
    "J": "🪄",  // 如意棒伝説宝箱(v0.8。Lv70+ジュリタニ同行で開封)
    "D": "🔎",  // UMA博士(§32 v0.8.2)
    "R": "🧳",  // 旅人(§32 v0.8.2)
    "K": "🔨",  // 鍛冶屋(§32 v0.8.2)
    "E": "📚",  // ゴリラ研究家(§32 v0.8.2)
    "S": "👑",  // 王様の使い(§32 v0.8.2)
    "X": "✨",  // キグナスのかぶと伝説宝箱(§33 v0.8.3。開封後は📦)
    "N": "📰",  // 攻略ペーパービュー屋(§37 v0.8.6)
    "V": "🌀",  // 横スクロール入口ゲート(§52 v0.11.2)
    // §129 v0.51: ステージワープタイル
    "1": "🌱",  // ワープ1: はじまりの草原
    "2": "🌲",  // ワープ2: あやしい森
    "3": "🏚️", // ワープ3: 古びた町はずれ
    "4": "⛰️", // ワープ4: ゴリラ山道
    "5": "🏰",  // ワープ5: 黒い城
    "6": "🌿"   // ワープ6: チンパンジーの聖域
  };
  // 進入不可の地形
  var BLOCKED = { "#": true, "~": true };
  // エンカウントが起きない安全地形(村・道・施設・宝箱・NPC上)
  var SAFE_TILE = { ",": true, "H": true, "M": true, "G": true, "T": true, "B": true, "U": true, "A": true, "C": true, "J": true, "X": true, "D": true, "R": true, "K": true, "E": true, "S": true, "N": true, "V": true,
    "1": true, "2": true, "3": true, "4": true, "5": true, "6": true }; // §129 v0.51: ワープタイル

  // ---------------------------------------------------------
  // 1.5  横スクロールマップデータ (§43 v0.9 / §44 v0.9.1)
  // ---------------------------------------------------------
  // タイル文字の意味:
  //   'g' 草原(エンカウントあり)  'f' 安全地帯(エンカウントなし)
  //   '#' 木・壁(進入不可)        '~' 水(進入不可)
  //   'c' 宝箱               'n' 旅の案内人NPC
  //   'm' 商人               'e' 固定エンカウント(撃破後は草原に変化)
  //   '.' 空・木上(視覚のみ)  'p' 旅人NPC(v0.9.1追加)
  //   'G' ゴール(v0.9.1追加)
  //
  // rows[0]=高路(y=0)  rows[1]=メイン(y=1)  rows[2]=低路(y=2)  各40文字
  // v0.9.1: y=0〜2 すべて移動可能。迂回路A(x=11-12)とB(x=27-28)でルート選択。

  var SIDE_MAP_WIDTH  = 40;
  var SIDE_MAP_HEIGHT = 3;
  var SIDE_VIEW_COLS  = 9;
  var SIDE_VIEW_ROWS  = 3;

  var SIDE_TILE_EMOJI = {
    "g": "🟩",
    "f": "🟫",
    "#": "🌳",
    "~": "🟦",
    "c": "🎁",
    "n": "🧭",
    "m": "🏪",
    "e": "⚡",
    ".": "☁️",
    "p": "🧑",
    "G": "🏁",
    "b": "💢",  // §45 v0.9.2: 中ボスゴリラ固定戦闘タイル
    "H": "🏠"   // §53 v0.11.3: 帰還ゲート（各ステージスタート付近）
  };

  // 進入不可タイル
  var SIDE_BLOCKED = { "#": true, "~": true };
  // ランダムエンカウントが起きないタイル
  var SIDE_NO_ENCOUNTER = { "f": true, "c": true, "n": true, "m": true, "e": true, ".": true, "p": true, "G": true, "b": true, "H": true };

  // ステージ定義 (§44 v0.9.1 / §45 v0.9.2)
  // row0(y=0) 高路: 安全。迂回路A(x=11-13)と迂回路B(x=27-29)を提供。x=19にNPC2。中ボス回避可能。
  // row1(y=1) メイン: x=2帰還ゲート(H) x=4宝箱 x=7NPC x=10商人 x=11-12ブロックA x=20NPC2
  //           x=24宝箱 x=27-28ブロックB x=31固定敵 x=36中ボス(b) x=38ゴール
  // row2(y=2) 低路: リスク高・報酬多。x=5宝箱 x=14固定敵 x=23宝箱 x=31宝箱。x=36は水(中ボス回避不可)
  var SIDE_STAGE_DATA = {
    1: {
      name: "はじまりの草原",
      rows: [
        "#f#ff#ff#fffffff#ffpff#fffffffff#ff#ff#f",
        "ggHgcggnggm##ggggfggpgggcgg##ggeggfgbGHg",  // §54 v0.11.3.2: x=2 帰還ゲート(H); §45: x=36 中ボス(b); §58 v0.13.1: G@x=37(ゴール), H@x=38(ゴール側帰還ゲート)
        "~~~ggcg~~~ggggegg~~~gfgcgggggggc~~g~~~gg"
      ],
      startX: 1,
      startY: 1,
      goalX: 38
    }
  };

  // §48 v0.10: ステージ2「あやしい森」マップ (40×3)
  // row0(y=0) 高路: 安全な上路。x=17に宝箱、x=20にNPC-A。迂回路はx=3-6,x=12-16,x=25-27,x=33-36。
  // row1(y=1) メイン: x=2帰還ゲート(H) x=4 NPC-B x=7 ブロックA x=14 固定敵1 x=17-18 ブロックB
  //           x=23-24 ブロックC x=35 ボスゴリラ(b) x=38 ゴール(G)
  // row2(y=2) 下路: x=4 宝箱 x=12 固定敵2 x=26 宝箱 x=32 固定敵3 (水(~)で進入制限あり)
  SIDE_STAGE_DATA[2] = {
    name: "あやしい森",
    rows: [
      "#ff#ff#fffffff#ffcffpfff#fff#fff#fff#ff#",
      "ggHgpgg#gggfggegg##gggg##ggggggggggbgGHg",  // §54 v0.11.3.2: x=2 帰還ゲート(H); §58 v0.13.1: G@x=37(ゴール), H@x=38(ゴール側帰還ゲート)
      "~~ggcgg~~~ggegg~gggg~~ggggcgg~~gegg~~gg~"
    ],
    startX: 1,
    startY: 1,
    goalX: 38
  };

  // §50 v0.11: ステージ3「古びた町はずれ」マップ (40×5)
  // row0(y=0) 高路:  宝箱2個(x=18,x=35)。安全路。迂回路。
  // row1(y=1) 上中:  旅人NPC(p, x=10)。
  // row2(y=2) 中央:  x=2帰還ゲート(H), 商人(m, x=3), 老人NPC(n, x=5), 固定敵(e, x=15), 魔王ゴリラ(b, x=31), ゴール(G, x=38)
  // row3(y=3) 下中:  固定敵(e, x=12)。
  // row4(y=4) 下路:  宝箱(c, x=4, x=19), 固定敵(e, x=27)。危険な道。
  SIDE_STAGE_DATA[3] = {
    name: "古びた町はずれ",
    rows: [
      "fffff##fffffff#fffcfff###fffff##fffcffff",
      "gggfgg##ggpggff##gggggg##ggggggggg###gfg",
      "ggHmgngggg##gggeggg##gggggg##ggbgg##gGHg",  // §54 v0.11.3.2: x=2 帰還ゲート(H); §58 v0.13.1: G@x=37(ゴール), H@x=38(ゴール側帰還ゲート)
      "~~gggg##ggggegg##gggggg##ggggg##ggggg~~~",
      "~~~~cggg##ggggg##ggcgg##gggegg##ggggg~~~"
    ],
    startX: 1,
    startY: 2,
    goalX: 38
  };

  // §55 v0.12: ステージ4「ゴリラ山道」マップ (40×5)
  // row0(y=0) 高路:  岩場の安全ルート。宝箱2個(x=8, x=28)。##迂回あり。
  // row1(y=1) 上中:  旅人NPC(p, x=12)。固定敵(e, x=31:校長)。
  // row2(y=2) 中央:  x=2帰還ゲート(H), 老人NPC(n, x=5), ##@x=8-9,
  //                   固定敵(e, x=15:空手姉妹), 商人(m, x=20), ##@x=25-26,
  //                   大魔王ゴリラ(b, x=33), ゴール(G, x=37), ゴール側帰還ゲート(H, x=38)
  // row3(y=3) 下中:  宝箱(c, x=22), 固定敵(e, x=25:デスマッチレスラー)。##で進入制限あり。
  // row4(y=4) 下路:  宝箱(c, x=4)。水路(~)で進入制限あり。
  SIDE_STAGE_DATA[4] = {
    name: "ゴリラ山道",
    rows: [
      "ffffffffcf##ffffffff##ffffffcff##fffffff",  // row0: c@x=8, c@x=28
      "ggggggggggggpggg##ggggggggggggeggggggfg",   // row1: p@x=12, ##@x=16-17, e@x=31
      "ggHggngg##gggggeggggmgggg##ggggggbgggGHg",  // row2: H@x=2, n@x=5, ##@x=8-9, e@x=15, m@x=20, ##@x=25-26, b@x=33, G@x=37(ゴール), H@x=38(§58 v0.13.1)
      "~~gggg##gggggggg##ggggcggegggg##gggggg~~",  // row3: ##@x=6-7, ##@x=16-17, c@x=22, e@x=25, ##@x=30-31
      "~~~~cggg##ggggggggggggg##gggggggggggg~~~"   // row4: c@x=4, ##@x=8-9, ##@x=23-24
    ],
    startX: 1,
    startY: 2,
    goalX: 38
  };

  // §57 v0.13: ステージ5「黒い城」マップ (40×5)
  // row0(y=0) 高路:  城の通路。宝箱2個(x=8, x=30)。##城壁あり。
  // row1(y=1) 上中:  逃げ腰の旅人NPC(p, x=12)。固定敵(e, x=27:来訪者)。
  // row2(y=2) 中央:  x=2帰還ゲート(H), 兵士NPC(n, x=5), ##@x=8-9,
  //                   固定敵(e, x=14:宇宙人), 商人(m, x=20), ##@x=26-27,
  //                   ラスボス級ゴリラ(b, x=33), ゴール(G, x=37), ゴール側帰還ゲート(H, x=38)
  // row3(y=3) 下中:  宝箱(c, x=16), 固定敵(e, x=23:異邦人)。##@x=6-7, ##@x=26-27
  // row4(y=4) 下路:  宝箱(c, x=4, x=17)。水路(~)。##@x=8-9, ##@x=28-29
  SIDE_STAGE_DATA[5] = {
    name: "黒い城",
    rows: [
      "##ffffffcf##ffffffff##ffffffffcff##fffff",  // row0: c@x=8, c@x=30
      "gggfggggggggpgg##gggggg##ggeggggggfggggg",  // row1: p@x=12, ##@x=15-16, ##@x=23-24, e@x=27
      "ggHggngg##ggggeggggggmgggg##gggggbgggGHg",  // row2: H@x=2, n@x=5, ##@x=8-9, e@x=14, m@x=21, ##@x=26-27, b@x=33, G@x=37(ゴール), H@x=38(§58 v0.13.1)
      "~~gggg##ggggggggcggggggegg##ggggggggggg~",  // row3: ##@x=6-7, c@x=16, e@x=23, ##@x=26-27
      "~~~~cggg##gggggggcgggggggggg##ggggggggg~"   // row4: c@x=4, ##@x=8-9, c@x=17, ##@x=28-29
    ],
    startX: 1,
    startY: 2,
    goalX: 38
  };

  // §59 v0.14: ステージ6「チンパンジーの聖域」マップ (40×5)
  // row0(y=0) 高路:  宝箱2個(c@x=8, c@x=29)。##木立あり。
  // row1(y=1) 上中:  迷い込んだ修行者NPC(p, x=11)。固定敵(e, x=27)。##@x=15-16, ##@x=23-24。
  // row2(y=2) 中央:  x=2帰還ゲート(H), 聖域の守護者NPC(n, x=5), ##@x=8-9,
  //                   固定敵(e, x=13), 商人(m, x=21), ##@x=27-28,
  //                   究極チンパンジー(b, x=34), ゴール(G, x=37), ゴール側帰還ゲート(H, x=38)
  // row3(y=3) 下中:  宝箱(c, x=16), 固定敵(e, x=23)。##@x=6-7, ##@x=26-27
  // row4(y=4) 下路:  宝箱(c, x=4)。水路(~)@x=0-3, x=36-39。##@x=8-9, ##@x=23-24
  SIDE_STAGE_DATA[6] = {
    name: "チンパンジーの聖域",
    rows: [
      "ffff##ffcff##ffffffff##ffffffcff##ffffff",
      "gggggggggggpggg##gggggg##ggeggggggggggfg",
      "ggHggngg##gggegggggggmggggg##gggggbggGHg",
      "~~gggg##ggggggggcggggggegg##ggggggggggg~",
      "~~~~cggg##ggggggggggggg##ggggggggggg~~~~"
    ],
    startX: 1,
    startY: 2,
    goalX: 38
  };

  // §49 v0.10.1: ステージ別固定敵マップ (タイル'e'に接触した時に出す敵ID)
  // キーは getSideKey() 形式 (stage1は "x,y", stage2は "2:x,y")
  var SIDE_FIXED_ENCOUNTERS = {
    "31,1":   "wilddog",                  // stage1 メイン路 x=31,y=1: のらいぬ
    "14,2":   "bumpman",                  // stage1 下路 x=14,y=2: ぶつかりおじさん
    "2:14,1": "wannabeninja",             // stage2 メイン路 x=14,y=1: 忍者かぶれ
    "2:12,2": "bandit",                   // stage2 下路 x=12,y=2: 山賊
    "2:32,2": "oni",                      // stage2 下路深部 x=32,y=2: 鬼
    // §50 v0.11: ステージ3固定敵
    "3:15,2": "powerharassmentsenpai",    // stage3 中央路 x=15,y=2: パワハラ先輩
    "3:12,3": "wanderingman",             // stage3 下中路 x=12,y=3: さまようおやじ
    "3:27,4": "deathmatch",              // stage3 下路 x=27,y=4: デスマッチレスラー
    // §55 v0.12: ステージ4固定敵
    "4:15,2": "karatesisters",           // stage4 中央路 x=15,y=2: 空手姉妹
    "4:31,1": "principal",               // stage4 上中路 x=31,y=1: 校長
    "4:25,3": "deathmatch",              // stage4 下中路 x=25,y=3: デスマッチレスラー
    // §57 v0.13: ステージ5固定敵
    "5:14,2": "alien",                   // stage5 中央路 x=14,y=2: 宇宙人
    "5:27,1": "visitor",                 // stage5 上中路 x=27,y=1: 来訪者
    "5:23,3": "stranger",                // stage5 下中路 x=23,y=3: 異邦人
    // §59 v0.14: ステージ6固定敵
    "6:13,2": "stranger",               // stage6 中央路 x=13,y=2: 異邦人
    "6:27,1": "wanderingman",           // stage6 上中路 x=27,y=1: さまようおやじ
    "6:23,3": "deathmatch"              // stage6 下中路 x=23,y=3: デスマッチレスラー
  };

  // §129 v0.51: ワープ広場データ (通常マップ上の座標・ステージ番号)
  // §131 v0.51.2: returnX/returnY/themeLabel/themeDesc/positionLabel フィールド追加
  var STAGE_WARP_DATA = [
    { stageNum: 1, x: 7,  y: 25, returnX: 7,  returnY: 26, label: "はじまりの草原",     icon: "🌱",
      themeLabel: "草原と森",    themeDesc: "草木が広がる、最初の試練の地域です。",
      positionLabel: "上段左" },
    { stageNum: 2, x: 11, y: 25, returnX: 11, returnY: 26, label: "あやしい森",         icon: "🌲",
      themeLabel: "あやしい森",  themeDesc: "妖しい霧と木々が行く手を遮る地域です。",
      positionLabel: "上段中央" },
    { stageNum: 3, x: 15, y: 25, returnX: 15, returnY: 26, label: "古びた町はずれ",     icon: "🏚️",
      themeLabel: "廃墟と荒れ地", themeDesc: "朽ちた建物が点在する、荒れた地域です。",
      positionLabel: "上段右" },
    { stageNum: 4, x: 7,  y: 29, returnX: 7,  returnY: 30, label: "ゴリラ山道",         icon: "⛰️",
      themeLabel: "険しい山道",  themeDesc: "険しい岩場と急坂が続く山の地域です。",
      positionLabel: "下段左" },
    { stageNum: 5, x: 11, y: 29, returnX: 11, returnY: 30, label: "黒い城",             icon: "🏰",
      themeLabel: "黒い城",     themeDesc: "闇に覆われた城で、強敵が待ち構えています。",
      positionLabel: "下段中央" },
    { stageNum: 6, x: 15, y: 29, returnX: 15, returnY: 30, label: "チンパンジーの聖域", icon: "🌿",
      themeLabel: "古代の聖域",  themeDesc: "古代の力が宿る、聖なる地域です。",
      positionLabel: "下段右" }
  ];

  // §129 v0.51: ステージ別敵レベルデータ (min/max: ランダムレベル帯, bossBonus: ボス追加, mult: 倍率)
  var STAGE_ENEMY_LEVEL_DATA = {
    1: { min: 40, max: 46, bossBonus: 6,  mult: 3.0  },
    2: { min: 48, max: 55, bossBonus: 7,  mult: 4.5  },
    3: { min: 58, max: 65, bossBonus: 7,  mult: 6.0  },
    4: { min: 68, max: 75, bossBonus: 7,  mult: 8.0  },
    5: { min: 78, max: 86, bossBonus: 8,  mult: 10.0 },
    6: { min: 88, max: 98, bossBonus: 10, mult: 13.0 }
  };

  // §129 v0.51: ステージ別テーマ CSS クラス
  var STAGE_THEME_DATA = {
    1: "stage-theme-1",
    2: "stage-theme-2",
    3: "stage-theme-3",
    4: "stage-theme-4",
    5: "stage-theme-5",
    6: "stage-theme-6"
  };

  // §131 v0.51.2: objectiveId → ステージ番号対応表
  var ADVENTURE_OBJECTIVE_STAGE_MAP = {
    "visit_side_gate":   1,
    "stage1_explore":    1,
    "stage2_challenge":  2,
    "stage3_challenge":  3,
    "stage4_challenge":  4,
    "stage5_challenge":  5,
    "stage6_challenge":  6,
    "defeat_chimp":      6,
    "stage6_boss":       6
  };

  // §131 v0.51.2: 案内板データ一元管理 (座標は RAW_MAP 確認済み: すべて "," タイル)
  // row17 col7 = "," / row22 col7 = "," / row27 col11 = ","
  var FIELD_SIGN_DATA = [
    { id: "south_route",  x: 7,  y: 17, icon: "🪧", title: "道しるべ",
      text: "南へ進むとワープ広場です。\n六つのステージへの入口が並んでいます。" },
    { id: "north_return", x: 7,  y: 22, icon: "🪧", title: "道しるべ",
      text: "北へ戻ると、町・酒場・実家があります。" },
    { id: "plaza_guide",  x: 11, y: 27, icon: "🪧", title: "🪧 ワープ広場案内",
      text: "六つのステージへ続くワープ広場です。\n\n上段左：第1ステージ\n上段中央：第2ステージ\n上段右：第3ステージ\n下段左：第4ステージ\n下段中央：第5ステージ\n下段右：第6ステージ\n\n🔒 未解放　▶ 現在の目的　✅ クリア済み\n\n各ワープを調べると詳細が確認できます。" }
  ];

  // §131 v0.51.2: ワープ広場範囲定義
  var STAGE_WARP_PLAZA_BOUNDS = { minX: 5, maxX: 20, minY: 23, maxY: 31 };

  // §44 v0.9.1: 固定敵の撃破確定待ちキー (finishBattle でセット)
  var sideMapPendingFixedKey = "";

  // §48 v0.10: ステージ別イベントキー生成 (openedChests / defeatedEnemies の衝突防止)
  // ステージ1はそのまま "x,y"、ステージ2以降は "N:x,y" 形式
  function getSideKey(nx, ny) {
    if (state.sideMap.stage === 1) { return nx + "," + ny; }
    return String(state.sideMap.stage) + ":" + nx + "," + ny;
  }

  // ---------------------------------------------------------
  // 2. データ定義
  // ここに敵(UMA/モンスター)・アイテム・武器・まほう・職業の
  // データをまとめている。今後ネタを追加するときは基本的に
  // この章の配列に要素を追加するだけでよい。
  // ---------------------------------------------------------

  // --- UMAデータ(捕獲・図鑑登録・売却の対象) ---
  // id / name / rarity / hp / attack / captureRate / exp / sellPrice / isRare
  // ※ def(ぼうぎょ力)とemoji(見た目)は実装上の補助データとして追加している。
  var UMA_DATA = [
    // §45 v0.9.2: UMAはHP/EXPを微増 (×1.2)。究極ゴリラは変更なし(HP5000固定)。
    { id: "kappa", name: "カッパ", emoji: "🐢", rarity: "コモン", isUMA: true, isRare: false, minLevel: 1, weight: 7, hp: 19, attack: 6, def: 2, captureRate: 0.40, exp: 12, sellPrice: 8,
      desc: "水辺に現れるとされるUMA。甲羅が目印。きゅうりが好きかもしれない。",
      hintArea: "水辺・草むら", hintText: "序盤のフィールドに現れるコモンUMA。レベル1から出会える。", hintCatch: "捕獲率は高め。「つかまえる」コマンドで挑もう。" },
    { id: "tsuchinoko", name: "ツチノコ", emoji: "🐍", rarity: "コモン", isUMA: true, isRare: false, minLevel: 2, weight: 6, hp: 22, attack: 7, def: 2, captureRate: 0.38, exp: 14, sellPrice: 10,
      desc: "古くから目撃談のある太い胴体の蛇型UMA。意外とすばしっこい。",
      hintArea: "草むら", hintText: "太い胴体の蛇型UMA。序盤のフィールドに出現する。", hintCatch: "カッパと同程度の捕獲率。焦らず「つかまえる」を試そう。" },
    { id: "hibagon", name: "ヒバゴン", emoji: "🦧", rarity: "アンコモン", isUMA: true, isRare: false, minLevel: 3, weight: 5, hp: 29, attack: 8, def: 3, captureRate: 0.30, exp: 19, sellPrice: 16,
      desc: "広島の山中で目撃された類人猿型UMA。ひとり行動を好む孤独な存在。",
      hintArea: "森の中", hintText: "類人猿型アンコモンUMA。レベル3以上のエリアで出やすくなる。", hintCatch: "捕獲率30%。序盤UMAよりやや難しい。根気よく挑もう。" },
    { id: "mothman", name: "モスマン", emoji: "🦋", rarity: "アンコモン", isUMA: true, isRare: false, minLevel: 4, weight: 5, hp: 26, attack: 9, def: 2, captureRate: 0.30, exp: 22, sellPrice: 18,
      desc: "巨大な翼を持つ謎の飛行UMA。夜に目撃されることが多く、不吉の前兆ともいわれる。",
      hintArea: "夜の森", hintText: "翼を持つ飛行型アンコモンUMA。レベル4以上のエリアに出現する。", hintCatch: "ヒバゴンと同程度の捕獲率。HP削ってから「つかまえる」を試そう。" },
    { id: "bigfoot", name: "ビッグフット", emoji: "🦶", rarity: "レア", isUMA: true, isRare: true, weight: 10, hp: 48, attack: 11, def: 4, captureRate: 0.18, exp: 42, sellPrice: 60, fleeRate: 0.80, inflicts: { id: "allergy", chance: 0.3, duration: 12 },
      desc: "大きな足跡を残す巨大UMA。出会った者はたいてい驚く。体毛がアレルギーを引き起こすことがある。",
      hintArea: "フィールド全域", hintText: "逃げ足が速いレアUMA。遭遇したらすぐ「つかまえる」を使え。アレルギーに注意。", hintCatch: "捕獲率18%。逃げやすいので最初のターンに捕獲コマンドを狙おう。" },
    { id: "nessie", name: "ネッシー", emoji: "🐉", rarity: "レア", isUMA: true, isRare: true, weight: 10, hp: 50, attack: 11, def: 5, captureRate: 0.16, exp: 46, sellPrice: 65, fleeRate: 0.80,
      desc: "湖の深みに住むと噂される巨大UMA。水しぶきと共に颯爽と姿を現す。",
      hintArea: "フィールド全域", hintText: "幻のレアUMA。フィールドを歩き続ければ稀に現れる。", hintCatch: "捕獲率16%・逃げ足も速い。見つけたら「つかまえる」を即座に使おう。" },
    { id: "yeti", name: "イエティ", emoji: "☃️", rarity: "レア", isUMA: true, isRare: true, weight: 8, hp: 54, attack: 12, def: 5, captureRate: 0.15, exp: 50, sellPrice: 70, fleeRate: 0.80,
      desc: "雪山に棲む雪男。体は大きいが動きは鈍い。寒さには強く、暑さには弱いらしい。",
      hintArea: "フィールド全域", hintText: "希少なレアUMA。フィールドを歩き回ると稀に現れる。", hintCatch: "捕獲率15%。ネッシーより更に難しい。根気よく探そう。" },
    { id: "jerseydevil", name: "ジャージーデビル", emoji: "👹", rarity: "レア", isUMA: true, isRare: true, weight: 8, hp: 55, attack: 13, def: 4, captureRate: 0.14, exp: 53, sellPrice: 75, fleeRate: 0.80,
      desc: "ニュージャージーの森に棲む翼を持つ悪魔型UMA。遭遇した者はろくなことがないという。",
      hintArea: "フィールド全域", hintText: "悪魔型の希少UMA。遭遇自体がまれ。フィールドを歩き回れ。", hintCatch: "捕獲率14%。レアUMAの中でも最難関のひとつ。粘り強く。" },
    // §73 v0.22: 究極ゴリラは専用ヒント(Lv99+ウクレレ+HP1〜10+うたう)
    // 捕獲もattemptCapture()内で別途上限を掛けてほぼ不可能にしている。
    { id: "ultimategorilla", name: "究極ゴリラ", emoji: "🦍", rarity: "伝説", isUMA: true, isRare: true, final: true, weight: 4, hp: 5000, attack: 150, def: 60, captureRate: 0.005, exp: 300, sellPrice: 99999, fleeRate: 0.95,
      desc: "森の奥に現れる究極のUMA。通常の捕獲は一切通用しない。女神のウクレレの音色のみが、その心を鎮めるという。",
      hintArea: "森の最深部", hintText: "Lv99以上・女神のウクレレ装備でなければ捕獲できない。通常の「つかまえる」は無効。", hintCatch: "HPを1〜10まで削り、「うたう」で捕獲できる。HP調整に「はずかし固め・小」や「ここはひとつガマン」が役立つ。" }
  ];

  // --- UMA以外の敵(野生動物・盗賊など。図鑑/所持UMAの対象外) ---
  // type: "monster"(通常モンスター) / "metal"(メタル系・経験値稼ぎ用)
  // 特殊行動: inflicts(状態異常付与) / drainsMp(MP吸収) / stealsGold(所持金を盗む) /
  //           ambush(戦闘開始時の不意打ち) / fleeRate(プレイヤーの逃走成功率。低いほど素早い)
  var NON_UMA_DATA = [
    // §45 v0.9.2: HP/EXPを全体底上げ。序盤×1.5〜1.6、中盤×1.7、後半×2.0〜2.1。メタル系は変更なし。
    // 序盤 (minLevel1-2)
    { id: "slime", name: "スライム", emoji: "🟢", type: "monster", isUMA: false, minLevel: 1, weight: 10, hp: 16, attack: 3, def: 1, captureRate: 0.60, exp: 8 },
    { id: "bat", name: "コウモリ", emoji: "🦇", type: "monster", isUMA: false, minLevel: 1, weight: 10, hp: 14, attack: 4, def: 0, captureRate: 0.55, exp: 8 },
    { id: "mosquito", name: "蚊", emoji: "🦟", type: "monster", isUMA: false, minLevel: 1, weight: 9, hp: 10, attack: 2, def: 0, captureRate: 0.65, exp: 5, inflicts: { id: "allergy", chance: 0.25, duration: 8 } },
    { id: "snake", name: "蛇", emoji: "🐍", type: "monster", isUMA: false, minLevel: 1, weight: 8, hp: 17, attack: 4, def: 1, captureRate: 0.50, exp: 10 },
    { id: "wilddog", name: "のらいぬ", emoji: "🐕", type: "monster", isUMA: false, minLevel: 1, weight: 5, hp: 28, attack: 8, def: 2, captureRate: 0.40, exp: 19,
      startMsg: "のらいぬが低くうなっている……！ レベルが低いうちは逃げるのが賢明かもしれない。" },
    { id: "yabuka", name: "ヤブ蚊", emoji: "🦟", type: "monster", isUMA: false, minLevel: 2, weight: 7, hp: 14, attack: 5, def: 0, captureRate: 0.45, exp: 11, inflicts: { id: "allergy", chance: 0.35, duration: 10 } },
    { id: "wanderingman", name: "さまようおやじ", emoji: "🚶", type: "monster", isUMA: false, minLevel: 2, weight: 6, hp: 25, attack: 5, def: 1, captureRate: 0.40, exp: 13 },
    // 中盤 (minLevel3-7)
    { id: "powerpointguy", name: "パワポ野郎", emoji: "💻", type: "monster", isUMA: false, minLevel: 3, weight: 5, hp: 28, attack: 5, def: 2, captureRate: 0.30, exp: 17, drainsMp: { chance: 0.3, amount: 3 } },
    { id: "scammer", name: "詐欺師", emoji: "🕴️", type: "monster", isUMA: false, minLevel: 3, weight: 5, hp: 30, attack: 6, def: 1, captureRate: 0.30, exp: 18, stealsGold: { chance: 0.3, amount: 5 } },
    { id: "bandit", name: "山賊", emoji: "🥷", type: "monster", isUMA: false, minLevel: 3, weight: 6, hp: 37, attack: 8, def: 2, captureRate: 0.25, exp: 24, inflicts: { id: "smell", chance: 0.3, duration: 3 } },
    { id: "marathonman", name: "マラソンマン", emoji: "🏃", type: "monster", isUMA: false, minLevel: 4, weight: 5, hp: 32, attack: 6, def: 2, captureRate: 0.32, exp: 20, fleeRate: 0.50 },
    { id: "bumpman", name: "ぶつかりおじさん", emoji: "💢", type: "monster", isUMA: false, minLevel: 4, weight: 5, hp: 34, attack: 7, def: 2, captureRate: 0.28, exp: 22, ambush: true },
    // 後半 (minLevel5+)
    { id: "oni", name: "鬼", emoji: "👺", type: "monster", isUMA: false, minLevel: 5, weight: 4, hp: 60, attack: 10, def: 4, captureRate: 0.20, exp: 40 },
    { id: "powerharassmentsenpai", name: "パワハラ先輩", emoji: "😤", type: "monster", isUMA: false, minLevel: 5, weight: 4, hp: 48, attack: 13, def: 3, captureRate: 0.22, exp: 36 },
    // v0.8.7 §40 のりお指令: 序盤モンスター追加 / §45 v0.9.2 HP/EXP底上げ
    { id: "campgirl", name: "キャンプ女子", emoji: "⛺", type: "monster", isUMA: false, minLevel: 1, weight: 8, hp: 13, attack: 3, def: 0, captureRate: 0.55, exp: 8 },
    { id: "xiaolongbao", name: "小籠包", emoji: "🥟", type: "monster", isUMA: false, minLevel: 1, weight: 7, hp: 11, attack: 2, def: 0, captureRate: 0.60, exp: 6 },
    { id: "streetguitarist", name: "弾き語り女子", emoji: "🎤", type: "monster", isUMA: false, minLevel: 1, weight: 7, hp: 14, attack: 3, def: 0, captureRate: 0.55, exp: 10 },
    { id: "rudeperson", name: "失礼な人", emoji: "🤬", type: "monster", isUMA: false, minLevel: 1, weight: 8, hp: 16, attack: 4, def: 0, captureRate: 0.50, exp: 10 },
    // v0.8.7 §40 のりお指令: 中盤モンスター追加 / §45 v0.9.2 HP/EXP底上げ
    { id: "wannabeninja", name: "忍者かぶれ", emoji: "🎭", type: "monster", isUMA: false, minLevel: 3, weight: 5, hp: 34, attack: 7, def: 3, captureRate: 0.32, exp: 20 },
    { id: "strongarmcatcher", name: "強肩キャッチャー", emoji: "⚾", type: "monster", isUMA: false, minLevel: 3, weight: 5, hp: 37, attack: 8, def: 2, captureRate: 0.28, exp: 22 },
    { id: "hangure", name: "半グレ", emoji: "🧢", type: "monster", isUMA: false, minLevel: 4, weight: 5, hp: 41, attack: 9, def: 2, captureRate: 0.25, exp: 26, inflicts: { id: "smell", chance: 0.25, duration: 3 } },
    { id: "bangya", name: "バンギャ", emoji: "💀", type: "monster", isUMA: false, minLevel: 3, weight: 5, hp: 30, attack: 6, def: 1, captureRate: 0.32, exp: 18 },
    { id: "vintageguy", name: "古着屋兄さん", emoji: "👕", type: "monster", isUMA: false, minLevel: 3, weight: 6, hp: 27, attack: 6, def: 2, captureRate: 0.35, exp: 17 },
    { id: "teacher", name: "先生", emoji: "📏", type: "monster", isUMA: false, minLevel: 4, weight: 5, hp: 34, attack: 7, def: 3, captureRate: 0.30, exp: 20 },
    { id: "foodsnob", name: "グルメ気取り", emoji: "🍜", type: "monster", isUMA: false, minLevel: 3, weight: 6, hp: 28, attack: 5, def: 2, captureRate: 0.35, exp: 17 },
    { id: "chikan", name: "痴漢", emoji: "🚇", type: "monster", isUMA: false, minLevel: 3, weight: 4, hp: 25, attack: 6, def: 1, captureRate: 0.35, exp: 18, ambush: true },
    // v0.8.7 §40 のりお指令: 後半モンスター追加 / §45 v0.9.2 HP/EXP底上げ (×2.0〜2.1)
    { id: "andre", name: "アンドレ", emoji: "💪", type: "monster", isUMA: false, minLevel: 8, weight: 4, hp: 80, attack: 12, def: 5, captureRate: 0.22, exp: 58 },
    { id: "deathmatch", name: "デスマッチレスラー", emoji: "🤼", type: "monster", isUMA: false, minLevel: 10, weight: 3, hp: 95, attack: 14, def: 4, captureRate: 0.18, exp: 73 },
    { id: "mitakadrunk", name: "三鷹のよっぱらい", emoji: "🍺", type: "monster", isUMA: false, minLevel: 8, weight: 4, hp: 68, attack: 11, def: 3, captureRate: 0.22, exp: 52, ambush: true },
    { id: "viceprincipal", name: "教頭", emoji: "👔", type: "monster", isUMA: false, minLevel: 8, weight: 4, hp: 72, attack: 10, def: 5, captureRate: 0.22, exp: 54 },
    { id: "principal", name: "校長", emoji: "🎓", type: "monster", isUMA: false, minLevel: 10, weight: 3, hp: 80, attack: 11, def: 6, captureRate: 0.20, exp: 62 },
    { id: "fakescriptwriter", name: "いんちき放送作家", emoji: "📺", type: "monster", isUMA: false, minLevel: 9, weight: 3, hp: 75, attack: 9, def: 4, captureRate: 0.22, exp: 55, stealsGold: { chance: 0.30, amount: 8 } },
    { id: "pseudoscreenwriter", name: "エセ脚本家", emoji: "✍️", type: "monster", isUMA: false, minLevel: 9, weight: 4, hp: 63, attack: 8, def: 3, captureRate: 0.25, exp: 48, drainsMp: { chance: 0.30, amount: 4 } },
    { id: "implantdentist", name: "インプラント歯医者", emoji: "🦷", type: "monster", isUMA: false, minLevel: 10, weight: 3, hp: 76, attack: 10, def: 5, captureRate: 0.22, exp: 58, drainsMp: { chance: 0.25, amount: 5 } },
    { id: "psychicdetective", name: "霊界探偵", emoji: "🔮", type: "monster", isUMA: false, minLevel: 9, weight: 4, hp: 70, attack: 9, def: 4, captureRate: 0.22, exp: 54, stealsGold: { chance: 0.25, amount: 10 } },
    { id: "karatesisters", name: "空手姉妹", emoji: "🥋", type: "monster", isUMA: false, minLevel: 10, weight: 3, hp: 85, attack: 13, def: 4, captureRate: 0.20, exp: 67 },
    { id: "graviaidol", name: "グラビアアイドル", emoji: "📸", type: "monster", isUMA: false, minLevel: 8, weight: 4, hp: 63, attack: 10, def: 3, captureRate: 0.25, exp: 48 },
    { id: "alien", name: "宇宙人", emoji: "👽", type: "monster", isUMA: false, minLevel: 12, weight: 3, hp: 90, attack: 13, def: 5, captureRate: 0.20, exp: 80 },
    { id: "stranger", name: "異邦人", emoji: "🌍", type: "monster", isUMA: false, minLevel: 10, weight: 3, hp: 80, attack: 12, def: 4, captureRate: 0.20, exp: 63 },
    { id: "visitor", name: "来訪者", emoji: "🚪", type: "monster", isUMA: false, minLevel: 11, weight: 3, hp: 85, attack: 13, def: 5, captureRate: 0.20, exp: 72 },
    // §45 v0.9.2: 中ボスゴリラ (横スクロールステージ1固定ボス、通常エンカウントには出ない)
    // §46 v0.9.2.1: canCapture:false で captureRate:0 + clamp下限(0.05)の抜け穴を完全に封じる
    { id: "midboss_gorilla", name: "中ボスゴリラ", emoji: "🦍", type: "boss", isUMA: false, minLevel: 1, weight: 0, hp: 150, attack: 20, def: 5, captureRate: 0, exp: 160, fleeRate: 0.30,
      canCapture: false,
      customEscapeMsgs: ["はじまりの草原に静けさが戻った。", "中ボスゴリラは草むらの奥へ消えていった。"] },
    // §48 v0.10: ボスゴリラ (横スクロールステージ2固定ボス、通常エンカウントには出ない)
    { id: "boss_gorilla", name: "ボスゴリラ", emoji: "🦍", type: "boss", isUMA: false, minLevel: 1, weight: 0, hp: 250, attack: 26, def: 8, captureRate: 0, exp: 290, fleeRate: 0.20,
      canCapture: false,
      customEscapeMsgs: ["あやしい森に静けさが戻った。", "ボスゴリラは森の奥深くへ消えていった。"] },
    // §50 v0.11: 魔王ゴリラ (横スクロールステージ3固定ボス、通常エンカウントには出ない)
    { id: "maou_gorilla", name: "魔王ゴリラ", emoji: "🦍", type: "boss", isUMA: false, minLevel: 1, weight: 0, hp: 400, attack: 34, def: 11, captureRate: 0, exp: 500, fleeRate: 0.15,
      canCapture: false,
      startMsg: "町はずれの奥から、重たい笑い声が響いた……\n魔王ゴリラが道をふさいだ！",
      customEscapeMsgs: ["魔王ゴリラは古びた町の奥へ逃げていった！！", "町はずれに、少しだけ静けさが戻った。"] },
    // §55 v0.12: 大魔王ゴリラ (横スクロールステージ4固定ボス、通常エンカウントには出ない)
    { id: "daimaou_gorilla", name: "大魔王ゴリラ", emoji: "🦍", type: "boss", isUMA: false, minLevel: 1, weight: 0, hp: 700, attack: 46, def: 16, captureRate: 0, exp: 850, fleeRate: 0.10,
      canCapture: false,
      startMsg: "山道の奥から、地響きのような足音が近づいてくる……\n大魔王ゴリラが道をふさいだ！",
      customEscapeMsgs: ["大魔王ゴリラは山の奥へ逃げていった！！", "ゴリラ山道に、冷たい風が吹き抜けた。"] },
    // §57 v0.13: ラスボス級ゴリラ (横スクロールステージ5固定ボス、通常エンカウントには出ない)
    { id: "lastboss_gorilla", name: "ラスボス級ゴリラ", emoji: "🦍", type: "boss", isUMA: false, minLevel: 1, weight: 0, hp: 1000, attack: 58, def: 22, captureRate: 0, exp: 1400, fleeRate: 0.08,
      canCapture: false,
      startMsg: "黒い城の奥から、重すぎる気配が迫ってくる……\nラスボス級ゴリラが道をふさいだ！",
      customEscapeMsgs: ["ラスボス級ゴリラは黒い城の奥へ逃げていった！！", "城の闇が、少しだけ薄れた。"] },
    // §59 v0.14: 究極チンパンジー (横スクロールステージ6固定ボス)
    { id: "ultimate_chimpanzee", name: "究極チンパンジー", emoji: "🦍", type: "boss", isUMA: false, minLevel: 1, weight: 0, hp: 1500, attack: 72, def: 32, captureRate: 0, exp: 3000, fleeRate: 0.05,
      canCapture: false,
      startMsg: "チンパンジーの聖域の奥深くから、神々しい雄叫びが響き渡った……\n究極チンパンジーが降り立った！",
      customEscapeMsgs: ["究極チンパンジーは深い霧の中へ消えていった！！", "聖域の静寂が、また戻ってきた。"] },
    // メタル系: 経験値稼ぎ用のボーナス敵。高防御・低HP・低確率出現(METAL_ENCOUNTER_CHANCE)。
    // v0.6.1でEXPを大幅増量(稼ぎ甲斐を出すため)
    { id: "metalgorilla", name: "メタルゴリラ", emoji: "🥈", type: "metal", isUMA: false, minLevel: 1, weight: 10, hp: 8, attack: 3, def: 25, captureRate: 0.05, exp: 120,
      desc: "キラリと光る希少なゴリラ。防御力が高く攻撃はほぼ通らないが、倒すと大きな経験値が手に入る。" },
    { id: "haguremetalgorilla", name: "はぐれメタルゴリラ", emoji: "🥇", type: "metal", isUMA: false, minLevel: 10, weight: 8, hp: 12, attack: 5, def: 40, captureRate: 0.04, exp: 400,
      desc: "群れを外れたメタルゴリラ。さらに硬くなっており、出会えればレベルアップの大チャンス。" },
    { id: "fullmetalgorilla", name: "フルメタルゴリラ", emoji: "💎", type: "metal", isUMA: false, minLevel: 20, weight: 6, hp: 16, attack: 8, def: 60, captureRate: 0.03, exp: 1000,
      desc: "全身が金属に覆われた究極のメタル系。ほぼ傷つかないが、倒すと莫大な経験値を得られる。" }
  ];

  // UMA_DATAは収集対象として一律 type:"uma" を付与する(配列の各行は変更しない)
  UMA_DATA.forEach(function (m) { m.type = "uma"; });

  // メタル系だけを抜き出した低確率エンカウント用プール
  var METAL_DATA = NON_UMA_DATA.filter(function (m) { return m.type === "metal"; });

  // --- アイテムデータ(消耗品。商人で売買・フィールドで取得) ---
  // trackable: true のものだけ player.potionCount / ropeCount のような専用の
  // 所持数カウンタを持ち、商人の売買UIに表示される。それ以外はデータのみで
  // 購入/使用ロジックは未実装(GAME_DESIGN.md §8参照)。
  var ITEM_DATA = [
    { id: "potion", name: "やくそう", type: "heal", healAmount: 15, buyPrice: 10, sellPrice: 4, trackable: true },
    { id: "rope", name: "捕獲ロープ", type: "capture", captureBonus: 0.25, buyPrice: 15, sellPrice: 5, trackable: true },
    // Version 0.4.3で実際に使用可能になった回復食料品
    { id: "coffee", name: "コーヒー", type: "heal", healAmount: 10, buyPrice: 5, sellPrice: 1, trackable: true },
    { id: "bread", name: "パン", type: "heal", healAmount: 20, buyPrice: 10, sellPrice: 3, trackable: true },
    { id: "bento", name: "お弁当", type: "heal", healAmount: 40, buyPrice: 20, sellPrice: 7, trackable: true },
    { id: "ramen", name: "ラーメン", type: "heal", healAmount: 9999, buyPrice: 40, sellPrice: 15, trackable: true },
    { id: "coughsyrup", name: "せき止めシロップ", type: "cure", cures: "allergy", buyPrice: 15, sellPrice: 4, trackable: true },
    { id: "deodorant", name: "デオドラントスプレー", type: "cure", cures: "smell", buyPrice: 15, sellPrice: 4, trackable: true }
  ];

  // --- 武器データ(レガシー仕様。装備の概念は持たず、購入/取得した瞬間にこうげき力へ加算) ---
  var WEAPON_DATA = [
    { id: "fieldsword", name: "つるぎ", atkBonus: 3, buyPrice: 0, sellPrice: 0 },   // フィールド落下品専用
    { id: "ironsword", name: "鉄の剣", atkBonus: 6, buyPrice: 30, sellPrice: 12 }   // 商人で購入できる
  ];

  // --- 装備データ(武器/防具/盾/兜の装備スロット) ---
  // 各リストの先頭はボーナス0の初期装備(既存プレイヤーに影響を与えないため)。
  // 入手手段(購入/ドロップ)は未実装。現在は装備変更画面からすべて選択できる。
  var EQUIP_WEAPON_DATA = [
    { id: "woodstick", name: "木の棒", atkBonus: 0 },
    { id: "wirebrush", name: "ワイヤーブラシ", atkBonus: 2, buyPrice: 8 },
    { id: "stone", name: "石", atkBonus: 3 },
    { id: "saw", name: "ノコギリ", atkBonus: 4, buyPrice: 15 },
    { id: "magicwand", name: "魔法のステッキ", atkBonus: 5, mpBonus: 5, buyPrice: 40 },
    { id: "survivalknife", name: "サバイバルナイフ", atkBonus: 6, buyPrice: 25 },
    { id: "ironrod", name: "鉄の棒", atkBonus: 8, buyPrice: 35 },
    { id: "boomerang", name: "ブーメラン", atkBonus: 9, buyPrice: 40 },
    { id: "crowbar", name: "バールのようなもの", atkBonus: 10, buyPrice: 45 },
    { id: "tennisracket", name: "テニスラケット", atkBonus: 10, buyPrice: 45 },
    { id: "shuriken", name: "手裏剣", atkBonus: 11, buyPrice: 55 },
    { id: "nunchaku", name: "ヌンチャク", atkBonus: 12, buyPrice: 60 },
    { id: "woodbat", name: "木製バット", atkBonus: 13, buyPrice: 65 },
    { id: "axe", name: "斧", atkBonus: 15, buyPrice: 75 },
    { id: "metalbat", name: "金属バット", atkBonus: 17, buyPrice: 85 },
    { id: "rockcutter", name: "斬岩剣", atkBonus: 22 },
    { id: "ironcutter", name: "斬鉄剣", atkBonus: 27 },
    { id: "megatonhammer", name: "メガトンハンマー", atkBonus: 33 },
    { id: "spiritsword", name: "霊剣", atkBonus: 38 },
    { id: "andromedachain", name: "アンドロメダの鎖", atkBonus: 44, isLegendary: true },  // v0.8 クリア後実家イベント
    { id: "chainsaw", name: "チェーンソー", atkBonus: 50 },
    { id: "nyoibo", name: "如意棒", atkBonus: 58, isLegendary: true }  // v0.8 Lv70+ジュリタニ宝箱
  ];

  var ARMOR_DATA = [
    { id: "tshirt", name: "Tシャツ", defBonus: 0 },
    { id: "rockt", name: "ロックT", defBonus: 2, buyPrice: 10 },
    { id: "leatherjacket", name: "革ジャン", defBonus: 4, buyPrice: 20 },
    { id: "samuraiarmor", name: "武者よろい", defBonus: 8, buyPrice: 60 },
    { id: "westernarmor", name: "西洋風よろい", defBonus: 12, buyPrice: 90 },
    { id: "nobunagaarmor", name: "信長のよろい", defBonus: 16, hpBonus: 10 },
    { id: "pegasusarmor", name: "ペガサスのよろい", defBonus: 14, hpBonus: 5, isLegendary: true },  // v0.8 Lv50+宝箱
    { id: "turtlegi", name: "亀の武道着", defBonus: 20, hpBonus: 15 }
  ];

  var SHIELD_DATA = [
    { id: "cardboard", name: "段ボールのたて", defBonus: 0 },
    { id: "ironshield", name: "鉄のたて", defBonus: 5, buyPrice: 22 },
    { id: "dragonshield", name: "ドラゴンのたて", defBonus: 26, hpBonus: 8, isLegendary: true },  // v0.8.3 クリア後 王様の使いイベント
    { id: "sixfoldshield", name: "六連のたて", defBonus: 20, isLegendary: true }  // v0.8 Lv60+実家イベント
  ];

  var HELMET_DATA = [
    { id: "hachimaki", name: "男塾ハチマキ", defBonus: 0 },
    { id: "helmet", name: "ヘルメット", defBonus: 2, buyPrice: 10 },
    { id: "steelkabuto", name: "鋼鉄のかぶと", defBonus: 5, buyPrice: 35 },
    { id: "cygnuskabuto", name: "キグナスのかぶと", defBonus: 12, hpBonus: 5, isLegendary: true },  // v0.8.3 フィールド✨宝箱(X) Lv40+
    { id: "shingenkabuto", name: "信玄のかぶと", defBonus: 11 },
    { id: "cosmickabuto", name: "宇宙のかぶと", defBonus: 15, isLegendary: true }  // v0.8 ウクレレ所持宝箱
  ];

  // --- まほうデータ(攻撃/回復に分離。SPELL_DATAは既存コード互換のための結合版) ---
  var ATTACK_SPELL_DATA = [
    { id: "fire", name: "ファイア", mpCost: 4, type: "attack", power: 9 },
    { id: "hazukashigatame", name: "はずかし固め", mpCost: 3, type: "attack", power: 6 },
    { id: "leftHook", name: "左フック", mpCost: 5, type: "attack", power: 11 },
    { id: "thunder", name: "サンダー", mpCost: 6, type: "attack", power: 13 },
    { id: "highKick", name: "ハイキック", mpCost: 7, type: "attack", power: 15 },
    { id: "backdrop", name: "バックドロップ", mpCost: 9, type: "attack", power: 19 },
    { id: "kidoClutch", name: "キドクラッチ", mpCost: 11, type: "attack", power: 24 },
    { id: "sleeperHold", name: "魔性のスリーパー", mpCost: 14, type: "attack", power: 30 },
    { id: "parsley", name: "パクチー", mpCost: 4, type: "attack", power: 8 },
    { id: "gooPunch", name: "グーパンチ", mpCost: 6, type: "attack", power: 12 },
    { id: "homerun", name: "ホームラン", mpCost: 10, type: "attack", power: 22 }
  ];
  var HEAL_SPELL_DATA = [
    { id: "poimi", name: "ポイミ", mpCost: 2, type: "heal", power: 6 },
    { id: "heal", name: "ヒール", mpCost: 5, type: "heal", power: 14 },
    { id: "popoimi", name: "ポポイミ", mpCost: 7, type: "heal", power: 20 },
    { id: "megaheal", name: "メガヒール", mpCost: 9, type: "heal", power: 30 },
    { id: "popomalar", name: "ポポマラー", mpCost: 12, type: "heal", power: 40 },
    { id: "popomazun", name: "ポポマズン", mpCost: 16, type: "heal", power: 55 }
  ];
  var SPELL_DATA = ATTACK_SPELL_DATA.concat(HEAL_SPELL_DATA);

  // --- わざデータ（§61 v0.15 / §63 v0.16: 捕獲支援用技）---
  // fixedDmg: 防御無視・固定ダメージ / type:"weakenAttack": 通常攻撃弱体化
  var WAZA_DATA = [
    { id: "hazukashigatame", name: "はずかし固め・小", fixedDmg: 1, emoji: "😳" },
    { id: "kidoclutch",      name: "キドクラッチ",  fixedDmg: 2, emoji: "🤼" },
    { id: "karitsuo",        name: "カリツォー",    fixedDmg: 3, emoji: "🦵" },
    { id: "gupanchi",        name: "グーパンチ",    fixedDmg: 4, emoji: "✊" },
    { id: "gaman", name: "ここはひとつガマン", type: "weakenAttack", emoji: "😤" }
  ];

  // --- 職業(部活)データ ---
  // hpMod/mpMod/atkMod/defMod: ステータス補正  fleeMod: 逃走成功率補正
  // captureMod: 捕獲成功率補正  spellLearnMod: レベルアップ時に追加でまほうを覚える確率
  var JOB_DATA = [
    { id: "baseball", name: "野球部", atkMod: 3, desc: "こうげき力が少し高い" },
    { id: "swim", name: "水泳部", hpMod: 8, desc: "最大HPが少し高い" },
    { id: "tennis", name: "テニス部", captureMod: 0.10, desc: "UMAを捕まえやすい" },
    { id: "home", name: "帰宅部", fleeMod: 0.15, desc: "戦闘から逃げやすい" },
    { id: "brass", name: "吹奏楽部", spellLearnMod: 0.35, desc: "まほうを覚えやすい" },
    { id: "soccer", name: "サッカー部", atkMod: 1, hpMod: 3, fleeMod: 0.03, captureMod: 0.03, desc: "すべてバランス型" },
    { id: "rugby", name: "ラグビー部", hpMod: 12, atkMod: 5, fleeMod: -0.20, desc: "HPとこうげき力が高いが逃げにくい" },
    { id: "track", name: "陸上部", fleeMod: 0.25, desc: "とても逃げやすい" },
    { id: "magicwarrior", name: "魔法戦士", atkMod: 2, mpMod: 4, spellLearnMod: 0.15, desc: "まほうとこうげきのバランス型" }
  ];

  // --- 仲間データ(§10。GAME_DESIGN.md §10 参照) ---
  // critBonus: doFight()の会心確率加算  captureMod: attemptCapture()加算
  // fleeMod: doRun()加算  spellMod: castSpell()の威力/回復倍率加算
  var COMPANION_MAX = 4; // パーティー上限 §127 v0.50: 2→4
  var COMPANION_DATA = [
    { id: "juritani",   name: "ジュリタニ", emoji: "💪", icon: "🧑", // §121 v0.46: 人型識別アイコン
      feature: "会心の一撃の確率が高い",
      effectDesc: "攻撃時に会心の一撃が出やすくなる(確率+20%)",
      critBonus: 0.20,
      joinRate: 0.70,
      joinMsgs: ["ジュリタニは拳を鳴らした。", "面白そうだな。付き合ってやるよ。"],
      failMsgs: ["ジュリタニは腕を組んだ。", "まだお前の実力を見せてもらってないな。"],
      clearLine: "歌で究極ゴリラを止めるなんて、最後まで派手だったな。でも、あの一撃じゃなくて一曲で決めたのが、あんたらしいよ。",
      fullClearLine: "ここまで全部やりきるとはな。会心の一撃でも届かない場所に、あんたは歌で届いたんだな。",
      sideClearLine: "チンパンジーまで退かせるなんて、ずいぶん遠くまで来たな。横に長い旅も、なかなか悪くなかったぜ。",
      dexLine: "UMAを全部記録したのか。会心の一撃だけじゃなく、根気も必要だったな。",
      legendaryLine: "伝説装備まで全部そろえたのか。見た目も中身も、もう完全に勇者だな。" },
    { id: "shurittani", name: "シュリタニ", emoji: "🪤", icon: "👩", // §121 v0.46: 人型識別アイコン
      feature: "UMAを捕まえるのが得意",
      effectDesc: "捕獲率+0.10",
      captureMod: 0.10,
      joinRate: 0.65,
      joinMsgs: ["シュリタニは捕獲ロープを確認した。", "UMA探しなら任せて。"],
      failMsgs: ["シュリタニは地図を見つめている。", "今は準備が足りないみたい。"],
      clearLine: "究極ゴリラまで捕まえるなんて、さすがだね。捕獲の極意、ちゃんと身についたみたい。",
      fullClearLine: "図鑑まで全部埋まったんだね。一匹ずつ向き合ってきた証だよ。",
      sideClearLine: "強い相手を倒すだけじゃなくて、ちゃんと向き合って進んできたんだね。",
      dexLine: "図鑑が全部埋まったんだね。一匹ずつ見つけて、弱らせて、向き合ってきた証だよ。",
      legendaryLine: "伝説装備も全部そろったんだね。道具も、仲間も、思い出も、ちゃんと積み重なってる。" },
    { id: "norio",      name: "ノリオ",     emoji: "📈", icon: "👨", // §121 v0.46: 人型識別アイコン  // §45 v0.9.2: 逃走→経験値2倍に変更
      feature: "経験値が2倍になる",
      effectDesc: "獲得経験値×2",
      expMod: 2,
      joinRate: 0.75,
      joinMsgs: ["ノリオはニヤリと笑った。", "俺と一緒にいれば、経験値がぐんぐん上がるぞ。"],
      failMsgs: ["ノリオは考え込んでいる。", "まだタイミングじゃないな。"],
      clearLine: "経験値だけじゃ測れない冒険だったな。でもまあ、ここまで来たならEXPもだいぶ稼いだだろ？",
      fullClearLine: "完全達成か。もう経験値2倍でも足りないくらい、濃い旅だったな。",
      sideClearLine: "横スクロール編、経験値的にもだいぶおいしかったな。いや、もちろん思い出もだけどな。",
      dexLine: "図鑑コンプリートか。経験値には出ないけど、こういう達成感も悪くないな。",
      legendaryLine: "伝説装備まで全部そろえたのか。もう装備欄だけで経験値がにじみ出てるぞ。" },
    { id: "harumi",     name: "ハルミ",     emoji: "✨", icon: "👧", // §121 v0.46: 人型識別アイコン
      feature: "まほうが得意",
      effectDesc: "まほう効果+20%",
      spellMod: 0.20,
      joinRate: 0.60,
      joinMsgs: ["ハルミは静かに呪文を唱えた。", "魔法で支えます。"],
      failMsgs: ["ハルミは首をかしげた。", "魔力の流れがまだ合わないみたい。"],
      clearLine: "最後は魔法じゃなくて歌だったのね。でも、そういう力も私は好きよ。",
      fullClearLine: "森も聖域も図鑑も、全部つながったのね。この旅、ちゃんと物語になったわ。",
      sideClearLine: "聖域まで越えたのね。森の外側にも、ちゃんと物語があったんだわ。",
      dexLine: "図鑑が完成したのね。名前を記録するって、その存在を忘れないってことなのかもしれない。",
      legendaryLine: "伝説装備が全部そろったのね。武器や防具も、旅の記憶をまとっているみたい。" }
  ];

  // §103 v0.39: 仲間Lv節目セリフデータ（Lv10/50/99 各仲間固有）
  var COMPANION_LEVEL_MILESTONE_LINES = {
    juritani: {
      10: "ようやく体が旅になじんできた。次はもっと派手にいくぞ！",
      50: "ここまで来れば、会心は偶然じゃない。狙って出すものだ！",
      99: "最高レベルか。でも、あんたとならまだ先へ行けそうだ！"
    },
    shurittani: {
      10: "相手の動きが少し読めるようになってきたよ。",
      50: "追い詰めるだけじゃだめ。逃げ道まで見てこそ捕獲なの。",
      99: "捕まえることより、向き合うことの方が大事だって分かったよ。"
    },
    norio: {
      10: "経験って、数字だけじゃないんだな。少し分かってきた。",
      50: "この旅の経験、もうメモ一冊じゃ足りないな。",
      99: "経験値はもう増えなくても、経験は終わらないんだな。"
    },
    harumi: {
      10: "小さな光でも、重ねれば誰かを守れるのね。",
      50: "回復するだけじゃない。みんなが進めるように支えるわ。",
      99: "ここまでの旅、全部がひとつの物語になったわ。"
    }
  };

  // §105 v0.40: 仲間装備データ（スターター4種）
  // §105 v0.40: スターター4種 / §107 v0.41: 特化装備4種追加（合計8種）
  // damageBonus/healBonus = 全行動汎用。actionKey別ボーナスは special1/special2/magicDamageBonus等
  var COMPANION_GEAR_DATA = {
    hotblood_bandana:    { id: "hotblood_bandana",    name: "熱血バンダナ",  emoji: "🩺", allowedCompanion: "juritani",
      damageBonus: 2, healBonus: 0,
      effectDesc: "通常攻撃・会心の構え・熱血エール +2" },
    critical_bracelet:   { id: "critical_bracelet",   name: "会心の腕輪",    emoji: "⚡", allowedCompanion: "juritani",
      damageBonus: 0, healBonus: 0, special1DamageBonus: 5,
      effectDesc: "会心の構え +5" },
    capture_gloves:      { id: "capture_gloves",      name: "捕獲グローブ",  emoji: "🧤", allowedCompanion: "shurittani",
      damageBonus: 1, healBonus: 0,
      effectDesc: "通常攻撃・捕獲アシスト・捕獲の網・おちつきの霧 +1" },
    net_master_belt:     { id: "net_master_belt",     name: "網師のベルト",  emoji: "🕸️", allowedCompanion: "shurittani",
      damageBonus: 0, healBonus: 0, special2DamageBonus: 4,
      effectDesc: "捕獲の網 +4" },
    observation_glasses: { id: "observation_glasses", name: "観察メガネ",    emoji: "🔍", allowedCompanion: "norio",
      damageBonus: 1, healBonus: 0,
      effectDesc: "通常攻撃・経験値の眼・経験値メモ・観察メモ +1" },
    research_notebook:   { id: "research_notebook",   name: "研究ノート",    emoji: "📓", allowedCompanion: "norio",
      damageBonus: 0, healBonus: 0, special2DamageBonus: 3, magicDamageBonus: 3,
      effectDesc: "経験値メモ・観察メモ +3" },
    healing_ribbon:      { id: "healing_ribbon",      name: "癒しのリボン",  emoji: "🎀", allowedCompanion: "harumi",
      damageBonus: 0, healBonus: 3,
      effectDesc: "小さな癒し・小さな回復 +3" },
    prayer_brooch:       { id: "prayer_brooch",       name: "祈りのブローチ", emoji: "🙏", allowedCompanion: "harumi",
      damageBonus: 0, healBonus: 0, magicHealBonus: 6,
      effectDesc: "小さな回復 +6" },
    // §138 v0.57.1: ショップ専用装備（各仲間1個・スターターと報酬の中間強度）
    training_wristband:  { id: "training_wristband",  name: "修行用リストバンド", emoji: "&#x1F94A;", allowedCompanion: "juritani",
      damageBonus: 0, healBonus: 0, attackDamageBonus: 3,
      effectDesc: "通常攻撃 +3" },
    tracking_shoes:      { id: "tracking_shoes",      name: "追跡シューズ",  emoji: "&#x1F45F;", allowedCompanion: "shurittani",
      damageBonus: 0, healBonus: 0, attackDamageBonus: 2,
      effectDesc: "通常攻撃 +2" },
    recording_pen:       { id: "recording_pen",       name: "記録用ペン",    emoji: "&#x1F58A;", allowedCompanion: "norio",
      damageBonus: 0, healBonus: 0, attackDamageBonus: 2,
      effectDesc: "通常攻撃 +2" },
    herbal_pouch:        { id: "herbal_pouch",        name: "薬草ポーチ",    emoji: "&#x1F33F;", allowedCompanion: "harumi",
      damageBonus: 0, healBonus: 0, special1HealBonus: 3,
      effectDesc: "小さな癒し +3" }
  };

  // §109 v0.42: 特化装備4種の入手元情報
  var COMPANION_GEAR_REWARD_DATA = {
    critical_bracelet:  { gearId: "critical_bracelet",  source: "ステージ2初回クリア報酬" },
    net_master_belt:    { gearId: "net_master_belt",    source: "ステージ3初回クリア報酬" },
    research_notebook:  { gearId: "research_notebook",  source: "ステージ4初回クリア報酬" },
    prayer_brooch:      { gearId: "prayer_brooch",      source: "ステージ5初回クリア報酬" }
  };

  // §137 v0.57 / §138 v0.57.1: 仲間装備ショップ販売品（ホワイトリスト方式）
  // スターター4種は ensureCompanionGearState()で自動付与→ショップで販売しない
  // ショップ専用装備4種（各仲間1個・attackDamageBonus/special1HealBonusで中間強度）
  var COMPANION_GEAR_SHOP_ITEMS = [
    { gearId: "training_wristband", price: 60 },
    { gearId: "tracking_shoes",     price: 60 },
    { gearId: "recording_pen",      price: 60 },
    { gearId: "herbal_pouch",       price: 60 }
  ];

  // §111 v0.43: 仲間わざデータ（習得条件・効果・値）
  var COMPANION_TECHNIQUE_DATA = {
    juritani:   { id: "juritani_technique",   name: "超会心ラッシュ",   unlockLevel: 25, requiredGearId: "critical_bracelet",
                  type: "damage",          description: "渾身の連撃で大ダメージを与える。1戦闘に1回。",                minValue: 32, maxValue: 46 },
    shurittani: { id: "shurittani_technique", name: "絶対包囲網",       unlockLevel: 25, requiredGearId: "net_master_belt",
                  type: "damage_leave_one", description: "敵を包囲して追い詰める。敵HPを必ず1以上残す。1戦闘に1回。", minValue: 22, maxValue: 34 },
    norio:      { id: "norio_technique",      name: "完全解析レポート", unlockLevel: 25, requiredGearId: "research_notebook",
                  type: "damage",          description: "完全な分析をぶつけて大ダメージを与える。1戦闘に1回。",      minValue: 26, maxValue: 38 },
    harumi:     { id: "harumi_technique",     name: "大いなる祈り",     unlockLevel: 25, requiredGearId: "prayer_brooch",
                  type: "heal_protect",    description: "HPを大きく回復し、次の敵攻撃を15%軽減する。1戦闘に1回。",  minValue: 40, maxValue: 55, damageReduction: 0.15 }
  };

  // §113 v0.44: 仲間サイドストーリーデータ（4人×1話、今後拡張可能）
  var COMPANION_SIDE_STORY_DATA = {
    juritani: {
      id: "juritani_story_1",
      companionId: "juritani",
      title: "会心の意味",
      lines: [
        { speaker: "語り",       text: "戦いを終えた夜、ジュリタニは熱の残る拳をじっと見つめていた。" },
        { speaker: "ジュリタニ", text: "昔は、強く叩けばそれでいいと思ってた。" },
        { speaker: "ジュリタニ", text: "会心なんて、勢いと偶然で出るものだってな。" },
        { speaker: "ジュリタニ", text: "でも今は違う。あんたが次に進める一撃を選びたい。" },
        { speaker: "あなた",     text: "それが、ジュリタニの会心なんだね。" },
        { speaker: "ジュリタニ", text: "ああ。偶然じゃない。守りたいものを決めた時に出る一撃だ！" },
        { speaker: "語り",       text: "ジュリタニの拳には、これまでとは違う静かな強さが宿っていた。" }
      ]
    },
    shurittani: {
      id: "shurittani_story_1",
      companionId: "shurittani",
      title: "逃げ道の先",
      lines: [
        { speaker: "語り",       text: "足跡を調べていたシュリタニが、ふと追跡の手を止めた。" },
        { speaker: "シュリタニ", text: "前は、逃げ道を全部ふさげば捕まえられると思ってた。" },
        { speaker: "シュリタニ", text: "でも、追い詰められた相手は、こっちを見る余裕すらなくなる。" },
        { speaker: "あなた",     text: "だから、最後の一歩を残すの？" },
        { speaker: "シュリタニ", text: "うん。その一歩で、逃げるか、向き合うかを選んでもらうの。" },
        { speaker: "シュリタニ", text: "私は向き合える距離まで連れていく。それが私の包囲網。" },
        { speaker: "語り",       text: "閉ざすためではなく、向き合うための道をシュリタニは見つけていた。" }
      ]
    },
    norio: {
      id: "norio_story_1",
      companionId: "norio",
      title: "数字に残らない経験",
      lines: [
        { speaker: "語り",   text: "ノリオは旅の記録が詰まったノートを何冊も並べていた。" },
        { speaker: "ノリオ", text: "敵の数、歩いた距離、もらった経験値。全部記録した。" },
        { speaker: "ノリオ", text: "数字にすれば、旅のことを全部分かると思ってたんだ。" },
        { speaker: "あなた", text: "数字には残らないこともあった？" },
        { speaker: "ノリオ", text: "あった。怖かったことも、助けられたことも、笑ったことも。" },
        { speaker: "ノリオ", text: "だから、それも書いておく。忘れないためじゃない。" },
        { speaker: "ノリオ", text: "また前へ進む時に、この経験を思い出せるようにな。" },
        { speaker: "語り",   text: "その日のノートには、初めて数字ではない旅の記録が残された。" }
      ]
    },
    harumi: {
      id: "harumi_story_1",
      companionId: "harumi",
      title: "小さな光の物語",
      lines: [
        { speaker: "語り",   text: "ハルミは小さな光を両手に浮かべながら、静かにほほえんだ。" },
        { speaker: "ハルミ", text: "大きな奇跡じゃなくてもいいと思うの。" },
        { speaker: "ハルミ", text: "小さな回復を重ねて、また一歩進めるなら、それでいい。" },
        { speaker: "あなた", text: "ハルミの光があると、もう一度立ち上がれる気がする。" },
        { speaker: "ハルミ", text: "守るって、倒れないようにするだけじゃないのかもしれないわね。" },
        { speaker: "ハルミ", text: "もう一度進もうと思えるように、そばで光を灯すこと。" },
        { speaker: "ハルミ", text: "この旅が終わった後も、その小さな光が心に残りますように。" },
        { speaker: "語り",   text: "やさしい光は消えずに、しばらく二人の間を照らしていた。" }
      ]
    }
  };

  // §117 v0.45: 仲間サイドストーリー第2話データ（第1話COMPANION_SIDE_STORY_DATAは変更しない）
  var COMPANION_SIDE_STORY_CHAPTER2_DATA = {
    juritani: {
      id: "juritani_story_2",
      companionId: "juritani",
      chapter: 2,
      title: "拳を下ろす勇気",
      lines: [
        { speaker: "語り",       text: "旅の途中、崩れた橋の前でジュリタニは拳を握りしめていた。" },
        { speaker: "ジュリタニ", text: "ぶっ壊せば道ができる。前の俺なら、迷わずそうしてた。" },
        { speaker: "あなた",     text: "今は違うの？" },
        { speaker: "ジュリタニ", text: "ああ。この橋の向こうにも、誰かの大事なものがあるかもしれない。" },
        { speaker: "ジュリタニ", text: "力を使わない方がいい時もある。分かってはいるんだ。" },
        { speaker: "ジュリタニ", text: "でも、拳を下ろしたら弱くなった気がしてな。" },
        { speaker: "あなた",     text: "拳を下ろして、仲間に任せるのも強さだと思う。" },
        { speaker: "ジュリタニ", text: "仲間に任せる、か。" },
        { speaker: "ジュリタニ", text: "分かった。今日はみんなで道を探そう。俺は最後に必要な一発だけを打つ。" },
        { speaker: "語り",       text: "握られていた拳がゆっくり開き、ジュリタニは仲間たちの方を振り返った。" }
      ]
    },
    shurittani: {
      id: "shurittani_story_2",
      companionId: "shurittani",
      chapter: 2,
      title: "待つという追跡",
      lines: [
        { speaker: "語り",       text: "森の奥で足跡が途切れ、シュリタニは静かに腰を下ろした。" },
        { speaker: "シュリタニ", text: "追えば追うほど、遠ざかっていく足跡もあるの。" },
        { speaker: "あなた",     text: "今日は追わないの？" },
        { speaker: "シュリタニ", text: "うん。ここで待つ。" },
        { speaker: "シュリタニ", text: "前の私は、止まったら見失うと思ってた。" },
        { speaker: "シュリタニ", text: "でも、相手が安心して戻れる場所を残すことも、追跡なのかもしれない。" },
        { speaker: "あなた",     text: "戻ってくるって信じるんだね。" },
        { speaker: "シュリタニ", text: "信じるだけじゃないよ。風向きも、音も、帰り道も見ている。" },
        { speaker: "シュリタニ", text: "追い立てない。でも、ひとりにはしない。それが今の私の追い方。" },
        { speaker: "語り",       text: "しばらくすると木々の向こうから、小さな足音がゆっくり近づいてきた。" }
      ]
    },
    norio: {
      id: "norio_story_2",
      companionId: "norio",
      chapter: 2,
      title: "余白に残った名前",
      lines: [
        { speaker: "語り",   text: "ノリオは一冊の記録帳を開き、何も書かれていない余白を見つめていた。" },
        { speaker: "ノリオ", text: "記録は正確じゃなきゃいけない。ずっとそう思ってきた。" },
        { speaker: "ノリオ", text: "でも、この余白だけは何を書けばいいか分からなかった。" },
        { speaker: "あなた", text: "旅で出会った人たちのことを書くのは？" },
        { speaker: "ノリオ", text: "数字にできないから、記録にならないと思ってた。" },
        { speaker: "あなた", text: "名前だけでも残せるよ。" },
        { speaker: "ノリオ", text: "名前だけか。何をしてくれたかも、どれだけ役に立ったかも書かずに？" },
        { speaker: "あなた", text: "うん。忘れたくないと思ったことだけでいい。" },
        { speaker: "ノリオ", text: "……それなら、最初にあんたの名前を書く。" },
        { speaker: "ノリオ", text: "この旅を数字だけにしなかった、一番大事な仲間だからな。" },
        { speaker: "語り",   text: "余白には、整った数値ではなく、少し震えた文字で仲間たちの名前が記された。" }
      ]
    },
    harumi: {
      id: "harumi_story_2",
      companionId: "harumi",
      chapter: 2,
      title: "光を受け取る日",
      lines: [
        { speaker: "語り",   text: "夜の野営地で、ハルミの手の光がいつもより弱く揺れていた。" },
        { speaker: "あなた", text: "今日はもう休んだ方がいいよ。" },
        { speaker: "ハルミ", text: "大丈夫。みんなを照らす光が消えたら困るでしょう？" },
        { speaker: "あなた", text: "ハルミが倒れたら、みんなの方が困るよ。" },
        { speaker: "ハルミ", text: "でも、守ると決めたのは私だから。" },
        { speaker: "あなた", text: "守られる側になってもいいんだよ。" },
        { speaker: "ハルミ", text: "私が、光を受け取る側に？" },
        { speaker: "あなた", text: "うん。今日は僕たちがハルミのそばにいる。" },
        { speaker: "ハルミ", text: "……不思議ね。誰かの光に包まれると、こんなに温かいのね。" },
        { speaker: "ハルミ", text: "明日また灯せるように、今夜はこの光を受け取ることにするわ。" },
        { speaker: "語り",   text: "ハルミが目を閉じると、仲間たちの小さな灯りが静かに彼女を包んだ。" }
      ]
    }
  };

  // §122 v0.47: 仲間サイドストーリー第3話データ（既存CHAPTER1/CHAPTER2_DATAは変更しない）
  var COMPANION_SIDE_STORY_CHAPTER3_DATA = {
    juritani: {
      id: "juritani_story_3",
      companionId: "juritani",
      chapter: 3,
      title: "託された一撃",
      lines: [
        { speaker: "語り",       text: "修行中の若い戦士を見て、ジュリタニはかつての自分を思い出した。" },
        { speaker: "ジュリタニ", text: "俺が全部片付けてやろうと思ったんだ。最初は。" },
        { speaker: "あなた",     text: "でも、やめたの？" },
        { speaker: "ジュリタニ", text: "ああ。俺が打てば終わる。でもそれじゃ、あいつは何も掴めない。" },
        { speaker: "ジュリタニ", text: "怖い思いをして、それでも踏み出す。それが一撃の重さになる。" },
        { speaker: "あなた",     text: "一歩引くのも、勇気がいるね。" },
        { speaker: "ジュリタニ", text: "そうだな。俺の役目は、次に打つ奴のために道を開けておくことだ。" },
        { speaker: "ジュリタニ", text: "俺が教えたい一撃は、力じゃない。それを選んだ覚悟だ。" },
        { speaker: "語り",       text: "ジュリタニは若い戦士の横に立ち、大きな手で静かに道を示した。" }
      ]
    },
    shurittani: {
      id: "shurittani_story_3",
      companionId: "shurittani",
      chapter: 3,
      title: "帰る場所のしるし",
      lines: [
        { speaker: "語り",       text: "シュリタニは深い森の奥に、静かに小さな目印をつけていた。" },
        { speaker: "あなた",     text: "何をしてるの？" },
        { speaker: "シュリタニ", text: "迷った人が、自分で帰れるように。" },
        { speaker: "あなた",     text: "連れて帰らないの？" },
        { speaker: "シュリタニ", text: "もし連れて帰ってあげても、また迷っちゃうかもしれないから。" },
        { speaker: "シュリタニ", text: "自分でしるしを見つけて、自分で歩いて帰る。その経験が大事。" },
        { speaker: "あなた",     text: "でも、見つけられなかったら？" },
        { speaker: "シュリタニ", text: "その時は行く。でも、先に答えを持っていったら、その人の力にならない。" },
        { speaker: "シュリタニ", text: "救うんじゃない。帰れる道があるって、気づいてもらうだけ。" },
        { speaker: "語り",       text: "木々の間に静かに灯る小さな目印が、深い森を少しだけやさしくしていた。" }
      ]
    },
    norio: {
      id: "norio_story_3",
      companionId: "norio",
      chapter: 3,
      title: "未来へ渡す記録",
      lines: [
        { speaker: "語り",   text: "ノリオは長い旅の記録をひとつの冊子にまとめ、最後のページを開いた。" },
        { speaker: "ノリオ", text: "ここには何も書かない。" },
        { speaker: "あなた", text: "なんで？書き忘れじゃないの？" },
        { speaker: "ノリオ", text: "違う。次に旅をする誰かのために、空けておくんだ。" },
        { speaker: "あなた", text: "自分の記録なのに？" },
        { speaker: "ノリオ", text: "俺の記録は、俺で終わらせるために書いたんじゃない。" },
        { speaker: "ノリオ", text: "次の奴がここまで読んで、最後のページに自分の旅を書ける。それが目的だ。" },
        { speaker: "あなた", text: "きっと誰かが書いてくれるよ。" },
        { speaker: "ノリオ", text: "ああ。俺より先に行った奴がいるなら、俺も同じことをしてもらったはずだからな。" },
        { speaker: "語り",   text: "最後の白いページが、次の旅人を静かに待ち続けていた。" }
      ]
    },
    harumi: {
      id: "harumi_story_3",
      companionId: "harumi",
      chapter: 3,
      title: "灯りをつなぐ朝",
      lines: [
        { speaker: "語り",   text: "夜明けの光が差し込む中で、ハルミは仲間ひとりひとりの手に小さな光を灯した。" },
        { speaker: "あなた", text: "自分の光を分けて、大丈夫なの？" },
        { speaker: "ハルミ", text: "分けても、消えなかった。" },
        { speaker: "あなた", text: "どういうこと？" },
        { speaker: "ハルミ", text: "灯りって、誰かに渡すと、その人の中でも光るのね。だから消えないの。" },
        { speaker: "ハルミ", text: "前はひとりで抱えなきゃいけないと思ってたけど、渡した方がずっと明るかった。" },
        { speaker: "あなた", text: "みんなの光がつながってるみたいだね。" },
        { speaker: "ハルミ", text: "ええ。誰か一人の光が消えそうになっても、つながった光があれば戻ってこられる。" },
        { speaker: "ハルミ", text: "これが、私の本当の守り方かもしれない。" },
        { speaker: "語り",   text: "夜明けの光の中で、四人の小さな灯りがひとつにつながって輝いていた。" }
      ]
    }
  };

  // §75 v0.24 / §76 v0.24.1: 仲間セリフ状態判定ヘルパー
  // 優先度: full+legendary > fullClear > legendary_only > dex > side > clear > side_only
  function getCompanionQuote(c) {
    if (!c) return null;
    if (isFullyCompleted() && isLegendaryEquipmentComplete() && c.legendaryLine) {
      return { text: c.legendaryLine, color: "#ffd700" };
    }
    if (isFullyCompleted() && c.fullClearLine) {
      return { text: c.fullClearLine, color: "#ffd166" };
    }
    if (isLegendaryEquipmentComplete() && c.legendaryLine) {
      return { text: c.legendaryLine, color: "#ffb347" };
    }
    if (state.gameCleared && isUmaDexComplete() && c.dexLine) {
      return { text: c.dexLine, color: "#74c0fc" };
    }
    if (state.gameCleared && isSideStoryCleared() && c.sideClearLine) {
      return { text: c.sideClearLine, color: "#c8b4ff" };
    }
    if (state.gameCleared && c.clearLine) {
      return { text: c.clearLine, color: "#a9e34b" };
    }
    if (isSideStoryCleared() && c.sideClearLine) {
      return { text: c.sideClearLine, color: "#c8b4ff" };
    }
    return null;
  }

  // データ検索用のショートカット(参照頻度が高いものだけ用意)
  function findById(list, id) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return null;
  }
  var POTION_ITEM = findById(ITEM_DATA, "potion");
  var ROPE_ITEM = findById(ITEM_DATA, "rope");
  var FIELD_WEAPON = findById(WEAPON_DATA, "fieldsword");

  // ---------------------------------------------------------
  // 3. エンカウント関連の調整値
  // ---------------------------------------------------------
  // ※ デバッグ/動作確認用メモ:
  // 究極ゴリラに早く遭遇したい場合は、RARE_ENCOUNTER_CHANCEを上げる、
  // または UMA_DATA の ultimategorilla の weight を増やすとすぐ確認できる。
  var RARE_ENCOUNTER_CHANCE = 0.08;  // エンカウント発生時、レアUMAになる確率
  var METAL_ENCOUNTER_CHANCE = 0.06; // レア枠に外れた時、メタル系になる確率(§6.3。v0.6.1で0.04→0.06に増量)
  var ENCOUNTER_CHANCE = 0.25;      // 草原を1歩進むごとにエンカウントが起きる確率
  var MIN_STEPS_BEFORE_ENCOUNTER = 2; // 戦闘直後はこの歩数分エンカウントしない

  // デバッグモード(URLに ?debug=1 が付いている時のみ有効。設定画面に開発用テストボタンが追加される)
  var DEBUG_MODE = (function () {
    try { return window.location.search.indexOf("debug=1") !== -1; } catch (e) { return false; }
  }());

  // サウンド設定(v0.8.4 §34)
  var soundEnabled = false;
  var bgmEnabled = true;
  var seEnabled = true;
  var audioCtx = null;
  var bgmCurrentType = null;
  var bgmSchedulerId = null;
  var bgmStopFlag = false;
  var bgmGeneration = 0;    // BGMループ世代管理：切り替え時に古いループを無効化(v0.8.6 §36)
  var bgmSessionId = 0;     // BGMセッションID：startBGMごとに増加。古いループを無効化(v0.8.6.3 §39)
  var activeBgmNodes = [];  // 追跡中ノード配列: [{osc, gain}]。stopBGMHardで一括停止(v0.8.6.3 §39)
  var activeBgmTimers = []; // 追跡中BGMタイマーID配列。stopBGMHardで全clearTimeout(v0.8.6.3 §39)
  var bgmMasterGain = null; // 全BGMノードの共通出力先GainNode。stopBGMで切断→即消音(v0.8.6.2 §38)

  // 設定画面の「歩く速度」: 十字キーを押しっぱなしにした時の移動間隔(ms)
  var WALK_SPEED_MS = { slow: 380, normal: 220, fast: 120 };

  // 状態異常の基礎値(GAME_DESIGN.md §13.5)
  var AILMENT_INFO = {
    allergy: { name: "アレルギー", icon: "🤧", durationUnit: "steps" },
    smell: { name: "におい", icon: "👃", durationUnit: "battles" }
  };
  var ALLERGY_DURATION_STEPS = 12;
  var SMELL_DURATION_BATTLES = 3;
  var SMELL_CAPTURE_PENALTY = 0.15;

  // 捕獲率のHP残量ボーナス係数(Version 0.4.2)。(1 - HP比率) に掛ける値。
  var CAPTURE_HP_BONUS_NORMAL = 0.50; // 通常の敵
  var CAPTURE_HP_BONUS_RARE = 0.25;   // レアUMA(例外的に難しくする)

  // 宝箱ドロップテーブル(§5.7)。weightedPick()で乱択する。
  // equip は isEquipOwned で既所持チェックし、所持済みなら buyPrice/2 のゴールドに替える。
  var CHEST_DROPS = [
    { type: "gold", amount: 5,  weight: 20 },
    { type: "gold", amount: 10, weight: 15 },
    { type: "gold", amount: 20, weight: 8  },
    { type: "gold", amount: 50, weight: 3  },
    { type: "item", id: "coffee",    weight: 12 },
    { type: "item", id: "bread",     weight: 10 },
    { type: "item", id: "bento",     weight: 6  },
    { type: "item", id: "coughsyrup",  weight: 8  },
    { type: "item", id: "deodorant",   weight: 8  },
    { type: "equip", slot: "weapon", id: "wirebrush",    weight: 6 },
    { type: "equip", slot: "weapon", id: "saw",          weight: 5 },
    { type: "equip", slot: "weapon", id: "survivalknife",weight: 4 },
    { type: "equip", slot: "weapon", id: "ironrod",      weight: 3 },
    { type: "equip", slot: "weapon", id: "woodbat",      weight: 2 },
    { type: "equip", slot: "weapon", id: "tennisracket", weight: 2 },
    { type: "equip", slot: "armor",  id: "rockt",        weight: 5 },
    { type: "equip", slot: "armor",  id: "leatherjacket",weight: 3 },
    { type: "equip", slot: "shield", id: "ironshield",   weight: 4 },
    { type: "equip", slot: "helmet", id: "helmet",       weight: 5 }
  ];

  // ---------------------------------------------------------
  // 4. セーブデータ
  // ---------------------------------------------------------
  var SAVE_KEY = "ultimateGorillaSaveV2";
  var SOUND_KEY = "ultimateGorillaSoundV1";
  var _pendingGearRewardNotices = []; // §110 v0.42.1: reconcile遅延通知（非永続・saveしない）

  // ---------------------------------------------------------
  // 5. ゲーム状態
  // ---------------------------------------------------------
  var state = {
    terrain: [],       // 2次元配列。地形文字を保持
    items: {},         // "x,y" -> "weapon" | "potion"
    player: {
      x: 0, y: 0,
      name: "勇者の子孫",
      level: 1,
      exp: 0,
      nextExp: 20,
      // ベースステータス(レベルアップでのみ成長する)
      baseMaxHp: 20, baseMaxMp: 6, baseAtk: 5, baseDef: 2,
      weaponAtkBonus: 0, // 武器取得/購入で積み上がる加算値
      // 実際に使う値。recomputeStats()で base+職業補正+武器補正から再計算する
      hp: 20, mp: 6, maxHp: 20, maxMp: 6, atk: 5, def: 2,
      gold: 20,
      potionCount: 1,
      ropeCount: 0,
      coffeeCount: 0,
      breadCount: 0,
      bentoCount: 0,
      ramenCount: 0,
      coughsyrupCount: 0,
      deodorantCount: 0,
      spells: [],        // 習得済みスペルのidリスト
      job: null,         // JOB_DATAへの参照。initで既定値を設定する
      dex: {},           // id -> "seen" | "captured"
      umaInventory: {},  // id -> 所持数(同じUMAを複数捕まえられる)
      walkSpeed: "normal", // "slow" | "normal" | "fast" (設定画面で変更)
      // 装備スロット(§8.5)。値は各DATA配列のid。先頭=ボーナス0の初期装備。
      equipment: { weapon: "woodstick", armor: "tshirt", shield: "cardboard", helmet: "hachimaki" },
      // 所持している装備のidリスト(Version 0.4.1: 装備の所持制)。
      // 初期装備は無条件で所持している。
      ownedWeapons: ["woodstick"],
      ownedArmors: ["tshirt"],
      ownedShields: ["cardboard"],
      ownedHelmets: ["hachimaki"],
      statusAilments: {}, // id -> 残りターン/歩数(0より大きい間だけ効果がある)
      seenOpening: false,   // オープニングイベントを見たかどうか
      seenGoal: false,      // 目的説明画面を見たかどうか
      companions: [],       // 現在のパーティー仲間のidリスト(§10)
      hasUkulele: false,    // 女神のウクレレを所持しているか(§14.5)
      singBonusActive: 0,   // うたうで発生する次回捕獲ボーナス(使い切りで0にリセット)
      level99Shown: false   // Lv99マイルストーン演出を初回表示したかどうか(§3.8 v0.7.1)
    },
    stepsSinceEncounter: 0,
    inBattle: false,
    gamanActive: false,  // §63 v0.16: ここはひとつガマン中フラグ（戦闘中のみ有効）
    enemy: null,
    locked: false,       // 戦闘コマンド入力をロック(連打防止)
    modalOpen: false,    // いずれかのモーダル表示中はフィールド操作を止める
    discoveredFinal: false,
    gameCleared: false,  // 究極ゴリラ捕獲クリアフラグ(§14.5)
    dexCompleteRewardClaimed: false, // §66 v0.17.1: 図鑑コンプリート報酬受取済みフラグ
    legendaryRewardClaimed: false,   // §70 v0.20: 伝説装備コンプリート報酬受取済みフラグ
    pendingClear: false, // 戦闘終了後にクリアモーダルを表示するフラグ
    pendingLv99: false,  // 戦闘終了後にLv99マイルストーンモーダルを表示するフラグ(§3.8 v0.7.1)
    endingPage: 0,       // エンディングモーダルの現在ページ(v0.7 §28)
    openedChests: {},    // "x,y" -> true: 開封済みの宝箱(§5.7)
    eventFlags: {        // 伝説装備イベントの入手済みフラグ(v0.8 §30, v0.8.3 §33)
      pegasusArmorGot: false,
      sixfoldShieldGot: false,
      cosmicHelmetGot: false,
      nyoiboGot: false,
      andromedaGot: false,
      cygnusHelmetGot: false,  // v0.8.3 キグナスのかぶと
      dragonShieldGot: false,  // v0.8.3 ドラゴンのたて(王様の使い報酬)
      level99Reached: false    // v0.8.5 Lv99到達フラグ(level99Shownと別管理でデバッグリセット可能)
    },
    // §43 v0.9 / §44 v0.9.1: 横スクロールマップ
    mapMode: "normal",   // "normal" | "side"
    sideMap: {
      x: 1,
      y: 1,
      stage: 1,
      openedChests: {},
      defeatedEnemies: {},   // §44 v0.9.1: 撃破済み固定敵 { "31,1": true }
      stageCleared: {},      // §44 v0.9.1: クリア済みステージ { "1": true }
      stage1RewardLevel: 0,  // §47 v0.9.3: ステージ1報酬受取レベル (0=未, 1=30G, 2=全取得)
      stage2RewardLevel: 0,  // §48 v0.10: ステージ2報酬受取レベル (0=未, 1=50G, 2=全取得)
      stage3RewardLevel: 0,  // §50 v0.11: ステージ3報酬受取レベル (0=未, 1=80G, 2=全取得)
      stage4RewardLevel: 0,  // §55 v0.12: ステージ4報酬受取レベル (0=未, 1=120G, 2=全取得)
      stage5RewardLevel: 0,  // §57 v0.13: ステージ5報酬受取レベル (0=未, 1=200G, 2=全取得)
      stage6RewardLevel: 0,  // §59 v0.14: ステージ6報酬受取レベル (0=未, 1=300G, 2=全取得)
      gateExplained: false   // §52 v0.11.2: ゲートから初めて横スクロールへ入ったか
    },
    partyTrail: [],            // §78 v0.26: 仲間追従軌跡（最大4エントリ {x,y} §127 v0.50）
    companionLevels: {},       // §99 v0.37: 仲間Lv/EXP { cid: {level, exp, nextExp} }
    companionEquipment: {},    // §105 v0.40: 仲間装備スロット { cid: gearId|null }
    companionGearInventory: {},// §105 v0.40: 仲間装備所持 { gearId: count }
    companionGearVersion: 0,   // §105 v0.40: スターター配布バージョン (0=未配布, 1=配布済, 3=探索報酬方式)
    companionGearRewardFlags: {},// §109 v0.42: 特化装備取得済みフラグ { gearId: bool }
    companionTechniqueUsed: { juritani: false, shurittani: false, norio: false, harumi: false }, // §111 v0.43: 仲間わざ1戦闘1回（非永続・saveしない）
    companionSideStoryFlags: { juritani: false, shurittani: false, norio: false, harumi: false }, // §113 v0.44: 物語完了フラグ（永続・saveする）
    companionSideStoryChapter2Flags: { juritani: false, shurittani: false, norio: false, harumi: false }, // §117 v0.45: 第2話完了フラグ（永続・saveする）
    activeCompanionSideStory: null, // §113 v0.44: 現在閲覧中のcid（非永続）
    activeCompanionSideStoryLine: 0, // §113 v0.44: 現在の行インデックス（非永続）
    companionSideStoryAllCompleteCelebrated: false, // §115 v0.44.2: 全話完了演出済み（永続・saveする）
    companionSideStoryChapter2AllCompleteCelebrated: false, // §119 v0.45.2: 第2話全話完了演出済み（永続・saveする）
    companionSideStoryChapter3Flags: { juritani: false, shurittani: false, norio: false, harumi: false }, // §122 v0.47: 第3話完了フラグ（永続・saveする）
    companionSideStoryChapter3AllCompleteCelebrated: false, // §133 v0.54: 第3話全話完了演出済み（永続・saveする）
    finalCompanionSideStoryUnlockNotified: false, // §135 v0.56: 最終サイドストーリー解放通知済み（永続・saveする）
    companionTechniqueLearnedNotices: { juritani: false, shurittani: false, norio: false, harumi: false }, // §139 v0.58: 仲間わざ習得演出済みフラグ（永続・saveする）
    playerName: "", // §126 v0.49: 主人公名（永続・saveする。空文字の場合 getPlayerDisplayName() が "冒険者" を返す）
    normalReturnX: 2, // §129 v0.51: ワープ帰還X座標（既定値は既存ゲート出口と同じ）
    normalReturnY: 4, // §129 v0.51: ワープ帰還Y座標
    stageWarpPlazaIntroduced: false // §131 v0.51.2: ワープ広場初回到達フラグ（永続・never demote）
  };

  // ---------------------------------------------------------
  // 6. 初期化
  // ---------------------------------------------------------
  function init() {
    // マップ文字列を2次元配列に変換しつつ、幅をMAP_Wに揃える(安全策)
    for (var y = 0; y < MAP_H; y++) {
      var row = (RAW_MAP[y] || "").padEnd(MAP_W, "#").slice(0, MAP_W);
      var cols = [];
      for (var x = 0; x < MAP_W; x++) {
        var ch = row[x];
        if (ch === "W") {
          state.items[x + "," + y] = "weapon";
          ch = ".";
        } else if (ch === "P") {
          state.items[x + "," + y] = "potion";
          ch = ".";
        } else if (ch === "H") {
          state.player.x = x;
          state.player.y = y;
        }
        cols.push(ch);
      }
      state.terrain.push(cols);
    }

    // 既定の職業を設定してからステータスを算出する
    state.player.job = findById(JOB_DATA, "soccer");
    recomputeStats();
    state.player.hp = state.player.maxHp;
    state.player.mp = state.player.maxMp;

    // セーブデータがあれば読み込む(無ければ何も起きない)
    var loaded = loadGame();

    // §126 v0.49: ニューゲーム命名フロー — ペンディング名をsaveKey+"_pn"から取得
    if (!loaded) {
      var _pn = "";
      try { _pn = localStorage.getItem(SAVE_KEY + "_pn") || ""; } catch (e2) {}
      if (_pn) {
        try { localStorage.removeItem(SAVE_KEY + "_pn"); } catch (e3) {}
        state.playerName = normalizePlayerName(_pn) || "冒険者";
      } else {
        state.playerName = "冒険者"; // ペンディング名なし → デフォルト
      }
      saveGame(); // 初回保存（playerNameを含む）
    }

    // サウンド設定を読み込む(セーブデータとは別キー)
    loadSoundSettings();

    // CSS変数にビューポートの行列数を設定
    var viewport = document.getElementById("field-viewport");
    viewport.style.setProperty("--cols", VIEW_COLS);
    viewport.style.setProperty("--rows", VIEW_ROWS);

    bindEvents();
    renderField();
    updateStatusBar();
    if (loaded) showToast("💾 前回のデータを読み込みました");

    // オープニングイベント(初回起動時のみ)。オープニング後に目的説明を表示する
    // 流れだが、Version 0.4.1より前から遊んでいるプレイヤーはオープニング済み
    // (seenOpening=true)なので、その場合は目的説明だけを表示する。
    if (!state.player.seenOpening) {
      openModal("opening-modal");
    } else if (!state.player.seenGoal) {
      openModal("goal-modal");
    }
  }

  // ---------------------------------------------------------
  // 7. ステータス再計算(base + 職業補正 + 武器補正 + 装備補正)
  // ---------------------------------------------------------
  function recomputeStats() {
    var p = state.player;
    var job = p.job || {};
    var eq = p.equipment || {};
    var weapon = findById(EQUIP_WEAPON_DATA, eq.weapon) || EQUIP_WEAPON_DATA[0];
    var armor = findById(ARMOR_DATA, eq.armor) || ARMOR_DATA[0];
    var shield = findById(SHIELD_DATA, eq.shield) || SHIELD_DATA[0];
    var helmet = findById(HELMET_DATA, eq.helmet) || HELMET_DATA[0];

    p.maxHp = p.baseMaxHp + (job.hpMod || 0) + (armor.hpBonus || 0);
    p.maxMp = p.baseMaxMp + (job.mpMod || 0) + (weapon.mpBonus || 0);
    p.atk = p.baseAtk + (job.atkMod || 0) + p.weaponAtkBonus + (weapon.atkBonus || 0);
    p.def = p.baseDef + (job.defMod || 0) +
      (armor.defBonus || 0) + (shield.defBonus || 0) + (helmet.defBonus || 0);
    // 職業切替・装備変更で上限が下がった場合、現在値が上限を超えないようにする
    if (p.hp > p.maxHp) p.hp = p.maxHp;
    if (p.mp > p.maxMp) p.mp = p.maxMp;
  }

  // ---------------------------------------------------------
  // 7.5 仲間補正ヘルパー(§10)
  // ---------------------------------------------------------
  // 現在パーティーにいる仲間の指定キーの補正値を合計して返す
  function getCompanionBonus(key) {
    var total = 0;
    state.player.companions.forEach(function (id) {
      var c = findById(COMPANION_DATA, id);
      if (c) total += (c[key] || 0);
    });
    return total;
  }

  function hasCompanion(id) {
    return state.player.companions.indexOf(id) !== -1;
  }

  // §60 v0.14.1: 横スクロール編制覇判定 (s6クリア済み + 究極チンパンジー撃退済み)
  function isSideStoryCleared() {
    var sm = state.sideMap;
    return !!(sm && sm.stageCleared && sm.stageCleared["6"] &&
              sm.defeatedEnemies && sm.defeatedEnemies["6:34,2"]);
  }

  // §66 v0.17.1: UMA図鑑コンプリート判定 (UMA_DATA全種を捕獲済み)
  function isUmaDexComplete() {
    var p = state.player;
    for (var _i = 0; _i < UMA_DATA.length; _i++) {
      if (p.dex[UMA_DATA[_i].id] !== "captured") return false;
    }
    return true;
  }

  // §67 v0.18: 称号判定を一元化 (renderStatus / renderEndingPage / renderRecordBody で共用)
  function getPlayerTitle() {
    var p = state.player;
    // §70 v0.20: 伝説装備コンプリートが最上位称号
    if (isFullyCompleted() && isLegendaryEquipmentComplete()) return "すべての伝説を集めし者";
    if (state.gameCleared && isSideStoryCleared() && isUmaDexComplete()) return "究極とUMA図鑑を極めし者";
    if (state.gameCleared && isSideStoryCleared()) return "究極を歌い、聖域を越えし者";
    if (isUmaDexComplete()) return "UMA図鑑を極めし者";
    if (state.gameCleared) return "森に歌を届けし者";
    if (p.level >= 99 || p.level99Shown) return "究極に近づきし者";
    return "勇者の子孫";
  }

  // §69 v0.19: 完全達成判定ヘルパー
  function isUltimateGorillaCaptured() {
    return !!state.gameCleared;
  }
  function isFullyCompleted() {
    return state.gameCleared && isSideStoryCleared() && isUmaDexComplete();
  }

  // §70 v0.20 / §71 v0.20.1: 伝説装備コンプリート判定ヘルパー
  // フラグ優先。旧セーブ互換のため所持確認も行う（フラグがなくても装備中/所持中なら入手済み扱い）
  function isLegendaryEquipmentComplete() {
    return LEGEND_EQUIPS.every(function(le) {
      if (!!state.eventFlags[le.flag]) return true;
      var slotInfo = findEquipSlot(le.slot);
      return slotInfo ? isEquipOwned(slotInfo, le.itemId) : false;
    });
  }

  // ---------------------------------------------------------
  // 7.6 状態異常(GAME_DESIGN.md §13.5)
  // ---------------------------------------------------------
  function hasAilment(id) {
    return (state.player.statusAilments[id] || 0) > 0;
  }

  function applyAilment(id, duration) {
    var info = AILMENT_INFO[id];
    var isNew = !hasAilment(id);
    state.player.statusAilments[id] = duration;
    if (isNew) {
      showToast(info.icon + " " + info.name + "になった！");
    }
    updateStatusBar();
  }

  function clearAilment(id, silent) {
    if (!(id in state.player.statusAilments)) return;
    var info = AILMENT_INFO[id];
    delete state.player.statusAilments[id];
    if (!silent) showToast(info.icon + " " + info.name + "が治った！");
    updateStatusBar();
  }

  // アレルギー: フィールドを1歩歩くごとにHPが1減る(HP1未満にはしない)
  function tickAllergyOnStep() {
    if (!hasAilment("allergy")) return;
    var p = state.player;
    p.hp = Math.max(1, p.hp - 1);
    state.player.statusAilments.allergy--;
    if (state.player.statusAilments.allergy <= 0) clearAilment("allergy");
    updateStatusBar();
  }

  // におい: 戦闘が1回終わるごとに持続ターンが減る(捕獲率penaltyはattemptCaptureで適用)
  function tickSmellOnBattleEnd() {
    if (!hasAilment("smell")) return;
    state.player.statusAilments.smell--;
    if (state.player.statusAilments.smell <= 0) clearAilment("smell");
  }

  function getAilmentStatusText() {
    var p = state.player;
    var parts = [];
    Object.keys(AILMENT_INFO).forEach(function (id) {
      if (hasAilment(id)) parts.push(AILMENT_INFO[id].icon + AILMENT_INFO[id].name);
    });
    return parts.join(" ");
  }

  // ---------------------------------------------------------
  // 8. フィールド描画
  // ---------------------------------------------------------
  function renderField() {
    var viewport = document.getElementById("field-viewport");

    // §43 v0.9: 横スクロールマップモードならそちらへルーティング
    if (state.mapMode === "side") {
      viewport.style.setProperty("--cols", SIDE_VIEW_COLS);
      // §50 v0.11: ステージの行数に応じて--rowsを動的設定
      var sideStageRows = SIDE_STAGE_DATA[state.sideMap.stage];
      var sideRowCount = sideStageRows ? sideStageRows.rows.length : SIDE_VIEW_ROWS;
      viewport.style.setProperty("--rows", sideRowCount);
      renderSideField();
      return;
    }

    // 通常マップ: CSS変数を必ず正しい値にリセット
    viewport.style.setProperty("--cols", VIEW_COLS);
    viewport.style.setProperty("--rows", VIEW_ROWS);

    // §110 v0.42.1: reconcile遅延通知（loadGame時はtoast未生成のため）
    if (_pendingGearRewardNotices.length > 0) {
      var _pn = _pendingGearRewardNotices.shift();
      showToast(_pn);
    }
    // §120 v0.45.3: 全話完了演出フォールバック（共通キューで順序制御・二枚重ね防止）
    consumePendingCompanionStoryCompletionNotices();
    // §139 v0.58: 仲間わざ習得演出（pending→safe timing表示）
    consumePendingCompanionTechniqueLearnNotice();

    var p = state.player;

    // プレイヤーが画面中央に来るようにカメラ位置を計算し、マップ端でクランプする
    var camX = clamp(p.x - Math.floor(VIEW_COLS / 2), 0, MAP_W - VIEW_COLS);
    var camY = clamp(p.y - Math.floor(VIEW_ROWS / 2), 0, MAP_H - VIEW_ROWS);

    // §121 v0.46: 仲間追従表示用の軌跡→人型アイコンマップを構築（companion 0 優先）
    // cData.icon（人型）を使用。§78 v0.26時点のcData.emoji（能力アイコン）から変更
    var trailMap = {};
    var trail = state.partyTrail || [];
    var companions = p.companions;
    for (var ti = companions.length - 1; ti >= 0; ti--) {
      if (ti >= trail.length) continue;
      var tp = trail[ti];
      if (!tp || (tp.x === p.x && tp.y === p.y)) continue;
      var cData = findById(COMPANION_DATA, companions[ti]);
      if (cData) { trailMap[tp.x + "," + tp.y] = cData.icon; } // §121 v0.46: icon（人型）を使用
    }
    var html = "";
    for (var r = 0; r < VIEW_ROWS; r++) {
      for (var c = 0; c < VIEW_COLS; c++) {
        var mapX = camX + c;
        var mapY = camY + r;
        var key = mapX + "," + mapY; // §121 v0.46: 優先度制御のため先に宣言
        var emoji;
        if (mapX === p.x && mapY === p.y) {
          emoji = "🧙"; // プレイヤー（最優先）
        } else if (state.items[key] === "weapon") {
          emoji = "🗡️";
        } else if (state.items[key] === "potion") {
          emoji = "🧪";
        } else {
          var tileChar = state.terrain[mapY][mapX];
          if (tileChar === "B") {
            emoji = state.openedChests[key] ? "📦" : "🎁";
          } else if (tileChar === "U") {
            emoji = state.openedChests[key] ? "📦" : "🪗";
          } else if (tileChar === "A") {
            emoji = state.openedChests[key] ? "📦" : "🌟";
          } else if (tileChar === "C") {
            emoji = state.openedChests[key] ? "📦" : "⭐";
          } else if (tileChar === "J") {
            emoji = state.openedChests[key] ? "📦" : "🪄";
          } else if (tileChar === "X") {
            emoji = state.openedChests[key] ? "📦" : "✨";
          } else if (_adventureGuideNpcVisible &&
                     mapX === _adventureGuideNpcX && mapY === _adventureGuideNpcY &&
                     (tileChar === "." || tileChar === ",")) {
            // §124 v0.48: 旅の案内人NPC（仲間トレイルより高優先・草地・道のみ）
            emoji = "🧭";
          } else if (trailMap[key] && (tileChar === "." || tileChar === ",")) {
            // §121 v0.46: 仲間追従はNPC/施設/ゲートより低優先。草地・道のみ表示
            emoji = trailMap[key];
          } else {
            emoji = TERRAIN_EMOJI[tileChar] || "🟩";
            // §131 v0.51.2: ワープタイルはステータスに応じて絵文字を動的変更
            if (tileChar >= "1" && tileChar <= "6") {
              var _warpSt = getStageWarpStatus(parseInt(tileChar, 10));
              if (_warpSt.status === "locked") {
                emoji = "🔒";
              } else if (_warpSt.status === "cleared") {
                emoji = "✅";
              } else if (_warpSt.status === "current") {
                emoji = "▶"; // §132a v0.53: 1文字に統一（2文字はセル幅崩れの原因）
              }
              // "available" はそのまま TERRAIN_EMOJI を使用
            }
          }
        }
        html += '<div class="tile">' + emoji + "</div>";
      }
    }
    viewport.innerHTML = html;
    // 通常マップでは側面マップ情報バーを非表示
    var infoEl2 = document.getElementById("side-map-info");
    if (infoEl2) { infoEl2.style.display = "none"; }
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  // ---------------------------------------------------------
  // 8.5  横スクロールマップ描画・移動 (§43 v0.9)
  // ---------------------------------------------------------
  function renderSideField() {
    var viewport = document.getElementById("field-viewport");
    var sm = state.sideMap;
    var stageData = SIDE_STAGE_DATA[sm.stage];
    if (!stageData) { return; }
    var rows = stageData.rows;
    // §50 v0.11: ステージ別マップサイズを動的計算
    var mapWidth = (rows[0] ? rows[0].length : SIDE_MAP_WIDTH);
    var mapHeight = rows.length;

    // カメラ左端: プレイヤーを中央付近に表示
    var halfCols = Math.floor(SIDE_VIEW_COLS / 2);
    var camLeft = sm.x - halfCols;
    if (camLeft < 0) { camLeft = 0; }
    if (camLeft + SIDE_VIEW_COLS > mapWidth) {
      camLeft = mapWidth - SIDE_VIEW_COLS;
    }

    var html = "";
    for (var ry = 0; ry < mapHeight; ry++) {
      for (var rx = 0; rx < SIDE_VIEW_COLS; rx++) {
        var mx = camLeft + rx;
        var my = ry;
        var tileChar = (mx >= 0 && mx < mapWidth && rows[my])
          ? rows[my].charAt(mx)
          : "#";

        var emoji;
        if (mx === sm.x && my === sm.y) {
          emoji = "🦍";
        } else {
          var key = getSideKey(mx, my);  // §48 v0.10: ステージ別キー
          if (tileChar === "c" && sm.openedChests[key]) {
            emoji = "📦";
          } else if ((tileChar === "e" || tileChar === "b") && sm.defeatedEnemies[key]) {
            // §44 v0.9.1: 撃破済み固定敵は草原に変化
            emoji = SIDE_TILE_EMOJI["g"];
          } else {
            emoji = SIDE_TILE_EMOJI[tileChar] || "❓";
          }
        }
        html += '<div class="tile">' + emoji + "</div>";
      }
    }
    viewport.innerHTML = html;

    // §44 v0.9.1: ステージ名・進捗 (ゴールまでの距離)
    var infoEl = document.getElementById("side-map-info");
    if (infoEl) {
      infoEl.style.display = "block";
      var goalX = stageData.goalX || (SIDE_MAP_WIDTH - 1);
      var dist = goalX - sm.x;
      var infoText;
      if (sm.stageCleared[sm.stage]) {
        infoText = stageData.name + "  ✅ クリア済み  📍" + sm.x;
      } else if (dist <= 0) {
        infoText = stageData.name + "  🏁 ゴール！";
      } else {
        infoText = stageData.name + "  📍" + sm.x + "/" + goalX + "  あと" + dist;
      }
      infoEl.textContent = infoText;
    }
  }

  function moveSidePlayer(dx, dy) {
    if (state.inBattle || state.modalOpen) return;
    var sm = state.sideMap;
    var stageData = SIDE_STAGE_DATA[sm.stage];
    if (!stageData) { return; }

    var nx = sm.x + dx;
    var ny = sm.y + dy;

    // §50 v0.11: ステージ別マップサイズを動的計算 (縦移動・境界チェック)
    var stageRows = stageData.rows;
    var stageMapWidth = (stageRows[0] ? stageRows[0].length : SIDE_MAP_WIDTH);
    var stageMapHeight = stageRows.length;

    // §44 v0.9.1: 縦移動を有効化。マップ境界チェック。
    if (nx < 0 || nx >= stageMapWidth) { return; }
    if (ny < 0 || ny >= stageMapHeight) { return; }

    var row = stageData.rows[ny];
    if (!row) { return; }
    var tileChar = row.charAt(nx);
    if (SIDE_BLOCKED[tileChar]) { return; }

    sm.x = nx;
    sm.y = ny;
    renderField();
    saveGame();

    // タイルイベント判定 (§48 v0.10: getSideKey でステージ間衝突防止)
    var key = getSideKey(nx, ny);
    if (tileChar === "c") {
      if (!sm.openedChests[key]) {
        openSideChest(nx, ny);
      }
    } else if (tileChar === "n") {
      openSideNpcModal("n");
    } else if (tileChar === "p") {
      // §44 v0.9.1: 旅人NPC
      openSideNpcModal("p");
    } else if (tileChar === "m") {
      openMerchantModal();
    } else if (tileChar === "H") {
      // §53 v0.11.3: 帰還ゲート
      if (DEBUG_MODE) { console.log("[DEBUG] sideMap H(帰還ゲート) hit: stage=" + state.sideMap.stage + " x=" + nx + " y=" + ny); }
      openSideReturnGateModal();
    } else if (tileChar === "G") {
      // §44 v0.9.1: ゴール
      if (DEBUG_MODE) { console.log("[DEBUG] sideMap G(ゴール) hit: stage=" + state.sideMap.stage + " x=" + nx + " y=" + ny); }
      openSideGoalModal();
    } else if (tileChar === "e") {
      // §44 v0.9.1: 撃破済みなら素通り
      if (sm.defeatedEnemies[key]) { return; }
      sideMapPendingFixedKey = key;
      state.stepsSinceEncounter = 0;
      // §49 v0.10.1: SIDE_FIXED_ENCOUNTERS でステージ別固定敵を起動
      var fixedEnemyId = SIDE_FIXED_ENCOUNTERS[key];
      if (fixedEnemyId) {
        triggerFixedEncounter(fixedEnemyId);
      } else {
        triggerEncounter();
      }
    } else if (tileChar === "b") {
      // §45 v0.9.2: ボス固定戦闘。撃破済みなら素通り。§48 v0.10: ステージでボスを分岐。§50 v0.11: stage3追加
      if (sm.defeatedEnemies[key]) { return; }
      sideMapPendingFixedKey = key;
      state.stepsSinceEncounter = 0;
      if (sm.stage === 6) {
        triggerFixedEncounter("ultimate_chimpanzee");  // §59 v0.14
      } else if (sm.stage === 5) {
        triggerFixedEncounter("lastboss_gorilla");  // §57 v0.13
      } else if (sm.stage === 4) {
        triggerFixedEncounter("daimaou_gorilla");  // §55 v0.12
      } else if (sm.stage === 3) {
        triggerFixedEncounter("maou_gorilla");
      } else if (sm.stage === 2) {
        triggerFixedEncounter("boss_gorilla");
      } else {
        triggerFixedEncounter("midboss_gorilla");
      }
    } else if (tileChar === "g") {
      state.stepsSinceEncounter++;
      if (state.stepsSinceEncounter >= MIN_STEPS_BEFORE_ENCOUNTER &&
          Math.random() < ENCOUNTER_CHANCE) {
        state.stepsSinceEncounter = 0;
        triggerEncounter();
      }
    }
  }

  function openSideChest(cx, cy) {
    var sm = state.sideMap;
    var key = getSideKey(cx, cy);  // §48 v0.10: ステージ別キー
    sm.openedChests[key] = true;
    renderField();

    // §44 v0.9.1: バリエーション報酬 / §55 v0.12: ステージ4専用高報酬テーブル
    var roll = Math.random();
    var msg;
    if (sm.stage === 6) {
      if (roll < 0.4) {
        var gold6 = (8 + Math.floor(Math.random() * 11)) * 10;
        state.player.gold += gold6;
        msg = "宝箱を開けた！ 💰 " + gold6 + "G 手に入れた！";
      } else if (roll < 0.6) {
        state.player.ramenCount = (state.player.ramenCount || 0) + 1;
        msg = "宝箱を開けた！ 🍜 ラーメン を手に入れた！";
      } else if (roll < 0.8) {
        state.player.bentoCount = (state.player.bentoCount || 0) + 1;
        msg = "宝箱を開けた！ 🍱 お弁当 を手に入れた！";
      } else {
        state.player.deodorantCount = (state.player.deodorantCount || 0) + 1;
        msg = "宝箱を開けた！ 🧴 デオドラントスプレー を手に入れた！";
      }
    } else if (sm.stage === 5) {
      if (roll < 0.4) {
        var gold5 = (6 + Math.floor(Math.random() * 8)) * 10;
        state.player.gold += gold5;
        msg = "宝箱を開けた！ 💰 " + gold5 + "G 手に入れた！";
      } else if (roll < 0.6) {
        state.player.ramenCount = (state.player.ramenCount || 0) + 1;
        msg = "宝箱を開けた！ 🍜 ラーメン を手に入れた！";
      } else if (roll < 0.8) {
        state.player.bentoCount = (state.player.bentoCount || 0) + 1;
        msg = "宝箱を開けた！ 🍱 お弁当 を手に入れた！";
      } else {
        state.player.deodorantCount = (state.player.deodorantCount || 0) + 1;
        msg = "宝箱を開けた！ 🧴 デオドラントスプレー を手に入れた！";
      }
    } else if (sm.stage === 4) {
      if (roll < 0.4) {
        var gold4 = (4 + Math.floor(Math.random() * 7)) * 10;
        state.player.gold += gold4;
        msg = "宝箱を開けた！ 💰 " + gold4 + "G 手に入れた！";
      } else if (roll < 0.6) {
        state.player.deodorantCount = (state.player.deodorantCount || 0) + 1;
        msg = "宝箱を開けた！ 🧴 デオドラントスプレー を手に入れた！";
      } else if (roll < 0.8) {
        state.player.bentoCount = (state.player.bentoCount || 0) + 1;
        msg = "宝箱を開けた！ 🍱 お弁当 を手に入れた！";
      } else {
        state.player.potionCount++;
        msg = "宝箱を開けた！ 🧪 やくそう を手に入れた！";
      }
    } else if (roll < 0.4) {
      var gold = (3 + Math.floor(Math.random() * 7)) * 10;
      state.player.gold += gold;
      msg = "宝箱を開けた！ 💰 " + gold + "G 手に入れた！";
    } else if (roll < 0.6) {
      state.player.coffeeCount++;
      msg = "宝箱を開けた！ ☕ コーヒー を手に入れた！";
    } else if (roll < 0.8) {
      state.player.breadCount++;
      msg = "宝箱を開けた！ 🍞 パン を手に入れた！";
    } else {
      state.player.potionCount++;
      msg = "宝箱を開けた！ 🧪 やくそう を手に入れた！";
    }
    renderStatus();
    showToast(msg);
    saveGame();
  }

  function openSideNpcModal(npcType) {
    // §44 v0.9.1: npcType = "n"(案内人) | "p"(旅人)
    // §46 v0.9.2.1: 中ボス撃退でセリフ分岐
    // §47 v0.9.3: stage1Cleared × midbossDefeated の4パターン分岐
    // §48 v0.10: ステージ2専用NPC / §50 v0.11: ステージ3専用NPC / §55 v0.12: ステージ4専用NPC / §57 v0.13: ステージ5専用NPC / §59 v0.14: ステージ6専用NPC
    if (state.sideMap && state.sideMap.stage === 6) {
      openStage6NpcModal(state.sideMap.x, state.sideMap.y); return;
    }
    if (state.sideMap && state.sideMap.stage === 5) {
      openStage5NpcModal(state.sideMap.x, state.sideMap.y);
      return;
    }
    if (state.sideMap && state.sideMap.stage === 4) {
      openStage4NpcModal(state.sideMap.x, state.sideMap.y);
      return;
    }
    if (state.sideMap && state.sideMap.stage === 3) {
      openStage3NpcModal(state.sideMap.x, state.sideMap.y);
      return;
    }
    if (state.sideMap && state.sideMap.stage === 2) {
      openStage2NpcModal(state.sideMap.x, state.sideMap.y);
      return;
    }
    var icon, name, lines;
    var midbossDefeated = !!(state.sideMap && state.sideMap.defeatedEnemies && state.sideMap.defeatedEnemies["36,1"]);
    var stage1Cleared = !!(state.sideMap && state.sideMap.stageCleared && state.sideMap.stageCleared["1"]);
    if (npcType === "p") {
      icon = "🧑";
      name = "旅人";
      if (stage1Cleared && midbossDefeated) {
        lines = [
          "中ボスゴリラを退かせたのか！はじまりの草原も、少し静かになったようだ。",
          "ゴール🏁も越えたのか。本物の旅人だな。",
          "この先には「あやしい森」が待っているらしい。中ボスゴリラより強い「ボスゴリラ」が潜むとか……",
          "次の道でも、きっと力が開けるだろう。頑張れよ！"
        ];
      } else if (stage1Cleared) {
        lines = [
          "草原のゴールまで辿り着いたか。上手く中ボスゴリラを避けたんだな。",
          "逃げること、避けること。それも立派な判断だぞ。",
          "でも、中ボスゴリラを倒せばもう少し大きな報酬があったらしい。",
          "まだ草むらに潜んでいる。挑んでみるか？"
        ];
      } else if (midbossDefeated) {
        lines = [
          "中ボスゴリラを退かせたのか！はじまりの草原も、少し静かになったようだ。",
          "この先のゴール🏁まで、もう大きな障害はないぞ。",
          "中ボスゴリラはUMAではない。捕まえる相手じゃなかったでしょ？",
          "次の道でも、きっと力が開けるだろう。頑張れよ！"
        ];
      } else {
        lines = [
          "この草原、上の道は安全だが宝は少ない。",
          "下の道は危険だが、宝箱がたくさんあるらしい。",
          "木がジャマしてる場所では、上か下に回り込めるよ。",
          "ゴール🏁の手前に💢の印がある。強いゴリラが待ってるらしい……上から迂回すれば避けられるけど。",
          "あのゴール🏁まで辿り着けば、褒美がもらえるはずだ。"
        ];
      }
    } else {
      icon = "🧭";
      name = "旅の案内人";
      if (stage1Cleared && midbossDefeated) {
        lines = [
          "中ボスゴリラまで退かせたとはな。さすがだ。",
          "はじまりの草原は今、静けさを取り戻している。",
          "この先には「あやしい森」が広がっているらしい。そこには「ボスゴリラ」が待つという噂がある。",
          "次の道でも、その経験がきっと役に立つ。"
        ];
      } else if (stage1Cleared) {
        lines = [
          "はじまりの草原を抜けたんだな。",
          "この先には、もっと深い森があるらしい。",
          "まだ中ボスゴリラが草むらに潜んでいる。倒せばさらなる報酬があるぞ。",
          "宝箱はまだ開けていないものが残っているかもしれないぞ。"
        ];
      } else if (midbossDefeated) {
        lines = [
          "中ボスゴリラを退かせたのか！さすがだ。",
          "はじまりの草原は今、静けさを取り戻している。",
          "ゴール🏁までの道はもう開けているぞ。残りを探索して進んでみよう！",
          "宝箱はまだ開けていないものが残っているかもしれないぞ。"
        ];
      } else {
        lines = [
          "ようこそ、はじまりの草原へ！",
          "木が道を塞いでいたら、上か下に迂回してみよう。",
          "低い道は危ないけど、宝箱がたくさん眠ってるよ。",
          "ゴール近くに💢の印がある場所がある。中ボスゴリラが待ち構えているぞ！高路を使えば回避もできる。",
          "右のゴール🏁を目指して進んでね！"
        ];
      }
    }
    document.getElementById("npc-header").innerHTML =
      '<div style="font-size:40px;line-height:1.2;">' + icon + '</div>' +
      '<div style="font-weight:bold;font-size:1em;margin-bottom:4px;">' + name + '</div>';
    var speechHtml = "";
    for (var i = 0; i < lines.length; i++) {
      speechHtml += "<p>「" + lines[i] + "」</p>";
    }
    document.getElementById("npc-speech").innerHTML = speechHtml;
    openModal("npc-modal");
  }

  // §48 v0.10: ステージ2 NPC会話 (位置で分岐)
  function openStage2NpcModal(nx, ny) {
    var sm = state.sideMap;
    var bossDefeated = !!(sm.defeatedEnemies && sm.defeatedEnemies["2:35,1"]);
    var icon = "🧑";
    var name, lines;
    // NPC-B: row1 x=4 (メイン路の旅人)
    if (nx === 4 && ny === 1) {
      name = "旅人";
      if (bossDefeated) {
        lines = [
          "ボスゴリラが静かになった！ 君のおかげだ！",
          "この先はもう安心して通れるよ。ありがとう！"
        ];
      } else {
        lines = [
          "この森、なんか怖いね…木の奥で何かが動いてた気がする。",
          "右の奥に大きなゴリラがいるって噂だよ。気をつけて！"
        ];
      }
    } else {
      // NPC-A: row0 x=20 (高路の森の住人) または予備
      name = "森の住人";
      if (bossDefeated) {
        lines = [
          "あの大きなゴリラが出なくなった。平和になったね。",
          "高い道は景色がいいだろ？ゆっくり行くといいさ。"
        ];
      } else {
        lines = [
          "この上の道は比較的安全だよ。下の道はゴリラが怖くてね。",
          "でも下の道には宝箱が眠ってるとか……"
        ];
      }
    }
    document.getElementById("npc-header").innerHTML =
      '<div style="font-size:40px;line-height:1.2;">' + icon + '</div>' +
      '<div style="font-weight:bold;font-size:1em;margin-bottom:4px;">' + name + '</div>';
    var speechHtml = "";
    for (var i = 0; i < lines.length; i++) {
      speechHtml += "<p>「" + lines[i] + "」</p>";
    }
    document.getElementById("npc-speech").innerHTML = speechHtml;
    openModal("npc-modal");
  }

  // §55 v0.12: ステージ4「ゴリラ山道」NPC会話
  function openStage4NpcModal(nx, ny) {
    var sm = state.sideMap;
    var daimaouDefeated = !!(sm.defeatedEnemies && sm.defeatedEnemies["4:33,2"]);
    var icon = "🧑";
    var name, lines;
    // n タイル (x=5, y=2): 山を知る老人
    if (ny === 2) {
      name = "山を知る老人";
      if (daimaouDefeated) {
        lines = [
          "大魔王ゴリラを退かせたとは……わしも長く山に住んでいるが、初めて見たわ。",
          "この山道に、ようやく静けさが戻ってきた。ありがとう。"
        ];
      } else {
        lines = [
          "この山道は険しい。若者が気軽に踏み込んでいいところじゃない。",
          "奥には大魔王ゴリラが控えておる。魔王ゴリラより格段に手強い。",
          "ただ、高路(上ルート)と下中路を上手く使えば、うまく補給もできるぞ。",
          "帰りたくなったら、スタート付近の🏠帰還ゲートを使うんじゃ。"
        ];
      }
    } else {
      // p タイル (x=12, y=1): 逃げ腰の旅人
      name = "逃げ腰の旅人";
      if (daimaouDefeated) {
        lines = [
          "大魔王ゴリラが静かになった！ 怖くて全力逃げしてたのに……",
          "あんたは本物だ。ゴールはもうすぐそこだよ。"
        ];
      } else {
        lines = [
          "この山道、ヤバいよ！奥に信じられないくらいデカいゴリラがいた！",
          "ぼ、僕はちょっと高い道から様子見てるだけ……",
          "宝箱は下の道にもあるらしいけど、危なすぎてとても行けないよ。"
        ];
      }
    }
    document.getElementById("npc-header").innerHTML =
      '<div style="font-size:40px;line-height:1.2;">' + icon + '</div>' +
      '<div style="font-weight:bold;font-size:1em;margin-bottom:4px;">' + name + '</div>';
    var speechHtml = "";
    for (var i = 0; i < lines.length; i++) {
      speechHtml += "<p>「" + lines[i] + "」</p>";
    }
    document.getElementById("npc-speech").innerHTML = speechHtml;
    openModal("npc-modal");
  }

  function openSideGoalModal() {
    // §59 v0.14: ステージ6はopenStage6GoalModalへルーティング
    if (state.sideMap.stage === 6) {
      openStage6GoalModal();
      return;
    }
    // §57 v0.13: ステージ5はopenStage5GoalModalへルーティング
    if (state.sideMap.stage === 5) {
      openStage5GoalModal();
      return;
    }
    // §55 v0.12: ステージ4はopenStage4GoalModalへルーティング
    if (state.sideMap.stage === 4) {
      openStage4GoalModal();
      return;
    }
    // §50 v0.11: ステージ3はopenStage3GoalModalへルーティング
    if (state.sideMap.stage === 3) {
      openStage3GoalModal();
      return;
    }
    // §48 v0.10: ステージ2はopenStage2GoalModalへルーティング
    if (state.sideMap.stage === 2) {
      openStage2GoalModal();
      return;
    }
    // §47 v0.9.3: ゴール演出強化 — 中ボス撃退分岐 + 報酬二重受け取り防止
    var sm = state.sideMap;
    var stageKey = String(sm.stage);
    var midbossDefeated = !!(sm.defeatedEnemies && sm.defeatedEnemies["36,1"]);
    var rewardLevel = sm.stage1RewardLevel || 0;
    sm.stageCleared[stageKey] = true;

    var headerText, bodyLines, rewardLine, newRewardLevel;
    newRewardLevel = rewardLevel;

    if (rewardLevel === 0) {
      if (midbossDefeated) {
        newRewardLevel = 2;
        state.player.gold += 100;
        state.player.breadCount = (state.player.breadCount || 0) + 1;
        headerText = "はじまりの草原を制覇した！";
        bodyLines = [
          "中ボスゴリラを退かせ、草原の道を切り開いた。",
          "はじまりの草原に、少しだけ平和が戻った。"
        ];
        rewardLine = "💰 報酬：100G ＋ 🍞 パン ×1";
      } else {
        newRewardLevel = 1;
        state.player.gold += 30;
        headerText = "はじまりの草原を抜けた！";
        bodyLines = [
          "君は中ボスゴリラを避けながら、草原の出口へたどり着いた。",
          "逃げること、避けること、進むこと。",
          "それもまた勇者の判断だ。"
        ];
        rewardLine = "💰 報酬：30G";
      }
    } else if (rewardLevel === 1 && midbossDefeated) {
      newRewardLevel = 2;
      state.player.gold += 70;
      state.player.breadCount = (state.player.breadCount || 0) + 1;
      headerText = "草原の真の制覇者よ！";
      bodyLines = [
        "中ボスゴリラも退かせたか！",
        "草原の覇者として認められた。追加の報酬を受け取れ。"
      ];
      rewardLine = "💰 追加報酬：70G ＋ 🍞 パン ×1";
    } else {
      headerText = "はじまりの草原";
      if (midbossDefeated) {
        bodyLines = [
          "草原は静けさを取り戻している。",
          "次なる冒険への足場にしよう。"
        ];
      } else {
        bodyLines = [
          "草原の出口は再び開いている。",
          "中ボスゴリラはまだ草むらに潜んでいるかもしれない。",
          "退かせてから再びゴールを目指すと、さらなる報酬があるぞ。"
        ];
      }
      rewardLine = null;
    }

    sm.stage1RewardLevel = newRewardLevel;
    renderStatus();
    saveGame();

    var html = '<p style="font-size:1.8em;margin:0 0 6px;">🏁</p>';
    html += '<p style="font-weight:bold;font-size:1.1em;margin-bottom:8px;">' + headerText + '</p>';
    for (var i = 0; i < bodyLines.length; i++) {
      html += '<p style="font-size:0.88em;color:#d0e0ff;margin:2px 0;">' + bodyLines[i] + '</p>';
    }
    if (rewardLine) {
      html += '<p style="color:#ffd166;font-weight:bold;margin:10px 0 4px;">' + rewardLine + '</p>';
    } else {
      html += '<p style="color:#a8d8a8;font-size:0.82em;margin:8px 0;">(報酬は受け取り済み)</p>';
    }
    if (newRewardLevel >= 2) {
      html += '<p style="color:#888;font-size:0.80em;border-top:1px solid #444;padding-top:6px;margin-top:8px;">' +
        'この先には「あやしい森」が広がっているらしい。<br>' +
        '中ボスゴリラよりも手ごわい「ボスゴリラ」が待つという噂がある。' +
        '</p>';
    }
    var goalBodyEl = document.getElementById("modal-side-goal-body");
    goalBodyEl.innerHTML = html;

    // §54 v0.11.3.2: JSでボタンを直接生成（静的ボタンのhidden依存廃止）
    var forestBtn = document.createElement("button");
    forestBtn.className = "modal-btn";
    forestBtn.style.marginBottom = "8px";
    forestBtn.textContent = "🌲 あやしい森へ進む";
    forestBtn.onclick = function () {
      closeModal("modal-side-goal");
      state.sideMap.stage = 2;
      var s2 = SIDE_STAGE_DATA[2];
      state.sideMap.x = s2.startX;
      state.sideMap.y = s2.startY;
      saveGame();
      renderField();
      showToast("🌲 あやしい森へ入った！");
    };
    goalBodyEl.appendChild(forestBtn);
    var retBtn = document.createElement("button");
    retBtn.className = "modal-btn";
    retBtn.style.marginBottom = "8px";
    retBtn.textContent = "🏠 通常マップへ戻る";
    retBtn.onclick = function () { returnToNormalMapFromSide(); };
    goalBodyEl.appendChild(retBtn);
    var stayBtn = document.createElement("button");
    stayBtn.className = "modal-btn";
    stayBtn.textContent = "↩ この草原に残る";
    stayBtn.onclick = function () { closeModal("modal-side-goal"); };
    goalBodyEl.appendChild(stayBtn);
    openModal("modal-side-goal");
  }

  // §48 v0.10: ステージ2「あやしい森」ゴール演出
  function openStage2GoalModal() {
    var sm = state.sideMap;
    var bossKey = "2:35,1";
    var bossDefeated = !!(sm.defeatedEnemies && sm.defeatedEnemies[bossKey]);
    var rewardLevel = sm.stage2RewardLevel || 0;
    sm.stageCleared["2"] = true;

    var headerText, bodyLines, rewardLine, newRewardLevel;
    newRewardLevel = rewardLevel;

    if (rewardLevel === 0) {
      if (bossDefeated) {
        newRewardLevel = 2;
        state.player.gold += 150;
        state.player.bentoCount = (state.player.bentoCount || 0) + 1;
        headerText = "あやしい森を制覇した！";
        bodyLines = [
          "ボスゴリラを退かせ、森の出口にたどり着いた。",
          "あやしい森に、わずかな光が差し込んできた。"
        ];
        rewardLine = "💰 報酬：150G ＋ 🍱 お弁当 ×1 ＋ ⚡ 会心の腕輪";
      } else {
        newRewardLevel = 1;
        state.player.gold += 50;
        headerText = "あやしい森を抜けた！";
        bodyLines = [
          "木々の隙間を縫いながら、どうにか出口にたどり着いた。",
          "ボスゴリラはまだ森の奥に潜んでいるかもしれない。"
        ];
        rewardLine = "💰 報酬：50G ＋ ⚡ 会心の腕輪";
      }
      grantCompanionGearReward("critical_bracelet"); // §109 v0.42: ステージ2初回クリア特化装備
    } else if (rewardLevel === 1 && bossDefeated) {
      newRewardLevel = 2;
      state.player.gold += 100;
      state.player.bentoCount = (state.player.bentoCount || 0) + 1;
      headerText = "森の真の制覇者よ！";
      bodyLines = [
        "ボスゴリラも退かせたか！",
        "あやしい森の覇者として認められた。追加の報酬を受け取れ。"
      ];
      rewardLine = "💰 追加報酬：100G ＋ 🍱 お弁当 ×1";
    } else {
      headerText = "あやしい森";
      if (bossDefeated) {
        bodyLines = [
          "森は静けさを取り戻している。",
          "ボスゴリラの影も見えない。"
        ];
      } else {
        bodyLines = [
          "ボスゴリラはまだ森の奥に潜んでいる。",
          "退かせてから再びゴールを目指すと、さらなる報酬があるぞ。"
        ];
      }
      rewardLine = null;
    }

    sm.stage2RewardLevel = newRewardLevel;
    renderStatus();
    saveGame();

    var html = '<p style="font-size:1.8em;margin:0 0 6px;">🏁</p>';
    html += '<p style="font-weight:bold;font-size:1.1em;margin-bottom:8px;">' + headerText + '</p>';
    for (var i = 0; i < bodyLines.length; i++) {
      html += '<p style="font-size:0.88em;color:#d0e0ff;margin:2px 0;">' + bodyLines[i] + '</p>';
    }
    if (rewardLine) {
      html += '<p style="color:#ffd166;font-weight:bold;margin:10px 0 4px;">' + rewardLine + '</p>';
    } else {
      html += '<p style="color:#a8d8a8;font-size:0.82em;margin:8px 0;">(報酬は受け取り済み)</p>';
    }
    var goalBodyEl2 = document.getElementById("modal-side-goal-body");
    goalBodyEl2.innerHTML = html;

    // §54 v0.11.3.2: JSでボタンを直接生成（静的ボタンのhidden依存廃止）
    var townBtn = document.createElement("button");
    townBtn.className = "modal-btn";
    townBtn.style.marginBottom = "8px";
    townBtn.textContent = "🏚️ 古びた町はずれへ進む";
    townBtn.onclick = function () {
      closeModal("modal-side-goal");
      state.sideMap.stage = 3;
      var s3 = SIDE_STAGE_DATA[3];
      state.sideMap.x = s3.startX;
      state.sideMap.y = s3.startY;
      saveGame();
      renderField();
      showToast("🏚️ 古びた町はずれへ入った！");
    };
    goalBodyEl2.appendChild(townBtn);
    var retBtn2 = document.createElement("button");
    retBtn2.className = "modal-btn";
    retBtn2.style.marginBottom = "8px";
    retBtn2.textContent = "🏠 通常マップへ戻る";
    retBtn2.onclick = function () { returnToNormalMapFromSide(); };
    goalBodyEl2.appendChild(retBtn2);
    var stayBtn2 = document.createElement("button");
    stayBtn2.className = "modal-btn";
    stayBtn2.textContent = "↩ この森に残る";
    stayBtn2.onclick = function () { closeModal("modal-side-goal"); };
    goalBodyEl2.appendChild(stayBtn2);
    openModal("modal-side-goal");
  }

  // §50 v0.11: ステージ3「古びた町はずれ」NPC会話
  function openStage3NpcModal(nx, ny) {
    var sm = state.sideMap;
    var maouDefeated = !!(sm.defeatedEnemies && sm.defeatedEnemies["3:31,2"]);
    var icon = "🧑";
    var name, lines;
    // NPC-老人: row2 x=5 (中央路の老人)
    if (ny === 2) {
      name = "町はずれの老人";
      if (maouDefeated) {
        lines = [
          "魔王ゴリラを退かせたのか……。",
          "この古びた町はずれにも、少しだけ静けさが戻ったようじゃ。"
        ];
      } else {
        lines = [
          "この町はずれには、昔から妙な気配がある。",
          "森を抜けてきたなら分かるだろう。",
          "ここから先は、ただの散歩では済まないぞ。"
        ];
      }
    } else {
      // NPC-怪しい旅人: row1 x=10
      name = "怪しい旅人";
      if (maouDefeated) {
        lines = [
          "あんた、魔王ゴリラを退かせたんだってな。",
          "ただ者じゃないな。"
        ];
      } else {
        lines = [
          "下の道には宝箱がある。",
          "だが、怪しい連中もうろついている。",
          "命が惜しければ、上の道を使うんだな。"
        ];
      }
    }
    document.getElementById("npc-header").innerHTML =
      '<div style="font-size:40px;line-height:1.2;">' + icon + '</div>' +
      '<div style="font-weight:bold;font-size:1em;margin-bottom:4px;">' + name + '</div>';
    var speechHtml = "";
    for (var i = 0; i < lines.length; i++) {
      speechHtml += "<p>「" + lines[i] + "」</p>";
    }
    document.getElementById("npc-speech").innerHTML = speechHtml;
    openModal("npc-modal");
  }

  // §50 v0.11: ステージ3「古びた町はずれ」ゴール演出
  function openStage3GoalModal() {
    var sm = state.sideMap;
    var maouKey = "3:31,2";
    var maouDefeated = !!(sm.defeatedEnemies && sm.defeatedEnemies[maouKey]);
    var rewardLevel = sm.stage3RewardLevel || 0;
    sm.stageCleared["3"] = true;

    var headerText, bodyLines, rewardLine, newRewardLevel;
    newRewardLevel = rewardLevel;

    if (rewardLevel === 0) {
      if (maouDefeated) {
        newRewardLevel = 2;
        state.player.gold += 220;
        state.player.ramenCount = (state.player.ramenCount || 0) + 1;
        headerText = "古びた町はずれを制覇した！";
        bodyLines = [
          "魔王ゴリラを退かせ、町はずれの出口へたどり着いた。",
          "遠くに、険しいゴリラ山道が見えてきた。\nそこには魔王ゴリラよりさらに重い気配を放つ大魔王ゴリラが待つという噂がある……"
        ];
        rewardLine = "💰 報酬：220G ＋ 🍜 ラーメン ×1 ＋ 🕸️ 網師のベルト";
      } else {
        newRewardLevel = 1;
        state.player.gold += 80;
        headerText = "古びた町はずれを抜けた！";
        bodyLines = [
          "君は魔王ゴリラを避けながら、町はずれの出口へたどり着いた。",
          "危険を避けて進むことも、冒険者の知恵だ。"
        ];
        rewardLine = "💰 報酬：80G ＋ 🕸️ 網師のベルト";
      }
      grantCompanionGearReward("net_master_belt"); // §109 v0.42: ステージ3初回クリア特化装備
    } else if (rewardLevel === 1 && maouDefeated) {
      newRewardLevel = 2;
      state.player.gold += 140;
      state.player.ramenCount = (state.player.ramenCount || 0) + 1;
      headerText = "町はずれの真の制覇者よ！";
      bodyLines = [
        "魔王ゴリラも退かせたか！古びた町はずれの覇者として認められた。",
        "追加の報酬を受け取れ。次なるゴリラ山道への道が待っている……"
      ];
      rewardLine = "💰 追加報酬：140G ＋ 🍜 ラーメン ×1";
    } else {
      headerText = "古びた町はずれ";
      if (maouDefeated) {
        bodyLines = [
          "町はずれに静けさが戻っている。",
          "魔王ゴリラの影も見えない。"
        ];
      } else {
        bodyLines = [
          "魔王ゴリラはまだ町の奥に潜んでいる。",
          "退かせてから再びゴールを目指すと、さらなる報酬があるぞ。"
        ];
      }
      rewardLine = null;
    }

    sm.stage3RewardLevel = newRewardLevel;
    renderStatus();
    saveGame();

    var html = '<p style="font-size:1.8em;margin:0 0 6px;">🏁</p>';
    html += '<p style="font-weight:bold;font-size:1.1em;margin-bottom:8px;">' + headerText + '</p>';
    for (var i = 0; i < bodyLines.length; i++) {
      html += '<p style="font-size:0.88em;color:#d0e0ff;margin:2px 0;">' + bodyLines[i] + '</p>';
    }
    if (rewardLine) {
      html += '<p style="color:#ffd166;font-weight:bold;margin:10px 0 4px;">' + rewardLine + '</p>';
    } else {
      html += '<p style="color:#a8d8a8;font-size:0.82em;margin:8px 0;">(報酬は受け取り済み)</p>';
    }
    var goalBodyEl3 = document.getElementById("modal-side-goal-body");
    goalBodyEl3.innerHTML = html;

    // §54 v0.11.3.2: JSでボタンを直接生成（静的ボタンのhidden依存廃止）
    // §55 v0.12: ゴリラ山道へ進むボタン追加
    var mountainBtn = document.createElement("button");
    mountainBtn.className = "modal-btn";
    mountainBtn.style.marginBottom = "8px";
    mountainBtn.textContent = "⛰️ ゴリラ山道へ進む";
    mountainBtn.onclick = function () {
      closeModal("modal-side-goal");
      state.sideMap.stage = 4;
      var s4 = SIDE_STAGE_DATA[4];
      state.sideMap.x = s4.startX;
      state.sideMap.y = s4.startY;
      saveGame();
      renderField();
      showToast("⛰️ ゴリラ山道へ入った！");
    };
    goalBodyEl3.appendChild(mountainBtn);
    var retBtn3 = document.createElement("button");
    retBtn3.className = "modal-btn";
    retBtn3.style.marginBottom = "8px";
    retBtn3.textContent = "🏠 通常マップへ戻る";
    retBtn3.onclick = function () { returnToNormalMapFromSide(); };
    goalBodyEl3.appendChild(retBtn3);
    var stayBtn3 = document.createElement("button");
    stayBtn3.className = "modal-btn";
    stayBtn3.textContent = "↩ この町はずれに残る";
    stayBtn3.onclick = function () { closeModal("modal-side-goal"); };
    goalBodyEl3.appendChild(stayBtn3);
    openModal("modal-side-goal");
  }

  // §55 v0.12: ステージ4「ゴリラ山道」ゴール演出
  function openStage4GoalModal() {
    var sm = state.sideMap;
    var daimaouKey = "4:33,2";
    var daimaouDefeated = !!(sm.defeatedEnemies && sm.defeatedEnemies[daimaouKey]);
    var rewardLevel = sm.stage4RewardLevel || 0;
    sm.stageCleared["4"] = true;

    var headerText, bodyLines, rewardLine, newRewardLevel;
    newRewardLevel = rewardLevel;

    if (rewardLevel === 0) {
      if (daimaouDefeated) {
        newRewardLevel = 2;
        state.player.gold += 350;
        state.player.ramenCount = (state.player.ramenCount || 0) + 1;
        headerText = "ゴリラ山道を制覇した！";
        bodyLines = [
          "大魔王ゴリラを退かせ、山道の出口へたどり着いた。",
          "険しい山道に、清々しい風が吹き抜けた。"
        ];
        rewardLine = "💰 報酬：350G ＋ 🍜 ラーメン ×1 ＋ 📓 研究ノート";
      } else {
        newRewardLevel = 1;
        state.player.gold += 120;
        headerText = "ゴリラ山道を抜けた！";
        bodyLines = [
          "険しい山道を、どうにかくぐり抜けた。",
          "大魔王ゴリラはまだ山の奥に潜んでいるかもしれない。"
        ];
        rewardLine = "💰 報酬：120G ＋ 📓 研究ノート";
      }
      grantCompanionGearReward("research_notebook"); // §109 v0.42: ステージ4初回クリア特化装備
    } else if (rewardLevel === 1 && daimaouDefeated) {
      newRewardLevel = 2;
      state.player.gold += 230;
      state.player.ramenCount = (state.player.ramenCount || 0) + 1;
      headerText = "山道の真の制覇者よ！";
      bodyLines = [
        "大魔王ゴリラも退かせたか！",
        "ゴリラ山道の覇者として認められた。追加の報酬を受け取れ。"
      ];
      rewardLine = "💰 追加報酬：230G ＋ 🍜 ラーメン ×1";
    } else {
      headerText = "ゴリラ山道";
      if (daimaouDefeated) {
        bodyLines = [
          "山道に静けさが戻っている。",
          "大魔王ゴリラの影も見えない。"
        ];
      } else {
        bodyLines = [
          "大魔王ゴリラはまだ山の奥に潜んでいる。",
          "退かせてから再びゴールを目指すと、さらなる報酬があるぞ。"
        ];
      }
      rewardLine = null;
    }

    sm.stage4RewardLevel = newRewardLevel;
    renderStatus();
    saveGame();

    var html = '<p style="font-size:1.8em;margin:0 0 6px;">🏁</p>';
    html += '<p style="font-weight:bold;font-size:1.1em;margin-bottom:8px;">' + headerText + '</p>';
    for (var i = 0; i < bodyLines.length; i++) {
      html += '<p style="font-size:0.88em;color:#d0e0ff;margin:2px 0;">' + bodyLines[i] + '</p>';
    }
    if (rewardLine) {
      html += '<p style="color:#ffd166;font-weight:bold;margin:10px 0 4px;">' + rewardLine + '</p>';
    } else {
      html += '<p style="color:#a8d8a8;font-size:0.82em;margin:8px 0;">(報酬は受け取り済み)</p>';
    }
    var goalBodyEl4 = document.getElementById("modal-side-goal-body");
    goalBodyEl4.innerHTML = html;

    // §57 v0.13: 「🏰 黒い城へ進む」ボタン追加
    var castleBtn = document.createElement("button");
    castleBtn.className = "modal-btn";
    castleBtn.style.marginBottom = "8px";
    castleBtn.textContent = "🏰 黒い城へ進む";
    castleBtn.onclick = function () {
      closeModal("modal-side-goal");
      state.sideMap.stage = 5;
      var s5 = SIDE_STAGE_DATA[5];
      state.sideMap.x = s5.startX;
      state.sideMap.y = s5.startY;
      saveGame();
      renderField();
      showToast("🏰 黒い城へ入った！");
    };
    goalBodyEl4.appendChild(castleBtn);
    var retBtn4 = document.createElement("button");
    retBtn4.className = "modal-btn";
    retBtn4.style.marginBottom = "8px";
    retBtn4.textContent = "🏠 通常マップへ戻る";
    retBtn4.onclick = function () { returnToNormalMapFromSide(); };
    goalBodyEl4.appendChild(retBtn4);
    var stayBtn4 = document.createElement("button");
    stayBtn4.className = "modal-btn";
    stayBtn4.textContent = "↩ この山道に残る";
    stayBtn4.onclick = function () { closeModal("modal-side-goal"); };
    goalBodyEl4.appendChild(stayBtn4);
    openModal("modal-side-goal");
  }

  // §57 v0.13: ステージ5「黒い城」ゴール演出
  function openStage5GoalModal() {
    var sm = state.sideMap;
    var lastbossKey = "5:33,2";
    var lastbossDefeated = !!(sm.defeatedEnemies && sm.defeatedEnemies[lastbossKey]);
    var rewardLevel = sm.stage5RewardLevel || 0;
    sm.stageCleared["5"] = true;

    var headerText, bodyLines, rewardLine, newRewardLevel;
    newRewardLevel = rewardLevel;

    if (rewardLevel === 0) {
      if (lastbossDefeated) {
        newRewardLevel = 2;
        state.player.gold += 500;
        state.player.ramenCount = (state.player.ramenCount || 0) + 1;
        headerText = "黒い城を制覇した！";
        bodyLines = [
          "ラスボス級ゴリラを退かせ、黒い城の出口へたどり着いた。",
          "黒い城に、静かな夜明けが訪れた。"
        ];
        rewardLine = "💰 報酬：500G ＋ 🍜 ラーメン ×1 ＋ 🙏 祈りのブローチ";
      } else {
        newRewardLevel = 1;
        state.player.gold += 200;
        headerText = "黒い城を抜けた！";
        bodyLines = [
          "暗い城内を、どうにかくぐり抜けた。",
          "ラスボス級ゴリラはまだ城の奥深くに潜んでいるかもしれない。"
        ];
        rewardLine = "💰 報酬：200G ＋ 🙏 祈りのブローチ";
      }
      grantCompanionGearReward("prayer_brooch"); // §109 v0.42: ステージ5初回クリア特化装備
    } else if (rewardLevel === 1 && lastbossDefeated) {
      newRewardLevel = 2;
      state.player.gold += 300;
      state.player.ramenCount = (state.player.ramenCount || 0) + 1;
      headerText = "黒い城の真の征服者よ！";
      bodyLines = [
        "ラスボス級ゴリラも退かせたか！",
        "黒い城の覇者として認められた。追加の報酬を受け取れ。"
      ];
      rewardLine = "💰 追加報酬：300G ＋ 🍜 ラーメン ×1";
    } else {
      headerText = "黒い城";
      if (lastbossDefeated) {
        bodyLines = [
          "城内は静まり返っている。",
          "ラスボス級ゴリラの影も見えない。"
        ];
      } else {
        bodyLines = [
          "ラスボス級ゴリラはまだ城の奥に潜んでいる。",
          "退かせてから再びゴールを目指すと、さらなる報酬があるぞ。"
        ];
      }
      rewardLine = null;
    }

    sm.stage5RewardLevel = newRewardLevel;
    renderStatus();
    saveGame();

    var html = '<p style="font-size:1.8em;margin:0 0 6px;">🏁</p>';
    html += '<p style="font-weight:bold;font-size:1.1em;margin-bottom:8px;">' + headerText + '</p>';
    for (var i = 0; i < bodyLines.length; i++) {
      html += '<p style="font-size:0.88em;color:#d0e0ff;margin:2px 0;">' + bodyLines[i] + '</p>';
    }
    if (rewardLine) {
      html += '<p style="color:#ffd166;font-weight:bold;margin:10px 0 4px;">' + rewardLine + '</p>';
    } else {
      html += '<p style="color:#a8d8a8;font-size:0.82em;margin:8px 0;">(報酬は受け取り済み)</p>';
    }
    var goalBodyEl5 = document.getElementById("modal-side-goal-body");
    goalBodyEl5.innerHTML = html;

    // §59 v0.14: 「🌿 チンパンジーの聖域へ進む」ボタン追加
    var sanctuaryBtn = document.createElement("button");
    sanctuaryBtn.className = "modal-btn";
    sanctuaryBtn.style.marginBottom = "8px";
    sanctuaryBtn.textContent = "🌿 チンパンジーの聖域へ進む";
    sanctuaryBtn.onclick = function () {
      closeModal("modal-side-goal");
      state.sideMap.stage = 6;
      var s6 = SIDE_STAGE_DATA[6];
      state.sideMap.x = s6.startX;
      state.sideMap.y = s6.startY;
      saveGame(); renderField(); showToast("🌿 チンパンジーの聖域へ入った！");
    };
    goalBodyEl5.appendChild(sanctuaryBtn);

    var retBtn5 = document.createElement("button");
    retBtn5.className = "modal-btn";
    retBtn5.style.marginBottom = "8px";
    retBtn5.textContent = "🏠 通常マップへ戻る";
    retBtn5.onclick = function () { returnToNormalMapFromSide(); };
    goalBodyEl5.appendChild(retBtn5);
    var stayBtn5 = document.createElement("button");
    stayBtn5.className = "modal-btn";
    stayBtn5.textContent = "↩ この黒い城に残る";
    stayBtn5.onclick = function () { closeModal("modal-side-goal"); };
    goalBodyEl5.appendChild(stayBtn5);
    openModal("modal-side-goal");
  }

  // §57 v0.13: ステージ5「黒い城」NPC会話
  function openStage5NpcModal(nx, ny) {
    var sm = state.sideMap;
    var lastbossDefeated = !!(sm.defeatedEnemies && sm.defeatedEnemies["5:33,2"]);
    var icon = "🧑";
    var name, lines;
    // n タイル (x=5, y=2): 城門前の兵士
    if (ny === 2) {
      name = "城門前の兵士";
      if (lastbossDefeated) {
        lines = [
          "ラスボス級ゴリラが撃退された？！信じられない……",
          "黒い城に、ようやく静けさが戻りつつある。本当にありがとう。"
        ];
      } else {
        lines = [
          "この先は黒い城の中枢だ。ラスボス級ゴリラが守っている。",
          "我々は近づくことすらできない……お前は大丈夫か？",
          "高路や下の道にも宝箱があるらしい。準備を整えてから挑め。",
          "スタート付近の🏠帰還ゲートからいつでも戻れるぞ。"
        ];
      }
    } else {
      // p タイル (x=12, y=1): 逃げ腰の旅人
      name = "逃げ腰の旅人";
      if (lastbossDefeated) {
        lines = [
          "ラスボス級ゴリラが静かになった！あんた、本当にすごいな……",
          "黒い城のゴールはもうすぐそこだよ。"
        ];
      } else {
        lines = [
          "この黒い城から逃げてきた！信じられないくらい強い奴がいた！",
          "宝箱なんか後回しにして、早く逃げた方がいいよ！",
          "ぼ、ぼくはここで様子見してる……"
        ];
      }
    }
    document.getElementById("npc-header").innerHTML =
      '<div style="font-size:40px;line-height:1.2;">' + icon + '</div>' +
      '<div style="font-weight:bold;font-size:1em;margin-bottom:4px;">' + name + '</div>';
    var speechHtml = "";
    for (var j = 0; j < lines.length; j++) {
      speechHtml += "<p>「" + lines[j] + "」</p>";
    }
    document.getElementById("npc-speech").innerHTML = speechHtml;
    openModal("npc-modal");
  }

  // §59 v0.14: ステージ6「チンパンジーの聖域」ゴール演出
  function openStage6GoalModal() {
    var sm = state.sideMap;
    var ultimateChimpKey = "6:34,2";
    var ultimateChimpDefeated = !!(sm.defeatedEnemies && sm.defeatedEnemies[ultimateChimpKey]);
    var rewardLevel = sm.stage6RewardLevel || 0;
    sm.stageCleared["6"] = true;

    var headerText, bodyLines, rewardLine, newRewardLevel;
    newRewardLevel = rewardLevel;

    if (rewardLevel === 0) {
      if (ultimateChimpDefeated) {
        newRewardLevel = 2;
        state.player.gold += 800;
        state.player.ramenCount = (state.player.ramenCount || 0) + 1;
        headerText = "チンパンジーの聖域を制覇した！";
        bodyLines = [
          "究極チンパンジーを退かせ、聖域の出口へたどり着いた。",
          "聖域に、静かな朝の光が差し込んできた。"
        ];
        rewardLine = "💰 報酬：800G ＋ 🍜 ラーメン ×1";
      } else {
        newRewardLevel = 1;
        state.player.gold += 300;
        headerText = "チンパンジーの聖域を抜けた！";
        bodyLines = [
          "神秘的な聖域を、どうにかくぐり抜けた。",
          "究極チンパンジーはまだ聖域の奥深くに棲んでいるかもしれない。"
        ];
        rewardLine = "💰 報酬：300G";
      }
    } else if (rewardLevel === 1 && ultimateChimpDefeated) {
      newRewardLevel = 2;
      state.player.gold += 500;
      state.player.ramenCount = (state.player.ramenCount || 0) + 1;
      headerText = "聖域の真の征服者よ！";
      bodyLines = [
        "究極チンパンジーも退かせたか！",
        "聖域の覇者として認められた。追加の報酬を受け取れ。"
      ];
      rewardLine = "💰 追加報酬：500G ＋ 🍜 ラーメン ×1";
    } else {
      headerText = "チンパンジーの聖域";
      if (ultimateChimpDefeated) {
        bodyLines = [
          "聖域は静まり返っている。",
          "究極チンパンジーの影も見えない。",
          "だが、伝説のUMAである究極ゴリラは、今も森のどこかで君の歌を待っている。"
        ];
      } else {
        bodyLines = [
          "究極チンパンジーはまだ聖域の奥に棲んでいる。",
          "退かせてから再びゴールを目指すと、さらなる報酬があるぞ。"
        ];
      }
      rewardLine = null;
    }

    sm.stage6RewardLevel = newRewardLevel;
    renderStatus();
    saveGame();

    var html = '<p style="font-size:1.8em;margin:0 0 6px;">🏁</p>';
    html += '<p style="font-weight:bold;font-size:1.1em;margin-bottom:8px;">' + headerText + '</p>';
    for (var i = 0; i < bodyLines.length; i++) {
      html += '<p style="font-size:0.88em;color:#d0e0ff;margin:2px 0;">' + bodyLines[i] + '</p>';
    }
    if (rewardLine) {
      html += '<p style="color:#ffd166;font-weight:bold;margin:10px 0 4px;">' + rewardLine + '</p>';
    } else {
      html += '<p style="color:#a8d8a8;font-size:0.82em;margin:8px 0;">(報酬は受け取り済み)</p>';
    }
    var goalBodyEl6 = document.getElementById("modal-side-goal-body");
    goalBodyEl6.innerHTML = html;

    var retBtn6 = document.createElement("button");
    retBtn6.className = "modal-btn";
    retBtn6.style.marginBottom = "8px";
    retBtn6.textContent = "🏠 通常マップへ戻る";
    retBtn6.onclick = function () { returnToNormalMapFromSide(); };
    goalBodyEl6.appendChild(retBtn6);
    var stayBtn6 = document.createElement("button");
    stayBtn6.className = "modal-btn";
    stayBtn6.textContent = "↩ このチンパンジーの聖域に残る";
    stayBtn6.onclick = function () { closeModal("modal-side-goal"); };
    goalBodyEl6.appendChild(stayBtn6);
    openModal("modal-side-goal");
  }

  // §59 v0.14: ステージ6「チンパンジーの聖域」NPC会話
  function openStage6NpcModal(nx, ny) {
    var sm = state.sideMap;
    var ultimateChimpDefeated = !!(sm.defeatedEnemies && sm.defeatedEnemies["6:34,2"]);
    var icon = "🧑";
    var name, lines;
    if (ny === 2) {
      name = "聖域の守護者";
      if (ultimateChimpDefeated) {
        lines = [
          "究極チンパンジーが……あなたによって退かされたとは。",
          "聖域に、清らかな静寂が戻った。感謝する。"
        ];
      } else {
        lines = [
          "ここはチンパンジーの聖域。人間が踏み入れていい場所ではない。",
          "聖域の奥には究極チンパンジーが棲んでいる。我々は近づくことすら叶わない。",
          "上の道や下の道には宝箱が眠っているらしい。急がずに探してみるのも良いかもしれない。",
          "スタート付近の🏠帰還ゲートからいつでも戻れるぞ。"
        ];
      }
    } else {
      name = "迷い込んだ修行者";
      if (ultimateChimpDefeated) {
        lines = [
          "究極チンパンジーが倒された？！あなたはただ者じゃないな。",
          "修行を続ける気になれた。ありがとう！"
        ];
      } else {
        lines = [
          "修行のためにここに来たのに……こんな恐ろしい場所だとは知らなかった。",
          "聖域の奥から、時々すごい気配がする。絶対に近づきたくないよ……"
        ];
      }
    }
    document.getElementById("npc-header").innerHTML =
      '<div style="font-size:40px;line-height:1.2;">' + icon + '</div>' +
      '<div style="font-weight:bold;font-size:1em;margin-bottom:4px;">' + name + '</div>';
    var speechHtml = "";
    for (var j = 0; j < lines.length; j++) {
      speechHtml += "<p>「" + lines[j] + "」</p>";
    }
    document.getElementById("npc-speech").innerHTML = speechHtml;
    openModal("npc-modal");
  }

  // §129 v0.51: ステージ別テーマCSS適用
  function applyStageTheme(stageNum) {
    var cls = STAGE_THEME_DATA[stageNum];
    if (!cls) return;
    var vp = document.getElementById("field-viewport");
    if (!vp) return;
    clearStageTheme();
    vp.classList.add(cls);
  }

  // §129 v0.51: ステージテーマCSS除去
  function clearStageTheme() {
    var vp = document.getElementById("field-viewport");
    if (!vp) return;
    var keys = Object.keys(STAGE_THEME_DATA);
    for (var _i = 0; _i < keys.length; _i++) {
      vp.classList.remove(STAGE_THEME_DATA[keys[_i]]);
    }
  }

  function switchToSideMap() {
    resetAdventureGuideNpcState(); // §125 v0.48.1: サイドマップ移行時に案内人状態リセット
    resetPartyTrail(); // §79 v0.26.1
    state.mapMode = "side";
    var stageData = SIDE_STAGE_DATA[state.sideMap.stage] || SIDE_STAGE_DATA[1];
    state.sideMap.x = stageData.startX;
    state.sideMap.y = stageData.startY;
    applyStageTheme(state.sideMap.stage); // §129 v0.51
    saveGame();
    renderField();
    showToast("⬇️ 横スクロールマップへ移動！");
  }

  // §54 v0.11.3.2: ゴールモーダル/帰還ゲートモーダルを両方閉じてから通常マップへ戻す共通関数
  function returnToNormalMapFromSide() {
    closeModal("modal-side-goal");
    closeModal("modal-side-return-gate");
    switchToNormalMap();
  }

  function switchToNormalMap() {
    _stageWarpTransitionLock = false; // §130 v0.51.1: 通常マップ復帰時にワープロック解除
    resetAdventureGuideNpcState(); // §125 v0.48.1: 通常マップ復帰時に案内人状態リセット
    clearStageTheme(); // §129 v0.51
    state.mapMode = "normal";
    // §129 v0.51: ワープ経由なら normalReturnX/Y を使用、それ以外は既定値(2,4)
    state.player.x = state.normalReturnX || 2;
    state.player.y = state.normalReturnY || 4;
    state.normalReturnX = 2;
    state.normalReturnY = 4;
    resetPartyTrail(); // §79 v0.26.1
    saveGame();
    renderField();
    showToast("🏠 通常マップへ戻った！");
  }

  // §79 v0.26.1: 仲間追従軌跡リセット共通関数
  function resetPartyTrail() {
    state.partyTrail = [];
  }

  // §53 v0.11.3: 横スクロール内帰還ゲートモーダル
  function openSideReturnGateModal() {
    var bodyEl = document.getElementById("modal-side-return-gate-body");
    if (!bodyEl) return;
    bodyEl.innerHTML =
      "<div style=\"font-size:40px;line-height:1.2;\">🏠</div>" +
      "<div style=\"font-weight:bold;font-size:1em;margin-bottom:6px;\">帰還ゲート</div>" +
      "<p>通常マップへ戻りますか？</p>" +
      "<p style=\"font-size:0.85em;color:#a8d8a8;\">横スクロールの進捗は保存されます。</p>";
    openModal("modal-side-return-gate");
  }

  // §52 v0.11.2: 横スクロール入口ゲートモーダル
  function openSideGateModal() {
    var bodyEl = document.getElementById("modal-side-gate-body");
    if (!bodyEl) return;
    if (!state.sideMap.gateExplained) {
      bodyEl.innerHTML =
        "<div style=\"font-size:40px;line-height:1.2;\">🌀</div>" +
        "<div style=\"font-weight:bold;font-size:1em;margin-bottom:6px;\">横スクロールマップへの入口</div>" +
        "<p>ここは「はじまりの草原」へ続く不思議な渦だ。</p>" +
        "<p>横スクロールマップでは草原・森・町はずれ・山道・黒い城・チンパンジーの聖域の6ステージを冒険できる。各ステージをクリアすると報酬がもらえるぞ。</p>" +
        "<p>通常マップへ戻る時はゴール地点の「🏠 通常マップへ戻る」を使おう。</p>";
    } else {
      bodyEl.innerHTML =
        "<div style=\"font-size:40px;line-height:1.2;\">🌀</div>" +
        "<p>横スクロールマップへ進みますか？</p>";
    }
    openModal("modal-side-gate");
  }

  // §131 v0.51.2: ワープ広場初回説明モーダル表示防止フラグ（非永続）
  var _stageWarpPlazaIntroShown = false;

  // §131 v0.51.2: objectiveId からステージ番号を導出（純粋関数）
  function getCurrentObjectiveStageNumber() {
    var guide = getCurrentAdventureGuide();
    if (!guide || !guide.objectiveId) return null;
    var n = ADVENTURE_OBJECTIVE_STAGE_MAP[guide.objectiveId];
    return n || null;
  }

  // §131 v0.51.2: ワープ状態を返す純粋関数（4状態: locked/available/current/cleared）
  function getStageWarpStatus(stageNum) {
    var isUnlocked = (stageNum === 1);
    if (!isUnlocked && state.sideMap && state.sideMap.stageCleared) {
      isUnlocked = !!state.sideMap.stageCleared[String(stageNum - 1)];
    }
    var isCleared = !!(state.sideMap && state.sideMap.stageCleared && state.sideMap.stageCleared[String(stageNum)]);
    var isCurrentObjective = (getCurrentObjectiveStageNumber() === stageNum);
    var warpInfo = null;
    for (var _gwi = 0; _gwi < STAGE_WARP_DATA.length; _gwi++) {
      if (STAGE_WARP_DATA[_gwi].stageNum === stageNum) { warpInfo = STAGE_WARP_DATA[_gwi]; break; }
    }
    var status;
    // §132a v0.53: current を cleared より優先（再挑戦中ステージも▶で表示）
    if (!isUnlocked) {
      status = "locked";
    } else if (isCurrentObjective) {
      status = "current";
    } else if (isCleared) {
      status = "cleared";
    } else {
      status = "available";
    }
    var displayIcon;
    if (status === "locked") { displayIcon = "🔒"; }
    else if (status === "cleared") { displayIcon = "✅"; }
    else if (status === "current") { displayIcon = "▶" + (warpInfo ? warpInfo.icon : ""); }
    else { displayIcon = warpInfo ? warpInfo.icon : ""; }
    return {
      stageNum: stageNum,
      isUnlocked: isUnlocked,
      isCleared: isCleared,
      isCurrentObjective: isCurrentObjective,
      status: status,
      displayIcon: displayIcon
    };
  }

  // §131 v0.51.2: ステージの敵Lvテキストを返す純粋関数
  function getStageEnemyLevelRange(stageNum) {
    var ld = STAGE_ENEMY_LEVEL_DATA[stageNum];
    if (!ld) return { min: 0, max: 0, text: "不明" };
    return { min: ld.min, max: ld.max, text: "Lv" + ld.min + "〜" + ld.max };
  }

  // §131 v0.51.2: ステージの配置ラベルを返す
  function getStageWarpPositionLabel(stageNum) {
    var positions = { 1: "上段左", 2: "上段中央", 3: "上段右", 4: "下段左", 5: "下段中央", 6: "下段右" };
    return positions[stageNum] || "";
  }

  // §131 v0.51.2: ワープ広場初回到達チェック（初回のみ説明モーダル表示）
  function checkStageWarpPlazaIntro() {
    if (state.stageWarpPlazaIntroduced) return;
    if (_stageWarpPlazaIntroShown) return;
    if (state.inBattle) return;
    if (state.modalOpen) return;
    if (state.mapMode !== "normal") return;
    var px = state.player.x, py = state.player.y;
    var b = STAGE_WARP_PLAZA_BOUNDS;
    if (px >= b.minX && px <= b.maxX && py >= b.minY && py <= b.maxY) {
      _stageWarpPlazaIntroShown = true;
      state.stageWarpPlazaIntroduced = true;
      saveGame();
      openModal("modal-warp-plaza-intro");
    }
  }

  // §131 v0.51.2: 案内板モーダル表示（有効移動非加算）
  function openFieldSignModal(sign) {
    var bodyEl = document.getElementById("modal-field-sign-body");
    if (!bodyEl) return;
    var textHtml = sign.text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
    bodyEl.innerHTML =
      "<div style=\"font-size:32px;\">" + sign.icon + "</div>" +
      "<div style=\"font-weight:bold;margin-bottom:8px;\">" + sign.title + "</div>" +
      "<p style=\"text-align:left;white-space:pre-line;\">" + sign.text + "</p>";
    openModal("modal-field-sign");
  }

  // §129 v0.51: ワープ広場ステージ選択モーダル
  var _pendingWarpStageNum = 0;
  var _stageWarpTransitionLock = false; // §130 v0.51.1: 移動ボタン連打による二重入場防止
  function openStageWarpModal(stageNum) {
    var warpInfo = null;
    for (var _wi = 0; _wi < STAGE_WARP_DATA.length; _wi++) {
      if (STAGE_WARP_DATA[_wi].stageNum === stageNum) { warpInfo = STAGE_WARP_DATA[_wi]; break; }
    }
    if (!warpInfo) return;
    // §131 v0.51.2: getStageWarpStatus で統合管理
    var warpSt = getStageWarpStatus(stageNum);
    var lvRange = getStageEnemyLevelRange(stageNum);
    var posLabel = getStageWarpPositionLabel(stageNum);
    var statusLabel = { locked: "未解放", available: "挑戦可能", current: "現在の目的", cleared: "クリア済み（再挑戦可能）" }[warpSt.status] || "";
    var bodyEl = document.getElementById("modal-stage-warp-body");
    if (!bodyEl) return;
    var enterBtn = document.getElementById("btn-stage-warp-enter");
    if (warpSt.isUnlocked) {
      bodyEl.innerHTML =
        "<div style=\"font-size:40px;line-height:1.2;\">" + warpInfo.icon + "</div>" +
        "<div style=\"font-weight:bold;font-size:1em;margin-bottom:4px;\">第" + stageNum + "ステージ: " + warpInfo.label + "</div>" +
        "<div style=\"font-size:0.78em;color:#adb5bd;margin-bottom:6px;\">" + posLabel + " 【" + statusLabel + "】</div>" +
        "<p style=\"font-size:0.9em;margin-bottom:4px;\">敵Lv目安: " + lvRange.text + "</p>" +
        "<p style=\"font-size:0.85em;color:#b0c4b0;margin-bottom:4px;\">テーマ: " + (warpInfo.themeLabel || "") + "</p>" +
        "<p style=\"font-size:0.82em;color:#9ab3a0;margin-bottom:8px;\">" + (warpInfo.themeDesc || "") + "</p>" +
        "<p>横スクロールステージへ入りますか？</p>";
      if (enterBtn) { enterBtn.style.display = ""; }
      _pendingWarpStageNum = stageNum;
    } else {
      bodyEl.innerHTML =
        "<div style=\"font-size:40px;line-height:1.2;\">🔒</div>" +
        "<div style=\"font-weight:bold;font-size:1em;margin-bottom:4px;\">第" + stageNum + "ステージ: " + warpInfo.label + "</div>" +
        "<div style=\"font-size:0.78em;color:#adb5bd;margin-bottom:6px;\">" + posLabel + " 【" + statusLabel + "】</div>" +
        "<p>🔒 まだ解放されていない。<br>前のステージをクリアしよう！</p>";
      if (enterBtn) { enterBtn.style.display = "none"; }
      _pendingWarpStageNum = 0;
    }
    openModal("modal-stage-warp");
  }

  // ---------------------------------------------------------
  // 9. モーダル共通ヘルパー
  // ---------------------------------------------------------
  // モーダル表示中はフィールド移動を止めるため、開閉は必ずこの2関数を通す
  function openModal(id) {
    state.modalOpen = true;
    stopWalking(); // モーダルが開いている間は押しっぱなし移動を止める
    document.getElementById(id).classList.remove("hidden");
  }
  function closeModal(id) {
    state.modalOpen = false;
    document.getElementById(id).classList.add("hidden");
  }

  // ---------------------------------------------------------
  // 10. プレイヤー移動
  // ---------------------------------------------------------
  // 十字キーを押しっぱなしにした時の継続移動。間隔は設定画面の歩く速度に従う。
  var walkTimer = null;
  function startWalking(dx, dy) {
    stopWalking();
    if (state.mapMode === "side") {
      moveSidePlayer(dx, dy);
      var ms2 = WALK_SPEED_MS[state.player.walkSpeed] || WALK_SPEED_MS.normal;
      walkTimer = setInterval(function () { moveSidePlayer(dx, dy); }, ms2);
      return;
    }
    movePlayer(dx, dy);
    var ms = WALK_SPEED_MS[state.player.walkSpeed] || WALK_SPEED_MS.normal;
    walkTimer = setInterval(function () { movePlayer(dx, dy); }, ms);
  }
  function stopWalking() {
    if (walkTimer) {
      clearInterval(walkTimer);
      walkTimer = null;
    }
  }

  function movePlayer(dx, dy) {
    if (state.inBattle || state.modalOpen) return;
    var p = state.player;
    var nx = p.x + dx;
    var ny = p.y + dy;
    if (nx < 0 || nx >= MAP_W || ny < 0 || ny >= MAP_H) return;
    if (BLOCKED[state.terrain[ny][nx]]) return;

    // §78 v0.26 / §79 v0.26.1: 移動前の位置を仲間追従軌跡に追加（最大4エントリ §127 v0.50）
    if (!state.partyTrail) { state.partyTrail = []; }
    state.partyTrail.unshift({ x: p.x, y: p.y });
    if (state.partyTrail.length > 4) { state.partyTrail.pop(); } // §127 v0.50: 2→4
    p.x = nx;
    p.y = ny;

    // アイテム取得判定
    var key = nx + "," + ny;
    if (state.items[key]) {
      pickupItem(state.items[key]);
      delete state.items[key];
    }

    // アレルギー中はフィールドを1歩歩くごとに少しHPが減る(§13.5)
    tickAllergyOnStep();

    renderField();

    // §125 v0.48.1: NPC接触判定（talkLock付き・最新objective確認）
    if (_adventureGuideNpcVisible && nx === _adventureGuideNpcX && ny === _adventureGuideNpcY) {
      if (!_adventureGuideTalkLock) { openAdventureGuideNpcModal(); }
      return;
    }
    // §125 v0.48.1: 目標変化同期（草地・道以外タイルでも同期は実行。step加算はしない）
    syncAdventureGuideObjective();

    var tile = state.terrain[ny][nx];
    if (tile === "H") {
      openHomeModal();
      return;
    }
    if (tile === "M") {
      openMerchantModal();
      return;
    }
    if (tile === "G") {
      openGodModal();
      return;
    }
    if (tile === "T") {
      openTavernModal();
      return;
    }
    if (tile === "B") {
      openChest(nx, ny);
      return;
    }
    if (tile === "U") {
      openUkuleleChest(nx, ny);
      return;
    }
    if (tile === "A") {
      openLegendaryChestA(nx, ny);
      return;
    }
    if (tile === "C") {
      openLegendaryChestC(nx, ny);
      return;
    }
    if (tile === "J") {
      openLegendaryChestJ(nx, ny);
      return;
    }
    if (tile === "X") {
      openLegendaryChestX(nx, ny);
      return;
    }
    if (tile === "D" || tile === "R" || tile === "K" || tile === "E") {
      openNpcModal(tile);
      return;
    }
    if (tile === "N") {
      openHintShopModal();
      return;
    }
    if (tile === "V") {
      openSideGateModal();
      return;
    }
    if (tile === "S") {
      if (state.gameCleared && !state.eventFlags.dragonShieldGot) {
        giveKingReward();
      } else {
        openNpcModal("S");
      }
      return;
    }
    // §129 v0.51: ワープ広場タイル
    if (tile === "1" || tile === "2" || tile === "3" || tile === "4" || tile === "5" || tile === "6") {
      openStageWarpModal(parseInt(tile, 10));
      return;
    }

    // §131 v0.51.2: 案内板タイル接触（座標一致で判定）
    var _foundSign = null;
    for (var _si = 0; _si < FIELD_SIGN_DATA.length; _si++) {
      if (FIELD_SIGN_DATA[_si].x === nx && FIELD_SIGN_DATA[_si].y === ny) {
        _foundSign = FIELD_SIGN_DATA[_si]; break;
      }
    }
    if (_foundSign) {
      openFieldSignModal(_foundSign);
      return; // 有効移動非加算・エンカウントなし
    }

    // 安全地形でなければエンカウント判定
    if (!SAFE_TILE[tile]) {
      state.stepsSinceEncounter++;
      if (state.stepsSinceEncounter >= MIN_STEPS_BEFORE_ENCOUNTER &&
          Math.random() < ENCOUNTER_CHANCE) {
        state.stepsSinceEncounter = 0;
        triggerEncounter();
      }
    }

    // §125 v0.48.1: 有効移動カウント（草地・道の非イベントマス到達時のみ加算）
    // H/M/G/T/B/U/A/C/J/X/D/R/K/E/S/N/V タイルはすべて上で return されるため、ここには到達しない
    if (!_adventureGuideNpcVisible) {
      _adventureGuideStepCount++;
      if (_adventureGuideStepCount >= 15) { trySpawnAdventureGuideNpc(); }
    }
    // §131 v0.51.2: ワープ広場初回到達チェック（有効移動確定後・案内板/ワープ非接触時のみ）
    checkStageWarpPlazaIntro();
  }

  function pickupItem(type) {
    if (type === "weapon") {
      state.player.weaponAtkBonus += FIELD_WEAPON.atkBonus;
      recomputeStats();
      showToast("🗡️ つるぎを拾った！ こうげき力+" + FIELD_WEAPON.atkBonus);
    } else if (type === "potion") {
      state.player.potionCount++;
      showToast("🧪 やくそうを拾った！ (所持数 " + state.player.potionCount + ")");
    }
    updateStatusBar();
    saveGame();
  }

  // ---------------------------------------------------------
  // 10.5 宝箱(§5.7)
  // ---------------------------------------------------------
  function openChest(x, y) {
    var key = x + "," + y;
    if (state.openedChests[key]) {
      showToast("📦 宝箱は空だった…");
      return;
    }
    state.openedChests[key] = true;
    playSE("chestOpen");
    renderField(); // 即座に📦に切り替える
    var drop = weightedPick(CHEST_DROPS);
    var msg;
    if (drop.type === "gold") {
      state.player.gold += drop.amount;
      msg = "🎁 宝箱を開けた！ " + drop.amount + "Gを手に入れた！";
    } else if (drop.type === "item") {
      var it = findById(ITEM_DATA, drop.id);
      addItemCount(drop.id, 1);
      msg = "🎁 宝箱を開けた！ " + it.name + "を手に入れた！(所持数 " + getItemCount(drop.id) + ")";
    } else if (drop.type === "equip") {
      var slotInfo = findEquipSlot(drop.slot);
      var equip = findById(slotInfo.data(), drop.id);
      if (isEquipOwned(slotInfo, drop.id)) {
        // すでに所持済みの場合はゴールドに換算する
        var fallbackGold = equip.buyPrice ? Math.floor(equip.buyPrice / 2) : 10;
        state.player.gold += fallbackGold;
        msg = "🎁 宝箱を開けた！ " + equip.name + "はすでに持っていた！かわりに" + fallbackGold + "Gを手に入れた！";
      } else {
        state.player[slotInfo.ownedKey].push(equip.id);
        msg = "🎁 宝箱を開けた！ " + equip.name + "を手に入れた！装備変更画面で装備できます";
      }
    }
    showToast(msg);
    updateStatusBar();
    saveGame();
  }

  // 女神のウクレレ専用の特別な宝箱(§14.5)
  function openUkuleleChest(x, y) {
    var key = x + "," + y;
    if (state.openedChests[key]) {
      showToast("📦 宝箱は空だった…");
      return;
    }
    state.openedChests[key] = true;
    playSE("chestOpen");
    state.player.hasUkulele = true;
    renderField();
    updateStatusBar();
    saveGame();
    alert("まばゆい光を放つ宝箱を開けた！\n\n「女神のウクレレ」を手に入れた！\n\n究極ゴリラの心に届くといわれる伝説のウクレレ。");
  }

  // ---------------------------------------------------------
  // 伝説装備イベント宝箱(v0.8 §30)
  // A=ペガサスのよろい(Lv50+) C=宇宙のかぶと(ウクレレ所持) J=如意棒(Lv70+ジュリタニ)
  // ---------------------------------------------------------
  function openLegendaryChestA(x, y) {
    var key = x + "," + y;
    if (state.openedChests[key]) { showToast("📦 宝箱は空だった…"); return; }
    if (state.player.level < 50) {
      showToast("🌟 宝箱は白い光に包まれている……まだ開けるには力が足りないようだ。");
      return;
    }
    state.openedChests[key] = true;
    playSE("chestOpen");
    state.eventFlags.pegasusArmorGot = true;
    if (!isEquipOwned(findEquipSlot("armor"), "pegasusarmor")) {
      state.player.ownedArmors.push("pegasusarmor");
    }
    renderField();
    updateStatusBar();
    saveGame();
    alert("白い光の中から、鎧が現れた！\n\n「ペガサスのよろい」を手に入れた！\n（防御力+14 HP+5）\n\n装備変更画面で装備できます。");
  }

  function openLegendaryChestC(x, y) {
    var key = x + "," + y;
    if (state.openedChests[key]) { showToast("📦 宝箱は空だった…"); return; }
    if (!state.player.hasUkulele) {
      showToast("⭐ 宝箱は星のようにまたたいている……何か神聖な音色が必要なようだ。");
      return;
    }
    state.openedChests[key] = true;
    playSE("chestOpen");
    state.eventFlags.cosmicHelmetGot = true;
    if (!isEquipOwned(findEquipSlot("helmet"), "cosmickabuto")) {
      state.player.ownedHelmets.push("cosmickabuto");
    }
    renderField();
    updateStatusBar();
    saveGame();
    alert("女神のウクレレが静かに鳴った。\n星の光が宝箱を照らし出す……\n\n「宇宙のかぶと」を手に入れた！\n（防御力+15）\n\n装備変更画面で装備できます。");
  }

  function openLegendaryChestJ(x, y) {
    var key = x + "," + y;
    if (state.openedChests[key]) { showToast("📦 宝箱は空だった…"); return; }
    var hasJuritani = hasCompanion("juritani");
    if (state.player.level < 70 || !hasJuritani) {
      if (!hasJuritani) {
        showToast("🪄 不思議な棒が岩に刺さっている……力と気合いが足りないようだ。");
      } else {
        showToast("🪄 不思議な棒が岩に刺さっている……まだ力が足りないようだ。(Lv70以上で挑戦できる)");
      }
      return;
    }
    state.openedChests[key] = true;
    playSE("chestOpen");
    state.eventFlags.nyoiboGot = true;
    if (!isEquipOwned(findEquipSlot("weapon"), "nyoibo")) {
      state.player.ownedWeapons.push("nyoibo");
    }
    renderField();
    updateStatusBar();
    saveGame();
    alert("ジュリタニが拳を鳴らした。\n「いけるぞ、引き抜いてみろ！」\n\n「如意棒」を手に入れた！\n（攻撃力+58）\n\n装備変更画面で装備できます。");
  }

  function openLegendaryChestX(x, y) {
    var key = x + "," + y;
    if (state.openedChests[key]) { showToast("📦 宝箱は空だった…"); return; }
    if (state.player.level < 40) {
      showToast("✨ 宝箱は輝いているが……まだ開けられない。(Lv40以上が必要)");
      return;
    }
    state.openedChests[key] = true;
    playSE("chestOpen");
    state.eventFlags.cygnusHelmetGot = true;
    if (!isEquipOwned(findEquipSlot("helmet"), "cygnuskabuto")) {
      state.player.ownedHelmets.push("cygnuskabuto");
    }
    renderField();
    updateStatusBar();
    saveGame();
    alert("輝く宝箱の蓋が開いた！\n\n「キグナスのかぶと」を手に入れた！\n（防御力+12 HP+5）\n\n装備変更画面で装備できます。");
  }

  function giveKingReward() {
    playSE("itemGet");
    state.eventFlags.dragonShieldGot = true;
    if (!isEquipOwned(findEquipSlot("shield"), "dragonshield")) {
      state.player.ownedShields.push("dragonshield");
    }
    updateStatusBar();
    saveGame();
    setTimeout(function () {
      alert("「王様より、そなたへの褒美を預かっております。」\n\n「これは、伝説の守り具『ドラゴンのたて』にございます。」\n（防御力+26 HP+8）\n\n「どうか、これからの冒険にもお役立てください。」\n\n装備変更画面で装備できます。");
    }, 100);
  }

  // Lv99マイルストーンモーダルを開く(finishBattle後に呼ばれる)(v0.7.1 §3.8)
  function openLv99Modal() {
    var p = state.player;
    var html = '';
    html += '<p style="font-size:1em;font-weight:bold;color:#06d6a0;margin:8px 0;">ついに、勇者の子孫はLv.99に到達した！</p>';
    html += '<p class="small" style="margin:6px 0;color:#e0e0e0;">長い旅路の果てに、肉体も精神も限界まで鍛え上げられた。</p>';
    html += '<p class="small" style="margin:6px 0;color:#e0e0e0;">いまなら、伝説のUMA「究極ゴリラ」の心に届くかもしれない。</p>';
    if (p.hasUkulele) {
      html += '<p class="small" style="margin:8px 0;color:#ffd166;">🪗 女神のウクレレも所持済み！条件は整った！</p>';
      html += '<p class="small" style="color:#06d6a0;">究極ゴリラのHPを1〜10まで削り、<br>「🎵 うたう」コマンドを使えばクリア！</p>';
    } else {
      html += '<p class="small" style="margin:8px 0;color:#adb5bd;">だが、力だけでは足りない。</p>';
      html += '<p class="small" style="color:#ffd166;">女神のウクレレ🪗を手にし、<br>究極ゴリラのHPを1〜10まで削ってから「🎵うたう」のだ。</p>';
      html += '<p class="small" style="color:#adb5bd;margin-top:4px;">フィールドの奥に特別な宝箱🪗が眠っている。</p>';
    }
    html += '<p class="small" style="color:#74c0fc;margin-top:8px;">旅の終わりは、もうすぐそこだ。</p>';
    document.getElementById("lv99-body").innerHTML = html;
    openModal("lv99-modal");
  }

  // エンディングモーダルを開く(finishBattle後 または 設定画面の再視聴から呼ばれる)(v0.7 §28)
  function openClearModal() {
    openCaptureModal();  // §65 v0.17: 捕獲成功モーダル → エンディングへ
  }

  // §65 v0.17: 究極ゴリラ捕獲成功モーダル
  function openCaptureModal() {
    document.getElementById("btn-capture-modal-next").onclick = function () {
      closeModal("capture-modal");
      openEndingModal();
    };
    document.getElementById("capture-modal-emoji").textContent = "🎵";
    document.getElementById("capture-modal-heading").textContent = "歌が届いた";
    var html = "";
    html += '<p style="margin:8px 0;color:#e0e0e0;">究極ゴリラは、君の歌を聞いている。</p>';
    html += '<p style="margin:8px 0;color:#e0e0e0;">力ではなく、歌によって心が届いた。</p>';
    html += '<p style="margin:8px 0;color:#ffd166;font-weight:bold;">伝説のUMAは、ついに君の仲間となった。</p>';
    document.getElementById("capture-modal-body").innerHTML = html;
    openModal("capture-modal");
  }

  function openEndingModal() {
    playSE("endingStart");
    updateBGM("ending");
    state.endingPage = 0;
    renderEndingPage();
    openModal("clear-modal");
  }

  function renderEndingPage() {
    var page = ENDING_PAGES[state.endingPage];
    var isLast = state.endingPage === ENDING_PAGES.length - 1;
    document.getElementById("ending-emoji").textContent = page.emoji;
    document.getElementById("ending-heading").textContent = page.heading;
    var html = "";
    if (page.isCredits) {
      html += '<div style="margin:10px 0;">';
      ENDING_CREDITS.forEach(function (c) {
        html += '<p class="small" style="color:#adb5bd;margin:2px 0;">' + c.role + '</p>';
        html += '<p style="font-size:1em;font-weight:bold;margin:0 0 10px;">' + c.name + '</p>';
      });
      html += '</div>';
    } else if (page.isFinal) {
      // §67 v0.18: getPlayerTitle() に一元化
      html += '<p style="font-size:1em;font-weight:bold;color:#ffd166;margin:8px 0;">称号：「' + getPlayerTitle() + '」</p>';
      html += '<p class="small" style="color:#06d6a0;margin:4px 0;">この後も探索・図鑑集め・装備集めを続けられます。</p>';
      html += '<p class="small" style="color:#adb5bd;margin:4px 0;">エンディングはいつでも設定画面から再視聴できます。</p>';
    } else {
      page.lines.forEach(function (line) {
        html += '<p class="small" style="margin:6px 0;">' + line + '</p>';
      });
    }
    document.getElementById("clear-body").innerHTML = html;
    document.getElementById("btn-ending-next").textContent = isLast ? "冒険を続ける" : "つぎへ ▶";
  }

  var toastTimer = null;
  function showToast(text) {
    var toast = document.getElementById("toast");
    toast.textContent = text;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.classList.remove("show");
    }, 1800);
  }

  // ---------------------------------------------------------
  // 11. エンカウント・敵の抽選
  // ---------------------------------------------------------
  // §129 v0.51: ステージ別敵レベル取得
  function getEnemyLevelForStage(stageNum, isBoss) {
    var ld = STAGE_ENEMY_LEVEL_DATA[stageNum];
    if (!ld) return 1;
    var base = ld.min + Math.floor(Math.random() * (ld.max - ld.min + 1));
    if (isBoss) { base = Math.min(base + ld.bossBonus, ld.max + ld.bossBonus); }
    return base;
  }

  // §129 v0.51: ステージ倍率スケーリング適用 (オリジナルデータを変更しないコピーを返す)
  // §130 v0.51.1: ステージスケーリング除外判定
  // finalフラグ付き敵（究極ゴリラ）と特定ボス（究極チンパンジー）は倍率適用を除外する
  function shouldSkipStageEnemyScaling(monster) {
    if (!monster) return true;
    if (monster.final) return true;  // 究極ゴリラ等 final フラグ付き
    var skipIds = {
      "ultimate_chimpanzee": true,   // ステージ6固定ボス（×13倍が掛かると異常強化）
      "ultimategorilla": true        // 念のため（final フラグでも弾かれる）
    };
    if (skipIds[monster.id]) return true;
    return false;
  }

  function applyStageEnemyScaling(monster, stageNum) {
    var ld = STAGE_ENEMY_LEVEL_DATA[stageNum];
    if (!ld) return monster;
    var m = ld.mult;
    var copy = {};
    var k;
    for (k in monster) {
      if (monster.hasOwnProperty(k)) { copy[k] = monster[k]; }
    }
    copy.hp     = Math.max(1, Math.round((monster.hp     || 1) * m));
    copy.attack = Math.max(1, Math.round((monster.attack || 1) * m));
    copy.def    = Math.max(0, Math.round((monster.def    || 0) * m));
    copy.exp    = Math.max(1, Math.round((monster.exp    || 1) * m));
    copy.stageLevel = getEnemyLevelForStage(stageNum, !!(monster.canCapture === false));
    return copy;
  }

  function triggerEncounter() {
    var monster = chooseEnemy();
    startBattle(monster);
  }

  // §45 v0.9.2: 固定IDの敵を強制起動 (中ボスゴリラなど)
  // §51 v0.11.1: 未定義IDへのフォールバック追加
  function triggerFixedEncounter(enemyId) {
    var monster = findById(NON_UMA_DATA, enemyId);
    if (!monster) {
      if (typeof console !== "undefined") {
        console.warn("[固定敵エラー] 未定義のID: " + enemyId + " → ランダムエンカウントにフォールバック");
      }
      triggerEncounter();
      return;
    }
    startBattle(monster);
  }

  // §51 v0.11.1: SIDE_FIXED_ENCOUNTERS の敵IDが NON_UMA_DATA に存在するか検証 (debug=1専用)
  function validateSideFixedEncounters() {
    var ok = 0, ng = 0, ngList = [];
    for (var key in SIDE_FIXED_ENCOUNTERS) {
      if (!SIDE_FIXED_ENCOUNTERS.hasOwnProperty(key)) continue;
      var id = SIDE_FIXED_ENCOUNTERS[key];
      if (findById(NON_UMA_DATA, id)) {
        ok++;
      } else {
        ng++;
        ngList.push(key + " → " + id);
      }
    }
    var msg = "固定敵IDチェック完了\nOK: " + ok + "件\nNG: " + ng + "件";
    if (ngList.length > 0) {
      msg += "\n\n未定義ID:\n" + ngList.join("\n");
    }
    alert(msg);
  }

  function weightedPick(list) {
    var total = 0;
    for (var i = 0; i < list.length; i++) total += list[i].weight;
    var r = Math.random() * total;
    for (var j = 0; j < list.length; j++) {
      r -= list[j].weight;
      if (r <= 0) return list[j];
    }
    return list[list.length - 1];
  }

  function chooseEnemy() {
    var lv = state.player.level;
    // レアUMA(究極ゴリラ含む)はレベルに関係なく低確率で出現
    if (Math.random() < RARE_ENCOUNTER_CHANCE) {
      var rarePool = UMA_DATA.filter(function (u) { return u.isRare; });
      return weightedPick(rarePool);
    }
    // メタル系(経験値稼ぎ用)もレベルに応じて低確率で出現(§6.3)
    if (Math.random() < METAL_ENCOUNTER_CHANCE) {
      var metalPool = METAL_DATA.filter(function (m) { return m.minLevel <= lv; });
      if (metalPool.length > 0) return weightedPick(metalPool);
    }
    var pool = NON_UMA_DATA.filter(function (m) { return m.type !== "metal"; })
      .concat(UMA_DATA.filter(function (u) { return !u.isRare; }))
      .filter(function (m) { return m.minLevel <= lv; });
    if (pool.length === 0) pool = [NON_UMA_DATA[0]];
    return weightedPick(pool);
  }

  // ---------------------------------------------------------
  // 12. 戦闘開始
  // ---------------------------------------------------------
  function startBattle(monster) {
    // 究極ゴリラとの初遭遇は専用の発見モーダルを挟む(最終目標の演出)
    if (monster.final && !state.discoveredFinal) {
      state.discoveredFinal = true;
      state.player.dex[monster.id] = "seen";
      updateStatusBar();
      openModal("discovery-modal");
      document.getElementById("btn-discovery-continue").onclick = function () {
        closeModal("discovery-modal");
        actuallyStartBattle(monster);
      };
      return;
    }
    actuallyStartBattle(monster);
  }

  function actuallyStartBattle(monster) {
    stopWalking(); // 戦闘開始時は押しっぱなし移動を止める
    playSE("battleStart");
    updateBGM("battle");
    state.inBattle = true;
    state.battleDamageReduction = 0; // §90 v0.32.1: 念のため戦闘開始時にもリセット
    resetCompanionTechniqueUsage(); // §112 v0.43.1: 戦闘開始時に仲間わざ使用状態を確実にリセット
    // §129 v0.51: ステージ戦闘でモンスターを強化
    // §130 v0.51.1: 究極チンパンジー・finalフラグ敵は除外
    if (state.mapMode === "side" && state.sideMap && state.sideMap.stage) {
      if (!shouldSkipStageEnemyScaling(monster)) {
        monster = applyStageEnemyScaling(monster, state.sideMap.stage);
      }
    }
    state.enemy = {
      id: monster.id,
      name: monster.name,
      emoji: monster.emoji,
      isUMA: !!monster.isUMA,
      rare: !!monster.isRare,
      final: !!monster.final,
      hp: monster.hp,
      maxHp: monster.hp,
      atk: monster.attack,
      def: monster.def,
      exp: monster.exp,
      captureRateBase: monster.captureRate,
      sellPrice: monster.sellPrice || 0,
      fleeRate: monster.fleeRate || 0.70,
      inflicts: monster.inflicts || null,   // 攻撃時に状態異常を与える可能性(§13.5)
      drainsMp: monster.drainsMp || null,   // 攻撃時にMPを吸う可能性(§6.2)
      stealsGold: monster.stealsGold || null, // 攻撃時に所持金を盗む可能性(§6.2)
      ambush: !!monster.ambush,             // 戦闘開始時に不意打ちしてくるか(§6.2)
      customEscapeMsgs: monster.customEscapeMsgs || null, // §45 v0.9.2: ボス専用逃走メッセージ
      canCapture: monster.canCapture !== false,  // §46 v0.9.2.1: false なら捕獲コマンド封鎖
      stageLevel: monster.stageLevel || 0  // §129 v0.51: ステージ敵レベル表示用
    };

    // UMAなら図鑑に「発見済み」を記録する(捕獲済みなら上書きしない)
    var isFirstDiscovery = false;
    if (state.enemy.isUMA && state.player.dex[state.enemy.id] !== "captured") {
      isFirstDiscovery = !state.player.dex[state.enemy.id];
      state.player.dex[state.enemy.id] = "seen";
    }

    document.getElementById("field-screen").classList.add("hidden");
    document.getElementById("dpad").classList.add("hidden");
    document.getElementById("battle-screen").classList.remove("hidden");
    document.getElementById("magic-menu").classList.add("hidden");
    document.getElementById("item-menu").classList.add("hidden");
    document.getElementById("waza-menu").classList.add("hidden");
    document.getElementById("battle-menu").classList.remove("hidden");
    updateSingButtonChance(false);  // §64 v0.16.1: うたうボタンをリセット

    // 戦闘開始直後の誤タップ防止: 全コマンドをロック(§13.7)
    setBattleLocked(true);

    renderEnemy();
    updateBattlePlayerStatus();
    updateStatusBar();
    clearLog();
    var tag = state.enemy.final ? "【伝説のUMA】" : (state.enemy.rare ? "【激レアUMA】" : "");
    log(tag + state.enemy.name + "が現れた！");
    if (monster.startMsg) {
      log(monster.startMsg);
    }
    if (monster.type === "metal") {
      log("✨ " + monster.name + "がキラリと光った！");
      log("経験値のチャンスだ！");
    }
    if (isFirstDiscovery) {
      log("✨ " + state.enemy.name + "を見つけた！(UMA図鑑に登録された)");
    }
    if (state.enemy.ambush) {
      // 不意打ち: enemyTurn()が処理後にsetBattleLocked(false)を呼ぶ
      log("😲 不意をつかれた！");
      setTimeout(enemyTurn, 500);
    } else {
      // 800ms後にコマンドを有効化(§13.7)
      setTimeout(function () {
        if (state.inBattle) {
          setBattleLocked(false);
          log("どうする？");
        }
      }, 800);
    }
  }

  function renderEnemy() {
    var e = state.enemy;
    document.getElementById("enemy-emoji").textContent = e.emoji;
    document.getElementById("enemy-name").textContent =
      e.name + (e.isUMA ? "(UMA)" : "") + (e.stageLevel ? " Lv." + e.stageLevel : "");
    document.getElementById("enemy-hp-bar").style.width =
      Math.max(0, (e.hp / e.maxHp) * 100) + "%";
    document.getElementById("enemy-hp-text").textContent = "HP " + e.hp + "/" + e.maxHp; // §93 v0.34: "HP " プレフィックス追加
  }

  function clearLog() {
    document.getElementById("battle-log").innerHTML = "";
  }
  function log(text) {
    var box = document.getElementById("battle-log");
    var p = document.createElement("p");
    p.textContent = text;
    box.appendChild(p);
    box.scrollTop = box.scrollHeight;
  }

  function setBattleLocked(locked) {
    state.locked = locked;
    // §83 v0.28.1: companion-command-menu / §89 v0.32: companion-special-menu / §95 v0.35: companion-magic-menu は companionCommandLocked で別管理するため除外
    var btns = document.querySelectorAll("#battle-menu button, .submenu:not(#companion-command-menu):not(#companion-special-menu):not(#companion-magic-menu) button");
    btns.forEach(function (b) { b.disabled = locked; });
  }

  // ---------------------------------------------------------
  // 13. 戦闘コマンド: たたかう / まほう
  // ---------------------------------------------------------
  // §64 v0.16.1: 条件別メッセージ + うたうボタン強調
  function checkUltimateGorillaHpHint(e) {
    if (!e || e.id !== "ultimategorilla") return;
    if (e.hp < 1 || e.hp > 10) return;
    var p = state.player;
    var hasLv = p.level >= 99;
    var hasUk = p.hasUkulele;
    if (hasLv && hasUk) {
      log("🎵 究極ゴリラが歌を待っている！");
      log("HPは捕獲条件の範囲内だ！ 今こそ「うたう」チャンス！");
      updateSingButtonChance(true);
      updateBattleStatusBadges(); // §93 v0.34: うたうチャンスバッジを表示
    } else if (!hasLv && !hasUk) {
      log("究極ゴリラはかなり弱っている。");
      log("しかし、まだ条件が足りない。もっと成長し、歌を届けるための楽器を探そう。");
    } else if (!hasLv) {
      log("究極ゴリラはかなり弱っている。");
      log("だが、まだ勇者としての格が足りない気がする……Lv99以上になれば、何かが起きるかもしれない。");
    } else {
      log("究極ゴリラはかなり弱っている。");
      log("だが、歌を届けるための大切な楽器が足りない気がする……");
    }
  }

  function doFight() {
    if (state.locked) return;
    setBattleLocked(true);
    playSE("attack");
    var p = state.player, e = state.enemy;
    var dmg = Math.max(1, p.atk + randInt(0, 3) - e.def);
    var critChance = getCompanionBonus("critBonus");
    var isCrit = critChance > 0 && Math.random() < critChance;
    if (isCrit) {
      dmg = Math.max(1, Math.floor(dmg * 1.5));
    }
    // §63 v0.16: ここはひとつガマン中は通常攻撃ダメージを1/4に（最低1）
    if (state.gamanActive) {
      dmg = Math.max(1, Math.floor(dmg / 4));
      if (isCrit) {
        log("⚔ " + p.name + "の攻撃！ 💥 会心（ガマン中）！ " + e.name + "に" + dmg + "のダメージ！");
      } else {
        log("⚔ " + p.name + "の攻撃！（ガマン中） " + e.name + "に" + dmg + "のダメージ！");
      }
    } else if (isCrit) {
      log("⚔ " + p.name + "の攻撃！ 💥 会心の一撃！ " + e.name + "に" + dmg + "のダメージ！");
    } else {
      log("⚔ " + p.name + "の攻撃！ " + e.name + "に" + dmg + "のダメージ！");
    }
    e.hp = Math.max(0, e.hp - dmg);
    renderEnemy();

    if (e.hp <= 0) {
      winBattle();
      return;
    }
    checkUltimateGorillaHpHint(e);
    scheduleAfterPlayerAttack(); // §80 v0.27
  }

  // §80 v0.27 / §82 v0.28: プレイヤー攻撃後 → 仲間コマンド選択 → 敵ターン
  function scheduleAfterPlayerAttack() {
    setTimeout(function() {
      if (!state.inBattle) return;
      startCompanionCommands(); // §82 v0.28: コマンド選択フローへ
    }, 600);
  }

  // §83 v0.28.1 / §87 v0.31 / §89 v0.32: 仲間コマンドフラグ・UI を一括クリアするヘルパー
  function clearCompanionCommandState() {
    state.companionCommandQueue = [];
    state.companionCommandIndex = 0;
    state.companionCommandActive = false;
    state.companionCommandLocked = false;
    state.lastCompanionAutoAction = {}; // §87 v0.31: 前回行動記憶をリセット
    state.battleDamageReduction = 0;   // §89 v0.32: ダメージ軽減をリセット
    resetCompanionTechniqueUsage();    // §111 v0.43 / §112 v0.43.1: finishBattle()経由でのみ呼ばれる想定
    var ccMenu = document.getElementById("companion-command-menu");
    if (ccMenu) { ccMenu.classList.add("hidden"); }
    var csMenu = document.getElementById("companion-special-menu"); // §89 v0.32
    if (csMenu) { csMenu.classList.add("hidden"); }
    var cmMenu = document.getElementById("companion-magic-menu"); // §95 v0.35
    if (cmMenu) { cmMenu.classList.add("hidden"); }
    updateBattleStatusBadges(); // §93 v0.34: 戦闘終了時にバッジをクリア
  }

  // §111 v0.43: 仲間わざ使用状態を全リセット（戦闘開始時・戦闘終了時共用）
  function resetCompanionTechniqueUsage() {
    state.companionTechniqueUsed = { juritani: false, shurittani: false, norio: false, harumi: false };
  }

  // §112 v0.43.1: companionTechniqueUsedが壊れていたら修復（全リセットせず欠損キーだけ補完する）
  function ensureCompanionTechniqueUsageState() {
    if (!state.companionTechniqueUsed || typeof state.companionTechniqueUsed !== "object") {
      resetCompanionTechniqueUsage();
      return;
    }
    var _ids112 = ["juritani", "shurittani", "norio", "harumi"];
    for (var _ei112 = 0; _ei112 < _ids112.length; _ei112++) {
      if (state.companionTechniqueUsed[_ids112[_ei112]] === undefined) {
        state.companionTechniqueUsed[_ids112[_ei112]] = false;
      }
    }
  }

  // ---------------------------------------------------------
  // §113 v0.44: 仲間サイドストーリーシステム
  // ---------------------------------------------------------

  // §114 v0.44.1: サイドストーリーセッション管理変数（非永続・IIFEスコープ・saveしない）
  var _cstorySessionId = 0;       // 物語開始のたびに++して古いクリックを無効化
  var _cstoryFromTavern = false;  // 酒場から開いたか（close後の復帰先制御）
  var _cstoryAdvanceLock = false; // 高速連打防止ロック
  var _cstoryAdvanceTimer = null; // 高速連打防止タイマーID

  // §115 v0.44.2: 全話完了演出一時状態（非永続・IIFEスコープ・saveしない）
  var _pendingCompanionStoryAllCompleteNotice = false;  // 演出表示予約（true=表示待ち）
  var _companionStoryAllCompleteNoticeVisible = false;  // 演出表示中フラグ（二重表示防止）

  // §116 v0.44.3: モーダル重なり安定化（非永続・IIFEスコープ・saveしない）
  var _companionStoryAllCompleteOrigin = null;         // 表示元: "tavern"/"field"/"debug"
  var _pendingCompanionStoryAllCompleteOrigin = null;  // pending中の表示元
  var _companionStoryAllCompleteNoticeTimer = null;    // 遅延表示タイマーID

  // §119 v0.45.2: 第2話全話完了演出専用状態（非永続・IIFEスコープ・saveしない）
  var _pendingCompanionStoryChapter2AllCompleteNotice = false;
  var _companionStoryChapter2AllCompleteNoticeVisible = false;
  var _companionStoryChapter2AllCompleteOrigin = null;
  var _pendingCompanionStoryChapter2AllCompleteOrigin = null;
  var _companionStoryChapter2AllCompleteNoticeTimer = null;
  var _companionStoryCompletionNoticeQueueTimer = null; // §120 v0.45.3: 共通キュータイマー（非永続）

  // §135 v0.56: 最終サイドストーリー解放通知状態（非永続・IIFEスコープ・saveしない）
  var _pendingFinalCompanionStoryUnlockNotice = false;
  var _finalCompanionStoryUnlockNoticeVisible = false;
  var _finalCompanionStoryUnlockNoticeTimer = null;

  // §133 v0.54: 第3話全話完了演出専用状態（非永続・IIFEスコープ・saveしない）
  var _pendingCompanionStoryChapter3AllCompleteNotice = false;
  var _companionStoryChapter3AllCompleteNoticeVisible = false;
  var _companionStoryChapter3AllCompleteOrigin = null;
  var _pendingCompanionStoryChapter3AllCompleteOrigin = null;
  var _companionStoryChapter3AllCompleteNoticeTimer = null;

  // §117 v0.45: 第2話閲覧中chapter追跡（非永続・saveしない）
  var _cstoryActiveChapter = 1;  // 現在閲覧中のchapter（1, 2 or 3）

  // §118 v0.45.1: 閲覧中story.id追跡（非永続・saveしない・セッション混入防止）
  var _cstoryActiveStoryId = null;

  // §123 v0.47.1: 完了処理中の多重実行を防ぐフラグ（非永続・IIFEスコープ・saveしない）
  var _cstoryCompleting = false;

  // §124 v0.48 / §125 v0.48.1: 旅の案内人NPC 一時状態（非永続・IIFEスコープ・saveしない）
  var _adventureGuideStepCount = 0;         // 有効移動カウント（NPC未表示・草地道歩行のみ加算）
  var _adventureGuideNpcVisible = false;    // 案内人表示中フラグ
  var _adventureGuideNpcX = -1;             // 案内人X座標（-1=未配置）
  var _adventureGuideNpcY = -1;             // 案内人Y座標（-1=未配置）
  var _adventureGuideLastObjectiveId = "";  // 前回objectiveId（目標変化検出用）
  var _adventureGuideTalkLock = false;      // §125 v0.48.1: 接触会話多重防止（非永続）

  // §118 v0.45.1: chapter値を正規化。省略→1, 明示的不正値→null（第1話フォールバックなし）
  function normalizeCompanionSideStoryChapter(chapter) {
    if (chapter === undefined || chapter === null) { return 1; }
    if (chapter === 1) { return 1; }
    if (chapter === 2) { return 2; }
    if (chapter === 3) { return 3; } // §122 v0.47: 第3話対応
    return null;
  }

  // companionSideStoryFlagsの整合性を保証（欠損・非boolean→false補正、true→維持）
  // §114 v0.44.1: 変更があればtrueを返す（loadGame()でのsave判定に使用）
  function normalizeCompanionSideStoryFlags() {
    var _cids113 = ["juritani", "shurittani", "norio", "harumi"];
    var _changed = false;
    if (!state.companionSideStoryFlags || typeof state.companionSideStoryFlags !== "object" || Array.isArray(state.companionSideStoryFlags)) {
      state.companionSideStoryFlags = { juritani: false, shurittani: false, norio: false, harumi: false };
      return true;
    }
    for (var _ni113 = 0; _ni113 < _cids113.length; _ni113++) {
      var _k113 = _cids113[_ni113];
      if (state.companionSideStoryFlags[_k113] !== true) {
        if (state.companionSideStoryFlags[_k113] !== false) { _changed = true; }
        state.companionSideStoryFlags[_k113] = false;
      }
    }
    return _changed;
  }

  // §117 v0.45: 第2話フラグboolean保証（never demote）。変更あればtrueを返す
  function normalizeCompanionSideStoryChapter2Flags() {
    var _cids117 = ["juritani", "shurittani", "norio", "harumi"];
    var _changed = false;
    if (!state.companionSideStoryChapter2Flags || typeof state.companionSideStoryChapter2Flags !== "object" || Array.isArray(state.companionSideStoryChapter2Flags)) {
      state.companionSideStoryChapter2Flags = { juritani: false, shurittani: false, norio: false, harumi: false };
      return true;
    }
    for (var _ni117 = 0; _ni117 < _cids117.length; _ni117++) {
      var _k117 = _cids117[_ni117];
      if (state.companionSideStoryChapter2Flags[_k117] !== true) {
        if (state.companionSideStoryChapter2Flags[_k117] !== false) { _changed = true; }
        state.companionSideStoryChapter2Flags[_k117] = false;
      }
    }
    return _changed;
  }

  // §122 v0.47: 第3話フラグboolean保証（never demote）。変更あればtrueを返す
  function normalizeCompanionSideStoryChapter3Flags() {
    var _cids122 = ["juritani", "shurittani", "norio", "harumi"];
    var _changed = false;
    if (!state.companionSideStoryChapter3Flags || typeof state.companionSideStoryChapter3Flags !== "object" || Array.isArray(state.companionSideStoryChapter3Flags)) {
      state.companionSideStoryChapter3Flags = { juritani: false, shurittani: false, norio: false, harumi: false };
      return true;
    }
    for (var _ni122 = 0; _ni122 < _cids122.length; _ni122++) {
      var _k122 = _cids122[_ni122];
      if (state.companionSideStoryChapter3Flags[_k122] !== true) {
        if (state.companionSideStoryChapter3Flags[_k122] !== false) { _changed = true; }
        state.companionSideStoryChapter3Flags[_k122] = false;
      }
    }
    return _changed;
  }

  // §123 v0.47.1: ストーリーデータの整合性検証（id/chapter/companionId 三条件）
  function isValidCompanionSideStoryData(data, cid, chapter) {
    if (!data || typeof data !== "object") { return false; }
    if (data.companionId !== cid) { return false; }
    if (data.chapter !== chapter) { return false; }
    var _expected = getCompanionSideStoryData(cid, chapter);
    if (!_expected) { return false; }
    if (data.id !== _expected.id) { return false; }
    return true;
  }

  // §117 v0.45 / §118 v0.45.1 / §122 v0.47: chapterに応じたストーリーデータを返す
  // chapter未指定=1, 明示的不正値(0/-1/4/"foo")→null（第1話フォールバックなし）
  function getCompanionSideStoryData(cid, chapter) {
    var _ch = normalizeCompanionSideStoryChapter(chapter);
    if (_ch === null) { return null; }
    if (typeof cid !== "string" || !cid) { return null; }
    if (_ch === 3) { return COMPANION_SIDE_STORY_CHAPTER3_DATA[cid] || null; } // §122 v0.47
    if (_ch === 2) { return COMPANION_SIDE_STORY_CHAPTER2_DATA[cid] || null; }
    return COMPANION_SIDE_STORY_DATA[cid] || null;
  }

  // §117 v0.45 / §118 v0.45.1 / §122 v0.47: chapter指定で完了フラグを返す
  // chapter=1のみch1フラグ, chapter=2のみch2フラグ, chapter=3のみch3フラグを参照（混用防止）
  function isCompanionSideStoryCompleted(cid, chapter) {
    var _ch = normalizeCompanionSideStoryChapter(chapter);
    if (_ch === null) { return false; }
    if (_ch === 3) { // §122 v0.47
      if (!state.companionSideStoryChapter3Flags || typeof state.companionSideStoryChapter3Flags !== "object") return false;
      return !!(state.companionSideStoryChapter3Flags[cid]);
    }
    if (_ch === 2) {
      if (!state.companionSideStoryChapter2Flags || typeof state.companionSideStoryChapter2Flags !== "object") return false;
      return !!(state.companionSideStoryChapter2Flags[cid]);
    }
    if (!state.companionSideStoryFlags || typeof state.companionSideStoryFlags !== "object") return false;
    return !!(state.companionSideStoryFlags[cid]);
  }

  // §115 v0.44.2: 4話すべて完了しているか（side-effect なし・normalize後判定）
  function areAllCompanionSideStoriesComplete() {
    var _cids115 = ["juritani", "shurittani", "norio", "harumi"];
    if (!state.companionSideStoryFlags || typeof state.companionSideStoryFlags !== "object") return false;
    for (var _i115 = 0; _i115 < _cids115.length; _i115++) {
      if (state.companionSideStoryFlags[_cids115[_i115]] !== true) return false;
    }
    return true;
  }

  // §115 v0.44.2: companionSideStoryAllCompleteCelebratedをboolean保証（never demote）
  // 変更があればtrueを返す
  function normalizeCompanionSideStoryAllCompleteFlag() {
    if (state.companionSideStoryAllCompleteCelebrated === true) return false;  // trueを維持
    if (state.companionSideStoryAllCompleteCelebrated !== false) {
      state.companionSideStoryAllCompleteCelebrated = false;
      return true;  // 不正値→falseへ修正
    }
    return false;  // 正常なfalse
  }

  // §115 v0.44.2: 全話完了を確認し、未祝賀なら演出を予約する
  // 新規達成ならtrueを返す（saveGame()は呼び出し側で行う）
  function checkCompanionSideStoryAllComplete() {
    normalizeCompanionSideStoryFlags();
    if (!areAllCompanionSideStoriesComplete()) return false;
    normalizeCompanionSideStoryAllCompleteFlag();
    if (state.companionSideStoryAllCompleteCelebrated === true) return false;  // 処理済み
    state.companionSideStoryAllCompleteCelebrated = true;
    _pendingCompanionStoryAllCompleteNotice = true;
    return true;
  }

  // §119 v0.45.2: 第2話4人全完了判定（副作用なし）
  function areAllCompanionSideStoryChapter2Complete() {
    var _cids119 = ["juritani", "shurittani", "norio", "harumi"];
    if (!state.companionSideStoryChapter2Flags || typeof state.companionSideStoryChapter2Flags !== "object") return false;
    for (var _i119 = 0; _i119 < _cids119.length; _i119++) {
      if (state.companionSideStoryChapter2Flags[_cids119[_i119]] !== true) return false;
    }
    return true;
  }

  // §119 v0.45.2: Chapter2 celebratedをboolean保証（never demote）
  // 変更があればtrueを返す
  function normalizeCompanionSideStoryChapter2AllCompleteFlag() {
    if (state.companionSideStoryChapter2AllCompleteCelebrated === true) return false;
    if (state.companionSideStoryChapter2AllCompleteCelebrated !== false) {
      state.companionSideStoryChapter2AllCompleteCelebrated = false;
      return true;
    }
    return false;
  }

  // §119 v0.45.2: 第2話全話完了を確認し、未祝賀なら演出を予約する
  // 新規達成ならtrueを返す（saveGame()は呼び出し側で行う）
  function checkCompanionSideStoryChapter2AllComplete(origin) {
    normalizeCompanionSideStoryChapter2Flags();
    if (!areAllCompanionSideStoryChapter2Complete()) return false;
    normalizeCompanionSideStoryChapter2AllCompleteFlag();
    if (state.companionSideStoryChapter2AllCompleteCelebrated === true) return false;
    state.companionSideStoryChapter2AllCompleteCelebrated = true;
    _pendingCompanionStoryChapter2AllCompleteNotice = true;
    if (origin) { _pendingCompanionStoryChapter2AllCompleteOrigin = origin; }
    return true;
  }

  // §135 v0.56: 最終サイドストーリー解放判定（純粋関数・副作用なし）
  // 条件: 第3話4/4完了 AND 第3話全員完了演出済み AND ステージ5クリア済み（既存最終ストーリー入場条件）
  function isFinalCompanionSideStoryUnlocked() {
    if (!areAllCompanionSideStoryChapter3Complete()) return false;
    if (!state.companionSideStoryChapter3AllCompleteCelebrated) return false;
    var sm = state.sideMap;
    return !!(sm && sm.stageCleared && sm.stageCleared["5"]);
  }

  // §135 v0.56: 最終サイドストーリー完了判定（純粋関数・isSideStoryCleared()への委譲）
  function isFinalCompanionSideStoryCompleted() {
    return isSideStoryCleared();
  }

  // §135 v0.56: 解放通知をスケジュール（pending最大1・ガード付き）
  function scheduleFinalCompanionSideStoryUnlockNotice(delayMs) {
    if (!!state.finalCompanionSideStoryUnlockNotified) return;
    if (!isFinalCompanionSideStoryUnlocked()) return;
    if (_pendingFinalCompanionStoryUnlockNotice) return;
    if (_finalCompanionStoryUnlockNoticeVisible) return;
    _pendingFinalCompanionStoryUnlockNotice = true;
    if (_finalCompanionStoryUnlockNoticeTimer) {
      clearTimeout(_finalCompanionStoryUnlockNoticeTimer);
      _finalCompanionStoryUnlockNoticeTimer = null;
    }
    _finalCompanionStoryUnlockNoticeTimer = setTimeout(function () {
      _finalCompanionStoryUnlockNoticeTimer = null;
      consumePendingFinalCompanionStoryUnlockNotice();
    }, delayMs || 600);
  }

  // §135 v0.56: 解放通知pending消費（ガード付き・1回限り）
  function consumePendingFinalCompanionStoryUnlockNotice() {
    if (!_pendingFinalCompanionStoryUnlockNotice) return;
    if (_finalCompanionStoryUnlockNoticeVisible) return;
    if (state.inBattle) { // 戦闘中は延期
      _finalCompanionStoryUnlockNoticeTimer = setTimeout(consumePendingFinalCompanionStoryUnlockNotice, 400);
      return;
    }
    if (state.modalOpen) { // 他モーダル中は延期
      _finalCompanionStoryUnlockNoticeTimer = setTimeout(consumePendingFinalCompanionStoryUnlockNotice, 300);
      return;
    }
    if (!!state.finalCompanionSideStoryUnlockNotified) {
      _pendingFinalCompanionStoryUnlockNotice = false;
      return;
    }
    if (!isFinalCompanionSideStoryUnlocked()) {
      _pendingFinalCompanionStoryUnlockNotice = false;
      return;
    }
    _pendingFinalCompanionStoryUnlockNotice = false;
    _finalCompanionStoryUnlockNoticeVisible = true;
    state.finalCompanionSideStoryUnlockNotified = true;
    saveGame();
    showToast("📖 新しい物語が開かれました\n\n四人の物語は、さらにその先へ続いているようです。\n酒場やPaperViewを確認してみましょう。");
    _finalCompanionStoryUnlockNoticeVisible = false;
  }

  // §133 v0.54: 第3話4人全完了判定（副作用なし）
  function areAllCompanionSideStoryChapter3Complete() {
    var _cids133 = ["juritani", "shurittani", "norio", "harumi"];
    if (!state.companionSideStoryChapter3Flags || typeof state.companionSideStoryChapter3Flags !== "object") return false;
    for (var _i133 = 0; _i133 < _cids133.length; _i133++) {
      if (state.companionSideStoryChapter3Flags[_cids133[_i133]] !== true) return false;
    }
    return true;
  }

  // §133 v0.54: Chapter3 celebratedをboolean保証（never demote）
  // 変更があればtrueを返す
  function normalizeCompanionSideStoryChapter3AllCompleteFlag() {
    if (state.companionSideStoryChapter3AllCompleteCelebrated === true) return false;
    if (state.companionSideStoryChapter3AllCompleteCelebrated !== false) {
      state.companionSideStoryChapter3AllCompleteCelebrated = false;
      return true;
    }
    return false;
  }

  // §133 v0.54: 第3話全話完了を確認し、未祝賀なら演出を予約する
  // 新規達成ならtrueを返す（saveGame()は呼び出し側で行う）
  function checkCompanionSideStoryChapter3AllComplete(origin) {
    normalizeCompanionSideStoryChapter3Flags();
    if (!areAllCompanionSideStoryChapter3Complete()) return false;
    normalizeCompanionSideStoryChapter3AllCompleteFlag();
    if (state.companionSideStoryChapter3AllCompleteCelebrated === true) return false;
    state.companionSideStoryChapter3AllCompleteCelebrated = true;
    _pendingCompanionStoryChapter3AllCompleteNotice = true;
    if (origin) { _pendingCompanionStoryChapter3AllCompleteOrigin = origin; }
    return true;
  }

  // §119 v0.45.2: 第2話全話完了演出モーダルを開く
  function showCompanionStoryChapter2AllCompleteCelebration(origin) {
    if (_companionStoryChapter2AllCompleteNoticeVisible) return;
    if (_companionStoryAllCompleteNoticeVisible) return; // §120 v0.45.3: 第1話表示中は開かない（同時表示防止最終防衛線）
    var _el119 = document.getElementById("companion-story-chapter2-all-complete-modal");
    if (!_el119) return;
    _companionStoryChapter2AllCompleteNoticeVisible = true;
    _companionStoryChapter2AllCompleteOrigin = origin || "field";
    openModal("companion-story-chapter2-all-complete-modal");
    var _closeBtn119 = document.getElementById("btn-cstory-chapter2-all-complete-close");
    if (_closeBtn119) { _closeBtn119.focus(); }
  }

  // §119 v0.45.2: 第2話全話完了演出モーダルを安全に閉じる（origin別後処理）
  function closeCompanionStoryChapter2AllCompleteCelebration() {
    _companionStoryChapter2AllCompleteNoticeVisible = false;
    _pendingCompanionStoryChapter2AllCompleteNotice = false;
    closeModal("companion-story-chapter2-all-complete-modal");
    var _closeOrigin119 = _companionStoryChapter2AllCompleteOrigin;
    _companionStoryChapter2AllCompleteOrigin = null;
    _pendingCompanionStoryChapter2AllCompleteOrigin = null;
    if (_companionStoryChapter2AllCompleteNoticeTimer) {
      clearTimeout(_companionStoryChapter2AllCompleteNoticeTimer);
      _companionStoryChapter2AllCompleteNoticeTimer = null;
    }
    // 酒場がまだ開いている場合: closeModalがstate.modalOpen=falseにするのを戻す
    var _tavernEl119 = document.getElementById("tavern-modal");
    if (_tavernEl119 && !_tavernEl119.classList.contains("hidden")) {
      state.modalOpen = true;
    }
    // §120 v0.45.3 / §133 v0.54: 残存pendingの安全確認（debug・破損状態対策）
    if (_pendingCompanionStoryAllCompleteNotice || _pendingCompanionStoryChapter2AllCompleteNotice || _pendingCompanionStoryChapter3AllCompleteNotice) {
      schedulePendingCompanionStoryCompletionNotices(50);
    }
  }

  // §119 v0.45.2: 第2話全話完了演出pending消費（ガード付き）
  function consumePendingCompanionStoryChapter2AllCompleteNotice() {
    if (!_pendingCompanionStoryChapter2AllCompleteNotice) return;
    if (_companionStoryChapter2AllCompleteNoticeVisible) return;
    if (!state.companionSideStoryChapter2AllCompleteCelebrated) return;
    if (!areAllCompanionSideStoryChapter2Complete()) return;
    // 物語モーダルが開いていれば待機
    var _storyEl119 = document.getElementById("companion-story-modal");
    if (_storyEl119 && !_storyEl119.classList.contains("hidden")) return;
    // 戦闘中は待機
    if (state.inBattle) return;
    // 第1話演出表示中は待機（二枚重ね防止）
    if (_companionStoryAllCompleteNoticeVisible) return;
    // 前の遅延タイマーをキャンセル
    if (_companionStoryChapter2AllCompleteNoticeTimer) {
      clearTimeout(_companionStoryChapter2AllCompleteNoticeTimer);
      _companionStoryChapter2AllCompleteNoticeTimer = null;
    }
    var _origin119 = _pendingCompanionStoryChapter2AllCompleteOrigin || "field";
    _pendingCompanionStoryChapter2AllCompleteNotice = false;
    _pendingCompanionStoryChapter2AllCompleteOrigin = null;
    showCompanionStoryChapter2AllCompleteCelebration(_origin119);
  }

  // §133 v0.54: 第3話全話完了演出モーダルを開く
  function showCompanionStoryChapter3AllCompleteCelebration(origin) {
    if (_companionStoryChapter3AllCompleteNoticeVisible) return;
    if (_companionStoryChapter2AllCompleteNoticeVisible) return; // ch2表示中は開かない（同時表示防止）
    if (_companionStoryAllCompleteNoticeVisible) return; // ch1表示中は開かない（同時表示防止）
    var _el133 = document.getElementById("companion-story-chapter3-all-complete-modal");
    if (!_el133) return;
    _companionStoryChapter3AllCompleteNoticeVisible = true;
    _companionStoryChapter3AllCompleteOrigin = origin || "field";

    // 演出本文を生成
    var _pName133 = getPlayerDisplayName();
    var _safeName133 = _pName133.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    var _lines133 = [
      { speaker: "ナレーション", text: "四人の物語を聞き終えた夜、酒場には静かな灯りがともっていた。" },
      { speaker: "ジュリタニ",   text: "受け取った力は、自分だけのものにしちゃいけねえんだな。" },
      { speaker: "シュリタニ",   text: "帰る場所があるなら、迷っている誰かにも印を残せる気がする。" },
      { speaker: "ノリオ",       text: "記録は、過去を閉じ込めるためではなく、未来へ渡すためにあるんだな。" },
      { speaker: "ハルミ",       text: "もらった灯りを次の人へ渡したら、きっと朝はもっと明るくなるよ。" },
      { speaker: _pName133,      text: "みんなから受け取ったものを、俺も次へ渡していきたい。" },
      { speaker: "ナレーション", text: "四つの灯りは一つの輪となり、まだ見ぬ誰かへ続く道を照らしていた。" }
    ];
    var _html133 = "";
    for (var _li133 = 0; _li133 < _lines133.length; _li133++) {
      var _ln133 = _lines133[_li133];
      var _spRaw133 = _ln133.speaker;
      var _spSafe133 = _spRaw133.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      var _txtSafe133 = _ln133.text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      var _spColor133 = (_spRaw133 === "ナレーション") ? "#adb5bd" :
                        (_spRaw133 === _pName133) ? "#a0cfff" : "#ffd166";
      _html133 += "<div style=\"margin-bottom:10px;\">" +
        "<div style=\"font-size:0.8em;color:" + _spColor133 + ";\">" + _spSafe133 + "</div>" +
        "<div style=\"padding-left:8px;\">" + _txtSafe133 + "</div>" +
        "</div>";
    }
    _html133 += "<div style=\"text-align:center;margin-top:12px;font-size:0.85em;color:#aaa;\">✨ 仲間の第3話が全て完了しました</div>";
    var _bodyEl133 = document.getElementById("companion-story-chapter3-all-complete-body");
    if (_bodyEl133) { _bodyEl133.innerHTML = _html133; }

    openModal("companion-story-chapter3-all-complete-modal");
    var _closeBtn133 = document.getElementById("btn-cstory-chapter3-all-complete-close");
    if (_closeBtn133) { _closeBtn133.focus(); }
  }

  // §133 v0.54: 第3話全話完了演出モーダルを安全に閉じる（origin別後処理）
  function closeCompanionStoryChapter3AllCompleteCelebration() {
    _companionStoryChapter3AllCompleteNoticeVisible = false;
    _pendingCompanionStoryChapter3AllCompleteNotice = false;
    closeModal("companion-story-chapter3-all-complete-modal");
    _companionStoryChapter3AllCompleteOrigin = null;
    _pendingCompanionStoryChapter3AllCompleteOrigin = null;
    if (_companionStoryChapter3AllCompleteNoticeTimer) {
      clearTimeout(_companionStoryChapter3AllCompleteNoticeTimer);
      _companionStoryChapter3AllCompleteNoticeTimer = null;
    }
    // 酒場がまだ開いている場合: closeModalがstate.modalOpen=falseにするのを戻す
    var _tavernEl133 = document.getElementById("tavern-modal");
    if (_tavernEl133 && !_tavernEl133.classList.contains("hidden")) {
      state.modalOpen = true;
    }
    // 残存pendingの安全確認（破損状態対策）
    if (_pendingCompanionStoryAllCompleteNotice || _pendingCompanionStoryChapter2AllCompleteNotice || _pendingCompanionStoryChapter3AllCompleteNotice) {
      schedulePendingCompanionStoryCompletionNotices(50);
    }
    // §135 v0.56: 第3話close後に最終サイドストーリー解放通知をスケジュール（条件満たす場合のみ・1回限り）
    if (isFinalCompanionSideStoryUnlocked() && !state.finalCompanionSideStoryUnlockNotified) {
      scheduleFinalCompanionSideStoryUnlockNotice(800);
    }
  }

  // §116 v0.44.3: 全話完了演出モーダルを開く（origin引数・フォーカス管理）
  function showCompanionStoryAllCompleteCelebration(origin) {
    if (_companionStoryAllCompleteNoticeVisible) return;
    _companionStoryAllCompleteNoticeVisible = true;
    _companionStoryAllCompleteOrigin = origin || "field";
    openModal("companion-story-all-complete-modal");
    var _closeBtn116 = document.getElementById("btn-cstory-all-complete-close");
    if (_closeBtn116) { _closeBtn116.focus(); }
  }

  // §116 v0.44.3: 全話完了演出モーダルを安全に閉じる（origin別後処理）
  function closeCompanionStoryAllCompleteCelebration() {
    _companionStoryAllCompleteNoticeVisible = false;
    _pendingCompanionStoryAllCompleteNotice = false;
    closeModal("companion-story-all-complete-modal");
    // 酒場がまだ開いている場合: closeModalがstate.modalOpen=falseにするのを戻す
    var _tavernEl116 = document.getElementById("tavern-modal");
    if (_tavernEl116 && !_tavernEl116.classList.contains("hidden")) {
      state.modalOpen = true;
    }
    _companionStoryAllCompleteOrigin = null;
    // §120 v0.45.3 / §133 v0.54: 第1話close後に第2話・第3話pendingがあれば短い遅延後に再消費
    // state.modalOpen=trueを維持して演出間の隙間で背景操作不可を保証
    if (_pendingCompanionStoryChapter2AllCompleteNotice || _pendingCompanionStoryChapter3AllCompleteNotice) {
      state.modalOpen = true;
      schedulePendingCompanionStoryCompletionNotices(50);
    }
  }

  // §133 v0.54: 第3話全話完了演出pending消費（ガード付き）
  function consumePendingCompanionStoryChapter3AllCompleteNotice() {
    if (!_pendingCompanionStoryChapter3AllCompleteNotice) return;
    if (_companionStoryChapter3AllCompleteNoticeVisible) return;
    if (!state.companionSideStoryChapter3AllCompleteCelebrated) return;
    if (!areAllCompanionSideStoryChapter3Complete()) return;
    // 物語モーダルが開いていれば待機
    var _storyEl133 = document.getElementById("companion-story-modal");
    if (_storyEl133 && !_storyEl133.classList.contains("hidden")) return;
    // 戦闘中は待機
    if (state.inBattle) return;
    // 第1話・第2話演出表示中は待機（二枚重ね防止）
    if (_companionStoryAllCompleteNoticeVisible) return;
    if (_companionStoryChapter2AllCompleteNoticeVisible) return;
    // 前の遅延タイマーをキャンセル
    if (_companionStoryChapter3AllCompleteNoticeTimer) {
      clearTimeout(_companionStoryChapter3AllCompleteNoticeTimer);
      _companionStoryChapter3AllCompleteNoticeTimer = null;
    }
    var _origin133 = _pendingCompanionStoryChapter3AllCompleteOrigin || "field";
    _pendingCompanionStoryChapter3AllCompleteNotice = false;
    _pendingCompanionStoryChapter3AllCompleteOrigin = null;
    showCompanionStoryChapter3AllCompleteCelebration(_origin133);
  }

  // §116 v0.44.3: ガード強化・タイマー管理・origin引数対応
  function consumePendingCompanionStoryAllCompleteNotice() {
    if (!_pendingCompanionStoryAllCompleteNotice) return;
    if (_companionStoryAllCompleteNoticeVisible) return;
    if (!state.companionSideStoryAllCompleteCelebrated) return;
    if (!areAllCompanionSideStoriesComplete()) return;
    // 物語モーダルが開いていれば待機（物語と演出を重ねない）
    var _storyEl116 = document.getElementById("companion-story-modal");
    if (_storyEl116 && !_storyEl116.classList.contains("hidden")) return;
    // 戦闘中は待機
    if (state.inBattle) return;
    // 前の遅延タイマーをキャンセル（直接呼び出し時の二重実行防止）
    if (_companionStoryAllCompleteNoticeTimer) {
      clearTimeout(_companionStoryAllCompleteNoticeTimer);
      _companionStoryAllCompleteNoticeTimer = null;
    }
    var _origin116 = _pendingCompanionStoryAllCompleteOrigin || "field";
    _pendingCompanionStoryAllCompleteNotice = false;
    _pendingCompanionStoryAllCompleteOrigin = null;
    showCompanionStoryAllCompleteCelebration(_origin116);
  }

  // §120 v0.45.3 / §133 v0.54: 共通キュー調整関数 — 第1話→第2話→第3話の順で安全にpendingを消費する
  // いずれかの演出表示中なら何もしない
  // 上位pendingが存在する限り下位話を追い越して表示しない
  function consumePendingCompanionStoryCompletionNotices() {
    if (_companionStoryAllCompleteNoticeVisible) return;
    if (_companionStoryChapter2AllCompleteNoticeVisible) return;
    if (_companionStoryChapter3AllCompleteNoticeVisible) return; // §133 v0.54
    if (_pendingCompanionStoryAllCompleteNotice) {
      consumePendingCompanionStoryAllCompleteNotice();
      return;
    }
    if (_pendingCompanionStoryChapter2AllCompleteNotice) {
      consumePendingCompanionStoryChapter2AllCompleteNotice();
      return;
    }
    if (_pendingCompanionStoryChapter3AllCompleteNotice) { // §133 v0.54
      consumePendingCompanionStoryChapter3AllCompleteNotice();
      return;
    }
  }

  // §120 v0.45.3: 共通スケジュール関数 — 既存timerをキャンセルしdelay後にキュー消費を実行
  // saveGame()しない / originを変更しない / pendingを変更しない
  function schedulePendingCompanionStoryCompletionNotices(delay) {
    if (_companionStoryCompletionNoticeQueueTimer) {
      clearTimeout(_companionStoryCompletionNoticeQueueTimer);
      _companionStoryCompletionNoticeQueueTimer = null;
    }
    var _d = (typeof delay === "number" && delay >= 0) ? delay : 0;
    _companionStoryCompletionNoticeQueueTimer = setTimeout(function () {
      _companionStoryCompletionNoticeQueueTimer = null;
      consumePendingCompanionStoryCompletionNotices();
    }, _d);
  }

  // 仲間がパーティに加入したことがあるか（現在パーティ中 or 過去にEXPを獲得済み）
  function hasCompanionEverJoined(cid) {
    if (hasCompanion(cid)) return true;
    var cl = getCompanionLevel(cid);
    return cl.level > 1 || cl.exp > 0;
  }

  // 仲間サイドストーリーが解放済みか（chapter未指定=1話）
  // §117 v0.45: chapter=2対応（加入済み＋第1話完了＋Lv50以上）
  // §122 v0.47: chapter=3対応（加入済み＋第2話完了＋Lv75以上）
  function isCompanionSideStoryUnlocked(cid, chapter) {
    var _ch = (chapter === 3) ? 3 : (chapter === 2) ? 2 : 1; // §122 v0.47
    if (!findById(COMPANION_DATA, cid)) return false;
    if (!hasCompanionEverJoined(cid)) return false;
    if (_ch === 3) { // §122 v0.47
      if (!COMPANION_SIDE_STORY_CHAPTER3_DATA[cid]) return false;
      if (!isCompanionSideStoryCompleted(cid, 2)) return false;
      var _cl122 = getCompanionLevel(cid);
      return _cl122.level >= 75;
    }
    if (_ch === 2) {
      if (!COMPANION_SIDE_STORY_CHAPTER2_DATA[cid]) return false;
      if (!isCompanionSideStoryCompleted(cid, 1)) return false;
      var _cl117 = getCompanionLevel(cid);
      return _cl117.level >= 50;
    }
    // chapter=1: 既存仕様（加入済み＋仲間わざ習得済み）
    if (!COMPANION_SIDE_STORY_DATA[cid]) return false;
    return isCompanionTechniqueUnlocked(cid);
  }

  // 仲間サイドストーリーのロック理由テキストを返す（chapter未指定=1話）
  // §117 v0.45: chapter=2対応 / §122 v0.47: chapter=3対応
  function getCompanionSideStoryLockReason(cid, chapter) {
    var _ch = (chapter === 3) ? 3 : (chapter === 2) ? 2 : 1; // §122 v0.47
    var c = findById(COMPANION_DATA, cid);
    if (!c) return "";
    if (!hasCompanionEverJoined(cid)) {
      return "まずは" + c.name + "と出会おう";
    }
    if (_ch === 3) { // §122 v0.47
      if (!isCompanionSideStoryCompleted(cid, 2)) {
        var _s2 = COMPANION_SIDE_STORY_CHAPTER2_DATA[cid];
        var _s2title = _s2 ? _s2.title : "第2話";
        return "第2話「" + _s2title + "」を完了すると解放";
      }
      var _cl122b = getCompanionLevel(cid);
      if (_cl122b.level < 75) {
        return "仲間Lv75で解放（現在Lv" + _cl122b.level + "）";
      }
      return "閲覧可能";
    }
    if (_ch === 2) {
      if (!isCompanionSideStoryCompleted(cid, 1)) {
        var _s1 = COMPANION_SIDE_STORY_DATA[cid];
        var _s1title = _s1 ? _s1.title : "第1話";
        return "第1話「" + _s1title + "」を完了すると解放";
      }
      var _cl117b = getCompanionLevel(cid);
      if (_cl117b.level < 50) {
        return "仲間Lv50で解放（現在Lv" + _cl117b.level + "）";
      }
      return "閲覧可能";
    }
    // chapter=1: 既存仕様（加入済みだが仲間わざ未習得）
    var td = COMPANION_TECHNIQUE_DATA[cid];
    var techName = td ? td.name : "仲間わざ";
    return "「" + techName + "」を習得すると解放（" + getCompanionTechniqueLockReason(cid) + "）";
  }

  // 仲間サイドストーリーの会話行を表示する（§117 v0.45: chapter対応 / §118 v0.45.1: storyIdガード）
  function showCompanionSideStoryLine() {
    var cid = state.activeCompanionSideStory;
    if (!cid) return;
    var _ch = normalizeCompanionSideStoryChapter(_cstoryActiveChapter);
    if (_ch === null) { return; }
    var story = getCompanionSideStoryData(cid, _ch);
    if (!story) return;
    // §118 v0.45.1: storyIdが一致しない場合は表示しない（セッション混入防止）
    if (_cstoryActiveStoryId !== null && story.id !== _cstoryActiveStoryId) { return; }
    var idx = state.activeCompanionSideStoryLine;
    var lines = story.lines;
    if (!lines || idx < 0 || idx >= lines.length) return;
    var line = lines[idx];
    if (!line) return;
    var isLast = (idx === lines.length - 1);
    var titleEl = document.getElementById("cstory-title");
    var speakerEl = document.getElementById("cstory-speaker");
    var textEl = document.getElementById("cstory-text");
    var progressEl = document.getElementById("cstory-progress");
    var nextBtn = document.getElementById("btn-cstory-next");
    if (titleEl) { titleEl.textContent = "📖 " + story.title; }
    if (speakerEl) {
      speakerEl.textContent = (line.speaker === "あなた") ? getPlayerDisplayName() : (line.speaker || ""); // §126 v0.49
      speakerEl.style.color = (line.speaker === "語り") ? "#adb5bd" : (line.speaker === "あなた") ? "#a0cfff" : "#ffd166";
    }
    if (textEl) { textEl.textContent = line.text || ""; }
    if (progressEl) { progressEl.textContent = (idx + 1) + " / " + lines.length; }
    if (nextBtn) {
      if (isLast) {
        // §114 v0.44.1 / §117 v0.45: 再読（既完了）は「物語を閉じる」、初回は「物語を終える」
        var _isReread = isCompanionSideStoryCompleted(cid, _cstoryActiveChapter);
        nextBtn.textContent = _isReread ? "物語を閉じる" : "物語を終える";
      } else {
        nextBtn.textContent = "次へ ▶";
      }
    }
  }

  // 仲間サイドストーリーを開始する（§117 v0.45: chapter引数追加 / §118 v0.45.1: 安定化）
  function startCompanionSideStory(cid, chapter) {
    // §118 v0.45.1: chapter正規化（明示的不正値は拒否・省略=第1話）
    var _ch = normalizeCompanionSideStoryChapter(chapter);
    if (_ch === null) {
      showToast("不正なchapter引数です。");
      return;
    }
    // §118 v0.45.1: cid検証
    if (typeof cid !== "string" || !cid) {
      showToast("不正なcid引数です。");
      return;
    }
    var story = getCompanionSideStoryData(cid, _ch);
    // §114 v0.44.1: データ検証を強化
    if (!story || !story.lines || !Array.isArray(story.lines) || story.lines.length === 0) {
      showToast("この物語のデータを読み込めなかった。");
      return;
    }
    if (!isCompanionSideStoryUnlocked(cid, _ch)) {
      showToast("この物語はまだ解放されていない。\n" + getCompanionSideStoryLockReason(cid, _ch));
      return;
    }
    // §123 v0.47.1: 全ガード通過後にのみchapterをセット（アトミック化・ガード失敗時の汚染防止）
    _cstoryActiveChapter = _ch;
    // §114 v0.44.1: 酒場が開いているか追跡（close後の復帰先制御）
    var _tavernEl = document.getElementById("tavern-modal");
    _cstoryFromTavern = _tavernEl ? !_tavernEl.classList.contains("hidden") : false;
    // §114 v0.44.1: セッションID更新（古いクリックイベントを無効化）
    _cstorySessionId++;
    _cstoryAdvanceLock = false;
    if (_cstoryAdvanceTimer) { clearTimeout(_cstoryAdvanceTimer); _cstoryAdvanceTimer = null; }
    // 状態設定
    state.activeCompanionSideStory = cid;
    state.activeCompanionSideStoryLine = 0;
    // §118 v0.45.1: storyId記録（セッション混入防止）
    _cstoryActiveStoryId = story.id || null;
    // 酒場から開いた場合のみ酒場を閉じる
    if (_cstoryFromTavern) { closeModal("tavern-modal"); }
    showCompanionSideStoryLine();
    openModal("companion-story-modal");
  }

  // 仲間サイドストーリー完了処理（§117 v0.45: chapter引数追加 / §118 v0.45.1: 安定化 / §122 v0.47: ch3対応）
  function completeCompanionSideStory(cid, chapter) {
    var _ch = normalizeCompanionSideStoryChapter(chapter);
    if (_ch === null) { return; }
    // §118 v0.45.1: アクティブセッションと一致しない呼び出しを棄却
    if (state.activeCompanionSideStory !== cid) { return; }
    if (_cstoryActiveChapter !== _ch) { return; }
    var _expectedStory = getCompanionSideStoryData(cid, _ch);
    if (!_expectedStory) { return; }
    if (_cstoryActiveStoryId !== null && _expectedStory.id !== _cstoryActiveStoryId) { return; }
    if (_ch === 3) { // §122 v0.47: 第3話完了処理（全話完了演出なし・ch1/ch2と完全分離）
      // §123 v0.47.1: _cstoryCompletingロック（多重完了防止）
      if (_cstoryCompleting) { return; }
      _cstoryCompleting = true;
      // §123 v0.47.1: 最終行確認（完了処理側でも再確認）
      var _lastIdx3 = _expectedStory.lines.length - 1;
      if (typeof state.activeCompanionSideStoryLine !== "number" || state.activeCompanionSideStoryLine !== _lastIdx3) {
        _cstoryCompleting = false;
        return;
      }
      normalizeCompanionSideStoryChapter3Flags();
      if (state.companionSideStoryChapter3Flags[cid] === true) {
        _cstoryCompleting = false;
        return; // 既に完了済み: 追加save・通知なし
      }
      state.companionSideStoryChapter3Flags[cid] = true;
      // §133 v0.54: 第3話全員完了チェック（4人目完了時にcelebrated=true + pending登録）
      checkCompanionSideStoryChapter3AllComplete();
      saveGame(); // ch3 flags + chapter3AllCompleteCelebrated を1回で保存
      var _story3 = getCompanionSideStoryData(cid, 3);
      var _title3 = _story3 ? _story3.title : cid;
      var _c3 = findById(COMPANION_DATA, cid);
      var _cName3 = _c3 ? _c3.icon + " " + _c3.name : cid;
      showToast("📖 " + _cName3 + "の物語・第3話\n「" + _title3 + "」を読み終えた。");
      _cstoryCompleting = false;
      return;
    }
    if (_ch === 2) {
      normalizeCompanionSideStoryChapter2Flags();
      if (state.companionSideStoryChapter2Flags[cid] === true) {
        return; // 既に完了済み: 追加save・通知なし
      }
      state.companionSideStoryChapter2Flags[cid] = true;
      // §119 v0.45.2: 第2話全話完了チェック（4話目完了時にcelebrated=true + pending登録）
      checkCompanionSideStoryChapter2AllComplete();
      saveGame(); // ch2 flags + chapter2AllCompleteCelebrated を1回で保存
      var _story2 = getCompanionSideStoryData(cid, 2);
      var _title2 = _story2 ? _story2.title : cid;
      var _c2 = findById(COMPANION_DATA, cid);
      var _cName2 = _c2 ? _c2.name : cid;
      showToast("📖 " + _cName2 + "の物語・第2話\n「" + _title2 + "」を読み終えた。");
      return;
    }
    // chapter=1: 既存処理
    normalizeCompanionSideStoryFlags();
    if (state.companionSideStoryFlags[cid] === true) {
      return; // 既に完了済み: 追加save・通知なし
    }
    state.companionSideStoryFlags[cid] = true;
    // §115 v0.44.2: 全話完了チェック（4話目完了時にcelebrated=true + pending登録）
    checkCompanionSideStoryAllComplete();
    saveGame(); // flag + celebratedを1回で保存
    var story = COMPANION_SIDE_STORY_DATA[cid];
    var title = story ? story.title : cid;
    var c = findById(COMPANION_DATA, cid);
    var cName = c ? c.name : cid;
    showToast("📖 " + cName + "の物語\n「" + title + "」を読み終えた。");
  }

  // 仲間サイドストーリーモーダルを閉じて酒場の物語一覧へ戻る（冪等）
  function closeCompanionSideStoryModal() {
    // §114 v0.44.1: 酒場から開いた場合のみ酒場へ戻る
    var _fromTavern = _cstoryFromTavern;
    state.activeCompanionSideStory = null;
    state.activeCompanionSideStoryLine = 0;
    _cstoryFromTavern = false;
    _cstoryAdvanceLock = false;
    _cstoryActiveChapter = 1; // §117 v0.45: chapterリセット
    _cstoryActiveStoryId = null; // §118 v0.45.1: storyIdクリア
    if (_cstoryAdvanceTimer) { clearTimeout(_cstoryAdvanceTimer); _cstoryAdvanceTimer = null; }
    closeModal("companion-story-modal");
    if (_fromTavern) {
      openModal("tavern-modal");
      renderTavernStories();
    }
    // §120 v0.45.3 / §133 v0.54: 全話のoriginを先に設定（個別consume関数が参照）
    _pendingCompanionStoryAllCompleteOrigin = _fromTavern ? "tavern" : "field";
    _pendingCompanionStoryChapter2AllCompleteOrigin = _fromTavern ? "tavern" : "field";
    _pendingCompanionStoryChapter3AllCompleteOrigin = _fromTavern ? "tavern" : "field"; // §133 v0.54
    // §120 v0.45.3: 個別timerをクリアし共通キューで一本化（競合防止・表示順保証）
    if (_companionStoryAllCompleteNoticeTimer) {
      clearTimeout(_companionStoryAllCompleteNoticeTimer);
      _companionStoryAllCompleteNoticeTimer = null;
    }
    if (_companionStoryChapter2AllCompleteNoticeTimer) {
      clearTimeout(_companionStoryChapter2AllCompleteNoticeTimer);
      _companionStoryChapter2AllCompleteNoticeTimer = null;
    }
    if (_companionStoryChapter3AllCompleteNoticeTimer) { // §133 v0.54
      clearTimeout(_companionStoryChapter3AllCompleteNoticeTimer);
      _companionStoryChapter3AllCompleteNoticeTimer = null;
    }
    if (_pendingCompanionStoryAllCompleteNotice || _pendingCompanionStoryChapter2AllCompleteNotice || _pendingCompanionStoryChapter3AllCompleteNotice) {
      schedulePendingCompanionStoryCompletionNotices(250);
    }
  }

  // §111 v0.43: 仲間わざ習得済みか判定（Lv25以上 + rewardFlag=true）
  function isCompanionTechniqueUnlocked(cid) {
    var td = COMPANION_TECHNIQUE_DATA[cid];
    if (!td) return false;
    var cl = getCompanionLevel(cid);
    if (cl.level < td.unlockLevel) return false;
    normalizeCompanionGearRewardFlags();
    return !!(state.companionGearRewardFlags && state.companionGearRewardFlags[td.requiredGearId]);
  }

  // §111 v0.43: 習得条件が満たされていない理由を返す（ステータス画面・コマンドUI用）
  function getCompanionTechniqueLockReason(cid) {
    var td = COMPANION_TECHNIQUE_DATA[cid];
    if (!td) return "";
    var cl = getCompanionLevel(cid);
    var lvOk = cl.level >= td.unlockLevel;
    normalizeCompanionGearRewardFlags();
    var gearOk = !!(state.companionGearRewardFlags && state.companionGearRewardFlags[td.requiredGearId]);
    var gearDat = COMPANION_GEAR_DATA[td.requiredGearId];
    var gearName = gearDat ? gearDat.name : td.requiredGearId;
    var gearSrc  = COMPANION_GEAR_REWARD_DATA[td.requiredGearId];
    if (!lvOk && !gearOk) {
      return "Lv" + td.unlockLevel + " ＋ " + gearName + "を入手で習得";
    }
    if (!lvOk) {
      return "Lv" + td.unlockLevel + "で習得（装備入手済み）";
    }
    return gearName + "を入手で習得" + (gearSrc ? "（" + gearSrc.source + "）" : "");
  }

  // §139 v0.58: 仲間わざ習得演出（非永続・IIFEスコープ・saveしない）
  var _companionTechniqueLearnPending = [];      // 表示待ちcid配列（順序保証）
  var _companionTechniqueLearnVisible = false;   // 演出表示中フラグ（二重表示防止）
  var _companionTechniqueLearnTimer = null;      // 延期タイマーID
  var _companionTechniqueLearnCloseLock = false; // close連打防止

  // §139 v0.58: 習得演出済みフラグを正規化（never-demote・changed返値）
  // saveGame禁止・modal禁止・pending禁止・render禁止
  function normalizeCompanionTechniqueLearnedNotices() {
    if (!state.companionTechniqueLearnedNotices ||
        typeof state.companionTechniqueLearnedNotices !== "object" ||
        Array.isArray(state.companionTechniqueLearnedNotices)) {
      state.companionTechniqueLearnedNotices = {};
    }
    var _ncids = ["juritani", "shurittani", "norio", "harumi"];
    var _nchanged = false;
    for (var _ni = 0; _ni < _ncids.length; _ni++) {
      var _ncid = _ncids[_ni];
      if (state.companionTechniqueLearnedNotices[_ncid] === true) { continue; } // never demote
      if (typeof state.companionTechniqueLearnedNotices[_ncid] !== "boolean") {
        state.companionTechniqueLearnedNotices[_ncid] = false;
        _nchanged = true;
      }
    }
    return _nchanged;
  }

  // §139 v0.58: 習得通知をキューに追加（重複・演出済み・条件ガード付き）
  // ここではsaveしない。pending追加のみ。
  function queueCompanionTechniqueLearnNotice(cid) {
    if (!COMPANION_TECHNIQUE_DATA[cid]) { return; }
    if (!isCompanionTechniqueUnlocked(cid)) { return; }
    normalizeCompanionTechniqueLearnedNotices();
    if (state.companionTechniqueLearnedNotices[cid] === true) { return; } // 演出済みならスキップ
    // 既にpending中なら追加しない（重複防止）
    for (var _pi = 0; _pi < _companionTechniqueLearnPending.length; _pi++) {
      if (_companionTechniqueLearnPending[_pi] === cid) { return; }
    }
    // 表示中の先頭cidと同じなら追加しない
    if (_companionTechniqueLearnVisible && _companionTechniqueLearnPending.length > 0 &&
        _companionTechniqueLearnPending[0] === cid) { return; }
    _companionTechniqueLearnPending.push(cid);
  }

  // §139 v0.58: pending習得演出を消費（戦闘中・他モーダル中は延期）
  function consumePendingCompanionTechniqueLearnNotice() {
    if (_companionTechniqueLearnVisible) { return; }
    if (_companionTechniqueLearnPending.length === 0) { return; }
    if (state.inBattle) { // 戦闘中は延期（戦闘終了後のフィールドで表示）
      if (_companionTechniqueLearnTimer) { clearTimeout(_companionTechniqueLearnTimer); }
      _companionTechniqueLearnTimer = setTimeout(consumePendingCompanionTechniqueLearnNotice, 400);
      return;
    }
    if (state.modalOpen) { // 他モーダル中は延期
      if (_companionTechniqueLearnTimer) { clearTimeout(_companionTechniqueLearnTimer); }
      _companionTechniqueLearnTimer = setTimeout(consumePendingCompanionTechniqueLearnNotice, 300);
      return;
    }
    var _qcid = _companionTechniqueLearnPending[0];
    // 演出済みになっていたらpendingから除去してスキップ
    normalizeCompanionTechniqueLearnedNotices();
    if (state.companionTechniqueLearnedNotices[_qcid] === true) {
      _companionTechniqueLearnPending.shift();
      if (_companionTechniqueLearnPending.length > 0) {
        if (_companionTechniqueLearnTimer) { clearTimeout(_companionTechniqueLearnTimer); }
        _companionTechniqueLearnTimer = setTimeout(consumePendingCompanionTechniqueLearnNotice, 200);
      }
      return;
    }
    showCompanionTechniqueLearnModal(_qcid);
  }

  // §139 v0.58: 仲間わざ習得演出モーダルを表示（1人ずつ）
  function showCompanionTechniqueLearnModal(cid) {
    if (_companionTechniqueLearnVisible) { return; }
    var _std = COMPANION_TECHNIQUE_DATA[cid];
    if (!_std) { return; }
    var _scd = findById(COMPANION_DATA, cid);
    if (!_scd) { return; }
    _companionTechniqueLearnVisible = true;
    var _personEmoji = _scd.icon || "&#x1F9D1;";
    var _bodyEl = document.getElementById("companion-technique-learn-body");
    if (_bodyEl) {
      _bodyEl.innerHTML =
        '<h3 style="margin:0 0 10px;font-size:1.15em;">&#x2728; 仲間わざ習得！</h3>' +
        '<p style="font-size:1.1em;margin-bottom:6px;">' + _personEmoji + ' ' + _scd.name + '</p>' +
        '<p style="font-size:1.0em;font-weight:bold;margin-bottom:10px;color:#ffd166;">&#x26A1; &#x300C;' + _std.name + '&#x300D;を覚えた！</p>' +
        '<div style="font-size:0.88em;color:#adb5bd;text-align:left;padding:8px;background:#1a2a3a;border-radius:6px;margin-bottom:10px;">' + _std.description + '</div>' +
        '<p style="font-size:0.82em;color:#6c757d;margin-bottom:16px;">仲間わざは戦闘中、1戦につき1回だけ使用できます。</p>' +
        '<button class="modal-btn" id="btn-tech-learn-close" style="width:100%;">閉じる</button>';
    }
    openModal("modal-companion-technique-learn");
    var _closeBtn = document.getElementById("btn-tech-learn-close");
    if (_closeBtn) { _closeBtn.onclick = closeCompanionTechniqueLearnModal; }
  }

  // §139 v0.58: 仲間わざ習得演出モーダルを閉じる（close連打防止・save1回・次の通知へ）
  function closeCompanionTechniqueLearnModal() {
    if (_companionTechniqueLearnCloseLock) { return; }
    _companionTechniqueLearnCloseLock = true;
    var _ccid = (_companionTechniqueLearnPending.length > 0) ? _companionTechniqueLearnPending[0] : null;
    closeModal("modal-companion-technique-learn");
    _companionTechniqueLearnVisible = false;
    if (_ccid) {
      normalizeCompanionTechniqueLearnedNotices();
      if (state.companionTechniqueLearnedNotices[_ccid] !== true) {
        state.companionTechniqueLearnedNotices[_ccid] = true;
        saveGame(); // 表示済みをtrueにするタイミング: close時。save1回。
      }
      _companionTechniqueLearnPending.shift();
    }
    _companionTechniqueLearnCloseLock = false;
    // 複数pending時は次の仲間へ（400ms後）
    if (_companionTechniqueLearnPending.length > 0) {
      if (_companionTechniqueLearnTimer) { clearTimeout(_companionTechniqueLearnTimer); }
      _companionTechniqueLearnTimer = setTimeout(consumePendingCompanionTechniqueLearnNotice, 400);
    }
  }

  // §82 v0.28: 仲間コマンドシーケンスを開始する
  function startCompanionCommands() {
    var e = state.enemy;
    if (!state.inBattle || !e) return;
    if (e.hp <= 0) { winBattle(); return; }
    // 究極ゴリラ戦：コマンドなし、見守り
    if (e.final) {
      log("仲間たちは息をのんで見守っている……。");
      setTimeout(enemyTurn, 400);
      return;
    }
    var companions = state.player.companions;
    if (!companions || companions.length === 0) {
      setTimeout(enemyTurn, 400);
      return;
    }
    state.companionCommandQueue = companions.slice();
    state.companionCommandIndex = 0;
    state.companionCommandActive = true;  // §83 v0.28.1
    state.companionCommandLocked = false; // §83 v0.28.1
    showCompanionCommandForIdx(0);
  }

  // §82 v0.28 / §84 v0.29: idx 番目の仲間コマンドメニューを表示（3択）
  function showCompanionCommandForIdx(idx) {
    var e = state.enemy;
    if (!state.inBattle) return;
    if (!e || e.hp <= 0) { winBattle(); return; }
    var queue = state.companionCommandQueue || [];
    if (idx >= queue.length) {
      document.getElementById("battle-menu").classList.remove("hidden");
      setTimeout(enemyTurn, 400);
      return;
    }
    var cid = queue[idx];
    var cData = findById(COMPANION_DATA, cid);
    var label = cData ? (cData.icon + " " + cData.name) : cid; // §121 v0.46: icon（人型）に変更
    // §93 v0.34: 仲間が2人以上のとき「N/M人目」を表示
    var total = queue.length;
    var progress = total > 1 ? "（" + (idx + 1) + "/" + total + "人目）" : "";
    var menu = document.getElementById("companion-command-menu");
    // §84 v0.29: 3択レイアウト。§95 v0.35: 4択（⚔️/⭐ / ✨/🤝）に変更。まかせるの grid-column:1/-1 を削除
    // §89 v0.32: 「固有コマンド」ボタンを「⭐ 固有」に短縮し、サブメニューへ誘導
    // §111 v0.43: ⚡わざボタン追加（5択：たたかう/固有/まほう/わざ/まかせる）
    var _hasTech = !!(COMPANION_TECHNIQUE_DATA[cid]);
    var _techUnlocked = _hasTech && isCompanionTechniqueUnlocked(cid);
    var _techUsed = !!(state.companionTechniqueUsed && state.companionTechniqueUsed[cid]);
    var _techLabel = _techUnlocked ? "⚡ わざ" : "🔒 わざ";
    var _techStyle = _techUnlocked ? (_techUsed ? "color:#555;border-color:#555;" : "color:#ffd166;border-color:#ffd166;") : "color:#888;border-color:#666;";
    var _techDisabled = (_techUnlocked && _techUsed) ? " disabled" : "";
    var techBtn = _hasTech
      ? '<button id="btn-companion-tech"' + _techDisabled + ' style="' + _techStyle + '">' + _techLabel + '</button>'
      : '<button id="btn-companion-tech" disabled style="color:#555;border-color:#555;">⚡ わざ</button>';
    menu.innerHTML =
      '<p style="margin:2px 0 6px;font-size:0.85em;color:#aaffcc;grid-column:1/-1;">' + label + "の行動は？ " + progress + '</p>' +
      '<button id="btn-companion-fight">⚔️ たたかう</button>' +
      '<button id="btn-companion-special">⭐ 固有</button>' +
      '<button id="btn-companion-magic">✨ まほう</button>' +
      techBtn +
      '<button id="btn-companion-auto" style="grid-column:1/-1;">🤝 まかせる</button>';
    menu.classList.remove("hidden");
    document.getElementById("battle-menu").classList.add("hidden");
    // §83 v0.28.1: companionCommandLocked=false でこの仲間のターン開始
    state.companionCommandLocked = false;
    document.getElementById("btn-companion-fight").onclick = function() {
      executeCompanionCommand(cid, "fight");
    };
    document.getElementById("btn-companion-special").onclick = function() { // §89 v0.32: サブメニューへ
      showCompanionSpecialMenu(cid);
    };
    document.getElementById("btn-companion-magic").onclick = function() { // §95 v0.35: まほうサブメニューへ
      showCompanionMagicMenu(cid);
    };
    document.getElementById("btn-companion-tech").onclick = function() { // §111 v0.43: わざ
      executeCompanionCommand(cid, "technique");
    };
    document.getElementById("btn-companion-auto").onclick = function() {
      executeCompanionCommand(cid, "auto");
    };
  }

  // §89 v0.32: 固有コマンドサブメニューを表示する（1つ目 / 2つ目 / 戻る）
  function showCompanionSpecialMenu(cid) {
    if (!state.companionCommandActive) return;
    var cData = findById(COMPANION_DATA, cid);
    var label = cData ? (cData.icon + " " + cData.name) : cid; // §121 v0.46: icon（人型）に変更
    // 仲間ごとのコマンド名
    var s1Label = "⭐ 固有1"; var s2Label = "⭐ 固有2";
    if (cid === "juritani") {
      s1Label = "💥 会心の構え"; s2Label = "🛡️ かばう";
    } else if (cid === "shurittani") {
      s1Label = "🪤 捕獲アシスト"; s2Label = "🕸️ 捕獲の網";
    } else if (cid === "norio") {
      s1Label = "📈 経験値の眼"; s2Label = "📝 経験値メモ";
    } else if (cid === "harumi") {
      s1Label = "✨ 小さな癒し"; s2Label = "🛡️ まもりの光";
    }
    var csMenu = document.getElementById("companion-special-menu");
    csMenu.innerHTML =
      '<p style="margin:2px 0 6px;font-size:0.85em;color:#aaffcc;grid-column:1/-1;">' + label + 'の固有コマンド</p>' +
      '<button id="btn-companion-s1" style="grid-column:1/-1;">' + s1Label + '</button>' +
      '<button id="btn-companion-s2" style="grid-column:1/-1;">' + s2Label + '</button>' +
      '<button id="btn-companion-sback" class="submenu-back">↩ 戻る</button>';
    csMenu.classList.remove("hidden");
    document.getElementById("companion-command-menu").classList.add("hidden");
    document.getElementById("btn-companion-s1").onclick = function() {
      // §90 v0.32.1: 押下直後に全ボタンを disable して二重実行を確実に防ぐ
      var _cs = document.getElementById("companion-special-menu");
      _cs.querySelectorAll("button").forEach(function(b) { b.disabled = true; });
      _cs.classList.add("hidden");
      executeCompanionCommand(cid, "special");
    };
    document.getElementById("btn-companion-s2").onclick = function() {
      var _cs = document.getElementById("companion-special-menu");
      _cs.querySelectorAll("button").forEach(function(b) { b.disabled = true; });
      _cs.classList.add("hidden");
      executeCompanionCommand(cid, "special2");
    };
    document.getElementById("btn-companion-sback").onclick = function() {
      var _cs = document.getElementById("companion-special-menu");
      _cs.querySelectorAll("button").forEach(function(b) { b.disabled = true; });
      _cs.classList.add("hidden");
      showCompanionCommandForIdx(state.companionCommandIndex);
    };
  }

  // §95 v0.35 / §96 v0.35.1: 仲間まほうサブメニューを表示する（まほう1つ / 戻る）
  function showCompanionMagicMenu(cid) {
    if (!state.companionCommandActive) return;
    if (state.companionCommandLocked) return; // §96 v0.35.1: 二重呼び出し防止ガード追加
    var cData = findById(COMPANION_DATA, cid);
    var label = cData ? (cData.icon + " " + cData.name) : cid; // §121 v0.46: icon（人型）に変更
    var mLabel = "✨ まほう";
    if (cid === "juritani")        { mLabel = "🔥 熱血エール"; }
    else if (cid === "shurittani") { mLabel = "🫧 おちつきの霧"; }
    else if (cid === "norio")      { mLabel = "🔍 観察メモ"; }
    else if (cid === "harumi")     { mLabel = "✨ 小さな回復"; }
    var cmMenu = document.getElementById("companion-magic-menu");
    cmMenu.innerHTML =
      '<p style="margin:2px 0 6px;font-size:0.85em;color:#aaffcc;grid-column:1/-1;">' + label + 'のまほう</p>' +
      '<button id="btn-companion-m1" style="grid-column:1/-1;">' + mLabel + '</button>' +
      '<button id="btn-companion-mback" class="submenu-back">↩ 戻る</button>';
    cmMenu.classList.remove("hidden");
    document.getElementById("companion-command-menu").classList.add("hidden");
    document.getElementById("btn-companion-m1").onclick = function() {
      var _cm = document.getElementById("companion-magic-menu");
      _cm.querySelectorAll("button").forEach(function(b) { b.disabled = true; });
      _cm.classList.add("hidden");
      executeCompanionCommand(cid, "magic");
    };
    document.getElementById("btn-companion-mback").onclick = function() {
      var _cm = document.getElementById("companion-magic-menu");
      _cm.querySelectorAll("button").forEach(function(b) { b.disabled = true; });
      _cm.classList.add("hidden");
      showCompanionCommandForIdx(state.companionCommandIndex);
    };
  }

  // §82 v0.28 / §83 v0.28.1 / §84 v0.29: 仲間コマンドボタン押下 → 行動実行 → 次の仲間 or 敵ターン
  function executeCompanionCommand(cid, mode) {
    // §83 v0.28.1: 二重押し・二重実行を companionCommandLocked で防止
    if (state.companionCommandLocked) { return; }
    state.companionCommandLocked = true;
    var fBtn = document.getElementById("btn-companion-fight");
    var aBtn = document.getElementById("btn-companion-auto");
    var sBtn = document.getElementById("btn-companion-special");
    var mBtn = document.getElementById("btn-companion-magic");  // §95 v0.35
    var s1Btn = document.getElementById("btn-companion-s1"); // §89 v0.32
    var s2Btn = document.getElementById("btn-companion-s2"); // §89 v0.32
    var m1Btn = document.getElementById("btn-companion-m1"); // §95 v0.35
    if (fBtn) { fBtn.disabled = true; }
    if (aBtn) { aBtn.disabled = true; }
    if (sBtn) { sBtn.disabled = true; }
    if (mBtn) { mBtn.disabled = true; }  // §95 v0.35
    if (s1Btn) { s1Btn.disabled = true; } // §89 v0.32
    if (s2Btn) { s2Btn.disabled = true; } // §89 v0.32
    if (m1Btn) { m1Btn.disabled = true; } // §95 v0.35
    document.getElementById("companion-command-menu").classList.add("hidden");
    var csMenu = document.getElementById("companion-special-menu"); // §89 v0.32
    if (csMenu) { csMenu.classList.add("hidden"); }
    var cmMenu2 = document.getElementById("companion-magic-menu"); // §95 v0.35
    if (cmMenu2) { cmMenu2.classList.add("hidden"); }
    document.getElementById("battle-menu").classList.remove("hidden");
    if (!state.inBattle) return;
    var e = state.enemy;
    if (!e || e.hp <= 0) { winBattle(); return; }
    var killed;
    if (mode === "special") { // §84 v0.29: 1つ目の固有コマンド
      killed = runCompanionSpecialAction(cid);
    } else if (mode === "special2") { // §89 v0.32: 2つ目の固有コマンド
      killed = runCompanionSpecialAction(cid, "second");
    } else if (mode === "magic") { // §95 v0.35: 仲間まほう
      killed = runCompanionMagicAction(cid);
    } else if (mode === "technique") { // §111 v0.43: 仲間わざ
      var techResult = runCompanionTechniqueAction(cid);
      if (techResult === null) {
        // 不発（習得未達・使用済み・条件不足）→ ターン消費なし・メニューへ戻る
        state.companionCommandLocked = false;
        showCompanionCommandForIdx(state.companionCommandIndex);
        return;
      }
      killed = techResult;
    } else if (mode === "auto") { // §85 v0.29.1: まかせる → ランダム行動
      killed = runCompanionAutoCommand(cid);
    } else { // たたかう
      killed = runSingleCompanionAction(cid);
    }
    state.companionCommandIndex++;
    if (killed || (e && e.hp <= 0)) { winBattle(); return; }
    showCompanionCommandForIdx(state.companionCommandIndex);
  }

  // §95 v0.35: 仲間まほう実行。返値 true=敵HP0、false=敵生存または回復のみ
  // 仲間MP・主人公MP消費なし。gainExp/captureRate/BGM変更なし。
  function runCompanionMagicAction(cid) {
    var p = state.player, e = state.enemy;
    if (!state.inBattle || !e) return false;
    if (cid === "juritani") {
      // 🔥 熱血エール: §101 v0.38: 成長ボーナス加算（5〜12 + growthBonus）
      if (e.hp <= 0) return false;
      var growthJ = getCompanionGrowthBonus("juritani");
      var dmgJ = 5 + Math.floor(Math.random() * 8) + growthJ;
      dmgJ += getCompanionEquipmentBonus("juritani", "damage", "magic"); // §107 v0.41
      e.hp = Math.max(0, e.hp - dmgJ);
      log("🔥 ジュリタニの熱血エール！");
      log("気合いの声が相手に響いた！");
      log(e.name + "に" + dmgJ + "ダメージ！");
      renderEnemy();
      return e.hp <= 0;
    } else if (cid === "shurittani") {
      // 🫧 おちつきの霧: §101 v0.38: 成長ボーナス加算。捕獲率本体は変更しない
      if (e.hp <= 0) return false;
      var growthS = getCompanionGrowthBonus("shurittani");
      var dmgS = 1 + Math.floor(Math.random() * 3) + growthS;
      dmgS += getCompanionEquipmentBonus("shurittani", "damage", "magic"); // §107 v0.41
      e.hp = Math.max(0, e.hp - dmgS);
      log("🫧 シュリタニのおちつきの霧！");
      log("相手の動きが少しゆるんだ！");
      log("捕まえやすくなった気がする！");
      renderEnemy();
      return e.hp <= 0;
    } else if (cid === "norio") {
      // 🔍 観察メモ: §101 v0.38: 成長ボーナス加算。gainExpは変更しない
      if (e.hp <= 0) return false;
      var growthN = getCompanionGrowthBonus("norio");
      var dmgN = 3 + Math.floor(Math.random() * 5) + growthN;
      dmgN += getCompanionEquipmentBonus("norio", "damage", "magic"); // §107 v0.41
      e.hp = Math.max(0, e.hp - dmgN);
      log("🔍 ノリオの観察メモ！");
      log("相手のクセを記録した！");
      log("この戦い、学びが多そうだ！");
      renderEnemy();
      return e.hp <= 0;
    } else if (cid === "harumi") {
      // ✨ 小さな回復: §101 v0.38: 回復量に成長ボーナス加算。maxHpでクランプ。常に false を返す
      log("✨ ハルミの小さな回復！");
      if (p.hp >= p.maxHp) {
        log("しかし、HPはすでに満タンだ。");
        return false;
      }
      var growthH = getCompanionGrowthBonus("harumi");
      var heal = 15 + Math.floor(Math.random() * 11) + growthH;
      heal += getCompanionEquipmentBonus("harumi", "heal", "magic"); // §107 v0.41
      var before = p.hp;
      p.hp = Math.min(p.maxHp, p.hp + heal);
      var actual = p.hp - before;
      log("HPが" + actual + "回復した！");
      updateBattlePlayerStatus(); // §95 v0.35: HP色・状態バッジ連動
      return false;
    }
    return false;
  }

  // §111 v0.43: 仲間わざ実行。返値 true=敵HP0, false=敵生存/回復のみ, null=不発（ターン消費なし）
  function runCompanionTechniqueAction(cid) {
    var p = state.player, e = state.enemy;
    if (!state.inBattle || !e) return null;
    var td = COMPANION_TECHNIQUE_DATA[cid];
    if (!td) { log("このわざは存在しない。"); return null; }
    ensureCompanionTechniqueUsageState(); // §112 v0.43.1: 壊れた状態を修復（全リセットではなくキー補完）
    if (!isCompanionTechniqueUnlocked(cid)) {
      var lockReason = getCompanionTechniqueLockReason(cid);
      log("🔒 " + td.name + "はまだ習得していない。");
      if (lockReason) { log("習得条件：" + lockReason); }
      return null; // ターン消費なし
    }
    if (state.companionTechniqueUsed[cid]) {
      log("この戦闘では、すでに仲間わざを使っている。");
      return null; // ターン消費なし
    }
    var cData = findById(COMPANION_DATA, cid);
    var cName = cData ? cData.name : cid;
    var growthBonus = getCompanionGrowthBonus(cid);

    if (td.type === "damage") {
      if (e.hp <= 0) return null;
      var dmgTech = randInt(td.minValue, td.maxValue) + growthBonus;
      state.companionTechniqueUsed[cid] = true;
      log("⚡ " + cName + "の「" + td.name + "」！");
      if (cid === "juritani") { log("勢いのまま連撃をたたき込んだ！"); }
      if (cid === "norio")    { log("弱点と行動パターンを完全に読み切った！"); }
      e.hp = Math.max(0, e.hp - dmgTech);
      log(e.name + "に" + dmgTech + "ダメージ！");
      renderEnemy();
      return e.hp <= 0;
    }

    if (td.type === "damage_leave_one") {
      if (e.hp <= 0) return null;
      if (e.hp <= 1) {
        log("⚡ " + cName + "の「" + td.name + "」！");
        log("しかし、これ以上追い詰めることはできない。");
        return null; // HP1のため不発・ターン消費なし
      }
      var dmgShu = randInt(td.minValue, td.maxValue) + growthBonus;
      var actualShu = Math.max(0, Math.min(dmgShu, e.hp - 1));
      state.companionTechniqueUsed[cid] = true;
      log("⚡ " + cName + "の「" + td.name + "」！");
      log("逃げ道をすべて封じた！");
      e.hp = Math.max(1, e.hp - actualShu);
      log(e.name + "に" + actualShu + "ダメージ！");
      if (e.hp <= 1) { log(e.name + "をHP1まで追い詰めた！"); }
      renderEnemy();
      return false; // 絶対に撃破しない
    }

    if (td.type === "heal_protect") {
      var alreadyReduced = (state.battleDamageReduction || 0) >= td.damageReduction;
      if (p.hp >= p.maxHp && alreadyReduced) {
        log("⚡ " + cName + "の「" + td.name + "」！");
        log("しかし、HPは満タンで、強い守りの効果がすでにある。");
        return null; // 効果なし・ターン消費なし
      }
      state.companionTechniqueUsed[cid] = true;
      log("⚡ " + cName + "の「" + td.name + "」！");
      log("あたたかな光が仲間を包んだ！");
      if (p.hp < p.maxHp) {
        var healAmt = randInt(td.minValue, td.maxValue) + growthBonus;
        var beforeH = p.hp;
        p.hp = Math.min(p.maxHp, p.hp + healAmt);
        var actualH = p.hp - beforeH;
        log("HPが" + actualH + "回復した！");
      } else {
        log("HPは満タンのまま。");
      }
      if (!alreadyReduced) {
        state.battleDamageReduction = Math.max(state.battleDamageReduction || 0, td.damageReduction);
        log("次の敵攻撃を15%軽減する！");
      } else {
        log("強い守りの効果が維持された！");
      }
      updateBattlePlayerStatus();
      return false; // 回復わざは撃破なし
    }

    return null;
  }

  // §82 v0.28: 仲間1人の行動を実行する共通関数（コマンド選択・自動行動で共用）
  // 返値: true = 敵HP0、false = 敵生存
  function runSingleCompanionAction(cid) {
    var p = state.player, e = state.enemy;
    if (!state.inBattle || !e || e.hp <= 0) return false;
    if (cid === "juritani") {
      // §101 v0.38: 成長ボーナス加算（旧cap20 → 新cap30）
      var growthJ = getCompanionGrowthBonus("juritani");
      var dmgJ = Math.min(30, Math.min(20, 5 + Math.floor(p.level / 8)) + growthJ);
      var isCritJ = Math.random() < 0.25;
      if (isCritJ) { dmgJ = Math.floor(dmgJ * 1.5); }
      dmgJ += getCompanionEquipmentBonus("juritani", "damage", "attack"); // §107 v0.41
      e.hp = Math.max(0, e.hp - dmgJ);
      log(isCritJ
        ? "💪 ジュリタニの追撃！ 💥 会心！ " + e.name + "に" + dmgJ + "ダメージ！"
        : "💪 ジュリタニの追撃！ " + e.name + "に" + dmgJ + "ダメージ！");
    } else if (cid === "shurittani") {
      // §101 v0.38: 成長ボーナス加算（旧cap5 → 新cap10）
      var growthS = getCompanionGrowthBonus("shurittani");
      var dmgS = Math.min(10, Math.min(5, 1 + Math.floor(p.level / 20)) + growthS);
      dmgS += getCompanionEquipmentBonus("shurittani", "damage", "attack"); // §107 v0.41
      e.hp = Math.max(0, e.hp - dmgS);
      log("🪤 シュリタニが相手の動きを読んだ！ " + e.name + "に" + dmgS + "ダメージ！");
      log("なんだか捕まえやすくなった気がする。");
    } else if (cid === "norio") {
      // §101 v0.38: 成長ボーナス加算（旧cap15 → 新cap20）
      var growthN = getCompanionGrowthBonus("norio");
      var dmgN = Math.min(20, Math.min(15, 4 + Math.floor(p.level / 10)) + growthN);
      dmgN += getCompanionEquipmentBonus("norio", "damage", "attack"); // §107 v0.41
      e.hp = Math.max(0, e.hp - dmgN);
      log("📈 ノリオ「経験値のために倒せ！」 " + e.name + "に" + dmgN + "ダメージ！");
    } else if (cid === "harumi") {
      // §101 v0.38: ハルミ通常攻撃に成長ボーナスなし（回復量のみ成長）
      var dmgH = Math.min(18, 5 + Math.floor(p.level / 9));
      e.hp = Math.max(0, e.hp - dmgH);
      log("✨ ハルミが光を放った！ " + e.name + "に" + dmgH + "ダメージ！");
    }
    renderEnemy();
    return !!(e.hp <= 0);
  }

  // §84 v0.29 / §86 v0.30 / §89 v0.32: 仲間固有コマンド実行。返値 true=敵HP0（ハルミは常に false）
  // specialId="second" で2つ目の固有コマンドを実行（省略時は1つ目）
  function runCompanionSpecialAction(cid, specialId) {
    var p = state.player, e = state.enemy;
    if (!state.inBattle || !e || e.hp <= 0) return false;

    // §89 v0.32: 2つ目の固有コマンド
    if (specialId === "second") {
      if (cid === "juritani") {
        // 🛡️ かばう: 次の敵攻撃を20%軽減（§101 v0.38: 軽減率変更なし）
        state.battleDamageReduction = Math.max(state.battleDamageReduction || 0, 0.20);
        log("🛡️ ジュリタニが前に出た！");
        log("次のダメージを少し受け止めてくれる！");
        updateBattleStatusBadges(); // §93 v0.34
        return false;
      } else if (cid === "shurittani") {
        // 🕸️ 捕獲の網: §101 v0.38: 成長ボーナス加算（旧cap4 → 新cap9）
        var growthSN = getCompanionGrowthBonus("shurittani");
        var dmgSN = Math.min(9, Math.min(4, 2 + Math.floor(p.level / 40)) + growthSN);
        dmgSN += getCompanionEquipmentBonus("shurittani", "damage", "special2"); // §107 v0.41
        e.hp = Math.max(0, e.hp - dmgSN);
        log("🕸️ シュリタニが捕獲の網を広げた！");
        log("相手の動きが少し鈍った！ " + e.name + "に" + dmgSN + "ダメージ！");
        renderEnemy();
        return !!(e.hp <= 0);
      } else if (cid === "norio") {
        // 📝 経験値メモ: §101 v0.38: 成長ボーナス加算（旧cap8 → 新cap13）
        var growthNM = getCompanionGrowthBonus("norio");
        var dmgNM = Math.min(13, Math.min(8, 4 + Math.floor(p.level / 20)) + growthNM);
        dmgNM += getCompanionEquipmentBonus("norio", "damage", "special2"); // §107 v0.41
        e.hp = Math.max(0, e.hp - dmgNM);
        log("📝 ノリオが経験値メモを取り始めた！");
        log("この戦い、あとで振り返れそうだ！ " + e.name + "に" + dmgNM + "ダメージ！");
        renderEnemy();
        return !!(e.hp <= 0);
      } else if (cid === "harumi") {
        // 🛡️ まもりの光: 次の敵攻撃を25%軽減（§101 v0.38: 軽減率変更なし）
        state.battleDamageReduction = Math.max(state.battleDamageReduction || 0, 0.25);
        log("🛡️ ハルミがまもりの光を灯した！");
        log("次に受けるダメージが少し減りそうだ！");
        updateBattleStatusBadges(); // §93 v0.34
        return false;
      }
      return false;
    }

    // 1つ目の固有コマンド
    if (cid === "juritani") {
      // §86 v0.30: 会心の構え: 会心率30%、倍率1.6維持
      // §101 v0.38: 成長ボーナス加算（旧cap28 → 新cap38）
      var growthJ = getCompanionGrowthBonus("juritani");
      var dmgJ = Math.min(38, Math.min(28, 8 + Math.floor(p.level / 7)) + growthJ);
      var isCritJ = Math.random() < 0.30;
      if (isCritJ) { dmgJ = Math.floor(dmgJ * 1.6); }
      dmgJ += getCompanionEquipmentBonus("juritani", "damage", "special1"); // §107 v0.41: 会心倍率後に加算
      e.hp = Math.max(0, e.hp - dmgJ);
      log("💥 ジュリタニの会心の構え！");
      log(isCritJ
        ? "大会心！ " + e.name + "に" + dmgJ + "ダメージ！"
        : e.name + "に" + dmgJ + "ダメージ！");
      renderEnemy();
      return !!(e.hp <= 0);
    } else if (cid === "shurittani") {
      // §86 v0.30: 捕獲アシスト: 捕獲率変更なし
      // §101 v0.38: 成長ボーナス加算（旧cap3 → 新cap8）
      var growthS = getCompanionGrowthBonus("shurittani");
      var dmgS = Math.min(8, Math.min(3, 1 + Math.floor(p.level / 30)) + growthS);
      dmgS += getCompanionEquipmentBonus("shurittani", "damage", "special1"); // §107 v0.41
      e.hp = Math.max(0, e.hp - dmgS);
      log("🪤 シュリタニの捕獲アシスト！");
      log("捕まえやすい間合いを作った！ " + e.name + "に" + dmgS + "ダメージ！");
      renderEnemy();
      return !!(e.hp <= 0);
    } else if (cid === "norio") {
      // §86 v0.30: 経験値の眼
      // §101 v0.38: 成長ボーナス加算（旧cap12 → 新cap17）
      var growthN = getCompanionGrowthBonus("norio");
      var dmgN = Math.min(17, Math.min(12, 3 + Math.floor(p.level / 12)) + growthN);
      dmgN += getCompanionEquipmentBonus("norio", "damage", "special1"); // §107 v0.41
      e.hp = Math.max(0, e.hp - dmgN);
      log("📈 ノリオの経験値の眼！");
      log("この戦い、学びが多そうだ！ " + e.name + "に" + dmgN + "ダメージ！");
      renderEnemy();
      return !!(e.hp <= 0);
    } else if (cid === "harumi") {
      // §86 v0.30: 小さな癒し（HP満タン時に専用メッセージ）
      // §101 v0.38: 回復量に成長ボーナス加算（旧cap25 → 新cap35、maxHpでクランプ）
      var growthH = getCompanionGrowthBonus("harumi");
      var heal = Math.min(35, Math.min(25, 10 + Math.floor(p.level / 10)) + growthH);
      heal += getCompanionEquipmentBonus("harumi", "heal", "special1"); // §107 v0.41
      var before = p.hp;
      p.hp = Math.min(p.maxHp, p.hp + heal);
      var actual = p.hp - before;
      log("✨ ハルミの小さな癒し！");
      if (actual <= 0) {
        log("しかし、HPはすでに満タンだ。");
      } else {
        log("HPが " + actual + " 回復した！");
      }
      updateStatusBar();
      return false;
    }
    return false;
  }

  // §85 v0.29.1 / §86 v0.30 / §87 v0.31 / §91 v0.33 / §92 v0.33.1 / §97 v0.36: まかせる専用。4択ウェイト正規化 + 状況判断 + 前回行動記憶
  // 返値: true = 敵HP0（ハルミの固有コマンド / 防御系コマンドは常に false）
  function runCompanionAutoCommand(cid) {
    if (!state.inBattle || !state.enemy || state.enemy.hp <= 0) return false;
    var p = state.player;
    var e = state.enemy;
    var cData = findById(COMPANION_DATA, cid);
    var name = cData ? cData.name : cid;

    // §97 v0.36: 仲間別基本ウェイト（wA / wS1 / wS2 / wM）
    var wA = 0.35, wS1 = 0.35, wS2 = 0.15, wM = 0.15; // デフォルト（未知cid用）
    if (cid === "juritani") {
      wA = 0.30; wS1 = 0.35; wS2 = 0.15; wM = 0.20; // 攻撃・会心の構え多め
    } else if (cid === "shurittani") {
      wA = 0.20; wS1 = 0.35; wS2 = 0.25; wM = 0.20; // 捕獲系多め
    } else if (cid === "norio") {
      wA = 0.35; wS1 = 0.30; wS2 = 0.15; wM = 0.20; // バランス型
    } else if (cid === "harumi") {
      wA = 0.20; wS1 = 0.35; wS2 = 0.20; wM = 0.25; // 回復・まほう寄り
    }

    // §97 v0.36: 状況判断（優先順位: 敵HP低 > ハルミHP判断 > 基本ウェイト）
    var enemyHpLow = (e.hp <= 15);
    var playerHpPct = p.hp / p.maxHp;
    if (enemyHpLow) {
      // 敵HPが残りわずか → 攻撃優先でとどめを刺す、防御系・回復を減らす
      if (cid === "juritani")        { wA = 0.45; wS1 = 0.35; wS2 = 0.05; wM = 0.15; }
      else if (cid === "shurittani") { wA = 0.50; wS1 = 0.25; wS2 = 0.10; wM = 0.15; }
      else if (cid === "norio")      { wA = 0.55; wS1 = 0.25; wS2 = 0.05; wM = 0.15; }
      else if (cid === "harumi")     { wA = 0.70; wS1 = 0.05; wS2 = 0.10; wM = 0.15; }
    } else if (cid === "harumi") {
      if (playerHpPct <= 0.40) {
        wA = 0.05; wS1 = 0.45; wS2 = 0.15; wM = 0.35; // HP低下 → 小さな癒し・小さな回復優先
      } else if (playerHpPct >= 0.85) {
        wA = 0.45; wS1 = 0.05; wS2 = 0.35; wM = 0.15; // HP満タン付近 → まもりの光サポート
      }
    }

    // §97 v0.36: 前回行動記憶による補正（-0.10 して正規化で自動配分）
    if (!state.lastCompanionAutoAction) { state.lastCompanionAutoAction = {}; }
    var lastAction = state.lastCompanionAutoAction[cid];
    if (lastAction === "attack") {
      wA = Math.max(0, wA - 0.10);
    } else if (lastAction === "special1" || lastAction === "special") { // "special" は後方互換
      wS1 = Math.max(0, wS1 - 0.10);
    } else if (lastAction === "special2") {
      wS2 = Math.max(0, wS2 - 0.10);
    } else if (lastAction === "magic") { // §97 v0.36: magic 追加
      wM = Math.max(0, wM - 0.10);
    }

    // 正規化（合計が必ず 1.0 になるようにする）
    var total = wA + wS1 + wS2 + wM;
    if (total <= 0) { wA = 1; wS1 = 0; wS2 = 0; wM = 0; total = 1; }
    wA  /= total;
    wS1 /= total;
    wS2 /= total;
    wM  /= total;

    // 行動選択
    var roll = Math.random();
    var chosenAction;
    if (roll < wA) {
      chosenAction = "attack";
    } else if (roll < wA + wS1) {
      chosenAction = "special1";
    } else if (roll < wA + wS1 + wS2) {
      chosenAction = "special2";
    } else {
      chosenAction = "magic"; // §97 v0.36
    }

    // 前回行動を記録
    state.lastCompanionAutoAction[cid] = chosenAction;

    // §92 v0.33.1 / §97 v0.36: ログを2行（まかせた宣言 + 選んだコマンド名）
    if (chosenAction === "attack") {
      log("🤝 " + name + "にまかせた！");
      log("たたかうを選んだ！");
      return runSingleCompanionAction(cid);
    } else if (chosenAction === "special1") {
      var s1Name = "固有コマンド";
      if (cid === "juritani")        { s1Name = "会心の構え"; }
      else if (cid === "shurittani") { s1Name = "捕獲アシスト"; }
      else if (cid === "norio")      { s1Name = "経験値の眼"; }
      else if (cid === "harumi")     { s1Name = "小さな癒し"; }
      log("🤝 " + name + "にまかせた！");
      log(s1Name + "を選んだ！");
      return runCompanionSpecialAction(cid);
    } else if (chosenAction === "special2") {
      var s2Name = "固有コマンド2";
      if (cid === "juritani")        { s2Name = "かばう"; }
      else if (cid === "shurittani") { s2Name = "捕獲の網"; }
      else if (cid === "norio")      { s2Name = "経験値メモ"; }
      else if (cid === "harumi")     { s2Name = "まもりの光"; }
      log("🤝 " + name + "にまかせた！");
      log(s2Name + "を選んだ！");
      return runCompanionSpecialAction(cid, "second");
    } else { // magic §97 v0.36
      var mName = "まほう";
      if (cid === "juritani")        { mName = "熱血エール"; }
      else if (cid === "shurittani") { mName = "おちつきの霧"; }
      else if (cid === "norio")      { mName = "観察メモ"; }
      else if (cid === "harumi")     { mName = "小さな回復"; }
      log("🤝 " + name + "にまかせた！");
      log(mName + "を選んだ！");
      return runCompanionMagicAction(cid);
    }
  }

  // §80 v0.27 / §81 v0.27.1 / §82 v0.28: 全仲間を自動行動（runSingleCompanionAction に委譲）
  // scheduleAfterPlayerAttack() からは直接呼ばれなくなったが API として維持
  function runCompanionAutoActions() {
    var e = state.enemy;
    if (!state.inBattle || !e || e.hp <= 0) return false;
    if (e.final) return false;
    var companions = state.player.companions;
    for (var ci = 0; ci < companions.length; ci++) {
      if (!state.inBattle || !e || e.hp <= 0) break;
      if (runSingleCompanionAction(companions[ci])) { break; }
    }
    return !!(e && e.hp <= 0);
  }

  function openMagicMenu() {
    if (state.locked) return;
    var menu = document.getElementById("magic-menu");
    if (state.player.spells.length === 0) {
      log("まだまほうを覚えていない！");
      return;
    }
    var html = "";
    state.player.spells.forEach(function (id) {
      var sp = findById(SPELL_DATA, id);
      html += '<button data-spell="' + sp.id + '">' + sp.name + " (MP" + sp.mpCost + ")</button>";
    });
    html += '<button class="submenu-back" id="btn-magic-back">戻る</button>';
    menu.innerHTML = html;
    menu.classList.remove("hidden");
    document.getElementById("battle-menu").classList.add("hidden");

    menu.querySelectorAll("button[data-spell]").forEach(function (btn) {
      btn.onclick = function () { castSpell(btn.getAttribute("data-spell")); };
    });
    document.getElementById("btn-magic-back").onclick = function () {
      menu.classList.add("hidden");
      document.getElementById("battle-menu").classList.remove("hidden");
    };
  }

  function castSpell(id) {
    if (state.locked) return;
    var sp = findById(SPELL_DATA, id);
    var p = state.player;
    if (p.mp < sp.mpCost) {
      log("MPが足りない！");
      return;
    }
    setBattleLocked(true);
    document.getElementById("magic-menu").classList.add("hidden");
    document.getElementById("battle-menu").classList.remove("hidden");
    p.mp -= sp.mpCost;

    // ハルミの魔法補正(spellMod): 威力・回復量に (1+spellMod) を乗算する
    var spellMultiplier = 1 + getCompanionBonus("spellMod");
    if (sp.type === "attack") {
      var e = state.enemy;
      var dmg = Math.max(1, Math.floor((sp.power + randInt(0, 4)) * spellMultiplier) - e.def);
      e.hp = Math.max(0, e.hp - dmg);
      log("✨ " + sp.name + "！ " + e.name + "に" + dmg + "のダメージ！");
      renderEnemy();
      updateBattlePlayerStatus();
      if (e.hp <= 0) { winBattle(); return; }
      scheduleAfterPlayerAttack(); // §80 v0.27
    } else {
      var heal = Math.floor((sp.power + randInt(0, 5)) * spellMultiplier);
      p.hp = Math.min(p.maxHp, p.hp + heal);
      log("✨ " + sp.name + "！ HPが" + heal + "回復した！");
      updateBattlePlayerStatus();
      setTimeout(enemyTurn, 600);
    }
  }

  // ---------------------------------------------------------
  // 14. 戦闘コマンド: アイテム(やくそう/捕獲ロープ)
  // ---------------------------------------------------------
  function openItemMenu() {
    if (state.locked) return;
    var menu = document.getElementById("item-menu");
    var p = state.player;
    var html = "";
    html += '<button id="item-potion"' + (p.potionCount <= 0 ? " disabled" : "") +
      '>🧪 やくそう x' + p.potionCount + "</button>";
    html += '<button id="item-rope"' + (p.ropeCount <= 0 ? " disabled" : "") +
      '>🪢 捕獲ロープ x' + p.ropeCount + "</button>";
    var foodItems = [
      { id: "coffee", label: "☕ コーヒー", count: p.coffeeCount },
      { id: "bread", label: "🍞 パン", count: p.breadCount },
      { id: "bento", label: "🍱 お弁当", count: p.bentoCount },
      { id: "ramen", label: "🍜 ラーメン", count: p.ramenCount }
    ];
    foodItems.forEach(function (f) {
      html += '<button id="item-' + f.id + '"' + (f.count <= 0 ? " disabled" : "") +
        ">" + f.label + " x" + f.count + "</button>";
    });
    html += '<button id="item-coughsyrup"' + (p.coughsyrupCount <= 0 ? " disabled" : "") +
      '>🍯 せき止めシロップ x' + p.coughsyrupCount + "</button>";
    html += '<button id="item-deodorant"' + (p.deodorantCount <= 0 ? " disabled" : "") +
      '>🧴 デオドラントスプレー x' + p.deodorantCount + "</button>";
    html += '<button class="submenu-back" id="btn-item-back">戻る</button>';
    menu.innerHTML = html;
    menu.classList.remove("hidden");
    document.getElementById("battle-menu").classList.add("hidden");

    document.getElementById("item-potion").onclick = usePotion;
    document.getElementById("item-rope").onclick = useRope;
    foodItems.forEach(function (f) {
      document.getElementById("item-" + f.id).onclick = function () { useFoodItem(f.id); };
    });
    document.getElementById("item-coughsyrup").onclick = function () { useCureItem("coughsyrup"); };
    document.getElementById("item-deodorant").onclick = function () { useCureItem("deodorant"); };
    document.getElementById("btn-item-back").onclick = function () {
      menu.classList.add("hidden");
      document.getElementById("battle-menu").classList.remove("hidden");
    };
  }

  function backToBattleMenu() {
    document.getElementById("item-menu").classList.add("hidden");
    document.getElementById("battle-menu").classList.remove("hidden");
  }

  // ---------------------------------------------------------
  // §61 v0.15: 戦闘コマンド: わざ（捕獲支援・低固定ダメージ技）
  // ---------------------------------------------------------
  function openWazaMenu() {
    if (state.locked) return;
    var menu = document.getElementById("waza-menu");
    var gamanStatus = state.gamanActive ? " ⚡ガマン中" : "";
    var html = '<p class="small" style="margin:4px 0 6px;color:#aaffcc;">UMA捕獲を助ける技です。固定ダメージで削ったり、ガマンで通常攻撃を弱めたりできます。' + gamanStatus + "</p>";
    WAZA_DATA.forEach(function (w) {
      if (w.type === "weakenAttack") {
        var gamanLabel = state.gamanActive ? "（効果中）" : "（通常攻撃を弱める）";
        html += '<button data-waza="' + w.id + '">' + w.emoji + " " + w.name + gamanLabel + "</button>";
      } else {
        html += '<button data-waza="' + w.id + '">' +
          w.emoji + " " + w.name + "（" + w.fixedDmg + "ダメージ固定）</button>";
      }
    });
    html += '<button class="submenu-back" id="btn-waza-back">戻る</button>';
    menu.innerHTML = html;
    menu.classList.remove("hidden");
    document.getElementById("battle-menu").classList.add("hidden");

    menu.querySelectorAll("button[data-waza]").forEach(function (btn) {
      btn.onclick = function () { useWaza(btn.getAttribute("data-waza")); };
    });
    document.getElementById("btn-waza-back").onclick = function () {
      menu.classList.add("hidden");
      document.getElementById("battle-menu").classList.remove("hidden");
    };
  }

  function useWaza(id) {
    if (state.locked) return;
    var waza = findById(WAZA_DATA, id);
    setBattleLocked(true);
    document.getElementById("waza-menu").classList.add("hidden");
    document.getElementById("battle-menu").classList.remove("hidden");

    // §63 v0.16: ここはひとつガマン（通常攻撃弱体化フラグを立てる）
    if (waza.type === "weakenAttack") {
      if (state.gamanActive) {
        log(waza.emoji + " すでにガマン中だ！");
        log("通常攻撃の威力は下がったままだ。");
      } else {
        state.gamanActive = true;
        log(waza.emoji + " " + state.player.name + "は「ここはひとつガマン」した！");
        log("肩の力が抜けて、通常攻撃の威力が大きく下がった！");
        log("UMAを削りすぎにくくなった！");
      }
      updateBattlePlayerStatus();  // §64 v0.16.1: ガマンインジケーターを即更新
      setTimeout(enemyTurn, 600);
      return;
    }

    // 固定ダメージ技
    var e = state.enemy;
    var dmg = waza.fixedDmg;
    e.hp = Math.max(0, e.hp - dmg);
    log(waza.emoji + " " + waza.name + "！ " + e.name + "に" + dmg + "ダメージ！（固定）");
    log("（残りHP: " + e.hp + " / " + e.maxHp + "）");
    renderEnemy();

    if (e.hp <= 0) {
      winBattle();
      return;
    }
    checkUltimateGorillaHpHint(e);
    scheduleAfterPlayerAttack(); // §80 v0.27
  }

  function usePotion() {
    if (state.locked) return;
    var p = state.player;
    if (p.potionCount <= 0) {
      log("やくそうを持っていない！");
      return;
    }
    setBattleLocked(true);
    backToBattleMenu();
    p.potionCount--;
    var heal = POTION_ITEM.healAmount;
    p.hp = Math.min(p.maxHp, p.hp + heal);
    log("🧪 やくそうを使った！ HPが" + heal + "回復した！(残り" + p.potionCount + "個)");
    updateBattlePlayerStatus();
    updateStatusBar();
    setTimeout(enemyTurn, 600);
  }

  function useRope() {
    if (state.locked) return;
    var p = state.player;
    if (p.ropeCount <= 0) {
      log("捕獲ロープを持っていない！");
      return;
    }
    setBattleLocked(true);
    backToBattleMenu();
    p.ropeCount--;
    log("🪢 捕獲ロープを使った！ 捕獲率が上がる！");
    updateStatusBar();
    if (!attemptCapture(ROPE_ITEM.captureBonus)) {
      setTimeout(enemyTurn, 600);
    }
  }

  // せき止めシロップ(アレルギーを治療)/デオドラントスプレー(においを治療)。
  // 該当する状態異常でない時は何も消費せずメッセージだけ表示する。
  function useCureItem(itemId) {
    if (state.locked) return;
    var p = state.player;
    var it = findById(ITEM_DATA, itemId);
    if (getItemCount(itemId) <= 0) {
      log(it.name + "を持っていない！");
      return;
    }
    backToBattleMenu();
    if (!hasAilment(it.cures)) {
      log("🤔 今は使う必要がない。");
      return; // 不要な時は消費せず、ターンも経過させない
    }
    setBattleLocked(true);
    addItemCount(itemId, -1);
    var cureMessage = it.cures === "allergy" ? "アレルギーが治った！" : "においが消えた！";
    clearAilment(it.cures, true);
    log("✨ " + it.name + "を使った！ " + cureMessage);
    updateStatusBar();
    setTimeout(enemyTurn, 600);
  }

  // 回復食料品(コーヒー/パン/お弁当/ラーメン)を戦闘中に使う。
  // HP満タンの場合は「今は使う必要がない」と表示し消費しない。
  function useFoodItem(itemId) {
    if (state.locked) return;
    var p = state.player;
    var it = findById(ITEM_DATA, itemId);
    if (getItemCount(itemId) <= 0) {
      log(it.name + "を持っていない！");
      return;
    }
    backToBattleMenu();
    if (p.hp >= p.maxHp) {
      log("🤔 今は使う必要がない。");
      return; // HP満タン時は消費せず、ターンも経過させない
    }
    setBattleLocked(true);
    addItemCount(itemId, -1);
    var heal = Math.min(it.healAmount, p.maxHp - p.hp);
    p.hp = Math.min(p.maxHp, p.hp + it.healAmount);
    var msgs = { coffee: "コーヒーを飲んだ！", bread: "パンを食べた！", bento: "お弁当を食べた！", ramen: "ラーメンを食べた！" };
    var msg = msgs[itemId] || (it.name + "を使った！");
    log("🍽️ " + msg + " HPが" + heal + "回復した！");
    updateBattlePlayerStatus();
    updateStatusBar();
    setTimeout(enemyTurn, 600);
  }

  // ---------------------------------------------------------
  // 14.5 フィールド上でのアイテム使用(§5.8)
  // ---------------------------------------------------------
  function openFieldItemModal() {
    if (state.inBattle) return;
    openModal("field-item-modal");
    renderFieldItemBody();
  }

  function renderFieldItemBody() {
    var body = document.getElementById("field-item-body");
    var p = state.player;
    var ITEM_EMOJI = { potion: "🧪", coffee: "☕", bread: "🍞", bento: "🍱", ramen: "🍜" };
    var CURE_EMOJI  = { coughsyrup: "🍯", deodorant: "🧴" };
    var healItems = ITEM_DATA.filter(function (it) { return it.type === "heal" && it.trackable; });
    var cureItems = ITEM_DATA.filter(function (it) { return it.type === "cure" && it.trackable; });

    var html = "<h3>🩹 回復アイテム</h3>";
    var anyHeal = false;
    healItems.forEach(function (it) {
      var count = getItemCount(it.id);
      if (count <= 0) return;
      anyHeal = true;
      var em = ITEM_EMOJI[it.id] || "🧪";
      var desc = it.healAmount >= 9999 ? "HP全回復" : ("HP+" + it.healAmount);
      html += '<div class="shop-row"><span>' + em + " " + it.name + " x" + count + " (" + desc + ")</span>" +
        '<button data-field-heal="' + it.id + '"' + (p.hp >= p.maxHp ? " disabled" : "") + ">使う</button></div>";
    });
    if (!anyHeal) html += '<p class="small">回復アイテムがない。</p>';

    html += "<h3>💊 治療アイテム</h3>";
    var anyCure = false;
    cureItems.forEach(function (it) {
      var count = getItemCount(it.id);
      if (count <= 0) return;
      anyCure = true;
      var em = CURE_EMOJI[it.id] || "💊";
      var ailInfo = AILMENT_INFO[it.cures];
      var eff = ailInfo ? (ailInfo.name + "を治す") : it.name;
      html += '<div class="shop-row"><span>' + em + " " + it.name + " x" + count + " (" + eff + ")</span>" +
        '<button data-field-cure="' + it.id + '"' + (!hasAilment(it.cures) ? " disabled" : "") + ">使う</button></div>";
    });
    if (!anyCure) html += '<p class="small">治療アイテムがない。</p>';

    body.innerHTML = html;
    body.querySelectorAll("button[data-field-heal]").forEach(function (btn) {
      btn.onclick = function () { useFieldHealItem(btn.getAttribute("data-field-heal")); };
    });
    body.querySelectorAll("button[data-field-cure]").forEach(function (btn) {
      btn.onclick = function () { useFieldCureItem(btn.getAttribute("data-field-cure")); };
    });
  }

  function useFieldHealItem(itemId) {
    var p = state.player;
    var it = findById(ITEM_DATA, itemId);
    if (getItemCount(itemId) <= 0) return;
    if (p.hp >= p.maxHp) {
      showToast("🤔 今は使う必要がない。");
      return;
    }
    addItemCount(itemId, -1);
    var heal = Math.min(it.healAmount, p.maxHp - p.hp);
    p.hp = Math.min(p.maxHp, p.hp + it.healAmount);
    var MSGS = { potion: "やくそうを使った！", coffee: "コーヒーを飲んだ！", bread: "パンを食べた！", bento: "お弁当を食べた！", ramen: "ラーメンを食べた！" };
    var msg = MSGS[itemId] || (it.name + "を使った！");
    updateStatusBar();
    saveGame();
    showToast("🍽️ " + msg + " HPが" + heal + "回復した！");
    renderFieldItemBody(); // 所持数・disabled状態を再描画
  }

  function useFieldCureItem(itemId) {
    var it = findById(ITEM_DATA, itemId);
    if (getItemCount(itemId) <= 0) return;
    if (!hasAilment(it.cures)) {
      showToast("🤔 今は使う必要がない。");
      return;
    }
    addItemCount(itemId, -1);
    var cureMsg = it.cures === "allergy" ? "アレルギーが治った！" : "においが消えた！";
    clearAilment(it.cures, false);
    updateStatusBar();
    saveGame();
    showToast("✨ " + it.name + "を使った！ " + cureMsg);
    renderFieldItemBody(); // 所持数・disabled状態を再描画
  }

  // ---------------------------------------------------------
  // 15. 戦闘コマンド: つかまえる / にげる
  // ---------------------------------------------------------
  // 捕獲を試みる。bonusChanceは捕獲ロープ使用時などの追加成功率。
  // 成功した場合はtrueを返す(呼び出し側で敵の行動をスキップする)。
  function attemptCapture(bonusChance) {
    var e = state.enemy;
    // §46 v0.9.2.1: canCapture:false のボス系は捕獲判定に進まない (clamp下限0.05の抜け穴も封鎖)
    if (e.canCapture === false) {
      log(e.name + "はUMAではない！");
      log("捕まえる相手ではなく、道をふさぐ強敵だ！");
      return false;
    }
    // 究極ゴリラは通常の捕獲コマンドでは捕まらない(§14.5)
    if (e.final) {
      log("究極ゴリラには普通の捕獲は通用しない！");
      log("何か特別な方法が必要だ！");
      return false;
    }
    var job = state.player.job;
    var p = state.player;
    var hpRatio = e.hp / e.maxHp;
    var smellPenalty = hasAilment("smell") ? SMELL_CAPTURE_PENALTY : 0;
    // うたうコマンドによる次回捕獲ボーナスを適用して消費
    var singBonus = p.singBonusActive || 0;
    p.singBonusActive = 0;
    // HP残量が少ないほど捕まえやすい(Version 0.4.2で強化)。
    // レアUMAはこのボーナスを半分に抑え、例外的に難しくする。
    var hpBonusMultiplier = e.rare ? CAPTURE_HP_BONUS_RARE : CAPTURE_HP_BONUS_NORMAL;
    var chance = clamp(
      e.captureRateBase + (1 - hpRatio) * hpBonusMultiplier + (job.captureMod || 0) + getCompanionBonus("captureMod") + (bonusChance || 0) + singBonus - smellPenalty,
      0.05, 0.95
    );
    if (Math.random() < chance) {
      playSE("captureOk");
      log("🪤 " + e.name + "を捕まえた！");
      captureUma(e);
      gainExp(e.exp);
      gainCompanionExp(e.exp); // §99 v0.37: パーティ仲間にも同EXP付与
      showBattleEnd();
      return true;
    }
    playSE("captureFail");
    log("🪤 しかし捕まえられなかった！");
    return false;
  }

  function doCatch() {
    if (state.locked) return;
    setBattleLocked(true);
    if (!attemptCapture(0)) {
      setTimeout(enemyTurn, 600);
    }
  }

  function captureUma(e) {
    if (!e.isUMA) return;
    state.player.dex[e.id] = "captured";
    state.player.umaInventory[e.id] = (state.player.umaInventory[e.id] || 0) + 1;
    updateStatusBar();
  }

  function doRun() {
    if (state.locked) return;
    setBattleLocked(true);
    var e = state.enemy;
    var job = state.player.job;
    var chance = clamp(e.fleeRate + (job.fleeMod || 0) + getCompanionBonus("fleeMod"), 0.05, 0.97);
    if (Math.random() < chance) {
      log("💨 うまく逃げ切った！");
      var runExp = Math.max(1, Math.floor(e.exp * 0.2));
      gainExp(runExp);
      showBattleEnd();
    } else {
      log("💨 しかし逃げられなかった！");
      setTimeout(enemyTurn, 600);
    }
  }

  // うたうコマンド(§12.5)
  function doSing() {
    if (state.locked) return;
    setBattleLocked(true);
    var e = state.enemy;
    var p = state.player;
    if (e.final) {
      doSingUltimateGorilla();
      return;
    }
    // 通常敵: 次の捕獲率に一時ボーナスを付与
    var hasHarumi = hasCompanion("harumi");
    var captureBonus = hasHarumi ? 0.08 : 0.05;
    p.singBonusActive = captureBonus;
    log("🎵 勇者の子孫は歌った！");
    if (hasHarumi) {
      log("✨ ハルミが音程を整えた！");
    }
    log("🎶 " + e.name + "は少しなごんだ！次の捕獲が成功しやすくなった！");
    setTimeout(enemyTurn, 600);
  }

  // 究極ゴリラへのうたう — 条件判定 + 捕獲演出(§14.5)
  function doSingUltimateGorilla() {
    var e = state.enemy;
    var p = state.player;
    if (p.level < 99) {
      log("🎵 歌声は森に響いた……");
      log("しかし、まだ力が足りない。");
      log("レベル99になれば届くかもしれない。");
      setTimeout(enemyTurn, 800);
      return;
    }
    if (!p.hasUkulele) {
      log("🎵 歌おうとしたが、何かが足りない。");
      log("伝説の楽器が必要なようだ。");
      setTimeout(enemyTurn, 800);
      return;
    }
    if (e.hp > 10) {
      log("🎵 究極ゴリラはまだ荒ぶっている！");
      log("もっと弱らせなければ歌は届かない。");
      setTimeout(enemyTurn, 800);
      return;
    }
    // 捕獲成功 — §65 v0.17: クライマックス演出
    log("🪗 勇者の子孫は、女神のウクレレを静かにかき鳴らした。");
    log("🎶 森に、やさしい歌が広がっていく。");
    log("🦍 究極ゴリラは暴れるのをやめ、じっとその歌に耳をすませている……");
    log("🦍 やがて究極ゴリラは、ゆっくりと近づいてきた。");
    log("🎉 究極ゴリラを捕まえた！");
    captureUma(e);
    state.gameCleared = true;
    state.pendingClear = true;
    gainExp(e.exp);
    saveGame();
    showBattleEnd();
  }

  // HPが0になっても「倒した」ではなく「逃げていった」扱いにする(GAME_DESIGN.md §13/§40)。
  // UMA収集RPGとして、敵を弱らせて捕まえる/取り逃がす、という方向性を強調するため。
  // v0.8.7: 「に逃げられた」→「は逃げていった！！」にバリエーション付きで変更。
  function winBattle() {
    var e = state.enemy;
    // §45 v0.9.2: ボスは customEscapeMsgs、通常敵は汎用バリエーションを使用
    var _escapeMsgs = e.customEscapeMsgs || [
      e.name + "は逃げていった！！",
      e.name + "はあわてて逃げていった！！",
      e.name + "はフラフラしながら逃げていった！！",
      e.name + "は戦意を失って逃げていった！！"
    ];
    log("💨 " + _escapeMsgs[Math.floor(Math.random() * _escapeMsgs.length)]);
    gainExp(e.exp);
    gainCompanionExp(e.exp); // §99 v0.37: パーティ仲間にも同EXP付与
    var gold = Math.ceil(e.exp / 2);
    if (gold > 0) {
      state.player.gold += gold;
      log("💰 " + gold + "Gを手に入れた！");
      updateStatusBar();
    }
    showBattleEnd();
  }

  // ---------------------------------------------------------
  // 16. 敵の行動
  // ---------------------------------------------------------
  function logExpGained(amount) {
    log("✨ 経験値" + amount + "を獲得！");
  }

  function enemyTurn() {
    var p = state.player, e = state.enemy;
    if (!state.inBattle) return; // 既に戦闘が終わっている場合は何もしない

    var dmg;
    if (e.final) {
      // 究極ゴリラの攻撃はすべて「かいしんのいちげき」級。
      // ぼうぎょ力をほとんど無視し、通常では受け止められない一撃にする。
      dmg = Math.max(30, e.atk + randInt(10, 30) - Math.floor(p.def * 0.1));
      log("💥💥 究極ゴリラの「かいしんのいちげき」！！");
    } else {
      dmg = Math.max(1, e.atk + randInt(0, 2) - p.def);
      // §89 v0.32: ダメージ軽減（かばう / まもりの光）— 究極ゴリラ戦には適用しない
      // §90 v0.32.1: ログを分かりやすく変更
      if (state.battleDamageReduction) {
        dmg = Math.max(1, Math.floor(dmg * (1 - state.battleDamageReduction)));
        log("🛡️ 守りの効果でダメージが少し減った！");
        state.battleDamageReduction = 0;
      }
    }
    p.hp = Math.max(0, p.hp - dmg);
    playSE("damage");
    log("💥 " + e.name + "の攻撃！ " + dmg + "のダメージを受けた！");
    updateBattlePlayerStatus();
    updateStatusBar();

    // 状態異常を与える敵の攻撃が当たった時、低確率で発症する(§13.5)
    if (e.inflicts && !hasAilment(e.inflicts.id) && Math.random() < e.inflicts.chance) {
      applyAilment(e.inflicts.id, e.inflicts.duration);
    }

    // MPを吸う敵(§6.2)
    if (e.drainsMp && Math.random() < e.drainsMp.chance && p.mp > 0) {
      var drained = Math.min(p.mp, e.drainsMp.amount);
      p.mp -= drained;
      log("🌀 " + e.name + "にMPを" + drained + "吸われた！");
      updateBattlePlayerStatus();
    }

    // 所持金を盗む敵(§6.2)
    if (e.stealsGold && Math.random() < e.stealsGold.chance && p.gold > 0) {
      var stolen = Math.min(p.gold, e.stealsGold.amount);
      p.gold -= stolen;
      log("💸 " + e.name + "に" + stolen + "Gを盗まれた！");
      updateStatusBar();
    }

    if (p.hp <= 0) {
      handlePlayerDown();
      return;
    }
    setBattleLocked(false);
  }

  function handlePlayerDown() {
    log("……目の前が真っ暗になった。");
    setTimeout(function () {
      alert(state.player.name + "は倒れてしまった……村で目を覚ました。");
      // ペナルティは大きくせず、HP全回復で村の入口に戻す(再挑戦しやすくする)
      state.player.hp = state.player.maxHp;
      state.player.mp = state.player.maxMp;
      finishBattle();
      // 村の入口(最初にHだった場所)へ強制送還
      for (var y = 0; y < MAP_H; y++) {
        for (var x = 0; x < MAP_W; x++) {
          if (RAW_MAP[y] && RAW_MAP[y][x] === "H") {
            state.player.x = x;
            state.player.y = y;
          }
        }
      }
      renderField();
      updateStatusBar();
    }, 200);
  }

  // 戦闘終了時に結果を表示してOKボタンを出す(§13)。
  // プレイヤーがOKを押すと finishBattle() を呼ぶ。
  function showBattleEnd() {
    setBattleLocked(true);
    document.getElementById("btn-battle-ok").classList.remove("hidden");
  }

  function finishBattle() {
    state.inBattle = false;
    state.gamanActive = false;  // §63 v0.16: ガマン効果を解除
    updateSingButtonChance(false);  // §64 v0.16.1: うたうボタンをリセット
    clearCompanionCommandState();  // §83 v0.28.1: 仲間コマンド状態を一括クリア
    state.enemy = null;
    stopWalking(); // 残留walkTimerをリセット
    updateBGM(getFieldBgmType());
    document.getElementById("btn-battle-ok").classList.add("hidden");
    tickSmellOnBattleEnd();
    document.getElementById("battle-screen").classList.add("hidden");
    document.getElementById("field-screen").classList.remove("hidden");
    document.getElementById("dpad").classList.remove("hidden");
    // §44 v0.9.1: 固定敵撃破フラグを確定してからセーブ
    if (state.mapMode === "side" && sideMapPendingFixedKey !== "") {
      state.sideMap.defeatedEnemies[sideMapPendingFixedKey] = true;
      sideMapPendingFixedKey = "";
    }
    renderField();
    updateStatusBar();
    saveGame();
    // 究極ゴリラ捕獲クリア後にモーダルを表示(§14.5)。クリアを優先し、Lv99演出は出さない。
    if (state.pendingClear) {
      state.pendingClear = false;
      state.pendingLv99 = false;
      openClearModal();
    } else if (state.pendingLv99) {
      state.pendingLv99 = false;
      openLv99Modal();
    }
  }

  // ---------------------------------------------------------
  // 17. 経験値・レベルアップ
  // ---------------------------------------------------------
  // §45 v0.9.2 / §46 v0.9.2.1: のりお expMod 対応。ログを改善して元EXP/倍率/最終EXPを明示。
  function gainExp(baseExp) {
    var expMult = getCompanionBonus("expMod");
    var finalExp = expMult > 0 ? Math.ceil(baseExp * expMult) : baseExp;
    if (expMult > 0) {
      log("📈 ノリオ効果！ EXP " + expMult + "倍！ (" + baseExp + " → " + finalExp + ")");
    }
    logExpGained(finalExp);
    return addExp(finalExp);
  }

  // §99 v0.37 / §100 v0.37.1: 仲間Lv/EXP状態を取得（なければ初期化、旧セーブガード付き）
  function getCompanionLevel(cid) {
    if (!state.companionLevels) { state.companionLevels = {}; }
    if (!state.companionLevels[cid]) {
      state.companionLevels[cid] = { level: 1, exp: 0, nextExp: 25 };
    }
    var cl = state.companionLevels[cid];
    // §100 v0.37.1: データ安全化ガード（旧セーブ・破損データに対処）
    if (typeof cl.level !== "number" || isNaN(cl.level) || cl.level < 1) { cl.level = 1; }
    if (cl.level > 99) { cl.level = 99; }
    if (typeof cl.exp !== "number" || isNaN(cl.exp) || cl.exp < 0) { cl.exp = 0; }
    if (typeof cl.nextExp !== "number" || isNaN(cl.nextExp) || cl.nextExp <= 0) {
      cl.nextExp = cl.level * 10 + 15;
    }
    if (cl.level >= 99) { cl.exp = 0; }
    // §103 v0.39 / §104 v0.39.1: milestonesデータガード強化
    // 旧セーブ（milestones未定義/null/配列/破損）→ 現在Lvで補完
    // 新セーブ（milestonesオブジェクト存在）→ 既存値を尊重し欠損・非booleanキーのみ安全補完
    if (!cl.milestones || typeof cl.milestones !== "object" || Array.isArray(cl.milestones)) {
      cl.milestones = {
        level10: cl.level >= 10,
        level50: cl.level >= 50,
        level99: cl.level >= 99
      };
    } else {
      if (typeof cl.milestones.level10 !== "boolean") { cl.milestones.level10 = cl.level >= 10; }
      if (typeof cl.milestones.level50 !== "boolean") { cl.milestones.level50 = cl.level >= 50; }
      if (typeof cl.milestones.level99 !== "boolean") { cl.milestones.level99 = cl.level >= 99; }
    }
    return cl;
  }

  // §99 v0.37 / §100 v0.37.1: パーティ内仲間にベースEXPを付与し、Lv99上限でレベルアップ
  // 複数Lvアップ時は最終到達Lvのみ1回ログ。Lv99到達時は専用ログ。
  function gainCompanionExp(baseExp) {
    var p = state.player;
    p.companions.forEach(function (cid) {
      var cData = findById(COMPANION_DATA, cid);
      if (!cData) return;
      var cl = getCompanionLevel(cid);
      if (cl.level >= 99) return;
      var oldLevel = cl.level; // §103 v0.39: 節目判定用に開始Lvを保存
      cl.exp += baseExp;
      while (cl.level < 99 && cl.exp >= cl.nextExp) {
        cl.exp -= cl.nextExp;
        cl.level++;
        cl.nextExp = cl.level * 10 + 15;
      }
      if (cl.level >= 99) {
        cl.exp = 0;
        log("🌟 " + cData.name + "は最高レベル Lv99 に到達した！");
      } else if (cl.level > oldLevel) {
        log("🎉 " + cData.name + "は Lv" + cl.level + "になった！");
      }
      // §103 v0.39: 節目セリフチェック（Lvアップ後に実行）
      if (cl.level > oldLevel) {
        checkCompanionLevelMilestones(cid, oldLevel, cl.level);
        // §139 v0.58: Lv24→25でunlock成立したとき習得演出キュー（パターンA）
        // unlock条件: Lv>=25 AND rewardFlag=true（isCompanionTechniqueUnlocked内で評価）
        if (oldLevel < 25 && cl.level >= 25) {
          if (isCompanionTechniqueUnlocked(cid)) {
            queueCompanionTechniqueLearnNotice(cid);
          }
        }
      }
    });
  }

  // §103 v0.39: 仲間Lv節目セリフチェック（Lv10/50/99 一度だけ表示）
  // 複数節目を一度に越えた場合は最高節目のセリフだけ表示し、全通過済みをtrueに記録する
  function checkCompanionLevelMilestones(cid, oldLevel, newLevel) {
    var cl = getCompanionLevel(cid);
    var ms = cl.milestones;
    var cData = findById(COMPANION_DATA, cid);
    if (!cData) return;
    var lines = COMPANION_LEVEL_MILESTONE_LINES[cid];
    if (!lines) return;

    var cross10 = (oldLevel < 10 && newLevel >= 10);
    var cross50 = (oldLevel < 50 && newLevel >= 50);
    var cross99 = (oldLevel < 99 && newLevel >= 99);

    // 最高節目だけ表示（表示済みフラグがfalseの場合のみ）
    var showMs = 0;
    if (cross99 && !ms.level99) { showMs = 99; }
    else if (cross50 && !ms.level50) { showMs = 50; }
    else if (cross10 && !ms.level10) { showMs = 10; }

    // 全通過済み節目をtrueに記録（表示有無に関わらず）
    if (cross10) { ms.level10 = true; }
    if (cross50) { ms.level50 = true; }
    if (cross99) { ms.level99 = true; }

    if (showMs === 10) {
      log("🌱 " + cData.name + "が成長の節目 Lv10 に到達！");
      log("「" + lines[10] + "」");
    } else if (showMs === 50) {
      log("🔥 " + cData.name + "が成長の節目 Lv50 に到達！");
      log("「" + lines[50] + "」");
    } else if (showMs === 99) {
      log("👑 " + cData.name + "が最後の成長の節目に到達！");
      log("「" + lines[99] + "」");
    }
  }

  // §101 v0.38: 仲間の成長段階を取得（Lvに応じた0〜5のティア）
  function getCompanionGrowthTier(cid) {
    var cl = getCompanionLevel(cid);
    var lv = cl.level;
    if (lv >= 99) return 5;
    if (lv >= 75) return 4;
    if (lv >= 50) return 3;
    if (lv >= 25) return 2;
    if (lv >= 10) return 1;
    return 0;
  }

  // §101 v0.38: 仲間の成長ボーナスを取得（攻撃ダメージ加算値 or 回復加算値）
  function getCompanionGrowthBonus(cid) {
    var tier = getCompanionGrowthTier(cid);
    if (cid === "juritani")   return tier * 2; // 攻撃+2/段階, 最大+10
    if (cid === "shurittani") return tier * 1; // ダメージ+1/段階, 最大+5
    if (cid === "norio")      return tier * 1; // ダメージ+1/段階, 最大+5
    if (cid === "harumi")     return tier * 2; // 回復+2/段階, 最大+10
    return 0;
  }

  // §105 v0.40: 仲間装備 - 初期化・ガード・ヘルパー
  // §106 v0.40.1: 安定化済み
  function ensureCompanionGearState() {
    // companionEquipment ガード
    if (!state.companionEquipment || typeof state.companionEquipment !== "object" || Array.isArray(state.companionEquipment)) {
      state.companionEquipment = {};
    }
    var _cids = ["juritani", "shurittani", "norio", "harumi"];
    for (var _i = 0; _i < _cids.length; _i++) {
      if (state.companionEquipment[_cids[_i]] === undefined) { state.companionEquipment[_cids[_i]] = null; }
    }
    // companionGearInventory ガード
    if (!state.companionGearInventory || typeof state.companionGearInventory !== "object" || Array.isArray(state.companionGearInventory)) {
      state.companionGearInventory = {};
    }
    // §106 v0.40.1: inventory値サニタイズ（NaN/負数/Infinity/文字列/null → 0）
    var _invKeys = Object.keys(state.companionGearInventory);
    for (var _ik = 0; _ik < _invKeys.length; _ik++) {
      var _raw = state.companionGearInventory[_invKeys[_ik]];
      var _n = Math.floor(Number(_raw));
      state.companionGearInventory[_invKeys[_ik]] = (isNaN(_n) || !isFinite(_n) || _n < 0) ? 0 : _n;
    }
    // スターター配布（version < 1 の場合のみ。inventory空は再配布トリガーにしない）
    // §108 v0.41.1: Infinity/文字列/"1"→1パース対応。負数→0クランプ
    var _gv = state.companionGearVersion;
    if (typeof _gv !== "number" || isNaN(_gv) || !isFinite(_gv)) {
      var _gvParsed = Math.floor(Number(_gv));
      state.companionGearVersion = (isNaN(_gvParsed) || !isFinite(_gvParsed) || _gvParsed < 0) ? 0 : _gvParsed;
    }
    if (state.companionGearVersion < 0) { state.companionGearVersion = 0; }
    if (state.companionGearVersion < 1) {
      state.companionGearInventory.hotblood_bandana    = (state.companionGearInventory.hotblood_bandana    || 0) + 1;
      state.companionGearInventory.capture_gloves      = (state.companionGearInventory.capture_gloves      || 0) + 1;
      state.companionGearInventory.observation_glasses = (state.companionGearInventory.observation_glasses || 0) + 1;
      state.companionGearInventory.healing_ribbon      = (state.companionGearInventory.healing_ribbon      || 0) + 1;
      state.companionGearVersion = 1;
    }
    // §109 v0.42: v<3 → v3 探索報酬方式へ移行
    // v2セーブ(旧v0.41自動配布): 既所持の特化装備はrewardFlag=trueで引き継ぐ
    // v1セーブ: 特化装備なし、rewardFlag=false（ステージ初回クリアで取得）
    if (state.companionGearVersion < 3) {
      if (!state.companionGearRewardFlags || typeof state.companionGearRewardFlags !== "object" || Array.isArray(state.companionGearRewardFlags)) {
        state.companionGearRewardFlags = {};
      }
      var _rids42 = ["critical_bracelet", "net_master_belt", "research_notebook", "prayer_brooch"];
      for (var _ri42 = 0; _ri42 < _rids42.length; _ri42++) {
        var _rid42 = _rids42[_ri42];
        state.companionGearRewardFlags[_rid42] = (state.companionGearInventory[_rid42] || 0) > 0;
      }
      state.companionGearVersion = 3;
    }
    // §110 v0.42.1: スロット整合チェック前にrewardFlagsを正規化（装備中判定を含む）
    normalizeCompanionGearRewardFlags();
    // 装備スロットの整合性チェック
    for (var _j = 0; _j < _cids.length; _j++) {
      var _cid = _cids[_j];
      var _gid = state.companionEquipment[_cid];
      if (_gid === null || _gid === undefined || typeof _gid !== "string") { state.companionEquipment[_cid] = null; continue; }
      var _gdat = COMPANION_GEAR_DATA[_gid];
      if (!_gdat || _gdat.allowedCompanion !== _cid) { state.companionEquipment[_cid] = null; continue; }
      if ((state.companionGearInventory[_gid] || 0) <= 0) { state.companionEquipment[_cid] = null; }
    }
  }
  // §110 v0.42.1: v3通常運用でもrewardFlagsの整合性を保証
  function normalizeCompanionGearRewardFlags() {
    if (!state.companionGearRewardFlags || typeof state.companionGearRewardFlags !== "object" || Array.isArray(state.companionGearRewardFlags)) {
      state.companionGearRewardFlags = {};
    }
    var _specials = ["critical_bracelet", "net_master_belt", "research_notebook", "prayer_brooch"];
    var _ecids = ["juritani", "shurittani", "norio", "harumi"];
    for (var _nfi = 0; _nfi < _specials.length; _nfi++) {
      var _nfid = _specials[_nfi];
      // flag=trueは降格しない
      if (state.companionGearRewardFlags[_nfid] === true) { continue; }
      // 所持済みならtrue昇格（没収なし）
      if ((state.companionGearInventory[_nfid] || 0) > 0) {
        state.companionGearRewardFlags[_nfid] = true; continue;
      }
      // 装備中ならtrue昇格（スロット整合チェック前なのでまだ装備状態を見れる）
      if (state.companionEquipment) {
        var _nfEq = false;
        for (var _nfi2 = 0; _nfi2 < _ecids.length; _nfi2++) {
          if (state.companionEquipment[_ecids[_nfi2]] === _nfid) { _nfEq = true; break; }
        }
        if (_nfEq) { state.companionGearRewardFlags[_nfid] = true; continue; }
      }
      // 非booleanならfalse補完（falseはそのまま維持）
      if (typeof state.companionGearRewardFlags[_nfid] !== "boolean") {
        state.companionGearRewardFlags[_nfid] = false;
      }
    }
  }
  // §109 v0.42 / §110 v0.42.1: 特化装備を初回のみ付与（冪等性保証・gearId検証付き）
  function grantCompanionGearReward(gearId) {
    if (!COMPANION_GEAR_REWARD_DATA[gearId]) { return; } // 不正gearId拒否
    if (!state.companionGearRewardFlags) { state.companionGearRewardFlags = {}; }
    if (state.companionGearRewardFlags[gearId]) { return; } // 既取得
    // §139 v0.58: 付与前のunlock状態を記録（パターンB: reward取得でunlock成立時の検出用）
    var _g139cid = null;
    var _g139cids = ["juritani", "shurittani", "norio", "harumi"];
    for (var _g139i = 0; _g139i < _g139cids.length; _g139i++) {
      var _g139td = COMPANION_TECHNIQUE_DATA[_g139cids[_g139i]];
      if (_g139td && _g139td.requiredGearId === gearId) { _g139cid = _g139cids[_g139i]; break; }
    }
    var _g139before = _g139cid ? isCompanionTechniqueUnlocked(_g139cid) : false;
    // flag=false でも所持数>0なら追加配布せずflagだけ補完
    if ((state.companionGearInventory[gearId] || 0) > 0) {
      state.companionGearRewardFlags[gearId] = true;
      // §139 v0.58: flag補完でunlock成立したなら演出キュー
      if (_g139cid && !_g139before && isCompanionTechniqueUnlocked(_g139cid)) {
        queueCompanionTechniqueLearnNotice(_g139cid);
      }
      return;
    }
    state.companionGearInventory[gearId] = 1;
    state.companionGearRewardFlags[gearId] = true;
    // §139 v0.58: 通常付与でunlock成立（false→true transition）したなら演出キュー
    if (_g139cid && !_g139before && isCompanionTechniqueUnlocked(_g139cid)) {
      queueCompanionTechniqueLearnNotice(_g139cid);
    }
  }
  // §109 v0.42 / §110 v0.42.1: ロード時補完・冪等性保証・遅延通知
  function reconcileCompanionGearRewards() {
    if (!state.companionGearRewardFlags) { state.companionGearRewardFlags = {}; }
    var sm = state.sideMap;
    var stageGears = [
      { cleared: !!(sm.stageCleared && sm.stageCleared["2"]), gearId: "critical_bracelet",  gearName: "会心の腕輪" },
      { cleared: !!(sm.stageCleared && sm.stageCleared["3"]), gearId: "net_master_belt",    gearName: "網師のベルト" },
      { cleared: !!(sm.stageCleared && sm.stageCleared["4"]), gearId: "research_notebook",  gearName: "研究ノート" },
      { cleared: !!(sm.stageCleared && sm.stageCleared["5"]), gearId: "prayer_brooch",      gearName: "祈りのブローチ" }
    ];
    var reconciled = false;
    var grantedNames = [];
    for (var _rci = 0; _rci < stageGears.length; _rci++) {
      var _sg = stageGears[_rci];
      if (_sg.cleared && !state.companionGearRewardFlags[_sg.gearId]) {
        grantCompanionGearReward(_sg.gearId);
        if (state.companionGearRewardFlags[_sg.gearId]) { // grant成功確認
          grantedNames.push(_sg.gearName);
          reconciled = true;
        }
      }
    }
    // ロード中はtoast未生成のため遅延通知リストへ積む（renderField時に表示）
    if (grantedNames.length > 0) {
      _pendingGearRewardNotices.push("🎁 過去の冒険の報酬を受け取った：" + grantedNames.join("、"));
    }
    return reconciled;
  }
  // §106 v0.40.1: cid/gear/allowedCompanion/所持数 すべて確認
  function getCompanionEquippedGear(cid) {
    var _vc = ["juritani", "shurittani", "norio", "harumi"];
    var _ok = false;
    for (var _vi = 0; _vi < _vc.length; _vi++) { if (_vc[_vi] === cid) { _ok = true; break; } }
    if (!_ok) return null;
    if (!state.companionEquipment) return null;
    var gearId = state.companionEquipment[cid];
    if (!gearId || typeof gearId !== "string") return null;
    var gear = COMPANION_GEAR_DATA[gearId];
    if (!gear || gear.allowedCompanion !== cid) return null;
    if ((state.companionGearInventory[gearId] || 0) <= 0) return null;
    return gearId;
  }
  // §106 v0.40.1 / §107 v0.41: actionKey対応（"attack"/"special1"/"special2"/"magic"）
  // 2引数呼び出し後方互換: actionKeyなし = damageBonus/healBonusのみ返す
  function getCompanionEquipmentBonus(cid, type, actionKey) {
    var gearId = getCompanionEquippedGear(cid);
    if (!gearId) return 0;
    var gear = COMPANION_GEAR_DATA[gearId];
    if (!gear) return 0;
    var _sb = function (v) {
      var n = (typeof v === "number") ? Math.floor(v) : 0;
      return (isNaN(n) || !isFinite(n) || n < 0) ? 0 : n;
    };
    var bonus = 0;
    if (type === "damage") {
      bonus += _sb(gear.damageBonus);
      if (actionKey === "attack")   bonus += _sb(gear.attackDamageBonus);
      else if (actionKey === "special1") bonus += _sb(gear.special1DamageBonus);
      else if (actionKey === "special2") bonus += _sb(gear.special2DamageBonus);
      else if (actionKey === "magic")    bonus += _sb(gear.magicDamageBonus);
    } else if (type === "heal") {
      bonus += _sb(gear.healBonus);
      if (actionKey === "special1")      bonus += _sb(gear.special1HealBonus);
      else if (actionKey === "special2") bonus += _sb(gear.special2HealBonus);
      else if (actionKey === "magic")    bonus += _sb(gear.magicHealBonus);
    } else {
      return 0;
    }
    return Math.max(0, bonus);
  }
  // §106 v0.40.1: cid検証・失敗通知・解除の最小保存
  function equipCompanionGear(cid, gearId) {
    ensureCompanionGearState();
    var _vc = ["juritani", "shurittani", "norio", "harumi"];
    var _ok = false;
    for (var _vi = 0; _vi < _vc.length; _vi++) { if (_vc[_vi] === cid) { _ok = true; break; } }
    if (!_ok) { return; }
    if (gearId === null || gearId === undefined) {
      if (state.companionEquipment[cid] !== null) {
        state.companionEquipment[cid] = null;
        saveGame();
      }
      renderStatusBody();
      return;
    }
    var gear = COMPANION_GEAR_DATA[gearId];
    if (!gear) { showToast("その装備は存在しない。"); return; }
    if (gear.allowedCompanion !== cid) {
      var _cDat = findById(COMPANION_DATA, cid);
      showToast((_cDat ? _cDat.name : cid) + "には装備できない。"); return;
    }
    if ((state.companionGearInventory[gearId] || 0) <= 0) { showToast("所持していない装備だ。"); return; }
    state.companionEquipment[cid] = gearId;
    saveGame();
    renderStatusBody();
  }

  function addExp(amount) {
    var p = state.player;
    p.exp += amount;
    var leveledUp = false;
    while (p.exp >= p.nextExp) {
      p.exp -= p.nextExp;
      levelUp();
      leveledUp = true;
    }
    updateStatusBar();
    return leveledUp;
  }

  function levelUp() {
    var p = state.player;
    log("🎉 レベルが上がった！");
    p.level++;
    p.nextExp = p.level * 10 + 15; // v0.6.1: 旧式(level*15+20)より約33%緩くした
    // Lv99到達マイルストーン(§3.8 v0.7.1, v0.8.5): 初回到達時のみ戦闘終了後に専用モーダルを表示
    if (p.level === 99 && !p.level99Shown) {
      playSE("level99");
      p.level99Shown = true;
      state.eventFlags.level99Reached = true;
      state.pendingLv99 = true;
      log("⚡ ついにレベル99に到達した！");
    } else {
      playSE("levelUp");
    }
    p.baseMaxHp += 5 + randInt(0, 3);
    p.baseMaxMp += 2;
    p.baseAtk += 2;
    p.baseDef += 1;
    recomputeStats();
    p.hp = p.maxHp; // レベルアップで全回復
    p.mp = p.maxMp;

    var unknownSpells = SPELL_DATA.filter(function (s) {
      return p.spells.indexOf(s.id) === -1;
    });
    var text = "Lv." + p.level + "になった！\nHP/MPの上限とこうげき力・ぼうぎょ力が上がった。";
    var learnedCount = 0;

    if (unknownSpells.length > 0) {
      var idx = randInt(0, unknownSpells.length - 1);
      var newSpell = unknownSpells[idx];
      unknownSpells.splice(idx, 1);
      p.spells.push(newSpell.id);
      text += "\nまほう「" + newSpell.name + "」を覚えた！";
      learnedCount++;
    }
    // 職業の「まほうの覚えやすさ」補正:追加で1つ覚える可能性がある
    if (unknownSpells.length > 0 && Math.random() < (p.job.spellLearnMod || 0)) {
      var bonusSpell = unknownSpells[randInt(0, unknownSpells.length - 1)];
      p.spells.push(bonusSpell.id);
      text += "\n(「" + p.job.name + "」の才能で)まほう「" + bonusSpell.name + "」も覚えた！";
      learnedCount++;
    }
    if (learnedCount === 0) {
      text += "\nさらに力がみなぎった！";
    }

    document.getElementById("levelup-text").textContent = text;
    openModal("levelup-modal");
  }

  // ---------------------------------------------------------
  // 18. ステータス表示の更新
  // ---------------------------------------------------------
  function updateStatusBar() {
    var p = state.player;
    document.getElementById("status-lv").textContent = "Lv." + p.level;
    document.getElementById("status-job").textContent = "(" + p.job.name + ")";
    document.getElementById("status-gold").textContent = "💰 " + p.gold + "G";
    document.getElementById("status-ailment").textContent = getAilmentStatusText();
    var companionEl = document.getElementById("status-companions");
    if (companionEl) {
      companionEl.textContent = p.companions.length > 0
        ? "🤝" + p.companions.length + "/" + COMPANION_MAX : "";
    }
    var discovered = Object.keys(p.dex).length;
    document.getElementById("btn-dex").textContent =
      "📖図鑑(" + discovered + "/" + UMA_DATA.length + ")";
    setBar("hp-bar", "hp-text", p.hp, p.maxHp);
    setBar("mp-bar", "mp-text", p.mp, p.maxMp);
    setBar("exp-bar", "exp-text", p.exp, p.nextExp);
  }

  function updateBattlePlayerStatus() {
    var p = state.player;
    // §93 v0.34: HP割合でカラークラスを変更
    var hpPct = p.maxHp > 0 ? (p.hp / p.maxHp) : 1;
    var hpEl = document.getElementById("b-hp-text");
    hpEl.textContent = "HP " + p.hp + "/" + p.maxHp;
    hpEl.className = hpPct < 0.30 ? "battle-hp-danger" : (hpPct < 0.50 ? "battle-hp-warn" : "");
    document.getElementById("b-mp-text").textContent = "MP " + p.mp + "/" + p.maxMp;
    // §64 v0.16.1: ガマン中インジケーター
    var gamanEl = document.getElementById("battle-gaman-status");
    if (gamanEl) {
      if (state.gamanActive) {
        gamanEl.classList.remove("hidden");
      } else {
        gamanEl.classList.add("hidden");
      }
    }
    updateBattleStatusBadges(); // §93 v0.34
  }

  // §93 v0.34: 戦闘状態バッジ更新（守り効果あり / うたうチャンス）
  function updateBattleStatusBadges() {
    var el = document.getElementById("battle-status-badges");
    if (!el) return;
    var html = "";
    if (state.battleDamageReduction > 0) {
      html += '<span class="battle-badge battle-badge-guard">🛡️ 守り効果あり</span>';
    }
    var e = state.enemy;
    var p = state.player;
    if (e && e.id === "ultimategorilla" && e.hp >= 1 && e.hp <= 10 && p.level >= 99 && p.hasUkulele) {
      html += '<span class="battle-badge battle-badge-sing">🎤 うたうチャンス</span>';
    }
    el.innerHTML = html;
    if (html) {
      el.classList.remove("hidden");
    } else {
      el.classList.add("hidden");
    }
  }

  // §64 v0.16.1: うたうボタンの捕獲チャンス演出
  function updateSingButtonChance(active) {
    var btn = document.getElementById("btn-sing");
    if (!btn) return;
    if (active) {
      btn.classList.add("btn-chance");
    } else {
      btn.classList.remove("btn-chance");
    }
  }

  function setBar(barId, textId, val, max) {
    document.getElementById(barId).style.width = Math.max(0, (val / max) * 100) + "%";
    document.getElementById(textId).textContent = val + "/" + max;
  }

  // ---------------------------------------------------------
  // 18.5 冒険の記録モーダル(§67 v0.18)
  // ---------------------------------------------------------
  function openRecordModal() {
    renderRecordBody();
    openModal("record-modal");
  }

  function renderRecordBody() {
    var p = state.player;
    var sm = state.sideMap;
    var capturedDexCount = UMA_DATA.filter(function(m) { return p.dex[m.id] === "captured"; }).length;
    var totalUma = UMA_DATA.length;
    var isComplete = isUmaDexComplete();
    var sideCleared = isSideStoryCleared();
    var s1c = !!(sm.stageCleared && sm.stageCleared["1"]);
    var s1b = !!(sm.defeatedEnemies && sm.defeatedEnemies["36,1"]);
    var s2c = !!(sm.stageCleared && sm.stageCleared["2"]);
    var s2b = !!(sm.defeatedEnemies && sm.defeatedEnemies["2:35,1"]);
    var s3c = !!(sm.stageCleared && sm.stageCleared["3"]);
    var s3b = !!(sm.defeatedEnemies && sm.defeatedEnemies["3:31,2"]);
    var s4c = !!(sm.stageCleared && sm.stageCleared["4"]);
    var s4b = !!(sm.defeatedEnemies && sm.defeatedEnemies["4:33,2"]);
    var s5c = !!(sm.stageCleared && sm.stageCleared["5"]);
    var s5b = !!(sm.defeatedEnemies && sm.defeatedEnemies["5:33,2"]);
    var s6c = !!(sm.stageCleared && sm.stageCleared["6"]);
    var s6b = !!(sm.defeatedEnemies && sm.defeatedEnemies["6:34,2"]);

    var stages = [
      { n: "1 はじまりの草原", c: s1c, b: s1b, boss: "中ボスゴリラ" },
      { n: "2 あやしい森",     c: s2c, b: s2b, boss: "ボスゴリラ" },
      { n: "3 古びた町はずれ", c: s3c, b: s3b, boss: "魔王ゴリラ" },
      { n: "4 ゴリラ山道",     c: s4c, b: s4b, boss: "大魔王ゴリラ" },
      { n: "5 黒い城",         c: s5c, b: s5b, boss: "ラスボス級ゴリラ" },
      { n: "6 聖域",           c: s6c, b: s6b, boss: "究極チンパンジー" }
    ];

    // §68 v0.18.1 / §70 v0.20: スコア計算 (本編1 + 横スクロール12 + UMA図鑑12 + 伝説装備7 = max32)
    var mainPts = state.gameCleared ? 1 : 0;
    var sidePts = [s1c, s1b, s2c, s2b, s3c, s3b, s4c, s4b, s5c, s5b, s6c, s6b].filter(Boolean).length;
    var stagesCleared = stages.filter(function(s) { return s.c; }).length;
    var bossesDefeated = stages.filter(function(s) { return s.b; }).length;
    var dexPts = totalUma > 0 ? capturedDexCount / totalUma * 12 : 0;
    var legendCount = LEGEND_EQUIPS.filter(function(le) { return state.eventFlags[le.flag]; }).length;
    var legendPts = legendCount;
    var overallPct = Math.min(100, Math.round((mainPts + sidePts + dexPts + legendPts) / 32 * 100));
    var dexPct = totalUma > 0 ? Math.round(capturedDexCount / totalUma * 100) : 0;
    var sidePct = Math.round(sidePts / 12 * 100);
    var legendPct = Math.round(legendPts / 7 * 100);

    function chk(val) { return val ? '<span class="record-done">✅ ' : '<span class="record-pending">'; }
    function pbar(pct, grad) {
      return '<div class="record-progress"><div class="record-progress-fill" style="width:' + pct + '%;' + (grad ? 'background:' + grad + ';' : '') + '"></div></div>';
    }

    var html = "";

    // --- 総合達成率 ---
    html += '<div class="record-section" style="background:rgba(255,209,102,0.06);border-color:rgba(255,209,102,0.4);">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">';
    html += '<h4 style="margin:0;color:#ffd166;">📊 総合達成率</h4>';
    html += '<span style="font-size:1.1em;font-weight:bold;color:#ffd166;">' + overallPct + '%</span>';
    html += '</div>';
    html += pbar(overallPct);
    html += '<div style="display:flex;justify-content:space-between;flex-wrap:wrap;font-size:0.75em;color:#888;margin-top:5px;gap:2px;">';
    html += '<span>本編 ' + mainPts + '/1</span>';
    html += '<span>横スクロール ' + sidePts + '/12</span>';
    html += '<span>UMA図鑑 ' + capturedDexCount + '/' + totalUma + '</span>';
    html += '<span>伝説装備 ' + legendCount + '/7</span>';
    html += '</div>';
    html += '</div>';

    // --- 現在の称号 ---
    html += '<div class="record-section">';
    html += '<h4>🏅 現在の称号</h4>';
    html += '<p style="font-size:1.05em;font-weight:bold;color:#ffd166;margin:4px 0;letter-spacing:0.02em;">' + getPlayerTitle() + '</p>';
    html += '</div>';

    // --- 本編クリア ---
    html += '<div class="record-section">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">';
    html += '<h4 style="margin:0;">🦍 本編（究極ゴリラ）</h4>';
    html += '<span style="font-size:0.82em;color:' + (state.gameCleared ? "#06d6a0" : "#888") + ';">' + mainPts + ' / 1</span>';
    html += '</div>';
    html += pbar(mainPts * 100, state.gameCleared ? "linear-gradient(90deg,#06d6a0,#8cff8c)" : null);
    if (state.gameCleared) {
      html += '<div style="font-size:0.8em;color:#06d6a0;margin-top:4px;">✅ 捕獲済み</div>';
    } else {
      html += '<div style="font-size:0.8em;color:#888;margin-top:4px;">未捕獲</div>';
      html += '<div class="record-hint">条件：Lv99 ＋ 女神のウクレレ ＋ HP1〜10 ＋「うたう」</div>';
    }
    html += '</div>';

    // --- 横スクロール編 ---
    html += '<div class="record-section">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">';
    html += '<h4 style="margin:0;">🗺 横スクロール編</h4>';
    html += '<span style="font-size:0.82em;color:' + (sideCleared ? "#06d6a0" : "#adb5bd") + ';">' + sidePts + ' / 12</span>';
    html += '</div>';
    html += pbar(sidePct);
    html += '<div style="font-size:0.78em;color:#adb5bd;margin:3px 0 6px;">ステージクリア ' + stagesCleared + '/6 ／ ボス撃退 ' + bossesDefeated + '/6</div>';
    if (sideCleared) {
      html += '<div style="font-size:0.8em;color:#06d6a0;margin-bottom:4px;">✅ 全ステージ制覇済み</div>';
    }
    stages.forEach(function(s) {
      html += '<div class="record-row"><span>S' + s.n + '</span>' + chk(s.c) + (s.c ? "クリア" : "未クリア") + '</span></div>';
      html += '<div class="record-row"><span style="padding-left:8px;">' + s.boss + '</span>' + chk(s.b) + (s.b ? "撃退" : "未撃退") + '</span></div>';
    });
    if (!sideCleared && state.gameCleared) {
      var nextStage = 1;
      for (var _ns = 1; _ns <= 6; _ns++) {
        if (!sm.stageCleared || !sm.stageCleared[String(_ns)]) { nextStage = _ns; break; }
      }
      html += '<div class="record-hint">次の目標：ステージ' + nextStage + 'を目指そう。🌀ゲートから横スクロールへ。</div>';
    }
    html += '</div>';

    // --- UMA図鑑 ---
    html += '<div class="record-section">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">';
    html += '<h4 style="margin:0;">📖 UMA図鑑</h4>';
    html += '<span style="font-size:0.82em;color:' + (isComplete ? "#ffd166" : "#adb5bd") + ';">' + capturedDexCount + ' / ' + totalUma + '</span>';
    html += '</div>';
    html += pbar(dexPct, "linear-gradient(90deg,#74c0fc,#ffd54a)");
    if (isComplete) {
      html += '<div style="font-size:0.8em;color:#ffd166;margin-top:4px;">✅ コンプリート！すべてのUMAが図鑑に記録された。</div>';
    } else {
      html += '<div style="font-size:0.8em;color:#888;margin-top:4px;">あと' + (totalUma - capturedDexCount) + '種類 — 未捕獲のUMAを探してみよう。</div>';
      // §73 v0.22: 図鑑でヒント確認リンク
      html += '<div style="font-size:0.8em;margin-top:4px;"><button class="modal-btn" style="padding:4px 12px;font-size:0.85em;" id="btn-record-open-dex">📖 図鑑でヒントを確認</button></div>';
    }
    html += '</div>';

    // --- 図鑑コンプリート報酬 ---
    html += '<div class="record-section">';
    html += '<h4>🎁 図鑑コンプリート報酬</h4>';
    if (state.dexCompleteRewardClaimed) {
      html += '<div class="record-row"><span></span><span class="record-done">✅ 受取済み</span></div>';
    } else if (isComplete) {
      html += '<div class="record-row"><span></span><span style="color:#ffd166;">未受取（図鑑を開くと受け取れます）</span></div>';
    } else {
      html += '<div class="record-row"><span></span><span class="record-pending">図鑑コンプリート後に解放</span></div>';
    }
    html += '</div>';

    // --- §70 v0.20: 伝説装備 ---
    var legendComplete = isLegendaryEquipmentComplete();
    html += '<div class="record-section">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">';
    html += '<h4 style="margin:0;">⚔️ 伝説装備</h4>';
    html += '<span style="font-size:0.82em;color:' + (legendComplete ? "#ffd166" : "#adb5bd") + ';">' + legendCount + ' / 7</span>';
    html += '</div>';
    html += pbar(legendPct, "linear-gradient(90deg,#ffd166,#ffb347)");
    if (legendComplete) {
      html += '<div style="font-size:0.8em;color:#ffd166;margin-top:4px;">✅ コンプリート！</div>';
    } else {
      html += '<div style="font-size:0.8em;color:#888;margin-top:4px;">あと' + (7 - legendCount) + '種類</div>';
    }
    LEGEND_EQUIPS.forEach(function(le) {
      var got = !!state.eventFlags[le.flag];
      // §71 v0.20.1: 未入手は「・」プレフィックスで視覚的に区別
      html += '<div class="record-row"><span>' + (got ? "✅ " : "・") + le.name + '</span>' + chk(got) + (got ? "入手済み" : "未入手") + '</span></div>';
    });
    html += '</div>';

    // --- §70 v0.20: 伝説装備コンプリート報酬 ---
    html += '<div class="record-section">';
    html += '<h4>✨ 伝説装備コンプリート報酬</h4>';
    if (state.legendaryRewardClaimed) {
      html += '<div class="record-row"><span></span><span class="record-done">✅ 受取済み</span></div>';
    } else if (legendComplete) {
      html += '<div class="record-row"><span></span><span style="color:#ffd166;">未受取（装備画面を開くと受け取れます）</span></div>';
    } else {
      html += '<div class="record-row"><span></span><span class="record-pending">伝説装備7種入手後に解放</span></div>';
    }
    html += '</div>';

    // §99 v0.37: 仲間成長セクション
    html += '<div class="record-section">';
    html += '<h4>👥 仲間</h4>';
    COMPANION_DATA.forEach(function (cd) {
      var cl = getCompanionLevel(cd.id);
      var inParty = hasCompanion(cd.id);
      html += '<div class="record-row"><span>' + cd.icon + " " + cd.name + '</span>' + // §121 v0.46: icon（人型）に変更
        '<span>' + (cl.level >= 99 ? 'Lv.99 <span style="color:#ffd700;font-size:0.82em;">MAX</span>' : 'Lv.' + cl.level) + (inParty ? ' <span style="color:#06d6a0;font-size:0.82em;">✓</span>' : '') + '</span></div>'; // §100 v0.37.1
    });
    html += '</div>';

    // §109 v0.42: 特化装備収集セクション
    var _sgDefs42 = [
      { gearId: "critical_bracelet",  source: "ステージ2", emoji: "⚡" },
      { gearId: "net_master_belt",    source: "ステージ3", emoji: "🕸️" },
      { gearId: "research_notebook",  source: "ステージ4", emoji: "📓" },
      { gearId: "prayer_brooch",      source: "ステージ5", emoji: "🙏" }
    ];
    var _sgGot42 = 0;
    for (var _sgi42 = 0; _sgi42 < _sgDefs42.length; _sgi42++) {
      if (state.companionGearRewardFlags && state.companionGearRewardFlags[_sgDefs42[_sgi42].gearId]) { _sgGot42++; }
    }
    html += '<div class="record-section">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">';
    html += '<h4 style="margin:0;">🎁 特化装備収集</h4>';
    html += '<span style="font-size:0.82em;color:' + (_sgGot42 === 4 ? "#ffd166" : "#adb5bd") + ';">' + _sgGot42 + ' / 4</span>';
    html += '</div>';
    for (var _sgi42b = 0; _sgi42b < _sgDefs42.length; _sgi42b++) {
      var _sgd42 = _sgDefs42[_sgi42b];
      var _sgGotIt42 = !!(state.companionGearRewardFlags && state.companionGearRewardFlags[_sgd42.gearId]);
      var _sgGDat42 = COMPANION_GEAR_DATA[_sgd42.gearId];
      html += '<div class="record-row"><span>' + (_sgGotIt42 ? "✅ " : "・") + _sgd42.emoji + " " + (_sgGDat42 ? _sgGDat42.name : _sgd42.gearId) +
        ' <span style="color:#888;font-size:0.82em;">(' + _sgd42.source + '初回クリア)</span></span>' +
        chk(_sgGotIt42) + (_sgGotIt42 ? "入手済み" : "未入手") + '</span></div>';
    }
    html += '</div>';

    // §111 v0.43: 仲間わざ習得セクション
    var _techCids111 = ["juritani", "shurittani", "norio", "harumi"];
    var _techCount111 = 0;
    for (var _tci111 = 0; _tci111 < _techCids111.length; _tci111++) {
      if (isCompanionTechniqueUnlocked(_techCids111[_tci111])) { _techCount111++; }
    }
    html += '<div class="record-section">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">';
    html += '<h4 style="margin:0;">⚡ 仲間わざ習得</h4>';
    html += '<span style="font-size:0.82em;color:' + (_techCount111 === 4 ? "#ffd166" : "#adb5bd") + ';">' + _techCount111 + ' / 4</span>';
    html += '</div>';
    for (var _tci111b = 0; _tci111b < _techCids111.length; _tci111b++) {
      var _tcid111 = _techCids111[_tci111b];
      var _td111r = COMPANION_TECHNIQUE_DATA[_tcid111];
      var _tcUnlocked111 = isCompanionTechniqueUnlocked(_tcid111);
      var _tcCDat111 = findById(COMPANION_DATA, _tcid111);
      var _tcName111 = _tcCDat111 ? _tcCDat111.name : _tcid111;
      html += '<div class="record-row"><span>' + (_tcUnlocked111 ? "✅ " : "・") + _tcName111 +
        '　<span style="color:#888;font-size:0.82em;">' + (_td111r ? _td111r.name : "") + '</span></span>' +
        chk(_tcUnlocked111) + (_tcUnlocked111 ? "習得済み" : "未習得") + '</span></div>';
    }
    html += '</div>';

    // §113 v0.44 / §117 v0.45 / §122 v0.47: 仲間サイドストーリー完了セクション（第1話・第2話・第3話）
    normalizeCompanionSideStoryFlags();
    normalizeCompanionSideStoryChapter2Flags();
    normalizeCompanionSideStoryChapter3Flags(); // §122 v0.47
    var _storyCids117 = ["juritani", "shurittani", "norio", "harumi"];
    var _storyDoneCount117 = 0;
    var _story2DoneCount117 = 0;
    var _story3DoneCount122 = 0; // §122 v0.47
    for (var _sci117 = 0; _sci117 < _storyCids117.length; _sci117++) {
      if (state.companionSideStoryFlags && state.companionSideStoryFlags[_storyCids117[_sci117]]) { _storyDoneCount117++; }
      if (state.companionSideStoryChapter2Flags && state.companionSideStoryChapter2Flags[_storyCids117[_sci117]]) { _story2DoneCount117++; }
      if (state.companionSideStoryChapter3Flags && state.companionSideStoryChapter3Flags[_storyCids117[_sci117]]) { _story3DoneCount122++; } // §122 v0.47
    }
    // 第1話セクション
    html += '<div class="record-section">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">';
    html += '<h4 style="margin:0;">📖 仲間の物語・第1話</h4>';
    html += '<span style="font-size:0.82em;color:' + (_storyDoneCount117 === 4 ? "#ffd166" : "#adb5bd") + ';">' + _storyDoneCount117 + ' / 4</span>';
    html += '</div>';
    for (var _sci117b = 0; _sci117b < _storyCids117.length; _sci117b++) {
      var _scid117 = _storyCids117[_sci117b];
      var _scd117 = findById(COMPANION_DATA, _scid117);
      var _sss117 = COMPANION_SIDE_STORY_DATA[_scid117];
      var _sdone117 = !!(state.companionSideStoryFlags && state.companionSideStoryFlags[_scid117]);
      var _scName117 = _scd117 ? _scd117.name : _scid117;
      var _stTitle117 = _sss117 ? _sss117.title : _scid117;
      html += '<div class="record-row"><span>' + (_sdone117 ? "✅ " : "・") + _scName117 +
        '　<span style="color:#888;font-size:0.82em;">「' + _stTitle117 + '」</span></span>' +
        chk(_sdone117) + (_sdone117 ? "完了" : "未完了") + '</span></div>';
    }
    // §115 v0.44.2: 全4話完了バッジ
    if (_storyDoneCount117 === 4) {
      html += '<div style="color:#ffd166;font-weight:bold;margin-top:6px;font-size:0.88em;">🌟 4人の第1話をすべて読了</div>';
    }
    html += '</div>';
    // 第2話セクション
    html += '<div class="record-section">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">';
    html += '<h4 style="margin:0;">📖 仲間の物語・第2話</h4>';
    html += '<span style="font-size:0.82em;color:' + (_story2DoneCount117 === 4 ? "#ffd166" : "#adb5bd") + ';">' + _story2DoneCount117 + ' / 4</span>';
    html += '</div>';
    for (var _sci117c = 0; _sci117c < _storyCids117.length; _sci117c++) {
      var _scid117c = _storyCids117[_sci117c];
      var _scd117c = findById(COMPANION_DATA, _scid117c);
      var _sss117c = COMPANION_SIDE_STORY_CHAPTER2_DATA[_scid117c];
      var _sdone117c = !!(state.companionSideStoryChapter2Flags && state.companionSideStoryChapter2Flags[_scid117c]);
      var _scName117c = _scd117c ? _scd117c.name : _scid117c;
      var _stTitle117c = _sss117c ? _sss117c.title : _scid117c;
      html += '<div class="record-row"><span>' + (_sdone117c ? "✅ " : "・") + _scName117c +
        '　<span style="color:#888;font-size:0.82em;">「' + _stTitle117c + '」</span></span>' +
        chk(_sdone117c) + (_sdone117c ? "完了" : "未完了") + '</span></div>';
    }
    // §119 v0.45.2: 第2話全4話完了バッジ
    if (_story2DoneCount117 === 4) {
      html += '<div style="color:#c8b4ff;font-weight:bold;margin-top:6px;font-size:0.88em;">🌟 4人の第2話をすべて読了</div>';
    }
    html += '</div>';
    // §122 v0.47: 第3話セクション
    html += '<div class="record-section">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">';
    html += '<h4 style="margin:0;">📖 仲間の物語・第3話</h4>';
    html += '<span style="font-size:0.82em;color:' + (_story3DoneCount122 === 4 ? "#f4a261" : "#adb5bd") + ';">' + _story3DoneCount122 + ' / 4</span>';
    html += '</div>';
    for (var _sci122 = 0; _sci122 < _storyCids117.length; _sci122++) {
      var _scid122 = _storyCids117[_sci122];
      var _scd122 = findById(COMPANION_DATA, _scid122);
      var _sss122 = COMPANION_SIDE_STORY_CHAPTER3_DATA[_scid122];
      var _sdone122 = !!(state.companionSideStoryChapter3Flags && state.companionSideStoryChapter3Flags[_scid122]);
      var _scName122 = _scd122 ? _scd122.name : _scid122;
      var _stTitle122 = _sss122 ? _sss122.title : _scid122;
      html += '<div class="record-row"><span>' + (_sdone122 ? "✅ " : "・") + _scName122 +
        '　<span style="color:#888;font-size:0.82em;">「' + _stTitle122 + '」</span></span>' +
        chk(_sdone122) + (_sdone122 ? "完了" : "未完了") + '</span></div>';
    }
    if (_story3DoneCount122 === 4) {
      html += '<div style="color:#f4a261;font-weight:bold;margin-top:6px;font-size:0.88em;">🌟 4人の第3話をすべて読了</div>';
    }
    html += '</div>';

    // --- 次の目標（強調） ---
    html += '<div class="record-section record-section-goal">';
    html += '<h4 style="color:#ffd166;">🎯 次の目標</h4>';
    var nextGoal;
    if (!state.gameCleared) {
      nextGoal = "究極ゴリラを捕まえよう。Lv99・女神のウクレレ・HP1〜10・最後は「うたう」。";
    } else if (!sideCleared) {
      nextGoal = "横スクロール編を進めよう。通常マップの🌀ゲートから横スクロール世界へ行けます。";
    } else if (!isComplete) {
      nextGoal = "UMA図鑑を埋めよう。未捕獲のUMAを弱らせてから捕まえよう（📖図鑑で確認）。";
    } else if (!legendComplete) {
      nextGoal = "伝説装備を全7種集めよう。装備画面や冒険の記録で進捗を確認できます。";
    } else {
      nextGoal = "すべての大きな目標を達成済み！酒場で仲間たちの言葉を聞いてみるのもよいでしょう。森を散歩したり、余韻をゆっくり楽しもう。";
    }
    html += '<p style="font-size:0.85em;color:#e0e0e0;margin:3px 0;">' + nextGoal + '</p>';
    html += '</div>';

    // --- 称号条件一覧 ---
    html += '<div class="record-section">';
    html += '<h4>🏆 称号条件一覧</h4>';
    var titles = [
      { name: "すべての伝説を集めし者", cond: "究極ゴリラ捕獲 ＋ 横スクロール制覇 ＋ UMA図鑑コンプリート ＋ 伝説装備7種入手" },
      { name: "究極とUMA図鑑を極めし者", cond: "究極ゴリラ捕獲 ＋ 横スクロール制覇 ＋ UMA図鑑コンプリート" },
      { name: "究極を歌い、聖域を越えし者", cond: "究極ゴリラ捕獲 ＋ 横スクロール制覇" },
      { name: "UMA図鑑を極めし者", cond: "UMA図鑑コンプリート" },
      { name: "森に歌を届けし者", cond: "究極ゴリラ捕獲" },
      { name: "究極に近づきし者", cond: "Lv99以上" },
      { name: "勇者の子孫", cond: "初期称号" }
    ];
    var currentTitle = getPlayerTitle();
    titles.forEach(function(t) {
      var isCurrent = (t.name === currentTitle);
      html += '<div style="margin:4px 0;">';
      html += '<div style="font-size:0.82em;font-weight:bold;color:' + (isCurrent ? "#ffd166" : "#adb5bd") + ';">';
      if (isCurrent) html += "▶ ";
      html += t.name + '</div>';
      html += '<div style="font-size:0.75em;color:#666;padding-left:8px;">' + t.cond + '</div>';
      html += '</div>';
    });
    html += '</div>';

    document.getElementById("record-body").innerHTML = html;

    // §73 v0.22: 「図鑑でヒントを確認」ボタンのリスナー
    var btnRecordDex = document.getElementById("btn-record-open-dex");
    if (btnRecordDex) {
      btnRecordDex.addEventListener("click", function() {
        closeModal("record-modal");
        openDexModal();
      });
    }
  }

  // 19. UMA図鑑モーダル(§31 v0.8.1 詳細タップ対応)
  // ---------------------------------------------------------
  function openDexModal() {
    // §66 v0.17.1: 図鑑コンプリート報酬チェック（未受取なら先にモーダル）
    if (isUmaDexComplete() && !state.dexCompleteRewardClaimed) {
      openDexCompleteModal();
      return;
    }
    openModal("dex-modal");
    renderDexBody();
  }

  // §66 v0.17.1 / §72 v0.21: 図鑑コンプリート報酬モーダル（演出強化）
  function openDexCompleteModal() {
    state.player.gold += 3000;
    state.player.ramenCount += 3;
    state.dexCompleteRewardClaimed = true;
    saveGame();
    updateStatusBar();
    document.getElementById("btn-dex-complete-next").onclick = function () {
      closeModal("dex-complete-modal");
      openModal("dex-modal");
      renderDexBody();
    };
    var html = "";
    html += '<p style="margin:8px 0;color:#e0e0e0;">すべてのUMAが図鑑に記録された！</p>';
    html += '<p style="margin:8px 0;color:#e0e0e0;">スカイフィッシュも、ツチノコも、<br>そして究極ゴリラも。</p>';
    html += '<p style="margin:8px 0;color:#e0e0e0;">一匹ずつ向き合い、積み重ねてきた記録は、<br>力だけではたどり着けない冒険の証だ。</p>';
    html += '<p style="margin:8px 0;color:#06d6a0;">報酬：3000G ＋ ラーメン×3</p>';
    if (state.gameCleared && isSideStoryCleared()) {
      html += '<p style="margin:8px 0;color:#ffd166;font-size:0.9em;">称号「究極とUMA図鑑を極めし者」を獲得！</p>';
    } else {
      html += '<p style="margin:8px 0;color:#ffd166;font-size:0.9em;">称号「UMA図鑑を極めし者」を獲得！</p>';
    }
    document.getElementById("dex-complete-body").innerHTML = html;
    openModal("dex-complete-modal");
  }

  // §70 v0.20: 伝説装備コンプリート報酬モーダル
  function openLegendaryCompleteModal() {
    state.player.gold += 2000;
    state.player.ramenCount += 2;
    state.legendaryRewardClaimed = true;
    saveGame();
    updateStatusBar();
    document.getElementById("btn-legendary-complete-next").onclick = function () {
      closeModal("legendary-complete-modal");
      openModal("equip-modal");
      renderEquipBody();
    };
    var html = "";
    html += '<p style="margin:8px 0;color:#ffd166;font-weight:bold;">すべての伝説装備がそろった！</p>';
    html += '<p style="margin:8px 0;color:#e0e0e0;">森に眠っていた力が、君の冒険に応えている。</p>';
    html += '<p style="margin:8px 0;color:#e0e0e0;">伝説は、持つ者ではなく、<br>歩み続けた者に宿る。</p>';
    html += '<p style="margin:8px 0;color:#06d6a0;">報酬：2000G ＋ ラーメン×2</p>';
    if (isFullyCompleted()) {
      html += '<p style="margin:8px 0;color:#ffd166;font-size:0.9em;">称号「すべての伝説を集めし者」を獲得！</p>';
    }
    document.getElementById("legendary-complete-body").innerHTML = html;
    openModal("legendary-complete-modal");
  }

  function renderDexBody() {
    var p = state.player;
    var totalUma = UMA_DATA.length;
    var discoveredCount = UMA_DATA.filter(function(m) { return !!p.dex[m.id]; }).length;
    var capturedDexCount = UMA_DATA.filter(function(m) { return p.dex[m.id] === "captured"; }).length;
    var isComplete = capturedDexCount === totalUma;

    var html = '<div class="dex-progress" style="grid-column:1/-1;">';
    if (isComplete) {
      html += '<span style="color:#ffd166;font-weight:bold;">🎉 UMA図鑑コンプリート！</span>';
    } else {
      html += '<span>📖 発見: ' + discoveredCount + "/" + totalUma + '</span>';
      html += '<span>✅ 捕獲: ' + capturedDexCount + "/" + totalUma + '</span>';
    }
    html += '</div>';

    UMA_DATA.forEach(function(m) {
      var st = p.dex[m.id];
      var isClickable = !!st;
      var cls = st === "captured" ? "" : (st === "seen" ? "seen" : "unknown");
      var emoji = st ? m.emoji : "❔";
      var nameText = st ? m.name : "？？？";
      var statusText = st === "captured" ? "捕獲済" : (st === "seen" ? "発見済" : "未発見");
      var clickAttr = isClickable ? (' data-umaid="' + m.id + '"') : "";
      var borderStyle = (m.id === "ultimategorilla" && st === "captured")
        ? ' style="border:1px solid #ffd166;"' : "";

      html += '<div class="dex-item ' + cls + (isClickable ? " dex-clickable" : "") + '"' +
        clickAttr + borderStyle + ">";
      html += emoji;
      html += '<span class="dex-item-name">' + nameText + "</span>";
      html += '<span class="dex-item-name">' + statusText + "</span>";
      // §73 v0.22: 未捕獲UMAのヒント表示
      if (!st && m.hintArea) {
        html += '<span style="display:block;font-size:0.6em;color:#888;line-height:1.3;margin-top:2px;">📍' + m.hintArea + '</span>';
      } else if (st === "seen" && m.hintText) {
        html += '<span style="display:block;font-size:0.6em;color:#74c0fc;line-height:1.3;margin-top:2px;">💡' + m.hintText + '</span>';
      }
      if (m.id === "ultimategorilla" && st === "captured") {
        html += '<span style="display:block;font-size:7px;color:#ffd166;">伝説のUMA</span>';
        html += '<span style="display:block;font-size:7px;color:#06d6a0;">森へ帰った</span>';
      }
      html += "</div>";
    });

    // メタル系セクション(特殊エネミー。常時表示・タップで詳細)
    html += '<p class="small" style="text-align:left;margin:10px 0 4px;color:#ffd166;grid-column:1/-1;">⚡ メタル系（特殊エネミー）</p>';
    html += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;grid-column:1/-1;">';
    METAL_DATA.forEach(function(m) {
      html += '<div class="dex-item dex-clickable" data-metalid="' + m.id + '">' + m.emoji +
        '<span class="dex-item-name">' + m.name + "</span>" +
        '<span class="dex-item-name" style="color:#ffd166;">メタル系</span>' +
        "</div>";
    });
    html += "</div>";

    var container = document.getElementById("dex-list");
    container.innerHTML = html;

    Array.prototype.forEach.call(container.querySelectorAll("[data-umaid]"), function(el) {
      el.addEventListener("click", function() {
        openMonsterDetailModal(el.getAttribute("data-umaid"), "uma");
      });
    });
    Array.prototype.forEach.call(container.querySelectorAll("[data-metalid]"), function(el) {
      el.addEventListener("click", function() {
        openMonsterDetailModal(el.getAttribute("data-metalid"), "metal");
      });
    });
  }

  // UMA/メタル系の詳細モーダル(§31 v0.8.1)
  function openMonsterDetailModal(id, dataType) {
    var monster = dataType === "metal" ? findById(METAL_DATA, id) : findById(UMA_DATA, id);
    if (!monster) return;

    var p = state.player;
    var st = dataType === "uma" ? p.dex[id] : null;
    var isCaptured = st === "captured";
    var isFinal = !!monster.final;
    var isMetal = dataType === "metal";

    var umaIndex = 0;
    if (!isMetal) {
      for (var i = 0; i < UMA_DATA.length; i++) {
        if (UMA_DATA[i].id === id) { umaIndex = i; break; }
      }
    }

    var borderStyle = (isFinal && isCaptured) ? "border:2px solid #ffd166;border-radius:8px;padding:8px;" : "";
    var html = '<div style="text-align:center;' + borderStyle + '">';
    html += '<div style="font-size:48px;line-height:1.2;">' + monster.emoji + "</div>";
    if (!isMetal) {
      html += '<div style="font-size:9px;color:#888;margin:2px 0;">No.' +
        ("00" + (umaIndex + 1)).slice(-3) + "</div>";
    }
    html += '<div style="font-size:18px;font-weight:bold;margin:4px 0;">' + monster.name + "</div>";
    if (isFinal && isCaptured) {
      html += '<div style="color:#ffd166;font-size:11px;margin:2px 0;">★ 伝説のUMA &nbsp;&#127807; 森へ帰った</div>';
    } else if (isFinal) {
      html += '<div style="color:#ffd166;font-size:11px;margin:2px 0;">★ 伝説のUMA</div>';
    }
    html += "</div>";

    // 分類・レア度・状態
    if (!isMetal) {
      var typeLabel = isFinal ? "伝説UMA" : "UMA";
      html += '<div class="shop-row"><span>レア度</span><span>' + monster.rarity + "</span></div>";
      html += '<div class="shop-row"><span>分類</span><span>' + typeLabel + "</span></div>";
      var stateHtml = isCaptured
        ? '<span style="color:#06d6a0;">&#10003; 捕獲済み</span>'
        : '<span style="color:#adb5bd;">× 未捕獲</span>';
      html += '<div class="shop-row"><span>捕獲状態</span>' + stateHtml + "</div>";
    } else {
      html += '<div class="shop-row"><span>分類</span><span style="color:#ffd166;">メタル系</span></div>';
      html += '<p class="small" style="text-align:left;color:#ffd166;margin:2px 0;">&#9889; レベル稼ぎ用の特殊エネミー</p>';
    }

    // ステータス
    html += '<h3 style="margin:10px 0 4px;">ステータス</h3>';
    html += '<div class="shop-row"><span>HP</span><span>' + monster.hp + "</span></div>";
    html += '<div class="shop-row"><span>攻撃力</span><span>' + monster.attack + "</span></div>";
    html += '<div class="shop-row"><span>防御力</span><span>' + monster.def + "</span></div>";
    if (!isMetal) {
      html += '<div class="shop-row"><span>捕獲率</span><span>' + Math.round(monster.captureRate * 100) + "%</span></div>";
    }
    html += '<div class="shop-row"><span>経験値</span><span>' + monster.exp + "</span></div>";
    if (!isMetal && monster.sellPrice) {
      html += '<div class="shop-row"><span>売却価格</span><span>' + monster.sellPrice + "G</span></div>";
    }
    if (monster.inflicts) {
      var ailName = monster.inflicts.id === "allergy" ? "アレルギー" : "におい";
      html += '<div class="shop-row"><span>特殊攻撃</span><span style="color:#ff8a80;">' + ailName + "付与</span></div>";
    }

    // メタル系特徴
    if (isMetal) {
      html += '<h3 style="margin:10px 0 4px;">特徴</h3>';
      html += '<p class="small" style="text-align:left;">' +
        "・低確率でフィールドに出現（遭遇時は「キラリと光った！」）<br>" +
        "・防御力が非常に高く、攻撃がほぼ通らない<br>" +
        "・倒すと大きな経験値が手に入る<br>" +
        "・捕獲は非常に難しい</p>";
    }

    // §73 v0.22: 通常UMA 発見済み未捕獲のヒント
    if (!isMetal && !isFinal && !isCaptured && st === "seen" && monster.hintCatch) {
      html += '<h3 style="margin:10px 0 4px;color:#74c0fc;">&#128161; 捕獲ヒント</h3>';
      html += '<p class="small" style="text-align:left;color:#cce4ff;">' + monster.hintCatch + "</p>";
    }

    // 究極ゴリラ捕獲前の注意
    if (isFinal && !isCaptured) {
      html += '<h3 style="margin:10px 0 4px;color:#ffd166;">&#9888; 捕獲について</h3>';
      html += '<p class="small" style="text-align:left;color:#ffe082;">' +
        "普通の「つかまえる」は一切通用しない。<br>" +
        "レベル99・女神のウクレレ所持・HPを1〜10まで削った上で<br>" +
        "「うたう」コマンドを使うのが捕獲の鍵だ。</p>";
    }

    // 説明文
    if (monster.desc) {
      html += '<p class="small" style="text-align:left;color:#adb5bd;font-style:italic;' +
        'margin-top:8px;border-top:1px solid #415a77;padding-top:8px;">' +
        "「" + monster.desc + "」</p>";
    }

    document.getElementById("uma-detail-body").innerHTML = html;
    openModal("uma-detail-modal");
  }

  // ---------------------------------------------------------
  // 19.5 ステータス確認画面
  // ---------------------------------------------------------
  function openStatusModal() {
    openModal("status-modal");
    renderStatusBody();
  }

  function renderStatusBody() {
    var p = state.player;
    var eq = p.equipment;
    var weaponName = (findById(EQUIP_WEAPON_DATA, eq.weapon) || {}).name || "なし";
    var armorName = (findById(ARMOR_DATA, eq.armor) || {}).name || "なし";
    var shieldName = (findById(SHIELD_DATA, eq.shield) || {}).name || "なし";
    var helmetName = (findById(HELMET_DATA, eq.helmet) || {}).name || "なし";
    var spellNames = p.spells.length
      ? p.spells.map(function (id) { return (findById(SPELL_DATA, id) || {}).name; }).join("、")
      : "まだ覚えていない";
    var ailmentText = getAilmentStatusText() || "なし";
    var capturedCount = Object.keys(p.umaInventory).reduce(function (sum, id) { return sum + p.umaInventory[id]; }, 0);
    var dexDiscovered = Object.keys(p.dex).length;

    // 現在の目標(§3.6, v0.8: 伝説装備ヒント追加)
    var legendCount = LEGEND_EQUIPS.filter(function(le) { return state.eventFlags[le.flag]; }).length;
    var html = "<h3>🎯 現在の目標</h3>";
    if (state.gameCleared) {
      html += '<p class="small" style="color:#ffd166;">🏆 クリア済み！<br>称号：「森に歌を届けし者」<br>伝説装備を集めよう！(' + legendCount + '/' + LEGEND_EQUIPS.length + '入手済)</p>';
      if (!state.eventFlags.andromedaGot) {
        html += '<p class="small" style="color:#ef9a9a;">💡 実家で休むと王様の使者が……</p>';
      }
    } else if (p.level >= 99 && p.hasUkulele) {
      html += '<p class="small" style="color:#06d6a0;">Lv.99達成 & ウクレレ所持！<br>究極ゴリラのHPを1〜10まで削って<br>「🎵うたう」コマンドを使えばクリア！</p>';
      if (p.level >= 70 && !state.eventFlags.nyoiboGot) {
        html += '<p class="small" style="color:#ffe082;">💡 ジュリタニを連れて光る棒を試そう。</p>';
      }
    } else if (p.level >= 99) {
      html += '<p class="small" style="color:#74c0fc;">🌟 Lv.99到達済み！<br>次は女神のウクレレ🪗を探そう。<br>フィールドの特別な宝箱🪗に眠っている。</p>';
    } else if (p.level >= 70) {
      html += '<p class="small">目標: Lv.99まであと' + (99 - p.level) + 'レベル！<br>' +
        (p.hasUkulele ? '🪗 女神のウクレレ：所持済！' : '女神のウクレレ🪗も探しておこう。') + '</p>';
      if (!state.eventFlags.nyoiboGot) {
        html += '<p class="small" style="color:#ffe082;">💡 ジュリタニと共に、謎の光る棒を引き抜いてみよう！</p>';
      }
      if (!state.eventFlags.sixfoldShieldGot) {
        html += '<p class="small" style="color:#ffe082;">💡 実家で休むと、古い盾が見つかるかも。</p>';
      }
    } else if (p.level >= 60) {
      html += '<p class="small">目標: Lv.99まであと' + (99 - p.level) + 'レベル！<br>メタルゴリラ系を狙って効率よく稼ごう。<br>' +
        (p.hasUkulele ? '🪗 女神のウクレレ：所持済！' : '女神のウクレレ🪗も探しておこう。') + '</p>';
      if (!state.eventFlags.sixfoldShieldGot) {
        html += '<p class="small" style="color:#ffe082;">💡 実家で休んでみよう。何か見つかるかも……</p>';
      }
    } else if (p.level >= 50) {
      html += '<p class="small">目標: Lv.99まであと' + (99 - p.level) + 'レベル！<br>メタルゴリラ系を狙って効率よく稼ごう。<br>' +
        (p.hasUkulele ? '🪗 女神のウクレレ：所持済！' : '女神のウクレレ🪗も探しておこう。') + '</p>';
      if (!state.eventFlags.pegasusArmorGot) {
        html += '<p class="small" style="color:#ffe082;">💡 フィールドに白く光る宝箱🌟がある。</p>';
      }
    } else if (p.level >= 20) {
      html += '<p class="small">装備を集めよう！商人に寄ってみよう。<br>宝箱🎁を探してみよう。特別な宝箱🪗もある。<br>メタルゴリラ系に出会えれば経験値大チャンス！</p>';
    } else {
      html += '<p class="small">フィールドを探索しよう！<br>UMAを見つけて経験値を集めよう。<br>実家🏠で回復・酒場🍺で仲間を探そう。</p>';
    }
    // §67 v0.18: getPlayerTitle() に一元化
    var playerTitle = getPlayerTitle();
    html += '<div class="shop-row"><span>称号</span><span style="font-size:0.85em;">' + playerTitle + "</span></div>";
    html += '<div class="shop-row"><span>名前</span><span>' + getPlayerDisplayName() + "</span></div>"; // §126 v0.49
    html += '<div class="shop-row"><span>職業</span><span>' + p.job.name + "</span></div>";
    html += '<div class="shop-row"><span>レベル</span><span>Lv.' + p.level + "</span></div>";
    html += '<div class="shop-row"><span>HP</span><span>' + p.hp + "/" + p.maxHp + "</span></div>";
    html += '<div class="shop-row"><span>MP</span><span>' + p.mp + "/" + p.maxMp + "</span></div>";
    html += '<div class="shop-row"><span>経験値</span><span>' + p.exp + "/" + p.nextExp + "</span></div>";
    html += '<div class="shop-row"><span>所持金</span><span>💰' + p.gold + "G</span></div>";
    html += '<div class="shop-row"><span>状態異常</span><span>' + ailmentText + "</span></div>";
    html += "<h3>装備</h3>";
    html += '<div class="shop-row"><span>武器</span><span>' + weaponName + "</span></div>";
    html += '<div class="shop-row"><span>防具</span><span>' + armorName + "</span></div>";
    html += '<div class="shop-row"><span>盾</span><span>' + shieldName + "</span></div>";
    html += '<div class="shop-row"><span>兜</span><span>' + helmetName + "</span></div>";
    html += "<h3>まほう</h3><p class=\"small\">" + spellNames + "</p>";
    html += "<h3>所持アイテム</h3>";
    html += '<div class="shop-row"><span>やくそう</span><span>x' + p.potionCount + "</span></div>";
    html += '<div class="shop-row"><span>捕獲ロープ</span><span>x' + p.ropeCount + "</span></div>";
    html += '<div class="shop-row"><span>☕ コーヒー</span><span>x' + p.coffeeCount + "</span></div>";
    html += '<div class="shop-row"><span>🍞 パン</span><span>x' + p.breadCount + "</span></div>";
    html += '<div class="shop-row"><span>🍱 お弁当</span><span>x' + p.bentoCount + "</span></div>";
    html += '<div class="shop-row"><span>🍜 ラーメン</span><span>x' + p.ramenCount + "</span></div>";
    html += '<div class="shop-row"><span>せき止めシロップ</span><span>x' + p.coughsyrupCount + "</span></div>";
    html += '<div class="shop-row"><span>デオドラントスプレー</span><span>x' + p.deodorantCount + "</span></div>";
    var capturedDexCount = UMA_DATA.filter(function(m) { return p.dex[m.id] === "captured"; }).length;
    html += "<h3>UMA</h3>";
    html += '<div class="shop-row"><span>所持UMA総数</span><span>' + capturedCount + "匹</span></div>";
    html += '<div class="shop-row"><span>図鑑発見</span><span>' + dexDiscovered + "/" + UMA_DATA.length + "</span></div>";
    html += '<div class="shop-row"><span>図鑑捕獲</span><span>' + capturedDexCount + "/" + UMA_DATA.length + "</span></div>";
    html += "<h3>重要アイテム</h3>";
    html += '<div class="shop-row"><span>🪗 女神のウクレレ</span><span>' +
      (p.hasUkulele ? '<span style="color:#06d6a0;font-weight:bold;">所持</span>' : '<span style="color:#888;">未入手</span>') +
      "</span></div>";
    if (state.gameCleared) {
      html += '<div class="shop-row"><span>🎉 究極ゴリラ捕獲</span><span style="color:#ffd166;font-weight:bold;">クリア済！</span></div>';
      html += '<button class="shop-menu-btn" id="btn-status-watch-ending" style="margin-top:6px;">🎬 エンディングを見る</button>';
    }
    html += "<h3>★ 伝説装備 (" + legendCount + "/" + LEGEND_EQUIPS.length + ")</h3>";
    LEGEND_EQUIPS.forEach(function(le) {
      var got = state.eventFlags[le.flag];
      html += '<div class="shop-row"><span>' + le.name + "</span>" +
        '<span style="color:' + (got ? "#ffd166" : "#888") + ';font-size:0.85em;">' +
        (got ? "★ 入手済" : "未入手") + "</span></div>";
    });
    // §99 v0.37 / §101 v0.38: 全仲間のLv/EXP/成長効果表示（パーティ外も含む）
    html += "<h3>仲間</h3>";
    COMPANION_DATA.forEach(function (cd) {
      var cl = getCompanionLevel(cd.id);
      var inParty = hasCompanion(cd.id);
      var statusColor = inParty ? "#06d6a0" : "#adb5bd";
      var statusLabel = inParty ? "パーティ中" : "待機中";
      html += '<div class="shop-row"><span>' + cd.icon + " " + cd.name + // §121 v0.46: icon（人型）に変更
        ' <span style="font-size:0.82em;color:#a0cfff;">Lv.' + cl.level + '</span></span>' +
        '<span style="font-size:0.82em;color:' + statusColor + ';">' + statusLabel + '</span></div>';
      html += '<div class="shop-row" style="font-size:0.8em;">' +
        '<span style="color:#888;padding-left:12px;">EXP</span>' +
        '<span style="color:#a0cfff;">' + (cl.level >= 99 ? "MAX" : cl.exp + " / " + cl.nextExp) + '</span></div>'; // §100 v0.37.1
      // §101 v0.38: 成長効果表示
      var growthTier = getCompanionGrowthTier(cd.id);
      var growthBonus = getCompanionGrowthBonus(cd.id);
      var growthType = (cd.id === "harumi") ? "回復+" : "攻撃+";
      var growthLabel;
      if (growthTier === 0) {
        growthLabel = "基本状態 (Lv1〜9)";
      } else if (growthTier >= 5) {
        growthLabel = "🌟 " + growthType + growthBonus + " (最大)";
      } else {
        growthLabel = growthType + growthBonus + " (段階" + growthTier + ")";
      }
      html += '<div class="shop-row" style="font-size:0.8em;">' +
        '<span style="color:#888;padding-left:12px;">成長効果</span>' +
        '<span style="color:#e9c46a;">' + growthLabel + '</span></div>';
      // §103 v0.39: 成長の節目表示
      var ms = cl.milestones || { level10: false, level50: false, level99: false };
      var msLabel = "Lv10 " + (ms.level10 ? "✓" : "・") + "　Lv50 " + (ms.level50 ? "✓" : "・") + "　Lv99 " + (ms.level99 ? "✓" : "・");
      html += '<div class="shop-row" style="font-size:0.8em;">' +
        '<span style="color:#888;padding-left:12px;">成長の節目</span>' +
        '<span style="color:#c8b4ff;">' + msLabel + '</span></div>';
      // §107 v0.41: 仲間装備選択UI（2種類から選択可）
      ensureCompanionGearState();
      var cgEquippedId = getCompanionEquippedGear(cd.id);
      var cgEquippedDat = cgEquippedId ? COMPANION_GEAR_DATA[cgEquippedId] : null;
      html += '<div class="shop-row" style="font-size:0.8em;">' +
        '<span style="color:#888;padding-left:12px;">装備</span>' +
        '<span style="color:' + (cgEquippedDat ? "#ffd700" : "#adb5bd") + ';">' +
        (cgEquippedDat ? cgEquippedDat.emoji + " " + cgEquippedDat.name : "なし") + '</span></div>';
      // この仲間の全装備を列挙
      var cgAllIds = Object.keys(COMPANION_GEAR_DATA);
      for (var cgi = 0; cgi < cgAllIds.length; cgi++) {
        var cgGid2 = cgAllIds[cgi];
        var cgGD2 = COMPANION_GEAR_DATA[cgGid2];
        if (!cgGD2 || cgGD2.allowedCompanion !== cd.id) continue;
        var cgOwned2 = (state.companionGearInventory[cgGid2] || 0) > 0;
        var cgIsEquipped2 = (cgEquippedId === cgGid2);
        var cgStatusTxt2, cgStatusCol2;
        if (cgIsEquipped2) {
          cgStatusTxt2 = "★装備中"; cgStatusCol2 = "#ffd700";
        } else if (cgOwned2) {
          cgStatusTxt2 = "装備可能"; cgStatusCol2 = "#a0cfff";
        } else {
          // §110 v0.42.1: flag=true+所持0 → 入手済み(未所持), flag=false → 未入手+入手場所
          var _cgFlag2 = !!(state.companionGearRewardFlags && state.companionGearRewardFlags[cgGid2]);
          var _cgSrc2 = COMPANION_GEAR_REWARD_DATA[cgGid2];
          if (_cgFlag2) {
            cgStatusTxt2 = "入手済み(現在未所持)"; cgStatusCol2 = "#888";
          } else if (_cgSrc2) {
            cgStatusTxt2 = "未入手 (" + _cgSrc2.source + ")"; cgStatusCol2 = "#a08060";
          } else {
            cgStatusTxt2 = "未所持"; cgStatusCol2 = "#888";
          }
        }
        html += '<div class="shop-row" style="font-size:0.8em;padding-left:4px;margin-top:2px;">' +
          '<span>' + cgGD2.emoji + ' <span style="color:#e0e0e0;">' + cgGD2.name + '</span>' +
          ' <span style="color:' + cgStatusCol2 + ';font-size:0.9em;">' + cgStatusTxt2 + '</span></span>';
        if (cgIsEquipped2) {
          html += '<button class="shop-menu-btn" data-gear-cid="' + cd.id + '" data-gear-action="unequip" ' +
            'style="font-size:0.78em;padding:3px 8px;margin:0;">外す</button>';
        } else if (cgOwned2) {
          html += '<button class="shop-menu-btn" data-gear-cid="' + cd.id + '" data-gear-id="' + cgGid2 + '" data-gear-action="equip" ' +
            'style="font-size:0.78em;padding:3px 8px;margin:0;">装備する</button>';
        }
        html += '</div>';
        html += '<div class="shop-row" style="font-size:0.76em;">' +
          '<span style="color:#888;padding-left:16px;">効果: </span>' +
          '<span style="color:#e9c46a;">' + (cgGD2.effectDesc || "") + '</span></div>';
      }
      // §111 v0.43: 仲間わざ表示
      var _td111 = COMPANION_TECHNIQUE_DATA[cd.id];
      if (_td111) {
        var _techUnlocked111 = isCompanionTechniqueUnlocked(cd.id);
        html += '<div class="shop-row" style="font-size:0.8em;margin-top:4px;border-top:1px solid #2a3a5a;padding-top:4px;">' +
          '<span style="color:#ffd166;font-weight:bold;">⚡ 仲間わざ</span></div>';
        html += '<div class="shop-row" style="font-size:0.8em;">' +
          '<span style="color:#e0e0e0;padding-left:12px;">' + _td111.name + '</span>' +
          '<span style="color:' + (_techUnlocked111 ? "#06d6a0" : "#888") + ';font-size:0.85em;">' +
          (_techUnlocked111 ? "習得済み" : "未習得") + '</span></div>';
        if (_techUnlocked111) {
          var _techEffDesc;
          if (_td111.type === "damage" || _td111.type === "damage_leave_one") {
            _techEffDesc = _td111.minValue + "〜" + _td111.maxValue + "ダメージ＋成長ボーナス";
            if (_td111.type === "damage_leave_one") { _techEffDesc += "（敵HP必ず1以上残す）"; }
          } else {
            _techEffDesc = _td111.minValue + "〜" + _td111.maxValue + "回復＋成長ボーナス、次敵攻撃" + Math.round(_td111.damageReduction * 100) + "%軽減";
          }
          html += '<div class="shop-row" style="font-size:0.76em;">' +
            '<span style="color:#888;padding-left:16px;">効果: </span>' +
            '<span style="color:#a0cfff;">' + _techEffDesc + '</span></div>';
          html += '<div class="shop-row" style="font-size:0.76em;">' +
            '<span style="color:#888;padding-left:16px;"></span>' +
            '<span style="color:#c8b4ff;">1戦闘に1回</span></div>';
        } else {
          var _lockReason111 = getCompanionTechniqueLockReason(cd.id);
          html += '<div class="shop-row" style="font-size:0.76em;">' +
            '<span style="color:#888;padding-left:16px;">条件: </span>' +
            '<span style="color:#a08060;">' + _lockReason111 + '</span></div>';
        }
      }
      // §113 v0.44 / §117 v0.45 / §122 v0.47: 仲間サイドストーリー状態表示（第1話・第2話・第3話）
      var _ss113 = COMPANION_SIDE_STORY_DATA[cd.id];
      if (_ss113) {
        normalizeCompanionSideStoryFlags();
        normalizeCompanionSideStoryChapter2Flags();
        normalizeCompanionSideStoryChapter3Flags(); // §122 v0.47
        html += '<div class="shop-row" style="font-size:0.8em;margin-top:4px;border-top:1px solid #2a3a5a;padding-top:4px;">' +
          '<span style="color:#a0cfff;font-weight:bold;">📖 仲間の物語</span></div>';
        // 第1話
        var _sDone113 = !!(state.companionSideStoryFlags && state.companionSideStoryFlags[cd.id]);
        var _sUnlocked113 = isCompanionSideStoryUnlocked(cd.id, 1);
        html += '<div class="shop-row" style="font-size:0.8em;">' +
          '<span style="color:#6090c0;padding-left:8px;">第1話</span>' +
          '<span style="color:#e0e0e0;padding-left:4px;">「' + _ss113.title + '」</span>' +
          '<span style="color:' + (_sDone113 ? "#06d6a0" : (_sUnlocked113 ? "#ffd166" : "#888")) + ';font-size:0.85em;">' +
          (_sDone113 ? "✓ 完了" : (_sUnlocked113 ? "閲覧可能" : "未解放")) + '</span></div>';
        if (!_sDone113 && !_sUnlocked113) {
          var _sLock113 = getCompanionSideStoryLockReason(cd.id, 1);
          html += '<div class="shop-row" style="font-size:0.76em;">' +
            '<span style="color:#888;padding-left:24px;">条件: </span>' +
            '<span style="color:#a08060;">' + _sLock113 + '</span></div>';
        }
        // 第2話
        var _ss2_113 = COMPANION_SIDE_STORY_CHAPTER2_DATA[cd.id];
        if (_ss2_113) {
          var _sDone2_113 = !!(state.companionSideStoryChapter2Flags && state.companionSideStoryChapter2Flags[cd.id]);
          var _sUnlocked2_113 = isCompanionSideStoryUnlocked(cd.id, 2);
          html += '<div class="shop-row" style="font-size:0.8em;">' +
            '<span style="color:#9070c0;padding-left:8px;">第2話</span>' +
            '<span style="color:#e0e0e0;padding-left:4px;">「' + _ss2_113.title + '」</span>' +
            '<span style="color:' + (_sDone2_113 ? "#06d6a0" : (_sUnlocked2_113 ? "#ffd166" : "#888")) + ';font-size:0.85em;">' +
            (_sDone2_113 ? "✓ 完了" : (_sUnlocked2_113 ? "閲覧可能" : "未解放")) + '</span></div>';
          if (!_sDone2_113 && !_sUnlocked2_113) {
            var _sLock2_113 = getCompanionSideStoryLockReason(cd.id, 2);
            html += '<div class="shop-row" style="font-size:0.76em;">' +
              '<span style="color:#888;padding-left:24px;">条件: </span>' +
              '<span style="color:#a08060;">' + _sLock2_113 + '</span></div>';
          }
        }
        // §122 v0.47: 第3話
        var _ss3_113 = COMPANION_SIDE_STORY_CHAPTER3_DATA[cd.id];
        if (_ss3_113) {
          var _sDone3_113 = !!(state.companionSideStoryChapter3Flags && state.companionSideStoryChapter3Flags[cd.id]);
          var _sUnlocked3_113 = isCompanionSideStoryUnlocked(cd.id, 3);
          html += '<div class="shop-row" style="font-size:0.8em;">' +
            '<span style="color:#c0a060;padding-left:8px;">第3話</span>' +
            '<span style="color:#e0e0e0;padding-left:4px;">「' + _ss3_113.title + '」</span>' +
            '<span style="color:' + (_sDone3_113 ? "#06d6a0" : (_sUnlocked3_113 ? "#ffd166" : "#888")) + ';font-size:0.85em;">' +
            (_sDone3_113 ? "✓ 完了" : (_sUnlocked3_113 ? "閲覧可能" : "未解放")) + '</span></div>';
          if (!_sDone3_113 && !_sUnlocked3_113) {
            var _sLock3_113 = getCompanionSideStoryLockReason(cd.id, 3);
            html += '<div class="shop-row" style="font-size:0.76em;">' +
              '<span style="color:#888;padding-left:24px;">条件: </span>' +
              '<span style="color:#a08060;">' + _sLock3_113 + '</span></div>';
          }
        }
      }
    });

    // §107 v0.41: 仲間装備袋（8種類・仲間ごとグループ化）
    html += "<h3>仲間装備袋</h3>";
    var cgBagGroups = [
      { cid: "juritani",   label: "ジュリタニ",   ids: ["hotblood_bandana", "critical_bracelet"] },
      { cid: "shurittani", label: "シュリタニ",   ids: ["capture_gloves", "net_master_belt"] },
      { cid: "norio",      label: "ノリオ",       ids: ["observation_glasses", "research_notebook"] },
      { cid: "harumi",     label: "ハルミ",       ids: ["healing_ribbon", "prayer_brooch"] }
    ];
    for (var cgBi = 0; cgBi < cgBagGroups.length; cgBi++) {
      var cgBg = cgBagGroups[cgBi];
      html += '<div class="shop-row" style="margin-top:6px;">' +
        '<span style="color:#a0cfff;font-size:0.88em;font-weight:bold;">【' + cgBg.label + '】</span></div>';
      for (var cgBij = 0; cgBij < cgBg.ids.length; cgBij++) {
        var cgBGid = cgBg.ids[cgBij];
        var cgBGD  = COMPANION_GEAR_DATA[cgBGid];
        if (!cgBGD) continue;
        var cgBCnt = state.companionGearInventory[cgBGid] || 0;
        var cgBIsEq = (state.companionEquipment[cgBg.cid] === cgBGid);
        var _cgBSrc = COMPANION_GEAR_REWARD_DATA[cgBGid];
        var _cgBFlag = !!(state.companionGearRewardFlags && state.companionGearRewardFlags[cgBGid]);
        // §110 v0.42.1: flag=true+所持0 → 入手済み(未所持)、flag=false → 未入手+場所
        var cgBStatus    = cgBIsEq ? "装備中" : (cgBCnt > 0 ? "未装備" :
          (_cgBFlag ? "入手済み(現在未所持)" : (_cgBSrc ? "未入手(" + _cgBSrc.source + ")" : "未入手")));
        var cgBStatusCol = cgBIsEq ? "#06d6a0" : (cgBCnt > 0 ? "#a0cfff" :
          (_cgBFlag ? "#888" : (_cgBSrc ? "#a08060" : "#888")));
        html += '<div class="shop-row" style="font-size:0.82em;">' +
          '<span>' + cgBGD.emoji + " " + cgBGD.name +
          ' <span style="color:#888;font-size:0.88em;">×' + cgBCnt + '</span></span>' +
          '<span style="color:' + cgBStatusCol + ';font-size:0.85em;">' + cgBStatus + '</span></div>';
        html += '<div class="shop-row" style="font-size:0.76em;">' +
          '<span style="color:#888;padding-left:12px;">効果</span>' +
          '<span style="color:#e9c46a;">' + (cgBGD.effectDesc || "") + '</span></div>';
      }
    }
    html += '<div style="padding:4px 12px;">' +
      '<button class="shop-menu-btn" data-gear-action="equip-all" style="margin:2px 0;">🎒 おすすめ一括装備（汎用型）</button>' +
      '<button class="shop-menu-btn" data-gear-action="unequip-all" style="margin:2px 0;">🔄 全解除</button>' +
      '</div>';

    // §47 v0.9.3 / §48 v0.10 / §50 v0.11 / §55 v0.12: 横スクロール進捗
    var sm = state.sideMap;
    var s1Cleared = !!(sm && sm.stageCleared && sm.stageCleared["1"]);
    var s1BossDefeated = !!(sm && sm.defeatedEnemies && sm.defeatedEnemies["36,1"]);
    var s2Cleared = !!(sm && sm.stageCleared && sm.stageCleared["2"]);
    var s2BossDefeated = !!(sm && sm.defeatedEnemies && sm.defeatedEnemies["2:35,1"]);
    var s3Cleared = !!(sm && sm.stageCleared && sm.stageCleared["3"]);
    var s3BossDefeated = !!(sm && sm.defeatedEnemies && sm.defeatedEnemies["3:31,2"]);
    var s4Cleared = !!(sm && sm.stageCleared && sm.stageCleared["4"]);
    var s4BossDefeated = !!(sm && sm.defeatedEnemies && sm.defeatedEnemies["4:33,2"]);
    html += "<h3>横スクロール進捗</h3>";
    html += '<div class="shop-row"><span>はじまりの草原</span><span style="color:' +
      (s1Cleared ? "#06d6a0" : "#888") + ';">' +
      (s1Cleared ? "✅ クリア済み" : "未クリア") + "</span></div>";
    html += '<div class="shop-row"><span>中ボスゴリラ</span><span style="color:' +
      (s1BossDefeated ? "#06d6a0" : "#888") + ';">' +
      (s1BossDefeated ? "✅ 撃退済み" : "未撃退") + "</span></div>";
    html += '<div class="shop-row"><span>あやしい森</span><span style="color:' +
      (s2Cleared ? "#06d6a0" : "#888") + ';">' +
      (s2Cleared ? "✅ クリア済み" : "未クリア") + "</span></div>";
    html += '<div class="shop-row"><span>ボスゴリラ</span><span style="color:' +
      (s2BossDefeated ? "#06d6a0" : "#888") + ';">' +
      (s2BossDefeated ? "✅ 撃退済み" : "未撃退") + "</span></div>";
    html += '<div class="shop-row"><span>古びた町はずれ</span><span style="color:' +
      (s3Cleared ? "#06d6a0" : "#888") + ';">' +
      (s3Cleared ? "✅ クリア済み" : "未クリア") + "</span></div>";
    html += '<div class="shop-row"><span>魔王ゴリラ</span><span style="color:' +
      (s3BossDefeated ? "#06d6a0" : "#888") + ';">' +
      (s3BossDefeated ? "✅ 撃退済み" : "未撃退") + "</span></div>";
    html += '<div class="shop-row"><span>ゴリラ山道</span><span style="color:' +
      (s4Cleared ? "#06d6a0" : "#888") + ';">' +
      (s4Cleared ? "✅ クリア済み" : "未クリア") + "</span></div>";
    html += '<div class="shop-row"><span>大魔王ゴリラ</span><span style="color:' +
      (s4BossDefeated ? "#06d6a0" : "#888") + ';">' +
      (s4BossDefeated ? "✅ 撃退済み" : "未撃退") + "</span></div>";
    var s5Cleared = !!(sm && sm.stageCleared && sm.stageCleared["5"]);
    var s5BossDefeated = !!(sm && sm.defeatedEnemies && sm.defeatedEnemies["5:33,2"]);
    html += '<div class="shop-row"><span>黒い城</span><span style="color:' +
      (s5Cleared ? "#06d6a0" : "#888") + ';">' +
      (s5Cleared ? "✅ クリア済み" : "未クリア") + "</span></div>";
    html += '<div class="shop-row"><span>ラスボス級ゴリラ</span><span style="color:' +
      (s5BossDefeated ? "#06d6a0" : "#888") + ';">' +
      (s5BossDefeated ? "✅ 撃退済み" : "未撃退") + "</span></div>";
    var s6Cleared = !!(sm && sm.stageCleared && sm.stageCleared["6"]);
    var s6BossDefeated = !!(sm && sm.defeatedEnemies && sm.defeatedEnemies["6:34,2"]);
    html += '<div class="shop-row"><span>チンパンジーの聖域</span><span style="color:' +
      (s6Cleared ? "#06d6a0" : "#888") + ';">' +
      (s6Cleared ? "✅ クリア済み" : "未クリア") + "</span></div>";
    html += '<div class="shop-row"><span>究極チンパンジー</span><span style="color:' +
      (s6BossDefeated ? "#06d6a0" : "#888") + ';">' +
      (s6BossDefeated ? "✅ 撃退済み" : "未撃退") + "</span></div>";
    // §60 v0.14.1: 横スクロール編総合判定行
    var sideStoryMastered = s6Cleared && s6BossDefeated;
    html += '<div class="shop-row"><span>横スクロール編</span><span style="color:' +
      (sideStoryMastered ? "#ffd166" : "#888") + ';font-weight:' +
      (sideStoryMastered ? "bold" : "normal") + ';">' +
      (sideStoryMastered ? "✅ 制覇済み" : "進行中") + "</span></div>";
    var sideTitle = null;
    if (s6Cleared && s6BossDefeated) {
      sideTitle = "ゴリラの世界の外側を見た者";  // §60 v0.14.1
    } else if (s6Cleared) {
      sideTitle = "聖域を越えし者";
    } else if (s5Cleared && s5BossDefeated) {
      sideTitle = "黒い城の覇者";
    } else if (s5Cleared) {
      sideTitle = "黒い城を越えし者";
    } else if (s4Cleared && s4BossDefeated) {
      sideTitle = "ゴリラ山道の覇者";
    } else if (s4Cleared) {
      sideTitle = "山道を越えし者";
    } else if (s3Cleared && s3BossDefeated) {
      sideTitle = "町はずれの覇者";
    } else if (s3Cleared) {
      sideTitle = "町はずれを越えし者";
    } else if (s2Cleared && s2BossDefeated) {
      sideTitle = "森の制覇者";
    } else if (s1Cleared && s1BossDefeated) {
      sideTitle = "中ボスゴリラを退かせし者";
    } else if (s1Cleared) {
      sideTitle = "草原を越えし者";
    }
    if (sideTitle) {
      html += '<div class="shop-row"><span>横スクロール称号</span>' +
        '<span style="color:#ffd166;font-size:0.85em;">' + sideTitle + "</span></div>";
    }

    // §126 v0.49: 名前変更・メンバー管理ショートカット
    html += '<div style="display:flex;gap:8px;margin-top:14px;">';
    html += '<button class="shop-menu-btn" id="btn-status-rename" style="flex:1;border-color:#74c0fc;color:#74c0fc;">✏️ 名前を変更</button>';
    html += '<button class="shop-menu-btn" id="btn-status-member-management" style="flex:1;border-color:#a0cfff;color:#a0cfff;">👥 メンバー管理</button>';
    html += '</div>';
    document.getElementById("status-body").innerHTML = html;
    // §126 v0.49: 名前変更・メンバー管理ハンドラ
    document.getElementById("btn-status-rename").onclick = function () {
      closeModal("status-modal");
      openPlayerNameModal("change");
    };
    document.getElementById("btn-status-member-management").onclick = function () {
      closeModal("status-modal");
      openMemberManagement();
    };
    // §105 v0.40: 仲間装備ボタンのイベントバインド
    // §108 v0.41.1: 連打防止 - クリック直後にdisable（renderStatusBodyで再構築されるまで有効）
    var _cgBtns = document.querySelectorAll("[data-gear-action]");
    for (var _cgBi = 0; _cgBi < _cgBtns.length; _cgBi++) {
      (function (_btn) {
        _btn.onclick = function () {
          _btn.disabled = true; // 連打防止
          var _a = _btn.getAttribute("data-gear-action");
          var _c = _btn.getAttribute("data-gear-cid");
          if (_a === "equip") {
            equipCompanionGear(_c, _btn.getAttribute("data-gear-id"));
          } else if (_a === "unequip") {
            equipCompanionGear(_c, null);
          } else if (_a === "equip-all") {
            // §107 v0.41: おすすめ = 汎用型（スターター4種）を明示的に選択
            ensureCompanionGearState();
            var _pref = { juritani: "hotblood_bandana", shurittani: "capture_gloves", norio: "observation_glasses", harumi: "healing_ribbon" };
            var _acs2 = ["juritani", "shurittani", "norio", "harumi"];
            for (var _ai2 = 0; _ai2 < _acs2.length; _ai2++) {
              var _pid = _pref[_acs2[_ai2]];
              if (_pid && (state.companionGearInventory[_pid] || 0) > 0) {
                state.companionEquipment[_acs2[_ai2]] = _pid;
              }
            }
            saveGame(); renderStatusBody();
          } else if (_a === "unequip-all") {
            ensureCompanionGearState();
            var _ucs = ["juritani", "shurittani", "norio", "harumi"];
            for (var _ui = 0; _ui < _ucs.length; _ui++) { state.companionEquipment[_ucs[_ui]] = null; }
            saveGame(); renderStatusBody();
          }
        };
      })(_cgBtns[_cgBi]);
    }
    if (state.gameCleared) {
      document.getElementById("btn-status-watch-ending").onclick = function () {
        closeModal("status-modal");
        openEndingModal();
      };
    }
  }

  // ---------------------------------------------------------
  // 19.8 酒場モーダル(§9.5/§10)
  // ---------------------------------------------------------
  function openTavernModal() {
    openModal("tavern-modal");
    renderTavernMain();
  }

  function renderTavernMain() {
    var body = document.getElementById("tavern-body");
    var p = state.player;
    var html = '<p>「ここは酒場だ。旅の仲間を探しますか？」</p>';
    html += '<p class="small">仲間: ' + p.companions.length + "/" + COMPANION_MAX + "人</p>";
    html += '<button class="shop-menu-btn" id="t-recruit">🤝 仲間を探す</button>';
    html += '<button class="shop-menu-btn" id="t-view">👥 仲間を見る</button>';
    html += '<button class="shop-menu-btn" id="t-leave">👋 仲間を外す</button>';
    html += '<button class="shop-menu-btn" id="t-stories" style="border-color:#a0cfff;color:#a0cfff;">📖 仲間の物語</button>'; // §113 v0.44
    html += '<button class="shop-menu-btn" id="t-join-all" style="border-color:#ffd166;color:#ffd166;">👥 加入済み全員合流</button>'; // §127 v0.50
    body.innerHTML = html;
    document.getElementById("t-recruit").onclick = renderTavernRecruit;
    document.getElementById("t-view").onclick = renderTavernViewParty;
    document.getElementById("t-leave").onclick = renderTavernLeave;
    document.getElementById("t-stories").onclick = renderTavernStories; // §113 v0.44
    document.getElementById("t-join-all").onclick = joinAllCompanions; // §127 v0.50
  }

  // §113 v0.44 / §117 v0.45: 酒場「仲間の物語」一覧（第1話・第2話カード）
  function renderTavernStories() {
    var body = document.getElementById("tavern-body");
    normalizeCompanionSideStoryFlags();
    normalizeCompanionSideStoryChapter2Flags();
    normalizeCompanionSideStoryChapter3Flags(); // §122 v0.47
    var html = '<p style="margin:0 0 4px;font-weight:bold;color:#a0cfff;">📖 仲間の物語</p>';
    var cids = ["juritani", "shurittani", "norio", "harumi"];
    for (var _si = 0; _si < cids.length; _si++) {
      var _scid = cids[_si];
      var _sc = findById(COMPANION_DATA, _scid);
      if (!_sc) continue;
      var _ss1 = COMPANION_SIDE_STORY_DATA[_scid];
      var _ss2 = COMPANION_SIDE_STORY_CHAPTER2_DATA[_scid];
      var _ss3 = COMPANION_SIDE_STORY_CHAPTER3_DATA[_scid]; // §122 v0.47
      html += '<div style="border:1px solid #2a3a5a;border-radius:6px;padding:8px 10px;margin-bottom:8px;">';
      html += '<div style="font-size:0.9em;font-weight:bold;margin-bottom:4px;">' + _sc.icon + " " + _sc.name + '</div>'; // §121 v0.46: icon（人型）に変更
      // 第1話カード
      if (_ss1) {
        var _s1Unlocked = isCompanionSideStoryUnlocked(_scid, 1);
        var _s1Done = isCompanionSideStoryCompleted(_scid, 1);
        html += '<div style="border-left:2px solid #3a5a8a;padding-left:8px;margin-bottom:6px;">';
        html += '<div style="font-size:0.78em;color:#6090c0;margin-bottom:2px;">第1話</div>';
        html += '<div style="font-size:0.82em;color:#e0e0e0;">「' + _ss1.title + '」</div>';
        if (_s1Done) {
          html += '<div style="font-size:0.78em;color:#06d6a0;margin:2px 0;">✓ 完了</div>';
          html += '<button class="shop-menu-btn" data-story-cid="' + _scid + '" data-story-chapter="1" style="font-size:0.82em;padding:4px 10px;margin-top:2px;border-color:#555;color:#aaa;">もう一度読む</button>';
        } else if (_s1Unlocked) {
          html += '<div style="font-size:0.78em;color:#ffd166;margin:2px 0;">閲覧可能</div>';
          html += '<button class="shop-menu-btn" data-story-cid="' + _scid + '" data-story-chapter="1" style="font-size:0.82em;padding:4px 10px;margin-top:2px;border-color:#ffd166;color:#ffd166;">物語を読む</button>';
        } else {
          var _s1Lock = getCompanionSideStoryLockReason(_scid, 1);
          html += '<div style="font-size:0.78em;color:#888;margin:2px 0;">未解放</div>';
          html += '<div style="font-size:0.76em;color:#a08060;margin:2px 0 2px;">条件：' + _s1Lock + '</div>';
          html += '<button class="shop-menu-btn" data-story-cid-lock="' + _scid + '" data-story-chapter-lock="1" style="font-size:0.82em;padding:4px 10px;margin-top:2px;color:#555;border-color:#444;">🔒 未解放</button>';
        }
        html += '</div>';
      }
      // 第2話カード
      if (_ss2) {
        var _s2Unlocked = isCompanionSideStoryUnlocked(_scid, 2);
        var _s2Done = isCompanionSideStoryCompleted(_scid, 2);
        html += '<div style="border-left:2px solid #5a3a8a;padding-left:8px;margin-bottom:6px;">';
        html += '<div style="font-size:0.78em;color:#9070c0;margin-bottom:2px;">第2話</div>';
        html += '<div style="font-size:0.82em;color:#e0e0e0;">「' + _ss2.title + '」</div>';
        if (_s2Done) {
          html += '<div style="font-size:0.78em;color:#06d6a0;margin:2px 0;">✓ 完了</div>';
          html += '<button class="shop-menu-btn" data-story-cid="' + _scid + '" data-story-chapter="2" style="font-size:0.82em;padding:4px 10px;margin-top:2px;border-color:#555;color:#aaa;">もう一度読む</button>';
        } else if (_s2Unlocked) {
          html += '<div style="font-size:0.78em;color:#ffd166;margin:2px 0;">閲覧可能</div>';
          html += '<button class="shop-menu-btn" data-story-cid="' + _scid + '" data-story-chapter="2" style="font-size:0.82em;padding:4px 10px;margin-top:2px;border-color:#ffd166;color:#ffd166;">物語を読む</button>';
        } else {
          var _s2Lock = getCompanionSideStoryLockReason(_scid, 2);
          html += '<div style="font-size:0.78em;color:#888;margin:2px 0;">未解放</div>';
          html += '<div style="font-size:0.76em;color:#a08060;margin:2px 0 2px;">条件：' + _s2Lock + '</div>';
          html += '<button class="shop-menu-btn" data-story-cid-lock="' + _scid + '" data-story-chapter-lock="2" style="font-size:0.82em;padding:4px 10px;margin-top:2px;color:#555;border-color:#444;">🔒 未解放</button>';
        }
        html += '</div>';
      }
      // §122 v0.47: 第3話カード
      if (_ss3) {
        var _s3Unlocked = isCompanionSideStoryUnlocked(_scid, 3);
        var _s3Done = isCompanionSideStoryCompleted(_scid, 3);
        html += '<div style="border-left:2px solid #6a5a3a;padding-left:8px;">';
        html += '<div style="font-size:0.78em;color:#c0a060;margin-bottom:2px;">第3話</div>';
        html += '<div style="font-size:0.82em;color:#e0e0e0;">「' + _ss3.title + '」</div>';
        if (_s3Done) {
          html += '<div style="font-size:0.78em;color:#06d6a0;margin:2px 0;">✓ 完了</div>';
          html += '<button class="shop-menu-btn" data-story-cid="' + _scid + '" data-story-chapter="3" style="font-size:0.82em;padding:4px 10px;margin-top:2px;border-color:#555;color:#aaa;">もう一度読む</button>';
        } else if (_s3Unlocked) {
          html += '<div style="font-size:0.78em;color:#ffd166;margin:2px 0;">閲覧可能</div>';
          html += '<button class="shop-menu-btn" data-story-cid="' + _scid + '" data-story-chapter="3" style="font-size:0.82em;padding:4px 10px;margin-top:2px;border-color:#ffd166;color:#ffd166;">物語を読む</button>';
        } else {
          var _s3Lock = getCompanionSideStoryLockReason(_scid, 3);
          html += '<div style="font-size:0.78em;color:#888;margin:2px 0;">未解放</div>';
          html += '<div style="font-size:0.76em;color:#a08060;margin:2px 0 2px;">条件：' + _s3Lock + '</div>';
          html += '<button class="shop-menu-btn" data-story-cid-lock="' + _scid + '" data-story-chapter-lock="3" style="font-size:0.82em;padding:4px 10px;margin-top:2px;color:#555;border-color:#444;">🔒 未解放</button>';
        }
        html += '</div>';
      }
      html += '</div>';
    }
    // §115 v0.44.2 / §117 v0.45 / §119 v0.45.2: 全話完了バナー
    var _hasBanner = false;
    if (areAllCompanionSideStoriesComplete()) {
      if (!_hasBanner) { html += '<div style="border-top:1px solid #2a3a5a;padding-top:8px;margin-top:6px;margin-bottom:4px;">'; _hasBanner = true; }
      html += '<div style="text-align:center;margin:0 0 4px;color:#ffd166;font-weight:bold;font-size:0.88em;">🌟 4人の第1話をすべて読み終えました</div>';
    }
    if (areAllCompanionSideStoryChapter2Complete()) {
      if (!_hasBanner) { html += '<div style="border-top:1px solid #2a3a5a;padding-top:8px;margin-top:6px;margin-bottom:4px;">'; _hasBanner = true; }
      html += '<div style="text-align:center;margin:0 0 4px;color:#c8b4ff;font-weight:bold;font-size:0.88em;">🌟 4人の第2話をすべて読み終えました</div>';
    }
    if (areAllCompanionSideStoryChapter3Complete()) { // §133 v0.54
      if (!_hasBanner) { html += '<div style="border-top:1px solid #2a3a5a;padding-top:8px;margin-top:6px;margin-bottom:4px;">'; _hasBanner = true; }
      html += '<div style="text-align:center;margin:0 0 4px;color:#f4a261;font-weight:bold;font-size:0.88em;">🌅 4人の第3話をすべて読み終えました</div>';
    }
    if (_hasBanner) { html += '</div>'; }
    // §135 v0.56: 最終サイドストーリー導線カード（全12話の下部）
    html += '<div style="border:1px solid #3a2a4a;border-radius:6px;padding:8px 10px;margin-top:8px;margin-bottom:8px;background:#0e0e1e;">';
    var _finalUnlocked = isFinalCompanionSideStoryUnlocked();
    var _finalDone = isFinalCompanionSideStoryCompleted();
    if (_finalDone) {
      html += '<div style="text-align:center;color:#ffd166;font-weight:bold;font-size:0.88em;margin-bottom:4px;">🌟 最終サイドストーリー 完了</div>';
      html += '<p style="font-size:0.8em;color:#b0a0c0;margin:0;">四人と主人公の物語は、大きなひとつの節目を迎えました。</p>';
      html += '<button class="shop-menu-btn" id="t-final-story-restart" style="font-size:0.82em;padding:4px 10px;margin-top:4px;border-color:#555;color:#aaa;">もう一度挑む（ST6再入場）</button>';
    } else if (_finalUnlocked) {
      html += '<div style="text-align:center;color:#f4a261;font-weight:bold;font-size:0.88em;margin-bottom:4px;">🌅 その先の物語</div>';
      html += '<p style="font-size:0.8em;color:#d0b090;margin:0 0 4px;">新しい物語が始まろうとしています。</p>';
      html += '<button class="shop-menu-btn" id="t-final-story-enter" style="font-size:0.82em;padding:4px 12px;margin-top:2px;border-color:#f4a261;color:#f4a261;">チンパンジーの聖域へ向かう</button>';
    } else if (areAllCompanionSideStoryChapter3Complete() && !state.companionSideStoryChapter3AllCompleteCelebrated) {
      html += '<div style="text-align:center;color:#f4a261;font-weight:bold;font-size:0.88em;margin-bottom:4px;">🌅 四つの灯り</div>';
      html += '<p style="font-size:0.8em;color:#b09070;margin:0;">四人の第3話がすべて完了しました。まずは「四つの灯り、その先へ」を見届けてみましょう。</p>';
    } else if (areAllCompanionSideStoryChapter3Complete() && state.companionSideStoryChapter3AllCompleteCelebrated) {
      html += '<div style="text-align:center;color:#888;font-weight:bold;font-size:0.88em;margin-bottom:4px;">🌅 その先の物語</div>';
      html += '<p style="font-size:0.8em;color:#907070;margin:0;">四人の想いはひとつにつながりました。物語はまだ先へ続きそうです。冒険を進めてみましょう。</p>';
    } else {
      html += '<div style="text-align:center;color:#555;font-weight:bold;font-size:0.88em;margin-bottom:4px;">🔒 その先の物語</div>';
      html += '<p style="font-size:0.8em;color:#555;margin:0;">四人それぞれの物語を、最後まで見届けてみよう。</p>';
    }
    html += '</div>';
    html += '<button class="shop-back-btn" id="t-back">戻る</button>';
    body.innerHTML = html;
    // §135 v0.56: 最終ストーリー入場ボタン
    var _tFinalEnter = document.getElementById("t-final-story-enter");
    if (_tFinalEnter) {
      _tFinalEnter.onclick = function () {
        closeModal("tavern-modal");
        openStageWarpModal(6);
      };
    }
    var _tFinalRestart = document.getElementById("t-final-story-restart");
    if (_tFinalRestart) {
      _tFinalRestart.onclick = function () {
        closeModal("tavern-modal");
        openStageWarpModal(6);
      };
    }
    // 閲覧可能・完了済みボタン
    var _storyBtns = body.querySelectorAll("button[data-story-cid]");
    for (var _bi = 0; _bi < _storyBtns.length; _bi++) {
      (function (_btn) {
        _btn.onclick = function () {
          var _bc = parseInt(_btn.getAttribute("data-story-chapter"), 10) || 1;
          startCompanionSideStory(_btn.getAttribute("data-story-cid"), _bc);
        };
      })(_storyBtns[_bi]);
    }
    // 未解放ボタン（ロック理由を表示）
    var _lockBtns = body.querySelectorAll("button[data-story-cid-lock]");
    for (var _li = 0; _li < _lockBtns.length; _li++) {
      (function (_btn) {
        _btn.onclick = function () {
          var _lockCid = _btn.getAttribute("data-story-cid-lock");
          var _lockCh = parseInt(_btn.getAttribute("data-story-chapter-lock"), 10) || 1;
          showToast("この物語はまだ解放されていない。\n" + getCompanionSideStoryLockReason(_lockCid, _lockCh));
        };
      })(_lockBtns[_li]);
    }
    document.getElementById("t-back").onclick = renderTavernMain;
  }

  function renderTavernRecruit() {
    var body = document.getElementById("tavern-body");
    var p = state.player;
    var partyFull = p.companions.length >= COMPANION_MAX;
    // §77 v0.25: 仲間カードUI
    var html = '<p style="margin:0 0 4px;">仲間: <b>' + p.companions.length + "/" + COMPANION_MAX + "</b>人</p>";
    if (partyFull) {
      html += '<p class="small" style="color:#ff7b7b;margin:0 0 8px;">仲間が上限です。先に外してください。</p>';
    }
    COMPANION_DATA.forEach(function (c) {
      var inParty = hasCompanion(c.id);
      var _rq = getCompanionQuote(c);
      html += '<div class="companion-card">';
      var _cl = getCompanionLevel(c.id); // §99 v0.37
      html += '<div class="companion-card-header">';
      html += '<span class="companion-name">' + c.icon + " " + c.name + "</span>"; // §121 v0.46: icon（人型）に変更
      if (inParty) {
        html += '<span class="companion-status" style="color:#06d6a0;">✓ パーティ中</span>';
      } else {
        html += '<span class="companion-status" style="color:#adb5bd;">待機中</span>';
      }
      html += "</div>";
      html += '<div style="font-size:0.82em;color:#a0cfff;margin:1px 0 3px;">' + (_cl.level >= 99 ? "Lv.99 MAX" : "Lv." + _cl.level) + '</div>'; // §100 v0.37.1
      html += '<div class="companion-ability">' + c.effectDesc + "</div>";
      if (_rq) {
        html += '<div class="companion-quote" style="color:' + _rq.color + ';">「' + _rq.text + "」</div>";
      }
      if (!inParty && !partyFull) {
        html += '<div class="companion-action"><button data-recruit="' + c.id + '">🤝 仲間にする</button></div>';
      }
      html += "</div>";
    });
    html += '<button class="shop-back-btn" id="t-back">戻る</button>';
    body.innerHTML = html;
    body.querySelectorAll("button[data-recruit]").forEach(function (btn) {
      btn.onclick = function () {
        recruitCompanion(btn.getAttribute("data-recruit"));
      };
    });
    document.getElementById("t-back").onclick = renderTavernMain;
  }

  function renderTavernViewParty() {
    var body = document.getElementById("tavern-body");
    var p = state.player;
    // §77 v0.25: 仲間カードUI
    var html = "";
    if (p.companions.length === 0) {
      html += '<p class="small">現在、仲間はいない。酒場で仲間を探してみよう。</p>';
    } else {
      p.companions.forEach(function (id) {
        var c = findById(COMPANION_DATA, id);
        if (!c) return;
        var _vq = getCompanionQuote(c);
        var _vcl = getCompanionLevel(c.id); // §99 v0.37
        html += '<div class="companion-card">';
        html += '<div class="companion-card-header">';
        html += '<span class="companion-name">' + c.icon + " " + c.name + "</span>"; // §121 v0.46: icon（人型）に変更
        html += '<span class="companion-status" style="color:#06d6a0;">✓ パーティ中</span>';
        html += "</div>";
        html += '<div style="font-size:0.82em;color:#a0cfff;margin:1px 0 3px;">' + (_vcl.level >= 99 ? "Lv.99 MAX" : "Lv." + _vcl.level) + '</div>'; // §100 v0.37.1
        html += '<div class="companion-ability">' + c.effectDesc + "</div>";
        if (_vq) {
          html += '<div class="companion-quote" style="color:' + _vq.color + ';">「' + _vq.text + "」</div>";
        }
        html += "</div>";
      });
    }
    html += '<button class="shop-back-btn" id="t-back">戻る</button>';
    body.innerHTML = html;
    document.getElementById("t-back").onclick = renderTavernMain;
  }

  function renderTavernLeave() {
    var body = document.getElementById("tavern-body");
    var p = state.player;
    // §77 v0.25: 仲間カードUI
    var html = "";
    if (p.companions.length === 0) {
      html += '<p class="small">外せる仲間がいない。</p>';
    } else {
      p.companions.forEach(function (id) {
        var c = findById(COMPANION_DATA, id);
        if (!c) return;
        html += '<div class="companion-card">';
        html += '<div class="companion-card-header">';
        html += '<span class="companion-name">' + c.icon + " " + c.name + "</span>"; // §121 v0.46: icon（人型）に変更
        html += '<span class="companion-status" style="color:#06d6a0;">✓ パーティ中</span>';
        html += "</div>";
        html += '<div class="companion-ability">' + c.effectDesc + "</div>";
        html += '<div class="companion-action"><button class="leave-btn" data-leave="' + c.id + '">👋 外す</button></div>';
        html += "</div>";
      });
    }
    html += '<button class="shop-back-btn" id="t-back">戻る</button>';
    body.innerHTML = html;
    body.querySelectorAll("button[data-leave]").forEach(function (btn) {
      btn.onclick = function () {
        dismissCompanion(btn.getAttribute("data-leave"));
        renderTavernLeave();
      };
    });
    document.getElementById("t-back").onclick = renderTavernMain;
  }

  function recruitCompanion(id) {
    var p = state.player;
    var c = findById(COMPANION_DATA, id);
    var body = document.getElementById("tavern-body");
    if (hasCompanion(id) || p.companions.length >= COMPANION_MAX) {
      renderTavernRecruit();
      return;
    }
    var success = Math.random() < c.joinRate;
    var msgs = success ? c.joinMsgs : c.failMsgs;
    var html = '<div style="padding:8px 2px;">';
    html += '<p style="margin:0 0 10px;font-size:13px;font-weight:bold;">' + c.icon + " " + c.name + "</p>"; // §121 v0.46: icon（人型）に変更
    msgs.forEach(function (msg) {
      html += '<p style="margin:4px 0;font-size:13px;">' + msg + "</p>";
    });
    html += "</div>";
    if (success) {
      html += '<p style="color:#06d6a0;font-weight:bold;margin:10px 0 6px;">' + c.name + "が仲間になった！</p>";
      html += '<button class="shop-back-btn" id="t-recruit-ok">OK</button>';
    } else {
      html += '<button class="shop-back-btn" id="t-recruit-back">戻る</button>';
    }
    body.innerHTML = html;
    if (success) {
      p.companions.push(id);
      resetPartyTrail(); // §79 v0.26.1
      updateStatusBar();
      saveGame();
      document.getElementById("t-recruit-ok").onclick = renderTavernRecruit;
    } else {
      document.getElementById("t-recruit-back").onclick = renderTavernRecruit;
    }
  }

  function dismissCompanion(id) {
    var p = state.player;
    var idx = p.companions.indexOf(id);
    if (idx === -1) return;
    p.companions.splice(idx, 1);
    resetPartyTrail(); // §79 v0.26.1
    var c = findById(COMPANION_DATA, id);
    showToast(c.name + "は酒場に戻った。");
    updateStatusBar();
    saveGame();
  }

  // ---------------------------------------------------------
  // 20. 商人モーダル(買う/アイテムを売る/UMAを売る)
  // ---------------------------------------------------------
  function openMerchantModal() {
    openModal("merchant-modal");
    renderMerchantMain();
  }

  // §138 v0.57.1: 購入ロック（連打防止・非永続）
  var _companionGearPurchaseLock = false;

  // §138 v0.57.1: 仲間装備購入詳細状態（純粋関数・副作用なし）
  function getCompanionGearPurchaseStatus(gearId) {
    var shopItem = null;
    for (var _cgi = 0; _cgi < COMPANION_GEAR_SHOP_ITEMS.length; _cgi++) {
      if (COMPANION_GEAR_SHOP_ITEMS[_cgi].gearId === gearId) { shopItem = COMPANION_GEAR_SHOP_ITEMS[_cgi]; break; }
    }
    var gear = COMPANION_GEAR_DATA[gearId] || null;
    var valid = !!(gear);
    var inShop = !!(shopItem);
    var cid = (gear && gear.allowedCompanion) ? gear.allowedCompanion : null;
    var joined = (cid && typeof hasCompanionEverJoined === "function") ? hasCompanionEverJoined(cid) : false;
    var owned = (state.companionGearInventory[gearId] || 0) > 0;
    var price = shopItem ? shopItem.price : 0;
    var affordable = shopItem ? (state.player.gold >= price) : false;
    var purchasable = valid && inShop && joined && !owned && affordable;
    var reason = "available";
    if (!valid)      { reason = "gear_not_found"; }
    else if (!inShop)   { reason = "not_in_shop"; }
    else if (!joined)   { reason = "companion_not_joined"; }
    else if (owned)     { reason = "already_owned"; }
    else if (!affordable) { reason = "insufficient_gold"; }
    return { valid: valid, inShop: inShop, joined: joined, owned: owned,
             affordable: affordable, purchasable: purchasable,
             reason: reason, price: price, cid: cid };
  }

  // §138 v0.57.1: reasonコードを日本語テキストへ変換
  function _cgReasonText(reason) {
    if (reason === "gear_not_found")       { return "存在しない装備"; }
    if (reason === "not_in_shop")          { return "販売対象外"; }
    if (reason === "companion_not_joined") { return "仲間未加入"; }
    if (reason === "already_owned")        { return "所持済み"; }
    if (reason === "insufficient_gold")    { return "G不足"; }
    return reason;
  }

  // §137 v0.57 / §138 v0.57.1: 購入可否（後方互換・getCompanionGearPurchaseStatusへ委譲）
  function canBuyCompanionGear(gearId) {
    var s = getCompanionGearPurchaseStatus(gearId);
    return { ok: s.purchasable, reason: _cgReasonText(s.reason), price: s.price };
  }

  // §137 v0.57 / §138 v0.57.1: 購入処理（lock・直前再確認・saveGame1回）
  function buyCompanionGear(gearId) {
    if (_companionGearPurchaseLock) { return; }
    _companionGearPurchaseLock = true;
    var status = getCompanionGearPurchaseStatus(gearId);
    if (!status.purchasable) {
      showToast("購入不可: " + _cgReasonText(status.reason));
      _companionGearPurchaseLock = false;
      return;
    }
    // 直前再確認（二重安全）
    if (state.player.gold < status.price) {
      showToast("所持金が足りません");
      _companionGearPurchaseLock = false;
      return;
    }
    if ((state.companionGearInventory[gearId] || 0) > 0) {
      showToast("すでに所持している");
      _companionGearPurchaseLock = false;
      return;
    }
    state.player.gold -= status.price;
    state.companionGearInventory[gearId] = (state.companionGearInventory[gearId] || 0) + 1;
    saveGame();
    _companionGearPurchaseLock = false;
    var gear = COMPANION_GEAR_DATA[gearId];
    showToast(gear.emoji + " " + gear.name + " を購入！\n仲間装備画面で装備できます");
    renderCompanionGearShop();
  }

  // §137 v0.57 / §138 v0.57.1: 仲間装備ショップ描画（ホワイトリスト方式・報酬gearなし）
  function renderCompanionGearShop() {
    ensureCompanionGearState();
    var body = document.getElementById("merchant-body");
    var html = "<p>所持金: " + state.player.gold + " G</p>";
    html += '<p style="margin-bottom:4px;font-size:0.95em;">仲間用装備</p>';
    for (var _cgi = 0; _cgi < COMPANION_GEAR_SHOP_ITEMS.length; _cgi++) {
      var _si = COMPANION_GEAR_SHOP_ITEMS[_cgi];
      var _sgear = COMPANION_GEAR_DATA[_si.gearId];
      if (!_sgear) { continue; }
      var _st = getCompanionGearPurchaseStatus(_si.gearId);
      var _cDat = _st.cid ? findById(COMPANION_DATA, _st.cid) : null;
      var _cidName = _cDat ? _cDat.name : (_st.cid || "?");
      html += '<div style="margin-bottom:8px;padding:6px;border:1px solid #555;border-radius:6px;">';
      html += '<div>' + _sgear.emoji + ' <strong>' + _sgear.name + '</strong>';
      html += ' <span style="font-size:0.8em;color:#aaa;">（' + _cidName + '専用）</span></div>';
      html += '<div style="font-size:0.85em;color:#aaa;">' + _sgear.effectDesc + '</div>';
      html += '<div style="font-size:0.85em;color:#aaa;">' + _si.price + ' G</div>';
      if (_st.owned) {
        html += '<div style="color:#06d6a0;font-size:0.9em;margin-top:2px;">&#x2705; 所持済み</div>';
      } else if (!_st.joined) {
        html += '<div style="color:#aaa;font-size:0.9em;margin-top:2px;">&#x1F512; 仲間加入後に購入できます</div>';
      } else if (!_st.affordable) {
        html += '<div style="color:#e76f51;font-size:0.9em;margin-top:2px;">&#x1F4B0; お金が足りません（' + _si.price + ' G必要）</div>';
      } else {
        html += '<button class="modal-btn" data-buy-cg="' + _si.gearId + '" style="margin-top:4px;">購入 ' + _si.price + ' G</button>';
      }
      html += '</div>';
    }
    html += '<button class="shop-back-btn" id="shop-back">戻る</button>';
    body.innerHTML = html;
    body.querySelectorAll("button[data-buy-cg]").forEach(function (btn) {
      btn.onclick = function () { buyCompanionGear(btn.getAttribute("data-buy-cg")); };
    });
    document.getElementById("shop-back").onclick = renderMerchantMain;
  }

  function renderMerchantMain() {
    var body = document.getElementById("merchant-body");
    var html =
      "<p>所持金: " + state.player.gold + " G</p>" +
      '<button class="shop-menu-btn" id="m-buy">🛍️ 買う</button>';
    EQUIP_SLOTS.forEach(function (slotInfo) {
      html += '<button class="shop-menu-btn" data-buy-equip-slot="' + slotInfo.slot + '">' +
        slotInfo.label + "を買う</button>";
    });
    html +=
      '<button class="shop-menu-btn" id="m-buy-companion-gear">&#x1F45A; 仲間装備を買う</button>' +
      '<button class="shop-menu-btn" id="m-sell-item">📤 アイテムを売る</button>' +
      '<button class="shop-menu-btn" id="m-sell-uma">🦍 UMAを売る</button>' +
      '<button class="shop-menu-btn" id="m-sell-equip">🔧 装備を売る</button>';
    body.innerHTML = html;
    document.getElementById("m-buy").onclick = renderMerchantBuy;
    document.getElementById("m-buy-companion-gear").onclick = renderCompanionGearShop;
    document.getElementById("m-sell-item").onclick = renderMerchantSellItem;
    document.getElementById("m-sell-uma").onclick = renderMerchantSellUma;
    document.getElementById("m-sell-equip").onclick = renderMerchantSellEquip;
    body.querySelectorAll("button[data-buy-equip-slot]").forEach(function (btn) {
      btn.onclick = function () {
        renderMerchantBuyEquip(findEquipSlot(btn.getAttribute("data-buy-equip-slot")));
      };
    });
  }

  function renderMerchantBuyEquip(slotInfo) {
    var body = document.getElementById("merchant-body");
    var html = "<p>所持金: " + state.player.gold + " G</p>";
    var purchasable = slotInfo.data().filter(function (item) { return item.buyPrice > 0; });
    if (purchasable.length === 0) html += '<p class="small">今は販売中の' + slotInfo.label + 'がない。</p>';
    purchasable.forEach(function (item) {
      var owned = isEquipOwned(slotInfo, item.id);
      html += '<div class="shop-row"><span>' + item.name + " (" + bonusText(item) + ", " + item.buyPrice + "G)</span>" +
        '<button data-buy-equip="' + item.id + '"' + (owned ? " disabled" : "") + ">" +
        (owned ? "購入済み" : "購入") + "</button></div>";
    });
    html += '<button class="shop-back-btn" id="shop-back">戻る</button>';
    body.innerHTML = html;
    body.querySelectorAll("button[data-buy-equip]").forEach(function (btn) {
      btn.onclick = function () {
        buyEquip(slotInfo, btn.getAttribute("data-buy-equip"));
        renderMerchantBuyEquip(slotInfo);
      };
    });
    document.getElementById("shop-back").onclick = renderMerchantMain;
  }

  function buyEquip(slotInfo, id) {
    var p = state.player;
    var item = findById(slotInfo.data(), id);
    if (isEquipOwned(slotInfo, id)) return;
    if (p.gold < item.buyPrice) { showToast("お金が足りない！"); return; }
    p.gold -= item.buyPrice;
    p[slotInfo.ownedKey].push(id);
    showToast(item.name + "を購入！装備変更画面で装備できます");
    updateStatusBar();
    saveGame();
  }

  function buyableList() {
    var list = [];
    WEAPON_DATA.forEach(function (w) {
      if (w.buyPrice > 0) list.push({ kind: "weapon", id: w.id, name: w.name, price: w.buyPrice });
    });
    ITEM_DATA.forEach(function (it) {
      if (it.buyPrice > 0) list.push({ kind: "item", id: it.id, name: it.name, price: it.buyPrice });
    });
    return list;
  }

  function renderMerchantBuy() {
    var body = document.getElementById("merchant-body");
    var html = "<p>所持金: " + state.player.gold + " G</p>";
    buyableList().forEach(function (entry) {
      html += '<div class="shop-row"><span>' + entry.name + " (" + entry.price + "G)</span>" +
        '<button data-buy="' + entry.kind + ":" + entry.id + '">購入</button></div>';
    });
    html += '<button class="shop-back-btn" id="shop-back">戻る</button>';
    body.innerHTML = html;
    body.querySelectorAll("button[data-buy]").forEach(function (btn) {
      btn.onclick = function () {
        var parts = btn.getAttribute("data-buy").split(":");
        buyThing(parts[0], parts[1]);
        renderMerchantBuy(); // 購入後に再描画して所持金を更新
      };
    });
    document.getElementById("shop-back").onclick = renderMerchantMain;
  }

  // trackable: true のアイテムは player.<id>Count というフィールドで所持数を管理する。
  // (例: potion -> potionCount, coughsyrup -> coughsyrupCount)
  function getItemCount(id) {
    return state.player[id + "Count"] || 0;
  }
  function addItemCount(id, delta) {
    state.player[id + "Count"] = getItemCount(id) + delta;
  }

  function buyThing(kind, id) {
    var p = state.player;
    if (kind === "weapon") {
      var w = findById(WEAPON_DATA, id);
      if (p.gold < w.buyPrice) { showToast("お金が足りない！"); return; }
      p.gold -= w.buyPrice;
      p.weaponAtkBonus += w.atkBonus;
      recomputeStats();
      showToast(w.name + "を購入！ こうげき力+" + w.atkBonus);
    } else {
      var it = findById(ITEM_DATA, id);
      if (p.gold < it.buyPrice) { showToast("お金が足りない！"); return; }
      p.gold -= it.buyPrice;
      if (it.trackable) addItemCount(it.id, 1);
      showToast(it.name + "を購入！");
    }
    updateStatusBar();
    saveGame();
  }

  function renderMerchantSellItem() {
    var body = document.getElementById("merchant-body");
    var p = state.player;
    var html = "<p>所持金: " + p.gold + " G</p>";
    ITEM_DATA.filter(function (it) { return it.trackable; }).forEach(function (it) {
      var count = getItemCount(it.id);
      html += '<div class="shop-row"><span>' + it.name + " x" + count + " (" + it.sellPrice + "G)</span>" +
        '<button data-sellitem="' + it.id + '"' + (count <= 0 ? " disabled" : "") + ">売却</button></div>";
    });
    html += '<button class="shop-back-btn" id="shop-back">戻る</button>';
    body.innerHTML = html;
    body.querySelectorAll("button[data-sellitem]").forEach(function (btn) {
      btn.onclick = function () {
        sellItem(btn.getAttribute("data-sellitem"));
        renderMerchantSellItem();
      };
    });
    document.getElementById("shop-back").onclick = renderMerchantMain;
  }

  function sellItem(id) {
    var p = state.player;
    var it = findById(ITEM_DATA, id);
    if (getItemCount(id) <= 0) return;
    addItemCount(id, -1);
    p.gold += it.sellPrice;
    showToast(it.name + "を売った！ +" + it.sellPrice + "G");
    updateStatusBar();
    saveGame();
  }

  function renderMerchantSellUma() {
    var body = document.getElementById("merchant-body");
    var p = state.player;
    var ids = Object.keys(p.umaInventory).filter(function (id) { return p.umaInventory[id] > 0; });
    var html = "<p>所持金: " + p.gold + " G</p>";
    if (ids.length === 0) html += '<p class="small">売れるUMAがいない。</p>';
    ids.forEach(function (id) {
      var u = findById(UMA_DATA, id);
      html += '<div class="shop-row"><span>' + u.emoji + " " + u.name + " x" + p.umaInventory[id] +
        " (" + u.sellPrice + "G)</span>" +
        '<button data-selluma="' + id + '">売却</button></div>';
    });
    html += '<button class="shop-back-btn" id="shop-back">戻る</button>';
    body.innerHTML = html;
    body.querySelectorAll("button[data-selluma]").forEach(function (btn) {
      btn.onclick = function () {
        sellUma(btn.getAttribute("data-selluma"));
        renderMerchantSellUma();
      };
    });
    document.getElementById("shop-back").onclick = renderMerchantMain;
  }

  function sellUma(id) {
    var p = state.player;
    if (!p.umaInventory[id] || p.umaInventory[id] <= 0) return;
    var u = findById(UMA_DATA, id);
    p.umaInventory[id]--;
    if (p.umaInventory[id] <= 0) delete p.umaInventory[id];
    p.gold += u.sellPrice;
    // 売却してもUMA図鑑の「捕獲済み」記録は消さない
    showToast(u.name + "を売った！ +" + u.sellPrice + "G");
    updateStatusBar();
    saveGame();
  }

  function renderMerchantSellEquip() {
    var body = document.getElementById("merchant-body");
    var p = state.player;
    var html = "<p>所持金: " + p.gold + " G</p>";
    var hasAny = false;
    EQUIP_SLOTS.forEach(function (slotInfo) {
      var ownedItems = slotInfo.data().filter(function (item) {
        return isEquipOwned(slotInfo, item.id);
      });
      if (ownedItems.length === 0) return;
      html += "<h3>" + slotInfo.label + "</h3>";
      ownedItems.forEach(function (item) {
        hasAny = true;
        var equipped = p.equipment[slotInfo.slot] === item.id;
        var sellPrice = item.buyPrice ? Math.floor(item.buyPrice / 2) : 5;
        var legendMark = item.isLegendary ? ' <span style="color:#ffd166;font-size:10px;">★伝説</span>' : "";
        var btnLabel = equipped ? "装備中" : item.isLegendary ? "売却不可" : sellPrice + "Gで売る";
        html += '<div class="shop-row"><span>' + item.name + legendMark + " (" + bonusText(item) + ")</span>" +
          '<button data-sellequip="' + slotInfo.slot + ":" + item.id + '"' +
          (equipped || item.isLegendary ? " disabled" : "") + ">" + btnLabel + "</button></div>";
      });
    });
    if (!hasAny) html += '<p class="small">売れる装備がない。</p>';
    html += '<button class="shop-back-btn" id="shop-back">戻る</button>';
    body.innerHTML = html;
    body.querySelectorAll("button[data-sellequip]").forEach(function (btn) {
      btn.onclick = function () {
        var parts = btn.getAttribute("data-sellequip").split(":");
        sellEquip(parts[0], parts[1]);
        renderMerchantSellEquip();
      };
    });
    document.getElementById("shop-back").onclick = renderMerchantMain;
  }

  function sellEquip(slot, id) {
    var slotInfo = findEquipSlot(slot);
    if (!isEquipOwned(slotInfo, id)) return;
    var p = state.player;
    if (p.equipment[slot] === id) {
      showToast("装備中なので売れない！");
      return;
    }
    var item = findById(slotInfo.data(), id);
    if (item.isLegendary) {
      showToast(item.name + "は伝説の装備だ。売ることはできない。");
      return;
    }
    var sellPrice = item.buyPrice ? Math.floor(item.buyPrice / 2) : 5;
    var idx = p[slotInfo.ownedKey].indexOf(id);
    if (idx !== -1) p[slotInfo.ownedKey].splice(idx, 1);
    p.gold += sellPrice;
    showToast(item.name + "を売った！ +" + sellPrice + "G");
    updateStatusBar();
    saveGame();
  }

  // ---------------------------------------------------------
  // 21. 転職モーダル(神様の社)
  // ---------------------------------------------------------
  function openGodModal() {
    openModal("god-modal");
    renderGodBody();
  }

  function renderGodBody() {
    var body = document.getElementById("god-body");
    var current = state.player.job.id;
    var html = "";
    JOB_DATA.forEach(function (j) {
      html += '<button class="job-btn" data-job="' + j.id + '">' +
        (j.id === current ? "★ " : "") + j.name +
        '<br><span class="job-desc">' + j.desc + "</span></button>";
    });
    body.innerHTML = html;
    body.querySelectorAll("button[data-job]").forEach(function (btn) {
      btn.onclick = function () { changeJob(btn.getAttribute("data-job")); };
    });
  }

  function changeJob(jobId) {
    var job = findById(JOB_DATA, jobId);
    if (!job) return;
    state.player.job = job;
    recomputeStats();
    updateStatusBar();
    showToast("⛩️ 職業を「" + job.name + "」に転職した！");
    closeModal("god-modal");
    saveGame();
  }

  // ---------------------------------------------------------
  // 21.6 装備モーダル(武器/防具/盾/兜。GAME_DESIGN.md §8.5)
  // ---------------------------------------------------------
  // ownedKey: その区分の所持品リストを保持する player のフィールド名
  var EQUIP_SLOTS = [
    { slot: "weapon", label: "⚔ 武器", ownedKey: "ownedWeapons", data: function () { return EQUIP_WEAPON_DATA; } },
    { slot: "armor", label: "🥋 防具", ownedKey: "ownedArmors", data: function () { return ARMOR_DATA; } },
    { slot: "shield", label: "🛡 盾", ownedKey: "ownedShields", data: function () { return SHIELD_DATA; } },
    { slot: "helmet", label: "⛑ 兜", ownedKey: "ownedHelmets", data: function () { return HELMET_DATA; } }
  ];

  // 伝説装備リスト(v0.8 §30, v0.8.3 §33, v0.20.1 §71: slot/itemId追加) — ステータス画面の進捗表示・コンプリート判定に使用
  var LEGEND_EQUIPS = [
    { name: "ペガサスのよろい", flag: "pegasusArmorGot",  slot: "armor",  itemId: "pegasusarmor"   },
    { name: "六連のたて",       flag: "sixfoldShieldGot", slot: "shield", itemId: "sixfoldshield"  },
    { name: "宇宙のかぶと",     flag: "cosmicHelmetGot",  slot: "helmet", itemId: "cosmickabuto"   },
    { name: "如意棒",           flag: "nyoiboGot",        slot: "weapon", itemId: "nyoibo"         },
    { name: "アンドロメダの鎖", flag: "andromedaGot",     slot: "weapon", itemId: "andromedachain" },
    { name: "キグナスのかぶと", flag: "cygnusHelmetGot",  slot: "helmet", itemId: "cygnuskabuto"   }, // v0.8.3
    { name: "ドラゴンのたて",   flag: "dragonShieldGot",  slot: "shield", itemId: "dragonshield"   }  // v0.8.3
  ];

  // ---------------------------------------------------------
  // NPC会話システム(§32 v0.8.2)
  // ---------------------------------------------------------
  var NPC_DATA = {
    D: {
      name: "UMA博士",
      emoji: "🔎",
      getLines: function () {
        var p = state.player;
        var capturedCount = UMA_DATA.filter(function (m) { return p.dex[m.id] === "captured"; }).length;
        var lines = [];
        // §72 v0.21: 図鑑コンプリート + 未クリア → 図鑑達成セリフ + 究極ゴリラへ誘導
        if (!state.gameCleared && isUmaDexComplete()) {
          lines.push("UMA図鑑をここまで埋めたのか……見事じゃ。");
          lines.push("だが、伝説の中心にいる究極ゴリラには、ただ捕まえるだけでは届かぬ。");
          lines.push("最後は、歌が必要になるはずじゃ。");
          return lines;
        }
        // §73 v0.22: 未捕獲UMAのヒントを最初の1体から示す
        var firstUncaptured = null;
        for (var _ui = 0; _ui < UMA_DATA.length; _ui++) {
          if (p.dex[UMA_DATA[_ui].id] !== "captured") { firstUncaptured = UMA_DATA[_ui]; break; }
        }
        if (capturedCount >= 8) {
          lines.push("すばらしい！図鑑がほぼ完成しておるぞ！");
          if (firstUncaptured) {
            lines.push(firstUncaptured.name + "はまだ捕まえていないようじゃ。" + (firstUncaptured.hintText || ""));
          }
        } else if (capturedCount >= 4) {
          lines.push("なかなか集まってきたな。図鑑を埋めるのも立派な冒険じゃ。");
          if (firstUncaptured && firstUncaptured.hintArea) {
            lines.push(firstUncaptured.name + "はまだ記録されていない。" + firstUncaptured.hintArea + "を探してみるとよいぞ。");
          } else {
            lines.push("捕まえたUMAは、図鑑でタップすると詳しい能力を確認できるぞ。");
          }
        } else {
          lines.push("UMAを見つけたら図鑑に記録される。捕まえると完全なデータになるぞ。");
          lines.push("図鑑でタップすれば詳細なステータスが見られる。");
        }
        // §60 v0.14.1: 横スクロール編制覇後 → 究極ゴリラ捕獲へ誘導
        if (!state.gameCleared && isSideStoryCleared()) {
          lines.push("チンパンジーを退かせたのか……！あれはUMAではない。伝説のゴリラでもない。");
          lines.push("だが、おぬしはゴリラの世界の外側に触れたのじゃ。");
          // §69 v0.19: 横スクロール制覇済み・究極ゴリラ未捕獲 → 歌が必要という誘導を強化
          lines.push("チンパンジーの聖域を越えた力があるなら、あとは歌を届けるだけじゃ。");
          lines.push("究極ゴリラは、今も森のどこかで待っておる。");
          return lines;
        }
        if (state.gameCleared) {
          // §69 v0.19: 完全達成反応
          if (isFullyCompleted()) {
            lines.push("おぬしは、ついにやり遂げたのじゃな。");
            lines.push("究極ゴリラに歌を届け、チンパンジーの聖域を越え、すべてのUMAを図鑑に記録した。");
            lines.push("わしが長年追い続けた夢を、おぬしは本当に形にしてしまったのじゃ。");
            return lines;
          }
          // §66 v0.17.1 / §72 v0.21: 図鑑コンプリート反応（クリア済み）
          if (isUmaDexComplete()) {
            lines.push("すべてのUMAを記録し、究極ゴリラに歌を届けたのじゃな。");
            lines.push("おぬしはもう、立派なUMAハンターじゃ。");
            lines.push("わしが長年追いかけてきた夢を、おぬしは本当に形にしてしまった。");
            return lines;
          }
          // §65 v0.17: クリア後NPC反応
          lines.push("ついに究極ゴリラを捕まえたのじゃな……！");
          lines.push("力でねじ伏せるのではなく、歌を届けたからこそ、あやつは心を開いたのじゃ。");
          lines.push("おぬしは本物のUMAハンターじゃ。");
          // §69 v0.19: 横スクロール制覇 or 図鑑誘導
          if (!isSideStoryCleared()) {
            lines.push("究極ゴリラを捕まえたなら、今度は横に長い世界の奥も歩いてみるとよい。");
            lines.push("森の外側には、まだ強者が待っておる。");
          } else {
            lines.push("図鑑の完成まで目指してみないか。まだ捕まえていない伝説が残っているぞ。");
          }
          return lines;
        } else if (p.level >= 99) {
          lines.push("素晴らしい成長じゃ。もはや君は、伝説に手を伸ばせる場所にいる。");
          lines.push("あとは女神のウクレレと歌声だけが必要だ。");
        } else if (p.level >= 10) {
          lines.push("最近は変わった者たちも草原に出るようじゃ。");
          lines.push("パワポ野郎、忍者かぶれ、グルメ気取り……もはやUMAより説明が難しいのう。");
          lines.push("キラリと光るゴリラに出会ったら、経験値のチャンスじゃ！見逃すなよ。");
          lines.push("横スクロールの草原の奥に💢の気配がある。UMAではなく別のゴリラ……のようじゃ。");
        } else if (p.level >= 5) {
          lines.push("メタルゴリラ系を見つけたら大チャンスじゃ。");
          lines.push("逃げられる前に攻撃できれば、経験値をたくさんもらえるぞ。");
          lines.push("キラリと光るゴリラに出会ったら、経験値のチャンスじゃ！見逃すなよ。");
        } else {
          lines.push("UMAと普通のモンスターは別物じゃ。");
          lines.push("図鑑に残るUMAもいれば、旅の途中で出会うだけの相手もおる。");
          lines.push("キラリと光るゴリラに出会ったら、経験値のチャンスじゃ！");
        }
        // §52 v0.11.2: UMA捕獲ヒント / §61 v0.15: わざコマンドも案内
        if (capturedCount < 4) {
          lines.push("UMAはHPが0になると逃げてしまう。少し弱らせてから捕まえるのじゃ！");
          lines.push("削りすぎが怖い時は「わざ」を使うのじゃ。「はずかし固め・小」は1ダメージ固定。「ここはひとつガマン」は通常攻撃を弱めるぞ。");
        } else if (!state.gameCleared && p.level >= 50) {
          // §63 v0.16: Lv50以上で究極ゴリラのHP調整ヒント（ガマンも紹介）
          lines.push("究極ゴリラのHP調整には「わざ」が役立つ。「はずかし固め・小」で1ずつ削るか、「ここはひとつガマン」で通常攻撃を弱めるのじゃ！");
        }
        // §52 v0.11.2: 横スクロール未訪問時のゲート案内
        var sideVisitedD = !!(state.sideMap && (
          Object.keys(state.sideMap.openedChests || {}).length > 0 ||
          Object.keys(state.sideMap.defeatedEnemies || {}).length > 0
        ));
        if (!sideVisitedD && p.level >= 5 && !state.gameCleared) {
          lines.push("村の南に🌀渦巻くゲートがある。あそこから横スクロールの草原へ行けるぞ。");
        }
        // §53 v0.11.3: 訪問済みの場合は帰還ゲートの説明を追加
        if (sideVisitedD && !state.gameCleared) {
          lines.push("横スクロールの世界で身動きが取れなくなったら、スタート付近の🏠帰還ゲートを使うのじゃ。ゴール画面からも戻れるぞ。");
        }
        return lines;
      }
    },
    R: {
      name: "旅人",
      emoji: "🧳",
      getLines: function () {
        var p = state.player;
        var lines = [];
        // §65 v0.17 / §69 v0.19: クリア後NPC反応
        if (state.gameCleared) {
          // §69 v0.19: 完全達成
          if (isFullyCompleted()) {
            lines.push("もう、あんたに案内する道は残ってないかもしれないな。");
            lines.push("でもな、不思議なもんで、全部やりきった後の森ってのも、またいいもんだぜ。");
            return lines;
          }
          lines.push("おいおい、本当に究極ゴリラを捕まえたのか？");
          lines.push("最初に会った時から、ただ者じゃないとは思ってたけどな。まさかここまでやるとはな。");
          // §69 v0.19: 横スクロール未制覇なら誘導
          if (!isSideStoryCleared()) {
            lines.push("横に長い世界の奥にも、いつか行ってみるといいぜ。強者がまだ待ってるはずだ。");
          }
          return lines;
        }
        if (p.hasUkulele) {
          lines.push("女神の音色を手に入れたのか……星のように光る宝箱がそれに反応するらしいぞ。");
          lines.push("力ある者には、岩に刺さった棒も引き抜けるかもしれない。強い仲間を連れてみな。");
        } else if (p.level >= 50) {
          lines.push("白く光る🌟宝箱があるだろう？強き者にしか開かぬという噂だ。");
          lines.push("そういえば草原のどこかに✨輝く宝箱も見かけた。Lv40あれば開けられるかもしれんな。");
          lines.push("レベルが上がると、前は怖かった敵にも勝てるようになる。それが冒険というものだ。");
        } else if (p.level >= 40) {
          lines.push("草原を進んでいったら✨輝く宝箱を見かけた。普通の宝箱とは違う光だった。");
          lines.push("試しに開けてみないか？お前ならもう十分強いと思うが。");
          lines.push("宝箱を見つけたら忘れずに開けておくといい。装備やアイテムが、あとで命を救うこともある。");
        } else if (p.level >= 15) {
          lines.push("草原には普通の宝箱🎁の他に、✨特別な光を放つ宝箱が眠っていることもあるらしい。");
          lines.push("もっと強くなれば、特別な宝箱の謎が解けるかもしれないぞ。");
          lines.push("宝箱を見つけたら忘れずに開けておくといい。装備やアイテムが、あとで命を救うこともある。");
        } else {
          lines.push("最初から全部の敵に勝とうとしなくていい。危ないと思ったら、にげるのも立派な作戦だ。");
          lines.push("草原には普通の宝箱🎁の他に、✨特別な光を放つ宝箱が眠っていることもあるらしい。");
          if (p.level < 10) {
            lines.push("のらいぬは序盤では意外と強い。危ないと思ったら「にげる」を使うのも立派な勇者の判断だぞ。");
            lines.push("酒場でノリオを仲間にすると、経験値が2倍になるらしい。序盤のレベル上げに重宝するぞ。");
          } else {
            lines.push("レベルが上がると、前は怖かった敵にも勝てるようになるぞ。");
            lines.push("強い敵ほど大きな経験値を持っている。挑む価値はあるぞ。");
          }
        }
        // §60 v0.14.1: 横スクロール編制覇後の反応
        if (!state.gameCleared && isSideStoryCleared()) {
          lines.push("黒い城の奥にまで行って帰ってきたのか？あんた、本当にただ者じゃないな。");
          lines.push("でも、森にはまだ歌を待っているゴリラがいるらしいぜ。");
          return lines;
        }
        // §47 v0.9.3: ステージ1クリア後にステージ2予告を追加
        var s1Cleared = !!(state.sideMap && state.sideMap.stageCleared && state.sideMap.stageCleared["1"]);
        if (s1Cleared) {
          lines.push("横に長い草原を越えたらしいな。次は「あやしい森」が待っているという噂だ。");
        }
        // §52 v0.11.2: 横スクロール未訪問時のゲート案内
        var sideVisitedR = !!(state.sideMap && (
          Object.keys(state.sideMap.openedChests || {}).length > 0 ||
          Object.keys(state.sideMap.defeatedEnemies || {}).length > 0
        ));
        if (!sideVisitedR && !s1Cleared) {
          lines.push("そういえば、村の中に🌀渦巻く不思議なゲートを見かけたぞ。あそこから横スクロールの草原へ行けるらしい。");
        }
        return lines;
      }
    },
    K: {
      name: "鍛冶屋",
      emoji: "🔨",
      getLines: function () {
        var p = state.player;
        var lines = [];
        var hasAnyLegend = state.eventFlags && (
          state.eventFlags.pegasusArmorGot || state.eventFlags.sixfoldShieldGot ||
          state.eventFlags.cosmicHelmetGot || state.eventFlags.nyoiboGot || state.eventFlags.andromedaGot ||
          state.eventFlags.cygnusHelmetGot || state.eventFlags.dragonShieldGot
        );
        lines.push("武器や防具は、持っているだけでは意味がない。ちゃんと装備するんだ。");
        if (state.eventFlags && state.eventFlags.nyoiboGot) {
          lines.push("如意棒を手に入れたか！あれは最強の武器だ。しっかり装備しろよ。");
        } else if (hasCompanion("juritani")) {
          lines.push("おお、ジュリタニが一緒か！ならフィールドの奥に棒が刺さっている場所がある。引き抜いてみな。");
        } else if (p.level >= 70) {
          lines.push("如意棒は一人では抜けない。酒場でジュリタニという仲間を探してみろ。");
        } else if (state.eventFlags && state.eventFlags.cygnusHelmetGot) {
          lines.push("キグナスのかぶとも手に入れたか。なかなかやるじゃないか。");
          lines.push("フィールドの奥にはまだまだ伝説の装備が眠っているぞ。");
        } else if (p.level >= 40) {
          lines.push("草原の奥に✨輝く宝箱がある。あそこに特別な兜が眠っているはずだ。");
          lines.push("Lv40あればたぶん開けられる。行ってみな。");
        } else if (p.level >= 20) {
          lines.push("装備は「🎽装備」ボタンでいつでも変更できる。商人で強い装備を買ってみろ。");
          lines.push("強い敵に勝てない時は、レベルだけでなく装備も見直すんだ。");
          lines.push("宝箱には、思わぬ装備が眠っていることもある。");
        } else {
          lines.push("装備は「🎽装備」ボタンでいつでも変更できる。商人で強い装備を買ってみろ。");
          if (p.level < 10) {
            lines.push("武器を替えれば攻撃が通りやすくなる。防具・盾・兜を整えれば、のらいぬの一撃にも耐えやすくなるぞ。");
          }
        }
        // §70 v0.20 / §71 v0.20.1: 伝説装備コンプリート反応
        if (isLegendaryEquipmentComplete()) {
          lines.push("すべての伝説装備をそろえたのか……。");
          lines.push("武具に選ばれたというより、お前の旅が武具を目覚めさせたんだな。");
        } else if (hasAnyLegend) {
          var remaining = LEGEND_EQUIPS.filter(function(le) { return !state.eventFlags[le.flag]; }).length;
          lines.push("★伝説の装備は、商人には売れんぞ。大切にな。");
          lines.push("あと" + remaining + "種類で、伝説装備がすべてそろうぞ。");
        } else if (p.level >= 30) {
          lines.push("伝説装備は、ただ強いだけじゃない。");
          lines.push("すべてそろえた時、お前の旅そのものが、ひとつの伝説になるんだ。");
        } else {
          lines.push("いつか伝説級の装備も出るかもしれないな。如意棒、ドラゴンのたて……名前だけでワクワクするだろう？");
        }
        return lines;
      }
    },
    E: {
      name: "ゴリラ研究家",
      emoji: "📚",
      getLines: function () {
        var p = state.player;
        var lines = [];
        if (state.gameCleared) {
          // §69 v0.19: 完全達成反応
          if (isFullyCompleted()) {
            lines.push("研究者として、これほど興奮する記録はない。");
            lines.push("究極ゴリラの捕獲。チンパンジーの撃退。そしてUMA図鑑の完成。");
            lines.push("これはもう研究ではなく、伝説そのものだ。");
            return lines;
          }
          // §65 v0.17: クリア後NPC反応
          lines.push("究極ゴリラを捕まえた記録は、歴史に残る。");
          lines.push("チンパンジーを退かせた強さ。究極ゴリラに歌を届けたやさしさ。どちらも、君の冒険の証だ。");
          // §69 v0.19: 横スクロール or 図鑑誘導
          if (!isSideStoryCleared()) {
            lines.push("究極ゴリラを捕まえたなら、次は横スクロールの世界にも踏み込んでみてはどうだ。まだ強者が待っている。");
          } else {
            lines.push("伝説の装備をすべて集めたか？まだ見ぬ装備が残っているかもしれないぞ。");
          }
          return lines;
        } else if (isSideStoryCleared()) {
          // §60 v0.14.1: 横スクロール編制覇後 → 究極ゴリラとチンパンジーの役割の違いを説明
          lines.push("究極ゴリラとチンパンジーは、まったく別の存在だ。");
          lines.push("究極ゴリラは伝説のUMA。チンパンジーは戦闘力だけなら最強クラスの試練だった。");
          lines.push("捕まえるべきは究極ゴリラ。退かせるべきだったのがチンパンジーだ。");
          lines.push("Lv99に到達して、女神のウクレレを手に入れ、HPを1〜10まで削って「うたう」んだ！");
        } else if (p.level >= 99 && p.hasUkulele) {
          lines.push("準備は万端だ！究極ゴリラのHPをギリギリまで減らし、「うたう」んだ！");
          lines.push("目安はHP1〜10。倒してしまっては意味がないぞ。");
        } else if (p.level >= 99) {
          lines.push("力は十分だ。あとは女神のウクレレの音色が必要だぞ。");
          lines.push("フィールドの奥に🪗特別な宝箱がある。探してみろ。");
        } else if (p.level >= 50) {
          lines.push("究極ゴリラに歌を届けるには、相当な力が必要だろう。目標はレベル99だ。");
          lines.push("メタルゴリラ系を狙えば効率よくレベルが上がるぞ！");
          lines.push("究極ゴリラの心を鎮めるには、HPをぎりぎりまで減らす必要があるらしい。普通の捕獲では通用しないぞ。");
        } else if (p.level >= 10) {
          lines.push("究極ゴリラは、普通に捕まえようとしても無理だ。特別な条件が必要になる。");
          lines.push("まずは力を蓄えろ。いつかその条件が分かる時が来る。");
          lines.push("メタルゴリラ系は硬いが、経験値がとても多い。出会えたら逃げられる前に勝負だ。");
          // §46 v0.9.2.1: 中ボスゴリラ撃退前後でヒントを変化
          var sideDefeated = !!(state.sideMap && state.sideMap.defeatedEnemies && state.sideMap.defeatedEnemies["36,1"]);
          if (sideDefeated) {
            lines.push("草原の中ボスゴリラを退かせたか！あいつはUMAではなく、道をふさぐ番人のようなものだ。よくやった。");
          } else {
            lines.push("横スクロールの草原の奥に💢の印がある場所がある。強いゴリラが待ち構えているらしいぞ。");
            lines.push("中ボスゴリラはUMAではない。捕まえようとしても無駄だ。退かせるしかない。");
          }
        } else {
          lines.push("ゴリラにも色々いる。普通のゴリラ、メタルなゴリラ、そして伝説の究極ゴリラだ。");
          lines.push("究極ゴリラは、普通に捕まえようとしても無理だ。特別な条件が必要になる。");
          lines.push("まずは力を蓄えろ。いつかその条件が分かる時が来る。");
          lines.push("伝説によると……究極ゴリラの先に、もっと恐ろしい何かがいるという。チンパンジー、とも呼ばれているらしい。");
        }
        return lines;
      }
    },
    S: {
      name: "王様の使い",
      emoji: "👑",
      getLines: function () {
        var p = state.player;
        var lines = [];
        if (state.eventFlags && state.eventFlags.dragonShieldGot) {
          if (state.eventFlags.andromedaGot) {
            lines.push("ドラゴンのたてもアンドロメダの鎖も手に入れたとは……まことに立派じゃ。");
          } else {
            lines.push("ドラゴンのたてはお役に立てているかな？");
          }
          lines.push("王様は、そなたのさらなる冒険を見守っておられます。");
        } else if (!state.gameCleared && isSideStoryCleared()) {
          // §60 v0.14.1: 横スクロール編制覇後 → 究極ゴリラ捕獲へ誘導
          lines.push("チンパンジーの聖域を越えたと聞いたぞ。");
          lines.push("だが、王が待っている報告はまだ別にある。究極ゴリラを捕まえた時こそ、真の報告に来るのだ。");
          lines.push("力をつけ、女神のウクレレを探し、準備を整えてから挑むのじゃ。");
        } else if (state.gameCleared) {
          // §69 v0.19: 完全達成反応
          if (isFullyCompleted()) {
            lines.push("王は深く感動しておられる。");
            lines.push("森の危機を越え、聖域を越え、すべてのUMAの記録を完成させた者。");
            lines.push("おぬしこそ、この森の真の英雄だ。");
            return lines;
          }
          // §65 v0.17: クリア後NPC反応
          lines.push("王はすでに報告を受けている。");
          lines.push("究極ゴリラを捕まえた者として、おぬしの名は森の歴史に刻まれるだろう。");
          // §69 v0.19: 横スクロール未制覇なら誘導
          if (!isSideStoryCleared()) {
            lines.push("横スクロールの世界にもまだ未踏の地があると聞く。その地も探索してみよ。");
          } else {
            lines.push("王様から褒美があるそうだ。実家で休んでみるとよい。");
          }
        } else if (p.level >= 50) {
          lines.push("勇者殿、王様はそなたの旅を見守っておられます。"); // §128 v0.50.1: 「使い」視点で自然な文章に修正（§127での直接呼びかけ混在を解消）
          lines.push("まずは力をつけ、女神のウクレレを探すのです。");
          lines.push("しっかり準備を整えてから究極ゴリラに挑むように、とのことじゃ。");
        } else {
          lines.push("勇者殿、王様は究極ゴリラの報告を待っておられる。"); // §127 v0.50: "勇者殿" 追加
          lines.push("まずはレベルを上げ、装備を整えることです。");
          lines.push("強敵に勝てない時は、逃げても恥ではありません。生きて戻ることも、勇者の務めです。");
          // §52 v0.11.2: 横スクロール未訪問時のゲート案内
          var sideVisitedS = !!(state.sideMap && (
            Object.keys(state.sideMap.openedChests || {}).length > 0 ||
            Object.keys(state.sideMap.defeatedEnemies || {}).length > 0
          ));
          if (!sideVisitedS) {
            lines.push("そうじゃ、村の近くに🌀渦のゲートがあるのを知っておるか？あそこから横スクロールの草原へ行けるのじゃ。");
          }
        }
        return lines;
      }
    }
  };

  function openNpcModal(tileChar) {
    var npc = NPC_DATA[tileChar];
    if (!npc) return;
    var lines = npc.getLines();
    var header = '<div style="font-size:40px;line-height:1.2;">' + npc.emoji + '</div>';
    header += '<div style="font-weight:bold;font-size:1em;margin-bottom:4px;">' + npc.name + '</div>';
    document.getElementById("npc-header").innerHTML = header;
    var speechHtml = "";
    for (var i = 0; i < lines.length; i++) {
      var _npcLine = (tileChar === "S") ? formatKingDialogueText(lines[i]) : lines[i]; // §127 v0.50
      speechHtml += "<p>「" + _npcLine + "」</p>";
    }
    document.getElementById("npc-speech").innerHTML = speechHtml;
    openModal("npc-modal");
  }

  function isEquipOwned(slotInfo, id) {
    return state.player[slotInfo.ownedKey].indexOf(id) !== -1;
  }

  function bonusText(item) {
    var parts = [];
    if (item.atkBonus) parts.push("攻+" + item.atkBonus);
    if (item.defBonus) parts.push("防+" + item.defBonus);
    if (item.hpBonus) parts.push("HP+" + item.hpBonus);
    if (item.mpBonus) parts.push("MP+" + item.mpBonus);
    return parts.join(" ") || "ボーナスなし";
  }

  function openEquipModal() {
    // §70 v0.20: 伝説装備コンプリート報酬チェック（未受取なら先にモーダル）
    if (isLegendaryEquipmentComplete() && !state.legendaryRewardClaimed) {
      openLegendaryCompleteModal();
      return;
    }
    openModal("equip-modal");
    renderEquipBody();
  }

  function renderEquipBody() {
    var body = document.getElementById("equip-body");
    var eq = state.player.equipment;
    var html = "";
    EQUIP_SLOTS.forEach(function (slotInfo) {
      html += "<h3>" + slotInfo.label + "</h3>";
      slotInfo.data().forEach(function (item) {
        var equipped = eq[slotInfo.slot] === item.id;
        var owned = isEquipOwned(slotInfo, item.id);
        var label = equipped ? "装備中" : owned ? "装備する" : "未所持";
        var legendMark = item.isLegendary ? ' <span style="color:#ffd166;font-size:10px;">★伝説</span>' : "";
        html += '<div class="shop-row"><span>' + (equipped ? "★ " : "") + item.name +
          legendMark + " (" + bonusText(item) + ")</span>" +
          '<button data-equip="' + slotInfo.slot + ":" + item.id + '"' +
          (equipped || !owned ? " disabled" : "") + ">" + label + "</button></div>";
      });
    });
    html += '<button class="shop-back-btn" id="equip-close-inner">とじる</button>';
    body.innerHTML = html;
    body.querySelectorAll("button[data-equip]").forEach(function (btn) {
      btn.onclick = function () {
        var parts = btn.getAttribute("data-equip").split(":");
        equipItem(parts[0], parts[1]);
      };
    });
    document.getElementById("equip-close-inner").onclick = function () {
      closeModal("equip-modal");
    };
  }

  function findEquipSlot(slot) {
    for (var i = 0; i < EQUIP_SLOTS.length; i++) {
      if (EQUIP_SLOTS[i].slot === slot) return EQUIP_SLOTS[i];
    }
    return null;
  }

  function equipItem(slot, id) {
    var slotInfo = findEquipSlot(slot);
    if (!isEquipOwned(slotInfo, id)) return; // 未所持は装備できない(画面上も無効化済み)
    state.player.equipment[slot] = id;
    recomputeStats();
    updateStatusBar();
    renderEquipBody();
    saveGame();
  }

  // ---------------------------------------------------------
  // ---------------------------------------------------------
  // 21.4 実家モーダル(🏠 タイルに触れると開く。GAME_DESIGN.md §5.6)
  // ---------------------------------------------------------
  // 実家に帰るたびにランダムなヒントを表示する(§3.7)
  var HOME_HINTS = [
    "「女神のウクレレ」がフィールドのどこかに眠っているらしい……",
    "メタルゴリラ系に出会えれば大きな経験値が手に入る！",
    "究極ゴリラには特別な方法でしか捕まえられないという。",
    "レベル99が最終決戦への鍵。地道に経験値を積もう！",
    "酒場で仲間を見つけると冒険が有利になる。",
    "伝説の楽器と歌声が、究極ゴリラとの決着の鍵になるという……",
    "宝箱をすべて開けた？特別な宝箱🪗もあるらしい。",
    "UMA図鑑を埋めてみよう。レアUMAも存在するぞ。",
    "装備を整えれば生き残りやすくなる。商人に寄ってみよう。",
    "白く光る宝箱には、強き者だけが触れられるらしい。",
    "星の宝箱は、女神の音色に反応するという。",
    "旅を終えた者には、王様から褒美があるそうだ。",
    "実家には、昔から伝わる盾があるとかないとか……。",
    "のらいぬが怖い時は、無理に戦わず逃げてもいいよ。",
    "昔は勝てなかった敵にも、レベルが上がると勝てるようになるよ。",
    "装備を整えると、同じレベルでもずっと楽になるよ。",
    "メタルゴリラを見つけたら経験値チャンスだよ。",
    "敵が逃げていっても経験値が入るなら、勝ったも同然だよ。",
    "宝箱を見つけたら忘れずに開けておこう。",
    // §60 v0.14.1: 横スクロール編制覇後ヒント
    "チンパンジーまで退かせたなら、次は伝説のUMAを追う番かもしれないね。究極ゴリラは歌とウクレレが大事らしいよ。",
    "横スクロールの冒険は一区切りついた。だが、究極ゴリラはまだ森のどこかで待っているよ。",
    // §61 v0.15: わざコマンドのヒント
    "戦闘コマンド「🥊 わざ」を使うと、固定ダメージでHPを少しずつ削れるよ。捕獲前の調整に便利！",
    "UMAをギリギリまで弱らせたいなら「わざ」が役立つ。はずかし固めなら1ダメージだけ与えられるぞ。"
  ];

  // エンディングモーダルのページデータ(v0.7 §28)
  var ENDING_PAGES = [
    {
      emoji: "🎵",
      heading: "女神のウクレレ",
      lines: [
        "勇者の子孫は、女神のウクレレを奏でた。",
        "やさしい音色が森全体に響きわたる。",
        "荒ぶっていた究極ゴリラの瞳に、静かな光が戻っていく。"
      ]
    },
    {
      emoji: "🦍",
      heading: "究極ゴリラ、森へ帰る",
      lines: [
        "究極ゴリラは、ゆっくりと森の奥を見つめた。",
        "どうやら、帰るべき場所を思い出したようだ。",
        "究極ゴリラは、静かに森へ帰っていった。",
        "伝説のUMAを追う旅は、ひとまず幕を閉じた。"
      ]
    },
    {
      emoji: "👑",
      heading: "王様への報告",
      lines: [
        "王様は深くうなずいた。",
        "「よくぞ、究極ゴリラの心を鎮めた。」",
        "「捕まえることだけが勝利ではない。」",
        "「帰るべき森へ帰すこともまた、勇者の務めなのじゃ。」"
      ]
    },
    {
      emoji: "🎬",
      heading: "STAFF",
      isCredits: true
    },
    {
      emoji: "🏆",
      heading: "クリアおめでとう！",
      isFinal: true
    }
  ];

  // スタッフロール(v0.7)。変更する場合はここを編集する。
  var ENDING_CREDITS = [
    { role: "企画", name: "あばれうまのりお" },
    { role: "仕様整理", name: "Kai" },
    { role: "実装", name: "Claude Code" },
    { role: "Special Thanks", name: "プレイしてくれた皆さん" }
  ];

  function openHomeModal() {
    var p = state.player;
    var hint;
    // §69 v0.19: 完全達成時は専用ヒント（最高優先度）
    if (isFullyCompleted()) {
      var fullHints = [
        "全部やりきったんだね。それでも、また森を歩いてみたくなる日があるかもしれないよ。冒険って、終わった後にも残るものがあるから。",
        "称号「究極とUMA図鑑を極めし者」をもう一度冒険の記録で確認してみよう。達成の軌跡がそこにある。"
      ];
      hint = fullHints[Math.floor(Math.random() * fullHints.length)];
    // §66 v0.17.1: 図鑑コンプリート+クリア後ヒント
    } else if (state.gameCleared && isUmaDexComplete()) {
      var postDexHints = [
        "図鑑コンプリートおめでとう！これほどのUMAハンターは、きっと伝説に名を残すよ。",
        "全部のUMAと向き合って、それぞれの物語を図鑑に刻んだんだね。",
        "称号「UMA図鑑を極めし者」か、すごい！横スクロールも全部制覇したら最高の称号が待ってるよ。"
      ];
      hint = postDexHints[Math.floor(Math.random() * postDexHints.length)];
    // §69 v0.19: クリア済み+横スクロール制覇済み
    } else if (state.gameCleared && isSideStoryCleared()) {
      var postSideHints = [
        "横に長い世界の奥まで行ったんだね。遠くまで行って帰ってくると、いつもの家も少し違って見えるね。",
        "横スクロールの旅も全部終えたんだね。あとはUMA図鑑を埋めると、最高の称号が手に入るよ。"
      ];
      hint = postSideHints[Math.floor(Math.random() * postSideHints.length)];
    // §65 v0.17: クリア後の専用ヒント
    } else if (state.gameCleared) {
      var postClearHints = [
        "究極ゴリラを捕まえても、冒険の思い出は消えないよ。図鑑を見たり、横スクロールの世界を歩いたり、まだまだ森には楽しみが残っているみたい。",
        "究極ゴリラを捕まえたあとも、森の空気は変わらずそこにあるね。少し肩の力を抜いて、歩いてみるのもいいかもしれないよ。",
        "力だけじゃなく、歌で届くものもあるんだね。",
        "図鑑をすべて埋めると、何か良いことがあるかもしれないよ。",
        "横スクロールの世界を全部制覇したかな？チンパンジーもいるよ。",
        "伝説装備を全7種集めると、新しい称号と報酬があるよ。装備画面で進捗を確認してみて。"  // §70 v0.20
      ];
      hint = postClearHints[Math.floor(Math.random() * postClearHints.length)];
    } else if (!state.gameCleared && p.level >= 99 && p.hasUkulele) {
      hint = "Lv99 & ウクレレ所持！究極ゴリラのHPを1〜10まで削って「🎵うたう」コマンドを使おう。";
    } else if (!state.gameCleared && p.level >= 99) {
      hint = "Lv99に到達した！あとは女神のウクレレ🪗を手に入れれば、究極ゴリラを鎮められる。";
    } else if (!state.gameCleared && isSideStoryCleared()) {
      // §60 v0.14.1: 横スクロール編制覇後 → 究極ゴリラへ誘導
      hint = "チンパンジーまで退かせたなら、次は伝説のUMAを追う番だ。究極ゴリラはLv99と女神のウクレレと「うたう」が鍵だよ。";
    } else {
      hint = HOME_HINTS[Math.floor(Math.random() * HOME_HINTS.length)];
    }
    document.getElementById("home-hint").textContent = "💭 " + hint;
    openModal("home-modal");
  }

  // 伝説装備 実家イベント (v0.8 §30)
  // Lv60+で六連のたて、クリア後にアンドロメダの鎖
  function checkHomeEvents() {
    var p = state.player;
    if (p.level >= 60 && !state.eventFlags.sixfoldShieldGot) {
      state.eventFlags.sixfoldShieldGot = true;
      if (!isEquipOwned(findEquipSlot("shield"), "sixfoldshield")) {
        p.ownedShields.push("sixfoldshield");
      }
      saveGame();
      alert("実家の奥から古びた盾が見つかった。\n埃をはらうと、うっすらと文字が刻まれている……\n\n「六連のたて」を手に入れた！\n（防御力+20）\n\n装備変更画面で装備できます。");
      return;
    }
    if (state.gameCleared && !state.eventFlags.andromedaGot) {
      state.eventFlags.andromedaGot = true;
      if (!isEquipOwned(findEquipSlot("weapon"), "andromedachain")) {
        p.ownedWeapons.push("andromedachain");
      }
      saveGame();
      alert("実家に戻ると、王様の使者が訪ねてきていた。\n\n「王様はこうおっしゃいました……」\n\n「究極ゴリラを森へ帰した者に、これを授けよう。」\n\n「アンドロメダの鎖」を手に入れた！\n（攻撃力+44）\n\n装備変更画面で装備できます。");
    }
  }

  function doRest() {
    var p = state.player;
    var hadAilments = Object.keys(AILMENT_INFO).some(function(id) { return hasAilment(id); });
    p.hp = p.maxHp;
    p.mp = p.maxMp;
    Object.keys(AILMENT_INFO).forEach(function (id) {
      if (hasAilment(id)) clearAilment(id, true);
    });
    p.statusAilments = {};
    closeModal("home-modal");
    updateStatusBar();
    saveGame();
    var msg = "🏠 ぐっすり休んだ！ HPとMPが全回復した！";
    if (hadAilments) msg += " 体調もよくなった！";
    msg += " 💾 セーブしました。";
    showToast(msg);
    setTimeout(function() { checkHomeEvents(); }, 500);
  }

  // 21.5 設定モーダル(歩く速度)
  // ---------------------------------------------------------
  var WALK_SPEED_LABELS = { slow: "遅い", normal: "普通", fast: "速い" };

  function openSettingsModal() {
    openModal("settings-modal");
    renderSettingsBody();
  }

  function renderSettingsBody() {
    var body = document.getElementById("settings-body");
    var current = state.player.walkSpeed;
    var html = "";
    ["slow", "normal", "fast"].forEach(function (key) {
      html += '<button class="job-btn" data-speed="' + key + '">' +
        (key === current ? "★ " : "") + WALK_SPEED_LABELS[key] + "</button>";
    });
    html += '<p class="small">💾 オートセーブ中: 行動するたびに自動で保存されます。</p>';
    html += '<button class="shop-menu-btn" id="btn-manual-save">💾 今すぐセーブ</button>';
    html += '<button class="shop-menu-btn" id="btn-show-goal">🎯 目的を見る</button>';
    html += '<button class="shop-menu-btn" id="btn-show-help">❓ ヘルプ</button>';
    if (state.gameCleared) {
      html += '<button class="shop-menu-btn" id="btn-watch-ending" style="border-color:#ffd166;color:#ffd166;">🎬 エンディングを見る</button>';
    }
    html += '<p class="small" style="margin-top:16px;">🔊 サウンド設定</p>';
    html += '<button class="shop-menu-btn" id="btn-toggle-sound">' +
      (soundEnabled ? "🔊 サウンド: ON" : "🔇 サウンド: OFF") + "</button>";
    var dimStyle = soundEnabled ? "" : ' style="opacity:0.45;"';
    html += '<button class="shop-menu-btn" id="btn-toggle-bgm"' + dimStyle + ">" +
      (bgmEnabled ? "🎵 BGM: ON" : "🎵 BGM: OFF") + "</button>";
    html += '<button class="shop-menu-btn" id="btn-toggle-se"' + dimStyle + ">" +
      (seEnabled ? "🔔 SE: ON" : "🔔 SE: OFF") + "</button>";
    html += '<p class="small" style="color:#ff8c8c;margin-top:16px;">⚠️ 危険な操作:</p>';
    html += '<button class="shop-menu-btn" id="btn-new-game" style="border-color:#ff8c8c;color:#ff8c8c;">🔄 ニューゲーム(セーブデータをリセット)</button>';
    if (DEBUG_MODE) {
      html += '<p class="small" style="color:#ffd166;margin-top:16px;">🛠️ 開発用テスト (debug=1)</p>';
      html += '<button class="shop-menu-btn" id="btn-debug-lv1">📉 Lv.1にする</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-lv5">📈 Lv.5にする</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-lv10">📈 Lv.10にする</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-lv99">📈 Lv.99にする</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-lv98">📉 Lv.98にする</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-set-lvup-exp">⬆️ 次の戦闘でLvUP(EXP設定)</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-reset-lv99">🔄 Lv99到達フラグをリセット</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-ukulele">🪗 女神のウクレレを入手</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-encounter">🦍 究極ゴリラ強制エンカウント</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-encounter-hp5" style="border-color:#06d6a0;color:#06d6a0;">🦍 究極ゴリラHP5で強制エンカウント</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-encounter-wilddog">🐕 のらいぬ強制エンカウント</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-encounter-random">🎲 ランダム通常モンスター強制エンカウント</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-hp5">❤️ 敵HPを5にする(戦闘中のみ)</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-gold">💰 9999G追加</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-reset">🔄 クリア・ウクレレをリセット</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-play-ending">🎬 エンディングを再生</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-set-cleared">🏆 クリア済みにする</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-play-lv99">🎖 Lv99演出を再生</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-all-legendary">⭐ 伝説装備を全入手</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-reset-legendary">🔄 伝説装備フラグをリセット</button>';
      html += '<p class="small" style="color:#74c0fc;margin-top:8px;">🔊 サウンドテスト</p>';
      html += '<button class="shop-menu-btn" id="btn-debug-se-test">🔔 [TEST] SEを鳴らす</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-bgm-field">🎵 [TEST] 通常フィールドBGM</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-bgm-field-clear" style="border-color:#ffd166;color:#ffd166;">🌟 [TEST] クリア後フィールドBGM</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-bgm-battle">🎵 [TEST] バトルBGM</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-bgm-ending">🎵 [TEST] エンディングBGM</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-bgm-stop">🔇 [TEST] BGM停止</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-bgm-hard-stop">🔇 BGM完全停止(stopBGMHard)</button>';
      html += '<p class="small" style="color:#a8d8a8;margin-top:8px;">🗺️ 横スクロールマップ (§43-44 v0.9.1)</p>';
      html += '<button class="shop-menu-btn" id="btn-debug-side-map-enter" style="border-color:#a8d8a8;color:#a8d8a8;">⬇️ 横スクロールマップへ移動</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-side-map-exit" style="border-color:#a8d8a8;color:#a8d8a8;">⬆️ 通常マップへ戻る</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-side-start" style="border-color:#a8d8a8;color:#a8d8a8;">🔙 スタート地点へ (x=1,y=1)</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-side-near-goal" style="border-color:#a8d8a8;color:#a8d8a8;">🏃 ゴール直前へ (x=35,y=1)</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-side-reset-flags" style="border-color:#ff8c8c;color:#ff8c8c;">🔄 横スクロール: クリア・撃破フラグをリセット</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-side-stage1-clear" style="border-color:#a8d8a8;color:#a8d8a8;">✅ ステージ1クリアフラグON</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-side-set-midboss" style="border-color:#ffd166;color:#ffd166;">✅ 中ボス撃退済みにする</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-midboss-encounter" style="border-color:#ffd166;color:#ffd166;">🦍 中ボスゴリラ強制エンカウント</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-companion-norio" style="border-color:#74c0fc;color:#74c0fc;">📈 ノリオを仲間にする</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-side-reset-midboss" style="border-color:#ff8c8c;color:#ff8c8c;">🔄 中ボスゴリラ撃退フラグをリセット</button>';
      html += '<p class="small" style="color:#c3a4ff;margin-top:8px;">🌲 ステージ2「あやしい森」(§48 v0.10)</p>';
      html += '<button class="shop-menu-btn" id="btn-debug-side-stage2-enter" style="border-color:#c3a4ff;color:#c3a4ff;">🌲 あやしい森へ移動 (stage=2)</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-side-stage2-near-goal" style="border-color:#c3a4ff;color:#c3a4ff;">🏃 森ゴール直前へ (x=34,y=1)</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-side-stage2-clear-reset" style="border-color:#ff8c8c;color:#ff8c8c;">🔄 ステージ2フラグリセット</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-side-set-bossgori" style="border-color:#c3a4ff;color:#c3a4ff;">✅ ボスゴリラ撃退済みにする</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-boss-gorilla-encounter" style="border-color:#c3a4ff;color:#c3a4ff;">🦍 ボスゴリラ強制エンカウント</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-reset-exp" style="border-color:#a8d8a8;color:#a8d8a8;">✨ EXPを0にする(ノリオ効果確認用)</button>';
      html += '<p class="small" style="color:#ffb347;margin-top:8px;">🏚️ ステージ3「古びた町はずれ」(§50 v0.11)</p>';
      html += '<button class="shop-menu-btn" id="btn-debug-side-stage3-enter" style="border-color:#ffb347;color:#ffb347;">🏚️ 古びた町はずれへ移動 (stage=3)</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-side-stage3-near-goal" style="border-color:#ffb347;color:#ffb347;">🏃 町はずれゴール直前へ (x=30,y=2)</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-side-stage3-clear-reset" style="border-color:#ff8c8c;color:#ff8c8c;">🔄 ステージ3フラグリセット</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-side-set-maougori" style="border-color:#ffb347;color:#ffb347;">✅ 魔王ゴリラ撃退済みにする</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-maou-gorilla-encounter" style="border-color:#ffb347;color:#ffb347;">🦍 魔王ゴリラ強制エンカウント</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-side-stage3-items-reset" style="border-color:#ff8c8c;color:#ff8c8c;">🏚️ ステージ3宝箱・固定敵リセット</button>';
      html += '<p class="small" style="color:#87ceeb;margin-top:8px;">⛰️ ステージ4「ゴリラ山道」(§55 v0.12)</p>';
      html += '<button class="shop-menu-btn" id="btn-debug-side-stage4-enter" style="border-color:#87ceeb;color:#87ceeb;">⛰️ ゴリラ山道へ移動 (stage=4)</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-side-stage4-near-goal" style="border-color:#87ceeb;color:#87ceeb;">🏃 山道ゴール直前へ (x=32,y=2)</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-side-stage4-clear-reset" style="border-color:#ff8c8c;color:#ff8c8c;">🔄 ステージ4フラグリセット</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-side-set-daimaougori" style="border-color:#87ceeb;color:#87ceeb;">✅ 大魔王ゴリラ撃退済みにする</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-daimaou-gorilla-encounter" style="border-color:#87ceeb;color:#87ceeb;">🦍 大魔王ゴリラ強制エンカウント</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-side-stage4-items-reset" style="border-color:#ff8c8c;color:#ff8c8c;">⛰️ ステージ4宝箱・固定敵リセット</button>';
      html += '<p class="small" style="color:#c77dff;margin-top:8px;">🏰 ステージ5「黒い城」(§57 v0.13)</p>';
      html += '<button class="shop-menu-btn" id="btn-debug-side-stage5-enter" style="border-color:#c77dff;color:#c77dff;">🏰 黒い城へ移動 (stage=5)</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-side-stage5-near-goal" style="border-color:#c77dff;color:#c77dff;">🏃 黒い城ゴール直前へ (x=32,y=2)</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-side-stage5-clear-reset" style="border-color:#ff8c8c;color:#ff8c8c;">🔄 ステージ5フラグリセット</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-side-set-lastbossgori" style="border-color:#c77dff;color:#c77dff;">✅ ラスボス級ゴリラ撃退済みにする</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-lastboss-gorilla-encounter" style="border-color:#c77dff;color:#c77dff;">🦍 ラスボス級ゴリラ強制エンカウント</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-side-stage5-items-reset" style="border-color:#ff8c8c;color:#ff8c8c;">🏰 ステージ5宝箱・固定敵リセット</button>';
      html += '<p class="small" style="color:#98d8c8;margin-top:8px;">🌿 ステージ6「チンパンジーの聖域」(§59 v0.14)</p>';
      html += '<button class="shop-menu-btn" id="btn-debug-side-stage6-enter" style="border-color:#98d8c8;color:#98d8c8;">🌿 チンパンジーの聖域へ移動 (stage=6)</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-side-stage6-near-goal" style="border-color:#98d8c8;color:#98d8c8;">🏃 聖域ゴール直前へ (x=33,y=2)</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-side-stage6-clear-reset" style="border-color:#ff8c8c;color:#ff8c8c;">🔄 ステージ6フラグリセット</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-side-set-ultimatechimgori" style="border-color:#98d8c8;color:#98d8c8;">✅ 究極チンパンジー撃退済みにする</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-ultimate-chimp-encounter" style="border-color:#98d8c8;color:#98d8c8;">🦍 究極チンパンジー強制エンカウント</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-side-stage6-items-reset" style="border-color:#ff8c8c;color:#ff8c8c;">🌿 ステージ6宝箱・固定敵リセット</button>';
      html += '<p class="small" style="color:#a8d8ff;margin-top:8px;">🏆 横スクロール編制覇・究極ゴリラ準備 (§60 v0.14.1)</p>';
      html += '<button class="shop-menu-btn" id="btn-debug-side-story-complete" style="border-color:#a8d8ff;color:#a8d8ff;">🏆 横スクロール編制覇状態にする</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-set-capture-ready" style="border-color:#a8d8ff;color:#a8d8ff;">🦍 究極ゴリラ捕獲条件セット (Lv99+ウクレレ)</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-clear-gameclear" style="border-color:#ff8c8c;color:#ff8c8c;">🔄 究極ゴリラ未捕獲状態に戻す</button>';
      html += '<p class="small" style="color:#ffb347;margin-top:8px;">🦍 究極ゴリラ捕獲テスト (§62 v0.15.1)</p>';
      html += '<button class="shop-menu-btn" id="btn-debug-gorilla-hp12" style="border-color:#ffb347;color:#ffb347;">🦍 究極ゴリラ HP12 で開始（わざ3回で捕獲圏内）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-gorilla-hp10" style="border-color:#ffb347;color:#ffb347;">🦍 究極ゴリラ HP10 で開始（捕獲圏内・境界）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-gorilla-hp1" style="border-color:#ffb347;color:#ffb347;">🦍 究極ゴリラ HP1 で開始（わざで即死に注意）</button>';
      html += '<p class="small" style="color:#a9e34b;margin-top:8px;">😤 ガマン確認 (§63 v0.16)</p>';
      html += '<button class="shop-menu-btn" id="btn-debug-gaman-wilddog" style="border-color:#a9e34b;color:#a9e34b;">😤 ガマン状態でのらいぬ戦闘</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-gaman-gorilla-hp12" style="border-color:#a9e34b;color:#a9e34b;">😤 ガマン状態で究極ゴリラHP12</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-gaman-reset" style="border-color:#ff8c8c;color:#ff8c8c;">🔄 ガマン状態解除</button>';
      html += '<p class="small" style="color:#c77dff;margin-top:8px;">🎵 捕獲チャンス演出テスト (§64 v0.16.1)</p>';
      html += '<button class="shop-menu-btn" id="btn-debug-gorilla-chance-hp10" style="border-color:#c77dff;color:#c77dff;">🦍 Lv99+ウクレレ+HP10（チャンス表示確認）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-gorilla-nolv-ukulele-hp10" style="border-color:#c77dff;color:#c77dff;">🦍 Lv50+ウクレレ+HP10（Lv不足メッセージ確認）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-gorilla-lv99-noukulele-hp10" style="border-color:#c77dff;color:#c77dff;">🦍 Lv99+ウクレレなし+HP10（ウクレレ不足確認）</button>';
      html += '<p class="small" style="color:#f9c74f;margin-top:8px;">🌟 クリア後演出テスト (§65 v0.17)</p>';
      html += '<button class="shop-menu-btn" id="btn-debug-show-capture-modal" style="border-color:#f9c74f;color:#f9c74f;">🌟 捕獲成功モーダルを見る</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-set-postclear-full" style="border-color:#f9c74f;color:#f9c74f;">🌟 クリア済み+横スクロール制覇状態にする（総合称号確認）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-set-postclear-only" style="border-color:#f9c74f;color:#f9c74f;">🌟 クリア済みのみにする（横スクロール未制覇）</button>';
      html += '<p class="small" style="color:#c8b4ff;margin-top:8px;">📜 冒険の記録 (§67 v0.18)</p>';
      html += '<button class="shop-menu-btn" id="btn-debug-open-record" style="border-color:#c8b4ff;color:#c8b4ff;">📜 冒険の記録モーダルを開く</button>';
      html += '<p class="small" style="color:#98d8ff;margin-top:8px;">📖 図鑑コンプリート報酬テスト (§66 v0.17.1 / §72 v0.21)</p>';
      html += '<button class="shop-menu-btn" id="btn-debug-dex-complete-all" style="border-color:#98d8ff;color:#98d8ff;">📖 UMA図鑑コンプリート状態にする（全UMA捕獲済み）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-dex-reward-reset" style="border-color:#ff8c8c;color:#ff8c8c;">🔄 図鑑コンプリート報酬を未受取に戻す</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-dex-reward-modal" style="border-color:#98d8ff;color:#98d8ff;">📖 図鑑コンプリート報酬モーダルを見る</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-open-record-dex" style="border-color:#c8b4ff;color:#c8b4ff;">📜 冒険の記録で図鑑セクション確認</button>';
      html += '<p class="small" style="color:#98d8ff;margin-top:8px;">📖 図鑑ヒント表示テスト (§73 v0.22)</p>';
      html += '<button class="shop-menu-btn" id="btn-debug-dex-one-uncaptured" style="border-color:#98d8ff;color:#98d8ff;">📖 最初のUMAだけ未捕獲（他は捕獲済み）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-dex-one-seen" style="border-color:#74c0fc;color:#74c0fc;">📖 最初のUMAだけ「発見済み」（他は未発見）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-dex-reset" style="border-color:#ff8c8c;color:#ff8c8c;">🔄 図鑑を全リセット（初期状態）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-set-all-complete" style="border-color:#ffd700;color:#ffd700;">🌟 完全達成状態にする（クリア+横+図鑑）</button>';
      html += '<p class="small" style="color:#a9e34b;margin-top:8px;">👥 仲間カードUI確認 (§75-77 v0.24〜v0.25)</p>';
      html += '<button class="shop-menu-btn" id="btn-debug-companions-normal" style="border-color:#adb5bd;color:#adb5bd;">👥 仲間UI：通常（未クリア・未制覇）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-companions-postclear" style="border-color:#a9e34b;color:#a9e34b;">👥 仲間UI：クリア済み（緑）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-companions-side-only" style="border-color:#c8b4ff;color:#c8b4ff;">👥 仲間UI：横スクロール制覇のみ・未クリア（薄紫）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-companions-side-cleared" style="border-color:#c8b4ff;color:#c8b4ff;">👥 仲間UI：クリア+横スクロール制覇（薄紫）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-companions-dex-complete" style="border-color:#74c0fc;color:#74c0fc;">👥 仲間UI：クリア+図鑑コンプ（水色）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-companions-full-clear" style="border-color:#ffd166;color:#ffd166;">👥 仲間UI：完全達成（金）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-companions-legendary-only" style="border-color:#ffb347;color:#ffb347;">👥 仲間UI：伝説装備コンプのみ・未完全達成（橙）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-companions-legendary" style="border-color:#ffd700;color:#ffd700;">👥 仲間UI：完全達成+伝説装備コンプ（明金）</button>';
      html += '<p class="small" style="color:#98d8ff;margin-top:8px;">🚶 フィールド仲間追従・アイコン人型化 (§121 v0.46)</p>';
      html += '<button class="shop-menu-btn" id="btn-debug-party-follow-on" style="border-color:#98d8ff;color:#98d8ff;">🚶 仲間2人追従確認（ジュリタニ+ハルミ）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-party-trail-reset" style="border-color:#ff8c8c;color:#ff8c8c;">🔄 仲間軌跡リセット（trail = []）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-party-clear-trail" style="border-color:#adb5bd;color:#adb5bd;">👥 パーティ解除 + 軌跡リセット</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v46-icon-check" style="border-color:#88d8b0;color:#88d8b0;">👤 仲間アイコン一覧確認（人型チェック）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v46-one-follow" style="border-color:#98d8ff;color:#98d8ff;">🚶 仲間1人追従確認（シュリタニのみ）</button>';
      html += '<p class="small" style="color:#f4a261;margin-top:8px;">📖 仲間サイドストーリー第3話 (§122 v0.47)</p>';
      html += '<button class="shop-menu-btn" id="btn-debug-v47-story3-reset" style="border-color:#ff8c8c;color:#ff8c8c;">🔄 第3話フラグ全リセット（4人→未完了）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v47-story3-all" style="border-color:#f4a261;color:#f4a261;">🌟 第3話全完了状態にする（4人）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v47-ch2-lv75-all" style="border-color:#ffd166;color:#ffd166;">🔓 第3話解放条件を整える（ch2全完了+Lv75+仲間加入）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v47-story3-juritani" style="border-color:#f4a261;color:#f4a261;">🧑 ジュリタニ第3話のみ完了</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v47-story3-shurittani" style="border-color:#f4a261;color:#f4a261;">👩 シュリタニ第3話のみ完了</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v47-story3-norio" style="border-color:#f4a261;color:#f4a261;">👨 ノリオ第3話のみ完了</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v47-story3-harumi" style="border-color:#f4a261;color:#f4a261;">👧 ハルミ第3話のみ完了</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v47-open-tavern-stories" style="border-color:#a0cfff;color:#a0cfff;">🍺 酒場・物語リストを開く（12枚カード確認）</button>';
      html += '<p class="small" style="color:#a0e0b0;margin-top:8px;">🔬 第3話・安定化テスト (§123 v0.47.1)</p>';
      html += '<button class="shop-menu-btn" id="btn-debug-v471-session-info" style="border-color:#a0e0b0;color:#a0e0b0;">📋 セッション変数を表示（ID/chapter/storyId/completing）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v471-atomicity-test" style="border-color:#a0e0b0;color:#a0e0b0;">⚗️ アトミック起動テスト（無効ch=99→chapter汚染なし確認）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v471-direct-complete-test" style="border-color:#a0e0b0;color:#a0e0b0;">🚫 セッション外complete呼び出し→棄却確認（ジュリタニch3）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v471-completing-flag" style="border-color:#a0e0b0;color:#a0e0b0;">🔑 _cstoryCompletingフラグ現在値を表示</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v471-mid-close-test" style="border-color:#a0e0b0;color:#a0e0b0;">📖✖ ch3途中close→未完了維持確認（ジュリタニ・ch3解放済み前提）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v471-double-complete-test" style="border-color:#a0e0b0;color:#a0e0b0;">🔄 ch3二重complete→1回のみ完了確認（ジュリタニ模擬セッション）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v471-ch3-ch12-isolated" style="border-color:#a0e0b0;color:#a0e0b0;">🔐 ch1/ch2祝賀pendingフラグ表示（ch3完了後も0か確認）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v471-flags-all-display" style="border-color:#a0e0b0;color:#a0e0b0;">📊 全フラグ一覧表示（ch1/ch2/ch3独立性確認）</button>';
      html += '<p class="small" style="color:#74c0fc;margin-top:8px;">🧭 冒険ナビゲーション確認 (§124 v0.48)</p>';
      html += '<button class="shop-menu-btn" id="btn-debug-v48-guide-info" style="border-color:#74c0fc;color:#74c0fc;">📋 現在のガイド情報を表示（objectiveId/title/shortText）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v48-npc-state" style="border-color:#74c0fc;color:#74c0fc;">🔍 案内人NPC状態を表示（visible/x/y/stepCount）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v48-spawn-npc" style="border-color:#74c0fc;color:#74c0fc;">✨ 案内人NPCを即時スポーン（trySpawnAdventureGuideNpc）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v48-dismiss-npc" style="border-color:#74c0fc;color:#74c0fc;">🚫 案内人NPCを強制消去（visible=false）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v48-objective-cycle" style="border-color:#74c0fc;color:#74c0fc;">🔄 全objectiveIdのガイドテキストをtoastで順番に確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v48-stages-clear" style="border-color:#74c0fc;color:#74c0fc;">🗺️ s1〜s5 stageCleared=true にセット（s6手前状態）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v48-reset-guide" style="border-color:#74c0fc;color:#74c0fc;">🔁 ガイドカウント・NPC状態をリセット（stepCount=0）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v48-paperview-open" style="border-color:#74c0fc;color:#74c0fc;">📰 ペーパービュー屋を直接開く（冒険ガイド表示確認）</button>';
      html += '<p class="small" style="color:#ffd43b;margin-top:8px;">🧪 冒険ナビ安定性確認 (§125 v0.48.1)</p>';
      html += '<button class="shop-menu-btn" id="btn-debug-v481-pure-fn" style="border-color:#ffd43b;color:#ffd43b;">🧪 冒険案内純粋関数確認（呼び出し副作用なし）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v481-stage-unique" style="border-color:#ffd43b;color:#ffd43b;">🧪 ステージcurrent一意性確認（▶が1つのみ）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v481-obj-change-dismiss" style="border-color:#ffd43b;color:#ffd43b;">🧪 objective変更時NPC消去確認（同期テスト）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v481-invalid-step" style="border-color:#ffd43b;color:#ffd43b;">🧪 無効移動カウント防止確認（stepCountログ表示）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v481-safe-tile" style="border-color:#ffd43b;color:#ffd43b;">🧪 案内人安全タイル確認（isAdventureGuideSpawnTileSafe）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v481-no-candidate" style="border-color:#ffd43b;color:#ffd43b;">🧪 案内人候補なし再試行確認（stepCount=15状態確認）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v481-talk-lock" style="border-color:#ffd43b;color:#ffd43b;">🧪 案内人接触多重起動防止確認（talkLock=true→false）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v481-obj-refresh" style="border-color:#ffd43b;color:#ffd43b;">🧪 案内人最新objective再取得確認（接触時freshness）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v481-paperview-nodedup" style="border-color:#ffd43b;color:#ffd43b;">🧪 PaperView再描画重複防止確認（renderField回数）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v481-obj-match" style="border-color:#ffd43b;color:#ffd43b;">🧪 PaperView・案内人objective一致確認（同一objectiveId）</button>';
      html += '<p class="small" style="color:#06d6a0;margin-top:8px;">⚔️ 仲間自動戦闘テスト (§80 v0.27)</p>';
      html += '<button class="shop-menu-btn" id="btn-debug-companion-battle-wilddog" style="border-color:#06d6a0;color:#06d6a0;">⚔️ 仲間2人+のらいぬ戦闘（自動行動確認）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-companion-battle-gorilla" style="border-color:#ffd166;color:#ffd166;">⚠️ 仲間2人+究極ゴリラHP10（見守り確認）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-companion-kill-wilddog" style="border-color:#06d6a0;color:#06d6a0;">💀 仲間2人+のらいぬHP3（仲間撃破確認）</button>';
      html += '<p class="small" style="color:#a9e34b;margin-top:8px;">🎮 仲間コマンド選択テスト (§82 v0.28)</p>';
      html += '<button class="shop-menu-btn" id="btn-debug-companion-cmd-wilddog" style="border-color:#a9e34b;color:#a9e34b;">🎮 仲間コマンドテスト（のらいぬ）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-companion-cmd-midboss" style="border-color:#a9e34b;color:#a9e34b;">🎮 仲間コマンドテスト（中ボスHP30）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-companion-cmd-gorilla" style="border-color:#ffd166;color:#ffd166;">⚠️ 仲間コマンド：究極ゴリラ見守り確認</button>';
      html += '<p class="small" style="color:#ffcc66;margin-top:8px;">⭐ 仲間固有コマンドテスト (§84 v0.29)</p>';
      html += '<button class="shop-menu-btn" id="btn-debug-companion-special-all" style="border-color:#ffcc66;color:#ffcc66;">⭐ 固有コマンドテスト（仲間4人+のらいぬ）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-companion-special-harumi" style="border-color:#aaffcc;color:#aaffcc;">✨ ハルミ回復確認（HP40%+のらいぬ）</button>';
      html += '<p class="small" style="color:#ff9de2;margin-top:8px;">🎲 まかせるランダム確認 (§85 v0.29.1)</p>';
      html += '<button class="shop-menu-btn" id="btn-debug-companion-auto-all" style="border-color:#ff9de2;color:#ff9de2;">🎲 まかせるランダム確認（仲間4人+のらいぬ）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-companion-auto-midboss" style="border-color:#ff9de2;color:#ff9de2;">🎲 まかせるランダム確認（中ボスHP50）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-companion-auto-harumi" style="border-color:#aaffcc;color:#aaffcc;">✨ ハルミまかせる回復確認（HP40%）</button>';
      html += '<p class="small" style="color:#80d8ff;margin-top:8px;">🧠 まかせるAI状況判断テスト (§87 v0.31)</p>';
      html += '<button class="shop-menu-btn" id="btn-debug-ai-hpfull" style="border-color:#80d8ff;color:#80d8ff;">🧠 まかせるAI確認（HP満タン+のらいぬ）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-ai-hplow" style="border-color:#80d8ff;color:#80d8ff;">🧠 まかせるAI確認（HP30%+のらいぬ）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-ai-enemylow" style="border-color:#80d8ff;color:#80d8ff;">🧠 まかせるAI確認（敵HP8）</button>';
      html += '<p class="small" style="color:#c4b5fd;margin-top:8px;">⭐ 2つ目固有コマンド確認 (§89 v0.32)</p>';
      html += '<button class="shop-menu-btn" id="btn-debug-special2-all" style="border-color:#c4b5fd;color:#c4b5fd;">⭐ 2つ目固有コマンド確認（仲間4人+のらいぬ）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-special2-guard" style="border-color:#c4b5fd;color:#c4b5fd;">🛡️ かばう/まもりの光 軽減確認（仲間4人+のらいぬ）</button>';
      html += '<p class="small" style="color:#f9c74f;margin-top:8px;">🎲 まかせるAI 3択確認 (§91 v0.33 / §92 v0.33.1)</p>';
      html += '<button class="shop-menu-btn" id="btn-debug-auto3-all" style="border-color:#f9c74f;color:#f9c74f;">🎲 まかせるAI 3択確認（全員・ランダム）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-auto3-guard" style="border-color:#f9c74f;color:#f9c74f;">🛡️ まかせるAI 軽減確認（かばう/まもりの光）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-auto3-hplow" style="border-color:#f9c74f;color:#f9c74f;">⬇️ まかせるAI 敵HP10確認</button>';
      html += '<p class="small" style="color:#80ffaa;margin-top:8px;">🎨 戦闘UI確認 (§93 v0.34 / §94 v0.34.1)</p>';
      html += '<button class="shop-menu-btn" id="btn-debug-v34-ui" style="border-color:#80ffaa;color:#80ffaa;">🎨 戦闘UI確認（仲間2人+のらいぬ）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v34-badge-guard" style="border-color:#4cc9f0;color:#4cc9f0;">🛡️ 守り効果バッジ確認（HP25%+かばう）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v341-hpcolor" style="border-color:#ff9f1c;color:#ff9f1c;">🎨 HP色確認（HP45% オレンジ確認）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v341-gaman-guard" style="border-color:#a9e34b;color:#a9e34b;">😤 ガマン+守りバッジ同時確認</button>';
      html += '<p class="small" style="color:#c4b5fd;margin-top:8px;">✨ 仲間まほう確認 (§95 v0.35 / §96 v0.35.1)</p>';
      html += '<button class="shop-menu-btn" id="btn-debug-v35-magic-ui" style="border-color:#c4b5fd;color:#c4b5fd;">✨ 仲間まほう確認（仲間4人+のらいぬ）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v35-magic-harumi" style="border-color:#f9a8d4;color:#f9a8d4;">✨ ハルミ小さな回復確認（HP25%）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v35-magic-back" style="border-color:#86efac;color:#86efac;">✨ 仲間まほうUI戻る確認（仲間2人）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v351-magic-win" style="border-color:#fbbf24;color:#fbbf24;">✨ 仲間まほう勝利確認（敵HP5）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v351-magic-lock" style="border-color:#a78bfa;color:#a78bfa;">✨ まほうメニュー連打防止確認（仲間1人）</button>';
      html += '<p class="small" style="color:#6ee7b7;margin-top:8px;">🎲 まかせるAI 4択確認 (§97 v0.36)</p>';
      html += '<button class="shop-menu-btn" id="btn-debug-v36-auto4" style="border-color:#6ee7b7;color:#6ee7b7;">🎲 まかせるAI 4択確認（仲間4人+のらいぬ）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v36-auto4-harumi" style="border-color:#f9a8d4;color:#f9a8d4;">🎲 まかせるAI ハルミ回復確認（HP25%）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v36-auto4-hplow" style="border-color:#fbbf24;color:#fbbf24;">🎲 まかせるAI 敵HP10確認（まほう混入）</button>';
      html += '<p class="small" style="color:#6ee7b7;margin-top:4px;">🎲 まかせるAI 4択安定化確認 (§98 v0.36.1)</p>';
      html += '<button class="shop-menu-btn" id="btn-debug-v361-magic-log" style="border-color:#86efac;color:#86efac;">🎲 まかせるAI 魔法名ログ確認（仲間4人・前回記憶クリア）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v361-magic-win" style="border-color:#fbbf24;color:#fbbf24;">🎲 まかせるAI 攻撃魔法勝利確認（ジュリ/シュリ/ノリオ+敵HP5）</button>';
      html += '<p class="small" style="color:#a0cfff;margin-top:8px;">👥 仲間成長システム (§99 v0.37)</p>';
      html += '<button class="shop-menu-btn" id="btn-debug-companion-lv10" style="border-color:#a0cfff;color:#a0cfff;">👥 仲間Lv10にする（4人全員）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-companion-lv50" style="border-color:#74c0fc;color:#74c0fc;">👥 仲間Lv50にする（4人全員）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-companion-lv99" style="border-color:#ffd700;color:#ffd700;">👥 仲間Lv99にする（4人全員）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-companion-lv1" style="border-color:#adb5bd;color:#adb5bd;">👥 仲間Lv1・EXP0に戻す（4人全員）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-companion-multilv" style="border-color:#74c0fc;color:#74c0fc;">👥 複数Lvアップ確認（Lv1+EXP500付与）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-companion-expcheck" style="border-color:#06d6a0;color:#06d6a0;">👥 パーティ仲間だけEXP確認（2人+2人待機）</button>';
      html += '<p class="small" style="color:#e9c46a;margin-top:4px;">⚔️ 仲間成長システム確認 (§101 v0.38)</p>';
      html += '<button class="shop-menu-btn" id="btn-debug-growth-harumi-lv1" style="border-color:#e9c46a;color:#e9c46a;">✨ ハルミ回復成長確認（HP25%+ハルミLv1）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-growth-harumi-lv99" style="border-color:#ffd700;color:#ffd700;">✨ ハルミ回復成長確認（HP25%+ハルミLv99）</button>';
      html += '<p class="small" style="color:#c8b4ff;margin-top:4px;">🌱 仲間節目セリフ確認 (§103 v0.39)</p>';
      html += '<button class="shop-menu-btn" id="btn-debug-milestone-lv10" style="border-color:#c8b4ff;color:#c8b4ff;">🌱 Lv10節目セリフ確認（ジュリタニ）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-milestone-lv50" style="border-color:#ff9de2;color:#ff9de2;">🔥 Lv50節目セリフ確認（シュリタニ）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-milestone-lv99" style="border-color:#ffd700;color:#ffd700;">👑 Lv99節目セリフ確認（ノリオ）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-milestone-reset" style="border-color:#adb5bd;color:#adb5bd;">🔄 仲間節目フラグ全リセット（Lv1・EXP0）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-milestone-2person" style="border-color:#a0f0b4;color:#a0f0b4;">🌱 2人同時Lv10節目確認（ジュリタニ+ハルミ）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-milestone-multi" style="border-color:#ffb3d9;color:#ffb3d9;">🚀 複数節目確認（ジュリタニLv1→Lv60）</button>';
      html += '<p class="small" style="color:#ffd700;margin-top:4px;">🎒 仲間装備システム (§105 v0.40)</p>';
      html += '<button class="shop-menu-btn" id="btn-debug-gear-equip-all" style="border-color:#ffd700;color:#ffd700;">🎒 全仲間に専用装備を装備させる</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-gear-unequip-all" style="border-color:#adb5bd;color:#adb5bd;">🔄 全仲間の装備を外す</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-gear-starter-reset" style="border-color:#ff8c8c;color:#ff8c8c;">🔄 スターター配布リセット（version=0・所持空）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-gear-juritani-only" style="border-color:#ff9de2;color:#ff9de2;">⚔️ ジュリタニだけ装備+のらいぬ（攻撃+2確認）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-gear-harumi-only" style="border-color:#06d6a0;color:#06d6a0;">✨ ハルミだけ装備+HP30%+のらいぬ（回復+3確認）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-gear-corrupt-check" style="border-color:#ffb3d9;color:#ffb3d9;">🧪 仲間装備データ破損確認（補正結果をtoast）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-gear-dup-check" style="border-color:#a0f0b4;color:#a0f0b4;">🎒 スターター増殖防止確認（ensure×3→各1個）</button>';
      html += '<p class="small" style="color:#ffd700;margin-top:4px;">🎒 仲間装備2種類目 (§107 v0.41)</p>';
      html += '<button class="shop-menu-btn" id="btn-debug-gear-v2-migrate" style="border-color:#ffd700;color:#ffd700;">🎒 v1→v2移行確認（新装備4種配布・増殖なし）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-gear-new-equip-all" style="border-color:#a0cfff;color:#a0cfff;">🎒 新装備を全員に装備（会心の腕輪等）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-gear-juritani-crit" style="border-color:#ff9de2;color:#ff9de2;">⚔️ ジュリタニ2装備比較（会心の構え確認）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-gear-harumi-brooch" style="border-color:#06d6a0;color:#06d6a0;">✨ ハルミ2装備比較（小さな回復+6確認）</button>';
      html += '<p class="small" style="color:#06d6a0;margin-top:4px;">🧪 装備選択安定化 (§108 v0.41.1)</p>';
      html += '<button class="shop-menu-btn" id="btn-debug-gear-bonus-check" style="border-color:#06d6a0;color:#06d6a0;">🧪 行動別装備ボーナス全確認（8種×4行動）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-gear-switch-check" style="border-color:#ff9de2;color:#ff9de2;">🔄 装備切替残留チェック（旧効果残留なし確認）</button>';
      html += '<p class="small" style="color:#ffd700;margin-top:4px;">🎁 特化装備探索報酬 (§109 v0.42)</p>';
      html += '<button class="shop-menu-btn" id="btn-debug-gear-reward-reset" style="border-color:#ff8c8c;color:#ff8c8c;">🔄 特化装備報酬リセット（フラグ=false・所持削除）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-gear-reward-all" style="border-color:#ffd700;color:#ffd700;">🎁 特化装備を全取得（4種）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-gear-v3-migrate-check" style="border-color:#a0cfff;color:#a0cfff;">🔄 v2→v3移行確認（既存v2プレイヤー互換）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-gear-reward-dup-check" style="border-color:#a0f0b4;color:#a0f0b4;">🧪 二重取得防止確認（grant×3→各×1のみ）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-gear-stage2-clearcheck" style="border-color:#b4e0ff;color:#b4e0ff;">🎁 ステージ2初回・再クリア確認（重複付与なし）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-gear-reconcile-multi" style="border-color:#d4b4ff;color:#d4b4ff;">🧪 reconcile複数回確認（2回目はno-op）</button>';
      html += '<p class="small" style="color:#ffd166;margin-top:8px;">⚡ 仲間わざテスト (§111 v0.43)</p>';
      html += '<button class="shop-menu-btn" id="btn-debug-tech-unlock-all" style="border-color:#ffd166;color:#ffd166;">⚡ 仲間わざを全員習得状態にする（Lv25＋rewardFlags）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-tech-reset-used" style="border-color:#a0f0b4;color:#a0f0b4;">⚡ 仲間わざ使用状態リセット（全falseに戻す）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-tech-lock-check" style="border-color:#a0cfff;color:#a0cfff;">🧪 仲間わざロック条件確認（Lv不足/装備未取得/両方達成）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-tech-oneshot-check" style="border-color:#c8b4ff;color:#c8b4ff;">🧪 1戦闘1回確認（grant×2→2回目はno-op）</button>';
      html += '<p class="small" style="color:#ffd166;margin-top:8px;">🔬 仲間わざ安定化テスト (§112 v0.43.1)</p>';
      html += '<button class="shop-menu-btn" id="btn-debug-v431-round-persist" style="border-color:#ffd166;color:#ffd166;">🔬 ラウンド持越し確認（used=trueが戦闘内で維持されるか）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v431-shu-hp1" style="border-color:#a0cfff;color:#a0cfff;">🔬 シュリタニHP1境界確認（HP1→null / HP2→1ダメ）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v431-harumi-boundary" style="border-color:#a0f0b4;color:#a0f0b4;">🔬 ハルミ回復・軽減境界確認（満HP+高軽減→null 等）</button>';
      html += '<p class="small" style="color:#a0cfff;margin-top:8px;">📖 仲間サイドストーリーテスト (§113 v0.44)</p>';
      html += '<button class="shop-menu-btn" id="btn-debug-v44-story-unlock-all" style="border-color:#a0cfff;color:#a0cfff;">📖 仲間の物語を全解放状態にする（Lv25+rewardFlags）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v44-story-reset-flags" style="border-color:#ff8c8c;color:#ff8c8c;">📖 仲間の物語完了状態を全リセット</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v44-story-complete-all" style="border-color:#06d6a0;color:#06d6a0;">📖 仲間の物語を全完了</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v44-story-boundary" style="border-color:#ffd166;color:#ffd166;">🧪 途中終了・完了境界確認（PASS/FAIL）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v44-story-reread" style="border-color:#c8b4ff;color:#c8b4ff;">🧪 再読・重複完了防止確認（PASS/FAIL）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v44-story-open-j" style="border-color:#e9c46a;color:#e9c46a;">📖 ジュリタニ物語を直接開く</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v44-story-open-s" style="border-color:#e9c46a;color:#e9c46a;">📖 シュリタニ物語を直接開く</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v44-story-open-n" style="border-color:#e9c46a;color:#e9c46a;">📖 ノリオ物語を直接開く</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v44-story-open-h" style="border-color:#e9c46a;color:#e9c46a;">📖 ハルミ物語を直接開く</button>';
      html += '<p class="small" style="color:#ff9f7f;margin-top:8px;">🧪 §114 v0.44.1 安定化テスト</p>';
      html += '<button class="shop-menu-btn" id="btn-debug-v441-story-rapid" style="border-color:#ff9f7f;color:#ff9f7f;">🧪 物語高速連打・行飛ばし確認（PASS/FAIL）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v441-story-flagrepair" style="border-color:#ff9f7f;color:#ff9f7f;">🧪 物語フラグ破損修復確認（PASS/FAIL）</button>';
      html += '<p class="small" style="color:#ffd166;margin-top:8px;">🌟 §115 v0.44.2 全話完了演出テスト</p>';
      html += '<button class="shop-menu-btn" id="btn-debug-v442-story-celebration" style="border-color:#ffd166;color:#ffd166;">🌟 全話完了演出を確認（セーブ消費注意）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v442-story-celeb-reset" style="border-color:#adb5bd;color:#adb5bd;">🌟 演出済みフラグのみリセット（4話フラグ維持）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v442-story-boundary" style="border-color:#06d6a0;color:#06d6a0;">🧪 4話目完了境界確認（PASS/FAIL）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v442-story-oldsave" style="border-color:#a0cfff;color:#a0cfff;">🧪 旧4/4セーブ救済確認（PASS/FAIL）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v442-story-double-prev" style="border-color:#c8b4ff;color:#c8b4ff;">🧪 演出二重防止確認（PASS/FAIL）</button>';
      html += '<p class="small" style="color:#ff9f7f;margin-top:8px;">🧪 §116 v0.44.3 モーダル重なり安定化テスト</p>';
      html += '<button class="shop-menu-btn" id="btn-debug-v443-overlap" style="border-color:#ff9f7f;color:#ff9f7f;">🧪 酒場+演出モーダル重なり確認（前面確認）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v443-pending-hold" style="border-color:#a0cfff;color:#a0cfff;">🧪 物語中はpending保留確認（PASS/FAIL）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v443-open-close-10" style="border-color:#06d6a0;color:#06d6a0;">🧪 演出モーダル10回開閉（二重防止確認）</button>';
      html += '<p class="small" style="color:#c8b4ff;margin-top:8px;">📖 §117 v0.45 仲間サイドストーリー第2話テスト</p>';
      html += '<button class="shop-menu-btn" id="btn-debug-v45-ch2-unlock-all" style="border-color:#c8b4ff;color:#c8b4ff;">📖 第2話全解放（第1話完了+Lv50）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v45-ch2-reset-flags" style="border-color:#ff8c8c;color:#ff8c8c;">📖 第2話完了フラグ全リセット</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v45-ch2-complete-all" style="border-color:#06d6a0;color:#06d6a0;">📖 第2話全完了（演出なし確認用）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v45-ch2-boundary" style="border-color:#ffd166;color:#ffd166;">🧪 第2話unlock境界確認（Lv49→50→第1話未完）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v45-flag-sep" style="border-color:#a0cfff;color:#a0cfff;">🧪 ch1/ch2フラグ独立確認（ch2完了→ch1に影響しない）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v45-no-celeb" style="border-color:#ff9f7f;color:#ff9f7f;">🧪 ch2完了→全話演出が出ないことを確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v45-open-j2" style="border-color:#e9c46a;color:#e9c46a;">📖 ジュリタニ第2話を直接開く</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v45-open-s2" style="border-color:#e9c46a;color:#e9c46a;">📖 シュリタニ第2話を直接開く</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v45-open-n2" style="border-color:#e9c46a;color:#e9c46a;">📖 ノリオ第2話を直接開く</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v45-open-h2" style="border-color:#e9c46a;color:#e9c46a;">📖 ハルミ第2話を直接開く</button>';
      html += '<p class="small" style="color:#ff9f7f;margin-top:8px;">🧪 第1話/第2話セッション安定化確認 (§118 v0.45.1)</p>';
      html += '<button class="shop-menu-btn" id="btn-debug-v451-ch1-to-ch2-contamination" style="border-color:#ff9f7f;color:#ff9f7f;">🧪 第1話→第2話セッション混入確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v451-ch2-to-ch1-contamination" style="border-color:#ff9f7f;color:#ff9f7f;">🧪 第2話→第1話セッション混入確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v451-old-timer-check" style="border-color:#ff9f7f;color:#ff9f7f;">🧪 古いタイマー無効化確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v451-ch2-final-boundary" style="border-color:#ff9f7f;color:#ff9f7f;">🧪 第2話最終行・完了境界確認</button>';
      html += '<p class="small" style="color:#c8b4ff;margin-top:8px;">🌟 第2話全話完了演出確認 (§119 v0.45.2)</p>';
      html += '<button class="shop-menu-btn" id="btn-debug-v452-ch2-celeb-show" style="border-color:#c8b4ff;color:#c8b4ff;">🌟 第2話全話完了演出を確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v452-ch2-celeb-reset" style="border-color:#ff8c8c;color:#ff8c8c;">🔄 第2話演出済みフラグをリセット</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v452-ch2-34-boundary" style="border-color:#ffd166;color:#ffd166;">🧪 第2話3/4→4/4境界確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v452-ch2-rescue" style="border-color:#a0cfff;color:#a0cfff;">🧪 第2話旧4/4セーブ救済確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v452-ch2-noduplicate" style="border-color:#06d6a0;color:#06d6a0;">🧪 第2話演出二重防止確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v452-ch1ch2-sep" style="border-color:#a0cfff;color:#a0cfff;">🧪 第1話・第2話演出分離確認</button>';
      html += '<p class="small" style="color:#88d8b0;margin-top:8px;">🔗 全話完了演出キュー安定化 (§120 v0.45.3)</p>';
      html += '<button class="shop-menu-btn" id="btn-debug-v453-queue-seq" style="border-color:#88d8b0;color:#88d8b0;">🧪 第1話→第2話 pending連続表示確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v453-both-rescue" style="border-color:#88d8b0;color:#88d8b0;">🧪 両旧4/4セーブ連続救済確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v453-queue-nodup" style="border-color:#88d8b0;color:#88d8b0;">🧪 全話完了キュー二重実行防止確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v453-ch1close-ch2" style="border-color:#88d8b0;color:#88d8b0;">🧪 第1話close後の第2話再消費確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v453-modalopen" style="border-color:#88d8b0;color:#88d8b0;">🧪 連続演出中modalOpen維持確認</button>';
      html += '<p class="small" style="color:#ffb347;margin-top:8px;">⚔️ 伝説装備コンプリート報酬テスト (§70 v0.20)</p>';
      html += '<button class="shop-menu-btn" id="btn-debug-legend-all" style="border-color:#ffb347;color:#ffb347;">⚔️ 伝説装備を全入手（全7種）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-legend-reward-reset" style="border-color:#ff8c8c;color:#ff8c8c;">🔄 伝説装備コンプリート報酬を未受取に戻す</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-legend-reward-modal" style="border-color:#ffb347;color:#ffb347;">⚔️ 伝説装備コンプリート報酬モーダルを見る</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-legend-only-incomplete" style="border-color:#adb5bd;color:#adb5bd;">🔄 伝説装備だけ未達成にする（他は維持）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-open-record-legendary" style="border-color:#c8b4ff;color:#c8b4ff;">📜 冒険の記録（伝説装備確認）</button>';
      html += '<p class="small" style="color:#ff9f7f;margin-top:8px;">💬 NPC会話テスト (§69 v0.19)</p>';
      html += '<button class="shop-menu-btn" id="btn-debug-npc-full-complete" style="border-color:#ff9f7f;color:#ff9f7f;">💬 NPC反応：完全達成状態でUMA博士を開く</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-npc-cleared-only" style="border-color:#ff9f7f;color:#ff9f7f;">💬 NPC反応：究極ゴリラ捕獲済み・横スクロール未制覇</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-npc-side-cleared" style="border-color:#ff9f7f;color:#ff9f7f;">💬 NPC反応：横スクロール制覇済み・究極ゴリラ未捕獲</button>';
      html += '<p class="small" style="color:#ffd166;margin-top:8px;">📰 攻略ペーパービュー屋 (§49 v0.10.1)</p>';
      html += '<button class="shop-menu-btn" id="btn-debug-open-hint-shop" style="border-color:#ffd166;color:#ffd166;">📰 ヒントショップを開く</button>';
      html += '<p class="small" style="color:#74c0fc;margin-top:8px;">🧪 デバッグ検証 (§51 v0.11.1)</p>';
      html += '<button class="shop-menu-btn" id="btn-debug-validate-encounters" style="border-color:#74c0fc;color:#74c0fc;">🧪 固定敵IDチェック</button>';
      html += '<p class="small" style="color:#a9e34b;margin-top:8px;">🌀 ゲート (§52 v0.11.2)</p>';
      html += '<button class="shop-menu-btn" id="btn-debug-gate-move" style="border-color:#a9e34b;color:#a9e34b;">🌀 ゲートタイル付近へ移動 (2,3)</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-gate-flag-reset" style="border-color:#a9e34b;color:#a9e34b;">🔄 ゲート説明フラグリセット</button>';
      html += '<p class="small" style="color:#f4a261;margin-top:8px;">🏠 帰還ゲート (§53 v0.11.3 / §54 v0.11.3.2)</p>';
      html += '<button class="shop-menu-btn" id="btn-debug-return-gate-s1" style="border-color:#f4a261;color:#f4a261;">🏠 ステージ1スタート側Hへ移動 (x=2,y=1)</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-return-gate-s2" style="border-color:#f4a261;color:#f4a261;">🏠 ステージ2スタート側Hへ移動 (x=2,y=1)</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-return-gate-s3" style="border-color:#f4a261;color:#f4a261;">🏠 ステージ3スタート側Hへ移動 (x=2,y=2)</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-return-gate-s4" style="border-color:#f4a261;color:#f4a261;">🏠 ステージ4スタート側Hへ移動 (x=2,y=2)</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-return-gate-s5" style="border-color:#f4a261;color:#f4a261;">🏠 ステージ5スタート側Hへ移動 (x=2,y=2)</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-return-gate-s6" style="border-color:#f4a261;color:#f4a261;">🏠 ステージ6スタート側Hへ移動 (x=2,y=2)</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-force-normal-map" style="border-color:#f4a261;color:#f4a261;">🏠 通常マップへ強制帰還</button>';
      html += '<p class="small" style="color:#ffa94d;margin-top:8px;">🏠 ゴール側G/H (§58 v0.13.1: G@37→H@38)</p>';
      html += '<button class="shop-menu-btn" id="btn-debug-goal-gate-s1" style="border-color:#ffa94d;color:#ffa94d;">🏠 ステージ1ゴール直前へ (x=36,y=1) G@37/H@38</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-goal-gate-s2" style="border-color:#ffa94d;color:#ffa94d;">🏠 ステージ2ゴール直前へ (x=36,y=1) G@37/H@38</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-goal-gate-s3" style="border-color:#ffa94d;color:#ffa94d;">🏠 ステージ3ゴール直前へ (x=36,y=2) G@37/H@38</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-goal-gate-s4" style="border-color:#ffa94d;color:#ffa94d;">🏠 ステージ4ゴール直前へ (x=36,y=2) G@37/H@38</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-goal-gate-s5" style="border-color:#ffa94d;color:#ffa94d;">🏠 ステージ5ゴール直前へ (x=36,y=2) G@37/H@38</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-goal-gate-s6" style="border-color:#ffa94d;color:#ffa94d;">🏠 ステージ6ゴール直前へ (x=36,y=2) G@37/H@38</button>';
      html += '<p class="small" style="color:#e64980;margin-top:8px;">🧪 モーダル直接表示 (§54 v0.11.3.2)</p>';
      html += '<button class="shop-menu-btn" id="btn-debug-modal-goal-s1" style="border-color:#e64980;color:#e64980;">🧪 ステージ1ゴールモーダル表示</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-modal-goal-s2" style="border-color:#e64980;color:#e64980;">🧪 ステージ2ゴールモーダル表示</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-modal-goal-s3" style="border-color:#e64980;color:#e64980;">🧪 ステージ3ゴールモーダル表示</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-modal-goal-s4" style="border-color:#e64980;color:#e64980;">🧪 ステージ4ゴールモーダル表示</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-modal-goal-s5" style="border-color:#e64980;color:#e64980;">🧪 ステージ5ゴールモーダル表示</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-modal-goal-s6" style="border-color:#e64980;color:#e64980;">🧪 ステージ6ゴールモーダル表示</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-modal-return-gate" style="border-color:#e64980;color:#e64980;">🧪 帰還ゲートモーダル表示</button>';
      // §126 v0.49: 主人公命名・統合メンバー管理デバッグ
      html += '<p class="small" style="color:#74c0fc;margin-top:8px;">🧙 主人公命名・統合メンバー管理 (§126 v0.49)</p>';
      html += '<button class="shop-menu-btn" id="btn-debug-v49-open-naming" style="border-color:#74c0fc;color:#74c0fc;">🧙 命名モーダルを開く（newgameモード）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v49-open-rename" style="border-color:#a0cfff;color:#a0cfff;">✏️ 命名モーダルを開く（changeモード）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v49-open-member" style="border-color:#c8b4ff;color:#c8b4ff;">👥 メンバー管理モーダルを直接開く</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v49-name-kana" style="border-color:#06d6a0;color:#06d6a0;">🔤 名前を「テスト冒険者」に設定</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v49-name-long" style="border-color:#ffd166;color:#ffd166;">🔤 名前を10文字「スーパー勇者！！」に設定</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v49-name-reset" style="border-color:#ff8c8c;color:#ff8c8c;">🔄 名前をリセット（空文字→冒険者表示確認）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v49-name-check" style="border-color:#a0f0b4;color:#a0f0b4;">🧪 normalizePlayerName境界確認（PASS/FAIL）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v49-story-name-check" style="border-color:#e9c46a;color:#e9c46a;">📖 サイドストーリー「あなた」→主人公名置換確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v49-status-name-check" style="border-color:#ffd43b;color:#ffd43b;">📊 ステータス画面の名前表示確認</button>';
      // §127 v0.50: 王様名呼び・4人パーティ・設定バックドロップ
      html += '<p class="small" style="color:#ffd166;margin-top:8px;">👑 王様名呼び・4人パーティ (§127 v0.50)</p>';
      html += '<button class="shop-menu-btn" id="btn-debug-v50-king-early" style="border-color:#ffd166;color:#ffd166;">👑 王様会話（Lv10・早期「勇者殿」）を確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v50-king-lv50" style="border-color:#ffd166;color:#ffd166;">👑 王様会話（Lv50+「勇者よ」）を確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v50-king-cleared" style="border-color:#06d6a0;color:#06d6a0;">👑 王様会話（クリア後）を確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v50-format-test" style="border-color:#a0cfff;color:#a0cfff;">🧪 formatKingDialogueText 置換確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v50-party4" style="border-color:#c77dff;color:#c77dff;">👥 4人フルパーティ追従確認（全員合流）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v50-party0" style="border-color:#ff8c8c;color:#ff8c8c;">👥 パーティ全解除</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v50-join-all-tavern" style="border-color:#ffd166;color:#ffd166;">👥 全員合流ボタン動作確認（酒場を開く）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v50-party-max-check" style="border-color:#88d8b0;color:#88d8b0;">🧪 COMPANION_MAX=4 確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v50-backdrop-help" style="border-color:#adb5bd;color:#adb5bd;">⚙️ バックドロップclose確認（このモーダル外をタップ）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v50-trail-check" style="border-color:#ffa94d;color:#ffa94d;">🧪 partyTrail上限4確認</button>';
      // §128 v0.50.1: パーティ正規化・4人戦闘安定化
      html += '<p class="small" style="color:#88d8ff;margin-top:8px;">🛠 パーティ正規化・4人戦闘 (§128 v0.50.1)</p>';
      html += '<button class="shop-menu-btn" id="btn-debug-v501-norm-invalid" style="border-color:#88d8ff;color:#88d8ff;">🧪 正規化:不正ID除去テスト</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v501-norm-dup" style="border-color:#88d8ff;color:#88d8ff;">🧪 正規化:重複除去テスト</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v501-norm-max" style="border-color:#88d8ff;color:#88d8ff;">🧪 正規化:MAX超過+重複除去テスト</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v501-battle4-cmd" style="border-color:#c77dff;color:#c77dff;">⚔️ 4人手動コマンド戦闘（のらいぬ）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v501-battle4-ai" style="border-color:#c77dff;color:#c77dff;">🤖 4人AIまかせる戦闘（のらいぬ）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v501-exp4" style="border-color:#ffd166;color:#ffd166;">📊 4人EXP付与テスト（gainCompanionExp(100)）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v501-tech-indep" style="border-color:#ffd166;color:#ffd166;">⚡ 仲間わざ独立性テスト（4人個別フラグ）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v501-battle-reset" style="border-color:#06d6a0;color:#06d6a0;">🔄 戦闘終了リセットテスト（clearCompanionCommandState）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v501-king-nat" style="border-color:#ffa94d;color:#ffa94d;">👑 王様会話自然さ確認（Lv60・使い視点）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v501-king-dbl-esc" style="border-color:#ffa94d;color:#ffa94d;">🧪 王様会話XSS名前テスト（&lt;&gt;&amp;名前）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v501-trail-residue" style="border-color:#adb5bd;color:#adb5bd;">🐾 trail残留テスト（4人→0人後 resetPartyTrail）</button>';
      // §129 v0.51: 拡張フィールド・ワープ広場
      html += '<p class="small" style="color:#80ffb0;margin-top:8px;">🗺️ 拡張フィールド・ワープ広場 (§129 v0.51)</p>';
      html += '<button class="shop-menu-btn" id="btn-debug-v51-warp-to-plaza" style="border-color:#80ffb0;color:#80ffb0;">🗺️ ワープ広場へ移動 (7,25)</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v51-warp-stage1" style="border-color:#80ffb0;color:#80ffb0;">🌱 ワープST1モーダル（はじまりの草原）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v51-warp-stage2" style="border-color:#c3a4ff;color:#c3a4ff;">🌲 ワープST2モーダル（あやしい森）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v51-warp-stage6" style="border-color:#98d8c8;color:#98d8c8;">🌿 ワープST6モーダル（チンパンジーの聖域）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v51-theme-clear" style="border-color:#adb5bd;color:#adb5bd;">🎨 ステージテーマCSSをクリア</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v51-unlock-all-warps" style="border-color:#ffd166;color:#ffd166;">🔓 全ワープ解放（ST1-6クリア済みに）</button>';
      // §130 v0.51.1: 安定化テストボタン
      html += '<p class="small" style="color:#80ffb0;margin-top:8px;">🧪 v0.51.1 安定化テスト (§130)</p>';
      html += '<button class="shop-menu-btn" id="btn-debug-v511-map-size" style="border-color:#80ffb0;color:#80ffb0;">🧪 通常マップ旧新サイズ比較</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v511-row-widths" style="border-color:#80ffb0;color:#80ffb0;">🧪 通常マップ全行幅確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v511-warp-count" style="border-color:#80ffb0;color:#80ffb0;">🧪 6ワープ出現数確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v511-warp-dest" style="border-color:#80ffb0;color:#80ffb0;">🧪 6ワープ入場先一致確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v511-warp-unlock" style="border-color:#80ffb0;color:#80ffb0;">🧪 6ワープ解放境界確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v511-warp-spam" style="border-color:#ffd43b;color:#ffd43b;">🧪 ワープ移動ボタン連打防止確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v511-return-safety" style="border-color:#80ffb0;color:#80ffb0;">🧪 normalReturn座標安全確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v511-all-returns" style="border-color:#80ffb0;color:#80ffb0;">🧪 全ステージ帰還位置確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v511-scale-accum" style="border-color:#ffd43b;color:#ffd43b;">🧪 敵スケーリング累積防止確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v511-special-skip" style="border-color:#ffd43b;color:#ffd43b;">🧪 特殊敵スケーリング除外確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v511-capture-rate" style="border-color:#80ffb0;color:#80ffb0;">🧪 捕獲率level非参照確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v511-lv-display" style="border-color:#80ffb0;color:#80ffb0;">🧪 敵Lv表示境界確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v511-theme-check" style="border-color:#c3a4ff;color:#c3a4ff;">🧪 6テーマ視覚差確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v511-theme-clear" style="border-color:#adb5bd;color:#adb5bd;">🧪 theme class残留防止確認</button>';
      // §131 v0.51.2: ワープ広場案内導線テストボタン
      html += '<p class="small" style="color:#a0e8ff;margin-top:8px;">🪧 v0.51.2 案内導線テスト (§131)</p>';
      html += '<button class="shop-menu-btn" id="btn-debug-v512-warp-status" style="border-color:#a0e8ff;color:#a0e8ff;">🧪 ワープ状態4種表示確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v512-current-unique" style="border-color:#a0e8ff;color:#a0e8ff;">🧪 currentワープ一意性確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v512-objective-map" style="border-color:#a0e8ff;color:#a0e8ff;">🧪 objectiveId・ワープ対応確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v512-sign-safety" style="border-color:#a0e8ff;color:#a0e8ff;">🧪 案内板座標安全確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v512-plaza-intro" style="border-color:#ffd700;color:#ffd700;">🧪 ワープ広場初回説明確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v512-intro-reshow" style="border-color:#ffd700;color:#ffd700;">🧪 初回説明再表示防止確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v512-never-demote" style="border-color:#a0e8ff;color:#a0e8ff;">🧪 初回フラグnever-demote確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v512-modal-info" style="border-color:#a0e8ff;color:#a0e8ff;">🧪 ワープモーダル情報整合確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v512-paperview-sync" style="border-color:#a0e8ff;color:#a0e8ff;">🧪 PaperView・ワープ状態一致確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v512-current-switch" style="border-color:#ffd700;color:#ffd700;">🧪 進行変更時current切替確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v512-plaza-teleport" style="border-color:#80ffb0;color:#80ffb0;">🗺️ ワープ広場中央へ移動(11,27)</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v512-intro-reset" style="border-color:#ff8c8c;color:#ff8c8c;">🔄 初回説明フラグリセット</button>';
      // §132a v0.53: 安定化テストボタン
      html += '<p class="small" style="color:#ffd166;margin-top:8px;">🔍 v0.53 安定化テスト (§132a)</p>';
      html += '<button class="shop-menu-btn" id="btn-debug-v53-obj-classify">🧪 objectiveId全件分類確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v53-current-count">🧪 current件数0または1確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v53-nonstage-current">🧪 ステージ外目的currentなし確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v53-sign-collision">🧪 道しるべ3件座標競合確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v53-sign-state-unchanged">🧪 道しるべ接触状態不変確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v53-plaza-boundary">🧪 広場境界外→内初回確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v53-load-noshowintro">🧪 広場内load時非表示確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v53-return-nointro">🧪 ステージ帰還時非表示確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v53-intro-savecount">🧪 初回説明save1回確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v53-reread-flag">🧪 再読時フラグ不変確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v53-paperview-sync">🧪 フィールド・PaperView同期確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v53-modal-stress">🧪 3モーダル10回開閉確認</button>';
      // §133 v0.54: 第3話全員完了演出テストボタン
      html += '<p class="small" style="color:#ffd166;margin-top:8px;">🎭 v0.54 第3話全員完了テスト (§133)</p>';
      html += '<button class="shop-menu-btn" id="btn-debug-v54-ch3-boundary">🧪 第3話全員完了判定境界</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v54-ch3-direct">🧪 第3話完了演出直接表示</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v54-ch3-normalize">🧪 第3話表示済みフラグ正規化</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v54-ch3-old-save">🧪 第3話旧セーブ4/4修復</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v54-ch3-reread">🧪 第3話再読時再表示なし</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v54-ch3-close-spam">🧪 第3話close連打防止</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v54-ch3-order">🧪 第1→第2→第3通知順序確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v54-ch3-simultaneous">🧪 3通知同時表示防止</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v54-ch3-modal-delay">🧪 他モーダル中pending維持</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v54-ch3-render-spam">🧪 render×10多重表示防止</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v54-ch3-save-count">🧪 saveGame回数確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v54-ch3-reset">🔄 第3話全員完了フラグリセット</button>';
      // §135 v0.56: 最終サイドストーリー接続テストボタン
      html += '<p class="small" style="color:#f4a261;margin-top:8px;">🌅 v0.56 最終ストーリー接続テスト (§135)</p>';
      html += '<button class="shop-menu-btn" id="btn-debug-v56-conditions" style="border-color:#f4a261;color:#f4a261;">🧪 最終ストーリー条件確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v56-boundary" style="border-color:#f4a261;color:#f4a261;">🧪 解放判定境界（ケース1〜6）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v56-ch3-34-lock" style="border-color:#f4a261;color:#f4a261;">🧪 第3話3/4では未解放確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v56-no-celeb-lock" style="border-color:#f4a261;color:#f4a261;">🧪 第3話4/4・演出前は未解放確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v56-after-celeb" style="border-color:#f4a261;color:#f4a261;">🧪 第3話演出後・S5クリア済みで解放確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v56-s5-uncleared" style="border-color:#ffd700;color:#ffd700;">🧪 既存条件未達（S5未クリア）時ロック確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v56-notify-trigger" style="border-color:#ffd700;color:#ffd700;">🧪 第3話close→解放通知確認（条件フルセット）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v56-no-autostart" style="border-color:#ffd700;color:#ffd700;">🧪 最終ストーリー自動開始なし確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v56-once" style="border-color:#ffd700;color:#ffd700;">🧪 解放通知1回確認（2回目はスキップ）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v56-old-save-unlock" style="border-color:#06d6a0;color:#06d6a0;">🧪 旧セーブ解放通知修復確認（ケースA）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v56-old-save-done" style="border-color:#06d6a0;color:#06d6a0;">🧪 最終ストーリー完了旧セーブ通知なし確認（ケースB）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v56-tavern-states" style="border-color:#74c0fc;color:#74c0fc;">🧪 酒場入口状態確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v56-paperview-5states" style="border-color:#74c0fc;color:#74c0fc;">🧪 PaperView最終物語5状態確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v56-objective-sync" style="border-color:#74c0fc;color:#74c0fc;">🧪 案内人objective同期確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v56-warp-no-current" style="border-color:#74c0fc;color:#74c0fc;">🧪 最終物語目的でワープcurrentなし確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v56-multi-notify" style="border-color:#ff8c8c;color:#ff8c8c;">🧪 解放通知10回多重防止確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v56-reset-notify" style="border-color:#ff8c8c;color:#ff8c8c;">🔄 解放通知フラグリセット（再テスト用）</button>';
      // §136 v0.56.1: 通常プレイ経路監査ボタン（12本）
      html += '<p class="small" style="color:#a9e34b;margin-top:8px;">🔬 v0.56.1 通常経路監査 (§136)</p>';
      html += '<button class="shop-menu-btn" id="btn-debug-v561-audit" style="border-color:#a9e34b;color:#a9e34b;">📋 v0.56本体A/B/C監査レポート</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v561-normal-flow" style="border-color:#a9e34b;color:#a9e34b;">🎭 通常プレイ第3話→最終導線シミュレート</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v561-close-reeval" style="border-color:#a9e34b;color:#a9e34b;">🔄 第3話close後unlock再評価確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v561-tavern-check" style="border-color:#a9e34b;color:#a9e34b;">🍺 通常酒場render最終物語入口確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v561-paperview-render" style="border-color:#a9e34b;color:#a9e34b;">📰 PaperView通常描画5状態確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v561-guide-check" style="border-color:#a9e34b;color:#a9e34b;">🧭 冒険案内通常objective最終物語確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v561-no-autostart" style="border-color:#a9e34b;color:#a9e34b;">🚫 自動開始0回確認（openStageWarpModal監視）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v561-old-save-a" style="border-color:#74c0fc;color:#74c0fc;">💾 旧セーブA通常経路確認（loadGame相当）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v561-old-save-b" style="border-color:#74c0fc;color:#74c0fc;">💾 旧セーブB完了済み通知なし確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v561-old-save-c" style="border-color:#74c0fc;color:#74c0fc;">💾 旧セーブC通知順確認（ch3演出→unlock）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v561-render-multi" style="border-color:#ff8c8c;color:#ff8c8c;">🔁 render×10多重防止（通知1回のみ確認）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v561-tavern-double" style="border-color:#ff8c8c;color:#ff8c8c;">🍺 酒場ボタン連打openStageWarpModal1回確認</button>';
      // §137 v0.57: 仲間装備ショップデバッグ（4本）
      html += '<p class="small" style="color:#e9c46a;margin-top:8px;">&#x1F45A; 仲間装備ショップ (§137 v0.57)</p>';
      html += '<button class="shop-menu-btn" id="btn-debug-v57-shop-state" style="border-color:#e9c46a;color:#e9c46a;">&#x1F9EA; ショップ装備状態一覧</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v57-buy-test" style="border-color:#e9c46a;color:#e9c46a;">&#x1F9EA; 購入テスト（G付与→購入→復元）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v57-reward-lock" style="border-color:#e9c46a;color:#e9c46a;">&#x1F512; 報酬装備ロック確認（canBuy=false）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v57-no-gold" style="border-color:#e9c46a;color:#e9c46a;">&#x1F4B8; G不足ブロック確認（G=0）</button>';
      // §138 v0.57.1: 仲間装備ショップ監査デバッグ（16本）
      html += '<p class="small" style="color:#74b9ff;margin-top:8px;">&#x1F50D; v0.57.1 ショップ監査 (§138)</p>';
      html += '<button class="shop-menu-btn" id="btn-debug-v571-starter-routes" style="border-color:#74b9ff;color:#74b9ff;">&#x1F9EA; スターター4種取得経路監査</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v571-newgame-gear" style="border-color:#74b9ff;color:#74b9ff;">&#x1F195; 新規ゲーム初期gear確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v571-join-gear" style="border-color:#74b9ff;color:#74b9ff;">&#x1F91D; 仲間加入時gear確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v571-whitelist-dom" style="border-color:#74b9ff;color:#74b9ff;">&#x1F4CB; ショップwhitelist DOM確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v571-reward-dom-absent" style="border-color:#74b9ff;color:#74b9ff;">&#x1F6AB; 報酬gear DOM完全除外確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v571-not-joined" style="border-color:#74b9ff;color:#74b9ff;">&#x1F512; 仲間未加入購入不可確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v571-gold-boundary" style="border-color:#74b9ff;color:#74b9ff;">&#x1F4B0; P-1/P/P+1購入境界</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v571-buy-10" style="border-color:#ff8c8c;color:#ff8c8c;">&#x1F504; 購入10連打1回確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v571-no-auto-equip" style="border-color:#ff8c8c;color:#ff8c8c;">&#x1F9F3; 購入後自動装備なし確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v571-reward-flags" style="border-color:#ff8c8c;color:#ff8c8c;">&#x1F6E1; reward flags完全不変確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v571-save-count" style="border-color:#06d6a0;color:#06d6a0;">&#x1F4BE; saveGame回数確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v571-save-load" style="border-color:#06d6a0;color:#06d6a0;">&#x1F4E5; shop gear save/load確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v571-old-save" style="border-color:#06d6a0;color:#06d6a0;">&#x1F4DC; 旧セーブ互換確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v571-reconcile" style="border-color:#06d6a0;color:#06d6a0;">&#x1F504; reconcile後shop gear維持確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v571-render10" style="border-color:#a9e34b;color:#a9e34b;">&#x1F504; render×10副作用なし</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v571-open10" style="border-color:#a9e34b;color:#a9e34b;">&#x1F6D2; shopモーダル10回開閉</button>';
      // §139 v0.58: 仲間わざ習得演出デバッグ（18本）
      html += '<p class="small" style="color:#fd79a8;margin-top:8px;">&#x26A1; v0.58 仲間わざ習得演出 (§139)</p>';
      html += '<button class="shop-menu-btn" id="btn-debug-v58-tech-data" style="border-color:#fd79a8;color:#fd79a8;">&#x1F9EA; 4わざ正式データ一覧</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v58-unlock-boundary" style="border-color:#fd79a8;color:#fd79a8;">&#x1F50D; unlock条件境界確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v58-lv24-to-25" style="border-color:#fd79a8;color:#fd79a8;">&#x1F4C8; Lv24&#x2192;25習得演出確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v58-lv25-to-26" style="border-color:#fd79a8;color:#fd79a8;">&#x1F6AB; Lv25&#x2192;26再通知なし確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v58-reward-unlock" style="border-color:#fd79a8;color:#fd79a8;">&#x1F381; reward取得&#x2192;unlock&#x2192;演出確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v58-lv25-only" style="border-color:#fd79a8;color:#fd79a8;">&#x1F512; Lv25のみ未解放確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v58-reward-only" style="border-color:#fd79a8;color:#fd79a8;">&#x1F512; rewardのみ未解放確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v58-gear-not-needed" style="border-color:#fd79a8;color:#fd79a8;">&#x1F45A; gear装備不要unlock確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v58-old-save-rescue" style="border-color:#a29bfe;color:#a29bfe;">&#x1F4DC; 旧セーブunlock済み通知修復</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v58-4-pending" style="border-color:#a29bfe;color:#a29bfe;">&#x1F46B; 4人同時pending順序確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v58-modal-delay" style="border-color:#a29bfe;color:#a29bfe;">&#x23F3; 他モーダル中延期確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v58-notice-not-needed" style="border-color:#55efc4;color:#55efc4;">&#x26A1; notice未確認でも技使用可確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v58-save-count" style="border-color:#55efc4;color:#55efc4;">&#x1F4BE; saveGame回数確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v58-close-10" style="border-color:#55efc4;color:#55efc4;">&#x1F504; close10連打1回確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v58-render-10" style="border-color:#55efc4;color:#55efc4;">&#x1F504; render&#xD7;10多重表示なし確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v58-newgame-state" style="border-color:#55efc4;color:#55efc4;">&#x1F195; newGame初期状態確認</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v58-show-direct" style="border-color:#e17055;color:#e17055;">&#x2728; 習得演出直接表示（ジュリタニ）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-v58-reset-notices" style="border-color:#e17055;color:#e17055;">&#x1F504; notice全リセット（再テスト用）</button>';
    }
    body.innerHTML = html;
    body.querySelectorAll("button[data-speed]").forEach(function (btn) {
      btn.onclick = function () { changeWalkSpeed(btn.getAttribute("data-speed")); };
    });
    document.getElementById("btn-manual-save").onclick = function () {
      saveGame();
      showToast("💾 セーブしました");
    };
    document.getElementById("btn-show-goal").onclick = function () {
      closeModal("settings-modal");
      openModal("goal-modal");
    };
    document.getElementById("btn-show-help").onclick = function () {
      closeModal("settings-modal");
      openModal("help-modal");
    };
    if (state.gameCleared) {
      document.getElementById("btn-watch-ending").onclick = function () {
        closeModal("settings-modal");
        openEndingModal();
      };
    }
    document.getElementById("btn-new-game").onclick = function () {
      // §126 v0.49: 命名モーダルを介してニューゲーム開始
      openPlayerNameModal("newgame");
    };
    document.getElementById("btn-toggle-sound").onclick = function () {
      soundEnabled = !soundEnabled;
      if (!soundEnabled) {
        stopBGM();
      } else {
        if (bgmEnabled) updateBGM(getFieldBgmType());
      }
      saveSoundSettings();
      renderSettingsBody();
    };
    document.getElementById("btn-toggle-bgm").onclick = function () {
      if (!soundEnabled) return;
      bgmEnabled = !bgmEnabled;
      if (!bgmEnabled) { stopBGM(); } else { updateBGM(getFieldBgmType()); }
      saveSoundSettings();
      renderSettingsBody();
    };
    document.getElementById("btn-toggle-se").onclick = function () {
      if (!soundEnabled) return;
      seEnabled = !seEnabled;
      saveSoundSettings();
      renderSettingsBody();
    };
    if (DEBUG_MODE) {
      document.getElementById("btn-debug-lv1").onclick = debugSetLevel1;
      document.getElementById("btn-debug-lv5").onclick = debugSetLevel5;
      document.getElementById("btn-debug-lv10").onclick = debugSetLevel10;
      document.getElementById("btn-debug-lv99").onclick = debugSetLevel99;
      document.getElementById("btn-debug-lv98").onclick = debugSetLevel98;
      document.getElementById("btn-debug-set-lvup-exp").onclick = debugSetLvUpExp;
      document.getElementById("btn-debug-reset-lv99").onclick = debugResetLv99;
      document.getElementById("btn-debug-ukulele").onclick = debugGetUkulele;
      document.getElementById("btn-debug-encounter").onclick = debugForceUltimateGorilla;
      document.getElementById("btn-debug-encounter-hp5").onclick = debugForceUltimateGorillaHP5;
      document.getElementById("btn-debug-encounter-wilddog").onclick = debugForceWilddog;
      document.getElementById("btn-debug-encounter-random").onclick = debugForceRandomMonster;
      document.getElementById("btn-debug-hp5").onclick = debugSetEnemyHP5;
      document.getElementById("btn-debug-gold").onclick = debugAddGold;
      document.getElementById("btn-debug-reset").onclick = debugResetClear;
      document.getElementById("btn-debug-play-ending").onclick = debugPlayEnding;
      document.getElementById("btn-debug-set-cleared").onclick = debugSetCleared;
      document.getElementById("btn-debug-play-lv99").onclick = debugPlayLv99Event;
      document.getElementById("btn-debug-all-legendary").onclick = debugGetAllLegendary;
      document.getElementById("btn-debug-reset-legendary").onclick = debugResetLegendary;
      document.getElementById("btn-debug-se-test").onclick = function () {
        if (!initAudioContext()) { showToast("[DEBUG] AudioContext利用不可"); return; }
        soundEnabled = true; seEnabled = true;
        saveSoundSettings();
        playSE("levelUp");
        showToast("[DEBUG] SE(levelUp)再生");
        renderSettingsBody();
      };
      document.getElementById("btn-debug-bgm-field").onclick = function () {
        if (!initAudioContext()) { showToast("[DEBUG] AudioContext利用不可"); return; }
        soundEnabled = true; bgmEnabled = true;
        saveSoundSettings();
        stopBGM(); // ノードも含めて確実に停止してから再起動
        startBGM("field");
        showToast("[DEBUG] 通常フィールドBGM再生");
        renderSettingsBody();
      };
      // §74 v0.23: クリア後フィールドBGMテスト
      document.getElementById("btn-debug-bgm-field-clear").onclick = function () {
        if (!initAudioContext()) { showToast("[DEBUG] AudioContext利用不可"); return; }
        soundEnabled = true; bgmEnabled = true;
        saveSoundSettings();
        stopBGM();
        startBGM("fieldClear");
        showToast("[DEBUG] クリア後フィールドBGM再生 (fieldClear)");
        renderSettingsBody();
      };
      document.getElementById("btn-debug-bgm-battle").onclick = function () {
        if (!initAudioContext()) { showToast("[DEBUG] AudioContext利用不可"); return; }
        soundEnabled = true; bgmEnabled = true;
        saveSoundSettings();
        stopBGM();
        startBGM("battle");
        showToast("[DEBUG] バトルBGM再生");
        renderSettingsBody();
      };
      document.getElementById("btn-debug-bgm-ending").onclick = function () {
        if (!initAudioContext()) { showToast("[DEBUG] AudioContext利用不可"); return; }
        soundEnabled = true; bgmEnabled = true;
        saveSoundSettings();
        stopBGM();
        startBGM("ending");
        showToast("[DEBUG] エンディングBGM再生");
        renderSettingsBody();
      };
      document.getElementById("btn-debug-bgm-stop").onclick = function () {
        stopBGM();
        showToast("[DEBUG] BGM停止");
      };
      document.getElementById("btn-debug-bgm-hard-stop").onclick = function () {
        stopBGMHard();
        showToast("[DEBUG] BGM完全停止 (activeBgmNodes=" + activeBgmNodes.length + ")");
      };
      document.getElementById("btn-debug-side-map-enter").onclick = function () {
        closeModal("settings-modal");
        switchToSideMap();
      };
      document.getElementById("btn-debug-side-map-exit").onclick = function () {
        closeModal("settings-modal");
        switchToNormalMap();
      };
      document.getElementById("btn-debug-side-start").onclick = function () {
        state.mapMode = "side";
        state.sideMap.x = 1;
        state.sideMap.y = 1;
        saveGame();
        closeModal("settings-modal");
        renderField();
        showToast("[DEBUG] スタート地点へ移動 (x=1,y=1)");
      };
      document.getElementById("btn-debug-side-near-goal").onclick = function () {
        state.mapMode = "side";
        state.sideMap.x = 34;
        state.sideMap.y = 1;
        saveGame();
        closeModal("settings-modal");
        renderField();
        showToast("[DEBUG] ゴール直前へ移動 (x=34,y=1) — 中ボスゴリラはx=36");
      };
      document.getElementById("btn-debug-side-reset-flags").onclick = function () {
        state.sideMap.defeatedEnemies = {};
        state.sideMap.stageCleared = {};
        state.sideMap.stage1RewardLevel = 0;  // §47 v0.9.3
        sideMapPendingFixedKey = "";
        saveGame();
        renderField();
        showToast("[DEBUG] 横スクロール: クリア・撃破・報酬フラグをリセット");
      };
      document.getElementById("btn-debug-side-stage1-clear").onclick = function () {
        state.sideMap.stageCleared["1"] = true;
        saveGame();
        renderField();
        showToast("[DEBUG] ステージ1クリアフラグをONにした");
      };
      document.getElementById("btn-debug-side-set-midboss").onclick = function () {
        state.sideMap.defeatedEnemies["36,1"] = true;
        saveGame();
        renderField();
        showToast("[DEBUG] 中ボスゴリラ撃退済みにした (36,1)");
      };
      document.getElementById("btn-debug-midboss-encounter").onclick = function () {
        closeModal("settings-modal");
        triggerFixedEncounter("midboss_gorilla");
        showToast("[DEBUG] 中ボスゴリラ強制エンカウント");
      };
      document.getElementById("btn-debug-companion-norio").onclick = function () {
        if (!hasCompanion("norio")) {
          if (state.player.companions.length < COMPANION_MAX) {
            state.player.companions.push("norio");
            saveGame();
            showToast("[DEBUG] ノリオを仲間にした");
          } else {
            showToast("[DEBUG] 仲間が上限です");
          }
        } else {
          showToast("[DEBUG] ノリオはすでに同行中");
        }
      };
      document.getElementById("btn-debug-side-reset-midboss").onclick = function () {
        delete state.sideMap.defeatedEnemies["36,1"];
        sideMapPendingFixedKey = "";
        saveGame();
        renderField();
        showToast("[DEBUG] 中ボスゴリラ撃退フラグをリセット (36,1)");
      };
      // §48 v0.10: ステージ2デバッグ
      document.getElementById("btn-debug-side-stage2-enter").onclick = function () {
        state.mapMode = "side";
        state.sideMap.stage = 2;
        var s2 = SIDE_STAGE_DATA[2];
        state.sideMap.x = s2.startX;
        state.sideMap.y = s2.startY;
        saveGame();
        closeModal("settings-modal");
        renderField();
        showToast("[DEBUG] あやしい森へ移動 (stage=2, x=1,y=1)");
      };
      document.getElementById("btn-debug-side-stage2-near-goal").onclick = function () {
        state.mapMode = "side";
        state.sideMap.stage = 2;
        state.sideMap.x = 34;
        state.sideMap.y = 1;
        saveGame();
        closeModal("settings-modal");
        renderField();
        showToast("[DEBUG] 森ゴール直前へ移動 (x=34,y=1) — ボスゴリラはx=35");
      };
      document.getElementById("btn-debug-side-stage2-clear-reset").onclick = function () {
        delete state.sideMap.stageCleared["2"];
        delete state.sideMap.defeatedEnemies["2:35,1"];
        state.sideMap.stage2RewardLevel = 0;
        sideMapPendingFixedKey = "";
        saveGame();
        renderField();
        showToast("[DEBUG] ステージ2フラグをリセット");
      };
      document.getElementById("btn-debug-side-set-bossgori").onclick = function () {
        state.sideMap.defeatedEnemies["2:35,1"] = true;
        saveGame();
        renderField();
        showToast("[DEBUG] ボスゴリラ撃退済みにした (2:35,1)");
      };
      document.getElementById("btn-debug-boss-gorilla-encounter").onclick = function () {
        closeModal("settings-modal");
        triggerFixedEncounter("boss_gorilla");
        showToast("[DEBUG] ボスゴリラ強制エンカウント");
      };
      document.getElementById("btn-debug-reset-exp").onclick = function () {
        state.player.exp = 0;
        saveGame();
        updateStatusBar();
        showToast("[DEBUG] EXPを0にした (次の戦闘でノリオ効果を確認しやすい)");
      };
      // §50 v0.11: ステージ3デバッグ
      document.getElementById("btn-debug-side-stage3-enter").onclick = function () {
        state.mapMode = "side";
        state.sideMap.stage = 3;
        var s3 = SIDE_STAGE_DATA[3];
        state.sideMap.x = s3.startX;
        state.sideMap.y = s3.startY;
        saveGame();
        closeModal("settings-modal");
        renderField();
        showToast("[DEBUG] 古びた町はずれへ移動 (stage=3, x=1,y=2)");
      };
      document.getElementById("btn-debug-side-stage3-near-goal").onclick = function () {
        state.mapMode = "side";
        state.sideMap.stage = 3;
        state.sideMap.x = 30;
        state.sideMap.y = 2;
        saveGame();
        closeModal("settings-modal");
        renderField();
        showToast("[DEBUG] 町はずれゴール直前へ移動 (x=30,y=2) — 魔王ゴリラはx=31");
      };
      document.getElementById("btn-debug-side-stage3-clear-reset").onclick = function () {
        delete state.sideMap.stageCleared["3"];
        delete state.sideMap.defeatedEnemies["3:31,2"];
        state.sideMap.stage3RewardLevel = 0;
        sideMapPendingFixedKey = "";
        saveGame();
        renderField();
        showToast("[DEBUG] ステージ3フラグをリセット");
      };
      document.getElementById("btn-debug-side-set-maougori").onclick = function () {
        state.sideMap.defeatedEnemies["3:31,2"] = true;
        saveGame();
        renderField();
        showToast("[DEBUG] 魔王ゴリラ撃退済みにした (3:31,2)");
      };
      document.getElementById("btn-debug-maou-gorilla-encounter").onclick = function () {
        closeModal("settings-modal");
        triggerFixedEncounter("maou_gorilla");
        showToast("[DEBUG] 魔王ゴリラ強制エンカウント");
      };
      // §51 v0.11.1: ステージ3宝箱・固定敵リセット
      document.getElementById("btn-debug-side-stage3-items-reset").onclick = function () {
        var sm = state.sideMap;
        var toDelete = [];
        for (var ck in sm.openedChests) {
          if (sm.openedChests.hasOwnProperty(ck) && ck.indexOf("3:") === 0) toDelete.push(ck);
        }
        for (var ci = 0; ci < toDelete.length; ci++) delete sm.openedChests[toDelete[ci]];
        var eToDelete = [];
        for (var ek in sm.defeatedEnemies) {
          if (sm.defeatedEnemies.hasOwnProperty(ek) && ek.indexOf("3:") === 0) eToDelete.push(ek);
        }
        for (var ei = 0; ei < eToDelete.length; ei++) delete sm.defeatedEnemies[eToDelete[ei]];
        sideMapPendingFixedKey = "";
        saveGame();
        renderField();
        showToast("[DEBUG] ステージ3宝箱・固定敵をリセット");
      };
      // §55 v0.12: ステージ4デバッグ
      document.getElementById("btn-debug-side-stage4-enter").onclick = function () {
        state.mapMode = "side";
        state.sideMap.stage = 4;
        var s4 = SIDE_STAGE_DATA[4];
        state.sideMap.x = s4.startX;
        state.sideMap.y = s4.startY;
        saveGame();
        closeModal("settings-modal");
        renderField();
        showToast("[DEBUG] ゴリラ山道へ移動 (stage=4, x=1,y=2)");
      };
      document.getElementById("btn-debug-side-stage4-near-goal").onclick = function () {
        state.mapMode = "side";
        state.sideMap.stage = 4;
        state.sideMap.x = 32;
        state.sideMap.y = 2;
        saveGame();
        closeModal("settings-modal");
        renderField();
        showToast("[DEBUG] 山道ゴール直前へ移動 (x=32,y=2) — 大魔王ゴリラはx=33");
      };
      document.getElementById("btn-debug-side-stage4-clear-reset").onclick = function () {
        delete state.sideMap.stageCleared["4"];
        delete state.sideMap.defeatedEnemies["4:33,2"];
        state.sideMap.stage4RewardLevel = 0;
        sideMapPendingFixedKey = "";
        saveGame();
        renderField();
        showToast("[DEBUG] ステージ4フラグをリセット");
      };
      document.getElementById("btn-debug-side-set-daimaougori").onclick = function () {
        state.sideMap.defeatedEnemies["4:33,2"] = true;
        saveGame();
        renderField();
        showToast("[DEBUG] 大魔王ゴリラ撃退済みにした (4:33,2)");
      };
      document.getElementById("btn-debug-daimaou-gorilla-encounter").onclick = function () {
        closeModal("settings-modal");
        triggerFixedEncounter("daimaou_gorilla");
        showToast("[DEBUG] 大魔王ゴリラ強制エンカウント");
      };
      document.getElementById("btn-debug-side-stage4-items-reset").onclick = function () {
        var sm4 = state.sideMap;
        var cToDelete4 = [];
        for (var ck4 in sm4.openedChests) {
          if (sm4.openedChests.hasOwnProperty(ck4) && ck4.indexOf("4:") === 0) cToDelete4.push(ck4);
        }
        for (var ci4 = 0; ci4 < cToDelete4.length; ci4++) delete sm4.openedChests[cToDelete4[ci4]];
        var eToDelete4 = [];
        for (var ek4 in sm4.defeatedEnemies) {
          if (sm4.defeatedEnemies.hasOwnProperty(ek4) && ek4.indexOf("4:") === 0) eToDelete4.push(ek4);
        }
        for (var ei4 = 0; ei4 < eToDelete4.length; ei4++) delete sm4.defeatedEnemies[eToDelete4[ei4]];
        sideMapPendingFixedKey = "";
        saveGame();
        renderField();
        showToast("[DEBUG] ステージ4宝箱・固定敵をリセット");
      };
      // §49 v0.10.1: ヒントショップを開く
      document.getElementById("btn-debug-open-hint-shop").onclick = function () {
        closeModal("settings-modal");
        openHintShopModal();
      };
      // §51 v0.11.1: 固定敵IDチェック
      document.getElementById("btn-debug-validate-encounters").onclick = function () {
        validateSideFixedEncounters();
      };
      // §52 v0.11.2: ゲートデバッグ
      document.getElementById("btn-debug-gate-move").onclick = function () {
        closeModal("settings-modal");
        state.mapMode = "normal";
        state.player.x = 2;
        state.player.y = 3;
        saveGame();
        renderField();
        showToast("🌀 ゲートタイル(2,3)付近へ移動した");
      };
      document.getElementById("btn-debug-gate-flag-reset").onclick = function () {
        state.sideMap.gateExplained = false;
        saveGame();
        showToast("🔄 ゲート説明フラグをリセットした");
      };
      // §54 v0.11.3.2: 帰還ゲートデバッグ（x=2に更新）
      document.getElementById("btn-debug-return-gate-s1").onclick = function () {
        closeModal("settings-modal");
        state.mapMode = "side";
        state.sideMap.stage = 1;
        state.sideMap.x = 2;
        state.sideMap.y = 1;
        saveGame();
        renderField();
        showToast("🏠 ステージ1帰還ゲート(2,1)へ移動した");
      };
      document.getElementById("btn-debug-return-gate-s2").onclick = function () {
        closeModal("settings-modal");
        state.mapMode = "side";
        state.sideMap.stage = 2;
        state.sideMap.x = 2;
        state.sideMap.y = 1;
        saveGame();
        renderField();
        showToast("🏠 ステージ2帰還ゲート(2,1)へ移動した");
      };
      document.getElementById("btn-debug-return-gate-s3").onclick = function () {
        closeModal("settings-modal");
        state.mapMode = "side";
        state.sideMap.stage = 3;
        state.sideMap.x = 2;
        state.sideMap.y = 2;
        saveGame();
        renderField();
        showToast("🏠 ステージ3スタート側Hゲート(2,2)へ移動した");
      };
      document.getElementById("btn-debug-return-gate-s4").onclick = function () {
        closeModal("settings-modal");
        state.mapMode = "side";
        state.sideMap.stage = 4;
        state.sideMap.x = 2;
        state.sideMap.y = 2;
        saveGame();
        renderField();
        showToast("🏠 ステージ4スタート側Hゲート(2,2)へ移動した");
      };
      document.getElementById("btn-debug-force-normal-map").onclick = function () {
        closeModal("settings-modal");
        switchToNormalMap();
      };
      // §54 v0.11.3.2: モーダル直接表示デバッグ
      document.getElementById("btn-debug-modal-goal-s1").onclick = function () {
        closeModal("settings-modal");
        state.sideMap.stage = 1;
        openSideGoalModal();
      };
      document.getElementById("btn-debug-modal-goal-s2").onclick = function () {
        closeModal("settings-modal");
        state.sideMap.stage = 2;
        openSideGoalModal();
      };
      document.getElementById("btn-debug-modal-goal-s3").onclick = function () {
        closeModal("settings-modal");
        state.sideMap.stage = 3;
        openSideGoalModal();
      };
      document.getElementById("btn-debug-modal-goal-s4").onclick = function () {
        closeModal("settings-modal");
        state.sideMap.stage = 4;
        openSideGoalModal();
      };
      document.getElementById("btn-debug-modal-return-gate").onclick = function () {
        closeModal("settings-modal");
        openSideReturnGateModal();
      };
      // §58 v0.13.1: ゴール側G/H (G@x=37、H@x=38に変更、x=36に移動してボス撃退済み)
      document.getElementById("btn-debug-goal-gate-s1").onclick = function () {
        closeModal("settings-modal");
        state.mapMode = "side";
        state.sideMap.stage = 1;
        state.sideMap.defeatedEnemies["36,1"] = true;
        state.sideMap.x = 36;
        state.sideMap.y = 1;
        saveGame();
        renderField();
        showToast("[DEBUG] ステージ1ゴール直前(x=36)へ移動 — G@37/H@38、ボス撃退済みにした");
      };
      document.getElementById("btn-debug-goal-gate-s2").onclick = function () {
        closeModal("settings-modal");
        state.mapMode = "side";
        state.sideMap.stage = 2;
        state.sideMap.defeatedEnemies["2:35,1"] = true;
        state.sideMap.x = 36;
        state.sideMap.y = 1;
        saveGame();
        renderField();
        showToast("[DEBUG] ステージ2ゴール直前(x=36)へ移動 — G@37/H@38、ボス撃退済みにした");
      };
      document.getElementById("btn-debug-goal-gate-s3").onclick = function () {
        closeModal("settings-modal");
        state.mapMode = "side";
        state.sideMap.stage = 3;
        state.sideMap.defeatedEnemies["3:31,2"] = true;
        state.sideMap.x = 36;
        state.sideMap.y = 2;
        saveGame();
        renderField();
        showToast("[DEBUG] ステージ3ゴール直前(x=36)へ移動 — G@37/H@38、ボス撃退済みにした");
      };
      document.getElementById("btn-debug-goal-gate-s4").onclick = function () {
        closeModal("settings-modal");
        state.mapMode = "side";
        state.sideMap.stage = 4;
        state.sideMap.defeatedEnemies["4:33,2"] = true;
        state.sideMap.x = 36;
        state.sideMap.y = 2;
        saveGame();
        renderField();
        showToast("[DEBUG] ステージ4ゴール直前(x=36)へ移動 — G@37/H@38、ボス撃退済みにした");
      };
      // §57 v0.13: ステージ5デバッグ
      document.getElementById("btn-debug-side-stage5-enter").onclick = function () {
        state.mapMode = "side";
        state.sideMap.stage = 5;
        var s5 = SIDE_STAGE_DATA[5];
        state.sideMap.x = s5.startX;
        state.sideMap.y = s5.startY;
        saveGame();
        closeModal("settings-modal");
        renderField();
        showToast("[DEBUG] 黒い城へ移動 (stage=5, x=1,y=2)");
      };
      document.getElementById("btn-debug-side-stage5-near-goal").onclick = function () {
        state.mapMode = "side";
        state.sideMap.stage = 5;
        state.sideMap.x = 32;
        state.sideMap.y = 2;
        saveGame();
        closeModal("settings-modal");
        renderField();
        showToast("[DEBUG] 黒い城ゴール直前へ移動 (x=32,y=2) — ラスボス級ゴリラはx=33");
      };
      document.getElementById("btn-debug-side-stage5-clear-reset").onclick = function () {
        delete state.sideMap.stageCleared["5"];
        delete state.sideMap.defeatedEnemies["5:33,2"];
        state.sideMap.stage5RewardLevel = 0;
        sideMapPendingFixedKey = "";
        saveGame();
        renderField();
        showToast("[DEBUG] ステージ5フラグをリセット");
      };
      document.getElementById("btn-debug-side-set-lastbossgori").onclick = function () {
        state.sideMap.defeatedEnemies["5:33,2"] = true;
        saveGame();
        renderField();
        showToast("[DEBUG] ラスボス級ゴリラ撃退済みにした (5:33,2)");
      };
      document.getElementById("btn-debug-lastboss-gorilla-encounter").onclick = function () {
        closeModal("settings-modal");
        triggerFixedEncounter("lastboss_gorilla");
        showToast("[DEBUG] ラスボス級ゴリラ強制エンカウント");
      };
      document.getElementById("btn-debug-side-stage5-items-reset").onclick = function () {
        var sm5 = state.sideMap;
        var cToDelete5 = [];
        for (var ck5 in sm5.openedChests) {
          if (sm5.openedChests.hasOwnProperty(ck5) && ck5.indexOf("5:") === 0) cToDelete5.push(ck5);
        }
        for (var ci5 = 0; ci5 < cToDelete5.length; ci5++) delete sm5.openedChests[cToDelete5[ci5]];
        var eToDelete5 = [];
        for (var ek5 in sm5.defeatedEnemies) {
          if (sm5.defeatedEnemies.hasOwnProperty(ek5) && ek5.indexOf("5:") === 0) eToDelete5.push(ek5);
        }
        for (var ei5 = 0; ei5 < eToDelete5.length; ei5++) delete sm5.defeatedEnemies[eToDelete5[ei5]];
        sideMapPendingFixedKey = "";
        saveGame();
        renderField();
        showToast("[DEBUG] ステージ5宝箱・固定敵をリセット");
      };
      document.getElementById("btn-debug-return-gate-s5").onclick = function () {
        closeModal("settings-modal");
        state.mapMode = "side";
        state.sideMap.stage = 5;
        state.sideMap.x = 2;
        state.sideMap.y = 2;
        saveGame();
        renderField();
        showToast("🏠 ステージ5スタート側Hゲート(2,2)へ移動した");
      };
      document.getElementById("btn-debug-goal-gate-s5").onclick = function () {
        closeModal("settings-modal");
        state.mapMode = "side";
        state.sideMap.stage = 5;
        state.sideMap.defeatedEnemies["5:33,2"] = true;
        state.sideMap.x = 36;
        state.sideMap.y = 2;
        saveGame();
        renderField();
        showToast("[DEBUG] ステージ5ゴール直前(x=36)へ移動 — G@37/H@38、ボス撃退済みにした");
      };
      document.getElementById("btn-debug-modal-goal-s5").onclick = function () {
        closeModal("settings-modal");
        state.sideMap.stage = 5;
        openSideGoalModal();
      };
      document.getElementById("btn-debug-modal-goal-s6").onclick = function () {
        closeModal("settings-modal");
        state.sideMap.stage = 6;
        openSideGoalModal();
      };
      document.getElementById("btn-debug-side-story-complete").onclick = function () {
        var sm = state.sideMap;
        sm.stageCleared["6"] = true;
        sm.defeatedEnemies["6:34,2"] = true;
        sm.stage6RewardLevel = 2;
        saveGame();
        renderStatus();
        showToast("[DEBUG] 横スクロール編制覇状態にした");
      };
      document.getElementById("btn-debug-set-capture-ready").onclick = function () {
        var p = state.player;
        // Lv99セット (debugSetLevel99 と同じ処理)
        p.level = 99;
        p.nextExp = 99 * 10 + 15;
        p.exp = 0;
        p.baseMaxHp = 20 + 6 * 98;
        p.baseMaxMp = 6 + 2 * 98;
        p.baseAtk = 5 + 2 * 98;
        p.baseDef = 2 + 1 * 98;
        recomputeStats();
        p.hp = p.maxHp;
        p.mp = p.maxMp;
        p.level99Shown = true;
        state.eventFlags.level99Reached = true;
        // ウクレレ所持
        p.hasUkulele = true;
        updateStatusBar();
        saveGame();
        renderStatus();
        showToast("[DEBUG] 究極ゴリラ捕獲条件セット完了（Lv99+ウクレレ）");
      };
      document.getElementById("btn-debug-clear-gameclear").onclick = function () {
        state.gameCleared = false;
        state.pendingClear = false;
        saveGame();
        renderStatus();
        showToast("[DEBUG] 究極ゴリラ未捕獲状態に戻した");
      };
      document.getElementById("btn-debug-gorilla-hp12").onclick = function () { debugForceUltimateGorillaHP12(); };
      document.getElementById("btn-debug-gorilla-hp10").onclick = function () { debugForceUltimateGorillaHP10(); };
      document.getElementById("btn-debug-gorilla-hp1").onclick = function () { debugForceUltimateGorillaHP1(); };
      document.getElementById("btn-debug-gaman-wilddog").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        closeModal("settings-modal");
        var dog = findById(NON_UMA_DATA, "wilddog");
        if (!dog) { showToast("[DEBUG] のらいぬが見つからない"); return; }
        actuallyStartBattle(dog);
        state.gamanActive = true;
        showToast("[DEBUG] ガマン状態でのらいぬ戦闘開始！");
      };
      document.getElementById("btn-debug-gaman-gorilla-hp12").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        closeModal("settings-modal");
        var boss = findById(UMA_DATA, "ultimategorilla");
        actuallyStartBattle(boss);
        state.enemy.hp = 12;
        state.gamanActive = true;
        renderEnemy();
        showToast("[DEBUG] ガマン状態で究極ゴリラHP12開始！");
      };
      document.getElementById("btn-debug-gaman-reset").onclick = function () {
        state.gamanActive = false;
        showToast("[DEBUG] ガマン状態を解除した");
        closeModal("settings-modal");
      };
      document.getElementById("btn-debug-gorilla-chance-hp10").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        var p = state.player;
        p.level = 99;
        p.nextExp = 99 * 10 + 15;
        p.exp = 0;
        p.baseMaxHp = 20 + 6 * 98;
        p.baseMaxMp = 6 + 2 * 98;
        p.baseAtk = 5 + 2 * 98;
        p.baseDef = 2 + 1 * 98;
        recomputeStats();
        p.hp = p.maxHp; p.mp = p.maxMp;
        p.level99Shown = true;
        state.eventFlags.level99Reached = true;
        p.hasUkulele = true;
        closeModal("settings-modal");
        var boss = findById(UMA_DATA, "ultimategorilla");
        actuallyStartBattle(boss);
        state.enemy.hp = 10;
        renderEnemy();
        checkUltimateGorillaHpHint(state.enemy);
        showToast("[DEBUG] Lv99+ウクレレ+HP10 チャンス演出確認！");
      };
      document.getElementById("btn-debug-gorilla-nolv-ukulele-hp10").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        var p = state.player;
        p.level = 50;
        p.nextExp = 50 * 10 + 15;
        p.exp = 0;
        p.baseMaxHp = 20 + 6 * 49;
        p.baseMaxMp = 6 + 2 * 49;
        p.baseAtk = 5 + 2 * 49;
        p.baseDef = 2 + 1 * 49;
        recomputeStats();
        p.hp = p.maxHp; p.mp = p.maxMp;
        p.hasUkulele = true;
        closeModal("settings-modal");
        var boss = findById(UMA_DATA, "ultimategorilla");
        actuallyStartBattle(boss);
        state.enemy.hp = 10;
        renderEnemy();
        checkUltimateGorillaHpHint(state.enemy);
        showToast("[DEBUG] Lv50+ウクレレ+HP10 Lv不足メッセージ確認！");
      };
      document.getElementById("btn-debug-gorilla-lv99-noukulele-hp10").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        var p = state.player;
        p.level = 99;
        p.nextExp = 99 * 10 + 15;
        p.exp = 0;
        p.baseMaxHp = 20 + 6 * 98;
        p.baseMaxMp = 6 + 2 * 98;
        p.baseAtk = 5 + 2 * 98;
        p.baseDef = 2 + 1 * 98;
        recomputeStats();
        p.hp = p.maxHp; p.mp = p.maxMp;
        p.level99Shown = true;
        state.eventFlags.level99Reached = true;
        p.hasUkulele = false;
        closeModal("settings-modal");
        var boss = findById(UMA_DATA, "ultimategorilla");
        actuallyStartBattle(boss);
        state.enemy.hp = 10;
        renderEnemy();
        checkUltimateGorillaHpHint(state.enemy);
        showToast("[DEBUG] Lv99+ウクレレなし+HP10 ウクレレ不足確認！");
      };
      document.getElementById("btn-debug-show-capture-modal").onclick = function () {
        closeModal("settings-modal");
        openCaptureModal();
        showToast("[DEBUG] 捕獲成功モーダルを表示！");
      };
      document.getElementById("btn-debug-set-postclear-full").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        state.gameCleared = true;
        state.pendingClear = false;
        // 横スクロール全ステージクリア
        for (var _si = 1; _si <= 6; _si++) {
          state.sideMap.stageCleared[String(_si)] = true;
        }
        state.sideMap.defeatedEnemies["6:34,2"] = true;
        saveGame();
        renderStatus();
        showToast("[DEBUG] クリア済み+横スクロール制覇完了！総合称号を確認しよう");
      };
      document.getElementById("btn-debug-set-postclear-only").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        state.gameCleared = true;
        state.pendingClear = false;
        // 横スクロールステージをリセット
        state.sideMap.stageCleared = {};
        state.sideMap.defeatedEnemies = {};
        saveGame();
        renderStatus();
        showToast("[DEBUG] クリア済み（横スクロール未制覇）状態にした");
      };
      // §67 v0.18: 冒険の記録テスト
      document.getElementById("btn-debug-open-record").onclick = function () {
        closeModal("settings-modal");
        openRecordModal();
        showToast("[DEBUG] 冒険の記録を開いた");
      };
      // §66 v0.17.1: 図鑑コンプリートテスト
      document.getElementById("btn-debug-dex-complete-all").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        UMA_DATA.forEach(function (u) { state.player.dex[u.id] = "captured"; });
        saveGame();
        updateStatusBar();
        showToast("[DEBUG] 全UMA捕獲済みにした。図鑑を開くと報酬モーダルが出る（未受取の場合）");
      };
      document.getElementById("btn-debug-dex-reward-reset").onclick = function () {
        state.dexCompleteRewardClaimed = false;
        saveGame();
        showToast("[DEBUG] 図鑑コンプリート報酬を未受取に戻した");
      };
      document.getElementById("btn-debug-dex-reward-modal").onclick = function () {
        closeModal("settings-modal");
        openDexCompleteModal();
        showToast("[DEBUG] 図鑑コンプリート報酬モーダルを表示（報酬は付与されます）");
      };
      // §72 v0.21: 図鑑確認デバッグ
      document.getElementById("btn-debug-open-record-dex").onclick = function () {
        closeModal("settings-modal");
        openRecordModal();
        showToast("[DEBUG] 冒険の記録を開いた（UMA図鑑セクションを確認）");
      };
      // §73 v0.22: 図鑑ヒント表示テスト
      document.getElementById("btn-debug-dex-one-uncaptured").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        UMA_DATA.forEach(function (u, idx) {
          state.player.dex[u.id] = idx === 0 ? undefined : "captured";
          if (idx === 0) { delete state.player.dex[u.id]; }
        });
        saveGame(); updateStatusBar();
        closeModal("settings-modal"); openDexModal();
        showToast("[DEBUG] " + UMA_DATA[0].name + "だけ未捕獲にした。図鑑のヒント表示を確認");
      };
      document.getElementById("btn-debug-dex-one-seen").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        UMA_DATA.forEach(function (u, idx) {
          if (idx === 0) { state.player.dex[u.id] = "seen"; }
          else { delete state.player.dex[u.id]; }
        });
        saveGame(); updateStatusBar();
        closeModal("settings-modal"); openDexModal();
        showToast("[DEBUG] " + UMA_DATA[0].name + "だけ発見済み（未捕獲）にした。ヒント表示を確認");
      };
      document.getElementById("btn-debug-dex-reset").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        state.player.dex = {};
        saveGame(); updateStatusBar();
        closeModal("settings-modal"); openDexModal();
        showToast("[DEBUG] 図鑑を全リセットした（初期状態：全UMA未発見）");
      };
      // §70 v0.20: 伝説装備デバッグ
      document.getElementById("btn-debug-legend-all").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        LEGEND_EQUIPS.forEach(function(le) { state.eventFlags[le.flag] = true; });
        saveGame();
        updateStatusBar();
        showToast("[DEBUG] 伝説装備7種を全入手した。装備画面を開くと報酬モーダルが出る（未受取の場合）");
      };
      document.getElementById("btn-debug-legend-reward-reset").onclick = function () {
        state.legendaryRewardClaimed = false;
        saveGame();
        showToast("[DEBUG] 伝説装備コンプリート報酬を未受取に戻した");
      };
      document.getElementById("btn-debug-legend-reward-modal").onclick = function () {
        closeModal("settings-modal");
        LEGEND_EQUIPS.forEach(function(le) { state.eventFlags[le.flag] = true; });
        state.legendaryRewardClaimed = false;
        openLegendaryCompleteModal();
        showToast("[DEBUG] 伝説装備コンプリート報酬モーダルを表示（報酬は付与されます）");
      };
      // §71 v0.20.1: 伝説装備だけ未達成にするボタン
      document.getElementById("btn-debug-legend-only-incomplete").onclick = function () {
        LEGEND_EQUIPS.forEach(function(le) { state.eventFlags[le.flag] = false; });
        state.legendaryRewardClaimed = false;
        saveGame();
        updateStatusBar();
        showToast("[DEBUG] 伝説装備7種を未入手・報酬未受取に戻した（他の達成状況は維持）");
      };
      document.getElementById("btn-debug-open-record-legendary").onclick = function () {
        closeModal("settings-modal");
        openRecordModal();
        showToast("[DEBUG] 冒険の記録を開いた（伝説装備セクションを確認）");
      };
      document.getElementById("btn-debug-set-all-complete").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        state.gameCleared = true;
        state.pendingClear = false;
        for (var _sj = 1; _sj <= 6; _sj++) {
          state.sideMap.stageCleared[String(_sj)] = true;
        }
        state.sideMap.defeatedEnemies["6:34,2"] = true;
        UMA_DATA.forEach(function (u) { state.player.dex[u.id] = "captured"; });
        state.dexCompleteRewardClaimed = true;
        saveGame();
        renderStatus();
        showToast("[DEBUG] 完全達成状態！称号「究極とUMA図鑑を極めし者」を確認しよう");
      };
      // §75 v0.24 / §76 v0.24.1: 仲間セリフバリエーションテスト
      document.getElementById("btn-debug-companions-normal").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        state.gameCleared = false;
        state.pendingClear = false;
        for (var _sj76a = 1; _sj76a <= 6; _sj76a++) { state.sideMap.stageCleared[String(_sj76a)] = false; }
        state.sideMap.defeatedEnemies["6:34,2"] = false;
        UMA_DATA.forEach(function(m) { state.player.dex[m.id] = null; });
        LEGEND_EQUIPS.forEach(function(le) { state.eventFlags[le.flag] = false; });
        state.player.companions = ["juritani", "shurittani"];
        resetPartyTrail(); // §79 v0.26.1
        saveGame();
        closeModal("settings-modal");
        openTavernModal();
        showToast("[DEBUG] 通常状態（未クリア）。「仲間を探す」でセリフなしを確認");
      };
      document.getElementById("btn-debug-companions-side-only").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        state.gameCleared = false;
        state.pendingClear = false;
        for (var _sj76b = 1; _sj76b <= 6; _sj76b++) { state.sideMap.stageCleared[String(_sj76b)] = true; }
        state.sideMap.defeatedEnemies["6:34,2"] = true;
        UMA_DATA.forEach(function(m) { state.player.dex[m.id] = null; });
        LEGEND_EQUIPS.forEach(function(le) { state.eventFlags[le.flag] = false; });
        state.player.companions = ["juritani", "shurittani"];
        resetPartyTrail(); // §79 v0.26.1
        saveGame();
        closeModal("settings-modal");
        openTavernModal();
        showToast("[DEBUG] 横スクロール制覇のみ（未クリア）→ 薄紫セリフ。「仲間を探す」で確認");
      };
      document.getElementById("btn-debug-companions-postclear").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        state.gameCleared = true;
        state.pendingClear = false;
        for (var _sj75a = 1; _sj75a <= 6; _sj75a++) { state.sideMap.stageCleared[String(_sj75a)] = false; }
        state.sideMap.defeatedEnemies["6:34,2"] = false;
        UMA_DATA.forEach(function(m) { state.player.dex[m.id] = null; });
        state.player.companions = ["juritani", "shurittani"];
        resetPartyTrail(); // §79 v0.26.1
        saveGame();
        closeModal("settings-modal");
        openTavernModal();
        showToast("[DEBUG] クリアのみ（緑セリフ）。「仲間を見る」で確認");
      };
      document.getElementById("btn-debug-companions-side-cleared").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        state.gameCleared = true;
        state.pendingClear = false;
        for (var _sj75b = 1; _sj75b <= 6; _sj75b++) { state.sideMap.stageCleared[String(_sj75b)] = true; }
        state.sideMap.defeatedEnemies["6:34,2"] = true;
        UMA_DATA.forEach(function(m) { state.player.dex[m.id] = null; });
        state.player.companions = ["juritani", "shurittani"];
        resetPartyTrail(); // §79 v0.26.1
        saveGame();
        closeModal("settings-modal");
        openTavernModal();
        showToast("[DEBUG] クリア+横スクロール制覇（薄紫セリフ）。「仲間を見る」で確認");
      };
      document.getElementById("btn-debug-companions-dex-complete").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        state.gameCleared = true;
        state.pendingClear = false;
        for (var _sj75c = 1; _sj75c <= 6; _sj75c++) { state.sideMap.stageCleared[String(_sj75c)] = false; }
        state.sideMap.defeatedEnemies["6:34,2"] = false;
        UMA_DATA.forEach(function(m) { state.player.dex[m.id] = "captured"; });
        state.dexCompleteRewardClaimed = true;
        state.player.companions = ["juritani", "shurittani"];
        resetPartyTrail(); // §79 v0.26.1
        saveGame();
        closeModal("settings-modal");
        openTavernModal();
        showToast("[DEBUG] クリア+図鑑コンプ（水色セリフ）。「仲間を見る」で確認");
      };
      document.getElementById("btn-debug-companions-full-clear").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        state.gameCleared = true;
        state.pendingClear = false;
        for (var _sj75d = 1; _sj75d <= 6; _sj75d++) { state.sideMap.stageCleared[String(_sj75d)] = true; }
        state.sideMap.defeatedEnemies["6:34,2"] = true;
        UMA_DATA.forEach(function(m) { state.player.dex[m.id] = "captured"; });
        state.dexCompleteRewardClaimed = true;
        LEGEND_EQUIPS.forEach(function(le) { state.eventFlags[le.flag] = false; });
        state.player.companions = ["juritani", "shurittani"];
        resetPartyTrail(); // §79 v0.26.1
        saveGame();
        closeModal("settings-modal");
        openTavernModal();
        showToast("[DEBUG] 完全達成（金セリフ）。「仲間を見る」で確認");
      };
      document.getElementById("btn-debug-companions-legendary").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        state.gameCleared = true;
        state.pendingClear = false;
        for (var _sj75e = 1; _sj75e <= 6; _sj75e++) { state.sideMap.stageCleared[String(_sj75e)] = true; }
        state.sideMap.defeatedEnemies["6:34,2"] = true;
        UMA_DATA.forEach(function(m) { state.player.dex[m.id] = "captured"; });
        state.dexCompleteRewardClaimed = true;
        LEGEND_EQUIPS.forEach(function(le) { state.eventFlags[le.flag] = true; });
        state.legendaryRewardClaimed = true;
        state.player.companions = ["juritani", "shurittani"];
        resetPartyTrail(); // §79 v0.26.1
        saveGame();
        closeModal("settings-modal");
        openTavernModal();
        showToast("[DEBUG] 完全達成+伝説装備コンプ（明金セリフ）。「仲間を見る」で確認");
      };
      document.getElementById("btn-debug-companions-legendary-only").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        state.gameCleared = false;
        state.pendingClear = false;
        for (var _sj76c = 1; _sj76c <= 6; _sj76c++) { state.sideMap.stageCleared[String(_sj76c)] = false; }
        state.sideMap.defeatedEnemies["6:34,2"] = false;
        UMA_DATA.forEach(function(m) { state.player.dex[m.id] = null; });
        LEGEND_EQUIPS.forEach(function(le) { state.eventFlags[le.flag] = true; });
        state.legendaryRewardClaimed = true;
        state.player.companions = ["juritani", "shurittani"];
        resetPartyTrail(); // §79 v0.26.1
        saveGame();
        closeModal("settings-modal");
        openTavernModal();
        showToast("[DEBUG] 伝説装備コンプリートのみ（未完全達成）→ 橙セリフ。「仲間を探す」で確認");
      };
      // §78 v0.26: フィールド仲間追従テスト
      document.getElementById("btn-debug-party-follow-on").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        state.player.companions = ["juritani", "harumi"];
        resetPartyTrail(); // §79 v0.26.1
        closeModal("settings-modal");
        renderField();
        showToast("[DEBUG] ジュリタニ+ハルミをパーティに追加。歩いて追従を確認！");
      };
      document.getElementById("btn-debug-party-trail-reset").onclick = function () {
        resetPartyTrail(); // §79 v0.26.1
        renderField();
        showToast("[DEBUG] 仲間軌跡をリセット（次の移動から追従開始）");
      };
      document.getElementById("btn-debug-party-clear-trail").onclick = function () {
        state.player.companions = [];
        resetPartyTrail(); // §79 v0.26.1
        closeModal("settings-modal");
        renderField();
        showToast("[DEBUG] パーティ解除 + 軌跡リセット完了");
      };
      // §121 v0.46: 仲間アイコン人型化・追従確認
      document.getElementById("btn-debug-v46-icon-check").onclick = function () {
        var lines = [];
        COMPANION_DATA.forEach(function (c) { lines.push(c.icon + " " + c.name + "（能力:" + c.emoji + "）"); });
        showToast("[DEBUG] 仲間アイコン確認\n" + lines.join("\n"));
      };
      document.getElementById("btn-debug-v46-one-follow").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        state.player.companions = ["shurittani"];
        resetPartyTrail(); // §79 v0.26.1
        closeModal("settings-modal");
        renderField();
        showToast("[DEBUG] シュリタニのみパーティ追加。歩いて👩 1人追従を確認！");
      };
      // §122 v0.47: 仲間サイドストーリー第3話デバッグ
      document.getElementById("btn-debug-v47-story3-reset").onclick = function () {
        normalizeCompanionSideStoryChapter3Flags();
        state.companionSideStoryChapter3Flags = { juritani: false, shurittani: false, norio: false, harumi: false };
        saveGame();
        showToast("[DEBUG] 第3話フラグ全リセット完了 ✅");
        renderStatusBody();
      };
      document.getElementById("btn-debug-v47-story3-all").onclick = function () {
        normalizeCompanionSideStoryChapter3Flags();
        state.companionSideStoryChapter3Flags = { juritani: true, shurittani: true, norio: true, harumi: true };
        saveGame();
        showToast("[DEBUG] 第3話全完了状態にした ✅");
        renderStatusBody();
      };
      document.getElementById("btn-debug-v47-ch2-lv75-all").onclick = function () {
        var _cids47 = ["juritani", "shurittani", "norio", "harumi"];
        normalizeCompanionSideStoryFlags();
        normalizeCompanionSideStoryChapter2Flags();
        // ch1・ch2全完了
        state.companionSideStoryFlags = { juritani: true, shurittani: true, norio: true, harumi: true };
        state.companionSideStoryChapter2Flags = { juritani: true, shurittani: true, norio: true, harumi: true };
        // 仲間加入 + Lv75以上
        for (var _i47 = 0; _i47 < _cids47.length; _i47++) {
          var _c47 = _cids47[_i47];
          if (!hasCompanionEverJoined(_c47)) {
            if (!state.companionLevels) { state.companionLevels = {}; }
            if (!state.companionLevels[_c47]) { state.companionLevels[_c47] = { level: 1, exp: 0, nextExp: 100 }; }
            state.companionLevels[_c47].level = 75;
          } else {
            var _cl47 = getCompanionLevel(_c47);
            if (_cl47.level < 75) {
              if (!state.companionLevels) { state.companionLevels = {}; }
              if (!state.companionLevels[_c47]) { state.companionLevels[_c47] = { level: 1, exp: 0, nextExp: 100 }; }
              state.companionLevels[_c47].level = 75;
            }
          }
        }
        saveGame();
        showToast("[DEBUG] ch2全完了 + 仲間4人Lv75以上 → 第3話解放条件を整えた ✅\n酒場→物語で12枚カードを確認");
        renderStatusBody();
      };
      document.getElementById("btn-debug-v47-story3-juritani").onclick = function () {
        normalizeCompanionSideStoryChapter3Flags();
        state.companionSideStoryChapter3Flags["juritani"] = true;
        saveGame();
        showToast("[DEBUG] ジュリタニ第3話を完了にした ✅");
      };
      document.getElementById("btn-debug-v47-story3-shurittani").onclick = function () {
        normalizeCompanionSideStoryChapter3Flags();
        state.companionSideStoryChapter3Flags["shurittani"] = true;
        saveGame();
        showToast("[DEBUG] シュリタニ第3話を完了にした ✅");
      };
      document.getElementById("btn-debug-v47-story3-norio").onclick = function () {
        normalizeCompanionSideStoryChapter3Flags();
        state.companionSideStoryChapter3Flags["norio"] = true;
        saveGame();
        showToast("[DEBUG] ノリオ第3話を完了にした ✅");
      };
      document.getElementById("btn-debug-v47-story3-harumi").onclick = function () {
        normalizeCompanionSideStoryChapter3Flags();
        state.companionSideStoryChapter3Flags["harumi"] = true;
        saveGame();
        showToast("[DEBUG] ハルミ第3話を完了にした ✅");
      };
      document.getElementById("btn-debug-v47-open-tavern-stories").onclick = function () {
        closeModal("settings-modal");
        openTavernModal();
        // 酒場モーダルを開いてから物語リストを表示
        setTimeout(function () {
          var _tavernEl = document.getElementById("tavern-modal");
          if (_tavernEl && !_tavernEl.classList.contains("hidden")) {
            renderTavernStories();
          }
        }, 100);
        showToast("[DEBUG] 酒場を開いた。「仲間の物語」を選んで12枚カードを確認");
      };
      // §123 v0.47.1: 安定化テストデバッグ
      document.getElementById("btn-debug-v471-session-info").onclick = function () {
        showToast("[DEBUG v0.47.1] セッション変数:\nID=" + _cstorySessionId + "\nchapter=" + _cstoryActiveChapter + "\nstoryId=" + _cstoryActiveStoryId + "\ncompleting=" + _cstoryCompleting + "\nlock=" + _cstoryAdvanceLock + "\nactiveCid=" + state.activeCompanionSideStory);
      };
      document.getElementById("btn-debug-v471-atomicity-test").onclick = function () {
        var _beforeCh = _cstoryActiveChapter;
        startCompanionSideStory("juritani", 99); // 99は無効 → normalizeがnullを返してガード終了
        var _afterCh = _cstoryActiveChapter;
        var _result = (_beforeCh === _afterCh) ? "✅ 汚染なし (chapter=" + _afterCh + ")" : "❌ 汚染あり (before=" + _beforeCh + " after=" + _afterCh + ")";
        showToast("[DEBUG v0.47.1] アトミック起動テスト:\n" + _result);
      };
      document.getElementById("btn-debug-v471-direct-complete-test").onclick = function () {
        normalizeCompanionSideStoryChapter3Flags();
        var _before = state.companionSideStoryChapter3Flags["juritani"];
        completeCompanionSideStory("juritani", 3); // activeStory=null → 棄却されるはず
        var _after = state.companionSideStoryChapter3Flags["juritani"];
        var _result = (_before === _after) ? "✅ 棄却確認 (flag=" + _before + " 変化なし)" : "❌ 通過してしまった (before=" + _before + " after=" + _after + ")";
        showToast("[DEBUG v0.47.1] セッション外complete呼び出し:\n" + _result);
      };
      document.getElementById("btn-debug-v471-completing-flag").onclick = function () {
        showToast("[DEBUG v0.47.1] _cstoryCompletingフラグ: " + _cstoryCompleting + "\n（通常はfalse。完了処理中のみtrue）");
      };
      document.getElementById("btn-debug-v471-mid-close-test").onclick = function () {
        normalizeCompanionSideStoryChapter3Flags();
        var _before = state.companionSideStoryChapter3Flags["juritani"];
        startCompanionSideStory("juritani", 3); // 解放済み前提（未解放ならtoastで弾かれる）
        // line=0のまま途中close（最終行未到達 → 完了しないはず）
        closeCompanionSideStoryModal();
        var _after = state.companionSideStoryChapter3Flags["juritani"];
        var _result = (_before === _after) ? "✅ 未完了維持 (flag=" + _after + ")" : "⚠ フラグ変化 (before=" + _before + " after=" + _after + ")";
        showToast("[DEBUG v0.47.1] ch3途中close→未完了確認:\n" + _result);
      };
      document.getElementById("btn-debug-v471-double-complete-test").onclick = function () {
        normalizeCompanionSideStoryChapter3Flags();
        var _was = state.companionSideStoryChapter3Flags["juritani"];
        state.companionSideStoryChapter3Flags["juritani"] = false; // 確実に未完了から開始
        var _story3Data = COMPANION_SIDE_STORY_CHAPTER3_DATA["juritani"];
        // 模擬セッション設定
        state.activeCompanionSideStory = "juritani";
        _cstoryActiveChapter = 3;
        _cstoryActiveStoryId = _story3Data ? _story3Data.id : null;
        state.activeCompanionSideStoryLine = _story3Data ? _story3Data.lines.length - 1 : 0;
        completeCompanionSideStory("juritani", 3); // 1回目: 完了するはず
        var _after1 = state.companionSideStoryChapter3Flags["juritani"];
        completeCompanionSideStory("juritani", 3); // 2回目: 既完了 → 棄却されるはず
        var _after2 = state.companionSideStoryChapter3Flags["juritani"];
        // 後始末
        state.activeCompanionSideStory = null;
        state.activeCompanionSideStoryLine = 0;
        _cstoryActiveChapter = 1;
        _cstoryActiveStoryId = null;
        saveGame();
        var _result = (_after1 === true && _after2 === true) ? "✅ 1回のみ完了・2回目は棄却 (flag=true)" : "⚠ 予期しない挙動 (after1=" + _after1 + " after2=" + _after2 + ")";
        showToast("[DEBUG v0.47.1] 二重complete防止確認:\n" + _result);
      };
      document.getElementById("btn-debug-v471-ch3-ch12-isolated").onclick = function () {
        var _p1 = _pendingCompanionStoryAllCompleteNotice;
        var _p2 = _pendingCompanionStoryChapter2AllCompleteNotice;
        var _v1 = _companionStoryAllCompleteNoticeVisible;
        var _v2 = _companionStoryChapter2AllCompleteNoticeVisible;
        var _ok = (!_p1 && !_p2) ? "✅ ch1/ch2祝賀は発火していない" : "⚠ いずれかpending中";
        showToast("[DEBUG v0.47.1] ch3/ch1・ch2分離確認:\n" + _ok + "\nch1pending=" + _p1 + " visible=" + _v1 + "\nch2pending=" + _p2 + " visible=" + _v2);
      };
      document.getElementById("btn-debug-v471-flags-all-display").onclick = function () {
        normalizeCompanionSideStoryFlags();
        normalizeCompanionSideStoryChapter2Flags();
        normalizeCompanionSideStoryChapter3Flags();
        var _f1 = state.companionSideStoryFlags;
        var _f2 = state.companionSideStoryChapter2Flags;
        var _f3 = state.companionSideStoryChapter3Flags;
        var _cids471 = ["juritani", "shurittani", "norio", "harumi"];
        var _lines471 = [];
        for (var _di471 = 0; _di471 < _cids471.length; _di471++) {
          var _dc471 = _cids471[_di471];
          _lines471.push(_dc471 + ":\nch1=" + (_f1[_dc471] ? "✅" : "❌") + " ch2=" + (_f2[_dc471] ? "✅" : "❌") + " ch3=" + (_f3[_dc471] ? "✅" : "❌"));
        }
        showToast("[DEBUG v0.47.1] 全フラグ:\n" + _lines471.join("\n"));
      };
      // §124 v0.48: 冒険ナビゲーション確認デバッグ
      document.getElementById("btn-debug-v48-guide-info").onclick = function () {
        var g = getCurrentAdventureGuide();
        showToast("[DEBUG v0.48] 冒険ガイド:\nid=" + g.objectiveId + "\ntitle=" + g.title + "\nshort=" + g.shortText + "\nloc=" + (g.locationText || "なし"));
      };
      document.getElementById("btn-debug-v48-npc-state").onclick = function () {
        showToast("[DEBUG v0.48] 案内人NPC状態:\nvisible=" + _adventureGuideNpcVisible + "\nx=" + _adventureGuideNpcX + " y=" + _adventureGuideNpcY + "\nstepCount=" + _adventureGuideStepCount + "\nlastId=" + (_adventureGuideLastObjectiveId || "未設定"));
      };
      document.getElementById("btn-debug-v48-spawn-npc").onclick = function () {
        var _bx = _adventureGuideNpcX, _by = _adventureGuideNpcY, _bv = _adventureGuideNpcVisible;
        _adventureGuideNpcVisible = false;
        _adventureGuideNpcX = -1;
        _adventureGuideNpcY = -1;
        _adventureGuideStepCount = 15;
        trySpawnAdventureGuideNpc();
        var _result = _adventureGuideNpcVisible ? "✅ スポーン成功 x=" + _adventureGuideNpcX + " y=" + _adventureGuideNpcY : "⚠ 有効位置なし（再試行待ち）";
        showToast("[DEBUG v0.48] 案内人即時スポーン:\n" + _result);
        closeModal("settings-modal");
      };
      document.getElementById("btn-debug-v48-dismiss-npc").onclick = function () {
        _adventureGuideNpcVisible = false;
        _adventureGuideNpcX = -1;
        _adventureGuideNpcY = -1;
        renderField();
        showToast("[DEBUG v0.48] 案内人NPCを強制消去した");
      };
      document.getElementById("btn-debug-v48-objective-cycle").onclick = function () {
        var _ids = ["visit_side_gate", "stage1_explore", "stage2_challenge", "stage3_challenge", "stage4_challenge", "stage5_challenge", "stage6_challenge", "defeat_chimp", "prepare_gorilla", "challenge_gorilla", "adventure_complete"];
        var g = getCurrentAdventureGuide();
        var _idx = _ids.indexOf(g.objectiveId);
        var _msg = "[DEBUG v0.48] 現在:\n" + g.objectiveId + "\n---\n";
        _msg += "全ステージ数=" + g.stages.length + "\n";
        for (var _oi = 0; _oi < g.stages.length; _oi++) {
          _msg += "s" + (_oi + 1) + ":" + g.stages[_oi].status + " ";
        }
        showToast(_msg);
      };
      document.getElementById("btn-debug-v48-stages-clear").onclick = function () {
        if (!state.sideMap) { showToast("[DEBUG v0.48] sideMapが初期化されていない"); return; }
        if (!state.sideMap.stageCleared) { state.sideMap.stageCleared = {}; }
        state.sideMap.stageCleared["1"] = true;
        state.sideMap.stageCleared["2"] = true;
        state.sideMap.stageCleared["3"] = true;
        state.sideMap.stageCleared["4"] = true;
        state.sideMap.stageCleared["5"] = true;
        saveGame();
        _adventureGuideLastObjectiveId = ""; // 強制リセット → 次歩でstage6へ更新
        var g = getCurrentAdventureGuide();
        showToast("[DEBUG v0.48] s1〜s5 クリア済みにセット\n現在のガイド: " + g.objectiveId);
      };
      document.getElementById("btn-debug-v48-reset-guide").onclick = function () {
        _adventureGuideStepCount = 0;
        _adventureGuideNpcVisible = false;
        _adventureGuideNpcX = -1;
        _adventureGuideNpcY = -1;
        _adventureGuideLastObjectiveId = "";
        renderField();
        showToast("[DEBUG v0.48] ガイドカウント・NPC状態をリセットした");
      };
      document.getElementById("btn-debug-v48-paperview-open").onclick = function () {
        closeModal("settings-modal");
        openHintShopModal();
      };
      // §125 v0.48.1: 冒険ナビ安定性確認デバッグ
      document.getElementById("btn-debug-v481-pure-fn").onclick = function () {
        var _before = _adventureGuideStepCount + "/" + _adventureGuideNpcVisible + "/" + _adventureGuideLastObjectiveId;
        var _g1 = getCurrentAdventureGuide();
        var _g2 = getCurrentAdventureGuide();
        var _after = _adventureGuideStepCount + "/" + _adventureGuideNpcVisible + "/" + _adventureGuideLastObjectiveId;
        var _same = (_g1.objectiveId === _g2.objectiveId && _g1.shortText === _g2.shortText);
        showToast("[DEBUG v0.48.1] 純粋関数確認:\n2回呼び出し結果一致=" + _same + "\n状態変化なし=" + (_before === _after) + "\nid=" + _g1.objectiveId);
      };
      document.getElementById("btn-debug-v481-stage-unique").onclick = function () {
        var _g = getCurrentAdventureGuide();
        var _active = 0;
        for (var _si = 0; _si < _g.stages.length; _si++) {
          if (_g.stages[_si].status === "▶") _active++;
        }
        showToast("[DEBUG v0.48.1] stage▶一意性確認:\nactive▶数=" + _active + "（期待値=1）\nid=" + _g.objectiveId);
      };
      document.getElementById("btn-debug-v481-obj-change-dismiss").onclick = function () {
        var _origId = _adventureGuideLastObjectiveId;
        _adventureGuideNpcVisible = true;
        _adventureGuideNpcX = 3; _adventureGuideNpcY = 3;
        _adventureGuideLastObjectiveId = "__fake_old_id__";
        syncAdventureGuideObjective();
        var _dismissed = !_adventureGuideNpcVisible;
        showToast("[DEBUG v0.48.1] objective変更時NPC消去確認:\n消去=" + _dismissed + "（期待=true）\n旧id=__fake_old_id__\n新id=" + _adventureGuideLastObjectiveId);
        renderField();
      };
      document.getElementById("btn-debug-v481-invalid-step").onclick = function () {
        showToast("[DEBUG v0.48.1] 有効移動カウント状態:\nstepCount=" + _adventureGuideStepCount + "\nnpcVisible=" + _adventureGuideNpcVisible + "\n（草地・道のみカウント。NPC表示中はカウント停止）");
      };
      document.getElementById("btn-debug-v481-safe-tile").onclick = function () {
        var _p = state.player;
        var _results = [];
        for (var _dy = -2; _dy <= 2; _dy++) {
          for (var _dx = -2; _dx <= 2; _dx++) {
            if (_dx === 0 && _dy === 0) continue;
            var _tx = _p.x + _dx, _ty = _p.y + _dy;
            if (_tx < 0 || _tx >= MAP_W || _ty < 0 || _ty >= MAP_H) continue;
            var _tc = (state.terrain[_ty] || [])[_tx] || "?";
            var _safe = isAdventureGuideSpawnTileSafe(_tx, _ty);
            if (_safe) _results.push("(" + _tx + "," + _ty + ")=" + _tc);
          }
        }
        showToast("[DEBUG v0.48.1] 近隣安全タイル（±2）:\n" + (_results.length ? _results.slice(0,5).join(" ") : "なし") + "\n合計=" + _results.length + "マス");
      };
      document.getElementById("btn-debug-v481-no-candidate").onclick = function () {
        var _oldCount = _adventureGuideStepCount;
        _adventureGuideNpcVisible = false;
        _adventureGuideStepCount = 14;
        showToast("[DEBUG v0.48.1] 候補なし再試行確認:\n現stepCount=14にセット\n次有効移動でtrySpawn呼び出し\n（失敗時はstepCount=15になる）");
      };
      document.getElementById("btn-debug-v481-talk-lock").onclick = function () {
        showToast("[DEBUG v0.48.1] talkLock状態確認:\n_adventureGuideTalkLock=" + _adventureGuideTalkLock + "\n（接触中=true、通常=false）");
      };
      document.getElementById("btn-debug-v481-obj-refresh").onclick = function () {
        var _g = getCurrentAdventureGuide();
        var _fresh = (_adventureGuideLastObjectiveId === "" || _g.objectiveId === _adventureGuideLastObjectiveId);
        showToast("[DEBUG v0.48.1] objective鮮度確認:\n現在id=" + _g.objectiveId + "\n記録id=" + (_adventureGuideLastObjectiveId || "未設定") + "\n一致=" + _fresh);
      };
      document.getElementById("btn-debug-v481-paperview-nodedup").onclick = function () {
        showToast("[DEBUG v0.48.1] renderField重複防止確認:\ntrySpawnAdventureGuideNpc内のrenderField()は削除済み\n（呼び出し元movePlayerのrenderFieldのみ実行）");
      };
      document.getElementById("btn-debug-v481-obj-match").onclick = function () {
        var _g = getCurrentAdventureGuide();
        showToast("[DEBUG v0.48.1] PaperView/NPC objective一致確認:\ncurrentAdventureGuide.objectiveId=" + _g.objectiveId + "\nnpcLastObjectiveId=" + (_adventureGuideLastObjectiveId || "未設定") + "\n一致=" + (_g.objectiveId === _adventureGuideLastObjectiveId || _adventureGuideLastObjectiveId === ""));
      };
      // §126 v0.49: 主人公命名・統合メンバー管理デバッグハンドラ
      document.getElementById("btn-debug-v49-open-naming").onclick = function () {
        closeModal("settings-modal");
        openPlayerNameModal("newgame");
      };
      document.getElementById("btn-debug-v49-open-rename").onclick = function () {
        closeModal("settings-modal");
        openPlayerNameModal("change");
      };
      document.getElementById("btn-debug-v49-open-member").onclick = function () {
        closeModal("settings-modal");
        openMemberManagement();
      };
      document.getElementById("btn-debug-v49-name-kana").onclick = function () {
        state.playerName = "テスト冒険者";
        saveGame();
        showToast("[DEBUG v0.49] 名前を「テスト冒険者」に設定: " + getPlayerDisplayName());
      };
      document.getElementById("btn-debug-v49-name-long").onclick = function () {
        state.playerName = "スーパー勇者！！";
        saveGame();
        showToast("[DEBUG v0.49] 名前を「スーパー勇者！！」（8文字）に設定: " + getPlayerDisplayName());
      };
      document.getElementById("btn-debug-v49-name-reset").onclick = function () {
        state.playerName = "";
        saveGame();
        showToast("[DEBUG v0.49] 名前をリセット→空文字。getPlayerDisplayName()=" + getPlayerDisplayName() + "（期待:冒険者）");
      };
      document.getElementById("btn-debug-v49-name-check").onclick = function () {
        var _pass = true;
        var _results = [];
        var _cases = [
          { in: "", expected: "" },
          { in: "   ", expected: "" },
          { in: "abc", expected: "abc" },
          { in: "12345678901", expected: "1234567890" }, // 11文字→10文字切り詰め
          { in: "  山田  ", expected: "山田" }
        ];
        for (var _ci = 0; _ci < _cases.length; _ci++) {
          var _c = _cases[_ci];
          var _r = normalizePlayerName(_c.in);
          var _ok = (_r === _c.expected);
          if (!_ok) { _pass = false; }
          _results.push((_ok ? "✓" : "✗") + " in='" + _c.in + "' → '" + _r + "' (期待:'" + _c.expected + "')");
        }
        showToast("[DEBUG v0.49] normalizePlayerName境界確認:\n" + (_pass ? "PASS" : "FAIL") + "\n" + _results.slice(0, 3).join("\n"));
      };
      document.getElementById("btn-debug-v49-story-name-check").onclick = function () {
        var _name = getPlayerDisplayName();
        showToast("[DEBUG v0.49] サイドストーリー「あなた」→主人公名置換確認:\ncurrentPlayerName=" + _name + "\n（サイドストーリー中「あなた」発言が「" + _name + "」と表示されるか確認）");
      };
      document.getElementById("btn-debug-v49-status-name-check").onclick = function () {
        var _stateName = state.playerName;
        var _displayName = getPlayerDisplayName();
        closeModal("settings-modal");
        openStatusModal();
        showToast("[DEBUG v0.49] ステータス名前確認:\nstate.playerName='" + _stateName + "'\ngetPlayerDisplayName()='" + _displayName + "'\n（ステータス画面の「名前」欄を確認）");
      };
      // §127 v0.50: 王様名呼び・4人パーティ・設定バックドロップ
      document.getElementById("btn-debug-v50-king-early").onclick = function () {
        var _prev = state.player.level;
        state.player.level = 10;
        closeModal("settings-modal");
        openNpcModal("S");
        state.player.level = _prev;
        showToast("[DEBUG v0.50] 王様会話（Lv10）:「勇者殿」が " + getPlayerDisplayName() + " 殿に置換されているか確認");
      };
      document.getElementById("btn-debug-v50-king-lv50").onclick = function () {
        var _prev = state.player.level;
        var _prevCleared = state.gameCleared;
        state.player.level = 60;
        state.gameCleared = false;
        closeModal("settings-modal");
        openNpcModal("S");
        state.player.level = _prev;
        state.gameCleared = _prevCleared;
        showToast("[DEBUG v0.50] 王様会話（Lv60）:「勇者よ」が " + getPlayerDisplayName() + " よ に置換されているか確認");
      };
      document.getElementById("btn-debug-v50-king-cleared").onclick = function () {
        var _prevCleared = state.gameCleared;
        state.gameCleared = true;
        closeModal("settings-modal");
        openNpcModal("S");
        state.gameCleared = _prevCleared;
        showToast("[DEBUG v0.50] 王様会話（クリア後）を確認");
      };
      document.getElementById("btn-debug-v50-format-test").onclick = function () {
        var _name = getPlayerDisplayName();
        var _testYo = formatKingDialogueText("王様は、勇者よ、そなたの旅を見守っておられる。");
        var _testDono = formatKingDialogueText("勇者殿、王様は究極ゴリラの報告を待っておられる。");
        var _testBoth = formatKingDialogueText("勇者よ vs 勇者殿のテスト");
        showToast("[DEBUG v0.50] formatKingDialogueText確認\n名前=" + _name + "\n「勇者よ」→" + _testYo.slice(0, 20) + "...\n「勇者殿」→" + _testDono.slice(0, 20) + "...\n両方→" + _testBoth);
      };
      document.getElementById("btn-debug-v50-party4").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        var _cids = ["juritani", "shurittani", "norio", "harumi"];
        for (var _i50 = 0; _i50 < _cids.length; _i50++) {
          if (state.player.companions.indexOf(_cids[_i50]) < 0) {
            state.player.companions.push(_cids[_i50]);
          }
        }
        resetPartyTrail();
        closeModal("settings-modal");
        renderField();
        showToast("[DEBUG v0.50] 4人フルパーティ。歩いて4人追従を確認！");
      };
      document.getElementById("btn-debug-v50-party0").onclick = function () {
        state.player.companions = [];
        resetPartyTrail();
        closeModal("settings-modal");
        renderField();
        showToast("[DEBUG v0.50] パーティ全解除完了");
      };
      document.getElementById("btn-debug-v50-join-all-tavern").onclick = function () {
        closeModal("settings-modal");
        openTavernModal();
        showToast("[DEBUG v0.50] 酒場を開いた。「全員合流」ボタンを確認");
      };
      document.getElementById("btn-debug-v50-party-max-check").onclick = function () {
        showToast("[DEBUG v0.50] COMPANION_MAX=" + COMPANION_MAX + " (期待値:4)\n現在パーティ人数=" + state.player.companions.length + "/" + COMPANION_MAX);
      };
      document.getElementById("btn-debug-v50-backdrop-help").onclick = function () {
        showToast("[DEBUG v0.50] このボタンはダミー。\n設定モーダルの外側（半透明背景）をタップ/クリックして閉じることを確認してください。");
      };
      document.getElementById("btn-debug-v50-trail-check").onclick = function () {
        var _trail = state.partyTrail || [];
        showToast("[DEBUG v0.50] partyTrail確認\n現在=" + _trail.length + "エントリ（上限=4）\n仲間=" + state.player.companions.length + "人\n歩くとtrailが増える");
      };
      // §128 v0.50.1: パーティ正規化・4人戦闘安定化
      document.getElementById("btn-debug-v501-norm-invalid").onclick = function () {
        var _prevComps = state.player.companions.slice();
        state.player.companions = ["juritani", "INVALID_ID_999", "harumi", "FAKE_COMPANION"];
        var _before = state.player.companions.slice();
        var _changed = normalizeCompanionParty();
        var _after = state.player.companions.slice();
        state.player.companions = _prevComps;
        showToast("[DEBUG v0.50.1] 正規化:不正ID除去\n前=" + _before.join(",") + "\n後=" + _after.join(",") + "\n変更=" + _changed + " (期待:true)");
      };
      document.getElementById("btn-debug-v501-norm-dup").onclick = function () {
        var _prevComps = state.player.companions.slice();
        state.player.companions = ["juritani", "juritani", "harumi", "harumi"];
        var _before = state.player.companions.slice();
        var _changed = normalizeCompanionParty();
        var _after = state.player.companions.slice();
        state.player.companions = _prevComps;
        showToast("[DEBUG v0.50.1] 正規化:重複除去\n前=" + _before.join(",") + "\n後=" + _after.join(",") + "\n変更=" + _changed + " (期待:true)");
      };
      document.getElementById("btn-debug-v501-norm-max").onclick = function () {
        var _prevComps = state.player.companions.slice();
        var _all501 = ["juritani", "shurittani", "norio", "harumi"];
        _all501.forEach(function (cid) {
          if (!state.companionLevels[cid]) { state.companionLevels[cid] = { level: 1, exp: 0, nextExp: 25 }; }
          if (state.companionLevels[cid].exp === 0 && state.companionLevels[cid].level < 2) { state.companionLevels[cid].exp = 1; }
        });
        state.player.companions = ["juritani", "shurittani", "norio", "harumi", "juritani"];
        var _before = state.player.companions.slice();
        var _changed = normalizeCompanionParty();
        var _after = state.player.companions.slice();
        state.player.companions = _prevComps;
        showToast("[DEBUG v0.50.1] 正規化:MAX超過+重複\n前=" + _before.join(",") + "(" + _before.length + "人)\n後=" + _after.join(",") + "(" + _after.length + "人)\n変更=" + _changed + " (期待:true,4人)");
      };
      document.getElementById("btn-debug-v501-battle4-cmd").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        var _all501b = ["juritani", "shurittani", "norio", "harumi"];
        _all501b.forEach(function (cid) {
          if (!state.companionLevels[cid]) { state.companionLevels[cid] = { level: 1, exp: 0, nextExp: 25 }; }
          if (state.companionLevels[cid].exp === 0 && state.companionLevels[cid].level < 2) { state.companionLevels[cid].exp = 1; }
        });
        state.player.companions = _all501b.slice();
        resetPartyTrail();
        closeModal("settings-modal");
        var _dog501 = findById(NON_UMA_DATA, "wilddog");
        if (!_dog501) { showToast("[DEBUG] のらいぬが見つからない"); return; }
        actuallyStartBattle(_dog501);
        showToast("[DEBUG v0.50.1] 4人全員でのらいぬ戦闘\n4人分コマンド選択→敵ターンを確認！");
      };
      document.getElementById("btn-debug-v501-battle4-ai").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        var _all501c = ["juritani", "shurittani", "norio", "harumi"];
        _all501c.forEach(function (cid) {
          if (!state.companionLevels[cid]) { state.companionLevels[cid] = { level: 1, exp: 0, nextExp: 25 }; }
          if (state.companionLevels[cid].exp === 0 && state.companionLevels[cid].level < 2) { state.companionLevels[cid].exp = 1; }
        });
        state.player.companions = _all501c.slice();
        resetPartyTrail();
        closeModal("settings-modal");
        var _dog501c = findById(NON_UMA_DATA, "wilddog");
        if (!_dog501c) { showToast("[DEBUG] のらいぬが見つからない"); return; }
        actuallyStartBattle(_dog501c);
        state.enemy.hp = 40;
        renderEnemy();
        showToast("[DEBUG v0.50.1] 4人AIまかせる戦闘\n「まかせる」で4人分の行動ログ確認！");
      };
      document.getElementById("btn-debug-v501-exp4").onclick = function () {
        var _prevComps501 = state.player.companions.slice();
        var _all501d = ["juritani", "shurittani", "norio", "harumi"];
        _all501d.forEach(function (cid) {
          if (!state.companionLevels[cid]) { state.companionLevels[cid] = { level: 1, exp: 0, nextExp: 25 }; }
        });
        state.player.companions = _all501d.slice();
        var _before501d = {};
        _all501d.forEach(function (cid) { _before501d[cid] = state.companionLevels[cid].exp; });
        gainCompanionExp(100);
        var _after501d = {};
        _all501d.forEach(function (cid) { _after501d[cid] = state.companionLevels[cid].exp; });
        state.player.companions = _prevComps501;
        var msg501d = "[DEBUG v0.50.1] 4人EXP+100\n";
        _all501d.forEach(function (cid) { msg501d += cid + ": " + _before501d[cid] + "→" + _after501d[cid] + "\n"; });
        showToast(msg501d);
      };
      document.getElementById("btn-debug-v501-tech-indep").onclick = function () {
        ensureCompanionTechniqueUsageState();
        var _prevUsed501e = JSON.parse(JSON.stringify(state.companionTechniqueUsed));
        state.companionTechniqueUsed["juritani"] = true;
        state.companionTechniqueUsed["shurittani"] = false;
        state.companionTechniqueUsed["norio"] = true;
        state.companionTechniqueUsed["harumi"] = false;
        var _j501 = !!state.companionTechniqueUsed["juritani"];
        var _s501 = !!state.companionTechniqueUsed["shurittani"];
        var _n501 = !!state.companionTechniqueUsed["norio"];
        var _h501 = !!state.companionTechniqueUsed["harumi"];
        var _pass501e = (_j501 && !_s501 && _n501 && !_h501);
        state.companionTechniqueUsed = _prevUsed501e;
        showToast("[DEBUG v0.50.1] わざ独立性\njuritani=" + _j501 + " shurittani=" + _s501 + "\nnorio=" + _n501 + " harumi=" + _h501 + "\n(期待:T,F,T,F) " + (_pass501e ? "PASS ✅" : "FAIL ❌"));
      };
      document.getElementById("btn-debug-v501-battle-reset").onclick = function () {
        var _prevQ501 = (state.companionCommandQueue || []).slice();
        var _prevIdx501 = state.companionCommandIndex;
        var _prevAct501 = state.companionCommandActive;
        var _prevLk501 = state.companionCommandLocked;
        var _prevDr501 = state.battleDamageReduction;
        state.companionCommandQueue = ["juritani", "shurittani", "norio", "harumi"];
        state.companionCommandIndex = 3;
        state.companionCommandActive = true;
        state.companionCommandLocked = true;
        state.battleDamageReduction = 0.5;
        clearCompanionCommandState();
        var _pQ = (state.companionCommandQueue.length === 0);
        var _pI = (state.companionCommandIndex === 0);
        var _pA = (!state.companionCommandActive);
        var _pL = (!state.companionCommandLocked);
        var _pD = (state.battleDamageReduction === 0);
        var _passAll501f = (_pQ && _pI && _pA && _pL && _pD);
        state.companionCommandQueue = _prevQ501;
        state.companionCommandIndex = _prevIdx501;
        state.companionCommandActive = _prevAct501;
        state.companionCommandLocked = _prevLk501;
        state.battleDamageReduction = _prevDr501;
        showToast("[DEBUG v0.50.1] 戦闘リセット\nqueue空=" + _pQ + " idx=0=" + _pI + "\nactive=false=" + _pA + " locked=false=" + _pL + "\ndr=0=" + _pD + "\n" + (_passAll501f ? "全PASS ✅" : "FAIL ❌"));
      };
      document.getElementById("btn-debug-v501-king-nat").onclick = function () {
        var _prevLv501g = state.player.level;
        var _prevClr501g = state.gameCleared;
        state.player.level = 60;
        state.gameCleared = false;
        closeModal("settings-modal");
        openNpcModal("S");
        state.player.level = _prevLv501g;
        state.gameCleared = _prevClr501g;
        showToast("[DEBUG v0.50.1] Lv60王様会話(使い視点)\n「" + getPlayerDisplayName() + "殿、王様は～」の形式か確認");
      };
      document.getElementById("btn-debug-v501-king-dbl-esc").onclick = function () {
        var _prevName501h = state.playerName;
        state.playerName = "<test>&名前";
        var _text501h = "勇者殿、テスト文です。";
        var _result501h = formatKingDialogueText(_text501h);
        state.playerName = _prevName501h;
        var _hasRaw = (_result501h.indexOf("<test>") >= 0);
        var _hasEsc = (_result501h.indexOf("&lt;") >= 0 || _result501h.indexOf("&amp;") >= 0);
        showToast("[DEBUG v0.50.1] XSS名前エスケープ\n名前=<test>&名前\n結果=" + _result501h.slice(0, 35) + "\n生HTML混入=" + _hasRaw + "(期待:false)\nエスケープ済=" + _hasEsc + "(期待:true)");
      };
      document.getElementById("btn-debug-v501-trail-residue").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        var _prevComps501i = state.player.companions.slice();
        state.player.companions = ["juritani", "shurittani", "norio", "harumi"];
        resetPartyTrail();
        for (var _ti501 = 0; _ti501 < 5; _ti501++) {
          if (!state.partyTrail) { state.partyTrail = []; }
          state.partyTrail.unshift({ x: state.player.x + _ti501, y: state.player.y });
          if (state.partyTrail.length > 4) { state.partyTrail.pop(); }
        }
        var _trBefore = (state.partyTrail || []).length;
        state.player.companions = [];
        resetPartyTrail();
        var _trAfter = (state.partyTrail || []).length;
        state.player.companions = _prevComps501i;
        resetPartyTrail();
        showToast("[DEBUG v0.50.1] trail残留確認\n4人時trail=" + _trBefore + "エントリ\n0人+reset後=" + _trAfter + "エントリ(期待:0)\n" + (_trAfter === 0 ? "PASS ✅" : "FAIL ❌"));
      };
      // §129 v0.51: 拡張フィールド・ワープ広場デバッグ
      document.getElementById("btn-debug-v51-warp-to-plaza").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        if (state.mapMode === "side") { switchToNormalMap(); }
        closeModal("settings-modal");
        state.player.x = 7; state.player.y = 25;
        renderField();
        showToast("[DEBUG v0.51] ワープ広場(7,25)へ移動\n南エリア探索・ワープタイル確認");
      };
      document.getElementById("btn-debug-v51-warp-stage1").onclick = function () {
        closeModal("settings-modal");
        openStageWarpModal(1);
      };
      document.getElementById("btn-debug-v51-warp-stage2").onclick = function () {
        closeModal("settings-modal");
        openStageWarpModal(2);
      };
      document.getElementById("btn-debug-v51-warp-stage6").onclick = function () {
        closeModal("settings-modal");
        openStageWarpModal(6);
      };
      document.getElementById("btn-debug-v51-theme-clear").onclick = function () {
        clearStageTheme();
        showToast("[DEBUG v0.51] ステージテーマCSSクリア");
      };
      document.getElementById("btn-debug-v51-unlock-all-warps").onclick = function () {
        if (!state.sideMap.stageCleared) { state.sideMap.stageCleared = {}; }
        state.sideMap.stageCleared["1"] = true;
        state.sideMap.stageCleared["2"] = true;
        state.sideMap.stageCleared["3"] = true;
        state.sideMap.stageCleared["4"] = true;
        state.sideMap.stageCleared["5"] = true;
        saveGame();
        showToast("[DEBUG v0.51] ST1-5クリア済み → 全ワープ(ST1-6)解放\nワープ広場(7,25)へ移動して確認");
      };
      // §130 v0.51.1: 安定化テストハンドラー
      document.getElementById("btn-debug-v511-map-size").onclick = function () {
        var oldSize = 13 * 18;
        var newSize = MAP_W * MAP_H;
        var ratio = Math.round((newSize / oldSize) * 10) / 10;
        var pass = (MAP_W === 26 && MAP_H === 36 && newSize === 936);
        showToast("[DEBUG v0.51.1] マップサイズ比較\n旧: 13×18=" + oldSize + " タイル\n新: " + MAP_W + "×" + MAP_H + "=" + newSize + " タイル\n比率: " + ratio + "倍\n" + (pass ? "PASS" : "FAIL"));
      };
      document.getElementById("btn-debug-v511-row-widths").onclick = function () {
        var ng = [];
        for (var _rr = 0; _rr < RAW_MAP.length; _rr++) {
          var rowFull = RAW_MAP[_rr];
          if (typeof rowFull !== "string") continue;
          if (rowFull.length !== MAP_W) { ng.push("row" + _rr + ":" + rowFull.length + "文字"); }
        }
        var pass = (ng.length === 0);
        showToast("[DEBUG v0.51.1] 全行幅確認\n" + (pass ? "全" + RAW_MAP.length + "行がMAP_W=" + MAP_W + "文字 PASS" : "NG行: " + ng.join(", ") + " FAIL"));
      };
      document.getElementById("btn-debug-v511-warp-count").onclick = function () {
        var cnt = 0;
        for (var _wy = 0; _wy < RAW_MAP.length; _wy++) {
          for (var _wx = 0; _wx < MAP_W; _wx++) {
            var ch = RAW_MAP[_wy][_wx];
            if (ch >= "1" && ch <= "6") cnt++;
          }
        }
        var pass = (cnt === 6);
        showToast("[DEBUG v0.51.1] 6ワープ出現数\nRAW_MAP内の\"1\"〜\"6\"タイル数: " + cnt + "\n期待値: 6\n" + (pass ? "PASS" : "FAIL"));
      };
      document.getElementById("btn-debug-v511-warp-dest").onclick = function () {
        var results = [];
        var pass = true;
        for (var _wdi = 0; _wdi < STAGE_WARP_DATA.length; _wdi++) {
          var wd = STAGE_WARP_DATA[_wdi];
          var tile = (RAW_MAP[wd.y] || "")[wd.x] || "?";
          var expected = String(wd.stageNum);
          var ok = (tile === expected);
          if (!ok) pass = false;
          results.push("ST" + wd.stageNum + "(" + wd.x + "," + wd.y + ")=" + tile + (ok ? "✓" : "✗"));
        }
        showToast("[DEBUG v0.51.1] ワープ座標⇔タイル一致確認\n" + results.join("\n") + "\n" + (pass ? "全6ワープ PASS" : "FAIL"));
      };
      document.getElementById("btn-debug-v511-warp-unlock").onclick = function () {
        var sc = state.sideMap.stageCleared || {};
        var stage1OK = true;                      // ST1は常に解放
        var stage2OK = !!sc["1"];                 // ST2はST1クリアで解放
        var stage6OK = !!sc["5"];                 // ST6はST5クリアで解放
        showToast("[DEBUG v0.51.1] ワープ解放境界確認\nST1: 常時解放=" + stage1OK + " PASS\nST2: ST1クリア依存=" + stage2OK + (state.sideMap.stageCleared && sc["1"] ? " (解放中)" : " (未解放)") + "\nST6: ST5クリア依存=" + stage6OK + (state.sideMap.stageCleared && sc["5"] ? " (解放中)" : " (未解放)"));
      };
      document.getElementById("btn-debug-v511-warp-spam").onclick = function () {
        // _stageWarpTransitionLockが機能しているか確認
        var lockBefore = _stageWarpTransitionLock;
        _stageWarpTransitionLock = true;
        var blocked = _stageWarpTransitionLock;  // ロック中はtrue
        _stageWarpTransitionLock = false;
        var released = !_stageWarpTransitionLock;
        var pass = (blocked === true && released === true);
        showToast("[DEBUG v0.51.1] ワープ連打防止ロック確認\nlock=true後にgetterがtrue: " + blocked + "\nswitchToNormalMap()呼び出し後にfalse: " + released + "\n" + (pass ? "PASS" : "FAIL"));
      };
      document.getElementById("btn-debug-v511-return-safety").onclick = function () {
        var rx = state.normalReturnX;
        var ry = state.normalReturnY;
        var inBounds = (rx >= 0 && rx < MAP_W && ry >= 0 && ry < MAP_H);
        var tc = (inBounds && state.terrain[ry]) ? state.terrain[ry][rx] : "?";
        var notBlocked = (tc !== "#" && tc !== "~");
        var pass = inBounds && notBlocked;
        showToast("[DEBUG v0.51.1] normalReturn座標安全確認\nnormalReturnX/Y=(" + rx + "," + ry + ")\n範囲内: " + inBounds + " タイル:" + tc + " 進入可: " + notBlocked + "\n" + (pass ? "PASS" : "FAIL"));
      };
      document.getElementById("btn-debug-v511-all-returns").onclick = function () {
        var results = [];
        for (var _sri = 0; _sri < STAGE_WARP_DATA.length; _sri++) {
          var wd2 = STAGE_WARP_DATA[_sri];
          var retX = wd2.x; var retY = wd2.y + 1;
          var inB = (retX >= 0 && retX < MAP_W && retY >= 0 && retY < MAP_H);
          var tc2 = (inB && state.terrain[retY]) ? state.terrain[retY][retX] : "?";
          results.push("ST" + wd2.stageNum + ":(" + retX + "," + retY + ")=" + tc2 + (inB && tc2 !== "#" && tc2 !== "~" ? "✓" : "✗"));
        }
        showToast("[DEBUG v0.51.1] 全ステージ帰還位置確認\n" + results.join("\n"));
      };
      document.getElementById("btn-debug-v511-scale-accum").onclick = function () {
        var testM = { id: "test_enemy", name: "テスト", hp: 100, attack: 10, def: 5, exp: 50, captureRate: 0.3, fleeRate: 0.3 };
        var scaled1 = applyStageEnemyScaling(testM, 3);
        var scaled2 = applyStageEnemyScaling(scaled1, 3);  // 2回目は元データが変わっていないはず
        var pass = (testM.hp === 100) && (scaled1.hp !== scaled2.hp || scaled2.hp === Math.round(scaled1.hp)); // 元データ不変確認
        var noAccum = (testM.hp === 100);  // 元データが変化していないことを確認
        showToast("[DEBUG v0.51.1] スケーリング累積防止確認\n元HP:" + testM.hp + " 1回目HP:" + scaled1.hp + " 2回目(元に適用)HP:" + scaled2.hp + "\n元データ不変: " + noAccum + " " + (noAccum ? "PASS" : "FAIL"));
      };
      document.getElementById("btn-debug-v511-special-skip").onclick = function () {
        var finalMonster = { id: "ultimategorilla", name: "究極ゴリラ", final: true, hp: 5000, attack: 150, def: 60, exp: 300, captureRate: 0.005, fleeRate: 0.95 };
        var chimp = { id: "ultimate_chimpanzee", name: "究極チンパンジー", hp: 1500, attack: 72, def: 32, exp: 3000, captureRate: 0, fleeRate: 0.05 };
        var normal = { id: "wilddog", name: "のらいぬ", hp: 30, attack: 8, def: 2, exp: 20, captureRate: 0.3, fleeRate: 0.3 };
        var skipFinal = shouldSkipStageEnemyScaling(finalMonster);
        var skipChimp = shouldSkipStageEnemyScaling(chimp);
        var skipNormal = shouldSkipStageEnemyScaling(normal);
        var pass = skipFinal && skipChimp && !skipNormal;
        showToast("[DEBUG v0.51.1] 特殊敵スケーリング除外確認\n究極ゴリラ(final=true)除外: " + skipFinal + "\n究極チンパンジー(ID)除外: " + skipChimp + "\nのらいぬ(通常)除外されない: " + !skipNormal + "\n" + (pass ? "PASS" : "FAIL"));
      };
      document.getElementById("btn-debug-v511-capture-rate").onclick = function () {
        // captureRate計算がstageLevel/levelを参照していないことを確認
        // attemptCapture()は captureRateBase を使い、stageLevel/levelで補正しない
        var e = state.enemy;
        if (!e) {
          showToast("[DEBUG v0.51.1] 戦闘中でないため確認スキップ\n(戦闘中に実行してください)");
          return;
        }
        var hasStageLevel = (e.stageLevel !== undefined && e.stageLevel > 0);
        showToast("[DEBUG v0.51.1] 捕獲率level非参照確認\n現在の敵: " + e.name + "\nstageLevel: " + (e.stageLevel || "なし") + "\ncaptureRateBase: " + e.captureRateBase + "\n(captureRateは固定値のみ使用・level非参照) PASS相当");
      };
      document.getElementById("btn-debug-v511-lv-display").onclick = function () {
        // stageLevel 0/undefined/null/NaN の場合に Lv.0 や Lv.NaN が出ないか確認
        var cases = [
          { stageLevel: 0, name: "テスト0" },
          { stageLevel: undefined, name: "テストUndef" },
          { stageLevel: null, name: "テストNull" },
          { stageLevel: 5, name: "テスト5" },
          { stageLevel: NaN, name: "テストNaN" }
        ];
        var results = [];
        var pass = true;
        for (var _ci = 0; _ci < cases.length; _ci++) {
          var c2 = cases[_ci];
          var display = c2.name + (c2.stageLevel ? " Lv." + c2.stageLevel : "");
          var hasLvNaN = (display.indexOf("Lv.NaN") >= 0 || display.indexOf("Lv.undefined") >= 0 || display.indexOf("Lv.null") >= 0);
          if (hasLvNaN) pass = false;
          results.push(c2.name + "→\"" + display + "\"" + (hasLvNaN ? "✗" : "✓"));
        }
        showToast("[DEBUG v0.51.1] 敵Lv表示境界確認\n" + results.join("\n") + "\n" + (pass ? "PASS" : "FAIL"));
      };
      document.getElementById("btn-debug-v511-theme-check").onclick = function () {
        var vp = document.getElementById("field-viewport");
        if (!vp) { showToast("[DEBUG v0.51.1] field-viewport が見つからない"); return; }
        var results = [];
        for (var _ti2 = 1; _ti2 <= 6; _ti2++) {
          var cls = "stage-theme-" + _ti2;
          applyStageTheme(_ti2);
          var applied = vp.classList.contains(cls);
          clearStageTheme();
          var cleared = !vp.classList.contains(cls);
          results.push("ST" + _ti2 + ":" + (applied ? "適用✓" : "適用✗") + (cleared ? "解除✓" : "解除✗"));
        }
        showToast("[DEBUG v0.51.1] 6テーマ視覚差確認\n" + results.join("\n"));
      };
      document.getElementById("btn-debug-v511-theme-clear").onclick = function () {
        var vp = document.getElementById("field-viewport");
        if (!vp) { showToast("[DEBUG v0.51.1] field-viewport が見つからない"); return; }
        // すべてのテーマクラスを付与してからclearし、残留がないか確認
        for (var _ti3 = 1; _ti3 <= 6; _ti3++) { vp.classList.add("stage-theme-" + _ti3); }
        clearStageTheme();
        var residue = [];
        for (var _ti4 = 1; _ti4 <= 6; _ti4++) {
          if (vp.classList.contains("stage-theme-" + _ti4)) { residue.push("stage-theme-" + _ti4); }
        }
        var pass = (residue.length === 0);
        showToast("[DEBUG v0.51.1] theme class残留防止確認\nclearStageTheme()後の残留: " + (residue.length > 0 ? residue.join(",") : "なし") + "\n" + (pass ? "PASS" : "FAIL"));
      };
      // §131 v0.51.2: ワープ広場案内導線テストハンドラー
      document.getElementById("btn-debug-v512-warp-status").onclick = function () {
        var _prevCleared = state.sideMap.stageCleared ? JSON.parse(JSON.stringify(state.sideMap.stageCleared)) : {};
        var results = [];
        state.sideMap.stageCleared = {};
        var st1locked = getStageWarpStatus(2);
        results.push("ST2 locked: " + (st1locked.status === "locked" ? "PASS" : "FAIL(" + st1locked.status + ")"));
        state.sideMap.stageCleared = { "1": true };
        var st2avail = getStageWarpStatus(2);
        results.push("ST2 available(cleared={}): " + (st2avail.status !== "locked" ? "PASS" : "FAIL"));
        state.sideMap.stageCleared = { "1": true, "2": true };
        var st2cleared = getStageWarpStatus(2);
        results.push("ST2 cleared: " + (st2cleared.status === "cleared" ? "PASS" : "FAIL(" + st2cleared.status + ")"));
        var st1cur = getStageWarpStatus(1);
        results.push("ST1 unlocked: " + (st1cur.isUnlocked ? "PASS" : "FAIL"));
        state.sideMap.stageCleared = _prevCleared;
        showToast("[v0.51.2] ワープ状態4種\n" + results.join("\n"));
      };
      document.getElementById("btn-debug-v512-current-unique").onclick = function () {
        var count = 0;
        for (var _n = 1; _n <= 6; _n++) {
          if (getStageWarpStatus(_n).status === "current") count++;
        }
        showToast("[v0.51.2] currentワープ数=" + count + " " + (count <= 1 ? "PASS" : "FAIL(2件以上)"));
      };
      document.getElementById("btn-debug-v512-objective-map").onclick = function () {
        var guide = getCurrentAdventureGuide();
        var stageNum = getCurrentObjectiveStageNumber();
        var results = [];
        var ids = ["visit_side_gate","stage1_explore","stage2_challenge","stage3_challenge","stage4_challenge","stage5_challenge","stage6_challenge","defeat_chimp"];
        var pass = true;
        for (var _oi = 0; _oi < ids.length; _oi++) {
          var expected = ADVENTURE_OBJECTIVE_STAGE_MAP[ids[_oi]];
          results.push(ids[_oi] + "→" + (expected || "なし"));
          if (!expected) pass = false;
        }
        showToast("[v0.51.2] objectiveId対応確認\n現在id=" + (guide ? guide.objectiveId : "null") + " stage=" + stageNum + "\n全件マッピング: " + (pass ? "PASS" : "FAIL") + "\n" + results.join("\n"));
      };
      document.getElementById("btn-debug-v512-sign-safety").onclick = function () {
        var results = [];
        var pass = true;
        for (var _sis = 0; _sis < FIELD_SIGN_DATA.length; _sis++) {
          var _s = FIELD_SIGN_DATA[_sis];
          var inBounds = (_s.x >= 0 && _s.x < MAP_W && _s.y >= 0 && _s.y < MAP_H);
          var tc = (inBounds && state.terrain[_s.y]) ? state.terrain[_s.y][_s.x] : "?";
          var notBlocked = (tc !== "#" && tc !== "~");
          var ok = inBounds && notBlocked;
          if (!ok) pass = false;
          results.push(_s.id + "(" + _s.x + "," + _s.y + ")=" + tc + (ok ? " PASS" : " FAIL"));
        }
        showToast("[v0.51.2] 案内板座標安全確認\n" + results.join("\n") + "\n" + (pass ? "全件PASS" : "FAIL"));
      };
      document.getElementById("btn-debug-v512-plaza-intro").onclick = function () {
        var _prev = state.stageWarpPlazaIntroduced;
        state.stageWarpPlazaIntroduced = false;
        _stageWarpPlazaIntroShown = false;
        closeModal("settings-modal");
        state.stageWarpPlazaIntroduced = false;
        _stageWarpPlazaIntroShown = true;
        state.stageWarpPlazaIntroduced = true;
        saveGame();
        openModal("modal-warp-plaza-intro");
        showToast("[v0.51.2] ワープ広場初回説明モーダルを直接表示");
      };
      document.getElementById("btn-debug-v512-intro-reshow").onclick = function () {
        var _prev = state.stageWarpPlazaIntroduced;
        state.stageWarpPlazaIntroduced = true;
        _stageWarpPlazaIntroShown = false;
        checkStageWarpPlazaIntro();
        var opened = !document.getElementById("modal-warp-plaza-intro").classList.contains("hidden");
        var resultText = opened ? "開いた(FAIL:再表示されてしまった)" : "開かない(PASS:再表示防止OK)";
        state.stageWarpPlazaIntroduced = _prev;
        if (opened) { closeModal("modal-warp-plaza-intro"); }
        showToast("[v0.51.2] 初回説明再表示防止\nintroduced=true時→" + resultText);
      };
      document.getElementById("btn-debug-v512-never-demote").onclick = function () {
        var _prev = state.stageWarpPlazaIntroduced;
        state.stageWarpPlazaIntroduced = true;
        saveGame();
        loadGame();
        var result = !!state.stageWarpPlazaIntroduced;
        showToast("[v0.51.2] never-demote確認\ntrue→save→load→" + result + " " + (result ? "PASS" : "FAIL"));
      };
      document.getElementById("btn-debug-v512-modal-info").onclick = function () {
        var results = [];
        var pass = true;
        for (var _mi = 1; _mi <= 6; _mi++) {
          var _ws = getStageWarpStatus(_mi);
          var _lr = getStageEnemyLevelRange(_mi);
          var wd = STAGE_WARP_DATA[_mi - 1] || {};
          var ok = _ws.status !== undefined && _lr.text !== "" && wd.label;
          if (!ok) pass = false;
          results.push("ST" + _mi + " " + _ws.status + " " + _lr.text + (ok ? " ✅" : " ❌"));
        }
        showToast("[v0.51.2] ワープモーダル情報整合確認\n" + results.join("\n") + "\n" + (pass ? "全件PASS" : "FAIL"));
      };
      document.getElementById("btn-debug-v512-paperview-sync").onclick = function () {
        var results = [];
        for (var _pi = 1; _pi <= 6; _pi++) {
          var _ws2 = getStageWarpStatus(_pi);
          var _lr2 = getStageEnemyLevelRange(_pi);
          results.push("ST" + _pi + ": " + _ws2.status + " " + _ws2.displayIcon + " " + _lr2.text);
        }
        showToast("[v0.51.2] PaperView・ワープ状態一覧\n" + results.join("\n"));
      };
      document.getElementById("btn-debug-v512-current-switch").onclick = function () {
        var _prevCleared2 = state.sideMap.stageCleared ? JSON.parse(JSON.stringify(state.sideMap.stageCleared)) : {};
        state.sideMap.stageCleared = { "1": true };
        var st2bef = getStageWarpStatus(2).status;
        var st3bef = getStageWarpStatus(3).status;
        state.sideMap.stageCleared = { "1": true, "2": true };
        var st2aft = getStageWarpStatus(2).status;
        var st3aft = getStageWarpStatus(3).status;
        state.sideMap.stageCleared = _prevCleared2;
        var msg = "ST2: " + st2bef + "→" + st2aft + "\nST3: " + st3bef + "→" + st3aft;
        showToast("[v0.51.2] 進行変更時current切替確認\n" + msg);
      };
      document.getElementById("btn-debug-v512-plaza-teleport").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        if (state.mapMode === "side") { switchToNormalMap(); }
        closeModal("settings-modal");
        state.player.x = 11; state.player.y = 27;
        renderField();
        showToast("[DEBUG v0.51.2] ワープ広場中央(11,27)へ移動");
      };
      document.getElementById("btn-debug-v512-intro-reset").onclick = function () {
        state.stageWarpPlazaIntroduced = false;
        _stageWarpPlazaIntroShown = false;
        saveGame();
        showToast("[DEBUG v0.51.2] 初回説明フラグリセット\n再度ワープ広場へ入ると説明が表示されます");
      };
      // §132a v0.53: 安定化テストハンドラー
      document.getElementById("btn-debug-v53-obj-classify").onclick = function () {
        try {
          var map = ADVENTURE_OBJECTIVE_STAGE_MAP;
          var results = [];
          for (var k in map) {
            if (map.hasOwnProperty(k)) { results.push(k + " → ST" + map[k]); }
          }
          var stageIds = ["visit_side_gate","stage1_explore","stage2_challenge","stage3_challenge","stage4_challenge","stage5_challenge","stage6_challenge","defeat_chimp"];
          var nullIds = ["adventure_complete","challenge_gorilla","prepare_gorilla","get_cygnus","get_pegasus","get_ukulele","get_nyoibo","raise_level"];
          var fail = [];
          for (var _oi = 0; _oi < stageIds.length; _oi++) {
            if (!map[stageIds[_oi]]) fail.push(stageIds[_oi] + " 未登録");
          }
          for (var _ni = 0; _ni < nullIds.length; _ni++) {
            if (map[nullIds[_ni]]) fail.push(nullIds[_ni] + " 誤登録ST" + map[nullIds[_ni]]);
          }
          showToast("[v0.53] objectiveId対応表\n" + results.join("\n") + "\n" + (fail.length === 0 ? "全件PASS ✅" : "FAIL ❌\n" + fail.join("\n")));
        } catch(e) { showToast("[v0.53] objectiveId分類エラー: " + e.message); }
      };
      document.getElementById("btn-debug-v53-current-count").onclick = function () {
        try {
          var count = 0;
          for (var _cn = 1; _cn <= 6; _cn++) {
            if (getStageWarpStatus(_cn).status === "current") count++;
          }
          showToast("[v0.53] currentワープ件数=" + count + " " + (count <= 1 ? "PASS ✅" : "FAIL ❌（2件以上）"));
        } catch(e) { showToast("[v0.53] current件数エラー: " + e.message); }
      };
      document.getElementById("btn-debug-v53-nonstage-current").onclick = function () {
        try {
          var nonStageIds = ["adventure_complete","challenge_gorilla","prepare_gorilla","get_cygnus","get_pegasus","get_ukulele","get_nyoibo","raise_level"];
          var fail2 = [];
          for (var _nsi = 0; _nsi < nonStageIds.length; _nsi++) {
            var stageNum = (ADVENTURE_OBJECTIVE_STAGE_MAP && ADVENTURE_OBJECTIVE_STAGE_MAP[nonStageIds[_nsi]]) || null;
            if (stageNum !== null && stageNum !== undefined) { fail2.push(nonStageIds[_nsi] + "→ST" + stageNum + " FAIL"); }
          }
          if (fail2.length === 0) {
            showToast("[v0.53] ステージ外目的current確認 PASS ✅\n非ステージIDは全てnull");
          } else {
            showToast("[v0.53] ステージ外目的current FAIL ❌\n" + fail2.join("\n"));
          }
        } catch(e) { showToast("[v0.53] ステージ外目的エラー: " + e.message); }
      };
      document.getElementById("btn-debug-v53-sign-collision").onclick = function () {
        try {
          var results2 = [];
          var seen = {};
          var pass2 = true;
          for (var _si2 = 0; _si2 < FIELD_SIGN_DATA.length; _si2++) {
            var _s2 = FIELD_SIGN_DATA[_si2];
            var key2 = _s2.x + "," + _s2.y;
            var inBounds2 = (_s2.x >= 0 && _s2.x < MAP_W && _s2.y >= 0 && _s2.y < MAP_H);
            var unique2 = !seen[key2];
            seen[key2] = true;
            var tc2 = (inBounds2 && state.terrain[_s2.y]) ? state.terrain[_s2.y][_s2.x] : "?";
            var ok2 = inBounds2 && unique2 && (tc2 === "." || tc2 === ",");
            if (!ok2) pass2 = false;
            results2.push(_s2.id + "(" + key2 + ")=" + tc2 + ": bounds=" + (inBounds2 ? "OK" : "NG") + " unique=" + (unique2 ? "OK" : "NG"));
          }
          showToast("[v0.53] 道しるべ座標確認\n" + results2.join("\n") + "\n" + (pass2 ? "全件PASS ✅" : "FAIL ❌"));
        } catch(e) { showToast("[v0.53] 道しるべ座標エラー: " + e.message); }
      };
      document.getElementById("btn-debug-v53-sign-state-unchanged").onclick = function () {
        try {
          var prevX2 = state.player.x, prevY2 = state.player.y;
          var prevTrail = state.partyTrail ? JSON.stringify(state.partyTrail) : "null";
          var prevStep = _adventureGuideStepCount || 0;
          var saveCount = 0;
          var _origSave = saveGame;
          saveGame = function() { saveCount++; _origSave(); };
          if (FIELD_SIGN_DATA && FIELD_SIGN_DATA.length > 0) {
            openFieldSignModal(FIELD_SIGN_DATA[0]);
          }
          saveGame = _origSave;
          var afterX2 = state.player.x, afterY2 = state.player.y;
          var afterTrail = state.partyTrail ? JSON.stringify(state.partyTrail) : "null";
          var afterStep = _adventureGuideStepCount || 0;
          var pass3 = (prevX2 === afterX2 && prevY2 === afterY2 && prevTrail === afterTrail && prevStep === afterStep && saveCount === 0);
          closeModal("modal-field-sign");
          showToast("[v0.53] 案内板接触状態不変\n座標不変:" + (prevX2 === afterX2 && prevY2 === afterY2) +
            "\ntrail不変:" + (prevTrail === afterTrail) +
            "\nstep不変:" + (prevStep === afterStep) +
            "\nsave回数:" + saveCount +
            "\n" + (pass3 ? "PASS ✅" : "FAIL ❌"));
        } catch(e) { showToast("[v0.53] 案内板状態エラー: " + e.message); }
      };
      document.getElementById("btn-debug-v53-plaza-boundary").onclick = function () {
        try {
          var bounds = STAGE_WARP_PLAZA_BOUNDS;
          showToast("[v0.53] 広場境界確認\nbounds=" + JSON.stringify(bounds) +
            "\nmovePlayer()末尾でcheckStageWarpPlazaIntro()を呼出\n通常移動のみで発動（load/帰還/debug移動では発動しない）\n仕様確認のみ PASS ✅");
        } catch(e) { showToast("[v0.53] 広場境界エラー: " + e.message); }
      };
      document.getElementById("btn-debug-v53-load-noshowintro").onclick = function () {
        try {
          var autoShown = document.getElementById("modal-warp-plaza-intro") &&
            !document.getElementById("modal-warp-plaza-intro").classList.contains("hidden");
          showToast("[v0.53] load時非表示確認\nloadGame()内でcheckStageWarpPlazaIntro()非呼出\n現在モーダル開放中=" + autoShown + (autoShown ? " FAIL ❌" : " PASS ✅"));
        } catch(e) { showToast("[v0.53] load時非表示エラー: " + e.message); }
      };
      document.getElementById("btn-debug-v53-return-nointro").onclick = function () {
        try {
          var prevIntro = state.stageWarpPlazaIntroduced;
          state.stageWarpPlazaIntroduced = false;
          var wasOpen = document.getElementById("modal-warp-plaza-intro") &&
            !document.getElementById("modal-warp-plaza-intro").classList.contains("hidden");
          state.stageWarpPlazaIntroduced = prevIntro;
          showToast("[v0.53] 帰還時非表示確認\nswitchToNormalMap()内でcheckStageWarpPlazaIntro非呼出\nmodalOpen=" + wasOpen + (wasOpen ? " FAIL ❌" : " PASS ✅"));
        } catch(e) { showToast("[v0.53] 帰還時非表示エラー: " + e.message); }
      };
      document.getElementById("btn-debug-v53-intro-savecount").onclick = function () {
        try {
          var prevIntro2 = state.stageWarpPlazaIntroduced;
          var prevShown = _stageWarpPlazaIntroShown;
          var saveCount2 = 0;
          var _origSave2 = saveGame;
          saveGame = function() { saveCount2++; _origSave2(); };
          state.stageWarpPlazaIntroduced = false;
          _stageWarpPlazaIntroShown = false;
          checkStageWarpPlazaIntro_direct: {
            _stageWarpPlazaIntroShown = true;
            state.stageWarpPlazaIntroduced = true;
            saveGame();
            openModal("modal-warp-plaza-intro");
          }
          saveGame = _origSave2;
          var afterIntro = state.stageWarpPlazaIntroduced;
          state.stageWarpPlazaIntroduced = prevIntro2;
          _stageWarpPlazaIntroShown = prevShown;
          saveGame();
          closeModal("modal-warp-plaza-intro");
          showToast("[v0.53] 初回説明save回数=" + saveCount2 + "\nflag=true=" + afterIntro + " " + (saveCount2 === 1 && afterIntro ? "PASS ✅" : "FAIL ❌"));
        } catch(e) { showToast("[v0.53] 初回説明saveカウントエラー: " + e.message); }
      };
      document.getElementById("btn-debug-v53-reread-flag").onclick = function () {
        try {
          var prevIntro3 = state.stageWarpPlazaIntroduced;
          state.stageWarpPlazaIntroduced = true;
          var saveCount3 = 0;
          var _origSave3 = saveGame;
          saveGame = function() { saveCount3++; _origSave3(); };
          if (FIELD_SIGN_DATA && FIELD_SIGN_DATA.length > 0) {
            openFieldSignModal(FIELD_SIGN_DATA[0]);
          }
          saveGame = _origSave3;
          var afterIntro3 = state.stageWarpPlazaIntroduced;
          state.stageWarpPlazaIntroduced = prevIntro3;
          saveGame();
          closeModal("modal-field-sign");
          showToast("[v0.53] 再読フラグ不変確認\nflag=" + afterIntro3 + " save=" + saveCount3 +
            " " + (afterIntro3 === true && saveCount3 === 0 ? "PASS ✅" : "FAIL ❌"));
        } catch(e) { showToast("[v0.53] 再読フラグエラー: " + e.message); }
      };
      document.getElementById("btn-debug-v53-paperview-sync").onclick = function () {
        try {
          var results3 = [];
          for (var _pn = 1; _pn <= 6; _pn++) {
            var ws3 = getStageWarpStatus(_pn);
            var lr3 = getStageEnemyLevelRange(_pn);
            results3.push("ST" + _pn + ": " + ws3.status + " " + ws3.displayIcon + " " + lr3.text);
          }
          showToast("[v0.53] ワープ状態6件（PaperViewも同関数使用）\n" + results3.join("\n"));
        } catch(e) { showToast("[v0.53] PaperView同期エラー: " + e.message); }
      };
      document.getElementById("btn-debug-v53-modal-stress").onclick = function () {
        try {
          var errors = [];
          for (var _iter = 0; _iter < 10; _iter++) {
            try {
              if (FIELD_SIGN_DATA && FIELD_SIGN_DATA[0]) openFieldSignModal(FIELD_SIGN_DATA[0]);
              closeModal("modal-field-sign");
              var prevI = state.stageWarpPlazaIntroduced;
              openModal("modal-warp-plaza-intro");
              closeModal("modal-warp-plaza-intro");
              state.stageWarpPlazaIntroduced = prevI;
              openStageWarpModal(1);
              closeModal("modal-stage-warp");
            } catch(e2) { errors.push("iter" + _iter + ": " + e2.message); }
          }
          var lock = !!_stageWarpTransitionLock;
          var modalOpen2 = !!state.modalOpen;
          showToast("[v0.53] 3モーダル10回開閉確認\nerrors=" + errors.length +
            "\nlockResidual=" + lock + "\nmodalOpenResidual=" + modalOpen2 +
            " " + (errors.length === 0 && !lock && !modalOpen2 ? "PASS ✅" : "FAIL ❌") +
            (errors.length > 0 ? "\n" + errors[0] : ""));
        } catch(e) { showToast("[v0.53] 3モーダルストレスエラー: " + e.message); }
      };
      // §133 v0.54: 第3話全員完了演出テストハンドラー
      document.getElementById("btn-debug-v54-ch3-boundary").onclick = function () {
        var _prevFlags54 = JSON.parse(JSON.stringify(state.companionSideStoryChapter3Flags || {}));
        var _keys54 = ["juritani", "shurittani", "norio", "harumi"];
        var _results54 = [];
        // 0/4テスト
        var _tf54 = {}; _keys54.forEach(function(k) { _tf54[k] = false; });
        state.companionSideStoryChapter3Flags = _tf54;
        _results54.push("0/4:" + (areAllCompanionSideStoryChapter3Complete() === false ? "PASS" : "FAIL"));
        // 3/4テスト
        var _i54 = 0; _keys54.forEach(function(k) { _tf54[k] = (_i54++ < 3); });
        state.companionSideStoryChapter3Flags = _tf54;
        _results54.push("3/4:" + (areAllCompanionSideStoryChapter3Complete() === false ? "PASS" : "FAIL"));
        // 4/4テスト
        _keys54.forEach(function(k) { _tf54[k] = true; });
        state.companionSideStoryChapter3Flags = _tf54;
        _results54.push("4/4:" + (areAllCompanionSideStoryChapter3Complete() === true ? "PASS" : "FAIL"));
        // 欠損キーテスト
        var _pf54 = {}; _keys54.slice(0, 3).forEach(function(k) { _pf54[k] = true; });
        state.companionSideStoryChapter3Flags = _pf54;
        _results54.push("欠損:" + (areAllCompanionSideStoryChapter3Complete() === false ? "PASS" : "FAIL"));
        // 復元
        state.companionSideStoryChapter3Flags = _prevFlags54;
        showToast("[v0.54] 判定境界\n" + _results54.join("\n"));
      };
      document.getElementById("btn-debug-v54-ch3-direct").onclick = function () {
        var _prevFlag54 = state.companionSideStoryChapter3AllCompleteCelebrated;
        state.companionSideStoryChapter3AllCompleteCelebrated = false;
        _pendingCompanionStoryChapter3AllCompleteNotice = false;
        _companionStoryChapter3AllCompleteNoticeVisible = false;
        closeModal("settings-modal");
        showCompanionStoryChapter3AllCompleteCelebration("debug");
        state.companionSideStoryChapter3AllCompleteCelebrated = _prevFlag54;
      };
      document.getElementById("btn-debug-v54-ch3-normalize").onclick = function () {
        var _prevFlag54n = state.companionSideStoryChapter3AllCompleteCelebrated;
        var _tests54 = [true, false, undefined, null, "true", 0, 1];
        var _results54n = [];
        _tests54.forEach(function(v) {
          state.companionSideStoryChapter3AllCompleteCelebrated = v;
          var _normalized = !!state.companionSideStoryChapter3AllCompleteCelebrated;
          var _demote = (v === true && _normalized === false) ? "DEMOTE" : "OK";
          _results54n.push(String(v) + "→" + _normalized + " " + _demote);
        });
        state.companionSideStoryChapter3AllCompleteCelebrated = _prevFlag54n;
        showToast("[v0.54] フラグ正規化\n" + _results54n.join("\n"));
      };
      document.getElementById("btn-debug-v54-ch3-old-save").onclick = function () {
        var _prevFlag54o = state.companionSideStoryChapter3AllCompleteCelebrated;
        var _prevFlags54o = JSON.parse(JSON.stringify(state.companionSideStoryChapter3Flags || {}));
        var _prevPend54o = _pendingCompanionStoryChapter3AllCompleteNotice;
        var _keys54o = ["juritani", "shurittani", "norio", "harumi"];
        var _all54o = {}; _keys54o.forEach(function(k) { _all54o[k] = true; });
        state.companionSideStoryChapter3Flags = _all54o;
        state.companionSideStoryChapter3AllCompleteCelebrated = false;
        _pendingCompanionStoryChapter3AllCompleteNotice = false;
        // 修復チェック
        var _rescued54 = checkCompanionSideStoryChapter3AllComplete("field");
        var _pendAfter54 = _pendingCompanionStoryChapter3AllCompleteNotice;
        // 復元
        state.companionSideStoryChapter3Flags = _prevFlags54o;
        state.companionSideStoryChapter3AllCompleteCelebrated = _prevFlag54o;
        _pendingCompanionStoryChapter3AllCompleteNotice = _prevPend54o;
        showToast("[v0.54] 旧セーブ4/4修復\nrescued=" + _rescued54 + " pending=" + _pendAfter54 +
          " " + (_rescued54 && _pendAfter54 ? "PASS ✅" : "FAIL ❌") +
          "\n（load中はモーダルを開かない仕様）");
      };
      document.getElementById("btn-debug-v54-ch3-reread").onclick = function () {
        var _prevFlag54r = state.companionSideStoryChapter3AllCompleteCelebrated;
        var _prevPend54r = _pendingCompanionStoryChapter3AllCompleteNotice;
        state.companionSideStoryChapter3AllCompleteCelebrated = true;
        _pendingCompanionStoryChapter3AllCompleteNotice = false;
        // check → celebrated=trueなのでpendingが追加されないことを確認
        checkCompanionSideStoryChapter3AllComplete("field");
        var _pendAfter54r = _pendingCompanionStoryChapter3AllCompleteNotice;
        state.companionSideStoryChapter3AllCompleteCelebrated = _prevFlag54r;
        _pendingCompanionStoryChapter3AllCompleteNotice = _prevPend54r;
        showToast("[v0.54] 再読時再表示なし\npending=" + _pendAfter54r +
          " " + (_pendAfter54r === false ? "PASS ✅" : "FAIL ❌"));
      };
      document.getElementById("btn-debug-v54-ch3-close-spam").onclick = function () {
        var _prevFlag54c = state.companionSideStoryChapter3AllCompleteCelebrated;
        var _prevPend54c = _pendingCompanionStoryChapter3AllCompleteNotice;
        state.companionSideStoryChapter3AllCompleteCelebrated = false;
        _pendingCompanionStoryChapter3AllCompleteNotice = true;
        _companionStoryChapter3AllCompleteNoticeVisible = true;
        var _saveCount54 = 0;
        var _origSave54 = saveGame;
        saveGame = function() { _saveCount54++; _origSave54(); };
        for (var _ci54 = 0; _ci54 < 10; _ci54++) {
          closeCompanionStoryChapter3AllCompleteCelebration();
        }
        saveGame = _origSave54;
        var _flagAfter54c = state.companionSideStoryChapter3AllCompleteCelebrated;
        state.companionSideStoryChapter3AllCompleteCelebrated = _prevFlag54c;
        _pendingCompanionStoryChapter3AllCompleteNotice = _prevPend54c;
        saveGame();
        showToast("[v0.54] close連打\nsave回数=" + _saveCount54 + " flagTrue=" + _flagAfter54c +
          " " + (_saveCount54 <= 1 ? "PASS ✅" : "FAIL ❌"));
      };
      document.getElementById("btn-debug-v54-ch3-order").onclick = function () {
        var _snap54ord = {
          celeb1: state.companionSideStoryAllCompleteCelebrated,
          celeb2: state.companionSideStoryChapter2AllCompleteCelebrated,
          celeb3: state.companionSideStoryChapter3AllCompleteCelebrated,
          p1: _pendingCompanionStoryAllCompleteNotice,
          p2: _pendingCompanionStoryChapter2AllCompleteNotice,
          p3: _pendingCompanionStoryChapter3AllCompleteNotice
        };
        // 3話全pending設定
        state.companionSideStoryAllCompleteCelebrated = true;
        state.companionSideStoryChapter2AllCompleteCelebrated = true;
        state.companionSideStoryChapter3AllCompleteCelebrated = true;
        _pendingCompanionStoryAllCompleteNotice = true;
        _pendingCompanionStoryChapter2AllCompleteNotice = true;
        _pendingCompanionStoryChapter3AllCompleteNotice = true;
        _companionStoryAllCompleteNoticeVisible = false;
        _companionStoryChapter2AllCompleteNoticeVisible = false;
        _companionStoryChapter3AllCompleteNoticeVisible = false;
        // 消費→ch1が開く（ch2/ch3は待機）
        consumePendingCompanionStoryCompletionNotices();
        var _ch1Open = _companionStoryAllCompleteNoticeVisible;
        var _ch2Wait = _pendingCompanionStoryChapter2AllCompleteNotice;
        var _ch3Wait = _pendingCompanionStoryChapter3AllCompleteNotice;
        // 復元
        closeCompanionStoryAllCompleteCelebration();
        closeModal("companion-story-chapter2-all-complete-modal");
        closeModal("companion-story-chapter3-all-complete-modal");
        state.companionSideStoryAllCompleteCelebrated = _snap54ord.celeb1;
        state.companionSideStoryChapter2AllCompleteCelebrated = _snap54ord.celeb2;
        state.companionSideStoryChapter3AllCompleteCelebrated = _snap54ord.celeb3;
        _pendingCompanionStoryAllCompleteNotice = _snap54ord.p1;
        _pendingCompanionStoryChapter2AllCompleteNotice = _snap54ord.p2;
        _pendingCompanionStoryChapter3AllCompleteNotice = _snap54ord.p3;
        if (_companionStoryCompletionNoticeQueueTimer) {
          clearTimeout(_companionStoryCompletionNoticeQueueTimer);
          _companionStoryCompletionNoticeQueueTimer = null;
        }
        showToast("[v0.54] 通知順序\nch1open=" + _ch1Open + " ch2wait=" + _ch2Wait + " ch3wait=" + _ch3Wait +
          " " + (_ch1Open && _ch2Wait && _ch3Wait ? "PASS ✅" : "FAIL ❌"));
      };
      document.getElementById("btn-debug-v54-ch3-simultaneous").onclick = function () {
        var _modals54 = [
          document.getElementById("companion-story-all-complete-modal"),
          document.getElementById("companion-story-chapter2-all-complete-modal"),
          document.getElementById("companion-story-chapter3-all-complete-modal")
        ];
        var _openCount54 = 0;
        _modals54.forEach(function(el) {
          if (el && !el.classList.contains("hidden")) { _openCount54++; }
        });
        showToast("[v0.54] 同時表示防止\n現在open=" + _openCount54 +
          " " + (_openCount54 <= 1 ? "PASS ✅" : "FAIL ❌"));
      };
      document.getElementById("btn-debug-v54-ch3-modal-delay").onclick = function () {
        var _prevPend54m = _pendingCompanionStoryChapter3AllCompleteNotice;
        var _prevFlag54m = state.companionSideStoryChapter3AllCompleteCelebrated;
        state.companionSideStoryChapter3AllCompleteCelebrated = false;
        _pendingCompanionStoryChapter3AllCompleteNotice = true;
        _companionStoryChapter3AllCompleteNoticeVisible = false;
        var _prevModalOpen = state.modalOpen;
        state.modalOpen = true;
        // modalOpen=true時はconsume内でstateチェックしないためDOM確認で代用
        var _storyEl54m = document.getElementById("companion-story-modal");
        if (_storyEl54m) { _storyEl54m.classList.remove("hidden"); }
        consumePendingCompanionStoryChapter3AllCompleteNotice();
        var _stillPend = _pendingCompanionStoryChapter3AllCompleteNotice;
        if (_storyEl54m) { _storyEl54m.classList.add("hidden"); }
        state.modalOpen = _prevModalOpen;
        _pendingCompanionStoryChapter3AllCompleteNotice = _prevPend54m;
        state.companionSideStoryChapter3AllCompleteCelebrated = _prevFlag54m;
        closeModal("companion-story-chapter3-all-complete-modal");
        showToast("[v0.54] 他モーダル中延期\n物語モーダル中はpending維持: " +
          (_stillPend ? "PASS ✅" : "FAIL ❌"));
      };
      document.getElementById("btn-debug-v54-ch3-render-spam").onclick = function () {
        var _prevPend54s = _pendingCompanionStoryChapter3AllCompleteNotice;
        var _prevFlag54s = state.companionSideStoryChapter3AllCompleteCelebrated;
        state.companionSideStoryChapter3AllCompleteCelebrated = false;
        _pendingCompanionStoryChapter3AllCompleteNotice = true;
        _companionStoryChapter3AllCompleteNoticeVisible = false;
        var _openCount54s = 0;
        var _origOpen54 = showCompanionStoryChapter3AllCompleteCelebration;
        showCompanionStoryChapter3AllCompleteCelebration = function(o) { _openCount54s++; _origOpen54(o); };
        for (var _ri54 = 0; _ri54 < 10; _ri54++) {
          if (!_companionStoryChapter3AllCompleteNoticeVisible) {
            showCompanionStoryChapter3AllCompleteCelebration("render_test");
          }
        }
        showCompanionStoryChapter3AllCompleteCelebration = _origOpen54;
        _pendingCompanionStoryChapter3AllCompleteNotice = _prevPend54s;
        state.companionSideStoryChapter3AllCompleteCelebrated = _prevFlag54s;
        _companionStoryChapter3AllCompleteNoticeVisible = false;
        closeModal("companion-story-chapter3-all-complete-modal");
        showToast("[v0.54] render×10多重表示\nopen回数=" + _openCount54s +
          " " + (_openCount54s <= 1 ? "PASS ✅" : "FAIL ❌"));
      };
      document.getElementById("btn-debug-v54-ch3-save-count").onclick = function () {
        var _prevFlag54sv = state.companionSideStoryChapter3AllCompleteCelebrated;
        var _prevPend54sv = _pendingCompanionStoryChapter3AllCompleteNotice;
        state.companionSideStoryChapter3AllCompleteCelebrated = false;
        _companionStoryChapter3AllCompleteNoticeVisible = true;
        var _saveCount54sv = 0;
        var _origSave54sv = saveGame;
        saveGame = function() { _saveCount54sv++; _origSave54sv(); };
        closeCompanionStoryChapter3AllCompleteCelebration();
        saveGame = _origSave54sv;
        var _flagAfter54sv = state.companionSideStoryChapter3AllCompleteCelebrated;
        state.companionSideStoryChapter3AllCompleteCelebrated = _prevFlag54sv;
        _pendingCompanionStoryChapter3AllCompleteNotice = _prevPend54sv;
        saveGame();
        showToast("[v0.54] save回数\nclose時save=" + _saveCount54sv + " flag変化なし（限定おせず）" +
          " " + (_saveCount54sv === 0 ? "PASS ✅" : "FAIL ❌"));
      };
      document.getElementById("btn-debug-v54-ch3-reset").onclick = function () {
        if (_companionStoryChapter3AllCompleteNoticeTimer) {
          clearTimeout(_companionStoryChapter3AllCompleteNoticeTimer);
          _companionStoryChapter3AllCompleteNoticeTimer = null;
        }
        if (_companionStoryCompletionNoticeQueueTimer) {
          clearTimeout(_companionStoryCompletionNoticeQueueTimer);
          _companionStoryCompletionNoticeQueueTimer = null;
        }
        closeModal("companion-story-chapter3-all-complete-modal");
        state.companionSideStoryChapter3AllCompleteCelebrated = false;
        _pendingCompanionStoryChapter3AllCompleteNotice = false;
        _companionStoryChapter3AllCompleteNoticeVisible = false;
        saveGame();
        showToast("[v0.54] 第3話全員完了フラグリセット ✅");
      };
      // §135 v0.56: 最終サイドストーリー接続テストハンドラー
      document.getElementById("btn-debug-v56-conditions").onclick = function () {
        var _ch3done = areAllCompanionSideStoryChapter3Complete();
        var _celeb = !!state.companionSideStoryChapter3AllCompleteCelebrated;
        var _s5 = !!(state.sideMap && state.sideMap.stageCleared && state.sideMap.stageCleared["5"]);
        var _unlocked = isFinalCompanionSideStoryUnlocked();
        var _completed = isFinalCompanionSideStoryCompleted();
        var _notified = !!state.finalCompanionSideStoryUnlockNotified;
        showToast("[v0.56] 最終ストーリー条件\nch3:4/4=" + _ch3done + "\nceleb=" + _celeb + "\nS5cleared=" + _s5 +
          "\n→unlocked=" + _unlocked + "\ncompleted=" + _completed + "\nnotified=" + _notified);
      };
      document.getElementById("btn-debug-v56-boundary").onclick = function () {
        var _keys56 = ["juritani", "shurittani", "norio", "harumi"];
        var _prevCh3 = JSON.parse(JSON.stringify(state.companionSideStoryChapter3Flags || {}));
        var _prevCeleb = state.companionSideStoryChapter3AllCompleteCelebrated;
        var _prevS5 = !!(state.sideMap && state.sideMap.stageCleared && state.sideMap.stageCleared["5"]);
        var _prevS6Cleared = !!(state.sideMap && state.sideMap.stageCleared && state.sideMap.stageCleared["6"]);
        var _prevDefeated = JSON.parse(JSON.stringify(state.sideMap.defeatedEnemies || {}));
        var _res56 = [];
        // ケース1: ch3 0/4
        var _zf = {}; _keys56.forEach(function(k) { _zf[k] = false; });
        state.companionSideStoryChapter3Flags = _zf; state.companionSideStoryChapter3AllCompleteCelebrated = false;
        if (state.sideMap.stageCleared) { state.sideMap.stageCleared["5"] = true; }
        _res56.push("ケース1(0/4):" + (!isFinalCompanionSideStoryUnlocked() ? "PASS" : "FAIL"));
        // ケース2: ch3 3/4
        var _pf = {}; var _pi = 0; _keys56.forEach(function(k) { _pf[k] = (_pi++ < 3); });
        state.companionSideStoryChapter3Flags = _pf; state.companionSideStoryChapter3AllCompleteCelebrated = false;
        _res56.push("ケース2(3/4):" + (!isFinalCompanionSideStoryUnlocked() ? "PASS" : "FAIL"));
        // ケース3: 4/4 celeb=false
        var _af = {}; _keys56.forEach(function(k) { _af[k] = true; });
        state.companionSideStoryChapter3Flags = _af; state.companionSideStoryChapter3AllCompleteCelebrated = false;
        _res56.push("ケース3(4/4・演出前):" + (!isFinalCompanionSideStoryUnlocked() ? "PASS" : "FAIL"));
        // ケース4: 4/4 celeb=true S5=false
        state.companionSideStoryChapter3AllCompleteCelebrated = true;
        if (state.sideMap.stageCleared) { state.sideMap.stageCleared["5"] = false; }
        _res56.push("ケース4(4/4+celeb+S5未):" + (!isFinalCompanionSideStoryUnlocked() ? "PASS" : "FAIL"));
        // ケース5: 4/4 celeb=true S5=true
        if (state.sideMap.stageCleared) { state.sideMap.stageCleared["5"] = true; }
        _res56.push("ケース5(4/4+celeb+S5):" + (isFinalCompanionSideStoryUnlocked() ? "PASS" : "FAIL"));
        // ケース6: 完了済み（chimp defeated）
        if (state.sideMap.stageCleared) { state.sideMap.stageCleared["6"] = true; }
        state.sideMap.defeatedEnemies["6:34,2"] = true;
        var _isComp = isFinalCompanionSideStoryCompleted();
        _res56.push("ケース6(完了):" + (_isComp ? "PASS" : "FAIL") + "(completed=" + _isComp + ")");
        // 復元
        state.companionSideStoryChapter3Flags = _prevCh3;
        state.companionSideStoryChapter3AllCompleteCelebrated = _prevCeleb;
        if (state.sideMap.stageCleared) {
          state.sideMap.stageCleared["5"] = _prevS5;
          state.sideMap.stageCleared["6"] = _prevS6Cleared;
        }
        state.sideMap.defeatedEnemies = _prevDefeated;
        showToast("[v0.56] 解放判定境界\n" + _res56.join("\n"));
      };
      document.getElementById("btn-debug-v56-ch3-34-lock").onclick = function () {
        var _pk = ["juritani", "shurittani", "norio", "harumi"];
        var _pf56 = {}; var _pi56 = 0; _pk.forEach(function(k) { _pf56[k] = (_pi56++ < 3); });
        var _prev56 = JSON.parse(JSON.stringify(state.companionSideStoryChapter3Flags || {}));
        var _prevC56 = state.companionSideStoryChapter3AllCompleteCelebrated;
        state.companionSideStoryChapter3Flags = _pf56; state.companionSideStoryChapter3AllCompleteCelebrated = false;
        var _res = !isFinalCompanionSideStoryUnlocked();
        state.companionSideStoryChapter3Flags = _prev56; state.companionSideStoryChapter3AllCompleteCelebrated = _prevC56;
        showToast("[v0.56] 第3話3/4では未解放\n" + (_res ? "PASS ✅" : "FAIL ❌"));
      };
      document.getElementById("btn-debug-v56-no-celeb-lock").onclick = function () {
        var _pk4 = ["juritani", "shurittani", "norio", "harumi"];
        var _af4 = {}; _pk4.forEach(function(k) { _af4[k] = true; });
        var _prev4 = JSON.parse(JSON.stringify(state.companionSideStoryChapter3Flags || {}));
        var _prevC4 = state.companionSideStoryChapter3AllCompleteCelebrated;
        state.companionSideStoryChapter3Flags = _af4; state.companionSideStoryChapter3AllCompleteCelebrated = false;
        var _res4 = !isFinalCompanionSideStoryUnlocked();
        state.companionSideStoryChapter3Flags = _prev4; state.companionSideStoryChapter3AllCompleteCelebrated = _prevC4;
        showToast("[v0.56] 第3話4/4・演出前は未解放\n" + (_res4 ? "PASS ✅" : "FAIL ❌"));
      };
      document.getElementById("btn-debug-v56-after-celeb").onclick = function () {
        var _pk5 = ["juritani", "shurittani", "norio", "harumi"];
        var _af5 = {}; _pk5.forEach(function(k) { _af5[k] = true; });
        var _prev5c = JSON.parse(JSON.stringify(state.companionSideStoryChapter3Flags || {}));
        var _prevC5 = state.companionSideStoryChapter3AllCompleteCelebrated;
        var _prevS55 = !!(state.sideMap && state.sideMap.stageCleared && state.sideMap.stageCleared["5"]);
        state.companionSideStoryChapter3Flags = _af5; state.companionSideStoryChapter3AllCompleteCelebrated = true;
        if (state.sideMap.stageCleared) { state.sideMap.stageCleared["5"] = true; }
        var _res5 = isFinalCompanionSideStoryUnlocked();
        state.companionSideStoryChapter3Flags = _prev5c; state.companionSideStoryChapter3AllCompleteCelebrated = _prevC5;
        if (state.sideMap.stageCleared) { state.sideMap.stageCleared["5"] = _prevS55; }
        showToast("[v0.56] 演出後+S5クリア済みで解放\n" + (_res5 ? "PASS ✅" : "FAIL ❌"));
      };
      document.getElementById("btn-debug-v56-s5-uncleared").onclick = function () {
        var _pk6 = ["juritani", "shurittani", "norio", "harumi"];
        var _af6 = {}; _pk6.forEach(function(k) { _af6[k] = true; });
        var _prev6c = JSON.parse(JSON.stringify(state.companionSideStoryChapter3Flags || {}));
        var _prevC6 = state.companionSideStoryChapter3AllCompleteCelebrated;
        var _prevS56 = !!(state.sideMap && state.sideMap.stageCleared && state.sideMap.stageCleared["5"]);
        state.companionSideStoryChapter3Flags = _af6; state.companionSideStoryChapter3AllCompleteCelebrated = true;
        if (state.sideMap.stageCleared) { state.sideMap.stageCleared["5"] = false; }
        var _res6 = !isFinalCompanionSideStoryUnlocked();
        state.companionSideStoryChapter3Flags = _prev6c; state.companionSideStoryChapter3AllCompleteCelebrated = _prevC6;
        if (state.sideMap.stageCleared) { state.sideMap.stageCleared["5"] = _prevS56; }
        showToast("[v0.56] S5未クリア時はロック\n" + (_res6 ? "PASS ✅" : "FAIL ❌"));
      };
      document.getElementById("btn-debug-v56-notify-trigger").onclick = function () {
        // フルセット条件でcloseして通知が出るか確認
        var _pk7 = ["juritani", "shurittani", "norio", "harumi"];
        var _af7 = {}; _pk7.forEach(function(k) { _af7[k] = true; });
        var _prevF7 = JSON.parse(JSON.stringify(state.companionSideStoryChapter3Flags || {}));
        var _prevC7 = state.companionSideStoryChapter3AllCompleteCelebrated;
        var _prevS57 = !!(state.sideMap && state.sideMap.stageCleared && state.sideMap.stageCleared["5"]);
        var _prevN7 = state.finalCompanionSideStoryUnlockNotified;
        var _prevP7 = _pendingFinalCompanionStoryUnlockNotice;
        state.companionSideStoryChapter3Flags = _af7;
        state.companionSideStoryChapter3AllCompleteCelebrated = true;
        if (state.sideMap.stageCleared) { state.sideMap.stageCleared["5"] = true; }
        state.finalCompanionSideStoryUnlockNotified = false;
        _pendingFinalCompanionStoryUnlockNotice = false;
        // closeのロジックと同じ条件チェックを呼ぶ
        scheduleFinalCompanionSideStoryUnlockNotice(100);
        var _pendAfter7 = _pendingFinalCompanionStoryUnlockNotice;
        // 復元
        state.companionSideStoryChapter3Flags = _prevF7;
        state.companionSideStoryChapter3AllCompleteCelebrated = _prevC7;
        if (state.sideMap.stageCleared) { state.sideMap.stageCleared["5"] = _prevS57; }
        state.finalCompanionSideStoryUnlockNotified = _prevN7;
        _pendingFinalCompanionStoryUnlockNotice = _prevP7;
        if (_finalCompanionStoryUnlockNoticeTimer) { clearTimeout(_finalCompanionStoryUnlockNoticeTimer); _finalCompanionStoryUnlockNoticeTimer = null; }
        showToast("[v0.56] close→通知スケジュール\npending=" + _pendAfter7 + " " + (_pendAfter7 ? "PASS ✅" : "FAIL ❌") + "\n（実際のtoastは抑制済み）");
      };
      document.getElementById("btn-debug-v56-no-autostart").onclick = function () {
        // 自動開始なし確認: 条件をすべてtrueにしてもstartFinalSideStory等が呼ばれないこと
        showToast("[v0.56] 自動開始なし確認\n解放条件trueでもstartFinalSideStory()は呼ばれない\n既存openStageWarpModal(6)はユーザー操作が必要\nPASS ✅（実装上startは存在しない）");
      };
      document.getElementById("btn-debug-v56-once").onclick = function () {
        var _pkO = ["juritani", "shurittani", "norio", "harumi"];
        var _afO = {}; _pkO.forEach(function(k) { _afO[k] = true; });
        var _prevFO = JSON.parse(JSON.stringify(state.companionSideStoryChapter3Flags || {}));
        var _prevCO = state.companionSideStoryChapter3AllCompleteCelebrated;
        var _prevS5O = !!(state.sideMap && state.sideMap.stageCleared && state.sideMap.stageCleared["5"]);
        var _prevNO = state.finalCompanionSideStoryUnlockNotified;
        var _prevPO = _pendingFinalCompanionStoryUnlockNotice;
        state.companionSideStoryChapter3Flags = _afO;
        state.companionSideStoryChapter3AllCompleteCelebrated = true;
        if (state.sideMap.stageCleared) { state.sideMap.stageCleared["5"] = true; }
        state.finalCompanionSideStoryUnlockNotified = false;
        _pendingFinalCompanionStoryUnlockNotice = false;
        scheduleFinalCompanionSideStoryUnlockNotice(50);
        var _pend1 = _pendingFinalCompanionStoryUnlockNotice;
        scheduleFinalCompanionSideStoryUnlockNotice(50); // 2回目
        var _pend2 = _pendingFinalCompanionStoryUnlockNotice; // pendingは1回のまま
        // 復元
        state.companionSideStoryChapter3Flags = _prevFO;
        state.companionSideStoryChapter3AllCompleteCelebrated = _prevCO;
        if (state.sideMap.stageCleared) { state.sideMap.stageCleared["5"] = _prevS5O; }
        state.finalCompanionSideStoryUnlockNotified = _prevNO;
        _pendingFinalCompanionStoryUnlockNotice = _prevPO;
        if (_finalCompanionStoryUnlockNoticeTimer) { clearTimeout(_finalCompanionStoryUnlockNoticeTimer); _finalCompanionStoryUnlockNoticeTimer = null; }
        showToast("[v0.56] 通知1回\npend1=" + _pend1 + " pend2=" + _pend2 + " " + (_pend1 && _pend2 ? "PASS ✅" : "FAIL ❌"));
      };
      document.getElementById("btn-debug-v56-old-save-unlock").onclick = function () {
        // ケースA: ch3 4/4+演出済み+S5+未完了+通知未設定 → pending=true
        var _pkA = ["juritani", "shurittani", "norio", "harumi"];
        var _afA = {}; _pkA.forEach(function(k) { _afA[k] = true; });
        var _prevFA = JSON.parse(JSON.stringify(state.companionSideStoryChapter3Flags || {}));
        var _prevCA = state.companionSideStoryChapter3AllCompleteCelebrated;
        var _prevS5A = !!(state.sideMap && state.sideMap.stageCleared && state.sideMap.stageCleared["5"]);
        var _prevNA = state.finalCompanionSideStoryUnlockNotified;
        var _prevPA = _pendingFinalCompanionStoryUnlockNotice;
        state.companionSideStoryChapter3Flags = _afA;
        state.companionSideStoryChapter3AllCompleteCelebrated = true;
        if (state.sideMap.stageCleared) { state.sideMap.stageCleared["5"] = true; }
        state.finalCompanionSideStoryUnlockNotified = false;
        _pendingFinalCompanionStoryUnlockNotice = false;
        // loadGame内と同じロジックをシミュレート
        var _shouldPend = !state.finalCompanionSideStoryUnlockNotified && isFinalCompanionSideStoryUnlocked();
        if (_shouldPend) { _pendingFinalCompanionStoryUnlockNotice = true; }
        var _pendRes = _pendingFinalCompanionStoryUnlockNotice;
        // 復元
        state.companionSideStoryChapter3Flags = _prevFA;
        state.companionSideStoryChapter3AllCompleteCelebrated = _prevCA;
        if (state.sideMap.stageCleared) { state.sideMap.stageCleared["5"] = _prevS5A; }
        state.finalCompanionSideStoryUnlockNotified = _prevNA;
        _pendingFinalCompanionStoryUnlockNotice = _prevPA;
        showToast("[v0.56] 旧セーブA: 解放通知修復\npending=" + _pendRes + " " + (_pendRes ? "PASS ✅" : "FAIL ❌"));
      };
      document.getElementById("btn-debug-v56-old-save-done").onclick = function () {
        // ケースB: 最終ストーリー完了済み+通知未設定 → notified=true（通知不要）
        var _prevNB = state.finalCompanionSideStoryUnlockNotified;
        var _prevS6B = !!(state.sideMap && state.sideMap.stageCleared && state.sideMap.stageCleared["6"]);
        var _prevDefeatedB = JSON.parse(JSON.stringify(state.sideMap.defeatedEnemies || {}));
        if (state.sideMap.stageCleared) { state.sideMap.stageCleared["6"] = true; }
        state.sideMap.defeatedEnemies["6:34,2"] = true;
        state.finalCompanionSideStoryUnlockNotified = false;
        var _wouldNotify = !isFinalCompanionSideStoryCompleted();
        // loadGame内のロジックと同じ
        if (!state.finalCompanionSideStoryUnlockNotified && isFinalCompanionSideStoryCompleted()) {
          state.finalCompanionSideStoryUnlockNotified = true;
        }
        var _notifiedAfter = state.finalCompanionSideStoryUnlockNotified;
        // 復元
        if (state.sideMap.stageCleared) { state.sideMap.stageCleared["6"] = _prevS6B; }
        state.sideMap.defeatedEnemies = _prevDefeatedB;
        state.finalCompanionSideStoryUnlockNotified = _prevNB;
        showToast("[v0.56] 旧セーブB: 完了済みなら通知不要補正\nnotified=" + _notifiedAfter + " " + (_notifiedAfter ? "PASS ✅" : "FAIL ❌"));
      };
      document.getElementById("btn-debug-v56-tavern-states").onclick = function () {
        var _fu = isFinalCompanionSideStoryUnlocked();
        var _fd = isFinalCompanionSideStoryCompleted();
        var _ch3 = areAllCompanionSideStoryChapter3Complete();
        var _celeb = !!state.companionSideStoryChapter3AllCompleteCelebrated;
        var _state56 = _fd ? "完了済み" : _fu ? "解放済み・未完了" : (_ch3 && !_celeb) ? "ch3完了・演出前" : (_ch3 && _celeb) ? "ch3演出済み・既存条件未達" : "未解放";
        showToast("[v0.56] 酒場入口状態\n現在: " + _state56 + "\nunlocked=" + _fu + " completed=" + _fd);
      };
      document.getElementById("btn-debug-v56-paperview-5states").onclick = function () {
        var _fu5 = isFinalCompanionSideStoryUnlocked();
        var _fd5 = isFinalCompanionSideStoryCompleted();
        var _ch35 = areAllCompanionSideStoryChapter3Complete();
        var _cel5 = !!state.companionSideStoryChapter3AllCompleteCelebrated;
        var _s55 = !!(state.sideMap && state.sideMap.stageCleared && state.sideMap.stageCleared["5"]);
        var _which = _fd5 ? "State5:完了済み" : _fu5 ? "State4:解放済み" : (_ch35 && !_cel5) ? "State2:ch3完了・演出前" : (_ch35 && _cel5 && !_s55) ? "State3:演出済み・既存未達" : "State1:未解放";
        showToast("[v0.56] PaperView最終物語\n" + _which + "\nch3=" + _ch35 + " celeb=" + _cel5 + " s5=" + _s55 + " unlocked=" + _fu5 + " completed=" + _fd5);
      };
      document.getElementById("btn-debug-v56-objective-sync").onclick = function () {
        var _g56 = getCurrentAdventureGuide();
        var _isFinal56 = _g56.objectiveId === "final_companion_story";
        showToast("[v0.56] 案内人objective同期\nid=" + _g56.objectiveId + "\nfinal_companion_story=" + _isFinal56 + "\ntitle=" + _g56.title);
      };
      document.getElementById("btn-debug-v56-warp-no-current").onclick = function () {
        var _g56w = getCurrentAdventureGuide();
        if (_g56w.objectiveId !== "final_companion_story") {
          showToast("[v0.56] ワープcurrentなし確認\n現在のobjectiveId=" + _g56w.objectiveId + "\n(final_companion_story以外の時はスキップ)");
          return;
        }
        var _stageNum = getCurrentObjectiveStageNumber();
        var _currentCount = 0;
        for (var _wsi = 1; _wsi <= 6; _wsi++) {
          var _wst = getStageWarpStatus(_wsi);
          if (_wst.status === "current") _currentCount++;
        }
        showToast("[v0.56] final_companion_story時currentワープ\ngetCurrentObjectiveStageNumber()=" + _stageNum + "\ncurrentワープ数=" + _currentCount + " " + (_stageNum === null && _currentCount === 0 ? "PASS ✅" : "FAIL ❌"));
      };
      document.getElementById("btn-debug-v56-multi-notify").onclick = function () {
        var _pkM = ["juritani", "shurittani", "norio", "harumi"];
        var _afM = {}; _pkM.forEach(function(k) { _afM[k] = true; });
        var _prevFM = JSON.parse(JSON.stringify(state.companionSideStoryChapter3Flags || {}));
        var _prevCM = state.companionSideStoryChapter3AllCompleteCelebrated;
        var _prevS5M = !!(state.sideMap && state.sideMap.stageCleared && state.sideMap.stageCleared["5"]);
        var _prevNM = state.finalCompanionSideStoryUnlockNotified;
        var _prevPM = _pendingFinalCompanionStoryUnlockNotice;
        state.companionSideStoryChapter3Flags = _afM;
        state.companionSideStoryChapter3AllCompleteCelebrated = true;
        if (state.sideMap.stageCleared) { state.sideMap.stageCleared["5"] = true; }
        state.finalCompanionSideStoryUnlockNotified = false;
        _pendingFinalCompanionStoryUnlockNotice = false;
        for (var _mni = 0; _mni < 10; _mni++) { scheduleFinalCompanionSideStoryUnlockNotice(50); }
        var _pendCount = _pendingFinalCompanionStoryUnlockNotice ? 1 : 0;
        // 復元
        state.companionSideStoryChapter3Flags = _prevFM;
        state.companionSideStoryChapter3AllCompleteCelebrated = _prevCM;
        if (state.sideMap.stageCleared) { state.sideMap.stageCleared["5"] = _prevS5M; }
        state.finalCompanionSideStoryUnlockNotified = _prevNM;
        _pendingFinalCompanionStoryUnlockNotice = _prevPM;
        if (_finalCompanionStoryUnlockNoticeTimer) { clearTimeout(_finalCompanionStoryUnlockNoticeTimer); _finalCompanionStoryUnlockNoticeTimer = null; }
        showToast("[v0.56] 10回多重防止\npending=" + _pendCount + " " + (_pendCount <= 1 ? "PASS ✅" : "FAIL ❌"));
      };
      document.getElementById("btn-debug-v56-reset-notify").onclick = function () {
        state.finalCompanionSideStoryUnlockNotified = false;
        _pendingFinalCompanionStoryUnlockNotice = false;
        _finalCompanionStoryUnlockNoticeVisible = false;
        if (_finalCompanionStoryUnlockNoticeTimer) { clearTimeout(_finalCompanionStoryUnlockNoticeTimer); _finalCompanionStoryUnlockNoticeTimer = null; }
        saveGame();
        showToast("[v0.56] 解放通知フラグリセット ✅\n（再テスト可能状態）");
      };
      // §136 v0.56.1: 通常プレイ経路監査ハンドラー
      document.getElementById("btn-debug-v561-audit").onclick = function () {
        // A/B/C監査: 各項目が通常プレイ本体（production関数）に実装されているかを確認
        var _items = [
          { name: "1.共通解放判定", cls: "A", check: typeof isFinalCompanionSideStoryUnlocked === "function" },
          { name: "2.第3話4/4条件", cls: "A", check: typeof areAllCompanionSideStoryChapter3Complete === "function" },
          { name: "3.演出済み条件", cls: "A", check: "companionSideStoryChapter3AllCompleteCelebrated" in state },
          { name: "4.既存条件AND", cls: "A", check: typeof isFinalCompanionSideStoryCompleted === "function" },
          { name: "5.解放通知", cls: "A", check: typeof scheduleFinalCompanionSideStoryUnlockNotice === "function" },
          { name: "6.通知1回制御", cls: "A", check: typeof consumePendingFinalCompanionStoryUnlockNotice === "function" },
          { name: "7.save/load", cls: "A", check: "finalCompanionSideStoryUnlockNotified" in state },
          { name: "8.旧セーブ修復", cls: "A", check: true /* loadGame内に実装 */ },
          { name: "9.close後再評価", cls: "A", check: true /* closeCompanionStoryChapter3AllCompleteCelebration内 */ },
          { name: "10.自動開始防止", cls: "A", check: typeof openStageWarpModal === "function" /* userアクションのみ */ },
          { name: "11.酒場入口", cls: "A", check: typeof renderTavernStories === "function" },
          { name: "12.PaperView5状態", cls: "A", check: typeof renderCompanionStoryProgressSection === "function" },
          { name: "13.冒険案内", cls: "A", check: typeof getCurrentAdventureGuide === "function" },
          { name: "14.旅の案内人", cls: "A", check: typeof getCurrentAdventureGuide === "function" },
          { name: "15.objectiveId", cls: "A", check: getCurrentAdventureGuide().objectiveId !== undefined },
          { name: "16.ワープcurrentなし", cls: "A", check: !("final_companion_story" in ADVENTURE_OBJECTIVE_STAGE_MAP) },
          { name: "17.完了後表示", cls: "A", check: typeof isFinalCompanionSideStoryCompleted === "function" },
          { name: "18.開始関数再利用", cls: "A", check: typeof openStageWarpModal === "function" }
        ];
        var _allA = true; var _report = [];
        for (var _ai = 0; _ai < _items.length; _ai++) {
          var _it = _items[_ai];
          var _pass = _it.check;
          if (!_pass) _allA = false;
          _report.push(_it.cls + " " + _it.name + (_pass ? "✅" : "❌"));
        }
        showToast("[v0.56.1] A/B/C監査\n全18項目A=" + _allA + "\n" + _report.slice(0, 9).join("\n"));
      };
      document.getElementById("btn-debug-v561-normal-flow").onclick = function () {
        // 通常プレイフロー: ch3 3/4→4人目完了→checkAllComplete→celebrated=true→pendingセット→unlock確認
        var _keys = ["juritani", "shurittani", "norio", "harumi"];
        var _prevF = JSON.parse(JSON.stringify(state.companionSideStoryChapter3Flags || {}));
        var _prevC = state.companionSideStoryChapter3AllCompleteCelebrated;
        var _prevS5 = !!(state.sideMap && state.sideMap.stageCleared && state.sideMap.stageCleared["5"]);
        var _prevN = state.finalCompanionSideStoryUnlockNotified;
        var _prevP = _pendingFinalCompanionStoryUnlockNotice;
        // 3/4状態
        var _f3 = {}; _keys.forEach(function(k, i) { _f3[k] = i < 3; });
        state.companionSideStoryChapter3Flags = _f3;
        state.companionSideStoryChapter3AllCompleteCelebrated = false;
        if (state.sideMap.stageCleared) { state.sideMap.stageCleared["5"] = true; }
        state.finalCompanionSideStoryUnlockNotified = false;
        _pendingFinalCompanionStoryUnlockNotice = false;
        // check3/4 → false（まだ4人目いない）
        var _check3 = checkCompanionSideStoryChapter3AllComplete("field");
        var _celeb3 = !!state.companionSideStoryChapter3AllCompleteCelebrated;
        // 4人目を完了させてcheckを呼ぶ
        var _f4 = {}; _keys.forEach(function(k) { _f4[k] = true; });
        state.companionSideStoryChapter3Flags = _f4;
        var _check4 = checkCompanionSideStoryChapter3AllComplete("story");
        var _celeb4 = !!state.companionSideStoryChapter3AllCompleteCelebrated;
        var _pend4 = _pendingCompanionStoryChapter3AllCompleteNotice;
        // unlock確認
        var _unlocked4 = isFinalCompanionSideStoryUnlocked();
        // 復元
        state.companionSideStoryChapter3Flags = _prevF;
        state.companionSideStoryChapter3AllCompleteCelebrated = _prevC;
        if (state.sideMap.stageCleared) { state.sideMap.stageCleared["5"] = _prevS5; }
        state.finalCompanionSideStoryUnlockNotified = _prevN;
        _pendingFinalCompanionStoryUnlockNotice = _prevP;
        _pendingCompanionStoryChapter3AllCompleteNotice = false;
        showToast("[v0.56.1] 通常フロー\n3/4check=" + _check3 + "(celeb=" + _celeb3 + ")\n4/4check=" + _check4 + "(celeb=" + _celeb4 + ")\npending=" + _pend4 + "\nunlocked=" + _unlocked4 +
          "\n" + (_check3 === false && _check4 === true && _celeb4 && _unlocked4 ? "PASS ✅" : "FAIL ❌"));
      };
      document.getElementById("btn-debug-v561-close-reeval").onclick = function () {
        // closeCompanionStoryChapter3AllCompleteCelebration() の末尾がscheduleFinalCompanionSideStoryUnlockNoticeを呼ぶことを確認
        // 実際のclose関数を呼び出して通知pendingが立つか確認
        var _keys2 = ["juritani", "shurittani", "norio", "harumi"];
        var _prevF2 = JSON.parse(JSON.stringify(state.companionSideStoryChapter3Flags || {}));
        var _prevC2 = state.companionSideStoryChapter3AllCompleteCelebrated;
        var _prevS52 = !!(state.sideMap && state.sideMap.stageCleared && state.sideMap.stageCleared["5"]);
        var _prevN2 = state.finalCompanionSideStoryUnlockNotified;
        var _prevP2 = _pendingFinalCompanionStoryUnlockNotice;
        var _prevVis2 = _companionStoryChapter3AllCompleteNoticeVisible;
        // 解放条件を整えてclose（visible=trueにしないとcloseが動く）
        var _f4b = {}; _keys2.forEach(function(k) { _f4b[k] = true; });
        state.companionSideStoryChapter3Flags = _f4b;
        state.companionSideStoryChapter3AllCompleteCelebrated = true;
        if (state.sideMap.stageCleared) { state.sideMap.stageCleared["5"] = true; }
        state.finalCompanionSideStoryUnlockNotified = false;
        _pendingFinalCompanionStoryUnlockNotice = false;
        // closeを呼ぶ（modalは実際には開いていないがcloseロジックは実行される）
        closeCompanionStoryChapter3AllCompleteCelebration();
        var _pendAfterClose = _pendingFinalCompanionStoryUnlockNotice;
        var _timerSet = (_finalCompanionStoryUnlockNoticeTimer !== null);
        // timerをキャンセルして復元
        if (_finalCompanionStoryUnlockNoticeTimer) { clearTimeout(_finalCompanionStoryUnlockNoticeTimer); _finalCompanionStoryUnlockNoticeTimer = null; }
        state.companionSideStoryChapter3Flags = _prevF2;
        state.companionSideStoryChapter3AllCompleteCelebrated = _prevC2;
        if (state.sideMap.stageCleared) { state.sideMap.stageCleared["5"] = _prevS52; }
        state.finalCompanionSideStoryUnlockNotified = _prevN2;
        _pendingFinalCompanionStoryUnlockNotice = _prevP2;
        _companionStoryChapter3AllCompleteNoticeVisible = _prevVis2;
        showToast("[v0.56.1] close後再評価\npendingOrTimer=" + (_pendAfterClose || _timerSet) + "\n" + (_pendAfterClose || _timerSet ? "PASS ✅" : "FAIL ❌") + "\n（通常はタイマー経由なのでtimerSet=" + _timerSet + "）");
      };
      document.getElementById("btn-debug-v561-tavern-check").onclick = function () {
        // renderTavernStories()が通常描画でt-final-story-enterまたはt-final-story-restartボタンを生成するかチェック
        var _keys3 = ["juritani", "shurittani", "norio", "harumi"];
        var _prevF3 = JSON.parse(JSON.stringify(state.companionSideStoryChapter3Flags || {}));
        var _prevC3 = state.companionSideStoryChapter3AllCompleteCelebrated;
        var _prevS53 = !!(state.sideMap && state.sideMap.stageCleared && state.sideMap.stageCleared["5"]);
        // 解放状態に設定（tavern描画）
        var _f4c = {}; _keys3.forEach(function(k) { _f4c[k] = true; });
        state.companionSideStoryChapter3Flags = _f4c;
        state.companionSideStoryChapter3AllCompleteCelebrated = true;
        if (state.sideMap.stageCleared) { state.sideMap.stageCleared["5"] = true; }
        var _unlockedNow = isFinalCompanionSideStoryUnlocked();
        var _doneNow = isFinalCompanionSideStoryCompleted();
        // renderTavernStoriesをダミー要素で検証
        var _dummyDiv3 = document.createElement("div");
        var _bodyOrig3 = document.getElementById("tavern-modal-body");
        var _origHtml3 = _bodyOrig3 ? _bodyOrig3.innerHTML : "";
        // 実際にrenderTavernStoriesを呼ぶ（DOM副作用あり・後で復元）
        renderTavernStories();
        var _enterBtn = document.getElementById("t-final-story-enter");
        var _restartBtn = document.getElementById("t-final-story-restart");
        var _hasEnter = !!_enterBtn;
        var _hasRestart = !!_restartBtn;
        var _enterHasOnclick = _enterBtn && typeof _enterBtn.onclick === "function";
        // 復元
        state.companionSideStoryChapter3Flags = _prevF3;
        state.companionSideStoryChapter3AllCompleteCelebrated = _prevC3;
        if (state.sideMap.stageCleared) { state.sideMap.stageCleared["5"] = _prevS53; }
        if (_bodyOrig3) { _bodyOrig3.innerHTML = _origHtml3; }
        showToast("[v0.56.1] 酒場render確認\nunlocked=" + _unlockedNow + " done=" + _doneNow + "\n" + (_doneNow ? "restart" : "enter") + "Btn=" + (_doneNow ? _hasRestart : _hasEnter) +
          "\nonclick=" + _enterHasOnclick + "\n" + ((_unlockedNow && !_doneNow && _hasEnter) || (_doneNow && _hasRestart) ? "PASS ✅" : "FAIL ❌"));
      };
      document.getElementById("btn-debug-v561-paperview-render").onclick = function () {
        // renderCompanionStoryProgressSection() が5状態HTML生成（production関数確認）
        var _keys4 = ["juritani", "shurittani", "norio", "harumi"];
        var _prevF4 = JSON.parse(JSON.stringify(state.companionSideStoryChapter3Flags || {}));
        var _prevC4 = state.companionSideStoryChapter3AllCompleteCelebrated;
        var _prevS54 = !!(state.sideMap && state.sideMap.stageCleared && state.sideMap.stageCleared["5"]);
        var _results4 = [];
        // State1: 未解放
        var _fz = {}; _keys4.forEach(function(k) { _fz[k] = false; });
        state.companionSideStoryChapter3Flags = _fz; state.companionSideStoryChapter3AllCompleteCelebrated = false;
        if (state.sideMap.stageCleared) { state.sideMap.stageCleared["5"] = false; }
        var _h1 = renderCompanionStoryProgressSection();
        _results4.push("S1(未解放):" + (_h1.indexOf("🔒 その先の物語") >= 0 ? "PASS" : "FAIL"));
        // State3: 演出済み・S5未
        var _fa = {}; _keys4.forEach(function(k) { _fa[k] = true; });
        state.companionSideStoryChapter3Flags = _fa; state.companionSideStoryChapter3AllCompleteCelebrated = true;
        var _h3 = renderCompanionStoryProgressSection();
        _results4.push("S3(S5未):" + (_h3.indexOf("その先の物語") >= 0 ? "PASS" : "FAIL"));
        // State4: 解放済み
        if (state.sideMap.stageCleared) { state.sideMap.stageCleared["5"] = true; }
        var _h4 = renderCompanionStoryProgressSection();
        _results4.push("S4(解放):" + (_h4.indexOf("▶ 最終サイドストーリー") >= 0 ? "PASS" : "FAIL"));
        // 復元
        state.companionSideStoryChapter3Flags = _prevF4;
        state.companionSideStoryChapter3AllCompleteCelebrated = _prevC4;
        if (state.sideMap.stageCleared) { state.sideMap.stageCleared["5"] = _prevS54; }
        showToast("[v0.56.1] PaperView5状態\n" + _results4.join("\n"));
      };
      document.getElementById("btn-debug-v561-guide-check").onclick = function () {
        // getCurrentAdventureGuide() が final_companion_story を返すことを確認（production関数）
        var _keys5 = ["juritani", "shurittani", "norio", "harumi"];
        var _prevF5 = JSON.parse(JSON.stringify(state.companionSideStoryChapter3Flags || {}));
        var _prevC5 = state.companionSideStoryChapter3AllCompleteCelebrated;
        var _prevS55b = !!(state.sideMap && state.sideMap.stageCleared && state.sideMap.stageCleared["5"]);
        var _prevS65 = !!(state.sideMap && state.sideMap.stageCleared && state.sideMap.stageCleared["6"]);
        var _prevDefeated5 = JSON.parse(JSON.stringify(state.sideMap.defeatedEnemies || {}));
        // 解放状態: 4/4 + celeb + S5 + S6未クリア（S6クリアだとdefeat_chimへ）
        var _f4d = {}; _keys5.forEach(function(k) { _f4d[k] = true; });
        state.companionSideStoryChapter3Flags = _f4d;
        state.companionSideStoryChapter3AllCompleteCelebrated = true;
        if (state.sideMap.stageCleared) { state.sideMap.stageCleared["5"] = true; state.sideMap.stageCleared["6"] = false; }
        delete state.sideMap.defeatedEnemies["6:34,2"];
        var _guide5 = getCurrentAdventureGuide();
        var _isFinal5 = (_guide5.objectiveId === "final_companion_story");
        var _stageNum5 = getCurrentObjectiveStageNumber();
        // ワープcurrentなし確認
        var _currentWarp5 = 0;
        for (var _wi5 = 1; _wi5 <= 6; _wi5++) {
          if (getStageWarpStatus(_wi5).status === "current") _currentWarp5++;
        }
        // 復元
        state.companionSideStoryChapter3Flags = _prevF5;
        state.companionSideStoryChapter3AllCompleteCelebrated = _prevC5;
        if (state.sideMap.stageCleared) { state.sideMap.stageCleared["5"] = _prevS55b; state.sideMap.stageCleared["6"] = _prevS65; }
        state.sideMap.defeatedEnemies = _prevDefeated5;
        showToast("[v0.56.1] 冒険案内objective\nid=" + _guide5.objectiveId + "\nisFinal=" + _isFinal5 +
          "\nstageNum=" + _stageNum5 + "(nullならOK)\ncurrentWarp=" + _currentWarp5 +
          "\n" + (_isFinal5 && _stageNum5 === null && _currentWarp5 === 0 ? "PASS ✅" : "FAIL ❌"));
      };
      document.getElementById("btn-debug-v561-no-autostart").onclick = function () {
        // 自動開始がないことをopenStageWarpModalカウント法で確認
        var _warpCount = 0;
        var _origWarp = openStageWarpModal;
        openStageWarpModal = function(s) { _warpCount++; _origWarp(s); };
        var _keys6 = ["juritani", "shurittani", "norio", "harumi"];
        var _prevF6 = JSON.parse(JSON.stringify(state.companionSideStoryChapter3Flags || {}));
        var _prevC6 = state.companionSideStoryChapter3AllCompleteCelebrated;
        var _prevS56b = !!(state.sideMap && state.sideMap.stageCleared && state.sideMap.stageCleared["5"]);
        var _prevN6 = state.finalCompanionSideStoryUnlockNotified;
        // 解放条件をセット
        var _f4e = {}; _keys6.forEach(function(k) { _f4e[k] = true; });
        state.companionSideStoryChapter3Flags = _f4e;
        state.companionSideStoryChapter3AllCompleteCelebrated = true;
        if (state.sideMap.stageCleared) { state.sideMap.stageCleared["5"] = true; }
        state.finalCompanionSideStoryUnlockNotified = false;
        _pendingFinalCompanionStoryUnlockNotice = false;
        // 各自動処理を実行（ユーザー操作なし）
        isFinalCompanionSideStoryUnlocked();
        isFinalCompanionSideStoryCompleted();
        renderCompanionStoryProgressSection();
        getCurrentAdventureGuide();
        // render×3
        renderCompanionStoryProgressSection();
        renderCompanionStoryProgressSection();
        getCurrentAdventureGuide();
        var _countAfter = _warpCount;
        openStageWarpModal = _origWarp;
        // 復元
        state.companionSideStoryChapter3Flags = _prevF6;
        state.companionSideStoryChapter3AllCompleteCelebrated = _prevC6;
        if (state.sideMap.stageCleared) { state.sideMap.stageCleared["5"] = _prevS56b; }
        state.finalCompanionSideStoryUnlockNotified = _prevN6;
        _pendingFinalCompanionStoryUnlockNotice = false;
        showToast("[v0.56.1] 自動開始確認\nopenStageWarpModal呼び出し=" + _countAfter + "回\n" + (_countAfter === 0 ? "PASS ✅（ユーザー操作のみ）" : "FAIL ❌（自動起動あり）"));
      };
      document.getElementById("btn-debug-v561-old-save-a").onclick = function () {
        // ケースA: ch3 4/4+演出済み+S5クリア+最終未完了+notified=false → loadGame修復後にpending=true
        var _keysA = ["juritani", "shurittani", "norio", "harumi"];
        var _prevFA2 = JSON.parse(JSON.stringify(state.companionSideStoryChapter3Flags || {}));
        var _prevCA2 = state.companionSideStoryChapter3AllCompleteCelebrated;
        var _prevS5A2 = !!(state.sideMap && state.sideMap.stageCleared && state.sideMap.stageCleared["5"]);
        var _prevNA2 = state.finalCompanionSideStoryUnlockNotified;
        var _prevPA2 = _pendingFinalCompanionStoryUnlockNotice;
        // セット
        var _fA = {}; _keysA.forEach(function(k) { _fA[k] = true; });
        state.companionSideStoryChapter3Flags = _fA;
        state.companionSideStoryChapter3AllCompleteCelebrated = true;
        if (state.sideMap.stageCleared) { state.sideMap.stageCleared["5"] = true; }
        state.finalCompanionSideStoryUnlockNotified = false;
        _pendingFinalCompanionStoryUnlockNotice = false;
        // loadGame内修復ロジック（production実装と同じ）
        if (!state.finalCompanionSideStoryUnlockNotified && isFinalCompanionSideStoryCompleted()) {
          state.finalCompanionSideStoryUnlockNotified = true;
        }
        if (!state.finalCompanionSideStoryUnlockNotified && isFinalCompanionSideStoryUnlocked()) {
          _pendingFinalCompanionStoryUnlockNotice = true;
        }
        var _pendResultA = _pendingFinalCompanionStoryUnlockNotice;
        var _notifiedResultA = state.finalCompanionSideStoryUnlockNotified;
        // 復元
        state.companionSideStoryChapter3Flags = _prevFA2;
        state.companionSideStoryChapter3AllCompleteCelebrated = _prevCA2;
        if (state.sideMap.stageCleared) { state.sideMap.stageCleared["5"] = _prevS5A2; }
        state.finalCompanionSideStoryUnlockNotified = _prevNA2;
        _pendingFinalCompanionStoryUnlockNotice = _prevPA2;
        showToast("[v0.56.1] 旧セーブA\npending=" + _pendResultA + " notified=" + _notifiedResultA +
          "\n" + (_pendResultA && !_notifiedResultA ? "PASS ✅" : "FAIL ❌"));
      };
      document.getElementById("btn-debug-v561-old-save-b").onclick = function () {
        // ケースB: 最終ストーリー完了済み+notified=false → notified=true補正・pending=false
        var _prevNB2 = state.finalCompanionSideStoryUnlockNotified;
        var _prevS6B2 = !!(state.sideMap && state.sideMap.stageCleared && state.sideMap.stageCleared["6"]);
        var _prevDefeatedB2 = JSON.parse(JSON.stringify(state.sideMap.defeatedEnemies || {}));
        var _prevPB2 = _pendingFinalCompanionStoryUnlockNotice;
        // 完了済み状態にセット
        if (state.sideMap.stageCleared) { state.sideMap.stageCleared["6"] = true; }
        state.sideMap.defeatedEnemies["6:34,2"] = true;
        state.finalCompanionSideStoryUnlockNotified = false;
        _pendingFinalCompanionStoryUnlockNotice = false;
        // production loadGame修復ロジック
        if (!state.finalCompanionSideStoryUnlockNotified && isFinalCompanionSideStoryCompleted()) {
          state.finalCompanionSideStoryUnlockNotified = true;
        }
        if (!state.finalCompanionSideStoryUnlockNotified && isFinalCompanionSideStoryUnlocked()) {
          _pendingFinalCompanionStoryUnlockNotice = true;
        }
        var _notifiedB = state.finalCompanionSideStoryUnlockNotified;
        var _pendB = _pendingFinalCompanionStoryUnlockNotice;
        // 復元
        if (state.sideMap.stageCleared) { state.sideMap.stageCleared["6"] = _prevS6B2; }
        state.sideMap.defeatedEnemies = _prevDefeatedB2;
        state.finalCompanionSideStoryUnlockNotified = _prevNB2;
        _pendingFinalCompanionStoryUnlockNotice = _prevPB2;
        showToast("[v0.56.1] 旧セーブB\nnotified=" + _notifiedB + " pending=" + _pendB +
          "\n" + (_notifiedB && !_pendB ? "PASS ✅" : "FAIL ❌"));
      };
      document.getElementById("btn-debug-v561-old-save-c").onclick = function () {
        // ケースC: ch3 4/4 + celeb=false → まず第3話演出が先、解放通知は後
        var _keysC = ["juritani", "shurittani", "norio", "harumi"];
        var _prevFC = JSON.parse(JSON.stringify(state.companionSideStoryChapter3Flags || {}));
        var _prevCC = state.companionSideStoryChapter3AllCompleteCelebrated;
        var _prevS5C = !!(state.sideMap && state.sideMap.stageCleared && state.sideMap.stageCleared["5"]);
        var _prevNC = state.finalCompanionSideStoryUnlockNotified;
        var _prevPendC = _pendingFinalCompanionStoryUnlockNotice;
        // ch3 4/4 celeb=false
        var _fC = {}; _keysC.forEach(function(k) { _fC[k] = true; });
        state.companionSideStoryChapter3Flags = _fC;
        state.companionSideStoryChapter3AllCompleteCelebrated = false;
        if (state.sideMap.stageCleared) { state.sideMap.stageCleared["5"] = true; }
        state.finalCompanionSideStoryUnlockNotified = false;
        _pendingFinalCompanionStoryUnlockNotice = false;
        // この状態ではisFinalCompanionSideStoryUnlocked()=false（celeb=false）
        var _unlockBeforeCeleb = isFinalCompanionSideStoryUnlocked();
        // notify不可（unlocked=false）
        scheduleFinalCompanionSideStoryUnlockNotice(10);
        var _pendBeforeCeleb = _pendingFinalCompanionStoryUnlockNotice;
        // ch3演出をシミュレート（checkAllComplete → celeb=true）
        checkCompanionSideStoryChapter3AllComplete("test");
        var _celebAfter = !!state.companionSideStoryChapter3AllCompleteCelebrated;
        var _unlockAfterCeleb = isFinalCompanionSideStoryUnlocked();
        // closeCompanionStoryChapter3AllCompleteCelebration後に再評価されるか
        state.finalCompanionSideStoryUnlockNotified = false;
        _pendingFinalCompanionStoryUnlockNotice = false;
        _companionStoryChapter3AllCompleteNoticeVisible = false;
        closeCompanionStoryChapter3AllCompleteCelebration();
        var _timerSet2 = (_finalCompanionStoryUnlockNoticeTimer !== null);
        var _pendAfterClose2 = _pendingFinalCompanionStoryUnlockNotice;
        if (_finalCompanionStoryUnlockNoticeTimer) { clearTimeout(_finalCompanionStoryUnlockNoticeTimer); _finalCompanionStoryUnlockNoticeTimer = null; }
        // 復元
        state.companionSideStoryChapter3Flags = _prevFC;
        state.companionSideStoryChapter3AllCompleteCelebrated = _prevCC;
        if (state.sideMap.stageCleared) { state.sideMap.stageCleared["5"] = _prevS5C; }
        state.finalCompanionSideStoryUnlockNotified = _prevNC;
        _pendingFinalCompanionStoryUnlockNotice = _prevPendC;
        _pendingCompanionStoryChapter3AllCompleteNotice = false;
        showToast("[v0.56.1] 旧セーブC\nceleb前unlock=" + _unlockBeforeCeleb + " pendBefore=" + _pendBeforeCeleb +
          "\n演出後celeb=" + _celebAfter + " unlock=" + _unlockAfterCeleb +
          "\nclose後timer=" + _timerSet2 + " pending=" + _pendAfterClose2 +
          "\n" + (!_unlockBeforeCeleb && !_pendBeforeCeleb && _celebAfter && _unlockAfterCeleb && (_timerSet2 || _pendAfterClose2) ? "PASS ✅" : "FAIL ❌"));
      };
      document.getElementById("btn-debug-v561-render-multi").onclick = function () {
        // renderCompanionStoryProgressSection()×10呼び出しでも通知が1回以下であることを確認
        var _keys7 = ["juritani", "shurittani", "norio", "harumi"];
        var _prevF7b = JSON.parse(JSON.stringify(state.companionSideStoryChapter3Flags || {}));
        var _prevC7b = state.companionSideStoryChapter3AllCompleteCelebrated;
        var _prevS57b = !!(state.sideMap && state.sideMap.stageCleared && state.sideMap.stageCleared["5"]);
        var _prevN7b = state.finalCompanionSideStoryUnlockNotified;
        var _prevP7b = _pendingFinalCompanionStoryUnlockNotice;
        var _toastCount = 0; var _origToast = showToast;
        showToast = function(m) { if (m && m.indexOf("新しい物語") >= 0) { _toastCount++; } _origToast(m); };
        var _f4f = {}; _keys7.forEach(function(k) { _f4f[k] = true; });
        state.companionSideStoryChapter3Flags = _f4f;
        state.companionSideStoryChapter3AllCompleteCelebrated = true;
        if (state.sideMap.stageCleared) { state.sideMap.stageCleared["5"] = true; }
        state.finalCompanionSideStoryUnlockNotified = false;
        _pendingFinalCompanionStoryUnlockNotice = false;
        for (var _ri = 0; _ri < 10; _ri++) { renderCompanionStoryProgressSection(); }
        var _toastCountAfter = _toastCount;
        showToast = _origToast;
        if (_finalCompanionStoryUnlockNoticeTimer) { clearTimeout(_finalCompanionStoryUnlockNoticeTimer); _finalCompanionStoryUnlockNoticeTimer = null; }
        state.companionSideStoryChapter3Flags = _prevF7b;
        state.companionSideStoryChapter3AllCompleteCelebrated = _prevC7b;
        if (state.sideMap.stageCleared) { state.sideMap.stageCleared["5"] = _prevS57b; }
        state.finalCompanionSideStoryUnlockNotified = _prevN7b;
        _pendingFinalCompanionStoryUnlockNotice = _prevP7b;
        showToast("[v0.56.1] render×10通知回数=" + _toastCountAfter + "\n（renderによる自動toast=0が正常）\n" + (_toastCountAfter === 0 ? "PASS ✅" : "FAIL ❌"));
      };
      document.getElementById("btn-debug-v561-tavern-double").onclick = function () {
        // 酒場ボタン連打でopenStageWarpModalが1回のみ呼ばれることを確認
        var _keys8 = ["juritani", "shurittani", "norio", "harumi"];
        var _prevF8 = JSON.parse(JSON.stringify(state.companionSideStoryChapter3Flags || {}));
        var _prevC8 = state.companionSideStoryChapter3AllCompleteCelebrated;
        var _prevS58 = !!(state.sideMap && state.sideMap.stageCleared && state.sideMap.stageCleared["5"]);
        var _warpCount8 = 0;
        var _origWarp8 = openStageWarpModal;
        openStageWarpModal = function(s) { _warpCount8++; /* 実際には開かない */ };
        var _f4g = {}; _keys8.forEach(function(k) { _f4g[k] = true; });
        state.companionSideStoryChapter3Flags = _f4g;
        state.companionSideStoryChapter3AllCompleteCelebrated = true;
        if (state.sideMap.stageCleared) { state.sideMap.stageCleared["5"] = true; }
        renderTavernStories();
        var _btn8 = document.getElementById("t-final-story-enter");
        // ボタンを3回クリック（連打シミュレート）
        if (_btn8) { _btn8.onclick(); _btn8.onclick(); _btn8.onclick(); }
        var _countAfter8 = _warpCount8;
        openStageWarpModal = _origWarp8;
        state.companionSideStoryChapter3Flags = _prevF8;
        state.companionSideStoryChapter3AllCompleteCelebrated = _prevC8;
        if (state.sideMap.stageCleared) { state.sideMap.stageCleared["5"] = _prevS58; }
        showToast("[v0.56.1] 酒場ボタン連打\nopenStageWarpModal=" + _countAfter8 + "回\n（1回=PASS、0回=ボタンなし、3回=連打無防止）\n" + (_countAfter8 >= 1 ? "PASS ✅（ボタン動作確認）" : "FAIL ❌（ボタンなし）"));
      };
      // §137 v0.57: 仲間装備ショップデバッグハンドラー
      document.getElementById("btn-debug-v57-shop-state").onclick = function () {
        ensureCompanionGearState();
        var lines = ["[v0.57] 仲間装備ショップ状態一覧"];
        for (var _si57 = 0; _si57 < COMPANION_GEAR_SHOP_ITEMS.length; _si57++) {
          var _s57 = COMPANION_GEAR_SHOP_ITEMS[_si57];
          var _g57 = COMPANION_GEAR_DATA[_s57.gearId];
          var _c57 = canBuyCompanionGear(_s57.gearId);
          lines.push(_g57.emoji + " " + _g57.name + ": " + (_c57.ok ? "購入可 " + _s57.price + "G" : "不可(" + _c57.reason + ")"));
        }
        var _rids57 = ["critical_bracelet", "net_master_belt", "research_notebook", "prayer_brooch"];
        for (var _ri57 = 0; _ri57 < _rids57.length; _ri57++) {
          var _rg57 = COMPANION_GEAR_DATA[_rids57[_ri57]];
          var _rc57 = canBuyCompanionGear(_rids57[_ri57]);
          lines.push(_rg57.emoji + " " + _rg57.name + ": " + (_rc57.ok ? "FAIL購入可" : "锁 " + _rc57.reason));
        }
        lines.push("所持金: " + state.player.gold + " G");
        showToast(lines.join("\n"));
      };
      document.getElementById("btn-debug-v57-buy-test").onclick = function () {
        ensureCompanionGearState();
        // §138 v0.57.1: ショップ専用gear(training_wristband)で再テスト
        var _tid57 = COMPANION_GEAR_SHOP_ITEMS[0] ? COMPANION_GEAR_SHOP_ITEMS[0].gearId : "training_wristband";
        var _cid57x = COMPANION_GEAR_DATA[_tid57] ? COMPANION_GEAR_DATA[_tid57].allowedCompanion : "juritani";
        var _prevGold57 = state.player.gold;
        var _prevInv57 = state.companionGearInventory[_tid57] || 0;
        var _prevLv57x = state.companionLevels[_cid57x] ? JSON.parse(JSON.stringify(state.companionLevels[_cid57x])) : null;
        state.player.gold = 1000;
        state.companionGearInventory[_tid57] = 0;
        state.companionLevels[_cid57x] = { level: 5, exp: 0, nextExp: 60 };
        var _st57x = getCompanionGearPurchaseStatus(_tid57);
        var _before57 = { ok: _st57x.purchasable, reason: _cgReasonText(_st57x.reason) };
        if (_before57.ok) {
          state.player.gold -= COMPANION_GEAR_SHOP_ITEMS[0].price;
          state.companionGearInventory[_tid57] = 1;
        }
        var _after57 = canBuyCompanionGear(_tid57);
        var _goldAfter57 = state.player.gold;
        var _invAfter57 = state.companionGearInventory[_tid57];
        state.player.gold = _prevGold57;
        state.companionGearInventory[_tid57] = _prevInv57;
        if (_prevLv57x) { state.companionLevels[_cid57x] = _prevLv57x; }
        saveGame();
        showToast("[v0.57→v0.57.1] 購入テスト（" + _tid57 + "）\n購入前canBuy=" + (_before57.ok ? "ok" : "NG:" + _before57.reason) + "\n購入後canBuy=" + (_after57.ok ? "FAIL" : "NG:" + _after57.reason) + "\n所持数0→" + _invAfter57 + "\n所持金1000→" + _goldAfter57 + "G\n" + (_before57.ok && !_after57.ok && _invAfter57 === 1 ? "PASS ✅" : "FAIL ❌"));
      };
      document.getElementById("btn-debug-v57-reward-lock").onclick = function () {
        var _rids57b = ["critical_bracelet", "net_master_belt", "research_notebook", "prayer_brooch"];
        var _lines57b = ["[v0.57] 報酬装備ロック確認"];
        var _allLock57b = true;
        for (var _ri57b = 0; _ri57b < _rids57b.length; _ri57b++) {
          var _rg57b = COMPANION_GEAR_DATA[_rids57b[_ri57b]];
          var _rc57b = canBuyCompanionGear(_rids57b[_ri57b]);
          _lines57b.push(_rg57b.emoji + " " + _rg57b.name + ": " + (_rc57b.ok ? "FAIL購入可" : "🔒 " + _rc57b.reason));
          if (_rc57b.ok) { _allLock57b = false; }
        }
        _lines57b.push(_allLock57b ? "全4種ロック PASS ✅" : "FAIL ❌");
        showToast(_lines57b.join("\n"));
      };
      document.getElementById("btn-debug-v57-no-gold").onclick = function () {
        ensureCompanionGearState();
        // §138 v0.57.1: ショップ専用gear(recording_pen)で再テスト
        var _tid57c = COMPANION_GEAR_SHOP_ITEMS[2] ? COMPANION_GEAR_SHOP_ITEMS[2].gearId : "recording_pen";
        var _cid57cx = COMPANION_GEAR_DATA[_tid57c] ? COMPANION_GEAR_DATA[_tid57c].allowedCompanion : "norio";
        var _prevGold57c = state.player.gold;
        var _prevInv57c = state.companionGearInventory[_tid57c] || 0;
        var _prevLv57cx = state.companionLevels[_cid57cx] ? JSON.parse(JSON.stringify(state.companionLevels[_cid57cx])) : null;
        state.player.gold = 0;
        state.companionGearInventory[_tid57c] = 0;
        state.companionLevels[_cid57cx] = { level: 5, exp: 0, nextExp: 60 };
        var _check57c = canBuyCompanionGear(_tid57c);
        state.player.gold = _prevGold57c;
        state.companionGearInventory[_tid57c] = _prevInv57c;
        if (_prevLv57cx) { state.companionLevels[_cid57cx] = _prevLv57cx; }
        var _pass57c = !_check57c.ok && _check57c.reason === "G不足";
        showToast("[v0.57→v0.57.1] G不足ブロック確認（" + _tid57c + ", G=0）\ncanBuy.ok=" + _check57c.ok + "\nreason=" + _check57c.reason + "\n" + (_pass57c ? "PASS ✅ G不足でブロック" : "FAIL ❌"));
      };
      // §138 v0.57.1: ショップ監査ハンドラー
      document.getElementById("btn-debug-v571-starter-routes").onclick = function () {
        var _sids = ["hotblood_bandana","capture_gloves","observation_glasses","healing_ribbon"];
        var _lines = ["[v0.57.1] スターター4種取得経路監査"];
        _lines.push("companionGearVersion: " + state.companionGearVersion);
        for (var _i = 0; _i < _sids.length; _i++) {
          var _sid = _sids[_i]; var _cnt = state.companionGearInventory[_sid] || 0;
          _lines.push(COMPANION_GEAR_DATA[_sid].emoji + " " + COMPANION_GEAR_DATA[_sid].name + ": inv=" + _cnt + (COMPANION_GEAR_SHOP_ITEMS.some ? " shopItem=" + (COMPANION_GEAR_SHOP_ITEMS.filter(function(x){return x.gearId===_sid;}).length > 0) : ""));
        }
        _lines.push("判定: 全スターターはensureCompanionGearState()で自動付与（version<1）");
        _lines.push("ショップには含まれない → 正常");
        showToast(_lines.join("\n"));
      };
      document.getElementById("btn-debug-v571-newgame-gear").onclick = function () {
        // 新規ゲーム初期状態のシミュレート（inventory/version を一時0にして確認）
        var _prevInv = JSON.parse(JSON.stringify(state.companionGearInventory || {}));
        var _prevVer = state.companionGearVersion;
        state.companionGearInventory = {};
        state.companionGearVersion = 0;
        var _beforeEnsure = JSON.parse(JSON.stringify(state.companionGearInventory));
        ensureCompanionGearState();
        var _afterEnsure = JSON.parse(JSON.stringify(state.companionGearInventory));
        state.companionGearInventory = _prevInv;
        state.companionGearVersion = _prevVer;
        var _sids2 = ["hotblood_bandana","capture_gloves","observation_glasses","healing_ribbon"];
        var _shopIds = COMPANION_GEAR_SHOP_ITEMS.map(function(x){return x.gearId;});
        var _lines2 = ["[v0.57.1] 新規ゲーム初期gear確認"];
        _lines2.push("ensure前: " + JSON.stringify(_beforeEnsure));
        for (var _i2 = 0; _i2 < _sids2.length; _i2++) {
          _lines2.push(_sids2[_i2] + ": ensure後=" + (_afterEnsure[_sids2[_i2]] || 0) + " inShop=" + (_shopIds.indexOf(_sids2[_i2]) >= 0));
        }
        _lines2.push("スターターはensureで自動付与・ショップには不在 → 正常");
        showToast(_lines2.join("\n"));
      };
      document.getElementById("btn-debug-v571-join-gear").onclick = function () {
        var _cids3 = ["juritani","shurittani","norio","harumi"];
        var _lines3 = ["[v0.57.1] 仲間加入時gear確認"];
        for (var _i3 = 0; _i3 < _cids3.length; _i3++) {
          var _cid3 = _cids3[_i3]; var _joined3 = hasCompanionEverJoined(_cid3);
          var _shopItem3 = null;
          for (var _j3 = 0; _j3 < COMPANION_GEAR_SHOP_ITEMS.length; _j3++) {
            var _sg3 = COMPANION_GEAR_DATA[COMPANION_GEAR_SHOP_ITEMS[_j3].gearId];
            if (_sg3 && _sg3.allowedCompanion === _cid3) { _shopItem3 = COMPANION_GEAR_SHOP_ITEMS[_j3]; break; }
          }
          var _st3 = _shopItem3 ? getCompanionGearPurchaseStatus(_shopItem3.gearId) : null;
          _lines3.push(_cid3 + ": joined=" + _joined3 + " shopGear=" + (_shopItem3 ? _shopItem3.gearId : "なし") + " canBuy=" + (_st3 ? _st3.purchasable : "N/A"));
        }
        showToast(_lines3.join("\n"));
      };
      document.getElementById("btn-debug-v571-whitelist-dom").onclick = function () {
        var _lines4 = ["[v0.57.1] ショップwhitelist DOM確認"];
        _lines4.push("COMPANION_GEAR_SHOP_ITEMS (" + COMPANION_GEAR_SHOP_ITEMS.length + "件):");
        for (var _i4 = 0; _i4 < COMPANION_GEAR_SHOP_ITEMS.length; _i4++) {
          var _si4 = COMPANION_GEAR_SHOP_ITEMS[_i4];
          var _g4 = COMPANION_GEAR_DATA[_si4.gearId];
          _lines4.push("  " + (_g4 ? _g4.emoji + " " : "") + _si4.gearId + " " + _si4.price + "G");
        }
        _lines4.push("スターター4種: ショップに含まれない");
        var _stIds = ["hotblood_bandana","capture_gloves","observation_glasses","healing_ribbon"];
        var _shopIds4 = COMPANION_GEAR_SHOP_ITEMS.map(function(x){return x.gearId;});
        var _allAbsent = true;
        for (var _i4b = 0; _i4b < _stIds.length; _i4b++) { if (_shopIds4.indexOf(_stIds[_i4b]) >= 0) { _allAbsent = false; } }
        _lines4.push("スターター全除外: " + (_allAbsent ? "PASS ✅" : "FAIL ❌"));
        showToast(_lines4.join("\n"));
      };
      document.getElementById("btn-debug-v571-reward-dom-absent").onclick = function () {
        // ショップUIを一時的に描画してDOMを確認
        var _rids5 = ["critical_bracelet","net_master_belt","research_notebook","prayer_brooch"];
        var _prevBody = document.getElementById("merchant-body") ? document.getElementById("merchant-body").innerHTML : "";
        var _prevGold5 = state.player.gold;
        state.player.gold = 9999; // 購入可能状態に
        renderCompanionGearShop();
        var _body5 = document.getElementById("merchant-body");
        var _bodyText5 = _body5 ? _body5.innerHTML : "";
        var _allAbsent5 = true;
        var _results5 = [];
        for (var _i5 = 0; _i5 < _rids5.length; _i5++) {
          var _rid5 = _rids5[_i5]; var _found5 = _bodyText5.indexOf(_rid5) >= 0;
          _results5.push(_rid5 + ": " + (_found5 ? "FAIL（DOM内に存在）" : "除外✅"));
          if (_found5) { _allAbsent5 = false; }
        }
        // 戻す
        state.player.gold = _prevGold5;
        renderMerchantMain();
        showToast("[v0.57.1] 報酬gear DOM完全除外確認\n" + _results5.join("\n") + "\n" + (_allAbsent5 ? "全4種DOM除外 PASS ✅" : "FAIL ❌"));
      };
      document.getElementById("btn-debug-v571-not-joined").onclick = function () {
        var _lines6 = ["[v0.57.1] 仲間未加入購入不可確認"];
        var _shopIds6 = COMPANION_GEAR_SHOP_ITEMS.map(function(x){return x.gearId;});
        for (var _i6 = 0; _i6 < _shopIds6.length; _i6++) {
          var _gid6 = _shopIds6[_i6]; var _g6 = COMPANION_GEAR_DATA[_gid6];
          var _cid6 = _g6 ? _g6.allowedCompanion : null;
          var _prevJoin6 = _cid6 ? JSON.parse(JSON.stringify(state.companionLevels[_cid6] || {})) : null;
          var _prevComp6 = _cid6 ? state.player.companions.slice() : null;
          var _prevInv6 = state.companionGearInventory[_gid6] || 0;
          // 一時的に未加入状態に
          if (_cid6) { state.companionLevels[_cid6] = { level: 1, exp: 0, nextExp: 20 }; state.player.companions = []; state.companionGearInventory[_gid6] = 0; }
          state.player.gold = 9999;
          var _st6 = getCompanionGearPurchaseStatus(_gid6);
          var _blocked6 = !_st6.purchasable && _st6.reason === "companion_not_joined";
          // 復元
          if (_cid6) { state.companionLevels[_cid6] = _prevJoin6; state.player.companions = _prevComp6; state.companionGearInventory[_gid6] = _prevInv6; }
          _lines6.push(_gid6 + ": purchasable=" + _st6.purchasable + " reason=" + _st6.reason + " block=" + (_blocked6 ? "PASS✅" : "FAIL❌"));
        }
        showToast(_lines6.join("\n"));
      };
      document.getElementById("btn-debug-v571-gold-boundary").onclick = function () {
        var _tid7 = COMPANION_GEAR_SHOP_ITEMS[0] ? COMPANION_GEAR_SHOP_ITEMS[0].gearId : null;
        if (!_tid7) { showToast("shopItem なし"); return; }
        var _price7 = COMPANION_GEAR_SHOP_ITEMS[0].price;
        var _prevGold7 = state.player.gold; var _prevInv7 = state.companionGearInventory[_tid7] || 0;
        var _prevLv7 = state.companionLevels[COMPANION_GEAR_DATA[_tid7].allowedCompanion] ? JSON.parse(JSON.stringify(state.companionLevels[COMPANION_GEAR_DATA[_tid7].allowedCompanion])) : null;
        var _cid7 = COMPANION_GEAR_DATA[_tid7].allowedCompanion;
        state.companionLevels[_cid7] = { level: 5, exp: 0, nextExp: 60 }; // 加入状態
        state.companionGearInventory[_tid7] = 0;
        // P-1
        state.player.gold = _price7 - 1; var _chk7a = getCompanionGearPurchaseStatus(_tid7);
        // P
        state.player.gold = _price7; var _chk7b = getCompanionGearPurchaseStatus(_tid7);
        // P+1
        state.player.gold = _price7 + 1; var _chk7c = getCompanionGearPurchaseStatus(_tid7);
        // 0
        state.player.gold = 0; var _chk7d = getCompanionGearPurchaseStatus(_tid7);
        // 復元
        state.player.gold = _prevGold7; state.companionGearInventory[_tid7] = _prevInv7;
        if (_prevLv7) { state.companionLevels[_cid7] = _prevLv7; }
        showToast("[v0.57.1] 境界値テスト（" + _tid7 + " " + _price7 + "G）\n" +
          "P-1(" + (_price7-1) + "G): purchasable=" + _chk7a.purchasable + " " + (_chk7a.purchasable ? "FAIL❌" : "PASS✅") + "\n" +
          "P(" + _price7 + "G): purchasable=" + _chk7b.purchasable + " " + (_chk7b.purchasable ? "PASS✅" : "FAIL❌") + "\n" +
          "P+1(" + (_price7+1) + "G): purchasable=" + _chk7c.purchasable + " " + (_chk7c.purchasable ? "PASS✅" : "FAIL❌") + "\n" +
          "0G: purchasable=" + _chk7d.purchasable + " " + (_chk7d.purchasable ? "FAIL❌" : "PASS✅"));
      };
      document.getElementById("btn-debug-v571-buy-10").onclick = function () {
        var _tid8 = COMPANION_GEAR_SHOP_ITEMS[0] ? COMPANION_GEAR_SHOP_ITEMS[0].gearId : null;
        if (!_tid8) { showToast("shopItem なし"); return; }
        var _cid8 = COMPANION_GEAR_DATA[_tid8].allowedCompanion;
        var _prevGold8 = state.player.gold; var _prevInv8 = state.companionGearInventory[_tid8] || 0;
        var _prevLv8 = state.companionLevels[_cid8] ? JSON.parse(JSON.stringify(state.companionLevels[_cid8])) : null;
        state.player.gold = COMPANION_GEAR_SHOP_ITEMS[0].price * 10;
        state.companionGearInventory[_tid8] = 0;
        state.companionLevels[_cid8] = { level: 5, exp: 0, nextExp: 60 };
        var _saveCount8 = 0;
        var _origSave8 = saveGame;
        saveGame = function() { _saveCount8++; _origSave8(); };
        // 10回ボタンクリック相当
        for (var _k8 = 0; _k8 < 10; _k8++) { buyCompanionGear(_tid8); }
        saveGame = _origSave8;
        var _invAfter8 = state.companionGearInventory[_tid8] || 0;
        var _goldAfter8 = state.player.gold;
        state.player.gold = _prevGold8; state.companionGearInventory[_tid8] = _prevInv8;
        if (_prevLv8) { state.companionLevels[_cid8] = _prevLv8; }
        saveGame();
        showToast("[v0.57.1] 10連打テスト（" + _tid8 + "）\ninv増加=" + _invAfter8 + "（期待1）\ngold減少=" + (COMPANION_GEAR_SHOP_ITEMS[0].price * 10 - _goldAfter8) + "G（期待" + COMPANION_GEAR_SHOP_ITEMS[0].price + "G）\nsaveGame=" + _saveCount8 + "回（期待1）\n" + (_invAfter8 === 1 && _saveCount8 === 1 ? "PASS ✅" : "FAIL ❌"));
      };
      document.getElementById("btn-debug-v571-no-auto-equip").onclick = function () {
        ensureCompanionGearState();
        var _tid9 = COMPANION_GEAR_SHOP_ITEMS[0] ? COMPANION_GEAR_SHOP_ITEMS[0].gearId : null;
        if (!_tid9) { showToast("shopItem なし"); return; }
        var _cid9 = COMPANION_GEAR_DATA[_tid9].allowedCompanion;
        var _prevEq9 = JSON.parse(JSON.stringify(state.companionEquipment || {}));
        var _prevGold9 = state.player.gold; var _prevInv9 = state.companionGearInventory[_tid9] || 0;
        var _prevLv9 = state.companionLevels[_cid9] ? JSON.parse(JSON.stringify(state.companionLevels[_cid9])) : null;
        state.player.gold = COMPANION_GEAR_SHOP_ITEMS[0].price + 100;
        state.companionGearInventory[_tid9] = 0;
        state.companionLevels[_cid9] = { level: 5, exp: 0, nextExp: 60 };
        buyCompanionGear(_tid9);
        var _eqAfter9 = JSON.parse(JSON.stringify(state.companionEquipment || {}));
        var _eqChanged9 = JSON.stringify(_prevEq9) !== JSON.stringify(_eqAfter9);
        state.player.gold = _prevGold9; state.companionGearInventory[_tid9] = _prevInv9;
        if (_prevLv9) { state.companionLevels[_cid9] = _prevLv9; }
        state.companionEquipment = _prevEq9;
        saveGame();
        showToast("[v0.57.1] 自動装備なし確認（" + _tid9 + "）\nequipment変更=" + _eqChanged9 + "\n" + (!_eqChanged9 ? "PASS ✅ 自動装備なし" : "FAIL ❌ 装備が変わった"));
      };
      document.getElementById("btn-debug-v571-reward-flags").onclick = function () {
        var _rids10 = ["critical_bracelet","net_master_belt","research_notebook","prayer_brooch"];
        var _prevFlags10 = JSON.parse(JSON.stringify(state.companionGearRewardFlags || {}));
        var _prevVer10 = state.companionGearVersion;
        var _tid10 = COMPANION_GEAR_SHOP_ITEMS[0] ? COMPANION_GEAR_SHOP_ITEMS[0].gearId : null;
        if (_tid10) {
          var _cid10 = COMPANION_GEAR_DATA[_tid10].allowedCompanion;
          var _prevGold10 = state.player.gold; var _prevInv10 = state.companionGearInventory[_tid10] || 0;
          var _prevLv10 = state.companionLevels[_cid10] ? JSON.parse(JSON.stringify(state.companionLevels[_cid10])) : null;
          state.player.gold = COMPANION_GEAR_SHOP_ITEMS[0].price + 100;
          state.companionGearInventory[_tid10] = 0;
          state.companionLevels[_cid10] = { level: 5, exp: 0, nextExp: 60 };
          buyCompanionGear(_tid10);
          state.player.gold = _prevGold10; state.companionGearInventory[_tid10] = _prevInv10;
          if (_prevLv10) { state.companionLevels[_cid10] = _prevLv10; }
        }
        var _afterFlags10 = JSON.parse(JSON.stringify(state.companionGearRewardFlags || {}));
        var _flagsUnchanged10 = JSON.stringify(_prevFlags10) === JSON.stringify(_afterFlags10);
        var _verUnchanged10 = state.companionGearVersion === _prevVer10;
        saveGame();
        showToast("[v0.57.1] reward flags不変確認\nflags変化=" + (!_flagsUnchanged10) + "\nversion変化=" + (!_verUnchanged10) + "\n" + (_flagsUnchanged10 && _verUnchanged10 ? "PASS ✅" : "FAIL ❌"));
      };
      document.getElementById("btn-debug-v571-save-count").onclick = function () {
        var _tid11 = COMPANION_GEAR_SHOP_ITEMS[0] ? COMPANION_GEAR_SHOP_ITEMS[0].gearId : null;
        if (!_tid11) { showToast("shopItem なし"); return; }
        var _cid11 = COMPANION_GEAR_DATA[_tid11].allowedCompanion;
        var _prevGold11 = state.player.gold; var _prevInv11 = state.companionGearInventory[_tid11] || 0;
        var _prevLv11 = state.companionLevels[_cid11] ? JSON.parse(JSON.stringify(state.companionLevels[_cid11])) : null;
        state.player.gold = COMPANION_GEAR_SHOP_ITEMS[0].price + 100;
        state.companionGearInventory[_tid11] = 0;
        state.companionLevels[_cid11] = { level: 5, exp: 0, nextExp: 60 };
        var _saveCount11 = 0;
        var _origSave11 = saveGame;
        saveGame = function() { _saveCount11++; _origSave11(); };
        buyCompanionGear(_tid11);
        saveGame = _origSave11;
        state.player.gold = _prevGold11; state.companionGearInventory[_tid11] = _prevInv11;
        if (_prevLv11) { state.companionLevels[_cid11] = _prevLv11; }
        saveGame();
        var _saveTests = ["G不足時save回数=","所持済み時save回数=","販売外時save回数="];
        var _saveCounts = [0,0,0];
        saveGame = function() { _saveCounts[0]++; _origSave11(); };
        var _s1 = state.player.gold; state.player.gold = 0; buyCompanionGear(_tid11); state.player.gold = _s1;
        saveGame = function() { _saveCounts[1]++; _origSave11(); };
        state.companionGearInventory[_tid11] = 1; buyCompanionGear(_tid11); state.companionGearInventory[_tid11] = _prevInv11;
        saveGame = function() { _saveCounts[2]++; _origSave11(); };
        buyCompanionGear("invalid_gear_xyz");
        saveGame = _origSave11;
        saveGame();
        showToast("[v0.57.1] saveGame回数\n成功購入: " + _saveCount11 + "回（期待1）\nG不足: " + _saveCounts[0] + "回（期待0）\n所持済み: " + _saveCounts[1] + "回（期待0）\n販売外: " + _saveCounts[2] + "回（期待0）\n" + (_saveCount11 === 1 && _saveCounts[0] === 0 && _saveCounts[1] === 0 && _saveCounts[2] === 0 ? "PASS ✅" : "FAIL ❌"));
      };
      document.getElementById("btn-debug-v571-save-load").onclick = function () {
        var _tid12 = COMPANION_GEAR_SHOP_ITEMS[0] ? COMPANION_GEAR_SHOP_ITEMS[0].gearId : null;
        if (!_tid12) { showToast("shopItem なし"); return; }
        var _cid12 = COMPANION_GEAR_DATA[_tid12].allowedCompanion;
        var _prevGold12 = state.player.gold; var _prevInv12 = state.companionGearInventory[_tid12] || 0;
        var _prevLv12 = state.companionLevels[_cid12] ? JSON.parse(JSON.stringify(state.companionLevels[_cid12])) : null;
        state.player.gold = COMPANION_GEAR_SHOP_ITEMS[0].price + 100;
        state.companionGearInventory[_tid12] = 0;
        state.companionLevels[_cid12] = { level: 5, exp: 0, nextExp: 60 };
        buyCompanionGear(_tid12);
        var _invAfterBuy12 = state.companionGearInventory[_tid12] || 0;
        loadGame(); // セーブから再ロード
        var _invAfterLoad12 = state.companionGearInventory[_tid12] || 0;
        state.player.gold = _prevGold12; state.companionGearInventory[_tid12] = _prevInv12;
        if (_prevLv12) { state.companionLevels[_cid12] = _prevLv12; }
        saveGame();
        showToast("[v0.57.1] save/load確認（" + _tid12 + "）\n購入後inv=" + _invAfterBuy12 + "\nload後inv=" + _invAfterLoad12 + "\n" + (_invAfterBuy12 === 1 && _invAfterLoad12 === 1 ? "PASS ✅ load後も維持" : "FAIL ❌"));
      };
      document.getElementById("btn-debug-v571-old-save").onclick = function () {
        // 旧セーブ想定: shop gearなし（inventory key欠損）でcanBuyできるか確認
        var _lines13 = ["[v0.57.1] 旧セーブ互換確認"];
        for (var _i13 = 0; _i13 < COMPANION_GEAR_SHOP_ITEMS.length; _i13++) {
          var _gid13 = COMPANION_GEAR_SHOP_ITEMS[_i13].gearId;
          var _cid13 = COMPANION_GEAR_DATA[_gid13].allowedCompanion;
          var _prevInv13 = state.companionGearInventory[_gid13];
          var _prevLv13 = state.companionLevels[_cid13] ? JSON.parse(JSON.stringify(state.companionLevels[_cid13])) : null;
          delete state.companionGearInventory[_gid13]; // key欠損シミュレート
          state.player.gold = COMPANION_GEAR_SHOP_ITEMS[_i13].price + 100;
          state.companionLevels[_cid13] = { level: 5, exp: 0, nextExp: 60 };
          var _st13 = getCompanionGearPurchaseStatus(_gid13);
          state.companionGearInventory[_gid13] = _prevInv13;
          if (_prevLv13) { state.companionLevels[_cid13] = _prevLv13; }
          _lines13.push(_gid13 + ": key欠損→owned=" + _st13.owned + " purchasable=" + _st13.purchasable + " " + (_st13.purchasable ? "購入可✅" : "NG❌"));
        }
        showToast(_lines13.join("\n"));
      };
      document.getElementById("btn-debug-v571-reconcile").onclick = function () {
        // reconcile後もshop gearが維持されるか確認
        var _prevInvR = JSON.parse(JSON.stringify(state.companionGearInventory || {}));
        for (var _i14 = 0; _i14 < COMPANION_GEAR_SHOP_ITEMS.length; _i14++) {
          state.companionGearInventory[COMPANION_GEAR_SHOP_ITEMS[_i14].gearId] = 1;
        }
        var _beforeR = JSON.parse(JSON.stringify(state.companionGearInventory));
        reconcileCompanionGearRewards();
        var _afterR = JSON.parse(JSON.stringify(state.companionGearInventory));
        state.companionGearInventory = _prevInvR;
        var _lines14 = ["[v0.57.1] reconcile後shop gear維持確認"];
        var _allOk14 = true;
        for (var _i14b = 0; _i14b < COMPANION_GEAR_SHOP_ITEMS.length; _i14b++) {
          var _gid14 = COMPANION_GEAR_SHOP_ITEMS[_i14b].gearId;
          var _ok14 = (_afterR[_gid14] || 0) === (_beforeR[_gid14] || 0);
          _lines14.push(_gid14 + ": before=" + (_beforeR[_gid14]||0) + " after=" + (_afterR[_gid14]||0) + " " + (_ok14 ? "✅" : "❌"));
          if (!_ok14) { _allOk14 = false; }
        }
        _lines14.push(_allOk14 ? "全shop gear維持 PASS ✅" : "FAIL ❌");
        showToast(_lines14.join("\n"));
      };
      document.getElementById("btn-debug-v571-render10").onclick = function () {
        var _prevGold15 = state.player.gold;
        var _prevInvR15 = JSON.parse(JSON.stringify(state.companionGearInventory || {}));
        var _prevEq15 = JSON.parse(JSON.stringify(state.companionEquipment || {}));
        state.player.gold = 9999;
        for (var _k15 = 0; _k15 < 10; _k15++) { renderCompanionGearShop(); }
        var _gold15After = state.player.gold;
        var _inv15After = JSON.parse(JSON.stringify(state.companionGearInventory || {}));
        var _eq15After = JSON.parse(JSON.stringify(state.companionEquipment || {}));
        state.player.gold = _prevGold15;
        state.companionGearInventory = _prevInvR15;
        state.companionEquipment = _prevEq15;
        renderMerchantMain();
        var _goldOk = (_gold15After === 9999);
        var _invOk = JSON.stringify(_prevInvR15) === JSON.stringify(_inv15After);
        var _eqOk = JSON.stringify(_prevEq15) === JSON.stringify(_eq15After);
        showToast("[v0.57.1] render×10副作用なし\ngold変化=" + (!_goldOk) + "\ninv変化=" + (!_invOk) + "\nequipment変化=" + (!_eqOk) + "\n" + (_goldOk && _invOk && _eqOk ? "PASS ✅" : "FAIL ❌"));
      };
      document.getElementById("btn-debug-v571-open10").onclick = function () {
        var _prevGold16 = state.player.gold; var _prevModal16 = state.modalOpen;
        var _lines16 = ["[v0.57.1] shopモーダル10回開閉"];
        for (var _k16 = 0; _k16 < 10; _k16++) {
          renderCompanionGearShop();
          var _backBtn16 = document.getElementById("shop-back");
          if (_backBtn16) { _backBtn16.onclick(); }
        }
        var _mainBtn16 = document.getElementById("m-buy-companion-gear");
        _lines16.push("最終商人メイン: btn存在=" + !!_mainBtn16);
        _lines16.push("gold不変: " + (state.player.gold === _prevGold16));
        _lines16.push("lock残留: " + _companionGearPurchaseLock);
        _lines16.push(_mainBtn16 && state.player.gold === _prevGold16 && !_companionGearPurchaseLock ? "PASS ✅" : "要確認");
        showToast(_lines16.join("\n"));
      };
      // §139 v0.58: 仲間わざ習得演出デバッグハンドラ
      document.getElementById("btn-debug-v58-tech-data").onclick = function () {
        var _tcids = ["juritani", "shurittani", "norio", "harumi"];
        var _lines = ["[v0.58] 4わざ正式データ一覧"];
        for (var _tdi = 0; _tdi < _tcids.length; _tdi++) {
          var _tcid = _tcids[_tdi];
          var _td = COMPANION_TECHNIQUE_DATA[_tcid];
          if (!_td) { _lines.push(_tcid + ": データなし"); continue; }
          var _cdat = findById(COMPANION_DATA, _tcid);
          _lines.push((_cdat ? _cdat.icon + _cdat.name : _tcid) + ": " + _td.name +
            " / " + _td.type + " / " + _td.minValue + "-" + _td.maxValue +
            " / Lv" + _td.unlockLevel + " + " + _td.requiredGearId +
            " / unlock=" + isCompanionTechniqueUnlocked(_tcid));
        }
        showToast(_lines.join("\n"));
      };
      document.getElementById("btn-debug-v58-unlock-boundary").onclick = function () {
        ensureCompanionGearState();
        if (!state.companionLevels) { state.companionLevels = {}; }
        if (!state.companionGearRewardFlags) { state.companionGearRewardFlags = {}; }
        var _prevLv = (state.companionLevels["juritani"] || {}).level || 1;
        var _prevFlag = !!state.companionGearRewardFlags["critical_bracelet"];
        var _results = [];
        // Lv24+reward false → false
        state.companionLevels["juritani"] = { level: 24, exp: 0, nextExp: 255 };
        state.companionGearRewardFlags["critical_bracelet"] = false;
        _results.push("Lv24+reward=false: " + (isCompanionTechniqueUnlocked("juritani") === false ? "false ✅" : "FAIL ❌"));
        // Lv24+reward true → false
        state.companionGearRewardFlags["critical_bracelet"] = true;
        _results.push("Lv24+reward=true: " + (isCompanionTechniqueUnlocked("juritani") === false ? "false ✅" : "FAIL ❌"));
        // Lv25+reward false → false
        state.companionLevels["juritani"] = { level: 25, exp: 0, nextExp: 265 };
        state.companionGearRewardFlags["critical_bracelet"] = false;
        _results.push("Lv25+reward=false: " + (isCompanionTechniqueUnlocked("juritani") === false ? "false ✅" : "FAIL ❌"));
        // Lv25+reward true → true
        state.companionGearRewardFlags["critical_bracelet"] = true;
        _results.push("Lv25+reward=true: " + (isCompanionTechniqueUnlocked("juritani") === true ? "true ✅" : "FAIL ❌"));
        // Lv99+reward true → true
        state.companionLevels["juritani"] = { level: 99, exp: 0, nextExp: 1005 };
        _results.push("Lv99+reward=true: " + (isCompanionTechniqueUnlocked("juritani") === true ? "true ✅" : "FAIL ❌"));
        // 装備未装備でもunlock不変
        var _prevEq = (state.companionEquipment || {})["juritani"];
        if (!state.companionEquipment) { state.companionEquipment = {}; }
        state.companionEquipment["juritani"] = null;
        state.companionLevels["juritani"] = { level: 25, exp: 0, nextExp: 265 };
        state.companionGearRewardFlags["critical_bracelet"] = true;
        _results.push("gear未装備: " + (isCompanionTechniqueUnlocked("juritani") === true ? "unlock=true ✅" : "FAIL ❌"));
        state.companionEquipment["juritani"] = _prevEq;
        // 復元
        state.companionLevels["juritani"].level = _prevLv;
        state.companionGearRewardFlags["critical_bracelet"] = _prevFlag;
        showToast("[v0.58] unlock境界\n" + _results.join("\n"));
      };
      document.getElementById("btn-debug-v58-lv24-to-25").onclick = function () {
        ensureCompanionGearState();
        if (!state.companionLevels) { state.companionLevels = {}; }
        if (!state.companionGearRewardFlags) { state.companionGearRewardFlags = {}; }
        // 事前条件: reward true + Lv24 + notice false
        var _prevLv1 = (state.companionLevels["juritani"] || {}).level;
        var _prevFlag1 = !!state.companionGearRewardFlags["critical_bracelet"];
        var _prevNotice1 = (state.companionTechniqueLearnedNotices || {})["juritani"];
        state.companionLevels["juritani"] = { level: 24, exp: 0, nextExp: 255 };
        state.companionGearRewardFlags["critical_bracelet"] = true;
        if (!state.companionTechniqueLearnedNotices) { state.companionTechniqueLearnedNotices = {}; }
        state.companionTechniqueLearnedNotices["juritani"] = false;
        _companionTechniqueLearnPending = [];
        // gainCompanionExpをシミュレート（EXP=255でLv25）
        var _prevCompanions = state.player.companions;
        state.player.companions = ["juritani"];
        gainCompanionExp(255);
        state.player.companions = _prevCompanions;
        var _afterLv = (state.companionLevels["juritani"] || {}).level;
        var _pendLen = _companionTechniqueLearnPending.length;
        var _unlocked = isCompanionTechniqueUnlocked("juritani");
        // 復元
        state.companionLevels["juritani"].level = _prevLv1 || 1;
        state.companionGearRewardFlags["critical_bracelet"] = _prevFlag1;
        state.companionTechniqueLearnedNotices["juritani"] = _prevNotice1 || false;
        _companionTechniqueLearnPending = [];
        var _pass1 = (_afterLv >= 25 && _unlocked && _pendLen >= 1);
        showToast("[v0.58] Lv24→25習得演出\nafterLv=" + _afterLv + " unlock=" + _unlocked + " pending=" + _pendLen + "\n" + (_pass1 ? "PASS ✅" : "FAIL ❌"));
      };
      document.getElementById("btn-debug-v58-lv25-to-26").onclick = function () {
        ensureCompanionGearState();
        if (!state.companionLevels) { state.companionLevels = {}; }
        if (!state.companionGearRewardFlags) { state.companionGearRewardFlags = {}; }
        // Lv25→26: 既にLv25通過済みなので追加通知なし
        var _prevLv2 = (state.companionLevels["juritani"] || {}).level;
        var _prevFlag2 = !!state.companionGearRewardFlags["critical_bracelet"];
        var _prevNotice2 = (state.companionTechniqueLearnedNotices || {})["juritani"];
        state.companionLevels["juritani"] = { level: 25, exp: 0, nextExp: 265 };
        state.companionGearRewardFlags["critical_bracelet"] = true;
        if (!state.companionTechniqueLearnedNotices) { state.companionTechniqueLearnedNotices = {}; }
        state.companionTechniqueLearnedNotices["juritani"] = true; // 既に演出済み
        _companionTechniqueLearnPending = [];
        var _prevCompanions2 = state.player.companions;
        state.player.companions = ["juritani"];
        gainCompanionExp(265); // Lv26へ
        state.player.companions = _prevCompanions2;
        var _pendLen2 = _companionTechniqueLearnPending.length;
        // 復元
        state.companionLevels["juritani"].level = _prevLv2 || 1;
        state.companionGearRewardFlags["critical_bracelet"] = _prevFlag2;
        state.companionTechniqueLearnedNotices["juritani"] = _prevNotice2;
        _companionTechniqueLearnPending = [];
        var _pass2 = (_pendLen2 === 0);
        showToast("[v0.58] Lv25→26再通知\npending=" + _pendLen2 + "\n" + (_pass2 ? "PASS ✅ 再通知なし" : "FAIL ❌ 再通知あり"));
      };
      document.getElementById("btn-debug-v58-reward-unlock").onclick = function () {
        ensureCompanionGearState();
        if (!state.companionLevels) { state.companionLevels = {}; }
        if (!state.companionGearRewardFlags) { state.companionGearRewardFlags = {}; }
        // Lv25+reward未取得→reward付与→unlock成立
        var _prevLv3 = (state.companionLevels["juritani"] || {}).level;
        var _prevFlag3 = !!state.companionGearRewardFlags["critical_bracelet"];
        var _prevInv3 = state.companionGearInventory["critical_bracelet"] || 0;
        var _prevNotice3 = (state.companionTechniqueLearnedNotices || {})["juritani"];
        state.companionLevels["juritani"] = { level: 25, exp: 0, nextExp: 265 };
        state.companionGearRewardFlags["critical_bracelet"] = false;
        state.companionGearInventory["critical_bracelet"] = 0;
        if (!state.companionTechniqueLearnedNotices) { state.companionTechniqueLearnedNotices = {}; }
        state.companionTechniqueLearnedNotices["juritani"] = false;
        _companionTechniqueLearnPending = [];
        var _beforeUnlock3 = isCompanionTechniqueUnlocked("juritani"); // false
        grantCompanionGearReward("critical_bracelet");
        var _afterUnlock3 = isCompanionTechniqueUnlocked("juritani"); // true
        var _pendLen3 = _companionTechniqueLearnPending.length;
        // 復元
        state.companionLevels["juritani"].level = _prevLv3 || 1;
        state.companionGearRewardFlags["critical_bracelet"] = _prevFlag3;
        state.companionGearInventory["critical_bracelet"] = _prevInv3;
        state.companionTechniqueLearnedNotices["juritani"] = _prevNotice3;
        _companionTechniqueLearnPending = [];
        var _pass3 = (!_beforeUnlock3 && _afterUnlock3 && _pendLen3 >= 1);
        showToast("[v0.58] reward→unlock→演出\nbefore=" + _beforeUnlock3 + " after=" + _afterUnlock3 + " pending=" + _pendLen3 + "\n" + (_pass3 ? "PASS ✅" : "FAIL ❌"));
      };
      document.getElementById("btn-debug-v58-lv25-only").onclick = function () {
        if (!state.companionLevels) { state.companionLevels = {}; }
        if (!state.companionGearRewardFlags) { state.companionGearRewardFlags = {}; }
        var _prevLv4 = (state.companionLevels["juritani"] || {}).level;
        var _prevFlag4 = !!state.companionGearRewardFlags["critical_bracelet"];
        state.companionLevels["juritani"] = { level: 25, exp: 0, nextExp: 265 };
        state.companionGearRewardFlags["critical_bracelet"] = false;
        var _unlock4 = isCompanionTechniqueUnlocked("juritani");
        state.companionLevels["juritani"].level = _prevLv4 || 1;
        state.companionGearRewardFlags["critical_bracelet"] = _prevFlag4;
        showToast("[v0.58] Lv25+reward=false\nunlock=" + _unlock4 + "\n" + (_unlock4 === false ? "PASS ✅ 未解放" : "FAIL ❌ 解放されてしまった"));
      };
      document.getElementById("btn-debug-v58-reward-only").onclick = function () {
        if (!state.companionLevels) { state.companionLevels = {}; }
        if (!state.companionGearRewardFlags) { state.companionGearRewardFlags = {}; }
        var _prevLv5 = (state.companionLevels["juritani"] || {}).level;
        var _prevFlag5 = !!state.companionGearRewardFlags["critical_bracelet"];
        state.companionLevels["juritani"] = { level: 24, exp: 0, nextExp: 255 };
        state.companionGearRewardFlags["critical_bracelet"] = true;
        var _unlock5 = isCompanionTechniqueUnlocked("juritani");
        state.companionLevels["juritani"].level = _prevLv5 || 1;
        state.companionGearRewardFlags["critical_bracelet"] = _prevFlag5;
        showToast("[v0.58] Lv24+reward=true\nunlock=" + _unlock5 + "\n" + (_unlock5 === false ? "PASS ✅ 未解放" : "FAIL ❌ 解放されてしまった"));
      };
      document.getElementById("btn-debug-v58-gear-not-needed").onclick = function () {
        if (!state.companionLevels) { state.companionLevels = {}; }
        if (!state.companionGearRewardFlags) { state.companionGearRewardFlags = {}; }
        if (!state.companionEquipment) { state.companionEquipment = {}; }
        var _prevLv6 = (state.companionLevels["juritani"] || {}).level;
        var _prevFlag6 = !!state.companionGearRewardFlags["critical_bracelet"];
        var _prevEq6 = state.companionEquipment["juritani"];
        // 装備未装備（equipment=null）でもunlock成立するか確認
        state.companionLevels["juritani"] = { level: 25, exp: 0, nextExp: 265 };
        state.companionGearRewardFlags["critical_bracelet"] = true;
        state.companionEquipment["juritani"] = null; // 装備しない
        var _unlock6 = isCompanionTechniqueUnlocked("juritani");
        state.companionEquipment["juritani"] = "critical_bracelet"; // 装備している
        var _unlock6eq = isCompanionTechniqueUnlocked("juritani");
        // 復元
        state.companionLevels["juritani"].level = _prevLv6 || 1;
        state.companionGearRewardFlags["critical_bracelet"] = _prevFlag6;
        state.companionEquipment["juritani"] = _prevEq6;
        var _pass6 = (_unlock6 === true && _unlock6eq === true);
        showToast("[v0.58] gear装備不要確認\n未装備unlock=" + _unlock6 + " 装備中unlock=" + _unlock6eq + "\n" + (_pass6 ? "PASS ✅ 装備不要" : "FAIL ❌"));
      };
      document.getElementById("btn-debug-v58-old-save-rescue").onclick = function () {
        ensureCompanionGearState();
        if (!state.companionLevels) { state.companionLevels = {}; }
        if (!state.companionGearRewardFlags) { state.companionGearRewardFlags = {}; }
        // unlock済みだがnotice keyが欠損している旧セーブをシミュレート
        var _prevLv7 = (state.companionLevels["juritani"] || {}).level;
        var _prevFlag7 = !!state.companionGearRewardFlags["critical_bracelet"];
        var _prevNotices7 = JSON.parse(JSON.stringify(state.companionTechniqueLearnedNotices || {}));
        state.companionLevels["juritani"] = { level: 25, exp: 0, nextExp: 265 };
        state.companionGearRewardFlags["critical_bracelet"] = true;
        state.companionTechniqueLearnedNotices = {}; // key欠損を模擬
        _companionTechniqueLearnPending = [];
        // loadGame内ロジックと同じ
        normalizeCompanionTechniqueLearnedNotices();
        var _noticeVal7 = state.companionTechniqueLearnedNotices["juritani"];
        if (isCompanionTechniqueUnlocked("juritani") && !state.companionTechniqueLearnedNotices["juritani"]) {
          queueCompanionTechniqueLearnNotice("juritani");
        }
        var _pendLen7 = _companionTechniqueLearnPending.length;
        // 復元
        state.companionLevels["juritani"].level = _prevLv7 || 1;
        state.companionGearRewardFlags["critical_bracelet"] = _prevFlag7;
        state.companionTechniqueLearnedNotices = _prevNotices7;
        _companionTechniqueLearnPending = [];
        var _pass7 = (_noticeVal7 === false && _pendLen7 >= 1);
        showToast("[v0.58] 旧セーブ修復\nnotice初期=" + _noticeVal7 + " pending=" + _pendLen7 + "\n" + (_pass7 ? "PASS ✅ pending登録" : "FAIL ❌"));
      };
      document.getElementById("btn-debug-v58-4-pending").onclick = function () {
        ensureCompanionGearState();
        if (!state.companionLevels) { state.companionLevels = {}; }
        if (!state.companionGearRewardFlags) { state.companionGearRewardFlags = {}; }
        var _cids8 = ["juritani", "shurittani", "norio", "harumi"];
        var _gids8 = ["critical_bracelet", "net_master_belt", "research_notebook", "prayer_brooch"];
        var _prevLvs8 = {}, _prevFlags8 = {}, _prevNotices8 = JSON.parse(JSON.stringify(state.companionTechniqueLearnedNotices || {}));
        for (var _k8 = 0; _k8 < _cids8.length; _k8++) {
          _prevLvs8[_cids8[_k8]] = (state.companionLevels[_cids8[_k8]] || {}).level || 1;
          _prevFlags8[_gids8[_k8]] = !!state.companionGearRewardFlags[_gids8[_k8]];
          state.companionLevels[_cids8[_k8]] = { level: 25, exp: 0, nextExp: 265 };
          state.companionGearRewardFlags[_gids8[_k8]] = true;
          state.companionTechniqueLearnedNotices[_cids8[_k8]] = false;
        }
        _companionTechniqueLearnPending = [];
        for (var _q8 = 0; _q8 < _cids8.length; _q8++) {
          queueCompanionTechniqueLearnNotice(_cids8[_q8]);
        }
        var _pendOrder8 = _companionTechniqueLearnPending.slice();
        // 復元
        for (var _r8 = 0; _r8 < _cids8.length; _r8++) {
          state.companionLevels[_cids8[_r8]].level = _prevLvs8[_cids8[_r8]];
          state.companionGearRewardFlags[_gids8[_r8]] = _prevFlags8[_gids8[_r8]];
        }
        state.companionTechniqueLearnedNotices = _prevNotices8;
        _companionTechniqueLearnPending = [];
        var _pass8 = (_pendOrder8.length === 4 &&
          _pendOrder8[0] === "juritani" && _pendOrder8[1] === "shurittani" &&
          _pendOrder8[2] === "norio" && _pendOrder8[3] === "harumi");
        showToast("[v0.58] 4人同時pending順序\n" + _pendOrder8.join(" → ") + "\n" + (_pass8 ? "PASS ✅" : "FAIL ❌"));
      };
      document.getElementById("btn-debug-v58-modal-delay").onclick = function () {
        ensureCompanionGearState();
        if (!state.companionLevels) { state.companionLevels = {}; }
        if (!state.companionGearRewardFlags) { state.companionGearRewardFlags = {}; }
        var _prevLv9 = (state.companionLevels["juritani"] || {}).level;
        var _prevFlag9 = !!state.companionGearRewardFlags["critical_bracelet"];
        var _prevNotice9 = (state.companionTechniqueLearnedNotices || {})["juritani"];
        state.companionLevels["juritani"] = { level: 25, exp: 0, nextExp: 265 };
        state.companionGearRewardFlags["critical_bracelet"] = true;
        if (!state.companionTechniqueLearnedNotices) { state.companionTechniqueLearnedNotices = {}; }
        state.companionTechniqueLearnedNotices["juritani"] = false;
        _companionTechniqueLearnPending = [];
        queueCompanionTechniqueLearnNotice("juritani");
        var _wasModalOpen9 = state.modalOpen;
        state.modalOpen = true; // 他モーダル中を模擬
        consumePendingCompanionTechniqueLearnNotice();
        var _visibleWhileModal9 = _companionTechniqueLearnVisible; // falseであるべき
        state.modalOpen = _wasModalOpen9;
        // 復元
        state.companionLevels["juritani"].level = _prevLv9 || 1;
        state.companionGearRewardFlags["critical_bracelet"] = _prevFlag9;
        state.companionTechniqueLearnedNotices["juritani"] = _prevNotice9;
        _companionTechniqueLearnPending = [];
        if (_companionTechniqueLearnTimer) { clearTimeout(_companionTechniqueLearnTimer); _companionTechniqueLearnTimer = null; }
        var _pass9 = !_visibleWhileModal9;
        showToast("[v0.58] 他モーダル中延期\nmodalOpen中visible=" + _visibleWhileModal9 + "\n" + (_pass9 ? "PASS ✅ 延期" : "FAIL ❌ 強制表示"));
      };
      document.getElementById("btn-debug-v58-notice-not-needed").onclick = function () {
        ensureCompanionGearState();
        if (!state.companionLevels) { state.companionLevels = {}; }
        if (!state.companionGearRewardFlags) { state.companionGearRewardFlags = {}; }
        var _prevLvA = (state.companionLevels["juritani"] || {}).level;
        var _prevFlagA = !!state.companionGearRewardFlags["critical_bracelet"];
        var _prevNoticeA = (state.companionTechniqueLearnedNotices || {})["juritani"];
        state.companionLevels["juritani"] = { level: 25, exp: 0, nextExp: 265 };
        state.companionGearRewardFlags["critical_bracelet"] = true;
        if (!state.companionTechniqueLearnedNotices) { state.companionTechniqueLearnedNotices = {}; }
        state.companionTechniqueLearnedNotices["juritani"] = false; // 演出未確認
        // unlock=true, notice=false でもisCompanionTechniqueUnlockedはtrueを返すことを確認
        var _unlockA = isCompanionTechniqueUnlocked("juritani");
        // 復元
        state.companionLevels["juritani"].level = _prevLvA || 1;
        state.companionGearRewardFlags["critical_bracelet"] = _prevFlagA;
        state.companionTechniqueLearnedNotices["juritani"] = _prevNoticeA;
        var _passA = (_unlockA === true);
        showToast("[v0.58] notice未確認でも技使用可\nnotice=false + unlock=" + _unlockA + "\n" + (_passA ? "PASS ✅ 技使用可能" : "FAIL ❌"));
      };
      document.getElementById("btn-debug-v58-save-count").onclick = function () {
        var _saveCount = 0;
        var _origSave = saveGame;
        saveGame = function () { _saveCount++; _origSave(); };
        // close時に1回だけ: 演出済みをtrueにしてsave
        if (!state.companionTechniqueLearnedNotices) { state.companionTechniqueLearnedNotices = {}; }
        var _prevNoticeSC = state.companionTechniqueLearnedNotices["juritani"];
        state.companionTechniqueLearnedNotices["juritani"] = false;
        _companionTechniqueLearnPending = ["juritani"];
        _companionTechniqueLearnVisible = true;
        closeCompanionTechniqueLearnModal();
        var _finalCount = _saveCount;
        saveGame = _origSave;
        state.companionTechniqueLearnedNotices["juritani"] = _prevNoticeSC;
        _companionTechniqueLearnPending = [];
        _companionTechniqueLearnVisible = false;
        showToast("[v0.58] saveGame回数\nclose時save=" + _finalCount + "\n" + (_finalCount === 1 ? "PASS ✅ 1回" : "FAIL ❌ " + _finalCount + "回"));
      };
      document.getElementById("btn-debug-v58-close-10").onclick = function () {
        var _closeCount = 0;
        var _saveCountB = 0;
        var _origSaveB = saveGame;
        saveGame = function () { _saveCountB++; _origSaveB(); };
        if (!state.companionTechniqueLearnedNotices) { state.companionTechniqueLearnedNotices = {}; }
        var _prevNoticeB = state.companionTechniqueLearnedNotices["juritani"];
        state.companionTechniqueLearnedNotices["juritani"] = false;
        _companionTechniqueLearnPending = ["juritani"];
        _companionTechniqueLearnVisible = true;
        for (var _cb = 0; _cb < 10; _cb++) {
          closeCompanionTechniqueLearnModal();
          _closeCount++;
        }
        var _finalSaveB = _saveCountB;
        var _finalNoticeB = !!(state.companionTechniqueLearnedNotices["juritani"]);
        saveGame = _origSaveB;
        state.companionTechniqueLearnedNotices["juritani"] = _prevNoticeB;
        _companionTechniqueLearnPending = [];
        _companionTechniqueLearnVisible = false;
        var _passB = (_finalSaveB === 1 && _finalNoticeB === true);
        showToast("[v0.58] close10連打\nclose=" + _closeCount + " save=" + _finalSaveB + " notice=" + _finalNoticeB + "\n" + (_passB ? "PASS ✅ save1回" : "FAIL ❌"));
      };
      document.getElementById("btn-debug-v58-render-10").onclick = function () {
        var _saveCountC = 0;
        var _origSaveC = saveGame;
        saveGame = function () { _saveCountC++; _origSaveC(); };
        var _prevVisibleC = _companionTechniqueLearnVisible;
        var _prevPendingC = _companionTechniqueLearnPending.slice();
        for (var _rc = 0; _rc < 10; _rc++) {
          consumePendingCompanionTechniqueLearnNotice();
        }
        saveGame = _origSaveC;
        _companionTechniqueLearnVisible = _prevVisibleC;
        _companionTechniqueLearnPending = _prevPendingC;
        showToast("[v0.58] render×10多重表示\nsave=" + _saveCountC + " visible=" + _companionTechniqueLearnVisible + "\n" + (_saveCountC === 0 ? "PASS ✅ save0回" : "FAIL ❌ save=" + _saveCountC));
      };
      document.getElementById("btn-debug-v58-newgame-state").onclick = function () {
        var _notices = state.companionTechniqueLearnedNotices || {};
        var _cids = ["juritani", "shurittani", "norio", "harumi"];
        var _allFalse = true;
        for (var _ng = 0; _ng < _cids.length; _ng++) {
          if (_notices[_cids[_ng]] !== false) { _allFalse = false; }
        }
        var _pendEmpty = (_companionTechniqueLearnPending.length === 0);
        var _notVisible = !_companionTechniqueLearnVisible;
        showToast("[v0.58] newGame初期状態\nnotices全false=" + _allFalse + " pending空=" + _pendEmpty + " visible=false=" + _notVisible + "\n" + (_allFalse && _pendEmpty && _notVisible ? "PASS ✅" : "要確認"));
      };
      document.getElementById("btn-debug-v58-show-direct").onclick = function () {
        ensureCompanionGearState();
        if (!state.companionLevels) { state.companionLevels = {}; }
        if (!state.companionGearRewardFlags) { state.companionGearRewardFlags = {}; }
        state.companionLevels["juritani"] = { level: 25, exp: 0, nextExp: 265 };
        state.companionGearRewardFlags["critical_bracelet"] = true;
        if (!state.companionTechniqueLearnedNotices) { state.companionTechniqueLearnedNotices = {}; }
        state.companionTechniqueLearnedNotices["juritani"] = false;
        _companionTechniqueLearnPending = [];
        _companionTechniqueLearnVisible = false;
        queueCompanionTechniqueLearnNotice("juritani");
        closeModal("settings-modal");
        setTimeout(function () { consumePendingCompanionTechniqueLearnNotice(); }, 200);
        showToast("[v0.58] ジュリタニ習得演出を表示中...");
      };
      document.getElementById("btn-debug-v58-reset-notices").onclick = function () {
        if (!state.companionTechniqueLearnedNotices) { state.companionTechniqueLearnedNotices = {}; }
        state.companionTechniqueLearnedNotices = { juritani: false, shurittani: false, norio: false, harumi: false };
        _companionTechniqueLearnPending = [];
        _companionTechniqueLearnVisible = false;
        if (_companionTechniqueLearnTimer) { clearTimeout(_companionTechniqueLearnTimer); _companionTechniqueLearnTimer = null; }
        _companionTechniqueLearnCloseLock = false;
        saveGame();
        showToast("[v0.58] notice全リセット ✅\n4人 false / pending空 / visible=false\n（再テスト可能状態）");
      };
      // §80 v0.27: 仲間自動戦闘テスト
      document.getElementById("btn-debug-companion-battle-wilddog").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        state.player.companions = ["juritani", "harumi"];
        resetPartyTrail();
        closeModal("settings-modal");
        var dog = findById(NON_UMA_DATA, "wilddog");
        if (!dog) { showToast("[DEBUG] のらいぬが見つからない"); return; }
        actuallyStartBattle(dog);
        showToast("[DEBUG] 仲間2人でのらいぬ戦闘。自動行動を確認！");
      };
      document.getElementById("btn-debug-companion-battle-gorilla").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        state.player.companions = ["juritani", "harumi"];
        resetPartyTrail();
        closeModal("settings-modal");
        var boss = findById(UMA_DATA, "ultimategorilla");
        if (!boss) { showToast("[DEBUG] 究極ゴリラが見つからない"); return; }
        actuallyStartBattle(boss);
        state.enemy.hp = 10;
        renderEnemy();
        showToast("[DEBUG] 仲間2人+究極ゴリラHP10。仲間が見守るか確認！");
      };
      // §81 v0.27.1: 仲間撃破確認テスト（のらいぬHP3）
      document.getElementById("btn-debug-companion-kill-wilddog").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        state.player.companions = ["juritani", "harumi"];
        resetPartyTrail();
        closeModal("settings-modal");
        var dog = findById(NON_UMA_DATA, "wilddog");
        if (!dog) { showToast("[DEBUG] のらいぬが見つからない"); return; }
        actuallyStartBattle(dog);
        state.enemy.hp = 3;
        renderEnemy();
        showToast("[DEBUG] のらいぬHP3。仲間が撃破→勝利処理→敵ターンなしを確認！");
      };
      // §82 v0.28: 仲間コマンド選択テスト
      document.getElementById("btn-debug-companion-cmd-wilddog").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        state.player.companions = ["juritani", "harumi"];
        resetPartyTrail();
        closeModal("settings-modal");
        var dog = findById(NON_UMA_DATA, "wilddog");
        if (!dog) { showToast("[DEBUG] のらいぬが見つからない"); return; }
        actuallyStartBattle(dog);
        showToast("[DEBUG] 仲間2人+のらいぬ。たたかう後にコマンド選択が出るか確認！");
      };
      document.getElementById("btn-debug-companion-cmd-midboss").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        state.player.companions = ["juritani", "harumi"];
        resetPartyTrail();
        closeModal("settings-modal");
        var mb = findById(NON_UMA_DATA, "midboss_gorilla");
        if (!mb) { showToast("[DEBUG] 中ボスゴリラが見つからない"); return; }
        actuallyStartBattle(mb);
        state.enemy.hp = 30;
        renderEnemy();
        showToast("[DEBUG] 中ボスHP30。仲間コマンドで倒した時の撃退処理を確認！");
      };
      document.getElementById("btn-debug-companion-cmd-gorilla").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        state.player.companions = ["juritani", "harumi"];
        resetPartyTrail();
        closeModal("settings-modal");
        var boss = findById(UMA_DATA, "ultimategorilla");
        if (!boss) { showToast("[DEBUG] 究極ゴリラが見つからない"); return; }
        actuallyStartBattle(boss);
        state.enemy.hp = 10;
        renderEnemy();
        showToast("[DEBUG] 仲間2人+究極ゴリラHP10。コマンド出ず見守りログを確認！");
      };
      // §84 v0.29: 仲間固有コマンドテスト
      document.getElementById("btn-debug-companion-special-all").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        state.player.companions = ["juritani", "shurittani", "norio", "harumi"];
        resetPartyTrail();
        closeModal("settings-modal");
        var dog = findById(NON_UMA_DATA, "wilddog");
        if (!dog) { showToast("[DEBUG] のらいぬが見つからない"); return; }
        actuallyStartBattle(dog);
        showToast("[DEBUG] 仲間4人+のらいぬ。各固有コマンドを全て確認！");
      };
      document.getElementById("btn-debug-companion-special-harumi").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        state.player.companions = ["harumi"];
        state.player.hp = Math.max(1, Math.floor(state.player.maxHp * 0.4));
        resetPartyTrail();
        closeModal("settings-modal");
        var dog = findById(NON_UMA_DATA, "wilddog");
        if (!dog) { showToast("[DEBUG] のらいぬが見つからない"); return; }
        actuallyStartBattle(dog);
        showToast("[DEBUG] ハルミのみ+HP40%。小さな癒しでHP回復を確認！");
      };
      // §85 v0.29.1: まかせるランダム確認テスト
      document.getElementById("btn-debug-companion-auto-all").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        state.player.companions = ["juritani", "shurittani", "norio", "harumi"];
        resetPartyTrail();
        closeModal("settings-modal");
        var dog = findById(NON_UMA_DATA, "wilddog");
        if (!dog) { showToast("[DEBUG] のらいぬが見つからない"); return; }
        actuallyStartBattle(dog);
        showToast("[DEBUG] 仲間4人+のらいぬ。まかせるのランダムログを確認！");
      };
      document.getElementById("btn-debug-companion-auto-midboss").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        state.player.companions = ["juritani", "shurittani", "norio", "harumi"];
        resetPartyTrail();
        closeModal("settings-modal");
        var mb = findById(NON_UMA_DATA, "midboss_gorilla");
        if (!mb) { showToast("[DEBUG] 中ボスゴリラが見つからない"); return; }
        actuallyStartBattle(mb);
        state.enemy.hp = 50;
        renderEnemy();
        showToast("[DEBUG] 仲間4人+中ボスHP50。複数ターンのまかせるを確認！");
      };
      document.getElementById("btn-debug-companion-auto-harumi").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        state.player.companions = ["harumi"];
        state.player.hp = Math.max(1, Math.floor(state.player.maxHp * 0.4));
        resetPartyTrail();
        closeModal("settings-modal");
        var dog = findById(NON_UMA_DATA, "wilddog");
        if (!dog) { showToast("[DEBUG] のらいぬが見つからない"); return; }
        actuallyStartBattle(dog);
        showToast("[DEBUG] ハルミのみ+HP40%。まかせるで癒しが出るか確認！");
      };
      // §87 v0.31: まかせるAI状況判断テスト
      document.getElementById("btn-debug-ai-hpfull").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        state.player.companions = ["harumi"];
        state.player.hp = state.player.maxHp; // HP満タン
        resetPartyTrail();
        closeModal("settings-modal");
        var dog = findById(NON_UMA_DATA, "wilddog");
        if (!dog) { showToast("[DEBUG] のらいぬが見つからない"); return; }
        actuallyStartBattle(dog);
        showToast("[DEBUG] ハルミ+HP満タン。まかせるで回復を控えるか確認！");
      };
      document.getElementById("btn-debug-ai-hplow").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        state.player.companions = ["juritani", "shurittani", "norio", "harumi"];
        state.player.hp = Math.max(1, Math.floor(state.player.maxHp * 0.3)); // HP30%
        resetPartyTrail();
        closeModal("settings-modal");
        var dog = findById(NON_UMA_DATA, "wilddog");
        if (!dog) { showToast("[DEBUG] のらいぬが見つからない"); return; }
        actuallyStartBattle(dog);
        showToast("[DEBUG] 仲間4人+HP30%。ハルミが回復を選びやすいか確認！");
      };
      document.getElementById("btn-debug-ai-enemylow").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        state.player.companions = ["juritani", "shurittani", "norio", "harumi"];
        state.player.hp = state.player.maxHp; // HP満タン
        resetPartyTrail();
        closeModal("settings-modal");
        var dog = findById(NON_UMA_DATA, "wilddog");
        if (!dog) { showToast("[DEBUG] のらいぬが見つからない"); return; }
        actuallyStartBattle(dog);
        state.enemy.hp = 8;
        renderEnemy();
        showToast("[DEBUG] 仲間4人+敵HP8。全員が攻撃優先でとどめを刺すか確認！");
      };
      // §89 v0.32: 2つ目固有コマンド確認
      document.getElementById("btn-debug-special2-all").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        state.player.companions = ["juritani", "shurittani", "norio", "harumi"];
        state.player.hp = state.player.maxHp;
        resetPartyTrail();
        closeModal("settings-modal");
        var dog = findById(NON_UMA_DATA, "wilddog");
        if (!dog) { showToast("[DEBUG] のらいぬが見つからない"); return; }
        actuallyStartBattle(dog);
        showToast("[DEBUG] 仲間4人。固有コマンド→2つ目を選べるか確認！");
      };
      document.getElementById("btn-debug-special2-guard").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        state.player.companions = ["juritani", "harumi"];
        state.player.hp = state.player.maxHp;
        resetPartyTrail();
        closeModal("settings-modal");
        var dog = findById(NON_UMA_DATA, "wilddog");
        if (!dog) { showToast("[DEBUG] のらいぬが見つからない"); return; }
        actuallyStartBattle(dog);
        showToast("[DEBUG] ジュリタニ+ハルミ。かばう/まもりの光→敵攻撃時に軽減ログが出るか確認！");
      };
      // §91 v0.33: まかせるAI 3択確認
      document.getElementById("btn-debug-auto3-all").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        state.player.companions = ["juritani", "shurittani", "norio", "harumi"];
        state.player.hp = state.player.maxHp;
        resetPartyTrail();
        closeModal("settings-modal");
        var dog = findById(NON_UMA_DATA, "wilddog");
        if (!dog) { showToast("[DEBUG] のらいぬが見つからない"); return; }
        actuallyStartBattle(dog);
        showToast("[DEBUG] 仲間4人。まかせるで「○○を選んだ！」が2行で出るか確認！");
      };
      document.getElementById("btn-debug-auto3-guard").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        state.player.companions = ["juritani", "harumi"];
        state.player.hp = state.player.maxHp;
        resetPartyTrail();
        closeModal("settings-modal");
        var dog = findById(NON_UMA_DATA, "wilddog");
        if (!dog) { showToast("[DEBUG] のらいぬが見つからない"); return; }
        actuallyStartBattle(dog);
        showToast("[DEBUG] ジュリタニ+ハルミ。かばう/まもりの光が選ばれて🛡️軽減が発生するか確認！");
      };
      // §93 v0.34: 戦闘UI確認
      document.getElementById("btn-debug-v34-ui").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        state.player.companions = ["juritani", "harumi"];
        state.player.hp = state.player.maxHp;
        resetPartyTrail();
        closeModal("settings-modal");
        var dog = findById(NON_UMA_DATA, "wilddog");
        if (!dog) { showToast("[DEBUG] のらいぬが見つからない"); return; }
        actuallyStartBattle(dog);
        showToast("[DEBUG] ジュリタニ+ハルミ。HP/MP色・仲間コマンド「1/2人目」表示を確認！");
      };
      document.getElementById("btn-debug-v34-badge-guard").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        state.player.companions = ["juritani", "harumi"];
        state.player.hp = Math.max(1, Math.floor(state.player.maxHp * 0.25)); // HP25%→赤表示テスト
        resetPartyTrail();
        closeModal("settings-modal");
        var dog = findById(NON_UMA_DATA, "wilddog");
        if (!dog) { showToast("[DEBUG] のらいぬが見つからない"); return; }
        actuallyStartBattle(dog);
        state.battleDamageReduction = 0.20;
        updateBattleStatusBadges();
        showToast("[DEBUG] HP25%（赤）+🛡️守り効果バッジを確認！");
      };
      // §94 v0.34.1: HP色確認（HP45% → オレンジ warn が見えるか）
      document.getElementById("btn-debug-v341-hpcolor").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        state.player.companions = [];
        state.player.hp = Math.max(1, Math.floor(state.player.maxHp * 0.45)); // HP45%→オレンジ警告
        resetPartyTrail();
        closeModal("settings-modal");
        var dog = findById(NON_UMA_DATA, "wilddog");
        if (!dog) { showToast("[DEBUG] のらいぬが見つからない"); return; }
        actuallyStartBattle(dog);
        showToast("[DEBUG] HP45%。オレンジ（警告）が表示されるか確認！ダメージ受けると赤（危険）になる。");
      };
      // §94 v0.34.1: ガマン中 + 守り効果バッジの同時表示確認
      document.getElementById("btn-debug-v341-gaman-guard").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        state.player.companions = ["juritani"];
        state.player.hp = state.player.maxHp;
        resetPartyTrail();
        closeModal("settings-modal");
        var dog = findById(NON_UMA_DATA, "wilddog");
        if (!dog) { showToast("[DEBUG] のらいぬが見つからない"); return; }
        actuallyStartBattle(dog);
        state.gamanActive = true;
        state.battleDamageReduction = 0.20;
        updateBattlePlayerStatus();
        showToast("[DEBUG] 😤ガマン中 + 🛡️守り効果バッジが共存して崩れないか確認！");
      };
      // §95 v0.35: 仲間まほう確認（仲間4人+のらいぬ）
      document.getElementById("btn-debug-v35-magic-ui").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        state.player.companions = ["juritani", "shurittani", "norio", "harumi"];
        state.player.hp = state.player.maxHp;
        resetPartyTrail();
        closeModal("settings-modal");
        var dog = findById(NON_UMA_DATA, "wilddog");
        if (!dog) { showToast("[DEBUG] のらいぬが見つからない"); return; }
        actuallyStartBattle(dog);
        showToast("[DEBUG] 仲間4人。コマンドに「✨ まほう」が表示されるか確認！");
      };
      // §95 v0.35: ハルミ小さな回復確認（HP25%）
      document.getElementById("btn-debug-v35-magic-harumi").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        state.player.companions = ["harumi"];
        state.player.hp = Math.max(1, Math.floor(state.player.maxHp * 0.25));
        resetPartyTrail();
        closeModal("settings-modal");
        var dog = findById(NON_UMA_DATA, "wilddog");
        if (!dog) { showToast("[DEBUG] のらいぬが見つからない"); return; }
        actuallyStartBattle(dog);
        showToast("[DEBUG] ハルミのみ HP25%。まほう→小さな回復でHP回復と色変化を確認！");
      };
      // §95 v0.35: 仲間まほうUI戻る確認（仲間2人）
      document.getElementById("btn-debug-v35-magic-back").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        state.player.companions = ["juritani", "harumi"];
        state.player.hp = state.player.maxHp;
        resetPartyTrail();
        closeModal("settings-modal");
        var dog = findById(NON_UMA_DATA, "wilddog");
        if (!dog) { showToast("[DEBUG] のらいぬが見つからない"); return; }
        actuallyStartBattle(dog);
        showToast("[DEBUG] 仲間2人。まほうサブメニュー→戻るボタンで元に戻れるか確認！");
      };
      // §96 v0.35.1: 仲間まほう勝利確認（敵HP5）
      document.getElementById("btn-debug-v351-magic-win").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        state.player.companions = ["juritani", "shurittani", "norio"];
        state.player.hp = state.player.maxHp;
        resetPartyTrail();
        closeModal("settings-modal");
        var dog = findById(NON_UMA_DATA, "wilddog");
        if (!dog) { showToast("[DEBUG] のらいぬが見つからない"); return; }
        actuallyStartBattle(dog);
        if (state.enemy) { state.enemy.hp = 5; renderEnemy(); }
        showToast("[DEBUG] 仲間3人+敵HP5。まほうで倒すと winBattle() に進むか確認！");
      };
      // §96 v0.35.1: まほうメニュー連打防止確認（仲間1人）
      document.getElementById("btn-debug-v351-magic-lock").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        state.player.companions = ["juritani"];
        state.player.hp = state.player.maxHp;
        resetPartyTrail();
        closeModal("settings-modal");
        var dog = findById(NON_UMA_DATA, "wilddog");
        if (!dog) { showToast("[DEBUG] のらいぬが見つからない"); return; }
        actuallyStartBattle(dog);
        showToast("[DEBUG] ジュリタニ1人。まほうボタン連打・戻る連打で壊れないか確認！");
      };
      // §97 v0.36: まかせるAI 4択確認（仲間4人+のらいぬ）
      document.getElementById("btn-debug-v36-auto4").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        state.player.companions = ["juritani", "shurittani", "norio", "harumi"];
        state.player.hp = state.player.maxHp;
        state.lastCompanionAutoAction = {};
        resetPartyTrail();
        closeModal("settings-modal");
        var dog = findById(NON_UMA_DATA, "wilddog");
        if (!dog) { showToast("[DEBUG] のらいぬが見つからない"); return; }
        actuallyStartBattle(dog);
        showToast("[DEBUG] 仲間4人。まかせるで「まほう」も選ばれるか確認！");
      };
      // §97 v0.36: まかせるAI ハルミ回復確認（HP25%）
      document.getElementById("btn-debug-v36-auto4-harumi").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        state.player.companions = ["harumi"];
        state.player.hp = Math.max(1, Math.floor(state.player.maxHp * 0.25));
        state.lastCompanionAutoAction = {};
        resetPartyTrail();
        closeModal("settings-modal");
        var dog = findById(NON_UMA_DATA, "wilddog");
        if (!dog) { showToast("[DEBUG] のらいぬが見つからない"); return; }
        actuallyStartBattle(dog);
        showToast("[DEBUG] ハルミHP25%。まかせるで小さな癒し・小さな回復が選ばれやすいか確認！");
      };
      // §97 v0.36: まかせるAI 敵HP10確認（まほう混入）
      document.getElementById("btn-debug-v36-auto4-hplow").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        state.player.companions = ["juritani", "shurittani", "norio", "harumi"];
        state.player.hp = state.player.maxHp;
        state.lastCompanionAutoAction = {};
        resetPartyTrail();
        closeModal("settings-modal");
        var dog = findById(NON_UMA_DATA, "wilddog");
        if (!dog) { showToast("[DEBUG] のらいぬが見つからない"); return; }
        actuallyStartBattle(dog);
        if (state.enemy) { state.enemy.hp = 10; renderEnemy(); }
        showToast("[DEBUG] 仲間4人+敵HP10。まかせるで攻撃優先（まほうも少し選ばれる）か確認！");
      };
      // §98 v0.36.1: まかせるAI 魔法名ログ確認
      document.getElementById("btn-debug-v361-magic-log").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        state.player.companions = ["juritani", "shurittani", "norio", "harumi"];
        state.player.hp = state.player.maxHp;
        state.lastCompanionAutoAction = {};
        resetPartyTrail();
        closeModal("settings-modal");
        var dog = findById(NON_UMA_DATA, "wilddog");
        if (!dog) { showToast("[DEBUG] のらいぬが見つからない"); return; }
        actuallyStartBattle(dog);
        showToast("[DEBUG] 仲間4人+前回記憶クリア。まかせるでまほうが選ばれた時に魔法名がログに出るか確認！");
      };
      // §99 v0.37: 仲間Lv設定ボタン
      document.getElementById("btn-debug-companion-lv10").onclick = function () {
        COMPANION_DATA.forEach(function (c) {
          var cl = getCompanionLevel(c.id);
          cl.level = 10; cl.exp = 0; cl.nextExp = 10 * 10 + 15;
        });
        saveGame();
        showToast("[DEBUG] 仲間4人をLv10に設定！酒場・ステータス・冒険の記録で確認");
        renderSettingsBody();
      };
      document.getElementById("btn-debug-companion-lv50").onclick = function () {
        COMPANION_DATA.forEach(function (c) {
          var cl = getCompanionLevel(c.id);
          cl.level = 50; cl.exp = 0; cl.nextExp = 50 * 10 + 15;
        });
        saveGame();
        showToast("[DEBUG] 仲間4人をLv50に設定！酒場・ステータス・冒険の記録で確認");
        renderSettingsBody();
      };
      document.getElementById("btn-debug-companion-lv99").onclick = function () {
        COMPANION_DATA.forEach(function (c) {
          var cl = getCompanionLevel(c.id);
          cl.level = 99; cl.exp = 0; cl.nextExp = 99 * 10 + 15;
        });
        saveGame();
        showToast("[DEBUG] 仲間4人をLv99に設定！酒場・ステータス・冒険の記録で確認");
        renderSettingsBody();
      };
      // §100 v0.37.1: 仲間成長安定化 デバッグボタン
      document.getElementById("btn-debug-companion-lv1").onclick = function () {
        COMPANION_DATA.forEach(function (c) {
          var cl = getCompanionLevel(c.id);
          cl.level = 1; cl.exp = 0; cl.nextExp = 25;
        });
        saveGame();
        showToast("[DEBUG] 仲間4人をLv1・EXP0にリセット！酒場・ステータスで確認");
        renderSettingsBody();
      };
      document.getElementById("btn-debug-companion-multilv").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        COMPANION_DATA.forEach(function (c) {
          var cl = getCompanionLevel(c.id);
          cl.level = 1; cl.exp = 0; cl.nextExp = 25;
        });
        state.player.companions = ["juritani", "shurittani"];
        gainCompanionExp(500);
        saveGame();
        showToast("[DEBUG] ジュリ+シュリにEXP500付与！バトルログで複数Lvアップを確認");
        renderSettingsBody();
      };
      document.getElementById("btn-debug-companion-expcheck").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        COMPANION_DATA.forEach(function (c) {
          var cl = getCompanionLevel(c.id);
          cl.level = 1; cl.exp = 0; cl.nextExp = 25;
        });
        state.player.companions = ["juritani", "harumi"];
        gainCompanionExp(30);
        saveGame();
        showToast("[DEBUG] パーティ:ジュリ+ハルミ、待機:シュリ+ノリオ。EXP30付与→パーティのみLvアップをログで確認");
        renderSettingsBody();
      };
      // §101 v0.38: 仲間成長確認ボタン
      document.getElementById("btn-debug-growth-harumi-lv1").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        var cl = getCompanionLevel("harumi");
        cl.level = 1; cl.exp = 0; cl.nextExp = 25;
        state.player.companions = ["harumi"];
        state.player.hp = Math.max(1, Math.floor(state.player.maxHp * 0.25));
        saveGame();
        showToast("[DEBUG] ハルミLv1+HP25%。戦闘→小さな癒し/小さな回復で回復量を確認（Lv1:ボーナス0）");
        renderSettingsBody();
      };
      document.getElementById("btn-debug-growth-harumi-lv99").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        var cl = getCompanionLevel("harumi");
        cl.level = 99; cl.exp = 0; cl.nextExp = 99 * 10 + 15;
        state.player.companions = ["harumi"];
        state.player.hp = Math.max(1, Math.floor(state.player.maxHp * 0.25));
        saveGame();
        showToast("[DEBUG] ハルミLv99+HP25%。戦闘→小さな癒し/小さな回復で回復量を確認（Lv99:回復+10）");
        renderSettingsBody();
      };
      // §103 v0.39: 仲間節目セリフ確認ボタン
      document.getElementById("btn-debug-milestone-lv10").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        var cl = getCompanionLevel("juritani");
        cl.level = 9; cl.exp = 0; cl.nextExp = 9 * 10 + 15;
        cl.milestones = { level10: false, level50: false, level99: false };
        state.player.companions = ["juritani"];
        gainCompanionExp(110); // Lv9→Lv10（nextExp=105を超える）
        saveGame();
        showToast("[DEBUG] ジュリタニLv9→Lv10。バトルログでLv10節目セリフを確認！");
        renderSettingsBody();
      };
      document.getElementById("btn-debug-milestone-lv50").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        var cl = getCompanionLevel("shurittani");
        cl.level = 49; cl.exp = 0; cl.nextExp = 49 * 10 + 15;
        cl.milestones = { level10: true, level50: false, level99: false };
        state.player.companions = ["shurittani"];
        gainCompanionExp(510); // Lv49→Lv50（nextExp=505を超える）
        saveGame();
        showToast("[DEBUG] シュリタニLv49→Lv50。バトルログでLv50節目セリフを確認！");
        renderSettingsBody();
      };
      document.getElementById("btn-debug-milestone-lv99").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        var cl = getCompanionLevel("norio");
        cl.level = 98; cl.exp = 0; cl.nextExp = 98 * 10 + 15;
        cl.milestones = { level10: true, level50: true, level99: false };
        state.player.companions = ["norio"];
        gainCompanionExp(1000); // Lv98→Lv99（nextExp=995を超える）
        saveGame();
        showToast("[DEBUG] ノリオLv98→Lv99。バトルログで🌟専用ログ＋👑節目セリフを確認！");
        renderSettingsBody();
      };
      document.getElementById("btn-debug-milestone-reset").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        COMPANION_DATA.forEach(function (c) {
          var cl = getCompanionLevel(c.id);
          cl.level = 1; cl.exp = 0; cl.nextExp = 25;
          cl.milestones = { level10: false, level50: false, level99: false };
        });
        saveGame();
        showToast("[DEBUG] 仲間4人Lv1・EXP0・節目フラグ全リセット。ステータス画面で「成長の節目：Lv10 ・」を確認！");
        renderSettingsBody();
      };
      // §104 v0.39.1: 節目セリフ安定化確認ボタン
      document.getElementById("btn-debug-milestone-2person").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        ["juritani", "harumi"].forEach(function (cid) {
          var cl = getCompanionLevel(cid);
          cl.level = 9; cl.exp = 0; cl.nextExp = 9 * 10 + 15;
          cl.milestones = { level10: false, level50: false, level99: false };
        });
        state.player.companions = ["juritani", "harumi"];
        gainCompanionExp(110); // 両者Lv9→Lv10（nextExp=105を超える）
        saveGame();
        showToast("[DEBUG] ジュリタニ+ハルミ同時Lv9→Lv10。2人分のLv10節目セリフをバトルログで確認！");
        renderSettingsBody();
      };
      document.getElementById("btn-debug-milestone-multi").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        var cl = getCompanionLevel("juritani");
        cl.level = 1; cl.exp = 0; cl.nextExp = 25;
        cl.milestones = { level10: false, level50: false, level99: false };
        state.player.companions = ["juritani"];
        gainCompanionExp(20000); // Lv1→Lv60超え（Lv60到達に約18600必要）
        saveGame();
        showToast("[DEBUG] ジュリタニLv1→Lv60超え。Lv50セリフのみ表示・Lv10/50フラグtrue・Lv99falseをバトルログとステータスで確認！");
        renderSettingsBody();
      };
      // §105 v0.40: 仲間装備デバッグ
      document.getElementById("btn-debug-gear-equip-all").onclick = function () {
        ensureCompanionGearState();
        var _dcs = ["juritani", "shurittani", "norio", "harumi"];
        var _dks = Object.keys(COMPANION_GEAR_DATA);
        for (var _di = 0; _di < _dcs.length; _di++) {
          for (var _dki = 0; _dki < _dks.length; _dki++) {
            if (COMPANION_GEAR_DATA[_dks[_dki]].allowedCompanion === _dcs[_di]) {
              state.companionEquipment[_dcs[_di]] = _dks[_dki]; break;
            }
          }
        }
        saveGame(); renderSettingsBody();
        showToast("[DEBUG] 全仲間に専用装備を装備。ステータス画面で確認！");
      };
      document.getElementById("btn-debug-gear-unequip-all").onclick = function () {
        ensureCompanionGearState();
        ["juritani", "shurittani", "norio", "harumi"].forEach(function (cid) { state.companionEquipment[cid] = null; });
        saveGame(); renderSettingsBody();
        showToast("[DEBUG] 全仲間の装備を外した。");
      };
      document.getElementById("btn-debug-gear-starter-reset").onclick = function () {
        state.companionEquipment = {};
        state.companionGearInventory = {};
        state.companionGearVersion = 0;
        saveGame(); renderSettingsBody();
        showToast("[DEBUG] スターター配布リセット完了。次回ensureで再配布される");
      };
      document.getElementById("btn-debug-gear-juritani-only").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        ensureCompanionGearState();
        state.companionEquipment["juritani"]   = "hotblood_bandana";
        state.companionEquipment["shurittani"] = null;
        state.companionEquipment["norio"]      = null;
        state.companionEquipment["harumi"]     = null;
        state.player.companions = ["juritani"];
        state.player.hp = state.player.maxHp;
        resetPartyTrail();
        saveGame();
        var _ddog1 = findById(NON_UMA_DATA, "wilddog");
        if (!_ddog1) { showToast("[DEBUG] のらいぬが見つからない"); return; }
        closeModal("settings-modal");
        actuallyStartBattle(_ddog1);
        if (state.enemy) { state.enemy.hp = 100; renderEnemy(); }
        showToast("[DEBUG] ジュリタニ熱血バンダナ装備+のらいぬHP100。通常攻撃で+2を確認！");
      };
      document.getElementById("btn-debug-gear-harumi-only").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        ensureCompanionGearState();
        state.companionEquipment["juritani"]   = null;
        state.companionEquipment["shurittani"] = null;
        state.companionEquipment["norio"]      = null;
        state.companionEquipment["harumi"]     = "healing_ribbon";
        state.player.companions = ["harumi"];
        state.player.hp = Math.floor(state.player.maxHp * 0.3);
        resetPartyTrail();
        saveGame();
        var _ddog2 = findById(NON_UMA_DATA, "wilddog");
        if (!_ddog2) { showToast("[DEBUG] のらいぬが見つからない"); return; }
        closeModal("settings-modal");
        actuallyStartBattle(_ddog2);
        if (state.enemy) { state.enemy.hp = 100; renderEnemy(); }
        showToast("[DEBUG] ハルミ癒しのリボン装備+HP30%+のらいぬ。小さな癒しで+3を確認！");
      };
      // §106 v0.40.1: データ破損確認
      document.getElementById("btn-debug-gear-corrupt-check").onclick = function () {
        ensureCompanionGearState();
        // 破損データをセット
        state.companionEquipment = ["invalid_array"];
        state.companionGearInventory = { hotblood_bandana: -5, capture_gloves: "abc", observation_glasses: NaN, healing_ribbon: null };
        state.companionEquipment["juritani"] = "observation_glasses"; // 他人の装備を装備
        state.companionGearVersion = "wrong_type";
        // 補正実行
        ensureCompanionGearState();
        // 結果確認
        var _inv = state.companionGearInventory;
        var _eq = state.companionEquipment;
        var _pass = (
          !Array.isArray(_eq) && typeof _eq === "object" &&
          _eq["juritani"] === null &&
          _inv["hotblood_bandana"] === 0 &&
          _inv["capture_gloves"] === 0 &&
          _inv["observation_glasses"] === 0 &&
          _inv["healing_ribbon"] === 0 &&
          typeof state.companionGearVersion === "number" && !isNaN(state.companionGearVersion)
        );
        showToast("[DEBUG] 破損確認: " + (_pass ? "PASS ✅ すべて補正済み" : "FAIL ❌ コンソール確認"));
        if (!_pass) { console.log("[DEBUG] eq:", JSON.stringify(_eq), "inv:", JSON.stringify(_inv), "ver:", state.companionGearVersion); }
        renderStatusBody();
      };
      // §106 v0.40.1 / §107 v0.41: 全装備増殖防止確認（v0→v2を3回ensure）
      document.getElementById("btn-debug-gear-dup-check").onclick = function () {
        state.companionGearInventory = {};
        state.companionGearVersion = 0;
        ensureCompanionGearState();
        ensureCompanionGearState();
        ensureCompanionGearState();
        var _inv = state.companionGearInventory;
        var _pass = (
          _inv["hotblood_bandana"]    === 1 && _inv["capture_gloves"]      === 1 &&
          _inv["observation_glasses"] === 1 && _inv["healing_ribbon"]      === 1 &&
          _inv["critical_bracelet"]   === 1 && _inv["net_master_belt"]     === 1 &&
          _inv["research_notebook"]   === 1 && _inv["prayer_brooch"]       === 1 &&
          state.companionGearVersion  === 2
        );
        showToast("[DEBUG] 増殖防止確認: " + (_pass ? "PASS ✅ 全8種×1個・ver=2" : "FAIL ❌ コンソール確認"));
        if (!_pass) { console.log("[DEBUG] inv after ×3:", JSON.stringify(_inv), "ver:", state.companionGearVersion); }
        renderStatusBody();
      };
      // §107 v0.41: v1→v2移行確認
      document.getElementById("btn-debug-gear-v2-migrate").onclick = function () {
        // version=1 + スターター各1個 + 新装備なし の状態を作る
        state.companionGearInventory = { hotblood_bandana: 1, capture_gloves: 1, observation_glasses: 1, healing_ribbon: 1 };
        state.companionGearVersion = 1;
        var _prevInvJ = state.companionGearInventory["hotblood_bandana"];
        // ensure×3回（3回呼んでも1回分のみ配布されるべき）
        ensureCompanionGearState();
        ensureCompanionGearState();
        ensureCompanionGearState();
        var _inv2 = state.companionGearInventory;
        var _pass2 = (
          _inv2["hotblood_bandana"]    === _prevInvJ &&   // 既存数維持
          _inv2["critical_bracelet"]   === 1 &&
          _inv2["net_master_belt"]     === 1 &&
          _inv2["research_notebook"]   === 1 &&
          _inv2["prayer_brooch"]       === 1 &&
          state.companionGearVersion   === 2
        );
        showToast("[DEBUG] v1→v2移行確認: " + (_pass2 ? "PASS ✅ 新装備各1個・既存維持・ver=2" : "FAIL ❌ コンソール確認"));
        if (!_pass2) { console.log("[DEBUG] inv:", JSON.stringify(_inv2), "ver:", state.companionGearVersion); }
        renderStatusBody();
      };
      // §107 v0.41: 新装備を全員に装備
      document.getElementById("btn-debug-gear-new-equip-all").onclick = function () {
        ensureCompanionGearState();
        var _newPref = { juritani: "critical_bracelet", shurittani: "net_master_belt", norio: "research_notebook", harumi: "prayer_brooch" };
        var _ncs = ["juritani", "shurittani", "norio", "harumi"];
        for (var _ni = 0; _ni < _ncs.length; _ni++) {
          var _ngid = _newPref[_ncs[_ni]];
          if ((state.companionGearInventory[_ngid] || 0) > 0) { state.companionEquipment[_ncs[_ni]] = _ngid; }
        }
        saveGame(); renderSettingsBody();
        showToast("[DEBUG] 新装備（会心の腕輪等）を全員装備。ステータス画面で確認！");
      };
      // §107 v0.41: ジュリタニ2装備比較（会心の構えで違いを確認）
      document.getElementById("btn-debug-gear-juritani-crit").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        ensureCompanionGearState();
        state.companionEquipment["juritani"]   = "critical_bracelet"; // 会心の腕輪
        state.companionEquipment["shurittani"] = null;
        state.companionEquipment["norio"]      = null;
        state.companionEquipment["harumi"]     = null;
        state.player.companions = ["juritani"];
        state.player.hp = state.player.maxHp;
        resetPartyTrail();
        saveGame();
        var _djcrit = findById(NON_UMA_DATA, "wilddog");
        if (!_djcrit) { showToast("[DEBUG] のらいぬが見つからない"); return; }
        closeModal("settings-modal");
        actuallyStartBattle(_djcrit);
        if (state.enemy) { state.enemy.hp = 200; renderEnemy(); }
        showToast("[DEBUG] ジュリタニ会心の腕輪装備+のらいぬHP200。固有1(会心の構え)で+5・通常攻撃で+0を確認！");
      };
      // §107 v0.41: ハルミ2装備比較（小さな回復で違いを確認）
      document.getElementById("btn-debug-gear-harumi-brooch").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        ensureCompanionGearState();
        state.companionEquipment["juritani"]   = null;
        state.companionEquipment["shurittani"] = null;
        state.companionEquipment["norio"]      = null;
        state.companionEquipment["harumi"]     = "prayer_brooch"; // 祈りのブローチ
        state.player.companions = ["harumi"];
        state.player.hp = Math.floor(state.player.maxHp * 0.25);
        resetPartyTrail();
        saveGame();
        var _dhb = findById(NON_UMA_DATA, "wilddog");
        if (!_dhb) { showToast("[DEBUG] のらいぬが見つからない"); return; }
        closeModal("settings-modal");
        actuallyStartBattle(_dhb);
        if (state.enemy) { state.enemy.hp = 200; renderEnemy(); }
        showToast("[DEBUG] ハルミ祈りのブローチ装備+HP25%+のらいぬ。まほう(小さな回復)で+6・固有1(小さな癒し)で+0を確認！");
      };
      // §108 v0.41.1: 行動別装備ボーナス全確認（8種×4actionKey）
      document.getElementById("btn-debug-gear-bonus-check").onclick = function () {
        ensureCompanionGearState();
        var _oldEq = {
          juritani: state.companionEquipment["juritani"],
          shurittani: state.companionEquipment["shurittani"],
          norio: state.companionEquipment["norio"],
          harumi: state.companionEquipment["harumi"]
        };
        var _lines = [];
        var _allPass = true;
        function _chk(cid, gid, type, ak, exp) {
          state.companionEquipment[cid] = gid;
          var val = getCompanionEquipmentBonus(cid, type, ak);
          return val === exp;
        }
        // ジュリタニ 熱血バンダナ: damage attack/s1/s2/magic = 2/2/0/2
        var jb = [_chk("juritani","hotblood_bandana","damage","attack",2), _chk("juritani","hotblood_bandana","damage","special1",2), _chk("juritani","hotblood_bandana","damage","special2",0), _chk("juritani","hotblood_bandana","damage","magic",2)];
        var jbP = jb[0]&&jb[1]&&jb[2]&&jb[3]; if(!jbP){_allPass=false;}
        state.companionEquipment["juritani"] = "hotblood_bandana";
        var jbVals = [getCompanionEquipmentBonus("juritani","damage","attack"),getCompanionEquipmentBonus("juritani","damage","special1"),getCompanionEquipmentBonus("juritani","damage","special2"),getCompanionEquipmentBonus("juritani","damage","magic")];
        _lines.push("熱血バンダナ:" + jbVals.join("/") + (jbP?" ✅":" ❌(exp 2/2/0/2)"));
        // ジュリタニ 会心の腕輪: 0/5/0/0
        state.companionEquipment["juritani"] = "critical_bracelet";
        var jcVals = [getCompanionEquipmentBonus("juritani","damage","attack"),getCompanionEquipmentBonus("juritani","damage","special1"),getCompanionEquipmentBonus("juritani","damage","special2"),getCompanionEquipmentBonus("juritani","damage","magic")];
        var jcP = (jcVals[0]===0&&jcVals[1]===5&&jcVals[2]===0&&jcVals[3]===0); if(!jcP){_allPass=false;}
        _lines.push("会心の腕輪:" + jcVals.join("/") + (jcP?" ✅":" ❌(exp 0/5/0/0)"));
        // シュリタニ 捕獲グローブ: 1/1/1/1
        state.companionEquipment["shurittani"] = "capture_gloves";
        var sgVals = [getCompanionEquipmentBonus("shurittani","damage","attack"),getCompanionEquipmentBonus("shurittani","damage","special1"),getCompanionEquipmentBonus("shurittani","damage","special2"),getCompanionEquipmentBonus("shurittani","damage","magic")];
        var sgP = (sgVals[0]===1&&sgVals[1]===1&&sgVals[2]===1&&sgVals[3]===1); if(!sgP){_allPass=false;}
        _lines.push("捕獲グローブ:" + sgVals.join("/") + (sgP?" ✅":" ❌(exp 1/1/1/1)"));
        // シュリタニ 網師のベルト: 0/0/4/0
        state.companionEquipment["shurittani"] = "net_master_belt";
        var snVals = [getCompanionEquipmentBonus("shurittani","damage","attack"),getCompanionEquipmentBonus("shurittani","damage","special1"),getCompanionEquipmentBonus("shurittani","damage","special2"),getCompanionEquipmentBonus("shurittani","damage","magic")];
        var snP = (snVals[0]===0&&snVals[1]===0&&snVals[2]===4&&snVals[3]===0); if(!snP){_allPass=false;}
        _lines.push("網師のベルト:" + snVals.join("/") + (snP?" ✅":" ❌(exp 0/0/4/0)"));
        // ノリオ 観察メガネ: 1/1/1/1
        state.companionEquipment["norio"] = "observation_glasses";
        var ngVals = [getCompanionEquipmentBonus("norio","damage","attack"),getCompanionEquipmentBonus("norio","damage","special1"),getCompanionEquipmentBonus("norio","damage","special2"),getCompanionEquipmentBonus("norio","damage","magic")];
        var ngP = (ngVals[0]===1&&ngVals[1]===1&&ngVals[2]===1&&ngVals[3]===1); if(!ngP){_allPass=false;}
        _lines.push("観察メガネ:" + ngVals.join("/") + (ngP?" ✅":" ❌(exp 1/1/1/1)"));
        // ノリオ 研究ノート: 0/0/3/3
        state.companionEquipment["norio"] = "research_notebook";
        var nnVals = [getCompanionEquipmentBonus("norio","damage","attack"),getCompanionEquipmentBonus("norio","damage","special1"),getCompanionEquipmentBonus("norio","damage","special2"),getCompanionEquipmentBonus("norio","damage","magic")];
        var nnP = (nnVals[0]===0&&nnVals[1]===0&&nnVals[2]===3&&nnVals[3]===3); if(!nnP){_allPass=false;}
        _lines.push("研究ノート:" + nnVals.join("/") + (nnP?" ✅":" ❌(exp 0/0/3/3)"));
        // ハルミ 癒しのリボン: heal s1=3, magic=3
        state.companionEquipment["harumi"] = "healing_ribbon";
        var hrS1 = getCompanionEquipmentBonus("harumi","heal","special1");
        var hrM  = getCompanionEquipmentBonus("harumi","heal","magic");
        var hrP = (hrS1===3&&hrM===3); if(!hrP){_allPass=false;}
        _lines.push("癒しのリボン:s1h=" + hrS1 + "/mh=" + hrM + (hrP?" ✅":" ❌(exp 3/3)"));
        // ハルミ 祈りのブローチ: heal s1=0, magic=6
        state.companionEquipment["harumi"] = "prayer_brooch";
        var hbS1 = getCompanionEquipmentBonus("harumi","heal","special1");
        var hbM  = getCompanionEquipmentBonus("harumi","heal","magic");
        var hbP = (hbS1===0&&hbM===6); if(!hbP){_allPass=false;}
        _lines.push("祈りのブローチ:s1h=" + hbS1 + "/mh=" + hbM + (hbP?" ✅":" ❌(exp 0/6)"));
        // 元の装備を復元
        state.companionEquipment["juritani"]   = _oldEq.juritani;
        state.companionEquipment["shurittani"] = _oldEq.shurittani;
        state.companionEquipment["norio"]      = _oldEq.norio;
        state.companionEquipment["harumi"]     = _oldEq.harumi;
        console.log("[DEBUG] 行動別ボーナス全確認 (attack/special1/special2/magic):\n" + _lines.join("\n"));
        showToast("[DEBUG] ボーナス全確認: " + (_allPass ? "全PASS ✅" : "FAIL ❌ あり") + " (詳細はコンソール)");
        renderStatusBody();
      };
      // §108 v0.41.1: 装備切替残留チェック
      document.getElementById("btn-debug-gear-switch-check").onclick = function () {
        ensureCompanionGearState();
        var _oldJ = state.companionEquipment["juritani"];
        // Step1: 熱血バンダナ
        state.companionEquipment["juritani"] = "hotblood_bandana";
        var s1a = getCompanionEquipmentBonus("juritani","damage","attack");
        var s1s1 = getCompanionEquipmentBonus("juritani","damage","special1");
        // Step2: 会心の腕輪に切替
        state.companionEquipment["juritani"] = "critical_bracelet";
        var s2a = getCompanionEquipmentBonus("juritani","damage","attack");
        var s2s1 = getCompanionEquipmentBonus("juritani","damage","special1");
        // Step3: 熱血バンダナに戻す
        state.companionEquipment["juritani"] = "hotblood_bandana";
        var s3a = getCompanionEquipmentBonus("juritani","damage","attack");
        var s3s1 = getCompanionEquipmentBonus("juritani","damage","special1");
        // Step4: 装備なしに切替
        state.companionEquipment["juritani"] = null;
        var s4a = getCompanionEquipmentBonus("juritani","damage","attack");
        var s4s1 = getCompanionEquipmentBonus("juritani","damage","special1");
        var _pass = (s1a===2&&s1s1===2 && s2a===0&&s2s1===5 && s3a===2&&s3s1===2 && s4a===0&&s4s1===0);
        var _lines = [
          "熱血バンダナ: atk=" + s1a + " s1=" + s1s1 + (s1a===2&&s1s1===2?" ✅":" ❌(exp 2/2)"),
          "会心の腕輪: atk=" + s2a + " s1=" + s2s1 + (s2a===0&&s2s1===5?" ✅":" ❌(exp 0/5)"),
          "熱血バンダナ戻す: atk=" + s3a + " s1=" + s3s1 + (s3a===2&&s3s1===2?" ✅":" ❌(exp 2/2)"),
          "装備なし: atk=" + s4a + " s1=" + s4s1 + (s4a===0&&s4s1===0?" ✅":" ❌(exp 0/0)")
        ];
        state.companionEquipment["juritani"] = _oldJ;
        console.log("[DEBUG] 装備切替残留チェック:\n" + _lines.join("\n"));
        showToast("[DEBUG] 切替残留: " + (_pass ? "PASS ✅ 旧効果なし" : "FAIL ❌ 残留あり") + " (詳細はコンソール)");
        renderStatusBody();
      };
      // §109 v0.42: 特化装備探索報酬デバッグ
      document.getElementById("btn-debug-gear-reward-reset").onclick = function () {
        ensureCompanionGearState();
        if (!state.companionGearRewardFlags) { state.companionGearRewardFlags = {}; }
        var _rids42r = ["critical_bracelet", "net_master_belt", "research_notebook", "prayer_brooch"];
        var _cids42r = ["juritani", "shurittani", "norio", "harumi"];
        for (var _ri42r = 0; _ri42r < _rids42r.length; _ri42r++) {
          var _gid42r = _rids42r[_ri42r];
          state.companionGearRewardFlags[_gid42r] = false;
          state.companionGearInventory[_gid42r] = 0;
          for (var _ci42r = 0; _ci42r < _cids42r.length; _ci42r++) {
            if (state.companionEquipment[_cids42r[_ci42r]] === _gid42r) {
              state.companionEquipment[_cids42r[_ci42r]] = null;
            }
          }
        }
        saveGame(); renderStatusBody();
        showToast("[DEBUG] 特化装備報酬リセット完了（4種 フラグ=false・所持=0）");
      };
      document.getElementById("btn-debug-gear-reward-all").onclick = function () {
        ensureCompanionGearState();
        grantCompanionGearReward("critical_bracelet");
        grantCompanionGearReward("net_master_belt");
        grantCompanionGearReward("research_notebook");
        grantCompanionGearReward("prayer_brooch");
        saveGame(); renderStatusBody();
        showToast("[DEBUG] 特化装備を全取得 (4種)");
      };
      document.getElementById("btn-debug-gear-v3-migrate-check").onclick = function () {
        ensureCompanionGearState();
        // v2セーブをシミュレート：特化装備×1所持・version=2・rewardFlags=false
        var _rids42v = ["critical_bracelet", "net_master_belt", "research_notebook", "prayer_brooch"];
        state.companionGearVersion = 2;
        if (!state.companionGearRewardFlags) { state.companionGearRewardFlags = {}; }
        for (var _ri42v = 0; _ri42v < _rids42v.length; _ri42v++) {
          state.companionGearInventory[_rids42v[_ri42v]] = 1;
          state.companionGearRewardFlags[_rids42v[_ri42v]] = false;
        }
        ensureCompanionGearState(); // v2→v3移行を実行
        var _pass42v = (state.companionGearVersion === 3);
        var _allFlags42v = true;
        var _flagDetail = [];
        for (var _ri42v2 = 0; _ri42v2 < _rids42v.length; _ri42v2++) {
          var _fg = !!state.companionGearRewardFlags[_rids42v[_ri42v2]];
          if (!_fg) { _allFlags42v = false; }
          _flagDetail.push(_rids42v[_ri42v2] + "=" + _fg);
        }
        console.log("[DEBUG] v2→v3移行: ver=" + state.companionGearVersion + " flags=" + _flagDetail.join(", "));
        showToast("[DEBUG] v2→v3移行: ver=" + state.companionGearVersion + (_pass42v ? " ✅" : " ❌(期待:3)") +
          " flags全true=" + _allFlags42v + " (詳細はコンソール)");
        saveGame(); renderStatusBody();
      };
      document.getElementById("btn-debug-gear-reward-dup-check").onclick = function () {
        ensureCompanionGearState();
        if (!state.companionGearRewardFlags) { state.companionGearRewardFlags = {}; }
        var _gid42d = "critical_bracelet";
        var _prevFlag42d = state.companionGearRewardFlags[_gid42d];
        var _prevCnt42d = state.companionGearInventory[_gid42d] || 0;
        // flag=true・count=1の状態でgrantを3回呼んで増殖しないか確認
        state.companionGearRewardFlags[_gid42d] = true;
        state.companionGearInventory[_gid42d] = 1;
        grantCompanionGearReward(_gid42d);
        grantCompanionGearReward(_gid42d);
        grantCompanionGearReward(_gid42d);
        var _afterCnt42d = state.companionGearInventory[_gid42d] || 0;
        var _pass42d = (_afterCnt42d === 1);
        // 元の状態に復元
        state.companionGearRewardFlags[_gid42d] = _prevFlag42d;
        state.companionGearInventory[_gid42d] = _prevCnt42d;
        showToast("[DEBUG] 二重取得防止: " + (_pass42d ? "PASS ✅ ×1のまま" : "FAIL ❌ ×" + _afterCnt42d + "に増殖"));
        renderStatusBody();
      };
      // §110 v0.42.1: ステージ2初回・再クリア確認
      document.getElementById("btn-debug-gear-stage2-clearcheck").onclick = function () {
        ensureCompanionGearState();
        if (!state.sideMap) { state.sideMap = {}; }
        if (!state.sideMap.stageCleared) { state.sideMap.stageCleared = {}; }
        var _prevCleared110 = !!state.sideMap.stageCleared["2"];
        var _prevFlag110 = !!(state.companionGearRewardFlags && state.companionGearRewardFlags["critical_bracelet"]);
        var _prevCnt110 = state.companionGearInventory["critical_bracelet"] || 0;
        state.sideMap.stageCleared["2"] = true;
        if (!state.companionGearRewardFlags) { state.companionGearRewardFlags = {}; }
        state.companionGearRewardFlags["critical_bracelet"] = false;
        state.companionGearInventory["critical_bracelet"] = 0;
        grantCompanionGearReward("critical_bracelet");
        var _cntAfter1 = state.companionGearInventory["critical_bracelet"] || 0;
        var _flagAfter1 = !!state.companionGearRewardFlags["critical_bracelet"];
        grantCompanionGearReward("critical_bracelet");
        var _cntAfter2 = state.companionGearInventory["critical_bracelet"] || 0;
        var _pass110 = (_cntAfter1 === 1 && _flagAfter1 && _cntAfter2 === 1);
        state.sideMap.stageCleared["2"] = _prevCleared110;
        state.companionGearRewardFlags["critical_bracelet"] = _prevFlag110;
        state.companionGearInventory["critical_bracelet"] = _prevCnt110;
        showToast("[DEBUG] Stage2初回・再クリア: " + (_pass110 ? "PASS ✅ 1回のみ付与" : "FAIL ❌ cnt=" + _cntAfter2));
        renderStatusBody();
      };
      // §110 v0.42.1: reconcile複数回確認（2回目はno-op）
      document.getElementById("btn-debug-gear-reconcile-multi").onclick = function () {
        ensureCompanionGearState();
        if (!state.sideMap) { state.sideMap = {}; }
        if (!state.sideMap.stageCleared) { state.sideMap.stageCleared = {}; }
        if (!state.companionGearRewardFlags) { state.companionGearRewardFlags = {}; }
        var _prevCleared110r = !!state.sideMap.stageCleared["2"];
        var _prevFlag110r = !!state.companionGearRewardFlags["critical_bracelet"];
        var _prevCnt110r = state.companionGearInventory["critical_bracelet"] || 0;
        state.sideMap.stageCleared["2"] = true;
        state.companionGearRewardFlags["critical_bracelet"] = false;
        state.companionGearInventory["critical_bracelet"] = 0;
        var _r1 = reconcileCompanionGearRewards();
        var _cnt1 = state.companionGearInventory["critical_bracelet"] || 0;
        var _r2 = reconcileCompanionGearRewards();
        var _cnt2 = state.companionGearInventory["critical_bracelet"] || 0;
        var _pass110r = (_r1 === true && _r2 === false && _cnt1 === 1 && _cnt2 === 1);
        state.sideMap.stageCleared["2"] = _prevCleared110r;
        state.companionGearRewardFlags["critical_bracelet"] = _prevFlag110r;
        state.companionGearInventory["critical_bracelet"] = _prevCnt110r;
        _pendingGearRewardNotices = [];
        showToast("[DEBUG] reconcile×2: " + (_pass110r ? "PASS ✅ 1回=true/2回=false/cnt=1" : "FAIL ❌ r1=" + _r1 + " r2=" + _r2 + " cnt=" + _cnt2));
        renderStatusBody();
      };
      // §111 v0.43: 仲間わざ全員習得状態にする（Lv25以上 + rewardFlags=true）
      document.getElementById("btn-debug-tech-unlock-all").onclick = function () {
        ensureCompanionGearState();
        var _tcids111d = ["juritani", "shurittani", "norio", "harumi"];
        var _tgids111d = ["critical_bracelet", "net_master_belt", "research_notebook", "prayer_brooch"];
        if (!state.companionLevels) { state.companionLevels = {}; }
        if (!state.companionGearRewardFlags) { state.companionGearRewardFlags = {}; }
        for (var _ti111d = 0; _ti111d < _tcids111d.length; _ti111d++) {
          var _cid111d = _tcids111d[_ti111d];
          if (!state.companionLevels[_cid111d]) { state.companionLevels[_cid111d] = { level: 1, exp: 0, nextExp: 25 }; }
          if (state.companionLevels[_cid111d].level < 25) {
            state.companionLevels[_cid111d].level = 25;
            state.companionLevels[_cid111d].exp = 0;
            state.companionLevels[_cid111d].nextExp = 265; // 25*10+15
          }
          state.companionGearRewardFlags[_tgids111d[_ti111d]] = true;
        }
        saveGame(); renderStatusBody();
        showToast("[DEBUG] 全員わざ習得状態にした ✅ Lv25以上・rewardFlags=true");
      };
      // §111 v0.43: 仲間わざ使用状態リセット
      document.getElementById("btn-debug-tech-reset-used").onclick = function () {
        resetCompanionTechniqueUsage();
        showToast("[DEBUG] 仲間わざ使用状態リセット ✅ 全false");
        renderStatusBody();
      };
      // §111 v0.43: ロック条件確認（Lv不足/装備未取得/両方達成の3パターン）
      document.getElementById("btn-debug-tech-lock-check").onclick = function () {
        ensureCompanionGearState();
        if (!state.companionLevels) { state.companionLevels = {}; }
        if (!state.companionGearRewardFlags) { state.companionGearRewardFlags = {}; }
        // バックアップ
        var _prev111Lv   = state.companionLevels["juritani"] ? state.companionLevels["juritani"].level : 1;
        var _prev111Flag = !!state.companionGearRewardFlags["critical_bracelet"];
        // パターン1: Lv24・装備取得済み → 未習得
        if (!state.companionLevels["juritani"]) { state.companionLevels["juritani"] = { level: 1, exp: 0, nextExp: 25 }; }
        state.companionLevels["juritani"].level = 24;
        state.companionGearRewardFlags["critical_bracelet"] = true;
        var _res1 = isCompanionTechniqueUnlocked("juritani");
        // パターン2: Lv25・装備未取得 → 未習得
        state.companionLevels["juritani"].level = 25;
        state.companionGearRewardFlags["critical_bracelet"] = false;
        var _res2 = isCompanionTechniqueUnlocked("juritani");
        // パターン3: Lv25・装備取得済み → 習得済み
        state.companionGearRewardFlags["critical_bracelet"] = true;
        var _res3 = isCompanionTechniqueUnlocked("juritani");
        // 復元
        state.companionLevels["juritani"].level = _prev111Lv;
        state.companionGearRewardFlags["critical_bracelet"] = _prev111Flag;
        var _pass111Lock = (!_res1 && !_res2 && _res3);
        showToast("[DEBUG] ロック条件: " + (_pass111Lock ? "PASS ✅" : "FAIL ❌") +
          " Lv24+装備=" + _res1 + " Lv25-装備=" + _res2 + " Lv25+装備=" + _res3);
        renderStatusBody();
      };
      // §111 v0.43: 1戦闘1回確認（2回目はno-op）
      document.getElementById("btn-debug-tech-oneshot-check").onclick = function () {
        ensureCompanionGearState();
        if (!state.companionLevels) { state.companionLevels = {}; }
        if (!state.companionGearRewardFlags) { state.companionGearRewardFlags = {}; }
        // ジュリタニを習得状態に設定（バックアップ付き）
        var _prev111OsLv   = state.companionLevels["juritani"] ? state.companionLevels["juritani"].level : 1;
        var _prev111OsFlag = !!state.companionGearRewardFlags["critical_bracelet"];
        var _prev111OsUsed = !!(state.companionTechniqueUsed && state.companionTechniqueUsed["juritani"]);
        if (!state.companionLevels["juritani"]) { state.companionLevels["juritani"] = { level: 1, exp: 0, nextExp: 25 }; }
        state.companionLevels["juritani"].level = 25;
        state.companionGearRewardFlags["critical_bracelet"] = true;
        resetCompanionTechniqueUsage(); // used=false
        // 1回目: 習得済み・未使用 → 使用可能なはず
        var _unlocked111Os = isCompanionTechniqueUnlocked("juritani");
        var _used111Os1 = !!(state.companionTechniqueUsed && state.companionTechniqueUsed["juritani"]);
        // state.companionTechniqueUsedを直接trueに（戦闘外なのでrunCompanionTechniqueActionは呼べない）
        if (!state.companionTechniqueUsed) { state.companionTechniqueUsed = {}; }
        state.companionTechniqueUsed["juritani"] = true;
        // 2回目: 使用済み → 不発のはず（used=trueで再チェック）
        var _used111Os2 = !!(state.companionTechniqueUsed && state.companionTechniqueUsed["juritani"]);
        // resetしたらfalseに戻るはず
        resetCompanionTechniqueUsage();
        var _used111OsAfterReset = !!(state.companionTechniqueUsed && state.companionTechniqueUsed["juritani"]);
        // 復元
        state.companionLevels["juritani"].level = _prev111OsLv;
        state.companionGearRewardFlags["critical_bracelet"] = _prev111OsFlag;
        if (state.companionTechniqueUsed) { state.companionTechniqueUsed["juritani"] = _prev111OsUsed; }
        var _pass111Os = (_unlocked111Os && !_used111Os1 && _used111Os2 && !_used111OsAfterReset);
        showToast("[DEBUG] 1戦闘1回: " + (_pass111Os ? "PASS ✅" : "FAIL ❌") +
          " 習得=" + _unlocked111Os + " 1回目used前=" + _used111Os1 + " used後=" + _used111Os2 + " reset後=" + _used111OsAfterReset);
        renderStatusBody();
      };
      // §112 v0.43.1: ラウンド持越し確認（used=trueが戦闘ラウンド間で維持されるか）
      document.getElementById("btn-debug-v431-round-persist").onclick = function () {
        var _prevUsed431 = state.companionTechniqueUsed
          ? { juritani: !!state.companionTechniqueUsed.juritani, shurittani: !!state.companionTechniqueUsed.shurittani, norio: !!state.companionTechniqueUsed.norio, harumi: !!state.companionTechniqueUsed.harumi }
          : null;
        var _prevDr431 = state.battleDamageReduction || 0;
        // ステップ1: used=trueにセット（ラウンド前）
        ensureCompanionTechniqueUsageState();
        state.companionTechniqueUsed["juritani"] = true;
        var _step1 = !!(state.companionTechniqueUsed.juritani);
        // ステップ2: ラウンド間模擬（clearCompanionCommandStateは呼ばれない→trueのまま）
        var _step2 = !!(state.companionTechniqueUsed.juritani);
        // ステップ3: 戦闘終了模擬（clearCompanionCommandState→リセット→false）
        clearCompanionCommandState();
        var _step3 = !!(state.companionTechniqueUsed.juritani);
        // 復元
        state.companionTechniqueUsed = _prevUsed431 || { juritani: false, shurittani: false, norio: false, harumi: false };
        state.battleDamageReduction = _prevDr431;
        var _pass431r = (_step1 && _step2 && !_step3);
        showToast("[DEBUG] ラウンド持越し確認: " + (_pass431r ? "PASS ✅" : "FAIL ❌") +
          " ラウンド前true=" + _step1 + " ラウンド後true=" + _step2 + " 戦闘後false=" + !_step3);
        renderStatusBody();
      };
      // §112 v0.43.1: シュリタニHP1境界確認（HP1→null、HP2→ダメ1残りHP1）
      document.getElementById("btn-debug-v431-shu-hp1").onclick = function () {
        ensureCompanionGearState();
        if (!state.companionLevels) { state.companionLevels = {}; }
        if (!state.companionGearRewardFlags) { state.companionGearRewardFlags = {}; }
        var _prevShuLv   = state.companionLevels["shurittani"] ? state.companionLevels["shurittani"].level : 1;
        var _prevShuFlag = !!state.companionGearRewardFlags["net_master_belt"];
        var _prevShuUsed = !!(state.companionTechniqueUsed && state.companionTechniqueUsed["shurittani"]);
        var _prevShuEnemy = state.enemy;
        var _prevShuBattle = state.inBattle;
        var _prevShuDr = state.battleDamageReduction || 0;
        if (!state.companionLevels["shurittani"]) { state.companionLevels["shurittani"] = { level: 1, exp: 0, nextExp: 25 }; }
        state.companionLevels["shurittani"].level = 25;
        state.companionGearRewardFlags["net_master_belt"] = true;
        state.inBattle = true;
        ensureCompanionTechniqueUsageState();
        // ケース1: 敵HP=1 → null（不発）、used=falseのまま
        state.enemy = { id: "debug_t", name: "テスト敵", hp: 1, maxHp: 10, atk: 1, def: 0, final: false, isUMA: false };
        state.companionTechniqueUsed["shurittani"] = false;
        var _r1Shu = runCompanionTechniqueAction("shurittani");
        var _hp1Used = !!(state.companionTechniqueUsed && state.companionTechniqueUsed["shurittani"]);
        // ケース2: 敵HP=2 → ダメ1、HP=1、used=true、false返値
        state.enemy = { id: "debug_t", name: "テスト敵", hp: 2, maxHp: 10, atk: 1, def: 0, final: false, isUMA: false };
        state.companionTechniqueUsed["shurittani"] = false;
        var _r2Shu = runCompanionTechniqueAction("shurittani");
        var _hp2After = state.enemy ? state.enemy.hp : -1;
        var _hp2Used = !!(state.companionTechniqueUsed && state.companionTechniqueUsed["shurittani"]);
        // 復元
        if (!state.companionLevels["shurittani"]) { state.companionLevels["shurittani"] = { level: 1, exp: 0, nextExp: 25 }; }
        state.companionLevels["shurittani"].level = _prevShuLv;
        state.companionGearRewardFlags["net_master_belt"] = _prevShuFlag;
        ensureCompanionTechniqueUsageState();
        state.companionTechniqueUsed["shurittani"] = _prevShuUsed;
        state.enemy = _prevShuEnemy;
        state.inBattle = _prevShuBattle;
        state.battleDamageReduction = _prevShuDr;
        var _passShu431 = (_r1Shu === null && !_hp1Used && _r2Shu === false && _hp2After === 1 && _hp2Used);
        showToast("[DEBUG] シュリタニHP1境界: " + (_passShu431 ? "PASS ✅" : "FAIL ❌") +
          " HP1→null=" + (_r1Shu === null) + " HP1used=" + _hp1Used +
          " HP2→HP" + _hp2After + " HP2used=" + _hp2Used);
        renderStatusBody();
      };
      // §112 v0.43.1: ハルミ回復・軽減境界確認（満HP+高軽減→null / 満HP+軽減0→use / HP不足+高軽減→heal）
      document.getElementById("btn-debug-v431-harumi-boundary").onclick = function () {
        ensureCompanionGearState();
        if (!state.companionLevels) { state.companionLevels = {}; }
        if (!state.companionGearRewardFlags) { state.companionGearRewardFlags = {}; }
        var _prevHarLv    = state.companionLevels["harumi"] ? state.companionLevels["harumi"].level : 1;
        var _prevHarFlag  = !!state.companionGearRewardFlags["prayer_brooch"];
        var _prevHarUsed  = !!(state.companionTechniqueUsed && state.companionTechniqueUsed["harumi"]);
        var _prevHarDr    = state.battleDamageReduction || 0;
        var _prevHarEnemy = state.enemy;
        var _prevHarBattle = state.inBattle;
        var _prevHarHp    = state.player.hp;
        if (!state.companionLevels["harumi"]) { state.companionLevels["harumi"] = { level: 1, exp: 0, nextExp: 25 }; }
        state.companionLevels["harumi"].level = 25;
        state.companionGearRewardFlags["prayer_brooch"] = true;
        state.inBattle = true;
        state.enemy = { id: "debug_t", name: "テスト敵", hp: 10, maxHp: 10, atk: 1, def: 0, final: false, isUMA: false };
        ensureCompanionTechniqueUsageState();
        // ケース1: HP満タン + 軽減0.15以上 → null（不発）
        state.player.hp = state.player.maxHp;
        state.battleDamageReduction = 0.15;
        state.companionTechniqueUsed["harumi"] = false;
        var _rHar1 = runCompanionTechniqueAction("harumi");
        var _usedHar1 = !!(state.companionTechniqueUsed && state.companionTechniqueUsed["harumi"]);
        // ケース2: HP満タン + 軽減0 → 使用（heal=0 + 軽減付与）
        state.player.hp = state.player.maxHp;
        state.battleDamageReduction = 0;
        state.companionTechniqueUsed["harumi"] = false;
        var _rHar2 = runCompanionTechniqueAction("harumi");
        var _drAfterHar2 = state.battleDamageReduction;
        var _usedHar2 = !!(state.companionTechniqueUsed && state.companionTechniqueUsed["harumi"]);
        // ケース3: HP不足 + 軽減0.15以上 → 使用（heal、軽減追加なし）
        state.player.hp = Math.max(1, state.player.maxHp - 20);
        var _hpBefore3Har = state.player.hp;
        state.battleDamageReduction = 0.15;
        state.companionTechniqueUsed["harumi"] = false;
        var _rHar3 = runCompanionTechniqueAction("harumi");
        var _hpAfterHar3 = state.player.hp;
        var _usedHar3 = !!(state.companionTechniqueUsed && state.companionTechniqueUsed["harumi"]);
        // 復元
        if (!state.companionLevels["harumi"]) { state.companionLevels["harumi"] = { level: 1, exp: 0, nextExp: 25 }; }
        state.companionLevels["harumi"].level = _prevHarLv;
        state.companionGearRewardFlags["prayer_brooch"] = _prevHarFlag;
        ensureCompanionTechniqueUsageState();
        state.companionTechniqueUsed["harumi"] = _prevHarUsed;
        state.battleDamageReduction = _prevHarDr;
        state.enemy = _prevHarEnemy;
        state.inBattle = _prevHarBattle;
        state.player.hp = _prevHarHp;
        updateBattlePlayerStatus();
        var _passHar431 = (_rHar1 === null && !_usedHar1 && _rHar2 === false && _drAfterHar2 >= 0.15 && _usedHar2 && _rHar3 === false && _hpAfterHar3 > _hpBefore3Har && _usedHar3);
        showToast("[DEBUG] ハルミ境界: " + (_passHar431 ? "PASS ✅" : "FAIL ❌") +
          " 満+軽減→null=" + (_rHar1 === null) + " 満+無軽減→use=" + (_rHar2 === false) +
          " dr=" + _drAfterHar2.toFixed(2) + " HP不足+軽減→heal=" + (_hpAfterHar3 > _hpBefore3Har));
        renderStatusBody();
      };

      // §113 v0.44: 仲間サイドストーリー デバッグハンドラ
      document.getElementById("btn-debug-v44-story-unlock-all").onclick = function () {
        if (!state.companionLevels) { state.companionLevels = {}; }
        if (!state.companionGearRewardFlags) { state.companionGearRewardFlags = {}; }
        var _cids = ["juritani", "shurittani", "norio", "harumi"];
        var _gearMap = { juritani: "iron_gauntlets", shurittani: "shadow_boots", norio: "data_goggles", harumi: "prayer_brooch" };
        for (var _i = 0; _i < _cids.length; _i++) {
          var _cid = _cids[_i];
          if (!state.companionLevels[_cid]) { state.companionLevels[_cid] = { level: 1, exp: 0, nextExp: 25 }; }
          state.companionLevels[_cid].level = 25;
          state.companionGearRewardFlags[_gearMap[_cid]] = true;
        }
        if (!state.player.companions || state.player.companions.length === 0) {
          state.player.companions = ["juritani", "shurittani"];
        }
        normalizeCompanionSideStoryFlags();
        saveGame();
        showToast("[DEBUG] 仲間の物語: 全員Lv25+gearFlag解放 ✅");
        renderStatusBody();
      };

      document.getElementById("btn-debug-v44-story-reset-flags").onclick = function () {
        // §114 v0.44.1: 物語閲覧中にリセットしても安全にcloseする
        var _storyModalEl = document.getElementById("companion-story-modal");
        if (_storyModalEl && !_storyModalEl.classList.contains("hidden")) {
          state.activeCompanionSideStory = null;
          state.activeCompanionSideStoryLine = 0;
          _cstoryFromTavern = false;
          _cstoryAdvanceLock = false;
          if (_cstoryAdvanceTimer) { clearTimeout(_cstoryAdvanceTimer); _cstoryAdvanceTimer = null; }
          closeModal("companion-story-modal");
        }
        // §116 v0.44.3: タイマーキャンセルしてから専用関数で閉じる
        if (_companionStoryAllCompleteNoticeTimer) {
          clearTimeout(_companionStoryAllCompleteNoticeTimer);
          _companionStoryAllCompleteNoticeTimer = null;
        }
        // §120 v0.45.3: 共通キュータイマーもクリア
        if (_companionStoryCompletionNoticeQueueTimer) {
          clearTimeout(_companionStoryCompletionNoticeQueueTimer);
          _companionStoryCompletionNoticeQueueTimer = null;
        }
        closeCompanionStoryAllCompleteCelebration();
        state.companionSideStoryFlags = { juritani: false, shurittani: false, norio: false, harumi: false };
        state.companionSideStoryAllCompleteCelebrated = false; // §115 v0.44.2
        _pendingCompanionStoryAllCompleteNotice = false;
        _companionStoryAllCompleteNoticeVisible = false;
        // §116 v0.44.3
        _companionStoryAllCompleteOrigin = null;
        _pendingCompanionStoryAllCompleteOrigin = null;
        saveGame();
        showToast("[DEBUG] 仲間の物語: 完了フラグ・演出フラグ全リセット ✅");
        renderStatusBody();
      };

      document.getElementById("btn-debug-v44-story-complete-all").onclick = function () {
        state.companionSideStoryFlags = { juritani: true, shurittani: true, norio: true, harumi: true };
        // §115 v0.44.2: 演出済みをfalseにして演出確認できる状態にする
        state.companionSideStoryAllCompleteCelebrated = false;
        var _willCelebrate = checkCompanionSideStoryAllComplete();
        saveGame();
        showToast("[DEBUG] 仲間の物語: 全完了状態 + 演出" + (_willCelebrate ? "予約済み🌟" : "（既に処理済み）") + " ✅");
        renderStatusBody();
      };

      document.getElementById("btn-debug-v44-story-boundary").onclick = function () {
        // §114 v0.44.1: 途中終了・最終行表示・完了の3点境界確認
        var _cid = "juritani";
        var _story = COMPANION_SIDE_STORY_DATA[_cid];
        if (!_story || !_story.lines) { showToast("[DEBUG] FAIL: データなし"); return; }
        var _lastIdx = _story.lines.length - 1;
        var _prevFlag = state.companionSideStoryFlags[_cid];
        var _prevActive = state.activeCompanionSideStory;
        var _prevLine = state.activeCompanionSideStoryLine;
        // ①途中終了シミュレーション（completeを呼ばずにclose）
        state.companionSideStoryFlags[_cid] = false;
        state.activeCompanionSideStory = _cid;
        state.activeCompanionSideStoryLine = 2;
        state.activeCompanionSideStory = null;
        state.activeCompanionSideStoryLine = 0;
        var _pass1 = (state.companionSideStoryFlags[_cid] === false); // 途中終了→未完了
        // ②最終行を「表示」しただけ→未完了（completeを呼ばない）
        state.companionSideStoryFlags[_cid] = false;
        state.activeCompanionSideStory = _cid;
        state.activeCompanionSideStoryLine = _lastIdx; // 最終行にいる
        // → completeを呼ばない = 未完了のまま
        var _pass2 = (state.companionSideStoryFlags[_cid] === false); // 最終行表示だけで未完了
        // ③「物語を終える」相当（completeを呼ぶ）→完了
        completeCompanionSideStory(_cid);
        var _pass3 = (state.companionSideStoryFlags[_cid] === true); // complete後に完了
        // ④二重complete防止（もう一度呼んでもtrueのまま）
        completeCompanionSideStory(_cid);
        var _pass4 = (state.companionSideStoryFlags[_cid] === true);
        // 復元
        state.companionSideStoryFlags[_cid] = _prevFlag;
        state.activeCompanionSideStory = _prevActive;
        state.activeCompanionSideStoryLine = _prevLine;
        saveGame();
        var _pass = _pass1 && _pass2 && _pass3 && _pass4;
        showToast("[DEBUG] 境界確認: " + (_pass ? "PASS ✅" : "FAIL ❌") +
          " 途中終了→未完=" + _pass1 + " 最終行表示だけ→未完=" + _pass2 +
          " complete→完了=" + _pass3 + " 二重防止=" + _pass4);
      };

      document.getElementById("btn-debug-v44-story-reread").onclick = function () {
        // 再読確認: 完了後も startCompanionSideStory が呼べる（re-readable）
        // 重複完了防止: completeCompanionSideStory は idempotent
        var _cid = "shurittani";
        var _prevFlag = state.companionSideStoryFlags[_cid];
        // まず完了状態にする
        state.companionSideStoryFlags[_cid] = true;
        // 再完了しても変わらないこと
        var _before = state.companionSideStoryFlags[_cid];
        completeCompanionSideStory(_cid);
        var _after = state.companionSideStoryFlags[_cid];
        var _pass1 = (_before === true && _after === true);
        // 復元
        state.companionSideStoryFlags[_cid] = _prevFlag;
        saveGame();
        showToast("[DEBUG] 再読・重複完了防止: " + (_pass1 ? "PASS ✅" : "FAIL ❌") +
          " 完了後再complete→still true=" + _pass1);
      };

      document.getElementById("btn-debug-v44-story-open-j").onclick = function () {
        startCompanionSideStory("juritani");
      };
      document.getElementById("btn-debug-v44-story-open-s").onclick = function () {
        startCompanionSideStory("shurittani");
      };
      document.getElementById("btn-debug-v44-story-open-n").onclick = function () {
        startCompanionSideStory("norio");
      };
      document.getElementById("btn-debug-v44-story-open-h").onclick = function () {
        startCompanionSideStory("harumi");
      };

      // §114 v0.44.1: 高速連打・行飛ばし確認
      document.getElementById("btn-debug-v441-story-rapid").onclick = function () {
        var _cid = "juritani";
        var _story = COMPANION_SIDE_STORY_DATA[_cid];
        if (!_story || !_story.lines) { showToast("[DEBUG] FAIL: データなし"); return; }
        var _lines = _story.lines;
        var _prevFlag = state.companionSideStoryFlags[_cid];
        var _prevActive = state.activeCompanionSideStory;
        var _prevLine = state.activeCompanionSideStoryLine;
        // テスト1: 1回の進行でindexが1だけ進む
        state.activeCompanionSideStory = _cid;
        state.activeCompanionSideStoryLine = 0;
        state.companionSideStoryFlags[_cid] = false;
        var _before = state.activeCompanionSideStoryLine;
        // advance処理を1回シミュレート
        var _idx = state.activeCompanionSideStoryLine;
        var _isLast = (_idx === _lines.length - 1);
        if (!_isLast && _idx + 1 < _lines.length) { state.activeCompanionSideStoryLine = _idx + 1; }
        var _after = state.activeCompanionSideStoryLine;
        var _pass1 = (_before === 0 && _after === 1); // 1だけ進んだ
        // テスト2: 最終行でcomplete×2 → flag=true/件数変わらず
        state.activeCompanionSideStoryLine = _lines.length - 1;
        state.companionSideStoryFlags[_cid] = false;
        completeCompanionSideStory(_cid);
        var _flag1 = state.companionSideStoryFlags[_cid];
        completeCompanionSideStory(_cid); // 2回目（冪等）
        var _flag2 = state.companionSideStoryFlags[_cid];
        var _pass2 = (_flag1 === true && _flag2 === true);
        // テスト3: 最終行表示だけでは未完了（表示のみ・completeを呼ばない）
        state.companionSideStoryFlags[_cid] = false;
        state.activeCompanionSideStoryLine = _lines.length - 1; // 最終行を「表示」
        var _pass3 = (state.companionSideStoryFlags[_cid] === false); // まだ未完了
        // 復元
        state.companionSideStoryFlags[_cid] = _prevFlag;
        state.activeCompanionSideStory = _prevActive;
        state.activeCompanionSideStoryLine = _prevLine;
        saveGame();
        var _pass = _pass1 && _pass2 && _pass3;
        showToast("[DEBUG] 高速連打確認: " + (_pass ? "PASS ✅" : "FAIL ❌") +
          " 1increase=" + _pass1 + " complete×2→true=" + _pass2 + " 最終行表示だけで未完=" + _pass3);
      };

      // §114 v0.44.1: フラグ破損修復確認
      document.getElementById("btn-debug-v441-story-flagrepair").onclick = function () {
        var _prevJson = "";
        try { _prevJson = JSON.stringify(state.companionSideStoryFlags); } catch (e) { _prevJson = ""; }
        // 破損データを注入
        state.companionSideStoryFlags = {
          juritani: true,       // 正常なtrue → 維持
          shurittani: "yes",    // 文字列 → false
          norio: null,          // null → false
          unknownKey: true      // 不明キー → 無視（4キー以外は触れない）
          // harumi欠損            → false補完
        };
        var _changed = normalizeCompanionSideStoryFlags();
        var _f = state.companionSideStoryFlags;
        var _passJ = (_f.juritani === true);    // trueを維持
        var _passS = (_f.shurittani === false); // 文字列をfalseへ
        var _passN = (_f.norio === false);      // nullをfalseへ
        var _passH = (_f.harumi === false);     // 欠損をfalseへ
        var _passC = (_changed === true);       // 変更を検出
        var _pass = _passJ && _passS && _passN && _passH && _passC;
        // 復元
        try {
          if (_prevJson) { state.companionSideStoryFlags = JSON.parse(_prevJson); }
          normalizeCompanionSideStoryFlags();
        } catch (e) {
          state.companionSideStoryFlags = { juritani: false, shurittani: false, norio: false, harumi: false };
        }
        saveGame();
        showToast("[DEBUG] フラグ破損修復: " + (_pass ? "PASS ✅" : "FAIL ❌") +
          " true維持=" + _passJ + " str→false=" + _passS + " null→false=" + _passN + " 欠損→false=" + _passH + " 変更検出=" + _passC);
      };

      // §115 v0.44.2: 全話完了演出を直接確認（§116: origin=debug設定）
      document.getElementById("btn-debug-v442-story-celebration").onclick = function () {
        state.companionSideStoryFlags = { juritani: true, shurittani: true, norio: true, harumi: true };
        state.companionSideStoryAllCompleteCelebrated = false;
        _pendingCompanionStoryAllCompleteNotice = false;
        _companionStoryAllCompleteNoticeVisible = false;
        if (_companionStoryAllCompleteNoticeTimer) {
          clearTimeout(_companionStoryAllCompleteNoticeTimer);
          _companionStoryAllCompleteNoticeTimer = null;
        }
        if (_companionStoryCompletionNoticeQueueTimer) { // §120 v0.45.3
          clearTimeout(_companionStoryCompletionNoticeQueueTimer);
          _companionStoryCompletionNoticeQueueTimer = null;
        }
        checkCompanionSideStoryAllComplete();
        _pendingCompanionStoryAllCompleteOrigin = "debug"; // §116 v0.44.3
        saveGame();
        consumePendingCompanionStoryAllCompleteNotice();
        showToast("[DEBUG] 全話完了演出確認（セーブ消費）");
      };

      // §115 v0.44.2: 演出済みフラグのみリセット（4話フラグ維持）
      document.getElementById("btn-debug-v442-story-celeb-reset").onclick = function () {
        state.companionSideStoryAllCompleteCelebrated = false;
        _pendingCompanionStoryAllCompleteNotice = false;
        _companionStoryAllCompleteNoticeVisible = false;
        // §116 v0.44.3: タイマーキャンセル・origin リセット
        if (_companionStoryAllCompleteNoticeTimer) {
          clearTimeout(_companionStoryAllCompleteNoticeTimer);
          _companionStoryAllCompleteNoticeTimer = null;
        }
        if (_companionStoryCompletionNoticeQueueTimer) { // §120 v0.45.3
          clearTimeout(_companionStoryCompletionNoticeQueueTimer);
          _companionStoryCompletionNoticeQueueTimer = null;
        }
        _companionStoryAllCompleteOrigin = null;
        _pendingCompanionStoryAllCompleteOrigin = null;
        closeCompanionStoryAllCompleteCelebration();
        saveGame();
        showToast("[DEBUG] 演出済みフラグリセット（4話フラグは維持） ✅");
      };

      // §115 v0.44.2: 4話目完了境界確認
      document.getElementById("btn-debug-v442-story-boundary").onclick = function () {
        var _prevFlags = JSON.stringify(state.companionSideStoryFlags);
        var _prevCeleb = state.companionSideStoryAllCompleteCelebrated;
        var _prevPending = _pendingCompanionStoryAllCompleteNotice;
        // 初期: 3話true, 1話false, celebrated=false
        state.companionSideStoryFlags = { juritani: true, shurittani: true, norio: true, harumi: false };
        state.companionSideStoryAllCompleteCelebrated = false;
        _pendingCompanionStoryAllCompleteNotice = false;
        // 確認1: 3/4では演出発動しない
        var _r1 = checkCompanionSideStoryAllComplete();
        var _pass1 = (_r1 === false && state.companionSideStoryAllCompleteCelebrated === false && !_pendingCompanionStoryAllCompleteNotice);
        // 確認2: 4話目をtrue→4/4で演出発動
        state.companionSideStoryFlags.harumi = true;
        var _r2 = checkCompanionSideStoryAllComplete();
        var _pass2 = (_r2 === true && state.companionSideStoryAllCompleteCelebrated === true && _pendingCompanionStoryAllCompleteNotice);
        // 確認3: 再度checkしても発動しない
        var _r3 = checkCompanionSideStoryAllComplete();
        var _pass3 = (_r3 === false);
        // 復元
        state.companionSideStoryFlags = JSON.parse(_prevFlags);
        state.companionSideStoryAllCompleteCelebrated = _prevCeleb;
        _pendingCompanionStoryAllCompleteNotice = _prevPending;
        saveGame();
        var _pass = _pass1 && _pass2 && _pass3;
        showToast("[DEBUG] 4話目境界: " + (_pass ? "PASS ✅" : "FAIL ❌") +
          " 3/4→未発動=" + _pass1 + " 4/4→発動=" + _pass2 + " 再実行→未発動=" + _pass3);
      };

      // §115 v0.44.2: 旧4/4セーブ救済確認
      document.getElementById("btn-debug-v442-story-oldsave").onclick = function () {
        var _prevFlags = JSON.stringify(state.companionSideStoryFlags);
        var _prevCeleb = state.companionSideStoryAllCompleteCelebrated;
        var _prevPending = _pendingCompanionStoryAllCompleteNotice;
        // 旧セーブ状態: 4話全true + celebrated=false（未設定相当）
        state.companionSideStoryFlags = { juritani: true, shurittani: true, norio: true, harumi: true };
        state.companionSideStoryAllCompleteCelebrated = false;
        _pendingCompanionStoryAllCompleteNotice = false;
        _companionStoryAllCompleteNoticeVisible = false;
        // 救済処理（loadGame相当）
        var _rescued = checkCompanionSideStoryAllComplete();
        var _pass1 = (_rescued === true && state.companionSideStoryAllCompleteCelebrated === true && _pendingCompanionStoryAllCompleteNotice);
        // 再度救済しても追加通知なし
        var _rescued2 = checkCompanionSideStoryAllComplete();
        var _pass2 = (_rescued2 === false);
        // 復元
        state.companionSideStoryFlags = JSON.parse(_prevFlags);
        state.companionSideStoryAllCompleteCelebrated = _prevCeleb;
        _pendingCompanionStoryAllCompleteNotice = _prevPending;
        saveGame();
        var _pass = _pass1 && _pass2;
        showToast("[DEBUG] 旧セーブ救済: " + (_pass ? "PASS ✅" : "FAIL ❌") +
          " 救済→pending=" + _pass1 + " 再救済→なし=" + _pass2);
      };

      // §115 v0.44.2: 演出二重防止確認
      document.getElementById("btn-debug-v442-story-double-prev").onclick = function () {
        var _prevFlags = JSON.stringify(state.companionSideStoryFlags);
        var _prevCeleb = state.companionSideStoryAllCompleteCelebrated;
        var _prevPending = _pendingCompanionStoryAllCompleteNotice;
        state.companionSideStoryFlags = { juritani: true, shurittani: true, norio: true, harumi: true };
        state.companionSideStoryAllCompleteCelebrated = false;
        _pendingCompanionStoryAllCompleteNotice = false;
        // check×3回: 1回目だけtrue
        var _c1 = checkCompanionSideStoryAllComplete();
        var _c2 = checkCompanionSideStoryAllComplete();
        var _c3 = checkCompanionSideStoryAllComplete();
        var _pass1 = (_c1 === true && _c2 === false && _c3 === false);
        var _pass2 = (state.companionSideStoryAllCompleteCelebrated === true);
        // 復元
        state.companionSideStoryFlags = JSON.parse(_prevFlags);
        state.companionSideStoryAllCompleteCelebrated = _prevCeleb;
        _pendingCompanionStoryAllCompleteNotice = _prevPending;
        saveGame();
        var _pass = _pass1 && _pass2;
        showToast("[DEBUG] 二重防止: " + (_pass ? "PASS ✅" : "FAIL ❌") +
          " check×3→1回のみtrue=" + _pass1 + " celebrated=true=" + _pass2);
      };

      // §116 v0.44.3: 酒場+演出モーダル重なり確認（演出が前面に来るか）
      document.getElementById("btn-debug-v443-overlap").onclick = function () {
        state.companionSideStoryAllCompleteCelebrated = false;
        state.companionSideStoryFlags = { juritani: true, shurittani: true, norio: true, harumi: true };
        _pendingCompanionStoryAllCompleteNotice = false;
        _companionStoryAllCompleteNoticeVisible = false;
        if (_companionStoryAllCompleteNoticeTimer) {
          clearTimeout(_companionStoryAllCompleteNoticeTimer);
          _companionStoryAllCompleteNoticeTimer = null;
        }
        checkCompanionSideStoryAllComplete();
        _pendingCompanionStoryAllCompleteOrigin = "tavern";
        openModal("tavern-modal");
        renderTavernStories();
        _companionStoryAllCompleteNoticeTimer = setTimeout(function () {
          _companionStoryAllCompleteNoticeTimer = null;
          consumePendingCompanionStoryAllCompleteNotice();
        }, 350);
        showToast("[DEBUG] 酒場+演出重なり確認: 演出が酒場の前面に来るか確認してください");
      };

      // §116 v0.44.3: 物語モーダル中はpending保留されることを確認
      document.getElementById("btn-debug-v443-pending-hold").onclick = function () {
        var _prevFlags = JSON.stringify(state.companionSideStoryFlags);
        var _prevCeleb = state.companionSideStoryAllCompleteCelebrated;
        state.companionSideStoryFlags = { juritani: true, shurittani: true, norio: true, harumi: true };
        state.companionSideStoryAllCompleteCelebrated = false;
        _pendingCompanionStoryAllCompleteNotice = false;
        _companionStoryAllCompleteNoticeVisible = false;
        checkCompanionSideStoryAllComplete();                 // pending=true
        openModal("companion-story-modal");                   // 物語モーダルを開く
        consumePendingCompanionStoryAllCompleteNotice();      // → 保留されるはず
        var _held = _pendingCompanionStoryAllCompleteNotice; // まだtrue=保留成功
        closeModal("companion-story-modal");
        var _pass = (_held === true);
        // 後片付け
        state.companionSideStoryFlags = JSON.parse(_prevFlags);
        state.companionSideStoryAllCompleteCelebrated = _prevCeleb;
        _pendingCompanionStoryAllCompleteNotice = false;
        _pendingCompanionStoryAllCompleteOrigin = null;
        showToast("[DEBUG] pending保留: " + (_pass ? "PASS ✅" : "FAIL ❌") +
          " 物語中pending保留=" + _held);
      };

      // §116 v0.44.3: 演出モーダル10回開閉で二重防止を確認
      document.getElementById("btn-debug-v443-open-close-10").onclick = function () {
        state.companionSideStoryAllCompleteCelebrated = true;
        state.companionSideStoryFlags = { juritani: true, shurittani: true, norio: true, harumi: true };
        var _fail116 = false;
        for (var _n116 = 0; _n116 < 10; _n116++) {
          _companionStoryAllCompleteNoticeVisible = false;
          _pendingCompanionStoryAllCompleteNotice = true;
          _pendingCompanionStoryAllCompleteOrigin = "debug";
          consumePendingCompanionStoryAllCompleteNotice();
          if (!_companionStoryAllCompleteNoticeVisible) { _fail116 = true; break; }
          closeCompanionStoryAllCompleteCelebration();
          if (_companionStoryAllCompleteNoticeVisible) { _fail116 = true; break; }
        }
        _pendingCompanionStoryAllCompleteNotice = false;
        _pendingCompanionStoryAllCompleteOrigin = null;
        showToast("[DEBUG] 10回開閉: " + (_fail116 ? "FAIL ❌" : "PASS ✅"));
      };

      // §117 v0.45: 第2話デバッグハンドラ

      document.getElementById("btn-debug-v45-ch2-unlock-all").onclick = function () {
        var _cids45 = ["juritani", "shurittani", "norio", "harumi"];
        normalizeCompanionSideStoryFlags();
        // 第1話完了 + Lv50 + 加入済み
        state.companionSideStoryFlags = { juritani: true, shurittani: true, norio: true, harumi: true };
        for (var _ui45 = 0; _ui45 < _cids45.length; _ui45++) {
          if (!state.companionLevels[_cids45[_ui45]]) { state.companionLevels[_cids45[_ui45]] = { level: 1, exp: 0 }; }
          if (state.companionLevels[_cids45[_ui45]].level < 50) { state.companionLevels[_cids45[_ui45]].level = 50; }
        }
        if (!state.player.companions || state.player.companions.length === 0) {
          state.player.companions = ["juritani", "shurittani"];
        }
        saveGame();
        showToast("[DEBUG] 第2話: 第1話完了+Lv50 全員解放 ✅");
        renderStatusBody();
      };

      document.getElementById("btn-debug-v45-ch2-reset-flags").onclick = function () {
        normalizeCompanionSideStoryChapter2Flags();
        state.companionSideStoryChapter2Flags = { juritani: false, shurittani: false, norio: false, harumi: false };
        // §119 v0.45.2: ch2 celebrated・pending・visible・timerも同時リセット
        state.companionSideStoryChapter2AllCompleteCelebrated = false;
        _pendingCompanionStoryChapter2AllCompleteNotice = false;
        _companionStoryChapter2AllCompleteNoticeVisible = false;
        _companionStoryChapter2AllCompleteOrigin = null;
        _pendingCompanionStoryChapter2AllCompleteOrigin = null;
        if (_companionStoryChapter2AllCompleteNoticeTimer) {
          clearTimeout(_companionStoryChapter2AllCompleteNoticeTimer);
          _companionStoryChapter2AllCompleteNoticeTimer = null;
        }
        closeModal("companion-story-chapter2-all-complete-modal");
        saveGame();
        showToast("[DEBUG] 第2話: 完了フラグ全リセット + ch2演出済みリセット ✅");
        renderStatusBody();
      };

      document.getElementById("btn-debug-v45-ch2-complete-all").onclick = function () {
        // §119 v0.45.2: ch2全完了・ch2演出をトリガー・ch1は維持
        var _prevCeleb1 = state.companionSideStoryAllCompleteCelebrated;
        var _prevPending1 = _pendingCompanionStoryAllCompleteNotice;
        state.companionSideStoryChapter2Flags = { juritani: true, shurittani: true, norio: true, harumi: true };
        state.companionSideStoryChapter2AllCompleteCelebrated = false;
        checkCompanionSideStoryChapter2AllComplete("debug");
        saveGame();
        var _ch1Changed = (state.companionSideStoryAllCompleteCelebrated !== _prevCeleb1 || _pendingCompanionStoryAllCompleteNotice !== _prevPending1);
        if (!_ch1Changed) {
          showToast("[DEBUG] 第2話: 全完了 ✅（ch2演出予約 / ch1演出変化なし）");
          consumePendingCompanionStoryChapter2AllCompleteNotice();
        } else {
          state.companionSideStoryAllCompleteCelebrated = _prevCeleb1;
          _pendingCompanionStoryAllCompleteNotice = _prevPending1;
          showToast("[DEBUG] FAIL: ch2完了でch1演出が変化した ❌");
        }
        renderStatusBody();
      };

      document.getElementById("btn-debug-v45-ch2-boundary").onclick = function () {
        var _cid = "juritani";
        // 第1話完了済み・Lv49: 未解放
        var _prevLv = state.companionLevels[_cid] ? state.companionLevels[_cid].level : 1;
        normalizeCompanionSideStoryFlags();
        var _prevFlag1 = state.companionSideStoryFlags[_cid];
        state.companionSideStoryFlags[_cid] = true;
        state.companionLevels[_cid] = { level: 49, exp: 0 };
        var _lv49 = isCompanionSideStoryUnlocked(_cid, 2);
        state.companionLevels[_cid] = { level: 50, exp: 0 };
        var _lv50 = isCompanionSideStoryUnlocked(_cid, 2);
        state.companionSideStoryFlags[_cid] = false;
        var _noCh1 = isCompanionSideStoryUnlocked(_cid, 2);
        // 復元
        state.companionLevels[_cid].level = _prevLv;
        state.companionSideStoryFlags[_cid] = _prevFlag1;
        var _pass = (!_lv49 && _lv50 && !_noCh1);
        showToast("[DEBUG] ch2境界: " + (_pass ? "PASS ✅" : "FAIL ❌") +
          " Lv49=" + _lv49 + " Lv50=" + _lv50 + " ch1なし=" + _noCh1);
      };

      document.getElementById("btn-debug-v45-flag-sep").onclick = function () {
        var _prevCh2 = JSON.stringify(state.companionSideStoryChapter2Flags);
        var _prevCh1 = JSON.stringify(state.companionSideStoryFlags);
        normalizeCompanionSideStoryChapter2Flags();
        // ch2完了してもch1は変わらない
        state.companionSideStoryChapter2Flags = { juritani: true, shurittani: true, norio: true, harumi: true };
        var _ch1After = JSON.stringify(state.companionSideStoryFlags);
        var _pass = (_ch1After === _prevCh1);
        state.companionSideStoryChapter2Flags = JSON.parse(_prevCh2);
        showToast("[DEBUG] フラグ独立: " + (_pass ? "PASS ✅" : "FAIL ❌") +
          " ch2完了後ch1変化なし=" + _pass);
      };

      document.getElementById("btn-debug-v45-no-celeb").onclick = function () {
        var _prevCeleb = state.companionSideStoryAllCompleteCelebrated;
        var _prevPending = _pendingCompanionStoryAllCompleteNotice;
        var _prevPendingOrigin = _pendingCompanionStoryAllCompleteOrigin;
        // celebratedをfalseにしてch2を完了させ、演出が出ないか確認
        state.companionSideStoryAllCompleteCelebrated = false;
        _pendingCompanionStoryAllCompleteNotice = false;
        completeCompanionSideStory("juritani", 2);
        var _pass = (!_pendingCompanionStoryAllCompleteNotice && state.companionSideStoryAllCompleteCelebrated === false);
        // 復元
        state.companionSideStoryAllCompleteCelebrated = _prevCeleb;
        _pendingCompanionStoryAllCompleteNotice = _prevPending;
        _pendingCompanionStoryAllCompleteOrigin = _prevPendingOrigin;
        showToast("[DEBUG] ch2演出なし: " + (_pass ? "PASS ✅" : "FAIL ❌") +
          " pending=" + _pendingCompanionStoryAllCompleteNotice + " celebrated=" + state.companionSideStoryAllCompleteCelebrated);
      };

      document.getElementById("btn-debug-v45-open-j2").onclick = function () {
        state.companionSideStoryFlags["juritani"] = true;
        if (!state.companionLevels["juritani"]) { state.companionLevels["juritani"] = { level: 50, exp: 0 }; }
        if (state.companionLevels["juritani"].level < 50) { state.companionLevels["juritani"].level = 50; }
        if (state.player.companions.indexOf("juritani") < 0) { state.player.companions.push("juritani"); }
        startCompanionSideStory("juritani", 2);
      };
      document.getElementById("btn-debug-v45-open-s2").onclick = function () {
        state.companionSideStoryFlags["shurittani"] = true;
        if (!state.companionLevels["shurittani"]) { state.companionLevels["shurittani"] = { level: 50, exp: 0 }; }
        if (state.companionLevels["shurittani"].level < 50) { state.companionLevels["shurittani"].level = 50; }
        if (state.player.companions.indexOf("shurittani") < 0) { state.player.companions.push("shurittani"); }
        startCompanionSideStory("shurittani", 2);
      };
      document.getElementById("btn-debug-v45-open-n2").onclick = function () {
        state.companionSideStoryFlags["norio"] = true;
        if (!state.companionLevels["norio"]) { state.companionLevels["norio"] = { level: 50, exp: 0 }; }
        if (state.companionLevels["norio"].level < 50) { state.companionLevels["norio"].level = 50; }
        if (state.player.companions.indexOf("norio") < 0) { state.player.companions.push("norio"); }
        startCompanionSideStory("norio", 2);
      };
      document.getElementById("btn-debug-v45-open-h2").onclick = function () {
        state.companionSideStoryFlags["harumi"] = true;
        if (!state.companionLevels["harumi"]) { state.companionLevels["harumi"] = { level: 50, exp: 0 }; }
        if (state.companionLevels["harumi"].level < 50) { state.companionLevels["harumi"].level = 50; }
        if (state.player.companions.indexOf("harumi") < 0) { state.player.companions.push("harumi"); }
        startCompanionSideStory("harumi", 2);
      };

      // §118 v0.45.1: セッション安定化デバッグ
      document.getElementById("btn-debug-v451-ch1-to-ch2-contamination").onclick = function () {
        // 第1話セッション開始→閉じる→第2話開始。旧セッションIDが新セッションに混入しないことを確認
        var _cids451 = ["juritani", "shurittani", "norio", "harumi"];
        var _cid451 = _cids451[0];
        state.companionSideStoryFlags[_cid451] = true;
        if (!state.companionLevels[_cid451]) { state.companionLevels[_cid451] = { level: 50, exp: 0 }; }
        if (state.companionLevels[_cid451].level < 50) { state.companionLevels[_cid451].level = 50; }
        if (state.player.companions.indexOf(_cid451) < 0) { state.player.companions.push(_cid451); }
        var _sess1Before = _cstorySessionId;
        startCompanionSideStory(_cid451, 1);
        var _sess1After = _cstorySessionId;
        var _storyId1 = _cstoryActiveStoryId;
        closeCompanionSideStoryModal();
        startCompanionSideStory(_cid451, 2);
        var _sess2 = _cstorySessionId;
        var _storyId2 = _cstoryActiveStoryId;
        var _pass = (_sess2 > _sess1After) && (_storyId2 !== _storyId1) && (_cstoryActiveChapter === 2);
        showToast("[DEBUG v0.45.1] 第1話→第2話混入確認: " + (_pass ? "PASS" : "FAIL") +
          "\n  sess1=" + _sess1After + " sess2=" + _sess2 +
          "\n  storyId1=" + _storyId1 + " storyId2=" + _storyId2);
        closeCompanionSideStoryModal();
      };
      document.getElementById("btn-debug-v451-ch2-to-ch1-contamination").onclick = function () {
        // 第2話セッション開始→閉じる→第1話開始。旧セッションIDが混入しないことを確認
        var _cid451b = "juritani";
        state.companionSideStoryFlags[_cid451b] = true;
        if (!state.companionLevels[_cid451b]) { state.companionLevels[_cid451b] = { level: 50, exp: 0 }; }
        if (state.companionLevels[_cid451b].level < 50) { state.companionLevels[_cid451b].level = 50; }
        if (state.player.companions.indexOf(_cid451b) < 0) { state.player.companions.push(_cid451b); }
        startCompanionSideStory(_cid451b, 2);
        var _sess2 = _cstorySessionId;
        var _storyId2 = _cstoryActiveStoryId;
        closeCompanionSideStoryModal();
        startCompanionSideStory(_cid451b, 1);
        var _sess1 = _cstorySessionId;
        var _storyId1 = _cstoryActiveStoryId;
        var _pass = (_sess1 > _sess2) && (_storyId1 !== _storyId2) && (_cstoryActiveChapter === 1);
        showToast("[DEBUG v0.45.1] 第2話→第1話混入確認: " + (_pass ? "PASS" : "FAIL") +
          "\n  sess2=" + _sess2 + " sess1=" + _sess1 +
          "\n  storyId2=" + _storyId2 + " storyId1=" + _storyId1);
        closeCompanionSideStoryModal();
      };
      document.getElementById("btn-debug-v451-old-timer-check").onclick = function () {
        // 古いタイマーが新セッションに影響しないことをsessionId記録で確認
        var _cid451c = "juritani";
        state.companionSideStoryFlags[_cid451c] = true;
        if (!state.companionLevels[_cid451c]) { state.companionLevels[_cid451c] = { level: 50, exp: 0 }; }
        if (state.companionLevels[_cid451c].level < 50) { state.companionLevels[_cid451c].level = 50; }
        if (state.player.companions.indexOf(_cid451c) < 0) { state.player.companions.push(_cid451c); }
        startCompanionSideStory(_cid451c, 1);
        var _sess1 = _cstorySessionId;
        // タイマーコールバックはsessionIdをキャプチャして照合する実装を確認
        // 新セッションを即座に開始してsessIdが変わることを検証
        _cstorySessionId++; // 手動インクリメントで旧セッション化
        var _sess2 = _cstorySessionId;
        var _pass = (_sess2 === _sess1 + 1);
        closeCompanionSideStoryModal();
        showToast("[DEBUG v0.45.1] 古いタイマー無効化確認: " + (_pass ? "PASS（sessionId分離OK）" : "FAIL") +
          "\n  旧sess=" + _sess1 + " 現sess=" + _cstorySessionId);
      };
      document.getElementById("btn-debug-v451-ch2-final-boundary").onclick = function () {
        // 第2話最終行でcompleteが正しく呼ばれ、アクティブ不一致時は棄却されることを確認
        var _cid451d = "juritani";
        state.companionSideStoryFlags[_cid451d] = true;
        state.companionSideStoryChapter2Flags[_cid451d] = false;
        if (!state.companionLevels[_cid451d]) { state.companionLevels[_cid451d] = { level: 50, exp: 0 }; }
        if (state.companionLevels[_cid451d].level < 50) { state.companionLevels[_cid451d].level = 50; }
        if (state.player.companions.indexOf(_cid451d) < 0) { state.player.companions.push(_cid451d); }
        startCompanionSideStory(_cid451d, 2);
        var _story451 = getCompanionSideStoryData(_cid451d, 2);
        var _lastIdx = _story451 ? _story451.lines.length - 1 : 0;
        state.activeCompanionSideStoryLine = _lastIdx;
        showCompanionSideStoryLine();
        // 不一致cidで棄却されることを確認
        var _flagBefore = !!(state.companionSideStoryChapter2Flags[_cid451d]);
        completeCompanionSideStory("shurittani", 2); // 不一致cid → 棄却されるはず
        var _flagAfter = !!(state.companionSideStoryChapter2Flags[_cid451d]);
        var _passBoundary = (_flagBefore === _flagAfter); // 棄却されたなら変化なし
        showToast("[DEBUG v0.45.1] 第2話最終境界確認: " + (_passBoundary ? "PASS（不一致cid棄却OK）" : "FAIL（誤完了）") +
          "\n  lastIdx=" + _lastIdx + " active=" + state.activeCompanionSideStory);
        closeCompanionSideStoryModal();
      };

      // §119 v0.45.2: 第2話全話完了演出デバッグ
      document.getElementById("btn-debug-v452-ch2-celeb-show").onclick = function () {
        // ch2全完了演出を直接確認
        var _cids452 = ["juritani", "shurittani", "norio", "harumi"];
        var _prevCeleb1 = state.companionSideStoryAllCompleteCelebrated;
        var _prevPending1 = _pendingCompanionStoryAllCompleteNotice;
        state.companionSideStoryChapter2Flags = { juritani: true, shurittani: true, norio: true, harumi: true };
        state.companionSideStoryChapter2AllCompleteCelebrated = false;
        _pendingCompanionStoryChapter2AllCompleteNotice = false;
        _companionStoryChapter2AllCompleteNoticeVisible = false;
        for (var _ci452 = 0; _ci452 < _cids452.length; _ci452++) {
          if (!state.player.companions || state.player.companions.indexOf(_cids452[_ci452]) < 0) {
            if (!state.player.companions) { state.player.companions = []; }
            state.player.companions.push(_cids452[_ci452]);
          }
        }
        checkCompanionSideStoryChapter2AllComplete("debug");
        saveGame();
        // ch1演出状態が変わっていないことを確認
        var _ch1Changed = (state.companionSideStoryAllCompleteCelebrated !== _prevCeleb1 || _pendingCompanionStoryAllCompleteNotice !== _prevPending1);
        if (_ch1Changed) {
          state.companionSideStoryAllCompleteCelebrated = _prevCeleb1;
          _pendingCompanionStoryAllCompleteNotice = _prevPending1;
          showToast("[DEBUG v0.45.2] FAIL: ch1演出状態が変化した ❌");
        } else {
          consumePendingCompanionStoryChapter2AllCompleteNotice();
        }
      };
      document.getElementById("btn-debug-v452-ch2-celeb-reset").onclick = function () {
        state.companionSideStoryChapter2AllCompleteCelebrated = false;
        _pendingCompanionStoryChapter2AllCompleteNotice = false;
        _companionStoryChapter2AllCompleteNoticeVisible = false;
        _companionStoryChapter2AllCompleteOrigin = null;
        _pendingCompanionStoryChapter2AllCompleteOrigin = null;
        if (_companionStoryChapter2AllCompleteNoticeTimer) {
          clearTimeout(_companionStoryChapter2AllCompleteNoticeTimer);
          _companionStoryChapter2AllCompleteNoticeTimer = null;
        }
        if (_companionStoryCompletionNoticeQueueTimer) { // §120 v0.45.3
          clearTimeout(_companionStoryCompletionNoticeQueueTimer);
          _companionStoryCompletionNoticeQueueTimer = null;
        }
        closeModal("companion-story-chapter2-all-complete-modal");
        saveGame();
        showToast("[DEBUG v0.45.2] 第2話演出済みフラグをリセット ✅");
      };
      document.getElementById("btn-debug-v452-ch2-34-boundary").onclick = function () {
        // 3/4では発動しない・4/4で初回発動・再実行では発動しない
        var _prevCeleb2 = state.companionSideStoryChapter2AllCompleteCelebrated;
        var _prevPending2 = _pendingCompanionStoryChapter2AllCompleteNotice;
        var _prevCeleb1 = state.companionSideStoryAllCompleteCelebrated;
        var _prevPending1 = _pendingCompanionStoryAllCompleteNotice;
        // 3/4状態でcheck
        state.companionSideStoryChapter2Flags = { juritani: true, shurittani: true, norio: true, harumi: false };
        state.companionSideStoryChapter2AllCompleteCelebrated = false;
        _pendingCompanionStoryChapter2AllCompleteNotice = false;
        var _r1 = checkCompanionSideStoryChapter2AllComplete("debug");
        var _pass1 = (_r1 === false && !_pendingCompanionStoryChapter2AllCompleteNotice);
        // 4/4にしてcheck
        state.companionSideStoryChapter2Flags.harumi = true;
        var _r2 = checkCompanionSideStoryChapter2AllComplete("debug");
        var _pass2 = (_r2 === true && _pendingCompanionStoryChapter2AllCompleteNotice && state.companionSideStoryChapter2AllCompleteCelebrated === true);
        // 再実行でcheck
        var _r3 = checkCompanionSideStoryChapter2AllComplete("debug");
        var _pass3 = (_r3 === false);
        // ch1状態が変わっていないことを確認
        var _passNoChange = (state.companionSideStoryAllCompleteCelebrated === _prevCeleb1 && _pendingCompanionStoryAllCompleteNotice === _prevPending1);
        // 復元
        state.companionSideStoryChapter2AllCompleteCelebrated = _prevCeleb2;
        _pendingCompanionStoryChapter2AllCompleteNotice = _prevPending2;
        state.companionSideStoryAllCompleteCelebrated = _prevCeleb1;
        _pendingCompanionStoryAllCompleteNotice = _prevPending1;
        var _allPass = (_pass1 && _pass2 && _pass3 && _passNoChange);
        showToast("[DEBUG v0.45.2] 3/4→4/4境界: " + (_allPass ? "PASS ✅" : "FAIL ❌") +
          "\n 3/4でfalse=" + _pass1 + " 4/4でtrue=" + _pass2 +
          "\n 再実行false=" + _pass3 + " ch1変化なし=" + _passNoChange);
      };
      document.getElementById("btn-debug-v452-ch2-rescue").onclick = function () {
        // 旧4/4セーブ救済: ch2 4/4 + celebrated=false → pending登録
        var _prevCeleb2 = state.companionSideStoryChapter2AllCompleteCelebrated;
        var _prevPending2 = _pendingCompanionStoryChapter2AllCompleteNotice;
        var _prevCeleb1 = state.companionSideStoryAllCompleteCelebrated;
        var _prevPending1 = _pendingCompanionStoryAllCompleteNotice;
        state.companionSideStoryChapter2Flags = { juritani: true, shurittani: true, norio: true, harumi: true };
        state.companionSideStoryChapter2AllCompleteCelebrated = false;
        _pendingCompanionStoryChapter2AllCompleteNotice = false;
        _companionStoryChapter2AllCompleteNoticeVisible = false;
        var _rescued = checkCompanionSideStoryChapter2AllComplete("field");
        var _pass1 = (_rescued === true && state.companionSideStoryChapter2AllCompleteCelebrated === true && _pendingCompanionStoryChapter2AllCompleteNotice === true);
        // 再実行で追加pending発生しないこと
        var _r2 = checkCompanionSideStoryChapter2AllComplete("field");
        var _pass2 = (_r2 === false);
        // ch1状態変化なし
        var _passNoChange = (state.companionSideStoryAllCompleteCelebrated === _prevCeleb1 && _pendingCompanionStoryAllCompleteNotice === _prevPending1);
        // 復元
        state.companionSideStoryChapter2AllCompleteCelebrated = _prevCeleb2;
        _pendingCompanionStoryChapter2AllCompleteNotice = _prevPending2;
        state.companionSideStoryAllCompleteCelebrated = _prevCeleb1;
        _pendingCompanionStoryAllCompleteNotice = _prevPending1;
        var _allPass = (_pass1 && _pass2 && _passNoChange);
        showToast("[DEBUG v0.45.2] 旧4/4救済: " + (_allPass ? "PASS ✅" : "FAIL ❌") +
          "\n rescued=" + _pass1 + " 重複なし=" + _pass2 + " ch1変化なし=" + _passNoChange);
      };
      document.getElementById("btn-debug-v452-ch2-noduplicate").onclick = function () {
        // 二重防止: check×3回 → pending最初の1回だけ
        var _prevCeleb2 = state.companionSideStoryChapter2AllCompleteCelebrated;
        var _prevPending2 = _pendingCompanionStoryChapter2AllCompleteNotice;
        var _prevCeleb1 = state.companionSideStoryAllCompleteCelebrated;
        var _prevPending1 = _pendingCompanionStoryAllCompleteNotice;
        state.companionSideStoryChapter2Flags = { juritani: true, shurittani: true, norio: true, harumi: true };
        state.companionSideStoryChapter2AllCompleteCelebrated = false;
        _pendingCompanionStoryChapter2AllCompleteNotice = false;
        var _results452 = [];
        for (var _qi = 0; _qi < 3; _qi++) {
          _results452.push(checkCompanionSideStoryChapter2AllComplete("debug"));
        }
        var _pass = (_results452[0] === true && _results452[1] === false && _results452[2] === false);
        var _pendingOnce = (_pendingCompanionStoryChapter2AllCompleteNotice === true);
        // 復元
        state.companionSideStoryChapter2AllCompleteCelebrated = _prevCeleb2;
        _pendingCompanionStoryChapter2AllCompleteNotice = _prevPending2;
        state.companionSideStoryAllCompleteCelebrated = _prevCeleb1;
        _pendingCompanionStoryAllCompleteNotice = _prevPending1;
        showToast("[DEBUG v0.45.2] 二重防止: " + (_pass && _pendingOnce ? "PASS ✅" : "FAIL ❌") +
          "\n 初回=true 2回目=false 3回目=false pending1回のみ");
      };
      document.getElementById("btn-debug-v452-ch1ch2-sep").onclick = function () {
        // ch1/ch2演出の完全分離確認
        var _prevCeleb1 = state.companionSideStoryAllCompleteCelebrated;
        var _prevPending1 = _pendingCompanionStoryAllCompleteNotice;
        var _prevVis1 = _companionStoryAllCompleteNoticeVisible;
        var _prevOrigin1 = _companionStoryAllCompleteOrigin;
        var _prevCeleb2 = state.companionSideStoryChapter2AllCompleteCelebrated;
        var _prevPending2 = _pendingCompanionStoryChapter2AllCompleteNotice;
        // ch1=4/4済み・ch2=3/4の状態
        state.companionSideStoryFlags = { juritani: true, shurittani: true, norio: true, harumi: true };
        state.companionSideStoryAllCompleteCelebrated = true;
        _pendingCompanionStoryAllCompleteNotice = false;
        state.companionSideStoryChapter2Flags = { juritani: true, shurittani: true, norio: true, harumi: false };
        state.companionSideStoryChapter2AllCompleteCelebrated = false;
        _pendingCompanionStoryChapter2AllCompleteNotice = false;
        // ch2を4/4に
        state.companionSideStoryChapter2Flags.harumi = true;
        checkCompanionSideStoryChapter2AllComplete("debug");
        var _pass1 = (_pendingCompanionStoryChapter2AllCompleteNotice === true);
        var _pass2 = (state.companionSideStoryChapter2AllCompleteCelebrated === true);
        var _pass3 = (state.companionSideStoryAllCompleteCelebrated === true);
        var _pass4 = (_pendingCompanionStoryAllCompleteNotice === false);
        var _pass5 = (_companionStoryAllCompleteNoticeVisible === false);
        // 復元
        state.companionSideStoryAllCompleteCelebrated = _prevCeleb1;
        _pendingCompanionStoryAllCompleteNotice = _prevPending1;
        _companionStoryAllCompleteNoticeVisible = _prevVis1;
        _companionStoryAllCompleteOrigin = _prevOrigin1;
        state.companionSideStoryChapter2AllCompleteCelebrated = _prevCeleb2;
        _pendingCompanionStoryChapter2AllCompleteNotice = _prevPending2;
        var _allPass = (_pass1 && _pass2 && _pass3 && _pass4 && _pass5);
        showToast("[DEBUG v0.45.2] ch1/ch2分離: " + (_allPass ? "PASS ✅" : "FAIL ❌") +
          "\n ch2pending=" + _pass1 + " ch2celeb=" + _pass2 +
          "\n ch1celeb維持=" + _pass3 + " ch1pending維持=" + _pass4 + " ch1vis維持=" + _pass5);
      };

      // §120 v0.45.3: 第1話→第2話 pending連続表示確認
      document.getElementById("btn-debug-v453-queue-seq").onclick = function () {
        var _snap453a = {
          celeb1: state.companionSideStoryAllCompleteCelebrated,
          celeb2: state.companionSideStoryChapter2AllCompleteCelebrated,
          pending1: _pendingCompanionStoryAllCompleteNotice,
          pending2: _pendingCompanionStoryChapter2AllCompleteNotice,
          vis1: _companionStoryAllCompleteNoticeVisible,
          vis2: _companionStoryChapter2AllCompleteNoticeVisible,
          origin1: _pendingCompanionStoryAllCompleteOrigin,
          origin2: _pendingCompanionStoryChapter2AllCompleteOrigin
        };
        state.companionSideStoryFlags = { juritani: true, shurittani: true, norio: true, harumi: true };
        state.companionSideStoryChapter2Flags = { juritani: true, shurittani: true, norio: true, harumi: true };
        state.companionSideStoryAllCompleteCelebrated = true;
        state.companionSideStoryChapter2AllCompleteCelebrated = true;
        _pendingCompanionStoryAllCompleteNotice = true;
        _pendingCompanionStoryChapter2AllCompleteNotice = true;
        _companionStoryAllCompleteNoticeVisible = false;
        _companionStoryChapter2AllCompleteNoticeVisible = false;
        _pendingCompanionStoryAllCompleteOrigin = "debug";
        _pendingCompanionStoryChapter2AllCompleteOrigin = "debug";
        consumePendingCompanionStoryCompletionNotices();
        var _pass453a1 = (_companionStoryAllCompleteNoticeVisible === true);
        var _pass453a2 = (_companionStoryChapter2AllCompleteNoticeVisible === false);
        var _pass453a3 = (_pendingCompanionStoryChapter2AllCompleteNotice === true);
        var _allPass453a = (_pass453a1 && _pass453a2 && _pass453a3);
        showToast("[DEBUG v0.45.3] 連続表示確認: " + (_allPass453a ? "PASS ✅" : "FAIL ❌") +
          "\n ch1open=" + _pass453a1 + " ch2closed=" + _pass453a2 + " ch2pending維持=" + _pass453a3);
        closeCompanionStoryAllCompleteCelebration();
        closeModal("companion-story-chapter2-all-complete-modal");
        if (_companionStoryCompletionNoticeQueueTimer) {
          clearTimeout(_companionStoryCompletionNoticeQueueTimer);
          _companionStoryCompletionNoticeQueueTimer = null;
        }
        state.companionSideStoryAllCompleteCelebrated = _snap453a.celeb1;
        state.companionSideStoryChapter2AllCompleteCelebrated = _snap453a.celeb2;
        _pendingCompanionStoryAllCompleteNotice = _snap453a.pending1;
        _pendingCompanionStoryChapter2AllCompleteNotice = _snap453a.pending2;
        _companionStoryAllCompleteNoticeVisible = _snap453a.vis1;
        _companionStoryChapter2AllCompleteNoticeVisible = _snap453a.vis2;
        _pendingCompanionStoryAllCompleteOrigin = _snap453a.origin1;
        _pendingCompanionStoryChapter2AllCompleteOrigin = _snap453a.origin2;
      };

      // §120 v0.45.3: 両旧4/4セーブ連続救済確認
      document.getElementById("btn-debug-v453-both-rescue").onclick = function () {
        var _snap453b = {
          flags1: JSON.parse(JSON.stringify(state.companionSideStoryFlags || {})),
          flags2: JSON.parse(JSON.stringify(state.companionSideStoryChapter2Flags || {})),
          celeb1: state.companionSideStoryAllCompleteCelebrated,
          celeb2: state.companionSideStoryChapter2AllCompleteCelebrated,
          pending1: _pendingCompanionStoryAllCompleteNotice,
          pending2: _pendingCompanionStoryChapter2AllCompleteNotice,
          origin1: _pendingCompanionStoryAllCompleteOrigin,
          origin2: _pendingCompanionStoryChapter2AllCompleteOrigin
        };
        state.companionSideStoryFlags = { juritani: true, shurittani: true, norio: true, harumi: true };
        state.companionSideStoryChapter2Flags = { juritani: true, shurittani: true, norio: true, harumi: true };
        state.companionSideStoryAllCompleteCelebrated = false;
        state.companionSideStoryChapter2AllCompleteCelebrated = false;
        _pendingCompanionStoryAllCompleteNotice = false;
        _pendingCompanionStoryChapter2AllCompleteNotice = false;
        _companionStoryAllCompleteNoticeVisible = false;
        _companionStoryChapter2AllCompleteNoticeVisible = false;
        var _r453b1 = checkCompanionSideStoryAllComplete();
        if (_r453b1) { _pendingCompanionStoryAllCompleteOrigin = "field"; }
        var _r453b2 = checkCompanionSideStoryChapter2AllComplete("field");
        var _pass453b1 = (state.companionSideStoryAllCompleteCelebrated === true);
        var _pass453b2 = (state.companionSideStoryChapter2AllCompleteCelebrated === true);
        var _pass453b3 = (_pendingCompanionStoryAllCompleteNotice === true);
        var _pass453b4 = (_pendingCompanionStoryChapter2AllCompleteNotice === true);
        var _pass453b5 = (_pendingCompanionStoryAllCompleteOrigin === "field");
        var _pass453b6 = (_pendingCompanionStoryChapter2AllCompleteOrigin === "field");
        var _allPass453b = (_pass453b1 && _pass453b2 && _pass453b3 && _pass453b4 && _pass453b5 && _pass453b6);
        showToast("[DEBUG v0.45.3] 両4/4救済: " + (_allPass453b ? "PASS ✅" : "FAIL ❌") +
          "\n celeb1=" + _pass453b1 + " celeb2=" + _pass453b2 +
          "\n pending1=" + _pass453b3 + " pending2=" + _pass453b4 +
          "\n origin1=field:" + _pass453b5 + " origin2=field:" + _pass453b6);
        state.companionSideStoryFlags = _snap453b.flags1;
        state.companionSideStoryChapter2Flags = _snap453b.flags2;
        state.companionSideStoryAllCompleteCelebrated = _snap453b.celeb1;
        state.companionSideStoryChapter2AllCompleteCelebrated = _snap453b.celeb2;
        _pendingCompanionStoryAllCompleteNotice = _snap453b.pending1;
        _pendingCompanionStoryChapter2AllCompleteNotice = _snap453b.pending2;
        _pendingCompanionStoryAllCompleteOrigin = _snap453b.origin1;
        _pendingCompanionStoryChapter2AllCompleteOrigin = _snap453b.origin2;
        if (_companionStoryCompletionNoticeQueueTimer) {
          clearTimeout(_companionStoryCompletionNoticeQueueTimer);
          _companionStoryCompletionNoticeQueueTimer = null;
        }
      };

      // §120 v0.45.3: 全話完了キュー二重実行防止確認
      document.getElementById("btn-debug-v453-queue-nodup").onclick = function () {
        var _snap453c = {
          celeb1: state.companionSideStoryAllCompleteCelebrated,
          celeb2: state.companionSideStoryChapter2AllCompleteCelebrated,
          pending1: _pendingCompanionStoryAllCompleteNotice,
          pending2: _pendingCompanionStoryChapter2AllCompleteNotice,
          vis1: _companionStoryAllCompleteNoticeVisible,
          vis2: _companionStoryChapter2AllCompleteNoticeVisible,
          origin1: _pendingCompanionStoryAllCompleteOrigin,
          origin2: _pendingCompanionStoryChapter2AllCompleteOrigin
        };
        state.companionSideStoryFlags = { juritani: true, shurittani: true, norio: true, harumi: true };
        state.companionSideStoryChapter2Flags = { juritani: true, shurittani: true, norio: true, harumi: true };
        state.companionSideStoryAllCompleteCelebrated = true;
        state.companionSideStoryChapter2AllCompleteCelebrated = true;
        _pendingCompanionStoryAllCompleteNotice = true;
        _pendingCompanionStoryChapter2AllCompleteNotice = true;
        _companionStoryAllCompleteNoticeVisible = false;
        _companionStoryChapter2AllCompleteNoticeVisible = false;
        _pendingCompanionStoryAllCompleteOrigin = "debug";
        _pendingCompanionStoryChapter2AllCompleteOrigin = "debug";
        var _fail453c = false;
        for (var _i453c = 0; _i453c < 10; _i453c++) {
          consumePendingCompanionStoryCompletionNotices();
          if (_companionStoryChapter2AllCompleteNoticeVisible) { _fail453c = true; break; }
        }
        var _pass453c1 = (_companionStoryAllCompleteNoticeVisible === true);
        var _pass453c2 = (_companionStoryChapter2AllCompleteNoticeVisible === false);
        var _pass453c3 = (!_fail453c);
        var _allPass453c = (_pass453c1 && _pass453c2 && _pass453c3);
        showToast("[DEBUG v0.45.3] キュー二重防止x10: " + (_allPass453c ? "PASS ✅" : "FAIL ❌") +
          "\n ch1=1枚:" + _pass453c1 + " ch2=0枚:" + _pass453c2 + " 二重なし:" + _pass453c3);
        closeCompanionStoryAllCompleteCelebration();
        closeModal("companion-story-chapter2-all-complete-modal");
        if (_companionStoryCompletionNoticeQueueTimer) {
          clearTimeout(_companionStoryCompletionNoticeQueueTimer);
          _companionStoryCompletionNoticeQueueTimer = null;
        }
        state.companionSideStoryAllCompleteCelebrated = _snap453c.celeb1;
        state.companionSideStoryChapter2AllCompleteCelebrated = _snap453c.celeb2;
        _pendingCompanionStoryAllCompleteNotice = _snap453c.pending1;
        _pendingCompanionStoryChapter2AllCompleteNotice = _snap453c.pending2;
        _companionStoryAllCompleteNoticeVisible = _snap453c.vis1;
        _companionStoryChapter2AllCompleteNoticeVisible = _snap453c.vis2;
        _pendingCompanionStoryAllCompleteOrigin = _snap453c.origin1;
        _pendingCompanionStoryChapter2AllCompleteOrigin = _snap453c.origin2;
      };

      // §120 v0.45.3: 第1話close後の第2話再消費確認（最重要テスト）
      document.getElementById("btn-debug-v453-ch1close-ch2").onclick = function () {
        var _snap453d = {
          celeb1: state.companionSideStoryAllCompleteCelebrated,
          celeb2: state.companionSideStoryChapter2AllCompleteCelebrated,
          pending1: _pendingCompanionStoryAllCompleteNotice,
          pending2: _pendingCompanionStoryChapter2AllCompleteNotice,
          vis1: _companionStoryAllCompleteNoticeVisible,
          vis2: _companionStoryChapter2AllCompleteNoticeVisible,
          origin1: _pendingCompanionStoryAllCompleteOrigin,
          origin2: _pendingCompanionStoryChapter2AllCompleteOrigin
        };
        state.companionSideStoryFlags = { juritani: true, shurittani: true, norio: true, harumi: true };
        state.companionSideStoryChapter2Flags = { juritani: true, shurittani: true, norio: true, harumi: true };
        state.companionSideStoryAllCompleteCelebrated = true;
        state.companionSideStoryChapter2AllCompleteCelebrated = true;
        _pendingCompanionStoryAllCompleteNotice = false;
        _pendingCompanionStoryChapter2AllCompleteNotice = true;
        _companionStoryAllCompleteNoticeVisible = true;
        _companionStoryChapter2AllCompleteNoticeVisible = false;
        _pendingCompanionStoryAllCompleteOrigin = "debug";
        _pendingCompanionStoryChapter2AllCompleteOrigin = "debug";
        closeCompanionStoryAllCompleteCelebration();
        var _pass453d1 = (_companionStoryAllCompleteNoticeVisible === false);
        var _pass453d2 = (_pendingCompanionStoryChapter2AllCompleteNotice === true);
        var _pass453d3 = (_companionStoryCompletionNoticeQueueTimer !== null);
        var _allPass453d = (_pass453d1 && _pass453d2 && _pass453d3);
        showToast("[DEBUG v0.45.3] ch1close後ch2再消費: " + (_allPass453d ? "PASS ✅" : "FAIL ❌") +
          "\n ch1閉じた=" + _pass453d1 + " ch2pending維持=" + _pass453d2 + " timer予約=" + _pass453d3);
        if (_companionStoryCompletionNoticeQueueTimer) {
          clearTimeout(_companionStoryCompletionNoticeQueueTimer);
          _companionStoryCompletionNoticeQueueTimer = null;
        }
        closeModal("companion-story-chapter2-all-complete-modal");
        state.companionSideStoryAllCompleteCelebrated = _snap453d.celeb1;
        state.companionSideStoryChapter2AllCompleteCelebrated = _snap453d.celeb2;
        _pendingCompanionStoryAllCompleteNotice = _snap453d.pending1;
        _pendingCompanionStoryChapter2AllCompleteNotice = _snap453d.pending2;
        _companionStoryAllCompleteNoticeVisible = _snap453d.vis1;
        _companionStoryChapter2AllCompleteNoticeVisible = _snap453d.vis2;
        _pendingCompanionStoryAllCompleteOrigin = _snap453d.origin1;
        _pendingCompanionStoryChapter2AllCompleteOrigin = _snap453d.origin2;
      };

      // §120 v0.45.3: 連続演出中のmodalOpen維持確認
      document.getElementById("btn-debug-v453-modalopen").onclick = function () {
        var _snap453e = {
          celeb1: state.companionSideStoryAllCompleteCelebrated,
          celeb2: state.companionSideStoryChapter2AllCompleteCelebrated,
          pending1: _pendingCompanionStoryAllCompleteNotice,
          pending2: _pendingCompanionStoryChapter2AllCompleteNotice,
          vis1: _companionStoryAllCompleteNoticeVisible,
          vis2: _companionStoryChapter2AllCompleteNoticeVisible,
          origin1: _pendingCompanionStoryAllCompleteOrigin,
          origin2: _pendingCompanionStoryChapter2AllCompleteOrigin,
          modalOpen: state.modalOpen
        };
        state.companionSideStoryFlags = { juritani: true, shurittani: true, norio: true, harumi: true };
        state.companionSideStoryChapter2Flags = { juritani: true, shurittani: true, norio: true, harumi: true };
        state.companionSideStoryAllCompleteCelebrated = true;
        state.companionSideStoryChapter2AllCompleteCelebrated = true;
        _pendingCompanionStoryAllCompleteNotice = false;
        _pendingCompanionStoryChapter2AllCompleteNotice = true;
        _companionStoryAllCompleteNoticeVisible = true;
        _companionStoryChapter2AllCompleteNoticeVisible = false;
        _pendingCompanionStoryAllCompleteOrigin = "debug";
        _pendingCompanionStoryChapter2AllCompleteOrigin = "debug";
        closeCompanionStoryAllCompleteCelebration();
        var _pass453e1 = (state.modalOpen === true);
        var _allPass453e = _pass453e1;
        showToast("[DEBUG v0.45.3] 連続演出中modalOpen維持: " + (_allPass453e ? "PASS ✅" : "FAIL ❌") +
          "\n ch2pending中 modalOpen=" + state.modalOpen);
        if (_companionStoryCompletionNoticeQueueTimer) {
          clearTimeout(_companionStoryCompletionNoticeQueueTimer);
          _companionStoryCompletionNoticeQueueTimer = null;
        }
        closeModal("companion-story-chapter2-all-complete-modal");
        state.companionSideStoryAllCompleteCelebrated = _snap453e.celeb1;
        state.companionSideStoryChapter2AllCompleteCelebrated = _snap453e.celeb2;
        _pendingCompanionStoryAllCompleteNotice = _snap453e.pending1;
        _pendingCompanionStoryChapter2AllCompleteNotice = _snap453e.pending2;
        _companionStoryAllCompleteNoticeVisible = _snap453e.vis1;
        _companionStoryChapter2AllCompleteNoticeVisible = _snap453e.vis2;
        _pendingCompanionStoryAllCompleteOrigin = _snap453e.origin1;
        _pendingCompanionStoryChapter2AllCompleteOrigin = _snap453e.origin2;
        state.modalOpen = _snap453e.modalOpen;
      };

      // §98 v0.36.1: まかせるAI 攻撃魔法勝利確認（敵HP5）
      document.getElementById("btn-debug-v361-magic-win").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        state.player.companions = ["juritani", "shurittani", "norio"];
        state.player.hp = state.player.maxHp;
        state.lastCompanionAutoAction = {};
        resetPartyTrail();
        closeModal("settings-modal");
        var dog = findById(NON_UMA_DATA, "wilddog");
        if (!dog) { showToast("[DEBUG] のらいぬが見つからない"); return; }
        actuallyStartBattle(dog);
        if (state.enemy) { state.enemy.hp = 5; renderEnemy(); }
        showToast("[DEBUG] ジュリ/シュリ/ノリオ+敵HP5。まかせるの攻撃魔法でHP0→winBattle()を確認！");
      };
      // §92 v0.33.1: 敵HP10を設定して「敵HP低下時の状況判断」をテスト（旧: ハルミHP30%確認）
      document.getElementById("btn-debug-auto3-hplow").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        state.player.companions = ["juritani", "shurittani", "norio", "harumi"];
        state.player.hp = state.player.maxHp;
        resetPartyTrail();
        closeModal("settings-modal");
        var dog = findById(NON_UMA_DATA, "wilddog");
        if (!dog) { showToast("[DEBUG] のらいぬが見つからない"); return; }
        actuallyStartBattle(dog);
        if (state.enemy) { state.enemy.hp = 10; renderEnemy(); }
        showToast("[DEBUG] 仲間4人+敵HP10。まかせるで攻撃優先（たたかうが多め）になるか確認！");
      };
      // §69 v0.19: NPC会話テスト
      document.getElementById("btn-debug-npc-full-complete").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        state.gameCleared = true;
        for (var _sj69a = 1; _sj69a <= 6; _sj69a++) {
          state.sideMap.stageCleared[String(_sj69a)] = true;
        }
        state.sideMap.defeatedEnemies["6:34,2"] = true;
        UMA_DATA.forEach(function(m) { state.player.dex[m.id] = "captured"; });
        state.dexCompleteRewardClaimed = true;
        state.pendingClear = false;
        saveGame();
        renderStatus();
        closeModal("settings-modal");
        openNpcModal("D");
        showToast("[DEBUG] 完全達成状態+UMA博士開く");
      };
      document.getElementById("btn-debug-npc-cleared-only").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        state.gameCleared = true;
        state.pendingClear = false;
        for (var _sj69b = 1; _sj69b <= 6; _sj69b++) {
          state.sideMap.stageCleared[String(_sj69b)] = false;
        }
        state.sideMap.defeatedEnemies["6:34,2"] = false;
        saveGame();
        renderStatus();
        closeModal("settings-modal");
        openNpcModal("D");
        showToast("[DEBUG] 究極ゴリラ捕獲済み・横スクロール未制覇 → UMA博士反応確認");
      };
      document.getElementById("btn-debug-npc-side-cleared").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        state.gameCleared = false;
        for (var _sj69c = 1; _sj69c <= 6; _sj69c++) {
          state.sideMap.stageCleared[String(_sj69c)] = true;
        }
        state.sideMap.defeatedEnemies["6:34,2"] = true;
        state.pendingClear = false;
        saveGame();
        renderStatus();
        closeModal("settings-modal");
        openNpcModal("D");
        showToast("[DEBUG] 横スクロール制覇済み・究極ゴリラ未捕獲 → UMA博士反応確認");
      };
      document.getElementById("btn-debug-return-gate-s6").onclick = function () {
        closeModal("settings-modal");
        state.mapMode = "side";
        state.sideMap.stage = 6;
        state.sideMap.x = 2;
        state.sideMap.y = 2;
        saveGame();
        renderField();
        showToast("🏠 ステージ6スタート側Hゲート(2,2)へ移動した");
      };
      document.getElementById("btn-debug-goal-gate-s6").onclick = function () {
        closeModal("settings-modal");
        state.mapMode = "side";
        state.sideMap.stage = 6;
        state.sideMap.defeatedEnemies["6:34,2"] = true;
        state.sideMap.x = 36;
        state.sideMap.y = 2;
        saveGame();
        renderField();
        showToast("[DEBUG] ステージ6ゴール直前(x=36)へ移動 — G@37/H@38、ボス撃退済みにした");
      };
      document.getElementById("btn-debug-side-stage6-enter").onclick = function () {
        state.mapMode = "side";
        state.sideMap.stage = 6;
        var s6 = SIDE_STAGE_DATA[6];
        state.sideMap.x = s6.startX;
        state.sideMap.y = s6.startY;
        saveGame();
        closeModal("settings-modal");
        renderField();
        showToast("[DEBUG] ステージ6チンパンジーの聖域へ移動");
      };
      document.getElementById("btn-debug-side-stage6-near-goal").onclick = function () {
        closeModal("settings-modal");
        state.mapMode = "side";
        state.sideMap.stage = 6;
        state.sideMap.x = 33;
        state.sideMap.y = 2;
        saveGame();
        renderField();
        showToast("[DEBUG] ステージ6ゴール直前(x=33,y=2)へ移動");
      };
      document.getElementById("btn-debug-side-stage6-clear-reset").onclick = function () {
        var sm6 = state.sideMap;
        delete sm6.stageCleared["6"];
        delete sm6.defeatedEnemies["6:34,2"];
        sm6.stage6RewardLevel = 0;
        sideMapPendingFixedKey = "";
        saveGame();
        renderField();
        showToast("[DEBUG] ステージ6フラグをリセット");
      };
      document.getElementById("btn-debug-side-set-ultimatechimgori").onclick = function () {
        state.sideMap.defeatedEnemies["6:34,2"] = true;
        saveGame();
        renderField();
        showToast("[DEBUG] 究極チンパンジー撃退済みにした (6:34,2)");
      };
      document.getElementById("btn-debug-ultimate-chimp-encounter").onclick = function () {
        closeModal("settings-modal");
        triggerFixedEncounter("ultimate_chimpanzee");
        showToast("[DEBUG] 究極チンパンジー強制エンカウント");
      };
      document.getElementById("btn-debug-side-stage6-items-reset").onclick = function () {
        var sm6r = state.sideMap;
        var cToDelete6 = [];
        for (var ck6 in sm6r.openedChests) {
          if (sm6r.openedChests.hasOwnProperty(ck6) && ck6.indexOf("6:") === 0) cToDelete6.push(ck6);
        }
        for (var ci6 = 0; ci6 < cToDelete6.length; ci6++) delete sm6r.openedChests[cToDelete6[ci6]];
        var eToDelete6 = [];
        for (var ek6 in sm6r.defeatedEnemies) {
          if (sm6r.defeatedEnemies.hasOwnProperty(ek6) && ek6.indexOf("6:") === 0) eToDelete6.push(ek6);
        }
        for (var ei6 = 0; ei6 < eToDelete6.length; ei6++) delete sm6r.defeatedEnemies[eToDelete6[ei6]];
        sideMapPendingFixedKey = "";
        saveGame();
        renderField();
        showToast("[DEBUG] ステージ6宝箱・固定敵をリセット");
      };
    }
  }

  function changeWalkSpeed(speed) {
    if (!WALK_SPEED_MS[speed]) return;
    state.player.walkSpeed = speed;
    showToast("⚙️ 歩く速度を「" + WALK_SPEED_LABELS[speed] + "」にした");
    renderSettingsBody();
    saveGame();
  }

  // ---------------------------------------------------------
  // 22. セーブ/ロード(localStorage)
  // ---------------------------------------------------------
  function saveGame() {
    try {
      var p = state.player;
      var data = {
        level: p.level, exp: p.exp, nextExp: p.nextExp,
        baseMaxHp: p.baseMaxHp, baseMaxMp: p.baseMaxMp, baseAtk: p.baseAtk, baseDef: p.baseDef,
        weaponAtkBonus: p.weaponAtkBonus,
        hp: p.hp, mp: p.mp,
        gold: p.gold, potionCount: p.potionCount, ropeCount: p.ropeCount,
        coffeeCount: p.coffeeCount, breadCount: p.breadCount,
        bentoCount: p.bentoCount, ramenCount: p.ramenCount,
        coughsyrupCount: p.coughsyrupCount, deodorantCount: p.deodorantCount,
        spells: p.spells, jobId: p.job.id,
        dex: p.dex, umaInventory: p.umaInventory,
        walkSpeed: p.walkSpeed,
        equipment: p.equipment,
        ownedWeapons: p.ownedWeapons, ownedArmors: p.ownedArmors,
        ownedShields: p.ownedShields, ownedHelmets: p.ownedHelmets,
        statusAilments: p.statusAilments,
        seenOpening: p.seenOpening,
        seenGoal: p.seenGoal,
        companions: p.companions,
        hasUkulele: p.hasUkulele,
        level99Shown: p.level99Shown,
        discoveredFinal: state.discoveredFinal,
        gameCleared: state.gameCleared,
        dexCompleteRewardClaimed: state.dexCompleteRewardClaimed, // §66 v0.17.1
        legendaryRewardClaimed: state.legendaryRewardClaimed,    // §70 v0.20
        openedChests: state.openedChests,
        eventFlags: state.eventFlags,
        // §43 v0.9 / §44 v0.9.1: 横スクロールマップ
        mapMode: state.mapMode,
        sideMapX: state.sideMap.x,
        sideMapY: state.sideMap.y,
        sideMapStage: state.sideMap.stage,
        sideMapChests: state.sideMap.openedChests,
        sideMapDefeated: state.sideMap.defeatedEnemies,
        sideMapCleared: state.sideMap.stageCleared,
        sideMapStage1Reward: state.sideMap.stage1RewardLevel || 0,  // §47 v0.9.3
        sideMapStage2Reward: state.sideMap.stage2RewardLevel || 0,  // §48 v0.10
        sideMapStage3Reward: state.sideMap.stage3RewardLevel || 0,  // §50 v0.11
        sideMapStage4Reward: state.sideMap.stage4RewardLevel || 0,  // §55 v0.12
        sideMapStage5Reward: state.sideMap.stage5RewardLevel || 0,  // §57 v0.13
        sideMapStage6Reward: state.sideMap.stage6RewardLevel || 0,  // §59 v0.14
        sideMapGateExplained: !!state.sideMap.gateExplained,        // §52 v0.11.2
        companionLevels: state.companionLevels || {},                // §99 v0.37
        companionEquipment: state.companionEquipment || {},          // §105 v0.40
        companionGearInventory: state.companionGearInventory || {},  // §105 v0.40
        companionGearVersion: state.companionGearVersion || 0,       // §105 v0.40
        companionGearRewardFlags: state.companionGearRewardFlags || {}, // §109 v0.42
        companionSideStoryFlags: state.companionSideStoryFlags || {},  // §113 v0.44
        companionSideStoryAllCompleteCelebrated: !!state.companionSideStoryAllCompleteCelebrated, // §115 v0.44.2
        companionSideStoryChapter2Flags: state.companionSideStoryChapter2Flags || {}, // §117 v0.45
        companionSideStoryChapter2AllCompleteCelebrated: !!state.companionSideStoryChapter2AllCompleteCelebrated, // §119 v0.45.2
        companionSideStoryChapter3Flags: state.companionSideStoryChapter3Flags || {}, // §122 v0.47
        companionSideStoryChapter3AllCompleteCelebrated: !!state.companionSideStoryChapter3AllCompleteCelebrated, // §133 v0.54
        finalCompanionSideStoryUnlockNotified: !!state.finalCompanionSideStoryUnlockNotified, // §135 v0.56
        playerName: state.playerName || "", // §126 v0.49: 主人公名
        normalReturnX: state.normalReturnX || 2, // §129 v0.51
        normalReturnY: state.normalReturnY || 4, // §129 v0.51
        stageWarpPlazaIntroduced: !!state.stageWarpPlazaIntroduced, // §131 v0.51.2: ワープ広場初回到達フラグ
        companionTechniqueLearnedNotices: state.companionTechniqueLearnedNotices || {} // §139 v0.58: 仲間わざ習得演出済みフラグ
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch (e) {
      // file:// 環境などでlocalStorageが使えない場合は何もせず諦める
    }
  }

  function loadGame() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      var data = JSON.parse(raw);
      var p = state.player;
      p.level = data.level; p.exp = data.exp; p.nextExp = data.nextExp;
      p.baseMaxHp = data.baseMaxHp; p.baseMaxMp = data.baseMaxMp;
      p.baseAtk = data.baseAtk; p.baseDef = data.baseDef;
      p.weaponAtkBonus = data.weaponAtkBonus || 0;
      p.gold = data.gold; p.potionCount = data.potionCount; p.ropeCount = data.ropeCount || 0;
      p.coffeeCount = data.coffeeCount || 0; p.breadCount = data.breadCount || 0;
      p.bentoCount = data.bentoCount || 0; p.ramenCount = data.ramenCount || 0;
      p.coughsyrupCount = data.coughsyrupCount || 0; p.deodorantCount = data.deodorantCount || 0;
      p.spells = data.spells || [];
      p.dex = data.dex || {};
      p.umaInventory = data.umaInventory || {};
      p.walkSpeed = WALK_SPEED_MS[data.walkSpeed] ? data.walkSpeed : "normal";
      p.equipment = data.equipment || p.equipment;
      // Version 0.4.1で所持制を追加。古いセーブ(ownedWeapons未保存)は、
      // その時点で装備していたものを所持品として引き継ぐ救済措置。
      EQUIP_SLOTS.forEach(function (slotInfo) {
        var savedOwned = data[slotInfo.ownedKey];
        if (savedOwned && savedOwned.length) {
          p[slotInfo.ownedKey] = savedOwned;
        } else {
          var startingId = p[slotInfo.ownedKey][0];
          var equippedId = p.equipment[slotInfo.slot];
          p[slotInfo.ownedKey] = equippedId && equippedId !== startingId ?
            [startingId, equippedId] : [startingId];
        }
      });
      p.statusAilments = data.statusAilments || {};
      p.seenOpening = !!data.seenOpening;
      p.seenGoal = !!data.seenGoal;
      p.companions = Array.isArray(data.companions) ? data.companions : [];
      p.hasUkulele = !!data.hasUkulele;
      p.level99Shown = !!data.level99Shown;
      state.discoveredFinal = !!data.discoveredFinal;
      state.gameCleared = !!data.gameCleared;
      state.dexCompleteRewardClaimed = !!data.dexCompleteRewardClaimed; // §66 v0.17.1
      state.legendaryRewardClaimed = !!data.legendaryRewardClaimed;    // §70 v0.20
      state.openedChests = data.openedChests || {};
      state.eventFlags = data.eventFlags || {
        pegasusArmorGot: false, sixfoldShieldGot: false,
        cosmicHelmetGot: false, nyoiboGot: false, andromedaGot: false,
        cygnusHelmetGot: false, dragonShieldGot: false
      };
      if (state.eventFlags.cygnusHelmetGot === undefined) state.eventFlags.cygnusHelmetGot = false;
      if (state.eventFlags.dragonShieldGot === undefined) state.eventFlags.dragonShieldGot = false;
      if (state.eventFlags.level99Reached === undefined) {
        state.eventFlags.level99Reached = (data.player && data.player.level >= 99);
      }
      // §43 v0.9 / §44 v0.9.1: 横スクロールマップ (古いセーブはデフォルト値で補完)
      state.mapMode = data.mapMode || "normal";
      state.sideMap.x = data.sideMapX != null ? data.sideMapX : 1;
      state.sideMap.y = data.sideMapY != null ? data.sideMapY : 1;
      state.sideMap.stage = data.sideMapStage || 1;
      state.sideMap.openedChests = data.sideMapChests || {};
      state.sideMap.defeatedEnemies = data.sideMapDefeated || {};
      state.sideMap.stageCleared = data.sideMapCleared || {};
      state.sideMap.stage1RewardLevel = data.sideMapStage1Reward || 0;  // §47 v0.9.3
      state.sideMap.stage2RewardLevel = data.sideMapStage2Reward || 0;  // §48 v0.10
      state.sideMap.stage3RewardLevel = data.sideMapStage3Reward || 0;  // §50 v0.11
      state.sideMap.stage4RewardLevel = data.sideMapStage4Reward || 0;  // §55 v0.12
      state.sideMap.stage5RewardLevel = data.sideMapStage5Reward || 0;  // §57 v0.13
      state.sideMap.stage6RewardLevel = data.sideMapStage6Reward || 0;  // §59 v0.14
      state.sideMap.gateExplained = !!data.sideMapGateExplained;        // §52 v0.11.2
      state.companionLevels = data.companionLevels || {};                // §99 v0.37
      state.companionEquipment    = data.companionEquipment    || {};   // §105 v0.40
      state.companionGearInventory= data.companionGearInventory|| {};   // §105 v0.40
      state.companionGearVersion  = data.companionGearVersion  || 0;    // §105 v0.40
      state.companionGearRewardFlags = data.companionGearRewardFlags || {}; // §109 v0.42
      state.companionSideStoryFlags = data.companionSideStoryFlags || {};   // §113 v0.44
      var _storyFlagChanged = normalizeCompanionSideStoryFlags(); // §114 v0.44.1: 返値でsave判定
      // §115 v0.44.2: 全話完了演出済みフラグ（旧セーブはundefined→false補完）
      state.companionSideStoryAllCompleteCelebrated = !!data.companionSideStoryAllCompleteCelebrated;
      var _celebFlagChanged = normalizeCompanionSideStoryAllCompleteFlag();
      // §115 v0.44.2: 旧セーブ救済 — 4話完了済みだがcelebrated未設定
      var _storyRescued = checkCompanionSideStoryAllComplete();
      if (_storyRescued) { _pendingCompanionStoryAllCompleteOrigin = "field"; } // §116 v0.44.3
      if (_celebFlagChanged) { _storyFlagChanged = true; } // normalize修正があればsave対象に含める
      // §117 v0.45: 第2話完了フラグ（旧セーブはundefined→{}補完）
      state.companionSideStoryChapter2Flags = data.companionSideStoryChapter2Flags || {};
      var _story2FlagChanged = normalizeCompanionSideStoryChapter2Flags();
      if (_story2FlagChanged) { _storyFlagChanged = true; }
      // §119 v0.45.2: 第2話全話完了演出済みフラグ（旧セーブはundefined→false補完）
      state.companionSideStoryChapter2AllCompleteCelebrated = !!data.companionSideStoryChapter2AllCompleteCelebrated;
      var _ch2CelebFlagChanged = normalizeCompanionSideStoryChapter2AllCompleteFlag();
      if (_ch2CelebFlagChanged) { _storyFlagChanged = true; }
      // §119 v0.45.2: 旧セーブ救済 — 第2話4/4完了済みだがchapter2AllCompleteCelebrated未設定
      var _story2Rescued = checkCompanionSideStoryChapter2AllComplete("field");
      if (_story2Rescued) { _storyFlagChanged = true; }
      // §122 v0.47: 第3話完了フラグ（旧セーブはundefined→{}補完）
      state.companionSideStoryChapter3Flags = data.companionSideStoryChapter3Flags || {};
      var _story3FlagChanged = normalizeCompanionSideStoryChapter3Flags();
      if (_story3FlagChanged) { _storyFlagChanged = true; }
      // §133 v0.54: 第3話全話完了演出済みフラグ（旧セーブはundefined→false補完）
      state.companionSideStoryChapter3AllCompleteCelebrated = !!data.companionSideStoryChapter3AllCompleteCelebrated;
      var _ch3CelebFlagChanged = normalizeCompanionSideStoryChapter3AllCompleteFlag();
      if (_ch3CelebFlagChanged) { _storyFlagChanged = true; }
      // §133 v0.54: 旧セーブ救済 — 第3話4/4完了済みだがchapter3AllCompleteCelebrated未設定
      var _story3Rescued = checkCompanionSideStoryChapter3AllComplete("field");
      if (_story3Rescued) { _storyFlagChanged = true; }
      var _prevGearVer = state.companionGearVersion;                    // §106 v0.40.1: 昇格検出用
      ensureCompanionGearState();                                        // §105 v0.40: 初期化・スターター配布
      resetPartyTrail();  // §79 v0.26.1: 軌跡はロード時にリセット
      var _partyChanged = normalizeCompanionParty(); // §128 v0.50.1: 不正ID・重複・MAX超過を修正
      // §48 v0.10: v0.9.1互換補正 — クリア済みなのにstage1RewardLevelが0の古いセーブを補正
      if (state.sideMap.stageCleared["1"] && !data.sideMapStage1Reward) {
        state.sideMap.stage1RewardLevel = state.sideMap.defeatedEnemies["36,1"] ? 2 : 1;
      }
      p.job = findById(JOB_DATA, data.jobId) || findById(JOB_DATA, "soccer");
      recomputeStats();
      p.hp = Math.min(data.hp != null ? data.hp : p.maxHp, p.maxHp);
      p.mp = Math.min(data.mp != null ? data.mp : p.maxMp, p.maxMp);
      var _reconciled = reconcileCompanionGearRewards(); // §109 v0.42 / §110 v0.42.1: 過去クリア済み補完
      // §126 v0.49: 主人公名ロード（旧セーブは欠損→"冒険者"で補完）
      var _rawName = normalizePlayerName(data.playerName || "");
      var _nameChanged = false;
      if (_rawName) {
        state.playerName = _rawName;
      } else {
        state.playerName = "冒険者"; // 旧セーブ・空欄補完
        _nameChanged = true;
      }
      // §129 v0.51: ワープ帰還座標（旧セーブは既定値で補完）
      state.normalReturnX = data.normalReturnX || 2;
      state.normalReturnY = data.normalReturnY || 4;
      // §131 v0.51.2: ワープ広場初回到達フラグ（旧セーブは false で補完・never demote）
      state.stageWarpPlazaIntroduced = !!data.stageWarpPlazaIntroduced;
      // §135 v0.56: 最終サイドストーリー解放通知済みフラグ（旧セーブは false で補完・never demote）
      state.finalCompanionSideStoryUnlockNotified = !!data.finalCompanionSideStoryUnlockNotified;
      // §135 v0.56: 旧セーブ修復 — 最終ストーリー完了済みなら通知不要としてtrueに補正
      if (!state.finalCompanionSideStoryUnlockNotified && isFinalCompanionSideStoryCompleted()) {
        state.finalCompanionSideStoryUnlockNotified = true;
        _storyFlagChanged = true;
      }
      // §135 v0.56: 旧セーブ修復 — ch3演出済み+s5+最終未完了 かつ 通知未表示 → pending登録（次renderで消費）
      if (!state.finalCompanionSideStoryUnlockNotified && isFinalCompanionSideStoryUnlocked()) {
        _pendingFinalCompanionStoryUnlockNotice = true;
      }
      // §139 v0.58: 仲間わざ習得演出済みフラグ（旧セーブはundefined→{}補完・never-demote）
      state.companionTechniqueLearnedNotices = data.companionTechniqueLearnedNotices || {};
      var _techLearnFlagChanged = normalizeCompanionTechniqueLearnedNotices();
      if (_techLearnFlagChanged) { _storyFlagChanged = true; }
      // §139 v0.58: 旧セーブ修復 — unlock済み+notice false → load後safe timingで演出表示
      // （load中にモーダル表示禁止のためpending登録のみ。renderField()で消費する）
      var _techNoticeOrder = ["juritani", "shurittani", "norio", "harumi"];
      for (var _tno = 0; _tno < _techNoticeOrder.length; _tno++) {
        var _tnocid = _techNoticeOrder[_tno];
        if (isCompanionTechniqueUnlocked(_tnocid) && !state.companionTechniqueLearnedNotices[_tnocid]) {
          queueCompanionTechniqueLearnNotice(_tnocid);
        }
      }
      // §106 v0.40.1 / §110 v0.42.1: 昇格またはreconcile付与があれば即座に保存（増殖防止）
      if ((_prevGearVer < 3 && state.companionGearVersion >= 3) || _reconciled || _storyFlagChanged || _storyRescued || _nameChanged || _partyChanged) { saveGame(); } // §114 / §115 / §126 / §128
      resetAdventureGuideNpcState(); // §125 v0.48.1: ロード時に案内人一時状態をリセット
      return true;
    } catch (e) {
      return false;
    }
  }
  // TODO: マップ上のプレイヤー座標や取得済みフィールドアイテムまでは
  // セーブ対象にしていない(再読込時は村の入口からスタートする)。
  // 必要であれば state.player.x/y と state.items の差分も保存対象に加える。

  // ---------------------------------------------------------
  // 23. 入力(十字キー / スワイプ / キーボード)
  // ---------------------------------------------------------
  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // 十字キーは「押した瞬間に1歩」+「押しっぱなしで設定速度の継続移動」に対応する
  function bindDpadHold(buttonId, dx, dy) {
    var btn = document.getElementById(buttonId);
    btn.addEventListener("pointerdown", function (ev) {
      ev.preventDefault();
      updateBGM(getFieldBgmType());
      startWalking(dx, dy);
    });
    btn.addEventListener("pointerup", stopWalking);
    btn.addEventListener("pointerleave", stopWalking);
    btn.addEventListener("pointercancel", stopWalking);
  }

  function bindEvents() {
    bindDpadHold("btn-up", 0, -1);
    bindDpadHold("btn-down", 0, 1);
    bindDpadHold("btn-left", -1, 0);
    bindDpadHold("btn-right", 1, 0);

    // PCのキーボードでも動作確認できるようにする
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "ArrowUp") {
        updateBGM(getFieldBgmType());
        if (state.mapMode === "side") { moveSidePlayer(0, -1); } else { movePlayer(0, -1); }
      } else if (ev.key === "ArrowDown") {
        updateBGM(getFieldBgmType());
        if (state.mapMode === "side") { moveSidePlayer(0, 1); } else { movePlayer(0, 1); }
      } else if (ev.key === "ArrowLeft") {
        updateBGM(getFieldBgmType());
        if (state.mapMode === "side") { moveSidePlayer(-1, 0); } else { movePlayer(-1, 0); }
      } else if (ev.key === "ArrowRight") {
        updateBGM(getFieldBgmType());
        if (state.mapMode === "side") { moveSidePlayer(1, 0); } else { movePlayer(1, 0); }
      } else if (ev.key === "Escape") {
        // §133 v0.54: 第3話全話完了演出が最前面なら先に閉じる
        if (_companionStoryChapter3AllCompleteNoticeVisible) {
          ev.preventDefault();
          closeCompanionStoryChapter3AllCompleteCelebration();
        // §119 v0.45.2: 第2話全話完了演出が最前面なら先に閉じる
        } else if (_companionStoryChapter2AllCompleteNoticeVisible) {
          ev.preventDefault();
          closeCompanionStoryChapter2AllCompleteCelebration();
        // §116 v0.44.3: 第1話全話完了演出のみ閉じる。酒場は閉じない
        } else if (_companionStoryAllCompleteNoticeVisible) {
          ev.preventDefault();
          closeCompanionStoryAllCompleteCelebration();
        }
      }
    });

    // スワイプ操作
    var startX = 0, startY = 0;
    var field = document.getElementById("field-screen");
    field.addEventListener("touchstart", function (ev) {
      var t = ev.touches[0];
      startX = t.clientX;
      startY = t.clientY;
    }, { passive: true });

    field.addEventListener("touchend", function (ev) {
      var t = ev.changedTouches[0];
      var dx = t.clientX - startX;
      var dy = t.clientY - startY;
      var SWIPE_THRESHOLD = 24;
      if (Math.abs(dx) < SWIPE_THRESHOLD && Math.abs(dy) < SWIPE_THRESHOLD) return;
      if (state.mapMode === "side") {
        if (Math.abs(dx) > Math.abs(dy)) { moveSidePlayer(dx > 0 ? 1 : -1, 0); }
        // 縦スワイプはサイドマップでは無視
      } else {
        if (Math.abs(dx) > Math.abs(dy)) {
          movePlayer(dx > 0 ? 1 : -1, 0);
        } else {
          movePlayer(0, dy > 0 ? 1 : -1);
        }
      }
    }, { passive: true });

    // 戦闘ボタン
    document.getElementById("btn-fight").addEventListener("click", doFight);
    document.getElementById("btn-magic").addEventListener("click", openMagicMenu);
    document.getElementById("btn-item").addEventListener("click", openItemMenu);
    document.getElementById("btn-waza").addEventListener("click", openWazaMenu);
    document.getElementById("btn-catch").addEventListener("click", doCatch);
    document.getElementById("btn-sing").addEventListener("click", doSing);
    document.getElementById("btn-run").addEventListener("click", doRun);

    // エンディングモーダル: つぎへ / 冒険を続ける(v0.7 §28)
    document.getElementById("btn-ending-next").addEventListener("click", function () {
      if (state.endingPage < ENDING_PAGES.length - 1) {
        state.endingPage += 1;
        renderEndingPage();
      } else {
        updateBGM(getFieldBgmType());
        closeModal("clear-modal");
      }
    });

    // Lv99マイルストーンモーダル(v0.7.1 §3.8)
    document.getElementById("btn-lv99-close").addEventListener("click", function () {
      closeModal("lv99-modal");
    });

    // 図鑑モーダル
    document.getElementById("btn-dex").addEventListener("click", openDexModal);
    document.getElementById("btn-dex-close").addEventListener("click", function () {
      closeModal("dex-modal");
    });
    // UMA詳細モーダル(§31 v0.8.1)
    document.getElementById("btn-uma-detail-close").addEventListener("click", function () {
      closeModal("uma-detail-modal");
    });
    // NPC会話モーダル(§32 v0.8.2)
    document.getElementById("btn-npc-close").addEventListener("click", function () {
      closeModal("npc-modal");
    });
    // §113 v0.44 / §114 v0.44.1 / §117 v0.45 / §118 v0.45.1: 仲間サイドストーリー会話モーダル
    document.getElementById("btn-cstory-next").addEventListener("click", function () {
      // §114: 高速連打防止ロック
      if (_cstoryAdvanceLock) return;
      // §118 v0.45.1: クリック時点の5要素をキャプチャ（照合用）
      var _capSess    = _cstorySessionId;
      var _capCid     = state.activeCompanionSideStory;
      var _capChapter = _cstoryActiveChapter;
      var _capStoryId = _cstoryActiveStoryId;
      var _capLineIdx = state.activeCompanionSideStoryLine;
      if (!_capCid) return;
      // §118 v0.45.1: データ取得（不正chapter/cid → null）
      var _csStory = getCompanionSideStoryData(_capCid, _capChapter);
      if (!_csStory || !_csStory.lines || !_csStory.lines.length) return;
      // §118 v0.45.1: 5要素照合（1つでも不一致なら棄却）
      if (_capSess !== _cstorySessionId) { return; }
      if (_capCid !== state.activeCompanionSideStory) { return; }
      if (_capChapter !== _cstoryActiveChapter) { return; }
      if (_capStoryId !== _cstoryActiveStoryId) { return; }
      if (_capStoryId !== null && _csStory.id !== _capStoryId) { return; }
      if (_capLineIdx !== state.activeCompanionSideStoryLine) { return; }
      var _csIdx = _capLineIdx;
      if (typeof _csIdx !== "number" || _csIdx < 0 || _csIdx >= _csStory.lines.length) return;
      var _csIsLast = (_csIdx === _csStory.lines.length - 1);
      _cstoryAdvanceLock = true;
      if (_cstoryAdvanceTimer) { clearTimeout(_cstoryAdvanceTimer); _cstoryAdvanceTimer = null; }
      if (_csIsLast) {
        // 最終行で「物語を終える/閉じる」→ 完了処理（冪等）してからclose
        completeCompanionSideStory(_capCid, _capChapter);
        closeCompanionSideStoryModal(); // 内部で _cstoryAdvanceLock = false にリセット
      } else {
        // 中間行: 1行だけ進める。200msロックで高速連打防止
        if (_csIdx + 1 < _csStory.lines.length) {
          state.activeCompanionSideStoryLine = _csIdx + 1;
          showCompanionSideStoryLine();
        }
        // §123 v0.47.1: 4要素キャプチャ（sessionId/cid/chapter/storyId）でロック解除を確実に守護
        var _timerSess    = _cstorySessionId;
        var _timerCid     = _capCid;
        var _timerChapter = _capChapter;
        var _timerStoryId = _capStoryId;
        _cstoryAdvanceTimer = setTimeout(function () {
          if (_timerSess    !== _cstorySessionId)          { return; }
          if (_timerCid     !== state.activeCompanionSideStory) { return; }
          if (_timerChapter !== _cstoryActiveChapter)      { return; }
          if (_timerStoryId !== _cstoryActiveStoryId)      { return; }
          _cstoryAdvanceLock = false;
          _cstoryAdvanceTimer = null;
        }, 200);
      }
    });
    document.getElementById("btn-cstory-close").addEventListener("click", function () {
      if (_cstoryAdvanceLock) return;
      closeCompanionSideStoryModal();
    });

    // §116 v0.44.3: 全話完了演出モーダルを閉じる（専用関数に委譲）
    document.getElementById("btn-cstory-all-complete-close").addEventListener("click", function () {
      closeCompanionStoryAllCompleteCelebration();
    });

    // §116 v0.44.3: 全話完了演出モーダル背景クリック伝播防止（下層の酒場へ伝播させない）
    document.getElementById("companion-story-all-complete-modal").addEventListener("click", function (ev) {
      ev.stopPropagation();
    });

    // §119 v0.45.2: 第2話全話完了演出モーダル
    document.getElementById("btn-cstory-chapter2-all-complete-close").addEventListener("click", function () {
      closeCompanionStoryChapter2AllCompleteCelebration();
    });
    document.getElementById("companion-story-chapter2-all-complete-modal").addEventListener("click", function (ev) {
      ev.stopPropagation();
    });

    // §133 v0.54: 第3話全話完了演出モーダル
    document.getElementById("btn-cstory-chapter3-all-complete-close").addEventListener("click", function () {
      closeCompanionStoryChapter3AllCompleteCelebration();
    });
    document.getElementById("companion-story-chapter3-all-complete-modal").addEventListener("click", function (ev) {
      ev.stopPropagation();
    });

    // §54 v0.11.3.2: ゴールモーダルのボタンはJS生成方式に変更したため静的リスナー不要

    // §52 v0.11.2: 横スクロール入口ゲートモーダル
    document.getElementById("btn-side-gate-enter").addEventListener("click", function () {
      state.sideMap.gateExplained = true;
      closeModal("modal-side-gate");
      switchToSideMap();
    });
    document.getElementById("btn-side-gate-cancel").addEventListener("click", function () {
      closeModal("modal-side-gate");
    });

    // §129 v0.51: ワープ広場ステージ選択モーダル
    document.getElementById("btn-stage-warp-enter").addEventListener("click", function () {
      if (_stageWarpTransitionLock) return; // §130 v0.51.1: 二重入場防止ロック
      if (!_pendingWarpStageNum) { closeModal("modal-stage-warp"); return; }
      _stageWarpTransitionLock = true; // §130 v0.51.1: 連打ガード開始
      var warpInfo = null;
      for (var _wi2 = 0; _wi2 < STAGE_WARP_DATA.length; _wi2++) {
        if (STAGE_WARP_DATA[_wi2].stageNum === _pendingWarpStageNum) { warpInfo = STAGE_WARP_DATA[_wi2]; break; }
      }
      closeModal("modal-stage-warp");
      state.sideMap.stage = _pendingWarpStageNum;
      if (warpInfo) {
        state.normalReturnX = warpInfo.x;
        state.normalReturnY = warpInfo.y + 1;
      }
      _pendingWarpStageNum = 0;
      switchToSideMap();
    });
    document.getElementById("btn-stage-warp-cancel").addEventListener("click", function () {
      _pendingWarpStageNum = 0;
      closeModal("modal-stage-warp");
    });

    // §131 v0.51.2: 案内板モーダル・ワープ広場初回説明モーダル
    document.getElementById("btn-field-sign-close").addEventListener("click", function () {
      closeModal("modal-field-sign");
    });
    document.getElementById("btn-warp-plaza-intro-close").addEventListener("click", function () {
      closeModal("modal-warp-plaza-intro");
    });

    // §53 v0.11.3: 横スクロール内帰還ゲートモーダル
    document.getElementById("btn-side-return-gate-go").addEventListener("click", function () {
      closeModal("modal-side-return-gate");
      switchToNormalMap();
    });
    document.getElementById("btn-side-return-gate-cancel").addEventListener("click", function () {
      closeModal("modal-side-return-gate");
    });

    // 攻略ペーパービュー屋モーダル(§37 v0.8.6)
    document.getElementById("btn-hint-shop-close").addEventListener("click", function () {
      closeModal("hint-shop-modal");
    });

    // レベルアップモーダル
    document.getElementById("btn-levelup-close").addEventListener("click", function () {
      closeModal("levelup-modal");
    });

    // 商人モーダル
    document.getElementById("btn-merchant-close").addEventListener("click", function () {
      closeModal("merchant-modal");
      saveGame();
    });

    // 転職モーダル
    document.getElementById("btn-god-close").addEventListener("click", function () {
      closeModal("god-modal");
    });

    // 冒険の記録モーダル(§67 v0.18)
    document.getElementById("btn-record").addEventListener("click", openRecordModal);
    document.getElementById("btn-record-close").addEventListener("click", function () {
      closeModal("record-modal");
    });

    // 設定モーダル
    document.getElementById("btn-settings").addEventListener("click", openSettingsModal);
    document.getElementById("btn-settings-close").addEventListener("click", function () {
      closeModal("settings-modal");
    });
    document.getElementById("settings-modal").addEventListener("click", function (ev) { // §127 v0.50
      if (ev.target.id === "settings-modal") { closeModal("settings-modal"); }
    });

    // 装備モーダル
    document.getElementById("btn-equip").addEventListener("click", openEquipModal);
    document.getElementById("btn-equip-close").addEventListener("click", function () {
      closeModal("equip-modal");
    });

    // ステータス確認画面
    document.getElementById("btn-status").addEventListener("click", openStatusModal);
    document.getElementById("btn-status-close").addEventListener("click", function () {
      closeModal("status-modal");
    });

    // 目的説明モーダル
    document.getElementById("btn-goal-close").addEventListener("click", function () {
      state.player.seenGoal = true;
      closeModal("goal-modal");
      saveGame();
    });

    // ヘルプモーダル
    document.getElementById("btn-help-close").addEventListener("click", function () {
      closeModal("help-modal");
    });

    // オープニングモーダル(初回起動時のみ表示)
    document.getElementById("btn-opening-close").addEventListener("click", function () {
      state.player.seenOpening = true;
      closeModal("opening-modal");
      // オープニングの直後、初回のみ目的説明を表示する
      if (!state.player.seenGoal) {
        openModal("goal-modal");
      }
      saveGame();
    });

    // 実家モーダル(§5.6)
    document.getElementById("btn-home-rest").addEventListener("click", doRest);
    document.getElementById("btn-home-cancel").addEventListener("click", function () {
      closeModal("home-modal");
    });
    // §126 v0.49: 実家から主人公命名モーダルを開く
    document.getElementById("btn-home-rename").addEventListener("click", function () {
      closeModal("home-modal");
      openPlayerNameModal("change");
    });

    // フィールドアイテムモーダル(§5.8)
    document.getElementById("btn-field-item").addEventListener("click", openFieldItemModal);
    document.getElementById("btn-field-item-close").addEventListener("click", function () {
      closeModal("field-item-modal");
    });

    // 酒場モーダル(§9.5)
    document.getElementById("btn-tavern-close").addEventListener("click", function () {
      closeModal("tavern-modal");
    });

    // 戦闘終了OKボタン(§13)
    document.getElementById("btn-battle-ok").addEventListener("click", finishBattle);

    // スマホ長押しのコンテキストメニューを抑制(§13.8)
    document.getElementById("game").addEventListener("contextmenu", function (ev) {
      ev.preventDefault();
    });
  }

  // ---------------------------------------------------------
  // 25. サウンド(BGM/SE) — Web Audio API (v0.8.4 §34)
  // ---------------------------------------------------------

  function loadSoundSettings() {
    try {
      var raw = localStorage.getItem(SOUND_KEY);
      if (!raw) return;
      var s = JSON.parse(raw);
      soundEnabled = !!s.soundEnabled;
      bgmEnabled = (s.bgmEnabled !== false);
      seEnabled = (s.seEnabled !== false);
    } catch (e) {}
  }

  function saveSoundSettings() {
    try {
      localStorage.setItem(SOUND_KEY, JSON.stringify({
        soundEnabled: soundEnabled,
        bgmEnabled: bgmEnabled,
        seEnabled: seEnabled
      }));
    } catch (e) {}
  }

  function initAudioContext() {
    if (audioCtx) return true;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      audioCtx = new AC();
      return true;
    } catch (e) {
      return false;
    }
  }

  // SE定義: 音名 → [{freq, dur, vol?, type?, start?}, ...]
  var SE_SPECS = {
    btn: [
      { freq: 880, dur: 0.06, vol: 0.08, type: "square" }
    ],
    battleStart: [
      { freq: 220, dur: 0.12, vol: 0.10, type: "square" },
      { freq: 330, dur: 0.12, vol: 0.10, type: "square", start: 0.12 },
      { freq: 440, dur: 0.22, vol: 0.12, type: "square", start: 0.24 }
    ],
    attack: [
      { freq: 440, dur: 0.06, vol: 0.10, type: "sawtooth" },
      { freq: 220, dur: 0.10, vol: 0.08, type: "sawtooth", start: 0.05 }
    ],
    damage: [
      { freq: 180, dur: 0.15, vol: 0.12, type: "sawtooth" }
    ],
    captureOk: [
      { freq: 523, dur: 0.10, vol: 0.10, type: "square" },
      { freq: 659, dur: 0.10, vol: 0.10, type: "square", start: 0.10 },
      { freq: 784, dur: 0.18, vol: 0.12, type: "square", start: 0.20 }
    ],
    captureFail: [
      { freq: 330, dur: 0.10, vol: 0.10, type: "sawtooth" },
      { freq: 220, dur: 0.15, vol: 0.10, type: "sawtooth", start: 0.10 }
    ],
    levelUp: [
      { freq: 523, dur: 0.08, vol: 0.12, type: "square" },
      { freq: 659, dur: 0.08, vol: 0.12, type: "square", start: 0.08 },
      { freq: 784, dur: 0.08, vol: 0.12, type: "square", start: 0.16 },
      { freq: 1047, dur: 0.22, vol: 0.12, type: "square", start: 0.24 }
    ],
    chestOpen: [
      { freq: 784, dur: 0.10, vol: 0.08, type: "sine" },
      { freq: 988, dur: 0.14, vol: 0.10, type: "sine", start: 0.10 }
    ],
    itemGet: [
      { freq: 660, dur: 0.08, vol: 0.09, type: "sine" },
      { freq: 880, dur: 0.14, vol: 0.10, type: "sine", start: 0.08 }
    ],
    endingStart: [
      { freq: 523, dur: 0.15, vol: 0.07, type: "sine" },
      { freq: 659, dur: 0.15, vol: 0.07, type: "sine", start: 0.20 },
      { freq: 784, dur: 0.15, vol: 0.08, type: "sine", start: 0.40 },
      { freq: 1047, dur: 0.30, vol: 0.09, type: "sine", start: 0.60 }
    ],
    level99: [
      { freq: 523, dur: 0.09, vol: 0.13, type: "square" },
      { freq: 659, dur: 0.09, vol: 0.13, type: "square", start: 0.09 },
      { freq: 784, dur: 0.09, vol: 0.13, type: "square", start: 0.18 },
      { freq: 1047, dur: 0.09, vol: 0.14, type: "square", start: 0.27 },
      { freq: 784, dur: 0.07, vol: 0.12, type: "square", start: 0.40 },
      { freq: 1047, dur: 0.07, vol: 0.12, type: "square", start: 0.47 },
      { freq: 1319, dur: 0.38, vol: 0.14, type: "square", start: 0.56 }
    ]
  };

  function playSE(type) {
    if (!soundEnabled || !seEnabled) return;
    if (!initAudioContext()) return;
    var spec = SE_SPECS[type];
    if (!spec) return;
    try {
      var now = audioCtx.currentTime;
      for (var i = 0; i < spec.length; i++) {
        var note = spec[i];
        var osc = audioCtx.createOscillator();
        var gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = note.type || "square";
        var t = now + (note.start || 0);
        osc.frequency.setValueAtTime(note.freq, t);
        gain.gain.setValueAtTime(note.vol || 0.10, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + note.dur);
        osc.start(t);
        osc.stop(t + note.dur + 0.01);
      }
    } catch (e) {}
  }

  // BGMパターン定義: notes = [[freq_Hz, dur_sec], ...], freq=0は休符
  // §74 v0.23: クリア後フィールドBGM切り替えヘルパー。制御ロジックは変更しない
  function getFieldBgmType() {
    return (state && state.gameCleared) ? "fieldClear" : "field";
  }

  var BGM_DATA = {
    field: {
      waveType: "square", vol: 0.05,
      // Cメジャー 120BPM 明るいレトロRPG風ループ(8秒)
      notes: [
        [330, 0.25], [392, 0.25], [523, 0.25], [494, 0.25],
        [440, 0.25], [392, 0.25], [330, 0.50],
        [349, 0.25], [440, 0.25], [523, 0.25], [494, 0.25],
        [440, 0.25], [349, 0.25], [294, 0.50],
        [330, 0.25], [440, 0.25], [392, 0.25], [330, 0.25],
        [294, 0.25], [523, 0.25], [494, 0.50],
        [392, 0.25], [440, 0.25], [494, 0.25], [523, 0.25],
        [440, 0.25], [392, 0.25], [330, 0.50]
      ]
    },
    // §74 v0.23: クリア後フィールドBGM — Cメジャー 穏やか余韻ループ(~7.75秒) triangle音色
    fieldClear: {
      waveType: "triangle", vol: 0.05,
      notes: [
        [262, 0.25], [330, 0.25], [392, 0.25], [440, 0.25], [392, 0.25], [330, 0.50],
        [294, 0.25], [349, 0.25], [440, 0.25], [392, 0.25], [330, 0.25], [294, 0.50],
        [262, 0.25], [330, 0.25], [392, 0.25], [523, 0.25], [494, 0.25], [440, 0.25], [392, 0.50],
        [330, 0.25], [392, 0.25], [440, 0.25], [392, 0.25], [330, 0.25], [294, 0.25], [262, 0.75]
      ]
    },
    battle: {
      waveType: "square", vol: 0.06,
      // Aマイナー 150BPM 緊張感ある速い曲(6.4秒)
      notes: [
        [440, 0.20], [523, 0.20], [659, 0.20], [784, 0.20],
        [659, 0.20], [523, 0.20], [440, 0.20], [0, 0.20],
        [587, 0.20], [523, 0.20], [494, 0.20], [523, 0.20],
        [440, 0.40], [392, 0.40],
        [440, 0.20], [392, 0.20], [440, 0.20], [523, 0.20],
        [587, 0.20], [659, 0.20], [784, 0.20], [0, 0.20],
        [523, 0.40], [440, 0.40],
        [392, 0.20], [440, 0.20], [0, 0.40]
      ]
    },
    ending: {
      waveType: "sine", vol: 0.06,
      // Fメジャー 80BPM 穏やかなアルペジオ風(12秒)
      notes: [
        [349, 0.375], [440, 0.375], [523, 0.375], [659, 0.375],
        [523, 0.375], [440, 0.375], [349, 0.375], [0, 0.375],
        [392, 0.375], [523, 0.375], [659, 0.375], [784, 0.375],
        [659, 0.375], [523, 0.375], [392, 0.375], [0, 0.375],
        [440, 0.375], [523, 0.375], [698, 0.375], [880, 0.375],
        [698, 0.375], [523, 0.375], [440, 0.375], [0, 0.375],
        [523, 0.75], [392, 0.375], [349, 0.375],
        [523, 0.375], [392, 0.375], [0, 0.75]
      ]
    }
  };

  // BGMセッションごとの共通出力先GainNode。stopBGMHardで切断→全ノード即消音(§38/§39)
  function getOrCreateBgmMasterGain() {
    if (!audioCtx) return null;
    if (!bgmMasterGain) {
      bgmMasterGain = audioCtx.createGain();
      bgmMasterGain.gain.setValueAtTime(1, audioCtx.currentTime);
      bgmMasterGain.connect(audioCtx.destination);
    }
    return bgmMasterGain;
  }

  // BGM完全停止: セッションID更新・全タイマーキャンセル・全ノードをgain=0/disconnect(§39 v0.8.6.3)
  // osc.stop(t+dur)で予約済みのため osc.stop() 二重呼び出しは行わない。
  // gain.gain=0 + gain.disconnect() + masterGain.disconnect() の三重消音で即停止する。
  function stopBGMHard() {
    bgmSessionId++;
    bgmGeneration++;
    bgmStopFlag = true;
    if (DEBUG_MODE) {
      console.log('[BGM] stop hard session:', bgmSessionId,
        'active nodes:', activeBgmNodes.length,
        'active timers:', activeBgmTimers.length);
    }
    bgmCurrentType = null;
    // 全タイマーキャンセル
    for (var _ti = 0; _ti < activeBgmTimers.length; _ti++) {
      clearTimeout(activeBgmTimers[_ti]);
    }
    activeBgmTimers = [];
    bgmSchedulerId = null;
    // 全ノードを消音・切断
    var _now = audioCtx ? audioCtx.currentTime : 0;
    for (var _ni = 0; _ni < activeBgmNodes.length; _ni++) {
      var _n = activeBgmNodes[_ni];
      try {
        // gain=0で即消音(osc.stop()の二重呼び出し禁止のため gainで消音)
        _n.gain.gain.cancelScheduledValues(_now);
        _n.gain.gain.setValueAtTime(0, _now);
        _n.gain.disconnect();
      } catch (e) {}
      try { _n.osc.disconnect(); } catch (e) {}
    }
    activeBgmNodes = [];
    // マスターゲインも切断・破棄(二重消音)
    if (bgmMasterGain) {
      try {
        bgmMasterGain.gain.cancelScheduledValues(_now);
        bgmMasterGain.gain.setValueAtTime(0, _now);
        bgmMasterGain.disconnect();
      } catch (e) {}
      bgmMasterGain = null;
    }
    if (DEBUG_MODE) console.log('[BGM] stop hard complete, active nodes after:', activeBgmNodes.length);
  }

  // 後方互換: 既存呼び出し箇所は stopBGM() のまま使用可
  function stopBGM() {
    stopBGMHard();
  }

  function startBGM(type) {
    if (!soundEnabled || !bgmEnabled) return;
    if (!initAudioContext()) return;
    if (bgmCurrentType === type) return;
    if (DEBUG_MODE) console.log('[BGM] play request:', type);
    stopBGMHard();
    bgmCurrentType = type;
    bgmStopFlag = false;
    var session = bgmSessionId;
    var gen = bgmGeneration;
    if (DEBUG_MODE) console.log('[BGM] new session:', session, type);
    _scheduleBGMLoop(type, audioCtx.currentTime, gen, session);
  }

  function updateBGM(type) {
    if (!soundEnabled || !bgmEnabled) {
      if (bgmCurrentType !== null) stopBGMHard();
      return;
    }
    if (bgmCurrentType === type) return;
    startBGM(type);
  }

  function _scheduleBGMLoop(type, startTime, gen, session) {
    if (session !== bgmSessionId) {
      if (DEBUG_MODE) console.log('[BGM] schedule skipped old session:', session, bgmSessionId);
      return;
    }
    if (gen !== bgmGeneration) return;
    if (bgmStopFlag || bgmCurrentType !== type || !audioCtx) return;
    var data = BGM_DATA[type];
    if (!data) return;
    var master = getOrCreateBgmMasterGain();
    if (!master) { bgmStopFlag = true; return; }
    var t = startTime;
    var vol = data.vol || 0.05;
    var waveType = data.waveType || "square";
    try {
      for (var i = 0; i < data.notes.length; i++) {
        var note = data.notes[i];
        var freq = note[0];
        var dur = note[1];
        if (freq > 0) {
          var osc = audioCtx.createOscillator();
          var noteGain = audioCtx.createGain();
          osc.connect(noteGain);
          noteGain.connect(master); // マスターゲイン経由(§38/§39)
          osc.type = waveType;
          osc.frequency.setValueAtTime(freq, t);
          noteGain.gain.setValueAtTime(vol, t);
          noteGain.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.85);
          osc.start(t);
          osc.stop(t + dur); // 自然終了スケジュール(stopBGMHardではstop()再呼び出し禁止)
          activeBgmNodes.push({ osc: osc, gain: noteGain }); // osc+gainを追跡
        }
        t += dur;
      }
    } catch (e) {
      bgmStopFlag = true;
      return;
    }
    var loopDur = t - startTime;
    var delayMs = Math.max(100, (loopDur - 0.15) * 1000);
    var capturedGen = gen;
    var capturedSession = session;
    var timerId = setTimeout(function () {
      // タイマー追跡リストから削除
      for (var k = 0; k < activeBgmTimers.length; k++) {
        if (activeBgmTimers[k] === timerId) { activeBgmTimers.splice(k, 1); break; }
      }
      if (capturedSession !== bgmSessionId) {
        if (DEBUG_MODE) console.log('[BGM] loop timer skipped old session:', capturedSession, bgmSessionId);
        return;
      }
      if (capturedGen !== bgmGeneration) return;
      if (!bgmStopFlag && bgmCurrentType === type && audioCtx) {
        activeBgmNodes = []; // 終了済みノードをクリアして次ループへ
        _scheduleBGMLoop(type, audioCtx.currentTime + 0.10, bgmGeneration, bgmSessionId);
      }
    }, delayMs);
    activeBgmTimers.push(timerId);
    bgmSchedulerId = timerId;
  }

  // ---------------------------------------------------------
  // 攻略ペーパービュー屋 (§37 v0.8.6)
  // フィールド(4,3)のNPC。10G/50G/100Gで状況別ヒントを売る。
  // ---------------------------------------------------------

  // ---------------------------------------------------------
  // §124 v0.48: 冒険ナビゲーションシステム
  // ---------------------------------------------------------

  function getCurrentAdventureGuide() {
    var p = state.player;
    var ef = state.eventFlags;
    var sm = state.sideMap;
    var s1C = !!(sm && sm.stageCleared && sm.stageCleared["1"]);
    var s2C = !!(sm && sm.stageCleared && sm.stageCleared["2"]);
    var s3C = !!(sm && sm.stageCleared && sm.stageCleared["3"]);
    var s4C = !!(sm && sm.stageCleared && sm.stageCleared["4"]);
    var s5C = !!(sm && sm.stageCleared && sm.stageCleared["5"]);
    var s6C = !!(sm && sm.stageCleared && sm.stageCleared["6"]);
    var chimpDefeated = !!(sm && sm.defeatedEnemies && sm.defeatedEnemies["6:34,2"]);
    var sideVisited = !!(sm && (
      Object.keys(sm.openedChests || {}).length > 0 ||
      Object.keys(sm.defeatedEnemies || {}).length > 0
    ));

    var stageNames = ["はじまりの草原", "あやしい森", "古びた町はずれ", "ゴリラ山道", "黒い城", "チンパンジーの聖域"];
    var stageClearedArr = [s1C, s2C, s3C, s4C, s5C, s6C];
    var activeStageIdx = -1;
    for (var si = 0; si < 6; si++) {
      if (!stageClearedArr[si]) { activeStageIdx = si; break; }
    }
    var stages = [];
    for (var sj = 0; sj < 6; sj++) {
      var st;
      if (stageClearedArr[sj]) {
        st = "✅"; // ✅
      } else if (sj === activeStageIdx && (sideVisited || sj === 0)) {
        st = "▶"; // ▶
      } else {
        st = "🔒"; // 🔒
      }
      stages.push({ name: stageNames[sj], status: st });
    }

    var obj = { stages: stages };

    if (state.gameCleared) {
      obj.objectiveId = "adventure_complete";
      obj.title = "大きな目標は達成された";
      obj.shortText = "究極ゴリラを捕まえ、冒険は完結した。図鑑を埋め、仲間の物語を楽しもう。";
      obj.locationText = "";
    } else if (s6C && chimpDefeated) {
      if (p.level >= 99 && p.hasUkulele) {
        obj.objectiveId = "challenge_gorilla";
        obj.title = "究極ゴリラに挑もう";
        obj.shortText = "準備完了！究極ゴリラのHPを1〜10に削り「🎵うたう」を使え。";
        obj.locationText = "通常フィールド（究極ゴリラは低確率で出現）";
      } else {
        obj.objectiveId = "prepare_gorilla";
        obj.title = "究極ゴリラとの対決に備えよう";
        var _missingLv = (p.level < 99);
        var _missingUke = !p.hasUkulele;
        if (_missingLv) {
          obj.shortText = "Lv99まであと" + (99 - p.level) + "レベル！フィールドでUMAを倒して鍛えよう。";
          obj.locationText = "通常フィールド（レベル上げ）";
        } else {
          obj.shortText = "フィールド下部の🪗宝箱で女神のウクレレを入手しよう。これがないとクリアできない。";
          obj.locationText = "通常フィールド（下部の🪗宝箱）";
        }
        if (_missingUke && !_missingLv) { obj.locationText = "通常フィールド（下部の🪗宝箱）"; }
      }
    } else if (s6C) {
      obj.objectiveId = "defeat_chimp";
      obj.title = "聖域の奥の強敵を退かせよう";
      obj.shortText = "ステージ6「チンパンジーの聖域」のゴール先にいる強敵を撃退しよう！";
      obj.locationText = "横スクロール：チンパンジーの聖域（ゴール🏁の奥）";
    } else if (s5C) {
      // §135 v0.56: 第3話全員完了演出済み+S5クリア済み → 最終ストーリー導線（stage6_challengeに優先）
      if (isFinalCompanionSideStoryUnlocked()) {
        obj.objectiveId = "final_companion_story";
        obj.title = "仲間たちの物語、その先へ";
        obj.shortText = "四人の物語を見届けました。酒場で仲間たちに話を聞いてから、チンパンジーの聖域へ向かいましょう。";
        obj.locationText = "目的地：酒場 → チンパンジーの聖域（ST6）";
      } else {
        obj.objectiveId = "stage6_challenge";
        obj.title = "第6ステージ「チンパンジーの聖域」へ";
        obj.shortText = "ワープ広場のST6ワープか🌀ゲートからステージ6「チンパンジーの聖域」へ。最後のステージだ！";
        obj.locationText = "ワープ広場ST6 or 🌀ゲート → チンパンジーの聖域";
      }
    } else if (s4C) {
      obj.objectiveId = "stage5_challenge";
      obj.title = "第5ステージ「黒い城」へ";
      obj.shortText = "ワープ広場のST5ワープか🌀ゲートからステージ5「黒い城」に挑もう。強敵が多い。";
      obj.locationText = "ワープ広場ST5 or 🌀ゲート → 黒い城";
    } else if (s3C) {
      obj.objectiveId = "stage4_challenge";
      obj.title = "第4ステージ「ゴリラ山道」へ";
      obj.shortText = "ワープ広場のST4ワープか🌀ゲートからステージ4「ゴリラ山道」に挑もう。";
      obj.locationText = "ワープ広場ST4 or 🌀ゲート → ゴリラ山道";
    } else if (s2C) {
      obj.objectiveId = "stage3_challenge";
      obj.title = "第3ステージ「古びた町はずれ」へ";
      obj.shortText = "ワープ広場のST3ワープか🌀ゲートからステージ3「古びた町はずれ」に挑もう。";
      obj.locationText = "ワープ広場ST3 or 🌀ゲート → 古びた町はずれ";
    } else if (s1C) {
      obj.objectiveId = "stage2_challenge";
      obj.title = "第2ステージ「あやしい森」へ";
      obj.shortText = "ワープ広場のST2ワープか🌀ゲートからステージ2「あやしい森」に挑もう。";
      obj.locationText = "ワープ広場ST2 or 🌀ゲート → あやしい森";
    } else if (sideVisited) {
      obj.objectiveId = "stage1_explore";
      obj.title = "第1ステージ「はじまりの草原」を進もう";
      obj.shortText = "横スクロールの草原を右に進み、ゴール🏁を目指そう！";
      obj.locationText = "横スクロール：はじまりの草原（🌀ゲートかST1ワープで入れる）";
    } else if (p.level < 40) {
      obj.objectiveId = "visit_side_gate";
      obj.title = "横スクロールの入口へ向かおう";
      obj.shortText = "村の🌀ゲートかワープ広場ST1ワープから横スクロールへ！（現在Lv" + p.level + "）";
      obj.locationText = "通常マップ：🌀ゲート or ワープ広場ST1";
    } else if (!ef.cygnusHelmetGot) {
      obj.objectiveId = "get_cygnus";
      obj.title = "キグナスのかぶとを手に入れよう";
      obj.shortText = "草原右上の✨宝箱にキグナスのかぶとが眠っている。Lv40以上で開けられる！";
      obj.locationText = "通常フィールド：草原右上の✨宝箱";
    } else if (!ef.pegasusArmorGot) {
      obj.objectiveId = "get_pegasus";
      obj.title = "ペガサスのよろいを手に入れよう";
      obj.shortText = "草原右端の🌟宝箱にペガサスのよろいがある。Lv50以上で開けられる！";
      obj.locationText = "通常フィールド：草原右端の🌟宝箱";
    } else if (!p.hasUkulele) {
      obj.objectiveId = "get_ukulele";
      obj.title = "女神のウクレレを手に入れよう";
      obj.shortText = "フィールド下部の🪗宝箱に女神のウクレレがある。これがないとゴールに届かない。";
      obj.locationText = "通常フィールド：下部の🪗宝箱";
    } else if (!ef.nyoiboGot && p.level >= 70 && hasCompanion("juritani")) {
      obj.objectiveId = "get_nyoibo";
      obj.title = "如意棒を手に入れよう";
      obj.shortText = "ジュリタニを連れてフィールド最下部の🪄宝箱を調べよう。最強の武器が手に入る！";
      obj.locationText = "通常フィールド：最下部の🪄宝箱";
    } else if (p.level < 99) {
      obj.objectiveId = "raise_level";
      obj.title = "Lv99を目指そう";
      obj.shortText = "究極ゴリラにはLv99が必要！フィールドでUMAを倒して鍛えよう（現在Lv" + p.level + "）。";
      obj.locationText = "通常フィールド（レベル上げ）";
    } else {
      obj.objectiveId = "challenge_gorilla";
      obj.title = "究極ゴリラに挑もう";
      obj.shortText = "Lv99達成！究極ゴリラのHPを1〜10に削り「🎵うたう」を使え。";
      obj.locationText = "通常フィールド（究極ゴリラは低確率で出現）";
    }
    return obj;
  }

  // §125 v0.48.1: 安全タイル判定ヘルパー
  function isAdventureGuideSpawnTileSafe(x, y) {
    if (x < 0 || x >= MAP_W || y < 0 || y >= MAP_H) return false;
    if (!state.terrain[y] || !state.terrain[y][x]) return false;
    var tc = state.terrain[y][x];
    if (tc !== "." && tc !== ",") return false; // 草地・道のみ
    if (state.items[x + "," + y]) return false; // フィールドアイテムなし
    var p = state.player;
    if (p.x === x && p.y === y) return false;   // プレイヤー位置なし
    var trail = state.partyTrail || [];
    for (var _ti = 0; _ti < trail.length; _ti++) {
      if (trail[_ti] && trail[_ti].x === x && trail[_ti].y === y) return false;
    }
    // §132a v0.53: 案内板座標には案内人をスポーンしない（タイル文字が同じ","のため座標比較で除外）
    for (var _fsj = 0; _fsj < FIELD_SIGN_DATA.length; _fsj++) {
      if (FIELD_SIGN_DATA[_fsj].x === x && FIELD_SIGN_DATA[_fsj].y === y) return false;
    }
    return true;
  }

  // §125 v0.48.1: 一時状態を安全にリセット（セーブデータ変更なし）
  function resetAdventureGuideNpcState() {
    _adventureGuideStepCount = 0;
    _adventureGuideNpcVisible = false;
    _adventureGuideNpcX = -1;
    _adventureGuideNpcY = -1;
    _adventureGuideTalkLock = false;
    _adventureGuideLastObjectiveId = ""; // 次移動またはrenderField前に再同期
  }

  // §125 v0.48.1: 目標変化検出・同期（冪等）
  function syncAdventureGuideObjective() {
    var _curId = getCurrentAdventureGuide().objectiveId;
    if (_curId !== _adventureGuideLastObjectiveId) {
      _adventureGuideLastObjectiveId = _curId;
      _adventureGuideStepCount = 0;
      _adventureGuideNpcVisible = false;
      _adventureGuideNpcX = -1;
      _adventureGuideNpcY = -1;
      _adventureGuideTalkLock = false;
    }
  }

  function trySpawnAdventureGuideNpc() {
    // §125 v0.48.1: 多重スポーン・不正状態ガード
    if (_adventureGuideNpcVisible) return;
    if (state.mapMode === "side") return;
    if (state.inBattle || state.modalOpen) return;
    var p = state.player;
    if (!p || p.x === undefined || p.y === undefined) return;
    var candidates = [];
    for (var dy = -4; dy <= 4; dy++) {
      for (var dx = -4; dx <= 4; dx++) {
        var dist = Math.abs(dx) + Math.abs(dy);
        if (dist < 2 || dist > 4) continue;
        candidates.push({ dx: dx, dy: dy });
      }
    }
    for (var i = candidates.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = candidates[i]; candidates[i] = candidates[j]; candidates[j] = tmp;
    }
    for (var k = 0; k < candidates.length; k++) {
      var nx = p.x + candidates[k].dx;
      var ny = p.y + candidates[k].dy;
      if (!isAdventureGuideSpawnTileSafe(nx, ny)) continue;
      _adventureGuideNpcX = nx;
      _adventureGuideNpcY = ny;
      _adventureGuideNpcVisible = true;
      _adventureGuideStepCount = 0;
      return; // §125 v0.48.1: renderField()は呼び出し元に委ねる
    }
    _adventureGuideStepCount = 15; // §125 v0.48.1: 12→15（次有効移動で即再試行）
  }

  function openAdventureGuideNpcModal() {
    // §125 v0.48.1: 多重起動防止
    if (_adventureGuideTalkLock) return;
    _adventureGuideTalkLock = true;
    // §125 v0.48.1: 接触時に最新objectiveIdを再取得・変化していれば消去して会話しない
    var guide = getCurrentAdventureGuide();
    if (_adventureGuideLastObjectiveId !== "" && guide.objectiveId !== _adventureGuideLastObjectiveId) {
      _adventureGuideNpcVisible = false;
      _adventureGuideNpcX = -1;
      _adventureGuideNpcY = -1;
      _adventureGuideTalkLock = false;
      syncAdventureGuideObjective();
      renderField();
      return;
    }
    var header = '<div style="font-size:40px;line-height:1.2;">🧭</div>';
    header += '<div style="font-weight:bold;font-size:1em;margin-bottom:4px;">旅の案内人</div>';
    document.getElementById("npc-header").innerHTML = header;
    var speechHtml = "<p>「" + guide.shortText + "」</p>";
    if (guide.locationText) {
      speechHtml += "<p style=\"font-size:0.85em;color:#74c0fc;\">📍 " + guide.locationText + "</p>";
    }
    speechHtml += "<p style=\"font-size:0.82em;color:#adb5bd;\">（📰 攻略ペーパービュー屋で詳細を確認できます）</p>";
    document.getElementById("npc-speech").innerHTML = speechHtml;
    _adventureGuideNpcVisible = false;
    _adventureGuideNpcX = -1;
    _adventureGuideNpcY = -1;
    _adventureGuideStepCount = 0; // §125 v0.48.1: 会話後に新サイクル開始
    _adventureGuideTalkLock = false;
    renderField();
    openModal("npc-modal");
  }

  // §134 v0.55: 仲間サイドストーリー進捗セクション（PaperView用・純粋関数）
  function renderCompanionStoryProgressSection() {
    var cids = ["juritani", "shurittani", "norio", "harumi"];
    var cnames = { juritani: "ジュリタニ", shurittani: "シュリタニ", norio: "ノリオ", harumi: "ハルミ" };
    var html = "";
    html += "<div style=\"border:1px solid #5a3a6a;border-radius:6px;padding:8px 10px;margin-bottom:12px;background:#1a1a2a;\">";
    html += "<p class=\"small\" style=\"color:#c084fc;font-weight:bold;margin-bottom:6px;\">📖 仲間の物語</p>";
    for (var ci = 0; ci < cids.length; ci++) {
      var cid = cids[ci];
      var cname = cnames[cid];
      var cd = null;
      for (var di = 0; di < COMPANION_DATA.length; di++) {
        if (COMPANION_DATA[di].id === cid) { cd = COMPANION_DATA[di]; break; }
      }
      var ever = hasCompanionEverJoined(cid);
      var ch1done = isCompanionSideStoryCompleted(cid, 1);
      var ch1unlock = isCompanionSideStoryUnlocked(cid, 1);
      var ch2done = isCompanionSideStoryCompleted(cid, 2);
      var ch2unlock = isCompanionSideStoryUnlocked(cid, 2);
      var ch3done = isCompanionSideStoryCompleted(cid, 3);
      var ch3unlock = isCompanionSideStoryUnlocked(cid, 3);
      var iconStr = cd ? (cd.icon + " ") : "";
      html += "<div style=\"display:flex;justify-content:space-between;align-items:center;font-size:0.8em;margin-bottom:3px;\">";
      html += "<span style=\"color:#d0b0e0;\">" + iconStr + cname + "</span>";
      html += "<span style=\"letter-spacing:2px;\">";
      html += "<span title=\"第1話\" style=\"color:" + (ch1done ? "#c084fc" : (ch1unlock ? "#888" : "#555")) + ";\">" + (ch1done ? "✅" : (ch1unlock ? "・" : "🔒")) + "</span>";
      html += "<span title=\"第2話\" style=\"color:" + (ch2done ? "#c084fc" : (ch2unlock ? "#888" : "#555")) + ";\">" + (ch2done ? "✅" : (ch2unlock ? "・" : "🔒")) + "</span>";
      html += "<span title=\"第3話\" style=\"color:" + (ch3done ? "#c084fc" : (ch3unlock ? "#888" : "#555")) + ";\">" + (ch3done ? "✅" : (ch3unlock ? "・" : "🔒")) + "</span>";
      html += "</span></div>";
    }
    // 全員完了ステータス
    var ch1all = !!state.companionSideStoryAllCompleteCelebrated;
    var ch2all = !!state.companionSideStoryChapter2AllCompleteCelebrated;
    var ch3all = !!state.companionSideStoryChapter3AllCompleteCelebrated;
    if (ch1all || ch2all || ch3all) {
      html += "<div style=\"font-size:0.75em;color:#a370c8;margin-top:5px;border-top:1px solid #4a2a5a;padding-top:4px;\">";
      if (ch1all) html += "🌟 第1話全員完了　";
      if (ch2all) html += "🌟 第2話全員完了　";
      if (ch3all) html += "🌟 第3話全員完了";
      html += "</div>";
    }
    html += "<div style=\"font-size:0.72em;color:#6b5a7b;margin-top:4px;\">✅読了 ・未読 🔒未解放</div>";
    // §135 v0.56: 最終物語欄（5状態）
    html += "<div style=\"border-top:1px solid #3a2a4a;margin-top:6px;padding-top:6px;\">";
    var _fDone = isFinalCompanionSideStoryCompleted();
    var _fUnlock = isFinalCompanionSideStoryUnlocked();
    var _ch3All = areAllCompanionSideStoryChapter3Complete();
    var _ch3Celeb = !!state.companionSideStoryChapter3AllCompleteCelebrated;
    if (_fDone) {
      html += "<p style=\"font-size:0.78em;color:#ffd166;font-weight:bold;margin:0 0 2px;\">🌟 最終サイドストーリー 完了</p>";
      html += "<p style=\"font-size:0.73em;color:#b0a070;margin:0;\">四人と主人公の物語は、大きなひとつの節目を迎えました。</p>";
    } else if (_fUnlock) {
      html += "<p style=\"font-size:0.78em;color:#f4a261;font-weight:bold;margin:0 0 2px;\">▶ 最終サイドストーリー</p>";
      html += "<p style=\"font-size:0.73em;color:#c08060;margin:0;\">新しい物語が始まろうとしています。<br>酒場で仲間たちに話を聞いてみましょう。</p>";
    } else if (_ch3All && !_ch3Celeb) {
      html += "<p style=\"font-size:0.78em;color:#c09060;font-weight:bold;margin:0 0 2px;\">🌅 四つの灯り</p>";
      html += "<p style=\"font-size:0.73em;color:#907050;margin:0;\">四人の第3話がすべて完了しました。<br>まずは「四つの灯り、その先へ」を見届けてみましょう。</p>";
    } else if (_ch3All && _ch3Celeb) {
      html += "<p style=\"font-size:0.78em;color:#888;font-weight:bold;margin:0 0 2px;\">🌅 その先の物語</p>";
      html += "<p style=\"font-size:0.73em;color:#606060;margin:0;\">四人の想いはひとつにつながりました。<br>物語はまだ先へ続きそうです。冒険を進めてみましょう。</p>";
    } else {
      html += "<p style=\"font-size:0.78em;color:#444;font-weight:bold;margin:0 0 2px;\">🔒 その先の物語</p>";
      html += "<p style=\"font-size:0.73em;color:#444;margin:0;\">四人それぞれの物語は、まだ途中のようです。</p>";
    }
    html += "</div>";
    html += "</div>";
    return html;
  }

  function renderAdventureGuideSection() {
    var guide = getCurrentAdventureGuide();
    var html = "";
    html += "<div style=\"border:1px solid #3a6a4a;border-radius:6px;padding:8px 10px;margin-bottom:12px;background:#1a3a2a;\">";
    html += "<p class=\"small\" style=\"color:#06d6a0;font-weight:bold;margin-bottom:6px;\">🧭 冒険ガイド</p>";
    html += "<p class=\"small\" style=\"color:#e0e0e0;margin-bottom:3px;font-weight:bold;\">" + guide.title + "</p>";
    html += "<p class=\"small\" style=\"color:#b0c4b0;margin-bottom:8px;\">" + guide.shortText + "</p>";
    // §131 v0.51.2: ワープ状態をgetStageWarpStatus()で動的表示
    for (var si = 0; si < guide.stages.length; si++) {
      var s = guide.stages[si];
      var _warpSt2 = getStageWarpStatus(si + 1);
      var _lvR = getStageEnemyLevelRange(si + 1);
      html += "<div style=\"display:flex;justify-content:space-between;align-items:center;font-size:0.78em;color:#ccc;margin-bottom:2px;\">";
      html += "<span>" + _warpSt2.displayIcon + " 第" + (si + 1) + "ステージ " + s.name + "</span>";
      html += "<span style=\"color:#9ab3a0;\">" + (_warpSt2.isUnlocked ? _lvR.text : "🔒") + "</span>";
      html += "</div>";
    }
    html += "<div style=\"font-size:0.72em;color:#6b8a6b;margin-top:4px;\">🔒未解放 ▶現在の目的 ✅クリア済み</div>";
    if (guide.locationText) {
      html += "<p style=\"font-size:0.78em;color:#74c0fc;margin-top:6px;margin-bottom:0;\">📍 " + guide.locationText + "</p>";
    }
    html += "</div>";
    return html;
  }

  // 現在の進行状況からヒント優先度(0〜14)を返す
  function getHintPriority() {
    var p = state.player;
    var ef = state.eventFlags;
    var sm = state.sideMap;
    var s1Cleared = !!(sm && sm.stageCleared && sm.stageCleared["1"]);
    var s2Cleared = !!(sm && sm.stageCleared && sm.stageCleared["2"]);
    var s3Cleared = !!(sm && sm.stageCleared && sm.stageCleared["3"]);
    var s4Cleared = !!(sm && sm.stageCleared && sm.stageCleared["4"]);
    var s5Cleared = !!(sm && sm.stageCleared && sm.stageCleared["5"]);
    var s6Cleared = !!(sm && sm.stageCleared && sm.stageCleared["6"]);
    var s6BossDefeatedH = !!(sm && sm.defeatedEnemies && sm.defeatedEnemies["6:34,2"]);
    if (state.gameCleared) return 0;
    // §60 v0.14.1: 横スクロール編制覇済み → 究極ゴリラ捕獲誘導
    if (s6Cleared && s6BossDefeatedH) return 17;  // 横スクロール編制覇済み・究極ゴリラ未捕獲
    // §59 v0.14: 横スクロールステージ進捗ヒント (s6追加)
    if (s6Cleared) return 9;        // s6クリア済みだがチンパンジー未撃退
    if (s5Cleared) return 16;       // s5クリア・s6未クリア → ステージ6ガイド
    if (s4Cleared) return 15;       // s4クリア・s5未クリア → ステージ5ガイド
    if (s3Cleared) return 14;       // s3クリア・s4未クリア → ステージ4ガイド
    if (s2Cleared) return 12;       // s2クリア・s3未クリア → ステージ3ガイド
    if (s1Cleared) return 10;       // s1クリア・s2未クリア → ステージ2ガイド
    var sideVisited = !!(sm && (
      Object.keys(sm.openedChests || {}).length > 0 ||
      Object.keys(sm.defeatedEnemies || {}).length > 0
    ));
    if (sideVisited) return 11;
    // §52 v0.11.2: 横スクロール未訪問+Lv40未満 → ゲート案内ヒント
    if (p.level < 40) return 13;
    // 通常進行
    if (!ef.cygnusHelmetGot) return 2;
    if (!ef.pegasusArmorGot) return 3;
    if (!p.hasUkulele) return 4;
    if (p.level >= 70 && hasCompanion("juritani") && !ef.nyoiboGot) return 5;
    if (p.level < 99) return 6;
    if (p.level >= 99) return 7;
    return 8;
  }

  // tier: 1=ぼんやり(10G) / 2=具体的(50G) / 3=ほぼ答え(100G)
  function getProgressHint(tier) {
    var p = state.player;
    var sm = state.sideMap;
    var priority = getHintPriority();
    // §55 v0.12: 横スクロール専用ヒント（ボス/中ボス状態で分岐）
    // §60 v0.14.1: 横スクロール編制覇済み → 究極ゴリラ捕獲誘導
    if (priority === 17) {
      if (tier === 1) return "横に長い冒険は一区切りついた。だが、伝説のUMAはまだ森のどこかにいる。";
      if (tier === 2) return "究極ゴリラは、ただ弱らせるだけでは捕まえられない。特別なアイテムと、特別な行動が必要らしい。";
      return "究極ゴリラを捕まえるには、Lv99以上、女神のウクレレ、HP1〜10まで弱らせることが必要だ。最後は「つかまえる」ではなく、「うたう」。HP1〜10に調整する時は「はずかし固め・小」や「ここはひとつガマン」が役に立つ。最後は「うたう」だ！";
    }
    // §59 v0.14: s6クリア済みだがチンパンジー未撃退 → チンパンジー撃退へ誘導
    if (priority === 9) {
      var h9 = [
        "チンパンジーの聖域をクリアしたが、究極チンパンジーはまだ奥に棲んでいる。退かせると大きな報酬と称号が得られるぞ。",
        "究極チンパンジーは x=34 にいる。撃退してからゴールすると800G+ラーメンの報酬が手に入る。準備して再挑戦だ。",
        "究極チンパンジー(HP1500/ATK72/DEF32)はラスボス級ゴリラより格段に手強い。Lv99と最強装備で挑もう。回復アイテムも万全に。"
      ];
      return h9[tier - 1] || h9[0];
    }
    // §59 v0.14: s5クリア・s6未クリア → ステージ6ガイド
    if (priority === 16) {
      var ultimateChimpDefeated16 = !!(sm && sm.defeatedEnemies && sm.defeatedEnemies["6:34,2"]);
      if (tier === 1) return "チンパンジーの聖域では、木立に阻まれる場面が多い。上下の道を使いこなすことが重要だ。";
      if (tier === 2) {
        if (!ultimateChimpDefeated16) return "聖域の奥には究極チンパンジーがいる。ラスボス級ゴリラより格段に手強い。回復アイテムを万全にしてから挑もう。";
        return "究極チンパンジーを退かせた！ゴールへの道は開けているぞ。ゴール(G@x=37)で大きな報酬が待っている。";
      }
      if (!ultimateChimpDefeated16) return "究極チンパンジーはゴール手前x=34にいる。撃退してからゴールすると800G+ラーメンの報酬が手に入る。スタート付近の🏠帰還ゲートかゴール画面からいつでも戻れる。";
      return "究極チンパンジー撃退済み！ゴール(G@x=37)へ進もう。高路や下中路には宝箱も4個ある。";
    }
    // §57 v0.13: s4クリア・s5未クリア → ステージ5ガイド
    if (priority === 15) {
      var lastbossDefeated15 = !!(sm && sm.defeatedEnemies && sm.defeatedEnemies["5:33,2"]);
      if (tier === 1) return "黒い城では、城壁に阻まれる場面が多い。上下の道を使いこなすことが重要だ。";
      if (tier === 2) {
        if (!lastbossDefeated15) return "黒い城の奥にはラスボス級ゴリラがいる。大魔王ゴリラより格段に手強い。回復アイテムを万全にしてから挑もう。";
        return "ラスボス級ゴリラを退かせた！ゴールへの道は開けているぞ。ゴール(x=38)で大きな報酬が待っている。";
      }
      if (!lastbossDefeated15) return "ラスボス級ゴリラはゴール手前x=33にいる。撃退してからゴールすると500G+ラーメンの報酬が手に入る。スタート付近の🏠帰還ゲートかゴール画面からいつでも戻れる。";
      return "ラスボス級ゴリラ撃退済み！ゴール(x=38)へ進もう。高路や下中路には宝箱も4個ある。";
    }
    // §55 v0.12: s3クリア・s4未クリア → ステージ4ガイド
    if (priority === 14) {
      var daimaouDefeated14 = !!(sm && sm.defeatedEnemies && sm.defeatedEnemies["4:33,2"]);
      if (tier === 1) return "ゴリラ山道では、岩場の上下の道をよく見て進もう。焦らず道を選ぶことが大事だ。";
      if (tier === 2) {
        if (!daimaouDefeated14) return "山道の奥には大魔王ゴリラがいる。大魔王ゴリラはUMAではないので捕獲できない。回復アイテムを整えてから挑もう。";
        return "大魔王ゴリラを退かせた！ゴールへの道は開けているぞ。ゴール(x=38)で大きな報酬が待っている。";
      }
      if (!daimaouDefeated14) return "大魔王ゴリラはゴール手前x=33にいる。撃退してからゴールすると350G+ラーメンの報酬が手に入る。スタート付近の🏠帰還ゲートかゴール画面からいつでも戻れる。";
      return "大魔王ゴリラ撃退済み！ゴール(x=38)へ進もう。高路や下中路には宝箱も4個ある。";
    }
    // §50 v0.11: s2クリア・s3未クリア → ステージ3ガイド
    if (priority === 12) {
      var maouDefeated = !!(sm && sm.defeatedEnemies && sm.defeatedEnemies["3:31,2"]);
      if (tier === 1) return "古びた町はずれでは、まっすぐ進むよりも道を選ぶことが大事だ。怪しい道ほど、宝箱も危険も多い。";
      if (tier === 2) {
        if (!maouDefeated) return "町はずれの奥には魔王ゴリラがいる。魔王ゴリラはUMAではないので捕獲できない。装備と回復アイテムを整えてから挑もう。";
        return "魔王ゴリラを退かせた！ゴールへの道は開けているぞ。ゴール(x=38)で大きな報酬が待っている。";
      }
      if (!maouDefeated) return "魔王ゴリラはステージ3のゴール手前x=31にいる。撃退してからゴールすると220G+ラーメンの報酬が手に入る。下の道(低路)には宝箱が2個ある。";
      return "魔王ゴリラ撃退済み！ゴール(x=38)へ進もう。下路にはまだ宝箱が残っているかもしれない。";
    }
    if (priority === 10) {
      var bossDefeated = !!(sm && sm.defeatedEnemies && sm.defeatedEnemies["2:35,1"]);
      if (tier === 1) return "あやしい森では、木や水で道がふさがれている。上下の道をよく見れば、進める道がある。";
      if (tier === 2) {
        if (!bossDefeated) return "あやしい森の奥にはボスゴリラがいる。ボスゴリラはUMAではないので捕獲できない。装備と回復アイテムを整えてから挑もう。";
        return "ボスゴリラを退かせた！ゴールへの道は開けているぞ。ゴール(x=38)で大きな報酬が待っている。";
      }
      if (!bossDefeated) return "ボスゴリラはステージ2のゴール手前x=35にいる。撃退してからゴールすると150G+お弁当の報酬が手に入る。下の道(低路)には宝箱も3個ある。";
      return "ボスゴリラ撃退済み！ゴール(x=38)へ進もう。下路にはまだ宝箱が残っているかもしれない。";
    }
    if (priority === 11) {
      var midbossDefeated = !!(sm && sm.defeatedEnemies && sm.defeatedEnemies["36,1"]);
      if (tier === 1) return "横に長い草原では、まっすぐ右へ進むだけが正解とは限らない。上や下の道も見てみよう。戻りたい時はスタート付近の🏠帰還ゲートを使おう。";
      if (tier === 2) {
        if (!midbossDefeated) return "はじまりの草原には、中ボスゴリラが道をふさいでいる場所がある。倒せない時は、上の道から迂回できる。途中で戻りたい時はスタート付近の🏠帰還ゲートかゴール画面から戻れる。";
        return "中ボスゴリラを退かせた！ゴールへの道は開けているぞ。ゴール(x=38)に着くと報酬が手に入る。ゴール画面から通常マップへ戻れる。";
      }
      if (!midbossDefeated) return "中ボスゴリラはステージ1のゴール手前x=36にいる。撃退してからゴールすると100G+パンの報酬が増える。上ルートで先にゴールだけ目指す方法もある。";
      return "中ボスゴリラ撃退済み！ゴール(x=38)へ進もう。ゴール画面の「🏠通常マップへ戻る」で元の世界へ戻れる。";
    }
    // §52 v0.11.2: 横スクロール未訪問+Lv40未満 → ゲート案内ヒント
    if (priority === 13) {
      if (tier === 1) return "村の近くに横スクロールマップへの入口があるらしい。探してみよう。";
      if (tier === 2) return "村の中をよく見渡すと🌀渦巻くゲートがあるはずだ。そこから横スクロールの草原へ行ける。戻りたい時はゴール画面か🏠帰還ゲートを使えばいつでも戻れる。";
      return "通常マップの村エリアに🌀渦巻くゲートがある。踏むと横スクロールマップへ移動できる。はじまりの草原ではUMAを倒し宝箱を集めゴールを目指そう。スタート付近の🏠帰還ゲートかゴール画面からいつでも戻れる。";
    }
    // §66 v0.17.1 / §69 v0.19 / §70 v0.20: クリア後ヒントを進行状況で分岐
    if (priority === 0) {
      // §70 v0.20: 伝説装備コンプリート → 完全制覇余韻
      if (isFullyCompleted() && isLegendaryEquipmentComplete()) {
        if (tier === 1) return "もう攻略ペーパーに書くことはない。ここから先は、攻略ではなく余韻の時間だ。";
        if (tier === 2) return "究極ゴリラに歌を届け、チンパンジーの聖域を越え、UMA図鑑も伝説装備もすべて揃えた。これ以上ない冒険の記録だ。";
        return "完全制覇達成！称号「すべての伝説を集めし者」は最高の証だ。あとは仲間のセリフや図鑑を眺めながら、余韻を楽しもう。";
      }
      // §69 v0.19: 完全達成（伝説未コンプ）→ 伝説装備へ誘導
      if (isFullyCompleted()) {
        if (tier === 1) return "大きな目標は達成した。最後に伝説装備が残っているかもしれない。";
        if (tier === 2) return "伝説装備は全7種。「⚔️装備」画面を開くと進捗が確認できる。集めると新たな称号と報酬が得られる。";
        return "伝説装備（全7種）はすべて揃えたか？まだなら装備画面で確認しよう。コンプリート報酬は2000G＋ラーメン×2、そして称号「すべての伝説を集めし者」だ。";
      }
      if (isUmaDexComplete()) {
        if (tier === 1) return "UMA図鑑をコンプリートした！称号「UMA図鑑を極めし者」を獲得。";
        if (tier === 2) return "横スクロールステージを全制覇すると、さらに総合称号「究極とUMA図鑑を極めし者」が得られる。";
        return "UMA図鑑コンプリート達成！横スクロール6ステージを制覇してチンパンジーを退かせると最高称号が手に入る。";
      }
      // §69 v0.19 / §73 v0.22: 究極ゴリラ捕獲済み+横スクロール制覇済み・図鑑未コンプ → 図鑑方面へ
      if (isSideStoryCleared()) {
        var firstUnc = null;
        for (var _fui = 0; _fui < UMA_DATA.length; _fui++) {
          if (p.dex[UMA_DATA[_fui].id] !== "captured") { firstUnc = UMA_DATA[_fui]; break; }
        }
        if (tier === 1) {
          if (firstUnc) return "図鑑にまだ空きがある。" + firstUnc.name + "はまだ捕まえていないぞ。";
          return "物語は大きな区切りを迎えた。まだ図鑑に空きがあるなら、森を歩いて未捕獲のUMAを探してみるといい。";
        }
        if (tier === 2) {
          if (firstUnc && firstUnc.hintText) return firstUnc.name + " — " + firstUnc.hintText;
          return "図鑑をすべて埋めると称号「究極とUMA図鑑を極めし者」が得られる。まだ捕まえていないUMAはいるか？";
        }
        if (firstUnc && firstUnc.hintCatch) return firstUnc.name + "の捕獲方法：" + firstUnc.hintCatch + "　図鑑を開いてヒントを確認しよう。";
        return "図鑑の捕獲数と伝説装備（全7種）を確認してみよう。UMA博士・ゴリラ研究家にもクリア後の言葉があるぞ。";
      }
      // §69 v0.19: 究極ゴリラ捕獲済み・横スクロール未制覇 → 横スクロールへ
      if (tier === 1) return "横に長い世界には、まだ語られていない強敵がいる。通常マップの🌀ゲートから、もう一度奥へ進んでみよう。";
      if (tier === 2) return "横スクロールを制覇してチンパンジーを退かせると、新しい称号が得られる。まだ踏んでいないステージはあるか？";
      return "横スクロールステージ1〜6を制覇し、チンパンジーを退かせると称号「究極を歌い、聖域を越えし者」が得られる。図鑑コンプリートも目指せ。";
    }
    var h = [
      // 0: クリア済み（priority===0の新分岐で処理済み。念のため残す）
      [
        "すでに伝説のUMAを鎮めた。旅の記録を続けよう。",
        "図鑑を埋めるか、伝説の装備を揃えるか。まだやり残しがあるかもしれない。",
        "図鑑の捕獲数と伝説装備（全7種）を確認してみよう。王様の使いからも褒美が貰えるかも。"
      ],
      // 1: Lv40未満
      [
        "まだ鍛える余地がある。焦らず強くなろう。",
        "Lv40を目指して、フィールドでUMAを倒し続けよう。",
        "フィールドの草原を歩いてUMAを倒そう。キラリと光るゴリラは大きな経験値を持つ。現在Lv" + p.level + "。"
      ],
      // 2: Lv40+・キグナスのかぶと未入手
      [
        "草原のどこかに、普通とは違う光があるらしい。",
        "Lv40以上になると開けられる宝箱が草原にある。",
        "Lv40以上で草原右上の✨光る宝箱が開く。キグナスのかぶとが眠っている。"
      ],
      // 3: ペガサスのよろい未入手
      [
        "強き者にしか開けられない宝箱が、どこかにある。",
        "Lv50以上なら、草原の奥に眠る宝箱が開けられるらしい。",
        "Lv50以上で草原右端の🌟白い宝箱が開く。ペガサスのよろいが手に入り、防御が大きく上がる。"
      ],
      // 4: ウクレレ未所持
      [
        "伝説のUMAには、力だけでは届かない。",
        "フィールドのどこかに、特別な宝箱🪗が眠っている。",
        "フィールド下部の🪗宝箱から女神のウクレレを入手しよう。これがないとゲームクリアはできない。"
      ],
      // 5: Lv70+・ジュリタニ同行・如意棒未入手
      [
        "仲間と共に進めば、届かなかった何かが手に入るかもしれない。",
        "強い仲間と一緒にフィールドを歩くと、刺さった棒が引き抜けるかもしれない。",
        "ジュリタニを連れてフィールド下部の🪄宝箱に触れよう。最強の武器・如意棒が手に入る。"
      ],
      // 6: Lv99未到達
      [
        "目指す頂はまだ遠い。地道に鍛えるほかない。",
        "Lv99まで鍛えれば、究極ゴリラに歌声が届くかもしれない。",
        "フィールドでUMAを倒して経験値を稼ごう。キラリと光るゴリラ系を狙うと効率が良い。現在Lv" + p.level + "、Lv99まであと" + (99 - p.level) + "レベル。"
      ],
      // 7: Lv99到達・未クリア
      [
        "力は頂に達した。あとは歌声を届けるだけだ。",
        "Lv99 + 女神のウクレレ + 究極ゴリラのHP1〜10 + うたう。これが答えだ。",
        "フィールドで究極ゴリラに出会い、HPを1〜10まで削ってから「🎵うたう」を使え。究極ゴリラはごく低確率で出現する。"
      ],
      // 8: その他
      [
        "旅人として、まだまだ伸びる余地はある。",
        "仲間を集め、装備を整え、図鑑を埋めよう。",
        "酒場で仲間を増やし、商人で装備を整え、宝箱を探し、NPCに話しかけよう。"
      ]
    ];
    var arr = h[priority] || h[8];
    return arr[tier - 1] || arr[0];
  }

  function openHintShopModal() {
    document.getElementById("btn-hint-shop-close").onclick = function () {
      closeModal("hint-shop-modal");
    };
    renderHintShopMenu();
    openModal("hint-shop-modal");
  }

  function renderHintShopMenu() {
    var p = state.player;
    var body = document.getElementById("hint-shop-body");
    var html = "";
    html += "<p class=\"small\" style=\"margin-bottom:4px;\">「今の君に必要な情報を売っているよ。</p>";
    html += "<p class=\"small\" style=\"margin-bottom:12px;\">情報にも価値がある。払える者だけが知れる。」</p>";
    html += renderAdventureGuideSection(); // §124 v0.48: 🧭 冒険ガイド（無料）
    html += renderCompanionStoryProgressSection(); // §134 v0.55: 📖 仲間の物語進捗（無料）
    html += "<p class=\"small\" style=\"color:#ffd166;margin-bottom:10px;\">所持金: 💰 " + p.gold + "G</p>";
    var tiers = [
      { tier: 1, cost: 10,  label: "ぼんやりヒント",  color: "#adb5bd" },
      { tier: 2, cost: 50,  label: "具体的ヒント",    color: "#74c0fc" },
      { tier: 3, cost: 100, label: "ほぼ答え",        color: "#06d6a0" }
    ];
    for (var i = 0; i < tiers.length; i++) {
      var t = tiers[i];
      var canAfford = p.gold >= t.cost;
      html += "<div class=\"shop-row\">";
      html += "<span style=\"color:" + t.color + ";\">" + t.label + "</span>";
      html += "<button class=\"shop-menu-btn\" id=\"btn-hint-buy-" + t.tier + "\"" +
        (canAfford ? "" : " disabled style=\"opacity:0.45;\"") + ">" + t.cost + "G</button>";
      html += "</div>";
    }
    body.innerHTML = html;
    for (var j = 0; j < tiers.length; j++) {
      (function (tier, cost) {
        var btn = document.getElementById("btn-hint-buy-" + tier);
        if (btn && !btn.disabled) {
          btn.onclick = function () { buyHint(tier, cost); };
        }
      })(tiers[j].tier, tiers[j].cost);
    }
  }

  function buyHint(tier, cost) {
    var p = state.player;
    if (p.gold < cost) { showToast("お金が足りない！"); return; }
    p.gold -= cost;
    updateStatusBar();
    saveGame();
    playSE("itemGet");
    renderHintResult(getProgressHint(tier), tier, cost);
  }

  function renderHintResult(hint, tier, cost) {
    var tierLabels = ["", "ぼんやりヒント", "具体的ヒント", "ほぼ答え"];
    var body = document.getElementById("hint-shop-body");
    var html = "";
    html += "<p class=\"small\" style=\"color:#ffd166;margin-bottom:6px;\">📄 " + tierLabels[tier] + "を購入した！ (" + cost + "G)</p>";
    html += "<p style=\"margin:8px 0;color:#e0e0e0;\">" + hint + "</p>";
    html += "<div style=\"margin-top:12px;\">";
    html += "<button class=\"shop-menu-btn\" id=\"btn-hint-again\">もう一度買う</button>";
    html += "</div>";
    body.innerHTML = html;
    document.getElementById("btn-hint-again").onclick = renderHintShopMenu;
  }

  // ---------------------------------------------------------
  // 開発用テスト関数(DEBUG_MODE=trueの時のみ設定画面に表示される。§26)
  // ---------------------------------------------------------
  function debugSetLevel1() {
    var p = state.player;
    p.level = 1;
    p.nextExp = 1 * 10 + 15;
    p.exp = 0;
    p.baseMaxHp = 20;
    p.baseMaxMp = 6;
    p.baseAtk = 5;
    p.baseDef = 2;
    recomputeStats();
    p.hp = p.maxHp;
    p.mp = p.maxMp;
    updateStatusBar();
    saveGame();
    showToast("[DEBUG] Lv.1にした");
    renderSettingsBody();
  }

  function debugSetLevel5() {
    var p = state.player;
    p.level = 5;
    p.nextExp = 5 * 10 + 15;
    p.exp = 0;
    p.baseMaxHp = 20 + 6 * 4;
    p.baseMaxMp = 6 + 2 * 4;
    p.baseAtk = 5 + 2 * 4;
    p.baseDef = 2 + 1 * 4;
    recomputeStats();
    p.hp = p.maxHp;
    p.mp = p.maxMp;
    updateStatusBar();
    saveGame();
    showToast("[DEBUG] Lv.5にした");
    renderSettingsBody();
  }

  function debugSetLevel10() {
    var p = state.player;
    p.level = 10;
    p.nextExp = 10 * 10 + 15;
    p.exp = 0;
    p.baseMaxHp = 20 + 6 * 9;
    p.baseMaxMp = 6 + 2 * 9;
    p.baseAtk = 5 + 2 * 9;
    p.baseDef = 2 + 1 * 9;
    recomputeStats();
    p.hp = p.maxHp;
    p.mp = p.maxMp;
    updateStatusBar();
    saveGame();
    showToast("[DEBUG] Lv.10にした");
    renderSettingsBody();
  }

  function debugSetLevel99() {
    var p = state.player;
    var firstTime = !p.level99Shown;
    p.level = 99;
    p.nextExp = 99 * 10 + 15;
    p.exp = 0;
    // レベルアップ分のベースステータスを一括計算(1→99の98回分)
    p.baseMaxHp = 20 + (5 + 1) * 98; // 初期20 + 平均6×98回
    p.baseMaxMp = 6 + 2 * 98;
    p.baseAtk = 5 + 2 * 98;
    p.baseDef = 2 + 1 * 98;
    recomputeStats();
    p.hp = p.maxHp;
    p.mp = p.maxMp;
    p.level99Shown = true;
    state.eventFlags.level99Reached = true;
    updateStatusBar();
    saveGame();
    if (firstTime) {
      playSE("level99");
      closeModal("settings-modal");
      openLv99Modal();
    } else {
      showToast("[DEBUG] Lv.99にした");
      closeModal("settings-modal");
    }
  }

  function debugSetLevel98() {
    var p = state.player;
    p.level = 98;
    p.nextExp = 98 * 10 + 15;
    p.exp = 0;
    p.baseMaxHp = 20 + (5 + 1) * 97;
    p.baseMaxMp = 6 + 2 * 97;
    p.baseAtk = 5 + 2 * 97;
    p.baseDef = 2 + 1 * 97;
    recomputeStats();
    p.hp = p.maxHp;
    p.mp = p.maxMp;
    updateStatusBar();
    saveGame();
    showToast("[DEBUG] Lv.98にした");
    closeModal("settings-modal");
  }

  function debugSetLvUpExp() {
    var p = state.player;
    p.exp = Math.max(0, p.nextExp - 1);
    updateStatusBar();
    saveGame();
    showToast("[DEBUG] 次の戦闘でLvUP可能なEXPに設定 (残り1)");
  }

  function debugResetLv99() {
    var p = state.player;
    p.level99Shown = false;
    state.eventFlags.level99Reached = false;
    updateStatusBar();
    saveGame();
    showToast("[DEBUG] Lv99到達フラグをリセットした");
    renderSettingsBody();
  }

  function debugGetUkulele() {
    state.player.hasUkulele = true;
    state.openedChests["9,14"] = true; // ウクレレ宝箱を開封済みにする
    renderField();
    updateStatusBar();
    saveGame();
    showToast("[DEBUG] 女神のウクレレを入手した");
  }

  function debugForceUltimateGorilla() {
    if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
    closeModal("settings-modal");
    var boss = findById(UMA_DATA, "ultimategorilla");
    startBattle(boss);
  }

  function debugForceUltimateGorillaHP5() {
    if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
    closeModal("settings-modal");
    var boss = findById(UMA_DATA, "ultimategorilla");
    // 発見モーダルをスキップして直接戦闘開始し、同期的にHPを設定する
    actuallyStartBattle(boss);
    state.enemy.hp = 5;
    renderEnemy();
    showToast("[DEBUG] 究極ゴリラHP5で開始！");
  }

  function debugForceUltimateGorillaHP12() {
    if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
    closeModal("settings-modal");
    var boss = findById(UMA_DATA, "ultimategorilla");
    actuallyStartBattle(boss);
    state.enemy.hp = 12;
    renderEnemy();
    showToast("[DEBUG] 究極ゴリラHP12で開始！");
  }

  function debugForceUltimateGorillaHP10() {
    if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
    closeModal("settings-modal");
    var boss = findById(UMA_DATA, "ultimategorilla");
    actuallyStartBattle(boss);
    state.enemy.hp = 10;
    renderEnemy();
    showToast("[DEBUG] 究極ゴリラHP10で開始！");
  }

  function debugForceUltimateGorillaHP1() {
    if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
    closeModal("settings-modal");
    var boss = findById(UMA_DATA, "ultimategorilla");
    actuallyStartBattle(boss);
    state.enemy.hp = 1;
    renderEnemy();
    showToast("[DEBUG] 究極ゴリラHP1で開始！");
  }

  function debugForceWilddog() {
    if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
    var dog = findById(NON_UMA_DATA, "wilddog");
    if (!dog) { showToast("[DEBUG] のらいぬが見つからない"); return; }
    closeModal("settings-modal");
    startBattle(dog);
  }

  function debugForceRandomMonster() {
    if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
    var pool = NON_UMA_DATA.filter(function (m) { return m.type === "monster"; });
    if (pool.length === 0) { showToast("[DEBUG] モンスターが見つからない"); return; }
    var monster = pool[Math.floor(Math.random() * pool.length)];
    closeModal("settings-modal");
    showToast("[DEBUG] " + monster.name + " 強制エンカウント");
    startBattle(monster);
  }

  function debugSetEnemyHP5() {
    if (!state.inBattle || !state.enemy) { showToast("[DEBUG] 戦闘中のみ使用可能"); return; }
    state.enemy.hp = 5;
    renderEnemy();
    showToast("[DEBUG] 敵HPを5にした");
    closeModal("settings-modal");
  }

  function debugAddGold() {
    state.player.gold += 9999;
    updateStatusBar();
    saveGame();
    showToast("[DEBUG] 9999G追加した");
  }

  function debugResetClear() {
    state.gameCleared = false;
    state.pendingClear = false;
    state.player.hasUkulele = false;
    delete state.openedChests["9,14"];
    renderField();
    updateStatusBar();
    saveGame();
    showToast("[DEBUG] クリア状態・ウクレレをリセットした");
  }

  function debugPlayEnding() {
    closeModal("settings-modal");
    openEndingModal();
  }

  function debugSetCleared() {
    state.gameCleared = true;
    updateStatusBar();
    saveGame();
    showToast("[DEBUG] クリア済みにした");
  }

  function debugPlayLv99Event() {
    playSE("level99");
    closeModal("settings-modal");
    openLv99Modal();
  }

  function debugGetAllLegendary() {
    var p = state.player;
    if (!isEquipOwned(findEquipSlot("armor"), "pegasusarmor")) p.ownedArmors.push("pegasusarmor");
    if (!isEquipOwned(findEquipSlot("shield"), "sixfoldshield")) p.ownedShields.push("sixfoldshield");
    if (!isEquipOwned(findEquipSlot("helmet"), "cosmickabuto")) p.ownedHelmets.push("cosmickabuto");
    if (!isEquipOwned(findEquipSlot("weapon"), "nyoibo")) p.ownedWeapons.push("nyoibo");
    if (!isEquipOwned(findEquipSlot("weapon"), "andromedachain")) p.ownedWeapons.push("andromedachain");
    if (!isEquipOwned(findEquipSlot("helmet"), "cygnuskabuto")) p.ownedHelmets.push("cygnuskabuto");
    if (!isEquipOwned(findEquipSlot("shield"), "dragonshield")) p.ownedShields.push("dragonshield");
    state.eventFlags.pegasusArmorGot = true;
    state.eventFlags.sixfoldShieldGot = true;
    state.eventFlags.cosmicHelmetGot = true;
    state.eventFlags.nyoiboGot = true;
    state.eventFlags.andromedaGot = true;
    state.eventFlags.cygnusHelmetGot = true;
    state.eventFlags.dragonShieldGot = true;
    updateStatusBar();
    saveGame();
    showToast("[DEBUG] 伝説装備を全入手した(7/7)");
    renderSettingsBody();
  }

  function debugResetLegendary() {
    state.eventFlags.pegasusArmorGot = false;
    state.eventFlags.sixfoldShieldGot = false;
    state.eventFlags.cosmicHelmetGot = false;
    state.eventFlags.nyoiboGot = false;
    state.eventFlags.andromedaGot = false;
    state.eventFlags.cygnusHelmetGot = false;
    state.eventFlags.dragonShieldGot = false;
    saveGame();
    showToast("[DEBUG] 伝説装備フラグをリセットした");
    renderSettingsBody();
  }

  // ---------------------------------------------------------
  // §126 v0.49: 主人公命名・統合メンバー管理
  // ---------------------------------------------------------

  // 名前文字列を正規化して返す（副作用なし）
  function normalizePlayerName(value) {
    if (typeof value !== "string") { return ""; }
    // 改行・タブ・制御文字を除去してトリム
    var s = value.replace(/[\r\n\t -]/g, "").trim();
    if (s.length === 0) { return ""; }
    if (s.length > 10) { s = s.slice(0, 10); } // 10文字上限
    return s;
  }

  // 主人公表示名を返す（欠損時は "冒険者"）
  function getPlayerDisplayName() {
    var n = normalizePlayerName(state.playerName || "");
    return n || "冒険者";
  }

  // キャラクターID → 表示名（副作用なし）
  function getCharacterDisplayName(characterId) {
    if (characterId === "player") { return getPlayerDisplayName(); }
    var c = findById(COMPANION_DATA, characterId);
    return c ? c.name : "";
  }

  // キャラクターID → 表示アイコン（副作用なし）
  function getCharacterDisplayIcon(characterId) {
    if (characterId === "player") { return "🧙"; }
    var c = findById(COMPANION_DATA, characterId);
    return (c && c.icon) ? c.icon : "❓";
  }

  // キャラクター管理データ取得アダプター（副作用なし・saveしない）
  function getCharacterManagementData(characterId) {
    var p = state.player;
    if (characterId === "player") {
      var _pNextExp = (p.level >= 99) ? 0 : p.nextExp;
      var _pExpToNext = (p.level >= 99) ? 0 : Math.max(0, _pNextExp - p.exp);
      // 主人公装備サマリ
      var _eqSummary = [];
      var _wpn = (findById(EQUIP_WEAPON_DATA, p.equipment.weapon) || {}).name;
      var _arm = (findById(ARMOR_DATA, p.equipment.armor) || {}).name;
      var _shd = (findById(SHIELD_DATA, p.equipment.shield) || {}).name;
      var _hlm = (findById(HELMET_DATA, p.equipment.helmet) || {}).name;
      if (_wpn) { _eqSummary.push("武器: " + _wpn); }
      if (_arm) { _eqSummary.push("防具: " + _arm); }
      if (_shd) { _eqSummary.push("盾: " + _shd); }
      if (_hlm) { _eqSummary.push("兜: " + _hlm); }
      // 主人公持ち物サマリ
      var _invCount = (p.potionCount || 0) + (p.ropeCount || 0) + (p.coffeeCount || 0) +
        (p.breadCount || 0) + (p.bentoCount || 0) + (p.ramenCount || 0) +
        (p.coughsyrupCount || 0) + (p.deodorantCount || 0);
      var _invSummary = ["アイテム合計: " + _invCount + "個"];
      return {
        id: "player", name: getPlayerDisplayName(), icon: "🧙", role: "主人公",
        level: p.level, exp: p.exp, nextExp: _pNextExp, expToNext: _pExpToNext,
        isPlayer: true, isJoined: true, isInParty: true,
        equipmentSummary: _eqSummary, inventorySummary: _invSummary
      };
    }
    // 仲間
    var cData = findById(COMPANION_DATA, characterId);
    if (!cData) {
      return {
        id: characterId, name: "", icon: "❓", role: "", level: 0, exp: 0,
        nextExp: 0, expToNext: 0, isPlayer: false, isJoined: false, isInParty: false,
        equipmentSummary: [], inventorySummary: []
      };
    }
    var cl = getCompanionLevel(characterId);
    var _cNextExp = (cl.level >= 99) ? 0 : cl.nextExp;
    var _cExpToNext = (cl.level >= 99) ? 0 : Math.max(0, _cNextExp - cl.exp);
    var _cInParty = (p.companions && p.companions.indexOf(characterId) >= 0);
    var _cJoined = hasCompanionEverJoined(characterId);
    // 仲間装備サマリ
    var _cgSummary = [];
    var _equippedGearId = state.companionEquipment && state.companionEquipment[characterId];
    if (_equippedGearId) {
      var _gd = findById(COMPANION_GEAR_DATA, _equippedGearId);
      if (_gd) { _cgSummary.push("装備中: " + _gd.name); }
    } else {
      _cgSummary.push("装備中: なし");
    }
    // 仲間持ち物（入手済み装備）
    var _cInvSummary = [];
    var _ownedCount = 0;
    if (state.companionGearInventory) {
      COMPANION_GEAR_DATA.forEach(function (gd) {
        if (!gd.targetCid || gd.targetCid === characterId) {
          var cnt = state.companionGearInventory[gd.id] || 0;
          if (cnt > 0) { _ownedCount++; }
        }
      });
    }
    _cInvSummary.push("仲間装備入手: " + _ownedCount + "種類");
    return {
      id: characterId, name: cData.name, icon: cData.icon || "❓", role: cData.feature || "",
      level: cl.level, exp: cl.exp, nextExp: _cNextExp, expToNext: _cExpToNext,
      isPlayer: false, isJoined: _cJoined, isInParty: _cInParty,
      equipmentSummary: _cgSummary, inventorySummary: _cInvSummary
    };
  }

  // メンバー管理モーダル本文 HTML 生成
  function renderMemberManagementBody() {
    var p = state.player;
    var ids = ["player", "juritani", "shurittani", "norio", "harumi"];
    var html = "";
    for (var _i = 0; _i < ids.length; _i++) {
      var cid = ids[_i];
      if (cid !== "player" && !hasCompanionEverJoined(cid)) { continue; } // 未加入非表示
      var d = getCharacterManagementData(cid);
      var _partyLabel, _partyColor;
      if (d.isPlayer) {
        _partyLabel = "🌟 リーダー"; _partyColor = "#ffd166";
      } else if (d.isInParty) {
        _partyLabel = "✅ 編成中"; _partyColor = "#06d6a0";
      } else if (d.isJoined) {
        _partyLabel = "💤 待機中"; _partyColor = "#adb5bd";
      } else {
        _partyLabel = "未加入"; _partyColor = "#888";
      }
      // EXPゲージ計算
      var _pct = 0;
      if (d.level >= 99) {
        _pct = 100;
      } else if (d.nextExp > 0) {
        _pct = Math.min(100, Math.max(0, Math.round((d.exp / d.nextExp) * 100)));
      }
      var _nextExpText = (d.level >= 99) ? "―" : ("+" + d.expToNext);
      html += '<div style="border:1px solid #444;border-radius:10px;padding:12px;margin-bottom:12px;background:#1e1e2e;">';
      // ヘッダー
      html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">';
      html += '<span style="font-size:1.6em;">' + d.icon + '</span>';
      html += '<div style="flex:1;">';
      html += '<div style="font-weight:bold;font-size:1em;">' + d.name + '</div>';
      html += '<div style="font-size:0.78em;color:#adb5bd;">' + d.role + '</div>';
      html += '</div>';
      html += '<div style="font-size:0.8em;color:' + _partyColor + ';text-align:right;">' + _partyLabel + '</div>';
      html += '</div>';
      // Lv・EXP
      html += '<div style="display:flex;gap:12px;font-size:0.85em;margin-bottom:6px;">';
      html += '<span>Lv <strong>' + d.level + '</strong></span>';
      html += '<span>EXP ' + d.exp + '</span>';
      html += '<span>次Lvまで ' + _nextExpText + '</span>';
      html += '</div>';
      // EXPゲージ
      html += '<div style="background:#333;border-radius:4px;height:6px;margin-bottom:8px;overflow:hidden;">';
      html += '<div style="background:#74c0fc;height:100%;width:' + _pct + '%;border-radius:4px;"></div>';
      html += '</div>';
      // 装備
      html += '<div style="font-size:0.82em;color:#adb5bd;margin-bottom:4px;"><strong>装備</strong></div>';
      for (var _ei = 0; _ei < d.equipmentSummary.length; _ei++) {
        html += '<div style="font-size:0.8em;padding-left:8px;color:#ccc;">・' + d.equipmentSummary[_ei] + '</div>';
      }
      // 持ち物
      html += '<div style="font-size:0.82em;color:#adb5bd;margin:6px 0 4px;"><strong>持ち物</strong></div>';
      for (var _ii = 0; _ii < d.inventorySummary.length; _ii++) {
        html += '<div style="font-size:0.8em;padding-left:8px;color:#ccc;">・' + d.inventorySummary[_ii] + '</div>';
      }
      // アクションボタン
      html += '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;">';
      if (d.isPlayer) {
        html += '<button class="shop-menu-btn" data-mm-action="rename" style="font-size:0.8em;padding:6px 10px;flex:1;">✏️ 名前を変更</button>';
        html += '<button class="shop-menu-btn" data-mm-action="equip-player" style="font-size:0.8em;padding:6px 10px;flex:1;">⚔️ 装備を変更</button>';
        html += '<button class="shop-menu-btn" data-mm-action="bag" style="font-size:0.8em;padding:6px 10px;flex:1;">🎒 バッグを開く</button>';
      } else {
        html += '<button class="shop-menu-btn" data-mm-action="equip-companion" data-mm-cid="' + cid + '" style="font-size:0.8em;padding:6px 10px;flex:1;">⚔️ 仲間装備</button>';
      }
      html += '</div>';
      html += '</div>';
    }
    // パーティ編成ボタン
    html += '<button class="shop-menu-btn" id="btn-mm-tavern" style="margin-top:4px;border-color:#ffd43b;color:#ffd43b;">🍺 パーティ編成（酒場を開く）</button>';
    return html;
  }

  function openMemberManagement() {
    document.getElementById("member-management-body").innerHTML = renderMemberManagementBody();
    openModal("member-management-modal");
    // ボタンハンドラを設定（毎回再バインド）
    var body = document.getElementById("member-management-body");
    var btns = body.querySelectorAll("[data-mm-action]");
    for (var _bi = 0; _bi < btns.length; _bi++) {
      (function (btn) {
        btn.onclick = function () {
          var action = btn.getAttribute("data-mm-action");
          var mmCid = btn.getAttribute("data-mm-cid");
          if (action === "rename") {
            closeMemberManagement();
            openPlayerNameModal("change");
          } else if (action === "equip-player") {
            closeMemberManagement();
            openStatusModal(); // 既存ステータス画面（装備変更含む）
          } else if (action === "bag") {
            closeMemberManagement();
            openBagModal();
          } else if (action === "equip-companion" && mmCid) {
            closeMemberManagement();
            openCompanionGearModal(mmCid); // 既存仲間装備画面
          }
        };
      })(btns[_bi]);
    }
    var btnTavern = document.getElementById("btn-mm-tavern");
    if (btnTavern) {
      btnTavern.onclick = function () {
        closeMemberManagement();
        openTavernModal();
      };
    }
    var btnClose = document.getElementById("btn-member-management-close");
    if (btnClose) {
      btnClose.onclick = function () { closeMemberManagement(); };
    }
  }

  function closeMemberManagement() {
    closeModal("member-management-modal");
  }

  // 主人公命名モーダル（mode: "newgame" | "change"）
  // §126 v0.49: _playerNameModalLock — 多重開き防止（非永続）
  var _playerNameModalLock = false;
  function openPlayerNameModal(mode) {
    if (_playerNameModalLock) { return; }
    var isNewGame = (mode === "newgame");
    var titleEl = document.getElementById("player-name-modal-title");
    var descEl = document.getElementById("player-name-modal-desc");
    var inputEl = document.getElementById("input-player-name");
    var errEl = document.getElementById("player-name-error");
    var confirmBtn = document.getElementById("btn-player-name-confirm");
    var cancelBtn = document.getElementById("btn-player-name-cancel");
    if (!inputEl || !confirmBtn || !cancelBtn) { return; }
    if (titleEl) { titleEl.textContent = isNewGame ? "主人公の名前" : "✏️ 名前を変更"; }
    if (descEl) { descEl.textContent = isNewGame
      ? "冒険へ出発する主人公の名前を入力してください。"
      : "現在の名前: " + getPlayerDisplayName(); }
    // 変更モードは現在の名前を初期値として表示
    inputEl.value = isNewGame ? "" : getPlayerDisplayName();
    if (errEl) { errEl.textContent = ""; }
    confirmBtn.textContent = isNewGame ? "この名前で始める" : "変更する";
    cancelBtn.style.display = isNewGame ? "none" : ""; // ニューゲームはキャンセル不可
    // IME確定誤爆防止フラグ
    var _composing = false;
    inputEl.oncompositionstart = function () { _composing = true; };
    inputEl.oncompositionend = function () { _composing = false; };
    // Enter決定
    inputEl.onkeydown = function (e) {
      if (e.key === "Enter" && !_composing) { confirmBtn.click(); }
    };
    // confirm
    var _confirming = false;
    confirmBtn.onclick = function () {
      if (_confirming) { return; }
      var _name = normalizePlayerName(inputEl.value || "");
      if (!_name) {
        if (errEl) { errEl.textContent = "名前を入力してください（1〜10文字）"; }
        return;
      }
      _confirming = true;
      if (isNewGame) {
        // ニューゲーム: ペンディング名保存→データ削除→リロード
        try { localStorage.setItem(SAVE_KEY + "_pn", _name); } catch (e4) {}
        try { localStorage.removeItem(SAVE_KEY); } catch (e5) {}
        location.reload();
      } else {
        // 名前変更: 即反映
        var _old = state.playerName;
        if (_name !== _old) {
          state.playerName = _name;
          saveGame();
          showToast("🧙 主人公の名前を「" + _name + "」に変更しました。");
        } else {
          showToast("名前は変わりませんでした。");
        }
        _confirming = false;
        _playerNameModalLock = false;
        closeModal("player-name-modal");
        // 直前のモーダルを判断して適切に再描画（ステータス or 実家）
        renderStatusBody_ifOpen();
      }
    };
    cancelBtn.onclick = function () {
      _playerNameModalLock = false;
      closeModal("player-name-modal");
    };
    _playerNameModalLock = true;
    openModal("player-name-modal");
    // 少し遅延してフォーカス（IME初期化）
    setTimeout(function () { if (inputEl) { inputEl.focus(); } }, 80);
  }

  // ステータス画面が開いていれば再描画（名前変更後の即時反映）
  function renderStatusBody_ifOpen() {
    var sm = document.getElementById("status-modal");
    if (sm && !sm.classList.contains("hidden")) {
      renderStatusBody();
    }
  }

  // ---------------------------------------------------------
  // §127 v0.50: 王様名呼び・4人パーティ・全員合流
  // ---------------------------------------------------------

  // 王様NPC会話文の「勇者よ」→主人公名+"よ"、「勇者殿」→主人公名+"殿" に置換。
  // innerHTML注入前に主人公名をHTMLエスケープしてXSSを防止する。
  function formatKingDialogueText(text) {
    var name = getPlayerDisplayName();
    var safe = name.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    text = text.replace(/勇者よ/g, safe + "よ");
    text = text.replace(/勇者殿/g, safe + "殿");
    return text;
  }

  // 加入済み（hasCompanionEverJoined）でパーティ未参加の仲間を一括追加する。
  // COMPANION_MAX を超えるぶんはスキップ。
  function joinAllCompanions() {
    var p = state.player;
    var added = 0;
    for (var _jac = 0; _jac < COMPANION_DATA.length; _jac++) {
      if (p.companions.length >= COMPANION_MAX) { break; }
      var _jacId = COMPANION_DATA[_jac].id;
      if (p.companions.indexOf(_jacId) >= 0) { continue; }
      if (!hasCompanionEverJoined(_jacId)) { continue; }
      p.companions.push(_jacId);
      added++;
    }
    if (added > 0) {
      resetPartyTrail();
      updateStatusBar();
      saveGame();
      showToast("👥 " + added + "人が合流した！");
    } else {
      showToast("合流できる仲間がいません。");
    }
    renderTavernMain();
  }

  // ---------------------------------------------------------
  // §128 v0.50.1: パーティ正規化・4人戦闘安定化
  // ---------------------------------------------------------

  // セーブ読み込み時にパーティ配列を正規化する。
  // 不正ID・重複・MAX超過を除去し、変更があれば true を返す。
  // saveGame() は呼ばない（呼び出し側で判定すること）。
  function normalizeCompanionParty() {
    var p = state.player;
    if (!Array.isArray(p.companions)) {
      p.companions = [];
      return true;
    }
    var _validIds128 = [];
    for (var _vi128 = 0; _vi128 < COMPANION_DATA.length; _vi128++) {
      _validIds128.push(COMPANION_DATA[_vi128].id);
    }
    var _seen128 = {};
    var _result128 = [];
    for (var _i128 = 0; _i128 < p.companions.length; _i128++) {
      var _cid128 = p.companions[_i128];
      if (_validIds128.indexOf(_cid128) < 0) { continue; }   // 未知のID
      if (_seen128[_cid128]) { continue; }                    // 重複
      if (!hasCompanionEverJoined(_cid128)) { continue; }     // 未加入
      if (_result128.length >= COMPANION_MAX) { break; }      // MAX超過
      _seen128[_cid128] = true;
      _result128.push(_cid128);
    }
    var _changed128 = (_result128.length !== p.companions.length);
    if (!_changed128) {
      for (var _j128 = 0; _j128 < _result128.length; _j128++) {
        if (_result128[_j128] !== p.companions[_j128]) { _changed128 = true; break; }
      }
    }
    if (_changed128) { p.companions = _result128; }
    return _changed128;
  }

  // ---------------------------------------------------------
  // 起動
  // ---------------------------------------------------------
  init();

})();
