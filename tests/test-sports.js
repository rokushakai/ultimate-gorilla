// バッティングセンター（arcade-sports.js）・ウクレレ（arcade-ukulele.js）・指ごとの入力のテスト（§167）
"use strict";
var H = require("./harness");
var ok = H.ok;

function sub(src, from, to) {
  if (src.indexOf(from) < 0) { throw new Error("patch target not found: " + from.slice(0, 70)); }
  return src.split(from).join(to);
}
function patch(src, file) {
  if (file === "arcade-sports.js") {
    src = sub(src, "      var result = null, streak = 0, hrs = 0, hits = 0, flash = 0;",
      "      var result = null, streak = 0, hrs = 0, hits = 0, flash = 0; window.__bat = function () { return { phase: phase, t: t, pitch: pitch, result: result, left: left, hrs: hrs, hits: hits }; };");
  }
  if (file === "arcade-ukulele.js") {
    src = sub(src, "      var msg = \"\", msgT = 0, msgGood = false, wrong = null, wrongT = 0;",
      "      var msg = \"\", msgT = 0, msgGood = false, wrong = null, wrongT = 0; window.__uke = function () { return { target: target, correct: correct, cur: current(), wrong: wrong, msg: msg, sticky: sticky }; };");
  }
  if (file === "arcade.js") {
    src = sub(src, "      var fingers = {}; // 指の番号", "      window.__fl = function () { return [flippers[0].held, flippers[1].held]; }; var fingers = {}; // 指の番号");
  }
  return src;
}
function press(env, k) { env.key("keydown", k); env.key("keyup", k); }

// コード名 → 構成音（ピッチクラス）
var PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
var QUAL = { "": [0, 4, 7], m: [0, 3, 7], "7": [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11] };
function chordPcs(name) {
  var r = PC[name.charAt(0)], rest = name.substring(1);
  if (rest.charAt(0) === "#") { r += 1; rest = rest.substring(1); }
  if (rest.charAt(0) === "♭") { r -= 1; rest = rest.substring(1); }
  return QUAL[rest].map(function (iv) { return (r + iv + 12) % 12; }).sort(function (a, b) { return a - b; });
}

