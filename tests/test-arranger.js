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
  ok(X.PROGS.slice(0, 5).map(function (p) { return p[1]; }).join("|") === "I–vi–IV–V|I–V–vi–IV|I–IV–V–I|ii–V–I|I–vi–ii–V" && X.PROGS.length === 7 && X.PROGS[5][1] === "IV–V–iii–vi" && X.PROGS[6][1] === "vi–IV–I–V", "progressions: the first 5 are unchanged; IV–V–iii–vi and vi–IV–I–V are added");

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

  // ---------- 画面 ----------
  var R = H.makeEl("div"); A.start("daw", R, {});
  ok(D.xmas.open(), "the Christmas screen opens");
  X.ui.tab = "tpl"; X.ui.tplPlan = null; X.ui.form = "std"; D.xmas.host.render();
  ok((R.innerHTML.match(/data-xform="/g) || []).length === 4 && R.innerHTML.indexOf("標準 16 小節") >= 0 && R.innerHTML.indexOf("長い曲 64 小節") >= 0 && R.innerHTML.indexOf("Aメロ 8 → サビ 8") >= 0, "template tab: 4 form chips and the form line", (R.innerHTML.match(/data-xform="/g) || []).length);
  var p0 = JSON.stringify(D.project());
  X.ui.form = "full"; X.ui.tplPlan = X.tplPlan(D.project(), "pop", "new", 1, 1, "full"); D.xmas.host.render();
  ok(R.innerHTML.indexOf("dxm-sx") >= 0 && (R.innerHTML.match(/class="dxm-sx[ "]/g) || []).length === 7 * 8 && R.innerHTML.indexOf("サビを試聴") >= 0 && R.innerHTML.indexOf("48 小節") >= 0, "preview: one cell per section for every track, ▶ サビを試聴, 48 bars");
  ok(JSON.stringify(D.project()) === p0, "choosing a form and previewing do not change the song");
  X.ui.tplPlan = null; X.ui.form = "std";
  A.stop();
};
