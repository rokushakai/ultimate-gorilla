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
  var RAW_MAP = [
    "#############",
    "#,,,H,,,T,,S#",  // S=王様の使い(10,1)
    "#,D,,,,M,,K,#",  // D=UMA博士(2,2), K=鍛冶屋(10,2)
    "#,V,N,,,,G,,#",  // V=横スクロール入口ゲート(2,3) §52 v0.11.2, N=攻略ペーパービュー屋(4,3)
    "#..........A#",  // A=ペガサスのよろい伝説宝箱(11,4) Lv50+
    "#....R..B...#",  // R=旅人(5,5), B=宝箱(8,5)
    "#...~~~..X..#",  // X=キグナスのかぶと伝説宝箱(9,6) Lv40+
    "#...~~~.....#",
    "#.........B.#",  // B=宝箱(10,8)
    "#..W..E.....#",  // E=ゴリラ研究家(6,9)
    "#....P......#",
    "#.....#....C#",  // C=宇宙のかぶと伝説宝箱(11,11) ウクレレ所持
    "#......W....#",
    "#....P..B...#",  // B=宝箱(8,13)
    "#........U..#",  // U=女神のウクレレ宝箱(9,14)
    "#..#...J...##",  // J=如意棒伝説宝箱(7,15) Lv70+ジュリタニ同行
    "#..B........#",  // B=宝箱(3,16)
    "#############"
  ];

  var MAP_W = 13;
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
    "V": "🌀"   // 横スクロール入口ゲート(§52 v0.11.2)
  };
  // 進入不可の地形
  var BLOCKED = { "#": true, "~": true };
  // エンカウントが起きない安全地形(村・道・施設・宝箱・NPC上)
  var SAFE_TILE = { ",": true, "H": true, "M": true, "G": true, "T": true, "B": true, "U": true, "A": true, "C": true, "J": true, "X": true, "D": true, "R": true, "K": true, "E": true, "S": true, "N": true, "V": true };

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
  var COMPANION_MAX = 2; // パーティー上限
  var COMPANION_DATA = [
    { id: "juritani",   name: "ジュリタニ", emoji: "💪",
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
    { id: "shurittani", name: "シュリタニ", emoji: "🪤",
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
    { id: "norio",      name: "ノリオ",     emoji: "📈",   // §45 v0.9.2: 逃走→経験値2倍に変更
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
    { id: "harumi",     name: "ハルミ",     emoji: "✨",
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

  // §75 v0.24: 仲間セリフ状態判定ヘルパー。優先度: legendary > fullClear > dex > side > clear
  function getCompanionQuote(c) {
    if (isFullyCompleted() && isLegendaryEquipmentComplete() && c.legendaryLine) {
      return { text: c.legendaryLine, color: "#ffd700" };
    }
    if (isFullyCompleted() && c.fullClearLine) {
      return { text: c.fullClearLine, color: "#ffd166" };
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
    }
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

    var p = state.player;

    // プレイヤーが画面中央に来るようにカメラ位置を計算し、マップ端でクランプする
    var camX = clamp(p.x - Math.floor(VIEW_COLS / 2), 0, MAP_W - VIEW_COLS);
    var camY = clamp(p.y - Math.floor(VIEW_ROWS / 2), 0, MAP_H - VIEW_ROWS);

    var html = "";
    for (var r = 0; r < VIEW_ROWS; r++) {
      for (var c = 0; c < VIEW_COLS; c++) {
        var mapX = camX + c;
        var mapY = camY + r;
        var emoji;
        if (mapX === p.x && mapY === p.y) {
          emoji = "🧙"; // プレイヤー
        } else {
          var key = mapX + "," + mapY;
          if (state.items[key] === "weapon") emoji = "🗡️";
          else if (state.items[key] === "potion") emoji = "🧪";
          else {
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
            } else {
              emoji = TERRAIN_EMOJI[tileChar] || "🟩";
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
        rewardLine = "💰 報酬：150G ＋ 🍱 お弁当 ×1";
      } else {
        newRewardLevel = 1;
        state.player.gold += 50;
        headerText = "あやしい森を抜けた！";
        bodyLines = [
          "木々の隙間を縫いながら、どうにか出口にたどり着いた。",
          "ボスゴリラはまだ森の奥に潜んでいるかもしれない。"
        ];
        rewardLine = "💰 報酬：50G";
      }
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
        rewardLine = "💰 報酬：220G ＋ 🍜 ラーメン ×1";
      } else {
        newRewardLevel = 1;
        state.player.gold += 80;
        headerText = "古びた町はずれを抜けた！";
        bodyLines = [
          "君は魔王ゴリラを避けながら、町はずれの出口へたどり着いた。",
          "危険を避けて進むことも、冒険者の知恵だ。"
        ];
        rewardLine = "💰 報酬：80G";
      }
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
        rewardLine = "💰 報酬：350G ＋ 🍜 ラーメン ×1";
      } else {
        newRewardLevel = 1;
        state.player.gold += 120;
        headerText = "ゴリラ山道を抜けた！";
        bodyLines = [
          "険しい山道を、どうにかくぐり抜けた。",
          "大魔王ゴリラはまだ山の奥に潜んでいるかもしれない。"
        ];
        rewardLine = "💰 報酬：120G";
      }
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
        rewardLine = "💰 報酬：500G ＋ 🍜 ラーメン ×1";
      } else {
        newRewardLevel = 1;
        state.player.gold += 200;
        headerText = "黒い城を抜けた！";
        bodyLines = [
          "暗い城内を、どうにかくぐり抜けた。",
          "ラスボス級ゴリラはまだ城の奥深くに潜んでいるかもしれない。"
        ];
        rewardLine = "💰 報酬：200G";
      }
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

  function switchToSideMap() {
    state.mapMode = "side";
    var stageData = SIDE_STAGE_DATA[state.sideMap.stage] || SIDE_STAGE_DATA[1];
    state.sideMap.x = stageData.startX;
    state.sideMap.y = stageData.startY;
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
    state.mapMode = "normal";
    // §53 v0.11.3: 🌀ゲート(2,3)の1マス下(2,4)へ戻す → 戻った直後の再接触ループを防止
    state.player.x = 2;
    state.player.y = 4;
    saveGame();
    renderField();
    showToast("🏠 通常マップへ戻った！");
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

    // 安全地形でなければエンカウント判定
    if (!SAFE_TILE[tile]) {
      state.stepsSinceEncounter++;
      if (state.stepsSinceEncounter >= MIN_STEPS_BEFORE_ENCOUNTER &&
          Math.random() < ENCOUNTER_CHANCE) {
        state.stepsSinceEncounter = 0;
        triggerEncounter();
      }
    }
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
      canCapture: monster.canCapture !== false  // §46 v0.9.2.1: false なら捕獲コマンド封鎖
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
      e.name + (e.isUMA ? "(UMA)" : "");
    document.getElementById("enemy-hp-bar").style.width =
      Math.max(0, (e.hp / e.maxHp) * 100) + "%";
    document.getElementById("enemy-hp-text").textContent = e.hp + "/" + e.maxHp;
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
    var btns = document.querySelectorAll("#battle-menu button, .submenu button");
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
    setTimeout(enemyTurn, 600);
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
    } else {
      var heal = Math.floor((sp.power + randInt(0, 5)) * spellMultiplier);
      p.hp = Math.min(p.maxHp, p.hp + heal);
      log("✨ " + sp.name + "！ HPが" + heal + "回復した！");
      updateBattlePlayerStatus();
    }
    setTimeout(enemyTurn, 600);
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
    setTimeout(enemyTurn, 600);
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
    document.getElementById("b-hp-text").textContent = "HP " + p.hp + "/" + p.maxHp;
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
    html += '<div class="shop-row"><span>名前</span><span>' + p.name + "</span></div>";
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
    html += "<h3>仲間</h3>";
    if (p.companions.length === 0) {
      html += '<p class="small">なし</p>';
    } else {
      p.companions.forEach(function (id) {
        var c = findById(COMPANION_DATA, id);
        if (!c) return;
        html += '<div class="shop-row"><span>' + c.emoji + " " + c.name + "</span>" +
          '<span class="small" style="color:#ffd166;">' + c.effectDesc + "</span></div>";
      });
    }

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

    document.getElementById("status-body").innerHTML = html;
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
    body.innerHTML = html;
    document.getElementById("t-recruit").onclick = renderTavernRecruit;
    document.getElementById("t-view").onclick = renderTavernViewParty;
    document.getElementById("t-leave").onclick = renderTavernLeave;
  }

  function renderTavernRecruit() {
    var body = document.getElementById("tavern-body");
    var p = state.player;
    var partyFull = p.companions.length >= COMPANION_MAX;
    var html = "<p>仲間: " + p.companions.length + "/" + COMPANION_MAX + "人</p>";
    if (partyFull) {
      html += '<p class="small" style="color:#ff7b7b;margin:0 0 8px;">上限です。仲間を外してから来てください。</p>';
    }
    COMPANION_DATA.forEach(function (c) {
      var inParty = hasCompanion(c.id);
      html += '<div class="shop-row" style="flex-direction:column;align-items:flex-start;">';
      html += '<div style="display:flex;justify-content:space-between;align-items:center;width:100%;margin-bottom:3px;">';
      html += "<span>" + c.emoji + " <b>" + c.name + "</b></span>";
      if (inParty) {
        html += '<span style="color:#06d6a0;font-size:12px;font-weight:bold;">同行中 ✓</span>';
      } else if (!partyFull) {
        html += '<button data-recruit="' + c.id + '">加入</button>';
      }
      html += "</div>";
      html += '<span class="small">' + c.feature + "</span>";
      if (!inParty) {
        html += '<span class="small" style="color:#ffd166;margin-top:2px;">' + c.effectDesc + "</span>";
      }
      // §75 v0.24: クリア後仲間セリフ多段階表示
      var _rq = getCompanionQuote(c);
      if (_rq) {
        html += '<p class="small" style="margin:4px 0 0;color:' + _rq.color + ';font-style:italic;">「' + _rq.text + '」</p>';
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
    var html = "";
    if (p.companions.length === 0) {
      html += '<p class="small">仲間はいない。</p>';
    } else {
      p.companions.forEach(function (id) {
        var c = findById(COMPANION_DATA, id);
        if (!c) return;
        html += '<div class="shop-row" style="flex-direction:column;align-items:flex-start;">';
        html += "<p style=\"margin:0 0 4px;\"><b>" + c.emoji + " " + c.name + "</b> <span class=\"small\" style=\"color:#06d6a0;\">同行中</span></p>";
        html += '<p class="small" style="margin:0 0 2px;">' + c.feature + "</p>";
        html += '<p class="small" style="margin:0;color:#ffd166;">' + c.effectDesc + "</p>";
        // §75 v0.24: クリア後仲間セリフ多段階表示
        var _vq = getCompanionQuote(c);
        if (_vq) {
          html += '<p class="small" style="margin:4px 0 0;color:' + _vq.color + ';font-style:italic;">「' + _vq.text + '」</p>';
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
    var html = "";
    if (p.companions.length === 0) {
      html += '<p class="small">外せる仲間がいない。</p>';
    } else {
      p.companions.forEach(function (id) {
        var c = findById(COMPANION_DATA, id);
        if (!c) return;
        html += '<div class="shop-row"><span>' + c.emoji + " " + c.name + "</span>";
        html += '<button data-leave="' + c.id + '">外す</button></div>';
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
    html += '<p style="margin:0 0 10px;font-size:13px;font-weight:bold;">' + c.emoji + " " + c.name + "</p>";
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
      '<button class="shop-menu-btn" id="m-sell-item">📤 アイテムを売る</button>' +
      '<button class="shop-menu-btn" id="m-sell-uma">🦍 UMAを売る</button>' +
      '<button class="shop-menu-btn" id="m-sell-equip">🔧 装備を売る</button>';
    body.innerHTML = html;
    document.getElementById("m-buy").onclick = renderMerchantBuy;
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
          lines.push("王様は、勇者の子孫の旅を見守っておられる。");
          lines.push("まずは力をつけ、女神のウクレレを探すのです。");
          lines.push("しっかり準備を整えてから究極ゴリラに挑むように、とのことじゃ。");
        } else {
          lines.push("王様は、究極ゴリラの報告を待っておられる。");
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
      speechHtml += "<p>「" + lines[i] + "」</p>";
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
      html += '<p class="small" style="color:#a9e34b;margin-top:8px;">👥 仲間セリフバリエーション (§75 v0.24)</p>';
      html += '<button class="shop-menu-btn" id="btn-debug-companions-postclear" style="border-color:#a9e34b;color:#a9e34b;">👥 仲間セリフ: クリアのみ（緑）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-companions-side-cleared" style="border-color:#c8b4ff;color:#c8b4ff;">👥 仲間セリフ: クリア+横スクロール制覇（薄紫）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-companions-dex-complete" style="border-color:#74c0fc;color:#74c0fc;">👥 仲間セリフ: クリア+図鑑コンプ（水色）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-companions-full-clear" style="border-color:#ffd166;color:#ffd166;">👥 仲間セリフ: 完全達成（金）</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-companions-legendary" style="border-color:#ffd700;color:#ffd700;">👥 仲間セリフ: 完全達成+伝説装備コンプ（明金）</button>';
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
      if (confirm("本当に最初から始めますか？\n現在のセーブデータは削除されます。")) {
        try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
        location.reload();
      }
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
      // §75 v0.24: 仲間セリフバリエーションテスト
      document.getElementById("btn-debug-companions-postclear").onclick = function () {
        if (state.inBattle) { showToast("[DEBUG] 戦闘中は使えない"); return; }
        state.gameCleared = true;
        state.pendingClear = false;
        for (var _sj75a = 1; _sj75a <= 6; _sj75a++) { state.sideMap.stageCleared[String(_sj75a)] = false; }
        state.sideMap.defeatedEnemies["6:34,2"] = false;
        UMA_DATA.forEach(function(m) { state.player.dex[m.id] = null; });
        state.player.companions = ["juritani", "shurittani"];
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
        saveGame();
        closeModal("settings-modal");
        openTavernModal();
        showToast("[DEBUG] 完全達成+伝説装備コンプ（明金セリフ）。「仲間を見る」で確認");
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
        sideMapGateExplained: !!state.sideMap.gateExplained         // §52 v0.11.2
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
      // §48 v0.10: v0.9.1互換補正 — クリア済みなのにstage1RewardLevelが0の古いセーブを補正
      if (state.sideMap.stageCleared["1"] && !data.sideMapStage1Reward) {
        state.sideMap.stage1RewardLevel = state.sideMap.defeatedEnemies["36,1"] ? 2 : 1;
      }
      p.job = findById(JOB_DATA, data.jobId) || findById(JOB_DATA, "soccer");
      recomputeStats();
      p.hp = Math.min(data.hp != null ? data.hp : p.maxHp, p.maxHp);
      p.mp = Math.min(data.mp != null ? data.mp : p.maxMp, p.maxMp);
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
  // 起動
  // ---------------------------------------------------------
  init();

})();
