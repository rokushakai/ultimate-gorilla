// §345 A22: iPhone で作るときの流れを続けて（コードをその場で → 途中から再生 → 一時停止 → 続き → セクション → ループ → ループ中にコード → ↶ → 書き出し → 保存と復元）
"use strict";
var H = require("./harness");
var ok = H.ok;

module.exports = async function () {
  H.suite("flow2");
  var env = H.load(), W = env.window, X = W.UGXmas, D = W.UGDaw, A = W.UGArcade, M = W.UGDawModel, R = H.makeEl("div");
  A.start("daw", R, {});
  var T = D.transport, S = D.sections2, ac = W.UGMelody.audioInit();
  async function playing() { for (var g = 0; g < 400 && !D.player(); g++) { await env.wait(5); } return D.player(); }
  function run(sec) { var P = D.player(), end = ac.currentTime + sec, g = 0; while (P && ac.currentTime < end && g++ < 80000) { ac.currentTime += 0.025; D.pump(); P = D.player(); } }
  // 点検（A13 と同じ）
  function check(p, mel) {
    var bad = [], secs = M.sectionsOf(p), end = M.songEndTick(p), i, k;
    p.tracks.forEach(function (t) {
      var drum = M.isDrum(t);
      t.clips.forEach(function (c) {
        if (c.type !== "midi") { return; }
        c.notes.forEach(function (n) { if (n[0] < 0 || n[0] >= c.len || (!drum && n[0] + n[1] > c.len)) { bad.push("outside " + c.id); } });
        if (!drum) { var by = c.notes.slice().sort(function (a, b) { return a[2] - b[2] || a[0] - b[0]; }); for (k = 1; k < by.length; k++) { if (by[k][2] === by[k - 1][2] && by[k][0] < by[k - 1][0] + by[k - 1][1]) { bad.push("overlap " + c.id); break; } } }
        if (X.clipState(c) === "gen") { var rg = X.regenClip(p, t, c); if (!rg.ok || JSON.stringify(M.cleanNotes(rg.notes)) !== JSON.stringify(c.notes)) { bad.push("regen " + t.name + " " + (rg.why || "")); } }
      });
    });
    for (i = 1; i < secs.length; i++) { if (secs[i].tick !== secs[i - 1].tick + secs[i - 1].len) { bad.push("gap"); } }
    if (secs.length && secs[secs.length - 1].tick + secs[secs.length - 1].len !== end) { bad.push("end"); }
    if (mel !== undefined && JSON.stringify(p.tracks[0].clips.map(function (c) { return c.notes; })) !== mel) { bad.push("melody"); }
    return bad;
  }
  // 1. 128 小節
  D.xmas.host.newSong(X.tplNewProject(X.tplPlan(null, "pop", "new", 1, 1, "full128")).project); D.xmas.host.back();
  var p = D.project(); p.tracks[0].clips[4].notes = [[0, 480, 74, 0.8], [960, 480, 76, 0.7]];
  var mel = JSON.stringify(p.tracks[0].clips.map(function (c) { return c.notes; })), bar = function (n) { return M.barToTick(p, n - 1); };
  ok(Math.round(M.songEndTick(p) / M.barTicks(p)) === 128 && check(p, mel).length === 0, "1. a 128-bar song from a template, my melody added: consistent");
  // 2・3. 65 小節目のコードをその場で → 伴奏が追従
  var before = JSON.stringify(p.tracks.map(function (t) { return t.clips.map(function (c) { return c.notes; }); })), c65 = X.songChords(p)[64], to65 = c65 === "vi" ? "IV" : "vi";
  D.ced.open(64); D.ced.click("pick:" + to65); var q = D.ced.state().q; D.ced.click("apply"); p = D.project();
  ok(X.songChords(p)[64] === to65 && q.regen.length >= 3 && JSON.stringify(p.tracks.map(function (t) { return t.clips.map(function (c) { return c.notes; }); })) !== before && check(p, mel).length === 0, "2–3. bar 65's chord changed in place; the accompaniment follows; still consistent", check(p, mel).slice(0, 3));
  // 4. 65 小節目から再生
  T.go(bar(65)); T.resume(); var P1 = await playing();
  ok(P1 && P1.segs[0].tick0 === bar(65), "4. play from bar 65");
  run(2);
  // 5・6. 一時停止 → 同じ位置から
  var at = Math.floor(D.playTick()); T.pause(); var pausedAt = T.now(); D.clearLog(); T.resume(); var P2 = await playing(); run(0.5);
  ok(P2 && P2.segs[0].tick0 === pausedAt && Math.abs(pausedAt - at) <= 1 && D.log().every(function (e) { return e.tick >= pausedAt - 1; }), "5–6. pause and continue from the same position (no earlier notes)", [at, pausedAt]);
  // 7・8. 次のセクション → 前のセクション
  var s0 = S.now(); S.step(1); await playing(); var s1 = S.now(); S.step(-1); await playing(); S.step(-1); await playing(); var s2 = S.now();
  ok(s1 && s0 && s1.tick > s0.tick && D.player() && s2.tick <= s1.tick, "7–8. next section, then back", [s0 && s0.name, s1 && s1.name, s2 && s2.name]);
  // 9. サビをループ
  var L = M.sectionsOf(p), iC = -1; L.forEach(function (s, i) { if (iC < 0 && /サビ/.test(s.name) && s.tick > bar(60)) { iC = i; } }); if (iC < 0) { iC = 3; }
  S.loopSecs(iC, iC); var P3 = await playing(); run(1);
  var lr = M.loopRange(p), tk = D.playTick();
  ok(p.practice.loopOn && lr.a === L[iC].tick && tk >= lr.a && tk < lr.b, "9. loop " + L[iC].name + " while playing: the position is inside the loop", [lr, Math.round(tk)]);
  // 10. ループ中にコードを変える（鳴らしなおし・ループのまま）
  var cb = M.tickToBar(p, L[iC].tick).bar - 1, cOld = X.songChords(p)[cb], cNew = cOld === "IV" ? "V" : "IV", P4 = D.player();
  var snapBefore = JSON.stringify({ t: p.tracks, e: p.ext });
  D.ced.open(cb); D.ced.click("pick:" + cNew); D.ced.click("apply"); var P5 = await playing(); run(0.5);
  ok(X.songChords(p)[cb] === cNew && P5 && P5 !== P4 && P5.loop && D.playTick() >= lr.a && D.playTick() < lr.b && check(p, mel).length === 0, "10. a chord changed during the loop: playback restarts with the new notes and keeps looping; consistent");
  // 11. ↶
  T.pause(); D.xmas.host.undo(); p = D.project();
  ok(JSON.stringify({ t: p.tracks, e: p.ext }) === snapBefore && check(p, mel).length === 0, "11. ↶ once: the chord and notes are back");
  // 12. MIDI・WAV（計画）・ステム（計画）
  var ex = M.midiExport(p), rd = M.midiRead(ex.bytes, "x.mid"), nP = 0, nM = 0;
  p.tracks.forEach(function (t) { t.clips.forEach(function (c) { nP += c.notes.length; }); }); rd.parts.forEach(function (x0) { nM += x0.notes.length; });
  var wp = D.wav.plan(), sp = D.stem.plan();
  ok(ex.ok && ex.bytes[9] === 1 && ((ex.bytes[12] << 8) | ex.bytes[13]) === 960 && nM === nP && rd.bars === 128 && sp.music === wp.music && sp.count >= 6, "12. MIDI (Format 1, PPQ 960, every note, 128 bars); WAV and stems planned with the same length", [nM, nP]);
  // 13・14. 保存 → 復元 → 同じ・不整合なし（ループも残る）
  var rec = JSON.parse(JSON.stringify(M.toRecord(p, Date.now()))), back = M.fromRecord(rec), bp = back.project;
  ok(back.ok && JSON.stringify(bp.tracks.map(function (t) { return t.clips.map(function (c) { return [c.start, c.notes, c.ext]; }); })) === JSON.stringify(p.tracks.map(function (t) { return t.clips.map(function (c) { return [c.start, c.notes, c.ext]; }); })) && JSON.stringify(bp.practice) === JSON.stringify(p.practice) && JSON.stringify(bp.ext) === JSON.stringify(p.ext) && check(bp, mel).length === 0, "13–14. save → restore: the same notes, chords, loop range; consistent");
  T.pause(); p.practice.loopOn = false;
  // いろいろな曲でも: テンポとスイング・6/8・12/8・録音のトラック
  async function variant(name, mk) {
    var pp = mk(), bad = [];
    var ch = X.songChords(pp), bars = Object.keys(ch).map(Number), b0 = bars[Math.floor(bars.length / 2)] || 0, cur = ch[b0], to = cur === "IV" || cur === "iv" ? (pp.ext.xmMode === "min" ? "v" : "V") : (pp.ext.xmMode === "min" ? "iv" : "IV");
    D.ced.open(b0); D.ced.click("pick:" + to); var qq = D.ced.state().q; if (!qq || !qq.ok) { bad.push("plan " + (qq && qq.why)); } else if (!qq.regen.length) { bad.push("nothing followed: " + JSON.stringify(qq.none.slice(0, 2))); } D.ced.click("apply"); pp = D.project();
    if (X.songChords(pp)[b0] !== to) { bad.push("chord"); }
    T.go(M.barToTick(pp, b0)); T.resume(); var Pp = await playing(); run(1); if (!Pp || Pp.segs[0].tick0 !== M.barToTick(pp, b0)) { bad.push("play"); }
    T.pause(); var pa = T.now(); T.resume(); var Pq = await playing(); if (!Pq || Pq.segs[0].tick0 !== pa) { bad.push("resume"); }
    var Ls = M.sectionsOf(pp); if (Ls.length) { S.loopSecs(0, 0); run(0.3); if (!(D.playTick() >= Ls[0].tick && D.playTick() < Ls[0].tick + Ls[0].len)) { bad.push("loop"); } pp.practice.loopOn = false; }
    T.pause(); bad = bad.concat(check(pp));
    ok(bad.length === 0, "also with " + name + ": chord in place, play, pause / continue, loop — consistent", bad.slice(0, 4));
  }
  await variant("tempo 132 + swing", function () { D.xmas.host.newSong(X.tplNewProject(X.tplPlan(null, "pop", "new", 1, 1, "full")).project); D.xmas.host.back(); var pp = D.project(), gp = X.groovePlan(pp, { bpm: 132, amt: 60 }); X.grooveApply(pp, gp); return pp; });
  await variant("6/8 (lullaby)", function () { D.xmas.host.newSong(X.tplNewProject(X.tplPlan(null, "xlullaby", "new", 1, 1, "full")).project); D.xmas.host.back(); return D.project(); });
  await variant("12/8", function () { D.xmas.host.newSong(X.tplNewProject(X.tplPlan(null, "xlullaby", "new", 1, 1, "std")).project); D.xmas.host.back(); var mpl = X.meterPlan(D.project(), { num: 12, den: 8, melody: false }), mp = X.meterProject(D.project(), mpl); D.xmas.host.newSong(mp.project); D.xmas.host.back(); return D.project(); });
  await variant("a recording track", function () {
    D.xmas.host.newSong(X.tplNewProject(X.tplPlan(null, "ballad", "new", 1, 1, "full")).project); D.xmas.host.back(); var pp = D.project();
    var at2 = M.addAudioTrack(pp); var tr = at2.track || at2; pp.assets.push({ id: "a:00000000000000a1", name: "take.wav", bytes: 1000, sr: 48000, ch: 1, bits: 16, frames: 96000, sec: 2, hash: "a:00000000000000a1" });
    tr.clips.push({ id: "cAud1", type: "audio", start: 0, len: M.barToTick(pp, 4), offset: 0, asset: "a:00000000000000a1", loop: null, ext: {} });
    return pp;
  });
  A.stop();
};
