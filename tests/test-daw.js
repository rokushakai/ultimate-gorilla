// ゴリラDAW（§341 Phase 9A）: データモデル（arcade-daw-model.js・§340 の形）と画面の骨格（arcade-daw.js）
"use strict";
var H = require("./harness");
var ok = H.ok;

module.exports = async function () {
  H.suite("daw");
  var env = H.load();
  var W = env.window, M = W.UGDawModel, D = W.UGDaw, A = W.UGArcade;
  ok(!!M && !!D, "UGDawModel and UGDaw exist");
  var PPQ = M.PPQ;
  ok(PPQ === 960 && M.STORE_KEY === "ultimateGorillaDawV1" && M.TYPE === "ultimate-gorilla-project", "PPQ 960, new storage key, project type (§340)");

  // --- 見本のプロジェクト（§340 の形）---
  var p = M.demoProject(0);
  ok(p.version === 1 && p.ppq === 960 && p.tempo.points[0].tick === 0 && p.tempo.points[0].bpm === 110 && p.tempo.meters[0].num === 4, "demo project: version 1, ppq 960, tempo map from tick 0", p.tempo);
  ok(p.tracks.length === 2 && p.tracks[0].kind === "midi" && p.tracks[1].kind === "midi", "demo has 2 midi tracks", p.tracks.length);
  var ins0 = p.tracks[0].instrument, ins1 = p.tracks[1].instrument;
  ok(ins0.type === "synth" && ins0.patch.mode === "inline" && ins0.patch.patch && /^h[0-9a-f]{8}$/.test(ins0.patch.hash) && ins0.ext.preset === "lead", "track 1 uses an inline synth patch from preset lead", ins0.ext);
  ok(ins1.ext.preset === "bass" && ins1.patch.hash !== ins0.patch.hash, "track 2 uses another preset (bass) with a different hash", [ins1.ext.preset]);
  var ids = {}, dup = false, notesOk = true;
  p.tracks.forEach(function (t) {
    if (ids[t.id]) { dup = true; } ids[t.id] = 1;
    t.clips.forEach(function (c) {
      if (ids[c.id]) { dup = true; } ids[c.id] = 1;
      c.notes.forEach(function (n) { if (!(n.length === 4 && n[0] >= 0 && n[0] < c.len && n[1] > 0 && n[2] >= 0 && n[2] <= 127 && n[3] > 0 && n[3] <= 1 && n[0] === Math.round(n[0]))) { notesOk = false; } });
    });
  });
  ok(!dup && p.tracks[0].clips.length === 2 && p.tracks[1].clips.length === 2, "unique ids, 2 clips per track", Object.keys(ids));
  ok(notesOk, "all notes are [t, d, m, v] with integer ticks inside the clip");
  ok(M.endTick(p) === 8 * 4 * PPQ && M.viewBars(p) === 9, "song ends at bar 8, view shows 9 bars", [M.endTick(p), M.viewBars(p)]);
  ok(JSON.stringify(M.clean(JSON.parse(JSON.stringify(p)))) === JSON.stringify(p), "clean() keeps a valid project unchanged (JSON round trip)");

  // --- 時刻の計算 ---
  ok(M.barToTick(p, 0) === 0 && M.barToTick(p, 2) === 2 * 4 * PPQ, "barToTick in 4/4");
  var tb = M.tickToBar(p, 4 * PPQ * 2 + PPQ * 2 + 100);
  ok(tb.bar === 3 && tb.beat === 3 && tb.sub === 100, "tickToBar → bar 3 beat 3", tb);
  var q = M.newProject({ bpm: 120, now: 0 });
  q.tempo.points.push({ tick: 4 * PPQ, bpm: 60 });
  q.tempo.meters.push({ tick: 4 * PPQ, num: 3, den: 4 });
  ok(Math.abs(M.tickToSec(q, 4 * PPQ) - 2) < 1e-9 && Math.abs(M.tickToSec(q, 5 * PPQ) - 3) < 1e-9, "tickToSec follows a stepped tempo map (120 → 60)", [M.tickToSec(q, 4 * PPQ), M.tickToSec(q, 5 * PPQ)]);
  ok(Math.abs(M.secToTick(q, 3) - 5 * PPQ) < 1e-6 && Math.abs(M.secToTick(q, 1) - 2 * PPQ) < 1e-6, "secToTick is the inverse");
  ok(M.barToTick(q, 2) === 4 * PPQ + 3 * PPQ && M.tickToBar(q, 7 * PPQ).bar === 3 && M.tickToBar(q, 7 * PPQ).num === 3, "meter change 4/4 → 3/4 at bar 2", M.barToTick(q, 2));
  ok(M.setBpm(q, 999) === M.BPM_MAX && M.setBpm(q, 1) === M.BPM_MIN && M.setBpm(q, 97.4) === 97, "setBpm clamps and rounds");

  // --- 壊れた・古い・空のデータでも落ちない ---
  var bad = [null, 5, "x", [], {}, { tracks: "x" }, { tracks: [null, 3, { clips: [null, { notes: [[NaN, 1, 60], ["a"], [0, 10, 300, 9], 5] }] }] }, { tempo: { points: [{ tick: 50, bpm: "x" }, { tick: 0, bpm: 5 }] } }];
  var allOk = true;
  bad.forEach(function (b) {
    try {
      var c = M.clean(b);
      if (!(c.tempo.points[0].tick === 0 && c.tempo.points[0].bpm >= M.BPM_MIN && c.tempo.meters[0].tick === 0 && Array.isArray(c.tracks))) { allOk = false; }
    } catch (e) { allOk = false; }
  });
  ok(allOk, "clean() never throws and always has tempo/meter at tick 0");
  var c6 = M.clean(bad[6]);
  ok(c6.tracks.length === 1 && c6.tracks[0].clips.length === 1 && c6.tracks[0].clips[0].notes.length === 1 && c6.tracks[0].clips[0].notes[0][2] === 127 && c6.tracks[0].clips[0].notes[0][3] === 1 && c6.tracks[0].id && c6.tracks[0].clips[0].id,
    "bad notes are dropped or clamped, missing ids are given", c6.tracks[0].clips[0]);
  var dupP = M.clean({ tracks: [{ id: "t1", clips: [{ id: "x" }, { id: "x" }] }, { id: "t1" }] });
  ok(dupP.tracks[0].id === "t1" && dupP.tracks[1].id !== "t1" && dupP.tracks[0].clips[0].id !== dupP.tracks[0].clips[1].id, "duplicated ids are renumbered", [dupP.tracks[1].id, dupP.tracks[0].clips.map(function (c) { return c.id; })]);
  var p480 = M.clean({ ppq: 480, tracks: [{ clips: [{ start: 480, len: 1920, notes: [[240, 120, 60, 0.5]] }] }], tempo: { points: [{ tick: 0, bpm: 90 }, { tick: 1920, bpm: 100 }] } });
  ok(p480.ppq === 960 && p480.tracks[0].clips[0].start === 960 && p480.tracks[0].clips[0].notes[0][0] === 480 && p480.tempo.points[1].tick === 3840, "another ppq is converted to 960", p480.tracks[0].clips[0]);
  ok(M.clean({ version: 7 }).readOnly === true && !M.clean({ version: 1 }).readOnly, "unknown newer version is read-only (§340)");

  // --- 画面（ゲームセンターから開く）---
  ok(A.list().some(function (g) { return g.id === "daw" && g.cat === "music"; }), "arcade lists ゴリラDAW in the music category");
  var root = H.makeEl("div"), backed = 0;
  D.reset();
  var before = JSON.stringify(env.store);
  ok(A.start("daw", root, { onExit: function () { backed++; } }) === true, "UGArcade.start('daw') opens the setup screen");
  var html = root.innerHTML;
  ok(html.indexOf("ゴリラDAW") >= 0 && html.indexOf("daw-transport") >= 0 && html.indexOf("BPM <b>110</b>") >= 0, "screen has title, transport and BPM 110");
  ok((html.match(/class="daw-head/g) || []).length === 2 && html.indexOf("リード") >= 0 && html.indexOf("ベース") >= 0, "two track headers");
  ok((html.match(/class="daw-barno"/g) || []).length === 9 && html.indexOf('>9</span>') >= 0, "ruler shows bar numbers 1–9");
  ok((html.match(/class="daw-clip[" ]/g) || []).length === 4 && html.indexOf("メロディ A") >= 0 && (html.match(/class="daw-mini"/g) || []).length > 40, "4 clips with mini notes");
  ok(html.indexOf('data-act="play" title') >= 0 && html.indexOf("daw-playhead") >= 0 && html.indexOf('class="daw-pos"') >= 0, "transport has play, playhead and position (9A-2)");
  ok(html.indexOf('<option value="lead" selected>') >= 0 && html.indexOf('<option value="bass" selected>') >= 0, "instrument selects show the presets");
  var cx = html.match(/data-clip="c\d+" style="left:(\d+)px;width:(\d+)px;"/);
  ok(cx && cx[1] === "0" && cx[2] === String(16 * D.PX_BEAT), "first clip is at x=0 and 4 bars wide", cx && cx.slice(1));
  ok(JSON.stringify(env.store) === before, "opening the DAW writes nothing to localStorage (no save in 9A-1)");
  A.stop();
  ok(root.innerHTML === "", "stop clears the DAW screen");

  // ================= 9A-2: 再生（§341）=================
  D.reset();
  var p2 = D.project(), BAR = 4 * PPQ, SONG = 8 * BAR;
  var evs = M.noteEvents(p2, 0, SONG);
  var nLead = evs.filter(function (e) { return e.track === p2.tracks[0].id; }).length, nBass = evs.filter(function (e) { return e.track === p2.tracks[1].id; }).length;
  ok(evs.length === 69 && nLead === 33 && nBass === 36, "1. noteEvents: 33 lead + 36 bass notes in 8 bars", [nLead, nBass]);
  var atB = evs.filter(function (e) { return e.tick === 4 * BAR; });
  ok(atB.length === 2 && atB[0].track !== atB[1].track, "3. clip B starts exactly at bar 5 on both tracks (no note lost at the clip boundary)", atB.length);
  ok(evs.every(function (e, i) { var f = M.findClip(p2, e.clip).clip; return e.tick >= f.start && e.end <= f.start + f.len && (i === 0 || evs[i - 1].tick <= e.tick); }), "3. every note starts/ends inside its clip, sorted by tick");
  ok(M.noteEvents(p2, BAR, 2 * BAR).every(function (e) { return e.tick >= BAR && e.tick < 2 * BAR; }) && M.noteEvents(p2, 0, SONG).length === M.noteEvents(p2, 0, 3 * BAR + 7).length + M.noteEvents(p2, 3 * BAR + 7, SONG).length, "1. noteEvents ranges are half-open and add up");
  ok(M.songEndTick(p2) === SONG && M.loopRange(p2).a === 0 && M.loopRange(p2).b === SONG, "loop range of the demo = bars 1–8");
  var q2 = M.clean(JSON.parse(JSON.stringify(p2))), T1 = q2.tracks[0], T2 = q2.tracks[1];
  ok(M.audible(q2, T1) && M.audible(q2, T2), "5. no mute/solo: both audible");
  T1.mute = true; ok(!M.audible(q2, T1) && M.audible(q2, T2), "5. mute silences only that track");
  T1.mute = false; T2.solo = true; ok(!M.audible(q2, T1) && M.audible(q2, T2), "5. solo plays only the soloed track");
  T2.mute = true; ok(!M.audible(q2, T1) && !M.audible(q2, T2), "5. mute wins over solo (same as the sequencer)");

  var root2 = H.makeEl("div");
  A.start("daw", root2, {});
  ok(D.play() === true && D.isPlaying(), "6. play starts");
  var P = D.player(), ac = P.ac, t0 = P.segs[0].t0, spb = 60 / 110;
  ok(ac === W.UGMelody.audio.ctx && (!env.counters.ctxs || env.counters.ctxs.length === 1), "uses the one shared AudioContext (UGMelody.audio.ctx)", env.counters.ctxs && env.counters.ctxs.length);
  ok(t0 > ac.currentTime && t0 - ac.currentTime < 0.2, "first note is scheduled a little ahead of the audio clock", t0 - ac.currentTime);
  function run(toSec) { var g = 0; while (ac.currentTime < toSec - 1e-9 && g++ < 100000) { ac.currentTime = Math.min(toSec, ac.currentTime + 0.025); D.pump(); } }
  function eqT(a, b) { return Math.abs(a - b) < 1e-6; }
  run(t0 + 2);
  var L = D.log();
  ok(L.length > 0 && L.every(function (x) { return x.when <= ac.currentTime + D.LOOK + 1e-6; }), "only notes inside the look-ahead window are scheduled", L.length);
  run(t0 + 32 * spb + 0.3);
  L = D.log();
  ok(!D.isPlaying() && D.tailPending(), "loop OFF: stops at the end of bar 8 and lets the tails ring", D.isPlaying());
  ok(L.length === 69 && L.every(function (x) { return x.ok && x.pass === 0; }), "2. all 69 notes of both tracks were played once", L.length);
  var keys = {}, dup = 0; L.forEach(function (x) { var k = x.track + ":" + x.tick + ":" + x.m; if (keys[k]) { dup++; } keys[k] = 1; });
  ok(dup === 0, "no duplicated notes", dup);
  var b5 = L.filter(function (x) { return x.tick === 4 * BAR; });
  ok(b5.length === 2 && b5.every(function (x) { return eqT(x.when, t0 + 16 * spb); }), "2. tick → AudioContext time: bar 5 at t0 + 16 beats (both tracks together)", b5.map(function (x) { return x.when - t0; }));
  var first = L.filter(function (x) { return x.track === p2.tracks[0].id; })[0];
  ok(first.tick === 0 && eqT(first.when, t0) && eqT(first.sec, Math.round(PPQ * 0.95) / PPQ * spb) && first.m === 76 && first.v === 0.9, "2. pitch, start, length and velocity come from the NoteEvent", first);
  var h1 = {}, h2 = {}; L.forEach(function (x) { (x.track === p2.tracks[0].id ? h1 : h2)[x.hash] = 1; });
  ok(Object.keys(h1).length === 1 && Object.keys(h2).length === 1 && Object.keys(h1)[0] === p2.tracks[0].instrument.patch.hash && Object.keys(h1)[0] !== Object.keys(h2)[0], "4. each track keeps its own preset (lead / bass)");
  D.stop();
  ok(!D.tailPending() && !D.isPlaying(), "stop after the end clears the pending tail");

  // 6. 再生 → 停止 → もう一度（音が重ならない・片づく）
  D.clearLog();
  D.play();
  P = D.player(); t0 = P.segs[0].t0;
  // 新しいエンジン（synth-v2）があればトラックごとに SynthTrack。無い版（公開中の main）は UGSynth.note で鳴らし、声を覚えておく
  var HAS_ENG = !!(W.UGSynth.track && W.UGSynthEngine), mx1 = P.mix[p2.tracks[0].id], mx2 = P.mix[p2.tracks[1].id], syn1 = mx1.syn, syn2 = mx2.syn;
  ok(HAS_ENG ? (!!syn1 && !!syn2 && syn1 !== syn2) : (syn1 === null && syn2 === null && mx1 !== mx2), "one SynthTrack per track (or the UGSynth.note fallback without the engine)", [HAS_ENG, !!syn1, !!syn2]);
  run(t0 + 3);
  var vBefore = mx1.voices.length + mx2.voices.length;
  D.stop();
  ok(!D.isPlaying() && D.playTick() === 0 && (HAS_ENG ? syn1.disposed && syn2.disposed : vBefore > 0 && mx1.voices.length === 0 && mx2.voices.length === 0), "8. stop disposes both tracks (voices off) and returns to the top", [HAS_ENG, vBefore]);
  var n1 = D.log().length;
  ac.currentTime += 1; D.pump();
  ok(D.log().length === n1, "nothing is scheduled after stop (timer gone)");
  D.clearLog(); D.play(); P = D.player(); t0 = P.segs[0].t0; run(t0 + 3);
  var L2 = D.log(), k2 = {}, d2 = 0; L2.forEach(function (x) { var k = x.track + ":" + x.tick; if (k2[k + ":" + x.m]) { d2++; } k2[k + ":" + x.m] = 1; });
  ok(L2.length === n1 && d2 === 0 && L2[0].tick === 0 && eqT(L2[0].when, t0), "6. play again: same notes from the top, no duplicates", [L2.length, n1]);
  D.stop();

  // 7. ループ（8 小節）
  D.setLoop(true); D.clearLog(); D.play(); P = D.player(); t0 = P.segs[0].t0;
  run(t0 + 2 * 32 * spb + 1);
  var L3 = D.log(), p0 = L3.filter(function (x) { return x.pass === 0; }), p1 = L3.filter(function (x) { return x.pass === 1; });
  ok(D.isPlaying() && p0.length === 69 && p1.length === 69 && L3.some(function (x) { return x.pass === 2; }), "7. loop ON: wraps to bar 1 and plays every pass completely", [p0.length, p1.length]);
  var w1 = p1.filter(function (x) { return x.tick === 0; });
  ok(w1.length === 2 && w1.every(function (x) { return eqT(x.when, t0 + 32 * spb); }), "7. loop boundary: pass 2 starts exactly at the end of bar 8 (no gap, no overlap)", w1.map(function (x) { return x.when - t0; }));
  ok(L3.every(function (x) { return x.when + x.sec <= t0 + (x.pass + 1) * 32 * spb + 1e-6; }), "7. no note sounds over the loop end");
  // 5. 再生中のミュート・ソロ
  var g2 = P.mix[p2.tracks[1].id].main.g;
  p2.tracks[1].mute = true; D.updateMix(); D.clearLog();
  var lastT = env.counters.targets.filter(function (x) { return x.name === "gain"; }).pop();
  run(ac.currentTime + 2);
  ok(D.log().length > 0 && D.log().every(function (x) { return x.track === p2.tracks[0].id; }) && lastT && lastT.v === 0, "5. mute while playing: bass gain → 0 and no more bass notes", lastT);
  p2.tracks[1].solo = true; D.updateMix(); D.clearLog(); run(ac.currentTime + 2);
  ok(D.log().length === 0, "5. muted + soloed bass and un-soloed lead: nothing plays (mute wins)");
  p2.tracks[1].mute = false; D.updateMix(); D.clearLog(); run(ac.currentTime + 2);
  ok(D.log().length > 0 && D.log().every(function (x) { return x.track === p2.tracks[1].id; }), "5. solo bass: only bass plays");
  p2.tracks[1].solo = false; D.updateMix();
  ok(g2 === P.mix[p2.tracks[1].id].main.g, "mixer nodes are reused while playing");
  // BPM を再生中に変える
  D.clearLog(); D.setBpm(220); run(ac.currentTime + 2);
  var L4 = D.log().filter(function (x) { return x.track === p2.tracks[1].id; });
  var okB = L4.length > 3; for (var bi = 1; bi < L4.length; bi++) { if (L4[bi].pass === L4[bi - 1].pass && !eqT(L4[bi].when - L4[bi - 1].when, (L4[bi].tick - L4[bi - 1].tick) / PPQ * 60 / 220)) { okB = false; } }
  ok(okB && M.bpmAt(p2, 0) === 220, "BPM change while playing: new notes follow 220 BPM", L4.length);
  D.setBpm(110);
  // 9. 画面を閉じる（メニューへ）で片づく
  var P9 = D.player(), m9 = P9.mix[p2.tracks[0].id], s9 = m9.syn;
  A.stop();
  ok(!D.isPlaying() && (s9 ? s9.disposed : m9.voices.length === 0) && !D.tailPending(), "9. leaving the screen stops playback and disposes the synth tracks");
  D.setLoop(false);

  // d＝0（長さなし）は音色の a ＋ d でノートオフ
  D.reset();
  var pz = D.project(), E = W.UGSynthEngine;
  pz.tracks[0].clips[0].notes[0][1] = 0;
  A.start("daw", H.makeEl("div"), {});
  D.clearLog(); D.play(); P = D.player(); t0 = P.segs[0].t0; ac.currentTime = t0; D.pump();
  var z = D.log().filter(function (x) { return x.track === pz.tracks[0].id && x.tick === 0; })[0], pp = pz.tracks[0].instrument.patch.patch, amp = E && E.toV2 ? E.toV2(pp).envs.amp : { a: pp.a, d: pp.d };
  ok(z && eqT(z.sec, Math.max(0.05, Math.min(4, amp.a + amp.d))), "d = 0 keeps its meaning: note-off after the patch's attack + decay", z && z.sec);
  A.stop();
  D.reset();
  ok(JSON.stringify(env.store) === before, "playback writes nothing to localStorage");
};
