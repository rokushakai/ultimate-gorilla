// ゴリラストリングス（arcade-strings.js）のテスト（§300〜）
"use strict";
var H = require("./harness");
var ok = H.ok;

module.exports = function () {
  H.suite("strings");
  var env = H.load(), W = env.window, S = W.UGStrings, A = W.UGArcade, B = W.UGBass, U = W.UGUkulele;
  ok(!!S, "UGStrings API exists");
  var ids = A.list().map(function (g) { return g.id; }), g = A.list().filter(function (x) { return x.id === "strings"; })[0];
  ok(g && g.cat === "music" && g.music && ids.indexOf("strings") === ids.indexOf("guitar") + 1 && S.INSTS.length === 9, "strings is a music game right after the guitar, with 9 instruments", ids.indexOf("strings"));

  // --- 指板（上が1弦）・弓の所 ---
  S.layout(true);
  var y2 = S.rowLineY(2), a = S.boardAt(4 + (S.BOW_X - 6 - 4) / 8 * 3.5, y2, 0), b = S.boardAt(5, S.rowLineY(0), 2);
  ok(a && a.sn === 1 && Math.abs(a.semi - 3) < 1e-6 && b.sn === 3 && b.semi < 2 && S.bowRow(S.BOW_X + 5, y2) === 2 && S.bowRow(10, y2) === -1 && S.boardAt(S.BOW_X + 5, y2, 0) === null &&
    S.bowLevel(0) === 0 && S.bowLevel(1000) === 1.1 && S.bowLevel(7) > S.bowLevel(2),
    "fingerboard: 1st string on top, fretless pitch from x; the bow area is separate; faster bowing = louder", [a, b]);
  // --- 合奏コードの和音 ---
  var vC = S.voicing(B.chord(0, 0, "major"), 48, false), vAm = S.voicing(B.chord(0, 5, "major"), 48, false), vG7 = S.voicing(B.chord(0, 4, "major", true), 55, true);
  ok(vC.join() === "48,55,60,64" && vAm.join() === "57,64,69,72" && vG7.join() === "55,62,67,71,77", "chord voicing: root above the lowest string, 5th, octave, 3rd (and the 7th)", [vC, vAm, vG7]);

  // --- ゲーム（サンプルは使わず合成音で）---
  function srun(prefs, frames, fn) {
    var e = H.load(), log = { on: [], stop: 0, targets: [] };
    e.store[S.PREFS_KEY] = JSON.stringify(prefs);
    e.run("strings", { config: {} }, frames, function (fr) {
      var M = e.window.UGMelody;
      if (fr === 1) {
        M.samples.enabled = false;
        var s0 = M.synth, v0 = M.voiceStop;
        M.synth = function (m, pg, w, lv, dest, hold) { if (pg !== M.DRUM) { log.on.push(m + "@" + pg + (hold === 0 ? "p" : "")); } return s0.apply(M, arguments); };
        M.voiceStop = function () { log.stop++; return v0.apply(M, arguments); };
      }
      fn(fr, e, e.window.UGStrings);
    });
    log.targets = e.counters.targets.filter(function (t) { return t.name === "gain"; }).map(function (t) { return t.v; });
    return { log: log, e: e };
  }
  // 弓: 左手で D 線（2行目）の 2 を押さえて、弓の所をこする → E4（64）がのびる。弓をはなすと止まる
  var r1 = srun({ view: "solo", inst: "violin", bow: true }, 40, function (fr, e, Sw) {
    var y = Sw.rowLineY(2), cw = (Sw.BOW_X - 6 - 4) / 8, lx = 4 + cw * 2.5, bx = Sw.BOW_X + 10;
    if (fr === 2) { e.ptr("down", lx, y, 1); }
    if (fr === 3) { e.ptr("down", bx, y, 2); }
    if (fr >= 4 && fr <= 20) { e.ptr("move", bx + (fr % 2 ? 15 : 0), y, 2); }
    if (fr === 30) { e.ptr("up", bx, y, 2); e.ptr("up", lx, y, 1); }
  });
  ok(r1.log.on.join() === "64@40" && r1.log.targets.some(function (v) { return v > 1; }) && r1.log.stop >= 1,
    "bowing: the bowed string sounds the left-hand note while the bow moves (louder when moving), and stops when the bow lifts", r1.log);
  // 弓 OFF: 押しているあいだ鳴る・横にすべらせると音程が変わる（音程ガイドで半音）
  var r2 = srun({ view: "solo", inst: "cello", bow: false }, 20, function (fr, e, Sw) {
    var y = Sw.rowLineY(3), cw = (240 - 4 - 4) / 8;
    if (fr === 2) { e.ptr("down", 4 + cw * 0.5, y, 1); }
    if (fr === 4) { e.ptr("move", 4 + cw * 2.5, y, 1); }
    if (fr === 8) { e.ptr("up", 4 + cw * 2.5, y, 1); }
  });
  ok(r2.log.on.join() === "36@42" && r2.log.stop >= 1, "without the bow, pressing the board sounds the note (cello C2); sliding glides without a new note", r2.log);
  // 合奏コード: キー 1 を押しているあいだ C の和音（バイオリンの音域）、はなすと止まる
  var r3 = srun({ view: "chord", inst: "violin" }, 20, function (fr, e) {
    if (fr === 2) { e.key("keydown", "1"); }
    if (fr === 10) { e.key("keyup", "1"); }
  });
  ok(r3.log.on.join() === "60@40,67@40,72@40,76@40" && r3.log.stop >= 4, "ensemble chords: holding a chord button sustains the voiced chord, releasing stops it", r3.log);
  // はじく楽器（ピチカート）: 指板をタップするとはじく
  var r4 = srun({ view: "solo", inst: "pizz" }, 10, function (fr, e, Sw) { if (fr === 2) { var y = Sw.rowLineY(0); e.ptr("down", 10, y, 1); e.ptr("up", 10, y, 1); } });
  ok(r4.log.on.join() === "69@45p", "plucked instruments (pizzicato) play a short note on tap", r4.log);

  // --- 録音・シーケンサーへ送る ---
  var r5 = srun({ view: "chord", inst: "cello", bpm: 120 }, 260, function (fr, e) {
    if (fr === 2) { e.key("keydown", "z"); e.key("keyup", "z"); }
    if (fr === 130) { e.key("keydown", "1"); }
    if (fr === 190) { e.key("keyup", "1"); }
    if (fr === 200) { e.key("keydown", "z"); e.key("keyup", "z"); }
  });
  var tk = JSON.parse(r5.e.store[S.TAKES_KEY] || "[]")[0];
  ok(tk && tk.inst === "cello" && tk.notes.length === 4 && tk.notes[0][2] === 36 && tk.notes[0][1] > 1.5 && tk.name === "ストリングス 1", "recording: a held chord is saved as long notes with the instrument", tk);
  var rs = S.sendToSeq({ name: "ぼくの弦", inst: "cello", notes: [[0, 2, 36], [0, 2, 43]] }), xt = U.seqLoad().cur.tracks[rs.id];
  ok(rs.ok && xt && xt.preset === "snotes" && xt.prog === 42 && xt.notes.length === 2 && U.X_PRESETS.some(function (p) { return p[0] === "snotes"; }) && !S.sendToSeq({ name: "x", notes: [] }).ok,
    "send to the sequencer: a strings-notes track with the instrument's GM number", rs.msg);
};
