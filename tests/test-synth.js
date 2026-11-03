// ゴリラシンセ（arcade-synth.js）のテスト（§319〜）
"use strict";
var H = require("./harness");
var ok = H.ok;

module.exports = function () {
  H.suite("synth");
  var env = H.load(), W = env.window, Y = W.UGSynth, A = W.UGArcade, U = W.UGUkulele, M = W.UGMelody;
  ok(!!Y, "UGSynth API exists");
  var ids = A.list().map(function (g) { return g.id; }), g = A.list().filter(function (x) { return x.id === "synth"; })[0];
  ok(g && g.cat === "music" && g.music && ids.indexOf("synth") === ids.indexOf("horn") + 1 && Y.PRESETS.length === 12, "synth is a music game right after the horn, with 12 presets", ids.indexOf("synth"));

  // --- 音色（パッチ）---
  var pc = Y.patchClean({ w1: "nope", w2: "tri", uni: 7, cut: -3, res: 0.5, a: 99, lto: "x", mono: 1, det: "12" });
  var allOk = Y.PRESETS.every(function (p) { var c = Y.preset(p[0]).patch; return Y.PARAMS.every(function (d) { return c[d[0]] >= d[1] && c[d[0]] <= d[2]; }); });
  ok(pc.w1 === "saw" && pc.w2 === "tri" && pc.uni === 3 && pc.cut === 0 && pc.res === 0.5 && pc.a === 2 && pc.lto === "pitch" && pc.mono === true && pc.det === 12 && pc.vol === 0.8 && Y.patchClean({}).w2 === "off" && allOk,
    "patches are clamped to their ranges (unknown waves and LFO targets fall back); every preset is valid", pc);

  // --- 音のエンジン ---
  M.audioInit();
  var ac = M.audio.ctx, out = ac.createGain(), o0 = env.counters.osc;
  var pad = Y.preset("pad").patch, v = Y.voice(pad, 60, out, 0, 0.8);
  var oscs = env.counters.osc - o0;
  env.counters.targets.length = 0;
  Y.release(v, 0.4, 0);
  var rel = env.counters.targets.filter(function (t) { return t.name === "gain" && t.v === 0; });
  ok(v && v.oscs.length === 4 && oscs === 5 && Math.abs(v.peak - 0.4 * pad.vol * 0.8) < 1e-9 && rel.length === 1 && Math.abs(rel[0].tau - 0.1) < 1e-9 && v.end > ac.currentTime && Y.envAt(v, v.t0 + pad.a / 2) > 0,
    "a voice: 3 unison saws + oscillator 2 (and the LFO), peak 0.4 × volume × velocity; release fades from the current level", [oscs, v && v.oscs.length]);
  var bass = Y.preset("bass").patch, vb = Y.voice(bass, 36, out, 0, 1);
  ok(vb.oscs.length === 3 && vb.oscs[2].mul === 0.5 && Y.cutHz(0) === 60 && Math.round(Y.cutHz(1)) === 15360, "the sub oscillator plays an octave below; the brightness knob spans 60 Hz to 15 kHz", vb.oscs.map(function (x) { return x.mul; }));

  // --- 鍵盤・XY パッド演奏の音 ---
  var ww = (240 - 8) / 10;
  ok(Y.keyAt(4 + ww * 0.5, Y.KB_BOT - 5, 60) === 60 && Y.keyAt(4 + ww * 9.5, Y.KB_BOT - 5, 60) === 76 && Y.keyAt(4 + ww, Y.KB_Y + 5, 60) === 61 && Y.keyAt(4 + ww * 2.5, Y.KB_Y + 5, 60) === 64 && Y.keyAt(100, 20, 60) === -1 &&
    Y.padNotes(48, "major").length === 15 && Y.padNotes(48, "major")[14] === 72,
    "keyboard: 10 white keys from C, black keys on top; the XY pad has two octaves of the scale", Y.padNotes(48, "major"));

  // --- ゲーム ---
  function yrun(prefs, frames, fn) {
    var e = H.load();
    e.store[Y.PREFS_KEY] = JSON.stringify(prefs);
    e.run("synth", { config: {} }, frames, function (fr) { fn(fr, e, e.window.UGSynth); });
    return e;
  }
  // ポリ: A と D で2つの声・はなすと消える
  var e1 = yrun({ preset: "pad" }, 20, function (fr, e) {
    if (fr === 2) { e.key("keydown", "a"); e.key("keydown", "d"); }
    if (fr === 6) { e.counters.targets.length = 0; e.key("keyup", "a"); e.key("keyup", "d"); }
  });
  var off1 = e1.counters.targets.filter(function (t) { return t.name === "gain" && t.v === 0; }).length;
  // モノ: A を押したまま S → 新しい声を作らず高さだけ（ポルタメント）
  var o2 = 0, f2 = [];
  var e2 = yrun({ preset: "lead" }, 20, function (fr, e) {
    if (fr === 2) { e.key("keydown", "a"); }
    if (fr === 4) { o2 = e.counters.osc; e.counters.targets.length = 0; e.key("keydown", "s"); }
    if (fr === 6) { o2 = e.counters.osc - o2; f2 = e.counters.targets.filter(function (t) { return t.name === "frequency"; }).map(function (t) { return Math.round(t.v); }); }
  });
  ok(e1.counters.osc >= 10 && off1 === 2 && o2 === 0 && f2.indexOf(294) >= 0,
    "poly presets play a voice per key and release them; mono presets glide to the new key without a new attack", [e1.counters.osc, off1, o2, f2]);
  // XY パッド（鍵盤のとき）: 横 ＝ 明るさ・縦 ＝ うねり（音色に保存）
  var e3 = yrun({ preset: "lead" }, 12, function (fr, e) {
    if (fr === 2) { e.ptr("down", 8 + (240 - 16) * 0.25, Y.TOP + 4, 1); }
    if (fr === 4) { e.ptr("up", 8 + (240 - 16) * 0.25, Y.TOP + 4, 1); }
  });
  var p3 = JSON.parse(e3.store[Y.PREFS_KEY]);
  ok(Math.abs(p3.patch.cut - 0.25) < 0.02 && p3.patch.ldep > 0.95 && p3.edited === true, "the XY pad sets brightness (x) and wobble depth (y) and saves them as my own sound", p3.patch);
  // XY パッド演奏: 横 ＝ 音（スケール）・縦 ＝ 明るさ
  var cw = (240 - 8) / 15, f4 = [];
  var e4 = yrun({ preset: "lead", view: "pad" }, 16, function (fr, e) {
    if (fr === 2) { e.ptr("down", 4 + cw * 2.5, 300, 1); }
    if (fr === 4) { e.counters.targets.length = 0; e.ptr("move", 4 + cw * 4.5, 60, 1); }
    if (fr === 6) { f4 = e.counters.targets.filter(function (t) { return t.name === "frequency"; }).map(function (t) { return Math.round(t.v); }); e.ptr("up", 4 + cw * 4.5, 60, 1); }
  });
  ok(f4.indexOf(196) >= 0 && JSON.parse(e4.store[Y.PREFS_KEY]).patch.cut > 0.85, "XY pad play: x picks the scale note (E3 → G3) and y the brightness", f4);

  // --- 録音・シーケンサーへ送る（音色もいっしょ）---
  var e5 = yrun({ preset: "acid", bpm: 120 }, 260, function (fr, e) {
    if (fr === 2) { e.key("keydown", "z"); e.key("keyup", "z"); }
    if (fr === 130) { e.key("keydown", "a"); }
    if (fr === 160) { e.key("keyup", "a"); }
    if (fr === 200) { e.key("keydown", "z"); e.key("keyup", "z"); }
  });
  var tk = JSON.parse(e5.store[Y.TAKES_KEY] || "[]")[0];
  ok(tk && tk.notes.length === 1 && tk.notes[0][2] === 60 && tk.patch.res === 0.8 && tk.pname === "アシッドベース" && tk.name === "シンセ 1", "recording saves the notes with the sound (patch)", tk);
  var Y5 = e5.window.UGSynth, U5 = e5.window.UGUkulele, rs = Y5.sendToSeq(Y5.takeById(Y5.takesLoad(), tk.id)), st5 = U5.seqLoad(), xt = st5.cur.tracks[rs.id];
  var M5 = e5.window.UGMelody, o5 = e5.counters.osc;
  var ev5 = U5.xEvents(rs.id, xt, [], function (b) { return b * 0.5; }, 4, false)[0];
  U5.seqPlayEvent(M5, M5.audio.ctx, ev5, M5.audio.ctx.currentTime + 0.1, false, 0.8, null, null, st5.cur.tracks);
  var played5 = e5.counters.osc - o5;
  e5.counters.targets.length = 0; U5.susStop();
  ok(rs.ok && xt.preset === "ynotes" && xt.prog === 81 && xt.patch && xt.patch.res === 0.8 && xt.notes.length === 1 && U5.X_PRESETS.some(function (p) { return p[0] === "ynotes"; }) && played5 === 2 && e5.counters.targets.length >= 1,
    "send to the sequencer: a synth-notes track that keeps the patch and plays it for the note length; stopping silences it", [xt && xt.patch, played5]);

  // --- §320: アルペジエーター ---
  ok(Y.arpOrder([64, 60, 67], "up", 1).join() === "60,64,67" && Y.arpOrder([64, 60, 67], "down", 1).join() === "67,64,60" && Y.arpOrder([60, 64, 67], "updown", 1).join() === "60,64,67,64" &&
    Y.arpOrder([64, 60], "order", 2).join() === "64,60,76,72" && Y.arpClean({ on: 1, rate: 0.5, oct: 9, gate: 3, mode: "zz" }).oct === 1 && Y.arpClean({ rate: 0.5 }).rate === 0.5 && Y.arpClean({}).gate === 0.6,
    "arpeggiator orders: up, down, up-down (ends not repeated), as pressed over octaves; settings are clamped");
  var e6 = yrun({ preset: "pluck", bpm: 120, arp: { on: true, rate: 0.25, mode: "up", gate: 0.6 } }, 300, function (fr, e) {
    if (fr === 2) { e.key("keydown", "z"); e.key("keyup", "z"); }
    if (fr === 125) { e.key("keydown", "a"); e.key("keydown", "d"); e.key("keydown", "g"); }
    if (fr === 185) { e.key("keyup", "a"); e.key("keyup", "d"); e.key("keyup", "g"); }
    if (fr === 230) { e.key("keydown", "z"); e.key("keyup", "z"); }
  });
  var tk6 = JSON.parse(e6.store[Y.TAKES_KEY] || "[]")[0], ns6 = tk6 ? tk6.notes : [];
  var steps6 = ns6.slice(1).every(function (n, k) { return Math.abs(n[0] - ns6[k][0] - 0.25) < 0.02; });
  ok(ns6.length >= 6 && ns6.length <= 9 && ns6.slice(0, 4).map(function (n) { return n[2]; }).join() === "60,64,67,60" && steps6 && Math.abs(ns6[0][1] - 0.15) < 1e-6,
    "arpeggiator: held C-E-G plays up in 16ths at the BPM (gate 60%) and is recorded as it plays", ns6);
  // --- §320: よこ向き（2オクターブ）---
  var e7 = H.load(), Y7 = e7.window.UGSynth;
  Y7.layout(true, 130);
  var gl = Y7.geom(), lw = (240 - 8) / 15;
  var kTop = Y7.keyAt(4 + lw * 14.5, gl.KB_BOT - 3, 48);
  Y7.layout(false);
  ok(gl.LAND && gl.WHITES === 15 && gl.H === 130 && kTop === 72 && Y7.geom().WHITES === 10, "landscape: the keyboard spreads to two octaves (15 white keys)", gl);
  // --- §320: じぶんの音色 ---
  var my = [], i0 = Y.myPut(my, " わたしのベース ", Y.preset("bass").patch), i1 = Y.myPut(my, "わたしのベース", Y.preset("acid").patch), i2 = Y.myPut(my, "", Y.preset("pad").patch);
  var full = []; for (var q = 0; q < 12; q++) { Y.myPut(full, "s" + q, {}); }
  ok(i0 === 0 && i1 === 0 && my[0].name === "わたしのベース" && my[0].patch.res === 0.8 && i2 === 1 && my[1].name === "じぶんの音 2" && Y.myPut(full, "x", {}) === -1,
    "my sounds: saved by name (same name overwrites, blank gets a number), up to 12", my.map(function (x) { return x.name; }));
  var e8 = yrun({ preset: "lead" }, 10, function (fr, e) { if (fr === 1) { e.store[Y.MY_KEY] = JSON.stringify([{ name: "ぼくの音", patch: Y.preset("bell").patch }]); } });
  ok(e8.window.UGSynth.myLoad()[0].patch.oct2 === 1 && e8.window.UGSynth.myLoad().length === 1, "my sounds load back from storage");
  // --- §329: ▶ パターン（ピアノと同じ鳴らし方・コード進行・コードのボタンで次の小節から・バンド）---
  function yHooked(prefs) {
    var e = H.load({ patch: function (src, file) {
      if (file === "arcade-synth.js") { src = src.split("      function now() { return frame / 60; }").join("      function now() { return frame / 60; } window.__yp = function () { return { pat: pat, cur: cur, pend: pend, prefs: prefs, act: action, text: patChordText }; };"); }
      return src;
    } });
    e.store[Y.PREFS_KEY] = JSON.stringify(prefs);
    return e;
  }
  var e9 = yHooked({ bpm: 120, spat: "chord", cprog: "pop4", preset: "pad" }), PV = W.UGPiano, BB = W.UGBass, cp9 = BB.cprog("pop4")[2], txt9 = "";
  e9.run("synth", { config: {} }, 4 + 122 + 240, function (f) {
    var h = e9.window.__yp; if (!h) { return; }
    if (f === 2) { e9.key("keydown", "z"); e9.key("keyup", "z"); }
    if (f === 4) { e9.key("keydown", "b"); e9.key("keyup", "b"); }
    if (f === 200) { txt9 = h().text(); }
    if (f === 4 + 122 + 226) { e9.key("keydown", "z"); e9.key("keyup", "z"); }
  });
  var tk9 = JSON.parse(e9.store[Y.TAKES_KEY] || "[]")[0], n9 = tk9 ? tk9.notes : [];
  var at9 = function (b) { return n9.filter(function (n) { return Math.abs(n[0] - b) < 0.01; }).map(function (n) { return n[2]; }).sort().join(); };
  ok(n9.length === 6 && at9(0) === PV.voicing(BB.chord(0, cp9[0], "major", false), false).sort().join() && at9(4) === PV.voicing(BB.chord(0, cp9[1], "major", false), false).sort().join() && Math.abs(n9[0][1] - 4) < 0.01 && txt9 === "C → G",
    "▶ pattern with the synth: a chord a bar following the progression, recorded with the take; the screen shows now → next", [n9, txt9]);
  var e10 = yHooked({ bpm: 120, spat: "chord" }), c10 = [];
  e10.run("synth", { config: {} }, 250, function (f) {
    var h = e10.window.__yp; if (!h) { return; }
    if (f === 2) { e10.key("keydown", "b"); e10.key("keyup", "b"); }
    if (f === 40) { e10.key("keydown", "5"); e10.key("keyup", "5"); c10.push(h().cur ? h().cur.name : "-", h().pend ? h().pend.name : "-"); }
    if (f === 160) { c10.push(h().cur.name); h().act("tab:band"); c10.push(h().prefs.tab); }
  });
  ok(c10.join() === "C,G,G,band", "chord buttons (keys 1–7) change the chord at the next bar; the band tab is there", c10);
  void U;
};
