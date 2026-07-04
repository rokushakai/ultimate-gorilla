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
    "#,,,N,,,,G,,#",  // N=攻略ペーパービュー屋(4,3) v0.8.6 §37
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
    "N": "📰"   // 攻略ペーパービュー屋(§37 v0.8.6)
  };
  // 進入不可の地形
  var BLOCKED = { "#": true, "~": true };
  // エンカウントが起きない安全地形(村・道・施設・宝箱・NPC上)
  var SAFE_TILE = { ",": true, "H": true, "M": true, "G": true, "T": true, "B": true, "U": true, "A": true, "C": true, "J": true, "X": true, "D": true, "R": true, "K": true, "E": true, "S": true, "N": true };

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
    { id: "kappa", name: "カッパ", emoji: "🐢", rarity: "コモン", isUMA: true, isRare: false, minLevel: 1, weight: 7, hp: 16, attack: 6, def: 2, captureRate: 0.40, exp: 10, sellPrice: 8,
      desc: "水辺に現れるとされるUMA。甲羅が目印。きゅうりが好きかもしれない。" },
    { id: "tsuchinoko", name: "ツチノコ", emoji: "🐍", rarity: "コモン", isUMA: true, isRare: false, minLevel: 2, weight: 6, hp: 18, attack: 7, def: 2, captureRate: 0.38, exp: 12, sellPrice: 10,
      desc: "古くから目撃談のある太い胴体の蛇型UMA。意外とすばしっこい。" },
    { id: "hibagon", name: "ヒバゴン", emoji: "🦧", rarity: "アンコモン", isUMA: true, isRare: false, minLevel: 3, weight: 5, hp: 24, attack: 8, def: 3, captureRate: 0.30, exp: 16, sellPrice: 16,
      desc: "広島の山中で目撃された類人猿型UMA。ひとり行動を好む孤独な存在。" },
    { id: "mothman", name: "モスマン", emoji: "🦋", rarity: "アンコモン", isUMA: true, isRare: false, minLevel: 4, weight: 5, hp: 22, attack: 9, def: 2, captureRate: 0.30, exp: 18, sellPrice: 18,
      desc: "巨大な翼を持つ謎の飛行UMA。夜に目撃されることが多く、不吉の前兆ともいわれる。" },
    { id: "bigfoot", name: "ビッグフット", emoji: "🦶", rarity: "レア", isUMA: true, isRare: true, weight: 10, hp: 40, attack: 11, def: 4, captureRate: 0.18, exp: 35, sellPrice: 60, fleeRate: 0.80, inflicts: { id: "allergy", chance: 0.3, duration: 12 },
      desc: "大きな足跡を残す巨大UMA。出会った者はたいてい驚く。体毛がアレルギーを引き起こすことがある。" },
    { id: "nessie", name: "ネッシー", emoji: "🐉", rarity: "レア", isUMA: true, isRare: true, weight: 10, hp: 42, attack: 11, def: 5, captureRate: 0.16, exp: 38, sellPrice: 65, fleeRate: 0.80,
      desc: "湖の深みに住むと噂される巨大UMA。水しぶきと共に颯爽と姿を現す。" },
    { id: "yeti", name: "イエティ", emoji: "☃️", rarity: "レア", isUMA: true, isRare: true, weight: 8, hp: 45, attack: 12, def: 5, captureRate: 0.15, exp: 42, sellPrice: 70, fleeRate: 0.80,
      desc: "雪山に棲む雪男。体は大きいが動きは鈍い。寒さには強く、暑さには弱いらしい。" },
    { id: "jerseydevil", name: "ジャージーデビル", emoji: "👹", rarity: "レア", isUMA: true, isRare: true, weight: 8, hp: 46, attack: 13, def: 4, captureRate: 0.14, exp: 44, sellPrice: 75, fleeRate: 0.80,
      desc: "ニュージャージーの森に棲む翼を持つ悪魔型UMA。遭遇した者はろくなことがないという。" },
    // 究極ゴリラはラスボス級。レベル99+最強装備クラスでないと基本的に倒せない
    // 捕獲もattemptCapture()内で別途上限を掛けてほぼ不可能にしている。
    { id: "ultimategorilla", name: "究極ゴリラ", emoji: "🦍", rarity: "伝説", isUMA: true, isRare: true, final: true, weight: 4, hp: 5000, attack: 150, def: 60, captureRate: 0.005, exp: 300, sellPrice: 99999, fleeRate: 0.95,
      desc: "森の奥に現れる究極のUMA。通常の捕獲は一切通用しない。女神のウクレレの音色のみが、その心を鎮めるという。" }
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
    enemy: null,
    locked: false,       // 戦闘コマンド入力をロック(連打防止)
    modalOpen: false,    // いずれかのモーダル表示中はフィールド操作を止める
    discoveredFinal: false,
    gameCleared: false,  // 究極ゴリラ捕獲クリアフラグ(§14.5)
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
    openEndingModal();
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
    playSE("attack");
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
      playSE("captureOk");
      log("🪤 " + e.name + "を捕まえた！");
      captureUma(e);
      logExpGained(e.exp);
      addExp(e.exp);
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
    state.enemy = null;
    stopWalking(); // 残留walkTimerをリセット
    updateBGM("field");
    document.getElementById("btn-battle-ok").classList.add("hidden");
    tickSmellOnBattleEnd();
    document.getElementById("battle-screen").classList.add("hidden");
    document.getElementById("field-screen").classList.remove("hidden");
    document.getElementById("dpad").classList.remove("hidden");
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
  }

  function setBar(barId, textId, val, max) {
    document.getElementById(barId).style.width = Math.max(0, (val / max) * 100) + "%";
    document.getElementById(textId).textContent = val + "/" + max;
  }

  // ---------------------------------------------------------
  // 19. UMA図鑑モーダル(§31 v0.8.1 詳細タップ対応)
  // ---------------------------------------------------------
  function openDexModal() {
    openModal("dex-modal");
    renderDexBody();
  }

  function renderDexBody() {
    var p = state.player;
    var totalUma = UMA_DATA.length;
    var discoveredCount = UMA_DATA.filter(function(m) { return !!p.dex[m.id]; }).length;
    var capturedDexCount = UMA_DATA.filter(function(m) { return p.dex[m.id] === "captured"; }).length;

    var html = '<div class="dex-progress" style="grid-column:1/-1;">';
    html += '<span>📖 発見: ' + discoveredCount + "/" + totalUma + '</span>';
    html += '<span>✅ 捕獲: ' + capturedDexCount + "/" + totalUma + '</span>';
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
    var playerTitle;
    if (state.gameCleared) {
      playerTitle = "森に歌を届けし者";
    } else if (p.level >= 99 || p.level99Shown) {
      playerTitle = "究極に近づきし者";
    } else {
      playerTitle = "勇者の子孫";
    }
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

  // 伝説装備リスト(v0.8 §30, v0.8.3 §33) — ステータス画面の進捗表示に使用
  var LEGEND_EQUIPS = [
    { name: "ペガサスのよろい", flag: "pegasusArmorGot" },
    { name: "六連のたて", flag: "sixfoldShieldGot" },
    { name: "宇宙のかぶと", flag: "cosmicHelmetGot" },
    { name: "如意棒", flag: "nyoiboGot" },
    { name: "アンドロメダの鎖", flag: "andromedaGot" },
    { name: "キグナスのかぶと", flag: "cygnusHelmetGot" },   // v0.8.3
    { name: "ドラゴンのたて", flag: "dragonShieldGot" }      // v0.8.3
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
        if (capturedCount >= 8) {
          lines.push("すばらしい！図鑑がほぼ完成しておるぞ！");
          lines.push("究極ゴリラを捕まえたら、図鑑は完璧じゃ。");
        } else if (capturedCount >= 4) {
          lines.push("なかなか集まってきたな。図鑑を埋めるのも立派な冒険じゃ。");
          lines.push("捕まえたUMAは、図鑑でタップすると詳しい能力を確認できるぞ。");
        } else {
          lines.push("UMAを見つけたら図鑑に記録される。捕まえると完全なデータになるぞ。");
          lines.push("図鑑でタップすれば詳細なステータスが見られる。");
        }
        if (state.gameCleared) {
          lines.push("図鑑の完成まで目指してみないか。まだ捕まえていない伝説が残っているぞ。");
        } else if (p.level >= 99) {
          lines.push("素晴らしい成長じゃ。もはや君は、伝説に手を伸ばせる場所にいる。");
          lines.push("あとは女神のウクレレと歌声だけが必要だ。");
        } else {
          lines.push("キラリと光るゴリラに出会ったら、経験値のチャンスじゃ！見逃すなよ。");
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
        if (p.hasUkulele) {
          lines.push("女神の音色を手に入れたのか……星のように光る宝箱がそれに反応するらしいぞ。");
          lines.push("力ある者には、岩に刺さった棒も引き抜けるかもしれない。強い仲間を連れてみな。");
        } else if (p.level >= 50) {
          lines.push("白く光る🌟宝箱があるだろう？強き者にしか開かぬという噂だ。");
          lines.push("そういえば草原のどこかに✨輝く宝箱も見かけた。Lv40あれば開けられるかもしれんな。");
        } else if (p.level >= 40) {
          lines.push("草原を進んでいったら✨輝く宝箱を見かけた。普通の宝箱とは違う光だった。");
          lines.push("試しに開けてみないか？お前ならもう十分強いと思うが。");
        } else {
          lines.push("草原には普通の宝箱🎁の他に、✨特別な光を放つ宝箱が眠っていることもあるらしい。");
          lines.push("もっと強くなれば、特別な宝箱の謎が解けるかもしれないぞ。");
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
        } else {
          lines.push("装備は「🎽装備」ボタンでいつでも変更できる。商人で強い装備を買ってみろ。");
        }
        if (hasAnyLegend) {
          lines.push("★伝説の装備は、商人には売れんぞ。大切にな。");
        } else if (p.level >= 30) {
          lines.push("フィールドには商人では買えない伝説の装備が眠っている。探してみな。");
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
          lines.push("お前は究極ゴリラを森へ帰した者。もはや立派なゴリラ研究家だ！");
          lines.push("伝説の装備をすべて集めたか？まだ見ぬ装備が残っているかもしれないぞ。");
        } else if (p.level >= 99 && p.hasUkulele) {
          lines.push("準備は万端だ！究極ゴリラのHPをギリギリまで減らし、「うたう」んだ！");
          lines.push("目安はHP1〜10。倒してしまっては意味がないぞ。");
        } else if (p.level >= 99) {
          lines.push("力は十分だ。あとは女神のウクレレの音色が必要だぞ。");
          lines.push("フィールドの奥に🪗特別な宝箱がある。探してみろ。");
        } else if (p.level >= 50) {
          lines.push("究極ゴリラに歌を届けるには、相当な力が必要だろう。目標はレベル99だ。");
          lines.push("メタルゴリラ系を狙えば効率よくレベルが上がるぞ！");
        } else {
          lines.push("究極ゴリラは、普通に捕まえようとしても無理だ。特別な条件が必要になる。");
          lines.push("まずは力を蓄えろ。いつかその条件が分かる時が来る。");
        }
        return lines;
      }
    },
    S: {
      name: "王様の使い",
      emoji: "👑",
      getLines: function () {
        var lines = [];
        if (state.eventFlags && state.eventFlags.dragonShieldGot) {
          if (state.eventFlags.andromedaGot) {
            lines.push("ドラゴンのたてもアンドロメダの鎖も手に入れたとは……まことに立派じゃ。");
          } else {
            lines.push("ドラゴンのたてはお役に立てているかな？");
          }
          lines.push("王様は、そなたのさらなる冒険を見守っておられます。");
        } else if (state.gameCleared) {
          lines.push("王様から褒美があるそうだ。実家で休んでみるとよい。");
          lines.push("究極ゴリラを森へ帰した者への、王様からの感謝の品だとのことじゃ。");
        } else {
          lines.push("王様は、究極ゴリラの報告を待っておられる。");
          lines.push("しっかり準備を整えてから挑むように、とのことじゃ。");
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
    "実家には、昔から伝わる盾があるとかないとか……。"
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
    if (!state.gameCleared && p.level >= 99 && p.hasUkulele) {
      hint = "Lv99 & ウクレレ所持！究極ゴリラのHPを1〜10まで削って「🎵うたう」コマンドを使おう。";
    } else if (!state.gameCleared && p.level >= 99) {
      hint = "Lv99に到達した！あとは女神のウクレレ🪗を手に入れれば、究極ゴリラを鎮められる。";
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
      html += '<button class="shop-menu-btn" id="btn-debug-lv99">📈 Lv.99にする</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-lv98">📉 Lv.98にする</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-set-lvup-exp">⬆️ 次の戦闘でLvUP(EXP設定)</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-reset-lv99">🔄 Lv99到達フラグをリセット</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-ukulele">🪗 女神のウクレレを入手</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-encounter">🦍 究極ゴリラ強制エンカウント</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-encounter-hp5" style="border-color:#06d6a0;color:#06d6a0;">🦍 究極ゴリラHP5で強制エンカウント</button>';
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
      html += '<button class="shop-menu-btn" id="btn-debug-bgm-field">🎵 [TEST] フィールドBGM</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-bgm-battle">🎵 [TEST] バトルBGM</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-bgm-ending">🎵 [TEST] エンディングBGM</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-bgm-stop">🔇 [TEST] BGM停止</button>';
      html += '<button class="shop-menu-btn" id="btn-debug-bgm-hard-stop">🔇 BGM完全停止(stopBGMHard)</button>';
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
        if (bgmEnabled) updateBGM("field");
      }
      saveSoundSettings();
      renderSettingsBody();
    };
    document.getElementById("btn-toggle-bgm").onclick = function () {
      if (!soundEnabled) return;
      bgmEnabled = !bgmEnabled;
      if (!bgmEnabled) { stopBGM(); } else { updateBGM("field"); }
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
      document.getElementById("btn-debug-lv99").onclick = debugSetLevel99;
      document.getElementById("btn-debug-lv98").onclick = debugSetLevel98;
      document.getElementById("btn-debug-set-lvup-exp").onclick = debugSetLvUpExp;
      document.getElementById("btn-debug-reset-lv99").onclick = debugResetLv99;
      document.getElementById("btn-debug-ukulele").onclick = debugGetUkulele;
      document.getElementById("btn-debug-encounter").onclick = debugForceUltimateGorilla;
      document.getElementById("btn-debug-encounter-hp5").onclick = debugForceUltimateGorillaHP5;
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
        showToast("[DEBUG] フィールドBGM再生");
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
        openedChests: state.openedChests,
        eventFlags: state.eventFlags
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
      updateBGM("field");
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
      if (ev.key === "ArrowUp") { updateBGM("field"); movePlayer(0, -1); }
      else if (ev.key === "ArrowDown") { updateBGM("field"); movePlayer(0, 1); }
      else if (ev.key === "ArrowLeft") { updateBGM("field"); movePlayer(-1, 0); }
      else if (ev.key === "ArrowRight") { updateBGM("field"); movePlayer(1, 0); }
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
        updateBGM("field");
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

  // 現在の進行状況からヒント優先度(0〜8)を返す
  function getHintPriority() {
    var p = state.player;
    var ef = state.eventFlags;
    if (state.gameCleared) return 0;
    if (p.level < 40) return 1;
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
    var priority = getHintPriority();
    var h = [
      // 0: クリア済み
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
    html += "<p class=\"small\" style=\"color:#ffd166;margin-bottom:10px;\">所持金: 💰 " + p.money + "G</p>";
    var tiers = [
      { tier: 1, cost: 10,  label: "ぼんやりヒント",  color: "#adb5bd" },
      { tier: 2, cost: 50,  label: "具体的ヒント",    color: "#74c0fc" },
      { tier: 3, cost: 100, label: "ほぼ答え",        color: "#06d6a0" }
    ];
    for (var i = 0; i < tiers.length; i++) {
      var t = tiers[i];
      var canAfford = p.money >= t.cost;
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
    if (p.money < cost) { showToast("お金が足りない！"); return; }
    p.money -= cost;
    updateStatusBar();
    saveGame();
    playSE("itemGet");
    renderHintResult(getProgressHint(tier), tier, cost);
  }

  function renderHintResult(hint, tier, cost) {
    var tierLabels = ["", "ぼんやりヒント", "具体的ヒント", "ほぼ答え"];
    var body = document.getElementById("hint-shop-body");
    var html = "";
    html += "<p class=\"small\" style=\"color:#ffd166;margin-bottom:6px;\">📰 " + tierLabels[tier] + " (" + cost + "G)</p>";
    html += "<p style=\"margin:8px 0;color:#e0e0e0;\">「" + hint + "」</p>";
    html += "<div style=\"margin-top:12px;\">";
    html += "<button class=\"shop-menu-btn\" id=\"btn-hint-again\">もう一度買う</button>";
    html += "</div>";
    body.innerHTML = html;
    document.getElementById("btn-hint-again").onclick = renderHintShopMenu;
  }

  // ---------------------------------------------------------
  // 開発用テスト関数(DEBUG_MODE=trueの時のみ設定画面に表示される。§26)
  // ---------------------------------------------------------
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
