// §345 A26: 仕上げのスタジオ（盛り上がり・A／B・道案内）と、128 小節のオリジナル曲の総合 QA（A23〜A26 を続けて）
"use strict";
var H = require("./harness");
var ok = H.ok;

module.exports = async function () {
  H.suite("finish");
  var env = H.load(), W = env.window, X = W.UGXmas, D = W.UGDaw, A = W.UGArcade, M = W.UGDawModel, R = H.makeEl("div");
  A.start("daw", R, {});
  function song(id, form) { D.xmas.host.newSong(X.tplNewProject(X.tplPlan(null, id, "new", 1, 1, form || "full")).project); D.xmas.host.back(); return D.project(); }
  function consistent(p) { var bad = []; p.tracks.forEach(function (t) { t.clips.forEach(function (c) { if (X.clipState(c) === "gen") { var rg = X.regenClip(p, t, c); if (!rg.ok || JSON.stringify(M.cleanNotes(rg.notes)) !== JSON.stringify(c.notes)) { bad.push(t.name + ":" + (rg.why || "notes")); } } if (c.type === "midi") { c.notes.forEach(function (n) { if (n[0] < 0 || n[0] >= c.len) { bad.push("outside"); } }); } }); }); return bad; }
  function secNotes(p, sec) { var n = 0; p.tracks.forEach(function (t) { t.clips.forEach(function (c) { if (c.start >= sec.tick && c.start < sec.tick + sec.len && c.ext && c.ext.xgen) { n += c.notes.length; } }); }); return n; }
  function others(p, sec) { return JSON.stringify(p.tracks.map(function (t) { return t.clips.filter(function (c) { return !(c.start >= sec.tick && c.start < sec.tick + sec.len); }).map(function (c) { return c.notes; }); })); }
  // 1. 盛り上がり: そのセクションだけ・作りなおしても「作ったまま」・音の多さ
  var p = song("pop"), L = M.sectionsOf(p), sec = L[3], all0 = JSON.stringify(p), oth = others(p, sec), mel = JSON.stringify(p.tracks[0]);
  var p1 = X.energyPlan(p, sec.id, 1), p5 = X.energyPlan(p, sec.id, 5);
  ok(p1.ok && p5.ok && p5.n >= 5 && JSON.stringify(p) === all0, "plans for a section (quiet / biggest) are made without changing the song", [p1.n, p5.n]);
  var s0 = D.xmas.host.snapAll(); X.energyApply(p, p1); D.xmas.host.commit(s0, "e1"); var n1 = secNotes(p, sec);
  var s1 = D.xmas.host.snapAll(); X.energyApply(p, X.energyPlan(p, sec.id, 5)); D.xmas.host.commit(s1, "e5"); var n5 = secNotes(p, sec);
  ok(n5 > n1 && others(p, sec) === oth && JSON.stringify(p.tracks[0]) === mel && p.ext.xmEnergy[sec.id] === 5 && consistent(p).length === 0, "level 1 → 5 on " + sec.name + ": more notes (" + n1 + " → " + n5 + "); other sections and the melody unchanged; the regenerated clips stay consistent", consistent(p).slice(0, 3));
  D.xmas.host.undo(); D.xmas.host.undo(); p = D.project();
  ok(JSON.stringify({ t: p.tracks, e: p.ext }) === JSON.stringify({ t: JSON.parse(all0).tracks, e: JSON.parse(all0).ext }), "↶ twice: back to the template exactly");
  // 手で直したクリップは変えない
  var edc = p.tracks.filter(function (t) { return t.name === "ベース"; })[0].clips.filter(function (c) { return c.start === sec.tick; })[0]; edc.notes[0][3] = 0.33; var edN = JSON.stringify(edc.notes);
  var pe = X.energyPlan(p, sec.id, 5);
  ok(pe.keep.indexOf("ベース") >= 0 && !pe.items.some(function (it) { return it.clip === edc; }), "a hand-edited clip in the section is kept (listed as 変えない)");
  // 2. A／B の試聴は曲を変えない
  var keepAB = JSON.stringify(p), aI = X.energyItems(D.xmas.host, pe, false), bI = X.energyItems(D.xmas.host, pe, true);
  ok(aI.length > 0 && bI.length > aI.length && JSON.stringify(p) === keepAB && JSON.stringify(edc.notes) === edN, "A / B preview items (B has more notes for level 5); nothing in the song changes", [aI.length, bI.length]);
  // 3. おすすめの起伏（まとめて・↶ 1 回）
  var rp = X.energyRecPlan(p), keepR = JSON.stringify({ t: p.tracks, e: p.ext }), sR = D.xmas.host.snapAll(); rp.forEach(function (q) { X.energyApply(p, q); }); D.xmas.host.commit(sR, "rec");
  var lv = {}; L.forEach(function (s) { lv[s.name] = p.ext.xmEnergy[s.id]; });
  ok(lv["イントロ"] === 2 && lv["Aメロ"] === 2 && lv["Bメロ"] === 3 && lv["サビ"] === 4 && lv["ラストサビ"] === 5 && lv["アウトロ"] === 2 && consistent(p).length === 0 && JSON.stringify(edc.notes) === edN, "recommended shape: intro 2, verse 2, pre-chorus 3, chorus 4, last chorus 5, outro 2; consistent; the hand edit kept", lv);
  D.xmas.host.undo();
  ok(JSON.stringify({ t: D.project().tracks, e: D.project().ext }) === keepR, "↶ once undoes the whole recommended shape");
  // 4. 12/8 の曲でも（差しかえ・盛り上がり）
  D.xmas.host.newSong(X.tplNewProject(X.tplPlan(null, "xlullaby", "new", 1, 1, "std")).project); D.xmas.host.back();
  var mp = X.meterProject(D.project(), X.meterPlan(D.project(), { num: 12, den: 8, melody: false })); D.xmas.host.newSong(mp.project); D.xmas.host.back();
  var p12 = D.project(), L12 = M.sectionsOf(p12), e12 = X.energyPlan(p12, L12[0].id, 5);
  ok(e12.ok && e12.n > 0 && e12.skip.length === 0, "12/8 song: the section can be re-made (the swap now builds 12/8 from 6/8 patterns, like the generator)", e12.skip);
  var s12 = D.xmas.host.snapAll(); X.energyApply(p12, e12); D.xmas.host.commit(s12, "e12");
  ok(consistent(p12).length === 0, "12/8 after the change: consistent", consistent(p12).slice(0, 2));
  // 5. 画面
  D.xmas.host.newSong(X.tplNewProject(X.tplPlan(null, "pop", "new", 1, 1, "full")).project); D.xmas.host.back(); p = D.project(); L = M.sectionsOf(p);
  X.ui.tab = "fin"; X.ui.fsec = L[3].id; X.ui.flvl = 5; var fh = X.finishTab(D.xmas.host);
  ok((fh.match(/data-xfin="/g) || []).length === 8 && (fh.match(/data-xfen="/g) || []).length === L.length * 5 && /data-xpv="fa"/.test(fh) && /data-xpv="fb"/.test(fh) && /B を採用/.test(fh) && /採用するまで曲は変えません/.test(fh) && /おすすめの起伏/.test(fh), "仕上げ tab: 8 guide steps with 開く, 5 levels per section, A / B preview, adopt, the recommended shape");
  X.ui.tab = "tpl"; X.ui.fsec = ""; X.ui.flvl = 0;
  // ---------- 6. 128 小節のオリジナル曲（A23〜A26 を続けて）----------
  D.xmas.host.newSong(X.tplNewProject(X.tplPlan(null, "pop", "new", 1, 1, "full128")).project); D.xmas.host.back(); p = D.project(); L = M.sectionsOf(p);
  var st = function () { return X.finishSteps(D.project()).filter(function (s) { return s.done; }).map(function (s) { return s.k; }).join(","); };
  ok(st() === "tpl,chord", "guide at the start: template and chords done", st());
  // コード（65 小節目をその場で）
  D.ced.open(64); D.ced.click("pick:" + (X.songChords(p)[64] === "vi" ? "IV" : "vi")); D.ced.click("apply"); p = D.project();
  var chords1 = JSON.stringify(p.ext.xmChords);
  // メロディ（A メロにステップ入力）
  var mt = p.tracks[0], iA = L.map(function (s) { return s.name; }).indexOf("Aメロ"), iA2 = L.map(function (s) { return s.name; }).indexOf("Aメロ 2");
  function clipAt(t, tk) { return t.clips.filter(function (c) { return c.start <= tk && tk < c.start + c.len; })[0]; }
  var cA = clipAt(mt, L[iA].tick); D.openRoll(cA.id); D.roll2.act("step"); D.roll2.act("slen:960");
  [74, 76, 78, 76, 74, 81, 79, 78, 76, 74, 76, 78].forEach(function (m) { D.roll2.act("sk:" + m); });
  var verse1 = JSON.stringify(cA.notes);
  ok(cA.notes.length === 12 && JSON.stringify(D.project().ext.xmChords) === chords1, "melody: 12 notes by step input in verse 1 (chords unchanged)");
  // フレーズ（2 番の A メロへ写して、最後の 2 音を変える）
  D.roll2.act("step"); D.phrase.act("phr"); D.phrase.sel("all"); D.phrase.copy();
  var pr = D.phrase.paste(mt, L[iA2].tick, "replace"), cA2 = clipAt(mt, L[iA2].tick); cA2.notes[10][2] = 79; cA2.notes[11][2] = 81;
  ok(pr.ok && pr.added === 12 && JSON.stringify(cA.notes) === verse1 && cA2.notes[11][2] === 81, "phrase: copied to verse 2 and the last two notes changed; verse 1 is the same");
  // ハモり（上ハモ）
  var hp = X.harmPlan(p, mt.id, "up", "xm-choir"), sH = D.xmas.host.snapAll(), ha = X.harmApply(p, hp); D.xmas.host.commit(sH, "harm", ha.track.id);
  var harmT = p.tracks[1], harmN = JSON.stringify(harmT.clips.map(function (c) { return c.notes; })), melAll = JSON.stringify(mt.clips.map(function (c) { return c.notes; }));
  ok(ha.ok && hp.stats.notes === 24 && harmT.ext.harm && JSON.stringify(mt.clips.map(function (c) { return c.notes; })) === melAll, "harmony: an upper harmony of 24 notes as a new track; the melody unchanged");
  // 盛り上がり（おすすめ）・A／B は曲を変えない
  var keepE = JSON.stringify(p); X.energyItems(D.xmas.host, X.energyPlan(p, L[3].id, 5), true);
  ok(JSON.stringify(p) === keepE, "A / B preview changes nothing");
  var sE = D.xmas.host.snapAll(); X.energyRecPlan(p).forEach(function (q) { X.energyApply(p, q); }); D.xmas.host.commit(sE, "rec");
  ok(JSON.stringify(mt.clips.map(function (c) { return c.notes; })) === melAll && JSON.stringify(harmT.clips.map(function (c) { return c.notes; })) === harmN && JSON.stringify(p.ext.xmChords) === chords1 && consistent(p).length === 0, "the recommended shape changes only the generated accompaniment: melody, harmony and chords stay; consistent");
  // ミックス
  var bassT = p.tracks.filter(function (t) { return t.name === "ベース"; })[0]; bassT.vol = 70; harmT.pan = -0.3; D.markDirty();
  ok(st() === "tpl,chord,mel,phr,harm,arr,mix", "guide after the steps: template, chords, melody, phrase, harmony, arrangement, mix done", st());
  // MIDI: トラックの番号・音符・小節
  var ex = M.midiExport(p), rd = M.midiRead(ex.bytes, "song.mid"), info = D.handoff.info(), withMidi = info.tracks.filter(function (t) { return t.midi; });
  var noteOk = withMidi.every(function (t, i) { var tr = p.tracks.filter(function (x) { return x.name === t.name; })[0], n = 0; tr.clips.forEach(function (c) { n += c.notes.length; }); return rd.parts[i] && rd.parts[i].name === t.name && rd.parts[i].notes.length === n && t.midi.track === i + 2; });
  ok(ex.ok && ex.bytes[9] === 1 && ((ex.bytes[12] << 8) | ex.bytes[13]) === 960 && rd.bars === 128 && noteOk && withMidi[0].name === mt.name && withMidi[1].name === harmT.name, "MIDI: Format 1, PPQ 960, 128 bars; every track's number, name and note count match (melody 1st, harmony 2nd)", withMidi.slice(0, 3).map(function (t) { return [t.name, t.midi.track, t.midi.notes]; }));
  var sp = D.stem.plan();
  ok(sp.list.some(function (x) { return x.name === harmT.name && x.has; }) && sp.list.some(function (x) { return x.name === mt.name && x.has; }), "stems include the melody and the harmony");
  // 保存 → 復元
  var back = M.fromRecord(JSON.parse(JSON.stringify(M.toRecord(p, Date.now())))).project;
  ok(JSON.stringify(back.tracks.map(function (t) { return [t.name, t.vol, t.pan, t.ext, t.clips.map(function (c) { return c.notes; })]; })) === JSON.stringify(p.tracks.map(function (t) { return [t.name, t.vol, t.pan, t.ext, t.clips.map(function (c) { return c.notes; })]; })) && JSON.stringify(back.ext) === JSON.stringify(p.ext) && consistent(back).length === 0, "save → restore: the melody, verse-2 phrase edit, harmony, chords, energy levels, track volume and pan all come back; consistent");
  A.stop();
};
