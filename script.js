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
    "#,,,H,,,T,,,#",
    "#,,,,,,M,,,,#",
    "#,,,,,,,,G,,#",
    "#...........#",
    "#.......B...#",  // B=宝箱(8,5)
    "#...~~~.....#",
    "#...~~~.....#",
    "#.........B.#",  // B=宝箱(10,8)
    "#..W........#",
    "#....P......#",
    "#.....#.....#",
    "#......W....#",
    "#....P..B...#",  // B=宝箱(8,13)
    "#........U..#",  // U=女神のウクレレ宝箱(9,14)
    "#..#.......##",
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
    "U": "🪗"   // 女神のウクレレ宝箱(§14.5。開封後は📦に変わる)
  };
  // 進入不可の地形
  var BLOCKED = { "#": true, "~": true };
  // エンカウントが起きない安全地形(村・道・施設・宝箱の上)
  var SAFE_TILE = { ",": true, "H": true, "M": true, "G": true, "T": true, "B": true, "U": true };

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
    { id: "kappa", name: "カッパ", emoji: "🐢", rarity: "コモン", isUMA: true, isRare: false, minLevel: 1, weight: 7, hp: 16, attack: 6, def: 2, captureRate: 0.40, exp: 10, sellPrice: 8 },
    { id: "tsuchinoko", name: "ツチノコ", emoji: "🐍", rarity: "コモン", isUMA: true, isRare: false, minLevel: 2, weight: 6, hp: 18, attack: 7, def: 2, captureRate: 0.38, exp: 12, sellPrice: 10 },
    { id: "hibagon", name: "ヒバゴン", emoji: "🦧", rarity: "アンコモン", isUMA: true, isRare: false, minLevel: 3, weight: 5, hp: 24, attack: 8, def: 3, captureRate: 0.30, exp: 16, sellPrice: 16 },
    { id: "mothman", name: "モスマン", emoji: "🦋", rarity: "アンコモン", isUMA: true, isRare: false, minLevel: 4, weight: 5, hp: 22, attack: 9, def: 2, captureRate: 0.30, exp: 18, sellPrice: 18 },
    { id: "bigfoot", name: "ビッグフット", emoji: "🦶", rarity: "レア", isUMA: true, isRare: true, weight: 10, hp: 40, attack: 11, def: 4, captureRate: 0.18, exp: 35, sellPrice: 60, fleeRate: 0.80, inflicts: { id: "allergy", chance: 0.3, duration: 12 } },
    { id: "nessie", name: "ネッシー", emoji: "🐉", rarity: "レア", isUMA: true, isRare: true, weight: 10, hp: 42, attack: 11, def: 5, captureRate: 0.16, exp: 38, sellPrice: 65, fleeRate: 0.80 },
    { id: "yeti", name: "イエティ", emoji: "☃️", rarity: "レア", isUMA: true, isRare: true, weight: 8, hp: 45, attack: 12, def: 5, captureRate: 0.15, exp: 42, sellPrice: 70, fleeRate: 0.80 },
    { id: "jerseydevil", name: "ジャージーデビル", emoji: "👹", rarity: "レア", isUMA: true, isRare: true, weight: 8, hp: 46, attack: 13, def: 4, captureRate: 0.14, exp: 44, sellPrice: 75, fleeRate: 0.80 },
    // 究極ゴリラはラスボス級。レベル99+最強装備クラスでないと基本的に倒せない
    // ステータスにしている(攻撃力150・防御60で通常プレイでは数発で全滅する)。
    // 捕獲もattemptCapture()内で別途上限を掛けてほぼ不可能にしている。
    { id: "ultimategorilla", name: "究極ゴリラ", emoji: "🦍", rarity: "伝説", isUMA: true, isRare: true, final: true, weight: 4, hp: 5000, attack: 150, def: 60, captureRate: 0.005, exp: 300, sellPrice: 99999, fleeRate: 0.95 }
  ];

  // --- UMA以外の敵(野生動物・盗賊など。図鑑/所持UMAの対象外) ---
  // type: "monster"(通常モンスター) / "metal"(メタル系・経験値稼ぎ用)
  // 特殊行動: inflicts(状態異常付与) / drainsMp(MP吸収) / stealsGold(所持金を盗む) /
  //           ambush(戦闘開始時の不意打ち) / fleeRate(プレイヤーの逃走成功率。低いほど素早い)
  var NON_UMA_DATA = [
    { id: "slime", name: "スライム", emoji: "🟢", type: "monster", isUMA: false, minLevel: 1, weight: 10, hp: 10, attack: 3, def: 1, captureRate: 0.60, exp: 5 },
    { id: "bat", name: "コウモリ", emoji: "🦇", type: "monster", isUMA: false, minLevel: 1, weight: 10, hp: 9, attack: 4, def: 0, captureRate: 0.55, exp: 5 },
    { id: "mosquito", name: "蚊", emoji: "🦟", type: "monster", isUMA: false, minLevel: 1, weight: 9, hp: 6, attack: 2, def: 0, captureRate: 0.65, exp: 3, inflicts: { id: "allergy", chance: 0.25, duration: 8 } },
    { id: "snake", name: "蛇", emoji: "🐍", type: "monster", isUMA: false, minLevel: 1, weight: 8, hp: 11, attack: 4, def: 1, captureRate: 0.50, exp: 6 },
    { id: "wilddog", name: "のらいぬ", emoji: "🐕", type: "monster", isUMA: false, minLevel: 1, weight: 8, hp: 13, attack: 5, def: 1, captureRate: 0.45, exp: 7 },
    { id: "yabuka", name: "ヤブ蚊", emoji: "🦟", type: "monster", isUMA: false, minLevel: 2, weight: 7, hp: 9, attack: 5, def: 0, captureRate: 0.45, exp: 7, inflicts: { id: "allergy", chance: 0.35, duration: 10 } },
    { id: "wanderingman", name: "さまようおやじ", emoji: "🚶", type: "monster", isUMA: false, minLevel: 2, weight: 6, hp: 16, attack: 5, def: 1, captureRate: 0.40, exp: 8 },
    { id: "powerpointguy", name: "パワポ野郎", emoji: "💻", type: "monster", isUMA: false, minLevel: 3, weight: 5, hp: 17, attack: 5, def: 2, captureRate: 0.30, exp: 10, drainsMp: { chance: 0.3, amount: 3 } },
    { id: "scammer", name: "詐欺師", emoji: "🕴️", type: "monster", isUMA: false, minLevel: 3, weight: 5, hp: 18, attack: 6, def: 1, captureRate: 0.30, exp: 11, stealsGold: { chance: 0.3, amount: 5 } },
    { id: "bandit", name: "山賊", emoji: "🥷", type: "monster", isUMA: false, minLevel: 3, weight: 6, hp: 22, attack: 8, def: 2, captureRate: 0.25, exp: 14, inflicts: { id: "smell", chance: 0.3, duration: 3 } },
    { id: "marathonman", name: "マラソンマン", emoji: "🏃", type: "monster", isUMA: false, minLevel: 4, weight: 5, hp: 19, attack: 6, def: 2, captureRate: 0.32, exp: 12, fleeRate: 0.50 },
    { id: "bumpman", name: "ぶつかりおじさん", emoji: "💢", type: "monster", isUMA: false, minLevel: 4, weight: 5, hp: 20, attack: 7, def: 2, captureRate: 0.28, exp: 13, ambush: true },
    { id: "oni", name: "鬼", emoji: "👺", type: "monster", isUMA: false, minLevel: 5, weight: 4, hp: 30, attack: 10, def: 4, captureRate: 0.20, exp: 20 },
    { id: "powerharassmentsenpai", name: "パワハラ先輩", emoji: "😤", type: "monster", isUMA: false, minLevel: 5, weight: 4, hp: 24, attack: 13, def: 3, captureRate: 0.22, exp: 18 },
    // メタル系: 経験値稼ぎ用のボーナス敵。高防御・低HP・低確率出現(METAL_ENCOUNTER_CHANCE)。
    // v0.6.1でEXPを大幅増量(稼ぎ甲斐を出すため)
    { id: "metalgorilla", name: "メタルゴリラ", emoji: "🥈", type: "metal", isUMA: false, minLevel: 1, weight: 10, hp: 8, attack: 3, def: 25, captureRate: 0.05, exp: 120 },
    { id: "haguremetalgorilla", name: "はぐれメタルゴリラ", emoji: "🥇", type: "metal", isUMA: false, minLevel: 10, weight: 8, hp: 12, attack: 5, def: 40, captureRate: 0.04, exp: 400 },
    { id: "fullmetalgorilla", name: "フルメタルゴリラ", emoji: "💎", type: "metal", isUMA: false, minLevel: 20, weight: 6, hp: 16, attack: 8, def: 60, captureRate: 0.03, exp: 1000 }
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
    { id: "andromedachain", name: "アンドロメダの鎖", atkBonus: 44 },
    { id: "chainsaw", name: "チェーンソー", atkBonus: 50 },
    { id: "nyoibo", name: "如意棒", atkBonus: 58 }
  ];

  var ARMOR_DATA = [
    { id: "tshirt", name: "Tシャツ", defBonus: 0 },
    { id: "rockt", name: "ロックT", defBonus: 2, buyPrice: 10 },
    { id: "leatherjacket", name: "革ジャン", defBonus: 4, buyPrice: 20 },
    { id: "samuraiarmor", name: "武者よろい", defBonus: 8, buyPrice: 60 },
    { id: "westernarmor", name: "西洋風よろい", defBonus: 12, buyPrice: 90 },
    { id: "nobunagaarmor", name: "信長のよろい", defBonus: 16, hpBonus: 10 },
    { id: "pegasusarmor", name: "ペガサスのよろい", defBonus: 14, hpBonus: 5 },
    { id: "turtlegi", name: "亀の武道着", defBonus: 20, hpBonus: 15 }
  ];

  var SHIELD_DATA = [
    { id: "cardboard", name: "段ボールのたて", defBonus: 0 },
    { id: "ironshield", name: "鉄のたて", defBonus: 5, buyPrice: 22 },
    { id: "dragonshield", name: "ドラゴンのたて", defBonus: 12, buyPrice: 100 },
    { id: "sixfoldshield", name: "六連のたて", defBonus: 20 }
  ];

  var HELMET_DATA = [
    { id: "hachimaki", name: "男塾ハチマキ", defBonus: 0 },
    { id: "helmet", name: "ヘルメット", defBonus: 2, buyPrice: 10 },
    { id: "steelkabuto", name: "鋼鉄のかぶと", defBonus: 5, buyPrice: 35 },
    { id: "cygnuskabuto", name: "キグナスのかぶと", defBonus: 8, buyPrice: 70 },
    { id: "shingenkabuto", name: "信玄のかぶと", defBonus: 11 },
    { id: "cosmickabuto", name: "宇宙のかぶと", defBonus: 15 }
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
      failMsgs: ["ジュリタニは腕を組んだ。", "まだお前の実力を見せてもらってないな。"] },
    { id: "shurittani", name: "シュリタニ", emoji: "🪤",
      feature: "UMAを捕まえるのが得意",
      effectDesc: "捕獲率+0.10",
      captureMod: 0.10,
      joinRate: 0.65,
      joinMsgs: ["シュリタニは捕獲ロープを確認した。", "UMA探しなら任せて。"],
      failMsgs: ["シュリタニは地図を見つめている。", "今は準備が足りないみたい。"] },
    { id: "norio",      name: "ノリオ",     emoji: "💨",
      feature: "逃げるのがうまい",
      effectDesc: "逃走成功率+0.15",
      fleeMod: 0.15,
      joinRate: 0.75,
      joinMsgs: ["ノリオは出口の場所を確認した。", "危なくなったら俺についてこい。"],
      failMsgs: ["ノリオはすでに逃げる準備をしている。", "今日はやめておこう。"] },
    { id: "harumi",     name: "ハルミ",     emoji: "✨",
      feature: "まほうが得意",
      effectDesc: "まほう効果+20%",
      spellMod: 0.20,
      joinRate: 0.60,
      joinMsgs: ["ハルミは静かに呪文を唱えた。", "魔法で支えます。"],
      failMsgs: ["ハルミは首をかしげた。", "魔力の流れがまだ合わないみたい。"] }
  ];

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
      seenOpening: false, // オープニングイベントを見たかどうか
      seenGoal: false,    // 目的説明画面を見たかどうか
      companions: [],     // 現在のパーティー仲間のidリスト(§10)
      hasUkulele: false,  // 女神のウクレレを所持しているか(§14.5)
      singBonusActive: 0  // うたうで発生する次回捕獲ボーナス(使い切りで0にリセット)
    },
    stepsSinceEncounter: 0,
    inBattle: false,
    enemy: null,
    locked: false,       // 戦闘コマンド入力をロック(連打防止)
    modalOpen: false,    // いずれかのモーダル表示中はフィールド操作を止める
    discoveredFinal: false,
    gameCleared: false,  // 究極ゴリラ捕獲クリアフラグ(§14.5)
    pendingClear: false, // 戦闘終了後にクリアモーダルを表示するフラグ
    endingPage: 0,       // エンディングモーダルの現在ページ(v0.7 §28)
    openedChests: {}     // "x,y" -> true: 開封済みの宝箱(§5.7)
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
    if (!hasAilment(id)) return;
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
            } else {
              emoji = TERRAIN_EMOJI[tileChar] || "🟩";
            }
          }
        }
        html += '<div class="tile">' + emoji + "</div>";
      }
    }
    viewport.innerHTML = html;
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
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
    state.player.hasUkulele = true;
    renderField();
    updateStatusBar();
    saveGame();
    alert("まばゆい光を放つ宝箱を開けた！\n\n「女神のウクレレ」を手に入れた！\n\n究極ゴリラの心に届くといわれる伝説のウクレレ。");
  }

  // エンディングモーダルを開く(finishBattle後 または 設定画面の再視聴から呼ばれる)(v0.7 §28)
  function openClearModal() {
    openEndingModal();
  }

  function openEndingModal() {
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
      html += '<p style="font-size:1em;font-weight:bold;color:#ffd166;margin:8px 0;">称号：「森に歌を届けし者」</p>';
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
      ambush: !!monster.ambush              // 戦闘開始時に不意打ちしてくるか(§6.2)
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
    document.getElementById("battle-menu").classList.remove("hidden");

    // 戦闘開始直後の誤タップ防止: 全コマンドをロック(§13.7)
    setBattleLocked(true);

    renderEnemy();
    updateBattlePlayerStatus();
    updateStatusBar();
    clearLog();
    var tag = state.enemy.final ? "【伝説のUMA】" : (state.enemy.rare ? "【激レアUMA】" : "");
    log(tag + state.enemy.name + "が現れた！");
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
  function doFight() {
    if (state.locked) return;
    setBattleLocked(true);
    var p = state.player, e = state.enemy;
    var dmg = Math.max(1, p.atk + randInt(0, 3) - e.def);
    var critChance = getCompanionBonus("critBonus");
    var isCrit = critChance > 0 && Math.random() < critChance;
    if (isCrit) {
      dmg = Math.max(1, Math.floor(dmg * 1.5));
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
      log("🪤 " + e.name + "を捕まえた！");
      captureUma(e);
      logExpGained(e.exp);
      addExp(e.exp);
      showBattleEnd();
      return true;
    }
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
      logExpGained(runExp);
      addExp(runExp);
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
    // 捕獲成功
    log("🪗 勇者の子孫は女神のウクレレを奏でた。");
    log("🎶 森にやさしいメロディが響きわたる。");
    log("🦍 究極ゴリラの怒りが静まっていく……");
    log("🦍 究極ゴリラは静かに目を閉じた。");
    log("🎉 究極ゴリラを捕まえた！");
    captureUma(e);
    state.gameCleared = true;
    state.pendingClear = true;
    logExpGained(e.exp);
    addExp(e.exp);
    saveGame();
    showBattleEnd();
  }

  // HPが0になっても「倒した」ではなく「逃げられた」扱いにする(GAME_DESIGN.md §13)。
  // UMA収集RPGとして、敵を弱らせて捕まえる/取り逃がす、という方向性を強調するため。
  function winBattle() {
    var e = state.enemy;
    log("💨 " + e.name + "に逃げられた！");
    logExpGained(e.exp);
    addExp(e.exp);
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
    state.enemy = null;
    stopWalking(); // 残留walkTimerをリセット
    document.getElementById("btn-battle-ok").classList.add("hidden");
    tickSmellOnBattleEnd();
    document.getElementById("battle-screen").classList.add("hidden");
    document.getElementById("field-screen").classList.remove("hidden");
    document.getElementById("dpad").classList.remove("hidden");
    renderField();
    updateStatusBar();
    saveGame();
    // 究極ゴリラ捕獲クリア後にモーダルを表示(§14.5)
    if (state.pendingClear) {
      state.pendingClear = false;
      openClearModal();
    }
  }

  // ---------------------------------------------------------
  // 17. 経験値・レベルアップ
  // ---------------------------------------------------------
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
  }

  function setBar(barId, textId, val, max) {
    document.getElementById(barId).style.width = Math.max(0, (val / max) * 100) + "%";
    document.getElementById(textId).textContent = val + "/" + max;
  }

  // ---------------------------------------------------------
  // 19. UMA図鑑モーダル(未発見/発見済み/捕獲済み)
  // ---------------------------------------------------------
  function openDexModal() {
    openModal("dex-modal");
    var html = "";
    UMA_DATA.forEach(function (m) {
      var st = state.player.dex[m.id]; // undefined / "seen" / "captured"
      var cls = st === "captured" ? "" : (st === "seen" ? "seen" : "unknown");
      var emoji = st ? m.emoji : "❔";
      var label = st === "captured" ? (m.name + "(捕獲済)") :
        st === "seen" ? (m.name + "(発見済)") : "？？？";
      // 究極ゴリラ捕獲済み時は特別表示(v0.7 §28)
      if (m.id === "ultimategorilla" && st === "captured") {
        html += '<div class="dex-item" style="border:1px solid #ffd166;">' + emoji +
          '<span class="dex-item-name">' + m.name + '(捕獲済)</span>' +
          '<span style="display:block;font-size:8px;color:#ffd166;margin-top:2px;">伝説のUMA</span>' +
          '<span style="display:block;font-size:8px;color:#06d6a0;">森へ帰った</span>' +
          '</div>';
      } else {
        html += '<div class="dex-item ' + cls + '">' + emoji +
          '<span class="dex-item-name">' + label + "</span></div>";
      }
    });
    document.getElementById("dex-list").innerHTML = html;
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

    // 現在の目標(§3.6)
    var html = "<h3>🎯 現在の目標</h3>";
    if (state.gameCleared) {
      html += '<p class="small" style="color:#ffd166;">🏆 クリア済み！<br>称号：「森に歌を届けし者」<br>図鑑・装備集め・仲間集めを続けよう。</p>';
    } else if (p.level >= 99 && p.hasUkulele) {
      html += '<p class="small" style="color:#06d6a0;">Lv.99達成 & ウクレレ所持！<br>究極ゴリラのHPを1〜10まで削って<br>「🎵うたう」コマンドを使えばクリア！</p>';
    } else if (p.level >= 99) {
      html += '<p class="small">Lv.99達成！<br>次は女神のウクレレ🪗を探そう。<br>フィールドの特別な宝箱🪗に眠っている。</p>';
    } else if (p.level >= 50) {
      html += '<p class="small">目標: Lv.99まであと' + (99 - p.level) + 'レベル！<br>メタルゴリラ系を狙って効率よく稼ごう。<br>' +
        (p.hasUkulele ? '🪗 女神のウクレレ：所持済！' : '女神のウクレレ🪗も探しておこう。') + '</p>';
    } else if (p.level >= 20) {
      html += '<p class="small">装備を集めよう！商人に寄ってみよう。<br>宝箱🎁を探してみよう。特別な宝箱🪗もある。<br>メタルゴリラ系に出会えれば経験値大チャンス！</p>';
    } else {
      html += '<p class="small">フィールドを探索しよう！<br>UMAを見つけて経験値を集めよう。<br>実家🏠で回復・酒場🍺で仲間を探そう。</p>';
    }
    var playerTitle = state.gameCleared ? "森に歌を届けし者" : "勇者の子孫";
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
    html += "<h3>UMA</h3>";
    html += '<div class="shop-row"><span>所持UMA総数</span><span>' + capturedCount + "匹</span></div>";
    html += '<div class="shop-row"><span>図鑑進捗</span><span>' + dexDiscovered + "/" + UMA_DATA.length + "</span></div>";
    html += "<h3>重要アイテム</h3>";
    html += '<div class="shop-row"><span>🪗 女神のウクレレ</span><span>' +
      (p.hasUkulele ? '<span style="color:#06d6a0;font-weight:bold;">所持</span>' : '<span style="color:#888;">未入手</span>') +
      "</span></div>";
    if (state.gameCleared) {
      html += '<div class="shop-row"><span>🎉 究極ゴリラ捕獲</span><span style="color:#ffd166;font-weight:bold;">クリア済！</span></div>';
      html += '<button class="shop-menu-btn" id="btn-status-watch-ending" style="margin-top:6px;">🎬 エンディングを見る</button>';
    }
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
        html += '<div class="shop-row"><span>' + item.name + " (" + bonusText(item) + ")</span>" +
          '<button data-sellequip="' + slotInfo.slot + ":" + item.id + '"' +
          (equipped ? " disabled" : "") + ">" +
          (equipped ? "装備中" : sellPrice + "Gで売る") + "</button></div>";
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
        html += '<div class="shop-row"><span>' + (equipped ? "★ " : "") + item.name +
          " (" + bonusText(item) + ")</span>" +
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
    "装備を整えれば生き残りやすくなる。商人に寄ってみよう。"
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
    var hint = HOME_HINTS[Math.floor(Math.random() * HOME_HINTS.length)];
    document.getElementById("home-hint").textContent = "💭 " + hint;
    openModal("home-modal");
  }

  function doRest() {
    var p = state.player;
    var hadAilments = Object.keys(p.statusAilments).length > 0;
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
    html += '<p class="small" style="color:#ff8c8c;margin-top:16px;">⚠️ 危険な操作:</p>';
    html += '<button class="shop-menu-btn" id="btn-new-game" style="border-color:#ff8c8c;color:#ff8c8c;">🔄 ニューゲーム(セーブデータをリセット)</button>';
    if (DEBUG_MODE) {
      html += '<p class="small" style="color:#ffd166;margin-top:16px;">🛠️ 開発用テスト (debug=1)</p>';
      html += '<button class="shop-menu-btn" id="btn-debug-lv99">📈 Lv.99にする</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-ukulele">🪗 女神のウクレレを入手</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-encounter">🦍 究極ゴリラ強制エンカウント</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-encounter-hp5" style="border-color:#06d6a0;color:#06d6a0;">🦍 究極ゴリラHP5で強制エンカウント</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-hp5">❤️ 敵HPを5にする(戦闘中のみ)</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-gold">💰 9999G追加</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-reset">🔄 クリア・ウクレレをリセット</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-play-ending">🎬 エンディングを再生</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-set-cleared">🏆 クリア済みにする</button>';
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
    if (DEBUG_MODE) {
      document.getElementById("btn-debug-lv99").onclick = debugSetLevel99;
      document.getElementById("btn-debug-ukulele").onclick = debugGetUkulele;
      document.getElementById("btn-debug-encounter").onclick = debugForceUltimateGorilla;
      document.getElementById("btn-debug-encounter-hp5").onclick = debugForceUltimateGorillaHP5;
      document.getElementById("btn-debug-hp5").onclick = debugSetEnemyHP5;
      document.getElementById("btn-debug-gold").onclick = debugAddGold;
      document.getElementById("btn-debug-reset").onclick = debugResetClear;
      document.getElementById("btn-debug-play-ending").onclick = debugPlayEnding;
      document.getElementById("btn-debug-set-cleared").onclick = debugSetCleared;
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
        discoveredFinal: state.discoveredFinal,
        gameCleared: state.gameCleared,
        openedChests: state.openedChests
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
      state.discoveredFinal = !!data.discoveredFinal;
      state.gameCleared = !!data.gameCleared;
      state.openedChests = data.openedChests || {};
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
      if (ev.key === "ArrowUp") movePlayer(0, -1);
      else if (ev.key === "ArrowDown") movePlayer(0, 1);
      else if (ev.key === "ArrowLeft") movePlayer(-1, 0);
      else if (ev.key === "ArrowRight") movePlayer(1, 0);
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
      if (Math.abs(dx) > Math.abs(dy)) {
        movePlayer(dx > 0 ? 1 : -1, 0);
      } else {
        movePlayer(0, dy > 0 ? 1 : -1);
      }
    }, { passive: true });

    // 戦闘ボタン
    document.getElementById("btn-fight").addEventListener("click", doFight);
    document.getElementById("btn-magic").addEventListener("click", openMagicMenu);
    document.getElementById("btn-item").addEventListener("click", openItemMenu);
    document.getElementById("btn-catch").addEventListener("click", doCatch);
    document.getElementById("btn-sing").addEventListener("click", doSing);
    document.getElementById("btn-run").addEventListener("click", doRun);

    // エンディングモーダル: つぎへ / 冒険を続ける(v0.7 §28)
    document.getElementById("btn-ending-next").addEventListener("click", function () {
      if (state.endingPage < ENDING_PAGES.length - 1) {
        state.endingPage += 1;
        renderEndingPage();
      } else {
        closeModal("clear-modal");
      }
    });

    // 図鑑モーダル
    document.getElementById("btn-dex").addEventListener("click", openDexModal);
    document.getElementById("btn-dex-close").addEventListener("click", function () {
      closeModal("dex-modal");
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
  // 開発用テスト関数(DEBUG_MODE=trueの時のみ設定画面に表示される。§26)
  // ---------------------------------------------------------
  function debugSetLevel99() {
    var p = state.player;
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
    updateStatusBar();
    saveGame();
    showToast("[DEBUG] Lv.99にした");
    closeModal("settings-modal");
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
    // 発見モーダルをスキップして直接戦闘開始し、同期的にHP5を設定する
    actuallyStartBattle(boss);
    state.enemy.hp = 5;
    renderEnemy();
    showToast("[DEBUG] 究極ゴリラHP5で開始！");
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

  // ---------------------------------------------------------
  // 起動
  // ---------------------------------------------------------
  init();

})();
