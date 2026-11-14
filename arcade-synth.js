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

  var SYN_H = 320, SYN_TOP = 36, SYN_PAD_BOT = 150, SYN_KB_Y = 158, SYN_KB_BOT = 316, SYN_WHITES = 10, SYN_LAND = false;
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

  // ---------- 鍵盤（たて: 白鍵 10 ＝ ド〜上のミ / §320 よこ: 白鍵 15 ＝ 2オクターブ）----------
  var SYN_WHITE_IV = [], SYN_BLACK = []; // SYN_BLACK: [左の白鍵の番号, 音]
  function synKeys(n) {
    var pcs = [0, 2, 4, 5, 7, 9, 11], i;
    SYN_WHITES = n; SYN_WHITE_IV = []; SYN_BLACK = [];
    for (i = 0; i < n; i++) {
      var iv = Math.floor(i / 7) * 12 + pcs[i % 7];
      SYN_WHITE_IV.push(iv);
      if (i < n - 1 && [0, 1, 3, 4, 5].indexOf(i % 7) >= 0) { SYN_BLACK.push([i, iv + 1]); }
    }
  }
  // §320: よこ向き（高さ h）
  function synLayout(land, h) {
    SYN_LAND = !!land;
    if (land) { SYN_H = h || 130; SYN_TOP = 12; SYN_PAD_BOT = Math.round(SYN_H * 0.34); SYN_KB_Y = SYN_PAD_BOT + 3; SYN_KB_BOT = SYN_H - 2; synKeys(15); }
    else { SYN_H = 320; SYN_TOP = 36; SYN_PAD_BOT = 150; SYN_KB_Y = 158; SYN_KB_BOT = 316; synKeys(10); }
  }
  synLayout(false);
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
  // §320: アルペジエーター
  var SYN_ARP_MODES = [["up", "上り"], ["down", "下り"], ["updown", "上り下り"], ["order", "押した順"], ["random", "ランダム"]];
  var SYN_ARP_RATES = [[0.5, "8分"], [0.25, "16分"], [1 / 3, "3連"]];
  function synArpClean(a) {
    a = a && typeof a === "object" ? a : {};
    var r = Number(a.rate), rate = 0.25, oct = Math.round(Number(a.oct)), gate = Number(a.gate), i;
    for (i = 0; i < SYN_ARP_RATES.length; i++) { if (Math.abs(r - SYN_ARP_RATES[i][0]) < 1e-6) { rate = SYN_ARP_RATES[i][0]; } }
    return { on: !!a.on, mode: synOpt(SYN_ARP_MODES, a.mode)[0], rate: rate, oct: oct >= 1 && oct <= 3 ? oct : 1, gate: isFinite(gate) && gate >= 0.2 && gate <= 1 ? Math.round(gate * 10) / 10 : 0.6 };
  }
  // 押さえている音（押した順）→ 1周の並び（ランダムは並びから選ぶ）
  function synArpOrder(notes, mode, oct) {
    var base = [], all = [], i, o;
    for (i = 0; i < notes.length; i++) { if (base.indexOf(notes[i]) < 0) { base.push(notes[i]); } }
    if (mode !== "order") { base.sort(function (a, b) { return a - b; }); }
    for (o = 0; o < oct; o++) { for (i = 0; i < base.length; i++) { all.push(base[i] + 12 * o); } }
    if (mode === "down") { all.reverse(); }
    else if (mode === "updown" && all.length > 2) { all = all.concat(all.slice(1, -1).reverse()); }
    return all;
  }
  // §320: じぶんの音色 [{ name, patch }]
  var SYN_MY_KEY = "ultimateGorillaSynthMyV1", SYN_MY_MAX = 12;
  function synMyLoad() {
    var a = lsGet(SYN_MY_KEY), out = [], i;
    if (!a || !a.length) { return out; }
    for (i = 0; i < a.length && out.length < SYN_MY_MAX; i++) { if (a[i] && typeof a[i] === "object") { out.push({ name: String(a[i].name || "じぶんの音").slice(0, 16), patch: synPatchClean(a[i].patch) }); } }
    return out;
  }
  function synMySave(list) { return lsSet(SYN_MY_KEY, list.slice(0, SYN_MY_MAX)); }
  // 名前で入れる（同じ名前は上書き）→ 番号（いっぱいなら -1）
  function synMyPut(list, name, patch) {
    var nm = String(name || "").replace(/^\s+|\s+$/g, "").slice(0, 16) || "じぶんの音 " + (list.length + 1), i;
    for (i = 0; i < list.length; i++) { if (list[i].name === nm) { list[i].patch = synPatchClean(patch); return i; } }
    if (list.length >= SYN_MY_MAX) { return -1; }
    list.push({ name: nm, patch: synPatchClean(patch) });
    return list.length - 1;
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
      names: p.names === "cde" || p.names === "none" ? p.names : "do", tab: ["play", "pat", "band"].indexOf(p.tab) >= 0 ? p.tab : "sound",
      // §329: ▶ パターン
      spat: typeof p.spat === "string" && /^([a-z0-9]{1,16}|my:\d+)$/.test(p.spat) ? p.spat : "up", srate: p.srate === 16 ? 16 : 8,
      swing: [0, 1, 2, 3].indexOf(Number(p.swing)) >= 0 ? Number(p.swing) : 0, sev: !!p.sev,
      cprog: typeof p.cprog === "string" && /^[a-z0-9]{1,16}$/.test(p.cprog) ? p.cprog : "",
      drum: typeof p.drum === "string" && /^[gdp]:[A-Za-z0-9_-]{1,32}$/.test(p.drum) ? p.drum : "",
      bpat: typeof p.bpat === "string" && /^[a-z0-9]{1,12}$/.test(p.bpat) ? p.bpat : "",
      yvol: synVol(p.yvol, 100), bvol: synVol(p.bvol, 100), dvol: synVol(p.dvol, 50),
      bpm: Math.max(40, Math.min(240, Math.round(Number(p.bpm) || 100))), metro: p.metro !== false,
      land: !!p.land, arp: synArpClean(p.arp), mine: typeof p.mine === "string" ? p.mine.slice(0, 16) : "",
      backing: typeof p.backing === "string" && /^(cur|s:\d+)$/.test(p.backing) ? p.backing : ""
    };
  }
  function synSavePrefs(p) { return lsSet(SYN_PREFS_KEY, p); }
  // §329: 音量（%。0〜150・10 きざみ）
  var SYN_VOL_MAX = 150, SYN_VOL_STEP = 10;
  function synVol(v, d) { v = Number(v); return v >= 0 && v <= SYN_VOL_MAX && v % SYN_VOL_STEP === 0 ? v : d; }
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
  // ---------- §342 9B-7: ゴリラDAW へ送る（テイク → MIDI のクリップ ＋ 同じ音色のパラメーター。変換と受け取り箱は DAW のモデルの takePayload／takeSend）----------
  function synDawPreset(patch) { var i, js = JSON.stringify(patch); for (i = 0; i < SYN_PRESETS.length; i++) { if (JSON.stringify(synPatchClean(SYN_PRESETS[i][2])) === js) { return SYN_PRESETS[i][0]; } } return ""; }
  function synDawPayload(take) {
    var M = window.UGDawModel, t = take ? synTakeClean(take, 0) : null, pre = t ? synDawPreset(t.patch) : "";
    if (!M || !M.takePayload) { return null; }
    return M.takePayload(t, { key: "synth", part: t && t.pname ? t.pname : "シンセ", preset: pre || "lead", patch: t ? t.patch : null, patchName: t ? t.pname : "", def: "シンセのテイク" });
  }
  function synDawCheck(take) { var M = window.UGDawModel; if (!M || !M.takeCheck) { return { ok: false, why: "ゴリラDAW（arcade-daw-model.js）を読みこめませんでした" }; } return M.takeCheck("synth", synDawPayload(take), take); }
  function synDawSend(take) { var M = window.UGDawModel; if (!M || !M.takeSend) { return { ok: false, why: "ゴリラDAW（arcade-daw-model.js）を読みこめませんでした" }; } return M.takeSend("synth", synDawPayload(take), take); }
  function synDawName(m) { return SYN_CDE[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1); }
  function synDawIn() { return "音色のつまみ（波の形・オシレーター2・サブ・フィルター・エンベロープ・LFO・音量）は、そのまま DAW のトラックの音色になります（同じゴリラシンセの音源）"; }
  function synDawWarn(t) {
    var w = ["モノ・ポルタメント（前の音から次の音へつなぐ）は DAW では効きません（DAW は 1 音ずつ鳴らします）", "XY パッドで動かした音の高さ・明るさ・うねりは入りません（録音に残っていないため）", "強さは録音に残っていないので、どの音も 0.8 です", "ゲームの音量の設定（シンセ・伴奏・ドラム）は入りません", "MIDI ファイルに書き出すと、音色は近い GM の番号だけになります（JSON・ZIP には音色が入ります）"];
    if (t && t.meter === 3) { w.push("3/4 拍子のテイクです"); }
    return w;
  }
  // 確認の欄（u: { id, sent, err }）
  function synDawHtml(take, u) {
    var h = '<div class="uke-daw">', M = window.UGDawModel;
    if (u.sent) {
      return h + '<div><b>&#x1F4E4; 「' + escHtml(u.sent) + '」を送りました</b></div><div class="small">ゴリラDAW の「&#x1F4E5; 取り込み」で受け取れます（' + M.INBOX_DAYS + ' 日のあいだ）。テイクは変わっていません。</div>' +
        '<div class="melody-actions"><button class="modal-btn" data-dawo="1">&#x1F39A;&#xFE0F; ゴリラDAW を開く</button><button class="modal-btn" data-dawx="1">閉じる</button></div></div>';
    }
    var c = synDawCheck(take), p = c.pay, t = take ? synTakeClean(take, 0) : null;
    h += '<div><b>&#x1F3B9; ゴリラDAW へ送る</b>（MIDI のクリップ ＋ 音色）</div>';
    if (p && p.parts.length) {
      h += '<div class="small">テイク: <b>' + escHtml(p.name) + '</b>・BPM ' + p.bpm + '・' + p.meter + '/4 拍子・' + p.bars + ' 小節（' + p.sec + ' 秒）・' + p.notes + ' 音' + (p.poly > 1 ? '（同時に鳴る音は最大 ' + p.poly + '）' : '') + '<br>音の高さ: ' + synDawName(p.lo) + '〜' + synDawName(p.hi) + '・音色: ' + escHtml(t && t.pname ? t.pname : "じぶんの音色") + '</div>';
      h += '<div class="small">&#x2705; ' + escHtml(synDawIn()) + '</div><div class="small">' + synDawWarn(t).map(function (x) { return "・" + escHtml(x); }).join("<br>") + '</div>';
    }
    if (c.prev && c.ok) { h += '<div class="small uke-daw-warn">&#x26A0;&#xFE0F; まだ DAW で受け取っていない「' + escHtml(c.prev) + '」があります。送ると、そちらは置きかわります</div>'; }
    if (!c.ok) { h += '<div class="small uke-daw-warn">&#x26A0;&#xFE0F; ' + escHtml(c.why) + '</div>'; }
    if (u.err) { h += '<div class="small uke-daw-warn">&#x26A0;&#xFE0F; ' + escHtml(u.err) + '</div>'; }
    return h + '<div class="melody-actions"><button class="modal-btn" data-daws="1"' + (c.ok ? '' : ' disabled') + '>&#x1F4E4; 送る</button><button class="modal-btn" data-dawx="1">やめる</button></div></div>';
  }
  function synSetup(root, ctl) {
    var p = synPrefs(), note = "", dawU = null; // 9B-7: DAW へ送る欄 { id, sent, err }
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
        '<p class="small" style="margin:4px 0 2px;">音名</p><div class="quiz-opts">' + opts(SYN_NAMES, p.names, "names") + '</div>';
      var my = synMyLoad(), bl = BA() && BA().backList ? BA().backList() : [];
      if (my.length) {
        html += '<p class="small" style="margin:6px 0 2px;">&#x1F4BE; じぶんの音色（' + my.length + ' / ' + SYN_MY_MAX + '）</p>';
        for (i = 0; i < my.length; i++) {
          html += '<div class="piano-take"><span>' + escHtml(my[i].name) + '</span><button class="modal-btn' + (p.mine === my[i].name ? " piano-rec-on" : "") + '" data-mine="' + i + '">つかう</button><button class="modal-btn" data-mydel="' + i + '">&#x1F5D1;&#xFE0F;</button></div>';
        }
      }
      if (bl.length) { html += '<p class="small" style="margin:6px 0 2px;">&#x1F3B8; 伴奏（ゴリラウクレレのシーケンサーの曲）</p><div class="piano-opts">' + opts([["-", "なし"]].concat(bl), p.backing || "-", "backing") + '</div>'; }
      html += '<button class="modal-btn" data-go="1" style="width:100%;margin-top:8px;">&#x1F39B;&#xFE0F; はじめる</button>' +
        '<p class="small" style="margin:10px 0 2px;">&#x1F399;&#xFE0F; 録音したテイク（' + takes.length + ' / ' + SYN_TAKES_MAX + '）</p>';
      if (note) { html += '<p class="small" style="color:#ffd166;margin:0 0 4px;">' + note + '</p>'; }
      if (!takes.length) { html += '<p class="small" style="color:#adb5bd;margin:0;">まだありません。弾く画面の「🔴 録音」で録れます。</p>'; }
      for (i = 0; i < takes.length; i++) {
        html += '<div class="piano-take take-4"><span>' + escHtml(takes[i].name) + '<br><span class="small" style="color:#adb5bd;">' + takes[i].notes.length + '音・BPM ' + takes[i].bpm + (takes[i].pname ? '・' + escHtml(takes[i].pname) : "") + '</span></span>' +
          '<button class="modal-btn" data-open="' + takes[i].id + '">&#x25B6;&#xFE0F; ひらく</button>' +
          '<button class="modal-btn" data-send="' + takes[i].id + '" title="シーケンサーへ送る">&#x1F3B8; 送る</button>' +
          '<button class="modal-btn" data-dawt="' + takes[i].id + '" title="ゴリラDAW へ送る">&#x1F3B9; DAWへ</button>' +
          '<button class="modal-btn" data-del="' + takes[i].id + '">&#x1F5D1;&#xFE0F;</button></div>';
        if (dawU && dawU.id === takes[i].id) { html += synDawHtml(takes[i], dawU); } // 9B-7
      }
      html += '<button class="modal-btn" data-back="1" style="width:100%;margin-top:14px;">&#x1F579;&#xFE0F; メニューへ</button></div>';
      root.innerHTML = html;
      var btns = root.querySelectorAll("button"), j;
      for (j = 0; j < btns.length; j++) {
        btns[j].onclick = function (ev) {
          var el = ev.currentTarget, v;
          if ((v = el.getAttribute("data-view"))) { p.view = v; synSavePrefs(p); draw(); return; }
          if ((v = el.getAttribute("data-preset"))) { p.preset = v; p.patch = synPreset(v).patch; p.edited = false; p.mine = ""; synSavePrefs(p); draw(); return; }
          if ((v = el.getAttribute("data-mine"))) { var my0 = synMyLoad()[Number(v)]; if (my0) { p.patch = my0.patch; p.mine = my0.name; p.edited = false; synSavePrefs(p); } draw(); return; }
          if ((v = el.getAttribute("data-mydel"))) {
            var myl = synMyLoad(), mt = myl[Number(v)];
            if (!mt || (window.confirm && !window.confirm("じぶんの音色「" + mt.name + "」を消しますか？"))) { return; }
            myl.splice(Number(v), 1);
            synMySave(myl);
            if (p.mine === mt.name) { p.mine = ""; p.edited = true; synSavePrefs(p); }
            draw();
            return;
          }
          if ((v = el.getAttribute("data-backing"))) { p.backing = v === "-" ? "" : v; synSavePrefs(p); draw(); return; }
          if ((v = el.getAttribute("data-names"))) { p.names = v; synSavePrefs(p); draw(); return; }
          // §342 9B-7: ゴリラDAW へ送る
          if ((v = el.getAttribute("data-dawt"))) { dawU = { id: Number(v) }; note = ""; draw(); return; }
          if (el.getAttribute("data-dawx")) { dawU = null; draw(); return; }
          if (el.getAttribute("data-daws") && dawU && !dawU.busy) {
            dawU.busy = true;
            var dr = synDawSend(synTakeById(synTakesLoad(), dawU.id));
            if (!dr.ok) { dawU.busy = false; dawU.err = dr.why; } else { dawU = { id: dawU.id, sent: dr.name }; }
            draw();
            return;
          }
          if (el.getAttribute("data-dawo")) { dawU = null; if (!(I.switchTo && I.switchTo("daw"))) { note = "メニューへ戻って、ゴリラDAW を開いてください"; draw(); } return; }
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
          if (el.getAttribute("data-go")) { ctl.done({ backing: p.backing }); return; }
          if ((v = el.getAttribute("data-open"))) { ctl.done({ take: Number(v), backing: p.backing }); }
        };
      }
    }
    draw();
  }

  var SYN_KEYS = { b: "pat", "1": "ch:0", "2": "ch:1", "3": "ch:2", "4": "ch:3", "5": "ch:4", "6": "ch:5", "7": "ch:6", a: "n:0", w: "n:1", s: "n:2", e: "n:3", d: "n:4", f: "n:5", t: "n:6", g: "n:7", y: "n:8", h: "n:9", u: "n:10", j: "n:11", k: "n:12", z: "rec", x: "play", ",": "octdown", ".": "octup" };

  I.register({
    id: "synth",
    after: "horn",
    cat: "music",
    music: true,
    name: "ゴリラシンセ",
    icon: "&#x1F39B;&#xFE0F;",
    desc: "波の形・フィルター・LFO で音を作って弾くシンセサイザー。XY パッドで音が変わる",
    help: "鍵盤を押しているあいだ鳴る（アルペジエーター ON なら押さえた音を自動で1音ずつ）/ 上の XY パッド: 横 ＝ 明るさ・縦 ＝ うねり / XYパッド演奏: 横 ＝ 音・縦 ＝ 明るさ / キー A W S E D F T G Y H U J K / , . オクターブ / Z 録音 / X 再生 / B パターン / 1〜7 パターンのコード / P一時停止",
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
      // §320: よこ向き
      function applyLand() {
        if (api.setLandscape) { api.setLandscape(prefs.land); }
        var box = panel && panel.parentNode;
        synLayout(prefs.land, prefs.land && box && B.landH ? B.landH(box.clientWidth, box.clientHeight) : 130);
        if (api.setCanvasHeight) { api.setCanvasHeight(SYN_H); }
      }
      applyLand();
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
      function out() { return audioOk && B.bus ? B.bus(buses, "y", prefs.yvol, false) : null; }
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
        if (arpOn()) { return; } // §320: 鳴らすのはアルペジエーター
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
        if (patch.mono && !quiet && !arpOn()) { mono(); }
      }
      function allOff() {
        var i;
        for (i = 0; i < arpVo.length; i++) { synRelease(arpVo[i], 0.05); }
        arpVo = []; arp = null;
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
      // §320: 伴奏（シーケンサーの曲）
      var back = cfg.backing && B.backing ? B.backing(cfg.backing) : null, bk = null;
      if (back) { bpm = back.seq.bpm; meter = back.seq.meter; if (!take) { msg = "&#x1F3B8; 伴奏に合わせて弾こう"; } }
      else if (cfg.backing) { msg = "伴奏の曲が見つかりませんでした（ゴリラウクレレのシーケンサーで曲を作ってね）"; }
      function backApi() { var U = window.UGUkulele; return U && U.seqPlayEvent ? U : null; }
      function backT() { return bk ? (frame - bk.f0) / 60 : 0; }
      function backBeat() { var S0 = back.s, t = backT(); return t < S0.lead ? (t - S0.lead) / S0.spb : S0.beatAt(t); }
      function backStart(pre) {
        backStop();
        audio();
        var U = backApi(), progs = [140], ids, i;
        bk = { f0: frame + Math.round((pre || 0) * 60), idx: 0, outs: [null, null, null, null], mix: null, fx: false };
        if (!audioOk || !U) { return; }
        try { ids = U.trackIds(back.s.tracks); for (i = 0; i < ids.length; i++) { if (back.s.tracks[ids[i]].on && back.s.tracks[ids[i]].prog !== undefined) { progs.push(back.s.tracks[ids[i]].prog); } } UG.loadSamples(progs); } catch (e0) {}
        if (U.fxPush) { try { U.fxPush(back.seq); bk.fx = true; } catch (e) {} }
      }
      function backStop() {
        if (!bk) { return; }
        var U = backApi();
        if (bk.fx && U && U.fxPop) { try { U.fxPop(); } catch (e) {} }
        if (U && U.susStop) { try { U.susStop(); } catch (e9) {} }
        bk = null;
        arp = null;
      }
      function backStep() {
        var S0 = back.s, t = backT(), U = backApi(), ac = audioOk && UG.audio ? UG.audio.ctx : null, ev;
        while (bk.idx < S0.events.length && (ev = S0.events[bk.idx]).t <= t + 0.1) {
          if (ac && U && B.backEventOn(ev, back.seq, S0.lead, false)) {
            try { if (!bk.mix) { bk.mix = U.mixer(UG, ac, S0.tracks); } U.seqPlayEvent(UG, ac, ev, ac.currentTime + Math.max(0, ev.t - t), back.lowG, 0.55, bk.outs, bk.mix, S0.tracks); } catch (e) {}
          }
          bk.idx++;
        }
        if (t >= S0.time) { if (rec) { recStop(); } backStop(); if (play) { playStop(); } if (pat && pat.back) { patStop(); } render(); }
      }
      function backToggle() { if (bk) { if (rec) { recStop(); } backStop(); playStop(); if (pat && pat.back) { patStop(); } } else { if (pat) { patStop(); } backStart(0); } render(); }
      function recBeat() { return rec ? (rec.back ? backBeat() : (now() - rec.t0) * bpm / 60) : 0; }
      function r3(v) { return Math.round(v * 1000) / 1000; }
      function recToggle() {
        if (rec) { recStop(); return; }
        playStop();
        audio();
        if (back) { backStart(back.s.lead ? 0 : meter * back.s.spb); rec = { back: true, notes: [], open: {}, beat: -99 }; }
        else { rec = { t0: now() + meter * 60 / bpm, notes: [], open: {}, beat: -meter - 1 }; }
        arp = null;
        if (pat) { patStart(); } // §329: 録音の頭にそろえて鳴らしなおす
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
      function presetName() { return prefs.mine ? prefs.mine + (prefs.edited ? "＊" : "") : prefs.edited ? "じぶんの音色" : synOpt(SYN_PRESETS, prefs.preset)[1].replace(/&#x[0-9A-F]+;(&#x[0-9A-F]+;)?\s*/g, ""); }
      function recStop() {
        var ks = [], k;
        for (k in rec.open) { if (rec.open.hasOwnProperty(k)) { ks.push(k); } }
        for (k = 0; k < ks.length; k++) { recOff(ks[k]); }
        var endB = recBeat(), n = rec.notes.filter(function (x) { return x[0] <= endB + 1e-6; }).sort(function (a, b) { return a[0] - b[0]; }), wasBack = rec.back; // §329: 先に予約したパターンの音は入れない
        rec = null;
        if (wasBack) { backStop(); }
        if (n.length) {
          take = synTakeAdd(takes, { bpm: bpm, meter: meter, pname: presetName(), patch: patch, notes: n });
          synTakesSave(takes);
          msg = "&#x1F4BE; 「" + escHtml(take.name) + "」に保存しました（" + take.notes.length + "音・音色も）<br>はじめの画面の「🎸 送る」でシーケンサーに入れられます";
        } else { msg = "音がなかったので保存しませんでした"; }
        render();
      }
      function playBeat() { return play ? (play.back ? backBeat() : (now() - play.t0) * play.bpm / 60) : 0; }
      function playStop() { if (!play) { return; } var wb = play.back; for (var i = 0; i < play.vo.length; i++) { synRelease(play.vo[i], 0.05); } play = null; if (wb) { backStop(); } }
      function playToggle() {
        if (play) { playStop(); render(); return; }
        if (rec) { return; }
        if (!take || !take.notes.length) { msg = "まだテイクがありません。🔴 録音で録ってね"; render(); return; }
        audio();
        if (pat) { patStop(); }
        if (back) { backStart(0); }
        play = { back: !!back, t0: now() + 0.1, bpm: back ? back.seq.bpm : take.bpm, notes: take.notes, idx: 0, vo: [], patch: synPatchClean(take.patch) };
        render();
      }

      // --- §320: アルペジエーター（押さえている音を1音ずつ）---
      var arp = null, arpVo = [], arpCur = null;
      function arpOn() { return prefs.arp.on && prefs.view === "keys"; }
      function arpStart() {
        var u = prefs.arp.rate;
        if (bk) { arp = { back: true, b0: Math.max(0, Math.ceil(backBeat() / u - 1e-6) * u), k: 0 }; }
        else if (rec) { arp = { t0: rec.t0 + Math.max(0, Math.ceil(recBeat() / u - 1e-6)) * u * 60 / bpm, k: 0 }; }
        else { arp = { t0: now() + 0.02, k: 0 }; }
      }
      function arpTime(k) { return arp.back ? now() + (back.s.tm(arp.b0 + k * prefs.arp.rate) - backT()) : arp.t0 + k * prefs.arp.rate * 60 / bpm; }
      function arpStep() {
        if (!arpOn() || !held.length) { arp = null; arpCur = null; return; }
        if (!arp) { arpStart(); }
        var ac = audioOk && UG.audio ? UG.audio.ctx : null, n = 0, i;
        while (arp && n++ < 16) {
          var dt = arpTime(arp.k) - now();
          if (dt > 0.1) { break; }
          var k = arp.k++;
          if (dt < -0.05) { continue; }
          var list = synArpOrder(held.map(function (h0) { return h0.m; }), prefs.arp.mode, prefs.arp.oct);
          var m = prefs.arp.mode === "random" ? list[Math.floor(Math.random() * list.length)] : list[k % list.length];
          var spb = arp.back ? back.s.spb : 60 / bpm, len = prefs.arp.rate * prefs.arp.gate, when = ac ? ac.currentTime + Math.max(0, dt) : 0;
          var v = synVoice(patch, m, out(), when, 0.8);
          if (v) { synRelease(v, undefined, when + len * spb); arpVo.push(v); }
          arpCur = m;
          if (rec) { var b = recBeat() + Math.max(0, dt) / spb; if (b >= -0.05 && rec.notes.length < SYN_NOTES_MAX) { rec.notes.push([r3(Math.max(0, b)), r3(len), m]); } }
        }
        if (arpVo.length > 32 && ac) { for (i = arpVo.length - 1; i >= 0; i--) { if (arpVo[i].end < ac.currentTime) { arpVo.splice(i, 1); } } }
      }

      // ---------- §329: ▶ パターン（ゴリラピアノと同じ鳴らし方・コードのボタン・コード進行・ハネ・ドラム・ベース）----------
      var pat = null, pend = null, cur = null, flashC = {};
      function PI() { return window.UGPiano; }
      function patOk() { var P = PI(); return !!(P && P.barSteps && P.voicing && B && B.chord && B.cprog); }
      function degChord(d) { var ch = B.chord(prefs.key, d, prefs.scale, prefs.sev); return { ch: ch, ns: PI().voicing(ch, prefs.sev), name: ch.name, d: d }; }
      function songK(b) { return back && back.chords && back.chords.length ? B.chordIdx(back.chords, b) : -1; }
      function songChordObj(k) { var c = back.chords[k]; return { ch: c.ch, ns: PI().voicing(c.ch, /(7|9|11|13)/.test(String(c.name).split("/")[0])), name: c.name, d: -1 }; }
      function chordFor(b) { if (pat && pat.back) { var k = songK(b); if (k >= 0) { return songChordObj(k); } } return cur || degChord(0); }
      function nextFor(b) {
        if (pat && pat.back) { var k = songK(b); return k >= 0 && k + 1 < back.chords.length ? back.chords[k + 1].ch : null; }
        if (pend) { return pend.ch; }
        var cp = B.cprog(prefs.cprog);
        return cp ? B.chord(prefs.key, B.cprogAt(cp, b, meter).next, prefs.scale, prefs.sev) : null;
      }
      function patChordText() {
        if (!pat) { return ""; }
        var b = Math.max(0, patBeat()), co = chordFor(b), nx = "";
        if (pat.back) { var k = songK(b); nx = k >= 0 && k + 1 < back.chords.length ? back.chords[k + 1].name : ""; }
        else if (pend) { nx = pend.name; }
        else { var cp = B.cprog(prefs.cprog); if (cp) { nx = B.chord(prefs.key, B.cprogAt(cp, b, meter).next, prefs.scale, prefs.sev).name; } }
        return co.name + (nx && nx !== co.name ? " → " + nx : "");
      }
      function barHead(b) {
        var bar = Math.floor(b / meter + 1e-6), cp = B.cprog(prefs.cprog);
        if (bar === pat.lastBar) { return; }
        pat.lastBar = bar;
        if (pend) { cur = pend; pend = null; }
        else if (cp) { var d = B.cprogAt(cp, b, meter).d; if (!cur || cur.d !== d) { cur = degChord(d); } }
        if (!cur) { cur = degChord(0); }
        if (cur.d >= 0) { flashC[cur.d] = 12; }
      }
      // コードのボタン（パターン中は次の小節の頭で。とまっているときは すぐ）
      function setChord(d) {
        if (!patOk() || (pat && pat.back)) { return; }
        if (prefs.cprog) { prefs.cprog = ""; save(); }
        var c = degChord(d);
        if (pat) { pend = c; } else { cur = c; flashC[d] = 12; }
        render();
      }
      function patBeat() { return pat.back ? backBeat() : (now() - pat.t0) * bpm / 60; }
      function patTime(b) { return pat.back ? now() + (back.s.tm(b) - backT()) : pat.t0 + b * 60 / bpm; }
      function patStart() {
        patStop();
        if (!patOk()) { msg = "ゴリラピアノ・ゴリラベースが読みこめませんでした"; return; }
        audio();
        if (back && !bk) { backStart(0); }
        pat = { back: !!(back && bk), t0: rec && !rec.back ? rec.t0 : now() + 0.1, k: 0, unit: 1, pl: null, dk: 0, bk: 0, bvo: null, lastBar: -1, vo: [] };
        patRetime();
        drumInit();
        if (audioOk && prefs.bpat) { try { UG.loadSamples([33]); } catch (e) {} }
      }
      function patRetime() {
        var bt = Math.max(0, patBeat()), bd = bassDef();
        function at(u) { return Math.max(0, Math.ceil(bt / u - 1e-6)); }
        pat.pl = PI().play(prefs.spat);
        pat.unit = PI().barSteps([60], prefs.spat, prefs.srate, meter, pat.pl).unit;
        pat.k = at(pat.unit); pat.dk = at(0.25); pat.bk = bd ? at(meter / bd[2].length) : 0;
      }
      function patStop() {
        if (!pat) { return; }
        for (var i = 0; i < pat.vo.length; i++) { synRelease(pat.vo[i], 0.06); }
        if (pat.bvo && UG.voiceStop) { try { UG.voiceStop(pat.bvo, 0, 0.06); } catch (e) {} }
        pat = null;
        if (pend) { cur = pend; pend = null; }
      }
      function patToggle() { if (pat) { patStop(); } else { if (play) { playStop(); } patStart(); } render(); }
      function patStep() {
        var ac = audioOk && UG.audio ? UG.audio.ctx : null, n = 0, i, j, spb = pat.back ? back.s.spb : 60 / bpm;
        if (ac) { for (i = pat.vo.length - 1; i >= 0; i--) { if (pat.vo[i].end < ac.currentTime) { pat.vo.splice(i, 1); } } }
        while (pat && n++ < 64) {
          var unit = pat.unit, tpb = Math.max(1, Math.round(meter / unit)), per = Math.round(1 / unit), b = pat.k * unit, ci = pat.k % tpb;
          var dt = patTime(b + B.swingOf(prefs.swing, per, ci) * unit) - now();
          if (dt > 0.1 || (pat.back && b >= back.s.beats - 1e-6)) { break; }
          pat.k++;
          if (ci === 0 && !pat.back) { barHead(b); }
          if (dt < -0.05) { continue; }
          var co = chordFor(b), ps = PI().barSteps(co.ns, prefs.spat, prefs.srate, meter, pat.pl), L0 = ps.steps.length;
          var st = ps.acc ? (ci < L0 ? ps.steps[ci] : null) : ps.steps[ci % L0];
          if (!st) { continue; }
          var len = 1;
          if (ps.acc) { len = tpb - ci; } else { for (j = ci + 1; j < tpb && !ps.steps[j % L0]; j++) { len++; } }
          var sec = len * unit * spb * (ps.acc ? 1 : 0.95), dd = Math.max(0, dt);
          for (j = 0; j < st.length; j++) {
            var m = st[j];
            if (m < 0 || m > 127) { continue; }
            if (ac) { var v = synNote(patch, m, out(), ac.currentTime + dd, 0.7, sec); if (v) { pat.vo.push(v); } }
            if (rec && rec.notes.length < SYN_NOTES_MAX) { var rb = pat.back ? b : (rec.back ? b : b); if (rb >= 0) { rec.notes.push([r3(rb), r3(Math.max(0.0625, len * unit)), m]); } }
          }
        }
        if (pat && pat.vo.length > 64) { pat.vo.splice(0, pat.vo.length - 64); }
      }
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
        try { if (UG.setDrumSamples) { UG.setDrumSamples(dp.real); } if (UG.setDrumKit) { UG.setDrumKit(dp.kitId); } if (dp.real && UG.loadSamples) { UG.loadSamples([UG.DRUM]); } } catch (e2) {}
      }
      function drumStep() {
        var dd = drumDef(), D = window.UGDrum, ac = audioOk && UG.audio ? UG.audio.ctx : null, n = 0, i, q, swAmt = 0;
        if (!dd || !ac) { return; }
        var du = meter / dd.len, bper = Math.round(1 / pat.unit) === 4 ? 4 : 2;
        for (q = 0; q < B.SWINGS.length; q++) { if (B.SWINGS[q][0] === prefs.swing) { swAmt = B.SWINGS[q][2]; } }
        while (n++ < 16) {
          var s0 = pat.dk % dd.len, sw = (bper === 2 && s0 % 4 === 2) ? swAmt * 0.5 : ((bper === 4 && s0 % 2 === 1) ? swAmt * 0.25 : 0);
          var dt = patTime(pat.dk * du + sw) - now();
          if (dt > 0.1) { break; }
          pat.dk++;
          if (dt < -0.05) { continue; }
          for (i = 0; i < dd.steps.length; i++) {
            if (dd.steps[i][1].indexOf(s0) < 0) { continue; }
            var lv = 0.8;
            try { lv = D.patVel ? D.patVel(dd.steps[i][0], s0 % 16, false) : 0.8; } catch (e) {}
            try { UG.synth(dd.steps[i][0], UG.DRUM, ac.currentTime + Math.max(0, dt), lv * 0.75, B.bus(buses, "d", prefs.dvol) || undefined); } catch (e2) {}
          }
        }
      }
      function bassDef() { if (!prefs.bpat || !B.patterns) { return null; } var d = B.patById(B.patterns(meter), prefs.bpat); return d && d[0] === prefs.bpat && d[3] === meter ? d : null; }
      function bassStep() {
        var bd = bassDef(), ac = audioOk && UG.audio ? UG.audio.ctx : null, n = 0;
        if (!bd || !ac) { return; }
        var pt = bd[2], unit = meter / pt.length, per = pt.length / meter, spb = pat.back ? back.s.spb : 60 / bpm;
        while (n++ < 16) {
          var b = pat.bk * unit, ci = pat.bk % pt.length, dt = patTime(b + B.swingOf(prefs.swing, per, ci) * unit) - now();
          if (dt > 0.1 || (pat.back && b >= back.s.beats - 1e-6)) { break; }
          pat.bk++;
          if (dt < -0.05) { continue; }
          var c = pt.charAt(ci);
          if (c === "-" && ci === 0) { c = "R"; }
          if (c === "-") { continue; }
          var left0 = Math.floor(b / meter + 1e-6) * meter + meter - b;
          var m = B.tokNote(c, chordFor(b).ch, nextFor(b), left0), len = B.tokLen(pt, ci) * unit, when = ac.currentTime + Math.max(0, dt);
          if (pat.bvo && UG.voiceStop) { try { UG.voiceStop(pat.bvo, when, 0.03); } catch (e0) {} }
          try {
            var bus = B.bus(buses, "b", prefs.bvol, false), smp = !!(UG.samples && UG.samples.enabled && UG.sampleReady && UG.sampleReady(33)), g = null;
            if (bus) { g = ac.createGain(); g.gain.value = 0.85 * (smp ? 4 : 1); g.connect(bus); }
            pat.bvo = UG.synth(m, 33, when, 0.85, g || undefined, 8) || null;
            if (pat.bvo && UG.voiceStop) { UG.voiceStop(pat.bvo, when + len * spb * 0.92, 0.04); }
          } catch (e) {}
        }
      }
      function playOptions() {
        var P = PI(), all = P ? P.PLAYS.slice() : [], mine = P ? P.myPatsLoad() : [], groups = [["chord", "和音"], ["arp", "アルペジオ"], ["pat", "演奏パターン"], ["my", "じぶんのパターン（ゴリラピアノ）"]], opts = "", gi, oi;
        for (oi = 0; oi < mine.length; oi++) { all.push(["my:" + mine[oi].id, mine[oi].name, "my"]); }
        for (gi = 0; gi < groups.length; gi++) {
          var go = "";
          for (oi = 0; oi < all.length; oi++) { if (all[oi][2] === groups[gi][0]) { go += '<option value="' + all[oi][0] + '"' + (prefs.spat === all[oi][0] ? " selected" : "") + '>' + escHtml(groups[gi][0] === "chord" ? "和音（1小節のばす）" : all[oi][1]) + '</option>'; } }
          if (go) { opts += '<optgroup label="' + groups[gi][1] + '">' + go + '</optgroup>'; }
        }
        return opts;
      }
      function patPanel() {
        var P = PI(), pl = P ? P.play(prefs.spat) : ["", "", "chord"], h = "", i, j;
        if (!patOk()) { return '<p class="small">ゴリラピアノ・ゴリラベースが読みこめませんでした</p>'; }
        h += '<div class="piano-row"><label class="piano-select">&#x1F3BC; <select data-yspat="1">' + playOptions() + '</select></label></div>' +
          '<div class="piano-row"><button class="modal-btn" data-ya="srate"' + (pl[2] === "arp" ? "" : " disabled") + '>' + (prefs.srate === 16 ? "16分" : "8分") + '</button>' +
          '<button class="modal-btn" data-ya="swing">ハネ: ' + ["なし", "軽く", "ハネ", "3連"][prefs.swing] + '</button>' +
          '<button class="modal-btn" data-ya="sev">' + (prefs.sev ? "7th" : "3和音") + '</button></div>';
        if (!back) {
          h += '<div class="piano-opts">';
          for (i = 0; i < 7; i++) {
            var c = degChord(i), on = (cur && cur.d === i) || flashC[i] > 0, pn = pend && pend.d === i;
            h += '<button class="modal-btn quiz-opt' + (on ? " active" : "") + '" data-ya="ch:' + i + '"' + (pn ? ' style="outline:2px solid #ff9f43;"' : "") + '>' + escHtml(c.name) + '<br><span class="small">' + (i + 1) + '</span></button>';
          }
          var co = '<option value=""' + (prefs.cprog ? "" : " selected") + '>コード進行なし（コードのボタンで）</option>', gs = B.CPROG_GROUPS || [];
          for (i = 0; i < gs.length; i++) {
            co += '<optgroup label="' + escHtml(gs[i][0]) + '">';
            for (j = 0; j < gs[i][1].length; j++) { var cp = B.cprog(gs[i][1][j]); if (cp) { co += '<option value="' + cp[0] + '"' + (cp[0] === prefs.cprog ? " selected" : "") + '>' + escHtml(cp[1]) + '</option>'; } }
            co += '</optgroup>';
          }
          h += '</div><div class="piano-row"><label class="piano-select">&#x1F501; <select data-ycprog="1">' + co + '</select></label></div>';
        }
        return h + '<p class="small" style="margin:4px 0 0;">' + (back ? "コードは曲に合わせて変わります。" : prefs.cprog ? "コードは進行どおり1小節ごとに変わります。" : "パターン中にコードのボタン（キー 1〜7）を押すと、次の小節の頭で変わります。") +
          ' キー・スケールは「弾き方」のタブ。鍵盤はそのまま弾けます</p>';
      }
      function bandPanel() {
        var D = window.UGDrum, l = [], dopt = '<option value=""' + (prefs.drum ? "" : " selected") + '>ドラムなし</option>', grp = "", bopt = '<option value=""' + (prefs.bpat ? "" : " selected") + '>ベースなし</option>', h = "", i, j;
        try { l = D && D.patternList ? D.patternList() : []; } catch (e) {}
        for (i = 0; i < l.length; i++) {
          if (l[i].kind !== "loop" || l[i].len !== (meter === 3 ? 12 : 16)) { continue; }
          if (l[i].group !== grp) { dopt += (grp ? '</optgroup>' : "") + '<optgroup label="' + escHtml(l[i].group) + '">'; grp = l[i].group; }
          dopt += '<option value="' + escHtml(l[i].id) + '"' + (l[i].id === prefs.drum ? " selected" : "") + '>' + escHtml(l[i].name) + '</option>';
        }
        dopt += grp ? '</optgroup>' : "";
        if (B.patterns) {
          var gs = B.patGroups(B.patterns(meter));
          for (i = 0; i < gs.length; i++) {
            bopt += '<optgroup label="' + escHtml(gs[i][0]) + '">';
            for (j = 0; j < gs[i][1].length; j++) { var p0 = gs[i][1][j]; if (p0[3] === meter) { bopt += '<option value="' + p0[0] + '"' + (p0[0] === prefs.bpat ? " selected" : "") + '>' + escHtml(p0[1]) + '</option>'; } }
            bopt += '</optgroup>';
          }
        }
        h += '<div class="piano-row"><label class="piano-select">&#x1F941; <select data-ydrum="1">' + dopt + '</select></label></div>' +
          '<div class="piano-row"><label class="piano-select">&#x1F3B8; <select data-ybpat="1">' + bopt + '</select></label></div>';
        var vols = [["y", "&#x1F39B;&#xFE0F; シンセ"], ["b", "&#x1F3B8; ベース"], ["d", "&#x1F941; ドラム"]];
        for (i = 0; i < 3; i++) { h += '<div class="piano-row"><span>' + vols[i][1] + '</span><button class="modal-btn" data-ya="' + vols[i][0] + 'vol:-">－</button><span>' + prefs[vols[i][0] + "vol"] + '%</span><button class="modal-btn" data-ya="' + vols[i][0] + 'vol:+">＋</button></div>'; }
        return h + '<p class="small" style="margin:4px 0 0;">▶ パターンのあいだ、ドラムとベースもいっしょに鳴ります</p>';
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
        else if (v === "bpmdown" || v === "bpmup") { if (rec || back) { return; } var pcb = pat ? (now() - pat.t0) * bpm / 60 : 0; bpm = Math.max(40, Math.min(240, bpm + (v === "bpmup" ? 5 : -5))); if (pat) { pat.t0 = now() - pcb * 60 / bpm; } prefs.bpm = bpm; save(); render(); }
        else if (/^tab:/.test(v)) { var tb = v.substring(4); prefs.tab = ["play", "pat", "band"].indexOf(tb) >= 0 ? tb : "sound"; save(); render(); }
        // §329: パターン
        else if (v === "pat") { patToggle(); }
        else if (/^ch:\d$/.test(v)) { setChord(Number(v.charAt(3))); }
        else if (/^spat:/.test(v)) { prefs.spat = PI() ? PI().play(v.substring(5))[0] : "up"; save(); if (pat) { patRetime(); } render(); }
        else if (v === "srate") { prefs.srate = prefs.srate === 16 ? 8 : 16; save(); if (pat) { patRetime(); } render(); }
        else if (v === "swing") { prefs.swing = (prefs.swing + 1) % 4; save(); render(); }
        else if (v === "sev") { prefs.sev = !prefs.sev; save(); if (cur && cur.d >= 0) { cur = degChord(cur.d); } render(); }
        else if (/^cprog:/.test(v)) { prefs.cprog = B.cprog(v.substring(6)) ? v.substring(6) : ""; save(); render(); }
        else if (/^drum:/.test(v)) { prefs.drum = v.substring(5); drumCache = null; save(); if (pat) { patRetime(); drumInit(); } render(); }
        else if (/^bpat:/.test(v)) { prefs.bpat = v.substring(5); save(); if (pat) { patRetime(); if (audioOk) { try { UG.loadSamples([33]); } catch (e1) {} } } render(); }
        else if (/^[ybd]vol:[+-]$/.test(v)) {
          var vk = v.charAt(0) + "vol";
          prefs[vk] = Math.max(0, Math.min(SYN_VOL_MAX, prefs[vk] + (v.charAt(5) === "+" ? SYN_VOL_STEP : -SYN_VOL_STEP)));
          save(); if (B.bus && audioOk) { B.bus(buses, v.charAt(0), prefs[vk], false); }
          render();
        }
        else if (/^preset:/.test(v)) { allOff(); var pr = synPreset(v.substring(7)); prefs.preset = pr.id; prefs.patch = patch = pr.patch; prefs.edited = false; prefs.mine = ""; save(); render(); }
        else if (v === "mysave") {
          var my = synMyLoad(), nm = prefs.mine || ("じぶんの音 " + (my.length + 1));
          try { if (window.prompt) { var r0 = window.prompt("音色の名前（16文字まで）", nm); if (r0 === null) { return; } nm = r0; } } catch (e) {}
          var ix = synMyPut(my, nm, patch);
          if (ix < 0) { msg = "じぶんの音色がいっぱいです（" + SYN_MY_MAX + "個まで）。はじめの画面で消してね"; }
          else { synMySave(my); prefs.mine = my[ix].name; prefs.edited = false; save(); msg = "&#x1F4BE; 「" + escHtml(my[ix].name) + "」に保存しました"; }
          render();
        }
        else if (/^mine:\d+$/.test(v)) { allOff(); var it = synMyLoad()[Number(v.substring(5))]; if (it) { prefs.patch = patch = it.patch; prefs.mine = it.name; prefs.edited = false; save(); } render(); }
        else if (v === "back") { backToggle(); }
        else if (v === "land") { allOff(); prefs.land = !prefs.land; save(); applyLand(); render(); }
        else if (v === "arp") { allOff(); prefs.arp.on = !prefs.arp.on; save(); render(); }
        else if (/^arpm:/.test(v)) { prefs.arp.mode = synOpt(SYN_ARP_MODES, v.substring(5))[0]; save(); render(); }
        else if (/^arpr:/.test(v)) { prefs.arp = synArpClean({ on: prefs.arp.on, mode: prefs.arp.mode, rate: Number(v.substring(5)), oct: prefs.arp.oct, gate: prefs.arp.gate }); arp = null; save(); render(); }
        else if (v === "arpo:-" || v === "arpo:+") { prefs.arp.oct = Math.max(1, Math.min(3, prefs.arp.oct + (v === "arpo:+" ? 1 : -1))); save(); render(); }
        else if (v === "arpg:-" || v === "arpg:+") { prefs.arp.gate = Math.round(Math.max(0.2, Math.min(1, prefs.arp.gate + (v === "arpg:+" ? 0.1 : -0.1))) * 10) / 10; save(); render(); }
        else if (/^w1:|^w2:|^lto:/.test(v)) { allOff(); var kk = v.split(":"); patch[kk[0]] = kk[1]; prefs.patch = patch = synPatchClean(patch); edited(); render(); }
        else if (v === "mono") { allOff(); patch.mono = !patch.mono; edited(); render(); }
        else if (/^view:/.test(v)) { allOff(); prefs.view = v.substring(5) === "pad" ? "pad" : "keys"; save(); render(); }
        else if (v === "octdown" || v === "octup") { allOff(); prefs.oct = Math.max(-2, Math.min(1, prefs.oct + (v === "octup" ? 1 : -1))); save(); render(); }
        else if (v === "keydown" || v === "keyup") { allOff(); prefs.key = (prefs.key + (v === "keyup" ? 1 : 11)) % 12; save(); if (cur && cur.d >= 0 && patOk()) { cur = degChord(cur.d); } render(); }
        else if (/^scale:/.test(v)) { allOff(); prefs.scale = B.scale(v.substring(6))[0]; save(); if (cur && cur.d >= 0 && patOk()) { cur = degChord(cur.d); } render(); }
        else if (/^names:/.test(v)) { names = prefs.names = synOpt(SYN_NAMES, v.substring(6))[0]; save(); render(); }
      }
      // 秒・Hz は小数、ほかは 0〜100
      function fmt(d, n) { return /秒|Hz/.test(d[5]) ? n.toFixed(2) : (d[4] >= 1 ? String(n) : String(Math.round(n * 100))); }
      function render() {
        if (!panel) { return; }
        var html = "", i, j;
        html += '<div class="piano-row"><button class="modal-btn' + (rec ? " piano-rec-on" : "") + '" data-ya="rec">' + (rec ? "&#x23F9;&#xFE0F; 録音をとめる" : "&#x1F534; 録音") + '</button>' +
          '<button class="modal-btn' + (play ? " piano-rec-on" : "") + '" data-ya="play"' + (rec ? " disabled" : "") + '>' + (play ? "&#x23F9;&#xFE0F; とめる" : "&#x25B6;&#xFE0F; 再生") + '</button>' +
          '<button class="modal-btn' + (pat ? " piano-rec-on" : "") + '" data-ya="pat">' + (pat ? "&#x23F9;&#xFE0F; パターン" : "&#x25B6;&#xFE0F; パターン") + '</button></div>' +
          (back ? '<div class="piano-row"><button class="modal-btn" data-ya="back"' + (rec ? " disabled" : "") + '>' + (bk && !play && !rec ? "&#x23F9;&#xFE0F; 伴奏をとめる" : "&#x1F3B8; 伴奏だけ鳴らす") + '</button>' +
            '<button class="modal-btn" data-ya="metro" title="録音のメトロノーム">' + METRO + ' ' + (metro ? "ON" : "OFF") + '</button></div>' +
            '<p class="small" style="margin:4px 0 0;">&#x1F3B8; 伴奏: ' + escHtml(back.name) + '（BPM ' + back.seq.bpm + '・' + back.seq.meter + '拍子）</p>' :
          '<div class="piano-row"><button class="modal-btn" data-ya="bpmdown">&minus;</button><span>BPM ' + bpm + '</span><button class="modal-btn" data-ya="bpmup">&#xFF0B;</button>' +
          '<button class="modal-btn" data-ya="metro" title="録音のメトロノーム">' + METRO + ' ' + (metro ? "ON" : "OFF") + '</button></div>');
        // §329: タブ（音色・弾き方・パターン・バンド。伴奏の曲のときはバンドなし）
        var tbs = back ? [["sound", "音色"], ["play", "弾き方"], ["pat", "パターン"]] : [["sound", "音色"], ["play", "弾き方"], ["pat", "パターン"], ["band", "バンド"]], tab = prefs.tab === "band" && back ? "sound" : prefs.tab;
        html += '<div class="piano-row">';
        for (i = 0; i < tbs.length; i++) { html += '<button class="modal-btn' + (tab === tbs[i][0] ? " piano-rec-on" : "") + '" data-ya="tab:' + tbs[i][0] + '">' + tbs[i][1] + '</button>'; }
        html += '</div>';
        if (tab === "pat") { html += patPanel(); }
        else if (tab === "band") { html += bandPanel(); }
        else if (tab === "play") {
          html += '<div class="piano-row">';
          for (i = 0; i < SYN_VIEWS.length; i++) { html += '<button class="modal-btn' + (prefs.view === SYN_VIEWS[i][0] ? " piano-rec-on" : "") + '" data-ya="view:' + SYN_VIEWS[i][0] + '">' + SYN_VIEWS[i][1] + '</button>'; }
          html += '<button class="modal-btn' + (prefs.land ? " piano-rec-on" : "") + '" data-ya="land">&#x1F4F1; ' + (prefs.land ? "たて向き" : "よこ向き") + '</button></div>';
          // §320: アルペジエーター
          var ap = prefs.arp;
          html += '<p class="small" style="margin:8px 0 2px;color:#ffd166;">&#x1F3B6; アルペジエーター（鍵盤を押さえているあいだ、1音ずつ自動で）</p>' +
            '<div class="piano-row"><button class="modal-btn' + (ap.on ? " piano-rec-on" : "") + '" data-ya="arp">' + (ap.on ? "ON" : "OFF") + '</button>';
          for (i = 0; i < SYN_ARP_RATES.length; i++) { html += '<button class="modal-btn' + (Math.abs(ap.rate - SYN_ARP_RATES[i][0]) < 1e-6 ? " piano-rec-on" : "") + '" data-ya="arpr:' + SYN_ARP_RATES[i][0] + '">' + SYN_ARP_RATES[i][1] + '</button>'; }
          html += '</div><div class="piano-row">';
          for (i = 0; i < SYN_ARP_MODES.length; i++) { html += '<button class="modal-btn' + (ap.mode === SYN_ARP_MODES[i][0] ? " piano-rec-on" : "") + '" data-ya="arpm:' + SYN_ARP_MODES[i][0] + '">' + SYN_ARP_MODES[i][1] + '</button>'; }
          html += '</div><div class="piano-row"><span>広げるオクターブ</span><button class="modal-btn" data-ya="arpo:-">－</button><span>' + ap.oct + '</span><button class="modal-btn" data-ya="arpo:+">＋</button></div>' +
            '<div class="piano-row"><span>音の長さ</span><button class="modal-btn" data-ya="arpg:-">－</button><span>' + Math.round(ap.gate * 100) + '%</span><button class="modal-btn" data-ya="arpg:+">＋</button></div>';
          html += '<div class="piano-row"><button class="modal-btn" data-ya="octdown">&#x25C0;</button><span>オクターブ ' + (prefs.oct > 0 ? "+" : "") + prefs.oct + '</span><button class="modal-btn" data-ya="octup">&#x25B6;</button></div>' +
            '<div class="piano-row"><button class="modal-btn" data-ya="keydown">&#x25C0;</button><span>キー ' + SYN_CDE[prefs.key] + '</span><button class="modal-btn" data-ya="keyup">&#x25B6;</button></div>' +
            '<div class="piano-row"><label class="piano-select">&#x1F3B5; <select data-yscale="1">' + scaleOptions() + '</select></label></div><div class="piano-row">';
          for (i = 0; i < SYN_NAMES.length; i++) { html += '<button class="modal-btn' + (names === SYN_NAMES[i][0] ? " piano-rec-on" : "") + '" data-ya="names:' + SYN_NAMES[i][0] + '">' + SYN_NAMES[i][1] + '</button>'; }
          html += '</div><p class="small" style="margin:4px 0 0;">キーとスケールは XYパッド演奏の音（横に2オクターブ）。鍵盤は オクターブ だけ</p>';
        } else {
          html += '<div class="piano-opts">';
          for (i = 0; i < SYN_PRESETS.length; i++) { html += '<button class="modal-btn quiz-opt' + (!prefs.edited && !prefs.mine && prefs.preset === SYN_PRESETS[i][0] ? " active" : "") + '" data-ya="preset:' + SYN_PRESETS[i][0] + '">' + SYN_PRESETS[i][1] + '</button>'; }
          // §320: じぶんの音色
          var my1 = synMyLoad();
          html += '</div><div class="piano-row"><button class="modal-btn" data-ya="mysave">&#x1F4BE; いまの音色を保存</button></div>';
          if (my1.length) {
            html += '<div class="piano-opts">';
            for (i = 0; i < my1.length; i++) { html += '<button class="modal-btn quiz-opt' + (prefs.mine === my1[i].name && !prefs.edited ? " active" : "") + '" data-ya="mine:' + i + '">' + escHtml(my1[i].name) + '</button>'; }
            html += '</div>';
          }
          html += '<div class="piano-row"><span>波1</span>';
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
        // §329
        var ysels = [["yspat", "spat:"], ["ycprog", "cprog:"], ["ydrum", "drum:"], ["ybpat", "bpat:"]];
        for (i = 0; i < ysels.length; i++) {
          var ys = panel.querySelector ? panel.querySelector("select[data-" + ysels[i][0] + "]") : null;
          if (ys) { ys.onchange = (function (pre) { return function (ev) { if (ev.currentTarget.blur) { ev.currentTarget.blur(); } action(pre + ev.currentTarget.value); }; })(ysels[i][1]); }
        }
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
      function text(ctx, s, x, y, size, color) { ctx.fillStyle = color; ctx.font = "bold " + (SYN_LAND ? Math.max(4, size * 0.6) : size) + "px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(s, x, y); }
      function lit(m) { var i; if (arpCur === m) { return true; } for (i = 0; i < held.length; i++) { if (held[i].m === m) { return true; } } return false; }
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
        ctx.beginPath(); ctx.arc(px, py, (xyId !== null ? 9 : 6) * (SYN_LAND ? 0.6 : 1), 0, Math.PI * 2); ctx.fill();
        if (SYN_LAND) { return; } // よこ向きの帯はせまいので、文字は出さない
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
          if (nm) { text(ctx, nm, x + ww / 2, SYN_KB_BOT - (SYN_LAND ? 6 : 12), nm.length > 2 || SYN_LAND ? 8 : 10, synPc(m) === 0 ? "#c2255c" : "#495057"); }
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
          if (bk) { backStep(); }
          arpStep();
          if (pat) { patStep(); if (pat) { drumStep(); bassStep(); } } // §329
          for (var fc in flashC) { if (flashC.hasOwnProperty(fc) && flashC[fc] > 0) { flashC[fc]--; } }
          if (play) {
            var pb = playBeat(), last = 0, i;
            while (play && play.idx < play.notes.length && play.notes[play.idx][0] <= pb) {
              var pn = play.notes[play.idx], v = synNote(play.patch, pn[2], out(), 0, pn[3] || 0.8, pn[1] * 60 / play.bpm);
              if (v) { play.vo.push(v); }
              play.idx++;
            }
            for (i = 0; i < play.notes.length; i++) { last = Math.max(last, play.notes[i][0] + play.notes[i][1]); }
            if (play.idx >= play.notes.length && pb > last + 1 && !play.back) { play = null; render(); }
          }
          if (rec) {
            var rb = Math.floor(recBeat()), cnt = rec.back ? !back.s.lead : true;
            if (rb !== rec.beat && ((metro && rb >= 0) || (rb < 0 && cnt))) { click(((rb % meter) + meter) % meter === 0); }
            rec.beat = rb;
          }
        },
        draw: function (ctx) {
          var g = ctx.createLinearGradient ? ctx.createLinearGradient(0, 0, 0, SYN_H) : null;
          if (g) { g.addColorStop(0, "#10002b"); g.addColorStop(1, "#240046"); }
          ctx.fillStyle = g || "#10002b";
          ctx.fillRect(0, 0, W, SYN_H);
          var hy = SYN_LAND ? 6 : 10;
          hudText(ctx, "🎛️ " + presetName() + (arpOn() ? "・アルペジオ" : patch.mono ? "・モノ" : "") + (back ? " ・🎸 " + (bk ? "伴奏" : back.name) : ""), 8, hy, "left");
          hudText(ctx, "BPM " + bpm, W - 8, hy, "right");
          if (rec) { var rb = recBeat(); text(ctx, rb < 0 ? String(Math.ceil(-rb)) : "● REC " + (Math.floor(rb / meter) + 1) + "小節・" + rec.notes.length + "音", W / 2, SYN_LAND ? 6 : 26, 13, "#ff6b6b"); }
          else if (play && !SYN_LAND) { text(ctx, "再生中…", W / 2, 26, 12, "#ffffff"); }
          else if (pat) { text(ctx, "🎼 " + patChordText(), W / 2, SYN_LAND ? 6 : 26, 13, "#ffd166"); } // §329
          if (prefs.view === "pad") { drawPad(ctx); return; }
          drawXY(ctx);
          drawKeyboard(ctx);
        }
      };
    }
  });

  window.UGSynth = {
    H: SYN_H, PREFS_KEY: SYN_PREFS_KEY, TAKES_KEY: SYN_TAKES_KEY, PRESETS: SYN_PRESETS, PARAMS: SYN_PARAMS, WAVES: SYN_WAVES, SEQ_PROG: SYN_SEQ_PROG,
    TOP: SYN_TOP, PAD_BOT: SYN_PAD_BOT, KB_Y: SYN_KB_Y, KB_BOT: SYN_KB_BOT, layout: synLayout, geom: function () { return { H: SYN_H, TOP: SYN_TOP, PAD_BOT: SYN_PAD_BOT, KB_Y: SYN_KB_Y, KB_BOT: SYN_KB_BOT, WHITES: SYN_WHITES, LAND: SYN_LAND }; },
    arpOrder: synArpOrder, arpClean: synArpClean, ARP_MODES: SYN_ARP_MODES, MY_KEY: SYN_MY_KEY, myLoad: synMyLoad, myPut: synMyPut,
    dawPayload: synDawPayload, dawCheck: synDawCheck, dawSend: synDawSend, takeClean: synTakeClean, takesSave: synTakesSave, // 9B-7
    patchClean: synPatchClean, preset: synPreset, voice: synVoice, release: synRelease, pitch: synPitch, setCut: synSetCut, setLfo: synSetLfo, note: synNote, envAt: synEnvAt,
    cutHz: synCutHz, keyAt: synKeyAt, padNotes: synPadNotes, prefs: synPrefs, takesLoad: synTakesLoad, takeById: synTakeById, sendToSeq: synSendToSeq
  };
})();
