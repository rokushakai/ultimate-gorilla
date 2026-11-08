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

  // ================= 9A-3: ピアノロール（§341）=================
  // --- データモデルの編集 ---
  var pe = M.demoProject(0), ce = pe.tracks[0].clips[0], n0 = ce.notes.length;
  ok(M.snap(250, 240, true) === 240 && M.snap(370, 240) === 480 && M.snap(-10, 480, true) === -480, "snap: floor and round to the grid");
  var na = M.noteAdd(ce, 961.4, 62.2, 480, 0.8);
  ok(na && ce.notes.length === n0 + 1 && na[0] === 961 && na[1] === 480 && na[2] === 62 && na[3] === 0.8 && ce.notes.indexOf(na) >= 0, "noteAdd: integer tick, pitch, length, velocity 0.8", na);
  ok(ce.notes.every(function (n, i) { return i === 0 || ce.notes[i - 1][0] <= n[0]; }), "notes stay sorted by tick after add");
  var nb = M.noteAdd(ce, ce.len + 500, 200, 9999, 3);
  ok(nb[0] === ce.len - 1 && nb[1] === 1 && nb[2] === 127 && nb[3] === 1, "noteAdd clamps into the clip (start < len, end ≤ len) and to MIDI/velocity ranges", nb);
  M.noteDelete(ce, nb);
  M.noteSet(ce, na, { t: ce.len - 100, m: 70 });
  ok(na[0] === ce.len - 480 && na[1] === 480 && na[2] === 70, "noteSet move keeps the length and stays inside the clip", na);
  M.noteSet(ce, na, { d: 99999 });
  ok(na[0] + na[1] === ce.len, "noteSet length is cut at the clip end", na);
  M.noteSet(ce, na, { d: 0 });
  ok(na[1] === 1, "noteSet length is at least 1 tick when set");
  ok(M.noteDelete(ce, na) && ce.notes.length === n0 && !M.noteDelete(ce, na), "noteDelete removes exactly that note once");
  var cOff = { type: "midi", start: 0, len: 960, offset: 480, notes: [] }, no = M.noteAdd(cOff, 0, 60, 480);
  ok(no[0] === 480 && no[1] === 480, "offset is respected: clip-relative tick starts at offset", no);
  ok(JSON.stringify(M.clean(JSON.parse(JSON.stringify(pe)))) === JSON.stringify(pe), "edited project still round-trips through clean()");

  // --- 画面のピアノロール（編集 → 再生への反映）---
  D.reset();
  var rootR = H.makeEl("div");
  A.start("daw", rootR, {});
  var pr = D.project(), lead = pr.tracks[0], cA = lead.clips[0], cB = lead.clips[1], nA = cA.notes.length;
  function CA() { return M.findClip(D.project(), cA.id).clip; } // ↶ はトラック全部を写しから戻すので、いまのクリップを探しなおす（9A-5）
  ok(D.openRoll(cA.id) === true && D.roll().clip === cA.id && D.state().view === "roll", "tapping a clip opens its piano roll");
  var rh = rootR.innerHTML;
  ok(rh.indexOf("pr-wrap") >= 0 && (rh.match(/class="pr-note/g) || []).length === nA && rh.indexOf("dp-bar") >= 0 && rh.indexOf("dsv-slot") >= 0 && rh.indexOf("もどる") >= 0, "piano roll shows the notes, the save status bar and the back button");
  ok((rh.match(/class="pr-key[" ]/g) || []).length === D.ROLL.HI - D.ROLL.LO + 1 && rh.indexOf(">C4<") >= 0, "keyboard rows C1–C7 with names");
  var E1 = D.edit;
  var add1 = E1.add(4 * PPQ + 480, 84);
  ok(add1 && cA.notes.length === nA + 1 && add1[0] === 4 * PPQ + 480 && add1[1] === 480 && add1[2] === 84 && D.roll().sel === add1 && D.roll().undo.length === 1, "edit.add: grid-length note, selected, one undo step");
  ok(rootR.innerHTML.indexOf("pr-sel") >= 0 && rootR.innerHTML.indexOf("pr-handle") >= 0, "the selected note shows the length handle");
  E1.set(add1, { t: 6 * PPQ, m: 86 });
  ok(add1[0] === 6 * PPQ && add1[2] === 86 && D.roll().undo.length === 2, "edit.set moves pitch and start");
  E1.set(add1, { d: 960 });
  ok(add1[1] === 960 && D.roll().undo.length === 3, "edit.set changes the length");
  E1.set(add1, { d: 960 });
  ok(D.roll().undo.length === 3, "no undo step when nothing changed");
  ok(E1.undo() && CA().notes.filter(function (n) { return n[2] === 86 && n[1] === 480; }).length === 1 && D.roll().undo.length === 2, "undo restores the previous length");
  var added = CA().notes.filter(function (n) { return n[2] === 86; })[0];
  ok(E1.del(added) && CA().notes.length === nA && D.roll().sel === null, "edit.del removes the note");
  ok(E1.undo() && CA().notes.length === nA + 1, "undo brings a deleted note back");
  ok(E1.undo() && E1.undo() && CA().notes.length === nA && !E1.undo(), "undo all the way back to the original, then nothing more");
  ok(JSON.stringify(CA().notes) === JSON.stringify(M.demoProject(0).tracks[0].clips[0].notes), "after undoing everything the clip equals the original demo");

  // 直した音符が再生に入る（クリップだけ再生・M／S は見ない）
  var addP = E1.add(2 * PPQ + 240, 90);
  D.clearLog();
  D.project().tracks[0].mute = true;
  D.play({ clip: cA.id, a: cA.start, b: cA.start + cA.len, loop: true });
  P = D.player(); ac = P.ac; t0 = P.segs[0].t0;
  run(t0 + 16 * spb + 0.5);
  var LR = D.log();
  ok(LR.length > 0 && LR.every(function (x) { return x.track === lead.id && x.tick < cA.start + cA.len; }), "clip play: only this clip, even when the track is muted");
  var hit = LR.filter(function (x) { return x.m === 90 && x.tick === 2 * PPQ + 240 && x.pass === 0; })[0];
  ok(hit && eqT(hit.when, t0 + (2 * PPQ + 240) / PPQ * spb) && eqT(hit.sec, 480 / PPQ * spb) && hit.v === 0.8, "the added note plays at its tick with its length and velocity", hit);
  ok(LR.some(function (x) { return x.pass === 1 && x.tick === 0; }), "clip play loops at the clip end");
  D.project().tracks[0].mute = false;
  // 再生中に直す → 止めて同じ位置から鳴らしなおす（古い予約の音を残さない）
  var Pold = D.player(), mOld = Pold.mix[lead.id], sOld = mOld.syn, tickNow = D.playTick();
  E1.del(addP);
  var Pnew = D.player();
  ok(Pnew && Pnew !== Pold && (sOld ? sOld.disposed : mOld.voices.length === 0) && Math.abs(Pnew.segs[0].tick0 - Math.floor(tickNow)) <= 1 && Pnew.clip === cA.id, "editing while playing: old schedule disposed, restarts from the same position", [Pnew && Pnew.segs[0].tick0, tickNow]);
  D.clearLog(); run(ac.currentTime + 16 * spb + 0.5);
  ok(D.log().length > 0 && D.log().every(function (x) { return x.m !== 90; }), "the deleted note is not played any more");
  D.stop();
  // DAW の ▶（全体）にも反映される
  var addQ = E1.add(cB.start - cB.start + 3 * PPQ, 95);
  D.closeRoll();
  ok(D.state().view === "arr" && rootR.innerHTML.indexOf("daw-arr") >= 0 && rootR.innerHTML.indexOf("dsv-slot") >= 0, "back to the DAW screen (with the save status)");
  D.setLoop(false); D.clearLog(); D.play(); P = D.player(); t0 = P.segs[0].t0; run(t0 + 6 * spb);
  var hq = D.log().filter(function (x) { return x.m === 95; })[0];
  ok(hq && hq.tick === 3 * PPQ && eqT(hq.when, t0 + 3 * spb), "the edited clip plays in the normal DAW playback too", hq);
  ok(D.log().filter(function (x) { return x.track === pr.tracks[1].id; }).length > 0, "other tracks still play with the edited one");
  D.stop();
  A.stop();
  var b0 = JSON.parse(before);
  ok(!D.isPlaying() && Object.keys(env.store).every(function (k) { return b0.hasOwnProperty(k) ? env.store[k] === b0[k] : k.indexOf("ultimateGorillaDawV1") === 0; }), "piano roll edits only add DAW keys (9A-4 autosave); other keys unchanged");
  D.reset();

  // ================= 9A-4: 保存・読みこみ・JSON（§341）=================
  var e4 = H.load(), W4 = e4.window, M4 = W4.UGDawModel, D4 = W4.UGDaw, A4 = W4.UGArcade, S4 = e4.store, KEY = M4.STORE_KEY;
  S4.ultimateGorillaSaveV2 = JSON.stringify({ hero: "gorilla", lv: 42, flags: { ukulele: true } });
  S4.ultimateGorillaUkuleleSeqV1 = JSON.stringify({ songs: [{ name: "x" }] });
  var rpg0 = S4.ultimateGorillaSaveV2, uke0 = S4.ultimateGorillaUkuleleSeqV1;
  function dawKeys() { return Object.keys(S4).filter(function (k) { return k.indexOf(KEY) === 0; }).sort(); }
  function pk(id) { return KEY + ":p:" + id; }

  // --- 形（モデル）---
  var rec = M4.toRecord(M4.demoProject(5), 7);
  ok(rec.format === "ultimate-gorilla-daw" && rec.schemaVersion === 1 && rec.saved === 7 && rec.project.saved === 7 && rec.project.ppq === 960, "toRecord: format, schemaVersion 1, saved time, PPQ 960");
  var back = M4.fromRecord(JSON.parse(JSON.stringify(rec)));
  ok(back.ok && JSON.stringify(back.project) === JSON.stringify(rec.project), "fromRecord(toRecord(p)) gives the same project (serialize / deserialize)");
  var u = M4.demoProject(1); u.futureThing = { a: 1 }; u.tracks[0].sendLevel = 0.3; u.master.limiter = true; u.tempo.points.push({ tick: 7680, bpm: 90 }); u.tempo.meters.push({ tick: 7680, num: 3, den: 4 });
  var uc = M4.clean(JSON.parse(JSON.stringify(u)));
  ok(uc.futureThing && uc.futureThing.a === 1 && uc.tracks[0].sendLevel === 0.3 && uc.master.limiter === true && uc.tempo.points.length === 2 && uc.tempo.meters[1].num === 3, "unknown fields and the tempo map / meters are kept (not editable in the UI yet)");
  ok(M4.parseRecordText("{oops").error === "json" && M4.parseRecordText("").error === "empty" && M4.parseRecordText('{"a":1}').error === "notDaw", "bad text: not JSON / empty / not a DAW file");
  ok(M4.parseRecordText('{"format":"ultimate-gorilla-daw","schemaVersion":2,"project":{}}').error === "newer" && M4.parseRecordText(JSON.stringify({ format: "ultimate-gorilla-daw", schemaVersion: 1, project: { type: "ultimate-gorilla-project", version: 4, tracks: [] } })).error === "newer", "newer schemaVersion or project version is refused");
  ok(M4.parseRecordText('{"format":"ultimate-gorilla-daw","schemaVersion":1,"project":{"type":"ultimate-gorilla-project"}}').error === "broken", "missing tracks is refused");
  ok(M4.parseRecordText(new Array(M4.MAX_JSON + 2).join("a")).error === "big", "too large text is refused");
  ok(M4.parseRecordText("﻿" + JSON.stringify(M4.demoProject(3))).ok, "a bare Project (no schemaVersion, with BOM) is accepted");
  var odd = JSON.parse(JSON.stringify(rec)); odd.project.tracks[0].clips[0].notes = [[NaN, 1, 60], [0, 10, 300, 9], "x", [5.6, 7.2, 61.4, 0.5]];
  var oddR = M4.fromRecord(JSON.parse(JSON.stringify(odd)));
  ok(oddR.ok && JSON.stringify(oddR.project.tracks[0].clips[0].notes) === JSON.stringify([[0, 10, 127, 1], [6, 7, 61, 0.5]]), "abnormal NoteEvents are dropped or clamped to integers", oddR.project && oddR.project.tracks[0].clips[0].notes);

  // --- 画面: 新しい曲 → 音符 → 保存 → 読みなおし ---
  D4.reset();
  var R4 = H.makeEl("div");
  A4.start("daw", R4, {});
  ok(D4.saveState().status === "demo" && dawKeys().length === 0 && R4.innerHTML.indexOf("dp-bar") >= 0 && R4.innerHTML.indexOf("まだ保存していない") >= 0, "first open: the demo, not saved yet (status shown)");
  var p1 = D4.proj.create("empty");
  ok(D4.saveState().status === "saved" && dawKeys().length === 2 && S4[pk(p1.id)] && p1.tracks.length === 2 && p1.tracks[0].clips.length === 2 && M4.noteCount(p1) === 0, "1. new empty song is saved at once (index + project key)", dawKeys());
  ok(D4.readIndex().idx.last === p1.id && D4.readIndex().idx.list.length === 1, "the index remembers the last song");
  var writes = 0, set0 = W4.localStorage.setItem;
  W4.localStorage.setItem = function (k, v) { writes++; return set0.call(this, k, v); };
  D4.openRoll(p1.tracks[0].clips[0].id);
  D4.edit.add(0, 60); D4.edit.add(960, 64);
  var n3 = D4.edit.add(1920, 67);
  D4.edit.set(n3, { d: 1440 });
  ok(D4.saveState().status === "dirty" && writes === 0, "2. editing marks 'not saved yet' and does not write on every edit", writes);
  D4.flushSave();
  ok(D4.saveState().status === "saved" && writes === 2, "3. one save after the edits: 2 writes (project + index), status saved", writes);
  W4.localStorage.setItem = set0;
  // ↶ した状態も保存される
  D4.edit.add(2880, 72); D4.edit.undo(); D4.flushSave();
  var snap1 = JSON.stringify(D4.project());
  // 4. 読みなおし（ページの再読みこみと同じ: メモリの曲を捨てて保存から開く）
  var p1b = D4.reload();
  ok(p1b !== p1 && p1b.id === p1.id && D4.saveState().status === "saved", "4. reload opens the last saved song");
  ok(JSON.stringify(p1b) === snap1, "5. reloaded song is identical (serialize / deserialize)");
  ok(JSON.stringify(p1b.tracks[0].clips[0].notes) === JSON.stringify([[0, 480, 60, 0.8], [960, 480, 64, 0.8], [1920, 1440, 67, 0.8]]), "5. notes come back with the same position, length, pitch and velocity (the undone note is not there)", p1b.tracks[0].clips[0].notes);
  // 6. 読みなおした曲を鳴らす
  A4.start("daw", R4, {});
  D4.clearLog(); D4.play();
  var P4 = D4.player(), ac4 = P4.ac, s4 = P4.segs[0].t0, g4 = 0;
  while (ac4.currentTime < s4 + 3 && g4++ < 1000) { ac4.currentTime += 0.025; D4.pump(); }
  var L4b = D4.log();
  ok(L4b.some(function (x) { return x.m === 60 && x.tick === 0 && x.ok; }) && L4b.some(function (x) { return x.m === 67 && x.tick === 1920 && Math.abs(x.sec - 1440 / 960 * 0.5) < 1e-6; }), "6. the reloaded song plays (120 BPM, lengths kept)");
  D4.stop();
  // BPM・M／S・音色・ループも保存される
  D4.setBpm(133); p1b.tracks[1].mute = true; p1b.tracks[0].instrument = M4.synthInstrument("bell"); D4.setLoop(true); D4.markDirty(); D4.flushSave();
  var p1c = D4.reload();
  ok(M4.bpmAt(p1c, 0) === 133 && p1c.tracks[1].mute === true && p1c.tracks[0].instrument.ext.preset === "bell" && p1c.practice.loopOn === true && p1c.practice.loopB === 8 * 4 * PPQ, "BPM, mute, instrument and loop range are saved");
  // 7. 曲をいくつも・切りかえ
  ok(D4.proj.rename("曲いち") && D4.project().name === "曲いち", "rename saves the name");
  var p2 = D4.proj.create("demo");
  ok(p2.id !== p1.id && D4.proj.list().list.length === 2 && D4.readIndex().idx.last === p2.id, "7. a second song (from the demo) is a separate entry");
  var r7 = D4.proj.open(p1.id);
  ok(r7.ok && D4.project().id === p1.id && D4.project().name === "曲いち" && M4.noteCount(D4.project()) === 3 && D4.readIndex().idx.last === p1.id, "7. switching back opens song 1 with its notes");
  ok(D4.proj.open(p1.id).ok && D4.proj.list().list.length === 2, "saving the same song again does not duplicate it");
  ok(D4.reload().id === p1.id, "reload opens the song that was open last");
  D4.showProj();
  ok(R4.innerHTML.indexOf("曲の保存と読みこみ") >= 0 && R4.innerHTML.indexOf("曲いち") >= 0 && R4.innerHTML.indexOf('data-pj-open="' + p2.id + '"') >= 0 && R4.innerHTML.indexOf("この端末・このブラウザの中だけ") >= 0, "project screen lists songs, has open buttons and says storage is per device / browser");
  // 8. JSON の書き出し・読みこみ
  var p1rec = S4[pk(p1.id)];
  var ex = D4.proj.exportJson();
  ok(ex.ok && /^曲いち_\d{8}-\d{4}\.json$/.test(ex.name) && e4.counters.downloads.indexOf(ex.name) >= 0, "8. export: file name from the song name", ex.name);
  var exo = JSON.parse(ex.text);
  ok(exo.format === "ultimate-gorilla-daw" && exo.schemaVersion === 1 && exo.project.id === p1.id && ex.text.indexOf("gorilla\",\"lv") < 0 && ex.text.indexOf("hero") < 0 && Object.keys(exo).sort().join() === "format,project,saved,schemaVersion", "8. exported JSON holds only the DAW song (no RPG save)");
  var im = D4.proj.importText(ex.text);
  ok(im.ok && im.saved && D4.project().id !== p1.id && D4.project().name === "曲いち（読みこみ）" && JSON.stringify(D4.project().tracks) === JSON.stringify(exo.project.tracks), "8. import makes a new song (new id, name marked) with the same tracks and notes");
  ok(S4[pk(p1.id)] === p1rec && D4.proj.list().list.length === 3, "8. import did not overwrite the original song");
  // 9. 不正な JSON
  var keys9 = JSON.stringify(dawKeys().map(function (k) { return [k, S4[k]]; })), cur9 = D4.project().id;
  var bad1 = D4.proj.importText("{bad json"), bad2 = D4.proj.importText('{"format":"ultimate-gorilla-daw","schemaVersion":9,"project":{}}'), bad3 = D4.proj.importText('{"hello":"world"}');
  ok(!bad1.ok && !bad2.ok && !bad3.ok && D4.project().id === cur9 && JSON.stringify(dawKeys().map(function (k) { return [k, S4[k]]; })) === keys9 && D4.saveState().note.indexOf("読みこめませんでした") === 0, "9. invalid / newer / foreign JSON changes nothing (current song and saved data stay)");
  // 保存できないとき（容量いっぱい・プライベートブラウズ）
  W4.localStorage.setItem = function () { var e = new Error("QuotaExceededError"); e.name = "QuotaExceededError"; throw e; };
  D4.project().name = "ためし"; D4.markDirty();
  ok(D4.saveState().status === "dirty", "quota: pending");
  var q4 = D4.saveNow(); A4.start("daw", R4, {});
  ok(q4 === false && D4.saveState().status === "error" && R4.innerHTML.indexOf("dsv-err") >= 0 && R4.innerHTML.indexOf("保存できませんでした") >= 0, "quota exceeded: status is an error, never 'saved' (shown on screen)");
  W4.localStorage.setItem = set0;
  var ls0 = W4.localStorage;
  W4.localStorage = undefined;
  ok(D4.saveNow() === false && D4.saveState().status === "error", "no localStorage (private mode / blocked): error, not saved");
  W4.localStorage = ls0;
  ok(D4.saveNow() === true && D4.saveState().status === "saved", "saving works again when storage is back");
  // こわれた一覧: 消さずに写して守る
  var good = S4[pk(p1.id)];
  S4[KEY] = "{broken index";
  var pb = D4.reload();
  ok(D4.saveState().status === "demo" && D4.saveState().msg.indexOf("読めません") >= 0 && S4[KEY] === "{broken index" && S4[pk(p1.id)] === good, "broken index: opens the demo with a reason; nothing is overwritten yet");
  pb.name = "あたらしい"; D4.markDirty(); D4.flushSave();
  var bk = Object.keys(S4).filter(function (k) { return k.indexOf(KEY + ":broken:") === 0; });
  ok(bk.length === 1 && S4[bk[0]] === "{broken index" && S4[pk(p1.id)] === good && D4.readIndex().ok, "saving after that keeps a copy of the broken index and never deletes saved songs");
  // 10. RPG のセーブ・ほかの保存は変わらない
  ok(S4.ultimateGorillaSaveV2 === rpg0 && S4.ultimateGorillaUkuleleSeqV1 === uke0 && Object.keys(S4).every(function (k) { return k === "ultimateGorillaSaveV2" || k === "ultimateGorillaUkuleleSeqV1" || k.indexOf(KEY) === 0; }), "10. the RPG save and other saves are untouched; only ultimateGorillaDawV1* keys are written");
  A4.stop();
  D4.reset();

  // ================= 9A-5: トラック・クリップの編集（§341）=================
  var fx = JSON.parse(require("fs").readFileSync(require("path").join(H.ROOT, "tests", "fixtures", "daw-v2.37-song.json"), "utf8"));
  var e5 = H.load(), W5 = e5.window, M5 = W5.UGDawModel, D5 = W5.UGDaw, A5 = W5.UGArcade, S5 = e5.store, K5 = M5.STORE_KEY, BAR = 4 * PPQ;
  S5.ultimateGorillaSaveV2 = JSON.stringify({ hero: "gorilla", lv: 7 });
  var rpg5 = S5.ultimateGorillaSaveV2;
  // --- v2.37 で保存した曲がそのまま開ける ---
  S5[K5] = JSON.stringify(fx.index);
  S5[K5 + ":p:" + fx.record.project.id] = JSON.stringify(fx.record);
  var R5 = H.makeEl("div");
  D5.reset();
  A5.start("daw", R5, {});
  var old = D5.project();
  ok(D5.saveState().status === "saved" && old.id === fx.record.project.id && old.name === "v2.37 のテスト曲" && JSON.stringify(old) === JSON.stringify(M5.clean(fx.record.project)), "a song saved by v2.37 opens unchanged");
  ok(M5.noteCount(old) === 5 && M5.bpmAt(old, 0) === 100 && old.tracks[1].mute === true && JSON.stringify(old.tracks[0].clips[0].notes) === JSON.stringify([[0, 480, 72, 0.8], [960, 480, 76, 0.8], [1920, 1920, 79, 0.8]]), "v2.37 song: notes, BPM and mute as saved");
  function run5(sec) { var P = D5.player(), ac = P.ac, end = ac.currentTime + sec, g = 0; while (ac.currentTime < end && g++ < 20000) { ac.currentTime += 0.025; D5.pump(); } }
  D5.clearLog(); D5.play(); run5(4);
  ok(D5.log().some(function (x) { return x.m === 79 && x.tick === 1920 && x.ok; }), "the v2.37 song plays");
  D5.stop();
  // --- ゼロから: 新しい曲 → トラック → クリップ → 音符 → 再生 ---
  var z = D5.proj.create("empty");
  ok(z.tracks.length === 2 && M5.noteCount(z) === 0 && D5.undoDepth() === 0, "new empty song (undo list empty)");
  var t3 = D5.ops.addTrack();
  ok(t3 && z.tracks.length === 3 && t3.name === "トラック 3" && t3.instrument.type === "synth" && t3.vol === 80 && t3.pan === 0 && t3.clips.length === 0 && D5.undoDepth() === 1, "add a track (name, synth preset, volume, pan)");
  ok(R5.innerHTML.indexOf('data-addclip="' + t3.id + '"') >= 0 && R5.innerHTML.indexOf('data-ar="addTrack"') >= 0, "the screen has ＋ トラック and a ＋ tile on each track");
  t3.instrument = M5.synthInstrument("bell");
  var c3 = D5.ops.addClip(t3.id);
  ok(c3 && c3.start === 0 && c3.len === 4 * BAR && c3.notes.length === 0 && c3.ext.name === "クリップ 1" && D5.state().sel.id === c3.id, "add an empty clip (4 bars) at the end of the track; it is selected");
  ok(R5.innerHTML.indexOf('data-cl="dup"') >= 0 && R5.innerHTML.indexOf('data-cl="right"') >= 0 && R5.innerHTML.indexOf('data-cl="del"') >= 0, "the selected clip shows the edit buttons");
  D5.openRoll(c3.id);
  D5.edit.add(0, 84); D5.edit.add(2 * BAR, 88); D5.edit.add(4 * BAR - 480, 91);
  D5.closeRoll();
  c3 = M5.findClip(D5.project(), c3.id).clip;
  D5.clearLog(); D5.play(); run5(4 * 4 * 0.5 + 0.5);
  ok(D5.log().filter(function (x) { return x.track === t3.id; }).map(function (x) { return x.m + "@" + x.tick; }).join() === "84@0,88@7680,91@14880", "the new track plays its notes (120 BPM)", D5.log().filter(function (x) { return x.track === t3.id; }).map(function (x) { return x.m + "@" + x.tick; }));
  D5.stop();
  // 複製（独立したデータ）・移動
  var dup = D5.ops.duplicate(c3.id);
  ok(dup && dup.id !== c3.id && dup.start === 4 * BAR && dup.len === c3.len && dup.ext.name === "クリップ 1（コピー）" && JSON.stringify(dup.notes) === JSON.stringify(c3.notes), "duplicate goes right after the original with the same notes");
  dup.notes[0][2] = 60;
  ok(c3.notes[0][2] === 84, "the duplicate is an independent copy (editing it does not change the original)");
  dup.notes[0][2] = 84;
  ok(D5.ops.move(dup.id, 1) && dup.start === 5 * BAR, "move the duplicate one bar right");
  ok(D5.ops.move(c3.id, 2) === false && c3.start === 0 && D5.state().anote.indexOf("重なる") >= 0, "a move that would overlap is refused with a reason");
  ok(D5.ops.move(c3.id, -1) === false && c3.start === 0, "cannot move before bar 1");
  ok(D5.ops.move(c3.id, 1) && c3.start === BAR && D5.ops.move(c3.id, -1) && c3.start === 0, "move right and back");
  // 長さ
  ok(D5.ops.resize(dup.id, -1) && dup.len === 3 * BAR && D5.state().anote.indexOf("はみ出た音符 1 個") >= 0 && dup.notes.length === 3 && M5.hiddenNotes(dup) === 1, "shorten: the note past the end is kept but hidden (and said so)");
  ok(D5.ops.resize(dup.id, 1) && dup.len === 4 * BAR && M5.hiddenNotes(dup) === 0, "lengthen again: the note comes back");
  ok(D5.ops.resize(c3.id, 2) === false && c3.len === 4 * BAR, "lengthening into the next clip is refused");
  ok(D5.ops.resize(dup.id, -9) === false && dup.len === 4 * BAR, "cannot be shorter than one bar");
  // 再生: 移動・複製の位置で鳴る（境目で重ならない・欠けない）
  D5.clearLog(); D5.play(); run5(9 * 2 + 1);
  var L5 = D5.log().filter(function (x) { return x.track === t3.id; }).map(function (x) { return x.m + "@" + x.tick; });
  ok(L5.join() === "84@0,88@7680,91@14880,84@19200,88@26880,91@34080", "the original and the moved copy both play at their places (no doubles, nothing missing)", L5);
  D5.stop();
  // 名前・トラックの順番
  ok(D5.ops.renameClip(dup.id, "  サビ  ") && M5.findClip(D5.project(), dup.id).clip.ext.name === "サビ", "rename a clip (trimmed)");
  ok(D5.ops.renameTrack(t3.id, "ベル") && M5.findTrack(D5.project(), t3.id).name === "ベル", "rename a track");
  ok(D5.ops.moveTrack(t3.id, -1) && D5.project().tracks[1].id === t3.id && D5.ops.moveTrack(t3.id, -1) && D5.project().tracks[0].id === t3.id && D5.ops.moveTrack(t3.id, -1) === false, "move a track up (stops at the top)");
  // 削除と ↶
  var depth = D5.undoDepth(), dupId = dup.id;
  ok(D5.ops.remove(dupId) && !M5.findClip(D5.project(), dupId) && D5.state().sel === null && D5.state().anote.indexOf("戻せます") >= 0, "delete a clip (says it can be undone)");
  ok(D5.ops.undo() && M5.findClip(D5.project(), dupId) && M5.findClip(D5.project(), dupId).clip.ext.name === "サビ" && D5.undoDepth() === depth, "undo brings the deleted clip back");
  ok(D5.ops.undo() && D5.project().tracks[1].id === t3.id, "undo also reverts a track move");
  // ピアノロールの ↶ とアレンジの ↶ は同じ列
  D5.openRoll(c3.id); var dd = D5.undoDepth(); D5.edit.add(BAR, 70);
  ok(D5.undoDepth() === dd + 1 && D5.roll().undo === D5.roll().undo && D5.roll().undo.length === dd + 1, "piano roll edits use the same undo list");
  D5.edit.undo(); D5.closeRoll();
  ok(M5.findClip(D5.project(), c3.id).clip.notes.length === 3, "undo in the roll restores the clip");
  // 保存 → 読みなおし（ページの再読みこみと同じ）→ 同じ曲 → 鳴る
  D5.flushSave();
  var snapZ = JSON.stringify(D5.project());
  var z2 = D5.reload();
  ok(JSON.stringify(z2) === snapZ && D5.saveState().status === "saved" && D5.undoDepth() === 0, "save and reload: the arranged song is identical (undo list starts empty)");
  D5.clearLog(); D5.play(); run5(9 * 2 + 1);
  ok(D5.log().filter(function (x) { return x.track === t3.id; }).length === 6, "the reloaded arrangement plays the same notes");
  D5.stop();
  // JSON
  var ex5 = D5.proj.exportJson(), im5 = D5.proj.importText(ex5.text);
  ok(im5.ok && JSON.stringify(D5.project().tracks) === JSON.stringify(z2.tracks) && D5.project().id !== z2.id, "JSON export / import keeps tracks and clips");
  // 見本・v2.37 の曲は変わっていない
  ok(S5[K5 + ":p:" + fx.record.project.id] === JSON.stringify(fx.record), "the v2.37 song in storage was not changed");
  ok(S5.ultimateGorillaSaveV2 === rpg5 && Object.keys(S5).every(function (k) { return k === "ultimateGorillaSaveV2" || k.indexOf(K5) === 0; }), "the RPG save is untouched");
  // 16 本まで
  var cnt = D5.project().tracks.length, added = 0;
  while (D5.ops.addTrack()) { added++; if (added > 20) { break; } }
  ok(D5.project().tracks.length === M5.MAX_TRACKS && D5.state().anote.indexOf("16 本まで") >= 0, "tracks are limited to 16", [cnt, added]);
  A5.stop();
  D5.reset();

  // ================= 9A-6: ミキサー Lite・トラックの削除（§341）=================
  var e6 = H.load(), W6 = e6.window, M6 = W6.UGDawModel, D6 = W6.UGDaw, A6 = W6.UGArcade, S6 = e6.store, K6 = M6.STORE_KEY, C6 = e6.counters;
  S6.ultimateGorillaSaveV2 = JSON.stringify({ hero: "gorilla", lv: 9 });
  var rpg6 = S6.ultimateGorillaSaveV2;
  // 開いただけでは保存を書きかえない（v2.37 の曲）
  S6[K6] = JSON.stringify(fx.index);
  S6[K6 + ":p:" + fx.record.project.id] = JSON.stringify(fx.record);
  var keys0 = JSON.stringify(Object.keys(S6).sort().map(function (k) { return [k, S6[k]]; }));
  var R6 = H.makeEl("div");
  D6.reset(); A6.start("daw", R6, {});
  ok(D6.project().id === fx.record.project.id && D6.project().master.vol === 80, "v2.37 song opens (master.vol 80)");
  D6.showMixer(); A6.stop(); D6.reset(); A6.start("daw", R6, {});
  ok(JSON.stringify(Object.keys(S6).sort().map(function (k) { return [k, S6[k]]; })) === keys0, "opening a saved song (and the mixer) writes nothing");
  // 左右（StereoPanner）は仮の Web Audio に無いので、ここで用意して値を確かめる
  var ac6 = W6.UGMelody.audioInit(), pans = [];
  ac6.createStereoPanner = function () { var n = { connect: function () {}, disconnect: function () {}, pan: { value: 0, setTargetAtTime: function (v, t, tau) { n.pan.value = v; pans.push({ v: v, tau: tau }); } } }; return n; };
  var rpgMaster0 = W6.UGMelody.audio.master.gain.value;
  var p6 = D6.proj.create("demo"), L6 = p6.tracks[0], B6 = p6.tracks[1];
  D6.play();
  var P6 = D6.player(), mst = P6.mix.__master, mxL = P6.mix[L6.id], mxB = P6.mix[B6.id];
  ok(mst && mst.bus.gain.value === 0.8 && mst.dry && mst.dry.gain.value === 0.8, "DAW master gain = master.vol / 100 (80 → 0.8)", mst && mst.bus.gain.value);
  ok(mxL.main.g.gain.value === 0.8 && mxL.main.pn && mxL.main.pn.pan.value === 0, "track gain = vol / 100, pan = 0 at start");
  function lastTarget(name) { var a = C6.targets.filter(function (x) { return x.name === name; }); return a[a.length - 1]; }
  ok(D6.mixer.setVol(L6.id, 0) && L6.vol === 0 && lastTarget("gain").v === 0 && lastTarget("gain").tau === 0.01, "volume 0 while playing: smooth ramp (10 ms) to 0");
  ok(D6.mixer.resetTrack(L6.id) && L6.vol === 80 && L6.pan === 0 && lastTarget("gain").v === 0.8, "↺ resets volume to 80 and pan to C");
  D6.mixer.setPan(L6.id, -1);
  ok(L6.pan === -1 && pans.length && pans[pans.length - 1].v === -1 && pans[pans.length - 1].tau === 0.01 && D6.panText(-1) === "L100", "pan left: StereoPanner pan → −1 (smooth), shown as L100");
  D6.mixer.setPan(B6.id, 0.37);
  ok(B6.pan === 0.37 && pans[pans.length - 1].v === 0.37 && D6.panText(0.37) === "R37" && D6.panText(0) === "C", "pan right 37: R37");
  D6.mixer.setPan(L6.id, 5); ok(L6.pan === 1, "pan is clamped to −1…1");
  var lg = [], st0 = mxL.main.g.gain.setTargetAtTime; mxL.main.g.gain.setTargetAtTime = function (v, t, tau) { lg.push(v); return st0.call(this, v, t, tau); };
  D6.mixer.setVol(L6.id, 50); L6.mute = true; D6.updateMix();
  ok(lg.join() === "0.5,0", "mute wins over volume (lead gain 0.5 → 0)", lg);
  L6.mute = false; D6.updateMix();
  ok(lg[lg.length - 1] === 0.5, "unmute: back to volume 50 (0.5)", lg);
  D6.mixer.setMaster(0);
  ok(p6.master.vol === 0 && lastTarget("gain").v === 0, "master 0: DAW master gain → 0 (silent)");
  D6.mixer.setMaster(100);
  ok(p6.master.vol === 100 && lastTarget("gain").v === 1, "master 100: gain 1");
  ok(W6.UGMelody.audio.master.gain.value === rpgMaster0, "the shared (RPG / other games) master volume is not changed");
  D6.mixer.commit(); D6.stop();
  ok(!D6.isPlaying() && !D6.player(), "stop clears the player");
  // ミキサーの画面
  D6.showMixer();
  var mh = R6.innerHTML;
  ok(mh.indexOf("DAW のマスター") >= 0 && (mh.match(/data-mxv="/g) || []).length === 3 && (mh.match(/data-mxp="/g) || []).length === 2 && mh.indexOf('value="50"') >= 0 && mh.indexOf(">R100<") >= 0 && mh.indexOf("data-mxm=") >= 0 && mh.indexOf("アレンジ") >= 0, "mixer screen: master + a volume and pan fader per track with values, M/S, back");
  // 保存 → 読みなおし・JSON
  D6.flushSave();
  var q6 = D6.reload();
  ok(q6.tracks[0].vol === 50 && q6.tracks[0].pan === 1 && q6.tracks[1].pan === 0.37 && q6.master.vol === 100, "volume, pan and master are saved and come back after reload");
  var ex6 = D6.proj.exportJson(), im6 = D6.proj.importText(ex6.text);
  ok(im6.ok && D6.project().tracks[0].vol === 50 && D6.project().tracks[1].pan === 0.37 && D6.project().master.vol === 100, "JSON keeps volume, pan and master");
  // トラックの削除
  var p7 = D6.proj.create("demo"), T7 = p7.tracks[1], before7 = JSON.stringify(p7.tracks), u0 = D6.undoDepth();
  p7.tracks[1].vol = 33; p7.tracks[1].pan = -0.5; p7.tracks[1].instrument = M6.synthInstrument("bell"); before7 = JSON.stringify(p7.tracks);
  D6.select("track", T7.id);
  ok(R6.innerHTML.indexOf("トラックを削除") >= 0, "selected track shows a delete button");
  D6.askDelete(T7.id);
  ok(R6.innerHTML.indexOf("「<b>ベース</b>」を削除します。中のクリップ 2 個（音符 36 個）も消えます") >= 0 && R6.innerHTML.indexOf('data-tr="delYes"') >= 0 && R6.innerHTML.indexOf('data-tr="delNo"') >= 0, "the confirmation names the track and says its clips and notes go too");
  D6.play();
  ok(D6.ops.deleteTrack(T7.id) && p7.tracks.length === 1 && !M6.findTrack(p7, T7.id) && !D6.isPlaying() && D6.undoDepth() === u0 + 1 && D6.state().anote.indexOf("戻せます") >= 0, "delete while playing: playback stops, the track is gone, undo is possible");
  ok(D6.ops.deleteTrack(p7.tracks[0].id) === false && p7.tracks.length === 1 && D6.state().anote.indexOf("最後の 1 本") >= 0, "the last track cannot be deleted (said why)");
  ok(D6.ops.undo() && JSON.stringify(D6.project().tracks) === before7, "undo restores the track with clips, notes, instrument, volume and pan");
  var rt = M6.findTrack(D6.project(), T7.id); rt.clips[0].notes[0][2] = 1;
  ok(D6.undoDepth() === u0 && JSON.parse(before7)[1].clips[0].notes[0][2] !== 1, "the restored data is not shared with anything kept for undo");
  rt.clips[0].notes[0][2] = JSON.parse(before7)[1].clips[0].notes[0][2];
  D6.ops.deleteTrack(T7.id); D6.flushSave();
  ok(D6.reload().tracks.length === 1, "a deleted track stays deleted after reload");
  D6.ops.undo();
  ok(D6.project().tracks.length === 1, "reload empties the undo list (nothing to undo)");
  ok(S6.ultimateGorillaSaveV2 === rpg6 && Object.keys(S6).every(function (k) { return k === "ultimateGorillaSaveV2" || k.indexOf(K6) === 0; }) && S6[K6 + ":p:" + fx.record.project.id] === JSON.stringify(fx.record), "RPG save and the old v2.37 song are untouched");
  A6.stop();
  D6.reset();

  // ================= 9A-7: ドラムトラックと 16 ステップ（§341）=================
  var e7 = H.load(), W7 = e7.window, M7 = W7.UGDawModel, D7 = W7.UGDaw, A7 = W7.UGArcade, S7 = e7.store, K7 = M7.STORE_KEY, STEP = M7.STEP;
  S7.ultimateGorillaSaveV2 = JSON.stringify({ hero: "gorilla", lv: 3 }); S7.ultimateGorillaUkuleleSeqV1 = JSON.stringify({ songs: [] });
  var rpg7 = S7.ultimateGorillaSaveV2, uke7 = S7.ultimateGorillaUkuleleSeqV1;
  ok(STEP === 240 && M7.DRUM_KIT.map(function (k) { return k[0]; }).join() === "36,38,39,42,46", "1 step = 240 ticks; kit = kick 36, snare 38, clap 39, closed hat 42, open hat 46 (GM numbers)");
  // モデル
  var pd = M7.emptyProject(1), dt = M7.addDrumTrack(pd), dc = dt.clips[0];
  ok(dt.kind === "midi" && dt.instrument.type === "drum" && M7.isDrum(dt) && !M7.isDrum(pd.tracks[0]) && dt.clips.length === 1 && dc.len === 4 * PPQ && M7.stepCount(dc) === 16 && dc.ext.name === "パターン 1" && dt.name === "ドラム", "drum track = midi track with instrument {type:'drum'} and a 1-bar pattern (16 steps)");
  ok(M7.toggleStep(dc, 36, 4) === true && JSON.stringify(dc.notes) === "[[960,0,36,0.85]]" && M7.toggleStep(dc, 36, 4) === false && dc.notes.length === 0 && M7.toggleStep(dc, 36, 16) === null, "toggleStep: ON adds [step×240, 0, GM, 0.85]; OFF removes; outside the clip is refused");
  ok(JSON.stringify(M7.clean(JSON.parse(JSON.stringify(pd)))) === JSON.stringify(pd), "a song with a drum track round-trips through clean() (schemaVersion 1, no new fields)");
  // 画面: 新しい曲 → ＋ トラック（ドラム）→ パターン
  var R7 = H.makeEl("div");
  D7.reset(); A7.start("daw", R7, {});
  var p8 = D7.proj.create("empty");
  D7.select(null);
  var drumT = D7.ops.addTrack("drum");
  ok(drumT && M7.isDrum(drumT) && p8.tracks.length === 3 && R7.innerHTML.indexOf("daw-drumlab") >= 0, "＋ トラック → ドラム adds a drum track (no synth preset select)");
  var pat = drumT.clips[0];
  ok(D7.openEditor(pat.id) && D7.state().view === "steps" && (R7.innerHTML.match(/class="ds-cell/g) || []).length === 5 * 16 && R7.innerHTML.indexOf("キック") >= 0 && R7.innerHTML.indexOf("ハイハット（開）") >= 0, "a drum clip opens the 16-step grid (5 rows × 16)");
  var u7 = D7.undoDepth(), j7;
  for (j7 = 0; j7 < 16; j7 += 4) { D7.steps.toggle(36, j7); }        // キック 4 つ打ち
  D7.steps.toggle(38, 4); D7.steps.toggle(38, 12);                   // スネア 2・4 拍目
  for (j7 = 0; j7 < 16; j7 += 2) { D7.steps.toggle(42, j7); }        // ハイハット 8 分
  pat = M7.findClip(D7.project(), pat.id).clip;
  ok(pat.notes.length === 4 + 2 + 8 && D7.undoDepth() === u7 + 14, "kick ×4, snare on 2 & 4, hats in 8ths = 14 notes (14 undo steps)");
  ok(D7.edit.undo() && M7.findClip(D7.project(), pat.id).clip.notes.length === 13 && D7.state().view === "steps", "undo removes the last step and stays in the step view");
  D7.steps.toggle(42, 14);
  // 再生: UGMelody.drum の呼び出しを記録（時刻・GM の番号・強さ・出口）
  var calls = [], drum0 = W7.UGMelody.drum;
  W7.UGMelody.drum = function (ac, m, t, lv, dest) { calls.push({ m: m, t: t, lv: lv, dest: dest }); return drum0.apply(this, arguments); };
  var leadT = D7.project().tracks[0], leadC = leadT.clips[0];
  leadC.notes.push([0, 480, 72, 0.8], [4 * STEP, 480, 74, 0.8]);
  D7.setLoop(true);
  D7.clearLog(); D7.play();
  var P7 = D7.player(), ac7 = P7.ac, t07 = P7.segs[0].t0, spb7 = 60 / 120, g7 = 0;
  function run7(sec) { var end = ac7.currentTime + sec; g7 = 0; while (ac7.currentTime < end && g7++ < 20000) { ac7.currentTime += 0.025; D7.pump(); } }
  run7(2.2);
  var dk = calls.filter(function (c) { return c.m === 36; }).slice(0, 4), ds = calls.filter(function (c) { return c.m === 38; }).slice(0, 2), dh = calls.filter(function (c) { return c.m === 42; }).slice(0, 8);
  function near(a, b) { return Math.abs(a - b) < 1e-6; }
  ok(dk.length === 4 && dk.every(function (c, i) { return near(c.t, t07 + i * 4 * STEP / PPQ * spb7); }), "4. kicks at 0, 0.5, 1.0, 1.5 s (120 BPM)", dk.map(function (c) { return (c.t - t07).toFixed(4); }));
  ok(ds.length === 2 && near(ds[0].t, t07 + 0.5) && near(ds[1].t, t07 + 1.5), "4. snares on beats 2 and 4", ds.map(function (c) { return (c.t - t07).toFixed(4); }));
  ok(dh.length === 8 && dh.every(function (c, i) { return near(c.t, t07 + i * 0.25); }), "4. hats every 8th (0.25 s)", dh.map(function (c) { return (c.t - t07).toFixed(4); }));
  ok(calls.every(function (c) { return c.lv === 0.85 && c.dest === P7.mix[drumT.id].main.g; }), "drums go to the drum track's own output (volume → pan → DAW master), velocity 0.85");
  var lg7 = D7.log().filter(function (x) { return x.track === leadT.id && x.pass === 0; });
  ok(lg7.length === 2 && near(lg7[0].when, dk[0].t) && near(lg7[1].when, ds[0].t), "5. lead notes start exactly with the kick / snare (same clock)");
  ok(P7.mix[drumT.id].syn === null && P7.mix[leadT.id] !== P7.mix[drumT.id], "no SynthTrack is made for a drum track");
  // ループ（8 小節のループ・パターンは 1 小節目だけ）: 次の回の頭のキック
  run7(16 + 0.5);
  var k2 = calls.filter(function (c) { return c.m === 36; });
  ok(k2.length === 8 && near(k2[4].t, t07 + 16), "6. loop: the next pass starts with a kick exactly at the loop end (no double, no gap)", k2.map(function (c) { return (c.t - t07).toFixed(3); }));
  // BPM を変える
  D7.stop(); D7.setBpm(240); calls.length = 0; D7.play(); P7 = D7.player(); ac7 = P7.ac; run7(1.2);
  var kb = calls.filter(function (c) { return c.m === 36; });
  ok(kb.length === 4 && near(kb[1].t - kb[0].t, 0.25) && near(kb[3].t - kb[0].t, 0.75), "6. BPM 240: kicks every 0.25 s", kb.map(function (c) { return c.t.toFixed(3); }));
  D7.setBpm(120);
  // M／S・音量・パン（ドラムのトラックも同じ出口）
  var gl = [], dg = P7.mix[drumT.id].main.g, st7 = dg.gain.setTargetAtTime;
  dg.gain.setTargetAtTime = function (v, t, tau) { gl.push(v); return st7.call(this, v, t, tau); };
  drumT = M7.findTrack(D7.project(), drumT.id);
  drumT.mute = true; D7.updateMix(); drumT.mute = false; D7.updateMix();
  D7.mixer.setVol(drumT.id, 40);
  leadT = D7.project().tracks[0]; leadT.solo = true; D7.updateMix(); leadT.solo = false; D7.updateMix();
  ok(gl.join() === "0,0.8,0.4,0,0.4", "7. drum track gain: mute 0 → 0.8 → volume 40 → solo on another track 0 → 0.4", gl);
  calls.length = 0; drumT.mute = true; D7.updateMix(); D7.clearLog(); run7(1.5);
  ok(calls.length === 0, "7. a muted drum track schedules nothing");
  drumT.mute = false; D7.updateMix();
  // 止める → 出口は 0 へ（先に予約した音も残らない）
  var gl2 = [];
  dg.gain.setTargetAtTime = function (v, t, tau) { gl2.push(v); return st7.call(this, v, t, tau); };
  D7.stop();
  ok(!D7.isPlaying() && gl2[gl2.length - 1] === 0, "13. stop ramps the drum output to 0 before disconnecting");
  W7.UGMelody.drum = drum0;
  // 保存 → 読みなおし・JSON
  D7.flushSave();
  var before8 = JSON.stringify(D7.project());
  var r8 = D7.reload();
  ok(JSON.stringify(r8) === before8 && M7.isDrum(r8.tracks[2]) && r8.tracks[2].clips[0].notes.length === 14, "9. the pattern is saved and comes back after reload");
  var ex8 = D7.proj.exportJson(), ex8o = JSON.parse(ex8.text), im8 = D7.proj.importText(ex8.text);
  ok(ex8o.schemaVersion === 1 && ex8o.project.tracks[2].instrument.type === "drum" && im8.ok && JSON.stringify(D7.project().tracks) === JSON.stringify(r8.tracks), "10. JSON keeps the drum track and pattern (schemaVersion 1)");
  // 複製・移動しても正しい位置で鳴る
  var dTr = D7.project().tracks[2], dup8 = D7.ops.duplicate(dTr.clips[0].id);
  ok(dup8 && dup8.start === 4 * PPQ && dup8.len === 4 * PPQ && JSON.stringify(dup8.notes) === JSON.stringify(dTr.clips[0].notes), "a duplicated pattern goes to bar 2");
  ok(M7.noteEvents(D7.project(), 4 * PPQ, 8 * PPQ).filter(function (e) { return e.track === dTr.id && e.m === 36; }).map(function (e) { return e.tick; }).join() === "3840,4800,5760,6720", "the duplicate's kicks are at bar 2 (song ticks)");
  // 古い版（v2.39 まで）の扱い: instrument はそのまま残り、シンセの音色ではないので鳴らさない
  var oldView = M7.clean(JSON.parse(ex8.text).project);
  ok(oldView.tracks[2].instrument.type === "drum" && oldView.tracks[2].instrument.kit === "gm", "older versions keep the drum instrument data as is (they skip it when playing)");
  // RPG・ウクレレのセーブは変わらない
  ok(S7.ultimateGorillaSaveV2 === rpg7 && S7.ultimateGorillaUkuleleSeqV1 === uke7 && Object.keys(S7).every(function (k) { return k === "ultimateGorillaSaveV2" || k === "ultimateGorillaUkuleleSeqV1" || k.indexOf(K7) === 0; }), "RPG and ukulele saves are untouched");
  A7.stop();
  ok(!D7.isPlaying() && D7.state().view === "arr", "13. leaving the screen: stopped");
  D7.reset();

  // ================= 9A-8: ドラムの表現（強さ・スイング・ハイハットの開閉・パターン）=================
  var e9 = H.load(), W9 = e9.window, M9 = W9.UGDawModel, D9 = W9.UGDaw, A9 = W9.UGArcade, S9 = e9.store, K9 = M9.STORE_KEY;
  S9.ultimateGorillaSaveV2 = JSON.stringify({ hero: "gorilla", lv: 4 }); var rpg9 = S9.ultimateGorillaSaveV2;
  // モデル
  ok(M9.swingDelay(240, 50) === 60 && M9.swingDelay(240, 100) === 120 && M9.swingDelay(720, 100) === 120 && M9.swingDelay(0, 100) === 0 && M9.swingDelay(480, 100) === 0 && M9.swingDelay(960, 100) === 0 && M9.swingDelay(250, 100) === 0 && M9.swingDelay(240, 0) === 0, "swingDelay: only the off 16th of each 8th (rel % 480 = 240), up to 120 ticks at 100%");
  ok(M9.swingOf({ ext: { swing: 150 } }) === 100 && M9.swingOf({ ext: {} }) === 0 && M9.swingOf({}) === 0 && M9.swingOf({ ext: { swing: "x" } }) === 0, "swingOf clamps to 0–100, missing = 0");
  var pc = { type: "midi", start: 0, len: 3840, offset: 0, notes: [[0, 0, 36, 0.85], [10, 0, 36, 0.5], [0, 0, 50, 0.7]] };
  ok(M9.setStepVel(pc, 36, 0, 0.3)[3] === 0.3 && M9.setStepVel(pc, 36, 0, 9)[3] === 1 && M9.setStepVel(pc, 36, 0, 0)[3] === 0.05 && M9.setStepVel(pc, 38, 0, 0.5) === null, "setStepVel clamps to 0.05–1 and only works on an existing step");
  M9.applyPattern(pc, "eight");
  var hats = pc.notes.filter(function (n) { return n[2] === 42; });
  ok(hats.length === 8 && hats.map(function (n) { return n[3]; }).join() === "0.85,0.6,0.85,0.6,0.85,0.6,0.85,0.6" && pc.notes.some(function (n) { return n[0] === 10 && n[2] === 36; }) && pc.notes.some(function (n) { return n[2] === 50; }) && pc.notes.filter(function (n) { return n[2] === 36 && n[0] % 240 === 0; }).map(function (n) { return n[0]; }).join() === "0,1920,2400", "8-beat preset: hats on/off-beat 0.85/0.6, kicks 1/9/11; off-grid and other notes are kept");
  M9.applyPattern(pc, "clear");
  ok(pc.notes.length === 2, "clear removes only the 5-row grid notes");
  // 画面・再生
  var R9 = H.makeEl("div"); D9.reset(); A9.start("daw", R9, {});
  var p9 = D9.proj.create("empty"), dr9 = D9.ops.addTrack("drum"), pat9 = dr9.clips[0];
  D9.openEditor(pat9.id);
  ok(R9.innerHTML.indexOf('data-sq="modeVel"') >= 0 && R9.innerHTML.indexOf("ds-swing") >= 0 && R9.innerHTML.indexOf('data-pat="eight"') >= 0 && R9.innerHTML.indexOf(">0%<") >= 0, "step screen: tap/strength switch, swing slider (0%), pattern buttons");
  ok(D9.steps.pattern("sixteen") && M9.findClip(D9.project(), pat9.id).clip.notes.length === 3 + 2 + 16, "16-beat preset fills the pattern (undoable)");
  var calls9 = [], drum9 = W9.UGMelody.drum;
  W9.UGMelody.drum = function (ac, m, t, lv, dest) { calls9.push({ m: m, t: t, lv: lv, dest: dest }); return drum9.apply(this, arguments); };
  function play9(sec) { D9.clearLog(); calls9.length = 0; var c = M9.findClip(D9.project(), pat9.id).clip; D9.play({ clip: c.id, a: c.start, b: c.start + c.len, loop: true }); var P = D9.player(), ac = P.ac, end = ac.currentTime + sec, g = 0; while (ac.currentTime < end && g++ < 20000) { ac.currentTime += 0.025; D9.pump(); } var t0 = P.segs[0].t0; D9.stop(); return t0; }
  function rel(c, t0) { return Math.round((c.t - t0) * 100000) / 100000; }
  // 強さ
  D9.steps.mode("vel");
  ok(D9.steps.pick(36, 0) && D9.steps.setVel(0.3) === 0.3 && D9.steps.pick(36, 6) && D9.steps.setVel(1) === 1, "pick a step and set strength 0.3 / 1.0");
  D9.openEditor(pat9.id); D9.steps.mode("vel"); D9.steps.pick(36, 0);
  ok(R9.innerHTML.indexOf("--v:0.3;") >= 0 && R9.innerHTML.indexOf("--v:1;") >= 0 && R9.innerHTML.indexOf(">30<") >= 0, "cells show the strength (fill height and number)");
  var t09 = play9(1.0), kk = calls9.filter(function (c) { return c.m === 36; });
  ok(kk.length >= 2 && kk[0].lv === 0.3 && kk[1].lv === 1, "the strength (NoteEvent v) is passed as the drum level: 0.3 and 1.0", kk.map(function (c) { return c.lv; }));
  // スイング 0% ＝ まっすぐ（v2.40 と同じ）
  var h0 = calls9.filter(function (c) { return c.m === 42; }).slice(0, 8).map(function (c) { return rel(c, t09); });
  ok(h0.join() === "0,0.125,0.25,0.375,0.5,0.625,0.75,0.875", "swing 0%: hats exactly on the 16th grid (same as before)", h0);
  // スイング 50% ／ 100%
  D9.steps.setSwing(50);
  var t50 = play9(1.0), h50 = calls9.filter(function (c) { return c.m === 42; }).slice(0, 8).map(function (c) { return rel(c, t50); });
  ok(h50.join() === "0,0.15625,0.25,0.40625,0.5,0.65625,0.75,0.90625", "swing 50%: off 16ths +60 ticks (+0.03125 s at 120 BPM), others unchanged", h50);
  D9.steps.setSwing(100);
  var t100 = play9(2.6), h100 = calls9.filter(function (c) { return c.m === 42; }).map(function (c) { return rel(c, t100); });
  ok(h100.slice(0, 4).join() === "0,0.1875,0.25,0.4375" && h100[15] === 1.9375 && h100[16] === 2, "swing 100%: +120 ticks; the last off 16th (1.9375 s) stays before the loop end and the next pass starts exactly at 2 s", h100.slice(13, 18));
  var keys9 = {}, dup9 = 0; D9.log().forEach(function (x) { var k = x.m + ":" + x.tick + ":" + x.pass; if (keys9[k]) { dup9++; } keys9[k] = 1; });
  ok(dup9 === 0, "no doubled hits across the loop boundary");
  D9.setBpm(240);
  var t240 = play9(0.6), h240 = calls9.filter(function (c) { return c.m === 42; }).slice(0, 4).map(function (c) { return rel(c, t240); });
  ok(h240.join() === "0,0.09375,0.125,0.21875", "BPM 240: the swing keeps the same ratio (+0.03125 s)", h240);
  D9.setBpm(120); D9.steps.setSwing(0);
  // ハイハットの開閉（同じトラックの中だけ）
  var cc = M9.findClip(D9.project(), pat9.id).clip; cc.notes = [];
  [[46, 0], [42, 2], [36, 4], [38, 8], [39, 9], [46, 12], [46, 14]].forEach(function (x) { M9.toggleStep(cc, x[0], x[1]); });
  var tg0 = e9.counters.targets.length;
  var tch = play9(1.95), LG = D9.log().filter(function (x) { return x.pass === 0; });
  var mainG = null;
  ok(LG.filter(function (x) { return x.choked !== null; }).map(function (x) { return x.m + "@" + x.tick + "<" + x.choked; }).join() === "42@480<0,46@3360<2880", "closed hat stops the earlier open hat; a new open hat stops the previous one; kick / snare / clap stop nothing", LG.map(function (x) { return x.m + ":" + x.choked; }));
  var opens = calls9.filter(function (c) { return c.m === 46; }), others = calls9.filter(function (c) { return c.m !== 46; });
  ok(opens.length >= 2 && opens[0].dest !== others[0].dest && opens[0].dest !== opens[1].dest && others.every(function (c) { return c.dest === others[0].dest; }), "each open hat goes through its own small gain; other drums go straight to the track output");
  var chk = e9.counters.targets.slice(tg0).filter(function (x) { return x.name === "gain" && x.v === 0 && x.tau === 0.015; });
  ok(chk.length >= 2, "the choke is a 15 ms fade of that open-hat gain", chk.length);
  W9.UGMelody.drum = drum9;
  // ↶・保存・読みなおし・JSON
  D9.openEditor(pat9.id); D9.steps.mode("vel"); D9.steps.pick(42, 2);
  var u9 = D9.undoDepth(); D9.steps.setVel(0.45);
  ok(D9.undoDepth() === u9 + 1 && D9.edit.undo() && M9.findStep(M9.findClip(D9.project(), pat9.id).clip, 42, 2)[3] === 0.85, "undo restores the strength");
  D9.steps.setSwing(37); var u10 = D9.undoDepth();
  ok(M9.swingOf(M9.findTrack(D9.project(), dr9.id)) === 37 && D9.edit.undo() && M9.swingOf(M9.findTrack(D9.project(), dr9.id)) === 0 && D9.undoDepth() === u10 - 1, "undo restores the swing");
  D9.steps.setSwing(42); D9.openEditor(pat9.id); D9.steps.mode("vel"); D9.steps.pick(36, 4); D9.steps.setVel(0.7);
  D9.flushSave();
  var snap9 = JSON.stringify(D9.project()), rl9 = D9.reload();
  ok(JSON.stringify(rl9) === snap9 && rl9.tracks[2].ext.swing === 42 && M9.findStep(rl9.tracks[2].clips[0], 36, 4)[3] === 0.7, "strength and swing are saved and come back after reload (track ext.swing)");
  var ex9 = D9.proj.exportJson(), exo9 = JSON.parse(ex9.text), im9 = D9.proj.importText(ex9.text);
  ok(exo9.schemaVersion === 1 && exo9.project.tracks[2].ext.swing === 42 && im9.ok && JSON.stringify(D9.project().tracks) === JSON.stringify(rl9.tracks), "JSON keeps strength and swing (schemaVersion 1)");
  ok(M9.clean(exo9.project).tracks[2].ext.swing === 42, "older versions keep ext.swing as is (they play it straight)");
  ok(S9.ultimateGorillaSaveV2 === rpg9 && Object.keys(S9).every(function (k) { return k === "ultimateGorillaSaveV2" || k.indexOf(K9) === 0; }), "RPG save untouched");
  A9.stop();
  D9.reset();

  // ================= 9A-9: WAV の書き出し（§341）=================
  var eW = H.load(), WW = eW.window, MW = eW.window.UGDawModel, DW = WW.UGDaw, AW = WW.UGArcade, SW = eW.store, CW = eW.counters;
  SW.ultimateGorillaSaveV2 = JSON.stringify({ hero: "gorilla", lv: 5 }); var rpgW = SW.ultimateGorillaSaveV2;
  ok(typeof WW.UGMelody.buildFx === "function" && DW.wav.RATE === 44100 && DW.wav.MAX === 60 && DW.wav.TAIL === 3, "UGMelody.buildFx is exported; WAV is 44.1 kHz, up to 60 s of music + 3 s tail");
  var RW = H.makeEl("div"); DW.reset(); AW.start("daw", RW, {});
  var pw = DW.proj.create("demo"); // 8 小節・110 BPM・リードとベース
  var plw = DW.wav.plan();
  ok(plw.ok && plw.endTick === 8 * 4 * PPQ && plw.bars === 8 && Math.abs(plw.music - 32 * 60 / 110) < 1e-9 && Math.abs(plw.sec - (32 * 60 / 110 + 3)) < 1e-9 && plw.frames === Math.ceil(plw.sec * 44100) && plw.bytes === 44 + plw.frames * 4, "plan: bars 1–8, music length from the tempo map, + 3 s tail, frames and bytes", plw);
  DW.setLoop(true); DW.play();
  var audio0 = { ctx: WW.UGMelody.audio.ctx, master: WW.UGMelody.audio.master, bus: WW.UGMelody.audio.bus };
  var pwJson = JSON.stringify(DW.project()), saveKeys = JSON.stringify(Object.keys(SW).sort().map(function (k) { return [k, SW[k]]; }));
  var offN = CW.offline.length, doneW = 0;
  ok(DW.wav.start(function () { doneW++; }) === true, "start the export");
  ok(!DW.isPlaying() && doneW === 1 && DW.wav.state().state === "done" && CW.offline.length === offN + 1, "playback is stopped first; one OfflineAudioContext is rendered");
  var off0 = CW.offline[offN];
  ok(off0.channels === 2 && off0.sampleRate === 44100 && off0.len === plw.frames, "the OfflineAudioContext is 2 ch, 44,100 Hz, exactly the planned frames");
  ok(WW.UGMelody.audio.ctx === audio0.ctx && WW.UGMelody.audio.master === audio0.master && WW.UGMelody.audio.bus === audio0.bus && DW.player() === null, "the real-time audio (UGMelody.audio) and the player are restored afterwards");
  var LW = DW.wav.state().log, evW = MW.noteEvents(DW.project(), 0, plw.endTick);
  ok(LW.length === evW.length && LW.length === 69 && LW.every(function (x) { return x.pass === 0 && x.ok; }), "every note of the song is rendered once (69), loop ignored", LW.length);
  var bad = LW.filter(function (x) { return Math.abs(x.when - MW.tickToSec(DW.project(), x.tick)) > 1e-9; });
  ok(bad.length === 0 && LW[0].when === 0, "note times in the WAV = tick → seconds of the tempo map (the same calculation as playback), starting at 0 s");
  ok(JSON.stringify(DW.project()) === pwJson && JSON.stringify(Object.keys(SW).sort().map(function (k) { return [k, SW[k]]; })) === saveKeys, "the export changes neither the song nor the saved data");
  // WAV のヘッダー
  var blob = DW.wav.state().blob, ab = blob.parts[0], dv = new DataView(ab);
  function tag(o) { return String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3)); }
  var nFrames = (ab.byteLength - 44) / 4;
  ok(tag(0) === "RIFF" && dv.getUint32(4, true) === ab.byteLength - 8 && tag(8) === "WAVE" && tag(12) === "fmt " && dv.getUint16(20, true) === 1 && dv.getUint16(22, true) === 2 && dv.getUint32(24, true) === 44100 && dv.getUint32(28, true) === 44100 * 4 && dv.getUint16(32, true) === 4 && dv.getUint16(34, true) === 16 && tag(36) === "data" && dv.getUint32(40, true) === ab.byteLength - 44 && nFrames === Math.round(nFrames), "WAV header: RIFF/WAVE, PCM, 2 ch, 44,100 Hz, 16 bit, chunk sizes match the data", [ab.byteLength, dv.getUint32(24, true)]);
  ok(/^見本からの曲_\d{8}-\d{4}\.wav$/.test(DW.wav.state().name) && DW.wav.state().stats.rate === 44100, "file name from the song name");
  // M／S・スイング・強さ・開閉は再生と同じ（ログ）
  pw = DW.project(); pw.tracks[1].mute = true;
  DW.wav.start();
  ok(DW.wav.state().log.length === 33 && DW.wav.state().log.every(function (x) { return x.track === pw.tracks[0].id; }), "a muted track is not rendered");
  pw.tracks[1].mute = false;
  var dW = DW.ops.addTrack("drum"); DW.openEditor(dW.clips[0].id); DW.steps.pattern("sixteen"); DW.steps.setSwing(100); DW.closeRoll && DW.select(null);
  pw = DW.project();
  // 60 秒をこえる曲は書き出さない（途中で切らない）
  var keepBpm = MW.bpmAt(pw, 0); DW.setBpm(25);
  var offN2 = CW.offline.length;
  ok(DW.wav.start() === false && DW.wav.state().state === "fail" && DW.wav.state().msg.indexOf("60 秒まで") >= 0 && CW.offline.length === offN2, "a song longer than 60 s is refused with the reason (nothing is cut, no buffer is made)");
  DW.setBpm(keepBpm);
  // ドラムのサンプルを待つあいだは 2 つ目を受けつけない
  var busy1 = DW.wav.start();
  ok(busy1 === true && DW.wav.state().busy && DW.wav.start() === false, "only one export at a time (the second is refused while busy)");
  for (var gw = 0; gw < 300 && DW.wav.state().busy; gw++) { await eW.wait(10); } await eW.wait(5); // 重いとき（全部のテスト）でも終わるまで待つ
  var LD = DW.wav.state().log.filter(function (x) { return x.drum; });
  ok(!DW.wav.state().busy && DW.wav.state().state === "done" && LD.length === 21 && LD.filter(function (x) { return x.swing === 120; }).length === 8, "drums are rendered with swing (8 off 16ths × 120 ticks)", [LD.length, LD.filter(function (x) { return x.swing; }).length]);
  // やめる: 描いた結果を捨てる
  var sr0 = WW.OfflineAudioContext.prototype.startRendering;
  WW.OfflineAudioContext.prototype.startRendering = function () { var self = this; return { then: function (ok) { setTimeout(function () { sr0.call(self).then(ok); }, 20); } }; }; // 本物のように後で終わる
  DW.wav.start(); DW.wav.cancel(); for (var gw = 0; gw < 300 && DW.wav.state().busy; gw++) { await eW.wait(10); } await eW.wait(5);
  WW.OfflineAudioContext.prototype.startRendering = sr0;
  ok(DW.wav.state().state === "canceled" && !DW.wav.state().blob, "cancel discards the result");
  // 画面
  DW.showProj();
  ok(RW.innerHTML.indexOf("WAV を書き出す") >= 0 && RW.innerHTML.indexOf("1〜8 小節") >= 0 && RW.innerHTML.indexOf("44.1kHz・16bit・ステレオ") >= 0 && RW.innerHTML.indexOf("やめました") >= 0, "the song screen shows the WAV section (range, size, state)");
  DW.wav.start(); for (var gw = 0; gw < 300 && DW.wav.state().busy; gw++) { await eW.wait(10); } await eW.wait(5); DW.showProj();
  ok(RW.innerHTML.indexOf('data-pj="wavSave"') >= 0 && RW.innerHTML.indexOf("download=") >= 0 && RW.innerHTML.indexOf("44100Hz") >= 0, "after the export: save (share) and download buttons");
  ok(SW.ultimateGorillaSaveV2 === rpgW, "RPG save untouched");
  AW.stop();
  ok(DW.wav.state().state === "idle" && !DW.wav.state().blob, "leaving the screen frees the WAV");
  DW.reset();
  // ================= 9A-10: オーディオトラック（§341）=================
  // テスト用の WAV（16bit などの PCM・自作の波形）
  function makeWav(o) {
    var sr = o.sr || 44100, ch = o.ch || 1, bits = o.bits || 16, n = Math.round((o.sec || 1) * sr), bps = bits / 8, data = n * ch * bps, list = o.list ? 18 : 0, code = o.code || 1;
    var ab = new ArrayBuffer(44 + list + data), v = new DataView(ab), i, c;
    function w4(off, s) { for (var k = 0; k < 4; k++) { v.setUint8(off + k, s.charCodeAt(k)); } }
    w4(0, "RIFF"); v.setUint32(4, ab.byteLength - 8, true); w4(8, "WAVE"); w4(12, "fmt "); v.setUint32(16, 16, true);
    v.setUint16(20, code, true); v.setUint16(22, ch, true); v.setUint32(24, sr, true); v.setUint32(28, sr * ch * bps, true); v.setUint16(32, ch * bps, true); v.setUint16(34, bits, true);
    var o2 = 36;
    if (list) { w4(o2, "LIST"); v.setUint32(o2 + 4, 9, true); o2 += 18; } // 奇数の長さのチャンク（1 バイトの詰め物つき）
    w4(o2, o.noData ? "junk" : "data"); v.setUint32(o2 + 4, data, true);
    var fn = o.fn || function () { return 0; }, base = o2 + 8;
    for (i = 0; i < n; i++) {
      for (c = 0; c < ch; c++) {
        var x = Math.max(-1, Math.min(1, fn(i / sr, c))), at = base + (i * ch + c) * bps;
        if (bits === 16) { v.setInt16(at, Math.round(x * 32767), true); }
        else if (bits === 24) { var q = Math.round(x * 8388607); v.setUint8(at, q & 255); v.setUint8(at + 1, (q >> 8) & 255); v.setUint8(at + 2, (q >> 16) & 255); }
      }
    }
    return ab;
  }
  function tone(f, amp) { return function (t) { return (amp || 0.5) * Math.sin(2 * Math.PI * f * t); }; }
  function nearA(a, b, e) { return Math.abs(a - b) < (e || 1e-6); }
  // まねの IndexedDB（書いたものを写して持つ・非同期・容量不足のまね）
  function fakeIDB() {
    var dbs = {}, api = { writes: 0, failNext: null, data: dbs, opens: 0 };
    function isAB(v) { return Object.prototype.toString.call(v) === "[object ArrayBuffer]"; }
    function clone(v) { if (isAB(v)) { return v.slice(0); } if (v && typeof v === "object") { var o = Array.isArray(v) ? [] : {}, k; for (k in v) { o[k] = clone(v[k]); } return o; } return v; }
    function makeTx(D, mode) {
      var tx = { pending: [], aborted: false }, fail = mode === "readwrite" && api.failNext;
      if (fail) { api.failNext = null; }
      tx.objectStore = function (n) {
        var S = D.stores[n];
        return {
          get: function (k) { var r = {}; setTimeout(function () { r.result = S.rows[k] ? clone(S.rows[k]) : undefined; if (r.onsuccess) { r.onsuccess(); } }, 0); return r; },
          put: function (val) { if (mode !== "readwrite") { throw new Error("ReadOnlyError"); } tx.pending.push([S, val[S.key], clone(val)]); }
        };
      };
      tx.abort = function () { tx.aborted = true; };
      setTimeout(function () {
        if (fail || tx.aborted) { tx.error = { name: fail || "AbortError" }; if (tx.onerror) { tx.onerror(); } if (tx.onabort) { tx.onabort(); } return; }
        tx.pending.forEach(function (x) { x[0].rows[x[1]] = x[2]; api.writes++; });
        if (tx.oncomplete) { tx.oncomplete(); }
      }, 2);
      return tx;
    }
    api.open = function (name) {
      var rq = {};
      api.opens++;
      setTimeout(function () {
        var fresh = !dbs[name];
        if (fresh) { dbs[name] = { stores: {} }; }
        var D = dbs[name];
        rq.result = { objectStoreNames: { contains: function (n) { return !!D.stores[n]; } }, createObjectStore: function (n, o) { D.stores[n] = { key: o.keyPath, rows: {} }; }, close: function () {}, transaction: function (names, mode) { return makeTx(D, mode); } };
        if (fresh && rq.onupgradeneeded) { rq.onupgradeneeded(); }
        if (rq.onsuccess) { rq.onsuccess(); }
      }, 0);
      return rq;
    };
    return api;
  }
  var eA = H.load(), WA = eA.window, MA = WA.UGDawModel, DA = WA.UGDaw, AA = WA.UGArcade, SA = eA.store, CA = eA.counters;
  SA.ultimateGorillaSaveV2 = JSON.stringify({ hero: "gorilla", lv: 7 }); var rpgA = SA.ultimateGorillaSaveV2;
  // --- WAV のヘッダー ---
  var w1 = makeWav({ sr: 44100, ch: 2, sec: 2.5, fn: function (t, c) { return t < 0.01 ? 0.9 : (c ? 0.2 : 0.4) * Math.sin(2 * Math.PI * 330 * t); } });
  var i1 = MA.parseWav(w1);
  ok(i1.ok && i1.fmt === 1 && i1.bits === 16 && i1.ch === 2 && i1.sr === 44100 && i1.frames === 110250 && nearA(i1.sec, 2.5) && i1.dataOffset === 44 && i1.bytes === w1.byteLength, "parseWav: 16 bit stereo 44.1 kHz (frames, seconds, data offset)", i1);
  var w2 = makeWav({ sr: 48000, ch: 1, sec: 1, list: true, fn: tone(220) }), i2 = MA.parseWav(w2);
  ok(i2.ok && i2.ch === 1 && i2.sr === 48000 && i2.frames === 48000 && i2.dataOffset === 44 + 18, "parseWav: mono 48 kHz, walks past an odd-sized LIST chunk", i2);
  var i24 = MA.parseWav(makeWav({ sr: 44100, ch: 1, sec: 0.2, bits: 24 }));
  ok(i24.ok && i24.bits === 24 && i24.frames === 8820, "parseWav: 24 bit PCM is accepted (decoding is up to the browser)");
  function bytes(arr) { var u = new Uint8Array(64), i; for (i = 0; i < arr.length; i++) { u[i] = typeof arr[i] === "string" ? arr[i].charCodeAt(0) : arr[i]; } return u.buffer; }
  var rej = [
    [bytes(["I", "D", "3", 3, 0]), /MP3/], [bytes([0, 0, 0, 0x20, "f", "t", "y", "p", "M", "4", "A"]), /m4a/], [new ArrayBuffer(5), /短すぎ/],
    [makeWav({ code: 2, sec: 0.1 }), /圧縮/], [makeWav({ ch: 3, sec: 0.1 }), /3ch/], [makeWav({ sec: 0.1, noData: true }), /data/]
  ];
  ok(rej.every(function (r) { var x = MA.parseWav(r[0]); return !x.ok && r[1].test(x.why); }), "parseWav refuses MP3 / m4a / short / compressed / 3 ch / no data, with reasons", rej.map(function (r) { return MA.parseWav(r[0]).why; }));
  ok(/大きすぎ/.test(MA.wavLimitWhy(null, 10 * 1024 * 1024 + 1)) && /長すぎ/.test(MA.wavLimitWhy({ sec: 60.5 }, 1000)) && MA.wavLimitWhy({ sec: 60 }, 10 * 1024 * 1024) === "", "limits: 10 MB and 60 s");
  var hA = MA.hashBytes(new Uint8Array(w1)), w1b = w1.slice(0); new Uint8Array(w1b)[5000] ^= 1;
  ok(/^a:[0-9a-f]{16}$/.test(hA) && hA === MA.hashBytes(new Uint8Array(w1.slice(0))) && hA !== MA.hashBytes(new Uint8Array(w1b)), "content hash: 16 hex digits, same bytes → same id, one changed byte → different id", hA);
  var pkc = new Float32Array(1000); pkc[50] = 0.25; pkc[930] = -1;
  var pks = MA.computePeaks([pkc], 10000, 100);
  ok(pks.length === 10 && pks[0] === 128 && pks[9] === 255 && pks[3] === 0, "peaks: 100 per second, square-root scale 0–255", pks);
  // --- トラック・クリップ（データ）---
  var pa = MA.emptyProject(0), ra = MA.addAudioTrack(pa);
  ok(ra.ok && ra.track.kind === "audio" && MA.isAudio(ra.track) && ra.track.instrument.type === "audio" && pa.tracks.length === 3, "addAudioTrack: kind audio, instrument audio");
  MA.addAudioTrack(pa); MA.addAudioTrack(pa); MA.addAudioTrack(pa);
  var ra5 = MA.addAudioTrack(pa);
  ok(!ra5.ok && /4 本/.test(ra5.why) && MA.audioTrackCount(pa) === 4, "at most 4 audio tracks (few simultaneous audio sources)", ra5.why);
  pa.tracks.splice(3, 3);
  var refA = MA.assetRef(i1, "ukulele.wav", hA), ca = MA.addAudioClip(pa, ra.track, null, refA, "ukulele");
  ok(ca && ca.type === "audio" && ca.start === 0 && ca.len === 2 * 4 * PPQ && ca.asset === hA && ca.srcOffset === 0 && ca.gain === 1, "audio clip: 2.5 s at 120 BPM → 2 bars (rounded up), starts at bar 1", ca);
  var cb2 = MA.addAudioClip(pa, ra.track, null, refA, "ukulele");
  ok(cb2.start === 2 * 4 * PPQ && cb2.asset === ca.asset, "a second clip of the same asset goes after the first (shares the asset)");
  var aev = MA.audioEvents(pa, 0, 16 * PPQ, false);
  ok(aev.length === 2 && aev[0].tick === 0 && aev[0].skip === 0 && aev[1].tick === 8 * PPQ && aev[1].end === 16 * PPQ, "audioEvents: clip starts inside the window");
  var aevF = MA.audioEvents(pa, 960, 2000, true), aevN = MA.audioEvents(pa, 960, 2000, false);
  ok(aevF.length === 1 && aevF[0].tick === 960 && aevF[0].skip === 960 && aevN.length === 0, "audioEvents: a fresh segment starts the clip it is inside (skip), otherwise nothing");
  ok(MA.noteEvents(pa, 0, 99999).length === 0, "noteEvents ignores audio tracks");
  ok(/8 個/.test(MA.assetRoomWhy({ assets: [1, 2, 3, 4, 5, 6, 7, 8].map(function () { return { sec: 1 }; }) }, { sec: 1 })) && /120 秒/.test(MA.assetRoomWhy({ assets: [{ sec: 119 }] }, { sec: 2 })) && MA.assetRoomWhy(pa, { sec: 2 }) === "", "per song: 8 assets, 120 s in total");
  pa.assets = [refA, { id: "bad" }, JSON.parse(JSON.stringify(refA)), 5];
  var pc = MA.clean(JSON.parse(JSON.stringify(pa)));
  var pcc = pc.tracks[2].clips[0];
  ok(pc.assets.length === 1 && pc.assets[0].id === hA && pc.tracks[2].kind === "audio" && pcc.type === "audio" && pcc.asset === hA && pcc.len === 8 * PPQ && pcc.notes === undefined, "clean(): bad / duplicated asset refs are dropped; audio track and clip kept", pc.assets.length);
  ok(JSON.stringify(MA.clean(JSON.parse(JSON.stringify(pc)))) === JSON.stringify(pc), "clean() is stable for a project with audio");
  var recA = MA.toRecord(pc, 5), backA = MA.parseRecordText(JSON.stringify(recA));
  ok(backA.ok && JSON.stringify(backA.project.assets) === JSON.stringify(pc.assets) && backA.project.tracks[2].clips.length === 2 && JSON.stringify(recA).indexOf('"data"') < 0 && JSON.stringify(recA).length < 6000, "the saved form keeps placement + asset refs, but no audio data", JSON.stringify(recA).length);

  // --- 画面: IndexedDB が無いとき ---
  var RA = H.makeEl("div"); DA.reset(); AA.start("daw", RA, {});
  DA.proj.create("empty");
  var nTA = DA.project().tracks.length, rNo = "x";
  DA.audio.add(function (r) { rNo = r; });
  ok(rNo === false && DA.project().tracks.length === nTA && /IndexedDB/.test(DA.state().anote), "no IndexedDB: 🎵 オーディオ is refused with the reason, nothing is added", DA.state().anote);
  // --- まねの IndexedDB とデコード ---
  var IDB = fakeIDB(), decodes = 0;
  WA.indexedDB = IDB; DA.audio.forget();
  WA.OfflineAudioContext.prototype.decodeAudioData = function (ab, okCb, ngCb) {
    var info = MA.parseWav(ab), self = this; decodes++;
    setTimeout(function () {
      if (!info.ok || info.bits !== 16) { if (ngCb) { ngCb({ name: "EncodingError" }); } return; } // このまねは 16bit だけ読める
      var v = new DataView(ab), chs = [], c, i;
      for (c = 0; c < info.ch; c++) { chs.push(new Float32Array(info.frames)); }
      for (i = 0; i < info.frames; i++) { for (c = 0; c < info.ch; c++) { chs[c][i] = info.bits === 16 ? v.getInt16(info.dataOffset + (i * info.ch + c) * 2, true) / 32768 : 0; } }
      okCb({ numberOfChannels: info.ch, length: info.frames, sampleRate: info.sr, duration: info.frames / info.sr, getChannelData: function (k) { return chs[k]; }, ctxRate: self.sampleRate });
    }, 1);
    return { catch: function () {} };
  };
  function imp(ab, name, o) { return new Promise(function (r) { DA.audio.importWav(ab, name, o, r); }); }
  function addA() { return new Promise(function (r) { DA.audio.add(r); }); }
  var tA = await addA();
  ok(tA && tA.kind === "audio" && DA.project().tracks.length === nTA + 1 && RA.innerHTML.indexOf("da-audlab") >= 0 && RA.innerHTML.indexOf("WAV を読みこむ") >= 0 && RA.innerHTML.indexOf('data-addwav="' + tA.id + '"') >= 0, "with IndexedDB: ＋ トラック → 🎵 オーディオ adds an audio track (label, WAV button, lane ＋)");
  DA.state().chooseAdd = true; DA.select(null);
  ok(RA.innerHTML.indexOf('data-ar="addSynth"') >= 0 && RA.innerHTML.indexOf('data-ar="addDrum"') >= 0 && RA.innerHTML.indexOf('data-ar="addAudio"') >= 0 && RA.innerHTML.indexOf("オーディオ") >= 0, "＋ トラック offers 🎹 シンセ / 🥁 ドラム / 🎵 オーディオ");
  DA.state().chooseAdd = false; DA.select(null);
  // 読みこむ
  var undo0 = DA.undoDepth(), r1 = await imp(w1, "ukulele.wav", { track: tA.id });
  var P1 = DA.project(), dbr = IDB.data[DA.audio.IDB_NAME];
  ok(r1.ok && r1.clip.start === 0 && r1.clip.len === 2 * 4 * PPQ && r1.clip.asset === hA && P1.assets.length === 1 && P1.assets[0].name === "ukulele.wav" && !r1.reused, "import: a clip at bar 1 (2 bars) and one asset ref", r1.why);
  ok(IDB.writes === 2 && dbr.stores.blobs.rows[hA].data.byteLength === w1.byteLength && dbr.stores.meta.rows[hA].peaks.length === 250 && dbr.stores.meta.rows[hA].hash === hA, "the original WAV (ArrayBuffer) and its meta (peaks 100/s) are in IndexedDB");
  var recS = SA["ultimateGorillaDawV1:p:" + P1.id];
  ok(recS && recS.indexOf(hA) >= 0 && recS.length < 8000 && JSON.parse(recS).project.assets[0].bytes === w1.byteLength && DA.saveState().status === "saved", "the song is saved right after (refs only, no audio data in localStorage)", recS && recS.length);
  ok(DA.undoDepth() === undo0 + 1 && DA.audio.assetState(hA) === "ready", "one undo step; the asset is ready");
  // 同じ中身をもう一度: 書かずに使う
  var r1b = await imp(w1.slice(0), "ukulele-copy.wav", { track: tA.id });
  ok(r1b.ok && r1b.reused && IDB.writes === 2 && DA.project().assets.length === 1 && r1b.clip.start === 2 * 4 * PPQ && r1b.clip.asset === hA, "the same content again: not written again, the new clip shares the asset", [IDB.writes, r1b.clip.start]);
  ok(DA.ops.undo() && DA.project().tracks[2].clips.length === 1 && DA.project().assets.length === 1 && !!dbr.stores.blobs.rows[hA], "undo removes the clip; the asset ref and the stored WAV stay");
  // 容量不足（書きこみの失敗）: 曲は変えない
  var w3 = makeWav({ sr: 48000, ch: 1, sec: 1, fn: tone(220) }), h3 = MA.hashBytes(new Uint8Array(w3)), before3 = JSON.stringify(DA.project()), save3 = SA["ultimateGorillaDawV1:p:" + P1.id];
  IDB.failNext = "QuotaExceededError";
  var r3 = await imp(w3, "voice.wav", { track: tA.id });
  ok(!r3.ok && /容量/.test(r3.why) && /曲は変えていません/.test(r3.why) && JSON.stringify(DA.project()) === before3 && !dbr.stores.blobs.rows[h3] && SA["ultimateGorillaDawV1:p:" + P1.id] === save3, "quota error: nothing is stored, the song (memory and saved) is unchanged", r3.why);
  // 断るファイル
  var rBad = await imp(bytes(["I", "D", "3"]), "a.mp3", { track: tA.id }), rLong = await imp(makeWav({ sr: 8000, ch: 1, sec: 61 }), "long.wav", { track: tA.id }), rBig = await imp(new ArrayBuffer(10 * 1024 * 1024 + 1), "big.wav", { track: tA.id });
  ok(!rBad.ok && /MP3/.test(rBad.why) && !rLong.ok && /長すぎ/.test(rLong.why) && !rBig.ok && /大きすぎ/.test(rBig.why) && JSON.stringify(DA.project()) === before3, "MP3 / 61 s / over 10 MB are refused with reasons; the song is unchanged", [rBad.why, rLong.why, rBig.why]);
  var rEnc = await imp(makeWav({ sr: 44100, ch: 1, sec: 0.2, bits: 24 }), "w24.wav", { track: tA.id });
  ok(!rEnc.ok && /読めません/.test(rEnc.why) && JSON.stringify(DA.project()) === before3, "a file the browser cannot decode is refused (nothing stored)", rEnc.why);
  // 複製・移動
  var c1 = DA.project().tracks[2].clips[0], d1 = DA.ops.duplicate(c1.id);
  ok(d1 && d1.type === "audio" && d1.asset === hA && d1.start === 2 * 4 * PPQ && d1.id !== c1.id, "duplicate: same asset, right after");
  ok(DA.ops.move(d1.id, 1) && MA.findClip(DA.project(), d1.id).clip.start === 3 * 4 * PPQ, "move by one bar (bar 4)");
  // 波形
  DA.select("clip", c1.id);
  var html1 = RA.innerHTML, sv1 = DA.audio.waveSvg(DA.project(), c1, 224), n1 = DA.audio.state().waveN;
  ok(html1.indexOf("da-wave") >= 0 && /<path d="M0\.5 /.test(html1) && DA.audio.waveSvg(DA.project(), c1, 224) === sv1 && DA.audio.state().waveN === n1, "waveform SVG in the clip, cached (not re-scanned on every render)");
  ok((sv1.match(/M/g) || []).length === 70 && html1.indexOf("2小節（4 秒）・音声 2.5 秒") >= 0, "waveform stops where the audio ends (2.5 s of a 4 s clip = 70 lines of 2 px)", (sv1.match(/M/g) || []).length);
  // --- 再生（120 BPM・1 小節 ＝ 2 秒）---
  var LOGA = function () { return DA.log().filter(function (x) { return x.audio; }); };
  function runA(sec) { var P = DA.player(), ac = P.ac, end = ac.currentTime + sec, g = 0; while (ac.currentTime < end && g++ < 40000) { ac.currentTime += 0.025; DA.pump(); } }
  DA.setLoop(false); DA.clearLog(); DA.play();
  var PA = DA.player(), tA0 = PA.segs[0].t0;
  runA(9);
  var LA = LOGA(), bufA = DA.audio.state().buf[hA];
  ok(LA.length === 2 && nearA(LA[0].when, tA0) && nearA(LA[1].when, tA0 + 6) && LA.every(function (x) { return x.ok && x.offset === 0 && nearA(x.dur, 2.5) && !x.cut; }), "3–4. audio starts at bar 1 (0 s) and the moved copy at bar 4 (6 s), full 2.5 s each", LA.map(function (x) { return [(x.when - tA0).toFixed(3), x.dur]; }));
  var srcA = CA.src.filter(function (s) { return s.buf === bufA; });
  ok(srcA.length === 2 && nearA(srcA[0].t, tA0) && nearA(srcA[1].t, tA0 + 6), "two AudioBufferSourceNodes are started at those times (same audio clock)");
  ok(PA.mix[tA.id] && PA.mix[tA.id].syn === null && PA.mix[tA.id].srcs.length === 2, "the audio track has its own output (no SynthTrack), sources are tracked");
  // シンセ・ドラムと同じ時計
  DA.stop();
  var leadA = DA.project().tracks[0]; leadA.clips[0].notes = [[0, 480, 72, 0.8]]; leadA.clips[1].notes = [[0, 480, 74, 0.8]];
  var drA = DA.ops.addTrack("drum"); DA.openEditor(drA.clips[0].id); DA.steps.toggle(36, 0); DA.select(null);
  DA.state().view = "arr";
  DA.clearLog(); DA.play(); PA = DA.player(); tA0 = PA.segs[0].t0; runA(9);
  var lgA = DA.log(), kA = lgA.filter(function (x) { return x.drum; }), nA = lgA.filter(function (x) { return !x.drum && !x.audio && x.track === leadA.id; }), aA = lgA.filter(function (x) { return x.audio; });
  ok(kA.length === 1 && nA.length === 2 && aA.length === 2 && nearA(kA[0].when, aA[0].when) && nearA(nA[0].when, aA[0].when) && nearA(nA[1].when - nA[0].when, 8) && nearA(aA[0].when, tA0), "5–6. kick, lead and WAV start at exactly the same time at bar 1 (one clock)", [kA.length, nA.length, aA.length]);
  DA.stop();
  // 途中から
  DA.clearLog(); DA.play({ from: 960 }); PA = DA.player(); tA0 = PA.segs[0].t0; runA(1);
  var mA = LOGA();
  ok(mA.length === 1 && nearA(mA[0].when, tA0) && nearA(mA[0].offset, 0.5) && nearA(mA[0].dur, 2.0), "playing from beat 2: the clip starts in the middle (offset 0.5 s), no double start", mA);
  DA.stop();
  // ループ（1 小節目だけ）: 区切りで重ならない・欠けない
  var pL = DA.project(); pL.practice.loopA = 0; pL.practice.loopB = 4 * PPQ; DA.setLoop(true);
  DA.clearLog(); DA.play(); PA = DA.player(); tA0 = PA.segs[0].t0; runA(5.9);
  var lA = LOGA();
  ok(lA.length === 3 && lA.every(function (x, i) { return nearA(x.when, tA0 + 2 * i) && x.offset === 0 && nearA(x.dur, 2) && x.cut && x.pass === i; }), "loop of bar 1: each pass plays 0–2 s of the WAV, cut exactly at the loop end (no overlap, no gap)", lA.map(function (x) { return [(x.when - tA0).toFixed(3), x.dur, x.pass]; }));
  DA.stop(); DA.setLoop(false);
  // ループの途中から（区間の頭に、かかっているクリップを途中から）
  pL.practice.loopA = 4 * PPQ; pL.practice.loopB = 8 * PPQ; DA.setLoop(true);
  DA.clearLog(); DA.play(); PA = DA.player(); tA0 = PA.segs[0].t0; runA(3.9);
  var lB = LOGA();
  ok(lB.length === 2 && lB.every(function (x, i) { return nearA(x.when, tA0 + 2 * i) && nearA(x.offset, 2) && nearA(x.dur, 0.5); }), "loop of bar 2 (inside the clip): every pass starts at 2 s of the WAV (the rest 0.5 s)", lB);
  DA.stop(); DA.setLoop(false);
  // M／S・音量・パン
  var tAo = MA.findTrack(DA.project(), tA.id);
  tAo.mute = true; DA.clearLog(); DA.play(); runA(1); ok(LOGA().length === 0, "7. a muted audio track does not play"); DA.stop(); tAo.mute = false;
  leadA.solo = true; DA.clearLog(); DA.play(); runA(1); ok(LOGA().length === 0, "7. solo on another track silences the audio track"); DA.stop(); leadA.solo = false;
  tAo.solo = true; DA.clearLog(); DA.play(); runA(1); ok(LOGA().length === 1 && DA.log().filter(function (x) { return !x.audio; }).length === 0, "7. solo on the audio track: only the WAV"); DA.stop(); tAo.solo = false;
  DA.play(); var mxA = DA.player().mix[tA.id];
  DA.mixer.setVol(tA.id, 40); DA.mixer.setPan(tA.id, -1);
  var tgA = CA.targets.slice(-4).map(function (x) { return x.v; });
  ok(tgA.indexOf(0.4) >= 0 && (mxA.main.pn ? tgA.indexOf(-1) >= 0 : true), "7. volume (and pan, where the browser has a panner) of the audio track go to its own gain", tgA);
  DA.stop(); DA.mixer.setVol(tA.id, 80); DA.mixer.setPan(tA.id, 0);
  // BPM を変える（位置は拍に・音声は元の速さ）
  DA.setBpm(60); DA.clearLog(); DA.play(); PA = DA.player(); tA0 = PA.segs[0].t0; runA(13);
  var bA = LOGA();
  ok(bA.length === 2 && nearA(bA[1].when - tA0, 12) && nearA(bA[0].dur, 2.5) && nearA(bA[1].dur, 2.5), "BPM 60: the copy moves to 12 s (bar 4 follows the beat), the WAV keeps its own speed (2.5 s)", bA.map(function (x) { return [(x.when - tA0).toFixed(3), x.dur]; }));
  DA.setBpm(120); DA.stop();
  DA.play(); var PB = DA.player(); DA.setBpm(121);
  ok(DA.player() !== PB && DA.isPlaying(), "changing BPM while audio clips exist rebuilds playback from the current position");
  DA.stop(); DA.setBpm(120);
  // ⏹ で止める
  DA.play(); runA(0.3); var mxS = DA.player().mix[tA.id], srcsS = mxS.srcs.slice();
  DA.stop();
  ok(srcsS.length >= 1 && mxS.srcs.length === 0 && !DA.isPlaying(), "14. stop: the audio sources are stopped and released");
  // WAV の書き出し（シンセ＋ドラム＋WAV）
  var offA = CA.offline.length, pjA = JSON.stringify(DA.project());
  DA.wav.start(); for (var gw = 0; gw < 300 && DA.wav.state().busy; gw++) { await eA.wait(10); }
  var wsA = DA.wav.state(), wlA = wsA.log.filter(function (x) { return x.audio; });
  ok(wsA.state === "done" && CA.offline.length === offA + 1 && wlA.length === 2 && wlA.every(function (x) { return x.ok && nearA(x.when, MA.tickToSec(DA.project(), x.tick)); }) && nearA(wlA[1].when, 6), "13. WAV export includes the audio clips at the same times as playback (0 s and 6 s)", wsA.msg || wlA.map(function (x) { return x.when; }));
  ok(wsA.log.some(function (x) { return x.drum; }) && wsA.log.some(function (x) { return !x.drum && !x.audio; }) && JSON.stringify(DA.project()) === pjA, "the WAV has synth + drums + audio, and the export changes nothing");
  // 音声だけの曲も書き出せる
  var pOnly = DA.project(), keepOnly = JSON.stringify(pOnly.tracks); pOnly.tracks.forEach(function (t) { if (!MA.isAudio(t)) { t.clips.forEach(function (c) { c.notes = []; }); } });
  ok(MA.noteCount(pOnly) === 0 && DA.wav.plan().ok, "a song with only audio clips can be exported (plan ok)");
  pOnly.tracks = JSON.parse(keepOnly);
  // --- ページの読みなおし（IndexedDB から戻る）---
  DA.flushSave(); DA.saveNow();
  var pid = DA.project().id, savedA = SA["ultimateGorillaDawV1:p:" + pid];
  var decodes0 = decodes;
  var pR = DA.reload();
  ok(pR.id === pid && pR.tracks[2].clips.length === 2 && pR.assets.length === 1 && DA.audio.assetState(hA) === "", "9. reload: the song with its audio clips is back (asset not loaded yet)");
  await new Promise(function (r) { DA.audio.ensure(DA.project(), r); });
  ok(DA.audio.assetState(hA) === "ready" && decodes === decodes0 + 1 && DA.audio.state().peaks[hA].length === 250, "9. the asset is read back from IndexedDB and decoded once", [DA.audio.assetState(hA), decodes - decodes0]);
  DA.clearLog(); DA.play(); PA = DA.player(); tA0 = PA.segs[0].t0; runA(7);
  ok(LOGA().length === 2 && LOGA().every(function (x) { return x.ok; }), "9. after the reload the WAV plays again");
  DA.stop();
  // ▶ を押したとき素材をまだ読みこんでいない: 読みこめてから鳴る
  DA.reload(); DA.clearLog();
  var pw0 = DA.play();
  ok(pw0 === true && !DA.isPlaying() && /読みこんで/.test(DA.state().msg), "▶ before the asset is loaded: waits with a message");
  for (var gw = 0; gw < 200 && !DA.isPlaying(); gw++) { await eA.wait(10); }
  ok(DA.isPlaying() && DA.audio.assetState(hA) === "ready", "…and starts by itself when loaded", [DA.isPlaying(), DA.audio.assetState(hA), DA.state().msg, !!DA.audio.state().playTok, DA.audio.state().dbState]);
  DA.stop();
  // --- 素材がないとき（ほかの端末・データが消えた）---
  delete dbr.stores.blobs.rows[hA]; delete dbr.stores.meta.rows[hA];
  var pM = DA.reload(); await new Promise(function (r) { DA.audio.ensure(DA.project(), r); });
  AA.start("daw", RA, {});
  for (var gw = 0; gw < 300 && DA.audio.assetState(hA) !== "missing"; gw++) { await eA.wait(10); }
  await eA.wait(5);
  ok(DA.audio.assetState(hA) === "missing" && RA.innerHTML.indexOf("素材がありません") >= 0 && DA.project().tracks.length === pM.tracks.length && DA.project().tracks[0].clips.length === 2, "10. missing asset: the clip shows 「素材がありません」; other tracks are kept");
  DA.select("clip", DA.project().tracks[2].clips[0].id);
  ok(RA.innerHTML.indexOf('data-cl="relink"') >= 0 && RA.innerHTML.indexOf("素材を選びなおす") >= 0, "10. the clip panel offers 🔗 素材を選びなおす");
  DA.clearLog(); DA.play();
  ok(DA.isPlaying() && /素材がない音声のクリップ 2 個/.test(DA.state().msg), "10. playing tells that 2 audio clips have no asset (the rest plays)", DA.state().msg);
  runA(1); ok(LOGA().length === 1 && !LOGA()[0].ok && LOGA()[0].why === "missing", "10. the missing clip makes no sound (logged as missing)"); DA.stop();
  DA.wav.start(); for (var gw = 0; gw < 300 && DA.wav.state().busy; gw++) { await eA.wait(10); }
  ok(DA.wav.state().state === "fail" && /音声の素材がありません/.test(DA.wav.state().msg), "13. WAV export with a missing asset fails (no silent success)", DA.wav.state().msg);
  // 選びなおす: ちがう中身は断る・同じ中身ならつなぐ
  var rW = await imp(makeWav({ sr: 44100, ch: 2, sec: 2.5, fn: tone(500) }), "ukulele.wav", { relink: hA });
  ok(!rW.ok && /中身がちがう/.test(rW.why) && DA.audio.assetState(hA) === "missing", "relink: the same name with different content is refused", rW.why);
  var rR = await imp(w1.slice(0), "ukulele (1).wav", { relink: hA });
  ok(rR.ok && rR.relinked && DA.audio.assetState(hA) === "ready" && !!dbr.stores.blobs.rows[hA] && DA.project().assets.length === 1 && DA.project().tracks[2].clips.length === 2, "relink: the same content is stored again and the clips play", rR.why);
  // JSON の書き出し: 参照は入る・中身は入らない・警告
  var exA = DA.proj.exportJson();
  ok(exA.ok && exA.assets === 1 && exA.text.indexOf(hA) >= 0 && exA.text.length < 12000 && /入っていません/.test(DA.saveState().note), "11. JSON export: the refs are in, the audio is not, and the note says so", DA.saveState().note);
  var imA = DA.proj.importText(exA.text);
  ok(imA.ok && imA.project.assets.length === 1 && imA.project.tracks[2].clips[0].asset === hA && imA.project.tracks[2].clips[0].type === "audio", "11. JSON import keeps clips and refs (the same device finds the asset)");
  DA.showProj();
  ok(RA.innerHTML.indexOf("JSON に音声（WAV）の中身は入っていません") >= 0 && RA.innerHTML.indexOf("ukulele.wav") >= 0 && RA.innerHTML.indexOf("クリップ 2 個") >= 0, "the song screen lists the audio assets with the JSON warning");
  // 使っていない素材を外す（端末の中身は消さない）
  var pU = DA.project(); pU.tracks[2].clips = []; DA.showProj();
  ok(RA.innerHTML.indexOf('data-pj-unasset="' + hA + '"') >= 0 && DA.proj.unasset(hA) && DA.project().assets.length === 0 && !!dbr.stores.blobs.rows[hA], "an unused asset can be removed from the song; the stored WAV is kept");
  // 互換: v2.37 の曲
  var fxA = JSON.parse(require("fs").readFileSync(require("path").join(H.ROOT, "tests", "fixtures", "daw-v2.37-song.json"), "utf8")), fxr = MA.fromRecord(fxA.record);
  ok(fxr.ok && fxr.project.assets.length === 0 && fxr.project.tracks.every(function (t) { return !MA.isAudio(t); }), "12. a v2.37 song still opens (no assets, no audio tracks)");
  // 画面を出る: デコードした音を捨てる
  AA.stop();
  ok(Object.keys(DA.audio.state().buf).length === 0 && Object.keys(DA.audio.state().st).length === 0 && !DA.isPlaying(), "14. leaving the DAW frees the decoded audio (the WAV stays in IndexedDB)");
  ok(SA.ultimateGorillaSaveV2 === rpgA, "RPG save untouched");
  DA.reset();
};
