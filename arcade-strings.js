// =========================================================
// 究極ゴリラ ゲームセンター: 🎻 ゴリラストリングス（§300〜）
// arcade.js・arcade-melody.js・arcade-bass.js の後に読み込む。音は window.UGMelody のサンプルを使う。
// 弦楽器は音をのばすので、サンプルののびている所をくり返して鳴らす（strVoice）。
// コード・スケール・音量の出口などはゴリラベース（window.UGBass）のものを借りる
// =========================================================
(function () {
  "use strict";

  var I = window.UGArcade && window.UGArcade.internal;
  if (!I) { return; }
  var W = I.W, hudText = I.hudText, lsGet = I.lsGet, lsSet = I.lsSet, escHtml = I.escHtml;
  function BA() { return window.UGBass; }

  var STR_H = 320;
  var STR_PREFS_KEY = "ultimateGorillaStringsPrefsV1", STR_TAKES_KEY = "ultimateGorillaStringsTakesV1";
  var STR_TAKES_MAX = 10, STR_NOTES_MAX = 2000, STR_LEVEL = 1.8;
  var STR_DO = ["ド", "ド#", "レ", "レ#", "ミ", "ファ", "ファ#", "ソ", "ソ#", "ラ", "ラ#", "シ"];
  var STR_CDE = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  var STR_NAMES = [["do", "ドレミ"], ["cde", "CDE"], ["none", "なし"]];
  var STR_VIEWS = [["solo", "&#x1F3BB; ソロ"], ["chord", "&#x1F3BC; 合奏コード"]];
  // 楽器 [id, 名前, GM, 弦の開放（低い → 高い）, 弓で弾くか]
  var STR_VIOLA = [48, 55, 62, 69];
  var STR_INSTS = [
    ["violin", "&#x1F3BB; バイオリン", 40, [55, 62, 69, 76], true], ["viola", "ビオラ", 41, STR_VIOLA, true],
    ["cello", "チェロ", 42, [36, 43, 50, 57], true], ["bass", "コントラバス", 43, [28, 33, 38, 43], true],
    ["ens", "&#x1F3BC; 合奏", 48, STR_VIOLA, true], ["slow", "ゆったり合奏", 49, STR_VIOLA, true], ["trem", "トレモロ", 44, STR_VIOLA, true],
    ["pizz", "ピチカート", 45, STR_VIOLA, false], ["harp", "ハープ", 46, [36, 43, 50, 57], false]
  ];
  function strOpt(list, id) { for (var i = 0; i < list.length; i++) { if (list[i][0] === id) { return list[i]; } } return list[0]; }
  function strPc(m) { return ((m % 12) + 12) % 12; }
  function strName(m, names) {
    if (names === "none") { return ""; }
    var r = Math.round(m);
    return names === "cde" ? STR_CDE[strPc(r)] + (Math.floor(r / 12) - 1) : STR_DO[strPc(r)];
  }

  // ---------- ソロの画面（指板・上が1弦 ＝ いちばん高い弦）----------
  var STR_COLS = 8, STR_POS_MAX = 12, STR_BOARD_X = 4, STR_BOARD_Y = 96, STR_BOARD_BOT = 314, STR_BOW_X = W - 4 - Math.round(W * 0.26), STR_BOARD_R = W - 4;
  var STR_MARKS = [3, 5, 7, 9, 12, 15, 17, 19];
  // bow: 弓の所を出すか
  function strLayout(bow) { STR_BOARD_R = bow ? STR_BOW_X - 6 : W - 4; }
  function strColW() { return (STR_BOARD_R - STR_BOARD_X) / STR_COLS; }
  function strRowH() { return (STR_BOARD_BOT - STR_BOARD_Y) / 4; }
  function strRowLineY(r) { return STR_BOARD_Y + (r + 0.5) * strRowH(); }
  // 行 r（0 ＝ 1弦）→ 弦の番号（0 ＝ いちばん低い）
  function strSnOfRow(r) { return 3 - r; }
  // 指板の座標 → { r, sn, semi: 開放からの半音（小数）}（外なら null）
  function strBoardAt(x, y, pos) {
    if (x < STR_BOARD_X || x >= STR_BOARD_R || y < STR_BOARD_Y || y >= STR_BOARD_BOT) { return null; }
    var r = Math.floor((y - STR_BOARD_Y) / strRowH());
    return { r: r, sn: strSnOfRow(r), semi: pos + (x - STR_BOARD_X) / strColW() - 0.5 };
  }
  // 弓の所の行（外は -1）
  function strBowRow(x, y) {
    if (x < STR_BOW_X || y < STR_BOARD_Y || y >= STR_BOARD_BOT) { return -1; }
    return Math.max(0, Math.min(3, Math.floor((y - STR_BOARD_Y) / strRowH())));
  }
  // 弓の速さ（1フレームに動いた量）→ 大きさ（0〜1.1）
  function strBowLevel(speed) { return speed < 0.4 ? 0 : Math.max(0.2, Math.min(1.1, 0.2 + speed / 14)); }

  // ---------- 合奏コード ----------
  // ボタン i（0〜6）の四角（上に4つ・下に3つ）
  function strChordRect(i) {
    var top = 40, h = (STR_H - top - 10) / 2, row = i < 4 ? 0 : 1, n = row ? 3 : 4, w = (W - 8) / n, k = row ? i - 4 : i;
    return { x: 4 + k * w + 3, y: top + row * h + 3, w: w - 6, h: h - 6 };
  }
  function strChordAt(x, y) { for (var i = 0; i < 7; i++) { var r = strChordRect(i); if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) { return i; } } return -1; }
  // コード（ゴリラベースの chord）・いちばん低い音 low → 鳴らす音（ルート・5度・オクターブ上のルート・その上の3度・7th なら7度）
  function strVoicing(ch, low, sev) {
    var root = low + ((strPc(ch.r !== undefined ? ch.r : ch.root) - strPc(low) + 12) % 12), iv = ch.iv, out = [root, root + iv[4], root + 12, root + 12 + iv[2]];
    if (sev) { out.push(root + 12 + iv[6]); }
    return out;
  }

  // ---------- 設定・テイク ----------
  function strPrefs() {
    var p = lsGet(STR_PREFS_KEY) || {}, pos = Math.round(Number(p.pos)), key = Math.round(Number(p.key)), B = BA();
    return {
      view: p.view === "chord" ? "chord" : "solo", inst: strOpt(STR_INSTS, p.inst)[0],
      names: p.names === "cde" || p.names === "none" ? p.names : "do",
      pos: pos >= 0 && pos <= STR_POS_MAX ? pos : 0, key: key >= 0 && key <= 11 ? key : 0,
      scale: B ? B.scale(p.scale)[0] : "major", sev: !!p.sev, tab: p.tab === "key" ? "key" : "play",
      bow: p.bow !== false, snap: p.snap !== false, vib: p.vib !== false,
      bpm: Math.max(40, Math.min(240, Math.round(Number(p.bpm) || 100))), metro: p.metro !== false
    };
  }
  function strSavePrefs(p) { return lsSet(STR_PREFS_KEY, p); }
  function strNum(v, lo, hi) { var n = Number(v); return isFinite(n) && n >= lo && n <= hi ? n : null; }
  function strNotesClean(a) {
    var out = [], i;
    a = a && a.length ? a : [];
    for (i = 0; i < a.length && out.length < STR_NOTES_MAX; i++) {
      var b = a[i] && strNum(a[i][0], 0, 4096), d = a[i] && strNum(a[i][1], 0.0625, 32), m = a[i] && strNum(a[i][2], 0, 127), v = a[i] && strNum(a[i][3], 0.1, 1);
      if (b !== null && d !== null && m !== null) { out.push(v !== null && v !== 0.8 ? [b, d, Math.round(m), v] : [b, d, Math.round(m)]); }
    }
    out.sort(function (x, y) { return x[0] - y[0]; });
    return out;
  }
  function strTakeClean(t, i) {
    return {
      id: Math.max(1, Math.round(Number(t.id)) || i + 1), name: String(t.name || "テイク").slice(0, 20),
      bpm: Math.max(40, Math.min(240, Math.round(Number(t.bpm) || 100))), meter: t.meter === 3 ? 3 : 4,
      inst: strOpt(STR_INSTS, t.inst)[0], notes: strNotesClean(t.notes)
    };
  }
  function strTakesLoad() {
    var a = lsGet(STR_TAKES_KEY), out = [], i;
    if (!a || !a.length) { return out; }
    for (i = 0; i < a.length && out.length < STR_TAKES_MAX; i++) { if (a[i] && typeof a[i] === "object") { out.push(strTakeClean(a[i], i)); } }
    return out;
  }
  function strTakesSave(list) { return lsSet(STR_TAKES_KEY, list.slice(0, STR_TAKES_MAX)); }
  function strTakeAdd(list, t) {
    var id = 0, i;
    for (i = 0; i < list.length; i++) { id = Math.max(id, list[i].id); }
    var take = strTakeClean({ id: id + 1, name: t.name || "ストリングス " + (id + 1), bpm: t.bpm, meter: t.meter, inst: t.inst, notes: t.notes }, 0);
    list.unshift(take);
    if (list.length > STR_TAKES_MAX) { list.length = STR_TAKES_MAX; }
    return take;
  }
  function strTakeById(list, id) { for (var i = 0; i < list.length; i++) { if (list[i].id === id) { return list[i]; } } return null; }

  // ---------- シーケンサーへ送る ----------
  var STR_SEQ_MAX = 1000;
  function strSendToSeq(take) {
    var U = window.UGUkulele;
    if (!U || !U.seqLoad || !U.xAdd) { return { ok: false, msg: "ゴリラウクレレが読みこめませんでした" }; }
    if (!take || !take.notes || !take.notes.length) { return { ok: false, msg: "音のないテイクは送れません" }; }
    var st = U.seqLoad(), id = U.xAdd(st.cur.tracks, "snotes");
    if (!id) { return { ok: false, msg: "追加トラックがいっぱいです（8本まで）。シーケンサーで1本消してから送ってね" }; }
    var t = st.cur.tracks[id], n = strNotesClean(take.notes), cut = n.length > STR_SEQ_MAX;
    t.name = String(take.name).slice(0, 12);
    t.prog = strOpt(STR_INSTS, take.inst)[2];
    t.notes = n.slice(0, STR_SEQ_MAX);
    U.seqSave(st);
    return { ok: true, id: id, cut: cut, msg: "「" + take.name + "」を、ゴリラウクレレのシーケンサー（編集中の曲）に 🎻 ストリングス打ち込みトラックとして送りました" + (cut ? "（音が多いので、はじめの " + STR_SEQ_MAX + " 音）" : "") };
  }

  // ---------- 音: のばせる声（サンプルののびている所をくり返す）----------
  // → { src（サンプル）または h（合成音）, g: 大きさ, best, m }。音が出せなければ null
  function strVoice(prog, m, out, when) {
    var UG = window.UGMelody, A = UG && UG.audio, ac = A && A.ctx;
    if (!ac || !out) { return null; }
    var S = UG.samples, name = UG.sampleFiles ? UG.sampleFiles[prog] : null, bank = S && S.buffers && name ? S.buffers[name] : null, keys = S && S.keys && name ? S.keys[name] : null;
    var g = ac.createGain(), t = Math.max(when || 0, ac.currentTime), v = { ac: ac, g: g, m: m, src: null, h: null, best: m };
    g.gain.value = 0;
    g.connect(out);
    if (S && S.enabled && UG.sampleReady && UG.sampleReady(prog) && bank && keys && keys.length) {
      var best = keys[0], i;
      for (i = 1; i < keys.length; i++) { if (Math.abs(keys[i] - m) < Math.abs(best - m)) { best = keys[i]; } }
      var buf = bank[best];
      if (buf) {
        var src = ac.createBufferSource(), dur = buf.duration || 3;
        src.buffer = buf;
        src.loop = true;
        src.loopStart = Math.min(1, dur * 0.35);
        src.loopEnd = Math.max(src.loopStart + 0.3, dur - 0.25);
        src.playbackRate.value = Math.pow(2, (m - best) / 12);
        src.connect(g);
        src.start(t);
        v.src = src; v.best = best;
        return v;
      }
    }
    try { v.h = UG.synth(m, prog, t, 0.8, g, 30) || null; } catch (e) {}
    return v;
  }
  // 音程（なめらかに）
  function strPitch(v, m, glide) {
    if (!v) { return; }
    v.m = m;
    var t = v.ac.currentTime;
    if (v.src) { try { v.src.playbackRate.cancelScheduledValues(t); v.src.playbackRate.setTargetAtTime(Math.pow(2, (m - v.best) / 12), t, (glide || 0.04) / 3); } catch (e) {} }
    else if (v.h && window.UGMelody.voiceBend) { try { window.UGMelody.voiceBend(v.h, m, 0, glide || 0.04); } catch (e2) {} }
  }
  // 大きさ（tau: なめらかさ・秒）
  function strLevel(v, lv, tau) { if (!v) { return; } try { v.g.gain.cancelScheduledValues(v.ac.currentTime); v.g.gain.setTargetAtTime(lv * STR_LEVEL, v.ac.currentTime, tau || 0.05); } catch (e) {} }
  function strStop(v, rel) {
    if (!v) { return; }
    var t = v.ac.currentTime, r = rel || 0.25;
    try { v.g.gain.cancelScheduledValues(t); v.g.gain.setTargetAtTime(0, t, r / 3); } catch (e) {}
    if (v.src) { try { v.src.stop(t + r * 2 + 0.05); } catch (e2) {} }
    if (v.h && window.UGMelody.voiceStop) { try { window.UGMelody.voiceStop(v.h, t + r, r); } catch (e3) {} }
  }
  // ビブラート（5.5Hz で再生の速さをゆらす）
  function strVibrato(v, on) {
    if (!v || !v.src || !v.ac.createOscillator) { return; }
    try {
      if (on && !v.lfo) {
        var o = v.ac.createOscillator(), d = v.ac.createGain();
        o.frequency.value = 5.5; d.gain.value = 0.006 * v.src.playbackRate.value;
        o.connect(d); d.connect(v.src.playbackRate); o.start(v.ac.currentTime + 0.25);
        v.lfo = o;
      } else if (!on && v.lfo) { v.lfo.stop(0); v.lfo = null; }
    } catch (e) {}
  }

  // ---------- はじめの画面 ----------
  function strSetup(root, ctl) {
    var p = strPrefs(), note = "";
    function opts(list, cur, attr) {
      var h = "", i;
      for (i = 0; i < list.length; i++) { h += '<button class="modal-btn quiz-opt' + (cur === list[i][0] ? " active" : "") + '" data-' + attr + '="' + list[i][0] + '">' + list[i][1] + '</button>'; }
      return h;
    }
    function draw() {
      var takes = strTakesLoad(), i;
      var html = '<div class="melody-setup"><h3 style="margin:0 0 4px;">&#x1F3BB; ゴリラストリングス</h3>' +
        '<p class="small" style="color:#adb5bd;margin:0 0 8px;">バイオリンからコントラバス・合奏・ハープまで。弓でこすって音をのばそう。</p>' +
        '<p class="small" style="margin:4px 0 2px;">弾き方</p><div class="quiz-opts">' + opts(STR_VIEWS, p.view, "view") + '</div>' +
        '<p class="small" style="margin:4px 0 2px;">楽器</p><div class="piano-opts">' + opts(STR_INSTS, p.inst, "inst") + '</div>' +
        '<p class="small" style="margin:4px 0 2px;">音名</p><div class="quiz-opts">' + opts(STR_NAMES, p.names, "names") + '</div>' +
        '<button class="modal-btn" data-go="1" style="width:100%;margin-top:8px;">&#x1F3BB; はじめる</button>' +
        '<p class="small" style="margin:10px 0 2px;">&#x1F399;&#xFE0F; 録音したテイク（' + takes.length + ' / ' + STR_TAKES_MAX + '）</p>';
      if (note) { html += '<p class="small" style="color:#ffd166;margin:0 0 4px;">' + note + '</p>'; }
      if (!takes.length) { html += '<p class="small" style="color:#adb5bd;margin:0;">まだありません。弾く画面の「🔴 録音」で録れます。</p>'; }
      for (i = 0; i < takes.length; i++) {
        html += '<div class="piano-take"><span>' + escHtml(takes[i].name) + '<br><span class="small" style="color:#adb5bd;">' + takes[i].notes.length + '音・BPM ' + takes[i].bpm + '・' + strOpt(STR_INSTS, takes[i].inst)[1] + '</span></span>' +
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
          if ((v = el.getAttribute("data-view"))) { p.view = v; strSavePrefs(p); draw(); return; }
          if ((v = el.getAttribute("data-inst"))) { p.inst = v; strSavePrefs(p); draw(); return; }
          if ((v = el.getAttribute("data-names"))) { p.names = v; strSavePrefs(p); draw(); return; }
          if ((v = el.getAttribute("data-send"))) { var rs = strSendToSeq(strTakeById(strTakesLoad(), Number(v))); note = (rs.ok ? "&#x2705; " : "&#x26A0;&#xFE0F; ") + escHtml(rs.msg); draw(); return; }
          if ((v = el.getAttribute("data-del"))) {
            var list = strTakesLoad(), t = strTakeById(list, Number(v));
            if (!t || (window.confirm && !window.confirm("「" + t.name + "」を消しますか？"))) { return; }
            list.splice(list.indexOf(t), 1);
            strTakesSave(list);
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

  // コードは 1〜7（合奏コードは押しているあいだ）、Z 録音・X 再生
  var STR_KEYS = { "1": "c0", "2": "c1", "3": "c2", "4": "c3", "5": "c4", "6": "c5", "7": "c6", z: "rec", x: "play" };

  I.register({
    id: "strings",
    after: "guitar",
    cat: "music",
    music: true,
    name: "ゴリラストリングス",
    icon: "&#x1F3BB;",
    desc: "バイオリン・ビオラ・チェロ・コントラバス・合奏・ハープ。弓でこすって音をのばす",
    help: "ソロ: 左手で指板を押さえて、右の「弓」の所をこする（速いほど大きい）/ 合奏コード: ボタンを押しているあいだ和音がのびる（1〜7）/ Z 録音 / X 再生 / P一時停止",
    controls: [],
    keys: STR_KEYS,
    setup: strSetup,
    setupLabel: "楽器・テイク",
    panel: true,
    create: function (api, cfg) {
      cfg = cfg || {};
      var B = BA(), prefs = strPrefs(), view = prefs.view, names = prefs.names;
      var frame = 0, msg = "", panel = api.panel, flash = {};
      if (panel && panel.classList) { panel.classList.add("quiz-panel"); }
      if (api.setLandscape) { api.setLandscape(false); }
      if (api.setCanvasHeight) { api.setCanvasHeight(STR_H); }
      function inst() { return strOpt(STR_INSTS, prefs.inst); }
      function bowing() { return inst()[4] && prefs.bow && view === "solo"; }
      strLayout(bowing());
      function now() { return frame / 60; }

      // --- 音 ---
      var UG = window.UGMelody, audioOk = false, buses = {};
      function audio() {
        if (audioOk || !UG || !UG.audioInit) { return; }
        try { if (UG.audioInit()) { audioOk = true; UG.loadSamples([inst()[2]]); } } catch (e) {}
      }
      function out() { return audioOk && B.bus ? B.bus(buses, "s", 100, false) : null; }
      function click(accent) { if (audioOk) { try { UG.synth(accent ? 37 : 42, UG.DRUM, 0, accent ? 0.9 : 0.6); } catch (e) {} } }
      // id ごとに鳴っている音 { v, m（録音する半音）}
      var vo = {};
      // id の音を m（小数可）・大きさ lv で鳴らしはじめる
      function noteOn(id, m, lv, att) {
        audio();
        noteOff(id, 0.08);
        var v = strVoice(inst()[2], m, out(), 0);
        if (!v) { vo[id] = { v: null, m: Math.round(m) }; recOn(id, Math.round(m), lv || 0.8); return; }
        strLevel(v, lv, att || 0.06);
        if (prefs.vib && inst()[4]) { strVibrato(v, true); }
        vo[id] = { v: v, m: Math.round(m) };
        recOn(id, Math.round(m), lv || 0.8); // 弓はこすりはじめ 0 なので、録音はふつうの強さ
      }
      function noteOff(id, rel) { var o = vo[id]; if (!o) { return; } strStop(o.v, rel); delete vo[id]; recOff(id); }
      // 音程を変える（録音は半音が変わったら区切る）
      function notePitch(id, m) {
        var o = vo[id];
        if (!o) { return; }
        strPitch(o.v, m, 0.05);
        if (Math.round(m) !== o.m && rec) { var lv = rec.open[id] ? rec.open[id][2] : 0.8; recOff(id); o.m = Math.round(m); recOn(id, o.m, lv); }
        else { o.m = Math.round(m); }
      }
      // はじく（ピチカート・ハープ）
      function pluck(m, lv, dt) {
        audio();
        var ac = audioOk && UG.audio ? UG.audio.ctx : null, bus = out();
        if (!ac || !bus) { return; }
        try { var g = ac.createGain(); g.gain.value = (lv || 0.8) * STR_LEVEL * 0.6; g.connect(bus); UG.synth(Math.round(m), inst()[2], ac.currentTime + (dt || 0), lv || 0.8, g, 0); } catch (e) {}
        if (rec) { var id = "k" + Math.random(); recOn(id, Math.round(m), lv || 0.8, dt || 0); recOff(id); }
      }

      // --- 録音・再生 ---
      var bpm = prefs.bpm, meter = 4, metro = prefs.metro, takes = strTakesLoad();
      var take = cfg.take ? strTakeById(takes, cfg.take) : null, rec = null, play = null;
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
        if (b < -0.25 || rec.notes.length >= STR_NOTES_MAX) { return; }
        rec.open[id] = [Math.max(0, b), m, Math.min(1, v || 0.8)];
      }
      function recOff(id) {
        if (!rec || !rec.open[id]) { return; }
        var o = rec.open[id];
        delete rec.open[id];
        var nt = [r3(o[0]), r3(Math.max(0.0625, recBeat() - o[0])), o[1]];
        if (o[2] !== 0.8) { nt.push(r3(Math.max(0.1, o[2]))); }
        rec.notes.push(nt);
      }
      function recStop() {
        var ks = [], k;
        for (k in rec.open) { if (rec.open.hasOwnProperty(k)) { ks.push(k); } }
        for (k = 0; k < ks.length; k++) { recOff(ks[k]); }
        var n = rec.notes;
        rec = null;
        if (n.length) {
          take = strTakeAdd(takes, { bpm: bpm, meter: meter, inst: prefs.inst, notes: n });
          strTakesSave(takes);
          msg = "&#x1F4BE; 「" + escHtml(take.name) + "」に保存しました（" + take.notes.length + "音）<br>はじめの画面の「🎸 送る」でシーケンサーに入れられます";
        } else { msg = "音がなかったので保存しませんでした"; }
        render();
      }
      function playBeat() { return play ? (now() - play.t0) * play.bpm / 60 : 0; }
      function playStop() {
        if (!play) { return; }
        for (var i = 0; i < play.vo.length; i++) { strStop(play.vo[i].v, 0.15); }
        play = null;
      }
      function playToggle() {
        if (play) { playStop(); render(); return; }
        if (rec) { return; }
        if (!take || !take.notes.length) { msg = "まだテイクがありません。🔴 録音で録ってね"; render(); return; }
        audio();
        play = { t0: now() + 0.1, bpm: take.bpm, notes: take.notes, idx: 0, vo: [], inst: strOpt(STR_INSTS, take.inst) };
        render();
      }

      // --- コード ---
      var chordD = 0;
      function chordObj(d) { return B.chord(prefs.key, d, prefs.scale, prefs.sev); }
      var held = {}; // 合奏コード: 指・キー → ボタン
      function chordOn(id, d) {
        audio();
        chordOff(id);
        chordD = d; flash["c" + d] = 10;
        var ms = strVoicing(chordObj(d), inst()[3][0], prefs.sev), i;
        held[id] = { d: d, ids: [] };
        for (i = 0; i < ms.length; i++) {
          if (inst()[4]) { var nid = id + ":" + i; noteOn(nid, ms[i], 0.55, 0.12); held[id].ids.push(nid); }
          else { pluck(ms[i], 0.7, i * 0.035); }
        }
        render();
      }
      function chordOff(id) { var h = held[id]; if (!h) { return; } for (var i = 0; i < h.ids.length; i++) { noteOff(h.ids[i], 0.4); } delete held[id]; }

      // --- ソロ: 左手（指 → { sn, semi }）と弓（指 → { r, y, x, f, lv }）---
      var left = {}, bows = {};
      // 弦 sn の音（押さえていなければ開放弦。いちばん高い所を押さえている指）
      function stringNote(sn) {
        var best = null, k;
        for (k in left) { if (left.hasOwnProperty(k) && left[k].sn === sn && (best === null || left[k].semi > best)) { best = left[k].semi; } }
        var semi = best === null ? 0 : Math.max(0, best);
        if (prefs.snap) { semi = Math.round(semi); }
        return inst()[3][sn] + semi;
      }
      // 左手が変わったら、その弦を弾いている音の音程を変える
      function leftChanged(sn) {
        var k;
        for (k in bows) { if (bows.hasOwnProperty(k) && strSnOfRow(bows[k].r) === sn) { notePitch("b" + k, stringNote(sn)); } }
        for (k in left) { if (left.hasOwnProperty(k) && left[k].sn === sn && vo["t" + k]) { notePitch("t" + k, stringNote(sn)); } }
      }
      function allOff() {
        var k, ks = [];
        for (k in vo) { if (vo.hasOwnProperty(k)) { ks.push(k); } }
        for (k = 0; k < ks.length; k++) { noteOff(ks[k], 0.1); }
        left = {}; bows = {}; held = {};
      }

      // --- パネル ---
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
      function action(v) {
        if (v === "rec") { recToggle(); }
        else if (v === "play") { playToggle(); }
        else if (v === "metro") { metro = !metro; prefs.metro = metro; strSavePrefs(prefs); render(); }
        else if (v === "bpmdown" || v === "bpmup") { if (rec) { return; } bpm = Math.max(40, Math.min(240, bpm + (v === "bpmup" ? 5 : -5))); prefs.bpm = bpm; strSavePrefs(prefs); render(); }
        else if (/^view:/.test(v)) { allOff(); view = prefs.view = v.substring(5) === "chord" ? "chord" : "solo"; strSavePrefs(prefs); strLayout(bowing()); render(); }
        else if (/^inst:/.test(v)) { allOff(); prefs.inst = strOpt(STR_INSTS, v.substring(5))[0]; strSavePrefs(prefs); strLayout(bowing()); if (audioOk) { try { UG.loadSamples([inst()[2]]); } catch (e) {} } render(); }
        else if (/^tab:/.test(v)) { prefs.tab = v.substring(4) === "key" ? "key" : "play"; strSavePrefs(prefs); render(); }
        else if (v === "bow" || v === "snap" || v === "vib") { allOff(); prefs[v] = !prefs[v]; strSavePrefs(prefs); strLayout(bowing()); render(); }
        else if (v === "posdown" || v === "posup") { allOff(); prefs.pos = Math.max(0, Math.min(STR_POS_MAX, prefs.pos + (v === "posup" ? 1 : -1))); strSavePrefs(prefs); render(); }
        else if (v === "keydown" || v === "keyup") { prefs.key = (prefs.key + (v === "keyup" ? 1 : 11)) % 12; strSavePrefs(prefs); render(); }
        else if (v === "sev") { prefs.sev = !prefs.sev; strSavePrefs(prefs); render(); }
        else if (/^scale:/.test(v)) { prefs.scale = B.scale(v.substring(6))[0]; strSavePrefs(prefs); render(); }
      }
      function render() {
        if (!panel) { return; }
        var html = "", i, ins = inst();
        html += '<div class="piano-row"><button class="modal-btn' + (rec ? " piano-rec-on" : "") + '" data-sa="rec">' + (rec ? "&#x23F9;&#xFE0F; 録音をとめる" : "&#x1F534; 録音") + '</button>' +
          '<button class="modal-btn' + (play ? " piano-rec-on" : "") + '" data-sa="play"' + (rec ? " disabled" : "") + '>' + (play ? "&#x23F9;&#xFE0F; とめる" : "&#x25B6;&#xFE0F; 再生") + '</button></div>' +
          '<div class="piano-row"><button class="modal-btn" data-sa="bpmdown">&minus;</button><span>BPM ' + bpm + '</span><button class="modal-btn" data-sa="bpmup">&#xFF0B;</button>' +
          '<button class="modal-btn" data-sa="metro" title="録音のメトロノーム">' + METRO + ' ' + (metro ? "ON" : "OFF") + '</button></div>';
        html += '<div class="piano-row"><button class="modal-btn' + (prefs.tab === "play" ? " piano-rec-on" : "") + '" data-sa="tab:play">弾き方</button><button class="modal-btn' + (prefs.tab === "key" ? " piano-rec-on" : "") + '" data-sa="tab:key">キー</button></div>';
        if (prefs.tab === "key") {
          html += '<div class="piano-row"><button class="modal-btn" data-sa="keydown">&#x25C0;</button><span>キー ' + STR_CDE[prefs.key] + '</span><button class="modal-btn" data-sa="keyup">&#x25B6;</button>' +
            '<button class="modal-btn" data-sa="sev">' + (prefs.sev ? "7th" : "3和音") + '</button></div>' +
            '<div class="piano-row"><label class="piano-select">&#x1F3B5; <select data-sscale="1">' + scaleOptions() + '</select></label></div>';
        } else {
          html += '<div class="piano-row">';
          for (i = 0; i < STR_VIEWS.length; i++) { html += '<button class="modal-btn' + (view === STR_VIEWS[i][0] ? " piano-rec-on" : "") + '" data-sa="view:' + STR_VIEWS[i][0] + '">' + STR_VIEWS[i][1] + '</button>'; }
          html += '</div><div class="piano-opts">';
          for (i = 0; i < STR_INSTS.length; i++) { html += '<button class="modal-btn quiz-opt' + (prefs.inst === STR_INSTS[i][0] ? " active" : "") + '" data-sa="inst:' + STR_INSTS[i][0] + '">' + STR_INSTS[i][1] + '</button>'; }
          html += '</div>';
          if (view === "solo") {
            if (ins[4]) {
              html += '<div class="piano-row"><button class="modal-btn' + (prefs.bow ? " piano-rec-on" : "") + '" data-sa="bow">&#x1F3BB; 弓で弾く: ' + (prefs.bow ? "ON" : "OFF") + '</button>' +
                '<button class="modal-btn' + (prefs.vib ? " piano-rec-on" : "") + '" data-sa="vib">ビブラート: ' + (prefs.vib ? "ON" : "OFF") + '</button></div>';
            }
            html += '<div class="piano-row"><button class="modal-btn' + (prefs.snap ? " piano-rec-on" : "") + '" data-sa="snap">音程ガイド: ' + (prefs.snap ? "ON" : "OFF（自由）") + '</button></div>' +
              '<div class="piano-row"><button class="modal-btn" data-sa="posdown">&#x25C0;</button><span>' + (prefs.pos ? prefs.pos + "〜" + (prefs.pos + STR_COLS - 1) : "開放弦〜" + (STR_COLS - 1)) + '</span><button class="modal-btn" data-sa="posup">&#x25B6;</button></div>' +
              '<p class="small" style="margin:4px 0 0;">' + (!ins[4] ? "指板をタップするとはじく" : prefs.bow ? "左手で指板を押さえて、右の「弓」の所をこする（速いほど大きい・止めると消える）" : "指板を押しているあいだ鳴る") + '。押さえたまま横にすべらせると音程がなめらかに変わる</p>';
          } else {
            html += '<p class="small" style="margin:4px 0 0;">ボタンを押しているあいだ和音がのびる（キー 1〜7 も）</p>';
          }
        }
        if (take && !rec) { html += '<p class="small" style="margin:4px 0 0;">いまのテイク: ' + escHtml(take.name) + '（' + take.notes.length + '音・BPM ' + take.bpm + '）</p>'; }
        if (msg) { html += '<p class="small" style="margin:4px 0 0;color:#ffd166;">' + msg + '</p>'; }
        panel.innerHTML = html;
        var bs = panel.querySelectorAll ? panel.querySelectorAll("button[data-sa]") : [];
        for (i = 0; i < bs.length; i++) { bs[i].onclick = function (ev) { if (ev.currentTarget.blur) { ev.currentTarget.blur(); } action(ev.currentTarget.getAttribute("data-sa")); }; }
        var sel = panel.querySelector ? panel.querySelector("select[data-sscale]") : null;
        if (sel) { sel.onchange = function (ev) { if (ev.currentTarget.blur) { ev.currentTarget.blur(); } action("scale:" + ev.currentTarget.value); }; }
      }
      render();

      // --- 描く ---
      function text(ctx, s, x, y, size, color) { ctx.fillStyle = color; ctx.font = "bold " + size + "px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(s, x, y); }
      function drawSolo(ctx) {
        var cw = strColW(), rh = strRowH(), top = STR_BOARD_Y, bot = STR_BOARD_BOT, ins = inst(), spc = B.scalePcs(prefs.key, prefs.scale), r, c;
        ctx.fillStyle = "#2b1d14";
        ctx.fillRect(STR_BOARD_X, top, STR_BOARD_R - STR_BOARD_X, bot - top);
        if (bowing()) {
          ctx.fillStyle = "#6b3f1f";
          ctx.fillRect(STR_BOW_X, top, W - 4 - STR_BOW_X, bot - top);
          ctx.fillStyle = "#c9a227";
          ctx.fillRect(STR_BOW_X + 4, top + 2, 3, bot - top - 4); // 駒
          text(ctx, "弓", STR_BOW_X + (W - 4 - STR_BOW_X) / 2, top - 7, 9, "#ffd166");
        }
        for (c = 0; c < STR_COLS; c++) {
          var f = prefs.pos + c, cx = STR_BOARD_X + (c + 0.5) * cw;
          if (STR_MARKS.indexOf(f) >= 0) { ctx.fillStyle = "rgba(232,216,184,0.5)"; ctx.beginPath(); ctx.arc(cx, top + rh * 2, 3, 0, Math.PI * 2); ctx.fill(); }
          if (c > 0) { ctx.fillStyle = "rgba(255,255,255,0.12)"; ctx.fillRect(STR_BOARD_X + c * cw - 0.5, top, 1, bot - top); }
          text(ctx, f === 0 ? "開放" : String(f), cx, top - 7, 8, "#adb5bd");
        }
        if (prefs.pos === 0) { ctx.fillStyle = "#f5f0e6"; ctx.fillRect(STR_BOARD_X + cw - 2, top, 3, bot - top); }
        for (r = 0; r < 4; r++) {
          var sn = strSnOfRow(r), sy = strRowLineY(r), open = ins[3][sn];
          for (c = 0; c < STR_COLS; c++) {
            var m = open + prefs.pos + c, sx = STR_BOARD_X + (c + 0.5) * cw;
            if (spc && spc[strPc(m)]) { var sk = spc[strPc(m)]; ctx.fillStyle = sk === 3 ? "#ffffff" : (sk === 2 ? "#f783ac" : "rgba(255,255,255,0.45)"); ctx.beginPath(); ctx.arc(sx, sy + rh * 0.3, sk === 1 ? 2 : 3, 0, Math.PI * 2); ctx.fill(); }
            var nm = strName(m, names);
            if (nm) { text(ctx, nm, sx, sy - rh * 0.3, 7, "rgba(255,255,255,0.55)"); }
          }
          var sounding = false, k;
          for (k in bows) { if (bows.hasOwnProperty(k) && bows[k].r === r && bows[k].lv > 0) { sounding = true; } }
          for (k in vo) { if (vo.hasOwnProperty(k) && k.charAt(0) === "t" && left[k.substring(1)] && left[k.substring(1)].sn === sn) { sounding = true; } }
          ctx.fillStyle = sounding ? "#ffe8a3" : "#cfcfcf";
          var th = 1 + sn * 0.5, wob = sounding ? Math.sin(frame * 2.1 + r) * 0.8 : 0;
          ctx.fillRect(STR_BOARD_X, sy - th / 2 + wob, (bowing() ? W - 4 : STR_BOARD_R) - STR_BOARD_X, th);
          hudText(ctx, STR_CDE[strPc(open)], 1, sy - rh * 0.3, "left");
        }
        // 左手の指
        for (var k2 in left) {
          if (!left.hasOwnProperty(k2)) { continue; }
          var L = left[k2], semi = prefs.snap ? Math.round(Math.max(0, L.semi)) : Math.max(0, L.semi), lx = STR_BOARD_X + (semi - prefs.pos + 0.5) * cw;
          ctx.fillStyle = "#ffd166"; ctx.beginPath(); ctx.arc(lx, strRowLineY(3 - L.sn), Math.min(cw, rh) * 0.3, 0, Math.PI * 2); ctx.fill();
        }
        // 弓の指
        for (var k3 in bows) {
          if (!bows.hasOwnProperty(k3)) { continue; }
          var bw = bows[k3];
          ctx.fillStyle = "rgba(255,209,102," + (0.3 + Math.min(0.7, bw.lv)) + ")";
          ctx.fillRect(STR_BOW_X + 10, strRowLineY(bw.r) - 3, W - 18 - STR_BOW_X, 6);
        }
      }
      function drawChords(ctx) {
        for (var i = 0; i < 7; i++) {
          var r = strChordRect(i), ch = chordObj(i), on = false, k;
          for (k in held) { if (held.hasOwnProperty(k) && held[k].d === i) { on = true; } }
          ctx.fillStyle = on ? "#ffd166" : (flash["c" + i] > 0 ? "#fff3b0" : "#2f4a6e");
          ctx.fillRect(r.x, r.y, r.w, r.h);
          text(ctx, ch.deg, r.x + r.w / 2, r.y + r.h / 2 - 18, 11, on ? "#14213d" : "#adb5bd");
          text(ctx, ch.name, r.x + r.w / 2, r.y + r.h / 2 + 6, ch.name.length > 5 ? 15 : 20, on ? "#14213d" : "#ffffff");
        }
      }
      return {
        input: function (a, down) {
          var mk = /^c([0-6])$/.exec(a);
          if (mk) {
            if (view !== "chord") { return; }
            if (down) { chordOn("key" + mk[1], Number(mk[1])); } else { chordOff("key" + mk[1]); render(); }
            return;
          }
          if (down) { action(a); }
        },
        pointer: function (type, x, y, id) {
          var pid = String(id === undefined ? 0 : id);
          if (type === "down") {
            audio();
            if (view === "chord") { var d = strChordAt(x, y); if (d >= 0) { chordOn("p" + pid, d); } return; }
            var ins = inst(), cell = strBoardAt(x, y, prefs.pos);
            if (cell) {
              if (!ins[4]) { pluck(ins[3][cell.sn] + Math.max(0, Math.round(cell.semi)), 0.8); return; }
              left[pid] = { sn: cell.sn, semi: cell.semi };
              if (bowing()) { leftChanged(cell.sn); }
              else { noteOn("t" + pid, stringNote(cell.sn), 0.75, 0.05); }
              return;
            }
            var br = bowing() ? strBowRow(x, y) : -1;
            if (br >= 0) { bows[pid] = { r: br, x: x, y: y, f: frame, lv: 0, still: 0 }; noteOn("b" + pid, stringNote(strSnOfRow(br)), 0, 0.05); }
          } else if (type === "move") {
            if (left[pid]) {
              var L = left[pid], rowY = strRowLineY(3 - L.sn), c2 = strBoardAt(Math.max(STR_BOARD_X, Math.min(STR_BOARD_R - 1, x)), rowY, prefs.pos);
              if (c2) { L.semi = c2.semi; leftChanged(L.sn); }
              return;
            }
            var bw = bows[pid];
            if (bw) {
              var sp = (Math.abs(x - bw.x) + Math.abs(y - bw.y)) / Math.max(1, frame - bw.f), r2 = strBowRow(Math.max(STR_BOW_X, x), y);
              bw.x = x; bw.y = y; bw.f = frame;
              if (r2 >= 0 && r2 !== bw.r) { bw.r = r2; noteOff("b" + pid, 0.06); noteOn("b" + pid, stringNote(strSnOfRow(r2)), 0, 0.03); }
              var lv = strBowLevel(sp);
              if (lv > 0) { bw.lv = bw.lv * 0.5 + lv * 0.5; bw.still = 0; if (vo["b" + pid]) { strLevel(vo["b" + pid].v, bw.lv, 0.05); } }
            }
          } else {
            if (left[pid]) { var sn0 = left[pid].sn; delete left[pid]; noteOff("t" + pid, 0.15); leftChanged(sn0); return; }
            if (bows[pid]) { delete bows[pid]; noteOff("b" + pid, 0.25); return; }
            if (held["p" + pid]) { chordOff("p" + pid); render(); }
          }
        },
        step: function () {
          frame++;
          var k;
          for (k in flash) { if (flash.hasOwnProperty(k) && flash[k] > 0) { flash[k]--; } }
          // 弓が止まったら小さくなって消える
          for (k in bows) {
            if (!bows.hasOwnProperty(k)) { continue; }
            var bw = bows[k];
            if (frame - bw.f > 4) { bw.still++; if (bw.lv > 0) { bw.lv = Math.max(0, bw.lv - 0.08); if (vo["b" + k]) { strLevel(vo["b" + k].v, bw.lv, 0.08); } } }
          }
          if (play) {
            var pb = playBeat(), last = 0, i;
            while (play.idx < play.notes.length && play.notes[play.idx][0] <= pb) {
              var pn = play.notes[play.idx], v = null;
              if (play.inst[4]) { v = strVoice(play.inst[2], pn[2], out(), 0); strLevel(v, pn[3] || 0.8, 0.06); }
              else { pluck(pn[2], pn[3] || 0.8); }
              play.vo.push({ v: v, end: pn[0] + pn[1] });
              play.idx++;
            }
            for (i = play.vo.length - 1; i >= 0; i--) { if (pb >= play.vo[i].end) { strStop(play.vo[i].v, 0.2); play.vo.splice(i, 1); } }
            for (i = 0; i < play.notes.length; i++) { last = Math.max(last, play.notes[i][0] + play.notes[i][1]); }
            if (play.idx >= play.notes.length && pb > last) { playStop(); render(); }
          }
          if (rec) {
            var rb = Math.floor(recBeat());
            if (rb !== rec.beat && (metro || rb < 0)) { click(((rb % meter) + meter) % meter === 0); }
            rec.beat = rb;
          }
        },
        draw: function (ctx) {
          var g = ctx.createLinearGradient ? ctx.createLinearGradient(0, 0, 0, STR_H) : null;
          if (g) { g.addColorStop(0, "#1b1f3b"); g.addColorStop(1, "#3a2318"); }
          ctx.fillStyle = g || "#1b263b";
          ctx.fillRect(0, 0, W, STR_H);
          hudText(ctx, inst()[1].replace(/&#x[0-9A-F]+;\s*/g, "") + (view === "chord" ? " ・キー " + STR_CDE[prefs.key] : ""), 8, 10, "left");
          hudText(ctx, "BPM " + bpm, W - 8, 10, "right");
          if (rec) { var rb = recBeat(); text(ctx, rb < 0 ? String(Math.ceil(-rb)) : "● REC " + (Math.floor(rb / meter) + 1) + "小節・" + rec.notes.length + "音", W / 2, 28, 14, "#ff6b6b"); }
          if (view === "chord") { drawChords(ctx); return; }
          var line = [], k;
          for (k in vo) { if (vo.hasOwnProperty(k) && k.charAt(0) !== "k") { line.push(strName(vo[k].m, names === "none" ? "do" : names) + "（" + strName(vo[k].m, "cde") + "）"); } }
          if (!rec) { text(ctx, line.join(" ") || (play ? "再生中…" : bowing() ? "左手で押さえて、右の「弓」をこすろう" : "指板を押して弾こう"), W / 2, line.length ? 60 : 70, line.length ? 16 : 12, line.length ? "#ffd166" : "#ffffff"); }
          drawSolo(ctx);
        }
      };
    }
  });

  window.UGStrings = {
    H: STR_H, INSTS: STR_INSTS, VIEWS: STR_VIEWS, COLS: STR_COLS, BOARD_Y: STR_BOARD_Y, BOW_X: STR_BOW_X, PREFS_KEY: STR_PREFS_KEY, TAKES_KEY: STR_TAKES_KEY, TAKES_MAX: STR_TAKES_MAX, SEQ_MAX: STR_SEQ_MAX,
    layout: strLayout, boardAt: strBoardAt, bowRow: strBowRow, bowLevel: strBowLevel, rowLineY: strRowLineY, chordRect: strChordRect, chordAt: strChordAt, voicing: strVoicing,
    voice: strVoice, prefs: strPrefs, notesClean: strNotesClean, takesLoad: strTakesLoad, takeAdd: strTakeAdd, sendToSeq: strSendToSeq
  };
})();
