// 🎄 Gorilla Christmas Production Pack（§343 v2.72）: 音色・パターン・伴奏ジェネレーター・テンプレート・解析 Lite・DAW で鳴らす
"use strict";
var H = require("./harness");
var ok = H.ok;

module.exports = async function () {
  H.suite("xmas");
  var env = H.load(), W = env.window, X = W.UGXmas, M = W.UGDawModel, D = W.UGDaw, A = W.UGArcade, S = W.UGSynth, UG = W.UGMelody, C = env.counters;
  ok(!!X && !!M && !!D, "UGXmas exists (arcade-daw-xmas.js) next to the DAW");
  var PPQ = M.PPQ, BAR = PPQ * 4;

  // ---------- 音色 ----------
  var ids = {}, dupId = false, cats = {}, kinds = { syn: 0, smp: 0, drum: 0 }, lic = {};
  X.SOUNDS.forEach(function (s) { if (ids[s[0]]) { dupId = true; } ids[s[0]] = 1; cats[s[1]] = (cats[s[1]] || 0) + 1; kinds[s[3]]++; lic[s[5].lic] = (lic[s[5].lic] || 0) + 1; });
  ok(X.SOUNDS.length >= 20 && X.SOUNDS.length <= 30 && !dupId && X.SOUNDS.every(function (s) { return /^xm-[a-z0-9]+$/.test(s[0]); }), "20–30 Christmas sounds, unique ids that all start with xm-", [X.SOUNDS.length]);
  ok(cats.bells === 7 && cats.orch === 7 && cats.pop === 7 && cats.jazz === 5, "4 categories (bells 7 / orchestra 7 / pop 7 / jazz 5)", cats);
  ok(kinds.syn === 11 && kinds.smp === 13 && kinds.drum === 2, "11 synth patches, 13 instrument recordings, 2 percussion", kinds);
  ok(X.SOUNDS.every(function (s) { return X.LIC[s[5].lic]; }) && lic.cc0 >= 8, "every sound states its rights; CC0 recordings are preferred", lic);
  ok(X.SOUNDS.filter(function (s) { return s[3] === "smp"; }).every(function (s) { return !!UG.sampleFiles[s[4].prog]; }), "every recording uses an existing game sample file (no new external samples)");
  ok(X.SOUNDS.filter(function (s) { return s[3] === "syn"; }).every(function (s) { var c = S.patchClean(s[4]); return JSON.stringify(S.patchClean(c)) === JSON.stringify(c) && c.vol > 0; }), "every synth sound is a valid ゴリラシンセ patch (the same parameters)");
  ok(X.SOUNDS.every(function (s) { return s[5].f && s[5].f.length === 6 && s[5].f.every(function (v) { return v >= 0 && v <= 1; }); }), "every sound has a 6-value profile for the reference recommendation");
  ok(S.PRESETS.length === 12 && S.PRESETS.map(function (p) { return p[0]; }).join() === "lead,chip,pad,spad,brass,bass,acid,pluck,bell,organ,wobble,soft", "the 12 existing synth presets are unchanged (ids and order)");
  ok(X.SKIPPED.length === 1 && X.SKIPPED[0][0] === "Tubular Bells", "Tubular Bells is skipped with a reason (not good enough with the current engine)");
  var iSyn = X.instrument("xm-musicbox"), iSmp = X.instrument("xm-glock"), iDr = X.instrument("xm-sleigh");
  ok(iSyn.type === "synth" && iSyn.patch.mode === "inline" && /^h[0-9a-f]{8}$/.test(iSyn.patch.hash) && iSyn.ext.preset === "xm-musicbox" && iSyn.ext.gm === 10, "a synth sound is the usual inline synth instrument (plays in older versions too)", iSyn.ext);
  ok(iSmp.type === "sample" && iSmp.prog === 9 && iSmp.ext.preset === "xm-glock" && iSmp.ext.gm === 9 && iSmp.ext.fb === "bell" && X.isSample(iSmp), "a recording is the new 'sample' instrument with a GM number and a synth fallback", iSmp);
  ok(iDr.type === "drum", "Sleigh Bells is a drum instrument");

  // ---------- パターン ----------
  ok(X.PATS.length >= 30 && X.PATS.length <= 40, "30–40 performance patterns", X.PATS.length);
  var pids = {}, pdup = false; X.PATS.forEach(function (P) { if (pids[P.id]) { pdup = true; } pids[P.id] = 1; });
  ok(!pdup && X.PATS.every(function (P) { return P.m.length && P.name && (P.drum || X.sound(P.snd) || P.snd === "bass" || P.snd === "chip"); }), "unique pattern ids, each with meters and a default sound");
  var meters = [[4, 4], [3, 4], [6, 8]], bad = [], dupN = 0, count = 0;
  X.PATS.forEach(function (P) {
    meters.forEach(function (mt) {
      if (P.m.indexOf(mt[0] + "/" + mt[1]) < 0) { return; }
      [0, 1, 2].forEach(function (dens) {
        [0, 2].forEach(function (vel) {
          var r = X.generate({ pat: P.id, key: 5, prog: "p1", bars: 8, dens: dens, vel: vel, seed: 11, range: dens === 2 ? "high" : "mid" }, { num: mt[0], den: mt[1] }), bt = mt[0] * PPQ * 4 / mt[1];
          count++;
          if (!r.ok || r.len !== 8 * bt) { bad.push([P.id, mt, "len"]); return; }
          var seen = {};
          r.notes.forEach(function (n) {
            if (!(n[0] >= 0 && n[0] < r.len && n[0] === Math.round(n[0]) && n[2] >= 0 && n[2] <= 127 && n[3] > 0 && n[3] <= 1)) { bad.push([P.id, mt, n]); }
            if (P.drum ? (n[1] !== 0 || n[0] % 240 !== 0) : !(n[1] >= 1 && n[0] + n[1] <= r.len)) { bad.push([P.id, mt, "grid", n]); }
            var k = n[0] + ":" + n[2]; if (seen[k]) { dupN++; } seen[k] = 1;
          });
          if (!r.notes.length) { bad.push([P.id, mt, dens, "empty"]); }
        });
      });
    });
  });
  ok(bad.length === 0 && count > 150, "every pattern × meter × density × velocity: notes inside the clip, integer ticks, drums on the 16th grid (d = 0), pitched notes have lengths", [count, bad.slice(0, 3)]);
  ok(dupN === 0, "no duplicated notes (same time and pitch) in any pattern", dupN);
  ok(X.patsFor(4, 4).length >= 25 && X.patsFor(3, 4).length >= 15 && X.patsFor(6, 8).length >= 15, "patterns for 4/4, 3/4 and 6/8", [X.patsFor(4, 4).length, X.patsFor(3, 4).length, X.patsFor(6, 8).length]);
  var wrong = X.generate({ pat: "waltzPiano" }, { num: 4, den: 4 });
  ok(!wrong.ok && /3\/4/.test(wrong.why), "a 3/4 pattern on a 4/4 song gives a reason, not notes", wrong.why);

  // ---------- 決まった結果（シード）・コードに沿う ----------
  var g1 = { pat: "bellObb", key: 2, prog: "p2", bars: 8, dens: 2, vel: 2, seed: 77 };
  var a1 = JSON.stringify(X.generate(g1, { num: 4, den: 4 }).notes), a2 = JSON.stringify(X.generate(g1, { num: 4, den: 4 }).notes);
  var g2 = JSON.parse(JSON.stringify(g1)); g2.seed = 78;
  ok(a1 === a2 && a1 !== JSON.stringify(X.generate(g2, { num: 4, den: 4 }).notes), "same settings + seed → same notes; another seed → different notes");
  ok(X.generate({ pat: "walking", seed: 5 }, { num: 4, den: 4 }).notes.length && JSON.stringify(X.generate({ pat: "walking", seed: 5 }, { num: 4, den: 4 })) === JSON.stringify(X.generate({ pat: "walking", seed: 5 }, { num: 4, den: 4 })), "the walking bass is reproducible too");
  var sl = X.generate({ pat: "stringsLong", key: 2, prog: "p1", bars: 4, dens: 0, vel: 0, seed: 1 }, { num: 4, den: 4 }), chords = X.chordsFor("p1", 4, {}), follow = true;
  sl.notes.forEach(function (n) { var c = X.chordOf(2, chords[Math.floor(n[0] / BAR)]); if (c.pcs.indexOf(n[2] % 12) < 0) { follow = false; } });
  ok(follow && chords.join() === "I,vi,IV,V" && X.chordOf(2, "vi").name === "Bm" && X.chordOf(2, "V7").name === "A7", "strings follow the progression (I–vi–IV–V in D: D Bm G A)", chords);
  var bs = X.generate({ pat: "bassRoot5", key: 7, prog: "p3", bars: 4, dens: 1, seed: 1 }, { num: 4, den: 4 }), roots = true;
  [0, 1, 2, 3].forEach(function (b) { var n = bs.notes.filter(function (x) { return x[0] === b * BAR; })[0]; if (!n || n[2] % 12 !== X.chordOf(7, X.chordsFor("p3", 4)[b]).root) { roots = false; } });
  ok(roots, "the bass plays the chord root on beat 1 of every bar (I–IV–V–I in G)");
  var cu = X.generate({ pat: "stringsLong", key: 0, prog: "p1", bars: 4, dens: 0, vel: 0, seed: 1, custom: { 1: "ii" } }, { num: 4, den: 4 }), bar2 = cu.notes.filter(function (n) { return n[0] === BAR; }).map(function (n) { return n[2] % 12; }).sort();
  ok(JSON.stringify(bar2) === JSON.stringify([0, 2, 5, 9].filter(function (x) { return [2, 5, 9].indexOf(x) >= 0; })), "a per-bar chord change (bar 2 → ii = Dm) is followed", bar2);
  ok(X.PROGS.map(function (p) { return p[1]; }).join("|") === "I–vi–IV–V|I–V–vi–IV|I–IV–V–I|ii–V–I|I–vi–ii–V", "the 5 progressions");

  // ---------- 曲に置く・作りなおす（↶ は DAW）----------
  var p = M.emptyProject(0), n0 = p.tracks.length;
  var r1 = X.place(p, { pat: "arpPiano", key: 0, prog: "p1", bars: 8, seed: 3 }, { track: "", bar: 3 });
  ok(r1.ok && p.tracks.length === n0 + 1 && r1.clip.start === 2 * BAR && r1.clip.len === 8 * BAR && r1.clip.ext.xgen.seed === 3 && r1.track.instrument.type === "sample" && r1.track.ext.xm === "xm-warmpiano", "place on a new track: a new MIDI clip at bar 3 with the generation settings, Warm Piano", [r1.ok, r1.clip && r1.clip.start]);
  ok(r1.track.sends && r1.track.sends.rev === 0.15 && M.fxOf(r1.track).eq.on && M.fxOf(r1.track).eq.high === -2, "the sound's FX are set on the new track (reverb send, EQ)", [r1.track.sends, M.fxOf(r1.track).eq]);
  var r2 = X.place(p, { pat: "arpPiano", bars: 4, seed: 3 }, { track: r1.track.id, bar: 5 });
  ok(!r2.ok && /もうクリップがあります/.test(r2.why) && r1.track.clips.length === 1, "placing on an occupied bar is refused (no overwrite)", r2.why);
  var r3 = X.place(p, { pat: "pop8", bars: 4 }, { track: r1.track.id, bar: 20 });
  ok(!r3.ok && /ドラムのトラック/.test(r3.why), "a rhythm pattern is not placed on a pitched track");
  var r4 = X.place(p, { pat: "arpPiano", bars: 4, seed: 3 }, { track: r1.track.id, bar: 11 });
  ok(r4.ok && r1.track.clips.length === 2 && r1.track.clips[1].start === 10 * BAR, "free bars on the same track are fine");
  var before = JSON.stringify(r1.clip.notes), nClips = r1.track.clips.length, rg = X.regen(p, r1.clip.id, { seed: 99 });
  ok(rg.ok && r1.track.clips.length === nClips && rg.clip === r1.clip && JSON.stringify(r1.clip.notes) !== before && r1.clip.ext.xgen.seed === 99, "regenerate replaces the same clip's notes (no second clip)");
  ok(X.regen(p, p.tracks[0].clips[0].id, {}).ok === false, "regenerate refuses clips the generator did not make");
  var rt = M.clean(JSON.parse(JSON.stringify(p))), tr = rt.tracks[rt.tracks.length - 1];
  ok(tr.instrument.type === "sample" && tr.instrument.prog === 1 && tr.instrument.ext.preset === "xm-warmpiano" && tr.clips[0].ext.xgen.seed === 99 && tr.ext.xm === "xm-warmpiano", "JSON round trip keeps the sample instrument, the track's sound and the clip's settings");
  ok(JSON.stringify(M.clean(JSON.parse(JSON.stringify(rt)))) === JSON.stringify(rt), "clean() is stable for a Christmas song");
  var full = M.emptyProject(0); while (full.tracks.length < M.MAX_TRACKS) { M.newTrack(full, "x"); }
  var r5 = X.place(full, { pat: "arpPiano" }, { track: "" });
  ok(!r5.ok && /16 本/.test(r5.why) && full.tracks.length === 16, "16 tracks: no new track (the limit stays)");
  var r6 = X.place(p, { pat: "sleigh8", bars: 4, seed: 1 }, { track: "", bar: 1 });
  ok(r6.ok && r6.track.instrument.type === "drum" && r6.clip.notes.every(function (n) { return n[2] === 83; }) && r6.clip.notes.length === 32, "8th sleigh bells: a drum track with GM 83 on every 8th (4 bars)", r6.clip && r6.clip.notes.length);
  ok(M.drumName(83) && M.drumName(84) && !M.DRUM_NAMES.hasOwnProperty(83), "83/84 have names in the step grid; the game drum import list is unchanged");

  // ---------- テンプレート ----------
  ok(X.TPLS.length === 5 && X.TPLS.map(function (t) { return t.id; }).join() === "pop,ballad,jazz,orch,chip", "5 templates (pop, ballad, jazz, orchestra, 8bit)");
  var tplOk = true;
  X.TPLS.forEach(function (T) {
    var pl = X.tplPlan(null, T.id, "new", 1, 1), r = pl.ok ? X.tplNewProject(pl) : null, q = r && r.project;
    if (!q || q.tempo.meters[0].num !== T.num || q.tempo.meters[0].den !== T.den || q.tempo.points[0].bpm !== T.bpm || M.sectionsOf(q).length !== 2 || q.tracks.length !== T.tracks.length + 1 || q.tracks[0].clips[0].notes.length !== 0) { tplOk = false; }
    if (q && JSON.stringify(M.clean(JSON.parse(JSON.stringify(q)))) !== JSON.stringify(M.clean(q))) { tplOk = false; }
  });
  ok(tplOk, "each template makes a new song: meter, BPM, 2 sections (A + chorus), an empty melody track, and the parts");
  var pv0 = X.tplPlan(null, "pop", "new", 1, 1), avgV = function (sec) { var t = 0, n = 0; pv0.rows.forEach(function (r) { r.clips.forEach(function (c) { if (c.sec === sec) { c.r.notes.forEach(function (x) { t += x[3]; n++; }); } }); }); return t / n; };
  ok(avgV(1) > avgV(0) * 1.08, "templates: the chorus is played stronger than the A section (velocity lift)", [avgV(0), avgV(1)]);
  var pa = M.emptyProject(0), nT = pa.tracks.length, plan = X.tplPlan(pa, "pop", "add", 9, 1);
  ok(plan.ok && plan.tracks === 7 && plan.clips > 7 && plan.lic.indexOf("cc0") >= 0 && plan.lic.indexOf("gs") >= 0 && pa.tracks.length === nT, "preview of 'add to this song': tracks, clips and rights, without changing the song", plan);
  var snapA = JSON.stringify(pa.tracks), ap = X.tplApply(pa, plan);
  ok(ap.ok && pa.tracks.length === nT + 7 && JSON.stringify(pa.tracks.slice(0, nT)) === snapA && pa.tracks[nT].clips[0].start === 8 * BAR, "apply adds 7 tracks from bar 9 and leaves the existing tracks unchanged");
  ok(!X.tplPlan(pa, "orch", "add", 1, 1).ok && /3\/4/.test(X.tplPlan(pa, "orch", "add", 1, 1).why), "a 3/4 template cannot be added to a 4/4 song (use a new song)");
  var big = M.emptyProject(0); while (big.tracks.length < 12) { M.newTrack(big, "x"); }
  ok(!X.tplPlan(big, "pop", "add", 1, 1).ok, "a template that would pass 16 tracks is refused before changing anything");

  // ---------- 解析 Lite ----------
  var sr = 22050;
  function sig(fn, sec) { var n = Math.round(sr * sec), d = new Float32Array(n), i, s = 1; for (i = 0; i < n; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; d[i] = fn(i / sr, (s / 0x3fffffff) - 1); } return d; }
  var aSine = X.analyze([sig(function (t) { return 0.3 * Math.sin(2 * Math.PI * 440 * t); }, 2)], sr);
  var aLow = X.analyze([sig(function (t) { return 0.4 * Math.sin(2 * Math.PI * 70 * t); }, 2)], sr);
  var aNoise = X.analyze([sig(function (t, r) { return 0.2 * r; }, 2)], sr);
  var aHits = X.analyze([sig(function (t, r) { var ph = t % 0.25; return ph < 0.06 ? r * 0.5 * Math.exp(-ph * 60) : 0; }, 4)], sr);
  ok(aSine.ok && aSine.midi === 69 && aSine.f.noise < 0.2, "a 440 Hz sine: pitch A4 (69), not noisy", aSine);
  ok(aLow.f.low > 0.8 && aSine.f.low < 0.2 && aNoise.f.noise > 0.6 && aNoise.f.bright > aSine.f.bright, "low sine → strong low end; noise → noisy and bright", [aLow.f, aNoise.f]);
  ok(aHits.ok && aHits.onsets >= 12 && aHits.tempo >= 110 && aHits.tempo <= 130 && aHits.f.attack > 0.5, "clicks every 0.25 s for 4 s → onsets, tempo about 120, strong attack", [aHits.onsets, aHits.tempo, aHits.f]);
  var rc = X.recommend(aHits, 5);
  ok(rc.length === 5 && rc[0].near.length === 2 && rc.some(function (r) { return r.id === "xm-sleigh" || r.id === "xm-brush"; }), "noisy clicks → the top 5 includes sleigh bells / brush-like percussion", rc.map(function (r) { return r.id; }));
  ok(!X.analyze([new Float32Array(sr)], sr).ok, "silence → no analysis (a reason instead)");
  var t2 = X.analyze([sig(function (t) { return 0.3 * Math.sin(2 * Math.PI * 440 * t); }, 2)], sr);
  ok(t2.tempo === null, "a 2-second region: no tempo estimate (only from 4 s with clear onsets)");

  // ---------- DAW: 画面・録音の音色で鳴らす・WAV・MIDI ----------
  var R = H.makeEl("div"); A.start("daw", R, {});
  ok(R.innerHTML.indexOf('data-ar="xmas"') >= 0 && R.innerHTML.indexOf("クリスマス制作") >= 0, "the mobile arrangement has 🎄 クリスマス制作");
  ok(D.xmas.open() && R.innerHTML.indexOf('class="daw dxm"') >= 0 && ["sound", "pat", "gen", "tpl", "ana"].every(function (k) { return R.innerHTML.indexOf('data-xtab="' + k + '"') >= 0; }), "the Christmas screen opens with 5 tabs");
  ok(R.innerHTML.indexOf('data-xadd="xm-glock"') >= 0 && R.innerHTML.indexOf('data-xpv="s:xm-glock"') >= 0 && R.innerHTML.indexOf("CC0") >= 0, "sounds tab: ▶ preview and ＋ track for each sound, with its rights");
  ["pat", "gen", "tpl", "ana"].forEach(function (tab) { X.ui.tab = tab; D.xmas.host.render(); });
  ok(R.innerHTML.indexOf("混ざった曲") >= 0 && R.innerHTML.indexOf("リファレンスがありません") >= 0, "analysis tab without a reference: the caution and a link to 🎧");
  X.ui.tab = "gen"; D.xmas.host.render();
  ok(R.innerHTML.indexOf('data-xm="make"') >= 0 && (R.innerHTML.match(/data-xch="/g) || []).length === X.ui.g.bars && R.innerHTML.indexOf('class="dxm-seed"') >= 0, "generator tab: chord per bar, seed and ＋ 作る");
  var h = D.xmas.host, pd = D.project(), nt = pd.tracks.length, snap = h.snap(), rr = X.place(pd, { pat: "stringsLong", bars: 4, seed: 2 }, { track: "", bar: 1 });
  h.commit(snap, "ok", rr.track.id, rr.clip.id);
  ok(pd.tracks.length === nt + 1 && D.saveState().status !== "saved", "commit: added and marked for saving");
  D.ops.undo();
  ok(D.project().tracks.length === nt, "↶ removes the generated track in one step");
  // 録音を「読みこめた」ことにする（偽のバッファ）
  var ac = UG.audioInit(), name = UG.sampleFiles[48], buf = ac.createBuffer(1, 44100 * 3, 44100);
  UG.samples.state[name] = "ready"; UG.samples.buffers[name] = { 60: buf }; UG.samples.keys[name] = [60];
  var p3 = D.project(); snap = h.snap(); var rs = X.place(p3, { pat: "stringsLong", bars: 4, seed: 2 }, { track: "", bar: 1 }); h.commit(snap, "", rs.track.id);
  ok(!X.needLoad(p3) && X.progsOf(p3).indexOf(48) >= 0, "a song with Warm Strings needs prog 48 (already ready → no waiting)");
  D.clearLog(); var src0 = C.src.length;
  ok(D.play() === true && D.isPlaying(), "play starts with a sample track");
  var P = D.player(); function run(toSec) { var g = 0; while (P.ac.currentTime < toSec && g++ < 10000) { P.ac.currentTime = Math.min(toSec, P.ac.currentTime + 0.025); D.pump(); } }
  run(P.segs[0].t0 + 1);
  var Ls = D.log().filter(function (x) { return x.track === rs.track.id; });
  ok(Ls.length >= 3 && Ls.every(function (x) { return x.ok && x.hash === "smp48" && !x.fb; }) && C.src.length > src0 && C.src.slice(src0).some(function (s) { return s.buf === buf; }), "the strings play from the recording (buffer sources, not the fallback)", [Ls.length, C.src.length - src0]);
  var mxS = P.mix[rs.track.id]; ok(mxS.voices.length > 0 && mxS.voices.every(function (v) { return typeof v.kill === "function" && isFinite(v.end) && v.amp; }), "sample voices can be killed and freed (kill, end, amp)");
  D.stop(); ok(mxS.voices.length === 0 && !D.isPlaying(), "stop clears the sample voices");
  // 読めなかった録音 → 代わりのシンセ
  UG.samples.state[name] = "error"; D.clearLog(); D.play(); P = D.player(); run(P.segs[0].t0 + 0.6);
  var Lf = D.log().filter(function (x) { return x.track === rs.track.id; });
  ok(Lf.length > 0 && Lf.every(function (x) { return x.ok && x.fb; }) && !X.needLoad(p3), "a recording that failed to load → played by the fallback synth, no waiting", Lf.length);
  D.stop(); UG.samples.state[name] = "ready";
  // ドラム 83
  snap = h.snap(); var rd = X.place(p3, { pat: "sleigh8", bars: 2, seed: 1 }, { track: "", bar: 1 }); h.commit(snap, "", rd.track.id);
  D.clearLog(); var osc0 = C.osc; D.play(); P = D.player(); run(P.segs[0].t0 + 1);
  var Ld = D.log().filter(function (x) { return x.track === rd.track.id; });
  ok(Ld.length >= 4 && Ld.every(function (x) { return x.ok && x.drum && x.m === 83; }) && C.osc > osc0, "GM 83 (sleigh bells) is synthesized by the DAW", Ld.length);
  ok(X.drum(ac, 36, 1, 1, ac.destination) === false && X.drum(ac, 84, 1, 1, ac.destination) === true, "only 83/84 are handled here; other drums stay with UGMelody.drum");
  D.stop();
  // MIDI: クリスマスの音色は ext.gm、いままでのトラックは同じ
  var mid = M.midiExport(p3), bytes = Array.prototype.slice.call(mid.bytes), progs = [];
  for (var i = 0; i + 1 < bytes.length; i++) { if ((bytes[i] & 0xF0) === 0xC0 && bytes[i - 1] === 0) { progs.push(bytes[i + 1]); } }
  ok(mid.ok && progs.indexOf(48) >= 0 && progs.indexOf(81) >= 0, "MIDI: Warm Strings → program 48; the existing lead stays 81", progs);
  // WAV（偽のオフライン）: 録音の音色も読みこむ
  var wdone = await new Promise(function (res) { D.wav.start(function () { res(D.wav.state()); }); });
  ok(wdone.state === "done" && !/代わりのシンセ/.test(wdone.note || ""), "WAV export with a sample track finishes (no fallback note when the recording is ready)", [wdone.state, wdone.msg, wdone.note]);
  A.stop();
  ok(X.pv.timer === null && X.pv.voices.length === 0, "leaving the DAW stops any preview");
  var errs = C.errors.filter(function (x) { return !/not MP3/.test(x); });
  ok(errs.length === 0, "no Web Audio errors (Christmas pack)", errs.slice(0, 3));
  ok(env.store.ultimateGorillaSaveV2 === undefined || typeof env.store.ultimateGorillaSaveV2 === "string", "the RPG save is not touched");
};
