// =========================================================
// 究極ゴリラ ゲームセンター: 🎹 ゴリラピアノ（§212）
// arcade.js・arcade-melody.js の後に読み込む。音は window.UGMelody（サンプル）を使う。
// 録音（テイク）はシーケンサーのメロディと同じ [拍, 長さ（拍）, MIDI] の形で保存する
// §213 v1.21: ゴリラウクレレのシーケンサーの曲を伴奏にする・テイクをシーケンサーへ送る・よこ向き表示
// =========================================================
(function () {
  "use strict";

  var I = window.UGArcade && window.UGArcade.internal;
  if (!I) { return; }
  var W = I.W, hudText = I.hudText, emojiAt = I.emojiAt, lsGet = I.lsGet, lsSet = I.lsSet, escHtml = I.escHtml;

  var PIANO_H = 300, PIANO_KB_Y = 170, PIANO_WHITE = 14, PIANO_BLACK_H = 78;
  // §213: 画面の形。縦 240×300 / 横 240×h（よこ向きで大きく見せる）。kb ＝ 鍵盤の上のはし、bh ＝ 黒鍵の長さ
  // §214 v1.22: よこの高さ h は画面の縦横の比で決める（鍵盤が端から端まで・下にボタン）
  var PIANO_LAND_KB = 44, PIANO_LAND_MIN = 80, PIANO_LAND_MAX = 160, PIANO_LAND_CTRL = 84;
  function pianoLandLayout(h) {
    h = Math.max(PIANO_LAND_MIN, Math.min(PIANO_LAND_MAX, Math.round(h) || 120));
    return { h: h, kb: PIANO_LAND_KB, bh: Math.round((h - PIANO_LAND_KB) * 0.6), land: true };
  }
  // 画面いっぱいの枠の大きさ（CSS ピクセル）→ 鍵盤の下にボタンの段（PIANO_LAND_CTRL）を残したときのゲーム画面の高さ
  function pianoLandH(boxW, boxH) {
    if (!(boxW > 0 && boxH > 0)) { return 120; }
    return W * (boxH - 8 - PIANO_LAND_CTRL) / (boxW - 8);
  }
  var PIANO_PORT = { h: PIANO_H, kb: PIANO_KB_Y, bh: PIANO_BLACK_H, land: false }, PIANO_LAND = pianoLandLayout(120);
  var pianoResize = null;
  var PIANO_PREFS_KEY = "ultimateGorillaPianoPrefsV1", PIANO_TAKES_KEY = "ultimateGorillaPianoTakesV1", PIANO_BEST_KEY = "ultimateGorillaPianoBestV1";
  var PIANO_TAKES_MAX = 10, PIANO_NOTES_MAX = 1000, PIANO_SONG_LOW = 60, PIANO_BASE_MIN = 36, PIANO_BASE_MAX = 72;
  var PIANO_LEAD = 2, PIANO_LOOK = 1.6, PIANO_SPEEDS = [70, 85, 100];
  // [ずれ（秒）, 名前, 点]
  var PIANO_JUDGE = [[0.07, "PERFECT", 100], [0.13, "GREAT", 70], [0.2, "GOOD", 40]];
  var PIANO_DO = ["ド", "ド#", "レ", "レ#", "ミ", "ファ", "ファ#", "ソ", "ソ#", "ラ", "ラ#", "シ"];
  var PIANO_CDE = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  var PIANO_VOICES = [[0, "&#x1F3B9; ピアノ"], [4, "&#x1F3B9; エレピ"], [8, "&#x2728; チェレスタ"], [11, "&#x1F514; ビブラフォン"], [12, "&#x1FAB5; マリンバ"], [46, "&#x1F3BC; ハープ"]];
  var PIANO_NAMES = [["do", "ドレミ"], ["cde", "CDE"], ["none", "なし"]];
  // §217 v1.25: コードの別の読み方をいくつ出すか（99 ＝ すべて）
  var PIANO_ALTS_ALL = 99, PIANO_ALTS = [[0, "なし"], [1, "1つ"], [2, "2つ"], [3, "3つ"], [PIANO_ALTS_ALL, "すべて"]];
  var PIANO_MODES = [["free", "&#x1F3B9; じゆう"], ["practice", "&#x1F4D6; れんしゅう"], ["rhythm", "&#x1F3AE; リズム"]];
  var PIANO_WHITE_PC = [0, 2, 4, 5, 7, 9, 11];
  var PIANO_WHITE_OF = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];

  // 曲（著作権の切れた曲）。"C4 D4:2 R:.5" ＝ 音名＋オクターブ、":" のあとが長さ（拍）、R は休み
  var PIANO_SONGS = [
    { id: "scale", name: "ドレミのれんしゅう", lv: 1, bpm: 90, meter: 4,
      src: "C4 D4 E4 F4 G4 A4 B4 C5:2 R:2 C5 B4 A4 G4 F4 E4 D4 C4:2" },
    { id: "twinkle", name: "きらきら星", lv: 1, bpm: 100, meter: 4,
      src: "C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2 G4 G4 F4 F4 E4 E4 D4:2 G4 G4 F4 F4 E4 E4 D4:2 C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2" },
    { id: "frog", name: "かえるのうた", lv: 1, bpm: 100, meter: 4,
      src: "C4 D4 E4 F4 E4 D4 C4:2 E4 F4 G4 A4 G4 F4 E4:2 C4 R C4 R C4 R C4 R C4:.5 C4:.5 D4:.5 D4:.5 E4:.5 E4:.5 F4:.5 F4:.5 E4 D4 C4:2" },
    { id: "mary", name: "メリーさんのひつじ", lv: 1, bpm: 100, meter: 4,
      src: "E4 D4 C4 D4 E4 E4 E4:2 D4 D4 D4:2 E4 G4 G4:2 E4 D4 C4 D4 E4 E4 E4 E4 D4 D4 E4 D4 C4:4" },
    { id: "london", name: "ロンドン橋", lv: 2, bpm: 100, meter: 4,
      src: "G4:1.5 A4:.5 G4 F4 E4 F4 G4:2 D4 E4 F4:2 E4 F4 G4:2 G4:1.5 A4:.5 G4 F4 E4 F4 G4:2 D4:2 G4:2 E4 C4:3" },
    { id: "joy", name: "よろこびの歌", lv: 2, bpm: 110, meter: 4,
      src: "E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4:1.5 D4:.5 D4:2 E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4:1.5 C4:.5 C4:2" },
    { id: "birthday", name: "ハッピーバースデー", lv: 2, bpm: 100, meter: 3,
      src: "R:2 G4:.75 G4:.25 A4 G4 C5 B4:2 G4:.75 G4:.25 A4 G4 D5 C5:2 G4:.75 G4:.25 G5 E5 C5 B4 A4:2 F5:.75 F5:.25 E5 C5 D5 C5:2" },
    { id: "saints", name: "聖者の行進", lv: 3, bpm: 120, meter: 4,
      src: "R C4 E4 F4 G4:4 R C4 E4 F4 G4:4 R C4 E4 F4 G4:2 E4:2 C4:2 E4:2 D4:4 R E4 E4 D4 C4:3 C4 E4:2 G4:2 G4 F4:3 R E4 F4 G4:2 E4:2 C4:2 D4:2 C4:4" },
    { id: "elise", name: "エリーゼのために（冒頭）", lv: 3, bpm: 120, meter: 3,
      src: "E5:.5 D#5:.5 E5:.5 D#5:.5 E5:.5 B4:.5 D5:.5 C5:.5 A4:1.5 C4:.5 E4:.5 A4:.5 B4:1.5 E4:.5 G#4:.5 B4:.5 C5:1.5 E4:.5 " +
        "E5:.5 D#5:.5 E5:.5 D#5:.5 E5:.5 B4:.5 D5:.5 C5:.5 A4:1.5 C4:.5 E4:.5 A4:.5 B4:1.5 E4:.5 C5:.5 B4:.5 A4:3" }
  ];

  // "C#4" → 61（読めなければ -1）
  function pianoMidi(tok) {
    var m = /^([A-G])(#|b)?(\d)$/.exec(tok);
    if (!m) { return -1; }
    var pc = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] === "#" ? 1 : (m[2] === "b" ? -1 : 0));
    return (Number(m[3]) + 1) * 12 + pc;
  }
  // 楽譜の文字 → [[拍, 長さ, MIDI], ...]
  function pianoParse(src) {
    var out = [], b = 0, toks = String(src).split(/\s+/), i;
    for (i = 0; i < toks.length; i++) {
      if (!toks[i]) { continue; }
      var p = toks[i].split(":"), len = p.length > 1 ? Number(p[1]) : 1;
      if (!(len > 0)) { len = 1; }
      if (p[0] !== "R") { var m = pianoMidi(p[0]); if (m >= 0) { out.push([b, len, m]); } }
      b += len;
    }
    return out;
  }
  function pianoSong(id) {
    var s = PIANO_SONGS[0], i;
    for (i = 0; i < PIANO_SONGS.length; i++) { if (PIANO_SONGS[i].id === id) { s = PIANO_SONGS[i]; } }
    if (!s.notes) { s.notes = pianoParse(s.src); }
    return s;
  }
  function pianoPc(m) { return ((m % 12) + 12) % 12; }
  function pianoIsBlack(m) { var pc = pianoPc(m); return pc === 1 || pc === 3 || pc === 6 || pc === 8 || pc === 10; }
  function pianoName(m, names) {
    if (names === "cde") { return PIANO_CDE[pianoPc(m)] + (Math.floor(m / 12) - 1); }
    return names === "none" ? "" : PIANO_DO[pianoPc(m)];
  }
  // 鍵盤の位置（base ＝ いちばん左の C）。{ x, w, black }
  function pianoKeyRect(m, base) {
    var ww = W / PIANO_WHITE, off = m - base, oct = Math.floor(off / 12), pc = off - oct * 12, wi = oct * 7 + PIANO_WHITE_OF[pc];
    if (pianoIsBlack(m)) { return { x: (wi + 1) * ww - ww * 0.3, w: ww * 0.6, black: true }; }
    return { x: wi * ww, w: ww, black: false };
  }
  // 座標 → MIDI（鍵盤の外は -1）。黒鍵が上にあるので先に調べる。L は画面の形（省略で縦）
  function pianoKeyAt(x, y, base, L) {
    L = L || PIANO_PORT;
    if (y < L.kb || y > L.h || x < 0 || x > W) { return -1; }
    var ww = W / PIANO_WHITE, m;
    if (y < L.kb + L.bh) {
      for (m = base; m < base + 24; m++) {
        if (!pianoIsBlack(m)) { continue; }
        var r = pianoKeyRect(m, base);
        if (x >= r.x && x < r.x + r.w) { return m; }
      }
    }
    var wi = Math.max(0, Math.min(PIANO_WHITE - 1, Math.floor(x / ww)));
    return base + Math.floor(wi / 7) * 12 + PIANO_WHITE_PC[wi % 7];
  }
  // §215 v1.23: 押している鍵盤（低い順・重なりなし）と、そのコード名（2音以上。UGChords.detectNotes）
  function pianoHeld(press) {
    var out = [], k;
    for (k in press) { if (press.hasOwnProperty(k) && out.indexOf(press[k]) < 0) { out.push(press[k]); } }
    return out.sort(function (a, b) { return a - b; });
  }
  // maxAlts: 別の読み方をいくつまで（§217。省略で 3、PIANO_ALTS_ALL ですべて）
  function pianoChord(midis, maxAlts) {
    var C = window.UGChords;
    if (!midis || midis.length < 2 || !C || !C.detectNotes) { return null; }
    var d = C.detectNotes(midis, { maxAlts: maxAlts === PIANO_ALTS_ALL ? Infinity : (maxAlts >= 0 ? maxAlts : 3) });
    return d && (d.name || d.interval) ? d : null;
  }
  // ずれ（秒）→ 判定の番号（0 PERFECT / 1 GREAT / 2 GOOD）。外れたら -1
  function pianoJudge(dt) {
    dt = Math.abs(dt);
    for (var i = 0; i < PIANO_JUDGE.length; i++) { if (dt <= PIANO_JUDGE[i][0]) { return i; } }
    return -1;
  }
  function pianoRank(acc) { return acc >= 0.95 ? "S" : (acc >= 0.85 ? "A" : (acc >= 0.7 ? "B" : (acc >= 0.5 ? "C" : "D"))); }

  // ---------- 設定・テイク・ベスト ----------
  function pianoProgOk(p) { for (var i = 0; i < PIANO_VOICES.length; i++) { if (PIANO_VOICES[i][0] === p) { return true; } } return false; }
  function pianoPrefs() {
    var p = lsGet(PIANO_PREFS_KEY) || {}, base = Math.round(Number(p.base));
    return {
      mode: p.mode === "practice" || p.mode === "rhythm" ? p.mode : "free",
      prog: pianoProgOk(Number(p.prog)) ? Number(p.prog) : 0,
      names: p.names === "cde" || p.names === "none" ? p.names : "do",
      alts: [0, 1, 2, 3, PIANO_ALTS_ALL].indexOf(Number(p.alts)) >= 0 ? Number(p.alts) : 3,
      speed: PIANO_SPEEDS.indexOf(Number(p.speed)) >= 0 ? Number(p.speed) : 100,
      bpm: Math.max(40, Math.min(240, Math.round(Number(p.bpm) || 90))),
      metro: p.metro !== false,
      base: base >= PIANO_BASE_MIN && base <= PIANO_BASE_MAX && base % 12 === 0 ? base : PIANO_SONG_LOW,
      pad: !!p.pad, land: !!p.land, backing: typeof p.backing === "string" && /^(cur|s:\d+)$/.test(p.backing) ? p.backing : ""
    };
  }
  function pianoSavePrefs(p) { return lsSet(PIANO_PREFS_KEY, p); }
  function pianoNum(v, lo, hi) { var n = Number(v); return isFinite(n) && n >= lo && n <= hi ? n : null; }
  // シーケンサーのメロディ（§178）と同じ形に整える: [拍, 長さ, MIDI]（強さが 0.8 以外なら4つ目）
  function pianoNotesClean(a) {
    var out = [], i;
    a = a && a.length ? a : [];
    for (i = 0; i < a.length && out.length < PIANO_NOTES_MAX; i++) {
      var b = a[i] && pianoNum(a[i][0], 0, 4096), d = a[i] && pianoNum(a[i][1], 0.0625, 32), m = a[i] && pianoNum(a[i][2], 0, 127), v = a[i] && pianoNum(a[i][3], 0.1, 1);
      if (b !== null && d !== null && m !== null) { out.push(v !== null && v !== 0.8 ? [b, d, Math.round(m), v] : [b, d, Math.round(m)]); }
    }
    out.sort(function (x, y) { return x[0] - y[0]; });
    return out;
  }
  function pianoTakeClean(t, i) {
    return {
      id: Math.max(1, Math.round(Number(t.id)) || i + 1), name: String(t.name || "テイク").slice(0, 20),
      bpm: Math.max(40, Math.min(240, Math.round(Number(t.bpm) || 90))), meter: t.meter === 3 ? 3 : 4,
      prog: pianoProgOk(Number(t.prog)) ? Number(t.prog) : 0, notes: pianoNotesClean(t.notes),
      song: typeof t.song === "string" ? t.song.slice(0, 20) : ""
    };
  }
  function pianoTakesLoad() {
    var a = lsGet(PIANO_TAKES_KEY), out = [], i;
    if (!a || !a.length) { return out; }
    for (i = 0; i < a.length && out.length < PIANO_TAKES_MAX; i++) { if (a[i] && typeof a[i] === "object") { out.push(pianoTakeClean(a[i], i)); } }
    return out;
  }
  function pianoTakesSave(list) { return lsSet(PIANO_TAKES_KEY, list.slice(0, PIANO_TAKES_MAX)); }
  // 新しいテイクを先頭に足す（10個をこえたら古いものを消す）。足したテイクを返す
  function pianoTakeAdd(list, t) {
    var id = 0, i;
    for (i = 0; i < list.length; i++) { id = Math.max(id, list[i].id); }
    var take = pianoTakeClean({ id: id + 1, name: t.name || "テイク " + (id + 1), bpm: t.bpm, meter: t.meter, prog: t.prog, notes: t.notes, song: t.song }, 0);
    list.unshift(take);
    if (list.length > PIANO_TAKES_MAX) { list.length = PIANO_TAKES_MAX; }
    return take;
  }
  function pianoTakeById(list, id) { for (var i = 0; i < list.length; i++) { if (list[i].id === id) { return list[i]; } } return null; }
  // シーケンサーの追加トラック（種類 "notes"）にそのまま入れられる音の配列
  function pianoToSeqNotes(take) { return pianoNotesClean(take && take.notes); }

  // ---------- §213 v1.21: ゴリラウクレレのシーケンサーとつなぐ ----------
  function pianoSeqApi() { var U = window.UGUkulele; return U && U.seqLoad && U.seqSchedule ? U : null; }
  // 伴奏にえらべる曲 [[id, 名前], ...]（"cur" ＝ 編集中の曲、"s:番号" ＝ 保存した曲）
  function pianoBackList() {
    var U = pianoSeqApi(), out = [], st, i;
    if (!U) { return out; }
    st = U.seqLoad();
    out.push(["cur", "編集中の曲"]);
    for (i = 0; i < st.songs.length; i++) { out.push(["s:" + st.songs[i].id, st.songs[i].name]); }
    return out;
  }
  // 伴奏の曲（構成どおりに並べ、練習テンポも反映）→ { name, seq, s: 予定, lowG }。なければ null
  function pianoBacking(id) {
    var U = pianoSeqApi(), st, sq = null, name = "", lowG = false, i;
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
    return sc && sc.events && sc.events.length ? { name: name, seq: sq, s: sc, lowG: lowG } : null;
  }
  // テイクを、シーケンサーの編集中の曲へ「🎹 ピアノ打ち込み」トラックとして送る → { ok, id, msg }
  function pianoSendToSeq(take) {
    var U = pianoSeqApi();
    if (!U || !U.xAdd) { return { ok: false, msg: "ゴリラウクレレが読みこめませんでした" }; }
    if (!take || !take.notes || !take.notes.length) { return { ok: false, msg: "音のないテイクは送れません" }; }
    var st = U.seqLoad(), id = U.xAdd(st.cur.tracks, "pnotes");
    if (!id) { return { ok: false, msg: "追加トラックがいっぱいです（8本まで）。シーケンサーで1本消してから送ってね" }; }
    var t = st.cur.tracks[id];
    t.name = String(take.name).slice(0, 12);
    t.prog = take.prog;
    t.notes = pianoToSeqNotes(take);
    U.seqSave(st);
    return { ok: true, id: id, msg: "「" + take.name + "」を、ゴリラウクレレのシーケンサー（編集中の曲）に 🎹 ピアノ打ち込みトラックとして送りました" };
  }
  // よこ向きのとき、できる端末では全画面＋画面の向きを横に固定する（できなければ CSS で回して見せる）
  var pianoLocked = false;
  function pianoLock(on) {
    try {
      var d = document.documentElement, so = window.screen && window.screen.orientation;
      if (on && !pianoLocked) {
        pianoLocked = true;
        if (d.requestFullscreen && !document.fullscreenElement) {
          var pr = d.requestFullscreen();
          if (pr && pr.then) { pr.then(function () { if (so && so.lock) { var l = so.lock("landscape"); if (l && l["catch"]) { l["catch"](function () {}); } } }, function () {}); }
        }
      } else if (!on && pianoLocked) {
        pianoLocked = false;
        if (so && so.unlock) { so.unlock(); }
        if (document.fullscreenElement && document.exitFullscreen) { var ex = document.exitFullscreen(); if (ex && ex["catch"]) { ex["catch"](function () {}); } }
      }
    } catch (e) {}
  }
  I.addStopHook(function () {
    pianoLock(false);
    if (pianoResize) { window.removeEventListener("resize", pianoResize); pianoResize = null; }
  });
  function pianoBest() { var o = lsGet(PIANO_BEST_KEY); return o && typeof o === "object" ? o : {}; }

  function pianoSetup(root, ctl) {
    var p = pianoPrefs(), note = "";
    function draw() {
      var best = pianoBest(), takes = pianoTakesLoad(), i;
      var html = '<div class="melody-setup"><h3 style="margin:0 0 4px;">&#x1F3B9; ゴリラピアノ</h3>' +
        '<p class="small" style="color:#adb5bd;margin:0 0 8px;">鍵盤をタップして弾こう（和音もOK）。パソコンは A〜L のキーでも弾けます。</p>';
      html += '<div class="quiz-opts">';
      for (i = 0; i < PIANO_MODES.length; i++) {
        html += '<button class="modal-btn quiz-opt' + (p.mode === PIANO_MODES[i][0] ? " active" : "") + '" data-mode="' + PIANO_MODES[i][0] + '">' + PIANO_MODES[i][1] + '</button>';
      }
      html += '</div><p class="small" style="margin:4px 0 2px;">音色</p><div class="piano-opts">';
      for (i = 0; i < PIANO_VOICES.length; i++) {
        html += '<button class="modal-btn quiz-opt' + (p.prog === PIANO_VOICES[i][0] ? " active" : "") + '" data-prog="' + PIANO_VOICES[i][0] + '">' + PIANO_VOICES[i][1] + '</button>';
      }
      html += '</div><p class="small" style="margin:4px 0 2px;">鍵盤の音名</p><div class="quiz-opts">';
      for (i = 0; i < PIANO_NAMES.length; i++) {
        html += '<button class="modal-btn quiz-opt' + (p.names === PIANO_NAMES[i][0] ? " active" : "") + '" data-names="' + PIANO_NAMES[i][0] + '">' + PIANO_NAMES[i][1] + '</button>';
      }
      html += '</div><p class="small" style="margin:4px 0 2px;">コードの別の読み方（C6 ＝ Am7/C など）</p><div class="quiz-opts">';
      for (i = 0; i < PIANO_ALTS.length; i++) {
        html += '<button class="modal-btn quiz-opt' + (p.alts === PIANO_ALTS[i][0] ? " active" : "") + '" data-alts="' + PIANO_ALTS[i][0] + '">' + PIANO_ALTS[i][1] + '</button>';
      }
      html += '</div><p class="small" style="margin:4px 0 2px;">画面の向き</p><div class="quiz-opts">' +
        '<button class="modal-btn quiz-opt' + (!p.land ? " active" : "") + '" data-land="0">&#x1F4F1; たて</button>' +
        '<button class="modal-btn quiz-opt' + (p.land ? " active" : "") + '" data-land="1">&#x2194;&#xFE0F; よこ（鍵盤が大きい）</button></div>';
      if (p.mode === "free") {
        var bl = pianoBackList();
        if (bl.length) {
          html += '<p class="small" style="margin:4px 0 2px;">&#x1F3B8; 伴奏（ゴリラウクレレのシーケンサーの曲）</p><div class="piano-opts">' +
            '<button class="modal-btn quiz-opt' + (!p.backing ? " active" : "") + '" data-backing="-">なし</button>';
          for (i = 0; i < bl.length; i++) {
            html += '<button class="modal-btn quiz-opt' + (p.backing === bl[i][0] ? " active" : "") + '" data-backing="' + bl[i][0] + '">' + escHtml(bl[i][1]) + '</button>';
          }
          html += '</div>';
        }
        html += '<button class="modal-btn" data-go="1" style="width:100%;margin-top:8px;">&#x1F3B9; はじめる</button>';
        html += '<p class="small" style="margin:10px 0 2px;">&#x1F399;&#xFE0F; 録音したテイク（' + takes.length + ' / ' + PIANO_TAKES_MAX + '）</p>';
        if (note) { html += '<p class="small" style="color:#ffd166;margin:0 0 4px;">' + note + '</p>'; }
        if (!takes.length) { html += '<p class="small" style="color:#adb5bd;margin:0;">まだありません。じゆうに弾く画面の「🔴 録音」で録れます。</p>'; }
        for (i = 0; i < takes.length; i++) {
          html += '<div class="piano-take"><span>' + escHtml(takes[i].name) + '<br><span class="small" style="color:#adb5bd;">' + takes[i].notes.length + '音・BPM ' + takes[i].bpm +
            (takes[i].song ? '・&#x1F3B8; ' + escHtml(takes[i].song) : "") + '</span></span>' +
            '<button class="modal-btn" data-open="' + takes[i].id + '">&#x25B6;&#xFE0F; ひらく</button>' +
            '<button class="modal-btn" data-send="' + takes[i].id + '" title="シーケンサーへ送る">&#x1F3B8; 送る</button>' +
            '<button class="modal-btn" data-del="' + takes[i].id + '">&#x1F5D1;&#xFE0F;</button></div>';
        }
      } else {
        if (p.mode === "rhythm") {
          html += '<p class="small" style="margin:4px 0 2px;">速さ</p><div class="quiz-opts">';
          for (i = 0; i < PIANO_SPEEDS.length; i++) {
            html += '<button class="modal-btn quiz-opt' + (p.speed === PIANO_SPEEDS[i] ? " active" : "") + '" data-speed="' + PIANO_SPEEDS[i] + '">' + PIANO_SPEEDS[i] + '%</button>';
          }
          html += '</div>';
        }
        html += '<p class="small" style="margin:8px 0 2px;">曲をえらぶ</p>';
        for (i = 0; i < PIANO_SONGS.length; i++) {
          var sg = PIANO_SONGS[i], b = p.mode === "rhythm" ? best["rhythm:" + sg.id + "@" + p.speed] : best["practice:" + sg.id], info = "";
          if (b !== undefined && b !== null) { info = p.mode === "rhythm" ? "・ベスト " + b.s + "（" + b.r + "）" : "・ミス最少 " + b; }
          html += '<button class="modal-btn quiz-cat-btn" data-song="' + sg.id + '" style="width:100%;">' + escHtml(sg.name) +
            ' <span class="small" style="color:#6b4f00;">' + new Array(sg.lv + 1).join("&#x2B50;") + info + '</span></button>';
        }
      }
      html += '<button class="modal-btn" data-back="1" style="width:100%;margin-top:14px;">&#x1F579;&#xFE0F; メニューへ</button></div>';
      root.innerHTML = html;
      var btns = root.querySelectorAll("button"), j;
      for (j = 0; j < btns.length; j++) {
        btns[j].onclick = function (ev) {
          var el = ev.currentTarget, v;
          if ((v = el.getAttribute("data-mode"))) { p.mode = v; pianoSavePrefs(p); draw(); return; }
          if ((v = el.getAttribute("data-prog")) !== null) { p.prog = Number(v); pianoSavePrefs(p); draw(); return; }
          if ((v = el.getAttribute("data-names"))) { p.names = v; pianoSavePrefs(p); draw(); return; }
          if ((v = el.getAttribute("data-alts")) !== null) { p.alts = Number(v); pianoSavePrefs(p); draw(); return; }
          if ((v = el.getAttribute("data-speed"))) { p.speed = Number(v); pianoSavePrefs(p); draw(); return; }
          if ((v = el.getAttribute("data-land"))) { p.land = v === "1"; pianoSavePrefs(p); draw(); return; }
          if ((v = el.getAttribute("data-backing"))) { p.backing = v === "-" ? "" : v; pianoSavePrefs(p); draw(); return; }
          if ((v = el.getAttribute("data-send"))) {
            var res = pianoSendToSeq(pianoTakeById(pianoTakesLoad(), Number(v)));
            note = (res.ok ? "&#x2705; " : "&#x26A0;&#xFE0F; ") + escHtml(res.msg);
            draw();
            return;
          }
          if ((v = el.getAttribute("data-del"))) {
            var list = pianoTakesLoad(), t = pianoTakeById(list, Number(v));
            if (!t || (window.confirm && !window.confirm("「" + t.name + "」を消しますか？"))) { return; }
            list.splice(list.indexOf(t), 1);
            pianoTakesSave(list);
            draw();
            return;
          }
          if (el.getAttribute("data-back")) { ctl.back(); return; }
          if (el.getAttribute("data-go")) { ctl.done({ mode: "free", backing: p.backing }); return; }
          if ((v = el.getAttribute("data-open"))) { ctl.done({ mode: "free", take: Number(v), backing: p.backing }); return; }
          if ((v = el.getAttribute("data-song"))) { ctl.done({ mode: p.mode, song: v, speed: p.speed }); }
        };
      }
    }
    draw();
  }

  // ---------- §218 v1.26: パッド（和音を仕込んでおいて、1タップで鳴らす）----------
  var PIANO_PADS_KEY = "ultimateGorillaPianoPadsV1", PIANO_PAD_N = 16, PIANO_PAD_MAX_NOTES = 10;
  // はじめに入っている16個（C のキーでよく使うコード。すべて C4〜B5）
  var PIANO_PAD_DEFAULT = [[60, 64, 67], [62, 65, 69], [64, 67, 71], [65, 69, 72], [67, 71, 74], [69, 72, 76], [67, 71, 74, 77], [64, 67, 72],
    [65, 69, 72, 76], [69, 72, 76, 79], [62, 65, 69, 72], [64, 68, 71, 74], [60, 64, 67, 70], [65, 68, 72], [67, 72, 74], [60, 64, 67, 74]];
  function pianoPadsClean(a) {
    var out = [], i, j;
    for (i = 0; i < PIANO_PAD_N; i++) {
      var src = a && a[i] && a[i].length ? a[i] : [], pad = [];
      for (j = 0; j < src.length && pad.length < PIANO_PAD_MAX_NOTES; j++) {
        var m = Math.round(Number(src[j]));
        if (isFinite(m) && m >= 0 && m <= 127 && pad.indexOf(m) < 0) { pad.push(m); }
      }
      out.push(pad.sort(function (x, y) { return x - y; }));
    }
    return out;
  }
  function pianoPadsLoad() { var a = lsGet(PIANO_PADS_KEY); return pianoPadsClean(a && a.length ? a : PIANO_PAD_DEFAULT); }
  function pianoPadsSave(p) { return lsSet(PIANO_PADS_KEY, p); }
  // パッドの位置。たて: 鍵盤の上に 4×4 / よこ: 演奏は画面いっぱいに 8×2、登録中は鍵盤の上に 16×1
  function pianoPadRects(L, edit) {
    var out = [], i, cols = !L.land ? 4 : (edit ? 16 : 8), rows = PIANO_PAD_N / cols;
    var top = L.land ? 14 : 18, bottom = L.land && !edit ? L.h - 2 : L.kb - 3, cw = (W - 4) / cols, rh = (bottom - top) / rows;
    for (i = 0; i < PIANO_PAD_N; i++) { out.push({ x: 2 + (i % cols) * cw + 1, y: top + Math.floor(i / cols) * rh + 1, w: cw - 2, h: rh - 2 }); }
    return out;
  }
  function pianoPadAt(x, y, rects) {
    for (var i = 0; i < rects.length; i++) { var r = rects[i]; if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) { return i; } }
    return -1;
  }
  // パッドに出す名前（コード名。名前がなければ音名）
  function pianoPadLabel(notes) {
    if (!notes || !notes.length) { return ""; }
    var d = pianoChord(notes, 0);
    return d ? d.name || d.interval : notes.map(function (m) { return pianoName(m, "do"); }).join("");
  }

  // PC のキー → 鍵盤（左の C から 0, 1, 2…）
  var PIANO_KEYS = { a: "k0", w: "k1", s: "k2", e: "k3", d: "k4", f: "k5", t: "k6", g: "k7", y: "k8", h: "k9", u: "k10", j: "k11", k: "k12", o: "k13", l: "k14",
    z: "octdown", x: "octup", r: "rec", v: "play",
    "1": "p0", "2": "p1", "3": "p2", "4": "p3", "5": "p4", "6": "p5", "7": "p6", "8": "p7", "9": "p8", "0": "p9" };

  I.register({
    id: "piano",
    after: "ukulele",
    cat: "music",
    music: true,
    name: "ゴリラピアノ",
    icon: "&#x1F3B9;",
    desc: "鍵盤で自由に弾いて録音・光る鍵盤でれんしゅう・落ちてくる音符のリズムゲーム。ウクレレのシーケンサーの曲を伴奏にも",
    help: "鍵盤をタップ（和音・すべらせてもOK）/ A W S E D F T G Y H U J K O L で弾く / Z X オクターブ / R 録音 / V 再生 / P一時停止",
    controls: [],
    keys: PIANO_KEYS,
    setup: pianoSetup,
    setupLabel: "曲・モードを変える",
    panel: true,
    create: function (api, cfg) {
      cfg = cfg || {};
      var prefs = pianoPrefs(), mode = cfg.mode === "practice" || cfg.mode === "rhythm" ? cfg.mode : "free";
      var prog = prefs.prog, names = prefs.names, base = mode === "free" ? prefs.base : PIANO_SONG_LOW;
      var song = mode === "free" ? null : pianoSong(cfg.song), notes = song ? song.notes : [];
      var frame = 0, press = {}, ended = false, msg = "", shake = 0;
      var panel = api.panel, L = prefs.land ? PIANO_LAND : PIANO_PORT;
      if (panel && panel.classList) { panel.classList.add("quiz-panel"); }
      function now() { return frame / 60; }
      // §213: 横向き（鍵盤を大きく）
      function applyLand() {
        if (api.setLandscape) { api.setLandscape(L.land); }
        if (L.land) {
          var box = panel && panel.parentNode;
          L = pianoLandLayout(box ? pianoLandH(box.clientWidth, box.clientHeight) : 120);
        }
        api.setCanvasHeight(L.h);
      }
      applyLand();
      if (window.addEventListener) {
        if (pianoResize) { window.removeEventListener("resize", pianoResize); }
        pianoResize = function () { if (L.land) { allOff(); applyLand(); } };
        window.addEventListener("resize", pianoResize);
      }
      if (L.land) { pianoLock(true); }
      function setLand(on) {
        allOff();
        L = on ? PIANO_LAND : PIANO_PORT;
        prefs.land = on;
        pianoSavePrefs(prefs);
        applyLand();
        pianoLock(on);
        render();
      }

      // --- 音 ---
      var UG = window.UGMelody, audioOk = false;
      function audio() {
        if (audioOk || !UG || !UG.audioInit) { return; }
        try { if (UG.audioInit()) { audioOk = true; UG.loadSamples([prog]); } } catch (e) {}
      }
      function sound(m, lv) { audio(); if (audioOk) { try { UG.synth(m, prog, 0, lv || 0.8); } catch (e) {} } }
      function click(accent) { if (audioOk) { try { UG.synth(accent ? 37 : 42, UG.DRUM, 0, accent ? 0.9 : 0.6); } catch (e) {} } }

      // --- じゆうに弾く: 録音・再生 ---
      var bpm = prefs.bpm, meter = 4, metro = prefs.metro, takes = mode === "free" ? pianoTakesLoad() : [];
      var take = cfg.take ? pianoTakeById(takes, cfg.take) : null, rec = null, play = null;
      // §213: 伴奏（シーケンサーの曲）。bk ＝ 鳴らしているあいだの状態
      var back = mode === "free" && cfg.backing ? pianoBacking(cfg.backing) : null, bk = null;
      // §218: パッド（padHeld: 指・キー → 押しているパッド、padSel: 登録中に選んだ音）
      var padView = mode === "free" && prefs.pad, pads = mode === "free" ? pianoPadsLoad() : [], padEdit = false, padDel = false, padSel = [], padHeld = {}, padFlash = {};
      function padRectsNow() { return pianoPadRects(L, padEdit); }
      function keysHidden() { return padView && L.land && !padEdit; }
      function numSort(a, b) { return a - b; }
      function padPress(id, i) {
        if (!(i >= 0 && i < PIANO_PAD_N)) { return; }
        padFlash[i] = 12;
        if (padEdit) {
          if (padDel) { pads[i] = []; padDel = false; pianoPadsSave(pads); msg = "パッド " + (i + 1) + " を空にしました"; }
          else if (padSel.length) {
            pads[i] = padSel.slice().sort(numSort);
            pianoPadsSave(pads);
            msg = "パッド " + (i + 1) + " に「" + escHtml(pianoPadLabel(pads[i])) + "」を登録しました";
            padSel = [];
          } else if (pads[i].length) { padSel = pads[i].slice(); msg = "パッド " + (i + 1) + " の音を選びました。鍵盤で直して、パッドをタップすると登録"; }
          render();
          return;
        }
        if (!pads[i].length) { return; }
        padRelease(id);
        padHeld[id] = i;
        for (var k = 0; k < pads[i].length; k++) { noteOn(id + ":" + k, pads[i][k]); }
      }
      function padRelease(id) {
        var i = padHeld[id];
        if (i === undefined) { return; }
        delete padHeld[id];
        for (var k = 0; k < pads[i].length; k++) { noteOff(id + ":" + k); }
      }
      // 登録中: 鍵盤をタップすると音を選ぶ（もう一度で外す）
      function selToggle(m) {
        if (!padView || !padEdit || m < 0) { return; }
        var at = padSel.indexOf(m);
        if (at >= 0) { padSel.splice(at, 1); } else if (padSel.length < PIANO_PAD_MAX_NOTES) { padSel.push(m); padSel.sort(numSort); }
        render();
      }
      if (back) { bpm = back.seq.bpm; meter = back.seq.meter; }
      if (take) { msg = "「" + escHtml(take.name) + "」をひらきました。▶ 再生で聴けます"; }
      else if (back) { msg = "&#x1F3B8; 伴奏に合わせて弾こう。「🔴 合わせて録音」で録れます"; }
      else if (mode === "free" && cfg.backing) { msg = "伴奏の曲が見つかりませんでした（ゴリラウクレレのシーケンサーで曲を作ってね）"; }
      function backT() { return bk ? (frame - bk.f0) / 60 : 0; }
      // 伴奏の上の拍（カウントインのあいだはマイナス）
      function backBeat() {
        var S = back.s, t = backT();
        if (t < S.lead) { return (t - S.lead) / S.spb; }
        return S.beatAt ? S.beatAt(t) : (t - S.lead) / S.spb;
      }
      function backStart() {
        backStop();
        audio();
        var U = pianoSeqApi();
        bk = { f0: frame, idx: 0, outs: [null, null, null, null], mix: null, fx: false };
        if (audioOk && U && U.fxPush) { try { U.fxPush(back.seq); bk.fx = true; } catch (e) {} }
      }
      function backStop() {
        if (!bk) { return; }
        var U = pianoSeqApi();
        if (bk.fx && U && U.fxPop) { try { U.fxPop(); } catch (e) {} }
        bk = null;
      }
      function backStep() {
        var S = back.s, t = backT(), U = pianoSeqApi(), ac = audioOk && UG.audio ? UG.audio.ctx : null, ev;
        while (bk.idx < S.events.length && (ev = S.events[bk.idx]).t <= t + 0.1) {
          var on = ev.kind === "click" ? (back.seq.metronome || ev.t < S.lead) : true;
          if (on && ac && U && U.seqPlayEvent) {
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
      function recBeat() { return rec ? (rec.back ? backBeat() : (now() - rec.t0) * bpm / 60) : 0; }
      function r3(v) { return Math.round(v * 1000) / 1000; }
      function recToggle() {
        if (mode !== "free") { return; }
        if (rec) { recStop(); return; }
        playStop();
        audio();
        if (back) { backStart(); rec = { back: true, notes: [], open: {}, beat: -99 }; }
        else { rec = { t0: now() + meter * 60 / bpm, notes: [], open: {}, beat: -meter - 1 }; }
        msg = "";
        render();
      }
      function recOn(id, m) {
        if (!rec) { return; }
        var b = recBeat();
        if (b < -0.25 || rec.notes.length >= PIANO_NOTES_MAX) { return; }
        rec.open[id] = [Math.max(0, b), m];
      }
      function recOff(id) {
        if (!rec || !rec.open[id]) { return; }
        var o = rec.open[id];
        delete rec.open[id];
        rec.notes.push([r3(o[0]), r3(Math.max(0.0625, recBeat() - o[0])), o[1]]);
      }
      function recStop() {
        var ks = [], k, wasBack = rec.back;
        for (k in rec.open) { if (rec.open.hasOwnProperty(k)) { ks.push(k); } }
        for (k = 0; k < ks.length; k++) { recOff(ks[k]); }
        var n = rec.notes;
        rec = null;
        if (wasBack) { backStop(); }
        if (n.length) {
          take = pianoTakeAdd(takes, { bpm: bpm, meter: meter, prog: prog, notes: n, song: wasBack ? back.name : "" });
          pianoTakesSave(takes);
          msg = "&#x1F4BE; 「" + escHtml(take.name) + "」に保存しました（" + take.notes.length + "音）" + (wasBack ? "<br>はじめの画面の「🎸 送る」でシーケンサーに入れられます" : "");
        } else {
          msg = "音がなかったので保存しませんでした";
        }
        render();
      }
      // 再生（お手本も同じ）: 毎フレーム、時間が来た音を鳴らす。伴奏があれば伴奏といっしょに
      function playStart(ns, pbpm, withBack) {
        play = { t0: now() + 0.1, notes: ns, bpm: pbpm, idx: 0, back: !!withBack };
        if (withBack) { backStart(); }
        audio();
        render();
      }
      function playStop() { if (play) { if (play.back) { backStop(); } play = null; render(); } }
      function playBeat() { return play ? (play.back ? backBeat() : (now() - play.t0) * play.bpm / 60) : 0; }
      function playToggle() {
        if (play) { playStop(); return; }
        if (mode === "free") {
          if (rec) { return; }
          if (!take || !take.notes.length) { msg = "まだテイクがありません。🔴 録音してみよう"; render(); return; }
          playStart(take.notes, take.bpm, !!back);
        } else if (mode === "practice") {
          pi = 0; missHere = false;
          playStart(notes, song.bpm, false);
        }
      }
      // 伴奏だけ鳴らす（弾いてみる）
      function backToggle() {
        if (!back || rec) { return; }
        if (play) { playStop(); }
        if (bk) { backStop(); } else { backStart(); }
        render();
      }

      // --- れんしゅう ---
      var pi = 0, miss = 0, missHere = false;
      function practiceHit(m) {
        if (play || pi >= notes.length) { return; }
        if (m === notes[pi][2]) {
          if (!missHere) { api.addScore(50); }
          pi++;
          missHere = false;
          if (pi >= notes.length) { finish(); return; }
        } else {
          miss++;
          missHere = true;
          shake = 10;
        }
        render();
      }

      // --- リズムゲーム ---
      var rate = (PIANO_SPEEDS.indexOf(Number(cfg.speed)) >= 0 ? Number(cfg.speed) : 100) / 100;
      var spb = song ? 60 / song.bpm / rate : 0.5, rn = [], counts = [0, 0, 0, 0], combo = 0, maxCombo = 0, judgeText = "", judgeFrames = 0, lastClick = -99;
      if (mode === "rhythm") {
        for (var ni = 0; ni < notes.length; ni++) { rn.push({ t: PIANO_LEAD + notes[ni][0] * spb, d: notes[ni][1] * spb, m: notes[ni][2], j: -2 }); }
      }
      function rhythmHit(m) {
        var t = now(), best = null, i;
        for (i = 0; i < rn.length; i++) {
          var n = rn[i];
          if (n.t - t > PIANO_JUDGE[2][0]) { break; }
          if (n.j !== -2 || n.m !== m || Math.abs(t - n.t) > PIANO_JUDGE[2][0]) { continue; }
          if (!best || Math.abs(t - n.t) < Math.abs(t - best.t)) { best = n; }
        }
        if (!best) { return; }
        var g = pianoJudge(t - best.t);
        best.j = g;
        counts[g]++;
        combo++;
        maxCombo = Math.max(maxCombo, combo);
        api.addScore(PIANO_JUDGE[g][2] + Math.min(50, combo) * 2);
        judgeText = PIANO_JUDGE[g][1];
        judgeFrames = 30;
      }
      function rhythmStep() {
        var t = now(), i, left = 0;
        for (i = 0; i < rn.length; i++) {
          var n = rn[i];
          if (n.j === -2 && t - n.t > PIANO_JUDGE[2][0]) { n.j = -1; counts[3]++; combo = 0; judgeText = "MISS"; judgeFrames = 30; }
          if (n.j === -2) { left++; }
        }
        // カウント（音符の前の拍）
        var sb = Math.floor((t - PIANO_LEAD) / spb);
        if (sb < 0 && sb !== lastClick && t - PIANO_LEAD >= -PIANO_LEAD + 0.05) { lastClick = sb; audio(); click(sb % song.meter === 0); }
        if (!left && rn.length && t > rn[rn.length - 1].t + 1) { finish(); }
      }

      function finish() {
        if (ended) { return; }
        ended = true;
        var best = pianoBest(), title;
        if (mode === "practice") {
          if (!miss) { api.addScore(300); }
          var pk = "practice:" + song.id;
          if (!(best[pk] <= miss)) { best[pk] = miss; lsSet(PIANO_BEST_KEY, best); }
          msg = (miss ? "ミス " + miss + "回。" : "ノーミス！ +300。") + "おつかれさま！";
          title = miss ? "CLEAR!" : "PERFECT!";
        } else {
          var acc = rn.length ? (counts[0] + counts[1] * 0.7 + counts[2] * 0.4) / rn.length : 0, rk = pianoRank(acc);
          if (rn.length && counts[3] === 0) { api.addScore(500); }
          var rkey = "rhythm:" + song.id + "@" + Math.round(rate * 100), sc = api.getScore();
          if (!best[rkey] || !(best[rkey].s >= sc)) { best[rkey] = { s: sc, r: rk }; lsSet(PIANO_BEST_KEY, best); }
          msg = "ランク <b>" + rk + "</b>（正確さ " + Math.round(acc * 100) + "%）・最大コンボ " + maxCombo + (counts[3] === 0 ? "・&#x1F525; フルコンボ +500" : "") +
            "<br>PERFECT " + counts[0] + " / GREAT " + counts[1] + " / GOOD " + counts[2] + " / MISS " + counts[3];
          title = "ランク " + rk;
        }
        render();
        api.gameOver(title);
      }

      // --- 鍵盤 ---
      function noteOn(id, m) {
        if (m < 0 || ended) { return; }
        if (press[id] !== undefined) { noteOff(id); }
        press[id] = m;
        sound(m, 0.85);
        if (mode === "free") { recOn(id, m); } else if (mode === "practice") { practiceHit(m); } else { rhythmHit(m); }
      }
      function noteOff(id) {
        if (press[id] === undefined) { return; }
        delete press[id];
        if (mode === "free") { recOff(id); }
      }
      function allOff() { var ks = [], k; for (k in press) { if (press.hasOwnProperty(k)) { ks.push(k); } } for (k = 0; k < ks.length; k++) { noteOff(ks[k]); } }
      function octave(d) {
        if (mode !== "free") { return; }
        var nb = base + d * 12;
        if (nb < PIANO_BASE_MIN || nb > PIANO_BASE_MAX) { return; }
        allOff();
        base = nb;
        prefs.base = base;
        pianoSavePrefs(prefs);
        render();
      }
      function action(v) {
        if (v === "octdown") { octave(-1); } else if (v === "octup") { octave(1); }
        else if (v === "rec") { recToggle(); } else if (v === "play") { playToggle(); }
        else if (v === "back") { backToggle(); }
        else if (v === "land") { setLand(!L.land); }
        else if (v === "pad") { allOff(); padView = !padView; padEdit = false; padDel = false; padSel = []; prefs.pad = padView; pianoSavePrefs(prefs); msg = ""; render(); }
        else if (v === "padedit") { allOff(); padEdit = !padEdit; padDel = false; padSel = []; msg = ""; render(); }
        else if (v === "paddel") { padDel = !padDel; render(); }
        else if (v === "padclear") { padSel = []; render(); }
        else if (v === "padreset") {
          if (window.confirm && !window.confirm("パッドを はじめのコードにもどしますか？")) { return; }
          pads = pianoPadsClean(PIANO_PAD_DEFAULT); pianoPadsSave(pads); msg = "パッドを はじめのコードにもどしました"; render();
        }
        else if (v === "restart" && mode === "practice") { playStop(); pi = 0; missHere = false; render(); }
        else if (v === "metro") { metro = !metro; prefs.metro = metro; pianoSavePrefs(prefs); render(); }
        else if (v === "bpmdown" || v === "bpmup") {
          if (rec || back) { return; }
          bpm = Math.max(40, Math.min(240, bpm + (v === "bpmup" ? 5 : -5)));
          prefs.bpm = bpm;
          pianoSavePrefs(prefs);
          render();
        }
      }

      function render() {
        if (!panel) { return; }
        var html = "", landBtn = '<div class="piano-row"><button class="modal-btn" data-pa="land">' + (L.land ? "&#x1F4F1; たて向きにもどす" : "&#x2194;&#xFE0F; よこ向き（鍵盤を大きく）") + '</button></div>';
        if (mode === "free") {
          html += '<div class="piano-row"><button class="modal-btn" data-pa="octdown">&#x25C0; 低く</button><span>' + pianoName(base, "cde") + '〜' + pianoName(base + 23, "cde") + '</span>' +
            '<button class="modal-btn" data-pa="octup">高く &#x25B6;</button></div>' +
            '<div class="piano-row"><button class="modal-btn' + (rec ? " piano-rec-on" : "") + '" data-pa="rec">' + (rec ? "&#x23F9;&#xFE0F; 録音をとめる" : (back ? "&#x1F534; 合わせて録音" : "&#x1F534; 録音")) + '</button>' +
            '<button class="modal-btn" data-pa="play"' + (rec ? " disabled" : "") + '>' + (play ? "&#x23F9;&#xFE0F; とめる" : (back ? "&#x25B6;&#xFE0F; テイク＋伴奏" : "&#x25B6;&#xFE0F; 再生")) + '</button></div>';
          if (back) {
            html += '<div class="piano-row"><button class="modal-btn" data-pa="back"' + (rec ? " disabled" : "") + '>' + (bk && !play ? "&#x23F9;&#xFE0F; 伴奏をとめる" : "&#x1F3B8; 伴奏だけ鳴らす") + '</button></div>' +
              '<p class="small" style="margin:4px 0 0;">&#x1F3B8; 伴奏: ' + escHtml(back.name) + '（BPM ' + back.seq.bpm + '・' + back.seq.meter + '拍子）</p>';
          } else {
            html += '<div class="piano-row"><button class="modal-btn" data-pa="bpmdown">&minus;</button><span>BPM ' + bpm + '</span><button class="modal-btn" data-pa="bpmup">&#xFF0B;</button>' +
              '<button class="modal-btn" data-pa="metro">&#x1F941; ' + (metro ? "ON" : "OFF") + '</button></div>';
          }
          html += '<div class="piano-row"><button class="modal-btn' + (padView ? " piano-pad-on" : "") + '" data-pa="pad">' + (padView ? "&#x1F3B9; 鍵盤だけにする" : "&#x1F39B;&#xFE0F; パッド（16個）") + '</button>' +
            (padView ? '<button class="modal-btn' + (padEdit ? " piano-pad-on" : "") + '" data-pa="padedit">&#x270F;&#xFE0F; 登録 ' + (padEdit ? "ON" : "OFF") + '</button>' : "") + '</div>';
          if (padView && padEdit) {
            html += '<div class="piano-row"><button class="modal-btn' + (padDel ? " piano-rec-on" : "") + '" data-pa="paddel">&#x1F5D1;&#xFE0F; ' + (padDel ? "消すパッドをタップ" : "パッドを空にする") + '</button>' +
              '<button class="modal-btn" data-pa="padclear">選んだ音をはずす</button><button class="modal-btn" data-pa="padreset">&#x21BA; はじめのコード</button></div>' +
              '<p class="small" style="margin:4px 0 0;">鍵盤をタップして音を選び（もう一度で外す）、パッドをタップして登録。選んだ音: ' +
              (padSel.length ? padSel.map(function (m) { return pianoName(m, "cde"); }).join(" ") + (pianoPadLabel(padSel) ? "（" + escHtml(pianoPadLabel(padSel)) + "）" : "") : "まだありません") + '</p>';
          }
          html += landBtn;
          if (take && !rec) { html += '<p class="small" style="margin:4px 0 0;">いまのテイク: ' + escHtml(take.name) + '（' + take.notes.length + '音・BPM ' + take.bpm + '）</p>'; }
        } else if (mode === "practice") {
          html += '<div class="piano-row"><button class="modal-btn" data-pa="play"' + (ended ? " disabled" : "") + '>' + (play ? "&#x23F9;&#xFE0F; とめる" : "&#x1F50A; お手本") + '</button>' +
            '<button class="modal-btn" data-pa="restart"' + (ended ? " disabled" : "") + '>&#x21BA; はじめから</button></div>' + landBtn +
            '<p class="small" style="margin:4px 0 0;">' + escHtml(song.name) + '・' + Math.min(pi, notes.length) + ' / ' + notes.length + '音・ミス ' + miss + '</p>';
        } else {
          html += landBtn + '<p class="small" style="margin:4px 0 0;">' + escHtml(song.name) + '（速さ ' + Math.round(rate * 100) + '%）・' + rn.length + '音</p>';
        }
        if (msg) { html += '<p class="small" style="margin:4px 0 0;color:#ffd166;">' + msg + '</p>'; }
        panel.innerHTML = html;
        var bs = panel.querySelectorAll ? panel.querySelectorAll("button[data-pa]") : [], i;
        for (i = 0; i < bs.length; i++) {
          bs[i].onclick = function (ev) { if (ev.currentTarget.blur) { ev.currentTarget.blur(); } action(ev.currentTarget.getAttribute("data-pa")); };
        }
      }
      render();

      // いま光らせる鍵盤 { midi: 色の種類 }
      function litKeys() {
        var out = {}, k, i;
        if (play) {
          var pb = playBeat();
          for (i = 0; i < play.notes.length; i++) { var n = play.notes[i]; if (n[0] <= pb && pb < n[0] + Math.max(0.25, n[1])) { out[n[2]] = "play"; } }
        }
        if (mode === "practice" && !play && pi < notes.length && !ended) { out[notes[pi][2]] = "next"; }
        if (padView && padEdit) { for (i = 0; i < padSel.length; i++) { out[padSel[i]] = "next"; } }
        for (k in press) { if (press.hasOwnProperty(k)) { out[press[k]] = "press"; } }
        return out;
      }
      function drawKeys(ctx) {
        var lit = litKeys(), m, r, top = L.kb, col;
        var white = { press: "#ffd166", next: "#55efc4", play: "#74c0fc" }, black = { press: "#e0a800", next: "#1e9e6a", play: "#2f7dd1" };
        for (m = base; m < base + 24; m++) {
          if (pianoIsBlack(m)) { continue; }
          r = pianoKeyRect(m, base);
          ctx.fillStyle = white[lit[m]] || "#fdfdfd";
          ctx.fillRect(r.x + 0.5, top, r.w - 1, L.h - top);
          ctx.strokeStyle = "#555";
          ctx.strokeRect(r.x + 0.5, top, r.w - 1, L.h - top);
          var nm = pianoName(m, names);
          if (nm) {
            ctx.fillStyle = pianoPc(m) === 0 ? "#c0392b" : "#555";
            ctx.font = (nm.length > 2 ? 7 : 8) + "px sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(nm, r.x + r.w / 2, L.h - (L.land ? 7 : 9));
          }
        }
        for (m = base; m < base + 24; m++) {
          if (!pianoIsBlack(m)) { continue; }
          r = pianoKeyRect(m, base);
          col = black[lit[m]] || "#222";
          ctx.fillStyle = col;
          ctx.fillRect(r.x, top, r.w, L.bh);
        }
      }
      // 「＝ A ／ B ／ C」を幅で折り返した行の配列（maxLines 行まで。あふれたら最後の行にまとめて小さく出す）
      function wrapList(ctx, items, head, size, maxW, maxLines) {
        var lines = [], cur = head, i;
        ctx.font = "bold " + size + "px sans-serif";
        for (i = 0; i < items.length; i++) {
          var add = (cur === head ? "" : " ／ ") + items[i];
          var mw = cur !== head && ctx.measureText ? ctx.measureText(cur + add) : null;
          if (mw && mw.width > maxW && lines.length < maxLines - 1) { lines.push(cur); cur = "　" + items[i]; }
          else { cur += add; }
        }
        lines.push(cur);
        return lines;
      }
      function drawPads(ctx) {
        var rs = padRectsNow(), on = {}, i, k;
        for (k in padHeld) { if (padHeld.hasOwnProperty(k)) { on[padHeld[k]] = true; } }
        if (keysHidden()) { ctx.fillStyle = "#1b1f3b"; ctx.fillRect(0, L.kb, W, L.h - L.kb); }
        for (i = 0; i < rs.length; i++) {
          var r = rs[i], has = pads[i].length > 0, hot = on[i] || padFlash[i] > 0;
          ctx.fillStyle = hot ? "#ffd166" : (has ? (padEdit ? "#2f4a6e" : "#4c3a8f") : "#262a45");
          ctx.fillRect(r.x, r.y, r.w, r.h);
          ctx.strokeStyle = padEdit ? (padDel ? "#ff7675" : "#55efc4") : "#7d6bd6";
          ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
          if (r.w > 20) {
            ctx.fillStyle = hot ? "#14213d" : "rgba(255,255,255,0.45)";
            ctx.font = "7px sans-serif";
            ctx.textAlign = "left";
            ctx.textBaseline = "top";
            ctx.fillText(String(i + 1), r.x + 2, r.y + 1);
          }
          var lb = pianoPadLabel(pads[i]) || (padEdit ? "＋" : "");
          if (lb) { fitText(ctx, lb, r.x + r.w / 2, r.y + r.h / 2 + (r.h > 20 ? 2 : 0), Math.max(6, Math.min(12, Math.floor(r.h * 0.42))), hot ? "#14213d" : "#ffffff", r.w - 3); }
        }
      }
      // 幅に入りきらなければ小さくする（measureText がなければそのまま）
      function fitText(ctx, s, x, y, size, color, maxW) {
        ctx.font = "bold " + size + "px sans-serif";
        var mw = ctx.measureText ? ctx.measureText(s) : null;
        while (mw && mw.width > maxW && size > 6) { size--; ctx.font = "bold " + size + "px sans-serif"; mw = ctx.measureText(s); }
        text(ctx, s, x, y, size, color);
      }
      function text(ctx, s, x, y, size, color) {
        ctx.fillStyle = color;
        ctx.font = "bold " + size + "px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(s, x, y);
      }

      return {
        input: function (a, down) {
          if (a.charAt(0) === "k") {
            var id = "key" + a.substring(1);
            if (down) { selToggle(base + Number(a.substring(1))); noteOn(id, base + Number(a.substring(1))); } else { noteOff(id); }
            return;
          }
          if (/^p\d+$/.test(a) && mode === "free") {
            if (down) { padPress("kp" + a.substring(1), Number(a.substring(1))); } else { padRelease("kp" + a.substring(1)); }
            return;
          }
          if (down && !ended) { action(a); }
        },
        pointer: function (type, x, y, id) {
          if (type === "down") {
            // §218: パッドの場所ならパッド、鍵盤なら鍵盤（登録中は音を選ぶ）
            if (padView && (y < L.kb || keysHidden())) { padPress(id, pianoPadAt(x, y, padRectsNow())); return; }
            var km = pianoKeyAt(x, y, base, L);
            selToggle(km);
            noteOn(id, km);
          }
          else if (type === "move") {
            if (press[id] === undefined || padHeld[id] !== undefined) { return; }
            var m = pianoKeyAt(x, y, base, L);
            if (m >= 0 && m !== press[id]) { noteOn(id, m); }
          } else { padRelease(id); noteOff(id); }
        },
        step: function () {
          frame++;
          if (shake > 0) { shake--; }
          if (judgeFrames > 0) { judgeFrames--; }
          for (var pf in padFlash) { if (padFlash.hasOwnProperty(pf) && padFlash[pf] > 0) { padFlash[pf]--; } }
          if (bk) { backStep(); }
          if (play) {
            var pb = playBeat(), last = 0, i;
            while (play.idx < play.notes.length && play.notes[play.idx][0] <= pb) { sound(play.notes[play.idx][2], 0.8); play.idx++; }
            for (i = 0; i < play.notes.length; i++) { last = Math.max(last, play.notes[i][0] + play.notes[i][1]); }
            if (!play.back && play.idx >= play.notes.length && pb > last) { play = null; render(); }
          }
          if (rec && !rec.back) {
            var rb = Math.floor(recBeat());
            if (rb !== rec.beat && (metro || rb < 0)) { click(((rb % meter) + meter) % meter === 0); }
            rec.beat = rb;
          }
          if (mode === "rhythm" && !ended) { rhythmStep(); }
        },
        draw: function (ctx) {
          var A = L.kb, land = L.land;
          var g = ctx.createLinearGradient ? ctx.createLinearGradient(0, 0, 0, A) : null;
          if (g) { g.addColorStop(0, "#1b1f3b"); g.addColorStop(1, "#2d1b4e"); }
          ctx.fillStyle = g || "#1b263b";
          ctx.fillRect(0, 0, W, A);
          var i, sx = shake ? (shake % 2 ? 3 : -3) : 0;
          if (mode === "free") {
            hudText(ctx, "🎹 " + pianoName(base, "cde") + "〜" + pianoName(base + 23, "cde"), 8, land ? 8 : 10, "left");
            hudText(ctx, (back ? "🎸 " : "") + "BPM " + bpm, W - 8, land ? 8 : 10, "right");
            if (padView) {
              // §218: 上のまん中に、録音・登録・いま鳴っているコード
              var ph = pianoHeld(press), pc2 = pianoChord(ph, 0), hl = "";
              if (padEdit) { hl = padDel ? "🗑 消すパッドをタップ" : "✏️ " + (padSel.length ? (pianoPadLabel(padSel) || "") + " " + padSel.map(function (m) { return pianoName(m, "do"); }).join("") : "鍵盤で音をえらぶ"); }
              else if (rec) { var rb2 = recBeat(); hl = rb2 < 0 ? "● " + Math.ceil(-rb2) : "● REC " + (Math.floor(rb2 / meter) + 1) + "小節・" + rec.notes.length + "音"; }
              else if (pc2) { hl = pc2.name || pc2.interval; }
              if (hl) { fitText(ctx, hl, W / 2, land ? 8 : 10, 10, rec && !padEdit ? "#ff6b6b" : "#ffffff", 104); }
              drawPads(ctx);
            } else if (rec) {
              var rb = recBeat();
              text(ctx, rb < 0 ? String(Math.ceil(-rb)) : "● REC", W / 2, land ? 24 : 60, land ? 14 : 20, "#ff6b6b");
              text(ctx, rb < 0 ? "カウントのあとに弾いてね" : (Math.floor(rb / meter) + 1) + "小節目・" + rec.notes.length + "音", W / 2, land ? 38 : 90, land ? 9 : 12, "#ffffff");
            } else {
              var held = pianoHeld(press), k;
              // 再生中は鳴っている音（押していないとき）
              if (!held.length && play) { var lk = litKeys(); for (k in lk) { if (lk.hasOwnProperty(k) && lk[k] === "play") { held.push(Number(k)); } } held.sort(function (a, b) { return a - b; }); }
              var cd = pianoChord(held, prefs.alts), top = cd ? cd.name || cd.interval : "", noteLine = held.map(function (m) { return pianoName(m, names === "none" ? "do" : names); }).join(" ");
              if (top) {
                // §215: コード名（オンコードは「C/E」と、下に「C on E」）
                // §216: どちらとも読めるコードは「＝ 別の読み方」も出す
                var alt = cd.name && cd.alts.length ? "＝ " + cd.alts.join(" ／ ") : "", onTxt = cd.onBass ? cd.name.split("/")[0] + " on " + cd.onBass : "";
                if (land) {
                  // 別の読み方が2つまでなら1行目に、多いときは2行目に分ける
                  if (!alt || cd.alts.length <= 2) {
                    fitText(ctx, top + (alt ? "　" + alt : ""), W / 2, 21, cd.name ? 17 : 12, "#ffd166", W - 12);
                    fitText(ctx, (onTxt ? onTxt + "　" : "") + noteLine, W / 2, 37, 8, "#ffffff", W - 12);
                  } else {
                    fitText(ctx, top + (onTxt ? "（" + onTxt + "）" : "") + "　" + noteLine, W / 2, 18, 13, "#ffd166", W - 12);
                    fitText(ctx, alt, W / 2, 34, 9, "#ffe8a3", W - 8);
                  }
                } else {
                  // 別の読み方は幅で折り返す（4行まで。入りきらなければ文字を小さく）
                  var al = alt ? wrapList(ctx, cd.alts, "＝ ", 12, W - 16, 4) : [], y0 = al.length ? 42 : 56, li;
                  fitText(ctx, top, W / 2, y0, cd.name ? (al.length > 2 ? 24 : 28) : 18, "#ffd166", W - 16);
                  var yy = y0 + (al.length ? 22 : 30);
                  for (li = 0; li < al.length; li++) { fitText(ctx, al[li], W / 2, yy, 12, "#ffe8a3", W - 16); yy += 14; }
                  if (al.length) { yy += 4; }
                  if (onTxt) { fitText(ctx, onTxt + "（ベースは " + pianoName(held[0], "do") + "）", W / 2, yy, 11, "#ffffff", W - 16); yy += 18; }
                  fitText(ctx, noteLine, W / 2, Math.max(yy, al.length ? 0 : 112), 13, "#ffffff", W - 16);
                }
              } else {
                if (!land) { emojiAt(ctx, play || bk ? "🎶" : "🦍", W / 2, 60, 40); }
                text(ctx, held.length ? noteLine : (play ? "再生中…" : (bk ? "伴奏中…" : "鍵盤をタップして弾こう")), W / 2, land ? 28 : 112, land ? 11 : 14, "#ffffff");
              }
            }
          } else if (mode === "practice") {
            hudText(ctx, "📖 " + song.name, 8, land ? 8 : 10, "left");
            hudText(ctx, "ミス " + miss, W - 8, land ? 8 : 10, "right");
            // これから弾く音
            for (i = 0; i < 6 && pi + i < notes.length; i++) {
              var cx = (land ? 30 : 40) + i * (land ? 30 : 34) + (i === 0 ? sx : 0), big = i === 0 && !play, cy = land ? 27 : 70;
              ctx.fillStyle = big ? "#55efc4" : "rgba(255,255,255,0.15)";
              ctx.beginPath();
              ctx.arc(cx, cy, big ? (land ? 11 : 18) : (land ? 8 : 13), 0, Math.PI * 2);
              ctx.fill();
              text(ctx, pianoName(notes[pi + i][2], names === "none" ? "do" : names), cx, cy, big ? (land ? 9 : 12) : (land ? 7 : 10), big ? "#14213d" : "#ffffff");
            }
            ctx.fillStyle = "rgba(255,255,255,0.15)";
            ctx.fillRect(10, land ? 41 : 120, W - 20, land ? 3 : 6);
            ctx.fillStyle = "#55efc4";
            ctx.fillRect(10, land ? 41 : 120, (W - 20) * (notes.length ? Math.min(pi, notes.length) / notes.length : 0), land ? 3 : 6);
            if (!land) { text(ctx, play ? "お手本を聴いてね（青く光る鍵盤）" : (ended ? "おしまい！" : "緑に光る鍵盤を押そう"), W / 2, 145, 11, "#ffffff"); }
          } else {
            hudText(ctx, "🎮 " + song.name, 8, land ? 8 : 10, "left");
            hudText(ctx, combo >= 2 ? combo + " COMBO" : "", W - 8, land ? 8 : 10, "right");
            var t = now(), fall = A - 14;
            for (i = 0; i < rn.length; i++) {
              var n = rn[i];
              if (n.j >= 0 || n.t - t > PIANO_LOOK) { continue; }
              var y = A - (n.t - t) / PIANO_LOOK * fall, h = Math.max(land ? 4 : 8, n.d / PIANO_LOOK * fall * 0.8), r = pianoKeyRect(n.m, base);
              if (y - h > A) { continue; }
              ctx.fillStyle = n.j === -1 ? "rgba(255,118,117,0.5)" : (pianoIsBlack(n.m) ? "#a29bfe" : "#55efc4");
              ctx.fillRect(r.x + 1, y - h, r.w - 2, h);
            }
            ctx.fillStyle = "#ffd166";
            ctx.fillRect(0, A - 2, W, 2);
            if (t < PIANO_LEAD) { text(ctx, String(Math.ceil(PIANO_LEAD - t)), W / 2, land ? 26 : 70, land ? 18 : 28, "#ffffff"); }
            if (judgeFrames > 0) {
              text(ctx, judgeText, W / 2, land ? 28 : 120, (land ? 12 : 16) + Math.max(0, judgeFrames - 24) * (land ? 0.5 : 1),
                judgeText === "MISS" ? "#ff7675" : (judgeText === "PERFECT" ? "#ffd166" : "#55efc4"));
            }
          }
          if (!keysHidden()) { drawKeys(ctx); }
        }
      };
    }
  });

  window.UGPiano = {
    songs: PIANO_SONGS, song: pianoSong, parse: pianoParse, midiOf: pianoMidi, name: pianoName, isBlack: pianoIsBlack,
    keyAt: pianoKeyAt, keyRect: pianoKeyRect, held: pianoHeld, chord: pianoChord, padsLoad: pianoPadsLoad, padsSave: pianoPadsSave, padsClean: pianoPadsClean, padRects: pianoPadRects, padAt: pianoPadAt, padLabel: pianoPadLabel,
    PAD_DEFAULT: PIANO_PAD_DEFAULT, PAD_N: PIANO_PAD_N, PADS_KEY: PIANO_PADS_KEY, ALTS: PIANO_ALTS, ALTS_ALL: PIANO_ALTS_ALL, judge: pianoJudge, rank: pianoRank, prefs: pianoPrefs,
    takesLoad: pianoTakesLoad, takesSave: pianoTakesSave, takeAdd: pianoTakeAdd, takeById: pianoTakeById, notesClean: pianoNotesClean, toSeqNotes: pianoToSeqNotes,
    backList: pianoBackList, backing: pianoBacking, sendToSeq: pianoSendToSeq, PORT: PIANO_PORT, LAND: PIANO_LAND, landLayout: pianoLandLayout, landH: pianoLandH,
    JUDGE: PIANO_JUDGE, SPEEDS: PIANO_SPEEDS, VOICES: PIANO_VOICES, KEYS: PIANO_KEYS, LEAD: PIANO_LEAD, H: PIANO_H, KB_Y: PIANO_KB_Y, SONG_LOW: PIANO_SONG_LOW,
    TAKES_KEY: PIANO_TAKES_KEY, TAKES_MAX: PIANO_TAKES_MAX, BEST_KEY: PIANO_BEST_KEY, PREFS_KEY: PIANO_PREFS_KEY
  };
})();
