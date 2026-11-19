// §345 A33: MIDI の互換（書き出しを独立のパーサーで確かめる・読みこみ → 書き出しの往復・CC・マーカー・拍子・128／256 小節）
"use strict";
var H = require("./harness"), REF = require("./smf-ref");
var ok = H.ok;

module.exports = async function () {
  H.suite("midi2");
  var env = H.load(), W = env.window, X = W.UGXmas, D = W.UGDaw, A = W.UGArcade, M = W.UGDawModel, R = H.makeEl("div");
  A.start("daw", R, {});
  function song(id, form) { D.xmas.host.newSong(X.tplNewProject(X.tplPlan(null, id, "new", 1, 1, form)).project); D.xmas.host.back(); return D.project(); }
  function exp(p) { var r = M.midiExport(p); return { r: r, ref: REF.parse(r.bytes) }; }
  // 読みこみ → 新しい曲（画面と同じ順: midiRead → midiBox → midiNewProject → importPlan → importApply）
  function roundTrip(bytes) {
    var info = M.midiRead(bytes, "rt.mid"); if (!info.ok) { return { why: info.why }; }
    var mb = M.midiBox(info, null, "rt"), q = M.midiNewProject(info, true), pl = M.importPlan(q, mb.box, { bar: 1, target: "new" }), ap = pl.ok ? M.importApply(q, mb.box, pl) : pl;
    return ap.ok ? { p: q, info: info } : { why: ap.why };
  }
  function trackSig(tr) { var pn = REF.pairNotes(tr); return { name: tr.name, notes: pn.notes.map(function (n) { return [n.ch, n.key, n.on, n.off, n.vel]; }), bad: pn.unmatchedOff + pn.unclosed + pn.overlap, pc: tr.events.filter(function (e) { return e.kind === "pc"; }).map(function (e) { return [e.ch, e.a]; }) }; }
  function conductor(ref) { var t = ref.tracks[0]; return { tempo: t.events.filter(function (e) { return e.kind === "tempo"; }).map(function (e) { return [e.tick, e.us]; }), meter: t.events.filter(function (e) { return e.kind === "meter"; }).map(function (e) { return [e.tick, e.num, e.den]; }), marker: t.events.filter(function (e) { return e.kind === "marker"; }).map(function (e) { return [e.tick, e.text]; }) }; }
  // CC の列 → 16 分ごとの値（段の関数）
  function ccAt(tr, num) { var l = tr.events.filter(function (e) { return e.kind === "cc" && e.a === num; }); return function (tk) { var v = null, i; for (i = 0; i < l.length && l[i].tick <= tk; i++) { v = l[i].b; } return v; }; }
  // ---------- 1. 128 小節（テンプレート・ハモり・テンポと拍子の変化・セクション・オートメーション・表情）----------
  var p = song("pop", "full128"), L = M.sectionsOf(p), mt = p.tracks[0], cA = mt.clips.filter(function (c) { return c.start === L[1].tick; })[0] || mt.clips[1];
  cA.notes = [[0, 480, 74, 0.8], [480, 480, 76, 0.7], [960, 960, 78, 0.9], [1920, 480, 79, 0.6], [2400, 1440, 81, 1]];
  var hp = X.harmPlan(p, mt.id, "up", "xm-choir"); X.harmApply(p, hp);
  p.tempo.points.push({ tick: M.barToTick(p, 64), bpm: 132 }); p.tempo.points.sort(function (a, b) { return a.tick - b.tick; });
  var bass = p.tracks.filter(function (t) { return t.name === "ベース"; })[0], keys = p.tracks.filter(function (t) { return t.name === "エレピ"; })[0];
  M.autoSet(p, bass, "vol", 0, 70); M.autoSet(p, bass, "vol", M.barToTick(p, 8), 40); M.autoSet(p, bass, "vol", M.barToTick(p, 16), 90);
  M.autoSet(p, keys, "pan", 0, -0.5); M.autoSet(p, keys, "pan", M.barToTick(p, 32), 0.5);
  M.autoSet(p, keys, "expr", 0, 100); M.autoSet(p, keys, "expr", M.barToTick(p, 4), 30); M.autoSet(p, keys, "mod", M.barToTick(p, 2), 0); M.autoSet(p, keys, "mod", M.barToTick(p, 6), 100);
  keys.ext.hum = { pre: "natural", amt: 60, seed: 3 };
  var e1 = exp(p), ref = e1.ref, evs = M.noteEvents(p, 0, Infinity);
  ok(e1.r.ok && ref.errors.length === 0 && ref.format === 1 && ref.division === 960 && ref.ntrks === ref.tracks.length && ref.tracks.length === e1.r.info.tracks.length + 1 && ref.tracks.every(function (t) { return t.eot; }), "128 bars: the independent parser reads it with no errors (Format 1, PPQ 960, ntrks = chunks, End of Track everywhere)", ref.errors.slice(0, 3));
  var cd = conductor(ref), tl = M.tempoList ? M.tempoList(p) : p.tempo.points;
  ok(cd.tempo.length === p.tempo.points.length && cd.tempo.every(function (x, i) { return x[0] === p.tempo.points[i].tick && x[1] === Math.round(60000000 / p.tempo.points[i].bpm); }) && cd.tempo[1][1] === Math.round(60000000 / 132), "tempo events: every tempo point, at its tick, in microseconds per quarter", cd.tempo);
  ok(cd.meter.length >= 1 && cd.meter[0][0] === 0 && cd.meter[0][1] === M.meterAt(p, 0).num && cd.meter[0][2] === M.meterAt(p, 0).den, "time signature at 0", cd.meter);
  ok(cd.marker.length === L.length && cd.marker.every(function (x, i) { return x[0] === L[i].tick && x[1] === L[i].name; }), "a marker for every section (tick and name)", cd.marker.slice(0, 3));
  // トラックごと: 名前・チャンネル・ノート（独立にくらべる）
  var badT = [], drumCh = 0;
  e1.r.info.tracks.forEach(function (it, i) {
    var tr = ref.tracks[i + 1], sg = trackSig(tr), t = M.findTrack(p, it.id), mine = evs.filter(function (e) { return e.track === it.id; }), drum = M.isDrum(t);
    if (sg.name !== t.name) { badT.push(t.name + ": name " + sg.name); }
    if (sg.bad) { badT.push(t.name + ": note pairing " + sg.bad); }
    if (sg.notes.length !== mine.length) { badT.push(t.name + ": notes " + sg.notes.length + " vs " + mine.length); return; }
    var chs = {}; sg.notes.forEach(function (n) { chs[n[0]] = 1; });
    if (Object.keys(chs).length !== 1) { badT.push(t.name + ": several channels"); }
    if (drum) { drumCh += chs[9] ? 1 : 0; return; }
    if (chs[9]) { badT.push(t.name + ": a synth on channel 10"); }
    var exp1 = mine.map(function (e) { return [e.m, e.tick, e.tick + Math.max(1, e.end - e.tick), Math.max(1, Math.min(127, Math.round(e.v * 127)))]; }).sort(function (a, b) { return a[1] - b[1] || a[0] - b[0]; });
    var got = sg.notes.map(function (n) { return [n[1], n[2], n[3], n[4]]; }).sort(function (a, b) { return a[1] - b[1] || a[0] - b[0]; });
    if (JSON.stringify(exp1) !== JSON.stringify(got)) { badT.push(t.name + ": note list differs"); }
    if (!sg.pc.length || sg.pc[0][0] !== Object.keys(chs).map(Number)[0]) { badT.push(t.name + ": no program change on its channel"); }
  });
  ok(badT.length === 0 && drumCh >= 1, "every track: name, one channel (drums on 10, synths not), every note's key, on/off tick and velocity equal the song (humanized notes too), Note On/Off all paired, a program change", badT.slice(0, 4));
  // CC: オートメーションの線（独立に読んだ値を、曲の線とくらべる）
  var bi = e1.r.info.tracks.map(function (x) { return x.id; }).indexOf(bass.id) + 1, ki = e1.r.info.tracks.map(function (x) { return x.id; }).indexOf(keys.id) + 1;
  var vb = ccAt(ref.tracks[bi], 7), pk = ccAt(ref.tracks[ki], 10), xk = ccAt(ref.tracks[ki], 11), mk = ccAt(ref.tracks[ki], 1), worst = 0, tk;
  for (tk = 0; tk < M.barToTick(p, 40); tk += 240) {
    worst = Math.max(worst, Math.abs(vb(tk) - Math.round(M.autoValueAt(M.autoLane(bass, "vol"), tk) * 100 * 1.27)), Math.abs(pk(tk) - Math.round(64 + (M.autoValueAt(M.autoLane(keys, "pan"), tk) * 2 - 1) * 63)), Math.abs(xk(tk) - Math.round(M.autoValueAt(M.autoLane(keys, "expr"), tk) * 127)), Math.abs(mk(tk) - Math.round(M.autoValueAt(M.autoLane(keys, "mod"), tk) * 127)));
  }
  ok(worst <= 1, "CC7 / CC10 / CC11 / CC1 follow the automation lines on every 16th (max difference " + worst + ")");
  // ---------- 2. 往復: 読みこみ → 書き出し ----------
  var rt = roundTrip(e1.r.bytes);
  ok(rt.p && rt.info.notices.some(function (n) { return /CC/.test(n); }) && rt.info.notices.some(function (n) { return /マーカー/.test(n); }), "reading it back: CC and markers are taken in (said in the notices)", rt.why);
  var q = rt.p, e2 = exp(q), ref2 = e2.ref;
  ok(ref2.errors.length === 0 && ref2.tracks.length === ref.tracks.length, "re-exported: no errors, the same number of tracks", ref2.errors.slice(0, 2));
  var cd2 = conductor(ref2);
  ok(JSON.stringify(cd2.tempo) === JSON.stringify(cd.tempo) && JSON.stringify(cd2.meter) === JSON.stringify(cd.meter) && JSON.stringify(cd2.marker) === JSON.stringify(cd.marker), "tempo, time signatures and markers (sections) survive import → export exactly");
  var diffs = [];
  ref.tracks.slice(1).forEach(function (tr, i) { var a = trackSig(tr), b = trackSig(ref2.tracks[i + 1]); if (a.name !== b.name) { diffs.push("name " + a.name); } if (JSON.stringify(a.notes) !== JSON.stringify(b.notes)) { diffs.push(a.name + " notes"); } if (JSON.stringify(a.pc) !== JSON.stringify(b.pc)) { diffs.push(a.name + " program"); } });
  ok(diffs.length === 0, "every track survives import → export: name, channel, every note (tick, length, key, velocity) and the program change", diffs.slice(0, 4));
  var w2 = 0, vb2 = ccAt(ref2.tracks[bi], 7), pk2 = ccAt(ref2.tracks[ki], 10), xk2 = ccAt(ref2.tracks[ki], 11), mk2 = ccAt(ref2.tracks[ki], 1);
  for (tk = 0; tk < M.barToTick(p, 40); tk += 240) { w2 = Math.max(w2, Math.abs(vb2(tk) - vb(tk)), Math.abs(pk2(tk) - pk(tk)), Math.abs(xk2(tk) - xk(tk)), Math.abs(mk2(tk) - mk(tk))); }
  var qb = q.tracks.filter(function (t) { return t.name === "ベース"; })[0], qk = q.tracks.filter(function (t) { return t.name === "エレピ"; })[0];
  ok(w2 <= 2 && M.autoActive(qb, "vol") && M.autoActive(qk, "pan") && M.autoActive(qk, "expr") && M.autoActive(qk, "mod") && M.autoLane(qk, "expr").points.length <= 64, "CC lines survive import → export (max difference " + w2 + " on every 16th); they became automation lanes (64 points max)");
  var flat = q.tracks.filter(function (t) { return t.name === "ストリングス"; })[0], fl0 = p.tracks.filter(function (t) { return t.name === "ストリングス"; })[0];
  ok(flat && flat.vol === Math.round(Math.round(fl0.vol * 1.27) / 1.27) && !M.autoActive(flat, "vol"), "a single CC7 at the start becomes the fader value (no automation)");
  ok(M.sectionsOf(q).map(function (s) { return [s.tick, s.name]; }).join() === L.map(function (s) { return [s.tick, s.name]; }).join(), "the sections come back from the markers");
  // ---------- 3. 256 小節・6 トラック ----------
  var big = M.newProject({ name: "big", bpm: 128, meter: 4 }), k, j;
  for (k = 0; k < 6; k++) {
    var t6 = k === 5 ? M.newTrack(big, "Drums", M.drumInstrument()) : M.addTrack(big, "T" + k, ["lead", "bass", "pad", "pluck", "bell"][k]);
    for (j = 0; j < 256; j += 16) { var ns = [], b; for (b = 0; b < 16 * 4; b++) { ns.push([b * 960 + (k % 2) * 240, k === 5 ? 0 : 600, k === 5 ? [36, 38, 42][b % 3] : 48 + k * 5 + (b % 7), 0.3 + (b % 5) * 0.1]); } M.newMidiClip(big, t6, j * 3840, 16 * 3840, ns, "c"); }
  }
  big.tempo.points.push({ tick: 128 * 3840, bpm: 96 });
  var e3 = exp(big), r3 = e3.ref, n3 = 0, bad3 = 0; r3.tracks.slice(1).forEach(function (tr) { var s3 = trackSig(tr); n3 += s3.notes.length; bad3 += s3.bad; });
  var last = 0; r3.tracks.forEach(function (tr) { tr.events.forEach(function (e) { if (e.kind === "on") { last = Math.max(last, e.tick); } }); });
  ok(e3.r.ok && r3.errors.length === 0 && r3.tracks.length === 7 && n3 === M.noteEvents(big, 0, Infinity).length && bad3 === 0 && Math.floor(last / 3840) === 255, "256 bars × 6 tracks: no errors, every note paired (" + n3 + " notes), the last note in bar 256", r3.errors.slice(0, 2));
  var rt3 = roundTrip(e3.r.bytes), r3b = rt3.p ? exp(rt3.p).ref : null;
  ok(r3b && r3b.tracks.slice(1).every(function (tr, i) { return JSON.stringify(trackSig(tr).notes) === JSON.stringify(trackSig(r3.tracks[i + 1]).notes); }) && JSON.stringify(conductor(r3b).tempo) === JSON.stringify(conductor(r3).tempo), "256 bars: import → export keeps every note and the tempo change", rt3.why);
  // ---------- 4. ふつうでないイベントのファイル（安全に読む）----------
  function vlq(n) { var o = [n & 127]; n = Math.floor(n / 128); while (n > 0) { o.unshift((n & 127) | 128); n = Math.floor(n / 128); } return o; }
  function chunk(id, data) { var l = data.length; return [id.charCodeAt(0), id.charCodeAt(1), id.charCodeAt(2), id.charCodeAt(3), (l >>> 24) & 255, (l >>> 16) & 255, (l >>> 8) & 255, l & 255].concat(data); }
  var trk = [].concat(vlq(0), [0xFF, 0x03, 3, 80, 97, 100], vlq(0), [0xF0, 3, 0x7E, 0x09, 0xF7], vlq(0), [0xFF, 0x59, 2, 0, 0], vlq(0), [0xC0, 33], vlq(0), [0xB0, 7, 100], vlq(0), [0xB0, 64, 127], vlq(0), [0x90, 60, 90], vlq(240), [64, 80], vlq(240), [0xE0, 0, 64], vlq(0), [0xD0, 40], vlq(0), [0xA0, 60, 30], vlq(0), [0xFF, 0x05, 2, 104, 105], vlq(480), [0x80, 60, 0], vlq(0), [64, 0], vlq(0), [0xFF, 0x2F, 0]);
  var file = [].concat(chunk("MThd", [0, 1, 0, 1, 1, 224]), chunk("XYZW", [1, 2, 3]), chunk("MTrk", trk));
  var rr = M.midiRead(new Uint8Array(file), "odd.mid"), rf = REF.parse(file);
  ok(rr.ok && rr.notes === 2 && rr.division === 480 && rr.parts[0].prog === 33 && rr.parts[0].cc.vol && rr.parts[0].cc.vol[0][1] === 100 && rf.errors.length === 0, "a file with SysEx, key signature, sustain, pitch bend, aftertouch, lyric, running status and an unknown chunk is read safely (notes, PPQ 480 → 960, program, CC7)", rr.why || rf.errors);
  ok(rr.ok && rr.parts[0].notes[0][0] === 0 && rr.parts[0].notes[0][1] === 1920 && rr.parts[0].notes[1][0] === 480 && rr.skipped.some(function (s) { return /サステイン/.test(s); }) && rr.skipped.some(function (s) { return /ピッチベンド/.test(s); }) && rr.skipped.some(function (s) { return /SysEx/.test(s); }) && rr.skipped.some(function (s) { return /歌詞/.test(s); }) && rr.skipped.some(function (s) { return /チャンク/.test(s); }), "ticks are scaled from 480 to 960; what is not taken in is listed (sustain, pitch bend, SysEx, lyric, unknown chunk)", rr.skipped);
  var broken = file.slice(0, file.length - 5);
  ok(!M.midiRead(new Uint8Array(broken), "cut.mid").ok, "a cut file is refused with a reason (no crash)");
  A.stop();
};
