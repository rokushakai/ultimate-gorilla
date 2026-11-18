// §345 A13: 制作の流れを続けて行う検証（128 小節 → コード → テンポ・グルーヴ → 手直し・差しかえ → マイテンプレート → MIDI → ステム → 保存 → 復元）
"use strict";
var H = require("./harness");
var ok = H.ok;

module.exports = async function () {
  H.suite("workflow");
  var env = H.load(), W = env.window, X = W.UGXmas, M = W.UGDawModel, D = W.UGDaw, A = W.UGArcade;
  var R = H.makeEl("div"); A.start("daw", R, {});
  // ---------- 点検（どの段階のあとにも同じものを見る）----------
  function check(p, mel) {
    var bad = [], secs = M.sectionsOf(p), end = M.songEndTick(p), i, j, k;
    if (p.tracks.length > M.MAX_TRACKS) { bad.push("tracks " + p.tracks.length); }
    p.tracks.forEach(function (t) {
      var drum = M.isDrum(t);
      t.clips.forEach(function (c) {
        if (c.type !== "midi") { return; }
        if (c.notes.length > 4000) { bad.push("4000 " + c.id); }
        c.notes.forEach(function (n) { if (n[0] < 0 || n[0] >= c.len || (!drum && n[0] + n[1] > c.len)) { bad.push("outside " + t.name + " " + c.id); } if (!(n[3] > 0 && n[3] <= 1) || n[2] < 0 || n[2] > 127) { bad.push("value " + c.id); } });
        if (!drum) { var by = c.notes.slice().sort(function (a, b) { return a[2] - b[2] || a[0] - b[0]; }); for (k = 1; k < by.length; k++) { if (by[k][2] === by[k - 1][2] && by[k][0] < by[k - 1][0] + by[k - 1][1]) { bad.push("overlap " + t.name + " " + c.id); break; } } }
        if (drum && X.clipState(c) === "gen") { for (k = 0; k < c.notes.length; k++) { if (c.notes[k][0] % 240) { bad.push("drum grid " + c.id); break; } } }
        if (X.clipState(c) === "gen") { var rg = X.regenClip(p, t, c); if (!rg.ok || JSON.stringify(M.cleanNotes(rg.notes)) !== JSON.stringify(c.notes)) { bad.push("regen " + t.name + " " + c.id + " " + (rg.why || "")); } }
      });
    });
    for (i = 0; i < secs.length; i++) { if (secs[i].tick !== (i ? secs[i - 1].tick + secs[i - 1].len : 0)) { bad.push("section gap " + secs[i].name); } }
    if (secs.length && secs[secs.length - 1].tick + secs[secs.length - 1].len !== end) { bad.push("sections end " + (secs[secs.length - 1].tick + secs[secs.length - 1].len) + " vs " + end); }
    var ch = p.ext.xmChords || {}; for (j in ch) { if (ch.hasOwnProperty(j) && (Number(j) >= M.tickToBar(p, end - 1).bar || !/^[0-9]+$/.test(j))) { bad.push("chord bar " + j); } }
    if (mel !== undefined && JSON.stringify(p.tracks[0].clips.map(function (c) { return c.notes; })) !== mel) { bad.push("melody changed"); }
    return bad;
  }
  // 1. テンプレート（✨ ポップ）で 128 小節 ＋ 自分のメロディ
  D.xmas.host.newSong(X.tplNewProject(X.tplPlan(null, "pop", "new", 1, 1, "full128")).project);
  var p = D.project(), bars = Math.round(M.songEndTick(p) / M.barTicks(p));
  p.tracks[0].clips[0].notes = [[0, 480, 74, 0.8], [960, 480, 76, 0.7], [1920, 960, 78, 0.8]]; p.tracks[0].clips[3].notes = [[480, 240, 81, 0.6]];
  var mel = JSON.stringify(p.tracks[0].clips.map(function (c) { return c.notes; }));
  var b1 = check(p, mel);
  ok(bars === 128 && b1.length === 0, "1. pop in 128 bars with my melody: everything consistent", [bars, b1.slice(0, 5)]);
  // 2. コードを直す（2 か所）
  var cp = X.chordPlan(p, { 8: "vi", 9: "IV", 64: "V/V" }, "keep"), ca = cp.ok ? X.chordApply(p, cp) : cp;
  var b2 = check(p, mel);
  ok(cp.ok && ca.ok && p.ext.xmChords[8] === "vi" && p.ext.xmChords[64] === "V/V" && b2.length === 0, "2. song chords changed at bars 9, 10, 65: regenerated parts match the new chords; melody kept", [cp.why || ca.why, b2.slice(0, 5)]);
  // 3. テンポとグルーヴ
  var gp = X.groovePlan(p, { bpm: 132, amt: 60 }), ga = gp.ok ? X.grooveApply(p, gp) : gp;
  var b3 = check(p, mel);
  ok(gp.ok && ga.ok && M.bpmAt(p, 0) === 132 && b3.length === 0 && p.ext.xmChords[8] === "vi", "3. tempo 132 and swing 60: still consistent, the chord edits kept", [gp.why || ga.why, b3.slice(0, 5)]);
  // 4. 手直し 1 つ ＋ 差しかえ（パターン）＋ セクションの差しかえ
  var acc = p.tracks[1], hand = acc.clips[1]; hand.notes[0][3] = 0.33; var handN = JSON.stringify(hand.notes);
  var tgt = p.tracks[2].clips[2], sp = X.swapPlan(p, { clip: tgt.id, src: "pat", pat: "walkBass" }), sa = sp.ok ? X.swapApply(p, sp, "replace") : sp;
  var secs = M.sectionsOf(p), sec5 = secs[4], ssp = X.sectionSwapPlan(p, sec5.id, "citypop", 1), ssa = ssp.ok ? X.sectionSwapApply(p, ssp) : ssp;
  var b4 = check(p, mel);
  ok(sa.ok && ssa.ok && X.clipState(hand) === "edited" && JSON.stringify(hand.notes) === handN && b4.length === 0, "4. one hand edit, one pattern swap, one section swap: the hand edit stays, everything else consistent", [sp.why || sa.why, ssp.why, b4.slice(0, 5)]);
  // 2 回目のコード変更（手直しは守る）
  var cp2 = X.chordPlan(p, { 1: "ii" }, "keep"); if (cp2.ok) { X.chordApply(p, cp2); }
  var b4b = check(p, mel);
  ok(cp2.ok && JSON.stringify(hand.notes) === handN && b4b.length === 0, "4b. another chord change after the swaps: the hand edit is still kept", b4b.slice(0, 5));
  // 5. マイテンプレート
  try { W.localStorage.removeItem(X.MY_KEY); } catch (e) {}
  var cap = X.myCapture(p, null, "ワークフロー"), sv = cap.ok ? X.mySave(cap.item) : cap, mp = cap.ok ? X.myProject(X.myList()[0], null) : cap;
  var same5 = mp.ok && mp.project.tracks.slice(1).every(function (t, i) { return JSON.stringify(t.clips.map(function (c) { return c.notes; })) === JSON.stringify(p.tracks[i + 1].clips.map(function (c) { return c.notes; })); });
  ok(sv.ok && mp.ok && same5 && M.bpmAt(mp.project, 0) === 132 && JSON.stringify(mp.project.ext.xmChords) === JSON.stringify(p.ext.xmChords) && check(mp.project).length === 0, "5. saved as my template; a new song from it has the same accompaniment, tempo and chords and is consistent", check(mp.project || p).slice(0, 5));
  try { W.localStorage.removeItem(X.MY_KEY); } catch (e2) {}
  // 5b. マイテンプレートから別のキー（F）
  var cap2 = X.myCapture(p, null, "key"), mpF = cap2.ok ? X.myProject(cap2.item, 5) : cap2;
  ok(mpF.ok && mpF.project.ext.xmKey === 5 && check(mpF.project).length === 0 && JSON.stringify(p.ext.xmChords) === JSON.stringify(mpF.project.ext.xmChords), "5b. a new song from my template in F: consistent, the same song chords (degrees)", check(mpF.project || p).slice(0, 5));
  // 6. MIDI
  var ex = M.midiExport(p), rd = M.midiRead(ex.bytes, "wf.mid"), nP = 0, nM = 0;
  p.tracks.forEach(function (t) { t.clips.forEach(function (c) { nP += c.notes.length; }); });
  rd.parts.forEach(function (x) { nM += x.notes.length; });
  ok(ex.ok && ex.bytes[9] === 1 && ((ex.bytes[12] << 8) | ex.bytes[13]) === 960 && nM === nP && rd.bars === 128 && rd.bpm === 132, "6. MIDI: Format 1, PPQ 960, every note (" + nP + "), 128 bars, BPM 132", [nM, nP, rd.bars, rd.bpm]);
  // 7. ステム（計画）
  var spl = D.stem.plan();
  var wpl = D.wav.plan();
  ok(spl.count === p.tracks.filter(function (t) { return t.clips.some(function (c) { return c.notes && c.notes.length; }); }).length && spl.music === wpl.music && spl.ok === wpl.ok && spl.why === wpl.why, "7. stems: one per track with sound, the same length and the same limits as the song WAV (" + Math.round(spl.sec) + " s; this test browser cannot render past 1:00, Chrome can — the stem refuses for the same reason)", [spl.ok, spl.count, spl.why]);
  // 8・9. 保存 → 復元（ZIP の project.json と同じ記録）
  var rec = JSON.parse(JSON.stringify(M.toRecord(p, Date.now()))), back = M.fromRecord(rec);
  var b9 = back.ok !== false ? check(back.project || back, mel) : ["fromRecord " + back.why], bp = back.project || back;
  ok(b9.length === 0 && JSON.stringify(bp.tracks.map(function (t) { return t.clips.map(function (c) { return [c.start, c.len, c.notes, c.ext]; }); })) === JSON.stringify(p.tracks.map(function (t) { return t.clips.map(function (c) { return [c.start, c.len, c.notes, c.ext]; }); })) && JSON.stringify(bp.ext) === JSON.stringify(p.ext) && JSON.stringify(bp.tempo) === JSON.stringify(p.tempo) && JSON.stringify(bp.markers) === JSON.stringify(p.markers), "8–9. save → restore: the same clips, notes, generation info, chords, groove, tempo and sections; still consistent", b9.slice(0, 5));
  // 点検が本当に見つけるか（わざとこわした写しで）
  var bad1 = JSON.parse(JSON.stringify(bp)); bad1.tracks[2].clips[0].notes.push([bad1.tracks[2].clips[0].len + 10, 100, 40, 0.5]);
  var bad2 = JSON.parse(JSON.stringify(bp)), gc = bad2.tracks[2].clips.filter(function (c) { return X.clipState(c) === "gen"; })[0]; gc.ext.xgen.seed += 1;
  var bad3 = JSON.parse(JSON.stringify(bp)); bad3.markers.splice(1, 1);
  var bad4 = JSON.parse(JSON.stringify(bp)); bad4.tracks[0].clips[0].notes[0][2] += 1;
  ok(check(bad1).some(function (z) { return /^outside/.test(z); }) && check(bad2).some(function (z) { return /^regen/.test(z); }) && check(bad3).some(function (z) { return /^section gap/.test(z); }) && check(bad4, mel).indexOf("melody changed") >= 0, "the checks do find broken data (a note outside a clip, generation info that no longer matches, a missing section, a changed melody)");
  // 10. 最後にもう一度グルーヴ（ストレートへ）・テンポ 120
  var gp3 = X.groovePlan(bp, { bpm: 120, amt: 0 }), ga3 = gp3.ok ? X.grooveApply(bp, gp3) : gp3, b10 = check(bp, mel);
  ok(ga3.ok && b10.length === 0 && JSON.stringify(bp.tracks[1].clips[1].notes) === handN && bp.ext.xmChords[8] === "vi", "10. on the restored song, straight groove at BPM 120: consistent, the hand edit and the chord edits kept", b10.slice(0, 5));
  A.stop();
};
