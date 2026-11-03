// =========================================================
// 究極ゴリラ ゲームセンター: 🎸 ゴリラベース（§254）
// arcade.js・arcade-melody.js の後に読み込む。音は window.UGMelody を使う。
// 録音（テイク）はシーケンサーの打ち込みと同じ [拍, 長さ（拍）, MIDI] の形で保存し、
// ゴリラウクレレのシーケンサーへ「🎸 ベース打ち込み」トラックとして送れる
// =========================================================
(function () {
  "use strict";

  var I = window.UGArcade && window.UGArcade.internal;
  if (!I) { return; }
  var W = I.W, hudText = I.hudText, emojiAt = I.emojiAt, lsGet = I.lsGet, lsSet = I.lsSet, escHtml = I.escHtml;

  var BASS_H = 300;
  var BASS_PREFS_KEY = "ultimateGorillaBassPrefsV1", BASS_TAKES_KEY = "ultimateGorillaBassTakesV1";
  var BASS_TAKES_MAX = 10, BASS_NOTES_MAX = 1000;
  var BASS_MYPATS_KEY = "ultimateGorillaBassMyPatsV1", BASS_MYPATS_MAX = 8;
  var BASS_HOLD = 8; // §258: 弾いた音がつづく秒（はなす・次の音で止める）
  var BASS_DO = ["ド", "ド#", "レ", "レ#", "ミ", "ファ", "ファ#", "ソ", "ソ#", "ラ", "ラ#", "シ"];
  var BASS_CDE = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  var BASS_NAMES = [["do", "ドレミ"], ["cde", "CDE"], ["none", "なし"]];
  var BASS_VIEWS = [["fret", "&#x1F3B8; フレット"], ["pad", "&#x1F39B;&#xFE0F; パッド"]];
  // §256: 奏法
  var BASS_TECHS = [["normal", "ふつう"], ["slap", "&#x1F44D; スラップ"], ["mute", "&#x1F92B; ミュート"]];
  // 音色 [GM の番号, 名前]（§261: ぜんぶ本物の楽器のサンプル。読みこむまでは合成音）
  var BASS_VOICES = [[32, "&#x1F3BB; ウッドベース"], [33, "&#x1F3B8; エレキベース（指）"], [34, "&#x1F3B8; ピック"], [35, "&#x1F3B8; フレットレス"],
    [36, "&#x1F44D; スラップ"], [37, "&#x1F44D; スラップ2"], [38, "&#x1F39B;&#xFE0F; シンセベース"], [39, "&#x1F39B;&#xFE0F; シンセベース2"]];

  // ---------- フレット ----------
  // 弦（上から G・D・A・E）の開放弦の MIDI と名前
  var BASS_STRINGS = [[43, "G"], [38, "D"], [33, "A"], [28, "E"]];
  var BASS_COLS = 8, BASS_POS_MAX = 12, BASS_BOARD_Y = 128, BASS_BOARD_X = 4, BASS_BOARD_R = W - 4, BASS_BOARD_BOT = 294, BASS_MIRROR = false;
  var BASS_MARKS = [3, 5, 7, 9, 12, 15, 17, 19, 21]; // フレットの印（12 は2つ）
  // §287: 右手ピッキング（左手で押さえて、板の右の「右手」の所で弾く）。そのときフレットは たて 6列・よこ 9列
  // §288: よこ向きは「持ち方」（利き手・ネックの太さと位置・右手の所の広さ）で板の形を変える
  var BASS_PICK = false, BASS_PICK_X = W - 4 - Math.round(W * 0.24), BASS_PICK_R = W - 4;
  function bassSetPick(on) {
    var g = BASS_LAND ? bassGrip() : null, zw = Math.round(W * (g ? g.pw / 100 : 0.24)), gut = BASS_LAND ? 11 : 4;
    BASS_PICK = !!on;
    BASS_MIRROR = !!(g && g.lefty);
    BASS_COLS = BASS_LAND ? (on ? Math.max(6, Math.round(12 * (1 - zw / W))) : 12) : (on ? 6 : 8);
    if (BASS_LAND) { var bx = bassGripBox(38, BASS_H - 9, g); BASS_BOARD_Y = bx.y0; BASS_BOARD_BOT = bx.y1; } else { BASS_BOARD_BOT = BASS_H - 6; }
    if (!BASS_MIRROR) { BASS_PICK_X = W - 4 - zw; BASS_PICK_R = W - 4; BASS_BOARD_X = gut; BASS_BOARD_R = on ? BASS_PICK_X - 6 : W - 4; }
    else { BASS_PICK_X = 4; BASS_PICK_R = 4 + zw; BASS_BOARD_X = on ? BASS_PICK_R + 6 : 4; BASS_BOARD_R = W - gut; }
  }
  // §288: 持ち方（ギターとベースで共通・ultimateGorillaGripV1）
  var BASS_GRIP_KEY = "ultimateGorillaGripV1";
  var BASS_GRIP_SIZES = [["s", "細い", 0.7], ["m", "ふつう", 0.85], ["l", "太い", 1]], BASS_GRIP_POS = [["top", "上", 0], ["mid", "まん中", 0.5], ["bot", "下", 1]], BASS_GRIP_PW = [20, 25, 30, 35];
  function bassGrip() {
    var g = lsGet(BASS_GRIP_KEY) || {};
    return { lefty: !!g.lefty, size: bassOpt(BASS_GRIP_SIZES, g.size || "l")[0], pos: bassOpt(BASS_GRIP_POS, g.pos || "mid")[0], pw: BASS_GRIP_PW.indexOf(Number(g.pw)) >= 0 ? Number(g.pw) : 25 };
  }
  // 高さ top〜bot の中のネックの上下 → { y0, y1 }
  function bassGripBox(top, bot, g) {
    var av = bot - top, h = av * bassOpt(BASS_GRIP_SIZES, g.size)[2], y0 = top + (av - h) * bassOpt(BASS_GRIP_POS, g.pos)[2];
    return { y0: y0, y1: y0 + h };
  }
  function bassNext(list, id) { for (var i = 0; i < list.length; i++) { if (list[i][0] === id) { return list[(i + 1) % list.length][0]; } } return list[0][0]; }
  // 持ち方を1つ進める（k: "lefty" / "size" / "pos" / "pw"）→ 新しい持ち方
  function bassGripStep(k) {
    var g = bassGrip();
    if (k === "lefty") { g.lefty = !g.lefty; }
    else if (k === "size") { g.size = bassNext(BASS_GRIP_SIZES, g.size); }
    else if (k === "pos") { g.pos = bassNext(BASS_GRIP_POS, g.pos); }
    else if (k === "pw") { g.pw = BASS_GRIP_PW[(BASS_GRIP_PW.indexOf(g.pw) + 1) % BASS_GRIP_PW.length]; }
    lsSet(BASS_GRIP_KEY, g);
    return g;
  }
  // パネルの持ち方の行（attr: ボタンの data- の名前 "ba" / "ga"）
  function bassGripRows(attr) {
    var g = bassGrip();
    return '<p class="small" style="margin:6px 0 2px;">&#x1F4F1; 持ち方（スマホと手に合わせて）</p>' +
      '<div class="piano-row"><button class="modal-btn" data-' + attr + '="grip:lefty">&#x270B; ' + (g.lefty ? "左利き" : "右利き") + '</button>' +
      '<button class="modal-btn" data-' + attr + '="grip:size">ネック: ' + bassOpt(BASS_GRIP_SIZES, g.size)[1] + '</button></div>' +
      '<div class="piano-row"><button class="modal-btn" data-' + attr + '="grip:pos">ネックの位置: ' + bassOpt(BASS_GRIP_POS, g.pos)[1] + '</button>' +
      '<button class="modal-btn" data-' + attr + '="grip:pw">右手の所: ' + g.pw + '%</button></div>';
  }
  function bassColW() { return (BASS_BOARD_R - BASS_BOARD_X) / BASS_COLS; }
  // 列 c の左はし（左利きは右から並ぶ）
  function bassColX(c) { return BASS_MIRROR ? BASS_BOARD_R - (c + 1) * bassColW() : BASS_BOARD_X + c * bassColW(); }
  // 列の区切り c（1 ＝ ナット側から1本目）の x
  function bassFretX(c) { return BASS_MIRROR ? BASS_BOARD_R - c * bassColW() : BASS_BOARD_X + c * bassColW(); }
  function bassRowLineY(s) { return BASS_BOARD_Y + (s + 0.5) * bassRowH(); }
  // 右手の所の弦（外は -1）
  function bassPickRow(x, y) {
    if (!BASS_PICK || x < BASS_PICK_X || x > BASS_PICK_R || y < BASS_BOARD_Y || y >= BASS_BOARD_Y + bassRowH() * BASS_STRINGS.length) { return -1; }
    return Math.floor((y - BASS_BOARD_Y) / bassRowH());
  }
  function bassRowH() { return (BASS_BOARD_BOT - BASS_BOARD_Y) / BASS_STRINGS.length; }
  // マス（弦 s・列 c）の四角
  function bassCellRect(s, c) { var cw = bassColW(), rh = bassRowH(); return { x: bassColX(c), y: BASS_BOARD_Y + s * rh, w: cw, h: rh }; }
  // 列 c のフレット（ポジション pos から）
  function bassFretOf(pos, c) { return pos + c; }
  // 座標 → { s: 弦, c: 列, f: フレット, m: MIDI }。フレットの外なら null
  function bassCellAt(x, y, pos) {
    var cw = bassColW(), rh = bassRowH(), c = Math.floor((BASS_MIRROR ? BASS_BOARD_R - x : x - BASS_BOARD_X) / cw), s = Math.floor((y - BASS_BOARD_Y) / rh);
    if (x < BASS_BOARD_X || x >= BASS_BOARD_R || c < 0 || c >= BASS_COLS || s < 0 || s >= BASS_STRINGS.length || y < BASS_BOARD_Y) { return null; }
    var f = bassFretOf(pos, c);
    return { s: s, c: c, f: f, m: BASS_STRINGS[s][0] + f };
  }
  function bassPc(m) { return ((m % 12) + 12) % 12; }
  function bassName(m, names) {
    if (names === "none") { return ""; }
    return names === "cde" ? BASS_CDE[bassPc(m)] + (Math.floor(m / 12) - 1) : BASS_DO[bassPc(m)];
  }

  // ---------- パッド（いまのコードに合う音）----------
  var BASS_SCALE = [0, 2, 4, 5, 7, 9, 11];
  // §262: スケール [id, 名前, 主音からの半音7つ]
  var BASS_SCALES = [
    ["major", "メジャー（イオニアン）", [0, 2, 4, 5, 7, 9, 11], [3, 6], "4度・7度"], ["minor", "ナチュラルマイナー（エオリアン）", [0, 2, 3, 5, 7, 8, 10], [5], "♭6度"],
    ["harm", "ハーモニックマイナー", [0, 2, 3, 5, 7, 8, 11], [6], "7度"], ["melo", "メロディックマイナー", [0, 2, 3, 5, 7, 9, 11], [5, 6], "6度・7度"],
    ["dorian", "ドリアン", [0, 2, 3, 5, 7, 9, 10], [5], "6度"], ["phryg", "フリジアン", [0, 1, 3, 5, 7, 8, 10], [1], "♭2度"], ["lydian", "リディアン", [0, 2, 4, 6, 7, 9, 11], [3], "♯4度"],
    ["mixo", "ミクソリディアン", [0, 2, 4, 5, 7, 9, 10], [6], "♭7度"], ["locrian", "ロクリアン", [0, 1, 3, 5, 6, 8, 10], [4], "♭5度"]
  ];
  var BASS_SCALE_GROUPS = [["ダイアトニック", ["major", "minor"]], ["マイナーの変化形", ["harm", "melo"]], ["教会旋法", ["dorian", "phryg", "lydian", "mixo", "locrian"]]];
  var BASS_ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"];
  function bassScale(id) { for (var i = 0; i < BASS_SCALES.length; i++) { if (BASS_SCALES[i][0] === id) { return BASS_SCALES[i]; } } return BASS_SCALES[0]; }
  // §263: キーとスケールの音 → { 音の高さ（0〜11）: 1 ＝ スケールの音・2 ＝ 特徴音・3 ＝ 主音 }
  function bassScalePcs(key, scale) {
    var s = bassScale(scale), out = {}, i;
    for (i = 0; i < 7; i++) { out[(key + s[2][i]) % 12] = i === 0 ? 3 : (s[3].indexOf(i) >= 0 ? 2 : 1); }
    return out;
  }
  // §263: コード進行 [id, 名前, 1小節ごとのスケールの度数（0〜6）]
  var BASS_CPROGS = [
    ["royal", "王道進行（IV-V-iii-vi）", [3, 4, 2, 5]], ["pop4", "I-V-vi-IV", [0, 4, 5, 3]], ["canon", "カノン進行", [0, 4, 5, 2, 3, 0, 3, 4]],
    ["komuro", "小室進行（vi-IV-V-I）", [5, 3, 4, 0]], ["fifty", "50年代（I-vi-IV-V）", [0, 5, 3, 4]], ["twofive", "ツーファイブ（ii-V-I）", [1, 4, 0, 0]],
    ["blues12", "12小節ブルース", [0, 0, 0, 0, 3, 3, 0, 0, 4, 3, 0, 4]],
    ["minor3", "マイナーの3コード（i-iv-v-i）", [0, 3, 4, 0]], ["andalus", "アンダルシア進行（i-♭VII-♭VI-V）", [0, 6, 5, 4]], ["epic", "エピック（i-♭VI-♭III-♭VII）", [0, 5, 2, 6]],
    ["dorvamp", "ドリアン向け（i-IV）", [0, 3]], ["mixvamp", "ミクソリディアン向け（I-♭VII-IV-I）", [0, 6, 3, 0]], ["lydvamp", "リディアン向け（I-II）", [0, 1]],
    ["phrvamp", "フリジアン向け（i-♭II）", [0, 1]]
  ];
  var BASS_CPROG_GROUPS = [["メジャー向け", ["royal", "pop4", "canon", "komuro", "fifty", "twofive", "blues12"]], ["マイナー・旋法向け", ["minor3", "andalus", "epic", "dorvamp", "mixvamp", "lydvamp", "phrvamp"]]];
  // 知らない id・"" は null（コード進行なし）
  function bassCprog(id) { for (var i = 0; i < BASS_CPROGS.length; i++) { if (BASS_CPROGS[i][0] === id) { return BASS_CPROGS[i]; } } return null; }
  // 進行 cp の拍 b のときの度数・次の小節の度数・次の小節までの拍
  function bassCprogAt(cp, b, meter) {
    var bar = Math.floor(b / meter + 1e-6), L = cp[2].length;
    return { d: cp[2][((bar % L) + L) % L], next: cp[2][(((bar + 1) % L) + L) % L], left: (bar + 1) * meter - b };
  }
  // スケール sc の d 番目の3和音 → { q: コードの名前のうしろ, deg: 度数（♭III・ii° など） }
  // sev: §268 7th のコード名
  function bassTriad(sc, d, sev) {
    function at(k) { return sc[(d + k) % 7] + Math.floor((d + k) / 7) * 12 - sc[d]; }
    var t = at(2), f = at(4), q = t === 4 ? (f === 8 ? "aug" : (f === 6 ? "(♭5)" : "")) : (f === 6 ? "dim" : "m"), dd = sc[d] - BASS_SCALE[d];
    var rm = t === 3 ? BASS_ROMAN[d].toLowerCase() : BASS_ROMAN[d], acc = dd < 0 ? "♭" : (dd > 0 ? "♯" : "");
    if (sev) {
      var s7 = at(6), q7 = q === "dim" ? (s7 === 9 ? "dim7" : "m7♭5") : (q === "m" ? (s7 === 11 ? "mM7" : "m7") : (q === "aug" ? (s7 === 11 ? "augM7" : "aug7") : (s7 === 11 ? "M7" : "7")));
      var d7 = q7 === "dim7" ? "°7" : (q7 === "m7♭5" ? "ø7" : (q7 === "mM7" ? "mM7" : (q7 === "m7" ? "m7" : (q7 === "augM7" ? "+M7" : (q7 === "aug7" ? "+7" : q7)))));
      return { q: q === "(♭5)" ? "7♭5" : q7, deg: acc + rm + d7 };
    }
    return { q: q, deg: acc + rm + (q === "dim" ? "°" : (q === "aug" ? "+" : "")) };
  }
  // パッドの音 [度数 0〜6（0 ＝ ルート・1 ＝ 2度…6 ＝ 7度）, オクターブ -1〜2, 半音 -1〜1]（§258: 変えられる。8個のときは前の8個）
  var BASS_PAD_DEFS = [[0, 0, 0], [2, 0, 0], [4, 0, 0], [6, 0, 0], [4, -1, 0], [1, 0, 0], [5, 0, 0], [0, 1, 0],
    [3, 0, 0], [5, -1, 0], [6, -1, 0], [2, 1, 0], [1, 1, 0], [3, 1, 0], [4, 1, 0], [0, 2, 0]];
  var BASS_PAD_MAX = BASS_PAD_DEFS.length, BASS_CHORD_Y = 26, BASS_CHORD_H = 34, BASS_PAD_Y = 70;
  var BASS_DEG = ["R", "2", "3", "4", "5", "6", "7"], BASS_OCT = ["↓", "", "↑", "↑↑"];
  function bassPadLabel(pd) { return (pd[2] < 0 ? "♭" : (pd[2] > 0 ? "♯" : "")) + BASS_DEG[pd[0]] + BASS_OCT[pd[1] + 1]; }
  // コード ch のパッド pd の音（R は分数コードならベースの音）
  function bassPadNote(ch, pd) { return Math.max(0, (pd[0] ? ch.r + ch.iv[pd[0]] : ch.root) + pd[1] * 12 + pd[2]); }
  // キー key（0〜11）の d 番目（0〜6）のダイアトニックコード → { name, deg: 度数, root: ルートの MIDI（E1〜D#2）, r: コードの根音, iv: 度数ごとの半音, notes: はじめのパッドの MIDI 8つ }
  // scale（省略可）: §262 スケールの id（省略はメジャー）
  function bassChord(key, d, scale, sev) {
    var sc = bassScale(scale)[2], rootPc = (key + sc[d]) % 12, root = 28 + ((rootPc - 4 + 12) % 12), iv = [], notes = [], i, tr = bassTriad(sc, d, sev);
    for (i = 0; i < 7; i++) { iv.push(sc[(d + i) % 7] + Math.floor((d + i) / 7) * 12 - sc[d]); }
    var ch = { name: BASS_CDE[rootPc] + tr.q, deg: tr.deg, root: root, r: root, iv: iv, notes: notes };
    for (i = 0; i < 8; i++) { notes.push(bassPadNote(ch, BASS_PAD_DEFS[i])); }
    return ch;
  }
  // n: パッドの数（8 ＝ 4×2・16 ＝ 4×4）
  // top（省略可）: パッドの上の端（パターンを鳴らしているあいだは BASS_PAD_Y_PAT）
  function bassPadRect(i, n, top) {
    var t = top || BASS_PAD_Y, cw = (W - 8) / 4, rh = (BASS_H - t - 6) / ((n || 8) / 4);
    return { x: 4 + (i % 4) * cw + 2, y: t + Math.floor(i / 4) * rh + 2, w: cw - 4, h: rh - 4 };
  }
  function bassPadAt(x, y, n, top) {
    for (var i = 0; i < (n || 8); i++) { var r = bassPadRect(i, n, top); if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) { return i; } }
    return -1;
  }
  function bassPadsClean(a) {
    var out = [], i;
    for (i = 0; i < BASS_PAD_MAX; i++) {
      var q = a && a[i], d = q ? Number(q[0]) : NaN, o = q ? Number(q[1]) : NaN, h = q ? Number(q[2]) : NaN;
      out.push(d >= 0 && d <= 6 && o >= -1 && o <= 2 && h >= -1 && h <= 1 && d % 1 === 0 && o % 1 === 0 && h % 1 === 0 ? [d, o, h] : BASS_PAD_DEFS[i].slice());
    }
    return out;
  }
  // §259: パターンのマスの段（パターンを鳴らしているあいだ。パッドはその下へずれる）
  var BASS_STEP_Y = 64, BASS_STEP_H = 20, BASS_PAD_Y_PAT = 90;
  var BASS_TOK_NAMES = [["R", "ルート"], ["3", "3度"], ["5", "5度"], ["6", "6度"], ["7", "7度"], ["8", "オクターブ上"], ["v", "下の5度"], ["A", "次のコードへ半音"], ["-", "のばす"]];
  var BASS_TOK_SHOW = { v: "5↓", A: "→", "-": "－" };
  // パターンの文字の意味（例「R ルート・5 5度・－ のばす」）
  function bassPatLegend(pt) {
    var out = [], i;
    for (i = 0; i < BASS_TOK_NAMES.length; i++) { var c = BASS_TOK_NAMES[i][0]; if (pt.indexOf(c) >= 0) { out.push((BASS_TOK_SHOW[c] || c) + " " + BASS_TOK_NAMES[i][1]); } }
    return out.join("・");
  }
  function bassChordRect(d) { var cw = (W - 8) / 7; return { x: 4 + d * cw + 1, y: BASS_CHORD_Y, w: cw - 2, h: BASS_CHORD_H }; }
  function bassChordAt(x, y) {
    if (y < BASS_CHORD_Y || y >= BASS_CHORD_Y + BASS_CHORD_H) { return -1; }
    var d = Math.floor((x - 4) / ((W - 8) / 7));
    return d >= 0 && d < 7 ? d : -1;
  }

  // ---------- §255: シーケンサーの曲のコード ----------
  // コード名 → { name, root, notes }（パッドの MIDI 8つ）。key: 曲のキー（コードにない 7・2・6 を音階から選ぶ）。読めなければ null
  function bassSongChord(name, key) {
    var C = window.UGChords, sp = C && C.parse ? C.parse(name) : null, i;
    if (!sp) { return null; }
    var ivs = C.intervals(sp.parts), rpc = bassPc(sp.root), pow = ivs.length === 2;
    var third = pow ? -1 : ivs[1].iv, fifth = pow ? 7 : ivs[2].iv, sev = -1;
    for (i = 3; i < ivs.length; i++) { if (ivs[i].role === "7" || ivs[i].role === "♭7" || ivs[i].role === "°7") { sev = ivs[i].iv; } }
    function pick(a, d) { for (var k = 0; k < a.length; k++) { if (BASS_SCALE.indexOf(bassPc(rpc + a[k] - key)) >= 0) { return a[k]; } } return d; }
    if (third < 0) { third = pick([4, 3], 4); }
    if (sev < 0) { sev = pick([10, 11], third === 3 ? 10 : 11); }
    var root = 28 + bassPc(rpc - 4), low = sp.bass === null || sp.bass === undefined ? root : 28 + bassPc(sp.bass - 4);
    var iv = [0, pick([2, 1], 2), third, pick([5, 6], 5), fifth, pick([9, 8], 9), sev];
    return { name: String(name), root: low, r: root, iv: iv, notes: [low, root + third, root + fifth, root + sev, root + fifth - 12, root + iv[1], root + iv[5], low + 12] };
  }
  // 伴奏の予定 → コードの並び [{ start, end, name, ch }]（拍。休み・読めないコードは前のコードをのばす。同じコードが続けば1つに）
  function bassSongChords(S, key) {
    var out = [], i;
    for (i = 0; i < S.rows.length; i++) {
      var r = S.rows[i], last = out[out.length - 1];
      if (r.type !== "chord" && r.type !== "rest") { continue; }
      var ch = r.type === "chord" ? bassSongChord(r.name, key) : null;
      if (ch && !(last && last.name === ch.name)) { out.push({ start: r.start, end: r.end, name: ch.name, ch: ch }); }
      else if (last) { last.end = r.end; }
    }
    return out;
  }
  // 拍 beat のときのコードの番号（はじめのコードより前は 0）
  function bassChordIdx(list, beat) {
    var k = 0;
    for (var i = 0; i < list.length; i++) { if (list[i].start <= beat + 1e-6) { k = i; } }
    return k;
  }

  // ---------- §257: 演奏パターン（シーケンサーの自動のベースと同じ）----------
  // [id, 名前, 1小節の文字（R 3 5 7 6 8 v A -）, 拍子]。meter の拍子のものだけ
  // §265: じぶんのパターン [id（my1〜my8）, 名前, マス, 拍子]（おかしいものははぶく）
  var BASS_TOK_CYCLE = "R35678vA-";
  function bassMyClean(a) {
    var out = [], seen = {}, i;
    for (i = 0; a && a.length && i < a.length && out.length < BASS_MYPATS_MAX; i++) {
      var q = a[i], m = q && Number(q[3]) === 3 ? 3 : 4;
      if (!q || !/^my[1-8]$/.test(q[0]) || seen[q[0]] || typeof q[2] !== "string" || !/^[R35678vA-]+$/.test(q[2]) || (m === 3 ? [6, 12] : [8, 12, 16]).indexOf(q[2].length) < 0) { continue; }
      seen[q[0]] = 1;
      out.push([q[0], typeof q[1] === "string" && q[1] ? q[1].substring(0, 20) : "じぶん " + q[0].substring(2), q[2], m]);
    }
    return out;
  }
  var bassMyCache = null;
  function bassMyPats() { if (!bassMyCache) { bassMyCache = bassMyClean(lsGet(BASS_MYPATS_KEY)); } return bassMyCache; }
  function bassMySave(list) { bassMyCache = bassMyClean(list); return lsSet(BASS_MYPATS_KEY, bassMyCache); }
  // 長さを変える（拍の位置は保つ。間に入るマスは －）
  function bassPatResize(pt, n) {
    var out = "", L = pt.length, i;
    for (i = 0; i < n; i++) { var j = i * L / n; out += j % 1 === 0 ? pt.charAt(j) : "-"; }
    return out;
  }
  // §266: ノリ [id, 名前, 値]
  var BASS_SWINGS = [[0, "なし", 0], [1, "軽く", 0.12], [2, "ハネ", 0.22], [3, "3連", 1 / 3]];
  var BASS_GATES = [["norm", "ふつう", 0.92], ["stac", "短く", 0.5], ["leg", "長く", 1]];
  var BASS_ACCS = [["none", "なし"], ["beat", "拍の頭"], ["off", "裏拍"]];
  function bassOpt(list, id) { for (var i = 0; i < list.length; i++) { if (list[i][0] === id) { return list[i]; } } return list[0]; }
  // マス ci のハネ（1マスの何倍おそくするか）。per: 1拍のマスの数
  function bassSwingOf(sw, per, ci) { return (per === 2 || per === 4) && ci % 2 === 1 ? bassOpt(BASS_SWINGS, sw)[2] : 0; }
  // マス ci の強さ
  function bassAccOf(acc, per, ci) {
    if (acc !== "beat" && acc !== "off") { return 0.8; }
    var head = ci % per === 0;
    return (acc === "beat") === head ? 0.92 : 0.6;
  }
  // §269: パネルのタブ
  // §272: 音量（%）。出口の GainNode（st: ゲームごとの入れもの、k: "b" ベース / "d" ドラム）
  // §273: ベースのサンプル（FluidR3）はドラム（ほぼいっぱいの大きさ）よりずっと小さいので、ベースは BOOST 倍・ドラムは TRIM 倍にしてそろえる
  var BASS_VOL_MAX = 150, BASS_VOL_STEP = 10, BASS_BOOST = 4, BASS_DRUM_TRIM = 0.4;
  function bassVol(v, d) { v = Number(v); return v >= 0 && v <= BASS_VOL_MAX && v % BASS_VOL_STEP === 0 ? v : d; }
  // enh（ベースだけ）: §275 スマホ向けの音（低い音の倍音をたす）
  function bassBus(st, k, vol, enh) {
    var A = window.UGMelody && window.UGMelody.audio, ac = A && A.ctx, to = A ? (A.bus || A.master) : null, b = st[k];
    if (!ac || !to || !ac.createGain) { return null; }
    if (!b || b.ac !== ac || b.to !== to) {
      b = st[k] = { ac: ac, to: to, g: ac.createGain(), e: null };
      b.g.connect(to);
      if (k === "b" && ac.createWaveShaper && ac.createBiquadFilter) {
        var lp = ac.createBiquadFilter(), ws = ac.createWaveShaper(), hp = ac.createBiquadFilter();
        lp.type = "lowpass"; lp.frequency.value = 220;
        ws.curve = bassShaperCurve();
        hp.type = "highpass"; hp.frequency.value = 180;
        b.e = ac.createGain();
        b.g.connect(lp); lp.connect(ws); ws.connect(hp); hp.connect(b.e); b.e.connect(to);
      }
    }
    b.g.gain.value = vol / 100 * (k === "d" ? BASS_DRUM_TRIM : 1);
    if (b.e) { b.e.gain.value = enh ? BASS_ENH : 0; }
    return b.g;
  }
  // ゆがませるカーブ（tanh）
  var BASS_ENH = 0.35, bassCurve = null;
  function bassShaperCurve() {
    if (bassCurve) { return bassCurve; }
    var n = 1024, c = typeof Float32Array !== "undefined" ? new Float32Array(n) : [], d = 6, top = (Math.exp(2 * d) - 1) / (Math.exp(2 * d) + 1), i;
    for (i = 0; i < n; i++) { var e = Math.exp(2 * d * (i * 2 / (n - 1) - 1)); c[i] = (e - 1) / (e + 1) / top; }
    bassCurve = c;
    return c;
  }
  // 1音の強さ lv を保ったまま bus へ（サンプルで鳴るときは BOOST 倍。合成音はもとの大きさ）
  function bassVoiceOut(bus, lv, prog) {
    var UG = window.UGMelody, g = UG.audio.ctx.createGain(), smp = false;
    try { smp = !!(UG.samples && UG.samples.enabled && UG.sampleReady && UG.sampleReady(prog)); } catch (e) {}
    g.gain.value = lv * (smp ? BASS_BOOST : 1); g.connect(bus); return g;
  }
  // §274: 録音のメトロノームのボタンの絵（メトロノームの絵文字はないので小さな SVG）
  var BASS_METRO_ICON = '<svg viewBox="0 0 20 20" width="1.2em" height="1.2em" style="vertical-align:-0.25em;" aria-label="メトロノーム">' +
    '<path d="M7 1.5h6l4.5 17h-15z" fill="#8d5524" stroke="#5b3a24" stroke-width="1"/><path d="M8.2 4h3.6l2.6 10.5H5.6z" fill="#f5e6c8"/>' +
    '<rect x="2.5" y="15.5" width="15" height="3" rx="0.8" fill="#5b3a24"/><path d="M10 14.5L14.5 3" stroke="#343a40" stroke-width="1.4" stroke-linecap="round"/>' +
    '<rect x="11.4" y="6.6" width="3" height="2.2" rx="0.5" fill="#e03131" transform="rotate(22 12.9 7.7)"/></svg>';
  var BASS_TABS = [["pat", "パターン"], ["feel", "ノリ"], ["key", "キー"], ["play", "弾き方"]];
  function bassPatterns(meter) {
    var m3 = meter === 3, U = window.UGUkulele, st = U && U.BASS_STEPS ? U.BASS_STEPS : [], my = bassMyPats(), i;
    var out = [["root", "ルート（伸ばす）", m3 ? "R-----" : "R-------", meter], ["root8", "ルート8分", m3 ? "RRRRRR" : "RRRRRRRR", meter],
      ["r5", "ルートと5度", m3 ? "R-5-R-" : "R-5-R-5-", meter], ["walk", "ウォーキング", m3 ? "R-3-A-" : "R-3-5-A-", meter]];
    for (i = 0; i < st.length; i++) { if ((st[i][3] || 4) === meter) { out.push([st[i][0], st[i][1], st[i][2], meter]); } }
    for (i = 0; i < my.length; i++) { if (my[i][3] === meter) { out.push(my[i].slice()); } }
    return out;
  }
  // §260: 一覧のジャンル（のっていないものは「分散・そのほか」。3拍子は「3拍子」）
  var BASS_PAT_GROUPS = [
    ["基本", ["root", "root8", "r5", "r5eight", "walk", "octslow", "lowroot", "ballad", "ballad3", "two", "sixteen", "sixteen5"]],
    ["ロック・ポップス", ["pop", "rock", "rock5", "punk", "eighties", "citypop", "anime", "sync", "motown", "rnr", "metal", "country", "cwalk"]],
    ["ファンク・ソウル・ダンス", ["funk", "slapfunk", "soul", "gospel", "neosoul", "rnb", "oct", "house", "techno", "edm", "dnb", "hiphop", "trap", "gallop"]],
    ["ジャズ・ブルース・シャッフル", ["walk2", "walkdown", "walkoct", "blues", "boogie", "boogie2", "shuffle", "shuf5", "shufoct", "trip"]],
    ["ラテン・ワールド", ["bossa", "bossa2", "samba", "tumbao", "reggae", "reggaeton", "habanera", "afro"]]
  ];
  // パターンの並び → [[ジャンル, [パターン…]]]（からのジャンルははぶく）
  function bassPatGroups(list) {
    var out = [], rest = [], i, j, k;
    var mine = ["じぶんのパターン", []];
    for (i = 0; i < BASS_PAT_GROUPS.length; i++) { out.push([BASS_PAT_GROUPS[i][0], []]); }
    for (k = 0; k < list.length; k++) {
      if (/^my\d$/.test(list[k][0])) { mine[1].push(list[k]); continue; }
      var gi = -1;
      for (j = 0; j < BASS_PAT_GROUPS.length && list[k][3] !== 3; j++) { if (BASS_PAT_GROUPS[j][1].indexOf(list[k][0]) >= 0) { gi = j; } }
      if (gi >= 0) { out[gi][1].push(list[k]); } else { rest.push(list[k]); }
    }
    out.push([list.length && list[0][3] === 3 ? "3拍子" : "分散・そのほか", rest]);
    out.unshift(mine);
    return out.filter(function (g) { return g[1].length > 0; });
  }
  function bassPatById(list, id) {
    for (var i = 0; i < list.length; i++) { if (list[i][0] === id) { return list[i]; } }
    for (i = 0; i < list.length; i++) { if (list[i][0] === "pop") { return list[i]; } }
    return list[0];
  }
  // 文字 → 音（ch: コード、next: 次のコード（なしは null）、left: 次のコードまでの拍）
  var BASS_TOK = { R: 0, "3": 1, "5": 2, "7": 3, v: 4, "6": 6, "8": 7 };
  function bassTokNote(c, ch, next, left) {
    if (c === "A") {
      if (next && left <= 1 + 1e-6) { var nr = next.notes[0]; return nr - 1 >= 28 ? nr - 1 : nr + 1; }
      return ch.notes[2];
    }
    return ch.notes[BASS_TOK.hasOwnProperty(c) ? BASS_TOK[c] : 0];
  }
  // §276: 次のルート nr へ半音で近づく音（m: いまの音）
  function bassApproach(m, nr) { var a = m <= nr ? nr - 1 : nr + 1; return a < 28 ? nr + 1 : a; }
  // §278: だんだん速く（4小節ごとに上げる BPM）と上限
  var BASS_RAMPS = [0, 2, 5, 10], BASS_RAMP_MAXES = [120, 140, 160, 180, 200, 240];
  // §277: 4小節ごとのフィル（1拍のマスの数 → フィルの文字。4小節ごとに順番に）
  var BASS_FILLS = { 1: ["8", "A", "5"], 2: ["85", "5A", "8A"], 3: ["R58", "85A", "358"], 4: ["R585", "875A", "R35A", "8R8A"] };
  // 拍 b のフィルの文字（フィルでなければ ""）
  function bassFillTok(per, b, meter) {
    var fs = BASS_FILLS[per], bar = Math.floor(b / meter + 1e-6), pos = b - bar * meter;
    if (!fs || bar % 4 !== 3 || pos < meter - 1 - 1e-6) { return ""; }
    return fs[Math.floor(bar / 4) % fs.length].charAt(Math.round((pos - (meter - 1)) * per)) || "";
  }
  // 文字 i の長さ（うしろの休みのぶん。小節の終わりまで）→ マスの数
  function bassTokLen(pt, i) { var n = 1; while (i + n < pt.length && pt.charAt(i + n) === "-") { n++; } return n; }

  // ---------- 設定・テイク ----------
  function bassProgOk(p) { for (var i = 0; i < BASS_VOICES.length; i++) { if (BASS_VOICES[i][0] === p) { return true; } } return false; }
  function bassPrefs() {
    var p = lsGet(BASS_PREFS_KEY) || {}, pos = Math.round(Number(p.pos)), key = Math.round(Number(p.key));
    return {
      view: p.view === "pad" ? "pad" : "fret",
      prog: bassProgOk(Number(p.prog)) ? Number(p.prog) : 33,
      names: p.names === "cde" || p.names === "none" ? p.names : "do",
      pos: pos >= 0 && pos <= BASS_POS_MAX ? pos : 0,
      key: key >= 0 && key <= 11 ? key : 0, scale: bassScale(p.scale)[0], cprog: bassCprog(p.cprog) ? p.cprog : "", quant: p.quant === "now" ? "now" : "bar",
      drum: typeof p.drum === "string" && /^[gdp]:[A-Za-z0-9_-]{1,32}$/.test(p.drum) ? p.drum : "",
      swing: bassOpt(BASS_SWINGS, Number(p.swing))[0], sev: !!p.sev, tab: bassOpt(BASS_TABS, p.tab)[0],
      land: !!p.land, pick: !!p.pick, bvol: p.volv === 2 ? bassVol(p.bvol, 100) : 100, dvol: p.volv === 2 ? bassVol(p.dvol, 50) : 50, volv: 2, phone: !!p.phone, appr: !!p.appr, fill: !!p.fill, ramp: BASS_RAMPS.indexOf(Number(p.ramp)) >= 0 ? Number(p.ramp) : 0, rampMax: BASS_RAMP_MAXES.indexOf(Number(p.rampMax)) >= 0 ? Number(p.rampMax) : 160, rlevel: bassOpt(BASS_RLEVELS, p.rlevel)[0], rspeed: [70, 85, 100].indexOf(Number(p.rspeed)) >= 0 ? Number(p.rspeed) : 100, gate: bassOpt(BASS_GATES, p.gate)[0], acc: bassOpt(BASS_ACCS, p.acc)[0],
      bpm: Math.max(40, Math.min(240, Math.round(Number(p.bpm) || 100))),
      metro: p.metro !== false, pat: typeof p.pat === "string" && /^[a-z0-9]{1,12}$/.test(p.pat) ? p.pat : "pop", tech: p.tech === "slap" || p.tech === "mute" ? p.tech : "normal",
      backing: typeof p.backing === "string" && /^(cur|s:\d+)$/.test(p.backing) ? p.backing : "", backBass: !!p.backBass,
      pads: bassPadsClean(p.pads), padN: p.padN === 16 ? 16 : 8
    };
  }
  function bassSavePrefs(p) { return lsSet(BASS_PREFS_KEY, p); }
  function bassNum(v, lo, hi) { var n = Number(v); return isFinite(n) && n >= lo && n <= hi ? n : null; }
  // シーケンサーの打ち込み（§178）と同じ形に整える: [拍, 長さ, MIDI]（強さが 0.8 以外なら4つ目）
  function bassNotesClean(a) {
    var out = [], i;
    a = a && a.length ? a : [];
    for (i = 0; i < a.length && out.length < BASS_NOTES_MAX; i++) {
      var b = a[i] && bassNum(a[i][0], 0, 4096), d = a[i] && bassNum(a[i][1], 0.0625, 32), m = a[i] && bassNum(a[i][2], 0, 127), v = a[i] && bassNum(a[i][3], 0.1, 1);
      if (b !== null && d !== null && m !== null) { out.push(v !== null && v !== 0.8 ? [b, d, Math.round(m), v] : [b, d, Math.round(m)]); }
    }
    out.sort(function (x, y) { return x[0] - y[0]; });
    return out;
  }
  function bassTakeClean(t, i) {
    return {
      id: Math.max(1, Math.round(Number(t.id)) || i + 1), name: String(t.name || "テイク").slice(0, 20),
      bpm: Math.max(40, Math.min(240, Math.round(Number(t.bpm) || 100))), meter: t.meter === 3 ? 3 : 4,
      prog: bassProgOk(Number(t.prog)) ? Number(t.prog) : 33, notes: bassNotesClean(t.notes)
    };
  }
  function bassTakesLoad() {
    var a = lsGet(BASS_TAKES_KEY), out = [], i;
    if (!a || !a.length) { return out; }
    for (i = 0; i < a.length && out.length < BASS_TAKES_MAX; i++) { if (a[i] && typeof a[i] === "object") { out.push(bassTakeClean(a[i], i)); } }
    return out;
  }
  function bassTakesSave(list) { return lsSet(BASS_TAKES_KEY, list.slice(0, BASS_TAKES_MAX)); }
  // 新しいテイクを先頭に足す（10個をこえたら古いものを消す）。足したテイクを返す
  function bassTakeAdd(list, t) {
    var id = 0, i;
    for (i = 0; i < list.length; i++) { id = Math.max(id, list[i].id); }
    var take = bassTakeClean({ id: id + 1, name: t.name || "ベース " + (id + 1), bpm: t.bpm, meter: t.meter, prog: t.prog, notes: t.notes }, 0);
    list.unshift(take);
    if (list.length > BASS_TAKES_MAX) { list.length = BASS_TAKES_MAX; }
    return take;
  }
  function bassTakeById(list, id) { for (var i = 0; i < list.length; i++) { if (list[i].id === id) { return list[i]; } } return null; }
  function bassToSeqNotes(take) { return bassNotesClean(take && take.notes); }

  // ---------- ゴリラウクレレのシーケンサーへ送る ----------
  function bassSeqApi() { var U = window.UGUkulele; return U && U.seqLoad && U.xAdd ? U : null; }
  // テイクを、編集中の曲へ「🎸 ベース打ち込み」トラックとして送る。自動のベースが鳴っていればミュート → { ok, id, muted, msg }
  function bassSendToSeq(take) {
    var U = bassSeqApi();
    if (!U) { return { ok: false, msg: "ゴリラウクレレが読みこめませんでした" }; }
    if (!take || !take.notes || !take.notes.length) { return { ok: false, msg: "音のないテイクは送れません" }; }
    var st = U.seqLoad(), id = U.xAdd(st.cur.tracks, "bnotes");
    if (!id) { return { ok: false, msg: "追加トラックがいっぱいです（8本まで）。シーケンサーで1本消してから送ってね" }; }
    var t = st.cur.tracks[id], b = st.cur.tracks.bass, muted = false;
    t.name = String(take.name).slice(0, 12);
    t.prog = take.prog;
    t.notes = bassToSeqNotes(take);
    if (b && b.on && !b.mute) { b.mute = true; muted = true; }
    U.seqSave(st);
    return { ok: true, id: id, muted: muted, msg: "「" + take.name + "」を、ゴリラウクレレのシーケンサー（編集中の曲）に 🎸 ベース打ち込みトラックとして送りました" +
      (muted ? "。自動のベースは重ならないようにミュートしました（シーケンサーのミキサーでもどせます）" : "") };
  }

  // ---------- §255: 伴奏（ゴリラドラムの §227 と同じ） ----------
  function bassBackApi() { var U = window.UGUkulele; return U && U.seqLoad && U.seqSchedule && U.expand ? U : null; }
  // 伴奏にえらべる曲 [[id, 名前]]（"cur" ＝ 編集中の曲、"s:番号" ＝ 保存した曲）
  function bassBackList() {
    var U = bassBackApi(), out = [], st, i;
    if (!U) { return out; }
    st = U.seqLoad();
    out.push(["cur", "編集中の曲"]);
    for (i = 0; i < st.songs.length; i++) { out.push(["s:" + st.songs[i].id, st.songs[i].name]); }
    return out;
  }
  // 伴奏の曲（構成どおり・練習テンポ・くりかえしなし）→ { name, seq, s: 予定, lowG, key, chords }
  function bassBacking(id) {
    var U = bassBackApi(), st, sq = null, name = "", lowG = false, key = 0, i;
    if (!U || !id) { return null; }
    st = U.seqLoad();
    if (id === "cur") { sq = st.cur; name = "編集中の曲"; }
    for (i = 0; i < st.songs.length; i++) { if ("s:" + st.songs[i].id === id) { sq = st.songs[i].seq; name = st.songs[i].name; } }
    if (!sq || !sq.rows || !sq.rows.length) { return null; }
    sq = U.expand(U.seqClean(sq));
    sq.loop = false;
    if (U.seqAtRate) { sq = U.seqAtRate(sq, sq.rate); }
    try { lowG = !!U.prefs().lowG; } catch (e) {}
    var sc = U.seqSchedule(sq, lowG);
    if (!sc || !sc.events || !sc.events.length) { return null; }
    try { key = U.estimateKey ? U.estimateKey(sc.rows) : 0; } catch (e2) {}
    return { name: name, seq: sq, s: sc, lowG: lowG, key: key, chords: bassSongChords(sc, key) };
  }
  // 伴奏のイベントを鳴らすか（クリックは曲のメトロノームかカウントインのとき。noBass: 曲のベースを鳴らさない）
  function bassBackEventOn(ev, seq, lead, noBass) {
    if (ev.kind === "click") { return !!seq.metronome || ev.t < lead; }
    var xt = seq && seq.tracks && ev.track ? seq.tracks[ev.track] : null;
    return !(noBass && (ev.track === "bass" || (xt && xt.prog >= 32 && xt.prog <= 39)));
  }

  // §257: パターンを、シーケンサーの編集中の曲の自動のベースにする（いまの音色で ON・ミュートをとく）→ { ok, msg }
  function bassPatToSeq(def, prog) {
    var U = bassSeqApi();
    if (!U) { return { ok: false, msg: "ゴリラウクレレが読みこめませんでした" }; }
    var st = U.seqLoad(), b = st.cur.tracks.bass;
    b.on = true;
    b.mute = false;
    if (/^my\d$/.test(def[0])) { return { ok: false, msg: "じぶんのパターンはシーケンサーの自動のベースには送れません。録音して「🎸 送る」で送れます" }; }
    b.pattern = def[0];
    if (bassProgOk(prog)) { b.prog = prog; }
    U.seqSave(st);
    return { ok: true, msg: "シーケンサー（編集中の曲）の自動のベースを「" + def[1] + "」にしました" };
  }

  // ---------- はじめの画面 ----------
  function bassSetup(root, ctl) {
    var p = bassPrefs(), note = "";
    function draw() {
      var takes = bassTakesLoad(), i;
      var html = '<div class="melody-setup"><h3 style="margin:0 0 4px;">&#x1F3B8; ゴリラベース</h3>' +
        '<p class="small" style="color:#adb5bd;margin:0 0 8px;">4本の弦のフレットか、コードに合う音のパッドで弾こう。録ったベースはシーケンサーへ送れます。</p>';
      html += '<p class="small" style="margin:4px 0 2px;">弾き方</p><div class="quiz-opts">';
      for (i = 0; i < BASS_VIEWS.length; i++) {
        html += '<button class="modal-btn quiz-opt' + (p.view === BASS_VIEWS[i][0] ? " active" : "") + '" data-view="' + BASS_VIEWS[i][0] + '">' + BASS_VIEWS[i][1] + '</button>';
      }
      html += '</div><p class="small" style="margin:4px 0 2px;">音色</p><div class="piano-opts">';
      for (i = 0; i < BASS_VOICES.length; i++) {
        html += '<button class="modal-btn quiz-opt' + (p.prog === BASS_VOICES[i][0] ? " active" : "") + '" data-prog="' + BASS_VOICES[i][0] + '">' + BASS_VOICES[i][1] + '</button>';
      }
      html += '</div><p class="small" style="margin:4px 0 2px;">音名</p><div class="quiz-opts">';
      for (i = 0; i < BASS_NAMES.length; i++) {
        html += '<button class="modal-btn quiz-opt' + (p.names === BASS_NAMES[i][0] ? " active" : "") + '" data-names="' + BASS_NAMES[i][0] + '">' + BASS_NAMES[i][1] + '</button>';
      }
      html += '</div>';
      var bl = bassBackList();
      if (bl.length) {
        html += '<p class="small" style="margin:6px 0 2px;">&#x1F3B8; 伴奏（ゴリラウクレレのシーケンサーの曲）</p><div class="piano-opts">' +
          '<button class="modal-btn quiz-opt' + (!p.backing ? " active" : "") + '" data-backing="-">なし</button>';
        for (i = 0; i < bl.length; i++) { html += '<button class="modal-btn quiz-opt' + (p.backing === bl[i][0] ? " active" : "") + '" data-backing="' + bl[i][0] + '">' + escHtml(bl[i][1]) + '</button>'; }
        html += '</div>';
        if (p.backing) { html += '<div class="quiz-opts"><button class="modal-btn quiz-opt' + (p.backBass ? " active" : "") + '" data-backbass="1">伴奏のベースも鳴らす ' + (p.backBass ? "ON" : "OFF") + '</button></div>'; }
      }
      html += '<button class="modal-btn" data-go="1" style="width:100%;margin-top:8px;">&#x1F3B8; はじめる</button>';
      // §270: リズムゲーム
      var best = bassBest();
      html += '<p class="small" style="margin:12px 0 2px;">&#x1F3AE; リズムゲーム（落ちてくる音符を弦のレーンでタップ）</p><div class="quiz-opts">';
      for (i = 0; i < BASS_RLEVELS.length; i++) { html += '<button class="modal-btn quiz-opt' + (p.rlevel === BASS_RLEVELS[i][0] ? " active" : "") + '" data-rlevel="' + BASS_RLEVELS[i][0] + '">' + BASS_RLEVELS[i][1] + '</button>'; }
      html += '</div><div class="quiz-opts">';
      for (i = 0; i < BASS_SPEEDS.length; i++) { html += '<button class="modal-btn quiz-opt' + (p.rspeed === BASS_SPEEDS[i] ? " active" : "") + '" data-rspeed="' + BASS_SPEEDS[i] + '">' + BASS_SPEEDS[i] + '%</button>'; }
      html += '</div>';
      for (i = 0; i < BASS_SONGS.length; i++) {
        var bs0 = best[BASS_SONGS[i][0] + "@" + p.rlevel + "@" + p.rspeed];
        html += '<button class="modal-btn quiz-cat-btn" data-song="' + BASS_SONGS[i][0] + '" style="width:100%;">' + escHtml(BASS_SONGS[i][1]) + '（BPM ' + BASS_SONGS[i][6] + '）' +
          ' <span class="small" style="color:#6b4f00;">' + new Array(BASS_SONGS[i][9] + 1).join("&#x2B50;") + (bs0 ? "・ベスト " + bs0.s + "（" + bs0.r + "）" : "") + '</span></button>';
      }
      // §281: クイズ
      html += '<p class="small" style="margin:12px 0 2px;">&#x1F9E0; クイズ（10問）</p><div class="quiz-opts">';
      for (i = 0; i < BASS_QUIZ_KINDS.length; i++) {
        var bq = best["quiz@" + BASS_QUIZ_KINDS[i][0]];
        html += '<button class="modal-btn quiz-opt" data-quiz="' + BASS_QUIZ_KINDS[i][0] + '">' + BASS_QUIZ_KINDS[i][1] + (bq ? '<br><span class="small">ベスト ' + bq.s + '（' + bq.c + '問）</span>' : "") + '</button>';
      }
      html += '</div>';
      html += '<p class="small" style="margin:10px 0 2px;">&#x1F399;&#xFE0F; 録音したテイク（' + takes.length + ' / ' + BASS_TAKES_MAX + '）</p>';
      if (note) { html += '<p class="small" style="color:#ffd166;margin:0 0 4px;">' + note + '</p>'; }
      if (!takes.length) { html += '<p class="small" style="color:#adb5bd;margin:0;">まだありません。弾く画面の「🔴 録音」で録れます。</p>'; }
      for (i = 0; i < takes.length; i++) {
        html += '<div class="piano-take"><span>' + escHtml(takes[i].name) + '<br><span class="small" style="color:#adb5bd;">' + takes[i].notes.length + '音・BPM ' + takes[i].bpm + '</span></span>' +
          '<button class="modal-btn" data-open="' + takes[i].id + '">&#x25B6;&#xFE0F; ひらく</button>' +
          '<button class="modal-btn" data-send="' + takes[i].id + '" title="シーケンサーへ送る">&#x1F3B8; 送る</button>' +
          '<button class="modal-btn" data-del="' + takes[i].id + '">&#x1F5D1;&#xFE0F;</button></div>';
      }
      html += '<button class="modal-btn" data-back="1" style="width:100%;margin-top:14px;">&#x1F579;&#xFE0F; メニューへ</button></div>';
      root.innerHTML = html;
      var btns = root.querySelectorAll("button"), j;
      for (j = 0; j < btns.length; j++) {
        btns[j].onclick = function (ev) {
          var el = ev.currentTarget, v;
          if ((v = el.getAttribute("data-view"))) { p.view = v; bassSavePrefs(p); draw(); return; }
          if ((v = el.getAttribute("data-prog")) !== null) { p.prog = Number(v); bassSavePrefs(p); draw(); return; }
          if ((v = el.getAttribute("data-names"))) { p.names = v; bassSavePrefs(p); draw(); return; }
          if ((v = el.getAttribute("data-backing"))) { p.backing = v === "-" ? "" : v; bassSavePrefs(p); draw(); return; }
          if ((v = el.getAttribute("data-rlevel"))) { p.rlevel = v; bassSavePrefs(p); draw(); return; }
          if ((v = el.getAttribute("data-rspeed"))) { p.rspeed = Number(v); bassSavePrefs(p); draw(); return; }
          if ((v = el.getAttribute("data-quiz"))) { ctl.done({ mode: "quiz", kind: v }); return; }
          if ((v = el.getAttribute("data-song"))) { ctl.done({ mode: "rhythm", song: v, level: p.rlevel, speed: p.rspeed }); return; }
          if (el.getAttribute("data-backbass")) { p.backBass = !p.backBass; bassSavePrefs(p); draw(); return; }
          if ((v = el.getAttribute("data-send"))) {
            var rs = bassSendToSeq(bassTakeById(bassTakesLoad(), Number(v)));
            note = (rs.ok ? "&#x2705; " : "&#x26A0;&#xFE0F; ") + escHtml(rs.msg);
            draw();
            return;
          }
          if ((v = el.getAttribute("data-del"))) {
            var list = bassTakesLoad(), t = bassTakeById(list, Number(v));
            if (!t || (window.confirm && !window.confirm("「" + t.name + "」を消しますか？"))) { return; }
            list.splice(list.indexOf(t), 1);
            bassTakesSave(list);
            draw();
            return;
          }
          if (el.getAttribute("data-back")) { ctl.back(); return; }
          if (el.getAttribute("data-go")) { ctl.done({ backing: p.backing }); return; }
          if ((v = el.getAttribute("data-open"))) { ctl.done({ take: Number(v), backing: p.backing }); }
        };
      }
    }
    draw();
  }

  // ---------- §271: 画面の形（たて／よこ）で変わる大きさ ----------
  var BASS_LAND = false;
  function bassSetLayout(land, h) {
    BASS_LAND = !!land;
    BASS_PICK = false; BASS_MIRROR = false;
    BASS_BOARD_X = land ? 11 : 4; // §272: よこ向きは弦の名前を板の外に
    BASS_BOARD_R = W - 4;
    if (land) { BASS_H = h; BASS_COLS = 12; BASS_BOARD_Y = 38; BASS_CHORD_Y = 12; BASS_CHORD_H = 13; BASS_STEP_Y = 27; BASS_STEP_H = 8; BASS_PAD_Y = 27; BASS_PAD_Y_PAT = 37; }
    else { BASS_H = 300; BASS_COLS = 8; BASS_BOARD_Y = 128; BASS_PICK_X = W - 4 - Math.round(W * 0.24); BASS_PICK_R = W - 4; BASS_CHORD_Y = 26; BASS_CHORD_H = 34; BASS_STEP_Y = 64; BASS_STEP_H = 20; BASS_PAD_Y = 70; BASS_PAD_Y_PAT = 90; }
    BASS_BOARD_BOT = BASS_H - 6;
  }
  // よこ向きの高さ（ゴリラドラムと同じ）
  function bassLandH(boxW, boxH) {
    if (!(boxW > 0 && boxH > 0)) { return 130; }
    return Math.max(90, Math.min(170, Math.round(W * (boxH - 8 - 84) / (boxW - 8))));
  }

  // ---------- §270: リズムゲーム ----------
  var BASS_BEST_KEY = "ultimateGorillaBassBestV1", BASS_LOOK = 1.6, BASS_SPEEDS = [70, 85, 100];
  var BASS_JUDGE = [[0.07, "PERFECT", 100], [0.13, "GREAT", 70], [0.2, "GOOD", 40]];
  var BASS_RLEVELS = [["easy", "かんたん"], ["normal", "ふつう"], ["hard", "むずかしい"]];
  var BASS_LANES = [[28, "E"], [33, "A"], [38, "D"], [43, "G"]];
  // [id, 名前, パターン, コード進行, キー, スケール, BPM, 小節, ゴリラドラムのリズム, ★]
  var BASS_SONGS = [
    ["royal", "王道ポップ", "pop", "royal", 0, "major", 96, 8, "g:8beat", 1], ["rock", "ロック", "rock", "pop4", 4, "major", 120, 8, "g:rock", 1],
    ["motown", "モータウン", "motown", "fifty", 7, "major", 104, 8, "d:motown", 2], ["bossa", "ボサノバ", "bossa", "twofive", 5, "major", 100, 8, "g:bossa", 2],
    ["reggae", "レゲエ", "reggae", "minor3", 9, "minor", 84, 8, "g:onedrop", 2], ["blues", "ブルース", "shuffle", "blues12", 9, "major", 96, 12, "g:shuffle", 2],
    ["funk", "ファンク", "funk", "dorvamp", 2, "dorian", 96, 8, "g:funk", 3], ["jazz", "ジャズ（ウォーキング）", "walk2", "twofive", 10, "major", 112, 8, "g:jazz", 2],
    ["waltz", "ワルツ（3拍子）", "waltz2", "canon", 0, "major", 108, 8, "g:waltz", 1], ["epic", "エピック（ギャロップ）", "gallop", "epic", 4, "minor", 104, 8, "d:metal", 3],
    ["disco", "ディスコ（オクターブ）", "oct", "minor3", 9, "minor", 116, 8, "g:disco", 2], ["beat16", "16ビート", "sixteen", "komuro", 0, "major", 92, 8, "g:beat16", 3] // §280
  ];
  function bassSong(id) { for (var i = 0; i < BASS_SONGS.length; i++) { if (BASS_SONGS[i][0] === id) { return BASS_SONGS[i]; } } return BASS_SONGS[0]; }
  function bassBest() { var o = lsGet(BASS_BEST_KEY); return o && typeof o === "object" ? o : {}; }
  // 音 → レーン（いちばん低いフレットで弾ける弦）
  function bassLaneOf(m) { for (var i = BASS_LANES.length - 1; i > 0; i--) { if (m >= BASS_LANES[i][0]) { return i; } } return 0; }
  function bassRJudge(dt) { dt = Math.abs(dt); for (var i = 0; i < BASS_JUDGE.length; i++) { if (dt <= BASS_JUDGE[i][0]) { return i; } } return -1; }
  function bassRank(acc) { return acc >= 0.95 ? "S" : (acc >= 0.85 ? "A" : (acc >= 0.7 ? "B" : (acc >= 0.5 ? "C" : "D"))); }
  // 曲の譜面 → { meter, notes: [{ beat, len, m, lane, f: フレット, ghost }] }（かんたん は拍の頭だけ・§280 むずかしい はフィル・つなぎの音・ゴースト音つき）
  function bassChart(song, level) {
    var pd = bassPatById(bassPatterns(4), song[2]), out = [], last = "", b, ci;
    if (pd[0] !== song[2]) { pd = bassPatById(bassPatterns(3), song[2]); }
    var meter = pd[3], pt = pd[2], L = pt.length, unit = meter / L, cp = bassCprog(song[3]);
    for (b = 0; b < song[7]; b++) {
      var ca = bassCprogAt(cp, b * meter, meter), ch = bassChord(song[4], ca.d, song[5]), nx = b + 1 < song[7] ? bassChord(song[4], ca.next, song[5]) : null;
      for (ci = 0; ci < L; ci++) {
        var c = pt.charAt(ci), beat = b * meter + ci * unit, fl = level === "hard" ? bassFillTok(L / meter, beat, meter) : "", left = (b + 1) * meter - beat;
        if (c === "-" && ci === 0 && ch.name !== last) { c = "R"; }
        if (fl) { c = fl; }
        if (c === "-") { continue; }
        last = ch.name;
        if (level === "easy" && Math.abs(beat - Math.round(beat)) > 1e-6) { continue; }
        var m = bassTokNote(c, ch, nx, left), len = (fl ? 1 : bassTokLen(pt, ci)) * unit;
        if (level === "hard" && nx && c !== "A" && left <= 1 + 1e-6 && len >= left - 1e-6 && bassPc(nx.root) !== bassPc(ch.root)) { m = bassApproach(m, nx.notes[0]); }
        if (m < BASS_LANES[0][0]) { m += 12; }
        var lane = bassLaneOf(m);
        out.push({ beat: beat, len: len, m: m, lane: lane, f: m - BASS_LANES[lane][0] });
      }
    }
    // §280: ゴースト音（奇数の拍の 16分の4つめ。その拍の後半に音がなければ、直前の音と同じ弦で）
    if (level === "hard") {
      var total = song[7] * meter, k, j;
      for (k = 1; k < total; k += 2) {
        var gb = k + 0.75, prev = null, busy = false;
        for (j = 0; j < out.length; j++) {
          if (out[j].beat >= k + 0.5 - 1e-6 && out[j].beat < k + 1 - 1e-6) { busy = true; }
          if (out[j].beat < gb - 1e-6 && !out[j].ghost) { prev = out[j]; }
        }
        if (busy || !prev) { continue; }
        out.push({ beat: gb, len: 0.25, m: prev.m, lane: prev.lane, f: prev.f, ghost: true });
      }
      out.sort(function (a, b2) { return a.beat - b2.beat; });
    }
    return { meter: meter, notes: out };
  }
  // §279: タイミングのくせ（offs: ずれの秒。＋はおそい）→ { ms: 平均, sd: ばらつき, text }（なければ null）
  function bassTendency(offs) {
    if (!offs || !offs.length) { return null; }
    var s = 0, v = 0, i;
    for (i = 0; i < offs.length; i++) { s += offs[i]; }
    var av = s / offs.length;
    for (i = 0; i < offs.length; i++) { v += (offs[i] - av) * (offs[i] - av); }
    var ms = Math.round(av * 1000), sd = Math.round(Math.sqrt(v / offs.length) * 1000);
    return { ms: ms, sd: sd, text: "&#x1F3AF; タイミング: 平均 " + (ms > 0 ? "+" : (ms < 0 ? "−" : "")) + Math.abs(ms) + "ms（" + (Math.abs(ms) < 15 ? "ちょうどいい" : (ms < 0 ? "早め" : "おそめ")) + "）・ばらつき ±" + sd + "ms" +
      (Math.abs(ms) >= 40 ? "。いつも同じくらいずれるなら、設定のタイミング補正で直せます" : "") };
  }
  var BASS_RKEYS = { p0: 0, p1: 1, p2: 2, p3: 3, p6: 0, p7: 1, p13: 2, p14: 3 };
  function bassRhythm(api, cfg) {
    var prefs = bassPrefs(), prog = prefs.prog, panel = api.panel, frame = 0, ended = false, msg = "";
    bassSetLayout(false);
    if (panel && panel.classList) { panel.classList.add("quiz-panel"); }
    if (api.setCanvasHeight) { api.setCanvasHeight(BASS_H); }
    var song = bassSong(cfg.song), level = bassOpt(BASS_RLEVELS, cfg.level)[0], rate = (BASS_SPEEDS.indexOf(Number(cfg.speed)) >= 0 ? Number(cfg.speed) : 100) / 100;
    var chart = bassChart(song, level), meter = chart.meter, spb = 60 / song[6] / rate, t0 = 0.5 + meter * spb;
    var rn = [], counts = [0, 0, 0, 0], combo = 0, maxCombo = 0, judgeText = "", judgeFrames = 0, lastClick = -99, laneFlash = [0, 0, 0, 0], offs = [], i;
    for (i = 0; i < chart.notes.length; i++) { var cn = chart.notes[i]; rn.push({ t: t0 + cn.beat * spb, len: cn.len * spb, m: cn.m, lane: cn.lane, f: cn.f, j: -2, ghost: !!cn.ghost }); }
    var endT = t0 + Math.ceil((chart.notes.length ? chart.notes[chart.notes.length - 1].beat + 0.01 : 0) / meter) * meter * spb;
    function now() { return frame / 60; }
    var UG = window.UGMelody, audioOk = false, LAT = UG && UG.latency ? UG.latency() / 1000 : 0;
    function audio() {
      if (audioOk || !UG || !UG.audioInit) { return; }
      try {
        if (UG.audioInit()) {
          audioOk = true;
          UG.loadSamples([prog]);
          var D = window.UGDrum, dp = D && D.prefs ? D.prefs() : null;
          if (dp) { if (UG.setDrumSamples) { UG.setDrumSamples(dp.real); } if (UG.setDrumKit) { UG.setDrumKit(dp.kitId); } if (dp.real) { UG.loadSamples([UG.DRUM]); } }
        }
      } catch (e) {}
    }
    function play(n) {
      audio();
      if (!audioOk) { return; }
      var bus = bassBus(buses, "b", prefs.bvol, prefs.phone), lv = n.ghost ? 0.45 : 0.85;
      try {
        var h = UG.synth(n.m, prog, 0, lv, bus ? bassVoiceOut(bus, lv, prog) : undefined, n.ghost ? 0 : BASS_HOLD);
        if (h && UG.voiceStop) { UG.voiceStop(h, h.ac.currentTime + (n.ghost ? 0.05 : Math.max(0.12, n.len * 0.92)), n.ghost ? 0.02 : 0.05); }
        if (n.ghost && UG.bassHit) { UG.bassHit("ghost", 0, 0.6, bus || undefined); } // §280: ゴースト音
      } catch (e) {}
    }
    // ゴリラドラムのリズム（曲のあいだ）とカウント
    var dsteps = null, dlen = 16, dk = 0, buses = {};
    try { var D0 = window.UGDrum; dsteps = D0 && D0.patternSteps ? D0.patternSteps(song[8]) : null; dlen = D0 && D0.patLen ? D0.patLen(song[8]) : 16; } catch (e0) {}
    function drumStep() {
      var ac = audioOk && UG.audio ? UG.audio.ctx : null, du = meter / dlen, D = window.UGDrum, n = 0, k;
      if (!ac || !dsteps) { return; }
      while (n++ < 16) {
        var tt = t0 + dk * du * spb, dt = tt - now();
        if (dt > 0.1 || tt >= endT - 1e-6) { break; }
        var s = dk % dlen;
        dk++;
        if (dt < -0.05) { continue; }
        for (k = 0; k < dsteps.length; k++) {
          if (dsteps[k][1].indexOf(s) < 0) { continue; }
          var lv = 0.8;
          try { lv = D.patVel ? D.patVel(dsteps[k][0], s % 16, false) : 0.8; } catch (e) {}
          try { UG.synth(dsteps[k][0], UG.DRUM, ac.currentTime + dt, lv * 0.7, bassBus(buses, "d", prefs.dvol) || undefined); } catch (e2) {}
        }
      }
    }
    function hit(lane) {
      if (ended || !(lane >= 0 && lane < 4)) { return; }
      laneFlash[lane] = 8;
      var t = now() - LAT, best = null, k;
      for (k = 0; k < rn.length; k++) {
        var n = rn[k];
        if (n.t - t > BASS_JUDGE[2][0]) { break; }
        if (n.j !== -2 || n.lane !== lane || Math.abs(t - n.t) > BASS_JUDGE[2][0]) { continue; }
        if (!best || Math.abs(t - n.t) < Math.abs(t - best.t)) { best = n; }
      }
      if (!best) { return; }
      var g = bassRJudge(t - best.t);
      best.j = g; counts[g]++; combo++; maxCombo = Math.max(maxCombo, combo); offs.push(t - best.t);
      play(best);
      api.addScore(BASS_JUDGE[g][2] + Math.min(50, combo) * 2);
      judgeText = BASS_JUDGE[g][1]; judgeFrames = 30;
    }
    function finish() {
      if (ended) { return; }
      ended = true;
      var acc = rn.length ? (counts[0] + counts[1] * 0.7 + counts[2] * 0.4) / rn.length : 0, rk = bassRank(acc), best = bassBest();
      if (rn.length && counts[3] === 0) { api.addScore(500); }
      var key = song[0] + "@" + level + "@" + Math.round(rate * 100), sc = api.getScore();
      if (!best[key] || !(best[key].s >= sc)) { best[key] = { s: sc, r: rk }; lsSet(BASS_BEST_KEY, best); }
      msg = "ランク <b>" + rk + "</b>（正確さ " + Math.round(acc * 100) + "%）・最大コンボ " + maxCombo + (counts[3] === 0 ? "・&#x1F525; フルコンボ +500" : "") +
        "<br>PERFECT " + counts[0] + " / GREAT " + counts[1] + " / GOOD " + counts[2] + " / MISS " + counts[3];
      var td = bassTendency(offs);
      if (td) { msg += "<br>" + td.text; }
      render();
      api.gameOver("ランク " + rk);
    }
    function render() {
      if (!panel) { return; }
      panel.innerHTML = '<p class="small" style="margin:4px 0 0;">&#x1F3AE; ' + escHtml(song[1]) + '（' + bassOpt(BASS_RLEVELS, level)[1] + '・BPM ' + Math.round(song[6] * rate) + '・' + rn.length + '音）</p>' +
        '<p class="small" style="margin:4px 0 0;">音符が線に来たら、その弦のレーンをタップ（キー D F J K）。音符の数字は押さえるフレット（0 は開放弦）' + (level === "hard" ? "。灰色の ✕ はミュートの音（同じ弦をタップ）" : "") + '</p>' +
        (msg ? '<p class="small" style="margin:4px 0 0;color:#ffd166;">' + msg + '</p>' : "");
    }
    render();
    function text(ctx, s, x, y, size, color) { ctx.fillStyle = color; ctx.font = "bold " + size + "px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(s, x, y); }
    var TOP = 26, HIT = BASS_H - 46, LW = (W - 8) / 4;
    function laneAt(x, y) { if (y < TOP) { return -1; } var l = Math.floor((x - 4) / LW); return l >= 0 && l < 4 ? l : -1; }
    return {
      input: function (a, down) { if (down && BASS_RKEYS.hasOwnProperty(a)) { hit(BASS_RKEYS[a]); } },
      pointer: function (type, x, y) { if (type === "down") { audio(); hit(laneAt(x, y)); } },
      step: function () {
        frame++;
        if (judgeFrames > 0) { judgeFrames--; }
        for (var k = 0; k < 4; k++) { if (laneFlash[k] > 0) { laneFlash[k]--; } }
        if (ended) { return; }
        var t = now() - LAT, left = 0;
        for (k = 0; k < rn.length; k++) {
          if (rn[k].j === -2 && t - rn[k].t > BASS_JUDGE[2][0]) { rn[k].j = -1; counts[3]++; combo = 0; judgeText = "MISS"; judgeFrames = 30; }
          if (rn[k].j === -2) { left++; }
        }
        // 1小節のカウント
        var sb = Math.floor((now() - t0) / spb);
        if (sb < 0 && sb >= -meter && sb !== lastClick) {
          lastClick = sb; audio();
          if (audioOk) { try { UG.synth(sb === -meter ? 37 : 42, UG.DRUM, 0, sb === -meter ? 0.9 : 0.6); } catch (e) {} }
        }
        if (audioOk) { drumStep(); }
        if (!left && t > Math.max(endT, rn.length ? rn[rn.length - 1].t + 1 : 0)) { finish(); }
      },
      draw: function (ctx) {
        ctx.fillStyle = "#1b1f3b";
        ctx.fillRect(0, 0, W, BASS_H);
        hudText(ctx, "🎮 " + song[1], 8, 10, "left");
        hudText(ctx, "コンボ " + combo, W - 8, 10, "right");
        var t = now() - LAT, k;
        for (k = 0; k < 4; k++) {
          var x = 4 + k * LW;
          ctx.fillStyle = laneFlash[k] > 0 ? "rgba(255,209,102,0.25)" : (k % 2 ? "#232a4d" : "#1f2546");
          ctx.fillRect(x + 1, TOP, LW - 2, BASS_H - TOP);
          ctx.fillStyle = "#d9d9d9";
          ctx.fillRect(x + LW / 2 - (2 - k * 0.4) / 2, TOP, 2 - k * 0.4, BASS_H - TOP);
          text(ctx, BASS_LANES[k][1], x + LW / 2, HIT + 26, 16, "#adb5bd");
        }
        ctx.fillStyle = "#ffd166";
        ctx.fillRect(4, HIT - 1, W - 8, 3);
        for (k = 0; k < rn.length; k++) {
          var n = rn[k];
          if (n.t - t > BASS_LOOK) { break; }
          if (n.j !== -2 || t - n.t > 0.25) { continue; }
          var y = HIT - (n.t - t) / BASS_LOOK * (HIT - TOP), nx = 4 + n.lane * LW;
          ctx.fillStyle = n.ghost ? "#868e96" : "#74c0fc";
          ctx.fillRect(nx + 6, y - 11, LW - 12, 22);
          if (n.ghost) { text(ctx, "✕", nx + LW / 2, y, 14, "#14213d"); continue; } // §280: ゴースト音
          text(ctx, String(n.f), nx + LW / 2 - 12, y, 14, "#14213d");
          text(ctx, bassName(n.m, "do"), nx + LW / 2 + 14, y, 10, "#14213d");
        }
        var c0 = Math.ceil((t0 - now()) / spb);
        if (now() < t0 && c0 >= 1 && c0 <= meter) { text(ctx, String(c0), W / 2, BASS_H / 2 - 20, 40, "#ffd166"); }
        if (judgeFrames > 0) { text(ctx, judgeText, W / 2, HIT - 40, 20, judgeText === "MISS" ? "#ff6b6b" : "#ffd166"); }
      }
    };
  }

  // パッドの見た目でキー Q W E R / A S D F、コードは 1〜7、Z 録音・X 再生
  var BASS_KEYS = { q: "p0", w: "p1", e: "p2", r: "p3", a: "p4", s: "p5", d: "p6", f: "p7", y: "p8", u: "p9", i: "p10", o: "p11", h: "p12", j: "p13", k: "p14", l: "p15",
    "1": "c0", "2": "c1", "3": "c2", "4": "c3", "5": "c4", "6": "c5", "7": "c6", z: "rec", x: "play", t: "tech", b: "pat" };

  I.register({
    id: "bass",
    after: "drum",
    cat: "music",
    music: true,
    name: "ゴリラベース",
    icon: "&#x1F3B8;",
    desc: "4本の弦のフレットか、コードに合う音のパッドで弾いて録音。ゴリラウクレレのシーケンサーへ送れる",
    help: "🎮 リズムゲームは落ちてくる音符の弦のレーンをタップ（D F J K）/ フレット・パッドをタップ（同じ弦ですべらせるとスライド・押さえたまま上をタップでハンマリング）/ パッドは Q W E R・A S D F（16個は Y U I O・H J K L も）、✏️ でパッドの音を変えられる、コードは 1〜7 / T 奏法 / B パターン / Z 録音 / X 再生 / P一時停止",
    controls: [],
    keys: BASS_KEYS,
    setup: bassSetup,
    setupLabel: "音色・テイク",
    panel: true,
    create: function (api, cfg) {
      cfg = cfg || {};
      if (cfg.mode === "rhythm") { return bassRhythm(api, cfg); } // §270
      if (cfg.mode === "quiz") { return bassQuiz(api, cfg); } // §281
      var prefs = bassPrefs(), view = prefs.view, prog = prefs.prog, names = prefs.names;
      var frame = 0, press = {}, ended = false, msg = "", flash = {}, chordD = 0;
      var panel = api.panel;
      if (panel && panel.classList) { panel.classList.add("quiz-panel"); }
      // §271: よこ向き
      function applyLand() {
        if (api.setLandscape) { api.setLandscape(prefs.land); }
        var box = panel && panel.parentNode;
        bassSetLayout(prefs.land, prefs.land && box ? bassLandH(box.clientWidth, box.clientHeight) : 130);
        bassSetPick(prefs.pick && view === "fret");
        prefs.pos = Math.min(prefs.pos, BASS_POS_MAX);
        if (api.setCanvasHeight) { api.setCanvasHeight(BASS_H); }
      }
      applyLand();
      function ly(p, l) { return BASS_LAND ? l : p; }
      function now() { return frame / 60; }

      // --- 音 ---
      var UG = window.UGMelody, audioOk = false;
      function audio() {
        if (audioOk || !UG || !UG.audioInit) { return; }
        try { if (UG.audioInit()) { audioOk = true; UG.loadSamples([prog]); } } catch (e) {}
      }
      // §256: how ＝ 奏法の音 "thumb" / "pop" / "ghost"（なしは ""）→ 音のハンドル（音が出せなければ null）
      // when（省略可）: 鳴らす時刻（AudioContext の秒）
      var buses = {}; // §272: ベース・ドラムの音量の出口
      function sound(m, lv, how, when) {
        audio();
        if (!audioOk) { return null; }
        var h = null;
        try {
          var l = how === "ghost" ? 0.45 : (lv || 0.85), bus = bassBus(buses, "b", prefs.bvol, prefs.phone);
          h = UG.synth(m, prog, when || 0, l, bus ? bassVoiceOut(bus, l, prog) : undefined, how === "ghost" ? 0 : BASS_HOLD) || null;
          if (how && UG.bassHit) { UG.bassHit(how, when || 0, how === "ghost" ? 0.6 : 1, bus || undefined); }
          if (how === "ghost" && h && UG.voiceStop) { UG.voiceStop(h, Math.max(when || 0, h.ac.currentTime) + 0.05, 0.02); }
        } catch (e) {}
        return h;
      }
      // 奏法の音（s: 弦。パッドは -1）と、録音する強さ
      function techOf(m, s) {
        if (prefs.tech === "mute") { return "ghost"; }
        if (prefs.tech === "slap") { return (s >= 0 ? s >= 2 : m < 38) ? "thumb" : "pop"; }
        return "";
      }
      function velOf(how) { return how === "ghost" ? 0.35 : (how ? 1 : 0.8); }
      function howOfVel(v, m) { return v <= 0.4 ? "ghost" : (v >= 0.95 ? (m < 38 ? "thumb" : "pop") : ""); }
      // 鳴っている音 { h, cur }（ハンマリングのときは指どうしで同じものを使う）
      function bend(v, m, glide) { v.cur = m; if (v.h && UG.voiceBend) { try { UG.voiceBend(v.h, m, 0, glide); } catch (e) {} } }
      function hush(v) { if (v && v.h && UG.voiceStop) { try { UG.voiceStop(v.h, 0, 0.06); } catch (e) {} } }
      function click(accent) { if (audioOk) { try { UG.synth(accent ? 37 : 42, UG.DRUM, 0, accent ? 0.9 : 0.6); } catch (e) {} } }

      // --- 録音・再生 ---
      var bpm = prefs.bpm, meter = 4, metro = prefs.metro, takes = bassTakesLoad();
      var take = cfg.take ? bassTakeById(takes, cfg.take) : null, rec = null, play = null;
      if (take) { msg = "「" + escHtml(take.name) + "」をひらきました。▶ 再生で聴けます"; }
      // §255: 伴奏（シーケンサーの曲）。bk ＝ 鳴らしているあいだ
      var back = cfg.backing ? bassBacking(cfg.backing) : null, bk = null;
      if (back) { bpm = back.seq.bpm; meter = back.seq.meter; if (!take) { msg = "&#x1F3B8; 伴奏に合わせて弾こう。パッドのコードは曲に合わせて変わります"; } }
      else if (cfg.backing) { msg = "伴奏の曲が見つかりませんでした（ゴリラウクレレのシーケンサーで曲を作ってね）"; }
      function backT() { return bk ? (frame - bk.f0) / 60 : 0; }
      function backBeat() {
        var S = back.s, t = backT();
        return t < S.lead ? (t - S.lead) / S.spb : S.beatAt(t);
      }
      // pre: 伴奏の前に空ける秒（曲にカウントインがないときの録音）
      function backStart(pre) {
        backStop();
        audio();
        var U = bassBackApi(), progs = [24], ids, i;
        bk = { f0: frame + Math.round((pre || 0) * 60), idx: 0, outs: [null, null, null, null], mix: null, fx: false };
        if (!audioOk || !U) { return; }
        try {
          ids = U.trackIds(back.s.tracks);
          for (i = 0; i < ids.length; i++) { if (back.s.tracks[ids[i]].on && back.s.tracks[ids[i]].prog !== undefined) { progs.push(back.s.tracks[ids[i]].prog); } }
          UG.loadSamples(progs);
        } catch (e0) {}
        if (U.fxPush) { try { U.fxPush(back.seq); bk.fx = true; } catch (e) {} }
      }
      function backStop() {
        if (!bk) { return; }
        var U = bassBackApi();
        if (bk.fx && U && U.fxPop) { try { U.fxPop(); } catch (e) {} }
        bk = null;
        if (pat && pat.back) { patStop(); }
      }
      function backStep() {
        var S = back.s, t = backT(), U = bassBackApi(), ac = audioOk && UG.audio ? UG.audio.ctx : null, ev;
        while (bk.idx < S.events.length && (ev = S.events[bk.idx]).t <= t + 0.1) {
          if (ac && U && U.seqPlayEvent && bassBackEventOn(ev, back.seq, S.lead, !prefs.backBass)) {
            try {
              if (!bk.mix) { bk.mix = U.mixer(UG, ac, S.tracks); }
              U.seqPlayEvent(UG, ac, ev, ac.currentTime + Math.max(0, ev.t - t), back.lowG, 0.55, bk.outs, bk.mix, S.tracks);
            } catch (e) {}
          }
          bk.idx++;
        }
        if (t >= S.time) {
          if (rec) { recStop(); }
          backStop();
          play = null;
          render();
        }
      }
      // いまのコード（伴奏があるとき）の番号
      function songIdx() { return back && back.chords.length ? bassChordIdx(back.chords, bk ? backBeat() : -1) : -1; }
      function curChord() { var k = songIdx(); return k >= 0 ? back.chords[k].ch : bassChord(prefs.key, chordD, prefs.scale, prefs.sev); }
      function recBeat() { return rec ? (rec.back ? backBeat() : (now() - rec.t0) * bpm / 60) : 0; }
      function r3(v) { return Math.round(v * 1000) / 1000; }
      function recToggle() {
        if (rec) { recStop(); return; }
        var wasPat = !!pat;
        playStop();
        audio();
        if (back) {
          // 曲にカウントインがなければ、ベースが1小節ぶん数える
          backStart(back.s.lead ? 0 : meter * back.s.spb);
          rec = { back: true, notes: [], open: {}, beat: -99 };
        } else {
          rec = { t0: now() + meter * 60 / bpm, notes: [], open: {}, beat: -meter - 1 };
        }
        // §257: パターンを鳴らしていたら、録音の頭にそろえて鳴らしなおす（パターンの音も録る）
        if (wasPat) { patStart(); }
        msg = "";
        render();
      }
      function recOn(id, m, v) {
        if (!rec) { return; }
        var b = recBeat();
        if (b < -0.25 || rec.notes.length >= BASS_NOTES_MAX) { return; }
        rec.open[id] = [Math.max(0, b), m, v || 0.8];
      }
      function recOff(id) {
        if (!rec || !rec.open[id]) { return; }
        var o = rec.open[id];
        delete rec.open[id];
        var nt = [r3(o[0]), r3(Math.max(0.0625, recBeat() - o[0])), o[1]];
        if (o[2] !== 0.8) { nt.push(o[2]); }
        rec.notes.push(nt);
      }
      function recStop() {
        var ks = [], k;
        for (k in rec.open) { if (rec.open.hasOwnProperty(k)) { ks.push(k); } }
        for (k = 0; k < ks.length; k++) { recOff(ks[k]); }
        var n = rec.notes, wasBack = rec.back;
        rec = null;
        if (wasBack) { backStop(); }
        if (n.length) {
          take = bassTakeAdd(takes, { bpm: bpm, meter: meter, prog: prog, notes: n });
          bassTakesSave(takes);
          msg = "&#x1F4BE; 「" + escHtml(take.name) + "」に保存しました（" + take.notes.length + "音）<br>はじめの画面の「🎸 送る」でシーケンサーに入れられます";
        } else {
          msg = "音がなかったので保存しませんでした";
        }
        render();
      }
      function playStop() {
        if (!play) { return; }
        for (var i = 0; i < play.vo.length; i++) { hush(play.vo[i]); }
        if (play.back) { backStop(); }
        play = null;
        render();
      }
      function playBeat() { return play ? (play.back ? backBeat() : (now() - play.t0) * play.bpm / 60) : 0; }
      function playToggle() {
        if (play) { playStop(); return; }
        if (rec) { return; }
        if (!take || !take.notes.length) { msg = "まだテイクがありません。🔴 録音してみよう"; render(); return; }
        patStop();
        // 伴奏があれば、テイクを伴奏といっしょに頭から
        play = { t0: now() + 0.1, notes: take.notes, bpm: take.bpm, idx: 0, back: !!back, vo: [] };
        if (back) { backStart(0); }
        audio();
        render();
      }
      function backToggle() {
        if (rec || !back) { return; }
        if (play) { playStop(); }
        var wasPat = !!pat;
        if (bk) { backStop(); } else { backStart(0); if (wasPat) { patStart(); } }
        render();
      }

      // --- §257: 演奏パターン ---
      var pat = null; // { back: 伴奏に合わせる, t0, k: 次のマス, d: パターン, unit: 1マスの拍, vo: 鳴っている音, lit, rec: 録る }
      // §265: 編集中は編集しているパターン
      function patDef() { return pe ? [pe.id || "edit", "（編集中）", pe.pt, meter] : bassPatById(bassPatterns(meter), prefs.pat); }
      var pe = null; // §265: パターンの編集 { pt: マス, id: 直しているじぶんのパターン（新しいなら null） }
      function peLens() { return meter === 3 ? [6, 12] : [8, 12, 16]; }
      // マスの段のタップ → マスの番号（-1 ＝ 外）
      function stepAt(x, y) {
        if (!pe || y < BASS_STEP_Y || y >= BASS_STEP_Y + BASS_STEP_H) { return -1; }
        var i = Math.floor((x - 4) / ((W - 8) / pe.pt.length));
        return i >= 0 && i < pe.pt.length ? i : -1;
      }
      function peChanged(restart) {
        if (pat) { if (restart) { patStart(true); } else { pat.d = patDef(); } }
        render();
      }
      function peTap(i) {
        var c = pe.pt.charAt(i), n = BASS_TOK_CYCLE.charAt((BASS_TOK_CYCLE.indexOf(c) + 1) % BASS_TOK_CYCLE.length);
        pe.pt = pe.pt.substring(0, i) + n + pe.pt.substring(i + 1);
        flash["s" + i] = 10;
        peChanged(false);
      }
      // パターンの拍 b のゲームの時刻（秒）
      function patTime(b) { return pat.back ? now() + (back.s.tm(b) - backT()) : pat.t0 + b * 60 / bpm; }
      // keep: 伴奏なしのとき、いまの拍のまま（パターンを切りかえたとき）
      function patStart(keep) {
        var old = pat, d = patDef(), unit = d[3] / d[2].length;
        patStop();
        if (back && !bk) { backStart(0); }
        pat = { back: !!(back && bk), t0: rec && !rec.back ? rec.t0 : now() + 0.1, k: 0, d: d, unit: unit, vo: null, lit: null, rec: !!rec };
        if (pat.back) { pat.k = Math.max(0, Math.ceil(backBeat() / unit - 1e-6)); }
        else if (keep && old && !old.back) { pat.t0 = old.t0; pat.k = Math.max(0, Math.ceil((now() - old.t0) * bpm / 60 / unit - 1e-6)); }
        audio();
      }
      function padTop() { return pat || pe ? BASS_PAD_Y_PAT : BASS_PAD_Y; }
      // いま鳴っているパターンのマス（まだなら -1）
      function patCell() {
        if (!pat) { return -1; }
        var b = pat.back ? backBeat() : (now() - pat.t0) * bpm / 60;
        return b < 0 ? -1 : Math.floor(b / pat.unit + 1e-6) % pat.d[2].length;
      }
      function patStop() {
        if (!pat) { return; }
        var rmp = pat.ramped;
        hush(pat.vo); pat = null; pendApply();
        if (rmp) { bpm = prefs.bpm; render(); } // §278: はじめの BPM にもどす
      }
      // §264: パターン中のコード・キー・スケールの切りかえは次の小節の頭に（予約 { d, key, scale }）
      var pend = null;
      function pendOn() { return !!(pat && !pat.back && prefs.quant !== "now"); }
      function pendApply() {
        if (!pend) { return; }
        var p0 = pend;
        pend = null;
        if (p0.d !== undefined) { chordD = p0.d; flash["c" + p0.d] = 10; }
        if (p0.key !== undefined || p0.scale !== undefined) {
          if (p0.key !== undefined) { prefs.key = p0.key; }
          if (p0.scale !== undefined) { prefs.scale = p0.scale; }
          bassSavePrefs(prefs);
          render();
        }
      }
      function pendKey() { return pend && pend.key !== undefined ? pend.key : prefs.key; }
      function pendScale() { return pend && pend.scale !== undefined ? pend.scale : prefs.scale; }
      function patToggle() {
        if (pat) { patStop(); } else { if (play) { playStop(); } patStart(); }
        render();
      }
      // §267: いっしょに鳴らすゴリラドラムのリズム → { id, len: 1小節のマス, steps: [[MIDI, [マス]]] }（なしは null）
      var drumCache = null;
      function drumDef() {
        var D = window.UGDrum, id = prefs.drum;
        if (!id || !D || !D.patternSteps) { return null; }
        if (drumCache && drumCache.id === id) { return drumCache.steps ? drumCache : null; }
        var st = null, len = 16;
        try { st = D.patternSteps(id); len = D.patLen ? D.patLen(id) : 16; } catch (e) {}
        drumCache = { id: id, len: len, steps: st && st.length && len === (meter === 3 ? 12 : 16) ? st : null };
        return drumCache.steps ? drumCache : null;
      }
      function drumInit() {
        var D = window.UGDrum, dp = null;
        try { dp = D && D.prefs ? D.prefs() : null; } catch (e) {}
        if (!dp || !audioOk) { return; }
        try {
          if (UG.setDrumSamples) { UG.setDrumSamples(dp.real); }
          if (UG.setDrumKit) { UG.setDrumKit(dp.kitId); }
          if (dp.real && UG.loadSamples) { UG.loadSamples([UG.DRUM]); }
        } catch (e2) {}
      }
      // ドラムのマスを 0.1秒先まで予約して鳴らす（パターンと同じ拍）
      function drumStep() {
        var dd = drumDef(), D = window.UGDrum, ac = audioOk && UG.audio ? UG.audio.ctx : null, n = 0, i;
        if (!dd || !ac) { return; }
        var du = meter / dd.len, bper = pat.d[2].length / meter;
        if (pat.dk === undefined) { pat.dk = Math.max(0, Math.ceil((now() - pat.t0) * bpm / 60 / du - 1e-6)); drumInit(); }
        while (n++ < 16) {
          var s = pat.dk % dd.len, sw = (bper === 2 && s % 4 === 2) || (bper === 4 && s % 2 === 1) ? bassOpt(BASS_SWINGS, prefs.swing)[2] * pat.unit : 0;
          var dt = patTime(pat.dk * du + sw) - now();
          if (dt > 0.1) { break; }
          pat.dk++;
          if (dt < -0.05) { continue; }
          for (i = 0; i < dd.steps.length; i++) {
            if (dd.steps[i][1].indexOf(s) < 0) { continue; }
            var lv = 0.8;
            try { lv = D.patVel ? D.patVel(dd.steps[i][0], s % 16, false) : 0.8; } catch (e) {}
            try { UG.synth(dd.steps[i][0], UG.DRUM, ac.currentTime + Math.max(0, dt), lv * 0.75, bassBus(buses, "d", prefs.dvol) || undefined); } catch (e2) {}
          }
        }
      }
      // 0.1秒先までのマスを予約して鳴らす
      function patStep() {
        var d = pat.d, pt = d[2], unit = pat.unit, ac = audioOk && UG.audio ? UG.audio.ctx : null, spb = pat.back ? back.s.spb : 60 / bpm, n = 0;
        while (pat && n++ < 16) {
          // §278: だんだん速く（5・9…小節目の頭で、その時刻のまま BPM を上げる）
          var rb = pat.k * unit, rbar = Math.round(rb / d[3]);
          if (prefs.ramp && !pat.back && !rec && pat.k % pt.length === 0 && rbar > 0 && rbar % 4 === 0 && pat.rampAt !== rbar) {
            pat.rampAt = rbar;
            var nb = Math.min(prefs.rampMax, bpm + prefs.ramp);
            if (nb > bpm) { var tB = patTime(rb); bpm = nb; pat.t0 = tB - rb * 60 / bpm; pat.ramped = true; spb = 60 / bpm; render(); }
          }
          // §266: 裏のマスはハネのぶんおそく
          var per = pt.length / d[3], b = pat.k * unit, sb = b + bassSwingOf(prefs.swing, per, pat.k % pt.length) * unit, tt = patTime(sb), dt = tt - now();
          if (dt > 0.1 || (pat.back && b >= back.s.beats - 1e-6)) { break; }
          var ci = pat.k % pt.length, c = pt.charAt(ci), ch = curChord(), next = null, left = 99;
          pat.k++;
          if (pat.back && back.chords.length) {
            var si = bassChordIdx(back.chords, b), sc = back.chords[si];
            ch = sc.ch;
            next = back.chords[si + 1] || null;
            if (next) { left = next.start - b; }
            // コードが変わる拍が休みなら、その拍でルート
            if (c === "-" && Math.abs(sc.start - b) < 1e-6) { c = "R"; }
          } else {
            // §264: 小節の頭で予約を反映。予約があれば → は予約のコードへ
            if (ci === 0 && pend) { pendApply(); ch = curChord(); }
            if (pend) {
              next = { ch: bassChord(pendKey(), pend.d !== undefined ? pend.d : chordD, pendScale()) };
              left = Math.floor(b / meter + 1e-6) * meter + meter - b;
            }
            // §263: コード進行をえらんでいたら、小節ごとに次のコードへ
            var cp = bassCprog(prefs.cprog);
            if (cp) {
              var ca = bassCprogAt(cp, b, meter);
              if (ca.d !== chordD) { chordD = ca.d; flash["c" + ca.d] = 10; }
              ch = curChord();
              next = { ch: bassChord(prefs.key, ca.next, prefs.scale) };
              left = ca.left;
            }
            if (c === "-" && ci === 0 && ch.name !== pat.lastCh) { c = "R"; } // §259: 伴奏なしでも、コードが変わった小節の頭が休みならルート
          }
          var fl = prefs.fill ? bassFillTok(per, b, d[3]) : ""; // §277
          if (fl) { c = fl; }
          if (c !== "-") { pat.lastCh = ch.name; }
          if (c === "-" || dt < -0.05) { continue; }
          var m = bassTokNote(c, ch, next ? next.ch : null, left), len = (fl ? 1 : bassTokLen(pt, ci)) * unit;
          // §276: つなぎの音（次のコードへ変わる直前の音を、次のルートの半音となりに）
          if (prefs.appr && next && c !== "A" && left <= 1 + 1e-6 && left > 1e-6 && len >= left - 1e-6 && bassPc(next.ch.root) !== bassPc(ch.root)) { m = bassApproach(m, next.ch.notes[0]); }
          var how = techOf(m, -1);
          var when = ac ? ac.currentTime + Math.max(0, dt) : 0;
          if (pat.vo && pat.vo.h && UG.voiceStop) { try { UG.voiceStop(pat.vo.h, when, 0.03); } catch (e) {} }
          var lv = how ? velOf(how) : bassAccOf(prefs.acc, per, ci), gt = bassOpt(BASS_GATES, prefs.gate)[2];
          pat.vo = { h: sound(m, lv, how, when), cur: m };
          if (pat.vo.h && UG.voiceStop && how !== "ghost") { try { UG.voiceStop(pat.vo.h, when + len * spb * gt, 0.04); } catch (e2) {} }
          pat.lit = { m: m, t0: tt, t1: tt + len * spb };
          if (pat.rec && rec && b >= 0 && rec.notes.length < BASS_NOTES_MAX) {
            var nt = [r3(sb), r3(gt < 0.9 ? len * gt : len), m], v = lv;
            if (v !== 0.8) { nt.push(v); }
            rec.notes.push(nt);
          }
        }
      }

      // --- 弾く ---
      var vo = {}, pstr = {}; // §256: 指 → 鳴っている音・弦
      // 同じ弦を押さえているほかの指（いちばん高いフレット）
      function holderOn(s, not) {
        var best = null, k;
        for (k in press) { if (press.hasOwnProperty(k) && k !== not && pstr[k] === s && (best === null || press[k] > press[best])) { best = k; } }
        return best;
      }
      // s: 弦（フレット。パッドは省略）
      function noteOn(id, m, s) {
        if (m < 0 || ended) { return; }
        if (press[id] !== undefined) { noteOff(id); }
        s = s === undefined ? -1 : s;
        var j = s >= 0 ? holderOn(s, id) : null;
        press[id] = m;
        pstr[id] = s;
        // §256 ハンマリング: 同じ弦を押さえたまま、高いフレットを別の指でタップ → 鳴らしなおさずに高さを変える
        if (j !== null && m > vo[j].cur && prefs.tech !== "mute") {
          vo[id] = vo[j];
          bend(vo[id], m, 0);
          recOff(j);
          recOn(id, m, 0.8);
          return;
        }
        var how = techOf(m, s);
        vo[id] = { h: sound(m, 0.85, how), cur: m };
        recOn(id, m, velOf(how));
      }
      function noteOff(id) {
        if (press[id] === undefined) { return; }
        var v = vo[id], m = press[id], top = null, k;
        delete press[id];
        delete vo[id];
        delete pstr[id];
        recOff(id);
        for (k in press) { if (press.hasOwnProperty(k) && vo[k] === v && (top === null || press[k] > press[top])) { top = k; } }
        // はなすと止まる。ほかの指が同じ音を使っていれば、プリング（残った指の音にもどる）
        if (top === null) { hush(v); return; }
        if (v.cur === m) { bend(v, press[top], 0); recOn(top, press[top], 0.8); }
      }
      function allOff() { var ks = [], k; for (k in press) { if (press.hasOwnProperty(k)) { ks.push(k); } } for (k = 0; k < ks.length; k++) { noteOff(ks[k]); } pickAllOff(); }
      // §287: 右手ピッキング。held: 左手の指 → { s, f }・picks: 右手の指 → { y }・pv: 弦 → 鳴っている音 { h, cur }
      var held = {}, picks = {}, pv = [null, null, null, null];
      function fretOf(s) { var f = 0, k; for (k in held) { if (held.hasOwnProperty(k) && held[k].s === s && held[k].f > f) { f = held[k].f; } } return f; }
      function heldOn(s) { for (var k in held) { if (held.hasOwnProperty(k) && held[k].s === s) { return true; } } return false; }
      function pickNote(s) { return BASS_STRINGS[s][0] + fretOf(s); }
      function pickStop(s) { if (!pv[s]) { return; } hush(pv[s]); pv[s] = null; recOff("k" + s); }
      function pickAllOff() { if (!pv) { return; } for (var s = 0; s < 4; s++) { pickStop(s); } held = {}; picks = {}; }
      function pluck(s) {
        if (ended) { return; }
        var m = pickNote(s), how = techOf(m, s);
        pickStop(s);
        pv[s] = { h: sound(m, 0.85, how), cur: m };
        recOn("k" + s, m, velOf(how));
      }
      // 左手を変えたとき、鳴っている弦は音程を変える。指がぜんぶはなれたら止める（ミュート）
      function heldChanged(s, lifted) {
        if (!pv[s]) { return; }
        if (lifted && !heldOn(s) && pv[s].cur !== BASS_STRINGS[s][0]) { pickStop(s); return; }
        if (pv[s].cur !== pickNote(s)) { recOff("k" + s); bend(pv[s], pickNote(s), 0.07); recOn("k" + s, pickNote(s), 0.8); }
      }
      var padHeld = {}; // 指・キー → 押しているパッド
      var ed = null; // §258: パッドの音の編集中 { sel: えらんだパッド（-1 ＝ まだ） }
      function padPress(id, i) {
        if (!(i >= 0 && i < prefs.padN)) { return; }
        padHeld[id] = i;
        flash["p" + i] = 10;
        if (ed) { ed.sel = i; render(); }
        noteOn(id, bassPadNote(curChord(), prefs.pads[i]));
      }
      function padEdited() {
        bassSavePrefs(prefs);
        if (ed.sel >= 0) {
          var h = sound(bassPadNote(curChord(), prefs.pads[ed.sel]), 0.85, "");
          if (h && UG.voiceStop) { try { UG.voiceStop(h, h.ac.currentTime + 0.35, 0.06); } catch (e) {} }
        }
        render();
      }
      // 伴奏があるときは、コードは曲に合わせて変わる（自分では選ばない）
      function setChord(d) {
        if (!(d >= 0 && d < 7 && !back)) { return; }
        if (pendOn()) { pend = pend || {}; pend.d = d; }
        else { chordD = d; flash["c" + d] = 10; }
        // §263: 進行を鳴らしているときに自分でえらぶと「コード進行なし」にもどる
        if (prefs.cprog && pat) { prefs.cprog = ""; bassSavePrefs(prefs); render(); }
      }
      function setTech(t) { prefs.tech = t; bassSavePrefs(prefs); render(); }
      function action(v) {
        if (v === "rec") { recToggle(); } else if (v === "play") { playToggle(); } else if (v === "back") { backToggle(); }
        else if (v === "view") { allOff(); padHeld = {}; view = view === "pad" ? "fret" : "pad"; prefs.view = view; bassSavePrefs(prefs); bassSetPick(prefs.pick && view === "fret"); render(); }
        else if (v === "posdown" || v === "posup") {
          allOff();
          prefs.pos = Math.max(0, Math.min(BASS_POS_MAX, prefs.pos + (v === "posup" ? 1 : -1)));
          bassSavePrefs(prefs);
          render();
        }
        else if (v === "keydown" || v === "keyup") {
          allOff(); padHeld = {};
          var nk = (pendKey() + (v === "keyup" ? 1 : 11)) % 12;
          if (pendOn()) { pend = pend || {}; pend.key = nk; }
          else { prefs.key = nk; bassSavePrefs(prefs); }
          render();
        }
        else if (/^scale:/.test(v)) {
          // §262: スケールをえらぶ（知らない id は無視）
          if (bassScale(v.substring(6))[0] !== v.substring(6)) { return; }
          allOff(); padHeld = {};
          if (pendOn()) { pend = pend || {}; pend.scale = v.substring(6); }
          else { prefs.scale = v.substring(6); bassSavePrefs(prefs); }
          render();
        }
        else if (/^drum:/.test(v)) {
          // §267: いっしょに鳴らすドラム（読めない id は無視）
          var did = v.substring(5), od = prefs.drum;
          prefs.drum = did;
          if (did && !drumDef()) { prefs.drum = od; return; }
          if (pat) { pat.dk = undefined; }
          bassSavePrefs(prefs);
          render();
        }
        else if (v === "land") { allOff(); padHeld = {}; prefs.land = !prefs.land; bassSavePrefs(prefs); applyLand(); render(); }
        else if (/^tab:/.test(v)) { if (bassOpt(BASS_TABS, v.substring(4))[0] !== v.substring(4)) { return; } prefs.tab = v.substring(4); bassSavePrefs(prefs); render(); }
        else if (v === "ramp" || v === "rampmax") {
          var rl = v === "ramp" ? BASS_RAMPS : BASS_RAMP_MAXES, rk = v === "ramp" ? "ramp" : "rampMax";
          prefs[rk] = rl[(rl.indexOf(prefs[rk]) + 1) % rl.length]; bassSavePrefs(prefs); render();
        }
        else if (v === "fill") { prefs.fill = !prefs.fill; bassSavePrefs(prefs); render(); }
        else if (v === "pick") { allOff(); prefs.pick = !prefs.pick; bassSavePrefs(prefs); bassSetPick(prefs.pick && view === "fret"); render(); }
        else if (/^grip:/.test(v)) { allOff(); bassGripStep(v.substring(5)); applyLand(); render(); }
        else if (v === "appr") { prefs.appr = !prefs.appr; bassSavePrefs(prefs); render(); }
        else if (v === "phone") { prefs.phone = !prefs.phone; bassSavePrefs(prefs); bassBus(buses, "b", prefs.bvol, prefs.phone); render(); }
        else if (/^[bd]vol:[+-]$/.test(v)) {
          var vk = v.charAt(0) + "vol";
          prefs[vk] = Math.max(0, Math.min(BASS_VOL_MAX, prefs[vk] + (v.charAt(5) === "+" ? BASS_VOL_STEP : -BASS_VOL_STEP)));
          bassSavePrefs(prefs); bassBus(buses, v.charAt(0), prefs[vk], prefs.phone); render();
        }
        else if (v === "sev") { prefs.sev = !prefs.sev; bassSavePrefs(prefs); render(); }
        else if (v === "swing" || v === "gate" || v === "acc") {
          // §266: ノリ（押すたびに次へ）
          var gl = v === "swing" ? BASS_SWINGS : (v === "gate" ? BASS_GATES : BASS_ACCS), gi2 = gl.indexOf(bassOpt(gl, prefs[v]));
          prefs[v] = gl[(gi2 + 1) % gl.length][0];
          bassSavePrefs(prefs);
          render();
        }
        else if (v === "quant") { prefs.quant = prefs.quant === "now" ? "bar" : "now"; bassSavePrefs(prefs); if (prefs.quant === "now") { pendApply(); } render(); }
        else if (/^cprog:/.test(v)) {
          var cid = v.substring(6);
          if (cid && !bassCprog(cid)) { return; }
          prefs.cprog = cid;
          bassSavePrefs(prefs);
          render();
        }
        else if (v === "tech") {
          var ti = 0;
          for (var q = 0; q < BASS_TECHS.length; q++) { if (BASS_TECHS[q][0] === prefs.tech) { ti = q; } }
          setTech(BASS_TECHS[(ti + 1) % BASS_TECHS.length][0]);
        }
        else if (/^tech:/.test(v)) { setTech(v.substring(5)); }
        else if (v === "pat") { patToggle(); }
        else if (v === "patprev" || v === "patnext" || /^patset:/.test(v)) {
          var pl = bassPatterns(meter), pi = pl.indexOf(patDef());
          // §260: 一覧からえらぶ（patset:id）
          if (/^patset:/.test(v)) { var pick = bassPatById(pl, v.substring(7)); if (pick[0] !== v.substring(7)) { return; } prefs.pat = pick[0]; }
          else { prefs.pat = pl[(pi + (v === "patnext" ? 1 : pl.length - 1)) % pl.length][0]; }
          bassSavePrefs(prefs);
          if (pat) { patStart(true); }
          render();
        }
        else if (v === "edit") { ed = ed ? null : { sel: -1 }; render(); }
        else if (v === "padn") {
          allOff(); padHeld = {};
          prefs.padN = prefs.padN === 16 ? 8 : 16;
          if (ed && ed.sel >= prefs.padN) { ed.sel = -1; }
          bassSavePrefs(prefs);
          render();
        }
        else if (ed && ed.sel >= 0 && /^(pdeg|poct|psh):-?\d$/.test(v)) {
          var pp = v.split(":");
          prefs.pads[ed.sel][pp[0] === "pdeg" ? 0 : (pp[0] === "poct" ? 1 : 2)] = Number(pp[1]);
          padEdited();
        }
        else if (v === "preset" && ed && ed.sel >= 0) { prefs.pads[ed.sel] = BASS_PAD_DEFS[ed.sel].slice(); padEdited(); }
        else if (v === "presetall" && ed) { prefs.pads = bassPadsClean(null); padEdited(); }
        else if (v === "pedit") {
          var d0 = patDef();
          pe = { pt: d0[2], id: /^my\d$/.test(d0[0]) ? d0[0] : null };
          ed = null;
          peChanged(false);
        }
        else if (pe && /^plen:\d+$/.test(v)) {
          var nl = Number(v.substring(5));
          if (peLens().indexOf(nl) < 0 || nl === pe.pt.length) { return; }
          pe.pt = bassPatResize(pe.pt, nl);
          peChanged(true);
        }
        else if (pe && v === "pclear") { pe.pt = "R" + new Array(pe.pt.length).join("-"); peChanged(false); }
        else if (pe && v === "pcancel") { pe = null; peChanged(true); }
        else if (pe && v === "psave") {
          var my = bassMyPats().slice(), id = pe.id, k2;
          if (!id) {
            if (my.length >= BASS_MYPATS_MAX) { msg = "じぶんのパターンは " + BASS_MYPATS_MAX + " 個までです。🗑️ で消してから保存してね"; render(); return; }
            for (k2 = 1; k2 <= BASS_MYPATS_MAX && !id; k2++) { if (!bassPatById(my, "my" + k2) || bassPatById(my, "my" + k2)[0] !== "my" + k2) { id = "my" + k2; } }
            my.push([id, "じぶん " + id.substring(2), pe.pt, meter]);
          } else {
            for (k2 = 0; k2 < my.length; k2++) { if (my[k2][0] === id) { my[k2] = [id, my[k2][1], pe.pt, meter]; } }
          }
          bassMySave(my);
          prefs.pat = id;
          bassSavePrefs(prefs);
          pe = null;
          msg = "&#x1F4BE; 「じぶん " + id.substring(2) + "」に保存しました";
          peChanged(true);
        }
        else if (v === "pdel" && !pe && /^my\d$/.test(patDef()[0])) {
          var dl = patDef()[0];
          bassMySave(bassMyPats().filter(function (q) { return q[0] !== dl; }));
          prefs.pat = "pop";
          bassSavePrefs(prefs);
          msg = "&#x1F5D1;&#xFE0F; 消しました";
          if (pat) { patStart(true); }
          render();
        }
        else if (v === "patseq") { var ps = bassPatToSeq(patDef(), prog); msg = (ps.ok ? "&#x2705; " : "&#x26A0;&#xFE0F; ") + escHtml(ps.msg); render(); }
        else if (v === "metro") { metro = !metro; prefs.metro = metro; bassSavePrefs(prefs); render(); }
        else if (v === "bpmdown" || v === "bpmup") {
          if (rec) { return; }
          var pcb = pat && !pat.back ? (now() - pat.t0) * bpm / 60 : 0;
          bpm = Math.max(40, Math.min(240, bpm + (v === "bpmup" ? 5 : -5)));
          if (pat && !pat.back) { pat.t0 = now() - pcb * 60 / bpm; }
          prefs.bpm = bpm;
          bassSavePrefs(prefs);
          render();
        }
      }

      // §258: えらんだパッドの音（度数・オクターブ・半音）のボタン
      function padEditor() {
        if (ed.sel < 0) { return '<p class="small" style="margin:4px 0 0;">&#x270F;&#xFE0F; 音を変えるパッドをタップしてね</p>'; }
        var pd = prefs.pads[ed.sel], h = '<p class="small" style="margin:4px 0 0;">' + (ed.sel + 1) + ' 番のパッド: <b>' + bassPadLabel(pd) + '</b>（いまのコード ' + escHtml(curChord().name) + ' で ' + bassName(bassPadNote(curChord(), pd), "cde") + '）</p>', k;
        function btn(v, on, label) { return '<button class="modal-btn' + (on ? " piano-rec-on" : "") + '" data-ba="' + v + '">' + label + '</button>'; }
        h += '<div class="piano-row">';
        for (k = 0; k < 7; k++) { h += btn("pdeg:" + k, pd[0] === k, BASS_DEG[k]); }
        h += '</div><div class="piano-row">';
        for (k = -1; k <= 2; k++) { h += btn("poct:" + k, pd[1] === k, ["↓", "そのまま", "↑", "↑↑"][k + 1]); }
        h += '</div><div class="piano-row">';
        for (k = -1; k <= 1; k++) { h += btn("psh:" + k, pd[2] === k, ["♭", "半音なし", "♯"][k + 1]); }
        h += '</div><div class="piano-row">' + btn("preset", false, "このパッドをもとに") + btn("presetall", false, "ぜんぶもとに") + '</div>';
        return h;
      }
      // §260: パターンの一覧（ジャンルごと）
      function patOptions() {
        var gs = bassPatGroups(bassPatterns(meter)), cur = patDef()[0], h = "", i, j;
        for (i = 0; i < gs.length; i++) {
          h += '<optgroup label="' + escHtml(gs[i][0]) + '">';
          for (j = 0; j < gs[i][1].length; j++) { var d = gs[i][1][j]; h += '<option value="' + d[0] + '"' + (d[0] === cur ? " selected" : "") + '>' + escHtml(d[1]) + '</option>'; }
          h += '</optgroup>';
        }
        return h;
      }
      // §267: ゴリラドラムのループ（拍子が合うもの）
      function drumOptions() {
        var D = window.UGDrum, l = [], h = '<option value=""' + (prefs.drum ? "" : " selected") + '>ドラムなし</option>', grp = "", i;
        try { l = D && D.patternList ? D.patternList() : []; } catch (e) {}
        for (i = 0; i < l.length; i++) {
          if (l[i].kind !== "loop" || l[i].len !== (meter === 3 ? 12 : 16)) { continue; }
          if (l[i].group !== grp) { h += (grp ? '</optgroup>' : "") + '<optgroup label="' + escHtml(l[i].group) + '">'; grp = l[i].group; }
          h += '<option value="' + escHtml(l[i].id) + '"' + (l[i].id === prefs.drum ? " selected" : "") + '>' + escHtml(l[i].name) + '</option>';
        }
        return h + (grp ? '</optgroup>' : "");
      }
      function cprogOptions() {
        var h = '<option value=""' + (prefs.cprog ? "" : " selected") + '>コード進行なし（上の段をタップ）</option>', i, j;
        for (i = 0; i < BASS_CPROG_GROUPS.length; i++) {
          h += '<optgroup label="' + BASS_CPROG_GROUPS[i][0] + '">';
          for (j = 0; j < BASS_CPROG_GROUPS[i][1].length; j++) { var cp = bassCprog(BASS_CPROG_GROUPS[i][1][j]); h += '<option value="' + cp[0] + '"' + (cp[0] === prefs.cprog ? " selected" : "") + '>' + cp[1] + '</option>'; }
          h += '</optgroup>';
        }
        return h;
      }
      // §269: いまのタブ（伴奏のときはキーのタブはない）
      function curTab() { return prefs.tab === "key" && back ? "pat" : prefs.tab; }
      function scaleOptions() {
        var h = "", i, j;
        for (i = 0; i < BASS_SCALE_GROUPS.length; i++) {
          h += '<optgroup label="' + BASS_SCALE_GROUPS[i][0] + '">';
          for (j = 0; j < BASS_SCALE_GROUPS[i][1].length; j++) { var sc = bassScale(BASS_SCALE_GROUPS[i][1][j]); h += '<option value="' + sc[0] + '"' + (sc[0] === pendScale() ? " selected" : "") + '>' + sc[1] + '</option>'; }
          h += '</optgroup>';
        }
        return h;
      }
      function render() {
        if (!panel) { return; }
        // §269: 上はいつも出す（録音・再生・パターン／BPM か伴奏／パターンの名前）
        var html = '<div class="piano-row"><button class="modal-btn' + (rec ? " piano-rec-on" : "") + '" data-ba="rec">' + (rec ? "&#x23F9;&#xFE0F; 録音をとめる" : (back ? "&#x1F534; 合わせて録音" : "&#x1F534; 録音")) + '</button>' +
          '<button class="modal-btn" data-ba="play"' + (rec ? " disabled" : "") + '>' + (play ? "&#x23F9;&#xFE0F; とめる" : (back ? "&#x25B6;&#xFE0F; テイク＋伴奏" : "&#x25B6;&#xFE0F; 再生")) + '</button>' +
          '<button class="modal-btn' + (pat ? " piano-rec-on" : "") + '" data-ba="pat">' + (pat ? "&#x23F9;&#xFE0F; パターン" : "&#x25B6;&#xFE0F; パターン") + '</button></div>';
        if (back) {
          html += '<div class="piano-row"><button class="modal-btn" data-ba="back"' + (rec ? " disabled" : "") + '>' + (bk && !play && !rec ? "&#x23F9;&#xFE0F; 伴奏をとめる" : "&#x1F3B8; 伴奏だけ鳴らす") + '</button>' +
            '<button class="modal-btn" data-ba="metro" title="録音のメトロノーム">' + BASS_METRO_ICON + ' ' + (metro ? "ON" : "OFF") + '</button></div>' +
            '<p class="small" style="margin:4px 0 0;">&#x1F3B8; 伴奏: ' + escHtml(back.name) + '（BPM ' + back.seq.bpm + '・' + back.seq.meter + '拍子' + (prefs.backBass ? "" : "・曲のベースは鳴らさない") + '）</p>';
        } else {
          html += '<div class="piano-row"><button class="modal-btn" data-ba="bpmdown">&minus;</button><span>BPM ' + bpm + '</span><button class="modal-btn" data-ba="bpmup">&#xFF0B;</button>' +
            '<button class="modal-btn" data-ba="metro" title="録音のメトロノーム">' + BASS_METRO_ICON + ' ' + (metro ? "ON" : "OFF") + '</button></div>';
        }
        if (!pe) { html += '<div class="piano-row"><button class="modal-btn" data-ba="patprev">&#x25C0;</button><span>&#x1F3BC; ' + patDef()[1] + '</span><button class="modal-btn" data-ba="patnext">&#x25B6;</button></div>'; }
        var tb = curTab(), k;
        if (ed && view === "pad") { html += padEditor(); }
        else if (pe) {
          // §265: パターンの編集
          html += '<p class="small" style="margin:4px 0 0;">&#x270F;&#xFE0F; マスをタップすると R → 3 → 5 → 6 → 7 → 8 → 5↓ → →（次のコードへ半音）→ －（のばす）と変わります</p>' +
            '<p class="small" style="margin:4px 0 0;">&#x1F3BC; ' + escHtml(pe.pt) + '（' + escHtml(bassPatLegend(pe.pt)) + '）</p><div class="piano-row">';
          for (i = 0; i < peLens().length; i++) { html += '<button class="modal-btn' + (pe.pt.length === peLens()[i] ? " piano-rec-on" : "") + '" data-ba="plen:' + peLens()[i] + '">' + peLens()[i] + 'マス</button>'; }
          html += '<button class="modal-btn" data-ba="pclear">ぜんぶ消す</button></div>' +
            '<div class="piano-row"><button class="modal-btn" data-ba="psave">&#x1F4BE; 保存</button><button class="modal-btn" data-ba="pcancel">やめる</button></div>';
        }
        else {
          // §269: タブ
          html += '<div class="piano-row">';
          for (k = 0; k < BASS_TABS.length; k++) { if (BASS_TABS[k][0] !== "key" || !back) { html += '<button class="modal-btn' + (tb === BASS_TABS[k][0] ? " piano-rec-on" : "") + '" data-ba="tab:' + BASS_TABS[k][0] + '">' + BASS_TABS[k][1] + '</button>'; } }
          html += '</div>';
          if (tb === "pat") {
            html += '<div class="piano-row"><label class="piano-select">&#x1F4DA; <select data-bpat="1">' + patOptions() + '</select></label></div>' +
              '<div class="piano-row"><button class="modal-btn" data-ba="patseq">&#x1F3BC; シーケンサーのベースに</button>' +
              '<button class="modal-btn" data-ba="pedit">&#x270F;&#xFE0F; パターンを作る</button>' + (/^my\d$/.test(patDef()[0]) ? '<button class="modal-btn" data-ba="pdel">&#x1F5D1;&#xFE0F; 消す</button>' : "") + '</div>' +
              '<div class="piano-row"><button class="modal-btn' + (prefs.appr ? " piano-rec-on" : "") + '" data-ba="appr">&#x1F500; つなぎの音: ' + (prefs.appr ? "ON" : "OFF") + '</button>' +
              '<button class="modal-btn' + (prefs.fill ? " piano-rec-on" : "") + '" data-ba="fill">&#x1F3A2; フィル: ' + (prefs.fill ? "ON" : "OFF") + '</button></div>';
            // §259: パターンの説明と文字の意味
            html += '<p class="small" style="margin:4px 0 0;">' + (pat ? "" : "&#x25B6;&#xFE0F; パターンを押すと、いまのコードに合わせてベースが自動で鳴ります。" +
              (back ? "コードは曲に合わせて変わります。" : (prefs.cprog ? "コードは進行どおり1小節ごとに変わります。" : "上の段のコードをタップすると、" + (prefs.quant === "now" ? "次の音から" : "次の小節の頭で") + "変わります。")) + "<br>") +
              "&#x1F3BC; " + escHtml(patDef()[2]) + "（" + escHtml(bassPatLegend(patDef()[2])) + "）</p>";
          } else if (tb === "feel") {
            html += '<div class="piano-row"><button class="modal-btn" data-ba="swing">ハネ: ' + bassOpt(BASS_SWINGS, prefs.swing)[1] + '</button>' +
              '<button class="modal-btn" data-ba="gate">長さ: ' + bassOpt(BASS_GATES, prefs.gate)[1] + '</button>' +
              '<button class="modal-btn" data-ba="acc">強弱: ' + bassOpt(BASS_ACCS, prefs.acc)[1] + '</button></div>' +
              (back ? "" : '<div class="piano-row"><label class="piano-select">&#x1F941; <select data-bdrum="1">' + drumOptions() + '</select></label></div>') +
              '<div class="piano-row"><button class="modal-btn' + (prefs.phone ? " piano-rec-on" : "") + '" data-ba="phone">&#x1F4F1; スマホ向けの音: ' + (prefs.phone ? "ON" : "OFF") + '</button></div>' +
              '<div class="piano-row"><span>&#x1F50A; ベース</span><button class="modal-btn" data-ba="bvol:-">－</button><span>' + prefs.bvol + '%</span><button class="modal-btn" data-ba="bvol:+">＋</button></div>' +
              (back ? "" : '<div class="piano-row"><span>&#x1F50A; ドラム</span><button class="modal-btn" data-ba="dvol:-">－</button><span>' + prefs.dvol + '%</span><button class="modal-btn" data-ba="dvol:+">＋</button></div>') +
              (back ? "" : '<div class="piano-row"><button class="modal-btn' + (prefs.ramp ? " piano-rec-on" : "") + '" data-ba="ramp">&#x1F4C8; だんだん速く: ' + (prefs.ramp ? "+" + prefs.ramp + "（4小節ごと）" : "なし") + '</button>' +
                '<button class="modal-btn" data-ba="rampmax">上限 BPM ' + prefs.rampMax + '</button></div>') +
              (back ? "" : '<div class="piano-row"><button class="modal-btn" data-ba="quant">&#x23F1;&#xFE0F; 切りかえ: ' + (prefs.quant === "now" ? "すぐ" : "小節の頭") + '</button></div>');
          } else if (tb === "key") {
            // §262: キーとスケール
            html += '<div class="piano-row"><button class="modal-btn" data-ba="keydown">&#x25C0;</button><span>キー ' + BASS_CDE[prefs.key] + (pend && (pend.key !== undefined || pend.scale !== undefined) ? " → " + BASS_CDE[pendKey()] + (pend.scale !== undefined ? " " + bassScale(pend.scale)[1].replace(/（.*）/, "") : "") + "（次の小節）" : "") + '</span>' +
              '<button class="modal-btn" data-ba="keyup">&#x25B6;</button><button class="modal-btn" data-ba="sev">' + (prefs.sev ? "7th" : "3和音") + '</button></div>' +
              '<div class="piano-row"><label class="piano-select">&#x1F3B5; <select data-bscale="1">' + scaleOptions() + '</select></label></div>' +
              (view === "fret" ? '<p class="small" style="margin:4px 0 0;">マスの下の点: スケールの音（白い大きな点は主音・<span style="color:#f783ac;">●</span> 特徴音 ' + bassScale(prefs.scale)[4] + '）</p>' : "") +
              '<div class="piano-row"><label class="piano-select">&#x1F501; <select data-bcprog="1">' + cprogOptions() + '</select></label></div>';
          } else {
            html += '<div class="piano-row">';
            for (i = 0; i < BASS_TECHS.length; i++) { html += '<button class="modal-btn' + (prefs.tech === BASS_TECHS[i][0] ? " piano-rec-on" : "") + '" data-ba="tech:' + BASS_TECHS[i][0] + '">' + BASS_TECHS[i][1] + '</button>'; }
            html += '</div>';
            if (view === "fret") {
              html += '<div class="piano-row"><button class="modal-btn" data-ba="posdown">&#x25C0;</button><span>' + (prefs.pos ? prefs.pos + "〜" + (prefs.pos + BASS_COLS - 1) + " フレット" : "開放弦〜" + (BASS_COLS - 1) + " フレット") + '</span>' +
                '<button class="modal-btn" data-ba="posup">&#x25B6;</button></div>' +
                '<div class="piano-row"><button class="modal-btn' + (prefs.pick ? " piano-rec-on" : "") + '" data-ba="pick">&#x270B; 右手で弾く: ' + (prefs.pick ? "ON" : "OFF") + '</button></div>' +
                '<p class="small" style="margin:4px 0 0;">' + (prefs.pick ? "左手でフレットを押さえて（押さえただけでは鳴らない）、右の「右手」の所で弦をなぞる・タップすると鳴る" : "マスをタップするとすぐ鳴る") + '</p>';
            } else {
              html += '<div class="piano-row"><button class="modal-btn" data-ba="edit">&#x270F;&#xFE0F; パッドの音を変える</button>' +
                '<button class="modal-btn" data-ba="padn">' + (prefs.padN === 16 ? "8個にする" : "16個にする") + '</button></div>';
            }
            html += '<div class="piano-row"><button class="modal-btn" data-ba="view">' + (view === "pad" ? "&#x1F3B8; フレットにする" : "&#x1F39B;&#xFE0F; パッドにする") + '</button>' +
              '<button class="modal-btn' + (prefs.land ? " piano-rec-on" : "") + '" data-ba="land">&#x1F4F1; ' + (prefs.land ? "たて向きにもどす" : "よこ向き") + '</button></div>' +
              (prefs.land ? bassGripRows("ba") : "");
          }
        }
        if (ed && view === "pad") { html += '<div class="piano-row"><button class="modal-btn piano-rec-on" data-ba="edit">&#x2705; 編集おわり</button><button class="modal-btn" data-ba="padn">' + (prefs.padN === 16 ? "8個にする" : "16個にする") + '</button></div>'; }
        if (take && !rec) { html += '<p class="small" style="margin:4px 0 0;">いまのテイク: ' + escHtml(take.name) + '（' + take.notes.length + '音・BPM ' + take.bpm + '）</p>'; }
        if (msg) { html += '<p class="small" style="margin:4px 0 0;color:#ffd166;">' + msg + '</p>'; }
        panel.innerHTML = html;
        var bs = panel.querySelectorAll ? panel.querySelectorAll("button[data-ba]") : [], i;
        for (i = 0; i < bs.length; i++) {
          bs[i].onclick = function (ev) { if (ev.currentTarget.blur) { ev.currentTarget.blur(); } action(ev.currentTarget.getAttribute("data-ba")); };
        }
        var psel = panel.querySelector ? panel.querySelector("select[data-bpat]") : null;
        if (psel) { psel.onchange = function (ev) { if (ev.currentTarget.blur) { ev.currentTarget.blur(); } action("patset:" + ev.currentTarget.value); }; }
        var ssel = panel.querySelector ? panel.querySelector("select[data-bscale]") : null;
        if (ssel) { ssel.onchange = function (ev) { if (ev.currentTarget.blur) { ev.currentTarget.blur(); } action("scale:" + ev.currentTarget.value); }; }
        var dsel = panel.querySelector ? panel.querySelector("select[data-bdrum]") : null;
        if (dsel) { dsel.onchange = function (ev) { if (ev.currentTarget.blur) { ev.currentTarget.blur(); } action("drum:" + ev.currentTarget.value); }; }
        var csel = panel.querySelector ? panel.querySelector("select[data-bcprog]") : null;
        if (csel) { csel.onchange = function (ev) { if (ev.currentTarget.blur) { ev.currentTarget.blur(); } action("cprog:" + ev.currentTarget.value); }; }
      }
      render();

      // いま鳴っている（押している・再生している）音
      function litNotes() {
        var out = {}, k, i;
        if (play) {
          var pb = playBeat();
          for (i = 0; i < play.notes.length; i++) { var n = play.notes[i]; if (n[0] <= pb && pb < n[0] + Math.max(0.25, n[1])) { out[n[2]] = "play"; } }
        }
        if (pat && pat.lit && now() >= pat.lit.t0 && now() < pat.lit.t1) { out[pat.lit.m] = "play"; }
        for (k in press) { if (press.hasOwnProperty(k)) { out[press[k]] = "press"; } }
        for (i = 0; i < 4; i++) { if (pv[i]) { out[pv[i].cur] = "press"; } }
        return out;
      }
      function text(ctx, s, x, y, size, color) {
        ctx.fillStyle = color;
        ctx.font = "bold " + (BASS_LAND ? Math.max(4, size * 0.6) : size) + "px sans-serif"; // §271: よこ向きは小さく
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(s, x, y);
      }
      function drawFret(ctx) {
        var lit = litNotes(), s, c, r, cw = bassColW(), rh = bassRowH(), top = BASS_BOARD_Y, bot = BASS_BOARD_Y + rh * BASS_STRINGS.length;
        var numY = BASS_LAND ? (bot + 4 <= BASS_H ? bot + 3 : top - 4) : top - 7, pzw = BASS_PICK_R - BASS_PICK_X;
        ctx.fillStyle = "#5b3a24";
        ctx.fillRect(BASS_BOARD_X, top, BASS_BOARD_R - BASS_BOARD_X, bot - top);
        if (BASS_PICK) {
          // 右手の所（ボディ）
          ctx.fillStyle = "#7a4b2a";
          ctx.fillRect(BASS_PICK_X, top, pzw, bot - top);
          ctx.fillStyle = "#2b2b2b";
          ctx.fillRect(BASS_PICK_X + pzw * 0.3, top + 2, pzw * 0.4, bot - top - 4); // ピックアップ
          text(ctx, "右手", BASS_PICK_X + pzw / 2, numY, 8, "#ffd166");
        }
        // フレットの印
        for (c = 0; c < BASS_COLS; c++) {
          var f = bassFretOf(prefs.pos, c), cx = bassColX(c) + cw / 2;
          if (BASS_MARKS.indexOf(f) < 0) { continue; }
          ctx.fillStyle = "#e8d8b8";
          if (f === 12) {
            ctx.beginPath(); ctx.arc(cx, top + rh, 3.5, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(cx, top + rh * 3, 3.5, 0, Math.PI * 2); ctx.fill();
          } else { ctx.beginPath(); ctx.arc(cx, top + rh * 2, 3.5, 0, Math.PI * 2); ctx.fill(); }
        }
        // フレット（列の区切り）。ポジション 0 の開放弦の右は太いナット
        for (c = 1; c < BASS_COLS; c++) {
          ctx.fillStyle = c === 1 && prefs.pos === 0 ? "#f5f0e6" : "#b8b8b8";
          ctx.fillRect(bassFretX(c) - (c === 1 && prefs.pos === 0 ? 2 : 0.75), top, c === 1 && prefs.pos === 0 ? 4 : 1.5, bot - top);
        }
        // §255: 伴奏があるときは、いまのコードの音（R・3・5）のマスに輪（ルートは太く）
        var ch = (back && back.chords.length) || pat ? curChord() : null, chPcs = {}, spc = back ? null : bassScalePcs(prefs.key, prefs.scale);
        if (ch) { chPcs[bassPc(ch.notes[1])] = 1; chPcs[bassPc(ch.notes[2])] = 1; chPcs[bassPc(ch.root)] = 2; }
        // 弦と、押している・鳴っているマス
        for (s = 0; s < BASS_STRINGS.length; s++) {
          var sy = top + (s + 0.5) * rh;
          for (c = 0; c < BASS_COLS; c++) {
            var m = BASS_STRINGS[s][0] + bassFretOf(prefs.pos, c), st = lit[m];
            r = bassCellRect(s, c);
            // §263: スケールの音の点（主音は白く大きく・特徴音はピンク）
            if (spc && spc[bassPc(m)]) {
              var sk = spc[bassPc(m)];
              ctx.fillStyle = sk === 3 ? "#ffffff" : (sk === 2 ? "#f783ac" : "rgba(255,255,255,0.5)");
              ctx.beginPath(); ctx.arc(r.x + r.w / 2, sy + rh * 0.33, sk === 1 ? 2 : 3, 0, Math.PI * 2); ctx.fill();
            }
            if (ch && chPcs[bassPc(m)]) {
              ctx.strokeStyle = chPcs[bassPc(m)] === 2 ? "#ff922b" : "rgba(116,192,252,0.85)";
              ctx.lineWidth = chPcs[bassPc(m)] === 2 ? 3 : 1.5;
              ctx.beginPath(); ctx.arc(r.x + r.w / 2, sy, Math.min(r.w, r.h) * 0.36, 0, Math.PI * 2); ctx.stroke();
              ctx.lineWidth = 1;
            }
            if (st) {
              ctx.fillStyle = st === "press" ? "#ffd166" : "#74c0fc";
              ctx.beginPath(); ctx.arc(r.x + r.w / 2, sy, Math.min(r.w, r.h) * 0.36, 0, Math.PI * 2); ctx.fill();
            }
          }
          if (BASS_PICK && heldOn(s)) {
            for (c = 0; c < BASS_COLS; c++) {
              if (fretOf(s) === bassFretOf(prefs.pos, c)) { var hc = bassCellRect(s, c); ctx.strokeStyle = "#ff922b"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(hc.x + hc.w / 2, sy, Math.min(hc.w, hc.h) * 0.36, 0, Math.PI * 2); ctx.stroke(); ctx.lineWidth = 1; }
            }
          }
          ctx.fillStyle = BASS_PICK && pv[s] ? "#ffe8a3" : "#d9d9d9";
          var sx0 = BASS_PICK ? Math.min(BASS_BOARD_X, BASS_PICK_X) : BASS_BOARD_X, sx1 = BASS_PICK ? Math.max(BASS_BOARD_R, BASS_PICK_R) : BASS_BOARD_R;
          ctx.fillRect(sx0, sy - (1 + (3 - s) * 0.45), sx1 - sx0, 2 + (3 - s) * 0.9);
          for (c = 0; c < BASS_COLS; c++) {
            var nm = bassName(BASS_STRINGS[s][0] + bassFretOf(prefs.pos, c), names);
            if (nm) { r = bassCellRect(s, c); text(ctx, nm, r.x + r.w / 2, sy - rh * 0.3, 7, lit[BASS_STRINGS[s][0] + bassFretOf(prefs.pos, c)] ? "#ffffff" : "rgba(255,255,255,0.6)"); }
          }
        }
        // 弦の名前・フレットの番号
        // §271: よこ向きは弦の名前を小さく・フレットの番号は板の下
        for (s = 0; s < BASS_STRINGS.length; s++) { if (BASS_LAND) { text(ctx, BASS_STRINGS[s][1], BASS_MIRROR ? W - 5.5 : 5.5, top + (s + 0.5) * rh, 10, "#ffd166"); } else { hudText(ctx, BASS_STRINGS[s][1], 1, top + (s + 0.5) * rh - rh * 0.3, "left"); } }
        for (c = 0; c < BASS_COLS; c++) { var fn = bassFretOf(prefs.pos, c); text(ctx, fn === 0 ? "開放" : String(fn), bassColX(c) + cw / 2, numY, 8, "#adb5bd"); }
      }
      // §259: パターンのマスの段（いまのマスが光る・拍の頭に印）
      function drawSteps(ctx) {
        var pt = pe ? pe.pt : pat.d[2], L = pt.length, cw = (W - 8) / L, cur = pat ? patCell() : -1, per = L / meter, i;
        for (i = 0; i < L; i++) {
          var c = pt.charAt(i), x = 4 + i * cw, on = i === cur;
          ctx.fillStyle = on ? "#ffd166" : (flash["s" + i] > 0 ? "#fff3b0" : (c === "-" ? "#1f2a44" : (pe ? "#4c3a8f" : "#2f4a6e")));
          ctx.fillRect(x + 1, BASS_STEP_Y, cw - 2, BASS_STEP_H);
          if (i % per === 0) { ctx.fillStyle = "#adb5bd"; ctx.fillRect(x + 1, BASS_STEP_Y + BASS_STEP_H + 1, cw - 2, 2); }
          if (c !== "-") { text(ctx, BASS_TOK_SHOW[c] || c, x + cw / 2, BASS_STEP_Y + BASS_STEP_H / 2, L > 12 ? 8 : 10, on ? "#14213d" : "#ffffff"); }
        }
      }
      function drawChords(ctx) {
        var i, si = songIdx(), cp = pat && !pat.back ? bassCprog(prefs.cprog) : null;
        // §263: 進行の次のコード（枠が光る）
        var nxD = pend && pend.d !== undefined ? pend.d : (cp ? bassCprogAt(cp, Math.max(0, (now() - pat.t0) * bpm / 60), meter).next : -1);
        // §255: 伴奏があるときは、上の段に「いまのコード・次のコード3つ」
        for (i = 0; si >= 0 && i < 4; i++) {
          var sr = { x: 4 + i * (W - 8) / 4 + 1, y: BASS_CHORD_Y, w: (W - 8) / 4 - 2, h: BASS_CHORD_H }, sc = back.chords[si + i];
          if (!sc) { continue; }
          ctx.fillStyle = i === 0 ? "#ffd166" : "#2f4a6e";
          ctx.fillRect(sr.x, sr.y, sr.w, sr.h);
          text(ctx, (i === 1 ? "次 " : "") + sc.name, sr.x + sr.w / 2, sr.y + sr.h / 2, i === 0 ? 14 : 10, i === 0 ? "#14213d" : "#ffffff");
        }
        for (i = 0; si < 0 && i < 7; i++) {
          var cr = bassChordRect(i), cur = i === chordD;
          ctx.fillStyle = cur ? "#ffd166" : (flash["c" + i] > 0 ? "#fff3b0" : "#2f4a6e");
          ctx.fillRect(cr.x, cr.y, cr.w, cr.h);
          if (i === nxD && i !== chordD) { ctx.strokeStyle = "#ff922b"; ctx.lineWidth = 2; ctx.strokeRect(cr.x + 1, cr.y + 1, cr.w - 2, cr.h - 2); ctx.lineWidth = 1; }
          var dc = bassChord(prefs.key, i, prefs.scale, prefs.sev);
          if (!BASS_LAND) { text(ctx, dc.deg, cr.x + cr.w / 2, cr.y + 8, dc.deg.length > 5 ? 6 : 7, cur ? "#14213d" : "#adb5bd"); }
          text(ctx, dc.name, cr.x + cr.w / 2, cr.y + cr.h / 2 + (BASS_LAND ? 0 : 4), dc.name.length > 5 ? 7 : (dc.name.length > 4 ? 8 : 10), cur ? "#14213d" : "#ffffff");
        }
      }
      function drawPads(ctx) {
        var ch = curChord(), lit = litNotes(), i, on = {}, k;
        for (k in padHeld) { if (padHeld.hasOwnProperty(k)) { on[padHeld[k]] = true; } }
        drawChords(ctx);
        if (pat || pe) { drawSteps(ctx); }
        var n = prefs.padN, big = n === 16;
        for (i = 0; i < n; i++) {
          var r = bassPadRect(i, n, padTop()), pd = prefs.pads[i], m = bassPadNote(ch, pd), hot = on[i] || flash["p" + i] > 0 || lit[m] === "play";
          ctx.fillStyle = hot ? "#ffd166" : (pd[0] === 0 && !pd[2] ? "#6c4a9e" : "#4c3a8f");
          ctx.fillRect(r.x, r.y, r.w, r.h);
          ctx.strokeStyle = "#7d6bd6";
          ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
          if (ed && ed.sel === i) { ctx.strokeStyle = "#ffd166"; ctx.lineWidth = 3; ctx.strokeRect(r.x + 1.5, r.y + 1.5, r.w - 3, r.h - 3); ctx.lineWidth = 1; }
          // §271: よこ向きは度数と音名を横にならべる
          text(ctx, bassPadLabel(pd), r.x + r.w / 2 - (BASS_LAND ? r.w * 0.15 : 0), r.y + r.h / 2 - (BASS_LAND ? 0 : (big ? 6 : 8)), big ? 14 : 18, hot ? "#14213d" : "#ffffff");
          text(ctx, bassName(m, names === "none" ? "cde" : names), r.x + r.w / 2 + (BASS_LAND ? r.w * 0.2 : 0), r.y + r.h / 2 + (BASS_LAND ? 0 : (big ? 10 : 14)), big ? 8 : 9, hot ? "#14213d" : "#d6ccff");
        }
      }

      return {
        input: function (a, down) {
          if (/^p\d+$/.test(a)) {
            if (view !== "pad") { return; }
            if (down) { padPress("k" + a, Number(a.substring(1))); } else { delete padHeld["k" + a]; noteOff("k" + a); }
            return;
          }
          if (/^c\d$/.test(a)) { if (down && (view === "pad" || pat)) { setChord(Number(a.substring(1))); } return; }
          if (down && !ended) { action(a); }
        },
        pointer: function (type, x, y, id) {
          var pid = "p" + (id === undefined ? 0 : id);
          if (type === "down") {
            // §265: 編集中はマスの段のタップでマスを変える
            if (stepAt(x, y) >= 0) { peTap(stepAt(x, y)); return; }
            if (view === "pad") {
              var d = bassChordAt(x, y);
              if (d >= 0) { setChord(d); return; }
              padPress(pid, bassPadAt(x, y, prefs.padN, padTop()));
              return;
            }
            // §259: パターン中はフレットの画面にもコードの段
            if ((pat || pe) && bassChordAt(x, y) >= 0) { setChord(bassChordAt(x, y)); return; }
            var c = bassCellAt(x, y, prefs.pos);
            if (BASS_PICK) {
              // §287: 左手は押さえるだけ・右手の所で弾く
              if (c) { held[pid] = { s: c.s, f: c.f }; heldChanged(c.s, false); return; }
              var pr = bassPickRow(x, y);
              if (pr >= 0) { picks[pid] = { y: y }; if (Math.abs(y - bassRowLineY(pr)) <= bassRowH() * 0.3) { pluck(pr); } }
              return;
            }
            if (c) { noteOn(pid, c.m, c.s); }
          } else if (type === "move") {
            if (BASS_PICK && view === "fret") {
              if (picks[pid]) {
                var y0 = picks[pid].y, q, ns = BASS_STRINGS.length;
                if (y > y0) { for (q = 0; q < ns; q++) { if (bassRowLineY(q) > y0 && bassRowLineY(q) <= y) { pluck(q); } } }
                else { for (q = ns - 1; q >= 0; q--) { if (bassRowLineY(q) < y0 && bassRowLineY(q) >= y) { pluck(q); } } }
                picks[pid].y = y;
                return;
              }
              if (held[pid]) {
                var hy = bassRowLineY(held[pid].s), hc2 = Math.abs(y - hy) < bassRowH() * 0.85 ? bassCellAt(x, hy, prefs.pos) : bassCellAt(x, y, prefs.pos);
                if (!hc2 || (hc2.s === held[pid].s && hc2.f === held[pid].f)) { return; }
                var os = held[pid].s;
                held[pid] = { s: hc2.s, f: hc2.f };
                if (os !== hc2.s) { heldChanged(os, true); }
                heldChanged(hc2.s, false);
              }
              return;
            }
            // フレット: 同じ指をすべらせたら、となりのマスの音（スライド）
            if (view !== "fret" || press[pid] === undefined) { return; }
            // §258: 押さえた弦の高さの 0.85 ぶんまでは同じ弦のまま（となりの弦に少しはみ出してもスライドが切れない）
            var ps = pstr[pid], rh = bassRowH(), sy = BASS_BOARD_Y + (ps + 0.5) * rh;
            var c2 = ps >= 0 && Math.abs(y - sy) < rh * 0.85 ? bassCellAt(x, sy, prefs.pos) : bassCellAt(x, y, prefs.pos);
            if (!c2 || c2.m === press[pid]) { return; }
            // §256: 同じ弦なら、鳴らしなおさずに高さをなめらかに変える（スライド）。別の弦は鳴らしなおす
            if (c2.s === pstr[pid] && vo[pid]) {
              var sounding = vo[pid].cur === press[pid];
              press[pid] = c2.m;
              if (sounding) { recOff(pid); bend(vo[pid], c2.m, 0.07); recOn(pid, c2.m, 0.8); }
              return;
            }
            noteOn(pid, c2.m, c2.s);
          } else {
            if (picks[pid]) { delete picks[pid]; return; }
            if (held[pid]) { var hs = held[pid].s; delete held[pid]; heldChanged(hs, true); return; }
            delete padHeld[pid]; noteOff(pid);
          }
        },
        step: function () {
          frame++;
          for (var k in flash) { if (flash.hasOwnProperty(k) && flash[k] > 0) { flash[k]--; } }
          if (play) {
            var pb = playBeat(), last = 0, i;
            while (play.idx < play.notes.length && play.notes[play.idx][0] <= pb) {
              var pn = play.notes[play.idx], pv = pn[3] || 0.8;
              play.vo.push({ h: sound(pn[2], pv, howOfVel(pv, pn[2])), end: pn[0] + pn[1] });
              play.idx++;
            }
            // §256: 録った長さで止める
            for (i = play.vo.length - 1; i >= 0; i--) { if (pb >= play.vo[i].end) { hush(play.vo[i]); play.vo.splice(i, 1); } }
            for (i = 0; i < play.notes.length; i++) { last = Math.max(last, play.notes[i][0] + play.notes[i][1]); }
            if (play.idx >= play.notes.length && pb > last && !play.back) { play = null; render(); } // 伴奏といっしょなら伴奏の終わりまで
          }
          if (rec) {
            // 伴奏で録るときのカウントは、曲にカウントインがなければベースが数える（あれば曲のクリック）
            var rb = Math.floor(recBeat()), cnt = rec.back ? !back.s.lead : true;
            if (rb !== rec.beat && ((metro && rb >= 0) || (rb < 0 && cnt))) { click(((rb % meter) + meter) % meter === 0); }
            rec.beat = rb;
          }
          if (pat) { patStep(); }
          if (pat && !pat.back && prefs.drum) { drumStep(); }
          if (bk) { backStep(); }
        },
        draw: function (ctx) {
          var g = ctx.createLinearGradient ? ctx.createLinearGradient(0, 0, 0, BASS_H) : null;
          if (g) { g.addColorStop(0, "#1b1f3b"); g.addColorStop(1, "#2d1b4e"); }
          ctx.fillStyle = g || "#1b263b";
          ctx.fillRect(0, 0, W, BASS_H);
          var si = songIdx(), nx = si >= 0 ? back.chords[si + 1] : null;
          hudText(ctx, view === "pad" ? (ed ? "✏️ 編集中" : si >= 0 ? "🎸 伴奏" : "🎛️ キー " + BASS_CDE[prefs.key]) : (si >= 0 ? "🎸 " + back.chords[si].name + (nx ? " → " + nx.name : "") : (pat ? "🎼 " + patDef()[1] : "🎸 " + (prefs.pos ? prefs.pos + "フレット〜" : "開放弦〜"))), 8, ly(10, 7), "left");
          hudText(ctx, "BPM " + bpm, W - 8, ly(10, 7), "right");
          var held = [], k;
          for (k in press) { if (press.hasOwnProperty(k)) { held.push(press[k]); } }
          held.sort(function (a, b) { return a - b; });
          var line = held.map(function (m) { return bassName(m, names === "none" ? "do" : names) + "（" + bassName(m, "cde") + "）"; }).join(" ");
          if (rec) {
            var rb = recBeat();
            text(ctx, rb < 0 ? String(Math.ceil(-rb)) : "● REC " + (Math.floor(rb / meter) + 1) + "小節・" + rec.notes.length + "音", W / 2, ly(view === "pad" || pat ? 18 : 30, 7), ly(view === "pad" || pat ? 11 : 16, 8), "#ff6b6b");
          }
          if (view === "pad") {
            if (!rec) { text(ctx, line || (play ? "再生中…" : (bk ? "伴奏中…" : "コード " + curChord().name + " に合う音")), W / 2, ly(18, 7), ly(10, 7), "#ffffff"); }
            drawPads(ctx);
          } else {
            if (pat || pe) {
              // §259: コードの段・パターンのマスの段・押している音
              drawChords(ctx);
              drawSteps(ctx);
              if (line && !rec) { text(ctx, line, W / 2, ly(106, 7), ly(15, 8), "#ffd166"); }
            } else {
              if (!rec && !line && !BASS_LAND) { emojiAt(ctx, play ? "🎶" : "🦍", W / 2, 50, 34); }
              if (!rec || !BASS_LAND) { text(ctx, line || (play ? "再生中…" : (bk ? "伴奏中…（輪はいまのコードの音）" : BASS_PICK ? "左手で押さえて、右手の所で弾こう" : "弦のマスをタップして弾こう")), W / 2, ly(rec ? 62 : (line ? 60 : 92), 30), ly(line ? 20 : 12, line ? 14 : 10), line ? "#ffd166" : "#ffffff"); }
            }
            drawFret(ctx);
          }
        }
      };
    }
  });

  // ---------- §281: クイズ（📍 フレット当て・👂 度数当て）----------
  var BASS_QUIZ_N = 10, BASS_QUIZ_KINDS = [["fret", "&#x1F4CD; フレット当て"], ["ear", "&#x1F442; 度数当て"]];
  var BASS_EAR = [[7, "ルート"], [1, "3度"], [2, "5度"], [3, "7度"]]; // [コードの音の番号, 答え]
  // 度数当ての答えのボタン（2×2）
  function bassEarRect(i) { var w = (W - 24) / 2; return { x: 8 + (i % 2) * (w + 8), y: 150 + Math.floor(i / 2) * 70, w: w, h: 60 }; }
  function bassEarAt(x, y) { for (var i = 0; i < 4; i++) { var r = bassEarRect(i); if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) { return i; } } return -1; }
  var BASS_EAR_AGAIN = { x: 8, y: 96, w: W - 16, h: 40 };
  // 問題を作る（rnd: 0〜1 の乱数の関数）→ フレット: { s: 弦, f: フレット, m } / 度数: { key, d, ch, a: 答えの番号, m }
  function bassQuizMake(kind, rnd) {
    if (kind === "ear") {
      var key = Math.floor(rnd() * 12), d = Math.floor(rnd() * 7), ch = bassChord(key, d, "major", true), a = Math.floor(rnd() * 4);
      return { key: key, d: d, ch: ch, a: a, m: ch.notes[BASS_EAR[a][0]] };
    }
    var s = Math.floor(rnd() * 4), f = Math.floor(rnd() * 8);
    return { s: s, f: f, m: BASS_STRINGS[s][0] + f };
  }
  function bassQuiz(api, cfg) {
    var prefs = bassPrefs(), prog = prefs.prog, panel = api.panel, frame = 0, ended = false, msg = "", kind = cfg.kind === "ear" ? "ear" : "fret";
    bassSetLayout(false);
    if (panel && panel.classList) { panel.classList.add("quiz-panel"); }
    if (api.setCanvasHeight) { api.setCanvasHeight(BASS_H); }
    var qi = 0, q = null, t0 = 0, right = 0, fb = null, buses = {}, nm = prefs.names === "cde" ? BASS_CDE : BASS_DO;
    var UG = window.UGMelody, audioOk = false;
    function now() { return frame / 60; }
    function audio() {
      if (audioOk || !UG || !UG.audioInit) { return; }
      try { if (UG.audioInit()) { audioOk = true; UG.loadSamples([prog]); } } catch (e) {}
    }
    function sound(m, when, len) {
      audio();
      if (!audioOk) { return; }
      var bus = bassBus(buses, "b", prefs.bvol, prefs.phone), ac = UG.audio.ctx, t = ac.currentTime + (when || 0);
      try { var h = UG.synth(m, prog, t, 0.85, bus ? bassVoiceOut(bus, 0.85, prog) : undefined, BASS_HOLD); if (h && UG.voiceStop) { UG.voiceStop(h, t + (len || 0.6), 0.05); } } catch (e) {}
    }
    function ask() { if (kind === "ear") { sound(q.ch.notes[0], 0, 0.6); sound(q.m, 0.75, 0.8); } }
    function next() {
      fb = null;
      if (qi >= BASS_QUIZ_N) { finish(); return; }
      q = bassQuizMake(kind, Math.random);
      qi++;
      t0 = now();
      ask();
      render();
    }
    function answer(okv, m) {
      if (ended || fb || !q) { return; }
      if (m !== undefined) { sound(m, 0, 0.5); }
      if (okv) { right++; api.addScore(100 + Math.max(0, Math.round(50 - (now() - t0) * 10))); }
      fb = { ok: okv, t: now(), m: m };
      render();
    }
    function finish() {
      if (ended) { return; }
      ended = true;
      var best = bassBest(), key = "quiz@" + kind, sc = api.getScore();
      if (!best[key] || !(best[key].s >= sc)) { best[key] = { s: sc, c: right }; lsSet(BASS_BEST_KEY, best); }
      msg = BASS_QUIZ_N + "問中 <b>" + right + "問</b> 正解" + (right === BASS_QUIZ_N ? "・&#x1F389; ぜんぶ正解！" : "");
      render();
      api.gameOver(right + " / " + BASS_QUIZ_N);
    }
    function qText() {
      if (!q) { return ""; }
      return kind === "ear" ? "ルートのあとの音は何度？" : BASS_STRINGS[q.s][1] + "弦で「" + nm[bassPc(q.m)] + "」を押そう";
    }
    function render() {
      if (!panel) { return; }
      panel.innerHTML = '<p class="small" style="margin:4px 0 0;">' + BASS_QUIZ_KINDS[kind === "ear" ? 1 : 0][1] + '（' + Math.min(qi, BASS_QUIZ_N) + ' / ' + BASS_QUIZ_N + '問・正解 ' + right + '）</p>' +
        '<p class="small" style="margin:4px 0 0;">' + (kind === "ear" ? "ルートの音のあとに鳴る音が、コードの何度の音かを当てよう（キー 1〜4 でも答えられます）" : "言われた弦の、その音のマスをタップ（開放弦〜7フレット）。早く答えるとボーナス") + '</p>' +
        (msg ? '<p class="small" style="margin:4px 0 0;color:#ffd166;">' + msg + '</p>' : "");
    }
    function text(ctx, s, x, y, size, color) { ctx.fillStyle = color; ctx.font = "bold " + size + "px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(s, x, y); }
    function drawBoard(ctx) {
      var cw = bassColW(), rh = bassRowH(), top = BASS_BOARD_Y, bot = top + rh * 4, s, c, r;
      ctx.fillStyle = "#5b3a24";
      ctx.fillRect(BASS_BOARD_X, top, cw * BASS_COLS, bot - top);
      for (c = 0; c < BASS_COLS; c++) {
        if (BASS_MARKS.indexOf(c) >= 0) { ctx.fillStyle = "#e8d8b8"; ctx.beginPath(); ctx.arc(BASS_BOARD_X + (c + 0.5) * cw, top + rh * 2, 3.5, 0, Math.PI * 2); ctx.fill(); }
        if (c > 0) { ctx.fillStyle = c === 1 ? "#f5f0e6" : "#b8b8b8"; ctx.fillRect(BASS_BOARD_X + c * cw - (c === 1 ? 2 : 0.75), top, c === 1 ? 4 : 1.5, bot - top); }
        text(ctx, c === 0 ? "開放" : String(c), BASS_BOARD_X + (c + 0.5) * cw, top - 7, 8, "#adb5bd");
      }
      for (s = 0; s < 4; s++) {
        var sy = top + (s + 0.5) * rh;
        ctx.fillStyle = q && kind === "fret" && q.s === s && !fb ? "#ffd166" : "#d9d9d9";
        ctx.fillRect(BASS_BOARD_X, sy - (1 + (3 - s) * 0.45), cw * BASS_COLS, 2 + (3 - s) * 0.9);
        hudText(ctx, BASS_STRINGS[s][1], 1, sy - rh * 0.3, "left");
      }
      if (fb && q) {
        r = bassCellRect(q.s, q.f);
        ctx.fillStyle = "#51cf66"; ctx.beginPath(); ctx.arc(r.x + r.w / 2, r.y + r.h / 2, Math.min(r.w, r.h) * 0.36, 0, Math.PI * 2); ctx.fill();
        text(ctx, nm[bassPc(q.m)], r.x + r.w / 2, r.y + r.h / 2, 10, "#14213d");
        if (!fb.ok && fb.cell) {
          r = bassCellRect(fb.cell.s, fb.cell.c);
          ctx.strokeStyle = "#ff6b6b"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(r.x + r.w / 2, r.y + r.h / 2, Math.min(r.w, r.h) * 0.36, 0, Math.PI * 2); ctx.stroke(); ctx.lineWidth = 1;
        }
      }
    }
    function drawEar(ctx) {
      var r = BASS_EAR_AGAIN, i;
      ctx.fillStyle = "#2f4a6e"; ctx.fillRect(r.x, r.y, r.w, r.h);
      text(ctx, "🔁 もう一度聞く", r.x + r.w / 2, r.y + r.h / 2, 14, "#ffffff");
      for (i = 0; i < 4; i++) {
        r = bassEarRect(i);
        var col = "#3a4a7a";
        if (fb && q && i === q.a) { col = "#2b8a3e"; } else if (fb && !fb.ok && i === fb.pick) { col = "#c92a2a"; }
        ctx.fillStyle = col; ctx.fillRect(r.x, r.y, r.w, r.h);
        text(ctx, BASS_EAR[i][1], r.x + r.w / 2, r.y + r.h / 2 - 6, 18, "#ffffff");
        text(ctx, String(i + 1), r.x + r.w / 2, r.y + r.h - 10, 9, "#adb5bd");
      }
    }
    var started = false;
    function start() { if (!started) { started = true; audio(); next(); } }
    function earPick(i) {
      if (!q || i < 0) { return; }
      answer(i === q.a);
      if (fb) { fb.pick = i; }
    }
    return {
      input: function (a, down) {
        if (!down) { return; }
        if (!started) { start(); return; }
        if (kind === "ear" && /^c[0-3]$/.test(a)) { earPick(Number(a.charAt(1))); }
      },
      pointer: function (type, x, y) {
        if (type !== "down") { return; }
        if (!started) { start(); return; }
        if (kind === "ear") {
          var r = BASS_EAR_AGAIN;
          if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) { if (!fb) { ask(); } return; }
          earPick(bassEarAt(x, y));
          return;
        }
        var cell = bassCellAt(x, y, 0);
        if (!cell || !q || fb) { return; }
        answer(cell.s === q.s && cell.m === q.m, cell.m);
        if (fb) { fb.cell = cell; }
      },
      step: function () {
        frame++;
        if (ended) { return; }
        if (fb && now() - fb.t > (fb.ok ? 0.8 : 1.6)) { next(); }
      },
      draw: function (ctx) {
        ctx.fillStyle = "#1b1f3b";
        ctx.fillRect(0, 0, W, BASS_H);
        hudText(ctx, BASS_QUIZ_KINDS[kind === "ear" ? 1 : 0][1].replace(/&#x[0-9A-F]+; /, "") + " " + Math.min(qi, BASS_QUIZ_N) + "/" + BASS_QUIZ_N, 8, 10, "left");
        hudText(ctx, "正解 " + right, W - 8, 10, "right");
        if (!started) { text(ctx, "タップ（どのキーでも）ではじめる", W / 2, 60, 14, "#ffffff"); }
        else if (q && !ended) {
          text(ctx, qText(), W / 2, kind === "ear" ? 34 : 50, kind === "ear" ? 15 : 17, "#ffd166");
          if (kind === "ear") { text(ctx, "キー " + BASS_CDE[q.key] + "・コード " + q.ch.name, W / 2, 54, 11, "#adb5bd"); }
        }
        if (fb) { text(ctx, fb.ok ? "⭕ 正解！" : "❌ " + (kind === "ear" ? "答えは " + BASS_EAR[q.a][1] : "ここ（緑）"), W / 2, kind === "ear" ? 70 : 88, 16, fb.ok ? "#51cf66" : "#ff6b6b"); }
        if (ended) { text(ctx, right + " / " + BASS_QUIZ_N + " 問正解", W / 2, 60, 22, "#ffd166"); }
        if (kind === "ear") { drawEar(ctx); } else { drawBoard(ctx); }
      }
    };
  }

  window.UGBass = {
    STRINGS: BASS_STRINGS, COLS: BASS_COLS, POS_MAX: BASS_POS_MAX, H: BASS_H, VOICES: BASS_VOICES, VIEWS: BASS_VIEWS, PAD_DEFS: BASS_PAD_DEFS, PAD_Y: BASS_PAD_Y, PAD_Y_PAT: BASS_PAD_Y_PAT, patLegend: bassPatLegend, patGroups: bassPatGroups, myClean: bassMyClean, vol: bassVol, bus: bassBus, setPick: bassSetPick, pickRow: bassPickRow, rowLineY: bassRowLineY, colX: bassColX,
    geom: function () { return { PICK_X: BASS_PICK_X, PICK_R: BASS_PICK_R, BOARD_X: BASS_BOARD_X, BOARD_R: BASS_BOARD_R, BOARD_Y: BASS_BOARD_Y, BOARD_BOT: BASS_BOARD_BOT, COLS: BASS_COLS, H: BASS_H, MIRROR: BASS_MIRROR }; },
    grip: bassGrip, gripStep: bassGripStep, gripBox: bassGripBox, gripRows: bassGripRows, GRIP_KEY: BASS_GRIP_KEY, approach: bassApproach, fillTok: bassFillTok, RAMPS: BASS_RAMPS, tendency: bassTendency, rank: bassRank, rjudge: bassRJudge, quizMake: bassQuizMake, EAR: BASS_EAR, earRect: bassEarRect, QUIZ_N: BASS_QUIZ_N, METRO_ICON: BASS_METRO_ICON, SWINGS: BASS_SWINGS, CPROG_GROUPS: BASS_CPROG_GROUPS, SCALE_GROUPS: BASS_SCALE_GROUPS, ENH: BASS_ENH, setLayout: bassSetLayout, landH: bassLandH, SONGS: BASS_SONGS, chart: bassChart, laneOf: bassLaneOf, BEST_KEY: BASS_BEST_KEY, JUDGE: BASS_JUDGE, swingOf: bassSwingOf, accOf: bassAccOf, patResize: bassPatResize, MYPATS_KEY: BASS_MYPATS_KEY, PAD_MAX: BASS_PAD_MAX, HOLD: BASS_HOLD, KEYS: BASS_KEYS, padLabel: bassPadLabel, padNote: bassPadNote, padsClean: bassPadsClean,
    cellAt: bassCellAt, cellRect: bassCellRect, name: bassName, chord: bassChord, SCALES: BASS_SCALES, scale: bassScale, scalePcs: bassScalePcs, CPROGS: BASS_CPROGS, cprog: bassCprog, cprogAt: bassCprogAt, padRect: bassPadRect, padAt: bassPadAt, chordRect: bassChordRect, chordAt: bassChordAt,
    prefs: bassPrefs, notesClean: bassNotesClean, takesLoad: bassTakesLoad, takesSave: bassTakesSave, takeAdd: bassTakeAdd, takeById: bassTakeById, toSeqNotes: bassToSeqNotes,
    sendToSeq: bassSendToSeq, patterns: bassPatterns, patById: bassPatById, tokNote: bassTokNote, tokLen: bassTokLen, patToSeq: bassPatToSeq, songChord: bassSongChord, songChords: bassSongChords, chordIdx: bassChordIdx, backList: bassBackList, backing: bassBacking, backEventOn: bassBackEventOn, PREFS_KEY: BASS_PREFS_KEY, TAKES_KEY: BASS_TAKES_KEY, TAKES_MAX: BASS_TAKES_MAX
  };
})();
