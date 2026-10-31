// =========================================================
// 究極ゴリラ ゲームセンター: 🥁 ゴリラドラム（§226）
// arcade.js・arcade-melody.js・arcade-ukulele.js の後に読み込む。音は window.UGMelody のドラム音。
// 打ち込みはシーケンサーのマイリズム（[[MIDI, [マス]]]）、録音は録音トラック（[拍, MIDI, 強さ]）と同じ形で保存する
// =========================================================
(function () {
  "use strict";

  var I = window.UGArcade && window.UGArcade.internal;
  if (!I) { return; }
  var W = I.W, hudText = I.hudText, lsGet = I.lsGet, lsSet = I.lsSet, escHtml = I.escHtml;

  var DRUM_H = 300, DRUM_TOP = 64;
  var DRUM_PREFS_KEY = "ultimateGorillaDrumPrefsV1", DRUM_TAKES_KEY = "ultimateGorillaDrumTakesV1", DRUM_PATS_KEY = "ultimateGorillaDrumPatsV1", DRUM_BEST_KEY = "ultimateGorillaDrumBestV1";
  var DRUM_TAKES_MAX = 10, DRUM_PATS_MAX = 10, DRUM_NOTES_MAX = 1000, DRUM_STEPS = 16, DRUM_BARS = 8;
  var DRUM_LEAD = 2, DRUM_LOOK = 1.6, DRUM_SPEEDS = [70, 85, 100];
  var DRUM_JUDGE = [[0.07, "PERFECT", 100], [0.13, "GREAT", 70], [0.2, "GOOD", 40]];
  // パッド（画面の並び: 上の段・下の段）[MIDI, 名前, 短い名前, 色, キー]
  var DRUM_PADS = [
    [42, "ハイハット", "HH", "#55efc4", "Q"], [46, "オープンHH", "OH", "#81ecec", "W"], [47, "タム", "TOM", "#fab1a0", "E"], [49, "クラッシュ", "CR", "#ffeaa7", "R"],
    [36, "キック", "KICK", "#ff7675", "A"], [38, "スネア", "SN", "#74b9ff", "S"], [39, "クラップ", "CLAP", "#a29bfe", "D"], [37, "リム", "RIM", "#dfe6e9", "F"]
  ];
  // ステップ打ち込みの段の順（シーケンサーのマイリズムの6段が先）
  var DRUM_ROWS = [36, 38, 39, 37, 42, 46, 47, 49];
  var DRUM_SEQ_ROWS = [36, 38, 42, 46, 39, 37]; // シーケンサーのマイリズムで使える楽器
  var DRUM_MODES = [["free", "&#x1F941; じゆう"], ["step", "&#x1F39B;&#xFE0F; ステップ"], ["rhythm", "&#x1F3AE; リズム"]];
  var DRUM_LEVELS = [["easy", "かんたん", [36, 38, 39, 37]], ["normal", "ふつう", [36, 38, 39, 37, 42]], ["hard", "むずかしい", null]];
  // リズムゲームの曲 [リズムの id, BPM, ★]
  var DRUM_SONGS = [["8beat", 100, 1], ["four", 110, 1], ["rock", 110, 2], ["halftime", 80, 1], ["shuffle", 100, 2],
    ["disco", 115, 2], ["beat16", 95, 3], ["funk", 95, 3], ["bossa", 110, 3], ["march", 110, 2]];

  // §228 v1.36: ドラムセットだけにある楽器 [MIDI, 名前, 短い名前, 色]
  var DRUM_EXTRA = [[51, "ライド", "RIDE", "#ffeaa7"], [48, "タム（高）", "TOM1", "#fab1a0"], [45, "タム（中）", "TOM2", "#fd9b8a"], [43, "フロアタム", "FLOOR", "#e17055"]];
  function drumPad(m) {
    var i;
    for (i = 0; i < DRUM_PADS.length; i++) { if (DRUM_PADS[i][0] === m) { return DRUM_PADS[i]; } }
    for (i = 0; i < DRUM_EXTRA.length; i++) { if (DRUM_EXTRA[i][0] === m) { return DRUM_EXTRA[i]; } }
    return null;
  }
  // ドラムセット（200×110 の中の位置）[id, MIDI, 中心x, 中心y, 横の半径, 縦の半径, 種類 "cym" | "drum" | "kick", キー]
  // ハイハットはペダルが開いていれば 46（オープン）
  var DRUM_KIT = [
    ["kick", 36, 100, 80, 29, 27, "kick", "A"], ["ride", 51, 166, 20, 31, 9, "cym", "F"], ["crash", 49, 38, 15, 28, 8, "cym", "W"],
    ["floor", 43, 158, 74, 23, 15, "drum", "D"], ["tom1", 48, 80, 40, 17, 12, "drum", "E"], ["tom2", 45, 119, 40, 17, 12, "drum", "R"],
    ["hh", 42, 17, 52, 18, 6, "cym", "Q"], ["snare", 38, 52, 72, 21, 14, "drum", "S"]
  ];
  // 叩いたかを調べる順（手前から）
  var DRUM_KIT_HIT = ["snare", "hh", "tom1", "tom2", "floor", "crash", "ride", "kick"];
  function drumKitPiece(id) { for (var i = 0; i < DRUM_KIT.length; i++) { if (DRUM_KIT[i][0] === id) { return DRUM_KIT[i]; } } return null; }
  // セットを置く場所（box: 描ける範囲）。横は縦の1.6倍まで、縦は横の1.1倍まで伸ばす
  function drumKitBox(top, h) {
    var sx = W / 200, sy = h / 110;
    if (sx > sy * 1.6) { sx = sy * 1.6; }
    if (sy > sx * 1.1) { sy = sx * 1.1; }
    return { x: (W - 200 * sx) / 2, y: top + (h - 110 * sy) / 2, sx: sx, sy: sy };
  }
  function drumKitShape(p, b) { return { cx: b.x + p[2] * b.sx, cy: b.y + p[3] * b.sy, rx: p[4] * b.sx, ry: p[5] * b.sy }; }
  // 座標 → セットの部品（シンバルは細いので上下を広めに）
  function drumKitAt(x, y, b) {
    for (var i = 0; i < DRUM_KIT_HIT.length; i++) {
      var p = drumKitPiece(DRUM_KIT_HIT[i]), r = drumKitShape(p, b), ry = p[6] === "cym" ? r.ry * 1.9 : r.ry;
      var dx = (x - r.cx) / r.rx, dy = (y - r.cy) / ry;
      if (dx * dx + dy * dy <= 1) { return p; }
    }
    return null;
  }
  function drumName(m) { var p = drumPad(m); return p ? p[1] : String(m); }
  function drumNum(v, lo, hi) { var n = Number(v); return isFinite(n) && n >= lo && n <= hi ? n : null; }

  // ---------- リズムのお手本（シーケンサーと同じ。4拍子のものだけ）----------
  function drumGrooves() {
    var U = window.UGUkulele, g = U && U.grooves ? U.grooves() : [], out = [], i;
    for (i = 0; i < g.length; i++) {
      if (!g[i] || !g[i].hits || g[i].meter === 3 || /3拍子/.test(g[i].name || "")) { continue; }
      out.push(g[i]);
    }
    return out;
  }
  function drumGroove(id) { var g = drumGrooves(), i; for (i = 0; i < g.length; i++) { if (g[i].id === id) { return g[i]; } } return null; }

  // ---------- ステップ（[[MIDI, [マス]]] を 8段そろえる）----------
  function drumStepsClean(a) {
    var out = [], i, j, k;
    for (i = 0; i < DRUM_ROWS.length; i++) {
      var m = DRUM_ROWS[i], st = [];
      for (j = 0; a && a.length && j < a.length; j++) {
        if (!a[j] || Number(a[j][0]) !== m || !a[j][1] || !a[j][1].length) { continue; }
        for (k = 0; k < a[j][1].length; k++) { var n = Math.round(Number(a[j][1][k])); if (n >= 0 && n < DRUM_STEPS && st.indexOf(n) < 0) { st.push(n); } }
      }
      out.push([m, st.sort(function (x, y) { return x - y; })]);
    }
    return out;
  }
  function drumStepsFrom(grooveId) {
    var g = drumGroove(grooveId), src = [], i;
    if (g) { for (i = 0; i < g.hits.length; i++) { src.push([g.hits[i][0], g.hits[i][1]]); } }
    return drumStepsClean(src);
  }
  function drumStepOn(steps, m, s) { for (var i = 0; i < steps.length; i++) { if (steps[i][0] === m) { return steps[i][1].indexOf(s) >= 0; } } return false; }
  function drumStepToggle(steps, m, s) {
    for (var i = 0; i < steps.length; i++) {
      if (steps[i][0] !== m) { continue; }
      var at = steps[i][1].indexOf(s);
      if (at >= 0) { steps[i][1].splice(at, 1); } else { steps[i][1].push(s); steps[i][1].sort(function (x, y) { return x - y; }); }
      return at < 0;
    }
    return false;
  }
  // シーケンサーのマイリズムにそのまま入れられる形（使えない楽器・空の段は外す）
  function drumToSeqCustom(steps) {
    var out = [], c = drumStepsClean(steps), i;
    for (i = 0; i < c.length; i++) { if (DRUM_SEQ_ROWS.indexOf(c[i][0]) >= 0) { out.push([c[i][0], c[i][1].slice()]); } }
    return out;
  }

  // ---------- テイク・保存したリズム・設定 ----------
  function drumNotesClean(a) {
    var out = [], i;
    for (i = 0; a && a.length && i < a.length && out.length < DRUM_NOTES_MAX; i++) {
      var b = a[i] && drumNum(a[i][0], 0, 4096), m = a[i] && drumNum(a[i][1], 27, 87), l = a[i] && drumNum(a[i][2], 0, 1);
      if (b !== null && m !== null) { out.push([b, Math.round(m), l === null ? 0.8 : l]); }
    }
    return out.sort(function (x, y) { return x[0] - y[0]; });
  }
  function drumTakeClean(t, i) {
    return { id: Math.max(1, Math.round(Number(t.id)) || i + 1), name: String(t.name || "テイク").slice(0, 20), bpm: Math.max(40, Math.min(240, Math.round(Number(t.bpm) || 100))), notes: drumNotesClean(t.notes),
      song: typeof t.song === "string" ? t.song.slice(0, 20) : "" };
  }
  function drumListLoad(key, max, clean) {
    var a = lsGet(key), out = [], i;
    for (i = 0; a && a.length && i < a.length && out.length < max; i++) { if (a[i] && typeof a[i] === "object") { out.push(clean(a[i], i)); } }
    return out;
  }
  function drumTakesLoad() { return drumListLoad(DRUM_TAKES_KEY, DRUM_TAKES_MAX, drumTakeClean); }
  function drumTakesSave(list) { return lsSet(DRUM_TAKES_KEY, list.slice(0, DRUM_TAKES_MAX)); }
  function drumPatClean(p, i) { return { id: Math.max(1, Math.round(Number(p.id)) || i + 1), name: String(p.name || "リズム").slice(0, 16), bpm: Math.max(40, Math.min(240, Math.round(Number(p.bpm) || 100))), steps: drumStepsClean(p.steps), kind: p.kind === "fill" ? "fill" : "loop" }; } // §235: kind ＝ フィルとして保存
  function drumPatsLoad() { return drumListLoad(DRUM_PATS_KEY, DRUM_PATS_MAX, drumPatClean); }
  function drumPatsSave(list) { return lsSet(DRUM_PATS_KEY, list.slice(0, DRUM_PATS_MAX)); }
  // 新しいものを先頭に足す（あふれたら古いものから消える）。足したものを返す
  function drumListAdd(list, item, max, clean, prefix) {
    var id = 0, i;
    for (i = 0; i < list.length; i++) { id = Math.max(id, list[i].id); }
    item.id = id + 1;
    if (!item.name) { item.name = prefix + " " + item.id; }
    var c = clean(item, 0);
    list.unshift(c);
    if (list.length > max) { list.length = max; }
    return c;
  }
  function drumById(list, id) { for (var i = 0; i < list.length; i++) { if (list[i].id === id) { return list[i]; } } return null; }
  // 録音トラック（§178）と同じ [拍, MIDI, 強さ]
  function drumToSeqRec(take) { return drumNotesClean(take && take.notes); }
  function drumPrefs() {
    var p = lsGet(DRUM_PREFS_KEY) || {};
    return {
      mode: p.mode === "step" || p.mode === "rhythm" ? p.mode : "free",
      bpm: Math.max(40, Math.min(240, Math.round(Number(p.bpm) || 100))), metro: p.metro !== false,
      level: p.level === "normal" || p.level === "hard" ? p.level : "easy",
      speed: DRUM_SPEEDS.indexOf(Number(p.speed)) >= 0 ? Number(p.speed) : 100,
      steps: p.steps ? drumStepsClean(p.steps) : drumStepsFrom("8beat"),
      backing: typeof p.backing === "string" && /^(cur|s:\d+)$/.test(p.backing) ? p.backing : "", backDrum: !!p.backDrum,
      kit: !!p.kit, land: !!p.land, // §228: ドラムセットの形・よこ向き（じゆう）
      real: p.real !== false, // §229: 音色（true ＝ 生ドラムのサンプル / false ＝ 電子音（合成））
      kitId: drumKitOk(p.kitId) ? p.kitId : "drs", deep: !!p.deep, // §230: 生ドラムのセット・キックを太く
      pat: !!p.pat, // §233: 演奏パターンのパッドを出す
      // §234: オートフィル（小節ごと・0＝なし）・パターンの音量・鳴らさないパート
      autoFill: DRUM_AUTOFILL.indexOf(Number(p.autoFill)) >= 0 ? Number(p.autoFill) : 0,
      patVol: p.patVol === "s" || p.patVol === "m" ? p.patVol : "l",
      swing: drumSwing(p.swing)[0], // §235
      patPage: p.patPage === 1 ? 1 : 0, // §236: パターンのパッドのページ
      human: !!p.human, songOpen: !!p.songOpen, // §237: ゆらぎ・ソングの画面
      patSet: !!p.patSet, // §239: パターンの設定を開いている
      mute: (p.mute && p.mute.length ? p.mute : []).filter(function (id, i, a) { return drumPartOk(id) && a.indexOf(id) === i; })
    };
  }
  function drumSavePrefs(p) { return lsSet(DRUM_PREFS_KEY, p); }
  // §236 v1.44: 生ドラムのセット [id, ボタンの名前]（ファイルは UGMelody.drumKits）
  var DRUM_KITS = [["drs", "&#x1F941; ロック"], ["virtuosity", "&#x1F3B7; ジャズ"], ["rusty", "&#x1F6E2;&#xFE0F; ビンテージ"], ["brush", "&#x1F9F9; ブラシ"], ["swirly", "&#x1F3E0; ルーム"]];
  function drumKitOk(id) { for (var i = 0; i < DRUM_KITS.length; i++) { if (DRUM_KITS[i][0] === id) { return true; } } return false; }

  // ---------- §227 v1.35: ゴリラウクレレのシーケンサーとつなぐ ----------
  function drumSeqApi() { var U = window.UGUkulele; return U && U.seqLoad && U.seqSchedule ? U : null; }
  // 伴奏にえらべる曲 [[id, 名前]]（"cur" ＝ 編集中の曲、"s:番号" ＝ 保存した曲）
  function drumBackList() {
    var U = drumSeqApi(), out = [], st, i;
    if (!U) { return out; }
    st = U.seqLoad();
    out.push(["cur", "編集中の曲"]);
    for (i = 0; i < st.songs.length; i++) { out.push(["s:" + st.songs[i].id, st.songs[i].name]); }
    return out;
  }
  // 伴奏の曲（ウクレレの「合わせて弾く」と同じく、構成どおり・練習テンポ・くりかえしなし）→ { name, seq, s: 予定, lowG }
  function drumBacking(id) {
    var U = drumSeqApi(), st, sq = null, name = "", lowG = false, i;
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
  // 伴奏のイベントを鳴らすか（クリックは曲のメトロノームかカウントインのとき。noDrum: 曲のドラムを鳴らさない）
  function drumBackEventOn(ev, seq, lead, noDrum) {
    if (ev.kind === "click") { return !!seq.metronome || ev.t < lead; }
    var xt = seq && seq.tracks && ev.track ? seq.tracks[ev.track] : null;
    return !(noDrum && (ev.track === "drum" || (xt && xt.prog === 128))); // §238: ドラム打ち込みトラックも
  }
  // ステップを、シーケンサーの編集中の曲のドラム（マイリズム）へ送る → { ok, msg }
  function drumSendSteps(steps) {
    var U = drumSeqApi();
    if (!U) { return { ok: false, msg: "ゴリラウクレレが読みこめませんでした" }; }
    var cu = drumToSeqCustom(steps), any = false, i, st = U.seqLoad(), dropped = 0;
    for (i = 0; i < cu.length; i++) { if (cu[i][1].length) { any = true; } }
    if (!any) { return { ok: false, msg: "シーケンサーで鳴らせる楽器（キック・スネア・ハイハット・オープンHH・クラップ・リム）が入っていません" }; }
    var c0 = drumStepsClean(steps);
    for (i = 0; i < c0.length; i++) { if (DRUM_SEQ_ROWS.indexOf(c0[i][0]) < 0 && c0[i][1].length) { dropped++; } }
    st.cur.tracks.drum.on = true;
    st.cur.tracks.drum.groove = "custom";
    st.cur.tracks.drum.custom = cu;
    U.seqSave(st);
    return { ok: true, msg: "シーケンサーの編集中の曲のドラムに「マイリズム」として入れました" + (dropped ? "（タム・クラッシュはシーケンサーにないので外しました）" : "") };
  }
  // シーケンサーの編集中の曲のドラムを、ステップとして読みこむ（マイリズムでなければ、そのリズムのお手本）
  function drumStepsFromSeq() {
    var U = drumSeqApi();
    if (!U) { return null; }
    var d = U.seqLoad().cur.tracks.drum;
    if (d.groove === "custom") { return drumStepsClean(d.custom); }
    return drumGroove(d.groove) ? drumStepsFrom(d.groove) : null;
  }
  function drumBest() { var o = lsGet(DRUM_BEST_KEY); return o && typeof o === "object" ? o : {}; }

  // ---------- リズムゲームの譜面 ----------
  function drumLevelRows(level) { for (var i = 0; i < DRUM_LEVELS.length; i++) { if (DRUM_LEVELS[i][0] === level) { return DRUM_LEVELS[i][2]; } } return DRUM_LEVELS[0][2]; }
  function drumSong(id) { for (var i = 0; i < DRUM_SONGS.length; i++) { if (DRUM_SONGS[i][0] === id) { return DRUM_SONGS[i]; } } return DRUM_SONGS[0]; }
  // → { lanes: [MIDI…（パッドの順）], notes: [{ beat, m }…] }（DRUM_BARS 小節）
  function drumChart(songId, level) {
    var g = drumGroove(songId), rows = drumLevelRows(level), lanes = [], notes = [], i, b, k;
    if (!g) { return { lanes: [], notes: [] }; }
    for (i = 0; i < g.hits.length; i++) {
      var m = g.hits[i][0];
      if (rows && rows.indexOf(m) < 0) { continue; }
      if (!drumPad(m) || !g.hits[i][1].length) { continue; }
      if (lanes.indexOf(m) < 0) { lanes.push(m); }
      for (b = 0; b < DRUM_BARS; b++) { for (k = 0; k < g.hits[i][1].length; k++) { notes.push({ beat: b * 4 + g.hits[i][1][k] / 4, m: m }); } }
    }
    lanes.sort(function (x, y) { return DRUM_ROWS.indexOf(x) - DRUM_ROWS.indexOf(y); });
    notes.sort(function (x, y) { return x.beat - y.beat || lanes.indexOf(x.m) - lanes.indexOf(y.m); });
    return { lanes: lanes, notes: notes };
  }
  function drumJudge(dt) { dt = Math.abs(dt); for (var i = 0; i < DRUM_JUDGE.length; i++) { if (dt <= DRUM_JUDGE[i][0]) { return i; } } return -1; }
  function drumRank(acc) { return acc >= 0.95 ? "S" : (acc >= 0.85 ? "A" : (acc >= 0.7 ? "B" : (acc >= 0.5 ? "C" : "D"))); }

  // ---------- 画面の位置 ----------
  // じゆう: 4×2 のパッド
  // L（省略可）: 画面の形 { top, h }（§228 よこ向き）
  function drumPadRect(i, L) {
    var top = L ? L.top : DRUM_TOP, hh = L ? L.h : DRUM_H, cw = (W - 6) / 4, rh = (hh - top - 6) / 2;
    return { x: 3 + (i % 4) * cw + 2, y: top + 3 + Math.floor(i / 4) * rh + 2, w: cw - 4, h: rh - 4 };
  }
  function drumPadAt(x, y, L) {
    for (var i = 0; i < DRUM_PADS.length; i++) { var r = drumPadRect(i, L); if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) { return i; } }
    return -1;
  }
  // よこ向き: 画面いっぱいの枠 → ゲーム画面の高さ（下にボタンの段 84）
  function drumLandH(boxW, boxH) {
    if (!(boxW > 0 && boxH > 0)) { return 130; }
    return Math.max(90, Math.min(170, Math.round(W * (boxH - 8 - 84) / (boxW - 8))));
  }
  // ステップ: 左に名前、16マス × 8段
  var STEP_X = 36, STEP_Y = 22, STEP_RH = 24;
  function drumCellAt(x, y) {
    if (x < STEP_X || y < STEP_Y || y >= STEP_Y + DRUM_ROWS.length * STEP_RH) { return null; }
    var cw = (W - STEP_X - 2) / DRUM_STEPS, s = Math.floor((x - STEP_X) / cw), r = Math.floor((y - STEP_Y) / STEP_RH);
    return s >= 0 && s < DRUM_STEPS ? { m: DRUM_ROWS[r], s: s } : null;
  }

  // ---------- はじめの画面 ----------
  function drumSetup(root, ctl) {
    var p = drumPrefs();
    function draw() {
      var html = '<div class="melody-setup"><h3 style="margin:0 0 4px;">&#x1F941; ゴリラドラム</h3>' +
        '<p class="small" style="color:#adb5bd;margin:0 0 8px;">パッドを叩こう（同時押しもOK）。パソコンは Q W E R / A S D F（Space もキック）。</p><div class="quiz-opts">', i;
      for (i = 0; i < DRUM_MODES.length; i++) { html += '<button class="modal-btn quiz-opt' + (p.mode === DRUM_MODES[i][0] ? " active" : "") + '" data-mode="' + DRUM_MODES[i][0] + '">' + DRUM_MODES[i][1] + '</button>'; }
      // §230: 音色（生ドラムのセット・電子ドラム）とキックを太く
      html += '</div><p class="small" style="margin:4px 0 2px;">音色</p><div class="quiz-opts">';
      for (i = 0; i < DRUM_KITS.length; i++) { html += '<button class="modal-btn quiz-opt' + (p.real && p.kitId === DRUM_KITS[i][0] ? " active" : "") + '" data-kit="' + DRUM_KITS[i][0] + '">' + DRUM_KITS[i][1] + '</button>'; }
      html += '<button class="modal-btn quiz-opt' + (!p.real ? " active" : "") + '" data-real="0">&#x1F39B;&#xFE0F; 電子</button></div>' +
        (p.real ? '<div class="quiz-opts"><button class="modal-btn quiz-opt' + (p.deep ? " active" : "") + '" data-deep="1">キックを太く（低く）' + (p.deep ? " ON" : " OFF") + '</button></div>' : "");
      if (p.mode === "free") {
        var takes = drumTakesLoad(), bl = drumBackList();
        if (bl.length) {
          html += '<p class="small" style="margin:6px 0 2px;">&#x1F3B8; 伴奏（ゴリラウクレレのシーケンサーの曲）</p><div class="piano-opts">' +
            '<button class="modal-btn quiz-opt' + (!p.backing ? " active" : "") + '" data-backing="-">なし</button>';
          for (i = 0; i < bl.length; i++) { html += '<button class="modal-btn quiz-opt' + (p.backing === bl[i][0] ? " active" : "") + '" data-backing="' + bl[i][0] + '">' + escHtml(bl[i][1]) + '</button>'; }
          html += '</div>';
          if (p.backing) { html += '<div class="quiz-opts"><button class="modal-btn quiz-opt' + (p.backDrum ? " active" : "") + '" data-backdrum="1">伴奏のドラムも鳴らす ' + (p.backDrum ? "ON" : "OFF") + '</button></div>'; }
        }
        html += '<button class="modal-btn" data-go="1" style="width:100%;margin-top:8px;">&#x1F941; はじめる</button>' +
          '<p class="small" style="margin:10px 0 2px;">&#x1F399;&#xFE0F; 録音したテイク（' + takes.length + ' / ' + DRUM_TAKES_MAX + '）</p>';
        if (!takes.length) { html += '<p class="small" style="color:#adb5bd;margin:0;">まだありません。じゆうの画面の「🔴 録音」で録れます。</p>'; }
        for (i = 0; i < takes.length; i++) {
          html += '<div class="piano-take"><span>' + escHtml(takes[i].name) + '<br><span class="small" style="color:#adb5bd;">' + takes[i].notes.length + '打・BPM ' + takes[i].bpm + (takes[i].song ? '・&#x1F3B8; ' + escHtml(takes[i].song) : "") + '</span></span>' +
            '<button class="modal-btn" data-open="' + takes[i].id + '">&#x25B6;&#xFE0F; ひらく</button><button class="modal-btn" data-del="t' + takes[i].id + '">&#x1F5D1;&#xFE0F;</button></div>';
        }
      } else if (p.mode === "step") {
        var pats = drumPatsLoad();
        html += '<button class="modal-btn" data-go="1" style="width:100%;margin-top:8px;">&#x1F39B;&#xFE0F; はじめる（いま作っているリズム）</button>' +
          '<p class="small" style="margin:10px 0 2px;">&#x1F4BE; 保存したリズム（' + pats.length + ' / ' + DRUM_PATS_MAX + '）</p>';
        if (!pats.length) { html += '<p class="small" style="color:#adb5bd;margin:0;">まだありません。ステップの画面の「💾 保存」で保存できます。</p>'; }
        for (i = 0; i < pats.length; i++) {
          html += '<div class="piano-take"><span>' + escHtml(pats[i].name) + '<br><span class="small" style="color:#adb5bd;">' + (pats[i].kind === "fill" ? "&#x1F338; フィル・" : "") + 'BPM ' + pats[i].bpm + '</span></span>' +
            '<button class="modal-btn" data-pat="' + pats[i].id + '">&#x25B6;&#xFE0F; ひらく</button><button class="modal-btn" data-del="p' + pats[i].id + '">&#x1F5D1;&#xFE0F;</button></div>';
        }
      } else {
        var best = drumBest();
        html += '<p class="small" style="margin:4px 0 2px;">むずかしさ</p><div class="quiz-opts">';
        for (i = 0; i < DRUM_LEVELS.length; i++) { html += '<button class="modal-btn quiz-opt' + (p.level === DRUM_LEVELS[i][0] ? " active" : "") + '" data-level="' + DRUM_LEVELS[i][0] + '">' + DRUM_LEVELS[i][1] + '</button>'; }
        html += '</div><p class="small" style="margin:4px 0 2px;">速さ</p><div class="quiz-opts">';
        for (i = 0; i < DRUM_SPEEDS.length; i++) { html += '<button class="modal-btn quiz-opt' + (p.speed === DRUM_SPEEDS[i] ? " active" : "") + '" data-speed="' + DRUM_SPEEDS[i] + '">' + DRUM_SPEEDS[i] + '%</button>'; }
        html += '</div><p class="small" style="margin:8px 0 2px;">曲をえらぶ</p>';
        for (i = 0; i < DRUM_SONGS.length; i++) {
          var g = drumGroove(DRUM_SONGS[i][0]);
          if (!g) { continue; }
          var b = best[DRUM_SONGS[i][0] + "@" + p.level + "@" + p.speed];
          html += '<button class="modal-btn quiz-cat-btn" data-song="' + DRUM_SONGS[i][0] + '" style="width:100%;">' + escHtml(g.name) + '（BPM ' + DRUM_SONGS[i][1] + '）' +
            ' <span class="small" style="color:#6b4f00;">' + new Array(DRUM_SONGS[i][2] + 1).join("&#x2B50;") + (b ? "・ベスト " + b.s + "（" + b.r + "）" : "") + '</span></button>';
        }
      }
      html += '<button class="modal-btn" data-back="1" style="width:100%;margin-top:14px;">&#x1F579;&#xFE0F; メニューへ</button></div>';
      root.innerHTML = html;
      var btns = root.querySelectorAll("button"), j;
      for (j = 0; j < btns.length; j++) {
        btns[j].onclick = function (ev) {
          var el = ev.currentTarget, v;
          if ((v = el.getAttribute("data-mode"))) { p.mode = v; drumSavePrefs(p); draw(); return; }
          if ((v = el.getAttribute("data-backing"))) { p.backing = v === "-" ? "" : v; drumSavePrefs(p); draw(); return; }
          if (el.getAttribute("data-backdrum")) { p.backDrum = !p.backDrum; drumSavePrefs(p); draw(); return; }
          if ((v = el.getAttribute("data-real"))) { p.real = v === "1"; drumSavePrefs(p); draw(); return; }
          if ((v = el.getAttribute("data-kit"))) { p.real = true; p.kitId = drumKitOk(v) ? v : "drs"; drumSavePrefs(p); draw(); return; }
          if (el.getAttribute("data-deep")) { p.deep = !p.deep; drumSavePrefs(p); draw(); return; }
          if ((v = el.getAttribute("data-level"))) { p.level = v; drumSavePrefs(p); draw(); return; }
          if ((v = el.getAttribute("data-speed"))) { p.speed = Number(v); drumSavePrefs(p); draw(); return; }
          if ((v = el.getAttribute("data-del"))) {
            var isT = v.charAt(0) === "t", list = isT ? drumTakesLoad() : drumPatsLoad(), it = drumById(list, Number(v.substring(1)));
            if (!it || (window.confirm && !window.confirm("「" + it.name + "」を消しますか？"))) { return; }
            list.splice(list.indexOf(it), 1);
            if (isT) { drumTakesSave(list); } else { drumPatsSave(list); }
            draw();
            return;
          }
          if (el.getAttribute("data-back")) { ctl.back(); return; }
          if (el.getAttribute("data-go")) { ctl.done({ mode: p.mode, backing: p.mode === "free" ? p.backing : "" }); return; }
          if ((v = el.getAttribute("data-open"))) { ctl.done({ mode: "free", take: Number(v), backing: p.backing }); return; }
          if ((v = el.getAttribute("data-pat"))) { ctl.done({ mode: "step", pat: Number(v) }); return; }
          if ((v = el.getAttribute("data-song"))) { ctl.done({ mode: "rhythm", song: v, level: p.level, speed: p.speed }); }
        };
      }
    }
    draw();
  }

  // ---------- §233 v1.41: 演奏パターン（押すとリズムがループ・フィルは1小節）----------
  // フィル（1小節・16マス。セットの楽器も使う）[id, 名前, [[MIDI, [マス]]]]
  var DRUM_FILLS = [
    ["snare", "スネアフィル", [[36, [0]], [42, [0, 2, 4, 6]], [38, [8, 10, 12, 13, 14, 15]]]],
    ["toms", "タム回し", [[36, [0]], [42, [0, 2, 4, 6]], [38, [8, 9]], [48, [10, 11]], [45, [12, 13]], [43, [14, 15]]]],
    ["roll", "ロール", [[36, [0]], [38, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]]]],
    ["kime", "キメ", [[36, [0, 3, 6, 10, 12]], [38, [3, 6, 10, 12]], [49, [0, 12]]]],
    ["kick", "キック連打", [[42, [0, 2, 4, 6]], [38, [4]], [36, [0, 8, 9, 10, 11, 12, 13, 14, 15]]]],
    ["crash", "エンディング", [[36, [0]], [38, [0]], [49, [0]]]],
    // §236 v1.44
    ["dontan", "ドンタン", [[36, [0, 8, 10, 12, 14]], [42, [0, 2, 4, 6]], [38, [4, 9, 11, 13, 15]]]],
    ["floor", "フロアタム連打", [[36, [0]], [42, [0, 2, 4, 6]], [38, [4]], [43, [8, 9, 10, 11, 12, 13, 14, 15]]]],
    ["tomup", "タム上り", [[36, [0]], [42, [0, 2, 4, 6]], [43, [8, 9]], [45, [10, 11]], [48, [12, 13]], [38, [14, 15]]]],
    ["break", "ブレイク", [[36, [0, 6]], [42, [0, 2, 4, 6]], [38, [4]]]],
    ["kime4", "4分キメ", [[36, [0, 4, 8, 12]], [49, [0, 4, 8, 12]], [38, [12]]]]
  ];
  // §236 v1.44: ドラムだけのリズム（ライド・タムも使う）[id, 名前, [[MIDI, [マス]]]]
  var DRUM_E8 = [0, 2, 4, 6, 8, 10, 12, 14], DRUM_S16 = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], DRUM_Q4 = [0, 4, 8, 12];
  var DRUM_MORE_LOOPS = [
    ["metal", "ツーバス", [[36, DRUM_S16], [38, [4, 12]], [51, DRUM_E8], [49, [0]]]],
    ["blast", "ブラストビート", [[36, DRUM_E8], [38, [1, 3, 5, 7, 9, 11, 13, 15]], [49, DRUM_Q4]]],
    ["dnb", "ドラムンベース", [[36, [0, 10]], [38, [4, 12]], [42, DRUM_E8], [46, [14]]]],
    ["trap", "トラップ", [[36, [0, 3, 10]], [39, [8]], [42, [0, 2, 4, 6, 8, 10, 11, 12, 13, 14, 15]]]],
    ["motown", "モータウン", [[36, [0, 6, 8]], [38, DRUM_Q4], [42, DRUM_E8]]],
    ["secondline", "セカンドライン", [[36, [0, 6, 10]], [38, [3, 6, 8, 11, 14]], [42, DRUM_E8]]],
    ["rnr", "ロックンロール", [[36, [0, 8]], [38, [4, 12]], [51, [0, 3, 4, 7, 8, 11, 12, 15]]]],
    ["house", "ハウス", [[36, DRUM_Q4], [39, [4, 12]], [46, [2, 6, 10, 14]], [42, [1, 3, 5, 7, 9, 11, 13, 15]]]],
    ["jungle", "ジャングル", [[36, [0, 8]], [43, [0, 3, 6, 8, 11, 14]], [48, [4, 12]]]],
    ["ghost", "ゴーストノート", [[36, [0, 10]], [38, [1, 4, 7, 9, 12, 15]], [42, DRUM_E8]]],
    ["rideroc", "ライドのロック", [[36, [0, 6, 8, 10]], [38, [4, 12]], [51, DRUM_E8], [49, [0]]]]
  ];
  var DRUM_PATPADS_KEY = "ultimateGorillaDrumPatPadsV1", DRUM_PATPAD_N = 32, DRUM_PATPAD_PAGE = 16; // §236: 16個 × 2ページ
  var DRUM_PATPAD_DEFAULT = ["g:8beat", "g:beat16", "g:rock", "g:four", "g:halftime", "g:shuffle", "g:funk", "g:disco", "g:bossa", "g:ska",
    "f:snare", "f:toms", "f:roll", "f:kime", "f:kick", "f:crash",
    "d:metal", "d:blast", "d:dnb", "d:trap", "d:motown", "d:secondline", "d:rnr", "d:house", "d:jungle", "d:ghost", "d:rideroc",
    "f:dontan", "f:floor", "f:tomup", "f:break", "f:kime4"];
  // パターンの一覧 [{ id, name, kind: "loop" | "fill", group }]（g: お手本 / f: フィル / p: じぶんのリズム）
  function drumPatternList() {
    var out = [], g = drumGrooves(), my = drumPatsLoad(), i;
    for (i = 0; i < g.length; i++) { out.push({ id: "g:" + g[i].id, name: g[i].name, kind: "loop", group: "お手本のリズム" }); }
    for (i = 0; i < DRUM_MORE_LOOPS.length; i++) { out.push({ id: "d:" + DRUM_MORE_LOOPS[i][0], name: DRUM_MORE_LOOPS[i][1], kind: "loop", group: "ドラムのリズム" }); }
    for (i = 0; i < DRUM_FILLS.length; i++) { out.push({ id: "f:" + DRUM_FILLS[i][0], name: DRUM_FILLS[i][1], kind: "fill", group: "フィル（1小節・ピンク）" }); }
    for (i = 0; i < my.length; i++) { if (my[i].kind !== "fill") { out.push({ id: "p:" + my[i].id, name: my[i].name, kind: "loop", group: "じぶんのリズム" }); } }
    for (i = 0; i < my.length; i++) { if (my[i].kind === "fill") { out.push({ id: "p:" + my[i].id, name: my[i].name, kind: "fill", group: "じぶんのフィル（1小節・ピンク）" }); } }
    return out;
  }
  // §236: パターンで鳴らせない楽器は近いものへ（ペダルのハイハット → ハイハット など）
  var DRUM_PAT_MAP = { 35: 36, 40: 38, 44: 42, 41: 43, 50: 48, 52: 49, 55: 49, 57: 49, 59: 51, 54: 42, 69: 42, 70: 42 };
  function drumGrooveSteps(id) {
    var g = drumGroove(id), out = [], at = {}, i, j;
    if (!g) { return null; }
    for (i = 0; i < g.hits.length; i++) {
      var m = drumPad(g.hits[i][0]) ? g.hits[i][0] : DRUM_PAT_MAP[g.hits[i][0]];
      if (!m) { continue; }
      if (at[m] === undefined) { at[m] = out.length; out.push([m, []]); }
      for (j = 0; j < g.hits[i][1].length; j++) { var st = g.hits[i][1][j]; if (st >= 0 && st < DRUM_STEPS && out[at[m]][1].indexOf(st) < 0) { out[at[m]][1].push(st); } }
    }
    return out;
  }
  function drumPattern(id) { var l = drumPatternList(), i; for (i = 0; i < l.length; i++) { if (l[i].id === id) { return l[i]; } } return null; }
  // パターンの音 [[MIDI, [マス]]]（なければ null）
  function drumPatternSteps(id) {
    var t = String(id || "").split(":"), i;
    if (t[0] === "g") { return drumGrooveSteps(t[1]); }
    if (t[0] === "d") { for (i = 0; i < DRUM_MORE_LOOPS.length; i++) { if (DRUM_MORE_LOOPS[i][0] === t[1]) { return DRUM_MORE_LOOPS[i][2]; } } return null; }
    if (t[0] === "f") { for (i = 0; i < DRUM_FILLS.length; i++) { if (DRUM_FILLS[i][0] === t[1]) { return DRUM_FILLS[i][2]; } } return null; }
    if (t[0] === "p") { var p = drumById(drumPatsLoad(), Number(t[1])); return p ? p.steps : null; }
    return null;
  }
  function drumPatPadsLoad() {
    var a = lsGet(DRUM_PATPADS_KEY), out = [], i;
    for (i = 0; i < DRUM_PATPAD_N; i++) {
      var id = a && a.length && i < a.length ? a[i] : DRUM_PATPAD_DEFAULT[i]; // 前の16個だけの保存なら、2ページ目ははじめのまま
      out.push(typeof id === "string" && drumPattern(id) ? id : null);
    }
    return out;
  }
  function drumPatPadsSave(p) { return lsSet(DRUM_PATPADS_KEY, p); }
  // §237: ソング（なくなったパターンは外す・小節は 1〜16・ぜんぶで128小節まで）
  function drumSongClean(a) {
    var out = [], total = 0, i;
    for (i = 0; a && a.length && i < a.length && out.length < DRUM_SONG_MAX; i++) {
      if (!a[i] || typeof a[i][0] !== "string" || !drumPattern(a[i][0])) { continue; }
      var b = Math.max(1, Math.min(16, Math.round(Number(a[i][1]) || 1)));
      if (total + b > DRUM_SONG_BARS) { break; }
      total += b;
      out.push([a[i][0], b]);
    }
    return out;
  }
  function drumSongLoad() { var a = lsGet(DRUM_SONG_KEY); return drumSongClean(a && a.length !== undefined ? a : DRUM_SONG_DEFAULT); }
  function drumSongSave(a) { return lsSet(DRUM_SONG_KEY, drumSongClean(a)); }
  function drumSongBars(a) { var n = 0; for (var i = 0; i < a.length; i++) { n += a[i][1]; } return n; }
  // ソングを音の並び [[拍, MIDI, 強さ]] にする（ハネ・強弱・フィルのあとのクラッシュも）
  function drumSongNotes(song, swing) {
    var out = [], bar = 0, prevFill = false, i, b, j, k;
    for (i = 0; i < song.length; i++) {
      var st = drumPatternSteps(song[i][0]), pt = drumPattern(song[i][0]), fill = pt.kind === "fill";
      for (b = 0; b < song[i][1]; b++) {
        var crash = b === 0 && prevFill && !fill;
        for (j = 0; j < st.length; j++) {
          for (k = 0; k < st[j][1].length; k++) {
            var s = st[j][1][k];
            if (st[j][0] === 49 && s === 0) { crash = false; }
            out.push([Math.round((bar * 16 + s + drumSwingOff(swing, s)) / 4 * 1000) / 1000, st[j][0], Math.round(drumPatVel(st[j][0], s, fill) * 100) / 100]);
          }
        }
        if (crash) { out.push([bar * 4, 49, Math.round(drumPatVel(49, 0, false) * 100) / 100]); }
        bar++;
      }
      prevFill = fill;
    }
    return out.sort(function (x, y) { return x[0] - y[0] || x[1] - y[1]; });
  }
  // §237: テイクのずれ直し（16分＝0.25拍にそろえる。同じところの同じ楽器は1つに）
  function drumQuantize(notes, grid) {
    var g = grid || 0.25, out = [], seen = {}, i;
    for (i = 0; i < notes.length; i++) {
      var b = Math.round(Math.round(notes[i][0] / g) * g * 1000) / 1000, key = b + ":" + notes[i][1];
      if (seen[key]) { continue; }
      seen[key] = 1;
      out.push([b, notes[i][1], notes[i][2]]);
    }
    return out.sort(function (x, y) { return x[0] - y[0]; });
  }
  // ---------- §238 v1.46: シーケンサーの曲とソングをつなぐ ----------
  // 曲の区切り（Aメロ・サビ…）ごとの拍 { meter, beats, bpm, parts: [{ name, beats }] }
  function drumSeqParts(seq) {
    var U = drumSeqApi();
    if (!U || !seq || !U.expand) { return null; }
    var S = U.seqSchedule(U.expand(seq)), out = [], cur = { name: "", beats: 0 }, i;
    for (i = 0; i < S.rows.length; i++) {
      var r = S.rows[i];
      if (r.type === "sec") { if (cur.beats > 0) { out.push(cur); } cur = { name: String(r.name || ""), beats: 0 }; continue; }
      if (r.type === "key" || r.type === "tempo") { continue; }
      cur.beats += Math.max(0, r.end - r.start);
    }
    if (cur.beats > 0) { out.push(cur); }
    return { meter: S.meter || seq.meter || 4, beats: S.beats, bpm: seq.bpm, parts: out };
  }
  // 区切りの名前 → 種類（サビ・B・イントロ・アウトロ・間奏・ほか＝A）
  function drumSecKind(name) {
    var n = String(name || "");
    if (/サビ|chorus|コーラス|hook/i.test(n)) { return "chorus"; }
    if (/Bメロ|Cメロ|^B$|^C$|pre|ブリッジ|bridge/i.test(n)) { return "b"; }
    if (/イントロ|intro/i.test(n)) { return "intro"; }
    if (/アウトロ|outro|エンディング|ending/i.test(n)) { return "outro"; }
    if (/間奏|solo|ソロ|interlude/i.test(n)) { return "solo"; }
    return "a";
  }
  // 曲のリズム（base）から、区切りの種類のパターン（サビは強め・B は少し細かく）
  var DRUM_SEC_BIG = { "8beat": "g:rock", "beat16": "g:rock", "rock": "g:beat16", "four": "g:disco", "halftime": "g:8beat", "ballad": "g:8beat", "shuffle": "d:rnr" };
  var DRUM_SEC_B = { "8beat": "g:beat16", "ballad": "g:halftime", "rock": "g:8beat" };
  function drumSecPattern(base, kind) {
    var id = "g:" + base;
    if (kind === "chorus" && DRUM_SEC_BIG[base]) { id = DRUM_SEC_BIG[base]; }
    if (kind === "b" && DRUM_SEC_B[base]) { id = DRUM_SEC_B[base]; }
    return drumPattern(id) ? id : (drumPattern("g:" + base) ? "g:" + base : "g:8beat");
  }
  // シーケンサーの曲の構成から、長さがぴったりのソングを作る → { ok, song, bpm, msg }
  function drumSongFromSeq(seq) {
    var info = drumSeqParts(seq), i, k;
    if (!info) { return { ok: false, msg: "ゴリラウクレレが読みこめませんでした" }; }
    if (info.meter === 3) { return { ok: false, msg: "3拍子の曲には、まだ合わせられません（ドラムのパターンは4拍子）" }; }
    if (!info.parts.length) { return { ok: false, msg: "シーケンサーの曲にコードがありません" }; }
    var d = seq.tracks && seq.tracks.drum, base = d && d.on && d.groove && drumPattern("g:" + d.groove) ? d.groove : "8beat";
    var raw = [], odd = false, rot = 0, rots = ["f:snare", "f:roll"], names = [];
    for (i = 0; i < info.parts.length; i++) {
      var p = info.parts[i], bars = Math.max(1, Math.round(p.beats / 4)), kind = drumSecKind(p.name), last = i === info.parts.length - 1;
      if (Math.abs(p.beats - bars * 4) > 1e-6) { odd = true; }
      var pat = drumSecPattern(base, kind), next = info.parts[i + 1] ? drumSecKind(info.parts[i + 1].name) : "";
      var fill = last ? "f:crash" : (next === "chorus" ? "f:toms" : rots[rot++ % rots.length]);
      var body = bars >= 2 || last ? bars - 1 : bars;
      for (k = body; k > 0; k -= 16) { raw.push([pat, Math.min(16, k)]); }
      if (bars >= 2 || last) { raw.push([fill, 1]); }
      names.push((p.name || "はじめ") + " " + bars + "小節");
    }
    var song = drumSongClean(raw), want = drumSongBars(raw);
    return { ok: true, song: song, bpm: info.bpm,
      msg: "シーケンサーの曲（" + names.join("・") + "）に合わせてソングを作りました" + (drumSongBars(song) < want ? "（128小節までにしました）" : "") + (odd ? "（4拍でわりきれない区切りがあるので、少しずれるかも）" : "") };
  }
  // ソングの長さを bars 小節に合わせる（最後のフィル・エンディングは残して、その前のループを足す・けずる）
  function drumSongFit(song, bars) {
    var list = [], out = [], i, b;
    for (i = 0; i < song.length; i++) { for (b = 0; b < song[i][1]; b++) { list.push(song[i][0]); } }
    if (!list.length || bars < 1) { return song.slice(); }
    var tail = list.length;
    while (tail > 0 && drumPattern(list[tail - 1]).kind === "fill") { tail--; }
    var loop = tail > 0 ? list[tail - 1] : "g:8beat";
    while (list.length < bars) { list.splice(tail, 0, loop); tail++; }
    while (list.length > bars && tail > 0) { list.splice(tail - 1, 1); tail--; }
    while (list.length > bars) { list.pop(); }
    for (i = 0; i < list.length; i++) { var o = out[out.length - 1]; if (o && o[0] === list[i] && o[1] < 16) { o[1]++; } else { out.push([list[i], 1]); } }
    return out;
  }
  // ソングをシーケンサーの編集中の曲へ（🥁 ドラム打ち込みトラック。前に送ったものがあれば置きかえ・曲の長さに合わせる）
  function drumSongSend(song, swing, name) {
    var U = drumSeqApi();
    if (!U || !U.xAdd) { return { ok: false, msg: "ゴリラウクレレが読みこめませんでした" }; }
    if (!drumSongBars(song)) { return { ok: false, msg: "ソングに音がありません" }; }
    var st = U.seqLoad(), info = drumSeqParts(st.cur), fit = "", sg = song, i;
    if (info && info.meter !== 3 && info.beats >= 4) {
      var target = Math.round(info.beats / 4), have = drumSongBars(song);
      if (target !== have) { sg = drumSongFit(song, target); fit = "曲の長さ（" + target + "小節）に合わせて" + (target > have ? "のばし" : "けずり") + "ました（ソングは " + have + "小節）。"; }
    } else if (info && info.meter === 3) { fit = "（シーケンサーの曲は3拍子なので、合わないかも）"; }
    var notes = drumSongNotes(sg, swing);
    if (!notes.length) { return { ok: false, msg: "ソングに音がありません" }; }
    var id = null, tr = st.cur.tracks;
    for (i = 0; tr.xs && i < tr.xs.length; i++) { if (tr[tr.xs[i]].preset === "dnotes") { id = tr.xs[i]; break; } }
    var again = !!id;
    if (!id) { id = U.xAdd(tr, "dnotes"); }
    if (!id) { return { ok: false, msg: "追加トラックがいっぱいです（8本まで）。シーケンサーで1本消してから送ってね" }; }
    var t = tr[id], cut = notes.length > 1000;
    if (!again) { t.name = String(name || "ドラム").slice(0, 12); }
    t.notes = notes.slice(0, 1000).map(function (n) { return [n[0], 0.25, n[1], Math.max(0.1, Math.min(1, n[2]))]; });
    U.seqSave(st);
    return { ok: true, id: id, replaced: again, bars: drumSongBars(sg),
      msg: "ソングを、シーケンサーの編集中の曲の 🥁 ドラム打ち込みトラック" + (again ? "に上書きしました（前に送ったものと置きかえ）" : "として送りました") + "。" + fit + (cut ? "（1000打より後ろは入りません）" : "") +
        "シーケンサーのドラムといっしょに鳴らさないなら、ドラムのトラックをオフにしてね" };
  }
  // シーケンサーの 🥁 ドラム打ち込みトラックを読みもどす → { ok, notes: [[拍, MIDI, 強さ]], bpm, msg }
  function drumTakeFromSeq() {
    var U = drumSeqApi();
    if (!U) { return { ok: false, msg: "ゴリラウクレレが読みこめませんでした" }; }
    var st = U.seqLoad(), tr = st.cur.tracks, i;
    for (i = 0; tr.xs && i < tr.xs.length; i++) {
      var t = tr[tr.xs[i]];
      if (t.prog !== 128 || !t.notes || !t.notes.length) { continue; }
      var notes = drumNotesClean(t.notes.map(function (n) { return [n[0], n[2], n.length > 3 ? n[3] : 0.8]; }));
      return { ok: true, notes: notes, bpm: st.cur.bpm, msg: "シーケンサーの「" + t.name + "」（" + notes.length + "打）を読みこみました" };
    }
    return { ok: false, msg: "シーケンサーの編集中の曲に 🥁 ドラム打ち込みトラックがありません（ソングの「🎸 シーケンサーへ送る」で作れます）" };
  }
  // 楽器ごとの強さ（シンバル類は小さめ）
  function drumPatLevel(m) { return m === 42 || m === 46 || m === 44 ? 0.55 : (m === 51 || m === 49 ? 0.6 : 0.85); }
  // §234 v1.42: パート（鳴らさない切りかえ用）・強弱・オートフィル・音量
  var DRUM_PARTS = [["kick", "キック", [35, 36]], ["snare", "スネア", [37, 38, 39, 40]], ["hh", "ハイハット", [42, 44, 46]],
    ["cym", "シンバル", [49, 51, 52, 55, 57, 59]], ["tom", "タム", [41, 43, 45, 47, 48, 50]]];
  var DRUM_AUTOFILL = [0, 4, 8], DRUM_AUTOFILL_IDS = ["snare", "toms", "roll"];
  // §235 v1.43: ハネ（スウィング）[id, 名前, 何分（8/16）, おくらせる量（マスの何倍）]。しっかり ＝ 3連符のノリ
  var DRUM_SWINGS = [["0", "なし", 0, 0], ["16a", "16分 かるく", 16, 0.17], ["16b", "16分 しっかり", 16, 0.33], ["8a", "8分 かるく", 8, 0.17], ["8b", "8分 しっかり", 8, 0.33]];
  function drumSwing(id) { for (var i = 0; i < DRUM_SWINGS.length; i++) { if (DRUM_SWINGS[i][0] === id) { return DRUM_SWINGS[i]; } } return DRUM_SWINGS[0]; }
  // マス s をどれだけおくらせるか（マス単位）。16分 ＝ 16分の裏、8分 ＝ 8分の裏（間の16分もいっしょに）
  function drumSwingOff(id, s) {
    var w = drumSwing(id);
    if (!w[2]) { return 0; }
    if (w[2] === 16) { return s % 2 ? w[3] : 0; }
    return s % 4 === 2 ? w[3] * 2 : (s % 2 ? w[3] : 0);
  }
  var DRUM_PRAC_OK = 0.035, DRUM_PRAC_WIN = 0.15; // §235: 練習の判定（ぴったり ±35ms・判定する範囲 ±150ms）
  // §237 v1.45: ソング（パターンをつなげた曲）[[パターンの id, 小節]]
  var DRUM_SONG_KEY = "ultimateGorillaDrumSongV1", DRUM_SONG_MAX = 32, DRUM_SONG_BARS = 128;
  var DRUM_SONG_DEFAULT = [["g:8beat", 3], ["f:snare", 1], ["g:beat16", 3], ["f:toms", 1], ["g:rock", 3], ["f:roll", 1], ["g:8beat", 2], ["f:crash", 1]];
  var DRUM_PATVOLS = [["s", "小", 0.55], ["m", "中", 0.75], ["l", "大", 1]];
  function drumPartOk(id) { for (var i = 0; i < DRUM_PARTS.length; i++) { if (DRUM_PARTS[i][0] === id) { return true; } } return false; }
  function drumPartOf(m) { for (var i = 0; i < DRUM_PARTS.length; i++) { if (DRUM_PARTS[i][2].indexOf(m) >= 0) { return DRUM_PARTS[i][0]; } } return ""; }
  function drumPatVol(id) { for (var i = 0; i < DRUM_PATVOLS.length; i++) { if (DRUM_PATVOLS[i][0] === id) { return DRUM_PATVOLS[i][2]; } } return 1; }
  // 強弱: 表拍（4分）を強く、裏（16分の裏）を弱く。スネアの16分の裏はゴースト。フィルのスネア・タムはだんだん強く
  function drumPatVel(m, s, fill) {
    var lv = drumPatLevel(m), p = drumPartOf(m);
    if (fill && (p === "snare" || p === "tom")) { return lv * (0.7 + 0.3 * s / 15); }
    if (p === "hh" || m === 51) { return lv * (s % 4 === 0 ? 1 : (s % 2 === 0 ? 0.8 : 0.62)); }
    if (m === 38) { return lv * (s % 2 ? 0.45 : (s % 4 === 0 ? 1 : 0.8)); }
    if (p === "kick") { return lv * (s % 4 === 0 ? 1 : 0.85); }
    return lv;
  }

  var DRUM_DEBUG = (function () { try { return /(^|[?&])debug=1(&|$)/.test(window.location.search || ""); } catch (e) { return false; } })();
  var DRUM_KEYS = { q: "d0", w: "d1", e: "d2", r: "d3", a: "d4", s: "d5", d: "d6", f: "d7", " ": "d4", z: "rec", x: "play", c: "pedal" };
  // ドラムセットのときのキー（Q W E R / A S D F の順）
  var DRUM_KIT_KEYS = ["hh", "crash", "tom1", "tom2", "kick", "snare", "floor", "ride"];

  I.register({
    id: "drum",
    after: "piano",
    cat: "music",
    music: true,
    name: "ゴリラドラム",
    icon: "&#x1F941;",
    desc: "8つのパッドで叩いて録音・16マスでリズムを打ち込み・落ちてくる音符のリズムゲーム",
    help: "パッドをタップ（同時押しOK）/ Q W E R・A S D F で叩く（Space＝キック）/ Z 録音 / X 再生 / P一時停止",
    controls: [],
    keys: DRUM_KEYS,
    setup: drumSetup,
    setupLabel: "モード・曲を変える",
    panel: true,
    create: function (api, cfg) {
      cfg = cfg || {};
      var prefs = drumPrefs(), mode = cfg.mode === "step" || cfg.mode === "rhythm" ? cfg.mode : "free";
      var frame = 0, ended = false, msg = "", flash = {}, last = "";
      var panel = api.panel;
      // §228: 画面の形（よこ向きはじゆうだけ）・ドラムセット・ハイハットのペダル
      var kit = mode === "free" && prefs.kit, hhOpen = false, Ld = { top: DRUM_TOP, h: DRUM_H, land: false }, landOn = mode === "free" && prefs.land;
      function applyLand() {
        if (api.setLandscape) { api.setLandscape(landOn); }
        if (landOn) {
          var box = panel && panel.parentNode;
          Ld = { top: 14, h: box ? drumLandH(box.clientWidth, box.clientHeight) : 130, land: true };
        } else { Ld = { top: DRUM_TOP, h: DRUM_H, land: false }; }
        api.setCanvasHeight(Ld.h);
      }
      applyLand();
      if (panel && panel.classList) { panel.classList.add("quiz-panel"); }
      function now() { return frame / 60; }

      // --- 音 ---
      var UG = window.UGMelody, audioOk = false;
      // §229: 生ドラムのサンプルを読みこむ（読みこむまでは合成音）
      function audio() {
        if (audioOk || !UG || !UG.audioInit) { return; }
        try {
          if (UG.audioInit()) {
            audioOk = true;
            if (UG.setDrumSamples) { UG.setDrumSamples(prefs.real); }
            if (UG.setDrumKit) { UG.setDrumKit(prefs.kitId); }
            if (UG.setKickRate) { UG.setKickRate(prefs.deep ? 0.86 : 1); }
            if (prefs.real && UG.loadSamples) { UG.loadSamples([UG.DRUM]); }
          }
        } catch (e) {}
      }
      // §231: 生ドラムの音がまだ（または捨てられた・止まった）なら、叩くたびに読みこみをためす（止まっていなければ何もしない）
      // §232: ?debug=1 のとき、生ドラムの読みこみの中身を出す（iPhone だけ鳴らない、などを調べる）
      function drumDebugText() {
        var o = [], S = UG && UG.samples, i;
        if (!S) { return "UGMelody なし"; }
        o.push("ua: " + (navigator.userAgent || "").slice(0, 90));
        o.push("ctx: " + (UG.audio && UG.audio.ctx ? UG.audio.ctx.state + " " + UG.audio.ctx.sampleRate + "Hz" : "なし") + " / real=" + prefs.real + " kit=" + prefs.kitId + " file=" + UG.sampleFiles[UG.DRUM] + " off=" + !!S.drumOff);
        var kits = UG.drumKits || [];
        for (i = 0; i < kits.length; i++) {
          var f = kits[i][1], at = S.loadAt[f];
          o.push(f + ": " + (S.state[f] || "なし") + (at ? "（" + Math.round((Date.now() - at) / 1000) + "秒前）" : "") + " 音=" + (S.buffers[f] ? Object.keys(S.buffers[f]).length : 0) +
            " 失敗=" + (S.err[f] || 0) + (S.errMsg[f] ? " " + S.errMsg[f] : "") + " 未展開=" + !!(window.UGMelodySamples && window.UGMelodySamples.banks[f]));
        }
        return o.join(" ｜ ");
      }
      function drumSampleState() {
        if (!prefs.real || !UG || !UG.samples || !UG.sampleFiles) { return "off"; }
        return UG.samples.state[UG.sampleFiles[UG.DRUM]] || "none";
      }
      // §234: ahead（秒）＞0 なら、その時間だけ先に鳴らす（パターンを前もって予約してタイミングを正確に）
      function hitSound(m, lv, ahead) {
        audio();
        if (!audioOk) { return; }
        if (prefs.real && drumSampleState() !== "ready" && UG.loadSamples) {
          try { if (UG.setDrumKit) { UG.setDrumKit(prefs.kitId); } UG.loadSamples([UG.DRUM]); } catch (e0) {}
        }
        var ac = ahead > 0 && UG.audio ? UG.audio.ctx : null;
        try { UG.synth(m, UG.DRUM, ac ? ac.currentTime + ahead : 0, lv || 0.9); } catch (e) {}
      }
      function click(accent) { if (audioOk) { try { UG.synth(accent ? 76 : 77, UG.DRUM, 0, accent ? 0.7 : 0.5); } catch (e) {} } }

      // --- じゆう: 録音・再生 ---
      var bpm = prefs.bpm, meter = 4, metro = prefs.metro, takes = mode === "free" ? drumTakesLoad() : [];
      var take = cfg.take ? drumById(takes, cfg.take) : null, rec = null, play = null;
      if (take) { msg = "「" + escHtml(take.name) + "」をひらきました。▶ 再生で聴けます"; }
      function r3(v) { return Math.round(v * 1000) / 1000; }
      // §227: 伴奏（シーケンサーの曲）。bk ＝ 鳴らしているあいだ
      var back = mode === "free" && cfg.backing ? drumBacking(cfg.backing) : null, bk = null;
      if (back) { bpm = back.seq.bpm; meter = back.seq.meter; if (!take) { msg = "&#x1F3B8; 伴奏に合わせて叩こう。「🔴 合わせて録音」で録れます"; } }
      else if (mode === "free" && cfg.backing) { msg = "伴奏の曲が見つかりませんでした（ゴリラウクレレのシーケンサーで曲を作ってね）"; }
      function backT() { return bk ? (frame - bk.f0) / 60 : 0; }
      function backBeat() {
        var S = back.s, t = backT();
        if (t < S.lead) { return (t - S.lead) / S.spb; }
        return S.beatAt ? S.beatAt(t) : (t - S.lead) / S.spb;
      }
      function backStart() {
        backStop();
        audio();
        var U = drumSeqApi();
        bk = { f0: frame, idx: 0, outs: [null, null, null, null], mix: null, fx: false };
        if (audioOk && U && U.fxPush) { try { U.fxPush(back.seq); bk.fx = true; } catch (e) {} }
      }
      function backStop() {
        if (!bk) { return; }
        var U = drumSeqApi();
        if (bk.fx && U && U.fxPop) { try { U.fxPop(); } catch (e) {} }
        bk = null;
      }
      function backStep() {
        var S = back.s, t = backT(), U = drumSeqApi(), ac = audioOk && UG.audio ? UG.audio.ctx : null, ev;
        while (bk.idx < S.events.length && (ev = S.events[bk.idx]).t <= t + 0.1) {
          if (ac && U && U.seqPlayEvent && drumBackEventOn(ev, back.seq, S.lead, !prefs.backDrum)) {
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
      function backToggle() {
        if (!back || rec) { return; }
        play = null;
        if (bk) { backStop(); } else { backStart(); }
        render();
      }
      function recBeat() { return rec ? (rec.back ? backBeat() : (now() - rec.t0) * bpm / 60) : 0; }
      function recToggle() {
        if (mode !== "free") { return; }
        if (rec) { recStop(); return; }
        play = null;
        audio();
        if (back) { backStart(); rec = { back: true, notes: [], beat: -99 }; }
        else { rec = { t0: now() + meter * 60 / bpm, notes: [], beat: -meter - 1 }; }
        msg = "";
        render();
      }
      function recStop() {
        var n = rec.notes, wasBack = rec.back;
        rec = null;
        if (wasBack) { backStop(); }
        if (n.length) {
          take = drumListAdd(takes, { bpm: bpm, notes: n, song: wasBack ? back.name : "" }, DRUM_TAKES_MAX, drumTakeClean, "テイク");
          drumTakesSave(takes);
          msg = "&#x1F4BE; 「" + escHtml(take.name) + "」に保存しました（" + take.notes.length + "打）";
        } else { msg = "叩かなかったので保存しませんでした"; }
        render();
      }
      function playToggle() {
        if (mode === "step") { stepToggle(); return; }
        if (mode !== "free" || rec) { return; }
        if (play) { if (play.back) { backStop(); } play = null; render(); return; }
        if (!take || !take.notes.length) { msg = "まだテイクがありません。🔴 録音してみよう"; render(); return; }
        audio();
        play = { t0: now() + 0.1, notes: take.notes, bpm: take.bpm, idx: 0, back: !!back };
        if (back) { backStart(); }
        render();
      }

      // --- ステップ ---
      var steps = mode === "step" ? (cfg.pat && drumById(drumPatsLoad(), cfg.pat) ? drumById(drumPatsLoad(), cfg.pat).steps : prefs.steps) : prefs.steps;
      if (mode === "step" && cfg.pat) { var op = drumById(drumPatsLoad(), cfg.pat); if (op) { bpm = op.bpm; msg = "「" + escHtml(op.name) + "」をひらきました"; } }
      var stepRun = null; // { pos: いまの位置（マス・小数）, n: 予約したマス, s: いまの列 }
      function stepSave() { prefs.steps = steps; drumSavePrefs(prefs); }
      function stepToggle() {
        if (stepRun) { stepRun = null; } else { audio(); stepRun = { pos: 0, n: -1, s: -1 }; }
        render();
      }
      // §235: 演奏パターンと同じく少し先まで予約して鳴らす（ハネもつける）
      function stepStep() {
        var p = stepRun.pos, rate = bpm / 15, k, i;
        if (p - stepRun.n > 2) { stepRun.n = Math.floor(p) - 1; }
        while ((k = stepRun.n + 1) - p <= DRUM_PAT_LOOK * rate) {
          stepRun.n = k;
          var c = k % DRUM_STEPS, ahead = Math.max(0, (k + drumSwingOff(prefs.swing, c) - p) / rate);
          for (i = 0; i < steps.length; i++) { if (steps[i][1].indexOf(c) >= 0) { soundAt(steps[i][0], humanLv(0.85), humanAt(ahead)); } }
        }
        stepRun.s = Math.floor(p + 1e-6) % DRUM_STEPS;
        stepRun.pos = p + rate / 60;
      }

      // --- リズムゲーム ---
      var rate = (DRUM_SPEEDS.indexOf(Number(cfg.speed)) >= 0 ? Number(cfg.speed) : 100) / 100, song = mode === "rhythm" ? drumSong(cfg.song) : null;
      var level = cfg.level === "normal" || cfg.level === "hard" ? cfg.level : "easy", chart = song ? drumChart(song[0], level) : { lanes: [], notes: [] };
      var spb = song ? 60 / song[1] / rate : 0.5, rn = [], counts = [0, 0, 0, 0], combo = 0, maxCombo = 0, judgeText = "", judgeFrames = 0, lastClick = -99;
      for (var ci = 0; ci < chart.notes.length; ci++) { rn.push({ t: DRUM_LEAD + chart.notes[ci].beat * spb, m: chart.notes[ci].m, j: -2 }); }
      function laneOf(m) { return chart.lanes.indexOf(m); }
      function rhythmHit(m) {
        var t = now(), best = null, i;
        for (i = 0; i < rn.length; i++) {
          var n = rn[i];
          if (n.t - t > DRUM_JUDGE[2][0]) { break; }
          if (n.j !== -2 || n.m !== m || Math.abs(t - n.t) > DRUM_JUDGE[2][0]) { continue; }
          if (!best || Math.abs(t - n.t) < Math.abs(t - best.t)) { best = n; }
        }
        if (!best) { return; }
        var g = drumJudge(t - best.t);
        best.j = g; counts[g]++; combo++; maxCombo = Math.max(maxCombo, combo);
        api.addScore(DRUM_JUDGE[g][2] + Math.min(50, combo) * 2);
        judgeText = DRUM_JUDGE[g][1]; judgeFrames = 30;
      }
      function rhythmStep() {
        var t = now(), i, left = 0;
        for (i = 0; i < rn.length; i++) {
          if (rn[i].j === -2 && t - rn[i].t > DRUM_JUDGE[2][0]) { rn[i].j = -1; counts[3]++; combo = 0; judgeText = "MISS"; judgeFrames = 30; }
          if (rn[i].j === -2) { left++; }
        }
        var sb = Math.floor((t - DRUM_LEAD) / spb);
        if (sb < 0 && sb !== lastClick && t >= 0.05) { lastClick = sb; audio(); click(sb % 4 === 0); }
        if (!left && rn.length && t > rn[rn.length - 1].t + 1) { finish(); }
      }
      function finish() {
        if (ended) { return; }
        ended = true;
        var acc = rn.length ? (counts[0] + counts[1] * 0.7 + counts[2] * 0.4) / rn.length : 0, rk = drumRank(acc), best = drumBest();
        if (rn.length && counts[3] === 0) { api.addScore(500); }
        var key = song[0] + "@" + level + "@" + Math.round(rate * 100), sc = api.getScore();
        if (!best[key] || !(best[key].s >= sc)) { best[key] = { s: sc, r: rk }; lsSet(DRUM_BEST_KEY, best); }
        msg = "ランク <b>" + rk + "</b>（正確さ " + Math.round(acc * 100) + "%）・最大コンボ " + maxCombo + (counts[3] === 0 ? "・&#x1F525; フルコンボ +500" : "") +
          "<br>PERFECT " + counts[0] + " / GREAT " + counts[1] + " / GOOD " + counts[2] + " / MISS " + counts[3];
        render();
        api.gameOver("ランク " + rk);
      }

      // --- 叩く ---
      // セットの部品を叩く（ハイハットはペダルで開け閉め）
      function hitPiece(p) { if (p) { hit(p[0] === "hh" && hhOpen ? 46 : p[1], p[6] === "cym" ? 0.85 : 0.9); } }
      function kitBox() { return drumKitBox(Ld.land ? 14 : 58, Ld.h - (Ld.land ? 14 : 58) - 4); }
      var flashAt = []; // §234: 予約した音が鳴るフレームで光らせる [[フレーム, MIDI]]
      // §237: 人間っぽいゆらぎ（強さ ±10%・タイミング 0〜12ms おくれ）
      function humanLv(lv) { return prefs.human ? Math.max(0.05, Math.min(1, lv * (0.9 + Math.random() * 0.2))) : lv; }
      function humanAt(ahead) { return prefs.human ? ahead + Math.random() * 0.012 : ahead; }
      // 鳴らして光らせるだけ（録音・判定はしない）
      function soundAt(m, lv, ahead) {
        hitSound(m, lv, ahead);
        if (ahead > 0) { flashAt.push([frame + Math.round(ahead * 60), m]); } else { flash[m] = 8; }
      }
      // auto ＝ 演奏パターンが鳴らした音（練習の判定はしない）
      function hit(m, lv, ahead, auto) {
        if (ended || !drumPad(m)) { return; }
        if (!auto && patRun && prac && prefs.mute.length) { pracJudge(m); }
        ahead = ahead > 0 ? ahead : 0;
        hitSound(m, lv || 0.9, ahead);
        if (ahead) { flashAt.push([frame + Math.round(ahead * 60), m]); } else { flash[m] = 10; }
        last = drumName(m);
        if (mode === "free" && rec) {
          var b = recBeat() + ahead * (rec.back ? 1 / back.s.spb : bpm / 60);
          if (b >= -0.25 && rec.notes.length < DRUM_NOTES_MAX) { rec.notes.push([r3(Math.max(0, b)), m, lv || 0.9]); }
        } else if (mode === "rhythm") { rhythmHit(m); }
      }
      function action(v) {
        if (v === "rec") { recToggle(); } else if (v === "play") { playToggle(); }
        else if (v === "back") { backToggle(); }
        else if (v === "kit") { kit = !kit; prefs.kit = kit; drumSavePrefs(prefs); render(); }
        else if (v === "pedal") { if (kit) { hhOpen = !hhOpen; render(); } }
        else if (v === "dbg") { render(); }
        else if (v === "pat") { prefs.pat = !prefs.pat; drumSavePrefs(prefs); if (!prefs.pat) { patStop(); patEdit = false; } render(); }
        else if (v === "patstop") { patStop(); render(); }
        else if (v === "patset") { prefs.patSet = !prefs.patSet; drumSavePrefs(prefs); render(); }
        else if (v === "human") { prefs.human = !prefs.human; drumSavePrefs(prefs); render(); }
        else if (v === "songopen") { prefs.songOpen = !prefs.songOpen; drumSavePrefs(prefs); render(); }
        else if (v === "songplay") { songPlay(); }
        else if (v === "songadd") {
          var pk = drumPattern(songPick);
          if (!pk) { msg = "足すパターンを一覧からえらんでね"; }
          else if (dsong.length >= DRUM_SONG_MAX || drumSongBars(dsong) + (pk.kind === "fill" ? 1 : 4) > DRUM_SONG_BARS) { msg = "ソングはこれ以上のばせません（" + DRUM_SONG_MAX + "こ・" + DRUM_SONG_BARS + "小節まで）"; }
          else { dsong.push([songPick, pk.kind === "fill" ? 1 : 4]); songSave(); msg = ""; }
          render();
        }
        else if (v === "songreset") {
          if (window.confirm && !window.confirm("ソングを はじめのお手本にもどしますか？")) { return; }
          try { window.localStorage.removeItem(DRUM_SONG_KEY); } catch (e1) {}
          dsong = drumSongLoad(); render();
        }
        else if (v === "songclear") { if (window.confirm && !window.confirm("ソングを空にしますか？")) { return; } dsong = []; songSave(); render(); }
        else if (v.indexOf("sg:") === 0) {
          // sg:動き:行（plus / minus / up / down / del）
          var sp = v.split(":"), si = Number(sp[2]);
          if (dsong[si]) {
            if (sp[1] === "plus" && dsong[si][1] < 16 && drumSongBars(dsong) < DRUM_SONG_BARS) { dsong[si][1]++; }
            else if (sp[1] === "minus" && dsong[si][1] > 1) { dsong[si][1]--; }
            else if (sp[1] === "up" && si > 0) { dsong.splice(si - 1, 0, dsong.splice(si, 1)[0]); }
            else if (sp[1] === "down" && si < dsong.length - 1) { dsong.splice(si + 1, 0, dsong.splice(si, 1)[0]); }
            else if (sp[1] === "del") { dsong.splice(si, 1); }
            if (patRun && patRun.song) { patStop(); }
            songSave();
          }
          render();
        }
        else if (v === "songfromseq") {
          var U2 = drumSeqApi(), fr = U2 ? drumSongFromSeq(back ? back.seq : U2.seqLoad().cur) : { ok: false, msg: "ゴリラウクレレが読みこめませんでした" };
          if (fr.ok) {
            if (dsong.length && window.confirm && !window.confirm("いまのソングを、シーケンサーの曲に合わせたソングに入れかえますか？")) { return; }
            if (patRun && patRun.song) { patStop(); }
            dsong = fr.song; songSave();
            if (!back && fr.bpm) { bpm = Math.max(40, Math.min(240, Math.round(fr.bpm))); prefs.bpm = bpm; drumSavePrefs(prefs); }
          }
          msg = (fr.ok ? "&#x1FA84; " : "&#x26A0;&#xFE0F; ") + escHtml(fr.msg);
          render();
        }
        else if (v === "songload") {
          var tf = drumTakeFromSeq();
          if (tf.ok) {
            take = drumListAdd(takes, { bpm: Math.max(40, Math.min(240, Math.round(tf.bpm || bpm))), notes: tf.notes, song: "" }, DRUM_TAKES_MAX, drumTakeClean, "シーケンサー");
            drumTakesSave(takes);
          }
          msg = (tf.ok ? "&#x1F4E5; " + escHtml(tf.msg) + "。「" + escHtml(take.name) + "」として保存しました（▶ 再生で聴けます）" : "&#x26A0;&#xFE0F; " + escHtml(tf.msg));
          render();
        }
        else if (v === "songtake") {
          var sn = drumSongNotes(dsong, prefs.swing);
          if (!sn.length) { msg = "ソングに音がありません"; render(); return; }
          take = drumListAdd(takes, { bpm: bpm, notes: sn, song: "" }, DRUM_TAKES_MAX, drumTakeClean, "ソング");
          drumTakesSave(takes);
          msg = "&#x1F4BE; ソングを「" + escHtml(take.name) + "」として保存しました（" + take.notes.length + "打）。▶ 再生で聴けます";
          render();
        }
        else if (v === "songsend") { var ss = drumSongSend(dsong, prefs.swing, "ドラムのソング"); msg = (ss.ok ? "&#x2705; " : "&#x26A0;&#xFE0F; ") + escHtml(ss.msg); render(); }
        else if (v === "quant") {
          if (!take || !take.notes.length || rec || play) { return; }
          var qn = drumQuantize(take.notes, 0.25), nm0 = take.name;
          take = drumListAdd(takes, { bpm: take.bpm, notes: qn, song: take.song }, DRUM_TAKES_MAX, drumTakeClean, "テイク");
          take.name = (nm0 + "（直し）").slice(0, 20);
          drumTakesSave(takes);
          msg = "&#x1F9F2; 16分にそろえて「" + escHtml(take.name) + "」に保存しました";
          render();
        }
        else if (v === "patpage") { patPage = patPage ? 0 : 1; prefs.patPage = patPage; drumSavePrefs(prefs); render(); }
        else if (v.indexOf("sw:") === 0) { prefs.swing = drumSwing(v.substring(3))[0]; drumSavePrefs(prefs); render(); }
        else if (v.indexOf("af:") === 0) { prefs.autoFill = DRUM_AUTOFILL.indexOf(Number(v.substring(3))) >= 0 ? Number(v.substring(3)) : 0; drumSavePrefs(prefs); render(); }
        else if (v.indexOf("pv:") === 0) { prefs.patVol = v.substring(3); drumSavePrefs(prefs); render(); }
        else if (v.indexOf("mute:") === 0) {
          var mp = v.substring(5), mi = prefs.mute.indexOf(mp);
          if (mi >= 0) { prefs.mute.splice(mi, 1); } else if (drumPartOk(mp)) { prefs.mute.push(mp); }
          drumSavePrefs(prefs); render();
        }
        else if (v === "tap") { if (!rec && !back) { tapTempo(); } }
        else if (v === "patedit") { patEdit = !patEdit; msg = ""; render(); }
        else if (v === "patreset") {
          if (window.confirm && !window.confirm("パターンのパッドを はじめにもどしますか？")) { return; }
          try { window.localStorage.removeItem(DRUM_PATPADS_KEY); } catch (e) {}
          patPads = drumPatPadsLoad(); msg = "パターンのパッドを はじめにもどしました"; render();
        }
        else if (v === "dbgreload") {
          audio();
          if (UG && UG.samples) { var fn = UG.sampleFiles[UG.DRUM]; delete UG.samples.state[fn]; UG.samples.waiting[fn] = []; UG.samples.err[fn] = 0; }
          if (UG && UG.setDrumKit) { UG.setDrumKit(prefs.kitId); }
          if (UG && UG.loadSamples) { UG.loadSamples([UG.DRUM], function () { render(); }); }
          render();
        }
        else if (v === "land") { landOn = !landOn; prefs.land = landOn; drumSavePrefs(prefs); applyLand(); render(); }
        else if (v === "send") { var rs = drumSendSteps(steps); msg = (rs.ok ? "&#x2705; " : "&#x26A0;&#xFE0F; ") + escHtml(rs.msg); render(); }
        else if (v === "fromseq") {
          var fs = drumStepsFromSeq();
          if (fs) { steps = fs; stepSave(); msg = "シーケンサーの編集中の曲のドラムを読みこみました"; } else { msg = "シーケンサーのドラムが読みこめませんでした"; }
          render();
        }
        else if (v === "metro") { metro = !metro; prefs.metro = metro; drumSavePrefs(prefs); render(); }
        else if (v === "bpmdown" || v === "bpmup") {
          if (rec || back) { return; }
          bpm = Math.max(40, Math.min(240, bpm + (v === "bpmup" ? 5 : -5)));
          prefs.bpm = bpm; drumSavePrefs(prefs); render();
        }
        else if (v === "clear") { steps = drumStepsClean([]); stepSave(); render(); }
        else if (v.indexOf("groove:") === 0) { steps = drumStepsFrom(v.substring(7)); stepSave(); msg = "お手本「" + escHtml((drumGroove(v.substring(7)) || {}).name || "") + "」を読みこみました"; render(); }
        else if (v === "save" || v === "savefill") {
          // §235: フィルとして保存すると、演奏パターンのフィル（1小節で元のループへ）に使える
          var nm = panel && panel.querySelector ? panel.querySelector("[data-dname]") : null, list = drumPatsLoad(), fk = v === "savefill";
          var it = drumListAdd(list, { name: nm && nm.value ? String(nm.value).trim().slice(0, 16) : "", bpm: bpm, steps: steps, kind: fk ? "fill" : "loop" }, DRUM_PATS_MAX, drumPatClean, fk ? "フィル" : "リズム");
          drumPatsSave(list);
          msg = "&#x1F4BE; 「" + escHtml(it.name) + "」を" + (fk ? "フィルとして" : "") + "保存しました（じゆうの演奏パターンの「✏️ 入れかえ」で使えます）";
          render();
        }
      }

      // --- §233: 演奏パターン（ループは次の小節の頭で切りかえ・フィルは1小節で元のループへ）---
      var dsong = mode === "free" ? drumSongLoad() : [], songPick = ""; // §237: ソング・足すパターン
      function songSave() { drumSongSave(dsong); dsong = drumSongLoad(); }
      function songPlay() {
        if (patRun && patRun.song) { var sb = patRun.song.bk; patStop(); if (sb && bk && !rec) { backStop(); } render(); return; }
        if (!dsong.length) { msg = "ソングが空です。パターンを足してね"; render(); return; }
        patStop();
        // §238: 伴奏があれば、伴奏も頭から鳴らしてそろえる
        var withBk = !!back && !rec;
        if (withBk) { play = null; backStart(); }
        patBegin(dsong[0][0], null);
        if (patRun) { patRun.song = { i: 0, left: dsong[0][1], bk: withBk }; }
        render();
      }
      var patPads = mode === "free" ? drumPatPadsLoad() : [], patPage = prefs.patPage, patRun = null, patEdit = false, patPick = "", taps = [];
      // §234: いまの位置（マス・小数）。伴奏があれば曲の拍に合わせる。なければ毎フレーム BPM ぶん進める（BPM を変えてもとばない）
      var DRUM_PAT_LOOK = 0.06; // 何秒先まで予約するか
      function patPos() { return bk && back ? backBeat() * 4 : patRun.pos; }
      function patRate() { return bk && back ? 4 / back.s.spb : bpm / 15; } // 1秒あたりのマス
      function patBegin(id, ret) {
        var st = drumPatternSteps(id), pt = drumPattern(id);
        if (!st || !pt) { return; }
        audio();
        if (!patRun) {
          patRun = { pos: 0, bar: 0, autoN: 0 };
          pracReset();
          var p0 = patPos();
          patRun.pos = p0; patRun.n = Math.max(-1, Math.floor(p0 + 1e-6) - 1);
        }
        patRun.id = id; patRun.steps = st; patRun.kind = pt.kind; patRun.ret = ret || null; patRun.queue = null; patRun.auto = false;
      }
      function patTap(i) {
        var id = patPads[i];
        if (patEdit) {
          if (patPick) { patPads[i] = patPick; drumPatPadsSave(patPads); msg = "パッド " + (i + 1) + " に「" + escHtml(drumPattern(patPick).name) + "」を入れました"; }
          else { msg = "入れるパターンを一覧からえらんでね"; }
          render();
          return;
        }
        if (!id) { return; }
        var pt = drumPattern(id);
        if (!pt) { return; }
        if (patRun && patRun.song) { patRun.song = null; } // ソングのとちゅうでパッド → ふつうの演奏にもどる
        if (!patRun) { patBegin(id, null); render(); return; }
        if (patRun.id === id && pt.kind === "loop" && !patRun.queue) { patStop(); render(); return; } // 同じループをもう一度 → 止める
        // 鳴っているあいだは、次の小節の頭で切りかえる（フィルは そのあと元のループへ）
        patRun.queue = { id: id, ret: pt.kind === "fill" ? (patRun.kind === "loop" ? patRun.id : patRun.ret) : null };
        render();
      }
      // 毎フレーム: 少し先（DRUM_PAT_LOOK 秒）までのマスを予約する
      function patStep() {
        var p = patPos(), rate = patRate(), k;
        if (p + 1 < patRun.n) { patRun.n = Math.max(-1, Math.floor(p) - 1); patRun.started = false; } // 伴奏を鳴らしなおした（もどった）
        if (p - patRun.n > 2) { patRun.n = Math.floor(p) - 1; } // 止まっていた（画面を切りかえていた）ぶんは鳴らさない
        while (patRun && (k = patRun.n + 1) - p <= DRUM_PAT_LOOK * rate) {
          patRun.n = k;
          patPlay(k, Math.max(0, (k + drumSwingOff(prefs.swing, ((k % DRUM_STEPS) + DRUM_STEPS) % DRUM_STEPS) - p) / rate));
        }
        if (patRun && !(bk && back)) { patRun.pos = p + bpm / 15 / 60; } else if (patRun) { patRun.pos = p; }
      }
      // §235: 鳴らさないパートを自分で叩いたときの判定（ぴったり・はやい・おそい・わすれ）
      var prac = null; // { exp: [{ t: 鳴るはずの時刻, p: パート }], c: [ぴったり, はやい, おそい, わすれ], txt, col, f: 出しておくフレーム }
      function pracReset() { prac = { exp: [], c: [0, 0, 0, 0], txt: "", col: "", f: 0 }; }
      function pracExpect(m, ahead) {
        var p = drumPartOf(m), t = now() + ahead, i;
        if (!prac) { return; }
        for (i = 0; i < prac.exp.length; i++) { if (prac.exp[i].p === p && Math.abs(prac.exp[i].t - t) < 0.01) { return; } }
        prac.exp.push({ t: t, p: p });
      }
      function pracShow(txt, col) { prac.txt = txt; prac.col = col; prac.f = 40; }
      function pracJudge(m) {
        var p = drumPartOf(m), t = now(), best = -1, i;
        for (i = 0; i < prac.exp.length; i++) {
          var d = Math.abs(prac.exp[i].t - t);
          if (prac.exp[i].p === p && d <= DRUM_PRAC_WIN && (best < 0 || d < Math.abs(prac.exp[best].t - t))) { best = i; }
        }
        if (best < 0) { return; } // パターンにないところで叩いた → 判定しない
        var dt = t - prac.exp[best].t, ms = Math.round(dt * 1000), g = Math.abs(dt) <= DRUM_PRAC_OK ? 0 : (dt < 0 ? 1 : 2);
        prac.exp.splice(best, 1);
        prac.c[g]++;
        pracShow(g === 0 ? "ぴったり！" : (g === 1 ? "はやい " + ms + "ms" : "おそい +" + ms + "ms"), g === 0 ? "#55efc4" : "#ffd166");
      }
      function pracStep() {
        var t = now();
        for (var i = prac.exp.length - 1; i >= 0; i--) {
          if (t - prac.exp[i].t > DRUM_PRAC_WIN) { prac.exp.splice(i, 1); prac.c[3]++; pracShow("わすれ", "#ff7675"); }
        }
        if (prac.f > 0) { prac.f--; }
      }
      function pracCount() { return prac ? prac.c[0] + prac.c[1] + prac.c[2] + prac.c[3] : 0; }
      function pracLine() { return "ぴったり " + prac.c[0] + "・はやい " + prac.c[1] + "・おそい " + prac.c[2] + "・わすれ " + prac.c[3]; }
      // パターンを止める（練習していれば結果を出す）
      function patStop() {
        if (pracCount()) { msg = "&#x1F3AF; 練習のけっか: " + pracLine() + "（ぴったり " + Math.round(prac.c[0] * 100 / pracCount()) + "%）"; }
        patRun = null; prac = null;
      }
      function patMuted(m) { return prefs.mute.indexOf(drumPartOf(m)) >= 0; }
      function patPlay(k, ahead) {
        var sIdx = ((k % DRUM_STEPS) + DRUM_STEPS) % DRUM_STEPS, i, crash = false, af = prefs.autoFill;
        if (sIdx === 0 && patRun.started && patRun.song) {
          // §237: ソング。決めた小節だけ鳴らしたら次のパターンへ。最後まで行ったら止める
          var sg = patRun.song, sf = patRun.kind === "fill";
          sg.left--;
          if (sg.left <= 0) {
            sg.i++;
            if (sg.i >= dsong.length) { patStop(); if (sg.bk && bk && !rec) { backStop(); } msg = "&#x1F3BC; ソングを最後まで鳴らしました"; render(); return; }
            sg.left = dsong[sg.i][1];
            patBegin(dsong[sg.i][0], null);
          }
          crash = sf && patRun.kind === "loop";
          render();
        } else if (sIdx === 0 && patRun.started) {
          var wasFill = patRun.kind === "fill";
          patRun.bar++;
          if (patRun.queue) { var q = patRun.queue; patBegin(q.id, q.ret); if (patRun.kind === "loop") { patRun.bar = 0; } }
          else if (wasFill) {
            if (patRun.ret) { patBegin(patRun.ret, null); } else { patStop(); render(); return; }
          } else if (af && patRun.bar % af === af - 1) {
            // §234: オートフィル（4・8小節ごとの最後の小節）
            patBegin("f:" + DRUM_AUTOFILL_IDS[patRun.autoN++ % DRUM_AUTOFILL_IDS.length], patRun.id);
            patRun.auto = true;
          }
          crash = wasFill && patRun.kind === "loop"; // フィルのあとはクラッシュ
          render();
        }
        patRun.started = true;
        var vol = drumPatVol(prefs.patVol), fill = patRun.kind === "fill";
        for (i = 0; i < patRun.steps.length; i++) {
          var m = patRun.steps[i][0];
          if (patRun.steps[i][1].indexOf(sIdx) < 0) { continue; }
          if (m === 49) { crash = false; }
          if (!patMuted(m)) { hit(m, humanLv(drumPatVel(m, sIdx, fill) * vol), humanAt(ahead), true); } else { pracExpect(m, ahead); }
        }
        if (crash) { if (!patMuted(49)) { hit(49, drumPatVel(49, 0, false) * vol, ahead, true); } else { pracExpect(49, ahead); } }
      }
      // §234: タップテンポ（2回目から、最近のタップの間かくの平均で BPM を決める）
      function tapTempo() {
        var t = now();
        if (taps.length && t - taps[taps.length - 1] > 2) { taps = []; }
        taps.push(t);
        if (taps.length > 5) { taps.shift(); }
        hitSound(77, 0.5);
        if (taps.length < 2) { msg = "&#x1F446; テンポに合わせて あと何回かタップしてね"; render(); return; }
        bpm = Math.max(40, Math.min(240, Math.round(60 * (taps.length - 1) / (taps[taps.length - 1] - taps[0]))));
        prefs.bpm = bpm; drumSavePrefs(prefs);
        msg = "&#x1F446; BPM " + bpm + "（" + taps.length + "回）";
        render();
      }

      // §235: ハネ（スウィング）のえらびボタン
      function swingChips() {
        var o = '<p class="small" style="margin:4px 0 2px;">&#x1F3B7; ハネ（スウィング）</p><div class="uke-chips2">', i;
        for (i = 0; i < DRUM_SWINGS.length; i++) { o += '<button class="modal-btn' + (prefs.swing === DRUM_SWINGS[i][0] ? " piano-pad-on" : "") + '" data-da="sw:' + DRUM_SWINGS[i][0] + '">' + DRUM_SWINGS[i][1] + '</button>'; }
        return o + '</div>';
      }
      function render() {
        if (!panel) { return; }
        var h = "", i;
        if (mode === "free") {
          h += '<div class="piano-row"><button class="modal-btn' + (rec ? " piano-rec-on" : "") + '" data-da="rec">' + (rec ? "&#x23F9;&#xFE0F; 録音をとめる" : (back ? "&#x1F534; 合わせて録音" : "&#x1F534; 録音")) + '</button>' +
            '<button class="modal-btn" data-da="play"' + (rec ? " disabled" : "") + '>' + (play ? "&#x23F9;&#xFE0F; とめる" : (back ? "&#x25B6;&#xFE0F; テイク＋伴奏" : "&#x25B6;&#xFE0F; 再生")) + '</button></div>';
          if (take && take.notes.length) {
            h += '<div class="piano-row"><button class="modal-btn" data-da="quant"' + (rec || play ? " disabled" : "") + '>&#x1F9F2; ずれ直し（16分にそろえる）</button></div>';
          }
          if (back) {
            h += '<div class="piano-row"><button class="modal-btn" data-da="back"' + (rec ? " disabled" : "") + '>' + (bk && !play ? "&#x23F9;&#xFE0F; 伴奏をとめる" : "&#x1F3B8; 伴奏だけ鳴らす") + '</button></div>' +
              '<p class="small" style="margin:4px 0 0;">&#x1F3B8; 伴奏: ' + escHtml(back.name) + '（BPM ' + back.seq.bpm + '・' + back.seq.meter + '拍子' + (prefs.backDrum ? "" : "・曲のドラムは鳴らさない") + '）</p>';
          }
        } else if (mode === "step") {
          var gs = drumGrooves(), opts = '<option value="">お手本を読みこむ…</option>';
          for (i = 0; i < gs.length; i++) { opts += '<option value="' + gs[i].id + '">' + escHtml(gs[i].name) + '</option>'; }
          h += '<div class="piano-row"><button class="modal-btn' + (stepRun ? " piano-pad-on" : "") + '" data-da="play">' + (stepRun ? "&#x23F9;&#xFE0F; とめる" : "&#x25B6;&#xFE0F; 再生（ループ）") + '</button>' +
            '<button class="modal-btn" data-da="clear">&#x1F9F9; ぜんぶ消す</button></div>' +
            '<div class="piano-row"><label class="piano-select">&#x1F4DA; <select data-dgroove="1">' + opts + '</select></label></div>' +
            '<div class="piano-row"><button class="modal-btn" data-da="send">&#x1F3B8; シーケンサーへ送る</button><button class="modal-btn" data-da="fromseq">&#x1F4E5; シーケンサーから読みこむ</button></div>' +
            '<div class="piano-row"><input type="text" class="drum-name" data-dname="1" maxlength="16" placeholder="名前（なくてもOK）"></div><div class="piano-row"><button class="modal-btn" data-da="save">&#x1F4BE; 保存</button><button class="modal-btn" data-da="savefill">&#x1F338; フィルで保存</button></div>' +
            swingChips();
        } else {
          h += '<p class="small" style="margin:0;">' + escHtml((drumGroove(song[0]) || { name: song[0] }).name) + '（' + (level === "easy" ? "かんたん" : (level === "normal" ? "ふつう" : "むずかしい")) + '・速さ ' + Math.round(rate * 100) + '%）・' + rn.length + '打</p>';
        }
        if (mode === "free") {
          h += '<div class="piano-row"><button class="modal-btn' + (kit ? " piano-pad-on" : "") + '" data-da="kit">' + (kit ? "&#x1F39B;&#xFE0F; パッドにする" : "&#x1F941; ドラムセットにする") + '</button>' +
            (kit ? '<button class="modal-btn' + (hhOpen ? " piano-pad-on" : "") + '" data-da="pedal">&#x1F9B6; ハイハット ' + (hhOpen ? "開いている" : "閉じている") + '</button>' : "") + '</div>' +
            '<div class="piano-row"><button class="modal-btn" data-da="land">' + (landOn ? "&#x1F4F1; たて向きにもどす" : "&#x2194;&#xFE0F; よこ向き（大きく）") + '</button></div>';
          // §233: 演奏パターン
          h += '<div class="piano-row"><button class="modal-btn' + (prefs.pat ? " piano-pad-on" : "") + '" data-da="pat">&#x1F3BC; 演奏パターン ' + (prefs.pat ? "ON" : "OFF") + '</button>' +
            (prefs.pat ? '<button class="modal-btn" data-da="patstop"' + (patRun ? "" : " disabled") + '>&#x23F9;&#xFE0F; とめる</button><button class="modal-btn" data-da="patpage">&#x1F4C4; ' + (patPage + 1) + ' / 2</button>' : "") + '</div>';
          if (prefs.pat) {
            h += '<div class="uke-pads' + (patEdit ? " edit" : "") + '">';
            for (i = patPage * DRUM_PATPAD_PAGE; i < (patPage + 1) * DRUM_PATPAD_PAGE; i++) {
              var pp = patPads[i] ? drumPattern(patPads[i]) : null, on = patRun && patRun.id === patPads[i], qd = patRun && patRun.queue && patRun.queue.id === patPads[i];
              h += '<button class="uke-pad' + (pp ? "" : " empty") + (on ? " on" : "") + (pp && pp.kind === "fill" ? " fill" : "") + '" data-dpat="' + i + '"><span class="n">' + (i + 1) + (qd ? " ⏳" : "") + '</span>' +
                (pp ? escHtml(pp.name) : (patEdit ? "＋" : "")) + '</button>';
            }
            h += '</div><div class="piano-row"><button class="modal-btn' + (patEdit ? " piano-pad-on" : "") + '" data-da="patedit">&#x270F;&#xFE0F; 入れかえ ' + (patEdit ? "ON" : "OFF") + '</button>' +
              '<button class="modal-btn" data-da="patreset">&#x21BA; はじめのパターン</button></div>';
            // §237: ソング
            h += '<div class="piano-row"><button class="modal-btn' + (prefs.songOpen ? " piano-pad-on" : "") + '" data-da="songopen">&#x1F3BC; ソング（パターンをつなげる）' + (prefs.songOpen ? " ▲" : " ▼") + '</button></div>';
            if (prefs.songOpen) {
              var sgp = patRun && patRun.song ? patRun.song.i : -1;
              h += '<div class="piano-row"><button class="modal-btn' + (sgp >= 0 ? " piano-pad-on" : "") + '" data-da="songplay">' + (sgp >= 0 ? "&#x23F9;&#xFE0F; ソングをとめる" : "&#x25B6;&#xFE0F; ソングを鳴らす") + '</button>' +
                '<span class="small">' + dsong.length + 'こ・' + drumSongBars(dsong) + '小節</span></div><div class="drum-song">';
              for (i = 0; i < dsong.length; i++) {
                var sgt = drumPattern(dsong[i][0]);
                h += '<div class="drum-song-row' + (i === sgp ? " on" : "") + (sgt.kind === "fill" ? " fill" : "") + '"><span class="n">' + (i + 1) + '</span><span class="nm">' + escHtml(sgt.name) + '</span>' +
                  '<button class="modal-btn" data-da="sg:minus:' + i + '">&minus;</button><span class="bars">&times;' + dsong[i][1] + '</span><button class="modal-btn" data-da="sg:plus:' + i + '">&#xFF0B;</button>' +
                  '<button class="modal-btn" data-da="sg:up:' + i + '">&#x2191;</button><button class="modal-btn" data-da="sg:down:' + i + '">&#x2193;</button><button class="modal-btn" data-da="sg:del:' + i + '">&#x1F5D1;&#xFE0F;</button></div>';
              }
              var sl2 = drumPatternList(), sgr = "", so = '<option value="">足すパターンをえらぶ…</option>';
              for (i = 0; i < sl2.length; i++) {
                if (sl2[i].group !== sgr) { so += (sgr ? "</optgroup>" : "") + '<optgroup label="' + sl2[i].group + '">'; sgr = sl2[i].group; }
                so += '<option value="' + sl2[i].id + '"' + (songPick === sl2[i].id ? " selected" : "") + '>' + escHtml(sl2[i].name) + '</option>';
              }
              h += '</div><div class="piano-row"><label class="piano-select"><select data-dsong="1">' + so + '</optgroup></select></label><button class="modal-btn" data-da="songadd">&#xFF0B; 足す</button></div>' +
                '<div class="piano-row"><button class="modal-btn" data-da="songtake">&#x1F4BE; テイクにする</button><button class="modal-btn" data-da="songsend">&#x1F3B8; シーケンサーへ送る</button></div>' +
                '<div class="piano-row"><button class="modal-btn" data-da="songfromseq">&#x1FA84; シーケンサーの曲に合わせて作る</button></div>' +
                '<div class="piano-row"><button class="modal-btn" data-da="songload">&#x1F4E5; シーケンサーのドラム打ち込みを読みこむ</button></div>' +
                (back ? '<p class="small" style="margin:2px 0 0;">&#x1F3B8; 伴奏があるときは、▶ ソングで伴奏も頭からいっしょに鳴ります</p>' : "") +
                '<div class="piano-row"><button class="modal-btn" data-da="songreset">&#x21BA; お手本</button><button class="modal-btn" data-da="songclear">&#x1F9F9; 空にする</button></div>';
            }
            // §234: オートフィル・音量・鳴らさないパート（§239: 「⚙️ パターンの設定」でたたむ。たたんでいるときは、いまの設定を短く）
            var chip = function (act, label, on) { return '<button class="modal-btn' + (on ? " piano-pad-on" : "") + '" data-da="' + act + '">' + label + '</button>'; };
            var sum = [];
            if (prefs.autoFill) { sum.push("オートフィル " + prefs.autoFill + "小節"); }
            if (prefs.patVol !== "l") { sum.push("音量 " + (prefs.patVol === "s" ? "小" : "中")); }
            if (prefs.swing !== "0") { sum.push("ハネ " + drumSwing(prefs.swing)[1]); }
            if (prefs.human) { sum.push("ゆらぎ"); }
            for (i = 0; i < prefs.mute.length; i++) { for (var pi2 = 0; pi2 < DRUM_PARTS.length; pi2++) { if (DRUM_PARTS[pi2][0] === prefs.mute[i]) { sum.push(DRUM_PARTS[pi2][1] + "なし"); } } }
            h += '<div class="piano-row"><button class="modal-btn' + (prefs.patSet ? " piano-pad-on" : "") + '" data-da="patset">&#x2699;&#xFE0F; パターンの設定' + (prefs.patSet ? " ▲" : " ▼") + '</button></div>' +
              (!prefs.patSet && sum.length ? '<p class="small" style="margin:0 0 2px;color:#adb5bd;">' + escHtml(sum.join("・")) + '</p>' : "");
            if (prefs.patSet) {
            h += '<p class="small" style="margin:4px 0 2px;">&#x1F501; オートフィル（最後の1小節をフィルに）</p><div class="uke-chips2">';
            for (i = 0; i < DRUM_AUTOFILL.length; i++) { h += chip("af:" + DRUM_AUTOFILL[i], DRUM_AUTOFILL[i] ? DRUM_AUTOFILL[i] + "小節ごと" : "なし", prefs.autoFill === DRUM_AUTOFILL[i]); }
            h += '</div><p class="small" style="margin:4px 0 2px;">&#x1F50A; パターンの音量</p><div class="uke-chips2">';
            for (i = 0; i < DRUM_PATVOLS.length; i++) { h += chip("pv:" + DRUM_PATVOLS[i][0], DRUM_PATVOLS[i][1], prefs.patVol === DRUM_PATVOLS[i][0]); }
            h += '</div>' + swingChips() + '<div class="piano-row"><button class="modal-btn' + (prefs.human ? " piano-pad-on" : "") + '" data-da="human">&#x1F3B2; 人間っぽいゆらぎ ' + (prefs.human ? "ON" : "OFF") + '</button></div>' +
              '<p class="small" style="margin:4px 0 2px;">&#x1F507; 鳴らさないパート（そこは自分で叩こう）</p><div class="uke-chips2">';
            for (i = 0; i < DRUM_PARTS.length; i++) { h += chip("mute:" + DRUM_PARTS[i][0], DRUM_PARTS[i][1], prefs.mute.indexOf(DRUM_PARTS[i][0]) >= 0); }
            h += '</div>' + (prefs.mute.length ? '<p class="small" style="margin:2px 0 0;">&#x1F3AF; 鳴らさないパートを叩くと、ぴったり・はやい・おそいを判定します</p>' : "");
            }
            if (patEdit) {
              var pl = drumPatternList(), grp = "", po = '<option value="">入れるパターンをえらぶ…</option>';
              for (i = 0; i < pl.length; i++) {
                if (pl[i].group !== grp) { po += (grp ? "</optgroup>" : "") + '<optgroup label="' + pl[i].group + '">'; grp = pl[i].group; }
                po += '<option value="' + pl[i].id + '"' + (patPick === pl[i].id ? " selected" : "") + '>' + escHtml(pl[i].name) + '</option>';
              }
              h += '<div class="piano-row"><label class="piano-select">&#x1F4DA; <select data-dpick="1">' + po + '</optgroup></select></label></div>' +
                '<p class="small" style="margin:2px 0 0;">えらんでからパッドをタップすると入れかわります。ステップで保存したリズムも入れられます</p>';
            }
          }
        }
        if (mode !== "rhythm" && !back) {
          h += '<div class="piano-row"><button class="modal-btn" data-da="bpmdown">&minus;</button><span>BPM ' + bpm + '</span><button class="modal-btn" data-da="bpmup">&#xFF0B;</button>' +
            (mode === "free" ? '<button class="modal-btn" data-da="metro">&#x1F941; ' + (metro ? "ON" : "OFF") + '</button>' : "") + '</div>' +
            (mode === "free" ? '<div class="piano-row"><button class="modal-btn" data-da="tap"' + (rec ? " disabled" : "") + '>&#x1F446; タップでテンポ（何回かタップ）</button></div>' : "");
        }
        if (msg) { h += '<p class="small" style="margin:4px 0 0;color:#ffd166;">' + msg + '</p>'; }
        if (DRUM_DEBUG && mode !== "rhythm") { h += '<div class="piano-row"><button class="modal-btn" data-da="dbgreload">&#x1F527; 生ドラムを読みなおす</button><button class="modal-btn" data-da="dbg">&#x1F527; 状態を更新</button></div><pre class="drum-dbg">' + escHtml(drumDebugText()).split(" ｜ ").join("<br>") + '</pre>'; }
        panel.innerHTML = h;
        if (!panel.querySelectorAll) { return; }
        var bs = panel.querySelectorAll("button[data-da]");
        for (i = 0; i < bs.length; i++) { bs[i].onclick = function (ev) { if (ev.currentTarget.blur) { ev.currentTarget.blur(); } action(ev.currentTarget.getAttribute("data-da")); }; }
        var pbs = panel.querySelectorAll("button[data-dpat]");
        for (i = 0; i < pbs.length; i++) { pbs[i].onclick = function (ev) { if (ev.currentTarget.blur) { ev.currentTarget.blur(); } patTap(Number(ev.currentTarget.getAttribute("data-dpat"))); }; }
        var ssel = panel.querySelector("select[data-dsong]");
        if (ssel) { ssel.onchange = function (ev) { songPick = ev.currentTarget.value; }; }
        var psel = panel.querySelector("select[data-dpick]");
        if (psel) { psel.onchange = function (ev) { patPick = ev.currentTarget.value; }; }
        var sel = panel.querySelector("select[data-dgroove]");
        if (sel) { sel.onchange = function (ev) { if (ev.currentTarget.value) { action("groove:" + ev.currentTarget.value); } }; }
      }
      render();

      function text(ctx, s, x, y, size, color) {
        ctx.fillStyle = color; ctx.font = "bold " + size + "px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(s, x, y);
      }
      // §228: ドラムセット（奥から描く）。叩いたところは光ってゆれる
      function ell(ctx, cx, cy, rx, ry) {
        ctx.beginPath();
        if (ctx.ellipse) { ctx.ellipse(cx, cy, Math.max(0.5, rx), Math.max(0.5, ry), 0, 0, Math.PI * 2); } else { ctx.arc(cx, cy, Math.max(0.5, rx), 0, Math.PI * 2); }
      }
      function drawKit(ctx) {
        var b = kitBox(), i;
        for (i = 0; i < DRUM_KIT.length; i++) {
          var p = DRUM_KIT[i], r = drumKitShape(p, b), f = p[0] === "hh" ? Math.max(flash[42] || 0, flash[46] || 0) : (flash[p[1]] || 0), pd = drumPad(p[0] === "hh" && hhOpen ? 46 : p[1]);
          var wob = f > 0 ? Math.sin(f * 1.3) * f * 0.25 : 0;
          if (p[6] === "cym") {
            // スタンド
            ctx.fillStyle = "#6c7a99";
            ctx.fillRect(r.cx - 0.75, r.cy, 1.5, Math.max(0, b.y + 110 * b.sy - r.cy));
            if (p[0] === "hh" && !hhOpen) { ctx.fillStyle = "#b8860b"; ell(ctx, r.cx, r.cy + 2, r.rx, r.ry); ctx.fill(); }
            ctx.fillStyle = f > 0 ? "#fff3b0" : "#e1b12c";
            ell(ctx, r.cx, r.cy + wob - (p[0] === "hh" && hhOpen ? 3 : 0), r.rx, r.ry + Math.abs(wob) * 0.3);
            ctx.fill();
            ctx.fillStyle = "rgba(255,255,255,0.35)";
            ell(ctx, r.cx, r.cy + wob - (p[0] === "hh" && hhOpen ? 3 : 0), r.rx * 0.25, r.ry * 0.3);
            ctx.fill();
          } else if (p[6] === "kick") {
            ctx.fillStyle = f > 0 ? "#ff7675" : "#a63d40";
            ell(ctx, r.cx, r.cy, r.rx * (1 + f * 0.006), r.ry * (1 + f * 0.006));
            ctx.fill();
            ctx.fillStyle = f > 0 ? "#ffffff" : "#efe7d6";
            ell(ctx, r.cx, r.cy, r.rx * 0.84, r.ry * 0.84);
            ctx.fill();
            ctx.font = Math.round(r.ry * 0.7) + "px sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("🦍", r.cx, r.cy - r.ry * 0.12);
          } else {
            // 胴（下）と打面（上）
            var sh = r.ry * 0.9;
            ctx.fillStyle = f > 0 ? pd[3] : "#7f2e31";
            ctx.fillRect(r.cx - r.rx, r.cy, r.rx * 2, sh);
            ell(ctx, r.cx, r.cy + sh, r.rx, r.ry);
            ctx.fill();
            ctx.fillStyle = f > 0 ? "#ffffff" : "#e8e4da";
            ell(ctx, r.cx, r.cy + (f > 0 ? 1 : 0), r.rx, r.ry);
            ctx.fill();
            ctx.strokeStyle = "#9aa0b4";
            ell(ctx, r.cx, r.cy + (f > 0 ? 1 : 0), r.rx, r.ry);
            ctx.stroke();
          }
          text(ctx, pd[2] + " " + p[7], r.cx, p[6] === "cym" ? r.cy - r.ry - 4 : (p[6] === "kick" ? r.cy + r.ry * 0.6 : r.cy), Ld.land ? 5 : 6, p[6] === "drum" || p[6] === "kick" ? "#5a5f73" : "#ffffff");
        }
      }
      // §234: 鳴っているパターンの名前（次のパターン）と、いまのマス（16マス・4拍ごとに区切り）
      function drawPat(ctx, ty) {
        var pt = drumPattern(patRun.id), q = patRun.queue ? drumPattern(patRun.queue.id) : null, fill = patRun.kind === "fill";
        var nm = "🎼 " + (patRun.song ? "ソング " + (patRun.song.i + 1) + "/" + dsong.length + "・" : "") + (pt ? pt.name : "") + (patRun.auto ? "（オート）" : "") + (q ? " → " + q.name : "");
        var cur = Math.floor(patRun.pos + 1e-6), sIdx = cur < 0 ? -1 : cur % DRUM_STEPS, sw = Ld.land ? 7 : 9, sh = Ld.land ? 3 : 5;
        var x0 = W / 2 - sw * DRUM_STEPS / 2, y0 = Ld.land ? ty + 4 : ty + 7, s;
        text(ctx, nm, W / 2, Ld.land ? ty - 1 : ty - 5, Ld.land ? 7 : 11, fill ? "#fd79a8" : "#ffd166");
        for (s = 0; s < DRUM_STEPS; s++) {
          ctx.fillStyle = s === sIdx ? "#ffffff" : (s % 4 === 0 ? (fill ? "#a0527e" : "#7d6bd6") : "#3d4470");
          ctx.fillRect(x0 + s * sw + 0.5, y0, sw - 1, sh);
        }
        // §235: 練習の判定（鳴らさないパートがあるとき）
        if (prac && prefs.mute.length) {
          if (Ld.land) { if (prac.f > 0) { text(ctx, prac.txt, W / 2 + sw * DRUM_STEPS / 2 + 30, y0 + 1, 8, prac.col); } }
          else { text(ctx, prac.f > 0 ? prac.txt : "🎯 " + pracLine(), W / 2, y0 + sh + 7, prac.f > 0 ? 10 : 7, prac.f > 0 ? prac.col : "#adb5bd"); }
        }
      }
      function drawPads(ctx) {
        for (var i = 0; i < DRUM_PADS.length; i++) {
          var r = drumPadRect(i, Ld), pd = DRUM_PADS[i], on = flash[pd[0]] > 0;
          ctx.fillStyle = on ? pd[3] : "#262a45";
          ctx.fillRect(r.x, r.y, r.w, r.h);
          ctx.strokeStyle = pd[3];
          ctx.lineWidth = 2;
          ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
          ctx.lineWidth = 1;
          text(ctx, pd[2], r.x + r.w / 2, r.y + r.h / 2 - 8, 14, on ? "#14213d" : "#ffffff");
          text(ctx, pd[1], r.x + r.w / 2, r.y + r.h / 2 + 10, 8, on ? "#14213d" : "#adb5bd");
          text(ctx, pd[4], r.x + r.w - 8, r.y + 8, 7, on ? "#14213d" : "#6c7a99");
        }
      }
      function drawSteps(ctx) {
        var cw = (W - STEP_X - 2) / DRUM_STEPS, r, s;
        for (r = 0; r < DRUM_ROWS.length; r++) {
          var m = DRUM_ROWS[r], pd = drumPad(m), y = STEP_Y + r * STEP_RH;
          text(ctx, pd[2], STEP_X / 2, y + STEP_RH / 2, 8, flash[m] > 0 ? pd[3] : "#dfe6e9");
          for (s = 0; s < DRUM_STEPS; s++) {
            var x = STEP_X + s * cw, on = drumStepOn(steps, m, s), cur = stepRun && stepRun.s === s;
            ctx.fillStyle = on ? (cur ? "#ffffff" : pd[3]) : (cur ? "#3d4a7a" : (Math.floor(s / 4) % 2 ? "#232845" : "#2c3358"));
            ctx.fillRect(x + 1, y + 2, cw - 2, STEP_RH - 4);
          }
        }
        for (s = 0; s <= 4; s++) { ctx.fillStyle = "rgba(255,255,255,0.25)"; ctx.fillRect(STEP_X + s * 4 * cw - 0.5, STEP_Y, 1, DRUM_ROWS.length * STEP_RH); }
      }
      function drawRhythm(ctx) {
        var n = Math.max(1, chart.lanes.length), lw = W / n, hitY = DRUM_H - 46, t = now(), i;
        for (i = 0; i < n; i++) {
          var pd = drumPad(chart.lanes[i]) || DRUM_PADS[0], on = flash[chart.lanes[i]] > 0;
          ctx.fillStyle = i % 2 ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.07)";
          ctx.fillRect(i * lw, 20, lw, hitY - 20);
          ctx.fillStyle = on ? pd[3] : "#262a45";
          ctx.fillRect(i * lw + 2, hitY + 4, lw - 4, DRUM_H - hitY - 6);
          ctx.strokeStyle = pd[3];
          ctx.strokeRect(i * lw + 2.5, hitY + 4.5, lw - 5, DRUM_H - hitY - 7);
          text(ctx, pd[2], i * lw + lw / 2, hitY + 18, 12, on ? "#14213d" : "#ffffff");
          text(ctx, pd[4], i * lw + lw / 2, hitY + 33, 8, on ? "#14213d" : "#adb5bd");
        }
        for (i = 0; i < rn.length; i++) {
          var nt = rn[i];
          if (nt.j >= 0 || nt.t - t > DRUM_LOOK) { continue; }
          var y = hitY - (nt.t - t) / DRUM_LOOK * (hitY - 20), ln = laneOf(nt.m), pc = drumPad(nt.m);
          if (y > hitY + 10) { continue; }
          ctx.fillStyle = nt.j === -1 ? "rgba(255,118,117,0.5)" : pc[3];
          ctx.fillRect(ln * lw + 6, y - 5, lw - 12, 10);
        }
        ctx.fillStyle = "#ffd166";
        ctx.fillRect(0, hitY - 1, W, 2);
        if (t < DRUM_LEAD) { text(ctx, String(Math.ceil(DRUM_LEAD - t)), W / 2, 90, 28, "#ffffff"); }
        if (judgeFrames > 0) { text(ctx, judgeText, W / 2, 130, 16 + Math.max(0, judgeFrames - 24), judgeText === "MISS" ? "#ff7675" : (judgeText === "PERFECT" ? "#ffd166" : "#55efc4")); }
      }

      return {
        input: function (a, down) {
          if (a.charAt(0) === "d" && /^d\d$/.test(a)) {
            if (down) {
              if (kit) { hitPiece(drumKitPiece(DRUM_KIT_KEYS[Number(a.substring(1))])); }
              else { var pd = DRUM_PADS[Number(a.substring(1))]; if (pd) { hit(pd[0], 0.9); } }
            }
            return;
          }
          if (down && !ended) { action(a); }
        },
        pointer: function (type, x, y) {
          if (type !== "down") { return; }
          if (mode === "free") {
            if (kit) { hitPiece(drumKitAt(x, y, kitBox())); }
            else { var pi = drumPadAt(x, y, Ld); if (pi >= 0) { hit(DRUM_PADS[pi][0], 0.9); } }
          }
          else if (mode === "step") {
            var c = drumCellAt(x, y);
            if (c) { if (drumStepToggle(steps, c.m, c.s)) { hitSound(c.m, 0.8); flash[c.m] = 8; } stepSave(); }
          } else if (chart.lanes.length && y > 20) { hit(chart.lanes[Math.max(0, Math.min(chart.lanes.length - 1, Math.floor(x / (W / chart.lanes.length))))], 0.9); }
        },
        step: function () {
          frame++;
          var k;
          for (k in flash) { if (flash.hasOwnProperty(k) && flash[k] > 0) { flash[k]--; } }
          for (k = flashAt.length - 1; k >= 0; k--) { if (flashAt[k][0] <= frame) { flash[flashAt[k][1]] = 10; flashAt.splice(k, 1); } }
          if (judgeFrames > 0) { judgeFrames--; }
          if (bk) { backStep(); }
          if (play) {
            var pb = play.back ? backBeat() : (now() - play.t0) * play.bpm / 60, bps = play.back ? 1 / back.s.spb : play.bpm / 60;
            // §235: 少し先まで予約して鳴らす（録ったタイミングどおりに）
            while (play.idx < play.notes.length && play.notes[play.idx][0] <= pb + DRUM_PAT_LOOK * bps) { var pn = play.notes[play.idx]; soundAt(pn[1], pn[2], Math.max(0, (pn[0] - pb) / bps)); play.idx++; }
            if (!play.back && play.idx >= play.notes.length) { play = null; render(); }
          }
          if (rec && !rec.back) {
            var rb = Math.floor(recBeat());
            if (rb !== rec.beat && (metro || rb < 0)) { audio(); click(((rb % meter) + meter) % meter === 0); }
            rec.beat = rb;
          }
          if (stepRun) { stepStep(); }
          if (patRun) { patStep(); }
          if (patRun && prac) { pracStep(); }
          if (mode === "rhythm" && !ended) { rhythmStep(); }
        },
        draw: function (ctx) {
          ctx.fillStyle = "#1b1f3b";
          ctx.fillRect(0, 0, W, Ld.h);
          // §231: 生ドラムの読みこみの状態
          var ss = audioOk ? drumSampleState() : "off", sl = ss === "loading" || ss === "decoding" || ss === "none" ? "🎙 生ドラムを読みこみ中…（いまは電子音）" : (ss === "error" ? "🎙 生ドラムを読みこめませんでした（電子音で鳴ります）" : "");
          if (sl) { ctx.fillStyle = "#ffd166"; ctx.font = "7px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(sl, W / 2, Ld.land ? 13 : 20); }
          if (mode === "free") {
            hudText(ctx, "🥁 じゆう", 8, Ld.land ? 7 : 10, "left");
            hudText(ctx, (back ? "🎸 " : "") + "BPM " + bpm, W - 8, Ld.land ? 7 : 10, "right");
            var ty = Ld.land ? 7 : (kit ? 34 : 38);
            if (rec) {
              var rb = recBeat();
              text(ctx, rb < 0 ? String(Math.ceil(-rb)) : "● REC " + (Math.floor(rb / meter) + 1) + "小節・" + rec.notes.length + "打", W / 2, ty, Ld.land ? 9 : (rb < 0 ? 22 : 14), "#ff6b6b");
            } else if (patRun && !play) { drawPat(ctx, ty); }
            else { text(ctx, play ? "再生中…" : (last || (bk ? "伴奏中…" : (kit ? "ドラムを叩こう" : "パッドを叩こう"))), W / 2, ty, Ld.land ? 9 : (last && !play ? 20 : 13), "#ffffff"); }
            if (kit) { drawKit(ctx); } else { drawPads(ctx); }
          } else if (mode === "step") {
            hudText(ctx, "🎛️ ステップ（16マス＝1小節）", 8, 10, "left");
            hudText(ctx, "BPM " + bpm, W - 8, 10, "right");
            drawSteps(ctx);
            text(ctx, "マスをタップしてオン・オフ。▶ でループ再生", W / 2, STEP_Y + DRUM_ROWS.length * STEP_RH + 22, 9, "#adb5bd");
          } else {
            hudText(ctx, "🎮 " + ((drumGroove(song[0]) || {}).name || ""), 8, 10, "left");
            hudText(ctx, combo >= 2 ? combo + " COMBO" : "", W - 8, 10, "right");
            drawRhythm(ctx);
          }
        }
      };
    }
  });

  window.UGDrum = {
    pads: DRUM_PADS, rows: DRUM_ROWS, SEQ_ROWS: DRUM_SEQ_ROWS, songs: DRUM_SONGS, levels: DRUM_LEVELS, grooves: drumGrooves, groove: drumGroove,
    stepsClean: drumStepsClean, stepsFrom: drumStepsFrom, stepOn: drumStepOn, stepToggle: drumStepToggle, toSeqCustom: drumToSeqCustom, toSeqRec: drumToSeqRec,
    backList: drumBackList, backing: drumBacking, backEventOn: drumBackEventOn, sendSteps: drumSendSteps, stepsFromSeq: drumStepsFromSeq,
    kit: DRUM_KIT, kitKeys: DRUM_KIT_KEYS, kitBox: drumKitBox, kitShape: drumKitShape, kitAt: drumKitAt, kitPiece: drumKitPiece, extra: DRUM_EXTRA, pad: drumPad, landH: drumLandH,
    fills: DRUM_FILLS, patternList: drumPatternList, pattern: drumPattern, patternSteps: drumPatternSteps, patPadsLoad: drumPatPadsLoad, PATPAD_DEFAULT: DRUM_PATPAD_DEFAULT, PATPADS_KEY: DRUM_PATPADS_KEY,
    parts: DRUM_PARTS, partOf: drumPartOf, patVel: drumPatVel, patVol: drumPatVol, AUTOFILL: DRUM_AUTOFILL, AUTOFILL_IDS: DRUM_AUTOFILL_IDS, seqParts: drumSeqParts, secKind: drumSecKind, secPattern: drumSecPattern, songFromSeq: drumSongFromSeq, songFit: drumSongFit, takeFromSeq: drumTakeFromSeq, songClean: drumSongClean, songLoad: drumSongLoad, songNotes: drumSongNotes, songSend: drumSongSend, songBars: drumSongBars, quantize: drumQuantize,
    SONG_KEY: DRUM_SONG_KEY, SONG_DEFAULT: DRUM_SONG_DEFAULT, moreLoops: DRUM_MORE_LOOPS, kits: DRUM_KITS, PATPAD_N: DRUM_PATPAD_N,
    swings: DRUM_SWINGS, swingOff: drumSwingOff,
    chart: drumChart, judge: drumJudge, rank: drumRank, padRect: drumPadRect, padAt: drumPadAt, cellAt: drumCellAt, prefs: drumPrefs,
    takesLoad: drumTakesLoad, takesSave: drumTakesSave, patsLoad: drumPatsLoad, patsSave: drumPatsSave, listAdd: drumListAdd, takeClean: drumTakeClean, patClean: drumPatClean,
    H: DRUM_H, TOP: DRUM_TOP, LEAD: DRUM_LEAD, STEPS: DRUM_STEPS, BARS: DRUM_BARS, SPEEDS: DRUM_SPEEDS, JUDGE: DRUM_JUDGE,
    TAKES_KEY: DRUM_TAKES_KEY, PATS_KEY: DRUM_PATS_KEY, PREFS_KEY: DRUM_PREFS_KEY, BEST_KEY: DRUM_BEST_KEY, TAKES_MAX: DRUM_TAKES_MAX, PATS_MAX: DRUM_PATS_MAX
  };
})();
