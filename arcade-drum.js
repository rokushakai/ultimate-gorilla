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
  function drumPatClean(p, i) { return { id: Math.max(1, Math.round(Number(p.id)) || i + 1), name: String(p.name || "リズム").slice(0, 16), bpm: Math.max(40, Math.min(240, Math.round(Number(p.bpm) || 100))), steps: drumStepsClean(p.steps) }; }
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
      kitId: p.kitId === "virtuosity" ? "virtuosity" : "drs", deep: !!p.deep // §230: 生ドラムのセット・キックを太く
    };
  }
  function drumSavePrefs(p) { return lsSet(DRUM_PREFS_KEY, p); }

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
    return !(noDrum && ev.track === "drum");
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
      html += '</div><p class="small" style="margin:4px 0 2px;">音色</p><div class="quiz-opts">' +
        '<button class="modal-btn quiz-opt' + (p.real && p.kitId === "drs" ? " active" : "") + '" data-kit="drs">&#x1F941; ロック</button>' +
        '<button class="modal-btn quiz-opt' + (p.real && p.kitId === "virtuosity" ? " active" : "") + '" data-kit="virtuosity">&#x1F3B7; ジャズ</button>' +
        '<button class="modal-btn quiz-opt' + (!p.real ? " active" : "") + '" data-real="0">&#x1F39B;&#xFE0F; 電子</button></div>' +
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
          html += '<div class="piano-take"><span>' + escHtml(pats[i].name) + '<br><span class="small" style="color:#adb5bd;">BPM ' + pats[i].bpm + '</span></span>' +
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
          if ((v = el.getAttribute("data-kit"))) { p.real = true; p.kitId = v; drumSavePrefs(p); draw(); return; }
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
      function hitSound(m, lv) {
        audio();
        if (!audioOk) { return; }
        if (prefs.real && drumSampleState() !== "ready" && UG.loadSamples) {
          try { if (UG.setDrumKit) { UG.setDrumKit(prefs.kitId); } UG.loadSamples([UG.DRUM]); } catch (e0) {}
        }
        try { UG.synth(m, UG.DRUM, 0, lv || 0.9); } catch (e) {}
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
      var stepRun = null; // { f0, s: いま鳴らした列 }
      function stepSave() { prefs.steps = steps; drumSavePrefs(prefs); }
      function stepToggle() {
        if (stepRun) { stepRun = null; } else { audio(); stepRun = { f0: frame, s: -1 }; }
        render();
      }
      function stepStep() {
        var t = (frame - stepRun.f0) / 60, s = Math.floor(t * bpm / 60 * 4) % DRUM_STEPS;
        if (s === stepRun.s) { return; }
        stepRun.s = s;
        for (var i = 0; i < steps.length; i++) { if (steps[i][1].indexOf(s) >= 0) { hitSound(steps[i][0], 0.85); flash[steps[i][0]] = 8; } }
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
      function hit(m, lv) {
        if (ended || !drumPad(m)) { return; }
        hitSound(m, lv || 0.9);
        flash[m] = 10;
        last = drumName(m);
        if (mode === "free" && rec) {
          var b = recBeat();
          if (b >= -0.25 && rec.notes.length < DRUM_NOTES_MAX) { rec.notes.push([r3(Math.max(0, b)), m, lv || 0.9]); }
        } else if (mode === "rhythm") { rhythmHit(m); }
      }
      function action(v) {
        if (v === "rec") { recToggle(); } else if (v === "play") { playToggle(); }
        else if (v === "back") { backToggle(); }
        else if (v === "kit") { kit = !kit; prefs.kit = kit; drumSavePrefs(prefs); render(); }
        else if (v === "pedal") { if (kit) { hhOpen = !hhOpen; render(); } }
        else if (v === "dbg") { render(); }
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
        else if (v === "save") {
          var nm = panel && panel.querySelector ? panel.querySelector("[data-dname]") : null, list = drumPatsLoad();
          var it = drumListAdd(list, { name: nm && nm.value ? String(nm.value).trim().slice(0, 16) : "", bpm: bpm, steps: steps }, DRUM_PATS_MAX, drumPatClean, "リズム");
          drumPatsSave(list);
          msg = "&#x1F4BE; 「" + escHtml(it.name) + "」を保存しました";
          render();
        }
      }

      function render() {
        if (!panel) { return; }
        var h = "", i;
        if (mode === "free") {
          h += '<div class="piano-row"><button class="modal-btn' + (rec ? " piano-rec-on" : "") + '" data-da="rec">' + (rec ? "&#x23F9;&#xFE0F; 録音をとめる" : (back ? "&#x1F534; 合わせて録音" : "&#x1F534; 録音")) + '</button>' +
            '<button class="modal-btn" data-da="play"' + (rec ? " disabled" : "") + '>' + (play ? "&#x23F9;&#xFE0F; とめる" : (back ? "&#x25B6;&#xFE0F; テイク＋伴奏" : "&#x25B6;&#xFE0F; 再生")) + '</button></div>';
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
            '<div class="piano-row"><input type="text" class="drum-name" data-dname="1" maxlength="16" placeholder="名前（なくてもOK）"><button class="modal-btn" data-da="save">&#x1F4BE; 保存</button></div>';
        } else {
          h += '<p class="small" style="margin:0;">' + escHtml((drumGroove(song[0]) || { name: song[0] }).name) + '（' + (level === "easy" ? "かんたん" : (level === "normal" ? "ふつう" : "むずかしい")) + '・速さ ' + Math.round(rate * 100) + '%）・' + rn.length + '打</p>';
        }
        if (mode === "free") {
          h += '<div class="piano-row"><button class="modal-btn' + (kit ? " piano-pad-on" : "") + '" data-da="kit">' + (kit ? "&#x1F39B;&#xFE0F; パッドにする" : "&#x1F941; ドラムセットにする") + '</button>' +
            (kit ? '<button class="modal-btn' + (hhOpen ? " piano-pad-on" : "") + '" data-da="pedal">&#x1F9B6; ハイハット ' + (hhOpen ? "開いている" : "閉じている") + '</button>' : "") + '</div>' +
            '<div class="piano-row"><button class="modal-btn" data-da="land">' + (landOn ? "&#x1F4F1; たて向きにもどす" : "&#x2194;&#xFE0F; よこ向き（大きく）") + '</button></div>';
        }
        if (mode !== "rhythm" && !back) {
          h += '<div class="piano-row"><button class="modal-btn" data-da="bpmdown">&minus;</button><span>BPM ' + bpm + '</span><button class="modal-btn" data-da="bpmup">&#xFF0B;</button>' +
            (mode === "free" ? '<button class="modal-btn" data-da="metro">&#x1F941; ' + (metro ? "ON" : "OFF") + '</button>' : "") + '</div>';
        }
        if (msg) { h += '<p class="small" style="margin:4px 0 0;color:#ffd166;">' + msg + '</p>'; }
        if (DRUM_DEBUG && mode !== "rhythm") { h += '<div class="piano-row"><button class="modal-btn" data-da="dbgreload">&#x1F527; 生ドラムを読みなおす</button><button class="modal-btn" data-da="dbg">&#x1F527; 状態を更新</button></div><pre class="drum-dbg">' + escHtml(drumDebugText()).split(" ｜ ").join("<br>") + '</pre>'; }
        panel.innerHTML = h;
        if (!panel.querySelectorAll) { return; }
        var bs = panel.querySelectorAll("button[data-da]");
        for (i = 0; i < bs.length; i++) { bs[i].onclick = function (ev) { if (ev.currentTarget.blur) { ev.currentTarget.blur(); } action(ev.currentTarget.getAttribute("data-da")); }; }
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
          if (judgeFrames > 0) { judgeFrames--; }
          if (bk) { backStep(); }
          if (play) {
            var pb = play.back ? backBeat() : (now() - play.t0) * play.bpm / 60;
            while (play.idx < play.notes.length && play.notes[play.idx][0] <= pb) { var pn = play.notes[play.idx]; hitSound(pn[1], pn[2]); flash[pn[1]] = 8; play.idx++; }
            if (!play.back && play.idx >= play.notes.length) { play = null; render(); }
          }
          if (rec && !rec.back) {
            var rb = Math.floor(recBeat());
            if (rb !== rec.beat && (metro || rb < 0)) { audio(); click(((rb % meter) + meter) % meter === 0); }
            rec.beat = rb;
          }
          if (stepRun) { stepStep(); }
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
            } else { text(ctx, play ? "再生中…" : (last || (bk ? "伴奏中…" : (kit ? "ドラムを叩こう" : "パッドを叩こう"))), W / 2, ty, Ld.land ? 9 : (last && !play ? 20 : 13), "#ffffff"); }
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
    chart: drumChart, judge: drumJudge, rank: drumRank, padRect: drumPadRect, padAt: drumPadAt, cellAt: drumCellAt, prefs: drumPrefs,
    takesLoad: drumTakesLoad, takesSave: drumTakesSave, patsLoad: drumPatsLoad, patsSave: drumPatsSave, listAdd: drumListAdd, takeClean: drumTakeClean, patClean: drumPatClean,
    H: DRUM_H, TOP: DRUM_TOP, LEAD: DRUM_LEAD, STEPS: DRUM_STEPS, BARS: DRUM_BARS, SPEEDS: DRUM_SPEEDS, JUDGE: DRUM_JUDGE,
    TAKES_KEY: DRUM_TAKES_KEY, PATS_KEY: DRUM_PATS_KEY, PREFS_KEY: DRUM_PREFS_KEY, BEST_KEY: DRUM_BEST_KEY, TAKES_MAX: DRUM_TAKES_MAX, PATS_MAX: DRUM_PATS_MAX
  };
})();
