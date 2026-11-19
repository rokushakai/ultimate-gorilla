// §345 A27: 演奏の表情（ヒューマナイズ）と ↷ やりなおし
"use strict";
var H = require("./harness");
var ok = H.ok;

module.exports = async function () {
  H.suite("humanize");
  var env = H.load(), W = env.window, X = W.UGXmas, D = W.UGDaw, A = W.UGArcade, M = W.UGDawModel, R = H.makeEl("div");
  A.start("daw", R, {});
  function song(id, form) { D.xmas.host.newSong(X.tplNewProject(X.tplPlan(null, id, "new", 1, 1, form || "full")).project); D.xmas.host.back(); return D.project(); }
  function key(e) { return e.track + "|" + e.clip + "|" + e.rel + "|" + e.m; }
  function setAll(p, h) { p.tracks.forEach(function (t) { if (h) { t.ext.hum = JSON.parse(JSON.stringify(h)); } else { delete t.ext.hum; } }); }
  // 1. プリセットと値の確かめ
  ok(M.HUM_ORDER.join() === "natural,tight,laid,energetic,ballad" && M.HUM_ORDER.every(function (k) { return M.HUM_PRESETS[k].name && M.HUM_PRESETS[k].en; }), "5 presets: Natural, Tight, Laid Back, Energetic, Soft Ballad");
  ok(M.humClean({ pre: "x", amt: 50 }) === null && M.humClean({ pre: "natural", amt: 0 }) === null && JSON.stringify(M.humClean({ pre: "tight", amt: 250, seed: -3 })) === '{"pre":"tight","amt":100,"seed":1}' && M.humClean(null) === null, "bad settings are ignored; amount 0〜100 and seed are clamped");
  // 2. ない・量 0 ＝ まったく同じ
  var p = song("pop"), raw = M.noteEvents(p, 0, Infinity), rawS = JSON.stringify(raw), notes0 = JSON.stringify(p.tracks.map(function (t) { return t.clips.map(function (c) { return c.notes; }); }));
  setAll(p, { pre: "natural", amt: 0, seed: 5 });
  ok(JSON.stringify(M.noteEvents(p, 0, Infinity)) === rawS, "amount 0: the events are exactly the same (the default changes nothing)");
  // 3. 決まった結果
  setAll(p, { pre: "natural", amt: 100, seed: 7 });
  var e1 = M.noteEvents(p, 0, Infinity), e1s = JSON.stringify(e1);
  ok(e1s === JSON.stringify(M.noteEvents(p, 0, Infinity)) && e1s !== rawS && e1.length === raw.length, "same notes, settings and seed → the same result; it differs from the original; no note is lost or added");
  setAll(p, { pre: "natural", amt: 100, seed: 8 });
  ok(JSON.stringify(M.noteEvents(p, 0, Infinity)) !== e1s, "another seed gives another result");
  setAll(p, { pre: "natural", amt: 100, seed: 7 });
  var parts = [], a; for (a = 0; a < M.songEndTick(p) + 3840; a += 700) { parts = parts.concat(M.noteEvents(p, a, a + 700)); }
  function ks(L) { return L.map(function (e) { return key(e) + ":" + e.tick + ":" + e.end + ":" + e.v; }).sort().join(); }
  ok(ks(parts) === ks(e1), "asking in short windows (like the player) gives the same notes as the whole song");
  // 4. 安全のきまり（どのプリセットでも）
  var bad = [];
  M.HUM_ORDER.forEach(function (pre) {
    setAll(p, { pre: pre, amt: 100, seed: 3 });
    var ev = M.noteEvents(p, 0, Infinity), bm = {}, byOn = {}, byP = {};
    raw.forEach(function (e) { bm[key(e)] = e; });
    ev.forEach(function (e) {
      var b = bm[key(e)], f = M.findClip(p, e.clip), c = f.clip, drum = M.isDrum(f.track);
      if (!b) { bad.push(pre + " lost"); return; }
      if (e.m !== b.m) { bad.push(pre + " pitch"); }
      if (M.tickToBar(p, e.tick).bar !== M.tickToBar(p, b.tick).bar) { bad.push(pre + " crosses a bar line"); }
      if (e.tick < c.start || e.tick >= c.start + c.len || e.end > c.start + c.len) { bad.push(pre + " outside the clip"); }
      if (!(e.v >= 0.05 && e.v <= 1)) { bad.push(pre + " velocity " + e.v); }
      if (b.d === 0 && (e.d !== 0 || e.end !== e.tick)) { bad.push(pre + " zero length"); }
      if (b.d > 0 && !(e.end > e.tick)) { bad.push(pre + " empty"); }
      if (drum && e.d !== b.d) { bad.push(pre + " drum length"); }
      var ok2 = e.clip + "|" + b.tick; if (byOn[ok2] === undefined) { byOn[ok2] = e.tick; } else if (byOn[ok2] !== e.tick) { bad.push(pre + " chord split"); }
      (byP[e.track + "|" + e.m] = byP[e.track + "|" + e.m] || []).push(e);
    });
    Object.keys(byP).forEach(function (k) { var L = byP[k].sort(function (x, y) { return x.tick - y.tick; }), i; for (i = 0; i + 1 < L.length; i++) { if (L[i].end > L[i + 1].tick) { bad.push(pre + " same-pitch overlap"); } } });
    // 順番（元の位置の順）は入れかわらない
    var ord = ev.slice().sort(function (x, y) { return bm[key(x)].tick - bm[key(y)].tick; }), i2; for (i2 = 0; i2 + 1 < ord.length; i2++) { if (ord[i2].clip === ord[i2 + 1].clip && bm[key(ord[i2])].tick < bm[key(ord[i2 + 1])].tick && ord[i2].tick >= ord[i2 + 1].tick) { bad.push(pre + " order"); break; } }
  });
  ok(bad.length === 0, "all 5 presets at 100%: pitches kept, no bar line or clip edge crossed, velocity 0.05〜1, zero-length stays zero, drums keep length, chords stay together, no same-pitch overlap, order kept", bad.slice(0, 5));
  // 5. 拍のアクセント・ずれの大きさ
  setAll(p, null); var pt = p.tracks.filter(function (t) { return t.name === "ピアノ" || /ピアノ/.test(t.name); })[0] || p.tracks[1];
  var tc = pt.clips[0], nb = Math.floor(tc.len / 3840); tc.notes = []; var q; for (q = 0; q < 16 * nb; q++) { tc.notes.push([q * 240, 200, 60, 0.6]); }
  pt.ext.hum = { pre: "tight", amt: 100, seed: 1 };
  function avgAt(ev, per, ks) { var s = 0, n = 0; ev.forEach(function (e, i) { if (ks.indexOf(i % per) >= 0) { s += e.v; n++; } }); return Math.round(s / n * 1000) / 1000; }
  var ev5 = M.noteEvents(p, tc.start, tc.start + tc.len).filter(function (e) { return e.clip === tc.id; }), vd = avgAt(ev5, 16, [0]), vb = avgAt(ev5, 16, [4, 8, 12]), vo = avgAt(ev5, 16, [2, 6, 10, 14]), v16 = avgAt(ev5, 16, [1, 3, 5, 7, 9, 11, 13, 15]), sh = Math.max.apply(null, ev5.map(function (e, i) { return Math.abs(e.tick - (tc.start + i * 240)); }));
  ok(nb >= 2 && vd > vb && vb > vo && vo > v16 && sh <= 5, "accents (average over " + nb + " bars): bar head > beat > 8th off-beat > 16th; Tight moves at most 5 ticks", [vd, vb, vo, v16, sh]);
  pt.ext.hum = { pre: "laid", amt: 100, seed: 1 };
  var ev6 = M.noteEvents(p, tc.start, tc.start + 3840).filter(function (e) { return e.clip === tc.id; }), avg = 0; ev6.forEach(function (e, i) { avg += e.tick - (tc.start + i * 240); }); avg /= ev6.length;
  pt.ext.hum = { pre: "energetic", amt: 100, seed: 1 };
  var ev7 = M.noteEvents(p, tc.start, tc.start + 3840).filter(function (e) { return e.clip === tc.id; }), avg2 = 0; ev7.forEach(function (e, i) { avg2 += e.tick - (tc.start + i * 240); }); avg2 /= ev7.length;
  ok(avg > 5 && avg2 < 0, "Laid Back plays a little behind, Energetic a little ahead", [avg, avg2]);
  delete pt.ext.hum;
  // 6. 6/8（3 つずつの拍）
  D.xmas.host.newSong(X.tplNewProject(X.tplPlan(null, "xlullaby", "new", 1, 1, "std")).project); D.xmas.host.back();
  var p6 = D.project(), m6 = M.meterAt(p6, 0), t6 = p6.tracks[1], c6 = t6.clips[0], nb6 = Math.floor(c6.len / 2880); c6.notes = []; for (q = 0; q < 6 * nb6; q++) { c6.notes.push([q * 480, 400, 64, 0.6]); }
  t6.ext.hum = { pre: "tight", amt: 100, seed: 2 };
  var e6 = M.noteEvents(p6, c6.start, c6.start + c6.len).filter(function (e) { return e.clip === c6.id; }), a1 = avgAt(e6, 6, [0]), a4 = avgAt(e6, 6, [3]), aO = avgAt(e6, 6, [1, 2, 4, 5]);
  ok(m6.num === 6 && m6.den === 8 && nb6 >= 2 && a1 > a4 && a4 > aO, "6/8 (average over " + nb6 + " bars): accents on 1, then 4 (dotted-quarter beats), then the other eighths", [a1, a4, aO]);
  // 7. 元の音符・コード・ハモりは変えない
  p = song("pop"); var notesP = JSON.stringify(p.tracks.map(function (t) { return t.clips.map(function (c) { return c.notes; }); })), ch0 = JSON.stringify(p.ext.xmChords);
  setAll(p, { pre: "energetic", amt: 80, seed: 4 }); M.noteEvents(p, 0, Infinity); M.midiExport(p);
  ok(JSON.stringify(p.tracks.map(function (t) { return t.clips.map(function (c) { return c.notes; }); })) === notesP && JSON.stringify(p.ext.xmChords) === ch0 && p.tracks.every(function (t) { return t.clips.every(function (c) { return !c.ext || !c.ext.xgen || X.clipState(c) === "gen"; }); }), "using it on tracks does not touch the notes or the chords; generated clips stay 「作ったまま」");
  // 8. MIDI: ノートオン／オフ
  var ex = M.midiExport(p), rd = M.midiRead(ex.bytes, "h.mid"), cnt = 0, ov = 0;
  function vlq(b, i) { var v = 0, c; do { c = b[i++]; v = (v << 7) | (c & 127); } while (c & 128); return [v, i]; }
  var b = ex.bytes, pos = 14, ons = 0, offs = 0;
  while (pos < b.length) { var len = (b[pos + 4] << 24) | (b[pos + 5] << 16) | (b[pos + 6] << 8) | b[pos + 7], e = pos + 8 + len, i = pos + 8, rs = 0; while (i < e) { var r = vlq(b, i); i = r[1]; var s0 = b[i]; if (s0 === 0xFF) { var l2 = vlq(b, i + 2); i = l2[1] + l2[0]; continue; } if (s0 & 128) { rs = s0; i++; } var hi = rs & 0xF0; if (hi === 0x90) { if (b[i + 1] > 0) { ons++; } else { offs++; } i += 2; } else if (hi === 0x80) { offs++; i += 2; } else if (hi === 0xC0 || hi === 0xD0) { i += 1; } else { i += 2; } } pos = e; }
  rd.parts.forEach(function (pp) { var by = {}; pp.notes.forEach(function (n) { cnt++; (by[n[2]] = by[n[2]] || []).push(n); }); Object.keys(by).forEach(function (k) { var L = by[k].sort(function (x, y) { return x[0] - y[0]; }), j; for (j = 0; j + 1 < L.length; j++) { if (L[j][0] + L[j][1] > L[j + 1][0]) { ov++; } } }); });
  ok(ex.ok && ons === offs && ons === cnt && cnt === raw.length && ov === 0 && b[9] === 1 && ((b[12] << 8) | b[13]) === 960, "MIDI with expression: Format 1, PPQ 960, every Note On has its Note Off, the same number of notes, no same-pitch overlap", [ons, offs, cnt, raw.length, ov]);
  // 9. 試聴の上書き（A ＝ 元のまま・B ＝ 表情つき）
  var tid = p.tracks[1].id, ovA = {}, ovB = {}; ovA[tid] = null; ovB[tid] = { pre: "ballad", amt: 100, seed: 9 };
  var only = function (L) { return JSON.stringify(L.filter(function (e) { return e.track === tid; })); };
  setAll(p, null);
  ok(only(M.noteEvents(p, 0, Infinity, ovA)) === only(raw.length ? M.noteEvents(p, 0, Infinity) : []) && only(M.noteEvents(p, 0, Infinity, ovB)) !== only(M.noteEvents(p, 0, Infinity)) && !p.tracks[1].ext.hum, "preview A (original) / B (with expression) without changing the song");
  // 10. 画面: ピアノロールの 🎭
  p = song("pop"); var mt = p.tracks[0], mc = mt.clips.filter(function (c) { return c.notes.length; })[0] || mt.clips[1];
  if (!mc.notes.length) { mc.notes = [[0, 480, 72, 0.7], [960, 480, 74, 0.7], [1920, 960, 76, 0.7]]; }
  var accT = p.tracks.filter(function (t) { return t.clips.some(function (c) { return c.ext && c.ext.xgen && c.notes.length; }) && !M.isDrum(t); })[0], ac = accT.clips.filter(function (c) { return c.notes.length; })[0];
  D.openRoll(ac.id); D.hum.act("hum"); var hh = D.hum.html();
  ok((hh.match(/data-roll="hmp:/g) || []).length === 5 && /hmA/.test(hh) && /hmB/.test(hh) && /hmuse/.test(hh) && /hmwrite/.test(hh) && /data-roll="hum"/.test(R.innerHTML) && /data-roll="redo"/.test(R.innerHTML), "piano roll: 🎭 opens the panel (5 presets, amount, seed, ▶ A / ▶ B, use, write) and ↷ is there");
  var keepN = JSON.stringify(ac.notes);
  D.hum.act("hmp:laid"); D.hum.act("hma=75"); D.hum.act("hmseed"); D.hum.act("hmuse");
  ok(JSON.stringify(accT.ext.hum) === '{"pre":"laid","amt":75,"seed":2}' && JSON.stringify(ac.notes) === keepN && X.clipState(ac) === "gen", "このトラックに使う: ext.hum = Laid Back 75% #2; the notes and the 「作ったまま」 state are kept");
  D.xmas.host.undo();
  ok(!accT.ext || !D.project().tracks.filter(function (t) { return t.id === accT.id; })[0].ext.hum, "↶ removes it");
  D.redo();
  var accT2 = D.project().tracks.filter(function (t) { return t.id === accT.id; })[0];
  ok(JSON.stringify(accT2.ext.hum) === '{"pre":"laid","amt":75,"seed":2}' && D.redoN() === 0, "↷ puts it back (the ↷ list is then empty)");
  D.hum.act("hmoff"); accT2 = D.project().tracks.filter(function (t) { return t.id === accT.id; })[0];
  ok(!accT2.ext.hum, "外す removes the expression");
  // 選んだ音符に書きこむ
  D.closeRoll(); D.openRoll(mc.id); D.phrase.act("phr"); D.phrase.sel("all");
  var mc2 = M.findClip(D.project(), mc.id).clip, before = JSON.stringify(mc2.notes);
  D.hum.act("hmp:natural"); D.hum.act("hma=100"); D.hum.act("hmwrite");
  mc2 = M.findClip(D.project(), mc.id).clip;
  var after = JSON.stringify(mc2.notes);
  ok(after !== before && mc2.notes.every(function (n) { return n[3] >= 0.05 && n[3] <= 1; }) && JSON.stringify(mc2.notes.map(function (n) { return n[2]; }).sort()) === JSON.stringify(JSON.parse(before).map(function (n) { return n[2]; }).sort()), "書きこむ: the notes themselves change (velocity, position, length); the pitches stay");
  D.xmas.host.undo(); ok(JSON.stringify(M.findClip(D.project(), mc.id).clip.notes) === before, "↶ undoes the write exactly");
  D.redo(); ok(JSON.stringify(M.findClip(D.project(), mc.id).clip.notes) === after, "↷ redoes the write exactly");
  D.xmas.host.undo(); D.hum.act("hma:-10");
  D.hum.act("hmuse"); ok(D.redoN() === 0, "a new change clears the ↷ list");
  // 11. 書きこむ（一部の音だけ）
  p = D.project(); var tw = p.tracks[1], cw = tw.clips.filter(function (c) { return c.notes.length > 4; })[0];
  var sel = cw.notes.slice(0, 2), others = JSON.stringify(cw.notes.slice(2)), nW = M.humWrite(p, tw, cw, { pre: "energetic", amt: 100, seed: 3 }, sel);
  ok(nW === 2 && JSON.stringify(cw.notes.filter(function (n) { return sel.indexOf(n) < 0; })) === others, "humWrite with a selection changes only the selected notes", nW);
  // 12. 保存 → 復元・作りなおし
  p = song("pop"); setAll(p, null); p.tracks[1].ext.hum = { pre: "ballad", amt: 60, seed: 11 }; p.tracks[3].ext.hum = { pre: "tight", amt: 40, seed: 2 };
  var evS = JSON.stringify(M.noteEvents(p, 0, Infinity)), back = M.fromRecord(JSON.parse(JSON.stringify(M.toRecord(p, Date.now())))).project;
  ok(JSON.stringify(back.tracks[1].ext.hum) === '{"pre":"ballad","amt":60,"seed":11}' && JSON.stringify(M.noteEvents(back, 0, Infinity)) === evS, "save → restore: the settings come back and the played notes are identical");
  var L = M.sectionsOf(p), sR = D.xmas.host.snapAll(); X.energyApply(p, X.energyPlan(p, L[3].id, 5)); D.xmas.host.commit(sR, "e5");
  ok(JSON.stringify(D.project().tracks[1].ext.hum) === '{"pre":"ballad","amt":60,"seed":11}', "re-making a section (energy) keeps the track's expression");
  // 13. ↷ はアレンジの操作でも（↶ の写し全部）
  var nT = D.project().tracks.length; D.xmas.host.undo();
  ok(D.redoN() === 1, "↶ in the xmas host adds to ↷");
  D.xmas.host.redo(); ok(D.redoN() === 0 && D.project().ext.xmEnergy && D.project().ext.xmEnergy[L[3].id] === 5 && D.project().tracks.length === nT, "↷ in the xmas host brings back the whole snapshot (ext too)");
  // 14. 🏁 仕上げの一覧
  X.ui.tab = "fin"; var fh = X.finishTab(D.xmas.host);
  ok(/演奏の表情/.test(fh) && /data-xm="fHum"/.test(fh) && /data-xm="fHumOff"/.test(fh) && /ソフトバラード 60%/.test(fh), "仕上げ: per-track expression list and the bulk buttons");
  X.ui.tab = "tpl";
  A.stop();
};
