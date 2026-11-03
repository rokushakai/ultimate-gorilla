// =========================================================
// 究極ゴリラ ゲームセンター: 🎺 ゴリラホーン（§306〜）
// arcade.js・arcade-melody.js・arcade-bass.js・arcade-strings.js の後に読み込む。
// のばす音はゴリラストリングス（window.UGStrings）の voice / pitch / level / stop / vibrato を借りる。
// コード・スケール・音量の出口などはゴリラベース（window.UGBass）のもの
// =========================================================
(function () {
  "use strict";

  var I = window.UGArcade && window.UGArcade.internal;
  if (!I) { return; }
  var W = I.W, hudText = I.hudText, lsGet = I.lsGet, lsSet = I.lsSet, escHtml = I.escHtml;
  function BA() { return window.UGBass; }
  function SV() { return window.UGStrings; }

  var HRN_H = 320;
  var HRN_PREFS_KEY = "ultimateGorillaHornPrefsV1", HRN_TAKES_KEY = "ultimateGorillaHornTakesV1";
  var HRN_TAKES_MAX = 10, HRN_NOTES_MAX = 2000, HRN_SEQ_MAX = 1000;
  var HRN_DO = ["ド", "ド#", "レ", "レ#", "ミ", "ファ", "ファ#", "ソ", "ソ#", "ラ", "ラ#", "シ"];
  var HRN_CDE = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  var HRN_NAMES = [["do", "ドレミ"], ["cde", "CDE"], ["none", "なし"]];
  // 楽器 [id, 名前, GM, いちばん低い音, いちばん高い音]
  var HRN_INSTS = [
    ["trumpet", "&#x1F3BA; トランペット", 56, 54, 82], ["trombone", "トロンボーン", 57, 40, 72], ["tuba", "チューバ", 58, 28, 58], ["horn", "ホルン", 60, 41, 77],
    ["brass", "ブラスセクション", 61, 40, 84], ["ssax", "&#x1F3B7; ソプラノサックス", 64, 56, 87], ["asax", "アルトサックス", 65, 49, 80], ["tsax", "テナーサックス", 66, 44, 75],
    ["bsax", "バリトンサックス", 67, 36, 68], ["oboe", "オーボエ", 68, 58, 91], ["bassoon", "ファゴット", 70, 34, 75], ["clarinet", "クラリネット", 71, 50, 91], ["flute", "フルート", 73, 60, 96]
  ];
  function hrnOpt(list, id) { for (var i = 0; i < list.length; i++) { if (list[i][0] === id) { return list[i]; } } return list[0]; }
  function hrnPc(m) { return ((m % 12) + 12) % 12; }
  function hrnName(m, names) {
    if (names === "none") { return ""; }
    var r = Math.round(m);
    return names === "cde" ? HRN_CDE[hrnPc(r)] + (Math.floor(r / 12) - 1) : HRN_DO[hrnPc(r)];
  }

  // ---------- キー（3段。下の段がいちばん低い）----------
  var HRN_ROWS = 3, HRN_KEY_Y = 60, HRN_KEY_BOT = 314;
  // 段の音（chrom: 半音階）: ルートからオクターブ上のルートまで（スケール 8・半音階 13）
  function hrnRowNotes(base, scale, chrom) {
    var out = [], i, sc = BA().scale(scale)[2];
    if (chrom) { for (i = 0; i <= 12; i++) { out.push(base + i); } return out; }
    for (i = 0; i < 7; i++) { out.push(base + sc[i]); }
    out.push(base + 12);
    return out;
  }
  // いちばん下の段のルート（楽器の音域の下のほう・キーの音名）。oct で上下
  function hrnBase(ins, key, oct) { var low = ins[3] + 2; return low + ((key - hrnPc(low) + 12) % 12) + oct * 12; }
  function hrnRowH() { return (HRN_KEY_BOT - HRN_KEY_Y) / HRN_ROWS; }
  // 段 r（0 ＝ 上）・列 c（n 列）の四角
  function hrnKeyRect(r, c, n) { var w = (W - 8) / n, h = hrnRowH(); return { x: 4 + c * w + 1.5, y: HRN_KEY_Y + r * h + 2, w: w - 3, h: h - 4 }; }
  // 座標 → { r, c, fy: 上からの割合 }（外は null）
  function hrnKeyAt(x, y, n) {
    if (x < 4 || x >= W - 4 || y < HRN_KEY_Y || y >= HRN_KEY_BOT) { return null; }
    var h = hrnRowH(), r = Math.floor((y - HRN_KEY_Y) / h), c = Math.floor((x - 4) / ((W - 8) / n));
    return { r: r, c: Math.max(0, Math.min(n - 1, c)), fy: (y - (HRN_KEY_Y + r * h)) / h };
  }
  // 息の強さ（キーの上からの割合 → 0.35〜1.1。上ほど強い）
  function hrnBreath(fy) { return Math.max(0.35, Math.min(1.1, 1.1 - Math.max(0, Math.min(1, fy)) * 0.75)); }

  // ---------- 設定・テイク ----------
  function hrnPrefs() {
    var p = lsGet(HRN_PREFS_KEY) || {}, key = Math.round(Number(p.key)), oct = Math.round(Number(p.oct)), B = BA();
    return {
      inst: hrnOpt(HRN_INSTS, p.inst)[0], names: p.names === "cde" || p.names === "none" ? p.names : "do",
      key: key >= 0 && key <= 11 ? key : 0, scale: B ? B.scale(p.scale)[0] : "major", oct: oct >= -1 && oct <= 1 ? oct : 0,
      chrom: !!p.chrom, legato: p.legato !== false, vib: p.vib !== false, bend: p.bend !== false, tab: p.tab === "key" ? "key" : "play",
      bpm: Math.max(40, Math.min(240, Math.round(Number(p.bpm) || 100))), metro: p.metro !== false
    };
  }
  function hrnSavePrefs(p) { return lsSet(HRN_PREFS_KEY, p); }
  function hrnTakeClean(t, i) {
    var S = SV();
    return {
      id: Math.max(1, Math.round(Number(t.id)) || i + 1), name: String(t.name || "テイク").slice(0, 20),
      bpm: Math.max(40, Math.min(240, Math.round(Number(t.bpm) || 100))), meter: t.meter === 3 ? 3 : 4,
      inst: hrnOpt(HRN_INSTS, t.inst)[0], notes: S.notesClean(t.notes)
    };
  }
  function hrnTakesLoad() {
    var a = lsGet(HRN_TAKES_KEY), out = [], i;
    if (!a || !a.length) { return out; }
    for (i = 0; i < a.length && out.length < HRN_TAKES_MAX; i++) { if (a[i] && typeof a[i] === "object") { out.push(hrnTakeClean(a[i], i)); } }
    return out;
  }
  function hrnTakesSave(list) { return lsSet(HRN_TAKES_KEY, list.slice(0, HRN_TAKES_MAX)); }
  function hrnTakeAdd(list, t) {
    var id = 0, i;
    for (i = 0; i < list.length; i++) { id = Math.max(id, list[i].id); }
    var take = hrnTakeClean({ id: id + 1, name: t.name || "ホーン " + (id + 1), bpm: t.bpm, meter: t.meter, inst: t.inst, notes: t.notes }, 0);
    list.unshift(take);
    if (list.length > HRN_TAKES_MAX) { list.length = HRN_TAKES_MAX; }
    return take;
  }
  function hrnTakeById(list, id) { for (var i = 0; i < list.length; i++) { if (list[i].id === id) { return list[i]; } } return null; }
  function hrnSendToSeq(take) {
    var U = window.UGUkulele, S = SV();
    if (!U || !U.seqLoad || !U.xAdd) { return { ok: false, msg: "ゴリラウクレレが読みこめませんでした" }; }
    if (!take || !take.notes || !take.notes.length) { return { ok: false, msg: "音のないテイクは送れません" }; }
    var st = U.seqLoad(), id = U.xAdd(st.cur.tracks, "hnotes");
    if (!id) { return { ok: false, msg: "追加トラックがいっぱいです（8本まで）。シーケンサーで1本消してから送ってね" }; }
    var t = st.cur.tracks[id], n = S.notesClean(take.notes), cut = n.length > HRN_SEQ_MAX;
    t.name = String(take.name).slice(0, 12);
    t.prog = hrnOpt(HRN_INSTS, take.inst)[2];
    t.notes = n.slice(0, HRN_SEQ_MAX);
    U.seqSave(st);
    return { ok: true, id: id, cut: cut, msg: "「" + take.name + "」を、ゴリラウクレレのシーケンサー（編集中の曲）に 🎺 管楽器打ち込みトラックとして送りました" + (cut ? "（音が多いので、はじめの " + HRN_SEQ_MAX + " 音）" : "") };
  }

  // ---------- はじめの画面 ----------
  function hrnSetup(root, ctl) {
    var p = hrnPrefs(), note = "";
    function opts(list, cur, attr) {
      var h = "", i;
      for (i = 0; i < list.length; i++) { h += '<button class="modal-btn quiz-opt' + (cur === list[i][0] ? " active" : "") + '" data-' + attr + '="' + list[i][0] + '">' + list[i][1] + '</button>'; }
      return h;
    }
    function draw() {
      var takes = hrnTakesLoad(), i;
      var html = '<div class="melody-setup"><h3 style="margin:0 0 4px;">&#x1F3BA; ゴリラホーン</h3>' +
        '<p class="small" style="color:#adb5bd;margin:0 0 8px;">トランペットからフルートまで13の管楽器。キーの上のほうを押すほど強く吹ける。</p>' +
        '<p class="small" style="margin:4px 0 2px;">楽器</p><div class="piano-opts">' + opts(HRN_INSTS, p.inst, "inst") + '</div>' +
        '<p class="small" style="margin:4px 0 2px;">音名</p><div class="quiz-opts">' + opts(HRN_NAMES, p.names, "names") + '</div>' +
        '<button class="modal-btn" data-go="1" style="width:100%;margin-top:8px;">&#x1F3BA; はじめる</button>' +
        '<p class="small" style="margin:10px 0 2px;">&#x1F399;&#xFE0F; 録音したテイク（' + takes.length + ' / ' + HRN_TAKES_MAX + '）</p>';
      if (note) { html += '<p class="small" style="color:#ffd166;margin:0 0 4px;">' + note + '</p>'; }
      if (!takes.length) { html += '<p class="small" style="color:#adb5bd;margin:0;">まだありません。吹く画面の「🔴 録音」で録れます。</p>'; }
      for (i = 0; i < takes.length; i++) {
        html += '<div class="piano-take"><span>' + escHtml(takes[i].name) + '<br><span class="small" style="color:#adb5bd;">' + takes[i].notes.length + '音・BPM ' + takes[i].bpm + '・' + hrnOpt(HRN_INSTS, takes[i].inst)[1] + '</span></span>' +
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
          if ((v = el.getAttribute("data-inst"))) { p.inst = v; hrnSavePrefs(p); draw(); return; }
          if ((v = el.getAttribute("data-names"))) { p.names = v; hrnSavePrefs(p); draw(); return; }
          if ((v = el.getAttribute("data-send"))) { var rs = hrnSendToSeq(hrnTakeById(hrnTakesLoad(), Number(v))); note = (rs.ok ? "&#x2705; " : "&#x26A0;&#xFE0F; ") + escHtml(rs.msg); draw(); return; }
          if ((v = el.getAttribute("data-del"))) {
            var list = hrnTakesLoad(), t = hrnTakeById(list, Number(v));
            if (!t || (window.confirm && !window.confirm("「" + t.name + "」を消しますか？"))) { return; }
            list.splice(list.indexOf(t), 1);
            hrnTakesSave(list);
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

  // 下の段 A〜K・まん中の段 Q〜I（押しているあいだ）、Z 録音・X 再生
  var HRN_KEYS = { a: "k2:0", s: "k2:1", d: "k2:2", f: "k2:3", g: "k2:4", h: "k2:5", j: "k2:6", k: "k2:7", q: "k1:0", w: "k1:1", e: "k1:2", r: "k1:3", t: "k1:4", y: "k1:5", u: "k1:6", i: "k1:7", z: "rec", x: "play" };

  I.register({
    id: "horn",
    after: "strings",
    cat: "music",
    music: true,
    name: "ゴリラホーン",
    icon: "&#x1F3BA;",
    desc: "トランペット・サックス・フルートなど13の管楽器。キーの上のほうを押すほど強く吹ける",
    help: "キーを押しているあいだ鳴る（上のほうほど強い・押したまま上下で強さが変わる・横にずらすとベンド）/ 押したまま別のキーへ ＝ スラー / キー A〜K（下の段）・Q〜I（まん中）/ Z 録音 / X 再生 / P一時停止",
    controls: [],
    keys: HRN_KEYS,
    setup: hrnSetup,
    setupLabel: "楽器・テイク",
    panel: true,
    create: function (api, cfg) {
      cfg = cfg || {};
      var B = BA(), S = SV(), prefs = hrnPrefs(), names = prefs.names;
      var frame = 0, msg = "", panel = api.panel;
      if (panel && panel.classList) { panel.classList.add("quiz-panel"); }
      if (api.setLandscape) { api.setLandscape(false); }
      if (api.setCanvasHeight) { api.setCanvasHeight(HRN_H); }
      function inst() { return hrnOpt(HRN_INSTS, prefs.inst); }
      function now() { return frame / 60; }
      function cols() { return prefs.chrom ? 13 : 8; }
      // 段 r（0 ＝ 上）の音
      function rowNotes(r) { return hrnRowNotes(hrnBase(inst(), prefs.key, prefs.oct) + (HRN_ROWS - 1 - r) * 12, prefs.scale, prefs.chrom); }

      // --- 音 ---
      var UG = window.UGMelody, audioOk = false, buses = {};
      function audio() {
        if (audioOk || !UG || !UG.audioInit) { return; }
        try { if (UG.audioInit()) { audioOk = true; UG.loadSamples([inst()[2]]); } } catch (e) {}
      }
      function out() { return audioOk && B.bus ? B.bus(buses, "h", 100, false) : null; }
      function click(accent) { if (audioOk) { try { UG.synth(accent ? 37 : 42, UG.DRUM, 0, accent ? 0.9 : 0.6); } catch (e) {} } }

      // --- 吹いている音（1つだけ）。指の重なり held: [{ id, m, x0, w, lv, bd }]（あとから押したものが上）---
      var held = [], tone = null; // tone: { v, m: 鳴らしている音（ベンド前）, lv }
      function top() { return held.length ? held[held.length - 1] : null; }
      function sounding() {
        var h = top();
        if (!h) {
          if (tone) { S.stop(tone.v, 0.18); recOff(); tone = null; }
          return;
        }
        audio();
        var m = h.m + (prefs.bend ? h.bd : 0);
        if (tone && prefs.legato) {
          S.pitch(tone.v, m, 0.05);
          S.level(tone.v, h.lv, 0.06);
          if (h.m !== tone.m) { recOff(); recOn(h.m, h.lv); }
          tone.m = h.m; tone.lv = h.lv;
          return;
        }
        if (tone && tone.m === h.m) { S.pitch(tone.v, m, 0.03); S.level(tone.v, h.lv, 0.06); tone.lv = h.lv; return; }
        if (tone) { S.stop(tone.v, 0.06); recOff(); }
        var v = S.voice(inst()[2], m, out(), 0);
        S.level(v, h.lv, 0.04);
        if (prefs.vib) { S.vibrato(v, true); }
        tone = { v: v, m: h.m, lv: h.lv };
        recOn(h.m, h.lv);
      }
      function press(id, m, x0, w, lv, r) {
        release(id, true);
        held.push({ id: id, m: m, x0: x0, w: w, lv: lv, bd: 0, r: r });
        if (!prefs.legato && tone) { S.stop(tone.v, 0.05); recOff(); tone = null; }
        sounding();
      }
      function release(id, quiet) {
        for (var i = held.length - 1; i >= 0; i--) { if (held[i].id === id) { held.splice(i, 1); } }
        if (!quiet) { sounding(); }
      }
      function allOff() { held = []; sounding(); }

      // --- 録音・再生 ---
      var bpm = prefs.bpm, meter = 4, metro = prefs.metro, takes = hrnTakesLoad();
      var take = cfg.take ? hrnTakeById(takes, cfg.take) : null, rec = null, play = null;
      if (take) { msg = "「" + escHtml(take.name) + "」をひらきました。▶ 再生で聴けます"; }
      function recBeat() { return rec ? (now() - rec.t0) * bpm / 60 : 0; }
      function r3(v) { return Math.round(v * 1000) / 1000; }
      function recToggle() {
        if (rec) { recStop(); return; }
        playStop();
        audio();
        rec = { t0: now() + meter * 60 / bpm, notes: [], open: null, beat: -meter - 1 };
        msg = "";
        render();
      }
      function recOn(m, v) {
        if (!rec) { return; }
        var b = recBeat();
        if (b < -0.25 || rec.notes.length >= HRN_NOTES_MAX) { return; }
        rec.open = [Math.max(0, b), m, Math.min(1, v || 0.8)];
      }
      function recOff() {
        if (!rec || !rec.open) { return; }
        var o = rec.open, nt = [r3(o[0]), r3(Math.max(0.0625, recBeat() - o[0])), o[1]];
        rec.open = null;
        if (o[2] !== 0.8) { nt.push(r3(Math.max(0.1, o[2]))); }
        rec.notes.push(nt);
      }
      function recStop() {
        recOff();
        var n = rec.notes;
        rec = null;
        if (n.length) {
          take = hrnTakeAdd(takes, { bpm: bpm, meter: meter, inst: prefs.inst, notes: n });
          hrnTakesSave(takes);
          msg = "&#x1F4BE; 「" + escHtml(take.name) + "」に保存しました（" + take.notes.length + "音）<br>はじめの画面の「🎸 送る」でシーケンサーに入れられます";
        } else { msg = "音がなかったので保存しませんでした"; }
        render();
      }
      function playBeat() { return play ? (now() - play.t0) * play.bpm / 60 : 0; }
      function playStop() { if (!play) { return; } for (var i = 0; i < play.vo.length; i++) { S.stop(play.vo[i].v, 0.12); } play = null; }
      function playToggle() {
        if (play) { playStop(); render(); return; }
        if (rec) { return; }
        if (!take || !take.notes.length) { msg = "まだテイクがありません。🔴 録音で録ってね"; render(); return; }
        audio();
        play = { t0: now() + 0.1, bpm: take.bpm, notes: take.notes, idx: 0, vo: [], ins: hrnOpt(HRN_INSTS, take.inst) };
        render();
      }

      // --- パネル ---
      var METRO = B.METRO_ICON || "&#x23F1;&#xFE0F;";
      function scaleOptions() {
        var h = "", gs = B.SCALE_GROUPS || [["", B.SCALES.map(function (s0) { return s0[0]; })]], i, j;
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
        else if (v === "metro") { metro = !metro; prefs.metro = metro; hrnSavePrefs(prefs); render(); }
        else if (v === "bpmdown" || v === "bpmup") { if (rec) { return; } bpm = Math.max(40, Math.min(240, bpm + (v === "bpmup" ? 5 : -5))); prefs.bpm = bpm; hrnSavePrefs(prefs); render(); }
        else if (/^inst:/.test(v)) { allOff(); prefs.inst = hrnOpt(HRN_INSTS, v.substring(5))[0]; hrnSavePrefs(prefs); if (audioOk) { try { UG.loadSamples([inst()[2]]); } catch (e) {} } render(); }
        else if (/^tab:/.test(v)) { prefs.tab = v.substring(4) === "key" ? "key" : "play"; hrnSavePrefs(prefs); render(); }
        else if (v === "chrom" || v === "legato" || v === "vib" || v === "bend") { allOff(); prefs[v] = !prefs[v]; hrnSavePrefs(prefs); render(); }
        else if (v === "octdown" || v === "octup") { allOff(); prefs.oct = Math.max(-1, Math.min(1, prefs.oct + (v === "octup" ? 1 : -1))); hrnSavePrefs(prefs); render(); }
        else if (v === "keydown" || v === "keyup") { allOff(); prefs.key = (prefs.key + (v === "keyup" ? 1 : 11)) % 12; hrnSavePrefs(prefs); render(); }
        else if (/^scale:/.test(v)) { allOff(); prefs.scale = B.scale(v.substring(6))[0]; hrnSavePrefs(prefs); render(); }
      }
      function render() {
        if (!panel) { return; }
        var html = "", i;
        html += '<div class="piano-row"><button class="modal-btn' + (rec ? " piano-rec-on" : "") + '" data-ha="rec">' + (rec ? "&#x23F9;&#xFE0F; 録音をとめる" : "&#x1F534; 録音") + '</button>' +
          '<button class="modal-btn' + (play ? " piano-rec-on" : "") + '" data-ha="play"' + (rec ? " disabled" : "") + '>' + (play ? "&#x23F9;&#xFE0F; とめる" : "&#x25B6;&#xFE0F; 再生") + '</button></div>' +
          '<div class="piano-row"><button class="modal-btn" data-ha="bpmdown">&minus;</button><span>BPM ' + bpm + '</span><button class="modal-btn" data-ha="bpmup">&#xFF0B;</button>' +
          '<button class="modal-btn" data-ha="metro" title="録音のメトロノーム">' + METRO + ' ' + (metro ? "ON" : "OFF") + '</button></div>' +
          '<div class="piano-row"><button class="modal-btn' + (prefs.tab === "play" ? " piano-rec-on" : "") + '" data-ha="tab:play">吹き方</button><button class="modal-btn' + (prefs.tab === "key" ? " piano-rec-on" : "") + '" data-ha="tab:key">キー</button></div>';
        if (prefs.tab === "key") {
          html += '<div class="piano-row"><button class="modal-btn" data-ha="keydown">&#x25C0;</button><span>キー ' + HRN_CDE[prefs.key] + '</span><button class="modal-btn" data-ha="keyup">&#x25B6;</button>' +
            '<button class="modal-btn' + (prefs.chrom ? " piano-rec-on" : "") + '" data-ha="chrom">' + (prefs.chrom ? "半音階" : "スケール") + '</button></div>' +
            '<div class="piano-row"><label class="piano-select">&#x1F3B5; <select data-hscale="1">' + scaleOptions() + '</select></label></div>';
        } else {
          html += '<div class="piano-opts">';
          for (i = 0; i < HRN_INSTS.length; i++) { html += '<button class="modal-btn quiz-opt' + (prefs.inst === HRN_INSTS[i][0] ? " active" : "") + '" data-ha="inst:' + HRN_INSTS[i][0] + '">' + HRN_INSTS[i][1] + '</button>'; }
          html += '</div><div class="piano-row"><button class="modal-btn" data-ha="octdown">&#x25C0;</button><span>オクターブ ' + (prefs.oct > 0 ? "+" : "") + prefs.oct + '</span><button class="modal-btn" data-ha="octup">&#x25B6;</button></div>' +
            '<div class="piano-row"><button class="modal-btn' + (prefs.legato ? " piano-rec-on" : "") + '" data-ha="legato">スラー: ' + (prefs.legato ? "ON" : "OFF") + '</button>' +
            '<button class="modal-btn' + (prefs.vib ? " piano-rec-on" : "") + '" data-ha="vib">ビブラート: ' + (prefs.vib ? "ON" : "OFF") + '</button>' +
            '<button class="modal-btn' + (prefs.bend ? " piano-rec-on" : "") + '" data-ha="bend">ベンド: ' + (prefs.bend ? "ON" : "OFF") + '</button></div>' +
            '<p class="small" style="margin:4px 0 0;">キーの上のほうを押すほど強い（押したまま上下で強さが変わる）。横にずらすとベンド。押したまま別のキーへ ＝ スラー</p>';
        }
        if (take && !rec) { html += '<p class="small" style="margin:4px 0 0;">いまのテイク: ' + escHtml(take.name) + '（' + take.notes.length + '音・BPM ' + take.bpm + '）</p>'; }
        if (msg) { html += '<p class="small" style="margin:4px 0 0;color:#ffd166;">' + msg + '</p>'; }
        panel.innerHTML = html;
        var bs = panel.querySelectorAll ? panel.querySelectorAll("button[data-ha]") : [];
        for (i = 0; i < bs.length; i++) { bs[i].onclick = function (ev) { if (ev.currentTarget.blur) { ev.currentTarget.blur(); } action(ev.currentTarget.getAttribute("data-ha")); }; }
        var sel = panel.querySelector ? panel.querySelector("select[data-hscale]") : null;
        if (sel) { sel.onchange = function (ev) { if (ev.currentTarget.blur) { ev.currentTarget.blur(); } action("scale:" + ev.currentTarget.value); }; }
      }
      render();

      // --- 描く ---
      function text(ctx, s, x, y, size, color) { ctx.fillStyle = color; ctx.font = "bold " + size + "px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(s, x, y); }
      function drawKeys(ctx) {
        var n = cols(), r, c, h = top(), lit = h ? h.m : null;
        for (r = 0; r < HRN_ROWS; r++) {
          var ns = rowNotes(r);
          for (c = 0; c < n; c++) {
            var m = ns[c], rc = hrnKeyRect(r, c, n), on = lit === m, isRoot = hrnPc(m) === prefs.key, inRange = m >= inst()[3] && m <= inst()[4];
            var g = ctx.createLinearGradient ? ctx.createLinearGradient(0, rc.y, 0, rc.y + rc.h) : null;
            if (g) { g.addColorStop(0, on ? "#ffe066" : (isRoot ? "#4c6ef5" : "#3b5bdb")); g.addColorStop(1, on ? "#f08c00" : (isRoot ? "#22356e" : "#1c2a5c")); }
            ctx.fillStyle = g || (on ? "#ffd166" : "#2f4a6e");
            if (!inRange) { ctx.globalAlpha = 0.45; }
            ctx.fillRect(rc.x, rc.y, rc.w, rc.h);
            ctx.globalAlpha = 1;
            var nm = hrnName(m, names);
            if (nm) { text(ctx, nm, rc.x + rc.w / 2, rc.y + rc.h - 12, n > 8 ? 8 : 11, on ? "#14213d" : "#ffffff"); }
            if (c === 0 || c === n - 1) { text(ctx, HRN_CDE[hrnPc(m)] + (Math.floor(m / 12) - 1), rc.x + rc.w / 2, rc.y + 9, 7, on ? "#14213d" : "rgba(255,255,255,0.5)"); }
          }
        }
        // 息の強さ・ベンドの印
        if (h && tone) {
          var bar = Math.max(0, Math.min(1, (h.lv - 0.35) / 0.75));
          ctx.fillStyle = "#ff922b"; ctx.fillRect(W - 10, HRN_KEY_Y - 6 - 40 * bar, 6, 40 * bar);
          if (prefs.bend && Math.abs(h.bd) > 0.05) { text(ctx, (h.bd > 0 ? "⤴+" : "⤵") + h.bd.toFixed(1), W / 2, HRN_KEY_Y - 8, 10, "#ff922b"); }
        }
      }
      return {
        input: function (a, down) {
          var mk = /^k([12]):(\d)$/.exec(a);
          if (mk) {
            if (prefs.chrom) { return; }
            var r = Number(mk[1]), c = Number(mk[2]);
            if (down) { press("key" + a, rowNotes(r)[c], 0, 1, 0.8, r); } else { release("key" + a); }
            return;
          }
          if (down) { action(a); }
        },
        pointer: function (type, x, y, id) {
          var pid = "p" + (id === undefined ? 0 : id), n = cols(), k, i;
          if (type === "down") {
            k = hrnKeyAt(x, y, n);
            if (!k) { return; }
            press(pid, rowNotes(k.r)[k.c], x, (W - 8) / n, hrnBreath(k.fy), k.r);
          } else if (type === "move") {
            var h = null;
            for (i = 0; i < held.length; i++) { if (held[i].id === pid) { h = held[i]; } }
            if (!h) { return; }
            k = hrnKeyAt(Math.max(4, Math.min(W - 5, x)), Math.max(HRN_KEY_Y, Math.min(HRN_KEY_BOT - 1, y)), n);
            if (!k) { return; }
            var m2 = rowNotes(k.r)[k.c];
            // 別のキーへ: 縦に段を変えた・横に大きく動いた（ベンド OFF）ときは スラー
            if (m2 !== h.m && (!prefs.bend || k.r !== h.r || Math.abs(x - h.x0) > h.w * 1.5)) { h.m = m2; h.x0 = x; h.r = k.r; h.bd = 0; }
            else if (prefs.bend) { h.bd = Math.max(-1, Math.min(1, Math.round((x - h.x0) / h.w * 20) / 20)); }
            h.lv = hrnBreath(k.fy);
            if (h === top()) { sounding(); }
          } else {
            release(pid);
          }
        },
        step: function () {
          frame++;
          if (play) {
            var pb = playBeat(), last = 0, i;
            while (play.idx < play.notes.length && play.notes[play.idx][0] <= pb) {
              var pn = play.notes[play.idx], v = S.voice(play.ins[2], pn[2], out(), 0);
              S.level(v, pn[3] || 0.8, 0.04);
              play.vo.push({ v: v, end: pn[0] + pn[1] });
              play.idx++;
            }
            for (i = play.vo.length - 1; i >= 0; i--) { if (pb >= play.vo[i].end) { S.stop(play.vo[i].v, 0.12); play.vo.splice(i, 1); } }
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
          var g = ctx.createLinearGradient ? ctx.createLinearGradient(0, 0, 0, HRN_H) : null;
          if (g) { g.addColorStop(0, "#1b1f3b"); g.addColorStop(1, "#3a2e12"); }
          ctx.fillStyle = g || "#1b263b";
          ctx.fillRect(0, 0, W, HRN_H);
          hudText(ctx, inst()[1].replace(/&#x[0-9A-F]+;\s*/g, "") + " ・キー " + HRN_CDE[prefs.key], 8, 10, "left");
          hudText(ctx, "BPM " + bpm, W - 8, 10, "right");
          var h = top();
          if (rec) { var rb = recBeat(); text(ctx, rb < 0 ? String(Math.ceil(-rb)) : "● REC " + (Math.floor(rb / meter) + 1) + "小節・" + rec.notes.length + "音", W / 2, 32, 14, "#ff6b6b"); }
          else { text(ctx, h ? hrnName(h.m, names === "none" ? "do" : names) + "（" + hrnName(h.m, "cde") + "）" : (play ? "再生中…" : "キーを押して吹こう（上のほうほど強い）"), W / 2, 34, h ? 16 : 12, h ? "#ffd166" : "#ffffff"); }
          drawKeys(ctx);
        }
      };
    }
  });

  window.UGHorn = {
    H: HRN_H, INSTS: HRN_INSTS, ROWS: HRN_ROWS, KEY_Y: HRN_KEY_Y, PREFS_KEY: HRN_PREFS_KEY, TAKES_KEY: HRN_TAKES_KEY,
    rowNotes: hrnRowNotes, base: hrnBase, keyRect: hrnKeyRect, keyAt: hrnKeyAt, breath: hrnBreath, prefs: hrnPrefs, takesLoad: hrnTakesLoad, takeById: hrnTakeById, sendToSeq: hrnSendToSeq
  };
})();
