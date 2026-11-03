// ゴリラホーン（arcade-horn.js）のテスト（§306〜）
"use strict";
var H = require("./harness");
var ok = H.ok;

module.exports = function () {
  H.suite("horn");
  var env = H.load(), W = env.window, Hn = W.UGHorn, A = W.UGArcade, U = W.UGUkulele;
  ok(!!Hn, "UGHorn API exists");
  var ids = A.list().map(function (g) { return g.id; }), g = A.list().filter(function (x) { return x.id === "horn"; })[0];
  ok(g && g.cat === "music" && g.music && ids.indexOf("horn") === ids.indexOf("strings") + 1 && Hn.INSTS.length === 13, "horn is a music game right after the strings, with 13 instruments", ids.indexOf("horn"));

  // --- キー（3段・下がいちばん低い）・息の強さ ---
  var tp = Hn.INSTS[0], base = Hn.base(tp, 0, 0), r0 = Hn.rowNotes(base, "major", false), rc = Hn.rowNotes(base, "major", true);
  var k1 = Hn.keyRect(2, 0, 8), at1 = Hn.keyAt(k1.x + 3, k1.y + 3, 8), at2 = Hn.keyAt(k1.x + 3, k1.y + k1.h - 3, 8);
  ok(base === 60 && r0.join() === "60,62,64,65,67,69,71,72" && rc.length === 13 && rc[12] === 72 && Hn.base(tp, 0, 1) === 72 && at1.r === 2 && at1.c === 0 &&
    Hn.breath(at1.fy) > 1 && Hn.breath(at2.fy) < 0.45 && Hn.keyAt(10, 20, 8) === null,
    "keys: the key's scale over three rows (bottom row from the instrument's low root), chromatic has 13; pressing near the top of a key blows harder", [base, r0, Hn.breath(at1.fy), Hn.breath(at2.fy)]);

  // --- ゲーム（サンプルは使わず合成音で）---
  function hrun(prefs, frames, fn) {
    var e = H.load(), log = { on: [], bend: [], stop: 0 };
    e.store[Hn.PREFS_KEY] = JSON.stringify(prefs);
    e.run("horn", { config: {} }, frames, function (fr) {
      var M = e.window.UGMelody;
      if (fr === 1) {
        M.samples.enabled = false;
        var s0 = M.synth, b0 = M.voiceBend, v0 = M.voiceStop;
        M.synth = function (m, pg) { if (pg !== M.DRUM) { log.on.push(m + "@" + pg); } return s0.apply(M, arguments); };
        M.voiceBend = function (h, m) { log.bend.push(Math.round(m * 100) / 100); return b0.apply(M, arguments); };
        M.voiceStop = function () { log.stop++; return v0.apply(M, arguments); };
      }
      fn(fr, e, e.window.UGHorn);
    });
    log.gains = e.counters.targets.filter(function (t) { return t.name === "gain"; }).map(function (t) { return t.v; });
    return { log: log, e: e };
  }
  // スラー ON: A（ド）を押したまま S（レ）→ 吹きなおさずに高さだけ。S をはなすとドにもどる・A をはなすと止まる
  var h1 = hrun({ inst: "trumpet" }, 20, function (fr, e) {
    if (fr === 2) { e.key("keydown", "a"); }
    if (fr === 4) { e.key("keydown", "s"); }
    if (fr === 6) { e.key("keyup", "s"); }
    if (fr === 8) { e.key("keyup", "a"); }
  });
  var h2 = hrun({ inst: "tsax", legato: false }, 20, function (fr, e) {
    if (fr === 2) { e.key("keydown", "a"); }
    if (fr === 4) { e.key("keydown", "s"); }
    if (fr === 8) { e.key("keyup", "s"); e.key("keyup", "a"); }
  });
  ok(h1.log.on.join() === "60@56" && h1.log.bend.indexOf(62) >= 0 && h1.log.bend[h1.log.bend.length - 1] === 60 && h1.log.stop >= 1 && h2.log.on.join() === "48@66,50@66,48@66",
    "one note at a time: with slur a second key glides without a new attack and returning goes back; without slur every key re-attacks", [h1.log, h2.log.on]);
  // 指で: キーの上のほうを押すと強い・横にずらすとベンド
  var h3 = hrun({ inst: "trumpet" }, 20, function (fr, e, Hw) {
    var kr = Hw.keyRect(2, 2, 8);
    if (fr === 2) { e.ptr("down", kr.x + kr.w / 2, kr.y + 3, 1); }
    if (fr === 4) { e.ptr("move", kr.x + kr.w / 2 + (240 - 8) / 8 * 0.5, kr.y + 3, 1); }
    if (fr === 8) { e.ptr("up", kr.x + kr.w / 2 + (240 - 8) / 8 * 0.5, kr.y + 3, 1); }
  });
  ok(h3.log.on.join() === "64@56" && h3.log.gains.some(function (v) { return v > 1.8; }) && h3.log.bend.indexOf(64.5) >= 0, "breath from the top of the key is strong; sliding sideways bends the pitch (half a key = a quarter tone)", h3.log);

  // --- §308: ホーンセクション・パターン・バンド ---
  var jz = Hn.sectionNotes(W.UGBass.chord(0, 0, "major"), false, Hn.presetParts("jazz")), sx = Hn.sectionNotes(W.UGBass.chord(0, 4, "major", true), true, Hn.presetParts("sax"));
  var jzOk = jz.every(function (x, k) { var ins = Hn.INSTS.filter(function (q) { return q[0] === x.inst; })[0]; return x.m >= ins[3] && x.m <= ins[4] && (k === 0 || x.m > jz[k - 1].m); });
  ok(jz.map(function (x) { return x.inst; }).join() === "trombone,tsax,asax,trumpet" && jz.map(function (x) { return x.m % 12; }).join() === "0,7,4,0" && jzOk && sx[3].m % 12 === 5 && Hn.SECTIONS.length === 5 && Hn.PATS.length === 10,
    "horn section: low to high root, 5th, 3rd, root inside each instrument's range (7th on top for 7th chords)", jz.map(function (x) { return x.inst + ":" + x.m; }));
  function srun(prefs, frames, fn) {
    var e = H.load({ patch: function (src, file) { return file === "arcade-horn.js" ? src.split("      function render() {\n").join("      window.__hAct = action; window.__hPanel = function () { return panel.innerHTML; };\n      function render() {\n") : src; } });
    var log = { on: [], dr: 0, bs: 0, stop: 0 };
    e.store[Hn.PREFS_KEY] = JSON.stringify(prefs);
    e.run("horn", { config: {} }, frames, function (fr) {
      var M = e.window.UGMelody;
      if (fr === 1) { M.samples.enabled = false; var s0 = M.synth, v0 = M.voiceStop; M.synth = function (m, pg) { if (pg === M.DRUM) { log.dr++; } else if (pg === 33) { log.bs++; } else { log.on.push(Math.round(m) + "@" + pg); } return s0.apply(M, arguments); }; M.voiceStop = function () { log.stop++; return v0.apply(M, arguments); }; }
      if (fn) { fn(fr, e); }
    });
    return { log: log, e: e };
  }
  var s1 = srun({ view: "section", sec: { preset: "brass", parts: Hn.presetParts("brass") } }, 14, function (fr, e) { if (fr === 2) { e.key("keydown", "1"); } if (fr === 8) { e.key("keyup", "1"); } });
  var pg1 = s1.log.on.map(function (x) { return x.split("@")[1]; }).sort().join();
  var s2 = srun({ view: "section", pat: "e8", bpm: 120, drum: "g:8beat", bpat: "root8" }, 62, function (fr, e) { if (fr === 2) { e.key("keydown", "b"); e.key("keyup", "b"); } });
  ok(pg1 === "56,56,57,58,60" && s1.log.stop >= 5 && s2.log.on.length === 16 && s2.log.dr > 4 && s2.log.bs >= 4,
    "section: a held chord plays every part with its players (brass: trumpets x2, horn, trombone, tuba); the eighth-note pattern with drums and bass", [pg1, s2.log.on.length, s2.log.dr, s2.log.bs]);
  var s3 = srun({ view: "section", bpm: 120 }, 260, function (fr, e) {
    if (fr === 2) { e.key("keydown", "z"); e.key("keyup", "z"); }
    if (fr === 130) { e.key("keydown", "1"); }
    if (fr === 190) { e.key("keyup", "1"); }
    if (fr === 200) { e.key("keydown", "z"); e.key("keyup", "z"); }
  });
  var tk3 = JSON.parse(s3.e.store[Hn.TAKES_KEY] || "[]")[0], Hw3 = s3.e.window.UGHorn, U3 = s3.e.window.UGUkulele, rs3 = Hw3.sendToSeq(Hw3.takeById(Hw3.takesLoad(), tk3.id));
  var tr3 = U3.seqLoad().cur.tracks, sent3 = (rs3.ids || []).map(function (id) { return tr3[id].prog; }).join();
  var s4 = srun({ view: "section", tab: "play" }, 6, function (fr, e) { if (fr === 3) { e.window.__hAct("parts:+"); e.window.__hAct("pn:0:+"); e.window.__hAct("pi:4:flute"); e.window.__hAct("tab:band"); e.window.__hAct("hvol:-"); } });
  var p4 = JSON.parse(s4.e.store[Hn.PREFS_KEY]);
  ok(tk3 && tk3.parts && tk3.parts.length === 4 && sent3 === "57,66,65,56" && p4.sec.parts.length === 5 && p4.sec.parts[0].n === 2 && p4.sec.parts[4].inst === "flute" && p4.sec.preset === "" && p4.hvol === 90 && s4.e.window.__hPanel().indexOf('data-hdrum="1"') > 0,
    "section recordings keep one part per instrument and send one track each; the section editor and band tab save their settings", [tk3 && tk3.parts.map(function (p) { return p.inst; }), sent3, p4.sec]);

  // --- §309: よこ向き・リズムゲーム（メロディの長い音符）---
  var el = H.load(), Hl = el.window.UGHorn;
  Hl.layout(true, 130);
  var lg = Hl.geom(), lk = Hl.keyRect(2, 0, 8), lc = Hl.chordRect(6);
  Hl.layout(false);
  var pg = Hl.geom();
  var chartsOk = Hn.SONGS.every(function (sg) { var c = Hn.chart(sg), tot = 0; c.notes.forEach(function (n) { tot += n.len; }); return Math.abs(tot - c.bars * 4) < 1e-6 && c.bars === sg[3].length && c.notes.every(function (n) { return n.deg >= 0 && n.deg <= 7; }); });
  ok(lg.LAND && lg.H === 130 && lk.y + lk.h <= 130 && lc.y === 12 && lc.x + lc.w <= 240 && !pg.LAND && pg.H === 320 && chartsOk && Hn.SONGS.length === 6,
    "horn landscape: keys and section buttons fit the short canvas; every melody fills whole bars that match its chord list", [lg, lk]);
  function rrun(song, holdAll, land) {
    var e = H.load(), sg = Hn.SONGS.filter(function (x) { return x[0] === song; })[0], c = Hn.chart(sg), spb = 60 / sg[2], t0 = 0.5 + 4 * spb, dn = {}, up = {}, H0 = 0;
    var keys = "asdfghjk";
    e.run("horn", { config: { mode: "rhythm", song: song, speed: 100, land: land } }, 3600, function (f) {
      if (f === 1) { H0 = e.window.UGHorn.geom().H; }
      c.notes.forEach(function (n, k) {
        var key = keys.charAt(n.deg), endB = holdAll ? n.beat + n.len - 0.05 : n.beat + n.len * 0.3;
        if (!dn[k] && f / 60 >= t0 + n.beat * spb - 0.005) { dn[k] = 1; e.key("keydown", key); }
        if (dn[k] && !up[k] && f / 60 >= t0 + endB * spb) { up[k] = 1; e.key("keyup", key); }
      });
    });
    return { best: JSON.parse(e.store[Hn.BEST_KEY] || "{}")[song + "@100"], n: c.notes.length, H: H0 };
  }
  var hr1 = rrun("ode", true, false), hr2 = rrun("ode", false, false), hr3 = rrun("kira", true, true);
  ok(hr1.best && hr1.best.r === "S" && hr2.best && hr1.best.s - hr2.best.s >= hr1.n * 50 - 1 && hr1.H === 320 && hr3.best && hr3.best.r === "S" && hr3.H < 200,
    "horn rhythm game: press each melody note at its head and keep blowing to the end (keep bonus); landscape works too", [hr1.best, hr2.best, hr3.H]);

  // --- 録音・シーケンサーへ送る ---
  var h4 = hrun({ inst: "flute", bpm: 120 }, 260, function (fr, e) {
    if (fr === 2) { e.key("keydown", "z"); e.key("keyup", "z"); }
    if (fr === 130) { e.key("keydown", "a"); }
    if (fr === 160) { e.key("keydown", "s"); }
    if (fr === 190) { e.key("keyup", "a"); e.key("keyup", "s"); }
    if (fr === 200) { e.key("keydown", "z"); e.key("keyup", "z"); }
  });
  var tk = JSON.parse(h4.e.store[Hn.TAKES_KEY] || "[]")[0];
  ok(tk && tk.inst === "flute" && tk.notes.length === 2 && tk.notes[0][2] === 72 && tk.notes[1][2] === 74 && tk.name === "ホーン 1", "recording: slurred notes are saved as separate notes with the instrument", tk);
  var rs = Hn.sendToSeq({ name: "ぼくのラッパ", inst: "tsax", notes: [[0, 1, 60]] }), xt = U.seqLoad().cur.tracks[rs.id];
  ok(rs.ok && xt && xt.preset === "hnotes" && xt.prog === 66 && U.X_PRESETS.some(function (p) { return p[0] === "hnotes"; }) && !Hn.sendToSeq({ name: "x", notes: [] }).ok,
    "send to the sequencer: a wind-notes track with the instrument's GM number", rs.msg);
};
