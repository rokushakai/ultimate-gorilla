// §345 A21: セクションの前／次・一覧から・ループ（範囲・セクション・小節）
"use strict";
var H = require("./harness");
var ok = H.ok;

module.exports = async function () {
  H.suite("loop");
  var env = H.load(), W = env.window, X = W.UGXmas, D = W.UGDaw, A = W.UGArcade, M = W.UGDawModel, R = H.makeEl("div");
  A.start("daw", R, {});
  D.xmas.host.newSong(X.tplNewProject(X.tplPlan(null, "pop", "new", 1, 1, "full")).project); D.xmas.host.back();
  var p = D.project(), T = D.transport, S = D.sections2, ac = W.UGMelody.audioInit(), L = M.sectionsOf(p), bar = function (n) { return M.barToTick(p, n - 1); };
  async function playing() { for (var g = 0; g < 400 && !D.player(); g++) { await env.wait(5); } return D.player(); }
  function run(sec) { var P = D.player(), end = ac.currentTime + sec, g = 0; while (P && ac.currentTime < end && g++ < 80000) { ac.currentTime += 0.025; D.pump(); P = D.player(); } }
  function secName() { var s = S.now(); return s ? s.name : ""; }
  // 1. 次 ／ 前（止まっているとき）
  T.go(0); S.step(1); var n1 = secName(); S.step(1); var n2 = secName(); T.go(T.now() + M.PPQ * 5); S.step(-1); var n3 = secName(), t3 = T.now(); S.step(-1); var n4 = secName();
  ok(L.length === 8 && n1 === L[1].name && n2 === L[2].name && n3 === L[2].name && t3 === L[2].tick && n4 === L[1].name, "next / previous section from the markers (" + L.map(function (s) { return s.name; }).join("→") + "); in the middle of a section, previous goes to its start first", [n1, n2, n3, n4]);
  T.go(L[7].tick); var last = S.step(1);
  ok(!last && T.now() === L[7].tick && /最後のセクション/.test(R.innerHTML + "") === false || !last, "at the last section, next does nothing");
  // 2. 一覧から: そのセクションから再生
  S.act("secGo:3"); var P1 = await playing();
  ok(P1 && P1.segs[0].tick0 === L[3].tick && secName() === L[3].name, "from the list: ▶ ここから plays from that section (" + L[3].name + ")");
  // 再生中に 次へ → 新しい位置から鳴りなおす
  run(1); S.step(1); var P2 = await playing();
  ok(P2 && P2 !== P1 && P2.segs[0].tick0 === L[4].tick, "while playing, ⏭ plays on from the next section with a new player");
  T.pause();
  // 3. ループ: セクション・A メロ〜サビ・小節
  var iA = 1, iS = 3;
  S.loopSecs(iS, iS); var lr = M.loopRange(p);
  ok(p.practice.loopOn && lr.a === L[iS].tick && lr.b === L[iS].tick + L[iS].len && /サビ/.test(R.innerHTML) , "🔁 a section: the loop is exactly that section (" + L[iS].name + ") and is on", [lr, L[iS].tick]);
  S.loopSecs(iA, iS); lr = M.loopRange(p);
  ok(lr.a === L[iA].tick && lr.b === L[iS].tick + L[iS].len, "🔁 from " + L[iA].name + " to " + L[iS].name + ": one loop over both sections");
  var lr0 = JSON.stringify(M.loopRange(p)), r65 = S.loopBars(65, 66), r47 = S.loopBars(47, 60); lr = M.loopRange(p);
  ok(!r65 && r47 && lr.a === bar(47) && lr.b === M.songEndTick(p), "a loop starting after the song end (65 in a 48-bar song) is refused; 47–60 is cut at the song end", [r65, lr]);
  S.loopBars(9, 10); lr = M.loopRange(p);
  ok(lr.a === bar(9) && lr.b === bar(11), "🔁 bars 9–10 (by bar numbers)", lr);
  // 4. 再生中に範囲を変える: 範囲の外 → 頭から・中 → そのまま
  T.go(bar(30)); p.practice.loopOn = false; T.resume(); var P3 = await playing(); run(0.5);
  S.loopBars(9, 10); var P4 = await playing();
  ok(P4 && P4 !== P3 && P4.segs[0].tick0 === bar(9) && P4.loop, "playing at bar 30, loop set to bars 9–10: playback jumps to bar 9 and loops", P4 && P4.segs[0].tick0);
  run(0.5); var P5 = D.player(); S.loopBars(9, 12); var P6 = D.player();
  ok(P6 === P5 && P6.segEnd === bar(13), "playing inside the loop and making it longer (9–12): the same playback goes on with the new end");
  T.pause();
  // 5. 折り返し: 回ごとに同じ音・同じ数・時刻のずれなし・範囲の外を予約しない
  S.loopBars(9, 10); T.go(bar(9)); D.clearLog(); T.resume(); var P7 = await playing();
  var loopSec = M.tickToSec(p, bar(11)) - M.tickToSec(p, bar(9)); run(loopSec * 3 + 0.5);
  var lg = D.log(), passes = {}, outside = 0;
  lg.forEach(function (e) { if (e.tick < bar(9) || e.tick >= bar(11)) { outside++; } (passes[e.pass] = passes[e.pass] || []).push(e); });
  var ks = Object.keys(passes).map(Number).sort(function (a, b) { return a - b; }), sameN = ks.length >= 3 && passes[ks[1]].length === passes[ks[0]].length && passes[ks[2]].length === passes[ks[0]].length;
  var f0 = passes[ks[0]] && passes[ks[0]].filter(function (e) { return e.tick === bar(9); })[0], f1 = passes[ks[1]] && passes[ks[1]].filter(function (e) { return e.tick === bar(9) && e.track === f0.track && e.m === f0.m; })[0];
  var dup = 0, seen = {}; lg.forEach(function (e) { var k = e.pass + ":" + e.track + ":" + e.tick + ":" + e.m; if (seen[k]) { dup++; } seen[k] = 1; });
  ok(sameN && outside === 0 && dup === 0 && f0 && f1 && Math.abs(f1.when - f0.when - loopSec) < 0.002, "loop wrap (bars 9–10, 3 times): the same number of notes each time, none outside the loop, no double scheduling, each pass exactly one loop length later", [ks.length, passes[ks[0]] && passes[ks[0]].length, outside, dup, f0 && f1 && (f1.when - f0.when), loopSec]);
  T.pause();
  // 6. セクションの並び・長さが変わっても（マーカーから毎回とる）
  var mk = p.markers.filter(function (m0) { return m0.kind === "section" || m0.len; });
  var L2 = M.sectionsOf(p); p.markers.forEach(function (m0) { if (m0.name === L2[2].name && m0.tick === L2[2].tick) { m0.name = "ブリッジ"; } });
  T.go(L2[1].tick); S.step(1);
  ok(secName() === "ブリッジ", "renamed sections are followed (the list is read from the markers every time)", secName());
  // 7. コードを変えたあと → この小節をくり返す
  D.ced.open(20); D.ced.click("pick:" + (X.songChords(D.project())[20] === "IV" ? "V" : "IV")); D.ced.click("apply");
  ok(R.innerHTML.indexOf('data-act="loopBar:20"') >= 0 && /21 小節目をくり返し聴く/.test(R.innerHTML), "after changing a chord, the note has 🔁 21 小節目をくり返し聴く");
  S.act("loopBar:20"); var P8 = await playing(); lr = M.loopRange(p);
  ok(lr.a === bar(21) && lr.b === bar(22) && p.practice.loopOn && P8 && P8.segs[0].tick0 === bar(21), "it loops just that bar and plays it");
  T.pause();
  // 8. 画面
  var hb = S.bar(); S.act("secList"); var hs = S.sheet();
  ok(/data-act="secPrev"/.test(hb) && /data-act="secNext"/.test(hb) && /data-act="secList"/.test(hb) && (hs.match(/data-act="secGo:/g) || []).length === L.length && (hs.match(/data-act="secLoop:/g) || []).length === L.length && /daw-lpa/.test(hs), "the section bar (⏮ name ⏭ loop) and the list (▶ ここから・🔁 ループ・〜・bar range for each section)");
  S.act("secFrom:1"); var hs2 = S.sheet();
  ok(/どこまでをループしますか/.test(hs2) && /ここまで/.test(hs2), "〜 then 🔁 ここまで: a range of sections");
  S.act("secLoop:3"); lr = M.loopRange(p);
  ok(lr.a === L2[1].tick && lr.b === L2[3].tick + L2[3].len && !S.sheet(), "from section 2 to section 4 loops both and closes the list");
  A.stop();
};
