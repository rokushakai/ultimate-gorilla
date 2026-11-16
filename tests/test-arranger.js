// 🦍 Gorilla Arrangement Studio（§345）: A1 テンプレートエンジン v2・構成・機械的な検査
"use strict";
var H = require("./harness");
var ok = H.ok;
var crypto = require("crypto");

module.exports = async function () {
  H.suite("arranger");
  var env = H.load(), W = env.window, X = W.UGXmas, M = W.UGDawModel, D = W.UGDaw, A = W.UGArcade;
  var PPQ = M.PPQ;
  function sha(s) { return crypto.createHash("sha256").update(s).digest("hex").slice(0, 16); }

  // ---------- 型・構成 ----------
  ok(X.SECT_ORDER.join() === "intro,A,B,chorus,inter,bridge,last,outro" && X.SECT_ORDER.every(function (t) { return X.SECT[t] && M.SECTION_COLORS.indexOf(X.SECT[t][1]) >= 0; }), "8 section types (intro … outro), each with a DAW section color");
  ok(X.SECT.A[2] === 0.92 && X.SECT.chorus[2] === 1.12 && X.SECT.last[2] > X.SECT.chorus[2] && X.SECT.intro[2] < X.SECT.A[2], "section strength: A 0.92 / chorus 1.12 (as v2.72), last chorus stronger, intro softer");
  ok(X.FORMS.map(function (f) { return f[0] + ":" + X.formBars(f[0]); }).join() === "std:16,short:32,full:48,long:64", "4 forms: standard 16, short 32, full 48, long 64 bars");
  ok(X.FORMS.every(function (f) { return f[2].every(function (s) { return s[1] % 4 === 0 && X.SECT[s[0]]; }); }), "every form section is a multiple of 4 bars (the 4-bar progressions line up)");
  var fl = X.formOf(null, "long");
  ok(fl.map(function (s) { return s.name; }).join() === "イントロ,Aメロ,Bメロ,サビ,間奏,Aメロ 2,Bメロ 2,ブリッジ,ラストサビ,アウトロ", "a repeated section type is numbered (Aメロ 2)", fl.map(function (s) { return s.name; }));
  ok(fl[9].end === true && fl[9].fill === false && fl[0].fill === false && fl[2].rise[1] > fl[2].rise[0] && fl[8].acc > 1, "type defaults: outro ends on a held chord, intro/outro without fills, B builds up, last chorus accents");
  ok(X.formOf(null, "nope").length === 2, "an unknown form → the standard form");
  ok(X.PROGS.slice(0, 5).map(function (p) { return p[1]; }).join("|") === "I–vi–IV–V|I–V–vi–IV|I–IV–V–I|ii–V–I|I–vi–ii–V" && X.PROGS.length >= 7 && X.PROGS[5][1] === "IV–V–iii–vi" && X.PROGS[6][1] === "vi–IV–I–V", "progressions: the first 5 are unchanged; IV–V–iii–vi and vi–IV–I–V are added");

  // ---------- 互換: 標準の構成は v2.72／v2.73 と同じ音符 ----------
  // v2.73 の arcade-daw-xmas.js で作った指紋（音域に入れる前の音符）。標準の曲（音域に入れたあと）は、バラードだけ重なりを直した分ちがう
  var FP = { "pop/1": ["329d2cceac92e695", "4ed0b95c0b663312"], "pop/7": ["e27c285ad77f225a", "28b436273507d364"], "pop/12345": ["3800bcab91b0523c", "6daccf2a67a74047"],
    "ballad/1": ["f8586ab4cf686e2f", null], "ballad/7": ["49205e77d1b50028", null], "ballad/12345": ["d599e7f6e9f36399", null],
    "jazz/1": ["42e10b03bd3e8aac", "a489e79d03b6f632"], "jazz/7": ["93d7193d3693afee", "dc20e379e1eb510c"] };
  var fpBad = [];
  Object.keys(FP).forEach(function (k) {
    var id = k.split("/")[0], seed = Number(k.split("/")[1]), pl = X.tplPlan(null, id, "new", 1, seed);
    var rows = pl.rows.map(function (r) { return [r.name, r.snd, r.pat, r.clips.map(function (c) { return [c.sec, c.r.len, c.r.notes]; })]; });
    if (sha(JSON.stringify(rows)) !== FP[k][0]) { fpBad.push(k + " rows"); }
    if (FP[k][1]) {
      var q = X.tplNewProject(X.tplPlan(null, id, "new", 1, seed)).project;
      var proj = JSON.stringify(M.clean(JSON.parse(JSON.stringify(q))).tracks.map(function (t) { return [t.name, t.instrument, t.clips.map(function (c) { return [c.start, c.len, c.name, c.notes]; })]; })) + JSON.stringify(M.sectionsOf(q).map(function (s) { return [s.name, s.bar, s.bars, s.color]; }));
      if (sha(proj) !== FP[k][1]) { fpBad.push(k + " song"); }
    }
  });
  ok(fpBad.length === 0, "standard form: the same notes as v2.73 (pop / ballad / jazz, 3 seeds; the songs too, except the ballad overlap fix)", fpBad);
  var pd = X.tplPlan(null, "pop", "new", 1, 1, "std");
  ok(pd.formId === "std" && pd.bars === 16 && pd.form.length === 2 && pd.hear === 1, "no form given → standard (16 bars, preview = the chorus)");

  // ---------- 重なりの不具合（音域に入れたあと）----------
  var fr = X.fitRange([[0, 960, 34, 0.5], [0, 960, 46, 0.7], [960, 960, 46, 0.4]], "xm-strings");
  ok(fr.length === 2 && fr.filter(function (n) { return n[0] === 0; }).length === 1 && fr.filter(function (n) { return n[0] === 0; })[0][3] === 0.7, "fitRange: two notes that land on the same pitch at the same time become one (the stronger)", fr);
  var bq = X.tplNewProject(X.tplPlan(null, "ballad", "new", 1, 1)).project, dup = 0;
  bq.tracks.forEach(function (t) { t.clips.forEach(function (c) { var seen = {}; c.notes.forEach(function (n) { var k = n[0] + ":" + n[2]; if (seen[k]) { dup++; } seen[k] = 1; }); }); });
  ok(dup === 0, "the ballad template no longer makes same-pitch duplicates (the v2.72 overlap found in the Cubasis audit)", dup);

  // ---------- 5 テンプレート × 4 構成: 作れる・検査を通る・セクションの位置 ----------
  var bad = [], audBad = [], totals = {};
  X.TPLS.forEach(function (T) {
    X.FORMS.forEach(function (F) {
      var pl = X.tplPlan(null, T.id, "new", 1, 5, F[0]);
      if (!pl.ok) { bad.push(T.id + "/" + F[0] + " plan " + pl.why); return; }
      var a = X.audit(pl); if (!a.ok) { audBad.push(T.id + "/" + F[0] + ": " + a.problems.join(" | ")); }
      totals[T.id + "/" + F[0]] = pl.notes;
      var q = X.tplNewProject(pl).project, bt = M.barTicks(q), secs = M.sectionsOf(q), b = 0, k;
      if (secs.length !== pl.form.length) { bad.push(T.id + "/" + F[0] + " sections"); return; }
      for (k = 0; k < pl.form.length; k++) {
        if (secs[k].name !== pl.form[k].name || secs[k].tick !== b * bt || secs[k].len !== pl.form[k].bars * bt || secs[k].color !== pl.form[k].color) { bad.push(T.id + "/" + F[0] + " section " + k); }
        b += pl.form[k].bars;
      }
      var mel = q.tracks[0];
      if (mel.clips.length !== pl.form.length || mel.clips.some(function (c) { return c.notes.length; })) { bad.push(T.id + "/" + F[0] + " melody"); }
      var starts = {}; secs.forEach(function (s) { starts[s.tick] = s.len; });
      q.tracks.slice(1).forEach(function (t) { t.clips.forEach(function (c) { if (starts[c.start] !== c.len) { bad.push(T.id + "/" + F[0] + " clip off a section " + t.name); } }); });
      if (JSON.stringify(M.clean(JSON.parse(JSON.stringify(q)))) !== JSON.stringify(M.clean(q))) { bad.push(T.id + "/" + F[0] + " clean"); }
      if (M.endTick(q) > b * bt) { bad.push(T.id + "/" + F[0] + " longer than the form"); }
    });
  });
  ok(bad.length === 0, "5 templates × 4 forms: new songs with one section marker per form section, empty melody clips per section, clips exactly on the sections", bad.slice(0, 5));
  ok(audBad.length === 0, "5 templates × 4 forms pass the mechanical checks (range, velocity, overlaps, empty/thin sections, density, chord tones, bass leaps)", audBad.slice(0, 3));
  ok(totals["chip/long"] < 4000 && totals["pop/long"] > totals["pop/full"] && totals["pop/full"] > totals["pop/short"], "notes grow with the form and stay small (64 bars of 8bit < 4000 notes)", totals);

  // ---------- セクションの形 ----------
  var pf = X.tplPlan(null, "pop", "new", 1, 3, "full"), bt4 = 4 * PPQ;
  function clipsOf(pl, s) { var out = []; pl.rows.forEach(function (r) { r.clips.forEach(function (c) { if (c.sec === s) { out.push({ row: r, c: c }); } }); }); return out; }
  var intro = clipsOf(pf, 0), outro = clipsOf(pf, 7);
  ok(intro.length > 0 && intro.every(function (x) { return x.row.snd !== "@drum" && X.pat(x.row.pat).cat !== "bass"; }), "pop intro: no drum kit and no bass (keys, strings and bells come in softly)", intro.map(function (x) { return x.row.name; }));
  var endOk = true;
  outro.forEach(function (x) { var lb = 3 * bt4; x.c.r.notes.forEach(function (n) { if (n[0] > lb) { endOk = false; } if (n[0] === lb && !x.c.r.drum && n[1] !== bt4) { endOk = false; } }); });
  ok(endOk && outro.some(function (x) { return x.c.r.notes.some(function (n) { return n[0] === 3 * bt4; }); }), "outro: the last bar is one held chord (no notes after its downbeat)");
  var oc = outro.filter(function (x) { return !x.c.r.drum; })[0].c.r, lastCh = X.chordOf(oc.set.key, oc.chords[3]);
  ok(lastCh.id === "I", "outro ends on the I chord", lastCh.name);
  var bsec = clipsOf(pf, 2), half = function (lo, hi) { var t = 0, n = 0; bsec.forEach(function (x) { x.c.r.notes.forEach(function (q) { if (q[0] >= lo && q[0] < hi) { t += q[3]; n++; } }); }); return t / n; };
  ok(half(2 * bt4, 4 * bt4) > half(0, 2 * bt4) * 1.03, "B section builds up (later bars are stronger)", [half(0, 2 * bt4), half(2 * bt4, 4 * bt4)]);
  function avgV(cs) { var t = 0, n = 0; cs.forEach(function (x) { x.c.r.notes.forEach(function (q) { t += q[3]; n++; }); }); return t / n; }
  ok(avgV(clipsOf(pf, 6)) > avgV(clipsOf(pf, 3)) && avgV(clipsOf(pf, 3)) > avgV(clipsOf(pf, 1)) && avgV(clipsOf(pf, 1)) > avgV(clipsOf(pf, 0)), "strength rises: intro < A < chorus < last chorus", [avgV(clipsOf(pf, 0)), avgV(clipsOf(pf, 1)), avgV(clipsOf(pf, 3)), avgV(clipsOf(pf, 6))]);
  var a1 = clipsOf(pf, 1).filter(function (x) { return x.row.pat === "bellObb"; })[0], a2 = clipsOf(pf, 5).filter(function (x) { return x.row.pat === "bellObb"; })[0];
  ok(a1 && a2 && JSON.stringify(a1.c.r.notes) !== JSON.stringify(a2.c.r.notes), "the second A section is a new variation (its own seed), not a copy");
  ok(clipsOf(pf, 2)[0].c.r.set.prog === "p6" && X.progFor(X.TPLS[0], "bridge") === "p7" && X.progFor(X.TPLS[2], "B") === "p6" && X.progFor(X.TPLS[2], "bridge") === "p4", "progressions per section (B = IV–V–iii–vi, bridge = vi–IV–I–V, a template can override)");
  var nf = X.generate({ pat: "pop8", bars: 4, dens: 1, seed: 1, nofill: 1 }, { num: 4, den: 4 }), wf = X.generate({ pat: "pop8", bars: 4, dens: 1, seed: 1 }, { num: 4, den: 4 });
  function snaresBar3(r) { return r.notes.filter(function (n) { return n[2] === 38 && n[0] > 3 * bt4 + 12 * 240; }).length; }
  ok(snaresBar3(wf) === 3 && snaresBar3(nf) === 0 && nf.set.nofill === 1 && wf.set.nofill === undefined, "fill-in can be turned off per section (generator option nofill)");
  ok(X.genClean({ bars: 12 }).bars === 12 && X.genClean({ bars: 0 }).bars === 8 && X.genClean({ bars: 65 }).bars === 8 && X.genClean({ bars: 8 }).bars === 8, "generator length: 1–64 bars (the screen still offers 4 / 8 / 16)");
  var lb = clipsOf(pf, 6).filter(function (x) { return x.row.pat === "bellObb"; })[0], cb = clipsOf(pf, 3).filter(function (x) { return x.row.pat === "bellObb"; })[0];
  ok(lb.c.r.set.range === "high" && cb.c.r.set.range === "mid", "last chorus moves the bells one range step up");
  var ob = X.tplPlan(null, "orch", "new", 1, 1, "long"), harps = ob.rows.filter(function (r) { return r.snd === "xm-harp"; });
  ok(harps.length === 2 && harps[0].clips.some(function (c) { return ob.form[c.sec].t === "intro"; }) && !harps[1].clips.some(function (c) { return ob.form[c.sec].t === "intro"; }), "per-type override: the orchestra intro has one harp, not two");

  // ---------- いまの曲に足す ----------
  var pa = M.emptyProject(0), nT = pa.tracks.length, secs0 = JSON.stringify(M.sectionsOf(pa)), snapT = JSON.stringify(pa.tracks), plA = X.tplPlan(pa, "pop", "add", 5, 1, "full");
  var ap = X.tplApply(pa, plA), bt = M.barTicks(pa);
  ok(plA.ok && ap.ok && plA.bars === 48 && JSON.stringify(pa.tracks.slice(0, nT)) === snapT && JSON.stringify(M.sectionsOf(pa)) === secs0, "add a full form from bar 5: existing tracks and section markers unchanged", [plA.bars]);
  ok(pa.tracks.slice(nT).every(function (t) { return t.clips.every(function (c) { return c.start >= 4 * bt && c.start + c.len <= (4 + 48) * bt; }); }) && pa.tracks[nT].clips[0].start === 4 * bt, "the added clips sit in bars 5–52");
  var pz = M.emptyProject(0), plZ = X.tplPlan(pz, "pop", "add", 230, 1, "full");
  ok(plZ.ok && !X.tplApply(pz, plZ).ok && /256/.test(X.tplApply(pz, plZ).why), "a form that would pass 256 bars is refused");
  var pg = M.emptyProject(0);
  ok(!X.place(pg, { pat: "arpPiano", bars: 16, seed: 1 }, { track: "", bar: 250 }).ok && X.place(pg, { pat: "arpPiano", bars: 4, seed: 1 }, { track: "", bar: 253 }).ok, "the generator also refuses clips past bar 256 (M.MAX_BARS was undefined before v2.74)");

  // ---------- 作りなおしは nofill を覚える ----------
  var pr = M.emptyProject(0), pp = X.place(pr, { pat: "pop8", bars: 4, seed: 2, nofill: 1 }, { track: "", bar: 1 });
  ok(pp.ok && pp.clip.ext.xgen.nofill === 1 && X.regen(pr, pp.clip.id, { seed: 9 }).ok && pp.clip.ext.xgen.nofill === 1 && pp.clip.ext.xgen.seed === 9, "a clip made without fills keeps it when regenerated");
  var pr2 = M.emptyProject(0), pp2 = X.place(pr2, { pat: "pop8", bars: 4, seed: 2 }, { track: "", bar: 1 });
  ok(pp2.clip.ext.xgen.nofill === undefined && Object.keys(pp2.clip.ext.xgen).join() === "v,pat,key,prog,bars,range,vel,dens,seed,custom", "normal clips store the same xgen fields as v2.72");

  // ---------- A2: コード・ハーモニー（v2.75）----------
  ok(X.PROGS.slice(0, 7).map(function (q) { return q[0]; }).join() === "p1,p2,p3,p4,p5,p6,p7" && X.PROGS.length === 13 && X.PROGS.filter(function (q) { return q[3] === "min"; }).length === 4, "progressions: the first 7 unchanged, 2 major + 4 minor added (13)");
  var allIds = X.CHORD_LISTS.maj.concat(X.CHORD_LISTS.min), chBad = [];
  allIds.forEach(function (id) {
    var c = X.CHORDS[id], ch = X.chordOf(4, id);
    if (!c || ch.id !== id || ch.pcs.length !== c[1].length || ch.fifth !== (ch.root + c[1][2]) % 12) { chBad.push(id); }
    if (c && c[3] === undefined && ch.bass !== ch.root) { chBad.push(id + " bass"); }
  });
  ok(chBad.length === 0 && X.CHORD_LISTS.maj.length === 28 && X.CHORD_LISTS.min.length === 18, "every listed chord exists; chordOf gives its fifth and bass (28 major-key and 18 minor-key chords)", chBad);
  var cC = X.chordOf(0, "I_3"), cB = X.chordOf(9, "ii°"), cG = X.chordOf(0, "V_4"), cS = X.chordOf(0, "V/V"), c9 = X.chordOf(0, "Iadd9"), cs4 = X.chordOf(0, "Vsus4");
  ok(cC.name === "C/E" && cC.bass === 4 && cC.root === 0 && cG.name === "G/F" && cG.bass === 5 && cS.name === "D7" && c9.pcs.join() === "0,4,7,2" && cs4.pcs.join() === "7,0,2" && cB.name === "Bdim" && cB.fifth === 5, "chord names and tones: C/E (bass E), G/F, V/V = D7, Cadd9, Gsus4, Bdim (fifth F)", [cC.name, cG.name, cS.name, cB.name]);
  ok(X.chordOf(0, "I").fifth === 7 && X.chordOf(0, "I").bass === 0 && X.chordOf(0, "I").name === "C", "the old chords keep their tones (fifth = perfect fifth, bass = root)");
  ok(X.chordsFor("p1", 4, {}, "min").join() === "i,VI,iv,V" && X.chordsFor("p4", 4, {}, "min").join() === "iiø7,V7,i7,i7" && X.chordsFor("m1", 4, {}, "min").join() === "i,VI,III,VII" && X.chordsFor("p1", 4, { 1: "vi" }, "min").join() === "i,vi,iv,V" && X.chordsFor("p1", 4, {}).join() === "I,vi,IV,V", "minor: major progressions are read as minor (I–vi–IV–V → i–VI–iv–V); minor progressions and hand-picked chords stay");
  ok(X.scaleTone(9, 69, 1, "min") === 71 && X.scaleTone(9, 71, 1, "min") === 72 && X.scaleTone(9, 71, 1) === 73 && X.scaleTone(9, 69, -1, "min") === 67, "scale steps: A minor uses B → C (A major B → C#) and A → G");
  // すべてのコード × 音の高さのあるパターン: 小節の頭はコードの音
  var gBad = [];
  X.PATS.filter(function (P) { return !P.drum && P.m.indexOf("4/4") >= 0; }).forEach(function (P) {
    allIds.forEach(function (id) {
      var cu = { 0: id, 1: id }, r = X.generate({ pat: P.id, key: 2, prog: "p1", bars: 2, dens: 2, seed: 3, custom: cu, mode: X.CHORD_LISTS.min.indexOf(id) >= 0 ? "min" : "maj" }, { num: 4, den: 4 }), ch = X.chordOf(2, id);
      var tones = ch.pcs.concat([ch.bass, (ch.root + (ch.ivs[3] !== undefined ? ch.ivs[3] : (X.SEVENTH && X.SEVENTH[id]) || 10)) % 12, (ch.root + 2) % 12, (ch.root + 10) % 12, (ch.root + 11) % 12]);
      r.notes.forEach(function (n) { if (!(n[2] >= 0 && n[2] <= 127) || !(n[3] > 0)) { gBad.push(P.id + "/" + id + " bad note"); } if (n[0] % 3840 === 0 && P.cat !== "bell" && tones.indexOf(n[2] % 12) < 0) { gBad.push(P.id + "/" + id + " " + n[2]); } });
    });
  });
  ok(gBad.length === 0, "every chord × every pitched 4/4 pattern: valid notes, downbeats on chord tones", gBad.slice(0, 5));
  var bS = X.generate({ pat: "bassRoot5", key: 0, prog: "p1", bars: 1, dens: 1, seed: 1, custom: { 0: "I_3" } }, { num: 4, den: 4 }), bD = X.generate({ pat: "bassRoot5", key: 9, prog: "m1", bars: 1, dens: 1, seed: 1, custom: { 0: "ii°" }, mode: "min" }, { num: 4, den: 4 });
  ok(bS.notes[0][2] % 12 === 4 && bD.notes.some(function (n) { return n[2] % 12 === 5; }) && !bD.notes.some(function (n) { return n[2] % 12 === 6; }), "bass: C/E plays E on the downbeat; Bdim's fifth is F (not F#)", [bS.notes.map(function (n) { return n[2]; }), bD.notes.map(function (n) { return n[2]; })]);
  // テンプレートのマイナー
  var minBad = [];
  X.TPLS.forEach(function (T) { X.FORMS.forEach(function (F) {
    var pl = X.tplPlan(null, T.id, "new", 1, 2, F[0], { key: 9, kmode: "min" });
    if (!pl.ok || pl.kmode !== "min" || pl.key !== 9) { minBad.push(T.id + "/" + F[0] + " plan"); return; }
    var a = X.audit(pl); if (!a.ok) { minBad.push(T.id + "/" + F[0] + ": " + a.problems.join(" | ")); }
  }); });
  ok(minBad.length === 0, "5 templates × 4 forms in A minor pass the mechanical checks", minBad.slice(0, 3));
  var pm = X.tplPlan(null, "pop", "new", 1, 1, "full", { key: 9, kmode: "min" }), qm = X.tplNewProject(pm).project, lastS = pm.form.length - 1;
  var oRow = pm.rows.filter(function (r) { return r.clips.some(function (c) { return c.sec === lastS && !c.r.drum; }); })[0], oCl = oRow.clips.filter(function (c) { return c.sec === lastS; })[0];
  ok(qm.ext.xmKey === 9 && qm.ext.xmMode === "min" && oCl.r.chords[oCl.r.chords.length - 1] === "i" && oCl.r.set.mode === "min", "minor template song: key A, ext.xmMode = min, the outro ends on i", [qm.ext, oCl.r.chords]);
  var qM = X.tplNewProject(X.tplPlan(null, "pop", "new", 1, 1, "full")).project;
  ok(qM.ext.xmMode === undefined && qM.ext.xmKey === 2, "major template songs do not get xmMode (same as v2.74)");
  var pAdd = M.emptyProject(0); pAdd.ext.xmKey = 4; pAdd.ext.xmMode = "min";
  var plAdd = X.tplPlan(pAdd, "pop", "add", 1, 1, "std");
  ok(plAdd.ok && plAdd.key === 4 && plAdd.kmode === "min" && X.tplPlan(pAdd, "pop", "add", 1, 1, "std", { kmode: "maj", key: 7 }).kmode === "maj", "adding to a minor template song uses its key and mode by default; the preview can change them");
  var pr3 = M.emptyProject(0), pm3 = X.place(pr3, { pat: "arpPiano", bars: 4, seed: 2, mode: "min", key: 9 }, { track: "", bar: 1 }), pM3 = X.place(pr3, { pat: "arpPiano", bars: 4, seed: 2 }, { track: "", bar: 9 });
  ok(pm3.clip.ext.xgen.mode === "min" && pM3.clip.ext.xgen.mode === undefined && X.genClean({}).mode === "maj" && X.regen(pr3, pm3.clip.id, { seed: 4 }).set.mode === "min", "generator: xgen.mode is written only for minor; regenerate keeps it");

  // ---------- A3-1: テンプレートブラウザー（v2.76）----------
  var gIds = X.GENRES.map(function (g) { return g[0]; }), mIds = X.MOODS.map(function (m) { return m[0]; });
  ok(X.TPLS.every(function (T) { return gIds.indexOf(T.genre) >= 0 && T.moods && T.moods.length >= 1 && T.moods.every(function (m) { return mIds.indexOf(m) >= 0; }) && typeof T.tags === "string" && T.tags.length > 5 && typeof T.aim === "string" && T.aim.length > 10; }), "every template has a genre, moods, search words and an arrangement aim");
  ok(X.famsOf(X.TPLS[0]).join() === "piano,bass,strings,bells,synth,drums" && X.famsOf(X.TPLS[3]).indexOf("winds") >= 0 && X.bpmBand(72) === "slow" && X.bpmBand(120) === "mid" && X.bpmBand(138) === "fast", "instrument families come from the tracks; BPM bands slow / mid / fast", X.famsOf(X.TPLS[0]));
  function ids(q, f) { return X.tplSearch(q, f).map(function (T) { return T.id; }).join(); }
  ok(ids("", {}) === X.TPLS.filter(function (T) { return T.rec; }).map(function (T) { return T.id; }).join() && ids("", { genre: "all" }).split(",").length === X.TPLS.length, "no words and no filter → the recommendations; 'all' → every template");
  ok(ids("ベル", {}).split(",").indexOf("pop") >= 0 && ids("Jazz", {}) .split(",").indexOf("jazz") >= 0 && ids("バラード", {}).split(",").indexOf("ballad") >= 0 && ids("静か", {}).split(",").indexOf("ballad") >= 0 && ids("華やか", {}).split(",").indexOf("pop") >= 0 && ids("christmas", {}).split(",").length >= 5, "search in Japanese and English: ベル / Jazz / バラード / 静か / 華やか / christmas");
  ok(ids("ＪＡＺＺ", {}) === ids("jazz", {}) && ids("jazz", {}).split(",").indexOf("jazz") >= 0 && ids("orchestra ワルツ", {}).split(",").indexOf("orch") >= 0 && ids("orchestra ワルツ", {}).split(",").indexOf("ballad") < 0 && ids("zzzz", {}) === "", "full-width = half-width, case-insensitive; every word must match; unknown words → nothing");
  function allT(f) { return X.tplSearch("", f); }
  ok(allT({ meter: "3/4" }).length >= 1 && allT({ meter: "3/4" }).every(function (T) { return T.num === 3 && T.den === 4; }) && allT({ meter: "3/4" }).some(function (T) { return T.id === "orch"; }) && allT({ bpm: "slow" }).every(function (T) { return T.bpm < 90; }) && allT({ bpm: "slow" }).some(function (T) { return T.id === "ballad"; }) && allT({ fam: "winds" }).some(function (T) { return T.id === "orch"; }) && allT({ mood: "retro" }).some(function (T) { return T.id === "chip"; }) && allT({ genre: "pop" }).every(function (T) { return T.genre === "pop"; }), "filters: meter, BPM band, instruments, mood, genre");
  // お気に入り・最近（端末の設定）
  var LS = W.localStorage;
  LS.removeItem(X.TPL_KEY);
  ok(X.tplPrefs().fav.length === 0 && X.tplPrefs().recent.length === 0, "no stored preferences → empty");
  LS.setItem(X.TPL_KEY, "{broken"); ok(X.tplPrefs().fav.length === 0, "a broken value is ignored");
  LS.setItem(X.TPL_KEY, JSON.stringify({ fav: ["pop", "gone-id", 5, null, "pop"], recent: "x" }));
  var pfx = X.tplPrefs(); ok(pfx.fav.join() === "pop,gone-id" && pfx.recent.length === 0, "unknown ids survive in storage without breaking; non-strings and duplicates are dropped", pfx);
  var pTouch = M.emptyProject(0), pT0 = JSON.stringify(pTouch);
  X.tplFav("ballad"); X.tplFav("pop", false); X.tplFav("nope");
  ok(X.tplPrefs().fav.join() === "gone-id,ballad" && JSON.stringify(pTouch) === pT0, "favorites toggle (unknown ids cannot be added) and never touch the song", X.tplPrefs().fav);
  X.tplUsed("jazz"); X.tplUsed("pop"); X.tplUsed("jazz");
  ok(X.tplPrefs().recent.join() === "jazz,pop", "recent: newest first, no duplicates");
  for (var ru = 0; ru < 12; ru++) { X.tplUsed(X.TPLS[ru % X.TPLS.length].id); }
  ok(X.tplPrefs().recent.length <= 8, "recent keeps at most 8");
  LS.setItem(X.TPL_KEY, JSON.stringify({ fav: ["gone-id", "chip"], recent: ["old-one", "orch"] }));

  // ---------- A3-2: テンプレート 32（v2.77）----------
  var gc = {}; X.TPLS.forEach(function (T) { gc[T.genre] = (gc[T.genre] || 0) + 1; });
  var tidSeen = {}, tdup = false; X.TPLS.forEach(function (T) { if (tidSeen[T.id]) { tdup = true; } tidSeen[T.id] = 1; });
  ok(X.TPLS.length === 32 && !tdup && X.TPLS.slice(0, 5).map(function (T) { return T.id; }).join() === "pop,ballad,jazz,orch,chip" && gc.xmas === 12 && gc.pop === 8 && gc.jazz === 6 && gc.retro === 6, "32 templates: the 5 of v2.72 first (same ids), Christmas 12 / J-POP・POP 8 / Jazz・Orchestra 6 / Retro・Electronic 6", gc);
  var aims = {}, aimDup = false; X.TPLS.forEach(function (T) { if (aims[T.aim]) { aimDup = true; } aims[T.aim] = 1; });
  ok(!aimDup && X.TPLS.every(function (T) { return T.tracks.length >= 3 && T.tracks.length <= 8 && T.tracks.every(function (t) { var P = X.pat(t[1]); return P && P.m.indexOf(T.num + "/" + T.den) >= 0 && (t[0] === "@drum" || X.sound(t[0]) || ["bass", "chip", "pluck", "acid", "brass", "pad", "spad", "lead"].indexOf(t[0]) >= 0); }); }), "every template: its own aim, 3–8 tracks, patterns that fit its meter, known sounds");
  // 似すぎ（音色とパターンの組の重なり 0.6 以上で、拍子・キーの種類・進行のうち 2 つ以上が同じ）を出さない
  function tk(T) { var o = {}; T.tracks.forEach(function (r) { o["s:" + r[0]] = 1; o["p:" + r[1]] = 1; }); return o; }
  var simBad = [], simMax = 0;
  for (var si = 0; si < X.TPLS.length; si++) { for (var sj = si + 1; sj < X.TPLS.length; sj++) {
    var A1 = X.TPLS[si], B1 = X.TPLS[sj], ta = tk(A1), tb = tk(B1), inter = 0, uni = 0, kk;
    for (kk in ta) { uni++; if (tb[kk]) { inter++; } } for (kk in tb) { if (!ta[kk]) { uni++; } }
    var jac = inter / uni, same = (A1.num + "/" + A1.den === B1.num + "/" + B1.den ? 1 : 0) + ((A1.kmode || "maj") === (B1.kmode || "maj") ? 1 : 0) + (A1.progs.join() === B1.progs.join() ? 1 : 0);
    simMax = Math.max(simMax, jac); if (jac >= 0.6 && same >= 2) { simBad.push(A1.id + "/" + B1.id + " " + jac.toFixed(2)); }
  } }
  ok(simBad.length === 0, "no two templates are near-copies (sounds × patterns overlap < 0.6, or a different meter / mode / progression)", [simBad, simMax.toFixed(2)]);
  // 32 × 4 構成 × メジャー／マイナー
  var bigBad = [], nPlans = 0, maxClip = 0;
  X.TPLS.forEach(function (T) { X.FORMS.forEach(function (F) { ["maj", "min"].forEach(function (km) {
    var pl = X.tplPlan(null, T.id, "new", 1, 3, F[0], { kmode: km }); nPlans++;
    if (!pl.ok) { bigBad.push(T.id + "/" + F[0] + "/" + km + " " + pl.why); return; }
    var a = X.audit(pl); if (!a.ok) { bigBad.push(T.id + "/" + F[0] + "/" + km + ": " + a.problems.join(" | ")); }
    pl.rows.forEach(function (r) { r.clips.forEach(function (c) { maxClip = Math.max(maxClip, c.notes); }); });
  }); }); });
  ok(nPlans === 256 && bigBad.length === 0 && maxClip < 4000, "all 32 templates × 4 forms × major / minor pass the mechanical checks (256 plans; every clip < 4000 notes)", [bigBad.slice(0, 3), maxClip]);
  var newT = X.TPLS.slice(5), mkOk = true;
  newT.forEach(function (T) { var q = X.tplNewProject(X.tplPlan(null, T.id, "new", 1, 1, "short")).project; if (q.tracks[0].clips.some(function (c) { return c.notes.length; }) || M.sectionsOf(q).length !== 5 || q.tracks.length !== T.tracks.length + 1 || (T.kmode === "min") !== (q.ext.xmMode === "min")) { mkOk = false; } });
  ok(mkOk, "each new template makes a new song: an empty melody track, 5 sections (short form), its tracks, its default mode");
  ok(X.tplNewProject(X.tplPlan(null, "bitpop", "new", 1, 1)).project.tracks[0].ext.xm === "xm-retrolead" && X.tplNewProject(X.tplPlan(null, "jpop", "new", 1, 1)).project.tracks[0].ext.xm === "xm-musicbox", "a template can choose the melody track's sound (8bit → retro lead)");
  // 新しいパターン（v2.77）: 3 つの密度・使える拍子で、重なりなし
  var np = X.PATS.slice(39), npBad = [];
  np.forEach(function (P) { P.m.forEach(function (mk) { [0, 1, 2].forEach(function (d) {
    var mt = mk.split("/"), r = X.generate({ pat: P.id, key: 7, prog: "p8", bars: 4, dens: d, seed: 5 }, { num: Number(mt[0]), den: Number(mt[1]) });
    if (!r.ok || !r.notes.length) { npBad.push(P.id + " " + mk + " " + d + " empty"); return; }
    if (!P.drum) { var byP = r.notes.slice().sort(function (a, c) { return a[2] - c[2] || a[0] - c[0]; }); for (var q = 1; q < byP.length; q++) { if (byP[q][2] === byP[q - 1][2] && byP[q][0] < byP[q - 1][0] + byP[q - 1][1]) { npBad.push(P.id + " " + mk + " " + d + " overlap"); break; } } }
    if (r.notes.some(function (n) { return n[0] < 0 || n[0] >= r.len || n[2] < 0 || n[2] > 127 || !(n[3] > 0 && n[3] <= 1); })) { npBad.push(P.id + " " + mk + " " + d + " range"); }
  }); }); });
  ok(np.length === 14 && npBad.length === 0, "14 new patterns: notes in every meter they offer and every density, inside the clip, no same-pitch overlaps", npBad.slice(0, 4));
  var wk = X.generate({ pat: "walking", key: 0, prog: "p8", bars: 16, dens: 2, seed: 9 }, { num: 4, den: 4 }), wkO = 0, wbp = wk.notes.slice().sort(function (a, c) { return a[2] - c[2] || a[0] - c[0]; });
  for (var wq = 1; wq < wbp.length; wq++) { if (wbp[wq][2] === wbp[wq - 1][2] && wbp[wq][0] < wbp[wq - 1][0] + wbp[wq - 1][1]) { wkO++; } }
  ok(wkO === 0, "walking bass at density 'many' no longer overlaps its own pickup note (fixed in v2.77)", wkO);
  // 新しい音色（ゲームの録音だけ）
  var more = X.SOUNDS.filter(function (s) { return s[1] === "more"; });
  ok(more.length === 10 && more.every(function (s) { return s[3] === "smp" && !!W.UGMelody.sampleFiles[s[4].prog] && X.LIC[s[5].lic] && s[5].lo < s[5].hi && s[5].f.length === 6; }), "10 new sounds use existing game recordings (with rights, range and profile)");

  // ---------- 画面 ----------
  var R = H.makeEl("div"); A.start("daw", R, {});
  ok(D.xmas.open(), "the Christmas screen opens");
  X.ui.tab = "tpl"; X.ui.tplPlan = null; X.ui.form = "std"; D.xmas.host.render();
  ok(R.innerHTML.indexOf('class="dxm-tq"') >= 0 && R.innerHTML.indexOf("dxm-tcount") >= 0 && (R.innerHTML.match(/data-xtrow="/g) || []).length === X.TPLS.length && R.innerHTML.indexOf('data-xtgen="all"') >= 0 && (R.innerHTML.match(/data-xtf="/g) || []).length === 4, "template tab = browser: search with count, genre chips, 4 filters, one row per template");
  ok(R.innerHTML.indexOf("お気に入り") >= 0 && R.innerHTML.indexOf('data-xtsel="chip"') >= 0 && R.innerHTML.indexOf("gone-id") < 0 && R.innerHTML.indexOf("old-one") < 0 && R.innerHTML.indexOf("最近") >= 0, "favorites / recent show known templates only (unknown ids are skipped)");
  ok((R.innerHTML.match(/class="dxm-trow dxm-hide"/g) || []).length === X.TPLS.filter(function (T) { return !T.rec; }).length, "at first only the recommendations are shown (the rest hidden, not all expanded)");
  X.ui.tsel = "pop"; D.xmas.host.render();
  ok((R.innerHTML.match(/data-xform="/g) || []).length === 4 && R.innerHTML.indexOf("標準 16 小節") >= 0 && R.innerHTML.indexOf("長い曲 64 小節") >= 0 && R.innerHTML.indexOf("Aメロ 8 → サビ 8") >= 0 && R.innerHTML.indexOf('data-xpv="d:pop"') >= 0 && R.innerHTML.indexOf('data-xtpl="pop" data-xmode="add"') >= 0 && R.innerHTML.indexOf("ジャンル") >= 0 && R.innerHTML.indexOf("権利") >= 0, "detail: genre, moods, BPM, instruments, rights, 4 form chips with the sections, ▶ preview, new / add");
  var p0 = JSON.stringify(D.project());
  X.ui.form = "full"; X.ui.tplPlan = X.tplPlan(D.project(), "pop", "new", 1, 1, "full"); D.xmas.host.render();
  ok(R.innerHTML.indexOf("dxm-sx") >= 0 && (R.innerHTML.match(/class="dxm-sx[ "]/g) || []).length === 7 * 8 && R.innerHTML.indexOf("サビを試聴") >= 0 && R.innerHTML.indexOf("48 小節") >= 0, "preview: one cell per section for every track, ▶ サビを試聴, 48 bars");
  ok(JSON.stringify(D.project()) === p0, "choosing a form and previewing do not change the song");
  ok(R.innerHTML.indexOf('data-xtkey') >= 0 && (R.innerHTML.match(/data-xtkmode="/g) || []).length === 2 && R.innerHTML.indexOf("D メジャー") >= 0, "preview: key select and メジャー／マイナー chips");
  X.ui.tplPlan = X.tplPlan(D.project(), "pop", "new", 1, 1, "full", { key: 9, kmode: "min" }); D.xmas.host.render();
  ok(R.innerHTML.indexOf("A マイナー") >= 0, "preview in A minor says so");
  X.ui.tplPlan = null; X.ui.tab = "gen"; var gg = X.ui.g || {}; D.xmas.host.render();
  var g1 = X.ui.g; g1.mode = "min"; g1.bars = 4; D.xmas.host.render();
  var nOpt = (R.innerHTML.match(/<select class="dxm-sel" data-xch="0">([\s\S]*?)<\/select>/) || ["", ""])[1].split("<option").length - 1;
  ok((R.innerHTML.match(/data-xkmode="/g) || []).length === 2 && nOpt === X.CHORD_LISTS.min.length && R.innerHTML.indexOf("マイナー</option>") >= 0, "generator tab: メジャー／マイナー chips; the per-bar chord list follows the mode", nOpt);
  g1.mode = "maj"; X.ui.tab = "tpl";
  X.ui.tplPlan = null; X.ui.form = "std";
  A.stop();
};
