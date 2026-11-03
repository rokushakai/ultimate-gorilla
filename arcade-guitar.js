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
  // 音色 [id, 名前, サンプルの音色, アンプ, シーケンサーへ送るときの音色]
  var GTR_VOICES = [
    ["nylon", "&#x1FA95; ナイロン", 24, "", 24], ["steel", "&#x1F3B8; スチール", 25, "", 25],
    ["clean", "&#x26A1; クリーン", 25, "clean", 27], ["crunch", "&#x1F525; クランチ", 25, "crunch", 29], ["dist", "&#x1F918; ディストーション", 25, "dist", 30]
  ];
  // アンプ [ハイパス, 入力の大きさ, ゆがみ, ローパス, 出力の大きさ]
  var GTR_AMPS = { clean: [90, 1, false, 6000, 1], crunch: [90, 8, true, 4500, 0.3], dist: [90, 30, true, 3600, 0.15] };
  function gtrOpt(list, id) { for (var i = 0; i < list.length; i++) { if (list[i][0] === id) { return list[i]; } } return list[0]; }

  // ---------- 単音の画面（上が1弦）----------
  var GTR_COLS = 8, GTR_POS_MAX = 12, GTR_BOARD_X = 4, GTR_BOARD_Y = 96;
  var GTR_MARKS = [3, 5, 7, 9, 12, 15, 17, 19, 21];
  function gtrColW() { return (W - GTR_BOARD_X * 2) / GTR_COLS; }
  function gtrRowH() { return (GTR_H - GTR_BOARD_Y - 6) / 6; }
  // 行 r（0 ＝ 1弦）・列 c の四角
  function gtrCellRect(r, c) { var cw = gtrColW(), rh = gtrRowH(); return { x: GTR_BOARD_X + c * cw, y: GTR_BOARD_Y + r * rh, w: cw, h: rh }; }
  // 座標 → { r: 行, sn: 弦の番号, c: 列, f: フレット, m: MIDI }（外なら null）
  function gtrCellAt(x, y, pos) {
    var cw = gtrColW(), rh = gtrRowH(), c = Math.floor((x - GTR_BOARD_X) / cw), r = Math.floor((y - GTR_BOARD_Y) / rh);
    if (c < 0 || c >= GTR_COLS || r < 0 || r >= 6 || y < GTR_BOARD_Y) { return null; }
    var sn = 5 - r;
    return { r: r, sn: sn, c: c, f: pos + c, m: GTR_OPEN[sn] + pos + c };
  }
  function gtrPc(m) { return ((m % 12) + 12) % 12; }
  function gtrName(m, names) {
    if (names === "none") { return ""; }
    return names === "cde" ? GTR_CDE[gtrPc(m)] + (Math.floor(m / 12) - 1) : GTR_DO[gtrPc(m)];
  }

  // ---------- ストロークの画面（上が6弦）----------
  var GTR_CHORD_Y = 24, GTR_CHORD_H = 34, GTR_STRUM_Y = 72;
  function gtrChordRect(i) { var w = (W - 8) / 7; return { x: 4 + i * w + 1, y: GTR_CHORD_Y, w: w - 2, h: GTR_CHORD_H }; }
  function gtrChordAt(x, y) { for (var i = 0; i < 7; i++) { var r = gtrChordRect(i); if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) { return i; } } return -1; }
  function gtrStrumRowH() { return (GTR_H - GTR_STRUM_Y - 8) / 6; }
  // 弦 sn（0 ＝ 6弦 が上）の線の高さ
  function gtrStrumLineY(sn) { return GTR_STRUM_Y + (sn + 0.5) * gtrStrumRowH(); }
  // 高さ y の弦（線にいちばん近い弦。外なら -1）
  function gtrStrumAt(y) { if (y < GTR_STRUM_Y || y >= GTR_H - 8) { return -1; } return Math.max(0, Math.min(5, Math.floor((y - GTR_STRUM_Y) / gtrStrumRowH()))); }
  // y0 → y1 で指がまたいだ弦（またいだ順）
  function gtrStrumCross(y0, y1) {
    var out = [], sn;
    if (y1 > y0) { for (sn = 0; sn < 6; sn++) { var a = gtrStrumLineY(sn); if (a > y0 && a <= y1) { out.push(sn); } } }
    else if (y1 < y0) { for (sn = 5; sn >= 0; sn--) { var b = gtrStrumLineY(sn); if (b < y0 && b >= y1) { out.push(sn); } } }
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
    m7b5: [0, null, 0, 0, -1, null], dim: [0, 1, 2, 0, null, null], dim7: [0, null, -1, 0, -1, null], aug: [0, null, 2, 1, 1, null], mM7: [0, null, 1, 0, 0, null]
  };
  var GTR_ASHAPE = {
    maj: [null, 0, 2, 2, 2, 0], m: [null, 0, 2, 2, 1, 0], "7": [null, 0, 2, 0, 2, 0], M7: [null, 0, 2, 1, 2, 0], m7: [null, 0, 2, 0, 1, 0],
    m7b5: [null, 0, 1, 0, 1, null], dim: [null, 0, 1, 2, 1, null], dim7: [null, 0, 1, -1, 1, null], aug: [null, 0, 3, 2, 2, null], mM7: [null, 0, 2, 1, 1, null]
  };
  // よく使う開放のコード（"ルートの音名番号:種類"）
  var GTR_OPEN_SHAPES = {
    "0:maj": [null, 3, 2, 0, 1, 0], "0:7": [null, 3, 2, 3, 1, 0], "0:M7": [null, 3, 2, 0, 0, 0],
    "2:maj": [null, null, 0, 2, 3, 2], "2:m": [null, null, 0, 2, 3, 1], "2:7": [null, null, 0, 2, 1, 2], "2:M7": [null, null, 0, 2, 2, 2], "2:m7": [null, null, 0, 2, 1, 1],
    "7:maj": [3, 2, 0, 0, 0, 3], "7:7": [3, 2, 0, 0, 0, 1], "7:M7": [3, null, 0, 0, 0, 2], "5:M7": [null, null, 3, 2, 1, 0], "11:7": [null, 2, 1, 2, 0, 2]
  };
  function gtrBarre(tbl, q, r) {
    var sh = tbl[q] || tbl.maj, low = Math.min.apply(null, sh.filter(function (v) { return v !== null; }));
    if (r + low < 0) { r += 12; }
    return { r: r, frets: sh.map(function (v) { return v === null ? null : r + v; }) };
  }
  // コード（ゴリラベースの chord）→ { frets: [6弦 → 1弦], midis: [同じ順。鳴らさない弦は null], q }
  function gtrShape(ch, sev) {
    var pc = gtrPc(ch.root), q = gtrQuality(ch, sev), fr = GTR_OPEN_SHAPES[pc + ":" + q];
    if (!fr) {
      var e = gtrBarre(GTR_ESHAPE, q, (pc - 4 + 12) % 12), a = gtrBarre(GTR_ASHAPE, q, (pc - 9 + 12) % 12);
      fr = (a.r < e.r ? a : e).frets;
    }
    return { frets: fr, midis: fr.map(function (f, sn) { return f === null ? null : GTR_OPEN[sn] + f; }), q: q };
  }

  // ---------- 音の出口（音色ごと。エレキはアンプを通す）----------
  function gtrCurve(drive) {
    var n = 1024, c = typeof Float32Array !== "undefined" ? new Float32Array(n) : [], top = (Math.exp(2 * drive) - 1) / (Math.exp(2 * drive) + 1), i;
    for (i = 0; i < n; i++) { var e = Math.exp(2 * drive * (i * 2 / (n - 1) - 1)); c[i] = (e - 1) / (e + 1) / top; }
    return c;
  }
  var gtrCurveCache = null;
  // st: ゲームごとの入れもの、voice: 音色の id、vol: 0〜150（%）→ 入り口の GainNode（音が出せなければ null）
  function gtrBus(st, voice, vol) {
    var A = window.UGMelody && window.UGMelody.audio, ac = A && A.ctx, to = A ? (A.bus || A.master) : null, k = "g:" + voice, b = st[k];
    if (!ac || !to || !ac.createGain) { return null; }
    if (!b || b.ac !== ac || b.to !== to) {
      var amp = GTR_AMPS[gtrOpt(GTR_VOICES, voice)[3]], g = ac.createGain();
      b = st[k] = { ac: ac, to: to, g: g };
      if (amp && ac.createBiquadFilter) {
        var hp = ac.createBiquadFilter(), pre = ac.createGain(), lp = ac.createBiquadFilter(), out = ac.createGain(), node = pre;
        hp.type = "highpass"; hp.frequency.value = amp[0];
        pre.gain.value = amp[1];
        lp.type = "lowpass"; lp.frequency.value = amp[3];
        out.gain.value = amp[4];
        g.connect(hp); hp.connect(pre);
        if (amp[2] && ac.createWaveShaper) { var ws = ac.createWaveShaper(); ws.curve = gtrCurveCache || (gtrCurveCache = gtrCurve(3)); pre.connect(ws); node = ws; }
        node.connect(lp); lp.connect(out); out.connect(to);
      } else { g.connect(to); }
    }
    b.g.gain.value = vol / 100;
    return b.g;
  }

  // ---------- 設定・テイク ----------
  function gtrPrefs() {
    var p = lsGet(GTR_PREFS_KEY) || {}, pos = Math.round(Number(p.pos)), key = Math.round(Number(p.key)), B = BA();
    return {
      view: p.view === "chord" ? "chord" : "fret", voice: gtrOpt(GTR_VOICES, p.voice)[0],
      names: p.names === "cde" || p.names === "none" ? p.names : "do",
      pos: pos >= 0 && pos <= GTR_POS_MAX ? pos : 0, key: key >= 0 && key <= 11 ? key : 0,
      scale: B ? B.scale(p.scale)[0] : "major", sev: !!p.sev, tab: p.tab === "key" ? "key" : "play",
      bpm: Math.max(40, Math.min(240, Math.round(Number(p.bpm) || 100))), metro: p.metro !== false
    };
  }
  function gtrSavePrefs(p) { return lsSet(GTR_PREFS_KEY, p); }
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

  // ---------- はじめの画面 ----------
  function gtrSetup(root, ctl) {
    var p = gtrPrefs();
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
        '<p class="small" style="margin:4px 0 2px;">音名</p><div class="quiz-opts">' + opts(GTR_NAMES, p.names, "names") + '</div>' +
        '<button class="modal-btn" data-go="1" style="width:100%;margin-top:8px;">&#x1F918; はじめる</button>' +
        '<p class="small" style="margin:10px 0 2px;">&#x1F399;&#xFE0F; 録音したテイク（' + takes.length + ' / ' + GTR_TAKES_MAX + '）</p>';
      if (!takes.length) { html += '<p class="small" style="color:#adb5bd;margin:0;">まだありません。弾く画面の「🔴 録音」で録れます。</p>'; }
      for (i = 0; i < takes.length; i++) {
        html += '<div class="piano-take"><span>' + escHtml(takes[i].name) + '<br><span class="small" style="color:#adb5bd;">' + takes[i].notes.length + '音・BPM ' + takes[i].bpm + '・' + gtrOpt(GTR_VOICES, takes[i].voice)[1] + '</span></span>' +
          '<button class="modal-btn" data-open="' + takes[i].id + '">&#x25B6;&#xFE0F; ひらく</button>' +
          '<button class="modal-btn" data-del="' + takes[i].id + '">&#x1F5D1;&#xFE0F;</button></div>';
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
          if ((v = el.getAttribute("data-del"))) {
            var list = gtrTakesLoad(), t = gtrTakeById(list, Number(v));
            if (!t || (window.confirm && !window.confirm("「" + t.name + "」を消しますか？"))) { return; }
            list.splice(list.indexOf(t), 1);
            gtrTakesSave(list);
            draw();
            return;
          }
          if (el.getAttribute("data-back")) { ctl.back(); return; }
          if (el.getAttribute("data-go")) { ctl.done({}); return; }
          if ((v = el.getAttribute("data-open"))) { ctl.done({ take: Number(v) }); }
        };
      }
    }
    draw();
  }

  // コードは 1〜7、J ダウン・K アップ・L カッティング、Z 録音・X 再生
  var GTR_KEYS = { "1": "c0", "2": "c1", "3": "c2", "4": "c3", "5": "c4", "6": "c5", "7": "c6", j: "down", k: "up", l: "cut", z: "rec", x: "play" };

  I.register({
    id: "guitar",
    after: "bass",
    cat: "music",
    music: true,
    name: "ゴリラギター",
    icon: "&#x1F918;",
    desc: "6本の弦で1音ずつ弾く「単音」と、コードをかき鳴らす「ストローク」。アコギもエレキも",
    help: "単音: フレットをタップ（同じ弦ですべらせるとスライド）/ ストローク: 弦の上を指で上から下へ ＝ ダウン・下から上 ＝ アップ、コードは上の段か 1〜7 / J ダウン・K アップ・L カッティング / Z 録音 / X 再生 / P一時停止",
    controls: [],
    keys: GTR_KEYS,
    setup: gtrSetup,
    setupLabel: "音色・テイク",
    panel: true,
    create: function (api, cfg) {
      cfg = cfg || {};
      var B = BA(), prefs = gtrPrefs(), view = prefs.view, names = prefs.names;
      var frame = 0, msg = "", chordD = 0, panel = api.panel;
      if (panel && panel.classList) { panel.classList.add("quiz-panel"); }
      if (api.setCanvasHeight) { api.setCanvasHeight(GTR_H); }
      function now() { return frame / 60; }
      function voiceDef() { return gtrOpt(GTR_VOICES, prefs.voice); }

      // --- 音 ---
      var UG = window.UGMelody, audioOk = false, buses = {};
      function audio() {
        if (audioOk || !UG || !UG.audioInit) { return; }
        try { if (UG.audioInit()) { audioOk = true; UG.loadSamples([24, 25]); } } catch (e) {}
      }
      // 1音（when: AudioContext の秒・省略可）→ 音のハンドル
      function sound(m, lv, when, voice) {
        audio();
        if (!audioOk) { return null; }
        var vd = gtrOpt(GTR_VOICES, voice || prefs.voice), prog = vd[2], h = null;
        try {
          var bus = gtrBus(buses, vd[0], 100), smp = !!(UG.samples && UG.samples.enabled && UG.sampleReady && UG.sampleReady(prog)), d;
          if (bus) { d = UG.audio.ctx.createGain(); d.gain.value = lv * (smp ? GTR_BOOST : 1); d.connect(bus); }
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
        var ac = audioOk && UG.audio ? UG.audio.ctx : null, when = ac && dt ? ac.currentTime + dt : 0;
        stopString(sn, when);
        strVo[sn] = { h: sound(m, lv, when), m: m, cur: m };
        vib[sn] = 30;
        recOn("s" + sn, m, lv, dt || 0);
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
      function curChord() { return B.chord(prefs.key, chordD, prefs.scale, prefs.sev); }
      function curShape() { return gtrShape(curChord(), prefs.sev); }
      function setChord(d) { chordD = d; flash["c" + d] = 10; render(); }
      var flash = {};
      // ストローク: dir "down"（6弦 → 1弦）/ "up"（1弦 → 4弦）/ "cut"（ミュートの短い音）
      function strum(dir) {
        audio();
        var sh = curShape(), order = dir === "up" ? [5, 4, 3, 2] : [0, 1, 2, 3, 4, 5], k = 0, i;
        for (i = 0; i < order.length; i++) {
          var sn = order[i], m = sh.midis[sn];
          if (m === null) { continue; }
          if (dir === "cut") {
            var ac = audioOk && UG.audio ? UG.audio.ctx : null, h = sound(m, 0.35, ac ? ac.currentTime + k * 0.004 : 0);
            stopString(sn, 0);
            if (h && ac) { stopVoice(h, ac.currentTime + 0.05 + k * 0.004, 0.02); }
            vib[sn] = 8;
          } else { playString(sn, m, dir === "up" ? 0.5 : 0.6, k * 0.012); }
          k++;
        }
        if (dir === "cut" && UG && UG.bassHit && audioOk) { try { UG.bassHit("ghost", 0, 0.5, gtrBus(buses, prefs.voice, 100) || undefined); } catch (e) {} }
      }

      // --- 録音・再生 ---
      var bpm = prefs.bpm, meter = 4, metro = prefs.metro, takes = gtrTakesLoad();
      var take = cfg.take ? gtrTakeById(takes, cfg.take) : null, rec = null, play = null;
      if (take) { msg = "「" + escHtml(take.name) + "」をひらきました。▶ 再生で聴けます"; }
      function recBeat() { return rec ? (now() - rec.t0) * bpm / 60 : 0; }
      function r3(v) { return Math.round(v * 1000) / 1000; }
      function recToggle() {
        if (rec) { recStop(); return; }
        playStop();
        audio();
        rec = { t0: now() + meter * 60 / bpm, notes: [], open: {}, beat: -meter - 1 };
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
        var n = rec.notes;
        rec = null;
        if (n.length) {
          take = gtrTakeAdd(takes, { bpm: bpm, meter: meter, voice: prefs.voice, notes: n });
          gtrTakesSave(takes);
          msg = "&#x1F4BE; 「" + escHtml(take.name) + "」に保存しました（" + take.notes.length + "音）";
        } else { msg = "音がなかったので保存しませんでした"; }
        render();
      }
      function playBeat() { return play ? (now() - play.t0) * play.bpm / 60 : 0; }
      function playStop() {
        if (!play) { return; }
        for (var i = 0; i < play.vo.length; i++) { stopVoice(play.vo[i].h, 0, 0.06); }
        play = null;
      }
      function playToggle() {
        if (play) { playStop(); render(); return; }
        if (rec) { return; }
        if (!take || !take.notes.length) { msg = "まだテイクがありません。🔴 録音で録ってね"; render(); return; }
        audio();
        play = { t0: now() + 0.1, bpm: take.bpm, notes: take.notes, idx: 0, vo: [], voice: take.voice };
        render();
      }

      // --- パネル ---
      function action(v) {
        if (v === "rec") { recToggle(); }
        else if (v === "play") { playToggle(); }
        else if (v === "metro") { metro = !metro; prefs.metro = metro; gtrSavePrefs(prefs); render(); }
        else if (v === "bpmdown" || v === "bpmup") {
          if (rec) { return; }
          bpm = Math.max(40, Math.min(240, bpm + (v === "bpmup" ? 5 : -5)));
          prefs.bpm = bpm; gtrSavePrefs(prefs); render();
        }
        else if (/^view:/.test(v)) { allOff(); view = prefs.view = v.substring(5) === "chord" ? "chord" : "fret"; gtrSavePrefs(prefs); render(); }
        else if (/^voice:/.test(v)) { allOff(); prefs.voice = gtrOpt(GTR_VOICES, v.substring(6))[0]; gtrSavePrefs(prefs); render(); }
        else if (/^tab:/.test(v)) { prefs.tab = v.substring(4) === "key" ? "key" : "play"; gtrSavePrefs(prefs); render(); }
        else if (v === "posdown" || v === "posup") { allOff(); prefs.pos = Math.max(0, Math.min(GTR_POS_MAX, prefs.pos + (v === "posup" ? 1 : -1))); gtrSavePrefs(prefs); render(); }
        else if (v === "keydown" || v === "keyup") { prefs.key = (prefs.key + (v === "keyup" ? 1 : 11)) % 12; gtrSavePrefs(prefs); render(); }
        else if (v === "sev") { prefs.sev = !prefs.sev; gtrSavePrefs(prefs); render(); }
        else if (/^scale:/.test(v)) { prefs.scale = B.scale(v.substring(6))[0]; gtrSavePrefs(prefs); render(); }
        else if (v === "down" || v === "up" || v === "cut") { strum(v); }
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
      function render() {
        if (!panel) { return; }
        var html = "", i;
        if (view === "chord") {
          html += '<div class="piano-row"><button class="modal-btn" data-ga="down">&#x2B07;&#xFE0F; ダウン</button><button class="modal-btn" data-ga="up">&#x2B06;&#xFE0F; アップ</button>' +
            '<button class="modal-btn" data-ga="cut">&#x270B; カッティング</button></div>';
        }
        html += '<div class="piano-row"><button class="modal-btn' + (rec ? " piano-rec-on" : "") + '" data-ga="rec">' + (rec ? "&#x23F9;&#xFE0F; 録音をとめる" : "&#x1F534; 録音") + '</button>' +
          '<button class="modal-btn' + (play ? " piano-rec-on" : "") + '" data-ga="play"' + (rec ? " disabled" : "") + '>' + (play ? "&#x23F9;&#xFE0F; とめる" : "&#x25B6;&#xFE0F; 再生") + '</button></div>' +
          '<div class="piano-row"><button class="modal-btn" data-ga="bpmdown">&minus;</button><span>BPM ' + bpm + '</span><button class="modal-btn" data-ga="bpmup">&#xFF0B;</button>' +
          '<button class="modal-btn" data-ga="metro" title="録音のメトロノーム">' + METRO + ' ' + (metro ? "ON" : "OFF") + '</button></div>';
        html += '<div class="piano-row">';
        for (i = 0; i < 2; i++) { var tid = ["play", "key"][i]; html += '<button class="modal-btn' + (prefs.tab === tid ? " piano-rec-on" : "") + '" data-ga="tab:' + tid + '">' + ["弾き方", "キー"][i] + '</button>'; }
        html += '</div>';
        if (prefs.tab === "key") {
          html += '<div class="piano-row"><button class="modal-btn" data-ga="keydown">&#x25C0;</button><span>キー ' + GTR_CDE[prefs.key] + '</span><button class="modal-btn" data-ga="keyup">&#x25B6;</button>' +
            '<button class="modal-btn" data-ga="sev">' + (prefs.sev ? "7th" : "3和音") + '</button></div>' +
            '<div class="piano-row"><label class="piano-select">&#x1F3B5; <select data-gscale="1">' + scaleOptions() + '</select></label></div>' +
            (view === "fret" ? '<p class="small" style="margin:4px 0 0;">マスの下の点: スケールの音（白い大きな点は主音・<span style="color:#f783ac;">●</span> 特徴音 ' + escHtml(B.scale(prefs.scale)[4]) + '）</p>' : "");
        } else {
          html += '<div class="piano-row">';
          for (i = 0; i < GTR_VIEWS.length; i++) { html += '<button class="modal-btn' + (view === GTR_VIEWS[i][0] ? " piano-rec-on" : "") + '" data-ga="view:' + GTR_VIEWS[i][0] + '">' + GTR_VIEWS[i][1] + '</button>'; }
          html += '</div><div class="piano-opts">';
          for (i = 0; i < GTR_VOICES.length; i++) { html += '<button class="modal-btn quiz-opt' + (prefs.voice === GTR_VOICES[i][0] ? " active" : "") + '" data-ga="voice:' + GTR_VOICES[i][0] + '">' + GTR_VOICES[i][1] + '</button>'; }
          html += '</div>';
          if (view === "fret") {
            html += '<div class="piano-row"><button class="modal-btn" data-ga="posdown">&#x25C0;</button><span>' + (prefs.pos ? prefs.pos + "〜" + (prefs.pos + GTR_COLS - 1) + " フレット" : "開放弦〜" + (GTR_COLS - 1) + " フレット") + '</span>' +
              '<button class="modal-btn" data-ga="posup">&#x25B6;</button></div>';
          }
        }
        if (take && !rec) { html += '<p class="small" style="margin:4px 0 0;">いまのテイク: ' + escHtml(take.name) + '（' + take.notes.length + '音・BPM ' + take.bpm + '）</p>'; }
        if (msg) { html += '<p class="small" style="margin:4px 0 0;color:#ffd166;">' + msg + '</p>'; }
        panel.innerHTML = html;
        var bs = panel.querySelectorAll ? panel.querySelectorAll("button[data-ga]") : [];
        for (i = 0; i < bs.length; i++) {
          bs[i].onclick = function (ev) { if (ev.currentTarget.blur) { ev.currentTarget.blur(); } action(ev.currentTarget.getAttribute("data-ga")); };
        }
        var ssel = panel.querySelector ? panel.querySelector("select[data-gscale]") : null;
        if (ssel) { ssel.onchange = function (ev) { if (ev.currentTarget.blur) { ev.currentTarget.blur(); } action("scale:" + ev.currentTarget.value); }; }
      }
      render();

      // --- 指 ---
      var press = {}; // 単音: 指 → { sn, m } / ストローク: 指 → { y, moved }
      function text(ctx, s, x, y, size, color) { ctx.fillStyle = color; ctx.font = "bold " + size + "px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(s, x, y); }
      function drawFret(ctx) {
        var cw = gtrColW(), rh = gtrRowH(), top = GTR_BOARD_Y, bot = top + rh * 6, spc = B.scalePcs(prefs.key, prefs.scale), r, c;
        ctx.fillStyle = "#4a2f1d";
        ctx.fillRect(GTR_BOARD_X, top, cw * GTR_COLS, bot - top);
        for (c = 0; c < GTR_COLS; c++) {
          var f = prefs.pos + c, cx = GTR_BOARD_X + (c + 0.5) * cw;
          if (GTR_MARKS.indexOf(f) >= 0) {
            ctx.fillStyle = "#e8d8b8";
            if (f === 12) { ctx.beginPath(); ctx.arc(cx, top + rh * 2, 3.5, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(cx, top + rh * 4, 3.5, 0, Math.PI * 2); ctx.fill(); }
            else { ctx.beginPath(); ctx.arc(cx, top + rh * 3, 3.5, 0, Math.PI * 2); ctx.fill(); }
          }
          if (c > 0) { var nut = c === 1 && prefs.pos === 0; ctx.fillStyle = nut ? "#f5f0e6" : "#b8b8b8"; ctx.fillRect(GTR_BOARD_X + c * cw - (nut ? 2 : 0.75), top, nut ? 4 : 1.5, bot - top); }
          text(ctx, f === 0 ? "開放" : String(f), cx, top - 7, 8, "#adb5bd");
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
            if (on) { ctx.fillStyle = "#ffd166"; ctx.beginPath(); ctx.arc(rc.x + rc.w / 2, sy, Math.min(rc.w, rc.h) * 0.34, 0, Math.PI * 2); ctx.fill(); }
          }
          ctx.fillStyle = "#d9d9d9";
          ctx.fillRect(GTR_BOARD_X, sy - (0.6 + sn * 0.25), cw * GTR_COLS, 1.2 + sn * 0.5);
          for (c = 0; c < GTR_COLS; c++) {
            var nm = gtrName(GTR_OPEN[sn] + prefs.pos + c, names);
            if (nm) { var rr = gtrCellRect(r, c); text(ctx, nm, rr.x + rr.w / 2, sy - rh * 0.3, 7, "rgba(255,255,255,0.6)"); }
          }
          hudText(ctx, String(6 - sn), 1, sy - rh * 0.3, "left");
        }
      }
      function drawStrum(ctx) {
        var ch = curChord(), sh = curShape(), rh = gtrStrumRowH(), i, sn;
        for (i = 0; i < 7; i++) {
          var cr = gtrChordRect(i), cur = i === chordD, dc = B.chord(prefs.key, i, prefs.scale, prefs.sev);
          ctx.fillStyle = cur ? "#ffd166" : (flash["c" + i] > 0 ? "#fff3b0" : "#2f4a6e");
          ctx.fillRect(cr.x, cr.y, cr.w, cr.h);
          text(ctx, dc.deg, cr.x + cr.w / 2, cr.y + 8, dc.deg.length > 5 ? 6 : 7, cur ? "#14213d" : "#adb5bd");
          text(ctx, dc.name, cr.x + cr.w / 2, cr.y + cr.h / 2 + 4, dc.name.length > 5 ? 7 : (dc.name.length > 4 ? 8 : 10), cur ? "#14213d" : "#ffffff");
        }
        ctx.fillStyle = "#3b2416";
        ctx.fillRect(4, GTR_STRUM_Y, W - 8, rh * 6);
        for (sn = 0; sn < 6; sn++) {
          var y = gtrStrumLineY(sn), th = 1.2 + (5 - sn) * 0.5, a = vib[sn] / 30 * 3, fx = sh.frets[sn];
          ctx.fillStyle = vib[sn] > 0 ? "#ffe8a3" : "#d9d9d9";
          if (a > 0.2 && ctx.beginPath) {
            ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = th; ctx.beginPath();
            for (var x = 60; x <= W - 8; x += 6) { var yy = y + Math.sin(x / 9 + frame * 1.7) * a; if (x === 60) { ctx.moveTo(x, yy); } else { ctx.lineTo(x, yy); } }
            ctx.stroke(); ctx.lineWidth = 1;
          } else { ctx.fillRect(60, y - th / 2, W - 68, th); }
          text(ctx, (6 - sn) + "弦 " + GTR_SNAME[sn], 30, y - 9, 8, "#adb5bd");
          ctx.fillStyle = fx === null ? "#c92a2a" : "#ffd166";
          ctx.beginPath(); ctx.arc(30, y + 6, 9, 0, Math.PI * 2); ctx.fill();
          text(ctx, fx === null ? "×" : String(fx), 30, y + 6, 10, "#14213d");
          if (fx !== null && names !== "none") { text(ctx, gtrName(sh.midis[sn], names), W - 20, y - 8, 8, "rgba(255,255,255,0.6)"); }
        }
        text(ctx, ch.name, W / 2, GTR_STRUM_Y - 7, 11, "#ffd166");
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
              if (d >= 0) { setChord(d); return; }
              if (y >= GTR_STRUM_Y) { press[pid] = { y: y, moved: false }; }
              return;
            }
            var c = gtrCellAt(x, y, prefs.pos);
            if (c) { press[pid] = { sn: c.sn, m: c.m }; playString(c.sn, c.m, 0.8, 0); }
          } else if (type === "move") {
            if (!p) { return; }
            if (view === "chord") {
              var cs = gtrStrumCross(p.y, y), sh = curShape(), k;
              for (k = 0; k < cs.length; k++) { if (sh.midis[cs[k]] !== null) { playString(cs[k], sh.midis[cs[k]], y > p.y ? 0.6 : 0.5, 0); } }
              if (cs.length) { p.moved = true; }
              p.y = y;
              return;
            }
            // 同じ弦の行（となりに少しはみ出しても）ならスライド
            var rh = gtrRowH(), sy = GTR_BOARD_Y + (5 - p.sn + 0.5) * rh;
            var c2 = Math.abs(y - sy) < rh * 0.85 ? gtrCellAt(x, sy, prefs.pos) : gtrCellAt(x, y, prefs.pos);
            if (!c2 || c2.m === p.m) { return; }
            if (c2.sn === p.sn && strVo[p.sn] && strVo[p.sn].cur === p.m) { p.m = c2.m; bendString(p.sn, c2.m); return; }
            if (strVo[p.sn] && strVo[p.sn].cur === p.m) { stopString(p.sn, 0); }
            press[pid] = { sn: c2.sn, m: c2.m };
            playString(c2.sn, c2.m, 0.8, 0);
          } else {
            if (!p) { return; }
            delete press[pid];
            if (view === "chord") {
              // またがずにはなした ＝ その弦だけ
              if (!p.moved) { var sn0 = gtrStrumAt(p.y), sh0 = curShape(); if (sn0 >= 0 && sh0.midis[sn0] !== null) { playString(sn0, sh0.midis[sn0], 0.7, 0); } }
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
            if (play.idx >= play.notes.length && pb > last) { play = null; render(); }
          }
          if (rec) {
            var rb = Math.floor(recBeat());
            if (rb !== rec.beat && (metro || rb < 0)) { click(((rb % meter) + meter) % meter === 0); }
            rec.beat = rb;
          }
        },
        draw: function (ctx) {
          var g = ctx.createLinearGradient ? ctx.createLinearGradient(0, 0, 0, GTR_H) : null;
          if (g) { g.addColorStop(0, "#1b1f3b"); g.addColorStop(1, "#3b1d2e"); }
          ctx.fillStyle = g || "#1b263b";
          ctx.fillRect(0, 0, W, GTR_H);
          hudText(ctx, view === "chord" ? "🎶 キー " + GTR_CDE[prefs.key] : "🎸 " + (prefs.pos ? prefs.pos + "フレット〜" : "開放弦〜"), 8, 10, "left");
          hudText(ctx, "BPM " + bpm, W - 8, 10, "right");
          var held = [], sn;
          for (sn = 5; sn >= 0; sn--) { if (strVo[sn] && view === "fret") { held.push(gtrName(strVo[sn].cur, names === "none" ? "do" : names) + "（" + gtrName(strVo[sn].cur, "cde") + "）"); } }
          if (rec) {
            var rb = recBeat();
            text(ctx, rb < 0 ? String(Math.ceil(-rb)) : "● REC " + (Math.floor(rb / meter) + 1) + "小節・" + rec.notes.length + "音", W / 2, view === "chord" ? 10 : 30, view === "chord" ? 11 : 16, "#ff6b6b");
          }
          if (view === "chord") { drawStrum(ctx); return; }
          if (!rec) { text(ctx, held.join(" ") || (play ? "再生中…" : "弦のマスをタップして弾こう"), W / 2, held.length ? 60 : 70, held.length ? 16 : 12, held.length ? "#ffd166" : "#ffffff"); }
          drawFret(ctx);
        }
      };
    }
  });

  window.UGGuitar = {
    H: GTR_H, OPEN: GTR_OPEN, VOICES: GTR_VOICES, AMPS: GTR_AMPS, VIEWS: GTR_VIEWS, COLS: GTR_COLS, BOARD_Y: GTR_BOARD_Y, STRUM_Y: GTR_STRUM_Y,
    PREFS_KEY: GTR_PREFS_KEY, TAKES_KEY: GTR_TAKES_KEY, TAKES_MAX: GTR_TAKES_MAX, BOOST: GTR_BOOST,
    cellAt: gtrCellAt, cellRect: gtrCellRect, chordRect: gtrChordRect, chordAt: gtrChordAt, strumLineY: gtrStrumLineY, strumAt: gtrStrumAt, strumCross: gtrStrumCross,
    quality: gtrQuality, shape: gtrShape, bus: gtrBus, name: gtrName, prefs: gtrPrefs, notesClean: gtrNotesClean,
    takesLoad: gtrTakesLoad, takesSave: gtrTakesSave, takeAdd: gtrTakeAdd, takeById: gtrTakeById
  };
})();
