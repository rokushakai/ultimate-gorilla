// =========================================================
// 究極ゴリラ ゲームセンター: 🎹 ゴリラピアノ（§212）
// arcade.js・arcade-melody.js の後に読み込む。音は window.UGMelody（サンプル）を使う。
// 録音（テイク）はシーケンサーのメロディと同じ [拍, 長さ（拍）, MIDI] の形で保存する（v1.21 でシーケンサーへ送る予定）
// =========================================================
(function () {
  "use strict";

  var I = window.UGArcade && window.UGArcade.internal;
  if (!I) { return; }
  var W = I.W, hudText = I.hudText, emojiAt = I.emojiAt, lsGet = I.lsGet, lsSet = I.lsSet, escHtml = I.escHtml;

  var PIANO_H = 300, PIANO_KB_Y = 170, PIANO_WHITE = 14, PIANO_BLACK_H = 78;
  var PIANO_PREFS_KEY = "ultimateGorillaPianoPrefsV1", PIANO_TAKES_KEY = "ultimateGorillaPianoTakesV1", PIANO_BEST_KEY = "ultimateGorillaPianoBestV1";
  var PIANO_TAKES_MAX = 10, PIANO_NOTES_MAX = 1000, PIANO_SONG_LOW = 60, PIANO_BASE_MIN = 36, PIANO_BASE_MAX = 72;
  var PIANO_LEAD = 2, PIANO_LOOK = 1.6, PIANO_SPEEDS = [70, 85, 100];
  // [ずれ（秒）, 名前, 点]
  var PIANO_JUDGE = [[0.07, "PERFECT", 100], [0.13, "GREAT", 70], [0.2, "GOOD", 40]];
  var PIANO_DO = ["ド", "ド#", "レ", "レ#", "ミ", "ファ", "ファ#", "ソ", "ソ#", "ラ", "ラ#", "シ"];
  var PIANO_CDE = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  var PIANO_VOICES = [[0, "&#x1F3B9; ピアノ"], [4, "&#x1F3B9; エレピ"], [8, "&#x2728; チェレスタ"], [11, "&#x1F514; ビブラフォン"], [12, "&#x1FAB5; マリンバ"], [46, "&#x1F3BC; ハープ"]];
  var PIANO_NAMES = [["do", "ドレミ"], ["cde", "CDE"], ["none", "なし"]];
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
  // 座標 → MIDI（鍵盤の外は -1）。黒鍵が上にあるので先に調べる
  function pianoKeyAt(x, y, base) {
    if (y < PIANO_KB_Y || y > PIANO_H || x < 0 || x > W) { return -1; }
    var ww = W / PIANO_WHITE, m;
    if (y < PIANO_KB_Y + PIANO_BLACK_H) {
      for (m = base; m < base + 24; m++) {
        if (!pianoIsBlack(m)) { continue; }
        var r = pianoKeyRect(m, base);
        if (x >= r.x && x < r.x + r.w) { return m; }
      }
    }
    var wi = Math.max(0, Math.min(PIANO_WHITE - 1, Math.floor(x / ww)));
    return base + Math.floor(wi / 7) * 12 + PIANO_WHITE_PC[wi % 7];
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
      speed: PIANO_SPEEDS.indexOf(Number(p.speed)) >= 0 ? Number(p.speed) : 100,
      bpm: Math.max(40, Math.min(240, Math.round(Number(p.bpm) || 90))),
      metro: p.metro !== false,
      base: base >= PIANO_BASE_MIN && base <= PIANO_BASE_MAX && base % 12 === 0 ? base : PIANO_SONG_LOW
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
      prog: pianoProgOk(Number(t.prog)) ? Number(t.prog) : 0, notes: pianoNotesClean(t.notes)
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
    var take = pianoTakeClean({ id: id + 1, name: t.name || "テイク " + (id + 1), bpm: t.bpm, meter: t.meter, prog: t.prog, notes: t.notes }, 0);
    list.unshift(take);
    if (list.length > PIANO_TAKES_MAX) { list.length = PIANO_TAKES_MAX; }
    return take;
  }
  function pianoTakeById(list, id) { for (var i = 0; i < list.length; i++) { if (list[i].id === id) { return list[i]; } } return null; }
  // シーケンサーの追加トラック（種類 "notes"）にそのまま入れられる音の配列（v1.21 で使う）
  function pianoToSeqNotes(take) { return pianoNotesClean(take && take.notes); }
  function pianoBest() { var o = lsGet(PIANO_BEST_KEY); return o && typeof o === "object" ? o : {}; }

  function pianoSetup(root, ctl) {
    var p = pianoPrefs();
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
      html += '</div>';
      if (p.mode === "free") {
        html += '<button class="modal-btn" data-go="1" style="width:100%;margin-top:8px;">&#x1F3B9; はじめる</button>';
        html += '<p class="small" style="margin:10px 0 2px;">&#x1F399;&#xFE0F; 録音したテイク（' + takes.length + ' / ' + PIANO_TAKES_MAX + '）</p>';
        if (!takes.length) { html += '<p class="small" style="color:#adb5bd;margin:0;">まだありません。じゆうに弾く画面の「🔴 録音」で録れます。</p>'; }
        for (i = 0; i < takes.length; i++) {
          html += '<div class="piano-take"><span>' + escHtml(takes[i].name) + '<br><span class="small" style="color:#adb5bd;">' + takes[i].notes.length + '音・BPM ' + takes[i].bpm + '</span></span>' +
            '<button class="modal-btn" data-open="' + takes[i].id + '">&#x25B6;&#xFE0F; ひらく</button>' +
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
          if ((v = el.getAttribute("data-speed"))) { p.speed = Number(v); pianoSavePrefs(p); draw(); return; }
          if ((v = el.getAttribute("data-del"))) {
            var list = pianoTakesLoad(), t = pianoTakeById(list, Number(v));
            if (!t || (window.confirm && !window.confirm("「" + t.name + "」を消しますか？"))) { return; }
            list.splice(list.indexOf(t), 1);
            pianoTakesSave(list);
            draw();
            return;
          }
          if (el.getAttribute("data-back")) { ctl.back(); return; }
          if (el.getAttribute("data-go")) { ctl.done({ mode: "free" }); return; }
          if ((v = el.getAttribute("data-open"))) { ctl.done({ mode: "free", take: Number(v) }); return; }
          if ((v = el.getAttribute("data-song"))) { ctl.done({ mode: p.mode, song: v, speed: p.speed }); }
        };
      }
    }
    draw();
  }

  // PC のキー → 鍵盤（左の C から 0, 1, 2…）
  var PIANO_KEYS = { a: "k0", w: "k1", s: "k2", e: "k3", d: "k4", f: "k5", t: "k6", g: "k7", y: "k8", h: "k9", u: "k10", j: "k11", k: "k12", o: "k13", l: "k14",
    z: "octdown", x: "octup", r: "rec", v: "play" };

  I.register({
    id: "piano",
    after: "ukulele",
    cat: "music",
    music: true,
    name: "ゴリラピアノ",
    icon: "&#x1F3B9;",
    desc: "鍵盤で自由に弾いて録音・光る鍵盤でれんしゅう・落ちてくる音符のリズムゲーム",
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
      var panel = api.panel;
      api.setCanvasHeight(PIANO_H);
      if (panel && panel.classList) { panel.classList.add("quiz-panel"); }
      function now() { return frame / 60; }

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
      if (take) { msg = "「" + take.name + "」をひらきました。▶ 再生で聴けます"; }
      function recBeat() { return rec ? (now() - rec.t0) * bpm / 60 : 0; }
      function r3(v) { return Math.round(v * 1000) / 1000; }
      function recToggle() {
        if (mode !== "free") { return; }
        if (rec) { recStop(); return; }
        playStop();
        audio();
        rec = { t0: now() + meter * 60 / bpm, notes: [], open: {}, beat: -meter - 1 };
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
        var ks = [], k;
        for (k in rec.open) { if (rec.open.hasOwnProperty(k)) { ks.push(k); } }
        for (k = 0; k < ks.length; k++) { recOff(ks[k]); }
        var n = rec.notes;
        rec = null;
        if (n.length) {
          take = pianoTakeAdd(takes, { bpm: bpm, meter: meter, prog: prog, notes: n });
          pianoTakesSave(takes);
          msg = "&#x1F4BE; 「" + take.name + "」に保存しました（" + take.notes.length + "音）";
        } else {
          msg = "音がなかったので保存しませんでした";
        }
        render();
      }
      // 再生（お手本も同じ）: 毎フレーム、時間が来た音を鳴らす
      function playStart(ns, pbpm) { play = { t0: now() + 0.1, notes: ns, bpm: pbpm, idx: 0 }; audio(); render(); }
      function playStop() { if (play) { play = null; render(); } }
      function playBeat() { return play ? (now() - play.t0) * play.bpm / 60 : 0; }
      function playToggle() {
        if (play) { playStop(); return; }
        if (mode === "free") {
          if (rec) { return; }
          if (!take || !take.notes.length) { msg = "まだテイクがありません。🔴 録音してみよう"; render(); return; }
          playStart(take.notes, take.bpm);
        } else if (mode === "practice") {
          pi = 0; missHere = false;
          playStart(notes, song.bpm);
        }
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
        else if (v === "restart" && mode === "practice") { playStop(); pi = 0; missHere = false; render(); }
        else if (v === "metro") { metro = !metro; prefs.metro = metro; pianoSavePrefs(prefs); render(); }
        else if (v === "bpmdown" || v === "bpmup") {
          if (rec) { return; }
          bpm = Math.max(40, Math.min(240, bpm + (v === "bpmup" ? 5 : -5)));
          prefs.bpm = bpm;
          pianoSavePrefs(prefs);
          render();
        }
      }

      function render() {
        if (!panel) { return; }
        var html = "";
        if (mode === "free") {
          html += '<div class="piano-row"><button class="modal-btn" data-pa="octdown">&#x25C0; 低く</button><span>' + pianoName(base, "cde") + '〜' + pianoName(base + 23, "cde") + '</span>' +
            '<button class="modal-btn" data-pa="octup">高く &#x25B6;</button></div>' +
            '<div class="piano-row"><button class="modal-btn' + (rec ? " piano-rec-on" : "") + '" data-pa="rec">' + (rec ? "&#x23F9;&#xFE0F; 録音をとめる" : "&#x1F534; 録音") + '</button>' +
            '<button class="modal-btn" data-pa="play"' + (rec ? " disabled" : "") + '>' + (play ? "&#x23F9;&#xFE0F; とめる" : "&#x25B6;&#xFE0F; 再生") + '</button></div>' +
            '<div class="piano-row"><button class="modal-btn" data-pa="bpmdown">&minus;</button><span>BPM ' + bpm + '</span><button class="modal-btn" data-pa="bpmup">&#xFF0B;</button>' +
            '<button class="modal-btn" data-pa="metro">&#x1F941; ' + (metro ? "ON" : "OFF") + '</button></div>';
          if (take && !rec) { html += '<p class="small" style="margin:4px 0 0;">いまのテイク: ' + escHtml(take.name) + '（' + take.notes.length + '音・BPM ' + take.bpm + '）</p>'; }
        } else if (mode === "practice") {
          html += '<div class="piano-row"><button class="modal-btn" data-pa="play"' + (ended ? " disabled" : "") + '>' + (play ? "&#x23F9;&#xFE0F; とめる" : "&#x1F50A; お手本") + '</button>' +
            '<button class="modal-btn" data-pa="restart"' + (ended ? " disabled" : "") + '>&#x21BA; はじめから</button></div>' +
            '<p class="small" style="margin:4px 0 0;">' + escHtml(song.name) + '・' + Math.min(pi, notes.length) + ' / ' + notes.length + '音・ミス ' + miss + '</p>';
        } else {
          html += '<p class="small" style="margin:0;">' + escHtml(song.name) + '（速さ ' + Math.round(rate * 100) + '%）・' + rn.length + '音</p>';
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
        for (k in press) { if (press.hasOwnProperty(k)) { out[press[k]] = "press"; } }
        return out;
      }
      function drawKeys(ctx) {
        var lit = litKeys(), m, r, top = PIANO_KB_Y, col;
        var white = { press: "#ffd166", next: "#55efc4", play: "#74c0fc" }, black = { press: "#e0a800", next: "#1e9e6a", play: "#2f7dd1" };
        for (m = base; m < base + 24; m++) {
          if (pianoIsBlack(m)) { continue; }
          r = pianoKeyRect(m, base);
          ctx.fillStyle = white[lit[m]] || "#fdfdfd";
          ctx.fillRect(r.x + 0.5, top, r.w - 1, PIANO_H - top);
          ctx.strokeStyle = "#555";
          ctx.strokeRect(r.x + 0.5, top, r.w - 1, PIANO_H - top);
          var nm = pianoName(m, names);
          if (nm) {
            ctx.fillStyle = pianoPc(m) === 0 ? "#c0392b" : "#555";
            ctx.font = (nm.length > 2 ? 7 : 8) + "px sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(nm, r.x + r.w / 2, PIANO_H - 9);
          }
        }
        for (m = base; m < base + 24; m++) {
          if (!pianoIsBlack(m)) { continue; }
          r = pianoKeyRect(m, base);
          col = black[lit[m]] || "#222";
          ctx.fillStyle = col;
          ctx.fillRect(r.x, top, r.w, PIANO_BLACK_H);
        }
      }

      return {
        input: function (a, down) {
          if (a.charAt(0) === "k") {
            var id = "key" + a.substring(1);
            if (down) { noteOn(id, base + Number(a.substring(1))); } else { noteOff(id); }
            return;
          }
          if (down && !ended) { action(a); }
        },
        pointer: function (type, x, y, id) {
          if (type === "down") { noteOn(id, pianoKeyAt(x, y, base)); }
          else if (type === "move") {
            if (press[id] === undefined) { return; }
            var m = pianoKeyAt(x, y, base);
            if (m >= 0 && m !== press[id]) { noteOn(id, m); }
          } else { noteOff(id); }
        },
        step: function () {
          frame++;
          if (shake > 0) { shake--; }
          if (judgeFrames > 0) { judgeFrames--; }
          if (play) {
            var pb = playBeat(), last = 0, i;
            while (play.idx < play.notes.length && play.notes[play.idx][0] <= pb) { sound(play.notes[play.idx][2], 0.8); play.idx++; }
            for (i = 0; i < play.notes.length; i++) { last = Math.max(last, play.notes[i][0] + play.notes[i][1]); }
            if (play.idx >= play.notes.length && pb > last) { play = null; render(); }
          }
          if (rec && metro) {
            var rb = Math.floor(recBeat());
            if (rb !== rec.beat) { rec.beat = rb; click(((rb % meter) + meter) % meter === 0); }
          } else if (rec) {
            var rb2 = Math.floor(recBeat());
            if (rb2 < 0 && rb2 !== rec.beat) { rec.beat = rb2; click(((rb2 % meter) + meter) % meter === 0); }
          }
          if (mode === "rhythm" && !ended) { rhythmStep(); }
        },
        draw: function (ctx) {
          var g = ctx.createLinearGradient ? ctx.createLinearGradient(0, 0, 0, PIANO_KB_Y) : null;
          if (g) { g.addColorStop(0, "#1b1f3b"); g.addColorStop(1, "#2d1b4e"); }
          ctx.fillStyle = g || "#1b263b";
          ctx.fillRect(0, 0, W, PIANO_KB_Y);
          var i, sx = shake ? (shake % 2 ? 3 : -3) : 0;
          if (mode === "free") {
            hudText(ctx, "🎹 " + pianoName(base, "cde") + "〜" + pianoName(base + 23, "cde"), 8, 10, "left");
            hudText(ctx, "BPM " + bpm, W - 8, 10, "right");
            if (rec) {
              var rb = recBeat();
              ctx.fillStyle = "#ff6b6b";
              ctx.font = "bold 20px sans-serif";
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillText(rb < 0 ? String(Math.ceil(-rb)) : "● REC", W / 2, 60);
              ctx.fillStyle = "#ffffff";
              ctx.font = "12px sans-serif";
              ctx.fillText(rb < 0 ? "カウントのあとに弾いてね" : (Math.floor(rb / meter) + 1) + "小節目・" + rec.notes.length + "音", W / 2, 90);
            } else {
              emojiAt(ctx, play ? "🎶" : "🦍", W / 2, 60, 40);
              var held = [], k;
              for (k in press) { if (press.hasOwnProperty(k) && held.indexOf(press[k]) < 0) { held.push(press[k]); } }
              held.sort(function (a, b) { return a - b; });
              ctx.fillStyle = "#ffffff";
              ctx.font = "bold 14px sans-serif";
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillText(held.length ? held.map(function (m) { return pianoName(m, names === "none" ? "do" : names); }).join(" ") : (play ? "再生中…" : "鍵盤をタップして弾こう"), W / 2, 112);
            }
          } else if (mode === "practice") {
            hudText(ctx, "📖 " + song.name, 8, 10, "left");
            hudText(ctx, "ミス " + miss, W - 8, 10, "right");
            // これから弾く音
            for (i = 0; i < 6 && pi + i < notes.length; i++) {
              var cx = 40 + i * 34 + (i === 0 ? sx : 0), big = i === 0 && !play;
              ctx.fillStyle = big ? "#55efc4" : "rgba(255,255,255,0.15)";
              ctx.beginPath();
              ctx.arc(cx, 70, big ? 18 : 13, 0, Math.PI * 2);
              ctx.fill();
              ctx.fillStyle = big ? "#14213d" : "#ffffff";
              ctx.font = "bold " + (big ? 12 : 10) + "px sans-serif";
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillText(pianoName(notes[pi + i][2], names === "none" ? "do" : names), cx, 70);
            }
            ctx.fillStyle = "rgba(255,255,255,0.15)";
            ctx.fillRect(10, 120, W - 20, 6);
            ctx.fillStyle = "#55efc4";
            ctx.fillRect(10, 120, (W - 20) * (notes.length ? Math.min(pi, notes.length) / notes.length : 0), 6);
            ctx.fillStyle = "#ffffff";
            ctx.font = "11px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(play ? "お手本を聴いてね（青く光る鍵盤）" : (ended ? "おしまい！" : "緑に光る鍵盤を押そう"), W / 2, 145);
          } else {
            hudText(ctx, "🎮 " + song.name, 8, 10, "left");
            hudText(ctx, combo >= 2 ? combo + " COMBO" : "", W - 8, 10, "right");
            var t = now();
            for (i = 0; i < rn.length; i++) {
              var n = rn[i];
              if (n.j >= 0 || n.t - t > PIANO_LOOK) { continue; }
              var y = PIANO_KB_Y - (n.t - t) / PIANO_LOOK * (PIANO_KB_Y - 20), h = Math.max(8, n.d / PIANO_LOOK * (PIANO_KB_Y - 20) * 0.8), r = pianoKeyRect(n.m, base);
              if (y - h > PIANO_KB_Y) { continue; }
              ctx.fillStyle = n.j === -1 ? "rgba(255,118,117,0.5)" : (pianoIsBlack(n.m) ? "#a29bfe" : "#55efc4");
              ctx.fillRect(r.x + 1, y - h, r.w - 2, h);
            }
            ctx.fillStyle = "#ffd166";
            ctx.fillRect(0, PIANO_KB_Y - 2, W, 2);
            if (t < PIANO_LEAD) {
              ctx.fillStyle = "#ffffff";
              ctx.font = "bold 28px sans-serif";
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillText(String(Math.ceil(PIANO_LEAD - t)), W / 2, 70);
            }
            if (judgeFrames > 0) {
              ctx.fillStyle = judgeText === "MISS" ? "#ff7675" : (judgeText === "PERFECT" ? "#ffd166" : "#55efc4");
              ctx.font = "bold " + (16 + Math.max(0, judgeFrames - 24)) + "px sans-serif";
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillText(judgeText, W / 2, 120);
            }
          }
          drawKeys(ctx);
        }
      };
    }
  });

  window.UGPiano = {
    songs: PIANO_SONGS, song: pianoSong, parse: pianoParse, midiOf: pianoMidi, name: pianoName, isBlack: pianoIsBlack,
    keyAt: pianoKeyAt, keyRect: pianoKeyRect, judge: pianoJudge, rank: pianoRank, prefs: pianoPrefs,
    takesLoad: pianoTakesLoad, takesSave: pianoTakesSave, takeAdd: pianoTakeAdd, takeById: pianoTakeById, notesClean: pianoNotesClean, toSeqNotes: pianoToSeqNotes,
    JUDGE: PIANO_JUDGE, SPEEDS: PIANO_SPEEDS, VOICES: PIANO_VOICES, KEYS: PIANO_KEYS, LEAD: PIANO_LEAD, H: PIANO_H, KB_Y: PIANO_KB_Y, SONG_LOW: PIANO_SONG_LOW,
    TAKES_KEY: PIANO_TAKES_KEY, TAKES_MAX: PIANO_TAKES_MAX, BEST_KEY: PIANO_BEST_KEY, PREFS_KEY: PIANO_PREFS_KEY
  };
})();
