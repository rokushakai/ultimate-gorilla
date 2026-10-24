// コードの理論エンジン（arcade-chords.js）とウクレレのコード辞典・カスタム・マイコード（§169）のテスト
"use strict";
var H = require("./harness");
var ok = H.ok;

function patch(src, file) {
  if (file !== "arcade-ukulele.js") { return src; }
  var a = "      var msg = \"\", msgT = 0, msgGood = false, wrong = null, wrongT = 0;";
  if (src.indexOf(a) < 0) { throw new Error("ukulele patch target missing"); }
  return src.split(a).join(a + " window.__uk2 = function () { return { target: target, correct: correct, cur: current(), pos: pos, mode: mode }; };");
}
function pcsOf(C, shape, lowG) {
  var m = C.shapeMidis(shape, lowG), o = {};
  m.forEach(function (x) { if (x !== null) { o[x % 12] = true; } });
  return o;
}

module.exports = function () {
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
};
