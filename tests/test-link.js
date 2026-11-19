// §345 A29: セクションのつなぎ（フィル・ベース・コードの音・アクセント）
"use strict";
var H = require("./harness");
var ok = H.ok;

module.exports = async function () {
  H.suite("link");
  var env = H.load(), W = env.window, X = W.UGXmas, D = W.UGDaw, A = W.UGArcade, M = W.UGDawModel, R = H.makeEl("div");
  A.start("daw", R, {});
  function song(id, form) { D.xmas.host.newSong(X.tplNewProject(X.tplPlan(null, id, "new", 1, 1, form || "full")).project); D.xmas.host.back(); return D.project(); }
  function body(p) { return JSON.stringify({ t: p.tracks, e: p.ext }); }
  function orig(p) { return JSON.stringify(p.tracks.filter(function (t) { return !t.ext.linkTrack; }).map(function (t) { return [t.id, t.clips.map(function (c) { return c.notes; })]; })); }
  var ALL = { kinds: { drum: true, bass: true, chord: true, acc: true }, dens: 2, str: 3, seed: 1 };
  // 1. 見本は曲を変えない・採用・外す
  var p = song("pop"), L = M.sectionsOf(p), keep = body(p), o0 = orig(p), ev0 = M.noteEvents(p, 0, Infinity);
  var iB = L.map(function (s) { return s.name; }).indexOf("Bメロ"), pl = X.linkPlan(p, L[iB].id, ALL);
  ok(pl.ok && pl.parts.length === 3 && body(p) === keep, "a plan (Bメロ → サビ: drum, bass, chord) changes nothing", pl.why);
  ok(JSON.stringify(X.linkPlan(p, L[iB].id, ALL)) === JSON.stringify(pl), "the same input gives the same plan");
  var diff = false, s2; for (s2 = 2; s2 <= 6 && !diff; s2++) { diff = JSON.stringify(X.linkPlan(p, L[iB].id, { kinds: ALL.kinds, dens: 2, str: 3, seed: s2 }).parts) !== JSON.stringify(pl.parts); }
  ok(diff, "another seed gives another shape");
  ok(!X.linkPlan(p, L[L.length - 1].id, ALL).ok && !X.linkPlan(p, "nope", ALL).ok && !X.linkPlan(p, L[0].id, { kinds: {} }).ok, "refused: after the last section, unknown section, nothing chosen");
  var sn = D.xmas.host.snapAll(), ap = X.linkApply(p, pl); D.xmas.host.commit(sn, "link");
  var lt = p.tracks.filter(function (t) { return t.ext.linkTrack; });
  ok(ap.ok && lt.length === 3 && lt.every(function (t) { return t.ext.icon === "&#x1F517;" && /つなぎ/.test(t.name) && t.clips.length === 1 && t.clips[0].ext.link === L[iB].id; }) && p.ext.xmLinks[L[iB].id].clips.length === 3 && orig(p) === o0, "採用: 3 link tracks (🔗 つなぎ), one clip each; every original clip is unchanged");
  // マスク: その所だけ元のドラム・ベースを鳴らさない
  var ev1 = M.noteEvents(p, 0, Infinity), mk = p.ext.xmLinks[L[iB].id].mask, masked = ev0.filter(function (e) { return mk.some(function (q) { return q[0] === e.track && e.tick >= q[1] && e.tick < q[2]; }); }).length;
  ok(mk.length === 2 && masked > 0 && ev1.length === ev0.length - masked + pl.n && !ev1.some(function (e) { return mk.some(function (q) { return q[0] === e.track && e.tick >= q[1] && e.tick < q[2]; }); }), "only inside the fill window the original drum and bass are silent (" + masked + " notes); everything else plays as before");
  // 音符のきまり
  var dp = pl.parts.filter(function (q) { return q.kind === "drum"; })[0], bp = pl.parts.filter(function (q) { return q.kind === "bass"; })[0], cp = pl.parts.filter(function (q) { return q.kind === "chord"; })[0];
  var sk = X.songKey(p), chs = X.songChords(p), barN = M.tickToBar(p, pl.B).bar - 1, nx = X.chordOf(sk.key, chs[barN]), cur = X.chordOf(sk.key, chs[M.tickToBar(p, pl.w0).bar - 1]);
  ok(dp.notes.every(function (q) { return q[0] >= pl.w0 && q[0] <= pl.B && (q[0] - pl.w0) % 240 === 0 && q[3] > 0 && q[3] <= 1 && [36, 38, 43, 45, 48, 49].indexOf(q[2]) >= 0; }), "drum fill: on the 16th grid inside the window, kit sounds (snare, toms, kick, crash)");
  ok(bp.notes.every(function (q) { return q[0] >= pl.w0 && q[0] + q[1] <= pl.B && q[2] >= 26 && q[2] <= 55; }) && bp.notes.length === 4, "bass: 4 notes leading into the next bar, in the bass range, ending before the next downbeat");
  var lastC = cp.notes[cp.notes.length - 1];
  ok(cp.notes.slice(0, -1).every(function (q) { return cur.pcs.indexOf(q[2] % 12) >= 0; }) && nx.pcs.indexOf(lastC[2] % 12) >= 0, "chord link: chord tones of the current chord, the last note a tone of the next chord");
  var hasAcc = dp.notes.some(function (q) { return q[2] === 49 && q[0] === pl.B; }), crashThere = pl.skip.some(function (s) { return /クラッシュ/.test(s); });
  ok(hasAcc !== crashThere, "accent: a crash on the next downbeat only when there is none yet", pl.skip);
  // 長さ（4/4）
  ok([1, 2, 3].map(function (d) { return X.linkPlan(p, L[iB].id, { kinds: { drum: true }, dens: d, str: 2 }).W; }).join() === "960,1920,3840", "length: 1 beat, 2 beats, 1 bar");
  // 2. ↶・外す
  D.xmas.host.undo();
  ok(body(D.project()) === keep, "↶ removes the link exactly");
  D.redo(); p = D.project();
  ok(p.ext.xmLinks && p.ext.xmLinks[L[iB].id], "↷ brings it back");
  X.linkRemove(p, L[iB].id);
  ok(body(p) === keep && M.noteEvents(p, 0, Infinity).length === ev0.length, "外す: back to the original exactly (tracks, notes, ext)");
  // 3. おすすめ
  var rp = X.linkRecPlans(p), into = {}; rp.forEach(function (q) { if (q.ok) { into[q.next.name] = q; } });
  ok(rp.length === L.length - 1 && into["サビ"].o.dens === 2 && into["サビ"].o.kinds.bass && into["サビ"].o.kinds.acc && into["Bメロ"].o.dens === 1 && into["Aメロ"].o.str === 1, "recommended: into the chorus 2 beats, strong, bass, accent; into Bメロ 1 beat; others light");
  var snR = D.xmas.host.snapAll(); rp.forEach(function (q) { if (q.ok) { X.linkApply(p, q); } }); D.xmas.host.commit(snR, "rec");
  ok(Object.keys(p.ext.xmLinks).length === rp.filter(function (q) { return q.ok; }).length && orig(p) === o0 && p.tracks.filter(function (t) { return t.ext.linkTrack; }).length >= 2, "all recommended links added; the original clips unchanged");
  // 4. 盛り上がり（A26）とは別
  var e5 = X.energyPlan(p, L[3].id, 5);
  ok(e5.ok && e5.items.every(function (it) { return !it.track.ext.linkTrack; }), "energy (A26) never touches the link tracks");
  // 5. MIDI・保存と復元
  var ex = M.midiExport(p), rd = M.midiRead(ex.bytes, "l.mid"), n = 0; rd.parts.forEach(function (x) { n += x.notes.length; });
  ok(ex.ok && n === M.noteEvents(p, 0, Infinity).length && rd.parts.some(function (x) { return /つなぎ/.test(x.name); }), "MIDI: the link tracks are written; masked notes are not; the note count matches what plays");
  var back = M.fromRecord(JSON.parse(JSON.stringify(M.toRecord(p, Date.now())))).project;
  ok(JSON.stringify(back.ext.xmLinks) === JSON.stringify(p.ext.xmLinks) && JSON.stringify(M.noteEvents(back, 0, Infinity)) === JSON.stringify(M.noteEvents(p, 0, Infinity)), "save → restore: links, masks and the played notes are identical");
  // 6. コードを変えたら作りなおす
  var k0 = Object.keys(p.ext.xmLinks)[2], q0 = X.linkPlan(p, k0, p.ext.xmLinks[k0].o), bN = M.tickToBar(p, q0.B).bar - 1;
  p.ext.xmChords[bN] = p.ext.xmChords[bN] === "IV" ? "V" : "IV";
  var rb = X.linkRebuild(p), q1 = X.linkPlan(p, k0, p.ext.xmLinks[k0].o);
  ok(rb.ok && rb.n === Object.keys(p.ext.xmLinks).length && JSON.stringify(q1.parts) !== JSON.stringify(q0.parts), "作りなおす: links are rebuilt with the new chord");
  // 7. 拍子（3/4・6/8・12/8）
  var mp = X.meterProject(song("pop", "std"), X.meterPlan(D.project(), { num: 3, den: 4, melody: false })); D.xmas.host.newSong(mp.project); D.xmas.host.back();
  var p3 = D.project(), L3 = M.sectionsOf(p3), a3 = X.linkPlan(p3, L3[0].id, { kinds: { drum: true, bass: true }, dens: 3, str: 2 });
  ok(M.meterAt(p3, 0).num === 3 && a3.ok && a3.W === 2880 && a3.parts[0].notes.every(function (q) { return q[0] >= a3.w0 && q[0] < a3.B; }), "3/4: one bar = 3 beats", a3.why);
  song("xlullaby", "std"); var p6 = D.project(), L6 = M.sectionsOf(p6), a6 = X.linkPlan(p6, L6[0].id, { kinds: { bass: true, chord: true }, dens: 1, str: 2 });
  ok(M.meterAt(p6, 0).den === 8 && a6.ok && a6.W === 1440 && a6.parts.every(function (pt) { return pt.notes.every(function (q) { return (q[0] - a6.w0) % 480 === 0; }); }), "6/8: the beat is a dotted quarter (1440), notes on eighths", a6.why);
  var m12 = X.meterProject(p6, X.meterPlan(p6, { num: 12, den: 8, melody: false })); D.xmas.host.newSong(m12.project); D.xmas.host.back();
  var p12 = D.project(), L12 = M.sectionsOf(p12), a12 = X.linkPlan(p12, L12[0].id, { kinds: { bass: true, chord: true }, dens: 2, str: 2 });
  ok(M.meterAt(p12, 0).num === 12 && a12.ok && a12.W === 2880, "12/8: 2 beats = 2 dotted quarters", a12.why);
  // 8. 画面
  p = song("pop"); L = M.sectionsOf(p); X.ui.tab = "fin"; var fh = X.finishTab(D.xmas.host);
  ok((fh.match(/data-xlsec="/g) || []).length === L.length - 1 && /data-xm="lRec"/.test(fh) && /セクションのつなぎ/.test(fh), "仕上げ: one chip per boundary and the recommended button");
  X.ui.lsec = L[iB].id; X.ui.lopt = X.linkRecOpt(L[iB + 1]); fh = X.finishTab(D.xmas.host);
  ok((fh.match(/data-xlk="/g) || []).length === 4 && (fh.match(/data-xld="/g) || []).length === 3 && (fh.match(/data-xls="/g) || []).length === 3 && /data-xpv="la"/.test(fh) && /data-xpv="lb"/.test(fh) && /lAdopt/.test(fh) && /採用するまで曲は変えません/.test(fh), "a boundary: 4 kinds, length, strength, A / B, adopt");
  var it0 = X.linkItems(D.xmas.host, X.ui.lplan, false), it1 = X.linkItems(D.xmas.host, X.ui.lplan, true);
  ok(it0.length > 0 && it1.length !== it0.length && body(p) === body(D.project()), "A / B preview items differ; the song is unchanged");
  X.ui.tab = "tpl"; X.ui.lsec = ""; X.ui.lopt = null;
  A.stop();
};
