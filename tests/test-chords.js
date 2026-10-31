// コードの理論エンジン（arcade-chords.js）とウクレレのコード辞典・カスタム・マイコード（§169）のテスト
"use strict";
var H = require("./harness");
var ok = H.ok;

function patch(src, file) {
  if (file !== "arcade-ukulele.js") { return src; }
  var a = "      var msg = \"\", msgT = 0, msgGood = false, wrong = null, wrongT = 0;";
  if (src.indexOf(a) < 0) { throw new Error("ukulele patch target missing"); }
  return src.split(a).join(a + " window.__uk2 = function () { return { target: target, correct: correct, cur: current(), pos: pos, mode: mode, ear: ear, msg: msg, L: L, fr: frames }; };");
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
  ok(U.seqPresets().length === 28 && U.seqPresets().every(function (p) { return p.chords.every(function (n) { return !!U.resolve(n, 0, false); }); }), "all presets resolve to fingerings");

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
  ok(r.ended >= 400 && r.ended <= 400 + 20 * 120 && env.lastTitle() === "CLEAR!", "play-along: following the song scores once per chord (+ rhythm points) and clears", { ended: r.ended, title: env.lastTitle() });
  ok(Object.keys(tg).join(",") === "C,Am,G7,F", "play-along targets follow the song order", Object.keys(tg));
  ok(env.counters.osc + env.counters.src.length - osc0 > 40, "play-along plays the backing", env.counters.osc + env.counters.src.length - osc0);
  r = env.run("ukulele", { config: { mode: "seq", seq: { rows: [{ type: "chord", name: "???", len: "w" }] } } }, 5);
  ok(W.__uk2().mode === "free", "a song without playable chords falls back to free play");

  // 設定画面のシーケンサー
  st0 = U.seqLoad(); st0.cur = U.seqClean({ rows: [{ type: "chord", name: "Am7", len: "q." }, { type: "chord", name: "Zz", len: "q" }, { type: "key", semis: 2 }] }); U.seqSave(st0);
  U.ui.tab = "seq"; U.tl.view = "list";
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
  // ===== §174 コードを選ぶ画面・区間ループ・試し聴き =====
  var lseq = U.seqClean({ key: 1, loopOn: true, loopA: 4, loopB: 2, rows: [{ type: "chord", name: "C", len: "w" }, { type: "key", semis: 2 }, { type: "chord", name: "Am", len: "w" }, { type: "chord", name: "F", len: "h" }, { type: "chord", name: "G7", len: "h" }, { type: "chord", name: "C", len: "w" }] });
  var sec = U.seqSection(lseq);
  ok(sec && sec.a === 2 && sec.b === 4 && sec.seq.rows.map(function (r2) { return r2.name; }).join() === "Am,F,G7" && sec.seq.key === 3 && sec.seq.loop === true, "section loop: rows A..B (swapped if needed), earlier key changes carried in", sec && { a: sec.a, b: sec.b, key: sec.seq.key });
  ok(U.seqSection(U.seqClean({ loopOn: false, rows: lseq.rows })) === null, "no section when the loop is off");
  var lsc = U.seqSchedule(sec.seq, false);
  ok(lsc.rows[0].name === "Cm" && lsc.rows[0].i === 0, "section schedule is transposed like the full song (Am +3 = Cm)", lsc.rows[0].name);
  var cl2 = U.seqClean({ loopOn: true, loopA: 50, loopB: -3, rows: [{ type: "chord", name: "C" }, { type: "chord", name: "G" }] });
  ok(cl2.loopA === 1 && cl2.loopB === 0, "section rows are kept inside the song", [cl2.loopA, cl2.loopB]);
  ok(U.seqSemisAt(lseq, 0) === 1 && U.seqSemisAt(lseq, 2) === 3, "key at a row = song key + key changes above it");
  // 区間だけ合わせて弾く（2周で終わる）
  var secRun = env.run("ukulele", { config: { mode: "seq", seq: U.seqSection(U.seqClean({ bpm: 240, countIn: false, loopOn: true, loopA: 1, loopB: 1, rows: [{ type: "chord", name: "C", len: "w" }, { type: "chord", name: "Am", len: "w" }] })).seq } }, 1200);
  ok(secRun.ended !== null && secRun.frames < 400, "play-along of a section ends after 2 passes", secRun);
  // 画面: 🎯 選ぶ・▶・マイコード・辞典・区間ループ
  U.saveMy([{ id: 1, name: "ぼくのC", shape: [0, 0, 0, 3] }, { id: 2, name: "Fmaj7風", shape: [2, 4, 1, 3] }]);
  st0 = U.seqLoad(); st0.cur = lseq; U.seqSave(st0);
  U.ui.tab = "seq"; U.tl.view = "list"; U.pick.row = 0; U.pick.tab = "my";
  W.UGArcade.start("ukulele", root, { onExit: function () {} });
  hs = root.innerHTML;
  ok(hs.indexOf('data-pset="★ぼくのC"') > 0 && hs.indexOf('data-pplay="★Fmaj7風"') > 0 && hs.indexOf("マイコード（2）") > 0, "picker lists all my chords with preview buttons", null);
  ok(hs.indexOf('data-seq="rowplay"') > 0 && hs.indexOf('data-seq="pick"') > 0 && hs.indexOf("マイコードを全部並べる") > 0, "rows have 🎯 pick and ▶ preview buttons", null);
  ok(hs.indexOf("区間ループ") > 0 && hs.indexOf("uke-seq-row inloop") > 0 && hs.indexOf("3〜5行目") > 0, "section loop controls and marked rows", null);
  W.UGArcade.stop();
  U.pick.tab = "dict"; U.pick.root = 9; U.pick.qual = "m7";
  W.UGArcade.start("ukulele", root, { onExit: function () {} });
  ok(root.innerHTML.indexOf('data-pset="Am7"') > 0 && root.innerHTML.indexOf("を入れる") > 0, "picker dictionary builds a chord to insert", null);
  W.UGArcade.stop();
  U.pick.row = 3;
  W.UGArcade.start("ukulele", root, { onExit: function () {} });
  ok(root.innerHTML.indexOf("この行の Key +3") > 0, "picker shows the row's key for previews", null);
  W.UGArcade.stop();
  U.pick.row = -1; U.pick.tab = "my"; U.ui.tab = "play"; U.tl.view = "tl";

  // ===== §176 タイムライン・◯拍・元に戻す =====
  ok(U.seqClean({ rows: [{ type: "chord", name: "C", len: "b2.5" }, { type: "rest", len: "b0.1" }, { type: "chord", name: "G", len: "b40" }] }).rows.map(function (r2) { return r2.len; }).join() === "b2.5,b0.25,b32", "beat lengths are kept (0.25 steps, max 32)");
  ok(C.lenId(2) === "h" && C.lenId(2.75) === "b2.75", "beats → length id (note names when they match)");
  var tsc = U.seqSchedule(U.seqClean({ bpm: 120, countIn: true, rows: [{ type: "chord", name: "C", len: "w" }, { type: "rest", len: "h" }, { type: "chord", name: "G", len: "b1.5" }] }), false);
  ok(Math.abs(U.timeToBeat(tsc, tsc.lead + 1) - 2) < 1e-6 && Math.abs(U.timeToBeat(tsc, tsc.lead + 3.25) - 6.5) < 1e-6 && U.timeToBeat(tsc, 0) === 0, "song time → beat for the play line", [U.timeToBeat(tsc, tsc.lead + 1), U.timeToBeat(tsc, tsc.lead + 3.25)]);
  ok(U.rowAtBeat(tsc, 0) === 0 && U.rowAtBeat(tsc, 4.5) === 1 && U.rowAtBeat(tsc, 6.9) === 2 && U.rowAtBeat(tsc, 99) === -1, "beat → block under it");
  st0 = U.seqLoad(); st0.cur = U.seqClean({ rows: [{ type: "chord", name: "C", len: "w" }, { type: "key", semis: 2 }, { type: "chord", name: "G", len: "b1.5" }] }); U.seqSave(st0);
  U.ui.tab = "seq"; U.tl.view = "tl"; U.tl.sel = -1; U.hist.last = null;
  W.UGArcade.start("ukulele", root, { onExit: function () {} });
  hs = root.innerHTML;
  ok(hs.indexOf('canvas class="uke-tl"') > 0 && hs.indexOf("ブロックをタップすると") > 0 && hs.indexOf('data-seq="undo"') > 0 && hs.indexOf("uke-seq-rows") < 0 && U.hist.last !== null, "timeline view: canvas, undo/redo, no row list", null);
  W.UGArcade.stop();
  U.tl.sel = 2;
  W.UGArcade.start("ukulele", root, { onExit: function () {} });
  hs = root.innerHTML;
  ok(hs.indexOf('data-tl="dup"') > 0 && hs.indexOf('data-tl="longer"') > 0 && hs.indexOf("長さ 1.5拍") > 0 && hs.indexOf('value="G"') > 0, "selected block toolbar (length, duplicate…)", null);
  W.UGArcade.stop();
  U.tl.sel = 1;
  W.UGArcade.start("ukulele", root, { onExit: function () {} });
  ok(root.innerHTML.indexOf("uke-seq-semis") > 0 && root.innerHTML.indexOf('data-tl="longer"') < 0, "a key-change block has no length", null);
  W.UGArcade.stop();
  U.tl.view = "list"; U.tl.sel = -1;
  W.UGArcade.start("ukulele", root, { onExit: function () {} });
  ok(root.innerHTML.indexOf('value="b1.5" selected') > 0, "list view offers the beat length too", null);
  W.UGArcade.stop();
  U.tl.view = "tl"; U.ui.tab = "play";

  // ===== §177 トラック・ミキサー =====
  var tc = U.tracksClean({ bass: { on: 1, vol: 300, pattern: "zz", pan: 5 }, drum: { on: true, groove: "bossa" } });
  ok(tc.uke.on && tc.uke.prog === 24 && tc.bass.on && tc.bass.vol === 100 && tc.bass.pattern === "root" && tc.bass.pan === 0 && tc.drum.groove === "bossa" && !tc.pad.on && tc.pad.prog === 48, "tracks are cleaned (ukulele always on, defaults)", tc);
  function tev(rows, tracks, extra) {
    var sq = U.seqClean(Object.assign({ bpm: 60, countIn: false, style: "once", rows: rows, tracks: tracks }, extra || {}));
    return U.seqSchedule(sq, false);
  }
  function only(sc2, id) { return sc2.events.filter(function (e) { return e.track === id; }); }
  var bs = only(tev([{ type: "chord", name: "C", len: "b8" }, { type: "chord", name: "G7", len: "w" }], { bass: { on: true, pattern: "root" } }), "bass");
  ok(bs.map(function (e) { return e.t + ":" + e.midi; }).join() === "0:48,4:48,8:43", "bass 'root' holds the root and repeats each bar", bs.map(function (e) { return e.t + ":" + e.midi; }));
  bs = only(tev([{ type: "chord", name: "C", len: "w" }], { bass: { on: true, pattern: "r5" } }), "bass");
  ok(bs.map(function (e) { return e.midi; }).join() === "48,43,48,43", "bass root-fifth alternates in quarters", bs.map(function (e) { return e.midi; }));
  bs = only(tev([{ type: "chord", name: "C", len: "w" }, { type: "chord", name: "F", len: "w" }], { bass: { on: true, pattern: "walk" } }), "bass");
  ok(bs.slice(0, 4).map(function (e) { return e.midi; }).join() === "48,52,43,40", "walking bass: root, 3rd, 5th, then a half step into the next root", bs.slice(0, 4).map(function (e) { return e.midi; }));
  bs = only(tev([{ type: "chord", name: "C/E", len: "h" }], { bass: { on: true, pattern: "root8" } }), "bass");
  ok(bs.length === 4 && bs.every(function (e) { return e.midi === 40; }), "slash chords: bass plays the on-note (8ths)", bs.map(function (e) { return e.midi; }));
  var pd = only(tev([{ type: "chord", name: "Am7", len: "w" }], { pad: { on: true } }), "pad");
  ok(pd.length === 8 && pd.every(function (e) { return e.midi >= 57 && e.midi < 69; }) && pd[4].t === 2, "pad: chord tones A3–G#4 every 2 beats", pd.map(function (e) { return e.t + ":" + e.midi; }));
  var dr = only(tev([{ type: "chord", name: "C", len: "w" }, { type: "rest", len: "w" }], { drum: { on: true, groove: "8beat" } }), "drum");
  ok(dr.length === 26 && dr.filter(function (e) { return e.midi === 36; }).map(function (e) { return e.t; }).join() === "0,2,2.5,4,6,6.5", "8-beat drums keep going through rests", dr.length);
  dr = only(tev([{ type: "chord", name: "C", len: "h." }], { drum: { on: true, groove: "waltz" } }, { meter: 3 }), "drum");
  ok(dr.filter(function (e) { return e.midi === 36; }).length === 1 && dr.filter(function (e) { return e.midi === 42; }).map(function (e) { return e.t; }).join() === "1,2", "waltz for 3/4", dr.map(function (e) { return e.t + ":" + e.midi; }));
  U.saveMy([{ id: 1, name: "マイG", shape: [0, 2, 3, 2] }]);
  bs = only(tev([{ type: "chord", name: "★マイG", len: "q" }], { bass: { on: true, pattern: "root" } }), "bass");
  ok(bs.length === 1 && bs[0].midi === 43, "★my chords get a bass note from the detected name", bs);
  var tsq = tev([{ type: "chord", name: "C", len: "q" }], {});
  ok(tsq.events.every(function (e) { return e.kind === "click" || e.track === "uke"; }) && tsq.tracks.uke.on, "ukulele events are tagged with their track");
  var au = U.tracksClean({ bass: { on: true, solo: true }, drum: { on: true }, pad: { on: false, solo: true } });
  ok(U.trackAudible(au, "bass") && !U.trackAudible(au, "uke") && !U.trackAudible(au, "drum") && !U.trackAudible(au, "pad"), "solo: only soloed (and switched on) tracks sound");
  au = U.tracksClean({ uke: { mute: true }, drum: { on: true } });
  ok(!U.trackAudible(au, "uke") && U.trackAudible(au, "drum"), "mute silences a track");
  // ミキサー（出口の音量）
  var made = [], fac = { destination: {}, createGain: function () { var n = { gain: { value: 1 }, connect: function () {} }; made.push(n); return n; } };
  var mx = U.mixer({ audio: {} }, fac, U.tracksClean({ uke: { vol: 50 }, bass: { on: true, mute: true } }));
  ok(Math.abs(mx.uke.g.gain.value - 0.5) < 1e-9 && mx.bass.g.gain.value === 0 && mx.drum.g.gain.value === 0, "mixer gains follow volume / mute / on", [mx.uke.g.gain.value, mx.bass.g.gain.value]);
  // 書き出し: トラックはそれぞれのチャンネル（声部）に、ミュートは入れない
  var xr = U.seqRec(U.seqClean({ countIn: false, style: "once", rows: [{ type: "chord", name: "C", len: "w" }], tracks: { bass: { on: true }, drum: { on: true }, pad: { on: true, mute: true } } }), false);
  var voices = {}; xr.notes.forEach(function (n) { voices[n[2]] = (voices[n[2]] || 0) + 1; });
  ok(voices.b === 4 && voices.p === 1 && voices.d === 13 && !voices.c && xr.prog.p === 32 && xr.prog.d === 128, "export: ukulele/bass/drums on their own channels, muted pad left out", voices);
  // 画面: ミキサー
  st0 = U.seqLoad(); st0.cur = U.seqClean({ rows: [{ type: "chord", name: "C", len: "w" }], tracks: { bass: { on: true }, drum: { on: true } } }); U.seqSave(st0);
  U.ui.tab = "seq";
  W.UGArcade.start("ukulele", root, { onExit: function () {} });
  hs = root.innerHTML;
  ok(hs.indexOf("トラック・ミキサー") > 0 && hs.indexOf('data-tk="mute"') > 0 && hs.indexOf('data-tk="solo"') > 0 && hs.indexOf("ウォーキング") > 0 && hs.indexOf("ボサノバ") > 0 && hs.indexOf("033 Acoustic Bass") > 0, "mixer shows tracks with M/S, patterns, rhythms and instruments", null);
  W.UGArcade.stop();
  U.ui.tab = "play";

  // ===== §178 録音・クオンタイズ・重ね録り・メロディ =====
  var rc = U.tracksClean({ rec1: { on: true, quant: "8", notes: [[1.2, 64, 0.9], ["x", 1], [2, 300], [3, 60]] }, mel: { on: true, notes: [[0, 0.5, 72], [1, 0, 60], [2, 1, 61]] } });
  ok(rc.rec1.notes.length === 2 && rc.rec1.notes[1][2] === 0.8 && rc.rec1.quant === "8" && rc.mel.notes.length === 2 && rc.rec2.quant === "off", "recorded / melody notes are cleaned", rc);
  var rsc = tev([{ type: "chord", name: "C", len: "w" }], { rec1: { on: true, quant: "off", notes: [[0.6, 64, 0.9]] }, rec2: { on: true, quant: "8", notes: [[0.6, 67, 0.7]] }, mel: { on: true, notes: [[1, 0.5, 72]] } }, { swing: 0.67, bpm: 120 });
  var r1 = only(rsc, "rec1")[0], r2 = only(rsc, "rec2")[0], m1 = only(rsc, "mel")[0];
  ok(Math.abs(r1.t - 0.3) < 1e-9 && Math.abs(r2.t - 0.335) < 1e-9 && m1.t === 0.5 && m1.dur === 0.5, "takes: no quantize = as played (no swing), 8th quantize snaps then swings; melody notes", [r1.t, r2.t, m1.t]);
  // 録音: 合わせて弾く画面で弾くと録音1に入る（区間のはじめの拍を足す）
  st0 = U.seqLoad(); st0.cur = U.seqClean({ bpm: 240, countIn: false, rows: [{ type: "chord", name: "C", len: "w" }, { type: "chord", name: "G", len: "w" }] }); U.seqSave(st0);
  r = env.run("ukulele", { config: { mode: "seq", seq: U.seqClean({ bpm: 240, countIn: false, rows: [{ type: "chord", name: "G", len: "w" }] }), rec: "rec1", recOffset: 4 } }, 400, function (f, e) {
    if (f === 40) { var u = W.__uk2(); var ids = []; u.target.shape.forEach(function (fr, s2) { if (fr > 0) { e.ptr("down", U.STRX[s2], U.NUT_Y + (fr - u.pos - 0.5) * U.FH, 1 + s2); ids.push(1 + s2); } }); swipe(e, 9); ids.forEach(function (id) { e.ptr("up", 0, 0, id); }); }
  });
  var took = U.seqLoad().cur.tracks.rec1;
  ok(r.ended !== null && took.on && took.notes.length === 4 && took.notes[0][0] > 4 && took.notes[0][0] < 5 && took.notes.map(function (n) { return n[1]; }).join() === "67,62,67,71", "recording stores the played notes (pitch, beat incl. section offset)", took.notes);
  // 途中でやめても、そこまで残る
  st0 = U.seqLoad(); st0.cur.tracks.rec2.notes = []; U.seqSave(st0);
  env.run("ukulele", { config: { mode: "seq", seq: U.seqClean({ bpm: 60, countIn: false, rows: [{ type: "chord", name: "C", len: "b16" }] }), rec: "rec2" } }, 120, function (f, e) { if (f === 50) { e.key("keydown", " "); e.key("keyup", " "); } });
  ok(U.seqLoad().cur.tracks.rec2.notes.length === 4, "stopping in the middle keeps what was recorded", U.seqLoad().cur.tracks.rec2.notes.length);
  // メロディくずしの録音を取り込む
  env.store["ultimateGorillaMelodyRecV1"] = JSON.stringify([{ id: 77, date: Date.now(), scale: "major", key: 0, mode: "pos", score: 1, prog: {}, notes: [[0, 60, "b"], [480, 62, "p"], [1000, 64, "w"], [1000, 40, "s"], [9000, 70, "b"]] }]);
  var mseq = U.seqClean({ bpm: 120, rows: [{ type: "chord", name: "C", len: "w" }] });
  var got = U.rollImport(mseq, 77, false);
  ok(got === 3 && mseq.tracks.mel.on && mseq.tracks.mel.notes.map(function (n) { return n[0] + ":" + n[2]; }).join() === "0:60,1:62,2:64", "melody-breakout recordings import as beats (no paddle, cut at the song end)", mseq.tracks.mel.notes);
  // 書き出し: 録音・メロディのチャンネル
  var xr2 = U.seqRec(U.seqClean({ countIn: false, rows: [{ type: "chord", name: "C", len: "w" }], tracks: { rec1: { on: true, notes: [[0, 60, 1]] }, rec2: { on: true, prog: 40, notes: [[1, 62, 1]] }, mel: { on: true, prog: 73, notes: [[2, 1, 72]] } } }), false);
  var vv = {}; xr2.notes.forEach(function (n) { vv[n[2]] = (vv[n[2]] || 0) + 1; });
  ok(vv.w === 1 && vv.r === 1 && vv.m === 1 && xr2.prog.r === 40 && xr2.prog.m === 73, "export: takes and melody on their own channels with their instruments", vv);
  // 画面: 録音ボタン・ピアノロール
  st0 = U.seqLoad(); st0.cur = U.seqClean({ rows: [{ type: "chord", name: "C", len: "w" }], tracks: { mel: { on: true, notes: [[0, 1, 60]] }, rec1: { on: true, notes: [[0, 60, 1]] } } }); U.seqSave(st0);
  U.ui.tab = "seq";
  W.UGArcade.start("ukulele", root, { onExit: function () {} });
  hs = root.innerHTML;
  ok(hs.indexOf('data-rec="rec1"') > 0 && hs.indexOf('data-rec="rec2"') > 0 && hs.indexOf('data-recclear="rec1"') > 0 && hs.indexOf("クオンタイズ") > 0, "mixer: record buttons, clear, quantize", null);
  ok(hs.indexOf('canvas class="uke-roll"') > 0 && hs.indexOf("置く長さ") > 0 && hs.indexOf('data-roll="import"') > 0, "piano roll with note length and import", null);
  W.UGArcade.stop();
  U.ui.tab = "play";

  // ===== §179 曲の構成・テンポ・MIDI（トラック別）・プロジェクト・歌詞 =====
  var c4 = U.seqClean({ arr: ["サビ", 3, "", "Aメロ"], lyrics: { id: "9" }, rows: [{ type: "tempo", bpm: 999 }, { type: "sec", name: "<b>サビ</b>" }, { type: "sec" }] });
  ok(c4.rows[0].bpm === 240 && c4.rows[1].name === "bサビ/b" && c4.rows[2].name === "セクション" && c4.arr.join() === "サビ,Aメロ" && c4.lyrics.id === 9, "tempo / section rows, arrangement and lyrics are cleaned", c4);
  var tsc2 = C.schedule({ bpm: 60, metronome: true, style: "once", rows: [{ type: "chord", name: "C", len: "w" }, { type: "tempo", bpm: 120 }, { type: "chord", name: "G", len: "w" }] }, rsv);
  var gRow = tsc2.rows.filter(function (r2) { return r2.type === "chord"; })[1], clk = tsc2.events.filter(function (e) { return e.kind === "click"; }).map(function (e) { return e.t; });
  ok(gRow.t0 === 4 && gRow.t1 === 6 && clk.join() === "0,1,2,3,4,4.5,5,5.5" && tsc2.beatAt(5) === 6 && tsc2.tmRaw(6) === 5 && tsc2.segs.length === 2, "tempo change: later rows and the metronome follow the new tempo", { g: [gRow.t0, gRow.t1], clk: clk });
  var aseq = U.seqClean({ countIn: false, arr: ["サビ", "イントロ", "サビ"], rows: [{ type: "sec", name: "イントロ" }, { type: "chord", name: "C", len: "w" }, { type: "sec", name: "サビ" }, { type: "chord", name: "G", len: "w" }, { type: "chord", name: "F", len: "w" }] });
  var ex = U.expand(aseq);
  ok(ex.rows.map(function (r2) { return r2.type === "sec" ? "#" + r2.name : r2.name; }).join() === "#サビ,G,F,#イントロ,C,#サビ,G,F" && ex._src.join() === "2,3,4,0,1,2,3,4", "arrangement plays sections in the chosen order", ex.rows.map(function (r2) { return r2.name; }));
  var exs = U.seqSchedule(ex, false);
  ok(exs.beats === 20 && exs.rows.filter(function (r2) { return r2.type === "chord"; }).map(function (r2) { return r2.i; }).join() === "3,4,1,3,4", "the arranged schedule points back to the written rows", exs.rows.map(function (r2) { return r2.i; }));
  ok(U.sections(U.seqClean({ rows: [{ type: "chord", name: "C" }, { type: "sec", name: "A" }, { type: "chord", name: "G" }] })).map(function (x) { return x.name; }).join() === "はじめ,A", "rows before the first section are 'はじめ'");
  ok(U.expand(U.seqClean({ rows: [{ type: "chord", name: "C" }] })).rows.length === 1, "no arrangement = as written");
  // 歌詞: コードの拍に / メロディの音に
  env.store["ultimateGorillaLyricsV1"] = JSON.stringify([{ id: 5, date: Date.now(), genres: ["love"], lines: [{ t: 0, words: [{ w: "きみ", t: 0, kind: "word" }, { w: "と", t: 1, kind: "word" }, { w: "ゴリラ", t: 2, kind: "word" }, { w: "の", t: 3, kind: "word" }, { w: "うた", t: 4, kind: "word" }, { w: "あまり", t: 5, kind: "word" }] }] }]);
  var lsq = U.seqClean({ countIn: false, lyrics: { id: 5 }, rows: [{ type: "chord", name: "C", len: "w" }, { type: "rest", len: "w" }] });
  var lp = U.lyricPlace(lsq, U.seqSchedule(lsq, false));
  ok(lp.map(function (x) { return x.beat + x.w; }).join() === "0きみ,1と,2ゴリラ,3の", "lyrics on chord beats (rests skipped, extra words dropped)", lp);
  lsq.tracks.mel.on = true; lsq.tracks.mel.notes = [[0.5, 1, 60], [2, 1, 62]];
  lp = U.lyricPlace(lsq, U.seqSchedule(lsq, false));
  ok(lp.map(function (x) { return x.beat + x.w; }).join() === "0.5きみ,2と", "lyrics follow the melody notes when there is a melody", lp);
  // MIDI フォーマット1
  var mb = U.midiBytes(U.seqClean({ bpm: 60, countIn: false, style: "q", lyrics: { id: 5 }, rows: [{ type: "chord", name: "C", len: "h" }, { type: "tempo", bpm: 120 }, { type: "chord", name: "G", len: "h" }], tracks: { bass: { on: true }, drum: { on: true }, pad: { on: true, mute: true } } }), false);
  function u32(a2, i2) { return ((a2[i2] << 24) >>> 0) + (a2[i2 + 1] << 16) + (a2[i2 + 2] << 8) + a2[i2 + 3]; }
  var fmt = (mb[8] << 8) + mb[9], ntr = (mb[10] << 8) + mb[11], pos2 = 14, trks = [];
  for (var tn = 0; tn < ntr; tn++) { var ln = u32(mb, pos2 + 4); trks.push(mb.slice(pos2 + 8, pos2 + 8 + ln)); pos2 += 8 + ln; }
  function countSeq(arr, sq) { var n = 0; for (var q = 0; q + sq.length <= arr.length; q++) { var okq = true; for (var z = 0; z < sq.length; z++) { if (arr[q + z] !== sq[z]) { okq = false; break; } } if (okq) { n++; } } return n; }
  ok(fmt === 1 && ntr === 5 && pos2 === mb.length, "SMF format 1: conductor + ukulele + bass + drums + lyrics (muted pad left out)", { fmt: fmt, ntr: ntr });
  ok(countSeq(trks[0], [0xFF, 0x51, 0x03]) === 2 && countSeq(trks[4], [0xFF, 0x05]) === 4, "tempo changes and lyric events are written", [countSeq(trks[0], [0xFF, 0x51, 0x03]), countSeq(trks[4], [0xFF, 0x05])]);
  var ukeOn = 0; for (var q2 = 0; q2 < trks[1].length - 2; q2++) { if (trks[1][q2] === 0x90 && trks[1][q2 + 2] > 0) { ukeOn++; } }
  ok(ukeOn === 16 && countSeq(trks[1], [0xC0, 24]) === 1, "ukulele track: 4 strokes × 4 strings with the program", ukeOn);
  // 合わせて弾く画面に いまの言葉
  var lyrSeen = "";
  env.run("ukulele", { config: { mode: "seq", seq: U.seqClean({ bpm: 120, countIn: false, lyrics: { id: 5 }, rows: [{ type: "chord", name: "C", len: "w" }] }) } }, 90, function () {
    var tx = env.counters.texts.filter(function (t2) { return t2.indexOf("♪ ") === 0; });
    if (tx.length) { lyrSeen = tx[tx.length - 1]; }
  });
  ok(lyrSeen === "♪ ゴリラ" || lyrSeen === "♪ と" || lyrSeen === "♪ の", "play-along shows the current lyric word", lyrSeen);
  // プロジェクト
  U.saveMy([{ id: 1, name: "マイC", shape: [0, 0, 0, 3] }]);
  var pj = U.projectJson(U.seqClean({ bpm: 133, rows: [{ type: "chord", name: "Am", len: "w" }] }));
  U.saveMy([{ id: 1, name: "べつの", shape: [2, 0, 0, 0] }]);
  var rd = U.projectRead(pj);
  ok(rd && rd.seq.bpm === 133 && rd.seq.rows[0].name === "Am" && rd.added === 1 && U.loadMy().length === 2, "project file round-trips the song and adds missing my-chords", rd && { bpm: rd.seq.bpm, added: rd.added });
  ok(U.projectRead("{\"type\":\"other\"}") === null && U.projectRead("not json") === null, "other files are rejected");
  // 画面
  st0 = U.seqLoad(); st0.cur = U.seqClean({ lyrics: { id: 5 }, arr: ["サビ"], rows: [{ type: "sec", name: "サビ" }, { type: "chord", name: "C", len: "w" }, { type: "tempo", bpm: 100 }] }); U.seqSave(st0);
  U.ui.tab = "seq"; U.tl.view = "list";
  W.UGArcade.start("ukulele", root, { onExit: function () {} });
  hs = root.innerHTML;
  ok(hs.indexOf("uke-seq-secname") > 0 && hs.indexOf("uke-seq-bpm") > 0 && hs.indexOf('data-arradd="サビ"') > 0 && hs.indexOf('data-arrdel="0"') > 0 && hs.indexOf("uke-lyr-pick") > 0 && hs.indexOf('data-seq="projSave"') > 0 && hs.indexOf("uke-proj-file") > 0, "list shows section/tempo rows; arrangement, lyrics and project controls", null);
  W.UGArcade.stop();
  U.tl.view = "tl"; U.ui.tab = "play";

  // ===== §175 ポジション・表示するフレット数 =====
  ok(["0,0,0,3", "2,0,1,0", "5,4,3,3", "9,7,8,7", "0,0,0,7", "2,2,2,0"].map(function (t2) { return C.posOf(t2.split(",").map(Number)); }).join() === "low,low,mid,high,high,low", "position of a fingering (low / mid / high)");
  ok(C.voicingsAt(C.parse("C"), "mid")[0].join() === "5,4,3,3" && C.voicingsAt(C.parse("Am"), "high")[0].join() === "9,9,8,7" && C.voicingsAt(C.parse("F"), "high")[0].join() === "10,9,8,8", "classic mid/high shapes (C=5433, Am=9987, F=10988)");
  ok(C.voicingsAt(C.parse("C"), "auto")[0].join() === "0,0,0,3", "auto keeps the usual shape");
  var posMiss = 0, posBadNotes = [], posNone = [];
  ["low", "mid", "high"].forEach(function (pz) {
    for (var rr = 0; rr < 12; rr++) {
      C.QUALITIES.forEach(function (q) {
        var sp = { root: rr, parts: q.parts, bass: null }, v = C.voicingsAt(sp, pz, {});
        if (!v.length) { posNone.push(pz + " " + C.name(sp)); return; }
        if (C.posOf(v[0]) !== pz) { posMiss++; }
        var chord = {}; C.pcs(sp).forEach(function (pc) { chord[pc] = true; });
        Object.keys(pcsOf(C, v[0], false)).forEach(function (pc) { if (!chord[pc]) { posBadNotes.push(pz + " " + C.name(sp) + " " + v[0].join("-")); } });
        if (Math.max.apply(null, v[0]) > 15) { posBadNotes.push("over15 " + C.name(sp)); }
      });
    }
  });
  ok(posNone.length === 0 && posBadNotes.length === 0, "every chord has a fingering for each position, only chord notes, within 15 frets", { none: posNone.slice(0, 3), bad: posBadNotes.slice(0, 3) });
  // Cm7（3333）や E♭7（3334）のように、ローに形がないコードもある（そのときはいちばん近い形を使う）
  ok(posMiss / 1080 < 0.08, "almost all chords have a fingering exactly in the chosen position", posMiss + "/1080");
  // シーケンサー: 全体のポジションと行ごとの指定
  var pseq = U.seqClean({ pos: "high", rows: [{ type: "chord", name: "Am", len: "w" }, { type: "chord", name: "Am", len: "w", pos: "low" }, { type: "chord", name: "Am", len: "w", pos: "zz" }] });
  var psc = U.seqSchedule(pseq, false);
  ok(pseq.rows[2].pos === "auto" && C.posOf(psc.rows[0].shape) === "high" && psc.rows[1].shape.join() === "2,0,0,0" && C.posOf(psc.rows[2].shape) === "high", "song position applies to 'auto' rows, a row can override it", psc.rows.map(function (r2) { return r2.shape.join(""); }));
  ok(U.seqClean({ pos: "???" }).pos === "auto", "bad position is cleaned to auto");
  // 表示するフレット数
  var L15 = U.layout(15), L6 = U.layout(6), Lx = U.layout(7);
  ok(L15.frets === 15 && L15.nut + 15 * L15.fh <= L15.strumY && L6.fh === 28 && L6.nut === U.NUT_Y && Lx.frets === 6, "fret-count layouts (15 frets fit above the strum area; unknown counts fall back to 6)", { L15: L15, Lx: Lx.frets });
  ok(U.FRET_CHOICES.map(function (c3) { return c3[0]; }).join() === "5,6,8,9,12,15,18", "fret count choices");
  ok(U.fitPos([9, 9, 8, 7], 0, 15) === 0 && U.fitPos([9, 9, 8, 7], 0, 6) === 6 && U.fitPos([14, 14, 13, 15], 0, 9) === 9 && U.fitPos([17, 17, 16, 18], 0, 6) === 12, "position fitting uses the shown fret count (up to fret 18)");
  // ゲーム: 15フレット表示・ハイで出題 → 押さえて正解できる
  var hiSeen = 0, hiBad = [];
  r = env.run("ukulele", { config: { mode: "dict", frets: 15, posPref: "high" } }, 1500, function (f, e) {
    if (f % 6 !== 3) { return; }
    var u = W.__uk2();
    if (!u.target) { return; }
    if (C.posOf(u.target.shape) === "high") { hiSeen++; }
    var ids = [];
    u.target.shape.forEach(function (fr, s2) {
      if (fr <= 0) { return; }
      var rel = fr - u.pos;
      if (rel < 1 || rel > u.L.frets) { hiBad.push(u.target.shape.join("-") + " pos " + u.pos); return; }
      e.ptr("down", U.STRX[s2], u.L.nut + (rel - 0.5) * u.L.fh, 1 + s2); ids.push(1 + s2);
    });
    swipe(e, 9);
    ids.forEach(function (id) { e.ptr("up", 0, 0, id); });
  });
  ok(hiBad.length === 0 && hiSeen > 5 && W.__uk2().correct >= 10 && W.__uk2().L.frets === 15, "15-fret view with high-position quiz: shapes are on screen and playable", { bad: hiBad.slice(0, 3), seen: hiSeen, correct: W.__uk2().correct });
  // 設定画面
  U.ui.tab = "play";
  W.UGArcade.start("ukulele", root, { onExit: function () {} });
  ok(root.innerHTML.indexOf("表示するフレット数") > 0 && root.innerHTML.indexOf("18（テナー全部）") > 0 && root.innerHTML.indexOf("辞典から出題のポジション") > 0, "play tab has fret count and quiz position", null);
  W.UGArcade.stop();
  U.ui.tab = "dict"; U.ui.dRoot = 9; U.ui.dQual = "m"; U.ui.vPos = "high"; U.ui.dVoice = 0;
  W.UGArcade.start("ukulele", root, { onExit: function () {} });
  ok(root.innerHTML.indexOf("uke-chip active\" data-vpos=\"high\"") > 0 && root.innerHTML.indexOf("押さえ方 9-9-8-7") > 0, "dictionary shows the high-position fingering", null);
  W.UGArcade.stop();
  U.ui.vPos = "auto"; U.ui.tab = "play";

  // ===== §180 構成どおりの再生位置・でたらめな曲200曲 =====
  var a80 = U.seqClean({ countIn: false, arr: ["サビ", "イントロ"], rows: [{ type: "sec", name: "イントロ" }, { type: "chord", name: "C", len: "w" }, { type: "sec", name: "サビ" }, { type: "chord", name: "G", len: "h" }] });
  var aS = U.seqSchedule(U.expand(a80), false), wS = U.seqSchedule(a80, false);
  ok(U.arrangedToWritten(aS, wS, 1) === 5 && U.arrangedToWritten(aS, wS, 3) === 1 && U.arrangedToWritten(aS, wS, 99) === null, "arranged play position maps onto the written rows", [U.arrangedToWritten(aS, wS, 1), U.arrangedToWritten(aS, wS, 3)]);
  var seedV = 20261025;
  function rnd2() { seedV = (seedV * 1103515245 + 12345) % 2147483648; return seedV / 2147483648; }
  function pickR(arr2) { return arr2[Math.floor(rnd2() * arr2.length)]; }
  function u32b(a2, i2) { return ((a2[i2] << 24) >>> 0) + (a2[i2 + 1] << 16) + (a2[i2 + 2] << 8) + a2[i2 + 3]; }
  U.saveMy([{ id: 1, name: "マイX", shape: [2, 4, 1, 3] }]);
  var NAMES = ["C", "Am", "F", "G7", "Bbmaj7", "F#m7(b5)", "C/E", "E7#9", "★マイX", "★ない", "Zz", "", "Cmaj9", "Dsus4", "G13"];
  var LENS = ["w", "h.", "h", "q.", "q", "qt", "e.", "e", "et", "s", "b2.5", "b0.25", "b7", "bad"];
  var fuzzBad = [], checked = 0;
  for (var fz = 0; fz < 200; fz++) {
    var rows = [], nr = Math.floor(rnd2() * 18), z;
    for (z = 0; z < nr; z++) {
      var kind = pickR(["chord", "chord", "chord", "rest", "key", "tempo", "sec"]);
      if (kind === "chord") { rows.push({ type: "chord", name: pickR(NAMES), len: pickR(LENS), pos: pickR(["auto", "low", "mid", "high", "zz"]) }); }
      else if (kind === "rest") { rows.push({ type: "rest", len: pickR(LENS) }); }
      else if (kind === "key") { rows.push({ type: "key", semis: Math.floor(rnd2() * 30) - 15 }); }
      else if (kind === "tempo") { rows.push({ type: "tempo", bpm: Math.floor(rnd2() * 300) }); }
      else { rows.push({ type: "sec", name: pickR(["A", "B", "サビ"]) }); }
    }
    var recN = []; for (z = 0; z < Math.floor(rnd2() * 20); z++) { recN.push([rnd2() * 40, 50 + Math.floor(rnd2() * 30), rnd2()]); }
    var melN = []; for (z = 0; z < Math.floor(rnd2() * 20); z++) { melN.push([rnd2() * 40, pickR([0.25, 0.5, 1, 2]), 55 + Math.floor(rnd2() * 30)]); }
    var raw = {
      bpm: Math.floor(rnd2() * 300), key: Math.floor(rnd2() * 30) - 15, meter: pickR([3, 4, 5]), swing: pickR([0.5, 0.58, 0.67, 0.72, 0.9]), swingGrid: pickR([0.5, 0.25, 1]),
      style: pickR(["once", "q", "e", "s", "arp8", "arp16", "pat", "x"]), pattern: pickR(["D-DU-UDU", "x", "DUxx", "", "DUDUDUDUDUDUDUDUDU"]), metronome: rnd2() < 0.5, countIn: rnd2() < 0.5,
      pos: pickR(["auto", "high", "q"]), arr: rnd2() < 0.5 ? [pickR(["A", "B", "サビ", "ない"]), pickR(["A", "B", "サビ"])] : [], lyrics: { id: rnd2() < 0.3 ? 5 : 0 }, rows: rows,
      tracks: { bass: { on: rnd2() < 0.5, pattern: pickR(["root", "root8", "r5", "walk", "?"]) }, drum: { on: rnd2() < 0.5, groove: pickR(["8beat", "bossa", "waltz", "??"]) }, pad: { on: rnd2() < 0.5 },
        rec1: { on: rnd2() < 0.5, quant: pickR(["off", "8", "16"]), notes: recN }, mel: { on: rnd2() < 0.5, notes: melN } }
    };
    try {
      var cs = U.seqClean(raw);
      if (JSON.stringify(U.seqClean(cs)) !== JSON.stringify(cs)) { fuzzBad.push(fz + " clean not stable"); }
      var ex2 = U.expand(cs), sc3 = U.seqSchedule(ex2, false), lastT = -1;
      for (z = 0; z < sc3.events.length; z++) {
        var ev3 = sc3.events[z];
        if (!(isFinite(ev3.t) && ev3.t >= 0) || ev3.t < lastT - 1e-9) { fuzzBad.push(fz + " event time " + ev3.t); break; }
        lastT = ev3.t;
      }
      sc3.rows.forEach(function (r3) { if (!(r3.t1 >= r3.t0 - 1e-9) || !isFinite(r3.t0)) { fuzzBad.push(fz + " row time"); } });
      var rec3 = U.seqRec(cs, false);
      if (rec3.notes.some(function (n3) { return !isFinite(n3[0]) || n3[0] < 0; })) { fuzzBad.push(fz + " rec ms"); }
      var mb3 = U.midiBytes(cs, false);
      if (mb3) {
        var pos3 = 14, nt3 = (mb3[10] << 8) + mb3[11];
        if (String.fromCharCode(mb3[0], mb3[1], mb3[2], mb3[3]) !== "MThd") { fuzzBad.push(fz + " MThd"); }
        for (z = 0; z < nt3; z++) {
          var ln3 = u32b(mb3, pos3 + 4);
          if (String.fromCharCode(mb3[pos3], mb3[pos3 + 1], mb3[pos3 + 2], mb3[pos3 + 3]) !== "MTrk" || mb3[pos3 + 8 + ln3 - 3] !== 0xFF || mb3[pos3 + 8 + ln3 - 2] !== 0x2F) { fuzzBad.push(fz + " MTrk " + z); break; }
          pos3 += 8 + ln3;
        }
        if (pos3 !== mb3.length) { fuzzBad.push(fz + " midi length"); }
      }
      var wS3 = U.seqSchedule(cs, false), pp = U.arrangedToWritten(sc3, wS3, sc3.beats / 2);
      if (pp !== null && !(pp >= 0 && pp <= wS3.beats + 1e-6)) { fuzzBad.push(fz + " play map " + pp); }
      checked++;
    } catch (fe) { fuzzBad.push(fz + " " + fe.message); }
  }
  ok(checked === 200 && fuzzBad.length === 0, "200 random songs: clean is stable, times never go back, MIDI chunks are well-formed", fuzzBad.slice(0, 5));

  // ===== §181 指板にマーキング・引きのビュー =====
  ok(U.markSet([0, 0, 0, 3], 3, 3).join() === "0,0,0,0" && U.markSet([0, 0, 0, 3], 1, 15).join() === "0,15,0,3" && U.markSet([2, 0, 0, 0], 0, 0).join() === "0,0,0,0" && U.MARK_FRETS === 15, "marking: tap sets the fret, tapping it again opens the string (up to fret 15)");
  ok(U.detect([0, 12, 12, 12], false).name !== "" && U.detect([14, 12, 12, 12], false).tones.length > 0, "shapes up to fret 15 are named");
  var Lc = U.layout(12, true);
  ok(Lc.compact && Lc.nut === 30 && Math.abs(Lc.nut + 12 * Lc.fh - 380) < 1e-9 && Lc.strumY === 386 && Lc.h === 420, "zoomed-out layout: taller screen (420), fretboard 30–380, small sound hole", Lc);
  var cls = [], croot = H.makeEl("div");
  croot.classList = { add: function (c5) { cls.push("+" + c5); }, remove: function (c5) { cls.push("-" + c5); }, contains: function () { return false; } };
  var cparts = {};
  croot.querySelector = function (sel) {
    if (!cparts[sel]) {
      cparts[sel] = H.makeEl(sel);
      if (sel === ".arcade-canvas") { cparts[sel].getContext = function () { return new Proxy({}, { get: function (t5, k5) { return t5[k5] !== undefined ? t5[k5] : function () {}; }, set: function (t5, k5, v5) { t5[k5] = v5; return true; } }); }; }
    }
    return cparts[sel];
  };
  W.UGArcade.start("ukulele", croot, { config: { mode: "free", compact: true, frets: 8 }, onExit: function () {} });
  W.UGArcade.stop();
  ok(cls.indexOf("+arcade-compact") >= 0 && cls[cls.length - 1] === "-arcade-compact", "zoomed-out view hides the extras while playing and restores them after", cls);
  var posSeen = [];
  env.run("ukulele", { config: { mode: "free", compact: true, frets: 8 } }, 12, function (f, e) {
    // ハーネスの canvas は 320 の高さとして位置を返すので、論理 420 の y は 320/420 倍して渡す
    var k3 = 320 / 420;
    if (f === 2) { e.tap(15, 330 * k3); posSeen.push(W.__uk2().pos); e.tap(15, 330 * k3); posSeen.push(W.__uk2().pos); e.tap(15, 40 * k3); posSeen.push(W.__uk2().pos); }
  });
  ok(posSeen.join() === "1,2,1", "zoomed-out view: tap the fret-number column to move the position", posSeen);
  U.ui.tab = "custom"; U.ui.sMode = "strings"; U.ui.sShape = [0, 15, 0, 3]; U.ui.markBig = false;
  W.UGArcade.start("ukulele", root, { onExit: function () {} });
  hs = root.innerHTML;
  ok(hs.indexOf('canvas class="uke-mark" data-k="mark"') > 0 && hs.indexOf('<option value="15" selected>') > 0 && hs.indexOf('data-markbig="1"') > 0 && hs.indexOf("uke-mark-full") < 0, "string builder has a marking fretboard and 0–15 frets", null);
  W.UGArcade.stop();
  U.ui.markBig = true;
  W.UGArcade.start("ukulele", root, { onExit: function () {} });
  ok(root.innerHTML.indexOf("uke-mark-full") > 0 && root.innerHTML.indexOf('data-k="markbig"') > 0 && root.innerHTML.indexOf('data-markbig="0"') > 0, "big marking view with close button", null);
  W.UGArcade.stop();
  U.ui.markBig = false; U.ui.tab = "play";
  W.UGArcade.start("ukulele", root, { onExit: function () {} });
  ok(root.innerHTML.indexOf('data-pp="view"') > 0 && root.innerHTML.indexOf("引き（ボタンを減らして指板を大きく）") > 0, "play tab: screen view choice", null);
  W.UGArcade.stop();

  // ===== §184 ハイブリッド =====
  var hy = [], cy2 = function (f) { return U.NUT_Y + (f - 0.5) * U.FH; };
  env.run("ukulele", { config: { mode: "free", hybrid: true } }, 10, function (f, e) {
    if (f !== 2) { return; }
    e.tap(U.STRX[0], cy2(2)); e.tap(U.STRX[3], cy2(3)); hy.push(W.__uk2().cur.join(""));
    e.key("keydown", " "); e.key("keyup", " ");
    hy.push(W.__uk2().cur.join(""));
    e.tap(U.STRX[1], cy2(2)); hy.push(W.__uk2().cur.join(""));
    e.tap(U.STRX[2], cy2(3)); hy.push(W.__uk2().cur.join(""));
    e.tap(U.STRX[2], cy2(3)); hy.push(W.__uk2().cur.join(""));
  });
  ok(hy.join() === "2003,2003,0200,0230,0200", "hybrid: marks stay after strumming, the next tap replaces them, later taps add/toggle as in hold", hy);
  U.ui.tab = "play";
  W.UGArcade.start("ukulele", root, { onExit: function () {} });
  ok(root.innerHTML.indexOf("ハイブリッド（鳴らしたら次の押さえで入れかえ）") > 0, "play tab offers the hybrid fingering mode", null);
  W.UGArcade.stop();

  // ===== §193 トラックを追加 =====
  var xt = U.tracksClean(null);
  ok(xt.xs.length === 0 && U.trackIds(xt).length === 7, "no extra tracks at first");
  var x1 = U.xAdd(xt, "strings"), x2 = U.xAdd(xt, "arp"), x3 = U.xAdd(xt, "mel");
  ok(x1 === "x1" && x2 === "x2" && x3 === "x3" && xt.x1.prog === 48 && xt.x1.play === "hold" && xt.x2.play === "arpud" && xt.x3.kind === "notes" && xt.x1.name === "ストリングス", "add tracks from presets (strings / synth arpeggio / melody)", xt.x1);
  ok(U.xMove(xt, "x3", -1) && xt.xs.join() === "x1,x3,x2" && !U.xMove(xt, "x1", -1) && U.xRemove(xt, "x1") && xt.xs.join() === "x3,x2" && xt.x1 === undefined && U.xAdd(xt, "piano") === "x1", "move / remove tracks, ids are reused", xt.xs);
  for (var xa = 0; xa < 10; xa++) { U.xAdd(xt, "organ"); }
  ok(xt.xs.length === 8 && U.xAdd(xt, "organ") === null, "up to 8 extra tracks", xt.xs.length);
  var xc = U.tracksClean({ xs: ["x2", "x2", "x9", "x5", "x4"], x2: { preset: "synpad", play: "zz", oct: 5, vol: 300, name: "あいうえおかきくけこさしすせ" }, x5: { preset: "mel", notes: [[0, 1, 60], [1, 99, 61], ["a", 1, 62]] } });
  ok(xc.xs.join() === "x2,x5" && xc.x2.play === "hold" && xc.x2.oct === 0 && xc.x2.vol === 100 && xc.x2.name.length === 12 && xc.x5.notes.length === 1, "extra tracks are cleaned (bad ids, styles, notes dropped)", xc);
  function xEv(preset, rows, more) {
    var tr0 = U.tracksClean(null), id0 = U.xAdd(tr0, preset), k0;
    for (k0 in (more || {})) { tr0[id0][k0] = more[k0]; }
    var sq0 = U.seqClean({ countIn: false, rows: rows, tracks: tr0 });
    return U.seqSchedule(sq0, false).events.filter(function (e) { return e.track === id0; });
  }
  var es = xEv("strings", [{ type: "chord", name: "C", len: "w" }, { type: "chord", name: "Am", len: "w" }]);
  ok(es.length === 6 && es[0].midi === 60 && es.slice(0, 3).map(function (e) { return e.midi; }).join() === "60,64,67" && es[3].beat === 4 && es[0].dur === 4, "strings hold the chord tones (C → C4 E4 G4) for each bar", es.map(function (e) { return e.midi + "@" + e.beat; }));
  var ea = xEv("arp", [{ type: "chord", name: "C", len: "h" }]);
  ok(ea.map(function (e) { return e.midi; }).join() === "60,64,67,64,60,64,67,64" && Math.abs(ea[1].beat - 0.25) < 1e-9, "synth arpeggio goes up and down in 16ths", ea.map(function (e) { return e.midi; }));
  var eo = xEv("poly", [{ type: "chord", name: "G", len: "w" }]);
  ok(eo.length === 12 && eo[0].beat === 0.5 && eo.every(function (e) { return e.dur <= 0.5; }), "offbeat synth plays only the 'and's", eo.length);
  var eb = xEv("brass", [{ type: "chord", name: "F", len: "w" }], { oct: 1 });
  ok(eb.length === 6 && eb[3].beat === 1.5 && eb.slice(0, 3).map(function (e) { return e.midi; }).join() === "69,72,77", "brass hits on 1 and the and-of-2, an octave up", eb.map(function (e) { return e.midi + "@" + e.beat; }));
  var en = xEv("mel", [{ type: "chord", name: "C", len: "w" }], { notes: [[0, 1, 72], [1, 0.5, 74]] });
  ok(en.length === 2 && en[1].midi === 74 && en[1].dur === 0.5, "a piano-roll track plays its notes", en);
  var xm = U.tracksClean(null); U.xAdd(xm, "strings"); U.xAdd(xm, "synmel"); xm.x2.notes = [[0, 1, 70]];
  var mb = U.midiBytes(U.seqClean({ countIn: false, rows: [{ type: "chord", name: "C", len: "w" }], tracks: xm }), false), mtc = 0;
  for (var mi9 = 0; mi9 + 3 < mb.length; mi9++) { if (mb[mi9] === 0x4D && mb[mi9 + 1] === 0x54 && mb[mi9 + 2] === 0x72 && mb[mi9 + 3] === 0x6B) { mtc++; } }
  var pcCh = []; for (mi9 = 0; mi9 + 1 < mb.length; mi9++) { if ((mb[mi9] & 0xF0) === 0xC0 && (mb[mi9] & 15) !== 0 && mb[mi9 - 1] === 0) { pcCh.push((mb[mi9] & 15) + ":" + mb[mi9 + 1]); } }
  ok(mtc === 4 && pcCh.indexOf("3:48") >= 0 && pcCh.indexOf("7:80") >= 0, "MIDI: each extra track is its own MTrk on channels 3, 7…", [mtc, pcCh]);
  var wr = U.seqRec(U.seqClean({ countIn: false, rows: [{ type: "chord", name: "C", len: "w" }], tracks: xm }), false);
  ok(wr.prog.x1 === 48 && wr.prog.x2 === 80 && wr.notes.some(function (n9) { return n9[2] === "x1"; }), "WAV: extra tracks are rendered with their own sound", wr.prog);
  xm.x1.solo = true;
  ok(U.trackAudible(xm, "x1") && !U.trackAudible(xm, "uke") && !U.trackAudible(xm, "x2"), "solo works with extra tracks");
  st0 = U.seqLoad(); st0.cur = U.seqClean({ rows: [{ type: "chord", name: "C", len: "w" }], tracks: { mel: { on: true }, xs: ["x1", "x2"], x1: { preset: "strings" }, x2: { preset: "synmel", notes: [[0, 1, 70]] } } }); U.seqSave(st0);
  U.ui.tab = "seq"; U.roll.track = "x2";
  W.UGArcade.start("ukulele", root, { onExit: function () {} });
  hs = root.innerHTML;
  ok(hs.indexOf('data-xadd="synpad"') > 0 && hs.indexOf('data-xdel="x1"') > 0 && hs.indexOf('data-xmove="x2:-1"') > 0 && hs.indexOf("uke-roll-trk") > 0 && hs.indexOf('<option value="x2" selected>') > 0 && hs.indexOf('data-xroll="x2"') > 0 && hs.indexOf("（2 / 8本）") > 0, "mixer shows extra tracks, the add buttons, and the piano roll track picker", null);
  W.UGArcade.stop();
  U.ui.tab = "play"; U.roll.track = "mel";

  // ===== §192 ジャンルでおまかせ伴奏 =====
  ok(U.GENRES.length === 59 && U.genresFor(4).length === 53 && U.genresFor(3).length === 6, "59 genres (53 in 4/4, 6 in 3/4)");
  var grpIds = [];
  U.GENRE_GROUPS.forEach(function (gp) { grpIds = grpIds.concat(gp[1]); });
  ok(grpIds.length === 59 && U.GENRES.every(function (gg) { return grpIds.indexOf(gg[0]) >= 0; }), "every genre is in exactly one heading", grpIds.length);
  ok(U.GENRES.every(function (gg) { return U.genre(gg[0]).layers.every(function (ly) { return U.X_PRESETS.some(function (p) { return p[0] === ly.preset; }) && ly.prog < 128; }); }), "genre instruments use known track presets");
  var gBad = U.GENRES.filter(function (gg) {
    var gn = U.genre(gg[0]), sq = U.seqClean({ meter: gn.meter });
    U.applyGenre(sq, gn.id, true);
    var cl = U.seqClean(sq);
    return cl.tracks.bass.pattern === gn.bass && (gn.drum ? cl.tracks.drum.on && cl.tracks.drum.groove === gn.drum : !cl.tracks.drum.on) && cl.style === gn.style && (!gn.pattern || cl.pattern === gn.pattern) && cl.bpm === gn.bpm && U.genreOf(cl) === gn.id &&
      (!gn.drum || U.grooves().some(function (x) { return x.id === gn.drum; })) && cl.tracks.xs.length === gn.layers.length ? false : true;
  }).map(function (gg) { return gg[0]; });
  ok(gBad.length === 0, "every genre uses known patterns / grooves and survives cleaning (and is recognised again)", gBad);
  var gsq = U.seqClean({ bpm: 90, rows: [{ type: "chord", name: "C", len: "w", style: "q" }, { type: "chord", name: "G", len: "w" }] });
  U.applyGenre(gsq, "jazz", false);
  ok(gsq.bpm === 90 && gsq.swing === 0.67 && gsq.style === "q" && gsq.tracks.bass.pattern === "walk" && gsq.tracks.pad.on === false && gsq.rows[0].style === "q", "jazz: walking bass, ride, swing; tempo kept when asked; row styles untouched", gsq);
  U.applyGenre(gsq, "reggae", true);
  ok(gsq.bpm === 76 && gsq.pattern === "xUxUxUxU" && gsq.tracks.pad.on && gsq.tracks.pad.prog === 16 && gsq.tracks.bass.prog === 33, "reggae: offbeat strum, organ pad, finger bass, tempo 76", gsq.tracks);
  ok(U.genreOf(U.seqClean({})) === "", "a plain song matches no genre");
  // §194: ジャンルの楽器
  var lsq = U.seqClean({});
  U.xAdd(lsq.tracks, "bell"); lsq.tracks.x1.name = "じぶんの";
  U.applyGenre(lsq, "edm", true);
  ok(lsq.tracks.xs.length === 4 && lsq.tracks.x1.name === "じぶんの" && !lsq.tracks.x1.genre && lsq.tracks.x2.genre && lsq.tracks.x2.preset === "arp", "EDM adds its synths as genre tracks (my own track stays)", lsq.tracks.xs);
  U.applyGenre(lsq, "tango", true);
  var tnames = lsq.tracks.xs.map(function (x9) { return lsq.tracks[x9].name; });
  ok(lsq.tracks.xs.length === 3 && tnames.join() === "じぶんの,バンドネオン,ピチカート" && lsq.tracks[lsq.tracks.xs[1]].prog === 23, "the next genre swaps the genre tracks (tango: bandoneon 024)", tnames);
  lsq.tracks[lsq.tracks.xs[1]].genre = false;
  U.applyGenre(lsq, "lullaby", true, false);
  ok(lsq.tracks.xs.length === 2 && !lsq.tracks.drum.on && U.genreOf(U.seqClean(lsq)) === "lullaby", "kept tracks stay, 'no instruments' adds none, lullaby has no drums", lsq.tracks.xs);
  for (var fx = 0; fx < 7; fx++) { U.xAdd(lsq.tracks, "piano"); }
  U.applyGenre(lsq, "edm", true);
  ok(lsq.tracks.xs.length === 8, "genre instruments stop at 8 tracks", lsq.tracks.xs.length);
  st0 = U.seqLoad(); st0.cur = U.seqClean({ rows: [{ type: "chord", name: "C", len: "w" }] }); U.applyGenre(st0.cur, "citypop", true); U.seqSave(st0);
  U.ui.tab = "seq";
  W.UGArcade.start("ukulele", root, { onExit: function () {} });
  hs = root.innerHTML;
  ok(hs.indexOf('data-genre="bossa"') > 0 && /uke-chip active" data-genre="citypop"/.test(hs) && hs.indexOf('data-genre="random"') > 0 && hs.indexOf('data-genre="waltz"') < 0 && hs.indexOf("ダンス・電子") > 0 && hs.indexOf("uke-genre-ly-on") > 0 && hs.indexOf('data-tk="genre"') > 0, "genre buttons are shown (current one lit, 3/4 ones hidden in 4/4)", null);
  W.UGArcade.stop();
  U.ui.tab = "play";

  // ===== §195 フィルと展開 =====
  ok(U.seqClean({}).tracks.drum.fill === "off" && U.seqClean({ tracks: { drum: { fill: "sec" } } }).tracks.drum.fill === "sec" && U.seqClean({ tracks: { drum: { fill: "zz" } } }).tracks.drum.fill === "off" && U.seqClean({}).dyn === false && U.seqClean({ dyn: 1 }).dyn === true, "fill / dyn are cleaned (old data: no fill, no dyn)");
  function wBars(n, name) { var a9 = []; for (var i9 = 0; i9 < n; i9++) { a9.push({ type: "chord", name: name || "C", len: "w" }); } return a9; }
  function drumsOf(o) {
    var sq = U.seqClean({ bpm: 60, countIn: false, metronome: false, loop: !!o.loop, dyn: !!o.dyn, meter: o.meter || 4, rows: o.rows, tracks: { drum: { on: true, groove: "8beat", fill: o.fill }, bass: { on: !!o.bass } } });
    return U.seqSchedule(sq, false).events;
  }
  function at(evs, midi) { return evs.filter(function (e) { return e.kind === "drum" && e.midi === midi; }).map(function (e) { return Math.round(e.t * 100) / 100; }); }
  var f0 = drumsOf({ rows: wBars(8) });
  ok(at(f0, 49).length === 0 && at(f0, 45).length === 0 && at(f0, 36).indexOf(28) >= 0 && at(f0, 42).indexOf(31.5) >= 0, "fill off: drums play as before (no crash, no toms, last bar keeps the groove)", at(f0, 49));
  var f4 = drumsOf({ rows: wBars(8), fill: "4" });
  ok(at(f4, 47).join() === "15.5,27.5" && at(f4, 45).join() === "15.75,27.75" && at(f4, 42).indexOf(15) < 0 && at(f4, 42).indexOf(14.5) >= 0, "every 4 bars: a fill on the last beat (bar 4) and before the ending", [at(f4, 47), at(f4, 45)]);
  ok(at(f4, 49).join() === "16,28" && f4.filter(function (e) { return e.kind === "drum" && e.t > 28.01; }).length === 0, "crash after the fill, and the last bar is one 'crash + kick' ending", at(f4, 49));
  var fl4 = drumsOf({ rows: wBars(4), fill: "4", loop: true });
  ok(at(fl4, 47).join() === "15.5" && at(fl4, 49).length === 0 && at(fl4, 42).indexOf(14.5) >= 0, "with repeat: a fill on the last bar leading back to the top (no ending)", [at(fl4, 47), at(fl4, 49)]);
  var fs = drumsOf({ rows: [{ type: "sec", name: "イントロ" }].concat(wBars(2), [{ type: "sec", name: "Aメロ" }], wBars(2), [{ type: "sec", name: "サビ" }], wBars(3)), fill: "sec" });
  ok(at(fs, 50).join() === "14.5,14.75" && at(fs, 47).join() === "7.5,23.5" && at(fs, 49).join() === "8,16,24", "section changes: a short fill before Aメロ, a long fill (high tom…) before サビ, crash on each", [at(fs, 50), at(fs, 47), at(fs, 49)]);
  var f3 = drumsOf({ rows: [{ type: "chord", name: "C", len: "h." }, { type: "chord", name: "C", len: "h." }, { type: "chord", name: "C", len: "h." }, { type: "chord", name: "C", len: "h." }, { type: "chord", name: "C", len: "h." }], fill: "4", meter: 3 });
  ok(at(f3, 47).join() === "11.5" && at(f3, 49).join() === "12" && f3.filter(function (e) { return e.kind === "drum" && e.t > 12.01; }).length === 0, "3/4: the fill is on the last beat of the 12-step bar", [at(f3, 47), at(f3, 49)]);
  ok(U.drumFills("sec", [], 9, 4, false).fill[7] === "s" && U.drumFills("sec", [], 9, 4, false).crash[8] && U.secEnergy("Ａメロ") === 1 && U.secEnergy("サビ2") === 3 && U.secEnergy("アウトロ") === 0 && U.secEnergy("Bメロ") === 2, "no sections: 'section changes' falls back to every 8 bars; section names → strength");
  var dyRows = [{ type: "sec", name: "イントロ" }].concat(wBars(1), [{ type: "sec", name: "サビ" }], wBars(1));
  var dOff = drumsOf({ rows: dyRows, bass: true }), dOn = drumsOf({ rows: dyRows, bass: true, dyn: true });
  var bassLv = function (evs) { return evs.filter(function (e) { return e.track === "bass"; }).map(function (e) { return Math.round(e.level * 100) / 100; }); };
  ok(bassLv(dOff).join() === "0.9,0.9" && bassLv(dOn).join() === "0.63,1", "dyn: intro bass ×0.7, chorus ×1.12 (capped at 1)", bassLv(dOn));
  ok(at(dOn, 38).join() === "5,7" && at(dOn, 37).join() === "1,3" && at(dOn, 49).join() === "4" && at(dOff, 49).length === 0, "dyn: intro snare becomes a rim click, the chorus starts with a crash", [at(dOn, 38), at(dOn, 37), at(dOn, 49)]);
  var ukeLv = function (evs) { return evs.filter(function (e) { return e.track === "uke"; }).map(function (e) { return e.level; }).join(); };
  ok(ukeLv(dOn) === ukeLv(dOff) && bassLv(drumsOf({ rows: wBars(2), bass: true, dyn: true })).join() === "0.9,0.9", "dyn leaves the ukulele alone and does nothing without sections");
  st0 = U.seqLoad(); st0.cur = U.seqClean({ rows: wBars(2), tracks: { drum: { on: true, fill: "8" } } }); U.seqSave(st0);
  U.ui.tab = "seq";
  W.UGArcade.start("ukulele", root, { onExit: function () {} });
  hs = root.innerHTML;
  ok(hs.indexOf('data-tk="fill"') > 0 && hs.indexOf('data-set="dyn"') > 0 && hs.indexOf('data-seq="fillprev"') > 0 && /<option value="8" selected>8小節ごと/.test(hs), "mixer shows the fill select, the dyn checkbox and the fill preview");
  W.UGArcade.stop();
  U.ui.tab = "play";

  // ===== §199 ピアノロールの範囲選択 =====
  var bxn = [[0, 1, 60], [1, 2, 62], [4, 1, 64], [5, 0.5, 72]];
  ok(U.rollBox(bxn, 0.5, 3, 60, 62).join() === "0:60,1:62" && U.rollBox(bxn, 3, 0.5, 62, 60).join() === "0:60,1:62", "box picks notes that touch it (either drag direction)", U.rollBox(bxn, 0.5, 3, 60, 62));
  ok(U.rollBox(bxn, 2.9, 4.1, 0, 127).join() === "1:62,4:64" && U.rollBox(bxn, 3, 4, 0, 127).length === 0 && U.rollBox(bxn, 0, 9, 63, 71).join() === "4:64", "a note only touching the box edge is left out; rows between are included");
  ok(U.rollBox(bxn, 6, 9, 0, 127).length === 0 && U.rollBox([], 0, 9, 0, 127).length === 0, "an empty box picks nothing");
  ok(U.roll.box === null, "no box is shown at the start");
  st0 = U.seqLoad(); st0.cur = U.seqClean({ rows: wBars(1), tracks: { mel: { on: true, notes: [[0, 1, 60]] } } }); U.seqSave(st0);
  U.ui.tab = "seq"; var lk = [];
  ["pen", "move", "sel"].forEach(function (tl) { U.roll.tool = tl; W.UGArcade.start("ukulele", root, { onExit: function () {} }); lk.push(root.innerHTML.indexOf("uke-roll uke-roll-lock") > 0); W.UGArcade.stop(); });
  U.ui.tab = "play"; U.roll.tool = "pen";
  ok(lk.join() === "false,true,true", "select / move tools stop page scrolling on the roll (pen still scrolls)", lk);

  // ===== §198 ピアノロールの改善 =====
  var rn = [[0, 1, 60], [1, 1, 62], [2, 0.5, 64, 1], [5, 1, 67]];
  var rs = U.rollOp(rn, ["0:60", "1:62"], "copy", 0, 4);
  ok(rn.map(function (n) { return n[0] + ":" + n[2]; }).join() === "0:60,1:62,2:64,4:60,5:62,5:67" && rs.join() === "4:60,5:62", "copy: the picked notes go one bar later, and the copy becomes the selection", [rn.map(function (n) { return n[0] + ":" + n[2]; }), rs]);
  rs = U.rollOp(rn, rs, "copy", 0, 4);
  ok(rs.join() === "8:60,9:62" && rn.length === 8, "copy again continues the repeat", rs);
  rs = U.rollOp(rn, ["0:60", "2:64"], "semi", 12, 4);
  ok(rs.join() === "0:72,2:76" && rn[0][2] === 72, "transpose an octave up (selection follows)", rs);
  rs = U.rollOp(rn, ["0:72"], "semi", 99, 4);
  ok(rs.join() === "0:127", "transpose stays in 0–127", rs);
  rs = U.rollOp(rn, ["0:127", "2:76"], "vel", 0.4, 4);
  ok(rn[0][3] === 0.4 && U.rollOp(rn, ["2:76"], "vel", 0.8, 4) && rn.filter(function (n) { return n[0] === 2; })[0].length === 3, "strength is set on picked notes (0.8 = the old 3-number form)", rn[0]);
  var nBefore = rn.length;
  rs = U.rollOp(rn, ["0:127", "9:62"], "del", 0, 4);
  ok(rs.length === 0 && rn.length === nBefore - 2 && U.rollOp(rn, [], "all", 0, 4).length === rn.length, "delete removes the picked notes; 'all' selects every note");
  ok(U.rollOp([[0, 3, 60], [2, 3, 62]], ["0:60", "2:62"], "copy", 0, 3).join() === "6:60,8:62" && U.rollHit([[1, 2, 60]], 2.5, 60) === 0 && U.rollHit([[1, 2, 60]], 3, 60) === -1, "3/4: copy rounds the span up to whole bars (5 beats → 2 bars); hit test covers the note length");
  var vs = U.seqClean({ tracks: { mel: { on: true, notes: [[0, 1, 60, 0.4], [1, 1, 62, 0.8], [2, 1, 64, 7]] } } });
  ok(JSON.stringify(vs.tracks.mel.notes) === "[[0,1,60,0.4],[1,1,62],[2,1,64]]", "saved notes keep a strength other than 0.8", vs.tracks.mel.notes);
  var vx = U.seqClean({ tracks: { xs: ["x1"], x1: { preset: "piano", kind: "notes", notes: [[0, 1, 60, 1]] } } });
  var vev = U.seqSchedule(U.seqClean({ countIn: false, rows: wBars(1), tracks: { mel: { on: true, notes: [[0, 1, 60, 0.4]] }, xs: ["x1"], x1: vx.tracks.x1 } }), false).events;
  ok(vev.filter(function (e) { return e.track === "mel"; })[0].level === 0.4 && vev.filter(function (e) { return e.track === "x1"; })[0].level === 1, "strength plays on the melody and extra note tracks");
  st0 = U.seqLoad(); st0.cur = U.seqClean({ rows: wBars(2), tracks: { mel: { on: true, notes: [[0, 1, 60], [1, 1, 64]] } } }); U.seqSave(st0);
  U.ui.tab = "seq"; U.roll.tool = "sel"; U.roll.sel = ["0:60", "3:99"];
  W.UGArcade.start("ukulele", root, { onExit: function () {} });
  hs = root.innerHTML;
  ok(hs.indexOf('data-rolltool="move"') > 0 && hs.indexOf('uke-chip active" data-rolltool="sel"') > 0 && hs.indexOf("選んだ音 1") > 0 && hs.indexOf('data-roll="copy"') > 0 && hs.indexOf("uke-roll-vel") > 0 && hs.indexOf("uke-roll-guide") > 0 && U.roll.sel.join() === "0:60", "roll shows the tools, the selection bar (missing notes dropped) and the strength / chord guide");
  W.UGArcade.stop();
  U.ui.tab = "play"; U.roll.tool = "pen"; U.roll.sel = [];

  // ===== §197 ジャンルごとの響き =====
  ok(U.seqClean({}).rev === -1 && U.seqClean({}).dly === -1 && U.seqClean({ rev: 3, dly: 0 }).rev === 3 && U.seqClean({ rev: 3, dly: 0 }).dly === 0 && U.seqClean({ rev: 9 }).rev === -1, "reverb / delay are cleaned (old songs: the usual setting)");
  var fxs = U.seqClean({});
  U.applyGenre(fxs, "edm", true); var fxEdm = [fxs.rev, fxs.dly].join();
  U.applyGenre(fxs, "folk", true); var fxFolk = [fxs.rev, fxs.dly].join();
  U.applyGenre(fxs, "ambient", true); var fxAmb = [fxs.rev, fxs.dly].join();
  U.applyGenre(fxs, "rockabilly", true);
  ok(fxEdm === "2,2" && fxFolk === "0,0" && fxAmb === "3,3" && [fxs.rev, fxs.dly].join() === "1,2" && U.genreFx("jpop").join() === "1,0" && U.genreFx("house").join() === "2,1", "a genre sets the song's reverb / delay (EDM wet, folk dry, rockabilly slapback)", [fxEdm, fxFolk, fxAmb]);
  var MG = W.UGMelody;
  MG.audioInit(); MG.setFx(1, 0);
  U.seqStart(U.seqClean({ rev: 3, dly: 2, countIn: false, rows: wBars(1) }), false, null, null);
  var fxOn = [MG.audio.fxRev, MG.audio.fxDly].join();
  U.seqStop();
  ok(fxOn === "3,2" && [MG.audio.fxRev, MG.audio.fxDly].join() === "1,0", "playing uses the song's reverb / delay, stopping puts the usual setting back", fxOn);
  U.seqStart(U.seqClean({ countIn: false, rows: wBars(1) }), false, null, null);
  var fxKeep = [MG.audio.fxRev, MG.audio.fxDly].join();
  U.seqStart(U.seqClean({ rev: 0, countIn: false, rows: wBars(1) }), false, null, null);
  var fxMix = [MG.audio.fxRev, MG.audio.fxDly].join();
  U.seqStop();
  ok(fxKeep === "1,0" && fxMix === "0,0" && [MG.audio.fxRev, MG.audio.fxDly].join() === "1,0", "'usual setting' changes nothing; only the set one changes", [fxKeep, fxMix]);
  var rqw = U.seqRec(U.seqClean({ rev: 3, dly: 2, rows: wBars(1) }), false), rqd = U.seqRec(U.seqClean({ rows: wBars(1) }), false);
  ok(rqw.fxRev === 3 && rqw.fxDly === 2 && rqd.fxRev === 1 && rqd.fxDly === undefined, "WAV uses the song's reverb / delay (usual setting: as before)", [rqw.fxRev, rqw.fxDly, rqd.fxRev]);
  function hasCC91(bytes, v) { for (var q9 = 0; q9 + 2 < bytes.length; q9++) { if ((bytes[q9] & 0xF0) === 0xB0 && bytes[q9 + 1] === 91 && bytes[q9 + 2] === v) { return true; } } return false; }
  ok(hasCC91(U.midiBytes(U.seqClean({ rev: 3, rows: wBars(1) }), false), 100) && !hasCC91(U.midiBytes(U.seqClean({ rows: wBars(1) }), false), 30), "MIDI writes the reverb as CC91 (none for the usual setting)");
  st0 = U.seqLoad(); st0.cur = U.seqClean({ rev: 2 }); U.seqSave(st0);
  U.ui.tab = "seq";
  W.UGArcade.start("ukulele", root, { onExit: function () {} });
  ok(root.innerHTML.indexOf('data-set="rev"') > 0 && root.innerHTML.indexOf('data-set="dly"') > 0 && /<option value="2" selected>ふつう/.test(root.innerHTML), "mixer shows the reverb / delay selects");
  W.UGArcade.stop();
  U.ui.tab = "play";

  // ===== §196 おまかせ作曲 =====
  function seqRnd(list) { var q9 = 0; return function () { return q9 < list.length ? list[q9++] : 0; }; }
  function rowText(sq) { return sq.rows.map(function (r9) { return r9.type === "sec" ? "[" + r9.name + "]" : r9.name; }).join(" "); }
  var cp = U.seqClean({ rows: wBars(2, "Dm"), loop: true, loopOn: true, arr: ["x"] });
  var cr = U.compose(cp, "jpop", seqRnd([]), true, true);
  ok(cr.genre === "jpop" && cr.a === "50年代進行" && cr.s === "王道進行" && cr.key === "C" && rowText(cp) === "[イントロ] F G7 [Aメロ] C Am F G7 C Am F G7 [サビ] F G7 Em Am F G7 Em Am [アウトロ] F G7 C", "compose: intro → A (twice) → chorus (twice) → outro cadence, progressions from the genre family", [cr, rowText(cp)]);
  cp = U.seqClean(cp);
  ok(cp.dyn && cp.tracks.drum.fill === "sec" && !cp.loop && !cp.loopOn && cp.arr.length === 0 && cp.bpm === 140 && U.genreOf(cp) === "jpop" && cp.rows.every(function (r9) { return r9.type === "sec" || r9.len === "w"; }), "compose turns on fills and dynamics, clears the arrangement / loops, and keeps the genre", [cp.dyn, cp.tracks.drum.fill, cp.bpm, U.genreOf(cp)]);
  var cs = U.seqSchedule(U.seqClean({ countIn: false, bpm: 60, rows: cp.rows, dyn: true, tracks: cp.tracks }), false).events;
  ok(at(cs, 49).join() === "8,40,72,80" && at(cs, 50).join() === "38.5,38.75" && cs.filter(function (e) { return e.kind === "drum" && e.t > 80.01; }).length === 0, "the composed song plays with a crash on each section, a long fill before the chorus and an ending on bar 21", [at(cs, 49), at(cs, 50)]);
  var cp2 = U.seqClean({});
  var cr2 = U.compose(cp2, "pop", seqRnd([0.2, 0.6, 0, 0.3]), false, false);
  ok(cr2.a === "レット・イット・ビー風" && cr2.s === "王道進行" && cr2.key === "G" && cp2.key === 7 && cp2.bpm === 90 && cp2.tracks.xs.length === 0, "compose picks a different chorus progression than the verse; Key is random; tempo / instruments follow the checkboxes", cr2);
  var cb = U.seqClean({}); U.compose(cb, "blues", seqRnd([]), true, true);
  ok(rowText(cb).split(" ").length === 4 + 2 + 12 + 12 + 3 && /\[アウトロ\] G7 F7 C7$/.test(rowText(cb)), "blues genres use the 12-bar blues once each and a V7–IV7–I7 ending", rowText(cb));
  var cj = U.seqClean({}); U.compose(cj, "jazz", seqRnd([]), true, true);
  ok(/^\[イントロ\] Cmaj7 A7 \[Aメロ\] Dm7 G7 Cmaj7 Cmaj7/.test(rowText(cj)) && /Dm7 G7 Cmaj7$/.test(rowText(cj)), "jazz: ii-V-I verse, rhythm-changes chorus, ii-V-I ending", rowText(cj));
  var c3 = U.seqClean({ meter: 3 }), cr3 = U.compose(c3, "", seqRnd([]), true, true);
  var c4 = U.seqClean({}), cr4 = U.compose(c4, "waltz", seqRnd([]), true, true);
  ok(U.genre(cr3.genre).meter === 3 && c3.rows.every(function (r9) { return r9.type === "sec" || r9.len === "h."; }) && U.genre(cr4.genre).meter === 4, "3/4 songs get a 3/4 genre and dotted halves; a genre of the wrong meter is not used", [cr3.genre, cr4.genre]);
  st0 = U.seqLoad(); st0.cur = U.seqClean({}); U.seqSave(st0);
  U.ui.tab = "seq";
  W.UGArcade.start("ukulele", root, { onExit: function () {} });
  ok(root.innerHTML.indexOf('data-seq="compose"') > 0, "the genre panel has the compose button");
  W.UGArcade.stop();
  U.ui.tab = "play";

  // ===== §191 ベースとドラムのパターン =====
  function bassOf(pattern, rowsB, meterB) {
    var sq = U.seqClean({ countIn: false, meter: meterB || 4, rows: rowsB, tracks: { bass: { on: true, pattern: pattern } } });
    return U.seqSchedule(sq, false).events.filter(function (e) { return e.track === "bass"; });
  }
  ok(U.seqClean({ tracks: { bass: { pattern: "funk" } } }).tracks.bass.pattern === "funk" && U.seqClean({ tracks: { bass: { pattern: "zz" } } }).tracks.bass.pattern === "root", "new bass patterns are kept, unknown ones fall back to root");
  var bo = bassOf("oct", [{ type: "chord", name: "C", len: "w" }]);
  ok(bo.map(function (e) { return e.midi; }).join() === "48,60,48,60,48,60,48,60", "bass: octave pattern (C → 48 / 60 in 8ths)", bo.map(function (e) { return e.midi; }));
  var bb = bassOf("boogie", [{ type: "chord", name: "C7", len: "w" }]);
  ok(bb.map(function (e) { return e.midi; }).join() === "48,52,55,57,58,57,55,52", "bass: boogie climbs R 3 5 6 ♭7", bb.map(function (e) { return e.midi; }));
  var bw = bassOf("walk2", [{ type: "chord", name: "Am", len: "w" }, { type: "chord", name: "F", len: "w" }]);
  ok(bw.map(function (e) { return e.midi; }).join() === "45,48,52,40,41,45,48,48", "bass: walking with a half-step approach to the next root (Am → F)", bw.map(function (e) { return e.midi; }));
  var bdim = bassOf("arp", [{ type: "chord", name: "Bdim", len: "h" }]);
  ok(bdim.map(function (e) { return e.midi; }).join() === "47,50,53,59", "bass: chord tones follow the chord (Bdim → minor 3rd, flat 5th)", bdim.map(function (e) { return e.midi; }));
  var brg = bassOf("reggae", [{ type: "chord", name: "C", len: "w" }]);
  ok(brg.length === 4 && Math.abs(brg[0].t - brg[1].t) > 0.5, "bass: a pattern that starts with a rest still plays the root when the chord starts", brg.length);
  var bwz = bassOf("waltz", [{ type: "chord", name: "G", len: "h." }], 3);
  ok(bwz.map(function (e) { return e.midi; }).join() === "43,50,50", "bass: 3/4 waltz pattern", bwz.map(function (e) { return e.midi; }));
  var grs = U.grooves(), gids = grs.map(function (x) { return x.id; });
  ok(grs.length === 26 && gids.indexOf("funk") >= 0 && gids.indexOf("jwaltz") >= 0 && grs.every(function (x) { return x.hits.every(function (hh) { return hh[1].every(function (st9) { return st9 >= 0 && st9 < 16; }); }); }), "26 drum grooves (plus my rhythm), all steps within a bar", gids.length);
  ok(W.UGMelody.grooves.length === 7, "the melody game's groove list is unchanged");
  var dro = U.seqSchedule(U.seqClean({ countIn: false, rows: [{ type: "chord", name: "C", len: "w" }], tracks: { drum: { on: true, groove: "rock" } } }), false).events.filter(function (e) { return e.track === "drum"; });
  ok(dro.filter(function (e) { return e.midi === 36; }).length === 4 && dro.filter(function (e) { return e.midi === 42; }).length === 8, "drums: the rock groove plays", dro.length);
  st0 = U.seqLoad(); st0.cur = U.seqClean({ rows: [{ type: "chord", name: "C", len: "w" }], tracks: { bass: { on: true, pattern: "funk" }, drum: { on: true, groove: "samba" } } }); U.seqSave(st0);
  U.ui.tab = "seq";
  W.UGArcade.start("ukulele", root, { onExit: function () {} });
  hs = root.innerHTML;
  ok(hs.indexOf('data-seq="bandprev"') > 0 && hs.indexOf('<option value="funk" selected>') > 0 && hs.indexOf('<option value="samba" selected>') > 0 && hs.indexOf("ギャロップ") > 0, "the mixer lists the new bass patterns and drum grooves, with a preview button", null);
  W.UGArcade.stop();
  U.ui.tab = "play";

  // ===== §190 ストロークパターン・アルペジオパターン =====
  ok(C.SEQ_PATTERNS.length === 28 && C.SEQ_PATTERNS.every(function (pp) { return C.seqPattern(pp.p) === pp.p && pp.p.length === (pp.meter === 3 ? 6 : pp.p.length); }), "28 patterns, all valid (3/4 ones are 6 steps)");
  ok(U.patterns(4, "s").length === 15 && U.patterns(4, "a").length === 9 && U.patterns(3).length === 4, "patterns are split by kind and meter", null);
  ok(C.seqPattern("p-21x9q4") === "P-21x4" && C.seqPattern("du") === "DU", "pattern letters: D U x - 1-4 P (lower case is read)");
  var aps = U.seqSchedule(U.seqClean({ countIn: false, style: "pat", pattern: "43214321", rows: [{ type: "chord", name: "C", len: "w" }] }), false);
  var apl = aps.events.filter(function (e) { return e.track === "uke"; });
  ok(apl.length === 8 && apl.every(function (e) { return e.kind === "pluck"; }) && apl.map(function (e) { return e.string; }).join() === "0,1,2,3,0,1,2,3" && Math.abs(apl[1].t - apl[0].t - aps.spb / 2) < 1e-9, "arpeggio pattern plucks string 4 → 1 in 8ths", apl.map(function (e) { return e.string; }));
  var pps = U.seqSchedule(U.seqClean({ countIn: false, style: "pat", pattern: "P-2-D-xU", rows: [{ type: "chord", name: "C", len: "w" }] }), false);
  var ppl = pps.events.filter(function (e) { return e.track === "uke"; }).map(function (e) { return e.kind + (e.kind === "pluck" ? e.string : ""); });
  ok(ppl.join() === "pluck0,pluck3,pluck2,strum,chuck,strum", "pinch plays string 4 and 1 together, and strums mix in", ppl);
  st0 = U.seqLoad(); st0.cur = U.seqClean({ style: "pat", pattern: "P-21-P21", rows: [{ type: "chord", name: "C", len: "w", style: "pat", pattern: "31423142" }] }); U.seqSave(st0);
  U.ui.tab = "seq"; U.tl.view = "list";
  W.UGArcade.start("ukulele", root, { onExit: function () {} });
  hs = root.innerHTML;
  ok(hs.indexOf('data-seq="patprev"') > 0 && hs.indexOf("アルペジオ") > 0 && hs.indexOf('data-pat="4321234143212341"') > 0 && hs.indexOf("uke-seq-rpsel") > 0 && hs.indexOf('data-pat="D-D-D-"') < 0, "pattern chips are split into strum / arpeggio with preview, and rows can pick a pattern", null);
  W.UGArcade.stop();
  U.ui.tab = "play"; U.ui.drillOpen = true;
  W.UGArcade.start("ukulele", root, { onExit: function () {} });
  hs = root.innerHTML;
  ok(hs.indexOf('data-m="strum:D-DUxUDUD-DUxUDU"') > 0 && hs.indexOf('data-m="strum:43214321"') < 0 && hs.indexOf('data-m="strum:D-D-D-"') < 0, "the strum drill offers only 4/4 strum patterns", null);
  W.UGArcade.stop();
  U.ui.drillOpen = false; U.tl.view = "tl";

  // ===== §189 ドラムの打ち込み・行ごとの奏法・練習テンポ・おすすめ =====
  var rsq = U.seqClean({ countIn: false, style: "once", rows: [{ type: "chord", name: "C", len: "w" }, { type: "chord", name: "G", len: "w", style: "e" }, { type: "chord", name: "F", len: "w", style: "pat", pattern: "d-d-d-d-" }, { type: "chord", name: "Am", len: "w", style: "zz" }] });
  ok(rsq.rows[0].style === "song" && rsq.rows[2].pattern === "D-D-D-D-" && rsq.rows[3].style === "song" && rsq.rows[1].pattern === "", "row styles are cleaned (unknown → song, pattern only for pat)", rsq.rows);
  var rss = U.seqSchedule(rsq, false), perRow = [0, 0, 0, 0];
  rss.events.forEach(function (e) { if (e.kind === "strum" && e.track === "uke") { perRow[e.row]++; } });
  ok(perRow.join() === "1,8,4,1", "each row can have its own style (once / 8th / pattern / song)", perRow);
  var dc = U.drumCustomClean([[36, [0, 4, 4, 99, -1, 8]], [99, [1]], [38, "x"], [42, [2]]]);
  ok(dc.length === 6 && dc[0][0] === 36 && dc[0][1].join() === "0,4,8" && dc[2][1].join() === "2" && dc[1][1].length === 0, "my rhythm is cleaned (6 rows, steps 0–15, no duplicates)", dc);
  ok(U.drumFrom("8beat")[0][1].join() === "0,8,10" && U.drumFrom("latin").every(function (r9) { return [36, 38, 42, 46, 39, 37].indexOf(r9[0]) >= 0; }), "copy a preset rhythm into my rhythm (other drums are left out)");
  var dsc = U.seqSchedule(U.seqClean({ countIn: false, rows: [{ type: "chord", name: "C", len: "w" }, { type: "chord", name: "C", len: "w" }], tracks: { drum: { on: true, groove: "custom", custom: [[36, [0, 4, 8, 12]], [39, [4, 12]]] } } }), false);
  var kicks = dsc.events.filter(function (e) { return e.track === "drum" && e.midi === 36; }).length, claps = dsc.events.filter(function (e) { return e.track === "drum" && e.midi === 39; }).length;
  ok(kicks === 8 && claps === 4, "my rhythm plays (4 kicks and 2 claps per bar)", [kicks, claps]);
  var slow = U.seqAtRate(U.seqClean({ bpm: 100, countIn: false, rows: [{ type: "chord", name: "C", len: "w" }, { type: "tempo", bpm: 120 }, { type: "chord", name: "G", len: "w" }] }), 50);
  var sls = U.seqSchedule(slow, false);
  ok(slow.bpm === 50 && slow.rows[1].bpm === 60 && Math.abs(sls.time - 8.8) < 1e-9 && U.seqAtRate(slow, 100) === slow, "practice tempo slows the song and its tempo rows (50%)", sls.time);
  ok(U.seqClean({ rate: 70, rateUp: 1 }).rate === 70 && U.seqClean({ rate: 33 }).rate === 100 && U.seqClean({ rateUp: 1 }).rateUp === true, "practice tempo settings are cleaned");
  var sgq = U.seqClean({ rows: [{ type: "chord", name: "C" }, { type: "chord", name: "G7" }, { type: "chord", name: "?" }] });
  var sug = U.suggest(sgq, 2);
  ok(sug.tonic === 0 && sug.prev === "G7" && sug.after.map(function (x) { return x.name; }).join() === "C,Am" && sug.diatonic.map(function (x) { return x.name; }).indexOf("Bm7(♭5)") >= 0 && sug.secondary.map(function (x) { return x.name; }).indexOf("E7") >= 0, "suggestions: diatonic chords, what comes after G7 (C, Am), secondary dominants", sug);
  ok(U.estimateKey(U.seqClean({ rows: [{ type: "chord", name: "G" }, { type: "chord", name: "D" }, { type: "chord", name: "Em" }, { type: "chord", name: "C" }] }).rows) === 7, "the song key is estimated from the written chords (G D Em C → G)");
  var sgG = U.suggest(U.seqClean({ rows: [{ type: "chord", name: "G" }, { type: "chord", name: "D7" }, { type: "chord", name: "Em" }, { type: "chord", name: "?" }] }), 3);
  ok(sgG.prevDeg === "Ⅵ" && sgG.after.map(function (x) { return x.name; }).join() === "C,Am,D", "in G, after Em (Ⅵm) come C, Am, D", sgG.after);
  st0 = U.seqLoad(); st0.cur = U.seqClean({ rows: [{ type: "chord", name: "C", len: "w", style: "pat", pattern: "DUDU" }], tracks: { drum: { on: true, groove: "custom" } }, rate: 70 }); U.seqSave(st0);
  U.ui.tab = "seq"; U.tl.view = "list"; U.pick.row = 0; U.pick.tab = "rec";
  W.UGArcade.start("ukulele", root, { onExit: function () {} });
  hs = root.innerHTML;
  ok(hs.indexOf('class="uke-step') > 0 && hs.indexOf('data-dcopy="1"') > 0 && hs.indexOf("uke-seq-style") > 0 && hs.indexOf('value="DUDU"') > 0 && hs.indexOf('<option value="70" selected>') > 0 && hs.indexOf("ループごとに +5%") > 0 && hs.indexOf("書いたコードから推定") > 0, "sequencer shows the drum grid, row style, practice tempo and suggestions", null);
  W.UGArcade.stop();
  U.pick.row = -1; U.tl.view = "tl"; U.ui.tab = "play";

  // ===== §188 上達メニュー =====
  var sn = U.strumNotes("D-DU-UDU", 60);
  ok(sn.length === 48 && sn[0].t === 4 && sn[1].t === 5 && sn[2].t === 5.5 && sn[2].dir === "up" && sn[6].t === 8, "strum drill notes: count-in bar then 8 bars of the pattern", sn.slice(0, 7));
  function strumBot(cfg9, flip) {
    var notes = U.strumNotes(cfg9.mode.substring(6), cfg9.strumBpm), done = {};
    return env.run("ukulele", { config: cfg9 }, 3000, function (f, e) {
      var t = (f + 1 - 30) / 60;
      notes.forEach(function (n, i9) {
        if (done[i9] || Math.abs(t - n.t) > 0.009) { return; }
        done[i9] = true;
        var k9 = (n.dir === "down") !== !!flip ? "d" : "u";
        e.key("keydown", k9); e.key("keyup", k9);
      });
    });
  }
  r = strumBot({ mode: "strum:D-D-D-D-", strumBpm: 120 });
  var titles = env.counters.texts.filter(function (t9) { return t9.indexOf("おつかれさま！") === 0; });
  ok(r.ended === 32 * 30 && titles.length && titles[titles.length - 1] === "おつかれさま！ 正確さ100%", "strum drill: on-time strokes in the right direction are all PERFECT", { ended: r.ended, t: titles.slice(-1) });
  r = strumBot({ mode: "strum:D-D-D-D-", strumBpm: 120 }, true);
  titles = env.counters.texts.filter(function (t9) { return t9.indexOf("おつかれさま！") === 0; });
  ok(r.ended === 0 && titles[titles.length - 1] === "おつかれさま！ 正確さ0%", "strum drill: wrong direction is a MISS", { ended: r.ended, t: titles.slice(-1) });
  // 1分間チェンジ: 交互に出題・自己ベスト
  env.store[U.BEST_KEY] = "{}";
  var chSeen = [];
  r = env.run("ukulele", { config: { mode: "change:C|Am", hold: true } }, 3700, function (f, e) {
    if (f % 20 !== 5) { return; }
    var u = W.__uk2();
    if (!u.target) { return; }
    chSeen.push(u.target.name);
    u.target.shape.forEach(function (fr, s2) { if (fr > 0) { e.tap(U.STRX[s2], cy2(fr)); } });
    e.key("keydown", " "); e.key("keyup", " ");
  });
  var bestC = U.bestLoad()["C|Am"];
  ok(chSeen.slice(0, 4).join() === "C,Am,C,Am" && bestC >= 100 && r.ended === bestC * 50, "1-minute changes: C and Am alternate, the count is saved as the best", { seen: chSeen.slice(0, 4), best: bestC, ended: r.ended });
  ok(U.bestSet("C|Am", 3) === false && U.bestSet("C|Am", bestC + 1) === true, "the best only goes up");
  // タイミング調整: 拍より 0.1秒 おそく鳴らすと +100ms
  r = env.run("ukulele", { config: { mode: "calib" } }, 600, function (f, e) {
    // ゲームのフレームで時刻を数える（鳴らした瞬間の frames が判定に使われる）
    var t = (W.__uk2().fr - 30) / 60;
    for (var b9 = 4; b9 < 12; b9++) { if (Math.abs(t - (b9 * 0.6 + 0.1)) < 0.008) { e.key("keydown", " "); e.key("keyup", " "); } }
  });
  ok(U.prefs().latency === 100, "timing calibration measures +100ms when strokes come 0.1s late", U.prefs().latency);
  // 補正つきだと 0.1秒おそいストロークも PERFECT
  var pft = 0;
  env.run("ukulele", { config: { mode: "seq", hold: true, latency: 100, seq: U.seqClean({ bpm: 120, countIn: false, style: "once", rows: [{ type: "chord", name: "C", len: "w" }] }) } }, 120, function (f, e) {
    if (f === 20) { e.tap(U.STRX[3], cy2(3)); }
    if (f === 66) { e.key("keydown", " "); e.key("keyup", " "); }
    if (f === 67) { pft = env.counters.texts.filter(function (t9) { return t9.indexOf("PERFECT") === 0; }).length; }
  });
  ok(pft > 0, "latency correction: a stroke 0.1s late is PERFECT with +100ms", pft);
  var pz = U.prefs(); pz.latency = 0; env.store["ultimateGorillaUkulelePrefsV1"] = JSON.stringify(pz);
  U.ui.tab = "play";
  W.UGArcade.start("ukulele", root, { onExit: function () {} });
  hs = root.innerHTML;
  ok(hs.indexOf("上達メニュー") > 0 && hs.indexOf('data-m="strum:D-DU-UDU"') > 0 && hs.indexOf('data-m="change:C|Am"') > 0 && hs.indexOf("ベスト " + (bestC + 1) + "回") > 0 && hs.indexOf('data-m="calib"') > 0 && hs.indexOf('data-lat="10"') > 0, "play tab: drill menu with patterns, change pairs (best) and calibration", null);
  W.UGArcade.stop();

  // ===== §187 練習の記録・リズム判定・次のコードの予告 =====
  env.store[U.STATS_KEY] = "{}";
  U.statsAdd("C", true, 2); U.statsAdd("C", true, 4); U.statsAdd("F", false); U.statsAdd("F", true, 6); U.statsAdd("G7", true, 9); U.statsAdd("Am", true, 1);
  var wl = U.weakList();
  ok(wl.map(function (x) { return x.name; }).join() === "F,G7,C,Am" && wl[0].rate === 0.5 && wl[2].avg === 3, "weak list: lowest accuracy first, then slowest", wl);
  env.store[U.STATS_KEY] = JSON.stringify({ X: { n: -1 }, Y: { n: 3, ok: 9, t: 2 } });
  ok(Object.keys(U.statsLoad()).join() === "Y" && U.statsLoad().Y.ok === 3, "broken stats are cleaned");
  var gR = [0, 0.06, -0.1, 0.2, -0.3, 0.5].map(function (d7) { return U.rhythmGrade(d7).id; });
  ok(gR.join() === "perfect,perfect,great,good,early,late", "rhythm grades: PERFECT ≤0.07s / GREAT ≤0.14 / GOOD ≤0.22 / early・late", gR);
  // 練習で記録される（正解とおしい）
  env.store[U.STATS_KEY] = "{}";
  env.run("ukulele", { config: { mode: "easy", hold: true } }, 30, function (f, e) {
    // まず必ずちがう押さえ方（G弦5フレット）で鳴らす → はなす → お手本どおり
    if (f === 3) { e.tap(U.STRX[0], cy2(5)); e.key("keydown", " "); e.key("keyup", " "); e.key("keydown", "Backspace"); e.key("keyup", "Backspace"); }
    if (f === 6) { var u = W.__uk2(); u.target.shape.forEach(function (fr, s2) { if (fr > 0) { e.tap(U.STRX[s2], cy2(fr)); } }); e.key("keydown", " "); e.key("keyup", " "); }
  });
  var stx = U.statsLoad(), stk = Object.keys(stx);
  ok(stk.length >= 1 && stk.reduce(function (a8, k8) { return a8 + stx[k8].n; }, 0) === 2 && stk.reduce(function (a8, k8) { return a8 + stx[k8].ok; }, 0) === 1, "practice records attempts and correct answers per chord", stx);
  // 苦手なコードを練習: 記録の上位から出題
  env.store[U.STATS_KEY] = JSON.stringify({ "Bm": { n: 5, ok: 1, t: 9 }, "E": { n: 4, ok: 1, t: 9 }, "F#m": { n: 3, ok: 1, t: 2 }, "C": { n: 9, ok: 9, t: 9 } });
  var wseen = {};
  env.run("ukulele", { config: { mode: "weak", hold: true } }, 600, function (f, e) {
    var u = W.__uk2();
    if (!u.target) { return; }
    wseen[u.target.name] = true;
    if (f % 6 === 3) { u.target.shape.forEach(function (fr, s2) { if (fr > 0) { var rel = fr - u.pos; if (rel >= 1 && rel <= 6) { e.tap(U.STRX[s2], cy2(rel)); } } }); e.key("keydown", " "); e.key("keyup", " "); }
  });
  ok(W.__uk2().mode === "weak" && Object.keys(wseen).every(function (k9) { return ["Bm", "E", "F#m", "C"].indexOf(k9) >= 0; }) && wseen.Bm, "weak-chord quiz uses the recorded chords (weakest most)", wseen);
  env.store[U.STATS_KEY] = JSON.stringify({ "C": { n: 1, ok: 1, t: 1 } });
  env.run("ukulele", { config: { mode: "weak" } }, 3);
  ok(W.__uk2().mode === "free", "weak-chord quiz needs at least 3 recorded chords");
  // リズム: 拍ぴったりのストロークは PERFECT、次のコードの予告が描かれる
  var perfectTexts = 0;
  env.run("ukulele", { config: { mode: "seq", hold: true, seq: U.seqClean({ bpm: 120, countIn: false, style: "once", rows: [{ type: "chord", name: "C", len: "w" }, { type: "chord", name: "G", len: "w" }] }) } }, 300, function (f, e) {
    // SEQ_START=30 フレーム → 拍0 は f=30、8分（0.25秒）は 15 フレームごと
    if (f === 20) { e.tap(U.STRX[3], cy2(3)); }
    if (f === 60) { e.key("keydown", " "); e.key("keyup", " "); }
    if (f === 61) { perfectTexts = env.counters.texts.filter(function (t9) { return t9.indexOf("PERFECT") === 0; }).length; }
  });
  ok(perfectTexts > 0, "a strum right on the beat is judged PERFECT", perfectTexts);
  U.ui.tab = "play";
  W.UGArcade.start("ukulele", root, { onExit: function () {} });
  hs = root.innerHTML;
  ok(hs.indexOf('data-m="weak"') > 0 && hs.indexOf("練習の記録") > 0 && hs.indexOf('data-p="next"') > 0, "play tab: weak-chord quiz, records and next-chord preview setting", null);
  W.UGArcade.stop();

  // ===== §185 スマート =====
  function smartRun(steps) {
    var out = [];
    env.run("ukulele", { config: { mode: "free", smart: true } }, 10, function (f, e) {
      if (f !== 2) { return; }
      steps.forEach(function (st) {
        if (st === "S") { e.key("keydown", " "); e.key("keyup", " "); return; }
        e.tap(U.STRX[st[0]], cy2(st[1]));
        out.push(W.__uk2().cur.join(""));
      });
    });
    return out.join();
  }
  ok(smartRun([[3, 3], "S", [2, 1], "S", [2, 1]]) === "0003,0013,0003", "smart: one tap after strumming is an ornament (C → Csus4 → back to C)", smartRun([[3, 3], "S", [2, 1], "S", [2, 1]]));
  ok(smartRun([[3, 3], "S", [1, 2], [2, 3], [3, 2]]) === "0003,0203,0230,0232", "smart: the second tap starts a new chord (C → G)", smartRun([[3, 3], "S", [1, 2], [2, 3], [3, 2]]));
  ok(smartRun([[3, 3], "S", [3, 3], [0, 2]]) === "0003,0000,2000", "smart: one-finger chord change = remove the old mark, then press the new one (C → Am)", smartRun([[3, 3], "S", [3, 3], [0, 2]]));
  ok(smartRun([[0, 2], [3, 3], "S", [3, 5], "S", [3, 6], "S", [3, 3]]) === "2000,2003,2005,2006,2003", "smart: a melody on the A string keeps the chord underneath", smartRun([[0, 2], [3, 3], "S", [3, 5], "S", [3, 6], "S", [3, 3]]));
  U.ui.tab = "play";
  W.UGArcade.start("ukulele", root, { onExit: function () {} });
  ok(root.innerHTML.indexOf("スマート（1か所なら飾り・2か所目から新しいコード）") > 0, "play tab offers the smart fingering mode", null);
  W.UGArcade.stop();

  // ===== §183 コード進行のバリエーション =====
  var pgs = U.progressions, catIds = U.progCats.map(function (c6) { return c6.id; }), pBad = [];
  pgs.forEach(function (pg) {
    if (pg.deg.length !== pg.chords.length || !pg.note || catIds.indexOf(pg.cat) < 0) { pBad.push(pg.id + " shape"); }
    // 度数とコードが合っているか（キー C の Ⅰ＝C として根音をくらべる）
    var DEG = { "Ⅰ": 0, "Ⅱ": 2, "Ⅲ": 4, "Ⅳ": 5, "Ⅴ": 7, "Ⅵ": 9, "Ⅶ": 11 };
    pg.deg.forEach(function (d6, j6) {
      var m6 = /^(♭?)(Ⅶ|Ⅵ|Ⅴ|Ⅳ|Ⅲ|Ⅱ|Ⅰ)/.exec(d6), sp6 = C.parse(pg.chords[j6]);
      if (!m6 || !sp6 || (DEG[m6[2]] - (m6[1] ? 1 : 0) + 12) % 12 !== sp6.root) { pBad.push(pg.id + " " + d6 + "≠" + pg.chords[j6]); }
    });
  });
  ok(pgs.length === 28 && pBad.length === 0, "28 progressions; each degree matches its chord's root", pBad);
  ok(catIds.every(function (ci) { return pgs.some(function (pg) { return pg.cat === ci; }); }), "every category has progressions");
  var gK = U.progChords(pgs.filter(function (pg) { return pg.id === "ohdo"; })[0], 7);
  ok(gK.join() === "C,D7,Bm,Em", "progressions transpose to another key (王道 in G)", gK);
  // キー D で下降クリシェを2周弾くと CLEAR!（表にない AmM7 などもエンジンの押さえ方で）
  var pdone = 0, pnames = [];
  r = env.run("ukulele", { config: { mode: "prog:clichedown", progKey: 2 } }, 3000, function (f, e) {
    if (f % 10 !== 5) { return; }
    var u = W.__uk2();
    if (!u.target) { return; }
    if (pnames.indexOf(u.target.name) < 0) { pnames.push(u.target.name); }
    var ids = [];
    u.target.shape.forEach(function (fr, s2) { if (fr > 0) { var rel = fr - u.pos; e.ptr("down", U.STRX[s2], U.NUT_Y + (rel - 0.5) * U.FH, 1 + s2); ids.push(1 + s2); } });
    swipe(e, 9);
    ids.forEach(function (id) { e.ptr("up", 0, 0, id); });
    pdone = W.__uk2().correct;
  });
  ok(env.lastTitle() === "CLEAR!" && pdone === 8 && pnames.join() === "Bm,BmM7,Bm7,Bm6", "a progression in another key can be played through (B minor cliché)", { done: pdone, names: pnames });
  U.ui.tab = "play";
  W.UGArcade.start("ukulele", root, { onExit: function () {} });
  hs = root.innerHTML;
  ok(hs.indexOf("J-POPの定番") > 0 && hs.indexOf("ジャズ・おしゃれ") > 0 && hs.indexOf('data-pp="progKey"') > 0 && hs.indexOf("Ⅳ–Ⅴ7–Ⅲm–Ⅵm") > 0 && hs.indexOf('data-m="prog:domchain"') > 0, "play tab lists progressions by category with degrees and a key choice", null);
  W.UGArcade.stop();

  // ===== §182 ダウン・アップ・ホールド・はなす =====
  W.UGArcade.start("ukulele", root, { onExit: function () {} });
  var hs2 = root.innerHTML;
  W.UGArcade.stop();
  ok(hs2.indexOf('data-pp="hold"') > 0 && hs2.indexOf("ホールド（タップで印を付けておく）") > 0 && hs2.indexOf("はなす＝ホールドした印") > 0, "play tab: hold mode choice and button explanations", null);
  var hcur = [], cellY = function (f) { return U.NUT_Y + (f - 0.5) * U.FH; };
  env.run("ukulele", { config: { mode: "free", hold: true } }, 10, function (f, e) {
    if (f !== 2) { return; }
    e.tap(U.STRX[0], cellY(2)); hcur.push(W.__uk2().cur.join(""));
    e.tap(U.STRX[0], cellY(4)); hcur.push(W.__uk2().cur.join(""));
    e.tap(U.STRX[3], cellY(3)); hcur.push(W.__uk2().cur.join(""));
    e.tap(U.STRX[0], cellY(4)); hcur.push(W.__uk2().cur.join(""));
    e.key("keydown", "Backspace"); e.key("keyup", "Backspace"); hcur.push(W.__uk2().cur.join("") + ":" + W.__uk2().msg);
  });
  ok(hcur.join() === "2000,4000,4003,0003,0000:✋ 印を全部はなしました", "hold mode: taps leave marks (one per string, tap again to remove), はなす clears them", hcur);
  // ホールドで押さえて ⬇ダウン で正解 → 印は自動で消える
  var hq = null;
  env.run("ukulele", { config: { mode: "easy", hold: true } }, 20, function (f, e) {
    if (f !== 3) { return; }
    var u = W.__uk2();
    u.target.shape.forEach(function (fr, s2) { if (fr > 0) { e.tap(U.STRX[s2], cellY(fr)); } });
    var before = W.__uk2().cur.join("");
    e.key("keydown", " "); e.key("keyup", " ");
    hq = { before: before, want: u.target.shape.join(""), correct: W.__uk2().correct, after: W.__uk2().cur.join("") };
  });
  ok(hq && hq.before === hq.want && hq.correct === 1 && hq.after === "0000", "hold mode: mark the chord, strum, and the marks clear after a correct answer", hq);
  // ⬆アップは A→E→C→G の順
  st0 = U.seqLoad(); st0.cur.tracks.rec1.notes = []; U.seqSave(st0);
  env.run("ukulele", { config: { mode: "seq", seq: U.seqClean({ bpm: 60, countIn: false, rows: [{ type: "chord", name: "C", len: "b16" }] }), rec: "rec1" } }, 80, function (f, e) { if (f === 40) { e.key("keydown", "u"); e.key("keyup", "u"); } });
  ok(U.seqLoad().cur.tracks.rec1.notes.map(function (n) { return n[1]; }).join() === "69,64,60,67", "up stroke plays A→E→C→G", U.seqLoad().cur.tracks.rec1.notes.map(function (n) { return n[1]; }));
  // --- §223: フリー演奏のパッド・演奏パターン・コード名の表示 ---
  var uPads = U.padsLoad(false);
  ok(uPads.length === 16 && uPads.map(function (pd) { return pd.name; }).join() === U.PAD_DEFAULT.join() && uPads.every(function (pd) { return pd.shape.length === 4; }), "16 ukulele pads start with common chords in C", uPads.map(function (pd) { return pd.name; }));
  ok(U.padPlays()[0][0] === "once" && U.padPlays().length === 1 + C.SEQ_PATTERNS.length && U.padPlay("nope")[0] === "once", "pad playing styles: one strum + all the stroke / arpeggio patterns");
  var umy = [], ur1 = U.myPatPut(umy, { name: "ぼくの", p: "d-du ー x", meter: 4 }), ur2 = U.myPatPut(umy, { p: "DZ" });
  ok(ur1.ok && !ur2.ok && umy[0].p === "D-DU-x" && U.padPlays().length === 1 + C.SEQ_PATTERNS.length, "my ukulele patterns: letters are tidied (d → D, ー → -), bad ones refused", umy);
  function ukeHooked() {
    return H.load({ patch: function (src, file) {
      src = patch(src, file);
      if (file === "arcade-ukulele.js") { src = src.split("      padRender();\n\n      return {").join("      padRender(); window.__ukePad = { press: padPress, release: padRelease, act: padAction, st: function () { return { play: padPlay, cur: current(), pads: pads, prefs: padP, held: padHeldI }; } };\n\n      return {"); }
      return src;
    } });
  }
  var ue = ukeHooked(), uU = ue.window.UGUkulele, us = {};
  ue.store[uU.PADPREFS_KEY] = JSON.stringify({ pad: true, play: "pat:D-D-D-D-:4", bpm: 120 });
  ue.run("ukulele", { config: { mode: "free" } }, 120, function (f) {
    var h = ue.window.__ukePad; if (!h) { return; }
    if (f === 2) { h.press(0); us.a = h.st().cur.join(); }
    if (f === 40) { us.idx = h.st().play && h.st().play.idx; }
    if (f === 50) { h.release(0); us.b = h.st().play; }
    if (f === 55) { h.press(5); us.c = h.st().cur.join(); h.act("edit"); h.press(15); }
    if (f === 60) { h.act("chord"); }
  });
  var up15 = JSON.parse(ue.store[uU.PADS_KEY] || "[]")[15], upp = JSON.parse(ue.store[uU.PADPREFS_KEY] || "{}");
  ok(us.a === uU.padsLoad(false)[0].shape.join() && us.idx === 3 && us.b === null, "a pad puts its chord on the fretboard and strums the pattern while held (4ths at BPM 120), stopping on release", us);
  ok(up15 && up15.name === "Am" && up15.shape.join() === us.c && upp.chord === false, "registering stores the held fingering on a pad; the chord name can be turned off", [up15, upp]);
};
