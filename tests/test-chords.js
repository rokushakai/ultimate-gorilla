// コードの理論エンジン（arcade-chords.js）とウクレレのコード辞典・カスタム・マイコード（§169）のテスト
"use strict";
var H = require("./harness");
var ok = H.ok;

function patch(src, file) {
  if (file !== "arcade-ukulele.js") { return src; }
  var a = "      var msg = \"\", msgT = 0, msgGood = false, wrong = null, wrongT = 0;";
  if (src.indexOf(a) < 0) { throw new Error("ukulele patch target missing"); }
  return src.split(a).join(a + " window.__uk2 = function () { return { target: target, correct: correct, cur: current(), pos: pos, mode: mode, ear: ear, msg: msg }; };");
}
function pcsOf(C, shape, lowG) {
  var m = C.shapeMidis(shape, lowG), o = {};
  m.forEach(function (x) { if (x !== null) { o[x % 12] = true; } });
  return o;
}

module.exports = async function () {
  H.suite("chords");
  var env = H.load({ patch: patch });
  var W = env.window, C = W.UGChords, U = W.UGUkulele;
  ok(!!C && !!U, "UGChords test API exists");

  // --- 名前の読み書き ---
  var cases = [
    ["C", "C"], ["Am", "Am"], ["F#m7(b5)", "F#m7(♭5)"], ["Am7-5", "Am7(♭5)"], ["Bbmaj7", "B♭maj7"], ["BbM7", "B♭maj7"], ["C△7", "Cmaj7"],
    ["C7(b9,13)", "C7(♭9,13)"], ["C7b9", "C7(♭9)"], ["E7#9", "E7(♯9)"], ["C/E", "C/E"], ["ConE", "C/E"], ["C on E", "C/E"], ["Am7/G", "Am7/G"],
    ["C°7", "Cdim7"], ["Co", "Cdim"], ["C+", "Caug"], ["Caug7", "Caug7"], ["Csus4", "Csus4"], ["Csus", "Csus4"], ["C7sus4", "C7sus4"], ["Csus2", "Csus2"],
    ["C6/9", "C6/9"], ["C69", "C6/9"], ["Cadd9", "Cadd9"], ["Cmadd9", "Cmadd9"], ["Dm9", "Dm9"], ["G13", "G13"], ["G11", "G11"], ["CmM7", "CmM7"], ["Cm(maj7)", "CmM7"],
    ["Cmaj9", "Cmaj7(9)"], ["C5", "C5"], ["D♭", "C#"], ["G♭m", "F#m"], ["C7(#11)", "C7(♯11)"], ["C7(b5)", "C7(♭5)"], ["Cｍ", null], ["Xyz", null], ["Cq", null], ["", null]
  ];
  var bad = [];
  cases.forEach(function (c) {
    var sp = C.parse(c[0]), got = sp ? C.name(sp) : null;
    if (got !== c[1]) { bad.push(c[0] + " → " + got + " (want " + c[1] + ")"); }
  });
  ok(bad.length === 0, "chord names are read and written back", bad);
  ok(C.name({ root: 0, parts: ["m", "7", "b5"], bass: null }) === "Cm7(♭5)" && C.name({ root: 0, parts: ["7", "b9"], bass: 4 }) === "C7(♭9)/E", "parts build chord names (incl. on-bass)");
  ok(C.addPart(["m", "7"], "M7").join(",") === "m,M7" && C.addPart(["m"], "sus4").join(",") === "sus4", "clashing parts replace each other (7↔Maj7, m↔sus4)");
  var t = C.tones(C.parse("C7(b9)")).map(function (x) { return x.name + x.role; }).join(" ");
  ok(t === "CR E3 G5 B♭♭7 C#♭9", "chord tones with roles", t);
  ok(C.pcs(C.parse("G9")).sort(function (a, b) { return a - b; }).join(",") === "2,5,7,9,11", "9 implies the flat seventh", C.pcs(C.parse("G9")));
  ok(C.pcs(C.parse("Cadd9")).indexOf(10) < 0, "add9 does not add the seventh");

  // --- 押さえ方の自動計算（360コード） ---
  var none = [], wrongNotes = [], tooWide = [], missing = [];
  for (var r = 0; r < 12; r++) {
    C.QUALITIES.forEach(function (q) {
      var sp = { root: r, parts: q.parts, bass: null }, vs = C.voicings(sp, {}), nm = C.name(sp);
      if (!vs.length) { none.push(nm); return; }
      var chord = {}; C.pcs(sp).forEach(function (p) { chord[p] = true; });
      var need = C.intervals(sp.parts).filter(function (iv) { return iv.omit === 0; }).map(function (iv) { return (r + iv.iv) % 12; });
      vs.forEach(function (v) {
        var s = pcsOf(C, v, false);
        Object.keys(s).forEach(function (p) { if (!chord[p]) { wrongNotes.push(nm + " " + v.join("")); } });
        if (C.span(v).span > 4 || C.fingerCount(v) > 4) { tooWide.push(nm + " " + v.join("")); }
        if (need.length <= 4 && need.some(function (p) { return !s[p]; })) { missing.push(nm + " " + v.join("")); }
      });
    });
  }
  ok(none.length === 0, "every one of the 360 dictionary chords has a fingering", none);
  ok(wrongNotes.length === 0, "fingerings only sound chord notes", wrongNotes.slice(0, 5));
  ok(tooWide.length === 0, "fingerings fit the hand (≤5 frets, ≤4 fingers)", tooWide.slice(0, 5));
  ok(missing.length === 0, "fingerings include the 3rd/7th/tensions (only 5th or root may be left out)", missing.slice(0, 5));
  var pref = { C: [0, 0, 0, 3], Am: [2, 0, 0, 0], F: [2, 0, 1, 0], G7: [0, 2, 1, 2] };
  ok(["C", "Am", "F", "G7"].every(function (n) { return U.voice(C.parse(n), false)[0].join() === pref[n].join(); }), "classic shapes come first");
  var ce = C.voicings(C.parse("C/E"), {});
  ok(ce.length > 0 && ce.every(function (v) { var m = C.shapeMidis(v, false); return Math.min.apply(null, m) % 12 === 4; }), "slash chords put the on-note lowest", ce);

  // --- 押さえた形 → 名前 ---
  ok(U.detect([0, 0, 0, 0], false).name === "Am7" && U.detect([3, 3, 3, 3], false).name === "Cm7" && U.detect([2, 0, 0, 0], false).name === "Am", "detects common names (0000=Am7, 3333=Cm7)");
  ok(U.detect([0, 0, 0, 0], false).alts.indexOf("C6") >= 0, "shows other names (Am7 = C6)");
  var tableBad = [];
  U.chordSet("hard").forEach(function (c) { var d = U.detect(c.shape, false); if (d.name !== c.name) { tableBad.push(c.name + "→" + d.name); } });
  ok(tableBad.length === 0, "every classic shape detects as its own name", tableBad);
  var unnamed = 0, total = 0;
  for (r = 0; r < 12; r++) {
    C.QUALITIES.forEach(function (q) {
      var v = C.voicings({ root: r, parts: q.parts, bass: null }, {})[0];
      total++;
      if (!C.detect(v, {}).name) { unnamed++; }
    });
  }
  ok(unnamed / total < 0.05, "engine names almost every dictionary fingering", unnamed + "/" + total);
  var d1 = C.detect([5, 5, 5, 5], {});
  ok(d1 && d1.tones.length > 0, "unknown shapes still list their notes", d1);

  // --- 移調 ---
  ok(C.name(C.transpose(C.parse("C/E"), 2)) === "D/F#" && C.name(C.transpose(C.parse("B♭m7"), 3)) === "C#m7", "transpose roots and on-notes");
  ok(C.shiftShape([0, 0, 0, 3], 2).join() === "2,2,2,5" && C.shiftShape([0, 0, 0, 3], -1).join() === "11,11,11,14", "shift a string-made shape");

  // --- マイコード ---
  U.saveMy([]);
  ok(U.addMy("Cadd9", [0, 2, 0, 3], "テスト") === true && U.addMy("Cadd9", [0, 2, 0, 3], "テスト") === false, "my chords: add and reject duplicates");
  for (var i = 0; i < 60; i++) { U.addMy("X" + i, [i % 12, 0, 0, 0]); }
  ok(U.loadMy().length === 50, "my chords are capped at 50", U.loadMy().length);
  U.saveMy([{ id: 1, name: "ok", shape: [1, 2, 3, 4] }, { name: 5 }, null, { id: 3, name: "bad", shape: [1] }]);
  ok(U.loadMy().length === 1, "broken saved chords are skipped", U.loadMy());

  // --- ゲーム: 辞典から出題（高いポジションでも押さえられる） ---
  function swipe(e, id) { e.ptr("down", 22, 280, id); e.ptr("move", 80, 280, id); e.ptr("move", 160, 280, id); e.ptr("move", 225, 280, id); e.ptr("up", 225, 280, id); }
  var played = 0, highSeen = false, posBad = [];
  var res = env.run("ukulele", { config: { mode: "dict" } }, 3700, function (f, e) {
    if (f % 6 !== 3) { return; }
    var u = W.__uk2();
    if (!u.target) { return; }
    var ids = [];
    u.target.shape.forEach(function (fr, s) {
      if (fr <= 0) { return; }
      var rel = fr - u.pos;
      if (rel < 1 || rel > 6) { posBad.push(u.target.name + " " + u.target.shape.join("") + " pos " + u.pos); return; }
      if (fr > 6) { highSeen = true; }
      e.ptr("down", U.STRX[s], U.NUT_Y + (rel - 0.5) * U.FH, 1 + s); ids.push(1 + s);
    });
    swipe(e, 9);
    ids.forEach(function (id) { e.ptr("up", 0, 0, id); });
    played = W.__uk2().correct;
  });
  ok(posBad.length === 0, "the shown frets always contain the target fingering", posBad.slice(0, 3));
  ok(played >= 100 && res.ended !== null, "dictionary quiz: holding each shown fingering and strumming scores", { played: played, ended: res.ended, high: highSeen });
  ok(U.fitPos([7, 7, 8, 9], 0) === 6 && U.fitPos([0, 0, 0, 3], 6) === 0 && U.fitPos([2, 2, 3, 4], 1) === 1, "position fitting", [U.fitPos([7, 7, 8, 9], 0), U.fitPos([0, 0, 0, 3], 6), U.fitPos([2, 2, 3, 4], 1)]);

  // --- ゲーム: マイコードで練習 ---
  U.saveMy([{ id: 1, name: "マイC", shape: [0, 0, 0, 3] }, { id: 2, name: "マイG", shape: [0, 2, 3, 2] }]);
  var names = {};
  env.run("ukulele", { config: { mode: "my" } }, 200, function (f, e) {
    var u = W.__uk2();
    if (u.target) { names[u.target.name] = true; }
    if (f % 8 === 4 && u.target) {
      var ids = [];
      u.target.shape.forEach(function (fr, s) { if (fr > 0) { e.ptr("down", U.STRX[s], U.NUT_Y + (fr - 0.5) * U.FH, 1 + s); ids.push(1 + s); } });
      swipe(e, 9);
      ids.forEach(function (id) { e.ptr("up", 0, 0, id); });
    }
  });
  ok(names["マイC"] && names["マイG"] && Object.keys(names).length === 2, "my-chord quiz uses only saved chords", names);
  U.saveMy([]);
  env.run("ukulele", { config: { mode: "my" } }, 5);
  ok(W.__uk2().mode === "free", "my-chord quiz without chords falls back to free play");

  // --- 設定画面のタブ ---
  var root = H.makeEl("div"), tabs = ["play", "dict", "custom", "my"], htmlOk = [];
  tabs.forEach(function (tb) {
    U.ui.tab = tb;
    W.UGArcade.start("ukulele", root, { onExit: function () {} });
    htmlOk.push(root.innerHTML.indexOf('data-tab="' + tb + '"') > 0 && root.innerHTML.indexOf("uke-chip active\" data-tab=\"" + tb + "\"") > 0);
    W.UGArcade.stop();
  });
  ok(htmlOk.every(Boolean), "setup screen renders each tab", htmlOk);
  U.ui.tab = "dict"; U.ui.dRoot = 2; U.ui.dQual = "m7b5";
  W.UGArcade.start("ukulele", root, { onExit: function () {} });
  ok(root.innerHTML.indexOf("Dm7(♭5)") > 0 && root.innerHTML.indexOf("♭7") > 0, "dictionary card shows the name and tones", root.innerHTML.slice(0, 0));
  W.UGArcade.stop();
  U.ui.tab = "custom"; U.ui.sMode = "parts"; U.ui.pRoot = 7; U.ui.pParts = ["7", "b9"]; U.ui.pBass = 11;
  W.UGArcade.start("ukulele", root, { onExit: function () {} });
  ok(root.innerHTML.indexOf("G7(♭9)/B") > 0, "parts builder shows the built name", null);
  W.UGArcade.stop();
  U.ui.sMode = "strings"; U.ui.sShape = [2, 4, 1, 3]; U.ui.sName = "";
  W.UGArcade.start("ukulele", root, { onExit: function () {} });
  ok(root.innerHTML.indexOf("Fmaj7") > 0, "string builder names the shape", null);
  W.UGArcade.stop();
  U.ui.tab = "play";

  // ===== §170 シーケンサー =====
  ok(C.seqLen("w").beats === 4 && C.seqLen("q.").beats === 1.5 && Math.abs(C.seqLen("et").beats - 1 / 3) < 1e-9 && C.seqLen("???").id === "q", "note lengths in beats");
  var sw = [0, 0.25, 0.5, 0.75, 1, 1.5].map(function (b) { return Math.round(C.swingBeat(b, 0.67, 0.5) * 1000) / 1000; });
  ok(sw.join(",") === "0,0.335,0.67,0.835,1,1.67", "8th swing 67%: the off-beat moves to 0.67", sw);
  ok(C.swingBeat(0.25, 0.67, 0.25) === 0.335 && C.swingBeat(0.5, 0.67, 0.25) === 0.5 && C.swingBeat(0.7, 0.5, 0.5) === 0.7, "16th swing / no swing", [C.swingBeat(0.25, 0.67, 0.25), C.swingBeat(0.5, 0.67, 0.25)]);
  ok(C.transposeName("C/E", 2) === "D/F#" && C.transposeName("★マイ", 3) === "★マイ", "transpose names");
  function rsv(n, semis) { var sp = C.parse(n); return sp ? { name: C.name(C.transpose(sp, semis)), shape: [0, 0, 0, 3] } : null; }
  var sc = C.schedule({ bpm: 120, key: 0, style: "once", rows: [{ type: "chord", name: "C", len: "w" }, { type: "rest", len: "h" }, { type: "key", semis: 2 }, { type: "chord", name: "Am", len: "q" }, { type: "chord", name: "???", len: "q" }] }, rsv);
  var cr = sc.rows.filter(function (r) { return r.type === "chord"; });
  ok(sc.beats === 8 && Math.abs(sc.time - 4) < 1e-9 && cr[0].t1 === 2 && Math.abs(cr[1].t0 - 3) < 1e-9, "row times at 120 BPM (whole = 2s, half rest = 1s)", sc.rows.map(function (r) { return [r.type, r.t0, r.t1]; }));
  ok(cr[1].name === "Bm" && cr[2].ok === false, "key-change rows transpose what follows / unknown names are marked", cr.map(function (r) { return r.name + ":" + r.ok; }));
  ok(sc.events.length === 2 && sc.events.every(function (e) { return e.kind === "strum" && e.dir === "down"; }), "style 'once' strums each chord once", sc.events.length);
  sc = C.schedule({ bpm: 120, key: 5, style: "e", rows: [{ type: "chord", name: "C", len: "h" }] }, rsv);
  ok(sc.rows[0].name === "F" && sc.events.length === 4 && sc.events.map(function (e) { return e.dir.charAt(0); }).join("") === "dudu" && sc.events[1].t === 0.25, "8th strokes alternate down/up (global key +5: C→F)", sc.events.map(function (e) { return e.t + e.dir; }));
  sc = C.schedule({ bpm: 120, style: "e", swing: 0.67, rows: [{ type: "chord", name: "C", len: "q" }] }, rsv);
  ok(Math.abs(sc.events[1].t - 0.335) < 1e-9, "swing delays the up-stroke", sc.events.map(function (e) { return e.t; }));
  sc = C.schedule({ bpm: 120, style: "arp16", rows: [{ type: "chord", name: "C", len: "q" }] }, rsv);
  ok(sc.events.length === 4 && sc.events.map(function (e) { return e.string; }).join("") === "1023", "16th arpeggio plucks C-G-E-A", sc.events.map(function (e) { return e.string; }));
  sc = C.schedule({ bpm: 60, style: "q", meter: 3, metronome: true, countIn: true, rows: [{ type: "chord", name: "C", len: "h." }, { type: "chord", name: "G", len: "qt" }] }, rsv);
  var clicks = sc.events.filter(function (e) { return e.kind === "click"; }), strums = sc.events.filter(function (e) { return e.kind === "strum"; });
  ok(sc.lead === 3 && clicks.length === 7 && clicks[0].accent && !clicks[1].accent && clicks[3].accent && strums[0].t === 3, "3/4 count-in (3 clicks) + metronome, chords start after the count-in", { lead: sc.lead, clicks: clicks.map(function (c2) { return c2.t + (c2.accent ? "!" : ""); }) });
  ok(strums.length === 4 && Math.abs(strums[3].t - 6) < 1e-9, "a triplet-quarter chord off the grid still sounds at its start", strums.map(function (e) { return e.t; }));
  // 保存データの掃除・マイコードの解決
  var cl = U.seqClean({ bpm: 999, key: 40, swing: 3, style: "zzz", rows: [{ type: "chord", name: "C", len: "bad" }, null, { type: "key", semis: 99 }, { type: "rest", len: "s" }] });
  ok(cl.bpm === 240 && cl.key === 11 && cl.swing === 0.75 && cl.style === "e" && cl.rows.length === 3 && cl.rows[0].len === "q" && cl.rows[1].semis === 11, "broken sequences are cleaned", cl);
  U.saveMy([{ id: 1, name: "マイ", shape: [0, 2, 0, 3] }]);
  var rm = U.resolve("★マイ", 2, false);
  ok(rm && rm.shape.join() === "2,4,2,5" && U.resolve("Q#", 0, false) === null, "★my-chord names resolve (and shift with the key)", rm);
  var st0 = U.seqLoad();
  st0.songs = [{ id: 1, name: "テスト曲", seq: U.seqClean({ bpm: 100 }) }];
  U.seqSave(st0);
  ok(U.seqLoad().songs.length === 1 && U.seqLoad().songs[0].seq.bpm === 100, "songs are saved and loaded");
  ok(U.seqPresets().length === 8 && U.seqPresets().every(function (p) { return p.chords.every(function (n) { return !!U.resolve(n, 0, false); }); }), "all presets resolve to fingerings");

  // 合わせて弾く: 曲どおりに押さえて弾くと CLEAR!、同じ行では1回だけ得点
  var song = { bpm: 240, style: "e", metronome: false, countIn: false, backing: true, rows: [{ type: "chord", name: "C", len: "w" }, { type: "chord", name: "Am", len: "w" }, { type: "rest", len: "w" }, { type: "chord", name: "G7", len: "w" }, { type: "chord", name: "F", len: "w" }] };
  var tg = {}, osc0 = env.counters.osc + env.counters.src.length;
  r = env.run("ukulele", { config: { mode: "seq", seq: song } }, 1200, function (f, e) {
    var u = W.__uk2();
    if (u.target) { tg[u.target.name] = true; }
    if (f % 10 === 0 && u.target) {
      var ids = [];
      u.target.shape.forEach(function (fr, s) { if (fr > 0) { e.ptr("down", U.STRX[s], U.NUT_Y + (fr - u.pos - 0.5) * U.FH, 1 + s); ids.push(1 + s); } });
      swipe(e, 9);
      ids.forEach(function (id) { e.ptr("up", 0, 0, id); });
    }
  });
  ok(r.ended === 400 && env.lastTitle() === "CLEAR!", "play-along: following the song scores once per chord and clears", { ended: r.ended, title: env.lastTitle() });
  ok(Object.keys(tg).join(",") === "C,Am,G7,F", "play-along targets follow the song order", Object.keys(tg));
  ok(env.counters.osc + env.counters.src.length - osc0 > 40, "play-along plays the backing", env.counters.osc + env.counters.src.length - osc0);
  r = env.run("ukulele", { config: { mode: "seq", seq: { rows: [{ type: "chord", name: "???", len: "w" }] } } }, 5);
  ok(W.__uk2().mode === "free", "a song without playable chords falls back to free play");

  // 設定画面のシーケンサー
  st0 = U.seqLoad(); st0.cur = U.seqClean({ rows: [{ type: "chord", name: "Am7", len: "q." }, { type: "chord", name: "Zz", len: "q" }, { type: "key", semis: 2 }] }); U.seqSave(st0);
  U.ui.tab = "seq";
  W.UGArcade.start("ukulele", root, { onExit: function () {} });
  var hs = root.innerHTML;
  ok(hs.indexOf('value="Am7"') > 0 && hs.indexOf("uke-seq-chord bad") > 0 && hs.indexOf("転調") > 0 && hs.indexOf("付点4分") > 0 && hs.indexOf("スイング") > 0 && hs.indexOf("12小節ブルース") > 0, "sequencer tab shows rows, lengths, swing and presets");
  W.UGArcade.stop();
  U.ui.tab = "play";

  // ===== §171 本物らしい音・勉強の助け・耳コピ =====
  var fcases = [[[0, 0, 0, 3], "0,0,0,3"], [[2, 0, 0, 0], "2,0,0,0"], [[0, 2, 3, 2], "0,1,3,2"], [[2, 0, 1, 0], "2,0,1,0"], [[0, 2, 1, 2], "0,2,1,3"],
    [[2, 2, 2, 0], "1,2,3,0"], [[3, 2, 1, 1], "3,2,1,1"], [[1, 2, 0, 2], "1,2,0,3"], [[0, 4, 3, 2], "0,3,2,1"], [[0, 0, 0, 7], "0,0,0,1"], [[0, 0, 0, 0], "0,0,0,0"]];
  var fbad = fcases.filter(function (c2) { return U.fingering(c2[0]).join() !== c2[1]; }).map(function (c2) { return c2[0].join("") + "→" + U.fingering(c2[0]).join(""); });
  ok(fbad.length === 0, "finger numbers follow the usual fingerings (G=0132, B♭=3211 barre…)", fbad);
  ok(U.velocity(0) === 0.45 && U.velocity(60) === 1 && U.velocity(20) > 0.8, "faster swipes are louder", [U.velocity(0), U.velocity(20), U.velocity(60)]);
  var log = [], fakeAc = { currentTime: 0, destination: {}, createGain: function () {
    var n = { gain: { value: 0, setValueAtTime: function (v, t2) { log.push(["set", n.id, v, t2]); }, exponentialRampToValueAtTime: function (v, t2) { log.push(["ramp", n.id, v, t2]); } }, connect: function () {}, disconnect: function () {} };
    n.id = log.length + ":" + Math.random(); return n; } };
  var o4 = [null, null, null, null], g1 = U.stringOut({ audio: {} }, fakeAc, o4, 2, 0.5, 0.8), g2 = U.stringOut({ audio: {} }, fakeAc, o4, 2, 0.9, 0.7), g3 = U.stringOut({ audio: {} }, fakeAc, o4, 1, 0.9, 0.7);
  var ramps = log.filter(function (l) { return l[0] === "ramp"; });
  ok(ramps.length === 1 && ramps[0][1] === g1.id && Math.abs(ramps[0][3] - 0.94) < 1e-9 && g2.gain.value === 0.7 && g3 !== g2, "re-plucking a string fades its previous note (other strings keep ringing)", ramps);
  ok(U.prefs().fingers === true && U.prefs().notes === false, "study aids default: finger numbers on, note names off");
  // 耳コピ: 正解を選ぶと得点、まちがえると正解を教える
  var earSeen = { right: 0, wrong: false, sameRoot: true, revealGhost: true };
  r = env.run("ukulele", { config: { mode: "ear:easy" } }, 3700, function (f, e) {
    var u = W.__uk2();
    if (!u.ear || u.ear.pick >= 0 || u.ear.t < 20) { if (u.ear && u.ear.pick < 0 && u.target) { earSeen.revealGhost = false; } return; }
    var pick = earSeen.wrong ? u.ear.ans : (u.ear.ans + 1) % 4, b = U.earBtn(pick);
    e.tap(b.x + b.w / 2, b.y + b.h / 2);
    if (!earSeen.wrong) { earSeen.wrong = W.__uk2().msg.indexOf("正解は") === 0; } else { earSeen.right++; }
  });
  ok(earSeen.wrong && earSeen.right >= 10 && r.ended !== null && r.ended >= 1000, "ear quiz: right answers score, a wrong one shows the answer", { seen: earSeen, ended: r.ended });
  ok(earSeen.revealGhost, "ear quiz does not show the fingering before you answer");
  var opt = null;
  env.run("ukulele", { config: { mode: "ear:hard" } }, 3, function () { opt = W.__uk2().ear; });
  var roots = opt.opts.map(function (o) { return C.parse(o.name).root; });
  ok(opt.opts.length === 4 && roots.every(function (x) { return x === roots[0]; }) && opt.opts[opt.ans].name === opt.chord.name, "hard ear quiz compares 4 qualities of the same root", opt.opts.map(function (o) { return o.name; }));

  // ===== §172 ストロークパターン・小節・書き出し =====
  ok(C.seqPattern("d-du-udu") === "D-DU-UDU" && C.seqPattern("abc") === "D-DU-UDU" && C.seqPattern("DxX-U") === "Dxx-U" && C.seqPattern("DUDUDUDUDUDUDUDUDU").length === 16, "patterns are cleaned (D/U/-/x, max 16)");
  function evs(sc2, row) { return sc2.events.filter(function (e) { return e.row === row; }).map(function (e) { return e.t + (e.kind === "chuck" ? "x" : e.dir.charAt(0)); }).join(" "); }
  var ps = C.schedule({ bpm: 60, style: "pat", pattern: "D-DU-UDU", rows: [{ type: "chord", name: "C", len: "w" }] }, rsv);
  ok(evs(ps, 0) === "0d 1d 1.5u 2.5u 3d 3.5u", "island strum D-DU-UDU over one bar", evs(ps, 0));
  ps = C.schedule({ bpm: 60, style: "pat", pattern: "D-DU-UDU", rows: [{ type: "chord", name: "C", len: "h" }, { type: "chord", name: "G", len: "h" }] }, rsv);
  ok(evs(ps, 0) === "0d 1d 1.5u" && evs(ps, 1) === "2d 2.5u 3d 3.5u", "the pattern keeps going through a chord change (and the new chord sounds at its start)", [evs(ps, 0), evs(ps, 1)]);
  ps = C.schedule({ bpm: 60, style: "pat", pattern: "D-xUD-xU", rows: [{ type: "chord", name: "C", len: "w" }] }, rsv);
  ok(ps.events.filter(function (e) { return e.kind === "chuck"; }).map(function (e) { return e.t; }).join() === "1,3", "x makes a muted chuck", evs(ps, 0));
  ps = C.schedule({ bpm: 60, meter: 3, style: "pat", pattern: "D-DUDU", rows: [{ type: "chord", name: "C", len: "h." }] }, rsv);
  ok(evs(ps, 0) === "0d 1d 1.5u 2d 2.5u", "3/4 pattern with 6 letters = 8th notes", evs(ps, 0));
  ps = C.schedule({ bpm: 60, style: "once", rows: [{ type: "chord", name: "C", len: "w" }, { type: "chord", name: "G", len: "h" }, { type: "chord", name: "Am", len: "h" }, { type: "chord", name: "F", len: "w" }] }, rsv);
  ok(ps.rows.map(function (r2) { return r2.bar; }).join() === "1,2,0,3" && ps.bars === 3, "bar numbers on rows that start a bar", ps.rows.map(function (r2) { return r2.bar; }));
  var rec = U.seqRec(U.seqClean({ bpm: 120, style: "e", countIn: true, rows: [{ type: "chord", name: "C", len: "h" }] }), false);
  ok(rec.notes.length === 16 && rec.notes[0][0] === 0 && rec.notes[4][0] === 250 && rec.prog.b === 24, "export: every stroke becomes 4 notes, count-in is cut", rec.notes.slice(0, 6));
  var dl0 = env.counters.downloads.length;
  U.exportMidi(U.seqClean({ rows: [{ type: "chord", name: "Am", len: "w" }] }), false);
  ok(env.counters.downloads.length === dl0 + 1 && /^ukulele-\d{8}-\d{4}\.mid$/.test(env.counters.downloads[dl0]), "MIDI export saves ukulele-YYYYMMDD-HHMM.mid", env.counters.downloads.slice(dl0));
  var wavHow = await new Promise(function (resolve) { U.exportWav(U.seqClean({ rows: [{ type: "chord", name: "Am", len: "h" }] }), false, resolve); setTimeout(function () { resolve("timeout"); }, 9500); });
  ok(wavHow === "ok" && /\.wav$/.test(env.counters.downloads[env.counters.downloads.length - 1]), "WAV export renders and saves a .wav", wavHow);
};
