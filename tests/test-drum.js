// ゴリラドラム（arcade-drum.js）のテスト（§226）
"use strict";
var H = require("./harness");
var ok = H.ok;

function press(env, k) { env.key("keydown", k); env.key("keyup", k); }

module.exports = function () {
  H.suite("drum");
  var env = H.load(), W = env.window, D = W.UGDrum, A = W.UGArcade;
  ok(!!D, "UGDrum API exists");
  var ids = A.list().map(function (g) { return g.id; }), g = A.list().filter(function (x) { return x.id === "drum"; })[0];
  ok(g && g.cat === "music" && g.music && ids.indexOf("drum") === ids.indexOf("piano") + 1, "drum is a music game right after the piano", ids.indexOf("drum"));

  // --- リズム・ステップ ---
  ok(D.pads.length === 8 && D.rows.length === 8 && D.grooves().length >= 20 && D.grooves().every(function (gr) { return !/3拍子/.test(gr.name); }), "8 pads; the sequencer's 4/4 grooves are the examples");
  var s8 = D.stepsFrom("8beat");
  ok(s8.length === 8 && D.stepOn(s8, 36, 0) && D.stepOn(s8, 38, 4) && !D.stepOn(s8, 38, 0) && D.stepsClean([[36, [3, 3, 99, 1]], [12, [0]]])[0][1].join() === "1,3", "steps from a groove; cleaned (8 rows, 0–15, no repeats)");
  var tg = D.stepsFrom("8beat");
  ok(D.stepToggle(tg, 47, 2) === true && D.stepOn(tg, 47, 2) && D.stepToggle(tg, 47, 2) === false && !D.stepOn(tg, 47, 2), "toggling a step on and off");
  var U = W.UGUkulele, cu = D.toSeqCustom(s8);
  ok(cu.every(function (r) { return D.SEQ_ROWS.indexOf(r[0]) >= 0; }) && JSON.stringify(U.drumCustomClean(cu)) === JSON.stringify(U.drumFrom("8beat")), "steps fit the sequencer's 'my rhythm' (toms and crash left out)", cu);

  // --- リズムゲームの譜面 ---
  var ce = D.chart("8beat", "easy"), cn = D.chart("8beat", "normal"), ch = D.chart("disco", "hard");
  ok(ce.lanes.join() === "36,38" && cn.lanes.join() === "36,38,42" && ch.lanes.indexOf(46) >= 0 && ce.notes.length === 5 * D.BARS && ce.notes[0].beat === 0, "chart lanes depend on the level (easy: kick+snare / normal: +hi-hat / hard: all)", [ce.lanes, cn.lanes, ch.lanes]);
  ok(D.songs.every(function (s) { return D.chart(s[0], "easy").lanes.length >= 2; }), "every song has at least 2 lanes even on easy");
  ok(D.judge(0.05) === 0 && D.judge(0.1) === 1 && D.judge(-0.2) === 2 && D.judge(0.3) === -1 && D.rank(0.96) === "S" && D.rank(0.1) === "D", "timing judge and rank");

  // --- テイク（録音トラックと同じ形） ---
  var tl = [];
  for (var i = 0; i < 12; i++) { D.listAdd(tl, { bpm: 100, notes: [[1, 36, 0.9]] }, D.TAKES_MAX, D.takeClean, "テイク"); }
  ok(tl.length === D.TAKES_MAX && tl[0].name === "テイク 12" && JSON.stringify(D.toSeqRec({ notes: [[2, 38, 0.8], [0, 36, 2], ["x", 36]] })) === "[[0,36,0.8],[2,38,0.8]]", "takes: newest first, 10 at most; notes as [beat, midi, level]");

  function hooked() {
    return H.load({ patch: function (src, file) {
      if (file === "arcade-drum.js") { src = src.split("      function now() { return frame / 60; }").join("      function now() { return frame / 60; } window.__drum = function () { return { t: now(), rn: rn, counts: counts, ended: ended, rec: rec, play: play, take: take, steps: steps, stepRun: stepRun, flash: flash, chart: chart, act: action, back: back, bk: bk }; };"); }
      return src;
    } });
  }
  function padXY(i) { var r = D.padRect(i); return [r.x + r.w / 2, (r.y + r.h / 2) * 320 / D.H]; }

  // じゆう: パッドを叩く・録音（カウントイン後の拍で）
  var e1 = hooked(), f0 = -1;
  e1.store[D.PREFS_KEY] = JSON.stringify({ bpm: 120, metro: true });
  e1.run("drum", { config: { mode: "free" } }, 400, function (f) {
    if (f === 2) { var c = padXY(4); e1.ptr("down", c[0], c[1], 1); e1.ptr("up", c[0], c[1], 1); }
    if (f === 10) { press(e1, "z"); f0 = f; }
    if (f === 10 + 120 + 30) { press(e1, "s"); }
    if (f === 10 + 120 + 60) { press(e1, "a"); press(e1, "q"); }
    if (f === 300) { press(e1, "z"); }
  });
  var t1 = JSON.parse(e1.store[D.TAKES_KEY] || "[]")[0];
  ok(t1 && t1.notes.length === 3 && t1.notes[0][1] === 38 && Math.abs(t1.notes[0][0] - 1) < 0.05 && Math.abs(t1.notes[1][0] - 2) < 0.05 && t1.bpm === 120, "recording: after a 4-beat count-in, hits are saved in beats (S = snare, A = kick, Q = hi-hat)", t1);

  // ステップ: マスをタップしてオン、▶ でループ再生、保存
  var e2 = hooked(), st2 = null, fl2 = 0;
  e2.store[D.PREFS_KEY] = JSON.stringify({ bpm: 120, steps: [] });
  e2.run("drum", { config: { mode: "step" } }, 80, function (f) {
    var h = e2.window.__drum; if (!h) { return; }
    if (f === 2) { var cw = (240 - 36 - 2) / 16; e2.ptr("down", 36 + cw * 2 + 3, (22 + 24 * 1 + 10) * 320 / D.H, 1); }
    if (f === 4) { h().act("play"); }
    if (f > 4 && h().flash[38] > fl2) { fl2 = h().flash[38]; }
    if (f === 60) { st2 = h(); h().act("save"); }
  });
  var pats2 = JSON.parse(e2.store[D.PATS_KEY] || "[]");
  ok(st2 && D.stepOn(st2.steps, 38, 2) && st2.stepRun && fl2 > 0 && pats2.length === 1 && D.stepOn(pats2[0].steps, 38, 2) && JSON.parse(e2.store[D.PREFS_KEY]).steps[1][1].join() === "2",
    "step mode: tap a cell (snare, 3rd step), loop playback sounds it, save keeps it", [st2 && st2.steps[1], pats2.length]);

  // リズムゲーム: ちょうどで全部叩く → 全部 PERFECT・ランク S
  var e3 = hooked(), last3 = {};
  e3.run("drum", { config: { mode: "rhythm", song: "8beat", level: "normal", speed: 100 } }, 2000, function () {
    var h = e3.window.__drum; if (!h) { return; }
    var st = h(), k;
    for (k = 0; k < st.rn.length; k++) {
      var n = st.rn[k];
      if (n.j === -2 && st.t >= n.t - 0.005 && last3[k] === undefined) {
        last3[k] = 1;
        var lane = st.chart.lanes.indexOf(n.m), lw = 240 / st.chart.lanes.length;
        e3.ptr("down", lane * lw + lw / 2, 200, 9);
        e3.ptr("up", lane * lw + lw / 2, 200, 9);
      }
    }
  });
  var s3 = e3.window.__drum(), b3 = JSON.parse(e3.store[D.BEST_KEY] || "{}")["8beat@normal@100"];
  ok(s3.ended && s3.counts[0] === s3.rn.length && s3.counts[3] === 0 && b3 && b3.r === "S", "rhythm: hitting every note on time (lanes by tapping) → all PERFECT, rank S saved", [s3.counts, b3]);
  var e4 = hooked();
  e4.run("drum", { config: { mode: "rhythm", song: "four", level: "easy", speed: 70 } }, 3000);
  var s4 = e4.window.__drum();
  ok(s4.ended && s4.counts[3] === s4.rn.length, "rhythm: doing nothing → all MISS and the game ends", s4.counts);
  // --- §227: シーケンサーと統合 ---
  var e5 = hooked(), U5 = e5.window.UGUkulele, D5 = e5.window.UGDrum;
  e5.store[U5.SEQ_KEY] = JSON.stringify({ cur: U5.seqClean(null), songs: [{ id: 4, name: "ぼくの曲", seq: U5.seqClean(null) }] });
  var bl5 = D5.backList();
  ok(bl5.map(function (b) { return b[0]; }).join() === "cur,s:4" && D5.backing("s:4").s.events.length > 0 && D5.backing("s:9") === null, "backing songs: the one being edited and the saved ones");
  var S5 = D5.backing("cur"), dEv = { kind: "drum", track: "drum", t: 5 }, cEv = { kind: "click", t: 0 };
  ok(!D5.backEventOn(dEv, S5.seq, S5.s.lead, true) && D5.backEventOn(dEv, S5.seq, S5.s.lead, false) && D5.backEventOn({ kind: "strum", track: "uke", t: 5 }, S5.seq, S5.s.lead, true) && D5.backEventOn(cEv, S5.seq, S5.s.lead, true),
    "the song's own drums can be left out of the backing (count-in clicks stay)");
  // 伴奏に合わせて録音: 3拍目（beat 2）で叩く → 曲の拍で保存、曲が終わると止まる
  var g0 = -1, k5 = -1, mid5 = null;
  e5.run("drum", { config: { mode: "free", backing: "cur" } }, 1400, function (f) {
    if (f === 5) { press(e5, "z"); g0 = f; }
    if (g0 >= 0 && k5 < 0 && (f - g0) / 60 >= S5.s.lead + 2 * S5.s.spb) { press(e5, "s"); k5 = f; mid5 = e5.window.__drum(); }
  });
  var end5 = e5.window.__drum(), t5 = JSON.parse(e5.store[D5.TAKES_KEY] || "[]")[0];
  ok(mid5 && mid5.bk && mid5.rec && mid5.rec.back && !end5.rec && !end5.bk, "recording with the backing runs the song and stops when it ends");
  ok(t5 && t5.song === "編集中の曲" && t5.notes.length === 1 && t5.notes[0][1] === 38 && Math.abs(t5.notes[0][0] - 2) < 0.05, "the take is saved in the song's beats", t5);
  // ステップを送る・読みこむ
  var my = D5.stepsFrom("funk");
  D5.stepToggle(my, 47, 3);
  var sr = D5.sendSteps(my), dr = U5.seqLoad().cur.tracks.drum;
  ok(sr.ok && dr.on && dr.groove === "custom" && JSON.stringify(dr.custom) === JSON.stringify(U5.drumCustomClean(D5.toSeqCustom(my))) && sr.msg.indexOf("タム") >= 0, "steps go to the sequencer's drum as 'my rhythm' (toms/crash left out, with a note)", sr.msg);
  var back5 = D5.stepsFromSeq();
  ok(D5.stepOn(back5, 36, 0) && !D5.stepOn(back5, 47, 3) && JSON.stringify(D5.toSeqCustom(back5)) === JSON.stringify(D5.toSeqCustom(my)) && !D5.sendSteps(D5.stepsClean([[47, [0]]])).ok, "the sequencer's drum can be read back into steps; only toms/crash can't be sent");
  var st6 = U5.seqLoad(); st6.cur.tracks.drum.groove = "bossa"; U5.seqSave(st6);
  ok(JSON.stringify(D5.stepsFromSeq()) === JSON.stringify(D5.stepsFrom("bossa")), "when the sequencer uses a built-in rhythm, reading gives that rhythm's steps");
};
