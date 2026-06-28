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
    "#...........#",
    "#...~~~.....#",
    "#...~~~.....#",
    "#...........#",
    "#..W........#",
    "#....P......#",
    "#.....#.....#",
    "#......W....#",
    "#....P......#",
    "#...........#",
    "#..#.......##",
    "#...........#",
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
    "T": "🍺"
  };
  // 進入不可の地形
  var BLOCKED = { "#": true, "~": true };
  // エンカウントが起きない安全地形(村・道・施設の上)
  var SAFE_TILE = { ",": true, "H": true, "M": true, "G": true, "T": true };

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
  var NON_UMA_DATA = [
    { id: "slime", name: "スライム", emoji: "🟢", isUMA: false, minLevel: 1, weight: 10, hp: 10, attack: 3, def: 1, captureRate: 0.60, exp: 5 },
    { id: "bat", name: "コウモリ", emoji: "🦇", isUMA: false, minLevel: 1, weight: 10, hp: 9, attack: 4, def: 0, captureRate: 0.55, exp: 5 },
    { id: "wilddog", name: "のらいぬ", emoji: "🐕", isUMA: false, minLevel: 1, weight: 8, hp: 13, attack: 5, def: 1, captureRate: 0.45, exp: 7 },
    { id: "bandit", name: "山賊", emoji: "🥷", isUMA: false, minLevel: 3, weight: 6, hp: 22, attack: 8, def: 2, captureRate: 0.25, exp: 14, inflicts: { id: "smell", chance: 0.3, duration: 3 } }
  ];

  // --- アイテムデータ(消耗品。商人で売買・フィールドで取得) ---
  // trackable: true のものだけ player.potionCount / ropeCount のような専用の
  // 所持数カウンタを持ち、商人の売買UIに表示される。それ以外はデータのみで
  // 購入/使用ロジックは未実装(GAME_DESIGN.md §8参照)。
  var ITEM_DATA = [
    { id: "potion", name: "やくそう", type: "heal", healAmount: 15, buyPrice: 10, sellPrice: 4, trackable: true },
    { id: "rope", name: "捕獲ロープ", type: "capture", captureBonus: 0.25, buyPrice: 15, sellPrice: 5, trackable: true },
    // 以下はデータのみ(未実装)。買う/使うUIにはまだ出てこない。
    { id: "coffee", name: "コーヒー", type: "misc", buyPrice: 0, sellPrice: 0 },
    { id: "bread", name: "パン", type: "misc", buyPrice: 0, sellPrice: 0 },
    { id: "bento", name: "お弁当", type: "misc", buyPrice: 0, sellPrice: 0 },
    { id: "ramen", name: "ラーメン", type: "misc", buyPrice: 0, sellPrice: 0 },
    { id: "coughsyrup", name: "せき止めシロップ", type: "misc", cures: "allergy", buyPrice: 0, sellPrice: 0 },
    { id: "deodorant", name: "デオドラントスプレー", type: "misc", cures: "smell", buyPrice: 0, sellPrice: 0 }
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
    { id: "wirebrush", name: "ワイヤーブラシ", atkBonus: 2 },
    { id: "stone", name: "石", atkBonus: 3 },
    { id: "saw", name: "ノコギリ", atkBonus: 4 },
    { id: "magicwand", name: "魔法のステッキ", atkBonus: 5, mpBonus: 5 },
    { id: "survivalknife", name: "サバイバルナイフ", atkBonus: 6 },
    { id: "ironrod", name: "鉄の棒", atkBonus: 8 },
    { id: "boomerang", name: "ブーメラン", atkBonus: 9 },
    { id: "crowbar", name: "バールのようなもの", atkBonus: 10 },
    { id: "tennisracket", name: "テニスラケット", atkBonus: 10 },
    { id: "shuriken", name: "手裏剣", atkBonus: 11 },
    { id: "nunchaku", name: "ヌンチャク", atkBonus: 12 },
    { id: "woodbat", name: "木製バット", atkBonus: 13 },
    { id: "axe", name: "斧", atkBonus: 15 },
    { id: "metalbat", name: "金属バット", atkBonus: 17 },
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
    { id: "rockt", name: "ロックT", defBonus: 2 },
    { id: "leatherjacket", name: "革ジャン", defBonus: 4 },
    { id: "samuraiarmor", name: "武者よろい", defBonus: 8 },
    { id: "westernarmor", name: "西洋風よろい", defBonus: 12 },
    { id: "nobunagaarmor", name: "信長のよろい", defBonus: 16, hpBonus: 10 },
    { id: "pegasusarmor", name: "ペガサスのよろい", defBonus: 14, hpBonus: 5 },
    { id: "turtlegi", name: "亀の武道着", defBonus: 20, hpBonus: 15 }
  ];

  var SHIELD_DATA = [
    { id: "cardboard", name: "段ボールのたて", defBonus: 0 },
    { id: "ironshield", name: "鉄のたて", defBonus: 5 },
    { id: "dragonshield", name: "ドラゴンのたて", defBonus: 12 },
    { id: "sixfoldshield", name: "六連のたて", defBonus: 20 }
  ];

  var HELMET_DATA = [
    { id: "hachimaki", name: "男塾ハチマキ", defBonus: 0 },
    { id: "helmet", name: "ヘルメット", defBonus: 2 },
    { id: "steelkabuto", name: "鋼鉄のかぶと", defBonus: 5 },
    { id: "cygnuskabuto", name: "キグナスのかぶと", defBonus: 8 },
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
    { id: "sleeperHold", name: "魔性のスリーパー", mpCost: 14, type: "attack", power: 30 }
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
  var RARE_ENCOUNTER_CHANCE = 0.08; // エンカウント発生時、レアUMAになる確率
  var ENCOUNTER_CHANCE = 0.25;      // 草原を1歩進むごとにエンカウントが起きる確率
  var MIN_STEPS_BEFORE_ENCOUNTER = 2; // 戦闘直後はこの歩数分エンカウントしない

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
      spells: [],        // 習得済みスペルのidリスト
      job: null,         // JOB_DATAへの参照。initで既定値を設定する
      dex: {},           // id -> "seen" | "captured"
      umaInventory: {},  // id -> 所持数(同じUMAを複数捕まえられる)
      walkSpeed: "normal", // "slow" | "normal" | "fast" (設定画面で変更)
      // 装備スロット(§8.5)。値は各DATA配列のid。先頭=ボーナス0の初期装備。
      equipment: { weapon: "woodstick", armor: "tshirt", shield: "cardboard", helmet: "hachimaki" },
      statusAilments: {}, // id -> 残りターン/歩数(0より大きい間だけ効果がある)
      seenOpening: false  // オープニングイベントを見たかどうか
    },
    stepsSinceEncounter: 0,
    inBattle: false,
    enemy: null,
    locked: false,       // 戦闘コマンド入力をロック(連打防止)
    modalOpen: false,    // いずれかのモーダル表示中はフィールド操作を止める
    discoveredFinal: false
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

    // オープニングイベント(初回起動時のみ)
    if (!state.player.seenOpening) {
      openModal("opening-modal");
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
  // 7.5 状態異常(GAME_DESIGN.md §13.5)
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

  function clearAilment(id) {
    if (!hasAilment(id)) return;
    var info = AILMENT_INFO[id];
    delete state.player.statusAilments[id];
    showToast(info.icon + " " + info.name + "が治った！");
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
          else emoji = TERRAIN_EMOJI[state.terrain[mapY][mapX]] || "🟩";
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
    if (tile === "M") {
      openMerchantModal();
      return;
    }
    if (tile === "G") {
      openGodModal();
      return;
    }
    if (tile === "T") {
      showToast("🍺 酒場(現在工事中) … 近日オープン予定");
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
    // レアUMA(究極ゴリラ含む)はレベルに関係なく低確率で出現
    if (Math.random() < RARE_ENCOUNTER_CHANCE) {
      var rarePool = UMA_DATA.filter(function (u) { return u.isRare; });
      return weightedPick(rarePool);
    }
    var lv = state.player.level;
    var pool = NON_UMA_DATA.concat(UMA_DATA.filter(function (u) { return !u.isRare; }))
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
      inflicts: monster.inflicts || null // 攻撃時に状態異常を与える可能性(§13.5)
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

    renderEnemy();
    updateBattlePlayerStatus();
    updateStatusBar();
    clearLog();
    var tag = state.enemy.final ? "【伝説のUMA】" : (state.enemy.rare ? "【激レアUMA】" : "");
    log(tag + state.enemy.name + "が現れた！");
    if (isFirstDiscovery) {
      log("✨ " + state.enemy.name + "を見つけた！(UMA図鑑に登録された)");
    }
    setBattleLocked(false);
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
    e.hp = Math.max(0, e.hp - dmg);
    log("⚔ " + p.name + "の攻撃！ " + e.name + "に" + dmg + "のダメージ！");
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

    if (sp.type === "attack") {
      var e = state.enemy;
      var dmg = Math.max(1, sp.power + randInt(0, 4) - e.def);
      e.hp = Math.max(0, e.hp - dmg);
      log("✨ " + sp.name + "！ " + e.name + "に" + dmg + "のダメージ！");
      renderEnemy();
      updateBattlePlayerStatus();
      if (e.hp <= 0) { winBattle(); return; }
    } else {
      var heal = sp.power + randInt(0, 5);
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
    html += '<button class="submenu-back" id="btn-item-back">戻る</button>';
    menu.innerHTML = html;
    menu.classList.remove("hidden");
    document.getElementById("battle-menu").classList.add("hidden");

    document.getElementById("item-potion").onclick = usePotion;
    document.getElementById("item-rope").onclick = useRope;
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

  // ---------------------------------------------------------
  // 15. 戦闘コマンド: つかまえる / にげる
  // ---------------------------------------------------------
  // 捕獲を試みる。bonusChanceは捕獲ロープ使用時などの追加成功率。
  // 成功した場合はtrueを返す(呼び出し側で敵の行動をスキップする)。
  function attemptCapture(bonusChance) {
    var e = state.enemy;
    var job = state.player.job;
    var hpRatio = e.hp / e.maxHp;
    var smellPenalty = hasAilment("smell") ? SMELL_CAPTURE_PENALTY : 0;
    var chance = clamp(
      e.captureRateBase + (1 - hpRatio) * 0.30 + (job.captureMod || 0) + (bonusChance || 0) - smellPenalty,
      0.05, 0.95
    );
    // 究極ゴリラはHPが減っても捕獲率がほぼ上がらないようにする(ラスボス級)
    if (e.final) chance = Math.min(chance, 0.02);
    if (Math.random() < chance) {
      log("🪤 " + e.name + "を捕まえた！");
      captureUma(e);
      logExpGained(e.exp);
      addExp(e.exp);
      finishBattle();
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
    var chance = clamp(e.fleeRate + (job.fleeMod || 0), 0.05, 0.97);
    if (Math.random() < chance) {
      log("💨 うまく逃げ切った！");
      var runExp = Math.max(1, Math.floor(e.exp * 0.2));
      logExpGained(runExp);
      addExp(runExp);
      finishBattle();
    } else {
      log("💨 しかし逃げられなかった！");
      setTimeout(enemyTurn, 600);
    }
  }

  function winBattle() {
    log("🎉 " + state.enemy.name + "をたおした！");
    logExpGained(state.enemy.exp);
    addExp(state.enemy.exp);
    finishBattle();
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

  function finishBattle() {
    state.inBattle = false;
    state.enemy = null;
    tickSmellOnBattleEnd();
    document.getElementById("battle-screen").classList.add("hidden");
    document.getElementById("field-screen").classList.remove("hidden");
    document.getElementById("dpad").classList.remove("hidden");
    renderField();
    updateStatusBar();
    saveGame();
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
    p.nextExp = p.level * 15 + 20;
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
      html += '<div class="dex-item ' + cls + '">' + emoji +
        '<span class="dex-item-name">' + label + "</span></div>";
    });
    document.getElementById("dex-list").innerHTML = html;
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
    body.innerHTML =
      "<p>所持金: " + state.player.gold + " G</p>" +
      '<button class="shop-menu-btn" id="m-buy">🛍️ 買う</button>' +
      '<button class="shop-menu-btn" id="m-sell-item">📤 アイテムを売る</button>' +
      '<button class="shop-menu-btn" id="m-sell-uma">🦍 UMAを売る</button>';
    document.getElementById("m-buy").onclick = renderMerchantBuy;
    document.getElementById("m-sell-item").onclick = renderMerchantSellItem;
    document.getElementById("m-sell-uma").onclick = renderMerchantSellUma;
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
      if (it.id === "potion") p.potionCount++;
      else if (it.id === "rope") p.ropeCount++;
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
      var count = it.id === "potion" ? p.potionCount : it.id === "rope" ? p.ropeCount : 0;
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
    var count = id === "potion" ? p.potionCount : id === "rope" ? p.ropeCount : 0;
    if (count <= 0) return;
    if (id === "potion") p.potionCount--;
    else if (id === "rope") p.ropeCount--;
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
  var EQUIP_SLOTS = [
    { slot: "weapon", label: "⚔ 武器", data: function () { return EQUIP_WEAPON_DATA; } },
    { slot: "armor", label: "🥋 防具", data: function () { return ARMOR_DATA; } },
    { slot: "shield", label: "🛡 盾", data: function () { return SHIELD_DATA; } },
    { slot: "helmet", label: "⛑ 兜", data: function () { return HELMET_DATA; } }
  ];

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
        var bonusText = [];
        if (item.atkBonus) bonusText.push("攻+" + item.atkBonus);
        if (item.defBonus) bonusText.push("防+" + item.defBonus);
        if (item.hpBonus) bonusText.push("HP+" + item.hpBonus);
        if (item.mpBonus) bonusText.push("MP+" + item.mpBonus);
        html += '<div class="shop-row"><span>' + (equipped ? "★ " : "") + item.name +
          " (" + (bonusText.join(" ") || "ボーナスなし") + ")</span>" +
          '<button data-equip="' + slotInfo.slot + ":" + item.id + '"' +
          (equipped ? " disabled" : "") + ">" + (equipped ? "装備中" : "装備する") + "</button></div>";
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

  function equipItem(slot, id) {
    state.player.equipment[slot] = id;
    recomputeStats();
    updateStatusBar();
    renderEquipBody();
    saveGame();
  }

  // ---------------------------------------------------------
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
    body.innerHTML = html;
    body.querySelectorAll("button[data-speed]").forEach(function (btn) {
      btn.onclick = function () { changeWalkSpeed(btn.getAttribute("data-speed")); };
    });
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
        spells: p.spells, jobId: p.job.id,
        dex: p.dex, umaInventory: p.umaInventory,
        walkSpeed: p.walkSpeed,
        equipment: p.equipment,
        statusAilments: p.statusAilments,
        seenOpening: p.seenOpening,
        discoveredFinal: state.discoveredFinal
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
      p.spells = data.spells || [];
      p.dex = data.dex || {};
      p.umaInventory = data.umaInventory || {};
      p.walkSpeed = WALK_SPEED_MS[data.walkSpeed] ? data.walkSpeed : "normal";
      p.equipment = data.equipment || p.equipment;
      p.statusAilments = data.statusAilments || {};
      p.seenOpening = !!data.seenOpening;
      state.discoveredFinal = !!data.discoveredFinal;
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
    document.getElementById("btn-run").addEventListener("click", doRun);

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

    // オープニングモーダル(初回起動時のみ表示)
    document.getElementById("btn-opening-close").addEventListener("click", function () {
      state.player.seenOpening = true;
      closeModal("opening-modal");
      saveGame();
    });
  }

  // ---------------------------------------------------------
  // 起動
  // ---------------------------------------------------------
  init();

})();
