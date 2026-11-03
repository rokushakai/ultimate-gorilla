// =========================================================
// 究極ゴリラ ゲームセンター: 🎛️ ゴリラシンセ（§319〜）
// arcade.js・arcade-melody.js・arcade-bass.js・arcade-strings.js の後に読み込む。
// 音は Web Audio のオシレーター・フィルターで作る。音量の出口・スケールはゴリラベース（window.UGBass）、
// 録音の音符の形はゴリラストリングス（window.UGStrings）のもの
// =========================================================
(function () {
  "use strict";

  var I = window.UGArcade && window.UGArcade.internal;
  if (!I) { return; }
  var W = I.W, hudText = I.hudText, lsGet = I.lsGet, lsSet = I.lsSet, escHtml = I.escHtml;
  function BA() { return window.UGBass; }
  function SV() { return window.UGStrings; }

  var SYN_H = 320, SYN_TOP = 36, SYN_PAD_BOT = 150, SYN_KB_Y = 158, SYN_KB_BOT = 316, SYN_WHITES = 10;
  var SYN_PREFS_KEY = "ultimateGorillaSynthPrefsV1", SYN_TAKES_KEY = "ultimateGorillaSynthTakesV1";
  var SYN_TAKES_MAX = 10, SYN_NOTES_MAX = 2000, SYN_SEQ_MAX = 1000, SYN_SEQ_PROG = 81;
  var SYN_DO = ["ド", "ド#", "レ", "レ#", "ミ", "ファ", "ファ#", "ソ", "ソ#", "ラ", "ラ#", "シ"];
  var SYN_CDE = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  var SYN_NAMES = [["do", "ドレミ"], ["cde", "CDE"], ["none", "なし"]];
  var SYN_VIEWS = [["keys", "&#x1F3B9; 鍵盤"], ["pad", "&#x1F300; XYパッド演奏"]];

  // ---------- 音色（パッチ）----------
  var SYN_WAVES = [["saw", "のこぎり", "sawtooth"], ["square", "四角", "square"], ["tri", "三角", "triangle"], ["sine", "サイン", "sine"]];
  var SYN_LFO_TO = [["pitch", "音の高さ"], ["cut", "明るさ"], ["amp", "大きさ"]];
  // [キー, 最小, 最大, ふつう, きざみ, 名前]
  var SYN_PARAMS = [
    ["uni", 1, 3, 1, 1, "ユニゾン（本数）"], ["mix", 0, 1, 0, 0.05, "オシレーター2の音量"], ["det", 0, 50, 7, 1, "オシレーター2のずらし（セント）"], ["oct2", -1, 1, 0, 1, "オシレーター2のオクターブ"],
    ["sub", 0, 1, 0, 0.05, "サブ（1オクターブ下）"],
    ["cut", 0, 1, 0.7, 0.01, "明るさ（カットオフ）"], ["res", 0, 1, 0.1, 0.01, "クセ（レゾナンス）"], ["env", 0, 1, 0.3, 0.01, "フィルターのエンベロープ"],
    ["fd", 0.02, 2, 0.4, 0.01, "フィルターが閉じる速さ（秒）"], ["fs", 0, 1, 0.5, 0.01, "フィルターの閉じたあと"],
    ["a", 0.002, 2, 0.01, 0.002, "立ち上がり（秒）"], ["d", 0.02, 2, 0.3, 0.01, "減衰（秒）"], ["s", 0, 1, 0.7, 0.01, "持続"], ["r", 0.02, 3, 0.3, 0.01, "余韻（秒）"],
    ["lrate", 0.1, 12, 5, 0.1, "LFO（うねり）の速さ（Hz）"], ["ldep", 0, 1, 0, 0.01, "LFO（うねり）の深さ"],
    ["glide", 0, 0.5, 0, 0.01, "ポルタメント（秒）"], ["vol", 0, 1, 0.8, 0.05, "音量"]
  ];
  // パネルのつまみの見出し（どのつまみから）
  var SYN_GROUPS = { uni: "&#x3030;&#xFE0F; オシレーター", cut: "&#x1F506; フィルター", a: "&#x1F4C8; 音量のエンベロープ", lrate: "&#x1F30A; LFO", glide: "&#x1F39A;&#xFE0F; そのほか" };
  function synOpt(list, id) { for (var i = 0; i < list.length; i++) { if (list[i][0] === id) { return list[i]; } } return list[0]; }
  function synHas(list, id) { for (var i = 0; i < list.length; i++) { if (list[i][0] === id) { return true; } } return false; }
  function synPatchClean(p) {
    p = p && typeof p === "object" ? p : {};
    var o = { w1: synHas(SYN_WAVES, p.w1) ? p.w1 : "saw", w2: p.w2 === "off" || synHas(SYN_WAVES, p.w2) ? p.w2 : "off", lto: synOpt(SYN_LFO_TO, p.lto)[0], mono: !!p.mono }, i;
    for (i = 0; i < SYN_PARAMS.length; i++) {
      var d = SYN_PARAMS[i], n = Number(p[d[0]]);
      if (p[d[0]] === undefined || p[d[0]] === null || !isFinite(n)) { n = d[3]; }
      n = Math.max(d[1], Math.min(d[2], n));
      o[d[0]] = d[4] === 1 ? Math.round(n) : Math.round(n * 1000) / 1000;
    }
    return o;
  }
  // [id, 名前, 音色]
  var SYN_PRESETS = [
    ["lead", "&#x1F3B8; のこぎりリード", { w1: "saw", w2: "saw", mix: 0.6, det: 12, cut: 0.62, res: 0.25, env: 0.35, fd: 0.3, fs: 0.4, a: 0.005, d: 0.2, s: 0.8, r: 0.15, lrate: 5.5, ldep: 0.12, lto: "pitch", mono: true, glide: 0.06, vol: 0.75 }],
    ["chip", "&#x1F47E; チップリード", { w1: "square", w2: "off", cut: 1, res: 0, env: 0, a: 0.002, d: 0.1, s: 0.9, r: 0.05, ldep: 0, vol: 0.6 }],
    ["pad", "&#x2601;&#xFE0F; ふわっとパッド", { w1: "saw", w2: "saw", mix: 0.8, det: 18, uni: 3, cut: 0.45, res: 0.15, env: 0.2, fd: 1.2, fs: 0.6, a: 0.8, d: 1, s: 0.8, r: 1.5, lrate: 0.3, ldep: 0.25, lto: "cut", vol: 0.7 }],
    ["spad", "&#x1F3BB; ストリングスパッド", { w1: "saw", w2: "off", uni: 3, cut: 0.55, res: 0.05, env: 0.15, fd: 1, fs: 0.7, a: 0.35, d: 0.5, s: 0.85, r: 0.9, lrate: 5, ldep: 0.06, lto: "pitch", vol: 0.7 }],
    ["brass", "&#x1F3BA; シンセブラス", { w1: "saw", w2: "saw", mix: 0.5, det: 8, cut: 0.35, res: 0.2, env: 0.55, fd: 0.35, fs: 0.45, a: 0.06, d: 0.3, s: 0.75, r: 0.2, vol: 0.75 }],
    ["bass", "&#x1F50A; モノベース", { w1: "square", w2: "saw", mix: 0.5, det: 5, sub: 0.6, cut: 0.3, res: 0.2, env: 0.35, fd: 0.2, fs: 0.2, a: 0.003, d: 0.25, s: 0.7, r: 0.08, mono: true, vol: 0.85 }],
    ["acid", "&#x1F9EA; アシッドベース", { w1: "saw", w2: "off", cut: 0.22, res: 0.8, env: 0.7, fd: 0.18, fs: 0.1, a: 0.003, d: 0.2, s: 0.5, r: 0.08, mono: true, glide: 0.08, vol: 0.7 }],
    ["pluck", "&#x1FA95; プラック", { w1: "saw", w2: "square", mix: 0.3, det: 6, cut: 0.3, res: 0.3, env: 0.7, fd: 0.15, fs: 0, a: 0.002, d: 0.35, s: 0, r: 0.3, vol: 0.8 }],
    ["bell", "&#x1F514; ベル", { w1: "sine", w2: "sine", mix: 0.5, det: 3, oct2: 1, cut: 1, env: 0, a: 0.002, d: 1.5, s: 0, r: 1.2, vol: 0.8 }],
    ["organ", "&#x26EA; オルガン風", { w1: "sine", w2: "sine", mix: 0.7, det: 0, oct2: 1, sub: 0.5, cut: 0.9, env: 0, a: 0.01, d: 0.1, s: 1, r: 0.08, lrate: 6, ldep: 0.08, lto: "amp", vol: 0.7 }],
    ["wobble", "&#x1F30A; ワブル", { w1: "saw", w2: "square", mix: 0.5, det: 10, sub: 0.4, cut: 0.3, res: 0.5, env: 0, a: 0.01, d: 0.2, s: 1, r: 0.1, lrate: 3, ldep: 0.8, lto: "cut", mono: true, vol: 0.75 }],
    ["soft", "&#x1F338; やさしいサイン", { w1: "sine", w2: "tri", mix: 0.3, det: 5, cut: 0.8, env: 0, a: 0.08, d: 0.3, s: 0.9, r: 0.4, lrate: 5, ldep: 0.1, lto: "pitch", vol: 0.8 }]
  ];
  function synPreset(id) { var p = synOpt(SYN_PRESETS, id); return { id: p[0], name: p[1], patch: synPatchClean(p[2]) }; }

  // ---------- 音のエンジン ----------
  function synHz(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function synCutHz(c) { return 60 * Math.pow(2, c * 8); }
  function synQ(r) { return 0.7 + r * r * 17.3; }
  function synWave(id) { return synOpt(SYN_WAVES, id)[2]; }
  var SYN_UNI = [[0], [-7, 7], [-12, 0, 12]];
  // LFO の深さ → つなぐ先の大きさ
  function synLfoAmt(p, dep) { return p.lto === "pitch" ? dep * 50 : (p.lto === "cut" ? dep * 1200 : dep * 0.5); }
  // 声 → { ac, t0, p, m, oscs: [{ o, mul }], peak, amp, filt, lfo, lg, trem, end }。音が出せなければ null
  function synVoice(p, m, out, when, vel) {
    var UG = window.UGMelody, ac = UG && UG.audio && UG.audio.ctx;
    if (!ac || !out) { return null; }
    var t = Math.max(when || 0, ac.currentTime), f = synHz(m), lv = Math.max(0.05, Math.min(1, vel === undefined ? 0.8 : vel)), i;
    var v = { ac: ac, t0: t, p: p, m: m, oscs: [], peak: 0.4 * p.vol * lv, rel: false, end: Infinity };
    var amp = ac.createGain(), filt = ac.createBiquadFilter(), mixg = ac.createGain();
    amp.gain.value = 0;
    amp.connect(out);
    filt.type = "lowpass";
    filt.Q.value = synQ(p.res);
    if (p.lto === "amp") { v.trem = ac.createGain(); v.trem.gain.value = 1 - p.ldep * 0.5; filt.connect(v.trem); v.trem.connect(amp); } else { filt.connect(amp); }
    var total = 1 + (p.w2 !== "off" ? p.mix : 0) + p.sub * 0.8;
    mixg.gain.value = 0.7 / Math.max(1, total * 0.8);
    mixg.connect(filt);
    function add(type, mul, det, gain) {
      var o = ac.createOscillator(), g = ac.createGain();
      o.type = type; o.frequency.value = f * mul; o.detune.value = det; g.gain.value = gain;
      o.connect(g); g.connect(mixg); o.start(t);
      v.oscs.push({ o: o, mul: mul });
    }
    var spread = SYN_UNI[p.uni - 1];
    for (i = 0; i < spread.length; i++) { add(synWave(p.w1), 1, spread[i], 1 / Math.sqrt(spread.length)); }
    if (p.w2 !== "off" && p.mix > 0) { add(synWave(p.w2), Math.pow(2, p.oct2), p.det, p.mix); }
    if (p.sub > 0) { add("square", 0.5, 0, p.sub * 0.8); }
    // フィルターのエンベロープ（立ち上がりで開いて、fd 秒で fs まで閉じる）
    var base = Math.max(40, synCutHz(p.cut)), at = t + Math.max(0.005, p.a * 0.5);
    v.base = base;
    filt.frequency.setValueAtTime(base, t);
    if (p.env > 0) {
      filt.frequency.exponentialRampToValueAtTime(Math.min(18000, base * Math.pow(2, p.env * 5)), at);
      filt.frequency.setTargetAtTime(Math.min(18000, base * Math.pow(2, p.env * 5 * p.fs)), at, p.fd / 3);
    }
    // 音量のエンベロープ
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(v.peak, t + p.a);
    amp.gain.setTargetAtTime(v.peak * p.s, t + p.a, p.d / 3);
    // LFO（深さ 0 でも作る。XY パッドで深くできるように）
    var lfo = ac.createOscillator(), lg = ac.createGain();
    lfo.frequency.value = p.lrate;
    lg.gain.value = synLfoAmt(p, p.ldep);
    lfo.connect(lg);
    if (p.lto === "pitch") { for (i = 0; i < v.oscs.length; i++) { lg.connect(v.oscs[i].o.detune); } }
    else if (p.lto === "cut") { lg.connect(filt.detune); }
    else { lg.connect(v.trem.gain); }
    lfo.start(t);
    v.amp = amp; v.filt = filt; v.lfo = lfo; v.lg = lg;
    return v;
  }
  // いまの大きさ（はなす前のエンベロープ）
  function synEnvAt(v, t) {
    var p = v.p, dt = t - v.t0;
    if (dt <= 0) { return 0; }
    if (dt < p.a) { return v.peak * dt / p.a; }
    var sv = v.peak * p.s;
    return sv + (v.peak - sv) * Math.exp(-(dt - p.a) / Math.max(0.001, p.d / 3));
  }
  // はなす（rel 秒・省略なら音色の r。when から）
  function synRelease(v, rel, when) {
    if (!v || v.rel) { return; }
    v.rel = true;
    var ac = v.ac, t = Math.max(ac.currentTime, when || 0), r = rel === undefined ? v.p.r : rel, i;
    try { v.amp.gain.cancelScheduledValues(t); v.amp.gain.setValueAtTime(synEnvAt(v, t), t); v.amp.gain.setTargetAtTime(0, t, Math.max(0.005, r / 4)); } catch (e) {}
    var end = t + r * 1.6 + 0.05;
    for (i = 0; i < v.oscs.length; i++) { try { v.oscs[i].o.stop(end); } catch (e2) {} }
    try { v.lfo.stop(end); } catch (e3) {}
    v.end = end;
  }
  // 音の高さを変える（glide 秒ですべらせる）
  function synPitch(v, m, glide) {
    if (!v) { return; }
    v.m = m;
    var t = v.ac.currentTime, f = synHz(m);
    for (var i = 0; i < v.oscs.length; i++) {
      var fr = v.oscs[i].o.frequency;
      try { fr.cancelScheduledValues(t); fr.setTargetAtTime(f * v.oscs[i].mul, t, Math.max(0.003, (glide || 0) / 3)); } catch (e) {}
    }
  }
  // XY パッド: 明るさ（cut）・うねりの深さ（dep）を、鳴っている声にも
  function synSetCut(v, cut) {
    if (!v || v.rel) { return; }
    var p = v.p, base = Math.max(40, synCutHz(cut)), t = v.ac.currentTime;
    v.base = base;
    try { v.filt.frequency.cancelScheduledValues(t); v.filt.frequency.setTargetAtTime(Math.min(18000, base * Math.pow(2, p.env * 5 * p.fs)), t, 0.03); } catch (e) {}
  }
  function synSetLfo(v, dep) {
    if (!v || v.rel) { return; }
    try { v.lg.gain.setTargetAtTime(synLfoAmt(v.p, dep), v.ac.currentTime, 0.03); if (v.trem) { v.trem.gain.setTargetAtTime(1 - dep * 0.5, v.ac.currentTime, 0.03); } } catch (e) {}
  }
  // シーケンサーの1音: when から sec 秒のばしてはなす。kill(rel) ですぐ消す（§315 の susStop）
  function synNote(p, m, out, when, vel, sec) {
    var v = synVoice(synPatchClean(p), m, out, when, vel);
    if (!v) { return null; }
    synRelease(v, undefined, (when || v.t0) + Math.max(0.05, sec));
    v.kill = function (rr) {
      var t = v.ac.currentTime;
      try { v.amp.gain.cancelScheduledValues(t); v.amp.gain.setTargetAtTime(0, t, Math.max(0.005, (rr || 0.08) / 4)); } catch (e) {}
    };
    return v;
  }

  // ---------- 鍵盤（白鍵 10 ＝ ド〜上のミ）----------
  var SYN_WHITE_IV = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16], SYN_BLACK = [[0, 1], [1, 3], [3, 6], [4, 8], [5, 10], [7, 13], [8, 15]];
  function synWhiteW() { return (W - 8) / SYN_WHITES; }
  function synKeyAt(x, y, base) {
    if (x < 4 || x >= W - 4 || y < SYN_KB_Y || y >= SYN_KB_BOT) { return -1; }
    var ww = synWhiteW(), bh = (SYN_KB_BOT - SYN_KB_Y) * 0.58, i;
    if (y < SYN_KB_Y + bh) {
      for (i = 0; i < SYN_BLACK.length; i++) { var bx = 4 + (SYN_BLACK[i][0] + 1) * ww; if (Math.abs(x - bx) < ww * 0.32) { return base + SYN_BLACK[i][1]; } }
    }
    return base + SYN_WHITE_IV[Math.max(0, Math.min(SYN_WHITES - 1, Math.floor((x - 4) / ww)))];
  }
  // §319: XY パッド演奏の音（キーのスケールで2オクターブ ＋ いちばん上のルート）
  function synPadNotes(base, scale) {
    var sc = BA().scale(scale)[2], out = [], o, i;
    for (o = 0; o < 2; o++) { for (i = 0; i < sc.length; i++) { out.push(base + o * 12 + sc[i]); } }
    out.push(base + 24);
    return out;
  }
  function synPc(m) { return ((m % 12) + 12) % 12; }
  function synName(m, names) {
    if (names === "none") { return ""; }
    return names === "cde" ? SYN_CDE[synPc(m)] + (Math.floor(m / 12) - 1) : SYN_DO[synPc(m)];
  }

  // ---------- 設定・テイク ----------
  function synPrefs() {
    var p = lsGet(SYN_PREFS_KEY) || {}, oct = Math.round(Number(p.oct)), key = Math.round(Number(p.key)), B = BA();
    var pre = synOpt(SYN_PRESETS, p.preset)[0];
    return {
      view: p.view === "pad" ? "pad" : "keys", preset: pre, edited: !!p.edited, patch: synPatchClean(p.patch && typeof p.patch === "object" ? p.patch : synPreset(pre).patch),
      oct: oct >= -2 && oct <= 1 ? oct : 0, key: key >= 0 && key <= 11 ? key : 0, scale: B ? B.scale(p.scale)[0] : "major",
      names: p.names === "cde" || p.names === "none" ? p.names : "do", tab: p.tab === "play" ? "play" : "sound",
      bpm: Math.max(40, Math.min(240, Math.round(Number(p.bpm) || 100))), metro: p.metro !== false
    };
  }
  function synSavePrefs(p) { return lsSet(SYN_PREFS_KEY, p); }
  function synTakeClean(t, i) {
    return {
      id: Math.max(1, Math.round(Number(t.id)) || i + 1), name: String(t.name || "テイク").slice(0, 20),
      bpm: Math.max(40, Math.min(240, Math.round(Number(t.bpm) || 100))), meter: t.meter === 3 ? 3 : 4,
      pname: String(t.pname || "").slice(0, 20), patch: synPatchClean(t.patch), notes: SV().notesClean(t.notes)
    };
  }
  function synTakesLoad() {
    var a = lsGet(SYN_TAKES_KEY), out = [], i;
    if (!a || !a.length) { return out; }
    for (i = 0; i < a.length && out.length < SYN_TAKES_MAX; i++) { if (a[i] && typeof a[i] === "object") { out.push(synTakeClean(a[i], i)); } }
    return out;
  }
  function synTakesSave(list) { return lsSet(SYN_TAKES_KEY, list.slice(0, SYN_TAKES_MAX)); }
  function synTakeAdd(list, t) {
    var id = 0, i;
    for (i = 0; i < list.length; i++) { id = Math.max(id, list[i].id); }
    var take = synTakeClean({ id: id + 1, name: t.name || "シンセ " + (id + 1), bpm: t.bpm, meter: t.meter, pname: t.pname, patch: t.patch, notes: t.notes }, 0);
    list.unshift(take);
    if (list.length > SYN_TAKES_MAX) { list.length = SYN_TAKES_MAX; }
    return take;
  }
  function synTakeById(list, id) { for (var i = 0; i < list.length; i++) { if (list[i].id === id) { return list[i]; } } return null; }
  function synSendToSeq(take) {
    var U = window.UGUkulele, S = SV();
    if (!U || !U.seqLoad || !U.xAdd) { return { ok: false, msg: "ゴリラウクレレが読みこめませんでした" }; }
    if (!take || !take.notes || !take.notes.length) { return { ok: false, msg: "音のないテイクは送れません" }; }
    var st = U.seqLoad(), id = U.xAdd(st.cur.tracks, "ynotes");
    if (!id) { return { ok: false, msg: "追加トラックがいっぱいです（8本まで）。シーケンサーで1本消してから送ってね" }; }
    var t = st.cur.tracks[id], n = S.notesClean(take.notes), cut = n.length > SYN_SEQ_MAX;
    t.name = String(take.name).slice(0, 12);
    t.prog = SYN_SEQ_PROG;
    t.patch = synPatchClean(take.patch);
    t.notes = n.slice(0, SYN_SEQ_MAX);
    U.seqSave(st);
    return { ok: true, id: id, cut: cut, msg: "「" + take.name + "」を、ゴリラウクレレのシーケンサー（編集中の曲）に 🎛️ シンセ打ち込みトラックとして送りました（音色もいっしょに）" + (cut ? "（音が多いので、はじめの " + SYN_SEQ_MAX + " 音）" : "") };
  }

  // ---------- はじめの画面 ----------
  function synSetup(root, ctl) {
    var p = synPrefs(), note = "";
    function opts(list, cur, attr) {
      var h = "", i;
      for (i = 0; i < list.length; i++) { h += '<button class="modal-btn quiz-opt' + (cur === list[i][0] ? " active" : "") + '" data-' + attr + '="' + list[i][0] + '">' + list[i][1] + '</button>'; }
      return h;
    }
    function draw() {
      var takes = synTakesLoad(), i;
      var html = '<div class="melody-setup"><h3 style="margin:0 0 4px;">&#x1F39B;&#xFE0F; ゴリラシンセ</h3>' +
        '<p class="small" style="color:#adb5bd;margin:0 0 8px;">波の形・フィルター・エンベロープ・LFO をいじって、じぶんの音を作って弾こう。XY パッドで音が変わる。</p>' +
        '<p class="small" style="margin:4px 0 2px;">弾き方</p><div class="quiz-opts">' + opts(SYN_VIEWS, p.view, "view") + '</div>' +
        '<p class="small" style="margin:4px 0 2px;">音色（プリセット）' + (p.edited ? "・いまは じぶんで変えた音色" : "") + '</p><div class="piano-opts">' + opts(SYN_PRESETS, p.edited ? "" : p.preset, "preset") + '</div>' +
        '<p class="small" style="margin:4px 0 2px;">音名</p><div class="quiz-opts">' + opts(SYN_NAMES, p.names, "names") + '</div>' +
        '<button class="modal-btn" data-go="1" style="width:100%;margin-top:8px;">&#x1F39B;&#xFE0F; はじめる</button>' +
        '<p class="small" style="margin:10px 0 2px;">&#x1F399;&#xFE0F; 録音したテイク（' + takes.length + ' / ' + SYN_TAKES_MAX + '）</p>';
      if (note) { html += '<p class="small" style="color:#ffd166;margin:0 0 4px;">' + note + '</p>'; }
      if (!takes.length) { html += '<p class="small" style="color:#adb5bd;margin:0;">まだありません。弾く画面の「🔴 録音」で録れます。</p>'; }
      for (i = 0; i < takes.length; i++) {
        html += '<div class="piano-take"><span>' + escHtml(takes[i].name) + '<br><span class="small" style="color:#adb5bd;">' + takes[i].notes.length + '音・BPM ' + takes[i].bpm + (takes[i].pname ? '・' + escHtml(takes[i].pname) : "") + '</span></span>' +
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
          if ((v = el.getAttribute("data-view"))) { p.view = v; synSavePrefs(p); draw(); return; }
          if ((v = el.getAttribute("data-preset"))) { p.preset = v; p.patch = synPreset(v).patch; p.edited = false; synSavePrefs(p); draw(); return; }
          if ((v = el.getAttribute("data-names"))) { p.names = v; synSavePrefs(p); draw(); return; }
          if ((v = el.getAttribute("data-send"))) { var rs = synSendToSeq(synTakeById(synTakesLoad(), Number(v))); note = (rs.ok ? "&#x2705; " : "&#x26A0;&#xFE0F; ") + escHtml(rs.msg); draw(); return; }
          if ((v = el.getAttribute("data-del"))) {
            var list = synTakesLoad(), t = synTakeById(list, Number(v));
            if (!t || (window.confirm && !window.confirm("「" + t.name + "」を消しますか？"))) { return; }
            list.splice(list.indexOf(t), 1);
            synTakesSave(list);
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

  var SYN_KEYS = { a: "n:0", w: "n:1", s: "n:2", e: "n:3", d: "n:4", f: "n:5", t: "n:6", g: "n:7", y: "n:8", h: "n:9", u: "n:10", j: "n:11", k: "n:12", z: "rec", x: "play", ",": "octdown", ".": "octup" };

  I.register({
    id: "synth",
    after: "horn",
    cat: "music",
    music: true,
    name: "ゴリラシンセ",
    icon: "&#x1F39B;&#xFE0F;",
    desc: "波の形・フィルター・LFO で音を作って弾くシンセサイザー。XY パッドで音が変わる",
    help: "鍵盤を押しているあいだ鳴る / 上の XY パッド: 横 ＝ 明るさ・縦 ＝ うねり / XYパッド演奏: 横 ＝ 音・縦 ＝ 明るさ / キー A W S E D F T G Y H U J K / , . オクターブ / Z 録音 / X 再生 / P一時停止",
    controls: [],
    keys: SYN_KEYS,
    setup: synSetup,
    setupLabel: "音色・テイク",
    panel: true,
    create: function (api, cfg) {
      cfg = cfg || {};
      var B = BA(), prefs = synPrefs(), patch = prefs.patch, names = prefs.names;
      var frame = 0, msg = "", panel = api.panel;
      if (panel && panel.classList) { panel.classList.add("quiz-panel"); }
      if (api.setLandscape) { api.setLandscape(false); }
      if (api.setCanvasHeight) { api.setCanvasHeight(SYN_H); }
      function now() { return frame / 60; }
      function kbBase() { return 60 + prefs.oct * 12; }
      function padBase() { return 48 + prefs.key + prefs.oct * 12; }
      function save() { synSavePrefs(prefs); }

      // --- 音 ---
      var UG = window.UGMelody, audioOk = false, buses = {};
      function audio() {
        if (audioOk || !UG || !UG.audioInit) { return; }
        try { if (UG.audioInit()) { audioOk = true; } } catch (e) {}
      }
      function out() { return audioOk && B.bus ? B.bus(buses, "y", 100, false) : null; }
      function click(accent) { if (audioOk) { try { UG.synth(accent ? 37 : 42, UG.DRUM, 0, accent ? 0.9 : 0.6); } catch (e) {} } }

      // --- 鍵盤の音。held: [{ id, m, v }]（ポリはそれぞれの声・モノは tone 1つ）---
      var held = [], tone = null, pad = null; // pad: { v, m, col }
      function voices() { var a = [], i; for (i = 0; i < held.length; i++) { if (held[i].v) { a.push(held[i].v); } } if (tone) { a.push(tone.v); } if (pad) { a.push(pad.v); } return a; }
      function mono() {
        var h = held.length ? held[held.length - 1] : null;
        if (!h) { if (tone) { synRelease(tone.v); recOff("tone"); tone = null; } return; }
        if (tone) { if (tone.m !== h.m) { synPitch(tone.v, h.m, patch.glide); recOff("tone"); recOn("tone", h.m); tone.m = h.m; } return; }
        tone = { v: synVoice(patch, h.m, out(), 0, 0.8), m: h.m };
        recOn("tone", h.m);
      }
      function noteOn(id, m) {
        audio();
        noteOff(id, true);
        var h = { id: id, m: m, v: null };
        held.push(h);
        if (patch.mono) { mono(); return; }
        h.v = synVoice(patch, m, out(), 0, 0.8);
        recOn(id, m);
      }
      function noteOff(id, quiet) {
        for (var i = held.length - 1; i >= 0; i--) {
          if (held[i].id !== id) { continue; }
          if (held[i].v) { synRelease(held[i].v); recOff(id); }
          held.splice(i, 1);
        }
        if (patch.mono && !quiet) { mono(); }
      }
      function allOff() {
        var i;
        for (i = 0; i < held.length; i++) { if (held[i].v) { synRelease(held[i].v); recOff(held[i].id); } }
        held = [];
        if (tone) { synRelease(tone.v); recOff("tone"); tone = null; }
        padOff();
      }
      // XY パッド（鍵盤のとき）: 横 ＝ 明るさ・縦 ＝ うねりの深さ
      var xyId = null;
      function xySet(x, y) {
        patch.cut = Math.round(Math.max(0.05, Math.min(1, (x - 8) / (W - 16))) * 100) / 100;
        patch.ldep = Math.round(Math.max(0, Math.min(1, 1 - (y - SYN_TOP - 4) / (SYN_PAD_BOT - SYN_TOP - 8))) * 100) / 100;
        var vs = voices();
        for (var i = 0; i < vs.length; i++) { synSetCut(vs[i], patch.cut); synSetLfo(vs[i], patch.ldep); }
      }
      // XY パッド演奏: 横 ＝ 音・縦 ＝ 明るさ（モノ）
      function padNotes() { return synPadNotes(padBase(), prefs.scale); }
      function padCol(x) { var n = padNotes().length; return Math.max(0, Math.min(n - 1, Math.floor((x - 4) / ((W - 8) / n)))); }
      function padCut(y) { return Math.round(Math.max(0.12, Math.min(1, 1 - (y - SYN_TOP) / (SYN_KB_BOT - SYN_TOP))) * 100) / 100; }
      function padOn(x, y) {
        audio();
        padOff();
        var col = padCol(x), m = padNotes()[col];
        patch.cut = padCut(y);
        pad = { v: synVoice(patch, m, out(), 0, 0.8), m: m, col: col };
        recOn("pad", m);
      }
      function padMove(x, y) {
        if (!pad) { return; }
        var col = padCol(x), m = padNotes()[col];
        patch.cut = padCut(y);
        synSetCut(pad.v, patch.cut);
        if (col !== pad.col) { synPitch(pad.v, m, Math.max(0.03, patch.glide)); recOff("pad"); recOn("pad", m); pad.col = col; pad.m = m; }
      }
      function padOff() { if (!pad) { return; } synRelease(pad.v); recOff("pad"); pad = null; }

      // --- 録音・再生 ---
      var bpm = prefs.bpm, meter = 4, metro = prefs.metro, takes = synTakesLoad();
      var take = cfg.take ? synTakeById(takes, cfg.take) : null, rec = null, play = null;
      if (take) { msg = "「" + escHtml(take.name) + "」をひらきました。▶ 再生で聴けます（録ったときの音色で鳴ります）"; }
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
      function recOn(id, m) {
        if (!rec) { return; }
        var b = recBeat();
        if (b < -0.25 || rec.notes.length >= SYN_NOTES_MAX) { return; }
        rec.open[id] = [Math.max(0, b), m];
      }
      function recOff(id) {
        if (!rec || !rec.open[id]) { return; }
        var o = rec.open[id];
        delete rec.open[id];
        rec.notes.push([r3(o[0]), r3(Math.max(0.0625, recBeat() - o[0])), o[1]]);
      }
      function presetName() { return prefs.edited ? "じぶんの音色" : synOpt(SYN_PRESETS, prefs.preset)[1].replace(/&#x[0-9A-F]+;(&#x[0-9A-F]+;)?\s*/g, ""); }
      function recStop() {
        var ks = [], k;
        for (k in rec.open) { if (rec.open.hasOwnProperty(k)) { ks.push(k); } }
        for (k = 0; k < ks.length; k++) { recOff(ks[k]); }
        var n = rec.notes.sort(function (a, b) { return a[0] - b[0]; });
        rec = null;
        if (n.length) {
          take = synTakeAdd(takes, { bpm: bpm, meter: meter, pname: presetName(), patch: patch, notes: n });
          synTakesSave(takes);
          msg = "&#x1F4BE; 「" + escHtml(take.name) + "」に保存しました（" + take.notes.length + "音・音色も）<br>はじめの画面の「🎸 送る」でシーケンサーに入れられます";
        } else { msg = "音がなかったので保存しませんでした"; }
        render();
      }
      function playBeat() { return play ? (now() - play.t0) * play.bpm / 60 : 0; }
      function playStop() { if (!play) { return; } for (var i = 0; i < play.vo.length; i++) { synRelease(play.vo[i], 0.05); } play = null; }
      function playToggle() {
        if (play) { playStop(); render(); return; }
        if (rec) { return; }
        if (!take || !take.notes.length) { msg = "まだテイクがありません。🔴 録音で録ってね"; render(); return; }
        audio();
        play = { t0: now() + 0.1, bpm: take.bpm, notes: take.notes, idx: 0, vo: [], patch: synPatchClean(take.patch) };
        render();
      }

      // --- パネル ---
      var METRO = B.METRO_ICON || "&#x23F1;&#xFE0F;";
      function edited() { if (!prefs.edited) { prefs.edited = true; } save(); }
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
        else if (v === "metro") { metro = !metro; prefs.metro = metro; save(); render(); }
        else if (v === "bpmdown" || v === "bpmup") { if (rec) { return; } bpm = Math.max(40, Math.min(240, bpm + (v === "bpmup" ? 5 : -5))); prefs.bpm = bpm; save(); render(); }
        else if (/^tab:/.test(v)) { prefs.tab = v.substring(4) === "play" ? "play" : "sound"; save(); render(); }
        else if (/^preset:/.test(v)) { allOff(); var pr = synPreset(v.substring(7)); prefs.preset = pr.id; prefs.patch = patch = pr.patch; prefs.edited = false; save(); render(); }
        else if (/^w1:|^w2:|^lto:/.test(v)) { allOff(); var kk = v.split(":"); patch[kk[0]] = kk[1]; prefs.patch = patch = synPatchClean(patch); edited(); render(); }
        else if (v === "mono") { allOff(); patch.mono = !patch.mono; edited(); render(); }
        else if (/^view:/.test(v)) { allOff(); prefs.view = v.substring(5) === "pad" ? "pad" : "keys"; save(); render(); }
        else if (v === "octdown" || v === "octup") { allOff(); prefs.oct = Math.max(-2, Math.min(1, prefs.oct + (v === "octup" ? 1 : -1))); save(); render(); }
        else if (v === "keydown" || v === "keyup") { allOff(); prefs.key = (prefs.key + (v === "keyup" ? 1 : 11)) % 12; save(); render(); }
        else if (/^scale:/.test(v)) { allOff(); prefs.scale = B.scale(v.substring(6))[0]; save(); render(); }
        else if (/^names:/.test(v)) { names = prefs.names = synOpt(SYN_NAMES, v.substring(6))[0]; save(); render(); }
      }
      // 秒・Hz は小数、ほかは 0〜100
      function fmt(d, n) { return /秒|Hz/.test(d[5]) ? n.toFixed(2) : (d[4] >= 1 ? String(n) : String(Math.round(n * 100))); }
      function render() {
        if (!panel) { return; }
        var html = "", i, j;
        html += '<div class="piano-row"><button class="modal-btn' + (rec ? " piano-rec-on" : "") + '" data-ya="rec">' + (rec ? "&#x23F9;&#xFE0F; 録音をとめる" : "&#x1F534; 録音") + '</button>' +
          '<button class="modal-btn' + (play ? " piano-rec-on" : "") + '" data-ya="play"' + (rec ? " disabled" : "") + '>' + (play ? "&#x23F9;&#xFE0F; とめる" : "&#x25B6;&#xFE0F; 再生") + '</button></div>' +
          '<div class="piano-row"><button class="modal-btn" data-ya="bpmdown">&minus;</button><span>BPM ' + bpm + '</span><button class="modal-btn" data-ya="bpmup">&#xFF0B;</button>' +
          '<button class="modal-btn" data-ya="metro" title="録音のメトロノーム">' + METRO + ' ' + (metro ? "ON" : "OFF") + '</button></div>';
        html += '<div class="piano-row"><button class="modal-btn' + (prefs.tab === "sound" ? " piano-rec-on" : "") + '" data-ya="tab:sound">音色</button><button class="modal-btn' + (prefs.tab === "play" ? " piano-rec-on" : "") + '" data-ya="tab:play">弾き方</button></div>';
        if (prefs.tab === "play") {
          html += '<div class="piano-row">';
          for (i = 0; i < SYN_VIEWS.length; i++) { html += '<button class="modal-btn' + (prefs.view === SYN_VIEWS[i][0] ? " piano-rec-on" : "") + '" data-ya="view:' + SYN_VIEWS[i][0] + '">' + SYN_VIEWS[i][1] + '</button>'; }
          html += '</div><div class="piano-row"><button class="modal-btn" data-ya="octdown">&#x25C0;</button><span>オクターブ ' + (prefs.oct > 0 ? "+" : "") + prefs.oct + '</span><button class="modal-btn" data-ya="octup">&#x25B6;</button></div>' +
            '<div class="piano-row"><button class="modal-btn" data-ya="keydown">&#x25C0;</button><span>キー ' + SYN_CDE[prefs.key] + '</span><button class="modal-btn" data-ya="keyup">&#x25B6;</button></div>' +
            '<div class="piano-row"><label class="piano-select">&#x1F3B5; <select data-yscale="1">' + scaleOptions() + '</select></label></div><div class="piano-row">';
          for (i = 0; i < SYN_NAMES.length; i++) { html += '<button class="modal-btn' + (names === SYN_NAMES[i][0] ? " piano-rec-on" : "") + '" data-ya="names:' + SYN_NAMES[i][0] + '">' + SYN_NAMES[i][1] + '</button>'; }
          html += '</div><p class="small" style="margin:4px 0 0;">キーとスケールは XYパッド演奏の音（横に2オクターブ）。鍵盤は オクターブ だけ</p>';
        } else {
          html += '<div class="piano-opts">';
          for (i = 0; i < SYN_PRESETS.length; i++) { html += '<button class="modal-btn quiz-opt' + (!prefs.edited && prefs.preset === SYN_PRESETS[i][0] ? " active" : "") + '" data-ya="preset:' + SYN_PRESETS[i][0] + '">' + SYN_PRESETS[i][1] + '</button>'; }
          html += '</div><div class="piano-row"><span>波1</span>';
          for (i = 0; i < SYN_WAVES.length; i++) { html += '<button class="modal-btn' + (patch.w1 === SYN_WAVES[i][0] ? " piano-rec-on" : "") + '" data-ya="w1:' + SYN_WAVES[i][0] + '">' + SYN_WAVES[i][1] + '</button>'; }
          html += '</div><div class="piano-row"><span>波2</span>';
          for (i = 0; i <= SYN_WAVES.length; i++) { var w2 = i < SYN_WAVES.length ? SYN_WAVES[i] : ["off", "なし"]; html += '<button class="modal-btn' + (patch.w2 === w2[0] ? " piano-rec-on" : "") + '" data-ya="w2:' + w2[0] + '">' + w2[1] + '</button>'; }
          html += '</div>';
          for (j = 0; j < SYN_PARAMS.length; j++) {
            var d = SYN_PARAMS[j];
            if (SYN_GROUPS[d[0]]) { html += '<p class="small" style="margin:8px 0 2px;color:#ffd166;">' + SYN_GROUPS[d[0]] + '</p>'; }
            if (d[0] === "lrate") {
              html += '<div class="piano-row"><span>行き先</span>';
              for (i = 0; i < SYN_LFO_TO.length; i++) { html += '<button class="modal-btn' + (patch.lto === SYN_LFO_TO[i][0] ? " piano-rec-on" : "") + '" data-ya="lto:' + SYN_LFO_TO[i][0] + '">' + SYN_LFO_TO[i][1] + '</button>'; }
              html += '</div>';
            }
            if (d[0] === "glide") { html += '<div class="piano-row"><button class="modal-btn' + (patch.mono ? " piano-rec-on" : "") + '" data-ya="mono">' + (patch.mono ? "モノ（1音）" : "ポリ（和音OK）") + '</button></div>'; }
            html += '<label class="small" style="display:block;margin:2px 0;">' + d[5] + ' <b data-yv="' + d[0] + '">' + fmt(d, patch[d[0]]) + '</b>' +
              '<input type="range" style="width:100%;" min="' + d[1] + '" max="' + d[2] + '" step="' + d[4] + '" value="' + patch[d[0]] + '" data-yk="' + d[0] + '"></label>';
          }
        }
        if (take && !rec) { html += '<p class="small" style="margin:4px 0 0;">いまのテイク: ' + escHtml(take.name) + '（' + take.notes.length + '音・BPM ' + take.bpm + '）</p>'; }
        if (msg) { html += '<p class="small" style="margin:4px 0 0;color:#ffd166;">' + msg + '</p>'; }
        panel.innerHTML = html;
        bindPanel();
      }
      function bindPanel() {
        var i, bs = panel.querySelectorAll ? panel.querySelectorAll("button[data-ya]") : [];
        for (i = 0; i < bs.length; i++) { bs[i].onclick = function (ev) { if (ev.currentTarget.blur) { ev.currentTarget.blur(); } action(ev.currentTarget.getAttribute("data-ya")); }; }
        var sel = panel.querySelector ? panel.querySelector("select[data-yscale]") : null;
        if (sel) { sel.onchange = function (ev) { if (ev.currentTarget.blur) { ev.currentTarget.blur(); } action("scale:" + ev.currentTarget.value); }; }
        // つまみ: 動かしているあいだは数字だけ書きかえる（パネルを作りなおすと、つまみがはなれるので）
        var rs = panel.querySelectorAll ? panel.querySelectorAll("input[data-yk]") : [];
        for (i = 0; i < rs.length; i++) {
          rs[i].oninput = function (ev) {
            var k = ev.currentTarget.getAttribute("data-yk"), d = synOpt(SYN_PARAMS, k), lab = panel.querySelector("b[data-yv='" + k + "']");
            if (k === "uni" || k === "oct2") { allOff(); }
            patch[k] = Number(ev.currentTarget.value);
            prefs.patch = patch = synPatchClean(patch);
            if (lab) { lab.textContent = fmt(d, patch[k]); }
            edited();
            var vs = voices(), q;
            if (k === "cut") { for (q = 0; q < vs.length; q++) { synSetCut(vs[q], patch.cut); } }
            if (k === "ldep") { for (q = 0; q < vs.length; q++) { synSetLfo(vs[q], patch.ldep); } }
          };
        }
      }
      render();

      // --- 描く ---
      function text(ctx, s, x, y, size, color) { ctx.fillStyle = color; ctx.font = "bold " + size + "px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(s, x, y); }
      function lit(m) { var i; for (i = 0; i < held.length; i++) { if (held[i].m === m) { return true; } } return false; }
      function drawXY(ctx) {
        var x0 = 8, y0 = SYN_TOP + 4, w = W - 16, h = SYN_PAD_BOT - SYN_TOP - 8;
        var g = ctx.createLinearGradient ? ctx.createLinearGradient(x0, 0, x0 + w, 0) : null;
        if (g) { g.addColorStop(0, "#241a4a"); g.addColorStop(1, "#5a2d82"); }
        ctx.fillStyle = g || "#3b2a66";
        ctx.fillRect(x0, y0, w, h);
        var px = x0 + patch.cut * w, py = y0 + (1 - patch.ldep) * h;
        ctx.strokeStyle = "rgba(255,255,255,0.25)"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(px, y0); ctx.lineTo(px, y0 + h); ctx.moveTo(x0, py); ctx.lineTo(x0 + w, py); ctx.stroke();
        ctx.fillStyle = xyId !== null ? "#ffd166" : "#c77dff";
        ctx.beginPath(); ctx.arc(px, py, xyId !== null ? 9 : 6, 0, Math.PI * 2); ctx.fill();
        text(ctx, "明るさ →", x0 + w - 30, y0 + h - 8, 9, "rgba(255,255,255,0.6)");
        text(ctx, "↑ うねり", x0 + 26, y0 + 9, 9, "rgba(255,255,255,0.6)");
      }
      function drawKeyboard(ctx) {
        var ww = synWhiteW(), base = kbBase(), bh = (SYN_KB_BOT - SYN_KB_Y) * 0.58, i;
        for (i = 0; i < SYN_WHITES; i++) {
          var m = base + SYN_WHITE_IV[i], x = 4 + i * ww, on = lit(m);
          ctx.fillStyle = on ? "#ffd166" : "#f8f9fa";
          ctx.fillRect(x + 1, SYN_KB_Y, ww - 2, SYN_KB_BOT - SYN_KB_Y);
          var nm = synName(m, names);
          if (nm) { text(ctx, nm, x + ww / 2, SYN_KB_BOT - 12, nm.length > 2 ? 8 : 10, synPc(m) === 0 ? "#c2255c" : "#495057"); }
        }
        for (i = 0; i < SYN_BLACK.length; i++) {
          var bm = base + SYN_BLACK[i][1], bx = 4 + (SYN_BLACK[i][0] + 1) * ww;
          ctx.fillStyle = lit(bm) ? "#f08c00" : "#212529";
          ctx.fillRect(bx - ww * 0.3, SYN_KB_Y, ww * 0.6, bh);
        }
      }
      function drawPad(ctx) {
        var ns = padNotes(), n = ns.length, cw = (W - 8) / n, y0 = SYN_TOP, h = SYN_KB_BOT - SYN_TOP, i;
        var g = ctx.createLinearGradient ? ctx.createLinearGradient(0, y0, 0, y0 + h) : null;
        if (g) { g.addColorStop(0, "#7b2cbf"); g.addColorStop(1, "#10002b"); }
        ctx.fillStyle = g || "#3c096c";
        ctx.fillRect(4, y0, W - 8, h);
        for (i = 0; i < n; i++) {
          var x = 4 + i * cw, root = synPc(ns[i]) === prefs.key;
          if (pad && pad.col === i) { ctx.fillStyle = "rgba(255,209,102,0.35)"; ctx.fillRect(x, y0, cw, h); }
          ctx.fillStyle = root ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.12)";
          ctx.fillRect(x, y0, 1, h);
          var nm = synName(ns[i], names === "none" ? "do" : names);
          text(ctx, nm.length > 2 ? nm.charAt(0) : nm, x + cw / 2, SYN_KB_BOT - 10, 8, root ? "#ffd166" : "rgba(255,255,255,0.7)");
        }
        if (pad) { ctx.fillStyle = "#ffd166"; ctx.beginPath(); ctx.arc(4 + (pad.col + 0.5) * cw, y0 + (1 - patch.cut) * h, 10, 0, Math.PI * 2); ctx.fill(); }
        text(ctx, "↑ 明るい", W - 30, y0 + 10, 9, "rgba(255,255,255,0.7)");
      }
      return {
        input: function (a, down) {
          var mn = /^n:(\d+)$/.exec(a);
          if (mn) {
            if (prefs.view !== "keys") { return; }
            if (down) { noteOn("key" + mn[1], kbBase() + Number(mn[1])); } else { noteOff("key" + mn[1]); }
            return;
          }
          if (down) { action(a); }
        },
        pointer: function (type, x, y, id) {
          var pid = "p" + (id === undefined ? 0 : id);
          if (prefs.view === "pad") {
            if (type === "down") { if (y >= SYN_TOP) { padOn(x, y); pad.pid = pid; } }
            else if (type === "move") { if (pad && pad.pid === pid) { padMove(Math.max(4, Math.min(W - 5, x)), Math.max(SYN_TOP, Math.min(SYN_KB_BOT, y))); } }
            else if (pad && pad.pid === pid) { padOff(); save(); }
            return;
          }
          if (type === "down") {
            if (y >= SYN_TOP && y < SYN_PAD_BOT) { audio(); xyId = pid; xySet(x, y); return; }
            var m = synKeyAt(x, y, kbBase());
            if (m >= 0) { noteOn(pid, m); }
          } else if (type === "move") {
            if (xyId === pid) { xySet(x, Math.max(SYN_TOP, Math.min(SYN_PAD_BOT, y))); return; }
            var cur = null, i;
            for (i = 0; i < held.length; i++) { if (held[i].id === pid) { cur = held[i]; } }
            if (!cur) { return; }
            var m2 = synKeyAt(Math.max(4, Math.min(W - 5, x)), Math.max(SYN_KB_Y, Math.min(SYN_KB_BOT - 1, y)), kbBase());
            if (m2 >= 0 && m2 !== cur.m) { noteOn(pid, m2); }
          } else {
            if (xyId === pid) { xyId = null; prefs.patch = patch; edited(); render(); return; }
            noteOff(pid);
          }
        },
        step: function () {
          frame++;
          if (play) {
            var pb = playBeat(), last = 0, i;
            while (play.idx < play.notes.length && play.notes[play.idx][0] <= pb) {
              var pn = play.notes[play.idx], v = synNote(play.patch, pn[2], out(), 0, pn[3] || 0.8, pn[1] * 60 / play.bpm);
              if (v) { play.vo.push(v); }
              play.idx++;
            }
            for (i = 0; i < play.notes.length; i++) { last = Math.max(last, play.notes[i][0] + play.notes[i][1]); }
            if (play.idx >= play.notes.length && pb > last + 1) { play = null; render(); }
          }
          if (rec) {
            var rb = Math.floor(recBeat());
            if (rb !== rec.beat && (metro || rb < 0)) { click(((rb % meter) + meter) % meter === 0); }
            rec.beat = rb;
          }
        },
        draw: function (ctx) {
          var g = ctx.createLinearGradient ? ctx.createLinearGradient(0, 0, 0, SYN_H) : null;
          if (g) { g.addColorStop(0, "#10002b"); g.addColorStop(1, "#240046"); }
          ctx.fillStyle = g || "#10002b";
          ctx.fillRect(0, 0, W, SYN_H);
          hudText(ctx, "🎛️ " + presetName() + (patch.mono ? "・モノ" : ""), 8, 10, "left");
          hudText(ctx, "BPM " + bpm, W - 8, 10, "right");
          if (rec) { var rb = recBeat(); text(ctx, rb < 0 ? String(Math.ceil(-rb)) : "● REC " + (Math.floor(rb / meter) + 1) + "小節・" + rec.notes.length + "音", W / 2, 26, 13, "#ff6b6b"); }
          else if (play) { text(ctx, "再生中…", W / 2, 26, 12, "#ffffff"); }
          if (prefs.view === "pad") { drawPad(ctx); return; }
          drawXY(ctx);
          drawKeyboard(ctx);
        }
      };
    }
  });

  window.UGSynth = {
    H: SYN_H, PREFS_KEY: SYN_PREFS_KEY, TAKES_KEY: SYN_TAKES_KEY, PRESETS: SYN_PRESETS, PARAMS: SYN_PARAMS, WAVES: SYN_WAVES, SEQ_PROG: SYN_SEQ_PROG,
    TOP: SYN_TOP, PAD_BOT: SYN_PAD_BOT, KB_Y: SYN_KB_Y, KB_BOT: SYN_KB_BOT,
    patchClean: synPatchClean, preset: synPreset, voice: synVoice, release: synRelease, pitch: synPitch, setCut: synSetCut, setLfo: synSetLfo, note: synNote, envAt: synEnvAt,
    cutHz: synCutHz, keyAt: synKeyAt, padNotes: synPadNotes, prefs: synPrefs, takesLoad: synTakesLoad, takeById: synTakeById, sendToSeq: synSendToSeq
  };
})();
