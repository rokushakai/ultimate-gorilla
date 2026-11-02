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
  var BASS_COLS = 8, BASS_POS_MAX = 12, BASS_BOARD_Y = 128, BASS_BOARD_X = 4;
  var BASS_MARKS = [3, 5, 7, 9, 12, 15, 17]; // フレットの印（12 は2つ）
  function bassColW() { return (W - BASS_BOARD_X * 2) / BASS_COLS; }
  function bassRowH() { return (BASS_H - BASS_BOARD_Y - 6) / BASS_STRINGS.length; }
  // マス（弦 s・列 c）の四角
  function bassCellRect(s, c) { var cw = bassColW(), rh = bassRowH(); return { x: BASS_BOARD_X + c * cw, y: BASS_BOARD_Y + s * rh, w: cw, h: rh }; }
  // 列 c のフレット（ポジション pos から）
  function bassFretOf(pos, c) { return pos + c; }
  // 座標 → { s: 弦, c: 列, f: フレット, m: MIDI }。フレットの外なら null
  function bassCellAt(x, y, pos) {
    var cw = bassColW(), rh = bassRowH(), c = Math.floor((x - BASS_BOARD_X) / cw), s = Math.floor((y - BASS_BOARD_Y) / rh);
    if (c < 0 || c >= BASS_COLS || s < 0 || s >= BASS_STRINGS.length || y < BASS_BOARD_Y) { return null; }
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
  function bassTriad(sc, d) {
    function at(k) { return sc[(d + k) % 7] + Math.floor((d + k) / 7) * 12 - sc[d]; }
    var t = at(2), f = at(4), q = t === 4 ? (f === 8 ? "aug" : (f === 6 ? "(♭5)" : "")) : (f === 6 ? "dim" : "m"), dd = sc[d] - BASS_SCALE[d];
    var rm = t === 3 ? BASS_ROMAN[d].toLowerCase() : BASS_ROMAN[d];
    return { q: q, deg: (dd < 0 ? "♭" : (dd > 0 ? "♯" : "")) + rm + (q === "dim" ? "°" : (q === "aug" ? "+" : "")) };
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
  function bassChord(key, d, scale) {
    var sc = bassScale(scale)[2], rootPc = (key + sc[d]) % 12, root = 28 + ((rootPc - 4 + 12) % 12), iv = [], notes = [], i, tr = bassTriad(sc, d);
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
  function bassPatterns(meter) {
    var m3 = meter === 3, U = window.UGUkulele, st = U && U.BASS_STEPS ? U.BASS_STEPS : [], i;
    var out = [["root", "ルート（伸ばす）", m3 ? "R-----" : "R-------", meter], ["root8", "ルート8分", m3 ? "RRRRRR" : "RRRRRRRR", meter],
      ["r5", "ルートと5度", m3 ? "R-5-R-" : "R-5-R-5-", meter], ["walk", "ウォーキング", m3 ? "R-3-A-" : "R-3-5-A-", meter]];
    for (i = 0; i < st.length; i++) { if ((st[i][3] || 4) === meter) { out.push([st[i][0], st[i][1], st[i][2], meter]); } }
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
    for (i = 0; i < BASS_PAT_GROUPS.length; i++) { out.push([BASS_PAT_GROUPS[i][0], []]); }
    for (k = 0; k < list.length; k++) {
      var gi = -1;
      for (j = 0; j < BASS_PAT_GROUPS.length && list[k][3] !== 3; j++) { if (BASS_PAT_GROUPS[j][1].indexOf(list[k][0]) >= 0) { gi = j; } }
      if (gi >= 0) { out[gi][1].push(list[k]); } else { rest.push(list[k]); }
    }
    out.push([list.length && list[0][3] === 3 ? "3拍子" : "分散・そのほか", rest]);
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
      key: key >= 0 && key <= 11 ? key : 0, scale: bassScale(p.scale)[0], cprog: bassCprog(p.cprog) ? p.cprog : "",
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
    help: "フレット・パッドをタップ（同じ弦ですべらせるとスライド・押さえたまま上をタップでハンマリング）/ パッドは Q W E R・A S D F（16個は Y U I O・H J K L も）、✏️ でパッドの音を変えられる、コードは 1〜7 / T 奏法 / B パターン / Z 録音 / X 再生 / P一時停止",
    controls: [],
    keys: BASS_KEYS,
    setup: bassSetup,
    setupLabel: "音色・テイク",
    panel: true,
    create: function (api, cfg) {
      cfg = cfg || {};
      var prefs = bassPrefs(), view = prefs.view, prog = prefs.prog, names = prefs.names;
      var frame = 0, press = {}, ended = false, msg = "", flash = {}, chordD = 0;
      var panel = api.panel;
      if (panel && panel.classList) { panel.classList.add("quiz-panel"); }
      if (api.setCanvasHeight) { api.setCanvasHeight(BASS_H); }
      function now() { return frame / 60; }

      // --- 音 ---
      var UG = window.UGMelody, audioOk = false;
      function audio() {
        if (audioOk || !UG || !UG.audioInit) { return; }
        try { if (UG.audioInit()) { audioOk = true; UG.loadSamples([prog]); } } catch (e) {}
      }
      // §256: how ＝ 奏法の音 "thumb" / "pop" / "ghost"（なしは ""）→ 音のハンドル（音が出せなければ null）
      // when（省略可）: 鳴らす時刻（AudioContext の秒）
      function sound(m, lv, how, when) {
        audio();
        if (!audioOk) { return null; }
        var h = null;
        try {
          h = UG.synth(m, prog, when || 0, how === "ghost" ? 0.45 : (lv || 0.85), undefined, how === "ghost" ? 0 : BASS_HOLD) || null;
          if (how && UG.bassHit) { UG.bassHit(how, when || 0, how === "ghost" ? 0.6 : 1); }
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
      function curChord() { var k = songIdx(); return k >= 0 ? back.chords[k].ch : bassChord(prefs.key, chordD, prefs.scale); }
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
      function patDef() { return bassPatById(bassPatterns(meter), prefs.pat); }
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
      function padTop() { return pat ? BASS_PAD_Y_PAT : BASS_PAD_Y; }
      // いま鳴っているパターンのマス（まだなら -1）
      function patCell() {
        if (!pat) { return -1; }
        var b = pat.back ? backBeat() : (now() - pat.t0) * bpm / 60;
        return b < 0 ? -1 : Math.floor(b / pat.unit + 1e-6) % pat.d[2].length;
      }
      function patStop() { if (!pat) { return; } hush(pat.vo); pat = null; }
      function patToggle() {
        if (pat) { patStop(); } else { if (play) { playStop(); } patStart(); }
        render();
      }
      // 0.1秒先までのマスを予約して鳴らす
      function patStep() {
        var d = pat.d, pt = d[2], unit = pat.unit, ac = audioOk && UG.audio ? UG.audio.ctx : null, spb = pat.back ? back.s.spb : 60 / bpm, n = 0;
        while (pat && n++ < 16) {
          var b = pat.k * unit, tt = patTime(b), dt = tt - now();
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
          if (c !== "-") { pat.lastCh = ch.name; }
          if (c === "-" || dt < -0.05) { continue; }
          var m = bassTokNote(c, ch, next ? next.ch : null, left), len = bassTokLen(pt, ci) * unit, how = techOf(m, -1);
          var when = ac ? ac.currentTime + Math.max(0, dt) : 0;
          if (pat.vo && pat.vo.h && UG.voiceStop) { try { UG.voiceStop(pat.vo.h, when, 0.03); } catch (e) {} }
          pat.vo = { h: sound(m, 0.8, how, when), cur: m };
          if (pat.vo.h && UG.voiceStop && how !== "ghost") { try { UG.voiceStop(pat.vo.h, when + len * spb * 0.92, 0.04); } catch (e2) {} }
          pat.lit = { m: m, t0: tt, t1: tt + len * spb };
          if (pat.rec && rec && b >= 0 && rec.notes.length < BASS_NOTES_MAX) {
            var nt = [r3(b), r3(len), m], v = velOf(how);
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
      function allOff() { var ks = [], k; for (k in press) { if (press.hasOwnProperty(k)) { ks.push(k); } } for (k = 0; k < ks.length; k++) { noteOff(ks[k]); } }
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
        chordD = d; flash["c" + d] = 10;
        // §263: 進行を鳴らしているときに自分でえらぶと「コード進行なし」にもどる
        if (prefs.cprog && pat) { prefs.cprog = ""; bassSavePrefs(prefs); render(); }
      }
      function setTech(t) { prefs.tech = t; bassSavePrefs(prefs); render(); }
      function action(v) {
        if (v === "rec") { recToggle(); } else if (v === "play") { playToggle(); } else if (v === "back") { backToggle(); }
        else if (v === "view") { allOff(); padHeld = {}; view = view === "pad" ? "fret" : "pad"; prefs.view = view; bassSavePrefs(prefs); render(); }
        else if (v === "posdown" || v === "posup") {
          allOff();
          prefs.pos = Math.max(0, Math.min(BASS_POS_MAX, prefs.pos + (v === "posup" ? 1 : -1)));
          bassSavePrefs(prefs);
          render();
        }
        else if (v === "keydown" || v === "keyup") {
          allOff(); padHeld = {};
          prefs.key = (prefs.key + (v === "keyup" ? 1 : 11)) % 12;
          bassSavePrefs(prefs);
          render();
        }
        else if (/^scale:/.test(v)) {
          // §262: スケールをえらぶ（知らない id は無視）
          if (bassScale(v.substring(6))[0] !== v.substring(6)) { return; }
          allOff(); padHeld = {};
          prefs.scale = v.substring(6);
          bassSavePrefs(prefs);
          render();
        }
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
      function cprogOptions() {
        var h = '<option value=""' + (prefs.cprog ? "" : " selected") + '>コード進行なし（上の段をタップ）</option>', i, j;
        for (i = 0; i < BASS_CPROG_GROUPS.length; i++) {
          h += '<optgroup label="' + BASS_CPROG_GROUPS[i][0] + '">';
          for (j = 0; j < BASS_CPROG_GROUPS[i][1].length; j++) { var cp = bassCprog(BASS_CPROG_GROUPS[i][1][j]); h += '<option value="' + cp[0] + '"' + (cp[0] === prefs.cprog ? " selected" : "") + '>' + cp[1] + '</option>'; }
          h += '</optgroup>';
        }
        return h;
      }
      function scaleOptions() {
        var h = "", i, j;
        for (i = 0; i < BASS_SCALE_GROUPS.length; i++) {
          h += '<optgroup label="' + BASS_SCALE_GROUPS[i][0] + '">';
          for (j = 0; j < BASS_SCALE_GROUPS[i][1].length; j++) { var sc = bassScale(BASS_SCALE_GROUPS[i][1][j]); h += '<option value="' + sc[0] + '"' + (sc[0] === prefs.scale ? " selected" : "") + '>' + sc[1] + '</option>'; }
          h += '</optgroup>';
        }
        return h;
      }
      function render() {
        if (!panel) { return; }
        var html = '<div class="piano-row"><button class="modal-btn' + (rec ? " piano-rec-on" : "") + '" data-ba="rec">' + (rec ? "&#x23F9;&#xFE0F; 録音をとめる" : (back ? "&#x1F534; 合わせて録音" : "&#x1F534; 録音")) + '</button>' +
          '<button class="modal-btn" data-ba="play"' + (rec ? " disabled" : "") + '>' + (play ? "&#x23F9;&#xFE0F; とめる" : (back ? "&#x25B6;&#xFE0F; テイク＋伴奏" : "&#x25B6;&#xFE0F; 再生")) + '</button></div>';
        if (back) {
          html += '<div class="piano-row"><button class="modal-btn" data-ba="back"' + (rec ? " disabled" : "") + '>' + (bk && !play && !rec ? "&#x23F9;&#xFE0F; 伴奏をとめる" : "&#x1F3B8; 伴奏だけ鳴らす") + '</button>' +
            '<button class="modal-btn" data-ba="metro">&#x1F941; ' + (metro ? "ON" : "OFF") + '</button></div>' +
            '<p class="small" style="margin:4px 0 0;">&#x1F3B8; 伴奏: ' + escHtml(back.name) + '（BPM ' + back.seq.bpm + '・' + back.seq.meter + '拍子' + (prefs.backBass ? "" : "・曲のベースは鳴らさない") + '）</p>';
        } else {
          html += '<div class="piano-row"><button class="modal-btn" data-ba="bpmdown">&minus;</button><span>BPM ' + bpm + '</span><button class="modal-btn" data-ba="bpmup">&#xFF0B;</button>' +
            '<button class="modal-btn" data-ba="metro">&#x1F941; ' + (metro ? "ON" : "OFF") + '</button></div>';
        }
        if (view === "fret") {
          html += '<div class="piano-row"><button class="modal-btn" data-ba="posdown">&#x25C0;</button><span>' + (prefs.pos ? prefs.pos + "〜" + (prefs.pos + BASS_COLS - 1) + " フレット" : "開放弦〜7 フレット") + '</span>' +
            '<button class="modal-btn" data-ba="posup">&#x25B6;</button></div>';
        }
        // §262: キーとスケール（フレットの画面でも）
        if (!back) {
          html += '<div class="piano-row"><button class="modal-btn" data-ba="keydown">&#x25C0;</button><span>キー ' + BASS_CDE[prefs.key] + '</span>' +
            '<button class="modal-btn" data-ba="keyup">&#x25B6;</button></div>' +
            '<div class="piano-row"><label class="piano-select">&#x1F3B5; <select data-bscale="1">' + scaleOptions() + '</select></label></div>' +
            (view === "fret" ? '<p class="small" style="margin:4px 0 0;">マスの下の点: スケールの音（白い大きな点は主音・<span style="color:#f783ac;">●</span> 特徴音 ' + bassScale(prefs.scale)[4] + '）</p>' : "") +
            '<div class="piano-row"><label class="piano-select">&#x1F501; <select data-bcprog="1">' + cprogOptions() + '</select></label></div>';
        }
        if (view === "pad") {
          html += '<div class="piano-row"><button class="modal-btn' + (ed ? " piano-rec-on" : "") + '" data-ba="edit">' + (ed ? "&#x2705; 編集おわり" : "&#x270F;&#xFE0F; パッドの音を変える") + '</button>' +
            '<button class="modal-btn" data-ba="padn">' + (prefs.padN === 16 ? "8個にする" : "16個にする") + '</button></div>';
        }
        if (ed && view === "pad") { html += padEditor(); }
        else {
          html += '<div class="piano-row"><button class="modal-btn" data-ba="patprev">&#x25C0;</button><span>&#x1F3BC; ' + patDef()[1] + '</span><button class="modal-btn" data-ba="patnext">&#x25B6;</button></div>' +
            '<div class="piano-row"><label class="piano-select">&#x1F4DA; <select data-bpat="1">' + patOptions() + '</select></label></div>' +
            '<div class="piano-row"><button class="modal-btn' + (pat ? " piano-rec-on" : "") + '" data-ba="pat">' + (pat ? "&#x23F9;&#xFE0F; パターン" : "&#x25B6;&#xFE0F; パターン") + '</button>' +
            '<button class="modal-btn" data-ba="patseq">&#x1F3BC; シーケンサーのベースに</button></div>';
          // §259: パターンの説明と文字の意味
          html += '<p class="small" style="margin:4px 0 0;">' + (pat ? "" : "&#x25B6;&#xFE0F; パターンを押すと、いまのコードに合わせてベースが自動で鳴ります。" +
            (back ? "コードは曲に合わせて変わります。" : (prefs.cprog ? "コードは進行どおり1小節ごとに変わります。" : "上の段のコードをタップすると、次の音から変わります。")) + "<br>") +
            "&#x1F3BC; " + escHtml(patDef()[2]) + "（" + escHtml(bassPatLegend(patDef()[2])) + "）</p>";
          html += '<div class="piano-row">';
          for (i = 0; i < BASS_TECHS.length; i++) { html += '<button class="modal-btn' + (prefs.tech === BASS_TECHS[i][0] ? " piano-rec-on" : "") + '" data-ba="tech:' + BASS_TECHS[i][0] + '">' + BASS_TECHS[i][1] + '</button>'; }
          html += '</div>';
        }
        html += '<div class="piano-row"><button class="modal-btn" data-ba="view">' + (view === "pad" ? "&#x1F3B8; フレットにする" : "&#x1F39B;&#xFE0F; パッドにする") + '</button></div>';
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
        return out;
      }
      function text(ctx, s, x, y, size, color) {
        ctx.fillStyle = color;
        ctx.font = "bold " + size + "px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(s, x, y);
      }
      function drawFret(ctx) {
        var lit = litNotes(), s, c, r, cw = bassColW(), rh = bassRowH(), top = BASS_BOARD_Y, bot = BASS_BOARD_Y + rh * BASS_STRINGS.length;
        ctx.fillStyle = "#5b3a24";
        ctx.fillRect(BASS_BOARD_X, top, cw * BASS_COLS, bot - top);
        // フレットの印
        for (c = 0; c < BASS_COLS; c++) {
          var f = bassFretOf(prefs.pos, c), cx = BASS_BOARD_X + (c + 0.5) * cw;
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
          ctx.fillRect(BASS_BOARD_X + c * cw - (c === 1 && prefs.pos === 0 ? 2 : 0.75), top, c === 1 && prefs.pos === 0 ? 4 : 1.5, bot - top);
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
          ctx.fillStyle = "#d9d9d9";
          ctx.fillRect(BASS_BOARD_X, sy - (1 + (3 - s) * 0.45), cw * BASS_COLS, 2 + (3 - s) * 0.9);
          for (c = 0; c < BASS_COLS; c++) {
            var nm = bassName(BASS_STRINGS[s][0] + bassFretOf(prefs.pos, c), names);
            if (nm) { r = bassCellRect(s, c); text(ctx, nm, r.x + r.w / 2, sy - rh * 0.3, 7, lit[BASS_STRINGS[s][0] + bassFretOf(prefs.pos, c)] ? "#ffffff" : "rgba(255,255,255,0.6)"); }
          }
        }
        // 弦の名前・フレットの番号
        for (s = 0; s < BASS_STRINGS.length; s++) { hudText(ctx, BASS_STRINGS[s][1], 1, top + (s + 0.5) * rh - rh * 0.3, "left"); }
        for (c = 0; c < BASS_COLS; c++) { var fn = bassFretOf(prefs.pos, c); text(ctx, fn === 0 ? "開放" : String(fn), BASS_BOARD_X + (c + 0.5) * cw, top - 7, 8, "#adb5bd"); }
      }
      // §259: パターンのマスの段（いまのマスが光る・拍の頭に印）
      function drawSteps(ctx) {
        var pt = pat.d[2], L = pt.length, cw = (W - 8) / L, cur = patCell(), per = L / pat.d[3], i;
        for (i = 0; i < L; i++) {
          var c = pt.charAt(i), x = 4 + i * cw, on = i === cur;
          ctx.fillStyle = on ? "#ffd166" : (c === "-" ? "#1f2a44" : "#2f4a6e");
          ctx.fillRect(x + 1, BASS_STEP_Y, cw - 2, BASS_STEP_H);
          if (i % per === 0) { ctx.fillStyle = "#adb5bd"; ctx.fillRect(x + 1, BASS_STEP_Y + BASS_STEP_H + 1, cw - 2, 2); }
          if (c !== "-") { text(ctx, BASS_TOK_SHOW[c] || c, x + cw / 2, BASS_STEP_Y + BASS_STEP_H / 2, L > 12 ? 8 : 10, on ? "#14213d" : "#ffffff"); }
        }
      }
      function drawChords(ctx) {
        var i, si = songIdx(), cp = pat && !pat.back ? bassCprog(prefs.cprog) : null;
        // §263: 進行の次のコード（枠が光る）
        var nxD = cp ? bassCprogAt(cp, Math.max(0, (now() - pat.t0) * bpm / 60), meter).next : -1;
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
          var dc = bassChord(prefs.key, i, prefs.scale);
          text(ctx, dc.deg, cr.x + cr.w / 2, cr.y + 8, 7, cur ? "#14213d" : "#adb5bd");
          text(ctx, dc.name, cr.x + cr.w / 2, cr.y + cr.h / 2 + 4, dc.name.length > 4 ? 8 : 10, cur ? "#14213d" : "#ffffff");
        }
      }
      function drawPads(ctx) {
        var ch = curChord(), lit = litNotes(), i, on = {}, k;
        for (k in padHeld) { if (padHeld.hasOwnProperty(k)) { on[padHeld[k]] = true; } }
        drawChords(ctx);
        if (pat) { drawSteps(ctx); }
        var n = prefs.padN, big = n === 16;
        for (i = 0; i < n; i++) {
          var r = bassPadRect(i, n, padTop()), pd = prefs.pads[i], m = bassPadNote(ch, pd), hot = on[i] || flash["p" + i] > 0 || lit[m] === "play";
          ctx.fillStyle = hot ? "#ffd166" : (pd[0] === 0 && !pd[2] ? "#6c4a9e" : "#4c3a8f");
          ctx.fillRect(r.x, r.y, r.w, r.h);
          ctx.strokeStyle = "#7d6bd6";
          ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
          if (ed && ed.sel === i) { ctx.strokeStyle = "#ffd166"; ctx.lineWidth = 3; ctx.strokeRect(r.x + 1.5, r.y + 1.5, r.w - 3, r.h - 3); ctx.lineWidth = 1; }
          text(ctx, bassPadLabel(pd), r.x + r.w / 2, r.y + r.h / 2 - (big ? 6 : 8), big ? 14 : 18, hot ? "#14213d" : "#ffffff");
          text(ctx, bassName(m, names === "none" ? "cde" : names), r.x + r.w / 2, r.y + r.h / 2 + (big ? 10 : 14), big ? 8 : 9, hot ? "#14213d" : "#d6ccff");
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
            if (view === "pad") {
              var d = bassChordAt(x, y);
              if (d >= 0) { setChord(d); return; }
              padPress(pid, bassPadAt(x, y, prefs.padN, padTop()));
              return;
            }
            // §259: パターン中はフレットの画面にもコードの段
            if (pat && bassChordAt(x, y) >= 0) { setChord(bassChordAt(x, y)); return; }
            var c = bassCellAt(x, y, prefs.pos);
            if (c) { noteOn(pid, c.m, c.s); }
          } else if (type === "move") {
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
          } else { delete padHeld[pid]; noteOff(pid); }
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
          if (bk) { backStep(); }
        },
        draw: function (ctx) {
          var g = ctx.createLinearGradient ? ctx.createLinearGradient(0, 0, 0, BASS_H) : null;
          if (g) { g.addColorStop(0, "#1b1f3b"); g.addColorStop(1, "#2d1b4e"); }
          ctx.fillStyle = g || "#1b263b";
          ctx.fillRect(0, 0, W, BASS_H);
          var si = songIdx(), nx = si >= 0 ? back.chords[si + 1] : null;
          hudText(ctx, view === "pad" ? (ed ? "✏️ 編集中" : si >= 0 ? "🎸 伴奏" : "🎛️ キー " + BASS_CDE[prefs.key] + " " + bassScale(prefs.scale)[1].replace(/（.*）/, "")) : (si >= 0 ? "🎸 " + back.chords[si].name + (nx ? " → " + nx.name : "") : (pat ? "🎼 " + patDef()[1] : "🎸 " + (prefs.pos ? prefs.pos + "フレット〜" : "開放弦〜"))), 8, 10, "left");
          hudText(ctx, "BPM " + bpm, W - 8, 10, "right");
          var held = [], k;
          for (k in press) { if (press.hasOwnProperty(k)) { held.push(press[k]); } }
          held.sort(function (a, b) { return a - b; });
          var line = held.map(function (m) { return bassName(m, names === "none" ? "do" : names) + "（" + bassName(m, "cde") + "）"; }).join(" ");
          if (rec) {
            var rb = recBeat();
            text(ctx, rb < 0 ? String(Math.ceil(-rb)) : "● REC " + (Math.floor(rb / meter) + 1) + "小節・" + rec.notes.length + "音", W / 2, view === "pad" || pat ? 18 : 30, view === "pad" || pat ? 11 : 16, "#ff6b6b");
          }
          if (view === "pad") {
            if (!rec) { text(ctx, line || (play ? "再生中…" : (bk ? "伴奏中…" : "コード " + curChord().name + " に合う音")), W / 2, 18, 10, "#ffffff"); }
            drawPads(ctx);
          } else {
            if (pat) {
              // §259: コードの段・パターンのマスの段・押している音
              drawChords(ctx);
              drawSteps(ctx);
              if (line) { text(ctx, line, W / 2, 106, 15, "#ffd166"); }
            } else {
              if (!rec) { if (!line) { emojiAt(ctx, play ? "🎶" : "🦍", W / 2, 50, 34); } }
              text(ctx, line || (play ? "再生中…" : (bk ? "伴奏中…（輪はいまのコードの音）" : "弦のマスをタップして弾こう")), W / 2, rec ? 62 : (line ? 60 : 92), line ? 20 : 12, line ? "#ffd166" : "#ffffff");
            }
            drawFret(ctx);
          }
        }
      };
    }
  });

  window.UGBass = {
    STRINGS: BASS_STRINGS, COLS: BASS_COLS, POS_MAX: BASS_POS_MAX, H: BASS_H, VOICES: BASS_VOICES, VIEWS: BASS_VIEWS, PAD_DEFS: BASS_PAD_DEFS, PAD_Y: BASS_PAD_Y, PAD_Y_PAT: BASS_PAD_Y_PAT, patLegend: bassPatLegend, patGroups: bassPatGroups, PAD_MAX: BASS_PAD_MAX, HOLD: BASS_HOLD, KEYS: BASS_KEYS, padLabel: bassPadLabel, padNote: bassPadNote, padsClean: bassPadsClean,
    cellAt: bassCellAt, cellRect: bassCellRect, name: bassName, chord: bassChord, SCALES: BASS_SCALES, scale: bassScale, scalePcs: bassScalePcs, CPROGS: BASS_CPROGS, cprog: bassCprog, cprogAt: bassCprogAt, padRect: bassPadRect, padAt: bassPadAt, chordRect: bassChordRect, chordAt: bassChordAt,
    prefs: bassPrefs, notesClean: bassNotesClean, takesLoad: bassTakesLoad, takesSave: bassTakesSave, takeAdd: bassTakeAdd, takeById: bassTakeById, toSeqNotes: bassToSeqNotes,
    sendToSeq: bassSendToSeq, patterns: bassPatterns, patById: bassPatById, tokNote: bassTokNote, tokLen: bassTokLen, patToSeq: bassPatToSeq, songChord: bassSongChord, songChords: bassSongChords, chordIdx: bassChordIdx, backList: bassBackList, backing: bassBacking, backEventOn: bassBackEventOn, PREFS_KEY: BASS_PREFS_KEY, TAKES_KEY: BASS_TAKES_KEY, TAKES_MAX: BASS_TAKES_MAX
  };
})();
