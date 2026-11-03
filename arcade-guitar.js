// =========================================================
// 究極ゴリラ ゲームセンター: 🤘 ゴリラギター（§282〜）
// arcade.js・arcade-melody.js・arcade-bass.js の後に読み込む。音は window.UGMelody を使う。
// コードの計算・スケール・音量の出口などはゴリラベース（window.UGBass）のものを借りる。
// 録音（テイク）はシーケンサーの打ち込みと同じ [拍, 長さ, MIDI, 強さ] の形で保存する
// =========================================================
(function () {
  "use strict";

  var I = window.UGArcade && window.UGArcade.internal;
  if (!I) { return; }
  var W = I.W, hudText = I.hudText, lsGet = I.lsGet, lsSet = I.lsSet, escHtml = I.escHtml;
  function BA() { return window.UGBass; }

  var GTR_H = 320;
  var GTR_PREFS_KEY = "ultimateGorillaGuitarPrefsV1", GTR_TAKES_KEY = "ultimateGorillaGuitarTakesV1";
  var GTR_TAKES_MAX = 10, GTR_NOTES_MAX = 2000, GTR_HOLD = 6, GTR_BOOST = 3;
  var GTR_DO = ["ド", "ド#", "レ", "レ#", "ミ", "ファ", "ファ#", "ソ", "ソ#", "ラ", "ラ#", "シ"];
  var GTR_CDE = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  var GTR_NAMES = [["do", "ドレミ"], ["cde", "CDE"], ["none", "なし"]];
  var GTR_VIEWS = [["fret", "&#x1F3B8; 単音"], ["chord", "&#x1F3B6; ストローク"]];
  // 弦の開放の音（6弦 → 1弦。番号 sn: 0 ＝ 6弦 … 5 ＝ 1弦）
  var GTR_OPEN = [40, 45, 50, 55, 59, 64], GTR_SNAME = ["E", "A", "D", "G", "B", "E"];
  // 音色 [id, 名前, サンプルの音色（GM）, エレキか, 大きさ]（§289 v1.96: エレキも本物のサンプル。シーケンサーへも同じ番号で送る。ひずみは重ねると大きいので小さめ）
  var GTR_VOICES = [
    ["nylon", "&#x1FA95; ナイロン", 24, false, 1], ["steel", "&#x1F3B8; スチール", 25, false, 1], ["jazz", "&#x1F3B7; ジャズ", 26, true, 1],
    ["clean", "&#x26A1; クリーン", 27, true, 1], ["crunch", "&#x1F525; クランチ", 29, true, 0.8], ["dist", "&#x1F918; ディストーション", 30, true, 0.7]
  ];
  var GTR_MUTED = 28; // エレキのカッティングはミュートのサンプル
  var GTR_PMUTE = 0.16; // §296: ブリッジミュートの音の長さ（秒）
  var GTR_CAPO_MAX = 7; // §297
  function gtrOpt(list, id) { for (var i = 0; i < list.length; i++) { if (list[i][0] === id) { return list[i]; } } return list[0]; }

  // ---------- 単音の画面（上が1弦）----------
  var GTR_COLS = 8, GTR_POS_MAX = 12, GTR_BOARD_X = 4, GTR_BOARD_R = W - 4, GTR_BOARD_Y = 96, GTR_BOARD_BOT = 314;
  var GTR_MARKS = [3, 5, 7, 9, 12, 15, 17, 19, 21];
  // §287: 右手ピッキング（左手で押さえて、板の右の「右手」の所で弾く）。そのときフレットは6列
  // §288: よこ向き（フレット 13 列）と持ち方（ゴリラベースと共通: 利き手・ネックの太さと位置・右手の所の広さ）
  var GTR_PICK = false, GTR_PICK_X = W - 4 - Math.round(W * 0.24), GTR_PICK_R = W - 4, GTR_MIRROR = false, GTR_LAND = false;
  // o: { land, h: よこ向きの高さ, pick, cgrid: §291 コードの列（よこ向きのストローク）}
  function gtrLayout(o) {
    o = o || {};
    var land = !!o.land, pick = !!o.pick, B = BA(), g = land && B && B.grip ? B.grip() : null, zw = Math.round(W * (g ? g.pw / 100 : 0.24)), gut = land ? 11 : 4;
    GTR_LAND = land; GTR_PICK = pick; GTR_MIRROR = !!(g && g.lefty);
    if (land) {
      GTR_H = o.h || 130;
      // §291: ストロークは、コードのボタンを左手側に縦に並べる（"side"）か、コードの列（"grid"）
      // §292: コードの位置 o.cpos "near" 手前（下）/ "far" 奥（上）/ "side" 横（コードの列ではなし）。左利きはコードの並びを右から
      var sw = Math.round(W * 0.18), cpos = o.cpos === "far" || (o.cpos === "side" && !o.cgrid) ? o.cpos : "near";
      GTR_CREV = !!(g && g.lefty);
      GTR_STRUM_X0 = 4; GTR_STRUM_X1 = W - 4;
      if (o.cgrid || cpos !== "side") {
        GTR_CMODE = o.cgrid ? "grid" : "strip"; GTR_CHORD_H = o.cgrid ? 15 : 17;
        if (cpos === "far") { GTR_CHORD_Y = 12; GTR_STRUM_Y = 12 + GTR_CHORD_H + 3; GTR_STRUM_BOT = GTR_H - 4; }
        else { GTR_CHORD_Y = GTR_H - 3 - GTR_CHORD_H; GTR_STRUM_Y = 12; GTR_STRUM_BOT = GTR_CHORD_Y - 3; }
      } else {
        GTR_CMODE = "side"; GTR_SIDE_W = sw; GTR_STRUM_Y = 12; GTR_STRUM_BOT = GTR_H - 4;
        if (g && g.lefty) { GTR_SIDE_X = W - 4 - sw; GTR_STRUM_X0 = 4; GTR_STRUM_X1 = W - 8 - sw; } else { GTR_SIDE_X = 4; GTR_STRUM_X0 = 8 + sw; GTR_STRUM_X1 = W - 4; }
      }
      var bx = B.gripBox(14, GTR_H - 9, g);
      GTR_BOARD_Y = bx.y0; GTR_BOARD_BOT = bx.y1;
      GTR_COLS = pick ? Math.max(7, Math.round(13 * (1 - zw / W))) : 13;
    } else {
      GTR_H = 320; GTR_CHORD_H = 42; GTR_CHORD_Y = 320 - 6 - 42; GTR_STRUM_Y = 26; GTR_STRUM_BOT = GTR_CHORD_Y - 8; GTR_BOARD_Y = 96; GTR_BOARD_BOT = 314;
      GTR_CMODE = "strip"; GTR_STRUM_X0 = 4; GTR_STRUM_X1 = W - 4; GTR_CREV = false;
      GTR_COLS = pick ? 6 : 8;
    }
    if (!GTR_MIRROR) { GTR_PICK_X = W - 4 - zw; GTR_PICK_R = W - 4; GTR_BOARD_X = gut; GTR_BOARD_R = pick ? GTR_PICK_X - 6 : W - 4; }
    else { GTR_PICK_X = 4; GTR_PICK_R = 4 + zw; GTR_BOARD_X = pick ? GTR_PICK_R + 6 : 4; GTR_BOARD_R = W - gut; }
  }
  function gtrSetPick(on) { gtrLayout({ pick: on }); }
  function gtrColW() { return (GTR_BOARD_R - GTR_BOARD_X) / GTR_COLS; }
  // 列 c の左はし（左利きは右から並ぶ）・列の区切り c の x
  function gtrColX(c) { return GTR_MIRROR ? GTR_BOARD_R - (c + 1) * gtrColW() : GTR_BOARD_X + c * gtrColW(); }
  function gtrFretX(c) { return GTR_MIRROR ? GTR_BOARD_R - c * gtrColW() : GTR_BOARD_X + c * gtrColW(); }
  function gtrRowLineY(r) { return GTR_BOARD_Y + (r + 0.5) * gtrRowH(); }
  // 右手の所の行（外は -1）
  function gtrPickRow(x, y) {
    if (!GTR_PICK || x < GTR_PICK_X || x > GTR_PICK_R || y < GTR_BOARD_Y || y >= GTR_BOARD_Y + gtrRowH() * 6) { return -1; }
    return Math.floor((y - GTR_BOARD_Y) / gtrRowH());
  }
  // §295: チョーキング（押さえた指を縦に動かした量 dy・行の高さ rh → 上げる半音。少しの遊びのあと、1行ぶんで 2・それより上げない）
  function gtrBendOf(dy, rh) { var v = (Math.abs(dy) - rh * 0.15) / (rh * 0.85) * 2; return v <= 0 ? 0 : Math.min(2, Math.round(v * 20) / 20); }
  // §293: なぞる速さ（1フレームに動いた量）→ 強さの倍率（ゆっくり 0.4 〜 速い 1.2）
  function gtrVelocity(speed) { return Math.max(0.4, Math.min(1.2, 0.4 + speed / 30)); }
  // y0 → y1 で指がまたいだ行（またいだ順）。lineY(i): 行 i の弦の高さ
  function gtrRowCross(y0, y1, n, lineY) {
    var out = [], i;
    if (y1 > y0) { for (i = 0; i < n; i++) { if (lineY(i) > y0 && lineY(i) <= y1) { out.push(i); } } }
    else if (y1 < y0) { for (i = n - 1; i >= 0; i--) { if (lineY(i) < y0 && lineY(i) >= y1) { out.push(i); } } }
    return out;
  }
  function gtrRowH() { return (GTR_BOARD_BOT - GTR_BOARD_Y) / 6; }
  // 行 r（0 ＝ 1弦）・列 c の四角
  function gtrCellRect(r, c) { var cw = gtrColW(), rh = gtrRowH(); return { x: gtrColX(c), y: GTR_BOARD_Y + r * rh, w: cw, h: rh }; }
  // 座標 → { r: 行, sn: 弦の番号, c: 列, f: フレット, m: MIDI }（外なら null）
  function gtrCellAt(x, y, pos) {
    var cw = gtrColW(), rh = gtrRowH(), c = Math.floor((GTR_MIRROR ? GTR_BOARD_R - x : x - GTR_BOARD_X) / cw), r = Math.floor((y - GTR_BOARD_Y) / rh);
    if (x < GTR_BOARD_X || x >= GTR_BOARD_R || c < 0 || c >= GTR_COLS || r < 0 || r >= 6 || y < GTR_BOARD_Y) { return null; }
    var sn = 5 - r;
    return { r: r, sn: sn, c: c, f: pos + c, m: GTR_OPEN[sn] + pos + c };
  }
  function gtrPc(m) { return ((m % 12) + 12) % 12; }
  function gtrName(m, names) {
    if (names === "none") { return ""; }
    return names === "cde" ? GTR_CDE[gtrPc(m)] + (Math.floor(m / 12) - 1) : GTR_DO[gtrPc(m)];
  }

  // ---------- ストロークの画面（上が6弦）----------
  // §290: 弦は単音と同じく上が1弦・手前（下）が6弦。コードの段は一番手前（左手で押しやすく）。大きさは gtrLayout が決める
  var GTR_CHORD_Y = 272, GTR_CHORD_H = 42, GTR_STRUM_Y = 26, GTR_STRUM_BOT = 264;
  // §291: コードのボタンの並べ方 "strip"（下の段）/ "side"（よこ向き: 左手側の縦の列）/ "grid"（よこ向き: コードの列の上）。弦の所は GTR_STRUM_X0〜X1
  var GTR_CMODE = "strip", GTR_STRUM_X0 = 4, GTR_STRUM_X1 = W - 4, GTR_SIDE_X = 4, GTR_SIDE_W = 58, GTR_CREV = false; // GTR_CREV: コードを右から並べる（よこ向きの左利き）
  function gtrChordRect(i) {
    if (GTR_CMODE === "side") { var h = (GTR_H - 16) / 7; return { x: GTR_SIDE_X, y: 12 + i * h + 1, w: GTR_SIDE_W, h: h - 2 }; }
    var w = (W - 8) / 7, k = GTR_CREV ? 6 - i : i;
    return { x: 4 + k * w + 1, y: GTR_CHORD_Y, w: w - 2, h: GTR_CHORD_H };
  }
  // コードの列の番号（コードの列でなければ -1）
  function gtrGridCol(x) { if (GTR_CMODE !== "grid") { return -1; } var k = Math.max(0, Math.min(6, Math.floor((x - 4) / ((W - 8) / 7)))); return GTR_CREV ? 6 - k : k; }
  function gtrChordAt(x, y) { for (var i = 0; i < 7; i++) { var r = gtrChordRect(i); if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) { return i; } } return -1; }
  function gtrStrumRowH() { return (GTR_STRUM_BOT - GTR_STRUM_Y) / 6; }
  // 弦 sn（0 ＝ 6弦。手前 ＝ 下）の線の高さ
  function gtrStrumLineY(sn) { return GTR_STRUM_Y + (5 - sn + 0.5) * gtrStrumRowH(); }
  // 高さ y の弦（線にいちばん近い弦。外なら -1）
  function gtrStrumAt(y) { if (y < GTR_STRUM_Y || y >= GTR_STRUM_BOT) { return -1; } return 5 - Math.max(0, Math.min(5, Math.floor((y - GTR_STRUM_Y) / gtrStrumRowH()))); }
  // y0 → y1 で指がまたいだ弦（またいだ順）
  function gtrStrumCross(y0, y1) {
    var out = [], sn;
    if (y1 > y0) { for (sn = 5; sn >= 0; sn--) { var a = gtrStrumLineY(sn); if (a > y0 && a <= y1) { out.push(sn); } } }
    else if (y1 < y0) { for (sn = 0; sn < 6; sn++) { var b = gtrStrumLineY(sn); if (b < y0 && b >= y1) { out.push(sn); } } }
    return out;
  }

  // ---------- 押さえ方（§283）----------
  // コードの種類（ゴリラベースの chord の音程から）
  function gtrQuality(ch, sev) {
    var t = ch.iv[2] % 12, f = ch.iv[4] % 12, s = ch.iv[6] % 12;
    if (t === 3 && f === 6) { return sev ? (s === 9 ? "dim7" : "m7b5") : "dim"; }
    if (t === 3) { return sev ? (s === 11 ? "mM7" : "m7") : "m"; }
    if (f === 8) { return "aug"; }
    return sev ? (s === 11 ? "M7" : "7") : "maj";
  }
  // 6弦ルート（E の形）・5弦ルート（A の形）のフレット（6弦 → 1弦。null ＝ 鳴らさない）
  var GTR_ESHAPE = {
    maj: [0, 2, 2, 1, 0, 0], m: [0, 2, 2, 0, 0, 0], "7": [0, 2, 0, 1, 0, 0], M7: [0, null, 1, 1, 0, null], m7: [0, 2, 0, 0, 0, 0],
    m7b5: [0, null, 0, 0, -1, null], dim: [0, 1, 2, 0, null, null], dim7: [0, null, -1, 0, -1, null], aug: [0, null, 2, 1, 1, null], mM7: [0, null, 1, 0, 0, null],
    // §294
    sus4: [0, 2, 2, 2, 0, 0], sus2: [0, 2, 4, 4, 0, 0], "7sus4": [0, 2, 0, 2, 0, 0], add9: [0, 2, 4, 1, 0, 0], "6": [0, 2, 2, 1, 2, 0], m6: [0, 2, 2, 0, 2, 0], pow: [0, 2, 2, null, null, null]
  };
  var GTR_ASHAPE = {
    maj: [null, 0, 2, 2, 2, 0], m: [null, 0, 2, 2, 1, 0], "7": [null, 0, 2, 0, 2, 0], M7: [null, 0, 2, 1, 2, 0], m7: [null, 0, 2, 0, 1, 0],
    m7b5: [null, 0, 1, 0, 1, null], dim: [null, 0, 1, 2, 1, null], dim7: [null, 0, 1, -1, 1, null], aug: [null, 0, 3, 2, 2, null], mM7: [null, 0, 2, 1, 1, null],
    // §294
    sus4: [null, 0, 2, 2, 3, 0], sus2: [null, 0, 2, 2, 0, 0], "7sus4": [null, 0, 2, 0, 3, 0], add9: [null, 0, 2, 4, 2, 0], "6": [null, 0, 2, 2, 2, 2], m6: [null, 0, 2, 2, 1, 2], "9": [null, 0, -1, 0, 0, 0], pow: [null, 0, 2, 2, null, null]
  };
  // よく使う開放のコード（"ルートの音名番号:種類"）
  var GTR_OPEN_SHAPES = {
    "0:maj": [null, 3, 2, 0, 1, 0], "0:7": [null, 3, 2, 3, 1, 0], "0:M7": [null, 3, 2, 0, 0, 0],
    "2:maj": [null, null, 0, 2, 3, 2], "2:m": [null, null, 0, 2, 3, 1], "2:7": [null, null, 0, 2, 1, 2], "2:M7": [null, null, 0, 2, 2, 2], "2:m7": [null, null, 0, 2, 1, 1],
    "7:maj": [3, 2, 0, 0, 0, 3], "7:7": [3, 2, 0, 0, 0, 1], "7:M7": [3, null, 0, 0, 0, 2], "5:M7": [null, null, 3, 2, 1, 0], "11:7": [null, 2, 1, 2, 0, 2],
    "2:sus4": [null, null, 0, 2, 3, 3], "2:sus2": [null, null, 0, 2, 3, 0], "0:add9": [null, 3, 2, 0, 3, 0]
  };
  function gtrBarre(tbl, q, r) {
    var sh = tbl[q] || tbl.maj, low = Math.min.apply(null, sh.filter(function (v) { return v !== null; }));
    if (r + low < 0) { r += 12; }
    return { r: r, frets: sh.map(function (v) { return v === null ? null : r + v; }) };
  }
  // コード（ゴリラベースの chord）→ { frets: [6弦 → 1弦], midis: [同じ順。鳴らさない弦は null], q }
  function gtrShape(ch, sev) { return gtrShapeQ(gtrPc(ch.r !== undefined ? ch.r : ch.root), gtrQuality(ch, sev), -1); }
  // §294: ルートの音名番号 pc・種類 q・ベースの音名番号 bass（-1 ＝ なし。分数コードは6弦か5弦の低いフレットに）
  function gtrShapeQ(pc, q, bass) {
    var fr = GTR_OPEN_SHAPES[pc + ":" + q];
    if (!fr) {
      var e = GTR_ESHAPE[q] ? gtrBarre(GTR_ESHAPE, q, (pc - 4 + 12) % 12) : null, a = GTR_ASHAPE[q] ? gtrBarre(GTR_ASHAPE, q, (pc - 9 + 12) % 12) : null;
      if (!e && !a) { e = gtrBarre(GTR_ESHAPE, "maj", (pc - 4 + 12) % 12); }
      fr = (!e || (a && a.r < e.r) ? a : e).frets;
    }
    fr = fr.slice();
    if (bass >= 0 && bass !== pc) {
      var f6 = (bass - 4 + 12) % 12, f5 = (bass - 9 + 12) % 12;
      if (f6 <= 4) { fr[0] = f6; } else if (f5 <= 4) { fr[0] = null; fr[1] = f5; }
    }
    return { frets: fr, midis: fr.map(function (f, sn) { return f === null ? null : GTR_OPEN[sn] + f; }), q: q };
  }
  // §294: 自分でならべるコードの種類 [id, ボタンの名前, コード名のうしろ]
  var GTR_CTYPES = [
    ["maj", "メジャー", ""], ["m", "m", "m"], ["7", "7", "7"], ["M7", "maj7", "maj7"], ["m7", "m7", "m7"], ["mM7", "mMaj7", "mM7"], ["6", "6", "6"], ["m6", "m6", "m6"],
    ["sus4", "sus4", "sus4"], ["sus2", "sus2", "sus2"], ["7sus4", "7sus4", "7sus4"], ["add9", "add9", "add9"], ["9", "9", "9"],
    ["dim", "dim", "dim"], ["dim7", "dim7", "dim7"], ["m7b5", "m7(♭5)", "m7(♭5)"], ["aug", "aug", "aug"], ["pow", "5（パワー）", "5"]
  ];
  function gtrRoots() { return window.UGChords && window.UGChords.ROOTS ? window.UGChords.ROOTS : GTR_CDE; }
  // コードの枠 { r: ルート, q: 種類, b: ベース（-1 ＝ なし）} → コード名（C・Dsus4・G/B など）
  function gtrSlotName(sl) { var R0 = gtrRoots(); return R0[sl.r] + gtrOpt(GTR_CTYPES, sl.q)[2] + (sl.b >= 0 && sl.b !== sl.r ? "/" + R0[sl.b] : ""); }
  // キーのダイアトニックコードの7つの枠
  function gtrDefaultSlots(key, scale, sev) {
    var out = [], d, B = BA();
    for (d = 0; d < 7; d++) { var ch = B.chord(key, d, scale, sev); out.push({ r: gtrPc(ch.r), q: gtrQuality(ch, sev), b: -1 }); }
    return out;
  }
  function gtrSlotsClean(a, key, scale, sev) {
    var def = gtrDefaultSlots(key, scale, sev), out = [], i;
    if (!a || a.length !== 7) { return def; }
    for (i = 0; i < 7; i++) {
      var x = a[i] || {}, r = Math.round(Number(x.r)), b = Math.round(Number(x.b));
      out.push(r >= 0 && r <= 11 && gtrOpt(GTR_CTYPES, x.q)[0] === x.q ? { r: r, q: x.q, b: b >= 0 && b <= 11 ? b : -1 } : def[i]);
    }
    return out;
  }

  // ---------- §284: ストロークのパターン [id, 名前, 1小節のマス, 拍子] ----------
  var GTR_PATS = [
    ["down8", "8分ダウン", "DDDDDDDD", 4], ["folk", "フォーク（8ビート）", "D-DU-UDU", 4], ["beat16", "16ビート", "DUDUxUDUDUDUxUDU", 4],
    ["cut", "カッティング", "x-xUD-xUx-xUD-xU", 4], ["ballad", "バラード（ジャーン）", "D-------", 4], ["arp", "アルペジオ", "B3231323", 4],
    ["arpslow", "アルペジオ（ゆっくり）", "B-3-2-1-", 4], ["reggae", "レゲエ", "--s---s-", 4], ["ska", "スカ", "-s-s-s-s", 4],
    ["bossa", "ボサノバ", "B-DB-D-D", 4], ["funk", "ファンク", "Dx-UxUD-x-UDxU-U", 4], ["shuffle", "シャッフル（3連）", "D-UD-UD-UD-U", 4], ["waltz", "ワルツ（3拍子）", "B-D-D-", 3]
  ];
  function gtrPat(id) { return gtrOpt(GTR_PATS, id); }
  // 文字 c の弦（アルペジオ。鳴らさない弦なら、ひとつ低い番号の鳴る弦）→ sn（なければ -1）
  function gtrArpString(sh, c) {
    var sn, i;
    if (c === "B") { for (sn = 0; sn < 6; sn++) { if (sh.midis[sn] !== null) { return sn; } } return -1; }
    sn = 6 - Number(c);
    for (i = sn; i < 6; i++) { if (sh.midis[i] !== null) { return i; } }
    return -1;
  }
  // §284: 音量（%）
  var GTR_VOL_MAX = 150, GTR_VOL_STEP = 10;
  function gtrVol(v, d) { v = Number(v); return v >= 0 && v <= GTR_VOL_MAX && v % GTR_VOL_STEP === 0 ? v : d; }

  // ---------- 音の出口（音色ごと。エレキはアンプを通す）----------
  // st: ゲームごとの入れもの、voice: 音色の id、vol: 0〜150（%）→ 入り口の GainNode（音が出せなければ null）
  // fx（省略可）: §298 エフェクト { ch: コーラス 0/1, dl: ディレイ 0/1/2, rv: リバーブ 0/1/2 }
  function gtrBus(st, voice, vol, fx) {
    var A = window.UGMelody && window.UGMelody.audio, ac = A && A.ctx, to = A ? (A.bus || A.master) : null, k = "g:" + voice, b = st[k];
    if (!ac || !to || !ac.createGain) { return null; }
    if (!b || b.ac !== ac || b.to !== to) { b = st[k] = { ac: ac, to: to, g: ac.createGain() }; b.g.connect(to); gtrFxBuild(b); }
    b.g.gain.value = vol / 100;
    if (b.fx) {
      var f = fx || {};
      b.fx.ch.gain.value = f.ch ? 0.6 : 0;
      b.fx.dl.gain.value = f.dl ? 0.35 : 0;
      b.fx.dly.delayTime.value = f.dl === 2 ? 0.42 : 0.28;
      b.fx.rv.gain.value = f.rv === 2 ? 0.55 : (f.rv ? 0.25 : 0);
    }
    return b.g;
  }
  // §298: エフェクトの道（入り口 b.g から、コーラス・ディレイ・リバーブをならべて出口へ。混ぜる量は gtrBus が決める）
  var gtrIr = null;
  function gtrFxBuild(b) {
    var ac = b.ac;
    if (!ac.createDelay || !ac.createOscillator || !ac.createConvolver || !ac.createBuffer) { return; }
    try {
      var cd = ac.createDelay(0.05), lfo = ac.createOscillator(), dep = ac.createGain(), ch = ac.createGain();
      cd.delayTime.value = 0.018; lfo.frequency.value = 0.9; dep.gain.value = 0.004;
      lfo.connect(dep); dep.connect(cd.delayTime); b.g.connect(cd); cd.connect(ch); ch.connect(b.to); lfo.start(0);
      var dly = ac.createDelay(1), fb = ac.createGain(), dl = ac.createGain();
      fb.gain.value = 0.35;
      b.g.connect(dly); dly.connect(fb); fb.connect(dly); dly.connect(dl); dl.connect(b.to);
      var cv = ac.createConvolver(), rv = ac.createGain();
      if (!gtrIr || gtrIr.ac !== ac) {
        var len = Math.round((ac.sampleRate || 44100) * 2), buf = ac.createBuffer(2, len, ac.sampleRate || 44100), c0, i;
        for (c0 = 0; c0 < 2; c0++) { var d = buf.getChannelData(c0); for (i = 0; i < len; i++) { d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5); } }
        gtrIr = { ac: ac, buf: buf };
      }
      cv.buffer = gtrIr.buf;
      b.g.connect(cv); cv.connect(rv); rv.connect(b.to);
      b.fx = { ch: ch, dl: dl, dly: dly, rv: rv };
    } catch (e) { b.fx = null; }
  }

  function gtrFx(p) { return { ch: p.fxc, dl: p.fxd, rv: p.fxr }; }

  // ---------- 設定・テイク ----------
  function gtrPrefs() {
    var p = lsGet(GTR_PREFS_KEY) || {}, pos = Math.round(Number(p.pos)), key = Math.round(Number(p.key)), B = BA();
    return {
      view: p.view === "chord" ? "chord" : "fret", voice: gtrOpt(GTR_VOICES, p.voice)[0],
      names: p.names === "cde" || p.names === "none" ? p.names : "do",
      pos: pos >= 0 && pos <= GTR_POS_MAX ? pos : 0, key: key >= 0 && key <= 11 ? key : 0,
      scale: B ? B.scale(p.scale)[0] : "major", sev: !!p.sev, pick: !!p.pick, land: !!p.land, cgrid: !!p.cgrid, myOn: !!p.myOn, pmute: !!p.pmute, power: !!p.power, fxc: p.fxc ? 1 : 0, fxd: [1, 2].indexOf(p.fxd) >= 0 ? p.fxd : 0, fxr: [1, 2].indexOf(p.fxr) >= 0 ? p.fxr : 0, capo: Math.round(Number(p.capo)) >= 0 && Math.round(Number(p.capo)) <= 7 ? Math.round(Number(p.capo)) : 0, cpos: p.cpos === "far" || p.cpos === "side" ? p.cpos : "near", tab: ["play", "pat", "band", "key"].indexOf(p.tab) >= 0 ? p.tab : "play",
      bpm: Math.max(40, Math.min(240, Math.round(Number(p.bpm) || 100))), metro: p.metro !== false,
      pat: gtrPat(p.pat)[0], swing: B ? gtrOpt(B.SWINGS, Number(p.swing))[0] : 0, cprog: B && B.cprog(p.cprog) ? p.cprog : "",
      drum: typeof p.drum === "string" && /^[gdp]:[A-Za-z0-9_-]{1,32}$/.test(p.drum) ? p.drum : "",
      bpat: typeof p.bpat === "string" && /^[a-z0-9]{1,12}$/.test(p.bpat) ? p.bpat : "",
      gvol: gtrVol(p.gvol, 100), bvol: gtrVol(p.bvol, 100), dvol: gtrVol(p.dvol, 50),
      rlevel: gtrOpt(GTR_RLEVELS, p.rlevel)[0], rspeed: GTR_SPEEDS.indexOf(Number(p.rspeed)) >= 0 ? Number(p.rspeed) : 100,
      backing: typeof p.backing === "string" && /^(cur|s:\d+)$/.test(p.backing) ? p.backing : "", backUke: !!p.backUke,
      myc: p.myc, myEdit: !!p.myEdit
    };
  }
  function gtrSavePrefs(p) { return lsSet(GTR_PREFS_KEY, p); }
  // §294: 設定を読んだあとで、自分のコードの枠を整える（キー・スケールが決まってから）
  function gtrPrefsFull() { var p = gtrPrefs(); p.myc = gtrSlotsClean(p.myc, p.key, p.scale, p.sev); return p; }
  function gtrNum(v, lo, hi) { var n = Number(v); return isFinite(n) && n >= lo && n <= hi ? n : null; }
  // [拍, 長さ, MIDI]（強さが 0.8 以外なら4つ目）
  function gtrNotesClean(a) {
    var out = [], i;
    a = a && a.length ? a : [];
    for (i = 0; i < a.length && out.length < GTR_NOTES_MAX; i++) {
      var b = a[i] && gtrNum(a[i][0], 0, 4096), d = a[i] && gtrNum(a[i][1], 0.0625, 32), m = a[i] && gtrNum(a[i][2], 0, 127), v = a[i] && gtrNum(a[i][3], 0.1, 1);
      if (b !== null && d !== null && m !== null) { out.push(v !== null && v !== 0.8 ? [b, d, Math.round(m), v] : [b, d, Math.round(m)]); }
    }
    out.sort(function (x, y) { return x[0] - y[0]; });
    return out;
  }
  function gtrTakeClean(t, i) {
    return {
      id: Math.max(1, Math.round(Number(t.id)) || i + 1), name: String(t.name || "テイク").slice(0, 20),
      bpm: Math.max(40, Math.min(240, Math.round(Number(t.bpm) || 100))), meter: t.meter === 3 ? 3 : 4,
      voice: gtrOpt(GTR_VOICES, t.voice)[0], notes: gtrNotesClean(t.notes)
    };
  }
  function gtrTakesLoad() {
    var a = lsGet(GTR_TAKES_KEY), out = [], i;
    if (!a || !a.length) { return out; }
    for (i = 0; i < a.length && out.length < GTR_TAKES_MAX; i++) { if (a[i] && typeof a[i] === "object") { out.push(gtrTakeClean(a[i], i)); } }
    return out;
  }
  function gtrTakesSave(list) { return lsSet(GTR_TAKES_KEY, list.slice(0, GTR_TAKES_MAX)); }
  function gtrTakeAdd(list, t) {
    var id = 0, i;
    for (i = 0; i < list.length; i++) { id = Math.max(id, list[i].id); }
    var take = gtrTakeClean({ id: id + 1, name: t.name || "ギター " + (id + 1), bpm: t.bpm, meter: t.meter, voice: t.voice, notes: t.notes }, 0);
    list.unshift(take);
    if (list.length > GTR_TAKES_MAX) { list.length = GTR_TAKES_MAX; }
    return take;
  }
  function gtrTakeById(list, id) { for (var i = 0; i < list.length; i++) { if (list[i].id === id) { return list[i]; } } return null; }

  // ---------- §285: ゴリラウクレレのシーケンサーへ送る ----------
  var GTR_SEQ_MAX = 1000;
  function gtrSeqApi() { var U = window.UGUkulele; return U && U.seqLoad && U.xAdd ? U : null; }
  // テイクを、編集中の曲へ「🤘 ギター打ち込み」トラックとして送る → { ok, id, cut, msg }
  function gtrSendToSeq(take) {
    var U = gtrSeqApi();
    if (!U) { return { ok: false, msg: "ゴリラウクレレが読みこめませんでした" }; }
    if (!take || !take.notes || !take.notes.length) { return { ok: false, msg: "音のないテイクは送れません" }; }
    var st = U.seqLoad(), id = U.xAdd(st.cur.tracks, "gnotes");
    if (!id) { return { ok: false, msg: "追加トラックがいっぱいです（8本まで）。シーケンサーで1本消してから送ってね" }; }
    var t = st.cur.tracks[id], n = gtrNotesClean(take.notes), cut = n.length > GTR_SEQ_MAX;
    t.name = String(take.name).slice(0, 12);
    t.prog = gtrOpt(GTR_VOICES, take.voice)[2];
    t.notes = n.slice(0, GTR_SEQ_MAX);
    U.seqSave(st);
    return { ok: true, id: id, cut: cut, msg: "「" + take.name + "」を、ゴリラウクレレのシーケンサー（編集中の曲）に 🤘 ギター打ち込みトラックとして送りました" + (cut ? "（音が多いので、はじめの " + GTR_SEQ_MAX + " 音）" : "") };
  }
  // 伴奏の曲のコードの 7th の押さえ方にするか（コード名に 7・9・11・13）
  function gtrSongSev(name) { return /(7|9|11|13)/.test(String(name).split("/")[0]); }

  // ---------- はじめの画面 ----------
  function gtrSetup(root, ctl) {
    var p = gtrPrefs(), note = "";
    function opts(list, cur, attr) {
      var h = "", i;
      for (i = 0; i < list.length; i++) { h += '<button class="modal-btn quiz-opt' + (cur === list[i][0] ? " active" : "") + '" data-' + attr + '="' + list[i][0] + '">' + list[i][1] + '</button>'; }
      return h;
    }
    function draw() {
      var takes = gtrTakesLoad(), i;
      var html = '<div class="melody-setup"><h3 style="margin:0 0 4px;">&#x1F918; ゴリラギター</h3>' +
        '<p class="small" style="color:#adb5bd;margin:0 0 8px;">6本の弦で1音ずつ弾く「単音」と、コードをかき鳴らす「ストローク」。アコギもエレキも。</p>' +
        '<p class="small" style="margin:4px 0 2px;">弾き方</p><div class="quiz-opts">' + opts(GTR_VIEWS, p.view, "view") + '</div>' +
        '<p class="small" style="margin:4px 0 2px;">音色</p><div class="piano-opts">' + opts(GTR_VOICES, p.voice, "voice") + '</div>' +
        '<p class="small" style="margin:4px 0 2px;">音名</p><div class="quiz-opts">' + opts(GTR_NAMES, p.names, "names") + '</div>';
      var bl = BA() && BA().backList ? BA().backList() : [];
      if (bl.length) {
        html += '<p class="small" style="margin:6px 0 2px;">&#x1F3B8; 伴奏（ゴリラウクレレのシーケンサーの曲）</p><div class="piano-opts">' + opts([["-", "なし"]].concat(bl), p.backing || "-", "backing") + '</div>';
        if (p.backing) { html += '<div class="quiz-opts"><button class="modal-btn quiz-opt' + (p.backUke ? " active" : "") + '" data-backuke="1">伴奏のウクレレも鳴らす ' + (p.backUke ? "ON" : "OFF") + '</button></div>'; }
      }
      html += '<button class="modal-btn" data-go="1" style="width:100%;margin-top:8px;">&#x1F918; はじめる</button>' +
        '<p class="small" style="margin:10px 0 2px;">&#x1F399;&#xFE0F; 録音したテイク（' + takes.length + ' / ' + GTR_TAKES_MAX + '）</p>';
      if (note) { html += '<p class="small" style="color:#ffd166;margin:0 0 4px;">' + note + '</p>'; }
      if (!takes.length) { html += '<p class="small" style="color:#adb5bd;margin:0;">まだありません。弾く画面の「🔴 録音」で録れます。</p>'; }
      for (i = 0; i < takes.length; i++) {
        html += '<div class="piano-take"><span>' + escHtml(takes[i].name) + '<br><span class="small" style="color:#adb5bd;">' + takes[i].notes.length + '音・BPM ' + takes[i].bpm + '・' + gtrOpt(GTR_VOICES, takes[i].voice)[1] + '</span></span>' +
          '<button class="modal-btn" data-open="' + takes[i].id + '">&#x25B6;&#xFE0F; ひらく</button>' +
          '<button class="modal-btn" data-send="' + takes[i].id + '" title="シーケンサーへ送る">&#x1F3B8; 送る</button>' +
          '<button class="modal-btn" data-del="' + takes[i].id + '">&#x1F5D1;&#xFE0F;</button></div>';
      }
      // §286: リズムゲーム
      var best = gtrBest();
      html += '<p class="small" style="margin:12px 0 2px;">&#x1F3AE; リズムゲーム（落ちてくるコードを ⬇ ダウン・⬆ アップでかき鳴らす）</p><div class="quiz-opts">' + opts(GTR_RLEVELS, p.rlevel, "rlevel") + '</div><div class="quiz-opts">';
      for (i = 0; i < GTR_SPEEDS.length; i++) { html += '<button class="modal-btn quiz-opt' + (p.rspeed === GTR_SPEEDS[i] ? " active" : "") + '" data-rspeed="' + GTR_SPEEDS[i] + '">' + GTR_SPEEDS[i] + '%</button>'; }
      html += '</div>';
      for (i = 0; i < GTR_SONGS.length; i++) {
        var bs0 = best[GTR_SONGS[i][0] + "@" + p.rlevel + "@" + p.rspeed];
        html += '<button class="modal-btn quiz-cat-btn" data-song="' + GTR_SONGS[i][0] + '" style="width:100%;">' + escHtml(GTR_SONGS[i][1]) + '（BPM ' + GTR_SONGS[i][6] + '）' +
          ' <span class="small" style="color:#6b4f00;">' + new Array(GTR_SONGS[i][10] + 1).join("&#x2B50;") + (bs0 ? "・ベスト " + bs0.s + "（" + bs0.r + "）" : "") + '</span></button>';
      }
      html += '<button class="modal-btn" data-back="1" style="width:100%;margin-top:14px;">&#x1F579;&#xFE0F; メニューへ</button></div>';
      root.innerHTML = html;
      var btns = root.querySelectorAll("button"), j;
      for (j = 0; j < btns.length; j++) {
        btns[j].onclick = function (ev) {
          var el = ev.currentTarget, v;
          if ((v = el.getAttribute("data-view"))) { p.view = v; gtrSavePrefs(p); draw(); return; }
          if ((v = el.getAttribute("data-voice"))) { p.voice = v; gtrSavePrefs(p); draw(); return; }
          if ((v = el.getAttribute("data-names"))) { p.names = v; gtrSavePrefs(p); draw(); return; }
          if ((v = el.getAttribute("data-rlevel"))) { p.rlevel = v; gtrSavePrefs(p); draw(); return; }
          if ((v = el.getAttribute("data-rspeed"))) { p.rspeed = Number(v); gtrSavePrefs(p); draw(); return; }
          if ((v = el.getAttribute("data-song"))) { ctl.done({ mode: "rhythm", song: v, level: p.rlevel, speed: p.rspeed }); return; }
          if ((v = el.getAttribute("data-backing"))) { p.backing = v === "-" ? "" : v; gtrSavePrefs(p); draw(); return; }
          if (el.getAttribute("data-backuke")) { p.backUke = !p.backUke; gtrSavePrefs(p); draw(); return; }
          if ((v = el.getAttribute("data-send"))) {
            var rs = gtrSendToSeq(gtrTakeById(gtrTakesLoad(), Number(v)));
            note = (rs.ok ? "&#x2705; " : "&#x26A0;&#xFE0F; ") + escHtml(rs.msg);
            draw();
            return;
          }
          if ((v = el.getAttribute("data-del"))) {
            var list = gtrTakesLoad(), t = gtrTakeById(list, Number(v));
            if (!t || (window.confirm && !window.confirm("「" + t.name + "」を消しますか？"))) { return; }
            list.splice(list.indexOf(t), 1);
            gtrTakesSave(list);
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

  // ---------- §286: リズムゲーム（落ちてくるコードを ダウン／アップ でかき鳴らす）----------
  var GTR_BEST_KEY = "ultimateGorillaGuitarBestV1", GTR_LOOK = 1.6, GTR_SPEEDS = [70, 85, 100];
  var GTR_RLEVELS = [["easy", "かんたん"], ["normal", "ふつう"], ["hard", "むずかしい"]];
  // [id, 名前, ストロークのパターン, コード進行, キー, スケール, BPM, 小節, ゴリラドラム, ゴリラベースのパターン, ★]
  var GTR_SONGS = [
    ["pop", "ポップス", "folk", "royal", 0, "major", 100, 8, "g:8beat", "r5", 1], ["rock", "ロック", "down8", "pop4", 4, "major", 120, 8, "g:rock", "root8", 1],
    ["ballad", "バラード", "folk", "canon", 2, "major", 76, 8, "g:ballad", "root", 1], ["waltz", "ワルツ（3拍子）", "waltz", "canon", 0, "major", 108, 8, "g:waltz", "waltz2", 1],
    ["reggae", "レゲエ", "reggae", "minor3", 9, "minor", 80, 8, "g:onedrop", "reggae", 2], ["ska", "スカ", "ska", "fifty", 7, "major", 120, 8, "g:ska", "walk", 2],
    ["shuffle", "シャッフル", "shuffle", "blues12", 9, "major", 96, 12, "g:shuffle", "shuffle", 2], ["beat16", "16ビート", "beat16", "komuro", 0, "major", 92, 8, "g:beat16", "sixteen", 3],
    ["cut", "カッティング", "cut", "dorvamp", 2, "dorian", 96, 8, "g:funk", "funk", 3]
  ];
  function gtrSong(id) { return gtrOpt(GTR_SONGS, id); }
  function gtrBest() { var o = lsGet(GTR_BEST_KEY); return o && typeof o === "object" ? o : {}; }
  // 譜面 → { meter, notes: [{ beat, lane: 0 ダウン / 1 アップ, cut, d: 度数, name }] }
  // かんたん: 拍の頭の音だけ（カッティングはふつうのダウンに。拍の頭に音のない曲は1拍に1つ）/ ふつう: ダウン・アップ（カッティングはのぞく）/ むずかしい: カッティング（✕）も
  function gtrChart(song, level) {
    var pd = gtrPat(song[2]), meter = pd[3], pt = pd[2], L = pt.length, unit = meter / L, cp = BA().cprog(song[3]), out = [], b, ci;
    for (b = 0; b < song[7]; b++) {
      var d = cp ? BA().cprogAt(cp, b * meter, meter).d : 0, name = BA().chord(song[4], d, song[5]).name;
      for (ci = 0; ci < L; ci++) {
        var c = pt.charAt(ci), beat = b * meter + ci * unit, head = Math.abs(beat - Math.round(beat)) < 1e-6;
        if ("DUxs".indexOf(c) < 0) { continue; }
        var lane = c === "D" || c === "x" ? 0 : 1, cut = c === "x";
        if (level === "easy") { if (!head) { continue; } cut = false; }
        else if (level === "normal" && cut) { continue; }
        out.push({ beat: beat, lane: lane, cut: cut, d: d, name: name });
      }
    }
    if (level === "easy" && !out.length) {
      var all = gtrChart(song, "normal").notes, lastBeat = -1, i;
      for (i = 0; i < all.length; i++) { if (Math.floor(all[i].beat) !== lastBeat) { lastBeat = Math.floor(all[i].beat); out.push(all[i]); } }
    }
    return { meter: meter, notes: out };
  }
  function gtrRhythm(api, cfg) {
    var B = BA(), prefs = gtrPrefs(), panel = api.panel, frame = 0, ended = false, msg = "";
    if (panel && panel.classList) { panel.classList.add("quiz-panel"); }
    if (api.setCanvasHeight) { api.setCanvasHeight(GTR_H); }
    var song = gtrSong(cfg.song), level = gtrOpt(GTR_RLEVELS, cfg.level)[0], rate = (GTR_SPEEDS.indexOf(Number(cfg.speed)) >= 0 ? Number(cfg.speed) : 100) / 100;
    var chart = gtrChart(song, level), meter = chart.meter, spb = 60 / song[6] / rate, t0 = 0.5 + meter * spb, JG = B.JUDGE;
    var rn = [], counts = [0, 0, 0, 0], combo = 0, maxCombo = 0, judgeText = "", judgeFrames = 0, lastClick = -99, laneFlash = [0, 0], offs = [], i;
    for (i = 0; i < chart.notes.length; i++) { var cn = chart.notes[i]; rn.push({ t: t0 + cn.beat * spb, beat: cn.beat, lane: cn.lane, cut: cn.cut, d: cn.d, name: cn.name, j: -2 }); }
    var bars = song[7], endT = t0 + bars * meter * spb;
    function now() { return frame / 60; }
    var UG = window.UGMelody, audioOk = false, LAT = UG && UG.latency ? UG.latency() / 1000 : 0, buses = {};
    function audio() {
      if (audioOk || !UG || !UG.audioInit) { return; }
      try {
        if (UG.audioInit()) {
          audioOk = true;
          UG.loadSamples([gtrOpt(GTR_VOICES, prefs.voice)[2], GTR_MUTED, 33]);
          var D = window.UGDrum, dp = D && D.prefs ? D.prefs() : null;
          if (dp) { if (UG.setDrumSamples) { UG.setDrumSamples(dp.real); } if (UG.setDrumKit) { UG.setDrumKit(dp.kitId); } if (dp.real) { UG.loadSamples([UG.DRUM]); } }
        }
      } catch (e) {}
    }
    // 当てたノートのコードを、その向きでかき鳴らす
    function strumNote(n) {
      audio();
      if (!audioOk) { return; }
      var vd = gtrOpt(GTR_VOICES, prefs.voice), ac = UG.audio.ctx, sh = gtrShape(B.chord(song[4], n.d, song[5]), false);
      var order = n.lane === 1 ? [5, 4, 3, 2] : [0, 1, 2, 3, 4, 5], k = 0, j;
      for (j = 0; j < order.length; j++) {
        var m = sh.midis[order[j]];
        if (m === null) { continue; }
        try {
          var bus = gtrBus(buses, vd[0], prefs.gvol, gtrFx(prefs)), smp = !!(UG.samples && UG.samples.enabled && UG.sampleReady && UG.sampleReady(vd[2])), g = null, t = ac.currentTime + k * 0.012, lv = n.cut ? 0.35 : (n.lane ? 0.5 : 0.6);
          if (bus) { g = ac.createGain(); g.gain.value = lv * (smp ? GTR_BOOST : 1) * vd[4]; g.connect(bus); }
          var h = UG.synth(m, n.cut && vd[3] ? GTR_MUTED : vd[2], t, lv, g || undefined, GTR_HOLD);
          if (h && UG.voiceStop) { UG.voiceStop(h, t + (n.cut ? 0.05 : Math.max(0.3, spb * 1.5)), n.cut ? 0.02 : 0.1); }
        } catch (e) {}
        k++;
      }
    }
    // ゴリラドラムのリズムとゴリラベースのパターン（曲のあいだ）
    var D0 = window.UGDrum, dsteps = null, dlen = 16, dk = 0, bpd = null, bk = 0, bvo = null;
    try { dsteps = D0 && D0.patternSteps ? D0.patternSteps(song[8]) : null; dlen = D0 && D0.patLen ? D0.patLen(song[8]) : 16; } catch (e0) {}
    try { bpd = B.patById(B.patterns(meter), song[9]); if (!bpd || bpd[0] !== song[9] || bpd[3] !== meter) { bpd = null; } } catch (e1) {}
    function band() {
      var ac = audioOk && UG.audio ? UG.audio.ctx : null, n = 0, k;
      if (!ac) { return; }
      while (dsteps && n++ < 16) {
        var du = meter / dlen, tt = t0 + dk * du * spb, dt = tt - now();
        if (dt > 0.1 || tt >= endT - 1e-6) { break; }
        var s = dk % dlen;
        dk++;
        if (dt < -0.05) { continue; }
        for (k = 0; k < dsteps.length; k++) {
          if (dsteps[k][1].indexOf(s) < 0) { continue; }
          var lv = 0.8;
          try { lv = D0.patVel ? D0.patVel(dsteps[k][0], s % 16, false) : 0.8; } catch (e) {}
          try { UG.synth(dsteps[k][0], UG.DRUM, ac.currentTime + dt, lv * 0.7, B.bus(buses, "d", prefs.dvol) || undefined); } catch (e2) {}
        }
      }
      n = 0;
      while (bpd && n++ < 16) {
        var pt = bpd[2], u = meter / pt.length, b = bk * u, ci = bk % pt.length, tb = t0 + b * spb, db = tb - now();
        if (db > 0.1 || tb >= endT - 1e-6) { break; }
        bk++;
        if (db < -0.05) { continue; }
        var c = pt.charAt(ci);
        if (c === "-" && ci === 0) { c = "R"; }
        if (c === "-") { continue; }
        var cp = B.cprog(song[3]), ca = cp ? B.cprogAt(cp, b, meter) : { d: 0, next: 0, left: 99 }, last = Math.floor(b / meter + 1e-6) + 1 >= bars;
        var m = B.tokNote(c, B.chord(song[4], ca.d, song[5]), last ? null : B.chord(song[4], ca.next, song[5]), ca.left), when = ac.currentTime + db;
        if (bvo && UG.voiceStop) { try { UG.voiceStop(bvo, when, 0.03); } catch (e3) {} }
        try {
          var bus2 = B.bus(buses, "b", prefs.bvol, false), smp2 = !!(UG.samples && UG.samples.enabled && UG.sampleReady && UG.sampleReady(33)), g2 = null;
          if (bus2) { g2 = ac.createGain(); g2.gain.value = 0.85 * (smp2 ? 4 : 1); g2.connect(bus2); }
          bvo = UG.synth(m, 33, when, 0.85, g2 || undefined, 8) || null;
          if (bvo && UG.voiceStop) { UG.voiceStop(bvo, when + B.tokLen(pt, ci) * u * spb * 0.92, 0.04); }
        } catch (e4) {}
      }
    }
    function hit(lane) {
      if (ended || !(lane === 0 || lane === 1)) { return; }
      laneFlash[lane] = 8;
      var t = now() - LAT, best = null, k;
      for (k = 0; k < rn.length; k++) {
        var n = rn[k];
        if (n.t - t > JG[2][0]) { break; }
        if (n.j !== -2 || n.lane !== lane || Math.abs(t - n.t) > JG[2][0]) { continue; }
        if (!best || Math.abs(t - n.t) < Math.abs(t - best.t)) { best = n; }
      }
      if (!best) { return; }
      var g = B.rjudge(t - best.t);
      best.j = g; counts[g]++; combo++; maxCombo = Math.max(maxCombo, combo); offs.push(t - best.t);
      strumNote(best);
      api.addScore(JG[g][2] + Math.min(50, combo) * 2);
      judgeText = JG[g][1]; judgeFrames = 30;
    }
    function finish() {
      if (ended) { return; }
      ended = true;
      var acc = rn.length ? (counts[0] + counts[1] * 0.7 + counts[2] * 0.4) / rn.length : 0, rk = B.rank(acc), best = gtrBest();
      if (rn.length && counts[3] === 0) { api.addScore(500); }
      var key = song[0] + "@" + level + "@" + Math.round(rate * 100), sc = api.getScore();
      if (!best[key] || !(best[key].s >= sc)) { best[key] = { s: sc, r: rk }; lsSet(GTR_BEST_KEY, best); }
      msg = "ランク <b>" + rk + "</b>（正確さ " + Math.round(acc * 100) + "%）・最大コンボ " + maxCombo + (counts[3] === 0 ? "・&#x1F525; フルコンボ +500" : "") +
        "<br>PERFECT " + counts[0] + " / GREAT " + counts[1] + " / GOOD " + counts[2] + " / MISS " + counts[3];
      var td = B.tendency ? B.tendency(offs) : null;
      if (td) { msg += "<br>" + td.text; }
      render();
      api.gameOver("ランク " + rk);
    }
    function render() {
      if (!panel) { return; }
      panel.innerHTML = '<p class="small" style="margin:4px 0 0;">&#x1F3AE; ' + escHtml(song[1]) + '（' + gtrOpt(GTR_RLEVELS, level)[1] + '・BPM ' + Math.round(song[6] * rate) + '・' + rn.length + '回）</p>' +
        '<p class="small" style="margin:4px 0 0;">⬇ の音符は左（ダウン・キー J）、⬆ は右（アップ・キー K）をタップ。音符にはそのときのコード' + (level === "hard" ? "。✕ はカッティング（左）" : "") + '</p>' +
        (msg ? '<p class="small" style="margin:4px 0 0;color:#ffd166;">' + msg + '</p>' : "");
    }
    render();
    function text(ctx, s, x, y, size, color) { ctx.fillStyle = color; ctx.font = "bold " + size + "px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(s, x, y); }
    var TOP = 26, HIT = GTR_H - 50, LW = (W - 8) / 2;
    return {
      input: function (a, down) { if (down && (a === "down" || a === "up")) { audio(); hit(a === "down" ? 0 : 1); } },
      pointer: function (type, x, y) { if (type === "down" && y >= TOP) { audio(); hit(x < W / 2 ? 0 : 1); } },
      step: function () {
        frame++;
        if (judgeFrames > 0) { judgeFrames--; }
        if (laneFlash[0] > 0) { laneFlash[0]--; }
        if (laneFlash[1] > 0) { laneFlash[1]--; }
        if (ended) { return; }
        var t = now() - LAT, left = 0, k;
        for (k = 0; k < rn.length; k++) {
          if (rn[k].j === -2 && t - rn[k].t > JG[2][0]) { rn[k].j = -1; counts[3]++; combo = 0; judgeText = "MISS"; judgeFrames = 30; }
          if (rn[k].j === -2) { left++; }
        }
        var sb = Math.floor((now() - t0) / spb);
        if (sb < 0 && sb >= -meter && sb !== lastClick) {
          lastClick = sb; audio();
          if (audioOk) { try { UG.synth(sb === -meter ? 37 : 42, UG.DRUM, 0, sb === -meter ? 0.9 : 0.6); } catch (e) {} }
        }
        if (audioOk) { band(); }
        if (!left && t > Math.max(endT, rn.length ? rn[rn.length - 1].t + 1 : 0)) { finish(); }
      },
      draw: function (ctx) {
        ctx.fillStyle = "#1b1f3b";
        ctx.fillRect(0, 0, W, GTR_H);
        hudText(ctx, "🎮 " + song[1], 8, 10, "left");
        hudText(ctx, "コンボ " + combo, W - 8, 10, "right");
        var t = now() - LAT, k;
        for (k = 0; k < 2; k++) {
          var x = 4 + k * LW;
          ctx.fillStyle = laneFlash[k] > 0 ? "rgba(255,209,102,0.25)" : (k ? "#232a4d" : "#1f2546");
          ctx.fillRect(x + 1, TOP, LW - 2, GTR_H - TOP);
          text(ctx, k ? "⬆ アップ" : "⬇ ダウン", x + LW / 2, HIT + 28, 15, "#adb5bd");
        }
        ctx.fillStyle = "#ffd166";
        ctx.fillRect(4, HIT - 1, W - 8, 3);
        for (k = 0; k < rn.length; k++) {
          var n = rn[k];
          if (n.t - t > GTR_LOOK) { break; }
          if (n.j !== -2 || t - n.t > 0.25) { continue; }
          var y = HIT - (n.t - t) / GTR_LOOK * (HIT - TOP), nx = 4 + n.lane * LW;
          ctx.fillStyle = n.cut ? "#868e96" : (n.lane ? "#ffa8a8" : "#74c0fc");
          ctx.fillRect(nx + 10, y - 11, LW - 20, 22);
          text(ctx, (n.cut ? "✕ " : (n.lane ? "⬆ " : "⬇ ")) + n.name, nx + LW / 2, y, 14, "#14213d");
        }
        var c0 = Math.ceil((t0 - now()) / spb);
        if (now() < t0 && c0 >= 1 && c0 <= meter) { text(ctx, String(c0), W / 2, GTR_H / 2 - 20, 40, "#ffd166"); }
        if (judgeFrames > 0) { text(ctx, judgeText, W / 2, HIT - 40, 20, judgeText === "MISS" ? "#ff6b6b" : "#ffd166"); }
      }
    };
  }

  // コードは 1〜7、J ダウン・K アップ・L カッティング、Z 録音・X 再生
  var GTR_KEYS = { "1": "c0", "2": "c1", "3": "c2", "4": "c3", "5": "c4", "6": "c5", "7": "c6", j: "down", k: "up", l: "cut", z: "rec", x: "play", b: "pat", m: "pmute" };

  I.register({
    id: "guitar",
    after: "bass",
    cat: "music",
    music: true,
    name: "ゴリラギター",
    icon: "&#x1F918;",
    desc: "6本の弦で1音ずつ弾く「単音」と、コードをかき鳴らす「ストローク」。アコギもエレキも",
    help: "🎮 リズムゲームは ⬇ の音符で左（J）・⬆ で右（K）/ 単音: フレットをタップ（同じ弦ですべらせるとスライド）/ ストローク: 弦の上を指で下（手前の6弦）から上へ ＝ ダウン・上から下 ＝ アップ、コードは手前の段か 1〜7 / J ダウン・K アップ・L カッティング・M ブリッジミュート / B パターン / Z 録音 / X 再生 / P一時停止",
    controls: [],
    keys: GTR_KEYS,
    setup: gtrSetup,
    setupLabel: "音色・テイク",
    panel: true,
    create: function (api, cfg) {
      cfg = cfg || {};
      if (cfg.mode === "rhythm") { gtrLayout({}); return gtrRhythm(api, cfg); } // §286
      var B = BA(), prefs = gtrPrefsFull(), view = prefs.view, names = prefs.names;
      var frame = 0, msg = "", chordD = 0, panel = api.panel;
      if (panel && panel.classList) { panel.classList.add("quiz-panel"); }
      // §288: よこ向き・持ち方・右手ピッキング → 板の形
      function applyLand() {
        if (api.setLandscape) { api.setLandscape(prefs.land); }
        var box = panel && panel.parentNode;
        gtrLayout({ land: prefs.land, h: prefs.land && box && B.landH ? B.landH(box.clientWidth, box.clientHeight) : 130, pick: prefs.pick && view === "fret", cgrid: prefs.cgrid && view === "chord" && !cfg.backing, cpos: prefs.cpos });
        if (api.setCanvasHeight) { api.setCanvasHeight(GTR_H); }
      }
      applyLand();
      function now() { return frame / 60; }
      function voiceDef() { return gtrOpt(GTR_VOICES, prefs.voice); }

      // --- 音 ---
      var UG = window.UGMelody, audioOk = false, buses = {};
      function audio() {
        if (audioOk || !UG || !UG.audioInit) { return; }
        try { if (UG.audioInit()) { audioOk = true; UG.loadSamples([voiceDef()[2], GTR_MUTED, 33]); } } catch (e) {}
      }
      // 1音（when: AudioContext の秒・省略可）→ 音のハンドル
      // prog（省略可）: サンプルの音色を変える（エレキのカッティング）
      function sound(m, lv, when, voice, prog0) {
        audio();
        if (!audioOk) { return null; }
        var vd = gtrOpt(GTR_VOICES, voice || prefs.voice), prog = prog0 || vd[2], h = null;
        try {
          var bus = gtrBus(buses, vd[0], prefs.gvol, gtrFx(prefs)), smp = !!(UG.samples && UG.samples.enabled && UG.sampleReady && UG.sampleReady(prog)), d;
          if (bus) { d = UG.audio.ctx.createGain(); d.gain.value = lv * (smp ? GTR_BOOST : 1) * vd[4]; d.connect(bus); }
          h = UG.synth(m, prog, when || 0, lv, d, GTR_HOLD) || null;
        } catch (e) {}
        return h;
      }
      function stopVoice(h, when, fade) { if (h && UG.voiceStop) { try { UG.voiceStop(h, when || 0, fade || 0.08); } catch (e) {} } }
      function click(accent) { if (audioOk) { try { UG.synth(accent ? 37 : 42, UG.DRUM, 0, accent ? 0.9 : 0.6); } catch (e) {} } }

      // --- 弦ごとに鳴っている音（1本の弦は1音だけ）---
      var strVo = [null, null, null, null, null, null], vib = [0, 0, 0, 0, 0, 0];
      // 弦 sn で音 m を鳴らす（dt: いまから何秒あと）
      function playString(sn, m, lv, dt) {
        var ac = audioOk && UG.audio ? UG.audio.ctx : null, when = ac && dt ? ac.currentTime + dt : 0, pm = prefs.pmute;
        stopString(sn, when);
        // §296: ブリッジミュート ＝ 短く（エレキはミュートのサンプル）
        strVo[sn] = { h: sound(m, pm ? lv * 0.9 : lv, when, null, pm && voiceDef()[3] ? GTR_MUTED : 0), m: m, cur: m };
        vib[sn] = pm ? 10 : 30;
        recOn("s" + sn, m, lv, dt || 0);
        if (pm) {
          if (strVo[sn].h && ac) { stopVoice(strVo[sn].h, (when || ac.currentTime) + GTR_PMUTE, 0.04); }
          recOff("s" + sn);
        }
      }
      function stopString(sn, when) {
        if (!strVo[sn]) { return; }
        stopVoice(strVo[sn].h, when, 0.08);
        strVo[sn] = null;
        recOff("s" + sn);
      }
      function bendString(sn, m) {
        var v = strVo[sn];
        if (!v) { return; }
        v.cur = m;
        if (v.h && UG.voiceBend) { try { UG.voiceBend(v.h, m, 0, 0.07); } catch (e) {} }
        recOff("s" + sn);
        recOn("s" + sn, m, 0.8, 0);
      }

      // --- コード ---
      // §285: 伴奏のときは曲のコード（拍 beat。省略は いま）
      function songIdx(beat) { return back && back.chords.length ? B.chordIdx(back.chords, beat === undefined ? (bk ? backBeat() : -1) : beat) : -1; }
      // §294: d 番目のコード（自分のコードのときは枠のコード名から）とその押さえ方
      function chordObj(d) {
        if (prefs.myOn) { var c = B.songChord(gtrSlotName(prefs.myc[d]), prefs.key); if (c) { c.deg = ""; return c; } }
        return B.chord(prefs.key, d, prefs.scale, prefs.sev);
      }
      // §297: パワーコード・カポ（カポ c ＝ c 半音下の形を c フレット上で）。capo には c を残す（押さえ方の数字はカポからの数）
      function modShape(pc, q, b) {
        var c = prefs.capo, sh = gtrShapeQ((pc - c + 12) % 12, prefs.power ? "pow" : q, b >= 0 ? (b - c + 12) % 12 : -1);
        if (!c) { sh.capo = 0; return sh; }
        var fr = sh.frets.map(function (f) { return f === null ? null : f + c; });
        return { frets: fr, midis: fr.map(function (f, sn) { return f === null ? null : GTR_OPEN[sn] + f; }), q: sh.q, capo: c };
      }
      function shapeOf(d) {
        var sl = prefs.myc[d], ch;
        if (prefs.myOn) { return modShape(sl.r, sl.q, sl.b); }
        ch = B.chord(prefs.key, d, prefs.scale, prefs.sev);
        return modShape(gtrPc(ch.r), gtrQuality(ch, prefs.sev), -1);
      }
      function curChord() { var k = songIdx(); return k >= 0 ? back.chords[k].ch : chordObj(chordD); }
      function shapeAt(beat) { var k = songIdx(beat), sc; if (k < 0) { return shapeOf(chordD); } sc = back.chords[k]; return modShape(gtrPc(sc.ch.r), gtrQuality(sc.ch, gtrSongSev(sc.name)), -1); }
      function curShape() { return shapeAt(); }
      function setChord(d) {
        if (back) { return; }
        if (prefs.cprog) { prefs.cprog = ""; gtrSavePrefs(prefs); }
        if (pat) { pend = d; flash["c" + d] = 10; render(); return; } // §284: パターン中は次の小節の頭で
        chordD = d; flash["c" + d] = 10; render();
      }
      var flash = {};
      // ストローク: dir "down"（6弦 → 1弦）/ "up"（1弦 → 4弦）/ "cut"（ミュートの短い音）
      // dt（省略可）: いまから何秒あと（パターン）。"short": 短いアップ（裏打ち）
      function strum(dir, dt, lvMul, shp) {
        audio();
        var sh = shp || curShape(), order = dir === "up" || dir === "short" ? [5, 4, 3, 2] : [0, 1, 2, 3, 4, 5], k = 0, i, d0 = dt || 0, lm = lvMul || 1;
        var ac = audioOk && UG.audio ? UG.audio.ctx : null, when0 = ac && d0 ? ac.currentTime + d0 : 0;
        for (i = 0; i < order.length; i++) {
          var sn = order[i], m = sh.midis[sn];
          if (m === null) { continue; }
          if (dir === "cut") {
            var h = sound(m, (voiceDef()[3] ? 0.6 : 0.35) * lm, ac ? ac.currentTime + d0 + k * 0.004 : 0, null, voiceDef()[3] ? GTR_MUTED : 0);
            stopString(sn, when0);
            if (h && ac) { stopVoice(h, ac.currentTime + d0 + 0.05 + k * 0.004, 0.02); }
            vib[sn] = 8;
          } else {
            playString(sn, m, (dir === "down" ? 0.6 : 0.5) * lm, d0 + k * (dir === "short" ? 0.008 : 0.012));
            if (dir === "short" && ac && strVo[sn] && strVo[sn].h) { stopVoice(strVo[sn].h, ac.currentTime + d0 + 0.12, 0.03); }
          }
          k++;
        }
        if (dir === "cut" && !voiceDef()[3] && UG && UG.bassHit && audioOk) { try { UG.bassHit("ghost", when0 || 0, 0.5, gtrBus(buses, prefs.voice, prefs.gvol, gtrFx(prefs)) || undefined); } catch (e) {} }
      }

      // --- §284: パターン（ストローク・ドラム・ベース）---
      var pat = null, pend = -1; // pat: { t0, k, d, unit, dk, bk, bvo, lastBar } / pend: 次の小節の頭で変えるコード
      function patTime(b) { return pat.back ? now() + (back.s.tm(b) - backT()) : pat.t0 + b * 60 / bpm; }
      function patStart() {
        patStop();
        audio();
        if (back && !bk) { backStart(0); }
        var d = gtrPat(prefs.pat);
        if (d[3] !== meter) { d = gtrPat(meter === 3 ? "waltz" : "down8"); }
        pat = { back: !!(back && bk), t0: rec && !rec.back ? rec.t0 : now() + 0.1, k: 0, d: d, unit: d[3] / d[2].length, dk: 0, bk: 0, bvo: null, lastBar: -1 };
        if (pat.back) { pat.k = Math.max(0, Math.ceil(backBeat() / pat.unit - 1e-6)); }
        drumInit();
      }
      function patStop() {
        if (!pat) { return; }
        if (pat.bvo) { stopVoice(pat.bvo, 0, 0.06); }
        pat = null;
        if (pend >= 0) { chordD = pend; pend = -1; }
      }
      // パターン・ドラム・ベースを切りかえたとき: 拍の位置はそのまま、次のマスから
      function patRetime() {
        var d = gtrPat(prefs.pat), bd;
        if (d[3] !== meter) { d = gtrPat(meter === 3 ? "waltz" : "down8"); }
        pat.d = d; pat.unit = d[3] / d[2].length;
        drumInit();
        var bt = pat.back ? backBeat() : (now() - pat.t0) * bpm / 60;
        function at(u) { return Math.max(0, Math.ceil(bt / u - 1e-6)); }
        pat.k = at(pat.unit); pat.dk = at(0.25); bd = bassDef(); pat.bk = bd ? at(meter / bd[2].length) : 0;
      }
      function patToggle() { if (pat) { patStop(); } else { if (play) { playStop(); } patStart(); } render(); }
      // 小節の頭: 予約したコード・コード進行
      function barChord(b) {
        var bar = Math.floor(b / meter + 1e-6), cp = B.cprog(prefs.cprog);
        if (bar === pat.lastBar) { return; }
        pat.lastBar = bar;
        if (pend >= 0) { chordD = pend; pend = -1; flash["c" + chordD] = 10; }
        else if (cp) { var ca = B.cprogAt(cp, b, meter); if (ca.d !== chordD) { chordD = ca.d; flash["c" + chordD] = 10; } }
      }
      function nextChord(b) {
        var cp = B.cprog(prefs.cprog);
        if (pend >= 0) { return chordObj(pend); }
        return cp ? chordObj(B.cprogAt(cp, b, meter).next) : null;
      }
      function patStep() {
        var d = pat.d, pt = d[2], unit = pat.unit, per = pt.length / d[3], n = 0;
        while (pat && n++ < 32) {
          var b = pat.k * unit, ci = pat.k % pt.length, sb = b + B.swingOf(prefs.swing, per, ci) * unit, dt = patTime(sb) - now();
          if (dt > 0.1 || (pat.back && b >= back.s.beats - 1e-6)) { break; }
          pat.k++;
          if (ci === 0 && !pat.back) { barChord(b); }
          if (dt < -0.05) { continue; }
          var c = pt.charAt(ci), dd = Math.max(0, dt), sh = pat.back ? shapeAt(b) : curShape();
          if (c === "D") { strum("down", dd, 1, sh); }
          else if (c === "U") { strum("up", dd, 1, sh); }
          else if (c === "x") { strum("cut", dd, 1, sh); }
          else if (c === "s") { strum("short", dd, 1, sh); }
          else if (c !== "-") { var sn = gtrArpString(sh, c); if (sn >= 0) { playString(sn, sh.midis[sn], c === "B" ? 0.7 : 0.6, dd); } }
        }
      }
      // ゴリラドラムのループ（拍子が合うもの）
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
      function drumStep() {
        var dd = drumDef(), D = window.UGDrum, ac = audioOk && UG.audio ? UG.audio.ctx : null, n = 0, i;
        if (!dd || !ac) { return; }
        var du = meter / dd.len, bper = pat.d[2].length / meter;
        while (n++ < 16) {
          var s = pat.dk % dd.len, sw = (bper === 2 && s % 4 === 2) || (bper === 4 && s % 2 === 1) ? gtrOpt(B.SWINGS, prefs.swing)[2] * pat.unit : 0;
          var dt = patTime(pat.dk * du + sw) - now();
          if (dt > 0.1) { break; }
          pat.dk++;
          if (dt < -0.05) { continue; }
          for (i = 0; i < dd.steps.length; i++) {
            if (dd.steps[i][1].indexOf(s) < 0) { continue; }
            var lv = 0.8;
            try { lv = D.patVel ? D.patVel(dd.steps[i][0], s % 16, false) : 0.8; } catch (e) {}
            try { UG.synth(dd.steps[i][0], UG.DRUM, ac.currentTime + Math.max(0, dt), lv * 0.75, B.bus(buses, "d", prefs.dvol) || undefined); } catch (e2) {}
          }
        }
      }
      // ゴリラベースのパターン（拍子が合うもの）
      function bassDef() {
        if (!prefs.bpat) { return null; }
        var d = B.patById(B.patterns(meter), prefs.bpat);
        return d && d[0] === prefs.bpat && d[3] === meter ? d : null;
      }
      function bassStep() {
        var bd = bassDef(), ac = audioOk && UG.audio ? UG.audio.ctx : null, n = 0;
        if (!bd || !ac) { return; }
        var pt = bd[2], unit = meter / pt.length, per = pt.length / meter, spb = 60 / bpm;
        while (n++ < 16) {
          var b = pat.bk * unit, ci = pat.bk % pt.length, dt = patTime(b + B.swingOf(prefs.swing, per, ci) * unit) - now();
          if (dt > 0.1) { break; }
          pat.bk++;
          if (dt < -0.05) { continue; }
          var c = pt.charAt(ci);
          if (c === "-" && ci === 0) { c = "R"; }
          if (c === "-") { continue; }
          var ch = chordObj(ci === 0 ? barChordAhead(b) : chordD), nx = nextChord(b), left = Math.floor(b / meter + 1e-6) * meter + meter - b;
          var m = B.tokNote(c, ch, nx, left), len = B.tokLen(pt, ci) * unit, when = ac.currentTime + Math.max(0, dt);
          if (pat.bvo) { stopVoice(pat.bvo, when, 0.03); }
          try {
            var bus = B.bus(buses, "b", prefs.bvol, false), smp = !!(UG.samples && UG.samples.enabled && UG.sampleReady && UG.sampleReady(33)), g = null;
            if (bus) { g = ac.createGain(); g.gain.value = 0.85 * (smp ? 4 : 1); g.connect(bus); }
            pat.bvo = UG.synth(m, 33, when, 0.85, g || undefined, 8) || null;
            if (pat.bvo) { stopVoice(pat.bvo, when + len * spb * 0.92, 0.04); }
          } catch (e) {}
        }
      }
      // 小節の頭のベースのコード（ストロークより先に予約されるときも、変わったあとのコード）
      function barChordAhead(b) {
        var cp = B.cprog(prefs.cprog);
        if (pend >= 0) { return pend; }
        return cp ? B.cprogAt(cp, b, meter).d : chordD;
      }

      // --- 録音・再生 ---
      var bpm = prefs.bpm, meter = 4, metro = prefs.metro, takes = gtrTakesLoad();
      var take = cfg.take ? gtrTakeById(takes, cfg.take) : null, rec = null, play = null;
      if (take) { msg = "「" + escHtml(take.name) + "」をひらきました。▶ 再生で聴けます"; }
      // §285: 伴奏（シーケンサーの曲）。bk ＝ 鳴らしているあいだ
      var back = cfg.backing && B.backing ? B.backing(cfg.backing) : null, bk = null;
      if (back) { bpm = back.seq.bpm; meter = back.seq.meter; if (!take) { msg = "&#x1F3B8; 伴奏に合わせて弾こう。押さえ方は曲のコードに合わせて変わります"; } }
      else if (cfg.backing) { msg = "伴奏の曲が見つかりませんでした（ゴリラウクレレのシーケンサーで曲を作ってね）"; }
      function backApi() { var U = window.UGUkulele; return U && U.seqPlayEvent ? U : null; }
      function backT() { return bk ? (frame - bk.f0) / 60 : 0; }
      function backBeat() { var S = back.s, t = backT(); return t < S.lead ? (t - S.lead) / S.spb : S.beatAt(t); }
      // pre: 伴奏の前に空ける秒（曲にカウントインがないときの録音）
      function backStart(pre) {
        backStop();
        audio();
        var U = backApi(), progs = [24], ids, i;
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
        var U = backApi();
        if (bk.fx && U && U.fxPop) { try { U.fxPop(); } catch (e) {} }
        bk = null;
        if (pat && pat.back) { patStop(); }
      }
      // 曲のイベントを鳴らすか（曲のウクレレは backUke のときだけ）
      function backOn(ev) { return B.backEventOn(ev, back.seq, back.s.lead, false) && (prefs.backUke || ev.track !== "uke"); }
      function backStep() {
        var S = back.s, t = backT(), U = backApi(), ac = audioOk && UG.audio ? UG.audio.ctx : null, ev;
        while (bk.idx < S.events.length && (ev = S.events[bk.idx]).t <= t + 0.1) {
          if (ac && U && backOn(ev)) {
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
          if (play) { playStop(); }
          render();
        }
      }
      function backToggle() { if (bk) { if (rec) { recStop(); } backStop(); playStop(); } else { backStart(0); } render(); }
      function recBeat() { return rec ? (rec.back ? backBeat() : (now() - rec.t0) * bpm / 60) : 0; }
      function r3(v) { return Math.round(v * 1000) / 1000; }
      function recToggle() {
        if (rec) { recStop(); return; }
        playStop();
        audio();
        var wasPat = !!pat;
        if (back) {
          // 曲にカウントインがなければ、ギターが1小節ぶん数える
          backStart(back.s.lead ? 0 : meter * back.s.spb);
          rec = { back: true, notes: [], open: {}, beat: -99 };
        } else { rec = { t0: now() + meter * 60 / bpm, notes: [], open: {}, beat: -meter - 1 }; }
        if (wasPat) { patStart(); }
        msg = "";
        render();
      }
      function recOn(id, m, v, dt) {
        if (!rec) { return; }
        var b = recBeat() + (dt || 0) * bpm / 60;
        if (b < -0.25 || rec.notes.length >= GTR_NOTES_MAX) { return; }
        rec.open[id] = [Math.max(0, b), m, v || 0.8];
      }
      function recOff(id) {
        if (!rec || !rec.open[id]) { return; }
        var o = rec.open[id];
        delete rec.open[id];
        var nt = [r3(o[0]), r3(Math.max(0.0625, recBeat() - o[0])), o[1]];
        if (o[2] !== 0.8) { nt.push(r3(o[2])); }
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
          take = gtrTakeAdd(takes, { bpm: bpm, meter: meter, voice: prefs.voice, notes: n });
          gtrTakesSave(takes);
          msg = "&#x1F4BE; 「" + escHtml(take.name) + "」に保存しました（" + take.notes.length + "音）";
        } else { msg = "音がなかったので保存しませんでした"; }
        render();
      }
      function playBeat() { return play ? (play.back ? backBeat() : (now() - play.t0) * play.bpm / 60) : 0; }
      function playStop() {
        if (!play) { return; }
        var wasBack = play.back;
        for (var i = 0; i < play.vo.length; i++) { stopVoice(play.vo[i].h, 0, 0.06); }
        play = null;
        if (wasBack) { backStop(); }
      }
      function playToggle() {
        if (play) { playStop(); render(); return; }
        if (rec) { return; }
        if (!take || !take.notes.length) { msg = "まだテイクがありません。🔴 録音で録ってね"; render(); return; }
        audio();
        if (back) { backStart(0); }
        play = { back: !!back, t0: now() + 0.1, bpm: take.bpm, notes: take.notes, idx: 0, vo: [], voice: take.voice };
        render();
      }

      // --- パネル ---
      function action(v) {
        if (v === "rec") { recToggle(); }
        else if (v === "play") { playToggle(); }
        else if (v === "metro") { metro = !metro; prefs.metro = metro; gtrSavePrefs(prefs); render(); }
        else if (v === "bpmdown" || v === "bpmup") {
          if (rec) { return; }
          var pcb = pat ? (now() - pat.t0) * bpm / 60 : 0;
          bpm = Math.max(40, Math.min(240, bpm + (v === "bpmup" ? 5 : -5)));
          if (pat) { pat.t0 = now() - pcb * 60 / bpm; }
          prefs.bpm = bpm; gtrSavePrefs(prefs); render();
        }
        else if (/^view:/.test(v)) { allOff(); view = prefs.view = v.substring(5) === "chord" ? "chord" : "fret"; gtrSavePrefs(prefs); applyLand(); render(); }
        else if (/^voice:/.test(v)) { allOff(); prefs.voice = gtrOpt(GTR_VOICES, v.substring(6))[0]; gtrSavePrefs(prefs); if (audioOk) { try { UG.loadSamples([voiceDef()[2]]); } catch (e) {} } render(); }
        else if (/^tab:/.test(v)) { var tb0 = v.substring(4); prefs.tab = ["play", "pat", "band", "key"].indexOf(tb0) >= 0 ? tb0 : "play"; gtrSavePrefs(prefs); render(); }
        else if (v === "posdown" || v === "posup") { allOff(); prefs.pos = Math.max(0, Math.min(GTR_POS_MAX, prefs.pos + (v === "posup" ? 1 : -1))); gtrSavePrefs(prefs); render(); }
        else if (v === "keydown" || v === "keyup") { prefs.key = (prefs.key + (v === "keyup" ? 1 : 11)) % 12; gtrSavePrefs(prefs); render(); }
        else if (v === "sev") { prefs.sev = !prefs.sev; gtrSavePrefs(prefs); render(); }
        // §294: 自分のコード（いまのコードの枠を変える）
        else if (v === "myon") { prefs.myOn = !prefs.myOn; if (prefs.myOn && !prefs.myEdit) { prefs.myc = gtrDefaultSlots(prefs.key, prefs.scale, prefs.sev); } gtrSavePrefs(prefs); render(); }
        else if (v === "myr:-" || v === "myr:+") { var sl = prefs.myc[chordD]; sl.r = (sl.r + (v === "myr:+" ? 1 : 11)) % 12; prefs.myEdit = true; gtrSavePrefs(prefs); strum("down"); render(); }
        else if (/^myq:/.test(v)) { prefs.myc[chordD].q = gtrOpt(GTR_CTYPES, v.substring(4))[0]; prefs.myEdit = true; gtrSavePrefs(prefs); strum("down"); render(); }
        else if (/^myb:/.test(v)) { var bb = Number(v.substring(4)); prefs.myc[chordD].b = bb >= 0 && bb <= 11 ? bb : -1; prefs.myEdit = true; gtrSavePrefs(prefs); strum("down"); render(); }
        else if (v === "myreset") { prefs.myc = gtrDefaultSlots(prefs.key, prefs.scale, prefs.sev); prefs.myEdit = false; gtrSavePrefs(prefs); render(); }
        else if (/^scale:/.test(v)) { prefs.scale = B.scale(v.substring(6))[0]; gtrSavePrefs(prefs); render(); }
        else if (v === "down" || v === "up" || v === "cut") { strum(v); }
        else if (v === "pat") { patToggle(); }
        else if (v === "fxc" || v === "fxd" || v === "fxr") { prefs[v] = (prefs[v] + 1) % (v === "fxc" ? 2 : 3); gtrSavePrefs(prefs); gtrBus(buses, prefs.voice, prefs.gvol, gtrFx(prefs)); render(); } // §298
        else if (v === "power") { prefs.power = !prefs.power; gtrSavePrefs(prefs); render(); } // §297
        else if (v === "capo:-" || v === "capo:+") { prefs.capo = Math.max(0, Math.min(GTR_CAPO_MAX, prefs.capo + (v === "capo:+" ? 1 : -1))); gtrSavePrefs(prefs); render(); }
        else if (v === "pmute") { prefs.pmute = !prefs.pmute; gtrSavePrefs(prefs); render(); } // §296
        else if (v === "pick") { allOff(); held = {}; picks = {}; prefs.pick = !prefs.pick; applyLand(); gtrSavePrefs(prefs); render(); }
        else if (v === "cpos") { var cl = prefs.cgrid ? ["near", "far"] : ["near", "far", "side"]; prefs.cpos = cl[(cl.indexOf(prefs.cpos) + 1) % cl.length]; gtrSavePrefs(prefs); applyLand(); render(); }
        else if (v === "cgrid") { allOff(); prefs.cgrid = !prefs.cgrid; gtrSavePrefs(prefs); applyLand(); render(); }
        else if (v === "land") { allOff(); held = {}; picks = {}; prefs.land = !prefs.land; gtrSavePrefs(prefs); applyLand(); render(); }
        else if (/^grip:/.test(v)) { allOff(); held = {}; picks = {}; B.gripStep(v.substring(5)); applyLand(); render(); }
        else if (v === "back") { backToggle(); }
        else if (/^gpat:/.test(v)) { prefs.pat = gtrPat(v.substring(5))[0]; gtrSavePrefs(prefs); if (pat) { patRetime(); } render(); }
        else if (v === "swing") { var sl = B.SWINGS, si = 0; for (var q = 0; q < sl.length; q++) { if (sl[q][0] === prefs.swing) { si = q; } } prefs.swing = sl[(si + 1) % sl.length][0]; gtrSavePrefs(prefs); render(); }
        else if (/^cprog:/.test(v)) { prefs.cprog = B.cprog(v.substring(6)) ? v.substring(6) : ""; gtrSavePrefs(prefs); render(); }
        else if (/^drum:/.test(v)) { prefs.drum = v.substring(5); drumCache = null; gtrSavePrefs(prefs); if (pat) { patRetime(); } render(); }
        else if (/^bpat:/.test(v)) { prefs.bpat = v.substring(5); gtrSavePrefs(prefs); if (pat) { patRetime(); } render(); }
        else if (/^[gbd]vol:[+-]$/.test(v)) {
          var vk = v.charAt(0) + "vol";
          prefs[vk] = Math.max(0, Math.min(GTR_VOL_MAX, prefs[vk] + (v.charAt(5) === "+" ? GTR_VOL_STEP : -GTR_VOL_STEP)));
          gtrSavePrefs(prefs);
          if (vk === "gvol") { gtrBus(buses, prefs.voice, prefs.gvol, gtrFx(prefs)); } else { B.bus(buses, v.charAt(0), prefs[vk], false); }
          render();
        }
      }
      function allOff() { for (var sn = 0; sn < 6; sn++) { stopString(sn, 0); } press = {}; }
      var METRO = B.METRO_ICON || "&#x23F1;&#xFE0F;";
      function scaleOptions() {
        var h = "", gs = B.SCALE_GROUPS || [["", B.SCALES.map(function (s) { return s[0]; })]], i, j;
        for (i = 0; i < gs.length; i++) {
          if (gs[i][0]) { h += '<optgroup label="' + escHtml(gs[i][0]) + '">'; }
          for (j = 0; j < gs[i][1].length; j++) { var sc = B.scale(gs[i][1][j]); h += '<option value="' + sc[0] + '"' + (sc[0] === prefs.scale ? " selected" : "") + '>' + escHtml(sc[1]) + '</option>'; }
          if (gs[i][0]) { h += '</optgroup>'; }
        }
        return h;
      }
      function patOptions() {
        var h = "", i;
        for (i = 0; i < GTR_PATS.length; i++) { if (GTR_PATS[i][3] === meter) { h += '<option value="' + GTR_PATS[i][0] + '"' + (GTR_PATS[i][0] === prefs.pat ? " selected" : "") + '>' + escHtml(GTR_PATS[i][1]) + '</option>'; } }
        return h;
      }
      function cprogOptions() {
        var h = '<option value=""' + (prefs.cprog ? "" : " selected") + '>コード進行なし（上の段をタップ）</option>', gs = B.CPROG_GROUPS || [], i, j;
        for (i = 0; i < gs.length; i++) {
          h += '<optgroup label="' + escHtml(gs[i][0]) + '">';
          for (j = 0; j < gs[i][1].length; j++) { var cp = B.cprog(gs[i][1][j]); if (cp) { h += '<option value="' + cp[0] + '"' + (cp[0] === prefs.cprog ? " selected" : "") + '>' + escHtml(cp[1]) + '</option>'; } }
          h += '</optgroup>';
        }
        return h;
      }
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
      function bpatOptions() {
        var h = '<option value=""' + (prefs.bpat ? "" : " selected") + '>ベースなし</option>', gs = B.patGroups(B.patterns(meter)), i, j;
        for (i = 0; i < gs.length; i++) {
          h += '<optgroup label="' + escHtml(gs[i][0]) + '">';
          for (j = 0; j < gs[i][1].length; j++) { var p0 = gs[i][1][j]; if (p0[3] === meter) { h += '<option value="' + p0[0] + '"' + (p0[0] === prefs.bpat ? " selected" : "") + '>' + escHtml(p0[1]) + '</option>'; } }
          h += '</optgroup>';
        }
        return h;
      }
      function render() {
        if (!panel) { return; }
        var html = "", i;
        if (view === "chord") {
          html += '<div class="piano-row"><button class="modal-btn" data-ga="down">&#x2B07;&#xFE0F; ダウン</button><button class="modal-btn" data-ga="up">&#x2B06;&#xFE0F; アップ</button>' +
            '<button class="modal-btn" data-ga="cut">&#x270B; カッティング</button>' +
            '<button class="modal-btn' + (prefs.pmute ? " piano-rec-on" : "") + '" data-ga="pmute">&#x1F91A; ミュート ' + (prefs.pmute ? "ON" : "OFF") + '</button></div>';
        }
        html += '<div class="piano-row"><button class="modal-btn' + (rec ? " piano-rec-on" : "") + '" data-ga="rec">' + (rec ? "&#x23F9;&#xFE0F; 録音をとめる" : "&#x1F534; 録音") + '</button>' +
          '<button class="modal-btn' + (play ? " piano-rec-on" : "") + '" data-ga="play"' + (rec ? " disabled" : "") + '>' + (play ? "&#x23F9;&#xFE0F; とめる" : "&#x25B6;&#xFE0F; 再生") + '</button>' +
          '<button class="modal-btn' + (pat ? " piano-rec-on" : "") + '" data-ga="pat">' + (pat ? "&#x23F9;&#xFE0F; パターン" : "&#x25B6;&#xFE0F; パターン") + '</button></div>' +
          (back ? '<div class="piano-row"><button class="modal-btn" data-ga="back"' + (rec ? " disabled" : "") + '>' + (bk && !play && !rec ? "&#x23F9;&#xFE0F; 伴奏をとめる" : "&#x1F3B8; 伴奏だけ鳴らす") + '</button>' +
            '<button class="modal-btn" data-ga="metro" title="録音のメトロノーム">' + METRO + ' ' + (metro ? "ON" : "OFF") + '</button></div>' +
            '<p class="small" style="margin:4px 0 0;">&#x1F3B8; 伴奏: ' + escHtml(back.name) + '（BPM ' + back.seq.bpm + '・' + back.seq.meter + '拍子' + (prefs.backUke ? "" : "・曲のウクレレは鳴らさない") + '）</p>' :
          '<div class="piano-row"><button class="modal-btn" data-ga="bpmdown">&minus;</button><span>BPM ' + bpm + '</span><button class="modal-btn" data-ga="bpmup">&#xFF0B;</button>' +
          '<button class="modal-btn" data-ga="metro" title="録音のメトロノーム">' + METRO + ' ' + (metro ? "ON" : "OFF") + '</button></div>');
        html += '<div class="piano-row">';
        var tabN = back ? 2 : 4, tab = back && (prefs.tab === "band" || prefs.tab === "key") ? "play" : prefs.tab;
        for (i = 0; i < tabN; i++) { var tid = ["play", "pat", "band", "key"][i]; html += '<button class="modal-btn' + (tab === tid ? " piano-rec-on" : "") + '" data-ga="tab:' + tid + '">' + ["弾き方", "パターン", "バンド", "キー"][i] + '</button>'; }
        html += '</div>';
        if (tab === "pat") {
          html += '<div class="piano-row"><label class="piano-select">&#x1F3BC; <select data-gpat="1">' + patOptions() + '</select></label></div>' +
            '<div class="piano-row"><button class="modal-btn" data-ga="swing">ハネ: ' + gtrOpt(B.SWINGS, prefs.swing)[1] + '</button></div>' +
            (back ? "" : '<div class="piano-row"><label class="piano-select">&#x1F501; <select data-gcprog="1">' + cprogOptions() + '</select></label></div>') +
            '<p class="small" style="margin:4px 0 0;">&#x1F3BC; ' + escHtml(gtrPat(prefs.pat)[2]) + '（D ダウン・U アップ・x カッティング・s 短いアップ・B 低い弦・数字 その弦・- のばす）<br>' +
            (back ? "コードは曲に合わせて変わります。" : prefs.cprog ? "コードは進行どおり1小節ごとに変わります。" : "パターン中に上の段のコードをタップすると、次の小節の頭で変わります。") + '</p>';
        } else if (tab === "band") {
          html += '<div class="piano-row"><label class="piano-select">&#x1F941; <select data-gdrum="1">' + drumOptions() + '</select></label></div>' +
            '<div class="piano-row"><label class="piano-select">&#x1F3B8; <select data-gbpat="1">' + bpatOptions() + '</select></label></div>';
          var vols = [["g", "ギター"], ["b", "ベース"], ["d", "ドラム"]];
          for (i = 0; i < 3; i++) { html += '<div class="piano-row"><span>&#x1F50A; ' + vols[i][1] + '</span><button class="modal-btn" data-ga="' + vols[i][0] + 'vol:-">－</button><span>' + prefs[vols[i][0] + "vol"] + '%</span><button class="modal-btn" data-ga="' + vols[i][0] + 'vol:+">＋</button></div>'; }
          html += '<p class="small" style="margin:4px 0 0;">▶ パターンのあいだ、ドラムとベースもいっしょに鳴ります（コードはギターと同じ）</p>';
        } else if (tab === "key") {
          html += '<div class="piano-row"><button class="modal-btn' + (prefs.myOn ? " piano-rec-on" : "") + '" data-ga="myon">&#x1F3B9; コード: ' + (prefs.myOn ? "じぶんでならべる" : "キーのコード") + '</button></div>';
          if (prefs.myOn) {
            var sl0 = prefs.myc[chordD], R0 = gtrRoots(), qh = "", bh = '<option value="-1"' + (sl0.b < 0 ? " selected" : "") + '>ベースなし</option>', qi;
            for (qi = 0; qi < GTR_CTYPES.length; qi++) { qh += '<option value="' + GTR_CTYPES[qi][0] + '"' + (GTR_CTYPES[qi][0] === sl0.q ? " selected" : "") + '>' + escHtml(GTR_CTYPES[qi][1]) + '</option>'; }
            for (qi = 0; qi < 12; qi++) { bh += '<option value="' + qi + '"' + (sl0.b === qi ? " selected" : "") + '>/' + R0[qi] + '</option>'; }
            html += '<p class="small" style="margin:4px 0 0;">' + (chordD + 1) + '番のボタン（いまのコード）: <b>' + escHtml(gtrSlotName(sl0)) + '</b>。ほかのボタンはコードの段で選んでから</p>' +
              '<div class="piano-row"><button class="modal-btn" data-ga="myr:-">&#x25C0;</button><span>ルート ' + R0[sl0.r] + '</span><button class="modal-btn" data-ga="myr:+">&#x25B6;</button></div>' +
              '<div class="piano-row"><label class="piano-select">種類 <select data-gmyq="1">' + qh + '</select></label><label class="piano-select"><select data-gmyb="1">' + bh + '</select></label></div>' +
              '<div class="piano-row"><button class="modal-btn" data-ga="myreset">キーのコードにもどす</button></div>';
          }
          html += '<div class="piano-row"><button class="modal-btn" data-ga="keydown">&#x25C0;</button><span>キー ' + GTR_CDE[prefs.key] + '</span><button class="modal-btn" data-ga="keyup">&#x25B6;</button>' +
            '<button class="modal-btn" data-ga="sev">' + (prefs.sev ? "7th" : "3和音") + '</button></div>' +
            '<div class="piano-row"><label class="piano-select">&#x1F3B5; <select data-gscale="1">' + scaleOptions() + '</select></label></div>' +
            (view === "fret" ? '<p class="small" style="margin:4px 0 0;">マスの下の点: スケールの音（白い大きな点は主音・<span style="color:#f783ac;">●</span> 特徴音 ' + escHtml(B.scale(prefs.scale)[4]) + '）</p>' : "");
        } else {
          html += '<div class="piano-row">';
          for (i = 0; i < GTR_VIEWS.length; i++) { html += '<button class="modal-btn' + (view === GTR_VIEWS[i][0] ? " piano-rec-on" : "") + '" data-ga="view:' + GTR_VIEWS[i][0] + '">' + GTR_VIEWS[i][1] + '</button>'; }
          html += '<button class="modal-btn' + (prefs.land ? " piano-rec-on" : "") + '" data-ga="land">&#x1F4F1; ' + (prefs.land ? "たて向き" : "よこ向き") + '</button>';
          html += '</div>' + (prefs.land && view === "chord" && !back ? '<div class="piano-row"><button class="modal-btn' + (prefs.cgrid ? " piano-rec-on" : "") + '" data-ga="cgrid">&#x1F39B;&#xFE0F; コードの列: ' + (prefs.cgrid ? "ON" : "OFF") + '</button>' +
            '<button class="modal-btn" data-ga="cpos">コードの位置: ' + ({ near: "手前", far: "奥", side: "横" })[prefs.cgrid && prefs.cpos === "side" ? "near" : prefs.cpos] + '</button></div>' +
            '<p class="small" style="margin:4px 0 0;">' + (prefs.cgrid ? "7つのコードが列にならぶ。列の弦をなぞるとそのコードでかき鳴らす・弦をタップでその弦だけ・コード名でジャーン" : "コードのボタンを押して、弦の所でかき鳴らす") + '。左利き（持ち方）はコードを右から並べる（横のときは右はし）</p>' : "") +
            (prefs.land && B.gripRows ? B.gripRows("ga") : "") + '<div class="piano-opts">';
          for (i = 0; i < GTR_VOICES.length; i++) { html += '<button class="modal-btn quiz-opt' + (prefs.voice === GTR_VOICES[i][0] ? " active" : "") + '" data-ga="voice:' + GTR_VOICES[i][0] + '">' + GTR_VOICES[i][1] + '</button>'; }
          html += '</div>';
          // §298: エフェクト
          html += '<div class="piano-row"><button class="modal-btn' + (prefs.fxc ? " piano-rec-on" : "") + '" data-ga="fxc">コーラス ' + (prefs.fxc ? "ON" : "OFF") + '</button>' +
            '<button class="modal-btn' + (prefs.fxd ? " piano-rec-on" : "") + '" data-ga="fxd">ディレイ ' + ["OFF", "短い", "長い"][prefs.fxd] + '</button>' +
            '<button class="modal-btn' + (prefs.fxr ? " piano-rec-on" : "") + '" data-ga="fxr">リバーブ ' + ["OFF", "少し", "たっぷり"][prefs.fxr] + '</button></div>';
          html += '<div class="piano-row">' + (view === "chord" ? '<button class="modal-btn' + (prefs.power ? " piano-rec-on" : "") + '" data-ga="power">&#x26A1; パワーコード: ' + (prefs.power ? "ON" : "OFF") + '</button>' : "") +
            '<button class="modal-btn" data-ga="capo:-">&#x25C0;</button><span>カポ ' + (prefs.capo ? prefs.capo + "フレット" : "なし") + '</span><button class="modal-btn" data-ga="capo:+">&#x25B6;</button></div>';
          if (view === "fret") {
            html += '<div class="piano-row"><button class="modal-btn" data-ga="posdown">&#x25C0;</button><span>' + (prefs.pos ? prefs.pos + "〜" + (prefs.pos + GTR_COLS - 1) + " フレット" : "開放弦〜" + (GTR_COLS - 1) + " フレット") + '</span>' +
              '<button class="modal-btn" data-ga="posup">&#x25B6;</button></div>' +
              '<div class="piano-row"><button class="modal-btn' + (prefs.pick ? " piano-rec-on" : "") + '" data-ga="pick">&#x270B; 右手で弾く: ' + (prefs.pick ? "ON" : "OFF") + '</button>' +
              '<button class="modal-btn' + (prefs.pmute ? " piano-rec-on" : "") + '" data-ga="pmute">&#x1F91A; ブリッジミュート: ' + (prefs.pmute ? "ON" : "OFF") + '</button></div>' +
              '<p class="small" style="margin:4px 0 0;">' + (prefs.pick ? "左手でフレットを押さえて（押さえただけでは鳴らない）、右の「右手」の所で弦をなぞる・タップすると鳴る。鳴っている弦の押さえる所を変えると音程も変わる" : "マスをタップするとすぐ鳴る") + '</p>';
          }
        }
        if (take && !rec) { html += '<p class="small" style="margin:4px 0 0;">いまのテイク: ' + escHtml(take.name) + '（' + take.notes.length + '音・BPM ' + take.bpm + '）</p>'; }
        if (msg) { html += '<p class="small" style="margin:4px 0 0;color:#ffd166;">' + msg + '</p>'; }
        panel.innerHTML = html;
        var bs = panel.querySelectorAll ? panel.querySelectorAll("button[data-ga]") : [];
        for (i = 0; i < bs.length; i++) {
          bs[i].onclick = function (ev) { if (ev.currentTarget.blur) { ev.currentTarget.blur(); } action(ev.currentTarget.getAttribute("data-ga")); };
        }
        var sels = [["gscale", "scale:"], ["gpat", "gpat:"], ["gcprog", "cprog:"], ["gdrum", "drum:"], ["gbpat", "bpat:"], ["gmyq", "myq:"], ["gmyb", "myb:"]];
        for (i = 0; i < sels.length; i++) {
          var sel = panel.querySelector ? panel.querySelector("select[data-" + sels[i][0] + "]") : null;
          if (sel) { sel.onchange = (function (pre) { return function (ev) { if (ev.currentTarget.blur) { ev.currentTarget.blur(); } action(pre + ev.currentTarget.value); }; })(sels[i][1]); }
        }
      }
      render();

      // --- 指 ---
      var press = {}; // 単音: 指 → { sn, m } / ストローク: 指 → { y, moved }
      // §287: 右手ピッキング。held: 左手の指 → { sn, f }・picks: 右手の指 → { y }
      var held = {}, picks = {};
      function fretOf(sn) { var f = 0, k; for (k in held) { if (held.hasOwnProperty(k) && held[k].sn === sn && held[k].f > f) { f = held[k].f; } } return f; }
      function heldOn(sn) { for (var k in held) { if (held.hasOwnProperty(k) && held[k].sn === sn) { return true; } } return false; }
      function pickNote(sn) { return GTR_OPEN[sn] + Math.max(fretOf(sn), prefs.capo); } // §297: 押さえていない弦はカポの音
      // 左手を変えたとき、鳴っている弦は音程を変える（ハンマリング・スライド）。指がぜんぶはなれたら止める（ミュート）
      function heldChanged(sn, lifted) {
        if (!strVo[sn]) { return; }
        if (lifted && !heldOn(sn) && fretOf(sn) === 0 && strVo[sn].cur !== GTR_OPEN[sn]) { stopString(sn, 0); return; }
        if (strVo[sn].cur !== pickNote(sn)) { bendString(sn, pickNote(sn)); }
      }
      // §295: 鳴っている弦 sn の音を、押さえた音 ＋ bd 半音に（録音は押さえた音のまま）。o: 指（いまの bd を持つ）
      function bendTo(o, sn, bd) {
        var v = strVo[sn];
        if (!v || bd === o.bd) { return; }
        o.bd = bd; v.bd = bd;
        if (v.h && UG.voiceBend) { try { UG.voiceBend(v.h, v.cur + bd, 0, 0.03); } catch (e) {} }
      }
      function pluck(r, vel) { var sn = 5 - r; playString(sn, pickNote(sn), 0.75 * (vel || 1), 0); }
      // §293: 指の速さ（前の位置 p.y・フレーム p.f から）→ 強さの倍率。p を いまにする
      function swipeVel(p, y) { var v = gtrVelocity(Math.abs(y - p.y) / Math.max(1, frame - p.f)); p.y = y; p.f = frame; return v; }
      function text(ctx, s, x, y, size, color) { ctx.fillStyle = color; ctx.font = "bold " + (GTR_LAND ? Math.max(4, size * 0.6) : size) + "px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(s, x, y); }
      function drawFret(ctx) {
        var cw = gtrColW(), rh = gtrRowH(), top = GTR_BOARD_Y, bot = top + rh * 6, spc = B.scalePcs(prefs.key, prefs.scale), r, c;
        var numY = GTR_LAND ? (bot + 4 <= GTR_H ? bot + 3 : top - 4) : top - 7, pzw = GTR_PICK_R - GTR_PICK_X;
        ctx.fillStyle = "#4a2f1d";
        ctx.fillRect(GTR_BOARD_X, top, GTR_BOARD_R - GTR_BOARD_X, bot - top);
        if (GTR_PICK) {
          // 右手の所（ボディ）
          ctx.fillStyle = "#7a4b2a";
          ctx.fillRect(GTR_PICK_X, top, pzw, bot - top);
          ctx.fillStyle = "#1a0f08";
          ctx.beginPath(); ctx.arc(GTR_PICK_X + pzw / 2, (top + bot) / 2, Math.min(pzw, bot - top) * 0.36, 0, Math.PI * 2); ctx.fill();
          text(ctx, "右手", GTR_PICK_X + pzw / 2, numY, 8, "#ffd166");
        }
        for (c = 0; c < GTR_COLS; c++) {
          var f = prefs.pos + c, cx = gtrColX(c) + cw / 2;
          if (GTR_MARKS.indexOf(f) >= 0) {
            ctx.fillStyle = "#e8d8b8";
            if (f === 12) { ctx.beginPath(); ctx.arc(cx, top + rh * 2, 3.5, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(cx, top + rh * 4, 3.5, 0, Math.PI * 2); ctx.fill(); }
            else { ctx.beginPath(); ctx.arc(cx, top + rh * 3, 3.5, 0, Math.PI * 2); ctx.fill(); }
          }
          if (c > 0) { var nut = c === 1 && prefs.pos === 0; ctx.fillStyle = nut ? "#f5f0e6" : "#b8b8b8"; ctx.fillRect(gtrFretX(c) - (nut ? 2 : 0.75), top, nut ? 4 : 1.5, bot - top); }
          text(ctx, f === 0 ? "開放" : String(f), cx, numY, 8, "#adb5bd");
        }
        for (r = 0; r < 6; r++) {
          var sn = 5 - r, sy = top + (r + 0.5) * rh;
          for (c = 0; c < GTR_COLS; c++) {
            var m = GTR_OPEN[sn] + prefs.pos + c, rc = gtrCellRect(r, c), on = strVo[sn] && strVo[sn].cur === m;
            if (spc && spc[gtrPc(m)]) {
              var sk = spc[gtrPc(m)];
              ctx.fillStyle = sk === 3 ? "#ffffff" : (sk === 2 ? "#f783ac" : "rgba(255,255,255,0.5)");
              ctx.beginPath(); ctx.arc(rc.x + rc.w / 2, sy + rh * 0.33, sk === 1 ? 2 : 3, 0, Math.PI * 2); ctx.fill();
            }
            if (on) {
              ctx.fillStyle = "#ffd166"; ctx.beginPath(); ctx.arc(rc.x + rc.w / 2, sy, Math.min(rc.w, rc.h) * 0.34, 0, Math.PI * 2); ctx.fill();
              if (strVo[sn].bd > 0) { text(ctx, "⤴+" + strVo[sn].bd.toFixed(1), rc.x + rc.w / 2, sy - rc.h * 0.45, 8, "#ff922b"); } // §295
            }
          }
          if (GTR_PICK) {
            for (c = 0; c < GTR_COLS; c++) {
              if (fretOf(sn) === prefs.pos + c && heldOn(sn)) { var hc = gtrCellRect(r, c); ctx.strokeStyle = "#ff922b"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(hc.x + hc.w / 2, sy, Math.min(hc.w, hc.h) * 0.34, 0, Math.PI * 2); ctx.stroke(); ctx.lineWidth = 1; }
            }
          }
          ctx.fillStyle = vib[sn] > 0 ? "#ffe8a3" : "#d9d9d9";
          var sx0 = GTR_PICK ? Math.min(GTR_BOARD_X, GTR_PICK_X) : GTR_BOARD_X, sx1 = GTR_PICK ? Math.max(GTR_BOARD_R, GTR_PICK_R) : GTR_BOARD_R;
          ctx.fillRect(sx0, sy - (0.6 + sn * 0.25) + (GTR_PICK && vib[sn] > 0 ? Math.sin(frame * 1.7) * vib[sn] / 30 * 1.5 : 0), sx1 - sx0, (1.2 + sn * 0.5) * (GTR_LAND ? 0.7 : 1));
          for (c = 0; c < GTR_COLS; c++) {
            var nm = gtrName(GTR_OPEN[sn] + prefs.pos + c, names);
            if (nm) { var rr = gtrCellRect(r, c); text(ctx, nm, rr.x + rr.w / 2, sy - rh * 0.3, 7, "rgba(255,255,255,0.6)"); }
          }
          if (GTR_LAND) { text(ctx, String(6 - sn), GTR_MIRROR ? W - 5.5 : 5.5, sy, 10, "#ffd166"); } else { hudText(ctx, String(6 - sn), 1, sy - rh * 0.3, "left"); }
        }
        // §297: カポ（そのフレットの手前の区切りに黒い棒。いちばん上に描く）
        if (prefs.capo > prefs.pos && prefs.capo - prefs.pos < GTR_COLS) { var kx = gtrFretX(prefs.capo - prefs.pos); ctx.fillStyle = "#212529"; ctx.fillRect(kx - 4, top - 2, 8, bot - top + 4); ctx.strokeStyle = "#ced4da"; ctx.lineWidth = 1; ctx.strokeRect(kx - 4, top - 2, 8, bot - top + 4); }
      }
      function drawSong(ctx) {
        var k = songIdx(), side = GTR_CMODE === "side", r = side ? { x: GTR_SIDE_X, y: 12, w: GTR_SIDE_W, h: GTR_H - 16 } : { x: 4, y: GTR_CHORD_Y, w: W - 8, h: GTR_CHORD_H }, nx = k >= 0 ? back.chords[k + 1] : null;
        ctx.fillStyle = "#2f4a6e"; ctx.fillRect(r.x, r.y, r.w, r.h);
        text(ctx, k >= 0 ? back.chords[k].name : "—", side ? r.x + r.w / 2 : W / 2 - 40, side ? r.y + r.h / 2 - 8 : r.y + r.h / 2, 16, "#ffd166");
        text(ctx, nx ? "→ " + nx.name : "", side ? r.x + r.w / 2 : W / 2 + 50, side ? r.y + r.h / 2 + 10 : r.y + r.h / 2, 11, "#adb5bd");
      }
      // §291: コードの列（7つのコードの押さえ方をならべる）
      function colShape(i) { return shapeOf(i); }
      function drawGrid(ctx) {
        var rh = gtrStrumRowH(), cw = (W - 8) / 7, i, sn;
        for (i = 0; i < 7; i++) {
          var x = 4 + (GTR_CREV ? 6 - i : i) * cw, sh = colShape(i); // §292: 左利きは右から
          ctx.fillStyle = i === chordD ? "#5a3a20" : (i % 2 ? "#3b2416" : "#33200f");
          ctx.fillRect(x, GTR_STRUM_Y, cw, rh * 6);
          for (sn = 0; sn < 6; sn++) { var fx = sh.frets[sn]; text(ctx, fx === null ? "×" : String(fx - sh.capo), x + cw / 2, gtrStrumLineY(sn) - rh * 0.3, 8, fx === null ? "#ff8787" : "rgba(255,209,102,0.85)"); }
        }
        for (sn = 0; sn < 6; sn++) {
          var y = gtrStrumLineY(sn), th = (1.2 + (5 - sn) * 0.5) * 0.7, a = vib[sn] / 30 * 2;
          ctx.fillStyle = vib[sn] > 0 ? "#ffe8a3" : "#d9d9d9";
          ctx.fillRect(4, y - th / 2 + (a > 0.2 ? Math.sin(frame * 1.7) * a : 0), W - 8, th);
        }
      }
      function drawStrum(ctx) {
        var ch = curChord(), sh = curShape(), rh = gtrStrumRowH(), i, sn;
        for (i = 0; i < 7 && !back; i++) {
          var cr = gtrChordRect(i), cur = i === chordD, dc = chordObj(i);
          ctx.fillStyle = cur ? "#ffd166" : (flash["c" + i] > 0 ? "#fff3b0" : "#2f4a6e");
          ctx.fillRect(cr.x, cr.y, cr.w, cr.h);
          if (i === pend) { ctx.strokeStyle = "#ff922b"; ctx.lineWidth = 2; ctx.strokeRect(cr.x + 1, cr.y + 1, cr.w - 2, cr.h - 2); ctx.lineWidth = 1; }
          if (!GTR_LAND && dc.deg) { text(ctx, dc.deg, cr.x + cr.w / 2, cr.y + 8, dc.deg.length > 5 ? 6 : 7, cur ? "#14213d" : "#adb5bd"); }
          text(ctx, dc.name, cr.x + cr.w / 2, cr.y + cr.h / 2 + (GTR_LAND ? 0 : 4), dc.name.length > 5 ? 7 : (dc.name.length > 4 ? 8 : 10), cur ? "#14213d" : "#ffffff");
        }
        if (back) { drawSong(ctx); }
        if (GTR_CMODE === "grid") { drawGrid(ctx); return; }
        var X0 = GTR_STRUM_X0, X1 = GTR_STRUM_X1;
        ctx.fillStyle = "#3b2416";
        ctx.fillRect(X0, GTR_STRUM_Y, X1 - X0, rh * 6);
        if (!GTR_LAND) { text(ctx, "↑ 下から上 ＝ ダウン　↓ 上から下 ＝ アップ", W / 2, GTR_STRUM_BOT + 4, 8, "#adb5bd"); }
        for (sn = 0; sn < 6; sn++) {
          var y = gtrStrumLineY(sn), th = 1.2 + (5 - sn) * 0.5, a = vib[sn] / 30 * 3, fx = sh.frets[sn];
          ctx.fillStyle = vib[sn] > 0 ? "#ffe8a3" : "#d9d9d9";
          if (a > 0.2 && ctx.beginPath) {
            ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = th; ctx.beginPath();
            for (var x = X0 + 56; x <= X1 - 4; x += 6) { var yy = y + Math.sin(x / 9 + frame * 1.7) * a; if (x === X0 + 56) { ctx.moveTo(x, yy); } else { ctx.lineTo(x, yy); } }
            ctx.stroke(); ctx.lineWidth = 1;
          } else { ctx.fillRect(X0 + 56, y - th / 2, X1 - X0 - 60, th); }
          var lx = X0 + (GTR_LAND ? 36 : 26), ly0 = GTR_LAND ? y : y + 6, rr = GTR_LAND ? Math.min(9, rh * 0.42) : 9;
          text(ctx, GTR_LAND ? (6 - sn) + " " + GTR_SNAME[sn] : (6 - sn) + "弦 " + GTR_SNAME[sn], X0 + (GTR_LAND ? 12 : 26), GTR_LAND ? y : y - 9, 8, "#adb5bd");
          ctx.fillStyle = fx === null ? "#c92a2a" : "#ffd166";
          ctx.beginPath(); ctx.arc(lx, ly0, rr, 0, Math.PI * 2); ctx.fill();
          text(ctx, fx === null ? "×" : String(fx - sh.capo), lx, ly0, 10, "#14213d");
          if (fx !== null && names !== "none" && !GTR_LAND) { text(ctx, gtrName(sh.midis[sn], names), X1 - 16, y - 8, 8, "rgba(255,255,255,0.6)"); }
        }
        if (!rec) { text(ctx, ch.name + (prefs.power ? "5" : "") + (prefs.capo ? "（カポ" + prefs.capo + "）" : ""), W / 2, GTR_LAND ? 6 : 10, 14, "#ffd166"); }
      }
      return {
        input: function (a, down) {
          if (!down) { return; }
          if (/^c[0-6]$/.test(a)) { setChord(Number(a.charAt(1))); return; }
          action(a);
        },
        pointer: function (type, x, y, id) {
          var pid = "p" + (id === undefined ? 0 : id), p = press[pid];
          if (type === "down") {
            audio();
            if (view === "chord") {
              var d = gtrChordAt(x, y);
              if (d >= 0) { setChord(d); if (GTR_CMODE === "grid") { strum("down", 0, 1, colShape(d)); } return; }
              if (y >= GTR_STRUM_Y && y < GTR_STRUM_BOT && x >= GTR_STRUM_X0 && x < GTR_STRUM_X1) {
                var gc = gtrGridCol(x);
                press[pid] = { y: y, moved: false, col: gc, f: frame };
                if (gc >= 0 && gc !== chordD && !pat) { chordD = gc; flash["c" + gc] = 10; }
              }
              return;
            }
            var c = gtrCellAt(x, y, prefs.pos);
            if (GTR_PICK) {
              // §287: 左手は押さえるだけ・右手の所で弾く
              if (c) { held[pid] = { sn: c.sn, f: c.f, bd: 0 }; heldChanged(c.sn, false); return; }
              var pr = gtrPickRow(x, y);
              if (pr >= 0) { picks[pid] = { y: y, f: frame }; if (Math.abs(y - gtrRowLineY(pr)) <= gtrRowH() * 0.3) { pluck(pr); } }
              return;
            }
            if (c) { press[pid] = { sn: c.sn, m: c.m, bd: 0 }; playString(c.sn, c.m, 0.8, 0); }
          } else if (type === "move") {
            if (GTR_PICK && view === "fret") {
              if (picks[pid]) { var cr = gtrRowCross(picks[pid].y, y, 6, gtrRowLineY), pvel = swipeVel(picks[pid], y), q; for (q = 0; q < cr.length; q++) { pluck(cr[q], pvel); } return; }
              if (held[pid]) {
                // §295: 弦は変えない。横はスライド・縦はチョーキング
                var hp = held[pid], hy = gtrRowLineY(5 - hp.sn), hc2 = gtrCellAt(Math.max(GTR_BOARD_X, Math.min(GTR_BOARD_R - 1, x)), hy, prefs.pos);
                if (hc2 && hc2.f !== hp.f) { hp.f = hc2.f; hp.bd = 0; if (strVo[hp.sn]) { strVo[hp.sn].bd = 0; } heldChanged(hp.sn, false); }
                if (strVo[hp.sn] && strVo[hp.sn].cur === pickNote(hp.sn)) { bendTo(hp, hp.sn, gtrBendOf(y - hy, gtrRowH())); }
              }
              return;
            }
            if (!p) { return; }
            if (view === "chord") {
              var cs = gtrStrumCross(p.y, y), sh = p.col >= 0 ? colShape(p.col) : curShape(), k;
              var down0 = y < p.y, vel = swipeVel(p, y);
              for (k = 0; k < cs.length; k++) { if (sh.midis[cs[k]] !== null) { playString(cs[k], sh.midis[cs[k]], (down0 ? 0.6 : 0.5) * vel, 0); } } // 下から上 ＝ ダウン（強め）。速いほど強く
              if (cs.length) { p.moved = true; }
              p.y = y;
              return;
            }
            // §295: 弦は変えない。横はスライド・縦はチョーキング（ゆらすとビブラート）
            var rh = gtrRowH(), sy = GTR_BOARD_Y + (5 - p.sn + 0.5) * rh, c2 = gtrCellAt(Math.max(GTR_BOARD_X, Math.min(GTR_BOARD_R - 1, x)), sy, prefs.pos);
            var mine = strVo[p.sn] && strVo[p.sn].cur === p.m;
            if (c2 && c2.m !== p.m && mine) { p.m = c2.m; bendString(p.sn, c2.m); p.bd = 0; strVo[p.sn].bd = 0; }
            bendTo(p, p.sn, gtrBendOf(y - sy, rh));
          } else {
            if (picks[pid]) { delete picks[pid]; return; }
            if (held[pid]) { var hs = held[pid].sn; delete held[pid]; heldChanged(hs, true); return; }
            if (!p) { return; }
            delete press[pid];
            if (view === "chord") {
              // またがずにはなした ＝ その弦だけ
              if (!p.moved) { var sn0 = gtrStrumAt(p.y), sh0 = p.col >= 0 ? colShape(p.col) : curShape(); if (sn0 >= 0 && sh0.midis[sn0] !== null) { playString(sn0, sh0.midis[sn0], 0.7, 0); } }
              return;
            }
            if (strVo[p.sn] && strVo[p.sn].cur === p.m) { stopString(p.sn, 0); }
          }
        },
        step: function () {
          frame++;
          var k;
          for (k in flash) { if (flash.hasOwnProperty(k) && flash[k] > 0) { flash[k]--; } }
          for (k = 0; k < 6; k++) { if (vib[k] > 0) { vib[k]--; } }
          if (play) {
            var pb = playBeat(), last = 0, i;
            while (play.idx < play.notes.length && play.notes[play.idx][0] <= pb) {
              var pn = play.notes[play.idx];
              play.vo.push({ h: sound(pn[2], pn[3] || 0.8, 0, play.voice), end: pn[0] + pn[1] });
              play.idx++;
            }
            for (i = play.vo.length - 1; i >= 0; i--) { if (pb >= play.vo[i].end) { stopVoice(play.vo[i].h, 0, 0.08); play.vo.splice(i, 1); } }
            for (i = 0; i < play.notes.length; i++) { last = Math.max(last, play.notes[i][0] + play.notes[i][1]); }
            if (play.idx >= play.notes.length && pb > last && !play.back) { play = null; render(); }
          }
          if (pat) { patStep(); if (pat && !pat.back) { drumStep(); bassStep(); } }
          if (bk) { backStep(); }
          if (rec) {
            var rb = Math.floor(recBeat());
            var cnt = rec.back ? !back.s.lead : true;
            if (rb !== rec.beat && ((metro && rb >= 0) || (rb < 0 && cnt))) { click(((rb % meter) + meter) % meter === 0); }
            rec.beat = rb;
          }
        },
        draw: function (ctx) {
          var g = ctx.createLinearGradient ? ctx.createLinearGradient(0, 0, 0, GTR_H) : null;
          if (g) { g.addColorStop(0, "#1b1f3b"); g.addColorStop(1, "#3b1d2e"); }
          ctx.fillStyle = g || "#1b263b";
          ctx.fillRect(0, 0, W, GTR_H);
          hudText(ctx, back ? "🎸 " + (bk ? "伴奏" : back.name) : pat ? "🎼 " + gtrPat(prefs.pat)[1] : view === "chord" ? "🎶 キー " + GTR_CDE[prefs.key] : "🎸 " + (prefs.pos ? prefs.pos + "フレット〜" : "開放弦〜"), 8, GTR_LAND ? 6 : 10, "left");
          hudText(ctx, "BPM " + bpm, W - 8, GTR_LAND ? 6 : 10, "right");
          var held = [], sn;
          for (sn = 5; sn >= 0; sn--) { if (strVo[sn] && view === "fret") { held.push(gtrName(strVo[sn].cur, names === "none" ? "do" : names) + "（" + gtrName(strVo[sn].cur, "cde") + "）"); } }
          if (rec) {
            var rb = recBeat();
            text(ctx, rb < 0 ? String(Math.ceil(-rb)) : "● REC " + (Math.floor(rb / meter) + 1) + "小節・" + rec.notes.length + "音", W / 2, view === "chord" || GTR_LAND ? (GTR_LAND ? 6 : 10) : 30, view === "chord" ? 11 : 16, "#ff6b6b");
          }
          if (view === "chord") { drawStrum(ctx); return; }
          if (!rec && (!GTR_LAND || held.length)) { text(ctx, held.join(" ") || (play ? "再生中…" : GTR_PICK ? "左手で押さえて、右手の所で弾こう" : "弦のマスをタップして弾こう"), W / 2, GTR_LAND ? 6 : (held.length ? 60 : 70), held.length ? 16 : 12, held.length ? "#ffd166" : "#ffffff"); }
          drawFret(ctx);
        }
      };
    }
  });

  window.UGGuitar = {
    H: GTR_H, OPEN: GTR_OPEN, VOICES: GTR_VOICES, MUTED: GTR_MUTED, VIEWS: GTR_VIEWS, COLS: GTR_COLS, BOARD_Y: GTR_BOARD_Y, STRUM_Y: GTR_STRUM_Y,
    vel: gtrVelocity, bendOf: gtrBendOf, PMUTE: GTR_PMUTE, CAPO_MAX: GTR_CAPO_MAX, PATS: GTR_PATS, pat: gtrPat, arpString: gtrArpString, vol: gtrVol, PREFS_KEY: GTR_PREFS_KEY, TAKES_KEY: GTR_TAKES_KEY, TAKES_MAX: GTR_TAKES_MAX, BOOST: GTR_BOOST,
    setPick: gtrSetPick, layout: gtrLayout, pickRow: gtrPickRow, rowLineY: gtrRowLineY, colX: gtrColX,
    geom: function () { return { PICK_X: GTR_PICK_X, PICK_R: GTR_PICK_R, BOARD_X: GTR_BOARD_X, BOARD_R: GTR_BOARD_R, BOARD_Y: GTR_BOARD_Y, BOARD_BOT: GTR_BOARD_BOT, COLS: GTR_COLS, H: GTR_H, MIRROR: GTR_MIRROR, STRUM_Y: GTR_STRUM_Y, STRUM_BOT: GTR_STRUM_BOT, CHORD_Y: GTR_CHORD_Y, CMODE: GTR_CMODE, CREV: GTR_CREV, STRUM_X0: GTR_STRUM_X0, STRUM_X1: GTR_STRUM_X1 }; }, gridCol: gtrGridCol, cellAt: gtrCellAt, cellRect: gtrCellRect, chordRect: gtrChordRect, chordAt: gtrChordAt, strumLineY: gtrStrumLineY, strumAt: gtrStrumAt, strumCross: gtrStrumCross,
    quality: gtrQuality, shape: gtrShape, shapeQ: gtrShapeQ, CTYPES: GTR_CTYPES, slotName: gtrSlotName, defaultSlots: gtrDefaultSlots, slotsClean: gtrSlotsClean, bus: gtrBus, name: gtrName, prefs: gtrPrefs, notesClean: gtrNotesClean,
    SONGS: GTR_SONGS, chart: gtrChart, BEST_KEY: GTR_BEST_KEY, RLEVELS: GTR_RLEVELS, sendToSeq: gtrSendToSeq, SEQ_MAX: GTR_SEQ_MAX, songSev: gtrSongSev, takesLoad: gtrTakesLoad, takesSave: gtrTakesSave, takeAdd: gtrTakeAdd, takeById: gtrTakeById
  };
})();
