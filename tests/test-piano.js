// ゴリラピアノ（arcade-piano.js）のテスト（§212）
"use strict";
var H = require("./harness");
var ok = H.ok;

function press(env, k) { env.key("keydown", k); env.key("keyup", k); }

module.exports = function () {
  H.suite("piano");
  var env = H.load(), W = env.window, P = W.UGPiano, A = W.UGArcade;
  ok(!!P, "UGPiano API exists");
  var ids = A.list().map(function (g) { return g.id; }), g = A.list().filter(function (x) { return x.id === "piano"; })[0];
  ok(g && g.cat === "music" && g.music && ids.indexOf("piano") === ids.indexOf("ukulele") + 1, "piano is a music game right after the ukulele", ids.indexOf("piano"));

  // --- 楽譜 ---
  var pr = P.parse("C4 D#4:2 R:.5 Bb3");
  ok(JSON.stringify(pr) === "[[0,1,60],[1,2,63],[3.5,1,58]]", "score text → [beat, length, midi]", pr);
  var bad = [];
  P.songs.forEach(function (s) {
    var n = P.song(s.id).notes;
    if (n.length < 8 || n.some(function (x) { return x[2] < P.SONG_LOW || x[2] > P.SONG_LOW + 23; })) { bad.push(s.id); }
  });
  ok(P.songs.length === 9 && bad.length === 0, "9 songs; every note fits the C4–B5 keyboard", bad);

  // --- 鍵盤 ---
  var ww = 240 / 14;
  ok(P.keyAt(1, 290, 60) === 60 && P.keyAt(ww * 0.95, 190, 60) === 61 && P.keyAt(ww * 0.95, 290, 60) === 60 && P.keyAt(239, 290, 60) === 83 && P.keyAt(100, 100, 60) === -1,
    "keys under the finger (black keys on top, white below, nothing above the keyboard)");
  var r61 = P.keyRect(61, 60), r62 = P.keyRect(62, 60);
  ok(r61.black && !r62.black && r61.x > 0 && r61.x < r62.x, "black key sits between C and D");
  ok(P.judge(0.05) === 0 && P.judge(-0.1) === 1 && P.judge(0.18) === 2 && P.judge(0.25) === -1 && P.rank(0.96) === "S" && P.rank(0.6) === "C" && P.rank(0.2) === "D", "timing judge and rank");

  // --- テイク（シーケンサーと同じ形） ---
  var list = [];
  for (var i = 0; i < 12; i++) { P.takeAdd(list, { bpm: 90, notes: [[1, 0.5, 60]] }); }
  ok(list.length === P.TAKES_MAX && list[0].id === 12 && list[0].name === "テイク 12", "takes: newest first, 10 at most", list.length);
  var cl = P.notesClean([[2, 1, 64], [0, 0.5, 60.4, 0.8], ["x", 1, 60], [1, 0.25, 62, 0.5], [0, 0, 60]]);
  ok(JSON.stringify(cl) === "[[0,0.5,60],[1,0.25,62,0.5],[2,1,64]]", "notes are cleaned and sorted ([beat, len, midi(, velocity)])", cl);
  var U = W.UGUkulele, seqT = U.tracksClean({ mel: { on: true, notes: P.toSeqNotes({ notes: cl }) } });
  ok(JSON.stringify(seqT.mel.notes) === JSON.stringify(cl), "a take's notes go straight into the ukulele sequencer's melody track", seqT.mel.notes);

  function hooked() {
    return H.load({ patch: function (src, file) {
      if (file === "arcade-piano.js") { src = src.split("      var panel = api.panel;").join("      var panel = api.panel; window.__piano = function () { return { t: now(), rn: rn, counts: counts, ended: ended, pi: pi, miss: miss, rec: rec, play: play, take: take, base: base, notes: notes }; };"); }
      return src;
    } });
  }
  function center(m) { var r = P.keyRect(m, 60); return [r.x + r.w / 2, r.black ? 200 : 290]; }

  // リズムゲーム: ちょうどのタイミングで全部押す → 全部 PERFECT・ランク S・フルコンボ
  var e1 = hooked(), up1 = null, r1;
  r1 = e1.run("piano", { config: { mode: "rhythm", song: "twinkle", speed: 100 } }, 4000, function () {
    var h = e1.window.__piano; if (!h) { return; }
    var st = h();
    if (up1) { e1.ptr("up", up1[0], up1[1], 1); up1 = null; return; }
    for (var k = 0; k < st.rn.length; k++) {
      var n = st.rn[k];
      if (n.j === -2 && st.t >= n.t - 0.005) { var c = center(n.m); e1.ptr("down", c[0], c[1], 1); up1 = c; return; }
    }
  });
  var s1 = e1.window.__piano(), best1 = JSON.parse(e1.store.ultimateGorillaPianoBestV1 || "{}");
  ok(r1.ended !== null && s1.counts[0] === s1.rn.length && s1.counts[3] === 0, "rhythm: hitting every note on time → all PERFECT", s1.counts);
  ok(best1["rhythm:twinkle@100"] && best1["rhythm:twinkle@100"].r === "S" && best1["rhythm:twinkle@100"].s === r1.ended && r1.ended > s1.rn.length * 100 + 500 - 1, "rank S and the best score are saved (full combo bonus)", [best1, r1.ended]);

  // 何もしない → 全部 MISS で終わる
  var e2 = hooked(), r2 = e2.run("piano", { config: { mode: "rhythm", song: "mary", speed: 70 } }, 6000);
  var s2 = e2.window.__piano();
  ok(r2.ended === 0 && s2.counts[3] === s2.rn.length && JSON.parse(e2.store.ultimateGorillaPianoBestV1)["rhythm:mary@70"].r === "D", "rhythm: doing nothing → all MISS, rank D, game ends at 0", s2.counts);

  // れんしゅう: 1回まちがえてから全部正しく押す
  var e3 = hooked(), wrong = false, up3 = null, r3;
  r3 = e3.run("piano", { config: { mode: "practice", song: "mary" } }, 3000, function (f) {
    var h = e3.window.__piano; if (!h) { return; }
    var st = h();
    if (up3) { e3.ptr("up", up3[0], up3[1], 2); up3 = null; return; }
    if (st.ended || f % 3) { return; }
    var m = st.notes[st.pi][2];
    if (!wrong) { wrong = true; m = m === 60 ? 62 : 60; }
    up3 = center(m);
    e3.ptr("down", up3[0], up3[1], 2);
  });
  var s3 = e3.window.__piano(), best3 = JSON.parse(e3.store.ultimateGorillaPianoBestV1 || "{}");
  ok(s3.ended && s3.miss === 1 && s3.pi === s3.notes.length && r3.ended === (s3.notes.length - 1) * 50, "practice waits for the right key; a missed note scores nothing", [s3.miss, r3.ended]);
  ok(best3["practice:mary"] === 1, "practice best (fewest misses) is saved", best3);

  // じゆうに弾く: 録音 → 自動で保存 → 再生
  var e4 = hooked(), recF = -1;
  e4.store.ultimateGorillaPianoPrefsV1 = JSON.stringify({ bpm: 90, metro: true });
  e4.run("piano", { config: { mode: "free" } }, 600, function (f) {
    if (f === 10) { press(e4, "r"); recF = f; }
    if (f === 210) { e4.key("keydown", "a"); }
    if (f === 255) { e4.key("keyup", "a"); }
    if (f === 270) { e4.key("keydown", "d"); }
    if (f === 300) { e4.key("keyup", "d"); }
    if (f === 330) { press(e4, "r"); }
    if (f === 340) { press(e4, "v"); }
  });
  var s4 = e4.window.__piano(), takes4 = JSON.parse(e4.store.ultimateGorillaPianoTakesV1 || "[]"), n4 = takes4[0] && takes4[0].notes;
  var b0 = (210 - recF - 160) / 60 * 1.5;
  ok(takes4.length === 1 && n4.length === 2 && n4[0][2] === 60 && n4[1][2] === 64 && Math.abs(n4[0][0] - b0) < 0.06 && Math.abs(n4[0][1] - 45 / 60 * 1.5) < 0.06,
    "recording: after a 4-beat count-in, notes are saved in beats (A = C4, D = E4)", n4);
  ok(s4.take && s4.take.id === takes4[0].id && takes4[0].bpm === 90, "the new take is open and can be played back", s4.take && s4.take.name);
  var e5 = hooked(), base5 = [];
  e5.run("piano", { config: { mode: "free" } }, 30, function (f) {
    if (f === 2) { press(e5, "x"); }
    if (f === 4) { var h = e5.window.__piano; base5.push(h().base); press(e5, "z"); press(e5, "z"); base5.push(h().base); }
  });
  ok(base5.join() === "72,48" && JSON.parse(e5.store.ultimateGorillaPianoPrefsV1).base === 48, "Z / X move the keyboard by an octave (remembered)", base5);
};
