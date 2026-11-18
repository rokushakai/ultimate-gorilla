// §345 A20: トランスポート（一時停止・続きから・小節の移動・タイムラインで移動）
"use strict";
var H = require("./harness");
var ok = H.ok;

module.exports = async function () {
  H.suite("transport");
  var env = H.load(), W = env.window, X = W.UGXmas, D = W.UGDaw, A = W.UGArcade, M = W.UGDawModel, R = H.makeEl("div");
  A.start("daw", R, {});
  D.xmas.host.newSong(X.tplNewProject(X.tplPlan(null, "pop", "new", 1, 1, "full")).project); D.xmas.host.back();
  var p = D.project(), T = D.transport, ac = W.UGMelody.audioInit(), PPQ = M.PPQ, bar = function (n) { return M.barToTick(p, n - 1); };
  async function playing() { for (var g = 0; g < 400 && !D.player(); g++) { await env.wait(5); } return D.player(); } // はじめは楽器の録音を読みこんでから鳴る
  function run(sec) { var P = D.player(), end = ac.currentTime + sec, g = 0; while (P && ac.currentTime < end && g++ < 40000) { ac.currentTime += 0.025; D.pump(); P = D.player(); } }
  // 1. ⏸: 鳴っている位置を覚えて、予約・タイマーを片づける
  D.clearLog(); T.toggle(); var P1 = await playing(); run(4);
  var at = Math.floor(D.playTick()); T.toggle();
  ok(P1 && !D.isPlaying() && T.paused() && Math.abs(T.now() - at) <= 1 && at > bar(2) && /^\d+\.\d+$/.test(T.pos()), "⏸ during playback: playback really stops (no player, no timers) and the position is kept (" + T.pos() + ")", [at, T.now()]);
  var n0 = D.log().length; ac.currentTime += 1; D.pump();
  ok(D.log().length === n0, "while paused nothing more is scheduled");
  // 2. ▶: 同じ位置から（それより前の音は予約しない・同じ音を 2 回予約しない）
  D.clearLog(); T.toggle(); var P2 = await playing(); run(1.5);
  var lg = D.log(), early = lg.filter(function (e) { return e.tick < at - 1; }), seen = {}, dup = 0;
  lg.forEach(function (e) { var k = e.track + ":" + e.tick + ":" + e.m + ":" + e.pass; if (seen[k]) { dup++; } seen[k] = 1; });
  ok(P2 && P2.segs[0].tick0 === at && !T.paused() && lg.length > 0 && early.length === 0 && dup === 0, "▶ again: playback starts exactly where it paused; no earlier notes, no double scheduling", [P2 && P2.segs[0].tick0, at, early.length, dup]);
  // 3. ⏹: 前と同じ（頭へ・覚えた位置も消す）
  T.pause(); D.stop(); D.project(); W.UGDaw.transport.pause();
  var stopBtn = R.innerHTML.indexOf('data-act="stop"') >= 0;
  ok(!D.isPlaying() && stopBtn, "⏹ is still there");
  // 4. 小節の移動（止まっているとき）: ◀ ▶ ◀◀ ▶▶・端で止まる
  T.go(bar(5)); T.nudge(-1); var a1 = M.tickToBar(p, T.now()).bar; T.nudge(4); var a2 = M.tickToBar(p, T.now()).bar; T.nudge(1); var a3 = M.tickToBar(p, T.now()).bar;
  T.go(bar(2)); T.nudge(-4); var a4 = M.tickToBar(p, T.now()).bar; T.go(bar(47)); T.nudge(4); var a5 = M.tickToBar(p, T.now()).bar;
  ok(a1 === 4 && a2 === 8 && a3 === 9 && a4 === 1 && a5 === 48 && !D.isPlaying(), "stopped: from bar 5 ◀ → 4, ▶▶ → 8, ▶ → 9; from 2 ◀◀ → 1 (not before the start); from 47 ▶▶ → 48 (the last bar)", [a1, a2, a3, a4, a5]);
  // 5. 再生中の移動: 古い予約を消して新しい位置から（前の位置の音を新しく予約しない）
  T.go(bar(9)); D.clearLog(); T.resume(); var P5 = await playing(); run(1);
  D.clearLog(); T.nudge(4); var P6 = await playing(); run(1);
  var lg6 = D.log(), wrong = lg6.filter(function (e) { return e.tick < bar(13) - 1; });
  ok(P6 && P6 !== P5 && P6.segs[0].tick0 === bar(13) && wrong.length === 0 && lg6.length > 0, "playing: ▶▶ from bar 9 starts again at bar 13 with a new player; nothing from before bar 13 is scheduled after the move", [P6 && P6.segs[0].tick0, bar(13), wrong.length]);
  // 再生中の ◀: 小節の途中なら、その小節の頭へ
  run(1); var mid = Math.floor(D.playTick()); T.nudge(-1); var b6 = M.tickToBar(p, D.player().segs[0].tick0);
  ok(b6.bar === M.tickToBar(p, mid).bar && b6.beat === 1, "playing: ◀ in the middle of a bar goes to the start of that bar", [M.tickToBar(p, mid), b6]);
  T.pause();
  // 6. タイムラインのタップ → いちばん近い拍
  var px = function (tk) { return tk / PPQ * D.PX_BEAT; };
  T.tapX(px(bar(20) + PPQ * 2 + 100));
  ok(T.now() === bar(20) + PPQ * 2 && !D.isPlaying(), "tapping the ruler moves ▶'s start to the nearest beat (bar 20 beat 3)", [T.now(), bar(20) + PPQ * 2]);
  // 7. 止めているあいだにテンポを変えても、同じ小節・拍から
  T.go(bar(17)); D.setBpm(90); T.resume(); var P7 = await playing();
  ok(P7 && P7.segs[0].tick0 === bar(17), "after changing the tempo while paused, playback starts at the same bar (17)");
  T.pause(); D.setBpm(120);
  // 8. ループ中にループの外へ動かすと、ループの頭から（案内つき）
  p.practice.loopOn = true; p.practice.loopA = bar(17); p.practice.loopB = bar(25);
  T.go(bar(18)); T.resume(); await playing(); T.go(bar(30)); await playing();
  ok(D.player() && D.player().segs[0].tick0 === bar(17), "loop on (bars 17–24): moving to bar 30 while playing starts again at the loop's start", D.player() && M.tickToBar(p, D.player().segs[0].tick0));
  T.pause(); p.practice.loopOn = false;
  // 9. ボタン
  var bt = T.buttons(false);
  ok(['b4', 'b1', 'play', 'f1', 'f4', 'stop'].every(function (k) { return bt.indexOf('data-act="' + k + '"') >= 0; }), "transport buttons: ◀◀ ◀ ▶/⏸ ▶ ▶▶ ⏹");
  T.resume(); await playing(); var bt2 = T.buttons(false); T.pause();
  ok(/一時停止/.test(bt2) && /続きから/.test(T.buttons(false)), "while playing the play button is ⏸ (一時停止); while paused it says 続きから");
  A.stop();
};