module.exports = function () {
  H.suite("sports");
  var env = H.load({ patch: patch });
  var W = env.window, S = W.UGSports, U = W.UGUkulele, A = W.UGArcade;
  ok(!!S && !!U, "UGSports / UGUkulele test API exists");
  var list = A.list().map(function (g) { return g.id; });
  ok(list.indexOf("batting") === list.indexOf("defense") + 1, "batting is listed after defense", list);
  ok(list.indexOf("ukulele") === list.indexOf("lyrics") + 1, "ukulele is listed after lyrics", list);
  var uk = A.list().filter(function (g) { return g.id === "ukulele"; })[0];
  ok(uk && uk.music && uk.cat === "music", "ukulele is a music game (BGM stops)", uk);

  // ===== ⚾ バッティング =====
  ok(S.batFrames(140) === 36 && S.batFrames(80) === 63, "pitch speed → frames to the plate", [S.batFrames(140), S.batFrames(80)]);
  ok(S.batGrade(0).id === "hr" && S.batGrade(-1).id === "hr" && S.batGrade(3).id === "long" && S.batGrade(-5).id === "hit" && S.batGrade(7).id === "foul" && S.batGrade(8) === null,
    "timing grades: ±1 HR / ±3 long / ±5 hit / ±7 foul / else miss");
  var badSpeed = [];
  S.machines.forEach(function (m) {
    for (var i = 0; i < 300; i++) {
      var p = S.batMakePitch(m, Math.random);
      if (!(p.kmh >= m.min * 0.69 && p.kmh <= m.max) || !(p.frames > 20 && p.frames < 120)) { badSpeed.push([m.id, p.type, p.kmh]); }
      if (m.id === "slow" && p.type !== "straight") { badSpeed.push(["slow has " + p.type]); }
    }
  });
  ok(badSpeed.length === 0, "every machine throws pitches within its speed range", badSpeed.slice(0, 5));
  ok(S.batFlight(S.batGrade(3), 3, Math.random).dir < 0 && S.batFlight(S.batGrade(-3), -3, Math.random).dir > 0, "early swing pulls left, late swing goes right");

  // ぴったり振るボット → 全部ホームラン、20球で終わる
  var r = env.run("batting", { config: { machine: "fast" } }, 20000, function (f, e) {
    var b = W.__bat();
    if (b.phase === "pitch" && b.pitch.frames - b.t === 0) { press(e, " "); }
  });
  var b = W.__bat();
  ok(r.ended !== null && b.hrs === 20 && b.left === 0, "perfect timing hits 20 home runs and the game ends after 20 pitches", { ended: r.ended, hrs: b.hrs, left: b.left });
  // 連続ボーナス: 2本目から +10, +20, +30, +40, 6本目以降 +50
  ok(r.ended === 2000 + 10 + 20 + 30 + 40 + 50 * 15, "home runs score 100 plus the hit-streak bonus (max +50)", r.ended);
  // 振らない → 20球見逃して 0点で終わる
  r = env.run("batting", { config: { machine: "slow" } }, 20000);
  ok(r.ended === 0 && W.__bat().left === 0, "not swinging lets all 20 pitches go by with 0 points", r);
  // 早すぎ → 空振り / 画面タップでも振れる
  var res = [];
  env.run("batting", { config: { machine: "normal" } }, 3000, function (f, e) {
    var bb = W.__bat();
    if (bb.phase === "pitch" && bb.t === 2) { e.tap(120, 200); }
    if (bb.phase === "result" && bb.t === 1) { res.push(bb.result.id); }
  });
  ok(res.length > 0 && res.every(function (x) { return x === "miss"; }), "swinging far too early (tap) is a miss", res);

  // ===== 🎸 ウクレレ =====
  var all = U.chordSet("hard").concat(U.chords.extra), names = {}, badChord = [];
  all.forEach(function (c) {
    if (names[c.name]) { badChord.push("dup " + c.name); }
    names[c.name] = true;
    var pcs = {};
    c.shape.forEach(function (fr, s) { pcs[U.midi(s, fr, false) % 12] = true; });
    var got = Object.keys(pcs).map(Number).sort(function (a, b2) { return a - b2; }), want = chordPcs(c.name);
    // 4本なので構成音は全部入っていて、ほかの音は入らない（7th 系は4音、3和音は重複あり）
    if (got.join(",") !== want.join(",")) { badChord.push(c.name + " " + got + " ≠ " + want); }
  });
  ok(badChord.length === 0, "every chord shape sounds exactly the chord's notes", badChord);
  ok(U.chordSet("easy").length === 7 && U.chordSet("normal").length === 18 && U.chordSet("hard").length === 26, "chord counts per level", [U.chordSet("easy").length, U.chordSet("normal").length, U.chordSet("hard").length]);
  ok(U.chordName([2, 0, 0, 0]) === "Am" && U.chordName([0, 0, 0, 3]) === "C" && U.chordName([1, 1, 1, 1]) === "", "chord name lookup");
  ok(U.midi(0, 0, false) === 67 && U.midi(0, 0, true) === 55 && U.midi(3, 3, false) === 72, "string pitches (High-G / Low-G)");
  var cy = function (f) { return U.NUT_Y + (f - 0.5) * U.FH; };
  var c1 = U.cellAt(U.STRX[0] + 5, cy(2)), c2 = U.cellAt(U.STRX[3] - 10, cy(3));
  ok(c1 && c1.s === 0 && c1.f === 2 && c2 && c2.s === 3 && c2.f === 3 && U.cellAt(120, 290) === null, "fretboard cell from touch position", [c1, c2]);
  ok(U.crossed(20, 230).join(",") === "0,1,2,3" && U.crossed(230, 20).join(",") === "3,2,1,0" && U.crossed(60, 120).join(",") === "1", "swipe crosses strings in order (down / up stroke)");
  ok(U.frets([{ s: 0, f: 2 }, { s: 0, f: 4 }, { s: 3, f: 1 }]).join(",") === "4,0,0,1", "the highest pressed fret on a string sounds");

  // 指で押さえて（指1〜3）スワイプ（指9）すると正解
  function holdShape(e, shape) {
    var ids = [];
    shape.forEach(function (fr, s) { if (fr > 0) { e.ptr("down", U.STRX[s], cy(fr), 1 + s); ids.push(1 + s); } });
    return ids;
  }
  function swipe(e, id) { e.ptr("down", 22, 280, id); e.ptr("move", 80, 280, id); e.ptr("move", 160, 280, id); e.ptr("move", 225, 280, id); e.ptr("up", 225, 280, id); }
  var trace = { first: null, after: null, wrongSeen: false, osc0: 0 };
  r = env.run("ukulele", { config: { mode: "easy", lowG: false, sound: true } }, 5000, function (f, e) {
    if (f === 5) {
      var u = W.__uke(); trace.first = u.target.name; trace.osc0 = env.counters.osc + env.counters.src.length;
      var ids = holdShape(e, u.target.shape);
      swipe(e, 9);
      ids.forEach(function (id) { e.ptr("up", 0, 0, id); });
      trace.after = W.__uke().correct; trace.osc1 = env.counters.osc + env.counters.src.length;
    }
    if (f === 60) {
      // わざとちがう押さえ方（全部1フレット）
      var ids2 = holdShape(e, [1, 1, 1, 1]);
      swipe(e, 9);
      trace.wrongSeen = !!W.__uke().wrong && W.__uke().msg === "おしい！";
      trace.afterWrong = W.__uke().correct;
      ids2.forEach(function (id) { e.ptr("up", 0, 0, id); });
    }
  });
  ok(trace.after === 1, "holding the shown chord and swiping across the sound hole is correct", trace);
  ok(trace.osc1 - trace.osc0 >= 4, "a swipe across 4 strings plays 4 notes", trace);
  ok(trace.wrongSeen && trace.afterWrong === 1, "a wrong shape shows ✕ / おしい and does not score", trace);
  ok(r.ended !== null && r.ended >= 100, "chord practice ends at 60 seconds with the score", r);

  // §168 コード進行: 使うコードが全部押さえ方を持つ・お手本どおり2周で CLEAR!
  var missing = [];
  U.progressions.forEach(function (pg) { pg.chords.forEach(function (n) { if (!U.byName[n]) { missing.push(pg.id + ":" + n); } }); });
  ok(missing.length === 0 && U.progressions.length === 6, "every progression chord has a shape", missing);
  ok(U.chordSet("hard").every(function (c) { return c.name !== "Fmaj7" && c.name !== "Gm7"; }), "progression-only chords are not in the quiz sets");
  var pgDone = 0;
  r = env.run("ukulele", { config: { mode: "prog:canon" } }, 4000, function (f, e) {
    if (f % 10 === 5) {
      var u = W.__uke();
      if (!u.target) { return; }
      var ids = holdShape(e, u.target.shape);
      swipe(e, 9);
      ids.forEach(function (id) { e.ptr("up", 0, 0, id); });
      pgDone = W.__uke().correct;
    }
  });
  ok(r.ended !== null && env.lastTitle() === "CLEAR!" && pgDone === 16 && r.ended >= 1600, "playing the canon progression twice clears it", { ended: r.ended, done: pgDone, title: env.lastTitle() });

  // マウスはクリックで押さえる/はなす
  var mouse = null;
  env.run("ukulele", { config: { mode: "free" } }, 20, function (f, e) {
    if (f === 2) { e.ptr("down", U.STRX[0], cy(2), 1, "mouse"); e.ptr("up", U.STRX[0], cy(2), 1, "mouse"); mouse = [W.__uke().cur[0]]; }
    if (f === 4) { e.ptr("down", U.STRX[0], cy(2), 1, "mouse"); e.ptr("up", U.STRX[0], cy(2), 1, "mouse"); mouse.push(W.__uke().cur[0]); }
  });
  ok(mouse && mouse[0] === 2 && mouse[1] === 0, "mouse click toggles a fret on and off", mouse);
  r = env.run("ukulele", { config: { mode: "free" } }, 4000);
  ok(r.ended === null, "free play has no time limit");

  // ===== 指ごとの入力（ピンボール） =====
  var fl = [];
  env.run("pinball", {}, 10, function (f, e) {
    if (f === 1) { e.ptr("down", 40, 200, 1); e.ptr("down", 200, 200, 2); fl.push(W.__fl().slice()); }
    if (f === 3) { e.ptr("up", 40, 200, 1); fl.push(W.__fl().slice()); }
    if (f === 5) { e.ptr("up", 200, 200, 2); fl.push(W.__fl().slice()); }
  });
  ok(fl.length === 3 && fl[0].join() === "true,true" && fl[1].join() === "false,true" && fl[2].join() === "false,false",
    "two fingers: each flipper follows its own finger", fl);
};
