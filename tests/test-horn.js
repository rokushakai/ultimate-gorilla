// ゴリラホーン（arcade-horn.js）のテスト（§306〜）
"use strict";
var H = require("./harness");
var ok = H.ok;

module.exports = function () {
  H.suite("horn");
  var env = H.load(), W = env.window, Hn = W.UGHorn, A = W.UGArcade, U = W.UGUkulele;
  ok(!!Hn, "UGHorn API exists");
  var ids = A.list().map(function (g) { return g.id; }), g = A.list().filter(function (x) { return x.id === "horn"; })[0];
  ok(g && g.cat === "music" && g.music && ids.indexOf("horn") === ids.indexOf("strings") + 1 && Hn.INSTS.length === 13, "horn is a music game right after the strings, with 13 instruments", ids.indexOf("horn"));

  // --- キー（3段・下がいちばん低い）・息の強さ ---
  var tp = Hn.INSTS[0], base = Hn.base(tp, 0, 0), r0 = Hn.rowNotes(base, "major", false), rc = Hn.rowNotes(base, "major", true);
  var k1 = Hn.keyRect(2, 0, 8), at1 = Hn.keyAt(k1.x + 3, k1.y + 3, 8), at2 = Hn.keyAt(k1.x + 3, k1.y + k1.h - 3, 8);
  ok(base === 60 && r0.join() === "60,62,64,65,67,69,71,72" && rc.length === 13 && rc[12] === 72 && Hn.base(tp, 0, 1) === 72 && at1.r === 2 && at1.c === 0 &&
    Hn.breath(at1.fy) > 1 && Hn.breath(at2.fy) < 0.45 && Hn.keyAt(10, 20, 8) === null,
    "keys: the key's scale over three rows (bottom row from the instrument's low root), chromatic has 13; pressing near the top of a key blows harder", [base, r0, Hn.breath(at1.fy), Hn.breath(at2.fy)]);

  // --- ゲーム（サンプルは使わず合成音で）---
  function hrun(prefs, frames, fn) {
    var e = H.load(), log = { on: [], bend: [], stop: 0 };
    e.store[Hn.PREFS_KEY] = JSON.stringify(prefs);
    e.run("horn", { config: {} }, frames, function (fr) {
      var M = e.window.UGMelody;
      if (fr === 1) {
        M.samples.enabled = false;
        var s0 = M.synth, b0 = M.voiceBend, v0 = M.voiceStop;
        M.synth = function (m, pg) { if (pg !== M.DRUM) { log.on.push(m + "@" + pg); } return s0.apply(M, arguments); };
        M.voiceBend = function (h, m) { log.bend.push(Math.round(m * 100) / 100); return b0.apply(M, arguments); };
        M.voiceStop = function () { log.stop++; return v0.apply(M, arguments); };
      }
      fn(fr, e, e.window.UGHorn);
    });
    log.gains = e.counters.targets.filter(function (t) { return t.name === "gain"; }).map(function (t) { return t.v; });
    return { log: log, e: e };
  }
  // スラー ON: A（ド）を押したまま S（レ）→ 吹きなおさずに高さだけ。S をはなすとドにもどる・A をはなすと止まる
  var h1 = hrun({ inst: "trumpet" }, 20, function (fr, e) {
    if (fr === 2) { e.key("keydown", "a"); }
    if (fr === 4) { e.key("keydown", "s"); }
    if (fr === 6) { e.key("keyup", "s"); }
    if (fr === 8) { e.key("keyup", "a"); }
  });
  var h2 = hrun({ inst: "tsax", legato: false }, 20, function (fr, e) {
    if (fr === 2) { e.key("keydown", "a"); }
    if (fr === 4) { e.key("keydown", "s"); }
    if (fr === 8) { e.key("keyup", "s"); e.key("keyup", "a"); }
  });
  ok(h1.log.on.join() === "60@56" && h1.log.bend.indexOf(62) >= 0 && h1.log.bend[h1.log.bend.length - 1] === 60 && h1.log.stop >= 1 && h2.log.on.join() === "48@66,50@66,48@66",
    "one note at a time: with slur a second key glides without a new attack and returning goes back; without slur every key re-attacks", [h1.log, h2.log.on]);
  // 指で: キーの上のほうを押すと強い・横にずらすとベンド
  var h3 = hrun({ inst: "trumpet" }, 20, function (fr, e, Hw) {
    var kr = Hw.keyRect(2, 2, 8);
    if (fr === 2) { e.ptr("down", kr.x + kr.w / 2, kr.y + 3, 1); }
    if (fr === 4) { e.ptr("move", kr.x + kr.w / 2 + (240 - 8) / 8 * 0.5, kr.y + 3, 1); }
    if (fr === 8) { e.ptr("up", kr.x + kr.w / 2 + (240 - 8) / 8 * 0.5, kr.y + 3, 1); }
  });
  ok(h3.log.on.join() === "64@56" && h3.log.gains.some(function (v) { return v > 1.8; }) && h3.log.bend.indexOf(64.5) >= 0, "breath from the top of the key is strong; sliding sideways bends the pitch (half a key = a quarter tone)", h3.log);

  // --- 録音・シーケンサーへ送る ---
  var h4 = hrun({ inst: "flute", bpm: 120 }, 260, function (fr, e) {
    if (fr === 2) { e.key("keydown", "z"); e.key("keyup", "z"); }
    if (fr === 130) { e.key("keydown", "a"); }
    if (fr === 160) { e.key("keydown", "s"); }
    if (fr === 190) { e.key("keyup", "a"); e.key("keyup", "s"); }
    if (fr === 200) { e.key("keydown", "z"); e.key("keyup", "z"); }
  });
  var tk = JSON.parse(h4.e.store[Hn.TAKES_KEY] || "[]")[0];
  ok(tk && tk.inst === "flute" && tk.notes.length === 2 && tk.notes[0][2] === 72 && tk.notes[1][2] === 74 && tk.name === "ホーン 1", "recording: slurred notes are saved as separate notes with the instrument", tk);
  var rs = Hn.sendToSeq({ name: "ぼくのラッパ", inst: "tsax", notes: [[0, 1, 60]] }), xt = U.seqLoad().cur.tracks[rs.id];
  ok(rs.ok && xt && xt.preset === "hnotes" && xt.prog === 66 && U.X_PRESETS.some(function (p) { return p[0] === "hnotes"; }) && !Hn.sendToSeq({ name: "x", notes: [] }).ok,
    "send to the sequencer: a wind-notes track with the instrument's GM number", rs.msg);
};
